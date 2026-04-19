# Joint Platform Coverage Survey

**2026-04-19. Survey run against all 419 active intel_stores with a populated website. Purpose: validate the scope of a dedicated Joint scraper (Phase 1f) before building one.**

## Methodology

Parallel HTTP fetch (12-way concurrency, 12s timeout per request, realistic browser User-Agent) of every active store's website. Each response body was regex-scanned for Joint signatures:

- `class="…joint-store-(\d+)…"` (body-class pattern)
- `/wp-content/plugins/joint-ecommerce/` (plugin asset path)
- `wp-json/joint-ecommerce/v1/` (API endpoint reference)

Positive hits were re-scanned with a more-specific regex to extract `joint_business_id` from the inline `jointEcommerce.currentStore = {...}` JS assignment (the actual businessId used in API calls).

Full survey finished in **34 seconds**.

## Top-level results

| Metric | Count |
|---|---:|
| Stores scanned | 419 |
| **Joint stores detected** | **17 (4.1%)** |
| Non-Joint | 396 |
| Errors (timeout/DNS/etc.) | 6 |
| Unique Joint businessIds | 11 (chains share IDs) |

**17 stores is comfortably above the 10-store threshold Chaz set for proceeding with confidence.** The scraper is worth building.

## Joint stores by chain

| Chain | Stores | Unique businessIds | Notes |
|---|---:|---:|---|
| **CRAFT Cannabis** | 5 | 3 (4353, 4370, 4360) | Vancouver + Mill Plain share bizId 4353; Wenatchee appears twice with bizId 4370 (likely LCB duplicate record) |
| **Floyd's Cannabis** | 4 | 3 (6115, 6110, 6112) | Port Angeles appears twice with bizId 6115 (DTC HOLDINGS is an LCB-level entry, FLOYD'S CANNABIS CO is the trade name) |
| **Lidz Cannabis** | 3 | 3 (6065, 5727, 5728) | Separate businessIds per location |
| **DANK'S / DANK'S WAREHOUSE** | 3 | 1 (6117) | All three locations share the same businessId — the WordPress site serves all three from one backing business |
| **Canna4Life** | 1 | 1 (6166) | Clarkston — single-location |
| **Locals Canna House** | 1 | 1 (5338) | Spokane Valley — single-location |

## Per-store detail with DB-designation conflicts

| intel_store_id | Name | City | businessId | Current DB designation | Action required |
|---|---|---|---:|---|---|
| d188d383 | CANNA4LIFE | Clarkston | 6166 | dutchie | **Change to joint** — Dutchie scraper has been failing against a non-Dutchie site |
| 313fc0eb | CRAFT CANNABIS | Vancouver | 4353 | null | **Set to joint** |
| 0e4d6267 | CRAFT CANNABIS | Wenatchee | 4370 | null | **Set to joint** (LCB duplicate of 06853020) |
| b4f66f3c | CRAFT CANNABIS, INC. | Vancouver | 4353 | dutchie | **Change to joint** (shares bizId with 313fc0eb; duplicate LCB entry) |
| b39ae91b | CRAFT TACOMA | Tacoma | 4360 | null | **Set to joint** |
| 06853020 | CRAFT WENATCHEE | Wenatchee | 4370 | null | **Set to joint** (dedup with 0e4d6267) |
| bd1ead00 | DANK'S TACOMA | Tacoma | 6117 | null | **Set to joint** (shares bizId with Edmonds + Renton) |
| f907c762 | DANK'S WONDER EMPORIUM | Edmonds | 6117 | dutchie | **Change to joint** |
| 785d6476 | DANKS | Renton | 6117 | null | **Set to joint** |
| 4a4242f7 | DTC HOLDINGS | Port Angeles | 6115 | null | **Set to joint** (dedup with 86f4e7e8) |
| 86f4e7e8 | FLOYD'S CANNABIS CO. | Port Angeles | 6115 | dutchie | **Change to joint** |
| 4457e06f | FLOYD'S CANNABIS COMPANY | Pullman | 6110 | dutchie | **Change to joint** |
| 70d6f668 | FLOYDS | Sedro Woolley | 6112 | dutchie | **Change to joint** |
| 2dc78d2e | LIDZ CANNABIS TACOMA | Tacoma | 6065 | dutchie | **Change to joint** |
| 5bf6a80e | LIDZ SPOKANE NORTH | Spokane | 5727 | dutchie | **Change to joint** |
| 8c4b0230 | LIDZ SPOKANE SOUTH | Spokane | 5728 | dutchie | **Change to joint** |
| e795beaa | LOCALS CANNA HOUSE | Spokane Valley | 5338 | dutchie | **Change to joint** |

## Summary of designation conflicts

| Current DB state | Joint stores | Explanation |
|---|---:|---|
| `designated_scraper = 'dutchie'` | **11** | These were scraping Dutchie (or trying to) when the site is actually Joint. Dutchie scrapes would return 0 products (no Dutchie embed exists). Dutchie scraper stats for these should show chronic `empty-menu` status |
| `designated_scraper = null` | **6** | From the 32 undesignated stores. Includes Vancouver CRAFT (313fc0eb — the one audit/22 suspected Dutchie based on the Mill Plain sibling, but the shared bizId means BOTH sites are Joint) |

**Big correction to audit/22:** that audit recommended setting the CRAFT chain to Dutchie based on a single `dutchie_slug` (craft-cannabis-andresen) on the Mill Plain location. We now know the entire CRAFT chain is on Joint — the Dutchie slug was a stale artifact from before the chain migrated. Same goes for the DANK'S chain (audit/22 recommended Dutchie, actually Joint). Those audit/22 recommendations should be walked back after the Joint scraper ships.

Similarly, 11 of the 12 currently-designated-Dutchie Joint stores are scrape failures in disguise — the Dutchie scraper has been running against them nightly and getting nothing because the embed doesn't exist. Once Joint is wired up, those stores start yielding real product data for the first time.

## Pilot overlap

Three stores from the Phase 1e 20-store pilot showed up here:

| Pilot store | Pilot verdict (audit/31) | Joint survey finding |
|---|---|---|
| FLOYD'S CANNABIS (Pullman) | v3 Pass 2 `none`, 3 CTAs tried all miss | **Joint, bizId 6110** — scanner correctly couldn't find Dutchie (it's not Dutchie) |
| CRAFT CANNABIS (Vancouver) | v3 Pass 2 `none`, 2 CTAs tried | **Joint, bizId 4353** — same story |
| DANK'S TACOMA | v3 Pass 2 `none`, 1 CTA tried | **Joint, bizId 6117** — same story |

This confirms the audit/31 hypothesis: **the Phase 1e scanner's "none" results on these stores were correct**; the DB designations were stale. Joint is the third-platform missing piece.

## Coverage projection for 560-store run (Option A)

If the Phase 1e scanner runs against all 560 stores, we now expect:
- ~50% clean platform detections (Dutchie / Jane / Leafly / POSaBit embeds as before)
- **~3-5% Joint detections** (17 of 419 confirmed active, projecting ~20-25 in the 560 count once inactive stores are included)
- ~45% `none` → manual review queue

Joint moves the "clean detection" ceiling from ~50% to ~55% of stores. Still leaves ~45% needing human verification, but the Joint subset is now automated instead of mis-attributed.

## Recommendation

**Proceed with scraper build.** 17 stores is enough to justify the engineering cost, especially because 11 of them are currently silently failing against a wrong scraper designation. Shipping Joint unlocks real product data for a chain-dominated subset of WA stores (CRAFT, Floyd's, Lidz, DANK'S combined = 15 of the 17 stores).

Do NOT write DB designation changes yet. The verify-platform-pass2 detection code needs to land first so the designations come from a verified + audited pipeline rather than a one-off survey.
