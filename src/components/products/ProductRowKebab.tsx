import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreVertical, Plus, Minus, ShoppingCart, Store, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useExportCart } from "@/stores/useExportCart";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import Papa from "papaparse";

interface ProductRowKebabProps {
  product: {
    id: string;
    source_product_name: string | null;
    barcode: string | null;
    sku: string | null;
    brand: string | null;
    sell_price: number | null;
    stock_on_hand: number | null;
    quantity_available_for_ebay: number | null;
    full_description_html: string | null;
  };
}

export function ProductRowKebab({ product }: ProductRowKebabProps) {
  const { selectedIds, toggleProduct } = useExportCart();
  const navigate = useNavigate();
  const inCart = selectedIds.has(product.id);

  const quickExportEbay = async () => {
    try {
      const { data: draft } = await supabase
        .from("ebay_drafts")
        .select("*")
        .eq("product_id", product.id)
        .maybeSingle();

      const title = draft?.title || product.source_product_name || "";
      const categoryId = draft?.category_id || "";
      const sku = draft?.ebay_inventory_sku || product.sku || product.barcode || "";
      const price = draft?.start_price || draft?.buy_it_now_price || product.sell_price || 0;
      const qty = draft?.quantity ?? product.quantity_available_for_ebay ?? Math.max(0, Number(product.stock_on_hand) || 0);
      const conditionId = draft?.condition_id || "1000";
      const descHtml = draft?.description_html || product.full_description_html || "";
      const imageUrls = (draft?.image_urls || []).join("|");
      const upc = draft?.upc || product.barcode || "";

      const bom = "\uFEFF";
      const info = `#INFO Version=0.0.2\n`;
      const headers = ["Action", "Category ID", "Custom label (SKU)", "Title", "UPC", "Start price", "Quantity", "Item photo URL", "Condition ID", "Description", "Format"];
      const row = ["Draft", categoryId, sku, title, upc, String(price), String(qty), imageUrls, conditionId, descHtml, "FixedPrice"];
      const csv = bom + info + Papa.unparse({ fields: headers, data: [row] });

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ebay_${(product.sku || product.barcode || "product").replace(/[^a-zA-Z0-9]/g, "_")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("eBay CSV downloaded");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Quick export failed: " + msg);
    }
  };

  const quickExportShopify = async () => {
    try {
      const { data: draft } = await supabase
        .from("shopify_drafts")
        .select("*")
        .eq("product_id", product.id)
        .maybeSingle();

      const handle = draft?.handle || (product.source_product_name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const title = draft?.title || product.source_product_name || "";
      const vendor = draft?.vendor || product.brand || "";
      const productType = draft?.product_type || "";
      const tags = (draft?.tags || []).join(",");

      const headers = ["Handle", "Title", "Body (HTML)", "Vendor", "Type", "Tags", "Published", "Variant SKU", "Variant Price", "Variant Barcode", "Status"];
      const row = [handle, title, draft?.description_html || "", vendor, productType, tags, "true", product.sku || "", String(product.sell_price || ""), product.barcode || "", draft?.status || "draft"];
      const csv = Papa.unparse({ fields: headers, data: [row] });

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `shopify_${(product.sku || product.barcode || "product").replace(/[^a-zA-Z0-9]/g, "_")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Shopify CSV downloaded");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Quick export failed: " + msg);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <MoreVertical className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => toggleProduct(product.id)}>
          {inCart ? (
            <><Minus className="h-3.5 w-3.5 mr-2" /> Remove from Export</>
          ) : (
            <><Plus className="h-3.5 w-3.5 mr-2" /> Add to Export</>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={quickExportEbay}>
          <ShoppingCart className="h-3.5 w-3.5 mr-2" /> Quick Export for eBay
        </DropdownMenuItem>
        <DropdownMenuItem onClick={quickExportShopify}>
          <Store className="h-3.5 w-3.5 mr-2" /> Quick Export for Shopify
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate(`/products/${product.id}`)}>
          <ExternalLink className="h-3.5 w-3.5 mr-2" /> Open in Editor
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
