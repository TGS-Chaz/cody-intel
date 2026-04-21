-- Regression fix — replace the 13 parallel get_brand_store_count calls on
-- Dashboard with a single MV-backed RPC. Under Supabase infra stress (like
-- the 521/503 window we hit post-audit/50), fanning out 13 live-aggregating
-- RPCs in Promise.all causes partial failures: some return 200 with real
-- counts, others return 5xx → caught → store_count set to 0. Result on the
-- UI: "Your Brand Performance" shows 13 brand rows all at 0 stores.
--
-- Reading from mv_brand_report is sub-50ms and one round-trip, so a
-- single call either all-works or all-fails (easy to distinguish from
-- "brand really has 0 stores").

BEGIN;

DROP FUNCTION IF EXISTS get_own_brand_presence(text[]);

CREATE FUNCTION get_own_brand_presence(p_brand_names text[])
RETURNS TABLE(
  brand_name  text,
  store_count integer
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- Preserves caller-provided brand_name casing so the widget label matches
  -- user_brands (not the MV's MIN(raw_brand) which can be lowercased).
  -- LEFT JOIN so brands absent from the MV still appear with store_count=0,
  -- matching the prior behavior of get_brand_store_count returning 0 for
  -- unknown brands.
  WITH targets AS (
    SELECT b              AS brand_name,
           lower(btrim(b)) AS key
    FROM   unnest(p_brand_names) AS b
    WHERE  b IS NOT NULL AND btrim(b) <> ''
  )
  SELECT t.brand_name,
         COALESCE(mv.store_count, 0)::integer AS store_count
  FROM   targets t
  LEFT   JOIN mv_brand_report mv ON mv.brand_key = t.key;
$$;

GRANT EXECUTE ON FUNCTION get_own_brand_presence(text[]) TO anon, authenticated;

COMMIT;
