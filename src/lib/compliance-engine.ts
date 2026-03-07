import type { Tables } from "@/integrations/supabase/types";

type Product = Tables<"products">;
type ComplianceRule = Tables<"compliance_rules">;

export interface ComplianceResult {
  status: "permitted" | "review_required" | "blocked";
  reasons: string[];
  matchedRules: { ruleId: string; ruleName: string; action: string; reason: string }[];
}

/**
 * Evaluate a product against all active compliance rules.
 * Rules are evaluated in priority order. The most restrictive outcome wins
 * (blocked > review_required > permitted).
 */
export function evaluateCompliance(
  product: Partial<Product>,
  rules: ComplianceRule[],
  ebayTitle?: string | null,
  shopifyTitle?: string | null
): ComplianceResult {
  const activeRules = rules
    .filter((r) => r.is_active)
    .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));

  const matchedRules: ComplianceResult["matchedRules"] = [];
  const reasons: string[] = [];

  for (const rule of activeRules) {
    if (ruleMatches(product, rule, ebayTitle, shopifyTitle)) {
      matchedRules.push({
        ruleId: rule.id,
        ruleName: rule.rule_name ?? "Unnamed rule",
        action: rule.action ?? "review",
        reason: rule.reason ?? "",
      });
      reasons.push(rule.reason || rule.rule_name || "Compliance rule triggered");
    }
  }

  // Determine highest severity
  let status: ComplianceResult["status"] = "permitted";
  if (matchedRules.some((r) => r.action === "review")) status = "review_required";
  if (matchedRules.some((r) => r.action === "block")) status = "blocked";

  return { status, reasons, matchedRules };
}

function getFieldValue(
  product: Partial<Product>,
  field: string | null,
  ebayTitle?: string | null,
  shopifyTitle?: string | null
): string {
  if (!field) return "";
  switch (field) {
    case "source_product_name":
    case "product_name":
      return product.source_product_name ?? "";
    case "normalized_product_name":
      return product.normalized_product_name ?? "";
    case "department":
      return product.department ?? "";
    case "z_category":
    case "category":
      return product.z_category ?? "";
    case "internal_category":
      return product.internal_category ?? "";
    case "brand":
      return product.brand ?? "";
    case "notes_internal":
      return product.notes_internal ?? "";
    case "ebay_title":
      return ebayTitle ?? "";
    case "shopify_title":
      return shopifyTitle ?? "";
    case "all_text":
      return [
        product.source_product_name,
        product.normalized_product_name,
        product.department,
        product.z_category,
        product.notes_internal,
        ebayTitle,
        shopifyTitle,
      ]
        .filter(Boolean)
        .join(" ");
    default:
      return (product as any)?.[field] ?? "";
  }
}

function ruleMatches(
  product: Partial<Product>,
  rule: ComplianceRule,
  ebayTitle?: string | null,
  shopifyTitle?: string | null
): boolean {
  const fieldVal = getFieldValue(product, rule.match_field, ebayTitle, shopifyTitle).toLowerCase();
  const matchVal = (rule.match_value ?? "").toLowerCase();
  const op = rule.operator ?? "contains";

  if (!fieldVal && op !== "is_empty") return false;

  switch (op) {
    case "contains":
      return fieldVal.includes(matchVal);
    case "not_contains":
      return !fieldVal.includes(matchVal);
    case "equals":
      return fieldVal === matchVal;
    case "starts_with":
      return fieldVal.startsWith(matchVal);
    case "ends_with":
      return fieldVal.endsWith(matchVal);
    case "regex": {
      try {
        return new RegExp(matchVal, "i").test(fieldVal);
      } catch {
        return false;
      }
    }
    case "is_empty":
      return !fieldVal.trim();
    case "is_not_empty":
      return !!fieldVal.trim();
    default:
      return fieldVal.includes(matchVal);
  }
}

/** Built-in keyword signals that always block or flag for review */
export const BLOCK_SIGNALS = [
  "S3", "S4", "S8", "prescription", "RX", "pharmacy only",
  "expired", "recalled", "disposal", "withdraw",
];

export const REVIEW_SIGNALS = [
  "(OLD", "old stock", "discontinued", "damaged",
  "near expiry", "clearance",
];

/**
 * Quick-scan product text for hardcoded danger signals.
 * Returns additional reasons to merge with rule-based evaluation.
 */
export function scanBuiltInSignals(product: Partial<Product>): {
  blockReasons: string[];
  reviewReasons: string[];
} {
  const text = [
    product.source_product_name,
    product.normalized_product_name,
    product.notes_internal,
    product.department,
    product.z_category,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const blockReasons: string[] = [];
  const reviewReasons: string[] = [];

  for (const signal of BLOCK_SIGNALS) {
    if (text.includes(signal.toLowerCase())) {
      blockReasons.push(`Contains blocked keyword: "${signal}"`);
    }
  }
  for (const signal of REVIEW_SIGNALS) {
    if (text.includes(signal.toLowerCase())) {
      reviewReasons.push(`Contains review keyword: "${signal}"`);
    }
  }

  // Missing barcode + weak identity
  if (!product.barcode && !product.sku) {
    reviewReasons.push("Missing barcode and SKU — weak product identity");
  }

  return { blockReasons, reviewReasons };
}

/**
 * Full compliance evaluation: rules + built-in signals combined.
 */
export function fullComplianceCheck(
  product: Partial<Product>,
  rules: ComplianceRule[],
  ebayTitle?: string | null,
  shopifyTitle?: string | null
): ComplianceResult {
  const ruleResult = evaluateCompliance(product, rules, ebayTitle, shopifyTitle);
  const signals = scanBuiltInSignals(product);

  const allReasons = [
    ...ruleResult.reasons,
    ...signals.blockReasons,
    ...signals.reviewReasons,
  ];

  let status = ruleResult.status;
  if (signals.reviewReasons.length > 0 && status === "permitted") {
    status = "review_required";
  }
  if (signals.blockReasons.length > 0) {
    status = "blocked";
  }

  return {
    status,
    reasons: [...new Set(allReasons)],
    matchedRules: ruleResult.matchedRules,
  };
}
