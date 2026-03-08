import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Save } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AiDescriptionGenerator } from "@/components/ai/AiDescriptionGenerator";
import { LiveOnlineStateCard } from "@/components/products/LiveOnlineStateCard";
import { FormField } from "./FormField";

interface ShopifyTabProps {
  product: Record<string, unknown>;
  draft: Record<string, unknown> | null;
}

export function ShopifyTab({ product, draft }: ShopifyTabProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    title: (draft?.title as string) || "",
    handle: (draft?.handle as string) || "",
    vendor: (draft?.vendor as string) || "",
    product_type: (draft?.product_type as string) || "",
    product_category: (draft?.product_category as string) || "",
    description_html: (draft?.description_html as string) || "",
    seo_title: (draft?.seo_title as string) || "",
    seo_description: (draft?.seo_description as string) || "",
    google_product_category: (draft?.google_product_category as string) || "",
  });

  useEffect(() => {
    if (draft) {
      setForm({
        title: (draft.title as string) || "",
        handle: (draft.handle as string) || "",
        vendor: (draft.vendor as string) || "",
        product_type: (draft.product_type as string) || "",
        product_category: (draft.product_category as string) || "",
        description_html: (draft.description_html as string) || "",
        seo_title: (draft.seo_title as string) || "",
        seo_description: (draft.seo_description as string) || "",
        google_product_category: (draft.google_product_category as string) || "",
      });
    }
  }, [draft]);

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const saveDraft = useMutation({
    mutationFn: async () => {
      const payload = { ...form, product_id: product.id as string, updated_at: new Date().toISOString() };
      if (draft?.id) {
        const { error } = await supabase.from("shopify_drafts").update(payload).eq("id", draft.id as string);
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
        .eq("id", draft.id as string);
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
      <LiveOnlineStateCard productId={product.id as string} channel="shopify" draft={draft} />
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant={draft?.channel_status === "ready" ? "default" : "outline"}>
              {(draft?.channel_status as string) || "No Draft"}
            </Badge>
            {draft?.shopify_product_gid && (
              <Badge variant="outline" className="font-mono text-[10px]">{draft.shopify_product_gid as string}</Badge>
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

          <AiDescriptionGenerator productId={product.id as string} target="shopify" />

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
