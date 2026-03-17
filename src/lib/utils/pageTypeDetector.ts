/**
 * Page Type Detector
 * Classifies a fetched page based on URL patterns and content signals.
 */

export type PageType =
  | 'product_detail'
  | 'collection_listing'
  | 'spa_listing'
  | 'gateway_nav'
  | 'blocked_site'
  | 'unknown';

export interface PageTypeResult {
  pageType: PageType;
  confidence: number;
  signals: string[];
}

// URL patterns that suggest product detail pages
const PRODUCT_URL_PATTERNS = [
  /\/products\/[^/]+/i,
  /\/product\/[^/]+/i,
  /\/p\/[^/]+/i,
  /\/item\/[^/]+/i,
  /\/dp\/[A-Z0-9]+/i,
  /\/catalog\/product\/view/i,
];

// URL patterns that suggest collection/listing pages
const LISTING_URL_PATTERNS = [
  /\/collections\//i,
  /\/collection\//i,
  /\/category\//i,
  /\/categories\//i,
  /\/browse\//i,
  /\/catalog\//i,
  /\/catalogue\//i,
  /\/shop\//i,
  /\/search/i,
  /\/brand\//i,
  /\/brands\//i,
  /\/department\//i,
  /\/prescription-products/i,
  /\/otc\//i,
  /\/vitamins/i,
  /\/supplements/i,
  /\/medicines/i,
  /\?.*category=/i,
  /\?.*q=/i,
  /\?.*search=/i,
  /\?.*limit=/i,
  /\?.*page=/i,
];

// Blocked site markers in content
const BLOCKED_MARKERS = [
  'access denied',
  'forbidden',
  'captcha',
  'cloudflare',
  'ray id',
  'please verify you are a human',
  'enable javascript and cookies',
  'checking your browser',
  'bot detection',
  'automated access',
  'are you a robot',
  'prove you are human',
];

// Gateway / navigation page markers
const GATEWAY_MARKERS = [
  'browse by',
  'select a category',
  'choose a category',
  'shop by category',
  'all categories',
  'our departments',
];

/**
 * Detect page type from HTTP status, URL, and content.
 */
export function detectPageType(params: {
  url: string;
  httpStatus?: number;
  html?: string;
  markdown?: string;
  textLength?: number;
}): PageTypeResult {
  const { url, httpStatus, html = '', markdown = '', textLength } = params;
  const signals: string[] = [];
  const scores: Record<PageType, number> = {
    product_detail: 0,
    collection_listing: 0,
    spa_listing: 0,
    gateway_nav: 0,
    blocked_site: 0,
    unknown: 0,
  };

  // --- HTTP status checks ---
  if (httpStatus === 401 || httpStatus === 403) {
    scores.blocked_site += 10;
    signals.push(`HTTP ${httpStatus} response`);
  }
  if (httpStatus === 429) {
    scores.blocked_site += 8;
    signals.push('Rate limited (429)');
  }

  const contentLower = (html + ' ' + markdown).toLowerCase();
  const effectiveTextLength = textLength ?? markdown.length;

  // --- Blocked site content checks ---
  for (const marker of BLOCKED_MARKERS) {
    if (contentLower.includes(marker)) {
      scores.blocked_site += 3;
      signals.push(`Blocked marker: "${marker}"`);
    }
  }

  // --- URL pattern checks ---
  for (const pat of PRODUCT_URL_PATTERNS) {
    if (pat.test(url)) {
      scores.product_detail += 5;
      signals.push(`URL matches product pattern: ${pat.source}`);
      break;
    }
  }

  for (const pat of LISTING_URL_PATTERNS) {
    if (pat.test(url)) {
      scores.collection_listing += 5;
      signals.push(`URL matches listing pattern: ${pat.source}`);
      break;
    }
  }

  // --- Content-based signals ---

  // Multiple price patterns suggest listing
  const priceMatches = contentLower.match(/\$\s?\d+[\d,.]*\d*/g);
  const priceCount = priceMatches?.length ?? 0;
  if (priceCount >= 4) {
    scores.collection_listing += 4;
    signals.push(`Multiple prices found (${priceCount})`);
  } else if (priceCount === 1) {
    scores.product_detail += 2;
    signals.push('Single price found');
  }

  // Add-to-cart signals
  const addToCartCount = (contentLower.match(/add to cart|add to bag|add to basket|buy now|view and order/g) || []).length;
  if (addToCartCount === 1) {
    scores.product_detail += 3;
    signals.push('Single add-to-cart signal');
  } else if (addToCartCount > 3) {
    scores.collection_listing += 3;
    signals.push(`Multiple add-to-cart signals (${addToCartCount})`);
  }

  // Schema.org Product
  if (contentLower.includes('"@type":"product"') || contentLower.includes('"@type": "product"')) {
    scores.product_detail += 4;
    signals.push('Schema.org Product detected');
  }

  // Repeated product card patterns (links with similar structure)
  const linkCount = (contentLower.match(/<a [^>]*href="\/products?\//g) || []).length;
  if (linkCount > 3) {
    scores.collection_listing += 4;
    signals.push(`Multiple product links (${linkCount})`);
  }

  // SPA detection: very sparse content
  if (effectiveTextLength < 200 && !httpStatus || (httpStatus && httpStatus >= 200 && httpStatus < 300)) {
    const hasAppShell = contentLower.includes('id="root"') || contentLower.includes('id="app"') || contentLower.includes('id="__next"');
    if (hasAppShell || effectiveTextLength < 100) {
      scores.spa_listing += 5;
      signals.push(`Sparse content (${effectiveTextLength} chars), possible SPA`);
    }
  }

  // Gateway nav detection
  for (const marker of GATEWAY_MARKERS) {
    if (contentLower.includes(marker)) {
      scores.gateway_nav += 3;
      signals.push(`Gateway marker: "${marker}"`);
    }
  }

  // Large number of category-style links without product data
  const categoryLinkCount = (contentLower.match(/\/category\/|\/collections\/|\/department\//g) || []).length;
  if (categoryLinkCount > 10 && priceCount < 3) {
    scores.gateway_nav += 4;
    signals.push(`Many category links (${categoryLinkCount}) with few prices`);
  }

  // Determine winner
  let maxType: PageType = 'unknown';
  let maxScore = 0;
  for (const [type, score] of Object.entries(scores) as [PageType, number][]) {
    if (score > maxScore) {
      maxScore = score;
      maxType = type;
    }
  }

  // Require minimum confidence
  if (maxScore < 3) {
    maxType = 'unknown';
  }

  return {
    pageType: maxType,
    confidence: Math.min(maxScore / 15, 1),
    signals,
  };
}

/**
 * Check if a URL looks like a product detail page.
 */
export function isLikelyProductUrl(url: string): { likely: boolean; score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  for (const pat of PRODUCT_URL_PATTERNS) {
    if (pat.test(url)) {
      score += 5;
      reasons.push(`Matches product URL pattern: ${pat.source}`);
      break;
    }
  }

  // Negative signals
  for (const pat of LISTING_URL_PATTERNS) {
    if (pat.test(url)) {
      score -= 3;
      reasons.push(`Matches listing pattern (negative): ${pat.source}`);
      break;
    }
  }

  const excludePatterns = [
    /\/blog\//i, /\/checkout/i, /\/cart/i, /\/account/i,
    /\/login/i, /\/policies\//i, /\/pages\//i, /\/about/i,
    /\/contact/i, /\/faq/i, /\/terms/i, /\/privacy/i,
    /\/shipping/i, /\/returns/i, /\/sitemap/i,
    /\.pdf$/i, /\.jpg$/i, /\.png$/i, /\.css$/i, /\.js$/i,
    /#/,
  ];

  for (const pat of excludePatterns) {
    if (pat.test(url)) {
      score -= 5;
      reasons.push(`Excluded path: ${pat.source}`);
      break;
    }
  }

  // Slug-like final segment is a positive signal
  const path = new URL(url, 'https://placeholder.com').pathname;
  const segments = path.split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1];
  if (lastSegment && lastSegment.includes('-') && lastSegment.length > 5) {
    score += 2;
    reasons.push('Slug-like final segment');
  }

  return { likely: score >= 3, score, reasons };
}

/**
 * Extract candidate product URLs from page content.
 */
export function extractCandidateUrls(params: {
  html: string;
  markdown: string;
  baseUrl: string;
  domain: string;
}): { productUrls: string[]; paginationUrls: string[]; otherUrls: string[] } {
  const { html, markdown, baseUrl, domain } = params;
  const allUrls = new Set<string>();
  const productUrls: string[] = [];
  const paginationUrls: string[] = [];
  const otherUrls: string[] = [];

  // Extract URLs from HTML
  const hrefRegex = /href="([^"]+)"/g;
  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    allUrls.add(match[1]);
  }

  // Extract URLs from markdown links
  const mdLinkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  while ((match = mdLinkRegex.exec(markdown)) !== null) {
    allUrls.add(match[2]);
  }

  // Normalize and classify
  for (const rawUrl of allUrls) {
    let absoluteUrl: string;
    try {
      absoluteUrl = new URL(rawUrl, baseUrl).href;
    } catch {
      continue;
    }

    // Only same domain
    try {
      const parsed = new URL(absoluteUrl);
      if (parsed.hostname !== domain && !parsed.hostname.endsWith('.' + domain)) continue;
    } catch {
      continue;
    }

    // Check pagination
    if (isPaginationUrl(rawUrl, absoluteUrl)) {
      paginationUrls.push(absoluteUrl);
      continue;
    }

    // Check product
    const { likely } = isLikelyProductUrl(absoluteUrl);
    if (likely) {
      productUrls.push(absoluteUrl);
    } else {
      otherUrls.push(absoluteUrl);
    }
  }

  return {
    productUrls: [...new Set(productUrls)],
    paginationUrls: [...new Set(paginationUrls)],
    otherUrls: [...new Set(otherUrls)],
  };
}

function isPaginationUrl(rawUrl: string, absoluteUrl: string): boolean {
  const paginationPatterns = [
    /[?&]page=\d+/i,
    /[?&]p=\d+/i,
    /[?&]pg=\d+/i,
    /\/page\/\d+/i,
    /[?&]offset=\d+/i,
  ];

  for (const pat of paginationPatterns) {
    if (pat.test(rawUrl) || pat.test(absoluteUrl)) return true;
  }

  return false;
}
