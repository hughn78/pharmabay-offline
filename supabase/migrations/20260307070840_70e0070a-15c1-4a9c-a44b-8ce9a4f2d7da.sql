
-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('owner', 'manager', 'lister', 'reviewer');

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS for user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Owners can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'owner'));

-- Updated at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 1) products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_product_name TEXT,
  normalized_product_name TEXT,
  barcode TEXT,
  sku TEXT,
  brand TEXT,
  supplier TEXT,
  department TEXT,
  z_category TEXT,
  internal_category TEXT,
  product_type TEXT,
  product_form TEXT,
  strength TEXT,
  size_value TEXT,
  pack_size TEXT,
  flavour TEXT,
  variant TEXT,
  ingredients_summary TEXT,
  directions_summary TEXT,
  warnings_summary TEXT,
  claims_summary TEXT,
  artg_number TEXT,
  cost_price NUMERIC,
  sell_price NUMERIC,
  stock_on_hand NUMERIC,
  stock_value NUMERIC,
  units_sold_12m INTEGER,
  units_purchased_12m INTEGER,
  total_sales_value_12m NUMERIC,
  total_cogs_12m NUMERIC,
  gross_profit_percent NUMERIC,
  last_purchased_at DATE,
  last_sold_at DATE,
  weight_grams INTEGER DEFAULT 200,
  quantity_reserved_for_store INTEGER DEFAULT 0,
  quantity_available_for_ebay INTEGER,
  quantity_available_for_shopify INTEGER,
  compliance_status TEXT CHECK (compliance_status IN ('permitted','review_required','blocked')),
  compliance_reasons TEXT[],
  enrichment_status TEXT CHECK (enrichment_status IN ('pending','in_progress','complete','failed')),
  enrichment_confidence TEXT CHECK (enrichment_confidence IN ('high','medium','low')),
  enrichment_summary JSONB,
  source_links JSONB,
  notes_internal TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert products" ON public.products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update products" ON public.products FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) inventory_snapshots
CREATE TABLE public.inventory_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id),
  snapshot_date DATE,
  stock_on_hand NUMERIC,
  sell_price NUMERIC,
  cost_price NUMERIC,
  stock_value NUMERIC,
  units_sold_12m INTEGER,
  source_batch_id UUID
);
ALTER TABLE public.inventory_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read inventory_snapshots" ON public.inventory_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert inventory_snapshots" ON public.inventory_snapshots FOR INSERT TO authenticated WITH CHECK (true);

-- 3) import_batches
CREATE TABLE public.import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT,
  imported_at TIMESTAMPTZ DEFAULT now(),
  imported_by UUID,
  row_count INTEGER,
  new_count INTEGER,
  updated_count INTEGER,
  skipped_count INTEGER,
  error_count INTEGER,
  import_notes TEXT,
  raw_file_path TEXT
);
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read import_batches" ON public.import_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert import_batches" ON public.import_batches FOR INSERT TO authenticated WITH CHECK (true);

-- 4) product_images
CREATE TABLE public.product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id),
  source_type TEXT,
  source_page_url TEXT,
  original_url TEXT,
  local_storage_url TEXT,
  local_storage_path TEXT,
  width INTEGER,
  height INTEGER,
  alt_text TEXT,
  image_status TEXT CHECK (image_status IN ('candidate','approved','rejected')),
  is_primary BOOLEAN DEFAULT false,
  sort_order INTEGER,
  ebay_approved BOOLEAN DEFAULT false,
  shopify_approved BOOLEAN DEFAULT false,
  shopify_media_gid TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read product_images" ON public.product_images FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert product_images" ON public.product_images FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update product_images" ON public.product_images FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_product_images_updated_at BEFORE UPDATE ON public.product_images FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) enrichment_runs
CREATE TABLE public.enrichment_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status TEXT,
  steps_completed JSONB,
  raw_payloads JSONB,
  final_confidence_score NUMERIC,
  needs_review BOOLEAN,
  error_message TEXT
);
ALTER TABLE public.enrichment_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read enrichment_runs" ON public.enrichment_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert enrichment_runs" ON public.enrichment_runs FOR INSERT TO authenticated WITH CHECK (true);

-- 6) ebay_drafts
CREATE TABLE public.ebay_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id),
  title TEXT,
  subtitle TEXT,
  description_html TEXT,
  description_plain TEXT,
  category_id TEXT,
  category_name TEXT,
  condition_id TEXT DEFAULT '1000',
  brand TEXT,
  mpn TEXT,
  epid TEXT,
  upc TEXT,
  ean TEXT,
  item_specifics JSONB,
  image_urls TEXT[],
  quantity INTEGER,
  pricing_mode TEXT,
  start_price NUMERIC,
  buy_it_now_price NUMERIC,
  shipping_profile JSONB,
  return_profile JSONB,
  payment_profile JSONB,
  channel_status TEXT CHECK (channel_status IN ('draft','ready','exported','published','skip','blocked','failed')),
  validation_status TEXT,
  validation_errors JSONB,
  published_listing_id TEXT,
  created_by UUID,
  approved_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.ebay_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read ebay_drafts" ON public.ebay_drafts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert ebay_drafts" ON public.ebay_drafts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update ebay_drafts" ON public.ebay_drafts FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_ebay_drafts_updated_at BEFORE UPDATE ON public.ebay_drafts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7) ebay_publish_jobs
CREATE TABLE public.ebay_publish_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id),
  ebay_draft_id UUID REFERENCES public.ebay_drafts(id),
  publish_mode TEXT CHECK (publish_mode IN ('api','csv_export')),
  ebay_inventory_sku TEXT,
  ebay_offer_id TEXT,
  ebay_listing_id TEXT,
  publish_status TEXT CHECK (publish_status IN ('queued','processing','success','failed')),
  request_payload JSONB,
  response_payload JSONB,
  error_message TEXT,
  submitted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
ALTER TABLE public.ebay_publish_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read ebay_publish_jobs" ON public.ebay_publish_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert ebay_publish_jobs" ON public.ebay_publish_jobs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update ebay_publish_jobs" ON public.ebay_publish_jobs FOR UPDATE TO authenticated USING (true);

-- 8) shopify_drafts
CREATE TABLE public.shopify_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id),
  shopify_product_gid TEXT,
  handle TEXT,
  title TEXT,
  description_html TEXT,
  vendor TEXT,
  product_category TEXT,
  product_type TEXT,
  tags TEXT[],
  published_online_store BOOLEAN,
  status TEXT,
  seo_title TEXT,
  seo_description TEXT,
  google_product_category TEXT,
  google_gender TEXT,
  google_age_group TEXT,
  google_mpn TEXT,
  google_ad_group_name TEXT,
  google_ads_labels TEXT,
  google_condition TEXT,
  google_custom_product BOOLEAN,
  google_custom_label_0 TEXT,
  google_custom_label_1 TEXT,
  google_custom_label_2 TEXT,
  google_custom_label_3 TEXT,
  google_custom_label_4 TEXT,
  channel_status TEXT CHECK (channel_status IN ('draft','ready','exported','published','skip','blocked','failed')),
  validation_status TEXT,
  validation_errors JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.shopify_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read shopify_drafts" ON public.shopify_drafts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert shopify_drafts" ON public.shopify_drafts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update shopify_drafts" ON public.shopify_drafts FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_shopify_drafts_updated_at BEFORE UPDATE ON public.shopify_drafts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9) shopify_variants
CREATE TABLE public.shopify_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id),
  shopify_draft_id UUID REFERENCES public.shopify_drafts(id),
  shopify_variant_gid TEXT,
  option1_name TEXT,
  option1_value TEXT,
  option2_name TEXT,
  option2_value TEXT,
  option3_name TEXT,
  option3_value TEXT,
  sku TEXT,
  barcode TEXT,
  price NUMERIC,
  compare_at_price NUMERIC,
  cost_per_item NUMERIC,
  inventory_quantity INTEGER,
  inventory_tracker TEXT,
  continue_selling_when_out_of_stock TEXT,
  weight_value_grams NUMERIC,
  weight_unit_display TEXT,
  requires_shipping BOOLEAN,
  fulfillment_service TEXT,
  variant_image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.shopify_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read shopify_variants" ON public.shopify_variants FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert shopify_variants" ON public.shopify_variants FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update shopify_variants" ON public.shopify_variants FOR UPDATE TO authenticated USING (true);

-- 10) shopify_connections
CREATE TABLE public.shopify_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_domain TEXT,
  api_version TEXT,
  access_token_encrypted TEXT,
  granted_scopes TEXT[],
  shop_name TEXT,
  primary_location_id TEXT,
  online_store_publication_id TEXT,
  webhook_secret_encrypted TEXT,
  last_successful_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.shopify_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners/managers can read shopify_connections" ON public.shopify_connections FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
);
CREATE POLICY "Owners can manage shopify_connections" ON public.shopify_connections FOR ALL USING (public.has_role(auth.uid(), 'owner'));

-- 11) shopify_sync_runs
CREATE TABLE public.shopify_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_mode TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status TEXT,
  cursor_start TEXT,
  cursor_end TEXT,
  items_processed INTEGER,
  items_created INTEGER,
  items_updated INTEGER,
  error_count INTEGER,
  notes TEXT
);
ALTER TABLE public.shopify_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read shopify_sync_runs" ON public.shopify_sync_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert shopify_sync_runs" ON public.shopify_sync_runs FOR INSERT TO authenticated WITH CHECK (true);

-- 12) shopify_products
CREATE TABLE public.shopify_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID,
  shopify_product_gid TEXT,
  handle TEXT,
  raw_payload JSONB,
  sync_hash TEXT,
  sync_status TEXT,
  last_synced_at TIMESTAMPTZ
);
ALTER TABLE public.shopify_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read shopify_products" ON public.shopify_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert shopify_products" ON public.shopify_products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update shopify_products" ON public.shopify_products FOR UPDATE TO authenticated USING (true);

-- 13) shopify_media
CREATE TABLE public.shopify_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID,
  shopify_product_gid TEXT,
  shopify_media_gid TEXT,
  raw_payload JSONB,
  sync_status TEXT,
  last_synced_at TIMESTAMPTZ
);
ALTER TABLE public.shopify_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read shopify_media" ON public.shopify_media FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert shopify_media" ON public.shopify_media FOR INSERT TO authenticated WITH CHECK (true);

-- 14) shopify_write_jobs
CREATE TABLE public.shopify_write_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id),
  shopify_product_gid TEXT,
  operation_type TEXT,
  request_payload JSONB,
  response_payload JSONB,
  status TEXT,
  error_message TEXT,
  retry_count INTEGER,
  queued_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
ALTER TABLE public.shopify_write_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read shopify_write_jobs" ON public.shopify_write_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert shopify_write_jobs" ON public.shopify_write_jobs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update shopify_write_jobs" ON public.shopify_write_jobs FOR UPDATE TO authenticated USING (true);

-- 15) export_batches
CREATE TABLE public.export_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_name TEXT,
  platform TEXT,
  product_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID,
  file_url TEXT
);
ALTER TABLE public.export_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read export_batches" ON public.export_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert export_batches" ON public.export_batches FOR INSERT TO authenticated WITH CHECK (true);

-- 16) ebay_categories
CREATE TABLE public.ebay_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id TEXT,
  category_name TEXT
);
ALTER TABLE public.ebay_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read ebay_categories" ON public.ebay_categories FOR SELECT TO authenticated USING (true);

-- 17) shopify_categories
CREATE TABLE public.shopify_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_category TEXT,
  shopify_path TEXT,
  google_shopping_path TEXT
);
ALTER TABLE public.shopify_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read shopify_categories" ON public.shopify_categories FOR SELECT TO authenticated USING (true);

-- 18) category_mappings
CREATE TABLE public.category_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  z_department TEXT,
  z_category TEXT,
  product_keywords TEXT[],
  ebay_category_id TEXT,
  ebay_category_name TEXT,
  shopify_product_category TEXT,
  shopify_type TEXT,
  confidence NUMERIC,
  is_active BOOLEAN DEFAULT true
);
ALTER TABLE public.category_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read category_mappings" ON public.category_mappings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage category_mappings" ON public.category_mappings FOR ALL TO authenticated USING (true);

-- 19) compliance_rules
CREATE TABLE public.compliance_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name TEXT,
  rule_type TEXT,
  match_field TEXT,
  operator TEXT,
  match_value TEXT,
  action TEXT CHECK (action IN ('permit','review','block')),
  reason TEXT,
  priority INTEGER,
  is_active BOOLEAN DEFAULT true
);
ALTER TABLE public.compliance_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read compliance_rules" ON public.compliance_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owners/managers can manage compliance_rules" ON public.compliance_rules FOR ALL TO authenticated USING (
  public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
);

-- 20) change_log
CREATE TABLE public.change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT,
  entity_id UUID,
  action TEXT,
  changed_by UUID,
  before_json JSONB,
  after_json JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read change_log" ON public.change_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert change_log" ON public.change_log FOR INSERT TO authenticated WITH CHECK (true);

-- Storage bucket for product images
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true);
CREATE POLICY "Public can view product images" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
CREATE POLICY "Authenticated can upload product images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images');
CREATE POLICY "Authenticated can update product images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'product-images');
CREATE POLICY "Authenticated can delete product images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'product-images');
