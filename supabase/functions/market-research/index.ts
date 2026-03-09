/**
 * market-research edge function
 *
 * Processes a single product_research_queue item:
 *  1. Loads queue item + product from DB
 *  2. Tries to fetch content from known AU pharmacy search pages
 *  3. Extracts JSON-LD / text from the HTML
 *  4. Calls Gemini AI to extract structured product data with per-field confidence scores
 *  5. Stores raw results in product_research_results
 *  6. Merges only HIGH-CONFIDENCE (≥ 0.85) values into the product record (fill-blanks mode)
 *  7. Updates product_enrichment_summary + queue item status
 *
 * Called once per queue item from the frontend (sequential batch processing).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Confidence thresholds ──
const CONF_AUTO_FILL = 0.85; // auto-fill product field (fill blanks only)
const CONF_SUGGEST = 0.60;   // show as suggestion, do not auto-fill

// ── Mapping: AI-extracted field → products table column ──
const FIELD_MAP: Record<string, string> = {
  normalized_product_name: "normalized_product_name",
  brand: "brand",
  manufacturer: "manufacturer",
  pack_size: "pack_size",
  product_form: "product_form",
  strength: "strength",
  ingredients_summary: "ingredients_summary",
  directions_summary: "directions_summary",
  warnings_summary: "warnings_summary",
  short_description: "short_description",
  product_type: "product_type",
  country_of_origin: "country_of_origin",
  storage_requirements: "storage_requirements",
  allergen_information: "allergen_information",
  age_restriction: "age_restriction",
  barcode: "barcode",
  upc: "upc",
  mpn: "mpn",
  artg_number: "artg_number",
};

// ── Helpers ──

function extractTextFromHtml(html: string, maxLen = 6000): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function extractJsonLd(html: string): unknown[] {
  const results: unknown[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try { results.push(JSON.parse(m[1])); } catch { /* skip */ }
  }
  return results;
}

function getPageTitle(html: string): string {
  const m = html.match(/<title[^>]*>(.*?)<\/title>/i);
  return m ? m[1].replace(/<[^>]+>/g, "").trim().slice(0, 120) : "";
}

async function fetchWithTimeout(url: string, ms = 9000): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-AU,en;q=0.9",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function buildSearchQuery(product: Record<string, unknown>): string {
  const parts: string[] = [];
  if (product.brand) parts.push(String(product.brand));
  const name = product.normalized_product_name || product.source_product_name;
  if (name) parts.push(String(name));
  if (product.strength) parts.push(String(product.strength));
  if (product.pack_size) parts.push(String(product.pack_size));
  return parts.join(" ").trim();
}

// ── AI extraction ──
async function extractWithAI(
  product: Record<string, unknown>,
  sources: Array<{ url: string; title: string; text: string; jsonLd: unknown[] }>,
  apiKey: string,
): Promise<Record<string, unknown> | null> {
  const ctx = [
    `Product Name: ${product.normalized_product_name || product.source_product_name || "Unknown"}`,
    product.brand ? `Brand: ${product.brand}` : null,
    product.barcode ? `Barcode/APN/GTIN: ${product.barcode}` : null,
    product.strength ? `Strength: ${product.strength}` : null,
    product.pack_size ? `Pack Size / Quantity: ${product.pack_size}` : null,
    product.product_form ? `Dosage Form: ${product.product_form}` : null,
    product.manufacturer ? `Manufacturer: ${product.manufacturer}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const srcText = sources.length
    ? sources
        .map(
          (s, i) =>
            `--- Source ${i + 1}: ${s.url} ---\nPage Title: ${s.title}\n${s.text.slice(0, 2800)}` +
            (s.jsonLd.length
              ? `\nJSON-LD: ${JSON.stringify(s.jsonLd[0]).slice(0, 800)}`
              : ""),
        )
        .join("\n\n")
    : "No external page content was successfully fetched. Use your training knowledge only, with lower confidence.";

  const prompt = `You are a pharmaceutical product data extractor for Australian pharmacy marketplace listings (eBay AU, Shopify AU).

CRITICAL RULES — READ CAREFULLY:
• ONLY extract information explicitly present in the provided page content OR in your reliable training knowledge about this exact product.
• DO NOT guess. DO NOT invent. DO NOT hallucinate values.
• If you are not certain a value is correct for THIS specific product, set it to null.
• Assign HONEST confidence scores: high confidence only when information is clearly confirmed.
• Never merge different pack sizes, strengths, or variants. If there is ANY doubt about pack size or strength, leave it null.
• For Australian products, barcode is typically EAN-13 / APN (Australian Product Number).

PRODUCT BEING RESEARCHED:
${ctx}

PAGE CONTENT FROM WEB SOURCES:
${srcText}

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "match_confidence": 0.0,
  "source_title": "",
  "fields": {
    "normalized_product_name": null,
    "brand": null,
    "manufacturer": null,
    "pack_size": null,
    "product_form": null,
    "strength": null,
    "ingredients_summary": null,
    "directions_summary": null,
    "warnings_summary": null,
    "short_description": null,
    "key_features": null,
    "product_type": null,
    "country_of_origin": null,
    "storage_requirements": null,
    "allergen_information": null,
    "age_restriction": null,
    "barcode": null,
    "upc": null,
    "mpn": null,
    "artg_number": null,
    "ebay_title_suggestion": null,
    "shopify_title_suggestion": null,
    "image_urls": null
  },
  "confidence": {
    "normalized_product_name": 0.0,
    "brand": 0.0,
    "manufacturer": 0.0,
    "pack_size": 0.0,
    "product_form": 0.0,
    "strength": 0.0,
    "ingredients_summary": 0.0,
    "directions_summary": 0.0,
    "warnings_summary": 0.0,
    "short_description": 0.0,
    "key_features": 0.0,
    "product_type": 0.0,
    "country_of_origin": 0.0,
    "storage_requirements": 0.0,
    "allergen_information": 0.0,
    "age_restriction": 0.0,
    "barcode": 0.0,
    "upc": 0.0,
    "mpn": 0.0,
    "artg_number": 0.0,
    "ebay_title_suggestion": 0.0,
    "shopify_title_suggestion": 0.0,
    "image_urls": 0.0
  },
  "notes": ""
}

Confidence guide:
• 0.90–1.0  — Explicitly confirmed by barcode or identical title+brand+pack across multiple sources
• 0.80–0.89 — Clearly stated, product identity certain
• 0.60–0.79 — Likely correct but minor uncertainty
• 0.40–0.59 — Uncertain / incomplete match
• 0.00–0.39 — Very uncertain or not found (leave field null)`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    });
    if (!res.ok) {
      console.error("AI API error", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content);
  } catch (e) {
    console.error("AI extraction error:", e);
    return null;
  }
}

// ── Main handler ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const token = authHeader.replace("Bearer ", "");
  const { error: authError } = await supabase.auth.getClaims(token);
  if (authError) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const adminSupabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;

  try {
    const { queueItemId } = await req.json();
    if (!queueItemId) {
      return new Response(JSON.stringify({ error: "queueItemId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load queue item + product
    const { data: queueItem, error: qErr } = await adminSupabase
      .from("product_research_queue")
      .select("*, product:products(*)")
      .eq("id", queueItemId)
      .single();

    if (qErr || !queueItem) {
      return new Response(JSON.stringify({ error: "Queue item not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const product = queueItem.product as Record<string, unknown>;

    // → searching
    await adminSupabase
      .from("product_research_queue")
      .update({ status: "searching", last_attempt_at: new Date().toISOString() })
      .eq("id", queueItemId);

    const searchQuery = buildSearchQuery(product);
    console.log(`[market-research] Researching: "${searchQuery}"`);

    // Build candidate URLs (barcode + name searches)
    const barcode = product.barcode as string | null;
    const urls = [
      barcode
        ? `https://www.chemistwarehouse.com.au/search?q=${encodeURIComponent(barcode)}`
        : null,
      `https://www.chemistwarehouse.com.au/search?q=${encodeURIComponent(searchQuery)}`,
      `https://www.priceline.com.au/search?q=${encodeURIComponent(searchQuery)}`,
    ].filter(Boolean) as string[];

    // Deduplicate
    const uniqueUrls = [...new Set(urls)].slice(0, 3);

    // Fetch pages in parallel
    const fetchResults = await Promise.all(
      uniqueUrls.map(async (url) => {
        const html = await fetchWithTimeout(url, 9000);
        if (!html || html.length < 300) return null;
        return {
          url,
          title: getPageTitle(html),
          text: extractTextFromHtml(html),
          jsonLd: extractJsonLd(html),
        };
      }),
    );
    const sources = fetchResults.filter(Boolean) as Array<{
      url: string;
      title: string;
      text: string;
      jsonLd: unknown[];
    }>;

    console.log(`[market-research] Got ${sources.length} usable sources`);

    // → extracting
    await adminSupabase
      .from("product_research_queue")
      .update({ status: "extracting" })
      .eq("id", queueItemId);

    const extracted = await extractWithAI(product, sources, lovableKey);

    if (!extracted) {
      await adminSupabase
        .from("product_research_queue")
        .update({ status: "failed", error_message: "AI extraction returned null" })
        .eq("id", queueItemId);

      // Update run counter
      await adminSupabase
        .from("market_research_runs")
        .update({ failed_count: supabase.raw("failed_count + 1") })
        .eq("id", queueItem.research_run_id)
        .catch(() => null);

      return new Response(
        JSON.stringify({ success: false, error: "AI extraction failed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const fields = (extracted.fields || {}) as Record<string, unknown>;
    const confidence = (extracted.confidence || {}) as Record<string, number>;

    // Determine what was found and what qualifies for auto-fill
    const fieldsFound: string[] = [];
    const autoFillFields: string[] = [];
    const productUpdates: Record<string, unknown> = {};

    for (const [field, value] of Object.entries(fields)) {
      if (value === null || value === undefined || value === "") continue;
      const conf = confidence[field] ?? 0;
      if (conf < CONF_SUGGEST) continue; // below minimum threshold — ignore

      fieldsFound.push(field);

      const productCol = FIELD_MAP[field];
      if (productCol && conf >= CONF_AUTO_FILL) {
        // Only fill if product field is currently empty
        if (!product[productCol]) {
          productUpdates[productCol] = value;
          autoFillFields.push(field);
        }
      }
    }

    // Save research result
    await adminSupabase.from("product_research_results").insert({
      product_id: product.id,
      research_run_id: queueItem.research_run_id,
      queue_item_id: queueItemId,
      source_domain:
        sources.length > 0 ? (() => { try { return new URL(sources[0].url).hostname; } catch { return "unknown"; } })() : "ai_knowledge",
      source_url: sources.length > 0 ? sources[0].url : null,
      source_title: (extracted.source_title as string) || null,
      extracted_payload: extracted,
      confidence_score: extracted.match_confidence ?? 0,
      fields_found: fieldsFound,
      auto_filled_fields: autoFillFields,
    });

    // Apply high-confidence merges to product (fill blanks only)
    if (Object.keys(productUpdates).length > 0) {
      productUpdates.updated_at = new Date().toISOString();
      await adminSupabase
        .from("products")
        .update(productUpdates)
        .eq("id", product.id as string);
    }

    // Upsert enrichment summary
    const matchConf = (extracted.match_confidence as number) ?? 0;
    await adminSupabase.from("product_enrichment_summary").upsert(
      {
        product_id: product.id,
        last_researched_at: new Date().toISOString(),
        overall_confidence: matchConf,
        fields_filled_count: autoFillFields.length,
        fields_blank_count: Math.max(0, Object.keys(FIELD_MAP).length - fieldsFound.length),
        needs_review: matchConf < 0.8 && fieldsFound.length > 0,
        source_count: sources.length,
        research_notes: (extracted.notes as string) || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "product_id" },
    );

    // Determine final queue status
    const finalStatus =
      fieldsFound.length === 0
        ? "completed_no_data"
        : matchConf >= 0.8
        ? "completed"
        : "completed_partial";

    await adminSupabase
      .from("product_research_queue")
      .update({ status: finalStatus })
      .eq("id", queueItemId);

    console.log(
      `[market-research] Done — fields found: ${fieldsFound.length}, auto-filled: ${autoFillFields.length}, confidence: ${matchConf}`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        productId: product.id,
        fieldsFound,
        autoFilled: autoFillFields,
        matchConfidence: matchConf,
        sourceCount: sources.length,
        status: finalStatus,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[market-research] Unhandled error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
