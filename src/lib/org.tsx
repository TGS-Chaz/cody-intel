import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  plan: string;            // legacy single-tier field — kept for backwards compat
  intel_plan: string | null; // preferred — Intel tier (scout/analyst/professional/enterprise)
  crm_plan:   string | null; // the CRM app reads this instead
}

export interface OrgMembership {
  org_id: string;
  role: string;
  organization: Organization;
}

interface OrgContextValue {
  org: Organization | null;
  orgId: string | null;
  memberships: OrgMembership[];
  role: string | null;
  loading: boolean;
  switchOrg: (orgId: string) => void;
  refresh: () => void;
}

const OrgContext = createContext<OrgContextValue | null>(null);

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [memberships, setMemberships] = useState<OrgMembership[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user) { setOrg(null); setMemberships([]); setRole(null); setLoading(false); return; }

    async function load() {
      setLoading(true);

      const { data: members, error: memErr } = await supabase
        .from("org_members")
        .select("org_id, role")
        .eq("user_id", user!.id);

      if (memErr || !members || members.length === 0) { setLoading(false); return; }

      const orgIds = members.map((m: { org_id: string }) => m.org_id);
      const { data: orgs, error: orgErr } = await supabase
        .from("organizations")
        .select("id, name, slug, logo_url, plan, intel_plan, crm_plan")
        .in("id", orgIds);

      if (orgErr) { setLoading(false); return; }

      const orgMap = new Map((orgs ?? []).map((o: Organization) => [o.id, o]));
      const mems = (members ?? [])
        .filter((m: { org_id: string }) => orgMap.has(m.org_id))
        .map((m: { org_id: string; role: string }) => ({
          org_id: m.org_id,
          role: m.role,
          organization: orgMap.get(m.org_id) as Organization,
        }));

      setMemberships(mems);

      if (mems.length > 0) {
        const savedOrgId = localStorage.getItem("cody-active-org");
        const active = mems.find((m) => m.org_id === savedOrgId) ?? mems[0];
        setOrg(active.organization);
        setRole(active.role);
        localStorage.setItem("cody-active-org", active.org_id);
      } else {
        setOrg(null);
        setRole(null);
      }
      setLoading(false);
    }

    load();
  }, [user?.id, tick]);

  function switchOrg(orgId: string) {
    const mem = memberships.find((m) => m.org_id === orgId);
    if (mem) {
      setOrg(mem.organization);
      setRole(mem.role);
      localStorage.setItem("cody-active-org", orgId);
      window.location.reload();
    }
  }

  return (
    <OrgContext.Provider value={{
      org,
      orgId: org?.id ?? null,
      memberships,
      role,
      loading,
      switchOrg,
      refresh: () => setTick((t) => t + 1),
    }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used inside OrgProvider");
  return ctx;
}
