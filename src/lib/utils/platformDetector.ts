/**
 * Detects the e-commerce platform behind a URL by probing known API endpoints.
 * Runs client-side via the firecrawl-scrape edge function to avoid CORS issues.
 */

import { firecrawlApi } from '@/lib/api/firecrawl';

export type Platform = 'shopify' | 'woocommerce' | 'unknown';

export interface PlatformDetectionResult {
  platform: Platform;
  confidence: number;
  signals: string[];
}

/**
 * Detect platform by probing the Shopify products.json endpoint via our edge function.
 * We use firecrawl to fetch the page HTML to check for platform markers.
 */
export async function detectPlatform(url: string): Promise<PlatformDetectionResult> {
  const signals: string[] = [];
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = `https://${normalized}`;
  }

  let origin: string;
  try {
    origin = new URL(normalized).origin;
  } catch {
    return { platform: 'unknown', confidence: 0, signals: ['Invalid URL'] };
  }

  // Check URL itself for Shopify patterns
  if (normalized.includes('myshopify.com')) {
    signals.push('URL contains myshopify.com');
    return { platform: 'shopify', confidence: 1, signals };
  }

  // Probe Shopify products.json — this is the most reliable check
  try {
    const probeResult = await firecrawlApi.scrape(`${origin}/products.json?limit=1`, {
      formats: ['markdown'],
      onlyMainContent: false,
    });

    if (probeResult.success) {
      const content = probeResult.data?.data?.markdown || probeResult.data?.markdown || '';
      // products.json returns JSON; Firecrawl will render it as markdown text
      // Check if it looks like a Shopify products response
      if (content.includes('"products"') || content.includes('"handle"') || content.includes('"vendor"') || content.includes('"product_type"')) {
        signals.push('Shopify /products.json endpoint responded with product data');
        return { platform: 'shopify', confidence: 1, signals };
      }
    }
  } catch {
    // Probe failed, continue to other checks
  }

  // Fetch the seed page HTML and check for platform markers
  try {
    const pageResult = await firecrawlApi.scrape(normalized, {
      formats: ['html'],
      onlyMainContent: false,
    });

    if (pageResult.success) {
      const html = pageResult.data?.data?.html || pageResult.data?.html || '';

      // Shopify markers
      if (html.includes('cdn.shopify.com') || html.includes('Shopify.theme') || html.includes('shopify-section')) {
        signals.push('Page HTML contains Shopify markers (cdn.shopify.com / Shopify.theme)');
        return { platform: 'shopify', confidence: 0.95, signals };
      }

      // WooCommerce markers
      if (html.includes('woocommerce') || html.includes('wp-content/plugins/woocommerce') || html.includes('wc-blocks')) {
        signals.push('Page HTML contains WooCommerce markers');
        return { platform: 'woocommerce', confidence: 0.9, signals };
      }
    }
  } catch {
    // Page fetch failed
  }

  signals.push('No known platform detected');
  return { platform: 'unknown', confidence: 0, signals };
}

/**
 * Quick synchronous check based on URL patterns only (no network).
 */
export function detectPlatformFromUrl(url: string): Platform | null {
  if (url.includes('myshopify.com')) return 'shopify';
  if (url.includes('/collections/') && !url.includes('woocommerce')) return null; // Could be Shopify but needs confirmation
  return null;
}
