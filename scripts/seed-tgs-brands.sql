-- ─────────────────────────────────────────────────────────────────────────────
-- Seed TGS's full brand portfolio: 12 own-brands across 3 farms, with every
-- known alias. Normalizes existing user_brands rows to their canonical name so
-- the brand_aliases.canonical_name → user_brands.brand_name join resolves.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Normalize existing rows to canonical names
UPDATE user_brands SET brand_name = 'Desert Valley Growers'
  WHERE org_id = 'c00044d9-3fb6-429a-b212-5ad0e2048205' AND brand_name = 'Desert Valley';
UPDATE user_brands SET brand_name = 'Kush Mountain Cannabis'
  WHERE org_id = 'c00044d9-3fb6-429a-b212-5ad0e2048205' AND brand_name = 'Kush Mountain';

-- 2) Insert every own-brand. ON CONFLICT DO NOTHING to keep the migration
--    idempotent — re-running won't throw if rows already exist.
INSERT INTO user_brands (org_id, brand_name, is_own_brand)
VALUES
  ('c00044d9-3fb6-429a-b212-5ad0e2048205', 'Desert Valley Growers',       true),
  ('c00044d9-3fb6-429a-b212-5ad0e2048205', 'Sweet Tooth',                 true),  -- under DVG
  ('c00044d9-3fb6-429a-b212-5ad0e2048205', 'Painted Rooster Cannabis Co', true),
  ('c00044d9-3fb6-429a-b212-5ad0e2048205', 'La Mota',                     true),
  ('c00044d9-3fb6-429a-b212-5ad0e2048205', 'Sungaze',                     true),
  ('c00044d9-3fb6-429a-b212-5ad0e2048205', 'Primo',                       true),
  ('c00044d9-3fb6-429a-b212-5ad0e2048205', 'GStik',                       true),
  ('c00044d9-3fb6-429a-b212-5ad0e2048205', 'GNub',                        true),
  ('c00044d9-3fb6-429a-b212-5ad0e2048205', 'Gemini',                      true),
  ('c00044d9-3fb6-429a-b212-5ad0e2048205', 'Rozwrap',                     true),
  ('c00044d9-3fb6-429a-b212-5ad0e2048205', 'Solution Extracts',           true),
  ('c00044d9-3fb6-429a-b212-5ad0e2048205', 'STOG',                        true),
  ('c00044d9-3fb6-429a-b212-5ad0e2048205', 'Kush Mountain Cannabis',      true)
ON CONFLICT DO NOTHING;

-- 3) Aliases. Each alias resolves to a canonical name that exists in
--    user_brands — the get_own_brand_stores / match_products joins depend
--    on this consistency.
INSERT INTO brand_aliases (canonical_name, alias) VALUES
  ('Desert Valley Growers',       'DVG'),
  ('Desert Valley Growers',       'Desert Valley'),
  ('Desert Valley Growers',       'Desert Valley Growers'),

  ('Painted Rooster Cannabis Co', 'PRCC'),
  ('Painted Rooster Cannabis Co', 'Painted Rooster'),
  ('Painted Rooster Cannabis Co', 'Painted Rooster Cannabis'),

  ('Sungaze',                     'SuperNova'),
  ('Sungaze',                     'Supernova'),
  ('Sungaze',                     'Super Nova'),
  ('Sungaze',                     'Sungaze Supernova'),
  ('Sungaze',                     'Sungaze SuperNova'),
  ('Sungaze',                     'Sungaze Zero'),

  ('Kush Mountain Cannabis',      'Kush Mountain'),
  ('Kush Mountain Cannabis',      'KM'),
  ('Kush Mountain Cannabis',      'Kush Mountain Gardens'),

  ('La Mota',                     'La Mota Primo'),
  ('La Mota',                     'LaMota'),

  ('Sweet Tooth',                 'SweetTooth')
ON CONFLICT DO NOTHING;
