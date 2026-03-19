import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDB, query, db } from './db.js';
import { runMigration } from './migrator.js';
import Database from 'better-sqlite3';
import { generateEnrichment } from './openrouter.js';

// Removed manual __filename/__dirname resolution

initDB();

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
    const resultId = crypto.randomUUID();
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
    // In production, the 'app' folder is in extraResources
    const appDir = path.join(process.resourcesPath, 'app');
    console.log('Loading from:', path.join(appDir, 'index.html'));
    mainWindow.loadFile(path.join(appDir, 'index.html'));
    // Open devtools for debugging
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
