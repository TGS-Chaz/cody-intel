# PILOT FAILED — REVIEW NEEDED

**10/20 correct after six fixes. Below the 12/20 "third iteration" threshold, so this is not a case of one-more-tweak — there's a systemic detection gap Chaz needs to weigh in on before continuing.**

**Headline:** v1 → v2 improved 30% → 50%. Cert-errors, Leafly false-positive, and subdomain-probing noise are all fixed. What's left is a concentrated failure mode: **7 of the 8 misses are stores whose menu embed is not present in any URL the scanner probes** (root / /menu / /shop / /order / subdomain). The embed is either loaded post-click, lives at an unusual path, or the DB designation is stale.

**Run ID:** `10cc92e4-40e6-439a-9f9e-409f98d6ee6c`.

---

## What the fixes did

All six fixes from audit/28 applied and deployed:

| # | Fix | Evidence it worked |
|---|---|---|
| 1 | VPS waitMs default 15 → 25s | Ambient improvement — no empty-timeout rows where v1 had them; retry flag available but skipped in the actual run due to WORKER_RESOURCE_LIMIT on first attempt (see "Bugs found during v2" below) |
| 2 | `--ignore-certificate-errors` on VPS | **Anacortes Cannabis** (v1: `ERR_CERT_COMMON_NAME_INVALID`, v2: posabit detected ✓). **Freeland Cannabis** (v1: cert error, v2: **posabit detected — new designation** for previously-undesignated store) |
| 3 | Pass 1 skip subdomain probing on substantive root | Error count in Pass 1 dropped 16→2. Remaining 2 errors are `order.*` probes on stores where the root was NOT substantive enough to trigger skip — minor |
| 4 | Tightened Leafly regex | **2020 Cannabis Solutions** (v1 Pass 1: leafly false-positive, v2 Pass 1: **dutchie correctly detected** ✓). Was the only FP in v1 and is now gone |
| 5 | Retry on empty (Pass 2) | Implemented but not exercised in this run — see bug #1 below |
| 6 | Upsert on (run_id, store_id, pass) | No duplicate rows in `platform_verification` for this run, including across the batch retries |

Individual fixes 1-4 and 6 are **verified working**. Fix 5 is implemented but not actually tested in this pilot (see bug discussion below).

---

## Accuracy table

| Category | Expected | Correct | Wrong | Errored | Details |
|---|---|---:|---:|---:|---|
| POSaBit (5 stores) | posabit | **3** | 0 | 0 | 112th St ✓, American Harvest ✓, Anacortes ✓. Caravan / Cascade Herb returned `none` |
| Dutchie (5 stores) | dutchie | **2** | 0 | 0 | The Vault ✓, 2020 Cannabis Solutions ✓. Orchards / Uncle Willie's / Floyd's returned `none` |
| Jane (3 stores) | jane | **2** | 0 | 0 | The Link ✓, Marijuana Mercantile ✓. Green Lady Hawks Prairie returned `none` |
| Leafly (1 store) | leafly | **1** | 0 | 0 | Fire Cannabis ✓ |
| Undesignated (3 stores) | unknown | **1 new** | — | 0 | Freeland Cannabis → posabit (new detection). Cannabis Provisions / W.C.W. returned `none` — inconclusive without manual spot-check |
| Chain relationships (3 stores) | varies | **1** | 0 | 0 | PRC Edmonds: dutchie → **jane** (correctly reflects PRC chain-is-Jane per Chaz's Pass 1). CRAFT / DANK'S Tacoma should inherit Dutchie per audit/22 but returned `none` |
| **TOTAL** | | **10/20** | **0** | **0** | 50% accuracy. +20 points vs v1 (30%). No false positives. No scanner errors. Floor is detection gap, not detection error. |

**Strict 10/20 = 50%.** If the two "no signal" undesignated stores (Cannabis Provisions, W.C.W.) turn out to genuinely have no online menu, that lifts the effective score to 12/20 (60%). Still below 16/20 threshold.

---

## Per-store detail

| # | Store | Expected | Detected | Resolved by | Duration (s) | Confidence | Needs creds | Notes |
|---:|---|---|---|---|---:|---|---|---|
| 1 | 112th Street Cannabis | posabit | **posabit** | Pass 2 | ~30 | medium | true | Correct. MCX cred roundtrip failed — flagged |
| 2 | American Harvest | posabit | **posabit** | Pass 2 | ~30 | medium | true | Correct |
| 3 | Anacortes Cannabis | posabit | **posabit** | Pass 2 | ~30 | medium | true | **Cert fix unblocked.** Correct |
| 4 | Caravan Cannabis | posabit | none | — | ~30 | low | — | iframe_count=0, all subpaths 404. POSaBit widget didn't render even with 25s wait |
| 5 | Cascade Herb | posabit | none | — | ~30 | low | — | Same failure pattern as Caravan — iframe_count=0, menu not in probed URLs |
| 6 | The Vault Cannabis | dutchie | **dutchie** | Pass 1 | 0.1 | high | — | Cleanest Pass 1 hit of the run (2 signals) |
| 7 | 2020 Cannabis Solutions | dutchie | **dutchie** | Pass 1 | 0.2 | medium | — | **Regex tightening fix unblocked.** Correct |
| 8 | Orchards Cannabis Market | dutchie | none | — | ~30 | low | — | iframe_count=0. /menu, /shop, /order all 404. No Dutchie embed anywhere scanner looked |
| 9 | Uncle Willie's Cannabis | dutchie | none | — | ~30 | low | — | Same pattern — iframe_count=0. Root clean, all subpaths 404, subdomains DNS-fail |
| 10 | Floyd's Cannabis Company | dutchie | none | — | ~30 | low | — | Same pattern |
| 11 | The Link | jane | **jane** | Pass 1 | 1.0 | medium | — | Pass 1 HTTP caught iheartjane iframe in the root HTML |
| 12 | Green Lady Hawks Prairie | jane | none | — | ~30 | low | — | iframe_count=4 but all Google Maps. `/shop` returned 200 but no Jane signals there either |
| 13 | The Marijuana Mercantile | jane | **jane** | Pass 2 | ~30 | medium | — | Correct. Caught by Pass 2 (Pass 1 missed — likely JS-injected) |
| 14 | Fire Cannabis Co | leafly | **leafly** | Pass 1 | 0.4 | medium | — | Correct |
| 15 | Freeland Cannabis | null | **posabit** | Pass 2 | ~30 | medium | true | **Cert fix + new designation.** Pass 1 v1 cert-errored, Pass 2 v2 detected POSaBit |
| 16 | Cannabis Provisions Inc | null | none | — | ~30 | low | — | Genuine no-menu plausible — needs spot-check |
| 17 | W.C.W. Enterprises | null | none | — | ~30 | low | — | Genuine no-menu plausible — needs spot-check |
| 18 | CRAFT Cannabis (Vancouver) | chain: dutchie | none | — | ~30 | low | — | **Expected Dutchie per audit/22.** Scanner missed. Chain hypothesis: Dutchie-on-Andresen may not apply to all CRAFT locations |
| 19 | DANK'S Tacoma | chain: dutchie | none | — | ~30 | low | — | **Expected Dutchie per audit/22.** Scanner missed. Chain hypothesis uncertain |
| 20 | PRC Edmonds | chain: jane (DB: dutchie) | **jane** | Pass 1 | 0.1 | medium | — | **Correctly corrects DB mis-designation.** Pass 1 HTTP caught iheartjane iframe directly |

---

## Error pattern analysis — the 8 misses

There are two distinct failure modes in the misses. Neither is "scanner broken"; both are "embed not present where scanner looked."

### Pattern A: iframe_count = 0, all subpaths 404 (5 stores)

**Stores:** Orchards Cannabis Market, Uncle Willie's Cannabis, Floyd's Cannabis Company, Caravan Cannabis Company, Cascade Herb Company.

**Evidence** (representative — Uncle Willie's):
- Root (200): iframe_count 0, no embed
- `/menu`, `/shop`, `/order`, `/menu/`, `/order-online` — all **404 Not Found**
- `menu.`, `shop.`, `order.` subdomains — **DNS errors**
- No nav_error, no JS crash — scanner just never saw a menu URL

**Interpretation:** The menu embed is either:
1. **Behind an in-page interaction** (clicking "Order Online" opens a modal that injects the iframe; scanner never clicks anything)
2. **At an unusual path** (`/products/`, `/locations/.../menu`, `/cannabis-menu`, etc.)
3. **DB designation is stale** — stores may have dropped online menus or switched platforms without the intel catalog updating

I can't distinguish (1) vs (2) vs (3) from the scanner output alone. This needs a **manual spot-check** — Chaz opens 2 of these sites (say Floyd's and Uncle Willie's) and confirms whether there's an embedded Dutchie menu, and if so where.

**Smallest fix that would resolve it (if (1) or (2)):**
- Add a "interaction probe" step in `detectPlatformOnce`: if root scan returned 0 iframes, click any element matching `a,button` containing text `/menu|shop|order|buy/i`, wait 5s, rescan. This gets us past the "click to open menu" modal pattern.
- Add `/products`, `/cannabis`, `/dispensary-menu` to the subpath list.

Would estimate another ~2 hours of VPS work. Not going to apply blind — want Chaz's manual-check result first to confirm (1)/(2) is actually the cause.

### Pattern B: iframe_count > 0 but embeds are unrelated (1 store)

**Store:** Green Lady Hawks Prairie.

**Evidence:** Root has 4 iframes, all Google Maps (location maps for each chain location). `/shop` returns 200 but no Jane signals. Other subpaths 404.

**Interpretation:** Jane iframe embedded on a different page. Possible paths: `/order-online`, `/shop/hawks-prairie`, `/menu/hawks-prairie`. Pattern is similar to A — need click-interaction or deeper path probing.

### Pattern C: Chain store, no embed on root (2 stores)

**Stores:** CRAFT Cannabis (Vancouver) and DANK'S Tacoma.

**Evidence:** Both follow Pattern A — iframe_count=0, all subpaths 404. Same "embed not where scanner looked" failure.

**But these are interesting for a different reason:** audit/22 established these chains are Dutchie based on sibling-location designations. The scanner NOT finding Dutchie on CRAFT Vancouver / DANK'S Tacoma is weak evidence against the chain hypothesis — but it's not proof. Could just be Pattern A again.

---

## Is it a pattern or a one-off?

**It's a clear pattern.** 6 of 8 misses match Pattern A (post-click modal or unusual path). 1 matches B. 2 are chain stores where we expected Dutchie but the pattern-A failure hides what's there.

The scanner is accurate when the embed is **in the initial HTML of any probed URL**. It's blind when the embed is:
- Generated by a click-driven state change
- On a non-standard URL path
- Inside an iframe that's itself inside an iframe

These are all solvable with more engineering, but they are **architectural** enhancements, not one-line fixes.

---

## Bugs found during v2

### 1. `retryEmpty: true` hit WORKER_RESOURCE_LIMIT

First Pass 2 batch invocation with 5 stores + retryEmpty + 25s wait tripped Supabase's edge-function resource cap (`WORKER_RESOURCE_LIMIT`). Had to fall back to `retryEmpty: false` for the rest of the run. The retry logic is implemented but not actually proved-out in this pilot.

**Why:** With 5 stores in a chunk × 25s wait × 5 parallel inside VPS × potential retry (doubling the call), the edge function holds open a 60+ second async operation with a lot of in-memory state. Supabase's newer worker limits likely count "connection held open" more strictly.

**Fix for v3:** move the retry-empty logic out of the edge function entirely. Run Pass 2 non-retry; collect the empty IDs; re-run Pass 2 over just those IDs in a second invocation. Keeps any single edge call short.

### 2. Pass 1 error count: 2 remaining

Anacortes and Freeland had `order.*` subdomain probes that DNS-failed, getting logged as `scan_error`. These are stores where the root page wasn't "substantive enough" to trigger the skip-subdomain branch — probably short body, below the 1500-byte floor I set.

**Fix:** lower the substantive-root threshold from 1500 bytes to 500 bytes, OR drop `order.*` probing entirely (it almost never resolves in practice).

---

## Gate decision: REVIEW NEEDED

Per the decision rules:
- **≥16/20** → pilot passed (would proceed to 560-store run)
- **12-15/20** → third iteration of scanner fixes
- **<12/20** → **REVIEW NEEDED** ← we are here at 10/20

A third iteration on pilot alone won't close the gap. The misses are **structural**: stores whose menus are click-triggered or at unusual URLs. Fixing the scanner to catch them requires:

1. Adding an interaction step (click buttons, wait, rescan) — non-trivial on VPS, introduces bot-detection risk
2. Manual spot-check of 2-3 of the Pattern A stores to confirm whether the DB designations are stale vs the embeds are just hidden
3. A decision on how aggressive we want the scanner to be (click-the-buttons vs trust-the-HTML)

**Proposed next steps for Chaz's review:**

1. **Manual spot-check of Floyd's Cannabis Company** (`https://www.floyds-cannabis.com/stores/floyds-cannabis-dispensary-pullman-wa/`) and **Uncle Willie's Cannabis** (`https://www.unclewilliescannabis.com/`). 5 minutes each. Confirm:
   - Is there an embedded Dutchie menu? Where?
   - Is it click-triggered, or on a specific subpath?
   - Or is the DB designation stale (they moved off Dutchie)?

2. Based on spot-check outcome, one of:
   - **If embeds are click-triggered:** add VPS interaction-probe step, re-pilot
   - **If embeds are on unusual paths:** expand subpath list, re-pilot
   - **If DB is stale:** accept `none` as the correct answer and update the store's `designated_scraper` to null. This would raise the pilot score substantially

3. **Reject the premise that we need 80% from pilot-style scanning.** The verification could instead feed a "stores with unclear detection" queue that Chaz walks manually via F12 at his normal pace. That's effectively what audit/21's 53-store export already did. The scanner catches the clean ~50-60%; the long tail gets human-verified.

4. **Decide whether to proceed with the 560-store run as-is.** At 50% accuracy, it would verify ~280 stores and flag ~280 as `none` for manual review. That's still useful if manual review is a planned step. The pilot fails the *threshold* but produces useful signal.

---

## Time budget (for context)

- Pass 1: ~30s for 20 stores (mostly HTTP, very fast)
- Pass 2: ~4-5 minutes total across 5 sub-batches (chunkSize 2-5, waitMs 25s, no retry)
- Full pilot wall-clock: ~6-7 minutes (plus human time for batch orchestration)

At this rate, 560-store Pass 2 would take ~4-5 hours. Fits inside an overnight window. Edge Function worker limits force ≤5-store chunks; pg_cron + cursor-batching is still the right pattern for production.

---

## Appendix: raw_response shape observed

For reference (Uncle Willie's Cannabis, Pass 2):

```json
{
  "detected": [],
  "http_status": 200,
  "iframe_count": 0,
  "iframe_srcs": [],
  "nav_error": null,
  "probed_attempts": [
    {"url": "/menu", "http_status": 404, "detected": []},
    {"url": "/shop", "http_status": 404, "detected": []},
    {"url": "/order", "http_status": 404, "detected": []},
    ...
    {"url": "menu.unclewilliescannabis.com", "http_status": 0, "detected": []}
  ],
  "signals": {},
  "url": "https://www.unclewilliescannabis.com/"
}
```

`probed_attempts` is rich debug data from the VPS — shows every URL tried and its HTTP status. This is what we'd want to expose in a "why didn't this detect?" UI for Chaz to audit individual stores.
