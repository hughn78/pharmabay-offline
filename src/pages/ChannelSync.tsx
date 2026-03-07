import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, ShoppingCart, Store, AlertCircle, CheckCircle, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function ChannelSync() {
  const { data: ebayJobs = [] } = useQuery({
    queryKey: ["ebay-publish-jobs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ebay_publish_jobs")
        .select("*")
        .order("submitted_at", { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  const { data: shopifyJobs = [] } = useQuery({
    queryKey: ["shopify-write-jobs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("shopify_write_jobs")
        .select("*")
        .order("queued_at", { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Channel Sync</h1>
        <p className="text-muted-foreground text-sm">Monitor eBay and Shopify publishing</p>
      </div>

      <Tabs defaultValue="ebay">
        <TabsList>
          <TabsTrigger value="ebay" className="gap-2">
            <ShoppingCart className="h-4 w-4" /> eBay
          </TabsTrigger>
          <TabsTrigger value="shopify" className="gap-2">
            <Store className="h-4 w-4" /> Shopify
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ebay" className="mt-4">
          <JobList jobs={ebayJobs} platform="ebay" />
        </TabsContent>

        <TabsContent value="shopify" className="mt-4">
          <JobList jobs={shopifyJobs} platform="shopify" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function JobList({ jobs, platform }: { jobs: any[]; platform: string }) {
  if (jobs.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <RefreshCw className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No {platform} sync jobs yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y">
          {jobs.map((job: any) => (
            <div key={job.id} className="flex items-center justify-between p-4">
              <div>
                <div className="font-medium text-sm">
                  {platform === "ebay" ? (job.ebay_listing_id || job.ebay_inventory_sku || "Pending") : (job.shopify_product_gid || "Pending")}
                </div>
                <div className="text-xs text-muted-foreground">
                  {job.operation_type || job.publish_mode || "publish"} •{" "}
                  {new Date(job.submitted_at || job.queued_at).toLocaleString()}
                </div>
                {job.error_message && (
                  <div className="text-xs text-destructive mt-1">{job.error_message}</div>
                )}
              </div>
              <StatusBadge status={job.publish_status || job.status} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const config: Record<string, { icon: any; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    queued: { icon: Clock, variant: "outline" },
    processing: { icon: RefreshCw, variant: "secondary" },
    success: { icon: CheckCircle, variant: "default" },
    failed: { icon: AlertCircle, variant: "destructive" },
  };
  const c = config[status || ""] || config.queued;
  return (
    <Badge variant={c.variant} className="text-[10px] gap-1">
      <c.icon className="h-3 w-3" />
      {status || "unknown"}
    </Badge>
  );
}
