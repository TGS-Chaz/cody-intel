# Phase 1j Sub-stage B — Jane Scraper Selector Refresh

**2026-04-20. Sub-stage A flagged 5 Phase-1h-jane detections that Stage 4 + Sub-stage A both returned `none`. Investigation: Jane migrated its client bundle from `iheartjane.com` to `tags.cnna.io/jane.{hash}.js`. The scanner's regex still only matched the legacy `iheartjane.com` domain. Refreshed detectors on both Pass 1 and Pass 2 and rescanned. 5/5 original stores now detect as Jane (6/6 counting a bonus Tacoma POT ZONE). Total v2 Jane stores: 84 (up from 79).**

## Discovery

### The 5 target stores

| v2 row | Website |
|---|---|
| HASHTAG CANNABIS (Redmond) | https://seattlehashtag.com/ |
| POT SHOP (Seattle) | https://www.potshopseattle.co/ |
| MARY MART INC (Tacoma) | https://www.marymart.com/ |
| POT ZONE (Port Orchard) | https://www.potzone420.com/potzone-port-orchard-location |
| THE FIRE HOUSE (Ellensburg) | https://www.firehousenw.com/ |

### HTML inspection

Dumped `https://www.marymart.com/order` via headless browser (the `/order` subpath is where the Jane widget actually lives; the root page is marketing). Saved to `audit/logs/jane-selector-refresh.html` (147 KB).

Jane-related markers found (grep of the captured HTML):

```
<script async="" src="//mj-snowplow-static-js.s3.amazonaws.com/cnna.js"></script>
<script async="" type="text/javascript" src="https://tags.cnna.io/adapters.531d282f.js"></script>
<script async="" type="text/javascript" src="https://tags.cnna.io/tracker.ea01267b.js"></script>
<script async="" type="text/javascript" src="https://tags.cnna.io/ecommerce.66b8c4d7.js"></script>
<script async="" type="text/javascript" src="https://tags.cnna.io/ecommerce.8bef9180.js"></script>
<script async="" type="text/javascript" src="https://tags.cnna.io/jane.d0089c80.js"></script>
<script id="" charset="" type="text/javascript"
  src="https://tags.cnna.io/?appId=f0f24868-2d29-4003-bfb4-88570be02cac&amp;environment=jane&amp;s1=...&amp;version=2"></script>
```

**Zero `iheartjane.com` references.** The canonical Jane integration is now:
- **Client bundle:** `https://tags.cnna.io/jane.{hash8}.js` (hash varies per deploy)
- **Adapters:** `https://tags.cnna.io/adapters.{hash8}.js`
- **Ecommerce:** `https://tags.cnna.io/ecommerce.{hash8}.js` (sometimes loaded twice — old + new versions)
- **Tracker:** `https://tags.cnna.io/tracker.{hash8}.js`
- **Tracking beacon:** `https://tags.cnna.io/?appId={uuid}&environment=jane&...`
- **Analytics bootstrap:** `//mj-snowplow-static-js.s3.amazonaws.com/cnna.js`

The `appId={uuid}&environment=jane` tracking-beacon signature is the strongest single tell. `tags.cnna.io/jane.*.js` is also unambiguous.

## What was stale

### Pass 1 (HTTP regex — cody-crm `supabase/functions/verify-platform-pass1/index.ts`)

```ts
jane: [
  /<iframe[^>]*src=["'][^"']*iheartjane\.com\/embed\/stores\/(\d+)/i,
  /<iframe[^>]*src=["'][^"']*iheartjane\.com\/stores\/(\d+)/i,
  /<script[^>]*src=["'][^"']*iheartjane\.com[^"']*["']/i,
  /data-jane-embed/i,
],
```

Every pattern keyed on `iheartjane.com`. None match `tags.cnna.io/jane.{hash}.js`. Modern Jane stores return `none` from Pass 1.

### Pass 2 (VPS `server.js` — `scraper-service/server.js`)

Two places:

**Line 97 — `EMBED_PATTERNS`:**
```js
{ platform: "jane", re: /iheartjane\.com/i },
```

**Line 2856 — `DETECT_CONFIG.jane`:**
```js
jane: {
  embed:  /iheartjane\.com/i,
  widget: /(?:jane-app-settings|window\.iHeartJane|iHeartJaneConfig)/i,
},
```

Again, all `iheartjane.com` / `iHeartJane*` globals. No `tags.cnna.io` awareness. The `window.iHeartJane*` globals also don't seem to exist on modern Jane sites (confirmed in the HTML dump — no jane-ish `window.*` globals at all).

## Changes applied

### cody-crm Pass 1 — added 5 new patterns (kept all 4 legacy as fallback)

```ts
jane: [
  // Legacy iheartjane.com — kept as fallback for stores that haven't migrated yet.
  /<iframe[^>]*src=["'][^"']*iheartjane\.com\/embed\/stores\/(\d+)/i,
  /<iframe[^>]*src=["'][^"']*iheartjane\.com\/stores\/(\d+)/i,
  /<script[^>]*src=["'][^"']*iheartjane\.com[^"']*["']/i,
  /data-jane-embed/i,
  // 2026-04-20 refresh (audit/43). Jane migrated their client bundle to
  // tags.cnna.io/jane.{hash}.js and a tags.cnna.io/?environment=jane tracking beacon.
  /<script[^>]*src=["'][^"']*tags\.cnna\.io\/jane\.[a-f0-9]+\.js/i,
  /<link[^>]*href=["'][^"']*tags\.cnna\.io\/jane\.[a-f0-9]+\.js/i,
  /<script[^>]*src=["'][^"']*tags\.cnna\.io\/[^"']*environment=jane/i,
  /tags\.cnna\.io\/jane\.[a-f0-9]+\.js/i,   // bare-text fallback (link preloads)
  /environment=jane[&"'\s]/i,               // tracking beacon query param
],
```

### cody-crm VPS `scraper-service/server.js`

EMBED_PATTERNS (line 97):
```js
{ platform: "jane", re: /iheartjane\.com|tags\.cnna\.io\/jane/i },
```

DETECT_CONFIG.jane (line 2856):
```js
jane: {
  embed:  /iheartjane\.com|tags\.cnna\.io\/jane\.[a-f0-9]+\.js|tags\.cnna\.io\/[^"'\s]*environment=jane/i,
  widget: /(?:jane-app-settings|window\.iHeartJane|iHeartJaneConfig|mj-snowplow-static-js\.s3|tags\.cnna\.io\/jane)/i,
},
```

Legacy patterns retained as alternation branches so stores on either Jane version detect correctly.

## Deployment

- **Pass 1:** deployed via `supabase functions deploy verify-platform-pass1`.
- **Pass 2 (VPS):** `scp server.js vps:/opt/cody-scraper/server.js`, then `docker-compose down && docker-compose up -d --build` to rebuild + restart the `cody-scraper_scraper_1` container. Container uptime at 6 s post-restart; `/health` returned `{"status":"ok"}`.

## Rescan results (Stage 4 run_id `ec3b40a1…`)

| Store | Before | After |
|---|---|---|
| HASHTAG CANNABIS (Redmond, seattlehashtag.com) | none | **jane** ✓ |
| POT SHOP (Seattle, potshopseattle.co) | none | **jane** ✓ |
| MARY MART INC (Tacoma, marymart.com) | none | **jane** ✓ |
| POT ZONE (Port Orchard, potzone420.com/port-orchard) | none | **jane** ✓ |
| THE FIRE HOUSE (Ellensburg, firehousenw.com) | none | **jane** ✓ |
| **Bonus:** POT ZONE (Tacoma, potzone420.com/tacoma) | none | **jane** ✓ |

**5 of 5 original regressions recovered. 6 total, counting the sibling Tacoma POT ZONE that surfaced when the name-search picked up both `POT ZONE` rows.** (Port Orchard first fetch failed from the Windows client — transport flake, per audit/34 — retry from the VPS container succeeded, same `jane` verdict.)

## Designations applied

Migration `20260420040000_phase_1j_substage_b_apply.sql` flipped 5 v2 rows to `designated_scraper='jane'` + `primary_platform='jane'`. (The 6th bonus row — Tacoma POT ZONE — was already detected-and-designated jane in Stage 4; its Sub-stage B rescan confirms the detection is stable with the new detector, no state change needed.)

## Designations after Sub-stage B

| Platform | Stage 4 | +Sub-stage A | +Sub-stage B | Now |
|---|---:|---:|---:|---:|
| Jane | 78 | +1 | +5 | **84** |
| Dutchie | 75 | +1 | 0 | 76 |
| POSaBit | 63 | 0 | 0 | 63 |
| Leafly | 44 | 0 | 0 | 44 |
| Joint | 19 | 0 | 0 | 19 |
| Weedmaps | 1 | 0 | 0 | 1 |
| **Total designated** | 280 | +2 | +5 | **287** |

## Lessons for the scanner

1. **Tracking beacons are a strong platform signal.** `tags.cnna.io/?...&environment=jane&...` with the `environment=` query key is almost definitionally a Jane deployment. Every platform has a similar fingerprint; worth a general scanner upgrade to log "unknown script sources" during detection so we spot future migrations faster.

2. **Platform CDNs change, brand names don't.** Jane's product/UX brand is still called Jane; only the hosting infrastructure moved. Detectors should key on **brand tokens** (`jane`, `environment=jane`, `/jane.*.js`) in URLs, not assume a specific domain survives forever.

3. **Keep legacy patterns as fallbacks indefinitely.** Some stores will keep the old Jane embed for years. The alternation regex pattern costs essentially nothing and catches both populations.

## Phase 1k candidates surfaced

- **Scan for `environment=` tracking-beacon query params across the full 446-store set.** Other platforms (Dutchie, Leafly) may have similar beacons we're missing.
- **Jane `/jane-discover-id` endpoint (server.js line 1587)** still looks up numeric `store_id` from `iheartjane.com/embed/stores/{id}` markup. Modern Jane sites use `appId={uuid}` (e.g., `f0f24868-2d29-4003-bfb4-88570be02cac`). The Jane scraper (`/jane-scrape`) calls `https://search.iheartjane.com/.../menu-products-production/query` with a numeric `storeId`. Need to verify the Algolia endpoint still works for modern Jane stores — if it does, we still need the numeric storeId; if the new stores use a different backend (GraphQL maybe?), the scraper itself needs updating beyond just detection. **Out of scope for Sub-stage B, file for Phase 1k.**
- **Audit the rest of the 147 Stage-4 `none` stores** with this refreshed detector — any others running modern Jane?

## Artifacts

- HTML capture: `audit/logs/jane-selector-refresh.html` (mary mart /order, 147 KB)
- HTML-dump script: `scripts/phase-1j-substage-b-dump-html.mjs`
- 5-store probe script: `scripts/phase-1j-substage-b-probe-5.mjs`
- VPS patch script: `scripts/phase-1j-substage-b-vps-patch.mjs`
- Rescan script: `scripts/phase-1j-substage-b-rescan-5.mjs`
- Migration: `supabase/migrations/20260420040000_phase_1j_substage_b_apply.sql`
- Results JSON: `audit/logs/phase-1j-substage-b-results.json`
- cody-crm Pass 1 change: `supabase/functions/verify-platform-pass1/index.ts`
- cody-crm Pass 2 change: `scraper-service/server.js` (lines 97, 2856)

## Gate

No gate. 5 recoveries, all `jane`, applied to v2.

Rollback: `f10ad81` (Sub-stage A).
