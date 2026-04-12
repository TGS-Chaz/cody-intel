import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Store, Wifi, Database, TrendingUp } from "lucide-react";

interface Stats {
  totalStores: number;
  storesWithMenus: number;
  totalProducts: number;
  platformCounts: Record<string, number>;
  byCounty: { county: string; count: number }[];
}

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
        .slice(0, 8);

      setStats({ totalStores: stores.length, storesWithMenus, totalProducts, platformCounts, byCounty });
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Loading...
      </div>
    );
  }

  const coverage = stats ? Math.round((stats.storesWithMenus / stats.totalStores) * 100) : 0;

  const platformLabels: Record<string, string> = {
    "dutchie-api": "Dutchie",
    leafly: "Leafly",
    weedmaps: "Weedmaps",
    "posabit-api": "POSaBit",
    jane: "Jane",
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Washington State cannabis market overview</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Store} label="Total Stores" value={stats?.totalStores ?? 0} color="blue" />
        <StatCard icon={Wifi} label="With Menu Data" value={stats?.storesWithMenus ?? 0} color="green" />
        <StatCard icon={TrendingUp} label="Coverage" value={`${coverage}%`} color="purple" />
        <StatCard icon={Database} label="Total Products" value={(stats?.totalProducts ?? 0).toLocaleString()} color="amber" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Platform coverage */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Platform Coverage</h2>
          <div className="space-y-2">
            {Object.entries(stats?.platformCounts ?? {}).map(([source, count]) => (
              <div key={source} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-24 shrink-0">{platformLabels[source] ?? source}</span>
                <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${Math.round((count / (stats?.totalStores ?? 1)) * 100)}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-foreground w-8 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top counties */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Stores by County</h2>
          <div className="space-y-1.5">
            {stats?.byCounty.map(({ county, count }) => (
              <div key={county} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground capitalize">{county?.toLowerCase() ?? "Unknown"}</span>
                <span className="font-medium text-foreground">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: "blue" | "green" | "purple" | "amber";
}) {
  const colors = {
    blue: "bg-blue-500/10 text-blue-600",
    green: "bg-green-500/10 text-green-600",
    purple: "bg-primary/10 text-primary",
    amber: "bg-amber-500/10 text-amber-600",
  };
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className={`w-8 h-8 rounded-lg ${colors[color]} flex items-center justify-center mb-3`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
