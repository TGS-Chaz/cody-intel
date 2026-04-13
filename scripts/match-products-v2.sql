-- ─────────────────────────────────────────────────────────────────────────────
-- Product Matching Engine v2 — brand-first, strain-based
-- ─────────────────────────────────────────────────────────────────────────────
-- Fixes three bugs in v1:
--   1. Matched against products.name (descriptions like "Living Soil Indoor
--      Flower") instead of actual strain names. Now uses products.strain,
--      split on ',' or ';', each strain matched individually.
--   2. Cross-brand matches — a Kush Mountain product could match a Desert
--      Valley menu_item if the own_brand set contained both. The brand join
--      is now per-product: menu_item's canonical brand must equal the
--      specific product's farm field.
--   3. Store association was wrong because menu_items for ANY own-brand
--      were attached to EVERY own-brand product via the CROSS JOIN. That's
--      now eliminated by the JOIN ON brand condition above.
--
-- Scoring tiers (per strain, within correct brand):
--   0.95  strain_exact        — menu_item name contains strain with high trgm similarity
--   0.90  strain_partial      — menu_item name contains strain substring
--   0.80  cat_weight          — no strain hit, but category + weight match
--   0.70  brand_category      — no strain, only category match
--   0.50  brand_only          — same brand, no other match (kept as weakest signal)

CREATE OR REPLACE FUNCTION match_products(p_org_id uuid)
RETURNS TABLE(matched_count int, total_products int, auto_verified int) AS $$
DECLARE
  v_inserted int := 0;
  v_auto     int := 0;
  v_total    int;
BEGIN
  SELECT COUNT(*) INTO v_total FROM products WHERE org_id = p_org_id;

  WITH
  -- Every own-brand + any alias, mapped to its canonical name for lookups.
  brand_canon AS (
    SELECT lower(ub.brand_name) AS alias_lc, ub.brand_name AS canonical
    FROM   user_brands ub
    WHERE  ub.org_id = p_org_id AND ub.is_own_brand = true

    UNION

    SELECT lower(ba.alias), ba.canonical_name
    FROM   brand_aliases ba
    JOIN   user_brands ub ON lower(ub.brand_name) = lower(ba.canonical_name)
    WHERE  ub.org_id = p_org_id AND ub.is_own_brand = true
  ),

  -- Products, with strain list exploded into one row per strain. The strain
  -- column uses comma OR semicolon separation — normalize to semicolon first.
  -- Products with no strain data get one row with strain_one = NULL so they
  -- can still participate in brand+category matching (lowest tier).
  user_products_exploded AS (
    SELECT
      p.id                                       AS product_id,
      p.name                                     AS prod_name,
      p.farm                                     AS prod_brand,
      p.type                                     AS prod_type,
      p.unit                                     AS prod_unit,
      parse_weight_g(p.unit)                     AS weight_g,
      NULLIF(trim(strain_one), '')               AS strain_one
    FROM products p
    LEFT JOIN LATERAL (
      SELECT unnest(
        CASE
          WHEN p.strain IS NULL OR p.strain = '' THEN ARRAY[NULL]::text[]
          ELSE string_to_array(regexp_replace(p.strain, '[,;]', ';', 'g'), ';')
        END
      ) AS strain_one
    ) strains ON true
    WHERE p.org_id = p_org_id AND p.farm IS NOT NULL
  ),

  -- Menu items from stores, with brand resolved to canonical form via
  -- brand_aliases. Only items whose raw_brand (lowered) matches some alias
  -- in brand_canon — drastically narrows the candidate set up front.
  mi_in_brand AS (
    SELECT
      mi.id              AS menu_item_id,
      mi.raw_name,
      mi.raw_brand,
      mi.raw_category,
      mi.raw_weight,
      mi.dispensary_menu_id,
      bc.canonical       AS canon_brand
    FROM menu_items mi
    JOIN brand_canon bc ON bc.alias_lc = lower(mi.raw_brand)
    WHERE mi.is_on_menu = true
      AND mi.raw_brand IS NOT NULL
  ),

  -- THE CRITICAL FIX: join on matching brand. A Kush Mountain product can
  -- only be paired with Kush Mountain menu_items. No cross-brand matches.
  cands AS (
    SELECT
      up.product_id,
      mi.menu_item_id,
      dm.intel_store_id,
      CASE
        WHEN up.strain_one IS NOT NULL
         AND lower(mi.raw_name) LIKE '%' || lower(up.strain_one) || '%'
         AND similarity(lower(mi.raw_name), lower(up.strain_one)) > 0.40   THEN 0.95

        WHEN up.strain_one IS NOT NULL
         AND lower(mi.raw_name) LIKE '%' || lower(up.strain_one) || '%'    THEN 0.90

        WHEN canon_category(mi.raw_category) = up.prod_type
         AND up.weight_g IS NOT NULL
         AND abs(parse_weight_g(mi.raw_weight) - up.weight_g) < 0.2        THEN 0.80

        WHEN canon_category(mi.raw_category) = up.prod_type                THEN 0.70

        ELSE 0.50
      END AS score,

      CASE
        WHEN up.strain_one IS NOT NULL
         AND lower(mi.raw_name) LIKE '%' || lower(up.strain_one) || '%'
         AND similarity(lower(mi.raw_name), lower(up.strain_one)) > 0.40   THEN 'strain_exact'

        WHEN up.strain_one IS NOT NULL
         AND lower(mi.raw_name) LIKE '%' || lower(up.strain_one) || '%'    THEN 'strain_partial'

        WHEN canon_category(mi.raw_category) = up.prod_type
         AND up.weight_g IS NOT NULL
         AND abs(parse_weight_g(mi.raw_weight) - up.weight_g) < 0.2        THEN 'cat_weight'

        WHEN canon_category(mi.raw_category) = up.prod_type                THEN 'brand_category'

        ELSE 'brand_only'
      END AS method
    FROM user_products_exploded up
    JOIN mi_in_brand          mi ON lower(mi.canon_brand) = lower(up.prod_brand)
    JOIN dispensary_menus     dm ON dm.id = mi.dispensary_menu_id
    WHERE dm.intel_store_id IS NOT NULL
  ),

  -- Dedupe: pick the highest-scoring (product, menu_item) pairing. A single
  -- menu_item may hit multiple strains under the same product — take the
  -- strongest match.
  best AS (
    SELECT DISTINCT ON (product_id, menu_item_id)
      product_id, menu_item_id, intel_store_id, score, method
    FROM cands
    ORDER BY product_id, menu_item_id, score DESC
  ),

  ins AS (
    INSERT INTO product_matches
      (id, user_product_id, menu_item_id, intel_store_id, confidence, match_method, verified, created_at)
    SELECT gen_random_uuid(), product_id, menu_item_id, intel_store_id, score, method, (score >= 0.90), now()
    FROM best
    ON CONFLICT (user_product_id, menu_item_id) DO UPDATE
      SET confidence   = EXCLUDED.confidence,
          match_method = EXCLUDED.match_method,
          verified     = product_matches.verified OR EXCLUDED.verified
    RETURNING verified
  )
  SELECT COUNT(*), COUNT(*) FILTER (WHERE verified) INTO v_inserted, v_auto FROM ins;

  RETURN QUERY SELECT v_inserted, v_total, v_auto;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION match_products(uuid) TO anon, authenticated;
