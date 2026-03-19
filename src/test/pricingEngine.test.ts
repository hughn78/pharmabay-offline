import { describe, it, expect } from 'vitest';
import { calculatePricing, validatePricingLogic } from '../lib/pricingEngine';

describe('Pricing Engine', () => {
  it('calculates baseline profit constraints correctly', () => {
    const result = calculatePricing({
      costPriceExGst: 10.00,
      packagingAllowance: 1.00,
      shippingAllowance: 8.00,
      targetMarginPercent: 30,
      minimumProfitFloor: 5.00,
    });
    
    expect(result.costExGst).toBe(10.00);
    expect(result.gstComponent).toBe(1.00);
    expect(result.totalCostIncGst).toBe(11.00);
    
    // total base cost: 11.00 + 1.00 + 8.00 = 20.00
    // min profit floor: 5.00
    // sum = 25.00
    // fee rate: max(13.5%, 2.0%) = 13.5%
    // Min Price = 25.00 / (1 - 0.135) = 28.90
    expect(result.minimumAcceptablePrice).toBeCloseTo(28.90, 1);
    
    // Suggested price = 20.00 / (1 - 0.30 - 0.135) = 20 / 0.565 = 35.39
    // Math.ceil(35.39 - 0.05) - 0.05 = 35.95
    expect(result.suggestedSellPrice).toBeCloseTo(35.95, 1);
  });

  it('adjusts suggested price if target margin violates minimum floor', () => {
    const result = calculatePricing({
      costPriceExGst: 2.00,
      targetMarginPercent: 10,   // Low margin
      minimumProfitFloor: 15.00, // Very high floor
    });
    
    // Suggestion would naturally be low based on target margin (10%)
    // But minimum floor should force it much higher
    expect(result.suggestedSellPrice).toBeGreaterThanOrEqual(result.minimumAcceptablePrice);
    expect(result.profitAtSuggestedPrice).toBeGreaterThanOrEqual(14.95);
  });
  
  it('returns warnings when sell price results in losses', () => {
     const warnings = validatePricingLogic(5.00, 10.00, 'ebay');
     expect(warnings[0]).toBe('Loss making at this price.');
  });
});
