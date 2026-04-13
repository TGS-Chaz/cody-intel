import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Copy, Check, Globe } from "lucide-react";

interface Brand {
  id: string;
  name: string;
}

function toSlug(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export function WidgetEmbed() {
  const [query, setQuery] = useState("");
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selected, setSelected] = useState<Brand | null>(null);
  const [searching, setSearching] = useState(false);
  const [copied, setCopied] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const origin = window.location.origin;
  const slug = selected ? toSlug(selected.name) : "";
  const widgetUrl = selected ? `${origin}/widget/store-locator?brand=${slug}` : "";
  const embedCode = selected
    ? `<iframe src="${widgetUrl}"\n  width="400" height="500" frameborder="0"\n  style="border:none;border-radius:8px;"></iframe>`
    : "";

  useEffect(() => {
    if (!query.trim()) {
      setBrands([]);
      return;
    }
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

  function handleCopy() {
    if (!embedCode) return;
    navigator.clipboard.writeText(embedCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Globe className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground leading-tight">Store Locator Widget</h1>
          <p className="text-sm text-muted-foreground">Embed a brand store finder on any website</p>
        </div>
      </div>

      {/* Brand search */}
      <div className="bg-card border border-border rounded-xl p-5 mb-5">
        <label className="block text-sm font-medium text-foreground mb-2">
          Search for a brand
        </label>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
          placeholder="e.g. Painted Rooster, Ceres..."
          className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {searching && (
          <p className="text-xs text-muted-foreground mt-2">Searching...</p>
        )}
        {!searching && brands.length > 0 && !selected && (
          <ul className="mt-2 border border-border rounded-lg overflow-hidden divide-y divide-border">
            {brands.map((b) => (
              <li key={b.id}>
                <button
                  onClick={() => {
                    setSelected(b);
                    setQuery(b.name);
                    setBrands([]);
                  }}
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
          {/* Embed code */}
          <div className="bg-card border border-border rounded-xl p-5 mb-5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-foreground">Embed code</label>
              <button
                onClick={handleCopy}
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
            <p className="text-xs text-muted-foreground mt-2">
              Paste this code into any HTML page to embed the store locator.
            </p>
          </div>

          {/* Preview */}
          <div className="bg-card border border-border rounded-xl p-5">
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
              <a
                href={widgetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 break-all"
              >
                {widgetUrl}
              </a>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
