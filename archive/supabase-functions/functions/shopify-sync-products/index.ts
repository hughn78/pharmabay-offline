import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PRODUCTS_QUERY = `
query ($first: Int!, $after: String) {
  products(first: $first, after: $after) {
    edges {
      cursor
      node {
        id
        title
        handle
        status
        vendor
        productType
        tags
        totalInventory
        variants(first: 10) {
          edges {
            node {
              id
              title
              sku
              barcode
              price
              compareAtPrice
              inventoryQuantity
            }
          }
        }
        images(first: 5) {
          edges {
            node {
              id
              url
              altText
              width
              height
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
    const {
      data: { user },
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get connection
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

    // Create sync run
    const { data: syncRun } = await supabase
      .from("shopify_sync_runs")
      .insert({
        sync_mode: "full",
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    let hasNextPage = true;
    let cursor: string | null = null;
    let totalProcessed = 0;
    let totalCreated = 0;
    let totalUpdated = 0;
    let errorCount = 0;

    while (hasNextPage) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": conn.access_token_encrypted,
        },
        body: JSON.stringify({
          query: PRODUCTS_QUERY,
          variables: { first: 50, after: cursor },
        }),
      });

      const json = await res.json();
      if (json.errors) {
        errorCount++;
        console.error("Shopify API error:", json.errors);
        break;
      }

      const { edges, pageInfo } = json.data.products;
      hasNextPage = pageInfo.hasNextPage;
      cursor = pageInfo.endCursor;

      for (const edge of edges) {
        const node = edge.node;
        totalProcessed++;

        try {
          // Upsert into shopify_products
          const { data: existing } = await supabase
            .from("shopify_products")
            .select("id")
            .eq("shopify_product_gid", node.id)
            .maybeSingle();

          const productPayload = {
            shopify_product_gid: node.id,
            handle: node.handle,
            raw_payload: node,
            sync_status: "synced",
            last_synced_at: new Date().toISOString(),
            sync_hash: btoa(JSON.stringify(node)).substring(0, 64),
          };

          if (existing) {
            await supabase
              .from("shopify_products")
              .update(productPayload)
              .eq("id", existing.id);
            totalUpdated++;
          } else {
            await supabase
              .from("shopify_products")
              .insert(productPayload);
            totalCreated++;
          }
        } catch (err) {
          errorCount++;
          console.error("Error syncing product:", node.id, err);
        }
      }
    }

    // Update sync run
    if (syncRun) {
      await supabase
        .from("shopify_sync_runs")
        .update({
          status: errorCount > 0 ? "completed_with_errors" : "completed",
          completed_at: new Date().toISOString(),
          items_processed: totalProcessed,
          items_created: totalCreated,
          items_updated: totalUpdated,
          error_count: errorCount,
          cursor_end: cursor,
        })
        .eq("id", syncRun.id);
    }

    // Update connection
    await supabase
      .from("shopify_connections")
      .update({
        last_successful_sync_at: new Date().toISOString(),
        last_sync_status: errorCount > 0 ? "completed_with_errors" : "synced",
      })
      .eq("id", conn.id);

    return new Response(
      JSON.stringify({
        success: true,
        processed: totalProcessed,
        created: totalCreated,
        updated: totalUpdated,
        errors: errorCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
