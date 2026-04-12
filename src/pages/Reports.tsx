import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BarChart2, Package, Tag } from "lucide-react";

interface BrandRow { raw_brand: string; store_count: number; }
interface CategoryRow { raw_category: string; count: number; avg_price: number | null; }
interface CoverageRow { city: string; total: number; with_menu: number; }

type TabId = "brands" | "categories" | "coverage";

export function Reports() {
  const [tab, setTab] = useState<TabId>("brands");
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [coverage, setCoverage] = useState<CoverageRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (tab === "brands" && brands.length === 0) loadBrands();
    if (tab === "categories" && categories.length === 0) loadCategories();
    if (tab === "coverage" && coverage.length === 0) loadCoverage();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setBrands(
      Object.entries(brandMap)
        .map(([raw_brand, stores]) => ({ raw_brand, store_count: stores.size }))
        .sort((a, b) => b.store_count - a.store_count)
        .slice(0, 50)
    );
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
    setCategories(
      Object.entries(catMap)
        .map(([raw_category, { count, prices }]) => ({
          raw_category,
          count,
          avg_price: prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : null,
        }))
        .sort((a, b) => b.count - a.count)
    );
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
    setCoverage(
      Object.entries(cityMap)
        .map(([city, { total, with_menu }]) => ({ city, total, with_menu }))
        .sort((a, b) => b.total - a.total)
    );
    setLoading(false);
  }

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "brands", label: "Top Brands", icon: Tag },
    { id: "categories", label: "Categories", icon: Package },
    { id: "coverage", label: "Coverage by City", icon: BarChart2 },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5 animate-fade-up">
      <div>
        <h1 className="text-foreground">Reports</h1>
        <div className="header-underline mt-1" />
        <p className="text-sm text-muted-foreground mt-1">Market intelligence and coverage analysis</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-border">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(10)].map((_, i) => <div key={i} className="h-9 skeleton-shimmer rounded" />)}
        </div>
      ) : tab === "brands" ? (
        <div className="rounded-lg border border-border bg-card overflow-hidden shadow-premium">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sidebar" style={{ borderBottom: "1px solid var(--glass-border)" }}>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest w-10">#</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Brand</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Stores Carrying</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {brands.map((b, i) => (
                <tr key={b.raw_brand} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-2 text-muted-foreground font-mono-data text-xs">{i + 1}</td>
                  <td className="px-4 py-2 font-medium text-foreground">{b.raw_brand}</td>
                  <td className="px-4 py-2 text-muted-foreground font-mono-data">{b.store_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : tab === "categories" ? (
        <div className="rounded-lg border border-border bg-card overflow-hidden shadow-premium">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sidebar" style={{ borderBottom: "1px solid var(--glass-border)" }}>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Category</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Products</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Avg Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {categories.map((c) => (
                <tr key={c.raw_category} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-2 font-medium text-foreground">{c.raw_category}</td>
                  <td className="px-4 py-2 text-muted-foreground font-mono-data">{c.count.toLocaleString()}</td>
                  <td className="px-4 py-2 text-muted-foreground font-mono-data">
                    {c.avg_price != null ? `$${c.avg_price.toFixed(2)}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden shadow-premium">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sidebar" style={{ borderBottom: "1px solid var(--glass-border)" }}>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">City</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Stores</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">With Data</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Coverage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {coverage.map((row) => {
                const pct = Math.round((row.with_menu / row.total) * 100);
                return (
                  <tr key={row.city} className="hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-2 font-medium text-foreground capitalize">{row.city}</td>
                    <td className="px-4 py-2 text-muted-foreground font-mono-data">{row.total}</td>
                    <td className="px-4 py-2 text-muted-foreground font-mono-data">{row.with_menu}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground font-mono-data">{pct}%</span>
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
