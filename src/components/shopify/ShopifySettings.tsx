import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Store, RefreshCw, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";

export function ShopifySettings() {
  const queryClient = useQueryClient();
  const [shopDomain, setShopDomain] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [apiVersion, setApiVersion] = useState("2024-01");

  const { data: connection, isLoading } = useQuery({
    queryKey: ["shopify-connection"],
    queryFn: async () => {
      const { data } = await supabase
        .from("shopify_connections")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (data) {
        setShopDomain(data.shop_domain || "");
        setApiVersion(data.api_version || "2024-01");
      }
      return data;
    },
  });

  const { data: syncRuns = [] } = useQuery({
    queryKey: ["shopify-sync-runs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("shopify_sync_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(5);
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("shopify-connect", {
        body: {
          action: "save",
          shop_domain: shopDomain,
          access_token: accessToken || undefined,
          api_version: apiVersion,
        },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Shopify connection saved");
      setAccessToken("");
      queryClient.invalidateQueries({ queryKey: ["shopify-connection"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await supabase.functions.invoke("shopify-connect", {
        body: { action: "test" },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`Connected to ${data.shop?.name || "Shopify"}`);
      queryClient.invalidateQueries({ queryKey: ["shopify-connection"] });
    },
    onError: (err: Error) => toast.error(`Connection failed: ${err.message}`),
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await supabase.functions.invoke("shopify-sync-products", {});
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(
        `Synced ${data.processed} products (${data.created} new, ${data.updated} updated)`
      );
      queryClient.invalidateQueries({ queryKey: ["shopify-sync-runs"] });
      queryClient.invalidateQueries({ queryKey: ["shopify-connection"] });
    },
    onError: (err: Error) => toast.error(`Sync failed: ${err.message}`),
  });

  const isConnected = connection?.last_sync_status === "connected" || connection?.last_sync_status === "synced";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Store className="h-4 w-4" /> Shopify Connection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            {isConnected ? (
              <Badge className="gap-1">
                <CheckCircle className="h-3 w-3" /> Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <AlertCircle className="h-3 w-3" /> Not Connected
              </Badge>
            )}
            {connection?.shop_name && (
              <span className="text-sm text-muted-foreground">{connection.shop_name}</span>
            )}
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label className="text-sm">Shop Domain</Label>
            <Input
              placeholder="my-pharmacy.myshopify.com"
              value={shopDomain}
              onChange={(e) => setShopDomain(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Admin API Access Token</Label>
            <Input
              type="password"
              placeholder={connection ? "••••••••  (leave blank to keep existing)" : "shpat_xxxxx"}
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              From Shopify Admin → Settings → Apps → Develop apps → Admin API access token
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">API Version</Label>
            <Input
              placeholder="2024-01"
              value={apiVersion}
              onChange={(e) => setApiVersion(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !shopDomain}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Connection
            </Button>
            <Button
              variant="outline"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending || !connection}
            >
              {testMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Test Connection
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Product Sync
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Pull products from Shopify into local database (read-only sync).
          </p>
          <Button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || !isConnected}
          >
            {syncMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Sync Products Now
          </Button>

          {syncRuns.length > 0 && (
            <div className="space-y-2 mt-4">
              <h4 className="text-sm font-medium">Recent Syncs</h4>
              <div className="space-y-1">
                {syncRuns.map((run: any) => (
                  <div
                    key={run.id}
                    className="flex items-center justify-between text-xs border rounded px-3 py-2"
                  >
                    <span className="text-muted-foreground">
                      {new Date(run.started_at).toLocaleString()}
                    </span>
                    <div className="flex items-center gap-2">
                      <span>{run.items_processed || 0} items</span>
                      <Badge
                        variant={
                          run.status === "completed"
                            ? "default"
                            : run.status === "running"
                            ? "secondary"
                            : "destructive"
                        }
                        className="text-[10px]"
                      >
                        {run.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
