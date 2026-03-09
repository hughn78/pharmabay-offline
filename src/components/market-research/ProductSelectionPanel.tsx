import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, CheckSquare, Square, FlaskConical } from "lucide-react";
import { format, parseISO } from "date-fns";

interface Props {
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
}

function EnrichmentBadge({ summary }: { summary: any }) {
  if (!summary?.last_researched_at) {
    return (
      <Badge variant="outline" className="text-[10px] text-muted-foreground border-muted">
        Never researched
      </Badge>
    );
  }
  if (summary.needs_review) {
    return (
      <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600">
        Needs review
      </Badge>
    );
  }
  const conf = summary.overall_confidence ?? 0;
  if (conf >= 0.85) {
    return (
      <Badge variant="outline" className="text-[10px] border-green-500/50 text-green-600">
        Fully enriched
      </Badge>
    );
  }
  if (conf >= 0.5) {
    return (
      <Badge variant="outline" className="text-[10px] border-blue-500/50 text-blue-600">
        Partially enriched
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] text-muted-foreground border-muted">
      Low data
    </Badge>
  );
}

export function ProductSelectionPanel({ selectedIds, onSelectionChange }: Props) {
  const [search, setSearch] = useState("");

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["market-research-products", search],
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select(
          "id, normalized_product_name, source_product_name, brand, barcode, sku, enrichment_status",
        )
        .eq("product_status", "active")
        .order("source_product_name", { ascending: true })
        .limit(300);

      if (search.trim()) {
        q = q.or(
          `source_product_name.ilike.%${search}%,normalized_product_name.ilike.%${search}%,barcode.ilike.%${search}%,brand.ilike.%${search}%`,
        );
      }

      const { data } = await q;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  // Load enrichment summaries separately
  const productIds = products.map((p) => p.id);
  const { data: summaries = [] } = useQuery({
    queryKey: ["enrichment-summaries", productIds.join(",")],
    queryFn: async () => {
      if (productIds.length === 0) return [];
      const { data } = await (supabase as any)
        .from("product_enrichment_summary")
        .select("product_id, last_researched_at, overall_confidence, needs_review")
        .in("product_id", productIds);
      return data ?? [];
    },
    enabled: productIds.length > 0,
    staleTime: 30_000,
  });

  const summaryMap = Object.fromEntries(
    (summaries as any[]).map((s: any) => [s.product_id, s]),
  );

  const toggleProduct = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const selectAll = () => onSelectionChange(new Set(products.map((p) => p.id)));
  const clearAll = () => onSelectionChange(new Set());

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, brand or barcode…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={selectAll} disabled={products.length === 0}>
          <CheckSquare className="h-3.5 w-3.5 mr-1.5" />
          Select all ({products.length})
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={clearAll}
          disabled={selectedIds.size === 0}
        >
          <Square className="h-3.5 w-3.5 mr-1.5" />
          Clear
        </Button>
        {selectedIds.size > 0 && (
          <span className="text-sm text-muted-foreground ml-1">
            <strong>{selectedIds.size}</strong> selected
          </span>
        )}
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 pl-4"></TableHead>
              <TableHead>Product name</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Barcode / APN</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Research status</TableHead>
              <TableHead>Last researched</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                  Loading products…
                </TableCell>
              </TableRow>
            ) : products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <FlaskConical className="h-8 w-8 opacity-30" />
                    <span>No active products found</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              products.map((product) => {
                const summary = summaryMap[product.id];
                const isSelected = selectedIds.has(product.id);
                return (
                  <TableRow
                    key={product.id}
                    className={`cursor-pointer transition-colors ${isSelected ? "bg-primary/5 hover:bg-primary/8" : "hover:bg-muted/40"}`}
                    onClick={() => toggleProduct(product.id)}
                  >
                    <TableCell
                      className="pl-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleProduct(product.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {product.normalized_product_name || product.source_product_name || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {product.brand || "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {product.barcode || "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {product.sku || "—"}
                    </TableCell>
                    <TableCell>
                      <EnrichmentBadge summary={summary} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {summary?.last_researched_at
                        ? format(parseISO(summary.last_researched_at), "d MMM yyyy")
                        : "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {products.length} active products. Select items then click <strong>Add to Queue</strong>.
      </p>
    </div>
  );
}
