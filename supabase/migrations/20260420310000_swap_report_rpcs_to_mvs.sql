-- audit/49 P1b — swap the 4 Report RPCs to read from their materialized
-- views. Same signature + return shape as before (no frontend change
-- needed). Each RPC becomes a thin SELECT with LIMIT, expected sub-50ms.

BEGIN;

-- ── get_brand_report_rollup ──────────────────────────────────────────────────
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
AS $$
  SELECT brand, store_count, total_products, avg_price
  FROM   mv_brand_report
  ORDER  BY store_count DESC NULLS LAST, brand ASC
  LIMIT  2000;
$$;

GRANT EXECUTE ON FUNCTION get_brand_report_rollup() TO anon, authenticated;

-- ── get_category_report_rollup ───────────────────────────────────────────────
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
AS $$
  SELECT category, product_count, store_count, avg_price
  FROM   mv_category_report
  ORDER  BY product_count DESC NULLS LAST, category ASC
  LIMIT  500;
$$;

GRANT EXECUTE ON FUNCTION get_category_report_rollup() TO anon, authenticated;

-- ── get_price_report_rollup ──────────────────────────────────────────────────
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
AS $$
  (
    SELECT kind, category, brand, avg_price, min_price, max_price, price_count, store_count
    FROM   mv_price_report
    WHERE  kind = 'category'
    ORDER  BY price_count DESC NULLS LAST, category ASC
    LIMIT  200
  )
  UNION ALL
  (
    SELECT kind, category, brand, avg_price, min_price, max_price, price_count, store_count
    FROM   mv_price_report
    WHERE  kind = 'brand_category'
    ORDER  BY store_count DESC NULLS LAST, price_count DESC, brand ASC, category ASC
    LIMIT  700
  );
$$;

GRANT EXECUTE ON FUNCTION get_price_report_rollup() TO anon, authenticated;

-- ── get_brand_distribution_rollup ────────────────────────────────────────────
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
AS $$
  SELECT brand, store_count, total_products
  FROM   mv_brand_distribution
  ORDER  BY store_count DESC NULLS LAST, brand ASC
  LIMIT  2000;
$$;

GRANT EXECUTE ON FUNCTION get_brand_distribution_rollup() TO anon, authenticated;

COMMIT;
