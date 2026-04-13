import { useEffect, useState, useRef, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import type { IntelStore } from "@/lib/types";
import { Search, ChevronRight, WifiOff, ArrowUpDown, Tag, Plus, X, Map, List } from "lucide-react";

const StoreMapView = lazy(() =>
  import("@/components/maps/StoreMapView").then((m) => ({ default: m.StoreMapView }))
);

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

// ── Tag system ────────────────────────────────────────────────────────────────

const PREDEFINED_TAGS = [
  "Priority",
  "Key Account",
  "New Target",
  "Credit Risk",
  "Seasonal",
  "High Volume",
  "Low Volume",
];

const TAG_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "Priority":     { bg: "bg-rose-500/10",   text: "text-rose-500",   border: "border-rose-500/30" },
  "Key Account":  { bg: "bg-primary/10",    text: "text-primary",    border: "border-primary/30" },
  "New Target":   { bg: "bg-blue-500/10",   text: "text-blue-500",   border: "border-blue-500/30" },
  "Credit Risk":  { bg: "bg-orange-500/10", text: "text-orange-500", border: "border-orange-500/30" },
  "Seasonal":     { bg: "bg-purple-500/10", text: "text-purple-500", border: "border-purple-500/30" },
  "High Volume":  { bg: "bg-emerald-500/10",text: "text-emerald-500",border: "border-emerald-500/30" },
  "Low Volume":   { bg: "bg-gray-500/10",   text: "text-gray-400",   border: "border-gray-500/30" },
};

function hashTagColor(tag: string) {
  if (TAG_COLORS[tag]) return TAG_COLORS[tag];
  // Deterministic color from tag string
  const palette = [
    { bg: "bg-pink-500/10",   text: "text-pink-500",   border: "border-pink-500/30" },
    { bg: "bg-cyan-500/10",   text: "text-cyan-500",   border: "border-cyan-500/30" },
    { bg: "bg-indigo-500/10", text: "text-indigo-500", border: "border-indigo-500/30" },
    { bg: "bg-teal-500/10",   text: "text-teal-500",   border: "border-teal-500/30" },
    { bg: "bg-yellow-500/10", text: "text-yellow-500", border: "border-yellow-500/30" },
  ];
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) & 0xffff;
  return palette[h % palette.length];
}

function TagPill({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  const colors = hashTagColor(tag);
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${colors.bg} ${colors.text} ${colors.border}`}
    >
      {tag}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="hover:opacity-70 transition-opacity ml-0.5"
          title={`Remove ${tag}`}
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </span>
  );
}

interface TagDropdownProps {
  storeId: string;
  orgId: string;
  currentTags: string[];
  onTagsChange: (storeId: string, tags: string[]) => void;
  onClose: () => void;
}

function TagDropdown({ storeId, orgId, currentTags, onTagsChange, onClose }: TagDropdownProps) {
  const [customTag, setCustomTag] = useState("");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onClose]);

  async function addTag(tag: string) {
    if (!tag.trim() || saving) return;
    const t = tag.trim();
    if (currentTags.includes(t)) return;
    setSaving(true);
    await supabase.from("store_tags").upsert(
      { intel_store_id: storeId, tag: t, org_id: orgId },
      { onConflict: "intel_store_id,tag,org_id" }
    );
    onTagsChange(storeId, [...currentTags, t]);
    setSaving(false);
    setCustomTag("");
  }

  return (
    <div
      ref={ref}
      className="absolute z-50 right-0 top-full mt-1 w-52 rounded-xl border border-border bg-popover shadow-lg overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-2 border-b border-border">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Add Tag</p>
      </div>
      {/* Predefined */}
      <div className="p-2 space-y-0.5">
        {PREDEFINED_TAGS.map((t) => (
          <button
            key={t}
            onClick={() => addTag(t)}
            disabled={currentTags.includes(t)}
            className={`w-full text-left px-2.5 py-1.5 rounded-md text-[12px] transition-colors ${
              currentTags.includes(t)
                ? "opacity-40 cursor-default"
                : "hover:bg-accent text-foreground"
            }`}
          >
            <TagPill tag={t} />
          </button>
        ))}
      </div>
      {/* Custom tag input */}
      <div className="px-2 pb-2">
        <div className="flex gap-1">
          <input
            value={customTag}
            onChange={(e) => setCustomTag(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addTag(customTag); }}
            placeholder="Custom tag…"
            className="flex-1 px-2 py-1 text-[12px] rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          <button
            onClick={() => addTag(customTag)}
            disabled={!customTag.trim() || saving}
            className="px-2 py-1 rounded-md bg-primary text-primary-foreground text-[12px] disabled:opacity-40 hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

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

// ── Main Component ────────────────────────────────────────────────────────────

export function StoreDirectory() {
  const navigate = useNavigate();
  const { orgId } = useOrg();

  const [stores, setStores]     = useState<IntelStore[]>([]);
  const [menuMap, setMenuMap]   = useState<Record<string, string[]>>({});
  const [loading, setLoading]   = useState(true);
  const [viewMode, setViewMode] = useState<"table" | "map">("table");
  const [query, setQuery]       = useState("");
  const [cityFilter, setCityFilter]       = useState("");
  const [countyFilter, setCountyFilter]   = useState("");
  const [statusFilter, setStatusFilter]   = useState("active");
  const [menuFilter, setMenuFilter]       = useState<"" | "has" | "none">("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [tagFilter, setTagFilter]         = useState("");
  const [sortKey, setSortKey]   = useState<SortKey>("name");
  const [sortAsc, setSortAsc]   = useState(true);

  // Tags: storeId -> string[]
  const [storeTags, setStoreTags] = useState<Record<string, string[]>>({});
  const [openTagMenu, setOpenTagMenu] = useState<string | null>(null);

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

  // Load tags separately so it doesn't block initial render
  useEffect(() => {
    async function loadTags() {
      const { data } = await supabase
        .from("store_tags")
        .select("intel_store_id, tag");
      if (!data) return;
      const map: Record<string, string[]> = {};
      for (const row of data) {
        if (!map[row.intel_store_id]) map[row.intel_store_id] = [];
        map[row.intel_store_id].push(row.tag);
      }
      setStoreTags(map);
    }
    loadTags();
  }, []);

  function handleTagsChange(storeId: string, tags: string[]) {
    setStoreTags((prev) => ({ ...prev, [storeId]: tags }));
  }

  async function removeTag(storeId: string, tag: string) {
    await supabase
      .from("store_tags")
      .delete()
      .eq("intel_store_id", storeId)
      .eq("tag", tag)
      .eq("org_id", orgId ?? "");
    setStoreTags((prev) => ({
      ...prev,
      [storeId]: (prev[storeId] ?? []).filter((t) => t !== tag),
    }));
  }

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortAsc((a) => !a);
    else { setSortKey(k); setSortAsc(true); }
  }

  const cities   = [...new Set(stores.map((s) => s.city).filter(Boolean)   as string[])].sort();
  const counties = [...new Set(stores.map((s) => s.county).filter(Boolean) as string[])].sort();

  // All tags used (for filter dropdown)
  const allTagsUsed = [...new Set(Object.values(storeTags).flat())].sort();

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
      if (tagFilter && !(storeTags[s.id] ?? []).includes(tagFilter)) return false;
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-foreground">Store Directory</h1>
          <div className="header-underline mt-1" />
          <p className="text-sm text-muted-foreground mt-1">
            {loading
              ? "Loading…"
              : `${filtered.length} of ${stores.length} stores · click a row to view & edit`}
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-lg border border-border bg-card shrink-0">
          <button
            onClick={() => setViewMode("table")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-all ${
              viewMode === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <List className="w-3.5 h-3.5" /> Table
          </button>
          <button
            onClick={() => setViewMode("map")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-all ${
              viewMode === "map" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Map className="w-3.5 h-3.5" /> Map
          </button>
        </div>
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
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className={`${selectCls} ${tagFilter ? "border-primary text-primary" : ""}`}
        >
          <option value="">All Tags</option>
          {allTagsUsed.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* ── Map view ─────────────────────────────────────────────────────────── */}
      {viewMode === "map" && !loading && (
        <Suspense fallback={
          <div className="h-[560px] rounded-xl border border-border bg-card/50 flex items-center justify-center">
            <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        }>
          <StoreMapView stores={filtered} menuMap={menuMap} />
        </Suspense>
      )}

      {/* ── Table view ───────────────────────────────────────────────────────── */}
      {viewMode === "table" && <div className="rounded-lg border border-border bg-card overflow-hidden shadow-premium">
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
                <th className={`${thCls} hidden xl:table-cell`}>
                  <span className="flex items-center gap-1"><Tag className="w-3 h-3" />Tags</span>
                </th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No stores match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((store) => {
                  const badge = STATUS_BADGE[store.status ?? "unknown"] ?? STATUS_BADGE.unknown;
                  const tags = storeTags[store.id] ?? [];
                  return (
                    <tr
                      key={store.id}
                      className="hover:bg-accent/40 cursor-pointer transition-colors duration-100 group"
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
                      {/* Tags column */}
                      <td className="px-4 py-2 hidden xl:table-cell" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1 flex-wrap min-w-[120px]">
                          {tags.map((t) => (
                            <TagPill
                              key={t}
                              tag={t}
                              onRemove={orgId ? () => removeTag(store.id, t) : undefined}
                            />
                          ))}
                          {/* Add tag button */}
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenTagMenu(openTagMenu === store.id ? null : store.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent border border-dashed border-border"
                              title="Add tag"
                            >
                              <Plus className="w-2.5 h-2.5" />
                              Tag
                            </button>
                            {openTagMenu === store.id && orgId && (
                              <TagDropdown
                                storeId={store.id}
                                orgId={orgId}
                                currentTags={tags}
                                onTagsChange={handleTagsChange}
                                onClose={() => setOpenTagMenu(null)}
                              />
                            )}
                          </div>
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
      </div>}
    </div>
  );
}
