-- ─────────────────────────────────────────────────────────────────────────────
-- Dashboard RPC fixes — two 500s resolved via function rewrites.
-- ─────────────────────────────────────────────────────────────────────────────

-- Fix 1: normalization_stats was doing 4× full scans of menu_items (333k rows)
-- plus a canon_category() call per row — blew past PostgREST's 8s statement
-- timeout. Replace with a cache-reader. A separate refresh_normalization_stats()
-- procedure repopulates the cache; that can run as a cron job or after scrapes.

CREATE OR REPLACE FUNCTION normalization_stats()
RETURNS TABLE(
  total_items       bigint,
  weight_normalized bigint,
  name_normalized   bigint,
  category_inferred bigint,
  brand_aliases     bigint
) AS $$
  SELECT total_items, weight_normalized, name_normalized, category_inferred, brand_aliases
  FROM   normalization_stats_cache
  WHERE  id = 1;
$$ LANGUAGE SQL STABLE;

-- Procedure to repopulate the cache. Runs slowly (the 4× scan) but now it runs
-- only when we ask, not on every dashboard load. Safe to call from a cron job.
CREATE OR REPLACE FUNCTION refresh_normalization_stats()
RETURNS void AS $$
  UPDATE normalization_stats_cache SET
    total_items       = (SELECT COUNT(*) FROM menu_items),
    weight_normalized = (SELECT COUNT(*) FROM menu_items WHERE normalized_weight_g IS NOT NULL),
    name_normalized   = (SELECT COUNT(*) FROM menu_items WHERE normalized_name IS NOT NULL),
    category_inferred = (SELECT COUNT(*) FROM menu_items WHERE raw_category IS NOT NULL),
    brand_aliases     = (SELECT COUNT(*) FROM brand_aliases),
    refreshed_at      = now()
  WHERE id = 1;
$$ LANGUAGE SQL;

-- Fix 2: Dashboard was doing ilike(raw_brand) + .in(validMenuIds of 400 UUIDs)
-- per own-brand — 14KB+ URLs that blew past PostgREST's URL-length limit on
-- cold caches. Single RPC returns the same count in one indexed scan.

-- Lowercase index lets us use equality instead of ILIKE (dashboard passes
-- the exact brand name, so no wildcards are needed).
CREATE INDEX IF NOT EXISTS menu_items_raw_brand_lower_idx
  ON menu_items (lower(raw_brand));

CREATE OR REPLACE FUNCTION get_brand_store_count(brand_name text)
RETURNS integer AS $$
  SELECT COUNT(DISTINCT dm.intel_store_id)::integer
  FROM   menu_items mi
  JOIN   dispensary_menus dm ON mi.dispensary_menu_id = dm.id
  WHERE  lower(mi.raw_brand) = lower(brand_name)
    AND  mi.is_on_menu = true
    AND  dm.intel_store_id IS NOT NULL;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Bypass RLS for the aggregate RPCs — they only return counts, not rows,
-- so there's no data-leak risk, and RLS eval on 333k rows kills performance.
ALTER FUNCTION normalization_stats() SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_brand_store_count(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION normalization_stats()        TO anon, authenticated;
