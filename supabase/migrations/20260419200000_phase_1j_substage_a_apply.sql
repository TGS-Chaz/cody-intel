-- Phase 1j Sub-stage A — apply recovered designations from the Pass 2 rescan
-- to intel_stores_v2. Only 2 stores changed verdict (NATURAL GREEN → dutchie,
-- THE STASH BOX → jane). Using DISTINCT ON best-row pattern scoped to those IDs.

WITH best AS (
  SELECT DISTINCT ON (intel_store_v2_id)
         intel_store_v2_id,
         primary_platform,
         confidence
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
       v2_notes = coalesce(v2_notes,'') || E'\nSub-stage A 2026-04-20: rescan with waitMs=60000 recovered platform=' || b.primary_platform
  FROM best b
 WHERE v.id = b.intel_store_v2_id
   AND b.primary_platform IN ('dutchie','jane','leafly','posabit','joint','weedmaps')
   AND v.id IN (
     '36ebb5a1-8d60-41fc-bb6c-378c751ef180',   -- NATURAL GREEN (Davenport, lic 421687) → dutchie
     'c95291f0-10b3-4d66-9384-53c3e89e656f'    -- THE STASH BOX (Auburn, lic 412494) → jane
   )
   AND (v.primary_platform IS NULL OR v.primary_platform = 'none');

-- Validate
DO $$ DECLARE updated_ct INT; BEGIN
  SELECT COUNT(*) INTO updated_ct
    FROM intel_stores_v2
   WHERE lcb_license_id IN ('421687','412494')
     AND primary_platform IS NOT NULL
     AND platform_detected_at >= (now() - interval '1 hour');
  RAISE NOTICE 'Sub-stage A recovered: % row(s) designated', updated_ct;
END $$;
