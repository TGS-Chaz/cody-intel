# Phase 1j Stage 5 — Appendix: Stage 3 manual_chaz Duplicate / Generic-URL Flags

**2026-04-19. RESOLVED — all 4 flagged items confirmed correct by Chaz 2026-04-19. This appendix now serves as reference documentation for the LCB-duplicate, legal-vs-DBA, and rebrand patterns it uncovered. None require action. See "Standing rule" at bottom.**

## Scope of original scan

Scanned all 66 v2 rows with `website_association_source='manual_chaz'` (Stage 3 human-supplied websites) for two issues:
- **shared_bizid** — another v2 row shares the same `joint_business_id`
- **generic_url_with_platform** — URL is a chain-generic path (`/locations`, `/shop`, `/stores`, bare root, `utm_source=gmb`) that *could* surface a different store's menu widget

**6 rows matched** (5 unique situations after dedup). Chaz reviewed each and confirmed all are correct. Resolution notes below.

## Resolved rows

| Situation | v2 rows involved | Website | Disposition |
|---|---|---|---|
| LCB-duplicate pattern (1 business, 2 licenses) | CRAFT CANNABIS (Mill Plain, lic 413732) + CRAFT CANNABIS, INC. (Andresen, lic 431536) | https://www.craftcannabis.com/locations/mill-plain-dispensary/ | **Confirmed correct by Chaz 2026-04-19.** Audit/32-documented LCB-duplicate pattern. Mill Plain's widget serves both rows. Future audits should not re-flag. |
| Store-specific menu subdomain (false-positive on pathname="/") | THE PACIFIC OUTPOST (lic 434994) | https://menu.thepacificoutpost.com/ | **Confirmed correct by Chaz 2026-04-19.** Regex over-flagged on bare-root pathname; `menu.{store}.com` is a legitimate store-specific subdomain pattern. |
| LCB-duplicate pattern (tribal, 2 rows one URL) | Remedy Tulalip (Tulalip) + REMEDY TULALIP (Marysville) | https://remedytulalip.com/shop/ | **Confirmed correct by Chaz 2026-04-19.** Same LCB-duplicate pattern as CRAFT Vancouver — two rows, same URL serves both. Keep both active. |
| **Store rebrand** (IT IS LIT → I90 Greenhouse) | IT IS LIT (lic 423203) | https://menu.i90greenhouse.com/ | **Confirmed correct by Chaz 2026-04-19.** The store was renamed from "IT IS LIT" to "I90 Greenhouse" after the LCB snapshot was taken. Our `intel_stores_v2.name` still shows the legacy LCB name; the website points at the current brand. |
| Legal-entity ≠ DBA | WASHINGTON O G, LLC (lic 431327) | https://www.americanmarywa.com/locations/belltown-dispensary/belltown-dispensary-menu/ | **Confirmed correct by Chaz 2026-04-19.** Same legal-vs-DBA pattern as MOUNT VERNON RETAIL HOLDINGS LLC = Floyd's Cannabis Mount Vernon. "WASHINGTON O G, LLC" is the LCB legal entity; operates as American Mary Belltown. |

## Three patterns we now treat as "expected and correct"

These aren't bugs — they're structural realities of WA's LCB licensing. Any future audit surfacing these patterns should document the relationship in audit/41 Section 4 rather than flagging for review.

### 1. LCB-duplicate pattern (two licenses, one physical business)

Occurs when one business holds multiple LCB licenses for ownership/branding/expansion reasons. Both rows carry the same website, same joint_business_id, same menu. Examples:

- CRAFT CANNABIS Mill Plain (lic 413732) + CRAFT CANNABIS, INC. Andresen (lic 431536) — Vancouver
- Remedy Tulalip + REMEDY TULALIP — tribal, Tulalip/Marysville

### 2. Legal entity ≠ DBA (operating brand)

Occurs when the LCB license is held by a shell/parent entity but the store operates under a different brand name. Website routes correctly; only the `name` field in our DB shows the legal name. A future `dba_name` column would polish dashboards. Examples:

- MOUNT VERNON RETAIL HOLDINGS LLC (lic 422796) → operates as Floyd's Cannabis Mount Vernon
- DTC HOLDINGS (lic 6115) → operates as Floyd's Cannabis Port Angeles
- WASHINGTON O G, LLC (lic 431327) → operates as American Mary Belltown

### 3. Post-LCB-snapshot store rename / rebrand

Occurs when a store changes its trade name after the LCB snapshot was pulled but before LCB updates their public list. Our `name` column is stale; the website points at the new brand. Examples:

- IT IS LIT (lic 423203) → renamed to I90 Greenhouse; site is `menu.i90greenhouse.com`

## Standing rule (per Chaz 2026-04-19)

> Any website Chaz set during Stage 3 review (`website_association_source = 'manual_chaz'`) is authoritative. Don't re-flag manual_chaz entries as suspicious in future audits. If an audit finds what appears to be a website mismatch on a manual_chaz row, the resolution is to document the legal-name-vs-DBA (or LCB-duplicate, or rebrand) relationship, not to flag for review.

## Follow-on Sub-stages (also resolved no-flag-needed)

- **Sub-stage A** (audit/42): rescanned 41 Stage-4 gap+regressed stores with `waitMs=60000`. 2 recoveries.
- **Sub-stage B** (audit/43): discovered + refreshed the Jane detector for the `iheartjane.com → tags.cnna.io` migration. 5 recoveries.
- **Sub-stage C** (audit/44): full-bucket rescan of 144 Stage-4 `none` rows with the refreshed detector. 10 more recoveries (7 Jane, 2 POSaBit, 1 Dutchie).

Net: Stage 4 designations 280 → **296** after A/B/C. Jane alone went 78 → 91 (+16%).

## Artifacts

- Scan script: `scripts/phase-1j-stage-5-duplicate-scan.mjs` (kept for reference; do not re-run against manual_chaz rows)
- Raw JSON: `audit/logs/phase-1j-stage-5-duplicate-flags.json`
