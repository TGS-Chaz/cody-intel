import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import { Copy, Check, Globe, Code2, BarChart2, ChevronDown, Monitor } from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

interface Brand {
  id: string;
  name: string;
}

function toSlug(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function useCopyButton(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return [copied, copy];
}

// ── EmbedGenerator Component ──────────────────────────────────────────────────

interface OwnBrand {
  id: string;
  brand_name: string;
}

function EmbedGenerator() {
  const { orgId } = useOrg();
  const [ownBrands, setOwnBrands] = useState<OwnBrand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<OwnBrand | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [copiedScript, copyScript] = useCopyButton();
  const [copiedIframe, copyIframe] = useCopyButton();
  const [activeTab, setActiveTab] = useState<"script" | "iframe">("script");

  useEffect(() => {
    if (!orgId) return;
    supabase
      .from("user_brands")
      .select("id, brand_name")
      .eq("org_id", orgId)
      .eq("is_own_brand", true)
      .order("brand_name")
      .then(({ data }) => {
        const brands = (data as OwnBrand[]) ?? [];
        setOwnBrands(brands);
        if (brands.length > 0) setSelectedBrand(brands[0]);
      });
  }, [orgId]);

  const slug = selectedBrand ? toSlug(selectedBrand.brand_name) : "your-brand";
  const baseUrl = "https://cody-intel.vercel.app";

  const scriptCode = `<script
  src="${baseUrl}/widget/locator.js"
  data-brand="${slug}"
  data-theme="${theme}"
  data-org="${orgId ?? "YOUR_ORG_ID"}"
  async>
</script>`;

  const iframeCode = `<iframe
  src="${baseUrl}/widget/store-locator?brand=${slug}&org=${orgId ?? "YOUR_ORG_ID"}&theme=${theme}"
  width="100%"
  height="600"
  frameborder="0">
</iframe>`;

  const previewUrl = selectedBrand
    ? `/widget/store-locator?brand=${slug}&theme=${theme}`
    : null;

  const tabCls = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
      active
        ? "bg-primary text-primary-foreground"
        : "bg-secondary text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div>
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Code2 className="w-4 h-4 text-primary" />
          Embed Code Generator
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Generate embed code for your own brands to place on any website.
        </p>
      </div>

      {/* Config row */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Brand selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Your Brand
            </label>
            {ownBrands.length === 0 ? (
              <p className="text-sm text-muted-foreground">No own brands configured.</p>
            ) : (
              <div className="relative">
                <select
                  value={selectedBrand?.id ?? ""}
                  onChange={(e) => {
                    const b = ownBrands.find((b) => b.id === e.target.value) ?? null;
                    setSelectedBrand(b);
                  }}
                  className="w-full appearance-none px-3 py-2 pr-8 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                >
                  {ownBrands.map((b) => (
                    <option key={b.id} value={b.id}>{b.brand_name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
            )}
          </div>
          {/* Theme selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Theme
            </label>
            <div className="flex gap-2">
              {(["dark", "light"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`flex-1 py-2 rounded-lg text-[12px] font-medium border transition-colors capitalize ${
                    theme === t
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Code tabs + preview */}
      {selectedBrand && (
        <>
          {/* Code block */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <div className="flex gap-2">
                <button className={tabCls(activeTab === "script")} onClick={() => setActiveTab("script")}>
                  Script Tag
                </button>
                <button className={tabCls(activeTab === "iframe")} onClick={() => setActiveTab("iframe")}>
                  iFrame
                </button>
              </div>
              <button
                onClick={() => activeTab === "script" ? copyScript(scriptCode) : copyIframe(iframeCode)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                {(activeTab === "script" ? copiedScript : copiedIframe)
                  ? <><Check className="w-3.5 h-3.5" /> Copied!</>
                  : <><Copy className="w-3.5 h-3.5" /> Copy</>}
              </button>
            </div>
            <div className="p-5">
              <pre
                className="text-xs bg-muted/40 rounded-lg p-4 overflow-x-auto text-muted-foreground whitespace-pre"
                style={{ fontFamily: "ui-monospace, 'Cascadia Code', monospace" }}
              >
                {activeTab === "script" ? scriptCode : iframeCode}
              </pre>
              <p className="text-[11px] text-muted-foreground mt-2">
                {activeTab === "script"
                  ? "Paste before the closing </body> tag on any HTML page."
                  : "Paste anywhere in your page content. Adjust width/height as needed."}
              </p>
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
              <Monitor className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Live Preview</span>
              <span className="text-[11px] text-muted-foreground ml-auto">
                {selectedBrand.brand_name} · {theme} theme
              </span>
            </div>
            <div
              className="overflow-hidden"
              style={{ background: theme === "dark" ? "#0a0a0a" : "#f8f8f8" }}
            >
              <iframe
                key={`${slug}-${theme}`}
                src={previewUrl!}
                width="100%"
                height="480"
                frameBorder="0"
                title={`${selectedBrand.brand_name} widget preview`}
                style={{ display: "block", border: "none" }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Analytics Stub ────────────────────────────────────────────────────────────

function AnalyticsStub() {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-primary" />
          Widget Analytics
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Track how your embedded widgets perform across the web.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-5 space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Embed Impressions
          </p>
          <p className="text-2xl font-bold text-foreground">—</p>
          <p className="text-[11px] text-muted-foreground">Coming soon</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Click-Throughs
          </p>
          <p className="text-2xl font-bold text-foreground">—</p>
          <p className="text-[11px] text-muted-foreground">Coming soon</p>
        </div>
      </div>
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Analytics tracking will be available once your widget receives traffic.
          Install the embed code above to get started.
        </p>
      </div>
    </div>
  );
}

// ── Legacy Brand Search Widget ────────────────────────────────────────────────

function BrandSearchWidget() {
  const [query, setQuery] = useState("");
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selected, setSelected] = useState<Brand | null>(null);
  const [searching, setSearching] = useState(false);
  const [copied, copyEmbed] = useCopyButton();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const origin = window.location.origin;
  const slug = selected ? toSlug(selected.name) : "";
  const widgetUrl = selected ? `${origin}/widget/store-locator?brand=${slug}` : "";
  const embedCode = selected
    ? `<iframe src="${widgetUrl}"\n  width="400" height="500" frameborder="0"\n  style="border:none;border-radius:8px;"></iframe>`
    : "";

  useEffect(() => {
    if (!query.trim()) { setBrands([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase
        .from("market_brands")
        .select("id, name")
        .ilike("name", `%${query.trim()}%`)
        .order("name")
        .limit(20);
      setBrands((data as Brand[]) ?? []);
      setSearching(false);
    }, 300);
  }, [query]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          Store Locator — Any Brand
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Search any brand in the market database to get a store locator widget.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <label className="block text-sm font-medium text-foreground">Search for a brand</label>
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
          placeholder="e.g. Your brand, Competitor..."
          className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {searching && <p className="text-xs text-muted-foreground">Searching...</p>}
        {!searching && brands.length > 0 && !selected && (
          <ul className="border border-border rounded-lg overflow-hidden divide-y divide-border">
            {brands.map((b) => (
              <li key={b.id}>
                <button
                  onClick={() => { setSelected(b); setQuery(b.name); setBrands([]); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors text-foreground"
                >
                  {b.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <>
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Embed code</label>
              <button
                onClick={() => copyEmbed(embedCode)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <pre
              className="text-xs bg-muted/50 rounded-lg p-3 overflow-x-auto text-muted-foreground whitespace-pre-wrap break-all"
              style={{ fontFamily: "ui-monospace, monospace" }}
            >
              {embedCode}
            </pre>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm font-medium text-foreground mb-3">Preview</p>
            <div className="rounded-lg overflow-hidden border border-border bg-white" style={{ height: 500 }}>
              <iframe
                src={widgetUrl}
                width="100%"
                height="500"
                frameBorder="0"
                title={`${selected.name} store locator preview`}
                style={{ display: "block", border: "none" }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Widget URL:{" "}
              <a href={widgetUrl} target="_blank" rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 break-all">
                {widgetUrl}
              </a>
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = "embed" | "search" | "analytics";

export function WidgetEmbed() {
  const [tab, setTab] = useState<Tab>("embed");

  const tabCls = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
      active
        ? "bg-primary text-primary-foreground"
        : "bg-secondary text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5 animate-fade-up">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Globe className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-foreground">Widget Embed</h1>
            <p className="text-sm text-muted-foreground">
              Embed store locators and track widget performance
            </p>
          </div>
        </div>
        <div className="header-underline mt-1" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button className={tabCls(tab === "embed")} onClick={() => setTab("embed")}>
          Embed Generator
        </button>
        <button className={tabCls(tab === "search")} onClick={() => setTab("search")}>
          Brand Search
        </button>
        <button className={tabCls(tab === "analytics")} onClick={() => setTab("analytics")}>
          Analytics
        </button>
      </div>

      {/* Tab content */}
      {tab === "embed"     && <EmbedGenerator />}
      {tab === "search"    && <BrandSearchWidget />}
      {tab === "analytics" && <AnalyticsStub />}
    </div>
  );
}
