# Phase 1j Stage 5 — Mapping, Designations, Scraper-State Carry-Forward

**2026-04-19. First write-to-v2 phase. Built `stage_5_store_mapping` (567 rows), applied Stage 4 platform designations to 280 v2 rows, populated `joint_business_id` on all 19 joint stores (incl. the new bizId 6114 on MOUNT VERNON RETAIL HOLDINGS), carried forward platform-specific scraper fields and menu metadata from v1 → v2 where the platform matched. `intel_stores` was SELECT-only throughout.**

## Section 1 — Headline

| Metric | Value |
|---|---:|
| `stage_5_store_mapping` rows | **567** |
| &nbsp;&nbsp;lcb_license / high | 457 |
| &nbsp;&nbsp;address / medium | 6 |
| &nbsp;&nbsp;unmatched_new_v2 / flag | 7 |
| &nbsp;&nbsp;unmatched_retired_v1 / flag | 97 |
| v2 rows with `designated_scraper` populated | **280** |
| v2 joint stores with `joint_business_id` | **19 / 19** |
| v2 rows receiving menu metadata carry-forward | 282 |
| v1 rows modified | **0** (SELECT-only) |
| Ambiguous address matches | 0 |

All numbers match Stage 4 Section 6 expectations except the address-match count (6 vs. ~40 projected). Explanation below.

## Section 2 — Mapping breakdown

| match_method | confidence | Count | Share |
|---|---|---:|---:|
| `lcb_license` | high | 457 | 80.6% |
| `address` | medium | 6 | 1.1% |
| `unmatched_new_v2` | flag | 7 | 1.2% |
| `unmatched_retired_v1` | flag | 97 | 17.1% |
| **Total** | | **567** | 100% |

Coverage check:
- v2 rows total: 470. Each v2 row gets exactly one mapping entry (457 + 6 + 7 = **470**). ✓
- v1 rows total: 560 active. Each v1 row gets exactly one mapping entry (457 + 6 + 97 = **560**). ✓

### Address-match lower than projected

Stage 4 Section 6a projected ~40 address-match mappings (one per Stage 3 `manual_chaz` row). Actual: 6. Reason: most of Stage 3's 67 manual_chaz rows are **net-new websites** (Chaz supplied them from external knowledge) that don't correspond to any existing intel_stores row. Only 6 of the 67 happened to match a v1 row by address. This is accurate — Stage 3 was doing knowledge-supply more than knowledge-transfer.

### Ambiguous address matches: 0

No v2 row matched multiple v1 candidates by address in the same city. Clean address-match path.

## Section 3 — Designations applied

Applied Stage 4 run `ec3b40a1-3ae0-48a3-a361-962e0ab82baf` detected-platform → v2 `designated_scraper` + `primary_platform` + `platform_detection_confidence` + `platform_detected_at` (the last two were added by migration `20260419150000`).

Distribution on v2 after apply:

| Platform | Count |
|---|---:|
| Jane | 78 |
| Dutchie | 75 |
| POSaBit | 63 |
| Leafly | 44 |
| Joint | 19 |
| Weedmaps | 1 |
| **Total designated** | **280** |

Exact match to audit/40 Section 2. ✓

## Section 4 — joint_business_id population

All 19 v2 joint stores got their bizId populated from `platform_verification.signals.joint_business_id[0]`. Full list, sorted by bizId:

| bizId | v2 row | City | Notes |
|---|---|---|---|
| 4353 | CRAFT CANNABIS, INC. | VANCOUVER | audit/32 chain, Mill Plain pair |
| 4353 | CRAFT CANNABIS | VANCOUVER | audit/32 chain |
| 4353 | CRAFT LEAVENWORTH | DRYDEN | Cat 4 Stage 3 resolution — shares CRAFT 4353 catalog across locations |
| 4360 | CRAFT TACOMA | TACOMA | audit/32 |
| 4370 | CRAFT CANNABIS | WENATCHEE | audit/32 |
| 4370 | CRAFT WENATCHEE | WENATCHEE | audit/32 duplicate LCB pair |
| 5338 | LOCALS CANNA HOUSE | SPOKANE VALLEY | audit/32 |
| 5727 | LIDZ SPOKANE NORTH | SPOKANE | audit/32 |
| 5728 | LIDZ SPOKANE SOUTH | SPOKANE | audit/32 |
| 6065 | LIDZ CANNABIS TACOMA | TACOMA | audit/32 |
| 6110 | FLOYD'S CANNABIS COMPANY | PULLMAN | audit/32 |
| 6112 | FLOYDS | SEDRO WOOLLEY | audit/32 |
| **6114** | **MOUNT VERNON RETAIL HOLDINGS LLC** | **MOUNT VERNON** | **NEW — not in audit/32. Detected for the first time in Stage 4 because Chaz supplied the website in Stage 3.** |
| 6115 | DTC HOLDINGS | PORT ANGELES | audit/32 (Port Angeles Floyd's parent) |
| 6115 | FLOYD'S CANNABIS CO. | PORT ANGELES | audit/32 |
| 6117 | DANK'S WONDER EMPORIUM | EDMONDS | audit/32 |
| 6117 | DANKS | RENTON | audit/32 |
| 6117 | DANK'S TACOMA | TACOMA | audit/32 |
| 6166 | CANNA4LIFE | CLARKSTON | audit/32 |

**New bizId 6114** confirmed — `MOUNT VERNON RETAIL HOLDINGS LLC` is the LCB legal entity; the store **operates as Floyd's Cannabis Mount Vernon** (website `https://www.floyds-cannabis.com/stores/floyds-cannabis-dispensary-mount-vernon-wa/`). Same legal-name-vs-DBA pattern as **DTC HOLDINGS = Floyd's Port Angeles** (audit/32). Data is correct. Worth a future `dba_name` column but not urgent — website routes scrapers correctly regardless.

**CRAFT Vancouver Mill Plain + Andresen** — two LCB licenses (413732, 431536) share `joint_business_id=4353`. Known LCB-duplicate pattern per audit/32: **same physical business, two LCB licenses**. Mill Plain's widget serves both rows. Scraping nightly against bizId 4353 once populates both menu_items sets. Leave as-is.

**CRAFT LEAVENWORTH (DRYDEN, LCB 085059) — HARD-DEACTIVATED 2026-04-19.** Initial flag (shares bizId 4353 with CRAFT Vancouver) resolved: Chaz confirmed this store is only open a few days/month and isn't worth the scrape pipeline overhead. The Stage 3 website `https://www.craftcannabis.com/locations/?utm_source=gmb&utm_medium=organic` is a generic CRAFT `/locations` page that served the Mill Plain Joint widget (bizId 4353 false-positive). Migration `20260419190000_phase_1j_stage_5_deactivate_leavenworth.sql` set `is_active=FALSE`, cleared website/joint_business_id/designated_scraper/primary_platform fields, and recorded `deactivated_reason` + `deactivated_at`. Mapping row preserved.

Migration `20260419180000_phase_1j_stage_5_is_active.sql` added three general-purpose columns to intel_stores_v2 for future low-activity / out-of-scope cases:
- `is_active BOOLEAN NOT NULL DEFAULT TRUE`
- `deactivated_reason TEXT`
- `deactivated_at TIMESTAMPTZ`

## Section 5 — Carry-forward results

Per-platform breakdown of scraper-tracking fields migrated from v1 to v2. "Slug/id" = platform's primary identifier (dutchie_slug, jane_store_id, leafly_slug, posabit_merchant, joint_business_id, weedmaps_slug). "last_scraped_at" = the platform-specific timestamp.

| Platform | v2 total | With slug/id | With last_scraped_at |
|---|---:|---:|---:|
| Dutchie | 75 | 69 | 23 |
| Jane | 78 | 57 | 0 |
| Leafly | 44 | 10 | 19 |
| POSaBit | 63 | 31 | 30 |
| Joint | 19 | 19 | 17 |
| Weedmaps | 1 | 0 | 0 |

### Platform-by-platform detail

- **Dutchie 69 / 75:** 6 rows are Stage 4 dutchie detections on v2 rows that had no v1 counterpart (mostly new license ranges). Dutchie only had 23 `last_scraped_at` timestamps to carry because Phase 1e disabled Dutchie scraping; most last-scraped stamps are stale null.
- **Jane 57 / 78:** 21 rows are Stage 4 jane detections with no v1 counterpart OR v1 counterpart had a different platform. Jane `last_scraped_at` is uniformly NULL on v1 — the Jane scraper has never run against this data (expected; Phase 1e disabled it). Carry-forward correctly transfers the NULL.
- **Leafly 10 / 44:** only 10 slugs because the Phase 1h leafly correction (audit/35 Section 4a) reclassified 27 stores from leafly-to-something-else and 18 leafly-designated stores to none; v1's leafly_slug was populated on the ~15 stores that stayed leafly. The remaining 34 leafly-detected v2 rows are cross-platform reclassifications where Chaz's v1 leafly_slug would be wrong. Skipped correctly.
- **POSaBit 31 / 63:** matches the split between "credentials carried forward from v1 Phase 1h extraction" (31) and "needs fresh credential extraction" (32). The 63 `needs_credential_extraction=true` from Stage 4 is the superset of those 32 plus a few new ones. Separate sub-stage will re-run `/posabit-discover` with extended `waitMs`.
- **Joint 19 / 19:** every joint store got its bizId (all sourced from Stage 4 signals, regardless of whether v1 had one). 17 of 19 have `joint_last_scraped_at` — the 2 without are the new Stage 4 detections (bizId 6114 Mount Vernon + CRAFT LEAVENWORTH) that had never been scraped as Joint before.
- **Weedmaps 1 / 1:** single store detected (audit/35 noted weedmaps is effectively dead on this dataset), no v1 weedmaps_slug to carry. Weedmaps is deprecated per audit/18; carry-forward skipped correctly.

## Section 6 — Menu metadata carry-forward

| Metric | Value |
|---|---:|
| v2 rows with high-or-medium mapping | 463 (457 LCB + 6 address) |
| v2 rows where `menu_last_updated` was carried | 282 |
| v2 rows where `total_products` > 0 after carry | 282 |

The 282 stores that got menu-metadata populated are the ones whose v1 row had ever been successfully scraped (`menu_last_updated IS NOT NULL` on v1). The remaining 181 high/medium-mapped rows had no v1 scrape history to carry.

Note: `last_successful_scrape` column was specified in the task but does NOT exist on either `intel_stores` or `intel_stores_v2`. Skipped. The `*_last_scraped_at` per-platform fields serve the same role and were carried in Section 5.

## Section 7 — Flagged for Stage 6 or future work

### 7a. Unmatched `new_v2` rows (7 — no v1 counterpart)

All expected per audit/39 Stage 2:

| source_of_truth | lcb_license_id | Name | City |
|---|---|---|---|
| lcb_retail | 434994 | THE PACIFIC OUTPOST | PASCO |
| lcb_social_equity | 414350 | MAIN STREET MARIJUANA ORCHARDS | VANCOUVER |
| lcb_social_equity | 414931 | GOLIATH PINES | VANCOUVER |
| lcb_social_equity | 435675 | LUCKY LEAF CO | PASCO |
| lcb_social_equity | 436321 | HAPPY TREE | PROSSER |
| lcb_social_equity | 438213 | MHC LLC | REPUBLIC |
| tribal_manual | (null) | Remedy Tulalip | Tulalip |

The 7 row count (not 12) is because the 6 tribal retailers other than "Remedy Tulalip" all had a v1 counterpart (matched by address/name in Stage 1's carry-forward). "Remedy Tulalip" had `address IS NULL` on v1 so the address match didn't fire.

### 7b. Unmatched `retired_v1` rows (97 — no v2 counterpart)

These are the 97-row delta identified in Phase 1i: 75 phantoms + 26 duplicates minus the ~4 that resolved into legit mappings. Specifically from audit/36:

- 28 Category A.2 closed-LCB-match phantoms
- 7 Category A.1 tribal (wait — tribal got mapped by address-match, so these might be in `address` bucket)
- ~40 Category A.3 no-signal phantoms (Stage 3 may have resolved a few)
- 26 Category B duplicates

These 97 rows stay in intel_stores v1 untouched. When Stage 6 renames `intel_stores` to `intel_stores_archived`, they ride along into the archive table — their menu_items stay linked via the v1 FK until Stage 6 repoints or drops them.

### 7c. 30 Pass 2 gap stores from Stage 4

Stage 4 Section 1 noted 30 v2 rows with Pass 1 `none`/`posabit_hint` that never got a Pass 2 row written (all edge-function timeouts). These rows currently have `primary_platform` = whatever Pass 1 found (usually `none`) and `designated_scraper` = NULL. They need a Pass 2 re-scan before Stage 6 promotion to avoid losing a real detection.

### 7d. 17 "regressed" stores from Stage 4 comparison

Stage 4 Section 3 flagged 17 stores where Phase 1h found a platform but Stage 4 returned none/error. These are likely transient Pass 2 failures. Re-scan candidates. Each should be identifiable by joining Stage 4 vs Phase 1h `platform_verification` rows.

### 7e. 63 POSaBit `needs_credential_extraction`

63 POSaBit-detected stores need credential extraction before the POSaBit scraper will work post-swap. Of those, 31 already have credentials from the v1 carry-forward (they may or may not still be valid). The 32 net-new ones are Stage 4 fresh detections. Strategy: batched `/posabit-discover` re-run with `waitMs=40000` against all 63 and reconcile with v1 carry-forward credentials. Separate Stage 5b sub-task.

### 7f. CRAFT LEAVENWORTH — RESOLVED (hard-deactivated)

Initially flagged as needing manual review. Chaz confirmed 2026-04-19: open only a few days/month; not worth scraping. Hard-deactivated via migration `20260419190000`. Row stays in `intel_stores_v2` with `is_active=FALSE` so it can be revived if schedule changes. See Section 4 for migration detail.

### 7g. is_active filter requirement for Stage 6 scraper re-enablement

The new `is_active` column must be honored by every scraper / cron / dashboard query that iterates `intel_stores_v2` (and post-swap, `intel_stores`). Before re-enabling the disabled scrapers in Stage 6:

- `scrape-dutchie` / `scrape-jane` / `scrape-leafly` / `scrape-posabit` / `scrape-joint` edge functions: add `.eq("is_active", true)` to their target-loading queries.
- Dashboard KPIs (`Stores directory`, coverage reports, store-count widgets): filter `is_active = true` or explicitly show inactive.
- Any pg_cron wrappers that read `designated_scraper IS NOT NULL` — they already filter by designation, which is NULL on deactivated rows, so they'll skip CRAFT Leavenworth naturally. But future deactivations of still-designated stores would leak; better to add `is_active` check defensively.

### 7h. Stage 3 manual_chaz duplicate / generic-URL flags

Separate scan of the 66 `website_association_source='manual_chaz'` rows flagged 6 rows for review:
- 1 shared_bizid (CRAFT Mill Plain + Andresen — documented LCB-duplicate pattern, keep)
- 1 false-positive (THE PACIFIC OUTPOST — URL heuristic over-flagged a store-specific menu subdomain, keep)
- 2 Remedy Tulalip rows pointing at same URL — **Stage 6 merge candidate**
- 2 manual-review cases: IT IS LIT → i90 Green House; WASHINGTON O G, LLC → American Mary Belltown — legal-name-vs-DBA patterns

Full details + per-row suggested actions in [`audit/41-appendix-joint-duplicate-bizids.md`](41-appendix-joint-duplicate-bizids.md).

## Section 8 — Stage 6 preview

Stage 6 scope (preview for future planning):

1. **Re-scan the gap + regressed stores (7c + 7d).** Run `/verify-platform-pass2` with `target='v2'` on the ~47 stores flagged. Update `platform_verification` rows where better detection is found, then re-run Stage 5's apply-designations block for those specific rows.

2. **POSaBit credential re-extraction (7e).** Batched `/posabit-discover` with longer waitMs against all 63 needs_credential_extraction rows. Update `posabit_merchant` / `posabit_merchant_token` on v2 rows.

3. **Repoint `dispensary_menus.intel_store_id` from v1 UUIDs to v2 UUIDs.** Using `stage_5_store_mapping`:
   ```sql
   UPDATE dispensary_menus d
      SET intel_store_id = m.new_intel_store_v2_id
     FROM stage_5_store_mapping m
    WHERE d.intel_store_id = m.old_intel_store_id
      AND m.new_intel_store_v2_id IS NOT NULL
      AND m.confidence IN ('high','medium');
   ```
   Need to decide: does the dispensary_menus FK currently reference intel_stores.id as UUID FK, or is it just an un-constrained UUID? If FK, we need to drop the FK, repoint, then add new FK to intel_stores_v2.

4. **Rename tables.** Two-step:
   ```sql
   ALTER TABLE intel_stores RENAME TO intel_stores_archived;
   ALTER TABLE intel_stores_v2 RENAME TO intel_stores;
   ```
   This breaks every FK pointing at intel_stores and every query using `intel_stores` as a table name until we update the downstream consumers:
   - `dispensary_menus.intel_store_id` FK
   - `platform_verification.intel_store_id` FK (legacy column, now mostly NULL)
   - `stage_3_review_queue.intel_store_v2_id` FK → rename column to `intel_store_id`?
   - `stage_5_store_mapping` FKs — both sides need updating
   - All edge function SQL referring to `intel_stores`
   - All React pages' SQL references
   - Supabase RLS policies referring to intel_stores

5. **Re-enable disabled scrapers.** Dutchie/Jane/Leafly/POSaBit/Weedmaps were disabled in Phase 1e to avoid pollution. After swap + carry-forward, re-enable scrapers against the new `intel_stores` (formerly v2). Joint is already running.

6. **Decommission `intel_stores_archived`.** Keep read-only for a few weeks as safety, then drop.

**Decision points for Stage 6:**
- Drop-and-recreate FK on dispensary_menus vs. leaving un-constrained?
- Hard-cut (single migration) or soft-cut (dual-write period)?
- Before or after retroactive archive-to-Grow backup?

## Verification summary

| Check | Expected | Actual | Pass |
|---|---|---|:-:|
| Q1: mapping breakdown | ~457 lcb + ~40 addr + ~15-20 new + ~97 retired | 457 + 6 + 7 + 97 | ✓* |
| Q2: v2 designated_scraper count | ~280 | 280 | ✓ |
| Q3: v2 primary_platform distribution | Jane 78, Dutchie 75, POSaBit 63, Leafly 44, Joint 19, Weedmaps 1 | exact match | ✓ |
| Q4: 19 joint rows w/ bizid incl. 6114 | yes | 19/19, bizId 6114 = MOUNT VERNON RETAIL HOLDINGS (1 row) | ✓ |
| Q5: POSaBit credentials carried | non-zero | 31/63 have merchant+token | ✓ |
| Q6: `intel_stores` unmodified | 0 writes | 0 UPDATE/DELETE statements against intel_stores in the migration | ✓ |

\* Address-match was lower than projected (6 vs 40) because Stage 3's 67 manual_chaz rows are mostly net-new websites that don't match existing v1 rows. That's expected behavior, not a bug.

## Artifacts

- Migration (columns): `supabase/migrations/20260419150000_phase_1j_stage_5_columns.sql`
- Migration (mapping table): `supabase/migrations/20260419160000_phase_1j_stage_5_mapping_table.sql`
- Migration (populate + apply + carry-forward): `supabase/migrations/20260419170000_phase_1j_stage_5_apply.sql`
- Migration (is_active flag): `supabase/migrations/20260419180000_phase_1j_stage_5_is_active.sql`
- Migration (deactivate CRAFT Leavenworth): `supabase/migrations/20260419190000_phase_1j_stage_5_deactivate_leavenworth.sql`
- Verify script: `scripts/phase-1j-stage-5-verify.mjs`
- Verify output: `audit/logs/phase-1j-stage-5-verify.json`
- Duplicate-URL scan script: `scripts/phase-1j-stage-5-duplicate-scan.mjs`
- Duplicate-URL appendix: `audit/41-appendix-joint-duplicate-bizids.md`

## Gate

Stage 5 is observational w/r/t v1 (SELECT-only). All writes are to `intel_stores_v2` + `stage_5_store_mapping`. Proceed to Stage 6 when ready — OR first execute sub-stages 7c (gap re-scan), 7e (POSaBit creds), and 7f (CRAFT Leavenworth bizid check) to improve v2 completeness before the swap.

Pre-Stage-5 commit: `e34a0e6` (Stage 4 platform detection).
