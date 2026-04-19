# Phase 1e Pilot Verification Results

**2026-04-19. Results from running the two-pass verify-platform-{pass1,pass2} scanner against the 20 pilot stores from audit/27. Run ID: `99c05674-13dd-44d4-8c75-83ca543b09ab`.**

**Outcome: pilot fails the 80% accuracy threshold. 6/20 correct detections = 30%. DO NOT promote to 560-store run.** Iterate on the scanner first — fixes are identified below.

## Per-store results

Each row reflects the best result across Pass 1 (HTTP) + Pass 2 (VPS browser), plus a verdict vs the current DB designation.

| # | Store | City | DB designation | Pass 1 | Pass 2 | Verdict | Category |
|---:|---|---|---|---|---|---|---|
| 1 | 112TH STREET CANNABIS | Puyallup | posabit | — | **posabit** | ✓ matches | 1 — confirms |
| 2 | AMERICAN HARVEST | Peshastin | posabit | — | **posabit** | ✓ matches | 1 — confirms |
| 3 | ANACORTES CANNABIS | Anacortes | posabit | — | `ERR_CERT_COMMON_NAME_INVALID` | scan failed | 5 — cert error |
| 4 | CARAVAN CANNABIS | Bellingham | posabit | — | none | missed | 5 — detection miss |
| 5 | CASCADE HERB | Ferndale | posabit | — | none | missed | 5 — detection miss |
| 6 | THE VAULT CANNABIS | Stanwood | dutchie | **dutchie** | — | ✓ matches | 1 — confirms |
| 7 | 2020 CANNABIS SOLUTIONS | Bellingham | dutchie | leafly | — | ⚠️ disagrees | 2 or FP — manual check |
| 8 | ORCHARDS CANNABIS MARKET | Vancouver | dutchie | — | none | missed | 5 — detection miss |
| 9 | UNCLE WILLIE'S CANNABIS | Kelso | dutchie | — | none | missed | 5 — detection miss |
| 10 | FLOYD'S CANNABIS COMPANY | Pullman | dutchie | — | none | missed | 5 — detection miss |
| 11 | THE LINK | Longview | jane | — | **jane** | ✓ matches | 1 — confirms |
| 12 | GREEN LADY HAWKS PRAIRIE | Olympia | jane | — | none | missed | 5 — detection miss |
| 13 | THE MARIJUANA MERCANTILE | Granite Falls | jane | — | none | missed | 5 — detection miss |
| 14 | FIRE CANNABIS CO | Yakima | leafly | **leafly** | — | ✓ matches | 1 — confirms |
| 15 | FREELAND CANNABIS COMPANY | Freeland | NULL | — | `ERR_CERT_COMMON_NAME_INVALID` | scan failed | 5 — cert error |
| 16 | CANNABIS PROVISIONS INC | Shoreline | NULL | — | none | unclear | 4 — possibly genuine no-menu |
| 17 | W.C.W. ENTERPRISES | Everson | NULL | — | none | unclear | 4 — possibly genuine no-menu |
| 18 | CRAFT CANNABIS | Vancouver | NULL | — | none | missed | 5 — detection miss (should be dutchie per audit/22) |
| 19 | DANK'S TACOMA | Tacoma | NULL | — | none | missed | 5 — detection miss (should be dutchie per audit/22) |
| 20 | PRC | Edmonds | dutchie | — | **jane** | ⚠️ **corrects DB** | 2 — confirms chain-is-Jane per Chaz |

## Category counts

| Category | Count | Detail |
|---|---:|---|
| 1 — Confirms current designation | 5 | POSaBit ×2, Dutchie ×1, Jane ×1, Leafly ×1 |
| 2 — Corrects current designation | 1 | PRC Edmonds: dutchie → jane (matches Chaz's Pass-1 chain correction) |
| 3 — Designates previously-NULL store | 0 | |
| 4 — Credible "no embed" | 2 | Cannabis Provisions, W.C.W. — scanner clean, needs human spot-check |
| 5 — Scan failure or detection miss | 12 | 2 cert errors + 10 detection misses |
| Pending (FP vs correction) | 1 | 2020 Cannabis Solutions (leafly detected, dutchie in DB) — needs manual verification |

**Correct detections: 6/20 (30%).** Threshold was ≥16/20 (80%). **Pilot fails.**

## What worked

- **POSaBit detection on the VPS does work.** `window.posabitmenuwidget` extraction caught 112TH St Cannabis and American Harvest (2 of 5 POSaBit pilots). The two POSaBit hits both also got `needs_credential_extraction = true` flagged — MCX cred roundtrip failed, consistent with the 401 pattern observed in audit/26's VPS log addendum.
- **PRC Edmonds corrected.** The scanner returned Jane when the DB currently says Dutchie, which matches Chaz's own Pass-1 chain designation (PRC → Jane). This is the single strongest validation that the verification approach is sound: the scanner caught a real mis-designation.
- **Pass 1 HTTP-only caught 3 stores cleanly** (The Vault → Dutchie, Fire Cannabis → Leafly, plus the 2020 Cannabis Solutions flag). For stores where the embed is in the root HTML, Pass 1 is fast and reliable — so the two-pass architecture is justified.
- **Jane detection on VPS works on at least some stores.** The Link (Longview) and PRC Edmonds both returned jane from Pass 2 cleanly.

## What's broken

### 1. VPS returns "none" too often for Dutchie / Jane stores

10 stores that should have detections came back empty:
- 3 Dutchie stores: Orchards, Uncle Willie's, Floyd's
- 2 Jane stores: Green Lady Hawks Prairie, The Marijuana Mercantile
- 2 POSaBit stores: Caravan, Cascade Herb
- 3 chain/undesignated: CRAFT, DANK'S Tacoma, W.C.W.

Most likely cause: **VPS `waitMs=12s-15s` isn't long enough for these sites' menus to render**, OR the iframe/script is nested deeper than `detectPlatformOnce()` probes. Needs direct investigation — either raise waitMs to 25-30s or add deeper iframe-recursion to the scan logic.

### 2. Pass 1 subdomain probing creates wasted DNS errors

Every Pass 1 scan probes `shop.{host}` and `menu.{host}` even when the root returns 200 OK. Almost all of these fail with "name or service not known." This is noise — pollutes `scan_error` with misleading text (e.g., `112TH STREET CANNABIS` ends up with `scan_error = DNS failure on shop.menu...` even though root had POSaBit hints). **Fix:** only probe subdomains if root + subpaths all return 0 signals.

### 3. Cert errors in Pass 2 (2 stores)

`net::ERR_CERT_COMMON_NAME_INVALID` on Anacortes Cannabis and Freeland Cannabis. Puppeteer rejects these by default. **Fix:** launch Chromium with `--ignore-certificate-errors` on the VPS. Low-risk for a read-only scanner; many small dispensaries run expired or mis-matched certs.

### 4. Pass 1 Leafly false-positive risk

2020 Cannabis Solutions is designated Dutchie in the DB but Pass 1 regex matched a Leafly URL. Without looking at the raw body snippet, I can't tell if this is:
- **(a)** a correct "DB is stale, they switched to Leafly" → category 2 correction
- **(b)** a marketing backlink to a Leafly profile on an otherwise-Dutchie site → false positive

The current regex patterns are too loose — `leafly\.com/dispensary-info/` matches both an embedded widget URL AND a plain `<a href=>` link to the Leafly page. **Fix:** require Leafly matches to appear inside `<iframe src=` or `<script src=` attributes, not just anywhere in the body.

### 5. Pass 2 is inconsistent

Running the same store set twice produced different results — THE LINK returned `jane` on the first (timed-out) call and `none` on the retry. This suggests the VPS has a non-deterministic failure mode (race condition? memory leak? Detached frame?). Audit/26's addendum flagged detached-frame errors in the logs. **Fix:** add retry-with-backoff on `none` results inside the VPS `detectPlatformOnce()`, up to 2 attempts per store.

## Architectural validations

Despite the low accuracy, the pilot validates the architecture:

- **Two-pass split is correct.** Pass 1 caught 3 stores in under a minute total; Pass 2 caught 3 more including the POSaBit JS-only widget and the PRC mis-designation correction. Neither pass alone would have got there.
- **`platform_verification` schema works.** `confidence` + `needs_credential_extraction` distinguished genuine no-menu (low confidence) from errored-out (none confidence) from detected-but-creds-failed (medium confidence + flag). Useful signal for downstream.
- **Edge Function → VPS chunk size matters.** 150s idle timeout forced small batches. For the 560-store run we'll need either (a) background-job via `pg_cron` + cursor, or (b) call VPS directly from a cron-invoked function with `chunkSize<=4` and `waitMs<=12000` to stay under 150s. Option (a) is cleaner and already the pattern from Phase 1d scraper batching.

## Recommendations before proceeding

**DO NOT run the full 560 stores yet.** Fix the following first:

1. **Increase VPS `waitMs` to 25000** — covers slow-loading menus. 30s per store * 560 stores ≈ 4.7h total, still feasible overnight.
2. **Add `--ignore-certificate-errors` to Puppeteer launch args** on the VPS.
3. **Skip Pass 1 subdomain probing when root responded 200** — cuts Pass 1 time by ~60% and eliminates misleading `scan_error` noise.
4. **Tighten Pass 1 Leafly regex to require `iframe|script src=` context** — eliminates the 2020 Cannabis Solutions false positive.
5. **Add `detectPlatformOnce()` retry on empty** — if first scan returns `detected: []` and no nav_error, retry once with `waitMs + 10000`.
6. **Manual verify 2020 Cannabis Solutions** — Chaz to browse the site and confirm Leafly vs Dutchie. This tells us whether the detection is a correction or a false positive.
7. **Re-run the same 20-store pilot after fixes.** Target: 16/20 correct (80%). Only then move to the full 560-store run.

## Scanner bugs found during pilot (for the build)

- `verify-platform-pass1` writes `scan_error` from the last failed subdomain probe even when an earlier probe found hints. Rows where `primary_platform != 'none'` OR `signals` is populated should have `scan_error = NULL`. Minor cosmetic bug; doesn't affect detection.
- `verify-platform-pass2` inserted rows for stores from the first timed-out call AND again on retry, creating duplicates. Deduplicated by hand (5 rows deleted). **Fix for full run:** upsert on `(run_id, intel_store_id, pass)` or DELETE-then-INSERT.
- `extractPosabitCreds: false` was respected — no /posabit-discover calls were made in this pilot. Good. For the full run, re-enable with the detached-frame patch.

## Time budget

- Pass 1: ~20s for 20 stores (HTTP, lots of DNS-failure overhead)
- Pass 2: ~4 minutes total across 3 batches (chunkSize 4-5, waitMs 10-15s)
- Total wall-clock: ~5 minutes for 20 stores, after excluding the timed-out first call.

Extrapolated to 560 stores at full waitMs=25000: ~4-5 hours. Fits inside a single overnight cron window. Recommend running it via `cody_cron_invoke()` + cursor-batching pattern from Phase 1d.
