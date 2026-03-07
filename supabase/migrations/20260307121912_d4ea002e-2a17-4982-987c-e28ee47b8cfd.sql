
-- Fix ebay_drafts: drop restrictive policies and create permissive ones
DROP POLICY IF EXISTS "Authenticated can insert ebay_drafts" ON public.ebay_drafts;
DROP POLICY IF EXISTS "Authenticated can read ebay_drafts" ON public.ebay_drafts;
DROP POLICY IF EXISTS "Authenticated can update ebay_drafts" ON public.ebay_drafts;

CREATE POLICY "Authenticated can read ebay_drafts" ON public.ebay_drafts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert ebay_drafts" ON public.ebay_drafts
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update ebay_drafts" ON public.ebay_drafts
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Fix shopify_drafts: drop restrictive policies and create permissive ones
DROP POLICY IF EXISTS "Authenticated can insert shopify_drafts" ON public.shopify_drafts;
DROP POLICY IF EXISTS "Authenticated can read shopify_drafts" ON public.shopify_drafts;
DROP POLICY IF EXISTS "Authenticated can update shopify_drafts" ON public.shopify_drafts;

CREATE POLICY "Authenticated can read shopify_drafts" ON public.shopify_drafts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert shopify_drafts" ON public.shopify_drafts
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update shopify_drafts" ON public.shopify_drafts
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Fix export_batches too
DROP POLICY IF EXISTS "Authenticated can insert export_batches" ON public.export_batches;
DROP POLICY IF EXISTS "Authenticated can read export_batches" ON public.export_batches;

CREATE POLICY "Authenticated can read export_batches" ON public.export_batches
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert export_batches" ON public.export_batches
  FOR INSERT TO authenticated WITH CHECK (true);

-- Fix product_images
DROP POLICY IF EXISTS "Authenticated can insert product_images" ON public.product_images;
DROP POLICY IF EXISTS "Authenticated can read product_images" ON public.product_images;
DROP POLICY IF EXISTS "Authenticated can update product_images" ON public.product_images;

CREATE POLICY "Authenticated can read product_images" ON public.product_images
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert product_images" ON public.product_images
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update product_images" ON public.product_images
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Fix compliance_rules
DROP POLICY IF EXISTS "Authenticated can read compliance_rules" ON public.compliance_rules;
DROP POLICY IF EXISTS "Owners/managers can manage compliance_rules" ON public.compliance_rules;

CREATE POLICY "Authenticated can read compliance_rules" ON public.compliance_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owners managers can manage compliance_rules" ON public.compliance_rules
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Fix shopify_variants
DROP POLICY IF EXISTS "Authenticated can insert shopify_variants" ON public.shopify_variants;
DROP POLICY IF EXISTS "Authenticated can read shopify_variants" ON public.shopify_variants;
DROP POLICY IF EXISTS "Authenticated can update shopify_variants" ON public.shopify_variants;

CREATE POLICY "Authenticated can read shopify_variants" ON public.shopify_variants
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert shopify_variants" ON public.shopify_variants
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update shopify_variants" ON public.shopify_variants
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
