/**
 * Post-extraction sanitizer to filter out cart/UI artifacts
 * and infer missing brand names from product titles.
 */

import type { ExtractedProduct } from '@/lib/scrape-types';

const CART_PHRASES = [
  'your cart is empty', 'add to cart', 'view cart', 'cart total',
  'items in cart', 'checkout', '0 in cart', 'in cart', 'cart is empty',
  'shopping cart', 'my cart', 'mini cart', 'cart drawer', 'empty cart',
  'remove from cart', 'update cart', 'view and order',
];

const SENTENCE_FRAGMENT_PATTERN = /^(a |an |the |your |our |this |that |with |for |as |in |of |to |by |is |are |was |were |be |been |being |have |has |had )/i;

const UI_TITLE_PATTERNS = [
  /^(menu|navigation|footer|header|sidebar|search|login|sign in|sign up|register|subscribe|newsletter)$/i,
  /^(free shipping|sale|new|popular|trending|best seller|featured)$/i,
  /^(skip to content|close|open|toggle|expand|collapse)$/i,
];

const KNOWN_PHARMACY_BRANDS = [
  'BioCeuticals', 'Blackmores', 'Swisse', "Nature's Way", 'Metagenics',
  'Orthoplex', 'Eagle', 'Fusion Health', 'Herbs of Gold', 'Ethical Nutrients',
  'Vitex', 'Naturopathica', 'Mediherb', 'Designs for Health', 'Thorne',
  'Nordic Naturals', 'Garden of Life', 'Nutra-Life', "Thompson's", 'Solgar',
  'Now Foods', 'Life Space', 'Inner Health', 'Amazonia', 'Blooms',
  'Cenovis', 'Centrum', 'Elevit', 'Ostelin', 'Chemists Own',
  'Nurofen', 'Panadol', 'Voltaren', 'Dettol', 'Betadine',
  'Colgate', 'Oral-B', 'Sensodyne', 'Flo', 'Telfast',
  'Zyrtec', 'Claratyne', 'Beconase', 'Sudafed', 'Codral',
  'Dulcolax', 'Metamucil', 'Nexium', 'Gaviscon', 'Hydralyte',
  'Dermaveen', 'QV', 'Cetaphil', 'La Roche-Posay', 'CeraVe',
  'Burt\'s Bees', 'Sukin', 'Akin', 'Weleda', 'Dr LeWinn\'s',
  'Trilogy', 'Antipodes', 'Go Healthy', 'Good Health', 'Clinicians',
  'Musashi', 'BSc', 'Endura', 'Vital Strength', 'Bulk Nutrients',
  'Aptamil', 'Karicare', 'S-26', 'Nan', 'Bellamy\'s',
  'Armaforce', 'Ultra Muscleze', 'SB Floractiv', 'Mega B Q10',
];

export function inferBrandFromTitle(title: string): string | null {
  if (!title) return null;
  const titleLower = title.toLowerCase();
  for (const brand of KNOWN_PHARMACY_BRANDS) {
    if (titleLower.startsWith(brand.toLowerCase())) {
      return brand;
    }
  }
  // Try matching after removing leading "The " or similar
  const cleanTitle = title.replace(/^the\s+/i, '');
  for (const brand of KNOWN_PHARMACY_BRANDS) {
    if (cleanTitle.toLowerCase().startsWith(brand.toLowerCase())) {
      return brand;
    }
  }
  return null;
}

function isCartOrUIText(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return CART_PHRASES.some(phrase => lower.includes(phrase));
}

function isSentenceFragment(text: string): boolean {
  return SENTENCE_FRAGMENT_PATTERN.test(text.trim());
}

function isUITitle(text: string): boolean {
  return UI_TITLE_PATTERNS.some(pat => pat.test(text.trim()));
}

function isValidSku(sku: string): boolean {
  if (!sku) return false;
  const s = sku.trim();
  if (s.length < 3) return false;
  // Reject common UI text fragments
  const lower = s.toLowerCase();
  if (['resh', 'fresh', 'refresh', 'cart', 'add', 'view', 'menu', 'close', 'open'].includes(lower)) return false;
  // Reject pure lowercase short words (likely UI fragments)
  if (/^[a-z]+$/.test(s) && s.length < 6) return false;
  return true;
}

function isValidStockStatus(stock: string | boolean | null | undefined): string | null {
  if (stock === null || stock === undefined) return null;
  if (typeof stock === 'boolean') return stock ? 'In Stock' : 'Out of Stock';
  const s = String(stock).toLowerCase();
  if (s.includes('in cart') || s.includes('cart')) return null;
  if (s.includes('in stock') || s === 'true') return 'In Stock';
  if (s.includes('out of stock') || s.includes('sold out') || s === 'false') return 'Out of Stock';
  return String(stock);
}

export interface SanitizationResult {
  product: ExtractedProduct | null;
  skipped: boolean;
  skipReason?: string;
}

/**
 * Sanitize a single extracted product, filtering out cart/UI artifacts.
 * Returns null product if the row should be completely excluded.
 */
export function sanitizeExtractedProduct(product: ExtractedProduct): SanitizationResult {
  const title = product.source_product_name?.trim() || '';

  // Reject rows with no title
  if (!title || title.length < 3) {
    return { product: null, skipped: true, skipReason: 'Empty or too-short title' };
  }

  // Reject cart/UI text as title
  if (isCartOrUIText(title)) {
    return { product: null, skipped: true, skipReason: `Cart/UI element detected: "${title}"` };
  }

  // Reject pure UI element titles
  if (isUITitle(title)) {
    return { product: null, skipped: true, skipReason: `UI navigation element: "${title}"` };
  }

  // Reject sentence fragments as titles
  if (isSentenceFragment(title) && title.length < 30) {
    return { product: null, skipped: true, skipReason: `Sentence fragment as title: "${title}"` };
  }

  // Sanitize brand
  let brand = product.brand || '';
  if (brand && (isSentenceFragment(brand) || isCartOrUIText(brand))) {
    brand = '';
  }
  // Strip trailing periods from brand (sentence endings)
  brand = brand.replace(/\.\s*$/, '').trim();
  // If brand is still empty, try inferring from title
  if (!brand) {
    brand = inferBrandFromTitle(title) || '';
  }

  // Sanitize SKU
  let sku = product.sku || '';
  if (!isValidSku(sku)) {
    sku = '';
  }

  // Sanitize price
  let price = product.sell_price;
  if (price !== null && price <= 0) {
    price = null; // Mark as missing rather than keeping $0
  }

  // Sanitize stock status
  const stockStatus = isValidStockStatus(product.stock_status);

  // Sanitize source URL - reject cart/homepage-only URLs
  const sourceUrl = product._sourceUrl || '';
  if (sourceUrl && (sourceUrl.endsWith('/cart') || sourceUrl === '#')) {
    return { product: null, skipped: true, skipReason: `Invalid source URL: "${sourceUrl}"` };
  }

  const sanitized: ExtractedProduct = {
    ...product,
    source_product_name: title,
    brand,
    sku,
    sell_price: price,
    stock_status: stockStatus || '',
  };

  return { product: sanitized, skipped: false };
}

/**
 * Sanitize an array of extracted products, returning clean products
 * and a log of skipped items.
 */
export function sanitizeExtractedProducts(
  products: ExtractedProduct[]
): { clean: ExtractedProduct[]; skipped: { title: string; reason: string }[] } {
  const clean: ExtractedProduct[] = [];
  const skipped: { title: string; reason: string }[] = [];

  for (const p of products) {
    const result = sanitizeExtractedProduct(p);
    if (result.skipped || !result.product) {
      skipped.push({
        title: p.source_product_name || '(empty)',
        reason: result.skipReason || 'Unknown',
      });
    } else {
      clean.push(result.product);
    }
  }

  // Deduplicate by title (keep first occurrence)
  const seen = new Set<string>();
  const deduped: ExtractedProduct[] = [];
  for (const p of clean) {
    const key = p.source_product_name.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(p);
    } else {
      skipped.push({ title: p.source_product_name, reason: 'Duplicate title' });
    }
  }

  return { clean: deduped, skipped };
}
