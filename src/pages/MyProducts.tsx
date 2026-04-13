import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package, Search, X, Plus, Edit2, Trash2, Save, AlertCircle, Loader2,
  ChevronRight, ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DbProduct {
  id:                string;
  name:              string;
  farm:              string | null;
  type:              string | null;
  strain:            string | null;
  description:       string | null;
  available:         boolean | null;
  unit:              string | null;
  price_per_unit:    number | null;
  thc_percentage:    number | null;
  product_image_url: string | null;
  source:            string | null;
  org_id:            string;
}

interface ProductGroup {
  name:        string;
  farm:        string;
  type:        string | null;
  strain:      string | null;
  description: string | null;
  available:   boolean;
  imageUrl:    string | null;
  variants:    DbProduct[];
  minPrice:    number | null;
  maxPrice:    number | null;
}

type SortKey = "name" | "farm" | "type" | "minPrice";
type SortDir = "asc" | "desc";

// ─── Constants ───────────────────────────────────────────────────────────────

const FARMS = [
  "Desert Valley Growers",
  "Painted Rooster Cannabis Co",
  "Kush Mountain Cannabis",
];

const PRODUCT_TYPES = [
  "flower", "concentrate", "pre_roll", "vape", "beverage", "edible", "cannagar", "other",
];

const FARM_COLORS: Record<string, { text: string; bg: string }> = {
  "Desert Valley Growers":       { text: "#00D4AA", bg: "hsl(168 100% 42% / 0.07)" },
  "Painted Rooster Cannabis Co": { text: "#A78BFA", bg: "hsl(265 83% 76% / 0.07)"  },
  "Kush Mountain Cannabis":      { text: "#10B981", bg: "hsl(160 84% 39% / 0.07)"  },
};
function farmColor(name: string) {
  return FARM_COLORS[name] ?? { text: "hsl(217 91% 60%)", bg: "hsl(217 91% 60% / 0.07)" };
}

function productFarm(p: DbProduct): string {
  return (p.farm ?? "").trim() || "Other";
}

function friendlyError(msg: string): string {
  if (msg.includes("row-level") || msg.includes("RLS") || msg.includes("policy"))
    return "Permission denied. Check RLS policies on the products table.";
  if (msg.includes("does not exist"))
    return "Table not found. Make sure the products table exists.";
  return msg;
}

function groupProducts(products: DbProduct[]): ProductGroup[] {
  const map = new Map<string, DbProduct[]>();
  for (const p of products) {
    const key = `${p.name}|||${productFarm(p)}`;
    const arr = map.get(key) ?? [];
    arr.push(p);
    map.set(key, arr);
  }
  const groups: ProductGroup[] = [];
  for (const variants of map.values()) {
    const first = variants[0];
    const prices = variants
      .map(v => (v.price_per_unit == null ? null : Number(v.price_per_unit)))
      .filter((p): p is number => p != null);
    groups.push({
      name:        first.name,
      farm:        productFarm(first),
      type:        first.type ?? null,
      strain:      (first.strain ?? "").trim() || null,
      description: first.description ?? null,
      available:   variants.some(v => v.available !== false),
      imageUrl:    variants.find(v => v.product_image_url)?.product_image_url ?? null,
      variants:    variants.sort((a, b) => (Number(a.price_per_unit) || 0) - (Number(b.price_per_unit) || 0)),
      minPrice:    prices.length ? Math.min(...prices) : null,
      maxPrice:    prices.length ? Math.max(...prices) : null,
    });
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name));
}

function priceRange(g: ProductGroup): string {
  if (g.minPrice == null) return "—";
  if (g.minPrice === g.maxPrice) return `$${g.minPrice.toFixed(2)}`;
  return `$${g.minPrice.toFixed(2)} – $${g.maxPrice!.toFixed(2)}`;
}

// ─── Sort header ─────────────────────────────────────────────────────────────

function SortableHeader({
  label, sortKey, sort, onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: SortDir } | null;
  onSort: (k: SortKey) => void;
}) {
  const active = sort?.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort?.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`flex items-center gap-1 text-[11px] font-medium transition-colors ${
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      <Icon className="w-3 h-3" />
    </button>
  );
}

// ─── Size Editor ─────────────────────────────────────────────────────────────

interface SizeRow { id?: string; unit: string; price: string }

function SizeEditor({ sizes, onChange }: { sizes: SizeRow[]; onChange: (s: SizeRow[]) => void }) {
  function update(i: number, field: "unit" | "price", value: string) {
    const next = [...sizes];
    next[i] = { ...next[i], [field]: value };
    onChange(next);
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Sizes & Pricing</label>
        <button
          onClick={() => onChange([...sizes, { unit: "", price: "" }])}
          className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 font-medium"
        >
          <Plus className="w-3 h-3" /> Add Size
        </button>
      </div>
      {sizes.length === 0 && (
        <p className="text-[11px] text-muted-foreground py-2">No sizes yet. Click "Add Size" to start.</p>
      )}
      {sizes.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-4 shrink-0 text-center">{i + 1}</span>
          <input
            value={s.unit}
            onChange={e => update(i, "unit", e.target.value)}
            placeholder="e.g. 3.5g (Eighth)"
            className="flex-1 h-8 text-xs bg-secondary border border-border rounded-md px-2.5"
          />
          <div className="relative w-28 shrink-0">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
            <input
              type="number" min={0} step={0.01}
              value={s.price}
              onChange={e => update(i, "price", e.target.value)}
              placeholder="0.00"
              className="h-8 w-full text-xs bg-secondary border border-border rounded-md pl-6 pr-2"
            />
          </div>
          <button
            onClick={() => onChange(sizes.filter((_, idx) => idx !== i))}
            className="p-1 text-muted-foreground hover:text-destructive shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function ProductModal({
  group, orgId, onClose, onSaved,
}: {
  group:  ProductGroup | null; // null = new
  orgId:  string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !group;
  const [name,        setName]        = useState(group?.name ?? "");
  const [farm,        setFarm]        = useState(group?.farm ?? FARMS[0]);
  const [type,        setType]        = useState(group?.type ?? "");
  const [strain,      setStrain]      = useState(group?.strain ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [available,   setAvailable]   = useState(group?.available ?? true);
  const [sizes, setSizes] = useState<SizeRow[]>(() => {
    if (group) {
      return group.variants.map(v => ({
        id:    v.id,
        unit:  v.unit ?? "",
        price: v.price_per_unit?.toString() ?? "",
      }));
    }
    return [{ unit: "", price: "" }];
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim())     { setErr("Product name is required."); return; }
    const validSizes = sizes.filter(s => s.unit.trim() && s.price.trim());
    if (!validSizes.length) { setErr("Add at least one size with a price."); return; }

    setSaving(true);
    setErr(null);
    try {
      if (!isNew) {
        const keepIds   = new Set(validSizes.filter(s => s.id).map(s => s.id!));
        const deleteIds = group!.variants.filter(v => !keepIds.has(v.id)).map(v => v.id);
        if (deleteIds.length) {
          await supabase.from("products").delete().in("id", deleteIds);
        }
        for (const s of validSizes) {
          const payload = {
            name: name.trim(),
            farm: farm || null,
            type: type.trim() || null,
            strain: strain.trim() || null,
            description: description.trim() || null,
            available,
            unit: s.unit.trim(),
            price_per_unit: parseFloat(s.price),
          };
          if (s.id) {
            await supabase.from("products").update(payload).eq("id", s.id);
          } else {
            await supabase.from("products").insert({ ...payload, id: crypto.randomUUID(), org_id: orgId });
          }
        }
      } else {
        const rows = validSizes.map(s => ({
          id:   crypto.randomUUID(),
          org_id: orgId,
          name: name.trim(),
          farm: farm || null,
          type: type.trim() || null,
          strain: strain.trim() || null,
          description: description.trim() || null,
          available,
          unit: s.unit.trim(),
          price_per_unit: parseFloat(s.price),
        }));
        const { error } = await supabase.from("products").insert(rows);
        if (error) throw error;
      }
      onSaved();
    } catch (e: any) {
      setErr(friendlyError(e.message ?? String(e)));
    }
    setSaving(false);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 8 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="w-full max-w-lg rounded-xl border border-border bg-card overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md flex items-center justify-center"
                 style={{ background: "hsl(168 100% 42% / 0.12)" }}>
              <Package className="w-4 h-4 text-primary" />
            </div>
            <h2 className="text-[15px] font-semibold text-foreground">
              {isNew ? "Add Product" : "Edit Product"}
            </h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {err && (
            <div className="rounded-md p-3 text-[11px] text-destructive bg-destructive/10 border border-destructive/20">
              {err}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Product Name *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Living Soil Indoor Flower (Black Label)"
              className="w-full h-10 text-sm bg-secondary border border-border rounded-md px-3"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Farm</label>
              <select
                value={farm}
                onChange={e => setFarm(e.target.value)}
                className="w-full h-10 text-sm rounded-md bg-secondary border border-border text-foreground px-3"
              >
                {FARMS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Type</label>
              <select
                value={type}
                onChange={e => setType(e.target.value)}
                className="w-full h-10 text-sm rounded-md bg-secondary border border-border text-foreground px-3 capitalize"
              >
                <option value="">Select type</option>
                {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3 bg-background/30">
            <SizeEditor sizes={sizes} onChange={setSizes} />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Strains</label>
            <input
              value={strain}
              onChange={e => setStrain(e.target.value)}
              placeholder="e.g. Cap Junky; Blue Runtz; Gary Payton"
              className="w-full h-10 text-sm bg-secondary border border-border rounded-md px-3"
            />
            <p className="text-[9px] text-muted-foreground">Separate with semicolons</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="Product description…"
              className="w-full text-sm bg-secondary border border-border rounded-md px-3 py-2 resize-none"
            />
          </div>

          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-medium text-foreground">Available</p>
              <p className="text-[11px] text-muted-foreground">Show as in-stock</p>
            </div>
            <button
              onClick={() => setAvailable(!available)}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
              style={{ background: available ? "hsl(168 100% 42% / 0.85)" : "hsl(var(--border))" }}
            >
              <span className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                    style={{ transform: available ? "translateX(22px)" : "translateX(2px)" }} />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="flex-1 h-9 text-sm font-medium border border-border rounded-md hover:bg-secondary/50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 h-9 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {isNew ? "Add Product" : "Save Changes"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function MyProducts() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [products, setProducts] = useState<DbProduct[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [err,      setErr]      = useState<string | null>(null);

  const [search,     setSearch]     = useState("");
  const [farmFilter, setFarmFilter] = useState("all");
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>({ key: "name", dir: "asc" });

  const [editGroup,   setEditGroup]   = useState<ProductGroup | null | undefined>(undefined);
  const [deleteGroup, setDeleteGroup] = useState<ProductGroup | null>(null);
  const [deleting,    setDeleting]    = useState(false);
  const showModal = editGroup !== undefined;

  // Resolve user's active org once, then load all products for it
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data: mem } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (mem?.org_id) setOrgId(mem.org_id);
      else setLoading(false);
    })();
  }, []);

  function load() {
    if (!orgId) return;
    setLoading(true);
    supabase.from("products").select("*").eq("org_id", orgId).order("name")
      .then(({ data, error }) => {
        if (error) { setErr(friendlyError(error.message)); setLoading(false); return; }
        setProducts((data ?? []) as DbProduct[]);
        setLoading(false);
      });
  }
  useEffect(() => { if (orgId) load(); /* eslint-disable-next-line */ }, [orgId]);

  const allGroups = useMemo(() => groupProducts(products), [products]);
  const farms     = useMemo(() => Array.from(new Set(products.map(productFarm))).sort(), [products]);

  const filteredGroups = useMemo(() => {
    return allGroups.filter(g => {
      if (farmFilter !== "all" && g.farm !== farmFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        g.name.toLowerCase().includes(q) ||
        g.farm.toLowerCase().includes(q) ||
        (g.strain ?? "").toLowerCase().includes(q) ||
        (g.type   ?? "").toLowerCase().includes(q)
      );
    });
  }, [allGroups, farmFilter, search]);

  const sortedGroups = useMemo(() => {
    if (!sort) return filteredGroups;
    const arr = [...filteredGroups];
    arr.sort((a, b) => {
      const av: string | number | null =
        sort.key === "minPrice" ? a.minPrice
        : sort.key === "name"   ? a.name
        : sort.key === "farm"   ? a.farm
        : a.type;
      const bv: string | number | null =
        sort.key === "minPrice" ? b.minPrice
        : sort.key === "name"   ? b.name
        : sort.key === "farm"   ? b.farm
        : b.type;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filteredGroups, sort]);

  const byFarm = useMemo(() => {
    const acc: Record<string, ProductGroup[]> = {};
    for (const g of sortedGroups) (acc[g.farm] ??= []).push(g);
    return acc;
  }, [sortedGroups]);

  function toggleSort(k: SortKey) {
    setSort(prev => {
      if (prev?.key !== k) return { key: k, dir: "asc" };
      if (prev.dir === "asc") return { key: k, dir: "desc" };
      return null;
    });
  }

  function toggleExpand(key: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function toggleAvailable(g: ProductGroup) {
    const next = !g.available;
    const ids = g.variants.map(v => v.id);
    setProducts(prev => prev.map(p => ids.includes(p.id) ? { ...p, available: next } : p));
    await supabase.from("products").update({ available: next }).in("id", ids);
  }

  async function confirmDelete() {
    if (!deleteGroup) return;
    setDeleting(true);
    const ids = deleteGroup.variants.map(v => v.id);
    await supabase.from("products").delete().in("id", ids);
    setDeleting(false);
    setDeleteGroup(null);
    setProducts(prev => prev.filter(p => !ids.includes(p.id)));
  }

  const uniqueProducts = allGroups.length;
  const totalVariants  = products.length;
  const availableCount = allGroups.filter(g => g.available).length;

  return (
    <>
      <div className="p-4 md:p-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight leading-none">Product Catalog</h1>
            <div className="h-px mt-2" style={{ background: "linear-gradient(to right, hsl(168 100% 42% / 0.5), transparent)" }} />
          </div>
          <button
            onClick={() => setEditGroup(null)}
            disabled={!orgId}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Product
          </button>
        </div>

        {/* Stats */}
        {!loading && products.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Products",      value: uniqueProducts, color: "hsl(168 100% 42%)" },
              { label: "Size Variants", value: totalVariants,  color: "hsl(217 91% 60%)" },
              { label: "Available",     value: availableCount, color: "#10B981" },
              { label: "Farms",         value: farms.length,   color: "#A78BFA" },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl border border-border bg-card px-4 py-3"
              >
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
                <p className="text-xl font-bold tabular-nums mt-0.5" style={{ color: s.color }}>{s.value}</p>
              </motion.div>
            ))}
          </div>
        )}

        {/* Search + farm filter */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search products, strains…"
              className="pl-8 h-8 w-full text-xs bg-secondary border border-border rounded-md pr-8"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["all", ...farms].map(f => (
              <button
                key={f}
                onClick={() => setFarmFilter(f)}
                className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border"
                style={farmFilter === f
                  ? { background: "hsl(168 100% 42% / 0.15)", color: "hsl(168 100% 42%)", borderColor: "hsl(168 100% 42% / 0.4)" }
                  : { background: "transparent", color: "hsl(var(--muted-foreground))", borderColor: "hsl(var(--border))" }
                }
              >
                {f === "all" ? "All Farms" : f}
              </button>
            ))}
          </div>
        </div>

        {/* Sort bar */}
        {!loading && filteredGroups.length > 0 && (
          <div className="flex items-center gap-4 mb-4 px-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Sort by</span>
            <div className="flex items-center gap-4">
              <SortableHeader label="Name"  sortKey="name"     sort={sort} onSort={toggleSort} />
              <SortableHeader label="Farm"  sortKey="farm"     sort={sort} onSort={toggleSort} />
              <SortableHeader label="Type"  sortKey="type"     sort={sort} onSort={toggleSort} />
              <SortableHeader label="Price" sortKey="minPrice" sort={sort} onSort={toggleSort} />
            </div>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-7 h-7 text-primary animate-spin" />
          </div>
        ) : err ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center">
            <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground mb-1">Could not load products</p>
            <p className="text-xs text-muted-foreground">{err}</p>
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-16 text-center">
            <Package className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-[15px] font-semibold text-foreground mb-1">No products yet</p>
            <p className="text-sm text-muted-foreground mb-4">Add your first product to get started.</p>
            <button
              onClick={() => setEditGroup(null)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="w-3.5 h-3.5" /> Add Product
            </button>
          </div>
        ) : Object.keys(byFarm).length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No products match your search.</div>
        ) : (
          <div className="space-y-6">
            {Object.entries(byFarm).map(([farm, farmGroups], fi) => {
              const fc = farmColor(farm);
              return (
                <motion.div
                  key={farm}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: fi * 0.08 }}
                  className="rounded-xl border border-border bg-card overflow-hidden"
                >
                  {/* Farm header */}
                  <div
                    className="px-5 py-3 flex items-center justify-between border-b border-border"
                    style={{ background: fc.bg }}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: fc.text }} />
                      <h2 className="text-[14px] font-bold" style={{ color: fc.text }}>{farm}</h2>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {farmGroups.length} product{farmGroups.length !== 1 ? "s" : ""} ·{" "}
                      {farmGroups.reduce((s, g) => s + g.variants.length, 0)} variants
                    </span>
                  </div>

                  {/* Product rows */}
                  <div>
                    {farmGroups.map((g) => {
                      const key = g.name + g.farm;
                      const isOpen = expanded.has(key);
                      return (
                        <div key={key}>
                          <div
                            className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-secondary/30 transition-colors group border-b border-border/40 last:border-b-0"
                            onClick={() => toggleExpand(key)}
                          >
                            <motion.div animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.15 }}>
                              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                            </motion.div>

                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-semibold text-foreground truncate">{g.name}</p>
                              {g.description && (
                                <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-md">
                                  {g.description}
                                </p>
                              )}
                            </div>

                            {g.type && (
                              <span
                                className="text-[10px] font-medium px-2 py-0.5 rounded-md capitalize shrink-0 border border-border bg-secondary/40 text-muted-foreground"
                              >
                                {g.type.replace("_", "-")}
                              </span>
                            )}

                            <span className="text-[13px] font-bold text-foreground tabular-nums shrink-0 w-36 text-right">
                              {priceRange(g)}
                            </span>

                            <span className="text-[10px] text-muted-foreground shrink-0 w-20 text-center">
                              {g.variants.length} size{g.variants.length !== 1 ? "s" : ""}
                            </span>

                            <button
                              onClick={e => { e.stopPropagation(); toggleAvailable(g); }}
                              className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0"
                              style={{ background: g.available ? "hsl(168 100% 42% / 0.8)" : "hsl(var(--border))" }}
                            >
                              <span
                                className="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
                                style={{ transform: g.available ? "translateX(18px)" : "translateX(2px)" }}
                              />
                            </button>

                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <button
                                onClick={e => { e.stopPropagation(); setEditGroup(g); }}
                                className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); setDeleteGroup(g); }}
                                className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {/* Expanded: strains + size table */}
                          <AnimatePresence>
                            {isOpen && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                                className="overflow-hidden"
                              >
                                <div className="px-5 pb-3 pt-1 ml-8">
                                  {g.strain && (
                                    <div className="mb-3 flex flex-wrap gap-1">
                                      {g.strain.split(/[;,]/).map(s => s.trim()).filter(Boolean).slice(0, 12).map(s => (
                                        <span
                                          key={s}
                                          className="text-[9px] font-medium px-1.5 py-0.5 rounded-md border border-border bg-secondary/40 text-muted-foreground"
                                        >
                                          {s}
                                        </span>
                                      ))}
                                      {g.strain.split(/[;,]/).filter(s => s.trim()).length > 12 && (
                                        <span className="text-[9px] text-muted-foreground">
                                          +{g.strain.split(/[;,]/).filter(s => s.trim()).length - 12} more
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  <div className="rounded-lg border border-border overflow-hidden">
                                    <table className="w-full">
                                      <thead>
                                        <tr className="bg-secondary/30">
                                          <th className="text-left  text-[9px] font-medium text-muted-foreground uppercase tracking-wider px-3 py-2">Size</th>
                                          <th className="text-right text-[9px] font-medium text-muted-foreground uppercase tracking-wider px-3 py-2">Price</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {g.variants.map(v => (
                                          <tr key={v.id} className="border-t border-border/40 hover:bg-secondary/20">
                                            <td className="px-3 py-2 text-[12px] text-foreground">{v.unit ?? "—"}</td>
                                            <td className="px-3 py-2 text-[12px] font-semibold text-foreground tabular-nums text-right">
                                              {v.price_per_unit != null ? `$${Number(v.price_per_unit).toFixed(2)}` : "—"}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && orgId && (
          <ProductModal
            group={editGroup ?? null}
            orgId={orgId}
            onClose={() => setEditGroup(undefined)}
            onSaved={() => { setEditGroup(undefined); load(); }}
          />
        )}
      </AnimatePresence>

      {/* Delete confirm */}
      <AnimatePresence>
        {deleteGroup && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
            onClick={() => setDeleteGroup(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="rounded-xl border border-border bg-card p-6 max-w-sm w-full shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: "hsl(329 86% 70% / 0.12)", border: "1px solid hsl(329 86% 70% / 0.25)" }}
              >
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              <h3 className="text-[15px] font-semibold text-foreground text-center mb-1">
                Delete "{deleteGroup.name}"
              </h3>
              <p className="text-sm text-muted-foreground text-center mb-5">
                This will delete all {deleteGroup.variants.length} size variant
                {deleteGroup.variants.length !== 1 ? "s" : ""}. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setDeleteGroup(null)}
                  className="flex-1 h-9 text-sm font-medium border border-border rounded-md hover:bg-secondary/50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="flex-1 h-9 text-sm font-medium bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 disabled:opacity-50 flex items-center justify-center"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
