import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Save, Plus, X, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface GeneralTabProps {
  product: any;
  onSave: (updates: any) => void;
  isSaving?: boolean;
}

const INITIAL_FORM = (p: any) => ({
  // Section 1: Core Identity
  source_product_name: p.source_product_name || "",
  barcode: p.barcode || "",
  sku: p.sku || "",
  brand: p.brand || "",
  manufacturer: p.manufacturer || "",
  country_of_origin: p.country_of_origin || "",
  department: p.department || "",
  z_category: p.z_category || "",
  ebay_category_id: p.ebay_category_id || "",
  shopify_collection: p.shopify_collection || "",
  product_status: p.product_status || "active",
  compliance_status: p.compliance_status || "pending",

  // Section 2: Pricing & Stock
  cost_price: p.cost_price ?? "",
  sell_price: p.sell_price ?? "",
  ebay_listed_price: p.ebay_listed_price ?? "",
  shopify_listed_price: p.shopify_listed_price ?? "",
  tax_class: p.tax_class || "gst_included",
  stock_on_hand: p.stock_on_hand ?? "",
  reorder_level: p.reorder_level ?? "",
  supplier: p.supplier || "",
  supplier_product_code: p.supplier_product_code || "",
  lead_time_days: p.lead_time_days ?? "",

  // Section 3: Physical Details
  weight_grams: p.weight_grams ?? "",
  length_mm: p.length_mm ?? "",
  width_mm: p.width_mm ?? "",
  height_mm: p.height_mm ?? "",
  pack_size: p.pack_size || "",
  unit_of_measure: p.unit_of_measure || "",
  storage_requirements: p.storage_requirements || "",
  shelf_life_notes: p.shelf_life_notes || "",

  // Section 4: Regulatory
  artg_number: p.artg_number || "",
  artg_inclusion_type: p.artg_inclusion_type || "",
  scheduled_drug: p.scheduled_drug || "",
  pbs_listed: p.pbs_listed ?? false,
  pbs_item_code: p.pbs_item_code || "",
  ndss_product: p.ndss_product ?? false,
  requires_prescription: p.requires_prescription ?? false,
  age_restriction: p.age_restriction || "",
  regulatory_notes: p.regulatory_notes || "",

  // Section 5: Content
  short_description: p.short_description || "",
  full_description_html: p.full_description_html || "",
  key_features: p.key_features || [],
  ingredients_summary: p.ingredients_summary || "",
  directions_summary: p.directions_summary || "",
  warnings_summary: p.warnings_summary || "",
  allergen_information: p.allergen_information || "",

  // Section 6: Identifiers
  upc: p.upc || "",
  gtin14: p.gtin14 || "",
  mpn: p.mpn || "",
  supplier_barcode: p.supplier_barcode || "",

  // Section 8: Notes
  notes_internal: p.notes_internal || "",
  tags: p.tags || [],
});

export function GeneralTab({ product, onSave, isSaving }: GeneralTabProps) {
  const [form, setForm] = useState(() => INITIAL_FORM(product));
  const [newFeature, setNewFeature] = useState("");
  const [newTag, setNewTag] = useState("");

  const initialForm = useMemo(() => INITIAL_FORM(product), [product]);
  const hasChanges = useMemo(() => JSON.stringify(form) !== JSON.stringify(initialForm), [form, initialForm]);

  useEffect(() => {
    setForm(INITIAL_FORM(product));
  }, [product]);

  const set = (field: string, value: any) => setForm(prev => ({ ...prev, [field]: value }));

  // Fetch channel sync data for Section 7
  const { data: ebayDraft } = useQuery({
    queryKey: ["ebay-draft-general", product.id],
    queryFn: async () => {
      const { data } = await supabase.from("ebay_drafts").select("channel_status, buy_it_now_price, published_listing_id, ebay_last_synced_at, ebay_listing_url").eq("product_id", product.id).maybeSingle();
      return data;
    },
  });

  const { data: shopifyDraft } = useQuery({
    queryKey: ["shopify-draft-general", product.id],
    queryFn: async () => {
      const { data } = await supabase.from("shopify_drafts").select("channel_status, shopify_product_gid, updated_at, title").eq("product_id", product.id).maybeSingle();
      return data;
    },
  });

  const handleSave = () => {
    const updates = { ...form };
    // Convert numeric fields
    for (const k of ["cost_price", "sell_price", "ebay_listed_price", "shopify_listed_price", "stock_on_hand", "reorder_level", "lead_time_days", "weight_grams", "length_mm", "width_mm", "height_mm"]) {
      (updates as any)[k] = (updates as any)[k] === "" ? null : Number((updates as any)[k]);
    }
    onSave(updates);
  };

  const addFeature = () => {
    if (!newFeature.trim()) return;
    set("key_features", [...form.key_features, newFeature.trim()]);
    setNewFeature("");
  };

  const removeFeature = (i: number) => {
    set("key_features", form.key_features.filter((_: any, idx: number) => idx !== i));
  };

  const addTag = () => {
    if (!newTag.trim()) return;
    set("tags", [...form.tags, newTag.trim()]);
    setNewTag("");
  };

  const removeTag = (i: number) => {
    set("tags", form.tags.filter((_: any, idx: number) => idx !== i));
  };

  return (
    <div className="space-y-4 pb-20 relative">
      {/* Unsaved changes warning */}
      {hasChanges && (
        <div className="bg-warning/10 border border-warning text-warning-foreground px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-warning inline-block" />
          You have unsaved changes
        </div>
      )}

      {/* Section 1: Core Identity */}
      <CollapsibleSection title="Core Identity" defaultOpen>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Field label="Product Name" value={form.source_product_name} onChange={v => set("source_product_name", v)} />
          </div>
          <Field label="Barcode (EAN/UPC/GTIN)" value={form.barcode} onChange={v => set("barcode", v)} mono />
          <Field label="SKU (Internal)" value={form.sku} onChange={v => set("sku", v)} mono />
          <Field label="Brand" value={form.brand} onChange={v => set("brand", v)} />
          <Field label="Manufacturer" value={form.manufacturer} onChange={v => set("manufacturer", v)} />
          <Field label="Country of Origin" value={form.country_of_origin} onChange={v => set("country_of_origin", v)} />
          <Field label="Department" value={form.department} onChange={v => set("department", v)} />
          <Field label="Category (Internal)" value={form.z_category} onChange={v => set("z_category", v)} />
          <Field label="eBay Category ID" value={form.ebay_category_id} onChange={v => set("ebay_category_id", v)} mono />
          <Field label="Shopify Collection" value={form.shopify_collection} onChange={v => set("shopify_collection", v)} />
          <SelectField label="Product Status" value={form.product_status} onChange={v => set("product_status", v)} options={[
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
            { value: "discontinued", label: "Discontinued" },
            { value: "pending_review", label: "Pending Review" },
          ]} />
          <SelectField label="Compliance / Permitted" value={form.compliance_status} onChange={v => set("compliance_status", v)} options={[
            { value: "pending", label: "Pending" },
            { value: "permitted", label: "Permitted" },
            { value: "review_required", label: "Review Required" },
            { value: "blocked", label: "Blocked" },
          ]} />
        </div>
      </CollapsibleSection>

      {/* Section 2: Pricing & Stock */}
      <CollapsibleSection title="Pricing & Stock" defaultOpen>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Cost Price (AUD)" value={form.cost_price} onChange={v => set("cost_price", v)} type="number" />
          <Field label="Sell Price / RRP (AUD)" value={form.sell_price} onChange={v => set("sell_price", v)} type="number" />
          <Field label="eBay Listed Price (AUD)" value={form.ebay_listed_price} onChange={v => set("ebay_listed_price", v)} type="number" />
          <Field label="Shopify Listed Price (AUD)" value={form.shopify_listed_price} onChange={v => set("shopify_listed_price", v)} type="number" />
          <SelectField label="Tax Class" value={form.tax_class} onChange={v => set("tax_class", v)} options={[
            { value: "gst_included", label: "GST Included" },
            { value: "gst_free", label: "GST Free" },
            { value: "gst_applicable", label: "GST Applicable" },
          ]} />
          <Field label="Stock on Hand" value={form.stock_on_hand} onChange={v => set("stock_on_hand", v)} type="number" />
          <Field label="Reorder Level" value={form.reorder_level} onChange={v => set("reorder_level", v)} type="number" />
          <Field label="Supplier Name" value={form.supplier} onChange={v => set("supplier", v)} />
          <Field label="Supplier Product Code" value={form.supplier_product_code} onChange={v => set("supplier_product_code", v)} mono />
          <Field label="Lead Time (days)" value={form.lead_time_days} onChange={v => set("lead_time_days", v)} type="number" />
        </div>
      </CollapsibleSection>

      {/* Section 3: Physical Details */}
      <CollapsibleSection title="Physical Details" defaultOpen>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Weight (grams)" value={form.weight_grams} onChange={v => set("weight_grams", v)} type="number" />
          <Field label="Length (mm)" value={form.length_mm} onChange={v => set("length_mm", v)} type="number" />
          <Field label="Width (mm)" value={form.width_mm} onChange={v => set("width_mm", v)} type="number" />
          <Field label="Height (mm)" value={form.height_mm} onChange={v => set("height_mm", v)} type="number" />
          <Field label="Pack Size / Unit Count" value={form.pack_size} onChange={v => set("pack_size", v)} />
          <SelectField label="Unit of Measure" value={form.unit_of_measure} onChange={v => set("unit_of_measure", v)} options={[
            { value: "", label: "— Select —" },
            { value: "tablets", label: "Tablets" },
            { value: "capsules", label: "Capsules" },
            { value: "ml", label: "mL" },
            { value: "g", label: "g" },
            { value: "kg", label: "kg" },
            { value: "units", label: "Units" },
            { value: "sachets", label: "Sachets" },
            { value: "other", label: "Other" },
          ]} />
          <SelectField label="Storage Requirements" value={form.storage_requirements} onChange={v => set("storage_requirements", v)} options={[
            { value: "", label: "— Select —" },
            { value: "room_temperature", label: "Room Temperature" },
            { value: "refrigerated", label: "Refrigerated" },
            { value: "frozen", label: "Frozen" },
            { value: "cool_dry", label: "Cool & Dry" },
          ]} />
          <div className="md:col-span-2">
            <FieldTextarea label="Shelf Life / Expiry Notes" value={form.shelf_life_notes} onChange={v => set("shelf_life_notes", v)} rows={2} />
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 4: Regulatory & Compliance */}
      <CollapsibleSection title="Regulatory & Compliance" defaultOpen>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="ARTG Number" value={form.artg_number} onChange={v => set("artg_number", v)} mono />
          <SelectField label="ARTG Inclusion Type" value={form.artg_inclusion_type} onChange={v => set("artg_inclusion_type", v)} options={[
            { value: "", label: "— Select —" },
            { value: "listed", label: "Listed" },
            { value: "registered", label: "Registered" },
            { value: "exempt", label: "Exempt" },
            { value: "na", label: "N/A" },
          ]} />
          <SelectField label="Scheduled Drug" value={form.scheduled_drug} onChange={v => set("scheduled_drug", v)} options={[
            { value: "", label: "— Select —" },
            { value: "s2", label: "S2" },
            { value: "s3", label: "S3" },
            { value: "s4", label: "S4" },
            { value: "s8", label: "S8" },
            { value: "unscheduled", label: "Unscheduled" },
          ]} />
          <div className="space-y-3">
            <ToggleField label="PBS Listed" checked={form.pbs_listed} onChange={v => set("pbs_listed", v)} />
            {form.pbs_listed && (
              <Field label="PBS Item Code" value={form.pbs_item_code} onChange={v => set("pbs_item_code", v)} mono />
            )}
          </div>
          <ToggleField label="NDSS Product" checked={form.ndss_product} onChange={v => set("ndss_product", v)} />
          <ToggleField label="Requires Prescription" checked={form.requires_prescription} onChange={v => set("requires_prescription", v)} />
          <SelectField label="Age Restriction" value={form.age_restriction} onChange={v => set("age_restriction", v)} options={[
            { value: "", label: "None" },
            { value: "18+", label: "18+" },
            { value: "pharmacist_advice", label: "Pharmacist advice required" },
          ]} />
          <div className="md:col-span-2">
            <FieldTextarea label="Regulatory Notes" value={form.regulatory_notes} onChange={v => set("regulatory_notes", v)} rows={2} />
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 5: Product Content & Description */}
      <CollapsibleSection title="Product Content & Description" defaultOpen>
        <div className="space-y-4">
          <FieldTextarea label="Short Description" value={form.short_description} onChange={v => set("short_description", v)} rows={2} placeholder="1–3 sentence summary" />
          <FieldTextarea label="Full Description (HTML)" value={form.full_description_html} onChange={v => set("full_description_html", v)} rows={8} placeholder="<h2>Product Name</h2>..." />
          {form.full_description_html && (
            <div>
              <Label className="text-sm text-muted-foreground">Preview</Label>
              <div className="mt-1 prose prose-sm max-w-none dark:prose-invert border rounded-md p-4 bg-background" dangerouslySetInnerHTML={{ __html: form.full_description_html }} />
            </div>
          )}

          {/* Key Features */}
          <div className="space-y-2">
            <Label className="text-sm">Key Features</Label>
            {form.key_features.map((f: string, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-sm flex-1 bg-muted px-3 py-1.5 rounded-md">• {f}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeFeature(i)}><X className="h-3 w-3" /></Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input value={newFeature} onChange={e => setNewFeature(e.target.value)} placeholder="Add a feature…" onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addFeature())} />
              <Button variant="outline" size="sm" onClick={addFeature}><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FieldTextarea label="Ingredients / Active Components" value={form.ingredients_summary} onChange={v => set("ingredients_summary", v)} rows={3} />
            <FieldTextarea label="Directions for Use" value={form.directions_summary} onChange={v => set("directions_summary", v)} rows={3} />
            <FieldTextarea label="Warnings & Contraindications" value={form.warnings_summary} onChange={v => set("warnings_summary", v)} rows={3} />
            <FieldTextarea label="Allergen Information" value={form.allergen_information} onChange={v => set("allergen_information", v)} rows={3} />
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 6: Identifiers & Barcodes */}
      <CollapsibleSection title="Identifiers & Barcodes" defaultOpen>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="EAN / Barcode" value={form.barcode} onChange={v => set("barcode", v)} mono />
          <Field label="UPC" value={form.upc} onChange={v => set("upc", v)} mono />
          <Field label="GTIN-14" value={form.gtin14} onChange={v => set("gtin14", v)} mono />
          <Field label="MPN (Manufacturer Part Number)" value={form.mpn} onChange={v => set("mpn", v)} mono />
          <Field label="TGA ARTG Number" value={form.artg_number} onChange={v => set("artg_number", v)} mono />
          <Field label="Supplier Barcode" value={form.supplier_barcode} onChange={v => set("supplier_barcode", v)} mono />
        </div>
      </CollapsibleSection>

      {/* Section 7: Channel Sync Status (read-only) */}
      <CollapsibleSection title="Channel Sync Status" defaultOpen>
        <div className="space-y-3">
          <ChannelRow
            channel="eBay"
            status={ebayDraft?.channel_status}
            price={ebayDraft?.buy_it_now_price}
            listingId={ebayDraft?.published_listing_id}
            lastSync={ebayDraft?.ebay_last_synced_at}
            url={ebayDraft?.ebay_listing_url}
            tabValue="ebay"
          />
          <ChannelRow
            channel="Shopify"
            status={shopifyDraft?.channel_status}
            price={null}
            listingId={shopifyDraft?.shopify_product_gid}
            lastSync={shopifyDraft?.updated_at}
            url={null}
            tabValue="shopify"
          />
        </div>
      </CollapsibleSection>

      {/* Section 8: Internal Notes & History */}
      <CollapsibleSection title="Internal Notes & History" defaultOpen>
        <div className="space-y-4">
          <FieldTextarea label="Internal Notes" value={form.notes_internal} onChange={v => set("notes_internal", v)} rows={3} placeholder="Staff notes…" />

          {/* Tags */}
          <div className="space-y-2">
            <Label className="text-sm">Tags</Label>
            <div className="flex flex-wrap gap-1.5">
              {form.tags.map((t: string, i: number) => (
                <Badge key={i} variant="secondary" className="gap-1 pr-1">
                  {t}
                  <button onClick={() => removeTag(i)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newTag} onChange={e => setNewTag(e.target.value)} placeholder="Add tag…" onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addTag())} />
              <Button variant="outline" size="sm" onClick={addTag}><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Date Added</Label>
              <p className="text-sm">{product.created_at ? new Date(product.created_at).toLocaleDateString() : "—"}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Last Modified</Label>
              <p className="text-sm">{product.updated_at ? new Date(product.updated_at).toLocaleString() : "—"}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Last Modified By</Label>
              <p className="text-sm">{product.last_modified_by || "—"}</p>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Sticky Save Button */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-t p-3 flex justify-end">
        <Button onClick={handleSave} disabled={isSaving || !hasChanges} size="lg">
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}

/* ── Reusable sub-components ── */

function CollapsibleSection({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer select-none flex flex-row items-center justify-between py-4 px-6 hover:bg-muted/50 transition-colors">
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-6">{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function Field({ label, value, onChange, type = "text", mono = false }: { label: string; value: any; onChange: (v: string) => void; type?: string; mono?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Input value={value} onChange={e => onChange(e.target.value)} type={type} className={mono ? "font-mono" : ""} />
    </div>
  );
}

function FieldTextarea({ label, value, onChange, rows = 3, placeholder }: { label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} placeholder={placeholder} />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const safeOptions = options.map(o => ({
    ...o,
    value: o.value === "" ? "__none__" : o.value,
  }));
  const safeValue = value === "" || value == null ? "__none__" : value;
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Select value={safeValue} onValueChange={v => onChange(v === "__none__" ? "" : v)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {safeOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <Label className="text-sm">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function ChannelRow({ channel, status, price, listingId, lastSync, url, tabValue }: {
  channel: string; status?: string | null; price?: number | null; listingId?: string | null; lastSync?: string | null; url?: string | null; tabValue: string;
}) {
  const badge = status === "published" || status === "ready" ? "default" : "outline";
  const label = status || "Not Listed";
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 border rounded-md bg-muted/30">
      <span className="font-medium text-sm min-w-[70px]">{channel}</span>
      <Badge variant={badge} className="text-[10px]">{label}</Badge>
      {price != null && <span className="text-sm text-muted-foreground">${Number(price).toFixed(2)}</span>}
      {listingId && <span className="text-xs font-mono text-muted-foreground truncate">{listingId}</span>}
      {lastSync && <span className="text-xs text-muted-foreground">{new Date(lastSync).toLocaleDateString()}</span>}
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
          View <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
