-- P0 from audit/48 — server-side aggregate for Reports → Prices tab.
-- The Prices tab needs two aggregations from the same scan:
--   1) Per-category price stats (avg/min/max/count) — used in the bar chart
--      and Price-by-Category table. Client-side filter: count >= 5.
--   2) Per-brand × category price + store count — used in the Price
--      Comparison by Brand table (own vs market). Client-side filter:
--      count >= 3.
-- One UNION-ed RPC returns both shapes with a `kind` discriminator so the
-- client can split them without a second round trip.

BEGIN;

CREATE OR REPLACE FUNCTION get_price_report_rollup()
RETURNS TABLE(
  kind          text,
  category      text,
  brand         text,
  avg_price     numeric,
  min_price     numeric,
  max_price     numeric,
  price_count   bigint,
  store_count   integer
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- (1) per-category price stats
  SELECT
    'category'::text                              AS kind,
    mi.raw_category                               AS category,
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
    AND  mi.raw_price IS NOT NULL
    AND  mi.raw_price > 0
    AND  dm.intel_store_id IS NOT NULL
  GROUP  BY mi.raw_category

  UNION ALL

  -- (2) per-brand × category price + distinct store count
  SELECT
    'brand_category'::text                        AS kind,
    mi.raw_category                               AS category,
    mi.raw_brand                                  AS brand,
    AVG(mi.raw_price)::numeric                    AS avg_price,
    NULL::numeric                                 AS min_price,
    NULL::numeric                                 AS max_price,
    COUNT(*)::bigint                              AS price_count,
    COUNT(DISTINCT dm.intel_store_id)::integer    AS store_count
  FROM   menu_items mi
  JOIN   dispensary_menus dm ON mi.dispensary_menu_id = dm.id
  WHERE  mi.is_on_menu = true
    AND  mi.raw_category IS NOT NULL
    AND  mi.raw_brand IS NOT NULL
    AND  mi.raw_price IS NOT NULL
    AND  mi.raw_price > 0
    AND  dm.intel_store_id IS NOT NULL
  GROUP  BY mi.raw_category, mi.raw_brand;
$$;

GRANT EXECUTE ON FUNCTION get_price_report_rollup() TO anon, authenticated;

COMMIT;
