import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Loader2, Shield, ChevronLeft, AlertTriangle, CheckCircle2, FileCode2 } from "lucide-react";

const ADMIN_EMAILS = ["chaz@greensolutionlab.com"];

interface QueueItem {
  id: string;
  intel_store_v2_id: string;
  category: string;
  decision: string | null;
  decision_website: string | null;
  decision_notes: string | null;
  decided_at: string | null;
  decided_by: string | null;
  applied_at: string | null;
}

export function Stage3ReviewApply() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [applying, setApplying] = useState(false);
  const [appliedCount, setAppliedCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user && ADMIN_EMAILS.includes(user.email ?? "");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("stage_3_review_queue")
      .select("id, intel_store_v2_id, category, decision, decision_website, decision_notes, decided_at, decided_by, applied_at")
      .not("decision", "is", null)
      .is("applied_at", null);
    if (error) setError(error.message);
    else setItems((data as QueueItem[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  const byDecision = useMemo(() => {
    const m: Record<string, QueueItem[]> = {};
    for (const it of items) {
      const k = it.decision ?? "(null)";
      if (!m[k]) m[k] = [];
      m[k].push(it);
    }
    return m;
  }, [items]);

  const previewSql = useMemo(() => {
    const lines: string[] = ["-- Stage 3 — apply decisions to intel_stores_v2. Generated in-browser."];
    for (const it of items) {
      const id = it.intel_store_v2_id.replace(/'/g, "''");
      const note = `Stage3: ${it.decision}${it.decision_notes ? " — " + it.decision_notes.replace(/'/g, "''").replace(/\n/g, " ") : ""}`;
      switch (it.decision) {
        case "confirmed_as_is":
          lines.push(`UPDATE intel_stores_v2 SET website_verified = true, v2_notes = coalesce(v2_notes,'') || E'\\n${note.replace(/'/g, "''")}' WHERE id = '${id}';`);
          break;
        case "changed_website": {
          const url = (it.decision_website ?? "").replace(/'/g, "''");
          lines.push(`UPDATE intel_stores_v2 SET website = '${url}', website_verified = true, website_association_source = 'manual_chaz', v2_notes = coalesce(v2_notes,'') || E'\\n${note.replace(/'/g, "''")}' WHERE id = '${id}';`);
          break;
        }
        case "no_website":
          lines.push(`UPDATE intel_stores_v2 SET website = NULL, website_verified = false, website_association_source = 'manual_chaz', v2_notes = coalesce(v2_notes,'') || E'\\n${note.replace(/'/g, "''")}' WHERE id = '${id}';`);
          break;
        case "not_operating":
          lines.push(`UPDATE intel_stores_v2 SET status = 'licensed_not_operating', website_verified = false, website_association_source = 'manual_chaz', v2_notes = coalesce(v2_notes,'') || E'\\n${note.replace(/'/g, "''")}' WHERE id = '${id}';`);
          break;
        case "flagged_research":
          lines.push(`UPDATE intel_stores_v2 SET v2_notes = coalesce(v2_notes,'') || E'\\n${note.replace(/'/g, "''")}' WHERE id = '${id}';`);
          break;
      }
    }
    return lines.join("\n");
  }, [items]);

  async function apply() {
    if (!confirm(`Apply ${items.length} decisions to intel_stores_v2? intel_stores is not touched.`)) return;
    setApplying(true);
    setError(null);
    let ok = 0;
    for (const it of items) {
      const note = `Stage3: ${it.decision}${it.decision_notes ? " — " + it.decision_notes : ""}`;
      const updates: Record<string, any> = {};
      switch (it.decision) {
        case "confirmed_as_is":
          updates.website_verified = true; break;
        case "changed_website":
          updates.website = it.decision_website;
          updates.website_verified = true;
          updates.website_association_source = "manual_chaz";
          break;
        case "no_website":
          updates.website = null;
          updates.website_verified = false;
          updates.website_association_source = "manual_chaz";
          break;
        case "not_operating":
          updates.status = "licensed_not_operating";
          updates.website_verified = false;
          updates.website_association_source = "manual_chaz";
          break;
        case "flagged_research":
          // note only
          break;
      }
      // Append the note using a second-round read-modify-write so we don't
      // stomp existing v2_notes. Anon RLS allows SELECT + UPDATE, no concat.
      const { data: cur, error: readErr } = await supabase
        .from("intel_stores_v2").select("v2_notes").eq("id", it.intel_store_v2_id).maybeSingle();
      if (readErr) { setError(`Read failed for ${it.intel_store_v2_id}: ${readErr.message}`); break; }
      updates.v2_notes = (cur?.v2_notes ? cur.v2_notes + "\n" : "") + note;

      const { error: upErr } = await supabase
        .from("intel_stores_v2").update(updates).eq("id", it.intel_store_v2_id);
      if (upErr) { setError(`Update failed for ${it.intel_store_v2_id}: ${upErr.message}`); break; }

      const { error: qErr } = await supabase
        .from("stage_3_review_queue").update({ applied_at: new Date().toISOString() }).eq("id", it.id);
      if (qErr) { setError(`Queue mark-applied failed for ${it.id}: ${qErr.message}`); break; }
      ok++;
    }
    setAppliedCount(ok);
    setApplying(false);
    load();
  }

  if (!user) {
    return <div className="p-8 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading session…</div>;
  }
  if (!isAdmin) {
    return (
      <div className="p-8 max-w-xl mx-auto">
        <div className="rounded-lg border border-border bg-card p-6 flex items-start gap-3">
          <Shield className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <h1 className="font-semibold text-foreground">Admin-only page</h1>
            <p className="text-sm text-muted-foreground mt-1">Signed in as <span className="font-mono">{user.email}</span>.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link to="/admin/stage-3-review" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> Back to review
        </Link>
      </div>
      <h1 className="text-xl font-semibold text-foreground mb-4">Apply Stage 3 decisions</h1>

      {loading ? (
        <div className="p-8 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Nothing new to apply. {appliedCount !== null ? `${appliedCount} decisions were just applied.` : "Make some decisions on the review page first."}
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-card p-4 mb-4">
            <div className="text-sm font-medium text-foreground mb-2">{items.length} decisions pending apply</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              {Object.entries(byDecision).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between px-2.5 py-1.5 rounded bg-accent/40">
                  <span className="text-muted-foreground">{k.replace(/_/g, " ")}</span>
                  <span className="font-medium text-foreground">{v.length}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-amber-400/50 bg-amber-50 dark:bg-amber-900/20 p-3 mb-4 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              Applying these will UPDATE intel_stores_v2 only. <span className="font-mono">intel_stores</span> is not touched.
              Each row appends a <span className="font-mono">v2_notes</span> line so actions are auditable.
            </div>
          </div>

          <details className="rounded-lg border border-border bg-card mb-4">
            <summary className="cursor-pointer px-4 py-2 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-2">
              <FileCode2 className="w-3.5 h-3.5" /> Preview SQL ({previewSql.split("\n").length} lines)
            </summary>
            <pre className="px-4 py-3 text-[11px] leading-relaxed text-foreground/80 overflow-x-auto border-t border-border">
{previewSql}
            </pre>
          </details>

          <div className="flex items-center gap-3">
            <button
              onClick={apply}
              disabled={applying}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-2"
            >
              {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Apply {items.length} decisions
            </button>
            {error && <div className="text-xs text-rose-600 dark:text-rose-400">{error}</div>}
            {appliedCount !== null && !error && (
              <div className="text-xs text-emerald-600 dark:text-emerald-400">Applied {appliedCount} rows successfully.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
