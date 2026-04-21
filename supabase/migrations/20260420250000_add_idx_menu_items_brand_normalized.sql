-- audit/49 P0 index 1/3 — matches GROUP BY lower(btrim(raw_brand)) in
-- get_brand_report_rollup / get_brand_distribution_rollup.
--
-- CONCURRENTLY: no BEGIN/COMMIT, one statement per file (pgx pipelines
-- multiple statements in a single file and CREATE INDEX CONCURRENTLY
-- cannot run in a pipeline — hence each P0 index is in its own migration).

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_menu_items_brand_normalized
  ON menu_items (lower(btrim(raw_brand)))
  WHERE raw_brand IS NOT NULL;
