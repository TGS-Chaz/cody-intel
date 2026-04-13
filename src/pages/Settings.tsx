import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/profile";
import { useTheme } from "@/lib/theme";
import { Sun, Moon, Sunset, User, Tag, X, Plus, Search, Bell, Trash2, ChevronDown, ChevronUp } from "lucide-react";

// ── Brands Section ────────────────────────────────────────────────────────────

interface BrandEntry { id: string; name: string; is_own_brand: boolean; is_competitor_brand: boolean; }
interface SearchResult { id: string; name: string; }

function BrandsSection() {
  const [brands, setBrands]           = useState<BrandEntry[]>([]);
  const [loading, setLoading]         = useState(true);
  const [ownQuery, setOwnQuery]       = useState("");
  const [compQuery, setCompQuery]     = useState("");
  const [ownResults, setOwnResults]   = useState<SearchResult[]>([]);
  const [compResults, setCompResults] = useState<SearchResult[]>([]);
  const [ownOpen, setOwnOpen]         = useState(false);
  const [compOpen, setCompOpen]       = useState(false);
  const ownRef  = useRef<HTMLDivElement>(null);
  const compRef = useRef<HTMLDivElement>(null);

  async function loadBrands() {
    const { data } = await supabase
      .from("market_brands")
      .select("id, name, is_own_brand, is_competitor_brand")
      .order("name")
      .limit(200);
    setBrands(data ?? []);
    setLoading(false);
  }

  useEffect(() => { loadBrands(); }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ownRef.current && !ownRef.current.contains(e.target as Node)) setOwnOpen(false);
      if (compRef.current && !compRef.current.contains(e.target as Node)) setCompOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function searchBrands(q: string): Promise<SearchResult[]> {
    if (!q.trim()) return [];
    const { data } = await supabase
      .from("market_brands")
      .select("id, name")
      .ilike("name", `%${q}%`)
      .limit(20);
    return data ?? [];
  }

  async function handleOwnQuery(q: string) {
    setOwnQuery(q);
    if (q.length < 1) { setOwnResults([]); setOwnOpen(false); return; }
    const results = await searchBrands(q);
    setOwnResults(results.filter(r => !brands.find(b => b.id === r.id && b.is_own_brand)));
    setOwnOpen(true);
  }

  async function handleCompQuery(q: string) {
    setCompQuery(q);
    if (q.length < 1) { setCompResults([]); setCompOpen(false); return; }
    const results = await searchBrands(q);
    setCompResults(results.filter(r => !brands.find(b => b.id === r.id && b.is_competitor_brand)));
    setCompOpen(true);
  }

  async function addOwn(id: string) {
    await supabase.from("market_brands").update({ is_own_brand: true }).eq("id", id);
    setOwnQuery(""); setOwnOpen(false);
    await loadBrands();
  }

  async function addComp(id: string) {
    await supabase.from("market_brands").update({ is_competitor_brand: true }).eq("id", id);
    setCompQuery(""); setCompOpen(false);
    await loadBrands();
  }

  async function removeOwn(id: string) {
    await supabase.from("market_brands").update({ is_own_brand: false }).eq("id", id);
    await loadBrands();
  }

  async function removeComp(id: string) {
    await supabase.from("market_brands").update({ is_competitor_brand: false }).eq("id", id);
    await loadBrands();
  }

  const ownList  = brands.filter(b => b.is_own_brand);
  const compList = brands.filter(b => b.is_competitor_brand);

  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-premium space-y-4">
      <h2 className="text-foreground flex items-center gap-2">
        <Tag className="w-4 h-4 text-primary" /> Brands
      </h2>
      <p className="text-xs text-muted-foreground">
        Configure your own brands and competitor brands for Gap Analysis.
      </p>

      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-8 skeleton-shimmer rounded" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* My Brands */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">My Brands</p>
            <div className="flex flex-wrap gap-2 min-h-[2rem]">
              {ownList.length === 0 && <p className="text-xs text-muted-foreground italic">None configured.</p>}
              {ownList.map(b => (
                <span key={b.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium border border-primary/20">
                  {b.name}
                  <button onClick={() => removeOwn(b.id)} className="ml-0.5 hover:text-red-400 transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="relative" ref={ownRef}>
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={ownQuery}
                onChange={e => handleOwnQuery(e.target.value)}
                placeholder="Search to add brand…"
                className="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              {ownOpen && ownResults.length > 0 && (
                <div className="absolute z-20 top-full mt-1 w-full rounded-md border border-border bg-card shadow-lg overflow-hidden">
                  {ownResults.map(r => (
                    <button
                      key={r.id}
                      onClick={() => addOwn(r.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent/50 transition-colors text-left"
                    >
                      <Plus className="w-3.5 h-3.5 text-primary shrink-0" />
                      {r.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Competitor Brands */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Competitor Brands</p>
            <div className="flex flex-wrap gap-2 min-h-[2rem]">
              {compList.length === 0 && <p className="text-xs text-muted-foreground italic">None configured.</p>}
              {compList.map(b => (
                <span key={b.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/10 text-red-400 text-xs font-medium border border-red-500/20">
                  {b.name}
                  <button onClick={() => removeComp(b.id)} className="ml-0.5 hover:text-red-300 transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="relative" ref={compRef}>
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={compQuery}
                onChange={e => handleCompQuery(e.target.value)}
                placeholder="Search to add brand…"
                className="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              {compOpen && compResults.length > 0 && (
                <div className="absolute z-20 top-full mt-1 w-full rounded-md border border-border bg-card shadow-lg overflow-hidden">
                  {compResults.map(r => (
                    <button
                      key={r.id}
                      onClick={() => addComp(r.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent/50 transition-colors text-left"
                    >
                      <Plus className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      {r.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Alert Rules Section ───────────────────────────────────────────────────────

type RuleType = "brand_stockout" | "price_drop" | "new_carrier" | "brand_removed";
type Severity = "info" | "warning" | "urgent";

interface AlertRule {
  id: string;
  user_id: string;
  rule_type: RuleType;
  brand_name: string;
  city: string | null;
  threshold_price: number | null;
  severity: Severity;
  is_active: boolean;
  created_at: string;
}

const RULE_TYPE_META: Record<RuleType, { label: string; desc: (r: Partial<AlertRule>) => string }> = {
  brand_stockout: {
    label: "Brand Stock-out",
    desc: (r) => `Alert when ${r.brand_name ?? "brand"} disappears from any store`,
  },
  price_drop: {
    label: "Price Drop",
    desc: (r) => `Alert when ${r.brand_name ?? "brand"} drops below $${r.threshold_price ?? "?"}`,
  },
  new_carrier: {
    label: "New Carrier",
    desc: (r) => `Alert when a store starts carrying ${r.brand_name ?? "brand"}`,
  },
  brand_removed: {
    label: "Brand Removed from City",
    desc: (r) => `Alert when ${r.brand_name ?? "brand"} is gone from ${r.city ?? "city"}`,
  },
};

const SEVERITY_STYLES: Record<Severity, string> = {
  urgent: "bg-red-500/10 text-red-400 border-red-500/20",
  warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  info: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

function AlertRulesSection() {
  const { user } = useAuth();
  const [rules, setRules]           = useState<AlertRule[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);

  // Form state
  const [ruleType, setRuleType]         = useState<RuleType>("brand_stockout");
  const [brandName, setBrandName]       = useState("");
  const [city, setCity]                 = useState("");
  const [threshold, setThreshold]       = useState("");
  const [severity, setSeverity]         = useState<Severity>("warning");
  const [saving, setSaving]             = useState(false);

  // Brand autocomplete
  const [brandSuggestions, setBrandSuggestions] = useState<string[]>([]);
  const [brandOpen, setBrandOpen]               = useState(false);
  const brandRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (brandRef.current && !brandRef.current.contains(e.target as Node)) setBrandOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function loadRules() {
    if (!user) return;
    const { data } = await supabase
      .from("user_alert_rules")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setRules((data as AlertRule[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { loadRules(); }, [user]);

  async function searchBrands(q: string) {
    if (!q.trim()) { setBrandSuggestions([]); setBrandOpen(false); return; }
    const { data } = await supabase
      .from("market_brands")
      .select("name")
      .ilike("name", `%${q}%`)
      .order("name")
      .limit(20);
    const names = (data ?? []).map((r: { name: string }) => r.name);
    setBrandSuggestions(names);
    setBrandOpen(names.length > 0);
  }

  async function toggleActive(rule: AlertRule) {
    await supabase
      .from("user_alert_rules")
      .update({ is_active: !rule.is_active })
      .eq("id", rule.id);
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: !r.is_active } : r));
  }

  async function deleteRule(id: string) {
    await supabase.from("user_alert_rules").delete().eq("id", id);
    setRules(prev => prev.filter(r => r.id !== id));
  }

  async function addRule() {
    if (!user || !brandName.trim()) return;
    setSaving(true);
    await supabase.from("user_alert_rules").insert({
      user_id: user.id,
      rule_type: ruleType,
      brand_name: brandName.trim(),
      city: city.trim() || null,
      threshold_price: ruleType === "price_drop" && threshold ? parseFloat(threshold) : null,
      severity,
      is_active: true,
    });
    setBrandName(""); setCity(""); setThreshold(""); setSeverity("warning");
    setRuleType("brand_stockout"); setShowForm(false); setSaving(false);
    await loadRules();
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-premium space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-foreground flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" /> Alert Rules
        </h2>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
        >
          {showForm ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {showForm ? "Cancel" : "Add Rule +"}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Get notified when market conditions match your criteria.
      </p>

      {/* Add Rule Form */}
      {showForm && (
        <div className="rounded-md border border-border bg-background/50 p-4 space-y-3">
          {/* Rule Type */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Rule Type</label>
            <select
              value={ruleType}
              onChange={e => setRuleType(e.target.value as RuleType)}
              className="w-full px-3 py-1.5 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            >
              {(Object.keys(RULE_TYPE_META) as RuleType[]).map(k => (
                <option key={k} value={k}>{RULE_TYPE_META[k].label}</option>
              ))}
            </select>
          </div>

          {/* Brand Name */}
          <div className="space-y-1" ref={brandRef}>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Brand</label>
            <div className="relative">
              <input
                value={brandName}
                onChange={e => { setBrandName(e.target.value); searchBrands(e.target.value); }}
                placeholder="Type to search brands…"
                className="w-full px-3 py-1.5 rounded-md border border-border bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              {brandOpen && brandSuggestions.length > 0 && (
                <div className="absolute z-20 top-full mt-1 w-full rounded-md border border-border bg-card shadow-lg overflow-hidden">
                  {brandSuggestions.map(name => (
                    <button
                      key={name}
                      onClick={() => { setBrandName(name); setBrandOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent/50 transition-colors text-left"
                    >
                      <Plus className="w-3.5 h-3.5 text-primary shrink-0" />
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* City — only for brand_removed */}
          {ruleType === "brand_removed" && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">City</label>
              <input
                value={city}
                onChange={e => setCity(e.target.value)}
                placeholder="e.g. Denver"
                className="w-full px-3 py-1.5 rounded-md border border-border bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
          )}

          {/* Price Threshold — only for price_drop */}
          {ruleType === "price_drop" && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Price Threshold ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={threshold}
                onChange={e => setThreshold(e.target.value)}
                placeholder="e.g. 25.00"
                className="w-full px-3 py-1.5 rounded-md border border-border bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
          )}

          {/* Severity */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Severity</label>
            <div className="flex gap-2">
              {(["info", "warning", "urgent"] as Severity[]).map(s => (
                <button
                  key={s}
                  onClick={() => setSeverity(s)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border capitalize transition-all ${
                    severity === s
                      ? SEVERITY_STYLES[s]
                      : "border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={addRule}
            disabled={saving || !brandName.trim()}
            className="w-full py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Adding…" : "Add Rule"}
          </button>
        </div>
      )}

      {/* Existing Rules */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="h-12 skeleton-shimmer rounded" />)}
        </div>
      ) : rules.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No alert rules configured yet.</p>
      ) : (
        <div className="space-y-2">
          {rules.map(rule => {
            const meta = RULE_TYPE_META[rule.rule_type];
            return (
              <div
                key={rule.id}
                className={`group flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 transition-colors ${
                  rule.is_active ? "border-border bg-card" : "border-border/50 bg-muted/30 opacity-60"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border ${SEVERITY_STYLES[rule.severity]}`}>
                    {rule.severity}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{meta.label} — {rule.brand_name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{meta.desc(rule)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* Active toggle */}
                  <button
                    onClick={() => toggleActive(rule)}
                    title={rule.is_active ? "Disable" : "Enable"}
                    className={`relative w-8 h-4 rounded-full transition-colors ${
                      rule.is_active ? "bg-primary" : "bg-muted-foreground/30"
                    }`}
                  >
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
                      rule.is_active ? "translate-x-4" : "translate-x-0.5"
                    }`} />
                  </button>
                  {/* Delete */}
                  <button
                    onClick={() => deleteRule(rule.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all"
                    title="Delete rule"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Settings() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { preference, setTheme } = useTheme();

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6 animate-fade-up">
      <div>
        <h1 className="text-foreground">Settings</h1>
        <div className="header-underline mt-1" />
        <p className="text-sm text-muted-foreground mt-1">Account and appearance preferences</p>
      </div>

      {/* Profile */}
      <div className="rounded-lg border border-border bg-card p-5 shadow-premium space-y-4">
        <h2 className="text-foreground flex items-center gap-2">
          <User className="w-4 h-4 text-primary" /> Profile
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between py-2 border-b border-border/50">
            <span className="text-muted-foreground">Email</span>
            <span className="text-foreground font-mono-data text-xs">{user?.email}</span>
          </div>
          {profile?.full_name && (
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <span className="text-muted-foreground">Name</span>
              <span className="text-foreground">{profile.full_name}</span>
            </div>
          )}
          {profile?.role && (
            <div className="flex items-center justify-between py-2">
              <span className="text-muted-foreground">Role</span>
              <span className="text-foreground">{profile.role}</span>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Manage your profile in Cody CRM — settings are shared between both apps.
        </p>
      </div>

      {/* Theme */}
      <div className="rounded-lg border border-border bg-card p-5 shadow-premium space-y-4">
        <h2 className="text-foreground">Appearance</h2>
        <p className="text-xs text-muted-foreground">
          Theme preference syncs with Cody CRM across both apps.
        </p>
        <div className="flex gap-2">
          {(["light", "dark", "auto"] as const).map((t) => {
            const Icon = t === "light" ? Sun : t === "dark" ? Moon : Sunset;
            const labels = { light: "Light", dark: "Dark", auto: "Auto (time-based)" };
            return (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border transition-all duration-150 ${
                  preference === t
                    ? "border-primary text-primary bg-primary/5"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {labels[t]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Brands */}
      <BrandsSection />

      {/* Alert Rules */}
      <AlertRulesSection />

      {/* Data */}
      <div className="rounded-lg border border-border bg-card p-5 shadow-premium space-y-3">
        <h2 className="text-foreground">Data & Integrations</h2>
        <p className="text-sm text-muted-foreground">
          Scraper configuration, proxy settings, and API key management coming soon.
        </p>
      </div>
    </div>
  );
}
