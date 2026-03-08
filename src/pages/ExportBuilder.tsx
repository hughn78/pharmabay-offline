import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ArrowRight, Download, Copy, Trash2, AlertTriangle, Check } from "lucide-react";
import { useExportCart } from "@/stores/useExportCart";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ComplianceBadge } from "@/components/ui/ComplianceBadge";
import { toast } from "sonner";
import Papa from "papaparse";

type Platform = "ebay" | "shopify" | "generic";

const GENERIC_COLUMNS = [
  "source_product_name", "barcode", "sku", "brand", "stock_on_hand",
  "cost_price", "sell_price", "compliance_status", "enrichment_status",
  "product_type", "z_category", "department", "weight_grams", "pack_size",
  "short_description", "country_of_origin", "manufacturer",
] as const;

export default function ExportBuilder() {
  const navigate = useNavigate();
  const exportCart = useExportCart();
  const [step, setStep] = useState(1);
  const [platform, setPlatform] = useState<Platform>("ebay");
  const [warningsOnly, setWarningsOnly] = useState(false);
  const [genericColumns, setGenericColumns] = useState<Set<string>>(
    new Set(["source_product_name", "barcode", "sku", "brand", "stock_on_hand", "cost_price", "sell_price"])
  );
  const [csvText, setCsvText] = useState("");

  const selectedIdsArray = useMemo(() => Array.from(exportCart.selectedIds), [exportCart.selectedIds]);

  // Fetch products in the cart
  const { data: cartProducts = [], isLoading } = useQuery({
    queryKey: ["export-cart-products", selectedIdsArray],
    queryFn: async () => {
      if (selectedIdsArray.length === 0) return [];
      const results: Record<string, unknown>[] = [];
      for (let i = 0; i < selectedIdsArray.length; i += 50) {
        const chunk = selectedIdsArray.slice(i, i + 50);
        const { data } = await supabase
          .from("products")
          .select("*")
          .in("id", chunk);
        if (data) results.push(...data);
      }
      return results;
    },
    enabled: selectedIdsArray.length > 0,
  });

  // Fetch drafts for status display
  const { data: ebayDrafts = new Map<string, Record<string, unknown>>() } = useQuery({
    queryKey: ["export-ebay-drafts", selectedIdsArray],
    queryFn: async () => {
      if (selectedIdsArray.length === 0) return new Map<string, Record<string, unknown>>();
      const { data } = await supabase
        .from("ebay_drafts")
        .select("*")
        .in("product_id", selectedIdsArray);
      const map = new Map<string, Record<string, unknown>>();
      (data || []).forEach((d) => { if (d.product_id) map.set(d.product_id, d); });
      return map;
    },
    enabled: selectedIdsArray.length > 0,
  });

  const { data: shopifyDrafts = new Map<string, Record<string, unknown>>() } = useQuery({
    queryKey: ["export-shopify-drafts", selectedIdsArray],
    queryFn: async () => {
      if (selectedIdsArray.length === 0) return new Map<string, Record<string, unknown>>();
      const { data } = await supabase
        .from("shopify_drafts")
        .select("*")
        .in("product_id", selectedIdsArray);
      const map = new Map<string, Record<string, unknown>>();
      (data || []).forEach((d) => { if (d.product_id) map.set(d.product_id, d); });
      return map;
    },
    enabled: selectedIdsArray.length > 0,
  });

  const { data: productImages = new Map<string, string[]>() } = useQuery({
    queryKey: ["export-product-images", selectedIdsArray],
    queryFn: async () => {
      if (selectedIdsArray.length === 0) return new Map<string, string[]>();
      const { data } = await supabase
        .from("product_images")
        .select("product_id, local_storage_url, original_url")
        .in("product_id", selectedIdsArray)
        .order("sort_order");
      const map = new Map<string, string[]>();
      (data || []).forEach((img) => {
        if (!img.product_id) return;
        const url = img.local_storage_url || img.original_url || "";
        if (!url) return;
        const list = map.get(img.product_id) || [];
        list.push(url);
        map.set(img.product_id, list);
      });
      return map;
    },
    enabled: selectedIdsArray.length > 0,
  });

  const hasWarning = (p: Record<string, unknown>): boolean => {
    if (p.compliance_status === "blocked" || p.compliance_status === "review_required") return true;
    if (platform === "ebay" && !(ebayDrafts instanceof Map && ebayDrafts.has(p.id as string))) return true;
    if (platform === "shopify" && !(shopifyDrafts instanceof Map && shopifyDrafts.has(p.id as string))) return true;
    return false;
  };

  const displayProducts = warningsOnly ? cartProducts.filter(hasWarning) : cartProducts;
  const warningCount = cartProducts.filter(hasWarning).length;
  const readyCount = cartProducts.length - warningCount;

  const generateCsv = (): string => {
    if (platform === "ebay") return generateEbayCsv();
    if (platform === "shopify") return generateShopifyCsv();
    return generateGenericCsv();
  };

  const generateEbayCsv = (): string => {
    const bom = "\uFEFF";
    const info = "#INFO Version=0.0.2\n";
    const headers = ["Action", "Category ID", "Custom label (SKU)", "Title", "UPC", "Start price", "Quantity", "Item photo URL", "Condition ID", "Description", "Format"];
    const rows = cartProducts.map((p) => {
      const id = p.id as string;
      const draft = ebayDrafts instanceof Map ? ebayDrafts.get(id) : undefined;
      const images = productImages instanceof Map ? (productImages.get(id) || []) : [];
      return [
        "Draft",
        String(draft?.category_id || ""),
        String(draft?.ebay_inventory_sku || p.sku || p.barcode || ""),
        String(draft?.title || p.source_product_name || ""),
        String(draft?.upc || p.barcode || ""),
        String(draft?.start_price || draft?.buy_it_now_price || p.sell_price || ""),
        String(draft?.quantity ?? (p.quantity_available_for_ebay ?? Math.max(0, Number(p.stock_on_hand) || 0))),
        (draft?.image_urls as string[] || images).join("|"),
        String(draft?.condition_id || "1000"),
        String(draft?.description_html || p.full_description_html || ""),
        "FixedPrice",
      ];
    });
    return bom + info + Papa.unparse({ fields: headers, data: rows });
  };

  const generateShopifyCsv = (): string => {
    const headers = ["Handle", "Title", "Body (HTML)", "Vendor", "Type", "Tags", "Published", "Variant SKU", "Variant Price", "Variant Barcode", "Status", "Image Src"];
    const rows: string[][] = [];
    cartProducts.forEach((p) => {
      const id = p.id as string;
      const draft = shopifyDrafts instanceof Map ? shopifyDrafts.get(id) : undefined;
      const images = productImages instanceof Map ? (productImages.get(id) || []) : [];
      const handle = String(draft?.handle || (p.source_product_name as string || "").toLowerCase().replace(/[^a-z0-9]+/g, "-"));
      const baseRow = [
        handle,
        String(draft?.title || p.source_product_name || ""),
        String(draft?.description_html || ""),
        String(draft?.vendor || p.brand || ""),
        String(draft?.product_type || ""),
        ((draft?.tags || []) as string[]).join(","),
        "true",
        String(p.sku || ""),
        String(p.sell_price || ""),
        String(p.barcode || ""),
        String(draft?.status || "draft"),
        images[0] || "",
      ];
      rows.push(baseRow);
      // Additional image rows
      images.slice(1).forEach((img) => {
        const imgRow = new Array(headers.length).fill("");
        imgRow[0] = handle;
        imgRow[imgRow.length - 1] = img;
        rows.push(imgRow);
      });
    });
    return Papa.unparse({ fields: headers, data: rows });
  };

  const generateGenericCsv = (): string => {
    const cols = Array.from(genericColumns);
    const rows = cartProducts.map((p) =>
      cols.map((col) => String((p as Record<string, unknown>)[col] ?? ""))
    );
    return Papa.unparse({ fields: cols, data: rows });
  };

  const handleContinueToPreview = () => {
    const csv = generateCsv();
    setCsvText(csv);
    setStep(3);
  };

  const handleDownload = async () => {
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const filename = `${platform}_${ts}.csv`;

    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    // Log to export_batches
    try {
      await supabase.from("export_batches").insert({
        batch_name: filename,
        platform,
        product_count: cartProducts.length,
      });
      toast.success("Export saved to history");
    } catch {
      toast.success("CSV downloaded");
    }
  };

  const handleCopyClipboard = () => {
    navigator.clipboard.writeText(csvText).then(() => {
      toast.success("CSV copied to clipboard");
    });
  };

  const previewRows = useMemo(() => {
    if (!csvText) return { headers: [] as string[], rows: [] as string[][] };
    const lines = csvText.split("\n").filter((l) => !l.startsWith("#INFO") && l.trim() !== "" && !l.startsWith("\uFEFF#INFO"));
    // Strip BOM from first line
    const cleanLines = lines.map((l) => l.replace(/^\uFEFF/, ""));
    if (cleanLines.length === 0) return { headers: [], rows: [] };
    const parsed = Papa.parse(cleanLines.join("\n"), { header: false });
    const data = parsed.data as string[][];
    return {
      headers: data[0] || [],
      rows: data.slice(1, 11),
    };
  }, [csvText]);

  if (exportCart.count === 0 && step === 1) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/products")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Export Builder</h1>
        </div>
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <p className="mb-4">No products selected for export.</p>
            <Button onClick={() => navigate("/products")}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Go to Products
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => step > 1 ? setStep(step - 1) : navigate("/products")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Export Builder</h1>
            <p className="text-muted-foreground text-sm">
              Step {step} of 3 — {step === 1 ? "Review Products" : step === 2 ? "Configure Export" : "Preview & Download"}
            </p>
          </div>
        </div>
        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-2 w-8 rounded-full transition-colors ${s <= step ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>
      </div>

      {/* Step 1: Review Products */}
      {step === 1 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{exportCart.count} products in export cart</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => navigate("/products")}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Add More Products
              </Button>
              <Button size="sm" onClick={() => setStep(2)} disabled={exportCart.count === 0}>
                Continue <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product Name</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>eBay Draft</TableHead>
                    <TableHead>Shopify Draft</TableHead>
                    <TableHead>Compliance</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                    </TableRow>
                  ) : cartProducts.map((p) => {
                    const id = p.id as string;
                    const hasEbay = ebayDrafts instanceof Map && ebayDrafts.has(id);
                    const hasShopify = shopifyDrafts instanceof Map && shopifyDrafts.has(id);
                    const warn = hasWarning(p);
                    return (
                      <TableRow key={id} className={warn ? "bg-amber-50/50 dark:bg-amber-900/10" : ""}>
                        <TableCell className="font-medium max-w-[280px] truncate">
                          {warn && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 inline mr-1.5" />}
                          {p.source_product_name as string || "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{p.sku as string || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={hasEbay ? "default" : "outline"} className="text-[10px]">
                            {hasEbay ? "Ready" : "No Draft"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={hasShopify ? "default" : "outline"} className="text-[10px]">
                            {hasShopify ? "Ready" : "No Draft"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <ComplianceBadge status={p.compliance_status as string} />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => exportCart.removeProduct(id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Configure Export */}
      {step === 2 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Export Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Platform</Label>
                <div className="flex gap-2">
                  {(["ebay", "shopify", "generic"] as Platform[]).map((p) => (
                    <Button
                      key={p}
                      variant={platform === p ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPlatform(p)}
                    >
                      {p === "ebay" ? "eBay" : p === "shopify" ? "Shopify" : "Generic CSV"}
                    </Button>
                  ))}
                </div>
              </div>

              {platform === "generic" && (
                <div className="space-y-2">
                  <Label>Select Columns</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {GENERIC_COLUMNS.map((col) => (
                      <label key={col} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={genericColumns.has(col)}
                          onCheckedChange={(checked) => {
                            setGenericColumns((prev) => {
                              const next = new Set(prev);
                              checked ? next.add(col) : next.delete(col);
                              return next;
                            });
                          }}
                        />
                        {col.replace(/_/g, " ")}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">
                    {readyCount} of {cartProducts.length} products are export-ready.
                    {warningCount > 0 && <span className="text-amber-600 ml-1">{warningCount} have warnings.</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="warnings-toggle" className="text-xs">Warnings Only</Label>
                  <Switch id="warnings-toggle" checked={warningsOnly} onCheckedChange={setWarningsOnly} />
                </div>
              </div>

              {warningsOnly && displayProducts.length > 0 && (
                <div className="overflow-x-auto border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Issue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayProducts.map((p) => (
                        <TableRow key={p.id as string}>
                          <TableCell className="text-sm truncate max-w-[200px]">{p.source_product_name as string}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {p.compliance_status === "blocked" ? "Blocked" :
                             p.compliance_status === "review_required" ? "Review required" :
                             "Missing draft"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
            </Button>
            <Button onClick={handleContinueToPreview}>
              Continue <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Preview & Download */}
      {step === 3 && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">CSV Preview (first 10 rows)</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleCopyClipboard}>
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copy to Clipboard
                </Button>
                <Button size="sm" onClick={handleDownload}>
                  <Download className="h-3.5 w-3.5 mr-1" /> Download CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {previewRows.headers.map((h, i) => (
                        <TableHead key={i} className="text-xs whitespace-nowrap">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.rows.map((row, ri) => (
                      <TableRow key={ri}>
                        {row.map((cell, ci) => (
                          <TableCell key={ci} className="text-xs max-w-[200px] truncate">{cell}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="outline" onClick={() => setStep(2)}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => { setCsvText(""); setStep(2); }}>
                Export Another Platform
              </Button>
              <Button variant="outline" onClick={() => { exportCart.clearAll(); navigate("/products"); }}>
                <Check className="h-3.5 w-3.5 mr-1" /> Done — Clear Cart
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
