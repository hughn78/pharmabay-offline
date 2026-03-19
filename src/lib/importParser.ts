export interface ParsedProduct {
  brand?: string;
  productName?: string;
  sizeOrStrength?: string;
  packCount?: string;
  form?: string;
  barcode?: string;
  costPrice?: number;
  categoryHints?: string[];
  rawText: string;
}

export function parsePharmacyText(rawText: string): ParsedProduct {
  const result: ParsedProduct = { rawText, categoryHints: [] };
  
  if (!rawText || rawText.trim() === '') return result;

  // Normalize multi-line to single line for easier regex on contiguous blocks
  const normalized = rawText.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

  // Extract Price (e.g. $12.50, 12.50)
  const priceMatch = normalized.match(/\$?\s*(\d+\.\d{2})/);
  if (priceMatch) {
    result.costPrice = parseFloat(priceMatch[1]);
  }

  // Extract Barcode/GTIN (12 to 14 digits)
  const barcodeMatch = normalized.match(/\b(\d{12,14})\b/);
  if (barcodeMatch) {
    result.barcode = barcodeMatch[1];
  }

  // Form hints
  const forms = ['TABLETS', 'CAPSULES', 'CREAM', 'OINTMENT', 'GEL', 'LIQUID', 'SYRUP', 'DROPS', 'LOZENGES', 'POWDER', 'SPRAY', 'GUM', 'PATCHES'];
  const formRegex = new RegExp(`\\b(${forms.join('|')})\\b`, 'i');
  const formMatch = normalized.match(formRegex);
  if (formMatch) {
    result.form = formMatch[1].toUpperCase();
    result.categoryHints!.push(result.form);
  }

  // Size/Strength (e.g. 500mg, 10g, 200ml, 1% w/w)
  const sizeMatch = normalized.match(/\b(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|l|%|iu|w\/w|w\/v|v\/v))\b/i);
  if (sizeMatch) {
    result.sizeOrStrength = sizeMatch[1].toLowerCase();
  }

  // Pack Count (e.g. 100s, 50 Pack, 30 Tablets, x60)
  const packMatch = normalized.match(/\b(?:x\s*(\d+)|(\d+)\s*(?:pack|s|tablets|capsules|pcs))\b/i);
  if (packMatch) {
    result.packCount = packMatch[1] || packMatch[2];
  }

  // Extracted simple name (everything before the price/barcode/form hints if possible)
  // Let's strip out known tokens to leave brand/name
  let nameRemaining = normalized;
  if (priceMatch) nameRemaining = nameRemaining.replace(priceMatch[0], '');
  if (barcodeMatch) nameRemaining = nameRemaining.replace(barcodeMatch[0], '');
  if (sizeMatch) nameRemaining = nameRemaining.replace(sizeMatch[0], '');
  if (packMatch) nameRemaining = nameRemaining.replace(packMatch[0], '');

  nameRemaining = nameRemaining.replace(/\s+/g, ' ').trim();
  
  // Very naive brand extraction (first word uppercase usually)
  const words = nameRemaining.split(' ');
  if (words.length > 0) {
    result.brand = words[0];
    result.productName = words.slice(1).join(' ').trim() || result.brand;
  }

  return result;
}
