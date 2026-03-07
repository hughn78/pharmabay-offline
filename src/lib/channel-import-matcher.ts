import { supabase } from "@/integrations/supabase/client";

export interface MatchResult {
  product_id: string | null;
  match_method: string | null;
  match_confidence: "high" | "medium" | "low" | "none";
  ambiguous: boolean;
  candidates?: { id: string; name: string; method: string }[];
}

interface ProductRow {
  id: string;
  barcode: string | null;
  sku: string | null;
  source_product_name: string | null;
}

function normalize(s: string | null | undefined): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Load all products into memory for matching (avoids N+1) */
export async function loadProductIndex(): Promise<ProductRow[]> {
  const all: ProductRow[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data } = await supabase
      .from("products")
      .select("id, barcode, sku, source_product_name")
      .range(from, from + pageSize - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

/** Build lookup maps from product index */
function buildMaps(products: ProductRow[]) {
  const byBarcode = new Map<string, ProductRow[]>();
  const bySku = new Map<string, ProductRow[]>();
  const byNormTitle = new Map<string, ProductRow[]>();

  for (const p of products) {
    if (p.barcode) {
      const k = p.barcode.trim();
      if (k) (byBarcode.get(k) || (byBarcode.set(k, []), byBarcode.get(k)!)).push(p);
    }
    if (p.sku) {
      const k = p.sku.trim().toLowerCase();
      if (k) (bySku.get(k) || (bySku.set(k, []), bySku.get(k)!)).push(p);
    }
    const nt = normalize(p.source_product_name);
    if (nt) (byNormTitle.get(nt) || (byNormTitle.set(nt, []), byNormTitle.get(nt)!)).push(p);
  }
  return { byBarcode, bySku, byNormTitle };
}

/** Load existing eBay drafts with epid for matching */
async function loadEbayEpidMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data } = await supabase.from("ebay_drafts").select("product_id, epid").not("epid", "is", null);
  if (data) {
    for (const d of data) {
      if (d.epid && d.product_id) map.set(d.epid, d.product_id);
    }
  }
  return map;
}

/** Load existing Shopify drafts/products by handle */
async function loadShopifyHandleMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data } = await supabase.from("shopify_drafts").select("product_id, handle").not("handle", "is", null);
  if (data) {
    for (const d of data) {
      if (d.handle && d.product_id) map.set(d.handle.toLowerCase(), d.product_id);
    }
  }
  return map;
}

function singleMatch(matches: ProductRow[], method: string): MatchResult {
  if (matches.length === 1) {
    return { product_id: matches[0].id, match_method: method, match_confidence: "high", ambiguous: false };
  }
  if (matches.length > 1) {
    return {
      product_id: null, match_method: method, match_confidence: "low", ambiguous: true,
      candidates: matches.map((m) => ({ id: m.id, name: m.source_product_name || "", method })),
    };
  }
  return { product_id: null, match_method: null, match_confidence: "none", ambiguous: false };
}

/** Match eBay imported rows to local products */
export async function matchEbayRows(rows: Record<string, any>[]): Promise<MatchResult[]> {
  const products = await loadProductIndex();
  const { byBarcode, bySku, byNormTitle } = buildMaps(products);
  const epidMap = await loadEbayEpidMap();
  const results: MatchResult[] = [];

  for (const row of rows) {
    // 1. Barcode match (UPC or EAN)
    const upc = (row.upc || "").trim();
    const ean = (row.ean || "").trim();
    for (const bc of [upc, ean]) {
      if (bc) {
        const m = byBarcode.get(bc);
        if (m && m.length > 0) {
          const r = singleMatch(m, bc === upc ? "barcode_upc" : "barcode_ean");
          if (r.product_id || r.ambiguous) { results.push(r); continue; }
        }
      }
    }
    if (results.length > rows.indexOf(row)) continue; // already matched in barcode loop

    // 2. SKU match
    const sku = (row.custom_label_sku || "").trim().toLowerCase();
    if (sku) {
      const m = bySku.get(sku);
      if (m && m.length > 0) {
        const r = singleMatch(m, "sku");
        if (r.product_id || r.ambiguous) { results.push(r); continue; }
      }
    }

    // 3. ePID match
    const epid = (row.ebay_product_id_epid || "").trim();
    if (epid && epidMap.has(epid)) {
      results.push({ product_id: epidMap.get(epid)!, match_method: "epid", match_confidence: "high", ambiguous: false });
      continue;
    }

    // 4. Title match (fallback)
    const normTitle = normalize(row.title);
    if (normTitle) {
      const m = byNormTitle.get(normTitle);
      if (m && m.length > 0) {
        const r = singleMatch(m, "title");
        r.match_confidence = r.product_id ? "medium" : "low";
        results.push(r);
        continue;
      }
    }

    results.push({ product_id: null, match_method: null, match_confidence: "none", ambiguous: false });
  }
  return results;
}

/** Match Shopify imported rows to local products */
export async function matchShopifyRows(rows: Record<string, any>[]): Promise<MatchResult[]> {
  const products = await loadProductIndex();
  const { byBarcode, bySku, byNormTitle } = buildMaps(products);
  const handleMap = await loadShopifyHandleMap();
  const results: MatchResult[] = [];

  for (const row of rows) {
    // 1. Barcode match
    const barcode = (row.variant_barcode || "").trim();
    if (barcode) {
      const m = byBarcode.get(barcode);
      if (m && m.length > 0) {
        const r = singleMatch(m, "barcode");
        if (r.product_id || r.ambiguous) { results.push(r); continue; }
      }
    }

    // 2. SKU match
    const sku = (row.variant_sku || "").trim().toLowerCase();
    if (sku) {
      const m = bySku.get(sku);
      if (m && m.length > 0) {
        const r = singleMatch(m, "sku");
        if (r.product_id || r.ambiguous) { results.push(r); continue; }
      }
    }

    // 3. Handle match
    const handle = (row.handle || "").trim().toLowerCase();
    if (handle && handleMap.has(handle)) {
      results.push({ product_id: handleMap.get(handle)!, match_method: "handle", match_confidence: "high", ambiguous: false });
      continue;
    }

    // 4. Title match
    const normTitle = normalize(row.title);
    if (normTitle) {
      const m = byNormTitle.get(normTitle);
      if (m && m.length > 0) {
        const r = singleMatch(m, "title");
        r.match_confidence = r.product_id ? "medium" : "low";
        results.push(r);
        continue;
      }
    }

    results.push({ product_id: null, match_method: null, match_confidence: "none", ambiguous: false });
  }
  return results;
}
