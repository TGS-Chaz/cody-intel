import { useState, useEffect } from "react";
import { Newspaper, RefreshCw, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Bell, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { callEdgeFunction } from "@/lib/edge-function";
import { useOrg } from "@/lib/org";

interface BriefingStats {
  newAlerts: {
    brand_removed: number;
    brand_added: number;
    stock_out: number;
    price_change: number;
  };
  totalAlerts: number;
  storesTracked: number;
  totalStores: number;
  topGainers: { brand: string; prev_stores: number; curr_stores: number; delta: number }[];
  topLosers: { brand: string; prev_stores: number; curr_stores: number; delta: number }[];
  weekStart: string;
  weekEnd: string;
}

interface Briefing {
  id: string;
  org_id: string | null;
  week_start: string;
  generated_at: string;
  narrative: string;
  stats: BriefingStats;
  model_used: string;
}

function formatWeekRange(weekStart: string, weekEnd?: string): string {
  const start = new Date(weekStart + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const startStr = start.toLocaleDateString("en-US", opts);
  if (!weekEnd) return `Week of ${startStr}`;
  const end = new Date(weekEnd + "T00:00:00");
  const endStr = end.toLocaleDateString("en-US", { ...opts, year: "numeric" });
  return `${startStr} – ${endStr}`;
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatChip({ value, label, color }: { value: string | number; label: string; color?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-background px-4 py-3 min-w-[80px]">
      <span className={`text-lg font-bold tabular-nums ${color ?? "text-foreground"}`}>{value}</span>
      <span className="text-[10px] text-muted-foreground text-center leading-tight mt-0.5">{label}</span>
    </div>
  );
}

function BriefingCard({ briefing, expanded, onToggle }: { briefing: Briefing; expanded: boolean; onToggle: () => void }) {
  const stats = briefing.stats;
  const topGainer = stats?.topGainers?.[0];
  const topLoser = stats?.topLosers?.[0];

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-accent/20 transition-colors"
        onClick={onToggle}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {formatWeekRange(briefing.week_start, stats?.weekEnd)}
          </p>
          {!expanded && briefing.narrative && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xl">
              {briefing.narrative.slice(0, 120)}…
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <span className="text-[11px] text-muted-foreground hidden sm:block">
            Generated {timeAgo(briefing.generated_at)}
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-5 space-y-5 border-t border-border/60">
          {/* Stats row */}
          <div className="flex flex-wrap gap-2 pt-4">
            <StatChip value={stats?.totalAlerts ?? 0} label="Total Alerts" />
            <StatChip value={stats?.newAlerts?.stock_out ?? 0} label="Stock-Outs" color="text-destructive" />
            <StatChip value={stats?.storesTracked ?? 0} label="Stores w/ Data" color="text-primary" />
            {topGainer && (
              <StatChip
                value={`+${topGainer.delta}`}
                label={topGainer.brand.length > 12 ? topGainer.brand.slice(0, 12) + "…" : topGainer.brand}
                color="text-green-500"
              />
            )}
            {topLoser && (
              <StatChip
                value={String(topLoser.delta)}
                label={topLoser.brand.length > 12 ? topLoser.brand.slice(0, 12) + "…" : topLoser.brand}
                color="text-red-400"
              />
            )}
          </div>

          {/* Narrative */}
          <div
            className="rounded-lg px-4 py-4 text-sm leading-relaxed text-foreground/90"
            style={{ background: "hsl(168 100% 42% / 0.04)", borderLeft: "3px solid hsl(168 100% 42% / 0.4)" }}
          >
            {briefing.narrative.split("\n").map((line, i) => (
              <p key={i} className={line.trim() === "" ? "h-3" : ""}>{line}</p>
            ))}
          </div>

          {/* Gainers / Losers */}
          {(stats?.topGainers?.length > 0 || stats?.topLosers?.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {stats.topGainers?.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingUp className="w-3.5 h-3.5 text-green-500" />
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Top Gainers</span>
                  </div>
                  <div className="space-y-1">
                    {stats.topGainers.map((b) => (
                      <div key={b.brand} className="flex items-center justify-between text-xs">
                        <span className="text-foreground">{b.brand}</span>
                        <span className="font-semibold text-green-500">+{b.delta} stores</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {stats.topLosers?.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Top Losers</span>
                  </div>
                  <div className="space-y-1">
                    {stats.topLosers.map((b) => (
                      <div key={b.brand} className="flex items-center justify-between text-xs">
                        <span className="text-foreground">{b.brand}</span>
                        <span className="font-semibold text-red-400">{b.delta} stores</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function WeeklyBriefing() {
  const { orgId } = useOrg();
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function loadBriefings() {
    setLoading(true);
    const { data } = await supabase
      .from("weekly_briefings")
      .select("*")
      .order("generated_at", { ascending: false })
      .limit(10);
    setBriefings((data ?? []) as Briefing[]);
    // Auto-expand the latest
    if (data && data.length > 0 && !expandedId) {
      setExpandedId(data[0].id);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadBriefings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const result = await callEdgeFunction<{ briefing: Briefing }>(
        "generate-weekly-briefing",
        orgId ? { org_id: orgId } : {},
        60_000,
      );
      if (result?.briefing) {
        setBriefings((prev) => [result.briefing, ...prev]);
        setExpandedId(result.briefing.id);
      }
    } catch (err: any) {
      setError(err?.message ?? "Failed to generate briefing");
    } finally {
      setGenerating(false);
    }
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  const latest = briefings[0];
  const archive = briefings.slice(1);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-foreground">Weekly Briefing</h1>
          <div className="header-underline mt-1" />
          <p className="text-sm text-muted-foreground mt-1">AI-generated market intelligence</p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 disabled:opacity-60 shrink-0"
          style={{
            background: "hsl(168 100% 42%)",
            color: "#000",
          }}
        >
          {generating ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Newspaper className="w-3.5 h-3.5" />
              Generate This Week's Report
            </>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-card border border-border animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && briefings.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-10 text-center space-y-3">
          <Newspaper className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium text-foreground">No briefings yet</p>
          <p className="text-xs text-muted-foreground">
            Click "Generate This Week's Report" to create your first AI-powered market briefing.
          </p>
        </div>
      )}

      {/* Latest briefing */}
      {!loading && latest && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Bell className="w-3.5 h-3.5 text-primary" />
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Latest Report</h2>
          </div>
          <BriefingCard
            briefing={latest}
            expanded={expandedId === latest.id}
            onToggle={() => toggleExpand(latest.id)}
          />
        </div>
      )}

      {/* Archive */}
      {!loading && archive.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Past Briefings</h2>
          </div>
          <div className="space-y-2">
            {archive.map((b) => (
              <BriefingCard
                key={b.id}
                briefing={b}
                expanded={expandedId === b.id}
                onToggle={() => toggleExpand(b.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
