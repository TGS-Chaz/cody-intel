# Phase 1j Stage 5 — Appendix: Stage 3 manual_chaz Duplicate / Generic-URL Flags

**2026-04-19. Follow-up to CRAFT Leavenworth discovery. Scanned all 66 v2 rows with `website_association_source='manual_chaz'` (Stage 3 human-supplied websites) for two issues: (a) another v2 row shares the same `joint_business_id`; (b) the URL is a chain-generic path (`/locations`, `/shop`, `/stores`, bare root, or `utm_source=gmb`) that may surface a different store's menu widget.**

**Count: 66 rows scanned (was 67 before CRAFT Leavenworth was hard-deactivated). 6 flagged.**

## Flag types

- **`shared_bizid`** — v2 row shares `joint_business_id` with another v2 row. Sometimes legitimate (audit/32 LCB duplicate pattern = two licenses on one physical business); sometimes a Stage 3 URL mix-up.
- **`generic_url_with_bizid`** — v2 row has a joint bizid AND a chain-generic URL. Higher risk of a Leavenworth-style false-positive.
- **`generic_url_with_platform`** — v2 row has any detected platform AND a chain-generic URL. Lower-risk; may still be a URL mix-up.

## Flagged rows

| Flag | v2 id | Name | LCB lic | Website | bizId | Peers on same bizid | Suggested action |
|---|---|---|---|---|---|---|---|
| **shared_bizid** | `25064...` | CRAFT CANNABIS (Mill Plain) | 413732 | https://www.craftcannabis.com/locations/mill-plain-dispensary/ | 4353 | CRAFT CANNABIS, INC. (lic 431536, same URL) | **keep** — audit/32 documented LCB-duplicate pattern; same physical business, two LCB licenses |
| generic_url_with_platform | `8a5810...` | THE PACIFIC OUTPOST | 434994 | https://menu.thepacificoutpost.com/ | (none) | — | **keep** — URL is a store-specific menu subdomain, path `/` is the widget root. Scanner flagged on path="/" heuristic. POSaBit primary_platform detected cleanly. |
| generic_url_with_platform | `915a36...` | Remedy Tulalip | (null) | https://remedytulalip.com/shop/ | (none) | — | manual review — tribal; single-domain /shop is typical, but we have 2 v2 rows pointing at same URL (see below) |
| generic_url_with_platform | `7ed049...` | REMEDY TULALIP | (null) | https://remedytulalip.com/shop/ | (none) | — | manual review — duplicate of above; two v2 rows (Tulalip + Marysville) pointing at one URL. Likely should be **merged** — Stage 6 consolidation candidate |
| generic_url_with_platform | `a54...` | IT IS LIT | 423203 | https://menu.i90greenhouse.com/ | (none) | — | **manual review** — URL points at `i90greenhouse.com` but LCB name is `IT IS LIT`. Either IT IS LIT operates under the i90 Green House brand OR Stage 3 URL is wrong |
| generic_url_with_platform | `(see log)` | WASHINGTON O G, LLC | 431327 | https://www.americanmarywa.com/locations/belltown-dispensary/belltown-dispensary-menu/ | (none) | — | **manual review** — URL points at `americanmarywa.com/locations/belltown` but LCB name is `WASHINGTON O G, LLC`. Legal vs DBA? Or URL mix-up? Address in v2 = 2114 WESTERN AVE STE B (Seattle Belltown). American Mary is a DBA that may operate this LCB license |

## Interpretation — per-row disposition

### 1. CRAFT CANNABIS (Mill Plain + Andresen) — `shared_bizid` — no action

Both LCB licenses (413732 Mill Plain + 431536 Andresen) point at `https://www.craftcannabis.com/locations/mill-plain-dispensary/` and share `joint_business_id = 4353`. Per audit/32 Section "LCB-duplicate pattern" and Chaz's FINDING 1 note on 2026-04-19: **same physical business operating on two LCB licenses**. Both rows legitimately carry the same bizId. The Mill Plain widget serves both.

**Action:** none. Leave as-is. The Joint scraper nightly job will fetch bizId 4353 once and can populate both menu_items sets from a single API call (Phase 1h+ optimization noted in audit/34 Section "One operational thing to watch").

### 2. THE PACIFIC OUTPOST — `generic_url_with_platform` — no action

The regex flagged the URL because `URL.pathname === "/"`. `menu.thepacificoutpost.com` is a store-specific menu subdomain, not a chain-generic page. POSaBit primary_platform was cleanly detected. No issue.

**Action:** none. Tweak the scanner's generic-URL heuristic in a future pass to exempt `menu.{store-name}` patterns.

### 3. Remedy Tulalip + REMEDY TULALIP — `generic_url_with_platform` (×2) — Stage 6 merge candidate

Two v2 rows (one for city=Tulalip, one for city=Marysville) both point at `https://remedytulalip.com/shop/`. Source table originally had two rows for the same tribal retailer (reservation city vs. postal city disagreement). Both were carried forward in Stage 1.

**Action:** flag for Stage 6 — merge these two v2 rows into one. No bizId disambiguation needed since neither is a Joint store.

### 4. IT IS LIT (Ritzville, lic 423203) — `generic_url_with_platform` — **MANUAL REVIEW**

LCB name "IT IS LIT". Stage 3 URL: `https://menu.i90greenhouse.com/` — a totally different store brand (i90 Green House at the I-90 corridor). Either:
- IT IS LIT operates as i90 Green House (DBA relationship)
- Chaz entered the wrong domain in Stage 3

**Action:** Chaz confirms. If DBA, note it for the future `dba_name` column. If URL mix-up, revert the website to NULL and rerun Stage 3 for this single row. Until confirmed, the detected platform for IT IS LIT is actually i90 Green House's.

### 5. WASHINGTON O G, LLC (Belltown Seattle, lic 431327) — `generic_url_with_platform` — **MANUAL REVIEW**

LCB legal name "WASHINGTON O G, LLC". Stage 3 URL: `https://www.americanmarywa.com/locations/belltown-dispensary/...` — points at American Mary's Belltown location. The LCB address for 431327 IS 2114 Western Ave Ste B (Seattle Belltown), so it's plausible that American Mary is the DBA for the WASHINGTON OG LLC legal entity operating at Belltown. This mirrors the **MOUNT VERNON RETAIL HOLDINGS = Floyd's Cannabis Mount Vernon** pattern (legal name ≠ operating brand).

**Action:** Chaz confirms. Almost certainly legit (legal-entity/DBA mismatch), but worth eyeballing once.

## Summary table (for tracking)

| Row | Final disposition |
|---|---|
| CRAFT CANNABIS (Mill Plain + Andresen) | **keep** — documented LCB-duplicate pattern |
| THE PACIFIC OUTPOST | **keep** — false-positive on URL heuristic |
| Remedy Tulalip × 2 | **Stage 6 merge** — two rows, one tribal retailer |
| IT IS LIT → i90 Green House | **manual review — Chaz** |
| WASHINGTON O G, LLC → American Mary Belltown | **manual review — Chaz** (likely DBA, not a real issue) |

## Generic-URL regex pattern used

```
/\/locations(?:[\/?#]|$)|\/locations\?|\/stores[\/?#]?$|\/shop[\/?#]?$|utm_source=gmb/i
```

Plus a pathname==="/" check. The pathname check over-flags store-specific menu subdomains (catches THE PACIFIC OUTPOST false-positive). A future refinement could exempt URLs where the hostname contains the LCB trade name.

## Industry-wide pattern — `dba_name` column

Both IT IS LIT / i90 Green House and WASHINGTON O G LLC / American Mary (and the earlier MOUNT VERNON RETAIL HOLDINGS / Floyd's Cannabis, DTC HOLDINGS / Floyd's) are examples of LCB legal name ≠ customer-facing brand. Future Phase 1k could add a `dba_name` column to intel_stores (post-swap) and populate it from these known patterns. Not urgent — the `website` field already routes scrapers correctly; this is UI-polish for dashboards showing "real store name" rather than legal name.

## Artifacts

- Scan script: `scripts/phase-1j-stage-5-duplicate-scan.mjs`
- Raw JSON: `audit/logs/phase-1j-stage-5-duplicate-flags.json`
