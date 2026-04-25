/**
 * bulk-product-upsert edge function
 *
 * Accepts an array of product rows and upserts them into the products table.
 * Matching strategy: barcode (primary), then sku, then source_product_name.
 * If matched → update non-null incoming fields (fill-blanks or overwrite based on mode).
 * If no match → insert new product.
 *
 * Body: { products: Array<Record<string, any>>, mode: "fill_blanks" | "overwrite" }
 * - fill_blanks: only update fields that are currently null/empty in DB
 * - overwrite: update all fields with incoming non-null values
 *
 * Returns: { inserted: number, updated: number, skipped: number, errors: string[] }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Fields that can be set on the products table
const ALLOWED_FIELDS = new Set([
  "source_product_name", "normalized_product_name", "brand", "manufacturer",
  "barcode", "sku", "supplier_product_code", "supplier_barcode", "upc", "mpn",
  "gtin14", "artg_number", "pbs_item_code", "pack_size", "product_form",
  "strength", "size_value", "flavour", "variant", "unit_of_measure",
  "cost_price", "sell_price", "stock_on_hand", "stock_value", "reorder_level",
  "weight_grams", "height_mm", "width_mm", "length_mm",
  "department", "z_category", "internal_category", "product_type",
  "short_description", "full_description_html", "ingredients_summary",
  "directions_summary", "warnings_summary", "claims_summary",
  "country_of_origin", "storage_requirements", "allergen_information",
  "age_restriction", "shelf_life_notes", "regulatory_notes",
  "scheduled_drug", "artg_inclusion_type", "compliance_status",
  "product_status", "supplier", "tax_class", "lead_time_days",
  "notes_internal", "tags", "key_features",
  "ebay_listed_price", "shopify_listed_price", "ebay_category_id",
  "shopify_collection", "quantity_available_for_ebay",
  "quantity_available_for_shopify", "quantity_reserved_for_store",
]);

function sanitizeRow(row: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    const k = key.trim().toLowerCase();
    if (ALLOWED_FIELDS.has(k) && value !== null && value !== undefined && value !== "") {
      clean[k] = value;
    }
  }
  return clean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const adminSupabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { products: incomingProducts, mode = "fill_blanks" } = await req.json();

    if (!Array.isArray(incomingProducts) || incomingProducts.length === 0) {
      return new Response(JSON.stringify({ error: "products array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (incomingProducts.length > 5000) {
      return new Response(JSON.stringify({ error: "Maximum 5000 products per batch" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Process in chunks of 50
    const CHUNK = 50;
    for (let i = 0; i < incomingProducts.length; i += CHUNK) {
      const chunk = incomingProducts.slice(i, i + CHUNK);

      for (const rawRow of chunk) {
        try {
          const row = sanitizeRow(rawRow);
          if (Object.keys(row).length === 0) {
            skipped++;
            continue;
          }

          // Try to find existing product: barcode → sku → source_product_name
          let existingProduct: Record<string, any> | null = null;

          if (row.barcode) {
            const { data } = await adminSupabase
              .from("products")
              .select("*")
              .eq("barcode", row.barcode)
              .limit(1)
              .maybeSingle();
            existingProduct = data;
          }

          if (!existingProduct && row.sku) {
            const { data } = await adminSupabase
              .from("products")
              .select("*")
              .eq("sku", row.sku)
              .limit(1)
              .maybeSingle();
            existingProduct = data;
          }

          if (!existingProduct && row.source_product_name) {
            const { data } = await adminSupabase
              .from("products")
              .select("*")
              .eq("source_product_name", row.source_product_name)
              .limit(1)
              .maybeSingle();
            existingProduct = data;
          }

          if (existingProduct) {
            // Build update payload based on mode
            const updates: Record<string, any> = {};

            for (const [field, value] of Object.entries(row)) {
              if (mode === "fill_blanks") {
                const existing = existingProduct[field];
                if (existing === null || existing === undefined || existing === "") {
                  updates[field] = value;
                }
              } else {
                // overwrite mode
                updates[field] = value;
              }
            }

            if (Object.keys(updates).length > 0) {
              updates.updated_at = new Date().toISOString();
              updates.last_modified_by = "bulk_import";

              const { error: updateErr } = await adminSupabase
                .from("products")
                .update(updates)
                .eq("id", existingProduct.id);

              if (updateErr) {
                errors.push(`Update failed for ${row.barcode || row.sku || row.source_product_name}: ${updateErr.message}`);
              } else {
                updated++;
              }
            } else {
              skipped++;
            }
          } else {
            // Insert new product
            row.created_at = new Date().toISOString();
            row.updated_at = new Date().toISOString();
            row.last_modified_by = "bulk_import";
            row.product_status = row.product_status || "active";
            row.compliance_status = row.compliance_status || "pending";

            const { error: insertErr } = await adminSupabase
              .from("products")
              .insert(row);

            if (insertErr) {
              errors.push(`Insert failed for ${row.barcode || row.sku || row.source_product_name}: ${insertErr.message}`);
            } else {
              inserted++;
            }
          }
        } catch (rowErr) {
          errors.push(`Row error: ${rowErr instanceof Error ? rowErr.message : "Unknown"}`);
        }
      }
    }

    console.log(`[bulk-upsert] Done: ${inserted} inserted, ${updated} updated, ${skipped} skipped, ${errors.length} errors`);

    return new Response(
      JSON.stringify({ success: true, inserted, updated, skipped, errors: errors.slice(0, 50) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[bulk-upsert] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
