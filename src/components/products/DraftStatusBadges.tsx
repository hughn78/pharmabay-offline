import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Store } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface DraftStatusBadgesProps {
  productId: string;
  ebayDraftStatus: "none" | "draft" | "live";
  shopifyDraftStatus: "none" | "draft" | "live";
}

export function DraftStatusBadges({
  productId,
  ebayDraftStatus,
  shopifyDraftStatus,
}: DraftStatusBadgesProps) {
  const navigate = useNavigate();

  const colorMap = {
    none: "bg-muted text-muted-foreground",
    draft: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    live: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  };

  return (
    <div className="flex items-center gap-1">
      <Badge
        variant="outline"
        className={`text-[10px] px-1.5 py-0 cursor-pointer border-0 ${colorMap[ebayDraftStatus]}`}
        onClick={(e) => {
          e.stopPropagation();
          navigate(`/products/${productId}?tab=ebay`);
        }}
      >
        <ShoppingCart className="h-2.5 w-2.5 mr-0.5" />
        eBay
      </Badge>
      <Badge
        variant="outline"
        className={`text-[10px] px-1.5 py-0 cursor-pointer border-0 ${colorMap[shopifyDraftStatus]}`}
        onClick={(e) => {
          e.stopPropagation();
          navigate(`/products/${productId}?tab=shopify`);
        }}
      >
        <Store className="h-2.5 w-2.5 mr-0.5" />
        Shopify
      </Badge>
    </div>
  );
}
