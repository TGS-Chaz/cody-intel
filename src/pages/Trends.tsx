import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { exportCSV } from "@/lib/export-csv";
import { Clock, Download, TrendingUp, TrendingDown } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Legend, CartesianGrid,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DailyBrandMetric {
  date: string;
  brand_name: string;
  store_count: number;
  total_products: number;
  avg_price: number | null;
  categories: string[] | null;
}

interface OwnBrand {
  brand_name: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BRAND_COLORS = ["#00D4AA", "#A855F7", "#F59E0B", "#3BB143", "#5C6BC0"];

const thCls =
  "text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest";

const cardCls = "rounded-xl border border-border bg-card/60 p-5";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Group metrics by brand, return { brand -> { date -> store_count } }
function groupByBrand(rows: DailyBrandMetric[]): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!map.has(row.brand_name)) map.set(row.brand_name, new Map());
    map.get(row.brand_name)!.set(row.date, row.store_count);
  }
  return map;
}

function avgStoreCount(byDate: Map<string, number>, dates: string[]): number {
  let sum = 0, count = 0;
  for (const d of dates) {
    const v = byDate.get(d);
    if (v !== undefined) { sum += v; count++; }
  }
  return count ? sum / count : 0;
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
        <Clock className="w-7 h-7 text-muted-foreground" />
      </div>
      <div className="max-w-sm">
        <p className="font-semibold text-foreground mb-1">Trend data is building up</p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Once daily snapshots have been running for at least 7 days, you'll see
          week-over-week comparisons here. Run the{" "}
          <code className="text-[11px] bg-muted px-1 py-0.5 rounded">snapshot-menus</code>{" "}
          function daily to start accumulating data.
        </p>
      </div>
    </div>
  );
}

// ── Section 1: Brand Ranking Changes ─────────────────────────────────────────

interface RankingRow {
  brand: string;
  thisWeek: number;
  lastWeek: number;
  change: number;
}

function BrandRankingSection({ metrics, ownBrands }: { metrics: DailyBrandMetric[]; ownBrands: string[] }) {
  const ownSet = useMemo(() => new Set(ownBrands.map((b) => b.toLowerCase())), [ownBrands]);
  const rows = useMemo<RankingRow[]>(() => {
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 14);

    // Get all dates in range
    const allDates = Array.from(new Set(metrics.map((m) => m.date))).sort();
    const midpoint = allDates[Math.floor(allDates.length / 2)] ?? "";

    const thisWeekDates = allDates.filter((d) => d >= midpoint);
    const lastWeekDates = allDates.filter((d) => d < midpoint);

    const brandMap = groupByBrand(metrics);

    const result: RankingRow[] = [];
    for (const [brand, byDate] of brandMap) {
      // Only include brands with store_count > 3 on average
      const tw = avgStoreCount(byDate, thisWeekDates);
      const lw = avgStoreCount(byDate, lastWeekDates);
      if (tw <= 3 && lw <= 3) continue;
      result.push({ brand, thisWeek: tw, lastWeek: lw, change: tw - lw });
    }

    result.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
    return result.slice(0, 25);
  }, [metrics]);

  if (!rows.length) return null;

  return (
    <section className={cardCls}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-foreground text-[15px]">Brand Ranking Changes (WoW)</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Biggest store-count movers — this week vs. last week (brands with 3+ stores)
          </p>
        </div>
        <button
          onClick={() =>
            exportCSV("brand-ranking-changes.csv", rows, [
              "brand",
              "thisWeek",
              "lastWeek",
              "change",
            ])
          }
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium border border-border hover:bg-accent transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className={thCls}>Brand</th>
              <th className={`${thCls} text-right`}>This Week (stores)</th>
              <th className={`${thCls} text-right`}>Last Week (stores)</th>
              <th className={`${thCls} text-right`}>Change</th>
              <th className={`${thCls} text-right`}>Trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.brand} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2.5 text-[12px] font-medium text-foreground">
                  {row.brand}
                  {ownSet.has(row.brand.toLowerCase()) && (
                    <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest bg-teal-500/15 text-teal-500 border border-teal-500/25">
                      Yours
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-[12px] text-right tabular-nums">{row.thisWeek.toFixed(1)}</td>
                <td className="px-4 py-2.5 text-[12px] text-right tabular-nums">{row.lastWeek.toFixed(1)}</td>
                <td className={`px-4 py-2.5 text-[12px] text-right font-semibold tabular-nums ${row.change > 0 ? "text-emerald-500" : row.change < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                  {row.change > 0 ? `+${row.change.toFixed(1)}` : row.change.toFixed(1)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {row.change > 0 ? (
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-500 inline-block" />
                  ) : row.change < 0 ? (
                    <TrendingDown className="w-3.5 h-3.5 text-red-500 inline-block" />
                  ) : (
                    <span className="text-muted-foreground text-[10px]">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Section 2: Own Brand Performance ─────────────────────────────────────────

interface OwnBrandSummary {
  brand: string;
  current: number;
  wowChange: number;
  momChange: number;
}

function OwnBrandSection({
  metrics,
  ownBrands,
}: {
  metrics: DailyBrandMetric[];
  ownBrands: string[];
}) {
  const ownSet = useMemo(() => new Set(ownBrands.map((b) => b.toLowerCase())), [ownBrands]);

  const ownMetrics = useMemo(
    () => metrics.filter((m) => ownSet.has(m.brand_name.toLowerCase())),
    [metrics, ownSet]
  );

  const allDates = useMemo(
    () => Array.from(new Set(ownMetrics.map((m) => m.date))).sort(),
    [ownMetrics]
  );

  // Build chart data: [{ date, [brand]: storeCount }]
  const chartData = useMemo(() => {
    const brandMap = groupByBrand(ownMetrics);
    return allDates.map((date) => {
      const point: Record<string, string | number> = { date };
      for (const [brand, byDate] of brandMap) {
        point[brand] = byDate.get(date) ?? 0;
      }
      return point;
    });
  }, [ownMetrics, allDates]);

  const ownBrandNames = useMemo(
    () => Array.from(new Set(ownMetrics.map((m) => m.brand_name))),
    [ownMetrics]
  );

  // Summary table
  const summaryRows = useMemo<OwnBrandSummary[]>(() => {
    const brandMap = groupByBrand(ownMetrics);
    const sortedDates = [...allDates];
    const last7 = sortedDates.slice(-7);
    const prev7 = sortedDates.slice(-14, -7);
    const prev30Start = sortedDates.slice(0, 7);

    return ownBrandNames.map((brand) => {
      const byDate = brandMap.get(brand) ?? new Map();
      const currentStores = last7.length ? avgStoreCount(byDate, last7) : 0;
      const lastWeekStores = prev7.length ? avgStoreCount(byDate, prev7) : 0;
      const monthAgoStores = prev30Start.length ? avgStoreCount(byDate, prev30Start) : 0;
      return {
        brand,
        current: currentStores,
        wowChange: currentStores - lastWeekStores,
        momChange: currentStores - monthAgoStores,
      };
    }).sort((a, b) => b.current - a.current);
  }, [ownMetrics, allDates, ownBrandNames]);

  if (!ownBrandNames.length) {
    return (
      <section className={cardCls}>
        <h2 className="font-semibold text-foreground text-[15px] mb-1">Own Brand Performance</h2>
        <p className="text-[12px] text-muted-foreground">
          No own brands found. Tag brands as own brands in the market_brands table.
        </p>
      </section>
    );
  }

  return (
    <section className={cardCls}>
      <div className="mb-4">
        <h2 className="font-semibold text-foreground text-[15px]">Own Brand Performance</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">Store count over last 30 days</p>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 4, right: 12, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 11,
            }}
            labelFormatter={(label) => formatDate(String(label))}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {ownBrandNames.map((brand, i) => (
            <Line
              key={brand}
              type="monotone"
              dataKey={brand}
              stroke={BRAND_COLORS[i % BRAND_COLORS.length]}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className={thCls}>Brand</th>
              <th className={`${thCls} text-right`}>Current Stores</th>
              <th className={`${thCls} text-right`}>WoW Change</th>
              <th className={`${thCls} text-right`}>MoM Change</th>
            </tr>
          </thead>
          <tbody>
            {summaryRows.map((row) => (
              <tr key={row.brand} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2.5 text-[12px] font-medium text-foreground">{row.brand}</td>
                <td className="px-4 py-2.5 text-[12px] text-right tabular-nums">{row.current.toFixed(1)}</td>
                <td className={`px-4 py-2.5 text-[12px] text-right font-medium tabular-nums ${row.wowChange > 0 ? "text-emerald-500" : row.wowChange < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                  {row.wowChange > 0 ? `+${row.wowChange.toFixed(1)}` : row.wowChange.toFixed(1)}
                </td>
                <td className={`px-4 py-2.5 text-[12px] text-right font-medium tabular-nums ${row.momChange > 0 ? "text-emerald-500" : row.momChange < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                  {row.momChange > 0 ? `+${row.momChange.toFixed(1)}` : row.momChange.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Section 3: Price Trends by Category ──────────────────────────────────────

function PriceTrendsSection({ metrics }: { metrics: DailyBrandMetric[] }) {
  const { chartData, topCategories } = useMemo(() => {
    // Unnest categories client-side and accumulate avg_price by date+category
    const catDatePrices = new Map<string, Map<string, number[]>>(); // cat -> date -> prices[]

    for (const row of metrics) {
      if (!row.categories || !row.avg_price) continue;
      for (const cat of row.categories) {
        if (!cat) continue;
        if (!catDatePrices.has(cat)) catDatePrices.set(cat, new Map());
        const dateMap = catDatePrices.get(cat)!;
        if (!dateMap.has(row.date)) dateMap.set(row.date, []);
        dateMap.get(row.date)!.push(row.avg_price);
      }
    }

    // Count total product appearances per category
    const catCounts = new Map<string, number>();
    for (const [cat, dateMap] of catDatePrices) {
      let total = 0;
      for (const prices of dateMap.values()) total += prices.length;
      catCounts.set(cat, total);
    }

    const topCategories = Array.from(catCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([cat]) => cat);

    const allDates = Array.from(
      new Set(metrics.map((m) => m.date))
    ).sort();

    const chartData = allDates.map((date) => {
      const point: Record<string, string | number> = { date };
      for (const cat of topCategories) {
        const prices = catDatePrices.get(cat)?.get(date);
        if (prices && prices.length) {
          point[cat] = prices.reduce((a, b) => a + b, 0) / prices.length;
        }
      }
      return point;
    });

    return { chartData, topCategories };
  }, [metrics]);

  if (!topCategories.length) return null;

  return (
    <section className={cardCls}>
      <div className="mb-4">
        <h2 className="font-semibold text-foreground text-[15px]">Price Trends by Category</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Average price over last 30 days — top 8 categories
        </p>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 4, right: 12, left: -4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 11,
            }}
            labelFormatter={(label) => formatDate(String(label))}
            formatter={(v) => [`$${Number(v).toFixed(2)}`]}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          {topCategories.map((cat, i) => (
            <Line
              key={cat}
              type="monotone"
              dataKey={cat}
              stroke={BRAND_COLORS[i % BRAND_COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}

// ── Section 4: Distribution Trends ───────────────────────────────────────────

interface DistBrand {
  brand: string;
  change: number;
}

function DistributionSection({ metrics }: { metrics: DailyBrandMetric[] }) {
  const { rising, declining } = useMemo(() => {
    const allDates = Array.from(new Set(metrics.map((m) => m.date))).sort();
    const midpoint = allDates[Math.floor(allDates.length / 2)] ?? "";
    const thisWeekDates = allDates.filter((d) => d >= midpoint);
    const lastWeekDates = allDates.filter((d) => d < midpoint);

    const brandMap = groupByBrand(metrics);

    const rising: DistBrand[] = [];
    const declining: DistBrand[] = [];

    for (const [brand, byDate] of brandMap) {
      const tw = avgStoreCount(byDate, thisWeekDates);
      const lw = avgStoreCount(byDate, lastWeekDates);
      const change = tw - lw;
      if (change >= 3) rising.push({ brand, change });
      else if (change <= -3) declining.push({ brand, change });
    }

    rising.sort((a, b) => b.change - a.change);
    declining.sort((a, b) => a.change - b.change);

    return { rising, declining };
  }, [metrics]);

  return (
    <section className={cardCls}>
      <div className="mb-4">
        <h2 className="font-semibold text-foreground text-[15px]">Distribution Trends</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Brands that gained or lost 3+ stores week-over-week
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Rising Stars */}
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            <h3 className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
              Rising Stars
            </h3>
          </div>
          {rising.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No brands gained 3+ stores this week.</p>
          ) : (
            <ul className="space-y-1.5">
              {rising.map((item) => (
                <li key={item.brand} className="flex items-center justify-between">
                  <span className="text-[12px] text-foreground truncate max-w-[70%]">{item.brand}</span>
                  <span className="text-[12px] font-semibold text-emerald-500 tabular-nums">
                    +{item.change.toFixed(1)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Declining */}
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="w-4 h-4 text-red-500" />
            <h3 className="text-[12px] font-semibold text-red-600 dark:text-red-400">
              Declining
            </h3>
          </div>
          {declining.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No brands lost 3+ stores this week.</p>
          ) : (
            <ul className="space-y-1.5">
              {declining.map((item) => (
                <li key={item.brand} className="flex items-center justify-between">
                  <span className="text-[12px] text-foreground truncate max-w-[70%]">{item.brand}</span>
                  <span className="text-[12px] font-semibold text-red-500 tabular-nums">
                    {item.change.toFixed(1)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function Trends() {
  const [metrics14, setMetrics14] = useState<DailyBrandMetric[]>([]);
  const [metrics30, setMetrics30] = useState<DailyBrandMetric[]>([]);
  const [ownBrands, setOwnBrands] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasEnoughData, setHasEnoughData] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyStr = thirtyDaysAgo.toISOString().slice(0, 10);

      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      const fourteenStr = fourteenDaysAgo.toISOString().slice(0, 10);

      const [{ data: data30 }, { data: data14 }] = await Promise.all([
        supabase
          .from("daily_brand_metrics")
          .select("date, brand_name, store_count, total_products, avg_price, categories")
          .gte("date", thirtyStr)
          .order("date")
          .limit(10000),
        supabase
          .from("daily_brand_metrics")
          .select("date, brand_name, store_count, total_products, avg_price")
          .gte("date", fourteenStr)
          .order("date")
          .limit(10000),
      ]);

      const m30 = (data30 as DailyBrandMetric[] | null) ?? [];
      const m14 = (data14 as DailyBrandMetric[] | null) ?? [];

      setMetrics30(m30);
      setMetrics14(m14);

      // Load own brands from user_brands (primary), fall back to market_brands
      const { data: userOwnBrands } = await supabase
        .from("user_brands")
        .select("brand_name")
        .eq("is_own_brand", true);

      let ownBrandNames: string[] = (userOwnBrands ?? []).map((b: any) => b.brand_name);

      if (!ownBrandNames.length) {
        const { data: mktOwn } = await supabase
          .from("market_brands")
          .select("brand_name")
          .eq("is_own_brand", true);
        ownBrandNames = (mktOwn as OwnBrand[] | null)?.map((r) => r.brand_name) ?? [];
      }

      setOwnBrands(ownBrandNames);

      // Need at least 7 distinct dates to show comparisons
      const distinctDates = new Set(m14.map((r) => r.date));
      setHasEnoughData(distinctDates.size >= 7);

      setLoading(false);
    }

    load();
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Trends</h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Week-over-week brand performance and distribution trends
          </p>
        </div>
        <TrendingUp className="w-6 h-6 text-primary mt-0.5" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : !hasEnoughData ? (
        <div className={cardCls}>
          <EmptyState />
        </div>
      ) : (
        <>
          <BrandRankingSection metrics={metrics14} ownBrands={ownBrands} />
          <OwnBrandSection metrics={metrics30} ownBrands={ownBrands} />
          <PriceTrendsSection metrics={metrics30} />
          <DistributionSection metrics={metrics14} />
        </>
      )}
    </div>
  );
}
