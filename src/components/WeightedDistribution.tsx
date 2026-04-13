import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Scale, TrendingUp, TrendingDown } from "lucide-react";

interface Result {
  numeric: number;      // 0-1
  weighted: number;     // 0-1
  storesWithMe: number;
  totalStores: number;
  myVolume: number;
  totalVolume: number;
}

export function WeightedDistribution({ orgId }: { orgId: string }) {
  const [r, setR] = useState<Result | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Volume proxy = total_products per store from intel_stores
      const [{ data: stores }, { data: products }] = await Promise.all([
        supabase.from("intel_stores").select("id, total_products"),
        supabase.from("products").select("id").eq("org_id", orgId),
      ]);
      if (!stores?.length || !products?.length) return;

      const totalStores  = stores.length;
      const totalVolume  = stores.reduce((s, st) => s + (st.total_products ?? 0), 0);

      // Which stores carry any of my brands? Uses raw_brand (with alias
      // resolution) so the metric reflects distribution presence, not
      // SKU-level strain matches.
      const { data: storeRows } = await supabase.rpc("get_own_brand_stores", {
        p_org_id: orgId,
      });
      const myStoreIds = new Set<string>((storeRows ?? []).map((r: any) => r.intel_store_id));
      const storesWithMe = myStoreIds.size;
      const myVolume = stores
        .filter(s => myStoreIds.has(s.id))
        .reduce((sum, s) => sum + (s.total_products ?? 0), 0);

      if (cancelled) return;
      setR({
        numeric:      totalStores > 0 ? storesWithMe / totalStores : 0,
        weighted:     totalVolume > 0 ? myVolume / totalVolume : 0,
        storesWithMe, totalStores,
        myVolume,     totalVolume,
      });
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  if (!r) return null;

  const numPct  = r.numeric  * 100;
  const wPct    = r.weighted * 100;
  const lift    = wPct - numPct;
  const isGood  = lift >= 0;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Scale className="w-4 h-4 text-primary" />
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Weighted Distribution
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Numeric */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Numeric</p>
          <p className="text-2xl font-bold tabular-nums text-foreground">{numPct.toFixed(1)}%</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {r.storesWithMe} of {r.totalStores} stores
          </p>
        </div>
        {/* Weighted */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Weighted</p>
          <p className="text-2xl font-bold tabular-nums text-primary">{wPct.toFixed(1)}%</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {r.myVolume.toLocaleString()} of {r.totalVolume.toLocaleString()} SKU slots
          </p>
        </div>
      </div>

      {/* Lift callout */}
      <div
        className="rounded-md p-3 flex items-start gap-2"
        style={{
          background:    isGood ? "hsl(160 84% 39% / 0.08)" : "hsl(0 84% 60% / 0.08)",
          border: `1px solid ${isGood ? "hsl(160 84% 39% / 0.2)" : "hsl(0 84% 60% / 0.2)"}`,
        }}
      >
        {isGood ? (
          <TrendingUp className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "#10B981" }} />
        ) : (
          <TrendingDown className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "#EF4444" }} />
        )}
        <p className="text-[11px] leading-snug text-foreground">
          {isGood ? (
            <>Your weighted distribution is <b>{wPct.toFixed(1)}%</b> — you're in the stores that matter most (+{lift.toFixed(1)} pts vs numeric).</>
          ) : (
            <>You're in smaller stores. Weighted ({wPct.toFixed(1)}%) lags numeric ({numPct.toFixed(1)}%) by {Math.abs(lift).toFixed(1)} pts — pursue bigger accounts.</>
          )}
        </p>
      </div>
    </div>
  );
}
