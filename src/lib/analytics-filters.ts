/**
 * Shared analytics filter rules for Cody Intel.
 *
 * Cannabis intelligence should only cover cannabis products.
 * Accessories, paraphernalia, and non-cannabis items are excluded
 * from all reports, dashboards, and AI context.
 */

// ── Category exclusions ──────────────────────────────────────────────────────
// Matched via case-insensitive substring against raw_category.

const EXCLUDED_CATEGORY_KEYWORDS = [
  "accessor",       // accessories, accessory
  "paraphernali",   // paraphernalia
  "apparel",        // apparel, clothing
  "merchandise",    // merch, merchandise
  "non-cannabis",   // non-cannabis
  "non_cannabis",
  "gear",           // smoking gear
  "lifestyle",      // lifestyle products
  "hardware",       // hardware / pipes / glass
  "supplies",       // general supplies (non-specific)
  "misc",           // miscellaneous non-cannabis
];

/**
 * Returns true if the category should be excluded from cannabis analytics.
 * @param cat raw_category value from menu_items
 */
export function isExcludedCategory(cat: string | null | undefined): boolean {
  if (!cat) return false;
  const lower = cat.toLowerCase();
  return EXCLUDED_CATEGORY_KEYWORDS.some((kw) => lower.includes(kw));
}

// ── Brand exclusions ─────────────────────────────────────────────────────────
// Exact case-insensitive match against raw_brand.
// Only non-cannabis accessory brands — do NOT include cannabis brands
// that happen to sound similar (e.g. "Raw Garden" is cannabis, "RAW" is papers).

const EXCLUDED_BRANDS_EXACT = new Set([
  "bic",
  "raw",          // RAW rolling papers (NOT Raw Garden — that's matched by full name)
  "ocb",
  "clipper",
  "elements",     // Elements rolling papers
  "juicy jay",
  "juicy jays",
  "zig zag",
  "zigzag",
  "king palm",
  "randy's",
  "randys",
  "raws",
  "joker",
  "job",          // J.O.B. rolling papers
  "rizla",
  "smoke buddy",
  "smokebuddy",
  "raw life",
  "raw papers",
]);

/**
 * Returns true if the brand is a non-cannabis accessory brand that should
 * be excluded from cannabis analytics. Uses exact match only — does NOT
 * do substring matching to avoid false positives on real cannabis brands.
 * @param brand raw_brand value from menu_items
 */
export function isExcludedBrand(brand: string | null | undefined): boolean {
  if (!brand) return false;
  return EXCLUDED_BRANDS_EXACT.has(brand.toLowerCase().trim());
}
