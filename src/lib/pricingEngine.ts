/**
 * Centralised Pricing Engine for PharmaBay Lister.
 *
 * Calculates fees, margins, minimum acceptable prices, and generates
 * actionable warnings for pharmacy e-commerce listings.
 */

// ── Configuration defaults ──────────────────────────────────────────

export interface PricingConfig {
  /** GST rate as decimal (default 0.10 = 10%) */
  gstRate: number;
  /** Packaging allowance in AUD (default $0.50) */
  packagingAllowance: number;
  /** Shipping allowance in AUD (default $8.50) */
  shippingAllowance: number;
  /** eBay total fee % as decimal (default 0.135 = 13.5%) */
  ebayFeePercent: number;
  /** Shopify processing fee % as decimal (default 0.026 = 2.6%) */
  shopifyFeePercent: number;
  /** Shopify per-transaction fee in AUD (default $0.30) */
  shopifyPerTxFee: number;
  /** User's target minimum margin % (default 25) */
  targetMarginPercent: number;
  /** Absolute minimum dollar profit floor (default $2.00) */
  minimumDollarProfit: number;
}

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  gstRate: 0.10,
  packagingAllowance: 0.50,
  shippingAllowance: 8.50,
  ebayFeePercent: 0.135,
  shopifyFeePercent: 0.026,
  shopifyPerTxFee: 0.30,
  targetMarginPercent: 25,
  minimumDollarProfit: 2.00,
};

// ── Types ───────────────────────────────────────────────────────────

export type Channel = "ebay" | "shopify";

export interface PricingBreakdown {
  /** Original cost price (inc GST or ex GST depending on taxClass) */
  costPriceIncGst: number;
  /** Cost price excluding GST */
  costPriceExGst: number;
  /** GST component */
  gstComponent: number;
  /** Packaging allowance */
  packagingAllowance: number;
  /** Shipping allowance */
  shippingAllowance: number;
  /** Channel fee estimate in dollars */
  channelFee: number;
  /** Channel fee description */
  channelFeeLabel: string;
  /** Total cost of goods + fees + allowances */
  totalCostBase: number;
  /** Derived minimum acceptable sell price (to meet margin floor) */
  minimumAcceptablePrice: number;
  /** Suggested competitive sell price */
  suggestedPrice: number;
  /** Profit at the suggested price */
  profitAtSuggested: number;
  /** Margin % at the suggested price */
  marginAtSuggested: number;
  /** Profit at the actual sell price (if provided) */
  profitAtActual: number;
  /** Margin % at the actual sell price */
  marginAtActual: number;
  /** Warnings to display */
  warnings: PricingWarning[];
}

export interface PricingWarning {
  level: "error" | "warning" | "info";
  message: string;
  code: string;
}

export type CompetitorMode = "match" | "beat" | "protect_margin";

// ── Core calculation functions ──────────────────────────────────────

/**
 * Extract the ex-GST cost from a cost price.
 * If taxClass is "gst_included", the cost already has GST baked in.
 * If "gst_free", GST = 0. Otherwise, cost is treated as ex-GST.
 */
export function extractExGstCost(
  costPrice: number,
  taxClass: string,
  gstRate: number
): { exGst: number; gstComponent: number } {
  if (costPrice <= 0) return { exGst: 0, gstComponent: 0 };

  if (taxClass === "gst_included") {
    const exGst = round2(costPrice / (1 + gstRate));
    return { exGst, gstComponent: round2(costPrice - exGst) };
  }
  if (taxClass === "gst_free") {
    return { exGst: costPrice, gstComponent: 0 };
  }
  // gst_applicable — cost is ex-GST, GST needs to be added to sell price
  return { exGst: costPrice, gstComponent: round2(costPrice * gstRate) };
}

/**
 * Calculate channel fee estimate for a given sell price.
 */
export function calculateChannelFee(
  sellPrice: number,
  channel: Channel,
  config: PricingConfig
): number {
  if (sellPrice <= 0) return 0;
  if (channel === "ebay") {
    return round2(sellPrice * config.ebayFeePercent);
  }
  return round2(sellPrice * config.shopifyFeePercent + config.shopifyPerTxFee);
}

/**
 * Calculate minimum acceptable price to achieve target margin,
 * accounting for percentage-based channel fees.
 *
 * For eBay: minPrice = totalFixedCosts / (1 - feePercent - (1 - targetMargin))
 * Simplified: minPrice = totalFixedCosts / (targetMargin - feePercent) ... but we
 * need to account for the circular dependency (fee depends on price).
 *
 * Solving: price = (fixedCosts) / (1 - feePercent) * (1 / (1 - targetMargin/100))
 * is not quite right. Let's use iterative approach for accuracy.
 */
export function calculateMinimumPrice(
  costExGst: number,
  channel: Channel,
  config: PricingConfig
): number {
  if (costExGst <= 0) return 0;

  const fixedCosts = costExGst + config.packagingAllowance + config.shippingAllowance;
  const targetMarginDecimal = config.targetMarginPercent / 100;

  // For a price P:
  // fee = P * feePercent (+ perTxFee for Shopify)
  // profit = P - fixedCosts - fee
  // margin = profit / P >= targetMarginDecimal
  // P - fixedCosts - P*feePercent (- perTx) >= P * targetMarginDecimal
  // P * (1 - feePercent - targetMarginDecimal) >= fixedCosts (+ perTx)
  // P >= (fixedCosts + perTx) / (1 - feePercent - targetMarginDecimal)

  const feePercent = channel === "ebay" ? config.ebayFeePercent : config.shopifyFeePercent;
  const perTxFee = channel === "ebay" ? 0 : config.shopifyPerTxFee;

  const denominator = 1 - feePercent - targetMarginDecimal;
  if (denominator <= 0) {
    // Target margin + fees exceed 100% — impossible
    return Infinity;
  }

  return round2((fixedCosts + perTxFee) / denominator);
}

/**
 * Calculate suggested sell price.
 * Uses whichever is higher: minimum acceptable price, or minimum dollar profit floor.
 */
export function calculateSuggestedPrice(
  costExGst: number,
  channel: Channel,
  config: PricingConfig
): number {
  const minByMargin = calculateMinimumPrice(costExGst, channel, config);

  // Also ensure minimum dollar profit
  const fixedCosts = costExGst + config.packagingAllowance + config.shippingAllowance;
  const feePercent = channel === "ebay" ? config.ebayFeePercent : config.shopifyFeePercent;
  const perTxFee = channel === "ebay" ? 0 : config.shopifyPerTxFee;

  // P - fixedCosts - P*feePercent - perTxFee >= minDollarProfit
  // P * (1 - feePercent) >= fixedCosts + perTxFee + minDollarProfit
  const minByProfit = round2(
    (fixedCosts + perTxFee + config.minimumDollarProfit) / (1 - feePercent)
  );

  return Math.max(minByMargin, minByProfit);
}

/**
 * Calculate margin and profit at a given sell price.
 */
export function calculateProfitAndMargin(
  sellPrice: number,
  costExGst: number,
  channel: Channel,
  config: PricingConfig
): { profit: number; marginPercent: number } {
  if (sellPrice <= 0 || costExGst <= 0) return { profit: 0, marginPercent: 0 };

  const fixedCosts = costExGst + config.packagingAllowance + config.shippingAllowance;
  const channelFee = calculateChannelFee(sellPrice, channel, config);
  const profit = round2(sellPrice - fixedCosts - channelFee);
  const marginPercent = round1((profit / sellPrice) * 100);

  return { profit, marginPercent };
}

/**
 * Produce a full pricing breakdown with warnings.
 */
export function calculatePricingBreakdown(
  costPrice: number,
  actualSellPrice: number,
  channel: Channel,
  taxClass: string = "gst_included",
  config: Partial<PricingConfig> = {},
  competitorPrice?: number | null,
  competitorMode?: CompetitorMode
): PricingBreakdown {
  const c = { ...DEFAULT_PRICING_CONFIG, ...config };
  const { exGst, gstComponent } = extractExGstCost(costPrice, taxClass, c.gstRate);

  const suggested = calculateSuggestedPrice(exGst, channel, c);
  const minimumAcceptablePrice = calculateMinimumPrice(exGst, channel, c);

  // Adjust suggested based on competitor mode
  let finalSuggested = suggested;
  if (competitorPrice && competitorPrice > 0 && competitorMode) {
    switch (competitorMode) {
      case "match":
        finalSuggested = Math.max(minimumAcceptablePrice, competitorPrice);
        break;
      case "beat":
        finalSuggested = Math.max(minimumAcceptablePrice, round2(competitorPrice - 1));
        break;
      case "protect_margin":
        finalSuggested = suggested; // stick to margin-based
        break;
    }
  }

  const channelFee = calculateChannelFee(actualSellPrice || finalSuggested, channel, c);
  const channelFeeLabel = channel === "ebay"
    ? `eBay ${(c.ebayFeePercent * 100).toFixed(1)}%`
    : `Shopify ${(c.shopifyFeePercent * 100).toFixed(1)}% + $${c.shopifyPerTxFee.toFixed(2)}`;

  const totalCostBase = round2(exGst + c.packagingAllowance + c.shippingAllowance + channelFee);

  const suggestedPM = calculateProfitAndMargin(finalSuggested, exGst, channel, c);
  const actualPM = actualSellPrice > 0
    ? calculateProfitAndMargin(actualSellPrice, exGst, channel, c)
    : { profit: 0, marginPercent: 0 };

  // Generate warnings
  const warnings: PricingWarning[] = [];

  if (actualSellPrice > 0) {
    if (actualSellPrice < totalCostBase) {
      warnings.push({
        level: "error",
        message: `Sell price ($${actualSellPrice.toFixed(2)}) is below total costs ($${totalCostBase.toFixed(2)})`,
        code: "BELOW_COST",
      });
    }

    if (actualPM.marginPercent < c.targetMarginPercent && actualPM.marginPercent >= 0) {
      warnings.push({
        level: "warning",
        message: `Margin ${actualPM.marginPercent.toFixed(1)}% is below your ${c.targetMarginPercent}% floor`,
        code: "BELOW_MARGIN_FLOOR",
      });
    }

    if (actualPM.marginPercent < 0) {
      warnings.push({
        level: "error",
        message: `This price generates a loss of $${Math.abs(actualPM.profit).toFixed(2)}`,
        code: "NEGATIVE_MARGIN",
      });
    }

    if (minimumAcceptablePrice > 0 && actualSellPrice < minimumAcceptablePrice * 0.9) {
      warnings.push({
        level: "error",
        message: `Price is more than 10% below the minimum acceptable ($${minimumAcceptablePrice.toFixed(2)})`,
        code: "UNDERCUT_MINIMUM",
      });
    }

    if (actualPM.profit > 0 && actualPM.profit < c.minimumDollarProfit) {
      warnings.push({
        level: "warning",
        message: `Profit $${actualPM.profit.toFixed(2)} is below the $${c.minimumDollarProfit.toFixed(2)} minimum`,
        code: "BELOW_PROFIT_FLOOR",
      });
    }
  }

  if (costPrice <= 0) {
    warnings.push({
      level: "info",
      message: "No cost price set — pricing calculations are estimates only",
      code: "NO_COST",
    });
  }

  return {
    costPriceIncGst: costPrice,
    costPriceExGst: exGst,
    gstComponent,
    packagingAllowance: c.packagingAllowance,
    shippingAllowance: c.shippingAllowance,
    channelFee,
    channelFeeLabel,
    totalCostBase,
    minimumAcceptablePrice,
    suggestedPrice: finalSuggested,
    profitAtSuggested: suggestedPM.profit,
    marginAtSuggested: suggestedPM.marginPercent,
    profitAtActual: actualPM.profit,
    marginAtActual: actualPM.marginPercent,
    warnings,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
