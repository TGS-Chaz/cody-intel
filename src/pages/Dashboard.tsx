import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isExcludedCategory, isExcludedBrand } from "@/lib/analytics-filters";
import { Store, Wifi, TrendingUp, Database, Clock, Trophy } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FastStats {
  totalStores: number;
  storesWithMenus: number;
  totalProducts: number;
  platformCounts: Record<string, number>;
  byCounty: { county: string; count: number }[];
  freshness: string | null;
  recentActivity: { id: string; name: string; city: string; total_products: number; menu_last_updated: string }[];
  topStores: { id: string; name: string; city: string; total_products: number }[];
}

interface HeavyStats {
  brands: { brand: string; store_count: number }[];
  categories: { category: string; product_count: number }[];
  prices: { category: string; avg: number; min: number; max: number }[];
}

const PLATFORM_LABELS: Record<string, string> = {
  "dutchie-api": "Dutchie",
  leafly: "Leafly",
  weedmaps: "Weedmaps",
  "posabit-api": "POSaBit",
  jane: "Jane",
};

const PLATFORM_COLORS: Record<string, string> = {
  "dutchie-api": "#00D4AA",
  leafly: "#3BB143",
  weedmaps: "#F7931A",
  "posabit-api": "#5C6BC0",
  jane: "#E91E63",
};

const CAT_COLORS = [
  "#A855F7", "#00D4AA", "#3BB143", "#5C6BC0", "#F7931A",
  "#E91E63", "#00BCD4", "#FF5722", "#8BC34A", "#FFC107",
  "#03A9F4", "#795548",
];

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  accent: string;
  sub?: string;
}) {
  return (
    <div className={`rounded-lg border border-border bg-card p-4 card-hover ${accent}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="text-2xl font-bold text-foreground font-mono-data">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function CardShell({ title, children, loading }: { title: string; children: React.ReactNode; loading?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 card-hover">
      <h2 className="text-foreground mb-4">{title}</h2>
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-7 skeleton-shimmer rounded" />)}
        </div>
      ) : children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function Dashboard() {
  const [fast, setFast] = useState<FastStats | null>(null);
  const [heavy, setHeavy] = useState<HeavyStats | null>(null);
  const [fastLoading, setFastLoading] = useState(true);
  const [heavyLoading, setHeavyLoading] = useState(true);

  // ── Phase 1: fast queries ──────────────────────────────────────────────────
  useEffect(() => {
    async function loadFast() {
      const [storesRes, menusRes, recentRes, topRes, freshRes] = await Promise.all([
        supabase.from("intel_stores").select("id, county, total_products").eq("status", "active"),
        supabase.from("dispensary_menus").select("intel_store_id, source, menu_item_count").not("intel_store_id", "is", null),
        supabase.from("intel_stores").select("id, name, city, total_products, menu_last_updated").not("menu_last_updated", "is", null).order("menu_last_updated", { ascending: false }).limit(10),
        supabase.from("intel_stores").select("id, name, city, total_products").gt("total_products", 0).order("total_products", { ascending: false }).limit(10),
        supabase.from("dispensary_menus").select("last_scraped_at").not("last_scraped_at", "is", null).order("last_scraped_at", { ascending: false }).limit(1),
      ]);

      const stores = storesRes.data ?? [];
      const menus = menusRes.data ?? [];
      const storesWithMenus = new Set(menus.map((m) => m.intel_store_id)).size;
      const totalProducts = menus.reduce((s, m) => s + (m.menu_item_count ?? 0), 0);

      const platformCounts: Record<string, number> = {};
      for (const m of menus) platformCounts[m.source] = (platformCounts[m.source] ?? 0) + 1;

      const countyMap: Record<string, number> = {};
      for (const s of stores) {
        if (s.county) countyMap[s.county] = (countyMap[s.county] ?? 0) + 1;
      }
      const byCounty = Object.entries(countyMap)
        .map(([county, count]) => ({ county, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      setFast({
        totalStores: stores.length,
        storesWithMenus,
        totalProducts,
        platformCounts,
        byCounty,
        freshness: freshRes.data?.[0]?.last_scraped_at ?? null,
        recentActivity: (recentRes.data ?? []) as FastStats["recentActivity"],
        topStores: (topRes.data ?? []) as FastStats["topStores"],
      });
      setFastLoading(false);
    }
    loadFast();
  }, []);

  // ── Phase 2: heavy queries (menu_items) ────────────────────────────────────
  useEffect(() => {
    async function loadHeavy() {
      const { data: menus } = await supabase
        .from("dispensary_menus")
        .select("id, intel_store_id")
        .not("intel_store_id", "is", null);
      if (!menus?.length) { setHeavyLoading(false); return; }

      const menuToStore: Record<string, string> = {};
      const validIds: string[] = [];
      for (const m of menus) { menuToStore[m.id] = m.intel_store_id; validIds.push(m.id); }

      const CHUNK = 400;
      const allItems: { raw_brand: string | null; raw_category: string | null; raw_price: number | null; dispensary_menu_id: string }[] = [];
      for (let i = 0; i < validIds.length; i += CHUNK) {
        const { data } = await supabase
          .from("menu_items")
          .select("raw_brand, raw_category, raw_price, dispensary_menu_id")
          .eq("is_on_menu", true)
          .in("dispensary_menu_id", validIds.slice(i, i + CHUNK));
        if (data) allItems.push(...data);
      }

      // Brands aggregation
      const brandAgg: Record<string, Set<string>> = {};
      for (const item of allItems) {
        const b = item.raw_brand;
        if (!b || isExcludedBrand(b)) continue;
        if (!brandAgg[b]) brandAgg[b] = new Set();
        const storeId = menuToStore[item.dispensary_menu_id];
        if (storeId) brandAgg[b].add(storeId);
      }
      const brands = Object.entries(brandAgg)
        .map(([brand, stores]) => ({ brand, store_count: stores.size }))
        .sort((a, b) => b.store_count - a.store_count)
        .slice(0, 10);

      // Category aggregation
      const catAgg: Record<string, { count: number; prices: number[] }> = {};
      for (const item of allItems) {
        const cat = item.raw_category;
        if (!cat || isExcludedCategory(cat)) continue;
        if (!catAgg[cat]) catAgg[cat] = { count: 0, prices: [] };
        catAgg[cat].count++;
        if (item.raw_price != null && item.raw_price > 0) catAgg[cat].prices.push(item.raw_price);
      }
      const categories = Object.entries(catAgg)
        .map(([category, { count }]) => ({ category, product_count: count }))
        .sort((a, b) => b.product_count - a.product_count)
        .slice(0, 10);

      const prices = Object.entries(catAgg)
        .filter(([, { prices: p }]) => p.length > 0)
        .map(([category, { prices: p }]) => ({
          category,
          avg: p.reduce((s, v) => s + v, 0) / p.length,
          min: Math.min(...p),
          max: Math.max(...p),
        }))
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 8);

      setHeavy({ brands, categories, prices });
      setHeavyLoading(false);
    }
    loadHeavy();
  }, []);

  const coverage = fast ? Math.round((fast.storesWithMenus / fast.totalStores) * 100) : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-foreground">Market Overview</h1>
          <div className="header-underline mt-1" />
          <p className="text-sm text-muted-foreground mt-1">
            Washington State cannabis market intelligence
          </p>
        </div>
        {fast?.freshness && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1">
            <Clock className="w-3 h-3" />
            <span>Updated {timeAgo(fast.freshness)}</span>
          </div>
        )}
      </div>

      {/* ── Stat cards ── */}
      {fastLoading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4 h-24 skeleton-shimmer" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={Store}     label="Active Stores"   value={fast?.totalStores ?? 0}  accent="stat-accent-teal" />
          <StatCard icon={Wifi}      label="With Menu Data"  value={fast?.storesWithMenus ?? 0} accent="stat-accent-blue" />
          <StatCard icon={TrendingUp} label="Market Coverage" value={`${coverage}%`}           accent="stat-accent-amber"
            sub={`${458 - (fast?.storesWithMenus ?? 0)} stores without data`} />
          <StatCard icon={Database}  label="Total Products"  value={(fast?.totalProducts ?? 0).toLocaleString()} accent="stat-accent-emerald" />
        </div>
      )}

      {/* ── Recent Activity + Top Stores ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CardShell title="Recent Activity" loading={fastLoading}>
          <div className="space-y-1.5">
            {fast?.recentActivity.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-1">
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-foreground truncate">{s.name}</p>
                  <p className="text-[10px] text-muted-foreground">{s.city}</p>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="text-[11px] font-mono-data text-foreground">{s.total_products.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">{timeAgo(s.menu_last_updated)}</p>
                </div>
              </div>
            ))}
          </div>
        </CardShell>

        <CardShell title="Top Stores by Menu Size" loading={fastLoading}>
          <div className="space-y-1.5">
            {fast?.topStores.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2.5 py-0.5">
                <span className="text-[10px] font-mono-data text-muted-foreground/60 w-4 shrink-0">{i + 1}</span>
                <Trophy className={`w-3 h-3 shrink-0 ${i === 0 ? "text-amber-400" : i === 1 ? "text-slate-400" : i === 2 ? "text-amber-700" : "text-transparent"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-foreground truncate">{s.name}</p>
                  <p className="text-[10px] text-muted-foreground">{s.city}</p>
                </div>
                <span className="font-mono-data text-xs text-muted-foreground shrink-0">
                  {s.total_products.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </CardShell>
      </div>

      {/* ── Trending Brands + Category Distribution ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Trending Brands bar chart */}
        <div className="rounded-lg border border-border bg-card p-5 card-hover">
          <h2 className="text-foreground mb-4">Trending Brands</h2>
          {heavyLoading ? (
            <div className="h-[220px] skeleton-shimmer rounded" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={heavy?.brands.map((b) => ({
                  name: b.brand.length > 18 ? b.brand.slice(0, 18) + "…" : b.brand,
                  stores: b.store_count,
                }))}
                layout="vertical"
                margin={{ left: 0, right: 24, top: 0, bottom: 0 }}
              >
                <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10, fill: "hsl(var(--foreground))" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  cursor={{ fill: "hsl(var(--accent) / 0.4)" }}
                  formatter={(v) => [v, "Stores"]}
                />
                <Bar dataKey="stores" radius={[0, 4, 4, 0]}>
                  {(heavy?.brands ?? []).map((_, idx) => (
                    <Cell key={idx} fill="#A855F7" fillOpacity={1 - idx * 0.06} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Category Distribution donut */}
        <div className="rounded-lg border border-border bg-card p-5 card-hover">
          <h2 className="text-foreground mb-4">Category Distribution</h2>
          {heavyLoading ? (
            <div className="h-[220px] skeleton-shimmer rounded" />
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie
                    data={heavy?.categories.map((c, i) => ({
                      name: c.category,
                      value: c.product_count,
                      color: CAT_COLORS[i % CAT_COLORS.length],
                    }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {(heavy?.categories ?? []).map((_, i) => (
                      <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(v) => [Number(v).toLocaleString(), "Products"]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5 overflow-hidden">
                {heavy?.categories.slice(0, 8).map((c, i) => {
                  const total = heavy.categories.reduce((s, x) => s + x.product_count, 0);
                  const pct = Math.round((c.product_count / total) * 100);
                  return (
                    <div key={c.category} className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
                      <span className="text-[11px] text-foreground truncate flex-1">{c.category}</span>
                      <span className="text-[11px] font-mono-data text-muted-foreground shrink-0">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Price Insights ── */}
      <div className="rounded-lg border border-border bg-card p-5 card-hover">
        <h2 className="text-foreground mb-4">Price Insights</h2>
        {heavyLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <div key={i} className="h-8 skeleton-shimmer rounded" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--glass-border)" }}>
                  {["Category", "Avg Price", "Min", "Max"].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {heavy?.prices.map((p) => (
                  <tr key={p.category} className="hover:bg-accent/30 transition-colors">
                    <td className="px-3 py-2 font-medium text-foreground">{p.category}</td>
                    <td className="px-3 py-2 font-mono-data text-xs text-foreground">${p.avg.toFixed(2)}</td>
                    <td className="px-3 py-2 font-mono-data text-xs text-muted-foreground">${p.min.toFixed(2)}</td>
                    <td className="px-3 py-2 font-mono-data text-xs text-muted-foreground">${p.max.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Platform Coverage + Counties ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CardShell title="Platform Coverage" loading={fastLoading}>
          <div className="space-y-3">
            {Object.entries(fast?.platformCounts ?? {}).map(([source, count]) => {
              const pct = Math.round((count / (fast?.totalStores ?? 1)) * 100);
              const color = PLATFORM_COLORS[source] ?? "#A855F7";
              return (
                <div key={source} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-20 shrink-0">{PLATFORM_LABELS[source] ?? source}</span>
                  <div className="flex-1 bg-secondary rounded-full h-1.5 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <span className="text-xs font-mono-data text-foreground w-16 text-right">
                    {count} <span className="text-muted-foreground">({pct}%)</span>
                  </span>
                </div>
              );
            })}
          </div>
        </CardShell>

        <CardShell title="Stores by County" loading={fastLoading}>
          <div className="space-y-2">
            {fast?.byCounty.map(({ county, count }, i) => (
              <div key={county} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono-data text-muted-foreground/60 w-4">{i + 1}</span>
                  <span className="text-muted-foreground capitalize">{county?.toLowerCase() ?? "Unknown"}</span>
                </div>
                <span className="font-medium font-mono-data text-foreground">{count}</span>
              </div>
            ))}
          </div>
        </CardShell>
      </div>
    </div>
  );
}
