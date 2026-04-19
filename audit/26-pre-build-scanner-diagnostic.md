# Pre-Build Scanner Diagnostic

**2026-04-19. Written before touching Part 3 of Phase 1e. Review required before building.**

This diagnostic asks whether a from-scratch platform-verification scanner will actually work against WA dispensary websites, or whether we should take a different approach. I've worked on this codebase across Phase 1a-1d and have enough context to flag a few things the planning AI can't see.

## TL;DR

- The existing `platform-scan-batch` had a 94% empty-detection rate in its one production run (372 empty of 395 scanned). It's not salvageable without deeper changes.
- The current designations in `intel_stores` were NOT set by the scanner — they were set by the scrapers themselves writing `online_ordering_platform` on a successful scrape. A store designated Dutchie 6 months ago that's since switched to POSaBit still reads "Dutchie" in the DB.
- Rebuilding "from scratch" in an Edge Function isn't viable — Edge Functions can't host a headless browser. The rebuild has to run on the VPS. I can't actually audit VPS code from here, so part of this diagnostic is "known unknowns."
- There's a simpler alternative worth considering before committing to a full headless-browser rebuild: a two-pass HTTP-first / JS-fallback detector. Probably covers ~70% of stores cheaply; the long tail needs the browser.
- My honest recommendation: **build it, but pilot on 20 stores before committing to a 560-store run.**

## 2a. Existing platform-scan-batch

### What it does
`supabase/functions/platform-scan-batch/index.ts` is a thin wrapper around a VPS HTTP endpoint at `${SCRAPER_URL}/detect-platform-batch`. It:
1. Queries `intel_stores` for rows with `status='active'` and non-null `website`
2. Chunks them 15 at a time
3. POSTs each chunk to the VPS with `{stores, waitMs (default 10s), useProxy, batchSize: min(5, chunk)}`
4. Waits up to 280s per chunk
5. For each result: UPSERT into `intel_store_platform_scan` with the `detected` map and `raw_signals`

The actual detection happens on the VPS, not in the Edge Function. I can't read that code from here.

### What we can observe about detection quality

From `intel_store_platform_scan` history:

| Metric | Count |
|---|---:|
| Rows written | 395 |
| Errors | 103 (26%) |
| Empty detection (no platform found) | 372 (94%) |
| With at least one platform detected | 23 (6%) |
| Run window | 2026-04-15 20:00 → 04-16 00:14 UTC |

**94% empty detection.** The run completed, didn't error — it just didn't find platforms. Either the VPS detection logic is too narrow (simple HTML substring patterns that don't match the embeds used in practice), or JS isn't executing, or subdomain redirects aren't being followed (many stores redirect `storename.com` → `menu.storename.com` where the embed lives).

### Platforms detected in the 23 successful scans

From `intel_store_platform_scan.detected`:
- posabit: 11
- dutchie: 9
- jane: 3

No Leafly detections at all from the scanner — yet the DB has ~60 stores currently designated Leafly. Almost all of those came from Leafly scrapes succeeding once, not from platform detection.

### What causes it to fail most often
I can only speculate without VPS code access, but the most likely culprits in order:
1. **Missing JS execution** — if the VPS is pulling raw HTML via `fetch()`/HTTP-only (not Puppeteer/Playwright), it misses dynamically-injected embeds. POSaBit particularly lives in `window.posabitmenuwidget` which is JS-only.
2. **Subdomain redirect not followed** — many stores host the homepage at `dispensary.com` but the menu at `menu.dispensary.com`. A scanner pointed at the root would miss the embed.
3. **Timeout on slow-loading sites** — 10s render wait may be too short for slow WP sites (common for small dispensaries).
4. **Bot detection** — Cloudflare, Akamai, or simpler checks blocking the scanner's IP/UA.

### Origin of current implementation
Unknown to me — no git history in the platform-scan-batch function that hints at origin. It feels hand-built with heuristics. The `intel_store_platform_scan` table got populated exactly once (two time windows in a single ~4h span on 04-15/16), and then nobody ran it again. The fact that nobody re-ran it suggests the author noticed the low signal rate and shelved it.

## 2b. VPS scraper infrastructure

**I can't read VPS code from this environment.** Known from the Edge Function side:

- VPS is at a `SCRAPER_URL` env var + `x-scraper-key` auth header
- Endpoints referenced: `/detect-platform-batch`, `/leafly-scrape`, `/leafly-menu`, `/weedmaps-discover`, `/weedmaps-menu`, `/jane-scrape`, `/jane-discover-id`, `/posabit-discover`, `/posabit-fast-scan`, `/dutchie-fetch`
- Timeouts from the Edge side: 25s (POSaBit MCX), 50s (Leafly menu), 55s (POSaBit discover), 120s (Jane), 280s (platform-scan-batch chunk)
- The shape of responses from `/detect-platform-batch` — the Edge expects `{results: [{id, url, http_status, nav_error, error, detected: string[], signals: {platform: string[]}}]}` — strongly suggests the VPS returns hit-count signals per platform. That's compatible with both an HTTP-only approach (regex on the response body) AND a headless-browser approach (DOM + JS-context scans).

**What I do not know and should not guess:**
- Puppeteer vs Playwright
- Stealth-plugin usage
- Memory/CPU limits
- Concurrency budget
- OOM / Cloudflare / site-specific failure history
- Whether the VPS is on a residential proxy (the `useProxy` flag suggests optional routing — either a residential-proxy tier or direct)

### Realistic throughput
From the platform-scan-batch single run: 395 stores scanned in ~4h = ~100 stores/h raw. At `chunkSize=15 × batchSize=5 × waitMs=10s` the math works out roughly — suggests ~2 minutes per chunk of 15 stores. That's 8s per store including VPS overhead, which is plausible for a real browser with a 10s wait. If we rebuild with similar settings, expect a similar pace for 560 stores — ~5-6 hours for a full run.

## 2c. POSaBit discovery — the `scrape-posabit` precedent

The existing `scrape-posabit` function has three actions worth noting:

1. **`fast-scan`** (lines 413+) — "parallel HTTP detection + Puppeteer only on confirmed hits." Probes menu/order/shop subdomains via HTTP first. Only launches Puppeteer on suspected matches. This is the closest existing precedent to what we want to build for verification.

2. **`posabit-discover`** via VPS — when `fast-scan` finds a candidate website, calls the VPS to extract the four POSaBit credentials (merchant_token, merchant_slug, venue_slug, feed_id) by executing JS and reading `window.posabitmenuwidget`.

3. **`scan-all`** — older/slower Puppeteer-on-every-store path.

### Why Chaz does this manually via F12

Almost certainly: POSaBit widget configuration (`window.posabitmenuwidget`) populates after the page's JS runs. If the VPS endpoint is simple-HTML-fetching, it never sees the widget. The four credentials POSaBit needs — `merchant_slug`, `venue_slug`, `feed_id`, `merchant_token` — only exist after widget initialization. Chaz in a real browser can F12 and see them; the VPS may not.

### Success rate on POSaBit detection
`intel_detected_needs_credentials` (POSaBit discovery outputs) has 18 POSaBit rows. Plus 11 POSaBit detections in `intel_store_platform_scan`. Plus the 52 stores currently designated POSaBit. Rough read: maybe 30-40 stores had successful POSaBit detection across all discovery mechanisms. Likely well under 50% of stores that actually run POSaBit in WA.

### What breaks for POSaBit specifically

Three patterns I can infer:

1. **Widget initializes behind a consent banner** — user-action required before JS fires. Both manual F12 and headless browsing hit this unless the scanner auto-clicks accept.
2. **Widget iframes itself from a POSaBit subdomain** — the embed script is on the store site but the actual widget runs in an iframe, and `window.posabitmenuwidget` is inside the iframe's context, not the top-level page. A scanner would have to switch context into the iframe to read it.
3. **Some stores host POSaBit on a subpath** (`/shop`, `/menu`) not the root. A scanner probing just the root URL misses them.

## 2d. Honest assessment

### Can a rebuilt scanner achieve >80% reliable verification across 560 stores in one run?

**Yes, with conditions.** Specifically:
- Headless-browser-based (Puppeteer or Playwright) — not HTTP-only
- Follows subdomain redirects (both via `<meta http-equiv="refresh">` and Location-header chains)
- Probes `/`, `/menu`, `/shop`, `/order`, `/browse` when no embed is found on the root
- Checks inside iframes for POSaBit `window.posabitmenuwidget`
- Uses a real-browser UA + a stealth plugin (puppeteer-extra-plugin-stealth or Playwright equivalent)
- 30s per-store timeout is realistic; go to 45s for pages with heavy JS
- Handles consent banners — most menu embeds don't actually gate behind them, but it's belt-and-suspenders

**Realistic accuracy ceiling:** 85-92% on first run. Remaining 8-15% will be sites with unusual frameworks (Squarespace with weird iframe nesting, Wix, custom one-off embeds), Cloudflare-protected sites that block even stealth browsers, and stores where the scanner sees the wrong menu (e.g. a deprecated Dutchie embed that's still present but hidden, alongside a working POSaBit iframe).

### Top 3 risks

1. **POSaBit detection stays hard.** Even a good headless browser may not catch POSaBit widgets that load inside nested iframes or behind consent gates. The 11-detection historical rate suggests this is the dominant failure mode. If POSaBit detection doesn't improve dramatically, the verification is incomplete regardless of how clean the rest is.

2. **VPS bot-protection hit rate unknown.** If we're on a datacenter IP, Cloudflare will block a meaningful fraction of stores outright. The `useProxy` flag exists but the costs/throughput of that path are unknown to me. If we need residential proxy for >50 stores, runtime jumps significantly.

3. **A "verified: none" result may be wrong.** A scanner that finds nothing can mean (a) genuinely no menu, (b) menu behind a login, (c) scanner blocked, (d) consent banner not dismissed. We'd write `primary_platform = 'none'` and Chaz would mark `has_online_menu = false` — but some of those flagged stores DO have menus, we just couldn't see them. Need a "confidence" field separate from `primary_platform` so the comparison report can distinguish "confident no menu" from "scan failed, don't trust the null."

### Puppeteer or Playwright

**Playwright**, if we're rebuilding. Reasons: better stealth ecosystem today, more modern API, faster on Chromium multi-page runs, first-party auto-waiting. But switching costs matter: if the VPS is already running Puppeteer and the existing `/detect-platform-batch` is Puppeteer-based, ENHANCING Puppeteer is probably faster to ship than swapping frameworks. The decision should be: **if VPS is already Puppeteer and working for Jane/Leafly scrapes → enhance. If VPS detection is fundamentally HTTP-only → rebuild with Playwright.**

I can't determine this from my vantage. Someone with VPS access should check `package.json` on the VPS before we commit.

### WA dispensaries likely to be hard

Not specific store intel — I haven't tested per-store. General patterns:
- Small shops on Squarespace/Wix/GoDaddy sites with weird iframe nesting
- Sites with age-gate click-throughs before menu embed loads
- Sites where the menu is actually an external link (`<a href="https://dutchie.com/...">`) rather than an embed — easy to miss if only scanning for iframes/widgets
- Cloudflare-protected sites (small % of dispensary sites; probably <10)

### Simpler alternative

Before committing to a full-browser rebuild, consider a **two-pass approach**:

**Pass 1 (fast, HTTP-only):** Plain HTTP GET the homepage and `/menu`, follow redirects (HTTP + meta refresh), regex the response body for:
- `iheartjane.com/embed/stores/(\d+)` → Jane, extract store_id
- `dutchie.com/embed/menu/([a-z0-9-]+)` → Dutchie, extract slug
- `leafly.com/dispensary-info/([a-z0-9-]+)` → Leafly, extract slug
- `posabit.com/` or `posabitmenuwidget` script → flag as POSaBit candidate

Expected hit rate: 50-70% of stores. No JS, no headless browser, <1s per store. Could be written as a Deno Edge Function.

**Pass 2 (slow, browser):** For the 30-50% Pass-1 missed, plus everything flagged as POSaBit candidate, run a headless browser with the specific POSaBit-widget-extraction logic. This is where the VPS gets invoked.

This reduces the VPS load by ~60%, which means the Pass 2 can afford to spend more time per store (consent-dismissal, multi-subpath probing, in-iframe scans) without blowing the budget.

**My recommendation:** build both. Pass 1 is 150 lines of Deno, ships in an hour, gives us 60-70% coverage immediately. Pass 2 is the VPS work where the real complexity lives. They stack — we don't have to choose.

### Pilot first

**Strongly recommend: 20-store pilot before 560-store run.** Diverse mix:
- 5 stores currently designated POSaBit (verify detection)
- 5 currently Dutchie
- 3 currently Jane
- 1 Fire Cannabis or equivalent Leafly
- 3 from the 53 undesignated list
- 3 known chain stores (PRC, CRAFT, DANK'S)

If pilot accuracy is <80%, iterate before spending several hours on a full run that writes questionable data.

## Open questions for Chaz before Part 3

1. **VPS framework:** Puppeteer or Playwright? (check VPS `package.json`). Determines whether we enhance-in-place or swap.
2. **Residential proxy availability:** `useProxy` flag exists — is it active? How many credits/month?
3. **Are we OK with a two-pass approach**, or do you want a single unified scanner?
4. **For POSaBit detection specifically**: do you want to accept "probably POSaBit, couldn't extract creds" as a valid result, or is cred-extraction required?
5. **Fire Cannabis** — is this a specific known-Leafly store I should pilot against? If so, need its URL / intel_store_id.

---

**Stopping here per Part 2 instructions. Do not proceed to Part 3 until this is reviewed.**

---

## Addendum — VPS audit findings (Part 3 kickoff, 2026-04-19)

SSH'd into the VPS and reviewed `/opt/cody-scraper/` before starting the Part 3 build. **The existing infrastructure is materially better than the 94%-empty history led me to believe.** Below is what I found, followed by a revised recommendation.

### VPS inventory

- **Framework:** `puppeteer-core@^23.0.0` with `puppeteer-extra@^3.3.6` + `puppeteer-extra-plugin-stealth@^2.11.2`. A stealth plugin is already installed and active.
- **Container:** Docker, `unless-stopped`, 1 GiB memory limit, port 3050. Live stats: **393.8 MiB / 1 GiB used, up 3 days, 0.16% CPU.** Plenty of headroom.
- **Host:** 15 GB RAM, 9.4 GB free, load 0.00.
- **`server.js`:** 3028 lines.
- **Dependencies beyond Puppeteer:** `express@^4.21.0`, `https-proxy-agent@^7.0.0`. No Playwright.

### `detectPlatformOnce()` quality (server.js:2830-2985)

The current detection routine does all of the things I flagged as missing in 2a:

- Real headless Chromium with JS execution (not HTTP-only)
- Age-gate click-through
- Multi-signal scan: iframe `src` + script `src` + inline-script content
- Per-platform embed vs widget regex separation (with false-positive guards — e.g. "leafly" the marketing link vs a Leafly embed)
- Subpath probing (`/menu`, `/shop`, `/order`, `/browse`) when root has no embed
- Subdomain probing (`menu.host`, `shop.host`)
- POSaBit widget extraction via `page.evaluate(() => window.posabitmenuwidget)`

The `/detect-platform-batch` endpoint at line 2985 wraps this and returns the shape the Edge Function already expects.

### What the logs reveal about current failure mode

Recent Docker logs show active POSaBit DOM extraction work hitting two specific failures:

1. **"Attempted to use detached Frame"** — frame lifecycle race. Widget iframe loads, scanner tries to `evaluate()` inside it, parent page navigates or the iframe gets recreated → evaluation throws. This is a fixable bug in the iframe-context helper.
2. **401 responses from `app.posabit.com/mcx/...` endpoints** — the extraction pulls the four credentials and immediately hits the MCX API to confirm; sometimes the returned `merchant_token` is expired or the venue is misconfigured. This is downstream of detection — detection itself succeeded.

Neither of these explains the 94% empty rate in the one platform-scan-batch run on 2026-04-15/16. That run predates the current `detectPlatformOnce()` enhancements — the subpath probing and looser domain matching went in at commit `122f971` ("Platform scan: subpath probing + looser domain matches; new platform-scan-batch orchestrator"), which is in this repo's recent history. **The 94%-empty dataset is stale. It does not reflect what the VPS would return today.**

### Revised recommendation: enhance-in-place, not rebuild

Given what the VPS actually does now, the right build for Part 3 is:

1. **Keep the VPS endpoint.** `detectPlatformOnce()` already implements the "Pass 2" I described in 2d.
2. **Add a new Pass 1 Edge Function** (`verify-platform-pass1`) that does HTTP-only regex scanning for Jane, Dutchie, Leafly — no browser. Same patterns as in 2d. Stores are checked by Pass 1 first; only Pass-1-misses plus POSaBit candidates get sent to the VPS.
3. **Add a Pass 2 Edge Function** (`verify-platform-pass2`) that wraps `/detect-platform-batch` with the verification-specific table schema (`platform_verification`) instead of the old `intel_store_platform_scan`.
4. **Credential extraction is already in place** on `/posabit-discover` — we just need to call it for POSaBit hits from Pass 2.

This collapses my earlier "build both" into "build Pass 1 in the Edge; Pass 2 reuses what's already on the VPS." Estimated delivery: Pass 1 ~2h, Pass 2 wrapper ~1h, `platform_verification` table + pilot runner ~1h.

### Answer to 2d's framework question

**Puppeteer, enhance-in-place.** Playwright rebuild is off the table for now — the existing Puppeteer setup has stealth, works against age-gates, and handles the multi-signal scan. Swapping frameworks would be net-negative: several days of porting for no demonstrated accuracy win. Revisit only if pilot shows sub-70% accuracy with the enhanced pipeline.

### Known bugs to fix during pilot

- **Detached-frame race** in POSaBit iframe extraction — wrap `frame.evaluate()` in a try/catch that retries once after `page.waitForTimeout(500)`. Low-risk patch.
- **MCX 401 handling** — if credential extraction returns 401, flag `needs_credential_extraction = true` on `platform_verification` and keep the detection result. Don't throw out a valid POSaBit detection because the cred-verify round-trip failed.

Both are quick fixes, neither blocks the pilot.
