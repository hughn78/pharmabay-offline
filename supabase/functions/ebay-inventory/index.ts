import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getEbayBaseUrls,
  getSupabaseAdmin,
  getValidToken,
} from "../_shared/ebay-token.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type SupabaseClient = ReturnType<typeof createClient>;

async function logJob(supabase: SupabaseClient, params: Record<string, unknown>) {
  await supabase.from("ebay_publish_jobs").insert({
    product_id: (params.product_id as string) || null,
    ebay_draft_id: (params.ebay_draft_id as string) || null,
    operation_type: params.operation_type,
    publish_mode: params.operation_type,
    request_payload: params.request_payload || null,
    response_payload: params.response_payload || null,
    publish_status: params.status,
    error_message: (params.error_message as string) || null,
    ebay_inventory_sku: (params.sku as string) || null,
    ebay_offer_id: (params.offer_id as string) || null,
    ebay_listing_id: (params.listing_id as string) || null,
    submitted_at: new Date().toISOString(),
    completed_at: params.status !== "processing" ? new Date().toISOString() : null,
  });
}

// ─── Handler: create_inventory_item ─────────────────────────────────────
async function handleCreateInventoryItem(
  supabase: SupabaseClient, ebayToken: string, apiBase: string,
  params: Record<string, unknown>
) {
  const { sku, product_id, draft_id, title, description, condition_id, brand, mpn, upc, ean, image_urls, aspects, quantity } = params;
  if (!sku) throw new Error("SKU is required");

  const inventoryItem: Record<string, unknown> = {
    product: {
      title: title || "Untitled",
      description: description || "",
      imageUrls: image_urls || [],
      ...(aspects && Object.keys(aspects as Record<string, unknown>).length > 0
        ? { aspects }
        : (brand || mpn)
          ? { aspects: { ...(brand ? { Brand: [brand] } : {}), ...(mpn ? { MPN: [mpn] } : {}) } }
          : {}),
      ...(upc ? { upc: [upc] } : {}),
      ...(ean ? { ean: [ean] } : {}),
    },
    condition: condition_id || "NEW",
    availability: { shipToLocationAvailability: { quantity: quantity ?? 1 } },
  };

  const res = await fetch(
    `${apiBase}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku as string)}`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${ebayToken}`, "Content-Type": "application/json", "Content-Language": "en-AU" },
      body: JSON.stringify(inventoryItem),
    }
  );

  const responseText = await res.text();
  const responseData = responseText ? JSON.parse(responseText) : {};

  await logJob(supabase, {
    product_id, ebay_draft_id: draft_id, operation_type: "create_inventory_item",
    sku, request_payload: inventoryItem, response_payload: responseData,
    status: res.ok || res.status === 204 ? "success" : "failed",
    error_message: res.ok || res.status === 204 ? null : JSON.stringify(responseData),
  });

  if (!res.ok && res.status !== 204) {
    throw new Error(`Create inventory item failed [${res.status}]: ${JSON.stringify(responseData)}`);
  }

  if (draft_id) {
    await supabase.from("ebay_drafts").update({
      ebay_inventory_sku: sku as string,
      ebay_last_synced_at: new Date().toISOString(),
      ebay_last_error: null,
    }).eq("id", draft_id as string);
  }

  return { success: true, sku };
}

// ─── Handler: create_offer ──────────────────────────────────────────────
async function handleCreateOffer(
  supabase: SupabaseClient, ebayToken: string, apiBase: string,
  conn: Record<string, unknown>, marketplaceId: string,
  params: Record<string, unknown>
) {
  const { sku, product_id, draft_id, category_id, price, currency, quantity, listing_description, description } = params;
  if (!sku) throw new Error("SKU required");
  if (!category_id) throw new Error("Category ID required");
  if (!price || (price as number) <= 0) throw new Error("Price must be > 0");
  if (!conn.merchant_location_key) throw new Error("Merchant location key not configured");
  if (!conn.fulfillment_policy_id) throw new Error("Fulfillment policy ID not configured");
  if (!conn.payment_policy_id) throw new Error("Payment policy ID not configured");
  if (!conn.return_policy_id) throw new Error("Return policy ID not configured");

  const offer: Record<string, unknown> = {
    sku, marketplaceId, format: "FIXED_PRICE", categoryId: category_id,
    merchantLocationKey: conn.merchant_location_key,
    pricingSummary: { price: { value: String(price), currency: currency || "AUD" } },
    listingPolicies: {
      fulfillmentPolicyId: conn.fulfillment_policy_id,
      paymentPolicyId: conn.payment_policy_id,
      returnPolicyId: conn.return_policy_id,
    },
    availableQuantity: quantity ?? 1,
    ...(listing_description || description ? { listingDescription: listing_description || description } : {}),
  };

  const res = await fetch(`${apiBase}/sell/inventory/v1/offer`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ebayToken}`, "Content-Type": "application/json", "Content-Language": "en-AU" },
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

  if (!res.ok) throw new Error(`Create offer failed [${res.status}]: ${JSON.stringify(responseData)}`);

  if (draft_id && responseData.offerId) {
    await supabase.from("ebay_drafts").update({
      ebay_offer_id: responseData.offerId,
      ebay_marketplace_id: marketplaceId,
      ebay_last_synced_at: new Date().toISOString(),
      ebay_last_error: null,
    }).eq("id", draft_id as string);
  }

  return { success: true, offerId: responseData.offerId };
}

// ─── Handler: update_offer ──────────────────────────────────────────────
async function handleUpdateOffer(
  supabase: SupabaseClient, ebayToken: string, apiBase: string,
  conn: Record<string, unknown>, marketplaceId: string,
  params: Record<string, unknown>
) {
  const { offer_id, sku, product_id, draft_id, category_id, price, currency, quantity, listing_description } = params;
  if (!offer_id) throw new Error("Offer ID required");

  const offer: Record<string, unknown> = {
    sku, marketplaceId, format: "FIXED_PRICE", categoryId: category_id,
    merchantLocationKey: conn.merchant_location_key,
    pricingSummary: { price: { value: String(price), currency: currency || "AUD" } },
    listingPolicies: {
      fulfillmentPolicyId: conn.fulfillment_policy_id,
      paymentPolicyId: conn.payment_policy_id,
      returnPolicyId: conn.return_policy_id,
    },
    availableQuantity: quantity ?? 1,
    ...(listing_description ? { listingDescription: listing_description } : {}),
  };

  const res = await fetch(
    `${apiBase}/sell/inventory/v1/offer/${encodeURIComponent(offer_id as string)}`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${ebayToken}`, "Content-Type": "application/json", "Content-Language": "en-AU" },
      body: JSON.stringify(offer),
    }
  );

  const responseText = await res.text();
  const responseData = responseText ? JSON.parse(responseText) : {};

  await logJob(supabase, {
    product_id, ebay_draft_id: draft_id, operation_type: "update_offer",
    sku, offer_id, request_payload: offer, response_payload: responseData,
    status: res.ok || res.status === 204 ? "success" : "failed",
    error_message: res.ok || res.status === 204 ? null : JSON.stringify(responseData),
  });

  if (!res.ok && res.status !== 204) {
    throw new Error(`Update offer failed [${res.status}]: ${JSON.stringify(responseData)}`);
  }

  if (draft_id) {
    await supabase.from("ebay_drafts").update({
      ebay_last_synced_at: new Date().toISOString(),
      ebay_last_error: null,
    }).eq("id", draft_id as string);
  }

  return { success: true };
}

// ─── Handler: publish_offer ─────────────────────────────────────────────
async function handlePublishOffer(
  supabase: SupabaseClient, ebayToken: string, apiBase: string,
  params: Record<string, unknown>
) {
  const { offer_id, product_id, draft_id, sku } = params;
  if (!offer_id) throw new Error("Offer ID required");

  const res = await fetch(
    `${apiBase}/sell/inventory/v1/offer/${encodeURIComponent(offer_id as string)}/publish`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${ebayToken}`, "Content-Type": "application/json" },
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
      }).eq("id", draft_id as string);
    }
    throw new Error(`Publish failed [${res.status}]: ${JSON.stringify(responseData)}`);
  }

  if (draft_id) {
    const listingId = responseData.listingId;
    await supabase.from("ebay_drafts").update({
      channel_status: "published",
      published_listing_id: listingId || null,
      ebay_listing_url: listingId ? `https://www.ebay.com.au/itm/${listingId}` : null,
      ebay_last_synced_at: new Date().toISOString(),
      ebay_last_error: null,
    }).eq("id", draft_id as string);
  }

  return { success: true, listingId: responseData.listingId };
}

// ─── Handler: publish_product (full flow) ───────────────────────────────
async function handlePublishProduct(
  supabase: SupabaseClient, ebayToken: string, apiBase: string,
  conn: Record<string, unknown>, marketplaceId: string,
  params: Record<string, unknown>
) {
  const { product_id, draft_id } = params;
  if (!product_id) throw new Error("Product ID required");

  const { data: product } = await supabase.from("products").select("*").eq("id", product_id as string).single();
  if (!product) throw new Error("Product not found");

  let draft: Record<string, unknown> | null = null;
  if (draft_id) {
    const { data } = await supabase.from("ebay_drafts").select("*").eq("id", draft_id as string).single();
    draft = data;
  } else {
    const { data } = await supabase.from("ebay_drafts").select("*").eq("product_id", product_id as string).maybeSingle();
    draft = data;
  }
  if (!draft) throw new Error("No eBay draft found for this product");

  const sku = (draft.ebay_inventory_sku || product.sku || product.barcode) as string;
  if (!sku) throw new Error("SKU is required (product SKU or barcode)");

  const title = (draft.title || product.source_product_name) as string;
  if (!title) throw new Error("Title is required");
  if (title.length > 80) throw new Error("Title must be ≤ 80 characters");

  const price = (draft.buy_it_now_price || draft.start_price) as number;
  if (!price || price <= 0) throw new Error("Price must be > 0");

  const categoryId = draft.category_id as string;
  if (!categoryId) throw new Error("eBay category ID required");

  if (!conn.merchant_location_key) throw new Error("Merchant location key not configured in Settings");
  if (!conn.fulfillment_policy_id) throw new Error("Fulfillment policy not configured in Settings");
  if (!conn.payment_policy_id) throw new Error("Payment policy not configured in Settings");
  if (!conn.return_policy_id) throw new Error("Return policy not configured in Settings");

  if (product.compliance_status === "blocked") throw new Error("Product compliance is blocked");

  const { data: images } = await supabase
    .from("product_images")
    .select("*")
    .eq("product_id", product_id as string)
    .eq("ebay_approved", true)
    .order("sort_order");

  const imageUrls = (images || [])
    .map((img: Record<string, unknown>) => (img.local_storage_url || img.original_url) as string)
    .filter(Boolean);

  const quantity = (product.quantity_available_for_ebay as number) ??
    Math.max(0, ((product.stock_on_hand as number) || 0) - ((product.quantity_reserved_for_store as number) || 0));
  if (quantity <= 0) throw new Error("Available quantity must be > 0");

  const conditionId = (draft.condition_id || "1000") as string;
  const description = (draft.description_html || draft.description_plain || "") as string;

  const aspects: Record<string, string[]> = {};
  if (draft.brand || product.brand) aspects["Brand"] = [(draft.brand || product.brand) as string];
  if (draft.mpn) aspects["MPN"] = [draft.mpn as string];
  if (draft.upc || product.barcode) aspects["UPC"] = [(draft.upc || product.barcode) as string];

  // Step 1: Create/update inventory item
  const inventoryItem: Record<string, unknown> = {
    product: {
      title, description,
      ...(imageUrls.length > 0 ? { imageUrls } : {}),
      ...(Object.keys(aspects).length > 0 ? { aspects } : {}),
      ...(draft.ean || product.barcode ? { ean: [(draft.ean || product.barcode) as string] } : {}),
    },
    condition: conditionId,
    availability: { shipToLocationAvailability: { quantity } },
  };

  const invRes = await fetch(
    `${apiBase}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${ebayToken}`, "Content-Type": "application/json", "Content-Language": "en-AU" },
      body: JSON.stringify(inventoryItem),
    }
  );

  if (!invRes.ok && invRes.status !== 204) {
    const errData = await invRes.text();
    await supabase.from("ebay_drafts").update({
      ebay_last_error: `Inventory item failed: ${errData}`,
      ebay_last_synced_at: new Date().toISOString(),
    }).eq("id", draft.id as string);
    await logJob(supabase, {
      product_id, ebay_draft_id: draft.id, operation_type: "create_inventory_item",
      sku, request_payload: inventoryItem, response_payload: errData, status: "failed", error_message: errData,
    });
    throw new Error(`Inventory item creation failed: ${errData}`);
  }

  await logJob(supabase, {
    product_id, ebay_draft_id: draft.id, operation_type: "create_inventory_item",
    sku, request_payload: inventoryItem, status: "success",
  });
  await supabase.from("ebay_drafts").update({ ebay_inventory_sku: sku }).eq("id", draft.id as string);

  // Step 2: Create or update offer
  const existingOfferId = draft.ebay_offer_id as string | null;
  const offerPayload: Record<string, unknown> = {
    sku, marketplaceId, format: "FIXED_PRICE", categoryId,
    merchantLocationKey: conn.merchant_location_key,
    pricingSummary: { price: { value: String(price), currency: "AUD" } },
    listingPolicies: {
      fulfillmentPolicyId: conn.fulfillment_policy_id,
      paymentPolicyId: conn.payment_policy_id,
      returnPolicyId: conn.return_policy_id,
    },
    availableQuantity: quantity,
    ...(description ? { listingDescription: description } : {}),
  };

  let offerId = existingOfferId;

  if (existingOfferId) {
    const offerRes = await fetch(
      `${apiBase}/sell/inventory/v1/offer/${encodeURIComponent(existingOfferId)}`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${ebayToken}`, "Content-Type": "application/json", "Content-Language": "en-AU" },
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
    const offerRes = await fetch(`${apiBase}/sell/inventory/v1/offer`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ebayToken}`, "Content-Type": "application/json", "Content-Language": "en-AU" },
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
      sku, offer_id: offerId, request_payload: offerPayload, response_payload: offerData, status: "success",
    });
    await supabase.from("ebay_drafts").update({
      ebay_offer_id: offerId, ebay_marketplace_id: marketplaceId,
    }).eq("id", draft.id as string);
  }

  // Step 3: Publish
  const pubRes = await fetch(
    `${apiBase}/sell/inventory/v1/offer/${encodeURIComponent(offerId!)}/publish`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${ebayToken}`, "Content-Type": "application/json" },
    }
  );
  const pubData = await pubRes.json();

  if (!pubRes.ok) {
    await supabase.from("ebay_drafts").update({
      channel_status: "failed",
      ebay_last_error: JSON.stringify(pubData),
      ebay_last_synced_at: new Date().toISOString(),
    }).eq("id", draft.id as string);
    await logJob(supabase, {
      product_id, ebay_draft_id: draft.id, operation_type: "publish_offer",
      sku, offer_id: offerId, request_payload: { offerId },
      response_payload: pubData, status: "failed", error_message: JSON.stringify(pubData),
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
  }).eq("id", draft.id as string);

  await logJob(supabase, {
    product_id, ebay_draft_id: draft.id, operation_type: "publish_offer",
    sku, offer_id: offerId, listing_id: listingId,
    request_payload: { offerId }, response_payload: pubData, status: "success",
  });

  return {
    success: true, listingId, offerId, sku,
    listing_url: listingId ? `https://www.ebay.com.au/itm/${listingId}` : null,
  };
}

// ─── Handler: get_offer ─────────────────────────────────────────────────
async function handleGetOffer(
  ebayToken: string, apiBase: string,
  params: Record<string, unknown>
) {
  const { offer_id } = params;
  if (!offer_id) throw new Error("Offer ID required");

  const res = await fetch(
    `${apiBase}/sell/inventory/v1/offer/${encodeURIComponent(offer_id as string)}`,
    { headers: { Authorization: `Bearer ${ebayToken}`, "Content-Type": "application/json" } }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Get offer failed [${res.status}]: ${JSON.stringify(data)}`);
  return { success: true, offer: data };
}

// ─── Main Router ────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // JWT authentication check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const userToken = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(userToken);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = getSupabaseAdmin();

  try {
    const { action, ...params } = await req.json();
    const { token: ebayToken, conn } = await getValidToken(supabase);
    const apiBase = getEbayBaseUrls((conn.environment as string) || "production").api;
    const marketplaceId = (conn.marketplace_id as string) || "EBAY_AU";

    let result: Record<string, unknown>;

    switch (action) {
      case "create_inventory_item":
        result = await handleCreateInventoryItem(supabase, ebayToken, apiBase, params);
        break;
      case "create_offer":
        result = await handleCreateOffer(supabase, ebayToken, apiBase, conn, marketplaceId, params);
        break;
      case "update_offer":
        result = await handleUpdateOffer(supabase, ebayToken, apiBase, conn, marketplaceId, params);
        break;
      case "publish_offer":
        result = await handlePublishOffer(supabase, ebayToken, apiBase, params);
        break;
      case "publish_product":
        result = await handlePublishProduct(supabase, ebayToken, apiBase, conn, marketplaceId, params);
        break;
      case "get_offer":
        result = await handleGetOffer(ebayToken, apiBase, params);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("ebay-inventory error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
