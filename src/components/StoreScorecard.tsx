import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isExcludedBrand } from "@/lib/analytics-filters";
import { Award, Package, Sparkles, BarChart3, Boxes } from "lucide-react";

interface Props {
  storeId: string;
  orgId:   string | null;
}

interface Scorecard {
  totalProducts:   number;
  brandDiversity:  number;   // unique brand count
  yourShare:       number;   // 0-1
  categoryMix:     Record<string, number>;
  score:           number;   // 0-100 composite
  marketAvgSize:   number;
  marketAvgBrands: number;
}

const CAT_COLORS: Record<string, string> = {
  flower:      "#10B981",
  pre_roll:    "#A78BFA",
  vape:        "#F59E0B",
  concentrate: "#06B6D4",
  edible:      "#EF4444",
  beverage:    "#3B82F6",
  other:       "#6B7280",
};

export function StoreScorecard({ storeId, orgId }: Props) {
  const [sc, setSc] = useState<Scorecard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      // Latest snapshot for this store + market averages
      const [{ data: snap }, { data: stores }] = await Promise.all([
        supabase
          .from("menu_snapshots")
          .select("product_data, total_products, brand_count")
          .eq("intel_store_id", storeId)
          .order("snapshot_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("intel_stores")
          .select("total_products"),
      ]);

      if (cancelled) return;

      const marketAvgSize   = stores?.length
        ? stores.reduce((s, x) => s + (x.total_products ?? 0), 0) / stores.length
        : 0;

      if (!snap || !snap.product_data) {
        setSc({
          totalProducts: 0, brandDiversity: 0, yourShare: 0, categoryMix: {},
          score: 0, marketAvgSize, marketAvgBrands: 0,
        });
        setLoading(false);
        return;
      }

      const items = (snap.product_data as any[]) ?? [];

      // Your brands
      let ownBrandLowers = new Set<string>();
      if (orgId) {
        const { data: ub } = await supabase
          .from("user_brands")
          .select("brand_name")
          .eq("org_id", orgId)
          .eq("is_own_brand", true);
        ownBrandLowers = new Set((ub ?? []).map(b => b.brand_name.toLowerCase()));
      }

      const brands = new Set<string>();
      const categories: Record<string, number> = {};
      let yourSKUs = 0;
      for (const it of items) {
        if (it.b && !isExcludedBrand(it.b)) brands.add(it.b.toLowerCase());
        if (it.b && ownBrandLowers.has(it.b.toLowerCase())) yourSKUs++;
        const cat = (it.c ?? "other").toString().toLowerCase();
        categories[cat] = (categories[cat] ?? 0) + 1;
      }

      const totalProducts = items.length;
      const brandDiversity = brands.size;
      const yourShare = totalProducts > 0 ? yourSKUs / totalProducts : 0;

      // Composite score: 50% menu size vs market, 30% brand diversity, 20% own presence
      const sizeRatio    = marketAvgSize > 0 ? Math.min(totalProducts / marketAvgSize, 2) / 2 : 0;
      const brandRatio   = brandDiversity > 0 ? Math.min(brandDiversity / 80, 1) : 0;
      const presenceRatio = Math.min(yourShare * 10, 1); // small % gives strong boost
      const score = Math.round((sizeRatio * 50) + (brandRatio * 30) + (presenceRatio * 20));

      setSc({
        totalProducts,
        brandDiversity,
        yourShare,
        categoryMix: categories,
        score,
        marketAvgSize,
        marketAvgBrands: 0, // computed client-side would be expensive; shown vs size only
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [storeId, orgId]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card/50 h-40 flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!sc || sc.totalProducts === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        No snapshot data for this store yet.
      </div>
    );
  }

  const vsMarket   = sc.marketAvgSize > 0 ? ((sc.totalProducts - sc.marketAvgSize) / sc.marketAvgSize) * 100 : 0;
  const scoreColor = sc.score >= 70 ? "#10B981" : sc.score >= 40 ? "#F59E0B" : "#EF4444";

  const mixTotal = Object.values(sc.categoryMix).reduce((a, b) => a + b, 0);
  const topCats  = Object.entries(sc.categoryMix).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4 text-primary" />
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Store Scorecard
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Composite</p>
            <p className="text-2xl font-bold tabular-nums" style={{ color: scoreColor }}>{sc.score}</p>
          </div>
          <div className="w-16 h-16 rounded-full flex items-center justify-center relative">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="hsl(var(--border))" strokeWidth="2.5" />
              <circle
                cx="18" cy="18" r="15.9"
                fill="none"
                stroke={scoreColor}
                strokeWidth="2.5"
                strokeDasharray={`${sc.score}, 100`}
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Metric grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric icon={Package}  label="Menu Size"       value={sc.totalProducts.toLocaleString()}      sub={vsMarket > 0 ? `+${vsMarket.toFixed(0)}% vs mkt` : `${vsMarket.toFixed(0)}% vs mkt`} sign={vsMarket >= 0 ? "pos" : "neg"} />
        <Metric icon={Boxes}    label="Brand Diversity" value={sc.brandDiversity}                      sub="unique brands" />
        <Metric icon={Sparkles} label="Your Share"      value={`${(sc.yourShare * 100).toFixed(1)}%`}  sub={`${Math.round(sc.yourShare * sc.totalProducts)} of your SKUs`} />
        <Metric icon={BarChart3} label="Market Avg"     value={sc.marketAvgSize.toFixed(0)}            sub="SKUs / store" />
      </div>

      {/* Category mix */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Category Mix
        </p>
        <div className="flex h-6 rounded-md overflow-hidden border border-border">
          {topCats.map(([cat, count]) => {
            const pct = (count / mixTotal) * 100;
            return (
              <div
                key={cat}
                title={`${cat}: ${count} (${pct.toFixed(0)}%)`}
                style={{ width: `${pct}%`, background: CAT_COLORS[cat] ?? CAT_COLORS.other }}
              />
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 mt-2 text-[11px]">
          {topCats.map(([cat, count]) => (
            <span key={cat} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm" style={{ background: CAT_COLORS[cat] ?? CAT_COLORS.other }} />
              <span className="text-muted-foreground capitalize">{cat.replace("_", "-")}</span>
              <span className="font-mono-data text-foreground">{((count / mixTotal) * 100).toFixed(0)}%</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Metric({
  icon: Icon, label, value, sub, sign,
}: {
  icon: any;
  label: string;
  value: string | number;
  sub?: string;
  sign?: "pos" | "neg";
}) {
  const subColor = sign === "pos" ? "#10B981" : sign === "neg" ? "#EF4444" : undefined;
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon className="w-3 h-3 text-muted-foreground" />
        <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
      {sub && (
        <p className="text-[10px]" style={{ color: subColor ?? "hsl(var(--muted-foreground))" }}>
          {sub}
        </p>
      )}
    </div>
  );
}
