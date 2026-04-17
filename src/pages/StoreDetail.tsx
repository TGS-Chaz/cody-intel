import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { fetchCensusByZip } from "@/lib/census";
import { useOrg } from "@/lib/org";
import { StoreScorecard } from "@/components/StoreScorecard";
import { PlanGate } from "@/components/PlanGate";
import StoreBriefPanel from "@/components/StoreBriefPanel";
import type { IntelStore, DispensaryMenu } from "@/lib/types";
import {
  ArrowLeft, Package, Calendar, Wifi, Pencil, Check, X, Loader2, Users, DollarSign, MapPin, GraduationCap, RefreshCw,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MenuItem {
  id: string;
  raw_name: string;
  raw_brand: string | null;
  raw_category: string | null;
  raw_price: number | null;
  raw_thc: string | null;
  is_on_menu: boolean;
}

const PLATFORM_LABELS: Record<string, string> = {
  "dutchie-api": "Dutchie",
  leafly: "Leafly",
  weedmaps: "Weedmaps",
  "posabit-api": "POSaBit",
  jane: "Jane",
};

const STATUS_OPTS = [
  { value: "active",  label: "Active" },
  { value: "closed",  label: "Closed" },
  { value: "unknown", label: "Unknown" },
];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active:  { label: "Active",  cls: "text-success bg-success/10 border-success/20" },
  closed:  { label: "Closed",  cls: "text-destructive bg-destructive/10 border-destructive/20" },
  unknown: { label: "Unknown", cls: "text-warning bg-warning/10 border-warning/20" },
};

// ─── EditableField ────────────────────────────────────────────────────────────

interface EditableFieldProps {
  label: string;
  value: string | null;
  onSave: (val: string | null) => Promise<void>;
  type?: "text" | "url" | "tel" | "select";
  options?: { value: string; label: string }[];
  multiline?: boolean;
  mono?: boolean;
}

function EditableField({ label, value, onSave, type = "text", options, multiline, mono }: EditableFieldProps) {
  const [editing, setEditing]   = useState(false);
  const [draft, setDraft]       = useState("");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement>(null);

  function startEdit() {
    setDraft(value ?? "");
    setError(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave(draft.trim() || null);
      setEditing(false);
    } catch (e: any) {
      setError(e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const inputCls =
    "flex-1 px-2 py-1 rounded border border-primary/50 bg-background text-sm text-foreground " +
    "focus:outline-none focus:ring-1 focus:ring-primary " +
    (mono ? "font-mono-data" : "");

  return (
    <div className="group space-y-1">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      {editing ? (
        <div className="space-y-1">
          <div className="flex items-start gap-1">
            {type === "select" && options ? (
              <select
                ref={inputRef as any}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") cancel(); }}
                className={inputCls}
              >
                <option value="">— clear —</option>
                {options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : multiline ? (
              <textarea
                ref={inputRef as any}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") cancel(); }}
                rows={3}
                className={`${inputCls} resize-y`}
              />
            ) : (
              <input
                ref={inputRef as any}
                type={type}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
                className={inputCls}
              />
            )}
            <button
              onClick={save}
              disabled={saving}
              title="Save"
              className="p-1 rounded text-success hover:bg-success/10 transition-colors disabled:opacity-50 shrink-0 mt-0.5"
            >
              {saving
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Check className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={cancel}
              title="Cancel"
              className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0 mt-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {error && <p className="text-[10px] text-destructive">{error}</p>}
        </div>
      ) : (
        <div className="flex items-start gap-1 min-h-[26px]">
          <p
            className={`flex-1 text-sm leading-relaxed break-words ${
              value ? "text-foreground" : "text-muted-foreground/40 italic"
            } ${mono ? "font-mono-data" : ""}`}
          >
            {value || "—"}
          </p>
          <button
            onClick={startEdit}
            title={`Edit ${label}`}
            className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-all shrink-0"
          >
            <Pencil className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function StoreDetail() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { orgId } = useOrg();

  const [store, setStore]               = useState<IntelStore | null>(null);
  const [menus, setMenus]               = useState<DispensaryMenu[]>([]);
  const [items, setItems]               = useState<MenuItem[]>([]);
  const [selectedMenu, setSelectedMenu] = useState<string | null>(null);
  const [loading, setLoading]           = useState(true);
  const [fetchingDemo, setFetchingDemo] = useState(false);

  // ── Data loading ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    async function load() {
      const [storeRes, menusRes] = await Promise.all([
        supabase.from("intel_stores").select("*").eq("id", id).single(),
        supabase
          .from("dispensary_menus")
          .select("*")
          .eq("intel_store_id", id)
          .order("last_scraped_at", { ascending: false }),
      ]);
      setStore(storeRes.data);
      const menuList = menusRes.data ?? [];
      setMenus(menuList);
      if (menuList.length > 0) setSelectedMenu(menuList[0].id);
      setLoading(false);
    }
    load();
  }, [id]);

  useEffect(() => {
    if (!selectedMenu) return;
    supabase
      .from("menu_items")
      .select("id, raw_name, raw_brand, raw_category, raw_price, raw_thc, is_on_menu")
      .eq("dispensary_menu_id", selectedMenu)
      .eq("is_on_menu", true)
      .order("raw_category")
      .limit(200)
      .then(({ data }) => setItems(data ?? []));
  }, [selectedMenu]);

  // ── Field save handler ──────────────────────────────────────────────────────
  async function updateField(field: keyof IntelStore, val: string | null) {
    const { error } = await supabase
      .from("intel_stores")
      .update({ [field]: val })
      .eq("id", store!.id);
    if (error) throw new Error(error.message);
    setStore((prev) => (prev ? { ...prev, [field]: val } : prev));
  }

  // ── Demographics fetch ───────────────────────────────────────────────────────
  async function fetchDemographics() {
    if (!store?.zip) return;
    setFetchingDemo(true);
    const demo = await fetchCensusByZip(store.zip);
    if (demo) {
      await supabase.from("intel_stores").update({ demographic_data: demo }).eq("id", store.id);
      setStore((prev) => prev ? { ...prev, demographic_data: demo as unknown as Record<string, unknown> } : prev);
    }
    setFetchingDemo(false);
  }

  // ── Loading / not-found states ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <div className="h-6 w-36 skeleton-shimmer rounded" />
        <div className="h-48 skeleton-shimmer rounded-lg" />
        <div className="h-64 skeleton-shimmer rounded-lg" />
      </div>
    );
  }

  if (!store) {
    return <div className="p-6 text-muted-foreground text-sm">Store not found.</div>;
  }

  const selectedMenuObj = menus.find((m) => m.id === selectedMenu);
  const badge = STATUS_BADGE[store.status ?? "unknown"] ?? STATUS_BADGE.unknown;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5 animate-fade-up">
      {/* Back link */}
      <button
        onClick={() => navigate("/stores")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to directory
      </button>

      {/* ── Store header ─────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-5 shadow-premium stat-accent-teal space-y-1">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1 min-w-0">
            {/* Name — editable in place */}
            <div className="group flex items-start gap-1">
              <h1 className="text-foreground leading-tight flex-1 min-w-0">{store.name}</h1>
              <button
                onClick={() => {
                  // trigger EditableField below by scrolling — handled inline
                }}
                className="hidden"
              />
            </div>
          </div>
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border shrink-0 mt-1 ${badge.cls}`}>
            {badge.label}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {store.county ? `${store.county} County · ` : ""}{store.state}
          {store.lcb_license_id ? ` · LCB #${store.lcb_license_id}` : ""}
        </p>
        {menus.length > 0 && (
          <p className="text-[11px]" style={{ color: "hsl(var(--primary))" }}>
            <Wifi className="w-3 h-3 inline mr-1" />
            {menus.length} menu platform{menus.length !== 1 ? "s" : ""} · {store.total_products?.toLocaleString() ?? 0} products tracked
          </p>
        )}
      </div>

      {/* ── Ambient AI brief ─────────────────────────────────────────────── */}
      <StoreBriefPanel storeId={store.id} />

      {/* ── Editable store info ──────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card shadow-premium overflow-hidden">
        <div
          className="px-4 py-2.5 bg-sidebar flex items-center gap-2"
          style={{ borderBottom: "1px solid var(--glass-border)" }}
        >
          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            Store Information · hover a field to edit
          </span>
        </div>

        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
          {/* Column 1 */}
          <EditableField
            label="Name"
            value={store.name}
            onSave={(v) => updateField("name", v ?? store.name)}
          />
          <EditableField
            label="Trade Name"
            value={store.trade_name}
            onSave={(v) => updateField("trade_name", v)}
          />
          <EditableField
            label="Business Name (LCB Legal)"
            value={store.business_name}
            onSave={(v) => updateField("business_name", v)}
          />
          <EditableField
            label="Status"
            value={store.status}
            type="select"
            options={STATUS_OPTS}
            onSave={(v) => updateField("status", v)}
          />
          <EditableField
            label="Address"
            value={store.address}
            onSave={(v) => updateField("address", v)}
          />
          <EditableField
            label="City"
            value={store.city}
            onSave={(v) => updateField("city", v)}
          />
          <EditableField
            label="County"
            value={store.county}
            onSave={(v) => updateField("county", v)}
          />
          <EditableField
            label="Phone"
            value={store.phone}
            type="tel"
            onSave={(v) => updateField("phone", v)}
          />
          <EditableField
            label="Website"
            value={store.website}
            type="url"
            onSave={(v) => updateField("website", v)}
          />
          <div className="sm:col-span-2">
            <EditableField
              label="Notes"
              value={store.notes}
              multiline
              onSave={(v) => updateField("notes", v)}
            />
          </div>
        </div>
      </div>

      {/* ── Platform / scraper data (read-only) ─────────────────────────── */}
      {(store.dutchie_slug || store.leafly_slug || store.weedmaps_slug ||
        store.posabit_feed_key || store.online_ordering_platform) && (
        <div className="rounded-lg border border-border bg-card shadow-premium overflow-hidden">
          <div
            className="px-4 py-2.5 bg-sidebar flex items-center gap-2"
            style={{ borderBottom: "1px solid var(--glass-border)" }}
          >
            <Wifi className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Platform Identifiers
            </span>
          </div>
          <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { label: "Dutchie Slug",       value: store.dutchie_slug },
              { label: "Leafly Slug",         value: store.leafly_slug },
              { label: "Weedmaps Slug",       value: store.weedmaps_slug },
              { label: "POSaBit Feed Key",    value: store.posabit_feed_key },
              { label: "POSaBit Merchant",    value: store.posabit_merchant },
              { label: "Online Platform",     value: store.online_ordering_platform },
            ]
              .filter((r) => r.value)
              .map((r) => (
                <div key={r.label}>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    {r.label}
                  </p>
                  <p className="text-xs font-mono-data text-foreground break-all">{r.value}</p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── Store Scorecard (Feature 5) ─────────────────────────────────── */}
      <PlanGate feature="store_scorecards">
        <StoreScorecard storeId={store.id} orgId={orgId} />
      </PlanGate>

      {/* ── Demographics ────────────────────────────────────────────────── */}
      {store.zip && (
        <div className="rounded-lg border border-border bg-card shadow-premium overflow-hidden">
          <div
            className="px-4 py-2.5 bg-sidebar flex items-center gap-2 justify-between"
            style={{ borderBottom: "1px solid var(--glass-border)" }}
          >
            <div className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                Area Demographics · ZIP {store.zip}
              </span>
            </div>
            <button
              onClick={fetchDemographics}
              disabled={fetchingDemo}
              className="flex items-center gap-1.5 text-[11px] font-medium text-primary hover:text-primary/80 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${fetchingDemo ? "animate-spin" : ""}`} />
              {store.demographic_data ? "Refresh" : "Fetch data"}
            </button>
          </div>

          {store.demographic_data ? (() => {
            const d = store.demographic_data as Record<string, unknown>;
            const fmt = (v: unknown, prefix = "", suffix = "") =>
              v != null ? `${prefix}${typeof v === "number" ? v.toLocaleString() : v}${suffix}` : "—";
            const tiles = [
              { icon: Users,          label: "Population",         value: fmt(d.population) },
              { icon: DollarSign,     label: "Median Income",      value: fmt(d.medianIncome, "$") },
              { icon: MapPin,         label: "Median Age",         value: fmt(d.medianAge, "", " yrs") },
              { icon: GraduationCap,  label: "Bachelor's+",        value: fmt(d.bachelorsDegreePct, "", "%") },
            ];
            return (
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {tiles.map(({ icon: Icon, label, value }) => (
                    <div key={label} className="rounded-lg border border-border bg-background/50 px-4 py-3 text-center">
                      <Icon className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                      <p className="text-lg font-semibold text-foreground tabular-nums">{value}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
                {d.urbanClass != null && (
                  <p className="text-[11px] text-muted-foreground">
                    Area classification: <span className="text-foreground font-medium capitalize">{String(d.urbanClass)}</span>
                    {d.fetchedAt != null && ` · fetched ${new Date(String(d.fetchedAt)).toLocaleDateString()}`}
                  </p>
                )}
              </div>
            );
          })() : (
            <div className="px-5 py-8 text-center">
              <Users className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">
                {fetchingDemo ? "Fetching Census data…" : 'Click "Fetch data" to load US Census demographics for this ZIP code.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Menu source tabs ─────────────────────────────────────────────── */}
      {menus.length > 0 && (
        <div>
          <h2 className="text-foreground mb-3">Menu Sources</h2>
          <div className="flex gap-2 flex-wrap">
            {menus.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedMenu(m.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all duration-150 ${
                  selectedMenu === m.id
                    ? "border-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
                style={selectedMenu === m.id ? { background: "hsl(var(--primary))" } : undefined}
              >
                {PLATFORM_LABELS[m.source] ?? m.source}
                {m.menu_item_count != null && (
                  <span className="ml-1.5 opacity-70">{m.menu_item_count.toLocaleString()}</span>
                )}
              </button>
            ))}
          </div>
          {selectedMenuObj?.last_scraped_at && (
            <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Last scraped: {new Date(selectedMenuObj.last_scraped_at).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* ── Products table ───────────────────────────────────────────────── */}
      {items.length > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-hidden shadow-premium">
          <div
            className="px-4 py-2.5 flex items-center gap-2 bg-sidebar"
            style={{ borderBottom: "1px solid var(--glass-border)" }}
          >
            <Package className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              {items.length} Products (showing first 200)
            </span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--glass-border-subtle)" }}>
                <th className="text-left px-4 py-2 text-muted-foreground font-medium">Name</th>
                <th className="text-left px-4 py-2 text-muted-foreground font-medium hidden sm:table-cell">Brand</th>
                <th className="text-left px-4 py-2 text-muted-foreground font-medium">Category</th>
                <th className="text-left px-4 py-2 text-muted-foreground font-medium">Price</th>
                <th className="text-left px-4 py-2 text-muted-foreground font-medium hidden sm:table-cell">THC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-1.5 text-foreground max-w-[180px] truncate">{item.raw_name}</td>
                  <td className="px-4 py-1.5 text-muted-foreground hidden sm:table-cell">
                    {item.raw_brand ?? "—"}
                  </td>
                  <td className="px-4 py-1.5 text-muted-foreground">{item.raw_category ?? "—"}</td>
                  <td className="px-4 py-1.5 text-muted-foreground font-mono-data">
                    {item.raw_price != null ? `$${item.raw_price.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-4 py-1.5 text-muted-foreground font-mono-data hidden sm:table-cell">
                    {item.raw_thc ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {menus.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Wifi className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No menu data scraped yet for this store.</p>
        </div>
      )}
    </div>
  );
}
