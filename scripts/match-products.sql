-- ─────────────────────────────────────────────────────────────────────────────
-- Product Matching Engine
-- ─────────────────────────────────────────────────────────────────────────────
-- Matches user products (products table) against scraped menu_items using
-- multiple heuristics: exact brand+name, brand+fuzzy name, brand+category+weight,
-- token overlap.
--
-- Writes into product_matches table. user_product_id column now stores products.id
-- (FK was dropped to allow this).
--
-- Usage (RPC):  SELECT match_products('<org_uuid>');

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Weight-parse helper: extract grams from free text ───────────────────────
CREATE OR REPLACE FUNCTION parse_weight_g(txt text) RETURNS numeric AS $$
DECLARE
  t text := lower(coalesce(txt,''));
  n numeric;
BEGIN
  IF t = '' THEN RETURN NULL; END IF;
  -- explicit g / gram
  SELECT (regexp_match(t, '(\d+(?:\.\d+)?)\s*(?:g|gram|grams)\b'))[1]::numeric INTO n;
  IF n IS NOT NULL THEN RETURN n; END IF;
  -- explicit oz / ounce
  SELECT (regexp_match(t, '(\d+(?:\.\d+)?)\s*(?:oz|ounce|ounces)\b'))[1]::numeric INTO n;
  IF n IS NOT NULL THEN RETURN n * 28; END IF;
  -- common slang
  IF t ~ 'eighth'  THEN RETURN 3.5;  END IF;
  IF t ~ 'quarter' THEN RETURN 7;    END IF;
  IF t ~ 'half'    THEN RETURN 14;   END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ── Category canonicalizer ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION canon_category(txt text) RETURNS text AS $$
DECLARE t text := lower(coalesce(txt,''));
BEGIN
  IF t ~ '(pre[\s-]?roll|preroll|joint|blunt)' THEN RETURN 'pre_roll'; END IF;
  IF t ~ '(cannagar)'                          THEN RETURN 'cannagar'; END IF;
  IF t ~ '(vape|cartridge|cart|disposable)'    THEN RETURN 'vape';     END IF;
  IF t ~ '(concentrate|rosin|resin|wax|shatter|badder|diamond|sauce|hash)'
                                               THEN RETURN 'concentrate'; END IF;
  IF t ~ '(edible|gumm|chocolate|brownie|cookie|candy|caramel)'
                                               THEN RETURN 'edible';   END IF;
  IF t ~ '(beverage|drink|soda|tea|seltzer|shot)'
                                               THEN RETURN 'beverage'; END IF;
  IF t ~ '(tincture)'                          THEN RETURN 'tincture'; END IF;
  IF t ~ '(topical|balm|salve|lotion)'         THEN RETURN 'topical';  END IF;
  IF t ~ '(capsule|pill|tablet)'               THEN RETURN 'capsule';  END IF;
  IF t ~ '(flower|bud|nug|shake)'              THEN RETURN 'flower';   END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ── Brand aliases table (Feature 2 seed) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS brand_aliases (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL,
  alias          text NOT NULL,
  org_id         uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(canonical_name, alias)
);
CREATE INDEX IF NOT EXISTS brand_aliases_alias_idx ON brand_aliases (lower(alias));

-- ── The matching engine ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION match_products(p_org_id uuid)
RETURNS TABLE(matched_count int, total_products int, auto_verified int) AS $$
DECLARE
  v_inserted int := 0;
  v_auto     int := 0;
  v_total    int;
BEGIN
  SELECT COUNT(*) INTO v_total FROM products WHERE org_id = p_org_id;

  -- Sweep 1: exact brand + exact name → 100
  WITH user_products AS (
    SELECT p.id, p.name, p.farm, p.type, p.unit,
           parse_weight_g(p.unit) AS weight_g
    FROM products p WHERE p.org_id = p_org_id
  ),
  own_brands AS (
    SELECT lower(brand_name) AS brand_lc
    FROM user_brands WHERE org_id = p_org_id AND is_own_brand = true
  ),
  cands AS (
    SELECT
      up.id AS product_id,
      mi.id AS menu_item_id,
      dm.intel_store_id,
      CASE
        WHEN lower(mi.raw_brand) IN (SELECT brand_lc FROM own_brands)
         AND lower(mi.raw_name)   = lower(up.name)                         THEN 1.00
        WHEN lower(mi.raw_brand) IN (SELECT brand_lc FROM own_brands)
         AND similarity(lower(mi.raw_name), lower(up.name)) > 0.80         THEN 0.90
        WHEN lower(mi.raw_brand) IN (SELECT brand_lc FROM own_brands)
         AND canon_category(mi.raw_category) = up.type
         AND up.weight_g IS NOT NULL
         AND abs(parse_weight_g(mi.raw_weight) - up.weight_g) < 0.2        THEN 0.85
        WHEN lower(mi.raw_brand) IN (SELECT brand_lc FROM own_brands)
         AND canon_category(mi.raw_category) = up.type                     THEN 0.70
        WHEN lower(mi.raw_brand) IN (SELECT brand_lc FROM own_brands)      THEN 0.60
        ELSE 0
      END AS score,
      CASE
        WHEN lower(mi.raw_brand) IN (SELECT brand_lc FROM own_brands)
         AND lower(mi.raw_name) = lower(up.name)                           THEN 'exact'
        WHEN lower(mi.raw_brand) IN (SELECT brand_lc FROM own_brands)
         AND similarity(lower(mi.raw_name), lower(up.name)) > 0.80         THEN 'fuzzy_name'
        WHEN lower(mi.raw_brand) IN (SELECT brand_lc FROM own_brands)
         AND canon_category(mi.raw_category) = up.type
         AND up.weight_g IS NOT NULL
         AND abs(parse_weight_g(mi.raw_weight) - up.weight_g) < 0.2        THEN 'brand_cat_weight'
        WHEN lower(mi.raw_brand) IN (SELECT brand_lc FROM own_brands)
         AND canon_category(mi.raw_category) = up.type                     THEN 'brand_category'
        ELSE 'brand_only'
      END AS method
    FROM user_products up
    CROSS JOIN menu_items mi
    JOIN dispensary_menus dm ON dm.id = mi.dispensary_menu_id
    WHERE mi.raw_brand IS NOT NULL
      AND mi.is_on_menu = true
      AND dm.intel_store_id IS NOT NULL
      AND lower(mi.raw_brand) IN (SELECT brand_lc FROM own_brands)
  ),
  best AS (
    SELECT DISTINCT ON (product_id, menu_item_id)
      product_id, menu_item_id, intel_store_id, score, method
    FROM cands
    WHERE score > 0
    ORDER BY product_id, menu_item_id, score DESC
  ),
  ins AS (
    INSERT INTO product_matches
      (id, user_product_id, menu_item_id, intel_store_id, confidence, match_method, verified, created_at)
    SELECT gen_random_uuid(), product_id, menu_item_id, intel_store_id, score, method,
           (score >= 0.90), now()
    FROM best
    ON CONFLICT (user_product_id, menu_item_id) DO UPDATE
      SET confidence  = EXCLUDED.confidence,
          match_method = EXCLUDED.match_method,
          verified    = product_matches.verified OR EXCLUDED.verified
    RETURNING verified
  )
  SELECT COUNT(*), COUNT(*) FILTER (WHERE verified) INTO v_inserted, v_auto FROM ins;

  RETURN QUERY SELECT v_inserted, v_total, v_auto;
END;
$$ LANGUAGE plpgsql;

-- ── RLS for product_matches ─────────────────────────────────────────────────
ALTER TABLE product_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_matches_org_read ON product_matches;
CREATE POLICY product_matches_org_read ON product_matches FOR SELECT
  USING (
    user_product_id IN (
      SELECT id FROM products WHERE org_id IN (
        SELECT org_id FROM org_members WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS product_matches_org_write ON product_matches;
CREATE POLICY product_matches_org_write ON product_matches FOR ALL
  USING (
    user_product_id IN (
      SELECT id FROM products WHERE org_id IN (
        SELECT org_id FROM org_members WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    user_product_id IN (
      SELECT id FROM products WHERE org_id IN (
        SELECT org_id FROM org_members WHERE user_id = auth.uid()
      )
    )
  );
