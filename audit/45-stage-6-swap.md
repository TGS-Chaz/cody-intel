# Phase 1j Stage 6 — Table Swap + Scraper Re-enable

**2026-04-20. Renamed `intel_stores` → `intel_stores_archived` (legacy v1 preserved) and `intel_stores_v2` → `intel_stores` (new primary). Repointed `dispensary_menus.intel_store_id` to the new primary via `stage_5_store_mapping`. Updated 5 scraper edge functions to filter `is_active=true`. Created 4 fresh cron jobs (Dutchie/Jane/Leafly/POSaBit) staggered at 12:15/12:30/12:45/13:00 UTC. `cody-scrape-joint` already active at 12:00 UTC.**

## Pre-flight findings (from [audit/44 Pre-Swap Schema Audit](44-substage-c-refreshed-detector-full-bucket.md#stage-6--pre-swap-schema-audit))

- intel_stores_v2: 470 rows, 469 active, 296 designated, 1 deactivated
- intel_stores (v1): 560 rows, all status=active
- dispensary_menus: 751 total, 385 with intel_store_id
- menu_items: 1,275,339 — linked via `dispensary_menus_id` (not `intel_store_id`), so no direct touch needed
- 13 FKs referenced intel_stores; only dispensary_menus requires repoint (rest stay attached to archive)
- pg_cron: 8 jobs all active, **zero Dutchie/Jane/Leafly/POSaBit** (Phase 1e deleted them, not paused)
- Dashboard schema risks: 1 HIGH (ScraperAdmin licenseMap lookup), 1 MEDIUM (6 queries lacking `is_active` filter), 2 LOW (null handling + cosmetic)

## Steps executed

### Step 1+2 — Rename (migration `20260420070000_phase_1j_stage_6_swap.sql`)

```sql
ALTER TABLE intel_stores RENAME TO intel_stores_archived;
ALTER TABLE intel_stores_v2 RENAME TO intel_stores;
```

Also renamed the v2-scoped indexes to drop the `_v2` suffix (cosmetic). The `idx_intel_stores_city` name on the archived table was already in use, so the former `idx_intel_stores_v2_city` got renamed to `idx_intel_stores_city_v2` to avoid collision.

### Step 3 — dispensary_menus FK repoint

```sql
ALTER TABLE dispensary_menus DROP CONSTRAINT dispensary_menus_intel_store_id_fkey;

UPDATE dispensary_menus d
   SET intel_store_id = m.new_intel_store_v2_id
  FROM stage_5_store_mapping m
 WHERE d.intel_store_id = m.old_intel_store_id
   AND m.new_intel_store_v2_id IS NOT NULL
   AND m.confidence IN ('high','medium');

UPDATE dispensary_menus d
   SET intel_store_id = NULL
 WHERE d.intel_store_id IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM stage_5_store_mapping m
      WHERE m.old_intel_store_id = d.intel_store_id
        AND m.new_intel_store_v2_id IS NULL
   );

ALTER TABLE dispensary_menus
  ADD CONSTRAINT dispensary_menus_intel_store_id_fkey
  FOREIGN KEY (intel_store_id) REFERENCES intel_stores(id);
```

Results reported by the migration:

| Metric | Before | After |
|---|---:|---:|
| dispensary_menus total | 751 | 751 |
| with intel_store_id populated | 385 | 315 |
| distinct intel_store_id values | 364 | 295 |
| Repointed to v2 | — | **315** |
| NULLed orphans (retired_v1 mappings) | — | **70** |
| NULLed unmatched leftovers | — | 0 |
| Orphan FKs post-repoint | — | **0** ✓ |

**70 menu rows detached, not 15 as estimated.** These correspond to Phase 1i Category A.2 closed-LCB phantoms (28 rows) + Category B duplicates (26, of which 23 carried menu data) + some Category A.3 no-signal phantoms that had been scraped. The menu_items rows linked to these 70 dispensary_menus entries still exist and are reachable via the dispensary_menus row (1.275M total menu_items unaffected), but the FK to a store is severed. A future consolidation pass can attach these to their canonical v2 rows where Phase 1i duplicate-analysis identified one (Section 7c of audit/36).

### Step 4 — Scraper is_active filters (cody-crm)

Added `.eq("is_active", true)` to 14 target-enumeration query sites across 5 scrape-* functions + the shared cursor helper:

| File | Call sites patched |
|---|---:|
| `supabase/functions/_shared/scraper-cursor.ts` | 1 |
| `supabase/functions/scrape-dutchie/index.ts` | 3 |
| `supabase/functions/scrape-jane/index.ts` | 3 |
| `supabase/functions/scrape-leafly/index.ts` | 3 |
| `supabase/functions/scrape-posabit/index.ts` | 3 |
| `supabase/functions/scrape-joint/index.ts` | 2 |
| **Total** | **15** |

All 5 edge functions redeployed via `supabase functions deploy`.

### Step 5 — Create 4 fresh cron jobs (migration `20260420080000_phase_1j_stage_6_crons.sql`)

Staggered behind `cody-scrape-joint` (12:00 UTC):

| jobname | schedule (UTC) | command |
|---|---|---|
| cody-scrape-joint (pre-existing) | 0 12 * * * | scrape-joint / scrape-all-designated |
| **cody-scrape-dutchie** | 15 12 * * * | scrape-dutchie / scrape-all-designated |
| **cody-scrape-jane** | 30 12 * * * | scrape-jane / scrape-all-designated |
| **cody-scrape-leafly** | 45 12 * * * | scrape-leafly / scrape-all-designated |
| **cody-scrape-posabit** | 0 13 * * * | scrape-posabit / scrape-all-designated |

All 5 cron jobs verified ON post-migration.

## Step 6 — Verification

| Check | Expected | Actual | ✓ |
|---|---|---|:-:|
| `intel_stores` (new primary) total | 470 | 470 | ✓ |
| `intel_stores` is_active=true | 469 | 469 | ✓ |
| `intel_stores` is_active=false | 1 | 1 (CRAFT Leavenworth) | ✓ |
| `intel_stores` designated_scraper not null | 296 | 296 | ✓ |
| `intel_stores_archived` (legacy) total | 560 | 560 | ✓ |
| `intel_stores_archived` status=active | 560 | 560 | ✓ |
| `intel_stores_v2` exists | **no** | PGRST205 "not found" | ✓ |
| `dispensary_menus` total | 751 | 751 (unchanged) | ✓ |
| `dispensary_menus` with intel_store_id | 315 | 315 (post-repoint) | ✓ |
| Orphan FKs on dispensary_menus | 0 | 0 | ✓ |
| pg_cron jobs active (5 scrapers) | 5 | 5 | ✓ |

### Scraper eligibility tallies (what each scraper will iterate tonight)

Queries matching the post-Step-4 target filter `designated_scraper=X AND status=active AND is_active=true AND has_online_menu=true`:

| Scraper | Designated total | Eligible |
|---|---:|---:|
| Dutchie | 77 | **75** (2 without has_online_menu=true) |
| Jane | 91 | **89** (2 without) |
| Leafly | 44 | **44** |
| POSaBit | 65 | **63** (2 without) |
| Joint | 18 | **18** |
| **Total eligible** | 295 | **289** |

The 6 gap (296 designated − 295 counted here − 1 deactivated = 6 lost somewhere, actually 295 matches 296-1) is CRAFT Leavenworth with designated_scraper cleared. Of the 295 that still carry a designation, 6 have has_online_menu NULL or false — they'll be excluded from tonight's scrape until the next manual confirmation flips has_online_menu=true.

### Live-table sanity

`intel_stores_archived` has all 560 legacy rows intact; 12 other FKs (intel_alerts, intel_detected_needs_credentials, intel_stale_platform_bindings, intel_store_platform_scan, intel_unmatched_discoveries, menu_snapshots, platform_verification.intel_store_id, product_matches, store_briefs, store_deals, store_tags, stage_5_store_mapping.old_intel_store_id) followed the rename and remain attached to the archive. These are historical/analytical tables appropriate for archive attachment.

`platform_verification` has both columns (`intel_store_id` → archived, `intel_store_v2_id` → new intel_stores). Future runs can drop the legacy `intel_store_id` usage in favor of `intel_store_v2_id`, but the split is fine as-is.

## Dashboard post-swap status

Per audit/44 Stage-6 pre-swap audit, 4 schema risks identified:
1. **HIGH — ScraperAdmin licenseMap** — broken, shows "LCB #(null)" on unmatched-store rows. **Fix in follow-up commit.**
2. **MEDIUM — is_active not in dashboard queries** — 6 queries return CRAFT Leavenworth in counts (±1 row). **Fix in follow-up commit.**
3. **LOW — null total_products** — already handled defensively. No change.
4. **LOW — UUID→number in StoreDetail header** — cosmetic improvement.

None block the swap. Chaz to spot-check `cody-crm.vercel.app` (or equivalent cody-intel dashboard URL) after commit to confirm nothing else fell over.

## First scheduled scraper run

First job fires at 12:00 UTC (Joint) → 12:15 (Dutchie) → 12:30 (Jane) → 12:45 (Leafly) → 13:00 (POSaBit). Today's 2026-04-20 run depends on current time (if before 12:00 UTC, tonight; otherwise tomorrow). Verification: check `cron_job_log` tomorrow morning or manually trigger `cody_cron_invoke('cody-scrape-dutchie','scrape-dutchie','{"action":"scrape-all-designated"}')` now for a sooner sanity.

## Artifacts

- Pre-flight inspection migration: `supabase/migrations/20260420060000_phase_1j_stage_6_preflight.sql`
- Swap migration: `supabase/migrations/20260420070000_phase_1j_stage_6_swap.sql`
- Cron migration: `supabase/migrations/20260420080000_phase_1j_stage_6_crons.sql`
- Scraper filter patches (cody-crm): 5 edge functions + `_shared/scraper-cursor.ts`

## Gate

No blocking gate. Swap succeeded. 4 known dashboard schema issues documented in audit/44's Stage-6 audit; follow-up commit resolves them.

Rollback (scoped):
```sql
-- Full rollback (destructive — loses all post-swap writes to intel_stores including
-- Sub-stage A/B/C designations and dispensary_menus repoint).
ALTER TABLE dispensary_menus DROP CONSTRAINT dispensary_menus_intel_store_id_fkey;
ALTER TABLE intel_stores RENAME TO intel_stores_v2;
ALTER TABLE intel_stores_archived RENAME TO intel_stores;
-- Revert index renames
-- Revert dispensary_menus updates using stage_5_store_mapping in reverse
ALTER TABLE dispensary_menus
  ADD CONSTRAINT dispensary_menus_intel_store_id_fkey
  FOREIGN KEY (intel_store_id) REFERENCES intel_stores(id);
-- Drop the 4 new crons
SELECT cron.unschedule('cody-scrape-dutchie');
SELECT cron.unschedule('cody-scrape-jane');
SELECT cron.unschedule('cody-scrape-leafly');
SELECT cron.unschedule('cody-scrape-posabit');
```

Pre-Stage-6 commit: `2394810` (Sub-stage C refreshed-detector full-bucket rescan).
