import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { useNavigate } from "react-router-dom";
import type { IntelStore } from "@/lib/types";
import { PIN, pinIcon, WA_CENTER, WA_ZOOM, WA_BOUNDS, TILE_ATTRIBUTION, useDarkTiles } from "./mapUtils";

// ── Platform badges ───────────────────────────────────────────────────────────

const PLATFORM_COLORS: Record<string, string> = {
  "dutchie-api":  "#00D4AA",
  "leafly":       "#3BB143",
  "posabit-api":  "#5C6BC0",
  "weedmaps":     "#F7931A",
};

function platformDots(store: IntelStore) {
  const active: string[] = [];
  if (store.dutchie_slug)    active.push("D");
  if (store.leafly_slug)     active.push("L");
  if (store.posabit_feed_key) active.push("P");
  if (store.weedmaps_slug)   active.push("W");
  return active;
}

function storeColor(store: IntelStore) {
  if (store.status === "closed") return PIN.closed;
  if ((store.total_products ?? 0) > 0) return PIN.myStore;
  return PIN.noData;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  stores: IntelStore[];
  menuMap: Record<string, string[]>; // store_id → platform sources
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StoreMapView({ stores, menuMap }: Props) {
  const navigate = useNavigate();
  const tileUrl  = useDarkTiles();

  const geoStores = stores.filter(
    (s) => s.latitude != null && s.longitude != null
  );

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      {/* Map header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-sidebar">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Store Map · {geoStores.length} plotted
        </span>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: PIN.myStore }} />
            Has data
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: PIN.noData }} />
            No data
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: PIN.closed }} />
            Closed
          </span>
        </div>
      </div>

      <MapContainer
        center={WA_CENTER}
        zoom={WA_ZOOM}
        bounds={WA_BOUNDS}
        style={{ height: 520, width: "100%" }}
        scrollWheelZoom={true}
      >
        <TileLayer url={tileUrl} attribution={TILE_ATTRIBUTION} />
        <MarkerClusterGroup chunkedLoading maxClusterRadius={50}>
          {geoStores.map((store) => {
            const color    = storeColor(store);
            const products = store.total_products ?? 0;
            const dots     = platformDots(store);
            const sources  = menuMap[store.id] ?? [];

            return (
              <Marker
                key={store.id}
                position={[store.latitude!, store.longitude!]}
                icon={pinIcon(color, products)}
              >
                <Popup>
                  <div className="min-w-[190px] space-y-1.5 py-1">
                    <p className="font-semibold text-sm leading-tight">{store.name}</p>
                    {store.city && (
                      <p className="text-xs text-gray-500">
                        {store.city}{store.county ? `, ${store.county}` : ""}
                      </p>
                    )}

                    {/* Platform badges */}
                    {dots.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {["D","L","P","W"].map((letter, i) => {
                          const keys = ["dutchie-api","leafly","posabit-api","weedmaps"];
                          const present = dots.includes(letter);
                          const active = sources.includes(keys[i]);
                          return present ? (
                            <span
                              key={letter}
                              className="text-[9px] font-bold rounded px-1 py-0.5"
                              style={{
                                background: active ? PLATFORM_COLORS[keys[i]] + "30" : "#6b728020",
                                color: active ? PLATFORM_COLORS[keys[i]] : "#6b7280",
                                border: `1px solid ${active ? PLATFORM_COLORS[keys[i]] + "50" : "#6b728040"}`,
                              }}
                            >
                              {letter}
                            </span>
                          ) : null;
                        })}
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span
                        className="inline-block w-2 h-2 rounded-full shrink-0"
                        style={{ background: color }}
                      />
                      {store.status ?? "unknown"} ·{" "}
                      {products.toLocaleString()} products
                    </div>

                    <button
                      onClick={() => navigate(`/stores/${store.id}`)}
                      className="mt-1.5 w-full text-xs font-medium text-center py-1 px-2 rounded"
                      style={{ background: "#00D4AA20", color: "#00D4AA" }}
                    >
                      View Store →
                    </button>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}
