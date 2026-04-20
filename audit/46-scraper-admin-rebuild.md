# Scraper Admin Rebuild + Stores Scraper-Badge Column Fix

**2026-04-20. The Scraper Admin page was built for the pre-Stage-6 world: hardcoded `TOTAL_STORES=458`, platform cards computing counts from `dispensary_menus.source` (stale), manual "Scrape All" buttons, and a "Website Finder + POSaBit Detection" section left over from Phase 1a. Post-swap, the architecture is cron-driven and the numbers all need to come from `intel_stores.designated_scraper`. The Stores page scraper-badge column was also broken — `PLATFORM_BADGES` didn't include Jane or Joint, and the render logic keyed on `dispensary_menus.source` / old slug fields instead of `designated_scraper`. Both fixed.**

## 1. ScraperAdmin page — audit of what was there

### Queries it ran

| Call | Data | What it did |
|---|---|---|
| `supabase.from("dispensary_menus").select("source, intel_store_id, menu_item_count, last_scraped_at")` | one row per (store,platform) menu | Fed the per-platform card: counted stores linked + products + last scraped timestamp |
| `supabase.from("intel_unmatched_discoveries").select("*").eq("matched", false)` | pending platform discoveries not yet linked to an intel_stores row | Fed the Unmatched tab |
| `supabase.from("intel_stores").select(...).eq("status", "active")` (line 527) | all active rows | Source for the link-search in Unmatched tab |
| `supabase.from("lcb_licenses").select("id, license_number")` (removed earlier in commit `bd8cb75`) | legacy UUID→license_number map | Already fixed |
| `supabase.from("intel_stores").select("id, name, city").eq("status","active")...posabit_merchant_token not null` (line 276) | posabit-ready stores | Used by removed POSaBit fast-scan handler |

### What was stale

| Issue | Location | Root cause |
|---|---|---|
| `TOTAL_STORES = 458` hardcoded | line 74 | Pre-Stage-1 LCB count; post-swap it's 470 |
| Per-platform "storesLinked" came from `dispensary_menus.source` | `loadStats` callback line 496-508 | `dispensary_menus.source` is a historical scrape-source tag; only populated on rows that were actually scraped. After Stage 6 renaming, a v2 row designated "dutchie" hasn't been scraped yet → no dispensary_menus row → counted as 0 |
| PLATFORMS array listed Weedmaps with `blocked: true` but still showed it | line 23-71 | Deprecated logic; post-swap Weedmaps should just be a footer note |
| "Scrape All Platforms" button + Phase 1/2 discover/scrape-batch pipeline | lines 862-915, 562-651 | The whole architecture changed — scrape is cron-driven now |
| "Website Finder + POSaBit Detection" section | lines 952-1030 + 655-713 | Phase 1a legacy; belongs nowhere |
| Manual per-platform "Scrape" buttons on each card | line 432-442 inside PlatformCard | Still useful as "Run Now" but should be reskinned as testing/emergency trigger |
| PLATFORM_INFO dropped Jane in some spots | line 77 — actually Jane IS in PLATFORM_INFO, only missing from PLATFORM_BADGES in StoreDirectory | See item 2 |

### What was kept

| Feature | Why |
|---|---|
| Unmatched tab (link flow + table JSX + handlers) | Still the right workflow for pending platform discoveries that don't auto-match an LCB row. Only query tweaks needed. |
| `PLATFORM_INFO` map | Used by Unmatched row badges + `buildScrapeCandidate` helper |
| `buildScrapeCandidate` helper | Needed for the "Scrape Now" button after linking |
| Link-state (linkingId, linkQuery, linkSelected, etc.) | Driven by the Unmatched-tab flow |
| `getCallParams()` auth helper | Used by manual trigger + scrape-linked |

### What was removed

- `PLATFORMS` array, `SCRAPE_ALL_PLATFORMS`, `TOTAL_STORES` constant
- `PlatformStats`, `RunState`, `RunStatus`, `ScrapeAllState`, `LogEntry`, `LogEntryStatus` types
- `ScrapeLog` component
- `runPlatformBatch` + `runPosabitFastBatch` helpers (300+ lines)
- `PlatformCard` component (old version)
- Handlers: `handleScrape`, `handleStop`, `handleScrapeAll`, `handleStopAll`, `handleFindWebsites`
- State: `runStatuses`, `scrapeAll`, `platformLogs`, `abortRefs`, `pollRefs`, `wf*` (website finder), `scrapeAllAbortRef`
- Helpers: `startPolling`, `stopPolling`, `setStatus`, `clearLog`, `appendLog`
- JSX: "Scrape All Platforms" card, the "How it works" Phase 1/2 blurb, the Website Finder card

File went from **1254 lines** → **~540 lines** (including ~200 lines of largely-unchanged Unmatched-tab rendering).

## 2. Stores page scraper-badge column — audit + fix

### What was broken

`src/pages/StoreDirectory.tsx` line 22-27 defined:

```ts
const PLATFORM_BADGES = [
  { letter: "D", source: "dutchie-api",  slugField: "dutchie_slug" },
  { letter: "L", source: "leafly",       slugField: "leafly_slug" },
  { letter: "P", source: "posabit-api",  slugField: "posabit_feed_key" },
  { letter: "W", source: "weedmaps",     slugField: "weedmaps_slug" },
];
```

Problems:
1. **Jane + Joint missing entirely.** A store with `designated_scraper='jane'` showed no badge.
2. **Render logic** (line 479-506 pre-fix): `visible = PLATFORM_BADGES.filter(cfg => menuMap[store.id].includes(cfg.source) || store[cfg.slugField])`. Only two signals: presence of a dispensary_menus row OR a platform-specific slug. A freshly designated v2 store without menu data yet AND without a carried-forward slug (e.g. a Stage-3 manual_chaz row) showed "None."
3. **Scraper info on each row came from dispensary_menus**, which for 70 rows was NULLed in Stage 6's repoint and for newly-designated v2 rows has no scrape history yet.

### Fix

Added **`store.designated_scraper === cfg.id`** as the primary visibility signal in the render logic. Added **Jane** + **Joint** to the badges list (6 entries total). Tooltip now labels designated-vs-menu-present distinctly:
- Solid badge: designated AND/OR has menu data
- Dashed badge: slug only (legacy detection, no designation)
- "None" pill: no signal whatsoever (should match the 170 undesignated v2 rows)

Also updated `IntelStore` type in `src/lib/types.ts` to include the new v2 columns (`designated_scraper`, `primary_platform`, `is_active`, `has_online_menu`, `deactivated_reason`, `deactivated_at`, `posabit_merchant_token`, `joint_business_id`). These were columns TypeScript didn't know about until this commit — added as optional so existing consumers don't break.

### Per-scraper platform colors

| Platform | color CSS var | Letter | Meaning |
|---|---|---|---|
| Dutchie | `--platform-dutchie` (orange) | D | |
| Jane | `--platform-jane` (pink) | J | |
| Leafly | `--platform-leafly` (green) | L | |
| POSaBit | `--platform-posabit` (purple) | P | |
| Joint | `--platform-joint` (red, fallback `0 72% 50%`) | N | |
| Weedmaps | `--platform-weedmaps` (gray) | W | |

Joint uses `N` for the badge letter since `J` is taken by Jane.

## 3. New ScraperAdmin layout

Top (KPI cards):
- **Total stores** (470)
- **Active** (469, w/ inactive count in hint)
- **Designated** (296, w/ coverage %)
- **With menu data** (distinct intel_store_ids in dispensary_menus)

Cron Status section:
- 5 scrapers, one chip each (color + schedule label + last-run freshness)
- External link to Supabase cron dashboard for detailed history

Platform cards (5 — Joint at top, then Dutchie/Jane/Leafly/POSaBit):
- Description, scheduled UTC time
- 4 stat tiles: Designated (/ 470), Eligible, With Menu, Products
- "Run now" manual trigger (calls the `scrape-all-designated` action — same path as cron)
- Confirms via `confirm()` before firing — "Manually trigger … used for testing or emergencies"
- Result strip shows success/failure after trigger

Weedmaps footer: deprecated since Stage 4, historical data preserved in archive.

No Scrape-All button. No Website Finder. Unmatched tab intact.

## 4. Expected post-deploy behavior

**ScraperAdmin page** (`/admin/scrapers`, or wherever route lives):
- Header no longer claims "458 LCB-licensed stores"
- KPI row shows 470 / 469 / 296 / ~364 (depending on dispensary_menus state)
- Cron status shows all 5 scraper jobs with "Never run" freshness until tonight's 12:00 UTC wave
- Platform cards show correct designated counts: Dutchie 77, Jane 91 / 89-eligible, POSaBit 65, Leafly 44, Joint 18
- Weedmaps card is absent (replaced by footer note)

**Stores page** (`/stores`):
- Scraper-used column now renders a solid badge for each of the **296 designated stores**
- Dashed badge still appears for the slug-only edge cases (shouldn't be many post-Stage-5)
- "None" pill appears for the ~170 undesignated rows
- Tooltips show "Dutchie (designated)" / "Jane (designated · has menu)" / "Leafly" etc.

## 5. Verification

| Check | Expected | How to verify | ✓ |
|---|---|---|:-:|
| Local TypeScript build | 0 errors | `npm run build` | ✓ (1.25s) |
| ScraperAdmin renders without console errors | clean | `/admin/scrapers` in browser post-deploy | (Vercel) |
| Total-stores KPI shows 470 | 470 | top-left card | (Vercel) |
| Designated KPI shows 296 | 296 | third card | (Vercel) |
| Dutchie card designated shows 77 | 77 | platform card | (Vercel) |
| Jane card designated shows 91 | 91 | platform card | (Vercel) |
| POSaBit card designated shows 65 | 65 | platform card | (Vercel) |
| Leafly card designated shows 44 | 44 | platform card | (Vercel) |
| Joint card designated shows 18 | 18 | platform card | (Vercel) |
| No "Weedmaps" card visible | hidden | platforms grid | (Vercel) |
| No "Scrape All Platforms" button | removed | top of page | (Vercel) |
| No "Website Finder" section | removed | mid page | (Vercel) |
| Cron schedule chips show 5 jobs | 5 | below KPIs | (Vercel) |
| Manual "Run now" on any card opens confirm dialog | confirm() fires | click button | (Vercel) |
| Unmatched tab still works | intact | click tab | (Vercel) |
| Stores page scraper column shows badges for 296 stores | ~296 solid badges | `/stores` | (Vercel) |
| Store with `designated_scraper=jane` shows J badge | J visible | any Jane store | (Vercel) |
| Store with `designated_scraper=joint` shows N badge (red) | N visible | CRAFT Vancouver row | (Vercel) |

## Artifacts

- Rebuilt `src/pages/ScraperAdmin.tsx` (1254 → ~540 lines)
- Updated `src/pages/StoreDirectory.tsx` PLATFORM_BADGES (4 → 6 platforms) + render logic
- Updated `src/lib/types.ts` IntelStore interface with v2 columns

## Constraints honored

- ✓ Did not modify scraper workers (edge functions untouched)
- ✓ Did not change cron schedules
- ✓ Did not touch Unmatched tab workflow (only simplified surrounding state)
- ✓ Did not touch Trends / Reports / Alerts / Dashboard / Competitors pages
- ✓ Did not modify intel_stores or intel_stores_archived

Pre-commit: `bd8cb75` (v2 schema compatibility fixes).
