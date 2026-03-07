import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowRight, ArrowLeft, CheckCircle, Minus, Loader2 } from "lucide-react";
import type { MatchedProduct } from "@/lib/reconciliation-utils";

interface Props {
  selectedMatch: MatchedProduct | null;
  mergeSelections: Record<string, "local" | "shopify">;
  setMergeSelections: React.Dispatch<React.SetStateAction<Record<string, "local" | "shopify">>>;
  onClose: () => void;
  onMerge: (match: MatchedProduct, selections: Record<string, "local" | "shopify">) => void;
  isPending: boolean;
}

export function ReconciliationMergeDialog({ selectedMatch, mergeSelections, setMergeSelections, onClose, onMerge, isPending }: Props) {
  if (!selectedMatch) return null;

  return (
    <Dialog open={!!selectedMatch} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            Merge: {selectedMatch.localProduct?.normalized_product_name || selectedMatch.localProduct?.source_product_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            For each differing field, choose which value to keep. "Local" keeps current data, "Shopify" overwrites with Shopify's value.
          </p>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Field</TableHead>
                  <TableHead><span className="flex items-center gap-1 text-xs"><ArrowRight className="h-3 w-3" /> Local</span></TableHead>
                  <TableHead><span className="flex items-center gap-1 text-xs"><ArrowLeft className="h-3 w-3" /> Shopify</span></TableHead>
                  <TableHead className="w-[80px] text-center">Use</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedMatch.diffs.map((diff) => (
                  <TableRow key={diff.field.key} className={diff.isDifferent ? "bg-destructive/5" : ""}>
                    <TableCell className="text-xs font-medium">{diff.field.label}</TableCell>
                    <TableCell>
                      <span className={`text-xs ${diff.isDifferent && mergeSelections[diff.field.key] === "local" ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                        {diff.localValue || <Minus className="h-3 w-3 inline opacity-30" />}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs ${diff.isDifferent && mergeSelections[diff.field.key] === "shopify" ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                        {diff.shopifyValue || <Minus className="h-3 w-3 inline opacity-30" />}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {diff.isDifferent ? (
                        <div className="flex items-center justify-center gap-2">
                          {(["local", "shopify"] as const).map((side) => (
                            <button
                              key={side}
                              onClick={() => setMergeSelections((s) => ({ ...s, [diff.field.key]: side }))}
                              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                                mergeSelections[diff.field.key] === side
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "border-border text-muted-foreground hover:border-primary"
                              }`}
                            >
                              {side === "local" ? "L" : "S"}
                            </button>
                          ))}
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
              {(["local", "shopify"] as const).map((side) => (
                <Button key={side} size="sm" variant="outline" onClick={() => {
                  const all: Record<string, "local" | "shopify"> = {};
                  selectedMatch.diffs.forEach((d) => { all[d.field.key] = side; });
                  setMergeSelections(all);
                }}>
                  All {side === "local" ? "Local" : "Shopify"}
                </Button>
              ))}
            </div>
            <Button size="sm" onClick={() => onMerge(selectedMatch, mergeSelections)} disabled={isPending}>
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Apply Merge
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
