
-- Pricebook import runs log
CREATE TABLE public.pricebook_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler text NOT NULL,
  filename text,
  total_rows integer DEFAULT 0,
  matched_count integer DEFAULT 0,
  created_count integer DEFAULT 0,
  conflict_count integer DEFAULT 0,
  skipped_count integer DEFAULT 0,
  error_count integer DEFAULT 0,
  dry_run boolean DEFAULT false,
  status text DEFAULT 'pending',
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  imported_by uuid,
  notes text
);

ALTER TABLE public.pricebook_import_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read pricebook_import_runs"
  ON public.pricebook_import_runs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert pricebook_import_runs"
  ON public.pricebook_import_runs FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update pricebook_import_runs"
  ON public.pricebook_import_runs FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

-- Wholesaler SKU links
CREATE TABLE public.wholesaler_skus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  wholesaler text NOT NULL,
  pde text,
  barcode text,
  product_name text,
  generic_name text,
  cost_ex_gst numeric,
  cost_inc_gst numeric,
  last_import_run_id uuid REFERENCES public.pricebook_import_runs(id),
  last_updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(wholesaler, pde)
);

ALTER TABLE public.wholesaler_skus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read wholesaler_skus"
  ON public.wholesaler_skus FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert wholesaler_skus"
  ON public.wholesaler_skus FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update wholesaler_skus"
  ON public.wholesaler_skus FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

-- Import conflicts for manual review
CREATE TABLE public.product_import_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_run_id uuid REFERENCES public.pricebook_import_runs(id),
  wholesaler text NOT NULL,
  pde text,
  barcode text,
  product_name text,
  generic_name text,
  cost_ex_gst numeric,
  cost_inc_gst numeric,
  candidate_product_ids uuid[] DEFAULT '{}',
  conflict_reason text,
  resolution text DEFAULT 'pending',
  resolved_product_id uuid REFERENCES public.products(id),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  raw_row jsonb
);

ALTER TABLE public.product_import_conflicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read product_import_conflicts"
  ON public.product_import_conflicts FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert product_import_conflicts"
  ON public.product_import_conflicts FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update product_import_conflicts"
  ON public.product_import_conflicts FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX idx_wholesaler_skus_product ON public.wholesaler_skus(product_id);
CREATE INDEX idx_wholesaler_skus_barcode ON public.wholesaler_skus(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_wholesaler_skus_pde ON public.wholesaler_skus(wholesaler, pde);
CREATE INDEX idx_conflicts_run ON public.product_import_conflicts(import_run_id);
