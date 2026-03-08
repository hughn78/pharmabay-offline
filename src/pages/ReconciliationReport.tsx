import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
import {
  Search,
  AlertTriangle,
  CheckCircle,
  Flag,
  ArrowLeftRight,
  Loader2,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { buildSafeIlikeOr } from "@/lib/search-utils";

interface ReconRow {
  productId: string;
  productName: string;
  fields: ReconField[];
  hasMismatch: boolean;
  flagged: boolean;
}

interface ReconField {
  label: string;
  master: string;
  ebayDraft: string;
  shopifyDraft: string;
  ebayLive: string;
  shopifyLive: string;
  hasDiff: boolean;
}

function val(v: any): string {
  if (v == null || v === "") return "—";
  return String(v);
}

function priceVal(v: any): string {
  if (v == null || v === "" || v === 0) return "—";
  return `$${Number(v).toFixed(2)}`;
}

function differ(...vals: string[]): boolean {
  const real = vals.filter((v) => v !== "—");
  if (real.length <= 1) return false;
  return new Set(real).size > 1;
}

export default function ReconciliationReport() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [filter, setFilter] = useState("all");
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Fetch products
  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ["recon-products", debouncedSearch],
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("id, source_product_name, barcode, sku, brand, sell_price, cost_price, stock_on_hand, compliance_status, quantity_available_for_ebay, quantity_available_for_shopify")
        .order("source_product_name")
        .limit(500);
      if (debouncedSearch) {
        q = q.or(buildSafeIlikeOr(["source_product_name", "barcode", "sku"], debouncedSearch));
      }
      const { data } = await q;
      return data || [];
    },
  });

  const productIds = products.map((p: any) => p.id);

  // Fetch all related data in parallel
  const { data: ebayDrafts = [] } = useQuery({
    queryKey: ["recon-ebay-drafts", productIds],
    queryFn: async () => {
      if (!productIds.length) return [];
      const { data } = await supabase
        .from("ebay_drafts")
        .select("product_id, title, ebay_inventory_sku, ean, upc, start_price, buy_it_now_price, quantity, condition_id, channel_status, category_id")
        .in("product_id", productIds);
      return data || [];
    },
    enabled: productIds.length > 0,
  });

  const { data: shopifyDrafts = [] } = useQuery({
    queryKey: ["recon-shopify-drafts", productIds],
    queryFn: async () => {
      if (!productIds.length) return [];
      const { data } = await supabase
        .from("shopify_drafts")
        .select("product_id, title, handle, vendor, channel_status, product_type")
        .in("product_id", productIds);
      return data || [];
    },
    enabled: productIds.length > 0,
  });

  const { data: ebayLive = [] } = useQuery({
    queryKey: ["recon-ebay-live", productIds],
    queryFn: async () => {
      if (!productIds.length) return [];
      const { data } = await supabase
        .from("ebay_live_listings")
        .select("product_id, title, custom_label_sku, ean, upc, current_price, available_quantity, condition, ebay_item_number, format")
        .in("product_id", productIds);
      return data || [];
    },
    enabled: productIds.length > 0,
  });

  const { data: shopifyLive = [] } = useQuery({
    queryKey: ["recon-shopify-live", productIds],
    queryFn: async () => {
      if (!productIds.length) return [];
      const { data } = await supabase
        .from("shopify_live_products")
        .select("product_id, title, handle, variant_sku, variant_barcode, variant_price, status, vendor")
        .in("product_id", productIds);
      return data || [];
    },
    enabled: productIds.length > 0,
  });

  // Fetch shopify variants for price/qty
  const { data: shopifyVariants = [] } = useQuery({
    queryKey: ["recon-shopify-variants", productIds],
    queryFn: async () => {
      if (!productIds.length) return [];
      const { data } = await supabase
        .from("shopify_variants")
        .select("product_id, sku, barcode, price, inventory_quantity")
        .in("product_id", productIds);
      return data || [];
    },
    enabled: productIds.length > 0,
  });

  // Build lookup maps
  const reconRows = useMemo<ReconRow[]>(() => {
    const ebayDraftMap = new Map<string, any>();
    ebayDrafts.forEach((d: any) => { if (d.product_id && !ebayDraftMap.has(d.product_id)) ebayDraftMap.set(d.product_id, d); });
    const shopifyDraftMap = new Map<string, any>();
    shopifyDrafts.forEach((d: any) => { if (d.product_id && !shopifyDraftMap.has(d.product_id)) shopifyDraftMap.set(d.product_id, d); });
    const ebayLiveMap = new Map<string, any>();
    ebayLive.forEach((d: any) => { if (d.product_id && !ebayLiveMap.has(d.product_id)) ebayLiveMap.set(d.product_id, d); });
    const shopifyLiveMap = new Map<string, any>();
    shopifyLive.forEach((d: any) => { if (d.product_id && !shopifyLiveMap.has(d.product_id)) shopifyLiveMap.set(d.product_id, d); });
    const shopifyVarMap = new Map<string, any>();
    shopifyVariants.forEach((d: any) => { if (d.product_id && !shopifyVarMap.has(d.product_id)) shopifyVarMap.set(d.product_id, d); });

    return products.map((p: any): ReconRow => {
      const ed = ebayDraftMap.get(p.id) || {};
      const sd = shopifyDraftMap.get(p.id) || {};
      const el = ebayLiveMap.get(p.id) || {};
      const sl = shopifyLiveMap.get(p.id) || {};
      const sv = shopifyVarMap.get(p.id) || {};

      const fields: ReconField[] = [
        {
          label: "Title",
          master: val(p.source_product_name),
          ebayDraft: val(ed.title),
          shopifyDraft: val(sd.title),
          ebayLive: val(el.title),
          shopifyLive: val(sl.title),
          hasDiff: false,
        },
        {
          label: "SKU",
          master: val(p.sku),
          ebayDraft: val(ed.ebay_inventory_sku),
          shopifyDraft: val("—"),
          ebayLive: val(el.custom_label_sku),
          shopifyLive: val(sl.variant_sku || sv.sku),
          hasDiff: false,
        },
        {
          label: "Barcode",
          master: val(p.barcode),
          ebayDraft: val(ed.ean || ed.upc),
          shopifyDraft: val("—"),
          ebayLive: val(el.ean || el.upc),
          shopifyLive: val(sl.variant_barcode || sv.barcode),
          hasDiff: false,
        },
        {
          label: "Price",
          master: priceVal(p.sell_price),
          ebayDraft: priceVal(ed.start_price || ed.buy_it_now_price),
          shopifyDraft: priceVal(sv.price),
          ebayLive: priceVal(el.current_price),
          shopifyLive: priceVal(sl.variant_price || sv.price),
          hasDiff: false,
        },
        {
          label: "Quantity",
          master: val(p.stock_on_hand),
          ebayDraft: val(ed.quantity),
          shopifyDraft: val(sv.inventory_quantity),
          ebayLive: val(el.available_quantity),
          shopifyLive: val("—"),
          hasDiff: false,
        },
        {
          label: "Status",
          master: val(p.compliance_status),
          ebayDraft: val(ed.channel_status),
          shopifyDraft: val(sd.channel_status),
          ebayLive: val(el.ebay_item_number ? "live" : undefined),
          shopifyLive: val(sl.status),
          hasDiff: false,
        },
      ];

      // Calculate diffs
      fields.forEach((f) => {
        f.hasDiff = differ(f.master, f.ebayDraft, f.shopifyDraft, f.ebayLive, f.shopifyLive);
      });

      const hasMismatch = fields.some((f) => f.hasDiff);

      return {
        productId: p.id,
        productName: p.source_product_name || "Untitled",
        fields,
        hasMismatch,
        flagged: flaggedIds.has(p.id),
      };
    });
  }, [products, ebayDrafts, shopifyDrafts, ebayLive, shopifyLive, shopifyVariants, flaggedIds]);

  // Filter
  const filteredRows = useMemo(() => {
    if (filter === "mismatches") return reconRows.filter((r) => r.hasMismatch);
    if (filter === "flagged") return reconRows.filter((r) => r.flagged);
    if (filter === "no_live") return reconRows.filter((r) => {
      const hasLive = r.fields.some((f) => (f.label === "Status") && (f.ebayLive !== "—" || f.shopifyLive !== "—"));
      return !hasLive;
    });
    return reconRows;
  }, [reconRows, filter]);

  const mismatchCount = reconRows.filter((r) => r.hasMismatch).length;
  const flaggedCount = flaggedIds.size;

  const toggleFlag = (id: string) => {
    setFlaggedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredRows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRows.map((r) => r.productId)));
    }
  };

  const flagSelected = () => {
    setFlaggedIds((prev) => {
      const next = new Set(prev);
      selectedIds.forEach((id) => next.add(id));
      return next;
    });
    toast.success(`Flagged ${selectedIds.size} product(s) for correction`);
    setSelectedIds(new Set());
  };

  const unflagSelected = () => {
    setFlaggedIds((prev) => {
      const next = new Set(prev);
      selectedIds.forEach((id) => next.delete(id));
      return next;
    });
    setSelectedIds(new Set());
  };

  const isLoading = loadingProducts;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reconciliation Report</h1>
          <p className="text-muted-foreground text-sm">
            Compare master data, channel drafts, and live online listings side-by-side
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground">Total Products</p>
            <p className="text-2xl font-bold mt-1">{reconRows.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <div>
                <p className="text-xs text-muted-foreground">Mismatches</p>
                <p className="text-2xl font-bold mt-1">{mismatchCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <div>
                <p className="text-xs text-muted-foreground">In Sync</p>
                <p className="text-2xl font-bold mt-1">{reconRows.length - mismatchCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Flagged</p>
                <p className="text-2xl font-bold mt-1">{flaggedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
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
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Products</SelectItem>
                <SelectItem value="mismatches">Mismatches Only</SelectItem>
                <SelectItem value="flagged">Flagged Only</SelectItem>
                <SelectItem value="no_live">No Live Data</SelectItem>
              </SelectContent>
            </Select>
            {selectedIds.size > 0 && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={flagSelected}>
                  <Flag className="h-3.5 w-3.5 mr-1" /> Flag ({selectedIds.size})
                </Button>
                <Button size="sm" variant="ghost" onClick={unflagSelected}>
                  Unflag
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading reconciliation data...
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <ArrowLeftRight className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">No products match the current filter</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedIds.size === filteredRows.length && filteredRows.length > 0}
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                    <TableHead className="min-w-[180px]">Product</TableHead>
                    <TableHead>Field</TableHead>
                    <TableHead>Master</TableHead>
                    <TableHead>eBay Draft</TableHead>
                    <TableHead>Shopify Draft</TableHead>
                    <TableHead>eBay Live</TableHead>
                    <TableHead>Shopify Live</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <ReconProductRows
                      key={row.productId}
                      row={row}
                      isSelected={selectedIds.has(row.productId)}
                      onToggleSelect={() => toggleSelect(row.productId)}
                      onToggleFlag={() => toggleFlag(row.productId)}
                      onNavigate={() => navigate(`/products/${row.productId}`)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReconProductRows({
  row,
  isSelected,
  onToggleSelect,
  onToggleFlag,
  onNavigate,
}: {
  row: ReconRow;
  isSelected: boolean;
  onToggleSelect: () => void;
  onToggleFlag: () => void;
  onNavigate: () => void;
}) {
  const diffFields = row.fields.filter((f) => f.hasDiff);
  const displayFields = diffFields.length > 0 ? diffFields : row.fields.slice(0, 2); // show at least title + price if no diffs

  return (
    <>
      {displayFields.map((field, idx) => (
        <TableRow
          key={`${row.productId}-${field.label}`}
          className={`${row.hasMismatch ? "bg-amber-500/5" : ""} ${row.flagged ? "border-l-2 border-l-primary" : ""}`}
        >
          {idx === 0 && (
            <>
              <TableCell rowSpan={displayFields.length} className="align-top" onClick={(e) => e.stopPropagation()}>
                <div className="flex flex-col items-center gap-1.5">
                  <Checkbox checked={isSelected} onCheckedChange={onToggleSelect} />
                  <button onClick={onToggleFlag} className="text-muted-foreground hover:text-primary">
                    <Flag className={`h-3.5 w-3.5 ${row.flagged ? "text-primary fill-primary" : ""}`} />
                  </button>
                </div>
              </TableCell>
              <TableCell
                rowSpan={displayFields.length}
                className="align-top cursor-pointer hover:underline"
                onClick={onNavigate}
              >
                <div className="space-y-1">
                  <p className="font-medium text-sm truncate max-w-[180px]">{row.productName}</p>
                  <div className="flex gap-1 flex-wrap">
                    {row.hasMismatch ? (
                      <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600">
                        <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> {diffFields.length} diff{diffFields.length !== 1 ? "s" : ""}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-600">
                        <CheckCircle className="h-2.5 w-2.5 mr-0.5" /> In sync
                      </Badge>
                    )}
                    {row.flagged && (
                      <Badge className="text-[10px]">Flagged</Badge>
                    )}
                  </div>
                </div>
              </TableCell>
            </>
          )}
          <TableCell className="text-xs font-medium text-muted-foreground whitespace-nowrap">{field.label}</TableCell>
          <ReconCell value={field.master} isDiff={field.hasDiff} isBase />
          <ReconCell value={field.ebayDraft} isDiff={field.hasDiff} base={field.master} />
          <ReconCell value={field.shopifyDraft} isDiff={field.hasDiff} base={field.master} />
          <ReconCell value={field.ebayLive} isDiff={field.hasDiff} base={field.master} />
          <ReconCell value={field.shopifyLive} isDiff={field.hasDiff} base={field.master} />
        </TableRow>
      ))}
    </>
  );
}

function ReconCell({
  value,
  isDiff,
  base,
  isBase,
}: {
  value: string;
  isDiff: boolean;
  base?: string;
  isBase?: boolean;
}) {
  const differs = isDiff && !isBase && value !== "—" && base && value !== base;
  return (
    <TableCell
      className={`text-xs max-w-[150px] truncate ${
        differs ? "text-amber-700 dark:text-amber-400 font-semibold bg-amber-500/10" : ""
      } ${isBase && isDiff ? "font-medium" : ""}`}
    >
      {value}
    </TableCell>
  );
}
