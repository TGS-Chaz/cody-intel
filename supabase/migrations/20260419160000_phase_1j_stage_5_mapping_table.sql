-- Phase 1j Stage 5 — create stage_5_store_mapping.
-- Either old or new may be NULL (retired v1 and new v2 rows) but at least one
-- must be set. Partial unique indexes enforce 1:1 on each side when populated.

CREATE TABLE stage_5_store_mapping (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  old_intel_store_id    UUID REFERENCES intel_stores(id),
  new_intel_store_v2_id UUID REFERENCES intel_stores_v2(id),
  match_method          TEXT NOT NULL CHECK (match_method IN (
                          'lcb_license',
                          'address',
                          'name_fuzzy',
                          'manual',
                          'unmatched_new_v2',
                          'unmatched_retired_v1'
                        )),
  confidence            TEXT NOT NULL CHECK (confidence IN ('high','medium','low','flag')),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT stage_5_mapping_at_least_one_side CHECK (
    old_intel_store_id IS NOT NULL OR new_intel_store_v2_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX ux_stage_5_mapping_old ON stage_5_store_mapping(old_intel_store_id)
  WHERE old_intel_store_id IS NOT NULL;
CREATE UNIQUE INDEX ux_stage_5_mapping_new ON stage_5_store_mapping(new_intel_store_v2_id)
  WHERE new_intel_store_v2_id IS NOT NULL;
CREATE INDEX idx_stage_5_mapping_method     ON stage_5_store_mapping(match_method);
CREATE INDEX idx_stage_5_mapping_confidence ON stage_5_store_mapping(confidence);

ALTER TABLE stage_5_store_mapping ENABLE ROW LEVEL SECURITY;
CREATE POLICY stage_5_mapping_read_auth ON stage_5_store_mapping
  FOR SELECT TO authenticated USING (true);
CREATE POLICY stage_5_mapping_read_anon ON stage_5_store_mapping
  FOR SELECT TO anon USING (true);

GRANT SELECT ON stage_5_store_mapping TO authenticated, anon;
