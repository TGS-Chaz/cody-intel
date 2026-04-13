-- ─────────────────────────────────────────────────────────────────────────────
-- Product Catalog Mastering (Normalization)
-- ─────────────────────────────────────────────────────────────────────────────
-- Applies canonical categories, normalized weights, and brand-alias resolution
-- to menu_items. Writes into existing normalized_name, normalized_weight_g,
-- normalized_category_id (via canon_category + lookup in market_categories),
-- and normalization_confidence columns.

-- ── Normalize weights for all menu items missing one ────────────────────────
UPDATE menu_items
SET    normalized_weight_g = parse_weight_g(raw_weight)
WHERE  normalized_weight_g IS NULL
  AND  raw_weight IS NOT NULL;

-- ── Strip brand prefix from name where raw_brand matches ────────────────────
UPDATE menu_items
SET    normalized_name =
         CASE
           WHEN raw_brand IS NOT NULL
            AND lower(raw_name) LIKE lower(raw_brand) || ' %'
           THEN trim(substring(raw_name FROM length(raw_brand) + 2))
           ELSE raw_name
         END
WHERE  normalized_name IS NULL
  AND  raw_name IS NOT NULL;

-- ── Resolve brand aliases → canonical brand name ─────────────────────────────
-- If raw_brand appears in brand_aliases.alias, treat the canonical_name as truth.
UPDATE menu_items mi
SET    raw_brand = ba.canonical_name
FROM   brand_aliases ba
WHERE  lower(mi.raw_brand) = lower(ba.alias)
  AND  mi.raw_brand <> ba.canonical_name;

-- ── Infer brand from product name when raw_brand is empty ────────────────────
-- For each known canonical brand, if raw_name starts with "<brand> ...", set raw_brand.
UPDATE menu_items mi
SET    raw_brand = ub.brand_name
FROM   user_brands ub
WHERE  mi.raw_brand IS NULL
  AND  lower(mi.raw_name) LIKE lower(ub.brand_name) || ' %';

-- ── Normalization stats RPC ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION normalization_stats()
RETURNS TABLE(
  total_items       bigint,
  weight_normalized bigint,
  name_normalized   bigint,
  category_inferred bigint,
  brand_aliases     bigint
) AS $$
  SELECT
    (SELECT COUNT(*) FROM menu_items),
    (SELECT COUNT(*) FROM menu_items WHERE normalized_weight_g IS NOT NULL),
    (SELECT COUNT(*) FROM menu_items WHERE normalized_name IS NOT NULL),
    (SELECT COUNT(*) FROM menu_items WHERE canon_category(raw_category) IS NOT NULL),
    (SELECT COUNT(*) FROM brand_aliases);
$$ LANGUAGE SQL STABLE;

-- ── Add/refresh default brand aliases for TGS's brands ──────────────────────
INSERT INTO brand_aliases (canonical_name, alias) VALUES
  ('Desert Valley Growers', 'DVG'),
  ('Desert Valley Growers', 'Desert Valley'),
  ('Painted Rooster Cannabis Co', 'Painted Rooster'),
  ('Painted Rooster Cannabis Co', 'PRCC'),
  ('Painted Rooster Cannabis Co', 'painted rooster cannabis'),
  ('Kush Mountain Cannabis', 'Kush Mountain'),
  ('Kush Mountain Cannabis', 'Kush Mountain Gardens'),
  ('Kush Mountain Cannabis', 'KM')
ON CONFLICT (canonical_name, alias) DO NOTHING;

-- ── Duplicate flagger: same brand + similar name + same store ───────────────
-- Writes needs_review=true on duplicates so the UI can flag them.
WITH dupes AS (
  SELECT mi.id
  FROM   menu_items mi
  JOIN   menu_items m2
         ON  m2.dispensary_menu_id = mi.dispensary_menu_id
         AND m2.id <> mi.id
         AND lower(m2.raw_brand)   = lower(mi.raw_brand)
         AND lower(m2.normalized_name) = lower(mi.normalized_name)
         AND COALESCE(m2.normalized_weight_g, 0) = COALESCE(mi.normalized_weight_g, 0)
  WHERE  mi.raw_brand IS NOT NULL
    AND  mi.normalized_name IS NOT NULL
)
UPDATE menu_items SET needs_review = true WHERE id IN (SELECT id FROM dupes);
