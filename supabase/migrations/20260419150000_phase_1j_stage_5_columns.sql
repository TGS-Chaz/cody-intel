-- Phase 1j Stage 5 — add audit columns to intel_stores_v2 for the
-- Stage 4 designation write. joint_business_id already exists.
-- last_successful_scrape does NOT exist on either table — skip.

ALTER TABLE intel_stores_v2
  ADD COLUMN IF NOT EXISTS platform_detection_confidence TEXT,
  ADD COLUMN IF NOT EXISTS platform_detected_at          TIMESTAMPTZ;
