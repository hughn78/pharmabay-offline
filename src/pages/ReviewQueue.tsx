import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle, CheckCircle, XCircle, Download, ShoppingCart, Store, Trash2,
} from "lucide-react";
import { ComplianceBadgeWithOverride } from "@/components/compliance/ComplianceBadgeWithOverride";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Papa from "papaparse";

// eBay File Exchange header
const EBAY_HEADERS = [
  "*Action(SiteID=Australia|Country=AU|Currency=AUD|Version=941)",
  "*Category", "Product:UPC", "Product:EAN", "Product:EPID", "Product:Brand",
  "Product:MPN", "Product:IncludePreFilledItemInformation",
  "Product:IncludeStockPhotoURL", "Product:ReturnSearchResultsOnDuplicates",
  "Title", "Subtitle", "Description", "*ConditionID", "PicURL",
  "*Quantity", "*Format", "*StartPrice", "BuyItNowPrice", "*Duration",
  "ImmediatePayRequired", "*Location", "ShippingType",
  "ShippingService-1:Option", "ShippingService-1:Cost", "ShippingService-1:Priority",
  "ShippingService-2:Option", "ShippingService-2:Cost", "ShippingService-2:Priority",
  "DispatchTimeMax", "CustomLabel", "ReturnsAcceptedOption", "RefundOption",
  "ReturnsWithinOption", "ShippingCostPaidByOption", "AdditionalDetails",
  "ShippingProfileName", "ReturnProfileName", "PaymentProfileName",
];

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type DraftTable = "ebay_drafts" | "shopify_drafts";

async function fetchQueuedDraftsWithProducts(table: DraftTable) {
  const { data: drafts, error: draftsError } = await supabase
    .from(table)
    .select("*")
    .eq("channel_status", "queued")
    .order("created_at", { ascending: false });

  if (draftsError) throw draftsError;

  const productIds = Array.from(
    new Set((drafts || []).map((d: any) => d.product_id).filter(Boolean))
  );

  if (productIds.length === 0) {
    return drafts || [];
  }

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, source_product_name, barcode, sku, stock_on_hand, sell_price, cost_price, compliance_status, compliance_reasons, brand, weight_grams")
    .in("id", productIds);

  if (productsError) throw productsError;

  const productMap = new Map((products || []).map((p: any) => [p.id, p]));
  return (drafts || []).map((d: any) => ({
    ...d,
    products: d.product_id ? (productMap.get(d.product_id) || null) : null,
  }));
}

export default function ReviewQueue() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("ebay");
  const [selectedEbay, setSelectedEbay] = useState<Set<string>>(new Set());
  const [selectedShopify, setSelectedShopify] = useState<Set<string>>(new Set());

  // eBay queued drafts
  const { data: ebayDrafts = [], isLoading: loadingEbay } = useQuery({
    queryKey: ["review-queue", "ebay"],
    queryFn: async () => fetchQueuedDraftsWithProducts("ebay_drafts"),
  });

  // Shopify queued drafts
  const { data: shopifyDrafts = [], isLoading: loadingShopify } = useQuery({
    queryKey: ["review-queue", "shopify"],
    queryFn: async () => fetchQueuedDraftsWithProducts("shopify_drafts"),
  });

  // Compliance review items (existing behavior)
  const { data: reviewItems = [], isLoading: loadingReview } = useQuery({
    queryKey: ["review-queue", "compliance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .or("compliance_status.eq.blocked,compliance_status.eq.review_required,enrichment_confidence.eq.low")
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const toggleSelect = (set: Set<string>, setFn: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => {
    setFn(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = (items: any[], set: Set<string>, setFn: React.Dispatch<React.SetStateAction<Set<string>>>) => {
    if (set.size === items.length && items.length > 0) {
      setFn(new Set());
    } else {
      setFn(new Set(items.map((d: any) => d.id)));
    }
  };

  const handleRemoveFromQueue = async (channel: "ebay" | "shopify") => {
    const ids = channel === "ebay" ? Array.from(selectedEbay) : Array.from(selectedShopify);
    if (ids.length === 0) return;
    const table = channel === "ebay" ? "ebay_drafts" : "shopify_drafts";
    await supabase.from(table).update({ channel_status: "draft" }).in("id", ids);
    toast.success(`${ids.length} items removed from queue`);
    channel === "ebay" ? setSelectedEbay(new Set()) : setSelectedShopify(new Set());
    queryClient.invalidateQueries({ queryKey: ["review-queue"] });
  };

  const handleExportEbayCsv = async () => {
    const targets = selectedEbay.size > 0
      ? ebayDrafts.filter((d: any) => selectedEbay.has(d.id))
      : ebayDrafts;
    if (targets.length === 0) { toast.error("No items to export"); return; }

    // Fetch images for all product IDs
    const productIds = targets.map((d: any) => d.product_id).filter(Boolean);
    const { data: allImages } = await supabase
      .from("product_images")
      .select("product_id, original_url, local_storage_url, sort_order")
      .in("product_id", productIds)
      .order("sort_order");
    const imageMap = new Map<string, string[]>();
    (allImages || []).forEach((img: any) => {
      const url = img.local_storage_url || img.original_url;
      if (!url) return;
      const list = imageMap.get(img.product_id) || [];
      list.push(url);
      imageMap.set(img.product_id, list);
    });

    const rows = targets.map((d: any) => {
      const picUrls = (d.image_urls?.length ? d.image_urls : imageMap.get(d.product_id) || []).join("|");
      return [
        "Add", // Action
        d.category_id || "", // Category
        d.upc || "", // UPC
        d.ean || "", // EAN
        d.epid || "", // EPID
        d.brand || d.products?.brand || "", // Brand
        d.mpn || "", // MPN
        "TRUE", // IncludePreFilledItemInformation
        "TRUE", // IncludeStockPhotoURL
        "TRUE", // ReturnSearchResultsOnDuplicates
        (d.title || "").substring(0, 80), // Title
        d.subtitle || "", // Subtitle
        d.description_html || d.description_plain || "", // Description
        d.condition_id || "1000", // ConditionID
        picUrls, // PicURL
        d.quantity ?? 0, // Quantity
        d.pricing_mode || "FixedPrice", // Format
        d.start_price ?? d.products?.sell_price ?? "", // StartPrice
        d.buy_it_now_price || "", // BuyItNowPrice
        "GTC", // Duration
        "TRUE", // ImmediatePayRequired
        "", // Location
        "", // ShippingType
        "", "", "", // Shipping 1
        "", "", "", // Shipping 2
        "3", // DispatchTimeMax
        d.products?.sku || "", // CustomLabel
        "ReturnsAccepted", // ReturnsAcceptedOption
        "MoneyBack", // RefundOption
        "Days_30", // ReturnsWithinOption
        "Buyer", // ShippingCostPaidByOption
        "", // AdditionalDetails
        "", "", "", // Profile names
      ];
    });

    const csvContent = [EBAY_HEADERS.join(","), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    downloadCsv(csvContent, `ebay-file-exchange-${new Date().toISOString().slice(0, 10)}.csv`);

    // Mark exported
    const exportedIds = targets.map((d: any) => d.id);
    await supabase.from("ebay_drafts").update({ channel_status: "exported" }).in("id", exportedIds);
    await supabase.from("export_batches").insert({
      batch_name: `eBay Export ${new Date().toLocaleDateString()}`,
      platform: "ebay",
      product_count: targets.length,
    });

    toast.success(`Exported ${targets.length} eBay listings`);
    queryClient.invalidateQueries({ queryKey: ["review-queue"] });
    queryClient.invalidateQueries({ queryKey: ["export-batches"] });
  };

  const handleExportShopifyCsv = async () => {
    const targets = selectedShopify.size > 0
      ? shopifyDrafts.filter((d: any) => selectedShopify.has(d.id))
      : shopifyDrafts;
    if (targets.length === 0) { toast.error("No items to export"); return; }

    // Fetch images
    const productIds = targets.map((d: any) => d.product_id).filter(Boolean);
    const { data: allImages } = await supabase
      .from("product_images")
      .select("product_id, original_url, local_storage_url, sort_order, alt_text")
      .in("product_id", productIds)
      .order("sort_order");
    const imageMap = new Map<string, any[]>();
    (allImages || []).forEach((img: any) => {
      const list = imageMap.get(img.product_id) || [];
      list.push(img);
      imageMap.set(img.product_id, list);
    });

    // Fetch variants
    const draftIds = targets.map((d: any) => d.id);
    const { data: allVariants } = await supabase
      .from("shopify_variants")
      .select("*")
      .in("shopify_draft_id", draftIds);
    const variantMap = new Map<string, any[]>();
    (allVariants || []).forEach((v: any) => {
      const list = variantMap.get(v.shopify_draft_id) || [];
      list.push(v);
      variantMap.set(v.shopify_draft_id, list);
    });

    const shopifyHeaders = [
      "Handle", "Title", "Body (HTML)", "Vendor", "Product Category", "Type", "Tags",
      "Published", "Option1 Name", "Option1 Value",
      "Variant SKU", "Variant Grams", "Variant Inventory Qty",
      "Variant Price", "Variant Compare At Price", "Variant Requires Shipping",
      "Variant Barcode", "Image Src", "Image Alt Text",
      "SEO Title", "SEO Description", "Status",
    ];

    const rows: string[][] = [];

    targets.forEach((d: any) => {
      const product = d.products || {};
      const images = imageMap.get(d.product_id) || [];
      const variants = variantMap.get(d.id) || [];
      const handle = d.handle || (d.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const tags = (d.tags || []).join(", ");

      // If no variants, create a single row
      const variantRows = variants.length > 0 ? variants : [null];

      variantRows.forEach((v: any, vi: number) => {
        const isFirst = vi === 0;
        const img = images[vi];
        rows.push([
          handle,
          isFirst ? (d.title || product.source_product_name || "") : "",
          isFirst ? (d.description_html || "") : "",
          isFirst ? (d.vendor || product.brand || "") : "",
          isFirst ? (d.product_category || "") : "",
          isFirst ? (d.product_type || "") : "",
          isFirst ? tags : "",
          isFirst ? (d.published_online_store ? "TRUE" : "FALSE") : "",
          v?.option1_name || (isFirst ? "Title" : ""),
          v?.option1_value || (isFirst ? "Default Title" : ""),
          v?.sku || product.sku || "",
          v?.weight_value_grams || product.weight_grams || "200",
          String(v?.inventory_quantity ?? product.stock_on_hand ?? 0),
          String(v?.price ?? product.sell_price ?? ""),
          v?.compare_at_price ? String(v.compare_at_price) : "",
          "TRUE",
          v?.barcode || product.barcode || "",
          img ? (img.local_storage_url || img.original_url || "") : "",
          img?.alt_text || "",
          isFirst ? (d.seo_title || "") : "",
          isFirst ? (d.seo_description || "") : "",
          isFirst ? (d.status || "draft") : "",
        ]);
      });

      // Extra image rows
      images.slice(variantRows.length).forEach((img: any) => {
        const emptyRow = new Array(shopifyHeaders.length).fill("");
        emptyRow[0] = handle;
        emptyRow[shopifyHeaders.indexOf("Image Src")] = img.local_storage_url || img.original_url || "";
        emptyRow[shopifyHeaders.indexOf("Image Alt Text")] = img.alt_text || "";
        rows.push(emptyRow);
      });
    });

    const csvContent = Papa.unparse({ fields: shopifyHeaders, data: rows });
    downloadCsv(csvContent, `shopify-import-${new Date().toISOString().slice(0, 10)}.csv`);

    // Mark exported
    const exportedIds = targets.map((d: any) => d.id);
    await supabase.from("shopify_drafts").update({ channel_status: "exported" }).in("id", exportedIds);
    await supabase.from("export_batches").insert({
      batch_name: `Shopify Export ${new Date().toLocaleDateString()}`,
      platform: "shopify",
      product_count: targets.length,
    });

    toast.success(`Exported ${targets.length} Shopify products`);
    queryClient.invalidateQueries({ queryKey: ["review-queue"] });
    queryClient.invalidateQueries({ queryKey: ["export-batches"] });
  };

  const blockedCount = reviewItems.filter((p: any) => p.compliance_status === "blocked").length;
  const reviewCount = reviewItems.filter((p: any) => p.compliance_status === "review_required").length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Review Queue</h1>
        <p className="text-muted-foreground text-sm">Review queued items and export to channel CSV templates</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">eBay Queue</p>
                <p className="text-2xl font-bold mt-1">{ebayDrafts.length}</p>
              </div>
              <ShoppingCart className="h-6 w-6 text-muted-foreground opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Shopify Queue</p>
                <p className="text-2xl font-bold mt-1">{shopifyDrafts.length}</p>
              </div>
              <Store className="h-6 w-6 text-muted-foreground opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Blocked</p>
                <p className="text-2xl font-bold mt-1">{blockedCount}</p>
              </div>
              <XCircle className="h-6 w-6 text-destructive opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Needs Review</p>
                <p className="text-2xl font-bold mt-1">{reviewCount}</p>
              </div>
              <AlertTriangle className="h-6 w-6 text-warning opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="ebay" className="gap-1.5">
            <ShoppingCart className="h-3.5 w-3.5" /> eBay ({ebayDrafts.length})
          </TabsTrigger>
          <TabsTrigger value="shopify" className="gap-1.5">
            <Store className="h-3.5 w-3.5" /> Shopify ({shopifyDrafts.length})
          </TabsTrigger>
          <TabsTrigger value="compliance" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Compliance ({reviewItems.length})
          </TabsTrigger>
        </TabsList>

        {/* eBay Tab */}
        <TabsContent value="ebay">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">eBay Queued Items</CardTitle>
                <div className="flex gap-2">
                  {selectedEbay.size > 0 && (
                    <Button size="sm" variant="outline" onClick={() => handleRemoveFromQueue("ebay")}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove ({selectedEbay.size})
                    </Button>
                  )}
                  <Button size="sm" onClick={handleExportEbayCsv} disabled={ebayDrafts.length === 0}>
                    <Download className="h-3.5 w-3.5 mr-1" />
                    Export eBay CSV {selectedEbay.size > 0 ? `(${selectedEbay.size})` : `(All ${ebayDrafts.length})`}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ChannelTable
                items={ebayDrafts}
                isLoading={loadingEbay}
                selectedIds={selectedEbay}
                onToggle={(id) => toggleSelect(selectedEbay, setSelectedEbay, id)}
                onToggleAll={() => toggleAll(ebayDrafts, selectedEbay, setSelectedEbay)}
                channel="ebay"
                onNavigate={(productId) => navigate(`/products/${productId}`)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Shopify Tab */}
        <TabsContent value="shopify">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Shopify Queued Items</CardTitle>
                <div className="flex gap-2">
                  {selectedShopify.size > 0 && (
                    <Button size="sm" variant="outline" onClick={() => handleRemoveFromQueue("shopify")}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove ({selectedShopify.size})
                    </Button>
                  )}
                  <Button size="sm" onClick={handleExportShopifyCsv} disabled={shopifyDrafts.length === 0}>
                    <Download className="h-3.5 w-3.5 mr-1" />
                    Export Shopify CSV {selectedShopify.size > 0 ? `(${selectedShopify.size})` : `(All ${shopifyDrafts.length})`}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ChannelTable
                items={shopifyDrafts}
                isLoading={loadingShopify}
                selectedIds={selectedShopify}
                onToggle={(id) => toggleSelect(selectedShopify, setSelectedShopify, id)}
                onToggleAll={() => toggleAll(shopifyDrafts, selectedShopify, setSelectedShopify)}
                channel="shopify"
                onNavigate={(productId) => navigate(`/products/${productId}`)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Compliance Tab */}
        <TabsContent value="compliance">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Items Requiring Compliance Review</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingReview ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : reviewItems.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">All clear!</p>
                  <p className="text-sm">No products require compliance review.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {reviewItems.map((p: any) => (
                    <button
                      key={p.id}
                      onClick={() => navigate(`/products/${p.id}`)}
                      className="w-full text-left p-3 rounded-lg border hover:bg-muted/30 transition-colors flex items-center justify-between"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{p.source_product_name}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">
                          {p.barcode || p.sku || "No identifier"}
                        </div>
                        {p.compliance_reasons && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {(p.compliance_reasons as string[]).slice(0, 3).map((r: string, i: number) => (
                              <Badge key={i} variant="outline" className="text-[10px]">{r}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 ml-3" onClick={(e) => e.stopPropagation()}>
                        <ComplianceBadgeWithOverride
                          productId={p.id}
                          productName={p.source_product_name || ""}
                          status={p.compliance_status}
                          reasons={p.compliance_reasons as string[] | null}
                        />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ChannelTable({
  items, isLoading, selectedIds, onToggle, onToggleAll, channel, onNavigate,
}: {
  items: any[];
  isLoading: boolean;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  channel: "ebay" | "shopify";
  onNavigate: (productId: string) => void;
}) {
  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading...</div>;
  }
  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground px-4">
        <Download className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm font-medium">No items queued</p>
        <p className="text-xs mt-1">Select products and click "Mark {channel === "ebay" ? "eBay" : "Shopify"} Ready" to queue them here.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={selectedIds.size === items.length && items.length > 0}
                onCheckedChange={onToggleAll}
              />
            </TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Barcode</TableHead>
            <TableHead>Brand</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Compliance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((d: any) => {
            const p = d.products || {};
            return (
              <TableRow
                key={d.id}
                className="cursor-pointer hover:bg-muted/30"
                onClick={() => d.product_id && onNavigate(d.product_id)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.has(d.id)}
                    onCheckedChange={() => onToggle(d.id)}
                  />
                </TableCell>
                <TableCell className="font-medium max-w-[300px] truncate">
                  {d.title || p.source_product_name || "—"}
                </TableCell>
                <TableCell className="font-mono text-xs">{d.ean || p.barcode || "—"}</TableCell>
                <TableCell>{d.brand || p.brand || "—"}</TableCell>
                <TableCell>{d.quantity ?? p.stock_on_hand ?? "—"}</TableCell>
                <TableCell>
                  {channel === "ebay"
                    ? (d.start_price ? `$${Number(d.start_price).toFixed(2)}` : "—")
                    : (p.sell_price ? `$${Number(p.sell_price).toFixed(2)}` : "—")}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {p.compliance_status ? (
                    <ComplianceBadgeWithOverride
                      productId={d.product_id || ""}
                      productName={p.source_product_name || ""}
                      status={p.compliance_status}
                      reasons={p.compliance_reasons as string[] | null}
                    />
                  ) : (
                    <Badge variant="outline" className="text-[10px]">Unknown</Badge>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
