import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Radio, Play, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

const EDGE_FN_URL = import.meta.env.VITE_SUPABASE_URL + "/functions/v1/scrape-website-menu";

interface ScraperAction {
  id: string;
  label: string;
  description: string;
  action: string;
  body?: Record<string, unknown>;
}

const SCRAPERS: ScraperAction[] = [
  {
    id: "dutchie-all",
    label: "Dutchie — Scrape All",
    description: "Fetch menus for all Dutchie-linked stores via the Dutchie embedded API",
    action: "scrape-dutchie-all",
  },
  {
    id: "leafly-discover",
    label: "Leafly — Discover WA Stores",
    description: "Search Leafly for all active Washington state dispensaries",
    action: "leafly-discover",
    body: { state: "WA" },
  },
  {
    id: "weedmaps-discover",
    label: "Weedmaps — Discover WA Stores",
    description: "Crawl Weedmaps for WA dispensary listings",
    action: "weedmaps-discover",
  },
  {
    id: "posabit-scan",
    label: "POSaBit — Scan LCB Sites",
    description: "Check LCB-licensed store websites for POSaBit embed signatures",
    action: "posabit-scan",
  },
  {
    id: "lcb-audit",
    label: "LCB — Audit Matches",
    description: "Run confidence scoring audit on all LCB license ↔ CRM contact links",
    action: "lcb-audit-matches",
    body: { issuesOnly: true, limit: 50 },
  },
];

export function ScraperAdmin() {
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string }>>({});

  async function runScraper(scraper: ScraperAction) {
    setRunning(scraper.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(EDGE_FN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ action: scraper.action, ...(scraper.body ?? {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResults((prev) => ({ ...prev, [scraper.id]: { ok: true, message: JSON.stringify(data).slice(0, 140) } }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setResults((prev) => ({ ...prev, [scraper.id]: { ok: false, message: msg } }));
    }
    setRunning(null);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5 animate-fade-up">
      <div>
        <h1 className="text-foreground">Scraper Admin</h1>
        <div className="header-underline mt-1" />
        <p className="text-sm text-muted-foreground mt-1">Trigger data collection for all platforms</p>
      </div>

      <div className="grid gap-3">
        {SCRAPERS.map((scraper) => {
          const result = results[scraper.id];
          const isRunning = running === scraper.id;
          return (
            <div
              key={scraper.id}
              className="rounded-lg border border-border bg-card p-4 flex items-center gap-4 shadow-premium card-hover"
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "hsl(168 100% 42% / 0.1)" }}
              >
                <Radio className="w-4 h-4" style={{ color: "hsl(var(--primary))" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{scraper.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{scraper.description}</p>
                {result && (
                  <p className={`text-xs mt-1.5 flex items-center gap-1.5 ${result.ok ? "text-success" : "text-destructive"}`}>
                    {result.ok
                      ? <CheckCircle2 className="w-3 h-3 shrink-0" />
                      : <AlertCircle className="w-3 h-3 shrink-0" />}
                    <span className="font-mono-data truncate">{result.message}</span>
                  </p>
                )}
              </div>
              <button
                onClick={() => runScraper(scraper)}
                disabled={isRunning || running !== null}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-primary-foreground transition-colors disabled:opacity-50"
                style={{ background: "hsl(var(--primary))" }}
              >
                {isRunning
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Play className="w-3 h-3" />}
                {isRunning ? "Running…" : "Run"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
