import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Package,
  Sparkles,
  Image,
  ShoppingCart,
  Store,
  FileText,
} from "lucide-react";
import { GeneralTab } from "@/components/products/GeneralTab";
import { EnrichmentTab } from "@/components/product-editor/EnrichmentTab";
import { ImagesTab } from "@/components/product-editor/ImagesTab";
import { EbayTab } from "@/components/product-editor/EbayTab";
import { ShopifyTab } from "@/components/product-editor/ShopifyTab";
import { AuditTab } from "@/components/product-editor/AuditTab";
import { LiveListingPanel } from "@/components/channel-imports/LiveListingPanel";
import { ComplianceBadge } from "@/components/ui/ComplianceBadge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
    mutationFn: async (updates: Record<string, unknown>) => {
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
          <GeneralTab product={product} onSave={(updates: Record<string, unknown>) => updateProduct.mutate(updates)} isSaving={updateProduct.isPending} />
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
