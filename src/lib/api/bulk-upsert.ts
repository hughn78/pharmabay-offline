import { supabase } from "@/integrations/supabase/client";

export type BulkUpsertMode = "fill_blanks" | "overwrite";

export interface BulkUpsertResult {
  success: boolean;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/**
 * Send an array of product objects to the bulk-product-upsert edge function.
 * Products are matched by barcode → sku → source_product_name.
 */
export async function bulkProductUpsert(
  products: Record<string, any>[],
  mode: BulkUpsertMode = "fill_blanks"
): Promise<BulkUpsertResult> {
  const { data, error } = await supabase.functions.invoke("bulk-product-upsert", {
    body: { products, mode },
  });

  if (error) {
    return { success: false, inserted: 0, updated: 0, skipped: 0, errors: [error.message] };
  }

  return data as BulkUpsertResult;
}
