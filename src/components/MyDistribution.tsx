import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Store, TrendingUp, Package, AlertTriangle } from "lucide-react";

interface Stats {
  totalStores:      number;
  storesWithMe:     number;
  verifiedPlacements: number;
  uniqueProducts:   number;
}

export function MyDistribution({ orgId }: { orgId: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      // 1) All stores
      const { count: totalStores } = await supabase
        .from("intel_stores")
        .select("id", { count: "exact", head: true });

      // 2) User product IDs for this org
      const { data: products } = await supabase
        .from("products")
        .select("id")
        .eq("org_id", orgId);
      const productIds = (products ?? []).map(p => p.id);

      if (!productIds.length) {
        if (!cancelled) {
          setStats({ totalStores: totalStores ?? 0, storesWithMe: 0, verifiedPlacements: 0, uniqueProducts: 0 });
          setLoading(false);
        }
        return;
      }

      // 3) Distribution = stores where ANY of my brands appear in menu_items.
      //    Uses raw_brand matching (with alias resolution) rather than
      //    product_matches so it tracks market presence, not SKU-level matches.
      const { data: storeRows } = await supabase.rpc("get_own_brand_stores", {
        p_org_id: orgId,
      });
      const storesSet = new Set<string>((storeRows ?? []).map((r: any) => r.intel_store_id));

      // Verified placements = count of SKU-level strain matches a rep has confirmed
      const { count: verifiedCount } = await supabase
        .from("product_matches")
        .select("id", { count: "exact", head: true })
        .in("user_product_id", productIds)
        .eq("verified", true);

      if (!cancelled) {
        setStats({
          totalStores:        totalStores ?? 0,
          storesWithMe:       storesSet.size,
          verifiedPlacements: verifiedCount ?? 0,
          uniqueProducts:     productIds.length,
        });
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  if (loading || !stats) {
    return (
      <div className="rounded-xl border border-border bg-card/50 h-28 flex items-center justify-center">
        <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const pct = stats.totalStores > 0 ? (stats.storesWithMe / stats.totalStores) * 100 : 0;
  const pctLabel = pct < 1 && pct > 0 ? pct.toFixed(1) : pct.toFixed(0);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            My Distribution
          </p>
          <h2 className="text-lg font-bold text-foreground mt-1">
            Your brands are in{" "}
            <span className="text-primary">
              {stats.storesWithMe} of {stats.totalStores} stores
            </span>
            {stats.totalStores > 0 && <span className="text-foreground"> ({pctLabel}%)</span>}
          </h2>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/20">
          <TrendingUp className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium text-primary">Numeric distribution</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric icon={Store}    label="Stores Carrying You" value={stats.storesWithMe}    color="#10B981" />
        <Metric icon={Package}  label="Your SKUs"           value={stats.uniqueProducts} color="hsl(168 100% 42%)" />
        <Metric icon={TrendingUp} label="Verified Placements" value={stats.verifiedPlacements} color="#A78BFA" />
        <Metric
          icon={AlertTriangle}
          label="Gap Stores"
          value={Math.max(0, stats.totalStores - stats.storesWithMe)}
          color="#EF4444"
        />
      </div>
    </div>
  );
}

function Metric({
  icon: Icon, label, value, color,
}: {
  icon: any;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3 h-3" style={{ color }} />
        <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="text-xl font-bold tabular-nums" style={{ color }}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}
