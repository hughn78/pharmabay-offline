
-- eBay connections table
CREATE TABLE IF NOT EXISTS public.ebay_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL DEFAULT 'production',
  client_id text,
  ru_name text,
  refresh_token_encrypted text,
  access_token_encrypted text,
  access_token_expires_at timestamptz,
  connected_username text,
  connection_status text DEFAULT 'disconnected',
  marketplace_id text DEFAULT 'EBAY_AU',
  merchant_location_key text,
  fulfillment_policy_id text,
  payment_policy_id text,
  return_policy_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.ebay_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage ebay_connections" ON public.ebay_connections
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Owners managers can read ebay_connections" ON public.ebay_connections
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER set_ebay_connections_updated_at
  BEFORE UPDATE ON public.ebay_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add new columns to ebay_drafts
ALTER TABLE public.ebay_drafts ADD COLUMN IF NOT EXISTS ebay_inventory_sku text;
ALTER TABLE public.ebay_drafts ADD COLUMN IF NOT EXISTS ebay_offer_id text;
ALTER TABLE public.ebay_drafts ADD COLUMN IF NOT EXISTS ebay_listing_url text;
ALTER TABLE public.ebay_drafts ADD COLUMN IF NOT EXISTS ebay_marketplace_id text DEFAULT 'EBAY_AU';
ALTER TABLE public.ebay_drafts ADD COLUMN IF NOT EXISTS ebay_last_synced_at timestamptz;
ALTER TABLE public.ebay_drafts ADD COLUMN IF NOT EXISTS ebay_last_error text;

-- Add operation_type to ebay_publish_jobs if missing
ALTER TABLE public.ebay_publish_jobs ADD COLUMN IF NOT EXISTS operation_type text;
