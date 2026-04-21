-- audit/49 P1b — materialized view for get_brand_distribution_rollup.
-- Same shape as mv_brand_report minus avg_price — used by the reach
-- histogram on the Reports → Distribution tab (not just top-50, full
-- long-tail).

BEGIN;

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_brand_distribution AS
  SELECT
    lower(btrim(mi.raw_brand))                    AS brand_key,
    MIN(mi.raw_brand)                             AS brand,
    COUNT(DISTINCT dm.intel_store_id)::integer    AS store_count,
    COUNT(*)::bigint                              AS total_products
  FROM   menu_items mi
  JOIN   dispensary_menus dm ON mi.dispensary_menu_id = dm.id
  WHERE  mi.is_on_menu = true
    AND  mi.raw_brand IS NOT NULL
    AND  btrim(mi.raw_brand) <> ''
    AND  dm.intel_store_id IS NOT NULL
  GROUP  BY lower(btrim(mi.raw_brand));

CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_brand_distribution_brand_key
  ON mv_brand_distribution(brand_key);

CREATE INDEX IF NOT EXISTS ix_mv_brand_distribution_store_count
  ON mv_brand_distribution(store_count DESC NULLS LAST, brand ASC);

GRANT SELECT ON mv_brand_distribution TO anon, authenticated;

COMMIT;
