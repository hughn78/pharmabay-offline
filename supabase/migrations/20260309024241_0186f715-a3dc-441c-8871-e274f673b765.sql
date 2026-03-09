
ALTER TABLE public.ebay_categories
  ADD COLUMN IF NOT EXISTS parent_category_id text,
  ADD COLUMN IF NOT EXISTS is_leaf boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS category_level integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_ebay_categories_name_trgm
  ON public.ebay_categories USING gin (category_name public.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_ebay_categories_category_id
  ON public.ebay_categories (category_id);

-- Allow service role to insert via edge function (RLS already has SELECT for authenticated)
CREATE POLICY "Service role can manage ebay_categories"
  ON public.ebay_categories FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
