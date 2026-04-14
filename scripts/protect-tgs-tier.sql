-- ─────────────────────────────────────────────────────────────────────────────
-- Protect The Green Solution's top-tier status on every plan column.
-- ─────────────────────────────────────────────────────────────────────────────
-- Any migration, seed script, or admin tool that writes organizations.plan /
-- crm_plan / intel_plan for id='c00044d9-...' gets its write snapped back to
-- 'enterprise'. Works against every future code path regardless of repo,
-- language, or tooling.

CREATE OR REPLACE FUNCTION protect_tgs_tier()
RETURNS trigger AS $$
BEGIN
  IF NEW.id = 'c00044d9-3fb6-429a-b212-5ad0e2048205'::uuid THEN
    -- Force the top tier regardless of what the UPDATE tried to set
    NEW.plan       := 'enterprise';
    NEW.crm_plan   := 'enterprise';
    NEW.intel_plan := 'enterprise';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_tgs_tier ON organizations;
CREATE TRIGGER trg_protect_tgs_tier
  BEFORE INSERT OR UPDATE OF plan, crm_plan, intel_plan ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION protect_tgs_tier();

-- Confirm it's active
SELECT id, name, plan, crm_plan, intel_plan
FROM   organizations
WHERE  id = 'c00044d9-3fb6-429a-b212-5ad0e2048205';
