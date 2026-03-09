
-- ── Market Research tables ──

CREATE TABLE public.market_research_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  triggered_by uuid,
  status text DEFAULT 'pending',
  total_products integer DEFAULT 0,
  success_count integer DEFAULT 0,
  partial_count integer DEFAULT 0,
  failed_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.market_research_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read market_research_runs" ON public.market_research_runs FOR SELECT USING (true);
CREATE POLICY "Authenticated insert market_research_runs" ON public.market_research_runs FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated update market_research_runs" ON public.market_research_runs FOR UPDATE USING (true);

-- ──

CREATE TABLE public.product_research_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  research_run_id uuid REFERENCES public.market_research_runs(id) ON DELETE CASCADE,
  queued_at timestamp with time zone DEFAULT now(),
  queued_by uuid,
  status text DEFAULT 'queued',
  priority integer DEFAULT 0,
  last_attempt_at timestamp with time zone,
  error_message text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.product_research_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read product_research_queue" ON public.product_research_queue FOR SELECT USING (true);
CREATE POLICY "Authenticated insert product_research_queue" ON public.product_research_queue FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated update product_research_queue" ON public.product_research_queue FOR UPDATE USING (true);

-- ──

CREATE TABLE public.product_research_results (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  research_run_id uuid REFERENCES public.market_research_runs(id) ON DELETE SET NULL,
  queue_item_id uuid REFERENCES public.product_research_queue(id) ON DELETE SET NULL,
  source_domain text,
  source_url text,
  source_title text,
  extracted_payload jsonb DEFAULT '{}',
  confidence_score numeric DEFAULT 0,
  fields_found text[] DEFAULT '{}',
  auto_filled_fields text[] DEFAULT '{}',
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.product_research_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read product_research_results" ON public.product_research_results FOR SELECT USING (true);
CREATE POLICY "Authenticated insert product_research_results" ON public.product_research_results FOR INSERT WITH CHECK (true);

-- ──

CREATE TABLE public.product_enrichment_summary (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE UNIQUE,
  last_researched_at timestamp with time zone,
  overall_confidence numeric DEFAULT 0,
  fields_filled_count integer DEFAULT 0,
  fields_blank_count integer DEFAULT 0,
  needs_review boolean DEFAULT false,
  source_count integer DEFAULT 0,
  research_notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.product_enrichment_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read product_enrichment_summary" ON public.product_enrichment_summary FOR SELECT USING (true);
CREATE POLICY "Authenticated insert product_enrichment_summary" ON public.product_enrichment_summary FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated update product_enrichment_summary" ON public.product_enrichment_summary FOR UPDATE USING (true);

-- ── Triggers ──

CREATE TRIGGER update_market_research_runs_updated_at
  BEFORE UPDATE ON public.market_research_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_product_research_queue_updated_at
  BEFORE UPDATE ON public.product_research_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_product_enrichment_summary_updated_at
  BEFORE UPDATE ON public.product_enrichment_summary
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Indexes ──

CREATE INDEX idx_prq_product ON public.product_research_queue(product_id);
CREATE INDEX idx_prq_run ON public.product_research_queue(research_run_id);
CREATE INDEX idx_prq_status ON public.product_research_queue(status);
CREATE INDEX idx_prr_product ON public.product_research_results(product_id);
CREATE INDEX idx_prr_run ON public.product_research_results(research_run_id);
CREATE INDEX idx_pes_product ON public.product_enrichment_summary(product_id);
