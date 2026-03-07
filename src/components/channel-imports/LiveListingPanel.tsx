import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Store, Globe } from "lucide-react";

interface Props {
  productId: string;
}

export function LiveListingPanel({ productId }: Props) {
  const { data: ebayListing } = useQuery({
    queryKey: ["ebay-live-listing", productId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ebay_live_listings")
        .select("*")
        .eq("product_id", productId)
        .order("imported_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: shopifyListings = [] } = useQuery({
    queryKey: ["shopify-live-listing", productId],
    queryFn: async () => {
      const { data } = await supabase
        .from("shopify_live_products")
        .select("*")
        .eq("product_id", productId)
        .order("imported_at", { ascending: false })
        .limit(5);
      return data || [];
    },
  });

  const hasEbay = !!ebayListing;
  const hasShopify = shopifyListings.length > 0;

  if (!hasEbay && !hasShopify) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Globe className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="font-medium">No live listings imported</p>
          <p className="text-sm">Import eBay or Shopify CSVs from Channel Imports to see live online data here.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {hasEbay && (
        <Card className="border-primary/20">
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">eBay Live Listing</span>
              <Badge className="text-[10px]">Online</Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <Field label="Item Number" value={ebayListing.ebay_item_number} mono />
              <Field label="Title" value={ebayListing.title} />
              <Field label="SKU" value={ebayListing.custom_label_sku} mono />
              <Field label="Price" value={ebayListing.current_price != null ? `$${ebayListing.current_price}` : null} />
              <Field label="Available Qty" value={ebayListing.available_quantity} />
              <Field label="Sold Qty" value={ebayListing.sold_quantity} />
              <Field label="Format" value={ebayListing.format} />
              <Field label="Watchers" value={ebayListing.watchers} />
              <Field label="Condition" value={ebayListing.condition} />
              <Field label="Category" value={ebayListing.ebay_category_1_name} />
              <Field label="UPC" value={ebayListing.upc} mono />
              <Field label="EAN" value={ebayListing.ean} mono />
              <Field label="ePID" value={ebayListing.ebay_product_id_epid} mono />
              <Field label="Start Date" value={ebayListing.start_date} />
              <Field label="End Date" value={ebayListing.end_date} />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Last imported: {new Date(ebayListing.imported_at).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      )}

      {hasShopify && (
        <Card className="border-primary/20">
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Shopify Live Product</span>
              <Badge className="text-[10px]">Online</Badge>
              {shopifyListings.length > 1 && (
                <Badge variant="outline" className="text-[10px]">{shopifyListings.length} variants/rows</Badge>
              )}
            </div>
            {shopifyListings.map((listing: any, idx: number) => (
              <div key={listing.id} className="space-y-2">
                {idx > 0 && <div className="border-t pt-2" />}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <Field label="Handle" value={listing.handle} mono />
                  <Field label="Title" value={listing.title} />
                  <Field label="Vendor" value={listing.vendor} />
                  <Field label="SKU" value={listing.variant_sku} mono />
                  <Field label="Barcode" value={listing.variant_barcode} mono />
                  <Field label="Price" value={listing.variant_price != null ? `$${listing.variant_price}` : null} />
                  <Field label="Compare At" value={listing.variant_compare_at_price != null ? `$${listing.variant_compare_at_price}` : null} />
                  <Field label="Cost" value={listing.cost_per_item != null ? `$${listing.cost_per_item}` : null} />
                  <Field label="Type" value={listing.type} />
                  <Field label="Status" value={listing.status} />
                  <Field label="Tags" value={listing.tags} />
                  <Field label="Published" value={listing.published} />
                </div>
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground">
              Last imported: {new Date(shopifyListings[0].imported_at).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div>
      <span className="text-[10px] uppercase text-muted-foreground font-medium">{label}</span>
      <p className={`text-sm truncate ${mono ? "font-mono" : ""}`}>
        {value != null && value !== "" ? String(value) : "—"}
      </p>
    </div>
  );
}
