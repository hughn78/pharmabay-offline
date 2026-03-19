export const HIGH_RISK_TERMS = [
  'cure', 'treats', 'prevents', 'heals', 'miracle', 'guaranteed', '100% effective',
  'covid', 'cancer', 'diabetes', 'clinical', 'medical', 'prescription only'
];

export function validatePharmacyContent(text: string): { isValid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  if (!text) return { isValid: true, warnings: [] };

  const lowerText = text.toLowerCase();

  for (const term of HIGH_RISK_TERMS) {
    if (lowerText.includes(term.toLowerCase())) {
      warnings.push(`High risk term detected: "${term}". Consider modifying to avoid marketplace takedowns.`);
    }
  }

  // basic check for OTC pack size or strength mentions
  if (!/\b(\d+(?:\.\d+)?\s*(?:pack|s|capsules|tablets|lozenge|vial|ml|g|l|mg|mcg|%|iu))\b/i.test(lowerText)) {
    warnings.push('No pack size or physical strength detected. Ensure OTC product specifics are clear in the listing.');
  }

  return {
    isValid: warnings.length === 0,
    warnings,
  };
}
