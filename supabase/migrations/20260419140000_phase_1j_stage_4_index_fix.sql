-- Stage 4 — fix partial unique index to be non-partial so ON CONFLICT works.
-- Partial unique indexes require ON CONFLICT DO UPDATE to include the WHERE
-- clause in the upsert, which PostgREST's .upsert() doesn't expose. A plain
-- unique constraint (NULLs-distinct by default) works instead: multiple v1
-- rows with NULL intel_store_v2_id don't conflict because NULL != NULL.

DROP INDEX IF EXISTS ux_platform_verification_v2;
CREATE UNIQUE INDEX ux_platform_verification_v2
  ON platform_verification(run_id, intel_store_v2_id, pass);
