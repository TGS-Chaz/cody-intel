import { useState } from "react";
import { Code2, Copy, Check, ChevronDown, ChevronUp, Key, Globe, Zap } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Endpoint {
  method: "GET" | "POST";
  path: string;
  description: string;
  params?: { name: string; type: string; required: boolean; description: string }[];
  response: string;
  example: string;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const ENDPOINTS: Endpoint[] = [
  {
    method: "GET",
    path: "/api/v1/stores",
    description: "List all stores in your organization with optional filtering.",
    params: [
      { name: "city", type: "string", required: false, description: "Filter by city name (case-insensitive)" },
      { name: "status", type: "string", required: false, description: "active | closed | unknown" },
      { name: "limit", type: "number", required: false, description: "Max results (default 100, max 500)" },
      { name: "offset", type: "number", required: false, description: "Pagination offset" },
    ],
    response: `{
  "data": [
    {
      "id": "uuid",
      "name": "Green Leaf Dispensary",
      "city": "Seattle",
      "state": "WA",
      "status": "active",
      "total_products": 342,
      "platforms": ["dutchie", "leafly"]
    }
  ],
  "count": 87,
  "offset": 0
}`,
    example: `curl -H "x-api-key: ck_live_..." \\
  "https://api.codyintel.com/api/v1/stores?city=Seattle&status=active"`,
  },
  {
    method: "GET",
    path: "/api/v1/brands",
    description: "Return brand presence data — which stores carry each brand and at what price.",
    params: [
      { name: "brand", type: "string", required: false, description: "Filter by brand name (partial match)" },
      { name: "city", type: "string", required: false, description: "Limit to a specific city" },
      { name: "limit", type: "number", required: false, description: "Max results (default 50)" },
    ],
    response: `{
  "data": [
    {
      "brand_name": "Panacea",
      "store_count": 23,
      "cities": ["Seattle", "Tacoma", "Bellevue"],
      "avg_price": 38.50,
      "min_price": 29.99,
      "max_price": 49.99
    }
  ],
  "count": 1
}`,
    example: `curl -H "x-api-key: ck_live_..." \\
  "https://api.codyintel.com/api/v1/brands?brand=Panacea"`,
  },
  {
    method: "GET",
    path: "/api/v1/products",
    description: "Search products across all tracked menus.",
    params: [
      { name: "brand", type: "string", required: false, description: "Filter by brand name" },
      { name: "category", type: "string", required: false, description: "Flower | Concentrate | Edible | Pre-Roll | Tincture | Topical | Capsule | Vaporizer" },
      { name: "store_id", type: "string", required: false, description: "Limit to specific store UUID" },
      { name: "limit", type: "number", required: false, description: "Max results (default 100)" },
    ],
    response: `{
  "data": [
    {
      "id": "uuid",
      "name": "Blue Dream 3.5g",
      "brand": "Panacea",
      "category": "Flower",
      "price": 38.50,
      "thc": "22%",
      "store_name": "Green Leaf Dispensary",
      "store_id": "uuid",
      "last_seen": "2025-12-01T08:00:00Z"
    }
  ],
  "count": 1
}`,
    example: `curl -H "x-api-key: ck_live_..." \\
  "https://api.codyintel.com/api/v1/products?brand=Panacea&category=Flower"`,
  },
  {
    method: "GET",
    path: "/api/v1/alerts",
    description: "Retrieve recent market alerts (stock-outs, brand changes, price shifts).",
    params: [
      { name: "severity", type: "string", required: false, description: "urgent | warning | info" },
      { name: "type", type: "string", required: false, description: "brand_removed | brand_added | stock_out | price_change | new_product" },
      { name: "since", type: "string", required: false, description: "ISO 8601 datetime — only return alerts after this timestamp" },
      { name: "limit", type: "number", required: false, description: "Max results (default 50)" },
    ],
    response: `{
  "data": [
    {
      "id": "uuid",
      "alert_type": "brand_removed",
      "severity": "urgent",
      "title": "Panacea removed from 3 stores",
      "body": "Panacea was removed from Green Leaf, Emerald City, and Happy Trails.",
      "brand_name": "Panacea",
      "created_at": "2025-12-01T09:30:00Z"
    }
  ],
  "count": 1
}`,
    example: `curl -H "x-api-key: ck_live_..." \\
  "https://api.codyintel.com/api/v1/alerts?severity=urgent&type=brand_removed"`,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function MethodBadge({ method }: { method: "GET" | "POST" }) {
  return (
    <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded font-mono-data ${
      method === "GET"
        ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
        : "bg-blue-500/10 text-blue-500 border border-blue-500/20"
    }`}>
      {method}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={copy}
      className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function EndpointCard({ ep }: { ep: Endpoint }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-accent/30 transition-colors text-left"
      >
        <MethodBadge method={ep.method} />
        <code className="text-sm font-mono-data text-foreground flex-1">{ep.path}</code>
        <span className="text-xs text-muted-foreground hidden sm:block">{ep.description}</span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-border">
          <div className="p-5 space-y-5">
            <p className="text-sm text-muted-foreground">{ep.description}</p>

            {/* Parameters */}
            {ep.params && ep.params.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Query Parameters</p>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-3 py-2 text-muted-foreground font-medium">Name</th>
                        <th className="text-left px-3 py-2 text-muted-foreground font-medium">Type</th>
                        <th className="text-left px-3 py-2 text-muted-foreground font-medium">Required</th>
                        <th className="text-left px-3 py-2 text-muted-foreground font-medium">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {ep.params.map(p => (
                        <tr key={p.name}>
                          <td className="px-3 py-2 font-mono-data text-primary">{p.name}</td>
                          <td className="px-3 py-2 font-mono-data text-muted-foreground">{p.type}</td>
                          <td className="px-3 py-2">
                            {p.required
                              ? <span className="text-red-400">required</span>
                              : <span className="text-muted-foreground">optional</span>}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{p.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Example request */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Example Request</p>
                <CopyButton text={ep.example} />
              </div>
              <pre className="bg-muted/50 rounded-lg border border-border px-4 py-3 text-[11px] font-mono-data text-foreground overflow-x-auto whitespace-pre-wrap">
                {ep.example}
              </pre>
            </div>

            {/* Response */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Response Schema</p>
                <CopyButton text={ep.response} />
              </div>
              <pre className="bg-muted/50 rounded-lg border border-border px-4 py-3 text-[11px] font-mono-data text-foreground overflow-x-auto whitespace-pre-wrap">
                {ep.response}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ApiDocs() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
          <Code2 className="w-6 h-6 text-primary" />
          REST API
        </h1>
        <div className="header-underline mt-3" />
        <p className="text-sm text-muted-foreground mt-2">
          Programmatic access to your market intelligence data
        </p>
      </div>

      {/* Callout */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-4 flex items-start gap-3">
        <Zap className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-amber-500">Enterprise Feature</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            The REST API is available on the Enterprise tier. Manage your API keys in{" "}
            <a href="/settings" className="text-primary hover:underline">Settings → API Keys</a>.
          </p>
        </div>
      </div>

      {/* Authentication */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-foreground font-semibold flex items-center gap-2">
          <Key className="w-4 h-4 text-primary" /> Authentication
        </h2>
        <p className="text-sm text-muted-foreground">
          Pass your API key in the <code className="font-mono-data text-primary text-xs px-1.5 py-0.5 bg-primary/10 rounded">x-api-key</code> header with every request.
        </p>
        <div className="relative">
          <pre className="bg-muted/50 rounded-lg border border-border px-4 py-3 text-[11px] font-mono-data text-foreground overflow-x-auto">
{`curl -H "x-api-key: ck_live_your_key_here" \\
  "https://api.codyintel.com/api/v1/stores"`}
          </pre>
          <div className="absolute top-2 right-2">
            <CopyButton text={`curl -H "x-api-key: ck_live_your_key_here" \\\n  "https://api.codyintel.com/api/v1/stores"`} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          {[
            { icon: Globe, label: "Base URL", value: "https://api.codyintel.com" },
            { icon: Code2, label: "Version", value: "v1" },
            { icon: Key, label: "Key prefix", value: "ck_live_..." },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-2">
              <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
                <p className="text-xs font-mono-data text-foreground">{value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rate Limits */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-foreground font-semibold">Rate Limits & Errors</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Rate Limits</p>
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <p><span className="text-foreground font-medium">1,000</span> requests / minute</p>
              <p><span className="text-foreground font-medium">100,000</span> requests / day</p>
              <p>Headers: <code className="font-mono-data text-primary text-[10px]">X-RateLimit-Remaining</code></p>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Error Codes</p>
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <p><span className="font-mono-data text-red-400">401</span> — Missing or invalid API key</p>
              <p><span className="font-mono-data text-amber-400">429</span> — Rate limit exceeded</p>
              <p><span className="font-mono-data text-muted-foreground">500</span> — Internal server error</p>
            </div>
          </div>
        </div>
      </div>

      {/* Endpoints */}
      <div>
        <h2 className="text-foreground font-semibold mb-3">Endpoints</h2>
        <div className="space-y-2">
          {ENDPOINTS.map(ep => (
            <EndpointCard key={ep.path} ep={ep} />
          ))}
        </div>
      </div>

      {/* SDKs coming soon */}
      <div className="rounded-xl border border-border bg-card/40 p-5">
        <p className="text-sm font-semibold text-foreground mb-1">SDKs & Webhooks — Coming Soon</p>
        <p className="text-xs text-muted-foreground">
          Official TypeScript and Python SDKs, plus webhook support for real-time alert delivery, are on the roadmap.
        </p>
      </div>
    </div>
  );
}
