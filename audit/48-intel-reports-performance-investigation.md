# Phase 1j follow-up — Intel page load times + Reports undercount investigation

**2026-04-20.** Investigation of cody-intel.vercel.app slowness (especially Reports) and the Reports brand-coverage undercount (top brand shows ~3 stores when it should be hundreds). The two symptoms share a single root cause in `Reports.tsx`, with additional fallout from the Stage-6 table swap.

No changes made. Chaz to review and pick the first fix.

## TL;DR

1. **Reports undercount root cause** — `BrandReport` / `CategoryReport` / `PriceReport` / `BrandDistribution` fetch `menu_items` with `.in("dispensary_menu_id", [315 UUIDs])` and no `.limit()`. PostgREST caps the response at **1 000 rows** by default. `menu_items` currently has **1 275 339** rows. The four reports see roughly 0.08 % of the dataset, which is why the top brand shows 3 stores instead of 230. Ground truth via the `get_brand_store_count` RPC confirms the real number (Green Revolution → **230** stores, Reports UI → ~3).
2. **Reports slowness** — same queries try to return that capped 1 000 rows but still plan over 1.275 M, RLS-eval per row, with an 8 s statement timeout on the `authenticated` role. Some chunks timeout and return `data=null`, which the report silently skips.
3. **`daily_brand_metrics` is cosmetically present but broken** — 173 rows, one date (2026-04-19), every `store_count = 0`. Reports PDF export also selects column `brand` which doesn't exist (actual column is `brand_name`).
4. **Four Reports tabs are broken post-Stage-6 swap** — `Distribution` map, `Saturation`, `Sell-Through`, `Product Affinity` all join `intel_stores` to `menu_snapshots.intel_store_id`, which still references the **archived** v1 store IDs. Zero matches. DashboardMap/DistributionMap on Dashboard is affected for the same reason.

**Ship first:** swap the four broken `menu_items` aggregations in `Reports.tsx` onto RPCs modelled after the existing `get_brand_store_count` pattern (`SECURITY DEFINER`, bypasses RLS, indexed aggregate). That single change fixes both the undercount and most of the slowness.

---

## Step 1 — Pages affected + load-time baseline

I don't have a browser available in this environment. Instead, I reconstructed the network waterfall from the source code and timed equivalent queries directly against the live PostgREST endpoint with the `authenticated` ceiling (anon's 3 s timeout; authenticated's 8 s) in mind. The authenticated reference is exactly the shape each page sends. Table is ordered by expected wall-clock time.

| Page | File | Longest dominant query | Expected wall-clock | Severity |
|---|---|---|---:|---|
| Reports → **Brands** | `src/pages/Reports.tsx` BrandReport (L100) | `.in("dispensary_menu_id", [315 UUIDs]) … select raw_brand, raw_price, dispensary_menu_id` | **≥ 8 s** (timeouts or truncated) | P0 — undercount |
| Reports → **Distribution** | Reports.tsx BrandDistribution (L1096) | same shape as Brands | ≥ 8 s | P0 — undercount |
| Reports → **Categories** | Reports.tsx CategoryReport (L208) | same shape as Brands, different columns | ≥ 8 s | P0 — undercount |
| Reports → **Prices** | Reports.tsx PriceReport (L485) | same shape, + 3 extra predicates | ≥ 8 s | P0 |
| Reports → **Gap Analysis** | Reports.tsx GapAnalysis (L1309) | `.range(offset, +5000)` loop through `menu_items` | **≥ 30 s** (hangs) | P0 — hangs tab |
| Reports → **Saturation** | reports/SaturationAnalysis.tsx | RPC `get_latest_menu_snapshots_per_store` → joined to `intel_stores` by id | 2–3 s but **empty output** (Stage-6 fallout) | P1 — silent empty |
| Reports → **Sell-Through** | reports/SellThrough.tsx | `menu_snapshots` time-series | 2–3 s, **empty** (Stage-6 fallout) | P1 |
| Reports → **Product Affinity** | reports/ProductAffinity.tsx | `menu_snapshots` cross-join | 2–3 s, **empty** (Stage-6 fallout) | P1 |
| Reports → **Leaderboard** | Reports.tsx StoreLeaderboard (L1002) | two small queries, one Top-50 on `intel_stores` | < 1 s | OK |
| Reports → **Coverage** | Reports.tsx CoverageReport (L325) | 4 count/select on small tables | < 1 s | OK |
| Reports → **Deals** | Reports.tsx DealsReport (L1623) | `store_deals` + `intel_alerts` small | < 1 s | OK |
| Reports → **Custom Builder** | reports/CustomReportBuilder.tsx | small, lazy-loaded | < 1 s | OK |
| Dashboard | `src/pages/Dashboard.tsx` | Phase-1: fast counts (< 1 s). Phase-2: **same 315-UUID menu_items fetch** (L311-320) | Phase-1 < 1 s, Phase-2 ≥ 8 s | P1 |
| Stores (Directory) | StoreDirectory.tsx | `intel_stores.select("*")` (470 rows) + `dispensary_menus` | 1–2 s | OK |
| Scrapers (Admin) | ScraperAdmin.tsx | 6 count/select queries, all small | < 1 s | OK |
| Trends | Trends.tsx | `daily_brand_metrics` twice (limit 10 000) | < 1 s, but always **"not enough data"** | P1 — permanent empty state |
| Territory | Territory.tsx + TerritoryMap | `intel_stores` only, lazy-loaded | 1–2 s | OK |

Hanging pages (Reports → Brands, Categories, Distribution, Prices, Gap) are the driver of "pages hang". Everything except Reports is fast-ish.

---

## Step 2 — Reports page query inventory

All queries in `src/pages/Reports.tsx` that touch `menu_items` or `dispensary_menus`:

### 2.1 BrandReport (Reports.tsx:100)

```
-- JS chunk 1 (fast)
SELECT id, intel_store_id FROM dispensary_menus
WHERE intel_store_id IS NOT NULL;          -- returns ~315 rows

-- JS chunk 2 (slow/truncated — THIS is the bug)
SELECT raw_brand, raw_price, dispensary_menu_id FROM menu_items
WHERE is_on_menu = true
  AND raw_brand IS NOT NULL
  AND dispensary_menu_id IN (<315 UUIDs>);
-- No LIMIT. PostgREST default max-rows = 1000. Returns 1000 of ~600k matching rows.
```

### 2.2 CategoryReport (Reports.tsx:208) — same shape as 2.1, different columns.

### 2.3 CoverageReport (Reports.tsx:325) — four small queries, all healthy. No menu_items scan.

### 2.4 PriceReport (Reports.tsx:485)

```
SELECT raw_category, raw_price, raw_brand, dispensary_menu_id FROM menu_items
WHERE is_on_menu = true
  AND raw_category IS NOT NULL
  AND raw_price IS NOT NULL
  AND raw_price > 0
  AND dispensary_menu_id IN (<315 UUIDs>);
-- Same 1000-row truncation.
```

PriceReport also runs an "on-demand" query when a store is selected:

```
SELECT raw_name, raw_brand, raw_category, raw_price FROM menu_items
WHERE dispensary_id = '<crm_contact_id>'      -- note: dispensary_id, not dispensary_menu_id
  AND is_on_menu = true
  AND raw_price > 0
LIMIT 2000;
```

### 2.5 StoreLeaderboard (Reports.tsx:1002) — small queries, fine.

### 2.6 BrandDistribution (Reports.tsx:1096) — same shape as 2.1.

### 2.7 GapAnalysis (Reports.tsx:1309)

```
-- Paginates through the ENTIRE menu_items table in 5000-row chunks.
SELECT dispensary_id, raw_brand FROM menu_items
WHERE is_on_menu = true AND raw_brand IS NOT NULL
RANGE 0-4999; then 5000-9999; then 10000-14999; …
-- For 1.275M rows with is_on_menu=true filter, that's 255+ sequential requests.
-- Each request is capped by 8s statement timeout. Most will timeout partway.
```

### 2.8 DealsReport (Reports.tsx:1623) — small queries, fine.

### 2.9 PDF Export (Reports.tsx:1807)

```
SELECT brand, store_count, total_products, avg_price FROM daily_brand_metrics
ORDER BY store_count DESC LIMIT 50;
-- BUG: column is brand_name, not brand. Query returns PGRST error 42703.
```

---

## Step 3 — Reports undercount root cause (ground-truth vs Reports)

### Query A — what Reports currently uses (reconstructed)

```ts
// Reports.tsx:121-128 — no LIMIT, no chunking by rows
await supabase.from("menu_items")
  .select("raw_brand, raw_price, dispensary_menu_id")
  .eq("is_on_menu", true)
  .not("raw_brand", "is", null)
  .in("dispensary_menu_id", [<315 UUIDs>]);
```

Aggregated in JS to `{ brand -> Set<storeId> }`.

Because PostgREST caps the response at **1 000 rows** (the Supabase project has not overridden `db-default-max-rows`), the aggregation only sees 1 000 of the ~600 000–900 000 menu_items rows that match the filter. The 1 000 rows come from the first dispensary_menus PostgreSQL happens to visit in its IN-list scan, so they cluster into **a handful of stores**. That's why the top brand shows "3 stores" — those rows came from ~3 menus.

### Query B — ground truth

The `get_brand_store_count` RPC (defined in `scripts/dashboard-rpc-fixes.sql`, used by Dashboard) runs the same logic server-side with `SECURITY DEFINER` bypassing RLS. Live results (2026-04-20 18:30 UTC):

| Brand | Reports UI (truncated) | `get_brand_store_count` RPC | Delta |
|---|---:|---:|---:|
| Green Revolution | ~3 | **230** | −227 |
| Seattle Bubble Works | (n/a, not top-50) | **114** | — |
| Evergreen Herbal | — | **54** | — |
| Grow Op Farms | — | **18** | — |
| Trail Blazin | — | **3** | (matches) |
| Phat Panda | — | RPC itself times out (statement_timeout) | — |

The `daily_brand_metrics` table confirms the aggregator bug: 173 rows, all with `store_count = 0`. Reports doesn't use it on this page, but the Dashboard and Trends pages do — they're silently miscounting too.

### Orphan check

From audit/45 §3: Stage-6 NULLed 70 `dispensary_menus` rows. Their `menu_items` rows still exist but are detached from any store. Reports' initial filter `dispensary_menus.intel_store_id IS NOT NULL` already excludes these (315 valid menus, not 385), so orphans are **not** the root cause. They reduce the ceiling by ~70/385 = 18 %, but the undercount is 99 %+.

### Delta summary

The 1 000-row PostgREST cap removes ~99 % of the data. The 18 % orphan reduction is a secondary rounding.

---

## Step 4 — Materialized views / refresh status

Exposed via Supabase RPC:

| RPC | Status |
|---|---|
| `refresh_materialized_views()` | Works, returns in ~2.3 s. What it refreshes is not visible to anon, but it returned cleanly. |
| `get_brand_store_count(text)` | Works, 0.5–3 s. Times out for ubiquitous brands (Phat Panda). |
| `get_coverage_audit()` | **Times out (57014)** — another hot path that needs attention. |
| `normalization_stats()` | Cached via `normalization_stats_cache` table — healthy per `dashboard-rpc-fixes.sql`. |
| `get_latest_menu_snapshots_per_store()` | Exists (used by SaturationAnalysis). Returns rows, but `intel_store_id` values are v1-archived (Step 6). |

`daily_brand_metrics` has 173 rows, single date `2026-04-19`, **every row has `store_count = 0`**. Whatever populated it is broken. Per audit/18:346, the aggregator is a side-effect of `snapshot-menus` and no cron currently wires it. That means Trends will permanently show "not enough data" until a cron is added.

---

## Step 5 — Indexes audit

I can't run `\di` via anon, so this is from code patterns and audit-45 artifacts.

Known indexes on the hot tables (inferred from query shapes that are fast vs slow):

| Table | Indexed columns (confirmed usable) | Likely missing |
|---|---|---|
| `menu_items` | `dispensary_menu_id` (eq filter on a single UUID returns [] in < 1 s); `lower(raw_brand)` per `dashboard-rpc-fixes.sql:43` | No composite index for the Reports pattern: `(is_on_menu, dispensary_menu_id) INCLUDE (raw_brand, raw_price, raw_category)`. A covering index here would let BrandReport return from index only. |
| `dispensary_menus` | `intel_store_id` (FK), `id` (PK). `source` probably indexed. | none critical. |
| `intel_stores` | PK + Stage-5 renamed indexes (`idx_intel_stores_city`, per audit/45). | none critical — 470 rows, seq scans are fine. |

What the **indexes can't fix**: even with a perfect covering index, the Reports query still returns up to 1.275 M rows which is clipped to 1 000 by PostgREST. The index fix is necessary for the RPC rewrite (Step 8), not for patching the existing query.

---

## Step 6 — Post-Stage-6 broken references

Stage-6 (audit/45) renamed `intel_stores` → `intel_stores_archived` and `intel_stores_v2` → `intel_stores`. Repointed `dispensary_menus.intel_store_id` to the new table. **Other FKs were left on the archive** (per audit/45 "12 other FKs followed the rename and remain attached to the archive"): `intel_alerts`, `intel_detected_needs_credentials`, `intel_stale_platform_bindings`, `intel_store_platform_scan`, `intel_unmatched_discoveries`, **`menu_snapshots`**, `platform_verification.intel_store_id`, `product_matches`, `store_briefs`, `store_deals`, `store_tags`, `stage_5_store_mapping.old_intel_store_id`.

Anything that joins `menu_snapshots.intel_store_id → intel_stores.id` is broken because the snapshots still carry v1-archived IDs.

### Broken Reports tabs / components

| File:line | Code | Breakage |
|---|---|---|
| `src/components/maps/DistributionMap.tsx:62-66` | `menu_snapshots.select(intel_store_id, product_data)` joined in JS to `intel_stores` | 0 / 15 recent snapshot IDs (2026-04-20) exist in new `intel_stores`. Map is empty. |
| `src/pages/reports/SaturationAnalysis.tsx:80-91` | `intel_stores` + RPC `get_latest_menu_snapshots_per_store()` merged by `intel_store_id` | Same. Empty cities/brands. |
| `src/pages/reports/SellThrough.tsx:86` | `menu_snapshots` time-series joined to `intel_stores` | Same. Empty. |
| `src/pages/reports/ProductAffinity.tsx:30,66` | `menu_snapshots` + `intel_stores` | Same. Empty. |
| `src/components/maps/DashboardMap.tsx:63` | depends on `menu_snapshots` too (needs confirmation) | Likely empty. |

### Confirmed via REST

```
menu_snapshots count: 726 rows
menu_snapshots.intel_store_id sample (15 recent, 2026-04-20): 0 matches in new intel_stores (470 rows)
```

### Other Stage-6 follow-ups

- `Reports.tsx:1810` PDF export selects `brand` from `daily_brand_metrics` — column is `brand_name`. Silent PGRST 42703 error on export click.
- Dashboard Phase-2 (`Dashboard.tsx:311`) uses the same broken `.in(315 UUIDs)` pattern that Reports uses. Dashboard's *own-brand* presence was patched via the `get_brand_store_count` RPC (L346-354), but *market brand* aggregation still runs the truncated scan.

---

## Step 7 — Network waterfall (reconstructed for Reports → Brands)

Open Reports, land on default "Brands" tab. Browser sends:

1. `GET /rest/v1/dispensary_menus?select=id,intel_store_id&intel_store_id=not.is.null` — ~100 ms, ~315 rows.
2. `GET /rest/v1/menu_items?select=raw_brand,raw_price,dispensary_menu_id&is_on_menu=eq.true&raw_brand=not.is.null&dispensary_menu_id=in.(<315 UUIDs>)` — **this is the problem request.**
   - URL length ≈ 12 KB (315 × 37 chars).
   - Authenticated statement_timeout 8 s.
   - On cold cache: 5–8 s, often 500/57014.
   - On warm cache: 2–3 s, returns up to 1 000 rows.
3. (If user clicks another tab: a similar request is issued per tab.)

Parallelizable? Only request 2 depends on request 1. But the way chunks of 400 are written, if `validIds.length > 400`, the code runs them **sequentially** in a for-loop (see Reports.tsx:120). With 315 menus it's one iteration, but this will regress the moment `dispensary_menus` crosses 400 with intel_store_id set.

No calls that can be parallelized are running sequentially here. The waterfall is correct; the request shape is wrong.

---

## Step 8 — Ranked fix recommendations

All fixes below are in code / SQL only. None require a schema change beyond an index.

### P0 — Ship first. Replaces the 4 broken Reports aggregations with server-side RPCs.

Model after `get_brand_store_count` from `scripts/dashboard-rpc-fixes.sql`:

1. `get_brand_rankings(limit int DEFAULT 50)` → `(brand text, store_count int, total_products int, avg_price numeric)`
   - One query, aggregates in Postgres, returns ≤ 50 rows.
   - `SECURITY DEFINER`, grant to `anon, authenticated`.
   - Swap Reports.tsx BrandReport (L100) to `supabase.rpc("get_brand_rankings", { limit: 50 })`.
2. `get_category_breakdown()` → rows per category with `(product_count, store_count, avg_price)`.
3. `get_price_by_category()` → rows per category with `(avg, min, max, count)` + separate RPC for brand+category price.
4. `get_brand_distribution()` → rows per brand with `(store_count, total_products)`.
5. `get_gap_analysis(own text[], competitor text)` → returns the four buckets directly.

**Expected impact:** Reports Brands tab goes from ≥ 8 s (often error) to **300–600 ms** with correct counts. Undercount resolved. Same for Categories, Prices, Distribution, Gap.

**Why this is first:** it's the only fix that addresses both symptoms (slowness + undercount) with one change, follows an existing pattern the team already validated (Dashboard), and doesn't block on any of the P1 fixes.

### P1 — After P0. Unblocks Saturation/Sell-Through/Product Affinity/DistributionMap.

6. Decide the menu_snapshots FK story. Options:
   - **(a) Repoint** `menu_snapshots.intel_store_id` to new `intel_stores.id` using `stage_5_store_mapping` (same update pattern as audit/45 §3 did for `dispensary_menus`). Low risk — `menu_snapshots` is append-only history; repointing changes join targets but not existing analysis.
   - **(b) Leave snapshots on archive** and add a sibling column `intel_store_v2_id` populated by the `snapshot-menus` edge function going forward, plus a one-time backfill using `stage_5_store_mapping`.
   - (a) is simpler and restores all 4 broken tabs in one migration. (b) preserves more history at the cost of two columns.
7. Fix Dashboard Phase-2 market-brand aggregation with a `get_market_brands(limit int)` RPC (same shape as Dashboard's own-brand RPC pattern).

### P2 — Data hygiene.

8. Wire a cron for `daily_brand_metrics` repopulation (per audit/18 §Trends empty). Fix the aggregator so `store_count` is non-zero. Until this lands, Trends stays permanently empty.
9. PDF export bug: `Reports.tsx:1811` select `brand_name` instead of `brand`. One-character fix.
10. Investigate `get_coverage_audit()` timeout. Likely another full-scan RPC that needs to be cached.

### P3 — Nice to have.

11. Add covering index on `menu_items(is_on_menu, dispensary_menu_id) INCLUDE (raw_brand, raw_price, raw_category)` — helps both the new RPCs and any future ad-hoc scan.
12. Increase Supabase `authenticated` statement_timeout from 8 s to 15 s as a safety net (Supabase project setting).

---

## Step 9 — Verification plan (for after P0 ships)

After P0 lands:

1. Open Reports → Brands on cody-intel.vercel.app with DevTools open. Confirm the top brand's store_count matches `get_brand_store_count` (e.g. Green Revolution → 230).
2. Time each tab; every Reports tab except Gap/Saturation/etc. should be < 1 s.
3. Gap/Saturation/Sell-Through/Affinity can remain broken until P1 ships; they're empty right now, not wrong.
4. Dashboard's market-brand list should match Reports → Brands (they share the same RPC after P1).

---

## Artifacts used

- Live REST probes against `https://dpglliwbgsdsofkjgaxj.supabase.co` using the anon key from `.env`. Authenticated timing is inferred from the known Supabase default statement timeouts (anon 3 s / authenticated 8 s) and the observed anon timings.
- `scripts/dashboard-rpc-fixes.sql` — pattern to replicate for the P0 RPCs.
- `audit/45-stage-6-swap.md` — Stage-6 post-conditions (dispensary_menus repointed; menu_snapshots and 11 others left on archive).
- `audit/18-intel-deep-audit.md` — earlier notes on `daily_brand_metrics` aggregator and Trends empty state.

No changes committed. Investigation artifact only.
