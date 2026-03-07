import * as XLSX from "xlsx";

// ── Column mapping: FOS header variants → internal field names ──
const HEADER_MAP: Record<string, string> = {
  "product name": "source_product_name",
  "product": "source_product_name",
  "description": "source_product_name",
  "item description": "source_product_name",
  "item name": "source_product_name",

  "stock on hand": "stock_on_hand",
  "soh": "stock_on_hand",
  "qty on hand": "stock_on_hand",
  "on hand": "stock_on_hand",

  "barcode": "barcode",
  "bar code": "barcode",
  "ean": "barcode",

  "sku": "sku",
  "product code": "sku",
  "item code": "sku",
  "code": "sku",

  "cost price": "cost_price",
  "cost": "cost_price",
  "avg cost": "cost_price",
  "average cost": "cost_price",

  "last purchase date": "last_purchased_at",
  "last purchased": "last_purchased_at",
  "last purch date": "last_purchased_at",

  "last sale date": "last_sold_at",
  "last sold": "last_sold_at",
  "last sold date": "last_sold_at",

  "stock value": "stock_value",
  "value": "stock_value",
  "total value": "stock_value",

  "total sales value": "total_sales_value_12m",
  "sales value": "total_sales_value_12m",
  "total sales": "total_sales_value_12m",
  "sales value (12 months)": "total_sales_value_12m",

  "total cogs": "total_cogs_12m",
  "cogs": "total_cogs_12m",
  "cost of goods": "total_cogs_12m",
  "total cogs (12 months)": "total_cogs_12m",

  "units sold": "units_sold_12m",
  "qty sold": "units_sold_12m",
  "units sold (12 months)": "units_sold_12m",

  "units purchased": "units_purchased_12m",
  "qty purchased": "units_purchased_12m",
  "units purchased (12 months)": "units_purchased_12m",

  "department": "department",
  "dept": "department",

  "category": "z_category",
  "sub category": "z_category",
  "sub-category": "z_category",

  "gp%": "gross_profit_percent",
  "gp %": "gross_profit_percent",
  "gp": "gross_profit_percent",
  "gross profit %": "gross_profit_percent",
  "margin %": "gross_profit_percent",

  "rrp": "sell_price",
  "sell price": "sell_price",
  "selling price": "sell_price",
  "retail price": "sell_price",
  "price": "sell_price",

  "supplier": "supplier",
  "vendor": "supplier",
};

// Minimum required fields for a row to be "product-like"
const REQUIRED_HEADER_FIELDS = ["source_product_name"];
const IDENTITY_FIELDS = ["barcode", "sku"];

export interface ParsedSheet {
  /** All raw rows as arrays (no header interpretation) */
  rawRows: any[][];
  /** Auto-detected header row index (0-based) */
  detectedHeaderRow: number;
  /** Parsed data rows using the header at detectedHeaderRow */
  parsedRows: ParsedProductRow[];
  /** Mapped headers */
  mappedHeaders: { original: string; mapped: string | null }[];
  /** Sheet name */
  sheetName: string;
  /** Total raw row count */
  totalRawRows: number;
}

export interface ParsedProductRow {
  /** Index in the raw sheet (0-based) */
  rawIndex: number;
  /** Mapped field values */
  fields: Record<string, string | number | null>;
  /** Original row values keyed by original header */
  original: Record<string, any>;
  /** Skip reason, if any */
  skipReason?: string;
  /** Match type for upsert: 'barcode' | 'sku' | 'name' | 'new' */
  matchType?: "barcode" | "sku" | "name" | "new";
  /** Matched product id */
  matchedProductId?: string;
  /** Existing product data for diff */
  existingProduct?: Record<string, any>;
}

/**
 * Read an XLSX/XLS/CSV file and return raw rows as arrays.
 * Barcodes are preserved as text by reading with `raw: true`.
 */
export function readWorkbookRaw(buffer: ArrayBuffer): {
  rawRows: any[][];
  sheetName: string;
} {
  const wb = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
    cellText: true,
    raw: true, // preserve raw cell values → barcodes stay as strings
  });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
    rawNumbers: false, // keep numbers as strings to preserve leading zeros
  });
  return { rawRows, sheetName };
}

/**
 * Score a row to determine if it looks like a header row.
 * Higher score = more likely to be a header.
 */
function scoreHeaderRow(row: any[]): number {
  if (!row || row.length < 3) return 0;
  let score = 0;
  const knownHeaders = new Set(Object.keys(HEADER_MAP));
  for (const cell of row) {
    const val = String(cell ?? "").toLowerCase().trim();
    if (val === "") continue;
    if (knownHeaders.has(val)) {
      score += 10;
    } else if (
      /^(product|stock|barcode|cost|price|category|department|sku|code|qty|units|sales|cogs|gp|rrp|value|date|supplier)/i.test(val)
    ) {
      score += 5;
    }
    // Headers are typically short text, not numbers
    if (typeof cell === "string" && isNaN(Number(cell)) && val.length < 40) {
      score += 1;
    }
  }
  return score;
}

/**
 * Auto-detect the header row index by scoring each row.
 */
export function detectHeaderRow(rawRows: any[][]): number {
  let bestIdx = 0;
  let bestScore = 0;
  // Only scan first 20 rows
  const limit = Math.min(rawRows.length, 20);
  for (let i = 0; i < limit; i++) {
    const s = scoreHeaderRow(rawRows[i]);
    if (s > bestScore) {
      bestScore = s;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Build header mapping from a raw row.
 */
export function buildHeaderMapping(
  headerRow: any[]
): { original: string; mapped: string | null }[] {
  return headerRow.map((cell) => {
    const original = String(cell ?? "").trim();
    const lower = original.toLowerCase();
    const mapped = HEADER_MAP[lower] ?? null;
    return { original, mapped };
  });
}

/**
 * Parse data rows using a header mapping, applying skip rules.
 */
export function parseDataRows(
  rawRows: any[][],
  headerRowIndex: number,
  mapping: { original: string; mapped: string | null }[]
): ParsedProductRow[] {
  const results: ParsedProductRow[] = [];

  for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.length === 0) continue;

    // Map fields
    const fields: Record<string, string | number | null> = {};
    const original: Record<string, any> = {};
    for (let c = 0; c < mapping.length; c++) {
      const { original: origHeader, mapped } = mapping[c];
      const cellVal = row[c] ?? "";
      original[origHeader] = cellVal;
      if (mapped) {
        // Preserve barcode as text string
        if (mapped === "barcode") {
          fields[mapped] = cellVal != null && String(cellVal).trim() !== ""
            ? String(cellVal).trim()
            : null;
        } else {
          fields[mapped] = cellVal != null && String(cellVal).trim() !== ""
            ? String(cellVal).trim()
            : null;
        }
      }
    }

    const parsed: ParsedProductRow = { rawIndex: i, fields, original };

    // Skip rules
    const name = String(fields.source_product_name ?? "").trim();
    if (!name) {
      parsed.skipReason = "Empty product name";
      results.push(parsed);
      continue;
    }
    if (name.startsWith("(OLD")) {
      parsed.skipReason = "Starts with (OLD – discontinued";
      results.push(parsed);
      continue;
    }

    const soh = parseFloat(String(fields.stock_on_hand ?? "0")) || 0;
    const unitsSold = parseInt(String(fields.units_sold_12m ?? "0")) || 0;
    const lastSold = fields.last_sold_at;
    if (soh <= 0 && unitsSold === 0 && !lastSold) {
      parsed.skipReason = "No stock, no sales, no last sold date";
      results.push(parsed);
      continue;
    }

    // Check for entirely blank rows (all cells empty)
    const hasAnyContent = row.some(
      (c: any) => c != null && String(c).trim() !== ""
    );
    if (!hasAnyContent) {
      parsed.skipReason = "Blank row";
      results.push(parsed);
      continue;
    }

    results.push(parsed);
  }
  return results;
}

/**
 * Normalize a product name for fuzzy matching.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Compute a simple similarity score between two normalized names.
 * Returns 0-1 where 1 = identical.
 */
export function nameSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const tokensA = new Set(a.split(" "));
  const tokensB = new Set(b.split(" "));
  const intersection = [...tokensA].filter((t) => tokensB.has(t));
  const union = new Set([...tokensA, ...tokensB]);
  return intersection.length / union.size; // Jaccard similarity
}

/** Threshold for considering a name match "high confidence" */
export const NAME_MATCH_THRESHOLD = 0.85;

/** Fields that are compared for diff display */
export const DIFF_FIELDS = [
  "source_product_name",
  "barcode",
  "sku",
  "brand",
  "department",
  "z_category",
  "cost_price",
  "sell_price",
  "stock_on_hand",
  "stock_value",
  "units_sold_12m",
  "units_purchased_12m",
  "total_sales_value_12m",
  "total_cogs_12m",
  "gross_profit_percent",
  "supplier",
] as const;

export type DiffField = (typeof DIFF_FIELDS)[number];

export interface FieldDiff {
  field: DiffField;
  oldValue: any;
  newValue: any;
}

/**
 * Compute field-level diffs between existing product and incoming data.
 */
export function computeDiffs(
  existing: Record<string, any>,
  incoming: Record<string, string | number | null>
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  for (const field of DIFF_FIELDS) {
    const oldVal = existing[field] ?? null;
    const newVal = incoming[field] ?? null;
    if (newVal == null) continue; // don't diff if incoming doesn't have the field
    const oldStr = String(oldVal ?? "");
    const newStr = String(newVal ?? "");
    if (oldStr !== newStr) {
      diffs.push({ field, oldValue: oldVal, newValue: newVal });
    }
  }
  return diffs;
}

/**
 * Build the product data object for insert/update.
 */
export function buildProductData(
  fields: Record<string, string | number | null>
): Record<string, any> {
  return {
    source_product_name: fields.source_product_name
      ? String(fields.source_product_name).trim()
      : null,
    barcode: fields.barcode ? String(fields.barcode).trim() : null,
    sku: fields.sku ? String(fields.sku).trim() : null,
    stock_on_hand: parseFloat(String(fields.stock_on_hand ?? "0")) || 0,
    cost_price: parseFloat(String(fields.cost_price ?? "")) || null,
    sell_price: parseFloat(String(fields.sell_price ?? "")) || null,
    stock_value: parseFloat(String(fields.stock_value ?? "")) || null,
    department: fields.department ? String(fields.department).trim() : null,
    z_category: fields.z_category ? String(fields.z_category).trim() : null,
    supplier: fields.supplier ? String(fields.supplier).trim() : null,
    units_sold_12m: parseInt(String(fields.units_sold_12m ?? "0")) || 0,
    units_purchased_12m:
      parseInt(String(fields.units_purchased_12m ?? "0")) || null,
    total_sales_value_12m:
      parseFloat(String(fields.total_sales_value_12m ?? "")) || null,
    total_cogs_12m:
      parseFloat(String(fields.total_cogs_12m ?? "")) || null,
    gross_profit_percent:
      parseFloat(String(fields.gross_profit_percent ?? "")) || null,
    updated_at: new Date().toISOString(),
  };
}
