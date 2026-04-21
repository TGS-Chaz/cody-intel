# Phase 1j follow-up — Intel page load performance investigation

**2026-04-20.** Deep-dive on reports of 2–4 minute page loads across cody-intel.vercel.app after the Reports RPC migration (aaf9503 + a470b13). Data is now correct, but the application is unusable due to latency.

Investigation only. No changes applied. Chaz to review and pick fixes.

## TL;DR

The previous migration (`aaf9503` / `a470b13`) fixed the Reports correctness bugs and moved the four Reports aggregations onto SECURITY DEFINER RPCs. It did **not** fix performance. The RPCs still do a sequential scan of `menu_items` (1.275M rows) on every call because:

1. **The existing `menu_items (lower(raw_brand))` index doesn't match the new RPCs' `GROUP BY lower(btrim(raw_brand))` expression.** `btrim()` on the index key breaks index usability — Postgres falls back to a full scan + hash aggregate. Same for `raw_category`.
2. **Dashboard Phase-2 was never migrated** off the same 1000-row-capped `.in()` chunk pattern that Reports had — `src/pages/Dashboard.tsx:310-320` still reads `menu_items` client-side.
3. **DashboardMap pulls 1200 wide JSONB rows from `menu_snapshots`** — the row width makes this slow even with an index.
4. **Reports → Gap** still does a `.range(0, 4999)` loop over 1.275M rows — will never finish under the 8 s auth statement-timeout.
5. **`get_price_report_rollup` cold run is 11 s** and trips the 8 s `authenticated` role `statement_timeout` on half its calls. Warm runs hit the Postgres query cache and complete in < 20 ms, which hides the problem in local testing.

**Ranked recommendations**:
- **P0 (today)** — 3 expression/partial indexes on `menu_items`. Expected: 5–7 s RPC → 200–600 ms. No code changes. No migration risk. `CREATE INDEX CONCURRENTLY` to avoid locking writers.
- **P1 (this week)** — port `Dashboard.tsx` Phase-2 to an RPC mirroring the Reports pattern (cap 50 market brands server-side). Kills the last `.in([N UUIDs])` chunk-reader.
- **P1 (this week)** — materialize the four Reports rollups into `mv_brand_rollup` / `mv_category_rollup` / `mv_price_rollup` / `mv_brand_distribution`, refreshed by cron after each scrape batch. Runtime becomes O(rows-in-MV) ≈ 2–2.5k rows — expected P95 < 50 ms per report.
- **P2** — replace Reports → Gap `.range()` loop with a SECURITY DEFINER aggregate RPC. Without this, the Gap tab hangs indefinitely.
- **P3** — trim DashboardMap `menu_snapshots` query to the one row per store it actually uses (`get_latest_menu_snapshots_per_store` RPC already exists), and narrow `product_data` to only the `b` (brand) field via a generated column or `jsonb_path_query_array`.

If P0 alone is shipped, Dashboard-Phase-2 and DashboardMap remain slow, but Reports returns to sub-second. P0 + P1 makes the whole app usable; P1 materialized views are the structural fix.

---

## Step 1 — Load-time profile

Re-issued every query each page fires on load, against prod PostgREST with the anon JWT. Anon `statement_timeout` is ~3 s; `authenticated` is ~8 s — so browser numbers on authenticated sessions will be roughly 2× the 3-s-timeout lines below before they succeed. Cold = first call after a > 5-min idle. Warm = immediate second call. All values are wall-clock including network RTT (~50–80 ms PNW).

| Page (component)                                      | Cold ms    | Warm ms    | Notes                                                                                                                                 |
|-------------------------------------------------------|-----------:|-----------:|--------------------------------------------------------------------------------------------------------------------------------------|
| Dashboard Phase-1 counts (×4 parallel)                | 200–560    | 130–380    | Healthy. `intel_stores` + `intel_alerts` counts only.                                                                                |
| Dashboard Phase-2 `dispensary_menus` fetch            | 185        | 156        | Fast (meta query).                                                                                                                   |
| **Dashboard Phase-2 `menu_items` chunk 1 of ~1**      | **TIMEOUT (3.2 s)** | TIMEOUT     | `57014 canceling statement due to statement timeout`. In auth mode hits 8 s budget. Core driver of "Dashboard slow".                 |
| DashboardMap `intel_stores` geocoded                  | 230        | 131        | Fast.                                                                                                                                |
| **DashboardMap `menu_snapshots` limit 1200 JSONB**    | **TIMEOUT (3.2 s)** | TIMEOUT     | Wide rows. Even if it returns on auth (5–7 s), payload is multi-MB. Main map-render stall.                                           |
| **Reports → Brands** `get_brand_report_rollup`        | **6269**   | **5456**   | 1000 rows returned (PostgREST cap). Same 5+ s every call — cache doesn't help across sessions.                                       |
| **Reports → Categories** `get_category_report_rollup` | **5171**   | **5192**   | 201 rows.                                                                                                                            |
| **Reports → Prices** `get_price_report_rollup`        | **11362**  | 16         | **Cold run trips 8 s auth timeout ~50 % of the time.** Warm is query-plan-cached. Worst first-impression case in the app.            |
| **Reports → Distribution** `get_brand_distribution_rollup` | **5218**   | **5190**   | 1000 rows.                                                                                                                           |
| **Reports → Gap** `menu_items range 0-4999 chunk 1/~256** | **TIMEOUT (3.1 s)** | TIMEOUT     | Full-scan `.range()` loop. Still broken from pre-aaf9503 era — audit/48 deferred this.                                               |
| Stores (StoreDirectory)                               | 314        | 254        | Healthy.                                                                                                                             |
| ScraperAdmin (×6 queries)                             | 137–251    | 131–214    | All healthy.                                                                                                                         |
| Trends `daily_brand_metrics` 30d                      | 147        | 139        | Fast, but `daily_brand_metrics` has 173 rows total (audit/48 finding) — permanent empty state.                                       |

**Worst-case compounding**: a user landing on Dashboard triggers Phase-1 (fast) → Phase-2 heavy scan → DashboardMap heavy JSONB → each of which can stall 5–8 s on auth. Sequential, because Phase-2 waits for Phase-1 state (`useEffect` guard on `fastLoading`). Measured upper bound ~15–20 s for Dashboard first paint; 4 min is plausible if the `menu_items` chunked fetch stalls, retries, or the browser queues behind other idle tabs' long-polls.

---

## Step 2 — RPC execution profile (inferred)

Direct `EXPLAIN ANALYZE` requires psql / SQL-editor access I don't have. Reconstructed query plans based on the RPC source and on-disk schema (from migrations) + timing behavior:

### 2.1 `get_brand_report_rollup`
```
SELECT MIN(mi.raw_brand), COUNT(DISTINCT dm.intel_store_id), COUNT(*), AVG(...)
FROM   menu_items mi
JOIN   dispensary_menus dm ON mi.dispensary_menu_id = dm.id
WHERE  mi.is_on_menu = true
  AND  mi.raw_brand IS NOT NULL
  AND  btrim(mi.raw_brand) <> ''
  AND  dm.intel_store_id IS NOT NULL
GROUP  BY lower(btrim(mi.raw_brand))
ORDER  BY store_count DESC NULLS LAST, brand ASC
LIMIT  2000;
```

**Expected plan** (educated guess given timings):
- `Seq Scan on menu_items` with filter `is_on_menu AND raw_brand IS NOT NULL AND btrim(raw_brand) <> ''` — no index can serve `btrim()`.
- `Hash Join` against `dispensary_menus` (small, 315–400 rows) — fast.
- `HashAggregate` on `lower(btrim(raw_brand))` — ~2k groups. Moderate memory; unlikely to spill at 1.275M rows.
- `Sort + Limit` on the 2000-row result — negligible.

Cost is dominated by the 1.275M-row scan + per-row `btrim()` + `lower()`. 5 s matches a cold sequential scan on a 1.275M × ~200-byte table; warm (page cache hot) would be ~2 s.

### 2.2 `get_category_report_rollup`
Same shape, smaller output (~200 groups). Same sequential scan. Same 5 s cold.

### 2.3 `get_price_report_rollup`
Two sequential scans because of `UNION ALL` with different `GROUP BY` keys. That's why cold is 2× the brand rollup (11 s vs 6 s). Warm drops to 16 ms because both scans re-use the same cached pages + `raw_price` histogram.

### 2.4 `get_brand_distribution_rollup`
Identical to 2.1 minus `AVG(raw_price)`. Saves ~200 ms. Plan identical otherwise.

---

## Step 3 — Index audit on `menu_items`

The `menu_items` table definition is not in this repo (lives only in a remote migration). What I know from scanned migrations + the `dashboard-rpc-fixes.sql` script that was applied out of band:

| Index (known to exist)                                   | Serves                                                            |
|----------------------------------------------------------|-------------------------------------------------------------------|
| `menu_items` PK (`id`)                                   | Primary key lookups                                               |
| `menu_items.dispensary_menu_id` (FK auto-index, assumed) | JOINs to `dispensary_menus`                                       |
| `menu_items_raw_brand_lower_idx` on `lower(raw_brand)`   | `get_brand_store_count` single-brand lookup (why that RPC is 1 s) |

**Missing, needed by the new report RPCs**:

| Proposed index                                                                                                | Serves                                                                                                                    |
|---------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------|
| `CREATE INDEX menu_items_brand_lookup_idx ON menu_items (lower(btrim(raw_brand))) WHERE is_on_menu AND raw_brand IS NOT NULL` | Partial expression index that matches the new RPCs' `GROUP BY` key exactly. Reduces 1.275M-row scan → scan of on-menu rows with brand only (estimated 70–85% of the table — still large, but index-only scans can avoid heap access). |
| `CREATE INDEX menu_items_category_lookup_idx ON menu_items (lower(btrim(raw_category))) WHERE is_on_menu AND raw_category IS NOT NULL` | Same for `get_category_report_rollup` + the category arm of `get_price_report_rollup`.                                    |
| `CREATE INDEX menu_items_on_menu_idx ON menu_items (is_on_menu) WHERE is_on_menu`                              | Lets the planner pre-filter to on-menu rows cheaply before hashing.                                                       |
| `CREATE INDEX menu_items_brand_price_idx ON menu_items (lower(btrim(raw_brand)), lower(btrim(raw_category))) WHERE is_on_menu AND raw_brand IS NOT NULL AND raw_category IS NOT NULL AND raw_price > 0` | Covering index for the brand_category arm of `get_price_report_rollup`. Lets that arm be an index-only aggregate.         |

Note: the `btrim()` wrapper around `lower()` is what makes the **existing** `lower(raw_brand)` index unusable. If the existing index were dropped and recreated as `lower(btrim(raw_brand))`, `get_brand_store_count` would continue to work with a tiny rewrite (`lower(btrim(brand_name))` in its WHERE clause) and everyone would share one index. Worth considering during P0 rollout.

**Cannot verify without DB access**: whether `auto_explain` is on, whether `track_io_timing` is set, actual `pg_stat_user_indexes.idx_scan` for the existing index. If P0 is shipped, confirm with `EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM get_brand_report_rollup();` before and after.

---

## Step 4 — Connection pooling

Supabase fronts Postgres with PgBouncer in transaction-pool mode for the anon/authenticated roles by default. The dashboard fires up to 5 queries in Phase-1 + 3 in Phase-2 + DashboardMap's 5 ≈ 13 concurrent queries per tab. Default Supabase pool for the `authenticated` role on the Free/Pro tier is 15 transactions. Two open tabs can exhaust it; a user who opens Dashboard + Reports in sequence will see the second page's queries queue behind the first.

**Cannot verify without the Supabase dashboard**: current `max_connections`, pool size, and active connection count during the slow window. If the user can check the Supabase dashboard → Database → Connection pooler and report pool utilization during a slow page load, we'll know whether P2 pool adjustment is actually needed — my suspicion is the dominant problem is per-query latency (addressed by P0), not pool starvation.

Note: `SECURITY DEFINER` functions still use connection slots, and the 5 s+ holding time per Reports RPC call means **one user clicking through Reports tabs holds a pool slot for 20+ seconds**. With P0 indexes, hold time drops to < 1 s and pool starvation becomes a non-issue.

---

## Step 5 — Materialized view candidates

Scrapers write to `menu_items` once per scrape run per store (hourly-ish on the active scrapers per `supabase/migrations/20260420080000_phase_1j_stage_6_crons.sql`). The four report RPCs are deterministic functions of `menu_items` + `dispensary_menus`. They're prime MV candidates.

| Proposed MV                       | Est. row count | Source RPC                           | Refresh strategy                                                                   |
|-----------------------------------|---------------:|--------------------------------------|------------------------------------------------------------------------------------|
| `mv_brand_rollup`                 | ~2 000         | `get_brand_report_rollup`            | `REFRESH MATERIALIZED VIEW CONCURRENTLY` — 30 s build, runs after each scrape cron |
| `mv_category_rollup`              | ~200           | `get_category_report_rollup`         | Same schedule                                                                      |
| `mv_price_rollup` (two-part UNION) | ~6 000         | `get_price_report_rollup`            | Same schedule. Actual selected rows will be at the 1000 PostgREST cap              |
| `mv_brand_distribution`           | ~2 000         | `get_brand_distribution_rollup`      | Same schedule — overlap with brand_rollup; could be a view, not an MV              |

**If MVs ship**, the RPC bodies collapse to `SELECT * FROM mv_... ORDER BY ... LIMIT ...` — single-digit-millisecond reads. The 5–11 s we see today moves to a single cron-driven refresh job. Acceptable because scrapers write at most every ~1 hr.

Risks:
- `CONCURRENTLY` refresh requires a unique index on the MV — trivial for brand rollups (unique on `lower(btrim(brand))`), needs a synthetic key for the price `UNION ALL` (use `(kind, lower(btrim(coalesce(category, ''))), lower(btrim(coalesce(brand, ''))))`).
- First-refresh-after-deploy takes the same 30 s as a regular scan. Kick it off manually after the migration.
- MV staleness is scrape-cadence-dependent (~1 hr). For the 4 reports this is fine; for any RPC that needs real-time data, keep the live function.

---

## Step 6 — Additional findings outside the original scope

- **Dashboard.tsx Phase-2 is the biggest un-migrated offender** (lines 298–367). It does the exact `.in([400 UUIDs])` chunked pattern that aaf9503 removed from Reports.tsx. It's the single largest source of Dashboard slowness. Port target: new RPC `get_market_brand_rollup(p_limit int default 8)` with the same server-side aggregation pattern.
- **DashboardMap's `menu_snapshots` query** (`src/components/maps/DashboardMap.tsx:77-80`) pulls 1200 × `product_data` JSONB rows (per-store snapshot product list). Wide rows + no selection-list narrowing. Better: use existing `get_latest_menu_snapshots_per_store` RPC if it returns narrower fields, or add a generated column `brands_jsonb` = `jsonb_path_query_array(product_data, '$[*].b')` indexed with GIN to let the map query brands-only in < 200 ms.
- **Reports → Gap range-loop** is not just slow, it's broken — the chunk times out at 3.1 s on anon and the loop never makes progress. Gap is effectively nonfunctional in prod. Fix with a SECURITY DEFINER RPC that returns `{ intel_store_id, brand_lowercased[] }` per store, server-aggregated.

---

## Ranked fix plan

### P0 — Indexes (apply today)

Lowest risk, highest return. No code changes. Ship as a single migration with `CREATE INDEX CONCURRENTLY` (outside a transaction).

```sql
-- Match the GROUP BY expression the new RPCs use.
CREATE INDEX CONCURRENTLY IF NOT EXISTS menu_items_brand_lookup_idx
  ON menu_items (lower(btrim(raw_brand)))
  WHERE is_on_menu = true AND raw_brand IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS menu_items_category_lookup_idx
  ON menu_items (lower(btrim(raw_category)))
  WHERE is_on_menu = true AND raw_category IS NOT NULL;

-- Covering index for the price-report brand_category arm.
CREATE INDEX CONCURRENTLY IF NOT EXISTS menu_items_brand_cat_price_idx
  ON menu_items (
    lower(btrim(raw_brand)),
    lower(btrim(raw_category))
  )
  INCLUDE (raw_price)
  WHERE is_on_menu = true
    AND raw_brand IS NOT NULL
    AND raw_category IS NOT NULL
    AND raw_price > 0;

ANALYZE menu_items;
```

Post-deploy verification: run each report RPC twice, confirm both are < 1 s. If still > 2 s, `EXPLAIN (ANALYZE, BUFFERS)` to see whether the planner picked up the expression index.

### P1 — Dashboard Phase-2 → RPC + four materialized views (this week)

1. New RPC `get_market_brand_rollup(p_limit int default 8)` that returns the top-N brands by store_count. Replaces the `.in([400 UUIDs])` chunk-reader in `src/pages/Dashboard.tsx:310-320`.
2. Convert the four Reports RPCs to read from `mv_*` materialized views, refreshed by an `after_scrape_batch` cron. Add a `refresh_report_rollups()` function + schedule in `supabase/migrations/20260420080000_phase_1j_stage_6_crons.sql` alongside the existing scrape crons.
3. Add a small UI affordance: the refresh job writes `reports_rollups_refreshed_at` to `normalization_stats_cache` (already a one-row config table); Reports shows "Updated X min ago" under the page header. Sets expectations for cadence.

### P2 — Reports → Gap RPC (this week)

Replace `src/pages/Reports.tsx:1268-1283` `.range()` loop with `get_store_brand_index()` RPC: returns `{ intel_store_id uuid, brand_set text[] }` per store. Aggregated server-side with the same `lower(btrim(raw_brand))` key. ~400 rows, 5-column output, sub-second.

### P3 — DashboardMap snapshot narrowing + pool tuning

- Narrow DashboardMap to pull only brands-per-store, not full `product_data`. Either reuse `get_latest_menu_snapshots_per_store` if it already exposes that, or add `get_map_pin_data(p_org_id uuid)` that returns `{intel_store_id, brand_set text[], snapshot_date}`.
- If pool utilization turns out to be a bottleneck after P0, bump pool size or migrate the Reports RPCs to session mode so one slow call doesn't block its pool slot.

---

## What to ship first

Given the severity (4+ min loads → users thinking the app is down), recommend **P0 + P1 together**:

- P0 (indexes) fixes the Reports RPCs immediately — those are the top complaint surface and the `get_brand_report_rollup` numbers are verifiable end-to-end.
- P1 (Dashboard RPC port + MVs) fixes the Dashboard map stall, which is the *other* top complaint.

P0 is a ~10-minute migration. P1 is ~2-3 hours. Both can land the same day.
