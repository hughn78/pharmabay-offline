import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Save,
  Package,
  Sparkles,
  Image,
  ShoppingCart,
  Store,
  FileText,
  Loader2,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UniversalImageIntake } from "@/components/images/UniversalImageIntake";
import { EbayPricingPanel } from "@/components/ebay/EbayPricingPanel";
import { EbayPublishPanel } from "@/components/ebay/EbayPublishPanel";
import { AiDescriptionGenerator } from "@/components/ai/AiDescriptionGenerator";
import { LiveListingPanel } from "@/components/channel-imports/LiveListingPanel";
import { LiveOnlineStateCard } from "@/components/products/LiveOnlineStateCard";

export default function ProductEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: product, isLoading } = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: ebayDraft } = useQuery({
    queryKey: ["ebay-draft", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("ebay_drafts")
        .select("*")
        .eq("product_id", id)
        .maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: shopifyDraft } = useQuery({
    queryKey: ["shopify-draft", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("shopify_drafts")
        .select("*")
        .eq("product_id", id)
        .maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: images = [] } = useQuery({
    queryKey: ["product-images", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("product_images")
        .select("*")
        .eq("product_id", id)
        .order("sort_order");
      return data || [];
    },
    enabled: !!id,
  });

  const updateProduct = useMutation({
    mutationFn: async (updates: any) => {
      const { error } = await supabase
        .from("products")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product", id] });
      toast.success("Product saved");
    },
    onError: (err) => toast.error("Save failed", { description: String(err) }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading product...
      </div>
    );
  }

  if (!product) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Product not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/products")}>
          Back to Products
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/products")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold tracking-tight truncate">
            {product.source_product_name || "Untitled Product"}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            {product.barcode && (
              <Badge variant="outline" className="font-mono text-xs">{product.barcode}</Badge>
            )}
            <ComplianceBadge status={product.compliance_status} />
          </div>
        </div>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="flex-wrap">
          <TabsTrigger value="general" className="gap-1.5"><Package className="h-3.5 w-3.5" /> General</TabsTrigger>
          <TabsTrigger value="enrichment" className="gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Enrichment</TabsTrigger>
          <TabsTrigger value="images" className="gap-1.5"><Image className="h-3.5 w-3.5" /> Images</TabsTrigger>
          <TabsTrigger value="ebay" className="gap-1.5"><ShoppingCart className="h-3.5 w-3.5" /> eBay</TabsTrigger>
          <TabsTrigger value="shopify" className="gap-1.5"><Store className="h-3.5 w-3.5" /> Shopify</TabsTrigger>
          <TabsTrigger value="live" className="gap-1.5">🌐 Live Online</TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4">
          <GeneralTab product={product} onSave={(updates: any) => updateProduct.mutate(updates)} />
        </TabsContent>

        <TabsContent value="enrichment" className="mt-4">
          <EnrichmentTab product={product} />
        </TabsContent>

        <TabsContent value="images" className="mt-4">
          <ImagesTab images={images} productId={id!} />
        </TabsContent>

        <TabsContent value="ebay" className="mt-4">
          <EbayTab product={product} draft={ebayDraft} />
        </TabsContent>

        <TabsContent value="shopify" className="mt-4">
          <ShopifyTab product={product} draft={shopifyDraft} />
        </TabsContent>

        <TabsContent value="live" className="mt-4">
          <LiveListingPanel productId={id!} />
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <AuditTab productId={id!} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GeneralTab({ product, onSave }: { product: any; onSave: (u: any) => void }) {
  const [form, setForm] = useState({
    source_product_name: product.source_product_name || "",
    barcode: product.barcode || "",
    sku: product.sku || "",
    brand: product.brand || "",
    department: product.department || "",
    z_category: product.z_category || "",
    cost_price: product.cost_price || "",
    sell_price: product.sell_price || "",
    stock_on_hand: product.stock_on_hand || "",
    weight_grams: product.weight_grams || 200,
    notes_internal: product.notes_internal || "",
  });

  const handleChange = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Product Name" value={form.source_product_name} onChange={(v) => handleChange("source_product_name", v)} />
          <FormField label="Barcode" value={form.barcode} onChange={(v) => handleChange("barcode", v)} mono />
          <FormField label="SKU" value={form.sku} onChange={(v) => handleChange("sku", v)} mono />
          <FormField label="Brand" value={form.brand} onChange={(v) => handleChange("brand", v)} />
          <FormField label="Department" value={form.department} onChange={(v) => handleChange("department", v)} />
          <FormField label="Category" value={form.z_category} onChange={(v) => handleChange("z_category", v)} />
          <FormField label="Cost Price" value={form.cost_price} onChange={(v) => handleChange("cost_price", v)} type="number" />
          <FormField label="Sell Price / RRP" value={form.sell_price} onChange={(v) => handleChange("sell_price", v)} type="number" />
          <FormField label="Stock on Hand" value={form.stock_on_hand} onChange={(v) => handleChange("stock_on_hand", v)} type="number" />
          <FormField label="Weight (grams)" value={form.weight_grams} onChange={(v) => handleChange("weight_grams", v)} type="number" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">Internal Notes</Label>
          <Textarea
            value={form.notes_internal}
            onChange={(e) => handleChange("notes_internal", e.target.value)}
            placeholder="Staff notes..."
            rows={3}
          />
        </div>
        <Button onClick={() => onSave(form)}>
          <Save className="h-4 w-4 mr-2" /> Save Product
        </Button>
      </CardContent>
    </Card>
  );
}

function EnrichmentTab({ product }: { product: any }) {
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

      // 1. Update master product
      const updates: any = {
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

      const { error } = await supabase.from("products").update(updates).eq("id", product.id);
      if (error) throw error;

      // 2. Build eBay title from enriched data
      const productName = gen.normalized_product_name || product.source_product_name || "";
      const brand = gen.brand || product.brand || "";
      const strength = product.strength || "";
      const packSize = product.pack_size || "";
      const ebayTitle = [brand.toUpperCase(), productName.toUpperCase(), strength, packSize]
        .filter(Boolean).join(" ").slice(0, 80);

      // Build description HTML for eBay
      const ebayDescParts: string[] = [];
      if (gen.description || gen.description_html) {
        ebayDescParts.push(gen.description_html || `<p>${gen.description}</p>`);
      }
      if (gen.directions_summary) {
        ebayDescParts.push(`<h3>Directions</h3><p>${gen.directions_summary}</p>`);
      }
      if (gen.ingredients_summary) {
        ebayDescParts.push(`<h3>Ingredients</h3><p>${gen.ingredients_summary}</p>`);
      }
      if (gen.warnings_summary) {
        ebayDescParts.push(`<h3>Warnings</h3><p>${gen.warnings_summary}</p>`);
      }

      const ebayDraft: any = {
        product_id: product.id,
        title: ebayTitle,
        subtitle: gen.subtitle || null,
        brand: brand,
        description_html: ebayDescParts.join("\n") || null,
        mpn: gen.mpn || null,
        epid: gen.epid || null,
        upc: gen.upc || null,
        ean: product.barcode || null,
        category_id: gen.ebay_category_id || null,
        updated_at: now,
      };

      // Upsert eBay draft
      const { data: existingEbay } = await supabase
        .from("ebay_drafts").select("id").eq("product_id", product.id).maybeSingle();
      if (existingEbay?.id) {
        await supabase.from("ebay_drafts").update(ebayDraft).eq("id", existingEbay.id);
      } else {
        await supabase.from("ebay_drafts").insert(ebayDraft);
      }

      // 3. Build Shopify draft
      const shopifyTitle = gen.normalized_product_name || product.source_product_name || "";
      const handle = shopifyTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const shopifyDesc = ebayDescParts.join("\n") || null;
      const seoTitle = (shopifyTitle + (brand ? ` | ${brand}` : "")).slice(0, 70);
      const seoDesc = (gen.claims_summary || gen.description || shopifyTitle).slice(0, 160);

      const shopifyDraft: any = {
        product_id: product.id,
        title: shopifyTitle,
        handle,
        vendor: brand || null,
        product_type: gen.product_type || product.z_category || null,
        description_html: shopifyDesc,
        seo_title: seoTitle,
        seo_description: seoDesc,
        tags: gen.suggested_tags || gen.tags || null,
        updated_at: now,
      };

      const { data: existingShopify } = await supabase
        .from("shopify_drafts").select("id").eq("product_id", product.id).maybeSingle();
      if (existingShopify?.id) {
        await supabase.from("shopify_drafts").update(shopifyDraft).eq("id", existingShopify.id);
      } else {
        await supabase.from("shopify_drafts").insert(shopifyDraft);
      }

      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ["product", product.id] });
      queryClient.invalidateQueries({ queryKey: ["ebay-draft", product.id] });
      queryClient.invalidateQueries({ queryKey: ["shopify-draft", product.id] });
      toast.success("Enrichment complete — product, eBay & Shopify drafts updated");
    },
    onError: (err: Error) => toast.error("Enrichment failed", { description: err.message }),
  });

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center gap-3 mb-4">
          <Badge variant={product.enrichment_status === "complete" ? "default" : "outline"}>
            {product.enrichment_status || "pending"}
          </Badge>
          {product.enrichment_confidence && (
            <Badge variant="outline">{product.enrichment_confidence} confidence</Badge>
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

        <AiDescriptionGenerator productId={product.id} target="general" />

        {product.enrichment_summary && (() => {
          const s = product.enrichment_summary as Record<string, any>;
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
                        <div className="text-sm mt-1 prose prose-sm max-w-none dark:prose-invert border rounded-md p-3 bg-background" dangerouslySetInnerHTML={{ __html: val }} />
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
  );
}

function ImagesTab({ images, productId }: { images: any[]; productId: string }) {
  return <UniversalImageIntake images={images} productId={productId} />;
}
function EbayTab({ product, draft }: { product: any; draft: any }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    title: draft?.title || "",
    subtitle: draft?.subtitle || "",
    category_id: draft?.category_id || "",
    epid: draft?.epid || "",
    mpn: draft?.mpn || "",
    buy_it_now_price: draft?.buy_it_now_price || "",
    description_html: draft?.description_html || "",
  });

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const charCount = form.title.length;

  const saveDraft = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        buy_it_now_price: form.buy_it_now_price ? Number(form.buy_it_now_price) : null,
        product_id: product.id,
        updated_at: new Date().toISOString(),
      };
      if (draft?.id) {
        const { error } = await supabase.from("ebay_drafts").update(payload).eq("id", draft.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ebay_drafts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ebay-draft", product.id] });
      toast.success("eBay draft saved");
    },
    onError: (err) => toast.error("Save failed", { description: String(err) }),
  });

  const markReady = useMutation({
    mutationFn: async () => {
      if (!draft?.id) {
        throw new Error("Save the draft first before marking ready");
      }
      const { error } = await supabase
        .from("ebay_drafts")
        .update({ channel_status: "ready", updated_at: new Date().toISOString() })
        .eq("id", draft.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ebay-draft", product.id] });
      toast.success("Marked as ready");
    },
    onError: (err) => toast.error("Failed", { description: String(err) }),
  });

  return (
    <div className="space-y-4">
      <LiveOnlineStateCard productId={product.id} channel="ebay" draft={draft} />
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant={draft?.channel_status === "ready" ? "default" : "outline"}>
              {draft?.channel_status || "No Draft"}
            </Badge>
            {draft?.published_listing_id && (
              <Badge variant="outline" className="text-[10px] font-mono">Item# {draft.published_listing_id}</Badge>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm">eBay Title</Label>
              <span className={`text-xs ${charCount > 80 ? "text-destructive" : "text-muted-foreground"}`}>
                {charCount}/80
              </span>
            </div>
          <Input value={form.title} onChange={(e) => handleChange("title", e.target.value)} placeholder="Brand + Product + Strength + Form + Pack Size" />
        </div>

        <FormField label="Subtitle" value={form.subtitle} onChange={(v) => handleChange("subtitle", v)} />
        <FormField label="Category ID" value={form.category_id} onChange={(v) => handleChange("category_id", v)} />
        <FormField label="ePID" value={form.epid} onChange={(v) => handleChange("epid", v)} />
        <FormField label="MPN" value={form.mpn} onChange={(v) => handleChange("mpn", v)} />
        <FormField label="Buy It Now Price" value={form.buy_it_now_price} onChange={(v) => handleChange("buy_it_now_price", v)} type="number" />

        <EbayPricingPanel
          costPrice={Number(product.cost_price || 0)}
          rrp={Number(product.sell_price || 0)}
          ebayPrice={Number(form.buy_it_now_price || 0)}
          compMedian={null}
          defaultMarkup={30}
          minMargin={15}
        />

        <div className="space-y-1.5">
          <Label className="text-sm">Description (HTML)</Label>
          <Textarea value={form.description_html} onChange={(e) => handleChange("description_html", e.target.value)} rows={6} placeholder="Product description..." />
        </div>

        <AiDescriptionGenerator productId={product.id} target="ebay" />

        <div className="flex gap-2">
          <Button onClick={() => saveDraft.mutate()} disabled={saveDraft.isPending}>
            <Save className="h-4 w-4 mr-2" /> Save eBay Draft
          </Button>
          <Button variant="outline" onClick={() => markReady.mutate()} disabled={markReady.isPending}>
            Mark Ready
          </Button>
        </div>
      </CardContent>
    </Card>

      <EbayPublishPanel productId={product.id} product={product} draft={draft} />
    </div>
  );
}

function ShopifyTab({ product, draft }: { product: any; draft: any }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    title: draft?.title || "",
    handle: draft?.handle || "",
    vendor: draft?.vendor || "",
    product_type: draft?.product_type || "",
    product_category: draft?.product_category || "",
    description_html: draft?.description_html || "",
    seo_title: draft?.seo_title || "",
    seo_description: draft?.seo_description || "",
    google_product_category: draft?.google_product_category || "",
  });

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const saveDraft = useMutation({
    mutationFn: async () => {
      const payload = { ...form, product_id: product.id, updated_at: new Date().toISOString() };
      if (draft?.id) {
        const { error } = await supabase.from("shopify_drafts").update(payload).eq("id", draft.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("shopify_drafts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopify-draft", product.id] });
      toast.success("Shopify draft saved");
    },
    onError: (err) => toast.error("Save failed", { description: String(err) }),
  });

  const markReady = useMutation({
    mutationFn: async () => {
      if (!draft?.id) throw new Error("Save the draft first");
      const { error } = await supabase
        .from("shopify_drafts")
        .update({ channel_status: "ready", updated_at: new Date().toISOString() })
        .eq("id", draft.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopify-draft", product.id] });
      toast.success("Marked as ready");
    },
    onError: (err) => toast.error("Failed", { description: String(err) }),
  });

  return (
    <div className="space-y-4">
      <LiveOnlineStateCard productId={product.id} channel="shopify" draft={draft} />
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant={draft?.channel_status === "ready" ? "default" : "outline"}>
              {draft?.channel_status || "No Draft"}
            </Badge>
            {draft?.shopify_product_gid && (
              <Badge variant="outline" className="font-mono text-[10px]">{draft.shopify_product_gid}</Badge>
            )}
          </div>

          <FormField label="Title" value={form.title} onChange={(v) => handleChange("title", v)} />
        <FormField label="Handle" value={form.handle} onChange={(v) => handleChange("handle", v)} />
        <FormField label="Vendor" value={form.vendor} onChange={(v) => handleChange("vendor", v)} />
        <FormField label="Product Type" value={form.product_type} onChange={(v) => handleChange("product_type", v)} />
        <FormField label="Product Category" value={form.product_category} onChange={(v) => handleChange("product_category", v)} />

        <div className="space-y-1.5">
          <Label className="text-sm">Description (HTML)</Label>
          <Textarea value={form.description_html} onChange={(e) => handleChange("description_html", e.target.value)} rows={4} />
        </div>

        <Separator />
        <h4 className="font-medium text-sm">SEO</h4>
        <FormField label="SEO Title" value={form.seo_title} onChange={(v) => handleChange("seo_title", v)} />
        <FormField label="SEO Description" value={form.seo_description} onChange={(v) => handleChange("seo_description", v)} />

        <Separator />
        <h4 className="font-medium text-sm">Google Shopping</h4>
        <FormField label="Google Product Category" value={form.google_product_category} onChange={(v) => handleChange("google_product_category", v)} />

        <AiDescriptionGenerator productId={product.id} target="shopify" />

        <div className="flex gap-2">
          <Button onClick={() => saveDraft.mutate()} disabled={saveDraft.isPending}>
            <Save className="h-4 w-4 mr-2" /> Save Shopify Draft
          </Button>
          <Button variant="outline" onClick={() => markReady.mutate()} disabled={markReady.isPending}>
            Mark Ready
          </Button>
        </div>
      </CardContent>
    </Card>
    </div>
  );
}

function AuditTab({ productId }: { productId: string }) {
  const { data: logs = [] } = useQuery({
    queryKey: ["product-audit", productId],
    queryFn: async () => {
      const { data } = await supabase
        .from("change_log")
        .select("*")
        .eq("entity_id", productId)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  return (
    <Card>
      <CardContent className="pt-6">
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No audit history for this product.</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log: any) => (
              <div key={log.id} className="flex items-start gap-3 p-2 border rounded text-sm">
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(log.created_at).toLocaleString()}
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">{log.action}</Badge>
                <div className="text-xs truncate flex-1">
                  {log.after_json ? JSON.stringify(log.after_json).slice(0, 100) : "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FormField({ label, value, onChange, type = "text", mono = false }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; mono?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        className={mono ? "font-mono" : ""}
      />
    </div>
  );
}

function ComplianceBadge({ status }: { status?: string }) {
  if (!status) return null;
  const cls = status === "blocked" ? "status-blocked" : status === "review_required" ? "status-review" : "status-permitted";
  return <Badge className={`text-[10px] ${cls}`}>{status.replace("_", " ")}</Badge>;
}
