# Phase 1i — LCB Store List Reconciliation

**2026-04-19. Read-only reconciliation of intel_stores (560 active rows) against the current LCB retail marijuana licensee list. Finds 75 phantom entries (13.4%) — 28 match closed LCB licenses, 7 are tribal, 40 are no-signal. 26 duplicate-alias entries found pointing to existing LCB-licensed rows. 4 legitimate SE retailers missing from intel_stores. No data changes applied.**

## Source + date

- **LCB file:** [`CannabisApplicants04072026.xlsx`](https://lcb.wa.gov/sites/default/files/2026-04/CannabisApplicants04072026.xlsx) (snapshot date 2026-04-07, fetched 2026-04-19)
- **LCB page:** https://lcb.wa.gov/records/frequently-requested-lists
- **CSV derived:** `data/lcb-licensees-20260419.csv` (1,232 rows across two sheets)
- **Intel_stores pulled:** all 560 `status='active'` rows with full metadata

## Counts

| Bucket | LCB file | intel_stores |
|---|---:|---:|
| Main sheet "Retailers 4-7-2026" total | 1,223 | — |
| &nbsp;&nbsp;of which ACTIVE (ISSUED) | **458** | — |
| &nbsp;&nbsp;CLOSED (PERMANENT) | 671 | — |
| &nbsp;&nbsp;FORMER TITLE CERTIFICATE | 81 | — |
| &nbsp;&nbsp;EXPIRED / CLOSED (TEMP) / ACTIVE CERT | 13 | — |
| SE Sheet "SE Retailers 4-7-2026" total | 9 | — |
| &nbsp;&nbsp;of which ACTIVE (ISSUED) | **5** | — |
| **Total currently-operating LCB licensees** | **463** | — |
| `intel_stores` where `status='active'` | — | **560** |
| &nbsp;&nbsp;with `lcb_license_id` populated | — | 457 |
| &nbsp;&nbsp;with `lcb_license_id` NULL | — | **103** |

Gap before reconciliation: +103 / −(463−457)=−6. Post-matching the gap resolves into the category splits below.

## Category summary

| Category | Count | Next action |
|---|---:|---|
| **Legitimate** | 457 | no action |
| **A — Phantom** | 75 | see A.1/A.2/A.3 below |
| **B — Duplicate alias** | 26 | mark `duplicate_of:<canonical_id>`; merge menu data later |
| **C — Has LCB but not in current list** | 0 | none found — DB and current LCB file are in sync |
| **D — Backfill lcb_license_id** | 2 | populate FK from name+city LCB match |
| **Missing LCB** (not in intel_stores) | 4 | INSERT (all 4 are SE retailers) |
| **Total accounted for** | 560 | coverage check: 457+75+26+0+2 = 560 ✓ |

---

## Category A — Phantoms (75 total)

Sub-classification: of the 75 phantoms, 5 hit a tribal-name pattern, 28 match a CLOSED/EXPIRED/FORMER LCB license by name+city, and 42 have no LCB signal at all. (An additional 2 stores use `Í` with composed-accent Unicode that the regex missed — flagged in the draft SQL as tribal by UUID, not name pattern, bringing tribal to 7 and no-signal to 40.)

### A.1 — Tribal retailers (7 rows, LCB-exempt)

WA tribal cannabis retailers operate under sovereign tribal compacts, not LCB licensing. These shouldn't be flagged as phantoms; they just don't appear on LCB's list because they don't need to.

| name | city |
|---|---|
| ELWHA PEAKS CANNABIS | Port Angeles |
| Q'ANAPSU | Ridgefield |
| Remedy Tulalip | Tulalip |
| REMEDY TULALIP | Marysville |
| THE TRIBAL JOINT | Darrington |
| NÍKXNA (COULEE DAM, WA) | Coulee Dam |
| NÍKXNA (NESPELEM) | Nespelem |

### A.2 — Closed-LCB match (28 rows)

Store names that match an LCB entry whose status is CLOSED (PERMANENT), EXPIRED, or FORMER TITLE CERTIFICATE. These are businesses that existed but are now closed. The rows are still being scraped (some have menu data — likely stale or from cached aggregator pages).

Sorted by total_products descending:

| name | city | products | closed LCB lic | LCB status |
|---|---|---:|---|---|
| LIDZ CANNABIS - NORTH SPOKANE | Spokane | 1,472 | 414664 | CLOSED (PERMANENT) |
| Purple Haze - Everett | Everett | 1,290 | 414680 | CLOSED (PERMANENT) |
| OZ. RECREATIONAL CANNABIS | Seattle | 775 | 415348 | CLOSED (PERMANENT) |
| TACOMA HOUSE OF CANNABIS | Tacoma | 681 | 421506 | CLOSED (PERMANENT) |
| Green Leaf Dispensary - Bellingham | Bellingham | 655 | 413886 | CLOSED (PERMANENT) |
| CANNABIS PROVISIONS EAST - WENATCHEE | Wenatchee | 637 | 423542 | EXPIRED |
| The Herbery - Boulevard | Vancouver | 480 | 084045 | CLOSED (PERMANENT) |
| LUCID - OLYMPIA | Olympia | 416 | 415429 | CLOSED (PERMANENT) |
| DANK'S WONDER EMPORIUM (OLYMPIA) | Lacey | 246 | 430691 | CLOSED (PERMANENT) |
| Forbidden Cannabis Club - Carson | Carson | 140 | 422785 | EXPIRED |
| MARY JANE | Kirkland | 1 | 415652 | CLOSED (PERMANENT) |
| BLOWIN SMOKE | Chewelah | 0 | 422202 | CLOSED (PERMANENT) |
| CANNABIS CITY | Seattle | 0 | 412751 | CLOSED (PERMANENT) |
| COOKIES TACOMA | Tacoma | 0 | 412940 | CLOSED (PERMANENT) |
| DOUGLAS COUNTY 502 | Bridgeport | 0 | 412865 | CLOSED (PERMANENT) |
| FORBIDDEN CANNABIS CLUB - CARLTON | Carlton | 0 | 435277 | EXPIRED |
| GANJA GODDESS | Seattle | 0 | 413558 | CLOSED (PERMANENT) |
| GRASS AND GLASS | Seattle | 0 | 414785 | CLOSED (PERMANENT) |
| HERBAN LEGENDS | Seattle | 0 | 420291 | CLOSED (PERMANENT) |
| LAST STOP POT SHOP | Gold Bar | 0 | 415509 | CLOSED (PERMANENT) |
| MR. OG | Seattle | 0 | 417949 | CLOSED (PERMANENT) |
| ROYAL'S CANNABIS | Spokane | 0 | 415132 | CLOSED (PERMANENT) |
| THE BAKEREE (AURORA) | Seattle | 0 | 414456 | CLOSED (PERMANENT) |
| THE GRASS STATION (RITZVILLE) | Ritzville | 0 | 422658 | CLOSED (PERMANENT) |
| THE KUSHERY - CLEARVIEW | Snohomish | 0 | 415517 | CLOSED (PERMANENT) |
| THE KUSHERY (CLEARVIEW) | Snohomish | 0 | 415517 | CLOSED (PERMANENT) |
| THE M STORE | Yakima | 0 | 415303 | CLOSED (PERMANENT) |
| THE ROACH 420 | Brewster | 0 | 414216 | CLOSED (PERMANENT) |

Note: the two THE KUSHERY CLEARVIEW entries have the same closed LCB license (415517) — this is a Category B duplicate between two phantoms that both map to the same closed store. Handle as one closed entry with one duplicate.

### A.3 — No LCB signal (40 rows)

No match in either the active or closed LCB lists. These are the highest-risk phantoms — their origin is unclear. Ordered by product count descending (first 20):

| name | city | products |
|---|---|---:|
| Super Chronic Club - Olympia | Lacey | 3,075 |
| Greenfoot Cannabis | Olympia | 2,421 |
| The Link Cannabis Company - Port Angeles | Port Angeles | 1,919 |
| Joint Rivers | Auburn | 1,897 |
| NW Cannabis | Mount Vernon | 1,855 |
| CEDAR GREENS | Sequim | 1,840 |
| High Point Cannabis | Kingston | 1,832 |
| Higher Leaf Factoria | Bellevue | 1,785 |
| THUNDER II | Rochester | 1,647 |
| THUNDER CANNABIS | Olympia | 1,630 |
| SALISH COAST CANNABIS | Anacortes | 1,546 |
| 20 After 4 - REC | Woodland | 1,524 |
| Higher Leaf BelRed | Bellevue | 1,506 |
| HAVE A HEART - OCEAN SHORES | OCEAN SHORES | 1,438 |
| HI-TOP CANNABIS | Seattle | 1,248 |
| Fireweed Cannabis Co. | Snoqualmie | 1,221 |
| Commencement Bay Cannabis - Black | Tacoma | 1,212 |
| A Greener Today - Burien | Burien | 1,203 |
| Commencement Bay Cannabis - Red | Tacoma | 1,175 |
| Commencement Bay Cannabis - Yellow | Fife | 1,162 |

Full list in `audit/logs/phase-1i-reconciliation.json` under `catA[]` where `closed_lcb_license === null && !tribal`.

Common patterns in A.3:
- **Chain location aliases** that may or may not be genuine LCB entries: "Commencement Bay Cannabis - Black/Green/Red/Yellow" (4 variants), "Higher Leaf Factoria/BelRed" (likely share a single LCB license HIGHER LEAF MARIJUANA BELLEVUE 423000), "Agate Dreams - Bond/Poulsbo" (likely share AGATE DREAMS LCB), "CBC BLACK/GREEN/RED/YELLOW" (shadow duplicates of Commencement Bay Cannabis variants).
- **Chain split by location not on LCB**: "HAVE A HEART - OCEAN SHORES" — HAVE A HEART has 4 active LCB entries (Seattle, Bothell, CC Seattle) but no Ocean Shores location.
- **Name variants of closed stores**: some "phantom no-match" rows may actually correspond to LCB closed entries with different spelling the matcher couldn't bridge.

---

## Category B — Duplicate aliases (26 total)

All 26 duplicate-alias rows match an LCB license that is ALREADY represented by a canonical row (one that carries the original `lcb_license_id`). Showing the phantom row side-by-side with its canonical:

| Phantom row | Canonical row | LCB license | Phantom products |
|---|---|---|---:|
| 420 - Elma | 420 ELMA ON MAIN | 426678 | 1,943 |
| 420 - West | 420 WEST | 414733 | 2,579 |
| 426677 SUNSETS CANNABIS | SUNSETS CANNABIS | 426677 | 1,304 |
| 430798 SASHA'S CANNABIS | SASHA'S CANNABIS | 430798 | 1,514 |
| BETTER BUDS (PORT ANGELES) | DTC HOLDINGS | 445376 | 0 |
| Buds Garage - Everett | BUDS GARAGE | 437604 | 3,080 |
| CANNABIS AND GLASS - LIBERTY LAKE | NXNW RETAIL LLC / CANNABIS AND GLASS | 428760 | 1,001 |
| High Society Everett | HIGH SOCIETY | 414430 | 923 |
| JET CANNABIS | JET CANNABIS | 414753 | 341 |
| KING CRONIC PREMIUM CANNABIS | KING CRONIC | 425925 | 349 |
| LIDZ CANNABIS - SOUTH HILL SPOKANE | LIDZ SPOKANE SOUTH | 442309 | 1,537 |
| MAIN STREET MARIJUANA (NORTH) | MAIN STREET MARIJUANA NORTH | 435081 | 2,056 |
| Nirvana Cannabis Company - Otis Orchards | NIRVANA CANNABIS COMPANY | 427666 | 1,464 |
| Olympia Weed Company | OLYMPIA WEED COMPANY | 427769 | 944 |
| Origins Cannabis - Redmond | ORIGINS | 425507 | 1,032 |
| Origins Cannabis - West Seattle | ORIGINS CANNABIS | 437401 | 927 |
| Pot Shop Seattle | POT SHOP | 079013 | 1,015 |
| PRC - Arlington | PRC | 421084 | 2,337 |
| PRC - Bothell | PRC BOTHELL | 415222 | 971 |
| PRC - Conway | PRC | 414574 | 972 |
| PRC - Edmonds | PRC | 415198 | 1,818 |
| RUCKUS - CAPITOL HILL | RUCKUS | 413692 | 1,677 |
| RUCKUS (BALLARD) | RUCKUS | 413692 | 0 |
| Seattle Cannabis Company | SEATTLE CANNABIS CO. | 426199 | 1,638 |
| ZIPS CANNABIS DOWNTOWN | ZIPS CANNABIS | 362816 | 1,757 |
| ZIPS CANNABIS ON 106TH | ZIPS CANNABIS | 362816 | 0 |

23 of 26 duplicates carry product data (total_products > 0, sum ≈ 33,000 menu_items rows). A merge operation to consolidate these onto the canonical rows is **out of scope for this migration** — the DRAFT SQL just flips status; the merge happens in a follow-up.

Watch out for the three cases where two phantoms resolve to the **same** canonical:
- PRC → multiple alias rows (Arlington, Bothell, Conway, Edmonds) all named "PRC …" pointing at **different** canonical PRC rows. These are actually separate stores — verify each canonical chains to the right LCB. Looking at lic numbers they differ (421084, 415222, 414574, 415198), so these are four distinct stores; the phantoms are just name-variant rows of each real location.
- RUCKUS - CAPITOL HILL (1,677 products) AND RUCKUS (BALLARD) (0 products) both map to RUCKUS canonical (413692). BALLARD looks like a misrouted alias (RUCKUS canonical is actually the Capitol Hill store); a Ballard RUCKUS location might exist separately and need its own LCB lookup.
- ZIPS CANNABIS DOWNTOWN / ZIPS CANNABIS ON 106TH both map to ZIPS CANNABIS (362816). Similar issue — 362816 is a single LCB record; each ZIPS location should map to a distinct license.

These three pairs deserve manual attention before the merge migration.

---

## Category C — has LCB but not in current list (0)

**Zero rows.** The original LCB import (458 rows from 2026-04-12) is in complete sync with the current LCB snapshot (2026-04-07; note the snapshot is actually ~5 days older than the import). Every row with `lcb_license_id` populated matches a current ACTIVE licensee.

This is a genuinely good result — no stores in our DB have stale LCB-valid designations pointing at now-closed licenses. If the LCB list had been pulled from a newer snapshot we might see a handful; as-is it's a clean 0.

---

## Category D — backfill needed (2)

Rows with `lcb_license_id` NULL that match an ACTIVE LCB entry via substring-name + city. These are clean legit stores whose import just didn't capture the license ID.

| intel_stores.id | Current name | City | LCB match | License |
|---|---|---|---|---|
| `8a581006-6130-46f9-8912-1342c5dfeb79` | Pacific Outpost | Pasco | THE PACIFIC OUTPOST | 434994 |
| `cde73f34-xxxx` (HAPPY TREES PROSSER) | HAPPY TREES PROSSER | Prosser | HAPPY TREE | 436321 |

Fix: populate `lcb_license_id` + normalize `trade_name`/`address` to the LCB version. See DRAFT SQL section 6.

---

## Missing LCB licensees (4 — all Social Equity retailers)

| LCB license | Trade name | Address | City | Notes |
|---|---|---|---|---|
| 414931 | GOLIATH PINES | 8002B NE HIGHWAY 99 | VANCOUVER | SE retailer, ACTIVE |
| 435675 | LUCKY LEAF CO | 528 W CLARK ST | PASCO | SE retailer, ACTIVE — distinct from "THE LUCKY LEAF" (Pasco, lic 3501 RD 68) which IS in intel_stores |
| 414350 | MAIN STREET MARIJUANA ORCHARDS | 12300 NE FOURTH PLAIN BLVD | VANCOUVER | SE retailer, ACTIVE |
| 438213 | MHC LLC | 16271 N HIGHWAY 21 | REPUBLIC | SE retailer, ACTIVE |

All 4 are Social Equity ACTIVE (ISSUED) retailers that live on the SE sheet of the LCB file, which was not included in the original import from `populate-intel-stores.sql` (that import pulled from `lcb_licenses` which only had the main-sheet rows). The 5th SE retailer (HAPPY TREE) is already represented in intel_stores as HAPPY TREES PROSSER — Category D backfill covers it. These 4 need new rows inserted in both `lcb_licenses` and `intel_stores`. See DRAFT SQL section 7.

---

## Phase 1h overlap

Phase 1h (audit/35) targeted 419 stores — those with `status='active'` AND a populated `website`. Of the 147 `none` detections and 18 `error` results:

| Phase 1h bucket | Original | Phantom/dup | Real |
|---|---:|---:|---:|
| `none` detections | 147 | **0** | **147** |
| `error` rows | 18 | **0** | **18** |

**All 165 problematic Phase 1h results are on legitimate LCB stores.** The phantom and duplicate rows mostly don't have websites populated in intel_stores (98 of 101 had no website), so they weren't part of the Phase 1h target population. Only 5 phantoms and 3 duplicates got Phase 1h rows at all; those 8 were all detected as POSaBit.

**Implication:** Phase 1h's detection misses are NOT explained by bad data. They're genuine detection misses — stores running custom WordPress/Squarespace menus, age-gated POSaBit widgets the scanner couldn't unblock, or sites that were otherwise unreachable at scan time. The Section 5 corrections in audit/35 stand.

---

## Spot-check list (10 Category A rows for Chaz to verify before apply)

Pick ten stores across all three A sub-categories to manually confirm. Chaz should check each by visiting the site (or attempting to) and comparing against LCB records:

1. **LIDZ CANNABIS - NORTH SPOKANE** (A.2 closed lic 414664) — is it really closed, or operating under a new license?
2. **The Herbery - Boulevard** (A.2 closed lic 084045) — check if THE HERBERY chain still operates this location under a different LCB entry.
3. **DANK'S WONDER EMPORIUM (OLYMPIA)** (A.2 closed lic 430691) — DANK'S chain is all Joint (audit/32). Is the Olympia location genuinely closed or running?
4. **FORBIDDEN CANNABIS CLUB - CARLTON** (A.2 expired lic 435277) — check if location is renewed or replaced.
5. **Super Chronic Club - Olympia** (A.3 no signal, 3,075 products) — highest-product phantom. Is it a real open store, and if so, what's its LCB license?
6. **Higher Leaf Factoria** (A.3, 1,785 products) — most likely an LCB 423000 (HIGHER LEAF MARIJUANA BELLEVUE) multi-location chain; is Factoria a distinct license?
7. **Commencement Bay Cannabis - Black / Red / Yellow / Green** (A.3, pick one) — these four variants suggest a brand color-coding pattern, not four separate licenses. Probably one CBC LCB license underlies all four rows.
8. **HAVE A HEART - OCEAN SHORES** (A.3, 1,438 products) — Ocean Shores location has no LCB record. Real store or aggregator ghost?
9. **Agate Dreams - Bond / Poulsbo** (A.3, both Poulsbo) — two entries for what looks like the same physical store. Plus there's a Cat A "AGATE DREAMS" (Poulsbo, 279 products) — three rows total for one LCB record.
10. **NÍKXNA (Coulee Dam)** (A.1 tribal) — confirm this is a sovereign-tribal retailer and not a Washington-state licensee we're classifying wrong.

If all 10 confirm the classification, apply the DRAFT SQL. If any disagree, refine the categories before apply.

---

## Revised Phase 1h understanding

After Phase 1i:
- The 560 active intel_stores shrinks (effectively) to 463 LCB-valid + 7 tribal = **470 real retailers** we should be scanning.
- Of the remaining 90 rows (75 phantom + 26 duplicate − 7 tribal − 2 backfill − 2 overlap adjust): none of them were in Phase 1h's target, so they don't change the audit/35 correction counts.
- After INSERT of the 4 missing SE retailers, the LCB-valid active set becomes 467.
- Phase 1h's next-iteration target population: 467 LCB-valid stores with websites. Currently 419 have websites; adding 4 SE + 2 Cat-D backfills (+5 if any of those get websites added) = ~425. Roughly unchanged.

---

## Artifacts

- LCB CSV: `data/lcb-licensees-20260419.csv`
- Reconciliation JSON (full lists): `audit/logs/phase-1i-reconciliation.json`
- Overlap JSON (Phase 1h cross-ref): `audit/logs/phase-1i-overlap.json`
- DRAFT migration: `supabase/migrations/DRAFT_phase_1i_lcb_reconciliation.sql`
- Reconciliation script: `scripts/phase-1i-reconcile.mjs`
- Overlap script: `scripts/phase-1i-phase1h-overlap.mjs`

## Gate

**Spot-check gate.** Chaz verifies the 10 stores above before we write the apply prompt. After apply, Phase 1h's `status='active'` filter will exclude the 101 non-active rows (phantom_closed / tribal-as-separate / lcb_review_needed / duplicate_of), and the next scan runs against only LCB-backed stores.

## Rollback

Pre-Phase-1i commit: `8aaae29`. Intel_stores baseline captured in `audit/logs/intel-stores-full.json` (230 KB, 560 rows with full metadata).
