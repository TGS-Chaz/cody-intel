# CRAFT + DANK'S Chain Investigation

**2026-04-19. Read-only investigation. No designations applied in this pass.**

Chaz didn't recall which platform the CRAFT and DANK'S chains use.
The investigation checks every location of each chain in
`intel_stores` — including locations outside the 53-undesignated
list — to find a designated location whose platform can be
inherited chain-wide.

---

## CRAFT chain

Six CRAFT locations in `intel_stores`. Three relevant signals:

| Name | City | designated_scraper | Slugs populated | In 53-list? |
|---|---|---|---|---|
| CRAFT CANNABIS, INC. | Vancouver | **dutchie** | `dutchie_slug = craft-cannabis-andresen` | no |
| CRAFT CANNABIS | Vancouver | NULL | none | **yes** |
| CRAFT LEAVENWORTH | Leavenworth | NULL | `leafly_slug = craft-leavenworth` | **yes** |
| CRAFT TACOMA | Tacoma | NULL | none | **yes** |
| CRAFT CANNABIS | Wenatchee | NULL | none | **yes** |
| CRAFT WENATCHEE | Wenatchee | NULL | none | **yes** |

### Signals

- **One CRAFT location is already designated: Vancouver-Andresen → Dutchie.** Has a working `dutchie_slug = craft-cannabis-andresen`.
- CRAFT LEAVENWORTH has a populated `leafly_slug` but not a designation. Two possibilities: (a) the chain switched from Leafly to Dutchie at some point and this is stale, (b) CRAFT is mixed — some on Leafly, some on Dutchie.
- The two Wenatchee entries confirm Chaz's note that CRAFT acquired The Back Porch — one entry is likely the pre-acquisition LCB record, the other post-acquisition. Both end up with the same designation.

### Recommendation

**Set the 5 undesignated CRAFT locations to Dutchie** based on the Vancouver-Andresen evidence. That's one confirmed working Dutchie slug vs. one un-confirmed Leafly slug. If Dutchie discovery later returns empty for Leavenworth, we can revisit — but chain-wide Dutchie is the best bet today.

Also clear CRAFT LEAVENWORTH's `leafly_slug` as part of the same change to avoid the scraper trying to fetch from the wrong platform.

---

## DANK'S chain

Five DANK'S-family locations (plus 2 DANK OF AMERICA, which are a different brand — see note below):

| Name | City | designated_scraper | Slugs populated | In 53-list? |
|---|---|---|---|---|
| DANK'S WONDER EMPORIUM | Edmonds | **dutchie** | `dutchie_slug = danks-warehouse` | no |
| DANK'S WONDER EMPORIUM (OLYMPIA) | Lacey | **dutchie** | `dutchie_slug = danks-wonder-emporium-olympia` | no |
| DANKS | Renton | NULL | none | **yes** |
| DANK'S TACOMA | Tacoma | NULL | none | **yes** |

### Signals

- **Two DANK'S locations already designated: both Dutchie.** Edmonds and Lacey/Olympia both use Dutchie and have working-looking slugs.
- Renton and Tacoma are undesignated.

### Recommendation

**Set DANKS (Renton) and DANK'S TACOMA → Dutchie.** Two out of four existing locations use Dutchie with populated slugs; no evidence of any other platform in the chain.

### Note: DANK OF AMERICA is a different brand

The two DANK OF AMERICA stores (Bellingham and Blaine) are in `dutchie_scrape_status = 'empty-menu'` per earlier audit/19. They share the "Dank" prefix but are a distinct brand. This investigation doesn't recommend any changes to them — they're designated and covered by the Pattern B analysis in audit/19.

The Edmonds DANK'S WONDER EMPORIUM also has `dutchie_slug = danks-warehouse` which may be a stale slug pointing to a former location name ("warehouse" vs "wonder emporium"). Worth verifying during a future scrape if the Edmonds location returns empty-menu. Not in scope for this pass.

---

## Other CRAFT/DANK'S oddities

- The CRAFT LEAVENWORTH `leafly_slug` is the strongest outlier — the only non-Dutchie slug across the whole CRAFT chain. Could be a stale artifact from a prior platform migration, or Leavenworth really does run Leafly while the rest run Dutchie. **Chrome-session check recommended** before bulk-designating CRAFT to Dutchie, if you want to be cautious.
- The two Wenatchee CRAFT entries (`CRAFT CANNABIS` + `CRAFT WENATCHEE`) likely represent pre- and post-acquisition LCB records for the same physical location (per Chaz's note that CRAFT bought The Back Porch). Both should get the same chain designation. **No duplicate-store cleanup recommended in this pass** — the duplication is a separate data-quality issue for a later phase.
- DANK'S Edmonds' `dutchie_slug = 'danks-warehouse'` looks like a former-name artifact. If it returns empty-menu in tonight's scrape, the cleanup fix is to unset the slug and re-run Dutchie discovery with the current store name.

---

## Summary recommendations (not applied in Pass 1)

| Chain | Undesignated locations | Recommended platform | Rationale |
|---|---|---|---|
| CRAFT | Vancouver (1), Leavenworth, Tacoma, Wenatchee (2) — 5 total | **Dutchie** | Vancouver-Andresen already on Dutchie with a working slug |
| DANK'S | Renton, Tacoma — 2 total | **Dutchie** | Edmonds + Lacey/Olympia already on Dutchie with working slugs |

**Combined, this would designate 7 additional stores.** After Pass 1 (13 stores designated), Pass 2 applying these recommendations would drop the undesignated count from 39 → 32.
