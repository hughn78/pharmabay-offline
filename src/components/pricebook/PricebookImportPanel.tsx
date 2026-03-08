import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  Plus,
  RefreshCw,
  Link2,
  HelpCircle,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  parsePricebook,
  detectWholesaler,
  matchToExistingProduct,
  buildProductIndexes,
  type Wholesaler,
  type WholesalerItem,
  type PricebookParseResult,
  type ProcessedItem,
  type PricebookImportSummary,
  type ExistingProduct,
} from "@/lib/pricebook-parser";

type Stage = "upload" | "preview" | "importing" | "done";

interface ImportResult {
  matched: number;
  created: number;
  conflicts: number;
  skipped: number;
  errors: string[];
}

export function PricebookImportPanel() {
  const [stage, setStage] = useState<Stage>("upload");
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<{ name: string; wholesaler: Wholesaler; buffer: ArrayBuffer }[]>([]);
  const [summaries, setSummaries] = useState<PricebookImportSummary[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dryRun, setDryRun] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    const newFiles: typeof files = [];
    for (const file of Array.from(fileList)) {
      if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
        toast.error(`${file.name}: unsupported format`);
        continue;
      }
      const buffer = await file.arrayBuffer();
      const ws = detectWholesaler(file.name, buffer);
      if (!ws) {
        toast.error(`${file.name}: couldn't detect wholesaler (expected API or Symbion in filename)`);
        continue;
      }
      newFiles.push({ name: file.name, wholesaler: ws, buffer });
    }
    if (newFiles.length) {
      setFiles((prev) => [...prev, ...newFiles]);
    }
  }, []);

  const analyze = useCallback(async () => {
    if (!files.length) return;
    setIsAnalyzing(true);

    try {
      // Parse all files
      const parseResults: PricebookParseResult[] = [];
      for (const f of files) {
        const parsed = parsePricebook(f.buffer, f.wholesaler, f.name);
        parseResults.push(parsed);
      }

      // Fetch existing products
      const { data: products } = await supabase
        .from("products")
        .select("id, barcode, sku, source_product_name, normalized_product_name, brand, cost_price, sell_price");

      // Fetch existing wholesaler SKUs
      const { data: wholesalerSkus } = await supabase
        .from("wholesaler_skus")
        .select("product_id, wholesaler, pde");

      const existingProducts = (products || []) as ExistingProduct[];
      const { barcodeMap, pdeMap, nameEntries } = buildProductIndexes(
        existingProducts,
        (wholesalerSkus || []) as any[]
      );

      // Match each item
      const allSummaries: PricebookImportSummary[] = [];
      for (const parsed of parseResults) {
        const matched: ProcessedItem[] = [];
        const newItems: ProcessedItem[] = [];
        const conflicts: ProcessedItem[] = [];

        for (const item of parsed.items) {
          const matchResult = matchToExistingProduct(
            item, existingProducts, barcodeMap, pdeMap, nameEntries
          );
          const processed = { item, match: matchResult };
          switch (matchResult.type) {
            case "MATCHED": matched.push(processed); break;
            case "NEW": newItems.push(processed); break;
            case "CONFLICT": conflicts.push(processed); break;
          }
        }

        allSummaries.push({
          wholesaler: parsed.wholesaler,
          totalRows: parsed.totalRows,
          matched,
          newItems,
          conflicts,
          skipped: parsed.skippedRows,
          warnings: parsed.warnings,
        });
      }

      setSummaries(allSummaries);
      setStage("preview");
    } catch (err: any) {
      toast.error("Analysis failed: " + err.message);
    }
    setIsAnalyzing(false);
  }, [files]);

  const commitImport = useCallback(async () => {
    setStage("importing");
    setIsImporting(true);
    setProgress(5);

    const errors: string[] = [];
    let totalMatched = 0;
    let totalCreated = 0;
    let totalConflicts = 0;
    let totalSkipped = 0;

    try {
      // Get user
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;

      for (const summary of summaries) {
        // Create import run
        const { data: runData } = await supabase
          .from("pricebook_import_runs")
          .insert({
            wholesaler: summary.wholesaler,
            total_rows: summary.totalRows,
            dry_run: dryRun,
            status: "running",
            imported_by: userId,
          })
          .select("id")
          .single();

        const runId = runData?.id;
        setProgress(15);

        // Process matched items — update cost prices
        const matchBatchSize = 50;
        for (let i = 0; i < summary.matched.length; i += matchBatchSize) {
          const batch = summary.matched.slice(i, i + matchBatchSize);

          if (!dryRun) {
            for (const { item, match } of batch) {
              try {
                // Update product cost price
                const updateData: Record<string, any> = {};
                if (item.costExGst != null) updateData.cost_price = item.costExGst;
                
                if (Object.keys(updateData).length > 0 && match.productId) {
                  await supabase.from("products").update(updateData).eq("id", match.productId);
                }

                // Upsert wholesaler SKU
                if (item.pde && match.productId) {
                  await supabase.from("wholesaler_skus").upsert(
                    {
                      product_id: match.productId,
                      wholesaler: item.wholesaler,
                      pde: item.pde,
                      barcode: item.barcode || null,
                      product_name: item.name,
                      generic_name: item.genericName || null,
                      cost_ex_gst: item.costExGst ?? null,
                      cost_inc_gst: item.costIncGst ?? null,
                      last_import_run_id: runId,
                      last_updated_at: new Date().toISOString(),
                    },
                    { onConflict: "wholesaler,pde" }
                  );
                }
              } catch (err: any) {
                errors.push(`Update ${item.name}: ${err.message}`);
              }
            }
          }
          totalMatched += batch.length;
          setProgress(15 + (i / summary.matched.length) * 30);
        }

        // Process new items — create products
        for (let i = 0; i < summary.newItems.length; i++) {
          const { item } = summary.newItems[i];
          if (!dryRun) {
            try {
              const { data: newProduct } = await supabase
                .from("products")
                .insert({
                  source_product_name: item.name,
                  normalized_product_name: item.name,
                  barcode: item.barcode || null,
                  sku: item.pde || null,
                  cost_price: item.costExGst ?? null,
                  supplier: item.wholesaler,
                  product_status: "active",
                })
                .select("id")
                .single();

              if (newProduct && item.pde) {
                await supabase.from("wholesaler_skus").upsert(
                  {
                    product_id: newProduct.id,
                    wholesaler: item.wholesaler,
                    pde: item.pde,
                    barcode: item.barcode || null,
                    product_name: item.name,
                    generic_name: item.genericName || null,
                    cost_ex_gst: item.costExGst ?? null,
                    cost_inc_gst: item.costIncGst ?? null,
                    last_import_run_id: runId,
                  },
                  { onConflict: "wholesaler,pde" }
                );
              }
            } catch (err: any) {
              errors.push(`Create ${item.name}: ${err.message}`);
            }
          }
          totalCreated++;
        }
        setProgress(60);

        // Process conflicts — log them
        for (const { item, match } of summary.conflicts) {
          if (!dryRun) {
            try {
              await supabase.from("product_import_conflicts").insert({
                import_run_id: runId,
                wholesaler: item.wholesaler,
                pde: item.pde || null,
                barcode: item.barcode || null,
                product_name: item.name,
                generic_name: item.genericName || null,
                cost_ex_gst: item.costExGst ?? null,
                cost_inc_gst: item.costIncGst ?? null,
                candidate_product_ids: match.candidateProductIds || [],
                conflict_reason: match.reason,
                raw_row: item.rawRow,
              });
            } catch (err: any) {
              errors.push(`Conflict log ${item.name}: ${err.message}`);
            }
          }
          totalConflicts++;
        }

        totalSkipped += summary.skipped;

        // Update run
        if (runId && !dryRun) {
          await supabase.from("pricebook_import_runs").update({
            matched_count: totalMatched,
            created_count: totalCreated,
            conflict_count: totalConflicts,
            skipped_count: totalSkipped,
            error_count: errors.length,
            status: "complete",
            completed_at: new Date().toISOString(),
          }).eq("id", runId);
        }
      }

      setProgress(100);
      setResult({ matched: totalMatched, created: totalCreated, conflicts: totalConflicts, skipped: totalSkipped, errors });
      setStage("done");
      toast.success(dryRun ? "Dry run complete" : "Pricebook import complete");
    } catch (err: any) {
      toast.error("Import failed: " + err.message);
      setStage("preview");
    }
    setIsImporting(false);
  }, [summaries, dryRun]);

  const reset = () => {
    setStage("upload");
    setFiles([]);
    setSummaries([]);
    setResult(null);
    setProgress(0);
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-4">
      {/* Stage indicator */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {["Upload", "Review", "Import", "Done"].map((label, i) => {
          const stages: Stage[] = ["upload", "preview", "importing", "done"];
          const isActive = stages.indexOf(stage) >= i;
          return (
            <div key={label} className="flex items-center gap-2">
              {i > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground/40" />}
              <span className={isActive ? "font-medium text-foreground" : "opacity-50"}>{label}</span>
            </div>
          );
        })}
      </div>

      {/* UPLOAD */}
      {stage === "upload" && (
        <>
          <Card
            className={`border-2 border-dashed transition-colors ${isDragging ? "border-primary bg-primary/5" : "border-border"}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
          >
            <CardContent className="py-12 text-center">
              <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
              <p className="font-medium mb-1">Drop wholesaler pricebook files here</p>
              <p className="text-sm text-muted-foreground mb-3">
                API (.xlsx) and Symbion (.csv/.xlsx) — auto-detected from filename
              </p>
              <label>
                <Button variant="outline" asChild>
                  <span>Browse Files</span>
                </Button>
                <input
                  type="file"
                  className="hidden"
                  accept=".xlsx,.xls,.csv"
                  multiple
                  onChange={(e) => e.target.files && handleFiles(e.target.files)}
                />
              </label>
            </CardContent>
          </Card>

          {files.length > 0 && (
            <Card>
              <CardContent className="p-3 space-y-2">
                <Label className="text-xs text-muted-foreground">Queued files ({files.length})</Label>
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{f.name}</span>
                    <Badge variant="outline" className="text-[10px]">{f.wholesaler}</Badge>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => removeFile(i)}>✕</Button>
                  </div>
                ))}
                <div className="flex items-center gap-3 pt-2">
                  <div className="flex items-center gap-2">
                    <Switch checked={dryRun} onCheckedChange={setDryRun} id="dry-run" />
                    <Label htmlFor="dry-run" className="text-xs">Dry run (no DB writes)</Label>
                  </div>
                  <div className="flex-1" />
                  <Button onClick={analyze} disabled={isAnalyzing} className="gap-1">
                    {isAnalyzing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                    Analyze & Preview
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* PREVIEW */}
      {stage === "preview" && summaries.length > 0 && (
        <>
          {summaries.map((summary, si) => (
            <div key={si} className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge className="text-xs">{summary.wholesaler}</Badge>
                <span className="text-sm text-muted-foreground">{summary.totalRows} total rows</span>
              </div>

              {/* Warnings */}
              {summary.warnings.length > 0 && (
                <Card className="border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5">
                  <CardContent className="py-2 px-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
                      <div className="text-[11px] space-y-0.5">
                        {summary.warnings.slice(0, 5).map((w, i) => <p key={i}>{w}</p>)}
                        {summary.warnings.length > 5 && (
                          <p className="text-muted-foreground">+{summary.warnings.length - 5} more</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Matched" count={summary.matched.length} icon={<Link2 className="h-4 w-4" />} color="text-primary" />
                <StatCard label="New" count={summary.newItems.length} icon={<Plus className="h-4 w-4" />} color="text-emerald-600" />
                <StatCard label="Conflicts" count={summary.conflicts.length} icon={<AlertTriangle className="h-4 w-4" />} color="text-amber-600" />
                <StatCard label="Skipped" count={summary.skipped} icon={<HelpCircle className="h-4 w-4" />} color="text-muted-foreground" />
              </div>

              {/* Detail tabs */}
              <Tabs defaultValue="matched">
                <TabsList>
                  <TabsTrigger value="matched">Matched ({summary.matched.length})</TabsTrigger>
                  <TabsTrigger value="new">New ({summary.newItems.length})</TabsTrigger>
                  <TabsTrigger value="conflicts">Conflicts ({summary.conflicts.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="matched" className="mt-3">
                  <Card>
                    <CardContent className="p-0">
                      <div className="overflow-auto max-h-[400px]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-[10px]">Name</TableHead>
                              <TableHead className="text-[10px]">PDE</TableHead>
                              <TableHead className="text-[10px]">Barcode</TableHead>
                              <TableHead className="text-[10px]">Cost Ex</TableHead>
                              <TableHead className="text-[10px]">Cost Inc</TableHead>
                              <TableHead className="text-[10px]">Match</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {summary.matched.slice(0, 200).map((p, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-[10px] max-w-[250px] truncate">{p.item.name}</TableCell>
                                <TableCell className="text-[10px] font-mono">{p.item.pde || "—"}</TableCell>
                                <TableCell className="text-[10px] font-mono">{p.item.barcode || "—"}</TableCell>
                                <TableCell className="text-[10px]">{p.item.costExGst?.toFixed(2) || "—"}</TableCell>
                                <TableCell className="text-[10px]">{p.item.costIncGst?.toFixed(2) || "—"}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-[9px]">{p.match.matchMethod}</Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        {summary.matched.length > 200 && (
                          <p className="text-xs text-center text-muted-foreground py-2">
                            Showing 200 of {summary.matched.length}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="new" className="mt-3">
                  <Card>
                    <CardContent className="p-0">
                      <div className="overflow-auto max-h-[400px]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-[10px]">Name</TableHead>
                              <TableHead className="text-[10px]">Generic</TableHead>
                              <TableHead className="text-[10px]">PDE</TableHead>
                              <TableHead className="text-[10px]">Barcode</TableHead>
                              <TableHead className="text-[10px]">Cost Ex</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {summary.newItems.slice(0, 200).map((p, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-[10px] max-w-[250px] truncate">{p.item.name}</TableCell>
                                <TableCell className="text-[10px] max-w-[150px] truncate">{p.item.genericName || "—"}</TableCell>
                                <TableCell className="text-[10px] font-mono">{p.item.pde || "—"}</TableCell>
                                <TableCell className="text-[10px] font-mono">{p.item.barcode || "—"}</TableCell>
                                <TableCell className="text-[10px]">{p.item.costExGst?.toFixed(2) || "—"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="conflicts" className="mt-3">
                  <Card>
                    <CardContent className="p-0">
                      {summary.conflicts.length === 0 ? (
                        <div className="py-8 text-center text-sm text-muted-foreground">No conflicts — all clear!</div>
                      ) : (
                        <div className="overflow-auto max-h-[400px] divide-y">
                          {summary.conflicts.map((p, i) => (
                            <div key={i} className="px-4 py-3">
                              <div className="flex items-start gap-2">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                                <div className="text-xs space-y-0.5">
                                  <p className="font-medium">{p.item.name}</p>
                                  <p className="text-muted-foreground font-mono">
                                    PDE: {p.item.pde || "—"} · Barcode: {p.item.barcode || "—"}
                                  </p>
                                  <p className="text-muted-foreground italic">{p.match.reason}</p>
                                  {p.match.candidateProductIds && (
                                    <p className="text-muted-foreground">
                                      Candidates: {p.match.candidateProductIds.length} product(s)
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          ))}

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={reset}>Cancel</Button>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <Switch checked={dryRun} onCheckedChange={setDryRun} id="dry-run-2" />
              <Label htmlFor="dry-run-2" className="text-xs">Dry run</Label>
            </div>
            <Button onClick={commitImport} className="gap-1">
              <CheckCircle className="h-3.5 w-3.5" />
              {dryRun ? "Run Dry Import" : "Commit Import"}
            </Button>
          </div>
        </>
      )}

      {/* IMPORTING */}
      {stage === "importing" && (
        <Card>
          <CardContent className="py-12 space-y-4">
            <Progress value={progress} />
            <p className="text-sm text-muted-foreground text-center">
              {dryRun ? "Simulating" : "Importing"}… {progress}%
            </p>
          </CardContent>
        </Card>
      )}

      {/* DONE */}
      {stage === "done" && result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-emerald-600">
              <CheckCircle className="h-5 w-5" />
              {dryRun ? "Dry Run Complete" : "Import Complete"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="text-center p-3 border rounded-lg">
                <div className="text-2xl font-bold text-primary">{result.matched}</div>
                <div className="text-xs text-muted-foreground mt-1">Matched & Updated</div>
              </div>
              <div className="text-center p-3 border rounded-lg">
                <div className="text-2xl font-bold text-emerald-600">{result.created}</div>
                <div className="text-xs text-muted-foreground mt-1">Created</div>
              </div>
              <div className="text-center p-3 border rounded-lg">
                <div className="text-2xl font-bold text-amber-600">{result.conflicts}</div>
                <div className="text-xs text-muted-foreground mt-1">Conflicts</div>
              </div>
              <div className="text-center p-3 border rounded-lg">
                <div className="text-2xl font-bold text-muted-foreground">{result.skipped}</div>
                <div className="text-xs text-muted-foreground mt-1">Skipped</div>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="text-xs bg-destructive/10 rounded p-3 max-h-[150px] overflow-y-auto space-y-1">
                {result.errors.slice(0, 20).map((e, i) => <div key={i}>{e}</div>)}
                {result.errors.length > 20 && <div>+{result.errors.length - 20} more errors</div>}
              </div>
            )}
            <Button variant="outline" onClick={reset}>Import Another</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, count, icon, color }: { label: string; count: number; icon: React.ReactNode; color: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${color}`}>{count}</p>
          </div>
          <div className={`${color} opacity-50`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}
