import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BarChart2, Package, Tag, Wifi, Search, Trophy, DollarSign, LayoutList } from "lucide-react";
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

interface PriceRow {
  category: string;
  avg: number;
  min: number;
  max: number;
  count: number;
}

interface StoreLeaderRow {
  id: string;
  name: string;
  city: string;
  total_products: number;
  platform_count: number;
}

type TabId = "brands" | "categories" | "coverage" | "prices" | "leaderboard" | "distribution";

// ── Constants ─────────────────────────────────────────────────────────────────

const PLATFORM_META: Record<string, { label: string; color: string }> = {
  "dutchie-api": { label: "Dutchie",  color: "#00D4AA" },
  "leafly":      { label: "Leafly",   color: "#3BB143" },
  "posabit-api": { label: "POSaBit",  color: "#5C6BC0" },
  "weedmaps":    { label: "Weedmaps", color: "#F7931A" },
};

const CAT_COLORS = [
  "#00D4AA","#3BB143","#5C6BC0","#F7931A","#E91E63",
  "#9C27B0","#00BCD4","#FF5722","#607D8B","#8BC34A",
  "#FFC107","#03A9F4","#795548","#009688","#FF9800",
];

const thCls = "text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest";

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
      const { data: menus } = await supabase
        .from("dispensary_menus")
        .select("id, intel_store_id")
        .not("intel_store_id", "is", null);
      if (!menus?.length) { setLoading(false); return; }

      const menuToStore: Record<string, string> = {};
      const validIds: string[] = [];
      for (const m of menus) { menuToStore[m.id] = m.intel_store_id; validIds.push(m.id); }

      const CHUNK = 400;
      const allItems: { raw_brand: string; raw_price: number | null; dispensary_menu_id: string }[] = [];
      for (let i = 0; i < validIds.length; i += CHUNK) {
        const { data } = await supabase
          .from("menu_items")
          .select("raw_brand, raw_price, dispensary_menu_id")
          .eq("is_on_menu", true)
          .not("raw_brand", "is", null)
          .in("dispensary_menu_id", validIds.slice(i, i + CHUNK));
        if (data) allItems.push(...data);
      }

      const agg: Record<string, { stores: Set<string>; total: number; priceSum: number; priceCount: number }> = {};
      for (const item of allItems) {
        const b = item.raw_brand;
        if (!b) continue;
        if (!agg[b]) agg[b] = { stores: new Set(), total: 0, priceSum: 0, priceCount: 0 };
        const storeId = menuToStore[item.dispensary_menu_id];
        if (storeId) agg[b].stores.add(storeId);
        agg[b].total++;
        if (item.raw_price != null && item.raw_price > 0) { agg[b].priceSum += item.raw_price; agg[b].priceCount++; }
      }

      const sorted: BrandRow[] = Object.entries(agg)
        .map(([brand, { stores, total, priceSum, priceCount }]) => ({
          brand, store_count: stores.size, total_products: total,
          avg_price: priceCount > 0 ? priceSum / priceCount : null,
        }))
        .sort((a, b) => b.store_count - a.store_count)
        .slice(0, 50);

      setRows(sorted);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = query ? rows.filter(r => r.brand.toLowerCase().includes(query.toLowerCase())) : rows;
  if (loading) return <Skeleton />;

  return (
    <div className="space-y-3">
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter brands…"
          className="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
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
          category, product_count: count, store_count: stores.size,
          avg_price: priceCount > 0 ? priceSum / priceCount : null,
        }))
        .sort((a, b) => b.product_count - a.product_count);

      setRows(sorted);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <Skeleton rows={6} />;

  const chartData = rows.map(r => ({ name: r.category, products: r.product_count }));

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-card p-4 shadow-premium">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">Products by Category</p>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 16, right: 24, top: 0, bottom: 0 }}>
            <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
              cursor={{ fill: "hsl(var(--accent) / 0.4)" }} formatter={(v) => [Number(v).toLocaleString(), "Products"]} />
            <Bar dataKey="products" radius={[0, 4, 4, 0]}>
              {chartData.map((_, idx) => <Cell key={idx} fill={CAT_COLORS[idx % CAT_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
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
                  <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
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
  const [storesWithData, setWithData] = useState(0);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [storeRes, menusRes, intelRes] = await Promise.all([
        supabase.from("intel_stores").select("id", { count: "exact", head: true }).gt("total_products", 0),
        supabase.from("dispensary_menus").select("source, intel_store_id, menu_item_count").not("intel_store_id", "is", null),
        supabase.from("intel_stores").select("id, city, total_products").eq("status", "active"),
      ]);

      setWithData(storeRes.count ?? 0);

      const platformAgg: Record<string, { stores: Set<string>; products: number }> = {};
      for (const m of menusRes.data ?? []) {
        const src = m.source;
        if (!PLATFORM_META[src]) continue;
        if (!platformAgg[src]) platformAgg[src] = { stores: new Set(), products: 0 };
        if (m.intel_store_id) platformAgg[src].stores.add(m.intel_store_id);
        platformAgg[src].products += m.menu_item_count ?? 0;
      }
      setPlatforms(Object.entries(PLATFORM_META).map(([src, meta]) => ({
        source: src, label: meta.label, color: meta.color,
        stores: platformAgg[src]?.stores.size ?? 0,
        products: platformAgg[src]?.products ?? 0,
      })));

      const storesWithMenuId = new Set((menusRes.data ?? []).map(m => m.intel_store_id).filter(Boolean));
      const cityAgg: Record<string, { total: number; with_data: number }> = {};
      for (const s of intelRes.data ?? []) {
        const city = (s.city ?? "Unknown").toLowerCase();
        if (!cityAgg[city]) cityAgg[city] = { total: 0, with_data: 0 };
        cityAgg[city].total++;
        if (storesWithMenuId.has(s.id)) cityAgg[city].with_data++;
      }
      setCities(Object.entries(cityAgg)
        .map(([city, { total, with_data }]) => ({ city, total, with_data }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 20));

      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <Skeleton rows={8} />;

  const totalStores = 458;
  const coveragePct = Math.round((storesWithData / totalStores) * 100);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total LCB Stores", value: totalStores, color: "text-foreground" },
          { label: "Stores with Data", value: storesWithData, color: "text-emerald-500" },
          { label: "Market Coverage",  value: `${coveragePct}%`, color: "text-foreground", bar: coveragePct },
        ].map(s => (
          <div key={s.label} className="rounded-lg border border-border bg-card p-4 text-center shadow-sm">
            <p className={`text-2xl font-bold font-mono-data ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">{s.label}</p>
            {s.bar != null && (
              <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${s.bar}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>

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
                <Wifi className="w-2.5 h-2.5" />{p.products.toLocaleString()} products
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden shadow-premium">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Top 20 Cities</p>
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
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
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

// ── Report 4: Price Intelligence ──────────────────────────────────────────────

function PriceReport() {
  const [rows, setRows]     = useState<PriceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: menus } = await supabase
        .from("dispensary_menus")
        .select("id, intel_store_id")
        .not("intel_store_id", "is", null);
      if (!menus?.length) { setLoading(false); return; }

      const validIds = menus.map(m => m.id);
      const CHUNK = 400;
      const catAgg: Record<string, { prices: number[] }> = {};

      for (let i = 0; i < validIds.length; i += CHUNK) {
        const { data } = await supabase
          .from("menu_items")
          .select("raw_category, raw_price, dispensary_menu_id")
          .eq("is_on_menu", true)
          .not("raw_category", "is", null)
          .not("raw_price", "is", null)
          .gt("raw_price", 0)
          .in("dispensary_menu_id", validIds.slice(i, i + CHUNK));
        if (data) {
          for (const item of data) {
            const cat = item.raw_category;
            if (!cat || item.raw_price == null) continue;
            if (!catAgg[cat]) catAgg[cat] = { prices: [] };
            catAgg[cat].prices.push(item.raw_price);
          }
        }
      }

      const sorted: PriceRow[] = Object.entries(catAgg)
        .filter(([, { prices }]) => prices.length >= 5)
        .map(([category, { prices }]) => ({
          category,
          avg: prices.reduce((s, v) => s + v, 0) / prices.length,
          min: Math.min(...prices),
          max: Math.max(...prices),
          count: prices.length,
        }))
        .sort((a, b) => b.avg - a.avg);

      setRows(sorted);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <Skeleton rows={8} />;

  const chartData = rows.slice(0, 12).map(r => ({
    name: r.category.length > 14 ? r.category.slice(0, 14) + "…" : r.category,
    avg: parseFloat(r.avg.toFixed(2)),
  }));

  return (
    <div className="space-y-5">
      {/* Bar chart: avg price by category */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-premium">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
          Average Price by Category
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 16, right: 40, top: 0, bottom: 0 }}>
            <XAxis type="number" tickFormatter={(v) => `$${v}`}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={100}
              tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
              cursor={{ fill: "hsl(var(--accent) / 0.4)" }}
              formatter={(v) => [`$${Number(v).toFixed(2)}`, "Avg Price"]}
            />
            <Bar dataKey="avg" radius={[0, 4, 4, 0]}>
              {chartData.map((_, idx) => <Cell key={idx} fill={CAT_COLORS[idx % CAT_COLORS.length]} />)}
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
              <th className={thCls}>Avg Price</th>
              <th className={thCls}>Min</th>
              <th className={thCls}>Max</th>
              <th className={thCls}>Data Points</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {rows.map((r, i) => (
              <tr key={r.category} className="hover:bg-accent/30 transition-colors">
                <td className="px-4 py-2 font-medium text-foreground flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
                  {r.category}
                </td>
                <td className="px-4 py-2 font-mono-data text-xs font-medium text-foreground">${r.avg.toFixed(2)}</td>
                <td className="px-4 py-2 font-mono-data text-xs text-muted-foreground">${r.min.toFixed(2)}</td>
                <td className="px-4 py-2 font-mono-data text-xs text-muted-foreground">${r.max.toFixed(2)}</td>
                <td className="px-4 py-2 font-mono-data text-xs text-muted-foreground">{r.count.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Report 5: Store Leaderboard ───────────────────────────────────────────────

function StoreLeaderboard() {
  const [rows, setRows]     = useState<StoreLeaderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [storesRes, menusRes] = await Promise.all([
        supabase.from("intel_stores")
          .select("id, name, city, total_products, dutchie_slug, leafly_slug, weedmaps_slug, posabit_merchant, jane_store_id")
          .gt("total_products", 0)
          .order("total_products", { ascending: false })
          .limit(50),
        supabase.from("dispensary_menus")
          .select("intel_store_id, source")
          .not("intel_store_id", "is", null),
      ]);

      // Count platforms per store
      const platformsPerStore: Record<string, Set<string>> = {};
      for (const m of menusRes.data ?? []) {
        if (!m.intel_store_id) continue;
        if (!platformsPerStore[m.intel_store_id]) platformsPerStore[m.intel_store_id] = new Set();
        platformsPerStore[m.intel_store_id].add(m.source);
      }

      const leaderRows: StoreLeaderRow[] = (storesRes.data ?? []).map(s => ({
        id: s.id,
        name: s.name,
        city: s.city ?? "—",
        total_products: s.total_products ?? 0,
        platform_count: platformsPerStore[s.id]?.size ?? 0,
      }));

      setRows(leaderRows);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <Skeleton />;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Top 50 stores ranked by total products in their menus.
      </p>
      <div className="rounded-lg border border-border bg-card overflow-hidden shadow-premium">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-sidebar" style={{ borderBottom: "1px solid var(--glass-border)" }}>
              <th className={`${thCls} w-10`}>#</th>
              <th className={thCls}>Store</th>
              <th className={thCls}>City</th>
              <th className={thCls}>Menu Size</th>
              <th className={thCls}>Platforms</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {rows.map((s, i) => (
              <tr key={s.id} className="hover:bg-accent/30 transition-colors">
                <td className="px-4 py-2 font-mono-data text-xs text-muted-foreground">
                  {i < 3 ? (
                    <Trophy className={`w-3.5 h-3.5 ${i === 0 ? "text-amber-400" : i === 1 ? "text-slate-400" : "text-amber-700"}`} />
                  ) : i + 1}
                </td>
                <td className="px-4 py-2 font-medium text-foreground">{s.name}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{s.city}</td>
                <td className="px-4 py-2 font-mono-data text-xs text-foreground font-medium">
                  {s.total_products.toLocaleString()}
                </td>
                <td className="px-4 py-2 font-mono-data text-xs text-muted-foreground">
                  {s.platform_count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Report 6: Brand Distribution ──────────────────────────────────────────────

function BrandDistribution() {
  const [all, setAll]       = useState<BrandRow[]>([]);
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
      const agg: Record<string, { stores: Set<string>; total: number }> = {};

      for (let i = 0; i < validIds.length; i += CHUNK) {
        const { data } = await supabase
          .from("menu_items")
          .select("raw_brand, dispensary_menu_id")
          .eq("is_on_menu", true)
          .not("raw_brand", "is", null)
          .in("dispensary_menu_id", validIds.slice(i, i + CHUNK));
        if (data) {
          for (const item of data) {
            const b = item.raw_brand;
            if (!b) continue;
            if (!agg[b]) agg[b] = { stores: new Set(), total: 0 };
            const storeId = menuToStore[item.dispensary_menu_id];
            if (storeId) agg[b].stores.add(storeId);
            agg[b].total++;
          }
        }
      }

      const rows: BrandRow[] = Object.entries(agg)
        .map(([brand, { stores, total }]) => ({
          brand, store_count: stores.size, total_products: total, avg_price: null,
        }))
        .sort((a, b) => b.store_count - a.store_count);

      setAll(rows);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <Skeleton />;

  // Distribution: how many brands appear in N stores
  const distBuckets: Record<string, number> = {
    "1 store": 0, "2–5 stores": 0, "6–15 stores": 0,
    "16–30 stores": 0, "31–50 stores": 0, "50+ stores": 0,
  };
  for (const b of all) {
    if (b.store_count === 1) distBuckets["1 store"]++;
    else if (b.store_count <= 5) distBuckets["2–5 stores"]++;
    else if (b.store_count <= 15) distBuckets["6–15 stores"]++;
    else if (b.store_count <= 30) distBuckets["16–30 stores"]++;
    else if (b.store_count <= 50) distBuckets["31–50 stores"]++;
    else distBuckets["50+ stores"]++;
  }
  const distData = Object.entries(distBuckets).map(([name, value]) => ({ name, value }));

  // Niche brands: many products but few stores (high products/store ratio)
  const nicheBrands = [...all]
    .filter(b => b.store_count >= 2 && b.store_count <= 8)
    .sort((a, b) => (b.total_products / b.store_count) - (a.total_products / a.store_count))
    .slice(0, 10);

  return (
    <div className="space-y-5">
      {/* Distribution chart */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-premium">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">
          Brand Reach Distribution
        </p>
        <p className="text-[11px] text-muted-foreground mb-4">
          {all.length.toLocaleString()} total brands · how many stores each brand appears in
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={distData} margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
              cursor={{ fill: "hsl(var(--accent) / 0.4)" }}
              formatter={(v) => [v, "Brands"]}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {distData.map((_, idx) => <Cell key={idx} fill={CAT_COLORS[idx % CAT_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Power brands: widest reach */}
        <div className="rounded-lg border border-border bg-card overflow-hidden shadow-premium">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Power Brands — Widest Reach</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sidebar" style={{ borderBottom: "1px solid var(--glass-border)" }}>
                <th className={`${thCls} w-8`}>#</th>
                <th className={thCls}>Brand</th>
                <th className={thCls}>Stores</th>
                <th className={thCls}>Products</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {all.slice(0, 15).map((b, i) => (
                <tr key={b.brand} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-2 text-xs font-mono-data text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-2 font-medium text-foreground text-xs">{b.brand}</td>
                  <td className="px-4 py-2 font-mono-data text-xs text-muted-foreground">{b.store_count}</td>
                  <td className="px-4 py-2 font-mono-data text-xs text-muted-foreground">{b.total_products.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Niche brands: high volume per store */}
        <div className="rounded-lg border border-border bg-card overflow-hidden shadow-premium">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Niche Brands — High Products/Store</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Present in 2–8 stores but stocking many SKUs</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sidebar" style={{ borderBottom: "1px solid var(--glass-border)" }}>
                <th className={thCls}>Brand</th>
                <th className={thCls}>Stores</th>
                <th className={thCls}>SKUs</th>
                <th className={thCls}>SKUs/Store</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {nicheBrands.map(b => (
                <tr key={b.brand} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-2 font-medium text-foreground text-xs">{b.brand}</td>
                  <td className="px-4 py-2 font-mono-data text-xs text-muted-foreground">{b.store_count}</td>
                  <td className="px-4 py-2 font-mono-data text-xs text-muted-foreground">{b.total_products.toLocaleString()}</td>
                  <td className="px-4 py-2 font-mono-data text-xs font-medium text-foreground">
                    {(b.total_products / b.store_count).toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Main Reports page ─────────────────────────────────────────────────────────

type Tab = { id: TabId; label: string; icon: React.ElementType };

const TABS: Tab[] = [
  { id: "brands",       label: "Brand Rankings",     icon: Tag       },
  { id: "categories",   label: "Category Breakdown",  icon: Package   },
  { id: "coverage",     label: "Coverage Summary",    icon: BarChart2 },
  { id: "prices",       label: "Price Intelligence",  icon: DollarSign },
  { id: "leaderboard",  label: "Store Leaderboard",   icon: Trophy    },
  { id: "distribution", label: "Brand Distribution",  icon: LayoutList },
];

export function Reports() {
  const [tab, setTab] = useState<TabId>("brands");
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
        <p className="text-sm text-muted-foreground mt-1">Market intelligence — data loads per tab</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-border overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => switchTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
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

      {/* Tab panels */}
      <div className={tab === "brands"       ? "" : "hidden"}>{visited.has("brands")       && <BrandReport />}</div>
      <div className={tab === "categories"   ? "" : "hidden"}>{visited.has("categories")   && <CategoryReport />}</div>
      <div className={tab === "coverage"     ? "" : "hidden"}>{visited.has("coverage")     && <CoverageReport />}</div>
      <div className={tab === "prices"       ? "" : "hidden"}>{visited.has("prices")       && <PriceReport />}</div>
      <div className={tab === "leaderboard"  ? "" : "hidden"}>{visited.has("leaderboard")  && <StoreLeaderboard />}</div>
      <div className={tab === "distribution" ? "" : "hidden"}>{visited.has("distribution") && <BrandDistribution />}</div>
    </div>
  );
}
