import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Sparkles, Loader2, CheckCircle, Copy } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { sanitizeHtml } from "@/lib/sanitize";

interface Props {
  productId: string;
  target: "general" | "ebay" | "shopify";
  onApply?: (generated: any) => void;
}

export function AiDescriptionGenerator({ productId, target, onApply }: Props) {
  const [generated, setGenerated] = useState<any>(null);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await supabase.functions.invoke("ai-generate-description", {
        body: { product_id: productId, target },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      setGenerated(data.generated);
      toast.success("AI description generated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleApply = () => {
    if (generated && onApply) {
      onApply(generated);
      toast.success("AI content applied to form");
    }
  };

  const copyHtml = () => {
    const html = generated?.description_html || generated?.description || "";
    if (html) {
      navigator.clipboard.writeText(html);
      toast.success("Copied to clipboard");
    }
  };

  const targetLabel = target === "ebay" ? "eBay" : target === "shopify" ? "Shopify" : "Product";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="gap-1.5"
        >
          {generateMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Autogenerate {targetLabel} Description
        </Button>
        {generated && (
          <Badge variant="default" className="gap-1 text-[10px]">
            <CheckCircle className="h-3 w-3" /> Generated
          </Badge>
        )}
      </div>

      {generated && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-primary">AI Generated Content</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={copyHtml}>
                  <Copy className="h-3 w-3" /> Copy
                </Button>
                {onApply && (
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={handleApply}>
                    <CheckCircle className="h-3 w-3" /> Apply
                  </Button>
                )}
              </div>
            </div>

            {generated.title && (
              <div>
                <span className="text-[10px] uppercase text-muted-foreground font-medium">Title</span>
                <p className="text-sm font-medium">{generated.title}</p>
              </div>
            )}

            {generated.subtitle && (
              <div>
                <span className="text-[10px] uppercase text-muted-foreground font-medium">Subtitle</span>
                <p className="text-sm">{generated.subtitle}</p>
              </div>
            )}

            {(generated.description_html || generated.description) && (
              <div>
                <span className="text-[10px] uppercase text-muted-foreground font-medium">Description</span>
                <div
                  className="text-sm mt-1 prose prose-sm max-w-none dark:prose-invert border rounded-md p-3 bg-background"
                  dangerouslySetInnerHTML={{ __html: generated.description_html || generated.description || "" }}
                />
              </div>
            )}

            {generated.seo_title && (
              <div>
                <span className="text-[10px] uppercase text-muted-foreground font-medium">SEO Title</span>
                <p className="text-sm">{generated.seo_title}</p>
              </div>
            )}

            {generated.seo_description && (
              <div>
                <span className="text-[10px] uppercase text-muted-foreground font-medium">SEO Description</span>
                <p className="text-sm text-muted-foreground">{generated.seo_description}</p>
              </div>
            )}

            {(generated.tags || generated.suggested_tags) && (
              <div>
                <span className="text-[10px] uppercase text-muted-foreground font-medium">Tags</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(generated.tags || generated.suggested_tags || []).map((tag: string, i: number) => (
                    <Badge key={i} variant="outline" className="text-[10px]">{tag}</Badge>
                  ))}
                </div>
              </div>
            )}

            {generated.ingredients_summary && (
              <div>
                <span className="text-[10px] uppercase text-muted-foreground font-medium">Ingredients</span>
                <p className="text-xs text-muted-foreground mt-0.5">{generated.ingredients_summary}</p>
              </div>
            )}

            {generated.directions_summary && (
              <div>
                <span className="text-[10px] uppercase text-muted-foreground font-medium">Directions</span>
                <p className="text-xs text-muted-foreground mt-0.5">{generated.directions_summary}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
