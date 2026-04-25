import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ShoppingCart, CheckCircle, AlertCircle, Loader2, ExternalLink,
  RefreshCw, Shield, MapPin,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export function EbaySettings() {
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: ["ebay-connection-status"],
    queryFn: async () => {
      const res = await window.electronAPI.ebayGetStatus();
      if (res.error) throw new Error(res.error);
      return res.data;
    },
  });

  const [environment, setEnvironment] = useState("production");
  const [ruName, setRuName] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [merchantLocationKey, setMerchantLocationKey] = useState("");
  const [fulfillmentPolicyId, setFulfillmentPolicyId] = useState("");
  const [paymentPolicyId, setPaymentPolicyId] = useState("");
  const [returnPolicyId, setReturnPolicyId] = useState("");
  const [authCode, setAuthCode] = useState("");

  useEffect(() => {
    if (status) {
      setEnvironment(status.environment || "production");
      setRuName(status.ru_name || "");
      setClientId(status.client_id || "");
      setMerchantLocationKey(status.merchant_location_key || "");
      setFulfillmentPolicyId(status.fulfillment_policy_id || "");
      setPaymentPolicyId(status.payment_policy_id || "");
      setReturnPolicyId(status.return_policy_id || "");
    }
  }, [status]);

  const isConnected = status?.connected;
  const hasRefreshToken = status?.has_refresh_token;

  const saveSettings = useMutation({
    mutationFn: async () => {
      const res = await window.electronAPI.ebaySaveSettings({
        environment,
        ru_name: ruName,
        client_id: clientId,
        client_secret: clientSecret,
        merchant_location_key: merchantLocationKey,
        fulfillment_policy_id: fulfillmentPolicyId,
        payment_policy_id: paymentPolicyId,
        return_policy_id: returnPolicyId,
      });
      if (res.error) throw new Error(res.error);
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      toast.success("eBay settings saved");
      queryClient.invalidateQueries({ queryKey: ["ebay-connection-status"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const startOAuth = useMutation({
    mutationFn: async () => {
      const res = await window.electronAPI.ebayGetAuthUrl();
      if (res.error) throw new Error(res.error);
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      if (data?.auth_url) {
        window.open(data.auth_url, "_blank", "noopener,noreferrer");
        toast.info("eBay authorization page opened. After authorizing, paste the code below.");
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const exchangeCode = useMutation({
    mutationFn: async () => {
      if (!authCode.trim()) throw new Error("Paste the authorization code first");
      const res = await window.electronAPI.ebayExchangeCode(authCode.trim());
      if (res.error) throw new Error(res.error);
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      toast.success("eBay account connected successfully!");
      setAuthCode("");
      queryClient.invalidateQueries({ queryKey: ["ebay-connection-status"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const testConnection = useMutation({
    mutationFn: async () => {
      const res = await window.electronAPI.ebayTestConnection();
      if (res.error) throw new Error(res.error);
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      toast.success("eBay connection test passed!");
      queryClient.invalidateQueries({ queryKey: ["ebay-connection-status"] });
    },
    onError: (err: Error) => toast.error(`Test failed: ${err.message}`),
  });

  const refreshToken = useMutation({
    mutationFn: async () => {
      const res = await window.electronAPI.ebayRefreshToken();
      if (res.error) throw new Error(res.error);
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      toast.success("Token refreshed");
      queryClient.invalidateQueries({ queryKey: ["ebay-connection-status"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const fetchCategories = useMutation({
    mutationFn: async () => {
      throw new Error("eBay category fetch is coming in a follow-up. Auth flow is ready now.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const policiesConfigured =
    !!merchantLocationKey && !!fulfillmentPolicyId && !!paymentPolicyId && !!returnPolicyId;

  return (
    <div className="space-y-4">
      {/* Connection Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" /> eBay Connection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {isConnected ? (
              <Badge className="gap-1"><CheckCircle className="h-3 w-3" /> Connected</Badge>
            ) : hasRefreshToken ? (
              <Badge variant="secondary" className="gap-1"><RefreshCw className="h-3 w-3" /> Token Available</Badge>
            ) : (
              <Badge variant="outline" className="gap-1"><AlertCircle className="h-3 w-3" /> Not Connected</Badge>
            )}
            {status?.username && (
              <span className="text-sm text-muted-foreground">{status.username}</span>
            )}
            {status?.token_expires_at && (
              <span className="text-xs text-muted-foreground">
                Token expires: {new Date(status.token_expires_at).toLocaleString()}
              </span>
            )}
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Environment</Label>
              <Select value={environment} onValueChange={setEnvironment}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">Sandbox</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Marketplace</Label>
              <Input value="EBAY_AU" disabled className="bg-muted" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">RU Name (Redirect URL Name)</Label>
            <Input
              placeholder="Your eBay RuName from Developer Portal"
              value={ruName}
              onChange={(e) => setRuName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              From eBay Developer Portal → Application → Auth&apos;n&apos;Auth settings
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Client ID</Label>
              <Input
                placeholder="e.g. HughBlacksh-eBay-PRD-abc123..."
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Client Secret</Label>
              <Input
                type="password"
                placeholder="e.g. abcdef123456..."
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Credentials are stored locally in the Settings table (ebay_client_id, ebay_client_secret).
          </p>

          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
              {saveSettings.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Settings
            </Button>
            {isConnected && (
              <>
                <Button variant="outline" onClick={() => testConnection.mutate()} disabled={testConnection.isPending}>
                  {testConnection.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Test Connection
                </Button>
                <Button variant="outline" onClick={() => refreshToken.mutate()} disabled={refreshToken.isPending}>
                  {refreshToken.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Refresh Token
                </Button>
              </>
            )}
          </div>

          <Separator />

          <h4 className="font-medium text-sm">Connect eBay Account</h4>
          <p className="text-sm text-muted-foreground">
            Save your RU Name above first, then click the button below to start the OAuth flow.
            After authorizing on eBay, you&apos;ll be redirected. Paste the authorization code below.
          </p>

          <Button
            variant="outline"
            onClick={() => startOAuth.mutate()}
            disabled={startOAuth.isPending || !ruName}
          >
            {startOAuth.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            <ExternalLink className="h-4 w-4" />
            Connect eBay Account
          </Button>

          <div className="space-y-1.5">
            <Label className="text-sm">Authorization Code</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Paste the authorization code from eBay redirect"
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value)}
                className="flex-1"
              />
              <Button
                onClick={() => exchangeCode.mutate()}
                disabled={exchangeCode.isPending || !authCode.trim()}
              >
                {exchangeCode.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Exchange
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Business Policies Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" /> Business Policies &amp; Location
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            {policiesConfigured ? (
              <Badge className="gap-1"><CheckCircle className="h-3 w-3" /> All Configured</Badge>
            ) : (
              <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> Missing Required Fields</Badge>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            These are required before publishing listings. Find them in your eBay Seller Hub → Business Policies.
          </p>

          <div className="space-y-1.5">
            <Label className="text-sm">Merchant Location Key</Label>
            <Input
              placeholder="e.g. warehouse_au_01"
              value={merchantLocationKey}
              onChange={(e) => setMerchantLocationKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Create a location via eBay Seller Hub or Inventory API. Use the location key here.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Fulfillment Policy ID</Label>
            <Input
              placeholder="e.g. 123456789"
              value={fulfillmentPolicyId}
              onChange={(e) => setFulfillmentPolicyId(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Payment Policy ID</Label>
            <Input
              placeholder="e.g. 123456789"
              value={paymentPolicyId}
              onChange={(e) => setPaymentPolicyId(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Return Policy ID</Label>
            <Input
              placeholder="e.g. 123456789"
              value={returnPolicyId}
              onChange={(e) => setReturnPolicyId(e.target.value)}
            />
          </div>

          <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
            {saveSettings.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Policies
          </Button>
        </CardContent>
      </Card>

      {/* Category Taxonomy Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" /> eBay Category Taxonomy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Import the full eBay Australia category tree for searchable category selection in drafts.
          </p>
          <Button
            onClick={() => fetchCategories.mutate()}
            disabled={fetchCategories.isPending || !isConnected}
          >
            {fetchCategories.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Fetch eBay AU Categories
          </Button>
        </CardContent>
      </Card>

      {/* Defaults Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4" /> Listing Defaults
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Marketplace:</span>
              <span className="ml-2 font-medium">EBAY_AU</span>
            </div>
            <div>
              <span className="text-muted-foreground">Format:</span>
              <span className="ml-2 font-medium">FIXED_PRICE</span>
            </div>
            <div>
              <span className="text-muted-foreground">Currency:</span>
              <span className="ml-2 font-medium">AUD</span>
            </div>
            <div>
              <span className="text-muted-foreground">Default Condition:</span>
              <span className="ml-2 font-medium">1000 (New)</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}