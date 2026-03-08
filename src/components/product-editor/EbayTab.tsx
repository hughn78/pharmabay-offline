import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Save } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { EbayPricingPanel } from "@/components/ebay/EbayPricingPanel";
import { EbayPublishPanel } from "@/components/ebay/EbayPublishPanel";
import { AiDescriptionGenerator } from "@/components/ai/AiDescriptionGenerator";
import { LiveOnlineStateCard } from "@/components/products/LiveOnlineStateCard";
import { FormField } from "./FormField";

interface EbayTabProps {
  product: Record<string, unknown>;
  draft: Record<string, unknown> | null;
}

export function EbayTab({ product, draft }: EbayTabProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    title: draft?.title as string || "",
    subtitle: draft?.subtitle as string || "",
    category_id: draft?.category_id as string || "",
    epid: draft?.epid as string || "",
    mpn: draft?.mpn as string || "",
    buy_it_now_price: draft?.buy_it_now_price as string || "",
    description_html: draft?.description_html as string || "",
  });

  useEffect(() => {
    if (draft) {
      setForm({
        title: (draft.title as string) || "",
        subtitle: (draft.subtitle as string) || "",
        category_id: (draft.category_id as string) || "",
        epid: (draft.epid as string) || "",
        mpn: (draft.mpn as string) || "",
        buy_it_now_price: (draft.buy_it_now_price as string) || "",
        description_html: (draft.description_html as string) || "",
      });
    }
  }, [draft]);

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const charCount = form.title.length;

  const saveDraft = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        buy_it_now_price: form.buy_it_now_price ? Number(form.buy_it_now_price) : null,
        product_id: product.id as string,
        updated_at: new Date().toISOString(),
      };
      if (draft?.id) {
        const { error } = await supabase.from("ebay_drafts").update(payload).eq("id", draft.id as string);
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
      if (!draft?.id) throw new Error("Save the draft first before marking ready");
      const { error } = await supabase
        .from("ebay_drafts")
        .update({ channel_status: "ready", updated_at: new Date().toISOString() })
        .eq("id", draft.id as string);
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
      <LiveOnlineStateCard productId={product.id as string} channel="ebay" draft={draft} />
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant={draft?.channel_status === "ready" ? "default" : "outline"}>
              {(draft?.channel_status as string) || "No Draft"}
            </Badge>
            {draft?.published_listing_id && (
              <Badge variant="outline" className="text-[10px] font-mono">Item# {draft.published_listing_id as string}</Badge>
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

          <AiDescriptionGenerator productId={product.id as string} target="ebay" />

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

      <EbayPublishPanel productId={product.id as string} product={product} draft={draft} />
    </div>
  );
}
