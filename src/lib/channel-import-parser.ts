import Papa from "papaparse";

// ── eBay column map: CSV header → DB column ──
const EBAY_COLUMN_MAP: Record<string, string> = {
  "Item number": "ebay_item_number",
  "Title": "title",
  "Variation details": "variation_details",
  "Custom label (SKU)": "custom_label_sku",
  "Available quantity": "available_quantity",
  "Format": "format",
  "Currency": "currency",
  "Start price": "start_price",
  "Auction Buy It Now price": "auction_buy_it_now_price",
  "Reserve price": "reserve_price",
  "Current price": "current_price",
  "Sold quantity": "sold_quantity",
  "Watchers": "watchers",
  "Bids": "bids",
  "Start date": "start_date",
  "End date": "end_date",
  "eBay category 1 name": "ebay_category_1_name",
  "eBay category 1 number": "ebay_category_1_number",
  "eBay category 2 name": "ebay_category_2_name",
  "eBay category 2 number": "ebay_category_2_number",
  "Condition": "condition",
  "CD:Professional Grader - (ID: 27501)": "cd_professional_grader",
  "CD:Grade - (ID: 27502)": "cd_grade",
  "CDA:Certification Number - (ID: 27503)": "cda_certification_number",
  "CD:Card Condition - (ID: 40001)": "cd_card_condition",
  "eBay Product ID(ePID)": "ebay_product_id_epid",
  "Listing site": "listing_site",
  "P:UPC": "upc",
  "P:EAN": "ean",
  "P:ISBN": "isbn",
};

// ── Shopify column map: CSV header → DB column ──
const SHOPIFY_COLUMN_MAP: Record<string, string> = {
  "Handle": "handle",
  "Title": "title",
  "Body (HTML)": "body_html",
  "Vendor": "vendor",
  "Product Category": "product_category",
  "Type": "type",
  "Tags": "tags",
  "Published": "published",
  "Option1 Name": "option1_name",
  "Option1 Value": "option1_value",
  "Option1 Linked To": "option1_linked_to",
  "Option2 Name": "option2_name",
  "Option2 Value": "option2_value",
  "Option2 Linked To": "option2_linked_to",
  "Option3 Name": "option3_name",
  "Option3 Value": "option3_value",
  "Option3 Linked To": "option3_linked_to",
  "Variant SKU": "variant_sku",
  "Variant Grams": "variant_grams",
  "Variant Inventory Tracker": "variant_inventory_tracker",
  "Variant Inventory Policy": "variant_inventory_policy",
  "Variant Fulfillment Service": "variant_fulfillment_service",
  "Variant Price": "variant_price",
  "Variant Compare At Price": "variant_compare_at_price",
  "Variant Requires Shipping": "variant_requires_shipping",
  "Variant Taxable": "variant_taxable",
  "Unit Price Total Measure": "unit_price_total_measure",
  "Unit Price Total Measure Unit": "unit_price_total_measure_unit",
  "Unit Price Base Measure": "unit_price_base_measure",
  "Unit Price Base Measure Unit": "unit_price_base_measure_unit",
  "Variant Barcode": "variant_barcode",
  "Image Src": "image_src",
  "Image Position": "image_position",
  "Image Alt Text": "image_alt_text",
  "Gift Card": "gift_card",
  "SEO Title": "seo_title",
  "SEO Description": "seo_description",
  "Google Shopping / Google Product Category": "google_product_category",
  "Google Shopping / Gender": "google_gender",
  "Google Shopping / Age Group": "google_age_group",
  "Google Shopping / MPN": "google_mpn",
  "Google Shopping / Condition": "google_condition",
  "Google Shopping / Custom Product": "google_custom_product",
  "Google Shopping / Custom Label 0": "google_custom_label_0",
  "Google Shopping / Custom Label 1": "google_custom_label_1",
  "Google Shopping / Custom Label 2": "google_custom_label_2",
  "Google Shopping / Custom Label 3": "google_custom_label_3",
  "Google Shopping / Custom Label 4": "google_custom_label_4",
  "Google: Custom Product (product.metafields.mm-google-shopping.custom_product)": "mm_google_custom_product",
  "Product rating count (product.metafields.reviews.rating_count)": "product_rating_count",
  "Age group (product.metafields.shopify.age-group)": "metafield_age_group",
  "Coil connection (product.metafields.shopify.coil-connection)": "metafield_coil_connection",
  "Color (product.metafields.shopify.color-pattern)": "metafield_color_pattern",
  "Dietary preferences (product.metafields.shopify.dietary-preferences)": "metafield_dietary_preferences",
  "E-cigarette/Vaporizer style (product.metafields.shopify.e-cigarette-vaporizer-style)": "metafield_ecigarette_style",
  "Ingredient category (product.metafields.shopify.ingredient-category)": "metafield_ingredient_category",
  "Usage type (product.metafields.shopify.usage-type)": "metafield_usage_type",
  "Vaping style (product.metafields.shopify.vaping-style)": "metafield_vaping_style",
  "Variant Image": "variant_image",
  "Variant Weight Unit": "variant_weight_unit",
  "Variant Tax Code": "variant_tax_code",
  "Cost per item": "cost_per_item",
  "Status": "status",
};

const EBAY_NUMERIC_COLS = new Set([
  "available_quantity", "start_price", "auction_buy_it_now_price", "reserve_price",
  "current_price", "sold_quantity", "watchers", "bids",
]);

const SHOPIFY_NUMERIC_COLS = new Set([
  "variant_grams", "variant_price", "variant_compare_at_price", "image_position", "cost_per_item",
]);

export type DetectedPlatform = "ebay" | "shopify" | "unknown";

/** Detect platform from CSV headers */
export function detectPlatform(headers: string[]): DetectedPlatform {
  const headerSet = new Set(headers.map((h) => h.trim()));
  if (headerSet.has("Item number") && headerSet.has("eBay category 1 name")) return "ebay";
  if (headerSet.has("Handle") && headerSet.has("Variant SKU")) return "shopify";
  return "unknown";
}

/** Parse a CSV file and return mapped rows */
export function parseChannelCsv(
  file: File
): Promise<{ platform: DetectedPlatform; rows: Record<string, any>[]; headers: string[]; errors: string[] }> {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const headers = result.meta.fields || [];
        const platform = detectPlatform(headers);
        const errors: string[] = [];

        if (platform === "unknown") {
          resolve({ platform, rows: [], headers, errors: ["Unable to detect CSV platform from headers"] });
          return;
        }

        const columnMap = platform === "ebay" ? EBAY_COLUMN_MAP : SHOPIFY_COLUMN_MAP;
        const numericCols = platform === "ebay" ? EBAY_NUMERIC_COLS : SHOPIFY_NUMERIC_COLS;

        const rows = (result.data as Record<string, any>[]).map((raw, idx) => {
          const mapped: Record<string, any> = { raw_row: { ...raw } };
          for (const [csvCol, dbCol] of Object.entries(columnMap)) {
            let val = raw[csvCol];
            if (val === undefined || val === null || (typeof val === "string" && val.trim() === "")) {
              mapped[dbCol] = null;
              continue;
            }
            if (typeof val === "string") val = val.trim();
            if (numericCols.has(dbCol)) {
              const n = Number(val);
              mapped[dbCol] = isNaN(n) ? null : n;
            } else {
              mapped[dbCol] = val;
            }
          }
          mapped._rowIndex = idx;
          return mapped;
        });

        resolve({ platform, rows, headers, errors });
      },
      error: (err) => {
        resolve({ platform: "unknown", rows: [], headers: [], errors: [err.message] });
      },
    });
  });
}

/** Validate that essential columns exist */
export function validateColumns(headers: string[], platform: DetectedPlatform): string[] {
  const warnings: string[] = [];
  if (platform === "ebay") {
    const required = ["Item number", "Title"];
    for (const col of required) {
      if (!headers.includes(col)) warnings.push(`Missing required eBay column: ${col}`);
    }
  } else if (platform === "shopify") {
    const required = ["Handle", "Title"];
    for (const col of required) {
      if (!headers.includes(col)) warnings.push(`Missing required Shopify column: ${col}`);
    }
  }
  return warnings;
}
