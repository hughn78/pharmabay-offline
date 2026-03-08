import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function getConnection(supabase: any) {
  const { data } = await supabase.from("ebay_connections").select("*").limit(1).maybeSingle();
  if (!data) throw new Error("No eBay connection configured");
  return data;
}

async function getValidToken(supabase: any, conn: any): Promise<string> {
  const now = new Date();
  const expiresAt = conn.access_token_expires_at ? new Date(conn.access_token_expires_at) : null;

  if (conn.access_token_encrypted && expiresAt && expiresAt > new Date(now.getTime() + 60000)) {
    return conn.access_token_encrypted;
  }

  // Refresh
  const clientId = Deno.env.get("EBAY_CLIENT_ID");
  const clientSecret = Deno.env.get("EBAY_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("eBay API credentials not configured");
  if (!conn.refresh_token_encrypted) throw new Error("No refresh token - reconnect eBay account");

  const isProd = conn.environment === "production";
  const apiBase = isProd ? "https://api.ebay.com" : "https://api.sandbox.ebay.com";

  const res = await fetch(`${apiBase}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: conn.refresh_token_encrypted,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);

  const newExpiry = new Date(Date.now() + data.expires_in * 1000).toISOString();
  await supabase.from("ebay_connections").update({
    access_token_encrypted: data.access_token,
    access_token_expires_at: newExpiry,
    connection_status: "connected",
  }).eq("id", conn.id);

  return data.access_token;
}

function getApiBase(env: string) {
  return env === "production" ? "https://api.ebay.com" : "https://api.sandbox.ebay.com";
}

async function logJob(supabase: any, params: any) {
  await supabase.from("ebay_publish_jobs").insert({
    product_id: params.product_id || null,
    ebay_draft_id: params.ebay_draft_id || null,
    operation_type: params.operation_type,
    publish_mode: params.operation_type,
    request_payload: params.request_payload || null,
    response_payload: params.response_payload || null,
    publish_status: params.status,
    error_message: params.error_message || null,
    ebay_inventory_sku: params.sku || null,
    ebay_offer_id: params.offer_id || null,
    ebay_listing_id: params.listing_id || null,
    submitted_at: new Date().toISOString(),
    completed_at: params.status !== "processing" ? new Date().toISOString() : null,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // JWT authentication check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = getSupabaseAdmin();

  try {
    const { action, ...params } = await req.json();
    const conn = await getConnection(supabase);
    const ebayToken = await getValidToken(supabase, conn);
    const apiBase = getApiBase(conn.environment);
    const marketplaceId = conn.marketplace_id || "EBAY_AU";

    if (action === "create_inventory_item") {
      const { sku, product_id, draft_id, title, description, condition_id, brand, mpn, upc, ean, image_urls, aspects, quantity } = params;
      if (!sku) throw new Error("SKU is required");

      const inventoryItem: any = {
        product: {
          title: title || "Untitled",
          description: description || "",
          imageUrls: image_urls || [],
        },
        condition: condition_id || "NEW",
        availability: {
          shipToLocationAvailability: {
            quantity: quantity ?? 1,
          },
        },
      };

      // Add aspects
      if (aspects && Object.keys(aspects).length > 0) {
        inventoryItem.product.aspects = aspects;
      } else {
        const autoAspects: any = {};
        if (brand) autoAspects["Brand"] = [brand];
        if (mpn) autoAspects["MPN"] = [mpn];
        if (Object.keys(autoAspects).length > 0) {
          inventoryItem.product.aspects = autoAspects;
        }
      }

      // Add product identifiers
      if (upc || ean) {
        inventoryItem.product.upc = upc ? [upc] : undefined;
        inventoryItem.product.ean = ean ? [ean] : undefined;
      }

      const res = await fetch(
        `${apiBase}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${ebayToken}`,
            "Content-Type": "application/json",
            "Content-Language": "en-AU",
          },
          body: JSON.stringify(inventoryItem),
        }
      );

      const responseText = await res.text();
      const responseData = responseText ? JSON.parse(responseText) : {};

      await logJob(supabase, {
        product_id, ebay_draft_id: draft_id, operation_type: "create_inventory_item",
        sku, request_payload: inventoryItem, response_payload: responseData,
        status: res.ok ? "success" : "failed",
        error_message: res.ok ? null : JSON.stringify(responseData),
      });

      if (!res.ok && res.status !== 204) {
        throw new Error(`Create inventory item failed [${res.status}]: ${JSON.stringify(responseData)}`);
      }

      // Update draft
      if (draft_id) {
        await supabase.from("ebay_drafts").update({
          ebay_inventory_sku: sku,
          ebay_last_synced_at: new Date().toISOString(),
          ebay_last_error: null,
        }).eq("id", draft_id);
      }

      return new Response(JSON.stringify({ success: true, sku }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create_offer") {
      const {
        sku, product_id, draft_id, category_id, price, currency, quantity,
        description, listing_description, condition_id,
      } = params;

      if (!sku) throw new Error("SKU required");
      if (!category_id) throw new Error("Category ID required");
      if (!price || price <= 0) throw new Error("Price must be > 0");
      if (!conn.merchant_location_key) throw new Error("Merchant location key not configured");
      if (!conn.fulfillment_policy_id) throw new Error("Fulfillment policy ID not configured");
      if (!conn.payment_policy_id) throw new Error("Payment policy ID not configured");
      if (!conn.return_policy_id) throw new Error("Return policy ID not configured");

      const offer: any = {
        sku,
        marketplaceId: marketplaceId,
        format: "FIXED_PRICE",
        categoryId: category_id,
        merchantLocationKey: conn.merchant_location_key,
        pricingSummary: {
          price: { value: String(price), currency: currency || "AUD" },
        },
        listingPolicies: {
          fulfillmentPolicyId: conn.fulfillment_policy_id,
          paymentPolicyId: conn.payment_policy_id,
          returnPolicyId: conn.return_policy_id,
        },
        availableQuantity: quantity ?? 1,
      };

      if (listing_description || description) {
        offer.listingDescription = listing_description || description;
      }

      const res = await fetch(`${apiBase}/sell/inventory/v1/offer`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Language": "en-AU",
        },
        body: JSON.stringify(offer),
      });

      const responseData = await res.json();

      await logJob(supabase, {
        product_id, ebay_draft_id: draft_id, operation_type: "create_offer",
        sku, request_payload: offer, response_payload: responseData,
        status: res.ok ? "success" : "failed",
        offer_id: responseData.offerId || null,
        error_message: res.ok ? null : JSON.stringify(responseData),
      });

      if (!res.ok) {
        throw new Error(`Create offer failed [${res.status}]: ${JSON.stringify(responseData)}`);
      }

      if (draft_id && responseData.offerId) {
        await supabase.from("ebay_drafts").update({
          ebay_offer_id: responseData.offerId,
          ebay_marketplace_id: marketplaceId,
          ebay_last_synced_at: new Date().toISOString(),
          ebay_last_error: null,
        }).eq("id", draft_id);
      }

      return new Response(JSON.stringify({ success: true, offerId: responseData.offerId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_offer") {
      const {
        offer_id, sku, product_id, draft_id, category_id, price, currency,
        quantity, listing_description, condition_id,
      } = params;

      if (!offer_id) throw new Error("Offer ID required");

      const offer: any = {
        sku,
        marketplaceId: marketplaceId,
        format: "FIXED_PRICE",
        categoryId: category_id,
        merchantLocationKey: conn.merchant_location_key,
        pricingSummary: {
          price: { value: String(price), currency: currency || "AUD" },
        },
        listingPolicies: {
          fulfillmentPolicyId: conn.fulfillment_policy_id,
          paymentPolicyId: conn.payment_policy_id,
          returnPolicyId: conn.return_policy_id,
        },
        availableQuantity: quantity ?? 1,
      };

      if (listing_description) offer.listingDescription = listing_description;

      const res = await fetch(
        `${apiBase}/sell/inventory/v1/offer/${encodeURIComponent(offer_id)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "Content-Language": "en-AU",
          },
          body: JSON.stringify(offer),
        }
      );

      const responseText = await res.text();
      const responseData = responseText ? JSON.parse(responseText) : {};

      await logJob(supabase, {
        product_id, ebay_draft_id: draft_id, operation_type: "update_offer",
        sku, offer_id, request_payload: offer, response_payload: responseData,
        status: res.ok ? "success" : "failed",
        error_message: res.ok ? null : JSON.stringify(responseData),
      });

      if (!res.ok && res.status !== 204) {
        throw new Error(`Update offer failed [${res.status}]: ${JSON.stringify(responseData)}`);
      }

      if (draft_id) {
        await supabase.from("ebay_drafts").update({
          ebay_last_synced_at: new Date().toISOString(),
          ebay_last_error: null,
        }).eq("id", draft_id);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "publish_offer") {
      const { offer_id, product_id, draft_id, sku } = params;
      if (!offer_id) throw new Error("Offer ID required");

      const res = await fetch(
        `${apiBase}/sell/inventory/v1/offer/${encodeURIComponent(offer_id)}/publish`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const responseData = await res.json();

      await logJob(supabase, {
        product_id, ebay_draft_id: draft_id, operation_type: "publish_offer",
        sku, offer_id, listing_id: responseData.listingId || null,
        request_payload: { offer_id }, response_payload: responseData,
        status: res.ok ? "success" : "failed",
        error_message: res.ok ? null : JSON.stringify(responseData),
      });

      if (!res.ok) {
        if (draft_id) {
          await supabase.from("ebay_drafts").update({
            channel_status: "failed",
            ebay_last_error: JSON.stringify(responseData),
            ebay_last_synced_at: new Date().toISOString(),
          }).eq("id", draft_id);
        }
        throw new Error(`Publish failed [${res.status}]: ${JSON.stringify(responseData)}`);
      }

      // Update draft with listing info
      if (draft_id) {
        const listingId = responseData.listingId;
        await supabase.from("ebay_drafts").update({
          channel_status: "published",
          published_listing_id: listingId || null,
          ebay_listing_url: listingId ? `https://www.ebay.com.au/itm/${listingId}` : null,
          ebay_last_synced_at: new Date().toISOString(),
          ebay_last_error: null,
        }).eq("id", draft_id);
      }

      return new Response(JSON.stringify({ success: true, listingId: responseData.listingId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "publish_product") {
      // Full flow: inventory item → offer → publish
      const { product_id, draft_id } = params;
      if (!product_id) throw new Error("Product ID required");

      // Load product + draft + images
      const { data: product } = await supabase.from("products").select("*").eq("id", product_id).single();
      if (!product) throw new Error("Product not found");

      let draft: any;
      if (draft_id) {
        const { data } = await supabase.from("ebay_drafts").select("*").eq("id", draft_id).single();
        draft = data;
      } else {
        const { data } = await supabase.from("ebay_drafts").select("*").eq("product_id", product_id).maybeSingle();
        draft = data;
      }
      if (!draft) throw new Error("No eBay draft found for this product");

      const sku = draft.ebay_inventory_sku || product.sku || product.barcode;
      if (!sku) throw new Error("SKU is required (product SKU or barcode)");

      const title = draft.title || product.source_product_name;
      if (!title) throw new Error("Title is required");
      if (title.length > 80) throw new Error("Title must be ≤ 80 characters");

      const price = draft.buy_it_now_price || draft.start_price;
      if (!price || price <= 0) throw new Error("Price must be > 0");

      const categoryId = draft.category_id;
      if (!categoryId) throw new Error("eBay category ID required");

      if (!conn.merchant_location_key) throw new Error("Merchant location key not configured in Settings");
      if (!conn.fulfillment_policy_id) throw new Error("Fulfillment policy not configured in Settings");
      if (!conn.payment_policy_id) throw new Error("Payment policy not configured in Settings");
      if (!conn.return_policy_id) throw new Error("Return policy not configured in Settings");

      if (product.compliance_status === "blocked") throw new Error("Product compliance is blocked");

      // Get approved images
      const { data: images } = await supabase
        .from("product_images")
        .select("*")
        .eq("product_id", product_id)
        .eq("ebay_approved", true)
        .order("sort_order");
      
      const imageUrls = (images || [])
        .map((img: any) => img.local_storage_url || img.original_url)
        .filter(Boolean);

      const quantity = product.quantity_available_for_ebay ?? 
        Math.max(0, (product.stock_on_hand || 0) - (product.quantity_reserved_for_store || 0));

      if (quantity <= 0) throw new Error("Available quantity must be > 0");

      const conditionId = draft.condition_id || "1000";
      const description = draft.description_html || draft.description_plain || "";

      // Build aspects
      const aspects: any = {};
      if (draft.brand || product.brand) aspects["Brand"] = [draft.brand || product.brand];
      if (draft.mpn) aspects["MPN"] = [draft.mpn];
      if (draft.upc || product.barcode) aspects["UPC"] = [draft.upc || product.barcode];

      // Step 1: Create/update inventory item
      const inventoryItem: any = {
        product: {
          title,
          description,
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
          aspects: Object.keys(aspects).length > 0 ? aspects : undefined,
        },
        condition: conditionId,
        availability: {
          shipToLocationAvailability: { quantity },
        },
      };

      if (draft.ean || product.barcode) {
        inventoryItem.product.ean = [draft.ean || product.barcode];
      }

      const invRes = await fetch(
        `${apiBase}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "Content-Language": "en-AU",
          },
          body: JSON.stringify(inventoryItem),
        }
      );

      if (!invRes.ok && invRes.status !== 204) {
        const errData = await invRes.text();
        await supabase.from("ebay_drafts").update({
          ebay_last_error: `Inventory item failed: ${errData}`,
          ebay_last_synced_at: new Date().toISOString(),
        }).eq("id", draft.id);
        await logJob(supabase, {
          product_id, ebay_draft_id: draft.id, operation_type: "create_inventory_item",
          sku, request_payload: inventoryItem, response_payload: errData,
          status: "failed", error_message: errData,
        });
        throw new Error(`Inventory item creation failed: ${errData}`);
      }

      await logJob(supabase, {
        product_id, ebay_draft_id: draft.id, operation_type: "create_inventory_item",
        sku, request_payload: inventoryItem, status: "success",
      });

      await supabase.from("ebay_drafts").update({
        ebay_inventory_sku: sku,
      }).eq("id", draft.id);

      // Step 2: Create or update offer
      const existingOfferId = draft.ebay_offer_id;

      const offerPayload: any = {
        sku,
        marketplaceId: marketplaceId,
        format: "FIXED_PRICE",
        categoryId,
        merchantLocationKey: conn.merchant_location_key,
        pricingSummary: {
          price: { value: String(price), currency: "AUD" },
        },
        listingPolicies: {
          fulfillmentPolicyId: conn.fulfillment_policy_id,
          paymentPolicyId: conn.payment_policy_id,
          returnPolicyId: conn.return_policy_id,
        },
        availableQuantity: quantity,
        listingDescription: description || undefined,
      };

      let offerId = existingOfferId;

      if (existingOfferId) {
        // Update existing offer
        const offerRes = await fetch(
          `${apiBase}/sell/inventory/v1/offer/${encodeURIComponent(existingOfferId)}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              "Content-Language": "en-AU",
            },
            body: JSON.stringify(offerPayload),
          }
        );

        if (!offerRes.ok && offerRes.status !== 204) {
          const errData = await offerRes.text();
          await logJob(supabase, {
            product_id, ebay_draft_id: draft.id, operation_type: "update_offer",
            sku, offer_id: existingOfferId, request_payload: offerPayload,
            response_payload: errData, status: "failed", error_message: errData,
          });
          throw new Error(`Offer update failed: ${errData}`);
        }

        await logJob(supabase, {
          product_id, ebay_draft_id: draft.id, operation_type: "update_offer",
          sku, offer_id: existingOfferId, request_payload: offerPayload, status: "success",
        });
      } else {
        // Create new offer
        const offerRes = await fetch(`${apiBase}/sell/inventory/v1/offer`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "Content-Language": "en-AU",
          },
          body: JSON.stringify(offerPayload),
        });

        const offerData = await offerRes.json();

        if (!offerRes.ok) {
          await logJob(supabase, {
            product_id, ebay_draft_id: draft.id, operation_type: "create_offer",
            sku, request_payload: offerPayload, response_payload: offerData,
            status: "failed", error_message: JSON.stringify(offerData),
          });
          throw new Error(`Offer creation failed: ${JSON.stringify(offerData)}`);
        }

        offerId = offerData.offerId;
        await logJob(supabase, {
          product_id, ebay_draft_id: draft.id, operation_type: "create_offer",
          sku, offer_id: offerId, request_payload: offerPayload,
          response_payload: offerData, status: "success",
        });

        await supabase.from("ebay_drafts").update({
          ebay_offer_id: offerId,
          ebay_marketplace_id: marketplaceId,
        }).eq("id", draft.id);
      }

      // Step 3: Publish offer
      const pubRes = await fetch(
        `${apiBase}/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const pubData = await pubRes.json();

      if (!pubRes.ok) {
        await supabase.from("ebay_drafts").update({
          channel_status: "failed",
          ebay_last_error: JSON.stringify(pubData),
          ebay_last_synced_at: new Date().toISOString(),
        }).eq("id", draft.id);
        await logJob(supabase, {
          product_id, ebay_draft_id: draft.id, operation_type: "publish_offer",
          sku, offer_id: offerId, request_payload: { offerId },
          response_payload: pubData, status: "failed",
          error_message: JSON.stringify(pubData),
        });
        throw new Error(`Publish failed: ${JSON.stringify(pubData)}`);
      }

      const listingId = pubData.listingId;

      await supabase.from("ebay_drafts").update({
        channel_status: "published",
        published_listing_id: listingId || null,
        ebay_listing_url: listingId ? `https://www.ebay.com.au/itm/${listingId}` : null,
        ebay_last_synced_at: new Date().toISOString(),
        ebay_last_error: null,
      }).eq("id", draft.id);

      await logJob(supabase, {
        product_id, ebay_draft_id: draft.id, operation_type: "publish_offer",
        sku, offer_id: offerId, listing_id: listingId,
        request_payload: { offerId }, response_payload: pubData, status: "success",
      });

      return new Response(
        JSON.stringify({
          success: true,
          listingId,
          offerId,
          sku,
          listing_url: listingId ? `https://www.ebay.com.au/itm/${listingId}` : null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "get_offer") {
      const { offer_id } = params;
      if (!offer_id) throw new Error("Offer ID required");

      const res = await fetch(
        `${apiBase}/sell/inventory/v1/offer/${encodeURIComponent(offer_id)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(`Get offer failed [${res.status}]: ${JSON.stringify(data)}`);

      return new Response(JSON.stringify({ success: true, offer: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err: any) {
    console.error("ebay-inventory error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
