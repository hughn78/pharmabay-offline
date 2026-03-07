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
import { Settings as SettingsIcon, Store, ShoppingCart, Search, Shield, Layers } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";

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
        </TabsList>

        <TabsContent value="pharmacy" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Pharmacy Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Field label="Store Name" placeholder="PharmaBay Pharmacy" />
              <Field label="Address" placeholder="123 Main St, Altona North VIC 3025" />
              <Field label="ABN" placeholder="12 345 678 901" />
              <Button>Save</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pricing" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Pricing Defaults</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Field label="Default Markup %" placeholder="30" type="number" />
              <Field label="Minimum Margin %" placeholder="15" type="number" />
              <Field label="Reserve Stock (units to keep for in-store)" placeholder="2" type="number" />
              <Button>Save</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ebay" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> eBay Integration</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline">Not Connected</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                eBay API credentials are stored as secure server-side secrets. Contact your administrator to configure.
              </p>
              <Separator />
              <h4 className="font-medium text-sm">Shipping Defaults</h4>
              <Field label="Location" placeholder="Altona North VIC 3025 AU" />
              <Field label="Dispatch Time (days)" placeholder="2" type="number" />
              <Button>Save</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shopify" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Store className="h-4 w-4" /> Shopify Integration</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline">Not Connected</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Shopify credentials are stored as secure server-side secrets. Configure via Settings.
              </p>
              <Field label="Shop Domain" placeholder="my-pharmacy.myshopify.com" />
              <Field label="API Version" placeholder="2024-01" />
              <Button variant="outline">Test Connection</Button>
              <Button>Save</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="google" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Search className="h-4 w-4" /> Google Custom Search</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Google API credentials are stored as secure server-side secrets.
              </p>
              <Button variant="outline">Test Search</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance" className="mt-4">
          <ComplianceRules />
        </TabsContent>

        <TabsContent value="categories" className="mt-4">
          <CategoryMappings />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, placeholder, type = "text" }: { label: string; placeholder: string; type?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Input placeholder={placeholder} type={type} />
    </div>
  );
}

function ComplianceRules() {
  const { data: rules = [] } = useQuery({
    queryKey: ["compliance-rules"],
    queryFn: async () => {
      const { data } = await supabase.from("compliance_rules").select("*").order("priority");
      return data || [];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4" /> Compliance Rules
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No compliance rules configured. Add rules to auto-classify products.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead>Field</TableHead>
                <TableHead>Match</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium text-sm">{r.rule_name}</TableCell>
                  <TableCell className="text-sm">{r.match_field}</TableCell>
                  <TableCell className="font-mono text-xs">{r.match_value}</TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] ${r.action === "block" ? "status-blocked" : r.action === "review" ? "status-review" : "status-permitted"}`}>
                      {r.action}
                    </Badge>
                  </TableCell>
                  <TableCell>{r.is_active ? "✓" : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
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
