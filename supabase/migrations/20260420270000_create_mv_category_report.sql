-- audit/49 P1b — materialized view for get_category_report_rollup.
-- Small (~200 groups) but pre-aggregating saves the 5s scan.

BEGIN;

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_category_report AS
  SELECT
    lower(btrim(mi.raw_category))                                                   AS category_key,
    MIN(mi.raw_category)                                                            AS category,
    COUNT(*)::bigint                                                                AS product_count,
    COUNT(DISTINCT dm.intel_store_id)::integer                                      AS store_count,
    AVG(mi.raw_price) FILTER (WHERE mi.raw_price IS NOT NULL AND mi.raw_price > 0)  AS avg_price
  FROM   menu_items mi
  JOIN   dispensary_menus dm ON mi.dispensary_menu_id = dm.id
  WHERE  mi.is_on_menu = true
    AND  mi.raw_category IS NOT NULL
    AND  btrim(mi.raw_category) <> ''
    AND  dm.intel_store_id IS NOT NULL
  GROUP  BY lower(btrim(mi.raw_category));

CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_category_report_category_key
  ON mv_category_report(category_key);

CREATE INDEX IF NOT EXISTS ix_mv_category_report_product_count
  ON mv_category_report(product_count DESC NULLS LAST, category ASC);

GRANT SELECT ON mv_category_report TO anon, authenticated;

COMMIT;
