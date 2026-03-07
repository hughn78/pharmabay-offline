import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, Info } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";

interface ImportPreview {
  filename: string;
  rows: any[];
  headers: string[];
  detectedStartRow: number;
}

interface ImportResult {
  newCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  errors: string[];
}

export default function ImportStock() {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState(0);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast.error("Unsupported file", { description: "Please upload .xlsx, .xls, or .csv files" });
      return;
    }

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array", cellDates: true, raw: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as any[];

      if (jsonData.length === 0) {
        toast.error("Empty file", { description: "No data rows found in the file" });
        return;
      }

      const headers = Object.keys(jsonData[0]);

      setPreview({
        filename: file.name,
        rows: jsonData,
        headers,
        detectedStartRow: 1,
      });
      setImportResult(null);
    } catch (err) {
      toast.error("Failed to read file", { description: String(err) });
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const normalizeHeaders = (row: any): any => {
    const mapping: Record<string, string> = {
      "product name": "source_product_name",
      "product": "source_product_name",
      "description": "source_product_name",
      "stock on hand": "stock_on_hand",
      "soh": "stock_on_hand",
      "barcode": "barcode",
      "sku": "sku",
      "product code": "sku",
      "cost price": "cost_price",
      "cost": "cost_price",
      "last purchase date": "last_purchased_at",
      "last sale date": "last_sold_at",
      "stock value": "stock_value",
      "total sales value": "total_sales_value_12m",
      "total cogs": "total_cogs_12m",
      "units sold": "units_sold_12m",
      "units purchased": "units_purchased_12m",
      "department": "department",
      "category": "category",
      "gp%": "gross_profit_percent",
      "gp %": "gross_profit_percent",
      "rrp": "sell_price",
      "sell price": "sell_price",
      "selling price": "sell_price",
    };

    const normalized: any = {};
    for (const [key, value] of Object.entries(row)) {
      const lowerKey = key.toLowerCase().trim();
      const mappedKey = mapping[lowerKey];
      if (mappedKey) {
        normalized[mappedKey] = value;
      }
    }
    return normalized;
  };

  const commitImport = async () => {
    if (!preview) return;
    setIsImporting(true);
    setProgress(0);

    const result: ImportResult = { newCount: 0, updatedCount: 0, skippedCount: 0, errorCount: 0, errors: [] };
    const total = preview.rows.length;

    for (let i = 0; i < total; i++) {
      const raw = preview.rows[i];
      const row = normalizeHeaders(raw);

      // Skip rules
      if (!row.source_product_name || String(row.source_product_name).trim() === "") {
        result.skippedCount++;
        continue;
      }
      if (String(row.source_product_name).startsWith("(OLD")) {
        result.skippedCount++;
        continue;
      }
      const soh = parseFloat(row.stock_on_hand) || 0;
      const unitsSold = parseInt(row.units_sold_12m) || 0;
      if (soh <= 0 && unitsSold === 0 && !row.last_sold_at) {
        result.skippedCount++;
        continue;
      }

      // Preserve barcode as string
      const barcode = row.barcode ? String(row.barcode).trim() : null;
      const sku = row.sku ? String(row.sku).trim() : null;

      try {
        // Check if exists
        let existing = null;
        if (barcode) {
          const { data } = await supabase.from("products").select("id").eq("barcode", barcode).maybeSingle();
          existing = data;
        }
        if (!existing && sku) {
          const { data } = await supabase.from("products").select("id").eq("sku", sku).maybeSingle();
          existing = data;
        }

        const productData = {
          source_product_name: String(row.source_product_name).trim(),
          barcode,
          sku,
          stock_on_hand: soh,
          cost_price: parseFloat(row.cost_price) || null,
          sell_price: parseFloat(row.sell_price) || null,
          stock_value: parseFloat(row.stock_value) || null,
          department: row.department ? String(row.department).trim() : null,
          z_category: row.category ? String(row.category).trim() : null,
          units_sold_12m: unitsSold,
          units_purchased_12m: parseInt(row.units_purchased_12m) || null,
          total_sales_value_12m: parseFloat(row.total_sales_value_12m) || null,
          total_cogs_12m: parseFloat(row.total_cogs_12m) || null,
          gross_profit_percent: parseFloat(row.gross_profit_percent) || null,
          updated_at: new Date().toISOString(),
        };

        if (existing) {
          await supabase.from("products").update(productData).eq("id", existing.id);
          result.updatedCount++;
        } else {
          await supabase.from("products").insert({
            ...productData,
            compliance_status: "permitted",
            enrichment_status: "pending",
          });
          result.newCount++;
        }
      } catch (err) {
        result.errorCount++;
        result.errors.push(`Row ${i + 1}: ${String(err)}`);
      }

      setProgress(Math.round(((i + 1) / total) * 100));
    }

    // Record import batch
    await supabase.from("import_batches").insert({
      filename: preview.filename,
      row_count: total,
      new_count: result.newCount,
      updated_count: result.updatedCount,
      skipped_count: result.skippedCount,
      error_count: result.errorCount,
    });

    setImportResult(result);
    setIsImporting(false);
    toast.success("Import complete", {
      description: `${result.newCount} new, ${result.updatedCount} updated, ${result.skippedCount} skipped`,
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import Stock</h1>
        <p className="text-muted-foreground text-sm">Upload Z Office FOS stock reports</p>
      </div>

      {/* Drop Zone */}
      {!preview && (
        <Card
          className={`border-2 border-dashed transition-colors ${
            isDragging ? "border-primary bg-primary/5" : "border-border"
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <CardContent className="py-16 text-center">
            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-40" />
            <p className="font-medium mb-1">Drop your FOS report here</p>
            <p className="text-sm text-muted-foreground mb-4">Supports .xlsx, .xls, .csv</p>
            <label>
              <Button variant="outline" asChild>
                <span>Browse Files</span>
              </Button>
              <input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileInput} />
            </label>
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      {preview && !importResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-5 w-5" />
              {preview.filename}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 text-sm">
              <Badge variant="outline">{preview.rows.length} rows detected</Badge>
              <Badge variant="outline">{preview.headers.length} columns</Badge>
            </div>

            <div className="overflow-x-auto border rounded-lg max-h-[300px]">
              <table className="text-xs w-full">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    {preview.headers.slice(0, 8).map((h) => (
                      <th key={h} className="px-2 py-1.5 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 10).map((row, i) => (
                    <tr key={i} className="border-t">
                      {preview.headers.slice(0, 8).map((h) => (
                        <td key={h} className="px-2 py-1 max-w-[150px] truncate">{String(row[h] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {isImporting && (
              <div className="space-y-2">
                <Progress value={progress} />
                <p className="text-xs text-muted-foreground text-center">Importing... {progress}%</p>
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setPreview(null)} disabled={isImporting}>
                Cancel
              </Button>
              <Button onClick={commitImport} disabled={isImporting}>
                {isImporting ? "Importing..." : "Commit Import"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {importResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-success">
              <CheckCircle className="h-5 w-5" /> Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="New" value={importResult.newCount} color="text-success" />
              <Stat label="Updated" value={importResult.updatedCount} color="text-primary" />
              <Stat label="Skipped" value={importResult.skippedCount} color="text-muted-foreground" />
              <Stat label="Errors" value={importResult.errorCount} color="text-destructive" />
            </div>
            {importResult.errors.length > 0 && (
              <div className="text-xs bg-destructive/10 rounded p-3 max-h-[150px] overflow-y-auto">
                {importResult.errors.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
            <Button variant="outline" onClick={() => { setPreview(null); setImportResult(null); }}>
              Import Another File
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
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
