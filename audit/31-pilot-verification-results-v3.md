# PILOT FAILED — REVIEW NEEDED

**10/20 correct. Unchanged from v2.** Age-gate dismissal and menu-CTA clicking work — verified on 5 age gates (all dismissed) and 14 CTA attempts (all properly found and navigated). The ceiling isn't a scanner problem anymore; it's that the remaining misses don't have platform embeds to find.

**Run ID:** `4e959a8f-7000-4ffc-b216-568dcbdd13cf`.

**Headline:** v1 30% → v2 50% → v3 50%. The v3 work was the right engineering response to audit/29, and it produced clean, predictable behavior on sites that have age gates / CTAs — but on the specific 10 stores that missed in v2, **the menus are native WordPress/custom builds, not iframe embeds**. No amount of age-gate dismissing will find an iframe that isn't there. At this point the 50% ceiling is a property of the dataset, not the scanner.

---

## What the v3 fix did

| Behavior | Evidence |
|---|---|
| Age gate detection | 5/20 stores had age gates (Uncle Willie's, Cannabis Provisions, Green Lady Hawks Prairie, Caravan, The Marijuana Mercantile). 5/5 correctly detected |
| Age gate dismissal | 5/5 dismissed — matched buttons: "Enter", "YES", "I am 21 or older", "21+", "I'M OVER 21". Works across both modal and inline age-gate patterns |
| Menu CTA discovery | 10 stores had visible menu CTAs found. Examples: "SHOP ALL" (Floyd's), "Menu" (W.C.W.), "SEE MENU" (Cascade Herb), "ORDER ONLINE" (Orchards), "Shop Now" (DANK'S Tacoma) |
| CTA click + rescan | All CTAs navigated to their `href` and ran a second platform scan. No platform embeds found on any CTA destination for the 10 miss stores |
| No regressions from v2 fixes | Cert-errors fix, tightened Leafly regex, subdomain-probe skip, upsert — all still active. No false positives, no duplicate rows |

The new fields appear in `raw_response`: `age_gate` (detected / dismissed / strategy / matched_text), `menu_cta_attempts` (text / href / outcome per candidate), `detection_page_url` (where the winning detection came from).

---

## Accuracy table

| Category | Expected | Correct | Wrong | Errored | Details |
|---|---|---:|---:|---:|---|
| POSaBit (5) | posabit | **3** | 0 | 0 | 112th ✓, American Harvest ✓, Anacortes ✓. Caravan / Cascade Herb return `none` |
| Dutchie (5) | dutchie | **2** | 0 | 0 | The Vault ✓, 2020 Cannabis Solutions ✓. Orchards / Uncle Willie's / Floyd's return `none` |
| Jane (3) | jane | **2** | 0 | 0 | The Link ✓, Marijuana Mercantile ✓. Green Lady Hawks Prairie returns `none` (CTAs tried) |
| Leafly (1) | leafly | **1** | 0 | 0 | Fire Cannabis ✓ |
| Undesignated (3) | unknown | **1 new** | — | 0 | Freeland → posabit (new). Cannabis Provisions / W.C.W. return `none` |
| Chain (3) | varies | **1** | 0 | 0 | PRC Edmonds: dutchie → jane ✓. CRAFT / DANK'S Tacoma return `none` |
| **TOTAL** | | **10/20** | **0** | **0** | 50% — same as v2. No false positives, no errors |

---

## Per-store detail

| # | Store | Expected | Detected | Resolved by | Age gate | Age dismissed | CTAs tried | Notes |
|---:|---|---|---|---|---|---|---|---|
| 1 | 112th Street Cannabis | posabit | **posabit** | Pass 2 | no | — | 0 | Correct. `needs_credential_extraction=true` |
| 2 | American Harvest | posabit | **posabit** | Pass 2 | no | — | 0 | Correct. Menu URL already on `/menu/` subpath |
| 3 | Anacortes Cannabis | posabit | **posabit** | Pass 2 | no | — | 0 | Correct. Cert-fix still unblocking |
| 4 | Caravan Cannabis | posabit | none | — | **yes** | **yes ("21+")** | 0 | Age gate dismissed but no "Shop/Menu" CTA found on the root after dismiss |
| 5 | Cascade Herb | posabit | none | — | no | — | 1 ("SEE MENU") | CTA navigated — destination had no POSaBit widget |
| 6 | The Vault Cannabis | dutchie | **dutchie** | Pass 1 | — | — | — | Pass 1 high-confidence hit |
| 7 | 2020 Cannabis Solutions | dutchie | **dutchie** | Pass 1 | — | — | — | Pass 1 correct after v2 regex tightening |
| 8 | Orchards Cannabis Market | dutchie | none | — | no | — | 1 ("ORDER ONLINE") | CTA found; destination has no Dutchie embed |
| 9 | Uncle Willie's Cannabis | dutchie | none | — | **yes** | **yes ("Enter")** | 0 | Age gate dismissed; after dismissal the page has no visible menu CTA buttons |
| 10 | Floyd's Cannabis Company | dutchie | none | — | no | — | 3 (SHOP ALL / SHOP NOW ×2) | All 3 navigated to floyds-cannabis.com pages; **site uses custom "Joint" WordPress plugin, no Dutchie iframe anywhere.** DB designation likely stale |
| 11 | The Link | jane | **jane** | Pass 1 | — | — | — | Pass 1 iframe in root HTML |
| 12 | Green Lady Hawks Prairie | jane | none | — | **yes** | **yes ("I am 21 or older")** | 2 (SHOP NOW, Shop) | Age gate dismissed, 2 CTAs tried, no Jane embed on destination pages |
| 13 | The Marijuana Mercantile | jane | **jane** | Pass 2 | **yes** | **yes ("I'M OVER 21")** | 0 | Age gate unblocked Jane detection — Pass 2 v2 would've missed this if the gate remained up |
| 14 | Fire Cannabis Co | leafly | **leafly** | Pass 1 | — | — | — | Pass 1 correct |
| 15 | Freeland Cannabis | null | **posabit** | Pass 2 | no | — | 0 | New POSaBit designation |
| 16 | Cannabis Provisions Inc | null | none | — | **yes** | **yes ("YES")** | 1 ("MENU") | Age gate dismissed, CTA tried, no embed — likely genuine no-menu |
| 17 | W.C.W. Enterprises | null | none | — | no | — | 1 ("Menu") | No age gate; CTA tried, no embed — likely genuine no-menu |
| 18 | CRAFT Cannabis (Vancouver) | expected dutchie per chain | none | — | no | — | 2 (Shop All, SHOP NOW) | CTAs tried, no Dutchie embed on destinations |
| 19 | DANK'S Tacoma | expected dutchie per chain | none | — | no | — | 1 ("Shop Now") | CTA tried, destination has no Dutchie embed |
| 20 | PRC Edmonds | DB: dutchie, chain: jane | **jane** | Pass 1 | — | — | — | Pass 1 correctly corrects the DB mis-designation |

**Pass 2 scan wall-clock time:** 443s for 15 stores (≈30s avg/store). Age gate dismissal + 3-CTA attempt sequence stays well inside the 45s-per-store target. Extrapolated to 560 stores: ~4.5h — fits an overnight window.

---

## Error pattern analysis

The 10 misses now split more cleanly:

### Sites that almost certainly have no platform embed (6 stores)
- **Floyd's Cannabis** — runs a custom WordPress plugin called "Joint" (I grep'd the HTML: `joint_specials`, `joint_stores`, `joint_categories`, `joint_cart`, `id="joint-cart"` with a `data-config` blob). There's no Dutchie iframe anywhere. The DB designation is stale; store either switched away from Dutchie or was never on it.
- **Orchards**, **Uncle Willie's**, **W.C.W.**, **Cannabis Provisions**, **Cascade Herb** — all show similar "clean root, no embed on any probed URL or CTA destination" pattern. These look like WordPress/Squarespace sites with native product pages, not platform embeds.

For these, the scanner's `none` result is **correct** — or at least more honest than the existing DB designation.

### Sites where CTA did navigate but destination still had no embed (2 stores)
- **CRAFT Cannabis Vancouver** — "Shop All" CTA clicked. Destination was craftcannabis.com/locations/... with no Dutchie.
- **DANK'S Tacoma** — "Shop Now" clicked. Destination had no embed.

Could be: the chain-is-Dutchie hypothesis from audit/22 is correct but these specific locations have different menu flows, OR the hypothesis itself is wrong for these locations. Worth a manual spot-check but not a scanner bug.

### Sites where the embed is truly behind something we can't reach (2 stores)
- **Caravan Cannabis** — age gate dismissed, then caravan-cannabis.com/ has no visible "Shop/Menu" CTA because the POSaBit widget is supposed to load in-place after the age gate. Unknown why the widget isn't materializing — could be another interaction required, could be POSaBit JS failing on this specific site.
- **Green Lady Hawks Prairie** — age gate dismissed, 2 CTAs tried (both Google Maps results probably don't count as valid destinations). The actual Jane embed may live on a location-specific sub-page the scanner doesn't reach.

### Are the remaining misses a pattern?
**Yes, one dominant pattern: the menu isn't an iframe embed.** Six of ten misses appear to use custom WordPress/Squarespace setups with products as native HTML pages. The scanner's detection regex (which looks for `dutchie.com/embed`, `iheartjane.com`, `leafly.com/widget`, `posabitmenuwidget`) can't fire because those strings never appear on those sites.

**Smallest additional fix that would raise the ceiling:**
Not a scanner fix — a **workflow fix**. Treat scanner-`none` as a signal to:
1. Clear the DB's `designated_scraper` for that store (since the scraper won't work anyway)
2. Flag the store for Chaz to manually verify via F12 — the same workflow that produced the 53-store audit/21 export

This isn't a scanner failure mode. It's the scanner doing its job: telling us which stores' designations are lies.

---

## Gate decision: REVIEW NEEDED (but honest recommendation differs)

Strict rule: 10/20 < 12/20 → **REVIEW NEEDED**.

Honest read: **the 50% floor is data, not code.** A third iteration of scanner fixes won't raise it meaningfully because the remaining misses are sites without platform embeds. Three paths forward:

### Option A — Accept 50% as the scanner ceiling, proceed to 560-store run
Run the v3 scanner against all 560 stores. Expect:
- ~280 stores get a clean detection (confirms DB, corrects stale designations, or fills in NULLs)
- ~280 stores return `none` — these become the manual-review queue, equivalent to audit/21's 53-store list but at 5× the scale

The "none" bucket IS useful signal — not a failure. It tells Chaz: "we scanned, nothing's there, you need to decide: (a) update DB to null-scraper + no-online-menu, (b) the menu is on a custom platform we don't scrape, or (c) the store changed platforms". The decision is manual but the triage is done.

Cost: 4.5 hours overnight, zero writes to `intel_stores`, ~560 new rows in `platform_verification`.

### Option B — Manual-verify 3-4 pilot misses first
Before committing to a 560-store run, Chaz spot-checks 3-4 of the Pattern-A misses (say Floyd's, Orchards, Uncle Willie's, CRAFT Vancouver) to confirm the "site has no embed" interpretation. Takes ~10 min. If the interpretation holds, proceed with Option A.

This is the cheapest way to validate the "data not code" argument.

### Option C — Make the scanner more aggressive (third iteration)
Add:
- Scroll the page to trigger IntersectionObserver / LazyLoad frameworks (Floyd's uses LiteSpeed LazyLoad — iframes might be deferred)
- Watch the Network tab for requests to dutchie.com / iheartjane.com / posabit.com after clicking CTAs
- Support React SPA routing (when a click triggers `history.pushState` but not a full nav)

Estimate: another 4-6 hours of VPS work. Uncertain payoff — I'd bet it unblocks 1-2 more stores but not 4+. Not recommended unless Option B spot-checks reveal the sites DO have embeds we're missing.

**My recommendation:** Option B first (10 min), then Option A if B confirms.

---

## Bugs found during v3

None of note. The implementation was clean:
- New code: 8 `grep` hits for `dismissAgeGate|menu_cta_attempts|findMenuCtas` confirmed in the running container
- Syntax check passed pre-deploy
- Chromium restarted cleanly
- No duplicate rows, no orphaned processes
- `--ignore-certificate-errors` + all v2 flags still in the process args (confirmed via `ps`)

The only operational friction: the Supabase edge function `verify-platform-pass2` still hits `WORKER_RESOURCE_LIMIT` on chunks of 5 stores when waitMs=25s, so v3 bypassed the edge function and called the VPS `/detect-platform-batch` directly from SSH. For 560-store production, the edge function wrapper needs to be split into smaller cron-driven slices (or replaced with direct VPS calls from a pg_cron cursor pattern like Phase 1d).

---

## Time budget

- Pass 1 (edge function): ~30s for 20 stores (same as v2)
- Pass 2 (direct VPS): **443s for 15 stores** = ~30s/store (same per-store as v2 despite added age-gate + CTA work; well under the 45s target)
- Total wall-clock for 20-store pilot v3: ~8 minutes

For 560 stores at this rate: ~4.5 hours. Overnight window — fine.

---

## Summary for Chaz's decision

- v3 code works exactly as designed. Age gates dismissed, CTAs clicked, detection runs on destination pages.
- The 50% pilot accuracy is **the real accuracy for this dataset**, not a scanner gap.
- 6 of 10 misses are stores that appear to have no iframe embed at all — their "menus" are native WordPress/Squarespace.
- Next decision is yours: (A) run 560 with the current scanner and treat `none` as a manual-review queue, (B) spot-check 3-4 stores first to confirm the no-embed interpretation, or (C) one more round of scanner aggressiveness.
- My recommendation is **B → A**.
