import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import { callEdgeFunction } from "@/lib/edge-function";
import {
  Package, Plus, Search, Upload, Check, X, Tag, Edit2, Trash2, RefreshCw, ChevronDown,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserBrand {
  id: string;
  brand_name: string;
  is_own_brand: boolean;
  created_at: string;
}

interface UserProduct {
  id: string;
  brand_id: string | null;
  product_name: string;
  category: string | null;
  weight: string | null;
  unit_price: number | null;
  thc_range: string | null;
  description: string | null;
  aliases: string[] | null;
  active: boolean;
  created_at: string;
  user_brand?: { brand_name: string } | null;
}

interface ProductMatch {
  id: string;
  confidence: number;
  match_method: string;
  verified: boolean;
  user_product: { product_name: string; user_brand: { brand_name: string } | null } | null;
  menu_item: { raw_name: string; raw_brand: string | null } | null;
  intel_store: { name: string; city: string | null } | null;
}

type TabId = "brands" | "products" | "matches";

const thCls = "text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest";

const CATEGORY_SUGGESTIONS = ["Flower", "Pre-roll", "Vape", "Concentrate", "Edible", "Tincture", "Topical"];

const METHOD_COLORS: Record<string, string> = {
  exact: "bg-emerald-500/15 text-emerald-400",
  alias: "bg-blue-500/15 text-blue-400",
  brand_category_weight: "bg-purple-500/15 text-purple-400",
  word_overlap: "bg-amber-500/15 text-amber-400",
};

// ── Shared ────────────────────────────────────────────────────────────────────

function inputCls(extra = "") {
  return `w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary ${extra}`;
}

function primaryBtn(extra = "") {
  return `px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors ${extra}`;
}

function secondaryBtn(extra = "") {
  return `px-3 py-1.5 rounded-md bg-secondary text-sm text-muted-foreground hover:text-foreground transition-colors ${extra}`;
}

// ── TAB 1: Brands ─────────────────────────────────────────────────────────────

function BrandsTab({ orgId }: { orgId: string }) {
  const [brands, setBrands]       = useState<UserBrand[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [newName, setNewName]     = useState("");
  const [newIsOwn, setNewIsOwn]   = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("user_brands")
      .select("id, brand_name, is_own_brand, created_at")
      .eq("org_id", orgId)
      .order("brand_name");
    setBrands(data ?? []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  async function addBrand() {
    if (!newName.trim()) return;
    setSaving(true);
    await supabase.from("user_brands").insert({ org_id: orgId, brand_name: newName.trim(), is_own_brand: newIsOwn });
    setNewName("");
    setSaving(false);
    await load();
  }

  async function toggleOwn(brand: UserBrand) {
    await supabase.from("user_brands").update({ is_own_brand: !brand.is_own_brand }).eq("id", brand.id);
    await load();
  }

  async function deleteBrand(id: string) {
    await supabase.from("user_brands").delete().eq("id", id);
    setDeleteConfirm(null);
    await load();
  }

  return (
    <div className="space-y-4">
      {/* Add brand form */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Add Brand</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addBrand()}
              placeholder="Brand name…"
              className={inputCls()}
            />
          </div>
          {/* Own / Competitor toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden text-sm">
            <button
              onClick={() => setNewIsOwn(true)}
              className={`px-3 py-2 transition-colors ${newIsOwn ? "bg-teal-600 text-white" : "bg-background text-muted-foreground hover:text-foreground"}`}
            >
              My Brand
            </button>
            <button
              onClick={() => setNewIsOwn(false)}
              className={`px-3 py-2 transition-colors ${!newIsOwn ? "bg-orange-500 text-white" : "bg-background text-muted-foreground hover:text-foreground"}`}
            >
              Competitor
            </button>
          </div>
          <button onClick={addBrand} disabled={saving || !newName.trim()} className={primaryBtn("disabled:opacity-50")}>
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />}
            Add Brand
          </button>
        </div>
      </div>

      {/* Brand list */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : brands.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No brands yet. Add one above.</div>
        ) : (
          <div className="divide-y divide-border/40">
            {brands.map(brand => (
              <div key={brand.id} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/20 transition-colors">
                <span className="flex-1 text-sm font-medium text-foreground">{brand.brand_name}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${brand.is_own_brand ? "bg-teal-500/15 text-teal-400" : "bg-orange-500/15 text-orange-400"}`}>
                  {brand.is_own_brand ? "My Brand" : "Competitor"}
                </span>
                <button
                  onClick={() => toggleOwn(brand)}
                  className={secondaryBtn("text-xs")}
                  title="Toggle type"
                >
                  Switch to {brand.is_own_brand ? "Competitor" : "My Brand"}
                </button>
                {deleteConfirm === brand.id ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Delete?</span>
                    <button onClick={() => deleteBrand(brand.id)} className="px-2 py-1 rounded text-xs bg-red-600 text-white hover:bg-red-700 transition-colors">Yes</button>
                    <button onClick={() => setDeleteConfirm(null)} className={secondaryBtn("text-xs")}>No</button>
                  </div>
                ) : (
                  <button onClick={() => setDeleteConfirm(brand.id)} className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Product Form (shared for add + edit) ──────────────────────────────────────

interface ProductFormData {
  brand_id: string;
  product_name: string;
  category: string;
  weight: string;
  unit_price: string;
  thc_range: string;
  description: string;
  aliases: string[];
  active: boolean;
}

const emptyForm = (): ProductFormData => ({
  brand_id: "", product_name: "", category: "", weight: "",
  unit_price: "", thc_range: "", description: "", aliases: [], active: true,
});

interface ProductFormProps {
  ownBrands: UserBrand[];
  initial?: ProductFormData;
  onSave: (data: ProductFormData) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

function ProductForm({ ownBrands, initial, onSave, onCancel, saving }: ProductFormProps) {
  const [form, setForm] = useState<ProductFormData>(initial ?? emptyForm());
  const [aliasInput, setAliasInput] = useState("");
  const [catOpen, setCatOpen] = useState(false);

  function set<K extends keyof ProductFormData>(k: K, v: ProductFormData[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function addAlias() {
    const trimmed = aliasInput.trim();
    if (trimmed && !form.aliases.includes(trimmed)) {
      set("aliases", [...form.aliases, trimmed]);
    }
    setAliasInput("");
  }

  function removeAlias(a: string) {
    set("aliases", form.aliases.filter(x => x !== a));
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Brand */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Brand *</label>
          <select value={form.brand_id} onChange={e => set("brand_id", e.target.value)} className={inputCls()}>
            <option value="">— select brand —</option>
            {ownBrands.map(b => <option key={b.id} value={b.id}>{b.brand_name}</option>)}
          </select>
        </div>
        {/* Product name */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Product Name *</label>
          <input value={form.product_name} onChange={e => set("product_name", e.target.value)} placeholder="e.g. Blue Dream 3.5g" className={inputCls()} />
        </div>
        {/* Category */}
        <div className="space-y-1 relative">
          <label className="text-xs font-medium text-muted-foreground">Category</label>
          <div className="relative">
            <input
              value={form.category}
              onChange={e => { set("category", e.target.value); setCatOpen(true); }}
              onFocus={() => setCatOpen(true)}
              onBlur={() => setTimeout(() => setCatOpen(false), 150)}
              placeholder="Flower, Vape…"
              className={inputCls("pr-8")}
            />
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          </div>
          {catOpen && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-card shadow-lg overflow-hidden">
              {CATEGORY_SUGGESTIONS.filter(c => c.toLowerCase().includes(form.category.toLowerCase())).map(c => (
                <button key={c} onMouseDown={() => { set("category", c); setCatOpen(false); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors">
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Weight */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Weight</label>
          <input value={form.weight} onChange={e => set("weight", e.target.value)} placeholder="e.g. 3.5g" className={inputCls()} />
        </div>
        {/* Price */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Unit Price ($)</label>
          <input type="number" step="0.01" min="0" value={form.unit_price} onChange={e => set("unit_price", e.target.value)} placeholder="8.00" className={inputCls()} />
        </div>
        {/* THC */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">THC Range</label>
          <input value={form.thc_range} onChange={e => set("thc_range", e.target.value)} placeholder="e.g. 20-25%" className={inputCls()} />
        </div>
      </div>

      {/* Description */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Description</label>
        <textarea value={form.description} onChange={e => set("description", e.target.value)} rows={2} placeholder="Optional…" className={inputCls("resize-none")} />
      </div>

      {/* Aliases */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Aliases (alt names for matching)</label>
        <div className="flex gap-2">
          <input
            value={aliasInput}
            onChange={e => setAliasInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addAlias(); } }}
            placeholder="Type alias, press Enter…"
            className={inputCls("flex-1")}
          />
          <button onClick={addAlias} className={secondaryBtn()}>Add</button>
        </div>
        {form.aliases.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {form.aliases.map(a => (
              <span key={a} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">
                <Tag className="w-3 h-3" />
                {a}
                <button onClick={() => removeAlias(a)} className="hover:text-red-400 transition-colors"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Active toggle + actions */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={form.active} onChange={e => set("active", e.target.checked)} className="accent-primary w-4 h-4" />
          <span className="text-foreground">Active</span>
        </label>
        <div className="flex gap-2">
          <button onClick={onCancel} className={secondaryBtn()}>Cancel</button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.product_name.trim()}
            className={primaryBtn("disabled:opacity-50 flex items-center gap-1.5")}
          >
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Save Product
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CSV Import Modal ──────────────────────────────────────────────────────────

interface CsvRow {
  brand: string;
  product_name: string;
  category: string;
  weight: string;
  price: string;
  thc_range: string;
}

interface ImportSummary { imported: number; skipped: number; brandsCreated: number; }

interface CsvImportProps {
  orgId: string;
  brands: UserBrand[];
  onClose: () => void;
  onDone: () => void;
}

function parseCsvLine(line: string): string[] {
  // Handles quoted fields with commas inside
  const cols: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === "," && !inQuote) { cols.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  cols.push(cur.trim());
  return cols;
}

function parsePasteLine(line: string): CsvRow | null {
  // Format: Brand - Product Name - Category - Weight - Price - THC
  const parts = line.split(/\s*-\s*/);
  if (parts.length < 2) return null;
  return {
    brand:        parts[0]?.trim() ?? "",
    product_name: parts[1]?.trim() ?? "",
    category:     parts[2]?.trim() ?? "",
    weight:       parts[3]?.trim() ?? "",
    price:        parts[4]?.trim() ?? "",
    thc_range:    parts[5]?.trim() ?? "",
  };
}

function CsvImport({ orgId, brands, onClose, onDone }: CsvImportProps) {
  const [mode, setMode]         = useState<"upload" | "paste">("upload");
  const [pasteText, setPasteText] = useState("");
  const [rows, setRows]         = useState<CsvRow[]>([]);
  const [preview, setPreview]   = useState(false);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary]   = useState<ImportSummary | null>(null);
  const [error, setError]       = useState<string | null>(null);

  function parseCsvText(text: string) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) { setError("CSV must have a header row and at least one data row."); return; }
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
    const idx = (col: string) => headers.indexOf(col);
    if (idx("brand") === -1 || idx("product_name") === -1) {
      setError("CSV must have at least 'brand' and 'product_name' columns.");
      return;
    }
    const parsed: CsvRow[] = lines.slice(1).filter(l => l.trim()).map(line => {
      const cols = parseCsvLine(line);
      return {
        brand:        cols[idx("brand")]        ?? "",
        product_name: cols[idx("product_name")] ?? "",
        category:     idx("category")  >= 0 ? cols[idx("category")]  ?? "" : "",
        weight:       idx("weight")    >= 0 ? cols[idx("weight")]    ?? "" : "",
        price:        idx("price")     >= 0 ? cols[idx("price")]     ?? "" : "",
        thc_range:    idx("thc_range") >= 0 || idx("thc") >= 0
          ? cols[idx("thc_range") >= 0 ? idx("thc_range") : idx("thc")] ?? ""
          : "",
      };
    }).filter(r => r.brand && r.product_name);
    setRows(parsed);
    setPreview(true);
    setError(null);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => parseCsvText(ev.target?.result as string);
    reader.readAsText(file);
  }

  function handlePasteParse() {
    const lines = pasteText.trim().split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) { setError("Paste at least one product line."); return; }
    const parsed = lines.map(parsePasteLine).filter(Boolean) as CsvRow[];
    if (!parsed.length) { setError("Could not parse any lines. Format: Brand - Product Name - Category - Weight - Price"); return; }
    setRows(parsed);
    setPreview(true);
    setError(null);
  }

  async function doImport() {
    setImporting(true);
    let imported = 0;
    let skipped = 0;
    let brandsCreated = 0;

    // Load existing products once for duplicate checking
    const { data: existingProducts } = await supabase
      .from("user_products")
      .select("product_name, brand_id")
      .eq("org_id", orgId);
    const existingSet = new Set(
      (existingProducts ?? []).map((p: any) => `${p.brand_id}|${p.product_name.toLowerCase()}`)
    );

    // Brand cache: existing brands map + newly created
    const brandCache: Record<string, string> = {};
    for (const b of brands) brandCache[b.brand_name.toLowerCase()] = b.id;

    try {
      for (const row of rows) {
        if (!row.brand || !row.product_name) { skipped++; continue; }
        const brandKey = row.brand.toLowerCase();

        // Find or create brand
        let brandId = brandCache[brandKey] ?? null;
        if (!brandId) {
          const { data: nb } = await supabase.from("user_brands")
            .insert({ org_id: orgId, brand_name: row.brand, is_own_brand: true })
            .select("id").single();
          brandId = nb?.id ?? null;
          if (brandId) { brandCache[brandKey] = brandId; brandsCreated++; }
        }

        // Skip duplicates
        const dupKey = `${brandId}|${row.product_name.toLowerCase()}`;
        if (existingSet.has(dupKey)) { skipped++; continue; }

        await supabase.from("user_products").insert({
          org_id: orgId,
          brand_id: brandId,
          product_name: row.product_name,
          category: row.category || null,
          weight: row.weight || null,
          unit_price: row.price ? parseFloat(row.price) : null,
          thc_range: row.thc_range || null,
          active: true,
        });
        existingSet.add(dupKey);
        imported++;
      }
      setSummary({ imported, skipped, brandsCreated });
    } catch (err: any) {
      setError(err.message ?? "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card shadow-xl space-y-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Bulk Import Products</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent transition-colors"><X className="w-4 h-4" /></button>
        </div>

        {/* Summary screen */}
        {summary ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border bg-card p-4 text-center">
                <p className="text-2xl font-bold text-primary">{summary.imported}</p>
                <p className="text-xs text-muted-foreground mt-1">Products imported</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4 text-center">
                <p className="text-2xl font-bold text-amber-500">{summary.skipped}</p>
                <p className="text-xs text-muted-foreground mt-1">Skipped (duplicates)</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4 text-center">
                <p className="text-2xl font-bold text-blue-500">{summary.brandsCreated}</p>
                <p className="text-xs text-muted-foreground mt-1">New brands created</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button onClick={onDone} className={primaryBtn()}>Done</button>
            </div>
          </div>
        ) : !preview ? (
          // ── Input screen ────────────────────────────────────────────────────
          <div className="space-y-4">
            {/* Mode toggle */}
            <div className="flex gap-1 p-1 bg-secondary rounded-lg w-fit">
              {(["upload", "paste"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setError(null); }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {m === "upload" ? "Upload CSV" : "Paste Text"}
                </button>
              ))}
            </div>

            {mode === "upload" ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Columns: <code className="bg-muted px-1 py-0.5 rounded">brand, product_name, category, weight, price, thc_range</code>
                  {" "}— only brand + product_name required
                </p>
                <label className="flex flex-col items-center gap-2 p-8 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/50 transition-colors">
                  <Upload className="w-7 h-7 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground font-medium">Click to upload .csv file</span>
                  <span className="text-xs text-muted-foreground">or drag and drop</span>
                  <input type="file" accept=".csv" className="hidden" onChange={handleFile} />
                </label>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  One product per line: <code className="bg-muted px-1 py-0.5 rounded">Brand - Product Name - Category - Weight - Price - THC%</code>
                </p>
                <textarea
                  value={pasteText}
                  onChange={e => { setPasteText(e.target.value); setError(null); }}
                  placeholder={"Wyld Gummies - Strawberry 10mg - Edibles - 10pc - 12.00 - 0%\nCresco - LLR Sativa - Concentrate - 1g - 45.00 - 85%"}
                  rows={8}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-xs font-mono text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button onClick={handlePasteParse} className={primaryBtn()}>Parse Products</button>
              </div>
            )}
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        ) : (
          // ── Preview screen ──────────────────────────────────────────────────
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{rows.length} products ready to import</p>
              <button onClick={() => { setPreview(false); setRows([]); }} className="text-xs text-muted-foreground hover:text-foreground">← Back</button>
            </div>
            <div className="rounded-lg border border-border overflow-auto max-h-64">
              <table className="w-full text-xs">
                <thead className="sticky top-0">
                  <tr className="bg-sidebar">
                    <th className={thCls}>Brand</th>
                    <th className={thCls}>Name</th>
                    <th className={thCls}>Category</th>
                    <th className={thCls}>Weight</th>
                    <th className={thCls}>Price</th>
                    <th className={thCls}>THC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {rows.map((r, i) => (
                    <tr key={i} className="hover:bg-accent/20">
                      <td className="px-4 py-2 font-medium">{r.brand}</td>
                      <td className="px-4 py-2">{r.product_name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{r.category || "—"}</td>
                      <td className="px-4 py-2 text-muted-foreground">{r.weight || "—"}</td>
                      <td className="px-4 py-2 text-muted-foreground">{r.price || "—"}</td>
                      <td className="px-4 py-2 text-muted-foreground">{r.thc_range || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">Existing products with the same brand + name will be skipped automatically.</p>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button onClick={() => { setPreview(false); setRows([]); setError(null); }} className={secondaryBtn()}>Back</button>
              <button onClick={doImport} disabled={importing} className={primaryBtn("flex items-center gap-1.5 disabled:opacity-50")}>
                {importing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Import {rows.length} Products
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── TAB 2: Products ───────────────────────────────────────────────────────────

function ProductsTab({ orgId }: { orgId: string }) {
  const [products, setProducts]   = useState<UserProduct[]>([]);
  const [brands, setBrands]       = useState<UserBrand[]>([]);
  const [loading, setLoading]     = useState(true);
  const [query, setQuery]         = useState("");
  const [showForm, setShowForm]   = useState(false);
  const [editProduct, setEditProduct] = useState<UserProduct | null>(null);
  const [saving, setSaving]       = useState(false);
  const [showCsv, setShowCsv]     = useState(false);
  const [running, setRunning]     = useState(false);
  const [runMsg, setRunMsg]       = useState<string | null>(null);

  const loadBrands = useCallback(async () => {
    const { data } = await supabase
      .from("user_brands")
      .select("id, brand_name, is_own_brand, created_at")
      .eq("org_id", orgId)
      .order("brand_name");
    setBrands(data ?? []);
  }, [orgId]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("user_products")
      .select("id, brand_id, product_name, category, weight, unit_price, thc_range, description, aliases, active, created_at, user_brand:brand_id(brand_name)")
      .eq("org_id", orgId)
      .order("product_name");
    setProducts((data ?? []) as unknown as UserProduct[]);
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    loadBrands();
    loadProducts();
  }, [loadBrands, loadProducts]);

  const ownBrands = brands.filter(b => b.is_own_brand);

  const filtered = query
    ? products.filter(p =>
        p.product_name.toLowerCase().includes(query.toLowerCase()) ||
        (p.user_brand?.brand_name ?? "").toLowerCase().includes(query.toLowerCase()) ||
        (p.category ?? "").toLowerCase().includes(query.toLowerCase())
      )
    : products;

  function formDataFromProduct(p: UserProduct): ProductFormData {
    return {
      brand_id: p.brand_id ?? "",
      product_name: p.product_name,
      category: p.category ?? "",
      weight: p.weight ?? "",
      unit_price: p.unit_price != null ? String(p.unit_price) : "",
      thc_range: p.thc_range ?? "",
      description: p.description ?? "",
      aliases: p.aliases ?? [],
      active: p.active,
    };
  }

  async function saveProduct(data: ProductFormData) {
    if (!data.product_name.trim()) return;
    setSaving(true);
    const payload = {
      org_id: orgId,
      brand_id: data.brand_id || null,
      product_name: data.product_name.trim(),
      category: data.category || null,
      weight: data.weight || null,
      unit_price: data.unit_price ? parseFloat(data.unit_price) : null,
      thc_range: data.thc_range || null,
      description: data.description || null,
      aliases: data.aliases.length > 0 ? data.aliases : null,
      active: data.active,
    };
    if (editProduct) {
      await supabase.from("user_products").update(payload).eq("id", editProduct.id);
    } else {
      await supabase.from("user_products").insert(payload);
    }
    setSaving(false);
    setShowForm(false);
    setEditProduct(null);
    await loadProducts();
  }

  async function deleteProduct(id: string) {
    if (!confirm("Delete this product?")) return;
    await supabase.from("user_products").delete().eq("id", id);
    await loadProducts();
  }

  async function runMatcher() {
    setRunning(true);
    setRunMsg(null);
    try {
      const result = await callEdgeFunction("match-products", { org_id: orgId });
      setRunMsg(`Matcher complete. ${(result as any)?.matched ?? ""}`);
    } catch (err: any) {
      setRunMsg(`Error: ${err.message}`);
    } finally {
      setRunning(false);
    }
  }

  const isFormOpen = showForm || editProduct !== null;

  return (
    <div className="space-y-4">
      {/* Header actions */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search products…"
            className="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
        </div>
        <button onClick={() => setShowCsv(true)} className={secondaryBtn("flex items-center gap-1.5")}>
          <Upload className="w-3.5 h-3.5" />
          Import CSV
        </button>
        <button
          onClick={runMatcher}
          disabled={running}
          className={secondaryBtn("flex items-center gap-1.5 disabled:opacity-50")}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${running ? "animate-spin" : ""}`} />
          Run Matcher
        </button>
        <button
          onClick={() => { setEditProduct(null); setShowForm(!showForm); }}
          className={primaryBtn("flex items-center gap-1.5")}
        >
          <Plus className="w-3.5 h-3.5" />
          Add Product
        </button>
      </div>

      {runMsg && (
        <p className={`text-xs px-3 py-2 rounded-lg ${runMsg.startsWith("Error") ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>
          {runMsg}
        </p>
      )}

      {/* Add/Edit form */}
      {isFormOpen && (
        <ProductForm
          ownBrands={ownBrands}
          initial={editProduct ? formDataFromProduct(editProduct) : undefined}
          onSave={saveProduct}
          onCancel={() => { setShowForm(false); setEditProduct(null); }}
          saving={saving}
        />
      )}

      {/* Products table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-sidebar" style={{ borderBottom: "1px solid var(--glass-border)" }}>
                  <th className={thCls}>Brand</th>
                  <th className={thCls}>Product Name</th>
                  <th className={thCls}>Category</th>
                  <th className={thCls}>Weight</th>
                  <th className={thCls}>Price</th>
                  <th className={thCls}>THC</th>
                  <th className={thCls}>Active</th>
                  <th className={thCls}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      {products.length === 0 ? "No products yet. Add one above." : "No products match your search."}
                    </td>
                  </tr>
                ) : filtered.map(p => (
                  <tr
                    key={p.id}
                    className="hover:bg-accent/20 transition-colors cursor-pointer"
                    onClick={() => { setShowForm(false); setEditProduct(p); }}
                  >
                    <td className="px-4 py-2 text-muted-foreground text-xs">{p.user_brand?.brand_name ?? "—"}</td>
                    <td className="px-4 py-2 font-medium text-foreground">{p.product_name}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{p.category ?? "—"}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground font-mono-data">{p.weight ?? "—"}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground font-mono-data">
                      {p.unit_price != null ? `$${p.unit_price.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{p.thc_range ?? "—"}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${p.active ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                        {p.active ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="px-4 py-2" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setShowForm(false); setEditProduct(p); }}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteProduct(p.id)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCsv && (
        <CsvImport
          orgId={orgId}
          brands={brands}
          onClose={() => setShowCsv(false)}
          onDone={async () => {
            setShowCsv(false);
            await loadBrands();
            await loadProducts();
          }}
        />
      )}
    </div>
  );
}

// ── TAB 3: Match Review ───────────────────────────────────────────────────────

function MatchReviewTab({ orgId, onCountChange }: { orgId: string; onCountChange: (n: number) => void }) {
  const [matches, setMatches] = useState<ProductMatch[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("product_matches")
      .select(`
        id, confidence, match_method, verified,
        user_product:user_product_id(product_name, user_brand:brand_id(brand_name)),
        menu_item:menu_item_id(raw_name, raw_brand),
        intel_store:intel_store_id(name, city)
      `)
      .eq("verified", false)
      .gte("confidence", 0.6)
      .order("confidence", { ascending: false })
      .limit(100);
    const list = (data ?? []) as unknown as ProductMatch[];
    setMatches(list);
    onCountChange(list.length);
    setLoading(false);
  }, [orgId, onCountChange]);

  useEffect(() => { load(); }, [load]);

  async function confirm(id: string) {
    await supabase.from("product_matches").update({ verified: true }).eq("id", id);
    await load();
  }

  async function reject(id: string) {
    await supabase.from("product_matches").delete().eq("id", id);
    await load();
  }

  if (loading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading matches…</div>;
  if (matches.length === 0) return (
    <div className="p-12 text-center space-y-2">
      <Check className="w-8 h-8 text-emerald-400 mx-auto" />
      <p className="text-sm text-muted-foreground">No pending matches to review.</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {matches.map(m => {
        const pct = Math.round(m.confidence * 100);
        const userBrandName = (m.user_product?.user_brand as any)?.brand_name ?? "";
        return (
          <div key={m.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">
                  <span className="text-muted-foreground text-xs">Product: </span>
                  {userBrandName && <span className="text-muted-foreground">{userBrandName} — </span>}
                  {m.user_product?.product_name ?? "Unknown"}
                </p>
                <p className="text-sm text-muted-foreground">
                  <span className="text-xs">Matches: </span>
                  <span className="text-foreground">{m.menu_item?.raw_name ?? "—"}</span>
                  {m.intel_store && (
                    <span> at <span className="text-foreground">{m.intel_store.name}{m.intel_store.city ? `, ${m.intel_store.city}` : ""}</span></span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => confirm(m.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  Confirm
                </button>
                <button
                  onClick={() => reject(m.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-600/20 text-red-400 border border-red-500/30 text-xs font-medium hover:bg-red-600/30 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Reject
                </button>
              </div>
            </div>
            {/* Confidence bar + method */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-emerald-500" : pct >= 75 ? "bg-blue-500" : "bg-amber-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs font-mono-data text-muted-foreground w-10 text-right">{pct}%</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${METHOD_COLORS[m.match_method] ?? "bg-muted text-muted-foreground"}`}>
                {m.match_method.replace(/_/g, " ")}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function MyProducts() {
  const { orgId } = useOrg();
  const [tab, setTab]             = useState<TabId>("brands");
  const [matchCount, setMatchCount] = useState(0);

  if (!orgId) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <p className="text-sm text-muted-foreground">No organization selected.</p>
      </div>
    );
  }

  const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "brands",   label: "Brands",       icon: Tag     },
    { id: "products", label: "Products",     icon: Package },
    { id: "matches",  label: `Match Review${matchCount > 0 ? ` (${matchCount})` : ""}`, icon: Check },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 animate-fade-up">
      <div>
        <h1 className="text-foreground">My Products</h1>
        <div className="header-underline mt-1" />
        <p className="text-sm text-muted-foreground mt-1">Manage your brand catalog and track matches across the market</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-border overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
              tab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className={tab === "brands"   ? "" : "hidden"}><BrandsTab orgId={orgId} /></div>
      <div className={tab === "products" ? "" : "hidden"}><ProductsTab orgId={orgId} /></div>
      <div className={tab === "matches"  ? "" : "hidden"}>
        <MatchReviewTab orgId={orgId} onCountChange={setMatchCount} />
      </div>
    </div>
  );
}
