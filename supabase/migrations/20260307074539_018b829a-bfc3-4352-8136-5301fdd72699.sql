
-- Stock sync job tracking
CREATE TABLE public.stock_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_mode TEXT NOT NULL DEFAULT 'preview',
  status TEXT NOT NULL DEFAULT 'pending',
  import_batch_id UUID REFERENCES public.import_batches(id),
  reserve_buffer INTEGER NOT NULL DEFAULT 0,
  inventory_sync_mode TEXT NOT NULL DEFAULT 'stock_minus_buffer',
  max_qty_cap INTEGER,
  sync_zero_stock BOOLEAN NOT NULL DEFAULT false,
  total_local_products INTEGER DEFAULT 0,
  total_matched INTEGER DEFAULT 0,
  total_update_needed INTEGER DEFAULT 0,
  total_no_match INTEGER DEFAULT 0,
  total_uncertain INTEGER DEFAULT 0,
  total_synced INTEGER DEFAULT 0,
  total_failed INTEGER DEFAULT 0,
  total_skipped INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  started_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.stock_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read stock_sync_runs"
  ON public.stock_sync_runs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert stock_sync_runs"
  ON public.stock_sync_runs FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update stock_sync_runs"
  ON public.stock_sync_runs FOR UPDATE TO authenticated
  USING (true);

-- Stock sync individual items
CREATE TABLE public.stock_sync_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_run_id UUID REFERENCES public.stock_sync_runs(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  local_product_name TEXT,
  local_barcode TEXT,
  local_sku TEXT,
  local_stock_on_hand NUMERIC,
  reserve_buffer INTEGER DEFAULT 0,
  quantity_to_push INTEGER,
  shopify_product_gid TEXT,
  shopify_variant_gid TEXT,
  shopify_inventory_item_id TEXT,
  shopify_location_id TEXT,
  shopify_product_title TEXT,
  shopify_variant_title TEXT,
  shopify_sku TEXT,
  shopify_barcode TEXT,
  current_shopify_qty INTEGER,
  proposed_shopify_qty INTEGER,
  qty_difference INTEGER,
  match_type TEXT,
  match_confidence TEXT DEFAULT 'none',
  sync_status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  request_payload JSONB,
  response_payload JSONB,
  synced_at TIMESTAMPTZ,
  synced_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.stock_sync_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read stock_sync_items"
  ON public.stock_sync_items FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert stock_sync_items"
  ON public.stock_sync_items FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update stock_sync_items"
  ON public.stock_sync_items FOR UPDATE TO authenticated
  USING (true);

-- Add inventory settings columns to shopify_connections
ALTER TABLE public.shopify_connections
  ADD COLUMN IF NOT EXISTS reserve_stock_buffer INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inventory_sync_mode TEXT DEFAULT 'stock_minus_buffer',
  ADD COLUMN IF NOT EXISTS max_qty_cap INTEGER,
  ADD COLUMN IF NOT EXISTS sync_zero_stock BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_sync_matched_only BOOLEAN DEFAULT true;
