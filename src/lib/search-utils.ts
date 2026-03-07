/**
 * Escape special PostgREST / PostgreSQL characters in search inputs
 * used with `.ilike()` or `.or()` filters.
 *
 * Characters escaped: % _ \ ( ) , .
 */
export function escapeSearchInput(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/**
 * Escape characters that have special meaning in PostgREST `.or()` filter values.
 * Wraps commas / parens / dots so they are treated as literals.
 */
export function escapeOrFilterValue(input: string): string {
  return escapeSearchInput(input)
    .replace(/,/g, "\\,")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

/**
 * Build a safe `.or()` ilike filter string for multiple columns.
 */
export function buildSafeIlikeOr(columns: string[], rawSearch: string): string {
  const escaped = escapeOrFilterValue(rawSearch);
  return columns.map((col) => `${col}.ilike.%${escaped}%`).join(",");
}
