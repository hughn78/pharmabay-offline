import { useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
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
  ArrowDown,
  SkipForward,
  Plus,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  readWorkbookRaw,
  detectHeaderRow,
  buildHeaderMapping,
  parseDataRows,
  normalizeName,
  nameSimilarity,
  NAME_MATCH_THRESHOLD,
  computeDiffs,
  buildProductData,
  DIFF_FIELDS,
  type ParsedProductRow,
  type FieldDiff,
} from "@/lib/fos-parser";

type ImportStage = "upload" | "configure" | "preview" | "importing" | "done";

interface ImportSummary {
  newRows: ParsedProductRow[];
  updateRows: (ParsedProductRow & { diffs: FieldDiff[] })[];
  skippedRows: ParsedProductRow[];
  ambiguousRows: ParsedProductRow[];
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
  const [rawRows, setRawRows] = useState<any[][]>([]);
  const [sheetName, setSheetName] = useState("");
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [autoDetectedRow, setAutoDetectedRow] = useState(0);
  const [mappedHeaders, setMappedHeaders] = useState<
    { original: string; mapped: string | null }[]
  >([]);
  const [parsedRows, setParsedRows] = useState<ParsedProductRow[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [expandedDiffs, setExpandedDiffs] = useState<Set<number>>(new Set());

  // ── Step 1: File Upload ──
  const handleFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast.error("Unsupported file type");
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const { rawRows: rows, sheetName: sn } = readWorkbookRaw(buffer);
      if (rows.length < 2) {
        toast.error("File has too few rows");
        return;
      }
      const detected = detectHeaderRow(rows);
      setRawRows(rows);
      setSheetName(sn);
      setFilename(file.name);
      setHeaderRowIndex(detected);
      setAutoDetectedRow(detected);

      // Build header mapping immediately
      const mapping = buildHeaderMapping(rows[detected]);
      setMappedHeaders(mapping);

      setStage("configure");
    } catch (err) {
      toast.error("Failed to read file", { description: String(err) });
    }
  }, []);

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

  // ── Step 2: Configure header row ──
  const applyHeaderRow = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(idx, rawRows.length - 2));
      setHeaderRowIndex(clamped);
      const mapping = buildHeaderMapping(rawRows[clamped]);
      setMappedHeaders(mapping);
    },
    [rawRows]
  );

  const mappedFieldCount = useMemo(
    () => mappedHeaders.filter((h) => h.mapped).length,
    [mappedHeaders]
  );

  const hasCriticalFields = useMemo(() => {
    const mapped = new Set(mappedHeaders.map((h) => h.mapped).filter(Boolean));
    return mapped.has("source_product_name");
  }, [mappedHeaders]);

  // ── Step 3: Analyze & build preview diff ──
  const analyzeImport = useCallback(async () => {
    setIsAnalyzing(true);
    try {
      const rows = parseDataRows(rawRows, headerRowIndex, mappedHeaders);
      setParsedRows(rows);

      // Fetch all existing products for matching
      const { data: existingProducts } = await supabase
        .from("products")
        .select(
          "id, barcode, sku, source_product_name, normalized_product_name, brand, department, z_category, cost_price, sell_price, stock_on_hand, stock_value, units_sold_12m, units_purchased_12m, total_sales_value_12m, total_cogs_12m, gross_profit_percent, supplier"
        );

      const products = existingProducts || [];
      const barcodeMap = new Map<string, (typeof products)[0]>();
      const skuMap = new Map<string, (typeof products)[0]>();
      const nameMap = new Map<
        string,
        { product: (typeof products)[0]; normalized: string }
      >();

      for (const p of products) {
        if (p.barcode) barcodeMap.set(p.barcode, p);
        if (p.sku) skuMap.set(p.sku, p);
        const norm = normalizeName(p.source_product_name || "");
        if (norm) nameMap.set(p.id, { product: p, normalized: norm });
      }

      const newRows: ParsedProductRow[] = [];
      const updateRows: (ParsedProductRow & { diffs: FieldDiff[] })[] = [];
      const skippedRows: ParsedProductRow[] = [];
      const ambiguousRows: ParsedProductRow[] = [];

      for (const row of rows) {
        if (row.skipReason) {
          skippedRows.push(row);
          continue;
        }

        const barcode = row.fields.barcode
          ? String(row.fields.barcode).trim()
          : null;
        const sku = row.fields.sku ? String(row.fields.sku).trim() : null;
        const name = String(row.fields.source_product_name || "").trim();

        let matched: (typeof products)[0] | null = null;
        let matchType: "barcode" | "sku" | "name" | "new" = "new";

        // 1. Match by barcode
        if (barcode && barcodeMap.has(barcode)) {
          matched = barcodeMap.get(barcode)!;
          matchType = "barcode";
        }

        // 2. Match by SKU
        if (!matched && sku && skuMap.has(sku)) {
          matched = skuMap.get(sku)!;
          matchType = "sku";
        }

        // 3. Match by high-confidence normalized name
        if (!matched && name) {
          const incomingNorm = normalizeName(name);
          let bestMatch: (typeof products)[0] | null = null;
          let bestScore = 0;
          for (const [, entry] of nameMap) {
            const score = nameSimilarity(incomingNorm, entry.normalized);
            if (score > bestScore) {
              bestScore = score;
              bestMatch = entry.product;
            }
          }
          if (bestScore >= NAME_MATCH_THRESHOLD && bestMatch) {
            matched = bestMatch;
            matchType = "name";
          } else if (bestScore >= 0.6 && bestScore < NAME_MATCH_THRESHOLD && bestMatch) {
            // Ambiguous match
            row.matchType = "name";
            row.matchedProductId = bestMatch.id;
            row.existingProduct = bestMatch as any;
            ambiguousRows.push(row);
            continue;
          }
        }

        if (matched) {
          row.matchType = matchType;
          row.matchedProductId = matched.id;
          row.existingProduct = matched as any;
          const diffs = computeDiffs(matched, row.fields);
          updateRows.push({ ...row, diffs });
        } else {
          row.matchType = "new";
          newRows.push(row);
        }
      }

      setSummary({ newRows, updateRows, skippedRows, ambiguousRows });
      setStage("preview");
    } catch (err) {
      toast.error("Analysis failed", { description: String(err) });
    }
    setIsAnalyzing(false);
  }, [rawRows, headerRowIndex, mappedHeaders]);

  // ── Step 4: Commit import ──
  const commitImport = async () => {
    if (!summary) return;
    setStage("importing");
    setIsImporting(true);
    setProgress(0);

    const result: ImportResult = {
      newCount: 0,
      updatedCount: 0,
      skippedCount: summary.skippedRows.length + summary.ambiguousRows.length,
      snapshotsCreated: 0,
      errorCount: 0,
      errors: [],
    };

    const allRows = [
      ...summary.newRows.map((r) => ({ row: r, action: "insert" as const })),
      ...summary.updateRows.map((r) => ({
        row: r,
        action: "update" as const,
      })),
    ];
    const total = allRows.length;

    // Create import batch record first
    const { data: batchData } = await supabase
      .from("import_batches")
      .insert({
        filename,
        row_count: parsedRows.length,
        new_count: summary.newRows.length,
        updated_count: summary.updateRows.length,
        skipped_count: result.skippedCount,
        error_count: 0,
      })
      .select("id")
      .single();

    const batchId = batchData?.id;

    for (let i = 0; i < total; i++) {
      const { row, action } = allRows[i];
      try {
        const productData = buildProductData(row.fields);

        if (action === "update" && row.matchedProductId) {
          await supabase
            .from("products")
            .update(productData)
            .eq("id", row.matchedProductId);
          result.updatedCount++;

          // Create inventory snapshot
          await supabase.from("inventory_snapshots").insert({
            product_id: row.matchedProductId,
            snapshot_date: new Date().toISOString().split("T")[0],
            stock_on_hand: productData.stock_on_hand,
            sell_price: productData.sell_price,
            cost_price: productData.cost_price,
            stock_value: productData.stock_value,
            units_sold_12m: productData.units_sold_12m,
            source_batch_id: batchId,
          });
          result.snapshotsCreated++;
        } else {
          const { data: inserted } = await supabase
            .from("products")
            .insert({
              ...productData,
              compliance_status: "permitted",
              enrichment_status: "pending",
            })
            .select("id")
            .single();

          result.newCount++;

          // Create snapshot for new product too
          if (inserted?.id) {
            await supabase.from("inventory_snapshots").insert({
              product_id: inserted.id,
              snapshot_date: new Date().toISOString().split("T")[0],
              stock_on_hand: productData.stock_on_hand,
              sell_price: productData.sell_price,
              cost_price: productData.cost_price,
              stock_value: productData.stock_value,
              units_sold_12m: productData.units_sold_12m,
              source_batch_id: batchId,
            });
            result.snapshotsCreated++;
          }
        }
      } catch (err) {
        result.errorCount++;
        result.errors.push(`Row ${row.rawIndex + 1}: ${String(err)}`);
      }
      setProgress(Math.round(((i + 1) / total) * 100));
    }

    // Update batch with final counts
    if (batchId) {
      await supabase
        .from("import_batches")
        .update({
          new_count: result.newCount,
          updated_count: result.updatedCount,
          skipped_count: result.skippedCount,
          error_count: result.errorCount,
        })
        .eq("id", batchId);
    }

    setImportResult(result);
    setIsImporting(false);
    setStage("done");
    toast.success("Import complete", {
      description: `${result.newCount} new, ${result.updatedCount} updated, ${result.snapshotsCreated} snapshots`,
    });
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
    setRawRows([]);
    setParsedRows([]);
    setSummary(null);
    setImportResult(null);
    setProgress(0);
    setExpandedDiffs(new Set());
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import Stock</h1>
        <p className="text-muted-foreground text-sm">
          Upload Z Office FOS stock reports (.xlsx, .xls, .csv)
        </p>
      </div>

      {/* Stage indicator */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {["Upload", "Configure", "Preview Diff", "Import", "Done"].map(
          (label, i) => {
            const stages: ImportStage[] = [
              "upload",
              "configure",
              "preview",
              "importing",
              "done",
            ];
            const isActive = stages.indexOf(stage) >= i;
            return (
              <div key={label} className="flex items-center gap-2">
                {i > 0 && (
                  <ArrowRight className="h-3 w-3 text-muted-foreground/40" />
                )}
                <span
                  className={
                    isActive ? "font-medium text-foreground" : "opacity-50"
                  }
                >
                  {label}
                </span>
              </div>
            );
          }
        )}
      </div>

      {/* ── UPLOAD ── */}
      {stage === "upload" && (
        <Card
          className={`border-2 border-dashed transition-colors ${
            isDragging ? "border-primary bg-primary/5" : "border-border"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <CardContent className="py-16 text-center">
            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-40" />
            <p className="font-medium mb-1">Drop your FOS report here</p>
            <p className="text-sm text-muted-foreground mb-4">
              Supports .xlsx, .xls, .csv — barcodes preserved as text
            </p>
            <label>
              <Button variant="outline" asChild>
                <span>Browse Files</span>
              </Button>
              <input
                type="file"
                className="hidden"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileInput}
              />
            </label>
          </CardContent>
        </Card>
      )}

      {/* ── CONFIGURE ── */}
      {stage === "configure" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileSpreadsheet className="h-5 w-5" />
                {filename}
                <Badge variant="outline" className="ml-2">
                  {sheetName}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Header row selector */}
              <div className="flex items-end gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">
                    Header Row{" "}
                    <span className="text-muted-foreground">(0-based)</span>
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={rawRows.length - 2}
                      value={headerRowIndex}
                      onChange={(e) =>
                        applyHeaderRow(parseInt(e.target.value) || 0)
                      }
                      className="w-20 font-mono"
                    />
                    {headerRowIndex !== autoDetectedRow && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => applyHeaderRow(autoDetectedRow)}
                      >
                        Reset to auto-detected (row {autoDetectedRow})
                      </Button>
                    )}
                  </div>
                </div>
                <Badge variant="secondary" className="mb-1">
                  Auto-detected: row {autoDetectedRow}
                </Badge>
              </div>

              {/* Column mapping preview */}
              <div>
                <h4 className="text-sm font-medium mb-2">
                  Column Mapping ({mappedFieldCount} mapped)
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {mappedHeaders.map((h, i) => (
                    <Badge
                      key={i}
                      variant={h.mapped ? "default" : "outline"}
                      className={`text-[10px] ${
                        !h.mapped ? "opacity-50" : ""
                      }`}
                    >
                      {h.original}
                      {h.mapped && (
                        <span className="ml-1 opacity-70">→ {h.mapped}</span>
                      )}
                    </Badge>
                  ))}
                </div>
                {!hasCriticalFields && (
                  <p className="text-xs text-destructive mt-2 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Missing required field: Product Name. Adjust header row.
                  </p>
                )}
              </div>

              {/* Raw preview */}
              <div>
                <h4 className="text-sm font-medium mb-2">
                  Raw Data Preview (first 8 rows from header)
                </h4>
                <div className="overflow-x-auto border rounded-lg max-h-[250px]">
                  <table className="text-xs w-full">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-10">
                          #
                        </th>
                        {rawRows[headerRowIndex]?.slice(0, 12).map(
                          (h: any, i: number) => (
                            <th
                              key={i}
                              className="px-2 py-1.5 text-left font-medium"
                            >
                              {String(h ?? "")}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {rawRows
                        .slice(headerRowIndex + 1, headerRowIndex + 9)
                        .map((row, ri) => (
                          <tr key={ri} className="border-t">
                            <td className="px-2 py-1 text-muted-foreground">
                              {headerRowIndex + 1 + ri}
                            </td>
                            {row.slice(0, 12).map((cell: any, ci: number) => (
                              <td
                                key={ci}
                                className="px-2 py-1 max-w-[140px] truncate"
                              >
                                {String(cell ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={reset}>
                  Cancel
                </Button>
                <Button
                  onClick={analyzeImport}
                  disabled={!hasCriticalFields || isAnalyzing}
                >
                  {isAnalyzing ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4 mr-2" />
                      Analyze & Preview Diff
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── PREVIEW DIFF ── */}
      {stage === "preview" && summary && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard
              label="New Products"
              count={summary.newRows.length}
              icon={<Plus className="h-4 w-4" />}
              color="text-[hsl(var(--success))]"
            />
            <SummaryCard
              label="Updates"
              count={summary.updateRows.length}
              icon={<RefreshCw className="h-4 w-4" />}
              color="text-primary"
            />
            <SummaryCard
              label="Skipped"
              count={summary.skippedRows.length}
              icon={<SkipForward className="h-4 w-4" />}
              color="text-muted-foreground"
            />
            <SummaryCard
              label="Ambiguous"
              count={summary.ambiguousRows.length}
              icon={<AlertTriangle className="h-4 w-4" />}
              color="text-[hsl(var(--warning))]"
            />
          </div>

          <Tabs defaultValue="updates">
            <TabsList>
              <TabsTrigger value="updates">
                Updates ({summary.updateRows.length})
              </TabsTrigger>
              <TabsTrigger value="new">
                New ({summary.newRows.length})
              </TabsTrigger>
              <TabsTrigger value="skipped">
                Skipped ({summary.skippedRows.length})
              </TabsTrigger>
              <TabsTrigger value="ambiguous">
                Ambiguous ({summary.ambiguousRows.length})
              </TabsTrigger>
            </TabsList>

            {/* UPDATES TAB */}
            <TabsContent value="updates" className="mt-4">
              <Card>
                <CardContent className="p-0">
                  {summary.updateRows.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      No updates detected
                    </div>
                  ) : (
                    <div className="divide-y max-h-[500px] overflow-y-auto">
                      {summary.updateRows.map((row, i) => (
                        <div key={i}>
                          <button
                            className="w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors flex items-center gap-3"
                            onClick={() => toggleDiffExpand(i)}
                          >
                            {expandedDiffs.has(i) ? (
                              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                            <div className="flex-1 min-w-0">
                              <span className="font-medium text-sm truncate block">
                                {row.fields.source_product_name}
                              </span>
                              <span className="text-xs text-muted-foreground font-mono">
                                {row.fields.barcode || row.fields.sku || "—"}
                              </span>
                            </div>
                            <Badge
                              variant="outline"
                              className="text-[10px] shrink-0"
                            >
                              {row.matchType} match
                            </Badge>
                            <Badge
                              variant="secondary"
                              className="text-[10px] shrink-0"
                            >
                              {row.diffs.length} change
                              {row.diffs.length !== 1 ? "s" : ""}
                            </Badge>
                          </button>
                          {expandedDiffs.has(i) && row.diffs.length > 0 && (
                            <div className="px-4 pb-3 pl-11">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs">
                                      Field
                                    </TableHead>
                                    <TableHead className="text-xs">
                                      Current
                                    </TableHead>
                                    <TableHead className="text-xs">
                                      →
                                    </TableHead>
                                    <TableHead className="text-xs">
                                      Incoming
                                    </TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {row.diffs.map((d, di) => (
                                    <TableRow key={di}>
                                      <TableCell className="text-xs font-mono py-1">
                                        {d.field}
                                      </TableCell>
                                      <TableCell className="text-xs py-1 text-muted-foreground max-w-[200px] truncate">
                                        {String(d.oldValue ?? "—")}
                                      </TableCell>
                                      <TableCell className="text-xs py-1">
                                        <ArrowRight className="h-3 w-3" />
                                      </TableCell>
                                      <TableCell className="text-xs py-1 font-medium max-w-[200px] truncate">
                                        {String(d.newValue ?? "—")}
                                      </TableCell>
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
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      No new products
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-[400px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">
                              Product Name
                            </TableHead>
                            <TableHead className="text-xs">Barcode</TableHead>
                            <TableHead className="text-xs">SKU</TableHead>
                            <TableHead className="text-xs">Stock</TableHead>
                            <TableHead className="text-xs">Cost</TableHead>
                            <TableHead className="text-xs">RRP</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {summary.newRows.slice(0, 100).map((row, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs max-w-[250px] truncate">
                                {row.fields.source_product_name}
                              </TableCell>
                              <TableCell className="text-xs font-mono">
                                {row.fields.barcode || "—"}
                              </TableCell>
                              <TableCell className="text-xs font-mono">
                                {row.fields.sku || "—"}
                              </TableCell>
                              <TableCell className="text-xs">
                                {row.fields.stock_on_hand ?? "—"}
                              </TableCell>
                              <TableCell className="text-xs">
                                {row.fields.cost_price
                                  ? `$${Number(row.fields.cost_price).toFixed(2)}`
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-xs">
                                {row.fields.sell_price
                                  ? `$${Number(row.fields.sell_price).toFixed(2)}`
                                  : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {summary.newRows.length > 100 && (
                        <p className="text-xs text-muted-foreground text-center py-2">
                          Showing first 100 of {summary.newRows.length}
                        </p>
                      )}
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
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      No skipped rows
                    </div>
                  ) : (
                    <div className="overflow-y-auto max-h-[400px] divide-y">
                      {summary.skippedRows.slice(0, 50).map((row, i) => (
                        <div key={i} className="px-4 py-2 text-xs flex items-center gap-3">
                          <span className="text-muted-foreground font-mono w-10">
                            #{row.rawIndex + 1}
                          </span>
                          <span className="truncate flex-1">
                            {row.fields.source_product_name || "(empty)"}
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[9px] shrink-0"
                          >
                            {row.skipReason}
                          </Badge>
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
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      No ambiguous matches — all clear!
                    </div>
                  ) : (
                    <div className="overflow-y-auto max-h-[400px] divide-y">
                      {summary.ambiguousRows.map((row, i) => (
                        <div key={i} className="px-4 py-3">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
                            <div className="text-xs space-y-1">
                              <div>
                                <span className="font-medium">Incoming:</span>{" "}
                                {row.fields.source_product_name}
                              </div>
                              <div className="text-muted-foreground">
                                <span className="font-medium">
                                  Possible match:
                                </span>{" "}
                                {row.existingProduct?.source_product_name}
                              </div>
                              <p className="text-muted-foreground italic">
                                Below threshold — skipped to avoid wrong merge.
                                Review manually.
                              </p>
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

          {/* Commit */}
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setStage("configure")}>
              Back
            </Button>
            <Button
              onClick={commitImport}
              disabled={
                summary.newRows.length + summary.updateRows.length === 0
              }
            >
              Commit Import (
              {summary.newRows.length + summary.updateRows.length} rows)
            </Button>
          </div>
        </div>
      )}

      {/* ── IMPORTING ── */}
      {stage === "importing" && (
        <Card>
          <CardContent className="py-12 space-y-4">
            <Progress value={progress} />
            <p className="text-sm text-muted-foreground text-center">
              Importing... {progress}%
            </p>
            <p className="text-xs text-muted-foreground text-center">
              Creating products, updating records, and saving inventory
              snapshots
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── DONE ── */}
      {stage === "done" && importResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-[hsl(var(--success))]">
              <CheckCircle className="h-5 w-5" /> Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Stat
                label="New"
                value={importResult.newCount}
                color="text-[hsl(var(--success))]"
              />
              <Stat
                label="Updated"
                value={importResult.updatedCount}
                color="text-primary"
              />
              <Stat
                label="Snapshots"
                value={importResult.snapshotsCreated}
                color="text-primary"
              />
              <Stat
                label="Skipped"
                value={importResult.skippedCount}
                color="text-muted-foreground"
              />
              <Stat
                label="Errors"
                value={importResult.errorCount}
                color="text-destructive"
              />
            </div>
            {importResult.errors.length > 0 && (
              <div className="text-xs bg-destructive/10 rounded p-3 max-h-[150px] overflow-y-auto space-y-1">
                {importResult.errors.map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </div>
            )}
            <Button variant="outline" onClick={reset}>
              Import Another File
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  count,
  icon,
  color,
}: {
  label: string;
  count: number;
  icon: React.ReactNode;
  color: string;
}) {
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

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="text-center p-3 border rounded-lg">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}
