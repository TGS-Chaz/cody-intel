import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isExcludedBrand } from "@/lib/analytics-filters";
import { useOrg } from "@/lib/org";
import { exportCSV } from "@/lib/export-csv";
import { Download, Zap, Clock, TrendingDown } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProductItem {
  n: string;
  b: string;
  c?: string;
  p?: number;
}

interface SnapshotRow {
  intel_store_id: string;
  snapshot_date: string;
  product_data: ProductItem[] | null;
}

type Velocity = "HIGH" | "MEDIUM" | "LOW";

interface TrackedProduct {
  name: string;
  brand: string;
  store_id: string;
  first_seen: string;
  last_seen: string;
  days_on_menu: number;
  still_present: boolean;
  velocity: Velocity;
}

const thCls = "text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest";

function Skeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-px">
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="h-9 skeleton-shimmer rounded" />
      ))}
    </div>
  );
}

function VelocityBadge({ v }: { v: Velocity }) {
  const cfg = {
    HIGH:   { bg: "bg-green-500/10",  text: "text-green-500",  label: "Fast Mover" },
    MEDIUM: { bg: "bg-amber-500/10",  text: "text-amber-500",  label: "Medium"     },
    LOW:    { bg: "bg-red-500/10",    text: "text-red-500",    label: "Shelf Warmer" },
  }[v];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

export function SellThrough() {
  const { orgId } = useOrg();
  const [products, setProducts]       = useState<TrackedProduct[]>([]);
  const [ownBrands, setOwnBrands]     = useState<Set<string>>(new Set());
  const [loading, setLoading]         = useState(true);
  const [ownOnly, setOwnOnly]         = useState(false);
  const [limited, setLimited]         = useState(false);
  const [activeSection, setActiveSection] = useState<"fast" | "warmers">("fast");

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function load() {
    setLoading(true);

    const since = new Date();
    since.setDate(since.getDate() - 30);

    const { data: snapshots } = await supabase
      .from("menu_snapshots")
      .select("intel_store_id, snapshot_date, product_data")
      .gte("snapshot_date", since.toISOString().slice(0, 10))
      .order("snapshot_date", { ascending: true })
      .limit(2000) as { data: SnapshotRow[] | null };

    // Own brands
    let ownBrandSet = new Set<string>();
    if (orgId) {
      const { data: ub } = await supabase
        .from("user_brands")
        .select("brand_name")
        .eq("org_id", orgId)
        .eq("is_own_brand", true);
      if (ub) {
        ownBrandSet = new Set((ub as { brand_name: string }[]).map(r => r.brand_name.toLowerCase()));
      }
    }
    setOwnBrands(ownBrandSet);

    if (!snapshots?.length) { setLoading(false); return; }

    // Group snapshots by store
    const byStore = new Map<string, SnapshotRow[]>();
    for (const snap of snapshots) {
      if (!byStore.has(snap.intel_store_id)) byStore.set(snap.intel_store_id, []);
      byStore.get(snap.intel_store_id)!.push(snap);
    }

    // Track products per store
    // key: `${store_id}::${product_name}`
    const productMap = new Map<string, {
      name: string; brand: string; store_id: string;
      first_seen: string; last_seen: string; dates: Set<string>;
    }>();

    let total = 0;
    const MAX_PRODUCTS = 500;

    for (const [store_id, storeSnaps] of byStore.entries()) {
      // Sorted by date already
      const dates = storeSnaps.map(s => s.snapshot_date);
      const latestDate = dates[dates.length - 1];

      for (const snap of storeSnaps) {
        if (!snap.product_data) continue;
        for (const item of snap.product_data) {
          if (!item.n || isExcludedBrand(item.b)) continue;
          const key = `${store_id}::${item.n}`;
          if (!productMap.has(key)) {
            if (total >= MAX_PRODUCTS) { setLimited(true); continue; }
            productMap.set(key, {
              name: item.n,
              brand: item.b ?? "",
              store_id,
              first_seen: snap.snapshot_date,
              last_seen: snap.snapshot_date,
              dates: new Set([snap.snapshot_date]),
            });
            total++;
          } else {
            const entry = productMap.get(key)!;
            entry.dates.add(snap.snapshot_date);
            if (snap.snapshot_date > entry.last_seen) entry.last_seen = snap.snapshot_date;
          }

          // Track latest date for still_present check
          const entry2 = productMap.get(key);
          if (entry2 && snap.snapshot_date === latestDate) {
            // mark as seen in latest; we check by last_seen === latestDate
          }
          void latestDate;
        }
      }
    }

    // Determine the latest snapshot date across all stores per store for still_present check
    const latestByStore = new Map<string, string>();
    for (const [store_id, storeSnaps] of byStore.entries()) {
      const last = storeSnaps[storeSnaps.length - 1];
      latestByStore.set(store_id, last.snapshot_date);
    }

    const tracked: TrackedProduct[] = [];
    for (const entry of productMap.values()) {
      const latestStoreDate = latestByStore.get(entry.store_id) ?? entry.last_seen;
      const still_present = entry.last_seen >= latestStoreDate;
      const days_on_menu = daysBetween(entry.first_seen, entry.last_seen);

      let velocity: Velocity;
      if (!still_present && days_on_menu <= 7) {
        velocity = "HIGH";
      } else if (!still_present && days_on_menu <= 21) {
        velocity = "MEDIUM";
      } else {
        velocity = "LOW";
      }

      tracked.push({ ...entry, days_on_menu, still_present, velocity });
    }

    setProducts(tracked);
    setLoading(false);
  }

  const displayProducts = ownOnly
    ? products.filter(p => ownBrands.size > 0 && ownBrands.has(p.brand.toLowerCase()))
    : products;

  const fastMovers   = displayProducts.filter(p => p.velocity === "HIGH").sort((a, b) => a.days_on_menu - b.days_on_menu);
  const shelfWarmers = displayProducts.filter(p => p.velocity === "LOW").sort((a, b) => b.days_on_menu - a.days_on_menu);
  const mediumCount  = displayProducts.filter(p => p.velocity === "MEDIUM").length;

  const showList = activeSection === "fast" ? fastMovers : shelfWarmers;

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Products Tracked",   value: products.length, color: "text-primary",      icon: Zap          },
          { label: "Fast Movers",         value: products.filter(p => p.velocity === "HIGH").length,   color: "text-green-500", icon: Zap   },
          { label: "Medium Velocity",     value: mediumCount,     color: "text-amber-500",    icon: Clock        },
          { label: "Shelf Warmers",       value: products.filter(p => p.velocity === "LOW").length,    color: "text-red-500",   icon: TrendingDown },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-4 h-4 ${color}`} />
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
            </div>
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {limited && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-600">
          Data limited to 500 products to avoid browser freeze. Showing a representative sample.
        </div>
      )}

      {/* Detail table */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Sell-Through Velocity (Last 30 Days)</h2>
            <div className="header-underline mt-1" />
          </div>
          <div className="flex items-center gap-2">
            {orgId && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={ownOnly}
                  onChange={e => setOwnOnly(e.target.checked)}
                  className="rounded"
                />
                Own brands only
              </label>
            )}
            <button
              onClick={() => exportCSV("sell-through.csv", showList)}
              className="flex items-center gap-1.5 h-8 rounded-md border border-border bg-background px-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
          </div>
        </div>

        {/* Section toggle */}
        <div className="flex gap-1 p-1 bg-muted/40 rounded-lg w-fit">
          {(["fast", "warmers"] as const).map(s => (
            <button
              key={s}
              onClick={() => setActiveSection(s)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeSection === s ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "fast" ? `Fast Movers (${fastMovers.length})` : `Shelf Warmers (${shelfWarmers.length})`}
            </button>
          ))}
        </div>

        {loading ? <Skeleton /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className={thCls}>Product Name</th>
                  <th className={thCls}>Brand</th>
                  <th className={`${thCls} text-right`}>First Seen</th>
                  <th className={`${thCls} text-right`}>Last Seen</th>
                  <th className={`${thCls} text-right`}>Days on Menu</th>
                  <th className={thCls}>Velocity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {showList.slice(0, 100).map((p, i) => (
                  <tr key={`${p.store_id}-${p.name}-${i}`} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 font-medium max-w-[240px] truncate">{p.name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{p.brand || "—"}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{p.first_seen}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{p.last_seen}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{p.days_on_menu}</td>
                    <td className="px-4 py-2.5"><VelocityBadge v={p.velocity} /></td>
                  </tr>
                ))}
                {showList.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      {loading ? "Loading…" : "No data available for the last 30 days"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {showList.length > 100 && (
              <p className="text-center text-xs text-muted-foreground py-3">
                Showing top 100 of {showList.length} results
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
