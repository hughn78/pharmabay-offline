import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ShoppingCart, Rocket, Loader2, CheckCircle, XCircle, ExternalLink,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

async function dbQuery(sql: string, params?: any[]) {
  const res = await window.electronAPI.dbQuery(sql, params ?? []);
  if (res.error) throw new Error(res.error);
  return res.data || [];
}

export function EbayBulkPanel() {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: readyDrafts = [], isLoading } = useQuery({
    queryKey: ["ebay-ready-drafts"],
    queryFn: async () => {
      const rows = await dbQuery(`
        SELECT
          ed.*,
          p.id as p_id,
          p.source_product_name,
          p.barcode,
          p.sku,
          p.compliance_status,
          p.stock_on_hand,
          p.quantity_reserved_for_store,
          p.quantity_available_for_ebay
        FROM ebay_drafts ed
        LEFT JOIN products p ON ed.product_id = p.id
        WHERE ed.channel_status IN (?, ?, ?)
        ORDER BY ed.updated_at DESC
        LIMIT 200
      `, ["ready", "published", "failed"]);

      return rows.map((r: any) => ({
        ...r,
        products: r.p_id ? {
          id: r.p_id,
          source_product_name: r.source_product_name,
          barcode: r.barcode,
          sku: r.sku,
          compliance_status: r.compliance_status,
          stock_on_hand: r.stock_on_hand,
          quantity_reserved_for_store: r.quantity_reserved_for_store,
          quantity_available_for_ebay: r.quantity_available_for_ebay,
        } : null,
      }));
    },
  });

  const { data: ebayStatus } = useQuery({
    queryKey: ["ebay-connection-status"],
    queryFn: async () => {
      const res = await window.electronAPI.ebayGetStatus();
      return res.data;
    },
    staleTime: 60000,
  });

  const bulkPublish = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedIds);
      const results: any[] = [];

      for (const draftId of ids) {
        const draft = readyDrafts.find((d: any) => d.id === draftId);
        if (!draft) continue;

        try {
          const res = await window.electronAPI.ebayPublishProduct({
            product_id: draft.product_id,
            draft_id: draft.id,
          });
          if (res.data?.error) {
            results.push({ id: draftId, status: "failed", error: res.data.error });
          } else {
            results.push({ id: draftId, status: "success", listingId: res.data?.listingId });
          }
        } catch (err: any) {
          results.push({ id: draftId, status: "failed", error: err.message });
        }
      }

      return results;
    },
    onSuccess: (results) => {
      const success = results.filter((r) => r.status === "success").length;
      const failed = results.filter((r) => r.status === "failed").length;
      if (success > 0) toast.success(`Published ${success} listing(s) to eBay`);
      if (failed > 0) toast.error(`${failed} listing(s) failed`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["ebay-ready-drafts"] });
      queryClient.invalidateQueries({ queryKey: ["ebay-publish-jobs"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === readyDrafts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(readyDrafts.map((d: any) => d.id)));
    }
  };

  const isConnected = ebayStatus?.connected;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" /> eBay Bulk Publish
          </CardTitle>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <Badge className="gap-1 text-[10px]"><CheckCircle className="h-3 w-3" /> Connected</Badge>
            ) : (
              <Badge variant="destructive" className="gap-1 text-[10px]">
                <XCircle className="h-3 w-3" /> Not Connected
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 mb-4 p-3 rounded-md bg-muted">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <Button
              size="sm"
              onClick={() => bulkPublish.mutate()}
              disabled={bulkPublish.isPending || !isConnected}
            >
              {bulkPublish.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Rocket className="h-3.5 w-3.5" />
              )}
              Push Selected to eBay
            </Button>
          </div>
        )}

        {readyDrafts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No eBay drafts with ready/published/failed status.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selectedIds.size === readyDrafts.length && readyDrafts.length > 0}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>eBay ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {readyDrafts.map((draft: any) => {
                  const p = draft.products;
                  return (
                    <TableRow key={draft.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(draft.id)}
                          onCheckedChange={() => toggleSelect(draft.id)}
                        />
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">
                        {draft.title || p?.source_product_name || "—"}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {draft.ebay_inventory_sku || p?.sku || p?.barcode || "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {draft.buy_it_now_price ? `$${Number(draft.buy_it_now_price).toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            draft.channel_status === "published"
                              ? "default"
                              : draft.channel_status === "failed"
                              ? "destructive"
                              : "secondary"
                          }
                          className="text-[10px]"
                        >
                          {draft.channel_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {draft.published_listing_id ? (
                          <a
                            href={`https://www.ebay.com.au/itm/${draft.published_listing_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline inline-flex items-center gap-1"
                          >
                            {draft.published_listing_id}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : "—"}
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
  );
}
