/**
 * Detects the e-commerce platform behind a URL by probing known API endpoints.
 * Uses the fetch-proxy edge function to avoid CORS issues.
 */

import { supabase } from '@/integrations/supabase/client';

export type Platform = 'shopify' | 'woocommerce' | 'unknown';

export interface PlatformDetectionResult {
  platform: Platform;
  confidence: number;
  signals: string[];
}

/**
 * Fetch a URL via our proxy edge function and return the result.
 */
async function proxyFetch(url: string): Promise<{ success: boolean; data?: any; contentType?: string; httpStatus?: number }> {
  try {
    const { data, error } = await supabase.functions.invoke('fetch-proxy', {
      body: { url },
    });
    if (error) return { success: false };
    return {
      success: data?.success ?? false,
      data: data?.data,
      contentType: data?.content_type,
      httpStatus: data?.http_status,
    };
  } catch {
    return { success: false };
  }
}

/**
 * Detect the e-commerce platform for a given URL.
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

  // Quick URL check
  if (normalized.includes('myshopify.com')) {
    signals.push('URL contains myshopify.com');
    return { platform: 'shopify', confidence: 1, signals };
  }

  // Probe Shopify products.json — most reliable check
  const probeResult = await proxyFetch(`${origin}/products.json?limit=1`);
  if (probeResult.success && probeResult.contentType === 'json') {
    const products = probeResult.data?.products;
    if (Array.isArray(products)) {
      signals.push('Shopify /products.json returned valid product data');
      return { platform: 'shopify', confidence: 1, signals };
    }
  }

  // Fetch the page HTML to check for platform markers
  const pageResult = await proxyFetch(normalized);
  if (pageResult.success && typeof pageResult.data === 'string') {
    const html = pageResult.data;

    if (html.includes('cdn.shopify.com') || html.includes('Shopify.theme') || html.includes('shopify-section')) {
      signals.push('Page HTML contains Shopify markers');
      return { platform: 'shopify', confidence: 0.95, signals };
    }

    if (html.includes('woocommerce') || html.includes('wp-content/plugins/woocommerce') || html.includes('wc-blocks')) {
      signals.push('Page HTML contains WooCommerce markers');
      return { platform: 'woocommerce', confidence: 0.9, signals };
    }
  }

  signals.push('No known platform detected');
  return { platform: 'unknown', confidence: 0, signals };
}
