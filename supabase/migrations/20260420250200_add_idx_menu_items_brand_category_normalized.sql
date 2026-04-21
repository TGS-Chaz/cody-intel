-- audit/49 P0 index 3/3 — composite for the brand_category arm of
-- get_price_report_rollup. Covers both GROUP BY keys in one index scan.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_menu_items_brand_category_normalized
  ON menu_items (lower(btrim(raw_brand)), lower(btrim(raw_category)))
  WHERE raw_brand IS NOT NULL AND raw_category IS NOT NULL;
