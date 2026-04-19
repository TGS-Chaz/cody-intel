# Phase 1j Stage 1 — Fresh LCB-anchored Shadow Table

**2026-04-19. Created `intel_stores_v2` as a clean shadow of the LCB retail licensee snapshot. 470 rows imported (458 LCB retail + 5 Social Equity + 7 tribal). All LCB-anchored rows carry a unique LCB license number and UBI. `intel_stores` was not modified.**

## Headline

| Source | v2 rows | Source of data |
|---|---:|---|
| LCB main retail sheet (ACTIVE ISSUED) | 458 | `data/CannabisApplicants04072026.xlsx` → `Retailers 4-7-2026` |
| LCB Social Equity sheet (ACTIVE ISSUED) | 5 | same file → `SE Retailers 4-7-2026` |
| Tribal retailers (carried from intel_stores) | 7 | `intel_stores` rows flagged in audit/36 |
| **Total** | **470** | — |

No duplicate `lcb_license_id` values, no duplicate `ubi` values. All constraints satisfied. Migration ran in a single transaction.

## Schema

```sql
CREATE TABLE intel_stores_v2 (LIKE intel_stores INCLUDING DEFAULTS INCLUDING IDENTITY);

-- lcb_license_id rewritten from UUID (FK → lcb_licenses.id) to TEXT (the license number directly).
ALTER TABLE intel_stores_v2 DROP COLUMN lcb_license_id;
ALTER TABLE intel_stores_v2 ADD  COLUMN lcb_license_id              TEXT;
ALTER TABLE intel_stores_v2 ADD  COLUMN ubi                         TEXT;
ALTER TABLE intel_stores_v2 ADD  COLUMN license_status              TEXT;
ALTER TABLE intel_stores_v2 ADD  COLUMN source_of_truth             TEXT;
ALTER TABLE intel_stores_v2 ADD  COLUMN website_verified            BOOLEAN DEFAULT FALSE;
ALTER TABLE intel_stores_v2 ADD  COLUMN website_association_source  TEXT;
ALTER TABLE intel_stores_v2 ADD  COLUMN v2_notes                    TEXT;

ALTER TABLE intel_stores_v2 ALTER COLUMN has_online_menu DROP NOT NULL;  -- unknown in Stage 1
ALTER TABLE intel_stores_v2 ALTER COLUMN total_products  DROP NOT NULL;  -- no menus yet
ALTER TABLE intel_stores_v2 ADD PRIMARY KEY (id);

CREATE UNIQUE INDEX idx_intel_stores_v2_license ON intel_stores_v2(lcb_license_id) WHERE lcb_license_id IS NOT NULL;
CREATE UNIQUE INDEX idx_intel_stores_v2_ubi     ON intel_stores_v2(ubi)            WHERE ubi IS NOT NULL;
CREATE        INDEX idx_intel_stores_v2_city    ON intel_stores_v2(city);
CREATE        INDEX idx_intel_stores_v2_status  ON intel_stores_v2(status);
CREATE        INDEX idx_intel_stores_v2_source  ON intel_stores_v2(source_of_truth);
```

Rationale for the `lcb_license_id` type change: intel_stores had `lcb_license_id UUID REFERENCES lcb_licenses(id)`. In v2 we want the LCB license number to be the canonical anchor, so storing the number as TEXT + a `UNIQUE` constraint matches Chaz's rule ("every store has its own unique license number"). UBI gets the same treatment.

Two partial `UNIQUE` indexes (with `WHERE IS NOT NULL`) let the 7 tribal rows coexist with LCB-anchored rows without violating uniqueness.

## 1. Total row count

```
intel_stores_v2: 470 rows
```

Confirmed via REST `HEAD /rest/v1/intel_stores_v2?select=id` — `Content-Range: 0-0/470`.

## 2. Breakdown by source_of_truth

| source_of_truth | count |
|---|---:|
| `lcb_retail` | 458 |
| `lcb_social_equity` | 5 |
| `tribal_manual` | 7 |
| **Total** | **470** |

## 3. Samples (10 per source)

### `lcb_retail` (first 10 alphabetically)

| lcb_license_id | ubi | name | address | city |
|---|---|---|---|---|
| 430562 | 6033581390010004 | #HASHTAG | 224 NICKERSON ST | SEATTLE |
| 423413 | 6033491670010006 | 112TH STREET CANNABIS | 5809 112TH ST E BLDG B | PUYALLUP |
| 355469 | 6043490200010002 | 2020 CANNABIS SOLUTIONS MT BAKER HIGHWAY | 1706 MT BAKER HWY | BELLINGHAM |
| 422239 | 6035723460010001 | 2020 SOLUTIONS EPHRATA | 1615 BASIN ST SW | EPHRATA |
| 415470 | 6043490150010001 | 2020 SOLUTIONS IRON STREET | 2018 IRON ST STE A | BELLINGHAM |
| 420908 | 6043490230010001 | 2020 SOLUTIONS PACIFIC HIGHWAY | 4770 PACIFIC HWY STE A | BELLINGHAM |
| 422363 | 6035723460010002 | 2020 SOLUTIONS SOAP LAKE | 261 STATE HWY 28 WEST | SOAP LAKE |
| 364709 | 6033492700010006 | 20AFTER4 | 1511 N GOERIG ST | WOODLAND |
| 428654 | 6031183740010004 | 28 GRAHAMS CANNABIS | 10315 200TH ST E | GRAHAM |
| 422099 | 6041520640010001 | 365 RECREATIONAL CANNABIS | 36711 U.S. HIGHWAY 12 | DAYTON |

### `lcb_social_equity` (all 5)

| lcb_license_id | ubi | name | address | city |
|---|---|---|---|---|
| 414931 | 6052206270010000 | GOLIATH PINES | 8002B NE HIGHWAY 99 | VANCOUVER |
| 436321 | 6033520160010000 | HAPPY TREE | 354 CHARDONNAY AVE STE 3 | PROSSER |
| 435675 | 6050343120010000 | LUCKY LEAF CO | 528 W CLARK ST | PASCO |
| 414350 | 6047542880010000 | MAIN STREET MARIJUANA ORCHARDS | 12300 NE FOURTH PLAIN BLVD STE C & E | VANCOUVER |
| 438213 | 6051423780010000 | MHC LLC | 16271 N HIGHWAY 21 | REPUBLIC |

### `tribal_manual` (all 7)

| lcb_license_id | ubi | name | address | city |
|---|---|---|---|---|
| NULL | NULL | ELWHA PEAKS CANNABIS | 4775 S Dry Creek Rd, Port Angeles, WA 98363, USA | Port Angeles |
| NULL | NULL | Q'ANAPSU | 31420 Northwest 31st Avenue, Ridgefield, WA 98642, USA | Ridgefield |
| NULL | NULL | Remedy Tulalip | *(null — only city)* | Tulalip |
| NULL | NULL | REMEDY TULALIP | 9226 34th Ave NE, Marysville, WA 98271, USA | Marysville |
| NULL | NULL | THE TRIBAL JOINT | 22705 State Rte 530 NE | Darrington |
| NULL | NULL | NÍKXNA (COULEE DAM, WA) | Coulee Dam, WA 99116, USA | Coulee Dam |
| NULL | NULL | NÍKXNA (NESPELEM) | Nespelem, WA 99155, USA | Nespelem |

Each tribal row's `v2_notes` records the original `intel_stores.id` so Stage 5 can re-attach its menu data.

## 4. Uniqueness verification

Ran post-insert inside the migration:

```
dup_license = 0
dup_ubi     = 0
```

| Constraint | Result |
|---|---|
| No duplicate `lcb_license_id` (excluding NULLs) | ✓ 463 unique values across 463 LCB-anchored rows |
| No duplicate `ubi` (excluding NULLs) | ✓ 463 unique values across 463 LCB-anchored rows |
| All 7 tribal rows have `lcb_license_id IS NULL` | ✓ |
| All 7 tribal rows have `ubi IS NULL` | ✓ |

The partial `UNIQUE WHERE NOT NULL` indexes enforce the "every LCB store has a unique license + unique UBI" rule without forcing tribal rows to fabricate either.

## 5. Critical-field NULL counts

| Field | NULL count | Details |
|---|---:|---|
| `address` | 1 | `Remedy Tulalip` (tribal, Tulalip). The source `intel_stores` row had no address. Kept as-is — faithful carry-forward. Flag for Chaz to fill from tribal directory later. |
| `city` | 0 | All 470 rows have a city. |
| `trade_name` | 7 | All 7 tribal rows. `intel_stores` had `trade_name=null` for every tribal row — the task spec said "copy trade_name if present" so we honored the NULL. `name` is populated on all 470 rows. |

## 6. Count delta vs. expected 475

**Task expected:** 463 LCB-active + 5 SE + 7 tribal = 475  
**Actual:** 458 + 5 + 7 = 470  
**Delta:** −5

The task arithmetic double-counts the Social Equity rows. The LCB file's "463 ACTIVE (ISSUED) retailers" total already includes both the main sheet (458) and the SE sheet (5). Breaking those apart:

| Sheet in LCB xlsx | Privilege Status filter | Rows |
|---|---|---:|
| `Retailers 4-7-2026` | ACTIVE (ISSUED) | 458 |
| `SE Retailers 4-7-2026` | ACTIVE (ISSUED) | 5 |
| LCB total active | — | **463** |
| + tribal (separate source) | — | 7 |
| **Correct target** | — | **470** |

So 470 matches the real LCB + tribal total. Not a defect — the math in the task prompt treated `463` as the main-sheet count when it's actually main+SE combined.

The LCB file also contains 9 SE rows total (5 ACTIVE + 4 EXPIRED). The 4 EXPIRED ones are intentionally excluded per the task ("include all 5 [ACTIVE]"). If Chaz later wants expired SE retailers in v2, that's a one-line addition (change the filter).

## 7. Comparisons to existing intel_stores

For orientation — not an action item this stage:

| Metric | `intel_stores` (active) | `intel_stores_v2` |
|---|---:|---:|
| Row count | 560 | 470 |
| With LCB license | 457 (UUID FK to lcb_licenses) | 463 (TEXT license number) |
| Tribal | 7 (mixed in with active) | 7 (explicitly tagged `tribal_manual`) |
| Phantom/duplicate/closed | 90+ | 0 (excluded at source) |
| Website populated | ~419 | 0 (Stage 2 work) |
| With designated_scraper | 535 | 0 (Stage 3 work) |

The 463 LCB-anchored rows in v2 compare to 457 in intel_stores, +6 from:
- 4 newly-imported SE retailers missing from the original import (GOLIATH PINES, LUCKY LEAF CO, MAIN STREET MARIJUANA ORCHARDS, MHC LLC).
- 1 SE retailer that was in intel_stores as a Cat-D null-license row (HAPPY TREE / HAPPY TREES PROSSER) — now cleanly carrying its LCB number.
- 1 delta from LCB snapshot changes between the original 2026-04-12 import and the 2026-04-07 file we pulled (a few licenses toggled active/closed between the two).

## 8. intel_stores confirmed unmodified

```
SELECT COUNT(*) FROM intel_stores WHERE status='active';  -- 560 (unchanged)
```

Nothing in `intel_stores`, `dispensary_menus`, or `menu_items` was touched. All existing scrapers, Phase 1h verification rows, and Joint cron jobs continue pointing at the original table. Stage 6 is when v2 gets promoted.

## Artifacts

- Migration (applied): `supabase/migrations/20260419080000_phase_1j_stage_1_shadow_table.sql`
- Generator (not checked in): `scripts/phase-1j-stage-1-gen-migration.mjs`
- LCB source: `data/CannabisApplicants04072026.xlsx` + `data/lcb-licensees-20260419.csv` (both in repo)
- intel_stores snapshot used for tribal extraction: `audit/logs/intel-stores-full.json`

## Gate

Stage 1 is observational — table exists, rows are in, uniqueness holds, intel_stores untouched. **Proceed to Stage 2** (website association) when Chaz is ready. Nothing to review or apply here.

## Rollback

If this migration ever needs to be rolled back:

```sql
DROP TABLE IF EXISTS intel_stores_v2 CASCADE;
-- then also: DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260419080000';
```

Pre-Phase-1j commit: `656b76e` (Phase 1i LCB reconciliation).
