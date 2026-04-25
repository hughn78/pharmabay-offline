import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
  "product_enrichment_summary",
  "market_research_runs",
  "product_research_queue",
  "product_research_results",
  "pricebook_import_runs",
  "product_import_conflicts",
  "stock_sync_runs",
  "stock_sync_items",
];

function escapeSQL(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (typeof val === "number") return String(val);
  if (typeof val === "object") {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

function inferPgType(key: string, sampleVal: unknown): string {
  if (key === "id") return "uuid PRIMARY KEY DEFAULT gen_random_uuid()";
  if (key.endsWith("_id") || key === "user_id") return "uuid";
  if (key.endsWith("_at") || key.includes("date")) return "timestamptz";
  if (typeof sampleVal === "boolean") return "boolean";
  if (typeof sampleVal === "number") {
    return Number.isInteger(sampleVal) ? "integer" : "numeric";
  }
  if (typeof sampleVal === "object" && sampleVal !== null) {
    if (Array.isArray(sampleVal)) return "text[]";
    return "jsonb";
  }
  return "text";
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

    const lines: string[] = [];
    lines.push("-- PharmaBay Database Export");
    lines.push(`-- Generated: ${new Date().toISOString()}`);
    lines.push(`-- Exported by: ${user.email || user.id}`);
    lines.push("");
    lines.push("BEGIN;");
    lines.push("");

    const uniqueTables = [...new Set(TABLES)];
    const exportedTables: string[] = [];
    const skippedTables: string[] = [];

    for (const tableName of uniqueTables) {
      try {
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

        // CREATE TABLE
        lines.push(`-- Table: ${tableName} (${allRows.length} rows)`);
        lines.push(`DROP TABLE IF EXISTS "${tableName}" CASCADE;`);

        if (allRows.length === 0) {
          lines.push(`CREATE TABLE "${tableName}" (id uuid PRIMARY KEY DEFAULT gen_random_uuid());`);
        } else {
          const columns = Object.keys(allRows[0]);
          const colDefs = columns.map((col) => {
            const sampleVal = allRows.find((r) => r[col] !== null)?.[col];
            const pgType = inferPgType(col, sampleVal);
            return `  "${col}" ${pgType}`;
          });
          lines.push(`CREATE TABLE "${tableName}" (`);
          lines.push(colDefs.join(",\n"));
          lines.push(`);`);

          // INSERT rows
          const colNames = columns.map((c) => `"${c}"`).join(", ");
          for (const row of allRows) {
            const values = columns.map((col) => escapeSQL(row[col])).join(", ");
            lines.push(`INSERT INTO "${tableName}" (${colNames}) VALUES (${values});`);
          }
        }

        lines.push("");
        exportedTables.push(tableName);
      } catch (err: any) {
        lines.push(`-- SKIPPED ${tableName}: ${err.message}`);
        lines.push("");
        skippedTables.push(tableName);
      }
    }

    lines.push("COMMIT;");
    lines.push("");
    lines.push(`-- Tables exported: ${exportedTables.join(", ")}`);
    if (skippedTables.length > 0) {
      lines.push(`-- Tables skipped: ${skippedTables.join(", ")}`);
    }

    const sqlContent = lines.join("\n");
    const encoder = new TextEncoder();
    const bytes = encoder.encode(sqlContent);

    const filename = `pharmabay_dump_${new Date().toISOString().slice(0, 10)}.sql`;

    return new Response(bytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/sql",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error("SQL dump error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
