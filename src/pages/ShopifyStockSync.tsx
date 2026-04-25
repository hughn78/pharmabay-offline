import { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
import { toast } from "sonner";
import { StockSyncReviewQueue } from "@/components/stock-sync/StockSyncReviewQueue";

const api = window.electronAPI;

type FilterMode = "all" | "matched" | "update_needed" | "no_match" | "uncertain" | "zero_stock" | "in_stock" | "synced" | "failed";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  matched_no_change: { label: "In Sync", variant: "default" },
  update_needed:     { label: "Update Needed", variant: "secondary" },
  no_match:          { label: "No Match", variant: "destructive" },
  uncertain_match:   { label: "Review", variant: "outline" },
  sync_success:      { label: "Synced", variant: "default" },
  sync_failed:       { label: "Failed", variant: "destructive" },
  skipped_zero:      { label: "Skipped (0)", variant: "outline" },
  pending:           { label: "Pending", variant: "outline" },
};

export default function ShopifyStockSync() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showReviewQueue, setShowReviewQueue] = useState(false);
  const [activeSyncRunId, setActiveSyncRunId] = useState<string | null>(null);

  const [latestRun, setLatestRun] = useState<any>(null);
  const [syncItems, setSyncItems] = useState<any[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // ── data loaders ────────────────────────────────────────────────────────

  const loadLatestRun = useCallback(async () => {
    const { data } = await api.dbQuery(
      'SELECT * FROM stock_sync_runs ORDER BY started_at DESC LIMIT 1',
      [],
    );
    const run = Array.isArray(data) ? data[0] ?? null : null;
    setLatestRun(run);
    if (run) setActiveSyncRunId(run.id);
  }, []);

  const loadItems = useCallback(async (runId: string) => {
    setItemsLoading(true);
    try {
      const { data } = await api.dbQuery(
        'SELECT * FROM stock_sync_items WHERE sync_run_id = ? ORDER BY local_product_name',
        [runId],
      );
      setSyncItems(Array.isArray(data) ? data : []);
    } finally {
      setItemsLoading(false);
    }
  }, []);

  useEffect(() => { loadLatestRun(); }, [loadLatestRun]);

  useEffect(() => {
    if (activeSyncRunId) loadItems(activeSyncRunId);
  }, [activeSyncRunId, loadItems]);

  const reload = useCallback(() => {
    loadLatestRun();
    if (activeSyncRunId) loadItems(activeSyncRunId);
  }, [loadLatestRun, loadItems, activeSyncRunId]);

  // ── actions ──────────────────────────────────────────────────────────────

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await api.shopifyRefreshProducts();
      if (error) throw new Error(error);
      toast.success(`Refreshed ${data!.refreshed} Shopify products (${data!.variants} variants)`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRefreshing(false);
    }
  };

  const handleDryRun = async () => {
    setPreviewing(true);
    try {
      const { data, error } = await api.shopifySyncPreview();
      if (error) throw new Error(error);
      setActiveSyncRunId(data!.sync_run_id);
      setSyncItems([]);
      await loadLatestRun();
      await loadItems(data!.sync_run_id);
      toast.success(`Preview: ${data!.matched} matched, ${data!.update_needed} need update, ${data!.no_match} no match`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPreviewing(false);
    }
  };

  const handleSyncMatched = async () => {
    if (!activeSyncRunId) return;
    setSyncing(true);
    try {
      const { data, error } = await api.shopifySyncExecute({ action: 'sync_matched', sync_run_id: activeSyncRunId });
      if (error) throw new Error(error);
      toast.success(`Synced ${data!.synced} products (${data!.failed} failed)`);
      reload();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncSelected = async () => {
    if (!activeSyncRunId || selectedIds.size === 0) return;
    setSyncing(true);
    try {
      const { data, error } = await api.shopifySyncExecute({
        action: 'sync_selected',
        sync_run_id: activeSyncRunId,
        selected_item_ids: Array.from(selectedIds),
      });
      if (error) throw new Error(error);
      toast.success(`Synced ${data!.synced} selected (${data!.failed} failed)`);
      setSelectedIds(new Set());
      reload();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSyncing(false);
    }
  };

  // ── filtering & selection ────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = syncItems;
    switch (filterMode) {
      case "matched":      list = list.filter((i) => i.match_confidence === "high"); break;
      case "update_needed":list = list.filter((i) => i.sync_status === "update_needed"); break;
      case "no_match":     list = list.filter((i) => i.sync_status === "no_match"); break;
      case "uncertain":    list = list.filter((i) => i.sync_status === "uncertain_match"); break;
      case "zero_stock":   list = list.filter((i) => (i.local_stock_on_hand || 0) === 0); break;
      case "in_stock":     list = list.filter((i) => (i.local_stock_on_hand || 0) > 0); break;
      case "synced":       list = list.filter((i) => i.sync_status === "sync_success"); break;
      case "failed":       list = list.filter((i) => i.sync_status === "sync_failed"); break;
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter((i) =>
        (i.local_product_name || "").toLowerCase().includes(q) ||
        (i.local_barcode || "").toLowerCase().includes(q) ||
        (i.local_sku || "").toLowerCase().includes(q) ||
        (i.shopify_product_title || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [syncItems, filterMode, searchTerm]);

  const selectableItems = filtered.filter((i) => i.sync_status === "update_needed");
  const allSelected = selectableItems.length > 0 && selectableItems.every((i) => selectedIds.has(i.id));

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
      setSelectedIds(new Set(selectableItems.map((i) => i.id)));
    }
  };

  // ── stats ────────────────────────────────────────────────────────────────

  const stats = useMemo(() => ({
    total:        syncItems.length,
    matched:      syncItems.filter((i) => i.match_confidence === "high").length,
    updateNeeded: syncItems.filter((i) => i.sync_status === "update_needed").length,
    noMatch:      syncItems.filter((i) => i.sync_status === "no_match").length,
    uncertain:    syncItems.filter((i) => i.sync_status === "uncertain_match").length,
    synced:       syncItems.filter((i) => i.sync_status === "sync_success").length,
    failed:       syncItems.filter((i) => i.sync_status === "sync_failed").length,
  }), [syncItems]);

  const isBusy = refreshing || previewing || syncing;

  if (showReviewQueue) {
    return (
      <StockSyncReviewQueue
        syncRunId={activeSyncRunId}
        onBack={() => {
          setShowReviewQueue(false);
          reload();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Shopify Stock Sync</h1>
        <p className="text-muted-foreground text-sm">
          Sync local stock quantities to Shopify using imported Z Office / FOS data as source of truth
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isBusy}>
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh Shopify
        </Button>
        <Button variant="outline" size="sm" onClick={handleDryRun} disabled={isBusy}>
          {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
          Dry Run
        </Button>
        <Button size="sm" onClick={handleSyncMatched} disabled={isBusy || stats.updateNeeded === 0}>
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Sync Matched
        </Button>
        {selectedIds.size > 0 && (
          <Button size="sm" variant="secondary" onClick={handleSyncSelected} disabled={isBusy}>
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpDown className="h-3.5 w-3.5" />}
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
            { label: "Total",        value: stats.total,        icon: Package,      color: "text-foreground" },
            { label: "Matched",      value: stats.matched,      icon: CheckCircle,  color: "text-green-600" },
            { label: "Needs Update", value: stats.updateNeeded, icon: ArrowUpDown,  color: "text-yellow-600" },
            { label: "No Match",     value: stats.noMatch,      icon: XCircle,      color: "text-destructive" },
            { label: "Uncertain",    value: stats.uncertain,    icon: HelpCircle,   color: "text-yellow-600" },
            { label: "Synced",       value: stats.synced,       icon: CheckCircle,  color: "text-green-600" },
            { label: "Failed",       value: stats.failed,       icon: AlertTriangle,color: "text-destructive" },
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

      {/* Latest run info */}
      {latestRun && (
        <Card>
          <CardContent className="py-3 px-4 flex items-center justify-between text-sm">
            <div className="text-muted-foreground">
              Last preview: {new Date(latestRun.started_at).toLocaleString()} •
              Status: <Badge variant={latestRun.status === "sync_complete" ? "default" : "secondary"} className="text-[10px] ml-1">{latestRun.status}</Badge>
            </div>
            <div className="text-muted-foreground text-xs">
              Buffer: {latestRun.reserve_buffer ?? 0} • Mode: {latestRun.inventory_sync_mode ?? '—'}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters & search */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, barcode, SKU…"
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={filterMode} onValueChange={(v) => setFilterMode(v as FilterMode)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
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
          {itemsLoading ? (
            <div className="py-16 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin opacity-50" />
              <p className="text-sm">Loading items…</p>
            </div>
          ) : syncItems.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No sync preview yet.</p>
              <p className="text-xs mt-1">Click "Refresh Shopify" then "Dry Run" to compare local stock against Shopify.</p>
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
                    const statusCfg = STATUS_CONFIG[item.sync_status] ?? { label: item.sync_status, variant: "outline" as const };
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
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {item.local_barcode || <Minus className="h-3 w-3 opacity-30" />}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {item.local_sku || <Minus className="h-3 w-3 opacity-30" />}
                        </TableCell>
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
                            <span className={`text-sm font-mono font-bold ${
                              item.qty_difference > 0 ? "text-green-600" :
                              item.qty_difference < 0 ? "text-destructive" : "text-muted-foreground"
                            }`}>
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
