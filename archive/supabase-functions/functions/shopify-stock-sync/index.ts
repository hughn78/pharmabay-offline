import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// GraphQL query to fetch products with inventory item IDs
const INVENTORY_PRODUCTS_QUERY = `
query ($first: Int!, $after: String) {
  products(first: $first, after: $after) {
    edges {
      cursor
      node {
        id
        title
        handle
        status
        variants(first: 100) {
          edges {
            node {
              id
              title
              sku
              barcode
              inventoryQuantity
              inventoryItem {
                id
              }
            }
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}`;

// Mutation to set inventory levels
const INVENTORY_SET_QUANTITIES = `
mutation inventorySetOnHandQuantities($input: InventorySetOnHandQuantitiesInput!) {
  inventorySetOnHandQuantities(input: $input) {
    userErrors {
      field
      message
    }
    inventoryAdjustmentGroup {
      createdAt
      reason
    }
  }
}`;

interface SyncRequest {
  action: "preview" | "sync_matched" | "sync_selected" | "refresh_shopify";
  sync_run_id?: string;
  selected_item_ids?: string[];
  import_batch_id?: string;
  reserve_buffer?: number;
  inventory_sync_mode?: string;
  max_qty_cap?: number;
  sync_zero_stock?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify JWT
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: SyncRequest = await req.json();
    const { action } = body;

    // Get Shopify connection
    const { data: conn } = await supabase
      .from("shopify_connections")
      .select("*")
      .limit(1)
      .single();

    if (!conn?.access_token_encrypted || !conn?.shop_domain) {
      return new Response(
        JSON.stringify({ error: "No Shopify connection configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiVersion = conn.api_version || "2024-01";
    const endpoint = `https://${conn.shop_domain}/admin/api/${apiVersion}/graphql.json`;
    const locationId = conn.primary_location_id;

    if (!locationId) {
      return new Response(
        JSON.stringify({ error: "No Shopify location ID configured. Set it in Settings > Shopify." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    async function shopifyGraphQL(query: string, variables: any) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": conn!.access_token_encrypted!,
        },
        body: JSON.stringify({ query, variables }),
      });
      return await res.json();
    }

    // ---- ACTION: refresh_shopify ----
    if (action === "refresh_shopify") {
      const shopifyProducts = await fetchAllShopifyProducts(shopifyGraphQL);
      // Update shopify_products table with latest data
      for (const product of shopifyProducts) {
        const { data: existing } = await supabase
          .from("shopify_products")
          .select("id")
          .eq("shopify_product_gid", product.id)
          .maybeSingle();

        const payload = {
          shopify_product_gid: product.id,
          handle: product.handle,
          raw_payload: product,
          sync_status: "synced",
          last_synced_at: new Date().toISOString(),
        };

        if (existing) {
          await supabase.from("shopify_products").update(payload).eq("id", existing.id);
        } else {
          await supabase.from("shopify_products").insert(payload);
        }
      }

      return jsonResponse({ success: true, refreshed: shopifyProducts.length });
    }

    // ---- ACTION: preview ----
    if (action === "preview") {
      const reserveBuffer = body.reserve_buffer ?? conn.reserve_stock_buffer ?? 0;
      const syncMode = body.inventory_sync_mode ?? conn.inventory_sync_mode ?? "stock_minus_buffer";
      const maxCap = body.max_qty_cap ?? conn.max_qty_cap;
      const syncZero = body.sync_zero_stock ?? conn.sync_zero_stock ?? false;

      // Fetch fresh Shopify data
      const shopifyProducts = await fetchAllShopifyProducts(shopifyGraphQL);

      // Build variant lookup
      const variantMap = buildVariantMap(shopifyProducts);

      // Get local products
      let localQuery = supabase.from("products").select("*");
      if (body.import_batch_id) {
        // If specific batch, we'd need to join - for now just get all products
      }
      const { data: localProducts } = await localQuery;

      // Create sync run
      const { data: syncRun } = await supabase
        .from("stock_sync_runs")
        .insert({
          sync_mode: "preview",
          status: "preview",
          import_batch_id: body.import_batch_id || null,
          reserve_buffer: reserveBuffer,
          inventory_sync_mode: syncMode,
          max_qty_cap: maxCap || null,
          sync_zero_stock: syncZero,
          total_local_products: localProducts?.length || 0,
          started_by: user.id,
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (!syncRun || !localProducts) {
        return jsonResponse({ error: "Failed to create sync run" }, 500);
      }

      // Match and build items
      const items = matchProducts(localProducts, variantMap, reserveBuffer, syncMode, maxCap, syncZero, locationId!);

      // Batch insert items
      const itemRows = items.map((item) => ({
        ...item,
        sync_run_id: syncRun.id,
      }));

      if (itemRows.length > 0) {
        // Insert in batches of 100
        for (let i = 0; i < itemRows.length; i += 100) {
          await supabase.from("stock_sync_items").insert(itemRows.slice(i, i + 100));
        }
      }

      // Update sync run stats
      const matched = items.filter((i) => i.match_confidence === "high");
      const uncertain = items.filter((i) => i.match_confidence === "medium" || i.match_confidence === "low");
      const noMatch = items.filter((i) => i.match_confidence === "none");
      const updateNeeded = items.filter(
        (i) => i.match_confidence === "high" && i.sync_status === "update_needed"
      );

      await supabase
        .from("stock_sync_runs")
        .update({
          status: "preview_complete",
          completed_at: new Date().toISOString(),
          total_matched: matched.length,
          total_update_needed: updateNeeded.length,
          total_no_match: noMatch.length,
          total_uncertain: uncertain.length,
        })
        .eq("id", syncRun.id);

      return jsonResponse({
        success: true,
        sync_run_id: syncRun.id,
        total: items.length,
        matched: matched.length,
        update_needed: updateNeeded.length,
        no_match: noMatch.length,
        uncertain: uncertain.length,
      });
    }

    // ---- ACTION: sync_matched or sync_selected ----
    if (action === "sync_matched" || action === "sync_selected") {
      const syncRunId = body.sync_run_id;
      if (!syncRunId) {
        return jsonResponse({ error: "sync_run_id required" }, 400);
      }

      // Update run status
      await supabase
        .from("stock_sync_runs")
        .update({ status: "syncing", sync_mode: action })
        .eq("id", syncRunId);

      // Get items to sync
      let itemsQuery = supabase
        .from("stock_sync_items")
        .select("*")
        .eq("sync_run_id", syncRunId)
        .eq("match_confidence", "high")
        .eq("sync_status", "update_needed");

      if (action === "sync_selected" && body.selected_item_ids?.length) {
        itemsQuery = itemsQuery.in("id", body.selected_item_ids);
      }

      const { data: itemsToSync } = await itemsQuery;

      if (!itemsToSync || itemsToSync.length === 0) {
        await supabase
          .from("stock_sync_runs")
          .update({ status: "completed", completed_at: new Date().toISOString(), total_synced: 0 })
          .eq("id", syncRunId);
        return jsonResponse({ success: true, synced: 0, failed: 0 });
      }

      let synced = 0;
      let failed = 0;

      for (const item of itemsToSync) {
        try {
          if (!item.shopify_inventory_item_id || !item.shopify_location_id) {
            throw new Error("Missing inventory item ID or location ID");
          }

          const input = {
            reason: "correction",
            setQuantities: [
              {
                inventoryItemId: item.shopify_inventory_item_id,
                locationId: `gid://shopify/Location/${item.shopify_location_id}`,
                quantity: item.proposed_shopify_qty,
              },
            ],
          };

          const result = await shopifyGraphQL(INVENTORY_SET_QUANTITIES, { input });

          const userErrors = result?.data?.inventorySetOnHandQuantities?.userErrors;
          if (userErrors && userErrors.length > 0) {
            throw new Error(userErrors.map((e: any) => e.message).join(", "));
          }

          await supabase
            .from("stock_sync_items")
            .update({
              sync_status: "sync_success",
              response_payload: result,
              request_payload: input,
              synced_at: new Date().toISOString(),
              synced_by: user.id,
            })
            .eq("id", item.id);

          synced++;
        } catch (err: any) {
          failed++;
          await supabase
            .from("stock_sync_items")
            .update({
              sync_status: "sync_failed",
              error_message: err.message,
              synced_at: new Date().toISOString(),
            })
            .eq("id", item.id);
        }
      }

      await supabase
        .from("stock_sync_runs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          total_synced: synced,
          total_failed: failed,
        })
        .eq("id", syncRunId);

      return jsonResponse({ success: true, synced, failed });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (err: any) {
    console.error("Stock sync error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchAllShopifyProducts(graphql: (q: string, v: any) => Promise<any>) {
  const products: any[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    const json = await graphql(INVENTORY_PRODUCTS_QUERY, { first: 50, after: cursor });
    if (json.errors) {
      console.error("Shopify API error:", json.errors);
      break;
    }
    const { edges, pageInfo } = json.data.products;
    for (const edge of edges) {
      products.push(edge.node);
    }
    hasNextPage = pageInfo.hasNextPage;
    cursor = pageInfo.endCursor;
  }

  return products;
}

interface VariantEntry {
  productGid: string;
  productTitle: string;
  variantGid: string;
  variantTitle: string;
  sku: string;
  barcode: string;
  inventoryQuantity: number;
  inventoryItemId: string;
}

function buildVariantMap(products: any[]) {
  const byBarcode = new Map<string, VariantEntry[]>();
  const bySku = new Map<string, VariantEntry[]>();
  const byTitle = new Map<string, VariantEntry[]>();
  const all: VariantEntry[] = [];

  for (const product of products) {
    const variants = product.variants?.edges || [];
    for (const ve of variants) {
      const v = ve.node;
      const entry: VariantEntry = {
        productGid: product.id,
        productTitle: product.title || "",
        variantGid: v.id,
        variantTitle: v.title || "",
        sku: v.sku || "",
        barcode: v.barcode || "",
        inventoryQuantity: v.inventoryQuantity ?? 0,
        inventoryItemId: v.inventoryItem?.id || "",
      };
      all.push(entry);

      if (entry.barcode) {
        const arr = byBarcode.get(entry.barcode) || [];
        arr.push(entry);
        byBarcode.set(entry.barcode, arr);
      }
      if (entry.sku) {
        const arr = bySku.get(entry.sku) || [];
        arr.push(entry);
        bySku.set(entry.sku, arr);
      }
      const normTitle = product.title?.toLowerCase().trim();
      if (normTitle) {
        const arr = byTitle.get(normTitle) || [];
        arr.push(entry);
        byTitle.set(normTitle, arr);
      }
    }
  }

  return { byBarcode, bySku, byTitle, all };
}

function calculateQtyToPush(
  stockOnHand: number,
  reserveBuffer: number,
  syncMode: string,
  maxCap?: number | null,
  syncZero?: boolean
): number {
  let qty: number;

  if (syncMode === "exact_stock") {
    qty = Math.max(0, Math.floor(stockOnHand));
  } else {
    qty = Math.max(0, Math.floor(stockOnHand - reserveBuffer));
  }

  if (maxCap != null && syncMode === "capped_stock") {
    qty = Math.min(qty, maxCap);
  }

  if (qty === 0 && !syncZero) {
    // We'll still include it but flag differently
  }

  return qty;
}

function matchProducts(
  localProducts: any[],
  variantMap: ReturnType<typeof buildVariantMap>,
  reserveBuffer: number,
  syncMode: string,
  maxCap?: number | null,
  syncZero?: boolean,
  shopifyLocationId?: string
) {
  const items: any[] = [];
  const usedVariantGids = new Set<string>();

  for (const local of localProducts) {
    const stockOnHand = parseFloat(local.stock_on_hand) || 0;
    const qtyToPush = calculateQtyToPush(stockOnHand, reserveBuffer, syncMode, maxCap, syncZero);

    const base = {
      product_id: local.id,
      local_product_name: local.normalized_product_name || local.source_product_name || "",
      local_barcode: local.barcode || "",
      local_sku: local.sku || "",
      local_stock_on_hand: stockOnHand,
      reserve_buffer: reserveBuffer,
      quantity_to_push: qtyToPush,
    };

    let matched: VariantEntry | null = null;
    let matchType = "";
    let matchConfidence = "none";
    let flagForReview = false;

    // Priority 1: exact barcode match
    if (local.barcode) {
      const barcodeMatches = variantMap.byBarcode.get(local.barcode);
      if (barcodeMatches) {
        const available = barcodeMatches.filter((m) => !usedVariantGids.has(m.variantGid));
        if (available.length === 1) {
          matched = available[0];
          matchType = "barcode";
          matchConfidence = "high";
        } else if (available.length > 1) {
          // Multiple matches — flag for review
          matched = available[0];
          matchType = "barcode_multiple";
          matchConfidence = "medium";
          flagForReview = true;
        }
      }
    }

    // Priority 2: exact SKU match
    if (!matched && local.sku) {
      const skuMatches = variantMap.bySku.get(local.sku);
      if (skuMatches) {
        const available = skuMatches.filter((m) => !usedVariantGids.has(m.variantGid));
        if (available.length === 1) {
          matched = available[0];
          matchType = "sku";
          matchConfidence = "high";
        } else if (available.length > 1) {
          matched = available[0];
          matchType = "sku_multiple";
          matchConfidence = "medium";
          flagForReview = true;
        }
      }
    }

    // Priority 3: barcode + SKU combo (already covered above, extra confidence)

    // Priority 4: exact title match (only if no barcode and no SKU)
    if (!matched && !local.barcode && !local.sku) {
      const normalizedName = (local.normalized_product_name || local.source_product_name || "").toLowerCase().trim();
      if (normalizedName) {
        const titleMatches = variantMap.byTitle.get(normalizedName);
        if (titleMatches) {
          const available = titleMatches.filter((m) => !usedVariantGids.has(m.variantGid));
          if (available.length === 1) {
            matched = available[0];
            matchType = "title";
            matchConfidence = "medium"; // title-only is always medium
            flagForReview = true;
          } else if (available.length > 1) {
            matched = available[0];
            matchType = "title_multiple";
            matchConfidence = "low";
            flagForReview = true;
          }
        }
      }
    }

    if (matched) {
      usedVariantGids.add(matched.variantGid);
      const currentQty = matched.inventoryQuantity;
      const diff = qtyToPush - currentQty;

      let syncStatus: string;
      if (flagForReview) {
        syncStatus = "uncertain_match";
      } else if (diff === 0) {
        syncStatus = "matched_no_change";
      } else {
        syncStatus = "update_needed";
      }

      // Don't push zero stock if setting says no
      if (qtyToPush === 0 && !syncZero && syncStatus === "update_needed") {
        syncStatus = "skipped_zero";
      }

      items.push({
        ...base,
        shopify_product_gid: matched.productGid,
        shopify_variant_gid: matched.variantGid,
        shopify_inventory_item_id: matched.inventoryItemId,
        shopify_location_id: shopifyLocationId || "",
        shopify_product_title: matched.productTitle,
        shopify_variant_title: matched.variantTitle,
        shopify_sku: matched.sku,
        shopify_barcode: matched.barcode,
        current_shopify_qty: currentQty,
        proposed_shopify_qty: qtyToPush,
        qty_difference: diff,
        match_type: matchType,
        match_confidence: matchConfidence,
        sync_status: syncStatus,
      });
    } else {
      items.push({
        ...base,
        match_type: "none",
        match_confidence: "none",
        sync_status: "no_match",
      });
    }
  }

  // Set location ID from connection for all items
  return items;
}
