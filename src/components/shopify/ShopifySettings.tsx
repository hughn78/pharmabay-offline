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
import { Store, RefreshCw, CheckCircle, AlertCircle, Loader2, Package, MapPin } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

const api = window.electronAPI;

// ── helpers ──────────────────────────────────────────────────────────────────

async function loadSetting(key: string): Promise<string> {
  const { data } = await api.getSetting(key);
  return data ?? '';
}

async function saveSetting(key: string, value: string): Promise<void> {
  await api.setSetting(key, value);
}

// ── component ─────────────────────────────────────────────────────────────────

export function ShopifySettings() {
  const [storeUrl, setStoreUrl] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [apiVersion, setApiVersion] = useState('2024-10');
  const [locationId, setLocationId] = useState('');
  const [reserveBuffer, setReserveBuffer] = useState(0);
  const [inventorySyncMode, setInventorySyncMode] = useState('stock_minus_buffer');
  const [maxQtyCap, setMaxQtyCap] = useState('');
  const [syncZeroStock, setSyncZeroStock] = useState(false);
  const [autoSyncMatchedOnly, setAutoSyncMatchedOnly] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [locations, setLocations] = useState<{ id: number; name: string }[]>([]);

  const [savingConn, setSavingConn] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savingInv, setSavingInv] = useState(false);
  const [loadingLocations, setLoadingLocations] = useState(false);

  const [syncRuns, setSyncRuns] = useState<any[]>([]);

  const loadSettings = useCallback(async () => {
    const [url, id, version, loc, buffer, mode, cap, zero, matched, tokenExpiry] = await Promise.all([
      loadSetting('shopify_store_url'),
      loadSetting('shopify_client_id'),
      loadSetting('shopify_api_version'),
      loadSetting('shopify_location_id'),
      loadSetting('shopify_reserve_buffer'),
      loadSetting('shopify_inventory_sync_mode'),
      loadSetting('shopify_max_qty_cap'),
      loadSetting('shopify_sync_zero_stock'),
      loadSetting('shopify_auto_sync_matched_only'),
      loadSetting('shopify_token_expires_at'),
    ]);
    setStoreUrl(url);
    setClientId(id);
    setApiVersion(version || '2024-10');
    setLocationId(loc);
    setReserveBuffer(parseInt(buffer) || 0);
    setInventorySyncMode(mode || 'stock_minus_buffer');
    setMaxQtyCap(cap);
    setSyncZeroStock(zero === 'true');
    setAutoSyncMatchedOnly(matched !== 'false');
    // Show connected if we have a non-expired token
    const expiry = parseFloat(tokenExpiry || '0');
    setIsConnected(expiry > Date.now() / 1000 + 60);
  }, []);

  const loadSyncRuns = useCallback(async () => {
    const { data } = await api.dbQuery('SELECT * FROM stock_sync_runs ORDER BY started_at DESC LIMIT 5', []);
    setSyncRuns(data ?? []);
  }, []);

  useEffect(() => {
    loadSettings();
    loadSyncRuns();
  }, [loadSettings, loadSyncRuns]);

  const saveConnection = async () => {
    setSavingConn(true);
    try {
      await Promise.all([
        saveSetting('shopify_store_url', storeUrl.trim()),
        saveSetting('shopify_client_id', clientId.trim()),
        saveSetting('shopify_api_version', apiVersion.trim() || '2024-10'),
        // Only overwrite client_secret if a new value was typed
        ...(clientSecret ? [saveSetting('shopify_client_secret', clientSecret.trim())] : []),
        // Clear cached token so it's re-acquired with new credentials
        ...(clientSecret ? [
          saveSetting('shopify_access_token', ''),
          saveSetting('shopify_token_expires_at', '0'),
        ] : []),
      ]);
      setClientSecret('');
      setIsConnected(false);
      toast.success('Shopify connection saved');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingConn(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const { data, error } = await api.shopifyTestAuth();
      if (error) throw new Error(error);
      setIsConnected(true);
      toast.success(`Connected — sample returned ${data!.sampleProductCount} product(s)`);
    } catch (e: any) {
      setIsConnected(false);
      toast.error(`Auth failed: ${e.message}`);
    } finally {
      setTesting(false);
    }
  };

  const fetchLocations = async () => {
    setLoadingLocations(true);
    try {
      const { data, error } = await api.shopifyGetLocations();
      if (error) throw new Error(error);
      setLocations(data ?? []);
      if ((data ?? []).length > 0 && !locationId) {
        setLocationId(String(data![0].id));
      }
      toast.success(`Found ${(data ?? []).length} location(s)`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoadingLocations(false);
    }
  };

  const syncProducts = async () => {
    setSyncing(true);
    try {
      const { data, error } = await api.shopifyRefreshProducts();
      if (error) throw new Error(error);
      toast.success(`Cached ${data!.refreshed} products (${data!.variants} variants) — ${data!.apiCalls} API calls`);
      loadSyncRuns();
    } catch (e: any) {
      toast.error(`Sync failed: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const saveInventorySettings = async () => {
    setSavingInv(true);
    try {
      await Promise.all([
        saveSetting('shopify_location_id', locationId),
        saveSetting('shopify_reserve_buffer', String(reserveBuffer)),
        saveSetting('shopify_inventory_sync_mode', inventorySyncMode),
        saveSetting('shopify_max_qty_cap', maxQtyCap),
        saveSetting('shopify_sync_zero_stock', String(syncZeroStock)),
        saveSetting('shopify_auto_sync_matched_only', String(autoSyncMatchedOnly)),
      ]);
      toast.success('Inventory settings saved');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingInv(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Connection ─────────────────────────────────────────────────── */}
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
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label className="text-sm">Shop Domain</Label>
            <Input
              placeholder="my-pharmacy.myshopify.com"
              value={storeUrl}
              onChange={(e) => setStoreUrl(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Client ID</Label>
            <Input
              placeholder="Shopify Dev Dashboard → App → Settings → Client ID"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Client Secret</Label>
            <Input
              type="password"
              placeholder={isConnected ? "••••••  (leave blank to keep existing)" : "Client secret from Dev Dashboard"}
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Shopify Dev Dashboard → App → Settings → Client secret. The app fetches a short-lived
              Admin API token automatically — no permanent shpat_ token needed.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">API Version</Label>
            <Input
              placeholder="2024-10"
              value={apiVersion}
              onChange={(e) => setApiVersion(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={saveConnection} disabled={savingConn || !storeUrl}>
              {savingConn && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Connection
            </Button>
            <Button variant="outline" onClick={testConnection} disabled={testing || !storeUrl}>
              {testing && <Loader2 className="h-4 w-4 animate-spin" />}
              Test Auth
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Inventory Settings ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" /> Inventory Sync Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Shopify Location ID</Label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. 12345678901"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={fetchLocations} disabled={loadingLocations || !isConnected}>
                {loadingLocations ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
                Fetch
              </Button>
            </div>
            {locations.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {locations.map(l => (
                  <button
                    key={l.id}
                    onClick={() => setLocationId(String(l.id))}
                    className={`text-xs px-2 py-0.5 rounded border transition-colors ${locationId === String(l.id) ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'}`}
                  >
                    {l.name} ({l.id})
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Click "Fetch" to pull locations from Shopify, or enter the numeric ID manually (found in the URL when viewing a location in Shopify Admin).
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Reserve Stock Buffer</Label>
            <Input
              type="number"
              min={0}
              value={reserveBuffer}
              onChange={(e) => setReserveBuffer(parseInt(e.target.value) || 0)}
            />
            <p className="text-xs text-muted-foreground">
              Units held back for in-store sales. Push qty = max(0, stock_on_hand − buffer).
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
              <Input
                type="number"
                min={1}
                value={maxQtyCap}
                onChange={(e) => setMaxQtyCap(e.target.value)}
                placeholder="e.g. 99"
              />
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
              <p className="text-xs text-muted-foreground">Only sync products with high-confidence SKU/barcode matches</p>
            </div>
            <Switch checked={autoSyncMatchedOnly} onCheckedChange={setAutoSyncMatchedOnly} />
          </div>

          <Button onClick={saveInventorySettings} disabled={savingInv}>
            {savingInv && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Inventory Settings
          </Button>
        </CardContent>
      </Card>

      {/* ── Product Sync / Cache ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Product Cache
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Pull all products from Shopify Admin API and cache them locally. This is required before running a stock sync dry-run.
          </p>
          <Button onClick={syncProducts} disabled={syncing || !isConnected}>
            {syncing && <Loader2 className="h-4 w-4 animate-spin" />}
            Refresh Product Cache Now
          </Button>

          {syncRuns.length > 0 && (
            <div className="space-y-2 mt-4">
              <h4 className="text-sm font-medium">Recent Sync Runs</h4>
              <div className="space-y-1">
                {syncRuns.map((run: any) => (
                  <div key={run.id} className="flex items-center justify-between text-xs border rounded px-3 py-2">
                    <span className="text-muted-foreground">
                      {new Date(run.started_at).toLocaleString()}
                    </span>
                    <div className="flex items-center gap-2">
                      <span>{run.total_items ?? 0} items</span>
                      <Badge
                        variant={run.status === 'sync_complete' ? 'default' : run.status === 'preview_complete' ? 'secondary' : 'outline'}
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
