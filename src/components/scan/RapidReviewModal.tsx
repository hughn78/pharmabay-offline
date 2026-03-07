import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import {
  ShoppingCart,
  Store,
  Save,
  SkipForward,
  CheckCircle,
  ArrowRight,
  Shield,
  Package,
  ImageIcon,
  DollarSign,
  Layers,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  productId: string | null;
  onClose: () => void;
  onSaveAndNext: () => void;
}

export function RapidReviewModal({ productId, onClose, onSaveAndNext }: Props) {
  const queryClient = useQueryClient();

  const { data: product, isLoading } = useQuery({
    queryKey: ["product", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", productId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!productId,
  });

  const { data: images = [] } = useQuery({
    queryKey: ["product-images", productId],
    queryFn: async () => {
      const { data } = await supabase
        .from("product_images")
        .select("*")
        .eq("product_id", productId!)
        .order("sort_order");
      return data || [];
    },
    enabled: !!productId,
  });

  const { data: ebayDraft } = useQuery({
    queryKey: ["ebay-draft", productId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ebay_drafts")
        .select("id, title, channel_status, start_price, quantity")
        .eq("product_id", productId!)
        .maybeSingle();
      return data;
    },
    enabled: !!productId,
  });

  const { data: shopifyDraft } = useQuery({
    queryKey: ["shopify-draft", productId],
    queryFn: async () => {
      const { data } = await supabase
        .from("shopify_drafts")
        .select("id, title, channel_status")
        .eq("product_id", productId!)
        .maybeSingle();
      return data;
    },
    enabled: !!productId,
  });

  // Local editable price/quantity
  const [editPrice, setEditPrice] = useState("");
  const [editQty, setEditQty] = useState("");

  useEffect(() => {
    if (product) {
      setEditPrice(product.sell_price?.toString() ?? "");
      setEditQty(product.stock_on_hand?.toString() ?? "");
    }
  }, [product]);

  const updateProduct = async (updates: Record<string, any>) => {
    const { error } = await supabase
      .from("products")
      .update(updates)
      .eq("id", productId!);
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ["product", productId] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  const upsertEbayDraft = async (status: string) => {
    if (ebayDraft) {
      await supabase
        .from("ebay_drafts")
        .update({ channel_status: status })
        .eq("id", ebayDraft.id);
    } else {
      await supabase.from("ebay_drafts").insert({
        product_id: productId!,
        title: product?.source_product_name?.substring(0, 80) ?? "",
        channel_status: status,
        start_price: product?.sell_price ? Number(product.sell_price) : null,
        quantity: product?.stock_on_hand ? Number(product.stock_on_hand) : 1,
        brand: product?.brand,
      });
    }
    queryClient.invalidateQueries({ queryKey: ["ebay-draft", productId] });
  };

  const upsertShopifyDraft = async (status: string) => {
    if (shopifyDraft) {
      await supabase
        .from("shopify_drafts")
        .update({ channel_status: status })
        .eq("id", shopifyDraft.id);
    } else {
      await supabase.from("shopify_drafts").insert({
        product_id: productId!,
        title: product?.source_product_name ?? "",
        channel_status: status,
        vendor: product?.brand,
      });
    }
    queryClient.invalidateQueries({ queryKey: ["shopify-draft", productId] });
  };

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      await updateProduct({
        sell_price: editPrice ? parseFloat(editPrice) : null,
        stock_on_hand: editQty ? parseFloat(editQty) : null,
      });
    },
    onSuccess: () => toast.success("Draft saved"),
    onError: (e: Error) => toast.error(e.message),
  });

  const markEbayReady = useMutation({
    mutationFn: async () => {
      await saveDraftMutation.mutateAsync();
      await upsertEbayDraft("ready");
    },
    onSuccess: () => toast.success("Marked eBay Ready"),
    onError: (e: Error) => toast.error(e.message),
  });

  const markShopifyReady = useMutation({
    mutationFn: async () => {
      await saveDraftMutation.mutateAsync();
      await upsertShopifyDraft("ready");
    },
    onSuccess: () => toast.success("Marked Shopify Ready"),
    onError: (e: Error) => toast.error(e.message),
  });

  const markBothReady = useMutation({
    mutationFn: async () => {
      await saveDraftMutation.mutateAsync();
      await upsertEbayDraft("ready");
      await upsertShopifyDraft("ready");
    },
    onSuccess: () => toast.success("Marked Both Ready"),
    onError: (e: Error) => toast.error(e.message),
  });

  const saveAndNext = useMutation({
    mutationFn: async () => {
      await saveDraftMutation.mutateAsync();
    },
    onSuccess: () => {
      toast.success("Saved — ready for next scan");
      onSaveAndNext();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isAnyPending =
    saveDraftMutation.isPending ||
    markEbayReady.isPending ||
    markShopifyReady.isPending ||
    markBothReady.isPending ||
    saveAndNext.isPending;

  const complianceCls =
    product?.compliance_status === "blocked"
      ? "status-blocked"
      : product?.compliance_status === "review_required"
      ? "status-review"
      : "status-permitted";

  const channelBadge = (status?: string | null) => {
    if (!status) return <Badge variant="outline" className="text-[10px]">No Draft</Badge>;
    const cls =
      status === "ready"
        ? "bg-emerald-500/15 text-emerald-700 border-emerald-300"
        : status === "published"
        ? "bg-blue-500/15 text-blue-700 border-blue-300"
        : status === "blocked" || status === "failed"
        ? "status-blocked"
        : "";
    return <Badge variant="outline" className={`text-[10px] ${cls}`}>{status}</Badge>;
  };

  const primaryImage = images.find((i: any) => i.is_primary) || images[0];

  return (
    <Dialog open={!!productId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[95vh] overflow-y-auto p-0">
        <DialogTitle className="sr-only">Rapid Review</DialogTitle>

        {isLoading || !product ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            Loading product...
          </div>
        ) : (
          <div className="flex flex-col">
            {/* Header */}
            <div className="p-5 pb-3 border-b bg-muted/30">
              <div className="flex items-start gap-4">
                {/* Image */}
                <div className="w-24 h-24 rounded-lg border bg-background flex items-center justify-center shrink-0 overflow-hidden">
                  {primaryImage?.local_storage_url || primaryImage?.original_url ? (
                    <img
                      src={primaryImage.local_storage_url || primaryImage.original_url}
                      alt={product.source_product_name || ""}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                  )}
                </div>

                {/* Title & Meta */}
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold leading-tight truncate">
                    {product.source_product_name || "Unnamed Product"}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className="text-xs font-mono text-muted-foreground">
                      {product.barcode || "No barcode"}
                    </span>
                    {product.sku && (
                      <span className="text-xs text-muted-foreground">SKU: {product.sku}</span>
                    )}
                    {product.brand && (
                      <Badge variant="secondary" className="text-[10px]">
                        {product.brand}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <Badge className={`text-[10px] ${complianceCls}`}>
                      <Shield className="h-2.5 w-2.5 mr-1" />
                      {product.compliance_status?.replace("_", " ") || "unknown"}
                    </Badge>
                    {product.compliance_reasons &&
                      (product.compliance_reasons as string[]).slice(0, 2).map((r, i) => (
                        <Badge key={i} variant="outline" className="text-[10px]">
                          {r}
                        </Badge>
                      ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              {/* Quick Stats Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard
                  icon={Package}
                  label="Stock"
                  value={product.stock_on_hand?.toString() ?? "—"}
                />
                <StatCard
                  icon={DollarSign}
                  label="Cost"
                  value={product.cost_price ? `$${Number(product.cost_price).toFixed(2)}` : "—"}
                />
                <StatCard
                  icon={DollarSign}
                  label="RRP"
                  value={product.sell_price ? `$${Number(product.sell_price).toFixed(2)}` : "—"}
                />
                <StatCard
                  icon={Layers}
                  label="Category"
                  value={product.z_category || product.department || "—"}
                />
              </div>

              {/* Editable Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Sell Price ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Available Qty</Label>
                  <Input
                    type="number"
                    value={editQty}
                    onChange={(e) => setEditQty(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>

              {/* Image Gallery */}
              {images.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">
                    Images ({images.length})
                  </Label>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {images.slice(0, 6).map((img: any) => (
                      <div
                        key={img.id}
                        className={`w-16 h-16 rounded border shrink-0 overflow-hidden ${
                          img.is_primary ? "ring-2 ring-primary" : ""
                        }`}
                      >
                        <img
                          src={img.local_storage_url || img.original_url}
                          alt=""
                          className="w-full h-full object-contain"
                        />
                      </div>
                    ))}
                    {images.length > 6 && (
                      <div className="w-16 h-16 rounded border shrink-0 flex items-center justify-center text-xs text-muted-foreground">
                        +{images.length - 6}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <Separator />

              {/* Channel Status */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 p-2.5 rounded-md border">
                  <ShoppingCart className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground">eBay</p>
                    {channelBadge(ebayDraft?.channel_status)}
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-md border">
                  <Store className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground">Shopify</p>
                    {channelBadge(shopifyDraft?.channel_status)}
                  </div>
                </div>
              </div>

              {/* Blocked warning */}
              {product.compliance_status === "blocked" && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  <Shield className="h-4 w-4 inline mr-1.5" />
                  This product is <strong>blocked</strong> from listing. A manager override is
                  required before it can be marked ready.
                </div>
              )}

              <Separator />

              {/* Action Buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  onClick={() => saveDraftMutation.mutate()}
                  disabled={isAnyPending}
                  className="gap-1.5"
                >
                  <Save className="h-3.5 w-3.5" />
                  Save Draft
                </Button>

                <Button
                  variant="outline"
                  onClick={() => markEbayReady.mutate()}
                  disabled={isAnyPending || product.compliance_status === "blocked"}
                  className="gap-1.5"
                >
                  <ShoppingCart className="h-3.5 w-3.5" />
                  eBay Ready
                </Button>

                <Button
                  variant="outline"
                  onClick={() => markShopifyReady.mutate()}
                  disabled={isAnyPending || product.compliance_status === "blocked"}
                  className="gap-1.5"
                >
                  <Store className="h-3.5 w-3.5" />
                  Shopify Ready
                </Button>

                <Button
                  onClick={() => markBothReady.mutate()}
                  disabled={isAnyPending || product.compliance_status === "blocked"}
                  className="gap-1.5"
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  Both Ready
                </Button>

                <Button
                  variant="ghost"
                  onClick={onClose}
                  disabled={isAnyPending}
                  className="gap-1.5"
                >
                  <SkipForward className="h-3.5 w-3.5" />
                  Skip
                </Button>

                <Button
                  variant="secondary"
                  onClick={() => saveAndNext.mutate()}
                  disabled={isAnyPending}
                  className="gap-1.5"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                  Save & Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-2.5 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
          <p className="text-sm font-medium truncate">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
