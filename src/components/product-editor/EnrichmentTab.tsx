import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Save, Sparkles, Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AiDescriptionGenerator } from "@/components/ai/AiDescriptionGenerator";
import { SourcePagesPanel } from "@/components/enrichment/SourcePagesPanel";
import { EnrichmentImageUpload } from "@/components/enrichment/EnrichmentImageUpload";
import { sanitizeHtml } from "@/lib/sanitize";
import { upsertEbayDraft, upsertShopifyDraft } from "@/lib/draft-upsert";

interface EnrichmentTabProps {
  product: Record<string, unknown>;
}

export function EnrichmentTab({ product }: EnrichmentTabProps) {
  const queryClient = useQueryClient();

  const enrichMutation = useMutation({
    mutationFn: async () => {
      const res = await supabase.functions.invoke("ai-generate-description", {
        body: { product_id: product.id, target: "general" },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: async (data) => {
      const gen = data.generated || {};
      const now = new Date().toISOString();

      const updates: Record<string, unknown> = {
        enrichment_status: "complete",
        enrichment_confidence: "high",
        enrichment_summary: gen,
        updated_at: now,
      };
      if (gen.normalized_product_name) updates.normalized_product_name = gen.normalized_product_name;
      if (gen.brand) updates.brand = gen.brand;
      if (gen.product_type) updates.product_type = gen.product_type;
      if (gen.product_form) updates.product_form = gen.product_form;
      if (gen.ingredients_summary) updates.ingredients_summary = gen.ingredients_summary;
      if (gen.directions_summary) updates.directions_summary = gen.directions_summary;
      if (gen.warnings_summary) updates.warnings_summary = gen.warnings_summary;
      if (gen.claims_summary) updates.claims_summary = gen.claims_summary;

      const { error } = await supabase.from("products").update(updates).eq("id", product.id as string);
      if (error) throw error;

      const productName = gen.normalized_product_name || product.source_product_name || "";
      const brand = gen.brand || product.brand || "";
      const strength = (product.strength as string) || "";
      const packSize = (product.pack_size as string) || "";
      const ebayTitle = [brand.toUpperCase(), productName.toUpperCase(), strength, packSize]
        .filter(Boolean).join(" ").slice(0, 80);

      const ebayDescParts: string[] = [];
      if (gen.description || gen.description_html) {
        ebayDescParts.push(gen.description_html || `<p>${gen.description}</p>`);
      }
      if (gen.directions_summary) ebayDescParts.push(`<h3>Directions</h3><p>${gen.directions_summary}</p>`);
      if (gen.ingredients_summary) ebayDescParts.push(`<h3>Ingredients</h3><p>${gen.ingredients_summary}</p>`);
      if (gen.warnings_summary) ebayDescParts.push(`<h3>Warnings</h3><p>${gen.warnings_summary}</p>`);

      const ebayDraftData = {
        title: ebayTitle, subtitle: gen.subtitle || null,
        brand, description_html: ebayDescParts.join("\n") || null,
        mpn: gen.mpn || null, epid: gen.epid || null, upc: gen.upc || null,
        ean: (product.barcode as string) || null, category_id: gen.ebay_category_id || null,
      };
      await upsertEbayDraft(product.id as string, ebayDraftData);

      const shopifyTitle = gen.normalized_product_name || product.source_product_name || "";
      const handle = (shopifyTitle as string).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const shopifyDesc = ebayDescParts.join("\n") || null;
      const seoTitle = ((shopifyTitle as string) + (brand ? ` | ${brand}` : "")).slice(0, 70);
      const seoDesc = (gen.claims_summary || gen.description || shopifyTitle as string).slice(0, 160);

      const shopifyDraftData = {
        title: shopifyTitle, handle, vendor: brand || null,
        product_type: gen.product_type || product.z_category || null,
        description_html: shopifyDesc, seo_title: seoTitle, seo_description: seoDesc,
        tags: gen.suggested_tags || gen.tags || null,
      };
      await upsertShopifyDraft(product.id as string, shopifyDraftData);

      queryClient.invalidateQueries({ queryKey: ["product", product.id] });
      queryClient.invalidateQueries({ queryKey: ["ebay-draft", product.id] });
      queryClient.invalidateQueries({ queryKey: ["shopify-draft", product.id] });
      toast.success("Enrichment complete — product, eBay & Shopify drafts updated");
    },
    onError: (err: Error) => toast.error("Enrichment failed", { description: err.message }),
  });

  return (
    <div className="space-y-4">
      <SourcePagesPanel product={product} />
      <EnrichmentImageUpload productId={product.id as string} />

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <Badge variant={product.enrichment_status === "complete" ? "default" : "outline"}>
              {(product.enrichment_status as string) || "pending"}
            </Badge>
            {product.enrichment_confidence && (
              <Badge variant="outline">{product.enrichment_confidence as string} confidence</Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => enrichMutation.mutate()}
              disabled={enrichMutation.isPending}
            >
              {enrichMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1" />
              )}
              {enrichMutation.isPending ? "Enriching..." : "Run Enrichment"}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Enrichment pipeline will search trusted sources to fill in product details, images, and category suggestions.
          </p>

          <Separator />

          <AiDescriptionGenerator productId={product.id as string} target="general" />

          {product.enrichment_summary && (() => {
            const s = product.enrichment_summary as Record<string, unknown>;
            const fields: { label: string; key: string; type?: "text" | "html" | "tags" }[] = [
              { label: "Title", key: "title" },
              { label: "Subtitle", key: "subtitle" },
              { label: "Brand", key: "brand" },
              { label: "Product Type", key: "product_type" },
              { label: "Product Form", key: "product_form" },
              { label: "Description", key: "description", type: "html" },
              { label: "Ingredients", key: "ingredients_summary" },
              { label: "Directions", key: "directions_summary" },
              { label: "Warnings", key: "warnings_summary" },
              { label: "Claims", key: "claims_summary" },
              { label: "SEO Title", key: "seo_title" },
              { label: "SEO Description", key: "seo_description" },
              { label: "eBay Category ID", key: "ebay_category_id" },
              { label: "UPC", key: "upc" },
              { label: "EPID", key: "epid" },
              { label: "MPN", key: "mpn" },
              { label: "Tags", key: "tags", type: "tags" },
              { label: "Suggested Tags", key: "suggested_tags", type: "tags" },
            ];
            return (
              <Card className="mt-4 border-primary/20 bg-primary/5">
                <CardContent className="pt-4 space-y-3">
                  <span className="text-xs font-semibold uppercase text-primary">Last Enrichment Result</span>
                  {fields.map(({ label, key, type }) => {
                    const val = s[key];
                    if (!val || (Array.isArray(val) && val.length === 0)) return null;
                    if (type === "tags") {
                      return (
                        <div key={key}>
                          <span className="text-[10px] uppercase text-muted-foreground font-medium">{label}</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(val as string[]).map((t: string, i: number) => (
                              <Badge key={i} variant="outline" className="text-[10px]">{t}</Badge>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    if (type === "html") {
                      return (
                        <div key={key}>
                          <span className="text-[10px] uppercase text-muted-foreground font-medium">{label}</span>
                          <div className="text-sm mt-1 prose prose-sm max-w-none dark:prose-invert border rounded-md p-3 bg-background" dangerouslySetInnerHTML={{ __html: sanitizeHtml(val as string) }} />
                        </div>
                      );
                    }
                    return (
                      <div key={key}>
                        <span className="text-[10px] uppercase text-muted-foreground font-medium">{label}</span>
                        <p className="text-sm">{String(val)}</p>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
