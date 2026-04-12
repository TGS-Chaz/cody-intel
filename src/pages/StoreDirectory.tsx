import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import type { IntelStore } from "@/lib/types";
import { Search, ChevronRight, WifiOff, ArrowUpDown } from "lucide-react";

const PLATFORMS = ["dutchie-api", "leafly", "weedmaps", "posabit-api", "jane"];
const PLATFORM_LABELS: Record<string, string> = {
  "dutchie-api": "Dutchie",
  leafly: "Leafly",
  weedmaps: "Weedmaps",
  "posabit-api": "POSaBit",
  jane: "Jane",
};

// Badges: solid = has menu data, dashed outline = detected via slug only
const PLATFORM_BADGES = [
  { letter: "D", color: "#00D4AA", source: "dutchie-api",  slugField: "dutchie_slug"      as keyof IntelStore },
  { letter: "L", color: "#3BB143", source: "leafly",        slugField: "leafly_slug"        as keyof IntelStore },
  { letter: "P", color: "#5C6BC0", source: "posabit-api",   slugField: "posabit_feed_key"   as keyof IntelStore },
  { letter: "W", color: "#F7931A", source: "weedmaps",      slugField: "weedmaps_slug"      as keyof IntelStore },
];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active:  { label: "Active",  cls: "text-emerald-500 bg-emerald-500/10" },
  closed:  { label: "Closed",  cls: "text-red-400 bg-red-400/10" },
  unknown: { label: "Unknown", cls: "text-amber-400 bg-amber-400/10" },
};

type SortKey = "name" | "city" | "products";

function SortBtn({ label, k, sortKey, sortAsc, onToggle }: {
  label: string; k: SortKey; sortKey: SortKey; sortAsc: boolean;
  onToggle: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <button
      onClick={() => onToggle(k)}
      className="flex items-center gap-0.5 hover:text-foreground transition-colors"
    >
      {label}
      {active
        ? <span className="ml-0.5 opacity-60">{sortAsc ? "↑" : "↓"}</span>
        : <ArrowUpDown className="w-2.5 h-2.5 ml-0.5 opacity-30" />}
    </button>
  );
}

const selectCls =
  "px-2.5 py-1.5 rounded-md border border-border bg-card text-sm text-foreground " +
  "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors";

export function StoreDirectory() {
  const navigate = useNavigate();
  const [stores, setStores]     = useState<IntelStore[]>([]);
  const [menuMap, setMenuMap]   = useState<Record<string, string[]>>({});
  const [loading, setLoading]   = useState(true);
  const [query, setQuery]       = useState("");
  const [cityFilter, setCityFilter]       = useState("");
  const [countyFilter, setCountyFilter]   = useState("");
  const [statusFilter, setStatusFilter]   = useState("active");
  const [menuFilter, setMenuFilter]       = useState<"" | "has" | "none">("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [sortKey, setSortKey]   = useState<SortKey>("name");
  const [sortAsc, setSortAsc]   = useState(true);

  useEffect(() => {
    async function load() {
      const [storesRes, menusRes] = await Promise.all([
        supabase.from("intel_stores").select("*").order("name"),
        supabase
          .from("dispensary_menus")
          .select("intel_store_id, source")
          .not("intel_store_id", "is", null),
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

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortAsc((a) => !a);
    else { setSortKey(k); setSortAsc(true); }
  }

  const cities   = [...new Set(stores.map((s) => s.city).filter(Boolean)   as string[])].sort();
  const counties = [...new Set(stores.map((s) => s.county).filter(Boolean) as string[])].sort();

  const filtered = stores
    .filter((s) => {
      if (query) {
        const q = query.toLowerCase();
        if (!`${s.name} ${s.city ?? ""} ${s.address ?? ""}`.toLowerCase().includes(q)) return false;
      }
      if (cityFilter     && s.city   !== cityFilter)   return false;
      if (countyFilter   && s.county !== countyFilter) return false;
      if (statusFilter   && s.status !== statusFilter) return false;
      if (platformFilter && !(menuMap[s.id] ?? []).includes(platformFilter)) return false;
      if (menuFilter === "has"  && (menuMap[s.id] ?? []).length === 0) return false;
      if (menuFilter === "none" && (menuMap[s.id] ?? []).length  >  0) return false;
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name")     cmp = a.name.localeCompare(b.name);
      if (sortKey === "city")     cmp = (a.city ?? "").localeCompare(b.city ?? "");
      if (sortKey === "products") cmp = (b.total_products ?? 0) - (a.total_products ?? 0);
      return sortAsc ? cmp : -cmp;
    });

  const thCls =
    "text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest";

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4 animate-fade-up">
      <div>
        <h1 className="text-foreground">Store Directory</h1>
        <div className="header-underline mt-1" />
        <p className="text-sm text-muted-foreground mt-1">
          {loading
            ? "Loading…"
            : `${filtered.length} of ${stores.length} stores · click a row to view & edit`}
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, city, address…"
            className="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
          />
        </div>
        <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} className={selectCls}>
          <option value="">All Cities</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c.charAt(0).toUpperCase() + c.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <select value={countyFilter} onChange={(e) => setCountyFilter(e.target.value)} className={selectCls}>
          <option value="">All Counties</option>
          {counties.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="closed">Closed</option>
          <option value="unknown">Unknown</option>
        </select>
        <select
          value={menuFilter}
          onChange={(e) => setMenuFilter(e.target.value as "" | "has" | "none")}
          className={selectCls}
        >
          <option value="">All Data</option>
          <option value="has">Has Menu Data</option>
          <option value="none">No Menu Data</option>
        </select>
        <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)} className={selectCls}>
          <option value="">All Platforms</option>
          {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
        </select>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden shadow-premium">
        {loading ? (
          <div className="space-y-px">
            {[...Array(10)].map((_, i) => <div key={i} className="h-10 skeleton-shimmer" />)}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--glass-border)" }} className="bg-sidebar">
                <th className={thCls}>
                  <SortBtn label="Store" k="name" sortKey={sortKey} sortAsc={sortAsc} onToggle={toggleSort} />
                </th>
                <th className={thCls}>
                  <SortBtn label="City" k="city" sortKey={sortKey} sortAsc={sortAsc} onToggle={toggleSort} />
                </th>
                <th className={`${thCls} hidden lg:table-cell`}>County</th>
                <th className={thCls}>Status</th>
                <th className={thCls}>
                  <SortBtn label="Products" k="products" sortKey={sortKey} sortAsc={sortAsc} onToggle={toggleSort} />
                </th>
                <th className={thCls}>Platforms</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No stores match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((store) => {
                  const badge = STATUS_BADGE[store.status ?? "unknown"] ?? STATUS_BADGE.unknown;
                  return (
                    <tr
                      key={store.id}
                      className="hover:bg-accent/40 cursor-pointer transition-colors duration-100"
                      onClick={() => navigate(`/stores/${store.id}`)}
                    >
                      <td className="px-4 py-2.5 font-medium text-foreground max-w-[200px] truncate">
                        {store.name}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground capitalize">
                        {(store.city ?? "").toLowerCase()}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground capitalize hidden lg:table-cell">
                        {(store.county ?? "").toLowerCase()}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground font-mono-data text-xs">
                        {(store.total_products ?? 0) > 0
                          ? (store.total_products ?? 0).toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1">
                          {(() => {
                            const visible = PLATFORM_BADGES.filter(
                              (cfg) => !!(menuMap[store.id] ?? []).includes(cfg.source) || !!store[cfg.slugField]
                            );
                            if (visible.length === 0) {
                              return (
                                <span className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                                  <WifiOff className="w-3 h-3" /> None
                                </span>
                              );
                            }
                            return visible.map((cfg) => {
                              const hasMenu = (menuMap[store.id] ?? []).includes(cfg.source);
                              return (
                                <span
                                  key={cfg.source}
                                  title={PLATFORM_LABELS[cfg.source]}
                                  className="inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-bold select-none"
                                  style={hasMenu
                                    ? { background: cfg.color + "22", color: cfg.color, border: `1px solid ${cfg.color}66` }
                                    : { background: "transparent", color: cfg.color + "88", border: `1px dashed ${cfg.color}44` }
                                  }
                                >
                                  {cfg.letter}
                                </span>
                              );
                            });
                          })()}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        <ChevronRight className="w-4 h-4" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
