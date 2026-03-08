import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Globe, Loader2, AlertTriangle, Sparkles } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { sanitizeHtml } from "@/lib/sanitize";

interface Props {
  product: any;
}

export function SourcePagesPanel({ product }: Props) {
  const queryClient = useQueryClient();

  // Load persisted URLs from source_links
  const getInitialUrls = (): [string, string, string] => {
    const links = product.source_links as any[] | null;
    if (Array.isArray(links)) {
      const scrapeUrls = links.filter((l: any) => l?.type === "scrape_source").map((l: any) => l.url || "");
      return [scrapeUrls[0] || "", scrapeUrls[1] || "", scrapeUrls[2] || ""];
    }
    return ["", "", ""];
  };

  const [urls, setUrls] = useState<[string, string, string]>(getInitialUrls);
  const [urlErrors, setUrlErrors] = useState<[string, string, string]>(["", "", ""]);
  const [generated, setGenerated] = useState<any>(null);

  useEffect(() => {
    setUrls(getInitialUrls());
  }, [product.source_links]);

  const handleUrlChange = (idx: number, val: string) => {
    setUrls((prev) => {
      const next = [...prev] as [string, string, string];
      next[idx] = val;
      return next;
    });
    setUrlErrors((prev) => {
      const next = [...prev] as [string, string, string];
      next[idx] = "";
      return next;
    });
  };

  const scrapeMutation = useMutation({
    mutationFn: async () => {
      const nonEmpty = urls.filter((u) => u.trim());
      if (nonEmpty.length === 0) {
        throw new Error("Enter at least one source URL");
      }
      const res = await supabase.functions.invoke("scrape-and-generate", {
        body: { product_id: product.id, urls: nonEmpty },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: async (data) => {
      // Mark URL errors
      if (data.scrapeResults) {
        const newErrors: [string, string, string] = ["", "", ""];
        const nonEmptyUrls = urls.filter((u) => u.trim());
        data.scrapeResults.forEach((r: any) => {
          if (!r.success) {
            const idx = nonEmptyUrls.indexOf(r.url);
            if (idx >= 0) {
              // Map back to original index
              let origIdx = -1;
              let count = 0;
              for (let i = 0; i < 3; i++) {
                if (urls[i].trim()) {
                  if (count === idx) { origIdx = i; break; }
                  count++;
                }
              }
              if (origIdx >= 0) newErrors[origIdx] = "Could not scrape this page — check URL";
            }
          }
        });
        setUrlErrors(newErrors);
      }

      setGenerated(data.generated);

      // Auto-populate product fields
      const gen = data.generated || {};
      const updates: any = { updated_at: new Date().toISOString() };
      if (gen.normalized_product_name) updates.normalized_product_name = gen.normalized_product_name;
      if (gen.brand) updates.brand = gen.brand;
      if (gen.product_type) updates.product_type = gen.product_type;
      if (gen.product_form) updates.product_form = gen.product_form;
      if (gen.ingredients_summary) updates.ingredients_summary = gen.ingredients_summary;
      if (gen.directions_summary) updates.directions_summary = gen.directions_summary;
      if (gen.warnings_summary) updates.warnings_summary = gen.warnings_summary;
      if (gen.claims_summary) updates.claims_summary = gen.claims_summary;
      if (gen.pack_size) updates.pack_size = gen.pack_size;

      await supabase.from("products").update(updates).eq("id", product.id);

      // Update eBay draft with description
      if (gen.description_html) {
        const ebayTitle = [
          (gen.brand || product.brand || "").toUpperCase(),
          (gen.normalized_product_name || product.source_product_name || "").toUpperCase(),
          product.strength || "",
          gen.pack_size || product.pack_size || "",
        ].filter(Boolean).join(" ").slice(0, 80);

        const ebayPayload: any = {
          product_id: product.id,
          title: ebayTitle,
          description_html: gen.description_html,
          brand: gen.brand || product.brand || null,
          updated_at: new Date().toISOString(),
        };
        if (gen.upc) ebayPayload.upc = gen.upc;
        if (gen.ebay_category_id) ebayPayload.category_id = gen.ebay_category_id;
        if (gen.subtitle) ebayPayload.subtitle = gen.subtitle;

        const { data: existing } = await supabase
          .from("ebay_drafts").select("id").eq("product_id", product.id).maybeSingle();
        if (existing?.id) {
          await supabase.from("ebay_drafts").update(ebayPayload).eq("id", existing.id);
        } else {
          await supabase.from("ebay_drafts").insert(ebayPayload);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["product", product.id] });
      queryClient.invalidateQueries({ queryKey: ["ebay-draft", product.id] });
      queryClient.invalidateQueries({ queryKey: ["shopify-draft", product.id] });

      toast.success(`Description generated from ${data.sourcesUsed} source(s). Review and edit before publishing.`);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const nonEmptyCount = urls.filter((u) => u.trim()).length;

  return (
    <Card>
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Source Pages for Auto-Generation</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Paste URLs to manufacturer product pages, supplier pages, or health databases.
          The system will scrape them and use AI to extract and synthesise product data.
        </p>

        <div className="space-y-3">
          {[0, 1, 2].map((idx) => (
            <div key={idx} className="space-y-1">
              <Label className="text-xs">Source Page {idx + 1}</Label>
              <div className="flex gap-2 items-start">
                <Input
                  value={urls[idx]}
                  onChange={(e) => handleUrlChange(idx, e.target.value)}
                  placeholder="https://manufacturer.com/product-page"
                  className="text-sm"
                />
                {urlErrors[idx] && (
                  <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600 whitespace-nowrap shrink-0">
                    <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> {urlErrors[idx]}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>

        <Button
          onClick={() => scrapeMutation.mutate()}
          disabled={scrapeMutation.isPending || nonEmptyCount === 0}
          className="w-full gap-2"
        >
          {scrapeMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Scraping sources…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Scrape & Auto-Generate
            </>
          )}
        </Button>

        {/* Generated description preview */}
        {generated?.description_html && (
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase text-primary">Generated Description Preview</Label>
            <div
              className="prose prose-sm max-w-none dark:prose-invert border rounded-md p-4 bg-background text-sm"
              dangerouslySetInnerHTML={{ __html: generated.description_html }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
