import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BarChart2, Package, Tag, Wifi, Search } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BrandRow {
  brand: string;
  store_count: number;
  total_products: number;
  avg_price: number | null;
}

interface CategoryRow {
  category: string;
  product_count: number;
  store_count: number;
  avg_price: number | null;
}

interface PlatformStat {
  source: string;
  label: string;
  color: string;
  stores: number;
  products: number;
}

interface CityRow {
  city: string;
  total: number;
  with_data: number;
}

type TabId = "brands" | "categories" | "coverage";

const PLATFORM_META: Record<string, { label: string; color: string }> = {
  "dutchie-api": { label: "Dutchie",  color: "#00D4AA" },
  "leafly":      { label: "Leafly",   color: "#3BB143" },
  "posabit-api": { label: "POSaBit",  color: "#5C6BC0" },
  "weedmaps":    { label: "Weedmaps", color: "#F7931A" },
};

const thCls =
  "text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest";

// ── Shared skeleton ───────────────────────────────────────────────────────────

function Skeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="space-y-px">
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="h-9 skeleton-shimmer rounded" />
      ))}
    </div>
  );
}

// ── Report 1: Brand Rankings ──────────────────────────────────────────────────

function BrandReport() {
  const [rows, setRows]     = useState<BrandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery]   = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);

      // Step 1: get all dispensary_menus linked to an intel_store
      const { data: menus } = await supabase
        .from("dispensary_menus")
        .select("id, intel_store_id")
        .not("intel_store_id", "is", null);

      if (!menus?.length) { setLoading(false); return; }

      const menuToStore: Record<string, string> = {};
      const validIds: string[] = [];
      for (const m of menus) {
        menuToStore[m.id] = m.intel_store_id;
        validIds.push(m.id);
      }

      // Step 2: fetch menu_items for those menus (chunked to avoid URL limits)
      const CHUNK = 400;
      const chunks: string[][] = [];
      for (let i = 0; i < validIds.length; i += CHUNK) chunks.push(validIds.slice(i, i + CHUNK));

      const allItems: { raw_brand: string; raw_price: number | null; dispensary_menu_id: string }[] = [];
      for (const chunk of chunks) {
        const { data } = await supabase
          .from("menu_items")
          .select("raw_brand, raw_price, dispensary_menu_id")
          .eq("is_on_menu", true)
          .not("raw_brand", "is", null)
          .in("dispensary_menu_id", chunk);
        if (data) allItems.push(...data);
      }

      // Aggregate: brand → { stores: Set, totalProducts, priceSum, priceCount }
      const agg: Record<string, { stores: Set<string>; total: number; priceSum: number; priceCount: number }> = {};
      for (const item of allItems) {
        const b = item.raw_brand;
        if (!b) continue;
        if (!agg[b]) agg[b] = { stores: new Set(), total: 0, priceSum: 0, priceCount: 0 };
        const storeId = menuToStore[item.dispensary_menu_id];
        if (storeId) agg[b].stores.add(storeId);
        agg[b].total++;
        if (item.raw_price != null && item.raw_price > 0) {
          agg[b].priceSum += item.raw_price;
          agg[b].priceCount++;
        }
      }

      const sorted: BrandRow[] = Object.entries(agg)
        .map(([brand, { stores, total, priceSum, priceCount }]) => ({
          brand,
          store_count: stores.size,
          total_products: total,
          avg_price: priceCount > 0 ? priceSum / priceCount : null,
        }))
        .sort((a, b) => b.store_count - a.store_count)
        .slice(0, 50);

      setRows(sorted);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = query
    ? rows.filter(r => r.brand.toLowerCase().includes(query.toLowerCase()))
    : rows;

  if (loading) return <Skeleton />;

  return (
    <div className="space-y-3">
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Filter brands…"
          className="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden shadow-premium">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-sidebar" style={{ borderBottom: "1px solid var(--glass-border)" }}>
              <th className={`${thCls} w-10`}>#</th>
              <th className={thCls}>Brand</th>
              <th className={thCls}>Stores</th>
              <th className={thCls}>Products</th>
              <th className={thCls}>Avg Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No brands found.</td></tr>
            ) : filtered.map((b, i) => (
              <tr key={b.brand} className="hover:bg-accent/30 transition-colors">
                <td className="px-4 py-2 text-muted-foreground font-mono-data text-xs">{i + 1}</td>
                <td className="px-4 py-2 font-medium text-foreground">{b.brand}</td>
                <td className="px-4 py-2 font-mono-data text-xs text-muted-foreground">{b.store_count}</td>
                <td className="px-4 py-2 font-mono-data text-xs text-muted-foreground">{b.total_products.toLocaleString()}</td>
                <td className="px-4 py-2 font-mono-data text-xs text-muted-foreground">
                  {b.avg_price != null ? `$${b.avg_price.toFixed(2)}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Report 2: Category Breakdown ─────────────────────────────────────────────

const CAT_COLORS = [
  "#00D4AA","#3BB143","#5C6BC0","#F7931A","#E91E63",
  "#9C27B0","#00BCD4","#FF5722","#607D8B","#8BC34A",
  "#FFC107","#03A9F4","#795548","#009688","#FF9800",
];

function CategoryReport() {
  const [rows, setRows]       = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const { data: menus } = await supabase
        .from("dispensary_menus")
        .select("id, intel_store_id")
        .not("intel_store_id", "is", null);

      if (!menus?.length) { setLoading(false); return; }

      const menuToStore: Record<string, string> = {};
      const validIds: string[] = [];
      for (const m of menus) { menuToStore[m.id] = m.intel_store_id; validIds.push(m.id); }

      const CHUNK = 400;
      const allItems: { raw_category: string; raw_price: number | null; dispensary_menu_id: string }[] = [];
      for (let i = 0; i < validIds.length; i += CHUNK) {
        const { data } = await supabase
          .from("menu_items")
          .select("raw_category, raw_price, dispensary_menu_id")
          .eq("is_on_menu", true)
          .not("raw_category", "is", null)
          .in("dispensary_menu_id", validIds.slice(i, i + CHUNK));
        if (data) allItems.push(...data);
      }

      const agg: Record<string, { stores: Set<string>; count: number; priceSum: number; priceCount: number }> = {};
      for (const item of allItems) {
        const cat = item.raw_category;
        if (!cat) continue;
        if (!agg[cat]) agg[cat] = { stores: new Set(), count: 0, priceSum: 0, priceCount: 0 };
        const storeId = menuToStore[item.dispensary_menu_id];
        if (storeId) agg[cat].stores.add(storeId);
        agg[cat].count++;
        if (item.raw_price != null && item.raw_price > 0) { agg[cat].priceSum += item.raw_price; agg[cat].priceCount++; }
      }

      const sorted: CategoryRow[] = Object.entries(agg)
        .map(([category, { stores, count, priceSum, priceCount }]) => ({
          category,
          product_count: count,
          store_count: stores.size,
          avg_price: priceCount > 0 ? priceSum / priceCount : null,
        }))
        .sort((a, b) => b.product_count - a.product_count);

      setRows(sorted);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <Skeleton rows={6} />;

  const chartData = rows.map(r => ({ name: r.category, products: r.product_count, stores: r.store_count }));

  return (
    <div className="space-y-5">
      {/* Bar chart */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-premium">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
          Products by Category
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 16, right: 24, top: 0, bottom: 0 }}>
            <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis
              type="category" dataKey="name" width={90}
              tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} axisLine={false} tickLine={false}
            />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
              cursor={{ fill: "hsl(var(--accent) / 0.4)" }}
              formatter={(v) => [Number(v).toLocaleString(), "Products"]}
            />
            <Bar dataKey="products" radius={[0, 4, 4, 0]}>
              {chartData.map((_, idx) => (
                <Cell key={idx} fill={CAT_COLORS[idx % CAT_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detail table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden shadow-premium">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-sidebar" style={{ borderBottom: "1px solid var(--glass-border)" }}>
              <th className={thCls}>Category</th>
              <th className={thCls}>Products</th>
              <th className={thCls}>Stores</th>
              <th className={thCls}>Avg Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {rows.map((r, i) => (
              <tr key={r.category} className="hover:bg-accent/30 transition-colors">
                <td className="px-4 py-2 font-medium text-foreground flex items-center gap-2">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ background: CAT_COLORS[i % CAT_COLORS.length] }}
                  />
                  {r.category}
                </td>
                <td className="px-4 py-2 font-mono-data text-xs text-muted-foreground">{r.product_count.toLocaleString()}</td>
                <td className="px-4 py-2 font-mono-data text-xs text-muted-foreground">{r.store_count}</td>
                <td className="px-4 py-2 font-mono-data text-xs text-muted-foreground">
                  {r.avg_price != null ? `$${r.avg_price.toFixed(2)}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Report 3: Coverage Summary ────────────────────────────────────────────────

function CoverageReport() {
  const [platforms, setPlatforms]   = useState<PlatformStat[]>([]);
  const [cities, setCities]         = useState<CityRow[]>([]);
  const [storesWithData, setWithData] = useState<number>(0);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const [storeRes, menusRes, intelRes] = await Promise.all([
        // Stores with product data
        supabase.from("intel_stores").select("id", { count: "exact", head: true }).gt("total_products", 0),
        // Menus by platform
        supabase.from("dispensary_menus").select("source, intel_store_id, menu_item_count").not("intel_store_id", "is", null),
        // All active stores with city
        supabase.from("intel_stores").select("id, city, total_products").eq("status", "active"),
      ]);

      setWithData(storeRes.count ?? 0);

      // Platform aggregation
      const platformAgg: Record<string, { stores: Set<string>; products: number }> = {};
      for (const m of menusRes.data ?? []) {
        const src = m.source;
        if (!PLATFORM_META[src]) continue;
        if (!platformAgg[src]) platformAgg[src] = { stores: new Set(), products: 0 };
        if (m.intel_store_id) platformAgg[src].stores.add(m.intel_store_id);
        platformAgg[src].products += m.menu_item_count ?? 0;
      }
      const platformStats: PlatformStat[] = Object.entries(PLATFORM_META).map(([src, meta]) => ({
        source: src,
        label: meta.label,
        color: meta.color,
        stores: platformAgg[src]?.stores.size ?? 0,
        products: platformAgg[src]?.products ?? 0,
      }));
      setPlatforms(platformStats);

      // City aggregation
      const storesWithMenuId = new Set(
        (menusRes.data ?? []).map(m => m.intel_store_id).filter(Boolean)
      );
      const cityAgg: Record<string, { total: number; with_data: number }> = {};
      for (const s of intelRes.data ?? []) {
        const city = (s.city ?? "Unknown").toLowerCase();
        if (!cityAgg[city]) cityAgg[city] = { total: 0, with_data: 0 };
        cityAgg[city].total++;
        if (storesWithMenuId.has(s.id)) cityAgg[city].with_data++;
      }
      const citySorted: CityRow[] = Object.entries(cityAgg)
        .map(([city, { total, with_data }]) => ({ city, total, with_data }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 20);
      setCities(citySorted);

      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <Skeleton rows={8} />;

  const totalStores = 458;
  const coveragePct = Math.round((storesWithData / totalStores) * 100);

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-foreground font-mono-data">{totalStores}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Total LCB Stores</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-emerald-500 font-mono-data">{storesWithData}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Stores with Data</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-foreground font-mono-data">{coveragePct}%</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Market Coverage</p>
          <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${coveragePct}%` }} />
          </div>
        </div>
      </div>

      {/* Platform breakdown */}
      <div className="rounded-lg border border-border bg-card shadow-premium">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">By Platform</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-border">
          {platforms.map(p => (
            <div key={p.source} className="p-4 text-center" style={{ borderTop: `3px solid ${p.color}` }}>
              <p className="text-xl font-bold font-mono-data" style={{ color: p.color }}>{p.stores}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{p.label}</p>
              <p className="text-[10px] text-muted-foreground mt-1 flex items-center justify-center gap-1">
                <Wifi className="w-2.5 h-2.5" />
                {p.products.toLocaleString()} products
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* City table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden shadow-premium">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Top 20 Cities by Store Count</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-sidebar" style={{ borderBottom: "1px solid var(--glass-border)" }}>
              <th className={thCls}>City</th>
              <th className={thCls}>Stores</th>
              <th className={thCls}>With Data</th>
              <th className={thCls}>Coverage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {cities.map(row => {
              const pct = Math.round((row.with_data / row.total) * 100);
              const color = pct >= 75 ? "#00D4AA" : pct >= 40 ? "#F7931A" : "#ef4444";
              return (
                <tr key={row.city} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-2 font-medium text-foreground capitalize">{row.city}</td>
                  <td className="px-4 py-2 font-mono-data text-xs text-muted-foreground">{row.total}</td>
                  <td className="px-4 py-2 font-mono-data text-xs text-muted-foreground">{row.with_data}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                      </div>
                      <span className="text-xs font-mono-data" style={{ color }}>{pct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Reports page ─────────────────────────────────────────────────────────

type Tab = { id: TabId; label: string; icon: React.ElementType };

const TABS: Tab[] = [
  { id: "brands",     label: "Brand Rankings",    icon: Tag      },
  { id: "categories", label: "Category Breakdown", icon: Package  },
  { id: "coverage",   label: "Coverage Summary",   icon: BarChart2 },
];

export function Reports() {
  const [tab, setTab] = useState<TabId>("brands");
  // Track which tabs have been visited so they only load once
  const [visited, setVisited] = useState<Set<TabId>>(new Set(["brands"]));

  function switchTab(id: TabId) {
    setTab(id);
    setVisited(prev => new Set([...prev, id]));
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5 animate-fade-up">
      <div>
        <h1 className="text-foreground">Reports</h1>
        <div className="header-underline mt-1" />
        <p className="text-sm text-muted-foreground mt-1">Market intelligence — data loads per tab, not all at once</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-border">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => switchTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab panels — mount once visited, hidden when not active */}
      <div className={tab === "brands"     ? "" : "hidden"}>{visited.has("brands")     && <BrandReport />}</div>
      <div className={tab === "categories" ? "" : "hidden"}>{visited.has("categories") && <CategoryReport />}</div>
      <div className={tab === "coverage"   ? "" : "hidden"}>{visited.has("coverage")   && <CoverageReport />}</div>
    </div>
  );
}
