import { useState, useCallback, useRef, useEffect } from "react";
import { useBeforeUnload, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
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
} from "@/components/ui/drawer";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  ChevronDown,
  ChevronRight,
  Bug,
  ShieldAlert,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { bulkProductUpsert, type BulkUpsertMode } from "@/lib/api/bulk-upsert";

import { buildJobConfig, runScrapeJob } from "@/lib/scrape-orchestrator";
import { detectPlatform, type Platform, type PlatformDetectionResult } from "@/lib/utils/platformDetector";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  type ScrapeProgress,
  type ExtractedProduct,
  type ScrapeJobConfig,
  type ScrapeMode,
  validateProduct,
} from "@/lib/scrape-types";

type Step = "configure" | "progress" | "review" | "results";

const STAGE_LABELS: Record<string, string> = {
  seed_validation: "Fetching seed page",
  page_type_detection: "Analyzing page type",
  discovery: "Discovering product URLs",
  qualification: "Qualifying product URLs",
  extraction: "Extracting product data",
  complete: "Complete",
};

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
  { key: "pack_size", label: "Pack Size" },
  { key: "strength", label: "Strength" },
  { key: "stock_status", label: "Stock" },
  { key: "_extractionConfidence", label: "Confidence" },
  { key: "_sourceUrl", label: "Source URL" },
];

const FAILURE_MESSAGES: Record<string, { title: string; detail: string; icon: React.ReactNode }> = {
  TARGET_BLOCKED_403: {
    title: "Target site blocked automated access",
    detail: "The website returned a 403 Forbidden response. It may use anti-bot protection (Cloudflare, CAPTCHA, WAF). Try a different site or check if the site allows scraping.",
    icon: <ShieldAlert className="h-5 w-5" />,
  },
  RATE_LIMITED_429: {
    title: "Rate limited",
    detail: "The target site or Firecrawl returned a 429 Too Many Requests. Wait a few minutes and try again with fewer pages.",
    icon: <ShieldAlert className="h-5 w-5" />,
  },
  SEED_FETCH_FAILED: {
    title: "Seed page could not be fetched",
    detail: "The initial URL could not be loaded. Check the URL is correct and the site is accessible.",
    icon: <XCircle className="h-5 w-5" />,
  },
  NO_PRODUCT_URLS_DISCOVERED: {
    title: "No product URLs discovered",
    detail: "The seed page loaded successfully, but no product-detail links were found. Try a different collection or category page URL.",
    icon: <Info className="h-5 w-5" />,
  },
  GATEWAY_PAGE_DETECTED: {
    title: "Category navigation page detected",
    detail: "This URL appears to be a navigation/gateway page, not a product listing. Try navigating to a specific category or collection URL.",
    icon: <Info className="h-5 w-5" />,
  },
  JS_RENDER_FAILED: {
    title: "JavaScript rendering failed",
    detail: "The page required JavaScript rendering but products did not load within the timeout. The site may use heavy client-side rendering.",
    icon: <AlertTriangle className="h-5 w-5" />,
  },
  PRODUCT_EXTRACTION_EMPTY: {
    title: "Product extraction returned empty",
    detail: "Product detail URLs were found, but the extraction could not parse meaningful product data from those pages.",
    icon: <AlertTriangle className="h-5 w-5" />,
  },
  UPSTREAM_FIRECRAWL_ERROR: {
    title: "Firecrawl API error",
    detail: "The scraping service returned an error. This may be a credits or quota issue.",
    icon: <XCircle className="h-5 w-5" />,
  },
  INTERNAL_ERROR: {
    title: "Internal error",
    detail: "An unexpected error occurred during scraping.",
    icon: <XCircle className="h-5 w-5" />,
  },
  DOMAIN_MISMATCH: {
    title: "Domain mismatch",
    detail: "The effective crawl domain differs from the target domain.",
    icon: <ShieldAlert className="h-5 w-5" />,
  },
};

export default function ScrapeProducts() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("configure");

  // Config state
  const [url, setUrl] = useState("");
  const [scrapeMode, setScrapeMode] = useState<ScrapeMode>("collection");
  const [maxPages, setMaxPages] = useState(50);
  const [crawlDepth, setCrawlDepth] = useState(2);
  const [discoveryPaths, setDiscoveryPaths] = useState("");
  const [productPaths, setProductPaths] = useState("");
  const [excludePaths, setExcludePaths] = useState("");
  const [importMode, setImportMode] = useState<BulkUpsertMode>("fill_blanks");
  const [complianceChecked, setComplianceChecked] = useState(false);
  const [platformResult, setPlatformResult] = useState<PlatformDetectionResult | null>(null);
  const [detectingPlatform, setDetectingPlatform] = useState(false);
  const debouncedUrl = useDebouncedValue(url, 800);

  // Run platform detection when URL changes
  useEffect(() => {
    const trimmed = debouncedUrl.trim();
    if (!trimmed || trimmed.length < 8) {
      setPlatformResult(null);
      return;
    }
    let cancelled = false;
    setDetectingPlatform(true);
    detectPlatform(trimmed).then(result => {
      if (!cancelled) {
        setPlatformResult(result);
        setDetectingPlatform(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setPlatformResult(null);
        setDetectingPlatform(false);
      }
    });
    return () => { cancelled = true; };
  }, [debouncedUrl]);

  // Progress state
  const [progress, setProgress] = useState<ScrapeProgress | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [jobConfig, setJobConfig] = useState<ScrapeJobConfig | null>(null);
  const cancelledRef = useRef(false);

  // Review state
  const [products, setProducts] = useState<ExtractedProduct[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [editingCell, setEditingCell] = useState<{ id: string; key: string } | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [drawerProduct, setDrawerProduct] = useState<ExtractedProduct | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(REVIEW_COLUMNS.map((c) => c.key))
  );
  const [showColumnToggle, setShowColumnToggle] = useState(false);

  // Confirm & debug
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmMode, setConfirmMode] = useState<BulkUpsertMode>("fill_blanks");
  const [showDebug, setShowDebug] = useState(false);

  // Results state
  const [importResult, setImportResult] = useState<{
    inserted: number;
    updated: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  // Export modal
  const [showExport, setShowExport] = useState(false);
  const [exportFormat, setExportFormat] = useState<"csv" | "xlsx">("xlsx");
  const [exportScope, setExportScope] = useState<"all" | "selected" | "page">("all");
  const [exportIncludeExcluded, setExportIncludeExcluded] = useState(false);
  const [exportFilename, setExportFilename] = useState("");
  const [exportColumnPreset, setExportColumnPreset] = useState<"all" | "essentials" | "custom">("all");

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
    const configResult = buildJobConfig({
      url,
      scrapeMode,
      maxPages,
      crawlDepth,
      discoveryPaths,
      productPaths,
      excludePaths,
      importMode,
    });

    if ("error" in configResult) {
      toast.error(configResult.error);
      return;
    }

    setJobConfig(configResult);
    setIsRunning(true);
    cancelledRef.current = false;
    setStep("progress");
    setProgress(null);

    const finalProgress = await runScrapeJob(
      configResult,
      (p) => setProgress({ ...p }),
      cancelledRef
    );

    setIsRunning(false);
    setProgress(finalProgress);

    if (cancelledRef.current) {
      setStep("configure");
      toast.info("Job cancelled");
      return;
    }

    if (finalProgress.diagnostics.failureCategory) {
      const failInfo = FAILURE_MESSAGES[finalProgress.diagnostics.failureCategory];
      if (failInfo) {
        toast.error(failInfo.title);
      }
      // Stay on progress screen so user can see diagnostics
      return;
    }

    if (finalProgress.extractedProducts.length === 0) {
      toast.warning("No products found. Check the diagnostics panel for details.");
      return;
    }

    // Move to review
    setProducts(finalProgress.extractedProducts);
    setCurrentPage(1);
    toast.success(`${finalProgress.extractedProducts.length} products extracted`);
    setStep("review");
  }

  function cancelJob() {
    cancelledRef.current = true;
    setIsRunning(false);
    setStep("configure");
    toast.info("Job cancelled");
  }

  function retryFromProgress() {
    setStep("configure");
  }

  function useExtractedProducts() {
    if (!progress) return;
    if (progress.extractedProducts.length > 0) {
      setProducts(progress.extractedProducts);
      setCurrentPage(1);
      setStep("review");
    }
  }

  function updateCell(id: string, key: string, value: string) {
    setProducts((prev) =>
      prev.map((p) => {
        if (p._id !== id) return p;
        const updated = {
          ...p,
          [key]: key === "sell_price" || key === "cost_price" || key === "weight_grams"
            ? value ? Number(value) : null
            : value,
        };
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
    const cleanRows = toImport.map(({
      _id, _status, _excluded, _selected, _sourceUrl, _extractionConfidence,
      _extractionNotes, _rawExtractedJson, additional_image_urls, primary_image_url,
      ...rest
    }) => rest);

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

  function getExportDefaultFilename(): string {
    const domain = jobConfig?.targetDomain || "unknown";
    const date = new Date().toISOString().slice(0, 10);
    return `pharma-bay-${domain}-${date}`;
  }

  function openExportModal() {
    setExportFilename(getExportDefaultFilename());
    setExportScope("all");
    setExportIncludeExcluded(false);
    setExportFormat("xlsx");
    setShowExport(true);
  }

  function handleExport() {
    let sourceRows: ExtractedProduct[];
    if (exportScope === "selected") {
      sourceRows = products.filter((p) => p._selected);
    } else if (exportScope === "page") {
      sourceRows = paginatedProducts;
    } else {
      sourceRows = [...products];
    }
    if (!exportIncludeExcluded) {
      sourceRows = sourceRows.filter((p) => !p._excluded);
    }
    if (sourceRows.length === 0) {
      toast.error("No rows to export with current filters");
      return;
    }

    const cols = getExportColumns(exportColumnPreset);
    const data = sourceRows.map((row) => {
      const out: Record<string, any> = {};
      for (const col of cols) {
        let val = col.getter ? col.getter(row) : (row as any)[col.key];
        if (col.format === "tags" && Array.isArray(val)) val = val.join(", ");
        if (col.format === "pipe" && Array.isArray(val)) val = val.join("|");
        if (col.format === "date" && val) {
          try { val = new Date(val).toISOString().replace("T", " ").slice(0, 19); } catch { /* keep */ }
        }
        if (col.format === "price") val = val != null && val !== "" ? Number(Number(val).toFixed(2)) : "";
        if (col.format === "decimal") val = val != null && val !== "" ? Number(Number(val).toFixed(2)) : "";
        if (col.format === "bool") val = val === true ? "true" : val === false ? "false" : "";
        if (val === null || val === undefined) val = "";
        out[col.label] = val;
      }
      return out;
    });

    const filename = exportFilename || getExportDefaultFilename();
    if (exportFormat === "csv") {
      exportScrapeCSV(data, filename);
    } else {
      exportScrapeXLSX(data, cols, sourceRows, filename);
    }
    setShowExport(false);
    toast.success(`Exported ${sourceRows.length} products`);
  }

  // ==========================================
  // STEP: Configure
  // ==========================================
  if (step === "configure") {
    // Derive domain for preflight display
    let preflightDomain = "";
    try {
      let u = url.trim();
      if (u && !u.startsWith("http")) u = `https://${u}`;
      preflightDomain = new URL(u).hostname;
    } catch { /* ignore */ }

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
              placeholder="https://example.com/collections/products"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />

            {/* Platform Detection Badge */}
            {(detectingPlatform || platformResult) && url.trim().length >= 8 && (
              <div className="flex items-center gap-2">
                {detectingPlatform ? (
                  <Badge variant="outline" className="text-xs gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Detecting platform…
                  </Badge>
                ) : platformResult?.platform === 'shopify' ? (
                  <Badge variant="outline" className="text-xs gap-1 border-primary/50 text-primary">
                    <CheckCircle2 className="h-3 w-3" />
                    Shopify detected — will use Products API for fast, accurate extraction
                  </Badge>
                ) : platformResult?.platform === 'woocommerce' ? (
                  <Badge variant="outline" className="text-xs gap-1 border-destructive/50 text-destructive">
                    <AlertTriangle className="h-3 w-3" />
                    WooCommerce detected — will use REST API
                  </Badge>
                ) : platformResult ? (
                  <Badge variant="outline" className="text-xs gap-1 text-muted-foreground">
                    <Info className="h-3 w-3" />
                    Platform unknown — will use Firecrawl AI extraction
                  </Badge>
                ) : null}
              </div>
            )}

            <div>
              <Label className="text-sm font-medium mb-2 block">Scrape Mode</Label>
              <div className="grid grid-cols-3 gap-3">
                {([
                  ["single", "Single Page", "Extract from one URL only"],
                  ["collection", "Collection Page", "Discover products from listing + pagination"],
                  ["domain", "Full Domain", "Deep crawl with configurable depth"],
                ] as const).map(([mode, title, desc]) => (
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
              <div className="space-y-3">
                <div>
                  <Label className="text-sm">Discovery Paths <span className="text-muted-foreground font-normal">(pages to explore for product links)</span></Label>
                  <Input
                    placeholder="/collections/, /category/, /browse/ (auto-populated)"
                    value={discoveryPaths}
                    onChange={(e) => setDiscoveryPaths(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Seed URL is always included automatically.</p>
                </div>
                <div>
                  <Label className="text-sm">Product Paths <span className="text-muted-foreground font-normal">(URLs eligible for product extraction)</span></Label>
                  <Input
                    placeholder="/products/, /product/, /p/, /item/"
                    value={productPaths}
                    onChange={(e) => setProductPaths(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-sm">Exclude Paths</Label>
                  <Input
                    placeholder="/blog/, /checkout/, /cart/"
                    value={excludePaths}
                    onChange={(e) => setExcludePaths(e.target.value)}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Preflight Summary */}
        {url.trim() && preflightDomain && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-5 space-y-2">
              <div className="text-sm font-medium text-foreground">Preflight Summary</div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>🌐 Target: <span className="font-medium text-foreground">{preflightDomain}</span></p>
                <p>1. Seed page will be fetched first: <span className="font-mono text-foreground">{url.trim()}</span></p>
                {scrapeMode !== "single" && (
                  <>
                    <p>2. Discovery will run on the seed page and any pagination pages</p>
                    <p>3. Final extraction will run only on qualified product-detail pages</p>
                    <p>4. Max pages to scrape: {maxPages}</p>
                  </>
                )}
                {scrapeMode === "single" && (
                  <p>2. Product data will be extracted directly from this page</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

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

  // ==========================================
  // STEP: Progress
  // ==========================================
  if (step === "progress") {
    const stages = ["seed_validation", "page_type_detection", "discovery", "qualification", "extraction", "complete"];
    const currentStageIdx = progress ? stages.indexOf(progress.stage) : 0;
    const failureCode = progress?.diagnostics.failureCategory;
    const failureInfo = failureCode ? FAILURE_MESSAGES[failureCode] : null;
    const hasProducts = (progress?.extractedProducts.length ?? 0) > 0;

    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-display font-semibold text-foreground">
            {failureCode ? "Scrape Issue" : isRunning ? "Scraping…" : "Scrape Complete"}
          </h1>
          {jobConfig && (
            <Badge variant="outline" className="text-xs font-mono">
              {jobConfig.targetDomain}
            </Badge>
          )}
        </div>

        {/* Failure Banner */}
        {failureInfo && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="pt-5">
              <div className="flex gap-3">
                <div className="text-destructive shrink-0 mt-0.5">{failureInfo.icon}</div>
                <div>
                  <div className="font-medium text-destructive">{failureInfo.title}</div>
                  <p className="text-sm text-muted-foreground mt-1">{failureInfo.detail}</p>
                  {progress?.diagnostics.seedFetchHttpStatus && (
                    <p className="text-xs text-muted-foreground mt-1">HTTP Status: {progress.diagnostics.seedFetchHttpStatus}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stage Steps */}
        <Card>
          <CardContent className="pt-6 space-y-3">
            {stages.map((s, i) => (
              <div key={s} className="flex items-center gap-3">
                {currentStageIdx > i || progress?.stage === 'complete' ? (
                  <CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))]" />
                ) : failureCode && currentStageIdx === i ? (
                  <XCircle className="h-5 w-5 text-destructive" />
                ) : currentStageIdx === i ? (
                  <Loader2 className="h-5 w-5 text-primary animate-spin" />
                ) : (
                  <div className="h-5 w-5 rounded-full border-2 border-border" />
                )}
                <span className={`text-sm ${currentStageIdx >= i ? "text-foreground" : "text-muted-foreground"}`}>
                  {STAGE_LABELS[s]}
                </span>
                {progress?.stage === s && progress.stageLabel !== STAGE_LABELS[s] && (
                  <span className="text-xs text-muted-foreground">— {progress.stageLabel}</span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Counters */}
        <div className="grid grid-cols-4 gap-3">
          {([
            ["Pages Found", progress?.pagesDiscovered ?? 0],
            ["Scraped", progress?.pagesScraped ?? 0],
            ["Products", progress?.productsExtracted ?? 0],
            ["Pagination", progress?.paginationPagesVisited ?? 0],
          ] as const).map(([label, val]) => (
            <Card key={label}>
              <CardContent className="pt-4 text-center">
                <div className="text-2xl font-semibold text-foreground">{val}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Log */}
        {progress && progress.errors.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Activity Log</CardTitle></CardHeader>
            <CardContent>
              <ScrollArea className="h-40">
                {progress.errors.map((e, i) => (
                  <div key={i} className={`text-xs py-1 flex gap-2 ${
                    e.level === 'error' ? 'text-destructive' :
                    e.level === 'warn' ? 'text-[hsl(var(--warning))]' :
                    'text-muted-foreground'
                  }`}>
                    <span className="text-[10px] font-mono shrink-0">{e.stage}</span>
                    <span>{e.message}</span>
                  </div>
                ))}
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Debug Panel */}
        {progress?.diagnostics && (
          <Collapsible open={showDebug} onOpenChange={setShowDebug}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <Bug className="h-4 w-4" />
                Diagnostics
                {showDebug ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Card className="mt-2">
                <CardContent className="pt-4">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Seed URL:</span>
                      <span className="ml-1 font-mono break-all">{progress.diagnostics.seedUrl}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Domain:</span>
                      <span className="ml-1 font-mono">{progress.diagnostics.resolvedDomain}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Page Type:</span>
                      <Badge variant="outline" className="ml-1 text-[10px]">{progress.diagnostics.detectedPageType || 'pending'}</Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">HTTP Status:</span>
                      <span className="ml-1">{progress.diagnostics.seedFetchHttpStatus ?? '—'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">JS Retry:</span>
                      <span className="ml-1">{progress.diagnostics.jsRetryUsed ? 'Yes' : 'No'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Mode:</span>
                      <span className="ml-1">{progress.diagnostics.scrapeMode}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Discovered URLs:</span>
                      <span className="ml-1">{progress.diagnostics.discoveredUrlCount}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Accepted Products:</span>
                      <span className="ml-1">{progress.diagnostics.acceptedProductUrlCount}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Rejected:</span>
                      <span className="ml-1">{progress.diagnostics.rejectedUrlCount}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Failure:</span>
                      <span className="ml-1">{progress.diagnostics.failureCategory || 'None'}</span>
                    </div>
                  </div>
                  {progress.diagnostics.skippedPagesWithReasons.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs font-medium text-muted-foreground mb-1">Skipped Pages:</div>
                      <ScrollArea className="h-24">
                        {progress.diagnostics.skippedPagesWithReasons.map((s, i) => (
                          <div key={i} className="text-[10px] text-muted-foreground py-0.5">
                            <span className="font-mono">{s.url.substring(0, 60)}…</span>
                            <span className="ml-1 text-destructive">({s.reason})</span>
                          </div>
                        ))}
                      </ScrollArea>
                    </div>
                  )}
                  {progress.diagnostics.paginationPagesVisited.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs font-medium text-muted-foreground mb-1">Pagination Pages Visited:</div>
                      {progress.diagnostics.paginationPagesVisited.map((u, i) => (
                        <div key={i} className="text-[10px] font-mono text-muted-foreground">{u}</div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {isRunning ? (
            <Button variant="destructive" onClick={cancelJob}>Cancel Job</Button>
          ) : (
            <>
              <Button variant="outline" onClick={retryFromProgress}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Configure
              </Button>
              {hasProducts && (
                <Button onClick={useExtractedProducts}>
                  Review {progress?.extractedProducts.length} Products
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ==========================================
  // STEP: Results
  // ==========================================
  if (step === "results" && importResult) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-display font-semibold text-foreground">Import Complete</h1>

        <div className="grid grid-cols-4 gap-3">
          {([
            ["✅ Inserted", importResult.inserted, "text-[hsl(var(--success))]"],
            ["🔄 Updated", importResult.updated, "text-[hsl(var(--info))]"],
            ["⚠️ Skipped", importResult.skipped, "text-[hsl(var(--warning))]"],
            ["❌ Failed", importResult.errors.length, "text-destructive"],
          ] as const).map(([label, val, cls]) => (
            <Card key={label}>
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
          <Button onClick={() => navigate("/products")}>View Products</Button>
          <Button variant="outline" onClick={openExportModal}>
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

        <ScrapeExportModal open={showExport} onOpenChange={setShowExport} format={exportFormat} setFormat={setExportFormat} scope={exportScope} setScope={setExportScope} includeExcluded={exportIncludeExcluded} setIncludeExcluded={setExportIncludeExcluded} filename={exportFilename} setFilename={setExportFilename} onExport={handleExport} totalCount={products.filter(p => !p._excluded).length} selectedCount={selectedProducts.length} pageCount={paginatedProducts.length} columnPreset={exportColumnPreset} setColumnPreset={setExportColumnPreset} />
      </div>
    );
  }

  // ==========================================
  // STEP: Review
  // ==========================================
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
            <p className="text-xs text-muted-foreground">
              {activeProducts.length} products • Page {currentPage}/{totalPages || 1}
              {jobConfig && <span> • {jobConfig.targetDomain}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowColumnToggle(!showColumnToggle)}>
            {showColumnToggle ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
            Columns
          </Button>
          <Button variant="outline" size="sm" onClick={openExportModal}>
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
          }}>Set Brand</Button>
          <Button size="sm" variant="outline" onClick={() => {
            const val = prompt("Set product type for selected rows:");
            if (val) bulkSetField("product_type", val);
          }}>Set Type</Button>
          <Button size="sm" variant="outline" onClick={excludeSelected}>Exclude</Button>
          <Button size="sm" variant="destructive" onClick={deleteSelected}>
            <Trash2 className="h-3 w-3 mr-1" />Delete
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
      <ScrapeExportModal open={showExport} onOpenChange={setShowExport} format={exportFormat} setFormat={setExportFormat} scope={exportScope} setScope={setExportScope} includeExcluded={exportIncludeExcluded} setIncludeExcluded={setExportIncludeExcluded} filename={exportFilename} setFilename={setExportFilename} onExport={handleExport} totalCount={products.filter(p => !p._excluded).length} selectedCount={selectedProducts.length} pageCount={paginatedProducts.length} columnPreset={exportColumnPreset} setColumnPreset={setExportColumnPreset} />
    </div>
  );
}

// ============================================================
// FULL EXPORT COLUMN DEFINITIONS
// ============================================================

type ColFormat = "text" | "price" | "decimal" | "bool" | "tags" | "pipe" | "date" | "int";

interface ExportCol {
  key: string;
  label: string;
  format: ColFormat;
  getter?: (row: ExtractedProduct) => any;
  group: "essential" | "detail";
}

const ALL_EXPORT_COLUMNS: ExportCol[] = [
  { key: "source_product_name", label: "title", format: "text", group: "essential" },
  { key: "brand", label: "brand", format: "text", group: "essential" },
  { key: "sell_price", label: "price", format: "price", group: "essential" },
  { key: "compare_at_price", label: "compare_at_price", format: "price", group: "detail" },
  { key: "currency", label: "currency", format: "text", getter: () => "AUD", group: "detail" },
  { key: "sku", label: "sku", format: "text", group: "essential" },
  { key: "barcode", label: "barcode", format: "text", group: "detail" },
  { key: "product_type", label: "product_type", format: "text", group: "detail" },
  { key: "category", label: "category", format: "text", group: "detail" },
  { key: "tags", label: "tags", format: "tags", group: "detail" },
  { key: "pack_size", label: "pack_size", format: "text", group: "detail" },
  { key: "strength", label: "strength", format: "text", group: "detail" },
  { key: "weight_grams", label: "weight", format: "decimal", group: "detail" },
  { key: "weight_unit", label: "weight_unit", format: "text", getter: (r) => r.weight_grams ? "g" : "", group: "detail" },
  { key: "dimensions", label: "dimensions", format: "text", group: "detail" },
  { key: "short_description", label: "short_description", format: "text", group: "detail" },
  { key: "full_description_html", label: "full_description_html", format: "text", group: "detail" },
  { key: "plain_description", label: "plain_description", format: "text", getter: (r) => r.full_description_html ? r.full_description_html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : "", group: "detail" },
  { key: "ingredients_summary", label: "ingredients", format: "text", group: "detail" },
  { key: "product_form", label: "dosage_form", format: "text", group: "detail" },
  { key: "indications", label: "indications", format: "text", group: "detail" },
  { key: "directions_summary", label: "directions", format: "text", group: "detail" },
  { key: "warnings_summary", label: "contraindications", format: "text", group: "detail" },
  { key: "storage_requirements", label: "storage_conditions", format: "text", group: "detail" },
  { key: "shelf_life_notes", label: "shelf_life", format: "text", group: "detail" },
  { key: "pregnancy_category", label: "pregnancy_category", format: "text", group: "detail" },
  { key: "cold_chain_required", label: "cold_chain_required", format: "bool", group: "detail" },
  { key: "stock_status", label: "stock_status", format: "text", group: "essential" },
  { key: "quantity_available", label: "quantity_available", format: "int", group: "detail" },
  { key: "primary_image_url", label: "primary_image_url", format: "text", group: "essential" },
  { key: "additional_image_urls", label: "additional_image_urls", format: "pipe", group: "detail" },
  { key: "_image_count", label: "image_count", format: "int", getter: (r) => {
    let c = r.primary_image_url ? 1 : 0;
    if (Array.isArray(r.additional_image_urls)) c += r.additional_image_urls.length;
    return c || "";
  }, group: "detail" },
  { key: "_all_images", label: "all_image_urls", format: "text", getter: (r) => {
    const imgs: string[] = [];
    if (r.primary_image_url) imgs.push(r.primary_image_url);
    if (Array.isArray(r.additional_image_urls)) imgs.push(...r.additional_image_urls);
    return imgs.join("|");
  }, group: "detail" },
  { key: "_sourceUrl", label: "source_url", format: "text", group: "essential" },
  { key: "_sourceSite", label: "source_site", format: "text", getter: (r) => { try { return new URL(r._sourceUrl).hostname; } catch { return ""; } }, group: "detail" },
  { key: "_sourceCollectionUrl", label: "source_collection_url", format: "text", getter: (r) => (r as any).source_collection_url ?? "", group: "detail" },
  { key: "variant_sku", label: "sku_variant", format: "text", group: "detail" },
  { key: "variant_title", label: "variant_title", format: "text", group: "detail" },
  { key: "option1_name", label: "option1_name", format: "text", group: "detail" },
  { key: "option1_value", label: "option1_value", format: "text", group: "detail" },
  { key: "option2_name", label: "option2_name", format: "text", group: "detail" },
  { key: "option2_value", label: "option2_value", format: "text", group: "detail" },
  { key: "option3_name", label: "option3_name", format: "text", group: "detail" },
  { key: "option3_value", label: "option3_value", format: "text", group: "detail" },
  { key: "requires_prescription", label: "requires_prescription", format: "bool", group: "detail" },
  { key: "tga_aust_number", label: "tga_number", format: "text", group: "detail" },
  { key: "pbs_listed", label: "pbs_listed", format: "bool", group: "detail" },
  { key: "scheduled_status", label: "scheduled_status", format: "text", group: "detail" },
  { key: "condition", label: "condition", format: "text", group: "detail" },
  { key: "mpn", label: "mpn", format: "text", group: "detail" },
  { key: "country_of_origin", label: "country_of_origin", format: "text", group: "detail" },
  { key: "shipping_notes", label: "shipping_notes", format: "text", group: "detail" },
  { key: "return_notes", label: "return_notes", format: "text", group: "detail" },
  { key: "_extractionConfidence", label: "extraction_confidence_score", format: "decimal", group: "essential" },
  { key: "_extractionNotes", label: "extraction_notes", format: "text", getter: (r) => Array.isArray(r._extractionNotes) ? r._extractionNotes.join(", ") : (r._extractionNotes ?? ""), group: "detail" },
  { key: "scraped_at", label: "scraped_at", format: "date", group: "detail" },
  { key: "user_edited", label: "user_edited", format: "bool", group: "detail" },
  { key: "_export_status", label: "export_status", format: "text", getter: (r) => r._excluded ? "exclude" : "include", group: "detail" },
  { key: "validation_errors", label: "validation_errors", format: "text", getter: (r) => {
    const notes = r._extractionNotes;
    if (Array.isArray(notes) && notes.length) return notes.filter(n => n.toLowerCase().includes("error") || n.toLowerCase().includes("missing")).join(", ");
    if (r._status === "error") return "Missing required fields";
    return "";
  }, group: "detail" },
];

function getExportColumns(preset: "all" | "essentials" | "custom"): ExportCol[] {
  if (preset === "essentials") return ALL_EXPORT_COLUMNS.filter(c => c.group === "essential");
  return ALL_EXPORT_COLUMNS;
}

// ============================================================
// EXPORT MODAL COMPONENT
// ============================================================

function ScrapeExportModal({
  open,
  onOpenChange,
  format,
  setFormat,
  scope,
  setScope,
  includeExcluded,
  setIncludeExcluded,
  filename,
  setFilename,
  onExport,
  totalCount,
  selectedCount,
  pageCount,
  columnPreset,
  setColumnPreset,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  format: "csv" | "xlsx";
  setFormat: (v: "csv" | "xlsx") => void;
  scope: "all" | "selected" | "page";
  setScope: (v: "all" | "selected" | "page") => void;
  includeExcluded: boolean;
  setIncludeExcluded: (v: boolean) => void;
  filename: string;
  setFilename: (v: string) => void;
  onExport: () => void;
  totalCount: number;
  selectedCount: number;
  pageCount: number;
  columnPreset: "all" | "essentials" | "custom";
  setColumnPreset: (v: "all" | "essentials" | "custom") => void;
}) {
  const countLabel = scope === "all" ? totalCount : scope === "selected" ? selectedCount : pageCount;
  const colCount = getExportColumns(columnPreset).length;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Scraped Products</DialogTitle>
          <DialogDescription>Choose scope, columns, format, and download.</DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-5">
          {/* Scope */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Scope</Label>
            <div className="space-y-1.5">
              {([
                { value: "all" as const, label: `All products (${totalCount})` },
                { value: "selected" as const, label: `Selected rows only (${selectedCount})` },
                { value: "page" as const, label: `Current page only (${pageCount})` },
              ]).map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="radio" name="export-scope" checked={scope === opt.value} onChange={() => setScope(opt.value)} className="accent-[hsl(var(--primary))]" />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
          {/* Columns */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Columns</Label>
            <div className="space-y-1.5">
              {([
                { value: "all" as const, label: `All fields (${ALL_EXPORT_COLUMNS.length} columns)`, desc: "Every scraped field including images, variants, regulatory" },
                { value: "essentials" as const, label: "Essentials only (7 columns)", desc: "Title, Brand, Price, SKU, Stock, Primary Image, Source URL" },
              ]).map((opt) => (
                <label key={opt.value} className="flex items-start gap-2 cursor-pointer text-sm">
                  <input type="radio" name="export-cols" checked={columnPreset === opt.value} onChange={() => setColumnPreset(opt.value)} className="accent-[hsl(var(--primary))] mt-0.5" />
                  <span>
                    <span className="font-medium">{opt.label}</span>
                    <span className="block text-xs text-muted-foreground">{opt.desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          {/* Format */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Format</Label>
            <div className="space-y-1.5">
              {([
                { value: "xlsx" as const, label: "Excel (.xlsx)" },
                { value: "csv" as const, label: "CSV (.csv)" },
              ]).map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="radio" name="export-format" checked={format === opt.value} onChange={() => setFormat(opt.value)} className="accent-[hsl(var(--primary))]" />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
          {/* Include excluded */}
          <div className="flex items-center gap-2">
            <Checkbox id="include-excluded" checked={includeExcluded} onCheckedChange={(v) => setIncludeExcluded(!!v)} />
            <Label htmlFor="include-excluded" className="text-sm cursor-pointer">Include rows marked as Excluded</Label>
          </div>
          {/* Filename */}
          <div className="space-y-1">
            <Label className="text-sm font-medium">Filename</Label>
            <Input value={filename} onChange={(e) => setFilename(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onExport}>
            <Download className="mr-2 h-4 w-4" />
            Export {countLabel} products ({colCount} cols)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Scrape export helpers ---

function exportScrapeCSV(data: Record<string, any>[], filename: string) {
  import("papaparse").then((Papa) => {
    const csv = Papa.default.unparse(data, { header: true });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    downloadBlobFile(blob, `${filename}.csv`);
  });
}

function exportScrapeXLSX(
  data: Record<string, any>[],
  cols: ExportCol[],
  sourceRows: ExtractedProduct[],
  filename: string,
) {
  import("xlsx").then((XLSX) => {
    const headers = cols.map((c) => c.label);
    const rows = data.map((row) => headers.map((h) => row[h] ?? ""));
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // Column widths
    ws["!cols"] = headers.map((h) => ({
      wch: Math.min(60, Math.max(12, h.length + 2)),
    }));

    // Freeze header
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };

    // Index lookups
    const priceIdx = new Set<number>();
    const boolIdx = new Set<number>();
    const urlIdx = new Set<number>();
    const descIdx = new Set<number>();
    const confIdx = headers.indexOf("extraction_confidence_score");
    const stockIdx = headers.indexOf("stock_status");
    const valErrIdx = headers.indexOf("validation_errors");
    const weightIdx = headers.indexOf("weight");

    cols.forEach((c, i) => {
      if (c.format === "price") priceIdx.add(i);
      if (c.format === "bool") boolIdx.add(i);
      if (c.label.includes("url") || c.label.includes("image")) urlIdx.add(i);
      if (c.label.includes("description") || c.label === "ingredients" || c.label === "directions" || c.label === "contraindications") descIdx.add(i);
    });

    // Style header row
    for (let c = 0; c < headers.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      if (!ws[addr]) continue;
      ws[addr].s = {
        font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
        fill: { fgColor: { rgb: "2D5016" } },
      };
    }

    // Style data rows
    for (let r = 1; r <= rows.length; r++) {
      const srcRow = sourceRows[r - 1];
      const isOutOfStock = srcRow?.stock_status === "out_of_stock";
      const isLowConf = confIdx >= 0 && srcRow?._extractionConfidence != null && Number(srcRow._extractionConfidence) < 0.7;
      const hasValErrors = valErrIdx >= 0 && data[r - 1]?.[headers[valErrIdx]];

      for (let c = 0; c < headers.length; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!ws[addr]) continue;

        // Number formats
        if (priceIdx.has(c) && typeof ws[addr].v === "number") ws[addr].z = "$#,##0.00";
        if (c === weightIdx && typeof ws[addr].v === "number") ws[addr].z = "0.00";
        if (c === confIdx && typeof ws[addr].v === "number") ws[addr].z = "0.00";

        // Bool alignment
        if (boolIdx.has(c)) ws[addr].s = { ...(ws[addr].s || {}), alignment: { horizontal: "center" } };

        // URL styling (blue)
        if (urlIdx.has(c) && typeof ws[addr].v === "string" && ws[addr].v.startsWith("http")) {
          ws[addr].l = { Target: ws[addr].v, Tooltip: ws[addr].v };
          ws[addr].s = { ...(ws[addr].s || {}), font: { color: { rgb: "0563C1" }, underline: true } };
        }

        // Description text wrapping
        if (descIdx.has(c)) {
          ws[addr].s = { ...(ws[addr].s || {}), alignment: { wrapText: true, vertical: "top" }, font: { ...(ws[addr].s?.font || {}), sz: 10 } };
        }

        // Conditional fills (priority: out_of_stock > validation errors > low confidence)
        if (isOutOfStock) {
          ws[addr].s = { ...(ws[addr].s || {}), fill: { fgColor: { rgb: "FFE4E4" } } };
        } else if (hasValErrors) {
          ws[addr].s = { ...(ws[addr].s || {}), fill: { fgColor: { rgb: "FFF0E4" } } };
          if (c === valErrIdx) ws[addr].s = { ...(ws[addr].s || {}), font: { ...(ws[addr].s?.font || {}), color: { rgb: "C00000" } } };
        } else if (isLowConf) {
          ws[addr].s = { ...(ws[addr].s || {}), fill: { fgColor: { rgb: "FFFDE4" } } };
        }
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PharmaBay Products");

    // Summary sheet
    const brandCounts: Record<string, number> = {};
    const typeCounts: Record<string, number> = {};
    const stockCounts: Record<string, number> = {};
    let highConf = 0, medConf = 0, lowConf = 0;
    for (const row of sourceRows) {
      const b = row.brand || "Unknown";
      brandCounts[b] = (brandCounts[b] || 0) + 1;
      const t = row.product_type || "Unknown";
      typeCounts[t] = (typeCounts[t] || 0) + 1;
      const s = row.stock_status || "unknown";
      stockCounts[s] = (stockCounts[s] || 0) + 1;
      const conf = Number(row._extractionConfidence || 0);
      if (conf >= 0.7) highConf++;
      else if (conf >= 0.4) medConf++;
      else lowConf++;
    }

    const summaryData: (string | number)[][] = [
      ["PharmaBay Export Summary", ""],
      ["Total Products", sourceRows.length],
      ["High Confidence (≥0.7)", highConf],
      ["Medium Confidence", medConf],
      ["Low Confidence (<0.4)", lowConf],
      ["", ""],
      ["Brand", "Count"],
      ...Object.entries(brandCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v]),
      ["", ""],
      ["Stock Status", "Count"],
      ...Object.entries(stockCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v]),
      ["", ""],
      ["Product Type", "Count"],
      ...Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v]),
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(summaryData);
    ws2["!cols"] = [{ wch: 30 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Summary");

    // Image Audit sheet
    const imageRows: (string | number)[][] = [["Product Title", "Image URL", "Image Position"]];
    for (const row of sourceRows) {
      if (row.primary_image_url) imageRows.push([row.source_product_name, row.primary_image_url, "Primary"]);
      if (Array.isArray(row.additional_image_urls)) {
        row.additional_image_urls.forEach((u, i) => imageRows.push([row.source_product_name, u, `Additional ${i + 1}`]));
      }
    }
    const ws3 = XLSX.utils.aoa_to_sheet(imageRows);
    ws3["!cols"] = [{ wch: 40 }, { wch: 60 }, { wch: 16 }];
    // Make image URLs clickable
    for (let r = 1; r < imageRows.length; r++) {
      const addr = XLSX.utils.encode_cell({ r, c: 1 });
      if (ws3[addr] && typeof ws3[addr].v === "string" && ws3[addr].v.startsWith("http")) {
        ws3[addr].l = { Target: ws3[addr].v, Tooltip: ws3[addr].v };
        ws3[addr].s = { font: { color: { rgb: "0563C1" }, underline: true } };
      }
    }
    XLSX.utils.book_append_sheet(wb, ws3, "Image Audit");

    XLSX.writeFile(wb, `${filename}.xlsx`);
  });
}

function downloadBlobFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
