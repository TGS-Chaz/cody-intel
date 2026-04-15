import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { PlanGate } from "@/components/PlanGate";
import { Gavel, ExternalLink, Search, Sparkles, Filter } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface PulseItem {
  id:              string;
  title:           string;
  source_url:      string | null;
  source_name:     string;
  category:        string | null;
  status:          string | null;
  effective_date:  string | null;
  raw_content:     string | null;
  ai_summary:      string | null;
  ai_impact:       string | null;
  relevance_score: number | null;
  scope:           string | null;
  published_at:    string | null;
  created_at:      string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "All", "Legislation", "Regulation", "Compliance", "Taxation",
  "Licensing", "Testing", "Packaging", "Federal", "Industry",
] as const;

const SCOPES = ["All", "washington", "federal", "national"] as const;

const STATUSES = [
  "All", "Proposed", "In Committee", "Passed", "Enacted", "Effective", "Informational",
] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return iso; }
}

function statusColor(s: string | null): string {
  switch (s) {
    case "Enacted":
    case "Effective":
    case "Passed":       return "bg-primary/15 text-primary border-primary/30";
    case "In Committee":
    case "Proposed":     return "bg-amber-500/15 text-amber-500 border-amber-500/30";
    case "Informational":return "bg-muted/40 text-muted-foreground border-border";
    default:             return "bg-muted/40 text-muted-foreground border-border";
  }
}

function relevanceColor(r: number | null): string {
  if (r == null) return "text-muted-foreground";
  if (r >= 8) return "text-red-400";
  if (r >= 5) return "text-amber-400";
  return "text-muted-foreground";
}

// ── Page ─────────────────────────────────────────────────────────────────────

function IndustryPulseInner() {
  const navigate = useNavigate();
  const [items, setItems]       = useState<PulseItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [category, setCategory] = useState<string>("All");
  const [scope, setScope]       = useState<string>("All");
  const [status, setStatus]     = useState<string>("All");
  const [q, setQ]               = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("industry_pulse_items")
        .select("*")
        .order("relevance_score", { ascending: false, nullsFirst: false })
        .order("published_at",    { ascending: false, nullsFirst: false })
        .limit(250);
      setItems((data as PulseItem[] | null) ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter(i => {
      if (category !== "All" && i.category !== category) return false;
      if (scope    !== "All" && i.scope    !== scope)    return false;
      if (status   !== "All" && i.status   !== status)   return false;
      if (!needle) return true;
      return (
        (i.title       ?? "").toLowerCase().includes(needle) ||
        (i.ai_summary  ?? "").toLowerCase().includes(needle) ||
        (i.ai_impact   ?? "").toLowerCase().includes(needle) ||
        (i.source_name ?? "").toLowerCase().includes(needle)
      );
    });
  }, [items, category, scope, status, q]);

  function askCody(item: PulseItem) {
    const seed = `Explain this regulatory item and how it affects my business:\n\n${item.title}`;
    // Pre-load the AskCody page with a message via query string. AskCody page
    // reads ?q= on mount and auto-submits.
    navigate(`/ask?q=${encodeURIComponent(seed)}`);
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2 text-foreground">
            <Gavel className="w-5 h-5 text-primary" />
            Industry Pulse
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cannabis regulatory, legislative, and industry news — summarized in plain English.
          </p>
        </div>
        <Link
          to="/ask"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/15"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Ask Cody about regulations
        </Link>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Filter className="w-3.5 h-3.5" />
          <span className="uppercase tracking-widest font-semibold">Filters</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search titles / summaries…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-md bg-background border border-border focus:border-primary/50 outline-none"
            />
          </div>
          <select
            value={category} onChange={(e) => setCategory(e.target.value)}
            className="px-3 py-2 text-sm rounded-md bg-background border border-border"
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{c === "All" ? "All categories" : c}</option>)}
          </select>
          <select
            value={scope} onChange={(e) => setScope(e.target.value)}
            className="px-3 py-2 text-sm rounded-md bg-background border border-border"
          >
            {SCOPES.map(s => <option key={s} value={s}>{s === "All" ? "All scopes" : s}</option>)}
          </select>
          <select
            value={status} onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-2 text-sm rounded-md bg-background border border-border"
          >
            {STATUSES.map(s => <option key={s} value={s}>{s === "All" ? "All statuses" : s}</option>)}
          </select>
        </div>
        <div className="text-[11px] text-muted-foreground">
          {loading ? "Loading…" : `${filtered.length} of ${items.length} items`}
        </div>
      </div>

      {/* Feed */}
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading items…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card/60 p-10 text-center text-sm text-muted-foreground">
          No items match the current filters. The scrape-industry-pulse edge function populates this feed.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => (
            <article key={item.id} className="rounded-xl border border-border bg-card/60 p-5 hover:border-primary/30 transition-colors">
              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-2 mb-2 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
                <span>{item.source_name}</span>
                {item.category && (<><span>·</span><span>{item.category}</span></>)}
                {item.scope && (<><span>·</span><span>{item.scope}</span></>)}
                {item.status && (
                  <span className={`px-1.5 py-0.5 rounded border text-[9px] ${statusColor(item.status)}`}>
                    {item.status}
                  </span>
                )}
                <span className="ml-auto text-muted-foreground/70 normal-case tracking-normal">
                  {fmtDate(item.published_at ?? item.created_at)}
                </span>
                {item.relevance_score != null && (
                  <span className={`text-[10px] font-bold ${relevanceColor(item.relevance_score)}`}>
                    {item.relevance_score}/10
                  </span>
                )}
              </div>

              {/* Title */}
              <h3 className="text-sm font-semibold text-foreground mb-2 leading-snug">
                {item.title}
              </h3>

              {/* AI summary */}
              {item.ai_summary && (
                <p className="text-sm text-foreground/80 mb-2 leading-relaxed">
                  {item.ai_summary}
                </p>
              )}

              {/* Impact */}
              {item.ai_impact && (
                <div className="mt-2 rounded-md bg-primary/5 border-l-2 border-primary/50 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-widest font-semibold text-primary mb-1">
                    How this affects your business
                  </p>
                  <p className="text-xs text-foreground/80 leading-relaxed">{item.ai_impact}</p>
                </div>
              )}

              {/* Dates / Actions */}
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                {item.effective_date && (
                  <span className="text-[11px] text-muted-foreground">
                    Effective: <span className="text-foreground">{fmtDate(item.effective_date)}</span>
                  </span>
                )}
                {item.source_url && (
                  <a
                    href={item.source_url} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Source
                  </a>
                )}
                <button
                  onClick={() => askCody(item)}
                  className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/15"
                >
                  <Sparkles className="w-3 h-3" />
                  Ask Cody
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function IndustryPulse() {
  return (
    <PlanGate feature="industry_pulse">
      <IndustryPulseInner />
    </PlanGate>
  );
}

export default IndustryPulse;
