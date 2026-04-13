import { useState, useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { supabase } from "@/lib/supabase";
import { isExcludedBrand } from "@/lib/analytics-filters";
import { PIN, pinIcon, WA_CENTER, WA_ZOOM, WA_BOUNDS, TILE_ATTRIBUTION, useDarkTiles } from "./mapUtils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SnapshotProduct { b?: string }


interface StoreLocation {
  id: string;
  name: string;
  city: string | null;
  latitude: number;
  longitude: number;
  total_products: number;
}

type PinType = "own" | "competitor" | "overlap" | "neither";

interface MapPin {
  storeId: string;
  name: string;
  city: string | null;
  lat: number;
  lng: number;
  products: number;
  type: PinType;
  ownCount: number;
  compCount: number;
}

// ── PIN colours for this view ─────────────────────────────────────────────────

const TYPE_COLOR: Record<PinType, string> = {
  own:        PIN.myStore,
  competitor: PIN.gap,
  overlap:    PIN.overlap,
  neither:    PIN.noData,
};

const TYPE_LABEL: Record<PinType, string> = {
  own:        "Your Brand Only",
  competitor: "Competitor Only",
  overlap:    "Both Brands",
  neither:    "Neither Brand",
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  ownBrand:     string;
  compBrand:    string;
  snapshotByStore: Record<string, { product_data: SnapshotProduct[] }>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CompetitorMap({ ownBrand, compBrand, snapshotByStore }: Props) {
  const tileUrl = useDarkTiles();
  const [stores, setStores] = useState<StoreLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [vis, setVis] = useState<Record<PinType, boolean>>({
    own: true, competitor: true, overlap: true, neither: false,
  });

  useEffect(() => {
    supabase
      .from("intel_stores")
      .select("id, name, city, latitude, longitude, total_products")
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .then(({ data }) => {
        setStores((data ?? []) as StoreLocation[]);
        setLoading(false);
      });
  }, []);

  const pins = useMemo((): MapPin[] => {
    if (!ownBrand || !compBrand || stores.length === 0) return [];
    const ownLc  = ownBrand.toLowerCase();
    const compLc = compBrand.toLowerCase();

    return stores
      .filter((s) => s.latitude && s.longitude)
      .map((s) => {
        const snap = snapshotByStore[s.id];
        const products = snap ? (snap.product_data ?? []) : [];

        const ownCount = products.filter(
          (p) => p.b && p.b.toLowerCase() === ownLc && !isExcludedBrand(p.b)
        ).length;
        const compCount = products.filter(
          (p) => p.b && p.b.toLowerCase() === compLc && !isExcludedBrand(p.b)
        ).length;

        let type: PinType;
        if (ownCount > 0 && compCount > 0) type = "overlap";
        else if (ownCount > 0)              type = "own";
        else if (compCount > 0)             type = "competitor";
        else                                type = "neither";

        return {
          storeId: s.id,
          name: s.name,
          city: s.city,
          lat: s.latitude,
          lng: s.longitude,
          products: s.total_products ?? 0,
          type,
          ownCount,
          compCount,
        };
      });
  }, [stores, ownBrand, compBrand, snapshotByStore]);

  const counts = useMemo(() => ({
    own:        pins.filter((p) => p.type === "own").length,
    competitor: pins.filter((p) => p.type === "competitor").length,
    overlap:    pins.filter((p) => p.type === "overlap").length,
    neither:    pins.filter((p) => p.type === "neither").length,
  }), [pins]);

  const visible = useMemo(() => pins.filter((p) => vis[p.type]), [pins, vis]);

  if (!ownBrand || !compBrand) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
        Select both brands above to view the competitive map.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      {/* Legend / toggles */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-sidebar flex-wrap">
        {(["own","competitor","overlap","neither"] as PinType[]).map((key) => (
          <button
            key={key}
            onClick={() => setVis((v) => ({ ...v, [key]: !v[key] }))}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
              vis[key]
                ? "border-border bg-card text-foreground"
                : "border-transparent bg-muted/30 text-muted-foreground opacity-50"
            }`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: TYPE_COLOR[key] }}
            />
            {TYPE_LABEL[key]} ({counts[key]})
          </button>
        ))}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {visible.length} stores
        </span>
      </div>

      {loading ? (
        <div className="h-[400px] flex items-center justify-center">
          <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : (
        <MapContainer
          center={WA_CENTER}
          zoom={WA_ZOOM}
          bounds={WA_BOUNDS}
          style={{ height: 400, width: "100%" }}
          scrollWheelZoom
        >
          <TileLayer url={tileUrl} attribution={TILE_ATTRIBUTION} />
          <MarkerClusterGroup chunkedLoading maxClusterRadius={45}>
            {visible.map((pin) => (
              <Marker
                key={pin.storeId}
                position={[pin.lat, pin.lng]}
                icon={pinIcon(TYPE_COLOR[pin.type], pin.products)}
              >
                <Popup>
                  <div className="min-w-[180px] space-y-1.5 py-1">
                    <p className="font-semibold text-sm leading-tight">{pin.name}</p>
                    {pin.city && <p className="text-xs text-gray-500">{pin.city}</p>}
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="w-2 h-2 rounded-full" style={{ background: TYPE_COLOR[pin.type] }} />
                      {TYPE_LABEL[pin.type]}
                    </div>
                    {(pin.ownCount > 0 || pin.compCount > 0) && (
                      <div className="text-xs text-gray-500 space-y-0.5">
                        {pin.ownCount > 0 && (
                          <p style={{ color: PIN.myStore }}>
                            {ownBrand}: {pin.ownCount} SKU{pin.ownCount !== 1 ? "s" : ""}
                          </p>
                        )}
                        {pin.compCount > 0 && (
                          <p style={{ color: PIN.gap }}>
                            {compBrand}: {pin.compCount} SKU{pin.compCount !== 1 ? "s" : ""}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        </MapContainer>
      )}
    </div>
  );
}
