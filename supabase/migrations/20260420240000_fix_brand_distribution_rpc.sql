-- Fix: get_brand_distribution_rollup — same three root causes as
-- get_brand_report_rollup (see 20260420210000). This RPC powers the
-- BrandDistribution reach histogram (1-store / 2-5 / 6-15 / …), so
-- the FULL distribution matters — not just the top 50.
--
-- LIMIT 2000 is a hard ceiling: if there are more than 2000 distinct
-- (case-folded) brands in menu_items, the lowest-reach tail is dropped.
-- In practice the current count is ~1.5-2k, so this is safe. If the
-- brand catalog grows, revisit the limit or move to a materialized view.

BEGIN;

DROP FUNCTION IF EXISTS get_brand_distribution_rollup();

CREATE FUNCTION get_brand_distribution_rollup()
RETURNS TABLE(
  brand          text,
  store_count    integer,
  total_products bigint
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '120s'
AS $$
  SELECT
    MIN(mi.raw_brand)                             AS brand,
    COUNT(DISTINCT dm.intel_store_id)::integer    AS store_count,
    COUNT(*)::bigint                              AS total_products
  FROM   menu_items mi
  JOIN   dispensary_menus dm ON mi.dispensary_menu_id = dm.id
  WHERE  mi.is_on_menu = true
    AND  mi.raw_brand IS NOT NULL
    AND  btrim(mi.raw_brand) <> ''
    AND  dm.intel_store_id IS NOT NULL
  GROUP  BY lower(btrim(mi.raw_brand))
  ORDER  BY store_count DESC NULLS LAST, brand ASC
  LIMIT  2000;
$$;

GRANT EXECUTE ON FUNCTION get_brand_distribution_rollup() TO anon, authenticated;

COMMIT;
