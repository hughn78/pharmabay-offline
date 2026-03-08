import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DB } from "https://deno.land/x/sqlite@v3.9.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// All public tables to export
const TABLES = [
  "products",
  "product_images",
  "ebay_drafts",
  "shopify_drafts",
  "shopify_variants",
  "ebay_live_listings",
  "shopify_live_products",
  "import_batches",
  "inventory_snapshots",
  "export_batches",
  "change_log",
  "compliance_rules",
  "category_mappings",
  "app_settings",
  "ebay_categories",
  "shopify_categories",
  "channel_listing_import_batches",
  "channel_listing_matches",
  "enrichment_runs",
  "ebay_connections",
  "shopify_connections",
  "ebay_publish_jobs",
  "shopify_products",
  "shopify_media",
  "shopify_sync_runs",
  "shopify_write_jobs",
  "shopify_live_products",
];

// Map Postgres types to SQLite types
function pgToSqliteType(pgType: string): string {
  if (pgType.includes("int")) return "INTEGER";
  if (pgType.includes("numeric") || pgType.includes("float") || pgType.includes("double") || pgType.includes("decimal")) return "REAL";
  if (pgType.includes("bool")) return "INTEGER";
  if (pgType.includes("json")) return "TEXT";
  if (pgType.includes("uuid")) return "TEXT";
  if (pgType.includes("timestamp") || pgType.includes("date")) return "TEXT";
  if (pgType.includes("ARRAY")) return "TEXT";
  return "TEXT";
}

function sanitizeValue(val: unknown): string | number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "boolean") return val ? 1 : 0;
  if (typeof val === "number") return val;
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
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

    // Create in-memory SQLite database
    const db = new DB();

    const exportedTables: string[] = [];
    const skippedTables: string[] = [];

    // De-duplicate table list
    const uniqueTables = [...new Set(TABLES)];

    for (const tableName of uniqueTables) {
      try {
        // Fetch all rows (paginated to handle >1000)
        let allRows: Record<string, unknown>[] = [];
        let from = 0;
        const PAGE_SIZE = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from(tableName)
            .select("*")
            .range(from, from + PAGE_SIZE - 1);

          if (error) throw error;
          if (!data || data.length === 0) {
            hasMore = false;
          } else {
            allRows = allRows.concat(data);
            from += PAGE_SIZE;
            if (data.length < PAGE_SIZE) hasMore = false;
          }
        }

        if (allRows.length === 0) {
          // Create empty table with id column at minimum
          db.execute(`CREATE TABLE IF NOT EXISTS "${tableName}" (id TEXT PRIMARY KEY)`);
          exportedTables.push(tableName);
          continue;
        }

        // Infer columns from first row
        const columns = Object.keys(allRows[0]);
        const colDefs = columns.map((col) => {
          const sampleVal = allRows.find((r) => r[col] !== null)?.[col];
          let sqliteType = "TEXT";
          if (typeof sampleVal === "number") {
            sqliteType = Number.isInteger(sampleVal) ? "INTEGER" : "REAL";
          } else if (typeof sampleVal === "boolean") {
            sqliteType = "INTEGER";
          }
          const pk = col === "id" ? " PRIMARY KEY" : "";
          return `"${col}" ${sqliteType}${pk}`;
        });

        db.execute(`CREATE TABLE IF NOT EXISTS "${tableName}" (${colDefs.join(", ")})`);

        // Insert rows in batches
        const placeholders = columns.map(() => "?").join(", ");
        const insertSql = `INSERT INTO "${tableName}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})`;

        db.execute("BEGIN TRANSACTION");
        for (const row of allRows) {
          const values = columns.map((col) => sanitizeValue(row[col]));
          db.query(insertSql, values);
        }
        db.execute("COMMIT");

        exportedTables.push(tableName);
      } catch (err: any) {
        console.error(`Failed to export ${tableName}:`, err.message);
        skippedTables.push(tableName);
      }
    }

    // Add metadata table
    db.execute(`CREATE TABLE _export_metadata (key TEXT PRIMARY KEY, value TEXT)`);
    db.query(`INSERT INTO _export_metadata VALUES (?, ?)`, ["exported_at", new Date().toISOString()]);
    db.query(`INSERT INTO _export_metadata VALUES (?, ?)`, ["exported_by", user.email || user.id]);
    db.query(`INSERT INTO _export_metadata VALUES (?, ?)`, ["tables_exported", exportedTables.join(",")]);
    db.query(`INSERT INTO _export_metadata VALUES (?, ?)`, ["tables_skipped", skippedTables.join(",")]);

    // Serialize to bytes
    const bytes = db.serialize();
    db.close();

    const filename = `pharmabay_export_${new Date().toISOString().slice(0, 10)}.sqlite`;

    return new Response(bytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/x-sqlite3",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error("Export error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
