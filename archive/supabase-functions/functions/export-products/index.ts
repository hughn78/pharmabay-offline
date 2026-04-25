import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Columns to export in order
const COLUMNS = [
  "id", "barcode", "sku", "source_product_name", "normalized_product_name",
  "brand", "manufacturer", "supplier", "department", "z_category", "internal_category",
  "product_type", "product_form", "strength", "pack_size", "size_value", "flavour", "variant",
  "cost_price", "sell_price", "ebay_listed_price", "shopify_listed_price",
  "gross_profit_percent", "stock_on_hand", "stock_value",
  "quantity_available_for_ebay", "quantity_available_for_shopify", "quantity_reserved_for_store",
  "units_sold_12m", "units_purchased_12m", "total_sales_value_12m", "total_cogs_12m",
  "weight_grams", "length_mm", "width_mm", "height_mm",
  "country_of_origin", "mpn", "upc", "gtin14",
  "short_description", "key_features", "tags",
  "compliance_status", "scheduled_drug", "requires_prescription",
  "pbs_listed", "ndss_product", "artg_number",
  "enrichment_status", "enrichment_confidence",
  "product_status", "tax_class",
  "created_at", "updated_at",
];

function escapeCSV(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (typeof val === "object") {
    const s = JSON.stringify(val);
    return `"${s.replace(/"/g, '""')}"`;
  }
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
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

    const url = new URL(req.url);
    const format = url.searchParams.get("format") || "csv";

    // Fetch all products paginated
    let allProducts: Record<string, unknown>[] = [];
    let from = 0;
    const PAGE_SIZE = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("source_product_name")
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;
      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        allProducts = allProducts.concat(data);
        from += PAGE_SIZE;
        if (data.length < PAGE_SIZE) hasMore = false;
      }
    }

    // Filter columns to only those that exist
    const sampleRow = allProducts[0] || {};
    const availableCols = COLUMNS.filter((c) => c in sampleRow);

    // Build CSV
    const csvLines: string[] = [];
    csvLines.push(availableCols.join(","));
    for (const row of allProducts) {
      csvLines.push(availableCols.map((col) => escapeCSV(row[col])).join(","));
    }
    const csvContent = csvLines.join("\n");

    const dateStr = new Date().toISOString().slice(0, 10);

    if (format === "xlsx") {
      // For XLSX we return a tab-separated format with xlsx content type
      // The client will use the SheetJS library already installed to convert
      return new Response(JSON.stringify({ columns: availableCols, rows: allProducts, count: allProducts.length }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    // CSV response
    const encoder = new TextEncoder();
    return new Response(encoder.encode(csvContent), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="products_export_${dateStr}.csv"`,
      },
    });
  } catch (err: any) {
    console.error("Product export error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
