import { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowLeft, CheckCircle, XCircle, HelpCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

const api = window.electronAPI;

interface Props {
  syncRunId: string | null;
  onBack: () => void;
}

export function StockSyncReviewQueue({ syncRunId, onBack }: Props) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    if (!syncRunId) return;
    setLoading(true);
    try {
      const { data } = await api.dbQuery(
        `SELECT * FROM stock_sync_items
         WHERE sync_run_id = ?
           AND sync_status IN ('uncertain_match', 'no_match', 'sync_failed')
         ORDER BY local_product_name`,
        [syncRunId],
      );
      setItems(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [syncRunId]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const confirmMatch = async (itemId: string) => {
    setMutating(itemId);
    try {
      const { error } = await api.dbQuery(
        `UPDATE stock_sync_items SET match_confidence='high', sync_status='update_needed' WHERE id=?`,
        [itemId],
      );
      if (error) throw new Error(error);
      toast.success("Match confirmed — ready to sync");
      loadItems();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setMutating(null);
    }
  };

  const skipItem = async (itemId: string) => {
    setMutating(itemId);
    try {
      const { error } = await api.dbQuery(
        `UPDATE stock_sync_items SET sync_status='skipped' WHERE id=?`,
        [itemId],
      );
      if (error) throw new Error(error);
      toast.success("Item skipped");
      loadItems();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setMutating(null);
    }
  };

  const uncertainItems = useMemo(() => items.filter((i) => i.sync_status === "uncertain_match"), [items]);
  const noMatchItems   = useMemo(() => items.filter((i) => i.sync_status === "no_match"), [items]);
  const failedItems    = useMemo(() => items.filter((i) => i.sync_status === "sync_failed"), [items]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stock Sync Review Queue</h1>
          <p className="text-muted-foreground text-sm">
            {uncertainItems.length} uncertain • {noMatchItems.length} no match • {failedItems.length} failed
          </p>
        </div>
      </div>

      {loading && (
        <div className="py-8 text-center text-muted-foreground">
          <Loader2 className="h-6 w-6 mx-auto animate-spin opacity-50" />
        </div>
      )}

      {/* Uncertain matches */}
      {uncertainItems.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-yellow-500" /> Uncertain Matches ({uncertainItems.length})
              </h3>
              <p className="text-xs text-muted-foreground">Review these matches and confirm or skip them.</p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Local Product</TableHead>
                  <TableHead>Local Barcode / SKU</TableHead>
                  <TableHead>Shopify Match</TableHead>
                  <TableHead>Match Type</TableHead>
                  <TableHead className="text-right">Local Qty</TableHead>
                  <TableHead className="text-right">Shopify Qty</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {uncertainItems.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-sm font-medium max-w-[180px] truncate">{item.local_product_name}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {item.local_barcode || "—"} / {item.local_sku || "—"}
                    </TableCell>
                    <TableCell className="text-sm max-w-[180px] truncate">{item.shopify_product_title || "—"}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{item.match_type}</Badge></TableCell>
                    <TableCell className="text-right font-mono text-sm">{item.local_stock_on_hand ?? 0}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{item.current_shopify_qty ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm" variant="ghost" className="h-7 text-xs gap-1"
                          onClick={() => confirmMatch(item.id)}
                          disabled={mutating === item.id}
                        >
                          {mutating === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                          Confirm
                        </Button>
                        <Button
                          size="sm" variant="ghost" className="h-7 text-xs gap-1"
                          onClick={() => skipItem(item.id)}
                          disabled={mutating === item.id}
                        >
                          <XCircle className="h-3 w-3" /> Skip
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* No match */}
      {noMatchItems.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <XCircle className="h-4 w-4 text-destructive" /> No Match Found ({noMatchItems.length})
              </h3>
              <p className="text-xs text-muted-foreground">These local products have no Shopify match by SKU or barcode.</p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Local Product</TableHead>
                  <TableHead>Barcode</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Stock on Hand</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {noMatchItems.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-sm">{item.local_product_name}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{item.local_barcode || "—"}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{item.local_sku || "—"}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{item.local_stock_on_hand ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Failed syncs */}
      {failedItems.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <XCircle className="h-4 w-4 text-destructive" /> Failed Syncs ({failedItems.length})
              </h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failedItems.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-sm">{item.local_product_name}</TableCell>
                    <TableCell className="text-xs text-destructive">{item.error_message || "Unknown error"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!loading && items.length === 0 && (
        <div className="py-16 text-center text-muted-foreground">
          <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No items need review — all matches are high confidence!</p>
        </div>
      )}
    </div>
  );
}
