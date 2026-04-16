import { useEffect, useState, useMemo, lazy, Suspense } from "react";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import { isExcludedBrand } from "@/lib/analytics-filters";
import { Users2, TrendingUp, TrendingDown, Minus, AlertCircle, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const CompetitorMap = lazy(() =>
  import("@/components/maps/CompetitorMap").then((m) => ({ default: m.CompetitorMap }))
);

// ── Types ────────────────────────────────────────────────────────────────────

interface UserBrand {
  id: string;
  brand_name: string;
  is_own_brand: boolean;
}

interface SnapshotProduct {
  n: string; // name
  b: string; // brand
  c: string; // category
  p: number; // price
}

interface Snapshot {
  intel_store_id: string;
  product_data: SnapshotProduct[];
  snapshot_date: string;
}

interface BrandStats {
  name: string;
  storeCount: number;
  avgPrice: number;
  categories: Set<string>;
  productCount: number;
  storeIds: Set<string>;
}

interface Alert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  body: string;
  brand_name: string | null;
  is_read: boolean;
  created_at: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function computeBrandStats(
  snapshotByStore: Record<string, Snapshot>,
  brandName: string
): BrandStats {
  const bn = brandName.toLowerCase();
  const storeIds = new Set<string>();
  const categories = new Set<string>();
  let totalPrice = 0;
  let priceCount = 0;
  let productCount = 0;

  for (const [storeId, snap] of Object.entries(snapshotByStore)) {
    const products = (snap.product_data ?? []).filter(
      (p) => p.b?.toLowerCase() === bn && !isExcludedBrand(p.b)
    );
    if (products.length > 0) {
      storeIds.add(storeId);
      for (const p of products) {
        productCount++;
        if (p.c) categories.add(p.c);
        if (p.p && p.p > 0) {
          totalPrice += p.p;
          priceCount++;
        }
      }
    }
  }

  return {
    name: brandName,
    storeCount: storeIds.size,
    avgPrice: priceCount > 0 ? totalPrice / priceCount : 0,
    categories,
    productCount,
    storeIds,
  };
}

function DeltaBadge({ value, inverse = false }: { value: number; inverse?: boolean }) {
  const positive = inverse ? value < 0 : value > 0;
  const neutral = value === 0;
  if (neutral) return <Minus className="w-3 h-3 text-muted-foreground" />;
  return positive ? (
    <TrendingUp className="w-3 h-3 text-success" />
  ) : (
    <TrendingDown className="w-3 h-3 text-destructive" />
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3 animate-pulse">
      <div className="h-4 bg-muted rounded w-1/3" />
      <div className="h-8 bg-muted rounded w-1/2" />
      <div className="h-3 bg-muted rounded w-2/3" />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function Competitors() {
  const { orgId } = useOrg();
  const navigate = useNavigate();

  const [ownBrands, setOwnBrands] = useState<UserBrand[]>([]);
  const [competitorBrands, setCompetitorBrands] = useState<UserBrand[]>([]);
  const [snapshotByStore, setSnapshotByStore] = useState<Record<string, Snapshot>>({});
  const [totalStores, setTotalStores] = useState(0);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const [selectedOwn, setSelectedOwn] = useState<string>("");
  const [selectedComp, setSelectedComp] = useState<string>("");

  // Load brands + snapshots on mount
  useEffect(() => {
    if (!orgId) return;

    async function load() {
      setLoading(true);

      const [brandsRes, snapsRes, storesRes] = await Promise.all([
        supabase
          .from("user_brands")
          .select("id, brand_name, is_own_brand")
          .eq("org_id", orgId),
        supabase
          .from("menu_snapshots")
          .select("intel_store_id, product_data, snapshot_date")
          .order("snapshot_date", { ascending: false })
          .limit(600),
        supabase
          .from("intel_stores")
          .select("id", { count: "exact", head: true }),
      ]);

      const brands: UserBrand[] = brandsRes.data ?? [];
      setOwnBrands(brands.filter((b) => b.is_own_brand));
      setCompetitorBrands(brands.filter((b) => !b.is_own_brand));

      // Keep only most recent snapshot per store
      const byStore: Record<string, Snapshot> = {};
      for (const s of snapsRes.data ?? []) {
        if (!byStore[s.intel_store_id]) byStore[s.intel_store_id] = s as Snapshot;
      }
      setSnapshotByStore(byStore);
      setTotalStores(storesRes.count ?? 0);

      // Set defaults
      const own = brands.filter((b) => b.is_own_brand);
      const comp = brands.filter((b) => !b.is_own_brand);
      if (own.length > 0) setSelectedOwn(own[0].brand_name);
      if (comp.length > 0) setSelectedComp(comp[0].brand_name);

      setLoading(false);
    }

    load();
  }, [orgId]);

  // Load alerts when brands change
  useEffect(() => {
    if (!selectedOwn && !selectedComp) return;
    const filters: string[] = [];
    if (selectedOwn) filters.push(selectedOwn);
    if (selectedComp) filters.push(selectedComp);

    async function loadAlerts() {
      const results = await Promise.all(
        filters.map((b) =>
          supabase
            .from("intel_alerts")
            .select("id, alert_type, severity, title, body, brand_name, is_read, created_at")
            .ilike("brand_name", `%${b}%`)
            .order("created_at", { ascending: false })
            .limit(5)
        )
      );
      const combined: Alert[] = [];
      const seen = new Set<string>();
      for (const r of results) {
        for (const a of r.data ?? []) {
          if (!seen.has(a.id)) { seen.add(a.id); combined.push(a as Alert); }
        }
      }
      combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setAlerts(combined.slice(0, 8));
    }

    loadAlerts();
  }, [selectedOwn, selectedComp]);

  // Compute stats from snapshots (memoized)
  const ownStats = useMemo(
    () => (selectedOwn ? computeBrandStats(snapshotByStore, selectedOwn) : null),
    [snapshotByStore, selectedOwn]
  );

  const compStats = useMemo(
    () => (selectedComp ? computeBrandStats(snapshotByStore, selectedComp) : null),
    [snapshotByStore, selectedComp]
  );

  // Overlap analysis
  const overlap = useMemo(() => {
    if (!ownStats || !compStats) return null;
    const ownOnly = new Set([...ownStats.storeIds].filter((id) => !compStats.storeIds.has(id)));
    const both = new Set([...ownStats.storeIds].filter((id) => compStats.storeIds.has(id)));
    const compOnly = new Set([...compStats.storeIds].filter((id) => !ownStats.storeIds.has(id)));
    return { ownOnly: ownOnly.size, both: both.size, compOnly: compOnly.size };
  }, [ownStats, compStats]);

  // All categories combined
  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    if (ownStats) ownStats.categories.forEach((c) => cats.add(c));
    if (compStats) compStats.categories.forEach((c) => cats.add(c));
    return [...cats].sort();
  }, [ownStats, compStats]);

  const noCompetitors = !loading && competitorBrands.length === 0;
  const noOwn = !loading && ownBrands.length === 0;

  const fmt$ = (n: number) => n > 0 ? `$${n.toFixed(2)}` : "N/A";
  const fmtN = (n: number) => n.toLocaleString();
  const coveragePct = (count: number) => totalStores > 0 ? `${((count / totalStores) * 100).toFixed(1)}%` : "N/A";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5 animate-fade-up">
      {/* Header */}
      <div>
        <h1 className="text-foreground">Competitor Monitoring</h1>
        <div className="header-underline mt-1" />
        <p className="text-sm text-muted-foreground mt-1">
          Head-to-head brand comparison across your store network
        </p>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* No own brands */}
      {!loading && noOwn && (
        <div className="rounded-xl border border-border bg-card p-10 text-center space-y-3">
          <Users2 className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">You haven't added any own brands yet.</p>
          <button
            onClick={() => navigate("/my-products")}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Go to My Products
          </button>
        </div>
      )}

      {/* No competitors */}
      {!loading && !noOwn && noCompetitors && (
        <div className="rounded-xl border border-border bg-card p-10 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="font-medium text-foreground">No competitors configured</p>
          <p className="text-sm text-muted-foreground">
            Add competitor brands in My Products to enable head-to-head comparisons.
          </p>
          <button
            onClick={() => navigate("/my-products")}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Add Competitors in My Products
          </button>
        </div>
      )}

      {!loading && !noOwn && !noCompetitors && (
        <>
          {/* ── Brand Selectors ── */}
          <div className="rounded-xl border border-border bg-card p-5 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 flex-1 min-w-48">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                Your Brand
              </span>
              <select
                value={selectedOwn}
                onChange={(e) => setSelectedOwn(e.target.value)}
                className="flex-1 px-2.5 py-1.5 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              >
                {ownBrands.map((b) => (
                  <option key={b.id} value={b.brand_name}>{b.brand_name}</option>
                ))}
              </select>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex items-center gap-2 flex-1 min-w-48">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                vs Competitor
              </span>
              <select
                value={selectedComp}
                onChange={(e) => setSelectedComp(e.target.value)}
                className="flex-1 px-2.5 py-1.5 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              >
                {competitorBrands.map((b) => (
                  <option key={b.id} value={b.brand_name}>{b.brand_name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Head-to-Head Metrics ── */}
          {ownStats && compStats && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-foreground">
                {selectedOwn} <span className="text-muted-foreground">vs</span> {selectedComp}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* Stores */}
                <MetricCard
                  label="Store Presence"
                  ownValue={fmtN(ownStats.storeCount)}
                  compValue={fmtN(compStats.storeCount)}
                  delta={ownStats.storeCount - compStats.storeCount}
                  deltaLabel={
                    ownStats.storeCount === compStats.storeCount
                      ? "Tied"
                      : ownStats.storeCount > compStats.storeCount
                      ? `You lead by ${ownStats.storeCount - compStats.storeCount} stores`
                      : `Competitor leads by ${compStats.storeCount - ownStats.storeCount} stores`
                  }
                />
                {/* Avg Price */}
                <MetricCard
                  label="Avg Price"
                  ownValue={fmt$(ownStats.avgPrice)}
                  compValue={fmt$(compStats.avgPrice)}
                  delta={ownStats.avgPrice > 0 && compStats.avgPrice > 0 ? ownStats.avgPrice - compStats.avgPrice : 0}
                  deltaLabel={
                    ownStats.avgPrice === 0 || compStats.avgPrice === 0
                      ? "No price data"
                      : ownStats.avgPrice > compStats.avgPrice
                      ? `You're $${(ownStats.avgPrice - compStats.avgPrice).toFixed(2)} higher`
                      : ownStats.avgPrice < compStats.avgPrice
                      ? `Competitor is $${(compStats.avgPrice - ownStats.avgPrice).toFixed(2)} higher`
                      : "Same price"
                  }
                  inverse
                />
                {/* Coverage */}
                <MetricCard
                  label="Network Coverage"
                  ownValue={coveragePct(ownStats.storeCount)}
                  compValue={coveragePct(compStats.storeCount)}
                  delta={ownStats.storeCount - compStats.storeCount}
                  deltaLabel={`of ${fmtN(totalStores)} tracked stores`}
                />
                {/* Categories */}
                <MetricCard
                  label="Categories"
                  ownValue={fmtN(ownStats.categories.size)}
                  compValue={fmtN(compStats.categories.size)}
                  delta={ownStats.categories.size - compStats.categories.size}
                  deltaLabel={
                    ownStats.categories.size === compStats.categories.size
                      ? "Same breadth"
                      : ownStats.categories.size > compStats.categories.size
                      ? `You cover ${ownStats.categories.size - compStats.categories.size} more categories`
                      : `Competitor covers ${compStats.categories.size - ownStats.categories.size} more`
                  }
                />
                {/* Products */}
                <MetricCard
                  label="Product Count"
                  ownValue={fmtN(ownStats.productCount)}
                  compValue={fmtN(compStats.productCount)}
                  delta={ownStats.productCount - compStats.productCount}
                  deltaLabel={
                    ownStats.productCount === compStats.productCount
                      ? "Equal listings"
                      : ownStats.productCount > compStats.productCount
                      ? `You have ${fmtN(ownStats.productCount - compStats.productCount)} more listings`
                      : `Competitor has ${fmtN(compStats.productCount - ownStats.productCount)} more`
                  }
                />
              </div>
            </div>
          )}

          {/* ── Category Presence Matrix ── */}
          {allCategories.length > 0 && ownStats && compStats && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <h2 className="text-sm font-medium text-foreground">Category Presence</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-sidebar">
                    <th className="text-left px-5 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                      Category
                    </th>
                    <th className="px-4 py-2 text-[10px] font-semibold text-primary uppercase tracking-widest text-center">
                      {selectedOwn}
                    </th>
                    <th className="px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest text-center">
                      {selectedComp}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {allCategories.map((cat) => (
                    <tr key={cat} className="hover:bg-accent/30 transition-colors">
                      <td className="px-5 py-2 text-foreground text-[13px]">{cat}</td>
                      <td className="px-4 py-2 text-center">
                        {ownStats.categories.has(cat) ? (
                          <span className="text-success font-medium text-[12px]">✓ present</span>
                        ) : (
                          <span className="text-muted-foreground/40 text-[12px]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {compStats.categories.has(cat) ? (
                          <span className="text-success font-medium text-[12px]">✓ present</span>
                        ) : (
                          <span className="text-muted-foreground/40 text-[12px]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Store Overlap Analysis ── */}
          {overlap && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <h2 className="text-sm font-medium text-foreground">Store Overlap</h2>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-success/30 bg-success/5 p-4 text-center space-y-1">
                  <div className="text-2xl font-bold text-success">{fmtN(overlap.ownOnly)}</div>
                  <div className="text-[10px] font-medium uppercase tracking-wider text-success/80">
                    Exclusive to You
                  </div>
                  <div className="text-[11px] text-muted-foreground">stores only you carry</div>
                </div>
                <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-center space-y-1">
                  <div className="text-2xl font-bold text-warning">{fmtN(overlap.both)}</div>
                  <div className="text-[10px] font-medium uppercase tracking-wider text-warning/80">
                    Competitive
                  </div>
                  <div className="text-[11px] text-muted-foreground">both brands present</div>
                </div>
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-center space-y-1">
                  <div className="text-2xl font-bold text-destructive">{fmtN(overlap.compOnly)}</div>
                  <div className="text-[10px] font-medium uppercase tracking-wider text-destructive/80">
                    Competitor Only
                  </div>
                  <div className="text-[11px] text-muted-foreground">stores you're missing</div>
                </div>
              </div>
            </div>
          )}

          {/* ── Competitor Map ── */}
          <Suspense fallback={
            <div className="h-[440px] rounded-xl border border-border bg-card/50 flex items-center justify-center">
              <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          }>
            <CompetitorMap
              ownBrand={selectedOwn}
              compBrand={selectedComp}
              snapshotByStore={snapshotByStore}
            />
          </Suspense>

          {/* ── Recent Alerts ── */}
          {alerts.length > 0 && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <h2 className="text-sm font-medium text-foreground">Recent Intel Alerts</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Alerts mentioning {[selectedOwn, selectedComp].filter(Boolean).join(" or ")}
                </p>
              </div>
              <div className="divide-y divide-border/50">
                {alerts.map((a) => (
                  <div key={a.id} className="px-5 py-3 space-y-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[13px] font-medium text-foreground">{a.title}</span>
                      <SeverityBadge severity={a.severity} />
                    </div>
                    {a.body && (
                      <p className="text-[12px] text-muted-foreground line-clamp-2">{a.body}</p>
                    )}
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      {a.brand_name && <span className="text-primary">{a.brand_name}</span>}
                      <span>{new Date(a.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({
  label,
  ownValue,
  compValue,
  delta,
  deltaLabel,
  inverse = false,
}: {
  label: string;
  ownValue: string;
  compValue: string;
  delta: number;
  deltaLabel: string;
  inverse?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-xl font-bold text-primary">{ownValue}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Your Brand</div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-foreground">{compValue}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Competitor</div>
        </div>
      </div>
      <div className="flex items-center gap-1 pt-1 border-t border-border">
        <DeltaBadge value={delta} inverse={inverse} />
        <span className="text-[11px] text-muted-foreground">{deltaLabel}</span>
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const cls =
    severity === "critical"
      ? "bg-destructive/10 text-destructive"
      : severity === "high"
      ? "bg-orange-500/10 text-orange-500"
      : severity === "medium"
      ? "bg-warning/10 text-warning"
      : "bg-muted text-muted-foreground";
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0 ${cls}`}>
      {severity}
    </span>
  );
}
