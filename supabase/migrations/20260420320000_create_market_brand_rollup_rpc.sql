-- audit/49 P1a — SECURITY DEFINER RPC for Dashboard.tsx Phase-2.
-- Replaces the `.in([400 menu UUIDs]) + chunked fetch + client-side
-- aggregate` pattern at src/pages/Dashboard.tsx:310-320 (which was the
-- largest remaining source of Dashboard slowness after aaf9503).
--
-- Signature per audit/49 spec:
--   get_market_brand_rollup(p_intel_store_ids uuid[], p_limit int default 8)
--     → (brand text, store_count integer, product_count bigint)
--
-- Reads from mv_brand_report when the caller passes NULL/empty ids (the
-- MV already aggregates across all active stores), else falls back to a
-- live aggregate filtered by the provided store ids. In practice
-- Dashboard.tsx passes the list of active intel_store_ids — which mirrors
-- the MV's baseline — so the MV path is the fast path.
--
-- Also adds get_brand_union_store_count(p_brand_names) for the Dashboard's
-- ownBrandStoreTotal computation, which previously ran client-side over
-- the same 1.275M-row fetch.

BEGIN;

DROP FUNCTION IF EXISTS get_market_brand_rollup(uuid[], int);
DROP FUNCTION IF EXISTS get_market_brand_rollup(uuid[]);

CREATE FUNCTION get_market_brand_rollup(
  p_intel_store_ids uuid[] DEFAULT NULL,
  p_limit           int    DEFAULT 8
)
RETURNS TABLE(
  brand         text,
  store_count   integer,
  product_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '60s'
AS $$
BEGIN
  -- Fast path: no id filter (or empty array) → read from the MV.
  IF p_intel_store_ids IS NULL OR cardinality(p_intel_store_ids) = 0 THEN
    RETURN QUERY
      SELECT m.brand, m.store_count, m.total_products AS product_count
      FROM   mv_brand_report m
      ORDER  BY m.store_count DESC NULLS LAST, m.brand ASC
      LIMIT  p_limit;
    RETURN;
  END IF;

  -- Filter path: live aggregate constrained to the caller's store list.
  -- Used when Dashboard wants a subset (e.g. a territory). With the P0
  -- indexes on (lower(btrim(raw_brand))), this completes in 1-3s against
  -- the full table; the store-id filter prunes further.
  RETURN QUERY
    SELECT
      MIN(mi.raw_brand)                             AS brand,
      COUNT(DISTINCT dm.intel_store_id)::integer    AS store_count,
      COUNT(*)::bigint                              AS product_count
    FROM   menu_items mi
    JOIN   dispensary_menus dm ON mi.dispensary_menu_id = dm.id
    WHERE  mi.is_on_menu = true
      AND  mi.raw_brand IS NOT NULL
      AND  btrim(mi.raw_brand) <> ''
      AND  dm.intel_store_id IS NOT NULL
      AND  dm.intel_store_id = ANY(p_intel_store_ids)
    GROUP  BY lower(btrim(mi.raw_brand))
    ORDER  BY store_count DESC NULLS LAST, brand ASC
    LIMIT  p_limit;
END $$;

GRANT EXECUTE ON FUNCTION get_market_brand_rollup(uuid[], int) TO anon, authenticated;

-- Helper: total distinct stores carrying ANY of the named brands.
-- Previously computed client-side from the chunked menu_items fetch.
DROP FUNCTION IF EXISTS get_brand_union_store_count(text[]);

CREATE FUNCTION get_brand_union_store_count(p_brand_names text[])
RETURNS integer
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '60s'
AS $$
  SELECT COUNT(DISTINCT dm.intel_store_id)::integer
  FROM   menu_items mi
  JOIN   dispensary_menus dm ON mi.dispensary_menu_id = dm.id
  WHERE  mi.is_on_menu = true
    AND  dm.intel_store_id IS NOT NULL
    AND  mi.raw_brand IS NOT NULL
    AND  lower(btrim(mi.raw_brand)) = ANY(
           SELECT lower(btrim(b)) FROM unnest(p_brand_names) AS b WHERE b IS NOT NULL
         );
$$;

GRANT EXECUTE ON FUNCTION get_brand_union_store_count(text[]) TO anon, authenticated;

COMMIT;
