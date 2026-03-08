import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Package, Search, RefreshCw, Download } from "lucide-react";
import { ComplianceBadgeWithOverride } from "@/components/compliance/ComplianceBadgeWithOverride";
import { LiveStatusBadges } from "@/components/products/LiveStatusBadges";
import { fullComplianceCheck } from "@/lib/compliance-engine";
import { buildSafeIlikeOr } from "@/lib/search-utils";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useProductLiveStatus } from "@/hooks/useProductLiveStatus";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Papa from "papaparse";

export default function Products() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [complianceFilter, setComplianceFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isRunningCompliance, setIsRunningCompliance] = useState(false);
  const queryClient = useQueryClient();

  const { data: complianceRules = [] } = useQuery({
    queryKey: ["compliance-rules"],
    queryFn: async () => {
      const { data } = await supabase.from("compliance_rules").select("*").order("priority");
      return data || [];
    },
  });

  const handleRunCompliance = async () => {
    const targets = selectedIds.size > 0
      ? products.filter((p: any) => selectedIds.has(p.id))
      : products;
    if (targets.length === 0) return;

    setIsRunningCompliance(true);
    try {
      const updates = targets
        .map((p: any) => ({ p, result: fullComplianceCheck(p, complianceRules) }))
        .filter(({ p, result }) => result.status !== p.compliance_status)
        .map(({ p, result }) => ({
          id: p.id,
          compliance_status: result.status,
          compliance_reasons: result.reasons,
        }));

      if (updates.length > 0) {
        for (let i = 0; i < updates.length; i += 100) {
          const chunk = updates.slice(i, i + 100);
          const { error } = await supabase.from("products").upsert(chunk, { onConflict: "id" });
          if (error) throw error;
        }
      }

      toast.success(`Compliance evaluated: ${updates.length} products updated`);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["review-queue"] });
    } catch (err: any) {
      toast.error("Compliance check failed: " + err.message);
    } finally {
      setIsRunningCompliance(false);
    }
  };

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", debouncedSearch, complianceFilter],
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(100);

      if (debouncedSearch) {
        q = q.or(buildSafeIlikeOr(["source_product_name", "barcode", "sku"], debouncedSearch));
      }
      if (complianceFilter !== "all") {
        q = q.eq("compliance_status", complianceFilter);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  // Get live status for all loaded products
  const productIds = products.map((p: any) => p.id);
  const { ebayMap, shopifyMap } = useProductLiveStatus(productIds);

  // Fetch unmatched imported listings (no product_id linked)
  const { data: unmatchedEbayIds = new Set<string>() } = useQuery({
    queryKey: ["unmatched-ebay-ids"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ebay_live_listings")
        .select("id")
        .is("product_id", null)
        .limit(500);
      return new Set((data || []).map((r: any) => r.id));
    },
  });

  const { data: unmatchedShopifyIds = new Set<string>() } = useQuery({
    queryKey: ["unmatched-shopify-ids"],
    queryFn: async () => {
      const { data } = await supabase
        .from("shopify_live_products")
        .select("id")
        .is("product_id", null)
        .limit(500);
      return new Set((data || []).map((r: any) => r.id));
    },
  });

  const unmatchedCount = (unmatchedEbayIds instanceof Set ? unmatchedEbayIds.size : 0) +
    (unmatchedShopifyIds instanceof Set ? unmatchedShopifyIds.size : 0);

  // Fetch eBay drafts for drift detection
  const { data: ebayDraftsMap = new Map() } = useQuery({
    queryKey: ["ebay-drafts-for-drift", productIds],
    queryFn: async () => {
      if (productIds.length === 0) return new Map();
      const { data } = await supabase
        .from("ebay_drafts")
        .select("product_id, title, start_price, buy_it_now_price, quantity")
        .in("product_id", productIds);
      const map = new Map<string, any>();
      (data || []).forEach((d: any) => { if (d.product_id) map.set(d.product_id, d); });
      return map;
    },
    enabled: productIds.length > 0,
  });

  const { data: shopifyDraftsMap = new Map() } = useQuery({
    queryKey: ["shopify-drafts-for-drift", productIds],
    queryFn: async () => {
      if (productIds.length === 0) return new Map();
      const { data } = await supabase
        .from("shopify_drafts")
        .select("product_id, title")
        .in("product_id", productIds);
      const map = new Map<string, any>();
      (data || []).forEach((d: any) => { if (d.product_id) map.set(d.product_id, d); });
      return map;
    },
    enabled: productIds.length > 0,
  });

  // Detect drift: live data differs from local draft
  const hasDrift = (productId: string): boolean => {
    const ebayLive = ebayMap.get(productId);
    const ebayDraft = ebayDraftsMap instanceof Map ? ebayDraftsMap.get(productId) : null;
    if (ebayLive && ebayDraft) {
      const livePrice = Number(ebayLive.current_price || 0);
      const draftPrice = Number(ebayDraft.start_price || ebayDraft.buy_it_now_price || 0);
      if (draftPrice > 0 && livePrice > 0 && Math.abs(livePrice - draftPrice) > 0.01) return true;
      if (ebayDraft.title && ebayLive.title && ebayDraft.title !== ebayLive.title) return true;
    }
    const shopifyLive = shopifyMap.get(productId);
    const shopifyDraft = shopifyDraftsMap instanceof Map ? shopifyDraftsMap.get(productId) : null;
    if (shopifyLive && shopifyDraft) {
      if (shopifyDraft.title && shopifyLive.title && shopifyDraft.title !== shopifyLive.title) return true;
    }
    return false;
  };

  // Apply channel filter client-side after fetching live status
  const filteredProducts = products.filter((p: any) => {
    if (channelFilter === "all") return true;
    if (channelFilter === "live_ebay") return ebayMap.has(p.id);
    if (channelFilter === "live_shopify") return shopifyMap.has(p.id);
    if (channelFilter === "not_live") return !ebayMap.has(p.id) && !shopifyMap.has(p.id);
    if (channelFilter === "drift") return hasDrift(p.id);
    return true;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredProducts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map((p: any) => p.id)));
    }
  };

  const handleMarkChannelReady = async (channel: "ebay" | "shopify") => {
    const selected = products.filter((p: any) => selectedIds.has(p.id));
    if (selected.length === 0) return;

    try {
      let count = 0;
      for (const p of selected) {
        if (channel === "ebay") {
          const { data: existing } = await supabase
            .from("ebay_drafts").select("id").eq("product_id", p.id).limit(1).maybeSingle();
          const draft = {
            product_id: p.id,
            title: (p.source_product_name || "").substring(0, 80),
            brand: p.brand,
            ean: p.barcode,
            channel_status: "ready",
            start_price: p.sell_price,
            quantity: p.quantity_available_for_ebay ?? Math.max(0, Number(p.stock_on_hand) || 0),
          };
          if (existing) {
            await supabase.from("ebay_drafts").update(draft).eq("id", existing.id);
          } else {
            await supabase.from("ebay_drafts").insert(draft);
          }
        } else {
          const { data: existing } = await supabase
            .from("shopify_drafts").select("id").eq("product_id", p.id).limit(1).maybeSingle();
          const draft = {
            product_id: p.id,
            title: p.source_product_name,
            vendor: p.brand,
            product_type: p.product_type || p.z_category,
            channel_status: "ready",
            status: "draft",
          };
          if (existing) {
            await supabase.from("shopify_drafts").update(draft).eq("id", existing.id);
          } else {
            await supabase.from("shopify_drafts").insert(draft);
          }
        }
        count++;
      }

      toast.success(`${count} products queued for ${channel === "ebay" ? "eBay" : "Shopify"} review`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["review-queue"] });
      navigate("/review");
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    }
  };

  const handleExportCsv = () => {
    const selected = products.filter((p: any) => selectedIds.has(p.id));
    if (selected.length === 0) return;

    const rows = selected.map((p: any) => ({
      product_name: p.source_product_name,
      barcode: p.barcode,
      sku: p.sku,
      brand: p.brand,
      stock_on_hand: p.stock_on_hand,
      cost_price: p.cost_price,
      sell_price: p.sell_price,
      compliance_status: p.compliance_status,
      enrichment_status: p.enrichment_status,
    }));

    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `products-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${selected.length} products to CSV`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground text-sm">Manage your product catalog</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleRunCompliance} disabled={isRunningCompliance}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isRunningCompliance ? "animate-spin" : ""}`} />
            Run Compliance
          </Button>
          {selectedIds.size > 0 && (
            <>
              <Button size="sm" variant="secondary" onClick={() => handleMarkChannelReady("ebay")}>Mark eBay Ready</Button>
              <Button size="sm" variant="secondary" onClick={() => handleMarkChannelReady("shopify")}>Mark Shopify Ready</Button>
              <Button size="sm" variant="secondary" onClick={handleExportCsv}>
                <Download className="h-3.5 w-3.5 mr-1" />
                Export CSV
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products..."
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={complianceFilter} onValueChange={setComplianceFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Compliance" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="permitted">Permitted</SelectItem>
                <SelectItem value="review_required">Review Required</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
              </SelectContent>
            </Select>
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                <SelectItem value="live_ebay">Live on eBay</SelectItem>
                <SelectItem value="live_shopify">Live on Shopify</SelectItem>
                <SelectItem value="not_live">Not Live</SelectItem>
                <SelectItem value="drift">Differs from Draft</SelectItem>
              </SelectContent>
            </Select>
            {unmatchedCount > 0 && (
              <Badge variant="destructive" className="text-xs cursor-pointer"
                onClick={() => navigate("/channel-imports")}
              >
                {unmatchedCount} Unmatched Import{unmatchedCount > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selectedIds.size === filteredProducts.length && filteredProducts.length > 0}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Barcode</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>RRP</TableHead>
                  <TableHead>Live</TableHead>
                  <TableHead>Compliance</TableHead>
                  <TableHead>Enrichment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                      Loading products...
                    </TableCell>
                  </TableRow>
                ) : filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                      <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      No products found. Import stock data to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((p: any) => (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => navigate(`/products/${p.id}`)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(p.id)}
                          onCheckedChange={() => toggleSelect(p.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium max-w-[300px] truncate">
                        {p.source_product_name || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.barcode || "—"}</TableCell>
                      <TableCell>{p.brand || "—"}</TableCell>
                      <TableCell>{p.stock_on_hand ?? "—"}</TableCell>
                      <TableCell>{p.cost_price ? `$${Number(p.cost_price).toFixed(2)}` : "—"}</TableCell>
                      <TableCell>{p.sell_price ? `$${Number(p.sell_price).toFixed(2)}` : "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <LiveStatusBadges
                            ebayLive={ebayMap.get(p.id)}
                            shopifyLive={shopifyMap.get(p.id)}
                          />
                          {hasDrift(p.id) && (
                            <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600">
                              Drift
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <ComplianceBadgeWithOverride
                          productId={p.id}
                          productName={p.source_product_name || ""}
                          status={p.compliance_status}
                          reasons={p.compliance_reasons as string[] | null}
                        />
                      </TableCell>
                      <TableCell><EnrichmentBadge status={p.enrichment_status} /></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EnrichmentBadge({ status }: { status?: string }) {
  if (!status) return <Badge variant="outline" className="text-[10px]">Pending</Badge>;
  const map: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
    pending: "outline",
    in_progress: "secondary",
    complete: "default",
    failed: "destructive",
  };
  return <Badge variant={map[status] || "outline"} className="text-[10px]">{status}</Badge>;
}
