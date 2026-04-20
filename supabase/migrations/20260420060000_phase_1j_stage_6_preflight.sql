-- Phase 1j Stage 6 — pre-flight inspection only. SELECTs + RAISE NOTICE; no writes.
-- Verifies FK shape on dispensary_menus and menu_items before the table swap.

DO $$
DECLARE
  is_v2_exists     BOOLEAN;
  is_v1_exists     BOOLEAN;
  v2_total         INT;
  v2_active        INT;
  v2_designated    INT;
  v2_inactive      INT;
  v1_total         INT;
  v1_active        INT;
  dm_total         INT;
  dm_with_store    INT;
  dm_distinct_store INT;
  mi_total         INT;
  mi_with_store    INT;
  pv_total         INT;
  pv_v1_ref        INT;
  pv_v2_ref        INT;
  cron_total       INT;
  cron_active      INT;
  r RECORD;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='intel_stores_v2') INTO is_v2_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='intel_stores') INTO is_v1_exists;
  RAISE NOTICE 'intel_stores_v2 exists: % | intel_stores exists: %', is_v2_exists, is_v1_exists;

  IF is_v2_exists THEN
    SELECT COUNT(*) INTO v2_total FROM intel_stores_v2;
    SELECT COUNT(*) INTO v2_active FROM intel_stores_v2 WHERE is_active = TRUE;
    SELECT COUNT(*) INTO v2_designated FROM intel_stores_v2 WHERE designated_scraper IS NOT NULL;
    SELECT COUNT(*) INTO v2_inactive FROM intel_stores_v2 WHERE is_active = FALSE;
    RAISE NOTICE 'intel_stores_v2: total=%, is_active=true=%, designated=%, is_active=false=%',
      v2_total, v2_active, v2_designated, v2_inactive;
  END IF;

  IF is_v1_exists THEN
    SELECT COUNT(*) INTO v1_total FROM intel_stores;
    SELECT COUNT(*) INTO v1_active FROM intel_stores WHERE status = 'active';
    RAISE NOTICE 'intel_stores (v1): total=%, status=active=%', v1_total, v1_active;
  END IF;

  -- dispensary_menus
  SELECT COUNT(*) INTO dm_total FROM dispensary_menus;
  SELECT COUNT(*) INTO dm_with_store FROM dispensary_menus WHERE intel_store_id IS NOT NULL;
  SELECT COUNT(DISTINCT intel_store_id) INTO dm_distinct_store FROM dispensary_menus WHERE intel_store_id IS NOT NULL;
  RAISE NOTICE 'dispensary_menus: total=%, with intel_store_id=%, distinct stores=%',
    dm_total, dm_with_store, dm_distinct_store;

  -- menu_items
  BEGIN
    SELECT COUNT(*) INTO mi_total FROM menu_items;
    RAISE NOTICE 'menu_items: total=%', mi_total;
    -- Check if menu_items has an intel_store_id column
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='menu_items' AND column_name='intel_store_id') THEN
      SELECT COUNT(*) INTO mi_with_store FROM menu_items WHERE intel_store_id IS NOT NULL;
      RAISE NOTICE 'menu_items.intel_store_id: non-null rows=%', mi_with_store;
    ELSE
      RAISE NOTICE 'menu_items has no intel_store_id column (linked via dispensary_menus_id instead)';
    END IF;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'menu_items table does not exist';
  END;

  -- platform_verification split
  SELECT COUNT(*) INTO pv_total FROM platform_verification;
  SELECT COUNT(*) INTO pv_v1_ref FROM platform_verification WHERE intel_store_id IS NOT NULL;
  SELECT COUNT(*) INTO pv_v2_ref FROM platform_verification WHERE intel_store_v2_id IS NOT NULL;
  RAISE NOTICE 'platform_verification: total=%, v1-ref=%, v2-ref=%', pv_total, pv_v1_ref, pv_v2_ref;

  -- FK relationships on dispensary_menus.intel_store_id
  RAISE NOTICE '--- FK constraints referencing intel_stores (v1) ---';
  FOR r IN (
    SELECT
      tc.table_name AS src_table,
      kcu.column_name AS src_column,
      ccu.table_name AS ref_table,
      ccu.column_name AS ref_column,
      tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name IN ('intel_stores','intel_stores_v2')
    ORDER BY tc.table_name, kcu.column_name
  ) LOOP
    RAISE NOTICE '  % . % -> % . %  (%)', r.src_table, r.src_column, r.ref_table, r.ref_column, r.constraint_name;
  END LOOP;

  -- pg_cron inspection
  BEGIN
    SELECT COUNT(*) INTO cron_total FROM cron.job;
    SELECT COUNT(*) INTO cron_active FROM cron.job WHERE active = true;
    RAISE NOTICE 'pg_cron jobs: total=%, active=%', cron_total, cron_active;
    FOR r IN (SELECT jobname, schedule, command, active FROM cron.job ORDER BY jobname) LOOP
      RAISE NOTICE '  [%] % | schedule=% | cmd=%', CASE WHEN r.active THEN 'ON ' ELSE 'OFF' END, r.jobname, r.schedule, substring(r.command from 1 for 120);
    END LOOP;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'pg_cron schema not accessible';
  END;

  -- stage_5_store_mapping coverage
  DECLARE smm_total INT; smm_lcb INT; smm_addr INT; smm_new_v2 INT; smm_retired_v1 INT;
  BEGIN
    SELECT COUNT(*) INTO smm_total FROM stage_5_store_mapping;
    SELECT COUNT(*) INTO smm_lcb FROM stage_5_store_mapping WHERE match_method = 'lcb_license';
    SELECT COUNT(*) INTO smm_addr FROM stage_5_store_mapping WHERE match_method = 'address';
    SELECT COUNT(*) INTO smm_new_v2 FROM stage_5_store_mapping WHERE match_method = 'unmatched_new_v2';
    SELECT COUNT(*) INTO smm_retired_v1 FROM stage_5_store_mapping WHERE match_method = 'unmatched_retired_v1';
    RAISE NOTICE 'stage_5_store_mapping: total=%, lcb_license=%, address=%, new_v2=%, retired_v1=%',
      smm_total, smm_lcb, smm_addr, smm_new_v2, smm_retired_v1;
  END;
END $$;

-- End preflight. DO block above is read-only (only SELECTs), nothing to roll back.
