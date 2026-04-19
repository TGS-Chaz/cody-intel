-- Phase 1j Stage 2 — associate websites from intel_stores into intel_stores_v2.
-- Matches happen inside the DB (service_role) because lcb_licenses is not
-- readable by anon. Website content verification runs in a separate Node step
-- afterward (see scripts/phase-1j-stage-2-verify.mjs) — that step sets
-- website_verified=true/false and writes diagnostic v2_notes.

-- ── Setup ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Address normalizer — lowercase, strip suite/unit, collapse whitespace,
-- standardize common abbreviations. Good enough for fuzzy matching across
-- LCB uppercase canonical addresses and intel_stores free-text ones.
CREATE OR REPLACE FUNCTION _p1j_norm_addr(t text) RETURNS text AS $$
DECLARE
  a text;
BEGIN
  IF t IS NULL OR btrim(t) = '' THEN RETURN ''; END IF;
  a := upper(btrim(t));
  a := regexp_replace(a, ',\s*WA\s*\d{5}(-\d{4})?,\s*USA\s*$', '', 'i');
  a := regexp_replace(a, ',\s*[A-Z\s]+,\s*WA\s*\d{5}(-\d{4})?,?\s*USA?\s*$', '', 'i');
  a := split_part(a, ',', 1);
  a := regexp_replace(a, '[.,]', ' ', 'g');
  a := regexp_replace(a, '\m(SUITE|STE|UNIT|APT|RM|ROOM|BLDG)\M', ' ', 'g');
  a := regexp_replace(a, '\s#\s*[A-Z0-9-]+', ' ', 'g');
  a := regexp_replace(a, '\mSTREET\M', 'ST', 'g');
  a := regexp_replace(a, '\mAVENUE\M', 'AVE', 'g');
  a := regexp_replace(a, '\mBOULEVARD\M', 'BLVD', 'g');
  a := regexp_replace(a, '\mROAD\M', 'RD', 'g');
  a := regexp_replace(a, '\mDRIVE\M', 'DR', 'g');
  a := regexp_replace(a, '\mHIGHWAY\M', 'HWY', 'g');
  a := regexp_replace(a, '\m(NORTHEAST)\M', 'NE', 'g');
  a := regexp_replace(a, '\m(NORTHWEST)\M', 'NW', 'g');
  a := regexp_replace(a, '\m(SOUTHEAST)\M', 'SE', 'g');
  a := regexp_replace(a, '\m(SOUTHWEST)\M', 'SW', 'g');
  a := regexp_replace(a, '\m(NORTH)\M', 'N', 'g');
  a := regexp_replace(a, '\m(SOUTH)\M', 'S', 'g');
  a := regexp_replace(a, '\m(EAST)\M', 'E', 'g');
  a := regexp_replace(a, '\m(WEST)\M', 'W', 'g');
  a := regexp_replace(a, '\mWASHINGTON\M', 'WA', 'g');
  a := regexp_replace(a, '\bU\s+S\b', 'US', 'g');
  a := regexp_replace(a, '\b(US|WA|SR|STATE\s+ROUTE|STATE\s+HWY|US\s+HWY)\s*-?\s*(\d+)\b', 'US-\2', 'g');
  a := regexp_replace(a, '\bHWY\s+(\d+)\b', 'US-\1', 'g');
  a := regexp_replace(a, '\s+', ' ', 'g');
  RETURN btrim(a);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ── Part 1 + 2: license match, then address match ───────────────────────
DO $$
DECLARE
  v2_row   RECORD;
  match_ct INT := 0;
  license_single  INT := 0;
  license_multi   INT := 0;
  license_zero    INT := 0;
  address_single  INT := 0;
  address_multi   INT := 0;
  address_zero    INT := 0;
  tribal_addr_hit INT := 0;
  tribal_none     INT := 0;
  single_old_id   UUID;
  single_website  TEXT;
  single_addr     TEXT;
  multi_ids       UUID[];
  multi_websites  TEXT[];
BEGIN
  -- Pass A: license-match for source_of_truth IN ('lcb_retail','lcb_social_equity')
  FOR v2_row IN
    SELECT id, lcb_license_id, name, address, city
      FROM intel_stores_v2
     WHERE lcb_license_id IS NOT NULL
  LOOP
    SELECT array_agg(i.id), array_agg(i.website) FILTER (WHERE i.website IS NOT NULL AND btrim(i.website) <> '')
      INTO multi_ids, multi_websites
      FROM intel_stores i
      JOIN lcb_licenses l ON l.id = i.lcb_license_id
     WHERE l.license_number::text = v2_row.lcb_license_id;

    IF multi_ids IS NULL OR array_length(multi_ids, 1) IS NULL THEN
      license_zero := license_zero + 1;
      UPDATE intel_stores_v2
         SET v2_notes = coalesce(v2_notes,'') || E'\nStage2: license ' || v2_row.lcb_license_id || ' had no intel_stores match.'
       WHERE id = v2_row.id;
    ELSIF array_length(multi_ids, 1) = 1 THEN
      license_single := license_single + 1;
      SELECT i.id, i.website, i.address INTO single_old_id, single_website, single_addr
        FROM intel_stores i
        JOIN lcb_licenses l ON l.id = i.lcb_license_id
       WHERE l.license_number::text = v2_row.lcb_license_id;

      IF single_website IS NOT NULL AND btrim(single_website) <> '' THEN
        UPDATE intel_stores_v2
           SET website                    = single_website,
               website_association_source = 'lcb_license_match',
               website_verified           = false,
               v2_notes = coalesce(v2_notes,'') || E'\nStage2: website from intel_stores.id=' || single_old_id::text
                       || CASE
                            WHEN _p1j_norm_addr(single_addr) = _p1j_norm_addr(v2_row.address) THEN ' (addr exact match)'
                            WHEN similarity(_p1j_norm_addr(single_addr), _p1j_norm_addr(v2_row.address)) >= 0.6 THEN ' (addr trgm sim>=0.6)'
                            ELSE ' (addr diverges: intel="' || coalesce(single_addr,'') || '", v2="' || coalesce(v2_row.address,'') || '")'
                          END
         WHERE id = v2_row.id;
      ELSE
        -- License matched a single intel_stores row but it has no website
        UPDATE intel_stores_v2
           SET v2_notes = coalesce(v2_notes,'') || E'\nStage2: license-matched intel_stores.id=' || single_old_id::text || ' but website was NULL/empty.'
         WHERE id = v2_row.id;
      END IF;
    ELSE
      license_multi := license_multi + 1;
      UPDATE intel_stores_v2
         SET v2_notes = coalesce(v2_notes,'') || E'\nStage2: license ' || v2_row.lcb_license_id
                     || ' matched ' || array_length(multi_ids, 1) || ' intel_stores rows — ambiguous. IDs: {'
                     || array_to_string(multi_ids::text[], ',') || '}'
       WHERE id = v2_row.id;
    END IF;
  END LOOP;

  -- Pass B: address-only match for v2 rows still without website
  FOR v2_row IN
    SELECT id, name, address, city, source_of_truth
      FROM intel_stores_v2
     WHERE website IS NULL
       AND source_of_truth IN ('lcb_retail','lcb_social_equity')
  LOOP
    SELECT array_agg(i.id), array_agg(i.website) FILTER (WHERE i.website IS NOT NULL AND btrim(i.website) <> '')
      INTO multi_ids, multi_websites
      FROM intel_stores i
     WHERE upper(i.city) = upper(v2_row.city)
       AND (
             _p1j_norm_addr(i.address) = _p1j_norm_addr(v2_row.address)
          OR (length(_p1j_norm_addr(v2_row.address)) >= 8
              AND similarity(_p1j_norm_addr(i.address), _p1j_norm_addr(v2_row.address)) >= 0.75)
           );

    IF multi_ids IS NULL OR array_length(multi_ids, 1) IS NULL THEN
      address_zero := address_zero + 1;
    ELSIF array_length(multi_ids, 1) = 1 THEN
      address_single := address_single + 1;
      SELECT i.id, i.website INTO single_old_id, single_website
        FROM intel_stores i
       WHERE upper(i.city) = upper(v2_row.city)
         AND (
               _p1j_norm_addr(i.address) = _p1j_norm_addr(v2_row.address)
            OR (length(_p1j_norm_addr(v2_row.address)) >= 8
                AND similarity(_p1j_norm_addr(i.address), _p1j_norm_addr(v2_row.address)) >= 0.75)
             );
      IF single_website IS NOT NULL AND btrim(single_website) <> '' THEN
        UPDATE intel_stores_v2
           SET website                    = single_website,
               website_association_source = 'address_only_match',
               website_verified           = false,
               v2_notes = coalesce(v2_notes,'') || E'\nStage2: License had no intel_stores match; address matched intel_stores.id=' || single_old_id::text || '. Review whether same store under different name.'
         WHERE id = v2_row.id;
      END IF;
    ELSE
      address_multi := address_multi + 1;
      UPDATE intel_stores_v2
         SET v2_notes = coalesce(v2_notes,'') || E'\nStage2: address ambiguous — matched ' || array_length(multi_ids,1) || ' intel_stores rows in '
                     || v2_row.city || '. IDs: {' || array_to_string(multi_ids::text[], ',') || '}'
       WHERE id = v2_row.id;
    END IF;
  END LOOP;

  -- Pass C: tribal match (no license, match by name + address in same city)
  FOR v2_row IN
    SELECT id, name, trade_name, address, city
      FROM intel_stores_v2
     WHERE source_of_truth = 'tribal_manual'
  LOOP
    SELECT i.id, i.website INTO single_old_id, single_website
      FROM intel_stores i
     WHERE upper(i.name) = upper(v2_row.name)
        OR (i.address IS NOT NULL AND _p1j_norm_addr(i.address) = _p1j_norm_addr(v2_row.address) AND upper(i.city) = upper(v2_row.city))
     LIMIT 1;

    IF single_old_id IS NOT NULL THEN
      tribal_addr_hit := tribal_addr_hit + 1;
      UPDATE intel_stores_v2
         SET website                    = single_website,
             website_association_source = 'tribal_carried_forward',
             website_verified           = false,
             v2_notes = coalesce(v2_notes,'') || E'\nStage2: tribal — carried website from intel_stores.id=' || single_old_id::text || '.'
       WHERE id = v2_row.id;
    ELSE
      tribal_none := tribal_none + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'License match: single=%, multi=%, zero=%', license_single, license_multi, license_zero;
  RAISE NOTICE 'Address match: single=%, multi=%, zero=%', address_single, address_multi, address_zero;
  RAISE NOTICE 'Tribal match:  hit=%, none=%', tribal_addr_hit, tribal_none;

  SELECT COUNT(*) INTO match_ct FROM intel_stores_v2 WHERE website IS NOT NULL;
  RAISE NOTICE 'intel_stores_v2 rows with website populated after Stage 2 match: %', match_ct;
END $$;

-- Cleanup — drop the helper function so it doesn't pollute the schema.
-- (Verification step in Node doesn't need it.)
-- Keep it for now; Stage 3 may reuse. Drop in Stage 6 cleanup.
