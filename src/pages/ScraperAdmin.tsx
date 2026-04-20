import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { IntelStore } from "@/lib/types";
import {
  CheckCircle2, AlertCircle, RefreshCw, Link2, Search, X, Zap, Clock, Play, ExternalLink,
} from "lucide-react";

// ─── Scraper configuration ────────────────────────────────────────────────────
// Post-Stage-6 (2026-04-20): 5 scrapers run nightly via pg_cron. Manual triggers
// stay available as admin buttons for testing / emergencies.

interface Scraper {
  id: "dutchie" | "jane" | "leafly" | "posabit" | "joint";
  label: string;
  color: string;
  description: string;
  cronJobName: string;              // pg_cron jobname
  edgeFunctionName: string;         // Supabase edge function name
  scheduleLabel: string;            // Human-readable "12:15 UTC"
}

const SCRAPERS: Scraper[] = [
  {
    id: "joint",
    label: "Joint",
    color: "hsl(var(--platform-joint, 0 72% 50%))",
    description: "WordPress plugin via /wp-json/joint-ecommerce/v1/. Chain-shared catalogs (CRAFT, Floyd's, DANK'S, LIDZ).",
    cronJobName: "cody-scrape-joint",
    edgeFunctionName: "scrape-joint",
    scheduleLabel: "12:00 UTC",
  },
  {
    id: "dutchie",
    label: "Dutchie",
    color: "hsl(var(--platform-dutchie))",
    description: "Dutchie Plus embed. Discovers via GraphQL, matches to LCB by address, fetches menus.",
    cronJobName: "cody-scrape-dutchie",
    edgeFunctionName: "scrape-dutchie",
    scheduleLabel: "12:15 UTC",
  },
  {
    id: "jane",
    label: "Jane",
    color: "hsl(var(--platform-jane))",
    description: "iHeartJane / tags.cnna.io embed. Detector refreshed in Sub-stage B (audit/43).",
    cronJobName: "cody-scrape-jane",
    edgeFunctionName: "scrape-jane",
    scheduleLabel: "12:30 UTC",
  },
  {
    id: "leafly",
    label: "Leafly",
    color: "hsl(var(--platform-leafly))",
    description: "Leafly dispensary-info widget. Mostly WA-specific direct embeds.",
    cronJobName: "cody-scrape-leafly",
    edgeFunctionName: "scrape-leafly",
    scheduleLabel: "12:45 UTC",
  },
  {
    id: "posabit",
    label: "POSaBit",
    color: "hsl(var(--platform-posabit))",
    description: "POSaBit MCX widget. Needs per-store credentials (merchant_slug, venue_slug, feed_id, merchant_token).",
    cronJobName: "cody-scrape-posabit",
    edgeFunctionName: "scrape-posabit",
    scheduleLabel: "13:00 UTC",
  },
];

// Platform lookup used in Unmatched-tab row badges.
const PLATFORM_INFO: Record<string, {
  letter: string; color: string; label: string; slugField: string; functionName: string;
}> = {
  dutchie:  { letter: "D", color: "hsl(var(--platform-dutchie))",  label: "Dutchie",  slugField: "dutchie_slug",    functionName: "scrape-dutchie"  },
  leafly:   { letter: "L", color: "hsl(var(--platform-leafly))",   label: "Leafly",   slugField: "leafly_slug",     functionName: "scrape-leafly"   },
  weedmaps: { letter: "W", color: "hsl(var(--platform-weedmaps))", label: "Weedmaps", slugField: "weedmaps_slug",   functionName: "scrape-weedmaps" },
  jane:     { letter: "J", color: "hsl(var(--platform-jane))",     label: "Jane",     slugField: "jane_store_id",   functionName: "scrape-jane"     },
};

interface UnmatchedDiscovery {
  id: string;
  platform: string;
  store_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  website: string | null;
  license_number: string | null;
  platform_slug: string | null;
  platform_id: string | null;
  latitude: number | null;
  longitude: number | null;
  discovered_at: string;
  matched: boolean;
  matched_intel_store_id: string | null;
}

interface ScraperStats {
  designated: number;      // intel_stores.designated_scraper = X
  eligible: number;        // + is_active + has_online_menu=true (what cron hits)
  withMenu: number;        // dispensary_menus rows joined by intel_store_id
  products: number;        // sum of dispensary_menus.menu_item_count
  lastScraped: string | null;  // max over per-platform *_last_scraped_at on v2 rows
}

interface TopKpis {
  total: number;
  active: number;
  inactive: number;
  designated: number;
  withMenu: number;
}

type AdminView = "platforms" | "unmatched";

function buildScrapeCandidate(d: UnmatchedDiscovery, intel: IntelStore): any | null {
  const base = {
    intelStoreId: intel.id,
    intelStoreName: intel.name,
    crm_contact_id: (intel as any).crm_contact_id ?? null,
    matchType: "manual",
    intelCity: intel.city ?? null,
    menuLastUpdated: null,
    currentPlatform: null,
  };
  if (d.platform === "dutchie")  return { ...base, dutchieId: d.platform_id, cName: d.platform_slug };
  if (d.platform === "leafly")   return { ...base, slug: d.platform_slug, leaflyName: d.store_name };
  if (d.platform === "weedmaps") return { ...base, slug: d.platform_slug, wmName: d.store_name, menuUrl: `https://weedmaps.com/dispensaries/${d.platform_slug}/menu` };
  if (d.platform === "jane")     return { ...base, janeStoreId: d.platform_id ?? d.platform_slug };
  return null;
}

function formatFreshness(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "< 1h ago";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ScraperAdmin() {
  const [kpis, setKpis] = useState<TopKpis | null>(null);
  const [stats, setStats] = useState<Record<string, ScraperStats>>({});
  const [loadingStats, setLoadingStats] = useState(true);
  const [manualTriggering, setManualTriggering] = useState<string | null>(null);
  const [manualResult, setManualResult] = useState<Record<string, { ok: boolean; msg: string; at: number }>>({});

  // Unmatched tab state
  const [activeView, setActiveView] = useState<AdminView>("platforms");
  const [unmatched, setUnmatched] = useState<UnmatchedDiscovery[]>([]);
  const [unmatchedLoading, setUnmatchedLoading] = useState(false);
  const [unmatchedPlatformFilter, setUnmatchedPlatformFilter] = useState("");
  const [allIntelStores, setAllIntelStores] = useState<IntelStore[]>([]);
  const [storesWithMenuIds, setStoresWithMenuIds] = useState<Set<string>>(new Set());
  const [storesAlreadyLinkedIds, setStoresAlreadyLinkedIds] = useState<Set<string>>(new Set());
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [linkQuery, setLinkQuery] = useState("");
  const [linkSelected, setLinkSelected] = useState<IntelStore | null>(null);
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkedRows, setLinkedRows] = useState<Record<string, IntelStore>>({});
  const [scrapingIds, setScrapingIds] = useState<Set<string>>(new Set());
  const [scrapedIds, setScrapedIds] = useState<Set<string>>(new Set());
  const [scrapeErrors, setScrapeErrors] = useState<Record<string, string>>({});

  const getCallParams = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not logged in");
    return { session, supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string, anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string };
  };

  // ── Stats loader ────────────────────────────────────────────────────────────

  const loadStats = useCallback(async () => {
    setLoadingStats(true);

    const [totalRes, activeRes, inactiveRes, designatedRes, storesRes, menusRes] = await Promise.all([
      supabase.from("intel_stores").select("id", { count: "exact", head: true }),
      supabase.from("intel_stores").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("intel_stores").select("id", { count: "exact", head: true }).eq("is_active", false),
      supabase.from("intel_stores").select("id", { count: "exact", head: true }).not("designated_scraper", "is", null),
      // Full store rows for per-scraper tallies. Only fields we need.
      supabase.from("intel_stores")
        .select("id, designated_scraper, is_active, has_online_menu, dutchie_last_scraped_at, jane_last_scraped_at, leafly_last_scraped_at, posabit_last_scraped_at, joint_last_scraped_at"),
      supabase.from("dispensary_menus")
        .select("intel_store_id, source, menu_item_count, last_scraped_at")
        .not("intel_store_id", "is", null),
    ]);

    const storesAll = (storesRes.data ?? []) as any[];
    const menus = (menusRes.data ?? []) as any[];

    const menuIds = new Set<string>();
    for (const m of menus) if (m.intel_store_id) menuIds.add(m.intel_store_id);

    setKpis({
      total: totalRes.count ?? 0,
      active: activeRes.count ?? 0,
      inactive: inactiveRes.count ?? 0,
      designated: designatedRes.count ?? 0,
      withMenu: menuIds.size,
    });

    const perScraper: Record<string, ScraperStats> = {};
    for (const sc of SCRAPERS) {
      const designated = storesAll.filter(s => s.designated_scraper === sc.id);
      const eligible = designated.filter(s => s.is_active === true && s.has_online_menu === true);
      const lastScrapedTs = designated
        .map(s => s[`${sc.id}_last_scraped_at`])
        .filter(Boolean)
        .sort()
        .at(-1) ?? null;
      // Source strings in dispensary_menus vary (e.g. "dutchie-api", "posabit-api",
      // "leafly", "jane-embed"). Match any row whose source contains the scraper id.
      const scraperMenus = menus.filter(m => (m.source ?? "").toLowerCase().includes(sc.id));
      const withMenuIds = new Set(scraperMenus.map(m => m.intel_store_id));
      const products = scraperMenus.reduce((s, m) => s + (m.menu_item_count ?? 0), 0);
      perScraper[sc.id] = {
        designated: designated.length,
        eligible: eligible.length,
        withMenu: withMenuIds.size,
        products,
        lastScraped: lastScrapedTs,
      };
    }
    setStats(perScraper);
    setLoadingStats(false);
  }, []);

  // ── Unmatched tab data ──────────────────────────────────────────────────────

  const loadUnmatched = useCallback(async () => {
    setUnmatchedLoading(true);
    const { data } = await supabase
      .from("intel_unmatched_discoveries")
      .select("*")
      .eq("matched", false)
      .order("platform")
      .order("store_name");
    setUnmatched((data as UnmatchedDiscovery[]) ?? []);
    setUnmatchedLoading(false);
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  useEffect(() => {
    if (activeView !== "unmatched") return;
    loadUnmatched();
    if (allIntelStores.length === 0) {
      Promise.all([
        supabase.from("intel_stores")
          .select("id, name, city, county, address, zip, phone, lcb_license_id, crm_contact_id, dutchie_slug, leafly_slug, weedmaps_slug, posabit_feed_key")
          .eq("status", "active").eq("is_active", true).order("name"),
        supabase.from("dispensary_menus").select("intel_store_id").not("intel_store_id", "is", null),
        supabase.from("intel_unmatched_discoveries").select("matched_intel_store_id").eq("matched", true).not("matched_intel_store_id", "is", null),
      ]).then(([storesRes, menusRes, linkedRes]) => {
        setAllIntelStores((storesRes.data as IntelStore[]) ?? []);
        setStoresWithMenuIds(new Set((menusRes.data ?? []).map((r: any) => r.intel_store_id as string)));
        setStoresAlreadyLinkedIds(new Set((linkedRes.data ?? []).map((r: any) => r.matched_intel_store_id as string)));
      });
    }
  }, [activeView, loadUnmatched, allIntelStores.length]);

  // ── Manual trigger ─────────────────────────────────────────────────────────
  // Calls the scrape edge function with action=scrape-all-designated — the same
  // path the pg_cron job uses nightly. Fires off; result noted in card footer.

  const handleManualTrigger = async (sc: Scraper) => {
    if (manualTriggering) return;
    if (!confirm(`Manually trigger ${sc.label} cron? This runs the same job that fires at ${sc.scheduleLabel} nightly. Used for testing or emergencies — normal flow is the cron schedule.`)) return;
    setManualTriggering(sc.id);
    try {
      const { session, supabaseUrl, anonKey } = await getCallParams();
      const res = await fetch(`${supabaseUrl}/functions/v1/${sc.edgeFunctionName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: anonKey,
        },
        body: JSON.stringify({ action: "scrape-all-designated" }),
      });
      const txt = await res.text();
      let parsed: any = null; try { parsed = JSON.parse(txt); } catch {}
      const msg = parsed
        ? (parsed.status ? `${parsed.status}${parsed.scraped != null ? ` · ${parsed.scraped} scraped` : ""}${parsed.products_saved != null ? ` · ${parsed.products_saved} products` : ""}` : txt.slice(0, 120))
        : txt.slice(0, 120);
      setManualResult(r => ({ ...r, [sc.id]: { ok: res.ok, msg: res.ok ? msg : `HTTP ${res.status}: ${msg}`, at: Date.now() } }));
      if (res.ok) setTimeout(() => loadStats(), 1500);
    } catch (e: any) {
      setManualResult(r => ({ ...r, [sc.id]: { ok: false, msg: e.message ?? String(e), at: Date.now() } }));
    } finally {
      setManualTriggering(null);
    }
  };

  // ── Linking handlers (Unmatched tab) ────────────────────────────────────────

  const handleStartLink = (discoveryId: string) => {
    setLinkingId(discoveryId); setLinkQuery(""); setLinkSelected(null);
  };
  const handleCancelLink = () => {
    setLinkingId(null); setLinkQuery(""); setLinkSelected(null);
  };
  const handleConfirmLink = async (discovery: UnmatchedDiscovery, intel: IntelStore) => {
    setLinkSaving(true);
    try {
      await supabase.from("intel_unmatched_discoveries")
        .update({ matched: true, matched_intel_store_id: intel.id })
        .eq("id", discovery.id);
      const pi = PLATFORM_INFO[discovery.platform];
      if (pi?.slugField && discovery.platform_slug) {
        await supabase.from("intel_stores")
          .update({ [pi.slugField]: discovery.platform_slug })
          .eq("id", intel.id);
      }
      setLinkedRows(prev => ({ ...prev, [discovery.id]: intel }));
      setUnmatched(prev => prev.filter(u => u.id !== discovery.id));
      setStoresAlreadyLinkedIds(prev => new Set([...prev, intel.id]));
      setLinkingId(null); setLinkQuery(""); setLinkSelected(null);
    } finally { setLinkSaving(false); }
  };
  const handleScrapeLinked = async (discovery: UnmatchedDiscovery) => {
    const intel = linkedRows[discovery.id];
    if (!intel) return;
    const pi = PLATFORM_INFO[discovery.platform];
    if (!pi?.functionName) return;
    const candidate = buildScrapeCandidate(discovery, intel);
    if (!candidate) return;
    setScrapingIds(prev => new Set([...prev, discovery.id]));
    setScrapeErrors(prev => { const n = { ...prev }; delete n[discovery.id]; return n; });
    try {
      const { session, supabaseUrl, anonKey } = await getCallParams();
      const res = await fetch(`${supabaseUrl}/functions/v1/${pi.functionName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: anonKey },
        body: JSON.stringify({ action: "scrape-batch", stores: [candidate] }),
      });
      if (res.ok) {
        const data = await res.json();
        if ((data.scraped ?? 0) > 0) {
          setScrapedIds(prev => new Set([...prev, discovery.id]));
          await loadStats();
        } else {
          setScrapeErrors(prev => ({ ...prev, [discovery.id]: data.results?.[0]?.status ?? "empty" }));
        }
      } else setScrapeErrors(prev => ({ ...prev, [discovery.id]: `HTTP ${res.status}` }));
    } catch (e: any) {
      setScrapeErrors(prev => ({ ...prev, [discovery.id]: e.message }));
    } finally {
      setScrapingIds(prev => { const s = new Set(prev); s.delete(discovery.id); return s; });
    }
  };

  // ── Linking search results ─────────────────────────────────────────────────

  const linkResults = useMemo<IntelStore[]>(() => {
    if (!linkQuery.trim() || allIntelStores.length === 0) return [];
    const q = linkQuery.toLowerCase().trim();
    const currentDiscovery = linkingId ? unmatched.find((u) => u.id === linkingId) : null;
    const platformSlugField = currentDiscovery ? PLATFORM_INFO[currentDiscovery.platform]?.slugField : null;
    return allIntelStores
      .filter((s) => {
        if (!`${s.name} ${s.city ?? ""} ${s.address ?? ""}`.toLowerCase().includes(q)) return false;
        if (storesWithMenuIds.has(s.id)) return false;
        if (storesAlreadyLinkedIds.has(s.id)) return false;
        if (platformSlugField && s[platformSlugField as keyof IntelStore]) return false;
        return true;
      })
      .slice(0, 8);
  }, [linkQuery, allIntelStores, linkingId, unmatched, storesWithMenuIds, storesAlreadyLinkedIds]);

  const filteredUnmatched = (unmatchedPlatformFilter
    ? unmatched.filter((u) => u.platform === unmatchedPlatformFilter)
    : unmatched
  ).filter((u) => !/sandbox|test|demo/i.test(u.store_name ?? ""));

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-foreground">Scraper Admin</h1>
          <div className="header-underline mt-1" />
          <p className="text-sm text-muted-foreground mt-1">
            Cron-driven scrapers run nightly 12:00–13:00 UTC against intel_stores (v2). Manual triggers available for testing.
          </p>
        </div>
        <button onClick={loadStats} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-accent text-muted-foreground transition-colors shrink-0">
          <RefreshCw className="w-3.5 h-3.5" />Refresh
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-1 border-b border-border">
        {(["platforms", "unmatched"] as AdminView[]).map((v) => (
          <button
            key={v}
            onClick={() => setActiveView(v)}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${activeView === v ? "bg-card border border-b-card border-border text-foreground -mb-px" : "text-muted-foreground hover:text-foreground"}`}
          >
            {v === "platforms" ? "Platforms" : (
              <span className="flex items-center gap-1.5">
                Unmatched
                {unmatched.length > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-warning/20 text-warning text-[10px] font-bold">
                    {unmatched.length}
                  </span>
                )}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── PLATFORMS VIEW ── */}
      {activeView === "platforms" && (
        <>
          {/* Top KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Total stores"      value={kpis?.total}      hint="v2 rows (post-swap)" />
            <KpiCard label="Active"            value={kpis?.active}     hint={`${kpis?.inactive ?? 0} deactivated`} />
            <KpiCard label="Designated"        value={kpis?.designated} hint={kpis ? `${Math.round((kpis.designated / Math.max(kpis.total, 1)) * 100)}% coverage` : ""} />
            <KpiCard label="With menu data"    value={kpis?.withMenu}   hint="in dispensary_menus" />
          </div>

          {/* Cron Status strip */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Cron schedule</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">5 scraper jobs run nightly, staggered 15 min apart starting 12:00 UTC.</p>
              </div>
              <a
                href="https://supabase.com/dashboard/project/dpglliwbgsdsofkjgaxj/integrations/cron/jobs"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                Supabase cron dashboard <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {SCRAPERS.map((sc) => (
                <div key={sc.id} className="rounded-md border border-border/70 bg-muted/20 p-2.5 flex flex-col gap-1">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: sc.color }}>
                    <Clock className="w-3 h-3" />{sc.label}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">{sc.scheduleLabel}</span>
                  <span className="text-[10px] text-muted-foreground">last: <span className={stats[sc.id]?.lastScraped ? "text-foreground" : "text-muted-foreground/60"}>{formatFreshness(stats[sc.id]?.lastScraped ?? null)}</span></span>
                </div>
              ))}
            </div>
          </div>

          {/* Platform cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {SCRAPERS.map((sc) => (
              <ScraperCard
                key={sc.id}
                scraper={sc}
                stats={stats[sc.id]}
                totalStores={kpis?.total ?? 0}
                manualActive={manualTriggering === sc.id}
                manualResult={manualResult[sc.id]}
                onManualTrigger={() => handleManualTrigger(sc)}
                loading={loadingStats}
              />
            ))}
          </div>

          {/* Weedmaps deprecated footer */}
          <div className="rounded-lg border border-dashed border-muted-foreground/20 bg-muted/10 px-4 py-3 text-[11px] text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground/80">Weedmaps · discontinued after Stage 4 (2026-04-19).</span>{" "}
            Historical data preserved in <code>intel_stores_archived</code> and <code>dispensary_menus</code>. 1 v2 store still carries a weedmaps designation from audit/40 detection — not actively scraped.
          </div>
        </>
      )}

      {/* ── UNMATCHED VIEW ── */}
      {activeView === "unmatched" && (
        <div className="space-y-3">
          {/* Platform filter */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[11px] text-muted-foreground mr-2">Filter:</span>
            <button
              onClick={() => setUnmatchedPlatformFilter("")}
              className={`px-2.5 py-1 rounded-full text-[11px] transition-colors ${!unmatchedPlatformFilter ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:bg-muted"}`}
            >
              All ({unmatched.length})
            </button>
            {Object.entries(PLATFORM_INFO).map(([plat, pi]) => {
              const count = unmatched.filter((u) => u.platform === plat).length;
              if (count === 0) return null;
              return (
                <button
                  key={plat}
                  onClick={() => setUnmatchedPlatformFilter(plat)}
                  className={`px-2.5 py-1 rounded-full text-[11px] transition-colors ${unmatchedPlatformFilter === plat ? "text-primary-foreground" : "hover:bg-muted"}`}
                  style={unmatchedPlatformFilter === plat
                    ? { background: pi.color, color: "white" }
                    : { background: pi.color + "22", color: pi.color }}
                >
                  {pi.label} ({count})
                </button>
              );
            })}
          </div>

          {/* How-it-works blurb */}
          <div className="rounded-lg px-4 py-3 text-[11px] text-muted-foreground leading-relaxed" style={{ background: "hsl(var(--primary) / 0.05)", border: "1px solid hsl(var(--primary) / 0.15)" }}>
            <span className="font-semibold text-foreground">Unmatched discoveries</span> — stores a platform scraper found but couldn't match to an LCB-licensed intel_stores row. Link manually, then run a one-off scrape to confirm the match.
          </div>

          {/* Table */}
          <div className="rounded-lg border border-border bg-card overflow-hidden shadow-premium">
            {unmatchedLoading ? (
              <div className="space-y-px">{[...Array(8)].map((_, i) => <div key={i} className="h-10 skeleton-shimmer" />)}</div>
            ) : filteredUnmatched.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                {unmatched.length === 0
                  ? "No unmatched stores — everything links cleanly right now"
                  : "No unmatched stores for this platform"}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--glass-border)" }} className="bg-sidebar">
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest w-8">Plt</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Store Name</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest hidden md:table-cell">City</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest hidden lg:table-cell">Address</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest hidden lg:table-cell">Slug</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest w-48">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filteredUnmatched.map((u) => {
                    const pi = PLATFORM_INFO[u.platform];
                    const isLinking = linkingId === u.id;
                    const linked = linkedRows[u.id];
                    const isScrapingThis = scrapingIds.has(u.id);
                    const wasScraped = scrapedIds.has(u.id);
                    const scrapeErr = scrapeErrors[u.id];

                    return (
                      <>
                        <tr key={u.id} className={`transition-colors duration-100 ${isLinking ? "bg-accent/20" : linked ? "bg-success/5" : "hover:bg-accent/30"}`}>
                          <td className="px-4 py-2.5">
                            {pi ? (
                              <span
                                className="inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-bold"
                                style={{ background: pi.color + "22", color: pi.color, border: `1px solid ${pi.color}66` }}
                                title={pi.label}
                              >{pi.letter}</span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">{u.platform}</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 font-medium text-foreground max-w-[180px] truncate">{u.store_name ?? "—"}</td>
                          <td className="px-4 py-2.5 text-muted-foreground capitalize hidden md:table-cell">{(u.city ?? "").toLowerCase() || "—"}</td>
                          <td className="px-4 py-2.5 text-muted-foreground text-xs max-w-[160px] truncate hidden lg:table-cell">{u.address ?? "—"}</td>
                          <td className="px-4 py-2.5 hidden lg:table-cell">
                            <span className="text-[10px] font-mono text-muted-foreground">{u.platform_slug ?? "—"}</span>
                          </td>
                          <td className="px-4 py-2.5">
                            {linked ? (
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] text-success flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  {linked.name.length > 14 ? linked.name.slice(0, 14) + "…" : linked.name}
                                </span>
                                {wasScraped ? (
                                  <span className="text-[10px] text-success">✓ scraped</span>
                                ) : scrapeErr ? (
                                  <span className="text-[10px] text-destructive" title={scrapeErr}>⚠ failed</span>
                                ) : (
                                  <button
                                    onClick={() => handleScrapeLinked(u)}
                                    disabled={isScrapingThis}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-primary-foreground transition-colors disabled:opacity-50"
                                    style={{ background: pi?.color ?? "#666" }}
                                  >
                                    {isScrapingThis ? (<><RefreshCw className="w-2.5 h-2.5 animate-spin" />Scraping…</>) : (<><Zap className="w-2.5 h-2.5" />Scrape Now</>)}
                                  </button>
                                )}
                              </div>
                            ) : isLinking ? (
                              <button onClick={handleCancelLink} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                                <X className="w-3 h-3" />Cancel
                              </button>
                            ) : (
                              <button
                                onClick={() => handleStartLink(u.id)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border border-border hover:bg-accent transition-colors text-muted-foreground"
                              >
                                <Link2 className="w-3 h-3" />Link
                              </button>
                            )}
                          </td>
                        </tr>

                        {isLinking && (
                          <tr key={`${u.id}-link`} className="bg-accent/10">
                            <td colSpan={6} className="px-4 py-3">
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                  <Search className="w-4 h-4 text-muted-foreground" />
                                  <input
                                    type="text"
                                    value={linkQuery}
                                    onChange={(e) => setLinkQuery(e.target.value)}
                                    placeholder="Search stores by name, city, or address…"
                                    className="flex-1 bg-transparent text-[12px] focus:outline-none text-foreground placeholder:text-muted-foreground/60"
                                    autoFocus
                                  />
                                </div>
                                {linkResults.length > 0 && (
                                  <div className="rounded-md border border-border bg-card shadow-sm overflow-hidden max-w-lg divide-y divide-border/50">
                                    {linkResults.map((s) => {
                                      const licNum = s.lcb_license_id ?? null;
                                      return (
                                        <button
                                          key={s.id}
                                          onClick={() => setLinkSelected(s)}
                                          className={`w-full text-left px-3 py-2.5 transition-colors hover:bg-accent/50 ${linkSelected?.id === s.id ? "bg-primary/10 border border-primary/30" : ""}`}
                                        >
                                          <div className="flex items-baseline gap-2 flex-wrap">
                                            <span className="text-[12px] font-semibold text-foreground">{s.name}</span>
                                            {licNum && <span className="text-[10px] font-mono text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded">#{licNum}</span>}
                                          </div>
                                          <div className="flex flex-wrap gap-x-2 gap-y-0 mt-0.5">
                                            {s.address && <span className="text-[11px] text-muted-foreground">{s.address}{s.city ? `, ${s.city.charAt(0).toUpperCase() + s.city.slice(1).toLowerCase()}` : ""}</span>}
                                            {s.county && <span className="text-[11px] text-muted-foreground/60">· {s.county.charAt(0).toUpperCase() + s.county.slice(1).toLowerCase()} Co.</span>}
                                            {s.phone && <span className="text-[11px] text-muted-foreground/60">· {s.phone}</span>}
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                                {linkQuery && linkResults.length === 0 && (
                                  <p className="text-[11px] text-muted-foreground">No matching stores found</p>
                                )}
                                {linkSelected && (() => {
                                  const licNum = linkSelected.lcb_license_id ?? null;
                                  return (
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-[11px] text-muted-foreground">
                                        Link to <span className="font-semibold text-foreground">{linkSelected.name}</span>
                                        {linkSelected.address ? ` — ${linkSelected.address}` : ""}
                                        {linkSelected.city ? `, ${linkSelected.city.charAt(0).toUpperCase() + linkSelected.city.slice(1).toLowerCase()}` : ""}
                                        {licNum ? ` · #${licNum}` : ""}
                                      </span>
                                      <button
                                        onClick={() => handleConfirmLink(u, linkSelected)}
                                        disabled={linkSaving}
                                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-40 transition-colors"
                                      >
                                        {linkSaving ? "Saving…" : "Confirm Link"}
                                      </button>
                                    </div>
                                  );
                                })()}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {Object.keys(linkedRows).length > 0 && (
            <div className="text-[11px] text-muted-foreground">
              {Object.keys(linkedRows).length} store{Object.keys(linkedRows).length !== 1 ? "s" : ""} linked this session
              {scrapedIds.size > 0 && ` · ${scrapedIds.size} scraped`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Small subcomponents ─────────────────────────────────────────────────────

function KpiCard({ label, value, hint }: { label: string; value: number | undefined; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-foreground mt-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        {value != null ? value.toLocaleString() : "—"}
      </p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

function ScraperCard({
  scraper, stats, totalStores, manualActive, manualResult, onManualTrigger, loading,
}: {
  scraper: Scraper;
  stats: ScraperStats | undefined;
  totalStores: number;
  manualActive: boolean;
  manualResult?: { ok: boolean; msg: string; at: number };
  onManualTrigger: () => void;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card flex flex-col gap-4 p-5 shadow-sm" style={{ borderTop: `3px solid ${scraper.color}` }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-foreground">{scraper.label}</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{scraper.description}</p>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
          <Clock className="w-3 h-3" />{scraper.scheduleLabel}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <StatTile value={stats?.designated} total={totalStores} label="Designated" color={scraper.color} loading={loading} />
        <StatTile value={stats?.eligible} label="Eligible" color={scraper.color} loading={loading} />
        <StatTile value={stats?.withMenu} label="With Menu" color={scraper.color} loading={loading} />
        <StatTile value={stats?.products} label="Products" color={scraper.color} loading={loading} />
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Last run: <span className={stats?.lastScraped ? "text-foreground" : "text-muted-foreground/60"}>{formatFreshness(stats?.lastScraped ?? null)}</span></span>
        <button
          onClick={onManualTrigger}
          disabled={manualActive}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium border border-border hover:bg-accent text-muted-foreground transition-colors disabled:opacity-40"
          title="Manually trigger this scraper's cron action — normal flow is the nightly schedule"
        >
          {manualActive ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          Run now
        </button>
      </div>

      {manualResult && (
        <div className={`rounded-md border px-2.5 py-2 text-[10px] ${manualResult.ok ? "border-success/30 bg-success/5 text-success-foreground" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>
          <span className="inline-flex items-center gap-1 font-mono">
            {manualResult.ok ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
            {manualResult.msg}
          </span>
        </div>
      )}
    </div>
  );
}

function StatTile({ value, total, label, color, loading }: { value: number | undefined; total?: number; label: string; color: string; loading: boolean }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2.5 text-center">
      <p className="text-lg font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color }}>
        {loading ? "…" : (value != null ? value.toLocaleString() : "—")}
      </p>
      <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">
        {total != null ? `${label} / ${total}` : label}
      </p>
    </div>
  );
}
