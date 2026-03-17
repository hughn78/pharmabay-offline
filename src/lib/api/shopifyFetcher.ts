/**
 * Fetches products from Shopify stores via the public unauthenticated JSON API.
 * No API key needed — this is a public Shopify storefront endpoint.
 * Uses the fetch-proxy edge function to avoid CORS and get raw JSON.
 */

import { supabase } from '@/integrations/supabase/client';
import {
  type ExtractedProduct,
  createExtractedProduct,
} from '@/lib/scrape-types';
import { inferBrandFromTitle } from '@/lib/utils/extractionSanitizer';

export interface ShopifyFetchProgress {
  page: number;
  totalFetched: number;
  hasMore: boolean;
}

export type ShopifyProgressCallback = (progress: ShopifyFetchProgress) => void;

interface ShopifyVariant {
  id: number;
  title: string;
  price: string;
  compare_at_price: string | null;
  sku: string;
  barcode: string | null;
  available: boolean;
  grams: number;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  featured_image?: { src: string } | null;
}

interface ShopifyImage {
  id: number;
  src: string;
  alt: string | null;
}

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string;
  vendor: string;
  product_type: string;
  tags: string[];
  variants: ShopifyVariant[];
  images: ShopifyImage[];
  options: { name: string; values: string[] }[];
  created_at: string;
  updated_at: string;
}

function stripHtml(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Parse a Shopify collection URL into origin + collection handle.
 */
export function parseShopifyCollectionUrl(url: string): { origin: string; collectionHandle: string | null } {
  const parsed = new URL(url);
  const origin = parsed.origin;
  const pathMatch = parsed.pathname.match(/\/collections\/([^/?#]+)/);
  return {
    origin,
    collectionHandle: pathMatch ? pathMatch[1] : null,
  };
}

/**
 * Fetch raw JSON from a URL via our proxy edge function.
 */
async function fetchJson(url: string): Promise<{ success: boolean; data?: any; error?: string; httpStatus?: number }> {
  const { data, error } = await supabase.functions.invoke('fetch-proxy', {
    body: { url },
  });

  if (error) return { success: false, error: error.message };
  if (!data?.success) return { success: false, error: data?.error || 'Fetch failed', httpStatus: data?.http_status };
  if (data.content_type !== 'json') return { success: false, error: 'Response was not JSON' };
  return { success: true, data: data.data };
}

/**
 * Detect if a URL is a Shopify store by probing /products.json.
 */
export async function probeShopifyApi(origin: string): Promise<boolean> {
  const result = await fetchJson(`${origin}/products.json?limit=1`);
  return result.success && Array.isArray(result.data?.products);
}

/**
 * Fetch products from a Shopify collection or entire store.
 */
export async function fetchShopifyProducts(
  url: string,
  maxPages: number = 20,
  onProgress?: ShopifyProgressCallback,
): Promise<{ products: ExtractedProduct[]; totalFetched: number; error?: string }> {
  const { origin, collectionHandle } = parseShopifyCollectionUrl(url);

  const allProducts: ExtractedProduct[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= maxPages) {
    const apiUrl = collectionHandle
      ? `${origin}/collections/${collectionHandle}/products.json?limit=250&page=${page}`
      : `${origin}/products.json?limit=250&page=${page}`;

    const result = await fetchJson(apiUrl);

    if (!result.success) {
      if (allProducts.length > 0) {
        // We got some products, stop pagination gracefully
        break;
      }
      return { products: [], totalFetched: 0, error: result.error };
    }

    const shopifyProducts: ShopifyProduct[] = result.data?.products || [];

    if (shopifyProducts.length === 0) {
      hasMore = false;
    } else {
      for (const product of shopifyProducts) {
        const mapped = mapShopifyProduct(product, origin);
        allProducts.push(...mapped);
      }

      onProgress?.({ page, totalFetched: allProducts.length, hasMore: shopifyProducts.length >= 250 });

      if (shopifyProducts.length < 250) {
        hasMore = false;
      } else {
        page++;
      }
    }
  }

  return { products: allProducts, totalFetched: allProducts.length };
}

/**
 * Map a Shopify product to our canonical ExtractedProduct format.
 */
function mapShopifyProduct(product: ShopifyProduct, storeOrigin: string): ExtractedProduct[] {
  const sourceUrl = `${storeOrigin}/products/${product.handle}`;
  const primaryImage = product.images?.[0]?.src || '';
  const additionalImages = product.images?.slice(1).map(img => img.src) || [];

  const variants = product.variants || [];
  const isSingleVariant = variants.length <= 1 ||
    (variants.length === 1 && variants[0].title === 'Default Title');

  if (isSingleVariant) {
    const v = variants[0] || {} as ShopifyVariant;
    const brand = product.vendor || inferBrandFromTitle(product.title) || '';

    return [createExtractedProduct({
      source_product_name: product.title,
      brand,
      sell_price: parseFloat(v.price) || null,
      cost_price: v.compare_at_price ? parseFloat(v.compare_at_price) : null,
      sku: v.sku || '',
      barcode: v.barcode || '',
      short_description: stripHtml(product.body_html).substring(0, 200),
      full_description_html: product.body_html || '',
      product_type: product.product_type || '',
      manufacturer: product.vendor || '',
      weight_grams: v.grams || null,
      primary_image_url: primaryImage,
      additional_image_urls: additionalImages,
      stock_status: v.available ? 'In Stock' : 'Out of Stock',
      _extractionConfidence: 0.98,
      _extractionNotes: ['Shopify Products JSON API — high confidence'],
      _rawExtractedJson: product,
    }, sourceUrl)];
  }

  return variants.map(v => {
    const variantTitle = v.title !== 'Default Title' ? ` — ${v.title}` : '';
    const brand = product.vendor || inferBrandFromTitle(product.title) || '';
    const variantImage = v.featured_image?.src || primaryImage;

    return createExtractedProduct({
      source_product_name: `${product.title}${variantTitle}`,
      brand,
      sell_price: parseFloat(v.price) || null,
      cost_price: v.compare_at_price ? parseFloat(v.compare_at_price) : null,
      sku: v.sku || '',
      barcode: v.barcode || '',
      short_description: stripHtml(product.body_html).substring(0, 200),
      full_description_html: product.body_html || '',
      product_type: product.product_type || '',
      manufacturer: product.vendor || '',
      weight_grams: v.grams || null,
      primary_image_url: variantImage,
      additional_image_urls: additionalImages,
      stock_status: v.available ? 'In Stock' : 'Out of Stock',
      _extractionConfidence: 0.98,
      _extractionNotes: ['Shopify Products JSON API — high confidence'],
      _rawExtractedJson: { product, variant: v },
    }, sourceUrl);
  });
}
