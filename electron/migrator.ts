import Database from 'better-sqlite3';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { app } from 'electron';

export async function runMigration(supabaseUrl: string, supabaseKey: string) {
  const dbPath = path.join(app.getPath('userData'), 'pharmabay.sqlite');
  const db = new Database(dbPath);

  const supabase = createClient(supabaseUrl, supabaseKey);

  const tables = [
    'products',
    'inventory_snapshots',
    'import_batches',
    'product_images',
    'ebay_drafts',
    'ebay_publish_jobs',
    'shopify_drafts',
    'shopify_variants',
    'shopify_connections',
    'shopify_sync_runs',
    'shopify_products',
    'shopify_media',
    'shopify_write_jobs',
    'export_batches',
    'ebay_categories',
    'shopify_categories',
    'category_mappings',
    'compliance_rules'
  ];

  for (const table of tables) {
    try {
      let allRows: any[] = [];
      let page = 0;
      const limit = 1000;
      
      while (true) {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .range(page * limit, (page + 1) * limit - 1);
          
        if (error) throw error;
        if (!data || data.length === 0) break;
        
        allRows.push(...data);
        if (data.length < limit) break;
        page++;
      }

      if (allRows.length > 0) {
        const keys = Object.keys(allRows[0]);
        const placeholders = keys.map(() => '?').join(', ');
        
        const stmt = db.prepare(`INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`);
        const insertMany = db.transaction((rows) => {
          for (const row of rows) {
            const values = keys.map(k => typeof row[k] === 'object' && row[k] !== null ? JSON.stringify(row[k]) : row[k] ?? null);
            stmt.run(values);
          }
        });
        
        insertMany(allRows);
      }
    } catch (err: any) {
      console.error(`Failed to migrate table ${table}:`, err.message);
    }
  }

  return { success: true, message: 'Migration completed.' };
}
