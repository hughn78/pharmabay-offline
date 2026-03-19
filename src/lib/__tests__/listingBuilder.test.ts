import { describe, it, expect } from "vitest";
import {
  generateTitle,
  extractTitleParts,
  checkCopyCompliance,
  calculateCompleteness,
} from "../listingBuilder";

describe("generateTitle", () => {
  it("builds title in correct format", () => {
    const r = generateTitle(
      {
        brand: "Swisse",
        productName: "Ultiboost Vitamin C",
        form: "Tablets",
        strength: "500mg",
        packSize: "60 Pack",
      },
      "ebay"
    );
    expect(r.title).toBe("Swisse Ultiboost Vitamin C Tablets 500mg 60 Pack");
    expect(r.isOverLimit).toBe(false);
    expect(r.charCount).toBeLessThanOrEqual(80);
  });

  it("truncates at word boundary for eBay", () => {
    const r = generateTitle(
      {
        brand: "Blackmores",
        productName: "Super Strength CoQ10 Advanced Heart Health Formula With Antioxidant Benefits",
        form: "Capsules",
        strength: "300mg",
        packSize: "90 Capsules",
      },
      "ebay"
    );
    expect(r.charCount).toBeLessThanOrEqual(80);
    expect(r.warnings.some((w) => w.includes("truncated"))).toBe(true);
  });

  it("enforces Shopify 70 char limit", () => {
    const r = generateTitle(
      {
        brand: "Blackmores",
        productName: "Super Strength CoQ10 Advanced Heart Health Formula Plus Extra",
        form: "Capsules",
        packSize: "90 Capsules",
      },
      "shopify"
    );
    expect(r.maxChars).toBe(70);
    expect(r.charCount).toBeLessThanOrEqual(70);
  });

  it("warns about missing brand", () => {
    const r = generateTitle({ productName: "Test Product" }, "ebay");
    expect(r.warnings.some((w) => w.includes("brand"))).toBe(true);
  });

  it("warns about missing pack size", () => {
    const r = generateTitle({ brand: "X", productName: "Y" }, "ebay");
    expect(r.warnings.some((w) => w.includes("Pack size"))).toBe(true);
  });

  it("appends key benefit when space allows", () => {
    const r = generateTitle(
      { brand: "Swisse", productName: "VitC", keyBenefit: "Immune Support" },
      "ebay"
    );
    expect(r.title).toContain("Immune Support");
  });
});

describe("extractTitleParts", () => {
  it("extracts parts from product record", () => {
    const parts = extractTitleParts({
      brand: "Swisse",
      source_product_name: "Swisse Ultiboost Vitamin C",
      product_form: "Tablets",
      pack_size: "60 Pack",
      strength: "500mg",
    });
    expect(parts.brand).toBe("Swisse");
    expect(parts.productName).toBe("Ultiboost Vitamin C");
    expect(parts.form).toBe("Tablets");
    expect(parts.packSize).toBe("60 Pack");
  });
});

describe("checkCopyCompliance", () => {
  it("flags therapeutic claims", () => {
    const warnings = checkCopyCompliance("Cures headaches fast", "This product treats pain");
    expect(warnings.length).toBeGreaterThanOrEqual(2);
    expect(warnings.some((w) => w.message.toLowerCase().includes("cures") || w.message.toLowerCase().includes("cure"))).toBe(true);
    expect(warnings.some((w) => w.message.toLowerCase().includes("treats") || w.message.toLowerCase().includes("treat"))).toBe(true);
  });

  it("returns no warnings for clean copy", () => {
    const warnings = checkCopyCompliance(
      "Swisse Vitamin C 500mg 60 Tablets",
      "Supports immune health and general wellbeing."
    );
    expect(warnings.filter((w) => w.level === "error" || w.level === "warning").length).toBe(0);
  });

  it("flags missing ingredients for health products", () => {
    const warnings = checkCopyCompliance("Title", "Desc", undefined, {
      department: "Vitamins",
      source_product_name: "Some Vitamin",
    });
    expect(warnings.some((w) => w.field === "ingredients_summary")).toBe(true);
  });
});

describe("calculateCompleteness", () => {
  it("returns 0 for empty product", () => {
    const r = calculateCompleteness({});
    expect(r.score).toBe(0);
    expect(r.level).toBe("poor");
  });

  it("returns high score for well-filled product", () => {
    const r = calculateCompleteness({
      source_product_name: "Test",
      barcode: "123",
      brand: "X",
      cost_price: 10,
      sell_price: 20,
      short_description: "Desc",
      full_description_html: "<p>Full</p>",
      pack_size: "1",
      weight_grams: 100,
      stock_on_hand: 5,
      department: "Health",
      z_category: "Vitamins",
      country_of_origin: "AU",
      manufacturer: "Mfg",
      key_features: ["Feature 1"],
      ebay_category_id: "12345",
      product_form: "Tablets",
      sku: "SKU001",
    });
    expect(r.score).toBe(100);
    expect(r.level).toBe("complete");
    expect(r.missingFields.length).toBe(0);
  });

  it("categorizes mid-level completeness correctly", () => {
    const r = calculateCompleteness({
      source_product_name: "Test",
      barcode: "123",
      brand: "X",
      cost_price: 10,
      sell_price: 20,
    });
    expect(r.score).toBeGreaterThan(25);
    expect(r.score).toBeLessThan(70);
    expect(["poor", "fair"]).toContain(r.level);
  });
});
