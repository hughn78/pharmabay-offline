import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeftRight,
  ArrowRight,
  ArrowLeft,
  Search,
  CheckCircle,
  AlertTriangle,
  Minus,
  Loader2,
  GitMerge,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Fields we compare between local product and Shopify payload
const COMPARE_FIELDS = [
  { key: "title", label: "Title", localKey: "normalized_product_name", shopifyPath: "title" },
  { key: "vendor", label: "Vendor / Brand", localKey: "brand", shopifyPath: "vendor" },
  { key: "product_type", label: "Product Type", localKey: "product_type", shopifyPath: "productType" },
  { key: "tags", label: "Tags", localKey: "z_category", shopifyPath: "tags", isArray: true },
  { key: "status", label: "Status", localKey: "enrichment_status", shopifyPath: "status" },
  { key: "barcode", label: "Barcode", localKey: "barcode", shopifyPath: "_firstVariantBarcode" },
  { key: "sku", label: "SKU", localKey: "sku", shopifyPath: "_firstVariantSku" },
  { key: "price", label: "Price", localKey: "sell_price", shopifyPath: "_firstVariantPrice", isNumber: true },
  { key: "cost", label: "Cost Price", localKey: "cost_price", shopifyPath: "_firstVariantCostPerItem", isNumber: true },
  { key: "inventory", label: "Inventory Qty", localKey: "stock_on_hand", shopifyPath: "_firstVariantInventoryQty", isNumber: true },
];

type MatchedProduct = {
  localProduct: any;
  shopifyProduct: any;
  shopifyRaw: any;
  matchType: "barcode" | "sku" | "title";
  diffs: FieldDiff[];
};

type FieldDiff = {
  field: typeof COMPARE_FIELDS[number];
  localValue: string;
  shopifyValue: string;
  isDifferent: boolean;
};

function extractShopifyValue(raw: any, shopifyPath: string): string {
  if (shopifyPath.startsWith("_firstVariant")) {
    const variants = raw?.variants?.edges;
    const first = variants?.[0]?.node;
    if (!first) return "";
    const map: Record<string, string> = {
      _firstVariantBarcode: first.barcode || "",
      _firstVariantSku: first.sku || "",
      _firstVariantPrice: first.price || "",
      _firstVariantCostPerItem: first.costPerItem || "",
      _firstVariantInventoryQty: String(first.inventoryQuantity ?? ""),
    };
    return map[shopifyPath] ?? "";
  }
  const val = raw?.[shopifyPath];
  if (Array.isArray(val)) return val.join(", ");
  return val != null ? String(val) : "";
}

function compareProducts(local: any, shopifyRaw: any): FieldDiff[] {
  return COMPARE_FIELDS.map((field) => {
    const localVal = local?.[field.localKey] != null ? String(local[field.localKey]) : "";
    const shopifyVal = extractShopifyValue(shopifyRaw, field.shopifyPath);
    const normalizeNum = (v: string) => {
      if (!field.isNumber) return v.toLowerCase().trim();
      const n = parseFloat(v);
      return isNaN(n) ? "" : n.toFixed(2);
    };
    return {
      field,
      localValue: localVal,
      shopifyValue: shopifyVal,
      isDifferent: normalizeNum(localVal) !== normalizeNum(shopifyVal),
    };
  });
}

export default function ShopifyReconciliation() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "diffs">("diffs");
  const [selectedMatch, setSelectedMatch] = useState<MatchedProduct | null>(null);
  const [mergeSelections, setMergeSelections] = useState<Record<string, "local" | "shopify">>({});

  // Fetch local products
  const { data: localProducts = [] } = useQuery({
    queryKey: ["recon-local-products"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("*").order("normalized_product_name");
      return data || [];
    },
  });

  // Fetch shopify synced products
  const { data: shopifyProducts = [] } = useQuery({
    queryKey: ["recon-shopify-products"],
    queryFn: async () => {
      const { data } = await supabase.from("shopify_products").select("*");
      return data || [];
    },
  });

  // Match and compare
  const matched = useMemo(() => {
    const results: MatchedProduct[] = [];
    const usedShopifyIds = new Set<string>();

    for (const local of localProducts) {
      let bestMatch: { sp: any; type: "barcode" | "sku" | "title" } | null = null;

      for (const sp of shopifyProducts) {
        const raw = sp.raw_payload as any;
        if (!raw) continue;
        if (usedShopifyIds.has(sp.id)) continue;

        const firstVar = raw?.variants?.edges?.[0]?.node;

        // Match by barcode
        if (local.barcode && firstVar?.barcode && local.barcode === firstVar.barcode) {
          bestMatch = { sp, type: "barcode" };
          break;
        }
        // Match by SKU
        if (local.sku && firstVar?.sku && local.sku === firstVar.sku) {
          bestMatch = { sp, type: "sku" };
          break;
        }
        // Match by title similarity
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
        results.push({
          localProduct: local,
          shopifyProduct: bestMatch.sp,
          shopifyRaw: raw,
          matchType: bestMatch.type,
          diffs,
        });
      }
    }

    return results;
  }, [localProducts, shopifyProducts]);

  const filtered = useMemo(() => {
    let list = matched;
    if (filterMode === "diffs") {
      list = list.filter((m) => m.diffs.some((d) => d.isDifferent));
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (m) =>
          (m.localProduct.normalized_product_name || "").toLowerCase().includes(q) ||
          (m.localProduct.sku || "").toLowerCase().includes(q) ||
          (m.localProduct.barcode || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [matched, filterMode, searchTerm]);

  const pushToLocal = useMutation({
    mutationFn: async (match: MatchedProduct) => {
      const updates: Record<string, any> = {};
      for (const diff of match.diffs) {
        if (diff.isDifferent && diff.shopifyValue) {
          if (diff.field.isNumber) {
            updates[diff.field.localKey] = parseFloat(diff.shopifyValue) || null;
          } else {
            updates[diff.field.localKey] = diff.shopifyValue;
          }
        }
      }
      if (Object.keys(updates).length === 0) return;
      const { error } = await supabase
        .from("products")
        .update(updates)
        .eq("id", match.localProduct.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pulled Shopify data to local");
      queryClient.invalidateQueries({ queryKey: ["recon-local-products"] });
      setSelectedMatch(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mergeFields = useMutation({
    mutationFn: async ({ match, selections }: { match: MatchedProduct; selections: Record<string, "local" | "shopify"> }) => {
      const updates: Record<string, any> = {};
      for (const diff of match.diffs) {
        if (!diff.isDifferent) continue;
        const choice = selections[diff.field.key];
        if (choice === "shopify" && diff.shopifyValue) {
          if (diff.field.isNumber) {
            updates[diff.field.localKey] = parseFloat(diff.shopifyValue) || null;
          } else {
            updates[diff.field.localKey] = diff.shopifyValue;
          }
        }
        // "local" means keep current — no update needed
      }
      if (Object.keys(updates).length === 0) return;
      const { error } = await supabase
        .from("products")
        .update(updates)
        .eq("id", match.localProduct.id);
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
    match.diffs.forEach((d) => {
      defaults[d.field.key] = "local"; // default keep local
    });
    setMergeSelections(defaults);
    setSelectedMatch(match);
  };

  const totalDiffs = matched.filter((m) => m.diffs.some((d) => d.isDifferent)).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Shopify Reconciliation</h1>
        <p className="text-muted-foreground text-sm">
          Compare local data against Shopify — {matched.length} matched, {totalDiffs} with differences
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, SKU, barcode…"
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button
          variant={filterMode === "diffs" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterMode(filterMode === "diffs" ? "all" : "diffs")}
        >
          <AlertTriangle className="h-3.5 w-3.5 mr-1" />
          {filterMode === "diffs" ? "Showing Diffs Only" : "Show All"}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <ArrowLeftRight className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">
                {matched.length === 0
                  ? "No matched products found. Sync Shopify products first."
                  : "No differences found — everything is in sync!"}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead className="text-center">Diffs</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((m) => {
                  const diffCount = m.diffs.filter((d) => d.isDifferent).length;
                  return (
                    <TableRow key={m.localProduct.id}>
                      <TableCell>
                        <div className="font-medium text-sm">
                          {m.localProduct.normalized_product_name || m.localProduct.source_product_name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {m.localProduct.sku && `SKU: ${m.localProduct.sku}`}
                          {m.localProduct.barcode && ` • ${m.localProduct.barcode}`}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {m.matchType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {diffCount === 0 ? (
                          <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">
                            {diffCount}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {diffCount > 0 && (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs gap-1"
                              onClick={() => pushToLocal.mutate(m)}
                              title="Pull all Shopify values to local"
                            >
                              <ArrowLeft className="h-3 w-3" /> Pull
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => openMerge(m)}
                              title="Merge selectively"
                            >
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

      {/* Merge Dialog */}
      <Dialog open={!!selectedMatch} onOpenChange={() => setSelectedMatch(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              Merge: {selectedMatch?.localProduct?.normalized_product_name || selectedMatch?.localProduct?.source_product_name}
            </DialogTitle>
          </DialogHeader>

          {selectedMatch && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                For each differing field, choose which value to keep. "Local" keeps current data, "Shopify" overwrites with Shopify's value.
              </p>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">Field</TableHead>
                      <TableHead>
                        <span className="flex items-center gap-1 text-xs">
                          <ArrowRight className="h-3 w-3" /> Local
                        </span>
                      </TableHead>
                      <TableHead>
                        <span className="flex items-center gap-1 text-xs">
                          <ArrowLeft className="h-3 w-3" /> Shopify
                        </span>
                      </TableHead>
                      <TableHead className="w-[80px] text-center">Use</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedMatch.diffs.map((diff) => (
                      <TableRow
                        key={diff.field.key}
                        className={diff.isDifferent ? "bg-destructive/5" : ""}
                      >
                        <TableCell className="text-xs font-medium">{diff.field.label}</TableCell>
                        <TableCell>
                          <span
                            className={`text-xs ${
                              diff.isDifferent && mergeSelections[diff.field.key] === "local"
                                ? "font-semibold text-foreground"
                                : "text-muted-foreground"
                            }`}
                          >
                            {diff.localValue || <Minus className="h-3 w-3 inline opacity-30" />}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`text-xs ${
                              diff.isDifferent && mergeSelections[diff.field.key] === "shopify"
                                ? "font-semibold text-foreground"
                                : "text-muted-foreground"
                            }`}
                          >
                            {diff.shopifyValue || <Minus className="h-3 w-3 inline opacity-30" />}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {diff.isDifferent ? (
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() =>
                                  setMergeSelections((s) => ({ ...s, [diff.field.key]: "local" }))
                                }
                                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                                  mergeSelections[diff.field.key] === "local"
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "border-border text-muted-foreground hover:border-primary"
                                }`}
                              >
                                L
                              </button>
                              <button
                                onClick={() =>
                                  setMergeSelections((s) => ({ ...s, [diff.field.key]: "shopify" }))
                                }
                                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                                  mergeSelections[diff.field.key] === "shopify"
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "border-border text-muted-foreground hover:border-primary"
                                }`}
                              >
                                S
                              </button>
                            </div>
                          ) : (
                            <CheckCircle className="h-3.5 w-3.5 text-green-500 mx-auto" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-between items-center pt-2">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const all: Record<string, "local" | "shopify"> = {};
                      selectedMatch.diffs.forEach((d) => { all[d.field.key] = "local"; });
                      setMergeSelections(all);
                    }}
                  >
                    All Local
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const all: Record<string, "local" | "shopify"> = {};
                      selectedMatch.diffs.forEach((d) => { all[d.field.key] = "shopify"; });
                      setMergeSelections(all);
                    }}
                  >
                    All Shopify
                  </Button>
                </div>
                <Button
                  size="sm"
                  onClick={() =>
                    mergeFields.mutate({ match: selectedMatch, selections: mergeSelections })
                  }
                  disabled={mergeFields.isPending}
                >
                  {mergeFields.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Apply Merge
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
