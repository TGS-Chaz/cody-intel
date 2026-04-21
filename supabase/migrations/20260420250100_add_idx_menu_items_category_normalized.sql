-- audit/49 P0 index 2/3 — matches GROUP BY lower(btrim(raw_category)) in
-- get_category_report_rollup and the category arm of get_price_report_rollup.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_menu_items_category_normalized
  ON menu_items (lower(btrim(raw_category)))
  WHERE raw_category IS NOT NULL;
