import { supabase } from "@/integrations/supabase/client";
import type { MatchResult } from "./channel-import-matcher";

/**
 * Commit eBay live listing rows to the database.
 * - Upserts into ebay_live_listings by ebay_item_number
 * - Creates match records
 * - Updates ebay_drafts for matched products
 */
export async function commitEbayImport(
  rows: Record<string, any>[],
  matches: MatchResult[],
  batchId: string
) {
  const stats = { inserted: 0, updated: 0, matchesCreated: 0, draftsUpdated: 0 };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const match = matches[i];
    const productId = match?.product_id || null;

    // Remove internal fields
    const { _rowIndex, raw_row, ...mappedFields } = row;

    const payload: Record<string, any> = {
      ...mappedFields,
      raw_row: raw_row || row,
      product_id: productId,
      import_batch_id: batchId,
      imported_at: new Date().toISOString(),
    };

    // Upsert by item number
    if (payload.ebay_item_number) {
      const { data: existing } = await supabase
        .from("ebay_live_listings")
        .select("id")
        .eq("ebay_item_number", payload.ebay_item_number)
        .maybeSingle();

      if (existing?.id) {
        await supabase.from("ebay_live_listings").update(payload).eq("id", existing.id);
        stats.updated++;
      } else {
        const { data: ins } = await supabase.from("ebay_live_listings").insert(payload).select("id").single();
        stats.inserted++;

        // Create match record
        if (ins && match) {
          await supabase.from("channel_listing_matches").insert({
            platform: "ebay",
            import_row_id: ins.id,
            product_id: productId,
            match_method: match.match_method,
            match_confidence: match.match_confidence,
            is_confirmed: match.match_confidence === "high" && !match.ambiguous,
          });
          stats.matchesCreated++;
        }
      }
    } else {
      const { data: ins } = await supabase.from("ebay_live_listings").insert(payload).select("id").single();
      stats.inserted++;
      if (ins && match) {
        await supabase.from("channel_listing_matches").insert({
          platform: "ebay",
          import_row_id: ins.id,
          product_id: productId,
          match_method: match.match_method,
          match_confidence: match.match_confidence,
          is_confirmed: false,
        });
        stats.matchesCreated++;
      }
    }

    // Update eBay draft for matched products
    if (productId && match?.match_confidence !== "none") {
      const draftPayload: Record<string, any> = {
        product_id: productId,
        published_listing_id: payload.ebay_item_number || null,
        channel_status: "published",
        title: payload.title || undefined,
        category_id: payload.ebay_category_1_number || undefined,
        category_name: payload.ebay_category_1_name || undefined,
        epid: payload.ebay_product_id_epid || undefined,
        upc: payload.upc || undefined,
        ean: payload.ean || undefined,
        start_price: payload.start_price || undefined,
        buy_it_now_price: payload.auction_buy_it_now_price || payload.current_price || undefined,
        quantity: payload.available_quantity || undefined,
        condition_id: payload.condition || undefined,
        updated_at: new Date().toISOString(),
      };
      // Remove undefined values
      for (const k of Object.keys(draftPayload)) {
        if (draftPayload[k] === undefined) delete draftPayload[k];
      }

      const { data: existingDraft } = await supabase
        .from("ebay_drafts")
        .select("id")
        .eq("product_id", productId)
        .maybeSingle();

      if (existingDraft?.id) {
        await supabase.from("ebay_drafts").update(draftPayload).eq("id", existingDraft.id);
      } else {
        await supabase.from("ebay_drafts").insert(draftPayload);
      }
      stats.draftsUpdated++;
    }
  }

  return stats;
}

/**
 * Commit Shopify live product rows to the database.
 * - Upserts into shopify_live_products by composite key
 * - Creates match records
 * - Updates shopify_drafts and shopify_variants for matched products
 */
export async function commitShopifyImport(
  rows: Record<string, any>[],
  matches: MatchResult[],
  batchId: string
) {
  const stats = { inserted: 0, updated: 0, matchesCreated: 0, draftsUpdated: 0 };

  // Group rows by handle for multi-row product grouping
  const handleGroups = new Map<string, number[]>();
  rows.forEach((r, i) => {
    const h = (r.handle || "").trim();
    if (h) {
      if (!handleGroups.has(h)) handleGroups.set(h, []);
      handleGroups.get(h)!.push(i);
    }
  });

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const match = matches[i];
    const productId = match?.product_id || null;

    const { _rowIndex, raw_row, ...mappedFields } = row;

    const payload: Record<string, any> = {
      ...mappedFields,
      raw_row: raw_row || row,
      product_id: productId,
      import_batch_id: batchId,
      imported_at: new Date().toISOString(),
    };

    // Try upsert by composite key
    const compositeKey = {
      handle: payload.handle || "",
      variant_sku: payload.variant_sku || "",
      option1_value: payload.option1_value || "",
      option2_value: payload.option2_value || "",
      image_src: payload.image_src || "",
    };

    const { data: existing } = await supabase
      .from("shopify_live_products")
      .select("id")
      .eq("handle", compositeKey.handle)
      .eq("variant_sku", compositeKey.variant_sku || "")
      .limit(1)
      .maybeSingle();

    let rowId: string | null = null;

    if (existing?.id) {
      await supabase.from("shopify_live_products").update(payload).eq("id", existing.id);
      rowId = existing.id;
      stats.updated++;
    } else {
      const { data: ins } = await supabase.from("shopify_live_products").insert(payload).select("id").single();
      rowId = ins?.id || null;
      stats.inserted++;
    }

    // Create match record
    if (rowId && match) {
      await supabase.from("channel_listing_matches").insert({
        platform: "shopify",
        import_row_id: rowId,
        product_id: productId,
        match_method: match.match_method,
        match_confidence: match.match_confidence,
        is_confirmed: match.match_confidence === "high" && !match.ambiguous,
      });
      stats.matchesCreated++;
    }

    // Update Shopify draft for matched products (only first row per handle)
    if (productId && match?.match_confidence !== "none") {
      const handleIdx = handleGroups.get((row.handle || "").trim());
      const isFirstRow = !handleIdx || handleIdx[0] === i;

      if (isFirstRow) {
        const draftPayload: Record<string, any> = {
          product_id: productId,
          channel_status: (payload.status === "active" || payload.published === "true") ? "published" : "draft",
          title: payload.title || undefined,
          handle: payload.handle || undefined,
          vendor: payload.vendor || undefined,
          product_type: payload.type || undefined,
          product_category: payload.product_category || undefined,
          description_html: payload.body_html || undefined,
          seo_title: payload.seo_title || undefined,
          seo_description: payload.seo_description || undefined,
          tags: payload.tags ? payload.tags.split(",").map((t: string) => t.trim()) : undefined,
          google_product_category: payload.google_product_category || undefined,
          google_gender: payload.google_gender || undefined,
          google_age_group: payload.google_age_group || undefined,
          google_mpn: payload.google_mpn || undefined,
          google_condition: payload.google_condition || undefined,
          google_custom_product: payload.google_custom_product === "TRUE" || undefined,
          google_custom_label_0: payload.google_custom_label_0 || undefined,
          google_custom_label_1: payload.google_custom_label_1 || undefined,
          google_custom_label_2: payload.google_custom_label_2 || undefined,
          google_custom_label_3: payload.google_custom_label_3 || undefined,
          google_custom_label_4: payload.google_custom_label_4 || undefined,
          status: payload.status || undefined,
          updated_at: new Date().toISOString(),
        };
        for (const k of Object.keys(draftPayload)) {
          if (draftPayload[k] === undefined) delete draftPayload[k];
        }

        const { data: existingDraft } = await supabase
          .from("shopify_drafts")
          .select("id")
          .eq("product_id", productId)
          .maybeSingle();

        if (existingDraft?.id) {
          await supabase.from("shopify_drafts").update(draftPayload).eq("id", existingDraft.id);
        } else {
          await supabase.from("shopify_drafts").insert(draftPayload);
        }
        stats.draftsUpdated++;
      }

      // Upsert variant data
      if (payload.variant_sku || payload.variant_barcode || payload.variant_price) {
        const variantPayload: Record<string, any> = {
          product_id: productId,
          sku: payload.variant_sku || null,
          barcode: payload.variant_barcode || null,
          price: payload.variant_price || null,
          compare_at_price: payload.variant_compare_at_price || null,
          cost_per_item: payload.cost_per_item || null,
          weight_value_grams: payload.variant_grams || null,
          weight_unit_display: payload.variant_weight_unit || null,
          option1_name: payload.option1_name || null,
          option1_value: payload.option1_value || null,
          option2_name: payload.option2_name || null,
          option2_value: payload.option2_value || null,
          option3_name: payload.option3_name || null,
          option3_value: payload.option3_value || null,
          requires_shipping: payload.variant_requires_shipping === "true",
          inventory_tracker: payload.variant_inventory_tracker || null,
          fulfillment_service: payload.variant_fulfillment_service || null,
          variant_image_url: payload.variant_image || null,
          updated_at: new Date().toISOString(),
        };

        // Find draft to link to
        const { data: draft } = await supabase
          .from("shopify_drafts")
          .select("id")
          .eq("product_id", productId)
          .maybeSingle();

        if (draft?.id) {
          variantPayload.shopify_draft_id = draft.id;
        }

        const { data: existingVariant } = await supabase
          .from("shopify_variants")
          .select("id")
          .eq("product_id", productId)
          .eq("sku", payload.variant_sku || "")
          .maybeSingle();

        if (existingVariant?.id) {
          await supabase.from("shopify_variants").update(variantPayload).eq("id", existingVariant.id);
        } else {
          await supabase.from("shopify_variants").insert(variantPayload);
        }
      }
    }
  }

  return stats;
}
