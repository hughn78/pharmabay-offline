import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, XCircle, AlertTriangle, Eye } from "lucide-react";
import type { MatchResult } from "@/lib/channel-import-matcher";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  rows: Record<string, any>[];
  matches: MatchResult[];
  platform: "ebay" | "shopify";
}

const PAGE_SIZE = 50;

export function ImportPreviewTable({ rows, matches, platform }: Props) {
  const [page, setPage] = useState(0);
  const [detailRow, setDetailRow] = useState<Record<string, any> | null>(null);
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const slice = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const matchSlice = matches.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-2">
      <div className="overflow-auto max-h-[400px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">#</TableHead>
              <TableHead>{platform === "ebay" ? "Title" : "Handle / Title"}</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Barcode</TableHead>
              <TableHead>{platform === "ebay" ? "Price" : "Variant Price"}</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Match</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slice.map((row, i) => {
              const m = matchSlice[i];
              const idx = page * PAGE_SIZE + i + 1;
              return (
                <TableRow key={i}>
                  <TableCell className="text-xs text-muted-foreground">{idx}</TableCell>
                  <TableCell className="max-w-[300px] truncate text-sm">
                    {platform === "ebay" ? row.title : `${row.handle || ""} — ${row.title || ""}`}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {platform === "ebay" ? row.custom_label_sku : row.variant_sku}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {platform === "ebay" ? (row.ean || row.upc) : row.variant_barcode}
                  </TableCell>
                  <TableCell className="text-sm">
                    {platform === "ebay"
                      ? (row.current_price ?? row.start_price ?? "—")
                      : (row.variant_price ?? "—")}
                  </TableCell>
                  <TableCell className="text-sm">
                    {platform === "ebay" ? (row.available_quantity ?? "—") : "—"}
                  </TableCell>
                  <TableCell>
                    <MatchBadge match={m} />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setDetailRow(row)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-2 justify-end">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Prev
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page + 1} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!detailRow} onOpenChange={() => setDetailRow(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">Row Detail</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {detailRow && (
              <div className="space-y-1 text-xs">
                {Object.entries(detailRow)
                  .filter(([k]) => k !== "_rowIndex" && k !== "raw_row")
                  .map(([k, v]) => (
                    <div key={k} className="flex gap-2 py-0.5 border-b border-border/40">
                      <span className="font-medium text-muted-foreground w-[160px] shrink-0 truncate">{k}</span>
                      <span className="break-all">{v === null ? "—" : String(v)}</span>
                    </div>
                  ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MatchBadge({ match }: { match?: MatchResult }) {
  if (!match) return <Badge variant="outline">—</Badge>;
  if (match.ambiguous) {
    return (
      <Badge variant="outline" className="text-yellow-600 border-yellow-400 gap-1">
        <AlertTriangle className="h-3 w-3" /> Ambiguous
      </Badge>
    );
  }
  if (match.product_id) {
    return (
      <Badge variant="outline" className="text-green-600 border-green-400 gap-1">
        <CheckCircle2 className="h-3 w-3" /> {match.match_method}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground gap-1">
      <XCircle className="h-3 w-3" /> No match
    </Badge>
  );
}
