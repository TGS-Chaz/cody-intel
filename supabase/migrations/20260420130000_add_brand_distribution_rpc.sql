-- P0 from audit/48 — server-side aggregate for Reports → Distribution tab.
-- BrandDistribution needs store_count + total_products for every brand (not
-- just top 50) to compute the reach-histogram (1-store / 2-5 / 6-15 / …).
-- Avg_price is not used here, so this RPC is slightly cheaper than the
-- get_brand_report_rollup counterpart.

BEGIN;

CREATE OR REPLACE FUNCTION get_brand_distribution_rollup()
RETURNS TABLE(
  brand          text,
  store_count    integer,
  total_products bigint
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    mi.raw_brand                                  AS brand,
    COUNT(DISTINCT dm.intel_store_id)::integer    AS store_count,
    COUNT(*)::bigint                              AS total_products
  FROM   menu_items mi
  JOIN   dispensary_menus dm ON mi.dispensary_menu_id = dm.id
  WHERE  mi.is_on_menu = true
    AND  mi.raw_brand IS NOT NULL
    AND  dm.intel_store_id IS NOT NULL
  GROUP  BY mi.raw_brand;
$$;

GRANT EXECUTE ON FUNCTION get_brand_distribution_rollup() TO anon, authenticated;

COMMIT;
