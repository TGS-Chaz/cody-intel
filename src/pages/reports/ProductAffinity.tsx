import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import { isExcludedBrand } from "@/lib/analytics-filters";
import { Sparkles, ArrowLeftRight } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OwnBrand  { id: string; brand_name: string }
interface AffinityRow {
  otherBrand:    string;
  coOccurStores: number;    // stores carrying both your brand and this other brand
  affinityPct:   number;    // % of your-stores that also carry this brand
}
interface ReverseRow {
  store_id:   string;
  store_name: string;
  city:       string | null;
  hasOwn:     boolean;
  targetPct:  number;   // how many of my target brands they carry
}

interface SnapshotProduct { b?: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadLatestSnapshots(): Promise<Record<string, Set<string>>> {
  // Returns { intel_store_id → Set<brand_lowercase> } using latest snapshot per store
  const { data } = await supabase
    .from("menu_snapshots")
    .select("intel_store_id, snapshot_date, product_data")
    .order("snapshot_date", { ascending: false })
    .limit(1000);

  const seen = new Set<string>();
  const out: Record<string, Set<string>> = {};
  for (const s of data ?? []) {
    if (seen.has(s.intel_store_id)) continue;
    seen.add(s.intel_store_id);
    const brandSet = new Set<string>();
    for (const p of (s.product_data as SnapshotProduct[]) ?? []) {
      if (p.b && !isExcludedBrand(p.b)) brandSet.add(p.b.toLowerCase());
    }
    out[s.intel_store_id] = brandSet;
  }
  return out;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ProductAffinity() {
  const { orgId } = useOrg();
  const [ownBrands, setOwnBrands] = useState<OwnBrand[]>([]);
  const [selected,  setSelected]  = useState<string>("");
  const [loading,   setLoading]   = useState(true);
  const [snapshots, setSnapshots] = useState<Record<string, Set<string>>>({});
  const [stores,    setStores]    = useState<Record<string, { name: string; city: string | null }>>({});

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      setLoading(true);
      const [{ data: ub }, snaps, { data: stx }] = await Promise.all([
        supabase.from("user_brands").select("id, brand_name").eq("org_id", orgId).eq("is_own_brand", true),
        loadLatestSnapshots(),
        supabase.from("intel_stores").select("id, name, city"),
      ]);
      setOwnBrands((ub ?? []) as OwnBrand[]);
      if (ub?.[0]) setSelected(ub[0].brand_name);
      setSnapshots(snaps);
      setStores(Object.fromEntries((stx ?? []).map(s => [s.id, { name: s.name, city: s.city }])));
      setLoading(false);
    })();
  }, [orgId]);

  // Forward affinity: brands that co-occur with selected
  const affinity = useMemo<AffinityRow[]>(() => {
    if (!selected) return [];
    const target = selected.toLowerCase();
    const myStores = Object.entries(snapshots).filter(([, brands]) => brands.has(target));
    const myStoreCount = myStores.length;
    if (!myStoreCount) return [];

    const counts = new Map<string, number>();
    for (const [, brands] of myStores) {
      for (const b of brands) {
        if (b === target) continue;
        counts.set(b, (counts.get(b) ?? 0) + 1);
      }
    }

    return Array.from(counts.entries())
      .map(([otherBrand, coOccurStores]) => ({
        otherBrand,
        coOccurStores,
        affinityPct: (coOccurStores / myStoreCount) * 100,
      }))
      .sort((a, b) => b.coOccurStores - a.coOccurStores)
      .slice(0, 20);
  }, [selected, snapshots]);

  // Reverse affinity: stores carrying top-3 affinity brands but NOT my brand
  const reverseLeads = useMemo<ReverseRow[]>(() => {
    if (!selected || !affinity.length) return [];
    const target = selected.toLowerCase();
    const targetBrands = new Set(affinity.slice(0, 5).map(a => a.otherBrand));
    const rows: ReverseRow[] = [];
    for (const [storeId, brands] of Object.entries(snapshots)) {
      if (brands.has(target)) continue; // already carry us, skip
      let hits = 0;
      for (const b of targetBrands) if (brands.has(b)) hits++;
      if (hits === 0) continue;
      const st = stores[storeId];
      if (!st) continue;
      rows.push({
        store_id:   storeId,
        store_name: st.name,
        city:       st.city,
        hasOwn:     false,
        targetPct:  (hits / targetBrands.size) * 100,
      });
    }
    return rows.sort((a, b) => b.targetPct - a.targetPct).slice(0, 20);
  }, [selected, affinity, snapshots, stores]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!ownBrands.length) {
    return (
      <div className="text-center py-10 text-sm text-muted-foreground">
        No own-brands found. Add brands in Settings to see product affinity.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Brand selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <Sparkles className="w-4 h-4 text-primary" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Analyzing co-stocked brands with
        </span>
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          className="px-2.5 py-1.5 rounded-md border border-border bg-card text-sm"
        >
          {ownBrands.map(b => (
            <option key={b.id} value={b.brand_name}>{b.brand_name}</option>
          ))}
        </select>
      </div>

      {/* Forward affinity */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Top Co-Stocked Brands
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Stores carrying <b className="text-foreground">{selected}</b> also carry these brands
          </p>
        </div>
        {affinity.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No stores with {selected} in recent snapshots.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sidebar/60" style={{ borderBottom: "1px solid var(--glass-border)" }}>
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest w-8">#</th>
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Brand</th>
                <th className="text-right px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Co-Occur Stores</th>
                <th className="text-right px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Affinity %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {affinity.map((a, i) => (
                <tr key={a.otherBrand} className="hover:bg-accent/30">
                  <td className="px-4 py-2 text-xs font-mono-data text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-2 text-xs font-medium text-foreground capitalize">{a.otherBrand}</td>
                  <td className="px-4 py-2 text-xs font-mono-data text-right text-muted-foreground">{a.coOccurStores}</td>
                  <td className="px-4 py-2 text-xs font-mono-data text-right font-semibold text-primary">
                    {a.affinityPct.toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Reverse affinity — warm leads */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400" />
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              Warm-Lead Stores
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Carry similar brands but <b>not</b> {selected} yet
            </p>
          </div>
        </div>
        {reverseLeads.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No warm-lead stores identified.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sidebar/60" style={{ borderBottom: "1px solid var(--glass-border)" }}>
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Store</th>
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">City</th>
                <th className="text-right px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Affinity Match</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {reverseLeads.map(r => (
                <tr key={r.store_id} className="hover:bg-accent/30">
                  <td className="px-4 py-2 text-xs font-medium text-foreground">{r.store_name}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{r.city ?? "—"}</td>
                  <td className="px-4 py-2 text-xs font-mono-data text-right font-semibold text-amber-400">
                    {r.targetPct.toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
