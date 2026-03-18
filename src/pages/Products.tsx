import { useState, useEffect } from "react";
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
import { Package, Search, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { ComplianceBadgeWithOverride } from "@/components/compliance/ComplianceBadgeWithOverride";
import { LiveStatusBadges } from "@/components/products/LiveStatusBadges";
import { DraftStatusBadges } from "@/components/products/DraftStatusBadges";
import { ProductRowKebab } from "@/components/products/ProductRowKebab";
import { ExportFloatingBar } from "@/components/products/ExportFloatingBar";
import { fullComplianceCheck } from "@/lib/compliance-engine";
import { buildSafeIlikeOr } from "@/lib/search-utils";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useProductLiveStatus } from "@/hooks/useProductLiveStatus";
import { useExportCart } from "@/stores/useExportCart";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const PAGE_SIZE = 50;

export default function Products() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [complianceFilter, setComplianceFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [isRunningCompliance, setIsRunningCompliance] = useState(false);
  const [page, setPage] = useState(0);
  const queryClient = useQueryClient();
  const exportCart = useExportCart();

  // Reset page when filters change
  const queryKey = ["products", debouncedSearch, complianceFilter, page];

  const { data: complianceRules = [] } = useQuery({
    queryKey: ["compliance-rules"],
    queryFn: async () => {
      const { data } = await supabase.from("compliance_rules").select("*").order("priority");
      return data || [];
    },
  });

  const handleRunCompliance = async () => {
    if (products.length === 0) return;
    setIsRunningCompliance(true);
    try {
      const updates = products
        .map((p) => ({ p, result: fullComplianceCheck(p, complianceRules) }))
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Compliance check failed: " + msg);
    } finally {
      setIsRunningCompliance(false);
    }
  };

  // Count query for total rows matching current filters
  const { data: totalCount = 0 } = useQuery({
    queryKey: ["products-count", debouncedSearch, complianceFilter],
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("id", { count: "exact", head: true });

      if (debouncedSearch) {
        q = q.or(buildSafeIlikeOr(["source_product_name", "barcode", "sku"], debouncedSearch));
      }
      if (complianceFilter !== "all") {
        q = q.eq("compliance_status", complianceFilter);
      }
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Reset page to 0 when filters change
  const { data: products = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let q = supabase
        .from("products")
        .select("*")
        .order("updated_at", { ascending: false })
        .range(from, to);

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

  const productIds = products.map((p) => p.id);
  const { ebayMap, shopifyMap } = useProductLiveStatus(productIds);

  const { data: unmatchedEbayIds = new Set<string>() } = useQuery({
    queryKey: ["unmatched-ebay-ids"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ebay_live_listings")
        .select("id")
        .is("product_id", null)
        .limit(500);
      return new Set((data || []).map((r) => r.id));
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
      return new Set((data || []).map((r) => r.id));
    },
  });

  const unmatchedCount = (unmatchedEbayIds instanceof Set ? unmatchedEbayIds.size : 0) +
    (unmatchedShopifyIds instanceof Set ? unmatchedShopifyIds.size : 0);

  // Draft data for drift detection & badge status
  const { data: ebayDraftsMap = new Map<string, Record<string, unknown>>() } = useQuery({
    queryKey: ["ebay-drafts-for-drift", productIds],
    queryFn: async () => {
      if (productIds.length === 0) return new Map<string, Record<string, unknown>>();
      const { data } = await supabase
        .from("ebay_drafts")
        .select("product_id, title, start_price, buy_it_now_price, quantity, channel_status")
        .in("product_id", productIds);
      const map = new Map<string, Record<string, unknown>>();
      (data || []).forEach((d) => { if (d.product_id) map.set(d.product_id, d); });
      return map;
    },
    enabled: productIds.length > 0,
  });

  const { data: shopifyDraftsMap = new Map<string, Record<string, unknown>>() } = useQuery({
    queryKey: ["shopify-drafts-for-drift", productIds],
    queryFn: async () => {
      if (productIds.length === 0) return new Map<string, Record<string, unknown>>();
      const { data } = await supabase
        .from("shopify_drafts")
        .select("product_id, title, channel_status")
        .in("product_id", productIds);
      const map = new Map<string, Record<string, unknown>>();
      (data || []).forEach((d) => { if (d.product_id) map.set(d.product_id, d); });
      return map;
    },
    enabled: productIds.length > 0,
  });

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

  const getEbayDraftStatus = (productId: string): "none" | "draft" | "live" => {
    if (ebayMap.has(productId)) return "live";
    if (ebayDraftsMap instanceof Map && ebayDraftsMap.has(productId)) return "draft";
    return "none";
  };

  const getShopifyDraftStatus = (productId: string): "none" | "draft" | "live" => {
    if (shopifyMap.has(productId)) return "live";
    if (shopifyDraftsMap instanceof Map && shopifyDraftsMap.has(productId)) return "draft";
    return "none";
  };

  const filteredProducts = products.filter((p) => {
    if (channelFilter === "all") return true;
    if (channelFilter === "live_ebay") return ebayMap.has(p.id);
    if (channelFilter === "live_shopify") return shopifyMap.has(p.id);
    if (channelFilter === "not_live") return !ebayMap.has(p.id) && !shopifyMap.has(p.id);
    if (channelFilter === "drift") return hasDrift(p.id);
    return true;
  });

  const pageIds = filteredProducts.map((p) => p.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => exportCart.selectedIds.has(id));

  const toggleAllPage = () => {
    if (allPageSelected) {
      exportCart.removeMany(pageIds);
    } else {
      exportCart.addMany(pageIds);
    }
  };

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground text-sm">Manage your product catalog</p>
        </div>
        <Button size="sm" variant="outline" onClick={handleRunCompliance} disabled={isRunningCompliance}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isRunningCompliance ? "animate-spin" : ""}`} />
          Run Compliance
        </Button>
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
                      checked={allPageSelected}
                      onCheckedChange={toggleAllPage}
                    />
                  </TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Barcode</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>RRP</TableHead>
                  <TableHead>Drafts</TableHead>
                  <TableHead>Live</TableHead>
                  <TableHead>Compliance</TableHead>
                  <TableHead>Enrichment</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-12 text-muted-foreground">
                      Loading products...
                    </TableCell>
                  </TableRow>
                ) : filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-12 text-muted-foreground">
                      <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      No products found. Import stock data to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((p) => (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => navigate(`/products/${p.id}`)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={exportCart.selectedIds.has(p.id)}
                          onCheckedChange={() => exportCart.toggleProduct(p.id)}
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
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DraftStatusBadges
                          productId={p.id}
                          ebayDraftStatus={getEbayDraftStatus(p.id)}
                          shopifyDraftStatus={getShopifyDraftStatus(p.id)}
                        />
                      </TableCell>
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
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <ProductRowKebab product={p} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {products.length === 0 ? 0 : page * PAGE_SIZE + 1}–{page * PAGE_SIZE + products.length} of {totalCount} products
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>

      <ExportFloatingBar />
    </div>
  );
}

function EnrichmentBadge({ status }: { status?: string | null }) {
  if (!status) return <Badge variant="outline" className="text-[10px]">Never Researched</Badge>;
  const variants: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
    pending: { variant: "outline", label: "Pending" },
    in_progress: { variant: "secondary", label: "In Progress" },
    complete: { variant: "default", label: "Enriched" },
    failed: { variant: "destructive", label: "Failed" },
  };
  const config = variants[status] || { variant: "outline", label: status };
  return <Badge variant={config.variant} className="text-[10px]">{config.label}</Badge>;
}
