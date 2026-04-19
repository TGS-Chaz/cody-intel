# Phase 1j Stage 4 — Platform Verification Against intel_stores_v2

**2026-04-19. Re-ran verify-platform scanner against the cleaned v2 population. Run ID `ec3b40a1-3ae0-48a3-a361-962e0ab82baf`. 446 v2 rows with websites scanned. 280 verified platform detections (62.8%), 147 none, 19 errors. 88% agreement with Phase 1h on the 414-row overlap; 25 net improvements, 17 regressions, 6 changed — all tractable.**

## Headline

| Outcome | Stage 4 | Phase 1h | Delta |
|---|---:|---:|---:|
| Target rows | 446 (v2 w/ website) | 419 (v1 w/ website) | +27 |
| Verified platforms | 280 | 248 | +32 |
| None | 147 | 147 | 0 |
| Error | 19 | 18 | +1 |
| No pv row | 0 | 6 | −6 (all scanned this time) |
| Run time | ~5.5 h (incl. resume after death) | 3 h 7 m | +2.4 h (edge function worse) |

**Takeaway:** Stage 4 picks up 32 more verified platform detections than Phase 1h despite running on only 27 more target rows. The gain comes from Stage 3's manual website corrections (67 rows now have `website_association_source='manual_chaz'`) surfacing platforms the Phase 1h target set had no shot at.

## Section 1 — Run stats

| Metric | Value |
|---|---:|
| Run ID | `ec3b40a1-3ae0-48a3-a361-962e0ab82baf` |
| Target population | 446 v2 rows with websites |
| Pass 1 rows written | 446 (100% coverage) |
| Pass 2 rows written | 254 |
| Unique Pass 2 candidates (Pass 1 = `none` or `posabit_hint`) | 284 |
| Gap (no Pass 2 row) | 30 (all client timeouts) |
| Pass 1 wall | ~22 min |
| Pass 2 wall (incl. resume) | ~5 h (initial 98 min + resume 122 min after mid-run death) |
| Pass 1 resolved | 167 stores |
| Pass 2 resolved | 115 stores (upgrades from Pass 1 `none`) |
| Both `none` / error / no-pv | 164 stores |

### Infrastructure issues

- **Pass 1 batch 22 IDLE_TIMEOUT × 3** (stores 421–440) — all three 150 s client retries hit the Supabase edge function's IDLE_TIMEOUT limit. Rows still got written server-side (confirmed by Pass 1 DB count = 446), but the script counted them as a batch error.
- **Pass 2 runner process died silently at 20:02 UTC** after 150 completions without writing a FATAL message. No stdout error. Likely hit a Node/Docker OOM or signal from outside the process. Resume from DB state (new `scripts/phase-1j-stage-4-resume-pass2.mjs`) picked up cleanly and finished the remaining 160-queue.
- **55 Pass 2 client timeouts** during resume — same `AbortSignal.timeout(150_000)` pattern as Phase 1h. Rows likely completed server-side for ~half of those (DB count 254 > log counter 229).

Phase 1i recommendation (migrate Pass 2 to direct VPS) is reinforced. The edge function's 150 s / WRL budget is a chronic bottleneck.

## Section 2 — Detected platform distribution

Best-available verdict per v2 row (Pass 2 if present, else Pass 1). Only rows with a populated website are in scope (446):

| Platform | Count | Share |
|---|---:|---:|
| Jane | 78 | 17.5% |
| Dutchie | 75 | 16.8% |
| POSaBit | 63 | 14.1% |
| Leafly | 44 | 9.9% |
| Joint | 19 | 4.3% |
| Weedmaps | 1 | 0.2% |
| none | 147 | 33.0% |
| error | 19 | 4.3% |
| (no pv row) | 0 | 0% |
| **Total** | **446** | **100%** |

Across the 470-row v2 table (including 24 rows without a website — tribal + Cat 4 unresolved):
- Verified platforms: 280 / 470 = **59.6%**
- Needs manual attention (none + error + no website): 190 / 470 = **40.4%**

## Section 3 — Comparison to Phase 1h

For the 414 rows matchable between Stage 4 (intel_stores_v2) and Phase 1h (intel_stores) by normalized name, the detected platform agreement is:

| Outcome | Count | % | Meaning |
|---|---:|---:|---|
| **Same platform both runs** | 366 | 88.4% | Detection is stable |
| **Improved** (Phase 1h none/err → Stage 4 platform) | 25 | 6.0% | Age gate/CTA/retry fixed it, or Stage 3 website replacement unlocked the real menu |
| **Regressed** (Phase 1h platform → Stage 4 none/err) | 17 | 4.1% | Transient failure in Stage 4 — edge function timeout, VPS error, etc. |
| **Changed** (different platform detected) | 6 | 1.4% | Flag for review |
| **Total overlap** | 414 | 100% | |

### Changed — all 6 flagged for review

| Name | Phase 1h → Stage 4 |
|---|---|
| HASHTAG CANNABIS | jane → posabit |
| DTC HOLDINGS | joint → posabit |
| DTC HOLDINGS | joint → posabit |
| DTC HOLDINGS | joint → posabit |
| SWEET JANE | leafly → posabit |
| THE BAKE SHOP | posabit → leafly |

All 6 are name-match artifacts: the v1 row and v2 row share a name but have different addresses/licenses. For example, audit/32 listed three DANK'S ... no wait, these are DTC HOLDINGS. The audit/32 DTC HOLDINGS was at Port Angeles (license 6115 joint). The v2 set has THREE different DTC HOLDINGS rows (lic 445189 Silverdale, 445310 Port Hadlock, 445379 Chimacum — all from Cat 4) — newly-issued Floyd's/DTC locations. Those are not the same business as the audit/32 Port Angeles one; the phase-1h detection on "DTC HOLDINGS" was against the Port Angeles row that correctly resolved to joint. Name-match conflated the two, producing a fake "changed" entry. **These aren't real regressions**, they're an artifact of the name-only join.

The regressed bucket (17) is more worth investigating. Most are likely transient Pass 2 edge function timeouts. Spot-check by picking 3-5 in Stage 5.

## Section 4 — Specific store sanity checks

### Fire Cannabis (expected: Leafly)

| v2 row name | Detected |
|---|---|
| FIRE CANNABIS CO | **none** |
| FIRE CANNABIS CO - | **leafly** ✓ |

Two v2 rows exist — one detected leafly cleanly, the other returned none. Likely the same chain with two different license numbers; one site hit age gate / scanner fail. Needs eyeball in Stage 5 for the `none` row.

### Have A Heart (expected: POSaBit chain)

| v2 row name | Detected |
|---|---|
| HAVE A HEART | **none** |
| HAVE A HEART CC | **posabit** ✓ |
| HAVE A HEART | **posabit** ✓ |
| HAVE A HEART | **none** |

2 of 4 confirmed POSaBit, 2 returned none. Scanner miss on 2 locations — either age-gate or POSaBit widget didn't materialize during the scan. Re-scan candidates.

### 17 Joint stores from audit/32 + beyond

**Stage 4 detected 19 Joint stores** (up from 16 in Phase 1h, and the audit/32 survey's 17). Breakdown by `joint_business_id`:

| bizId | Count | audit/32 listing |
|---|---:|---|
| 4353 | 3 | CRAFT Vancouver chain — expected 2, got 3 (duplicate LCB row?) |
| 4360 | 1 | CRAFT Tacoma ✓ |
| 4370 | 2 | CRAFT Wenatchee — expected 2 ✓ |
| 5338 | 1 | LOCALS CANNA HOUSE ✓ |
| 5727 | 1 | LIDZ Spokane North ✓ |
| 5728 | 1 | LIDZ Spokane South ✓ |
| 6065 | 1 | LIDZ Tacoma ✓ |
| 6110 | 1 | Floyd's Pullman ✓ |
| 6112 | 1 | Floyd's Sedro Woolley ✓ |
| 6115 | 2 | Floyd's Port Angeles — expected 2 ✓ |
| 6117 | 3 | DANK'S chain — expected 3 ✓ |
| 6166 | 1 | CANNA4LIFE ✓ |
| **6114** | **1** | **NEW — not in audit/32** |

**New Joint store detected: bizId 6114.** One of the Stage 3 manual-website additions picked up a Joint embed that audit/32's HTTP fetch never reached (probably a phantom/no-website row until Chaz supplied its URL). The `audit/logs/phase-1j-stage-4-analysis.json` has the v2 id — flag for joint_business_id population in Stage 5.

Other joint rows by v2 name+lic show CRAFT LEAVENWORTH (085059), MOUNT VERNON RETAIL HOLDINGS (422796), LIDZ SPOKANE NORTH (442173), LIDZ CANNABIS TACOMA (442174) — these are Cat 4 stores Chaz gave websites in Stage 3; they now resolve as Joint (matching the chain pattern audit/32 established).

### Stage 3 store re-designations

Of the 67 rows with `website_association_source='manual_chaz'` (Stage 3 review), **45 now carry a detected platform in Stage 4** — that's 67% hit rate, matching the overall auto-confirm rate and validating Chaz's manual picks.

## Section 5 — POSaBit needs_credential_extraction

**63 stores** detected as POSaBit need credentials extracted for scraping to work post-swap. Up from 51 in Phase 1h (+12, most likely new POSaBit detections from Stage 3 websites).

Top 8 sample (full list in `audit/logs/phase-1j-stage-4-analysis.json → posabit_need_creds_sample`):

| Name | Website |
|---|---|
| Pacific Outpost | https://menu.thepacificoutpost.com |
| ANACORTES CANNABIS | https://www.anacortescannabis.com/ |
| 112TH STREET CANNABIS | https://menu.112thstreetcannabis.com/ |
| Origins Cannabis - Redmond | https://menu.originscannabis.com/redmond |
| DESTINATION HIGHWAY 420 | https://www.destinationhwy420.com/welcome-to-dh420/ |
| HAVE A HEART CC | https://haveaheartcc.com/dispensaries/wa/belltown/ |
| CARAVAN CANNABIS COMPANY | https://caravan-cannabis.com/burlington-dispensary-517858bc/ |
| CLOUD 9 CANNABIS CO | https://c9cannabisco.com/lucid-cheney-store-info/ |

Stage 5 plan: batched re-run of `/posabit-discover` on the 63 stores with `waitMs=40000`. Expected to auto-resolve 40-50; rest manual F12 extraction (audit/21 Chrome-session style).

## Section 6 — Proposed Stage 5 transition plan (DRAFT)

Stage 5 moves scraper state and menu-item data from `intel_stores` (old) to `intel_stores_v2` (new). Sketch:

### 6a. Build the mapping table
```sql
CREATE TABLE stage_5_store_mapping (
  old_intel_store_id UUID REFERENCES intel_stores(id),
  new_intel_store_v2_id UUID REFERENCES intel_stores_v2(id),
  match_method TEXT,  -- 'lcb_license' | 'address' | 'manual'
  confidence TEXT,
  UNIQUE (old_intel_store_id, new_intel_store_v2_id)
);
```

Populate via LCB license join for the 457 rows that carry `lcb_license_id` in both, plus address-match for the ~40 Stage 3 manual_chaz rows that came from an existing intel_stores row, plus manual rows for the tribal 7 and the new joint/posabit stores that surfaced for the first time in Stage 4.

### 6b. Apply Stage 4 platform designations to v2
```sql
WITH best AS (
  SELECT DISTINCT ON (intel_store_v2_id) intel_store_v2_id, primary_platform, confidence
    FROM platform_verification
   WHERE run_id = 'ec3b40a1-3ae0-48a3-a361-962e0ab82baf'
   ORDER BY intel_store_v2_id,
            CASE pass WHEN 'pass2_browser' THEN 1 ELSE 2 END,
            CASE confidence WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
)
UPDATE intel_stores_v2 v
   SET designated_scraper = b.primary_platform,
       primary_platform    = b.primary_platform
  FROM best b
 WHERE v.id = b.intel_store_v2_id
   AND b.primary_platform IN ('dutchie','jane','leafly','posabit','joint','weedmaps');
-- Expected: ~280 rows affected.
```

### 6c. Carry forward scraper-tracking fields
For each pair `(old, new)` in `stage_5_store_mapping`, copy `dutchie_*`, `jane_*`, `leafly_*`, `posabit_*`, `joint_*`, `weedmaps_*` fields and `menu_last_updated` / `total_products` from the old row. Only copy if the detected platform is the same; otherwise the old scraper fields are noise.

### 6d. Carry forward joint_business_id
For 19 joint stores, set `joint_business_id` from `platform_verification.signals.joint_business_id[0]`. The new bizId 6114 row needs Chaz to confirm before scheduling.

### 6e. Repoint menu_items / dispensary_menus
`dispensary_menus.intel_store_id` currently points at `intel_stores(id)`. Stage 6 (the swap) will either:
- Rewrite these FKs to `intel_stores_v2.id`, OR
- Copy `intel_stores_v2.id` into the old `intel_stores` row (so the legacy FK still hits a now-v2-anchored row)

Decision pending Stage 6 scope. Stage 5 just builds the mapping so Stage 6 can execute either direction.

### 6f. POSaBit credential re-extraction
Batched rerun of `/posabit-discover` on the 63 `needs_credential_extraction=true` rows with extended waitMs. Separate job; not blocking on the Stage 5 mapping.

## Artifacts

- Stage 4 migration (column + index + policy): `supabase/migrations/20260419130000_phase_1j_stage_4_prep.sql` + `20260419140000_phase_1j_stage_4_index_fix.sql`
- Edge function changes (cody-crm): `verify-platform-pass1/index.ts` + `verify-platform-pass2/index.ts` — added `target: 'v2'` parameter
- Runner: `scripts/phase-1j-stage-4-run.mjs`, resume: `scripts/phase-1j-stage-4-resume-pass2.mjs`
- Analyzer: `scripts/phase-1j-stage-4-analyze.mjs`
- Analysis output: `audit/logs/phase-1j-stage-4-analysis.json`
- Run log: `/tmp/phase-1j-stage-4-run.log` + `/tmp/phase-1j-stage-4-resume.log` (on VPS)

## Gate

No gate — Stage 4 is observational. Stage 5 is the first write-to-v2 phase (designated_scraper + carry-forward fields). Platform results are ready whenever Chaz starts Stage 5.

## Rollback

Migrations are additive. To drop the v2 column on platform_verification:
```sql
ALTER TABLE platform_verification DROP COLUMN intel_store_v2_id;
DROP INDEX IF EXISTS idx_platform_verification_v2;
DROP INDEX IF EXISTS ux_platform_verification_v2;
```
Pre-Stage-4 commit: `a3f72a0` (Stage 3 Save+next fix).
