
-- ============================================================
-- Channel Listing Import Tables
-- ============================================================

-- 1. Import batch metadata
CREATE TABLE public.channel_listing_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL CHECK (platform IN ('ebay', 'shopify')),
  filename text,
  imported_by uuid,
  imported_at timestamptz NOT NULL DEFAULT now(),
  row_count integer DEFAULT 0,
  matched_count integer DEFAULT 0,
  unmatched_count integer DEFAULT 0,
  ambiguous_count integer DEFAULT 0,
  error_count integer DEFAULT 0,
  notes text
);

ALTER TABLE public.channel_listing_import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read channel_listing_import_batches" ON public.channel_listing_import_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert channel_listing_import_batches" ON public.channel_listing_import_batches FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update channel_listing_import_batches" ON public.channel_listing_import_batches FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 2. eBay live listings
CREATE TABLE public.ebay_live_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id),
  ebay_item_number text,
  title text,
  variation_details text,
  custom_label_sku text,
  available_quantity integer,
  format text,
  currency text,
  start_price numeric,
  auction_buy_it_now_price numeric,
  reserve_price numeric,
  current_price numeric,
  sold_quantity integer,
  watchers integer,
  bids integer,
  start_date text,
  end_date text,
  ebay_category_1_name text,
  ebay_category_1_number text,
  ebay_category_2_name text,
  ebay_category_2_number text,
  condition text,
  cd_professional_grader text,
  cd_grade text,
  cda_certification_number text,
  cd_card_condition text,
  ebay_product_id_epid text,
  listing_site text,
  upc text,
  ean text,
  isbn text,
  raw_row jsonb,
  import_batch_id uuid REFERENCES public.channel_listing_import_batches(id),
  imported_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ebay_live_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read ebay_live_listings" ON public.ebay_live_listings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert ebay_live_listings" ON public.ebay_live_listings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update ebay_live_listings" ON public.ebay_live_listings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Unique on item number for upsert
CREATE UNIQUE INDEX idx_ebay_live_listings_item_number ON public.ebay_live_listings (ebay_item_number) WHERE ebay_item_number IS NOT NULL;
CREATE INDEX idx_ebay_live_listings_product_id ON public.ebay_live_listings (product_id);
CREATE INDEX idx_ebay_live_listings_batch ON public.ebay_live_listings (import_batch_id);
CREATE INDEX idx_ebay_live_listings_sku ON public.ebay_live_listings (custom_label_sku) WHERE custom_label_sku IS NOT NULL;

-- updated_at trigger
CREATE TRIGGER set_ebay_live_listings_updated_at BEFORE UPDATE ON public.ebay_live_listings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Shopify live products
CREATE TABLE public.shopify_live_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id),
  handle text,
  title text,
  body_html text,
  vendor text,
  product_category text,
  type text,
  tags text,
  published text,
  option1_name text,
  option1_value text,
  option1_linked_to text,
  option2_name text,
  option2_value text,
  option2_linked_to text,
  option3_name text,
  option3_value text,
  option3_linked_to text,
  variant_sku text,
  variant_grams numeric,
  variant_inventory_tracker text,
  variant_inventory_policy text,
  variant_fulfillment_service text,
  variant_price numeric,
  variant_compare_at_price numeric,
  variant_requires_shipping text,
  variant_taxable text,
  unit_price_total_measure text,
  unit_price_total_measure_unit text,
  unit_price_base_measure text,
  unit_price_base_measure_unit text,
  variant_barcode text,
  image_src text,
  image_position integer,
  image_alt_text text,
  gift_card text,
  seo_title text,
  seo_description text,
  google_product_category text,
  google_gender text,
  google_age_group text,
  google_mpn text,
  google_condition text,
  google_custom_product text,
  google_custom_label_0 text,
  google_custom_label_1 text,
  google_custom_label_2 text,
  google_custom_label_3 text,
  google_custom_label_4 text,
  mm_google_custom_product text,
  product_rating_count text,
  metafield_age_group text,
  metafield_coil_connection text,
  metafield_color_pattern text,
  metafield_dietary_preferences text,
  metafield_ecigarette_style text,
  metafield_ingredient_category text,
  metafield_usage_type text,
  metafield_vaping_style text,
  variant_image text,
  variant_weight_unit text,
  variant_tax_code text,
  cost_per_item numeric,
  status text,
  raw_row jsonb,
  import_batch_id uuid REFERENCES public.channel_listing_import_batches(id),
  imported_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shopify_live_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read shopify_live_products" ON public.shopify_live_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert shopify_live_products" ON public.shopify_live_products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update shopify_live_products" ON public.shopify_live_products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Composite unique for upsert: handle + variant_sku + option values
CREATE UNIQUE INDEX idx_shopify_live_products_upsert ON public.shopify_live_products (
  COALESCE(handle, ''), COALESCE(variant_sku, ''), COALESCE(option1_value, ''), COALESCE(option2_value, ''), COALESCE(image_src, '')
);
CREATE INDEX idx_shopify_live_products_product_id ON public.shopify_live_products (product_id);
CREATE INDEX idx_shopify_live_products_batch ON public.shopify_live_products (import_batch_id);
CREATE INDEX idx_shopify_live_products_handle ON public.shopify_live_products (handle) WHERE handle IS NOT NULL;
CREATE INDEX idx_shopify_live_products_variant_sku ON public.shopify_live_products (variant_sku) WHERE variant_sku IS NOT NULL;
CREATE INDEX idx_shopify_live_products_variant_barcode ON public.shopify_live_products (variant_barcode) WHERE variant_barcode IS NOT NULL;

CREATE TRIGGER set_shopify_live_products_updated_at BEFORE UPDATE ON public.shopify_live_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Channel listing matches
CREATE TABLE public.channel_listing_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL CHECK (platform IN ('ebay', 'shopify')),
  import_row_id uuid NOT NULL,
  product_id uuid REFERENCES public.products(id),
  match_method text,
  match_confidence text,
  is_confirmed boolean DEFAULT false,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.channel_listing_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read channel_listing_matches" ON public.channel_listing_matches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert channel_listing_matches" ON public.channel_listing_matches FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update channel_listing_matches" ON public.channel_listing_matches FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_channel_listing_matches_row ON public.channel_listing_matches (import_row_id);
CREATE INDEX idx_channel_listing_matches_product ON public.channel_listing_matches (product_id);
CREATE INDEX idx_channel_listing_matches_platform ON public.channel_listing_matches (platform);
