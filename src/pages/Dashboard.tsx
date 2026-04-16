import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Store, Package, TrendingUp, Bell, Zap, AlertTriangle, Info, BarChart2 } from "lucide-react";

const DashboardMap = lazy(() =>
  import("@/components/maps/DashboardMap").then((m) => ({ default: m.DashboardMap }))
);
import { MyDistribution } from "@/components/MyDistribution";
import { NormalizationStats } from "@/components/NormalizationStats";
import { WeightedDistribution } from "@/components/WeightedDistribution";
import { PlanGate } from "@/components/PlanGate";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import { isExcludedBrand } from "@/lib/analytics-filters";
import { callEdgeFunction } from "@/lib/edge-function";

// ── Types ──────────────────────────────────────────────────────────────────────

interface NormStats {
  processed: number;
  normalized: number;
  needsReview: number;
}

interface FastStats {
  totalStores: number;
  storesWithMenus: number;
  alertCount: number;
  topStores: { id: string; name: string; city: string; total_products: number | null; menu_last_updated: string | null }[];
  recentAlerts: { id: string; title: string; severity: string; alert_type: string; brand_name: string | null; created_at: string }[];
  freshness: string | null;
  normStats: NormStats | null;
}

interface UserBrand {
  id: string;
  brand_name: string;
  is_own_brand: boolean;
}

interface BrandPresence {
  brand_name: string;
  store_count: number;
}

interface MarketBrand {
  brand: string;
  store_count: number;
  product_count: number;
}

interface HeavyStats {
  brandPresence: BrandPresence[];
  ownBrandStoreTotal: number;
  marketBrands: MarketBrand[];
  snapshotDate: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── AnimatedCount ──────────────────────────────────────────────────────────────

function AnimatedCount({ value, delay = 0, suffix = "" }: { value: number; delay?: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (value === 0) { setDisplay(0); return; }
      const duration = 1000;
      const steps = 40;
      const increment = value / steps;
      let current = 0;
      const timer = setInterval(() => {
        current = Math.min(current + increment, value);
        setDisplay(Math.round(current));
        if (current >= value) clearInterval(timer);
      }, duration / steps);
      return () => clearInterval(timer);
    }, delay * 1000);
    return () => clearTimeout(timeout);
  }, [value, delay]);

  return <>{display.toLocaleString()}{suffix}</>;
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function HeroSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-36 rounded-xl skeleton-shimmer" />
      ))}
    </div>
  );
}

// ── Stagger variants ───────────────────────────────────────────────────────────

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] as [number, number, number, number] } },
};

// ── KPI Card — matches CRM stat card style exactly ────────────────────────────

interface KpiCardProps {
  icon: React.ElementType;
  iconColor: string;
  accentClass: string;
  label: string;
  value: number;
  suffix?: string;
  subtitle: string;
  subtleIcon?: React.ElementType;
  barWidth: string;
  barColor: string;
  delay: number;
  onClick?: () => void;
}

function KpiCard({
  icon: Icon, iconColor, accentClass, label, value, suffix = "", subtitle,
  barWidth, barColor, delay, onClick,
}: KpiCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      whileHover={{ y: -3, transition: { type: "spring", stiffness: 300, damping: 20 } }}
      onClick={onClick}
      className={`relative rounded-xl border border-border bg-card p-5 overflow-hidden transition-all duration-200 hover:border-primary/20 hover:shadow-lg ${accentClass} ${onClick ? "cursor-pointer" : ""}`}
      style={{ boxShadow: "inset 0 1px 0 var(--glass-bg)" }}
    >
      <Icon className="absolute right-3 top-3 w-14 h-14 opacity-[0.18]" style={{ color: iconColor }} />
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </p>
      <p className="text-[48px] font-extrabold leading-none text-foreground tabular-nums">
        <AnimatedCount value={value} delay={delay} suffix={suffix} />
      </p>
      <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p>
      <div className="mt-3 h-[3px] rounded-full bg-border overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: barColor }}
          initial={{ width: 0 }}
          animate={{ width: barWidth }}
          transition={{ delay: delay + 0.4, duration: 1, ease: [0.23, 1, 0.32, 1] }}
        />
      </div>
    </motion.div>
  );
}

// ── Section card shell ─────────────────────────────────────────────────────────

function SectionCard({
  title,
  subtitle,
  children,
  loading,
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  loading?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <motion.div
      variants={fadeUp}
      className="rounded-2xl p-5 flex flex-col gap-4"
      style={{
        background: "hsl(var(--card))",
        border: "1px solid var(--glass-border)",
        boxShadow: "0 4px 24px var(--shadow-color)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <div className="header-underline mt-1" />
          {subtitle && <p className="text-[10px] text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        {action}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-7 skeleton-shimmer rounded-lg" />
          ))}
        </div>
      ) : (
        children
      )}
    </motion.div>
  );
}

// ── Alert severity helpers ─────────────────────────────────────────────────────

function AlertIcon({ severity }: { severity: string }) {
  if (severity === "urgent") return <Zap className="w-3.5 h-3.5 shrink-0 text-destructive" />;
  if (severity === "warning") return <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-warning" />;
  if (severity === "info") return <Info className="w-3.5 h-3.5 shrink-0 text-info" />;
  return <Bell className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />;
}

function severityLabel(severity: string): { text: string; cls: string } {
  if (severity === "urgent") return { text: "Critical", cls: "bg-destructive/10 text-destructive" };
  if (severity === "warning") return { text: "Warning", cls: "bg-warning/10 text-warning" };
  if (severity === "info") return { text: "Info", cls: "bg-info/10 text-info" };
  return { text: "Notice", cls: "bg-muted text-muted-foreground" };
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export function Dashboard() {
  const navigate = useNavigate();
  const { orgId } = useOrg();

  const [fast, setFast] = useState<FastStats | null>(null);
  const [fastLoading, setFastLoading] = useState(true);
  const [normRunning, setNormRunning] = useState(false);

  const [userBrands, setUserBrands] = useState<UserBrand[]>([]);
  const [heavy, setHeavy] = useState<HeavyStats | null>(null);
  const [heavyLoading, setHeavyLoading] = useState(true);

  // ── Phase 1: fast queries ──────────────────────────────────────────────────
  const loadFast = useCallback(async () => {
    const [storesRes, storesWithMenuRes, alertsRes, topStoresRes, recentAlertsRes] = await Promise.all([
      supabase.from("intel_stores").select("id", { count: "exact", head: true }),
      supabase.from("intel_stores").select("id", { count: "exact", head: true }).not("total_products", "is", null).gt("total_products", 0),
      supabase.from("intel_alerts").select("id", { count: "exact", head: true }).eq("is_read", false),
      supabase.from("intel_stores").select("id, name, city, total_products, menu_last_updated").order("total_products", { ascending: false }).limit(5),
      supabase.from("intel_alerts").select("id, title, severity, alert_type, brand_name, created_at").order("created_at", { ascending: false }).limit(8),
    ]);

    // Also fetch user_brands and freshness
    const [brandsRes, freshRes, normRunRes] = await Promise.all([
      orgId
        ? supabase.from("user_brands").select("id, brand_name, is_own_brand").eq("org_id", orgId)
        : Promise.resolve({ data: [] as UserBrand[], error: null }),
      supabase.from("intel_stores").select("menu_last_updated").not("menu_last_updated", "is", null).order("menu_last_updated", { ascending: false }).limit(1),
      supabase.from("normalization_runs").select("items_processed, items_normalized, items_needing_review").order("run_at", { ascending: false }).limit(1),
    ]);

    setUserBrands((brandsRes.data as UserBrand[]) ?? []);

    const normRow = normRunRes.data?.[0] ?? null;
    setFast({
      totalStores: storesRes.count ?? 0,
      storesWithMenus: storesWithMenuRes.count ?? 0,
      alertCount: alertsRes.count ?? 0,
      topStores: (topStoresRes.data ?? []) as FastStats["topStores"],
      recentAlerts: (recentAlertsRes.data ?? []) as FastStats["recentAlerts"],
      freshness: (freshRes.data?.[0]?.menu_last_updated as string | null) ?? null,
      normStats: normRow ? {
        processed: normRow.items_processed ?? 0,
        normalized: normRow.items_normalized ?? 0,
        needsReview: normRow.items_needing_review ?? 0,
      } : null,
    });
    setFastLoading(false);
  }, [orgId]);

  useEffect(() => { loadFast(); }, [loadFast]);

  // ── Phase 2: heavy queries ─────────────────────────────────────────────────
  useEffect(() => {
    if (fastLoading) return; // wait for fast

    async function loadHeavy() {
      setHeavyLoading(true);

      // Get all menu IDs + store mapping for market pulse
      const { data: menus } = await supabase
        .from("dispensary_menus")
        .select("id, intel_store_id")
        .not("intel_store_id", "is", null);

      const menuToStore: Record<string, string> = {};
      const validMenuIds: string[] = [];
      for (const m of menus ?? []) {
        menuToStore[m.id] = m.intel_store_id;
        validMenuIds.push(m.id);
      }

      // Chunked menu_items load (chunks of 400 menu IDs)
      const CHUNK = 400;
      const allItems: { raw_brand: string | null; dispensary_menu_id: string }[] = [];
      for (let i = 0; i < validMenuIds.length; i += CHUNK) {
        const { data } = await supabase
          .from("menu_items")
          .select("raw_brand, dispensary_menu_id")
          .eq("is_on_menu", true)
          .in("dispensary_menu_id", validMenuIds.slice(i, i + CHUNK));
        if (data) allItems.push(...data);
      }

      // Brand → stores aggregation (for market pulse)
      const brandStores: Record<string, Set<string>> = {};
      const brandProducts: Record<string, number> = {};
      for (const item of allItems) {
        const b = item.raw_brand?.trim();
        if (!b || isExcludedBrand(b)) continue;
        if (!brandStores[b]) { brandStores[b] = new Set(); brandProducts[b] = 0; }
        const sid = menuToStore[item.dispensary_menu_id];
        if (sid) brandStores[b].add(sid);
        brandProducts[b]++;
      }
      const marketBrands: MarketBrand[] = Object.entries(brandStores)
        .map(([brand, stores]) => ({ brand, store_count: stores.size, product_count: brandProducts[brand] }))
        .sort((a, b) => b.store_count - a.store_count)
        .slice(0, 8);

      // Brand presence: for each own brand, count distinct stores via menu_items
      const ownBrands = userBrands.filter((b) => b.is_own_brand);
      let brandPresence: BrandPresence[] = [];
      let ownBrandStoreTotal = 0;

      if (ownBrands.length > 0 && validMenuIds.length > 0) {
        // One RPC call per own-brand. Replaces the chunked 14KB-URL query that
        // was blowing past PostgREST's URL-length cap on 130+ menu_ids.
        const presenceResults = await Promise.all(
          ownBrands.map(async (b) => {
            const { data, error } = await supabase.rpc("get_brand_store_count", {
              brand_name: b.brand_name,
            });
            if (error) return { brand_name: b.brand_name, store_count: 0 };
            return { brand_name: b.brand_name, store_count: (data as number) ?? 0 };
          })
        );
        brandPresence = presenceResults.sort((a, b) => b.store_count - a.store_count);
        // Total unique stores carrying any own brand
        const allOwnStores = new Set<string>();
        for (const item of allItems) {
          const b = item.raw_brand?.trim().toLowerCase();
          if (!b) continue;
          const match = ownBrands.find((ob) => ob.brand_name.toLowerCase() === b);
          if (match) {
            const sid = menuToStore[item.dispensary_menu_id];
            if (sid) allOwnStores.add(sid);
          }
        }
        ownBrandStoreTotal = allOwnStores.size;
      }

      // Snapshot date from daily_brand_metrics
      const { data: snapData } = await supabase
        .from("daily_brand_metrics")
        .select("date")
        .order("date", { ascending: false })
        .limit(1);
      const snapshotDate: string | null = snapData?.[0]?.date ?? null;

      setHeavy({ brandPresence, ownBrandStoreTotal, marketBrands, snapshotDate });
      setHeavyLoading(false);
    }

    loadHeavy();
  }, [fastLoading, userBrands]);

  // ── Computed values ────────────────────────────────────────────────────────
  const ownBrands = userBrands.filter((b) => b.is_own_brand);
  const maxBrandStores = heavy?.marketBrands[0]?.store_count ?? 1;
  const maxPresenceStores = heavy?.brandPresence[0]?.store_count ?? 1;
  const ownBrandNames = new Set(ownBrands.map((b) => b.brand_name.toLowerCase()));

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Intelligence Center</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Live market data across Washington state</p>
          </div>
          {fast?.freshness && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              Data updated {timeAgo(fast.freshness)}
            </div>
          )}
        </div>
        <div className="header-underline mt-3" />
      </div>

      {/* ── Hero KPI row ─────────────────────────────────────────────────────── */}
      {fastLoading ? (
        <HeroSkeleton />
      ) : (() => {
        const totalStores = fast?.totalStores ?? 0;
        const storesWithMenus = fast?.storesWithMenus ?? 0;
        const coveragePct = totalStores > 0 ? Math.round((storesWithMenus / totalStores) * 100) : 0;
        const ownBrandCount = ownBrands.length;
        const alertCount = fast?.alertCount ?? 0;
        return (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
            <KpiCard
              icon={Store}
              iconColor="hsl(var(--primary))"
              accentClass="stat-accent-teal"
              label="Total Stores"
              value={totalStores}
              subtitle="Active dispensaries"
              barColor="hsl(var(--primary))"
              barWidth={`${Math.min((totalStores / 500) * 100, 100)}%`}
              delay={0.1}
              onClick={() => navigate("/stores")}
            />
            <KpiCard
              icon={Package}
              iconColor="hsl(var(--info))"
              accentClass="stat-accent-blue"
              label="Products Tracked"
              value={storesWithMenus}
              subtitle="Stores with live menus"
              barColor="hsl(var(--info))"
              barWidth="80%"
              delay={0.18}
              onClick={() => navigate("/stores")}
            />
            <KpiCard
              icon={TrendingUp}
              iconColor="hsl(var(--chart-brand-b))"
              accentClass="stat-accent-amber"
              label="Your Brands"
              value={ownBrandCount}
              subtitle={ownBrandCount > 0 ? "Brands being tracked" : "Set up in My Products"}
              barColor="hsl(var(--chart-brand-b))"
              barWidth={`${Math.min(ownBrandCount * 20, 100)}%`}
              delay={0.26}
              onClick={() => navigate("/my-products")}
            />
            <KpiCard
              icon={Bell}
              iconColor={alertCount > 0 ? "hsl(var(--destructive))" : "hsl(var(--warning))"}
              accentClass=""
              label="Active Alerts"
              value={alertCount}
              subtitle={alertCount > 0 ? "Require attention" : "All clear"}
              barColor={alertCount > 0 ? "hsl(var(--destructive))" : "hsl(var(--warning))"}
              barWidth={`${Math.min(alertCount * 5, 100)}%`}
              delay={0.34}
              onClick={() => navigate("/alerts")}
            />
            <KpiCard
              icon={BarChart2}
              iconColor="hsl(var(--success))"
              accentClass="stat-accent-emerald"
              label="Coverage"
              value={coveragePct}
              suffix="%"
              subtitle="Stores with menu data"
              barColor="hsl(var(--success))"
              barWidth={`${coveragePct}%`}
              delay={0.42}
              onClick={() => navigate("/reports")}
            />
          </div>
        );
      })()}

      {/* ── Data Quality strip ──────────────────────────────────────────────── */}
      {!fastLoading && fast?.normStats && (
        <div className="rounded-xl border border-border bg-card px-5 py-3 flex items-center gap-6 text-sm">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Data Quality</span>
          <span className="text-foreground"><strong>{fast.normStats.normalized.toLocaleString()}</strong> products normalized</span>
          {fast.normStats.needsReview > 0 && (
            <span className="text-warning"><strong>{fast.normStats.needsReview}</strong> need review</span>
          )}
          <button
            onClick={async () => {
              setNormRunning(true);
              try {
                await callEdgeFunction("normalize-products", {});
                await loadFast();
              } finally {
                setNormRunning(false);
              }
            }}
            disabled={normRunning}
            className="ml-auto text-xs text-primary hover:text-primary/80 disabled:opacity-50 transition-colors"
          >
            {normRunning ? "Running…" : "Run Normalizer"}
          </button>
        </div>
      )}

      {/* ── My Distribution (Feature 1) ─────────────────────────────────────── */}
      {orgId && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4">
          <MyDistribution orgId={orgId} />
          <PlanGate feature="weighted_distribution">
            <WeightedDistribution orgId={orgId} />
          </PlanGate>
        </div>
      )}

      {/* ── Catalog Mastering (Feature 2) ───────────────────────────────────── */}
      <NormalizationStats />

      {/* ── Market Map ──────────────────────────────────────────────────────── */}
      <Suspense fallback={
        <div className="rounded-xl border border-border bg-card/50 h-[476px] flex items-center justify-center">
          <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      }>
        <DashboardMap />
      </Suspense>

      {/* ── Brand Performance + Market Pulse ────────────────────────────────── */}
      <motion.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-4"
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
      >
        {/* Your Brand Performance */}
        <SectionCard
          title="Your Brand Performance"
          subtitle={heavy?.snapshotDate ? `Live data` : undefined}
          loading={heavyLoading}
        >
          {ownBrands.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center gap-3">
              <Package className="w-10 h-10 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">No brands configured yet</p>
              <p className="text-xs text-muted-foreground/70">
                Add your brands in My Products to track performance
              </p>
              <button
                onClick={() => navigate("/my-products")}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors mt-1"
              >
                Set Up My Brands
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {heavy?.brandPresence.map((bp) => (
                <div key={bp.brand_name} className="flex items-center gap-3 py-2">
                  <p className="text-[12px] font-medium text-foreground w-32 shrink-0 truncate">
                    {bp.brand_name}
                  </p>
                  <div className="flex-1 bg-secondary rounded-full h-1.5 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: "hsl(var(--primary))" }}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.round((bp.store_count / maxPresenceStores) * 100)}%` }}
                      transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
                    />
                  </div>
                  <span className="text-[11px] font-semibold tabular-nums text-foreground/80 w-16 text-right shrink-0">
                    {bp.store_count} stores
                  </span>
                </div>
              ))}
              {heavy && (
                <p className="text-[10px] text-muted-foreground mt-3 pt-2 border-t border-border/50">
                  {heavy.ownBrandStoreTotal.toLocaleString()} total stores carry your brands across{" "}
                  {ownBrands.length} brand{ownBrands.length !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          )}
        </SectionCard>

        {/* Market Pulse */}
        <SectionCard
          title="Market Pulse"
          subtitle={
            heavy?.snapshotDate
              ? `Live Market • Updated ${timeAgo(heavy.snapshotDate)}`
              : "Top brands by store presence"
          }
          loading={heavyLoading}
        >
          <div className="space-y-1">
            {heavy?.marketBrands.map((mb, i) => {
              const isOwn = ownBrandNames.has(mb.brand.toLowerCase());
              return (
                <div
                  key={mb.brand}
                  className={`flex items-center gap-3 py-2 px-2 rounded-lg transition-colors ${
                    isOwn
                      ? "bg-teal-500/10"
                      : "hover:bg-accent/30"
                  }`}
                >
                  <span className="text-[10px] font-bold text-muted-foreground/50 w-4 shrink-0">
                    {i + 1}
                  </span>
                  <p
                    className={`text-[12px] font-medium flex-1 min-w-0 truncate ${
                      isOwn ? "text-teal-500" : "text-foreground"
                    }`}
                  >
                    {mb.brand}
                  </p>
                  <div className="w-20 bg-secondary rounded-full h-1 overflow-hidden shrink-0">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: isOwn ? "hsl(var(--primary))" : "hsl(var(--chart-brand-b))" }}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.round((mb.store_count / maxBrandStores) * 100)}%` }}
                      transition={{ duration: 0.8, delay: i * 0.05, ease: [0.23, 1, 0.32, 1] }}
                    />
                  </div>
                  <span className="text-[11px] tabular-nums text-muted-foreground w-14 text-right shrink-0">
                    {mb.store_count} stores
                  </span>
                </div>
              );
            })}
            {(!heavy?.marketBrands || heavy.marketBrands.length === 0) && !heavyLoading && (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <BarChart2 className="w-8 h-8 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">No market data available yet</p>
              </div>
            )}
          </div>
        </SectionCard>
      </motion.div>

      {/* ── Top Stores + Recent Alerts ───────────────────────────────────────── */}
      <motion.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-4"
        initial="hidden"
        animate="visible"
        variants={{ ...staggerContainer, visible: { transition: { staggerChildren: 0.08, delayChildren: 0.2 } } }}
      >
        {/* Top Stores */}
        <SectionCard title="Top Stores" subtitle="By product count" loading={fastLoading}>
          <div className="divide-y divide-border/40">
            {fast?.topStores.map((store, i) => (
              <div key={store.id} className="flex items-center gap-3 py-2.5 last:pb-0 first:pt-0">
                <span className="text-[11px] font-bold text-muted-foreground/50 w-4 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-foreground truncate">{store.name}</p>
                  <p className="text-[10px] text-muted-foreground">{store.city}</p>
                </div>
                <span className="text-[11px] font-semibold tabular-nums text-foreground/80 shrink-0">
                  {store.total_products?.toLocaleString() ?? "—"}
                </span>
              </div>
            ))}
            {(!fast?.topStores || fast.topStores.length === 0) && (
              <p className="text-xs text-muted-foreground py-8 text-center">No store data available</p>
            )}
          </div>
        </SectionCard>

        {/* Recent Alerts */}
        <SectionCard
          title="Recent Alerts"
          subtitle={fast?.alertCount ? `${fast.alertCount} unread` : "All clear"}
          loading={fastLoading}
          action={
            <button
              onClick={() => navigate("/alerts")}
              className="text-[10px] font-medium text-primary hover:text-primary/80 transition-colors"
            >
              View All
            </button>
          }
        >
          {(!fast?.recentAlerts || fast.recentAlerts.length === 0) ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <Bell className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">No alerts — everything looks good</p>
            </div>
          ) : (
            <div className="space-y-1">
              {fast.recentAlerts.map((alert) => {
                const sev = severityLabel(alert.severity);
                return (
                <div
                  key={alert.id}
                  className="flex items-start gap-2.5 py-2 px-2 rounded-lg bg-transparent hover:bg-accent/20 transition-colors"
                >
                  <div className="mt-0.5 shrink-0">
                    <AlertIcon severity={alert.severity} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${sev.cls}`}>{sev.text}</span>
                      <p className="text-[12px] font-medium text-foreground truncate">{alert.title}</p>
                    </div>
                    {alert.brand_name && (
                      <p className="text-[10px] text-muted-foreground truncate">{alert.brand_name}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                    {timeAgo(alert.created_at)}
                  </span>
                </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </motion.div>
    </div>
  );
}
