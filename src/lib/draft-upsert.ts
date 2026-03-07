import { supabase } from "@/integrations/supabase/client";

/**
 * Upsert an eBay draft for a product. Returns the draft id.
 */
export async function upsertEbayDraft(
  productId: string,
  data: Record<string, any>
): Promise<string> {
  const { data: existing } = await supabase
    .from("ebay_drafts")
    .select("id")
    .eq("product_id", productId)
    .maybeSingle();

  const payload = {
    ...data,
    product_id: productId,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("ebay_drafts")
      .update(payload)
      .eq("id", existing.id);
    if (error) throw error;
    return existing.id;
  } else {
    const { data: inserted, error } = await supabase
      .from("ebay_drafts")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return inserted.id;
  }
}

/**
 * Upsert a Shopify draft for a product. Returns the draft id.
 */
export async function upsertShopifyDraft(
  productId: string,
  data: Record<string, any>
): Promise<string> {
  const { data: existing } = await supabase
    .from("shopify_drafts")
    .select("id")
    .eq("product_id", productId)
    .maybeSingle();

  const payload = {
    ...data,
    product_id: productId,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("shopify_drafts")
      .update(payload)
      .eq("id", existing.id);
    if (error) throw error;
    return existing.id;
  } else {
    const { data: inserted, error } = await supabase
      .from("shopify_drafts")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return inserted.id;
  }
}
