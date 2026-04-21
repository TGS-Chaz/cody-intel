-- P0 from audit/48 — server-side aggregate for Reports → Brands tab.
-- Replaces client-side `.in("dispensary_menu_id", [315 UUIDs])` fetch that
-- was hitting PostgREST's 1000-row response cap on a 1.275M-row table and
-- under-reporting brand store_counts by ~99% (Green Revolution: 3 → 230).
--
-- SECURITY DEFINER + pinned search_path. The function aggregates to one row
-- per brand (≤ ~2k rows) — no row-level data leaves the server, so bypassing
-- RLS carries no data-leak risk and avoids per-row RLS eval on 1.275M rows.
-- Client still filters `isExcludedBrand()` in JS (single source of truth in
-- src/lib/analytics-filters.ts) and slices the top 50.

BEGIN;

CREATE OR REPLACE FUNCTION get_brand_report_rollup()
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
AS $$
  SELECT
    mi.raw_brand                                                                    AS brand,
    COUNT(DISTINCT dm.intel_store_id)::integer                                      AS store_count,
    COUNT(*)::bigint                                                                AS total_products,
    AVG(mi.raw_price) FILTER (WHERE mi.raw_price IS NOT NULL AND mi.raw_price > 0)  AS avg_price
  FROM   menu_items mi
  JOIN   dispensary_menus dm ON mi.dispensary_menu_id = dm.id
  WHERE  mi.is_on_menu = true
    AND  mi.raw_brand IS NOT NULL
    AND  dm.intel_store_id IS NOT NULL
  GROUP  BY mi.raw_brand;
$$;

GRANT EXECUTE ON FUNCTION get_brand_report_rollup() TO anon, authenticated;

COMMIT;
