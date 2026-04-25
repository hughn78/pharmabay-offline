/**
 * eBay OAuth + API client for Electron main process.
 *
 * Ported from archived Supabase edge functions:
 *   - ebay-auth/index.ts
 *   - _shared/ebay-token.ts
 *   - fetch-ebay-categories/index.ts
 *   - ebay-inventory/index.ts
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

/** Write a row to ebay_publish_jobs. */
function logJob(params: Record<string, any>) {
  try {
    db.prepare(`INSERT INTO ebay_publish_jobs
      (id, product_id, ebay_draft_id, operation_type, publish_mode,
       request_payload, response_payload, publish_status, error_message,
       ebay_inventory_sku, ebay_offer_id, ebay_listing_id, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      crypto.randomUUID(),
      params.product_id ?? null,
      params.ebay_draft_id ?? null,
      params.operation_type ?? null,
      params.operation_type ?? null,
      typeof params.request_payload === 'string' ? params.request_payload : JSON.stringify(params.request_payload ?? null) || null,
      typeof params.response_payload === 'string' ? params.response_payload : JSON.stringify(params.response_payload ?? null) || null,
      params.status ?? 'unknown',
      params.error_message ?? null,
      params.sku ?? null,
      params.offer_id ?? null,
      params.listing_id ?? null,
      params.status !== 'processing' ? new Date().toISOString() : null,
    );
  } catch (e) {
    console.error('[ebay] logJob error:', e);
  }
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

// ─── OAuth IPC actions ──────────────────────────────────────────────────────

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

// ─── Categories ───────────────────────────────────────────────────────────────

export async function ebayFetchCategories() {
  try {
    const { token, conn } = await getValidToken();
    const env = conn.environment || 'production';
    const urls = getEbayBaseUrls(env);

    // Fetch default category tree ID for EBAY_AU
    const treeRes = await fetch(
      `${urls.api}/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=EBAY_AU`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!treeRes.ok) {
      const errBody = await treeRes.text();
      throw new Error(`Failed to get tree ID: ${treeRes.status} ${errBody}`);
    }
    const treeData = await treeRes.json() as any;
    const treeId = treeData.categoryTreeId;

    // Fetch full category tree
    const catRes = await fetch(
      `${urls.api}/commerce/taxonomy/v1/category_tree/${treeId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!catRes.ok) {
      const errBody = await catRes.text();
      throw new Error(`Failed to get tree: ${catRes.status} ${errBody}`);
    }
    const catData = await catRes.json() as any;

    // Flatten the tree
    interface CatNode {
      category: { categoryId: string; categoryName: string };
      childCategoryTreeNodes?: CatNode[];
      leafCategoryTreeNode?: boolean;
    }

    interface FlatCat {
      id: string;
      category_id: string;
      category_name: string;
      parent_category_id: string | null;
      is_leaf: number;
      category_level: number;
    }

    const rows: FlatCat[] = [];

    const walk = function(node: CatNode, parentId: string | null, level: number) {
      const catId = node.category.categoryId;
      const isLeaf = node.leafCategoryTreeNode === true || !node.childCategoryTreeNodes?.length;
      rows.push({
        id: crypto.randomUUID(),
        category_id: catId,
        category_name: node.category.categoryName,
        parent_category_id: parentId,
        is_leaf: isLeaf ? 1 : 0,
        category_level: level,
      });
      if (node.childCategoryTreeNodes) {
        for (const child of node.childCategoryTreeNodes) {
          walk(child, catId, level + 1);
        }
      }
    }

    const rootNode = catData.rootCategoryNode as CatNode;
    if (rootNode) {
      walk(rootNode, null, 0);
    }

    // Clear and insert fresh
    db.prepare('DELETE FROM ebay_categories').run();

    const insert = db.prepare(`INSERT INTO ebay_categories
      (id, category_id, category_name, parent_category_id, is_leaf, category_level)
      VALUES (?, ?, ?, ?, ?, ?)`);

    const insertMany = db.transaction((cats: FlatCat[]) => {
      for (const c of cats) insert.run(c.id, c.category_id, c.category_name, c.parent_category_id, c.is_leaf, c.category_level);
    });
    insertMany(rows);

    return ok({ success: true, total: rows.length });
  } catch (e: any) {
    return err(e.message ?? String(e));
  }
}

// ─── Inventory / Offers / Publishing ──────────────────────────────────────────

export async function ebayPublishProduct(body: any) {
  try {
    const { product_id, draft_id } = body ?? {};
    if (!product_id) return err('Product ID required');

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id) as any;
    if (!product) return err('Product not found');

    let draft: any = null;
    if (draft_id) {
      draft = db.prepare('SELECT * FROM ebay_drafts WHERE id = ?').get(draft_id) as any;
    } else {
      draft = db.prepare('SELECT * FROM ebay_drafts WHERE product_id = ? ORDER BY updated_at DESC LIMIT 1').get(product_id) as any;
    }
    if (!draft) return err('No eBay draft found for this product');

    const sku = draft.ebay_inventory_sku || product.sku || product.barcode;
    if (!sku) return err('SKU is required (product SKU or barcode)');

    const title = draft.title || product.source_product_name;
    if (!title) return err('Title is required');
    if (title.length > 80) return err('Title must be ≤ 80 characters');

    const price = draft.buy_it_now_price || draft.start_price;
    if (!price || price <= 0) return err('Price must be > 0');

    const categoryId = draft.category_id;
    if (!categoryId) return err('eBay category ID required');

    const conn = getConnectionRow();
    if (!conn.merchant_location_key) return err('Merchant location key not configured');
    if (!conn.fulfillment_policy_id) return err('Fulfillment policy not configured');
    if (!conn.payment_policy_id) return err('Payment policy not configured');
    if (!conn.return_policy_id) return err('Return policy not configured');

    if (product.compliance_status === 'blocked') return err('Product compliance is blocked');

    const imgs = db.prepare('SELECT local_storage_url, original_url FROM product_images WHERE product_id = ? AND ebay_approved = 1 ORDER BY sort_order').all(product_id) as any[];
    const imageUrls = imgs.map((img: any) => img.local_storage_url || img.original_url).filter(Boolean);

    const quantity = product.quantity_available_for_ebay ?? Math.max(0, (product.stock_on_hand || 0) - (product.quantity_reserved_for_store || 0));
    if (quantity <= 0) return err('Available quantity must be > 0');

    const conditionId = draft.condition_id || '1000';
    const description = draft.description_html || draft.description_plain || '';

    const aspects: Record<string, string[]> = {};
    if (draft.brand || product.brand) aspects['Brand'] = [draft.brand || product.brand];
    if (draft.mpn) aspects['MPN'] = [draft.mpn];
    if (draft.upc || product.barcode) aspects['UPC'] = [draft.upc || product.barcode];

    const { token } = await getValidToken();
    const urls = getEbayBaseUrls(conn.environment || 'production');

    const commonHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Language': 'en-AU',
    };

    // Step 1: Create inventory item
    const inventoryItem = {
      product: {
        title, description,
        ...(imageUrls.length > 0 ? { imageUrls } : {}),
        ...(Object.keys(aspects).length > 0 ? { aspects } : {}),
        ...(draft.ean || product.barcode ? { ean: [draft.ean || product.barcode] } : {}),
      },
      condition: conditionId,
      availability: { shipToLocationAvailability: { quantity } },
    };

    const invRes = await fetch(
      `${urls.api}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
      { method: 'PUT', headers: commonHeaders, body: JSON.stringify(inventoryItem) }
    );

    if (!invRes.ok && invRes.status !== 204) {
      const errData = await invRes.text();
      logJob({ product_id, ebay_draft_id: draft.id, operation_type: 'create_inventory_item', sku, request_payload: inventoryItem, response_payload: errData, status: 'failed', error_message: errData });
      db.prepare('UPDATE ebay_drafts SET ebay_last_error = ?, ebay_last_synced_at = ? WHERE id = ?').run(`Inventory item failed: ${errData}`, new Date().toISOString(), draft.id);
      return err(`Inventory item creation failed: ${errData}`);
    }

    logJob({ product_id, ebay_draft_id: draft.id, operation_type: 'create_inventory_item', sku, request_payload: inventoryItem, status: 'success' });
    db.prepare('UPDATE ebay_drafts SET ebay_inventory_sku = ?, ebay_last_synced_at = ? WHERE id = ?').run(sku, new Date().toISOString(), draft.id);

    const marketplaceId = conn.marketplace_id || 'EBAY_AU';

    // Step 2: Create or update offer
    const offerPayload: Record<string, any> = {
      sku, marketplaceId, format: 'FIXED_PRICE', categoryId,
      merchantLocationKey: conn.merchant_location_key,
      pricingSummary: { price: { value: String(price), currency: 'AUD' } },
      listingPolicies: {
        fulfillmentPolicyId: conn.fulfillment_policy_id,
        paymentPolicyId: conn.payment_policy_id,
        returnPolicyId: conn.return_policy_id,
      },
      availableQuantity: quantity,
      ...(description ? { listingDescription: description } : {}),
    };

    let offerId = draft.ebay_offer_id;

    if (offerId) {
      const offerRes = await fetch(
        `${urls.api}/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`,
        { method: 'PUT', headers: commonHeaders, body: JSON.stringify(offerPayload) }
      );
      if (!offerRes.ok && offerRes.status !== 204) {
        const errData = await offerRes.text();
        logJob({ product_id, ebay_draft_id: draft.id, operation_type: 'update_offer', sku, offer_id: offerId, request_payload: offerPayload, response_payload: errData, status: 'failed', error_message: errData });
        return err(`Offer update failed: ${errData}`);
      }
      logJob({ product_id, ebay_draft_id: draft.id, operation_type: 'update_offer', sku, offer_id: offerId, request_payload: offerPayload, status: 'success' });
    } else {
      const offerRes = await fetch(`${urls.api}/sell/inventory/v1/offer`, {
        method: 'POST', headers: commonHeaders, body: JSON.stringify(offerPayload),
      });
      const offerData = await offerRes.json() as any;
      if (!offerRes.ok) {
        logJob({ product_id, ebay_draft_id: draft.id, operation_type: 'create_offer', sku, request_payload: offerPayload, response_payload: offerData, status: 'failed', error_message: JSON.stringify(offerData) });
        return err(`Offer creation failed: ${JSON.stringify(offerData)}`);
      }
      offerId = offerData.offerId;
      logJob({ product_id, ebay_draft_id: draft.id, operation_type: 'create_offer', sku, offer_id: offerId, request_payload: offerPayload, response_payload: offerData, status: 'success' });
      db.prepare('UPDATE ebay_drafts SET ebay_offer_id = ?, ebay_marketplace_id = ? WHERE id = ?').run(offerId, marketplaceId, draft.id);
    }

    // Step 3: Publish
    const pubRes = await fetch(
      `${urls.api}/sell/inventory/v1/offer/${encodeURIComponent(offerId!)}/publish`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
    const pubData = await pubRes.json() as any;

    if (!pubRes.ok) {
      db.prepare('UPDATE ebay_drafts SET channel_status = ?, ebay_last_error = ?, ebay_last_synced_at = ? WHERE id = ?').run('failed', JSON.stringify(pubData), new Date().toISOString(), draft.id);
      logJob({ product_id, ebay_draft_id: draft.id, operation_type: 'publish_offer', sku, offer_id: offerId, request_payload: { offerId }, response_payload: pubData, status: 'failed', error_message: JSON.stringify(pubData) });
      return err(`Publish failed: ${JSON.stringify(pubData)}`);
    }

    const listingId = pubData.listingId;
    db.prepare('UPDATE ebay_drafts SET channel_status = ?, published_listing_id = ?, ebay_listing_url = ?, ebay_last_synced_at = ?, ebay_last_error = ? WHERE id = ?').run(
      'published', listingId || null, listingId ? `https://www.ebay.com.au/itm/${listingId}` : null, new Date().toISOString(), null, draft.id,
    );

    logJob({ product_id, ebay_draft_id: draft.id, operation_type: 'publish_offer', sku, offer_id: offerId, listing_id: listingId, request_payload: { offerId }, response_payload: pubData, status: 'success' });

    return ok({ success: true, listingId, offerId, sku, listing_url: listingId ? `https://www.ebay.com.au/itm/${listingId}` : null });
  } catch (e: any) {
    return err(e.message ?? String(e));
  }
}

// ─── Low-level exports used by the full publish flow ──────────────────────────

export async function ebayCreateInventoryItem(body: any) {
  try {
    const { sku, product_id, draft_id, title, description, condition_id, brand, mpn, upc, ean, image_urls, aspects, quantity } = body ?? {};
    if (!sku) return err('SKU is required');

    const inventoryItem: Record<string, any> = {
      product: {
        title: title || 'Untitled',
        description: description || '',
        imageUrls: image_urls || [],
        ...(aspects && Object.keys(aspects).length > 0 ? { aspects } : {}),
        ...(brand || mpn ? { aspects: { ...(brand ? { Brand: [brand] } : {}), ...(mpn ? { MPN: [mpn] } : {}) } } : {}),
        ...(upc ? { upc: [upc] } : {}),
        ...(ean ? { ean: [ean] } : {}),
      },
      condition: condition_id || 'NEW',
      availability: { shipToLocationAvailability: { quantity: quantity ?? 1 } },
    };

    const { token } = await getValidToken();
    const conn = getConnectionRow();
    const urls = getEbayBaseUrls(conn.environment || 'production');

    const res = await fetch(
      `${urls.api}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Language': 'en-AU',
        },
        body: JSON.stringify(inventoryItem),
      }
    );

    const responseText = await res.text();
    const responseData = responseText ? JSON.parse(responseText) : {};

    logJob({ product_id, ebay_draft_id: draft_id, operation_type: 'create_inventory_item', sku, request_payload: inventoryItem, response_payload: responseData, status: (res.ok || res.status === 204) ? 'success' : 'failed', error_message: (res.ok || res.status === 204) ? null : JSON.stringify(responseData) });

    if (!res.ok && res.status !== 204) {
      return err(`Create inventory item failed [${res.status}]: ${JSON.stringify(responseData)}`);
    }

    if (draft_id) {
      db.prepare('UPDATE ebay_drafts SET ebay_inventory_sku = ?, ebay_last_synced_at = ?, ebay_last_error = ? WHERE id = ?').run(sku, new Date().toISOString(), null, draft_id);
    }

    return ok({ success: true, sku });
  } catch (e: any) {
    return err(e.message ?? String(e));
  }
}

export async function ebayCreateOffer(body: any) {
  try {
    const { sku, product_id, draft_id, category_id, price, currency, quantity, listing_description, description } = body ?? {};
    if (!sku) return err('SKU required');
    const categoryId = body?.category_id ?? body?.categoryId;
    if (!categoryId) return err('Category ID required');
    if (!price || price <= 0) return err('Price must be > 0');

    const conn = getConnectionRow();
    if (!conn.merchant_location_key) return err('Merchant location key not configured');
    if (!conn.fulfillment_policy_id) return err('Fulfillment policy ID not configured');
    if (!conn.payment_policy_id) return err('Payment policy ID not configured');
    if (!conn.return_policy_id) return err('Return policy ID not configured');

    const { token } = await getValidToken();
    const urls = getEbayBaseUrls(conn.environment || 'production');
    const marketplaceId = body.marketplace_id || conn.marketplace_id || 'EBAY_AU';

    const listingDesc = listing_description || description;

    const offer = {
      sku, marketplaceId, format: 'FIXED_PRICE', categoryId,
      merchantLocationKey: conn.merchant_location_key,
      pricingSummary: { price: { value: String(price), currency: currency || 'AUD' } },
      listingPolicies: {
        fulfillmentPolicyId: conn.fulfillment_policy_id,
        paymentPolicyId: conn.payment_policy_id,
        returnPolicyId: conn.return_policy_id,
      },
      availableQuantity: quantity ?? 1,
      ...(listingDesc ? { listingDescription: listingDesc } : {}),
    };

    const res = await fetch(`${urls.api}/sell/inventory/v1/offer`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Language': 'en-AU',
      },
      body: JSON.stringify(offer),
    });

    const responseData = await res.json();

    logJob({ product_id, ebay_draft_id: draft_id, operation_type: 'create_offer', sku, request_payload: offer, response_payload: responseData, status: res.ok ? 'success' : 'failed', offer_id: responseData.offerId || null, error_message: res.ok ? null : JSON.stringify(responseData) });

    if (!res.ok) return err(`Create offer failed [${res.status}]: ${JSON.stringify(responseData)}`);

    if (draft_id && responseData.offerId) {
      db.prepare('UPDATE ebay_drafts SET ebay_offer_id = ?, ebay_marketplace_id = ?, ebay_last_synced_at = ?, ebay_last_error = ? WHERE id = ?').run(
        responseData.offerId, marketplaceId, new Date().toISOString(), null, draft_id,
      );
    }

    return ok({ success: true, offerId: responseData.offerId });
  } catch (e: any) {
    return err(e.message ?? String(e));
  }
}

export async function ebayUpdateOffer(body: any) {
  try {
    const { offer_id, sku, product_id, draft_id, category_id, price, currency, quantity, listing_description, description } = body ?? {};
    if (!offer_id) return err('Offer ID required');

    const categoryId = body?.category_id ?? body?.categoryId;

    const conn = getConnectionRow();
    const { token } = await getValidToken();
    const urls = getEbayBaseUrls(conn.environment || 'production');
    const marketplaceId = body.marketplace_id || conn.marketplace_id || 'EBAY_AU';

    const listingDesc = listing_description || description;

    const offer = {
      sku, marketplaceId, format: 'FIXED_PRICE', categoryId,
      merchantLocationKey: conn.merchant_location_key,
      pricingSummary: { price: { value: String(price), currency: currency || 'AUD' } },
      listingPolicies: {
        fulfillmentPolicyId: conn.fulfillment_policy_id,
        paymentPolicyId: conn.payment_policy_id,
        returnPolicyId: conn.return_policy_id,
      },
      availableQuantity: quantity ?? 1,
      ...(listingDesc ? { listingDescription: listingDesc } : {}),
    };

    const res = await fetch(
      `${urls.api}/sell/inventory/v1/offer/${encodeURIComponent(offer_id)}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Language': 'en-AU',
        },
        body: JSON.stringify(offer),
      }
    );

    const responseText = await res.text();
    const responseData = responseText ? JSON.parse(responseText) : {};

    logJob({ product_id, ebay_draft_id: draft_id, operation_type: 'update_offer', sku, offer_id, request_payload: offer, response_payload: responseData, status: (res.ok || res.status === 204) ? 'success' : 'failed', error_message: (res.ok || res.status === 204) ? null : JSON.stringify(responseData) });

    if (!res.ok && res.status !== 204) {
      return err(`Update offer failed [${res.status}]: ${JSON.stringify(responseData)}`);
    }

    if (draft_id) {
      db.prepare('UPDATE ebay_drafts SET ebay_last_synced_at = ?, ebay_last_error = ? WHERE id = ?').run(new Date().toISOString(), null, draft_id);
    }

    return ok({ success: true });
  } catch (e: any) {
    return err(e.message ?? String(e));
  }
}

export async function ebayPublishOffer(body: any) {
  try {
    const { offer_id, product_id, draft_id, sku } = body ?? {};
    if (!offer_id) return err('Offer ID required');

    const { token } = await getValidToken();
    const conn = getConnectionRow();
    const urls = getEbayBaseUrls(conn.environment || 'production');

    const res = await fetch(
      `${urls.api}/sell/inventory/v1/offer/${encodeURIComponent(offer_id)}/publish`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      }
    );

    const responseData = await res.json();

    logJob({ product_id, ebay_draft_id: draft_id, operation_type: 'publish_offer', sku, offer_id, listing_id: responseData.listingId || null, request_payload: { offer_id }, response_payload: responseData, status: res.ok ? 'success' : 'failed', error_message: res.ok ? null : JSON.stringify(responseData) });

    if (!res.ok) {
      if (draft_id) {
        db.prepare('UPDATE ebay_drafts SET channel_status = ?, ebay_last_error = ?, ebay_last_synced_at = ? WHERE id = ?').run('failed', JSON.stringify(responseData), new Date().toISOString(), draft_id);
      }
      return err(`Publish failed [${res.status}]: ${JSON.stringify(responseData)}`);
    }

    const listingId = responseData.listingId;
    if (draft_id) {
      db.prepare('UPDATE ebay_drafts SET channel_status = ?, published_listing_id = ?, ebay_listing_url = ?, ebay_last_synced_at = ?, ebay_last_error = ? WHERE id = ?').run(
        'published', listingId || null, listingId ? `https://www.ebay.com.au/itm/${listingId}` : null, new Date().toISOString(), null, draft_id,
      );
    }

    return ok({ success: true, listingId: responseData.listingId });
  } catch (e: any) {
    return err(e.message ?? String(e));
  }
}

export async function ebayGetOffer(body: any) {
  try {
    const { offer_id } = body ?? {};
    if (!offer_id) return err('Offer ID required');

    const { token } = await getValidToken();
    const conn = getConnectionRow();
    const urls = getEbayBaseUrls(conn.environment || 'production');

    const res = await fetch(
      `${urls.api}/sell/inventory/v1/offer/${encodeURIComponent(offer_id)}`,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
    const data = await res.json();
    if (!res.ok) return err(`Get offer failed [${res.status}]: ${JSON.stringify(data)}`);
    return ok({ success: true, offer: data });
  } catch (e: any) {
    return err(e.message ?? String(e));
  }
}

export async function ebayGetInventoryItem(body: any) {
  try {
    const { sku } = body ?? {};
    if (!sku) return err('SKU required');

    const { token } = await getValidToken();
    const conn = getConnectionRow();
    const urls = getEbayBaseUrls(conn.environment || 'production');

    const res = await fetch(
      `${urls.api}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    if (!res.ok && res.status !== 404) return err(`Get inventory item failed [${res.status}]: ${JSON.stringify(data)}`);
    return ok({ success: true, exists: res.ok, item: data });
  } catch (e: any) {
    return err(e.message ?? String(e));
  }
}
