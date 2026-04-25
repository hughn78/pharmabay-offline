import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function getEbayBaseUrls(env: string) {
  const isProd = env === "production";
  return {
    auth: isProd ? "https://auth.ebay.com" : "https://auth.sandbox.ebay.com",
    api: isProd ? "https://api.ebay.com" : "https://api.sandbox.ebay.com",
  };
}

export function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

export async function getConnection(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from("ebay_connections")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`DB error: ${error.message}`);
  return data;
}

export async function refreshAccessToken(
  supabase: ReturnType<typeof createClient>,
  conn: Record<string, unknown>
): Promise<string> {
  const clientId = Deno.env.get("EBAY_CLIENT_ID");
  const clientSecret = Deno.env.get("EBAY_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("eBay API credentials not configured");
  if (!conn.refresh_token_encrypted) throw new Error("No refresh token stored");

  const env = (conn.environment as string) || "production";
  const urls = getEbayBaseUrls(env);
  const basicAuth = btoa(`${clientId}:${clientSecret}`);

  const res = await fetch(`${urls.api}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: conn.refresh_token_encrypted as string,
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
    .eq("id", conn.id as string);

  return data.access_token as string;
}

/**
 * Get a valid eBay access token, refreshing automatically if expired or expiring within 60s.
 */
export async function getValidToken(
  supabase: ReturnType<typeof createClient>
): Promise<{ token: string; conn: Record<string, unknown> }> {
  const conn = await getConnection(supabase);
  if (!conn) throw new Error("No eBay connection configured");

  const now = new Date();
  const expiresAt = conn.access_token_expires_at
    ? new Date(conn.access_token_expires_at as string)
    : null;

  if (
    conn.access_token_encrypted &&
    expiresAt &&
    expiresAt > new Date(now.getTime() + 60000)
  ) {
    return { token: conn.access_token_encrypted as string, conn };
  }

  const token = await refreshAccessToken(supabase, conn);
  return { token, conn };
}
