import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Store, RefreshCw, CheckCircle, AlertCircle, Loader2, Package } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export function ShopifySettings() {
  const queryClient = useQueryClient();
  const [shopDomain, setShopDomain] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [apiVersion, setApiVersion] = useState("2024-01");

  // Inventory settings state
  const [locationId, setLocationId] = useState("");
  const [reserveBuffer, setReserveBuffer] = useState(0);
  const [inventorySyncMode, setInventorySyncMode] = useState("stock_minus_buffer");
  const [maxQtyCap, setMaxQtyCap] = useState<string>("");
  const [syncZeroStock, setSyncZeroStock] = useState(false);
  const [autoSyncMatchedOnly, setAutoSyncMatchedOnly] = useState(true);

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
        setLocationId(data.primary_location_id || "");
        setReserveBuffer((data as any).reserve_stock_buffer ?? 0);
        setInventorySyncMode((data as any).inventory_sync_mode ?? "stock_minus_buffer");
        setMaxQtyCap((data as any).max_qty_cap != null ? String((data as any).max_qty_cap) : "");
        setSyncZeroStock((data as any).sync_zero_stock ?? false);
        setAutoSyncMatchedOnly((data as any).auto_sync_matched_only ?? true);
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

  const saveInventorySettings = useMutation({
    mutationFn: async () => {
      if (!connection) throw new Error("No connection found");
      const { error } = await supabase
        .from("shopify_connections")
        .update({
          primary_location_id: locationId || null,
          reserve_stock_buffer: reserveBuffer,
          inventory_sync_mode: inventorySyncMode,
          max_qty_cap: maxQtyCap ? parseInt(maxQtyCap) : null,
          sync_zero_stock: syncZeroStock,
          auto_sync_matched_only: autoSyncMatchedOnly,
        } as any)
        .eq("id", connection.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Inventory settings saved");
      queryClient.invalidateQueries({ queryKey: ["shopify-connection"] });
    },
    onError: (err: Error) => toast.error(err.message),
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
              <Badge className="gap-1"><CheckCircle className="h-3 w-3" /> Connected</Badge>
            ) : (
              <Badge variant="outline" className="gap-1"><AlertCircle className="h-3 w-3" /> Not Connected</Badge>
            )}
            {connection?.shop_name && (
              <span className="text-sm text-muted-foreground">{connection.shop_name}</span>
            )}
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label className="text-sm">Shop Domain</Label>
            <Input placeholder="my-pharmacy.myshopify.com" value={shopDomain} onChange={(e) => setShopDomain(e.target.value)} />
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
            <Input placeholder="2024-01" value={apiVersion} onChange={(e) => setApiVersion(e.target.value)} />
          </div>

          <div className="flex gap-2">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !shopDomain}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Connection
            </Button>
            <Button variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending || !connection}>
              {testMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Test Connection
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Sync Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" /> Inventory Sync Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Default Shopify Location ID</Label>
            <Input placeholder="e.g. 12345678901" value={locationId} onChange={(e) => setLocationId(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              From Shopify Admin → Settings → Locations → click location → find the numeric ID in the URL
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Reserve Stock Buffer</Label>
            <Input type="number" min={0} value={reserveBuffer} onChange={(e) => setReserveBuffer(parseInt(e.target.value) || 0)} />
            <p className="text-xs text-muted-foreground">
              Units to hold back from Shopify (e.g. for in-store sales). Formula: push = max(0, stock_on_hand - buffer)
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Inventory Sync Mode</Label>
            <Select value={inventorySyncMode} onValueChange={setInventorySyncMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="exact_stock">Exact Stock</SelectItem>
                <SelectItem value="stock_minus_buffer">Stock − Reserve Buffer</SelectItem>
                <SelectItem value="capped_stock">Capped Stock</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {inventorySyncMode === "capped_stock" && (
            <div className="space-y-1.5">
              <Label className="text-sm">Maximum Quantity Cap</Label>
              <Input type="number" min={1} value={maxQtyCap} onChange={(e) => setMaxQtyCap(e.target.value)} placeholder="e.g. 99" />
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Sync Zero Stock to Shopify</Label>
              <p className="text-xs text-muted-foreground">Push qty=0 for out-of-stock items</p>
            </div>
            <Switch checked={syncZeroStock} onCheckedChange={setSyncZeroStock} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Auto-sync Matched Only</Label>
              <p className="text-xs text-muted-foreground">Only sync products with high-confidence matches</p>
            </div>
            <Switch checked={autoSyncMatchedOnly} onCheckedChange={setAutoSyncMatchedOnly} />
          </div>

          <Button onClick={() => saveInventorySettings.mutate()} disabled={saveInventorySettings.isPending}>
            {saveInventorySettings.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Inventory Settings
          </Button>
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
          <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending || !isConnected}>
            {syncMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Sync Products Now
          </Button>

          {syncRuns.length > 0 && (
            <div className="space-y-2 mt-4">
              <h4 className="text-sm font-medium">Recent Syncs</h4>
              <div className="space-y-1">
                {syncRuns.map((run: any) => (
                  <div key={run.id} className="flex items-center justify-between text-xs border rounded px-3 py-2">
                    <span className="text-muted-foreground">{new Date(run.started_at).toLocaleString()}</span>
                    <div className="flex items-center gap-2">
                      <span>{run.items_processed || 0} items</span>
                      <Badge
                        variant={run.status === "completed" ? "default" : run.status === "running" ? "secondary" : "destructive"}
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