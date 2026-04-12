import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { IntelStore, DispensaryMenu } from "../lib/types";
import { ArrowLeft, MapPin, Phone, Globe, Package, Calendar } from "lucide-react";

interface MenuItem {
  id: string;
  raw_name: string;
  raw_brand: string | null;
  raw_category: string | null;
  raw_price: number | null;
  raw_thc: string | null;
  raw_strain_type: string | null;
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
      .select("id, raw_name, raw_brand, raw_category, raw_price, raw_thc, raw_strain_type, is_on_menu")
      .eq("dispensary_menu_id", selectedMenu)
      .eq("is_on_menu", true)
      .order("raw_category")
      .limit(200)
      .then(({ data }) => setItems(data ?? []));
  }, [selectedMenu]);

  if (loading) return <div className="p-6 text-muted-foreground text-sm">Loading...</div>;
  if (!store) return <div className="p-6 text-muted-foreground text-sm">Store not found.</div>;

  return (
    <div className="p-6 space-y-5">
      <button
        onClick={() => navigate("/stores")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to directory
      </button>

      {/* Header */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">{store.name}</h1>
            {store.trade_name && store.trade_name !== store.name && (
              <p className="text-xs text-muted-foreground mt-0.5">Trade: {store.trade_name}</p>
            )}
            <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
              {store.address && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {store.address}, {store.city}
                </span>
              )}
              {store.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" />
                  {store.phone}
                </span>
              )}
              {store.website && (
                <a href={store.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-primary">
                  <Globe className="w-3.5 h-3.5" />
                  Website
                </a>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground">{store.county} County</p>
            <p className="text-xs text-muted-foreground">{store.state}</p>
          </div>
        </div>
      </div>

      {/* Platform menus */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-2">Menu Data Sources</h2>
        {menus.length === 0 ? (
          <p className="text-sm text-muted-foreground">No menu data scraped yet.</p>
        ) : (
          <div className="flex gap-2 flex-wrap mb-4">
            {menus.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedMenu(m.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  selectedMenu === m.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                <span>{PLATFORM_LABELS[m.source] ?? m.source}</span>
                {m.menu_item_count != null && (
                  <span className="ml-1.5 opacity-70">{m.menu_item_count} products</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Last scraped */}
      {menus.find((m) => m.id === selectedMenu)?.last_scraped_at && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          Last scraped: {new Date(menus.find((m) => m.id === selectedMenu)!.last_scraped_at!).toLocaleString()}
        </p>
      )}

      {/* Menu items */}
      {items.length > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-muted/40 flex items-center gap-2">
            <Package className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {items.length} Products
            </span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left px-4 py-2 text-muted-foreground font-medium">Name</th>
                <th className="text-left px-4 py-2 text-muted-foreground font-medium">Brand</th>
                <th className="text-left px-4 py-2 text-muted-foreground font-medium">Category</th>
                <th className="text-left px-4 py-2 text-muted-foreground font-medium">Price</th>
                <th className="text-left px-4 py-2 text-muted-foreground font-medium">THC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-accent/30">
                  <td className="px-4 py-1.5 text-foreground max-w-[200px] truncate">{item.raw_name}</td>
                  <td className="px-4 py-1.5 text-muted-foreground">{item.raw_brand ?? "—"}</td>
                  <td className="px-4 py-1.5 text-muted-foreground">{item.raw_category ?? "—"}</td>
                  <td className="px-4 py-1.5 text-muted-foreground">
                    {item.raw_price != null ? `$${item.raw_price.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-4 py-1.5 text-muted-foreground">{item.raw_thc ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
