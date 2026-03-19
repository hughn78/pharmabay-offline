import { db } from './db.js';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

function getApiKey(): string | null {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('openrouter_api_key') as any;
    return row?.value || null;
  } catch {
    return null;
  }
}

function getModel(): string {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('openrouter_model') as any;
    return row?.value || 'meta-llama/llama-4-maverick:free';
  } catch {
    return 'meta-llama/llama-4-maverick:free';
  }
}

export async function callOpenRouter(systemPrompt: string, userPrompt: string): Promise<any> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('OpenRouter API key not configured. Go to Settings → AI to add your key.');
  }

  const model = getModel();

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://pharmabay.local',
      'X-Title': 'PharmaBay Lister',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('No content returned from LLM');
  }

  // Parse the JSON from the LLM response
  try {
    return JSON.parse(content);
  } catch {
    // If it's not valid JSON, try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('LLM returned non-JSON response: ' + content.slice(0, 200));
  }
}

const ENRICHMENT_SYSTEM_PROMPT = `You are a pharmacy product data enrichment specialist for an Australian online pharmacy.
Your job is to take raw product data and generate rich, accurate listing content for eBay and Shopify.

CRITICAL RULES:
- NEVER make therapeutic claims (e.g., "cures", "treats", "prevents")
- Use TGA-safe language only
- Be factual and descriptive, not promotional
- Include pack size and form in descriptions
- Keep eBay titles under 80 characters
- Return ONLY valid JSON, no markdown

Return a JSON object with these fields (omit any you can't determine):
{
  "normalized_product_name": "Clean, standardized product name",
  "brand": "Brand name",
  "product_type": "Category (e.g., Supplement, Skincare, Medical Device)",
  "product_form": "Form (e.g., Tablet, Cream, Liquid, Capsule)",
  "description": "Plain text product description (2-3 sentences)",
  "description_html": "<p>HTML formatted description with sections</p>",
  "ingredients_summary": "Key active ingredients",
  "directions_summary": "Usage directions if applicable",
  "warnings_summary": "Safety warnings and precautions",
  "claims_summary": "General benefit claims (TGA-safe only)",
  "seo_title": "SEO optimized title (max 70 chars)",
  "seo_description": "Meta description (max 160 chars)",
  "subtitle": "Short subtitle for listings",
  "suggested_tags": ["tag1", "tag2", "tag3"],
  "ebay_category_id": "eBay category ID if known",
  "upc": "UPC if detectable from barcode",
  "mpn": "Manufacturer part number if known"
}`;

export async function generateEnrichment(product: Record<string, any>): Promise<any> {
  const userPrompt = `Enrich this pharmacy product:

Product Name: ${product.source_product_name || product.normalized_product_name || 'Unknown'}
Brand: ${product.brand || 'Unknown'}
Barcode: ${product.barcode || 'N/A'}
Category: ${product.z_category || product.product_type || 'N/A'}
Department: ${product.department || 'N/A'}
Strength: ${product.strength || 'N/A'}
Pack Size: ${product.pack_size || 'N/A'}
Form: ${product.product_form || 'N/A'}
Cost Price: $${product.cost_price || 'N/A'}
Sell Price: $${product.sell_price || 'N/A'}

Generate comprehensive enrichment data for this product.`;

  return callOpenRouter(ENRICHMENT_SYSTEM_PROMPT, userPrompt);
}
