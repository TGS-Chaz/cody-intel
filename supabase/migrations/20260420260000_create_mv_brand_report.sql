-- audit/49 P1b — materialized view for get_brand_report_rollup.
-- Pre-aggregates one row per (case-folded, trimmed) brand across all
-- active menus. Refreshed by cron (see 20260420300000). The RPC is
-- re-created in 20260420310000 to SELECT from this MV.
--
-- Unique index on brand_key is required for REFRESH MATERIALIZED VIEW
-- CONCURRENTLY. Secondary index on store_count supports the ORDER BY
-- in the RPC (top-N query).
--
-- Initial CREATE MATERIALIZED VIEW populates the data — expect 5-10s.

BEGIN;

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_brand_report AS
  SELECT
    lower(btrim(mi.raw_brand))                                                      AS brand_key,
    MIN(mi.raw_brand)                                                               AS brand,
    COUNT(DISTINCT dm.intel_store_id)::integer                                      AS store_count,
    COUNT(*)::bigint                                                                AS total_products,
    AVG(mi.raw_price) FILTER (WHERE mi.raw_price IS NOT NULL AND mi.raw_price > 0)  AS avg_price
  FROM   menu_items mi
  JOIN   dispensary_menus dm ON mi.dispensary_menu_id = dm.id
  WHERE  mi.is_on_menu = true
    AND  mi.raw_brand IS NOT NULL
    AND  btrim(mi.raw_brand) <> ''
    AND  dm.intel_store_id IS NOT NULL
  GROUP  BY lower(btrim(mi.raw_brand));

CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_brand_report_brand_key
  ON mv_brand_report(brand_key);

CREATE INDEX IF NOT EXISTS ix_mv_brand_report_store_count
  ON mv_brand_report(store_count DESC NULLS LAST, brand ASC);

GRANT SELECT ON mv_brand_report TO anon, authenticated;

COMMIT;
