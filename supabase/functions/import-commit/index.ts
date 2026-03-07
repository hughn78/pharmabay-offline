import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ImportRow {
  action: "insert" | "update";
  productData: Record<string, any>;
  matchedProductId?: string;
  sheetRow: number;
}

interface ImportRequest {
  filename: string;
  rows: ImportRow[];
  totalValid: number;
  skippedCount: number;
  firstProductRow: number;
  footerRowsRemoved: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify JWT
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: ImportRequest = await req.json();
    const { filename, rows, totalValid, skippedCount, firstProductRow, footerRowsRemoved } = body;

    if (!rows || rows.length === 0) {
      return jsonResponse({ error: "No rows to import" }, 400);
    }

    // Use a database function for atomic transaction
    // We'll do batch operations with the service role client

    const inserts = rows.filter((r) => r.action === "insert");
    const updates = rows.filter((r) => r.action === "update");

    let newCount = 0;
    let updatedCount = 0;
    let snapshotsCreated = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Create import batch record first
    const { data: batchData, error: batchError } = await supabase
      .from("import_batches")
      .insert({
        filename,
        row_count: totalValid,
        new_count: inserts.length,
        updated_count: updates.length,
        skipped_count: skippedCount,
        error_count: 0,
        imported_by: user.id,
        import_notes: `First product row: ${firstProductRow}, Footer rows removed: ${footerRowsRemoved}`,
      })
      .select("id")
      .single();

    if (batchError) {
      return jsonResponse({ error: `Failed to create import batch: ${batchError.message}` }, 500);
    }

    const batchId = batchData.id;
    const snapshotDate = new Date().toISOString().split("T")[0];

    // ── Batch inserts (new products) ──
    if (inserts.length > 0) {
      const BATCH_SIZE = 50;
      for (let i = 0; i < inserts.length; i += BATCH_SIZE) {
        const batch = inserts.slice(i, i + BATCH_SIZE);
        const insertPayloads = batch.map((r) => ({
          ...r.productData,
          compliance_status: "pending",
          enrichment_status: "pending",
        }));

        const { data: insertedProducts, error: insertError } = await supabase
          .from("products")
          .insert(insertPayloads)
          .select("id, stock_on_hand, sell_price, cost_price, stock_value, units_sold_12m");

        if (insertError) {
          errorCount += batch.length;
          errors.push(`Batch insert error (rows ${i + 1}-${i + batch.length}): ${insertError.message}`);
          continue;
        }

        newCount += insertedProducts.length;

        // Create inventory snapshots for new products
        if (insertedProducts.length > 0) {
          const snapshots = insertedProducts.map((p: any) => ({
            product_id: p.id,
            snapshot_date: snapshotDate,
            stock_on_hand: p.stock_on_hand,
            sell_price: p.sell_price,
            cost_price: p.cost_price,
            stock_value: p.stock_value,
            units_sold_12m: p.units_sold_12m,
            source_batch_id: batchId,
          }));

          const { error: snapError } = await supabase.from("inventory_snapshots").insert(snapshots);
          if (!snapError) {
            snapshotsCreated += snapshots.length;
          }
        }
      }
    }

    // ── Batch updates (existing products) ──
    // Updates must be done individually since each targets a different row
    if (updates.length > 0) {
      for (const item of updates) {
        try {
          if (!item.matchedProductId) {
            throw new Error("Missing matched product ID");
          }

          const { error: updateError } = await supabase
            .from("products")
            .update(item.productData)
            .eq("id", item.matchedProductId);

          if (updateError) throw updateError;
          updatedCount++;

          // Create inventory snapshot
          const { error: snapError } = await supabase.from("inventory_snapshots").insert({
            product_id: item.matchedProductId,
            snapshot_date: snapshotDate,
            stock_on_hand: item.productData.stock_on_hand,
            sell_price: item.productData.sell_price,
            cost_price: item.productData.cost_price,
            stock_value: item.productData.stock_value,
            units_sold_12m: item.productData.units_sold_12m,
            source_batch_id: batchId,
          });
          if (!snapError) snapshotsCreated++;
        } catch (err: any) {
          errorCount++;
          errors.push(`Row ${item.sheetRow}: ${err.message}`);
        }
      }
    }

    // Update batch record with final counts
    await supabase
      .from("import_batches")
      .update({
        new_count: newCount,
        updated_count: updatedCount,
        error_count: errorCount,
      })
      .eq("id", batchId);

    return jsonResponse({
      success: true,
      batchId,
      newCount,
      updatedCount,
      skippedCount,
      snapshotsCreated,
      errorCount,
      errors: errors.slice(0, 20), // limit error messages
    });
  } catch (err: any) {
    console.error("Import commit error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
