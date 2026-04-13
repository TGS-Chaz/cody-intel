import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { isExcludedBrand, isExcludedCategory } from "@/lib/analytics-filters";
import { useOrg } from "@/lib/org";
import { exportCSV } from "@/lib/export-csv";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from "recharts";
import { Download, Play, Save, Trash2, RotateCcw } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Dimension = "city" | "store" | "brand" | "category" | "platform";
type MetricKey = "product_count" | "brand_count" | "avg_price" | "store_count" | "coverage_pct";
type ViewType = "table" | "bar" | "pie";
type SortDir = "asc" | "desc";

interface ReportConfig {
  dimension: Dimension;
  metrics: MetricKey[];
  filterName: string;
  ownBrandsOnly: boolean;
  minStoreCount: number;
  viewType: ViewType;
  sortMetric: MetricKey | "";
  sortDir: SortDir;
}

interface SavedReport {
  id: string;
  name: string;
  config: ReportConfig;
  savedAt: string;
}

interface ResultRow {
  label: string;
  product_count?: number;
  brand_count?: number;
  avg_price?: number;
  store_count?: number;
  coverage_pct?: number;
  [key: string]: string | number | undefined;
}

interface ProductItem {
  n: string;
  b: string;
  c?: string;
  p?: number;
}

interface SnapshotRow {
  intel_store_id: string;
  product_data: ProductItem[] | null;
}

const TEMPLATES: Array<{ label: string; desc: string; config: Partial<ReportConfig> }> = [
  { label: "Market Saturation by City",   desc: "Stores, brands and product density per city",       config: { dimension: "city",     metrics: ["store_count","brand_count","product_count"] } },
  { label: "Brand Penetration",           desc: "How many stores carry each brand",                   config: { dimension: "brand",    metrics: ["store_count","coverage_pct"] } },
  { label: "Price Positioning",           desc: "Average, min and max prices by category",            config: { dimension: "category", metrics: ["avg_price","product_count","store_count"] } },
  { label: "Top Performing Stores",       desc: "Stores ranked by product count",                     config: { dimension: "store",    metrics: ["product_count"] } },
  { label: "Category Distribution",       desc: "Product and store counts by category",               config: { dimension: "category", metrics: ["product_count","store_count"] } },
  { label: "Platform Coverage",           desc: "How many stores and products per platform",          config: { dimension: "platform", metrics: ["store_count","product_count"] } },
];

const METRIC_LABELS: Record<MetricKey, string> = {
  product_count: "Product Count",
  brand_count:   "Brand Count",
  avg_price:     "Avg Price ($)",
  store_count:   "Store Count",
  coverage_pct:  "Coverage %",
};

const DIMENSION_LABELS: Record<Dimension, string> = {
  city: "City", store: "Store", brand: "Brand", category: "Category", platform: "Platform",
};

const COLORS = ["#00D4AA","#3BB143","#5C6BC0","#F7931A","#E91E63","#9C27B0","#00BCD4","#FF5722","#607D8B","#8BC34A"];

const DEFAULT_CONFIG: ReportConfig = {
  dimension: "city", metrics: ["store_count","product_count"],
  filterName: "", ownBrandsOnly: false, minStoreCount: 0,
  viewType: "table", sortMetric: "", sortDir: "desc",
};

const thCls = "text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest";

function Skeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-px">
      {[...Array(rows)].map((_, i) => <div key={i} className="h-9 skeleton-shimmer rounded" />)}
    </div>
  );
}

// ── Saved reports helpers ─────────────────────────────────────────────────────

const STORAGE_KEY = "cody-custom-reports";

function loadSaved(): SavedReport[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); }
  catch { return []; }
}

function saveSaved(reports: SavedReport[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
}

// ── Main component ────────────────────────────────────────────────────────────

export function CustomReportBuilder() {
  const { orgId } = useOrg();
  const [config, setConfig]           = useState<ReportConfig>(DEFAULT_CONFIG);
  const [results, setResults]         = useState<ResultRow[]>([]);
  const [loading, setLoading]         = useState(false);
  const [hasRun, setHasRun]           = useState(false);
  const [savedReports, setSavedReports] = useState<SavedReport[]>(loadSaved);
  const [saveName, setSaveName]       = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [totalStores, setTotalStores] = useState(0);

  // Load total store count once for coverage_pct
  useEffect(() => {
    supabase.from("intel_stores").select("id", { count: "exact", head: true })
      .then(({ count }) => setTotalStores(count ?? 0));
  }, []);

  const patch = (partial: Partial<ReportConfig>) =>
    setConfig(prev => ({ ...prev, ...partial }));

  const toggleMetric = (m: MetricKey) =>
    patch({ metrics: config.metrics.includes(m) ? config.metrics.filter(x => x !== m) : [...config.metrics, m] });

  function applyTemplate(t: typeof TEMPLATES[number]) {
    setConfig(prev => ({ ...prev, ...DEFAULT_CONFIG, ...t.config }));
    setResults([]);
    setHasRun(false);
  }

  // ── Data fetching ────────────────────────────────────────────────────────────

  const runReport = useCallback(async () => {
    setLoading(true);
    setHasRun(true);
    let rows: ResultRow[] = [];

    try {
      if (config.dimension === "city" || config.dimension === "store" || config.dimension === "platform") {
        const { data: stores } = await supabase
          .from("intel_stores")
          .select("id, name, city, total_products, data_source") as {
            data: { id: string; name: string; city: string | null; total_products: number | null; data_source: string | null }[] | null
          };

        if (stores) {
          if (config.dimension === "store") {
            rows = stores.map(s => ({
              label: s.name,
              product_count: s.total_products ?? 0,
              store_count: 1,
            }));
          } else if (config.dimension === "city") {
            const cityMap = new Map<string, { product_count: number; store_count: number }>();
            for (const s of stores) {
              const key = s.city ?? "Unknown";
              if (!cityMap.has(key)) cityMap.set(key, { product_count: 0, store_count: 0 });
              const e = cityMap.get(key)!;
              e.store_count++;
              e.product_count += s.total_products ?? 0;
            }
            rows = [...cityMap.entries()].map(([city, v]) => ({ label: city, ...v }));
          } else {
            // platform
            const platMap = new Map<string, { store_count: number; product_count: number }>();
            for (const s of stores) {
              const key = s.data_source ?? "unknown";
              if (!platMap.has(key)) platMap.set(key, { store_count: 0, product_count: 0 });
              const e = platMap.get(key)!;
              e.store_count++;
              e.product_count += s.total_products ?? 0;
            }
            rows = [...platMap.entries()].map(([plat, v]) => ({ label: plat, ...v }));
          }

          // coverage_pct
          if (config.metrics.includes("coverage_pct") && totalStores > 0) {
            rows = rows.map(r => ({ ...r, coverage_pct: Math.round(((r.store_count ?? 0) / totalStores) * 1000) / 10 }));
          }
        }
      } else if (config.dimension === "brand" || config.dimension === "category") {
        // Load recent snapshots for brand/category aggregation
        const { data: snapshots } = await supabase
          .from("menu_snapshots")
          .select("intel_store_id, product_data")
          .order("snapshot_date", { ascending: false })
          .limit(300) as { data: SnapshotRow[] | null };

        // Use only most recent snapshot per store
        const latestByStore = new Map<string, SnapshotRow>();
        for (const snap of (snapshots ?? [])) {
          if (!latestByStore.has(snap.intel_store_id)) latestByStore.set(snap.intel_store_id, snap);
        }

        const keyMap = new Map<string, { stores: Set<string>; prices: number[]; brands: Set<string> }>();

        for (const snap of latestByStore.values()) {
          if (!snap.product_data) continue;
          for (const item of snap.product_data) {
            const rawKey = config.dimension === "brand" ? item.b : (item.c ?? "Unknown");
            if (!rawKey) continue;
            if (config.dimension === "brand" && isExcludedBrand(rawKey)) continue;
            if (config.dimension === "category" && isExcludedCategory(rawKey)) continue;

            const key = rawKey.trim();
            if (!keyMap.has(key)) keyMap.set(key, { stores: new Set(), prices: [], brands: new Set() });
            const e = keyMap.get(key)!;
            e.stores.add(snap.intel_store_id);
            if (item.p != null && item.p > 0) e.prices.push(item.p);
            if (item.b) e.brands.add(item.b.toLowerCase());
          }
        }

        for (const [label, v] of keyMap.entries()) {
          const avgPrice = v.prices.length > 0
            ? Math.round((v.prices.reduce((a, b) => a + b, 0) / v.prices.length) * 100) / 100
            : undefined;
          rows.push({
            label,
            store_count: v.stores.size,
            product_count: v.prices.length,
            avg_price: avgPrice,
            brand_count: v.brands.size,
            coverage_pct: totalStores > 0 ? Math.round((v.stores.size / totalStores) * 1000) / 10 : undefined,
          });
        }
      }

      // Apply own brands filter
      if (config.ownBrandsOnly && orgId && config.dimension === "brand") {
        const { data: ub } = await supabase
          .from("user_brands")
          .select("brand_name")
          .eq("org_id", orgId)
          .eq("is_own_brand", true);
        const ownSet = new Set((ub as { brand_name: string }[] ?? []).map(r => r.brand_name.toLowerCase()));
        rows = rows.filter(r => ownSet.has(r.label.toLowerCase()));
      }

      // Filter by name
      if (config.filterName) {
        rows = rows.filter(r => r.label.toLowerCase().includes(config.filterName.toLowerCase()));
      }

      // Filter by min store count
      if (config.minStoreCount > 0) {
        rows = rows.filter(r => (r.store_count ?? 0) >= config.minStoreCount);
      }

      // Sort
      const sortKey = config.sortMetric || config.metrics[0];
      if (sortKey) {
        rows.sort((a, b) => {
          const av = (a[sortKey] ?? 0) as number;
          const bv = (b[sortKey] ?? 0) as number;
          return config.sortDir === "desc" ? bv - av : av - bv;
        });
      }

      setResults(rows);
    } finally {
      setLoading(false);
    }
  }, [config, orgId, totalStores]);

  // ── Save / load ──────────────────────────────────────────────────────────────

  function handleSave() {
    if (!saveName.trim()) return;
    const report: SavedReport = {
      id: Date.now().toString(),
      name: saveName.trim(),
      config,
      savedAt: new Date().toISOString(),
    };
    const updated = [report, ...savedReports];
    setSavedReports(updated);
    saveSaved(updated);
    setSaveName("");
    setShowSaveForm(false);
  }

  function handleDelete(id: string) {
    const updated = savedReports.filter(r => r.id !== id);
    setSavedReports(updated);
    saveSaved(updated);
  }

  function handleLoad(report: SavedReport) {
    setConfig(report.config);
    setResults([]);
    setHasRun(false);
  }

  // ── Chart data ───────────────────────────────────────────────────────────────

  const primaryMetric = config.metrics[0] as MetricKey | undefined;
  const chartData = results.slice(0, 20).map(r => ({
    name: r.label.length > 18 ? r.label.slice(0, 18) + "…" : r.label,
    value: primaryMetric ? (r[primaryMetric] as number ?? 0) : 0,
  }));

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* My Saved Reports */}
      {savedReports.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div>
            <h2 className="text-base font-semibold">My Reports</h2>
            <div className="header-underline mt-1" />
          </div>
          <div className="space-y-2">
            {savedReports.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 bg-background">
                <div>
                  <p className="text-sm font-medium">{r.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {DIMENSION_LABELS[r.config.dimension]} · {r.config.metrics.map(m => METRIC_LABELS[m]).join(", ")} · Saved {new Date(r.savedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleLoad(r)}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Load
                  </button>
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Templates */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold">Report Builder</h2>
          <div className="header-underline mt-1" />
          <p className="text-sm text-muted-foreground mt-1">Start from a template or configure manually below</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TEMPLATES.map(t => (
            <button
              key={t.label}
              onClick={() => applyTemplate(t)}
              className="text-left rounded-lg border border-border p-3 hover:border-primary/50 hover:bg-muted/30 transition-colors"
            >
              <p className="text-sm font-medium">{t.label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{t.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Builder panel */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <div>
          <h3 className="text-sm font-semibold">Configure</h3>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {/* Dimension */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Dimension (Group by)</label>
            <select
              value={config.dimension}
              onChange={e => patch({ dimension: e.target.value as Dimension })}
              className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {(Object.keys(DIMENSION_LABELS) as Dimension[]).map(d => (
                <option key={d} value={d}>{DIMENSION_LABELS[d]}</option>
              ))}
            </select>
          </div>

          {/* View type */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">View Type</label>
            <div className="flex gap-1 p-1 bg-muted/40 rounded-lg">
              {(["table","bar","pie"] as ViewType[]).map(v => (
                <button
                  key={v}
                  onClick={() => patch({ viewType: v })}
                  className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                    config.viewType === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Metrics</label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(METRIC_LABELS) as MetricKey[]).map(m => (
              <label key={m} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={config.metrics.includes(m)}
                  onChange={() => toggleMetric(m)}
                  className="rounded"
                />
                {METRIC_LABELS[m]}
              </label>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Search by Name</label>
            <input
              value={config.filterName}
              onChange={e => patch({ filterName: e.target.value })}
              placeholder={`Filter ${DIMENSION_LABELS[config.dimension].toLowerCase()}…`}
              className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Min Store Count</label>
            <input
              type="number"
              min={0}
              value={config.minStoreCount}
              onChange={e => patch({ minStoreCount: Number(e.target.value) })}
              className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {config.dimension === "brand" && orgId && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Own Brands</label>
              <label className="flex items-center gap-2 h-9 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={config.ownBrandsOnly}
                  onChange={e => patch({ ownBrandsOnly: e.target.checked })}
                  className="rounded"
                />
                Own brands only
              </label>
            </div>
          )}
        </div>

        {/* Sort */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Sort By</label>
            <select
              value={config.sortMetric}
              onChange={e => patch({ sortMetric: e.target.value as MetricKey | "" })}
              className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Default</option>
              {config.metrics.map(m => (
                <option key={m} value={m}>{METRIC_LABELS[m]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Direction</label>
            <div className="flex gap-1 p-1 bg-muted/40 rounded-lg">
              {(["desc","asc"] as SortDir[]).map(d => (
                <button
                  key={d}
                  onClick={() => patch({ sortDir: d })}
                  className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    config.sortDir === d ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {d === "desc" ? "High → Low" : "Low → High"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Run button */}
        <div className="flex items-center justify-end">
          <button
            onClick={runReport}
            disabled={loading || config.metrics.length === 0}
            className="flex items-center gap-2 px-5 py-2 rounded-md bg-primary text-black text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors"
          >
            <Play className="w-4 h-4" />
            {loading ? "Running…" : "Run Report"}
          </button>
        </div>
      </div>

      {/* Results */}
      {hasRun && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">
                Results — {DIMENSION_LABELS[config.dimension]}
                <span className="ml-2 text-sm text-muted-foreground font-normal">({results.length} rows)</span>
              </h2>
              <div className="header-underline mt-1" />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setShowSaveForm(!showSaveForm); setSaveName(""); }}
                className="flex items-center gap-1.5 h-8 rounded-md border border-border bg-background px-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                Save
              </button>
              <button
                onClick={() => exportCSV(`report-${config.dimension}.csv`, results)}
                className="flex items-center gap-1.5 h-8 rounded-md border border-border bg-background px-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>
          </div>

          {showSaveForm && (
            <div className="flex items-center gap-2">
              <input
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                placeholder="Report name…"
                onKeyDown={e => e.key === "Enter" && handleSave()}
                className="flex-1 h-8 rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={handleSave}
                disabled={!saveName.trim()}
                className="h-8 px-3 rounded-md bg-primary text-black text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors"
              >
                Save
              </button>
            </div>
          )}

          {loading ? <Skeleton /> : results.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No results found. Try adjusting your filters.</p>
          ) : config.viewType === "table" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className={thCls}>{DIMENSION_LABELS[config.dimension]}</th>
                    {config.metrics.map(m => (
                      <th key={m} className={`${thCls} text-right`}>{METRIC_LABELS[m]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {results.slice(0, 200).map((row, i) => (
                    <tr key={i} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 font-medium max-w-[200px] truncate">{row.label}</td>
                      {config.metrics.map(m => (
                        <td key={m} className="px-4 py-2.5 text-right text-muted-foreground">
                          {m === "avg_price" && row[m] != null ? `$${(row[m] as number).toFixed(2)}`
                            : m === "coverage_pct" && row[m] != null ? `${row[m]}%`
                            : (row[m] ?? "—") as React.ReactNode}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {results.length > 200 && (
                <p className="text-center text-xs text-muted-foreground py-3">Showing top 200 of {results.length} rows</p>
              )}
            </div>
          ) : config.viewType === "bar" ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 40, left: 8 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  />
                  <Bar dataKey="value" name={primaryMetric ? METRIC_LABELS[primaryMetric] : "Value"} radius={[4,4,0,0]}>
                    {chartData.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {chartData.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
