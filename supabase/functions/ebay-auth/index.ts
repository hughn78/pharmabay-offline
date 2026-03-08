import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getEbayBaseUrls(env: string) {
  const isProd = env === "production";
  return {
    auth: isProd ? "https://auth.ebay.com" : "https://auth.sandbox.ebay.com",
    api: isProd ? "https://api.ebay.com" : "https://api.sandbox.ebay.com",
  };
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function getConnection(supabase: any) {
  const { data, error } = await supabase
    .from("ebay_connections")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`DB error: ${error.message}`);
  return data;
}

async function refreshAccessToken(supabase: any, conn: any) {
  const clientId = Deno.env.get("EBAY_CLIENT_ID");
  const clientSecret = Deno.env.get("EBAY_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("eBay API credentials not configured");
  if (!conn?.refresh_token_encrypted) throw new Error("No refresh token stored");

  const urls = getEbayBaseUrls(conn.environment);
  const basicAuth = btoa(`${clientId}:${clientSecret}`);

  const res = await fetch(`${urls.api}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: conn.refresh_token_encrypted,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);

  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  await supabase
    .from("ebay_connections")
    .update({
      access_token_encrypted: data.access_token,
      access_token_expires_at: expiresAt,
      connection_status: "connected",
    })
    .eq("id", conn.id);

  return data.access_token;
}

// Exported helper: get a valid access token, refreshing if needed
async function getValidToken(supabase: any): Promise<string> {
  const conn = await getConnection(supabase);
  if (!conn) throw new Error("No eBay connection configured");

  const now = new Date();
  const expiresAt = conn.access_token_expires_at
    ? new Date(conn.access_token_expires_at)
    : null;

  if (conn.access_token_encrypted && expiresAt && expiresAt > new Date(now.getTime() + 60000)) {
    return conn.access_token_encrypted;
  }

  return await refreshAccessToken(supabase, conn);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, ...params } = await req.json();
    const supabase = getSupabaseAdmin();

    if (action === "get_auth_url") {
      const clientId = Deno.env.get("EBAY_CLIENT_ID");
      if (!clientId) throw new Error("EBAY_CLIENT_ID not configured");

      const conn = await getConnection(supabase);
      const env = conn?.environment || params.environment || "production";
      const ruName = conn?.ru_name || params.ru_name;
      if (!ruName) throw new Error("RU Name not configured");

      const urls = getEbayBaseUrls(env);
      const scopes = [
        "https://api.ebay.com/oauth/api_scope",
        "https://api.ebay.com/oauth/api_scope/sell.inventory",
        "https://api.ebay.com/oauth/api_scope/sell.marketing",
        "https://api.ebay.com/oauth/api_scope/sell.account",
        "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
      ].join(" ");

      const authUrl =
        `${urls.auth}/oauth2/authorize?client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(ruName)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(scopes)}`;

      return new Response(JSON.stringify({ auth_url: authUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "exchange_code") {
      const { code } = params;
      if (!code) throw new Error("Authorization code required");

      const clientId = Deno.env.get("EBAY_CLIENT_ID");
      const clientSecret = Deno.env.get("EBAY_CLIENT_SECRET");
      if (!clientId || !clientSecret) throw new Error("eBay API credentials not configured");

      const conn = await getConnection(supabase);
      const env = conn?.environment || "production";
      const ruName = conn?.ru_name;
      if (!ruName) throw new Error("RU Name not configured");

      const urls = getEbayBaseUrls(env);
      const basicAuth = btoa(`${clientId}:${clientSecret}`);

      const res = await fetch(`${urls.api}/identity/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: ruName,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);

      const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

      const updateData: any = {
        access_token_encrypted: data.access_token,
        access_token_expires_at: expiresAt,
        refresh_token_encrypted: data.refresh_token,
        connection_status: "connected",
      };

      if (conn?.id) {
        await supabase.from("ebay_connections").update(updateData).eq("id", conn.id);
      } else {
        await supabase.from("ebay_connections").insert({
          ...updateData,
          environment: env,
          client_id: clientId,
          ru_name: ruName,
        });
      }

      return new Response(JSON.stringify({ success: true, message: "eBay account connected" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "refresh_token") {
      const conn = await getConnection(supabase);
      if (!conn) throw new Error("No eBay connection found");

      await refreshAccessToken(supabase, conn);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "test") {
      const conn = await getConnection(supabase);
      if (!conn) throw new Error("No eBay connection configured");

      const token = await getValidToken(supabase);
      const urls = getEbayBaseUrls(conn.environment);

      // Test by fetching account info
      const res = await fetch(`${urls.api}/sell/account/v1/privilege`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const err = await res.text();
        await supabase
          .from("ebay_connections")
          .update({ connection_status: "error" })
          .eq("id", conn.id);
        throw new Error(`eBay API test failed [${res.status}]: ${err}`);
      }

      const data = await res.json();

      await supabase
        .from("ebay_connections")
        .update({ connection_status: "connected" })
        .eq("id", conn.id);

      return new Response(
        JSON.stringify({ success: true, privileges: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "save_settings") {
      const conn = await getConnection(supabase);
      const payload: any = {};
      if (params.environment !== undefined) payload.environment = params.environment;
      if (params.ru_name !== undefined) payload.ru_name = params.ru_name;
      if (params.client_id !== undefined) payload.client_id = params.client_id;
      if (params.marketplace_id !== undefined) payload.marketplace_id = params.marketplace_id;
      if (params.merchant_location_key !== undefined) payload.merchant_location_key = params.merchant_location_key;
      if (params.fulfillment_policy_id !== undefined) payload.fulfillment_policy_id = params.fulfillment_policy_id;
      if (params.payment_policy_id !== undefined) payload.payment_policy_id = params.payment_policy_id;
      if (params.return_policy_id !== undefined) payload.return_policy_id = params.return_policy_id;

      if (conn?.id) {
        const { error } = await supabase.from("ebay_connections").update(payload).eq("id", conn.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ebay_connections").insert(payload);
        if (error) throw error;
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get_status") {
      const conn = await getConnection(supabase);
      if (!conn) {
        return new Response(JSON.stringify({ connected: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          connected: conn.connection_status === "connected",
          status: conn.connection_status,
          username: conn.connected_username,
          environment: conn.environment,
          marketplace_id: conn.marketplace_id,
          merchant_location_key: conn.merchant_location_key,
          fulfillment_policy_id: conn.fulfillment_policy_id,
          payment_policy_id: conn.payment_policy_id,
          return_policy_id: conn.return_policy_id,
          ru_name: conn.ru_name,
          client_id: conn.client_id,
          has_refresh_token: !!conn.refresh_token_encrypted,
          token_expires_at: conn.access_token_expires_at,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err: any) {
    console.error("ebay-auth error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
