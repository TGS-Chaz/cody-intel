# Phase 1j Sub-stage A — Pass 2 Rescan of Gap + Regressed Stores

**2026-04-20. Re-ran Pass 2 against the 30 Stage-4 Pass-2-gap stores + 11 stores regressed vs Phase 1h (41 unique after dedup). Used `waitMs=60000` (2.4× the Stage 4 default), concurrency 3, client timeout 140 s, `retryEmpty=false` to stay under the edge function's 150 s IDLE_TIMEOUT budget. Results: 2 recoveries, 37 still `none`, 2 errors. Both recoveries applied to `intel_stores_v2.designated_scraper`.**

## Run parameters

| Setting | Value |
|---|---|
| Run ID (shared with Stage 4) | `ec3b40a1-3ae0-48a3-a361-962e0ab82baf` |
| target | `v2` |
| `waitMs` | 60000 (up from Stage 4's 25000) |
| `retryEmpty` | false (would double per-store budget) |
| Client abort | 140 000 ms |
| Concurrency | 3 |
| Wall time | 1652 s (27.5 min) |

## Target list (41 unique)

Derived via `scripts/phase-1j-substage-a-build-targets.mjs`:
- **30 gap** — Pass 1 returned `none` or `posabit_hint`, no Pass 2 row written under run `ec3b40a1…` (timeouts / process death during Stage 4).
- **17 "regressed" raw** per audit/40 Section 3 — but only **11** survived when joined via the proper `stage_5_store_mapping` bridge. The other 6 were name-match artifacts (DTC HOLDINGS Port Angeles v1-row vs 3 new Silverdale/Port Hadlock/Chimacum v2-rows; HASHTAG CANNABIS variant mismatches). Those don't represent real regressions.
- **Dedupe:** 0 overlap between gap + regressed buckets in this run. 30 + 11 = 41.

## Results

### Recovered (2 / 41 = 4.9%)

| v2 row | Previous verdict | New verdict | LCB lic | Notes |
|---|---|---|---|---|
| NATURAL GREEN (Davenport) | Stage 4 **error** | **dutchie** | 421687 | 60s waitMs let the Dutchie embed hydrate where Stage 4's Puppeteer had timed out on `naturalgreencannabis.store`. |
| THE STASH BOX (Auburn) | Stage 4 **none** | **jane** | 412494 | 60s waitMs let the Jane iframe load through an age gate / slow render. |

Both applied to `intel_stores_v2` via migration `20260419200000_phase_1j_substage_a_apply.sql`. The `v2_notes` field now carries a line tagged "Sub-stage A 2026-04-20: rescan with waitMs=60000 recovered platform=…".

### Still `none` (37 / 41 = 90%)

29 gap stores + 8 of the 11 regressed stores returned `none` even with 60s waitMs. Sample:

| Bucket | v2 row | Website |
|---|---|---|
| gap | APEX SPOKANE | https://www.apexcannabis.com/locations/division/ |
| gap | CINDER | https://cindersmoke.com/ |
| gap | GREEN LADY HAWKS PRAIRIE | https://greenladymj.com/locations/hawks-prairie/ |
| gap | HOUSE OF CANNABIS - TWISP | https://twisp.hoc420.com/ |
| gap | LUX POT SHOP × 2 (`.com/` + `.com/locations/`) | https://luxpotshop.com/ |
| gap | THE VAULT | https://cannabisshop.com/stores/... |
| gap | ZIPS CANNABIS | https://www.zipscannabis.com/puyallup-176th |
| regressed | HASHTAG CANNABIS (Redmond) | https://seattlehashtag.com/ — was `jane` in Phase 1h |
| regressed | POT SHOP (Seattle) | https://www.potshopseattle.co/ — was `jane` in Phase 1h |
| regressed | MARY MART INC (Tacoma) | https://www.marymart.com/ — was `jane` in Phase 1h |
| regressed | POT ZONE (Port Orchard) | https://www.potzone420.com/... — was `jane` in Phase 1h |
| regressed | THE FIRE HOUSE (Ellensburg) | https://www.firehousenw.com/ — was `jane` in Phase 1h |

Full list in `audit/logs/phase-1j-substage-a-analysis.json`.

Pattern in the "regressed from Jane" subset: 5 of 8 Phase-1h-jane regressions on Jane-embed sites that didn't re-detect. This may be a **Jane-embed selector change** that the scanner's current Jane regex no longer matches — worth a separate Phase 1k scanner fix. The stores' websites are still working (they served to Pass 1 + Pass 2), just not recognized.

### Still `error` (2 / 41)

| v2 row | Website | Notes |
|---|---|---|
| THE REEF (Seattle) | https://www.thereefstores.com/ | Puppeteer still hit a navigation/page-closed error even at 60s |
| NIRVANA CANNABIS COMPANY (Otis Orchards) | https://nirvanacannabis.company/ | Same error pattern as Stage 4 |

## Interpretation

Going from `waitMs=25000` to `waitMs=60000` recovered 2 / 41 targets. That's a 4.9% recovery rate — modest but real. The other 39 weren't helped by additional render time because:
- Most gap stores are aggregator-referral URLs (cannabisshop.com, lookyweed.com, nationwidedispensaries.com, ganjatrack.com) that don't embed the actual store's menu — they're directory pages.
- The 5 Phase-1h-jane regressions likely need a scanner fix, not longer waits.
- 2 errors are stable Puppeteer / site issues (framework incompatibility).

The "stubborn 39" would need different interventions to convert:
- For aggregator URLs: update the store's `website` to the real store domain (Stage 3-style manual pick).
- For the Jane regressions: investigate Jane's current embed syntax — the Phase 1h detection may have relied on markup that no longer exists.
- For the errors: either fix the Puppeteer nav path or accept these as permanently undetectable.

## Designations after Sub-stage A

| Platform | Stage 4 | Sub-stage A delta | Now |
|---|---:|---:|---:|
| Dutchie | 75 | +1 | 76 |
| Jane | 78 | +1 | 79 |
| Leafly | 44 | 0 | 44 |
| POSaBit | 63 | 0 | 63 |
| Joint | 19 | 0 | 19 |
| Weedmaps | 1 | 0 | 1 |
| **Total designated** | 280 | +2 | **282** |

## Flagged for Stage 6 or Phase 1k

1. **Jane-embed regression pattern (5 stores)** — Phase 1h detected these as jane but Stage 4 + Sub-stage A both returned none. Warrants a scanner look: seattlehashtag.com, potshopseattle.co, marymart.com, potzone420.com, firehousenw.com. A quick human visit would confirm whether Jane widget is actually still there.

2. **Aggregator-referral websites (~15 gap stores)** — stores whose `website` field in v2 points at a third-party directory page rather than the store's actual website. These will never yield a platform detection. Option: flag them in v2_notes for Chaz to supply the real site in a future Stage-3-style pass, OR accept them as `none` and set `has_online_menu=false`.

3. **2 persistent errors** — THE REEF + NIRVANA CANNABIS COMPANY. Browser nav issues that didn't resolve with longer waitMs. Candidates for a manual F12 audit at swap time.

## Artifacts

- Target builder: `scripts/phase-1j-substage-a-build-targets.mjs`
- Rescan runner: `scripts/phase-1j-substage-a-rescan.mjs`
- Analyzer: `scripts/phase-1j-substage-a-analyze.mjs`
- Apply migration: `supabase/migrations/20260419200000_phase_1j_substage_a_apply.sql`
- Target list: `audit/logs/phase-1j-substage-a-targets.json`
- Analysis: `audit/logs/phase-1j-substage-a-analysis.json`

## Gate

No gate. Sub-stage A recovered 2 designations — small but net positive. Remaining 37 `none` + 2 `error` stay as-is until a future pass (scanner fix for Jane, aggregator-URL audit, or manual F12).
