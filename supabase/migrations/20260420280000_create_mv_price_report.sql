-- audit/49 P1b — materialized view for get_price_report_rollup.
-- Two-part UNION (per-category + per-brand × category) in one MV with
-- a `kind` discriminator. Unique index needs to span (kind, keys) so
-- the per-category arm (with NULL brand_key) doesn't collide.
--
-- Initial CREATE MATERIALIZED VIEW runs both scans back-to-back —
-- expect 10-15s.

BEGIN;

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_price_report AS
  SELECT
    'category'::text                              AS kind,
    lower(btrim(mi.raw_category))                 AS category_key,
    ''::text                                      AS brand_key,
    MIN(mi.raw_category)                          AS category,
    NULL::text                                    AS brand,
    AVG(mi.raw_price)::numeric                    AS avg_price,
    MIN(mi.raw_price)::numeric                    AS min_price,
    MAX(mi.raw_price)::numeric                    AS max_price,
    COUNT(*)::bigint                              AS price_count,
    NULL::integer                                 AS store_count
  FROM   menu_items mi
  JOIN   dispensary_menus dm ON mi.dispensary_menu_id = dm.id
  WHERE  mi.is_on_menu = true
    AND  mi.raw_category IS NOT NULL
    AND  btrim(mi.raw_category) <> ''
    AND  mi.raw_price IS NOT NULL
    AND  mi.raw_price > 0
    AND  dm.intel_store_id IS NOT NULL
  GROUP  BY lower(btrim(mi.raw_category))

  UNION ALL

  SELECT
    'brand_category'::text                        AS kind,
    lower(btrim(mi.raw_category))                 AS category_key,
    lower(btrim(mi.raw_brand))                    AS brand_key,
    MIN(mi.raw_category)                          AS category,
    MIN(mi.raw_brand)                             AS brand,
    AVG(mi.raw_price)::numeric                    AS avg_price,
    NULL::numeric                                 AS min_price,
    NULL::numeric                                 AS max_price,
    COUNT(*)::bigint                              AS price_count,
    COUNT(DISTINCT dm.intel_store_id)::integer    AS store_count
  FROM   menu_items mi
  JOIN   dispensary_menus dm ON mi.dispensary_menu_id = dm.id
  WHERE  mi.is_on_menu = true
    AND  mi.raw_category IS NOT NULL
    AND  btrim(mi.raw_category) <> ''
    AND  mi.raw_brand IS NOT NULL
    AND  btrim(mi.raw_brand) <> ''
    AND  mi.raw_price IS NOT NULL
    AND  mi.raw_price > 0
    AND  dm.intel_store_id IS NOT NULL
  GROUP  BY lower(btrim(mi.raw_category)), lower(btrim(mi.raw_brand));

CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_price_report_kind_keys
  ON mv_price_report(kind, category_key, brand_key);

CREATE INDEX IF NOT EXISTS ix_mv_price_report_category_arm
  ON mv_price_report(price_count DESC NULLS LAST, category ASC)
  WHERE kind = 'category';

CREATE INDEX IF NOT EXISTS ix_mv_price_report_brand_cat_arm
  ON mv_price_report(store_count DESC NULLS LAST, price_count DESC, brand ASC, category ASC)
  WHERE kind = 'brand_category';

GRANT SELECT ON mv_price_report TO anon, authenticated;

COMMIT;
