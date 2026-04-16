import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isExcludedBrand } from "@/lib/analytics-filters";
import { useOrg } from "@/lib/org";
import { exportCSV } from "@/lib/export-csv";
import { Download } from "lucide-react";

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

interface StoreRow {
  id: string;
  name: string;
  city: string | null;
  total_products: number | null;
}

interface CityData {
  city: string;
  store_count: number;
  unique_brands: number;
  avg_products: number;
  brands_per_store: number;
  status: "oversaturated" | "healthy" | "underserved";
  has_own_brand: boolean;
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

function StatusBadge({ status }: { status: CityData["status"] }) {
  const cfg = {
    oversaturated: { bg: "bg-destructive/10", text: "text-destructive", label: "Oversaturated" },
    healthy:       { bg: "bg-success/10", text: "text-success", label: "Healthy" },
    underserved:   { bg: "bg-warning/10", text: "text-warning", label: "Underserved" },
  }[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

export function SaturationAnalysis() {
  const { orgId } = useOrg();
  const [rows, setRows] = useState<CityData[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function load() {
    setLoading(true);

    // 1. Fetch stores
    const { data: stores } = await supabase
      .from("intel_stores")
      .select("id, name, city, total_products") as { data: StoreRow[] | null };

    if (!stores?.length) { setLoading(false); return; }

    // 2. Fetch recent snapshots (most recent per store, limit 500)
    const { data: snapshots } = await supabase
      .from("menu_snapshots")
      .select("intel_store_id, snapshot_date, product_data")
      .order("snapshot_date", { ascending: false })
      .limit(500) as { data: SnapshotRow[] | null };

    // 3. Own brands
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

    // 4. Most recent snapshot per store
    const latestSnap = new Map<string, SnapshotRow>();
    for (const snap of (snapshots ?? [])) {
      if (!latestSnap.has(snap.intel_store_id)) {
        latestSnap.set(snap.intel_store_id, snap);
      }
    }

    // 5. Group stores by city
    const cityMap = new Map<string, { stores: StoreRow[]; brands: Set<string>; hasOwn: boolean }>();
    for (const store of stores) {
      const city = store.city ?? "Unknown";
      if (!cityMap.has(city)) {
        cityMap.set(city, { stores: [], brands: new Set(), hasOwn: false });
      }
      const entry = cityMap.get(city)!;
      entry.stores.push(store);

      // Extract brands from snapshot
      const snap = latestSnap.get(store.id);
      if (snap?.product_data) {
        for (const item of snap.product_data) {
          if (item.b && !isExcludedBrand(item.b)) {
            entry.brands.add(item.b.toLowerCase());
            if (ownBrandSet.has(item.b.toLowerCase())) {
              entry.hasOwn = true;
            }
          }
        }
      }
    }

    // 6. Build city rows
    const result: CityData[] = [];
    for (const [city, entry] of cityMap.entries()) {
      const store_count = entry.stores.length;
      const unique_brands = entry.brands.size;
      const avg_products = store_count > 0
        ? Math.round(entry.stores.reduce((s, st) => s + (st.total_products ?? 0), 0) / store_count)
        : 0;
      const brands_per_store = store_count > 0 ? Math.round((unique_brands / store_count) * 10) / 10 : 0;

      let status: CityData["status"];
      if (brands_per_store > 30 || (unique_brands / Math.max(store_count, 1)) > 25) {
        status = "oversaturated";
      } else if (brands_per_store >= 10) {
        status = "healthy";
      } else {
        status = "underserved";
      }

      result.push({
        city,
        store_count,
        unique_brands,
        avg_products,
        brands_per_store,
        status,
        has_own_brand: entry.hasOwn,
      });
    }

    result.sort((a, b) => b.unique_brands - a.unique_brands);
    setRows(result);
    setLoading(false);
  }

  const filtered = rows.filter(r => !query || r.city.toLowerCase().includes(query.toLowerCase()));

  const oversaturated = rows.filter(r => r.status === "oversaturated").length;
  const healthy       = rows.filter(r => r.status === "healthy").length;
  const underserved   = rows.filter(r => r.status === "underserved").length;

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Oversaturated Cities", value: oversaturated, color: "text-destructive" },
          { label: "Healthy Markets",       value: healthy,       color: "text-success" },
          { label: "Underserved Markets",   value: underserved,   color: "text-warning" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Market Saturation by City</h2>
            <div className="header-underline mt-1" />
          </div>
          <div className="flex items-center gap-2">
            <input
              className="h-8 rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Filter city…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            <button
              onClick={() => exportCSV("saturation.csv", filtered)}
              className="flex items-center gap-1.5 h-8 rounded-md border border-border bg-background px-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
          </div>
        </div>

        {loading ? <Skeleton /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className={thCls}>City</th>
                  <th className={`${thCls} text-right`}>Stores</th>
                  <th className={`${thCls} text-right`}>Unique Brands</th>
                  <th className={`${thCls} text-right`}>Avg Products/Store</th>
                  <th className={`${thCls} text-right`}>Brands/Store</th>
                  <th className={thCls}>Status</th>
                  {orgId && <th className={thCls}>Own Brand</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(row => (
                  <tr key={row.city} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 font-medium">{row.city}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{row.store_count}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-primary">{row.unique_brands}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{row.avg_products}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{row.brands_per_store}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={row.status} /></td>
                    {orgId && (
                      <td className="px-4 py-2.5">
                        {row.has_own_brand ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary">Present</span>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">No cities found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
