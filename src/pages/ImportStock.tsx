import { useState, useCallback, useMemo } from "react";
import { PricebookImportPanel } from "@/components/pricebook/PricebookImportPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  SkipForward,
  Plus,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Eye,
  Bug,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  readWorkbookRaw,
  parseFosSpreadsheet,
  fosRowToProductData,
  normalizeName,
  nameSimilarity,
  NAME_MATCH_THRESHOLD,
  computeDiffs,
  DEFAULT_FOS_CONFIG,
  type FosParsedRow,
  type FosParseResult,
  type FosParserConfig,
  type FieldDiff,
} from "@/lib/fos-parser";

type ImportStage = "upload" | "preview" | "importing" | "done";

interface MatchedRow {
  row: FosParsedRow;
  productData: Record<string, any>;
  matchType: "barcode" | "sku" | "name" | "new";
  matchedProductId?: string;
  existingProduct?: Record<string, any>;
  diffs: FieldDiff[];
}

interface ImportSummary {
  newRows: MatchedRow[];
  updateRows: MatchedRow[];
  skippedRows: FosParsedRow[];
  ambiguousRows: MatchedRow[];
}

interface ImportResult {
  newCount: number;
  updatedCount: number;
  skippedCount: number;
  snapshotsCreated: number;
  errorCount: number;
  errors: string[];
}

export default function ImportStock() {
  const [stage, setStage] = useState<ImportStage>("upload");
  const [isDragging, setIsDragging] = useState(false);
  const [filename, setFilename] = useState("");
  const [parseResult, setParseResult] = useState<FosParseResult | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [expandedDiffs, setExpandedDiffs] = useState<Set<number>>(new Set());
  const [showDebug, setShowDebug] = useState(false);
  const [config, setConfig] = useState<FosParserConfig>({ ...DEFAULT_FOS_CONFIG });
  const [rawBuffer, setRawBuffer] = useState<{ rawRows: any[][]; sheetName: string } | null>(null);

  // ── File Upload + Parse + Analyze in one step ──
  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
        toast.error("Unsupported file type");
        return;
      }
      try {
        setIsAnalyzing(true);
        const buffer = await file.arrayBuffer();
        const wb = readWorkbookRaw(buffer);
        setRawBuffer(wb);
        setFilename(file.name);

        // Parse with current config
        const result = parseFosSpreadsheet(wb.rawRows, wb.sheetName, config);
        setParseResult(result);

        // Analyze matches against existing products
        const matchSummary = await analyzeMatches(result);
        setSummary(matchSummary);
        setStage("preview");
      } catch (err) {
        toast.error("Failed to read file", { description: String(err) });
      }
      setIsAnalyzing(false);
    },
    [config]
  );

  const reparse = useCallback(
    async (newConfig: FosParserConfig) => {
      if (!rawBuffer) return;
      setIsAnalyzing(true);
      setConfig(newConfig);
      const result = parseFosSpreadsheet(rawBuffer.rawRows, rawBuffer.sheetName, newConfig);
      setParseResult(result);
      const matchSummary = await analyzeMatches(result);
      setSummary(matchSummary);
      setIsAnalyzing(false);
    },
    [rawBuffer]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  // ── Match analysis ──
  async function analyzeMatches(result: FosParseResult): Promise<ImportSummary> {
    const { data: existingProducts } = await supabase
      .from("products")
      .select(
        "id, barcode, sku, source_product_name, normalized_product_name, brand, department, z_category, cost_price, sell_price, stock_on_hand, stock_value, units_sold_12m, units_purchased_12m, total_sales_value_12m, gross_profit_percent, supplier"
      );

    const products = existingProducts || [];
    const barcodeMap = new Map<string, (typeof products)[0]>();
    const skuMap = new Map<string, (typeof products)[0]>();
    const nameEntries: { product: (typeof products)[0]; normalized: string }[] = [];

    for (const p of products) {
      if (p.barcode) barcodeMap.set(p.barcode, p);
      if (p.sku) skuMap.set(p.sku, p);
      const norm = normalizeName(p.source_product_name || "");
      if (norm) nameEntries.push({ product: p, normalized: norm });
    }

    const newRows: MatchedRow[] = [];
    const updateRows: MatchedRow[] = [];
    const skippedRows = [...result.skippedRows];
    const ambiguousRows: MatchedRow[] = [];

    for (const row of result.validRows) {
      const productData = fosRowToProductData(row);
      const barcode = productData.barcode;
      const sku = productData.sku;
      const name = String(productData.source_product_name || "").trim();

      let matched: (typeof products)[0] | null = null;
      let matchType: "barcode" | "sku" | "name" | "new" = "new";

      // 1. Barcode match
      if (barcode && barcodeMap.has(barcode)) {
        matched = barcodeMap.get(barcode)!;
        matchType = "barcode";
      }
      // 2. SKU match
      if (!matched && sku && skuMap.has(sku)) {
        matched = skuMap.get(sku)!;
        matchType = "sku";
      }
      // 3. Name match
      if (!matched && name) {
        const incomingNorm = normalizeName(name);
        let bestMatch: (typeof products)[0] | null = null;
        let bestScore = 0;
        for (const entry of nameEntries) {
          const score = nameSimilarity(incomingNorm, entry.normalized);
          if (score > bestScore) {
            bestScore = score;
            bestMatch = entry.product;
          }
        }
        if (bestScore >= NAME_MATCH_THRESHOLD && bestMatch) {
          matched = bestMatch;
          matchType = "name";
        } else if (bestScore >= 0.6 && bestMatch) {
          ambiguousRows.push({
            row,
            productData,
            matchType: "name",
            matchedProductId: bestMatch.id,
            existingProduct: bestMatch as any,
            diffs: [],
          });
          continue;
        }
      }

      if (matched) {
        const diffs = computeDiffs(matched, productData);
        updateRows.push({
          row,
          productData,
          matchType,
          matchedProductId: matched.id,
          existingProduct: matched as any,
          diffs,
        });
      } else {
        newRows.push({ row, productData, matchType: "new", diffs: [] });
      }
    }

    return { newRows, updateRows, skippedRows, ambiguousRows };
  }

  // ── Commit import (server-side atomic) ──
  const commitImport = async () => {
    if (!summary || !parseResult) return;
    setStage("importing");
    setIsImporting(true);
    setProgress(10);

    const rows = [
      ...summary.newRows.map((r) => ({
        action: "insert" as const,
        productData: r.productData,
        sheetRow: r.row.sheetRow,
      })),
      ...summary.updateRows.map((r) => ({
        action: "update" as const,
        productData: r.productData,
        matchedProductId: r.matchedProductId,
        sheetRow: r.row.sheetRow,
      })),
    ];

    try {
      setProgress(30);

      const res = await supabase.functions.invoke("import-commit", {
        body: {
          filename,
          rows,
          totalValid: parseResult.validRows.length,
          skippedCount: summary.skippedRows.length + summary.ambiguousRows.length,
          firstProductRow: parseResult.firstProductRow,
          footerRowsRemoved: parseResult.footerRowsRemoved,
        },
      });

      setProgress(90);

      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);

      const data = res.data;
      const result: ImportResult = {
        newCount: data.newCount || 0,
        updatedCount: data.updatedCount || 0,
        skippedCount: data.skippedCount || 0,
        snapshotsCreated: data.snapshotsCreated || 0,
        errorCount: data.errorCount || 0,
        errors: data.errors || [],
      };

      setImportResult(result);
      setProgress(100);
      setIsImporting(false);
      setStage("done");
      toast.success("Import complete", {
        description: `${result.newCount} new, ${result.updatedCount} updated, ${result.snapshotsCreated} snapshots`,
      });
    } catch (err: any) {
      setIsImporting(false);
      setStage("preview");
      toast.error("Import failed", { description: err.message });
    }
  };

  const toggleDiffExpand = (idx: number) => {
    setExpandedDiffs((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const reset = () => {
    setStage("upload");
    setParseResult(null);
    setSummary(null);
    setImportResult(null);
    setProgress(0);
    setExpandedDiffs(new Set());
    setRawBuffer(null);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import Stock</h1>
        <p className="text-muted-foreground text-sm">
          Upload Z Office FOS stock reports (.xlsx, .xls, .csv)
        </p>
      </div>

      {/* Stage indicator */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {["Upload", "Preview & Diff", "Import", "Done"].map((label, i) => {
          const stages: ImportStage[] = ["upload", "preview", "importing", "done"];
          const isActive = stages.indexOf(stage) >= i;
          return (
            <div key={label} className="flex items-center gap-2">
              {i > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground/40" />}
              <span className={isActive ? "font-medium text-foreground" : "opacity-50"}>
                {label}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── UPLOAD ── */}
      {stage === "upload" && (
        <div className="space-y-4">
          <Card
            className={`border-2 border-dashed transition-colors ${
              isDragging ? "border-primary bg-primary/5" : "border-border"
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <CardContent className="py-16 text-center">
              {isAnalyzing ? (
                <>
                  <RefreshCw className="h-12 w-12 mx-auto mb-4 text-primary animate-spin" />
                  <p className="font-medium">Parsing & analyzing…</p>
                </>
              ) : (
                <>
                  <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-40" />
                  <p className="font-medium mb-1">Drop your FOS stock report here</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Supports .xlsx, .xls, .csv — barcodes preserved as text
                  </p>
                  <label>
                    <Button variant="outline" asChild>
                      <span>Browse Files</span>
                    </Button>
                    <input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileInput} />
                  </label>
                </>
              )}
            </CardContent>
          </Card>

          {/* Parser config override */}
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 text-xs text-muted-foreground">
                <Settings2 className="h-3.5 w-3.5" />
                Advanced: Override parser settings
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <Card>
                <CardContent className="pt-4 pb-3 flex items-end gap-6">
                  <div className="space-y-1.5">
                    <Label className="text-xs">First product row (1-based)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={config.firstProductRow}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, firstProductRow: Math.max(1, parseInt(e.target.value) || 4) }))
                      }
                      className="w-20 font-mono h-8"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Footer rows to remove</Label>
                    <Input
                      type="number"
                      min={0}
                      value={config.footerRowsToRemove}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, footerRowsToRemove: Math.max(0, parseInt(e.target.value) || 3) }))
                      }
                      className="w-20 font-mono h-8"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground pb-1">
                    Defaults: row 4, remove last 3 rows
                  </p>
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* ── PREVIEW ── */}
      {stage === "preview" && summary && parseResult && (
        <div className="space-y-4">
          {/* File info bar */}
          <Card>
            <CardContent className="py-3 flex flex-wrap items-center gap-3">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{filename}</span>
              <Badge variant="outline" className="text-[10px]">{parseResult.sheetName}</Badge>
              <div className="flex-1" />
              <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                <span>Total rows: <strong className="text-foreground">{parseResult.totalRawRows}</strong></span>
                <span>•</span>
                <span>Product rows: <strong className="text-foreground">{parseResult.firstProductRow}–{parseResult.lastUsableRow}</strong></span>
                <span>•</span>
                <span>Footer removed: <strong className="text-foreground">{parseResult.footerRowsRemoved}</strong></span>
                <span>•</span>
                <span>Valid: <strong className="text-foreground">{parseResult.validRows.length}</strong></span>
                <span>•</span>
                <span>Skipped: <strong className="text-foreground">{parseResult.skippedRows.length}</strong></span>
              </div>
            </CardContent>
          </Card>

          {/* Parser config override in preview */}
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 text-xs text-muted-foreground">
                <Settings2 className="h-3.5 w-3.5" />
                Override row boundaries
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <Card>
                <CardContent className="pt-4 pb-3 flex items-end gap-6">
                  <div className="space-y-1.5">
                    <Label className="text-xs">First product row</Label>
                    <Input
                      type="number"
                      min={1}
                      value={config.firstProductRow}
                      onChange={(e) => {
                        const v = Math.max(1, parseInt(e.target.value) || 4);
                        reparse({ ...config, firstProductRow: v });
                      }}
                      className="w-20 font-mono h-8"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Footer rows to remove</Label>
                    <Input
                      type="number"
                      min={0}
                      value={config.footerRowsToRemove}
                      onChange={(e) => {
                        const v = Math.max(0, parseInt(e.target.value) || 3);
                        reparse({ ...config, footerRowsToRemove: v });
                      }}
                      className="w-20 font-mono h-8"
                    />
                  </div>
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>

          {/* Warnings */}
          {(parseResult.warnings.length > 0 || parseResult.validRows.some((r) => r.warnings.length > 0)) && (
            <Card className="border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5">
              <CardContent className="py-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
                  <div className="text-xs space-y-0.5">
                    {parseResult.warnings.map((w, i) => (
                      <p key={i}>{w}</p>
                    ))}
                    {parseResult.validRows.filter((r) => r.warnings.length > 0).length > 0 && (
                      <p className="text-muted-foreground">
                        {parseResult.validRows.filter((r) => r.warnings.length > 0).length} rows have parsing warnings (see Debug panel)
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard label="New Products" count={summary.newRows.length} icon={<Plus className="h-4 w-4" />} color="text-emerald-600 dark:text-emerald-400" />
            <SummaryCard label="Updates" count={summary.updateRows.length} icon={<RefreshCw className="h-4 w-4" />} color="text-primary" />
            <SummaryCard label="Skipped" count={summary.skippedRows.length} icon={<SkipForward className="h-4 w-4" />} color="text-muted-foreground" />
            <SummaryCard label="Ambiguous" count={summary.ambiguousRows.length} icon={<AlertTriangle className="h-4 w-4" />} color="text-amber-600 dark:text-amber-400" />
          </div>

          {/* Data tabs */}
          <Tabs defaultValue="preview">
            <TabsList>
              <TabsTrigger value="preview">Preview ({parseResult.validRows.length})</TabsTrigger>
              <TabsTrigger value="updates">Updates ({summary.updateRows.length})</TabsTrigger>
              <TabsTrigger value="new">New ({summary.newRows.length})</TabsTrigger>
              <TabsTrigger value="skipped">Skipped ({summary.skippedRows.length})</TabsTrigger>
              <TabsTrigger value="ambiguous">Ambiguous ({summary.ambiguousRows.length})</TabsTrigger>
            </TabsList>

            {/* PREVIEW TAB */}
            <TabsContent value="preview" className="mt-4">
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px] sticky left-0 bg-background z-10">#</TableHead>
                          <TableHead className="text-[10px] min-w-[200px]">Stock Name</TableHead>
                          <TableHead className="text-[10px]">SOH</TableHead>
                          <TableHead className="text-[10px]">APN</TableHead>
                          <TableHead className="text-[10px]">PDE</TableHead>
                          <TableHead className="text-[10px]">Avg Cost</TableHead>
                          <TableHead className="text-[10px]">Last Purchased</TableHead>
                          <TableHead className="text-[10px]">Last Sold</TableHead>
                          <TableHead className="text-[10px]">Stock Value</TableHead>
                          <TableHead className="text-[10px]">Sales Val</TableHead>
                          <TableHead className="text-[10px]">Qty Sold</TableHead>
                          <TableHead className="text-[10px]">Qty Purchased</TableHead>
                          <TableHead className="text-[10px]">Categories</TableHead>
                          <TableHead className="text-[10px]">Dept</TableHead>
                          <TableHead className="text-[10px]">Sell Price</TableHead>
                          <TableHead className="text-[10px]">RRP</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parseResult.validRows.slice(0, 200).map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-[10px] text-muted-foreground font-mono sticky left-0 bg-background">{row.sheetRow}</TableCell>
                            <TableCell className="text-[10px] max-w-[250px] truncate">{row.fields.stock_name}</TableCell>
                            <TableCell className="text-[10px] font-mono">{row.fields.soh ?? "—"}</TableCell>
                            <TableCell className="text-[10px] font-mono">{row.fields.apn ?? "—"}</TableCell>
                            <TableCell className="text-[10px] font-mono">{row.fields.pde ?? "—"}</TableCell>
                            <TableCell className="text-[10px]">{fmtNum(row.fields.avg_cost)}</TableCell>
                            <TableCell className="text-[10px]">{row.fields.last_purchased ?? "—"}</TableCell>
                            <TableCell className="text-[10px]">{row.fields.last_sold ?? "—"}</TableCell>
                            <TableCell className="text-[10px]">{fmtNum(row.fields.stock_value)}</TableCell>
                            <TableCell className="text-[10px]">{fmtNum(row.fields.sales_val)}</TableCell>
                            <TableCell className="text-[10px] font-mono">{row.fields.qty_sold ?? "—"}</TableCell>
                            <TableCell className="text-[10px] font-mono">{row.fields.qty_purchased ?? "—"}</TableCell>
                            <TableCell className="text-[10px] max-w-[120px] truncate">{row.fields.categories ?? "—"}</TableCell>
                            <TableCell className="text-[10px] max-w-[100px] truncate">{row.fields.dept ?? "—"}</TableCell>
                            <TableCell className="text-[10px]">{fmtNum(row.fields.sell_price)}</TableCell>
                            <TableCell className="text-[10px]">{fmtNum(row.fields.rrp)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {parseResult.validRows.length > 200 && (
                      <p className="text-xs text-muted-foreground text-center py-2">
                        Showing first 200 of {parseResult.validRows.length}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* UPDATES TAB */}
            <TabsContent value="updates" className="mt-4">
              <Card>
                <CardContent className="p-0">
                  {summary.updateRows.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">No updates detected</div>
                  ) : (
                    <div className="divide-y max-h-[500px] overflow-y-auto">
                      {summary.updateRows.map((item, i) => (
                        <div key={i}>
                          <button
                            className="w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors flex items-center gap-3"
                            onClick={() => toggleDiffExpand(i)}
                          >
                            {expandedDiffs.has(i) ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                            <div className="flex-1 min-w-0">
                              <span className="font-medium text-sm truncate block">{item.row.fields.stock_name}</span>
                              <span className="text-xs text-muted-foreground font-mono">
                                {item.row.fields.apn || item.row.fields.pde || "—"}
                              </span>
                            </div>
                            <Badge variant="outline" className="text-[10px] shrink-0">{item.matchType} match</Badge>
                            <Badge variant="secondary" className="text-[10px] shrink-0">{item.diffs.length} change{item.diffs.length !== 1 ? "s" : ""}</Badge>
                          </button>
                          {expandedDiffs.has(i) && item.diffs.length > 0 && (
                            <div className="px-4 pb-3 pl-11">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs">Field</TableHead>
                                    <TableHead className="text-xs">Current</TableHead>
                                    <TableHead className="text-xs">→</TableHead>
                                    <TableHead className="text-xs">Incoming</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {item.diffs.map((d, di) => (
                                    <TableRow key={di}>
                                      <TableCell className="text-xs font-mono py-1">{d.field}</TableCell>
                                      <TableCell className="text-xs py-1 text-muted-foreground max-w-[200px] truncate">{String(d.oldValue ?? "—")}</TableCell>
                                      <TableCell className="text-xs py-1"><ArrowRight className="h-3 w-3" /></TableCell>
                                      <TableCell className="text-xs py-1 font-medium max-w-[200px] truncate">{String(d.newValue ?? "—")}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* NEW TAB */}
            <TabsContent value="new" className="mt-4">
              <Card>
                <CardContent className="p-0">
                  {summary.newRows.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">No new products</div>
                  ) : (
                    <div className="overflow-x-auto max-h-[400px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Stock Name</TableHead>
                            <TableHead className="text-xs">APN</TableHead>
                            <TableHead className="text-xs">PDE</TableHead>
                            <TableHead className="text-xs">SOH</TableHead>
                            <TableHead className="text-xs">Avg Cost</TableHead>
                            <TableHead className="text-xs">Sell Price</TableHead>
                            <TableHead className="text-xs">RRP</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {summary.newRows.slice(0, 100).map((item, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs max-w-[250px] truncate">{item.row.fields.stock_name}</TableCell>
                              <TableCell className="text-xs font-mono">{item.row.fields.apn || "—"}</TableCell>
                              <TableCell className="text-xs font-mono">{item.row.fields.pde || "—"}</TableCell>
                              <TableCell className="text-xs">{item.row.fields.soh ?? "—"}</TableCell>
                              <TableCell className="text-xs">{fmtNum(item.row.fields.avg_cost)}</TableCell>
                              <TableCell className="text-xs">{fmtNum(item.row.fields.sell_price)}</TableCell>
                              <TableCell className="text-xs">{fmtNum(item.row.fields.rrp)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* SKIPPED TAB */}
            <TabsContent value="skipped" className="mt-4">
              <Card>
                <CardContent className="p-0">
                  {summary.skippedRows.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">No skipped rows</div>
                  ) : (
                    <div className="overflow-y-auto max-h-[400px] divide-y">
                      {summary.skippedRows.slice(0, 50).map((row, i) => (
                        <div key={i} className="px-4 py-2 text-xs flex items-center gap-3">
                          <span className="text-muted-foreground font-mono w-10">#{row.sheetRow}</span>
                          <span className="truncate flex-1">{row.fields.stock_name || "(empty)"}</span>
                          <Badge variant="outline" className="text-[9px] shrink-0">{row.skipReason}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* AMBIGUOUS TAB */}
            <TabsContent value="ambiguous" className="mt-4">
              <Card>
                <CardContent className="p-0">
                  {summary.ambiguousRows.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">No ambiguous matches — all clear!</div>
                  ) : (
                    <div className="overflow-y-auto max-h-[400px] divide-y">
                      {summary.ambiguousRows.map((item, i) => (
                        <div key={i} className="px-4 py-3">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                            <div className="text-xs space-y-1">
                              <div><span className="font-medium">Incoming:</span> {item.row.fields.stock_name}</div>
                              <div className="text-muted-foreground">
                                <span className="font-medium">Possible match:</span> {item.existingProduct?.source_product_name}
                              </div>
                              <p className="text-muted-foreground italic">Below threshold — skipped to avoid wrong merge.</p>
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

          {/* Debug panel */}
          <Collapsible open={showDebug} onOpenChange={setShowDebug}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 text-xs text-muted-foreground">
                <Bug className="h-3.5 w-3.5" />
                {showDebug ? "Hide" : "Show"} Debug Panel
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Parser Debug Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-xs">
                  {/* Metadata */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <DebugStat label="Worksheet" value={parseResult.sheetName} />
                    <DebugStat label="First Product Row" value={String(parseResult.firstProductRow)} />
                    <DebugStat label="Last Usable Row" value={String(parseResult.lastUsableRow)} />
                    <DebugStat label="Footer Rows Removed" value={String(parseResult.footerRowsRemoved)} />
                    <DebugStat label="Total Raw Rows" value={String(parseResult.totalRawRows)} />
                    <DebugStat label="Valid Products" value={String(parseResult.validRows.length)} />
                    <DebugStat label="Skipped" value={String(parseResult.skippedRows.length)} />
                    <DebugStat label="Rows w/ Warnings" value={String(parseResult.validRows.filter((r) => r.warnings.length > 0).length)} />
                  </div>

                  {/* Column mapping */}
                  <div>
                    <h4 className="font-medium mb-1.5">Column Mapping</h4>
                    <div className="flex flex-wrap gap-1">
                      {parseResult.columnMapping.map((col, i) => (
                        <Badge key={i} variant="outline" className="text-[9px] font-mono">
                          [{col.index}] {col.detectedHeader || col.fosHeader} → {col.field}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Header area rows */}
                  <div>
                    <h4 className="font-medium mb-1.5">Header Area (rows 1–{parseResult.firstProductRow - 1})</h4>
                    <div className="overflow-x-auto border rounded max-h-[120px]">
                      <table className="text-[10px] w-full">
                        <tbody>
                          {parseResult.headerAreaRows.map((row, ri) => (
                            <tr key={ri} className="border-b last:border-0">
                              <td className="px-1.5 py-0.5 text-muted-foreground font-mono w-8">{ri + 1}</td>
                              {(row || []).slice(0, 15).map((cell: any, ci: number) => (
                                <td key={ci} className="px-1.5 py-0.5 max-w-[100px] truncate">{String(cell ?? "")}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Sample raw→clean */}
                  {parseResult.sampleRows.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-1.5">Sample Raw → Clean (first 5 rows)</h4>
                      <div className="overflow-x-auto border rounded max-h-[200px]">
                        <table className="text-[10px] w-full">
                          <thead className="bg-muted sticky top-0">
                            <tr>
                              <th className="px-1.5 py-1 text-left font-medium">Field</th>
                              {parseResult.sampleRows.map((_, i) => (
                                <th key={i} className="px-1.5 py-1 text-left font-medium">Row {i + 1}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {["stock_name", "soh", "apn", "pde", "avg_cost", "sell_price", "categories", "dept"].map((field) => (
                              <tr key={field} className="border-t">
                                <td className="px-1.5 py-0.5 font-mono text-muted-foreground">{field}</td>
                                {parseResult.sampleRows.map((s, i) => (
                                  <td key={i} className="px-1.5 py-0.5 max-w-[120px] truncate">
                                    {String(s.clean[field] ?? "—")}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Row-level warnings */}
                  {parseResult.validRows.some((r) => r.warnings.length > 0) && (
                    <div>
                      <h4 className="font-medium mb-1.5">Row Parsing Warnings</h4>
                      <div className="max-h-[150px] overflow-y-auto border rounded p-2 space-y-0.5">
                        {parseResult.validRows
                          .filter((r) => r.warnings.length > 0)
                          .slice(0, 30)
                          .map((r, i) => (
                            <div key={i} className="text-muted-foreground">
                              <span className="font-mono">Row {r.sheetRow}:</span>{" "}
                              {r.warnings.join("; ")}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>

          {/* Commit */}
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={reset}>Cancel</Button>
            <Button onClick={commitImport} disabled={summary.newRows.length + summary.updateRows.length === 0}>
              Commit Import ({summary.newRows.length + summary.updateRows.length} rows)
            </Button>
          </div>
        </div>
      )}

      {/* ── IMPORTING ── */}
      {stage === "importing" && (
        <Card>
          <CardContent className="py-12 space-y-4">
            <Progress value={progress} />
            <p className="text-sm text-muted-foreground text-center">Importing… {progress}%</p>
            <p className="text-xs text-muted-foreground text-center">Creating products, updating records, and saving inventory snapshots</p>
          </CardContent>
        </Card>
      )}

      {/* ── DONE ── */}
      {stage === "done" && importResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="h-5 w-5" /> Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Stat label="New" value={importResult.newCount} color="text-emerald-600 dark:text-emerald-400" />
              <Stat label="Updated" value={importResult.updatedCount} color="text-primary" />
              <Stat label="Snapshots" value={importResult.snapshotsCreated} color="text-primary" />
              <Stat label="Skipped" value={importResult.skippedCount} color="text-muted-foreground" />
              <Stat label="Errors" value={importResult.errorCount} color="text-destructive" />
            </div>
            {importResult.errors.length > 0 && (
              <div className="text-xs bg-destructive/10 rounded p-3 max-h-[150px] overflow-y-auto space-y-1">
                {importResult.errors.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
            <Button variant="outline" onClick={reset}>Import Another File</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Helper components ──

function fmtNum(val: string | number | null | undefined): string {
  if (val == null) return "—";
  const n = typeof val === "number" ? val : parseFloat(String(val));
  if (isNaN(n)) return "—";
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}

function SummaryCard({ label, count, icon, color }: { label: string; count: number; icon: React.ReactNode; color: string }) {
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

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center p-3 border rounded-lg">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function DebugStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded p-2">
      <p className="text-muted-foreground text-[10px]">{label}</p>
      <p className="font-mono font-medium">{value}</p>
    </div>
  );
}
