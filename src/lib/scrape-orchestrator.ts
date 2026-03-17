/**
 * Client-side scrape orchestrator.
 * Coordinates multi-stage scraping using existing Firecrawl edge functions.
 */

import { firecrawlApi } from '@/lib/api/firecrawl';
import { detectPageType, extractCandidateUrls, isLikelyProductUrl } from '@/lib/utils/pageTypeDetector';
import { sanitizeExtractedProducts } from '@/lib/utils/extractionSanitizer';
import { fetchShopifyProducts } from '@/lib/api/shopifyFetcher';
import { detectPlatform, type Platform } from '@/lib/utils/platformDetector';
import {
  type ScrapeJobConfig,
  type ScrapeProgress,
  type ScrapeLogEntry,
  type ExtractedProduct,
  type DiscoveredUrl,
  type ScrapeErrorCode,
  type ScrapeStage,
  createEmptyProgress,
  createExtractedProduct,
} from '@/lib/scrape-types';

export type ProgressCallback = (progress: ScrapeProgress) => void;

/**
 * Normalize a user-entered URL into a canonical ScrapeJobConfig.
 */
export function buildJobConfig(params: {
  url: string;
  scrapeMode: 'single' | 'collection' | 'domain';
  maxPages: number;
  crawlDepth: number;
  discoveryPaths: string;
  productPaths: string;
  excludePaths: string;
  importMode: 'fill_blanks' | 'overwrite';
}): ScrapeJobConfig | { error: string } {
  let normalized = params.url.trim();
  if (!normalized) return { error: 'URL is required' };
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = `https://${normalized}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return { error: 'Invalid URL format' };
  }

  const defaultDiscoveryPaths = [
    '/collections/', '/collection/', '/category/', '/categories/',
    '/browse/', '/catalog/', '/catalogue/', '/shop/', '/search/',
    '/brand/', '/brands/', '/department/',
  ];

  const defaultProductPaths = [
    '/products/', '/product/', '/p/', '/item/',
  ];

  const defaultExcludePaths = [
    '/blog/', '/checkout/', '/cart/', '/account/', '/login/',
    '/policies/', '/pages/contact', '/about/', '/faq/', '/terms/',
    '/privacy/', '/shipping/', '/returns/',
  ];

  const parseList = (s: string, defaults: string[]) => {
    const trimmed = s.trim();
    if (!trimmed) return defaults;
    return trimmed.split(',').map(p => p.trim()).filter(Boolean);
  };

  // Auto-include the seed path in discovery
  const userDiscovery = parseList(params.discoveryPaths, defaultDiscoveryPaths);
  if (!userDiscovery.some(p => parsed.pathname.startsWith(p)) && parsed.pathname !== '/') {
    userDiscovery.push(parsed.pathname);
  }

  return {
    targetSiteUrl: normalized,
    targetDomain: parsed.hostname,
    targetOrigin: parsed.origin,
    seedPath: parsed.pathname + parsed.search,
    scrapeMode: params.scrapeMode,
    discoveryAllowedPaths: userDiscovery,
    productAllowedPaths: parseList(params.productPaths, defaultProductPaths),
    excludePaths: parseList(params.excludePaths, defaultExcludePaths),
    maxPages: params.maxPages,
    crawlDepth: params.crawlDepth,
    importMode: params.importMode,
  };
}

/**
 * Run the full staged scrape pipeline.
 */
export async function runScrapeJob(
  config: ScrapeJobConfig,
  onProgress: ProgressCallback,
  cancelledRef: { current: boolean }
): Promise<ScrapeProgress> {
  const progress = createEmptyProgress(config);

  const log = (stage: ScrapeStage, level: 'info' | 'warn' | 'error', message: string, extra?: Partial<ScrapeLogEntry>) => {
    progress.errors.push({
      timestamp: new Date().toISOString(),
      stage,
      level,
      message,
      ...extra,
    });
    onProgress({ ...progress });
  };

  const updateStage = (stage: ScrapeStage, label: string) => {
    progress.stage = stage;
    progress.stageLabel = label;
    onProgress({ ...progress });
  };

  try {
    // =============================================
    // STAGE 0 — Platform Detection (Shopify fast-path)
    // =============================================
    updateStage('seed_validation', 'Detecting platform…');
    log('seed_validation', 'info', `Probing platform for ${config.targetDomain}`);

    let detectedPlatform: Platform = 'unknown';
    try {
      const detection = await detectPlatform(config.targetSiteUrl);
      detectedPlatform = detection.platform;
      detection.signals.forEach(s => log('seed_validation', 'info', `Platform signal: ${s}`));
      log('seed_validation', 'info', `Platform detected: ${detectedPlatform} (confidence: ${(detection.confidence * 100).toFixed(0)}%)`);
    } catch (err: any) {
      log('seed_validation', 'warn', `Platform detection failed: ${err.message}, falling back to Firecrawl`);
    }

    if (cancelledRef.current) return progress;

    // =============================================
    // SHOPIFY FAST-PATH — use JSON API instead of scraping
    // =============================================
    if (detectedPlatform === 'shopify') {
      updateStage('discovery', 'Fetching products via Shopify API…');
      log('discovery', 'info', 'Using Shopify Products JSON API — no AI extraction needed');

      progress.diagnostics.detectedPageType = 'shopify_api';
      progress.diagnostics.seedFetchSuccess = true;
      progress.diagnostics.seedFetchHttpStatus = 200;

      const shopifyResult = await fetchShopifyProducts(
        config.targetSiteUrl,
        Math.ceil(config.maxPages / 250) + 1, // Convert maxPages to API page count
        (sp) => {
          progress.productsExtracted = sp.totalFetched;
          progress.pagesScraped = sp.page;
          progress.pagesDiscovered = sp.totalFetched;
          onProgress({ ...progress });
        }
      );

      if (cancelledRef.current) return progress;

      if (shopifyResult.error) {
        log('discovery', 'error', `Shopify API error: ${shopifyResult.error}`);
        // Fall through to Firecrawl if Shopify API failed but we haven't returned yet
        if (shopifyResult.products.length === 0) {
          log('discovery', 'warn', 'Shopify API returned no products, falling back to Firecrawl scraping');
          detectedPlatform = 'unknown'; // Reset to use Firecrawl path below
        }
      }

      if (detectedPlatform === 'shopify' && shopifyResult.products.length > 0) {
        const { clean, skipped } = sanitizeExtractedProducts(shopifyResult.products);
        skipped.forEach(s => log('extraction', 'warn', `Filtered: ${s.reason} — "${s.title}"`));

        progress.extractedProducts = clean;
        progress.productsExtracted = clean.length;
        progress.diagnostics.extractedProductPageCount = shopifyResult.totalFetched;

        log('extraction', 'info', `Extracted ${clean.length} product(s) via Shopify API (${skipped.length} filtered)`);
        updateStage('complete', 'Complete');
        return progress;
      }
    }

    // =============================================
    // STAGE 1 — Seed Validation & Fetch (Firecrawl path)
    // =============================================
    updateStage('seed_validation', 'Fetching seed page…');
    log('seed_validation', 'info', `Fetching seed URL: ${config.targetSiteUrl}`);

    const seedResult = await firecrawlApi.scrape(config.targetSiteUrl, {
      formats: ['markdown', 'html', 'links'],
      onlyMainContent: false,
      waitFor: 2000,
    });

    if (cancelledRef.current) return progress;

    if (!seedResult.success) {
      const errorMsg = seedResult.error || 'Seed fetch failed';
      // Detect specific error types
      let errorCode: ScrapeErrorCode = 'SEED_FETCH_FAILED';
      if (errorMsg.includes('402')) {
        errorCode = 'UPSTREAM_FIRECRAWL_ERROR';
        log('seed_validation', 'error', 'Firecrawl API credits exhausted or payment required.', { errorCode });
      } else if (errorMsg.includes('403')) {
        errorCode = 'TARGET_BLOCKED_403';
        log('seed_validation', 'error', `Target site blocked automated access (403 Forbidden)`, { errorCode, httpStatus: 403 });
      } else if (errorMsg.includes('429')) {
        errorCode = 'RATE_LIMITED_429';
        log('seed_validation', 'error', `Rate limited by target or Firecrawl (429)`, { errorCode, httpStatus: 429 });
      } else {
        log('seed_validation', 'error', errorMsg, { errorCode });
      }
      progress.diagnostics.failureCategory = errorCode;
      progress.diagnostics.seedFetchSuccess = false;
      updateStage('seed_validation', 'Seed fetch failed');
      return progress;
    }

    // Access nested data
    const seedData = seedResult.data?.data || seedResult.data || {};
    const seedMarkdown = seedData.markdown || '';
    const seedHtml = seedData.html || seedData.rawHtml || '';
    const seedLinks = seedData.links || [];
    const seedMetadata = seedData.metadata || {};
    const seedStatus = seedMetadata.statusCode || 200;

    progress.diagnostics.seedFetchHttpStatus = seedStatus;
    progress.diagnostics.seedFetchSuccess = true;
    progress.pagesScraped = 1;

    log('seed_validation', 'info', `Seed fetched successfully (HTTP ${seedStatus}, ${seedMarkdown.length} chars markdown)`);

    if (cancelledRef.current) return progress;

    // =============================================
    // STAGE 2 — Page Type Detection
    // =============================================
    updateStage('page_type_detection', 'Analyzing page type…');

    const pageTypeResult = detectPageType({
      url: config.targetSiteUrl,
      httpStatus: seedStatus,
      html: seedHtml,
      markdown: seedMarkdown,
      textLength: seedMarkdown.length,
    });

    progress.diagnostics.detectedPageType = pageTypeResult.pageType;
    log('page_type_detection', 'info', `Page classified as: ${pageTypeResult.pageType} (confidence: ${(pageTypeResult.confidence * 100).toFixed(0)}%)`);
    pageTypeResult.signals.forEach(s => log('page_type_detection', 'info', `Signal: ${s}`));

    // Handle blocked site
    if (pageTypeResult.pageType === 'blocked_site') {
      progress.diagnostics.failureCategory = 'TARGET_BLOCKED_403';
      log('page_type_detection', 'error', 'Target site appears to block automated access', {
        errorCode: 'TARGET_BLOCKED_403',
        httpStatus: seedStatus,
      });
      updateStage('page_type_detection', 'Site blocked');
      return progress;
    }

    // Handle SPA — retry with longer wait
    if (pageTypeResult.pageType === 'spa_listing' || (seedMarkdown.length < 300 && seedStatus === 200)) {
      log('page_type_detection', 'warn', 'Content appears sparse, retrying with JS rendering wait…');
      progress.diagnostics.jsRetryUsed = true;

      const retryResult = await firecrawlApi.scrape(config.targetSiteUrl, {
        formats: ['markdown', 'html', 'links'],
        onlyMainContent: false,
        waitFor: 5000,
      });

      if (retryResult.success) {
        const retryData = retryResult.data?.data || retryResult.data || {};
        const retryMd = retryData.markdown || '';
        if (retryMd.length > seedMarkdown.length) {
          log('page_type_detection', 'info', `JS retry improved content: ${retryMd.length} chars (was ${seedMarkdown.length})`);
          Object.assign(seedData, { markdown: retryMd, html: retryData.html || seedHtml, links: retryData.links || seedLinks });
        } else {
          log('page_type_detection', 'warn', 'JS retry did not improve content');
        }
      }
    }

    if (cancelledRef.current) return progress;

    // =============================================
    // STAGE 3 — SINGLE PAGE MODE
    // =============================================
    if (config.scrapeMode === 'single') {
      updateStage('extraction', 'Extracting product data from single page…');
      const rawProducts = extractProductsFromContent(seedData.markdown || seedMarkdown, seedHtml, config.targetSiteUrl);
      const { clean, skipped } = sanitizeExtractedProducts(rawProducts);
      progress.extractedProducts = clean;
      progress.productsExtracted = clean.length;
      progress.diagnostics.extractedProductPageCount = 1;

      skipped.forEach(s => log('extraction', 'warn', `Skipped: ${s.reason} — "${s.title}"`));

      if (clean.length === 0) {
        progress.diagnostics.failureCategory = 'PRODUCT_EXTRACTION_EMPTY';
        log('extraction', 'warn', `No products could be extracted from this page (${skipped.length} rows filtered as cart/UI artifacts)`);
      } else {
        log('extraction', 'info', `Extracted ${clean.length} product(s) from single page (${skipped.length} filtered)`);
      }

      updateStage('complete', 'Complete');
      return progress;
    }

    // =============================================
    // STAGE 3 — Discovery (Collection / Domain)
    // =============================================
    updateStage('discovery', 'Discovering product URLs…');

    const currentMarkdown = seedData.markdown || seedMarkdown;
    const currentHtml = seedData.html || seedHtml;

    const discovered = extractCandidateUrls({
      html: currentHtml,
      markdown: currentMarkdown,
      baseUrl: config.targetSiteUrl,
      domain: config.targetDomain,
    });

    log('discovery', 'info', `Discovered from seed: ${discovered.productUrls.length} product URLs, ${discovered.paginationUrls.length} pagination URLs, ${discovered.otherUrls.length} other URLs`);

    // Also try extracting product data from seed page itself (listing cards)
    const seedCardProducts = extractProductCardsFromListing(currentMarkdown, config.targetSiteUrl);
    if (seedCardProducts.length > 0) {
      log('discovery', 'info', `Found ${seedCardProducts.length} product card(s) on seed listing page`);
    }

    // Track all discovered URLs
    const allProductUrls = new Set(discovered.productUrls);
    const visitedPagination = new Set<string>();
    const visitedUrls = new Set<string>([config.targetSiteUrl]);

    // Follow pagination
    const paginationQueue = [...discovered.paginationUrls];
    let paginationLimit = Math.min(config.maxPages, 20); // cap pagination

    while (paginationQueue.length > 0 && paginationLimit > 0 && !cancelledRef.current) {
      const nextPageUrl = paginationQueue.shift()!;
      if (visitedPagination.has(nextPageUrl) || visitedUrls.has(nextPageUrl)) continue;
      visitedPagination.add(nextPageUrl);
      visitedUrls.add(nextPageUrl);
      paginationLimit--;

      log('discovery', 'info', `Following pagination: ${nextPageUrl}`);
      progress.paginationPagesVisited++;
      progress.diagnostics.paginationPagesVisited.push(nextPageUrl);

      const paginationResult = await firecrawlApi.scrape(nextPageUrl, {
        formats: ['markdown', 'html', 'links'],
        onlyMainContent: false,
        waitFor: 2000,
      });

      if (!paginationResult.success) {
        log('discovery', 'warn', `Pagination page failed: ${nextPageUrl} - ${paginationResult.error}`);
        continue;
      }

      progress.pagesScraped++;
      const pageData = paginationResult.data?.data || paginationResult.data || {};
      const pageMd = pageData.markdown || '';
      const pageHtml = pageData.html || '';

      const pageDiscovered = extractCandidateUrls({
        html: pageHtml,
        markdown: pageMd,
        baseUrl: nextPageUrl,
        domain: config.targetDomain,
      });

      pageDiscovered.productUrls.forEach(u => allProductUrls.add(u));
      // Add new pagination URLs
      pageDiscovered.paginationUrls.forEach(u => {
        if (!visitedPagination.has(u)) paginationQueue.push(u);
      });

      // Also extract card products from this page
      const pageCardProducts = extractProductCardsFromListing(pageMd, nextPageUrl);
      seedCardProducts.push(...pageCardProducts);

      onProgress({ ...progress });
    }

    // Record all discovered URLs
    for (const url of allProductUrls) {
      const qualification = isLikelyProductUrl(url);
      progress.discoveredUrls.push({
        url,
        type: 'product',
        accepted: qualification.likely,
        rejectionReason: qualification.likely ? undefined : qualification.reasons.join('; '),
        confidenceScore: qualification.score,
      });
    }

    progress.pagesDiscovered = allProductUrls.size;
    progress.diagnostics.discoveredUrlCount = allProductUrls.size;

    if (cancelledRef.current) return progress;

    // =============================================
    // STAGE 4 — Qualification
    // =============================================
    updateStage('qualification', 'Qualifying product URLs…');

    const acceptedUrls = [...allProductUrls].filter(url => {
      const q = isLikelyProductUrl(url);
      return q.likely;
    });

    const rejectedUrls = [...allProductUrls].filter(url => !acceptedUrls.includes(url));

    progress.diagnostics.acceptedProductUrlCount = acceptedUrls.length;
    progress.diagnostics.rejectedUrlCount = rejectedUrls.length;

    log('qualification', 'info', `Qualified ${acceptedUrls.length} product URLs, rejected ${rejectedUrls.length}`);

    rejectedUrls.forEach(url => {
      const q = isLikelyProductUrl(url);
      progress.diagnostics.skippedPagesWithReasons.push({
        url,
        reason: q.reasons.join('; ') || 'Low confidence score',
      });
    });

    // If no product detail URLs found, try using card-level data from listings
    if (acceptedUrls.length === 0 && seedCardProducts.length > 0) {
      const { clean, skipped } = sanitizeExtractedProducts(seedCardProducts);
      skipped.forEach(s => log('qualification', 'warn', `Skipped card: ${s.reason} — "${s.title}"`));
      log('qualification', 'info', `No product detail URLs found, using ${clean.length} products from listing cards (${skipped.length} filtered)`);
      progress.extractedProducts = clean;
      progress.productsExtracted = clean.length;
      progress.diagnostics.extractedProductPageCount = 0;
      updateStage('complete', 'Complete');
      return progress;
    }

    if (acceptedUrls.length === 0) {
      progress.diagnostics.failureCategory = 'NO_PRODUCT_URLS_DISCOVERED';

      // If gateway, be specific
      if (pageTypeResult.pageType === 'gateway_nav') {
        progress.diagnostics.failureCategory = 'GATEWAY_PAGE_DETECTED';
        log('qualification', 'error', 'This URL appears to be a category navigation page, not a product listing. Try a more specific category URL.');
      } else {
        log('qualification', 'error', 'No product URLs could be discovered from this page');
      }
      updateStage('qualification', 'No products found');
      return progress;
    }

    if (cancelledRef.current) return progress;

    // =============================================
    // STAGE 5 — Product Extraction
    // =============================================
    updateStage('extraction', `Extracting data from ${acceptedUrls.length} product pages…`);

    const maxToScrape = Math.min(acceptedUrls.length, config.maxPages);
    const allExtractedProducts: ExtractedProduct[] = [...seedCardProducts];

    for (let i = 0; i < maxToScrape; i++) {
      if (cancelledRef.current) break;

      const productUrl = acceptedUrls[i];
      if (visitedUrls.has(productUrl)) continue;
      visitedUrls.add(productUrl);

      try {
        const result = await firecrawlApi.scrape(productUrl, {
          formats: ['markdown', 'html'],
          onlyMainContent: true,
          waitFor: 2000,
        });

        progress.pagesScraped++;

        if (!result.success) {
          log('extraction', 'warn', `Failed to scrape ${productUrl}: ${result.error}`, { url: productUrl });
          progress.diagnostics.skippedPagesWithReasons.push({ url: productUrl, reason: result.error || 'Fetch failed' });
          continue;
        }

        const pageData = result.data?.data || result.data || {};
        const products = extractProductsFromContent(pageData.markdown || '', pageData.html || '', productUrl);

        allExtractedProducts.push(...products);
        progress.productsExtracted = allExtractedProducts.length;
        progress.diagnostics.extractedProductPageCount++;

        if (products.length === 0) {
          log('extraction', 'warn', `No product data extracted from ${productUrl}`, { url: productUrl });
        }
      } catch (err: any) {
        log('extraction', 'error', `Error scraping ${productUrl}: ${err.message}`, { url: productUrl });
        progress.diagnostics.skippedPagesWithReasons.push({ url: productUrl, reason: err.message });
      }

      onProgress({ ...progress });
    }

    const { clean: sanitizedProducts, skipped: sanitizedSkipped } = sanitizeExtractedProducts(allExtractedProducts);
    sanitizedSkipped.forEach(s => log('extraction', 'warn', `Filtered: ${s.reason} — "${s.title}"`));

    progress.extractedProducts = sanitizedProducts;
    progress.productsExtracted = sanitizedProducts.length;

    if (sanitizedProducts.length === 0) {
      progress.diagnostics.failureCategory = 'PRODUCT_EXTRACTION_EMPTY';
      log('extraction', 'warn', `Product detail URLs were found, but extraction returned empty fields (${sanitizedSkipped.length} rows filtered as cart/UI artifacts)`);
    } else {
      log('extraction', 'info', `Successfully extracted ${sanitizedProducts.length} product(s) (${sanitizedSkipped.length} filtered)`);
    }

    updateStage('complete', 'Complete');
    return progress;
  } catch (err: any) {
    progress.diagnostics.failureCategory = 'INTERNAL_ERROR';
    log(progress.stage, 'error', `Internal error: ${err.message}`, { errorCode: 'INTERNAL_ERROR' });
    return progress;
  }
}

// ============================
// Extraction helpers
// ============================

function extractProductsFromContent(markdown: string, html: string, sourceUrl: string): ExtractedProduct[] {
  const products: ExtractedProduct[] = [];
  const notes: string[] = [];

  // Layer 1: Try JSON-LD / structured data
  const jsonLdProducts = extractFromJsonLd(html);
  if (jsonLdProducts.length > 0) {
    notes.push('Extracted from JSON-LD structured data');
    for (const jld of jsonLdProducts) {
      products.push(createExtractedProduct({
        ...jld,
        _extractionNotes: ['JSON-LD'],
        _extractionConfidence: 0.9,
      }, sourceUrl));
    }
    return products;
  }

  // Layer 2: Semantic content extraction from markdown
  const semanticProduct = extractFromSemanticContent(markdown);
  if (semanticProduct.source_product_name) {
    notes.push('Extracted from semantic content');
    products.push(createExtractedProduct({
      ...semanticProduct,
      _extractionNotes: ['Semantic extraction'],
      _extractionConfidence: 0.6,
    }, sourceUrl));
    return products;
  }

  // Layer 3: Basic pattern matching (fallback)
  const basicProducts = extractFromPatterns(markdown, sourceUrl);
  return basicProducts;
}

function extractFromJsonLd(html: string): Partial<ExtractedProduct>[] {
  const results: Partial<ExtractedProduct>[] = [];
  const jsonLdRegex = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const items = data['@graph'] || (Array.isArray(data) ? data : [data]);

      for (const item of items) {
        if (item['@type'] === 'Product' || item['@type']?.includes?.('Product')) {
          const offers = item.offers || item.Offers || {};
          const offerData = Array.isArray(offers) ? offers[0] : offers;

          results.push({
            source_product_name: item.name || '',
            brand: item.brand?.name || item.brand || '',
            sell_price: parseFloat(offerData?.price) || null,
            sku: item.sku || '',
            barcode: item.gtin || item.gtin13 || item.gtin14 || item.gtin8 || '',
            short_description: item.description?.substring(0, 200) || '',
            full_description_html: item.description || '',
            manufacturer: item.manufacturer?.name || '',
            primary_image_url: item.image?.url || (typeof item.image === 'string' ? item.image : (Array.isArray(item.image) ? item.image[0] : '')) || '',
            stock_status: offerData?.availability?.includes?.('InStock') ? 'In Stock' : offerData?.availability?.includes?.('OutOfStock') ? 'Out of Stock' : '',
            _rawExtractedJson: item,
          });
        }
      }
    } catch {
      // Invalid JSON-LD, skip
    }
  }
  return results;
}

function extractFromSemanticContent(markdown: string): Partial<ExtractedProduct> {
  const result: Partial<ExtractedProduct> = {};
  const lines = markdown.split('\n');

  // Title: first H1 or H2
  for (const line of lines) {
    const titleMatch = line.match(/^#{1,2}\s+(.+)/);
    if (titleMatch) {
      result.source_product_name = titleMatch[1].replace(/[*_`[\]]/g, '').trim();
      break;
    }
  }

  // Price
  const priceMatch = markdown.match(/\$\s?([\d,]+\.?\d{0,2})/);
  if (priceMatch) {
    result.sell_price = parseFloat(priceMatch[1].replace(',', ''));
  }

  // Compare at price / RRP
  const compareMatch = markdown.match(/(?:RRP|Was|Compare at|Regular)[:\s]*\$\s?([\d,]+\.?\d{0,2})/i);
  if (compareMatch) {
    result.cost_price = parseFloat(compareMatch[1].replace(',', ''));
  }

  // SKU
  const skuMatch = markdown.match(/(?:SKU|Item|Code|Ref|Product Code)[:\s#]*([A-Z0-9][\w-]{2,20})/i);
  if (skuMatch) result.sku = skuMatch[1];

  // Barcode
  const barcodeMatch = markdown.match(/(?:EAN|UPC|Barcode|GTIN)[:\s]*(\d{8,14})/i);
  if (barcodeMatch) result.barcode = barcodeMatch[1];

  // Brand
  const brandMatch = markdown.match(/(?:Brand|By|Manufacturer|Vendor|Sponsor)[:\s]+([^\n|,]{2,40})/i);
  if (brandMatch) result.brand = brandMatch[1].trim();

  // Pack size
  const packMatch = markdown.match(/(?:Pack Size|Size|Pack|Quantity)[:\s]+([^\n]{2,30})/i);
  if (packMatch) result.pack_size = packMatch[1].trim();

  // Strength
  const strengthMatch = markdown.match(/(?:Strength|Concentration|Dose)[:\s]+([^\n]{2,30})/i);
  if (strengthMatch) result.strength = strengthMatch[1].trim();

  // Dosage form
  const formMatch = markdown.match(/(?:Form|Dosage Form|Type)[:\s]+(tablet|capsule|liquid|cream|ointment|gel|spray|powder|drops|injection|patch|inhaler|suppository|lozenge|syrup|solution|suspension|elixir|topical|oral)[s]?\b/i);
  if (formMatch) result.product_form = formMatch[1];

  // Ingredients
  const ingredientsMatch = markdown.match(/(?:Ingredients?|Active Ingredients?|Composition)[:\s]*\n?([\s\S]{10,500}?)(?=\n#{1,3}\s|\n\n\*\*|$)/i);
  if (ingredientsMatch) result.ingredients_summary = ingredientsMatch[1].trim().substring(0, 500);

  // Warnings
  const warningsMatch = markdown.match(/(?:Warning|Caution|Contraindication|Precaution)[s]?[:\s]*\n?([\s\S]{10,500}?)(?=\n#{1,3}\s|\n\n\*\*|$)/i);
  if (warningsMatch) result.warnings_summary = warningsMatch[1].trim().substring(0, 500);

  // Directions
  const directionsMatch = markdown.match(/(?:Direction|Dosage|How to use|Usage)[s]?[:\s]*\n?([\s\S]{10,500}?)(?=\n#{1,3}\s|\n\n\*\*|$)/i);
  if (directionsMatch) result.directions_summary = directionsMatch[1].trim().substring(0, 500);

  // Storage
  const storageMatch = markdown.match(/(?:Storage|Store)[:\s]+([^\n]{5,100})/i);
  if (storageMatch) result.storage_requirements = storageMatch[1].trim();

  // Description: first substantial paragraph
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 60 && !trimmed.startsWith('#') && !trimmed.startsWith('|') && !trimmed.startsWith('-')) {
      result.short_description = trimmed.substring(0, 200);
      break;
    }
  }

  // Images from markdown
  const imgMatches = [...markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)];
  if (imgMatches.length > 0) {
    result.primary_image_url = imgMatches[0][1];
    result.additional_image_urls = imgMatches.slice(1).map(m => m[1]);
  }

  return result;
}

function extractFromPatterns(markdown: string, sourceUrl: string): ExtractedProduct[] {
  const products: ExtractedProduct[] = [];
  const lines = markdown.split('\n');
  let currentProduct: Partial<ExtractedProduct> = {};
  let hasContent = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const h2Match = trimmed.match(/^#{1,3}\s+(.+)/);
    if (h2Match && hasContent) {
      if (currentProduct.source_product_name?.trim()) {
        products.push(createExtractedProduct({
          ...currentProduct,
          _extractionNotes: ['Pattern matching (fallback)'],
          _extractionConfidence: 0.3,
        }, sourceUrl));
      }
      currentProduct = {};
    }
    if (h2Match) {
      currentProduct.source_product_name = h2Match[1].replace(/[*_`[\]]/g, '').trim();
      hasContent = true;
    }
    const priceMatch = trimmed.match(/\$\s?([\d,]+\.?\d{0,2})/);
    if (priceMatch && !currentProduct.sell_price) {
      currentProduct.sell_price = parseFloat(priceMatch[1].replace(',', ''));
    }
    const skuMatch = trimmed.match(/(?:SKU|Item|Code|Ref)[:\s#]*([A-Z0-9-]+)/i);
    if (skuMatch && !currentProduct.sku) currentProduct.sku = skuMatch[1];
    const barcodeMatch = trimmed.match(/(?:EAN|UPC|Barcode|GTIN)[:\s]*(\d{8,14})/i);
    if (barcodeMatch) currentProduct.barcode = barcodeMatch[1];
    const brandMatch = trimmed.match(/(?:Brand|Manufacturer|By)[:\s]+([^\n|,]+)/i);
    if (brandMatch && !currentProduct.brand) currentProduct.brand = brandMatch[1].trim();
  }
  if (hasContent && currentProduct.source_product_name?.trim()) {
    products.push(createExtractedProduct({
      ...currentProduct,
      _extractionNotes: ['Pattern matching (fallback)'],
      _extractionConfidence: 0.3,
    }, sourceUrl));
  }
  return products;
}

function extractProductCardsFromListing(markdown: string, sourceUrl: string): ExtractedProduct[] {
  const products: ExtractedProduct[] = [];
  const seenTitles = new Set<string>();

  // Cart/UI phrases to skip
  const skipPhrases = [
    'your cart', 'add to cart', 'view cart', 'cart total', 'in cart',
    'checkout', 'shopping cart', 'empty cart', 'skip to', 'close',
    'menu', 'navigation', 'search', 'login', 'sign in', 'newsletter',
    'free shipping', 'subscribe', 'view and order',
  ];

  const isSkippable = (text: string) => {
    const lower = text.toLowerCase();
    return skipPhrases.some(p => lower.includes(p));
  };

  // Pattern 1: Markdown links with prices nearby — [Title](url) ... $XX.XX
  const cardRegex = /\[([^\]]{3,100})\]\(([^)]+)\)[^\n]*?\$\s?([\d,]+\.?\d{0,2})/g;
  let match;
  while ((match = cardRegex.exec(markdown)) !== null) {
    const title = match[1].replace(/[*_`]/g, '').trim();
    const url = match[2];
    const price = parseFloat(match[3].replace(',', ''));
    if (title && price > 0 && !isSkippable(title) && !seenTitles.has(title.toLowerCase())) {
      seenTitles.add(title.toLowerCase());
      products.push(createExtractedProduct({
        source_product_name: title,
        sell_price: price,
        _sourceUrl: url,
        _extractionNotes: ['Listing card extraction'],
        _extractionConfidence: 0.4,
      }, url || sourceUrl));
    }
  }

  // Pattern 2: Look for repeated blocks of title lines near prices
  // Shopify collections often render as: Title\nRegular price\n$XX.XX
  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip obvious non-product lines
    if (!line || line.length < 5 || line.length > 120) continue;
    if (line.startsWith('#') || line.startsWith('|') || line.startsWith('-') || line.startsWith('[') || line.startsWith('!')) continue;
    if (isSkippable(line)) continue;
    // Skip lines that look like labels/UI
    if (/^(regular price|sale price|from|sold out|quick view|compare|filter|sort)/i.test(line)) continue;

    // Check if next few lines contain a price
    const nextChunk = lines.slice(i + 1, i + 5).join(' ');
    const priceMatch = nextChunk.match(/\$\s?([\d,]+\.?\d{0,2})/);
    if (priceMatch) {
      const price = parseFloat(priceMatch[1].replace(',', ''));
      if (price > 0 && !seenTitles.has(line.toLowerCase())) {
        seenTitles.add(line.toLowerCase());
        products.push(createExtractedProduct({
          source_product_name: line,
          sell_price: price,
          _extractionNotes: ['Listing card (title+price proximity)'],
          _extractionConfidence: 0.3,
        }, sourceUrl));
        i += 3; // Skip past the price lines
      }
    }
  }

  return products;
}
