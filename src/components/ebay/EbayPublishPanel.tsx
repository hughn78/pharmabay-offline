import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Loader2, Rocket, RefreshCw, ExternalLink, CheckCircle, XCircle, AlertTriangle,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  productId: string;
  product: any;
  draft: any;
}

export function EbayPublishPanel({ productId, product, draft }: Props) {
  const queryClient = useQueryClient();

  const { data: ebayStatus } = useQuery({
    queryKey: ["ebay-connection-status"],
    queryFn: async () => {
      const res = await supabase.functions.invoke("ebay-auth", {
        body: { action: "get_status" },
      });
      return res.data;
    },
    staleTime: 60000,
  });

  const { data: recentJobs = [] } = useQuery({
    queryKey: ["ebay-jobs", productId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ebay_publish_jobs")
        .select("*")
        .eq("product_id", productId)
        .order("submitted_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!productId,
  });

  const { data: approvedImages = [] } = useQuery({
    queryKey: ["ebay-approved-images", productId],
    queryFn: async () => {
      const { data } = await supabase
        .from("product_images")
        .select("id")
        .eq("product_id", productId)
        .eq("ebay_approved", true);
      return data || [];
    },
    enabled: !!productId,
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      const res = await supabase.functions.invoke("ebay-inventory", {
        body: {
          action: "publish_product",
          product_id: productId,
          draft_id: draft?.id,
        },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`Published to eBay! Listing ID: ${data.listingId}`);
      queryClient.invalidateQueries({ queryKey: ["ebay-draft", productId] });
      queryClient.invalidateQueries({ queryKey: ["ebay-jobs", productId] });
    },
    onError: (err: Error) => toast.error(`Publish failed: ${err.message}`),
  });

  // Validation checks
  const isConnected = ebayStatus?.connected;
  const hasPolicies =
    !!ebayStatus?.merchant_location_key &&
    !!ebayStatus?.fulfillment_policy_id &&
    !!ebayStatus?.payment_policy_id &&
    !!ebayStatus?.return_policy_id;

  const sku = draft?.ebay_inventory_sku || product?.sku || product?.barcode;
  const title = draft?.title || product?.source_product_name || "";
  const price = draft?.buy_it_now_price || draft?.start_price || 0;
  const categoryId = draft?.category_id;
  const quantity = product?.quantity_available_for_ebay ??
    Math.max(0, (product?.stock_on_hand || 0) - (product?.quantity_reserved_for_store || 0));
  const conditionId = draft?.condition_id || "1000";
  const isBlocked = product?.compliance_status === "blocked";
  const isPublished = draft?.channel_status === "published";

  const checks = [
    { label: "eBay connected", ok: !!isConnected },
    { label: "Business policies configured", ok: hasPolicies },
    { label: "SKU exists", ok: !!sku },
    { label: "Title exists (≤ 80 chars)", ok: !!title && title.length <= 80 },
    { label: "Price > 0", ok: price > 0 },
    { label: "Quantity > 0", ok: quantity > 0 },
    { label: "Category ID set", ok: !!categoryId },
    { label: "Condition ID set", ok: !!conditionId },
    { label: "Compliance not blocked", ok: !isBlocked },
  ];

  const allValid = checks.every((c) => c.ok);

  return (
    <Card className="border-primary/20">
      <CardContent className="pt-4 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">eBay Publishing</h4>
          <div className="flex items-center gap-2">
            {draft?.ebay_offer_id && (
              <Badge variant="outline" className="font-mono text-[10px]">
                Offer: {draft.ebay_offer_id}
              </Badge>
            )}
            {draft?.published_listing_id && (
              <Badge variant="outline" className="font-mono text-[10px]">
                Item# {draft.published_listing_id}
              </Badge>
            )}
          </div>
        </div>

        {draft?.ebay_listing_url && (
          <a
            href={draft.ebay_listing_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" /> View on eBay
          </a>
        )}

        {draft?.ebay_last_error && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-xs">
            <strong>Last error:</strong> {draft.ebay_last_error.slice(0, 200)}
          </div>
        )}

        <Separator />

        {/* Validation Checklist */}
        <div className="space-y-1.5">
          <span className="text-xs font-semibold uppercase text-muted-foreground">
            Pre-publish Validation
          </span>
          <div className="grid grid-cols-1 gap-1">
            {checks.map((c) => (
              <div key={c.label} className="flex items-center gap-2 text-xs">
                {c.ok ? (
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-destructive" />
                )}
                <span className={c.ok ? "text-muted-foreground" : "text-destructive font-medium"}>
                  {c.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {isPublished ? (
            <Button
              onClick={() => publishMutation.mutate()}
              disabled={publishMutation.isPending || !allValid}
              variant="outline"
            >
              {publishMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Update eBay Listing
            </Button>
          ) : (
            <Button
              onClick={() => publishMutation.mutate()}
              disabled={publishMutation.isPending || !allValid}
            >
              {publishMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4" />
              )}
              Publish to eBay
            </Button>
          )}
        </div>

        {/* Recent Jobs */}
        {recentJobs.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1.5">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Recent Jobs</span>
              <div className="space-y-1">
                {recentJobs.map((job: any) => (
                  <div key={job.id} className="flex items-center justify-between text-xs border rounded px-3 py-1.5">
                    <span className="text-muted-foreground">
                      {job.operation_type || job.publish_mode} • {new Date(job.submitted_at).toLocaleString()}
                    </span>
                    <Badge
                      variant={
                        job.publish_status === "success"
                          ? "default"
                          : job.publish_status === "failed"
                          ? "destructive"
                          : "secondary"
                      }
                      className="text-[9px]"
                    >
                      {job.publish_status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
