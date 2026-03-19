/**
 * Centralised listing content builder for PharmaBay Lister.
 *
 * Deterministic rule-based title generation, pharmacy copy guardrails,
 * and listing completeness scoring.
 */

// ── Title generation ────────────────────────────────────────────────

export interface TitleParts {
  brand?: string;
  productName?: string;
  form?: string;        // tablet, capsule, cream, etc.
  strength?: string;    // e.g. "500mg"
  packSize?: string;    // e.g. "60 Tablets"
  variant?: string;     // e.g. "Vanilla"
  keyBenefit?: string;  // e.g. "Immune Support"
}

export interface TitleResult {
  title: string;
  charCount: number;
  maxChars: number;
  isOverLimit: boolean;
  warnings: string[];
}

const TITLE_MAX_EBAY = 80;
const TITLE_MAX_SHOPIFY = 70;

/**
 * Generate a marketplace-compliant title from structured product parts.
 * Format: [Brand] [Product Name] [Form] [Strength] [Pack Size] [Key Benefit]
 */
export function generateTitle(
  parts: TitleParts,
  channel: "ebay" | "shopify"
): TitleResult {
  const maxChars = channel === "ebay" ? TITLE_MAX_EBAY : TITLE_MAX_SHOPIFY;
  const warnings: string[] = [];

  // Build segments in priority order
  const segments: string[] = [];

  if (parts.brand) segments.push(cleanSegment(parts.brand));
  if (parts.productName) segments.push(cleanSegment(parts.productName));
  if (parts.form) segments.push(cleanSegment(parts.form));
  if (parts.strength) segments.push(cleanSegment(parts.strength));
  if (parts.packSize) segments.push(cleanSegment(parts.packSize));
  if (parts.variant) segments.push(cleanSegment(parts.variant));

  // Try fitting key benefit if space allows
  let title = segments.join(" ");

  if (parts.keyBenefit && title.length + parts.keyBenefit.length + 3 <= maxChars) {
    title += " - " + cleanSegment(parts.keyBenefit);
  }

  // Truncate if still over limit (drop segments from the end)
  if (title.length > maxChars) {
    title = title.slice(0, maxChars).replace(/\s+\S*$/, ""); // trim at word boundary
    warnings.push("Title was truncated to fit character limit");
  }

  if (!parts.brand) warnings.push("Missing brand name");
  if (!parts.productName) warnings.push("Missing product name");
  if (!parts.packSize) warnings.push("Pack size should be in the title for OTC products");

  return {
    title,
    charCount: title.length,
    maxChars,
    isOverLimit: title.length > maxChars,
    warnings,
  };
}

/**
 * Extract title parts from a product record.
 */
export function extractTitleParts(product: Record<string, unknown>): TitleParts {
  return {
    brand: (product.brand as string) || undefined,
    productName: extractCoreName(product),
    form: (product.product_form as string) || (product.unit_of_measure as string) || undefined,
    strength: (product.strength as string) || (product.size_value as string) || undefined,
    packSize: (product.pack_size as string) || undefined,
    variant: (product.variant as string) || (product.flavour as string) || undefined,
  };
}

function extractCoreName(product: Record<string, unknown>): string | undefined {
  const name = (product.source_product_name as string) || (product.normalized_product_name as string) || "";
  if (!name) return undefined;

  // Remove brand from the beginning if present
  const brand = (product.brand as string) || "";
  let core = name;
  if (brand && core.toLowerCase().startsWith(brand.toLowerCase())) {
    core = core.slice(brand.length).trim();
  }

  // Remove trailing pack size info if we have it separately
  const packSize = (product.pack_size as string) || "";
  if (packSize && core.toLowerCase().endsWith(packSize.toLowerCase())) {
    core = core.slice(0, -packSize.length).trim();
  }

  return core || undefined;
}

function cleanSegment(s: string): string {
  return s
    .replace(/[!@#$%^&*()+=\[\]{}|\\<>]/g, "") // Remove spammy punctuation
    .replace(/\s+/g, " ")
    .trim();
}

// ── Pharmacy copy guardrails ────────────────────────────────────────

export interface CopyWarning {
  level: "error" | "warning" | "info";
  field: string;
  message: string;
  suggestion?: string;
}

const THERAPEUTIC_CLAIMS: Array<{ pattern: RegExp; suggestion: string }> = [
  { pattern: /\bcures?\b/i, suggestion: 'Use "may help support" or "traditionally used for"' },
  { pattern: /\btreats?\b/i, suggestion: 'Use "may assist with" or "supports"' },
  { pattern: /\bprevents?\s+disease/i, suggestion: 'Use "may help maintain" or "supports healthy"' },
  { pattern: /\bheals?\b/i, suggestion: 'Use "may support recovery" or "soothes"' },
  { pattern: /\bguaranteed\s+to\b/i, suggestion: "Remove guarantee claims — not permitted for health products" },
  { pattern: /\bclinically\s+proven\b/i, suggestion: 'Use "clinically tested" or "evidence-based formula"' },
  { pattern: /\bmedical\s+grade\b/i, suggestion: 'Use "professional strength" or "pharmacy grade"' },
  { pattern: /\bprescription\s+strength\b/i, suggestion: "Remove — implies equivalence to prescription medicine" },
  { pattern: /\bmiracle\b/i, suggestion: "Remove — hyperbolic claim not permitted" },
  { pattern: /\banti-?aging\b/i, suggestion: 'Use "supports skin health" or "age-defying"' },
  { pattern: /\bweight\s*loss\b/i, suggestion: 'Use "supports healthy weight management"' },
  { pattern: /\bdetox\b/i, suggestion: 'Use "cleansing" or "purifying"' },
];

/**
 * Scan listing text for pharmacy compliance issues.
 */
export function checkCopyCompliance(
  title: string,
  description: string,
  ingredientsSummary?: string,
  product?: Record<string, unknown>
): CopyWarning[] {
  const warnings: CopyWarning[] = [];
  const allText = [title, description].join(" ");

  // Check therapeutic claims
  for (const { pattern, suggestion } of THERAPEUTIC_CLAIMS) {
    const match = allText.match(pattern);
    if (match) {
      warnings.push({
        level: "warning",
        field: "copy",
        message: `Therapeutic claim detected: "${match[0]}"`,
        suggestion,
      });
    }
  }

  // Check for incomplete health product fields
  if (product) {
    const isHealthProduct = isLikelyHealthProduct(product);
    if (isHealthProduct) {
      if (!ingredientsSummary && !product.ingredients_summary) {
        warnings.push({
          level: "warning",
          field: "ingredients_summary",
          message: "Health product missing ingredients/active substances",
          suggestion: "Add ingredients to improve listing quality and compliance",
        });
      }
      if (!product.warnings_summary) {
        warnings.push({
          level: "info",
          field: "warnings_summary",
          message: "Consider adding warnings for this health product",
        });
      }
    }
  }

  return warnings;
}

function isLikelyHealthProduct(product: Record<string, unknown>): boolean {
  const dept = ((product.department as string) || "").toLowerCase();
  const cat = ((product.z_category as string) || "").toLowerCase();
  const name = ((product.source_product_name as string) || "").toLowerCase();

  const healthTerms = [
    "vitamin", "supplement", "medicine", "health", "pharma", "otc",
    "pain", "cold", "flu", "allergy", "digestive", "skincare",
    "first aid", "wound", "antiseptic", "tablet", "capsule",
  ];

  const text = `${dept} ${cat} ${name}`;
  return healthTerms.some((term) => text.includes(term));
}

// ── Listing completeness scoring ────────────────────────────────────

export interface CompletenessResult {
  score: number;       // 0-100
  filledCount: number;
  totalCount: number;
  missingFields: string[];
  level: "complete" | "good" | "fair" | "poor";
}

interface FieldWeight {
  field: string;
  label: string;
  weight: number;
}

const COMPLETENESS_FIELDS: FieldWeight[] = [
  { field: "source_product_name", label: "Product Name", weight: 10 },
  { field: "barcode", label: "Barcode", weight: 8 },
  { field: "brand", label: "Brand", weight: 8 },
  { field: "cost_price", label: "Cost Price", weight: 10 },
  { field: "sell_price", label: "Sell Price", weight: 8 },
  { field: "short_description", label: "Short Description", weight: 7 },
  { field: "full_description_html", label: "Full Description", weight: 6 },
  { field: "pack_size", label: "Pack Size", weight: 5 },
  { field: "weight_grams", label: "Weight", weight: 4 },
  { field: "stock_on_hand", label: "Stock Level", weight: 6 },
  { field: "department", label: "Department", weight: 3 },
  { field: "z_category", label: "Category", weight: 4 },
  { field: "country_of_origin", label: "Country of Origin", weight: 2 },
  { field: "manufacturer", label: "Manufacturer", weight: 3 },
  { field: "key_features", label: "Key Features", weight: 4 },
  { field: "ebay_category_id", label: "eBay Category", weight: 5 },
  { field: "product_form", label: "Product Form", weight: 3 },
  { field: "sku", label: "SKU", weight: 4 },
];

/**
 * Calculate listing completeness as a weighted percentage.
 */
export function calculateCompleteness(product: Record<string, unknown>): CompletenessResult {
  let totalWeight = 0;
  let filledWeight = 0;
  let filledCount = 0;
  const missingFields: string[] = [];

  for (const { field, label, weight } of COMPLETENESS_FIELDS) {
    totalWeight += weight;
    const val = product[field];
    const isFilled = val !== null &&
      val !== undefined &&
      val !== "" &&
      val !== 0 &&
      !(Array.isArray(val) && val.length === 0);

    if (isFilled) {
      filledWeight += weight;
      filledCount++;
    } else {
      missingFields.push(label);
    }
  }

  const score = totalWeight > 0 ? Math.round((filledWeight / totalWeight) * 100) : 0;

  let level: CompletenessResult["level"] = "poor";
  if (score >= 90) level = "complete";
  else if (score >= 70) level = "good";
  else if (score >= 45) level = "fair";

  return {
    score,
    filledCount,
    totalCount: COMPLETENESS_FIELDS.length,
    missingFields,
    level,
  };
}
