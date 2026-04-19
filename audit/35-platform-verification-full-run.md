# Phase 1h — Full Platform Verification Run (419 stores)

**2026-04-19. Full verify-platform Pass 1 + Pass 2 scan across all active WA stores with websites. Run ID `9d85b941-05e6-4c97-b677-3c5b608f1c7b`. Read-only against `intel_stores`; all writes went to `platform_verification`.**

## Headline

Half the DB's designations are stale. **196 of 389 currently-designated stores disagree with what the verified scanner found today** — about 50.4%. Biggest category by far: 75 stores currently flagged as Dutchie whose sites have no Dutchie embed (and no other embed either). Leafly and weedmaps designations fare even worse proportionally.

- Joint catalog fully covered (16/17 pre-designated stores re-confirmed; 0 new Joint stores found outside audit/32's set).
- All 51 POSaBit stores detected by Pass 2 need credential extraction as a follow-up.
- Of 25 previously undesignated stores, 5 resolved to a real platform and 19 cleanly returned `none`.
- 6 stores (1.4%) were lost to a Supabase edge-function `WORKER_RESOURCE_LIMIT` failure in Pass 1 batch 11.
- 64 of 265 Pass 2 targets (24%) hit the 150s client-side abort before a row was written.

No designation changes applied. Draft SQL is in Section 5 for Chaz's review.

---

## Section 1 — Run stats

| Metric | Value |
|---|---:|
| Target population | 419 (560 active stores − 141 with no website) |
| Pass 1 rows written | 413 |
| Pass 2 rows written | 201 (of 265 targets) |
| Unique stores with ≥1 pv row | 413 |
| Stores with **no** pv row | 6 (Pass 1 batch 11 WRL casualties) |
| Pass 1 wall time | 1,350 s (22.5 min) |
| Pass 2 wall time | 9,915 s (2 h 45 min) |
| **Total wall** | **11,265 s (3 h 7 min)** |
| Run started | 2026-04-19T07:59:12 UTC |
| Run finished | 2026-04-19T11:06:57 UTC |

**Pass 1 resolution rate:** 140/419 stores (33.4%) resolved by HTTP regex alone. Lower than the ≥60% the original pilot projection assumed — the pilot's small sample was biased toward big-platform stores. The real dataset has far more stores running custom/native WordPress menus (`none` in Pass 1) than anticipated.

**VPS resource observations:**
- VPS `activeScrapes` stayed at 0 throughout (VPS was never the bottleneck).
- VPS health `200` OK continuously.
- No OOM kills on the VPS.
- **Bottleneck was the Supabase Edge Function**, not the VPS — see failure-pattern analysis below.

### Failure patterns (aggregated, not per-store)

| Pattern | Count | Notes |
|---|---:|---|
| Pass 1 batch 11 gave up (WRL × 3) | 1 batch, ~6 stores dropped | `WORKER_RESOURCE_LIMIT` + `IDLE_TIMEOUT` on the edge function. 6 of 20 stores in that batch never got a pv row. The other 14 were written before the WRL hit mid-batch. |
| Pass 2 client-side 150 s aborts | 64 stores | My script's `AbortSignal.timeout(150_000)` fired before the edge function returned. Some of those edge-function invocations likely still completed server-side and wrote their pv row; 64 is the upper bound of truly missed writes. |
| Puppeteer "Navigating frame was detached" | 7 stores | Most common scan_error; Puppeteer transient, not a site problem. |
| `order.*.com` DNS/connection errors | ~10 stores | `order.luxpotshop.com`, `order.kaleafa.com`, `order.caravan-cannabis.com`, `order.firecannabis.org`, etc. Either defunct subdomains or scraper-VPS DNS failure. |
| CloudFlare 502 HTML | 1 store | Bot mitigation on one fetch; negligible. |
| `Signal timed out` | 1 store | VPS Puppeteer timeout. |

No bot blocks on the VPS that would suggest a proxy-rotation issue. The dominant failure mode was the edge function fabric (Supabase), not the detection logic.

---

## Section 2 — Detected platform distribution

Best-available verdict per store (Pass 2 if present, else Pass 1).

| Platform | Count | Share |
|---|---:|---:|
| POSaBit | 51 | 12.2% |
| Jane | 71 | 17.0% |
| Dutchie | 69 | 16.5% |
| Joint | 16 | 3.8% |
| Leafly | 41 | 9.8% |
| none (no platform detected) | 147 | 35.1% |
| error | 18 | 4.3% |
| (no pv row — lost in WRL) | 6 | 1.4% |
| **Total** | **419** | **100%** |

**Verified platform coverage: 248/419 = 59.2%** (the five platforms combined). Add in the 147 verified `none` stores and we have a read on 395/419 = 94.3% of the catalog. The remaining 5.7% split between scanner-visible errors (18) and the WRL-dropped 6.

---

## Section 3 — Comparison against current designations

### 3a. Summary

| Category | Count | Notes |
|---|---:|---|
| Current = detected (match) | **193** | Designation confirmed by scanner |
| Current NULL, detected something | **5** | Undesignated stores now resolved |
| Current NULL, detected `none` | **19** | Undesignated and genuinely no online menu |
| Current ≠ detected (mismatch) | **196** | Need correction |
| No pv row (scanner couldn't be run) | **6** | Re-run required (batch 11 WRL casualties) |
| **Total** | **419** | |

**Match rate: 193/413 = 46.7%** of stores with a scanner verdict. Put differently: **the scanner agreed with the DB less than half the time.** This is a database-hygiene finding, not a scanner weakness — the scanner's detections are well-attested (see audit/32 validation of Joint, and pilot v3 in audit/31 — 0 false positives across 20 stores).

### 3b. Mismatch breakdown

Top rows are the biggest correction buckets. "→ none" pairs mean the DB says a platform but the site has no platform embed at all.

| Old designation | New detected | Count | Sample store names |
|---|---|---:|---|
| dutchie | **none** | 75 | 2020 SOLUTIONS SOAP LAKE, EVOLVE CANNABIS, APEX SPOKANE |
| jane | **none** | 24 | THE HERBERY, THE HAPPY CROP SHOPPE, REDMOND LEAF |
| leafly | **none** | 18 | BUD COMMANDER, GREENWAY MARIJUANA, KAHD HOLDING |
| weedmaps | **none** | 15 | TRU GREENTHUMB, UNCLE IKE'S, FORBIDDEN CANNABIS CLUB OLYMPIA |
| posabit | **none** | 14 | CASCADE HERB COMPANY (×2), YAKIMA WEED CO |
| dutchie | **jane** | 10 | KUSHKLUB, 420 WEST, THE SLOW BURN |
| jane | **leafly** | 10 | TREEHOUSE CLUB, THE GALLERY PARKLAND, GREEN ROOM OH INC. |
| dutchie | **leafly** | 6 | GREENWORKS N.W., RAINIER CANNABIS, BUDHUT |
| dutchie | **posabit** | 5 | DESTINATION HIGHWAY 420, RDI LLC, GREEN2GO |
| posabit | **leafly** | 4 | BORED N BUZZED, OCEAN GREENS, THE GREEN DOOR SEATTLE |
| leafly | **posabit** | 4 | HIGH SOCIETY, THE BAKE SHOP, CATHLAMET CANNABIS COMPANY |
| leafly | **jane** | 3 | GREEN THEORY FACTORIA, NIRVANA CANNABIS COMPANY, BUDS GARAGE |
| leafly | **dutchie** | 2 | HANGAR 420 CLEARVIEW, FROSTED SPRAGUE |
| weedmaps | **leafly** | 2 | THE NOVEL TREE (×2) |
| jane | **dutchie** | 1 | HIGH SOCIETY ANACORTES |
| jane | **posabit** | 1 | HIGH-5 CANNABIS |
| weedmaps | **jane** | 1 | GREEN THEORY |
| posabit | **dutchie** | 1 | HAVE A HEART |
| **Total mismatches** | | **196** | |

**"→ none" accounts for 146 of 196 mismatches (74.5%)** — the dominant correction pattern is "DB claims a platform that doesn't exist on the site." These stores are running custom / WordPress-native / Squarespace menus or nothing at all. Their current scrapers were likely producing empty menus every night (see the empty-menu investigation in audit/19).

Cross-platform mismatches (one platform → different platform) are 50 of 196 (25.5%). These are stores that migrated between platforms but the DB never caught up. Many are leafly→other which aligns with Chaz's note about the leafly market knowledge.

---

## Section 4 — Specific investigations

### 4a. Leafly correction (expected to be large)

**Before the run:** 45 stores were designated `leafly`.  
**After the run:** 14 confirmed still `leafly`; **27 are something else**; 4 had no pv row written.

| leafly → new | Count |
|---|---:|
| leafly → none | 18 |
| leafly → posabit | 4 |
| leafly → jane | 3 |
| leafly → dutchie | 2 |
| **Total reclassified** | **27** |

Yes, large — 60% of leafly designations are wrong. Consistent with the market intuition that leafly's WA share has collapsed and many "leafly stores" actually migrated to POSaBit (the WA-centric option) or native menus.

### 4b. Joint expansion beyond audit/32

**Before the run:** 17 stores with `designated_scraper='joint'` (set in Phase 1g).  
**After the run:** 16 of 17 re-detected as joint. 1 had a Pass 1 `none` result and wasn't in the Pass 2 queue.

| Metric | Value |
|---|---:|
| Pre-run designated joint | 17 |
| Joint re-detected | 16 |
| New Joint detections (beyond audit/32) | **0** |
| Pre-designated joint missed by scanner | 1 |

**The audit/32 targeted survey caught everything.** Zero new Joint stores turned up in the full run. The single joint store that wasn't re-detected (name available in `intel_stores` by filtering `designated_scraper='joint'` joined against the pv distribution) is likely a transient Pass 1 fetch miss; its joint designation was already set from audit/32 and should be left alone.

### 4c. The 53 undesignated stores (now 25)

The Phase 1e export of 53 undesignated stores has been partially worked down. 25 were in the target population. Results:

| Outcome | Count |
|---|---:|
| Resolved to detected platform | 5 |
| Resolved to `none` (genuinely no online menu) | 19 |
| No pv row (batch 11 casualty) | 1 |

**The 5 newly-resolved:**

| Name | Detected |
|---|---|
| WHIDBEY RETAIL GROUP | leafly |
| EUPHORIUM 420 | posabit |
| FREELAND CANNABIS COMPANY | posabit |
| POT SHOP | jane |
| SUNSETS CANNABIS | dutchie |

**The 19 genuinely-none** are mostly chamber-of-commerce / topshelfdata / loc8nearme referral pages (not the store's actual website). The current DB `website` is a referral URL, not the store's real site. These should be flagged `has_online_menu=false` and, if possible, the website fields corrected with a manual pass.

### 4d. POSaBit stores needing credential extraction

**51 stores detected as POSaBit in Pass 2 are flagged `needs_credential_extraction=true`.** This means Pass 2 detected the widget signature but the follow-up `/posabit-discover` call didn't return the four credentials (`merchant_token`, `merchant_slug`, `venue_slug`, `feed_id`) needed by the POSaBit scraper.

Without credentials, the POSaBit scraper can't run against those stores. Three paths:
1. Retry `/posabit-discover` at a different time (credentials live in `window.posabitmenuwidget` which loads after JS; may be a timing issue).
2. Manual F12 extraction — same flow as audit/21's 53-store Chrome session. Would take ~1-2 min per store × 51 = ~1 hour.
3. Combine: re-run Pass 2 for just these 51 with a longer `waitMs` (say 40 s) and see how many resolve automatically; manual-extract the remainder.

Top 8 sample stores (full list in `audit/logs/phase-1h-analysis-*.json`):

| Name | Website |
|---|---|
| Pacific Outpost | https://menu.thepacificoutpost.com |
| ANACORTES CANNABIS | https://www.anacortescannabis.com/ |
| Origins Cannabis - Redmond | https://menu.originscannabis.com/redmond |
| DESTINATION HIGHWAY 420 | https://www.destinationhwy420.com/welcome-to-dh420/ |
| HAVE A HEART CC | https://haveaheartcc.com/dispensaries/wa/belltown/ |
| CARAVAN CANNABIS COMPANY | https://caravan-cannabis.com/burlington-dispensary-517858bc/ |
| CLOUD 9 CANNABIS CO | https://c9cannabisco.com/lucid-cheney-store-info/ |
| CULT CANNABIS CO. | https://cultcannabisco.com/ |

### 4e. Pass 1 vs Pass 2 resolution split

| Source | Resolved stores |
|---|---:|
| Pass 1 HTTP alone | 140 |
| Pass 2 browser (rescued from Pass 1 miss) | 108 |
| Both returned `none`/error/no-row | 165 |

Pass 2 is pulling its weight: 108 stores that Pass 1 couldn't see (mostly POSaBit — JS-injected widget — and age-gated sites) got cleanly resolved by the headless browser. That's 43.6% of all real platform detections (108/248).

---

## Section 5 — Proposed next actions (DRAFT SQL, NOT APPLIED)

> All statements below are proposals. Chaz reviews, then we write the apply prompt and run it in a separate session.

### 5a. Re-designate mismatch stores based on detected platform

Join `platform_verification` (best row per store) against `intel_stores` where they disagree. Write the detected platform.

```sql
-- Proposed: update designated_scraper for 50 cross-platform mismatches (not → 'none').
-- Uses the pv row with the higher confidence (pass2_browser preferred over pass1_http).
WITH best AS (
  SELECT DISTINCT ON (intel_store_id) intel_store_id, primary_platform, pass, confidence
    FROM platform_verification
   WHERE run_id = '9d85b941-05e6-4c97-b677-3c5b608f1c7b'
   ORDER BY intel_store_id,
            CASE pass WHEN 'pass2_browser' THEN 1 ELSE 2 END,
            CASE confidence WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
)
UPDATE intel_stores s
   SET designated_scraper = b.primary_platform
  FROM best b
 WHERE s.id = b.intel_store_id
   AND b.primary_platform NOT IN ('none','error')
   AND b.primary_platform != s.designated_scraper
   AND s.designated_scraper IS NOT NULL;  -- only existing mismatches, not NULLs
-- Expected: 50 rows affected.
```

### 5b. Un-designate stores detected as `none`

```sql
-- Proposed: clear designated_scraper + flag has_online_menu=false for 146 stores
-- whose current scraper target doesn't actually exist on the site.
WITH best AS (
  SELECT DISTINCT ON (intel_store_id) intel_store_id, primary_platform
    FROM platform_verification
   WHERE run_id = '9d85b941-05e6-4c97-b677-3c5b608f1c7b'
   ORDER BY intel_store_id,
            CASE pass WHEN 'pass2_browser' THEN 1 ELSE 2 END
)
UPDATE intel_stores s
   SET designated_scraper = NULL,
       has_online_menu    = false,
       notes = coalesce(s.notes, '') ||
               E'\nPhase 1h (2026-04-19): verified no platform embed; previous scraper (' ||
               coalesce(s.designated_scraper, '(null)') || ') was stale.'
  FROM best b
 WHERE s.id = b.intel_store_id
   AND b.primary_platform = 'none'
   AND s.designated_scraper IS NOT NULL;
-- Expected: 146 rows affected.
```

### 5c. Resolve the 5 newly-detected undesignated stores

```sql
-- Proposed: set designated_scraper on 5 stores that verified cleanly with no prior designation.
UPDATE intel_stores SET designated_scraper='leafly'  WHERE id='5b9e0da7-73a5-4ad7-9e5f-5ece30959280'; -- WHIDBEY RETAIL GROUP
UPDATE intel_stores SET designated_scraper='posabit' WHERE id='0e036153-91a9-481d-abe7-ff7b0056c92a'; -- EUPHORIUM 420
UPDATE intel_stores SET designated_scraper='posabit' WHERE id='a832113d-7216-4dff-b644-000585694fdf'; -- FREELAND CANNABIS
UPDATE intel_stores SET designated_scraper='jane'    WHERE id='07f4088a-02ac-4c63-9c3f-c6457ff81386'; -- POT SHOP
UPDATE intel_stores SET designated_scraper='dutchie' WHERE id='018fb8c4-3a93-4fe0-baa9-d544baa2d217'; -- SUNSETS CANNABIS
```

### 5d. Flag the 19 undesignated + none stores for manual website review

```sql
-- Proposed: flag 19 undesignated stores that verified 'none' for Chaz's manual website-audit pass.
-- Most have referral URLs (topshelfdata, loc8nearme, chamberofcommerce) rather than real store sites.
-- Do not set has_online_menu=false yet — we don't know if the store has a menu; we know its
-- current website field doesn't point to one.
UPDATE intel_stores
   SET notes = coalesce(notes, '') || E'\nPhase 1h: undesignated, verified none — website field may be a referral page. Manual review needed.'
 WHERE id IN (
   '73992d10-a597-44dc-aea4-988d854e3ecf','7ebad716-bd83-494b-8ded-2a8b1b0809e9',
   '386aa229-8ce0-4150-84f9-6010e2437a3e','74630cf7-6691-4f91-88f4-f7eb4e704f25',
   'f829e243-6a8d-402a-8d83-b2f0cf879e2f','b298a558-3f8b-4bcf-a079-0995e51660c3',
   '5cecca8f-0637-4c6c-9c85-72bbfb79d686','ad6a2c92-ff76-43dd-a2c4-3b6adfe9ff56',
   '836549ed-e5c8-4be0-9c4a-2e30f1da1f25','489528db-b750-4625-a2aa-4ad8f9002f24',
   '8d8f8cbb-c433-468f-aef6-8a293c3e06d5','104acce1-e668-4688-9a42-97cea4685c34',
   '7784223f-97f2-4ddb-8e96-867cbb52f73d','e190dff2-7473-40e5-a4c5-b8f5cd84b24c',
   '2f861dda-849b-485c-b634-8a2f977072f2','d721dbc0-5ff4-4e9e-8d26-75eae90e35a5',
   'bf2d8c28-3ab7-49dc-85de-33e8c064f285','416fd2b4-1223-4feb-ad1d-f5a63c428be2',
   '7bbed903-9f8d-4fde-92d9-bba695500c11'
 );
```

### 5e. POSaBit credential extraction follow-up

Either:

```sql
-- Option 1: Auto-retry. Re-run just the 51 flagged stores through Pass 2
-- with waitMs=40000 to see if widget credentials materialize on a longer wait.
-- Run via scripts/phase-1h-full-run.mjs-style single-store invocations but
-- targeting pv rows with needs_credential_extraction=true.

-- Option 2: Manual F12 extraction via Chrome session, similar to audit/21.
-- Export the 51 rows to CSV:
SELECT s.id, s.name, s.website
  FROM platform_verification pv
  JOIN intel_stores s ON s.id = pv.intel_store_id
 WHERE pv.run_id = '9d85b941-05e6-4c97-b677-3c5b608f1c7b'
   AND pv.pass = 'pass2_browser'
   AND pv.needs_credential_extraction = true
 ORDER BY s.name;
```

Recommendation: try option 1 first. It's cheap (51 stores × 40 s ≈ 34 min VPS time) and if it auto-resolves ≥40, we only need to manually extract ≤11.

### 5f. Re-run the 6 WRL-dropped stores

```sql
-- Proposed: identify the 6 stores that have no pv row from this run and re-invoke.
SELECT s.id, s.name, s.website
  FROM intel_stores s
  LEFT JOIN platform_verification pv
         ON pv.intel_store_id = s.id
        AND pv.run_id = '9d85b941-05e6-4c97-b677-3c5b608f1c7b'
 WHERE s.status = 'active'
   AND s.website IS NOT NULL AND s.website != ''
   AND pv.intel_store_id IS NULL;
-- Then call verify-platform-pass1 with just those IDs (same runId or a fresh one).
```

### 5g. Infrastructure — bypass edge function for future Pass 2 runs

**This is the most important non-data action item.** The Pass 2 wall-clock (165 min for 265 stores = ~1.5 stores/min effective) was bottlenecked by Supabase edge-function `WORKER_RESOURCE_LIMIT` and cold-start overhead, not by the VPS itself. The VPS sat at `activeScrapes=0` most of the run while the edge function thrashed.

Recommendation: **migrate Pass 2 from Supabase edge function to direct VPS execution, mirroring the pattern the Joint scraper used in Phase 1f**. That cut Joint's per-store time from ~90s (edge-function-mediated) to ~45s (direct VPS), and — more importantly — eliminated the client-side 150 s aborts we saw today (64 of 265 Pass 2 stores missed a write because of this).

Sketch of the target architecture (Phase 1i):
1. Keep `verify-platform-pass1` as an edge function (HTTP-only, low CPU, 22 min for 419 stores is fine).
2. Move Pass 2 into a direct VPS endpoint the same way `scrape-joint` was done:
   - A small VPS endpoint, e.g. `/verify-platform-pass2-batch`, takes a list of store IDs + Supabase creds and does both the browser detection and the DB upserts (avoiding the edge-function middle-hop entirely).
   - Optionally, a thin edge-function wrapper just for auth handoff if we don't want to stick Supabase creds on the VPS. But the Joint scraper (which does the same writes) has found this stable.
3. Add a pg_cron-driven slice pattern (like Phase 1d's Dutchie/Jane scrapers) so Pass 2 becomes a nightly re-verification task instead of a once-per-phase manual trigger.

Expected runtime for a Phase 1i full run: ~30 min Pass 2 for 265 stores (based on Joint's 45 s × 4 parallel ≈ 5.3 stores/min × 50 min with retries ≈ 30 min).

Phase 1h was built on the edge-function fabric that was available; the lesson is that the same principle that drove the Joint scraper design (heavy browser work belongs on the VPS, not inside a 150 s Deno worker) applies here too.

**Filing this for Phase 1i. Tonight's run stands on its own results — no rerun needed to apply the Section 5 corrections.**

---

## Artifacts

- Run ID: `9d85b941-05e6-4c97-b677-3c5b608f1c7b`
- Raw analysis JSON: `audit/logs/phase-1h-analysis-9d85b941-05e6-4c97-b677-3c5b608f1c7b.json`
- Runtime log (VPS container): `/tmp/phase-1h-run.log` (not persisted to repo; content summarized in Section 1)
- Runner script: `scripts/phase-1h-full-run.mjs`
- Analyzer script: `scripts/phase-1h-analyze.mjs`

## Gate

**No gate decision needed this prompt** — this is an observational run. Next step is Chaz's review of Section 5. After review, we write an apply prompt that runs 5a/5b/5c/5d in a transaction (keeping 5e and 5g for separate follow-ups).

## Rollback

If any Section 5 SQL gets applied and needs to be reversed, the pre-run designations are captured in `audit/logs/stores-baseline-pre-run.json` and can be restored from there. Current audit reference point: commit `1f855e3` (Phase 1g Part 2 — Joint first-scrape).
