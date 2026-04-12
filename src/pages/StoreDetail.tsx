import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import type { IntelStore, DispensaryMenu } from "@/lib/types";
import { ArrowLeft, MapPin, Phone, Globe, Package, Calendar, Wifi } from "lucide-react";

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

export function StoreDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [store, setStore] = useState<IntelStore | null>(null);
  const [menus, setMenus] = useState<DispensaryMenu[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [selectedMenu, setSelectedMenu] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    async function load() {
      const [storeRes, menusRes] = await Promise.all([
        supabase.from("intel_stores").select("*").eq("id", id).single(),
        supabase.from("dispensary_menus").select("*").eq("intel_store_id", id).order("last_scraped_at", { ascending: false }),
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

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <div className="h-8 w-48 skeleton-shimmer rounded" />
        <div className="h-32 skeleton-shimmer rounded-lg" />
      </div>
    );
  }

  if (!store) return (
    <div className="p-6 text-muted-foreground text-sm">Store not found.</div>
  );

  const selectedMenuObj = menus.find((m) => m.id === selectedMenu);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5 animate-fade-up">
      <button
        onClick={() => navigate("/stores")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to directory
      </button>

      {/* Store header */}
      <div className="rounded-lg border border-border bg-card p-5 shadow-premium stat-accent-teal">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-foreground">{store.name}</h1>
            {store.trade_name && store.trade_name !== store.name && (
              <p className="text-xs text-muted-foreground mt-0.5">LCB trade name: {store.trade_name}</p>
            )}
            <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
              {store.address && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-primary/70" />
                  {store.address}, {store.city}
                </span>
              )}
              {store.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-primary/70" />
                  {store.phone}
                </span>
              )}
              {store.website && (
                <a
                  href={store.website}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 hover:text-primary transition-colors"
                >
                  <Globe className="w-3.5 h-3.5" /> Website
                </a>
              )}
            </div>
          </div>
          <div className="text-right shrink-0 space-y-1">
            <p className="text-xs text-muted-foreground">{store.county} County</p>
            <p className="text-xs text-muted-foreground">{store.state}</p>
            {menus.length > 0 && (
              <div className="flex items-center gap-1 justify-end">
                <Wifi className="w-3 h-3 text-primary" />
                <span className="text-[10px] font-medium" style={{ color: "hsl(var(--primary))" }}>
                  {menus.length} platform{menus.length !== 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Platform tabs */}
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
                  <span className="ml-1.5 opacity-70">{m.menu_item_count}</span>
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

      {/* Products table */}
      {items.length > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-hidden shadow-premium">
          <div
            className="px-4 py-2.5 flex items-center gap-2 bg-sidebar"
            style={{ borderBottom: "1px solid var(--glass-border)" }}
          >
            <Package className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              {items.length} Products
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
                  <td className="px-4 py-1.5 text-muted-foreground hidden sm:table-cell">{item.raw_brand ?? "—"}</td>
                  <td className="px-4 py-1.5 text-muted-foreground">{item.raw_category ?? "—"}</td>
                  <td className="px-4 py-1.5 text-muted-foreground font-mono-data">
                    {item.raw_price != null ? `$${item.raw_price.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-4 py-1.5 text-muted-foreground font-mono-data hidden sm:table-cell">{item.raw_thc ?? "—"}</td>
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
