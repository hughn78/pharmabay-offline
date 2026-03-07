import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches which product IDs have live eBay/Shopify listings.
 * Returns sets for O(1) lookup and maps for price/qty data.
 */
export function useProductLiveStatus(productIds: string[]) {
  const { data: ebayMap = new Map() } = useQuery({
    queryKey: ["ebay-live-status", productIds],
    queryFn: async () => {
      if (productIds.length === 0) return new Map();
      const { data } = await supabase
        .from("ebay_live_listings")
        .select("product_id, ebay_item_number, current_price, available_quantity, title")
        .in("product_id", productIds)
        .order("imported_at", { ascending: false });
      const map = new Map<string, any>();
      (data || []).forEach((row) => {
        if (row.product_id && !map.has(row.product_id)) {
          map.set(row.product_id, row);
        }
      });
      return map;
    },
    enabled: productIds.length > 0,
  });

  const { data: shopifyMap = new Map() } = useQuery({
    queryKey: ["shopify-live-status", productIds],
    queryFn: async () => {
      if (productIds.length === 0) return new Map();
      const { data } = await supabase
        .from("shopify_live_products")
        .select("product_id, handle, variant_price, variant_sku, status, title")
        .in("product_id", productIds)
        .order("imported_at", { ascending: false });
      const map = new Map<string, any>();
      (data || []).forEach((row) => {
        if (row.product_id && !map.has(row.product_id)) {
          map.set(row.product_id, row);
        }
      });
      return map;
    },
    enabled: productIds.length > 0,
  });

  return { ebayMap, shopifyMap };
}
