import { useState, useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import { isExcludedBrand } from "@/lib/analytics-filters";
import { PIN, pinIcon, WA_CENTER, WA_ZOOM, WA_BOUNDS, TILE_ATTRIBUTION, useDarkTiles } from "./mapUtils";

// ── Types ─────────────────────────────────────────────────────────────────────

type PinType = "myStore" | "gap" | "stockRisk" | "noData";

interface StorePin {
  id: string;
  name: string;
  city: string | null;
  lat: number;
  lng: number;
  products: number;
  type: PinType;
  myProductCount: number;
  lastSeen: string | null;
}

interface VisState { myStore: boolean; gap: boolean; stockRisk: boolean; noData: boolean; }

// ── Legend config ─────────────────────────────────────────────────────────────

const LEGEND = [
  { key: "myStore",   color: PIN.myStore,   label: "Carrying My Brand" },
  { key: "gap",       color: PIN.gap,       label: "Gap Opportunity"   },
  { key: "stockRisk", color: PIN.stockRisk, label: "Stock-out Risk"    },
  { key: "noData",    color: PIN.noData,    label: "No Data Yet"       },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export function DashboardMap() {
  const { orgId } = useOrg();
  const navigate  = useNavigate();
  const tileUrl   = useDarkTiles();

  const [pins,    setPins]    = useState<StorePin[]>([]);
  const [loading, setLoading] = useState(true);
  const [vis, setVis]         = useState<VisState>({
    myStore: true, gap: true, stockRisk: true, noData: true,
  });

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [storesRes, brandsRes, snapsRes] = await Promise.all([
        supabase
          .from("intel_stores")
          .select("id, name, city, latitude, longitude, total_products, menu_last_updated")
          .not("latitude", "is", null)
          .not("longitude", "is", null),
        supabase
          .from("user_brands")
          .select("brand_name, is_own_brand")
          .eq("org_id", orgId)
          .eq("is_own_brand", true),
        supabase
          .from("menu_snapshots")
          .select("intel_store_id, product_data, snapshot_date")
          .order("snapshot_date", { ascending: false })
          .limit(800),
      ]);
      if (cancelled) return;

      const ownBrandNames = new Set(
        (brandsRes.data ?? []).map((b) => b.brand_name.toLowerCase())
      );

      // Most-recent snapshot per store
      const byStore: Record<string, { data: { b?: string }[]; date: string }> = {};
      for (const s of snapsRes.data ?? []) {
        if (!byStore[s.intel_store_id]) {
          byStore[s.intel_store_id] = {
            data: (s.product_data ?? []) as { b?: string }[],
            date: s.snapshot_date,
          };
        }
      }

      const result: StorePin[] = [];
      for (const store of storesRes.data ?? []) {
        if (!store.latitude || !store.longitude) continue;
        const snap = byStore[store.id];
        let type: PinType;
        let myProductCount = 0;

        if (!snap) {
          type = "noData";
        } else {
          const products = snap.data ?? [];
          const myProducts = products.filter(
            (p) => p.b && ownBrandNames.has(p.b.toLowerCase()) && !isExcludedBrand(p.b)
          );
          myProductCount = myProducts.length;

          if (myProductCount > 0) {
            // Stock-out risk: has my brand but very few products (< 3)
            type = myProductCount < 3 ? "stockRisk" : "myStore";
          } else {
            type = "gap";
          }
        }

        result.push({
          id:             store.id,
          name:           store.name,
          city:           store.city,
          lat:            store.latitude,
          lng:            store.longitude,
          products:       store.total_products ?? 0,
          type,
          myProductCount,
          lastSeen:       snap?.date ?? null,
        });
      }

      setPins(result);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [orgId]);

  const visible = useMemo(
    () => pins.filter((p) => vis[p.type]),
    [pins, vis]
  );

  const counts = useMemo(() => ({
    myStore:   pins.filter((p) => p.type === "myStore").length,
    gap:       pins.filter((p) => p.type === "gap").length,
    stockRisk: pins.filter((p) => p.type === "stockRisk").length,
    noData:    pins.filter((p) => p.type === "noData").length,
  }), [pins]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="h-[420px] flex items-center justify-center">
          <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-border bg-sidebar flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground shrink-0">
          Market Map
        </span>
        <div className="flex flex-wrap gap-2 flex-1">
          {LEGEND.map(({ key, color, label }) => (
            <button
              key={key}
              onClick={() => setVis((v) => ({ ...v, [key]: !v[key] }))}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                vis[key as PinType]
                  ? "border-border bg-card text-foreground"
                  : "border-transparent bg-muted/30 text-muted-foreground opacity-50"
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: color }}
              />
              {label}
              <span className="text-muted-foreground">
                ({counts[key as PinType]})
              </span>
            </button>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground shrink-0">
          {visible.length} stores shown
        </span>
      </div>

      {/* Map */}
      <MapContainer
        center={WA_CENTER}
        zoom={WA_ZOOM}
        bounds={WA_BOUNDS}
        style={{ height: 420, width: "100%" }}
        scrollWheelZoom={true}
      >
        <TileLayer url={tileUrl} attribution={TILE_ATTRIBUTION} />
        <MarkerClusterGroup
          chunkedLoading
          maxClusterRadius={40}
        >
          {visible.map((pin) => (
            <Marker
              key={pin.id}
              position={[pin.lat, pin.lng]}
              icon={pinIcon(PIN[pin.type], pin.products)}
            >
              <Popup>
                <div className="min-w-[180px] space-y-1.5 py-1">
                  <p className="font-semibold text-sm leading-tight">{pin.name}</p>
                  {pin.city && (
                    <p className="text-xs text-gray-500">{pin.city}</p>
                  )}
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: PIN[pin.type] }}
                    />
                    <span className="text-xs capitalize">
                      {pin.type === "myStore" && `${pin.myProductCount} of my products`}
                      {pin.type === "gap" && "Gap opportunity"}
                      {pin.type === "stockRisk" && `Stock risk (${pin.myProductCount} SKU)`}
                      {pin.type === "noData" && "No menu data"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {pin.products.toLocaleString()} total products
                  </p>
                  {pin.lastSeen && (
                    <p className="text-xs text-gray-400">
                      Last scraped: {new Date(pin.lastSeen).toLocaleDateString()}
                    </p>
                  )}
                  <button
                    onClick={() => navigate(`/stores/${pin.id}`)}
                    className="mt-1.5 w-full text-xs font-medium text-center py-1 px-2 rounded"
                    style={{ background: "#00D4AA20", color: "#00D4AA" }}
                  >
                    View Store →
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}
