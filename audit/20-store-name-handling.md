# Store Name Handling — Investigation

**2026-04-19. Read-only. No changes made.**

Scope: how `intel_stores.name`, `trade_name`, and `business_name` are
populated, displayed, and used by scrapers across Cody Intel + CRM.

---

## 1. Field population

```
total_stores               : 560
name_populated             : 560  (100%)
trade_name_populated       : 457  (82%)
business_name_populated    : 0    (0%)
name_differs_from_trade    : 2
has_legal_but_no_trade     : 0
legal_differs_from_trade   : 0
```

**Headline findings**

- `business_name` is **completely empty**. The column exists, the
  StoreDetail admin form exposes it, but no row has ever had it set.
  The LCB legal name never landed in the right column during import.
- `trade_name` is populated on 82% of stores but almost always
  mirrors `name` — only 2 out of 457 differ.
- The 2 rows where `name != trade_name` look **semantically inverted**:

  | name | trade_name |
  |---|---|
  | TOKE OF THE TOWN | MARIJUANA CLUB 99 LLC |
  | FLOYD'S MT VERNON | MOUNT VERNON RETAIL HOLDINGS LLC |

  The LLC (legal) name ended up in `trade_name`; the DBA (trade) name
  ended up in `name`. So for these 2 stores the label semantics are
  reversed relative to what the schema implies.

**In practice, the schema's three-name distinction is unused.**
Everyone-sees-`name`, `trade_name` is a near-duplicate for 455 rows
and a stray legal-name holder for 2, `business_name` is dormant.

---

## 2. Display usage across the app

### Intel pages

| Surface | Field used | File / line | Fallback |
|---|---|---|---|
| Store Directory list | `name` | `StoreDirectory.tsx:459` | none |
| Store Detail header `<h1>` | `name` | `StoreDetail.tsx:297` | none |
| Store Detail editable form | all 3 separately | `StoreDetail.tsx:341-352` | n/a (each its own field) |
| Dashboard → Top Stores | `name` | `Dashboard.tsx:664` | none |
| Reports → Leaderboard | `name` | `Reports.tsx:1027-1033, 1076` (CSV export `1050` same) | none |
| Reports → Saturation / Sell-Through / Affinity | read from `menu_snapshots`, no intel_stores name join | — | — |
| Scraper Admin unmatched / match cands | `platform.store_name` (from the scraper's own discovery data, not `intel_stores`) | `ScraperAdmin.tsx:1088, 1157` | `?? "—"` |
| Alerts | **no store name at all** — rows show only title/type/body | `Alerts.tsx:328-345` | — |
| Ask Cody | chat doesn't query store names directly (edge fn does) | — | — |
| Territory / Trends / Weekly Briefing / Industry Pulse | no store-name rendering | — | — |

### CRM pages

| Surface | Store name shown? | Field / source |
|---|---|---|
| MarketPulse widget | no | shows counts + alert titles only |
| ContactMarketIntel widget | no | implicit via contactId context |
| NotificationsCenter | no | alert title/body only |
| IntelReportsPage | same as Intel Reports when rendered | `name` |

### Edge-function AI prompts

| Function | Expression | Implication |
|---|---|---|
| `generate-store-brief` | `trade_name \|\| name` (at `index.ts:117` and `:272`) | Only place in the codebase that *prefers* trade_name. Feeds the store label into the system prompt ("…called ${storeLabel} in the Cody Intel product…"). |
| `cody-market-ai` | uses `contacts.company` or `store_name` derived from CRM contacts — doesn't touch `intel_stores.{name,trade_name,business_name}` | CRM-side data path; different field |
| `generate-market-briefing` | `contacts.company` via opportunity scoring | Same |
| `generate-weekly-briefing`, `generate-contact-brief`, `generate-route-brief`, `generate-account-brief`, `scrape-industry-pulse` | no direct `intel_stores.*_name` references | — |

**Net effect:** the only "trade-name-aware" surface in the entire
product is the Store Detail ambient brief. Everything else displays
raw `name`.

### Alerts surface gap worth flagging

`intel_alerts` rows carry `intel_store_id` but the Alerts page does
not join back to `intel_stores` — users see the alert body but no
store label. Not a naming bug per se; a missing display.

---

## 3. Scraper matching logic

| Scraper | Matcher | Tier-1 | Tier-2 | Tier-3 | Tier-4 | Name-field awareness |
|---|---|---|---|---|---|---|
| **Dutchie** | `findIntelMatch()` at `scrape-dutchie/index.ts:208-285` | License exact (normalized alphanumeric, ≥4 chars) | Address (street# exact + body first 3+ chars after abbreviation expansion; zip tiebreaker) | Geo <0.1 mi Haversine (+name ≥0.5 if multi-hit) | Name+city fuzzy ≥0.75 with first-word match required | **Tries all 3 name fields** per intel row, returns best score |
| **Leafly** | Same `findIntelMatch()` copied at `scrape-leafly/index.ts:93-170` | same | same | same | same | **Tries all 3 name fields** same |
| **Jane** | **none** | n/a | n/a | n/a | n/a | Match is manual via website embed detection (`discover-ids` writes `jane_store_id` if iHeartJane embed found on store website) |
| **POSaBit** | **none** | n/a | n/a | n/a | n/a | Match is implicit via website — widget detection writes 4 creds to `intel_stores` when the store website has POSaBit embedded |

### No-match behavior
- **Dutchie & Leafly:** write a row to `intel_unmatched_discoveries`
  keyed on `(platform, store_name, city)`. Dutchie writes
  `platform, store_name, address, city, state, platform_slug,
  platform_id`. Leafly adds `phone, website, license_number, latitude,
  longitude`.
- **Jane & POSaBit:** no discovery record. Stores that don't respond
  to the website probe just stay un-scraped, silently.

### Name-field awareness detail

The fuzzy match in Dutchie/Leafly (`_iNameScore`, lines 183-200 of
each file) iterates over `[s.name, s.trade_name, s.business_name]`
and returns the best of the three. Required: first significant word
matches between external and intel names. Stop-words excluded (`the`,
`cannabis`, `llc`, etc.). Score = `exact_word_overlap / max(length)`.

Given the field-population reality:
- `business_name` is always null — that branch is dead code
- `trade_name == name` in 455/457 cases — same branch, same score
- Only the 2 inverted rows gain any benefit from the three-way check,
  and those rows will match their `name` field anyway

So the scrapers' three-name-check effectively collapses to single-name
matching today. If `business_name` ever gets populated, the code is
already there to use it.

---

## 4. Manual-match UI

**The manual-match UI DOES exist.** Found in
`cody-intel/src/pages/ScraperAdmin.tsx`:

- **Unmatched-discoveries browser:** lines 510+
- **Candidate search + link button:** UI in the platform cards
- **Confirm link handler:** `handleConfirmLink()` at lines 730-750
- **What it writes** when Chaz confirms a match:
  1. Updates the discovery row:
     `intel_unmatched_discoveries.matched = true`
     `intel_unmatched_discoveries.matched_intel_store_id = <intel_stores.id>`
  2. Writes the platform slug to `intel_stores`:
     `intel_stores.<platform>_slug = <discovery.platform_slug>`
     (where `<platform>_slug` is `dutchie_slug` / `leafly_slug` /
     `weedmaps_slug` depending on discovery.platform)

Columns on `intel_unmatched_discoveries`:
```
id, org_id, platform, store_name, address, city, state, phone,
website, license_number, platform_slug, platform_id, latitude,
longitude, discovered_at, matched, matched_intel_store_id
```

### Matched counts

```sql
-- Total unmatched-discovery rows: 144
-- Rows where matched=true:       142
-- Remaining unmatched:             2
```

```
platform | total | matched
---------+-------+--------
dutchie  |  133  |   131
leafly   |   11  |    11
```

**Chaz has done a lot of manual matching.** 142 out of 144 discovered
stores are now linked to `intel_stores` rows. Only 2 Dutchie
discoveries remain unmatched.

Weedmaps wrote 0 rows to this table (deprecated in Phase 1c; any
prior rows predate this data state).

---

## 5. Things I noticed but am not fixing

- `business_name` column is a zombie field. Never populated, never
  displayed (except in the empty edit form), never used in prompts.
  Either the original import missed it or the schema evolved past
  its purpose.
- `trade_name` doesn't mean what the schema implies it means. It's a
  near-duplicate of `name` for 82% of stores, and holds a legal name
  (not a trade name) for the 2 rows where it diverges.
- The store label in `generate-store-brief` falls back to `trade_name
  || name` — for the 2 inverted rows, this surfaces the LLC legal
  name in the ambient brief instead of the DBA.
- Alerts page carries `intel_store_id` but never resolves it to a
  store label — an easy UX improvement, unrelated to the naming
  question.
- Jane and POSaBit produce no unmatched records. If their embed-
  detection misses a legitimate store, there's no trail; the store
  just never gets scraped.
- `intel_unmatched_discoveries.matched=true` rows are not deleted
  by the scraper's pre-upsert cleanup — only `matched=false` rows
  get wiped before re-upserts. So the 142 confirmed matches stick
  around, which is the right behavior for an audit trail but worth
  noting.
