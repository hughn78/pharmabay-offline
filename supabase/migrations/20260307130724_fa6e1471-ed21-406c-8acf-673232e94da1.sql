
-- ============================================================
-- 1. Settings table for pharmacy details, pricing, shipping
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL UNIQUE,
  setting_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated can read app_settings"
    ON public.app_settings FOR SELECT TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Owners managers can manage app_settings"
    ON public.app_settings FOR ALL TO authenticated
    USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Seed default setting keys (ignore if already exist)
INSERT INTO public.app_settings (setting_key, setting_value) VALUES
  ('pharmacy_details', '{"store_name": "", "address": "", "abn": ""}'::jsonb),
  ('pricing_defaults', '{"default_markup_percent": 30, "minimum_margin_percent": 15, "reserve_stock": 2}'::jsonb),
  ('ebay_shipping', '{"location": "", "dispatch_time_days": 2}'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================================
-- 2. Performance indexes on common FK and filter columns
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_products_compliance_status ON public.products (compliance_status);
CREATE INDEX IF NOT EXISTS idx_products_enrichment_status ON public.products (enrichment_status);
CREATE INDEX IF NOT EXISTS idx_products_updated_at ON public.products (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products (barcode);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products (sku);

CREATE INDEX IF NOT EXISTS idx_ebay_drafts_product_id ON public.ebay_drafts (product_id);
CREATE INDEX IF NOT EXISTS idx_ebay_drafts_channel_status ON public.ebay_drafts (channel_status);

CREATE INDEX IF NOT EXISTS idx_shopify_drafts_product_id ON public.shopify_drafts (product_id);
CREATE INDEX IF NOT EXISTS idx_shopify_drafts_channel_status ON public.shopify_drafts (channel_status);

CREATE INDEX IF NOT EXISTS idx_shopify_variants_product_id ON public.shopify_variants (product_id);
CREATE INDEX IF NOT EXISTS idx_shopify_variants_shopify_draft_id ON public.shopify_variants (shopify_draft_id);
CREATE INDEX IF NOT EXISTS idx_shopify_variants_barcode ON public.shopify_variants (barcode);
CREATE INDEX IF NOT EXISTS idx_shopify_variants_sku ON public.shopify_variants (sku);

CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON public.product_images (product_id);

CREATE INDEX IF NOT EXISTS idx_stock_sync_items_sync_run_id ON public.stock_sync_items (sync_run_id);
CREATE INDEX IF NOT EXISTS idx_stock_sync_items_sync_status ON public.stock_sync_items (sync_status);
CREATE INDEX IF NOT EXISTS idx_stock_sync_items_match_confidence ON public.stock_sync_items (match_confidence);

CREATE INDEX IF NOT EXISTS idx_inventory_snapshots_product_id ON public.inventory_snapshots (product_id);
CREATE INDEX IF NOT EXISTS idx_change_log_entity_id ON public.change_log (entity_id);
CREATE INDEX IF NOT EXISTS idx_shopify_products_shopify_product_gid ON public.shopify_products (shopify_product_gid);

-- ============================================================
-- 3. updated_at triggers
-- ============================================================
CREATE OR REPLACE TRIGGER set_updated_at_products
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER set_updated_at_ebay_drafts
  BEFORE UPDATE ON public.ebay_drafts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER set_updated_at_shopify_drafts
  BEFORE UPDATE ON public.shopify_drafts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER set_updated_at_shopify_variants
  BEFORE UPDATE ON public.shopify_variants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER set_updated_at_product_images
  BEFORE UPDATE ON public.product_images
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER set_updated_at_shopify_connections
  BEFORE UPDATE ON public.shopify_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER set_updated_at_app_settings
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 4. Change default compliance_status for new products to 'pending'
-- ============================================================
ALTER TABLE public.products ALTER COLUMN compliance_status SET DEFAULT 'pending';

-- ============================================================
-- 5. SKU unique index (skip barcode - has existing duplicates)
-- Note: Barcode uniqueness skipped because existing data has duplicates.
-- A data cleanup task is needed before enabling unique constraint on barcode.
-- ============================================================
