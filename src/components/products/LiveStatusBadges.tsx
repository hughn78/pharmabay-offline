import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Store } from "lucide-react";

interface Props {
  ebayLive?: any;
  shopifyLive?: any;
}

export function LiveStatusBadges({ ebayLive, shopifyLive }: Props) {
  if (!ebayLive && !shopifyLive) return null;
  return (
    <div className="flex gap-1">
      {ebayLive && (
        <Badge variant="outline" className="text-[10px] gap-1 border-primary/40 text-primary">
          <ShoppingCart className="h-2.5 w-2.5" /> eBay
        </Badge>
      )}
      {shopifyLive && (
        <Badge variant="outline" className="text-[10px] gap-1 border-primary/40 text-primary">
          <Store className="h-2.5 w-2.5" /> Shopify
        </Badge>
      )}
    </div>
  );
}
