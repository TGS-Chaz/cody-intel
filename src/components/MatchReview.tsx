import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Check, X, Loader2, RefreshCw, Package, Store, ChevronDown, ChevronRight } from "lucide-react";

interface MatchRow {
  id: string;
  confidence: number;
  match_method: string;
  verified: boolean;
  user_product_id: string;
  menu_item_id: string;
  intel_store_id: string;
  product_name:   string;     // e.g. "Living Soil Indoor Flower (Black Label)"
  product_brand:  string | null;
  product_strain: string | null;  // comma-separated strain list on our side
  product_type:   string | null;
  product_unit:   string | null;
  menu_name:      string;
  menu_brand:     string | null;
  menu_price:     number | null;
  menu_category:  string | null;
  store_name:     string;
  store_city:     string | null;
}

const METHOD_COLOR: Record<string, string> = {
  strain_exact:   "text-emerald-400",
  strain_partial: "text-blue-400",
  cat_weight:     "text-purple-400",
  brand_category: "text-amber-400",
  brand_only:     "text-muted-foreground",
};

function methodLabel(m: string) {
  switch (m) {
    case "strain_exact":   return "Strain match";
    case "strain_partial": return "Strain partial";
    case "cat_weight":     return "Brand + cat + weight";
    case "brand_category": return "Brand + category";
    case "brand_only":     return "Brand only";
    default:               return m;
  }
}

export function MatchReview({ orgId }: { orgId: string }) {
  const [rows,    setRows]    = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [stats,   setStats]   = useState<{ total: number; verified: number } | null>(null);
  const [filter,  setFilter]  = useState<"pending" | "all">("pending");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    // Pull everything needed for strain-first display
    const { data: products } = await supabase
      .from("products")
      .select("id, name, farm, strain, type, unit")
      .eq("org_id", orgId);
    const productMap = new Map((products ?? []).map(p => [p.id, p]));
    if (productMap.size === 0) { setRows([]); setLoading(false); return; }

    let q = supabase
      .from("product_matches")
      .select("id, confidence, match_method, verified, user_product_id, menu_item_id, intel_store_id")
      .in("user_product_id", Array.from(productMap.keys()))
      .order("confidence", { ascending: false })
      .limit(500);
    if (filter === "pending") q = q.eq("verified", false);
    const { data: matches } = await q;

    if (!matches?.length) { setRows([]); setStats({ total: 0, verified: 0 }); setLoading(false); return; }

    const menuIds  = Array.from(new Set(matches.map(m => m.menu_item_id)));
    const storeIds = Array.from(new Set(matches.map(m => m.intel_store_id)));
    const [{ data: items }, { data: stores }, { count: totalCount }, { count: verifiedCount }] = await Promise.all([
      supabase.from("menu_items").select("id, raw_name, raw_brand, raw_price, raw_category").in("id", menuIds),
      supabase.from("intel_stores").select("id, name, city").in("id", storeIds),
      supabase.from("product_matches").select("id", { count: "exact", head: true }).in("user_product_id", Array.from(productMap.keys())),
      supabase.from("product_matches").select("id", { count: "exact", head: true }).in("user_product_id", Array.from(productMap.keys())).eq("verified", true),
    ]);

    const itemMap  = new Map((items  ?? []).map(i => [i.id, i]));
    const storeMap = new Map((stores ?? []).map(s => [s.id, s]));

    const out: MatchRow[] = matches.map(m => {
      const p  = productMap.get(m.user_product_id);
      const it = itemMap.get(m.menu_item_id);
      const st = storeMap.get(m.intel_store_id);
      return {
        id:              m.id,
        confidence:      Number(m.confidence),
        match_method:    m.match_method,
        verified:        m.verified,
        user_product_id: m.user_product_id,
        menu_item_id:    m.menu_item_id,
        intel_store_id:  m.intel_store_id,
        product_name:    p?.name   ?? "(unknown)",
        product_brand:   p?.farm   ?? null,
        product_strain:  p?.strain ?? null,
        product_type:    p?.type   ?? null,
        product_unit:    p?.unit   ?? null,
        menu_name:       it?.raw_name     ?? "(unknown)",
        menu_brand:      it?.raw_brand    ?? null,
        menu_price:      it?.raw_price != null ? Number(it.raw_price) : null,
        menu_category:   it?.raw_category ?? null,
        store_name:      st?.name ?? "(unknown)",
        store_city:      st?.city ?? null,
      };
    });

    setRows(out);
    setStats({ total: totalCount ?? 0, verified: verifiedCount ?? 0 });
    setLoading(false);
  }, [orgId, filter]);

  useEffect(() => { load(); }, [load]);

  async function runMatching() {
    setRunning(true);
    await supabase.rpc("match_products", { p_org_id: orgId });
    await load();
    setRunning(false);
  }

  async function confirm(id: string, yes: boolean) {
    if (yes) {
      await supabase.from("product_matches").update({ verified: true, confidence: 1.0 }).eq("id", id);
    } else {
      await supabase.from("product_matches").delete().eq("id", id);
    }
    setRows(prev => prev.filter(r => r.id !== id));
  }

  // Group by store — most pressing insight is "which stores carry me, and
  // which specific SKUs did we match?"
  const grouped = useMemo(() => {
    const map = new Map<string, { storeName: string; storeCity: string | null; rows: MatchRow[] }>();
    for (const r of rows) {
      const key = r.intel_store_id;
      let g = map.get(key);
      if (!g) { g = { storeName: r.store_name, storeCity: r.store_city, rows: [] }; map.set(key, g); }
      g.rows.push(r);
    }
    // Sort stores by total match count desc, then by confidence
    return Array.from(map.entries())
      .map(([id, v]) => ({
        id, storeName: v.storeName, storeCity: v.storeCity,
        rows: [...v.rows].sort((a, b) => b.confidence - a.confidence),
      }))
      .sort((a, b) => b.rows.length - a.rows.length);
  }, [rows]);

  function toggleStore(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Highlight the matched strain inside the menu_name so the reviewer can see
  // at a glance what the matcher actually hit on.
  function highlightStrain(menuName: string, strainList: string | null) {
    if (!strainList) return menuName;
    const strains = strainList.split(/[,;]/).map(s => s.trim()).filter(Boolean);
    for (const s of strains) {
      const i = menuName.toLowerCase().indexOf(s.toLowerCase());
      if (i >= 0) {
        return (
          <>
            {menuName.slice(0, i)}
            <mark className="bg-primary/20 text-primary px-0.5 rounded">
              {menuName.slice(i, i + s.length)}
            </mark>
            {menuName.slice(i + s.length)}
          </>
        );
      }
    }
    return menuName;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Match Review</h2>
          <p className="text-[11px] text-muted-foreground">
            Brand-first matching — stores that actually carry your brands. Confirm the strain-level pairings.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden text-[11px]">
            <button
              onClick={() => setFilter("pending")}
              className={`px-3 py-1.5 ${filter === "pending" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary/50"}`}
            >
              Pending
            </button>
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1.5 ${filter === "all" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary/50"}`}
            >
              All
            </button>
          </div>
          <button
            onClick={runMatching}
            disabled={running}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Run Matcher
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Stores Matched</p>
            <p className="text-xl font-bold tabular-nums">{grouped.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Total Matches</p>
            <p className="text-xl font-bold tabular-nums">{stats.total}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Verified</p>
            <p className="text-xl font-bold tabular-nums text-emerald-400">{stats.verified}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Pending</p>
            <p className="text-xl font-bold tabular-nums text-amber-400">{stats.total - stats.verified}</p>
          </div>
        </div>
      )}

      {/* Grouped list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Check className="w-8 h-8 text-emerald-500/60 mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">
            {filter === "pending" ? "No pending matches." : "No matches yet."}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Click "Run Matcher" to find menu items that look like your products.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(g => {
            const isCollapsed = collapsed.has(g.id);
            const topConf = g.rows[0]?.confidence ?? 0;
            return (
              <div key={g.id} className="rounded-xl border border-border bg-card overflow-hidden">
                {/* Store header */}
                <button
                  onClick={() => toggleStore(g.id)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {isCollapsed
                      ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                    <Store className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <div className="min-w-0 text-left">
                      <p className="text-sm font-semibold text-foreground truncate">{g.storeName}</p>
                      {g.storeCity && <p className="text-[10px] text-muted-foreground">{g.storeCity}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-muted-foreground">
                      {g.rows.length} match{g.rows.length !== 1 ? "es" : ""}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      topConf >= 0.9 ? "bg-emerald-500/10 text-emerald-400"
                      : topConf >= 0.7 ? "bg-blue-500/10 text-blue-400"
                      : "bg-secondary/60 text-muted-foreground"
                    }`}>
                      best {Math.round(topConf * 100)}%
                    </span>
                  </div>
                </button>

                {/* Match rows */}
                {!isCollapsed && (
                  <div className="border-t border-border divide-y divide-border/40">
                    {g.rows.map(r => (
                      <div key={r.id} className="p-4">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-semibold uppercase tracking-wider ${METHOD_COLOR[r.match_method] ?? ""}`}>
                              {methodLabel(r.match_method)}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary/60 text-muted-foreground">
                              {Math.round(r.confidence * 100)}%
                            </span>
                            {r.verified && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">verified</span>
                            )}
                          </div>
                          {!r.verified && (
                            <div className="flex gap-1">
                              <button
                                onClick={() => confirm(r.id, true)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20"
                              >
                                <Check className="w-3 h-3" /> Yes
                              </button>
                              <button
                                onClick={() => confirm(r.id, false)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20"
                              >
                                <X className="w-3 h-3" /> No
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                          {/* Your product side */}
                          <div className="flex items-start gap-2 min-w-0">
                            <Package className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Your product</p>
                              <p className="font-semibold text-foreground">{r.product_brand ?? "?"}</p>
                              <p className="text-foreground truncate">{r.product_name}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
                                {r.product_type && <span className="capitalize">{r.product_type.replace("_", "-")}</span>}
                                {r.product_unit && <span>· {r.product_unit}</span>}
                              </p>
                              {r.product_strain && (
                                <p className="text-[10px] text-muted-foreground mt-1 truncate" title={r.product_strain}>
                                  Strains: <span className="text-foreground">{r.product_strain}</span>
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Matched menu_item side */}
                          <div className="flex items-start gap-2 min-w-0">
                            <Store className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Found on menu</p>
                              <p className="font-semibold text-foreground">{r.menu_brand ?? "?"}</p>
                              <p className="text-foreground truncate">
                                {highlightStrain(r.menu_name, r.product_strain)}
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
                                {r.menu_category && <span>{r.menu_category}</span>}
                                {r.menu_price != null && <span>· ${r.menu_price.toFixed(2)}</span>}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
