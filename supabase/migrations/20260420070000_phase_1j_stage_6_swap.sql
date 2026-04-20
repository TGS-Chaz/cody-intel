-- Phase 1j Stage 6 — swap intel_stores ↔ intel_stores_v2 + repoint
-- dispensary_menus.intel_store_id to the new table.
-- Wrapped in a single transaction (Supabase db push auto-wraps migration files).

-- ── Step 1 — rename v1 to archived ───────────────────────────────────────
ALTER TABLE intel_stores RENAME TO intel_stores_archived;

-- ── Step 2 — rename v2 to primary ────────────────────────────────────────
ALTER TABLE intel_stores_v2 RENAME TO intel_stores;

-- Rename the partial unique indexes we built on the v2 table to drop the
-- "_v2" suffix now that the table no longer carries it. Purely cosmetic —
-- indexes still function regardless of name.
ALTER INDEX idx_intel_stores_v2_license  RENAME TO idx_intel_stores_license;
ALTER INDEX idx_intel_stores_v2_ubi      RENAME TO idx_intel_stores_ubi;
ALTER INDEX idx_intel_stores_v2_city     RENAME TO idx_intel_stores_city_v2;  -- v1 had idx_intel_stores_city on archived already
ALTER INDEX idx_intel_stores_v2_status   RENAME TO idx_intel_stores_status;
ALTER INDEX idx_intel_stores_v2_source   RENAME TO idx_intel_stores_source;
ALTER INDEX idx_intel_stores_v2_is_active RENAME TO idx_intel_stores_is_active;

-- ── Step 3 — repoint dispensary_menus.intel_store_id ─────────────────────
-- The legacy FK now references intel_stores_archived (following the Step 1
-- rename). Drop it, rewrite IDs via stage_5_store_mapping, NULL orphans,
-- re-add FK pointing at the new intel_stores.

ALTER TABLE dispensary_menus DROP CONSTRAINT dispensary_menus_intel_store_id_fkey;

-- Capture counts BEFORE rewrite so we can log the delta.
DO $$
DECLARE before_total INT; before_with_store INT; updated_ct INT; nulled_ct INT; after_total INT; after_with_store INT; after_distinct INT;
BEGIN
  SELECT COUNT(*), COUNT(intel_store_id) INTO before_total, before_with_store FROM dispensary_menus;
  RAISE NOTICE 'BEFORE repoint: dispensary_menus total=%, with intel_store_id=%', before_total, before_with_store;

  -- Repoint rows whose current intel_store_id maps to a v2 row
  WITH upd AS (
    UPDATE dispensary_menus d
       SET intel_store_id = m.new_intel_store_v2_id
      FROM stage_5_store_mapping m
     WHERE d.intel_store_id = m.old_intel_store_id
       AND m.new_intel_store_v2_id IS NOT NULL
       AND m.confidence IN ('high','medium')
    RETURNING 1
  ) SELECT COUNT(*) INTO updated_ct FROM upd;
  RAISE NOTICE 'Repointed dispensary_menus rows to v2: %', updated_ct;

  -- NULL orphans: rows still referencing old_intel_store_id that have no
  -- new_intel_store_v2_id (retired_v1 mappings).
  WITH nulls AS (
    UPDATE dispensary_menus d
       SET intel_store_id = NULL
     WHERE d.intel_store_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM stage_5_store_mapping m
          WHERE m.old_intel_store_id = d.intel_store_id
            AND m.new_intel_store_v2_id IS NULL
       )
    RETURNING 1
  ) SELECT COUNT(*) INTO nulled_ct FROM nulls;
  RAISE NOTICE 'NULLed orphan dispensary_menus rows (retired_v1 mappings): %', nulled_ct;

  -- Catch any row that DIDN'T match a mapping entry at all — those would be
  -- pointing at intel_stores_archived IDs with no stage_5 row. Shouldn't
  -- exist if Stage 5 was complete, but guard anyway.
  WITH unmapped AS (
    UPDATE dispensary_menus d
       SET intel_store_id = NULL
     WHERE d.intel_store_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM intel_stores s WHERE s.id = d.intel_store_id
       )
    RETURNING d.id
  ) SELECT COUNT(*) INTO nulled_ct FROM unmapped;
  RAISE NOTICE 'NULLed rows with no intel_stores match (unexpected leftovers): %', nulled_ct;

  SELECT COUNT(*), COUNT(intel_store_id), COUNT(DISTINCT intel_store_id) INTO after_total, after_with_store, after_distinct FROM dispensary_menus;
  RAISE NOTICE 'AFTER repoint: dispensary_menus total=%, with intel_store_id=%, distinct=%', after_total, after_with_store, after_distinct;
END $$;

-- Re-add the FK pointing at the new intel_stores (post-rename = former v2).
ALTER TABLE dispensary_menus
  ADD CONSTRAINT dispensary_menus_intel_store_id_fkey
  FOREIGN KEY (intel_store_id) REFERENCES intel_stores(id);

-- ── Validation ───────────────────────────────────────────────────────────
DO $$
DECLARE intel_total INT; intel_active INT; intel_inactive INT; intel_designated INT;
         archived_total INT; dm_with_store INT; dm_null INT; orphan_ct INT;
BEGIN
  SELECT COUNT(*) INTO intel_total FROM intel_stores;
  SELECT COUNT(*) INTO intel_active FROM intel_stores WHERE is_active = TRUE;
  SELECT COUNT(*) INTO intel_inactive FROM intel_stores WHERE is_active = FALSE;
  SELECT COUNT(*) INTO intel_designated FROM intel_stores WHERE designated_scraper IS NOT NULL;
  SELECT COUNT(*) INTO archived_total FROM intel_stores_archived;
  SELECT COUNT(*) INTO dm_with_store FROM dispensary_menus WHERE intel_store_id IS NOT NULL;
  SELECT COUNT(*) INTO dm_null FROM dispensary_menus WHERE intel_store_id IS NULL;
  SELECT COUNT(*) INTO orphan_ct
    FROM dispensary_menus d
   WHERE d.intel_store_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM intel_stores s WHERE s.id = d.intel_store_id);

  RAISE NOTICE '══ Swap verification ══';
  RAISE NOTICE 'intel_stores (new primary): total=%, active=%, inactive=%, designated=%',
    intel_total, intel_active, intel_inactive, intel_designated;
  RAISE NOTICE 'intel_stores_archived (legacy): total=%', archived_total;
  RAISE NOTICE 'dispensary_menus: with intel_store_id=%, null=%, orphan FKs=%',
    dm_with_store, dm_null, orphan_ct;

  IF orphan_ct > 0 THEN
    RAISE EXCEPTION 'Orphan FKs detected — dispensary_menus has % rows with intel_store_id not in new intel_stores', orphan_ct;
  END IF;
  IF intel_total <> 470 THEN
    RAISE EXCEPTION 'Unexpected intel_stores count after swap: got %, expected 470', intel_total;
  END IF;
  IF archived_total <> 560 THEN
    RAISE EXCEPTION 'Unexpected intel_stores_archived count: got %, expected 560', archived_total;
  END IF;
END $$;
