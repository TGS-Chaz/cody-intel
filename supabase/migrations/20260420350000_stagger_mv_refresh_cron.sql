-- audit/51 — stagger the 4 materialized view refreshes.
--
-- The audit/49 P1b cron scheduled a single `refresh_all_report_rollups()`
-- at `0 5 * * *` UTC that ran 4 `REFRESH MATERIALIZED VIEW CONCURRENTLY`
-- calls back-to-back, each scanning 1.275M rows. On the current compute
-- tier this saturated CPU for ~2-4 min. PostgREST's schema-cache refresh
-- overlapped and returned PGRST002, then Cloudflare upgraded to 521. Net
-- effect: the dashboard was unreachable every night from ~05:00 UTC for
-- several minutes.
--
-- Fix: four independent crons at `:00 / :15 / :30 / :45` 10:00 UTC
-- (~03:00 PT — well after the 12:00-13:00 UTC scraper window, before the
-- earliest West-Coast user is on). Each refresh now runs alone on the
-- compute, and PostgREST schema-cache refreshes slot in between.
--
-- refresh_all_report_rollups() stays for manual/on-demand use.

BEGIN;

-- ── Remove the old all-in-one cron ───────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cody-refresh-report-rollups') THEN
    PERFORM cron.unschedule('cody-refresh-report-rollups');
    RAISE NOTICE 'Unscheduled: cody-refresh-report-rollups';
  END IF;
END $$;

-- Also unschedule the new jobs if this migration is re-applied (idempotency).
DO $$
DECLARE
  j text;
BEGIN
  FOREACH j IN ARRAY ARRAY[
    'cody-refresh-mv-brand-report',
    'cody-refresh-mv-category-report',
    'cody-refresh-mv-price-report',
    'cody-refresh-mv-brand-distribution'
  ] LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j) THEN
      PERFORM cron.unschedule(j);
      RAISE NOTICE 'Unscheduled existing: %', j;
    END IF;
  END LOOP;
END $$;

-- ── Per-MV refresh helpers ───────────────────────────────────────────────────
-- Each is its own function so cron.schedule's command is a simple SELECT
-- (no nested dollar quoting). EXCEPTION block swallows failure — one bad
-- MV run won't trip pg_cron's error log + retry semantics, and the other
-- three still run on their own schedule. statement_timeout = 300s covers
-- the ~30-60s actual refresh with comfortable headroom.

CREATE OR REPLACE FUNCTION refresh_mv_brand_report()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '300s'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_brand_report;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'mv_brand_report refresh failed: %', SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION refresh_mv_category_report()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '300s'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_category_report;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'mv_category_report refresh failed: %', SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION refresh_mv_price_report()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '300s'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_price_report;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'mv_price_report refresh failed: %', SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION refresh_mv_brand_distribution()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '300s'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_brand_distribution;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'mv_brand_distribution refresh failed: %', SQLERRM;
END $$;

-- ── Schedule the 4 new staggered crons ───────────────────────────────────────
SELECT cron.schedule(
  'cody-refresh-mv-brand-report',
  '0 10 * * *',
  $$ SELECT refresh_mv_brand_report() $$
);

SELECT cron.schedule(
  'cody-refresh-mv-category-report',
  '15 10 * * *',
  $$ SELECT refresh_mv_category_report() $$
);

SELECT cron.schedule(
  'cody-refresh-mv-price-report',
  '30 10 * * *',
  $$ SELECT refresh_mv_price_report() $$
);

SELECT cron.schedule(
  'cody-refresh-mv-brand-distribution',
  '45 10 * * *',
  $$ SELECT refresh_mv_brand_distribution() $$
);

-- ── Report final cron state ──────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  RAISE NOTICE '══ Report-rollup cron jobs after stagger migration ══';
  FOR r IN (
    SELECT jobname, schedule, active
      FROM cron.job
     WHERE jobname LIKE 'cody-refresh-%'
     ORDER BY schedule
  ) LOOP
    RAISE NOTICE '  [%] % | %', CASE WHEN r.active THEN 'ON' ELSE 'OFF' END, r.schedule, r.jobname;
  END LOOP;
END $$;

COMMIT;
