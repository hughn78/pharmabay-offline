import { useState, useEffect, useCallback, useRef } from "react";
import { useBeforeUnload } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import {
  Globe,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Download,
  ArrowLeft,
  Trash2,
  Eye,
  EyeOff,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import { firecrawlApi } from "@/lib/api/firecrawl";
import { bulkProductUpsert, type BulkUpsertMode } from "@/lib/api/bulk-upsert";
import { triggerExport, type ExportOptions } from "@/lib/export-utils";

type ScrapeMode = "single" | "collection" | "domain";
type Step = "configure" | "progress" | "review" | "results";

interface ScrapedProduct {
  _id: string;
  _status: "ready" | "warning" | "error";
  _excluded: boolean;
  _selected: boolean;
  _sourceUrl: string;
  source_product_name: string;
  brand: string;
  sell_price: number | null;
  cost_price: number | null;
  sku: string;
  barcode: string;
  short_description: string;
  product_type: string;
  manufacturer: string;
  pack_size: string;
  weight_grams: number | null;
  country_of_origin: string;
  [key: string]: any;
}

function validateProduct(p: ScrapedProduct): "ready" | "warning" | "error" {
  if (!p.source_product_name?.trim() || p.sell_price == null) return "error";
  if (!p.brand?.trim() || !p.sku?.trim() || !p.short_description?.trim()) return "warning";
  return "ready";
}

function extractProductsFromMarkdown(markdown: string, sourceUrl: string): ScrapedProduct[] {
  // Simple extraction: look for product-like patterns in the markdown
  // This is a heuristic — real implementations would use structured extraction
  const products: ScrapedProduct[] = [];
  const lines = markdown.split("\n");
  let currentProduct: Partial<ScrapedProduct> = {};
  let hasContent = false;

  for (const line of lines) {
    const trimmed = line.trim();
    // Look for headings as product titles
    const h2Match = trimmed.match(/^#{1,3}\s+(.+)/);
    if (h2Match && hasContent) {
      pushProduct(currentProduct, sourceUrl, products);
      currentProduct = {};
    }
    if (h2Match) {
      currentProduct.source_product_name = h2Match[1].replace(/[*_`]/g, "").trim();
      hasContent = true;
    }
    // Look for price patterns
    const priceMatch = trimmed.match(/\$\s?([\d,]+\.?\d{0,2})/);
    if (priceMatch && !currentProduct.sell_price) {
      currentProduct.sell_price = parseFloat(priceMatch[1].replace(",", ""));
    }
    // Look for SKU/barcode patterns
    const skuMatch = trimmed.match(/(?:SKU|Item|Code|Ref)[:\s#]*([A-Z0-9-]+)/i);
    if (skuMatch && !currentProduct.sku) {
      currentProduct.sku = skuMatch[1];
    }
    const barcodeMatch = trimmed.match(/(?:EAN|UPC|Barcode|GTIN)[:\s]*(\d{8,14})/i);
    if (barcodeMatch) {
      currentProduct.barcode = barcodeMatch[1];
    }
    // Brand patterns
    const brandMatch = trimmed.match(/(?:Brand|Manufacturer|By)[:\s]+([^\n|,]+)/i);
    if (brandMatch && !currentProduct.brand) {
      currentProduct.brand = brandMatch[1].trim();
    }
  }
  if (hasContent) pushProduct(currentProduct, sourceUrl, products);
  return products;
}

function pushProduct(partial: Partial<ScrapedProduct>, sourceUrl: string, arr: ScrapedProduct[]) {
  if (!partial.source_product_name?.trim()) return;
  const p: ScrapedProduct = {
    _id: crypto.randomUUID(),
    _status: "ready",
    _excluded: false,
    _selected: false,
    _sourceUrl: sourceUrl,
    source_product_name: partial.source_product_name || "",
    brand: partial.brand || "",
    sell_price: partial.sell_price ?? null,
    cost_price: partial.cost_price ?? null,
    sku: partial.sku || "",
    barcode: partial.barcode || "",
    short_description: partial.short_description || "",
    product_type: partial.product_type || "",
    manufacturer: partial.manufacturer || "",
    pack_size: partial.pack_size || "",
    weight_grams: partial.weight_grams ?? null,
    country_of_origin: partial.country_of_origin || "",
  };
  p._status = validateProduct(p);
  arr.push(p);
}

const STATUS_ICONS = {
  ready: <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />,
  warning: <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" />,
  error: <XCircle className="h-4 w-4 text-destructive" />,
};

const REVIEW_COLUMNS = [
  { key: "source_product_name", label: "Title" },
  { key: "brand", label: "Brand" },
  { key: "sell_price", label: "Price" },
  { key: "sku", label: "SKU" },
  { key: "barcode", label: "Barcode" },
  { key: "product_type", label: "Type" },
  { key: "_sourceUrl", label: "Source URL" },
];

export default function ScrapeProducts() {
  const [step, setStep] = useState<Step>("configure");

  // Config state
  const [url, setUrl] = useState("");
  const [scrapeMode, setScrapeMode] = useState<ScrapeMode>("single");
  const [maxPages, setMaxPages] = useState(50);
  const [crawlDepth, setCrawlDepth] = useState(2);
  const [includePaths, setIncludePaths] = useState("");
  const [excludePaths, setExcludePaths] = useState("");
  const [importMode, setImportMode] = useState<BulkUpsertMode>("fill_blanks");
  const [complianceChecked, setComplianceChecked] = useState(false);

  // Progress state
  const [progressStep, setProgressStep] = useState(0);
  const [pagesDiscovered, setPagesDiscovered] = useState(0);
  const [pagesScraped, setPagesScraped] = useState(0);
  const [productsExtracted, setProductsExtracted] = useState(0);
  const [errorLog, setErrorLog] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const cancelledRef = useRef(false);

  // Review state
  const [products, setProducts] = useState<ScrapedProduct[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [editingCell, setEditingCell] = useState<{ id: string; key: string } | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [drawerProduct, setDrawerProduct] = useState<ScrapedProduct | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(REVIEW_COLUMNS.map((c) => c.key))
  );
  const [showColumnToggle, setShowColumnToggle] = useState(false);

  // Confirm modal
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmMode, setConfirmMode] = useState<BulkUpsertMode>("fill_blanks");

  // Results state
  const [importResult, setImportResult] = useState<{
    inserted: number;
    updated: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  // Export modal
  const [showExport, setShowExport] = useState(false);
  const [exportFormat, setExportFormat] = useState<"csv" | "xlsx">("csv");

  const ROWS_PER_PAGE = 50;

  useBeforeUnload(
    useCallback(
      (e) => {
        if (products.length > 0 && step === "review") {
          e.preventDefault();
        }
      },
      [products, step]
    )
  );

  const activeProducts = products.filter((p) => !p._excluded);
  const selectedProducts = products.filter((p) => p._selected && !p._excluded);
  const errorProducts = activeProducts.filter((p) => p._status === "error");
  const paginatedProducts = activeProducts.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  );
  const totalPages = Math.ceil(activeProducts.length / ROWS_PER_PAGE);

  async function startScrape() {
    setIsRunning(true);
    cancelledRef.current = false;
    setStep("progress");
    setProgressStep(0);
    setErrorLog([]);
    setPagesDiscovered(0);
    setPagesScraped(0);
    setProductsExtracted(0);

    try {
      setProgressStep(1); // Connecting
      await new Promise((r) => setTimeout(r, 500));

      if (cancelledRef.current) return;

      let allProducts: ScrapedProduct[] = [];

      if (scrapeMode === "single") {
        setProgressStep(2);
        setPagesDiscovered(1);
        setProgressStep(3);

        const res = await firecrawlApi.scrape(url, { formats: ["markdown"] });
        if (!res.success) throw new Error(res.error || "Scrape failed");

        setPagesScraped(1);
        setProgressStep(4);

        const md = res.data?.markdown || res.data?.data?.markdown || "";
        allProducts = extractProductsFromMarkdown(md, url);
      } else {
        // Collection or Domain crawl
        setProgressStep(2);

        const crawlOpts: any = {
          limit: maxPages,
          maxDepth: scrapeMode === "domain" ? crawlDepth : 1,
        };
        if (includePaths.trim()) {
          crawlOpts.includePaths = includePaths.split(",").map((s) => s.trim());
        }
        if (excludePaths.trim()) {
          crawlOpts.excludePaths = excludePaths.split(",").map((s) => s.trim());
        }

        const res = await firecrawlApi.crawl(url, crawlOpts);
        if (!res.success) throw new Error(res.error || "Crawl failed");

        // Crawl returns a job ID for async — poll or use data directly
        const crawlData = res.data || res;
        const pages = crawlData?.data || [];
        setPagesDiscovered(Array.isArray(pages) ? pages.length : 0);
        setProgressStep(3);

        if (Array.isArray(pages)) {
          for (let i = 0; i < pages.length; i++) {
            if (cancelledRef.current) return;
            const page = pages[i];
            const md = page?.markdown || "";
            const pageUrl = page?.metadata?.sourceURL || url;
            const extracted = extractProductsFromMarkdown(md, pageUrl);
            allProducts.push(...extracted);
            setPagesScraped(i + 1);
            setProductsExtracted(allProducts.length);
          }
        }

        setProgressStep(4);
      }

      if (cancelledRef.current) return;

      setProgressStep(5); // Normalising
      await new Promise((r) => setTimeout(r, 300));

      // Re-validate all
      allProducts = allProducts.map((p) => ({ ...p, _status: validateProduct(p) }));
      setProductsExtracted(allProducts.length);

      setProgressStep(6); // Ready
      setProducts(allProducts);
      setCurrentPage(1);

      if (allProducts.length === 0) {
        toast.warning("No products found on the page(s). Try a different URL or scrape mode.");
        setStep("configure");
      } else {
        toast.success(`${allProducts.length} products extracted`);
        setStep("review");
      }
    } catch (err: any) {
      setErrorLog((prev) => [...prev, err.message]);
      toast.error(err.message || "Scrape failed");
      setStep("configure");
    } finally {
      setIsRunning(false);
    }
  }

  function cancelJob() {
    cancelledRef.current = true;
    setIsRunning(false);
    setStep("configure");
    toast.info("Job cancelled");
  }

  function updateCell(id: string, key: string, value: string) {
    setProducts((prev) =>
      prev.map((p) => {
        if (p._id !== id) return p;
        const updated = { ...p, [key]: key === "sell_price" || key === "cost_price" ? (value ? Number(value) : null) : value };
        updated._status = validateProduct(updated);
        return updated;
      })
    );
    setEditingCell(null);
  }

  function toggleSelectAll() {
    const allSelected = paginatedProducts.every((p) => p._selected);
    const ids = new Set(paginatedProducts.map((p) => p._id));
    setProducts((prev) =>
      prev.map((p) => (ids.has(p._id) ? { ...p, _selected: !allSelected } : p))
    );
  }

  function bulkSetField(field: string, value: string) {
    const selectedIds = new Set(selectedProducts.map((p) => p._id));
    setProducts((prev) =>
      prev.map((p) => {
        if (!selectedIds.has(p._id)) return p;
        const updated = { ...p, [field]: value };
        updated._status = validateProduct(updated);
        return updated;
      })
    );
    toast.success(`Updated ${selectedIds.size} rows`);
  }

  function deleteSelected() {
    const ids = new Set(selectedProducts.map((p) => p._id));
    setProducts((prev) => prev.filter((p) => !ids.has(p._id)));
    toast.success(`Removed ${ids.size} rows`);
  }

  function excludeSelected() {
    const ids = new Set(selectedProducts.map((p) => p._id));
    setProducts((prev) =>
      prev.map((p) => (ids.has(p._id) ? { ...p, _excluded: true, _selected: false } : p))
    );
    toast.success(`Excluded ${ids.size} rows`);
  }

  function revalidateAll() {
    setProducts((prev) =>
      prev.map((p) => ({ ...p, _status: validateProduct(p) }))
    );
    toast.success("Validation complete");
  }

  async function confirmImport() {
    setShowConfirm(false);
    const toImport = activeProducts.filter((p) => p._status !== "error");
    const cleanRows = toImport.map(({ _id, _status, _excluded, _selected, _sourceUrl, ...rest }) => rest);

    try {
      const result = await bulkProductUpsert(cleanRows, confirmMode);
      setImportResult({
        inserted: result.inserted,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors,
      });
      setStep("results");
      toast.success(`Import complete: ${result.inserted} inserted, ${result.updated} updated`);
    } catch (err: any) {
      toast.error(err.message || "Import failed");
    }
  }

  function handleExport() {
    const data = activeProducts.map(({ _id, _status, _excluded, _selected, ...rest }) => rest);
    const cols = REVIEW_COLUMNS.filter((c) => !c.key.startsWith("_")).map((c) => ({
      key: c.key,
      label: c.label,
    }));
    triggerExport({
      format: exportFormat,
      filename: `scrape-results-${new Date().toISOString().slice(0, 10)}`,
      columns: cols,
      data,
    });
    setShowExport(false);
    toast.success("Export downloaded");
  }

  // STEP: Configure
  if (step === "configure") {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-display font-semibold text-foreground">Scrape Products</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Extract product data from websites and import into your catalogue.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Target URL</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="https://example.com/products"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />

            <div>
              <Label className="text-sm font-medium mb-2 block">Scrape Mode</Label>
              <div className="grid grid-cols-3 gap-3">
                {(
                  [
                    ["single", "Single Page", "Scrape one URL"],
                    ["collection", "Collection Page", "Crawl depth 1"],
                    ["domain", "Full Domain", "Deep crawl"],
                  ] as const
                ).map(([mode, title, desc]) => (
                  <button
                    key={mode}
                    onClick={() => setScrapeMode(mode)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      scrapeMode === mode
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="text-sm font-medium text-foreground">{title}</div>
                    <div className="text-xs text-muted-foreground">{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {scrapeMode !== "single" && (
              <div>
                <Label className="text-sm">Max Pages: {maxPages}</Label>
                <Slider
                  value={[maxPages]}
                  onValueChange={([v]) => setMaxPages(v)}
                  min={1}
                  max={500}
                  step={1}
                  className="mt-2"
                />
              </div>
            )}

            {scrapeMode === "domain" && (
              <div>
                <Label className="text-sm">Crawl Depth: {crawlDepth}</Label>
                <Slider
                  value={[crawlDepth]}
                  onValueChange={([v]) => setCrawlDepth(v)}
                  min={1}
                  max={5}
                  step={1}
                  className="mt-2"
                />
              </div>
            )}

            {scrapeMode !== "single" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm">Include Paths</Label>
                  <Input
                    placeholder="/products/, /catalogue/"
                    value={includePaths}
                    onChange={(e) => setIncludePaths(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-sm">Exclude Paths</Label>
                  <Input
                    placeholder="/blog/, /checkout/"
                    value={excludePaths}
                    onChange={(e) => setExcludePaths(e.target.value)}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <Label>Import Mode</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Fill Blanks</span>
                <Switch
                  checked={importMode === "overwrite"}
                  onCheckedChange={(c) => setImportMode(c ? "overwrite" : "fill_blanks")}
                />
                <span className="text-sm text-muted-foreground">Overwrite</span>
              </div>
            </div>

            <Separator />

            <div className="flex items-start gap-2">
              <Checkbox
                id="compliance"
                checked={complianceChecked}
                onCheckedChange={(c) => setComplianceChecked(c === true)}
              />
              <Label htmlFor="compliance" className="text-sm leading-relaxed cursor-pointer">
                I confirm I own this website or have explicit permission to extract and reuse this
                product data.
              </Label>
            </div>

            <Button
              className="w-full"
              size="lg"
              disabled={!url.trim() || !complianceChecked}
              onClick={startScrape}
            >
              <Globe className="mr-2 h-4 w-4" />
              Start Scrape
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // STEP: Progress
  if (step === "progress") {
    const steps = [
      "Connecting to Firecrawl",
      "Discovering pages",
      "Scraping product pages",
      "Extracting product data",
      "Normalising results",
      "Ready for review",
    ];
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-display font-semibold text-foreground">Scraping…</h1>

        <Card>
          <CardContent className="pt-6 space-y-3">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                {progressStep > i + 1 ? (
                  <CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))]" />
                ) : progressStep === i + 1 ? (
                  <Loader2 className="h-5 w-5 text-primary animate-spin" />
                ) : (
                  <div className="h-5 w-5 rounded-full border-2 border-border" />
                )}
                <span
                  className={`text-sm ${progressStep >= i + 1 ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {s}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid grid-cols-4 gap-3">
          {[
            ["Pages Found", pagesDiscovered],
            ["Scraped", pagesScraped],
            ["Products", productsExtracted],
            ["Errors", errorLog.length],
          ].map(([label, val]) => (
            <Card key={label as string}>
              <CardContent className="pt-4 text-center">
                <div className="text-2xl font-semibold text-foreground">{val}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {errorLog.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Error Log</CardTitle></CardHeader>
            <CardContent>
              <ScrollArea className="h-32">
                {errorLog.map((e, i) => (
                  <div key={i} className="text-xs text-destructive py-1">{e}</div>
                ))}
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        <Button variant="destructive" onClick={cancelJob}>
          Cancel Job
        </Button>
      </div>
    );
  }

  // STEP: Results
  if (step === "results" && importResult) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-display font-semibold text-foreground">Import Complete</h1>

        <div className="grid grid-cols-4 gap-3">
          {[
            ["✅ Inserted", importResult.inserted, "text-[hsl(var(--success))]"],
            ["🔄 Updated", importResult.updated, "text-[hsl(var(--info))]"],
            ["⚠️ Skipped", importResult.skipped, "text-[hsl(var(--warning))]"],
            ["❌ Failed", importResult.errors.length, "text-destructive"],
          ].map(([label, val, cls]) => (
            <Card key={label as string}>
              <CardContent className="pt-4 text-center">
                <div className={`text-2xl font-semibold ${cls}`}>{val}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {importResult.errors.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Errors</CardTitle></CardHeader>
            <CardContent>
              <ScrollArea className="h-40">
                {importResult.errors.map((e, i) => (
                  <div key={i} className="text-xs text-destructive py-1">{e}</div>
                ))}
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-3">
          <Button onClick={() => window.location.assign("/products")}>View Products</Button>
          <Button variant="outline" onClick={() => setShowExport(true)}>
            <Download className="mr-2 h-4 w-4" />
            Export Results
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setProducts([]);
              setImportResult(null);
              setStep("configure");
            }}
          >
            New Scrape
          </Button>
        </div>

        {/* Export modal reused */}
        <ExportModal open={showExport} onOpenChange={setShowExport} format={exportFormat} setFormat={setExportFormat} onExport={handleExport} />
      </div>
    );
  }

  // STEP: Review
  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-card flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setStep("configure")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-display font-semibold text-foreground">Review Scraped Products</h1>
            <p className="text-xs text-muted-foreground">{activeProducts.length} products • Page {currentPage}/{totalPages || 1}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowColumnToggle(!showColumnToggle)}>
            {showColumnToggle ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
            Columns
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowExport(true)}>
            <FileSpreadsheet className="h-4 w-4 mr-1" />
            Export
          </Button>
        </div>
      </div>

      {/* Column toggle */}
      {showColumnToggle && (
        <div className="px-6 py-2 border-b bg-muted/30 flex gap-3 flex-wrap shrink-0">
          {REVIEW_COLUMNS.map((c) => (
            <label key={c.key} className="flex items-center gap-1 text-xs cursor-pointer">
              <Checkbox
                checked={visibleColumns.has(c.key)}
                onCheckedChange={(checked) => {
                  const next = new Set(visibleColumns);
                  checked ? next.add(c.key) : next.delete(c.key);
                  setVisibleColumns(next);
                }}
              />
              {c.label}
            </label>
          ))}
        </div>
      )}

      {/* Bulk toolbar */}
      {selectedProducts.length > 0 && (
        <div className="px-6 py-2 border-b bg-primary/5 flex items-center gap-3 shrink-0">
          <span className="text-sm font-medium">{selectedProducts.length} selected</span>
          <Button size="sm" variant="outline" onClick={() => {
            const val = prompt("Set brand for selected rows:");
            if (val) bulkSetField("brand", val);
          }}>
            Set Brand
          </Button>
          <Button size="sm" variant="outline" onClick={() => {
            const val = prompt("Set product type for selected rows:");
            if (val) bulkSetField("product_type", val);
          }}>
            Set Type
          </Button>
          <Button size="sm" variant="outline" onClick={excludeSelected}>
            Exclude
          </Button>
          <Button size="sm" variant="destructive" onClick={deleteSelected}>
            <Trash2 className="h-3 w-3 mr-1" />
            Delete
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={paginatedProducts.length > 0 && paginatedProducts.every((p) => p._selected)}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead className="w-10">Status</TableHead>
              {REVIEW_COLUMNS.filter((c) => visibleColumns.has(c.key)).map((c) => (
                <TableHead key={c.key}>{c.label}</TableHead>
              ))}
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedProducts.map((p) => (
              <TableRow key={p._id} className={p._excluded ? "opacity-40" : ""}>
                <TableCell>
                  <Checkbox
                    checked={p._selected}
                    onCheckedChange={(c) =>
                      setProducts((prev) =>
                        prev.map((x) => (x._id === p._id ? { ...x, _selected: c === true } : x))
                      )
                    }
                  />
                </TableCell>
                <TableCell>{STATUS_ICONS[p._status]}</TableCell>
                {REVIEW_COLUMNS.filter((c) => visibleColumns.has(c.key)).map((c) => (
                  <TableCell
                    key={c.key}
                    className="cursor-pointer hover:bg-muted/30 max-w-[200px] truncate"
                    onClick={() => {
                      if (c.key.startsWith("_")) return;
                      setEditingCell({ id: p._id, key: c.key });
                      setEditingValue(String(p[c.key] ?? ""));
                    }}
                  >
                    {editingCell?.id === p._id && editingCell?.key === c.key ? (
                      <Input
                        autoFocus
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onBlur={() => updateCell(p._id, c.key, editingValue)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") updateCell(p._id, c.key, editingValue);
                          if (e.key === "Escape") setEditingCell(null);
                        }}
                        className="h-7 text-sm"
                      />
                    ) : c.key === "sell_price" && p[c.key] != null ? (
                      `$${Number(p[c.key]).toFixed(2)}`
                    ) : c.key === "_sourceUrl" ? (
                      <span className="text-xs text-muted-foreground truncate block max-w-[180px]">{p[c.key]}</span>
                    ) : (
                      String(p[c.key] ?? "")
                    )}
                  </TableCell>
                ))}
                <TableCell>
                  <Button size="icon" variant="ghost" onClick={() => setDrawerProduct(p)}>
                    <Eye className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-2 border-t flex justify-center gap-2 shrink-0">
          <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => p - 1)}>Prev</Button>
          <span className="text-sm text-muted-foreground self-center">{currentPage} / {totalPages}</span>
          <Button size="sm" variant="outline" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      {/* Bottom bar */}
      <div className="px-6 py-3 border-t bg-card flex items-center justify-between shrink-0">
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>Total: {activeProducts.length}</span>
          <span>Selected: {selectedProducts.length}</span>
          <span className="text-destructive">Errors: {errorProducts.length}</span>
          <span>Excluded: {products.filter((p) => p._excluded).length}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={revalidateAll}>Validate All</Button>
          <Button
            disabled={errorProducts.length > 0}
            onClick={() => {
              setConfirmMode(importMode);
              setShowConfirm(true);
            }}
          >
            Import {activeProducts.filter((p) => p._status !== "error").length} Products
          </Button>
        </div>
      </div>

      {/* Confirm Modal */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Import</DialogTitle>
            <DialogDescription>Review before importing products into your catalogue.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <div className="flex justify-between text-sm">
              <span>Products to import:</span>
              <span className="font-medium">{activeProducts.filter((p) => p._status !== "error").length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Excluded:</span>
              <span>{products.filter((p) => p._excluded).length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Warnings (will import):</span>
              <span className="text-[hsl(var(--warning))]">{activeProducts.filter((p) => p._status === "warning").length}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <Label>Import Mode</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Fill Blanks</span>
                <Switch
                  checked={confirmMode === "overwrite"}
                  onCheckedChange={(c) => setConfirmMode(c ? "overwrite" : "fill_blanks")}
                />
                <span className="text-sm text-muted-foreground">Overwrite</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>Cancel</Button>
            <Button onClick={confirmImport}>Confirm Import</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Row Drawer */}
      <Drawer open={!!drawerProduct} onOpenChange={(o) => !o && setDrawerProduct(null)}>
        <DrawerContent className="max-h-[80vh]">
          <DrawerHeader>
            <DrawerTitle>{drawerProduct?.source_product_name || "Product Details"}</DrawerTitle>
          </DrawerHeader>
          <ScrollArea className="px-4 pb-4 h-[60vh]">
            {drawerProduct && (
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(drawerProduct)
                  .filter(([k]) => !k.startsWith("_"))
                  .map(([key, val]) => (
                    <div key={key}>
                      <Label className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, " ")}</Label>
                      <Input
                        value={String(val ?? "")}
                        onChange={(e) => {
                          const newVal = e.target.value;
                          setDrawerProduct((prev) => prev ? { ...prev, [key]: newVal } : null);
                          setProducts((prev) =>
                            prev.map((p) => {
                              if (p._id !== drawerProduct._id) return p;
                              const updated = { ...p, [key]: newVal };
                              updated._status = validateProduct(updated);
                              return updated;
                            })
                          );
                        }}
                        className="mt-1"
                      />
                    </div>
                  ))}
              </div>
            )}
          </ScrollArea>
        </DrawerContent>
      </Drawer>

      {/* Export Modal */}
      <ExportModal open={showExport} onOpenChange={setShowExport} format={exportFormat} setFormat={setExportFormat} onExport={handleExport} />
    </div>
  );
}

function ExportModal({
  open,
  onOpenChange,
  format,
  setFormat,
  onExport,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  format: "csv" | "xlsx";
  setFormat: (v: "csv" | "xlsx") => void;
  onExport: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Products</DialogTitle>
          <DialogDescription>Choose format and download.</DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div>
            <Label>Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as "csv" | "xlsx")}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onExport}>
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
