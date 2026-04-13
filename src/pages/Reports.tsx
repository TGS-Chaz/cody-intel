import { useEffect, useState, lazy, Suspense } from "react";
import { supabase } from "@/lib/supabase";
import { isExcludedCategory, isExcludedBrand } from "@/lib/analytics-filters";
import { exportCSV } from "@/lib/export-csv";
import { BarChart2, Package, Tag, Wifi, Search, Trophy, DollarSign, LayoutList, Target, Download, Globe, Zap, Settings2 } from "lucide-react";
import { SaturationAnalysis } from "./reports/SaturationAnalysis";
import { SellThrough } from "./reports/SellThrough";
import { CustomReportBuilder } from "./reports/CustomReportBuilder";

const DistributionMap = lazy(() =>
  import("@/components/maps/DistributionMap").then((m) => ({ default: m.DistributionMap }))
);
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

type TabId = "brands" | "categories" | "coverage" | "prices" | "leaderboard" | "distribution" | "gap" | "saturation" | "velocity" | "custom" | "deals";

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
        if (!b || isExcludedBrand(b)) continue;
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
      <div className="flex items-center justify-between gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter brands…"
            className="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
        </div>
        <button
          onClick={() => exportCSV("brands.csv", filtered.map(r => ({ Brand: r.brand, Stores: r.store_count, Products: r.total_products, Avg_Price: r.avg_price?.toFixed(2) ?? "" })))}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
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
        if (!cat || isExcludedCategory(cat)) continue;
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
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Products by Category</p>
          <button
            onClick={() => exportCSV("categories.csv", rows.map(r => ({ Category: r.category, Products: r.product_count, Stores: r.store_count, Avg_Price: r.avg_price?.toFixed(2) ?? "" })))}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
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

interface BrandPriceRow {
  brand: string;
  category: string;
  avgPrice: number;
  vsMarket: number;
  storeCount: number;
  isOwn: boolean;
}

interface StoreMenuItem {
  raw_name: string | null;
  raw_brand: string | null;
  raw_category: string | null;
  raw_price: number | null;
}

interface PriceStore {
  id: string;
  name: string;
  city: string;
  crm_contact_id: string;
}

function PriceReport() {
  const [rows, setRows]               = useState<PriceRow[]>([]);
  const [loading, setLoading]         = useState(true);

  // Market positioning state
  const [ownBrandNames, setOwnBrandNames]     = useState<Set<string>>(new Set());
  const [brandPriceRows, setBrandPriceRows]   = useState<BrandPriceRow[]>([]);
  const [marketAvgByCategory, setMarketAvgByCategory] = useState<Record<string, number>>({});

  // Store comparison state
  const [stores, setStores]               = useState<PriceStore[]>([]);
  const [storeSearch, setStoreSearch]     = useState("");
  const [storeDropdownOpen, setStoreDropdownOpen] = useState(false);
  const [selectedStore, setSelectedStore] = useState<PriceStore | null>(null);
  const [storeItems, setStoreItems]       = useState<StoreMenuItem[]>([]);
  const [storeLoading, setStoreLoading]   = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);

      // Load own brands + store list in parallel with menus
      const [menusRes, userBrandsRes, storesRes] = await Promise.all([
        supabase.from("dispensary_menus").select("id, intel_store_id").not("intel_store_id", "is", null),
        supabase.from("user_brands").select("brand_name").eq("is_own_brand", true),
        supabase.from("intel_stores").select("id, name, city, crm_contact_id")
          .not("crm_contact_id", "is", null)
          .order("name")
          .limit(300),
      ]);

      const menus = menusRes.data ?? [];
      let ownNamesArr = (userBrandsRes.data ?? []).map((b: any) => b.brand_name.toLowerCase());
      // Fallback: if user hasn't configured user_brands, use market_brands flags
      if (!ownNamesArr.length) {
        const { data: mktOwn } = await supabase.from("market_brands").select("name").eq("is_own_brand", true);
        ownNamesArr = (mktOwn ?? []).map((b: any) => b.name.toLowerCase());
      }
      const ownNames = new Set(ownNamesArr);
      setOwnBrandNames(ownNames);
      setStores(storesRes.data ?? []);

      if (!menus.length) { setLoading(false); return; }

      const validIds = menus.map(m => m.id);
      const menuToStore: Record<string, string> = {};
      for (const m of menus) menuToStore[m.id] = m.intel_store_id;

      const CHUNK = 400;
      const catAgg: Record<string, { prices: number[] }> = {};
      // For brand price table: brand+category → { prices, stores }
      const brandCatAgg: Record<string, { prices: number[]; stores: Set<string>; isOwn: boolean }> = {};

      for (let i = 0; i < validIds.length; i += CHUNK) {
        const { data } = await supabase
          .from("menu_items")
          .select("raw_category, raw_price, raw_brand, dispensary_menu_id")
          .eq("is_on_menu", true)
          .not("raw_category", "is", null)
          .not("raw_price", "is", null)
          .gt("raw_price", 0)
          .in("dispensary_menu_id", validIds.slice(i, i + CHUNK));
        if (data) {
          for (const item of data) {
            const cat = item.raw_category;
            const brand = item.raw_brand;
            if (!cat || item.raw_price == null || isExcludedCategory(cat)) continue;
            if (brand && isExcludedBrand(brand)) continue;

            // Category aggregation (existing)
            if (!catAgg[cat]) catAgg[cat] = { prices: [] };
            catAgg[cat].prices.push(item.raw_price);

            // Brand+category aggregation (new)
            if (brand) {
              const key = `${brand}|||${cat}`;
              if (!brandCatAgg[key]) {
                brandCatAgg[key] = {
                  prices: [],
                  stores: new Set(),
                  isOwn: ownNames.has(brand.toLowerCase()),
                };
              }
              brandCatAgg[key].prices.push(item.raw_price);
              const storeId = menuToStore[item.dispensary_menu_id];
              if (storeId) brandCatAgg[key].stores.add(storeId);
            }
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

      const mktAvg: Record<string, number> = {};
      for (const r of sorted) mktAvg[r.category] = r.avg;
      setMarketAvgByCategory(mktAvg);

      // Build brand price rows — only show own brands + a sample of others (top 5 per category)
      const allBrandRows: BrandPriceRow[] = Object.entries(brandCatAgg)
        .filter(([, { prices }]) => prices.length >= 3)
        .map(([key, { prices, stores, isOwn }]) => {
          const [brand, category] = key.split("|||");
          const avgPrice = prices.reduce((s, v) => s + v, 0) / prices.length;
          const mkt = mktAvg[category] ?? 0;
          return { brand, category, avgPrice, vsMarket: avgPrice - mkt, storeCount: stores.size, isOwn };
        });

      // Keep all own brand rows + filter to make the table manageable
      const ownRows = allBrandRows.filter(r => r.isOwn);
      const categoriesWithOwn = new Set(ownRows.map(r => r.category));

      // For categories where we have own brands, show top competitors too
      const topCompRows = allBrandRows
        .filter(r => !r.isOwn && categoriesWithOwn.has(r.category))
        .sort((a, b) => b.storeCount - a.storeCount)
        .slice(0, 40);

      const combined = [...ownRows, ...topCompRows]
        .sort((a, b) => a.category.localeCompare(b.category) || (b.isOwn ? 1 : 0) - (a.isOwn ? 1 : 0));

      setBrandPriceRows(combined);
      setLoading(false);
    }
    load();
  }, []);

  // Load store items when a store is selected
  useEffect(() => {
    if (!selectedStore) return;
    async function loadStore() {
      setStoreLoading(true);
      setStoreItems([]);
      const { data } = await supabase
        .from("menu_items")
        .select("raw_name, raw_brand, raw_category, raw_price")
        .eq("dispensary_id", selectedStore!.crm_contact_id)
        .eq("is_on_menu", true)
        .gt("raw_price", 0)
        .limit(2000);
      if (data) {
        const filtered = data.filter(item =>
          item.raw_category && !isExcludedCategory(item.raw_category) &&
          (!item.raw_brand || !isExcludedBrand(item.raw_brand))
        );
        setStoreItems(filtered);
      }
      setStoreLoading(false);
    }
    loadStore();
  }, [selectedStore]);

  if (loading) return <Skeleton rows={8} />;

  const chartData = rows.slice(0, 12).map(r => ({
    name: r.category.length > 14 ? r.category.slice(0, 14) + "…" : r.category,
    avg: parseFloat(r.avg.toFixed(2)),
  }));

  // Market positioning: categories where own brands have data
  const ownCategoryPositioning: { category: string; ownAvg: number; mktAvg: number; diff: number }[] = [];
  const ownRowsByCategory: Record<string, BrandPriceRow[]> = {};
  for (const r of brandPriceRows) {
    if (r.isOwn) {
      if (!ownRowsByCategory[r.category]) ownRowsByCategory[r.category] = [];
      ownRowsByCategory[r.category].push(r);
    }
  }
  for (const [cat, catRows] of Object.entries(ownRowsByCategory)) {
    const ownAvg = catRows.reduce((s, r) => s + r.avgPrice, 0) / catRows.length;
    const mktAvg = marketAvgByCategory[cat] ?? 0;
    ownCategoryPositioning.push({ category: cat, ownAvg, mktAvg, diff: ownAvg - mktAvg });
  }
  ownCategoryPositioning.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  // Store comparison
  const filteredStores = storeSearch
    ? stores.filter(s => s.name.toLowerCase().includes(storeSearch.toLowerCase()) || s.city.toLowerCase().includes(storeSearch.toLowerCase()))
    : stores;

  const ownStoreItems   = storeItems.filter(item => item.raw_brand && ownBrandNames.has(item.raw_brand.toLowerCase()));
  const compStoreItems  = storeItems.filter(item => !item.raw_brand || !ownBrandNames.has(item.raw_brand.toLowerCase()));
  const ownStoreAvg     = ownStoreItems.length ? ownStoreItems.reduce((s, i) => s + (i.raw_price ?? 0), 0) / ownStoreItems.length : null;
  const compStoreAvg    = compStoreItems.length ? compStoreItems.reduce((s, i) => s + (i.raw_price ?? 0), 0) / compStoreItems.length : null;
  const storeAvgDiff    = ownStoreAvg != null && compStoreAvg != null ? ownStoreAvg - compStoreAvg : null;

  return (
    <div className="space-y-5">
      {/* ── Section 0: Market Positioning Summary ── */}
      {ownCategoryPositioning.length > 0 && (
        <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Your Avg Price vs. Market — by Category</p>
          <div className="flex flex-wrap gap-2">
            {ownCategoryPositioning.map(({ category, ownAvg, mktAvg, diff }) => {
              const absDiff = Math.abs(diff);
              const label = absDiff < 0.05
                ? "At market"
                : diff > 0
                  ? `Above market $${absDiff.toFixed(2)}`
                  : `Below market $${absDiff.toFixed(2)}`;
              const badgeStyle: React.CSSProperties = absDiff < 0.05
                ? { background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }
                : diff > 0
                  ? { background: "hsl(0 80% 60% / 0.12)", color: "hsl(0 72% 55%)", border: "1px solid hsl(0 72% 55% / 0.25)" }
                  : { background: "hsl(142 70% 45% / 0.12)", color: "hsl(142 65% 40%)", border: "1px solid hsl(142 65% 40% / 0.25)" };
              return (
                <div key={category} className="flex flex-col items-start gap-0.5 rounded-lg border border-border bg-card px-3 py-2 min-w-[160px]">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">{category}</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-bold font-mono-data text-primary">${ownAvg.toFixed(2)}</span>
                    <span className="text-[10px] text-muted-foreground">vs ${mktAvg.toFixed(2)} mkt</span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={badgeStyle}>{label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Section 1: Bar chart: avg price by category ── */}
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

      {/* ── Section 2: Detail table ── */}
      <div className="rounded-lg border border-border bg-card overflow-hidden shadow-premium">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Price by Category</p>
          <button
            onClick={() => exportCSV("price-intelligence.csv", rows.map(r => ({ Category: r.category, Avg: r.avg.toFixed(2), Min: r.min.toFixed(2), Max: r.max.toFixed(2), Count: r.count })))}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
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

      {/* ── Section 3: Price comparison table by brand ── */}
      {brandPriceRows.length > 0 && (
        <div className="rounded-xl border border-border bg-card/60 overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Price Comparison by Brand</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Your brands vs. market — sorted by category</p>
          </div>
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-sidebar">
                <tr style={{ borderBottom: "1px solid var(--glass-border)" }}>
                  <th className={thCls}>Brand</th>
                  <th className={thCls}>Category</th>
                  <th className={thCls}>Avg Price</th>
                  <th className={thCls}>vs. Market</th>
                  <th className={thCls}>Stores</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {brandPriceRows.map((r, i) => {
                  const absDiff = Math.abs(r.vsMarket);
                  const vsLabel = absDiff < 0.05 ? "At market" : r.vsMarket > 0 ? `+$${absDiff.toFixed(2)}` : `-$${absDiff.toFixed(2)}`;
                  const vsColor = absDiff < 0.05 ? "text-muted-foreground" : r.vsMarket > 0 ? "text-red-400" : "text-emerald-500";
                  return (
                    <tr
                      key={`${r.brand}-${r.category}-${i}`}
                      className="hover:bg-accent/30 transition-colors"
                      style={r.isOwn ? { background: "hsl(168 100% 42% / 0.05)" } : undefined}
                    >
                      <td className="px-4 py-2 font-medium text-sm" style={r.isOwn ? { color: "hsl(var(--primary))" } : { color: "hsl(var(--foreground))" }}>
                        {r.brand}
                        {r.isOwn && <span className="ml-1.5 text-[9px] font-bold uppercase tracking-widest opacity-70">Yours</span>}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{r.category}</td>
                      <td className="px-4 py-2 font-mono-data text-xs font-medium text-foreground">${r.avgPrice.toFixed(2)}</td>
                      <td className={`px-4 py-2 font-mono-data text-xs font-medium ${vsColor}`}>{vsLabel}</td>
                      <td className="px-4 py-2 font-mono-data text-xs text-muted-foreground">{r.storeCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Section 4: Store-level price comparison ── */}
      <div className="rounded-xl border border-border bg-card/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Store-Level Price Comparison</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Select a store to compare your products vs. competitors on their menu</p>
        </div>
        <div className="p-4 space-y-4">
          {/* Store search/select */}
          <div className="relative max-w-sm">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest block mb-1">Select Store</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                value={selectedStore ? selectedStore.name : storeSearch}
                onChange={e => {
                  setStoreSearch(e.target.value);
                  setSelectedStore(null);
                  setStoreDropdownOpen(true);
                }}
                onFocus={() => setStoreDropdownOpen(true)}
                onBlur={() => setTimeout(() => setStoreDropdownOpen(false), 150)}
                placeholder="Search stores…"
                className="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            {storeDropdownOpen && filteredStores.length > 0 && !selectedStore && (
              <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-md border border-border bg-card shadow-lg">
                {filteredStores.slice(0, 40).map(s => (
                  <button
                    key={s.id}
                    onMouseDown={() => { setSelectedStore(s); setStoreSearch(""); setStoreDropdownOpen(false); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent/40 transition-colors"
                  >
                    <span className="font-medium text-foreground">{s.name}</span>
                    <span className="ml-2 text-[11px] text-muted-foreground">{s.city}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Store comparison results */}
          {selectedStore && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground">
                  At <span className="text-primary">{selectedStore.name}</span>
                  <span className="text-muted-foreground font-normal"> — your products vs. competitors</span>
                </p>
                {storeLoading && <span className="text-xs text-muted-foreground animate-pulse">Loading…</span>}
              </div>

              {!storeLoading && storeItems.length === 0 && (
                <p className="text-sm text-muted-foreground">No menu data found for this store.</p>
              )}

              {!storeLoading && storeItems.length > 0 && (
                <>
                  {/* Summary bar */}
                  <div className="flex flex-wrap gap-3 text-xs font-mono-data">
                    {ownStoreAvg != null && (
                      <span className="text-primary font-medium">Your avg: ${ownStoreAvg.toFixed(2)} ({ownStoreItems.length} items)</span>
                    )}
                    {compStoreAvg != null && (
                      <span className="text-muted-foreground">Competitor avg: ${compStoreAvg.toFixed(2)} ({compStoreItems.length} items)</span>
                    )}
                    {storeAvgDiff != null && (
                      <span className={Math.abs(storeAvgDiff) < 0.05 ? "text-muted-foreground" : storeAvgDiff > 0 ? "text-red-400" : "text-emerald-500"}>
                        You are ${Math.abs(storeAvgDiff).toFixed(2)} {storeAvgDiff > 0 ? "above" : storeAvgDiff < 0 ? "below" : "at"} competitor avg
                      </span>
                    )}
                  </div>

                  {/* Two-column layout */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Our products */}
                    <div className="rounded-lg border border-primary/30 overflow-hidden" style={{ background: "hsl(168 100% 42% / 0.03)" }}>
                      <div className="px-3 py-2 border-b border-primary/20 flex items-center justify-between">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Our Products ({ownStoreItems.length})</p>
                        {ownStoreAvg != null && <span className="text-[10px] font-mono-data text-primary">avg ${ownStoreAvg.toFixed(2)}</span>}
                      </div>
                      {ownStoreItems.length === 0 ? (
                        <p className="px-3 py-4 text-xs text-muted-foreground">None found on this menu.</p>
                      ) : (
                        <div className="max-h-72 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-card">
                              <tr style={{ borderBottom: "1px solid var(--glass-border)" }}>
                                <th className="text-left px-3 py-1.5 text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">Product</th>
                                <th className="text-left px-3 py-1.5 text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">Category</th>
                                <th className="text-left px-3 py-1.5 text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">Price</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/30">
                              {ownStoreItems.slice(0, 100).map((item, i) => (
                                <tr key={i} className="hover:bg-primary/5 transition-colors">
                                  <td className="px-3 py-1.5 text-foreground font-medium truncate max-w-[140px]">{item.raw_name ?? "—"}</td>
                                  <td className="px-3 py-1.5 text-muted-foreground">{item.raw_category ?? "—"}</td>
                                  <td className="px-3 py-1.5 font-mono-data text-primary">${(item.raw_price ?? 0).toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Competitor products */}
                    <div className="rounded-lg border border-border overflow-hidden">
                      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Competitor Products ({compStoreItems.length})</p>
                        {compStoreAvg != null && <span className="text-[10px] font-mono-data text-muted-foreground">avg ${compStoreAvg.toFixed(2)}</span>}
                      </div>
                      {compStoreItems.length === 0 ? (
                        <p className="px-3 py-4 text-xs text-muted-foreground">None found on this menu.</p>
                      ) : (
                        <div className="max-h-72 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-card">
                              <tr style={{ borderBottom: "1px solid var(--glass-border)" }}>
                                <th className="text-left px-3 py-1.5 text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">Product</th>
                                <th className="text-left px-3 py-1.5 text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">Category</th>
                                <th className="text-left px-3 py-1.5 text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">Price</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/30">
                              {compStoreItems.slice(0, 100).map((item, i) => (
                                <tr key={i} className="hover:bg-accent/30 transition-colors">
                                  <td className="px-3 py-1.5 text-foreground font-medium truncate max-w-[140px]">{item.raw_name ?? "—"}</td>
                                  <td className="px-3 py-1.5 text-muted-foreground">{item.raw_category ?? "—"}</td>
                                  <td className="px-3 py-1.5 font-mono-data text-foreground">${(item.raw_price ?? 0).toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
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
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Top 50 stores ranked by total products in their menus.
        </p>
        <button
          onClick={() => exportCSV("store-leaderboard.csv", rows.map(r => ({ Store: r.name, City: r.city, Products: r.total_products, Platforms: r.platform_count })))}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>
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
  const [mapOwn,  setMapOwn]  = useState("");
  const [mapComp, setMapComp] = useState("");

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
            if (!b || isExcludedBrand(b)) continue;
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
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Power Brands — Widest Reach</p>
            <button
              onClick={() => exportCSV("brand-distribution.csv", all.slice(0, 15).map(r => ({ Brand: r.brand, Stores: r.store_count, Products: r.total_products, Avg_Price: r.avg_price?.toFixed(2) ?? "" })))}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
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
      {/* Distribution Map */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-premium space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          Geographic Distribution Map
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={mapOwn}
            onChange={(e) => setMapOwn(e.target.value)}
            className="px-2.5 py-1.5 rounded-md border border-border bg-card text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-[180px]"
          >
            <option value="">— Own brand —</option>
            {all.slice(0, 60).map((b) => (
              <option key={b.brand} value={b.brand}>{b.brand}</option>
            ))}
          </select>
          <select
            value={mapComp}
            onChange={(e) => setMapComp(e.target.value)}
            className="px-2.5 py-1.5 rounded-md border border-border bg-card text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-[180px]"
          >
            <option value="">— Competitor (optional) —</option>
            {all.slice(0, 60).map((b) => (
              <option key={b.brand} value={b.brand}>{b.brand}</option>
            ))}
          </select>
        </div>
        <Suspense fallback={
          <div className="h-[400px] rounded-xl border border-border bg-card/50 flex items-center justify-center">
            <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        }>
          <DistributionMap ownBrand={mapOwn} competitorBrand={mapComp} />
        </Suspense>
      </div>
    </div>
  );
}

// ── Report 7: Gap Analysis ────────────────────────────────────────────────────

interface GapBrand { id: string; name: string; }
interface GapStore { id: string; name: string; city: string; crm_contact_id: string; }

function GapAnalysis() {
  const [ownBrands, setOwnBrands]           = useState<GapBrand[]>([]);
  const [competitorBrands, setCompetitorBrands] = useState<GapBrand[]>([]);
  const [storeMap, setStoreMap]             = useState<Map<string, Set<string>>>(new Map());
  const [stores, setStores]                 = useState<GapStore[]>([]);
  const [loading, setLoading]               = useState(true);
  const [selectedOwn, setSelectedOwn]       = useState<string>("all");
  const [selectedComp, setSelectedComp]     = useState<string>("");

  useEffect(() => {
    async function load() {
      setLoading(true);

      // Load own brands from user_brands (primary), fall back to market_brands
      const { data: userOwnBrands } = await supabase
        .from("user_brands")
        .select("id, brand_name")
        .eq("is_own_brand", true);

      const { data: userCompetitorBrands } = await supabase
        .from("user_brands")
        .select("id, brand_name")
        .eq("is_own_brand", false);

      // Fallback: if user_brands is empty, use market_brands flags
      let ownBrandNames: string[] = (userOwnBrands ?? []).map((b: any) => b.brand_name);
      let competitorBrandNames: string[] = (userCompetitorBrands ?? []).map((b: any) => b.brand_name);

      if (!ownBrandNames.length) {
        const { data: mktOwn } = await supabase.from("market_brands").select("name").eq("is_own_brand", true);
        ownBrandNames = (mktOwn ?? []).map((b: any) => b.name);
      }
      if (!competitorBrandNames.length) {
        const { data: mktComp } = await supabase.from("market_brands").select("name").eq("is_competitor_brand", true);
        competitorBrandNames = (mktComp ?? []).map((b: any) => b.name);
      }

      const { data: storeData } = await supabase
        .from("intel_stores")
        .select("id, name, city, crm_contact_id")
        .not("crm_contact_id", "is", null)
        .limit(500);

      const storeList: GapStore[] = storeData ?? [];

      // Convert name arrays to GapBrand[] with synthetic ids (index-based)
      const ownList: GapBrand[] = ownBrandNames.map((name, i) => ({ id: String(i), name }));
      const compList: GapBrand[] = competitorBrandNames.map((name, i) => ({ id: String(i), name }));

      setOwnBrands(ownList);
      setCompetitorBrands(compList);
      setStores(storeList);
      if (compList.length > 0) setSelectedComp(compList[0].id);

      // Fetch menu_items in chunks of 5000
      const map = new Map<string, Set<string>>();
      const CHUNK = 5000;
      let offset = 0;
      while (true) {
        const { data } = await supabase
          .from("menu_items")
          .select("dispensary_id, raw_brand")
          .eq("is_on_menu", true)
          .not("raw_brand", "is", null)
          .range(offset, offset + CHUNK - 1);
        if (!data || data.length === 0) break;
        for (const item of data) {
          if (!item.dispensary_id || !item.raw_brand) continue;
          if (!map.has(item.dispensary_id)) map.set(item.dispensary_id, new Set());
          map.get(item.dispensary_id)!.add(item.raw_brand.toLowerCase());
        }
        if (data.length < CHUNK) break;
        offset += CHUNK;
      }
      setStoreMap(map);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <Skeleton rows={12} />;

  if (ownBrands.length === 0 || competitorBrands.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card/60 p-10 text-center space-y-2">
        <Target className="w-8 h-8 text-muted-foreground mx-auto" />
        <p className="text-sm font-medium text-foreground">No brands configured</p>
        <p className="text-xs text-muted-foreground">
          Go to <span className="text-primary font-medium">Settings → Brands</span> to add your brands and competitor brands.
        </p>
      </div>
    );
  }

  // Resolve selected own brand names (lowercased)
  const ownNames: Set<string> = selectedOwn === "all"
    ? new Set(ownBrands.map(b => b.name.toLowerCase()))
    : new Set([ownBrands.find(b => b.id === selectedOwn)?.name.toLowerCase() ?? ""]);

  const compBrand = competitorBrands.find(b => b.id === selectedComp);
  const compName  = compBrand?.name.toLowerCase() ?? "";

  const gapStores: GapStore[]        = [];
  const whiteSpaceStores: GapStore[] = [];
  const exclusiveStores: GapStore[]  = [];
  const competitiveStores: GapStore[] = [];

  // Also track counts for summary
  const gapCompCounts: Record<string, number>   = {};
  const exclOwnCounts: Record<string, number>   = {};
  const compOwnCounts: Record<string, number>   = {};
  const compTheirCounts: Record<string, number> = {};

  for (const store of stores) {
    const brands = storeMap.get(store.id) ?? new Set<string>();
    const hasOwn  = [...ownNames].some(n => brands.has(n));
    const hasComp = brands.has(compName);

    if (hasComp && !hasOwn) {
      gapStores.push(store);
      // count competitor products (approximate: all comp brand items)
      gapCompCounts[store.id] = [...brands].filter(b => b === compName).length;
    } else if (!hasOwn && !hasComp) {
      whiteSpaceStores.push(store);
    } else if (hasOwn && !hasComp) {
      exclusiveStores.push(store);
      exclOwnCounts[store.id] = [...brands].filter(b => ownNames.has(b)).length;
    } else if (hasOwn && hasComp) {
      competitiveStores.push(store);
      compOwnCounts[store.id]   = [...brands].filter(b => ownNames.has(b)).length;
      compTheirCounts[store.id] = [...brands].filter(b => b === compName).length;
    }
  }

  const summaryCards = [
    { label: "Gap Stores",        count: gapStores.length,         color: "#F59E0B", desc: "Carry competitor, not us" },
    { label: "White Space",       count: whiteSpaceStores.length,  color: "hsl(217 91% 60%)", desc: "Carry neither" },
    { label: "Exclusive Stores",  count: exclusiveStores.length,   color: "#10B981", desc: "Only our brand present" },
    { label: "Competitive",       count: competitiveStores.length, color: "#A855F7", desc: "Both brands present" },
  ];

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">My Brand</label>
          <select
            value={selectedOwn}
            onChange={e => setSelectedOwn(e.target.value)}
            className="px-3 py-1.5 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="all">All My Brands</option>
            {ownBrands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Competitor Brand</label>
          <select
            value={selectedComp}
            onChange={e => setSelectedComp(e.target.value)}
            className="px-3 py-1.5 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {competitorBrands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {summaryCards.map(s => (
          <div key={s.label} className="rounded-xl border border-border bg-card/60 p-4 text-center" style={{ borderTop: `3px solid ${s.color}` }}>
            <p className="text-2xl font-bold font-mono-data" style={{ color: s.color }}>{s.count}</p>
            <p className="text-xs font-semibold text-foreground mt-0.5">{s.label}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{s.desc}</p>
          </div>
        ))}
      </div>

      {/* Gap Stores */}
      <div className="rounded-xl border border-border bg-card/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
          <p className="text-xs font-semibold text-foreground uppercase tracking-widest">Gap Stores — Sales Targets ({gapStores.length})</p>
        </div>
        {gapStores.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">No gap stores found.</p>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-sidebar">
                <tr style={{ borderBottom: "1px solid var(--glass-border)" }}>
                  <th className={thCls}>Store Name</th>
                  <th className={thCls}>City</th>
                  <th className={thCls}>Competitor Products</th>
                </tr>
              </thead>
              <tbody>
                {gapStores.map(s => (
                  <tr key={s.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-2 font-medium text-foreground text-xs">{s.name}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{s.city}</td>
                    <td className="px-4 py-2 font-mono-data text-xs text-amber-500">{compBrand?.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* White Space */}
      <div className="rounded-xl border border-border bg-card/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "hsl(217 91% 60%)" }} />
          <p className="text-xs font-semibold text-foreground uppercase tracking-widest">White Space — Untouched Stores ({whiteSpaceStores.length})</p>
        </div>
        {whiteSpaceStores.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">No white space stores found.</p>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-sidebar">
                <tr style={{ borderBottom: "1px solid var(--glass-border)" }}>
                  <th className={thCls}>Store Name</th>
                  <th className={thCls}>City</th>
                  <th className={thCls}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {whiteSpaceStores.map(s => (
                  <tr key={s.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-2 font-medium text-foreground text-xs">{s.name}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{s.city}</td>
                    <td className="px-4 py-2 text-[10px] text-muted-foreground">No tracked brands on menu</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Exclusive Stores */}
      <div className="rounded-xl border border-border bg-card/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          <p className="text-xs font-semibold text-foreground uppercase tracking-widest">Exclusive Stores — Protect These ({exclusiveStores.length})</p>
        </div>
        {exclusiveStores.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">No exclusive stores found.</p>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-sidebar">
                <tr style={{ borderBottom: "1px solid var(--glass-border)" }}>
                  <th className={thCls}>Store Name</th>
                  <th className={thCls}>City</th>
                  <th className={thCls}>Our Products</th>
                </tr>
              </thead>
              <tbody>
                {exclusiveStores.map(s => (
                  <tr key={s.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-2 font-medium text-foreground text-xs">{s.name}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{s.city}</td>
                    <td className="px-4 py-2 font-mono-data text-xs text-emerald-500">{exclOwnCounts[s.id] ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Competitive Stores */}
      <div className="rounded-xl border border-border bg-card/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
          <p className="text-xs font-semibold text-foreground uppercase tracking-widest">Competitive Stores — Both Present ({competitiveStores.length})</p>
        </div>
        {competitiveStores.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">No competitive stores found.</p>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-sidebar">
                <tr style={{ borderBottom: "1px solid var(--glass-border)" }}>
                  <th className={thCls}>Store Name</th>
                  <th className={thCls}>City</th>
                  <th className={thCls}>Our Count</th>
                  <th className={thCls}>Their Count</th>
                </tr>
              </thead>
              <tbody>
                {competitiveStores.map(s => (
                  <tr key={s.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-2 font-medium text-foreground text-xs">{s.name}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{s.city}</td>
                    <td className="px-4 py-2 font-mono-data text-xs text-emerald-500">{compOwnCounts[s.id] ?? "—"}</td>
                    <td className="px-4 py-2 font-mono-data text-xs text-purple-400">{compTheirCounts[s.id] ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Deals Report ─────────────────────────────────────────────────────────────

function DealsReport() {
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: dealsData } = await supabase
        .from("store_deals")
        .select("*, intel_store:intel_store_id(name, city)")
        .order("scraped_at", { ascending: false })
        .limit(100);
      setDeals((dealsData ?? []) as any[]);
      setLoading(false);
    }
    load();
  }, []);

  const [priceAlerts, setPriceAlerts] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("intel_alerts")
      .select("*")
      .eq("alert_type", "price_change")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setPriceAlerts((data ?? []) as any[]));
  }, []);

  return (
    <div className="space-y-6">
      {/* Coming soon banner */}
      <div
        className="rounded-xl border p-5 flex items-start gap-3"
        style={{ background: "hsl(168 100% 42% / 0.05)", borderColor: "hsl(168 100% 42% / 0.2)" }}
      >
        <Tag className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-foreground">Deal Scraping — Active Tracking</p>
          <p className="text-xs text-muted-foreground mt-1">
            Deal data is extracted automatically during each menu scrape. Promotions from Dutchie menus
            appear here within 24 hours. Currently using price change alerts as real-time proxy.
          </p>
        </div>
      </div>

      {/* Price change alerts as deal proxy */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-1">Recent Price Changes</h2>
        <div className="header-underline mb-3" />
        <p className="text-xs text-muted-foreground mb-3">
          Products where price moved ≥10% — potential promotions or price adjustments
        </p>
        {loading ? (
          <Skeleton rows={6} />
        ) : priceAlerts.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            No significant price changes detected in recent data.
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-sidebar">
                  <th className={thCls}>Product</th>
                  <th className={thCls}>Brand</th>
                  <th className={thCls}>Change</th>
                  <th className={thCls}>When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {priceAlerts.map((a) => {
                  const det = (a.details ?? {}) as Record<string, any>;
                  const pct = det.pct_change as number | undefined;
                  const isDown = (pct ?? 0) < 0;
                  return (
                    <tr key={a.id} className="hover:bg-accent/20">
                      <td className="px-4 py-2.5 font-medium text-foreground">
                        {a.product_name ?? det.product ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{a.brand_name ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <span className={`font-semibold ${isDown ? "text-green-500" : "text-red-400"}`}>
                          {pct != null ? `${pct > 0 ? "+" : ""}${pct}%` : "—"}
                          {det.old_price != null && det.new_price != null && (
                            <span className="text-muted-foreground font-normal ml-1.5">
                              ${Number(det.old_price).toFixed(2)} → ${Number(det.new_price).toFixed(2)}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {new Date(a.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Actual deals section — only shown when data exists */}
      {deals.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-1">Active Promotions</h2>
          <div className="header-underline mb-3" />
          <div className="space-y-2">
            {deals.map((d) => (
              <div key={d.id} className="rounded-lg border border-border bg-card p-4 flex items-start gap-3">
                <Tag className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{d.product_name ?? d.brand_name}</p>
                  <p className="text-xs text-muted-foreground">{d.deal_description}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-green-500">
                    {d.discount_pct ? `-${d.discount_pct}%` : `$${d.deal_price}`}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{d.intel_store?.name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-center py-6">
        <p className="text-xs text-muted-foreground">
          Deals are scraped automatically from Dutchie and Leafly menus during each scheduled run.
        </p>
      </div>
    </div>
  );
}

// ── Main Reports page ─────────────────────────────────────────────────────────


const TAB_GROUPS = [
  {
    label: "Market Intelligence",
    tabs: [
      { id: "brands"       as TabId, label: "Brands",       icon: Tag        },
      { id: "categories"   as TabId, label: "Categories",   icon: Package    },
      { id: "coverage"     as TabId, label: "Coverage",     icon: BarChart2  },
      { id: "prices"       as TabId, label: "Prices",       icon: DollarSign },
      { id: "leaderboard"  as TabId, label: "Leaderboard",  icon: Trophy     },
      { id: "distribution" as TabId, label: "Distribution", icon: LayoutList },
      { id: "gap"          as TabId, label: "Gap Analysis",  icon: Target     },
    ],
  },
  {
    label: "Advanced",
    tabs: [
      { id: "saturation" as TabId, label: "Market Saturation", icon: Globe     },
      { id: "velocity"   as TabId, label: "Sell-Through",      icon: Zap       },
      { id: "custom"     as TabId, label: "Report Builder",    icon: Settings2 },
      { id: "deals"      as TabId, label: "Deals",             icon: Tag       },
    ],
  },
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

      {/* Tab bar — two rows so all 10 tabs are always visible */}
      <div className="space-y-0">
        {TAB_GROUPS.map((group, gi) => (
          <div key={gi}>
            <div className="flex items-center gap-0 border-b border-border overflow-x-auto">
              <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/50 px-2 shrink-0 hidden sm:block">
                {group.label}
              </span>
              {gi > 0 && <div className="w-px h-4 bg-border mx-1 shrink-0 hidden sm:block" />}
              {group.tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => switchTab(id)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
                    tab === id
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                >
                  <Icon className="w-3 h-3 shrink-0" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Tab panels */}
      <div className={tab === "brands"       ? "" : "hidden"}>{visited.has("brands")       && <BrandReport />}</div>
      <div className={tab === "categories"   ? "" : "hidden"}>{visited.has("categories")   && <CategoryReport />}</div>
      <div className={tab === "coverage"     ? "" : "hidden"}>{visited.has("coverage")     && <CoverageReport />}</div>
      <div className={tab === "prices"       ? "" : "hidden"}>{visited.has("prices")       && <PriceReport />}</div>
      <div className={tab === "leaderboard"  ? "" : "hidden"}>{visited.has("leaderboard")  && <StoreLeaderboard />}</div>
      <div className={tab === "distribution" ? "" : "hidden"}>{visited.has("distribution") && <BrandDistribution />}</div>
      <div className={tab === "gap"          ? "" : "hidden"}>{visited.has("gap")          && <GapAnalysis />}</div>
      <div className={tab === "saturation"   ? "" : "hidden"}>{visited.has("saturation")   && <SaturationAnalysis />}</div>
      <div className={tab === "velocity"     ? "" : "hidden"}>{visited.has("velocity")     && <SellThrough />}</div>
      <div className={tab === "custom"       ? "" : "hidden"}>{visited.has("custom")       && <CustomReportBuilder />}</div>
      <div className={tab === "deals"        ? "" : "hidden"}>{visited.has("deals")        && <DealsReport />}</div>
    </div>
  );
}
