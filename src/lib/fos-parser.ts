import * as XLSX from "xlsx";

// ── FOS column mapping: positional index → internal field name ──
// Based on the real FOS export column order from Z Office POS
export const FOS_COLUMNS = [
  { index: 0, fosHeader: "Stock Name", field: "stock_name" },
  { index: 1, fosHeader: "SOH", field: "soh" },
  { index: 2, fosHeader: "APN", field: "apn" },
  { index: 3, fosHeader: "PDE", field: "pde" },
  { index: 4, fosHeader: "Avg Cost", field: "avg_cost" },
  { index: 5, fosHeader: "Last Purchased", field: "last_purchased" },
  { index: 6, fosHeader: "Last Sold", field: "last_sold" },
  { index: 7, fosHeader: "Stock Value", field: "stock_value" },
  { index: 8, fosHeader: "Sales Val", field: "sales_val" },
  { index: 9, fosHeader: "Sales GP%", field: "sales_gp_percent" },
  { index: 10, fosHeader: "Qty Sold", field: "qty_sold" },
  { index: 11, fosHeader: "Qty Purchased", field: "qty_purchased" },
  { index: 12, fosHeader: "Margin (end date)", field: "margin_end_date" },
  { index: 13, fosHeader: "Categories", field: "categories" },
  { index: 14, fosHeader: "Dept", field: "dept" },
  { index: 15, fosHeader: "Mark up", field: "markup" },
  { index: 16, fosHeader: "Sell Price", field: "sell_price" },
  { index: 17, fosHeader: "Turn over", field: "turnover" },
  { index: 18, fosHeader: "GP $ (end date)", field: "gp_dollar_end_date" },
  { index: 19, fosHeader: "Margin (end date) 2", field: "margin_end_date_2" },
  { index: 20, fosHeader: "Mark up (end date)", field: "markup_end_date" },
  { index: 21, fosHeader: "RRP", field: "rrp" },
] as const;

export type FosFieldName = (typeof FOS_COLUMNS)[number]["field"];

/** All FOS field names in order */
export const FOS_FIELD_NAMES = FOS_COLUMNS.map((c) => c.field);

// ── Header text normalization for fuzzy matching ──
const HEADER_NORMALIZE_MAP: Record<string, FosFieldName> = {
  "stock name": "stock_name",
  "soh": "soh",
  "stock on hand": "soh",
  "apn": "apn",
  "barcode": "apn",
  "bar code": "apn",
  "ean": "apn",
  "pde": "pde",
  "product code": "pde",
  "item code": "pde",
  "sku": "pde",
  "code": "pde",
  "avg cost": "avg_cost",
  "average cost": "avg_cost",
  "cost price": "avg_cost",
  "cost": "avg_cost",
  "last purchased": "last_purchased",
  "last purchase date": "last_purchased",
  "last purch date": "last_purchased",
  "last sold": "last_sold",
  "last sold date": "last_sold",
  "last sale date": "last_sold",
  "stock value": "stock_value",
  "value": "stock_value",
  "total value": "stock_value",
  "sales val": "sales_val",
  "sales value": "sales_val",
  "total sales value": "sales_val",
  "total sales": "sales_val",
  "sales gp%": "sales_gp_percent",
  "sales gp %": "sales_gp_percent",
  "gp%": "sales_gp_percent",
  "gp %": "sales_gp_percent",
  "gp": "sales_gp_percent",
  "gross profit %": "sales_gp_percent",
  "margin %": "sales_gp_percent",
  "qty sold": "qty_sold",
  "units sold": "qty_sold",
  "qty purchased": "qty_purchased",
  "units purchased": "qty_purchased",
  "margin (end date)": "margin_end_date",
  "margin": "margin_end_date",
  "categories": "categories",
  "category": "categories",
  "sub category": "categories",
  "sub-category": "categories",
  "dept": "dept",
  "department": "dept",
  "mark up": "markup",
  "markup": "markup",
  "sell price": "sell_price",
  "selling price": "sell_price",
  "price": "sell_price",
  "turn over": "turnover",
  "turnover": "turnover",
  "gp $ (end date)": "gp_dollar_end_date",
  "gp $": "gp_dollar_end_date",
  "gp dollar": "gp_dollar_end_date",
  "mark up (end date)": "markup_end_date",
  "markup (end date)": "markup_end_date",
  "rrp": "rrp",
  "retail price": "rrp",
};

// ── Default parser config ──
export interface FosParserConfig {
  /** 1-based row number where product data starts (default: 4) */
  firstProductRow: number;
  /** Number of footer/total rows to remove from the end (default: 3) */
  footerRowsToRemove: number;
}

export const DEFAULT_FOS_CONFIG: FosParserConfig = {
  firstProductRow: 4,
  footerRowsToRemove: 3,
};

// ── Types ──
export interface FosParsedRow {
  /** 1-based row number in original sheet */
  sheetRow: number;
  /** Parsed fields keyed by FOS field name */
  fields: Record<FosFieldName, string | number | null>;
  /** Raw cell values for debugging */
  rawCells: any[];
  /** Skip reason if this row was rejected */
  skipReason?: string;
  /** Parsing warnings for this row */
  warnings: string[];
}

export interface FosColumnMapping {
  index: number;
  fosHeader: string;
  field: FosFieldName;
  detectedHeader?: string;
}

export interface FosParseResult {
  /** Worksheet name used */
  sheetName: string;
  /** Total raw rows in worksheet */
  totalRawRows: number;
  /** 1-based first product row used */
  firstProductRow: number;
  /** 1-based last usable product row (before footers) */
  lastUsableRow: number;
  /** Number of footer rows removed */
  footerRowsRemoved: number;
  /** Column mapping used */
  columnMapping: FosColumnMapping[];
  /** All parsed product rows (including skipped) */
  allRows: FosParsedRow[];
  /** Valid product rows only */
  validRows: FosParsedRow[];
  /** Skipped rows */
  skippedRows: FosParsedRow[];
  /** Global parsing warnings */
  warnings: string[];
  /** Raw header area rows for debug display */
  headerAreaRows: any[][];
  /** Sample raw-to-clean rows for debug */
  sampleRows: { raw: any[]; clean: Record<string, any> }[];
}

/**
 * Read an XLSX/XLS/CSV file and return raw rows as arrays.
 * Barcodes are preserved as text by reading with raw: true.
 */
export function readWorkbookRaw(buffer: ArrayBuffer): {
  rawRows: any[][];
  sheetName: string;
} {
  const wb = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
    cellText: true,
    raw: true,
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
 * Try to detect column mapping by examining the header area.
 * Falls back to positional mapping from FOS_COLUMNS.
 */
function detectColumnMapping(
  rawRows: any[][],
  config: FosParserConfig
): FosColumnMapping[] {
  // Look at rows before the first product row for header text
  const headerAreaEnd = config.firstProductRow - 1; // 0-based index
  let bestHeaderRow = -1;
  let bestScore = 0;

  for (let i = 0; i < Math.min(headerAreaEnd, rawRows.length); i++) {
    const row = rawRows[i];
    if (!row) continue;
    let score = 0;
    for (const cell of row) {
      const val = normalizeHeaderText(String(cell ?? ""));
      if (HEADER_NORMALIZE_MAP[val]) score += 10;
    }
    if (score > bestScore) {
      bestScore = score;
      bestHeaderRow = i;
    }
  }

  // If we found a header row with good matches, use text-based mapping
  if (bestHeaderRow >= 0 && bestScore >= 20) {
    const headerRow = rawRows[bestHeaderRow];
    const mapping: FosColumnMapping[] = [];
    const usedFields = new Set<FosFieldName>();
    // Track margin occurrences for deduplication
    let marginCount = 0;

    for (let i = 0; i < headerRow.length; i++) {
      const rawText = String(headerRow[i] ?? "").trim();
      const normalized = normalizeHeaderText(rawText);
      let field = HEADER_NORMALIZE_MAP[normalized] ?? null;

      // Handle duplicate "margin" columns
      if (field === "margin_end_date" && usedFields.has("margin_end_date")) {
        field = "margin_end_date_2" as FosFieldName;
      }
      if (field === "markup" && usedFields.has("markup")) {
        field = "markup_end_date" as FosFieldName;
      }

      if (field && !usedFields.has(field)) {
        usedFields.add(field);
        mapping.push({
          index: i,
          fosHeader: FOS_COLUMNS.find((c) => c.field === field)?.fosHeader ?? rawText,
          field,
          detectedHeader: rawText,
        });
      }
    }

    // Fill any missing fields from positional fallback
    for (const col of FOS_COLUMNS) {
      if (!usedFields.has(col.field) && col.index < (rawRows[bestHeaderRow]?.length ?? 0)) {
        mapping.push({
          index: col.index,
          fosHeader: col.fosHeader,
          field: col.field,
          detectedHeader: String(rawRows[bestHeaderRow]?.[col.index] ?? ""),
        });
      }
    }

    return mapping.sort((a, b) => a.index - b.index);
  }

  // Fallback: use positional mapping
  return FOS_COLUMNS.map((col) => ({
    index: col.index,
    fosHeader: col.fosHeader,
    field: col.field,
    detectedHeader: undefined,
  }));
}

function normalizeHeaderText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\r\n]+/g, " ") // handle wrapped headers
    .replace(/\s+/g, " ")
    .trim();
}

// ── Cell value parsers ──

function parseText(val: any): string | null {
  if (val == null) return null;
  const s = String(val).replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

function parseNumeric(val: any): { value: number | null; warning?: string } {
  if (val == null || String(val).trim() === "") return { value: null };
  const s = String(val).replace(/[,$%]/g, "").trim();
  if (s === "" || s === "####") return { value: null, warning: s === "####" ? "Cell displayed as ####" : undefined };
  const n = parseFloat(s);
  if (isNaN(n)) return { value: null, warning: `Non-numeric value: "${String(val).substring(0, 30)}"` };
  return { value: n };
}

function parseDate(val: any): { value: string | null; rawValue?: string; warning?: string } {
  if (val == null || String(val).trim() === "") return { value: null };

  // If it's already a Date object (from xlsx cellDates)
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return { value: null, warning: "Invalid date object" };
    return { value: val.toISOString().split("T")[0] };
  }

  const s = String(val).trim();

  // Try parsing common date formats
  // DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return { value: d.toISOString().split("T")[0] };
  }

  const slashMatch = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (slashMatch) {
    const [, a, b, c] = slashMatch;
    const year = c.length === 2 ? `20${c}` : c;
    // Assume DD/MM/YYYY for Australian POS
    const d = new Date(`${year}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`);
    if (!isNaN(d.getTime())) return { value: d.toISOString().split("T")[0] };
  }

  // Excel serial date number
  const num = parseFloat(s);
  if (!isNaN(num) && num > 30000 && num < 60000) {
    // Excel date serial → JS Date
    const excelEpoch = new Date(1899, 11, 30);
    const d = new Date(excelEpoch.getTime() + num * 86400000);
    if (!isNaN(d.getTime())) return { value: d.toISOString().split("T")[0] };
  }

  return { value: null, rawValue: s, warning: `Unparseable date: "${s.substring(0, 30)}"` };
}

// ── Row classification ──

function isFooterOrTotalRow(row: any[]): boolean {
  if (!row || row.length === 0) return true;
  const firstCell = String(row[0] ?? "").toLowerCase().trim();
  if (
    firstCell.startsWith("total") ||
    firstCell.startsWith("grand total") ||
    firstCell.startsWith("sub total") ||
    firstCell.startsWith("subtotal") ||
    firstCell.startsWith("report total") ||
    firstCell.includes("generated on") ||
    firstCell.includes("printed on") ||
    firstCell.includes("page ") ||
    firstCell.includes("end of report")
  ) {
    return true;
  }
  return false;
}

function isBlankRow(row: any[]): boolean {
  return !row || row.every((c) => c == null || String(c).trim() === "");
}

function isProductRow(fields: Record<FosFieldName, string | number | null>): boolean {
  // A row is a product if it has at least one meaningful identifier or value
  const hasName = fields.stock_name != null;
  const hasApn = fields.apn != null;
  const hasPde = fields.pde != null;
  const hasSoh = fields.soh != null && typeof fields.soh === "number";
  const hasPrice =
    (fields.sell_price != null && typeof fields.sell_price === "number") ||
    (fields.avg_cost != null && typeof fields.avg_cost === "number");

  return hasName || hasApn || hasPde || hasSoh || hasPrice;
}

// ── Main parser ──

export function parseFosSpreadsheet(
  rawRows: any[][],
  sheetName: string,
  config: FosParserConfig = DEFAULT_FOS_CONFIG
): FosParseResult {
  const warnings: string[] = [];

  // Detect column mapping
  const columnMapping = detectColumnMapping(rawRows, config);

  // Calculate row boundaries (convert 1-based to 0-based)
  const firstDataIdx = config.firstProductRow - 1; // 0-based index
  const totalRows = rawRows.length;
  const lastUsableIdx = Math.max(firstDataIdx, totalRows - config.footerRowsToRemove - 1);

  if (firstDataIdx >= totalRows) {
    warnings.push(`First product row (${config.firstProductRow}) is beyond sheet length (${totalRows} rows)`);
  }

  // Header area for debug
  const headerAreaRows = rawRows.slice(0, firstDataIdx);

  const allRows: FosParsedRow[] = [];
  const validRows: FosParsedRow[] = [];
  const skippedRows: FosParsedRow[] = [];

  for (let i = firstDataIdx; i <= lastUsableIdx; i++) {
    const row = rawRows[i];
    const sheetRow = i + 1; // 1-based
    const rowWarnings: string[] = [];

    // Skip blank rows
    if (isBlankRow(row)) {
      const parsed: FosParsedRow = {
        sheetRow,
        fields: emptyFields(),
        rawCells: row || [],
        skipReason: "Blank row",
        warnings: [],
      };
      skippedRows.push(parsed);
      allRows.push(parsed);
      continue;
    }

    // Skip footer/total rows
    if (isFooterOrTotalRow(row)) {
      const parsed: FosParsedRow = {
        sheetRow,
        fields: emptyFields(),
        rawCells: row,
        skipReason: "Footer/total row",
        warnings: [],
      };
      skippedRows.push(parsed);
      allRows.push(parsed);
      continue;
    }

    // Parse each field
    const fields = emptyFields();

    for (const col of columnMapping) {
      const cellVal = row[col.index];

      switch (col.field) {
        case "stock_name":
        case "categories":
        case "dept": {
          fields[col.field] = parseText(cellVal);
          break;
        }
        case "apn":
        case "pde": {
          // Always treat as text, preserve leading zeros
          const txt = parseText(cellVal);
          fields[col.field] = txt;
          break;
        }
        case "last_purchased":
        case "last_sold": {
          const { value, rawValue, warning } = parseDate(cellVal);
          fields[col.field] = value ?? rawValue ?? null;
          if (warning) rowWarnings.push(`${col.field}: ${warning}`);
          break;
        }
        default: {
          // All other fields are numeric
          const { value, warning } = parseNumeric(cellVal);
          fields[col.field] = value;
          if (warning) rowWarnings.push(`${col.field}: ${warning}`);
          break;
        }
      }
    }

    const parsed: FosParsedRow = {
      sheetRow,
      fields,
      rawCells: row,
      warnings: rowWarnings,
    };

    // Determine if this is a valid product row
    if (!isProductRow(fields)) {
      parsed.skipReason = "Not a product row (no name, barcode, or numeric values)";
      skippedRows.push(parsed);
    } else {
      // Additional skip rules
      const name = String(fields.stock_name ?? "").trim();
      if (name.startsWith("(OLD")) {
        parsed.skipReason = "Starts with (OLD – discontinued";
        skippedRows.push(parsed);
      } else {
        validRows.push(parsed);
      }
    }

    allRows.push(parsed);
  }

  // Build sample rows for debug
  const sampleRows = validRows.slice(0, 5).map((r) => ({
    raw: r.rawCells,
    clean: { ...r.fields },
  }));

  return {
    sheetName,
    totalRawRows: totalRows,
    firstProductRow: config.firstProductRow,
    lastUsableRow: lastUsableIdx + 1, // back to 1-based
    footerRowsRemoved: config.footerRowsToRemove,
    columnMapping,
    allRows,
    validRows,
    skippedRows,
    warnings,
    headerAreaRows,
    sampleRows,
  };
}

function emptyFields(): Record<FosFieldName, string | number | null> {
  const f: any = {};
  for (const col of FOS_COLUMNS) {
    f[col.field] = null;
  }
  return f;
}

// ── Database field mapping ──
// Maps FOS fields to the products table columns

export function fosRowToProductData(
  row: FosParsedRow
): Record<string, any> {
  const f = row.fields;
  return {
    source_product_name: f.stock_name ? String(f.stock_name).trim() : null,
    barcode: f.apn ? String(f.apn).trim() : null,
    sku: f.pde ? String(f.pde).trim() : null,
    stock_on_hand: typeof f.soh === "number" ? f.soh : parseFloat(String(f.soh ?? "0")) || 0,
    cost_price: typeof f.avg_cost === "number" ? f.avg_cost : null,
    sell_price: typeof f.sell_price === "number" ? f.sell_price : null,
    stock_value: typeof f.stock_value === "number" ? f.stock_value : null,
    department: f.dept ? String(f.dept).trim() : null,
    z_category: f.categories ? String(f.categories).trim() : null,
    units_sold_12m: typeof f.qty_sold === "number" ? Math.round(f.qty_sold) : 0,
    units_purchased_12m: typeof f.qty_purchased === "number" ? Math.round(f.qty_purchased) : null,
    total_sales_value_12m: typeof f.sales_val === "number" ? f.sales_val : null,
    gross_profit_percent: typeof f.sales_gp_percent === "number" ? f.sales_gp_percent : null,
    updated_at: new Date().toISOString(),
  };
}

// ── Matching utilities (preserved from original) ──

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const tokensA = new Set(a.split(" "));
  const tokensB = new Set(b.split(" "));
  const intersection = [...tokensA].filter((t) => tokensB.has(t));
  const union = new Set([...tokensA, ...tokensB]);
  return intersection.length / union.size;
}

export const NAME_MATCH_THRESHOLD = 0.85;

/** Fields that are compared for diff display */
export const DIFF_FIELDS = [
  "source_product_name",
  "barcode",
  "sku",
  "department",
  "z_category",
  "cost_price",
  "sell_price",
  "stock_on_hand",
  "stock_value",
  "units_sold_12m",
  "units_purchased_12m",
  "total_sales_value_12m",
  "gross_profit_percent",
] as const;

export type DiffField = (typeof DIFF_FIELDS)[number];

export interface FieldDiff {
  field: DiffField;
  oldValue: any;
  newValue: any;
}

export function computeDiffs(
  existing: Record<string, any>,
  incoming: Record<string, any>
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  for (const field of DIFF_FIELDS) {
    const oldVal = existing[field] ?? null;
    const newVal = incoming[field] ?? null;
    if (newVal == null) continue;
    if (String(oldVal ?? "") !== String(newVal ?? "")) {
      diffs.push({ field, oldValue: oldVal, newValue: newVal });
    }
  }
  return diffs;
}
