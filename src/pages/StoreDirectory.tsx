import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import type { IntelStore } from "@/lib/types";
import { Search, ChevronRight, Wifi, WifiOff } from "lucide-react";

const PLATFORMS = ["dutchie-api", "leafly", "weedmaps", "posabit-api", "jane"];
const PLATFORM_LABELS: Record<string, string> = {
  "dutchie-api": "Dutchie",
  leafly: "Leafly",
  weedmaps: "Weedmaps",
  "posabit-api": "POSaBit",
  jane: "Jane",
};

export function StoreDirectory() {
  const navigate = useNavigate();
  const [stores, setStores] = useState<IntelStore[]>([]);
  const [menuMap, setMenuMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [countyFilter, setCountyFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");

  useEffect(() => {
    async function load() {
      const [storesRes, menusRes] = await Promise.all([
        supabase.from("intel_stores").select("*").eq("status", "active").order("name"),
        supabase.from("dispensary_menus").select("intel_store_id, source").not("intel_store_id", "is", null),
      ]);
      const map: Record<string, string[]> = {};
      for (const m of menusRes.data ?? []) {
        if (!m.intel_store_id) continue;
        if (!map[m.intel_store_id]) map[m.intel_store_id] = [];
        if (!map[m.intel_store_id].includes(m.source)) map[m.intel_store_id].push(m.source);
      }
      setStores(storesRes.data ?? []);
      setMenuMap(map);
      setLoading(false);
    }
    load();
  }, []);

  const counties = [...new Set(stores.map((s) => s.county).filter(Boolean) as string[])].sort();

  const filtered = stores.filter((s) => {
    if (query) {
      const q = query.toLowerCase();
      if (!s.name.toLowerCase().includes(q) && !(s.city ?? "").toLowerCase().includes(q)) return false;
    }
    if (countyFilter && s.county !== countyFilter) return false;
    if (platformFilter && !(menuMap[s.id] ?? []).includes(platformFilter)) return false;
    return true;
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground">Store Directory</h1>
          <div className="header-underline mt-1" />
          <p className="text-sm text-muted-foreground mt-1">
            {loading ? "Loading…" : `${filtered.length} of ${stores.length} stores`}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search stores or cities…"
            className="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
          />
        </div>
        <select
          value={countyFilter}
          onChange={(e) => setCountyFilter(e.target.value)}
          className="px-2.5 py-1.5 rounded-md border border-border bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
        >
          <option value="">All Counties</option>
          {counties.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
          className="px-2.5 py-1.5 rounded-md border border-border bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
        >
          <option value="">All Platforms</option>
          {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
        </select>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden shadow-premium">
        {loading ? (
          <div className="space-y-px">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-10 skeleton-shimmer" />
            ))}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--glass-border)" }} className="bg-sidebar">
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Store</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">City</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest hidden lg:table-cell">County</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Platforms</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filtered.map((store) => {
                const platforms = menuMap[store.id] ?? [];
                return (
                  <tr
                    key={store.id}
                    className="hover:bg-accent/40 cursor-pointer transition-colors duration-100"
                    onClick={() => navigate(`/stores/${store.id}`)}
                  >
                    <td className="px-4 py-2.5 font-medium text-foreground max-w-[200px] truncate">{store.name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground capitalize">{(store.city ?? "").toLowerCase()}</td>
                    <td className="px-4 py-2.5 text-muted-foreground capitalize hidden lg:table-cell">{(store.county ?? "").toLowerCase()}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1 flex-wrap">
                        {platforms.length === 0 ? (
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                            <WifiOff className="w-3 h-3" /> None
                          </span>
                        ) : (
                          platforms.map((p) => (
                            <span
                              key={p}
                              className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-sm font-medium"
                              style={{ background: "hsl(168 100% 42% / 0.1)", color: "hsl(168 100% 36%)" }}
                            >
                              <Wifi className="w-2.5 h-2.5" /> {PLATFORM_LABELS[p] ?? p}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      <ChevronRight className="w-4 h-4" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
