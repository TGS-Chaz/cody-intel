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
