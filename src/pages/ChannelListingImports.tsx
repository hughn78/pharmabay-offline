import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Upload, FileUp, CheckCircle2, XCircle, AlertTriangle,
  Loader2, ShoppingCart, Store, History, Search, Link2, Eye,
} from "lucide-react";
import { parseChannelCsv, validateColumns, type DetectedPlatform } from "@/lib/channel-import-parser";
import { matchEbayRows, matchShopifyRows, type MatchResult } from "@/lib/channel-import-matcher";
import { commitEbayImport, commitShopifyImport } from "@/lib/channel-import-committer";
import { ImportPreviewTable } from "@/components/channel-imports/ImportPreviewTable";
import { ImportReviewQueue } from "@/components/channel-imports/ImportReviewQueue";
import { ImportHistory } from "@/components/channel-imports/ImportHistory";

type ImportState = "idle" | "parsing" | "matching" | "preview" | "committing" | "done";

interface ParsedImport {
  platform: DetectedPlatform;
  rows: Record<string, any>[];
  matches: MatchResult[];
  filename: string;
}

export default function ChannelListingImports() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ImportState>("idle");
  const [ebayImport, setEbayImport] = useState<ParsedImport | null>(null);
  const [shopifyImport, setShopifyImport] = useState<ParsedImport | null>(null);
  const [activeTab, setActiveTab] = useState("import");

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setState("parsing");

    for (const file of Array.from(files)) {
      try {
        const result = await parseChannelCsv(file);
        if (result.platform === "unknown") {
          toast.error(`Could not detect platform for ${file.name}`, {
            description: "Expected eBay or Shopify CSV headers",
          });
          continue;
        }

        const warnings = validateColumns(result.headers, result.platform);
        if (warnings.length > 0) {
          toast.warning(`${file.name}: ${warnings.join(", ")}`);
        }

        setState("matching");
        toast.info(`Matching ${result.rows.length} ${result.platform} rows...`);

        let matches: MatchResult[];
        if (result.platform === "ebay") {
          matches = await matchEbayRows(result.rows);
          setEbayImport({ platform: "ebay", rows: result.rows, matches, filename: file.name });
        } else {
          matches = await matchShopifyRows(result.rows);
          setShopifyImport({ platform: "shopify", rows: result.rows, matches, filename: file.name });
        }

        toast.success(`${result.platform === "ebay" ? "eBay" : "Shopify"}: ${result.rows.length} rows parsed, matching complete`);
      } catch (err: any) {
        toast.error(`Error parsing ${file.name}`, { description: err.message });
      }
    }

    setState("preview");
    e.target.value = "";
  };

  const handleCommit = async (importData: ParsedImport) => {
    setState("committing");
    try {
      // Create batch record
      const matched = importData.matches.filter((m) => m.product_id).length;
      const ambiguous = importData.matches.filter((m) => m.ambiguous).length;
      const unmatched = importData.matches.filter((m) => !m.product_id && !m.ambiguous).length;

      const { data: batch, error: batchErr } = await supabase
        .from("channel_listing_import_batches")
        .insert({
          platform: importData.platform,
          filename: importData.filename,
          row_count: importData.rows.length,
          matched_count: matched,
          unmatched_count: unmatched,
          ambiguous_count: ambiguous,
        })
        .select("id")
        .single();

      if (batchErr || !batch) throw batchErr || new Error("Failed to create batch");

      let stats;
      if (importData.platform === "ebay") {
        stats = await commitEbayImport(importData.rows, importData.matches, batch.id);
      } else {
        stats = await commitShopifyImport(importData.rows, importData.matches, batch.id);
      }

      toast.success(`Import complete: ${stats.inserted} new, ${stats.updated} updated, ${stats.draftsUpdated} drafts linked`);
      queryClient.invalidateQueries({ queryKey: ["channel-import-batches"] });
      queryClient.invalidateQueries({ queryKey: ["import-review-queue"] });

      if (importData.platform === "ebay") setEbayImport(null);
      else setShopifyImport(null);

      if (!ebayImport && !shopifyImport) setState("done");
      else setState("preview");
    } catch (err: any) {
      toast.error("Import failed", { description: err.message });
      setState("preview");
    }
  };

  const getStats = (imp: ParsedImport | null) => {
    if (!imp) return { total: 0, matched: 0, unmatched: 0, ambiguous: 0 };
    const matched = imp.matches.filter((m) => m.product_id && !m.ambiguous).length;
    const ambiguous = imp.matches.filter((m) => m.ambiguous).length;
    const unmatched = imp.matches.filter((m) => !m.product_id && !m.ambiguous).length;
    return { total: imp.rows.length, matched, unmatched, ambiguous };
  };

  const ebayStats = getStats(ebayImport);
  const shopifyStats = getStats(shopifyImport);
  const hasPreview = ebayImport || shopifyImport;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Channel Listing Imports</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Import live eBay &amp; Shopify listing exports to sync your local database with what's already online.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="import" className="gap-1.5"><Upload className="h-3.5 w-3.5" /> Import</TabsTrigger>
          <TabsTrigger value="review" className="gap-1.5"><Search className="h-3.5 w-3.5" /> Review Queue</TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5"><History className="h-3.5 w-3.5" /> History</TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="mt-4 space-y-4">
          {/* Upload area */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-4 py-6 border-2 border-dashed rounded-lg border-muted-foreground/25">
                <FileUp className="h-10 w-10 text-muted-foreground/50" />
                <div className="text-center">
                  <p className="font-medium text-sm">Upload eBay or Shopify CSV files</p>
                  <p className="text-xs text-muted-foreground mt-1">Platform is detected automatically from headers</p>
                </div>
                <label>
                  <Input
                    type="file"
                    accept=".csv"
                    multiple
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={state === "parsing" || state === "matching" || state === "committing"}
                  />
                  <Button variant="outline" asChild disabled={state === "parsing" || state === "matching"}>
                    <span>
                      {state === "parsing" || state === "matching" ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>
                      ) : (
                        <><Upload className="h-4 w-4 mr-2" /> Choose Files</>
                      )}
                    </span>
                  </Button>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Summary cards */}
          {hasPreview && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <SummaryCard label="eBay Rows" value={ebayStats.total} icon={<ShoppingCart className="h-4 w-4" />} />
              <SummaryCard label="Shopify Rows" value={shopifyStats.total} icon={<Store className="h-4 w-4" />} />
              <SummaryCard label="Matched" value={ebayStats.matched + shopifyStats.matched} icon={<CheckCircle2 className="h-4 w-4 text-green-500" />} />
              <SummaryCard label="Unmatched" value={ebayStats.unmatched + shopifyStats.unmatched} icon={<XCircle className="h-4 w-4 text-destructive" />} />
              <SummaryCard label="Ambiguous" value={ebayStats.ambiguous + shopifyStats.ambiguous} icon={<AlertTriangle className="h-4 w-4 text-yellow-500" />} />
            </div>
          )}

          {/* eBay preview */}
          {ebayImport && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4" /> eBay Preview — {ebayImport.filename}
                    <Badge variant="outline">{ebayImport.rows.length} rows</Badge>
                  </CardTitle>
                  <Button
                    size="sm"
                    onClick={() => handleCommit(ebayImport)}
                    disabled={state === "committing"}
                  >
                    {state === "committing" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                    Import eBay Listings
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ImportPreviewTable rows={ebayImport.rows} matches={ebayImport.matches} platform="ebay" />
              </CardContent>
            </Card>
          )}

          {/* Shopify preview */}
          {shopifyImport && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Store className="h-4 w-4" /> Shopify Preview — {shopifyImport.filename}
                    <Badge variant="outline">{shopifyImport.rows.length} rows</Badge>
                  </CardTitle>
                  <Button
                    size="sm"
                    onClick={() => handleCommit(shopifyImport)}
                    disabled={state === "committing"}
                  >
                    {state === "committing" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                    Import Shopify Products
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ImportPreviewTable rows={shopifyImport.rows} matches={shopifyImport.matches} platform="shopify" />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="review" className="mt-4">
          <ImportReviewQueue />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <ImportHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
