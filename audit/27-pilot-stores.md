# Phase 1e Pilot Store Selection

**2026-04-19. 20-store pilot for the two-pass platform verification scanner. STOP after pilot before running against all 560 stores.**

## Selection rules

Drawn per the Phase 1e Part 3 plan — diverse mix across existing designations + undesignated + chains. Random sampling within each category, filtered to stores with real dispensary-owned websites (skipped directory placeholders like `lookyweed.com`, `loc8nearme.com`, `topshelfdata.com`).

| # | intel_store_id | Name | City | Current designation | Website | Pilot role |
|---:|---|---|---|---|---|---|
| **POSaBit (5) — verify widget detection + cred extraction** |||||||
| 1 | 5b59c1e9-8f4b-47c0-b373-8a2c5c4d187e | 112TH STREET CANNABIS | PUYALLUP | posabit | https://menu.112thstreetcannabis.com/ | POSaBit on subdomain |
| 2 | 6664b002-2da3-49d7-9d62-b047d43969ec | AMERICAN HARVEST | PESHASTIN | posabit | https://americanharvestcannabis.com/menu/ | POSaBit on subpath |
| 3 | ee614f38-d479-4baa-812a-23d0a65cef5e | ANACORTES CANNABIS | ANACORTES | posabit | https://www.anacortescannabis.com/ | POSaBit at root |
| 4 | f00eee34-5edf-4657-b5e8-c46f370baf3e | CARAVAN CANNABIS COMPANY | BELLINGHAM | posabit | https://caravan-cannabis.com/ | POSaBit at root (multi-location) |
| 5 | 48b0372b-84f5-44ab-a0e1-9606b6dd270f | CASCADE HERB COMPANY | FERNDALE | posabit | https://cascade-herb.com/ | POSaBit at root |
| **Dutchie (5) — baseline iframe detection** |||||||
| 6 | 0f8b0e67-46ec-421b-abe6-02a189ed63e5 | THE VAULT CANNABIS | STANWOOD | dutchie | https://thevaultcannabis.com/menu-vault-silvana/ | Dutchie on subpath |
| 7 | bf7a48d2-946e-49be-880e-8546592d6fd0 | 2020 CANNABIS SOLUTIONS MT BAKER HWY | BELLINGHAM | dutchie | https://www.2020-solutions.com/locations/mt-baker-bellingham-dispensary | Dutchie on subpath |
| 8 | 830efe59-defd-41ce-a597-b3bcd6edb289 | ORCHARDS CANNABIS MARKET | VANCOUVER | dutchie | https://www.orchardscannabismarket.com/ | Dutchie at root |
| 9 | 44dc70e7-c82d-4855-b474-55fba3a3be3a | UNCLE WILLIE'S CANNABIS | KELSO | dutchie | https://www.unclewilliescannabis.com/ | Dutchie at root |
| 10 | 4457e06f-1d06-40b2-ad20-3da145c3bc5d | FLOYD'S CANNABIS COMPANY | PULLMAN | dutchie | https://www.floyds-cannabis.com/stores/floyds-cannabis-dispensary-pullman-wa/ | Dutchie on subpath |
| **Jane (3) — iheartjane embed detection** |||||||
| 11 | 2f8dace0-931a-4908-af7a-d646310017d5 | THE LINK | LONGVIEW | jane | https://thelinkcannabiscompany.com/longview-dispensary/ | Jane on subpath |
| 12 | a07d4e45-9784-4d7d-9197-db1a7fe4c89e | GREEN LADY HAWKS PRAIRIE | OLYMPIA | jane | https://greenladymj.com/locations/hawks-prairie/ | Jane on subpath |
| 13 | b1cb7fa4-bbe0-4519-88bc-602fcd136509 | THE MARIJUANA MERCANTILE | GRANITE FALLS | jane | https://themarijuanamercantile.com/ | Jane at root |
| **Leafly (1) — Fire Cannabis** |||||||
| 14 | 2561d549-6ade-40b7-ae9d-709fa728be4e | FIRE CANNABIS CO | YAKIMA | leafly | https://www.firecannabiscoshop.com/ | Chaz-flagged Leafly reference |
| **Undesignated (3) — from the 32-NULL pool, real sites** |||||||
| 15 | a832113d-7216-4dff-b644-000585694fdf | FREELAND CANNABIS COMPANY | FREELAND | NULL | https://www.freelandcannabis.com/ | Unknown — let scanner decide |
| 16 | 7ebad716-bd83-494b-8ded-2a8b1b0809e9 | CANNABIS PROVISIONS INC. | SHORELINE | NULL | https://www.cannabisprovisionsinc.com/ | Unknown — let scanner decide |
| 17 | 416fd2b4-1223-4feb-ad1d-f5a63c428be2 | W.C.W. ENTERPRISES | EVERSON | NULL | https://www.wcwcannabis.com/ | Unknown — let scanner decide |
| **Chain cross-check (3)** |||||||
| 18 | 313fc0eb-1b0b-49bf-a4c7-827151f4e73b | CRAFT CANNABIS | VANCOUVER | NULL | https://www.craftcannabis.com/ | Chain is Dutchie (per audit/22) — scanner should confirm |
| 19 | bd1ead00-0720-4f63-bf14-6ad702c37217 | DANK'S TACOMA | TACOMA | NULL | https://dankswarehouse.com/menu/tacoma/ | Chain is Dutchie (per audit/22) — scanner should confirm |
| 20 | c2062dcd-95d1-4120-8f1c-4a7048ead203 | PRC | EDMONDS | dutchie | https://www.prcwa.com/prc-cannabis-in-edmonds-wa/ | PRC chain is Jane per Chaz — scanner should correct this mis-designation |

## Why these specific roles

- **Store 20 (PRC Edmonds)** is the most important — it's currently designated Dutchie but the chain is Jane. If the scanner verifies Jane for PRC Edmonds, that's proof the verification catches stale designations (the whole point of Phase 1e).
- **Stores 18-19** test whether chain-level inheritance matches reality. Chaz's audit/22 recommended Dutchie for CRAFT + DANK'S based on existing sibling designations. If the scanner independently verifies Dutchie on these two, it's evidence the chain recommendation is correct.
- **Stores 1-5** cover the three main POSaBit hosting patterns: subdomain (`menu.host`), subpath (`/menu`), root embed. At least one of each so we can see where extraction breaks.
- **Stores 15-17** test the "unknown" path — stores currently designated NULL with real dispensary websites. If the scanner detects platforms here, we unblock new scrapes.
- **Store 14 (Fire Cannabis)** is Chaz's specific Leafly reference from the diagnostic Q5.

## Expected outcomes per the diagnostic

Per audit/26 + VPS addendum:

- **Pass 1 (HTTP-only) should catch:** Jane iframes (3), Dutchie iframes where they're in the root HTML (likely 3-4 of 5), Leafly embeds (1 if Fire is really on Leafly)
- **Pass 2 (VPS headless) should catch:** all 5 POSaBit via `window.posabitmenuwidget`, remaining Dutchie stores where the iframe is JS-injected, any undesignated stores that turn out to have platform embeds
- **Pilot success threshold:** ≥16/20 correct (80%). <80% means we iterate on the scanner before the full 560-store pass.

## Accuracy categories (for audit/28 reporting)

Each store will be scored on one of five outcomes:

1. **Confirms current designation** — verification matches DB. Counts as accuracy win for designated stores.
2. **Corrects current designation** — verification differs from DB. The mis-designation on PRC Edmonds would land here if detection finds Jane.
3. **Designates previously-NULL store** — for the undesignated pool.
4. **Credible "no embed"** — scanner ran cleanly, found nothing, and the store genuinely has no online menu. Requires human spot-check to distinguish from category 5.
5. **Scan failure** — 401, Cloudflare block, timeout, detached-frame, etc. Does NOT count toward accuracy and flagged for manual review.

Category 4 vs 5 is the hardest to automate and is why the `platform_verification` table needs a `confidence` field separate from `primary_platform`.
