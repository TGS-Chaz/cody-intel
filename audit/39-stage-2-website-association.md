# Phase 1j Stage 2 — Website Association for intel_stores_v2

**2026-04-19. Associated websites to `intel_stores_v2` rows via LCB license match → address fallback → tribal name/address carry-forward. Then fetched each associated website and compared its displayed address against the LCB address to verify. 264 of 470 rows (56.2%) auto-confirmed; 150 populated-but-unverified need a Chaz eyeball; 47 LCB rows have no website candidate at all; 7 tribal rows had no website in the source.**

## Headline — Stage 3 workload

| Cat | Count | What Stage 3 does |
|---|---:|---|
| 1 — Auto-confirmed | **264** | No action needed |
| 2 — Populated, unverified | **150** | Manual review: is the website legitimately this store's? Most fails are "site has no HTML-visible address" not "wrong site" |
| 3 — Ambiguous matches | **2** | Pick the right canonical row (both are at 5655 GUIDE MERIDIAN, Bellingham) |
| 4 — No website, LCB rows | **47** | Chaz supplies website from knowledge OR marks "no website / not yet operating" |
| 5 — Tribal | **7** | Separate review list — no website was carried from intel_stores (source had none for any of the 7) |
| **Total** | **470** | — |

Auto-confirm rate: **264 / 470 = 56.2%**. Expected-range was 350–400, so we're 90–140 rows below target. The shortfall is not a matching-logic problem — the license match hit 457 of 463 LCB rows cleanly. It's a **verification** problem: 134 of 414 populated websites don't surface the store's street address in static HTML (addresses loaded by JS, shown in images, or hidden behind a "Contact" page the fetcher didn't reach). Those sites get Cat 2, not Cat 1, even when the website is definitely correct.

This is fine operationally — Cat 2 just means "we can't auto-prove it, Chaz peeks." It's not 150 broken associations.

---

## Part 1 — License-ID match (intel_stores_v2 → lcb_licenses → intel_stores)

Pivoting through `lcb_licenses.license_number::text = intel_stores_v2.lcb_license_id`:

| Outcome | Count |
|---|---:|
| Single match | 457 |
| Multi-match (ambiguous) | 0 |
| Zero match | 6 |

Of the 457 single matches, **414 had a non-NULL `intel_stores.website`** and were copied into v2 with `website_association_source = 'lcb_license_match'`. The remaining 43 single-matches had a NULL website on the intel_stores side — they fell through to Part 2.

The 6 zero-matches are:
- 5 Social Equity retailers (GOLIATH PINES, HAPPY TREE, LUCKY LEAF CO, MAIN STREET MARIJUANA ORCHARDS, MHC LLC) — missing from the original `lcb_licenses` import entirely. Identified in Phase 1i audit/36 as "Missing LCB licensees" (4) + the 1 HAPPY TREE that was a Cat-D backfill case.
- 1 additional LCB-retail row — to be identified during Part 2 address-match.

Multi-match zero is a good result: every license in `lcb_licenses` maps to exactly one `intel_stores` row, confirming Phase 1i's Category B duplicates all had `lcb_license_id = NULL` on the phantom/alias side.

## Part 2 — Address-only match (for v2 rows still without website)

Pass B ran against 49 v2 rows that lacked a website after Part 1 (43 license-matched-but-null-website + 6 zero-license):

| Outcome | Count |
|---|---:|
| Single address match | 40 |
| Multi-match (ambiguous) | 2 |
| Zero address match | 7 |

**All 40 single-address matches had `NULL` website on the matched `intel_stores` row, so 0 v2 rows got a website via address-only.** This makes sense in hindsight: if the original import's same-city-same-address row had a website, Phase 1i's Cat D backfill path would have already carried it. By the time we're in Part 2, the only rows left are ones where both the license-matched AND the address-matched `intel_stores` row have NULL website.

The 2 multi-match ambiguous cases become Cat 3 (full details below).

## Part 3 — Website content verification

Fetched the homepage of every one of the 414 websites, extracted address-like strings from:
1. JSON-LD `schema.org/LocalBusiness → streetAddress` (strong signal)
2. Visible text regex: `\d{2,5} [A-Z0-9 ]+(ST|AVE|BLVD|RD|HWY|...)` (medium-strength — catches most footer text)
3. Joint plugin inline globals (`jointEcommerce.currentStore.address`)
4. POSaBit widget config (`address1`)

Normalized both LCB and extracted addresses (strip suite/unit, standardize ABBREV, collapse whitespace). Verified via:
- Exact match → `reason=exact`
- House number matches + ≥1 shared street token → `reason=house+Nshared`
- Street-name Jaccard similarity ≥ 0.6 with house number compatible → `reason=tok_jac=X`
- LCB address is substring of site text → `reason=substring`

Outcomes across 414 fetches (Windows `fetch` with 15 s timeout, 10-way concurrent):

| Result | Count | % of 414 |
|---|---:|---:|
| Verified (matched) | 264 | 63.8% |
| Populated but unverified (no match) | 146 | 35.3% |
| &nbsp;&nbsp;of which: no address found on page | 134 | — |
| &nbsp;&nbsp;of which: address found but didn't match | 12 | — |
| Fetch error (timeout/DNS/SSL) | 4 | 1.0% |

The "no address found" bucket is the dominant cause of Cat 2 — not bad associations.

## Part 4 — Tribal carry-forward

All 7 tribal rows' source `intel_stores` rows had `website = NULL`, so nothing was copied. Tribal rows in v2 all remain `website=NULL` with `website_association_source = 'tribal_carried_forward'` flag for traceability. These become Cat 5.

---

## Category 1 — Auto-confirmed (264)

20 random samples (full list in v2):

| lic | name | LCB address | website | Shown on site |
|---|---|---|---|---|
| 427850 | MR. GREENS CANNABIS | 15029 BOTHELL WAY NE STE 100, LAKE FOREST PARK | mrgreens.com | 15029 Bothell Way Northeast |
| 422701 | SAPPHIRE CANNABIS | 209 E 4TH ST STE B, SPRAGUE | sapphirecannabis.org/contact | 209 E 4th Street Sprague, Wa |
| 400772 | THE FIRE HOUSE | 1714 CANYON RD, ELLENSBURG | firehousenw.com | 1714 S Canyon Rd |
| 428276 | FIRE AND FROST CANNABIS | 6818 NE 4TH PLAIN BLVD STE B&C, VANCOUVER | fireandfrostcannabis.com | 6818 NE Fourth Plain Blvd |
| 414761 | THE HERBERY | 2815 ST. JOHNS ROAD STE B, VANCOUVER | theherberynw.com | 2815 St. Johns Blvd Vancouver |
| 430807 | DOCKSIDE CANNABIS | 8401 AURORA AVE N STE E1, SEATTLE | docksidecannabis.com | 8401 Aurora Ave N |
| 414295 | GREENSIDE | 23407 PACIFIC HWY S, DES MOINES | greensiderec.com/dispensaries/des-moines/ | 23407 Pacific Hwy S Des Moines |
| 434272 | LUX POT SHOP | 114 VINE ST, SEATTLE | luxpotshop.com | 114 Vine St |
| 422361 | YAKIMA WEED CO | 513 MAIN ST SW STE B, MATTAWA | shop.yakimaweedco.com | 513 SW Main St |
| 420908 | 2020 SOLUTIONS PACIFIC HIGHWAY | 4770 PACIFIC HWY STE A, BELLINGHAM | 2020-solutions.com/locations/pacific-hwy-bellingham-dispensary | 4770 Pacific Hwy |
| 414735 | MISTER BUDS | 536 MARINE DR STE B, PORT ANGELES | misterbuds.buzz | 536 MARINE DRIVE |
| 413492 | CHIMACUM CANNABIS | 9034 BEAVER VALLEY ROAD, CHIMACUM | menu.chimacumcannabis.com | 9034 Beaver Valley Road |
| 429453 | STARBUDS | 145 SAMISH WAY, BELLINGHAM | starbud.com | 145 Samish Way |
| 423993 | WHIDBEY RETAIL GROUP | 1860 SCOTT RD, FREELAND | whidbeyislandcannabisco.com | 1860 Scott Road |
| 420497 | THE GREEN NUGGET | 11414 N NEWPORT HWY, SPOKANE | thegreennugget.com | 11414 N Newport Hwy |
| 423885 | PRIMO CANNABIS | 21630 E GILBERT AVE, OTIS ORCHARDS | primostores.com | 21630 E Gilbert Rd #9241 |
| 413739 | SATIVA SISTERS | 10525 E TRENT AVE STE 1, SPOKANE | sativasisters.com | 10525 E Trent Ave |
| 413414 | MARGIE'S POT SHOP | 405 E STEUBEN ST, BINGEN | leafymate.com/dispensary/margies-pot-shop-bingen | 405 E Steuben St |
| 414876 | MAIN STREET MARIJUANA | 2314 MAIN ST, VANCOUVER | mainstmj.com | 2314 Main Street Vancouver |
| 076189 | PEND OREILLE CANNABIS CO | 124 RIVERSIDE AVE STE A, IONE | menu.pendoreillecannabis.com/ione | 124 E. Riverside Ave |

Samples look sane. Full 264 rows in DB with `website_verified = TRUE`.

## Category 2 — Populated but unverified (150)

The dominant failure mode is "website doesn't display an address in static HTML we can regex out." 20 random samples:

| lic | name | LCB address | website | What the fetcher found | Reason |
|---|---|---|---|---|---|
| 416102 | KUSHMART SOUTH EVERETT | 13220 HWY 99 S, EVERETT | kushmart.com/location/everett-wa/... | *(none)* | no_address_found |
| 414893 | THE JOINT | 9506 19TH AVE SE STE 100, EVERETT | thejointllc.com/legal-cannabis-everett/ | "189 on I-5 towards Everett Mall Way and 19th Ave SE" | best_tok_jac=0.30 |
| 422466 | ONE HIT WONDER CANNABIS | 2427 W SIMS WAY STE F, PORT TOWNSEND | onehitwondercannabis.com | "2600 NW Randall Way" | best_tok_jac=0.25 (possible stale/wrong site) |
| 435362 | THE LUCKY LEAF | 3501 RD 68 STE 104, PASCO | luckyleaf.co | "501 Rd 68 #104" | best_tok_jac=0.50 (truncated house number — same location) |
| 413901 | BUDHUT | 1131 E STATE ROUTE 532, CAMANO ISLAND | budhut.net/locations/camano-island | *(none)* | no_address_found |
| 439182 | CLEAR CHOICE CANNABIS | 317 S 72ND ST, TACOMA | findclearchoice.com/stores/tacoma/ | "8001 S Hosmer St" | best_tok_jac=0.33 (other location shown) |
| 421652 | ANACORTES CANNABIS | 7656 STATE ROUTE 20 UNIT A, ANACORTES | anacortescannabis.com | *(none)* | no_address_found |
| 414441 | A GREENER TODAY MARIJUANA | 5209 MLK JR. WAY S, SEATTLE | agreenertoday.com | *(none)* | no_address_found |
| 415112 | GREENLIGHT | 10309 E TRENT AVE SMP - 2, MILLWOOD | spokanegreenlight.com/menu/ | *(none)* | no_address_found |
| 420400 | GREENVIEW CANNABIS | 530 7TH AVE STE D, LONGVIEW | greenviewcannabis.com | *(none)* | no_address_found |
| 421777 | GREEN THEORY FACTORIA | 12827 SE 40TH PL, BELLEVUE | higherleaf.com/factoria | *(none)* | no_address_found (chain; verify manually) |
| 423224 | RAINIER CANNABIS | 22002 64TH AVE W STE 2A, MOUNTLAKE TERRACE | rainiercannabis.com | *(none)* | no_address_found |
| 420666 | CANNA WEST SEATTLE | 5440 CALIFORNIA AVE SW, SEATTLE | cannawestseattle.com | *(none)* | no_address_found |
| 421789 | GREENER DAZE CANNABIS | 945 WASHINGTON WAY STE 121, LONGVIEW | greenerdazecannabis.com | *(none)* | no_address_found |
| 429803 | LOCAL AMSTERDAM | 3200 15TH AVE W UNIT B, SEATTLE | seattle.local-amster.com | *(none)* | no_address_found |
| 422632 | THE LINK | 2211 46TH AVE, LONGVIEW | thelinkcannabiscompany.com/longview-dispensary/ | *(none)* | no_address_found |
| 424599 | NORTHWEST CANNABIS | 17905 STATE ROUTE 536, MOUNT VERNON | nwcannabisco.com/shop/ | *(none)* | no_address_found |
| 422138 | HAPPY TIME LLC 3 | 5602 STATE ROUTE 270 STE B, PULLMAN | happytimeweed.com/pullman | *(none)* | no_address_found |
| 423784 | 365 RECREATIONAL CANNABIS | 17517 15TH AVE NE #B, SHORELINE | 365recreational.com/shoreline/ | *(none)* | no_address_found |
| 445376 | DTC HOLDINGS | 2840 E HWY 101, PORT ANGELES | floyds-cannabis.com/stores/...port-angeles-wa/ | *(none)* | no_address_found |

Stage 3 triage approach suggestion: Chaz can eyeball 10-20 at random and see the pattern. If all look legit (just a website that hides its address), he can bulk-confirm all "no_address_found" Cat 2 rows to Cat 1 without reading each.

## Category 3 — Ambiguous matches (2 — full list)

Both rows are LCB-licensed retailers at the same Bellingham building (5655 GUIDE MERIDIAN, adjacent suites). Two intel_stores rows exist at the same address; the migration couldn't decide which canonical goes with which v2 license.

| lic | name | LCB address | Ambiguous intel_stores candidates |
|---|---|---|---|
| 421813 | CANNAZONE | 5655 GUIDE MERIDIAN STE **B**, BELLINGHAM | `a6f4b2c0-b98e-4aa6-b777-af3de91fbd96`, `c9b6ede3-bd9b-4359-a438-d36a6181c868` |
| 436879 | FOXX ENTERPRISES LLC | 5655 GUIDE MERIDIAN STE **C**, BELLINGHAM | `a6f4b2c0-b98e-4aa6-b777-af3de91fbd96`, `c9b6ede3-bd9b-4359-a438-d36a6181c868` |

Stage 3: Chaz looks up the two intel_stores rows by ID, picks which belongs to CANNAZONE (STE B) and which to FOXX (STE C), and we copy websites accordingly.

## Category 4 — No website, LCB rows (47 — full list)

42 main-sheet LCB retailers + 5 Social Equity. All have no website candidate to pull from in `intel_stores`. This is Chaz's Stage 3 workload.

| # | lic | source | name | LCB address | city |
|---:|---|---|---|---|---|
| 1 | 415526 | lcb_retail | 420 HOLIDAY | 2028 10TH AVE | LONGVIEW |
| 2 | 422460 | lcb_retail | ARISTOCRAT ENTERPRISES II | 2947 E HWY 101 STE A B | PORT ANGELES |
| 3 | 414558 | lcb_retail | B STREET BUD | 226 E COULEE BLVD | ELECTRIC CITY |
| 4 | 353993 | lcb_retail | CANNABIS 21 | 428 10TH ST | HOQUIAM |
| 5 | 430237 | lcb_retail | CANNABIS COAST FORKS | 362 LA PUSH RD | FORKS |
| 6 | 087932 | lcb_retail | CANNABIZ | 1109 RIVER RD STE A | PUYALLUP |
| 7 | 439635 | lcb_retail | CANNAZEN, LLC | 257 ENGH RD | OMAK |
| 8 | 430952 | lcb_retail | CANNAZONE | 45120 SE NORTH BEND WAY STE B | NORTH BEND |
| 9 | 439653 | lcb_retail | CANNAZONE | 4712 PACIFIC HWY | BELLINGHAM |
| 10 | 085059 | lcb_retail | CRAFT LEAVENWORTH | 8459 MAIN ST UNIT B | DRYDEN |
| 11 | 422303 | lcb_retail | DASH & WRIGLEY LLC | 13003 TUKWILA INTERNATIONAL BL UNIT A | TUKWILA |
| 12 | 423036 | lcb_retail | DISCOVERY BAY CANNABIS | 282023 HWY 101 | PORT TOWNSEND |
| 13 | 445189 | lcb_retail | DTC HOLDINGS | 10384 SILVERDALE WAY NW STE 10 | SILVERDALE |
| 14 | 445310 | lcb_retail | DTC HOLDINGS | 841 NESS CORNER RD STE B | PORT HADLOCK |
| 15 | 445379 | lcb_retail | DTC HOLDINGS | 8962 BEAVER VALLEY RD | CHIMACUM |
| 16 | 437875 | lcb_retail | EMERALD COAST | 6721 KITSAP WAY BLDG 1 UNIT A&D | BREMERTON |
| 17 | 432498 | lcb_retail | FORBIDDEN CANNABIS CLUB | 2108 ELMWAY UNIT A | OKANOGAN |
| 18 | 422913 | lcb_retail | FORBIDDEN CANNABIS CLUB MT. VERNON | 3818 OLD HIGHWAY 99 S RD | MOUNT VERNON |
| 19 | 413809 | lcb_retail | FORBIDDEN CANNABIS CLUB SEATTLE | 2413 E UNION ST | SEATTLE |
| 20 | 420898 | lcb_retail | GREENHAND | 2424 N MONROE STREET | SPOKANE |
| 21 | 422570 | lcb_retail | SWEET JANE | 21412 HIGHWAY 99 STE A | EDMONDS |
| 22 | 424273 | lcb_retail | HAPPY TREES | 407 E 1ST ST | CLE ELUM |
| 23 | 411970 | lcb_retail | HERBAL E SCENTS | 120 CANNING DRIVE NORTHEAST | COLVILLE |
| 24 | 414750 | lcb_retail | III KING COMPANY | 12925 MARTIN LUTHER KING JR WAY | SEATTLE |
| 25 | 423203 | lcb_retail | IT IS LIT | 1611 S SMITTYS BLVD STE B | RITZVILLE |
| 26 | 425584 | lcb_retail | JAB HEIGHTS PULLMAN | 1212 N GRAND AVE | PULLMAN |
| 27 | 422992 | lcb_retail | JAB MOMENTS SPOKANE | 6620 N MARKET ST STE 101 | SPOKANE |
| 28 | 420741 | lcb_retail | LIVING WELL ENTERPRISES | 17730 AMBAUM BLVD S UNIT E | BURIEN |
| 29 | 367339 | lcb_retail | MARIJUANA CLUB 99 LLC | 36728 US 2 SMP - 2 | SULTAN |
| 30 | 414864 | lcb_retail | MARY JANES | 1037 W MARINA DR | MOSES LAKE |
| 31 | 422981 | lcb_retail | MOUNT BAKER RETAIL PARTNERS, LLC | 12539 E MARGINAL WAY S STE C | TUKWILA |
| 32 | 422796 | lcb_retail | MOUNT VERNON RETAIL HOLDINGS LLC | 17929 STATE ROUTE 536 STE B | MOUNT VERNON |
| 33 | 424190 | lcb_retail | MR. DOOBEES | 1410 40TH ST | SEAVIEW |
| 34 | 423390 | lcb_retail | NATURAL BLESSING CANNABIS | 17024 PACIFIC AVE S STE B | SPANAWAY |
| 35 | 413407 | lcb_retail | NORTH BAY MARIJUANA | 211 E NORTH BAY RD STE B | ALLYN |
| 36 | 422951 | lcb_retail | PAUMA ENTERPRISES | 10825 MYERS WAY S STE 200 | SEATTLE |
| 37 | 413886 | lcb_retail | RED FOX CANNABIS | 4220 MERIDIAN ST STE 102 | BELLINGHAM |
| 38 | 414460 | lcb_retail | ROSLYN HERBS | 600 S FIRST STREET | ROSLYN |
| 39 | 434994 | lcb_retail | THE PACIFIC OUTPOST | 3221 W COURT S | PASCO |
| 40 | 430775 | lcb_retail | THE SAGE SHOP, LLC | 33607 US HIGHWAY 97 STE B | OROVILLE |
| 41 | 433175 | lcb_retail | TJ'S CANNABIS BUDS, EDIBLES, OILS & MORE | 3005 NORTHVIEW CIR UNIT 1 | SHELTON |
| 42 | 431327 | lcb_retail | WASHINGTON O G, LLC | 2114 WESTERN AVE STE B | SEATTLE |
| 43 | 414931 | lcb_social_equity | GOLIATH PINES | 8002B NE HIGHWAY 99 | VANCOUVER |
| 44 | 436321 | lcb_social_equity | HAPPY TREE | 354 CHARDONNAY AVE STE 3 | PROSSER |
| 45 | 435675 | lcb_social_equity | LUCKY LEAF CO | 528 W CLARK ST | PASCO |
| 46 | 414350 | lcb_social_equity | MAIN STREET MARIJUANA ORCHARDS | 12300 NE FOURTH PLAIN BLVD STE C & E | VANCOUVER |
| 47 | 438213 | lcb_social_equity | MHC LLC | 16271 N HIGHWAY 21 | REPUBLIC |

Notable clusters worth a single manual-research block in Stage 3:
- **DTC HOLDINGS × 3** (rows 13–15) — licenses 445189, 445310, 445379. All in the 445xxx block which is newly-issued LCB retail licenses, paired with the Floyd's/DTC chain from audit/32. These are three new locations that haven't opened yet — websites may not exist.
- **FORBIDDEN CANNABIS CLUB × 3** (rows 17–19) — three locations of the chain whose main site (Forbidden Cannabis Club) exists but per-location subpages vary.
- **CANNAZONE × 2** (rows 8, 9) — North Bend + Bellingham (in addition to the 1 Cat 3 Bellingham STE B). CANNAZONE is a chain, likely one parent website.
- **All 5 Social Equity** — state-sanctioned SE licenses, some of which may be pre-operating.

## Category 5 — Tribal (7 — full list)

All 7 rows sourced websites from their original intel_stores rows, all of which had `website = NULL`. Stage 2 carried the NULL through.

| name | LCB address | city | website | verified |
|---|---|---|---|---|
| ELWHA PEAKS CANNABIS | 4775 S Dry Creek Rd, Port Angeles, WA 98363, USA | Port Angeles | *(null)* | false |
| Q'ANAPSU | 31420 Northwest 31st Avenue, Ridgefield, WA 98642, USA | Ridgefield | *(null)* | false |
| Remedy Tulalip | *(null)* | Tulalip | *(null)* | false |
| REMEDY TULALIP | 9226 34th Ave NE, Marysville, WA 98271, USA | Marysville | *(null)* | false |
| THE TRIBAL JOINT | 22705 State Rte 530 NE | Darrington | *(null)* | false |
| NÍKXNA (COULEE DAM, WA) | Coulee Dam, WA 99116, USA | Coulee Dam | *(null)* | false |
| NÍKXNA (NESPELEM) | Nespelem, WA 99155, USA | Nespelem | *(null)* | false |

Stage 3 note: "Remedy Tulalip" (no address) and "REMEDY TULALIP" (Marysville 9226 34th Ave NE) look like two rows for the same tribal retailer — probably should merge to one v2 row. Ask Chaz. The 9226 34th Ave NE location is within the Tulalip Reservation but the postal city is Marysville.

---

## Summary — Stage 3 workload

| Cat | Count | Manual effort |
|---|---:|---|
| 2 | 150 | Spot-check 10-20; bulk-accept the "no_address_found" pattern if it's real across the sample. 1-2 hrs. |
| 3 | 2 | 5 minutes — pick which suite gets which website. |
| 4 | 47 | Research each; supply website or mark "pre-opening / no website." 1-2 hrs. |
| 5 | 7 | Provide tribal websites from tribe-level directories. 30 min. |
| **Total manual** | **206** | ~3-5 hours realistic |

Cat 1 (264) ships as-is.

## Artifacts

- Stage 2 migration (match + populate): `supabase/migrations/20260419090000_phase_1j_stage_2_website_association.sql`
- Verification results apply: `supabase/migrations/20260419100000_phase_1j_stage_2_apply_verification.sql`
- Verification JSON (raw fetch + compare): `audit/logs/phase-1j-stage-2-verification.json`
- Verification JSON (relaxed comparator): `audit/logs/phase-1j-stage-2-verification-v2.json`
- v2 state snapshot: `audit/logs/intel-stores-v2-after-stage2.json`
- Scripts: `scripts/phase-1j-stage-2-verify.mjs`, `scripts/phase-1j-stage-2-reanalyze.mjs`, `scripts/phase-1j-stage-2-apply-verification.mjs`

## Gate

No gate for Stage 2. Stage 3 is the Chaz-input phase. Proceed when ready.

## Rollback

Migrations 20260419090000 and 20260419100000 are additive — to revert, truncate `intel_stores_v2` (or drop it per Stage 1 rollback) and re-run only Stage 1. `intel_stores` remains untouched regardless.

Pre-Stage-2 commit: `1bc8279`.
