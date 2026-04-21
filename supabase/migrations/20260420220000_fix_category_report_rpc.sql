-- Fix: get_category_report_rollup — same three root causes as
-- get_brand_report_rollup (see 20260420210000_fix_brand_report_rpc.sql):
-- missing ORDER BY + PostgREST 1000-row cap → random truncation,
-- case-sensitive GROUP BY → split rows, role statement_timeout → cancels.
--
-- Categories are a smaller cardinality (<100 distinct) than brands, so the
-- 1000-row cap rarely truncated this one in practice — but the same
-- determinism + timeout + case-normalization fixes apply uniformly.

BEGIN;

DROP FUNCTION IF EXISTS get_category_report_rollup();

CREATE FUNCTION get_category_report_rollup()
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
SET statement_timeout = '120s'
AS $$
  SELECT
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
  GROUP  BY lower(btrim(mi.raw_category))
  ORDER  BY product_count DESC NULLS LAST, category ASC
  LIMIT  500;
$$;

GRANT EXECUTE ON FUNCTION get_category_report_rollup() TO anon, authenticated;

COMMIT;
