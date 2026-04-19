-- Phase 1j Stage 3 — follow-up RLS patch.
-- Stage 3 enabled RLS on intel_stores_v2 with only a SELECT policy. The apply
-- page also needs UPDATE. Limit UPDATE to the admin email so non-admin users
-- can't rewrite v2 rows from the browser.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'intel_stores_v2' AND policyname = 'intel_stores_v2_admin_update') THEN
    EXECUTE $p$
      CREATE POLICY intel_stores_v2_admin_update ON intel_stores_v2
        FOR UPDATE TO authenticated
        USING (
          auth.jwt() ->> 'email' = 'chaz@greensolutionlab.com'
        )
        WITH CHECK (
          auth.jwt() ->> 'email' = 'chaz@greensolutionlab.com'
        )
    $p$;
  END IF;
END $$;

-- Match the queue table: only the admin user gets UPDATE. SELECT already broad.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stage_3_review_queue' AND policyname = 'stage_3_review_queue_update') THEN
    EXECUTE 'DROP POLICY stage_3_review_queue_update ON stage_3_review_queue';
  END IF;
END $$;
CREATE POLICY stage_3_review_queue_update ON stage_3_review_queue
  FOR UPDATE TO authenticated
  USING (
    auth.jwt() ->> 'email' = 'chaz@greensolutionlab.com'
  )
  WITH CHECK (
    auth.jwt() ->> 'email' = 'chaz@greensolutionlab.com'
  );
