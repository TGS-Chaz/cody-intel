# Phase 1j Sub-stage C — Refreshed-Detector Rescan of Stage 4 `none` Bucket

**2026-04-20. Rescanned all 144 Stage-4 `none` stores with the refreshed Jane detector from Sub-stage B (and refreshed Pass 2 widget patterns). 10 recoveries: 7 Jane, 2 POSaBit, 1 Dutchie. 132 still `none`, 2 still `error`. Total v2 designated: 286 → 296.**

## Run parameters

| Setting | Value |
|---|---|
| Run ID (shared with Stage 4) | `ec3b40a1-3ae0-48a3-a361-962e0ab82baf` |
| target | `v2` |
| waitMs | 40000 (between Stage 4's 25s and Sub-stage A's 60s) |
| retryEmpty | false |
| Client abort | 140 000 ms |
| Concurrency | 3 |
| Wall time | 4368 s (72 min) |
| Errors | 0 script-level (2 store-level `error` verdicts) |

## Target scope

144 v2 rows where:
- `is_active = true`
- `website IS NOT NULL`
- `designated_scraper IS NULL`
- Best-available Stage 4 verdict = `none` (or `no_pv_row`)

The 15 Stage 4 `error`-verdict rows were excluded from this run (flagged for a future sub-stage — some may benefit from a retry, but a bulk rescan is the wrong lever).

## Recoveries (10)

### Jane (7)

Confirms Sub-stage B's hypothesis that `tags.cnna.io/jane.*.js` is widespread across WA stores, not just the 5 originally flagged:

| Store | Website |
|---|---|
| KALEAFA (Oak Harbor) | https://kaleafa.com/wa/oak-harbor-cannabis-dispensary/ |
| THE GREEN NUGGET (Spokane) × 2 | https://thegreennugget.com/ |
| THE HERBERY (Vancouver) × 4 | https://www.theherberynw.com/ |

The ×2 and ×4 duplicates are different LCB licenses at the same chain (THE GREEN NUGGET Spokane has two Spokane locations; THE HERBERY is a 4-location Vancouver chain all pointing to the main thebherberynw.com site).

### POSaBit (2)

Both were in Sub-stage A's "regressed" list (Phase 1h detected POSaBit, Stage 4 errored). The refreshed detector didn't specifically target POSaBit — but these were transient errors that cleared with a retry + 40s waitMs:

| Store | Website | Phase 1h → Sub-stage C |
|---|---|---|
| HAVE A HEART (Seattle) | https://haveaheartcc.com/dispensaries/wa/belltown/ | posabit → error → **posabit** ✓ |
| NATURE'S GIFTS (Sequim) | https://naturesgifts420.com/ | posabit → error → **posabit** ✓ |

### Dutchie (1)

Also a Sub-stage A regression recovery:

| Store | Website | Phase 1h → Sub-stage C |
|---|---|---|
| HAVE A HEART (Bothell) | https://haveaheartcc.com/dispensaries/wa/bothell/ | dutchie → error → **dutchie** ✓ |

## Still failing (134)

- **132 still `none`** — genuinely have no platform embed detectable by the scanner. These fall into two buckets per audit/42 Section "Flagged":
  - Aggregator-referral websites (cannabisshop.com, lookyweed.com, nationwidedispensaries.com, wheresweed.com directory pages that don't host the store's actual menu). No platform detection is possible no matter what detector we use.
  - Real store sites running custom / WordPress-native / Squarespace menus not on any platform we detect. These are genuinely `has_online_menu=false` or on an unknown platform.
- **2 still `error`** — THE REEF (Seattle) + NIRVANA CANNABIS COMPANY (Otis Orchards). Persistent Puppeteer nav errors, same as Sub-stage A. Candidates for manual F12 at swap time.

Neither bucket warrants another automated pass. Next action is a Chaz-managed manual audit or a Phase 1k scanner upgrade that handles aggregator-referral URL resolution.

## Platform distribution — before / after

| Platform | Stage 4 | +Sub-A | +Sub-B | +Sub-C | Now |
|---|---:|---:|---:|---:|---:|
| **Jane** | 78 | +1 | +5 | **+7** | **91** |
| Dutchie | 75 | +1 | 0 | +1 | **77** |
| POSaBit | 63 | 0 | 0 | +2 | **65** |
| Leafly | 44 | 0 | 0 | 0 | 44 |
| Joint | 19 | 0 | 0 | 0 | 18* |
| Weedmaps | 1 | 0 | 0 | 0 | 1 |
| **Total designated** | 280 | +2 | +5 | +10 | **296** |

\* Joint net −1 due to CRAFT LEAVENWORTH hard-deactivation (commit `ed4ee76`) — orthogonal to this substage but appears in the running total.

### Context — what's still undesignated

Out of 470 v2 rows total:
- **296 designated** (63%) — ready for Stage 6 scraper re-enablement
- **170 undesignated** (36%) — breakdown:
  - **132 `none` verdict** — passed through the scanner but no platform detected; most are genuine native-menu or aggregator-URL cases
  - **17 `error` verdict** — Stage 4 or Sub-stage A browser errors; 2 still persistent after Sub-stage C
  - **21 no-website rows** — tribal (7) + SE (5) + Cat 4 unresolved (9)

## Jane detector refresh has paid off

Across Sub-stages A + B + C, the refreshed Jane detector recovered **13 Jane stores** that Stage 4 missed entirely. That's +16% on top of Stage 4's original 78 Jane detections. The `tags.cnna.io` migration had been running wide across the WA dispensary population before our scan; Sub-stage A missing them had nothing to do with waitMs and everything to do with the stale domain regex.

**Corollary for Phase 1k:** similar audits on the other platform detectors (Dutchie, Leafly, POSaBit, Weedmaps) should sample a few stores each and confirm their detector regex is still current. Migration to a CDN / domain change is common for SaaS ecommerce; our detectors will age.

## Artifacts

- Target builder: `scripts/phase-1j-substage-c-build-targets.mjs`
- Rescan runner: `scripts/phase-1j-substage-c-rescan.mjs`
- Analyzer: `scripts/phase-1j-substage-c-analyze.mjs`
- Apply migration: `supabase/migrations/20260420050000_phase_1j_substage_c_apply.sql`
- Targets: `audit/logs/phase-1j-substage-c-targets.json`
- Results: `audit/logs/phase-1j-substage-c-results.json`
- Run log: `/tmp/substage-c.log` (inside VPS container; not persisted to repo)

## Gate

No gate. 10 net recoveries applied; Stage 6 target population increased from 287 to 296 designated stores.

Rollback: `fcac9e4` (Sub-stage B).

---

## Stage 6 — Pre-Swap Schema Audit

**2026-04-20, pre-swap.** Grepped `src/**/*.{ts,tsx}` for patterns that may break when `intel_stores_v2` becomes `intel_stores` post-swap. Findings only — fixes tracked separately post-swap.

### Risk: HIGH — ScraperAdmin unmatched view license-number map

**Location:** `src/pages/ScraperAdmin.tsx` lines 537–544 + 1182 + 1209

```ts
supabase.from("lcb_licenses").select("id, license_number")
// …
for (const r of (licensesRes.data ?? [])) {
  if (r.id && r.license_number) lmap[r.id] = r.license_number;
}
setLicenseMap(lmap);
// …
const licNum = s.lcb_license_id ? licenseMap[s.lcb_license_id] : null;
```

In v1, `intel_stores.lcb_license_id` was a UUID that matched `lcb_licenses.id`, so `licenseMap[s.lcb_license_id]` returned the human-readable license number.

Post-swap, `intel_stores.lcb_license_id` is already the **text license number directly**. The lookup `licenseMap[s.lcb_license_id]` will miss (map is keyed on UUIDs, query key is text), returning `null` for every row — the unmatched-matching UI will show "LCB #(null)" instead of the real license number.

**Fix after swap:** drop the `licenseMap` indirection; use `s.lcb_license_id` directly as the license number.

### Risk: MEDIUM — is_active not honored

No source file filters intel_stores queries by `is_active = true`. The CRAFT Leavenworth row (1 of 470, only v2 inactive) has `status='active'` still, so it will appear in `status=eq.active` filtered views — notably:
- `Dashboard.tsx` lines 254, 256: store counts + leaderboard include it
- `Reports.tsx` lines 338, 339: city aggregation + active-store count include it
- `ScraperAdmin.tsx` lines 279, 528: scraper target lists include it
- `StoreDirectory.tsx`: if it filters active, same issue

**Impact is bounded — 1 row, and its `designated_scraper` is NULL so nothing scrapes it.** Dashboard KPIs will be ±1 store until the filter is added.

**Fix after swap:** append `.eq("is_active", true)` to the 6 queries that currently filter `status="active"`. Or update the filter to `.eq("status", "active").eq("is_active", true)` everywhere.

### Risk: LOW — total_products / has_online_menu null handling

`total_products` and `has_online_menu` are nullable on v2 (Stage 1 relaxed NOT NULL since those values are unknown until first scrape). Checked every reference:

- `Dashboard.tsx` line 254: `.not("total_products", "is", null).gt("total_products", 0)` — defensively excludes null ✓
- `Dashboard.tsx` line 668: `store.total_products?.toLocaleString() ?? "—"` — handles null ✓
- `Reports.tsx` lines 336, 338, 339, 1010, 1012: all filter `.gt("total_products", 0)` which silently excludes nulls ✓
- `Reports.tsx` line 1031, 1079, 1138, 1227, 1254: all access with `?? 0` fallback ✓
- `reports/CustomReportBuilder.tsx` line 156, 164: types allow `number | null`, uses `?? 0` ✓

**No fix needed.** Existing null-guards are sufficient.

### Risk: LOW — lcb_license_id display in StoreDetail

`src/pages/StoreDetail.tsx` line 312:
```tsx
{store.lcb_license_id ? ` · LCB #${store.lcb_license_id}` : ""}
```

In v1 this rendered `LCB #7dad8a8f-108f-4ee1-b91d-680e9e4966f0` (ugly UUID). Post-swap it renders `LCB #415470` (actual license number). **This is a cosmetic improvement, not a break.**

### Risk: LOW — new v2 columns referenced nowhere in UI

No source file references `ubi`, `license_status`, `source_of_truth`, `website_verified`, `website_association_source`, `v2_notes`, `platform_detection_confidence`, `platform_detected_at`, `is_active`, `deactivated_reason`, `deactivated_at` (except the Stage3Review page that explicitly targets intel_stores_v2). Dashboard ignores them, which is fine.

### Risk: NONE — v1-only columns

v2 schema is a superset of v1 (v2 was created `LIKE intel_stores INCLUDING DEFAULTS`, then extra columns added). No v1 column is missing from v2. Every v1 column reference in the UI will resolve cleanly post-swap.

### Summary table

| Risk | Location | Post-swap action |
|---|---|---|
| HIGH | `ScraperAdmin.tsx` unmatched-view licenseMap | Drop the lookup; use `lcb_license_id` directly |
| MEDIUM | 6 queries filter by `status='active'` but not `is_active` | Add `.eq("is_active", true)` — affects 1 row today |
| LOW | `total_products` / `has_online_menu` nulls | Already handled defensively; no change |
| LOW | UUID-format LCB ID in StoreDetail header | Auto-improves (shows number) |

All 4 items land in a single post-swap follow-up commit. Nothing in this list is severe enough to block the swap itself.
