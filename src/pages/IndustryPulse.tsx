import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { PlanGate } from "@/components/PlanGate";
import {
  Gavel, ExternalLink, Search, Sparkles, Filter,
  Store, Leaf, User, ChevronDown, ChevronRight,
  Users, Calendar, Landmark,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface PulseItem {
  id:                   string;
  title:                string;
  source_url:           string | null;
  source_name:          string;
  category:             string | null;
  status:               string | null;
  effective_date:       string | null;
  raw_content:          string | null;
  ai_summary:           string | null;
  ai_impact:            string | null;
  ai_impact_retailers:  string | null;
  ai_impact_farms:      string | null;
  ai_impact_consumers:  string | null;
  ai_outcome:           string | null;
  relevance_score:      number | null;
  scope:                string | null;
  published_at:         string | null;
  created_at:           string;
  bill_number:          string | null;
  sponsors:             string[] | null;
  committee:            string | null;
  last_action:          string | null;
  last_action_date:     string | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "All", "Legislation", "Regulation", "Compliance", "Taxation",
  "Licensing", "Testing", "Packaging", "Federal", "Industry",
] as const;

const SCOPES = ["All", "washington", "federal", "national"] as const;

// Derived bill-status buckets — inferred from status code + ai_outcome text.
const BILL_STATUSES = ["All", "Enacted", "In Committee", "Passed One Chamber", "Died", "Other"] as const;
type BillStatus = (typeof BILL_STATUSES)[number];

const AUDIENCE_OPTIONS = ["All", "retailers", "farms", "consumers"] as const;
type Audience = (typeof AUDIENCE_OPTIONS)[number];

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return iso; }
}

// Map raw WSL status + ai_outcome to a display bucket for filtering + badges.
function inferBillStatus(item: PulseItem): BillStatus {
  const status  = (item.status  ?? "").toLowerCase();
  const outcome = (item.ai_outcome ?? "").toLowerCase();
  if (/^c\s*\d+\s*l\s*\d+/i.test(item.status ?? "") || /enacted|signed into law|chapter \d+/.test(outcome)) return "Enacted";
  if (/died|dead|failed|x\s*file/.test(outcome) || /rules\s*x/i.test(item.status ?? "")) return "Died";
  if (/passed (house|senate)/.test(outcome) && !/passed both|signed/.test(outcome))                        return "Passed One Chamber";
  if (/committee|ways.*means|labor.*comm|consumer protection|rules/i.test(status + " " + outcome))         return "In Committee";
  return "Other";
}

function billStatusColor(s: BillStatus): string {
  switch (s) {
    case "Enacted":            return "bg-primary/15 text-primary border-primary/30";
    case "Passed One Chamber": return "bg-success/15 text-success border-success/30";
    case "In Committee":       return "bg-warning/15 text-warning border-warning/30";
    case "Died":               return "bg-destructive/15 text-destructive border-destructive/30";
    default:                   return "bg-muted/40 text-muted-foreground border-border";
  }
}

function relevanceColor(r: number | null): string {
  if (r == null) return "text-muted-foreground";
  if (r >= 8) return "text-destructive";
  if (r >= 5) return "text-warning";
  return "text-muted-foreground";
}

// "Not applicable" and empty strings shouldn't render an audience section.
function hasContent(s: string | null | undefined): boolean {
  if (!s) return false;
  const trimmed = s.trim();
  if (trimmed.length < 3) return false;
  if (/^(n\/?a|not applicable|none)\.?$/i.test(trimmed)) return false;
  return true;
}

// ── Audience section ─────────────────────────────────────────────────────────

interface AudienceDef {
  key:       "retailers" | "farms" | "consumers";
  label:     string;
  icon:      typeof Store;
  textColor: string;
  bgColor:   string;
  borderCol: string;
}

const AUDIENCES: AudienceDef[] = [
  { key: "retailers", label: "Impact on Retailers",        icon: Store, textColor: "text-info",    bgColor: "bg-info/5",    borderCol: "border-info/40" },
  { key: "farms",     label: "Impact on Farms & Producers", icon: Leaf,  textColor: "text-success",  bgColor: "bg-success/5",  borderCol: "border-success/40" },
  { key: "consumers", label: "Impact on Consumers",        icon: User,  textColor: "text-chart-brand-b", bgColor: "bg-chart-brand-b/5", borderCol: "border-chart-brand-b/40" },
];

function AudienceSection({
  def, content, open, onToggle,
}: { def: AudienceDef; content: string; open: boolean; onToggle: () => void }) {
  const Icon    = def.icon;
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div className={`rounded-md border ${def.borderCol} ${def.bgColor}`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
      >
        <Icon className={`w-3.5 h-3.5 ${def.textColor}`} />
        <span className={`text-[10px] uppercase tracking-widest font-semibold ${def.textColor}`}>{def.label}</span>
        <Chevron className="w-3.5 h-3.5 text-muted-foreground ml-auto" />
      </button>
      {open && (
        <p className="px-3 pb-3 text-xs text-foreground/80 leading-relaxed">{content}</p>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function IndustryPulseInner() {
  const navigate = useNavigate();
  const [items, setItems]         = useState<PulseItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [category, setCategory]   = useState<string>("All");
  const [scope, setScope]         = useState<string>("All");
  const [billStatus, setBillStatus] = useState<BillStatus>("All");
  const [audience, setAudience]   = useState<Audience>("All");
  const [q, setQ]                 = useState("");
  const [expanded, setExpanded]   = useState<Record<string, Set<string>>>({}); // itemId -> set of audience keys

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
      if (billStatus !== "All" && i.category === "Legislation" && inferBillStatus(i) !== billStatus) return false;
      if (audience !== "All") {
        const f = audience === "retailers" ? i.ai_impact_retailers
                : audience === "farms"     ? i.ai_impact_farms
                : i.ai_impact_consumers;
        if (!hasContent(f)) return false;
      }
      if (!needle) return true;
      return (
        (i.title       ?? "").toLowerCase().includes(needle) ||
        (i.ai_summary  ?? "").toLowerCase().includes(needle) ||
        (i.ai_impact   ?? "").toLowerCase().includes(needle) ||
        (i.ai_impact_retailers ?? "").toLowerCase().includes(needle) ||
        (i.ai_impact_farms     ?? "").toLowerCase().includes(needle) ||
        (i.ai_impact_consumers ?? "").toLowerCase().includes(needle) ||
        (i.source_name ?? "").toLowerCase().includes(needle) ||
        (i.bill_number ?? "").toLowerCase().includes(needle)
      );
    });
  }, [items, category, scope, billStatus, audience, q]);

  function toggleAudience(itemId: string, key: string) {
    setExpanded(prev => {
      const cur = new Set(prev[itemId] ?? []);
      if (cur.has(key)) cur.delete(key); else cur.add(key);
      return { ...prev, [itemId]: cur };
    });
  }

  function askCody(item: PulseItem) {
    const seed = item.bill_number
      ? `Explain ${item.bill_number} (${item.title}) and how it affects WA cannabis retailers and producers.`
      : `Explain this regulatory item and how it affects my business:\n\n${item.title}`;
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
            Cannabis regulatory, legislative, and industry news — summarized in plain English, broken out by audience.
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
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search titles / bills…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-md bg-background border border-border focus:border-primary/50 outline-none"
            />
          </div>
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="px-3 py-2 text-sm rounded-md bg-background border border-border">
            {CATEGORIES.map(c => <option key={c} value={c}>{c === "All" ? "All categories" : c}</option>)}
          </select>
          <select value={scope} onChange={(e) => setScope(e.target.value)}
            className="px-3 py-2 text-sm rounded-md bg-background border border-border">
            {SCOPES.map(s => <option key={s} value={s}>{s === "All" ? "All scopes" : s}</option>)}
          </select>
          <select value={billStatus} onChange={(e) => setBillStatus(e.target.value as BillStatus)}
            className="px-3 py-2 text-sm rounded-md bg-background border border-border">
            {BILL_STATUSES.map(s => <option key={s} value={s}>{s === "All" ? "All bill statuses" : s}</option>)}
          </select>
          <select value={audience} onChange={(e) => setAudience(e.target.value as Audience)}
            className="px-3 py-2 text-sm rounded-md bg-background border border-border">
            {AUDIENCE_OPTIONS.map(a => <option key={a} value={a}>{a === "All" ? "Any audience impact" : `Impacts ${a}`}</option>)}
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
          No items match the current filters.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => {
            const audienceCounts = AUDIENCES.filter(a => hasContent(
              a.key === "retailers" ? item.ai_impact_retailers
                : a.key === "farms" ? item.ai_impact_farms
                : item.ai_impact_consumers
            ));
            const isLegislation = item.category === "Legislation";
            const derived = isLegislation ? inferBillStatus(item) : null;
            const open    = expanded[item.id] ?? new Set<string>();

            return (
              <article key={item.id} className="rounded-xl border border-border bg-card/60 p-5 hover:border-primary/30 transition-colors">
                {/* Meta row */}
                <div className="flex flex-wrap items-center gap-2 mb-2 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
                  <span>{item.source_name}</span>
                  {item.category && (<><span>·</span><span>{item.category}</span></>)}
                  {item.scope && (<><span>·</span><span>{item.scope}</span></>)}
                  {derived && (
                    <span className={`px-1.5 py-0.5 rounded border text-[9px] ${billStatusColor(derived)}`}>
                      {derived}
                    </span>
                  )}
                  {!derived && item.status && (
                    <span className="px-1.5 py-0.5 rounded border text-[9px] bg-muted/40 text-muted-foreground border-border">
                      {item.status}
                    </span>
                  )}
                  <span className="ml-auto text-muted-foreground/70 normal-case tracking-normal">
                    {fmtDate(item.last_action_date ?? item.published_at ?? item.created_at)}
                  </span>
                  {item.relevance_score != null && (
                    <span className={`text-[10px] font-bold ${relevanceColor(item.relevance_score)}`}>
                      {item.relevance_score}/10
                    </span>
                  )}
                </div>

                {/* Title + bill-number badge */}
                <div className="flex items-start gap-3 mb-2">
                  {item.bill_number && (
                    <span className="shrink-0 px-2 py-0.5 rounded-md bg-primary/15 text-primary border border-primary/30 text-[11px] font-bold font-mono">
                      {item.bill_number}
                    </span>
                  )}
                  <h3 className="text-sm font-semibold text-foreground leading-snug flex-1">
                    {item.title}
                  </h3>
                </div>

                {/* AI summary */}
                {item.ai_summary && (
                  <p className="text-sm text-foreground/80 mb-3 leading-relaxed">
                    {item.ai_summary}
                  </p>
                )}

                {/* Bill-specific meta strip: sponsors, committee, outcome */}
                {isLegislation && (
                  <div className="mb-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                    {item.sponsors && item.sponsors.length > 0 && (
                      <div className="flex items-start gap-1.5">
                        <Users className="w-3 h-3 mt-0.5 text-muted-foreground shrink-0" />
                        <div>
                          <span className="text-muted-foreground uppercase tracking-widest text-[9px] font-semibold">Sponsors</span>
                          <div className="text-foreground">{item.sponsors.slice(0, 6).join(", ")}</div>
                        </div>
                      </div>
                    )}
                    {item.committee && (
                      <div className="flex items-start gap-1.5">
                        <Landmark className="w-3 h-3 mt-0.5 text-muted-foreground shrink-0" />
                        <div>
                          <span className="text-muted-foreground uppercase tracking-widest text-[9px] font-semibold">Committee</span>
                          <div className="text-foreground">{item.committee}</div>
                        </div>
                      </div>
                    )}
                    {item.last_action && (
                      <div className="flex items-start gap-1.5 md:col-span-2">
                        <Calendar className="w-3 h-3 mt-0.5 text-muted-foreground shrink-0" />
                        <div>
                          <span className="text-muted-foreground uppercase tracking-widest text-[9px] font-semibold">
                            Last action{item.last_action_date ? ` · ${fmtDate(item.last_action_date)}` : ""}
                          </span>
                          <div className="text-foreground">{item.last_action}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Outcome callout */}
                {item.ai_outcome && (
                  <div className="mb-3 rounded-md bg-primary/5 border border-primary/20 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-primary mb-1">Current outcome</p>
                    <p className="text-xs text-foreground/80 leading-relaxed">{item.ai_outcome}</p>
                  </div>
                )}

                {/* Per-audience sections */}
                {audienceCounts.length > 0 && (
                  <div className="space-y-2 mt-3">
                    {AUDIENCES.map(a => {
                      const content = a.key === "retailers" ? item.ai_impact_retailers
                                    : a.key === "farms"     ? item.ai_impact_farms
                                    :                         item.ai_impact_consumers;
                      if (!hasContent(content)) return null;
                      return (
                        <AudienceSection
                          key={a.key}
                          def={a}
                          content={content!}
                          open={open.has(a.key)}
                          onToggle={() => toggleAudience(item.id, a.key)}
                        />
                      );
                    })}
                  </div>
                )}

                {/* Fallback: original single ai_impact when no per-audience breakdown */}
                {audienceCounts.length === 0 && item.ai_impact && (
                  <div className="mt-2 rounded-md bg-primary/5 border border-primary/20 px-3 py-2">
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
            );
          })}
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
