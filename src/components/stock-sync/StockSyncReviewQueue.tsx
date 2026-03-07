import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowLeft, CheckCircle, XCircle, HelpCircle, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  syncRunId: string | null;
  onBack: () => void;
}

export function StockSyncReviewQueue({ syncRunId, onBack }: Props) {
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["stock-sync-review-items", syncRunId],
    queryFn: async () => {
      if (!syncRunId) return [];
      const { data } = await supabase
        .from("stock_sync_items")
        .select("*")
        .eq("sync_run_id", syncRunId)
        .in("sync_status", ["uncertain_match", "no_match", "sync_failed"])
        .order("local_product_name");
      return data || [];
    },
    enabled: !!syncRunId,
  });

  const confirmMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from("stock_sync_items")
        .update({
          match_confidence: "high",
          sync_status: "update_needed",
        })
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Match confirmed — ready to sync");
      queryClient.invalidateQueries({ queryKey: ["stock-sync-review-items"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const skipMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from("stock_sync_items")
        .update({ sync_status: "skipped" })
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item skipped");
      queryClient.invalidateQueries({ queryKey: ["stock-sync-review-items"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const uncertainItems = items.filter((i: any) => i.sync_status === "uncertain_match");
  const noMatchItems = items.filter((i: any) => i.sync_status === "no_match");
  const failedItems = items.filter((i: any) => i.sync_status === "sync_failed");

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
                  <TableHead>Shopify Barcode / SKU</TableHead>
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
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {item.shopify_barcode || "—"} / {item.shopify_sku || "—"}
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{item.match_type}</Badge></TableCell>
                    <TableCell className="text-right font-mono text-sm">{item.local_stock_on_hand ?? 0}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{item.current_shopify_qty ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm" variant="ghost" className="h-7 text-xs gap-1"
                          onClick={() => confirmMutation.mutate(item.id)}
                          disabled={confirmMutation.isPending}
                        >
                          <CheckCircle className="h-3 w-3" /> Confirm
                        </Button>
                        <Button
                          size="sm" variant="ghost" className="h-7 text-xs gap-1"
                          onClick={() => skipMutation.mutate(item.id)}
                          disabled={skipMutation.isPending}
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
              <p className="text-xs text-muted-foreground">These local products have no Shopify match.</p>
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

      {items.length === 0 && !isLoading && (
        <div className="py-16 text-center text-muted-foreground">
          <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No items need review — all matches are high confidence!</p>
        </div>
      )}
    </div>
  );
}
