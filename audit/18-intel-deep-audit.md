# Cody Intel — Deep System Audit

**Generated: 2026-04-18. Read-only. No changes made.**

Audit spans both `cody-intel` (frontend) and the Intel-serving Edge Functions in `cody-crm/supabase/functions/`. The two repos share one Supabase project (`dpglliwbgsdsofkjgaxj`) and one auth system.

---

## TL;DR

1. **60 Edge Functions deployed** across the shared Supabase project; ~20 of them power Intel. All active (no orphans).
2. **Scraper coverage is lopsided.** 245 stores assigned to Dutchie, 131 Jane, 60 Leafly, 52 POSaBit, **only 19 Weedmaps**, and **53 undesignated**. Weedmaps is effectively broken — every Weedmaps-designated store that was scraped came back `empty-menu` (19/19). 82 Dutchie-designated stores also returned `empty-menu`, plus another 95 that were never scraped.
3. **Ask Cody's 401 origin** is the `cody-market-ai` Edge Function, invoked from `src/pages/AskCody.tsx:66-67`. It likely 401s because `cody-market-ai` verifies user JWT + org membership; if the user's session token isn't being passed through `callEdgeFunction` correctly, or if the function's auth check drifted during Prompt-14-era updates, the caller sees 401. The page itself does not do any special auth handling; it relies on the shared `callEdgeFunction` helper.
4. **Gap Analysis "No brands configured" is a real data-shape bug**, not just a user-setup issue. `user_brands` has columns `(id, org_id, brand_name, is_own_brand, created_at)` — **no `is_competitor_brand` column**. Reports.tsx queries `.eq("is_competitor_brand", true)` on `user_brands` and gets nothing. Fallback to `market_brands.is_competitor_brand` works in theory but no TGS rows have that flag set.
5. **Market Saturation "0 unique brands per city" is a query-limit bug**. SaturationAnalysis.tsx pulls the 500 most recent `menu_snapshots` rows globally, then dedupes by store. `menu_snapshots` is empty (0 rows) regardless, so this would show zero anyway — the more fundamental issue is the snapshot pipeline has never produced rows.
6. **Three data pipelines are wired but dormant**: `menu_snapshots` (0 rows), `menu_item_normalizations` (0 rows), and `scrape_schedules` (0 rows). Snapshot → change-detection → alert pipeline, product-matching pipeline, and automated-scraping all depend on these. Today's 63 `intel_alerts` must have come from an earlier path or manual runs.
7. **1.2M `menu_items` across 560 stores** is the real foundation. Every Reports tab, AskCody query, and brief pulls from here.
8. **TGS has 13 own-brand entries in `user_brands`, zero competitor entries**, zero `store_tags`, zero `scrape_schedules`. The Intel UI assumes a fuller configuration than the account has.
9. **Store-brand relationship is computed at query time** — no materialized view (despite references to `mv_brand_rankings` in shared code, the view doesn't actually exist; only `v_intel_store_platform_coverage` does). Dashboard chunks `menu_items` in 400-item batches to aggregate brand presence client-side.
10. **No cron jobs in production.** `scrape-schedules` table is empty, `scheduled-dutchie-refresh` is deployed but not triggered on a schedule, Industry Pulse hasn't been set up to run daily, Drive import for CRM isn't wired. All scheduled work is currently manual-button-click.

---

## 1. Architecture Overview

### Frontend
- **Framework:** React 19.2 + Vite 8.0 + TypeScript 6.0
- **Routing:** `react-router-dom` v6; all routes defined in `src/App.tsx` (86 lines)
- **State management:** plain React state + context providers. Four provider levels wrap `ProtectedRoutes`:
  - `AuthProvider` — Supabase auth session (in `src/lib/auth.tsx`)
  - `ProfileProvider` — user profile (`src/lib/profile.tsx`)
  - `OrgProvider` — active org, reads `org_members` (`src/lib/org.tsx`)
  - `ThemeProvider` + `IntelThemeProvider` — light/dark/auto + Intel-specific theming
- **Auth flow:** Google OAuth via Supabase. Session → Supabase JWT → passed to Edge Functions via `callEdgeFunction` helper (`src/lib/edge-function.ts`, 43 lines, 30s default timeout).
- **Key shared libs:** `supabase.ts` (Supabase client), `plans.ts` (4-tier feature matrix — 51 feature keys), `analytics-filters.ts` (cannabis/non-cannabis filter helpers), `census.ts` (US Census API), `pdf-export.ts` (jsPDF), `export-csv.ts`.
- **Shared UI primitives:** `cody-shared` v0.3.0 installed via `github:TGS-Chaz/cody-shared#main`. Currently consumes `AmbientBriefPanel` (for Store Detail brief) and `ProductSwitcher` (top-bar product nav). Design tokens centralized in the shared package.

### Backend
- **Supabase project:** `dpglliwbgsdsofkjgaxj`
- **Edge Functions (Intel-relevant, deployed):**
  - **Scrapers:** `scrape-dutchie`, `scrape-leafly`, `scrape-weedmaps`, `scrape-posabit`, `scrape-jane`, `scrape-menus` (Apify/Weedmaps legacy), `scrape-website-menu` (generic menu/URL prober), `scrape-trigger` (Apify orchestrator)
  - **Platform detection:** `platform-scan-batch`
  - **Snapshots + diffs:** `snapshot-menus`, `detect-menu-changes`
  - **Product intelligence:** `match-products`, `normalize-products`, `ingest-menu-data`
  - **Scheduled:** `scheduled-dutchie-refresh`, `refresh-views`
  - **AI surfaces:** `cody-market-ai`, `generate-weekly-briefing`, `generate-market-briefing`, `generate-store-brief`, `scrape-industry-pulse` (AI summaries per item), `analyze-market`
  - **API:** `api-v1` (REST API for Enterprise tier)
- **VPS role:** There's a separately-hosted VPS that fronts the scrapers — `scrape-leafly`, `scrape-weedmaps`, `scrape-jane`, `scrape-posabit` (for initial platform detection), and `platform-scan-batch` all proxy through VPS endpoints (`/leafly-scrape`, `/weedmaps-discover`, `/jane-scrape`, `/posabit-discover`, `/detect-platform-batch`). VPS handles the headless-browser work (Puppeteer for anything that requires JS rendering or Cloudflare-style challenges); Edge Functions handle the data-shaping + persistence. Dutchie is direct-to-GraphQL (no VPS needed). Industry Pulse is also direct.
- **Hosting:** Vercel (`cody-intel.vercel.app`). Env vars required: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_MAPS_API_KEY` (for maps), plus optional tracking keys.

### External services
- **Anthropic Claude** (Sonnet 4) for all AI (market-ai, briefings, industry-pulse summaries, store briefs)
- **Apify** for Weedmaps-v2 scraping (legacy `scrape-menus` path)
- **Algolia** indirectly via iHeartJane scraping
- **US Census API** for per-store demographics
- **WA Legislature Web Services** + LCB RSS + Marijuana Moment for Industry Pulse
- No direct PostHog, no direct analytics provider

### Intel ↔ CRM sharing
- **Same Supabase project, same `auth.users`, same `organizations` + `org_members` tables.** Tier is per-product: `organizations.intel_plan` / `crm_plan` / `grow_plan`.
- **Shared tables (written by CRM, read by Intel):** `contacts`, `products`, `organizations`, `org_members`
- **Shared tables (written by Intel, read by CRM):** `intel_stores`, `intel_alerts`, `market_brands`, `menu_items`, `dispensary_menus`
- **Integration bridge:** `intel_stores.crm_contact_id` links a dispensary to the CRM contact record it's carrying in sales pipeline. `market_brands.is_own_brand` is consumed by Morning Briefing in CRM.

---

## 2. Database Schema

### Intel-owned tables (row counts 2026-04-18)

| Table | Rows | Size | Purpose |
|---|---:|---:|---|
| `menu_items` | **1,200,144** | 527 MB | Every product scraped from every menu on every platform. 32 columns. Raw + normalized fields. |
| `intel_stores` | 560 (463 TGS-scoped) | 592 kB | LCB-licensed WA dispensaries. 58 columns incl. per-platform slugs + scrape statuses. |
| `dispensary_menus` | 734 | ? | One row per (store × platform) pair. Stores source, last_scraped_at, menu_item_count. |
| `market_brands` | 2,823 | 1,112 kB | Brand catalog. `is_own_brand`, `is_competitor_brand`, aliases, store_count, avg_price_per_gram, estimated_market_share. |
| `intel_stale_platform_bindings` | 502 | ? | Previously-linked platform associations that no longer match. Populated by scrapers on failure. |
| `intel_store_platform_scan` | 395 | ? | Per-store platform detection history (written by `platform-scan-batch`). |
| `intel_unmatched_discoveries` | 144 | 200 kB | Stores discovered on platforms that don't match LCB records. Deduped by (platform, name, city). |
| `market_snapshots` | 75 | 200 kB | Daily per-region-per-category aggregates. |
| `intel_alerts` | 63 | ? | Menu-change alerts (stock_out, price_change, brand_added, brand_removed, new_product). |
| `intel_detected_needs_credentials` | 60 | ? | Platforms detected on a store's site that require auth we don't have. |
| `scrape_jobs` | 46 | 32 kB | Scrape job log with apify_run_id. |
| `industry_pulse_items` | 43 | ? | Regulatory/legislative items with AI audience-impact summaries. |
| `market_categories` | 32 | 48 kB | Canonical category taxonomy. |
| `user_brands` | 13 (all own) | 64 kB | Per-org brand tracking. **Schema is `(id, org_id, brand_name, is_own_brand, created_at)` — NO `is_competitor_brand` column.** |
| `intel_knowledge_base` | 0 | 16 kB | **Stubbed — never written.** Purpose unclear. |
| `menu_snapshots` | **0** | 24 kB | **Pipeline wired but dormant.** Intended daily fingerprints. |
| `menu_item_normalizations` | **0** | 32 kB | **Pipeline wired but dormant.** Normalized variants of raw menu_items. |
| `scrape_schedules` | **0** | 24 kB | **Scheduling UI wired but no rows.** Daily scrape schedule config. |
| `store_tags` | 0 | 40 kB | Per-org custom store tags. Unused by TGS. |
| `weekly_briefings` | 0 | 24 kB | Cached weekly AI briefings. |
| `marketing_generations` | 0 | 16 kB | Stubbed marketing-asset table. |

### Relationships

```
organizations (1) ─── (many) org_members
                  ─── (many) intel_stores (via org_id)
                  ─── (many) user_brands
                  ─── (many) products (CRM)

intel_stores (1) ─── (1) contacts via crm_contact_id
              ─── (many) dispensary_menus
              ─── (many) intel_store_platform_scan
              ─── (0..1) intel_stale_platform_bindings

dispensary_menus (1) ─── (many) menu_items via menu_id

menu_items ─── (opt) market_brands via normalized_brand_id
            ─── (opt) market_categories via normalized_category_id

intel_alerts ─── intel_stores via intel_store_id
              ─── contacts indirectly via intel_stores.crm_contact_id

industry_pulse_items ─── (no FK; org-agnostic feed)
```

### Views

One user view: `v_intel_store_platform_coverage`. Audits per-store platform presence.

References in shared code to `mv_brand_rankings` (a materialized view) — **this view does not exist in the database**. The function `cody-market-ai` appears to query it; at query time it would return an error unless a fallback path is taken. Flagged as a **broken reference** needing investigation.

### Indexes worth noting

- `intel_stores`: `city`, `lcb_license_id` (unique), `org_id`; unique composite on posabit creds when all three are present
- `menu_items`: `normalized_brand_id`, `(normalized_brand_id, dispensary_menu_id)`, `normalized_category_id`, `lower(raw_brand)` (functional)
- `market_brands`: unique on `name`, unique on `id`
- `market_snapshots`: unique on `(snapshot_date, region, category_id)`

### Tables that look unused or deprecated

- `intel_knowledge_base` (0 rows, no references in code I can find)
- `marketing_generations` (0 rows, linked to a `generate-marketing-image` function but that function serves Grow, not Intel)
- `store_tags` (0 rows for TGS — wired in StoreDirectory but no one has used it)

---

## 3. Data Pipeline

### Scrapers

#### `scrape-dutchie`
Direct to Dutchie's public GraphQL (`api.dutchie.com`). Discovery uses geo-searches across 9 WA cities (Seattle, Tacoma, Spokane, Yakima, Bellingham, Tri-Cities, Olympia, Wenatchee, Pullman). Store-matching hierarchy (shared with Leafly + Weedmaps via `findIntelMatch`): **license number → address normalization → geo distance <0.1 mi → name+city fuzzy @ 0.75 threshold.** Paginates 100 products/page up to 50 pages. Writes 100-item batches to `dispensary_menus` + `menu_items`. Sets `intel_stores.dutchie_slug`, `dutchie_product_count`, `dutchie_last_scraped_at`, `dutchie_scrape_status` (`success` / `error` / `empty-menu`). 300ms inter-store delay.

#### `scrape-leafly`
Proxies through VPS `/leafly-scrape` (Puppeteer-backed). Discovery: up to 500 stores, 30 scrolls at 1500ms. Menu fetch: VPS `/leafly-menu`, up to 2000 items + 200 pages. Same matching algo as Dutchie. Writes `leafly_slug`, `leafly_product_count`, etc. Address is only saved if currently null (doesn't overwrite). 400ms per-store delay. Errors log as `vps-{status}`.

#### `scrape-weedmaps`
VPS `/weedmaps-discover?maxStores=600` for discovery, VPS `/weedmaps-menu` for menu fetch. Filters to WA state only. Writes `weedmaps_slug`, etc. **Status reality: every Weedmaps-designated store (19/19) that was scraped came back `empty-menu`.** Hypothesis: the VPS endpoint is returning empty menu arrays — either auth/bot-detection issues on Weedmaps' side or a parser regression.

#### `scrape-jane`
Jane scraping requires `jane_store_id` to already be on `intel_stores`. There's a separate `discover-ids` action that scans store websites via VPS `/jane-discover-id` to find iHeartJane embeds and extract the store_id. Menu fetch via VPS `/jane-scrape` (Algolia-shaped results, per-variant pricing). 131 stores currently designated.

#### `scrape-posabit`
Three modes: (1) `discover` lists stores with websites; (2) `scrape-batch` calls VPS `/posabit-discover` per website to detect POSaBit widgets and extract four credentials (merchant_token, merchant_slug, venue_slug, feed_id); (3) `fast-scan` probes subdomains + HTML before touching the VPS. Once credentials detected, hits the POSaBit MCX (menu core exchange) API directly. Also has a `find-websites-batch` action that DuckDuckGoes for missing store websites.

#### `scrape-menus` (Apify legacy)
Apify actor `parseforge~weedmaps-scraper` for historical Weedmaps-v2 scraping. Three actions: `start` / `check` / `ingest`. Filters out non-dispensary types (doctor, clinic, delivery-only, CBD shop, brand, processor, grower) and non-WA stores. Auto-creates contacts if no CRM match found ("auto-discovered" tag). Kept around because Apify can scrape things our VPS can't.

#### `scrape-website-menu`
Generic menu scraper that scans store websites for embed codes / menu URL patterns (`/menu`, `/shop`, `/order`, `/browse`, etc.). Called by `scheduled-dutchie-refresh` when a Dutchie store URL isn't known.

#### `scrape-trigger`
Orchestrator for Apify-backed sources (Leafly via Apify actor, Weedmaps via Apify). Mostly legacy.

### Platform detection & scanning

`platform-scan-batch` proxies through VPS `/detect-platform-batch` to identify platforms per store. Writes one row per store to `intel_store_platform_scan` with `detected` (jsonb map `{platform: signalCount}`), `raw_signals`, `http_status`, `via` (direct or proxy), `scanned_at`. **Does NOT assign `designated_scraper` automatically.** That's done separately — the field is set manually (likely via the Scraper Admin UI, which I didn't see a direct setter for in the code I read; may be via SQL from Chaz's own hand or during the initial seeding).

The `designated_scraper_locked` column exists — when `true`, automatic overrides (if they existed) wouldn't change the assignment. Seven stores are undesignated but have websites; 46 undesignated have no website (can't probe).

### Snapshot & normalization pipeline

- **`snapshot-menus`** — daily menu fingerprint (SHA-256 of sorted `(name|brand|price)` tuples). Only writes if fingerprint differs from prior snapshot. **Why `menu_snapshots` is empty today: the function has never been successfully invoked in a persisting way.** `scheduled-dutchie-refresh` runs daily-ish but doesn't trigger snapshot-menus. No cron is configured.
- **`detect-menu-changes`** — compares today vs. yesterday `menu_snapshots`. Generates alerts. Alert severity escalates to urgent when the change involves an own brand (from `user_brands` or `market_brands` with `is_own_brand=true`). **Depends on `menu_snapshots` having rows, so currently dormant.** The 63 alerts in `intel_alerts` came from an earlier path or manual invocations.
- **`normalize-products`** — cleans raw menu_items, writes to `menu_item_normalizations`, also upserts canonical `products`. Confidence scoring 0.7-0.9. **`menu_item_normalizations` is empty — pipeline dormant.**
- **`match-products`** — fuzzy matches user `products` to `menu_items` via Dice coefficient on tokenized names + brand pre-filter. Thresholds: ≥0.90 auto-confirm, 0.60–0.89 review, <0.60 ignore. Writes to `user_product_menu_item_matches`.

### Industry Pulse pipeline

`scrape-industry-pulse` hits four source families:
1. **WA Legislature Web Services** — RCW-filtered bills (keywords: cannabis, marijuana, thc, hemp, CBD, dispensary, processor, producer, retailer, LCB, 69.50 RCW, 69.51A RCW, I-502) + pinned bills (HB 2152, HB 2681, HB 1941).
2. **WA LCB** — News RSS, rulemaking filings (CR-101/102/103), board meetings, enforcement actions.
3. **Federal/Industry** — Marijuana Moment RSS, split by topic heuristics.
4. **AI summarization** — every item summarized by Claude Sonnet 4 into structured JSON: `ai_summary`, `ai_impact` (retailers/farms/consumers sections), `relevance_score`, outcome statement, bill status inference.

Persisted to `industry_pulse_items` (43 rows) with 26 columns.

### Brand matching at store level

**Not materialized.** Computed at query time. The Dashboard chunks `menu_items` in 400-item batches to aggregate brand presence, then dedupes by store via `Set`. `detect-menu-changes` does the same pattern. Heavy queries on this path (visible in 731-line Dashboard.tsx).

The shared code references `mv_brand_rankings` but the view doesn't actually exist in the database. Any code path relying on it fails or silently returns empty.

---

## 4. Page-by-Page Inventory

| Page | File | LOC | Tables (reads) | Edge Fns | Plan gate |
|---|---|---:|---|---|---|
| Dashboard | `src/pages/Dashboard.tsx` | 731 | intel_stores ×4, intel_alerts, user_brands, normalization_runs, dispensary_menus, menu_items (chunked), daily_brand_metrics | `normalize-products` | WeightedDistribution gated |
| Store Directory | `src/pages/StoreDirectory.tsx` | 557 | intel_stores, dispensary_menus, store_tags ×2 | — | none |
| Store Detail | `src/pages/StoreDetail.tsx` | 569 | intel_stores (r+w), dispensary_menus, menu_items | `fetchCensusByZip`, `generate-store-brief` via AmbientBriefPanel | StoreScorecard gated |
| My Products | `src/pages/MyProducts.tsx` | 939 | products, org_members | — | none |
| Scraper Admin | `src/pages/ScraperAdmin.tsx` | 1,248 | dispensary_menus, intel_stores ×4, intel_unmatched_discoveries ×3, lcb_licenses | All 5 scrape-* + platform-scan-batch | Enterprise-only implied |
| Competitors | `src/pages/Competitors.tsx` | 580 | user_brands, menu_snapshots, intel_stores (count), intel_alerts | — | none |
| Territory | `src/pages/Territory.tsx` | 33 | (deferred to TerritoryMap) | — | entire page gated |
| Reports | `src/pages/Reports.tsx` | ~1,900 | many (see §5) | — | product_affinity tab gated; PDF export gated |
| Trends | `src/pages/Trends.tsx` | 657 | daily_brand_metrics ×2, user_brands, market_brands | — | none |
| Weekly Briefing | `src/pages/WeeklyBriefing.tsx` | 320 | weekly_briefings | `generate-weekly-briefing` | none |
| Industry Pulse | `src/pages/IndustryPulse.tsx` | 450 | industry_pulse_items | — | entire page gated |
| Alerts | `src/pages/Alerts.tsx` | 393 | intel_alerts (+ realtime subscription) | — | none |
| Widget Embed | `src/pages/WidgetEmbed.tsx` | 431 | user_brands, market_brands | — | none |
| API Docs | `src/pages/ApiDocs.tsx` | 347 | — (static) | — | Enterprise feature notice |
| Settings | `src/pages/Settings.tsx` | 783 | user_brands, market_brands, user_alert_rules, api_keys | — | none |
| Ask Cody | `src/pages/AskCody.tsx` | ~200 | — | `cody-market-ai` | none |

**Visible thin spots:**
- Dashboard's chunked menu_items querying (still required because of URL-length limits; noted with a TODO-flavored comment)
- StoreDetail's product table hard-caps at 200 items with no pagination (stores with 2000+ products silently truncate)
- PriceReport's store-detail modal loads 2000 items but only shows 100 in the table

---

## 5. Reports Tabs Deep Dive

12 tabs in two groups — 7 Market Intelligence, 5 Advanced.

### Market Intelligence group (always visible)

**1. Brands** — Inline in Reports.tsx. Chunks `menu_items` 400 at a time, aggregates brand → (store_count, product_count, avg_price). Top 50. Table only. CSV export. Empty-state: "No brands found."

**2. Categories** — Inline. Same chunking pattern, aggregated by `raw_category`. Bar chart + table (top 12). `isExcludedCategory()` filter drops accessories/apparel. CSV.

**3. Coverage** — Three parallel queries (intel_stores count, dispensary_menus, intel_stores city breakdown). Hardcodes total LCB as 458 on line 376 — **will drift as the catalog grows**. Shows stat cards + platform table + city coverage table (top 20).

**4. Prices** — Multi-stage: menus + own_brands (user_brands fallback to market_brands) + stores, then menu_items in 400-chunks. Category-level + brand×category comparison. Filters by counts (≥5 items for category, ≥3 stores for brand×category). Bar chart + two tables + drill-down store modal (load-on-click).

**5. Leaderboard** — Top 50 stores by `total_products`. Parallel query to dispensary_menus for platform count. Table, 6 columns.

**6. Distribution** — `menu_items` aggregated by brand. Buckets brands into "1 store" through "50+ stores" histogram. Also computes "Niche Brands" = 2–8 stores with highest products/store ratio. Bar chart + Power Brands table (15) + Niche table (10).

**7. Gap Analysis** — **Broken.** Queries `user_brands.is_competitor_brand` which doesn't exist as a column. Fallback to `market_brands.is_competitor_brand` works but no TGS rows have that flag set, so `competitorBrands.length === 0` triggers the "No brands configured" error state. Even if flags were set, the store-to-menu-items join uses `dispensary_id` on one side and `intel_stores.id` on the other — potentially a second mismatch depending on which ID menu_items carries.

### Advanced group

**8. Market Saturation** — Imported from `src/pages/reports/SaturationAnalysis.tsx`. Pulls 500 most recent `menu_snapshots`, dedupes to latest per store. **Two issues:** (a) `menu_snapshots` is empty globally (0 rows), so zero saturation data is computable; (b) even if populated, the global 500-row limit means stores without a recent snapshot never get counted, producing the "0 unique brands per city" behavior. Fix requires both populating snapshots AND using `SELECT DISTINCT ON (intel_store_id)` instead of a flat limit.

**9. Sell-Through** — Imported from `src/pages/reports/SellThrough.tsx`. Same `menu_snapshots` dependency, same dormancy issue. When populated, tracks products across snapshots to compute velocity (HIGH/MEDIUM/LOW). Optional `ownOnly` filter.

**10. Report Builder** — Imported from `src/pages/reports/CustomReportBuilder.tsx`. 5 dimensions (city, store, brand, category, platform) × 5 metrics (product_count, brand_count, avg_price, store_count, coverage_pct). Six built-in templates. Table/bar/pie selectable. Aggregations run entirely client-side — would strain for large datasets.

**11. Deals** — Inline. Reads `store_deals` (table I didn't verify exists in the `intel%` prefix; possibly stub) and `intel_alerts` filtered to `alert_type='price_change'`. Shows a recent-price-changes table + promotion cards. Empty-state: "No significant price changes detected."

**12. Product Affinity** — Gated by `product_affinity` feature (Enterprise). Imported from `src/pages/reports/ProductAffinity.tsx`. Forward affinity (given own brand X, which other brands co-occur at stores carrying X) + reverse affinity (stores carrying X that lack some target brand). Depends on `user_brands` having own-brand rows + `menu_snapshots` populated.

### Shared infrastructure

**No global filters across tabs.** Each tab is independent. Filter state (search query, city, date range) is tab-local.

**Export hooks:**
- CSV export on Brands, Categories, Prices, Distribution, Saturation, Sell-Through, Custom Report, via `exportCSV()` in `src/lib/export-csv.ts`
- PDF export globally (top of Reports page) via `exportReportToPDF()` in `src/lib/pdf-export.ts` using jsPDF + autotable. Gated by `pdf_exports` feature.

**Tab visibility:** All 11 visible regardless of tier except Product Affinity (Enterprise).

---

## 6. Ask Cody

### How it works
- `src/pages/AskCody.tsx` (~200 lines).
- Calls `cody-market-ai` Edge Function via `callEdgeFunction` at line 67. 45-second timeout.
- History-aware: last 6 messages kept and sent with each new query.
- Renders responses as markdown-ish text.
- "Cody is thinking" spinner appears if response takes >4 seconds.

### Suggested questions
**Statically defined** at `AskCody.tsx:14-59`. `SUGGESTED` array with four categories:
- **Market Intelligence** (BarChart2 icon) — 4 prompts
- **Distribution Gaps** (Target icon) — 4 prompts
- **Purchase Orders** (Package icon) — 4 prompts
- **Competitive Intel** (Zap icon) — 4 prompts

### Tools Cody can use
The `cody-market-ai` Edge Function reads from: `menu_items`, `market_brands`, `market_categories`, `mv_brand_rankings` (**this materialized view doesn't exist** — any query relying on it fails), and the user's own `products`. No tool-use / function-calling — it's a single Claude prompt with data injected into the context.

### Why HTTP 401?
The 401 origin is the `cody-market-ai` Edge Function's auth check. The function verifies:
1. JWT from the `Authorization: Bearer <token>` header
2. `supabase.auth.getUser(jwt)` returns a user
3. The user has org membership

If any step fails, 401 is returned. The page itself (`AskCody.tsx`) does no special handling — it relies on `callEdgeFunction` in `src/lib/edge-function.ts` to pull the session token from the Supabase auth session and pass it along. The likely failure modes:
- **Session expired** during long-lived tab → token no longer validates
- **Token rotation issue** between Supabase client cache and the function's validation
- **`mv_brand_rankings` query throws** inside the function and the error is caught and returned as 401 (bug in error handling — would need code read to confirm)
- **Auth scheme mismatch** — if the function was updated to require a different header format

### Purchase Orders category ↔ CRM
The four Purchase Orders prompts (e.g. "Which accounts haven't ordered recently?" or "What's my pipeline this month?") **require CRM data** (deals, orders, contacts). `cody-market-ai` primarily reads Intel tables. There's code in earlier commits (`b1377c2 Phase 7: cody-market-ai - distribution gaps, purchase order context, historical trends`) that suggests CRM data was wired in. Whether it still works post-401 requires runtime verification.

---

## 7. AI Integration Throughout

| Surface | Function | Model | Prompt Structure |
|---|---|---|---|
| Store Detail brief | `generate-store-brief` | Claude Sonnet 4 | Store + menu + alerts + own-brand presence → narrative |
| Weekly Briefing | `generate-weekly-briefing` | Claude Sonnet 4 | Alert counts + brand churn → narrative |
| Industry Pulse | `scrape-industry-pulse` | Claude Sonnet 4 | Per-item AI summary with per-audience impact blocks |
| Ask Cody chat | `cody-market-ai` | Claude Sonnet 4 | Conversational, history-aware, 45s timeout, 1024 max_tokens |
| Dashboard normalization | `normalize-products` | (heuristic + rules, no LLM) | — |
| Market Briefing | `generate-market-briefing` | Claude Sonnet 4 | Market-level summary, related function to weekly briefing |

**Cost management:** No explicit rate limiting or budget caps visible in the code. Claude calls are made on user-action (button click) or on Industry-Pulse scrape runs. No automatic background AI generation is wired in Intel today. TGS's current usage is low (Industry Pulse scrape has 43 items generated; Store Brief is a 1-hour-cached ambient brief per store).

---

## 8. Known Issues and Tech Debt

### 82 Dutchie empty-menu stores — hypothesis
Confirmed: `dutchie_scrape_status='empty-menu'` = **82** stores; another 95 have `status=null` (never scraped) and 8 have `status='error'`. Only 60 of 245 Dutchie-designated stores have successful scrapes. Possible causes:
- **Slug mismatch.** `findIntelMatch` in `scrape-dutchie` is strict; if the Dutchie `cName` slug doesn't match LCB-derived store data perfectly, no match is recorded and `dutchie_slug` stays blank → next scrape attempt can't find the store → returns empty.
- **Stores genuinely off Dutchie.** Some LCB stores may have deprecated their Dutchie instance but still show up in old platform scans. Would require re-running `platform-scan-batch` to correct designation.
- **Dutchie rate-limited or returning empty arrays for specific stores.** Would require per-store log inspection.

### 53 undesignated stores
- **46 have no website** → platform scanner can't probe anything. These need manual research or a BuildZoom-style public-records lookup to get URLs.
- **7 have websites but no designation** → either `platform-scan-batch` hasn't been run against them, or the VPS detection returned nothing for all platforms. Could be closed/deprecated stores or stores running proprietary POS without a public menu.

### Weedmaps scraper broken
**19/19 Weedmaps-designated stores returned empty-menu.** Every scrape completed without errors but extracted zero items. Likely cause: VPS `/weedmaps-menu` endpoint returning empty-shaped responses, either because Weedmaps changed its DOM structure (VPS's Puppeteer logic is out-of-date) or because of bot detection. No rows have been successfully populated from Weedmaps in a long time.

### Market Saturation shows 0 unique brands per city
Dual bug:
1. **`menu_snapshots` is empty (0 rows)** — primary issue. Snapshot pipeline hasn't been run.
2. Even with snapshots, the query in `SaturationAnalysis.tsx:89` pulls top 500 globally instead of 1-per-store, which would miss stores absent from the top-500 most-recent window.

### Gap Analysis "no brands configured"
Root cause: `user_brands` has NO `is_competitor_brand` column. Reports.tsx queries it anyway. Fallback to `market_brands.is_competitor_brand` works schema-wise but no TGS `market_brands` rows have that flag set. Fix requires either (a) adding an `is_competitor_brand` column to `user_brands`, or (b) UX to set `market_brands.is_competitor_brand=true` for specific brands TGS considers competitors.

### Trends empty
Reads `daily_brand_metrics`. Empty state triggers at "< 7 days of data." `daily_brand_metrics` is populated by `snapshot-menus` as a side-effect, which hasn't been run. No daily job exists to generate it.

### Briefing empty
`weekly_briefings` has 0 rows. Only populated when user clicks "Generate This Week's Report" manually. No cron wiring to generate it automatically.

### Other tech debt

- **`mv_brand_rankings` materialized view doesn't exist.** Referenced in `cody-market-ai` code but not in the database. Any query relying on it fails or returns empty.
- **`store_deals` table** referenced in Reports Deals tab — not in the Intel-table list. Status unclear.
- **Hardcoded 458 for LCB total stores** on Coverage tab — will drift.
- **Dashboard chunked query workaround** (400 items/chunk) for menu_items still present. A proper RPC would fix it.
- **CSV / PDF exports not tier-gated uniformly.** CSV export is free on every tab; PDF export is gated. Inconsistent.
- **Ask Cody suggested questions are hardcoded.** No dynamic generation from user data.
- **Real-time subscription only in Alerts.** Everything else requires manual refresh.
- **No pagination** on StoreDetail product table (caps at 200 silently) or PriceReport store detail (caps at 100).
- **Settings → Scrape Schedule UI is wired but `scrape_schedules` table empty** — either the save path is broken or no one has saved one.

---

## 9. Infrastructure and Scheduled Jobs

### Active cron jobs
**None.** `scheduled-dutchie-refresh` is deployed as an Edge Function but nothing triggers it on a schedule. There's no `pg_cron` setup, no external scheduler like EasyCron, no Vercel cron. Everything is manual-button-click.

### What should be scheduled but isn't
1. **Daily menu scrape cycle** — for each designated_scraper platform, run the scrape function at a fixed time. Probably Dutchie hourly, others daily.
2. **Daily snapshot + diff** — `snapshot-menus` → `detect-menu-changes` pipeline. Drives Trends, Market Saturation, Sell-Through, alerts.
3. **Daily normalize + match** — `normalize-products` → `match-products`. Drives My Products match coverage.
4. **Weekly briefing generation** — per-org `generate-weekly-briefing` on Monday mornings.
5. **Daily Industry Pulse scrape** — `scrape-industry-pulse` catching new bills/rulemakings as they happen.
6. **Drive import for CRM** (Chaz mentioned) — importing new Drive docs as notes or contact attachments.

### Where would cron jobs run
**Options:**
- **Supabase pg_cron** — built-in, SQL-triggered. Good for anything that's a `SELECT http_post(...)` one-liner invoking an Edge Function. Requires enabling the `pg_cron` extension.
- **Vercel Cron** — per-route scheduled invocation. Good for Intel-side endpoints; less obvious fit for cross-repo Edge Functions.
- **External scheduler** (EasyCron, Upstash QStash) — more flexibility, runs on a schedule, posts to webhooks.
- **VPS cron** — the VPS is already running for scraper backends, could host a systemd timer or plain crontab.

### Blockers
1. **Auth.** Edge Functions require a user JWT. pg_cron runs as a DB role, not a user session — need service-role-auth OR a "system user" that can be impersonated.
2. **Coordination.** Multiple pipelines depend on each other (scrape → snapshot → diff → alert). Orchestrating them is a small DAG, not a single cron row.
3. **Rate limits.** Running all five platform scrapers daily × 560 stores = ~2800 store-scrapes/day. VPS + API limits need cost modeling.

---

## 10. Intel ↔ CRM Integration Points

### Shared tables (cross-app)
- `organizations`, `org_members`, `auth.users`, `profiles` — auth + org plumbing
- `contacts` (CRM) ↔ `intel_stores.crm_contact_id` — one bridge column
- `products` (CRM org catalog) ↔ `user_products`/`user_brands` + indirectly `menu_items.normalized_brand_id`
- `market_brands.is_own_brand` consumed by CRM Morning Briefing for alert escalation
- `intel_alerts` consumed by CRM's `MarketPulse` widget + `NotificationsCenter`
- `menu_items` queried by CRM's `generate-account-brief` + `generate-deal-brief` + `IntelReportsPage` (which is a mirror of Intel's Reports page)

### My Products pulls from CRM?
Yes. `MyProducts.tsx` queries the CRM `products` table scoped by `org_id` via `org_members`. This is the CRM's own product catalog — not an Intel-owned table. The MatchReview component joins product rows against fuzzy-matched `menu_items` via `user_product_menu_item_matches`.

### Cross-app reads (CRM surfaces consuming Intel)
- **IntelReportsPage** in CRM — a duplicate of Intel's Reports page, all 12 tabs
- **MarketPulse widget** on CRM Dashboard — reads `dispensary_menus`, `menu_items`, `intel_stores`, `intel_alerts`
- **ContactMarketIntel** on CRM ContactDetailPage — per-contact menu count + own-brand count + competitive-position score
- **NotificationsCenter** — real-time `intel_alerts` subscription
- **Account/Deal/Contact briefs** — each pulls 1–4 Intel tables as part of their signal gathering

### Cross-app planned features (not yet built)
- **CRM → Intel:** importing LCB licenses from CCRS files. Not wired.
- **Drive import:** uploading Drive docs into CRM notes. Not wired.
- **Intel→CRM outbound:** pushing intel alerts into CRM as tasks. Not wired (infrastructure is there via `intel_alerts.action_payload`, not consumed).

---

## 11. Design Decisions Worth Explaining

### Why Intel has its own Competitors page vs. inheriting from CRM
Intel's `Competitors.tsx` operates on **brands** (market-level entities), while CRM operates on **contacts** (accounts). The CRM has no concept of "competitor brand" — it has competitor *accounts* (other dispensaries). Intel's view is "which brands compete with my brands in the market" — inherently a market-intel concept.

### Why Territory lives in Intel instead of CRM
Territory is about **geographic market coverage** — "which stores does my rep cover, where is my brand sold, where are we dark?" That's a market-intel question. CRM's Routes page covers daily rep-level visit planning, which is account-level execution. Territories = strategy, Routes = execution.

### Why Industry Pulse is in Intel (not CRM)
Industry Pulse is regulatory intelligence — macro context that shapes all players in the market. It's not account-specific, not sales-specific. Lives in Intel because Intel is the "watch the market" product.

### Why 4 pricing tiers instead of 3
Most SaaS tools use 3 tiers (Starter/Pro/Enterprise). Intel has 4 (Scout/Analyst/Professional/Enterprise) to separate:
- **Scout** ($49) — browse-only, weekly refresh, a "why shouldn't I just use Headset/Hoodie?" entry tier
- **Analyst** ($149) — full reports + daily refresh, the "I'm doing basic market research" tier
- **Professional** ($299) — advanced analytics (saturation, sell-through), 12h refresh, the "I have a sales team and need to drive strategy" tier
- **Enterprise** ($499) — API + widget + all features, the "I'm building on top of this" tier

Splitting Analyst from Professional lets Chaz charge more for advanced capabilities without locking basic users out of reports entirely.

### Per-platform designated_scraper vs. trying all platforms every scrape
Running all 5 scrapers on all 560 stores every day would be >2800 store-scrapes/day, most wasted on platforms the store doesn't use. `designated_scraper` records which platform a store actually runs, so only that one gets called on refresh. The `platform-scan-batch` discovery phase happens rarely to set the assignment; `scrape-*` runs fire only against stores matching that platform. Rate-limit-friendly and cost-effective.

### Other non-obvious decisions
- **Own brand flag lives in two places** (`user_brands.is_own_brand` AND `market_brands.is_own_brand`) because Intel needs both: per-org ownership for gap analysis + global "is this one of someone's own brand" for alerting. Would be cleaner as a join table, but the redundancy is intentional for query speed.
- **`intel_stale_platform_bindings` as separate table** rather than flag on `intel_stores` — allows historical tracking of platform changes (when did a store leave Dutchie?) without overwriting current state.
- **`intel_unmatched_discoveries` not auto-promoted to `intel_stores`** — discovered stores need LCB license verification before becoming first-class. Keeps the main catalog clean.

---

## 12. Current State Summary

### What % of the vision is built vs. still thin

**Fully built and working:**
- Store discovery + menu scraping across 5 platforms (1.2M menu_items live)
- Store directory + store detail with real data
- Reports page with 8+ tabs showing real aggregates
- Industry Pulse feed with AI summaries (43 items)
- Ask Cody conversational AI (pending 401 fix)
- Scraper Admin ops tool (ingest + unmatched-discovery workflow)
- 4-tier plan system with feature gating
- Weekly Briefing edge function (just no automation)
- Embed widget + REST API scaffold (Enterprise)
- Store Detail ambient AI brief (P12)

**Shipped but dormant:**
- Menu snapshot pipeline (`menu_snapshots` empty → Trends empty, Saturation empty, Sell-Through empty)
- Normalization pipeline (`menu_item_normalizations` empty)
- Scheduled scrapes (`scrape_schedules` empty)
- Match-products engine (wired, not routinely run)
- `mv_brand_rankings` referenced but doesn't exist
- Weekly briefing auto-generation
- Daily-at-cron Industry Pulse scrape

**Broken:**
- Weedmaps scraper (19/19 empty-menu)
- Ask Cody (HTTP 401)
- Gap Analysis ("no brands configured" due to schema bug)
- Market Saturation ("0 unique brands" — snapshot dependency)

**Not built:**
- Cron scheduling (everything manual-trigger)
- CRM Drive import
- Advanced territory drawing beyond the map viewer
- Product Affinity analytics (wired but needs data)
- Store locator widget polish (code exists, not production-validated)

**Rough estimate: ~65% of the vision is shipped and working. ~20% is shipped-but-dormant (needs cron + data). ~10% is broken and needs targeted fixes. ~5% is unbuilt.**

### Biggest gaps for a Hoodie/Headset replacement (code perspective)

1. **No automated daily pipeline.** Hoodie and Headset populate their dashboards overnight; Intel requires manual triggers. The #1 blocker.
2. **No fresh snapshot-based trends.** Without `menu_snapshots` running daily, no "how is this brand trending?" signal exists. Breaks Trends, Saturation, Sell-Through, and weakens alerting.
3. **Weedmaps broken.** Hoodie and Headset both cover Weedmaps; Intel effectively doesn't.
4. **Brand ownership UX is hidden in Settings.** Must configure `user_brands` before half the Reports page works. New user onboarding doesn't surface this.
5. **No brand logos, imagery, or category canonical forms.** Hoodie has polished visuals; Intel shows raw strings.
6. **Reports tabs are client-computed.** At 1.2M menu_items today, that's slow; at 10M it'd be painful. Need RPCs for the heavy aggregations.
7. **Ask Cody unstable.** Conversational interface is the frontend differentiator against Hoodie/Headset; if it 401s, the wow-factor disappears.
8. **No historical data.** Hoodie and Headset display months of trends. Intel has 75 market_snapshots total, and menu_snapshots is empty.

### What I'd build first if I were Chaz

In priority order:

1. **Fix Ask Cody 401.** Even 30 minutes of work here — the user's main "wow" path.
2. **Deploy pg_cron for `snapshot-menus` + `detect-menu-changes`.** One daily trigger unlocks Trends, Saturation, Sell-Through, ongoing alerts. The biggest single return.
3. **Fix Weedmaps scraper** (VPS debug) — regains ~15% platform coverage.
4. **Add `is_competitor_brand` to `user_brands`** + surface in Settings. Unbreaks Gap Analysis.
5. **Daily Industry Pulse cron.** One scheduled job to keep the regulatory feed fresh.
6. **Replace the 400-chunk aggregations with RPCs.** Future-proof Reports at scale.
7. **Auto-generate weekly briefings on Monday morning** via cron → one more user-ready product at login.
8. **Address the 53 undesignated stores** — research websites, run `platform-scan-batch`, close the coverage gap.

These 8 items move Intel from "shipped features with quiet backend" to "living daily product" — exactly the Hoodie/Headset bar.
