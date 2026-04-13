import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/profile";
import { useTheme } from "@/lib/theme";
import { useOrg } from "@/lib/org";
import { Sun, Moon, Sunset, User, Tag, X, Plus, Search, Bell, Trash2, ChevronDown, ChevronUp, Key, Copy, Check, Eye, EyeOff, RefreshCw } from "lucide-react";
import { ScrapeSchedule } from "@/components/ScrapeSchedule";

// ── Brands Section ────────────────────────────────────────────────────────────

interface UserBrand { id: string; brand_name: string; is_own_brand: boolean; }
interface MarketBrandSuggestion { id: string; name: string; }

function BrandsSection() {
  const { orgId } = useOrg();
  const [brands, setBrands]           = useState<UserBrand[]>([]);
  const [loading, setLoading]         = useState(true);
  const [ownInput, setOwnInput]       = useState("");
  const [compInput, setCompInput]     = useState("");
  const [ownSuggestions, setOwnSuggestions]   = useState<MarketBrandSuggestion[]>([]);
  const [compSuggestions, setCompSuggestions] = useState<MarketBrandSuggestion[]>([]);
  const [ownOpen, setOwnOpen]         = useState(false);
  const [compOpen, setCompOpen]       = useState(false);
  const ownRef  = useRef<HTMLDivElement>(null);
  const compRef = useRef<HTMLDivElement>(null);

  async function loadBrands() {
    if (!orgId) return;
    const { data } = await supabase
      .from("user_brands")
      .select("id, brand_name, is_own_brand")
      .eq("org_id", orgId)
      .order("brand_name");
    setBrands(data ?? []);
    setLoading(false);
  }

  useEffect(() => { loadBrands(); }, [orgId]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ownRef.current && !ownRef.current.contains(e.target as Node)) setOwnOpen(false);
      if (compRef.current && !compRef.current.contains(e.target as Node)) setCompOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function fetchSuggestions(q: string): Promise<MarketBrandSuggestion[]> {
    if (!q.trim()) return [];
    const { data } = await supabase
      .from("market_brands")
      .select("id, name")
      .ilike("name", `%${q}%`)
      .limit(20);
    return data ?? [];
  }

  async function handleOwnInput(q: string) {
    setOwnInput(q);
    if (q.length < 1) { setOwnSuggestions([]); setOwnOpen(false); return; }
    const results = await fetchSuggestions(q);
    setOwnSuggestions(results);
    setOwnOpen(true);
  }

  async function handleCompInput(q: string) {
    setCompInput(q);
    if (q.length < 1) { setCompSuggestions([]); setCompOpen(false); return; }
    const results = await fetchSuggestions(q);
    setCompSuggestions(results);
    setCompOpen(true);
  }

  async function addBrand(brandName: string, isOwn: boolean) {
    if (!orgId || !brandName.trim()) return;
    await supabase.from("user_brands").insert({
      org_id: orgId,
      brand_name: brandName.trim(),
      is_own_brand: isOwn,
    });
    if (isOwn) { setOwnInput(""); setOwnOpen(false); }
    else { setCompInput(""); setCompOpen(false); }
    await loadBrands();
  }

  async function removeBrand(id: string) {
    await supabase.from("user_brands").delete().eq("id", id);
    await loadBrands();
  }

  const ownList  = brands.filter(b => b.is_own_brand);
  const compList = brands.filter(b => !b.is_own_brand);

  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-premium space-y-4">
      <h2 className="text-foreground flex items-center gap-2">
        <Tag className="w-4 h-4 text-primary" /> Brands
      </h2>
      <p className="text-xs text-muted-foreground">
        Brands you add here are used across all analytics, gap analysis, and AI features.
      </p>

      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-8 skeleton-shimmer rounded" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* My Brands — teal accent */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">My Brands</p>
            <div className="flex flex-wrap gap-2 min-h-[2rem]">
              {ownList.length === 0 && <p className="text-xs text-muted-foreground italic">None configured.</p>}
              {ownList.map(b => (
                <span key={b.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-teal-500/10 text-teal-500 text-xs font-medium border border-teal-500/20">
                  {b.brand_name}
                  <button onClick={() => removeBrand(b.id)} className="ml-0.5 hover:text-red-400 transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="relative" ref={ownRef}>
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={ownInput}
                onChange={e => handleOwnInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && ownInput.trim()) addBrand(ownInput, true); }}
                placeholder="Type brand name and press Enter…"
                className="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
              />
              {ownOpen && ownSuggestions.length > 0 && (
                <div className="absolute z-20 top-full mt-1 w-full rounded-md border border-border bg-card shadow-lg overflow-hidden">
                  {ownSuggestions.map(r => (
                    <button
                      key={r.id}
                      onClick={() => addBrand(r.name, true)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent/50 transition-colors text-left"
                    >
                      <Plus className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                      {r.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Competitor Brands — orange accent */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Competitor Brands</p>
            <div className="flex flex-wrap gap-2 min-h-[2rem]">
              {compList.length === 0 && <p className="text-xs text-muted-foreground italic">None configured.</p>}
              {compList.map(b => (
                <span key={b.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-orange-500/10 text-orange-400 text-xs font-medium border border-orange-500/20">
                  {b.brand_name}
                  <button onClick={() => removeBrand(b.id)} className="ml-0.5 hover:text-red-300 transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="relative" ref={compRef}>
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={compInput}
                onChange={e => handleCompInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && compInput.trim()) addBrand(compInput, false); }}
                placeholder="Type brand name and press Enter…"
                className="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
              />
              {compOpen && compSuggestions.length > 0 && (
                <div className="absolute z-20 top-full mt-1 w-full rounded-md border border-border bg-card shadow-lg overflow-hidden">
                  {compSuggestions.map(r => (
                    <button
                      key={r.id}
                      onClick={() => addBrand(r.name, false)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent/50 transition-colors text-left"
                    >
                      <Plus className="w-3.5 h-3.5 text-orange-400 shrink-0" />
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

      {/* API Keys */}
      <ApiKeysSection />

      {/* Scrape Schedule (Feature 8) */}
      {orgId && <ScrapeSchedule orgId={orgId} />}
    </div>
  );
}

// ── API Keys Section ──────────────────────────────────────────────────────────

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
  tier: string;
}

function ApiKeysSection() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [keys, setKeys]           = useState<ApiKey[]>([]);
  const [loading, setLoading]     = useState(true);
  const [newKeyName, setNewKeyName] = useState("");
  const [creating, setCreating]   = useState(false);
  const [newKey, setNewKey]       = useState<string | null>(null);
  const [showKey, setShowKey]     = useState(false);
  const [copied, setCopied]       = useState(false);

  async function loadKeys() {
    if (!orgId) return;
    const { data } = await supabase
      .from("api_keys")
      .select("id, name, key_prefix, created_at, last_used_at, is_active, tier")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    setKeys((data ?? []) as ApiKey[]);
    setLoading(false);
  }

  useEffect(() => { loadKeys(); }, [orgId]);

  async function createKey() {
    if (!user || !orgId || !newKeyName.trim()) return;
    setCreating(true);

    // Generate a random key: ck_live_ + 32 hex chars
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const rawKey = "ck_live_" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    const prefix = rawKey.slice(0, 16) + "...";

    // Hash for storage
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawKey))
      .then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join(""));

    await supabase.from("api_keys").insert({
      org_id: orgId,
      user_id: user.id,
      key_hash: hash,
      key_prefix: prefix,
      name: newKeyName.trim(),
      tier: "enterprise",
    });

    setNewKey(rawKey);
    setShowKey(false);
    setNewKeyName("");
    await loadKeys();
    setCreating(false);
  }

  async function revokeKey(id: string) {
    await supabase.from("api_keys").update({ is_active: false }).eq("id", id);
    setKeys(prev => prev.map(k => k.id === id ? { ...k, is_active: false } : k));
  }

  async function deleteKey(id: string) {
    await supabase.from("api_keys").delete().eq("id", id);
    setKeys(prev => prev.filter(k => k.id !== id));
  }

  function copyKey() {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-premium space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-foreground flex items-center gap-2">
          <Key className="w-4 h-4 text-primary" /> API Keys
        </h2>
        <a href="/api-docs" className="text-xs text-primary hover:underline">View API docs →</a>
      </div>
      <p className="text-xs text-muted-foreground">
        Generate keys to access the Cody Intel REST API from your own systems.
      </p>

      {/* New key revealed */}
      {newKey && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
          <p className="text-xs font-semibold text-emerald-500">
            Key created — copy it now. You won't see it again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono-data text-[11px] text-foreground bg-background rounded border border-border px-3 py-2 break-all">
              {showKey ? newKey : newKey.slice(0, 16) + "•".repeat(32)}
            </code>
            <button onClick={() => setShowKey(v => !v)} className="p-2 rounded text-muted-foreground hover:text-foreground transition-colors">
              {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <button onClick={copyKey} className="p-2 rounded text-muted-foreground hover:text-emerald-500 transition-colors">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <button onClick={() => setNewKey(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Dismiss
          </button>
        </div>
      )}

      {/* Create form */}
      <div className="flex gap-2">
        <input
          value={newKeyName}
          onChange={e => setNewKeyName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") createKey(); }}
          placeholder="Key name (e.g. Production, Analytics)"
          className="flex-1 px-3 py-1.5 rounded-md border border-border bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
        <button
          onClick={createKey}
          disabled={creating || !newKeyName.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {creating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Generate
        </button>
      </div>

      {/* Key list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="h-10 skeleton-shimmer rounded" />)}
        </div>
      ) : keys.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No API keys yet.</p>
      ) : (
        <div className="space-y-2">
          {keys.map(k => (
            <div
              key={k.id}
              className={`group flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 transition-colors ${
                k.is_active ? "border-border bg-card" : "border-border/50 bg-muted/20 opacity-60"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Key className={`w-3.5 h-3.5 shrink-0 ${k.is_active ? "text-primary" : "text-muted-foreground"}`} />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">{k.name}</p>
                  <p className="text-[10px] font-mono-data text-muted-foreground">{k.key_prefix}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right hidden sm:block">
                  <p className="text-[10px] text-muted-foreground">
                    {k.last_used_at ? `Last used ${new Date(k.last_used_at).toLocaleDateString()}` : "Never used"}
                  </p>
                  <span className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${
                    k.is_active
                      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                      : "bg-muted text-muted-foreground border-border"
                  }`}>
                    {k.is_active ? "active" : "revoked"}
                  </span>
                </div>
                {k.is_active && (
                  <button
                    onClick={() => revokeKey(k.id)}
                    className="opacity-0 group-hover:opacity-100 text-[10px] text-amber-500 hover:text-amber-400 transition-all font-medium"
                  >
                    Revoke
                  </button>
                )}
                <button
                  onClick={() => deleteKey(k.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
