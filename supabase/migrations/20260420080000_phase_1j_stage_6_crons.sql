-- Phase 1j Stage 6 — create 4 fresh cron jobs for Dutchie/Jane/Leafly/POSaBit
-- scrapers. Staggered at 12:15 / 12:30 / 12:45 / 13:00 UTC behind the
-- existing cody-scrape-joint at 12:00.
--
-- All scraper edge functions were updated + redeployed to filter
-- `.eq("is_active", true)` before this migration runs, so the new intel_stores
-- (post-swap former v2) is correctly respected.

DO $$
DECLARE
  jobs TEXT[] := ARRAY[
    'cody-scrape-dutchie',
    'cody-scrape-jane',
    'cody-scrape-leafly',
    'cody-scrape-posabit'
  ];
  j TEXT;
BEGIN
  FOREACH j IN ARRAY jobs LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j) THEN
      PERFORM cron.unschedule(j);
      RAISE NOTICE 'Unscheduled existing job: %', j;
    END IF;
  END LOOP;
END $$;

SELECT cron.schedule(
  'cody-scrape-dutchie',
  '15 12 * * *',
  $$ SELECT cody_cron_invoke('cody-scrape-dutchie', 'scrape-dutchie', '{"action":"scrape-all-designated"}'::jsonb) $$
);

SELECT cron.schedule(
  'cody-scrape-jane',
  '30 12 * * *',
  $$ SELECT cody_cron_invoke('cody-scrape-jane', 'scrape-jane', '{"action":"scrape-all-designated"}'::jsonb) $$
);

SELECT cron.schedule(
  'cody-scrape-leafly',
  '45 12 * * *',
  $$ SELECT cody_cron_invoke('cody-scrape-leafly', 'scrape-leafly', '{"action":"scrape-all-designated"}'::jsonb) $$
);

SELECT cron.schedule(
  'cody-scrape-posabit',
  '0 13 * * *',
  $$ SELECT cody_cron_invoke('cody-scrape-posabit', 'scrape-posabit', '{"action":"scrape-all-designated"}'::jsonb) $$
);

-- Report final cron state
DO $$
DECLARE r RECORD;
BEGIN
  RAISE NOTICE '══ Cron jobs after Stage 6 ══';
  FOR r IN (
    SELECT jobname, schedule, active FROM cron.job
     WHERE jobname IN ('cody-scrape-joint','cody-scrape-dutchie','cody-scrape-jane','cody-scrape-leafly','cody-scrape-posabit')
     ORDER BY schedule
  ) LOOP
    RAISE NOTICE '  [%] % | %', CASE WHEN r.active THEN 'ON' ELSE 'OFF' END, r.schedule, r.jobname;
  END LOOP;
END $$;
