type CompareFieldDef = {
  key: string;
  label: string;
  localKey: string;
  shopifyPath: string;
  isArray?: boolean;
  isNumber?: boolean;
};

export const COMPARE_FIELDS: CompareFieldDef[] = [
  { key: "title", label: "Title", localKey: "normalized_product_name", shopifyPath: "title" },
  { key: "vendor", label: "Vendor / Brand", localKey: "brand", shopifyPath: "vendor" },
  { key: "product_type", label: "Product Type", localKey: "product_type", shopifyPath: "productType" },
  { key: "tags", label: "Tags", localKey: "z_category", shopifyPath: "tags", isArray: true },
  { key: "status", label: "Status", localKey: "enrichment_status", shopifyPath: "status" },
  { key: "barcode", label: "Barcode", localKey: "barcode", shopifyPath: "_firstVariantBarcode" },
  { key: "sku", label: "SKU", localKey: "sku", shopifyPath: "_firstVariantSku" },
  { key: "price", label: "Price", localKey: "sell_price", shopifyPath: "_firstVariantPrice", isNumber: true },
  { key: "cost", label: "Cost Price", localKey: "cost_price", shopifyPath: "_firstVariantCostPerItem", isNumber: true },
  { key: "inventory", label: "Inventory Qty", localKey: "stock_on_hand", shopifyPath: "_firstVariantInventoryQty", isNumber: true },
];

export type CompareField = CompareFieldDef;

export type FieldDiff = {
  field: CompareField;
  localValue: string;
  shopifyValue: string;
  isDifferent: boolean;
};

export type MatchedProduct = {
  localProduct: any;
  shopifyProduct: any;
  shopifyRaw: any;
  matchType: "barcode" | "sku" | "title";
  diffs: FieldDiff[];
};

function extractShopifyValue(raw: any, shopifyPath: string): string {
  if (shopifyPath.startsWith("_firstVariant")) {
    const first = raw?.variants?.edges?.[0]?.node;
    if (!first) return "";
    const map: Record<string, string> = {
      _firstVariantBarcode: first.barcode || "",
      _firstVariantSku: first.sku || "",
      _firstVariantPrice: first.price || "",
      _firstVariantCostPerItem: first.costPerItem || "",
      _firstVariantInventoryQty: String(first.inventoryQuantity ?? ""),
    };
    return map[shopifyPath] ?? "";
  }
  const val = raw?.[shopifyPath];
  if (Array.isArray(val)) return val.join(", ");
  return val != null ? String(val) : "";
}

export function compareProducts(local: any, shopifyRaw: any): FieldDiff[] {
  return COMPARE_FIELDS.map((field) => {
    const localVal = local?.[field.localKey] != null ? String(local[field.localKey]) : "";
    const shopifyVal = extractShopifyValue(shopifyRaw, field.shopifyPath);
    const normalizeNum = (v: string) => {
      if (!field.isNumber) return v.toLowerCase().trim();
      const n = parseFloat(v);
      return isNaN(n) ? "" : n.toFixed(2);
    };
    return { field, localValue: localVal, shopifyValue: shopifyVal, isDifferent: normalizeNum(localVal) !== normalizeNum(shopifyVal) };
  });
}
