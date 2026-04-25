/**
 * eBay OAuth + API client for Electron main process.
 *
 * Ported from archived Supabase edge functions:
 *   - ebay-auth/index.ts
 *   - _shared/ebay-token.ts
 *
 * Credentials (client_id, client_secret) are stored in the settings table.
 * Tokens + connection state live in the ebay_connections table.
 */

import { db } from './db.js';
import { ok, err } from './ipc-types.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function getSetting(key: string): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
  return row?.value ?? '';
}

function setSetting(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

function getEbayBaseUrls(environment: string) {
  const isProd = environment === 'production';
  return {
    auth: isProd ? 'https://auth.ebay.com' : 'https://auth.sandbox.ebay.com',
    api:  isProd ? 'https://api.ebay.com'  : 'https://api.sandbox.ebay.com',
  };
}

/** Get or create the single eBay connection row. */
function getConnectionRow() {
  const row = db.prepare('SELECT * FROM ebay_connections ORDER BY created_at DESC LIMIT 1').get() as any;
  if (row) return row;

  const now = new Date().toISOString();
  db.prepare(`INSERT INTO ebay_connections
    (id, environment, connection_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)`).run(
    crypto.randomUUID(), 'production', 'disconnected', now, now
  );
  return db.prepare('SELECT * FROM ebay_connections ORDER BY created_at DESC LIMIT 1').get() as any;
}

/** Refresh eBay access token using the stored refresh token. */
async function refreshAccessToken(): Promise<{ token: string; conn: any }> {
  const conn = getConnectionRow();
  if (!conn || !conn.refresh_token) {
    throw new Error('No eBay refresh token available. Re-authenticate via Settings.');
  }

  const clientId = getSetting('ebay_client_id').trim();
  const clientSecret = getSetting('ebay_client_secret').trim();
  if (!clientId || !clientSecret) {
    throw new Error('eBay Client ID / Secret not configured in Settings.');
  }

  const env = conn.environment || 'production';
  const urls = getEbayBaseUrls(env);
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(`${urls.api}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: conn.refresh_token,
    }),
  });

  const data = await res.json() as any;
  if (!res.ok) {
    db.prepare('UPDATE ebay_connections SET connection_status = ?, updated_at = ? WHERE id = ?')
      .run('error', new Date().toISOString(), conn.id);
    throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  }

  const expiresAt = new Date(Date.now() + (data.expires_in ?? 7200) * 1000).toISOString();
  db.prepare(`UPDATE ebay_connections
    SET access_token = ?, access_token_expires_at = ?, refresh_token = ?,
        connection_status = ?, updated_at = ? WHERE id = ?`).run(
    data.access_token as string,
    expiresAt,
    data.refresh_token as string,
    'connected',
    new Date().toISOString(),
    conn.id,
  );

  return { token: data.access_token as string, conn: { ...conn, access_token: data.access_token, connection_status: 'connected' } };
}

/** Get a valid access token, auto-refresh if expired or expiring within 60s. */
async function getValidToken(): Promise<{ token: string; conn: any }> {
  const conn = getConnectionRow();
  if (!conn) throw new Error('No eBay connection configured');

  const now = new Date();
  const expiresAt = conn.access_token_expires_at ? new Date(conn.access_token_expires_at) : null;
  if (
    conn.access_token &&
    expiresAt &&
    expiresAt > new Date(now.getTime() + 60000)
  ) {
    return { token: conn.access_token as string, conn };
  }

  return refreshAccessToken();
}

// ─── IPC actions ────────────────────────────────────────────────────────────

export async function ebayGetAuthUrl() {
  try {
    const clientId = getSetting('ebay_client_id').trim();
    if (!clientId) return err('EBAY_CLIENT_ID not configured in Settings.');

    const conn = getConnectionRow();
    const env = conn?.environment || 'production';
    const ruName = conn?.ru_name || getSetting('ebay_ru_name');
    if (!ruName) return err('RU Name not configured in Settings.');

    const urls = getEbayBaseUrls(env);
    const scopes = [
      'https://api.ebay.com/oauth/api_scope',
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
      'https://api.ebay.com/oauth/api_scope/sell.marketing',
      'https://api.ebay.com/oauth/api_scope/sell.account',
      'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
    ].join(' ');

    const authUrl =
      `${urls.auth}/oauth2/authorize?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(ruName)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scopes)}`;

    return ok({ auth_url: authUrl });
  } catch (e: any) {
    return err(e.message ?? String(e));
  }
}

export async function ebayExchangeCode(code: string) {
  try {
    if (!code) return err('Authorization code required');

    const clientId = getSetting('ebay_client_id').trim();
    const clientSecret = getSetting('ebay_client_secret').trim();
    if (!clientId || !clientSecret) return err('eBay Client ID / Secret not configured');

    const conn = getConnectionRow();
    const env = conn?.environment || 'production';
    const ruName = conn?.ru_name;
    if (!ruName) return err('RU Name not configured in Settings.');

    const urls = getEbayBaseUrls(env);
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const res = await fetch(`${urls.api}/identity/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: ruName,
      }),
    });

    const data = await res.json() as any;
    if (!res.ok) {
      return err(`Token exchange failed: ${JSON.stringify(data)}`);
    }

    const expiresAt = new Date(Date.now() + (data.expires_in ?? 7200) * 1000).toISOString();

    db.prepare(`UPDATE ebay_connections
      SET access_token = ?, access_token_expires_at = ?, refresh_token = ?,
          connection_status = ?, updated_at = ? WHERE id = ?`).run(
      data.access_token as string,
      expiresAt,
      data.refresh_token as string,
      'connected',
      new Date().toISOString(),
      conn.id,
    );

    return ok({ success: true, message: 'eBay account connected' });
  } catch (e: any) {
    return err(e.message ?? String(e));
  }
}

export async function ebayRefreshToken() {
  try {
    await refreshAccessToken();
    return ok({ success: true });
  } catch (e: any) {
    return err(e.message ?? String(e));
  }
}

export async function ebayTestConnection() {
  try {
    const { token, conn } = await getValidToken();
    const urls = getEbayBaseUrls(conn.environment || 'production');

    const res = await fetch(`${urls.api}/sell/account/v1/privilege`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      db.prepare('UPDATE ebay_connections SET connection_status = ?, updated_at = ? WHERE id = ?')
        .run('error', new Date().toISOString(), conn.id);
      return err(`eBay API test failed [${res.status}]: ${errText}`);
    }

    const data = await res.json() as any;
    db.prepare('UPDATE ebay_connections SET connection_status = ?, updated_at = ? WHERE id = ?')
      .run('connected', new Date().toISOString(), conn.id);

    return ok({ success: true, privileges: data });
  } catch (e: any) {
    return err(e.message ?? String(e));
  }
}

export async function ebaySaveSettings(settings: Record<string, any>) {
  try {
    const conn = getConnectionRow();

    const fields: string[] = [];
    const values: any[] = [];

    if (settings.environment !== undefined) { fields.push('environment'); values.push(settings.environment); }
    if (settings.ru_name !== undefined) { fields.push('ru_name'); values.push(settings.ru_name); }
    if (settings.client_id !== undefined) { setSetting('ebay_client_id', settings.client_id); }
    if (settings.client_secret !== undefined) { setSetting('ebay_client_secret', settings.client_secret); }
    if (settings.marketplace_id !== undefined) { fields.push('marketplace_id'); values.push(settings.marketplace_id); }
    if (settings.merchant_location_key !== undefined) { fields.push('merchant_location_key'); values.push(settings.merchant_location_key); }
    if (settings.fulfillment_policy_id !== undefined) { fields.push('fulfillment_policy_id'); values.push(settings.fulfillment_policy_id); }
    if (settings.payment_policy_id !== undefined) { fields.push('payment_policy_id'); values.push(settings.payment_policy_id); }
    if (settings.return_policy_id !== undefined) { fields.push('return_policy_id'); values.push(settings.return_policy_id); }

    if (fields.length > 0) {
      const setClause = fields.map((f) => `"${f}" = ?`).join(', ');
      db.prepare(`UPDATE ebay_connections SET ${setClause}, updated_at = ? WHERE id = ?`).run(
        ...values, new Date().toISOString(), conn.id,
      );
    }

    return ok({ success: true });
  } catch (e: any) {
    return err(e.message ?? String(e));
  }
}

export async function ebayGetStatus() {
  try {
    const conn = getConnectionRow();
    if (!conn) {
      return ok({ connected: false });
    }
    return ok({
      connected: conn.connection_status === 'connected',
      status: conn.connection_status,
      username: conn.connected_username,
      environment: conn.environment,
      marketplace_id: conn.marketplace_id,
      merchant_location_key: conn.merchant_location_key,
      fulfillment_policy_id: conn.fulfillment_policy_id,
      payment_policy_id: conn.payment_policy_id,
      return_policy_id: conn.return_policy_id,
      ru_name: conn.ru_name,
      client_id: conn.client_id || getSetting('ebay_client_id'),
      has_refresh_token: !!conn.refresh_token,
      token_expires_at: conn.access_token_expires_at,
    });
  } catch (e: any) {
    return err(e.message ?? String(e));
  }
}
