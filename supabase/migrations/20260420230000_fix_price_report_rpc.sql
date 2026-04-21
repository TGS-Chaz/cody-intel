-- Fix: get_price_report_rollup — same three root causes as the brand RPC.
-- The per-category arm is small (<100 rows) but the per-brand × category
-- arm is high-cardinality (~5-15k combinations) and was being randomly
-- truncated by the PostgREST 1000-row cap, hiding own-brand vs market
-- price comparisons.
--
-- Both UNION arms:
--   * normalize category (and brand, arm 2) via lower(btrim(...)) so
--     casing variants collapse into one row.
--   * ORDER BY then LIMIT inside each arm before UNION so each half is
--     independently capped and deterministic.
--   * statement_timeout bumped to 120s.

BEGIN;

DROP FUNCTION IF EXISTS get_price_report_rollup();

CREATE FUNCTION get_price_report_rollup()
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
SET statement_timeout = '120s'
AS $$
  (
    -- (1) per-category price stats
    SELECT
      'category'::text                              AS kind,
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
    ORDER  BY price_count DESC NULLS LAST, category ASC
    LIMIT  200
  )
  UNION ALL
  (
    -- (2) per-brand × category price + distinct store count
    SELECT
      'brand_category'::text                        AS kind,
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
    GROUP  BY lower(btrim(mi.raw_category)), lower(btrim(mi.raw_brand))
    ORDER  BY store_count DESC NULLS LAST, price_count DESC, brand ASC, category ASC
    LIMIT  700
  );
-- Total cap: 200 + 700 = 900 rows, well under Supabase's default
-- db-max-rows=1000 PostgREST response cap. The ORDER BY inside each
-- UNION arm ensures the 1000-row cap (if ever hit in future configs)
-- truncates deterministically from the bottom, not a random slice.
$$;

GRANT EXECUTE ON FUNCTION get_price_report_rollup() TO anon, authenticated;

COMMIT;
