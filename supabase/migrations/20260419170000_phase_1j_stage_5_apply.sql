-- Phase 1j Stage 5 — populate mapping + apply Stage 4 designations +
-- populate joint_business_id + carry forward scraper-tracking fields.
--
-- Stage 4 run ID: ec3b40a1-3ae0-48a3-a361-962e0ab82baf
--
-- This migration runs as one Supabase transaction. intel_stores (v1) is
-- SELECT-only; all writes target intel_stores_v2 and stage_5_store_mapping.

-- ── 1. Populate mapping: LCB license join (primary, high) ────────────────
-- intel_stores.lcb_license_id is UUID FK → lcb_licenses.id.
-- intel_stores_v2.lcb_license_id is TEXT holding the license number directly.
-- Bridge via lcb_licenses.
INSERT INTO stage_5_store_mapping (old_intel_store_id, new_intel_store_v2_id, match_method, confidence)
SELECT v1.id, v2.id, 'lcb_license', 'high'
  FROM intel_stores v1
  JOIN lcb_licenses l ON l.id = v1.lcb_license_id
  JOIN intel_stores_v2 v2 ON v2.lcb_license_id = l.license_number::text
 WHERE v1.lcb_license_id IS NOT NULL
   AND v2.lcb_license_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ── 2. Populate mapping: address-match fallback (medium) ─────────────────
-- For v2 rows with no mapping yet. Match on normalized address + city.
-- Only take matches where exactly one v1 candidate exists (disambiguate by name
-- token similarity if name helps; otherwise skip ambiguous).
WITH v2_unmapped AS (
  SELECT v.id AS v2_id, v.name AS v2_name, _p1j_norm_addr(v.address) AS v2_addr, upper(v.city) AS v2_city
    FROM intel_stores_v2 v
   WHERE NOT EXISTS (
           SELECT 1 FROM stage_5_store_mapping m WHERE m.new_intel_store_v2_id = v.id
         )
     AND v.address IS NOT NULL AND v.city IS NOT NULL
),
v1_by_addr AS (
  SELECT i.id AS v1_id, i.name AS v1_name, _p1j_norm_addr(i.address) AS v1_addr, upper(i.city) AS v1_city
    FROM intel_stores i
   WHERE NOT EXISTS (
           SELECT 1 FROM stage_5_store_mapping m WHERE m.old_intel_store_id = i.id
         )
     AND i.address IS NOT NULL AND i.city IS NOT NULL
),
cands AS (
  SELECT u.v2_id, u.v2_name, v.v1_id, v.v1_name, u.v2_addr, u.v2_city
    FROM v2_unmapped u
    JOIN v1_by_addr v
      ON u.v2_city = v.v1_city
     AND (u.v2_addr = v.v1_addr
          OR similarity(u.v2_addr, v.v1_addr) >= 0.75)
),
unique_cands AS (
  SELECT v2_id,
         -- Pick any single v1 candidate — MIN(v1_id::text)::uuid works around the
         -- fact that aggregate min()/max() aren't defined for uuid. We only take
         -- rows with n = 1 so the pick is stable.
         (array_agg(v1_id ORDER BY v1_id::text))[1] AS v1_id,
         COUNT(*) AS n
    FROM cands
   GROUP BY v2_id
)
INSERT INTO stage_5_store_mapping (old_intel_store_id, new_intel_store_v2_id, match_method, confidence, notes)
SELECT u.v1_id, u.v2_id, 'address', 'medium',
       'Address match (exact or trgm≥0.75 in same city); no LCB license bridge available.'
  FROM unique_cands u
 WHERE u.n = 1
ON CONFLICT DO NOTHING;

-- Track ambiguous address matches for the audit.
CREATE TEMP TABLE stage_5_address_ambiguous AS
  SELECT v2_id, v2_name, COUNT(*) AS candidate_count, array_agg(v1_id) AS v1_candidates, array_agg(v1_name) AS v1_names
    FROM (
      SELECT u.v2_id, u.v2_name, v.v1_id, v.v1_name
        FROM (
          SELECT v.id AS v2_id, v.name AS v2_name, _p1j_norm_addr(v.address) AS v2_addr, upper(v.city) AS v2_city
            FROM intel_stores_v2 v
           WHERE NOT EXISTS (SELECT 1 FROM stage_5_store_mapping m WHERE m.new_intel_store_v2_id = v.id)
             AND v.address IS NOT NULL
        ) u
        JOIN (
          SELECT i.id AS v1_id, i.name AS v1_name, _p1j_norm_addr(i.address) AS v1_addr, upper(i.city) AS v1_city
            FROM intel_stores i
           WHERE i.address IS NOT NULL
        ) v
          ON u.v2_city = v.v1_city
         AND (u.v2_addr = v.v1_addr OR similarity(u.v2_addr, v.v1_addr) >= 0.75)
    ) sub
    GROUP BY v2_id, v2_name
   HAVING COUNT(*) > 1;

-- ── 3. Flag unmatched v2 rows (new licenses / tribal / SE) ───────────────
INSERT INTO stage_5_store_mapping (old_intel_store_id, new_intel_store_v2_id, match_method, confidence, notes)
SELECT NULL, v.id, 'unmatched_new_v2', 'flag',
       'New v2 row with no v1 match — likely tribal, social equity, or new license since v1.'
  FROM intel_stores_v2 v
 WHERE NOT EXISTS (SELECT 1 FROM stage_5_store_mapping m WHERE m.new_intel_store_v2_id = v.id);

-- ── 4. Flag retired v1 rows (phantom / closed / duplicate) ───────────────
INSERT INTO stage_5_store_mapping (old_intel_store_id, new_intel_store_v2_id, match_method, confidence, notes)
SELECT i.id, NULL, 'unmatched_retired_v1', 'flag',
       'v1 row with no v2 match — LCB license not on current active list (phantom/closed/duplicate from Phase 1i).'
  FROM intel_stores i
 WHERE NOT EXISTS (SELECT 1 FROM stage_5_store_mapping m WHERE m.old_intel_store_id = i.id);

-- ── 5. Apply Stage 4 designations to intel_stores_v2 ─────────────────────
WITH best AS (
  SELECT DISTINCT ON (intel_store_v2_id)
         intel_store_v2_id,
         primary_platform,
         confidence,
         signals
    FROM platform_verification
   WHERE run_id = 'ec3b40a1-3ae0-48a3-a361-962e0ab82baf'
     AND intel_store_v2_id IS NOT NULL
   ORDER BY intel_store_v2_id,
            CASE pass WHEN 'pass2_browser' THEN 1 ELSE 2 END,
            CASE confidence WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
)
UPDATE intel_stores_v2 v
   SET designated_scraper             = b.primary_platform,
       primary_platform               = b.primary_platform,
       platform_detection_confidence  = b.confidence,
       platform_detected_at           = now()
  FROM best b
 WHERE v.id = b.intel_store_v2_id
   AND b.primary_platform IN ('dutchie','jane','leafly','posabit','joint','weedmaps');

-- ── 6. Populate joint_business_id for v2 joint stores ────────────────────
UPDATE intel_stores_v2 v
   SET joint_business_id = NULLIF(pv.signals->'joint_business_id'->>0, '')
  FROM platform_verification pv
 WHERE pv.intel_store_v2_id = v.id
   AND pv.run_id = 'ec3b40a1-3ae0-48a3-a361-962e0ab82baf'
   AND v.primary_platform = 'joint'
   AND pv.signals->'joint_business_id' IS NOT NULL;

-- ── 7. Carry forward scraper-tracking fields ────────────────────────────
-- Only where:
--   (a) mapping exists with confidence in ('high','medium')
--   (b) v2.primary_platform equals v1.primary_platform
-- We check v1's primary_platform OR v1's designated_scraper as a fallback
-- (legacy rows may have designated_scraper populated but primary_platform NULL).

-- 7a. Dutchie
UPDATE intel_stores_v2 v
   SET dutchie_dispensary_id    = v1.dutchie_dispensary_id,
       dutchie_slug             = v1.dutchie_slug,
       dutchie_last_scraped_at  = v1.dutchie_last_scraped_at,
       dutchie_product_count    = v1.dutchie_product_count,
       dutchie_scrape_error     = v1.dutchie_scrape_error,
       dutchie_scrape_status    = v1.dutchie_scrape_status
  FROM stage_5_store_mapping m
  JOIN intel_stores v1 ON v1.id = m.old_intel_store_id
 WHERE v.id = m.new_intel_store_v2_id
   AND m.confidence IN ('high','medium')
   AND v.primary_platform = 'dutchie'
   AND (v1.primary_platform = 'dutchie' OR v1.designated_scraper = 'dutchie');

-- 7b. Jane
UPDATE intel_stores_v2 v
   SET jane_store_id         = v1.jane_store_id,
       jane_last_scraped_at  = v1.jane_last_scraped_at,
       jane_product_count    = v1.jane_product_count,
       jane_scrape_error     = v1.jane_scrape_error,
       jane_scrape_status    = v1.jane_scrape_status
  FROM stage_5_store_mapping m
  JOIN intel_stores v1 ON v1.id = m.old_intel_store_id
 WHERE v.id = m.new_intel_store_v2_id
   AND m.confidence IN ('high','medium')
   AND v.primary_platform = 'jane'
   AND (v1.primary_platform = 'jane' OR v1.designated_scraper = 'jane');

-- 7c. Leafly
UPDATE intel_stores_v2 v
   SET leafly_dispensary_id    = v1.leafly_dispensary_id,
       leafly_slug             = v1.leafly_slug,
       leafly_last_scraped_at  = v1.leafly_last_scraped_at,
       leafly_product_count    = v1.leafly_product_count,
       leafly_scrape_error     = v1.leafly_scrape_error,
       leafly_scrape_status    = v1.leafly_scrape_status
  FROM stage_5_store_mapping m
  JOIN intel_stores v1 ON v1.id = m.old_intel_store_id
 WHERE v.id = m.new_intel_store_v2_id
   AND m.confidence IN ('high','medium')
   AND v.primary_platform = 'leafly'
   AND (v1.primary_platform = 'leafly' OR v1.designated_scraper = 'leafly');

-- 7d. POSaBit
UPDATE intel_stores_v2 v
   SET posabit_feed_key         = v1.posabit_feed_key,
       posabit_merchant         = v1.posabit_merchant,
       posabit_merchant_token   = v1.posabit_merchant_token,
       posabit_venue            = v1.posabit_venue,
       posabit_last_scraped_at  = v1.posabit_last_scraped_at,
       posabit_product_count    = v1.posabit_product_count,
       posabit_scrape_error     = v1.posabit_scrape_error,
       posabit_scrape_status    = v1.posabit_scrape_status
  FROM stage_5_store_mapping m
  JOIN intel_stores v1 ON v1.id = m.old_intel_store_id
 WHERE v.id = m.new_intel_store_v2_id
   AND m.confidence IN ('high','medium')
   AND v.primary_platform = 'posabit'
   AND (v1.primary_platform = 'posabit' OR v1.designated_scraper = 'posabit');

-- 7e. Joint (joint_business_id already set in step 6; preserve v1 bizId if non-null
-- and v2 bizId was NULL — should be rare since Stage 4 signals fills it).
UPDATE intel_stores_v2 v
   SET joint_business_id      = coalesce(v.joint_business_id, v1.joint_business_id),
       joint_last_scraped_at  = v1.joint_last_scraped_at,
       joint_product_count    = v1.joint_product_count,
       joint_scrape_status    = v1.joint_scrape_status
  FROM stage_5_store_mapping m
  JOIN intel_stores v1 ON v1.id = m.old_intel_store_id
 WHERE v.id = m.new_intel_store_v2_id
   AND m.confidence IN ('high','medium')
   AND v.primary_platform = 'joint'
   AND (v1.primary_platform = 'joint' OR v1.designated_scraper = 'joint');

-- 7f. Weedmaps
UPDATE intel_stores_v2 v
   SET weedmaps_slug            = v1.weedmaps_slug,
       weedmaps_last_scraped_at = v1.weedmaps_last_scraped_at,
       weedmaps_product_count   = v1.weedmaps_product_count,
       weedmaps_scrape_error    = v1.weedmaps_scrape_error,
       weedmaps_scrape_status   = v1.weedmaps_scrape_status
  FROM stage_5_store_mapping m
  JOIN intel_stores v1 ON v1.id = m.old_intel_store_id
 WHERE v.id = m.new_intel_store_v2_id
   AND m.confidence IN ('high','medium')
   AND v.primary_platform = 'weedmaps'
   AND (v1.primary_platform = 'weedmaps' OR v1.designated_scraper = 'weedmaps');

-- ── 8. Menu metadata carry-forward ───────────────────────────────────────
-- `last_successful_scrape` does NOT exist on intel_stores; skip.
UPDATE intel_stores_v2 v
   SET menu_last_updated = v1.menu_last_updated,
       total_products    = coalesce(v1.total_products, 0),
       has_online_menu   = coalesce(v1.has_online_menu, v.has_online_menu)
  FROM stage_5_store_mapping m
  JOIN intel_stores v1 ON v1.id = m.old_intel_store_id
 WHERE v.id = m.new_intel_store_v2_id
   AND m.confidence IN ('high','medium');

-- ── 9. Validation ────────────────────────────────────────────────────────
DO $$
DECLARE
  mapping_total        INT;
  mapping_lcb          INT;
  mapping_addr         INT;
  mapping_new_v2       INT;
  mapping_retired_v1   INT;
  mapping_ambiguous    INT;
  v2_designated        INT;
  v2_joint_with_bizid  INT;
  v2_joint_total       INT;
BEGIN
  SELECT COUNT(*) INTO mapping_total       FROM stage_5_store_mapping;
  SELECT COUNT(*) INTO mapping_lcb         FROM stage_5_store_mapping WHERE match_method = 'lcb_license';
  SELECT COUNT(*) INTO mapping_addr        FROM stage_5_store_mapping WHERE match_method = 'address';
  SELECT COUNT(*) INTO mapping_new_v2      FROM stage_5_store_mapping WHERE match_method = 'unmatched_new_v2';
  SELECT COUNT(*) INTO mapping_retired_v1  FROM stage_5_store_mapping WHERE match_method = 'unmatched_retired_v1';
  SELECT COUNT(*) INTO mapping_ambiguous   FROM stage_5_address_ambiguous;
  SELECT COUNT(*) INTO v2_designated       FROM intel_stores_v2 WHERE designated_scraper IS NOT NULL;
  SELECT COUNT(*) INTO v2_joint_with_bizid FROM intel_stores_v2 WHERE primary_platform = 'joint' AND joint_business_id IS NOT NULL;
  SELECT COUNT(*) INTO v2_joint_total      FROM intel_stores_v2 WHERE primary_platform = 'joint';

  RAISE NOTICE 'Mapping: total=%, lcb=%, addr=%, new_v2=%, retired_v1=%, ambiguous=%',
    mapping_total, mapping_lcb, mapping_addr, mapping_new_v2, mapping_retired_v1, mapping_ambiguous;
  RAISE NOTICE 'v2 designated_scraper populated: %', v2_designated;
  RAISE NOTICE 'v2 joint stores with bizid: % / %', v2_joint_with_bizid, v2_joint_total;
END $$;

-- Persist the ambiguous set for audit/41 to read. Copy to a real table.
CREATE TABLE IF NOT EXISTS stage_5_address_ambiguous_audit (
  v2_id UUID PRIMARY KEY,
  v2_name TEXT,
  candidate_count INT,
  v1_candidates UUID[],
  v1_names TEXT[]
);
INSERT INTO stage_5_address_ambiguous_audit
  SELECT v2_id, v2_name, candidate_count, v1_candidates, v1_names FROM stage_5_address_ambiguous
ON CONFLICT DO NOTHING;

GRANT SELECT ON stage_5_address_ambiguous_audit TO authenticated, anon;
