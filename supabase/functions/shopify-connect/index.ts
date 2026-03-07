import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    const { action, shop_domain, access_token, api_version } = await req.json();

    if (action === "test") {
      // Test connection by querying the Shopify shop
      const { data: conn } = await supabase
        .from("shopify_connections")
        .select("*")
        .limit(1)
        .single();

      if (!conn?.access_token_encrypted || !conn?.shop_domain) {
        return new Response(
          JSON.stringify({ success: false, error: "No connection configured" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const shopRes = await fetch(
        `https://${conn.shop_domain}/admin/api/${conn.api_version || "2024-01"}/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": conn.access_token_encrypted,
          },
          body: JSON.stringify({
            query: `{ shop { name primaryDomain { url } } }`,
          }),
        }
      );

      const shopData = await shopRes.json();

      if (shopData.errors) {
        return new Response(
          JSON.stringify({ success: false, error: shopData.errors[0]?.message || "API error" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update last sync status
      await supabase
        .from("shopify_connections")
        .update({ last_sync_status: "connected", updated_at: new Date().toISOString() })
        .eq("id", conn.id);

      return new Response(
        JSON.stringify({
          success: true,
          shop: shopData.data?.shop,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "save") {
      if (!shop_domain || !access_token) {
        return new Response(
          JSON.stringify({ error: "shop_domain and access_token required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if connection exists
      const { data: existing } = await supabase
        .from("shopify_connections")
        .select("id")
        .limit(1)
        .single();

      const connData = {
        shop_domain: shop_domain.replace("https://", "").replace("http://", "").replace(/\/$/, ""),
        access_token_encrypted: access_token,
        api_version: api_version || "2024-01",
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        await supabase
          .from("shopify_connections")
          .update(connData)
          .eq("id", existing.id);
      } else {
        await supabase
          .from("shopify_connections")
          .insert({ ...connData, created_at: new Date().toISOString() });
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
