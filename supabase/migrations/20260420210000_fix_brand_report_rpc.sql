-- Fix: get_brand_report_rollup was returning non-deterministic results with
-- brand store_counts capped at 2-3. Three root causes in aaf9503:
--
--   1. No ORDER BY + Supabase/PostgREST db-max-rows=1000 cap on RPC responses
--      → the function emits rows in arbitrary (hash-agg) order, PostgREST
--      truncates to a random 1000-row subset, client .sort().slice(0, 50)
--      operates on the truncated sample → different "top brands" every refresh.
--   2. `GROUP BY mi.raw_brand` is case-sensitive → "Green Revolution",
--      "green revolution", "GREEN REVOLUTION" split into separate rows, each
--      with a fraction of the true 230-store count. Combined with (1), the
--      visible top-50 is dominated by 1-3-store long-tail variants.
--   3. Role-level statement_timeout (~3s) canceled the aggregate on cold
--      caches / contended pools. SECURITY DEFINER does NOT bypass role
--      statement_timeout — a `SET statement_timeout` clause on the function
--      does, for the duration of the call.
--
-- Verification: get_brand_store_count('Green Revolution') returns 230 in ~1.1s.
-- The new rollup groups by lower(trim(raw_brand)), so the same brand
-- aggregates into a single row with all 230 stores.

BEGIN;

DROP FUNCTION IF EXISTS get_brand_report_rollup();

CREATE FUNCTION get_brand_report_rollup()
RETURNS TABLE(
  brand          text,
  store_count    integer,
  total_products bigint,
  avg_price      numeric
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '120s'
AS $$
  SELECT
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
  GROUP  BY lower(btrim(mi.raw_brand))
  ORDER  BY store_count DESC NULLS LAST, brand ASC
  LIMIT  2000;
$$;

GRANT EXECUTE ON FUNCTION get_brand_report_rollup() TO anon, authenticated;

COMMIT;
