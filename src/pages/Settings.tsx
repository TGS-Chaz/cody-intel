import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/profile";
import { useTheme } from "@/lib/theme";
import { Sun, Moon, Sunset, User, Tag, X, Plus, Search } from "lucide-react";

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
