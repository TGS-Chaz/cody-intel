-- DO NOT APPLY
-- DRAFT — Phase 1i LCB reconciliation cleanup. Review before applying.
-- Source: audit/36-lcb-reconciliation.md + audit/logs/phase-1i-reconciliation.json
-- Against LCB CSV: data/lcb-licensees-20260419.csv (as-of 2026-04-07 LCB snapshot).
-- Run IDs referenced: Phase 1h = 9d85b941-05e6-4c97-b677-3c5b608f1c7b.
--
-- This migration preserves every row. No DELETEs. Only status/notes/lcb_license_id
-- updates + new INSERTs for missing SE retailers. Merging menu_items from the
-- 69 rows that carry product data (46 phantoms + 23 duplicates with total_products > 0)
-- is NOT in this file — handle that in a separate merge migration after Chaz
-- confirms the canonical-source mapping in Category B.

BEGIN;

-- Phase 1i requires two new `status` enum values beyond the current ('active','inactive','closed').
-- Keep status as TEXT for now (existing schema uses plain TEXT without enum constraint)
-- but we're introducing these conventional values:
--   phantom              — in intel_stores but not on LCB active or closed rolls
--   phantom_closed       — matched an LCB CLOSED / EXPIRED / FORMER entry
--   duplicate_of:<uuid>  — alias of another intel_stores row; menu_items to be merged
--   tribal               — sovereign tribal retailer, LCB-exempt (not phantom)
--   lcb_review_needed    — can't confidently classify; Chaz must triage

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Category A phantoms — LCB match against CLOSED/EXPIRED entries (28 stores).
--    These correspond to permanently-closed licensees. Keep the row and its
--    menu_items for historical reporting; just flip status so they stop showing
--    up in active scraping workflows. Record the closed license number for audit.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE intel_stores SET status = 'phantom_closed',
       notes = coalesce(notes,'') || E'\nPhase 1i: matches closed LCB license <lic>; removed from active scraping set.'
 WHERE id IN (
   -- top-prodcount first (visible in audit/36 Category A.2)
   (SELECT id FROM intel_stores WHERE name = 'LIDZ CANNABIS - NORTH SPOKANE'),           -- closed lic 414664
   (SELECT id FROM intel_stores WHERE name = 'Purple Haze - Everett'),                   -- closed lic 414680
   (SELECT id FROM intel_stores WHERE name = 'OZ. RECREATIONAL CANNABIS'),               -- closed lic 415348
   (SELECT id FROM intel_stores WHERE name = 'TACOMA HOUSE OF CANNABIS'),                -- closed lic 421506
   (SELECT id FROM intel_stores WHERE name = 'Green Leaf Dispensary - Bellingham'),      -- closed lic 413886
   (SELECT id FROM intel_stores WHERE name = 'CANNABIS PROVISIONS EAST - WENATCHEE'),    -- expired lic 423542
   (SELECT id FROM intel_stores WHERE name = 'The Herbery - Boulevard'),                 -- closed lic 084045
   (SELECT id FROM intel_stores WHERE name = 'LUCID - OLYMPIA'),                         -- closed lic 415429
   (SELECT id FROM intel_stores WHERE name = 'DANK''S WONDER EMPORIUM (OLYMPIA)'),       -- closed lic 430691
   (SELECT id FROM intel_stores WHERE name = 'Forbidden Cannabis Club - Carson'),        -- expired lic 422785
   (SELECT id FROM intel_stores WHERE name = 'MARY JANE' AND city = 'Kirkland'),         -- closed lic 415652
   (SELECT id FROM intel_stores WHERE name = 'BLOWIN SMOKE'),                            -- closed lic 422202
   (SELECT id FROM intel_stores WHERE name = 'CANNABIS CITY' AND city = 'Seattle'),      -- closed lic 412751
   (SELECT id FROM intel_stores WHERE name = 'COOKIES TACOMA'),                          -- closed lic 412940
   (SELECT id FROM intel_stores WHERE name = 'DOUGLAS COUNTY 502'),                      -- closed lic 412865
   (SELECT id FROM intel_stores WHERE name = 'FORBIDDEN CANNABIS CLUB - CARLTON'),       -- expired lic 435277
   (SELECT id FROM intel_stores WHERE name = 'GANJA GODDESS'),                           -- closed lic 413558
   (SELECT id FROM intel_stores WHERE name = 'GRASS AND GLASS' AND city = 'Seattle'),    -- closed lic 414785
   (SELECT id FROM intel_stores WHERE name = 'HERBAN LEGENDS'),                          -- closed lic 420291
   (SELECT id FROM intel_stores WHERE name = 'LAST STOP POT SHOP'),                      -- closed lic 415509
   (SELECT id FROM intel_stores WHERE name = 'MR. OG'),                                  -- closed lic 417949
   (SELECT id FROM intel_stores WHERE name = 'ROYAL''S CANNABIS'),                       -- closed lic 415132
   (SELECT id FROM intel_stores WHERE name = 'THE BAKEREE (AURORA)'),                    -- closed lic 414456
   (SELECT id FROM intel_stores WHERE name = 'THE GRASS STATION (RITZVILLE)'),           -- closed lic 422658
   (SELECT id FROM intel_stores WHERE name = 'THE KUSHERY - CLEARVIEW'),                 -- closed lic 415517
   (SELECT id FROM intel_stores WHERE name = 'THE KUSHERY (CLEARVIEW)'),                 -- closed lic 415517 (duplicate alias, 2nd row)
   (SELECT id FROM intel_stores WHERE name = 'THE M STORE'),                             -- closed lic 415303
   (SELECT id FROM intel_stores WHERE name = 'THE ROACH 420')                            -- closed lic 414216
 );
-- Expected: 28 rows affected.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Category A phantoms — tribal cannabis retailers (LCB-exempt, sovereign).
--    5 rows caught by name pattern + 2 NÍKXNA rows (accent handling in the
--    matcher missed these — adding by ID here). Mark as 'tribal' so analytics
--    can treat them separately from LCB-licensed retailers.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE intel_stores SET status = 'tribal',
       notes = coalesce(notes,'') || E'\nPhase 1i: tribal cannabis retailer (sovereign; no LCB license required).'
 WHERE id IN (
   (SELECT id FROM intel_stores WHERE name = 'ELWHA PEAKS CANNABIS'),
   (SELECT id FROM intel_stores WHERE name = 'Q''ANAPSU'),
   (SELECT id FROM intel_stores WHERE name = 'Remedy Tulalip'),
   (SELECT id FROM intel_stores WHERE name = 'REMEDY TULALIP'),
   (SELECT id FROM intel_stores WHERE name = 'THE TRIBAL JOINT'),
   (SELECT id FROM intel_stores WHERE name = 'NÍKXNA (COULEE DAM, WA)'),
   (SELECT id FROM intel_stores WHERE name = 'NÍKXNA (NESPELEM)')
 );
-- Expected: 7 rows affected.

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Category A phantoms — no LCB signal (42 rows, minus 2 tribal moved above = 40).
--    These could be: chain location splits (e.g., "Agate Dreams - Bond" vs "Agate Dreams - Poulsbo"),
--    newly-opened stores pending LCB license, data-entry duplicates, or stores
--    scraped from aggregator ghost records. Mark lcb_review_needed for manual triage
--    before any action. Do NOT change designation or delete menu_items.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE intel_stores SET status = 'lcb_review_needed',
       notes = coalesce(notes,'') || E'\nPhase 1i: no LCB license match (neither active nor closed). Chaz must triage: chain split / new filing / data error / aggregator ghost.'
 WHERE id IN (
   -- Full list of 40 Category A.3 rows (ordered by product count desc):
   (SELECT id FROM intel_stores WHERE name = 'Super Chronic Club - Olympia' AND city = 'Lacey'),
   (SELECT id FROM intel_stores WHERE name = 'Greenfoot Cannabis' AND city = 'Olympia'),
   (SELECT id FROM intel_stores WHERE name = 'The Link Cannabis Company - Port Angeles'),
   (SELECT id FROM intel_stores WHERE name = 'Joint Rivers' AND city = 'Auburn'),
   (SELECT id FROM intel_stores WHERE name = 'NW Cannabis' AND city = 'Mount Vernon'),
   (SELECT id FROM intel_stores WHERE name = 'CEDAR GREENS' AND city = 'Sequim'),
   (SELECT id FROM intel_stores WHERE name = 'High Point Cannabis' AND city = 'Kingston'),
   (SELECT id FROM intel_stores WHERE name = 'Higher Leaf Factoria'),
   (SELECT id FROM intel_stores WHERE name = 'THUNDER II' AND city = 'Rochester'),
   (SELECT id FROM intel_stores WHERE name = 'THUNDER CANNABIS' AND city = 'Olympia'),
   (SELECT id FROM intel_stores WHERE name = 'SALISH COAST CANNABIS' AND city = 'Anacortes'),
   (SELECT id FROM intel_stores WHERE name = '20 After 4 - REC' AND city = 'Woodland'),
   (SELECT id FROM intel_stores WHERE name = 'Higher Leaf BelRed'),
   (SELECT id FROM intel_stores WHERE name = 'HAVE A HEART - OCEAN SHORES'),
   (SELECT id FROM intel_stores WHERE name = 'HI-TOP CANNABIS' AND city = 'Seattle'),
   (SELECT id FROM intel_stores WHERE name = 'Fireweed Cannabis Co.' AND city = 'Snoqualmie'),
   (SELECT id FROM intel_stores WHERE name = 'Commencement Bay Cannabis - Black'),
   (SELECT id FROM intel_stores WHERE name = 'A Greener Today - Burien'),
   (SELECT id FROM intel_stores WHERE name = 'Commencement Bay Cannabis - Red'),
   (SELECT id FROM intel_stores WHERE name = 'Commencement Bay Cannabis - Yellow'),
   (SELECT id FROM intel_stores WHERE name = 'Commencement Bay Cannabis - Green'),
   (SELECT id FROM intel_stores WHERE name = 'High 5 Cannabis - Vancouver'),
   (SELECT id FROM intel_stores WHERE name = '210 Cannabis Co' AND city = 'Arlington'),
   (SELECT id FROM intel_stores WHERE name = 'Anacortes Dispensary - Northwind Cannabis'),
   (SELECT id FROM intel_stores WHERE name = 'Agate Dreams - Bond'),
   (SELECT id FROM intel_stores WHERE name = 'Agate Dreams - Poulsbo'),
   (SELECT id FROM intel_stores WHERE name = 'CBC YELLOW' AND city = 'Fife'),
   (SELECT id FROM intel_stores WHERE name = 'BETWEEN THE FERNS CANNABIS CO.'),
   (SELECT id FROM intel_stores WHERE name = 'KushKlub - Tukwila'),
   (SELECT id FROM intel_stores WHERE name = 'KINGS CANNABIS DISPENSARY' AND city = 'Seattle'),
   (SELECT id FROM intel_stores WHERE name = 'GREENSIDE REC (AURORA)'),
   (SELECT id FROM intel_stores WHERE name = 'AGATE DREAMS' AND city = 'Poulsbo'),
   (SELECT id FROM intel_stores WHERE name = '420 NY' AND city = 'Seattle'),
   (SELECT id FROM intel_stores WHERE name = 'CBC BLACK' AND city = 'Tacoma'),
   (SELECT id FROM intel_stores WHERE name = 'CBC GREEN' AND city = 'Tacoma'),
   (SELECT id FROM intel_stores WHERE name = 'CBC RED' AND city = 'Tacoma'),
   (SELECT id FROM intel_stores WHERE name = 'ELEVATION - KAMILCHE'),
   (SELECT id FROM intel_stores WHERE name = 'ELEVATION - TUMWATER'),
   (SELECT id FROM intel_stores WHERE name = 'GREEN STOP CANNABIS'),
   (SELECT id FROM intel_stores WHERE name = 'HIDDEN BUSH PA')
 );
-- Expected: 40 rows affected.

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Category B duplicates — mark as duplicate_of:<canonical_uuid>.
--    Canonical = the intel_stores row that carries the original LCB-imported
--    lcb_license_id. Menu merge (which data survives on the canonical row)
--    happens in a separate migration — 23 of these 26 carry product data.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE intel_stores SET status = 'duplicate_of:e6a8be13..c27ea286',
       notes = coalesce(notes,'') || E'\nPhase 1i: duplicate alias of canonical row c27ea286 (LCB 426678). Menu merge pending.'
 WHERE id = 'e6a8be13-...'; -- 420 - Elma → 420 ELMA ON MAIN
-- (Full set written programmatically below for brevity — 26 statements in the applied version.)

-- Template: each Category B row gets one UPDATE of the shape above.
-- The applied version expands this into 26 individual statements with the
-- correct {phantom_uuid, canonical_uuid, lcb_license_number} triple per row,
-- drawn from audit/logs/phase-1i-reconciliation.json.

-- Pseudocode the apply prompt should expand:
-- FOR each catB row {
--   UPDATE intel_stores
--      SET status = 'duplicate_of:' || <canonical_id>,
--          notes  = coalesce(notes,'') || E'\nPhase 1i: duplicate alias of canonical <canonical_name> (<canonical_id>), LCB <lcb_license_number>. Menu merge pending.'
--    WHERE id = <phantom_id>;
-- }
-- Expected: 26 rows affected.

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Category C — none. There are zero intel_stores rows with a non-null
--    lcb_license_id that do not appear on the current LCB active list.
--    The original import and the 2026-04-07 LCB snapshot are in full sync.
-- ─────────────────────────────────────────────────────────────────────────────
-- (Nothing to do.)

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Category D backfills — null lcb_license_id but matches an ACTIVE LCB
--    entry. These should get their lcb_license_id populated so they're treated
--    as legit going forward. The applied version joins against lcb_licenses
--    by license_number to recover the UUID.
-- ─────────────────────────────────────────────────────────────────────────────
-- Pacific Outpost (Pasco) → LCB license 434994 (THE PACIFIC OUTPOST)
-- HAPPY TREES PROSSER (Prosser) → LCB license 436321 (HAPPY TREE)

UPDATE intel_stores
   SET lcb_license_id = (SELECT id FROM lcb_licenses WHERE license_number = '434994' LIMIT 1),
       trade_name     = coalesce(trade_name, 'THE PACIFIC OUTPOST'),
       address        = coalesce(nullif(trim(address),''), '3221 W COURT S'),
       notes          = coalesce(notes,'') || E'\nPhase 1i: backfilled lcb_license_id from LCB 434994 match.'
 WHERE id = '8a581006-6130-46f9-8912-1342c5dfeb79';

UPDATE intel_stores
   SET lcb_license_id = (SELECT id FROM lcb_licenses WHERE license_number = '436321' LIMIT 1),
       trade_name     = coalesce(trade_name, 'HAPPY TREE'),
       address        = coalesce(nullif(trim(address),''), '354 CHARDONNAY AVE STE 3'),
       notes          = coalesce(notes,'') || E'\nPhase 1i: backfilled lcb_license_id from LCB 436321 match.'
 WHERE id = 'cde73f34-...';  -- HAPPY TREES PROSSER (replace with full UUID from json)

-- NOTE: `lcb_licenses` is empty under anon-key visibility in the REST API but
-- exists under service_role. The apply prompt should either (a) run this from
-- service_role context or (b) first re-populate lcb_licenses from the current
-- CSV and then run the backfill.
--
-- Expected: 2 rows affected.

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Missing legitimate LCB stores — INSERT 4 new rows.
--    All 4 are Social Equity retailers that the original lcb_licenses import
--    missed. The main "Retailers" sheet had 458 ACTIVE, which matched our
--    original import of 458; the 5 SE ACTIVE retailers live in a separate sheet
--    that was not included. (1 of 5 SE retailers, MAIN STREET MARIJUANA ORCHARDS,
--    is already represented by the existing MAIN STREET MARIJUANA NORTH row —
--    Orchards and North may be separate licenses but share a parent.)
-- ─────────────────────────────────────────────────────────────────────────────
-- Before applying: insert each LCB row into lcb_licenses FIRST so the FK is valid.
-- Then insert into intel_stores pointing at those new lcb_licenses.id UUIDs.
-- Skeleton for the apply prompt:
--
-- WITH new_lcb AS (
--   INSERT INTO lcb_licenses (license_number, business_name, trade_name, address,
--                             city, zip, county, phone, privilege_status)
--   VALUES
--     ('414931', null, 'GOLIATH PINES',                  '8002B NE HIGHWAY 99',    'VANCOUVER', null, 'CLARK',   null, 'ACTIVE (ISSUED)'),
--     ('435675', null, 'LUCKY LEAF CO',                  '528 W CLARK ST',          'PASCO',     null, 'FRANKLIN',null, 'ACTIVE (ISSUED)'),
--     ('414350', null, 'MAIN STREET MARIJUANA ORCHARDS', '12300 NE FOURTH PLAIN BLVD','VANCOUVER',null,'CLARK',   null, 'ACTIVE (ISSUED)'),
--     ('438213', null, 'MHC LLC',                        '16271 N HIGHWAY 21',      'REPUBLIC',  null, 'FERRY',   null, 'ACTIVE (ISSUED)')
--   RETURNING id, trade_name, address, city, county, phone
-- )
-- INSERT INTO intel_stores (lcb_license_id, name, trade_name, address, city, county, phone)
-- SELECT id, trade_name, trade_name, address, city, county, phone FROM new_lcb;
--
-- Expected: 4 rows added to lcb_licenses + 4 rows added to intel_stores.

-- ─────────────────────────────────────────────────────────────────────────────
-- Validation queries — run AFTER apply to confirm clean state.
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT status, COUNT(*) FROM intel_stores GROUP BY status ORDER BY status;
-- Expected distribution after apply:
--   active              | 457  (unchanged legit) + 2 (Cat D backfilled) + 4 (missing SE added) = 463
--   phantom_closed      | 28
--   tribal              | 7
--   lcb_review_needed   | 40
--   duplicate_of:*      | 26
--   (other existing)    | remainder (inactive/closed if any)
--   TOTAL               | 564 (560 original + 4 new SE)

ROLLBACK;   -- still a draft; keep DO NOT APPLY at the top until Chaz reviews
