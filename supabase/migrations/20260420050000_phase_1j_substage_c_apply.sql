-- Phase 1j Sub-stage C — apply recovered designations from the full-bucket
-- rescan (144 Stage-4 none stores, refreshed Jane detector from Sub-stage B).
-- 10 recoveries: 7 jane + 2 posabit + 1 dutchie.
--
-- Uses the same DISTINCT ON best-verdict pattern so any store whose latest
-- pass2_browser row for run ec3b40a1 now carries a real platform gets flipped.

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
       platform_detected_at           = now(),
       v2_notes = coalesce(v2_notes,'') || E'\nSub-stage C 2026-04-20: refreshed-detector rescan of Stage 4 none bucket recovered platform=' || b.primary_platform
  FROM best b
 WHERE v.id = b.intel_store_v2_id
   AND b.primary_platform IN ('dutchie','jane','leafly','posabit','joint','weedmaps')
   AND v.is_active = true
   AND (v.primary_platform IS NULL OR v.primary_platform = 'none')
   AND v.designated_scraper IS NULL;

-- Populate joint_business_id for any joint recoveries (would be 0 in this
-- substage based on the analyzer output, but the block is idempotent).
UPDATE intel_stores_v2 v
   SET joint_business_id = NULLIF(pv.signals->'joint_business_id'->>0, '')
  FROM platform_verification pv
 WHERE pv.intel_store_v2_id = v.id
   AND pv.run_id = 'ec3b40a1-3ae0-48a3-a361-962e0ab82baf'
   AND pv.pass = 'pass2_browser'
   AND v.primary_platform = 'joint'
   AND v.joint_business_id IS NULL
   AND pv.signals->'joint_business_id' IS NOT NULL;

DO $$ DECLARE updated_ct INT; total_designated INT; BEGIN
  SELECT COUNT(*) INTO updated_ct
    FROM intel_stores_v2
   WHERE designated_scraper IS NOT NULL
     AND platform_detected_at >= (now() - interval '30 minutes');
  SELECT COUNT(*) INTO total_designated FROM intel_stores_v2 WHERE designated_scraper IS NOT NULL;
  RAISE NOTICE 'Sub-stage C applied: % designations in the last 30 min | total v2 designated: %', updated_ct, total_designated;
END $$;
