import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw, Search, Loader2, Play, Eye, CheckCircle, AlertTriangle,
  XCircle, Minus, ArrowUpDown, Package, HelpCircle,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { StockSyncReviewQueue } from "@/components/stock-sync/StockSyncReviewQueue";

type FilterMode = "all" | "matched" | "update_needed" | "no_match" | "uncertain" | "zero_stock" | "in_stock" | "synced" | "failed";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  matched_no_change: { label: "In Sync", variant: "default" },
  update_needed: { label: "Update Needed", variant: "secondary" },
  no_match: { label: "No Match", variant: "destructive" },
  uncertain_match: { label: "Review", variant: "outline" },
  sync_success: { label: "Synced", variant: "default" },
  sync_failed: { label: "Failed", variant: "destructive" },
  skipped_zero: { label: "Skipped (0)", variant: "outline" },
  pending: { label: "Pending", variant: "outline" },
};

export default function ShopifyStockSync() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showReviewQueue, setShowReviewQueue] = useState(false);
  const [activeSyncRunId, setActiveSyncRunId] = useState<string | null>(null);

  // Fetch latest sync run
  const { data: latestRun } = useQuery({
    queryKey: ["stock-sync-latest-run"],
    queryFn: async () => {
      const { data } = await supabase
        .from("stock_sync_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setActiveSyncRunId(data.id);
      return data;
    },
  });

  // Fetch sync items for the active run
  const { data: syncItems = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["stock-sync-items", activeSyncRunId],
    queryFn: async () => {
      if (!activeSyncRunId) return [];
      const { data } = await supabase
        .from("stock_sync_items")
        .select("*")
        .eq("sync_run_id", activeSyncRunId)
        .order("local_product_name");
      return data || [];
    },
    enabled: !!activeSyncRunId,
  });

  // Fetch import batches
  const { data: importBatches = [] } = useQuery({
    queryKey: ["import-batches-for-sync"],
    queryFn: async () => {
      const { data } = await supabase
        .from("import_batches")
        .select("*")
        .order("imported_at", { ascending: false })
        .limit(10);
      return data || [];
    },
  });

  // Fetch Shopify connection for settings
  const { data: shopifyConn } = useQuery({
    queryKey: ["shopify-connection"],
    queryFn: async () => {
      const { data } = await supabase.from("shopify_connections").select("*").limit(1).maybeSingle();
      return data;
    },
  });

  // Refresh Shopify inventory
  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await supabase.functions.invoke("shopify-stock-sync", {
        body: { action: "refresh_shopify" },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`Refreshed ${data.refreshed} Shopify products`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Preview / Dry Run
  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await supabase.functions.invoke("shopify-stock-sync", {
        body: {
          action: "preview",
          reserve_buffer: shopifyConn?.reserve_stock_buffer ?? 0,
          inventory_sync_mode: shopifyConn?.inventory_sync_mode ?? "stock_minus_buffer",
          max_qty_cap: shopifyConn?.max_qty_cap ?? undefined,
          sync_zero_stock: shopifyConn?.sync_zero_stock ?? false,
        },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      setActiveSyncRunId(data.sync_run_id);
      toast.success(`Preview complete: ${data.matched} matched, ${data.update_needed} need update`);
      queryClient.invalidateQueries({ queryKey: ["stock-sync-items"] });
      queryClient.invalidateQueries({ queryKey: ["stock-sync-latest-run"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Sync matched
  const syncMatchedMutation = useMutation({
    mutationFn: async () => {
      if (!activeSyncRunId) throw new Error("No active sync run");
      const res = await supabase.functions.invoke("shopify-stock-sync", {
        body: { action: "sync_matched", sync_run_id: activeSyncRunId },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`Synced ${data.synced} products (${data.failed} failed)`);
      queryClient.invalidateQueries({ queryKey: ["stock-sync-items"] });
      queryClient.invalidateQueries({ queryKey: ["stock-sync-latest-run"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Sync selected
  const syncSelectedMutation = useMutation({
    mutationFn: async () => {
      if (!activeSyncRunId) throw new Error("No active sync run");
      const res = await supabase.functions.invoke("shopify-stock-sync", {
        body: {
          action: "sync_selected",
          sync_run_id: activeSyncRunId,
          selected_item_ids: Array.from(selectedIds),
        },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`Synced ${data.synced} selected (${data.failed} failed)`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["stock-sync-items"] });
      queryClient.invalidateQueries({ queryKey: ["stock-sync-latest-run"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Filtered items
  const filtered = useMemo(() => {
    let list = syncItems;
    switch (filterMode) {
      case "matched": list = list.filter((i: any) => i.match_confidence === "high"); break;
      case "update_needed": list = list.filter((i: any) => i.sync_status === "update_needed"); break;
      case "no_match": list = list.filter((i: any) => i.sync_status === "no_match"); break;
      case "uncertain": list = list.filter((i: any) => i.sync_status === "uncertain_match"); break;
      case "zero_stock": list = list.filter((i: any) => (i.local_stock_on_hand || 0) === 0); break;
      case "in_stock": list = list.filter((i: any) => (i.local_stock_on_hand || 0) > 0); break;
      case "synced": list = list.filter((i: any) => i.sync_status === "sync_success"); break;
      case "failed": list = list.filter((i: any) => i.sync_status === "sync_failed"); break;
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter((i: any) =>
        (i.local_product_name || "").toLowerCase().includes(q) ||
        (i.local_barcode || "").toLowerCase().includes(q) ||
        (i.local_sku || "").toLowerCase().includes(q) ||
        (i.shopify_product_title || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [syncItems, filterMode, searchTerm]);

  const selectableItems = filtered.filter((i: any) => i.sync_status === "update_needed");
  const allSelected = selectableItems.length > 0 && selectableItems.every((i: any) => selectedIds.has(i.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableItems.map((i: any) => i.id)));
    }
  };

  // Summary stats
  const stats = useMemo(() => {
    const total = syncItems.length;
    const matched = syncItems.filter((i: any) => i.match_confidence === "high").length;
    const updateNeeded = syncItems.filter((i: any) => i.sync_status === "update_needed").length;
    const noMatch = syncItems.filter((i: any) => i.sync_status === "no_match").length;
    const uncertain = syncItems.filter((i: any) => i.sync_status === "uncertain_match").length;
    const synced = syncItems.filter((i: any) => i.sync_status === "sync_success").length;
    const failed = syncItems.filter((i: any) => i.sync_status === "sync_failed").length;
    return { total, matched, updateNeeded, noMatch, uncertain, synced, failed };
  }, [syncItems]);

  const isBusy = refreshMutation.isPending || previewMutation.isPending || syncMatchedMutation.isPending || syncSelectedMutation.isPending;

  if (showReviewQueue) {
    return (
      <StockSyncReviewQueue
        syncRunId={activeSyncRunId}
        onBack={() => {
          setShowReviewQueue(false);
          queryClient.invalidateQueries({ queryKey: ["stock-sync-items"] });
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Shopify Stock Sync</h1>
        <p className="text-muted-foreground text-sm">
          Sync local stock quantities to Shopify using imported FOS data as source of truth
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => refreshMutation.mutate()} disabled={isBusy}>
          {refreshMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh Shopify
        </Button>
        <Button variant="outline" size="sm" onClick={() => previewMutation.mutate()} disabled={isBusy}>
          {previewMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
          Dry Run
        </Button>
        <Button size="sm" onClick={() => syncMatchedMutation.mutate()} disabled={isBusy || stats.updateNeeded === 0}>
          {syncMatchedMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Sync Matched
        </Button>
        {selectedIds.size > 0 && (
          <Button size="sm" variant="secondary" onClick={() => syncSelectedMutation.mutate()} disabled={isBusy}>
            {syncSelectedMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpDown className="h-3.5 w-3.5" />}
            Sync Selected ({selectedIds.size})
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setShowReviewQueue(true)} disabled={stats.uncertain === 0}>
          <HelpCircle className="h-3.5 w-3.5" />
          Review Queue ({stats.uncertain})
        </Button>
      </div>

      {/* Summary cards */}
      {syncItems.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: "Total", value: stats.total, icon: Package, color: "text-foreground" },
            { label: "Matched", value: stats.matched, icon: CheckCircle, color: "text-green-600" },
            { label: "Needs Update", value: stats.updateNeeded, icon: ArrowUpDown, color: "text-yellow-600" },
            { label: "No Match", value: stats.noMatch, icon: XCircle, color: "text-destructive" },
            { label: "Uncertain", value: stats.uncertain, icon: HelpCircle, color: "text-yellow-600" },
            { label: "Synced", value: stats.synced, icon: CheckCircle, color: "text-green-600" },
            { label: "Failed", value: stats.failed, icon: AlertTriangle, color: "text-destructive" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-3 text-center">
                <s.icon className={`h-4 w-4 mx-auto mb-1 ${s.color}`} />
                <div className="text-lg font-bold">{s.value}</div>
                <div className="text-[10px] text-muted-foreground uppercase">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Import batch info */}
      {latestRun && (
        <Card>
          <CardContent className="py-3 px-4 flex items-center justify-between text-sm">
            <div className="text-muted-foreground">
              Last preview: {new Date(latestRun.started_at || "").toLocaleString()} •
              Status: <Badge variant={latestRun.status === "preview_complete" ? "default" : "secondary"} className="text-[10px] ml-1">{latestRun.status}</Badge>
            </div>
            <div className="text-muted-foreground text-xs">
              Buffer: {latestRun.reserve_buffer} • Mode: {latestRun.inventory_sync_mode}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters & search */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search name, barcode, SKU…" className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <Select value={filterMode} onValueChange={(v) => setFilterMode(v as FilterMode)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Items</SelectItem>
            <SelectItem value="matched">Matched Only</SelectItem>
            <SelectItem value="update_needed">Needs Update</SelectItem>
            <SelectItem value="no_match">No Match</SelectItem>
            <SelectItem value="uncertain">Uncertain</SelectItem>
            <SelectItem value="zero_stock">Zero Stock</SelectItem>
            <SelectItem value="in_stock">In Stock</SelectItem>
            <SelectItem value="synced">Synced</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Preview table */}
      <Card>
        <CardContent className="p-0">
          {syncItems.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No sync preview yet. Click "Dry Run" to compare local stock against Shopify.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
                    </TableHead>
                    <TableHead>Local Product</TableHead>
                    <TableHead>Barcode</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Local Qty</TableHead>
                    <TableHead className="text-right">→ Push</TableHead>
                    <TableHead>Shopify Product</TableHead>
                    <TableHead className="text-right">Shopify Qty</TableHead>
                    <TableHead className="text-right">Diff</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item: any) => {
                    const statusCfg = STATUS_CONFIG[item.sync_status] || { label: item.sync_status, variant: "outline" as const };
                    const isSelectable = item.sync_status === "update_needed";
                    return (
                      <TableRow key={item.id} className={selectedIds.has(item.id) ? "bg-accent/50" : ""}>
                        <TableCell>
                          {isSelectable && (
                            <Checkbox checked={selectedIds.has(item.id)} onCheckedChange={() => toggleSelect(item.id)} />
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium max-w-[200px] truncate">{item.local_product_name}</div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">{item.local_barcode || <Minus className="h-3 w-3 opacity-30" />}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">{item.local_sku || <Minus className="h-3 w-3 opacity-30" />}</TableCell>
                        <TableCell className="text-right text-sm font-mono">{item.local_stock_on_hand ?? 0}</TableCell>
                        <TableCell className="text-right text-sm font-mono font-bold">{item.quantity_to_push ?? "—"}</TableCell>
                        <TableCell>
                          {item.shopify_product_title ? (
                            <div className="text-sm max-w-[200px] truncate">
                              {item.shopify_product_title}
                              {item.shopify_variant_title && item.shopify_variant_title !== "Default Title" && (
                                <span className="text-muted-foreground text-xs ml-1">/ {item.shopify_variant_title}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm font-mono">{item.current_shopify_qty ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          {item.qty_difference != null ? (
                            <span className={`text-sm font-mono font-bold ${item.qty_difference > 0 ? "text-green-600" : item.qty_difference < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                              {item.qty_difference > 0 ? "+" : ""}{item.qty_difference}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          {item.match_type && item.match_type !== "none" ? (
                            <Badge variant="outline" className="text-[10px]">{item.match_type}</Badge>
                          ) : (
                            <Minus className="h-3 w-3 opacity-30" />
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusCfg.variant} className="text-[10px]">{statusCfg.label}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
