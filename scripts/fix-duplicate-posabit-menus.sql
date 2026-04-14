-- ─────────────────────────────────────────────────────────────────────────────
-- Fix duplicate POSaBit menus across chain stores.
-- ─────────────────────────────────────────────────────────────────────────────
-- Two distinct problems:
--   1. Pacific Outpost: data-entry duplicate. Two intel_stores rows for the
--      same Pasco location. Delete the newer one + its menu.
--   2. Bake Shop: real chain with 3 locations (Prosser, George, Union Gap)
--      all stamped with Prosser's venue/feed credentials, so every location
--      scraped shows Prosser's menu. Keep Prosser intact; wipe the bad
--      credentials and orphaned menus on George + Union Gap so they can be
--      re-credentialed from each store's own website config.
--
-- Finally installs a UNIQUE constraint preventing two stores from ever
-- sharing the same (merchant, venue, feed_key) triple — protects every
-- future chain from this bug class.

BEGIN;

-- ── 1. Pacific Outpost: delete the duplicate row + its menu ──────────────────
-- Keep 8a581006-... (the original, seeded with correct mixed-case name).
-- Remove dff478b4-... ('THE PACIFIC OUTPOST' uppercase, added later).

DELETE FROM menu_items
WHERE dispensary_menu_id IN (
  SELECT id FROM dispensary_menus WHERE intel_store_id = 'dff478b4-f541-4aa6-8457-e7e1a863497f'
);
DELETE FROM dispensary_menus WHERE intel_store_id = 'dff478b4-f541-4aa6-8457-e7e1a863497f';
DELETE FROM product_matches   WHERE intel_store_id = 'dff478b4-f541-4aa6-8457-e7e1a863497f';
DELETE FROM menu_snapshots    WHERE intel_store_id = 'dff478b4-f541-4aa6-8457-e7e1a863497f';
DELETE FROM intel_stores      WHERE id             = 'dff478b4-f541-4aa6-8457-e7e1a863497f';

-- ── 2. Bake Shop: wipe contaminated menus + credentials on George + Union Gap
--     (Prosser — 73db1eaf — keeps its menu; its creds are correct for Prosser.)

WITH bad AS (
  SELECT id FROM intel_stores
  WHERE posabit_merchant = 'the-bake-shop'
    AND city IN ('GEORGE', 'UNION GAP')
)
DELETE FROM menu_items
WHERE dispensary_menu_id IN (
  SELECT dm.id FROM dispensary_menus dm JOIN bad ON dm.intel_store_id = bad.id
);

DELETE FROM dispensary_menus
WHERE intel_store_id IN (
  SELECT id FROM intel_stores
  WHERE posabit_merchant = 'the-bake-shop' AND city IN ('GEORGE', 'UNION GAP')
);

DELETE FROM product_matches
WHERE intel_store_id IN (
  SELECT id FROM intel_stores
  WHERE posabit_merchant = 'the-bake-shop' AND city IN ('GEORGE', 'UNION GAP')
);

-- Null out the bad credentials so the batch scraper doesn't re-pull
-- Prosser's menu for them. Keep the row itself + posabit_merchant so the
-- discovery pass knows where to look when it re-credentials.
UPDATE intel_stores
SET    posabit_venue          = NULL,
       posabit_feed_key        = NULL,
       posabit_merchant_token  = NULL,
       total_products          = 0,
       menu_last_updated       = NULL
WHERE  posabit_merchant = 'the-bake-shop'
  AND  city IN ('GEORGE', 'UNION GAP');

-- ── 3. DB guard: prevent the whole class of bug going forward ────────────────
-- No two active stores can carry the same (merchant, venue, feed_key) triple.
-- NULLs are fine (stores without creds yet); the constraint only binds rows
-- that have all three columns set.
CREATE UNIQUE INDEX IF NOT EXISTS intel_stores_posabit_unique_creds
  ON intel_stores (posabit_merchant, posabit_venue, posabit_feed_key)
  WHERE posabit_merchant IS NOT NULL
    AND posabit_venue   IS NOT NULL
    AND posabit_feed_key IS NOT NULL;

COMMIT;

-- Verify: all three chains now have one unique row per (merchant, venue) and
-- George / Union Gap are cleared for re-credentialing.
SELECT name, city, posabit_merchant, posabit_venue, posabit_feed_key, total_products
FROM   intel_stores
WHERE  posabit_merchant IN ('the-bake-shop', 'the-pacific-outpost')
ORDER  BY posabit_merchant, city;
