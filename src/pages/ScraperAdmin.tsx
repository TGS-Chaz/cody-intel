import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Play, Square, CheckCircle2, AlertCircle, RefreshCw, AlertTriangle } from "lucide-react";

// ─── Platform definitions ─────────────────────────────────────────────────────

interface Platform {
  id: string;
  label: string;
  source: string;          // matches dispensary_menus.source
  color: string;
  description: string;
  functionName: string;    // Supabase Edge Function to invoke
  actionBody?: Record<string, unknown>;
  blocked?: string;        // if set, shows this message instead of Run button
}

const PLATFORMS: Platform[] = [
  {
    id: "dutchie",
    label: "Dutchie",
    source: "dutchie-api",
    color: "#00D4AA",
    description: "Discovers WA stores via Dutchie GraphQL API, matches to LCB stores by address, fetches complete menus",
    functionName: "scrape-dutchie",
  },
  {
    id: "leafly",
    label: "Leafly",
    source: "leafly",
    color: "#3BB143",
    description: "Discovers WA dispensaries via Leafly city pages, matches to LCB stores, fetches complete menus",
    functionName: "scrape-leafly",
  },
  {
    id: "posabit",
    label: "POSaBit",
    source: "posabit-api",
    color: "#5C6BC0",
    description: "Scans intel_stores websites for POSaBit embeds, fetches menus via MCX API",
    functionName: "scrape-posabit",
  },
  {
    id: "weedmaps",
    label: "Weedmaps",
    source: "weedmaps",
    color: "#F7931A",
    description: "Discovers WA dispensaries via Weedmaps directory, matches to LCB stores, fetches complete menus",
    functionName: "scrape-weedmaps",
  },
  {
    id: "jane",
    label: "Jane",
    source: "jane",
    color: "#E91E63",
    description: "Jane Technologies menus — scraping blocked, requires proxy configuration",
    functionName: "scrape-jane",
    blocked: "Blocked — requires proxy fix",
  },
];

const TOTAL_STORES = 458; // LCB-licensed WA cannabis retailers

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
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
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
      className="rounded-xl border border-border bg-card flex flex-col gap-4 p-5 shadow-sm transition-all"
      style={{ borderTop: `3px solid ${platform.color}` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-foreground">{platform.label}</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{platform.description}</p>
        </div>
        {runStatus.state === "done" && (
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
        )}
        {runStatus.state === "error" && (
          <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-muted/40 p-2.5 text-center">
          <p
            className="text-lg font-bold"
            style={{ fontFamily: "'JetBrains Mono', monospace", color: platform.color }}
          >
            {stats ? stats.storesLinked : "—"}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
            / {TOTAL_STORES} stores
          </p>
        </div>
        <div className="rounded-lg bg-muted/40 p-2.5 text-center">
          <p
            className="text-lg font-bold text-foreground"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
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

      {/* Progress bar (visible while running) */}
      {isRunning && (
        <div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full animate-pulse"
              style={{ width: "100%", background: platform.color, opacity: 0.7 }}
            />
          </div>
          {runStatus.progressText && (
            <p className="text-[10px] text-muted-foreground mt-1.5 font-mono truncate">
              {runStatus.progressText}
            </p>
          )}
        </div>
      )}

      {/* Result message */}
      {(runStatus.state === "done" || runStatus.state === "error") && runStatus.message && (
        <p
          className={`text-[11px] flex items-start gap-1.5 ${
            runStatus.state === "error" ? "text-destructive" : "text-emerald-500"
          }`}
        >
          {runStatus.state === "error" ? (
            <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
          ) : (
            <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" />
          )}
          <span className="font-mono-data">{runStatus.message}</span>
        </p>
      )}

      {/* Action buttons */}
      <div className="mt-auto flex gap-2">
        {platform.blocked ? (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 italic">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            {platform.blocked}
          </div>
        ) : isRunning ? (
          <button
            onClick={onStop}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-destructive/50 text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Square className="w-3 h-3" />
            Stop
          </button>
        ) : (
          <button
            onClick={onScrape}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium text-primary-foreground transition-colors hover:opacity-90"
            style={{ background: platform.color }}
          >
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
  const abortRefs = useRef<Record<string, AbortController>>({});
  const pollRefs = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  // Load stats from dispensary_menus grouped by source
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
      const lastScraped = dates.length > 0 ? dates.sort().at(-1)! : null;
      grouped[platform.id] = {
        storesLinked: linked.length,
        productsScraped: products,
        lastScraped,
      };
    }
    setStats(grouped);
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Poll DB every 4s while a scrape is running
  const startPolling = (platformId: string) => {
    stopPolling(platformId);
    pollRefs.current[platformId] = setInterval(loadStats, 4000);
  };

  const stopPolling = (platformId: string) => {
    if (pollRefs.current[platformId]) {
      clearInterval(pollRefs.current[platformId]);
      delete pollRefs.current[platformId];
    }
  };

  const setStatus = (id: string, update: Partial<RunStatus>) => {
    setRunStatuses((prev) => ({ ...prev, [id]: { ...prev[id], ...update } }));
  };

  const handleScrape = async (platform: Platform) => {
    const ctrl = new AbortController();
    abortRefs.current[platform.id] = ctrl;

    setStatus(platform.id, { state: "running", message: "", progressText: "Connecting..." });
    startPolling(platform.id);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not logged in");

      const url = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

      setStatus(platform.id, {
        progressText: `Discovering ${platform.label} stores in Washington...`,
      });

      const res = await fetch(`${url}/functions/v1/${platform.functionName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: anonKey,
        },
        body: JSON.stringify(platform.actionBody ?? {}),
        signal: ctrl.signal,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      // Build a readable summary from the response
      const summary = buildSummary(data);
      setStatus(platform.id, { state: "done", message: summary, progressText: undefined });
      await loadStats();
    } catch (err: any) {
      if (err.name === "AbortError") {
        setStatus(platform.id, { state: "idle", message: "", progressText: undefined });
      } else {
        setStatus(platform.id, {
          state: "error",
          message: err.message ?? "Unknown error",
          progressText: undefined,
        });
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
        <button
          onClick={loadStats}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-accent text-muted-foreground transition-colors shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* How it works */}
      <div
        className="rounded-lg px-4 py-3 text-[11px] text-muted-foreground leading-relaxed"
        style={{ background: "rgba(0,212,170,0.05)", border: "1px solid rgba(0,212,170,0.15)" }}
      >
        <span className="font-semibold text-foreground">How scraping works: </span>
        Each "Scrape All" discovers all WA stores on that platform, matches them to the 458 LCB-licensed stores by
        address → name+city, then fetches complete menus. Only complete menus are saved. Stores that don't match
        an LCB record are skipped — no new stores are created.
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
          <p
            className="text-2xl font-bold text-foreground"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {Object.values(stats).reduce((s, p) => s + p.storesLinked, 0)}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
            Stores with menu data
          </p>
        </div>
        <div>
          <p
            className="text-2xl font-bold text-foreground"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {TOTAL_STORES}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
            Total LCB stores
          </p>
        </div>
        <div>
          <p
            className="text-2xl font-bold text-foreground"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {Object.values(stats).reduce((s, p) => s + p.productsScraped, 0).toLocaleString()}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
            Total products scraped
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildSummary(data: any): string {
  if (!data) return "Completed";
  // Common response shapes
  if (data.stores_found !== undefined && data.menus_saved !== undefined) {
    return `Found ${data.stores_found} stores · ${data.menus_saved} menus saved · ${data.products_saved ?? 0} products`;
  }
  if (data.matched !== undefined) {
    return `${data.matched} stores matched · ${data.saved ?? 0} menus saved`;
  }
  if (data.message) return data.message;
  // Fallback: first 120 chars of JSON
  return JSON.stringify(data).slice(0, 120);
}
