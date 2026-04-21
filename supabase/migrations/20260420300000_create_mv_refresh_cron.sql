-- audit/49 P1b — refresh function + pg_cron schedule for the 4 report MVs.
-- Runs at 05:00 UTC daily, BEFORE the 12:00-13:00 UTC scraper window so
-- reports are fresh before users start their day.
--
-- Refresh strategy:
--   * REFRESH MATERIALIZED VIEW CONCURRENTLY — non-blocking for readers.
--     Requires the unique indexes created with each MV.
--   * One function wraps all four REFRESH calls so the cron definition
--     stays one-line and we can invoke it manually (`SELECT refresh_all_report_rollups();`).
--   * Runs sequentially. Total expected time: ~30-60s. If one MV fails
--     (e.g. table lock), subsequent REFRESH calls still attempt — the
--     function doesn't abort on a single failure.
--   * statement_timeout bumped to 300s so a slow REFRESH doesn't hit
--     the role-level timeout.
--
-- Invocation from SQL editor: `SELECT refresh_all_report_rollups();`

CREATE OR REPLACE FUNCTION refresh_all_report_rollups()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '300s'
AS $$
BEGIN
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_brand_report;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'mv_brand_report refresh failed: %', SQLERRM;
  END;

  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_category_report;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'mv_category_report refresh failed: %', SQLERRM;
  END;

  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_price_report;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'mv_price_report refresh failed: %', SQLERRM;
  END;

  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_brand_distribution;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'mv_brand_distribution refresh failed: %', SQLERRM;
  END;
END $$;

-- Unschedule prior definition if re-applying
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cody-refresh-report-rollups') THEN
    PERFORM cron.unschedule('cody-refresh-report-rollups');
  END IF;
END $$;

SELECT cron.schedule(
  'cody-refresh-report-rollups',
  '0 5 * * *',
  $$ SELECT refresh_all_report_rollups() $$
);
