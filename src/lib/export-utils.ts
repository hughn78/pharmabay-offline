import * as XLSX from "xlsx";
import Papa from "papaparse";

export interface ExportOptions {
  format: "csv" | "xlsx";
  filename: string;
  columns: { key: string; label: string }[];
  data: Record<string, any>[];
}

const priceFields = new Set([
  "cost_price", "sell_price", "ebay_listed_price", "shopify_listed_price",
  "stock_value", "total_sales_value_12m", "total_cogs_12m",
]);

function formatValue(key: string, value: any): any {
  if (value == null) return "";
  if (priceFields.has(key)) return Number(Number(value).toFixed(2));
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

export function exportCSV(opts: ExportOptions) {
  const rows = opts.data.map((row) =>
    Object.fromEntries(opts.columns.map((c) => [c.label, formatValue(c.key, row[c.key])]))
  );
  const csv = Papa.unparse(rows, { header: true });
  downloadBlob(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }), `${opts.filename}.csv`);
}

export function exportXLSX(opts: ExportOptions) {
  const rows = opts.data.map((row) =>
    opts.columns.map((c) => formatValue(c.key, row[c.key]))
  );
  const headers = opts.columns.map((c) => c.label);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Column widths
  ws["!cols"] = opts.columns.map((c) => ({
    wch: Math.max(c.label.length + 2, 14),
  }));

  // Freeze header
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "PharmaBay Products");
  XLSX.writeFile(wb, `${opts.filename}.xlsx`);
}

export function triggerExport(opts: ExportOptions) {
  if (opts.format === "csv") exportCSV(opts);
  else exportXLSX(opts);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const PRODUCT_EXPORT_COLUMNS: { key: string; label: string }[] = [
  { key: "source_product_name", label: "Product Name" },
  { key: "brand", label: "Brand" },
  { key: "barcode", label: "Barcode" },
  { key: "sku", label: "SKU" },
  { key: "sell_price", label: "Sell Price (AUD)" },
  { key: "cost_price", label: "Cost Price (AUD)" },
  { key: "stock_on_hand", label: "Stock On Hand" },
  { key: "product_status", label: "Status" },
  { key: "product_type", label: "Product Type" },
  { key: "manufacturer", label: "Manufacturer" },
  { key: "pack_size", label: "Pack Size" },
  { key: "short_description", label: "Short Description" },
  { key: "department", label: "Department" },
  { key: "supplier", label: "Supplier" },
  { key: "weight_grams", label: "Weight (g)" },
  { key: "country_of_origin", label: "Country of Origin" },
  { key: "created_at", label: "Created At" },
  { key: "updated_at", label: "Updated At" },
];
