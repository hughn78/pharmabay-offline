import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Settings as SettingsIcon, Store, ShoppingCart, Search, Layers, Loader2, Database, Download } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ComplianceRuleEditor } from "@/components/compliance/ComplianceRuleEditor";
import { ShopifySettings } from "@/components/shopify/ShopifySettings";
import { EbaySettings } from "@/components/ebay/EbaySettings";

function useAppSetting(key: string) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["app-setting", key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .eq("setting_key", key)
        .maybeSingle();
      if (error) throw error;
      return (data?.setting_value as Record<string, any>) || {};
    },
  });

  const mutation = useMutation({
    mutationFn: async (value: Record<string, any>) => {
      const { error } = await supabase
        .from("app_settings")
        .update({ setting_value: value })
        .eq("setting_key", key);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app-setting", key] });
      toast.success("Settings saved");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return { data: data || {}, isLoading, save: mutation.mutate, isSaving: mutation.isPending };
}

export default function Settings() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm">Configure pharmacy details, integrations, and rules</p>
      </div>

      <Tabs defaultValue="pharmacy">
        <TabsList className="flex-wrap">
          <TabsTrigger value="pharmacy">Pharmacy</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="ebay">eBay</TabsTrigger>
          <TabsTrigger value="shopify">Shopify</TabsTrigger>
          <TabsTrigger value="google">Google</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
        </TabsList>

        <TabsContent value="pharmacy" className="mt-4">
          <PharmacySettings />
        </TabsContent>

        <TabsContent value="pricing" className="mt-4">
          <PricingSettings />
        </TabsContent>

        <TabsContent value="ebay" className="mt-4">
          <EbaySettings />
        </TabsContent>

        <TabsContent value="shopify" className="mt-4">
          <ShopifySettings />
        </TabsContent>

        <TabsContent value="google" className="mt-4">
          <GoogleSettings />
        </TabsContent>

        <TabsContent value="compliance" className="mt-4">
          <ComplianceRuleEditor />
        </TabsContent>

        <TabsContent value="categories" className="mt-4">
          <CategoryMappings />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PharmacySettings() {
  const { data, isLoading, save, isSaving } = useAppSetting("pharmacy_details");
  const [form, setForm] = useState({ store_name: "", address: "", abn: "" });

  useEffect(() => {
    if (data) setForm({ store_name: data.store_name || "", address: data.address || "", abn: data.abn || "" });
  }, [data]);

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Pharmacy Details</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <SettingField label="Store Name" value={form.store_name} onChange={(v) => setForm((p) => ({ ...p, store_name: v }))} placeholder="PharmaBay Pharmacy" />
        <SettingField label="Address" value={form.address} onChange={(v) => setForm((p) => ({ ...p, address: v }))} placeholder="123 Main St, Altona North VIC 3025" />
        <SettingField label="ABN" value={form.abn} onChange={(v) => setForm((p) => ({ ...p, abn: v }))} placeholder="12 345 678 901" />
        <Button onClick={() => save(form)} disabled={isSaving}>
          {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save
        </Button>
      </CardContent>
    </Card>
  );
}

function PricingSettings() {
  const { data, isLoading, save, isSaving } = useAppSetting("pricing_defaults");
  const [form, setForm] = useState({ default_markup_percent: "30", minimum_margin_percent: "15", reserve_stock: "2" });

  useEffect(() => {
    if (data) setForm({
      default_markup_percent: String(data.default_markup_percent ?? 30),
      minimum_margin_percent: String(data.minimum_margin_percent ?? 15),
      reserve_stock: String(data.reserve_stock ?? 2),
    });
  }, [data]);

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Pricing Defaults</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <SettingField label="Default Markup %" value={form.default_markup_percent} onChange={(v) => setForm((p) => ({ ...p, default_markup_percent: v }))} type="number" placeholder="30" />
        <SettingField label="Minimum Margin %" value={form.minimum_margin_percent} onChange={(v) => setForm((p) => ({ ...p, minimum_margin_percent: v }))} type="number" placeholder="15" />
        <SettingField label="Reserve Stock (units)" value={form.reserve_stock} onChange={(v) => setForm((p) => ({ ...p, reserve_stock: v }))} type="number" placeholder="2" />
        <Button onClick={() => save({
          default_markup_percent: parseFloat(form.default_markup_percent) || 30,
          minimum_margin_percent: parseFloat(form.minimum_margin_percent) || 15,
          reserve_stock: parseInt(form.reserve_stock) || 2,
        })} disabled={isSaving}>
          {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save
        </Button>
      </CardContent>
    </Card>
  );
}

function GoogleSettings() {
  const [isTesting, setIsTesting] = useState(false);

  const handleTestSearch = async () => {
    setIsTesting(true);
    try {
      const res = await supabase.functions.invoke("scrape-and-generate", {
        body: { url: "https://www.google.com", test: true },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      toast.success("Google search connection is working");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.toLowerCase().includes("not configured") || message.toLowerCase().includes("api key")) {
        toast.error("Google API key not configured. Add it as a server-side secret.");
      } else {
        toast.error("Test failed", { description: message });
      }
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Search className="h-4 w-4" /> Google Custom Search
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Google API credentials are stored as secure server-side secrets.
        </p>
        <Button variant="outline" onClick={handleTestSearch} disabled={isTesting}>
          {isTesting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Test Search
        </Button>
      </CardContent>
    </Card>
  );
}

// EbaySettings is now imported from @/components/ebay/EbaySettings

function SettingField({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type={type} />
    </div>
  );
}

function CategoryMappings() {
  const { data: mappings = [] } = useQuery({
    queryKey: ["category-mappings"],
    queryFn: async () => {
      const { data } = await supabase.from("category_mappings").select("*").order("z_department");
      return data || [];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4" /> Category Mappings
        </CardTitle>
      </CardHeader>
      <CardContent>
        {mappings.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No category mappings configured.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Z Department</TableHead>
                  <TableHead>Z Category</TableHead>
                  <TableHead>eBay Category</TableHead>
                  <TableHead>Shopify Category</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappings.map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm">{m.z_department}</TableCell>
                    <TableCell className="text-sm">{m.z_category}</TableCell>
                    <TableCell className="text-sm">{m.ebay_category_name}</TableCell>
                    <TableCell className="text-sm">{m.shopify_product_category}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
