import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

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

    const { product_id, target } = await req.json();

    if (!product_id) {
      return new Response(JSON.stringify({ error: "product_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch product data
    const { data: product, error: prodErr } = await supabase
      .from("products")
      .select("*")
      .eq("id", product_id)
      .single();

    if (prodErr || !product) {
      return new Response(JSON.stringify({ error: "Product not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const productName = product.normalized_product_name || product.source_product_name || "Unknown Product";
    const brand = product.brand || "";
    const category = product.z_category || product.department || "";
    const productType = product.product_type || product.product_form || "";
    const strength = product.strength || "";
    const packSize = product.pack_size || "";
    const sizeValue = product.size_value || "";
    const flavour = product.flavour || "";
    const ingredients = product.ingredients_summary || "";
    const directions = product.directions_summary || "";
    const warnings = product.warnings_summary || "";
    const claims = product.claims_summary || "";
    const barcode = product.barcode || "";

    // Build prompt based on target
    let systemPrompt: string;
    let userPrompt: string;

    if (target === "ebay") {
      systemPrompt = `You are an expert eBay product listing copywriter for a health and pharmacy retail business.
You write compelling, SEO-optimized eBay listings that drive sales while being accurate and compliant.
You always emphasize brand trust, product benefits, and key specifications.
Never make medical claims or exaggerate product effects.
Write in a professional, trustworthy tone appropriate for health/pharmacy products.`;

      userPrompt = `Generate an eBay product listing for the following product. Return a JSON object with these fields:
- title: eBay title (max 80 chars, include brand + key product info + size/pack)
- subtitle: Optional eBay subtitle (max 55 chars)
- description_html: Rich HTML description for eBay (include product overview, key features/benefits, usage directions if known, ingredients if known, professional formatting with headers and bullet points)
- item_specifics: Object with relevant eBay item specifics like Brand, Type, Form, Size, etc.

Product information:
- Name: ${productName}
- Brand: ${brand}
- Category: ${category}
- Product Type/Form: ${productType}
- Strength: ${strength}
- Pack Size: ${packSize}
- Size/Volume: ${sizeValue}
- Flavour: ${flavour}
- Barcode/EAN: ${barcode}
- Ingredients: ${ingredients}
- Directions: ${directions}
- Warnings: ${warnings}
- Claims: ${claims}

Using only the product information provided below, write a detailed and accurate description. Do not invent specifications not present in the data.`;

    } else if (target === "shopify") {
      systemPrompt = `You are an expert Shopify product description writer for an online health and pharmacy store.
You write engaging, SEO-friendly product descriptions that convert visitors to buyers.
You focus on benefits, trust signals, and clear product information.
Never make medical claims or exaggerate product effects.
Write in a warm, professional tone.`;

      userPrompt = `Generate a Shopify product listing for the following product. Return a JSON object with these fields:
- title: Clean product title for Shopify
- description_html: Well-structured HTML description (include product overview, benefits, how to use, ingredients if known, formatted with <h3>, <p>, <ul> tags)
- product_type: Shopify product type category
- tags: Array of relevant product tags for filtering/search
- seo_title: SEO-optimized page title (max 70 chars)
- seo_description: SEO meta description (max 160 chars)
- vendor: Brand/vendor name

Product information:
- Name: ${productName}
- Brand: ${brand}
- Category: ${category}
- Product Type/Form: ${productType}
- Strength: ${strength}
- Pack Size: ${packSize}
- Size/Volume: ${sizeValue}
- Flavour: ${flavour}
- Barcode/EAN: ${barcode}
- Ingredients: ${ingredients}
- Directions: ${directions}
- Warnings: ${warnings}
- Claims: ${claims}

Using only the product information provided below, write a detailed and accurate description. Do not invent specifications not present in the data.`;

    } else {
      // General enrichment
      systemPrompt = `You are a product data specialist for a health and pharmacy business.
You research products thoroughly and generate accurate, comprehensive product information.
You search manufacturer websites, TGA databases, and vendor listings to find accurate data.
Never fabricate product information. If uncertain, note it.`;

      userPrompt = `Research and generate comprehensive product information for the following product. Return a JSON object with these fields:
- normalized_product_name: Clean, standardized product name
- brand: Confirmed brand name
- product_type: Product type/category
- product_form: Product form (tablet, capsule, liquid, cream, etc.)
- ingredients_summary: Key ingredients list
- directions_summary: Usage directions
- warnings_summary: Important warnings
- claims_summary: Product claims/benefits
- description: A comprehensive product description (2-3 paragraphs)
- suggested_tags: Array of relevant tags/categories
- ebay_category_id: The most appropriate eBay Australia category ID number for this product (numeric string)
- upc: UPC code if known (otherwise empty string)
- epid: eBay Product ID (ePID) if known (otherwise empty string)
- mpn: Manufacturer Part Number if known (otherwise empty string)
- subtitle: A compelling eBay subtitle (max 55 chars) highlighting a key benefit or feature

Product information available:
- Name: ${productName}
- Brand: ${brand}
- Category: ${category}
- Product Type/Form: ${productType}
- Strength: ${strength}
- Pack Size: ${packSize}
- Size/Volume: ${sizeValue}
- Flavour: ${flavour}
- Barcode/EAN: ${barcode}
- Existing Ingredients: ${ingredients}
- Existing Directions: ${directions}
- Existing Warnings: ${warnings}
- Existing Claims: ${claims}

Using only the product information provided above, fill in any missing fields and generate an accurate, detailed description. Do not invent specifications not present in the data.`;
    }

    // Call Lovable AI Gateway
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
              description: "Return the generated product data as structured JSON",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  subtitle: { type: "string" },
                  description_html: { type: "string" },
                  description: { type: "string" },
                  normalized_product_name: { type: "string" },
                  brand: { type: "string" },
                  vendor: { type: "string" },
                  product_type: { type: "string" },
                  product_form: { type: "string" },
                  ingredients_summary: { type: "string" },
                  directions_summary: { type: "string" },
                  warnings_summary: { type: "string" },
                  claims_summary: { type: "string" },
                  tags: { type: "array", items: { type: "string" } },
                  suggested_tags: { type: "array", items: { type: "string" } },
                  seo_title: { type: "string" },
                  seo_description: { type: "string" },
                  ebay_category_id: { type: "string" },
                  upc: { type: "string" },
                  epid: { type: "string" },
                  mpn: { type: "string" },
                  item_specifics: { type: "object" },
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
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings > Workspace > Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        // Try to extract from content if tool call parsing fails
        const content = aiData.choices?.[0]?.message?.content || "";
        try {
          generated = JSON.parse(content);
        } catch {
          generated = { description: content };
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, generated, target }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("AI generate error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
