import { useState, useCallback, useRef, useEffect } from "react";
import { useBeforeUnload } from "react-router-dom";
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
import { triggerExport } from "@/lib/export-utils";
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

  function handleExport() {
    const data = activeProducts.map(({
      _id, _status, _excluded, _selected, _extractionConfidence,
      _extractionNotes, _rawExtractedJson, ...rest
    }) => rest);
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

        <ExportModal open={showExport} onOpenChange={setShowExport} format={exportFormat} setFormat={setExportFormat} onExport={handleExport} />
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
