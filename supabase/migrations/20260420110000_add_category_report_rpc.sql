-- P0 from audit/48 — server-side aggregate for Reports → Categories tab.
-- Same pattern as get_brand_report_rollup: replaces the client-side chunked
-- .in() fetch that was truncating to 1000 rows and under-counting category
-- store coverage.

BEGIN;

CREATE OR REPLACE FUNCTION get_category_report_rollup()
RETURNS TABLE(
  category       text,
  product_count  bigint,
  store_count    integer,
  avg_price      numeric
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    mi.raw_category                                                                 AS category,
    COUNT(*)::bigint                                                                AS product_count,
    COUNT(DISTINCT dm.intel_store_id)::integer                                      AS store_count,
    AVG(mi.raw_price) FILTER (WHERE mi.raw_price IS NOT NULL AND mi.raw_price > 0)  AS avg_price
  FROM   menu_items mi
  JOIN   dispensary_menus dm ON mi.dispensary_menu_id = dm.id
  WHERE  mi.is_on_menu = true
    AND  mi.raw_category IS NOT NULL
    AND  dm.intel_store_id IS NOT NULL
  GROUP  BY mi.raw_category;
$$;

GRANT EXECUTE ON FUNCTION get_category_report_rollup() TO anon, authenticated;

COMMIT;
