import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Check, ExternalLink, Loader2, Save, Shield, ChevronRight } from "lucide-react";

const ADMIN_EMAILS = ["chaz@greensolutionlab.com"];

type Decision = "confirmed_as_is" | "changed_website" | "no_website" | "not_operating" | "flagged_research";

interface Candidate {
  url: string | null;
  source: string;
  confidence: string | number;
  reason: string;
  intel_store_id?: string;
  name?: string;
  address?: string;
}

interface V2Row {
  id: string;
  lcb_license_id: string | null;
  ubi: string | null;
  source_of_truth: string | null;
  name: string;
  trade_name: string | null;
  business_name: string | null;
  address: string | null;
  city: string | null;
  zip_code: string | null;
  website: string | null;
  website_verified: boolean;
  website_association_source: string | null;
  v2_notes: string | null;
}

interface QueueItem {
  id: string;
  intel_store_v2_id: string;
  category: "cat2_sample" | "cat3_ambiguous" | "cat4_no_match" | "cat5_tribal";
  priority: number;
  candidate_websites: Candidate[] | null;
  decision: Decision | null;
  decision_website: string | null;
  decision_notes: string | null;
  decided_at: string | null;
  decided_by: string | null;
  applied_at: string | null;
  v2: V2Row;
}

const CATEGORY_LABEL: Record<QueueItem["category"], string> = {
  cat2_sample:     "Cat 2 sample",
  cat3_ambiguous:  "Cat 3 ambiguous",
  cat4_no_match:   "Cat 4 no match",
  cat5_tribal:     "Cat 5 tribal",
};

const CATEGORY_COLOR: Record<QueueItem["category"], string> = {
  cat2_sample:     "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
  cat3_ambiguous:  "bg-rose-100 text-rose-900 dark:bg-rose-900/30 dark:text-rose-200",
  cat4_no_match:   "bg-sky-100 text-sky-900 dark:bg-sky-900/30 dark:text-sky-200",
  cat5_tribal:     "bg-violet-100 text-violet-900 dark:bg-violet-900/30 dark:text-violet-200",
};

export function Stage3Review() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [filter, setFilter] = useState<"undecided" | "all" | QueueItem["category"]>("undecided");
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user && ADMIN_EMAILS.includes(user.email ?? "");

  async function load() {
    setLoading(true);
    setError(null);
    const { data: queue, error: qErr } = await supabase
      .from("stage_3_review_queue")
      .select("id, intel_store_v2_id, category, priority, candidate_websites, decision, decision_website, decision_notes, decided_at, decided_by, applied_at")
      .order("priority", { ascending: false })
      .order("category")
      .order("created_at");
    if (qErr) { setError(qErr.message); setLoading(false); return; }
    const ids = (queue ?? []).map(q => q.intel_store_v2_id);
    const { data: v2s, error: vErr } = await supabase
      .from("intel_stores_v2")
      .select("id, lcb_license_id, ubi, source_of_truth, name, trade_name, business_name, address, city, zip_code, website, website_verified, website_association_source, v2_notes")
      .in("id", ids);
    if (vErr) { setError(vErr.message); setLoading(false); return; }
    const v2Map = new Map<string, V2Row>((v2s ?? []).map(v => [v.id, v as V2Row]));
    const joined: QueueItem[] = (queue ?? []).map((q: any) => ({ ...q, v2: v2Map.get(q.intel_store_v2_id)! }))
      .filter(q => q.v2);
    setItems(joined);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let out = items;
    if (filter === "undecided") out = out.filter(i => !i.decision);
    else if (filter !== "all") out = out.filter(i => i.category === filter);
    return out;
  }, [items, filter]);

  const progress = useMemo(() => {
    const total = items.length;
    const done = items.filter(i => i.decision).length;
    const byCat: Record<string, { total: number; done: number }> = {};
    for (const it of items) {
      const k = it.category;
      if (!byCat[k]) byCat[k] = { total: 0, done: 0 };
      byCat[k].total++;
      if (it.decision) byCat[k].done++;
    }
    return { total, done, byCat };
  }, [items]);

  if (!user) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
        Loading session…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-8 max-w-xl mx-auto">
        <div className="rounded-lg border border-border bg-card p-6 flex items-start gap-3">
          <Shield className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <h1 className="font-semibold text-foreground">Admin-only page</h1>
            <p className="text-sm text-muted-foreground mt-1">
              The Stage 3 review tool is restricted to admin accounts. Signed in as{" "}
              <span className="font-mono">{user.email}</span>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Stage 3 Review</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manually confirm or correct website associations for {progress.total} intel_stores_v2 rows.
          </p>
        </div>
        <Link
          to="/admin/stage-3-review/apply"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
        >
          Apply decisions <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Progress */}
      <div className="rounded-lg border border-border bg-card p-4 mb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="text-2xl font-bold text-foreground">{progress.done}</div>
          <div className="text-sm text-muted-foreground">of {progress.total} reviewed</div>
          <div className="ml-auto flex gap-3 text-xs">
            {Object.entries(progress.byCat).map(([k, v]) => (
              <span key={k} className="text-muted-foreground">
                {CATEGORY_LABEL[k as QueueItem["category"]]}: <span className="text-foreground font-medium">{v.done}/{v.total}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: progress.total ? `${(progress.done / progress.total) * 100}%` : "0%" }}
          />
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-muted-foreground">Filter:</span>
        {(["undecided","all","cat3_ambiguous","cat4_no_match","cat2_sample","cat5_tribal"] as const).map(k => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`px-2.5 py-1 text-xs rounded-md ${
              filter === k
                ? "bg-primary/10 text-primary font-medium"
                : "bg-accent/50 text-muted-foreground hover:bg-accent"
            }`}
          >
            {k === "undecided" ? "Undecided" : k === "all" ? "All" : CATEGORY_LABEL[k]}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-rose-400/50 bg-rose-50 dark:bg-rose-900/20 p-3 text-sm text-rose-900 dark:text-rose-200">
          {error}
        </div>
      )}

      {/* BULK ACTIONS */}
      <BulkActions items={items} onChange={load} />

      {loading ? (
        <div className="p-8 text-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mx-auto" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground text-sm">
          Nothing to review in this filter.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => (
            <ReviewCard key={item.id} item={item} onSaved={load} userEmail={user.email!} />
          ))}
        </div>
      )}
    </div>
  );
}

function BulkActions({ items, onChange }: { items: QueueItem[]; onChange: () => void }) {
  const { user } = useAuth();
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const cat2Done = items.filter(i => i.category === "cat2_sample" && i.decision === "confirmed_as_is").length;
  const cat2Total = items.filter(i => i.category === "cat2_sample").length;
  const bulkAcceptEligible = cat2Done >= 15;

  const seAll = items.filter(i => i.category === "cat4_no_match" && i.v2?.source_of_truth === "lcb_social_equity");
  const seDecided = seAll.filter(i => i.decision).length;

  async function bulkAcceptCat2Remaining() {
    if (!confirm(`Mark all remaining Cat 2 rows (beyond this sample) as website_verified=true? This will promote every "populated but unverified" row in intel_stores_v2.`)) return;
    setSaving("cat2");
    setMsg(null);
    const { error: upErr, count } = await supabase
      .from("intel_stores_v2")
      .update({ website_verified: true }, { count: "exact" })
      .eq("source_of_truth", "lcb_retail")
      .eq("website_verified", false)
      .not("website", "is", null);
    if (upErr) { setMsg(`Failed: ${upErr.message}`); setSaving(null); return; }
    setMsg(`Bulk-accepted ${count ?? "?"} rows. Refreshing…`);
    setSaving(null);
    onChange();
  }

  async function bulkSeNotOperating() {
    if (seAll.length === 0) { setMsg("No SE retailers in queue."); return; }
    if (!confirm(`Mark all ${seAll.length} Social Equity queue items as 'not_operating'?`)) return;
    setSaving("se");
    setMsg(null);
    const ids = seAll.map(i => i.id);
    const { error } = await supabase
      .from("stage_3_review_queue")
      .update({
        decision: "not_operating",
        decision_notes: "Bulk: SE retailer, not yet operating",
        decided_at: new Date().toISOString(),
        decided_by: user?.email ?? null,
      })
      .in("id", ids);
    if (error) { setMsg(`Failed: ${error.message}`); setSaving(null); return; }
    setMsg(`Marked ${seAll.length} SE rows as not_operating.`);
    setSaving(null);
    onChange();
  }

  return (
    <div className="rounded-lg border border-border bg-card/50 p-3 mb-4">
      <div className="text-xs font-medium text-muted-foreground mb-2">Bulk actions</div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={bulkAcceptCat2Remaining}
          disabled={!bulkAcceptEligible || saving !== null}
          className="text-xs px-3 py-1.5 rounded-md border border-border bg-card hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          title={bulkAcceptEligible ? "" : `Confirm at least 15 of 20 Cat 2 samples first (${cat2Done}/20)`}
        >
          {saving === "cat2" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Accept all remaining Cat 2 ({cat2Done}/{cat2Total} sample confirmed)
        </button>
        <button
          onClick={bulkSeNotOperating}
          disabled={seAll.length === 0 || saving !== null || seDecided === seAll.length}
          className="text-xs px-3 py-1.5 rounded-md border border-border bg-card hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
        >
          {saving === "se" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Mark all SE as not_operating ({seDecided}/{seAll.length})
        </button>
      </div>
      {msg && <div className="mt-2 text-xs text-muted-foreground">{msg}</div>}
    </div>
  );
}

function ReviewCard({ item, onSaved, userEmail }: { item: QueueItem; onSaved: () => void; userEmail: string }) {
  const [decision, setDecision] = useState<Decision | null>(item.decision);
  const [pickedUrl, setPickedUrl] = useState<string>(item.decision_website ?? "");
  const [customUrl, setCustomUrl] = useState<string>("");
  const [useCustom, setUseCustom] = useState(false);
  const [notes, setNotes] = useState(item.decision_notes ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const candidates = item.candidate_websites ?? [];
  const v2 = item.v2;

  async function save() {
    setSaving(true);
    setMsg(null);
    const websiteValue =
      decision === "changed_website"
        ? (useCustom ? customUrl.trim() : pickedUrl.trim())
        : null;
    if (decision === "changed_website" && !websiteValue) {
      setMsg("Pick a candidate or enter a custom URL.");
      setSaving(false);
      return;
    }
    const { error } = await supabase
      .from("stage_3_review_queue")
      .update({
        decision,
        decision_website: websiteValue,
        decision_notes: notes || null,
        decided_at: new Date().toISOString(),
        decided_by: userEmail,
      })
      .eq("id", item.id);
    if (error) { setMsg(`Failed: ${error.message}`); setSaving(false); return; }
    setMsg("Saved.");
    setSaving(false);
    setTimeout(() => onSaved(), 300);
  }

  const badgeClass = CATEGORY_COLOR[item.category];

  return (
    <div className={`rounded-lg border border-border bg-card p-4 ${item.decision ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded ${badgeClass}`}>
              {CATEGORY_LABEL[item.category]}
            </span>
            {v2.lcb_license_id && (
              <span className="text-[10px] font-mono text-muted-foreground">lic {v2.lcb_license_id}</span>
            )}
            {v2.ubi && (
              <span className="text-[10px] font-mono text-muted-foreground">ubi {v2.ubi}</span>
            )}
          </div>
          <div className="font-semibold text-foreground">{v2.name}</div>
          {v2.trade_name && v2.trade_name !== v2.name && (
            <div className="text-xs text-muted-foreground">trade: {v2.trade_name}</div>
          )}
        </div>
        {item.decision && (
          <div className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200">
            {item.decision.replace(/_/g, " ")}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-3">
        <div>
          <div className="text-muted-foreground">LCB address</div>
          <div className="text-foreground">{v2.address || "—"}</div>
          <div className="text-muted-foreground">{v2.city} {v2.zip_code}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Current v2 website</div>
          {v2.website ? (
            <a href={v2.website} target="_blank" rel="noreferrer" className="text-primary break-all inline-flex items-center gap-1 hover:underline">
              {v2.website} <ExternalLink className="w-3 h-3" />
            </a>
          ) : (
            <div className="text-muted-foreground italic">none</div>
          )}
          {v2.website_verified && (
            <div className="text-[10px] text-emerald-600 dark:text-emerald-400">verified</div>
          )}
        </div>
      </div>

      {v2.v2_notes && (
        <details className="text-xs mb-3">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">v2 notes</summary>
          <pre className="mt-1 whitespace-pre-wrap text-muted-foreground text-[11px] bg-accent/30 rounded p-2">{v2.v2_notes}</pre>
        </details>
      )}

      {candidates.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-muted-foreground mb-1">Candidate websites ({candidates.length})</div>
          <div className="space-y-1">
            {candidates.filter(c => c.url).map((c, i) => (
              <label key={i} className="flex items-start gap-2 text-xs cursor-pointer p-2 rounded hover:bg-accent/40">
                <input
                  type="radio"
                  name={`cand-${item.id}`}
                  value={c.url ?? ""}
                  checked={!useCustom && pickedUrl === (c.url ?? "")}
                  onChange={() => { setPickedUrl(c.url ?? ""); setUseCustom(false); setDecision("changed_website"); }}
                  className="mt-0.5"
                />
                <span className="flex-1">
                  <a href={c.url!} target="_blank" rel="noreferrer" className="text-primary hover:underline break-all inline-flex items-center gap-1">
                    {c.url} <ExternalLink className="w-3 h-3" />
                  </a>
                  <span className="block text-muted-foreground text-[11px]">
                    {c.name ? `${c.name} · ` : ""}{c.address ? `${c.address} · ` : ""}confidence: {String(c.confidence)}
                  </span>
                  <span className="block text-muted-foreground text-[10px]">{c.reason}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        <button
          onClick={() => { setDecision("confirmed_as_is"); setUseCustom(false); setPickedUrl(""); }}
          disabled={!v2.website}
          className={`text-xs px-3 py-1.5 rounded-md ${decision === "confirmed_as_is" ? "bg-primary text-primary-foreground" : "border border-border bg-card hover:bg-accent"} disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          Confirm as-is
        </button>
        <button
          onClick={() => { setDecision("changed_website"); setUseCustom(true); }}
          className={`text-xs px-3 py-1.5 rounded-md ${decision === "changed_website" && useCustom ? "bg-primary text-primary-foreground" : "border border-border bg-card hover:bg-accent"}`}
        >
          Enter custom URL
        </button>
        <button
          onClick={() => { setDecision("no_website"); setUseCustom(false); setPickedUrl(""); }}
          className={`text-xs px-3 py-1.5 rounded-md ${decision === "no_website" ? "bg-primary text-primary-foreground" : "border border-border bg-card hover:bg-accent"}`}
        >
          No website
        </button>
        <button
          onClick={() => { setDecision("not_operating"); setUseCustom(false); setPickedUrl(""); }}
          className={`text-xs px-3 py-1.5 rounded-md ${decision === "not_operating" ? "bg-primary text-primary-foreground" : "border border-border bg-card hover:bg-accent"}`}
        >
          Not operating
        </button>
        <button
          onClick={() => { setDecision("flagged_research"); }}
          className={`text-xs px-3 py-1.5 rounded-md ${decision === "flagged_research" ? "bg-primary text-primary-foreground" : "border border-border bg-card hover:bg-accent"}`}
        >
          Flag for research
        </button>
      </div>

      {useCustom && decision === "changed_website" && (
        <input
          type="url"
          value={customUrl}
          onChange={e => setCustomUrl(e.target.value)}
          placeholder="https://example.com/"
          className="w-full text-xs px-2.5 py-1.5 border border-border rounded-md bg-card mb-2"
        />
      )}

      <input
        type="text"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Optional notes…"
        className="w-full text-xs px-2.5 py-1.5 border border-border rounded-md bg-card mb-3"
      />

      <div className="flex items-center justify-between">
        <div className="text-[10px] text-muted-foreground">
          {msg || (item.decided_at ? `Decided ${new Date(item.decided_at).toLocaleString()} by ${item.decided_by || "?"}` : "Not yet decided")}
        </div>
        <button
          onClick={save}
          disabled={!decision || saving}
          className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save + next
        </button>
      </div>
    </div>
  );
}
