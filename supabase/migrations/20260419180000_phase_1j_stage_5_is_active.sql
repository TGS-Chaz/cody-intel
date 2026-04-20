-- Phase 1j Stage 5 follow-up — add general-purpose "not in scope for scraping"
-- flag to intel_stores_v2. Covers cases like CRAFT Leavenworth (Dryden) which
-- is open only a few days/month and isn't worth the scrape pipeline overhead.

ALTER TABLE intel_stores_v2
  ADD COLUMN IF NOT EXISTS is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS deactivated_reason  TEXT,
  ADD COLUMN IF NOT EXISTS deactivated_at      TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_intel_stores_v2_is_active ON intel_stores_v2(is_active);
