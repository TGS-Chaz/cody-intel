-- Phase 1j Sub-stage B — apply Jane designations to the 5 regression stores
-- (+ Tacoma POT ZONE which name-search picked up as a bonus, also Jane).
-- New pass2_browser rows under Stage 4 run_id ec3b40a1 already wrote
-- primary_platform='jane' via the refreshed detector; pull through to v2.

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
       v2_notes = coalesce(v2_notes,'') || E'\nSub-stage B 2026-04-20: refreshed Jane detector (tags.cnna.io) recovered platform=' || b.primary_platform
  FROM best b
 WHERE v.id = b.intel_store_v2_id
   AND b.primary_platform = 'jane'
   AND v.id IN (
     '85f0b5be-4c58-48d5-a729-97b1aab9fbaa',   -- POT SHOP (Seattle)
     'bf0a7b54-0c51-46b9-9403-e2b1992b2212',   -- MARY MART INC (Tacoma)
     '872c9b7b-ff19-4141-a454-e96907c1d014',   -- POT ZONE (Port Orchard)
     '80181297-8ce8-4c0d-b5e5-5880d09aa0c2'    -- POT ZONE (Tacoma)
   )
   AND (v.primary_platform IS NULL OR v.primary_platform IN ('none'));

-- HASHTAG CANNABIS (Redmond) and THE FIRE HOUSE (Ellensburg) — look up by
-- name since we don't have their v2 IDs memorized. They also match the same
-- DISTINCT-ON best-verdict logic.
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
),
targets AS (
  SELECT id FROM intel_stores_v2
   WHERE (name = 'HASHTAG CANNABIS' AND website LIKE '%seattlehashtag%')
      OR (name = 'THE FIRE HOUSE' AND website LIKE '%firehousenw%')
)
UPDATE intel_stores_v2 v
   SET designated_scraper             = b.primary_platform,
       primary_platform               = b.primary_platform,
       platform_detection_confidence  = b.confidence,
       platform_detected_at           = now(),
       v2_notes = coalesce(v2_notes,'') || E'\nSub-stage B 2026-04-20: refreshed Jane detector (tags.cnna.io) recovered platform=' || b.primary_platform
  FROM best b
  JOIN targets t ON t.id = b.intel_store_v2_id
 WHERE v.id = b.intel_store_v2_id
   AND b.primary_platform = 'jane'
   AND (v.primary_platform IS NULL OR v.primary_platform IN ('none'));

-- Validate
DO $$ DECLARE updated_ct INT; total_jane INT; BEGIN
  SELECT COUNT(*) INTO updated_ct
    FROM intel_stores_v2
   WHERE primary_platform = 'jane'
     AND platform_detected_at >= (now() - interval '1 hour');
  SELECT COUNT(*) INTO total_jane FROM intel_stores_v2 WHERE primary_platform = 'jane';
  RAISE NOTICE 'Sub-stage B recovered: % jane rows in last hour | total jane stores now: %', updated_ct, total_jane;
END $$;
