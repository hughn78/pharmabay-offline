/**
 * Wholesaler Pricebook Parser & Matcher
 * 
 * This module provides a complete pipeline for importing wholesaler pricebook files
 * (API, Symbion, and extensible to others) into the PharmaBay product database.
 * 
 * Pipeline: Parse → Normalise → Match → Upsert/Conflict
 * 
 * Usage:
 *   1. Drop pricebook files on the Import Stock page → "Pricebooks" tab
 *   2. The system parses, normalises, and matches against existing products
 *   3. Review matches, conflicts, and new items before committing
 * 
 * To add a new wholesaler:
 *   1. Add to the Wholesaler type
 *   2. Create a parseXxxPricebook function
 *   3. Add column mapping config to WHOLESALER_CONFIGS
 */

import * as XLSX from "xlsx";
import { normalizeName, nameSimilarity, NAME_MATCH_THRESHOLD } from "./fos-parser";

// ── Types ──

export type Wholesaler = "API" | "SYMBION";

export interface WholesalerItem {
  wholesaler: Wholesaler;
  pde?: string;
  barcode?: string;
  name: string;
  genericName?: string;
  packSizeText?: string;
  costExGst?: number;
  costIncGst?: number;
  rawRow: Record<string, any>;
}

export interface MatchResult {
  type: "MATCHED" | "NEW" | "CONFLICT";
  matchMethod?: "barcode" | "pde" | "name";
  productId?: string;
  candidateProductIds?: string[];
  reason: string;
  confidence?: number;
}

export interface PricebookParseResult {
  wholesaler: Wholesaler;
  sheetName: string;
  totalRows: number;
  items: WholesalerItem[];
  skippedRows: number;
  warnings: string[];
}

export interface ProcessedItem {
  item: WholesalerItem;
  match: MatchResult;
}

export interface PricebookImportSummary {
  wholesaler: Wholesaler;
  totalRows: number;
  matched: ProcessedItem[];
  newItems: ProcessedItem[];
  conflicts: ProcessedItem[];
  skipped: number;
  warnings: string[];
}

// ── Column configs (easy to extend) ──

interface ColumnConfig {
  wholesaler: Wholesaler;
  /** Expected sheet name patterns */
  sheetPatterns: RegExp[];
  /** Column name → field mapping */
  columns: Record<string, keyof Omit<WholesalerItem, "wholesaler" | "rawRow">>;
  /** Header row to detect (0-based, -1 for first row) */
  headerRow: number;
  /** Rows to skip from end */
  footerRows: number;
  /** Is the main price ex-GST? */
  priceIsExGst: boolean;
}

const WHOLESALER_CONFIGS: Record<Wholesaler, ColumnConfig> = {
  API: {
    wholesaler: "API",
    sheetPatterns: [/sheet\s*2/i, /api/i, /pricebook/i],
    columns: {
      "api pde": "pde",
      "pde": "pde",
      "product": "name",
      "product name": "name",
      "description": "name",
      "wholesale price": "costExGst",
      "price": "costExGst",
      "barcode": "barcode",
    },
    headerRow: 0,
    footerRows: 0,
    priceIsExGst: true,
  },
  SYMBION: {
    wholesaler: "SYMBION",
    sheetPatterns: [/symbion/i, /pricebook/i, /sheet\s*1/i],
    columns: {
      "description": "name",
      "product": "name",
      "pde": "pde",
      "barcode": "barcode",
      "generic": "genericName",
      "price gst inc": "costIncGst",
      "price gst exc": "costExGst",
      "price inc gst": "costIncGst",
      "price ex gst": "costExGst",
    },
    headerRow: 0,
    footerRows: 0,
    priceIsExGst: false,
  },
};

// ── Normalisation helpers ──

/** Strip scientific notation from Excel barcodes like 9.33482E+12 */
export function normaliseBarcode(val: any): string | undefined {
  if (val == null) return undefined;
  let s = String(val).trim();
  if (!s || s === "0" || s === "") return undefined;
  
  // Handle scientific notation (9.33482E+12)
  if (/[eE]/.test(s)) {
    try {
      const num = parseFloat(s);
      if (!isNaN(num) && num > 1000) {
        s = num.toFixed(0);
      }
    } catch {
      // leave as-is
    }
  }
  
  // Remove any decimals (e.g. "9334820001234.0")
  s = s.replace(/\.0+$/, "");
  
  // Strip non-digit characters
  const digits = s.replace(/\D/g, "");
  if (digits.length < 4) return undefined;
  
  return digits;
}

export function normalisePde(val: any): string | undefined {
  if (val == null) return undefined;
  const s = String(val).replace(/[-\s]/g, "").trim();
  return s || undefined;
}

export function normalisePrice(val: any): number | undefined {
  if (val == null) return undefined;
  const s = String(val).replace(/[,$]/g, "").trim();
  if (!s) return undefined;
  const n = parseFloat(s);
  return isNaN(n) || n <= 0 ? undefined : Math.round(n * 100) / 100;
}

export function normaliseProductName(name: string): string {
  return name
    .replace(/\s+/g, " ")
    .trim()
    // Capitalise first letter of each word for consistency
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Parser ──

function findBestSheet(wb: XLSX.WorkBook, config: ColumnConfig): string {
  // Try matching sheet names against patterns
  for (const pattern of config.sheetPatterns) {
    for (const name of wb.SheetNames) {
      if (pattern.test(name)) return name;
    }
  }
  // Fallback: second sheet for API (they often use Sheet2), first for others
  if (config.wholesaler === "API" && wb.SheetNames.length > 1) {
    return wb.SheetNames[1];
  }
  return wb.SheetNames[0];
}

function detectHeaders(rows: any[][], config: ColumnConfig): { headerIdx: number; mapping: Map<number, string> } {
  // Search first 10 rows for header
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i];
    if (!row) continue;
    
    const mapping = new Map<number, string>();
    let score = 0;
    
    for (let j = 0; j < row.length; j++) {
      const cellText = String(row[j] ?? "").toLowerCase().trim();
      if (config.columns[cellText]) {
        mapping.set(j, config.columns[cellText]);
        score++;
      }
    }
    
    if (score >= 2) { // At least 2 column matches
      return { headerIdx: i, mapping };
    }
  }
  
  // Fallback: positional for known formats
  return { headerIdx: config.headerRow, mapping: new Map() };
}

export function parsePricebook(
  buffer: ArrayBuffer,
  wholesaler: Wholesaler,
  filenameHint?: string
): PricebookParseResult {
  const config = WHOLESALER_CONFIGS[wholesaler];
  const warnings: string[] = [];
  
  const wb = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
    cellText: true,
    raw: true,
  });
  
  const sheetName = findBestSheet(wb, config);
  const sheet = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
    rawNumbers: false,
  });
  
  const { headerIdx, mapping } = detectHeaders(rawRows, config);
  
  // If mapping is empty, try to build from column names in header row
  let colMap = mapping;
  if (colMap.size === 0 && rawRows[headerIdx]) {
    colMap = new Map();
    const headerRow = rawRows[headerIdx];
    for (let j = 0; j < headerRow.length; j++) {
      const cellText = String(headerRow[j] ?? "").toLowerCase().trim();
      if (config.columns[cellText]) {
        colMap.set(j, config.columns[cellText]);
      }
    }
  }
  
  if (colMap.size < 2) {
    warnings.push(`Could not detect column headers for ${wholesaler}. Found only ${colMap.size} matches.`);
  }
  
  const items: WholesalerItem[] = [];
  let skippedRows = 0;
  const dataStartIdx = headerIdx + 1;
  const dataEndIdx = rawRows.length - config.footerRows;
  
  for (let i = dataStartIdx; i < dataEndIdx; i++) {
    const row = rawRows[i];
    if (!row || row.every((c: any) => c == null || String(c).trim() === "")) {
      skippedRows++;
      continue;
    }
    
    const rawObj: Record<string, any> = {};
    colMap.forEach((field, colIdx) => {
      rawObj[field] = row[colIdx];
    });
    
    const name = String(rawObj.name ?? "").trim();
    if (!name) {
      skippedRows++;
      continue;
    }
    
    const item: WholesalerItem = {
      wholesaler,
      pde: normalisePde(rawObj.pde),
      barcode: normaliseBarcode(rawObj.barcode),
      name: normaliseProductName(name),
      genericName: rawObj.genericName ? normaliseProductName(String(rawObj.genericName).trim()) : undefined,
      costExGst: normalisePrice(rawObj.costExGst),
      costIncGst: normalisePrice(rawObj.costIncGst),
      rawRow: Object.fromEntries(row.map((v: any, idx: number) => [idx, v])),
    };
    
    // Validate: at least a name and either PDE or barcode
    if (!item.pde && !item.barcode) {
      // Still include, but warn
      if (items.length < 5) {
        warnings.push(`Row ${i + 1}: "${name}" has no PDE or barcode`);
      }
    }
    
    items.push(item);
  }
  
  return {
    wholesaler,
    sheetName,
    totalRows: rawRows.length,
    items,
    skippedRows,
    warnings,
  };
}

// ── Matching ──

export interface ExistingProduct {
  id: string;
  barcode: string | null;
  sku: string | null;
  source_product_name: string | null;
  normalized_product_name: string | null;
  brand: string | null;
  cost_price: number | null;
  sell_price: number | null;
}

export function matchToExistingProduct(
  item: WholesalerItem,
  products: ExistingProduct[],
  barcodeMap: Map<string, ExistingProduct>,
  pdeMap: Map<string, ExistingProduct>,
  nameEntries: { product: ExistingProduct; normalized: string }[]
): MatchResult {
  // Priority 1: Exact barcode match
  if (item.barcode && barcodeMap.has(item.barcode)) {
    const p = barcodeMap.get(item.barcode)!;
    return {
      type: "MATCHED",
      matchMethod: "barcode",
      productId: p.id,
      reason: `Barcode match: ${item.barcode}`,
      confidence: 1.0,
    };
  }
  
  // Priority 2: PDE + wholesaler match (via sku field)
  if (item.pde) {
    const pdeKey = `${item.wholesaler}:${item.pde}`;
    if (pdeMap.has(pdeKey)) {
      const p = pdeMap.get(pdeKey)!;
      return {
        type: "MATCHED",
        matchMethod: "pde",
        productId: p.id,
        reason: `PDE match: ${item.pde} (${item.wholesaler})`,
        confidence: 0.95,
      };
    }
    // Also try bare PDE match against sku
    if (pdeMap.has(item.pde)) {
      const p = pdeMap.get(item.pde)!;
      return {
        type: "MATCHED",
        matchMethod: "pde",
        productId: p.id,
        reason: `SKU/PDE match: ${item.pde}`,
        confidence: 0.9,
      };
    }
  }
  
  // Priority 3: Fuzzy name matching
  if (item.name) {
    const incomingNorm = normalizeName(item.name);
    let bestMatch: ExistingProduct | null = null;
    let bestScore = 0;
    let secondBestScore = 0;
    
    for (const entry of nameEntries) {
      const score = nameSimilarity(incomingNorm, entry.normalized);
      if (score > bestScore) {
        secondBestScore = bestScore;
        bestScore = score;
        bestMatch = entry.product;
      } else if (score > secondBestScore) {
        secondBestScore = score;
      }
    }
    
    // High confidence name match
    if (bestScore >= NAME_MATCH_THRESHOLD && bestMatch) {
      // Check if there are multiple close candidates (ambiguous)
      if (secondBestScore >= NAME_MATCH_THRESHOLD * 0.95) {
        // Too close - flag as conflict
        const candidates = nameEntries
          .filter(e => nameSimilarity(incomingNorm, e.normalized) >= NAME_MATCH_THRESHOLD * 0.9)
          .map(e => e.product.id);
        return {
          type: "CONFLICT",
          candidateProductIds: candidates,
          reason: `Multiple close name matches (best: ${(bestScore * 100).toFixed(0)}%, second: ${(secondBestScore * 100).toFixed(0)}%)`,
          confidence: bestScore,
        };
      }
      return {
        type: "MATCHED",
        matchMethod: "name",
        productId: bestMatch.id,
        reason: `Name match: ${(bestScore * 100).toFixed(0)}% similarity`,
        confidence: bestScore,
      };
    }
    
    // Below threshold but close enough to flag
    if (bestScore >= 0.6 && bestMatch) {
      return {
        type: "CONFLICT",
        candidateProductIds: [bestMatch.id],
        reason: `Possible name match at ${(bestScore * 100).toFixed(0)}% — below threshold`,
        confidence: bestScore,
      };
    }
  }
  
  return {
    type: "NEW",
    reason: "No match found by barcode, PDE, or name",
  };
}

// ── Build lookup indexes ──

export function buildProductIndexes(products: ExistingProduct[], wholesalerSkus?: { product_id: string; wholesaler: string; pde: string }[]) {
  const barcodeMap = new Map<string, ExistingProduct>();
  const pdeMap = new Map<string, ExistingProduct>();
  const nameEntries: { product: ExistingProduct; normalized: string }[] = [];
  
  for (const p of products) {
    if (p.barcode) barcodeMap.set(p.barcode, p);
    if (p.sku) pdeMap.set(p.sku, p);
    const norm = normalizeName(p.source_product_name || p.normalized_product_name || "");
    if (norm) nameEntries.push({ product: p, normalized: norm });
  }
  
  // Add wholesaler SKU mappings
  if (wholesalerSkus) {
    for (const ws of wholesalerSkus) {
      const product = products.find(p => p.id === ws.product_id);
      if (product && ws.pde) {
        pdeMap.set(`${ws.wholesaler}:${ws.pde}`, product);
        pdeMap.set(ws.pde, product);
      }
    }
  }
  
  return { barcodeMap, pdeMap, nameEntries };
}

// ── Detect wholesaler from file ──

export function detectWholesaler(filename: string, buffer: ArrayBuffer): Wholesaler | null {
  const lower = filename.toLowerCase();
  if (lower.includes("api") || lower.includes("api_pricebook") || lower.includes("api-pricebook")) return "API";
  if (lower.includes("symbion")) return "SYMBION";
  
  // Try reading sheet names
  try {
    const wb = XLSX.read(buffer, { type: "array", bookSheets: true });
    for (const name of wb.SheetNames) {
      if (/api/i.test(name)) return "API";
      if (/symbion/i.test(name)) return "SYMBION";
    }
  } catch {
    // ignore
  }
  
  return null;
}
