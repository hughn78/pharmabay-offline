import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Link2, Search, Check, X, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface UnmatchedRow {
  id: string;
  platform: "ebay" | "shopify";
  title: string;
  sku: string;
  barcode: string;
  match_id: string;
  match_confidence: string;
}

export function ImportReviewQueue() {
  const queryClient = useQueryClient();
  const [linkDialogRow, setLinkDialogRow] = useState<UnmatchedRow | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // Fetch unmatched/ambiguous from channel_listing_matches
  const { data: unresolvedMatches = [], isLoading } = useQuery({
    queryKey: ["import-review-queue"],
    queryFn: async () => {
      const { data: matches } = await supabase
        .from("channel_listing_matches")
        .select("*")
        .or("product_id.is.null,is_confirmed.eq.false")
        .order("created_at", { ascending: false })
        .limit(200);

      if (!matches || matches.length === 0) return [];

      // Enrich with listing data
      const ebayIds = matches.filter((m) => m.platform === "ebay").map((m) => m.import_row_id);
      const shopifyIds = matches.filter((m) => m.platform === "shopify").map((m) => m.import_row_id);

      const [ebayRes, shopifyRes] = await Promise.all([
        ebayIds.length > 0
          ? supabase.from("ebay_live_listings").select("id, title, custom_label_sku, ean, upc").in("id", ebayIds)
          : { data: [] },
        shopifyIds.length > 0
          ? supabase.from("shopify_live_products").select("id, title, handle, variant_sku, variant_barcode").in("id", shopifyIds)
          : { data: [] },
      ]);

      const ebayMap = new Map((ebayRes.data || []).map((r) => [r.id, r]));
      const shopifyMap = new Map((shopifyRes.data || []).map((r) => [r.id, r]));

      return matches.map((m): UnmatchedRow => {
        if (m.platform === "ebay") {
          const listing = ebayMap.get(m.import_row_id);
          return {
            id: m.import_row_id,
            platform: "ebay",
            title: listing?.title || "Unknown",
            sku: listing?.custom_label_sku || "",
            barcode: listing?.ean || listing?.upc || "",
            match_id: m.id,
            match_confidence: m.match_confidence || "none",
          };
        }
        const listing = shopifyMap.get(m.import_row_id);
        return {
          id: m.import_row_id,
          platform: "shopify",
          title: listing?.title || listing?.handle || "Unknown",
          sku: listing?.variant_sku || "",
          barcode: listing?.variant_barcode || "",
          match_id: m.id,
          match_confidence: m.match_confidence || "none",
        };
      });
    },
  });

  const searchProducts = async () => {
    if (!productSearch.trim()) return;
    setSearching(true);
    const term = `%${productSearch.trim()}%`;
    const { data } = await supabase
      .from("products")
      .select("id, source_product_name, barcode, sku")
      .or(`source_product_name.ilike.${term},barcode.ilike.${term},sku.ilike.${term}`)
      .limit(20);
    setSearchResults(data || []);
    setSearching(false);
  };

  const confirmMatch = useMutation({
    mutationFn: async ({ matchId, productId }: { matchId: string; productId: string }) => {
      const { error } = await supabase
        .from("channel_listing_matches")
        .update({
          product_id: productId,
          is_confirmed: true,
          match_method: "manual",
          match_confidence: "high",
          confirmed_at: new Date().toISOString(),
        })
        .eq("id", matchId);
      if (error) throw error;

      // Also update the live listing row's product_id
      const { data: match } = await supabase
        .from("channel_listing_matches")
        .select("platform, import_row_id")
        .eq("id", matchId)
        .single();

      if (match) {
        const table = match.platform === "ebay" ? "ebay_live_listings" : "shopify_live_products";
        await supabase.from(table).update({ product_id: productId }).eq("id", match.import_row_id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["import-review-queue"] });
      toast.success("Match confirmed");
      setLinkDialogRow(null);
    },
    onError: (err) => toast.error("Failed", { description: String(err) }),
  });

  const dismissMatch = useMutation({
    mutationFn: async (matchId: string) => {
      await supabase
        .from("channel_listing_matches")
        .update({ is_confirmed: true, match_confidence: "none", match_method: "dismissed" })
        .eq("id", matchId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["import-review-queue"] });
      toast.info("Row dismissed");
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading review queue...
      </div>
    );
  }

  if (unresolvedMatches.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Check className="h-8 w-8 mx-auto mb-2 text-green-500" />
          <p className="font-medium">All clear</p>
          <p className="text-sm">No unmatched or ambiguous imported listings to review.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Unresolved Imports ({unresolvedMatches.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Platform</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Barcode</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unresolvedMatches.map((row) => (
                  <TableRow key={row.match_id}>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{row.platform}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[250px] truncate text-sm">{row.title}</TableCell>
                    <TableCell className="font-mono text-xs">{row.sku || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{row.barcode || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={row.match_confidence === "none" ? "destructive" : "outline"} className="text-[10px]">
                        {row.match_confidence}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="outline" size="sm" onClick={() => { setLinkDialogRow(row); setProductSearch(""); setSearchResults([]); }}>
                          <Link2 className="h-3.5 w-3.5 mr-1" /> Link
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => dismissMatch.mutate(row.match_id)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Manual link dialog */}
      <Dialog open={!!linkDialogRow} onOpenChange={() => setLinkDialogRow(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Link to Product</DialogTitle>
          </DialogHeader>
          {linkDialogRow && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground truncate">{linkDialogRow.title}</p>
              <div className="flex gap-2">
                <Input
                  placeholder="Search by name, SKU, or barcode..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchProducts()}
                />
                <Button variant="outline" size="icon" onClick={searchProducts} disabled={searching}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
              <div className="max-h-[250px] overflow-auto space-y-1">
                {searchResults.map((p) => (
                  <button
                    key={p.id}
                    className="w-full text-left p-2 rounded border hover:bg-accent/50 text-sm flex items-center justify-between"
                    onClick={() => confirmMatch.mutate({ matchId: linkDialogRow.match_id, productId: p.id })}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.source_product_name || "Untitled"}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        {[p.sku, p.barcode].filter(Boolean).join(" • ")}
                      </p>
                    </div>
                    <Link2 className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
                  </button>
                ))}
                {searchResults.length === 0 && productSearch && !searching && (
                  <p className="text-xs text-muted-foreground text-center py-4">No products found</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
