-- Phase 1j Stage 5 — hard-deactivate CRAFT Leavenworth (Dryden, LCB 085059).
-- Per Chaz 2026-04-19: open only a few days/month; not worth the scrape
-- pipeline overhead. Stage 3's website association assigned a generic
-- /locations page that returned the Mill Plain Joint widget (bizId 4353),
-- producing a false Joint detection.
--
-- Clear all scraper-facing fields and flag as inactive. Mapping row stays.

DO $$
DECLARE updated_ct INT;
BEGIN
  UPDATE intel_stores_v2
     SET is_active                    = FALSE,
         website                      = NULL,
         joint_business_id            = NULL,
         designated_scraper           = NULL,
         primary_platform             = NULL,
         platform_detection_confidence= NULL,
         platform_detected_at         = NULL,
         website_association_source   = 'deactivated_low_activity',
         deactivated_reason           = 'Open only a few days per month — not worth scraping. Per Chaz 2026-04-19.',
         deactivated_at               = now(),
         v2_notes = coalesce(v2_notes,'') ||
                    E'\nStage 5 deactivation: hard-deactivated per Chaz 2026-04-19 — low-activity store; Stage 3 website pointed at generic CRAFT /locations page which served Mill Plain Joint widget (bizId 4353 false-positive).'
   WHERE lcb_license_id = '085059';
  GET DIAGNOSTICS updated_ct = ROW_COUNT;
  RAISE NOTICE 'CRAFT Leavenworth deactivation: % row(s) updated', updated_ct;
  IF updated_ct <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 row (lcb_license_id=085059), got %', updated_ct;
  END IF;
END $$;
