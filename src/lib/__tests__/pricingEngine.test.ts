import { describe, it, expect } from "vitest";
import {
  extractExGstCost,
  calculateChannelFee,
  calculateMinimumPrice,
  calculateSuggestedPrice,
  calculateProfitAndMargin,
  calculatePricingBreakdown,
  DEFAULT_PRICING_CONFIG,
} from "../pricingEngine";

describe("extractExGstCost", () => {
  it("extracts GST from gst_included cost", () => {
    const r = extractExGstCost(11, "gst_included", 0.1);
    expect(r.exGst).toBe(10);
    expect(r.gstComponent).toBe(1);
  });

  it("returns zero GST for gst_free", () => {
    const r = extractExGstCost(10, "gst_free", 0.1);
    expect(r.exGst).toBe(10);
    expect(r.gstComponent).toBe(0);
  });

  it("calculates GST for gst_applicable (ex-GST input)", () => {
    const r = extractExGstCost(10, "gst_applicable", 0.1);
    expect(r.exGst).toBe(10);
    expect(r.gstComponent).toBe(1);
  });

  it("handles zero cost", () => {
    const r = extractExGstCost(0, "gst_included", 0.1);
    expect(r.exGst).toBe(0);
    expect(r.gstComponent).toBe(0);
  });
});

describe("calculateChannelFee", () => {
  const config = DEFAULT_PRICING_CONFIG;

  it("calculates eBay fee as percentage", () => {
    expect(calculateChannelFee(100, "ebay", config)).toBe(13.5);
  });

  it("calculates Shopify fee as percentage + per-tx", () => {
    expect(calculateChannelFee(100, "shopify", config)).toBe(2.9);
  });

  it("returns 0 for zero price", () => {
    expect(calculateChannelFee(0, "ebay", config)).toBe(0);
  });
});

describe("calculateMinimumPrice", () => {
  const config = DEFAULT_PRICING_CONFIG;

  it("produces a price above cost + fees for eBay", () => {
    const minPrice = calculateMinimumPrice(10, "ebay", config);
    const pm = calculateProfitAndMargin(minPrice, 10, "ebay", config);
    expect(pm.marginPercent).toBeGreaterThanOrEqual(config.targetMarginPercent - 0.5);
    expect(minPrice).toBeGreaterThan(10);
  });

  it("produces a price above cost + fees for Shopify", () => {
    const minPrice = calculateMinimumPrice(10, "shopify", config);
    const pm = calculateProfitAndMargin(minPrice, 10, "shopify", config);
    expect(pm.marginPercent).toBeGreaterThanOrEqual(config.targetMarginPercent - 0.5);
  });

  it("returns 0 for zero cost", () => {
    expect(calculateMinimumPrice(0, "ebay", config)).toBe(0);
  });
});

describe("calculateSuggestedPrice", () => {
  it("is at least as high as minimum price", () => {
    const config = DEFAULT_PRICING_CONFIG;
    const suggested = calculateSuggestedPrice(5, "ebay", config);
    const min = calculateMinimumPrice(5, "ebay", config);
    expect(suggested).toBeGreaterThanOrEqual(min);
  });

  it("ensures minimum dollar profit", () => {
    const config = { ...DEFAULT_PRICING_CONFIG, minimumDollarProfit: 5 };
    const suggested = calculateSuggestedPrice(2, "ebay", config);
    const pm = calculateProfitAndMargin(suggested, 2, "ebay", config);
    expect(pm.profit).toBeGreaterThanOrEqual(4.9); // allow small rounding
  });
});

describe("calculateProfitAndMargin", () => {
  const config = DEFAULT_PRICING_CONFIG;

  it("returns positive profit for healthy price", () => {
    const r = calculateProfitAndMargin(50, 10, "ebay", config);
    expect(r.profit).toBeGreaterThan(0);
    expect(r.marginPercent).toBeGreaterThan(0);
  });

  it("returns negative profit when price is too low", () => {
    const r = calculateProfitAndMargin(5, 10, "ebay", config);
    expect(r.profit).toBeLessThan(0);
  });
});

describe("calculatePricingBreakdown", () => {
  it("generates BELOW_COST warning when price < costs", () => {
    const result = calculatePricingBreakdown(11, 5, "ebay", "gst_included");
    expect(result.warnings.some((w) => w.code === "BELOW_COST")).toBe(true);
  });

  it("generates BELOW_MARGIN_FLOOR warning", () => {
    // Cost $10 inc GST = $9.09 ex GST
    // Sell at $12 — with fees/packaging/shipping, margin should be low
    const result = calculatePricingBreakdown(10, 12, "ebay", "gst_included");
    const hasMarginWarning = result.warnings.some(
      (w) => w.code === "BELOW_MARGIN_FLOOR" || w.code === "BELOW_COST" || w.code === "NEGATIVE_MARGIN"
    );
    expect(hasMarginWarning).toBe(true);
  });

  it("generates NO_COST info when cost is zero", () => {
    const result = calculatePricingBreakdown(0, 25, "ebay");
    expect(result.warnings.some((w) => w.code === "NO_COST")).toBe(true);
  });

  it("handles competitor match mode", () => {
    const result = calculatePricingBreakdown(10, 0, "ebay", "gst_included", {}, 30, "match");
    expect(result.suggestedPrice).toBeGreaterThanOrEqual(
      result.minimumAcceptablePrice
    );
  });

  it("handles competitor beat mode", () => {
    const result = calculatePricingBreakdown(10, 0, "ebay", "gst_included", {}, 50, "beat");
    expect(result.suggestedPrice).toBeLessThanOrEqual(50);
  });
});
