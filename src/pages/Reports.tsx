import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { BarChart2, Package, Tag } from "lucide-react";

interface BrandRow { raw_brand: string; count: number; store_count: number; }
interface CategoryRow { raw_category: string; count: number; avg_price: number | null; }
interface CoverageRow { city: string; total: number; with_menu: number; }

export function Reports() {
  const [tab, setTab] = useState<"brands" | "categories" | "coverage">("brands");
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [coverage, setCoverage] = useState<CoverageRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (tab === "brands" && brands.length === 0) loadBrands();
    if (tab === "categories" && categories.length === 0) loadCategories();
    if (tab === "coverage" && coverage.length === 0) loadCoverage();
  }, [tab]);

  async function loadBrands() {
    setLoading(true);
    const { data } = await supabase
      .from("menu_items")
      .select("raw_brand, dispensary_id")
      .eq("is_on_menu", true)
      .not("raw_brand", "is", null)
      .limit(50000);

    const brandMap: Record<string, Set<string>> = {};
    for (const item of data ?? []) {
      if (!item.raw_brand) continue;
      if (!brandMap[item.raw_brand]) brandMap[item.raw_brand] = new Set();
      brandMap[item.raw_brand].add(item.dispensary_id);
    }
    const rows = Object.entries(brandMap)
      .map(([raw_brand, stores]) => ({ raw_brand, count: stores.size, store_count: stores.size }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);
    setBrands(rows);
    setLoading(false);
  }

  async function loadCategories() {
    setLoading(true);
    const { data } = await supabase
      .from("menu_items")
      .select("raw_category, raw_price")
      .eq("is_on_menu", true)
      .not("raw_category", "is", null)
      .limit(50000);

    const catMap: Record<string, { count: number; prices: number[] }> = {};
    for (const item of data ?? []) {
      if (!item.raw_category) continue;
      if (!catMap[item.raw_category]) catMap[item.raw_category] = { count: 0, prices: [] };
      catMap[item.raw_category].count++;
      if (item.raw_price != null) catMap[item.raw_category].prices.push(item.raw_price);
    }
    const rows = Object.entries(catMap)
      .map(([raw_category, { count, prices }]) => ({
        raw_category,
        count,
        avg_price: prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : null,
      }))
      .sort((a, b) => b.count - a.count);
    setCategories(rows);
    setLoading(false);
  }

  async function loadCoverage() {
    setLoading(true);
    const [storesRes, menusRes] = await Promise.all([
      supabase.from("intel_stores").select("id, city").eq("status", "active"),
      supabase.from("dispensary_menus").select("intel_store_id").not("intel_store_id", "is", null),
    ]);
    const stores = storesRes.data ?? [];
    const withMenu = new Set((menusRes.data ?? []).map((m) => m.intel_store_id));

    const cityMap: Record<string, { total: number; with_menu: number }> = {};
    for (const s of stores) {
      const city = (s.city ?? "Unknown").toLowerCase();
      if (!cityMap[city]) cityMap[city] = { total: 0, with_menu: 0 };
      cityMap[city].total++;
      if (withMenu.has(s.id)) cityMap[city].with_menu++;
    }
    const rows = Object.entries(cityMap)
      .map(([city, { total, with_menu }]) => ({ city, total, with_menu }))
      .sort((a, b) => b.total - a.total);
    setCoverage(rows);
    setLoading(false);
  }

  const tabs = [
    { id: "brands" as const, label: "Top Brands", icon: Tag },
    { id: "categories" as const, label: "Categories", icon: Package },
    { id: "coverage" as const, label: "Coverage by City", icon: BarChart2 },
  ];

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Reports</h1>
        <p className="text-sm text-muted-foreground">Market intelligence and coverage analysis</p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading...</div>
      ) : tab === "brands" ? (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">#</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Brand</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stores Carrying</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {brands.map((b, i) => (
                <tr key={b.raw_brand} className="hover:bg-accent/30">
                  <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-2 font-medium text-foreground">{b.raw_brand}</td>
                  <td className="px-4 py-2 text-muted-foreground">{b.store_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : tab === "categories" ? (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Category</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Products</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Avg Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {categories.map((c) => (
                <tr key={c.raw_category} className="hover:bg-accent/30">
                  <td className="px-4 py-2 font-medium text-foreground">{c.raw_category}</td>
                  <td className="px-4 py-2 text-muted-foreground">{c.count.toLocaleString()}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {c.avg_price != null ? `$${c.avg_price.toFixed(2)}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">City</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stores</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">With Menu Data</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Coverage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {coverage.map((row) => {
                const pct = Math.round((row.with_menu / row.total) * 100);
                return (
                  <tr key={row.city} className="hover:bg-accent/30">
                    <td className="px-4 py-2 font-medium text-foreground capitalize">{row.city}</td>
                    <td className="px-4 py-2 text-muted-foreground">{row.total}</td>
                    <td className="px-4 py-2 text-muted-foreground">{row.with_menu}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
