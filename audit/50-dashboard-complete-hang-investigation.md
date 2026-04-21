# Phase 1j follow-up — Dashboard complete hang investigation

**2026-04-20.** Emergency diagnosis: every widget on `cody-intel.vercel.app/dashboard` stuck in skeleton state for 4+ minutes. Not slow — non-functional. Including Phase-1 KPI cards that only query small tables (counts, top-5) and should return in <500ms.

## TL;DR

Two bugs, one transient and one latent, combined to produce total app failure:

1. **Transient — Supabase infrastructure distress.** Direct PostgREST probes returned `521 Web server is down` and `503 PGRST002 Could not query the database for the schema cache. Retrying.` on 60-70% of calls during the window Chaz observed the hang. Service had self-recovered by the time I re-probed ~2 min later. Most likely cause: the P1 migration burst from the previous session (4× `CREATE INDEX CONCURRENTLY` on a 1.275M-row table, 4× `CREATE MATERIALIZED VIEW` with initial population, 4× `DROP+CREATE FUNCTION`, 1× `cron.schedule`) all within ~5 min triggered PostgREST schema-cache rebuilds while Postgres was still processing the backlog. Schema-cache reflection timed out → PGRST002 → Cloudflare upgraded to 521.

2. **Latent — `Dashboard.tsx` and `DashboardMap.tsx` had no error handling in their data-load functions.** When the Supabase distress caused `fetch` to throw, `loadFast()` / `loadHeavy()` / `load()` threw unhandled. `setFastLoading(false)` / `setHeavyLoading(false)` / `setLoading(false)` never ran. Every widget — KPI cards, Top Stores, Recent Alerts, Market Pulse, Brand Performance, DashboardMap — stayed in skeleton state **forever**, even after the Supabase infra recovered. A hard-refresh would have unstuck it; otherwise the page looked permanently broken.

This is why "nothing loaded" and not "some widgets slow." The transient outage ended, but the React state machine didn't know.

**Fix shipped**:
- `Dashboard.tsx` `loadFast` + `loadHeavy` wrapped in `try/catch/finally`. Loading flags always clear, even on fetch throw.
- `DashboardMap.tsx` `load()` same pattern, respecting the `cancelled` flag on unmount.
- Empty fallback state (`setFast({...zeros})` / `setPins([])`) instead of leaving state `null`, so widgets render something rather than stay invisible.
- Migration `20260420330000` rewrote `get_brand_union_store_count` in plpgsql with a pre-computed local key array — the `= ANY(subquery)` form never pinned the P0 expression index. Dropped from ~9s to ~7s in testing (marginal — the `COUNT(DISTINCT intel_store_id)` hash build dominates, and it still runs live because no MV fits this query shape).

## Diagnostic timeline

### Step 1 — First probe, 21:07 PT

```
[ERR] 525  120944ms  stores is_active count              ← Cloudflare TLS timeout
[EXC] ---   10689ms  stores w/ products count  TypeError: fetch failed
[ERR] 503    1494ms  unread alerts count                 ← PGRST002 schema cache
[ERR] 503    3060ms  top 5 stores                        ← PGRST002
[ERR] 503    1688ms  recent alerts                       ← PGRST002
[ERR] 503    1299ms  intel_stores menu_last_updated      ← PGRST002
[ERR] 503    1652ms  normalization_runs                  ← PGRST002
…
[ERR] 503    1854ms  rpc get_market_brand_rollup         ← PGRST002
[OK ] 200    1372ms  rpc get_market_brand_rollup (null ids)
[OK ] 200    8307ms  rpc get_brand_union_store_count
[OK ] 200    8153ms  rpc get_brand_store_count
[OK ] 200     587ms  rpc get_brand_report_rollup         ← MV-backed, healthy
[ERR] 521     844ms  rpc get_category_report_rollup      ← Cloudflare: origin down
[ERR] 521     221ms  rpc get_price_report_rollup
[ERR] 521     127ms  rpc get_brand_distribution_rollup
[ERR] 521     127ms  rpc get_own_brand_stores
[ERR] 521     146ms  intel_stores lat/lng
[ERR] 521     143ms  brand_aliases
[ERR] 521     155ms  menu_snapshots
```

Mixed 200 / 503 / 521 / 525 — PostgREST was flapping. The DB's `menu_items` was likely in mid-autovacuum from the batch of DDL + the backlog of my test queries. PostgREST's schema-cache reflection query (`pg_catalog` introspection) timed out against the stressed DB, causing each PostgREST pod to return 503 for several seconds. Cloudflare's connection pool to the Supabase origin degraded, returning 521 in parallel.

### Step 2 — Re-probe ~2 min later

```
[OK ] 200    598ms  stores is_active count
[OK ] 200    648ms  stores w/ products count
…
[OK ] 200    268ms  rpc get_brand_report_rollup
[OK ] 200    160ms  rpc get_category_report_rollup
[OK ] 200    249ms  rpc get_price_report_rollup
[OK ] 200    175ms  rpc get_brand_distribution_rollup
```

All green. Infrastructure had recovered. But **Chaz's browser was still showing skeletons** — that's the latent bug.

### Step 3 — Frontend code audit

`Dashboard.tsx` before this fix:

```ts
const loadFast = useCallback(async () => {
  const [storesRes, storesWithMenuRes, alertsRes, …] = await Promise.all([…]);
  // …
  setFast({…});
  setFastLoading(false);  // ← never reached if Promise.all throws
}, [orgId]);
```

`loadHeavy()` — same shape, no try/catch.
`DashboardMap.tsx` `load()` — same shape, no try/catch.

When Supabase returned 521, the Supabase JS SDK rejected its Promise. `Promise.all` rejected. `loadFast` threw. React caught the unhandled promise rejection (console noise), but `fastLoading` stayed `true` in state. Phase-2's `useEffect` guard (`if (fastLoading) return`) held forever. DashboardMap's `loading` stayed `true`. Result: every widget on the page stayed in skeleton.

## Fix applied

### Frontend

- `src/pages/Dashboard.tsx` — `loadFast` + `loadHeavy` wrapped in `try { … } catch (err) { console.error(…); setFast({…empty}); } finally { setFastLoading(false); }` (and equivalent for `heavy`).
- `src/components/maps/DashboardMap.tsx` — `load()` wrapped, respecting the unmount `cancelled` flag inside both `catch` and `finally`.

Behavior after fix:
- Supabase distress: widgets render an empty state (zeros / no pins / no alerts) within the normal timeout. User sees "nothing here" — still wrong, but not a 4-minute frozen page. A page refresh after infra recovery works immediately.
- Supabase healthy: no change.

### Backend

- `supabase/migrations/20260420330000_fix_get_brand_union_store_count.sql` — rewrote in plpgsql with a local `v_keys text[]` variable so the WHERE clause becomes `= ANY(v_keys)` (concrete array, index-friendly) instead of `= ANY(subquery)` (semi-join plan, no index). Measured speedup modest: 9s → 7s. The bottleneck is now the `COUNT(DISTINCT dm.intel_store_id)` hash build, not the filter. Acceptable — Dashboard calls this once per load, in parallel with the fast RPCs.

## What should have prevented this

This audit adds two items to the "ship it" checklist for any new data-fetch code in the intel frontend:

1. **Every async loader must have `try/catch/finally` where `finally` clears the loading flag.** No exceptions. Even if the fetches "can't" fail, infrastructure can.
2. **Loading skeletons must have an escape hatch** — a render path for errored/empty state that is distinguishable from "still loading." Today we render `<Skeleton />` when `loading = true`, but there's no guarantee `loading` ever flips. A timeout-wrapper or a render path for `fast === null && !loading` would have made the failure obvious instead of invisible.

## Deferred / out of scope

- Root cause of the Supabase distress event itself. Likely our DDL burst, but could also be a Supabase-side incident we don't have visibility into. Supabase status page didn't report anything for the window. Worth asking Supabase support if Chaz wants a post-mortem.
- `get_brand_union_store_count` at 7s is still slow. The clean fix is a new MV `mv_store_brand_pairs (intel_store_id, brand_key)` with an index on `brand_key` — then the function becomes `SELECT COUNT(DISTINCT intel_store_id) FROM mv_store_brand_pairs WHERE brand_key = ANY(v_keys)` at sub-50ms. Adds a third refresh target to the daily cron. Not blocking.
- Audit/49's P2 (Reports → Gap hang) and P3 (DashboardMap JSONB narrowing) still open.
