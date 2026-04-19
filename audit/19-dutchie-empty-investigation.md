# Dutchie Empty-Menu Investigation

**2026-04-18 — preliminary findings from SQL-side analysis.**
Website-visit validation deferred to Chaz's Claude-in-Chrome session.

## Current state

Of 245 stores with `designated_scraper='dutchie'`:

| `dutchie_scrape_status` | Count | % |
|---|---:|---:|
| `success` (menu returned products) | 60 | 24% |
| `empty-menu` (slug resolved, menu returned 0) | 82 | 33% |
| `error` (slug-not-found or scrape failure) | 8 | 3% |
| NULL (never scraped) | 95 | 39% |

Every one of the 82 empty-menu stores has a non-null `dutchie_slug`.
None are slug-less. Discovery found something for each one; the menu
fetch returned zero products.

## Pattern in the slug values

A SQL-side scan of the 82 empty-menu rows reveals three visible
patterns:

### Pattern A — slug plausibly matches store name
`HOUSE OF CANNABIS - TONASKET` → `house-of-cannabis-tonasket` ✓
`THE BAKEREE (AURORA)` → `the-bakeree-aurora` ✓
`LUCID PUYALLUP` → `lucid-puyallup` ✓
`EUPHORIUM 420` → `euphorium-vashon` (name differs from LCB record but both resolve to Euphorium Vashon; plausible)

Likely cause: genuine empty menu OR Dutchie rate-limit truncating the response on these specific accounts. Needs live retry to confirm.

### Pattern B — slug points to a clearly different retailer
`WASHINGTON O G, LLC` → `american-mary-belltown`
`DANK OF AMERICA` (Bellingham) → `420-high-society-bellingham`
`LUCKY CANNABIS` (Mt Vernon) → `herbal-legends-mt-vernon`

Likely cause: discovery match error. Original `findIntelMatch` logic
falls back from license → address → geo → name. Somewhere in the
geo-or-name tier the wrong Dutchie account got bound. These stores
probably have a *real* Dutchie presence on Dutchie with a different
slug, or they've left Dutchie entirely.

**Fix path:** reset these specific `dutchie_slug` values to NULL,
re-run discovery, re-match. Not in this prompt's scope.

### Pattern C — slug points to likely-former name of the same store
`DANK'S WONDER EMPORIUM` → `danks-warehouse`
`DANK OF AMERICA` (Blaine) → `dank-of-america-wa`

Probably the store rebranded, but the slug on Dutchie's side may
still work. Or the Dutchie account was decommissioned. Likely
resolvable by re-running discovery with the current store name.

## Bucket estimate (best guess from slug pattern alone)

Extrapolating the sample of ~20 rows examined:

- ~40–50% of the 82 are Pattern A (plausible slug, empty menu) —
  candidates for a simple retry; 5–10 may be genuinely shut-down
  online menus → candidates for `has_online_menu = false`
- ~30% are Pattern B (wrong slug) — need discovery re-match
- ~20% are Pattern C (renamed store, stale slug) — also need
  re-match but less drastic

## Stores flagged for `has_online_menu = false` today

**Zero.** I did not set `has_online_menu = false` for any specific
store — per the constraint, that only happens after a website visit
confirms no menu presence. The column now exists with default `true`;
investigation-round-two (Chaz's browser session) will flip specific
rows.

## Sample data for each bucket (for the Chrome session)

### Pattern A — plausible slug, try live fetch:
- HOUSE OF CANNABIS - TONASKET | tonasket | slug: house-of-cannabis-tonasket
- THE BAKEREE (AURORA) | seattle | slug: the-bakeree-aurora
- LUCID PUYALLUP | puyallup | slug: lucid-puyallup
- GANJA VITA | belfair | slug: ganja-vita

### Pattern B — wrong slug, needs re-match:
- WASHINGTON O G, LLC | seattle | slug: american-mary-belltown
- DANK OF AMERICA (Bellingham) | bellingham | slug: 420-high-society-bellingham
- LUCKY CANNABIS (Mt Vernon) | mount-vernon | slug: herbal-legends-mt-vernon

### Pattern C — plausible rebrand:
- DANK'S WONDER EMPORIUM | edmonds | slug: danks-warehouse
- DANK OF AMERICA (Blaine) | blaine | slug: dank-of-america-wa

## Recommended next steps

1. **Rerun discovery + re-match for the 82.** Unset their
   `dutchie_slug`, run `scrape-dutchie action=discover`, then
   `rescrape-by-slug` on the re-matched ones. Expected outcome:
   Pattern A stores get clean data or stay empty-genuinely;
   Pattern B stores either find their real Dutchie account or
   confirm they're not on Dutchie; Pattern C resolves by rename
   handling.
2. **For Pattern A stores that still return empty after retry,** a
   Chrome-session visit to the real store website will confirm
   whether they've stopped online menus. Those get
   `has_online_menu = false` per-store.
3. **Add a slug-validation step to the ongoing scraper:** if a slug
   matches a Dutchie account whose city/address diverges dramatically
   from the LCB record, flag rather than silently accept. Prevents
   future Pattern B mismatches.

## What NOT to do

- Don't bulk-set `has_online_menu = false` based on this analysis.
  Only confirmed-via-visit stores get flagged.
- Don't delete `dutchie_slug` values wholesale. Unset only for the
  stores about to be re-matched, so discovery can repopulate cleanly.
- Don't run `platform-scan-batch` against these 82 — they're already
  designated to Dutchie; platform redetection would reset that
  assignment and lose the work already done.

## Related: 95 never-scraped Dutchie stores

39% of Dutchie-designated stores have `dutchie_scrape_status = NULL`,
meaning they've been designated but never actually scraped. Likely
cause: they were added to the platform-scan table but the first
`scrape-batch` run never reached them. The new cron-scheduled
`refresh-all-designated` action (Phase 1c) will pick them up tonight.
No action needed here beyond letting the cron run.
