/**
 * Shared types for the scraping pipeline.
 */

export type ScrapeStage =
  | 'seed_validation'
  | 'page_type_detection'
  | 'discovery'
  | 'qualification'
  | 'extraction'
  | 'complete';

export type ScrapeErrorCode =
  | 'INVALID_URL'
  | 'TARGET_BLOCKED_403'
  | 'RATE_LIMITED_429'
  | 'SEED_FETCH_FAILED'
  | 'SEED_PAGE_FILTERED_OUT'
  | 'NO_PRODUCT_URLS_DISCOVERED'
  | 'JS_RENDER_FAILED'
  | 'GATEWAY_PAGE_DETECTED'
  | 'PRODUCT_EXTRACTION_EMPTY'
  | 'UPSTREAM_FIRECRAWL_ERROR'
  | 'INTERNAL_ERROR'
  | 'DOMAIN_MISMATCH'
  | 'CANCELLED';

export type ScrapeMode = 'single' | 'collection' | 'domain';

export interface ScrapeJobConfig {
  targetSiteUrl: string;
  targetDomain: string;
  targetOrigin: string;
  seedPath: string;
  scrapeMode: ScrapeMode;
  discoveryAllowedPaths: string[];
  productAllowedPaths: string[];
  excludePaths: string[];
  maxPages: number;
  crawlDepth: number;
  importMode: 'fill_blanks' | 'overwrite';
}

export interface ScrapeProgress {
  stage: ScrapeStage;
  stageLabel: string;
  pagesDiscovered: number;
  pagesScraped: number;
  productsExtracted: number;
  paginationPagesVisited: number;
  errors: ScrapeLogEntry[];
  discoveredUrls: DiscoveredUrl[];
  extractedProducts: ExtractedProduct[];
  diagnostics: ScrapeDiagnostics;
}

export interface ScrapeLogEntry {
  timestamp: string;
  stage: ScrapeStage;
  level: 'info' | 'warn' | 'error';
  message: string;
  url?: string;
  errorCode?: ScrapeErrorCode;
  httpStatus?: number;
}

export interface DiscoveredUrl {
  url: string;
  type: 'product' | 'pagination' | 'other';
  accepted: boolean;
  rejectionReason?: string;
  confidenceScore?: number;
}

export interface ExtractedProduct {
  _id: string;
  _status: 'ready' | 'warning' | 'error';
  _excluded: boolean;
  _selected: boolean;
  _sourceUrl: string;
  _extractionConfidence: number;
  _extractionNotes: string[];
  _rawExtractedJson?: any;
  source_product_name: string;
  brand: string;
  sell_price: number | null;
  cost_price: number | null;
  sku: string;
  barcode: string;
  short_description: string;
  full_description_html: string;
  product_type: string;
  manufacturer: string;
  pack_size: string;
  strength: string;
  product_form: string;
  ingredients_summary: string;
  warnings_summary: string;
  directions_summary: string;
  storage_requirements: string;
  country_of_origin: string;
  weight_grams: number | null;
  primary_image_url: string;
  additional_image_urls: string[];
  stock_status: string;
  [key: string]: any;
}

export interface ScrapeDiagnostics {
  seedUrl: string;
  normalizedUrl: string;
  resolvedDomain: string;
  scrapeMode: ScrapeMode;
  discoveryAllowedPaths: string[];
  productAllowedPaths: string[];
  excludePaths: string[];
  detectedPageType: string;
  seedFetchHttpStatus: number | null;
  seedFetchSuccess: boolean;
  jsRetryUsed: boolean;
  discoveredUrlCount: number;
  acceptedProductUrlCount: number;
  rejectedUrlCount: number;
  paginationPagesVisited: string[];
  extractedProductPageCount: number;
  skippedPagesWithReasons: { url: string; reason: string }[];
  failureCategory: ScrapeErrorCode | null;
}

export function createEmptyProgress(config: ScrapeJobConfig): ScrapeProgress {
  return {
    stage: 'seed_validation',
    stageLabel: 'Validating seed URL',
    pagesDiscovered: 0,
    pagesScraped: 0,
    productsExtracted: 0,
    paginationPagesVisited: 0,
    errors: [],
    discoveredUrls: [],
    extractedProducts: [],
    diagnostics: {
      seedUrl: config.targetSiteUrl,
      normalizedUrl: config.targetSiteUrl,
      resolvedDomain: config.targetDomain,
      scrapeMode: config.scrapeMode,
      discoveryAllowedPaths: config.discoveryAllowedPaths,
      productAllowedPaths: config.productAllowedPaths,
      excludePaths: config.excludePaths,
      detectedPageType: '',
      seedFetchHttpStatus: null,
      seedFetchSuccess: false,
      jsRetryUsed: false,
      discoveredUrlCount: 0,
      acceptedProductUrlCount: 0,
      rejectedUrlCount: 0,
      paginationPagesVisited: [],
      extractedProductPageCount: 0,
      skippedPagesWithReasons: [],
      failureCategory: null,
    },
  };
}

export function validateProduct(p: ExtractedProduct): 'ready' | 'warning' | 'error' {
  if (!p.source_product_name?.trim() || p.sell_price == null) return 'error';
  if (!p.brand?.trim() || !p.sku?.trim() || !p.short_description?.trim()) return 'warning';
  return 'ready';
}

export function createExtractedProduct(
  partial: Partial<ExtractedProduct>,
  sourceUrl: string
): ExtractedProduct {
  const p: ExtractedProduct = {
    _id: crypto.randomUUID(),
    _status: 'ready',
    _excluded: false,
    _selected: false,
    _sourceUrl: sourceUrl,
    _extractionConfidence: partial._extractionConfidence ?? 0,
    _extractionNotes: partial._extractionNotes ?? [],
    _rawExtractedJson: partial._rawExtractedJson,
    source_product_name: partial.source_product_name || '',
    brand: partial.brand || '',
    sell_price: partial.sell_price ?? null,
    cost_price: partial.cost_price ?? null,
    sku: partial.sku || '',
    barcode: partial.barcode || '',
    short_description: partial.short_description || '',
    full_description_html: partial.full_description_html || '',
    product_type: partial.product_type || '',
    manufacturer: partial.manufacturer || '',
    pack_size: partial.pack_size || '',
    strength: partial.strength || '',
    product_form: partial.product_form || '',
    ingredients_summary: partial.ingredients_summary || '',
    warnings_summary: partial.warnings_summary || '',
    directions_summary: partial.directions_summary || '',
    storage_requirements: partial.storage_requirements || '',
    country_of_origin: partial.country_of_origin || '',
    weight_grams: partial.weight_grams ?? null,
    primary_image_url: partial.primary_image_url || '',
    additional_image_urls: partial.additional_image_urls || [],
    stock_status: partial.stock_status || '',
  };
  p._status = validateProduct(p);
  return p;
}
