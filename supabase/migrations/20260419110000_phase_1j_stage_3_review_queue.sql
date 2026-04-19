-- Phase 1j Stage 3 — Build the review queue table and seed it with
-- the 80-ish items Chaz needs to hand-review from audit/39.
--
-- Populated categories:
--   cat2_sample     — 20 random Cat 2 rows (populated-but-unverified)
--   cat3_ambiguous  — all Cat 3 rows (2 — both at 5655 GUIDE MERIDIAN)
--   cat4_no_match   — all Cat 4 rows (47 — LCB row with no website candidate)
--   cat5_tribal     — all Cat 5 rows (7 tribal)
--
-- For cat3 and cat4, candidate_websites is populated with
-- intel_stores rows in the same city whose address similarity is ≥ 0.4
-- (pg_trgm) or whose name contains overlapping tokens — so Chaz has a
-- dropdown to pick from without leaving the UI.

CREATE TABLE IF NOT EXISTS stage_3_review_queue (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intel_store_v2_id   UUID NOT NULL REFERENCES intel_stores_v2(id),
  category            TEXT NOT NULL CHECK (category IN ('cat2_sample','cat3_ambiguous','cat4_no_match','cat5_tribal')),
  priority            INT  DEFAULT 0,
  candidate_websites  JSONB,
  decision            TEXT CHECK (decision IN ('confirmed_as_is','changed_website','no_website','not_operating','flagged_research')),
  decision_website    TEXT,
  decision_notes      TEXT,
  decided_at          TIMESTAMPTZ,
  decided_by          TEXT,
  applied_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stage_3_review_queue_decision ON stage_3_review_queue(decision) WHERE decision IS NULL;
CREATE INDEX IF NOT EXISTS idx_stage_3_review_queue_category ON stage_3_review_queue(category);
CREATE UNIQUE INDEX IF NOT EXISTS ux_stage_3_review_queue_v2 ON stage_3_review_queue(intel_store_v2_id);

-- RLS — allow authenticated users to read/update so the admin UI can use anon+JWT.
ALTER TABLE stage_3_review_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stage_3_review_queue_select ON stage_3_review_queue;
CREATE POLICY stage_3_review_queue_select ON stage_3_review_queue
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS stage_3_review_queue_update ON stage_3_review_queue;
CREATE POLICY stage_3_review_queue_update ON stage_3_review_queue
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, UPDATE ON stage_3_review_queue TO authenticated;

-- Need read-access to intel_stores_v2 from the UI as well.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'intel_stores_v2' AND policyname = 'intel_stores_v2_read_authenticated') THEN
    EXECUTE 'ALTER TABLE intel_stores_v2 ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY intel_stores_v2_read_authenticated ON intel_stores_v2 FOR SELECT TO authenticated USING (true)';
  END IF;
END $$;
GRANT SELECT, UPDATE ON intel_stores_v2 TO authenticated;

-- ── Seed: Cat 2 sample (20 random rows) ─────────────────────────────────
INSERT INTO stage_3_review_queue (intel_store_v2_id, category, priority, candidate_websites)
SELECT v.id, 'cat2_sample', 10, NULL
  FROM intel_stores_v2 v
 WHERE v.source_of_truth IN ('lcb_retail','lcb_social_equity')
   AND v.website IS NOT NULL
   AND v.website_verified = false
   AND (v.v2_notes IS NULL OR v.v2_notes NOT LIKE '%address ambiguous%')
 ORDER BY random()
 LIMIT 20
ON CONFLICT (intel_store_v2_id) DO NOTHING;

-- ── Seed: Cat 3 ambiguous ───────────────────────────────────────────────
INSERT INTO stage_3_review_queue (intel_store_v2_id, category, priority, candidate_websites)
SELECT v.id, 'cat3_ambiguous', 100,
       (
         SELECT jsonb_agg(jsonb_build_object(
                  'url',         i.website,
                  'source',      'intel_stores row',
                  'confidence',  'ambiguous',
                  'reason',      'both intel_stores rows at this address matched; Chaz picks',
                  'intel_store_id', i.id,
                  'name',        i.name,
                  'address',     i.address
                ))
           FROM intel_stores i
          WHERE upper(i.city) = upper(v.city)
            AND (_p1j_norm_addr(i.address) = _p1j_norm_addr(v.address)
              OR similarity(_p1j_norm_addr(i.address), _p1j_norm_addr(v.address)) >= 0.5)
       )
  FROM intel_stores_v2 v
 WHERE v.v2_notes LIKE '%address ambiguous%'
ON CONFLICT (intel_store_v2_id) DO NOTHING;

-- ── Seed: Cat 4 no-match ────────────────────────────────────────────────
-- For each Cat 4 row, find up to 5 intel_stores candidates by city + name/address similarity.
-- Candidates are ranked by a composite score combining name similarity and address similarity.
INSERT INTO stage_3_review_queue (intel_store_v2_id, category, priority, candidate_websites)
SELECT v.id,
       'cat4_no_match',
       50,
       (
         SELECT jsonb_agg(
                  jsonb_build_object(
                    'url',            i.website,
                    'source',         'intel_stores-city-fuzzy',
                    'confidence',     round(score::numeric, 2),
                    'reason',         'same-city, name_sim=' || round(name_sim::numeric, 2) || ' addr_sim=' || round(addr_sim::numeric, 2),
                    'intel_store_id', i.id,
                    'name',           i.name,
                    'address',        i.address
                  )
                  ORDER BY score DESC
                )
           FROM (
             SELECT i.*,
                    similarity(upper(coalesce(i.name,'')||' '||coalesce(i.trade_name,'')), upper(v.name)) AS name_sim,
                    similarity(_p1j_norm_addr(i.address), _p1j_norm_addr(v.address)) AS addr_sim,
                    0.6 * similarity(upper(coalesce(i.name,'')||' '||coalesce(i.trade_name,'')), upper(v.name))
                      + 0.4 * similarity(_p1j_norm_addr(i.address), _p1j_norm_addr(v.address)) AS score
               FROM intel_stores i
              WHERE upper(i.city) = upper(v.city)
                AND i.website IS NOT NULL
                AND btrim(i.website) <> ''
             ORDER BY score DESC
             LIMIT 5
           ) i
          WHERE i.score >= 0.2
       )
  FROM intel_stores_v2 v
 WHERE v.source_of_truth IN ('lcb_retail','lcb_social_equity')
   AND v.website IS NULL
   AND (v.v2_notes IS NULL OR v.v2_notes NOT LIKE '%address ambiguous%')
ON CONFLICT (intel_store_v2_id) DO NOTHING;

-- ── Seed: Cat 5 tribal ──────────────────────────────────────────────────
INSERT INTO stage_3_review_queue (intel_store_v2_id, category, priority, candidate_websites)
SELECT v.id, 'cat5_tribal', 30, NULL
  FROM intel_stores_v2 v
 WHERE v.source_of_truth = 'tribal_manual'
ON CONFLICT (intel_store_v2_id) DO NOTHING;

-- ── Validation ──────────────────────────────────────────────────────────
DO $$
DECLARE total INT; c2 INT; c3 INT; c4 INT; c5 INT;
BEGIN
  SELECT COUNT(*) INTO total FROM stage_3_review_queue;
  SELECT COUNT(*) INTO c2    FROM stage_3_review_queue WHERE category = 'cat2_sample';
  SELECT COUNT(*) INTO c3    FROM stage_3_review_queue WHERE category = 'cat3_ambiguous';
  SELECT COUNT(*) INTO c4    FROM stage_3_review_queue WHERE category = 'cat4_no_match';
  SELECT COUNT(*) INTO c5    FROM stage_3_review_queue WHERE category = 'cat5_tribal';
  RAISE NOTICE 'stage_3_review_queue seeded: total=%, cat2=%, cat3=%, cat4=%, cat5=%', total, c2, c3, c4, c5;
  IF c2 <> 20 OR c3 <> 2 OR c4 <> 47 OR c5 <> 7 THEN
    RAISE EXCEPTION 'Unexpected seed counts: cat2=% cat3=% cat4=% cat5=%', c2, c3, c4, c5;
  END IF;
END $$;
