import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Play, Square, CheckCircle2, AlertCircle, RefreshCw, AlertTriangle, Layers } from "lucide-react";

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

// Scrape-All order: Dutchie first (populates websites), POSaBit second (uses websites)
const PLATFORMS: Platform[] = [
  {
    id: "dutchie",
    label: "Dutchie",
    source: "dutchie-api",
    color: "#00D4AA",
    description: "Discovers WA stores via Dutchie GraphQL API, matches to LCB stores by address, fetches complete menus",
    functionName: "scrape-dutchie",
    batchSize: 10,
  },
  {
    id: "posabit",
    label: "POSaBit",
    source: "posabit-api",
    color: "#5C6BC0",
    description: "Scans intel_stores websites for POSaBit embeds, fetches menus via MCX API",
    functionName: "scrape-posabit",
    batchSize: 2,
  },
  {
    id: "leafly",
    label: "Leafly",
    source: "leafly",
    color: "#3BB143",
    description: "Discovers WA dispensaries via Leafly WA state page, matches to LCB stores, fetches complete menus",
    functionName: "scrape-leafly",
    batchSize: 4,
  },
  {
    id: "weedmaps",
    label: "Weedmaps",
    source: "weedmaps",
    color: "#F7931A",
    description: "Discovers WA dispensaries via Weedmaps directory, matches to LCB stores, fetches complete menus",
    functionName: "scrape-weedmaps",
    batchSize: 5,
  },
  {
    id: "jane",
    label: "Jane",
    source: "jane",
    color: "#E91E63",
    description: "Jane Technologies menus — scraping blocked, requires proxy configuration",
    functionName: "scrape-jane",
    batchSize: 5,
    blocked: "Blocked — requires proxy fix",
  },
];

// Platforms that can be run in Scrape All (excludes blocked)
const SCRAPE_ALL_PLATFORMS = PLATFORMS.filter((p) => !p.blocked);

const TOTAL_STORES = 458;

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
  platformIdx: number;   // index into SCRAPE_ALL_PLATFORMS
  progressText: string;
  totalScraped: number;
  totalProducts: number;
  done: boolean;
  error?: string;
}

// ─── Core scrape helper (shared by handleScrape + handleScrapeAll) ────────────

async function runPlatformBatch(
  platform: Platform,
  session: { access_token: string },
  supabaseUrl: string,
  anonKey: string,
  signal: AbortSignal,
  onProgress: (text: string) => void,
  onStatsRefresh: () => Promise<void>,
): Promise<{ totalScraped: number; totalProducts: number }> {
  const fnUrl = `${supabaseUrl}/functions/v1/${platform.functionName}`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
    apikey: anonKey,
  };

  onProgress("Discovering stores...");

  const discoverRes = await fetch(fnUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "discover" }),
    signal,
  });

  const discoverData = await discoverRes.json();
  if (!discoverRes.ok) throw new Error(discoverData.error ?? `Discover HTTP ${discoverRes.status}`);

  const candidates: any[] = discoverData.candidates ?? [];
  if (candidates.length === 0) {
    onProgress("No matching stores found");
    return { totalScraped: 0, totalProducts: 0 };
  }

  const totalBatches = Math.ceil(candidates.length / platform.batchSize);
  let totalScraped = 0;
  let totalProducts = 0;

  for (let b = 0; b < totalBatches; b++) {
    if (signal.aborted) break;

    onProgress(
      `Batch ${b + 1}/${totalBatches} · ${totalScraped} scraped · ${totalProducts.toLocaleString()} products`,
    );

    const batch = candidates.slice(b * platform.batchSize, (b + 1) * platform.batchSize);
    const batchRes = await fetch(fnUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "scrape-batch", stores: batch }),
      signal,
    });

    if (batchRes.ok) {
      const batchData = await batchRes.json();
      totalScraped += batchData.scraped ?? 0;
      totalProducts += batchData.products_saved ?? 0;
    }

    await onStatsRefresh();
  }

  return { totalScraped, totalProducts };
}

// ─── Platform Card ────────────────────────────────────────────────────────────

function PlatformCard({
  platform,
  stats,
  runStatus,
  onScrape,
  onStop,
}: {
  platform: Platform;
  stats: PlatformStats | null;
  runStatus: RunStatus;
  onScrape: () => void;
  onStop: () => void;
}) {
  const isRunning = runStatus.state === "running";

  const freshnessLabel = (iso: string | null) => {
    if (!iso) return "Never";
    const diff = Date.now() - new Date(iso).getTime();
    const hours = Math.floor(diff / 3_600_000);
    if (hours < 1) return "< 1 hour ago";
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const freshnessColor = (iso: string | null) => {
    if (!iso) return "text-muted-foreground";
    const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
    if (hours < 24) return "text-emerald-500";
    if (hours < 72) return "text-amber-400";
    return "text-red-400";
  };

  return (
    <div
      className="rounded-xl border border-border bg-card flex flex-col gap-4 p-5 shadow-sm"
      style={{ borderTop: `3px solid ${platform.color}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-foreground">{platform.label}</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{platform.description}</p>
        </div>
        {runStatus.state === "done" && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />}
        {runStatus.state === "error" && <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-muted/40 p-2.5 text-center">
          <p className="text-lg font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: platform.color }}>
            {stats ? stats.storesLinked : "—"}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">/ {TOTAL_STORES} stores</p>
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
          {runStatus.progressText && (
            <p className="text-[10px] text-muted-foreground mt-1.5 font-mono truncate">{runStatus.progressText}</p>
          )}
        </div>
      )}

      {(runStatus.state === "done" || runStatus.state === "error") && runStatus.message && (
        <p className={`text-[11px] flex items-start gap-1.5 ${runStatus.state === "error" ? "text-destructive" : "text-emerald-500"}`}>
          {runStatus.state === "error"
            ? <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
            : <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" />}
          <span className="font-mono-data">{runStatus.message}</span>
        </p>
      )}

      <div className="mt-auto flex gap-2">
        {platform.blocked ? (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 italic">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            {platform.blocked}
          </div>
        ) : isRunning ? (
          <button onClick={onStop} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-destructive/50 text-destructive hover:bg-destructive/10 transition-colors">
            <Square className="w-3 h-3" />
            Stop
          </button>
        ) : (
          <button onClick={onScrape} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium text-primary-foreground transition-colors hover:opacity-90" style={{ background: platform.color }}>
            <Play className="w-3 h-3" />
            Scrape All
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

  const abortRefs = useRef<Record<string, AbortController>>({});
  const scrapeAllAbortRef = useRef<AbortController | null>(null);
  const pollRefs = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const loadStats = useCallback(async () => {
    const { data } = await supabase
      .from("dispensary_menus")
      .select("source, intel_store_id, menu_item_count, last_scraped_at");
    if (!data) return;
    const grouped: Record<string, PlatformStats> = {};
    for (const platform of PLATFORMS) {
      const rows = data.filter((r) => r.source === platform.source);
      const linked = rows.filter((r) => r.intel_store_id !== null);
      const products = rows.reduce((sum, r) => sum + (r.menu_item_count ?? 0), 0);
      const dates = rows.map((r) => r.last_scraped_at).filter(Boolean) as string[];
      grouped[platform.id] = {
        storesLinked: linked.length,
        productsScraped: products,
        lastScraped: dates.length > 0 ? dates.sort().at(-1)! : null,
      };
    }
    setStats(grouped);
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const startPolling = (id: string) => {
    stopPolling(id);
    pollRefs.current[id] = setInterval(loadStats, 5000);
  };
  const stopPolling = (id: string) => {
    if (pollRefs.current[id]) { clearInterval(pollRefs.current[id]); delete pollRefs.current[id]; }
  };

  const setStatus = (id: string, update: Partial<RunStatus>) => {
    setRunStatuses((prev) => ({ ...prev, [id]: { ...prev[id], ...update } }));
  };

  // ── Get session + env (shared) ────────────────────────────────────────────

  const getCallParams = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not logged in");
    return {
      session,
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
      anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    };
  };

  // ── Individual platform scrape ─────────────────────────────────────────────

  const handleScrape = async (platform: Platform) => {
    const ctrl = new AbortController();
    abortRefs.current[platform.id] = ctrl;
    setStatus(platform.id, { state: "running", message: "", progressText: "Starting..." });
    startPolling(platform.id);

    try {
      const { session, supabaseUrl, anonKey } = await getCallParams();
      const { totalScraped, totalProducts } = await runPlatformBatch(
        platform, session, supabaseUrl, anonKey, ctrl.signal,
        (text) => setStatus(platform.id, { progressText: text }),
        loadStats,
      );
      setStatus(platform.id, {
        state: "done",
        message: `${totalScraped} stores scraped · ${totalProducts.toLocaleString()} products saved`,
        progressText: undefined,
      });
    } catch (err: any) {
      if (err.name === "AbortError") {
        setStatus(platform.id, { state: "idle", message: "", progressText: undefined });
      } else {
        setStatus(platform.id, { state: "error", message: err.message ?? "Unknown error", progressText: undefined });
      }
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

  // ── Scrape All Platforms ───────────────────────────────────────────────────

  const handleScrapeAll = async () => {
    const ctrl = new AbortController();
    scrapeAllAbortRef.current = ctrl;

    setScrapeAll({
      running: true, platformIdx: 0,
      progressText: "Starting...",
      totalScraped: 0, totalProducts: 0,
      done: false,
    });

    let grandScraped = 0;
    let grandProducts = 0;

    try {
      const { session, supabaseUrl, anonKey } = await getCallParams();

      for (let i = 0; i < SCRAPE_ALL_PLATFORMS.length; i++) {
        if (ctrl.signal.aborted) break;

        const platform = SCRAPE_ALL_PLATFORMS[i];

        setScrapeAll((prev) => prev ? { ...prev, platformIdx: i, progressText: `${platform.label}: discovering...` } : prev);
        setStatus(platform.id, { state: "running", message: "", progressText: "Starting via Scrape All..." });
        startPolling(platform.id);

        try {
          const { totalScraped, totalProducts } = await runPlatformBatch(
            platform, session, supabaseUrl, anonKey, ctrl.signal,
            (text) => {
              setStatus(platform.id, { progressText: text });
              setScrapeAll((prev) => prev ? {
                ...prev,
                progressText: `${platform.label} (${i + 1}/${SCRAPE_ALL_PLATFORMS.length}): ${text}`,
              } : prev);
            },
            loadStats,
          );

          grandScraped += totalScraped;
          grandProducts += totalProducts;

          setStatus(platform.id, {
            state: "done",
            message: `${totalScraped} stores · ${totalProducts.toLocaleString()} products`,
            progressText: undefined,
          });
          setScrapeAll((prev) => prev ? { ...prev, totalScraped: grandScraped, totalProducts: grandProducts } : prev);
        } catch (err: any) {
          if (err.name === "AbortError") break;
          setStatus(platform.id, { state: "error", message: err.message, progressText: undefined });
          // Continue to next platform despite error
        } finally {
          stopPolling(platform.id);
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setScrapeAll((prev) => prev ? { ...prev, running: false, done: true, error: err.message } : prev);
        return;
      }
    }

    const wasStopped = ctrl.signal.aborted;
    setScrapeAll({
      running: false, platformIdx: SCRAPE_ALL_PLATFORMS.length - 1,
      progressText: "",
      totalScraped: grandScraped, totalProducts: grandProducts,
      done: true,
      error: wasStopped ? "Stopped by user" : undefined,
    });
    scrapeAllAbortRef.current = null;
  };

  const handleStopAll = () => {
    scrapeAllAbortRef.current?.abort();
    // Also abort any individually running platforms
    for (const id of Object.keys(abortRefs.current)) {
      abortRefs.current[id]?.abort();
    }
  };

  const isScrapeAllRunning = scrapeAll?.running === true;
  const anyPlatformRunning = Object.values(runStatuses).some((s) => s.state === "running");

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
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={loadStats}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-accent text-muted-foreground transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Scrape All Platforms */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Scrape All Platforms</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Runs Dutchie → POSaBit → Leafly → Weedmaps sequentially using the batch pattern
            </p>
          </div>
          {isScrapeAllRunning ? (
            <button
              onClick={handleStopAll}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium border border-destructive/50 text-destructive hover:bg-destructive/10 transition-colors shrink-0"
            >
              <Square className="w-3.5 h-3.5" />
              Stop All
            </button>
          ) : (
            <button
              onClick={handleScrapeAll}
              disabled={anyPlatformRunning}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <Layers className="w-3.5 h-3.5" />
              Scrape All Platforms
            </button>
          )}
        </div>

        {/* Scrape All progress */}
        {scrapeAll && (
          <div className="space-y-2">
            {isScrapeAllRunning && (
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary animate-pulse transition-all"
                  style={{
                    width: `${Math.round(((scrapeAll.platformIdx) / SCRAPE_ALL_PLATFORMS.length) * 100)}%`,
                    minWidth: "8%",
                  }}
                />
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              <p className="text-[11px] text-muted-foreground font-mono truncate">
                {scrapeAll.done
                  ? scrapeAll.error
                    ? `⚠ ${scrapeAll.error}`
                    : `✓ Complete`
                  : scrapeAll.progressText}
              </p>
              {(scrapeAll.totalScraped > 0 || scrapeAll.totalProducts > 0) && (
                <p className="text-[11px] text-muted-foreground shrink-0">
                  <span className="text-foreground font-semibold">{scrapeAll.totalScraped}</span> stores ·{" "}
                  <span className="text-foreground font-semibold">{scrapeAll.totalProducts.toLocaleString()}</span> products
                </p>
              )}
            </div>
            {/* Platform progress indicators */}
            {SCRAPE_ALL_PLATFORMS.length > 0 && (
              <div className="flex items-center gap-2">
                {SCRAPE_ALL_PLATFORMS.map((p, i) => {
                  const isDone = scrapeAll.done || i < scrapeAll.platformIdx;
                  const isCurrent = !scrapeAll.done && i === scrapeAll.platformIdx && scrapeAll.running;
                  return (
                    <div key={p.id} className="flex items-center gap-1.5">
                      <div
                        className={`w-2 h-2 rounded-full transition-all ${
                          isDone ? "opacity-100" : isCurrent ? "animate-pulse opacity-100" : "opacity-30"
                        }`}
                        style={{ background: p.color }}
                      />
                      <span className={`text-[10px] ${isCurrent ? "text-foreground font-medium" : isDone ? "text-muted-foreground" : "text-muted-foreground/50"}`}>
                        {p.label}
                      </span>
                      {i < SCRAPE_ALL_PLATFORMS.length - 1 && (
                        <span className="text-muted-foreground/30 text-[10px]">→</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* How it works */}
      <div
        className="rounded-lg px-4 py-3 text-[11px] text-muted-foreground leading-relaxed"
        style={{ background: "rgba(0,212,170,0.05)", border: "1px solid rgba(0,212,170,0.15)" }}
      >
        <span className="font-semibold text-foreground">How scraping works: </span>
        Phase 1 discovers all WA stores on that platform and matches them to LCB records.
        Phase 2 fetches menus in batches to stay within the 60s Edge Function timeout.
        Dutchie also saves website URLs to intel_stores, which POSaBit uses to find widget configs.
      </div>

      {/* Platform grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {PLATFORMS.map((platform) => (
          <PlatformCard
            key={platform.id}
            platform={platform}
            stats={stats[platform.id] ?? null}
            runStatus={runStatuses[platform.id]}
            onScrape={() => handleScrape(platform)}
            onStop={() => handleStop(platform.id)}
          />
        ))}
      </div>

      {/* Summary row */}
      <div className="rounded-lg border border-border bg-card p-4 grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-2xl font-bold text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {Object.values(stats).reduce((s, p) => s + p.storesLinked, 0)}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Stores with menu data</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {TOTAL_STORES}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Total LCB stores</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {Object.values(stats).reduce((s, p) => s + p.productsScraped, 0).toLocaleString()}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Total products scraped</p>
        </div>
      </div>
    </div>
  );
}
