import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ShoppingCart, Store, AlertTriangle } from "lucide-react";

interface Props {
  productId: string;
  channel: "ebay" | "shopify";
  draft?: any;
}

export function LiveOnlineStateCard({ productId, channel, draft }: Props) {
  const { data: ebayListing } = useQuery({
    queryKey: ["ebay-live-listing-single", productId],
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
    enabled: channel === "ebay",
  });

  const { data: shopifyListing } = useQuery({
    queryKey: ["shopify-live-listing-single", productId],
    queryFn: async () => {
      const { data } = await supabase
        .from("shopify_live_products")
        .select("*")
        .eq("product_id", productId)
        .order("imported_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: channel === "shopify",
  });

  if (channel === "ebay") {
    if (!ebayListing) return null;

    // Detect diffs between live and draft
    const diffs: string[] = [];
    if (draft) {
      const livePrice = Number(ebayListing.current_price || 0);
      const draftPrice = Number(draft.start_price || draft.buy_it_now_price || 0);
      if (draftPrice > 0 && livePrice > 0 && Math.abs(livePrice - draftPrice) > 0.01) {
        diffs.push(`Price: Online $${livePrice.toFixed(2)} → Draft $${draftPrice.toFixed(2)}`);
      }
      if (draft.title && ebayListing.title && draft.title !== ebayListing.title) {
        diffs.push("Title differs");
      }
      const liveQty = ebayListing.available_quantity;
      const draftQty = draft.quantity;
      if (liveQty != null && draftQty != null && liveQty !== draftQty) {
        diffs.push(`Qty: Online ${liveQty} → Draft ${draftQty}`);
      }
    }

    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4 space-y-2">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold uppercase text-primary">Current Online State</span>
            <Badge className="text-[10px]">Live</Badge>
          </div>
          {diffs.length > 0 && (
            <div className="flex items-start gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-700 dark:text-amber-400 space-y-0.5">
                {diffs.map((d, i) => <p key={i}>{d}</p>)}
              </div>
            </div>
          )}
          <Separator />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <Field label="Item Number" value={ebayListing.ebay_item_number} mono />
            <Field label="Online Title" value={ebayListing.title} />
            <Field label="Online Price" value={ebayListing.current_price != null ? `$${ebayListing.current_price}` : null} />
            <Field label="Available Qty" value={ebayListing.available_quantity} />
            <Field label="Sold Qty" value={ebayListing.sold_quantity} />
            <Field label="SKU" value={ebayListing.custom_label_sku} mono />
            <Field label="UPC" value={ebayListing.upc} mono />
            <Field label="EAN" value={ebayListing.ean} mono />
            <Field label="Format" value={ebayListing.format} />
            <Field label="Watchers" value={ebayListing.watchers} />
            <Field label="Category" value={ebayListing.ebay_category_1_name} />
            <Field label="Condition" value={ebayListing.condition} />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Imported: {new Date(ebayListing.imported_at).toLocaleString()}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!shopifyListing) return null;

  // Detect Shopify diffs
  const shopifyDiffs: string[] = [];
  if (draft) {
    if (draft.title && shopifyListing.title && draft.title !== shopifyListing.title) {
      shopifyDiffs.push("Title differs");
    }
    const livePrice = Number(shopifyListing.variant_price || 0);
    const draftProduct = draft; // shopify draft doesn't store price directly, but we can check
    if (draft.vendor && shopifyListing.vendor && draft.vendor !== shopifyListing.vendor) {
      shopifyDiffs.push("Vendor differs");
    }
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="pt-4 space-y-2">
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase text-primary">Current Online State</span>
          <Badge className="text-[10px]">Live</Badge>
        </div>
        {shopifyDiffs.length > 0 && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-700 dark:text-amber-400 space-y-0.5">
              {shopifyDiffs.map((d, i) => <p key={i}>{d}</p>)}
            </div>
          </div>
        )}
        <Separator />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <Field label="Handle" value={shopifyListing.handle} mono />
          <Field label="Online Title" value={shopifyListing.title} />
          <Field label="Vendor" value={shopifyListing.vendor} />
          <Field label="SKU" value={shopifyListing.variant_sku} mono />
          <Field label="Barcode" value={shopifyListing.variant_barcode} mono />
          <Field label="Price" value={shopifyListing.variant_price != null ? `$${shopifyListing.variant_price}` : null} />
          <Field label="Compare At" value={shopifyListing.variant_compare_at_price != null ? `$${shopifyListing.variant_compare_at_price}` : null} />
          <Field label="Cost" value={shopifyListing.cost_per_item != null ? `$${shopifyListing.cost_per_item}` : null} />
          <Field label="Type" value={shopifyListing.type} />
          <Field label="Status" value={shopifyListing.status} />
          <Field label="Tags" value={shopifyListing.tags} />
          <Field label="Published" value={shopifyListing.published} />
        </div>
        <p className="text-[10px] text-muted-foreground">
          Imported: {new Date(shopifyListing.imported_at).toLocaleString()}
        </p>
      </CardContent>
    </Card>
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
