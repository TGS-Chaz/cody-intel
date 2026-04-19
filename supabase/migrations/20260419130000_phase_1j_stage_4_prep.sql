-- Phase 1j Stage 4 preparation:
--   1. Open intel_stores_v2 SELECT to anon (same as intel_stores)
--   2. Add intel_store_v2_id column + index on platform_verification

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'intel_stores_v2' AND policyname = 'intel_stores_v2_read_anon'
  ) THEN
    EXECUTE 'CREATE POLICY intel_stores_v2_read_anon ON intel_stores_v2 FOR SELECT TO anon USING (true)';
  END IF;
END $$;

GRANT SELECT ON intel_stores_v2 TO anon;

-- Platform_verification — new sibling column for the v2 run.
ALTER TABLE platform_verification
  ADD COLUMN IF NOT EXISTS intel_store_v2_id UUID REFERENCES intel_stores_v2(id);

CREATE INDEX IF NOT EXISTS idx_platform_verification_v2 ON platform_verification(intel_store_v2_id, created_at DESC);

-- Allow NULL on intel_store_id so v2-targeted rows can have only intel_store_v2_id.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'platform_verification' AND column_name = 'intel_store_id' AND is_nullable = 'NO'
  ) THEN
    EXECUTE 'ALTER TABLE platform_verification ALTER COLUMN intel_store_id DROP NOT NULL';
  END IF;
END $$;

-- Upsert uniqueness: legacy rows are still constrained by (run_id, intel_store_id, pass).
-- v2 rows don't conflict with that constraint because intel_store_id is NULL for them
-- (NULLs compare unequal, so the existing unique index tolerates them).
-- Add a separate partial unique index for v2 rows to prevent duplicates on the new run.
DROP INDEX IF EXISTS ux_platform_verification_v2;
CREATE UNIQUE INDEX ux_platform_verification_v2
  ON platform_verification(run_id, intel_store_v2_id, pass)
  WHERE intel_store_v2_id IS NOT NULL;
