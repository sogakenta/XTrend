// XTrend Term Normalization
// Rule: NFKC -> trim -> collapse whitespace -> lowercase
// Note: Leading # is preserved (per plan.md:204)

/**
 * Normalize term text for deduplication.
 * Example: "  #ＡＩ　トレンド  " -> "#ai トレンド"
 */
export function normalizeTerm(text: string): string {
  return text
    // NFKC normalization (full-width -> half-width, etc.)
    .normalize('NFKC')
    // Trim leading/trailing whitespace
    .trim()
    // Collapse consecutive whitespace to single space
    .replace(/\s+/g, ' ')
    // Lowercase
    .toLowerCase();
}
