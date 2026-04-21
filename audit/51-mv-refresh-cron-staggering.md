# Phase 1j follow-up — MV refresh cron staggering

**2026-04-20.** Shipping the mitigation for the nightly saturation event diagnosed in audit/50.

## Root cause

Migration `20260420300000` (audit/49 P1b) scheduled a single pg_cron job:

```
SELECT cron.schedule('cody-refresh-report-rollups', '0 5 * * *', $$ SELECT refresh_all_report_rollups() $$);
```

`refresh_all_report_rollups()` runs **four `REFRESH MATERIALIZED VIEW CONCURRENTLY` calls back-to-back**, each scanning `menu_items` (1.275M rows) + joining `dispensary_menus` + building `COUNT(DISTINCT intel_store_id)` hashes. Measured duration per MV was 30–60 s during normal business, so the whole batch took ~2–4 min at nominal load.

Observed failure pattern at 05:00 UTC:

1. **t = 00:00** — cron fires. Four sequential REFRESH calls queue on the single worker.
2. **t ≈ 00:15** — first MV rebuild finishes; second starts. PostgREST's `pg_catalog` schema-cache refresh (routine periodic) begins on a separate connection.
3. **t ≈ 00:30** — compute CPU pinned at 100% (REFRESH is CPU-bound for the hash aggregate). PostgREST's schema-cache SELECT against `pg_catalog` times out → PGRST002 503.
4. **t ≈ 00:45** — PostgREST restarts, rebuilds cache, times out again on the still-stressed DB. Cloudflare marks the origin unhealthy → 521.
5. **t ≈ 02:00–04:00** — cron finishes, DB settles, PostgREST succeeds on schema-cache refresh, service returns.

During the 2–4 min stress window, every incoming request (Dashboard load, Reports page, ScraperAdmin) sees a mix of 200 / 503 / 521 / connection-timeout. Any frontend path that fans out N parallel calls gets partial failures, which the regression in audit/50 made user-visible (13 rows of zero stores on Your Brand Performance — the proximate cause was latent N-parallel code, the root cause was this cron.

Audit/50 documented the regression fix (single MV-backed RPC). This audit ships the **underlying** fix: stop creating the nightly saturation event in the first place.

## Decision

Four independent cron jobs, one per MV, staggered 15 min apart at **10:00 / 10:15 / 10:30 / 10:45 UTC** (≈ 03:00–03:45 Pacific).

### Why 10:00 UTC?

- **03:00 PT** — before any West-Coast user is online (Chaz's user base is WA cannabis retailers; earliest active hour is ~7:00 PT = 14:00 UTC).
- **After the scraper batch** — cron jobs `cody-scrape-dutchie` / `-jane` / `-leafly` / `-posabit` run 12:15–13:00 UTC. Refreshing the MVs *before* the scrape window would miss the day's data; refreshing *after* gives users fresh numbers by their first login. 10:00 UTC is ~21h after the previous day's scrape, meaning the MVs reflect the most recent scrape within 24 h always.
- **Clear of the existing `cody-refresh-views` cron at 14:00 UTC** (unrelated pre-existing job). The 10:00–10:45 window doesn't contend with it.
- **Clear of the 05:00 UTC autovacuum window** typical on Supabase projects — the 05:00 UTC choice in the original P1b migration was the worst plausible time, not 10:00.

### Why 15 min spacing?

- Each MV rebuild measures 30–60 s on the current compute size.
- 15 min / 900 s gives ~15–30× headroom. Even if a single rebuild balloons to 5 min (worst observed with contention), the next slot is still clean.
- Plenty of time for PostgREST to perform its schema-cache refresh between MVs (which was the proximate trigger for PGRST002).

### Why not REFRESH without CONCURRENTLY?

- `REFRESH MATERIALIZED VIEW` (non-concurrent) takes an AccessExclusiveLock on the MV for the duration of the rebuild — blocking all reads. During the ~30-60 s rebuild, every Dashboard / Reports page request would hang.
- `CONCURRENTLY` requires a unique index on the MV (we have this) and trades longer build time for non-blocking reads. Correct choice for a user-visible surface.

### Why not a single combined cron at a quieter hour?

- Even combined, four back-to-back CPU-heavy REFRESH calls saturate the compute for 2–4 min → same failure mode, just at a different hour.
- Staggering gives the compute a chance to return to baseline between each refresh. PostgREST schema-cache refreshes slot into the idle gaps instead of competing with active REFRESH work.

## Changes shipped

Migration `20260420350000_stagger_mv_refresh_cron.sql`:

1. `cron.unschedule('cody-refresh-report-rollups')` — removes the 05:00 UTC batch job.
2. Idempotent unschedule of the four new names (in case migration is re-applied).
3. Four per-MV refresh helper functions: `refresh_mv_brand_report()`, `refresh_mv_category_report()`, `refresh_mv_price_report()`, `refresh_mv_brand_distribution()`. Each has `statement_timeout = 300s` and an `EXCEPTION WHEN OTHERS` that `RAISE WARNING`s on failure (pg_cron logs the warning but doesn't mark the job as failed — other three still run on their own schedule).
4. Four `cron.schedule` calls at `0 10`, `15 10`, `30 10`, `45 10 * * *`.
5. `refresh_all_report_rollups()` retained for manual/on-demand use.

Post-migration `pg_cron` state:

```
[ON] 0 10 * * *    | cody-refresh-mv-brand-report
[ON] 15 10 * * *   | cody-refresh-mv-category-report
[ON] 30 10 * * *   | cody-refresh-mv-price-report
[ON] 45 10 * * *   | cody-refresh-mv-brand-distribution
```

## Monitoring recommendations

- **Within 24 h** — confirm the first 10:00 UTC run completes cleanly. Check `cron.job_run_details` for `cody-refresh-mv-*` rows with `status='succeeded'`:

  ```sql
  SELECT jobid, runid, status, start_time, end_time, (end_time - start_time) AS duration, return_message
  FROM cron.job_run_details
  WHERE command LIKE '%refresh_mv_%'
  ORDER BY start_time DESC
  LIMIT 20;
  ```

- **Before each cron** — should see CPU at baseline. If not, investigate what's running (`pg_stat_activity` for long-running queries).

- **After all 4 crons** — verify MV freshness:

  ```sql
  SELECT matviewname, last_refresh FROM pg_matviews
  LEFT JOIN (
    SELECT c.relname, s.n_tup_ins + s.n_tup_upd + s.n_tup_del > 0 AS recently_written
    FROM pg_stat_user_tables s JOIN pg_class c ON c.oid = s.relid
  ) ON matviewname = relname
  WHERE matviewname LIKE 'mv_%';
  ```

  (Supabase doesn't expose `last_refresh` directly — easiest check is `SELECT MAX(store_count) FROM mv_brand_report` and compare day-over-day to catch stale data.)

- **User-facing** — a simple "Data updated: X h ago" label on Reports (read from `normalization_stats_cache.refreshed_at` or a new `report_rollups.last_refresh` column) would surface staleness if a cron starts silently failing.

## Open items (not blocking)

- Move the `get_brand_union_store_count` live-aggregate to an MV too — audit/50 flagged this at 7-9 s under load. A new `mv_store_brand_pairs(intel_store_id, brand_key)` materialized view makes the union-count a sub-50 ms read, fully removing the last live-aggregate from Dashboard Phase-2.
- Confirm the 4 staggered crons don't overlap with Supabase maintenance windows. Supabase publishes these per-project in the dashboard; worth a one-time check.
- Long-term: move MV refresh off cron and onto a scraper-batch-complete trigger. If scrapers finish at different times, the refresh cadence matches real data arrival. Not worth the complexity today at 1 scrape/day; revisit if cadence increases.
