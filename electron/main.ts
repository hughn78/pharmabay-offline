import { app, protocol, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'node:crypto';
import { initDB, query, db } from './db.js';
import { runMigration } from './migrator.js';
import Database from 'better-sqlite3';
import { generateEnrichment } from './openrouter.js';
import { ShopifyAdminClient, normalizeKey } from './shopify.js';
import { createBackup, shouldRunStartupBackup } from './db-backup.js';
import { setupAutoUpdater, checkForUpdates } from './update-check.js';
import {
  ebayGetAuthUrl,
  ebayExchangeCode,
  ebayRefreshToken,
  ebayTestConnection,
  ebaySaveSettings,
  ebayGetStatus,
  ebayFetchCategories,
  ebayPublishProduct,
  ebayCreateInventoryItem,
  ebayCreateOffer,
  ebayUpdateOffer,
  ebayPublishOffer,
  ebayGetOffer,
  ebayGetInventoryItem,
} from './ebay.js';

// ─── Custom protocol for BrowserRouter (must be registered before app.whenReady) ──
app.whenReady().then(() => {
  protocol.registerFileProtocol('pharmabay', (request, callback) => {
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname);
    const filePath = path.join(process.resourcesPath, 'app', pathname.replace(/^\//, '') || 'index.html');
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      callback({ path: filePath });
    } else {
      // Fallback to index.html for SPA routes (404 → index.html)
      callback({ path: path.join(process.resourcesPath, 'app', 'index.html') });
    }
  });
});

ipcMain.handle('db-query', async (event, sql, params) => {
  try {
    const result = query(sql, params);
    return { data: result, error: null };
  } catch (error: any) {
    console.error('DB Error:', error);
    return { data: null, error: error.message };
  }
});

ipcMain.handle('migrate-data', async (event, url, key) => {
  try {
    const res = await runMigration(url, key);
    return { data: res, error: null };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
});

// AI Enrichment via OpenRouter
ipcMain.handle('ai-generate-description', async (event, body: any) => {
  try {
    const productId = body?.product_id;
    if (!productId) throw new Error('product_id is required');

    // Fetch product from local DB
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as any;
    if (!product) throw new Error(`Product ${productId} not found`);

    const generated = await generateEnrichment(product);
    return { data: { generated }, error: null };
  } catch (err: any) {
    console.error('AI enrichment error:', err);
    return { data: null, error: { message: err.message } };
  }
});

ipcMain.handle('market-research', async (event, body: any) => {
  try {
    const queueItemId = body?.queueItemId;
    if (!queueItemId) throw new Error('queueItemId is required');

    // Get queue item and product
    const queueItem = db.prepare('SELECT * FROM product_research_queue WHERE id = ?').get(queueItemId) as any;
    if (!queueItem) throw new Error(`Queue item ${queueItemId} not found`);

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(queueItem.product_id) as any;
    if (!product) throw new Error(`Product ${queueItem.product_id} not found`);

    // Update queue item status to processing
    db.prepare('UPDATE product_research_queue SET status = ? WHERE id = ?').run('processing', queueItemId);

    const generated = await generateEnrichment(product);

    // Update product with enrichment data
    const now = new Date().toISOString();
    const updates: Record<string, any> = {
      enrichment_status: 'complete',
      enrichment_confidence: 'high',
      enrichment_summary: JSON.stringify(generated),
      updated_at: now,
    };
    if (generated.normalized_product_name) updates.normalized_product_name = generated.normalized_product_name;
    if (generated.brand) updates.brand = generated.brand;
    if (generated.product_type) updates.product_type = generated.product_type;
    if (generated.product_form) updates.product_form = generated.product_form;
    if (generated.ingredients_summary) updates.ingredients_summary = generated.ingredients_summary;
    if (generated.directions_summary) updates.directions_summary = generated.directions_summary;
    if (generated.warnings_summary) updates.warnings_summary = generated.warnings_summary;
    if (generated.claims_summary) updates.claims_summary = generated.claims_summary;

    const setClauses = Object.keys(updates).map(k => `"${k}" = ?`).join(', ');
    const values = Object.values(updates);
    db.prepare(`UPDATE products SET ${setClauses} WHERE id = ?`).run(...values, product.id);

    // Save research result
    const resultId = randomUUID();
    db.prepare(`INSERT OR REPLACE INTO product_research_results 
      (id, product_id, research_run_id, source_domain, extracted_payload, confidence_score, fields_found, auto_filled_fields, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      resultId, product.id, queueItem.research_run_id,
      'openrouter.ai', JSON.stringify({ fields: generated }),
      0.85, JSON.stringify(Object.keys(generated)),
      JSON.stringify(Object.keys(updates)), now
    );

    // Update queue item status to completed
    db.prepare('UPDATE product_research_queue SET status = ? WHERE id = ?').run('completed', queueItemId);

    return { data: { success: true }, error: null };
  } catch (err: any) {
    console.error('Market research error:', err);
    // Update queue item to failed
    if (body?.queueItemId) {
      try {
        db.prepare('UPDATE product_research_queue SET status = ?, error_message = ? WHERE id = ?')
          .run('failed', err.message, body.queueItemId);
      } catch { }
    }
    return { data: null, error: { message: err.message } };
  }
});

// Settings getter/setter
ipcMain.handle('get-setting', async (event, key: string) => {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
    return { data: row?.value || null, error: null };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
});

ipcMain.handle('set-setting', async (event, key: string, value: string) => {
  try {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
    return { data: true, error: null };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
});

// ─── Shopify Admin API IPC handlers ─────────────────────────────────────────

ipcMain.handle('shopify-test-auth', async () => {
  try {
    const client = new ShopifyAdminClient();
    await client.ensureToken(true);
    const res = await client.request('GET', '/products.json?limit=1');
    const data = await res.json() as any;
    return { data: { ok: true, sampleProductCount: data.products?.length ?? 0 }, error: null };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
});

ipcMain.handle('shopify-get-locations', async () => {
  try {
    const client = new ShopifyAdminClient();
    const locations = await client.fetchLocations();
    return { data: locations, error: null };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
});

ipcMain.handle('shopify-refresh-products', async () => {
  try {
    const client = new ShopifyAdminClient();
    const products = await client.fetchAllProducts();

    const insert = db.prepare(`
      INSERT OR REPLACE INTO shopify_products_cache
        (id, shopify_product_id, shopify_variant_id, title, handle, status, vendor,
         product_type, sku, barcode, price, inventory_item_id, inventory_quantity,
         variant_title, body_html, tags, cached_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    const cacheAll = db.transaction((prods: any[]) => {
      db.prepare('DELETE FROM shopify_products_cache').run();
      for (const product of prods) {
        for (const variant of (product.variants ?? [])) {
          insert.run(
            `${product.id}-${variant.id}`,
            product.id, variant.id,
            product.title, product.handle, product.status,
            product.vendor, product.product_type,
            variant.sku ?? '', variant.barcode ?? '', variant.price ?? '',
            variant.inventory_item_id, variant.inventory_quantity ?? 0,
            variant.title,
            product.body_html ?? '',
            Array.isArray(product.tags) ? product.tags.join(',') : (product.tags ?? ''),
            now,
          );
        }
      }
    });

    cacheAll(products);
    const totalVariants = products.reduce((sum: number, p: any) => sum + (p.variants?.length ?? 0), 0);
    return { data: { refreshed: products.length, variants: totalVariants, apiCalls: client.apiCallCount }, error: null };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
});

ipcMain.handle('shopify-sync-preview', async () => {
  try {
    const cacheCount = (db.prepare('SELECT COUNT(*) as n FROM shopify_products_cache').get() as any).n;
    if (cacheCount === 0) {
      throw new Error('Shopify product cache is empty — click "Refresh Shopify" first.');
    }

    const reserveBuffer = parseInt((db.prepare("SELECT value FROM settings WHERE key='shopify_reserve_buffer'").get() as any)?.value ?? '0') || 0;
    const syncMode = (db.prepare("SELECT value FROM settings WHERE key='shopify_inventory_sync_mode'").get() as any)?.value ?? 'stock_minus_buffer';
    const maxQtyCapRow = (db.prepare("SELECT value FROM settings WHERE key='shopify_max_qty_cap'").get() as any)?.value;
    const maxQtyCap = maxQtyCapRow ? parseInt(maxQtyCapRow) : null;
    const syncZeroStock = (db.prepare("SELECT value FROM settings WHERE key='shopify_sync_zero_stock'").get() as any)?.value === 'true';

    const localProducts = db.prepare('SELECT * FROM products').all() as any[];
    const shopifyCache = db.prepare('SELECT * FROM shopify_products_cache').all() as any[];

    // Build lookup indexes
    const skuIndex = new Map<string, any>();
    const barcodeIndex = new Map<string, any>();
    for (const item of shopifyCache) {
      const sku = normalizeKey(item.sku);
      const barcode = normalizeKey(item.barcode);
      if (sku) skuIndex.set(sku, item);
      if (barcode) barcodeIndex.set(barcode, item);
    }

    const runId = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO stock_sync_runs (id, started_at, status, reserve_buffer, inventory_sync_mode, max_qty_cap)
       VALUES (?, ?, 'preview_complete', ?, ?, ?)`
    ).run(runId, now, reserveBuffer, syncMode, maxQtyCap);

    const insertItem = db.prepare(`
      INSERT INTO stock_sync_items
        (id, sync_run_id, local_product_id, local_product_name, local_barcode, local_sku,
         local_stock_on_hand, quantity_to_push, shopify_product_id, shopify_variant_id,
         shopify_inventory_item_id, shopify_product_title, shopify_variant_title,
         current_shopify_qty, qty_difference, match_type, match_confidence, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let matched = 0, updateNeeded = 0, noMatch = 0;

    const process = db.transaction(() => {
      for (const product of localProducts) {
        const sku = normalizeKey(product.sku);
        const barcode = normalizeKey(product.barcode);

        let shopifyItem: any = null;
        let matchType = 'none';

        if (sku && skuIndex.has(sku)) {
          shopifyItem = skuIndex.get(sku);
          matchType = 'sku';
        } else if (barcode && barcodeIndex.has(barcode)) {
          shopifyItem = barcodeIndex.get(barcode);
          matchType = 'barcode';
        }

        const stock = Math.max(0, product.stock_on_hand ?? 0);
        let quantityToPush: number | null = null;
        let syncStatus = 'no_match';

        if (shopifyItem) {
          let qty = Math.max(0, stock - reserveBuffer);
          if (maxQtyCap !== null && qty > maxQtyCap) qty = maxQtyCap;

          if (!syncZeroStock && qty === 0) {
            syncStatus = 'skipped_zero';
            quantityToPush = 0;
          } else {
            quantityToPush = qty;
            const currentQty = shopifyItem.inventory_quantity ?? 0;
            syncStatus = qty !== currentQty ? 'update_needed' : 'matched_no_change';
          }

          if (syncStatus === 'update_needed') updateNeeded++;
          else matched++;
        } else {
          noMatch++;
        }

        const qtyDiff = shopifyItem != null ? (quantityToPush ?? 0) - (shopifyItem.inventory_quantity ?? 0) : null;

        insertItem.run(
          randomUUID(), runId,
          product.id,
          product.source_product_name ?? product.normalized_product_name ?? '',
          product.barcode ?? '', product.sku ?? '',
          stock, quantityToPush,
          shopifyItem?.shopify_product_id ?? null,
          shopifyItem?.shopify_variant_id ?? null,
          shopifyItem?.inventory_item_id ?? null,
          shopifyItem?.title ?? null,
          shopifyItem?.variant_title ?? null,
          shopifyItem?.inventory_quantity ?? null,
          qtyDiff,
          matchType,
          shopifyItem ? 'high' : 'none',
          syncStatus,
        );
      }
    });

    process();

    db.prepare(
      `UPDATE stock_sync_runs SET total_items=?, matched=?, update_needed=?, no_match=? WHERE id=?`
    ).run(localProducts.length, matched, updateNeeded, noMatch, runId);

    return {
      data: { sync_run_id: runId, total: localProducts.length, matched, update_needed: updateNeeded, no_match: noMatch },
      error: null,
    };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
});

ipcMain.handle('shopify-sync-execute', async (event, body: any) => {
  try {
    const { action, sync_run_id, selected_item_ids } = body ?? {};
    const locationId = (db.prepare("SELECT value FROM settings WHERE key='shopify_location_id'").get() as any)?.value ?? '';
    if (!locationId) throw new Error('Location ID not set in Settings.');

    const client = new ShopifyAdminClient();

    let itemsToSync: any[];
    if (action === 'sync_selected' && Array.isArray(selected_item_ids) && selected_item_ids.length > 0) {
      const placeholders = selected_item_ids.map(() => '?').join(',');
      itemsToSync = db.prepare(
        `SELECT * FROM stock_sync_items WHERE id IN (${placeholders}) AND sync_status = 'update_needed'`
      ).all(...selected_item_ids) as any[];
    } else {
      itemsToSync = db.prepare(
        `SELECT * FROM stock_sync_items WHERE sync_run_id = ? AND sync_status = 'update_needed'`
      ).all(sync_run_id) as any[];
    }

    let synced = 0, failed = 0;
    for (const item of itemsToSync) {
      try {
        if (!item.shopify_inventory_item_id) throw new Error('No inventory_item_id for this variant');
        await client.setInventory(locationId, item.shopify_inventory_item_id, item.quantity_to_push);
        db.prepare(
          `UPDATE stock_sync_items SET sync_status='sync_success', synced_at=? WHERE id=?`
        ).run(new Date().toISOString(), item.id);
        synced++;
      } catch (err: any) {
        db.prepare(
          `UPDATE stock_sync_items SET sync_status='sync_failed', error_message=? WHERE id=?`
        ).run(err.message, item.id);
        failed++;
      }
    }

    if (sync_run_id) {
      db.prepare(
        `UPDATE stock_sync_runs SET synced = synced + ?, failed = failed + ?, status = 'sync_complete' WHERE id = ?`
      ).run(synced, failed, sync_run_id);
    }

    return { data: { synced, failed, apiCalls: client.apiCallCount }, error: null };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
});

// ─── eBay OAuth & API IPC handlers ──────────────────────────────────────────

ipcMain.handle('ebay-get-auth-url', async () => {
  try {
    const result = await ebayGetAuthUrl();
    if (result.success) {
      return { data: result.data, error: null };
    }
    return { data: null, error: (result as any).error };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
});

ipcMain.handle('ebay-exchange-code', async (event, code: string) => {
  try {
    const result = await ebayExchangeCode(code);
    if (result.success) {
      return { data: result.data, error: null };
    }
    return { data: null, error: (result as any).error };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
});

ipcMain.handle('ebay-refresh-token', async () => {
  try {
    const result = await ebayRefreshToken();
    if (result.success) {
      return { data: result.data, error: null };
    }
    return { data: null, error: (result as any).error };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
});

ipcMain.handle('ebay-test-connection', async () => {
  try {
    const result = await ebayTestConnection();
    if (result.success) {
      return { data: result.data, error: null };
    }
    return { data: null, error: (result as any).error };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
});

ipcMain.handle('ebay-save-settings', async (event, settings: Record<string, any>) => {
  try {
    const result = await ebaySaveSettings(settings);
    if (result.success) {
      return { data: result.data, error: null };
    }
    return { data: null, error: (result as any).error };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
});

ipcMain.handle('ebay-get-status', async () => {
  try {
    const result = await ebayGetStatus();
    if (result.success) {
      return { data: result.data, error: null };
    }
    return { data: null, error: (result as any).error };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
});

ipcMain.handle('ebay-fetch-categories', async () => {
  try {
    const result = await ebayFetchCategories();
    if (result.success) {
      return { data: result.data, error: null };
    }
    return { data: null, error: (result as any).error };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
});

ipcMain.handle('ebay-publish-product', async (event, body: any) => {
  try {
    const result = await ebayPublishProduct(body);
    if (result.success) {
      return { data: result.data, error: null };
    }
    return { data: null, error: (result as any).error };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
});

ipcMain.handle('ebay-create-inventory-item', async (event, body: any) => {
  try {
    const result = await ebayCreateInventoryItem(body);
    if (result.success) {
      return { data: result.data, error: null };
    }
    return { data: null, error: (result as any).error };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
});

ipcMain.handle('ebay-create-offer', async (event, body: any) => {
  try {
    const result = await ebayCreateOffer(body);
    if (result.success) {
      return { data: result.data, error: null };
    }
    return { data: null, error: (result as any).error };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
});

ipcMain.handle('ebay-update-offer', async (event, body: any) => {
  try {
    const result = await ebayUpdateOffer(body);
    if (result.success) {
      return { data: result.data, error: null };
    }
    return { data: null, error: (result as any).error };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
});

ipcMain.handle('ebay-publish-offer', async (event, body: any) => {
  try {
    const result = await ebayPublishOffer(body);
    if (result.success) {
      return { data: result.data, error: null };
    }
    return { data: null, error: (result as any).error };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
});

ipcMain.handle('ebay-get-offer', async (event, body: any) => {
  try {
    const result = await ebayGetOffer(body);
    if (result.success) {
      return { data: result.data, error: null };
    }
    return { data: null, error: (result as any).error };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
});

ipcMain.handle('ebay-get-inventory-item', async (event, body: any) => {
  try {
    const result = await ebayGetInventoryItem(body);
    if (result.success) {
      return { data: result.data, error: null };
    }
    return { data: null, error: (result as any).error };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
});

// ─── File / SQLite import ────────────────────────────────────────────────────

ipcMain.handle('pick-sqlite-file', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select SQLite Database to Import',
    filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'sqlite3', 'db'] }],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return { data: null, error: null };
  return { data: result.filePaths[0], error: null };
});

ipcMain.handle('import-sqlite', async (event, filePath: string) => {
  try {
    const sourceDb = new Database(filePath, { readonly: true });
    const localDb = db;

    // Get all table names from the source database
    const tables = sourceDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all().map((r: any) => r.name);

    let totalImported = 0;

    for (const tableName of tables) {
      // Check if the table exists in local DB
      const localTable = localDb.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      ).get(tableName);
      if (!localTable) {
        console.log(`Skipping table '${tableName}' — does not exist in local DB`);
        continue;
      }

      const rows = sourceDb.prepare(`SELECT * FROM "${tableName}"`).all();
      if (rows.length === 0) continue;

      // Get column names from the source data
      const sourceColumns = Object.keys(rows[0]);

      // Get column names from local table
      const localColumns = localDb.pragma(`table_info("${tableName}")`).map((c: any) => c.name);
      const localColumnSet = new Set(localColumns);

      // Only insert columns that exist in both source and local
      const commonColumns = sourceColumns.filter((c: string) => localColumnSet.has(c));
      if (commonColumns.length === 0) continue;

      const placeholders = commonColumns.map(() => '?').join(', ');
      const columnList = commonColumns.map((c: string) => `"${c}"`).join(', ');

      const insertStmt = localDb.prepare(
        `INSERT OR REPLACE INTO "${tableName}" (${columnList}) VALUES (${placeholders})`
      );

      const insertMany = localDb.transaction((rows: any[]) => {
        for (const row of rows) {
          const values = commonColumns.map((c: string) => {
            const val = row[c];
            // Convert objects/arrays to JSON strings for SQLite
            if (val !== null && typeof val === 'object') return JSON.stringify(val);
            return val;
          });
          insertStmt.run(...values);
        }
      });

      insertMany(rows);
      totalImported += rows.length;
      console.log(`Imported ${rows.length} rows into '${tableName}'`);
    }

    sourceDb.close();
    return { data: { message: `Imported ${totalImported} rows from ${tables.length} tables` }, error: null };
  } catch (err: any) {
    console.error('Import error:', err);
    return { data: null, error: err.message };
  }
});

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(app.getAppPath(), 'dist-electron', 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer] ${message} (line: ${line}, source: ${sourceId})`);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    // BrowserRouter requires a proper origin: use a custom protocol mapped to the extraResources "app" dir.
    const safeOrigin = 'pharmabay:app';
    const appDir = path.join(process.resourcesPath, 'app');
    console.log('Loading from:', `${safeOrigin}/index.html`, '(dir:', appDir + ')');
    mainWindow.loadURL(`${safeOrigin}/index.html`);
    // Open devtools for debugging in development
    if (process.env.NODE_ENV === 'development') {
      mainWindow.webContents.openDevTools();
    }
  }
}

app.whenReady().then(() => {
  // Initialize database here to safely use app.getPath('userData')
  initDB();

  // Run a startup backup once per day
  if (shouldRunStartupBackup(app.getPath('userData'))) {
    try {
      createBackup(db);
    } catch (err: any) {
      console.error('[backup] Startup backup failed:', err.message);
    }
  }

  setupAutoUpdater();
  createWindow();

  // Defer update check so window is visible when dialog appears
  setTimeout(() => checkForUpdates(), 3000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Take a final backup before quitting
    try {
      if (db) createBackup(db);
    } catch (err: any) {
      console.error('[backup] Quit backup failed:', err.message);
    }
    app.quit();
  }
});
