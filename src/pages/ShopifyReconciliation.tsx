import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeftRight, ArrowLeft, Search, CheckCircle, AlertTriangle,
  Loader2, GitMerge,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ReconciliationMergeDialog } from "@/components/reconciliation/ReconciliationMergeDialog";
import { COMPARE_FIELDS, compareProducts, type MatchedProduct } from "@/lib/reconciliation-utils";

export default function ShopifyReconciliation() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "diffs">("diffs");
  const [selectedMatch, setSelectedMatch] = useState<MatchedProduct | null>(null);
  const [mergeSelections, setMergeSelections] = useState<Record<string, "local" | "shopify">>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: localProducts = [] } = useQuery({
    queryKey: ["recon-local-products"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("*").order("normalized_product_name");
      return data || [];
    },
  });

  const { data: shopifyProducts = [] } = useQuery({
    queryKey: ["recon-shopify-products"],
    queryFn: async () => {
      const { data } = await supabase.from("shopify_products").select("*");
      return data || [];
    },
  });

  const matched = useMemo(() => {
    const results: MatchedProduct[] = [];
    const usedShopifyIds = new Set<string>();

    for (const local of localProducts) {
      let bestMatch: { sp: any; type: "barcode" | "sku" | "title" } | null = null;

      for (const sp of shopifyProducts) {
        const raw = sp.raw_payload as any;
        if (!raw || usedShopifyIds.has(sp.id)) continue;
        const firstVar = raw?.variants?.edges?.[0]?.node;

        if (local.barcode && firstVar?.barcode && local.barcode === firstVar.barcode) {
          bestMatch = { sp, type: "barcode" }; break;
        }
        if (local.sku && firstVar?.sku && local.sku === firstVar.sku) {
          bestMatch = { sp, type: "sku" }; break;
        }
        const localName = (local.normalized_product_name || local.source_product_name || "").toLowerCase();
        const shopifyTitle = (raw.title || "").toLowerCase();
        if (localName && shopifyTitle && localName === shopifyTitle) {
          bestMatch = { sp, type: "title" };
        }
      }

      if (bestMatch) {
        usedShopifyIds.add(bestMatch.sp.id);
        const raw = bestMatch.sp.raw_payload as any;
        const diffs = compareProducts(local, raw);
        results.push({ localProduct: local, shopifyProduct: bestMatch.sp, shopifyRaw: raw, matchType: bestMatch.type, diffs });
      }
    }
    return results;
  }, [localProducts, shopifyProducts]);

  const filtered = useMemo(() => {
    let list = matched;
    if (filterMode === "diffs") list = list.filter((m) => m.diffs.some((d) => d.isDifferent));
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter((m) =>
        (m.localProduct.normalized_product_name || "").toLowerCase().includes(q) ||
        (m.localProduct.sku || "").toLowerCase().includes(q) ||
        (m.localProduct.barcode || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [matched, filterMode, searchTerm]);

  const filteredWithDiffs = useMemo(() => filtered.filter((m) => m.diffs.some((d) => d.isDifferent)), [filtered]);

  // Single pull
  const pushToLocal = useMutation({
    mutationFn: async (match: MatchedProduct) => {
      const updates: Record<string, any> = {};
      for (const diff of match.diffs) {
        if (diff.isDifferent && diff.shopifyValue) {
          updates[diff.field.localKey] = diff.field.isNumber ? (parseFloat(diff.shopifyValue) || null) : diff.shopifyValue;
        }
      }
      if (Object.keys(updates).length === 0) return;
      const { error } = await supabase.from("products").update(updates).eq("id", match.localProduct.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pulled Shopify data to local");
      queryClient.invalidateQueries({ queryKey: ["recon-local-products"] });
      setSelectedMatch(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Bulk pull
  const bulkPull = useMutation({
    mutationFn: async (matches: MatchedProduct[]) => {
      let count = 0;
      for (const match of matches) {
        const updates: Record<string, any> = {};
        for (const diff of match.diffs) {
          if (diff.isDifferent && diff.shopifyValue) {
            updates[diff.field.localKey] = diff.field.isNumber ? (parseFloat(diff.shopifyValue) || null) : diff.shopifyValue;
          }
        }
        if (Object.keys(updates).length === 0) continue;
        const { error } = await supabase.from("products").update(updates).eq("id", match.localProduct.id);
        if (error) throw error;
        count++;
      }
      return count;
    },
    onSuccess: (count) => {
      toast.success(`Pulled Shopify data for ${count} product(s)`);
      queryClient.invalidateQueries({ queryKey: ["recon-local-products"] });
      setSelectedIds(new Set());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Merge
  const mergeFields = useMutation({
    mutationFn: async ({ match, selections }: { match: MatchedProduct; selections: Record<string, "local" | "shopify"> }) => {
      const updates: Record<string, any> = {};
      for (const diff of match.diffs) {
        if (!diff.isDifferent) continue;
        if (selections[diff.field.key] === "shopify" && diff.shopifyValue) {
          updates[diff.field.localKey] = diff.field.isNumber ? (parseFloat(diff.shopifyValue) || null) : diff.shopifyValue;
        }
      }
      if (Object.keys(updates).length === 0) return;
      const { error } = await supabase.from("products").update(updates).eq("id", match.localProduct.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Merged selected fields");
      queryClient.invalidateQueries({ queryKey: ["recon-local-products"] });
      setSelectedMatch(null);
      setMergeSelections({});
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openMerge = (match: MatchedProduct) => {
    const defaults: Record<string, "local" | "shopify"> = {};
    match.diffs.forEach((d) => { defaults[d.field.key] = "local"; });
    setMergeSelections(defaults);
    setSelectedMatch(match);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredWithDiffs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredWithDiffs.map((m) => m.localProduct.id)));
    }
  };

  const selectedMatches = useMemo(
    () => filtered.filter((m) => selectedIds.has(m.localProduct.id) && m.diffs.some((d) => d.isDifferent)),
    [filtered, selectedIds]
  );

  const totalDiffs = matched.filter((m) => m.diffs.some((d) => d.isDifferent)).length;
  const allSelected = filteredWithDiffs.length > 0 && selectedIds.size === filteredWithDiffs.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Shopify Reconciliation</h1>
        <p className="text-muted-foreground text-sm">
          Compare local data against Shopify — {matched.length} matched, {totalDiffs} with differences
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, SKU, barcode…" className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <Button variant={filterMode === "diffs" ? "default" : "outline"} size="sm" onClick={() => setFilterMode(filterMode === "diffs" ? "all" : "diffs")}>
          <AlertTriangle className="h-3.5 w-3.5 mr-1" />
          {filterMode === "diffs" ? "Showing Diffs Only" : "Show All"}
        </Button>

        {selectedMatches.length > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <Badge variant="secondary" className="text-xs">{selectedMatches.length} selected</Badge>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => bulkPull.mutate(selectedMatches)} disabled={bulkPull.isPending}>
              {bulkPull.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowLeft className="h-3 w-3" />}
              Bulk Pull
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <ArrowLeftRight className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">
                {matched.length === 0 ? "No matched products found. Sync Shopify products first." : "No differences found — everything is in sync!"}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="Select all" />
                  </TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead className="text-center">Diffs</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((m) => {
                  const diffCount = m.diffs.filter((d) => d.isDifferent).length;
                  const isSelected = selectedIds.has(m.localProduct.id);
                  return (
                    <TableRow key={m.localProduct.id} className={isSelected ? "bg-accent/50" : ""}>
                      <TableCell>
                        {diffCount > 0 && (
                          <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(m.localProduct.id)} aria-label="Select product" />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{m.localProduct.normalized_product_name || m.localProduct.source_product_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {m.localProduct.sku && `SKU: ${m.localProduct.sku}`}
                          {m.localProduct.barcode && ` • ${m.localProduct.barcode}`}
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{m.matchType}</Badge></TableCell>
                      <TableCell className="text-center">
                        {diffCount === 0 ? (
                          <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">{diffCount}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {diffCount > 0 && (
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => pushToLocal.mutate(m)} title="Pull all Shopify values to local">
                              <ArrowLeft className="h-3 w-3" /> Pull
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openMerge(m)} title="Merge selectively">
                              <GitMerge className="h-3 w-3" /> Merge
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ReconciliationMergeDialog
        selectedMatch={selectedMatch}
        mergeSelections={mergeSelections}
        setMergeSelections={setMergeSelections}
        onClose={() => setSelectedMatch(null)}
        onMerge={(match, selections) => mergeFields.mutate({ match, selections })}
        isPending={mergeFields.isPending}
      />
    </div>
  );
}
