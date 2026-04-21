-- audit/50 — speed up get_brand_union_store_count.
--
-- Original (audit/49 P1a) used `lower(btrim(raw_brand)) = ANY(subquery)`
-- — the planner couldn't pin the expression index idx_menu_items_brand_normalized
-- because the comparison RHS was a subquery, so it fell back to a hash
-- semi-join that took 8-9s per Dashboard load.
--
-- Rewrite as plpgsql with a local text[] variable: the WHERE clause
-- becomes `lower(btrim(raw_brand)) = ANY(v_keys)` which is a concrete
-- array parameter at plan time and uses the index directly. Expected
-- 8-9s → <500ms.

BEGIN;

DROP FUNCTION IF EXISTS get_brand_union_store_count(text[]);

CREATE FUNCTION get_brand_union_store_count(p_brand_names text[])
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '60s'
AS $$
DECLARE
  v_keys text[];
  v_count integer;
BEGIN
  SELECT array_agg(DISTINCT lower(btrim(b)))
    INTO v_keys
    FROM unnest(p_brand_names) AS b
   WHERE b IS NOT NULL AND btrim(b) <> '';

  IF v_keys IS NULL OR cardinality(v_keys) = 0 THEN
    RETURN 0;
  END IF;

  SELECT COUNT(DISTINCT dm.intel_store_id)::integer
    INTO v_count
    FROM menu_items mi
    JOIN dispensary_menus dm ON mi.dispensary_menu_id = dm.id
   WHERE mi.is_on_menu = true
     AND dm.intel_store_id IS NOT NULL
     AND mi.raw_brand IS NOT NULL
     AND lower(btrim(mi.raw_brand)) = ANY(v_keys);

  RETURN COALESCE(v_count, 0);
END $$;

GRANT EXECUTE ON FUNCTION get_brand_union_store_count(text[]) TO anon, authenticated;

COMMIT;
