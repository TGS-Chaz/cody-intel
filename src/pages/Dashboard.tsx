import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Store, Wifi, TrendingUp, Database } from "lucide-react";

interface Stats {
  totalStores: number;
  storesWithMenus: number;
  totalProducts: number;
  platformCounts: Record<string, number>;
  byCounty: { county: string; count: number }[];
}

const PLATFORM_LABELS: Record<string, string> = {
  "dutchie-api": "Dutchie",
  leafly: "Leafly",
  weedmaps: "Weedmaps",
  "posabit-api": "POSaBit",
  jane: "Jane",
};

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [storesRes, menusRes] = await Promise.all([
        supabase.from("intel_stores").select("id, county, total_products").eq("status", "active"),
        supabase.from("dispensary_menus").select("intel_store_id, source, menu_item_count").not("intel_store_id", "is", null),
      ]);

      const stores = storesRes.data ?? [];
      const menus = menusRes.data ?? [];

      const storesWithMenus = new Set(menus.map((m) => m.intel_store_id)).size;
      const totalProducts = menus.reduce((sum, m) => sum + (m.menu_item_count ?? 0), 0);

      const platformCounts: Record<string, number> = {};
      for (const m of menus) {
        platformCounts[m.source] = (platformCounts[m.source] ?? 0) + 1;
      }

      const countyMap: Record<string, number> = {};
      for (const s of stores) {
        if (s.county) countyMap[s.county] = (countyMap[s.county] ?? 0) + 1;
      }
      const byCounty = Object.entries(countyMap)
        .map(([county, count]) => ({ county, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      setStats({ totalStores: stores.length, storesWithMenus, totalProducts, platformCounts, byCounty });
      setLoading(false);
    }
    load();
  }, []);

  const coverage = stats ? Math.round((stats.storesWithMenus / stats.totalStores) * 100) : 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 animate-fade-up">
      <div>
        <h1 className="text-foreground">Market Overview</h1>
        <div className="header-underline mt-1" />
        <p className="text-sm text-muted-foreground mt-1">Washington State cannabis market intelligence</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4 h-24 skeleton-shimmer" />
          ))}
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard icon={Store}     label="Active Stores"  value={stats?.totalStores ?? 0}              accent="stat-accent-teal" />
            <StatCard icon={Wifi}      label="With Menu Data" value={stats?.storesWithMenus ?? 0}           accent="stat-accent-blue" />
            <StatCard icon={TrendingUp} label="Coverage"      value={`${coverage}%`}                        accent="stat-accent-amber" />
            <StatCard icon={Database}  label="Total Products" value={(stats?.totalProducts ?? 0).toLocaleString()} accent="stat-accent-emerald" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Platform coverage */}
            <div className="rounded-lg border border-border bg-card p-5 card-hover">
              <h2 className="text-foreground mb-4">Platform Coverage</h2>
              <div className="space-y-3">
                {Object.entries(stats?.platformCounts ?? {}).map(([source, count]) => {
                  const pct = Math.round((count / (stats?.totalStores ?? 1)) * 100);
                  return (
                    <div key={source} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-20 shrink-0">{PLATFORM_LABELS[source] ?? source}</span>
                      <div className="flex-1 bg-secondary rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-700"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium font-mono-data text-foreground w-10 text-right">{count} <span className="text-muted-foreground">({pct}%)</span></span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top counties */}
            <div className="rounded-lg border border-border bg-card p-5 card-hover">
              <h2 className="text-foreground mb-4">Stores by County</h2>
              <div className="space-y-2">
                {stats?.byCounty.map(({ county, count }, i) => (
                  <div key={county} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono-data text-muted-foreground/60 w-4">{i + 1}</span>
                      <span className="text-muted-foreground capitalize">{county?.toLowerCase() ?? "Unknown"}</span>
                    </div>
                    <span className="font-medium font-mono-data text-foreground">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  accent: string;
}) {
  return (
    <div className={`rounded-lg border border-border bg-card p-4 card-hover ${accent}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="text-2xl font-bold text-foreground font-mono-data">{value}</p>
    </div>
  );
}
