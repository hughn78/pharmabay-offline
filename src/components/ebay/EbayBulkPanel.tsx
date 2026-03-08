import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ShoppingCart, Rocket, RefreshCw, Loader2, CheckCircle, XCircle,
  AlertTriangle, ExternalLink,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function EbayBulkPanel() {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: readyDrafts = [], isLoading } = useQuery({
    queryKey: ["ebay-ready-drafts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ebay_drafts")
        .select("*, products!ebay_drafts_product_id_fkey(id, source_product_name, barcode, sku, compliance_status, stock_on_hand, quantity_reserved_for_store, quantity_available_for_ebay)")
        .in("channel_status", ["ready", "published", "failed"])
        .order("updated_at", { ascending: false })
        .limit(200);
      return data || [];
    },
  });

  const { data: ebayStatus } = useQuery({
    queryKey: ["ebay-connection-status"],
    queryFn: async () => {
      const res = await supabase.functions.invoke("ebay-auth", {
        body: { action: "get_status" },
      });
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
          const res = await supabase.functions.invoke("ebay-inventory", {
            body: {
              action: "publish_product",
              product_id: draft.product_id,
              draft_id: draft.id,
            },
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
