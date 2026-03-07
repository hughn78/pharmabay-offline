import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Package, Search, Filter, MoreHorizontal, RefreshCw, Download } from "lucide-react";
import { ComplianceBadgeWithOverride } from "@/components/compliance/ComplianceBadgeWithOverride";
import { fullComplianceCheck } from "@/lib/compliance-engine";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Papa from "papaparse";

export default function Products() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [complianceFilter, setComplianceFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isRunningCompliance, setIsRunningCompliance] = useState(false);
  const queryClient = useQueryClient();

  const { data: complianceRules = [] } = useQuery({
    queryKey: ["compliance-rules"],
    queryFn: async () => {
      const { data } = await supabase.from("compliance_rules").select("*").order("priority");
      return data || [];
    },
  });

  const handleRunCompliance = async () => {
    const targets = selectedIds.size > 0
      ? products.filter((p: any) => selectedIds.has(p.id))
      : products;
    if (targets.length === 0) return;

    setIsRunningCompliance(true);
    let updated = 0;
    try {
      for (const p of targets) {
        const result = fullComplianceCheck(p, complianceRules);
        if (result.status !== p.compliance_status) {
          await supabase
            .from("products")
            .update({
              compliance_status: result.status,
              compliance_reasons: result.reasons,
            })
            .eq("id", p.id);
          updated++;
        }
      }
      toast.success(`Compliance evaluated: ${updated} products updated`);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["review-queue"] });
    } catch (err: any) {
      toast.error("Compliance check failed: " + err.message);
    } finally {
      setIsRunningCompliance(false);
    }
  };

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", search, complianceFilter],
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(100);

      if (search) {
        q = q.or(`source_product_name.ilike.%${search}%,barcode.ilike.%${search}%,sku.ilike.%${search}%`);
      }
      if (complianceFilter !== "all") {
        q = q.eq("compliance_status", complianceFilter);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(products.map((p: any) => p.id)));
    }
  };

  const handleMarkChannelReady = async (channel: "ebay" | "shopify") => {
    const selected = products.filter((p: any) => selectedIds.has(p.id));
    if (selected.length === 0) return;

    try {
      const table = channel === "ebay" ? "ebay_drafts" : "shopify_drafts";
      let upserted = 0;

      for (const p of selected) {
        const draftData = channel === "ebay"
          ? {
              product_id: p.id,
              title: (p.source_product_name || "").substring(0, 80),
              brand: p.brand,
              ean: p.barcode,
              channel_status: "ready",
              start_price: p.sell_price,
              quantity: p.quantity_available_for_ebay ?? p.stock_on_hand ?? 0,
            }
          : {
              product_id: p.id,
              title: p.source_product_name,
              vendor: p.brand,
              product_type: p.product_type || p.z_category,
              channel_status: "ready",
              status: "draft",
            };

        await supabase.from(table).upsert(draftData, { onConflict: "product_id" });
        upserted++;
      }

      toast.success(`${upserted} products marked as ${channel === "ebay" ? "eBay" : "Shopify"} ready`);
      queryClient.invalidateQueries({ queryKey: [channel === "ebay" ? "ebay-draft" : "shopify-draft"] });
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    }
  };

  const handleExportCsv = () => {
    const selected = products.filter((p: any) => selectedIds.has(p.id));
    if (selected.length === 0) return;

    const rows = selected.map((p: any) => ({
      product_name: p.source_product_name,
      barcode: p.barcode,
      sku: p.sku,
      brand: p.brand,
      stock_on_hand: p.stock_on_hand,
      cost_price: p.cost_price,
      sell_price: p.sell_price,
      compliance_status: p.compliance_status,
      enrichment_status: p.enrichment_status,
    }));

    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `products-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${selected.length} products to CSV`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground text-sm">Manage your product catalog</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleRunCompliance} disabled={isRunningCompliance}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isRunningCompliance ? "animate-spin" : ""}`} />
            Run Compliance
          </Button>
          {selectedIds.size > 0 && (
            <>
              <Button size="sm" variant="secondary">Mark eBay Ready</Button>
              <Button size="sm" variant="secondary">Mark Shopify Ready</Button>
              <Button size="sm" variant="secondary">Export CSV</Button>
            </>
          )}
        </div>
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
            <Select value={complianceFilter} onValueChange={setComplianceFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Compliance" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="permitted">Permitted</SelectItem>
                <SelectItem value="review_required">Review Required</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selectedIds.size === products.length && products.length > 0}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Barcode</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>RRP</TableHead>
                  <TableHead>Compliance</TableHead>
                  <TableHead>Enrichment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      Loading products...
                    </TableCell>
                  </TableRow>
                ) : products.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      No products found. Import stock data to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  products.map((p: any) => (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => navigate(`/products/${p.id}`)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(p.id)}
                          onCheckedChange={() => toggleSelect(p.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium max-w-[300px] truncate">
                        {p.source_product_name || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.barcode || "—"}</TableCell>
                      <TableCell>{p.brand || "—"}</TableCell>
                      <TableCell>{p.stock_on_hand ?? "—"}</TableCell>
                      <TableCell>{p.cost_price ? `$${Number(p.cost_price).toFixed(2)}` : "—"}</TableCell>
                      <TableCell>{p.sell_price ? `$${Number(p.sell_price).toFixed(2)}` : "—"}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <ComplianceBadgeWithOverride
                          productId={p.id}
                          productName={p.source_product_name || ""}
                          status={p.compliance_status}
                          reasons={p.compliance_reasons as string[] | null}
                        />
                      </TableCell>
                      <TableCell><EnrichmentBadge status={p.enrichment_status} /></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ComplianceBadge({ status }: { status?: string }) {
  if (!status) return <Badge variant="outline" className="text-[10px]">Unknown</Badge>;
  const styles: Record<string, string> = {
    permitted: "status-permitted",
    review_required: "status-review",
    blocked: "status-blocked",
  };
  return <Badge className={`text-[10px] ${styles[status] || ""}`}>{status.replace("_", " ")}</Badge>;
}

function EnrichmentBadge({ status }: { status?: string }) {
  if (!status) return <Badge variant="outline" className="text-[10px]">Pending</Badge>;
  const map: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
    pending: "outline",
    in_progress: "secondary",
    complete: "default",
    failed: "destructive",
  };
  return <Badge variant={map[status] || "outline"} className="text-[10px]">{status}</Badge>;
}
