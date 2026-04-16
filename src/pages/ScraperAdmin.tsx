import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import type { IntelStore } from "@/lib/types";
import {
  Play, Square, CheckCircle2, AlertCircle, RefreshCw, AlertTriangle,
  Layers, Link2, Search, X, Zap, Globe,
} from "lucide-react";

// ─── Platform definitions ─────────────────────────────────────────────────────

interface Platform {
  id: string;
  label: string;
  source: string;
  color: string;
  description: string;
  functionName: string;
  batchSize: number;
  blocked?: string;
}

const PLATFORMS: Platform[] = [
  {
    id: "dutchie",
    label: "Dutchie",
    source: "dutchie-api",
    color: "hsl(var(--platform-dutchie))",
    description: "Discovers WA stores via Dutchie GraphQL API, matches to LCB stores by address, fetches complete menus",
    functionName: "scrape-dutchie",
    batchSize: 10,
  },
  {
    id: "posabit",
    label: "POSaBit",
    source: "posabit-api",
    color: "hsl(var(--platform-posabit))",
    description: "Scans intel_stores websites for POSaBit embeds, fetches menus via MCX API",
    functionName: "scrape-posabit",
    batchSize: 2,
  },
  {
    id: "leafly",
    label: "Leafly",
    source: "leafly",
    color: "hsl(var(--platform-leafly))",
    description: "Discovers WA dispensaries via Leafly WA state page, matches to LCB stores, fetches complete menus",
    functionName: "scrape-leafly",
    batchSize: 4,
  },
  {
    id: "weedmaps",
    label: "Weedmaps",
    source: "weedmaps",
    color: "hsl(var(--platform-weedmaps))",
    description: "Discovers WA dispensaries via Weedmaps directory, matches to LCB stores, fetches complete menus",
    functionName: "scrape-weedmaps",
    batchSize: 5,
  },
  {
    id: "jane",
    label: "Jane",
    source: "jane-embed",
    color: "hsl(var(--platform-jane))",
    description: "iHeartJane menus via the /embed/stores/{id}/menu page — no proxy needed",
    functionName: "scrape-jane",
    batchSize: 3,
  },
];

const SCRAPE_ALL_PLATFORMS = PLATFORMS.filter((p) => !p.blocked);
const TOTAL_STORES = 458;

// Platform info for unmatched view
const PLATFORM_INFO: Record<string, { letter: string; color: string; label: string; slugField: string; functionName: string }> = {
  dutchie:  { letter: "D", color: "hsl(var(--platform-dutchie))",  label: "Dutchie",   slugField: "dutchie_slug",   functionName: "scrape-dutchie"  },
  leafly:   { letter: "L", color: "hsl(var(--platform-leafly))",   label: "Leafly",    slugField: "leafly_slug",    functionName: "scrape-leafly"   },
  weedmaps: { letter: "W", color: "hsl(var(--platform-weedmaps))", label: "Weedmaps",  slugField: "weedmaps_slug",  functionName: "scrape-weedmaps" },
  jane:     { letter: "J", color: "hsl(var(--platform-jane))",     label: "Jane",      slugField: "jane_store_id",  functionName: "scrape-jane"     },
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlatformStats {
  storesLinked: number;
  productsScraped: number;
  lastScraped: string | null;
}

type RunState = "idle" | "running" | "done" | "error";

interface RunStatus {
  state: RunState;
  message: string;
  progressText?: string;
}

interface ScrapeAllState {
  running: boolean;
  platformIdx: number;
  progressText: string;
  totalScraped: number;
  totalProducts: number;
  done: boolean;
  error?: string;
}

type LogEntryStatus = "saved" | "skipped" | "failed" | "empty" | "no-widget";

interface LogEntry {
  storeName: string;
  city?: string | null;
  status: LogEntryStatus;
  products?: number;
  reason?: string;
  existingSource?: string;
  timestamp: number;
}

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

type AdminView = "platforms" | "unmatched";

// ─── Scrape log ───────────────────────────────────────────────────────────────

function ScrapeLog({ entries }: { entries: LogEntry[] }) {
  if (entries.length === 0) return null;
  const icon = (s: LogEntryStatus) => {
    if (s === "saved")     return "✅";
    if (s === "skipped")   return "⏭️";
    if (s === "empty")     return "⬜";
    if (s === "no-widget") return "🔍";
    return "❌";
  };
  return (
    <div className="mt-1 max-h-44 overflow-y-auto rounded-md bg-muted/20 border border-border/40 p-2 space-y-0.5 font-mono text-[10px]">
      {[...entries].reverse().map((e, i) => (
        <div key={i} className="flex items-baseline gap-1.5 leading-relaxed">
          <span className="shrink-0">{icon(e.status)}</span>
          <span className="font-semibold text-foreground truncate">{e.storeName}</span>
          {e.city && <span className="text-muted-foreground shrink-0">{e.city}</span>}
          {e.status === "saved" && e.products != null && (
            <span className="text-muted-foreground shrink-0">· {e.products} products</span>
          )}
          {e.reason && <span className="text-muted-foreground/70 italic truncate">· {e.reason}</span>}
        </div>
      ))}
    </div>
  );
}

// ─── Core scrape helper ───────────────────────────────────────────────────────

async function runPlatformBatch(
  platform: Platform,
  session: { access_token: string },
  supabaseUrl: string,
  anonKey: string,
  signal: AbortSignal,
  onProgress: (text: string) => void,
  onStatsRefresh: () => Promise<void>,
  onBatchDone: (entries: LogEntry[]) => void,
): Promise<{ totalScraped: number; totalProducts: number }> {
  const fnUrl = `${supabaseUrl}/functions/v1/${platform.functionName}`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
    apikey: anonKey,
  };

  onProgress("Discovering stores...");
  const discoverRes = await fetch(fnUrl, { method: "POST", headers, body: JSON.stringify({ action: "discover" }), signal });
  const discoverData = await discoverRes.json();
  if (!discoverRes.ok) throw new Error(discoverData.error ?? `Discover HTTP ${discoverRes.status}`);

  const candidates: any[] = discoverData.candidates ?? [];
  if (candidates.length === 0) {
    onProgress("No matching stores found");
    return { totalScraped: 0, totalProducts: 0 };
  }

  const totalBatches = Math.ceil(candidates.length / platform.batchSize);
  let totalScraped = 0, totalProducts = 0;

  for (let b = 0; b < totalBatches; b++) {
    if (signal.aborted) break;
    onProgress(`Batch ${b + 1}/${totalBatches} · ${totalScraped} scraped · ${totalProducts.toLocaleString()} products`);
    const batch = candidates.slice(b * platform.batchSize, (b + 1) * platform.batchSize);
    const batchRes = await fetch(fnUrl, { method: "POST", headers, body: JSON.stringify({ action: "scrape-batch", stores: batch }), signal });
    if (batchRes.ok) {
      const batchData = await batchRes.json();
      totalScraped += batchData.scraped ?? 0;
      totalProducts += batchData.products_saved ?? 0;
      const entries: LogEntry[] = (batchData.results ?? []).map((r: any): LogEntry => {
        const s = r.status ?? "";
        let status: LogEntryStatus = "saved";
        if (s === "skipped") status = "skipped";
        else if (s === "empty-menu") status = "empty";
        else if (s === "no-widget") status = "no-widget";
        else if (s === "success") status = "saved";
        else status = "failed";
        return { storeName: r.store ?? "Unknown", city: r.city ?? null, status, products: r.products, reason: r.reason, existingSource: r.existingSource, timestamp: Date.now() };
      });
      if (entries.length > 0) onBatchDone(entries);
    }
    await onStatsRefresh();
  }
  return { totalScraped, totalProducts };
}

// ─── POSaBit fast-scan + per-store scrape pipeline ──────────────────────────
// Replaces the old discover/scrape-batch loop. Two phases:
//   1. fast-scan populates posabit credentials on intel_stores in seconds
//   2. scrape-posabit-single runs per store that now has a merchant_token
async function runPosabitFastBatch(
  session:       { access_token: string },
  supabaseUrl:   string,
  anonKey:       string,
  signal:        AbortSignal,
  onProgress:    (text: string) => void,
  onStatsRefresh: () => Promise<void>,
  onBatchDone:   (entries: LogEntry[]) => void,
): Promise<{ totalScraped: number; totalProducts: number }> {
  const fnUrl = `${supabaseUrl}/functions/v1/scrape-posabit`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
    apikey: anonKey,
  };

  // Phase 1 — fast-scan populates posabit_merchant_token on intel_stores
  onProgress("Fast-scanning stores for POSaBit widgets…");
  const scanRes = await fetch(fnUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "fast-scan", limit: 500, onlyMissing: true }),
    signal,
  });
  const scanData = await scanRes.json();
  if (!scanRes.ok) throw new Error(scanData.error ?? `fast-scan HTTP ${scanRes.status}`);

  const newlyCredentialed = (scanData.results ?? [])
    .filter((r: any) => r.hasPosabit && r.config?.merchant_token);

  // Surface scan results as log entries up front
  onBatchDone(newlyCredentialed.map((r: any): LogEntry => ({
    storeName: r.name,
    city:      r.city ?? null,
    status:    "saved",
    reason:    `credentials captured · ${r.detectedUrl ?? ""}`,
    timestamp: Date.now(),
  })));

  // Phase 2 — scrape every store with a persisted merchant_token.
  // Uses a direct supabase read to fetch all posabit-enabled stores (existing +
  // new from phase 1), because a single store may already have had creds.
  const { data: readyStores } = await supabase
    .from("intel_stores")
    .select("id, name, city")
    .eq("status", "active")
    .not("posabit_merchant_token", "is", null);

  const stores = (readyStores ?? []) as Array<{ id: string; name: string; city: string | null }>;
  if (!stores.length) {
    onProgress(`No stores with POSaBit credentials yet · scanned ${scanData.scanned ?? 0}`);
    return { totalScraped: 0, totalProducts: 0 };
  }

  let totalScraped = 0, totalProducts = 0;
  for (let i = 0; i < stores.length; i++) {
    if (signal.aborted) break;
    const s = stores[i];
    onProgress(`Scraping ${s.name}${s.city ? `, ${s.city}` : ""} · ${i + 1}/${stores.length} · ${totalProducts.toLocaleString()} products`);
    try {
      const r = await fetch(fnUrl, {
        method: "POST",
        headers,
        // storeId-only; scrape-posabit-single reads creds from intel_stores row
        body: JSON.stringify({ action: "scrape-posabit-single", storeId: s.id }),
        signal,
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.status === "success") {
        totalScraped  += 1;
        totalProducts += data.products_saved ?? 0;
        onBatchDone([{
          storeName: s.name, city: s.city,
          status: "saved", products: data.products_saved,
          timestamp: Date.now(),
        }]);
      } else if (data.status === "empty-menu") {
        onBatchDone([{
          storeName: s.name, city: s.city,
          status: "empty", reason: "empty menu", timestamp: Date.now(),
        }]);
      } else {
        onBatchDone([{
          storeName: s.name, city: s.city,
          status: "failed", reason: data.error ?? `HTTP ${r.status}`, timestamp: Date.now(),
        }]);
      }
    } catch (err: any) {
      if (err.name === "AbortError") break;
      onBatchDone([{
        storeName: s.name, city: s.city,
        status: "failed", reason: err.message, timestamp: Date.now(),
      }]);
    }
    // Refresh dashboard stats every 5 stores
    if (i % 5 === 4) await onStatsRefresh();
  }

  await onStatsRefresh();
  return { totalScraped, totalProducts };
}

// ─── Build scrape candidate from unmatched discovery ─────────────────────────

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

// ─── Platform Card ────────────────────────────────────────────────────────────

function PlatformCard({
  platform, stats, runStatus, logEntries, onScrape, onStop,
}: {
  platform: Platform; stats: PlatformStats | null; runStatus: RunStatus;
  logEntries: LogEntry[]; onScrape: () => void; onStop: () => void;
}) {
  const isRunning = runStatus.state === "running";
  const freshnessLabel = (iso: string | null) => {
    if (!iso) return "Never";
    const diff = Date.now() - new Date(iso).getTime();
    const hours = Math.floor(diff / 3_600_000);
    if (hours < 1) return "< 1h ago";
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };
  const freshnessColor = (iso: string | null) => {
    if (!iso) return "text-muted-foreground";
    const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
    return h < 24 ? "text-success" : h < 72 ? "text-warning" : "text-destructive";
  };

  return (
    <div className="rounded-xl border border-border bg-card flex flex-col gap-4 p-5 shadow-sm" style={{ borderTop: `3px solid ${platform.color}` }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-foreground">{platform.label}</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{platform.description}</p>
        </div>
        {runStatus.state === "done" && <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />}
        {runStatus.state === "error" && <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-muted/40 p-2.5 text-center">
          <p className="text-lg font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: platform.color }}>
            {stats ? stats.storesLinked : "—"}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">/ {TOTAL_STORES}</p>
        </div>
        <div className="rounded-lg bg-muted/40 p-2.5 text-center">
          <p className="text-lg font-bold text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {stats ? stats.productsScraped.toLocaleString() : "—"}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">products</p>
        </div>
        <div className="rounded-lg bg-muted/40 p-2.5 text-center">
          <p className={`text-sm font-semibold ${freshnessColor(stats?.lastScraped ?? null)}`}>
            {freshnessLabel(stats?.lastScraped ?? null)}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">last run</p>
        </div>
      </div>
      {isRunning && (
        <div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full animate-pulse" style={{ width: "100%", background: platform.color, opacity: 0.7 }} />
          </div>
          {runStatus.progressText && <p className="text-[10px] text-muted-foreground mt-1.5 font-mono truncate">{runStatus.progressText}</p>}
        </div>
      )}
      {(runStatus.state === "done" || runStatus.state === "error") && runStatus.message && (
        <p className={`text-[11px] flex items-start gap-1.5 ${runStatus.state === "error" ? "text-destructive" : "text-success"}`}>
          {runStatus.state === "error" ? <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" /> : <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" />}
          <span className="font-mono-data">{runStatus.message}</span>
        </p>
      )}
      {logEntries.length > 0 && <ScrapeLog entries={logEntries} />}
      <div className="mt-auto flex gap-2">
        {platform.blocked ? (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 italic">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />{platform.blocked}
          </div>
        ) : isRunning ? (
          <button onClick={onStop} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-destructive/50 text-destructive hover:bg-destructive/10 transition-colors">
            <Square className="w-3 h-3" />Stop
          </button>
        ) : (
          <button onClick={onScrape} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium text-primary-foreground transition-colors hover:opacity-90" style={{ background: platform.color }}>
            <Play className="w-3 h-3" />Scrape All
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ScraperAdmin() {
  const [stats, setStats] = useState<Record<string, PlatformStats>>({});
  const [runStatuses, setRunStatuses] = useState<Record<string, RunStatus>>(
    Object.fromEntries(PLATFORMS.map((p) => [p.id, { state: "idle", message: "" }]))
  );
  const [scrapeAll, setScrapeAll] = useState<ScrapeAllState | null>(null);
  const [platformLogs, setPlatformLogs] = useState<Record<string, LogEntry[]>>(
    Object.fromEntries(PLATFORMS.map((p) => [p.id, []]))
  );

  // Unmatched tab state
  const [activeView, setActiveView] = useState<AdminView>("platforms");
  const [unmatched, setUnmatched] = useState<UnmatchedDiscovery[]>([]);
  const [unmatchedLoading, setUnmatchedLoading] = useState(false);
  const [unmatchedPlatformFilter, setUnmatchedPlatformFilter] = useState("");
  const [allIntelStores, setAllIntelStores] = useState<IntelStore[]>([]);

  // Exclusion sets for link search
  const [storesWithMenuIds, setStoresWithMenuIds] = useState<Set<string>>(new Set());
  const [storesAlreadyLinkedIds, setStoresAlreadyLinkedIds] = useState<Set<string>>(new Set());
  const [licenseMap, setLicenseMap] = useState<Record<string, string>>({});

  // Linking state
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [linkQuery, setLinkQuery] = useState("");
  const [linkSelected, setLinkSelected] = useState<IntelStore | null>(null);
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkedRows, setLinkedRows] = useState<Record<string, IntelStore>>({});
  const [scrapingIds, setScrapingIds] = useState<Set<string>>(new Set());
  const [scrapedIds, setScrapedIds] = useState<Set<string>>(new Set());
  const [scrapeErrors, setScrapeErrors] = useState<Record<string, string>>({});

  // Website finder state
  const [wfRunning, setWfRunning] = useState(false);
  const [wfTotal, setWfTotal] = useState<number | null>(null);
  const [wfDone, setWfDone] = useState(0);
  const [wfProgress, setWfProgress] = useState("");
  const [wfLog, setWfLog] = useState<LogEntry[]>([]);
  const wfAbortRef = useRef<AbortController | null>(null);

  const abortRefs = useRef<Record<string, AbortController>>({});
  const scrapeAllAbortRef = useRef<AbortController | null>(null);
  const pollRefs = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const loadStats = useCallback(async () => {
    const { data } = await supabase.from("dispensary_menus").select("source, intel_store_id, menu_item_count, last_scraped_at");
    if (!data) return;
    const grouped: Record<string, PlatformStats> = {};
    for (const platform of PLATFORMS) {
      const rows = data.filter((r) => r.source === platform.source);
      const linked = rows.filter((r) => r.intel_store_id !== null);
      const products = rows.reduce((sum, r) => sum + (r.menu_item_count ?? 0), 0);
      const dates = rows.map((r) => r.last_scraped_at).filter(Boolean) as string[];
      grouped[platform.id] = { storesLinked: linked.length, productsScraped: products, lastScraped: dates.length > 0 ? dates.sort().at(-1)! : null };
    }
    setStats(grouped);
  }, []);

  const loadUnmatched = useCallback(async () => {
    setUnmatchedLoading(true);
    const { data } = await supabase
      .from("intel_unmatched_discoveries")
      .select("*")
      .eq("matched", false)
      .order("platform")
      .order("store_name");
    setUnmatched(data ?? []);
    setUnmatchedLoading(false);
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  useEffect(() => {
    if (activeView === "unmatched") {
      loadUnmatched();
      if (allIntelStores.length === 0) {
        Promise.all([
          supabase.from("intel_stores")
            .select("id, name, city, county, address, zip, phone, lcb_license_id, crm_contact_id, dutchie_slug, leafly_slug, weedmaps_slug, posabit_feed_key")
            .eq("status", "active")
            .order("name"),
          supabase.from("dispensary_menus")
            .select("intel_store_id")
            .not("intel_store_id", "is", null),
          supabase.from("intel_unmatched_discoveries")
            .select("matched_intel_store_id")
            .eq("matched", true)
            .not("matched_intel_store_id", "is", null),
          supabase.from("lcb_licenses")
            .select("id, license_number"),
        ]).then(([storesRes, menusRes, linkedRes, licensesRes]) => {
          setAllIntelStores((storesRes.data as IntelStore[]) ?? []);
          setStoresWithMenuIds(new Set((menusRes.data ?? []).map((r: any) => r.intel_store_id as string)));
          setStoresAlreadyLinkedIds(new Set((linkedRes.data ?? []).map((r: any) => r.matched_intel_store_id as string)));
          const lmap: Record<string, string> = {};
          for (const r of (licensesRes.data ?? [])) { if (r.id && r.license_number) lmap[r.id] = r.license_number; }
          setLicenseMap(lmap);
        });
      }
    }
  }, [activeView]);

  const startPolling = (id: string) => { stopPolling(id); pollRefs.current[id] = setInterval(loadStats, 5000); };
  const stopPolling = (id: string) => { if (pollRefs.current[id]) { clearInterval(pollRefs.current[id]); delete pollRefs.current[id]; } };
  const setStatus = (id: string, update: Partial<RunStatus>) => { setRunStatuses((prev) => ({ ...prev, [id]: { ...prev[id], ...update } })); };
  const clearLog = (id: string) => setPlatformLogs((prev) => ({ ...prev, [id]: [] }));
  const appendLog = (id: string, entries: LogEntry[]) => setPlatformLogs((prev) => ({ ...prev, [id]: [...(prev[id] ?? []), ...entries] }));

  const getCallParams = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not logged in");
    return { session, supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string, anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string };
  };

  const handleScrape = async (platform: Platform) => {
    const ctrl = new AbortController();
    abortRefs.current[platform.id] = ctrl;
    clearLog(platform.id);
    setStatus(platform.id, { state: "running", message: "", progressText: "Starting..." });
    startPolling(platform.id);
    try {
      const { session, supabaseUrl, anonKey } = await getCallParams();

      // POSaBit: use the fast-scan action to populate credentials, then scrape
      // every store that now has a merchant_token via scrape-posabit-single.
      // Bypasses the old slow Puppeteer-per-store discover path.
      if (platform.id === "posabit") {
        const { totalScraped, totalProducts } = await runPosabitFastBatch(
          session, supabaseUrl, anonKey, ctrl.signal,
          (text) => setStatus(platform.id, { progressText: text }),
          loadStats,
          (entries) => appendLog(platform.id, entries),
        );
        setStatus(platform.id, { state: "done", message: `${totalScraped} stores · ${totalProducts.toLocaleString()} products`, progressText: undefined });
        if (activeView === "unmatched") loadUnmatched();
        return;
      }

      const { totalScraped, totalProducts } = await runPlatformBatch(
        platform, session, supabaseUrl, anonKey, ctrl.signal,
        (text) => setStatus(platform.id, { progressText: text }),
        loadStats,
        (entries) => appendLog(platform.id, entries),
      );
      setStatus(platform.id, { state: "done", message: `${totalScraped} stores · ${totalProducts.toLocaleString()} products`, progressText: undefined });
      // Refresh unmatched count if tab is visible
      if (activeView === "unmatched") loadUnmatched();
    } catch (err: any) {
      if (err.name === "AbortError") setStatus(platform.id, { state: "idle", message: "", progressText: undefined });
      else setStatus(platform.id, { state: "error", message: err.message ?? "Unknown error", progressText: undefined });
    } finally {
      stopPolling(platform.id);
      delete abortRefs.current[platform.id];
    }
  };

  const handleStop = (platformId: string) => {
    abortRefs.current[platformId]?.abort();
    stopPolling(platformId);
    setStatus(platformId, { state: "idle", message: "Stopped by user", progressText: undefined });
  };

  const handleScrapeAll = async () => {
    const ctrl = new AbortController();
    scrapeAllAbortRef.current = ctrl;
    setScrapeAll({ running: true, platformIdx: 0, progressText: "Starting...", totalScraped: 0, totalProducts: 0, done: false });
    let grandScraped = 0, grandProducts = 0;
    try {
      const { session, supabaseUrl, anonKey } = await getCallParams();
      for (let i = 0; i < SCRAPE_ALL_PLATFORMS.length; i++) {
        if (ctrl.signal.aborted) break;
        const platform = SCRAPE_ALL_PLATFORMS[i];
        setScrapeAll((prev) => prev ? { ...prev, platformIdx: i, progressText: `${platform.label}: discovering...` } : prev);
        clearLog(platform.id);
        setStatus(platform.id, { state: "running", message: "", progressText: "Starting via Scrape All..." });
        startPolling(platform.id);
        try {
          const { totalScraped, totalProducts } = await runPlatformBatch(
            platform, session, supabaseUrl, anonKey, ctrl.signal,
            (text) => { setStatus(platform.id, { progressText: text }); setScrapeAll((prev) => prev ? { ...prev, progressText: `${platform.label} (${i + 1}/${SCRAPE_ALL_PLATFORMS.length}): ${text}` } : prev); },
            loadStats,
            (entries) => appendLog(platform.id, entries),
          );
          grandScraped += totalScraped; grandProducts += totalProducts;
          setStatus(platform.id, { state: "done", message: `${totalScraped} stores · ${totalProducts.toLocaleString()} products`, progressText: undefined });
          setScrapeAll((prev) => prev ? { ...prev, totalScraped: grandScraped, totalProducts: grandProducts } : prev);
        } catch (err: any) {
          if (err.name === "AbortError") break;
          setStatus(platform.id, { state: "error", message: err.message, progressText: undefined });
        } finally { stopPolling(platform.id); }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") { setScrapeAll((prev) => prev ? { ...prev, running: false, done: true, error: err.message } : prev); return; }
    }
    const wasStopped = ctrl.signal.aborted;
    setScrapeAll({ running: false, platformIdx: SCRAPE_ALL_PLATFORMS.length - 1, progressText: "", totalScraped: grandScraped, totalProducts: grandProducts, done: true, error: wasStopped ? "Stopped by user" : undefined });
    scrapeAllAbortRef.current = null;
    if (activeView === "unmatched") loadUnmatched();
  };

  const handleStopAll = () => {
    scrapeAllAbortRef.current?.abort();
    for (const id of Object.keys(abortRefs.current)) abortRefs.current[id]?.abort();
  };

  // ── Website finder ─────────────────────────────────────────────────────────

  const handleFindWebsites = async () => {
    if (wfRunning) { wfAbortRef.current?.abort(); return; }
    const ctrl = new AbortController();
    wfAbortRef.current = ctrl;
    setWfRunning(true);
    setWfLog([]);
    setWfDone(0);
    setWfProgress("Running fast POSaBit scan…");
    try {
      const { session, supabaseUrl, anonKey } = await getCallParams();

      const res = await fetch(`${supabaseUrl}/functions/v1/scrape-posabit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: anonKey },
        body: JSON.stringify({ action: "fast-scan", limit: 500, onlyMissing: true }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? `fast-scan HTTP ${res.status}`);
      }

      const data = await res.json();
      const results: any[] = data.results ?? [];
      setWfTotal(results.length);

      // Map every result to a log entry — show hits first, then misses
      const hits = results.filter(r => r.hasPosabit);
      const misses = results.filter(r => !r.hasPosabit);
      const entries: LogEntry[] = [
        ...hits.map((r): LogEntry => ({
          storeName: r.name,
          city:      r.city ?? null,
          status:    "saved",
          reason:    r.detectedUrl ? `POSaBit · ${r.detectedUrl}` : "POSaBit detected",
          timestamp: Date.now(),
        })),
        ...misses.map((r): LogEntry => ({
          storeName: r.name,
          city:      r.city ?? null,
          status:    "no-widget",
          reason:    r.markers?.length ? `markers: ${r.markers.join(", ")}` : "no POSaBit markers",
          timestamp: Date.now(),
        })),
      ];
      setWfLog(entries);
      setWfDone(results.length);

      setWfProgress(
        `Done in ${data.total_ms ?? "?"}ms — scanned ${data.scanned}, POSaBit confirmed ${data.found}, credentials saved to ${data.updated}`,
      );
    } catch (err: any) {
      if (err.name !== "AbortError") setWfProgress(`Error: ${err.message}`);
      else setWfProgress("Stopped");
    } finally {
      setWfRunning(false);
    }
  };

  // ── Linking handlers ───────────────────────────────────────────────────────

  const handleStartLink = (discoveryId: string) => {
    setLinkingId(discoveryId);
    setLinkQuery("");
    setLinkSelected(null);
  };

  const handleCancelLink = () => {
    setLinkingId(null);
    setLinkQuery("");
    setLinkSelected(null);
  };

  const handleConfirmLink = async (discovery: UnmatchedDiscovery, intel: IntelStore) => {
    setLinkSaving(true);
    try {
      // Mark discovery as matched
      await supabase.from("intel_unmatched_discoveries")
        .update({ matched: true, matched_intel_store_id: intel.id })
        .eq("id", discovery.id);

      // Save platform slug to intel_stores
      const pi = PLATFORM_INFO[discovery.platform];
      if (pi?.slugField && discovery.platform_slug) {
        await supabase.from("intel_stores")
          .update({ [pi.slugField]: discovery.platform_slug })
          .eq("id", intel.id);
      }

      setLinkedRows((prev) => ({ ...prev, [discovery.id]: intel }));
      setUnmatched((prev) => prev.filter((u) => u.id !== discovery.id));
      setStoresAlreadyLinkedIds((prev) => new Set([...prev, intel.id]));
      setLinkingId(null);
      setLinkQuery("");
      setLinkSelected(null);
    } finally {
      setLinkSaving(false);
    }
  };

  const handleScrapeLinked = async (discovery: UnmatchedDiscovery) => {
    const intel = linkedRows[discovery.id];
    if (!intel) return;
    const pi = PLATFORM_INFO[discovery.platform];
    if (!pi?.functionName) return;
    const candidate = buildScrapeCandidate(discovery, intel);
    if (!candidate) return;

    setScrapingIds((prev) => new Set([...prev, discovery.id]));
    setScrapeErrors((prev) => { const n = { ...prev }; delete n[discovery.id]; return n; });

    try {
      const { session, supabaseUrl, anonKey } = await getCallParams();
      const res = await fetch(`${supabaseUrl}/functions/v1/${pi.functionName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: anonKey },
        body: JSON.stringify({ action: "scrape-batch", stores: [candidate] }),
      });
      if (res.ok) {
        const data = await res.json();
        const scraped = data.scraped ?? 0;
        if (scraped > 0) {
          setScrapedIds((prev) => new Set([...prev, discovery.id]));
          await loadStats();
        } else {
          setScrapeErrors((prev) => ({ ...prev, [discovery.id]: data.results?.[0]?.status ?? "empty" }));
        }
      } else {
        setScrapeErrors((prev) => ({ ...prev, [discovery.id]: `HTTP ${res.status}` }));
      }
    } catch (e: any) {
      setScrapeErrors((prev) => ({ ...prev, [discovery.id]: e.message }));
    } finally {
      setScrapingIds((prev) => { const s = new Set(prev); s.delete(discovery.id); return s; });
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

  // ── Derived counts ─────────────────────────────────────────────────────────

  const unmatchedCount = unmatched.length;
  const isScrapeAllRunning = scrapeAll?.running === true;
  const anyPlatformRunning = Object.values(runStatuses).some((s) => s.state === "running");

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
            {TOTAL_STORES} LCB-licensed WA stores · Scrape any platform to discover and link menu data
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
                {unmatchedCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold">
                    {unmatchedCount}
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
          {/* Scrape All */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Scrape All Platforms</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Runs Dutchie → POSaBit → Leafly → Weedmaps sequentially</p>
              </div>
              {isScrapeAllRunning ? (
                <button onClick={handleStopAll} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium border border-destructive/50 text-destructive hover:bg-destructive/10 transition-colors shrink-0">
                  <Square className="w-3.5 h-3.5" />Stop All
                </button>
              ) : (
                <button onClick={handleScrapeAll} disabled={anyPlatformRunning} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
                  <Layers className="w-3.5 h-3.5" />Scrape All Platforms
                </button>
              )}
            </div>
            {scrapeAll && (
              <div className="space-y-2">
                {isScrapeAllRunning && (
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary animate-pulse transition-all" style={{ width: `${Math.round((scrapeAll.platformIdx / SCRAPE_ALL_PLATFORMS.length) * 100)}%`, minWidth: "8%" }} />
                  </div>
                )}
                <div className="flex items-center justify-between gap-4">
                  <p className="text-[11px] text-muted-foreground font-mono truncate">
                    {scrapeAll.done ? (scrapeAll.error ? `⚠ ${scrapeAll.error}` : "✓ Complete") : scrapeAll.progressText}
                  </p>
                  {(scrapeAll.totalScraped > 0 || scrapeAll.totalProducts > 0) && (
                    <p className="text-[11px] text-muted-foreground shrink-0">
                      <span className="text-foreground font-semibold">{scrapeAll.totalScraped}</span> stores ·{" "}
                      <span className="text-foreground font-semibold">{scrapeAll.totalProducts.toLocaleString()}</span> products
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {SCRAPE_ALL_PLATFORMS.map((p, i) => {
                    const isDone = scrapeAll.done || i < scrapeAll.platformIdx;
                    const isCurrent = !scrapeAll.done && i === scrapeAll.platformIdx && scrapeAll.running;
                    return (
                      <div key={p.id} className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full transition-all ${isDone ? "opacity-100" : isCurrent ? "animate-pulse opacity-100" : "opacity-30"}`} style={{ background: p.color }} />
                        <span className={`text-[10px] ${isCurrent ? "text-foreground font-medium" : isDone ? "text-muted-foreground" : "text-muted-foreground/50"}`}>{p.label}</span>
                        {i < SCRAPE_ALL_PLATFORMS.length - 1 && <span className="text-muted-foreground/30 text-[10px]">→</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* How it works */}
          <div className="rounded-lg px-4 py-3 text-[11px] text-muted-foreground leading-relaxed" style={{ background: "rgba(0,212,170,0.05)", border: "1px solid rgba(0,212,170,0.15)" }}>
            <span className="font-semibold text-foreground">How scraping works: </span>
            Phase 1 discovers all WA stores on that platform and matches them to LCB records. Unmatched stores are saved to the Unmatched tab for manual linking.
            Phase 2 fetches menus in batches. If a store has fresh data (&lt;6h), the menu fetch is skipped but the platform slug is always saved.
          </div>

          {/* Platform grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {PLATFORMS.map((platform) => (
              <PlatformCard key={platform.id} platform={platform} stats={stats[platform.id] ?? null}
                runStatus={runStatuses[platform.id]} logEntries={platformLogs[platform.id] ?? []}
                onScrape={() => handleScrape(platform)} onStop={() => handleStop(platform.id)} />
            ))}
          </div>

          {/* Summary */}
          <div className="rounded-lg border border-border bg-card p-4 grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {Object.values(stats).reduce((s, p) => s + p.storesLinked, 0)}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Stores with menu data</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{TOTAL_STORES}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Total LCB stores</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {Object.values(stats).reduce((s, p) => s + p.productsScraped, 0).toLocaleString()}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Total products scraped</p>
            </div>
          </div>

          {/* Website Finder */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Globe className="w-4 h-4 text-muted-foreground" />
                  Website Finder + POSaBit Detection
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  DuckDuckGo-searches each store without a website URL, saves the result, and auto-detects POSaBit menus.
                  {wfTotal !== null && !wfRunning && (
                    <span className="ml-1 text-amber-400">{wfTotal - wfDone > 0 ? `${wfTotal - wfDone} stores remaining` : "All stores have websites"}</span>
                  )}
                </p>
              </div>
              <button
                onClick={handleFindWebsites}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors shrink-0 ${
                  wfRunning
                    ? "border border-destructive/50 text-destructive hover:bg-destructive/10"
                    : "text-primary-foreground bg-primary hover:bg-primary/90"
                }`}
              >
                {wfRunning
                  ? <><Square className="w-3.5 h-3.5" />Stop</>
                  : <><Globe className="w-3.5 h-3.5" />Find Websites + POSaBit</>
                }
              </button>
            </div>

            {(wfRunning || wfProgress || wfLog.length > 0) && (
              <div className="space-y-2">
                {wfProgress && (
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-[11px] text-muted-foreground font-mono truncate">
                      {wfRunning && <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse mr-1.5 align-middle" />}
                      {wfProgress}
                    </p>
                    {wfTotal !== null && wfDone > 0 && (
                      <p className="text-[11px] text-muted-foreground shrink-0">
                        <span className="text-foreground font-semibold">{wfDone}</span> / {wfTotal}
                      </p>
                    )}
                  </div>
                )}
                {wfTotal !== null && wfDone > 0 && (
                  <div className="h-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round((wfDone / wfTotal) * 100)}%` }} />
                  </div>
                )}
                <ScrapeLog entries={wfLog} />
              </div>
            )}
          </div>
        </>
      )}

      {/* ── UNMATCHED VIEW ── */}
      {activeView === "unmatched" && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={unmatchedPlatformFilter}
              onChange={(e) => setUnmatchedPlatformFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-md border border-border bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">All Platforms</option>
              {Object.entries(PLATFORM_INFO).map(([key, pi]) => (
                <option key={key} value={key}>{pi.label}</option>
              ))}
            </select>
            <button onClick={loadUnmatched} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-accent text-muted-foreground transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />Refresh
            </button>
            <p className="text-sm text-muted-foreground ml-auto">
              {unmatchedLoading ? "Loading…" : `${filteredUnmatched.length} unmatched store${filteredUnmatched.length !== 1 ? "s" : ""}`}
            </p>
          </div>

          {/* Table */}
          <div className="rounded-lg border border-border bg-card overflow-hidden shadow-premium">
            {unmatchedLoading ? (
              <div className="space-y-px">{[...Array(8)].map((_, i) => <div key={i} className="h-10 skeleton-shimmer" />)}</div>
            ) : filteredUnmatched.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                {unmatched.length === 0
                  ? "No unmatched stores — run a discover phase first"
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
                        <tr
                          key={u.id}
                          className={`transition-colors duration-100 ${isLinking ? "bg-accent/20" : linked ? "bg-success/5" : "hover:bg-accent/30"}`}
                        >
                          {/* Platform badge */}
                          <td className="px-4 py-2.5">
                            {pi ? (
                              <span
                                className="inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-bold"
                                style={{ background: pi.color + "22", color: pi.color, border: `1px solid ${pi.color}66` }}
                                title={pi.label}
                              >
                                {pi.letter}
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">{u.platform}</span>
                            )}
                          </td>

                          {/* Store name */}
                          <td className="px-4 py-2.5 font-medium text-foreground max-w-[180px] truncate">
                            {u.store_name ?? "—"}
                          </td>

                          {/* City */}
                          <td className="px-4 py-2.5 text-muted-foreground capitalize hidden md:table-cell">
                            {(u.city ?? "").toLowerCase() || "—"}
                          </td>

                          {/* Address */}
                          <td className="px-4 py-2.5 text-muted-foreground text-xs max-w-[160px] truncate hidden lg:table-cell">
                            {u.address ?? "—"}
                          </td>

                          {/* Slug */}
                          <td className="px-4 py-2.5 hidden lg:table-cell">
                            <span className="text-[10px] font-mono text-muted-foreground">{u.platform_slug ?? "—"}</span>
                          </td>

                          {/* Actions */}
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
                                    {isScrapingThis ? (
                                      <><RefreshCw className="w-2.5 h-2.5 animate-spin" />Scraping…</>
                                    ) : (
                                      <><Zap className="w-2.5 h-2.5" />Scrape Now</>
                                    )}
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

                        {/* Inline linking panel */}
                        {isLinking && (
                          <tr key={`${u.id}-link`} className="bg-accent/10">
                            <td colSpan={6} className="px-4 pb-4 pt-2">
                              <div className="space-y-3">

                                {/* Discovery info header */}
                                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                                  <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-500/80 mb-1">Linking from {pi?.label ?? u.platform}</p>
                                  <p className="text-[12px] font-semibold text-foreground">{u.store_name}</p>
                                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                                    {u.address && <span className="text-[11px] text-muted-foreground">{u.address}{u.city ? `, ${u.city}` : ""}</span>}
                                    {!u.address && u.city && <span className="text-[11px] text-muted-foreground">{u.city}</span>}
                                    {u.phone && <span className="text-[11px] text-muted-foreground">· {u.phone}</span>}
                                    {u.license_number && <span className="text-[11px] text-muted-foreground">· License #{u.license_number}</span>}
                                  </div>
                                </div>

                                {/* Search input */}
                                <div className="relative max-w-lg">
                                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                                  <input
                                    autoFocus
                                    value={linkQuery}
                                    onChange={(e) => { setLinkQuery(e.target.value); setLinkSelected(null); }}
                                    placeholder="Search intel store by name, city, address…"
                                    className="w-full pl-7 pr-3 py-1.5 rounded-md border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                                  />
                                </div>

                                {/* Results */}
                                {linkResults.length > 0 && (
                                  <div className="rounded-md border border-border bg-card shadow-sm overflow-hidden max-w-lg divide-y divide-border/50">
                                    {linkResults.map((s) => {
                                      const licNum = s.lcb_license_id ? licenseMap[s.lcb_license_id] : null;
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

                                {/* Confirm */}
                                {linkSelected && (() => {
                                  const licNum = linkSelected.lcb_license_id ? licenseMap[linkSelected.lcb_license_id] : null;
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
                                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium text-primary-foreground bg-primary hover:bg-primary/90 transition-colors disabled:opacity-50"
                                      >
                                        {linkSaving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                                        Confirm Link
                                      </button>
                                      <button onClick={handleCancelLink} className="text-[11px] text-muted-foreground hover:text-foreground">
                                        Cancel
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

          {/* Recently linked this session */}
          {Object.keys(linkedRows).length > 0 && (
            <div className="text-[11px] text-muted-foreground">
              {Object.keys(linkedRows).length} store{Object.keys(linkedRows).length !== 1 ? "s" : ""} linked this session
              {Object.values(scrapedIds).length > 0 && ` · ${scrapedIds.size} scraped`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
