import { useState, useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polygon, useMapEvents } from "react-leaflet";
import { supabase } from "@/lib/supabase";
import { PIN, pinIcon, WA_CENTER, WA_ZOOM, WA_BOUNDS, TILE_ATTRIBUTION, useDarkTiles } from "./mapUtils";
import { Pencil, X, Check, Trash2, Users, Package } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StoreGeo {
  id:             string;
  name:           string;
  city:           string | null;
  lat:            number;
  lng:            number;
  total_products: number;
}

interface Territory {
  id:         string;
  name:       string;
  rep:        string;
  color:      string;
  vertices:   [number, number][];
  storeCount: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TERRITORY_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4",
];

const STORAGE_KEY = "cody-intel-territories";

function loadTerritories(): Territory[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveTerritories(ts: Territory[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ts));
}

// Point-in-polygon (ray casting)
function pointInPolygon(pt: [number, number], poly: [number, number][]): boolean {
  const [px, py] = pt;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ── Drawing handler (inner component to access map events) ────────────────────

function DrawHandler({
  active,
  vertices,
  onVertex,
  onFinish,
}: {
  active:   boolean;
  vertices: [number, number][];
  onVertex: (ll: [number, number]) => void;
  onFinish: () => void;
}) {
  useMapEvents({
    click: (e) => {
      if (!active) return;
      onVertex([e.latlng.lat, e.latlng.lng]);
    },
    dblclick: (e) => {
      if (!active || vertices.length < 3) return;
      e.originalEvent.preventDefault();
      onFinish();
    },
  });
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TerritoryMap() {
  const tileUrl = useDarkTiles();

  const [stores,      setStores]      = useState<StoreGeo[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [territories, setTerritories] = useState<Territory[]>(loadTerritories);
  const [drawing,     setDrawing]     = useState(false);
  const [vertices,    setVertices]    = useState<[number, number][]>([]);
  const [newName,     setNewName]     = useState("New Territory");
  const [newRep,      setNewRep]      = useState("");
  const [colorIdx,    setColorIdx]    = useState(0);
  const [selected,    setSelected]    = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("intel_stores")
      .select("id, name, city, latitude, longitude, total_products")
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .then(({ data }) => {
        setStores((data ?? []).map((s) => ({ ...s, lat: s.latitude, lng: s.longitude })) as StoreGeo[]);
        setLoading(false);
      });
  }, []);

  // Recompute store counts for each territory
  const territoriesWithCounts = useMemo(() => {
    return territories.map((t) => ({
      ...t,
      storeCount: stores.filter((s) =>
        pointInPolygon([s.lat, s.lng], t.vertices)
      ).length,
    }));
  }, [territories, stores]);

  function addVertex(ll: [number, number]) {
    setVertices((prev) => [...prev, ll]);
  }

  function finishDrawing() {
    if (vertices.length < 3) return;
    const newT: Territory = {
      id:         crypto.randomUUID(),
      name:       newName || "Territory",
      rep:        newRep,
      color:      TERRITORY_COLORS[colorIdx % TERRITORY_COLORS.length],
      vertices,
      storeCount: 0,
    };
    const updated = [...territories, newT];
    setTerritories(updated);
    saveTerritories(updated);
    setVertices([]);
    setDrawing(false);
    setColorIdx((c) => c + 1);
    setNewName("New Territory");
    setNewRep("");
  }

  function deleteTerritory(id: string) {
    const updated = territories.filter((t) => t.id !== id);
    setTerritories(updated);
    saveTerritories(updated);
    if (selected === id) setSelected(null);
  }

  function cancelDraw() {
    setVertices([]);
    setDrawing(false);
  }

  const selectedTerritory = useMemo(
    () => territoriesWithCounts.find((t) => t.id === selected),
    [territoriesWithCounts, selected]
  );

  const storesInSelected = useMemo(() => {
    if (!selectedTerritory) return [];
    return stores.filter((s) =>
      pointInPolygon([s.lat, s.lng], selectedTerritory.vertices)
    );
  }, [selectedTerritory, stores]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {!drawing ? (
          <button
            onClick={() => setDrawing(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Draw Territory
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Territory name"
              className="px-2.5 py-1.5 rounded-md border border-border bg-card text-sm w-40 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <input
              value={newRep}
              onChange={(e) => setNewRep(e.target.value)}
              placeholder="Sales rep"
              className="px-2.5 py-1.5 rounded-md border border-border bg-card text-sm w-32 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="flex gap-1">
              {TERRITORY_COLORS.map((c, i) => (
                <button
                  key={c}
                  onClick={() => setColorIdx(i)}
                  className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    background: c,
                    borderColor: colorIdx === i ? "white" : "transparent",
                    boxShadow: colorIdx === i ? `0 0 0 2px ${c}` : "none",
                  }}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              {vertices.length} pts — click to add, double-click to finish
            </span>
            <button
              onClick={finishDrawing}
              disabled={vertices.length < 3}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-success/10 text-success hover:bg-success/20 disabled:opacity-40 transition-colors"
            >
              <Check className="w-3.5 h-3.5" /> Save
            </button>
            <button
              onClick={cancelDraw}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        {/* Map */}
        <div className="rounded-xl border border-border overflow-hidden">
          {loading ? (
            <div className="h-[480px] flex items-center justify-center">
              <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : (
            <MapContainer
              center={WA_CENTER}
              zoom={WA_ZOOM}
              bounds={WA_BOUNDS}
              style={{ height: 480, width: "100%", cursor: drawing ? "crosshair" : "grab" }}
              scrollWheelZoom
              doubleClickZoom={!drawing}
            >
              <TileLayer url={tileUrl} attribution={TILE_ATTRIBUTION} />
              <DrawHandler
                active={drawing}
                vertices={vertices}
                onVertex={addVertex}
                onFinish={finishDrawing}
              />

              {/* Saved territories */}
              {territoriesWithCounts.map((t) => (
                <Polygon
                  key={t.id}
                  positions={t.vertices}
                  pathOptions={{
                    color:       t.color,
                    fillColor:   t.color,
                    fillOpacity: selected === t.id ? 0.25 : 0.12,
                    weight:      selected === t.id ? 3 : 2,
                  }}
                  eventHandlers={{ click: () => setSelected(t.id === selected ? null : t.id) }}
                />
              ))}

              {/* In-progress drawing */}
              {vertices.length > 0 && (
                <Polygon
                  positions={vertices}
                  pathOptions={{
                    color:       TERRITORY_COLORS[colorIdx % TERRITORY_COLORS.length],
                    fillColor:   TERRITORY_COLORS[colorIdx % TERRITORY_COLORS.length],
                    fillOpacity: 0.15,
                    weight:      2,
                    dashArray:   "6 4",
                  }}
                />
              )}

              {/* Store markers */}
              {stores.map((s) => {
                const inSelected = selectedTerritory
                  ? pointInPolygon([s.lat, s.lng], selectedTerritory.vertices)
                  : false;
                return (
                  <Marker
                    key={s.id}
                    position={[s.lat, s.lng]}
                    icon={pinIcon(
                      inSelected ? PIN.myStore : PIN.noData,
                      s.total_products
                    )}
                  >
                    <Popup>
                      <div className="min-w-[150px] space-y-1 py-1">
                        <p className="font-semibold text-sm">{s.name}</p>
                        {s.city && <p className="text-xs text-muted-foreground">{s.city}</p>}
                        <p className="text-xs text-muted-foreground/70">
                          {s.total_products.toLocaleString()} products
                        </p>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          )}
        </div>

        {/* Territory list / detail panel */}
        <div className="space-y-3">
          {territoriesWithCounts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center">
              <Pencil className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No territories yet.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Click "Draw Territory" then click points on the map.
              </p>
            </div>
          ) : (
            territoriesWithCounts.map((t) => (
              <div
                key={t.id}
                onClick={() => setSelected(t.id === selected ? null : t.id)}
                className={`rounded-xl border p-3 cursor-pointer transition-all ${
                  selected === t.id
                    ? "border-primary/30 bg-primary/5"
                    : "border-border bg-card hover:border-border/80"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ background: t.color }}
                    />
                    <span className="text-sm font-medium text-foreground">{t.name}</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteTerritory(t.id); }}
                    className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                    style={{ opacity: selected === t.id ? 1 : undefined }}
                    title="Delete territory"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {t.rep && (
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                    <Users className="w-3 h-3" /> {t.rep}
                  </p>
                )}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Package className="w-3 h-3" /> {t.storeCount} stores
                  </span>
                </div>
              </div>
            ))
          )}

          {/* Selected territory detail */}
          {selectedTerritory && storesInSelected.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-3 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Stores in {selectedTerritory.name}
              </p>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {storesInSelected.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-xs py-0.5">
                    <span className="text-foreground truncate max-w-[160px]">{s.name}</span>
                    <span className="text-muted-foreground shrink-0 ml-2">
                      {s.total_products} SKUs
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
