import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractTextFromHtml(html: string): string {
  // Remove script/style blocks
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, "");
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, "");
  text = text.replace(/<header[\s\S]*?<\/header>/gi, "");
  // Strip tags
  text = text.replace(/<[^>]+>/g, " ");
  // Decode common entities
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();
  // Limit to ~8000 chars per page
  return text.slice(0, 8000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { product_id, urls } = await req.json();
    if (!product_id) {
      return new Response(JSON.stringify({ error: "product_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validUrls = (urls as string[]).filter((u: string) => u && u.trim());
    if (validUrls.length === 0) {
      return new Response(JSON.stringify({ error: "At least one URL is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch product for context
    const { data: product } = await supabase
      .from("products")
      .select("source_product_name, brand, barcode, sku, z_category, department, product_type, sell_price, cost_price, pack_size, strength, size_value, flavour")
      .eq("id", product_id)
      .single();

    // Scrape each URL
    const scrapeResults: Array<{ url: string; success: boolean; text?: string; error?: string }> = [];

    for (const url of validUrls) {
      try {
        let pageUrl = url.trim();
        if (!pageUrl.startsWith("http://") && !pageUrl.startsWith("https://")) {
          pageUrl = `https://${pageUrl}`;
        }
        console.log("Scraping:", pageUrl);

        const resp = await fetch(pageUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          redirect: "follow",
        });

        if (!resp.ok) {
          scrapeResults.push({ url, success: false, error: `HTTP ${resp.status}` });
          continue;
        }

        const html = await resp.text();
        const text = extractTextFromHtml(html);
        scrapeResults.push({ url, success: true, text });
      } catch (err: any) {
        scrapeResults.push({ url, success: false, error: err.message });
      }
    }

    const successfulScrapes = scrapeResults.filter((r) => r.success);
    if (successfulScrapes.length === 0) {
      return new Response(JSON.stringify({
        error: "No source pages could be loaded. Please check the URLs and try again.",
        scrapeResults,
      }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build combined scraped content
    const scrapedContent = successfulScrapes
      .map((r, i) => `--- SOURCE ${i + 1}: ${r.url} ---\n${r.text}`)
      .join("\n\n");

    const productContext = product
      ? `Known product info: Name="${product.source_product_name || ""}", Brand="${product.brand || ""}", Barcode="${product.barcode || ""}", SKU="${product.sku || ""}", Category="${product.z_category || product.department || ""}", Type="${product.product_type || ""}", Pack="${product.pack_size || ""}", Strength="${product.strength || ""}", Size="${product.size_value || ""}", Flavour="${product.flavour || ""}", Price=${product.sell_price || ""}`
      : "";

    const systemPrompt = `You are a product data specialist for a health and pharmacy retail business. You extract and synthesise product information from scraped web pages. Never fabricate data — only use what's found in the sources. If info is not found, omit that section.`;

    const userPrompt = `Below is scraped content from ${successfulScrapes.length} source page(s) about a product. ${productContext}

Extract and return structured product data as JSON using the return_product_data function. Generate a description_html field with this exact HTML structure (omit sections where data is not found):

<h2>[Product Name]</h2>
<p>[Short 1-2 sentence summary]</p>
<h3>Key Features</h3>
<ul><li>[Feature]</li></ul>
<h3>Ingredients / Active Components</h3>
<p>[Ingredients]</p>
<h3>Directions for Use</h3>
<p>[Directions]</p>
<h3>Warnings</h3>
<p>[Warnings]</p>
<h3>Pack Size</h3>
<p>[Pack size info]</p>

SCRAPED CONTENT:
${scrapedContent}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_product_data",
              description: "Return extracted product data",
              parameters: {
                type: "object",
                properties: {
                  normalized_product_name: { type: "string" },
                  brand: { type: "string" },
                  product_type: { type: "string" },
                  product_form: { type: "string" },
                  description_html: { type: "string" },
                  ingredients_summary: { type: "string" },
                  directions_summary: { type: "string" },
                  warnings_summary: { type: "string" },
                  claims_summary: { type: "string" },
                  pack_size: { type: "string" },
                  weight_grams: { type: "number" },
                  sku: { type: "string" },
                  upc: { type: "string" },
                  sell_price: { type: "number" },
                  key_features: { type: "array", items: { type: "string" } },
                  suggested_tags: { type: "array", items: { type: "string" } },
                  ebay_category_id: { type: "string" },
                  subtitle: { type: "string" },
                },
                additionalProperties: true,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_product_data" } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "AI rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings > Workspace > Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      throw new Error(`AI generation failed (${aiResponse.status})`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let generated: any = {};

    if (toolCall?.function?.arguments) {
      try {
        generated = JSON.parse(toolCall.function.arguments);
      } catch {
        const content = aiData.choices?.[0]?.message?.content || "";
        try { generated = JSON.parse(content); } catch { generated = { description: content }; }
      }
    }

    // Save source URLs to product record
    await supabase.from("products").update({
      source_links: validUrls.map((u: string) => ({ url: u.trim(), type: "scrape_source" })),
      updated_at: new Date().toISOString(),
    }).eq("id", product_id);

    return new Response(
      JSON.stringify({
        success: true,
        generated,
        scrapeResults: scrapeResults.map((r) => ({ url: r.url, success: r.success, error: r.error })),
        sourcesUsed: successfulScrapes.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Scrape & generate error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
