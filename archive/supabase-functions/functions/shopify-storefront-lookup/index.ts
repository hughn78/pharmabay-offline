import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STOREFRONT_API_VERSION = "2025-01";

interface StorefrontProduct {
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  description: string;
  descriptionHtml: string;
  priceRange: {
    minVariantPrice: { amount: string; currencyCode: string };
    maxVariantPrice: { amount: string; currencyCode: string };
  };
  compareAtPriceRange: {
    minVariantPrice: { amount: string; currencyCode: string };
    maxVariantPrice: { amount: string; currencyCode: string };
  };
  images: {
    edges: Array<{ node: { url: string; altText: string | null; width: number; height: number } }>;
  };
  variants: {
    edges: Array<{
      node: {
        title: string;
        sku: string | null;
        barcode: string | null;
        price: { amount: string; currencyCode: string };
        compareAtPrice: { amount: string; currencyCode: string } | null;
        availableForSale: boolean;
      };
    }>;
  };
  tags: string[];
  availableForSale: boolean;
  onlineStoreUrl: string | null;
}

const PRODUCTS_QUERY = `
query SearchProducts($query: String!, $first: Int!) {
  search(query: $query, first: $first, types: PRODUCT) {
    edges {
      node {
        ... on Product {
          title
          handle
          vendor
          productType
          description
          descriptionHtml
          tags
          availableForSale
          onlineStoreUrl
          priceRange {
            minVariantPrice { amount currencyCode }
            maxVariantPrice { amount currencyCode }
          }
          compareAtPriceRange {
            minVariantPrice { amount currencyCode }
            maxVariantPrice { amount currencyCode }
          }
          images(first: 3) {
            edges {
              node { url altText width height }
            }
          }
          variants(first: 5) {
            edges {
              node {
                title
                sku
                barcode
                price { amount currencyCode }
                compareAtPrice { amount currencyCode }
                availableForSale
              }
            }
          }
        }
      }
    }
  }
}
`;

const PRODUCTS_BY_TITLE_QUERY = `
query ProductsByTitle($query: String!, $first: Int!) {
  products(first: $first, query: $query) {
    edges {
      node {
        title
        handle
        vendor
        productType
        description
        descriptionHtml
        tags
        availableForSale
        onlineStoreUrl
        priceRange {
          minVariantPrice { amount currencyCode }
          maxVariantPrice { amount currencyCode }
        }
        compareAtPriceRange {
          minVariantPrice { amount currencyCode }
          maxVariantPrice { amount currencyCode }
        }
        images(first: 3) {
          edges {
            node { url altText width height }
          }
        }
        variants(first: 5) {
          edges {
            node {
              title
              sku
              barcode
              price { amount currencyCode }
              compareAtPrice { amount currencyCode }
              availableForSale
            }
          }
        }
      }
    }
  }
}
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { store_domain, search_query, max_results = 10 } = await req.json();

    if (!store_domain || !search_query) {
      return new Response(
        JSON.stringify({ error: "store_domain and search_query are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize store domain
    let domain = store_domain.trim().toLowerCase();
    if (!domain.includes(".")) {
      domain = `${domain}.myshopify.com`;
    }
    if (domain.startsWith("http")) {
      domain = new URL(domain).hostname;
    }

    const endpoint = `https://${domain}/api/${STOREFRONT_API_VERSION}/graphql.json`;

    // Try the search query first (works on most stores)
    let products: StorefrontProduct[] = [];
    
    // Attempt 1: Use search API
    const searchRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: PRODUCTS_QUERY,
        variables: { query: search_query, first: Math.min(max_results, 20) },
      }),
    });

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.data?.search?.edges) {
        products = searchData.data.search.edges.map((e: { node: StorefrontProduct }) => e.node);
      }
    }

    // Attempt 2: If search returned nothing, try products query
    if (products.length === 0) {
      const prodRes = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: PRODUCTS_BY_TITLE_QUERY,
          variables: { query: search_query, first: Math.min(max_results, 20) },
        }),
      });

      if (prodRes.ok) {
        const prodData = await prodRes.json();
        if (prodData.data?.products?.edges) {
          products = prodData.data.products.edges.map((e: { node: StorefrontProduct }) => e.node);
        }
      } else {
        const errText = await prodRes.text();
        throw new Error(`Storefront API error (${prodRes.status}): ${errText}`);
      }
    }

    // Normalize response
    const results = products.map((p) => {
      const minPrice = parseFloat(p.priceRange?.minVariantPrice?.amount || "0");
      const maxPrice = parseFloat(p.priceRange?.maxVariantPrice?.amount || "0");
      const currency = p.priceRange?.minVariantPrice?.currencyCode || "AUD";
      const compareAt = parseFloat(p.compareAtPriceRange?.maxVariantPrice?.amount || "0");
      const imageUrl = p.images?.edges?.[0]?.node?.url || null;

      return {
        title: p.title,
        handle: p.handle,
        vendor: p.vendor,
        product_type: p.productType,
        description: p.description?.substring(0, 300),
        tags: p.tags || [],
        available: p.availableForSale,
        url: p.onlineStoreUrl || `https://${domain}/products/${p.handle}`,
        image_url: imageUrl,
        price_min: minPrice,
        price_max: maxPrice,
        compare_at_price: compareAt > 0 ? compareAt : null,
        currency,
        variants: (p.variants?.edges || []).map((v) => ({
          title: v.node.title,
          sku: v.node.sku,
          barcode: v.node.barcode,
          price: parseFloat(v.node.price?.amount || "0"),
          compare_at_price: v.node.compareAtPrice ? parseFloat(v.node.compareAtPrice.amount) : null,
          available: v.node.availableForSale,
        })),
      };
    });

    return new Response(
      JSON.stringify({
        store: domain,
        query: search_query,
        result_count: results.length,
        products: results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
