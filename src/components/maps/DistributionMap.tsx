import { useState, useEffect, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import { supabase } from "@/lib/supabase";
import { isExcludedBrand } from "@/lib/analytics-filters";
import { WA_CENTER, WA_ZOOM, WA_BOUNDS, TILE_ATTRIBUTION, useDarkTiles } from "./mapUtils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StoreDot {
  id:         string;
  name:       string;
  city:       string | null;
  lat:        number;
  lng:        number;
  ownCount:   number;
  compCount:  number;
  totalCount: number;
}

interface SnapshotProduct { b?: string }

interface Props {
  ownBrand:        string;
  competitorBrand: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dotColor(own: number, comp: number): string {
  if (own > 0 && comp > 0) return "#eab308"; // yellow - overlap
  if (own > 0)             return "#10b981"; // green  - my brand
  if (comp > 0)            return "#ef4444"; // red    - competitor
  return "#6b7280";                           // gray   - neither
}

function dotRadius(count: number, max: number): number {
  if (max === 0) return 6;
  return 6 + (count / max) * 20;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DistributionMap({ ownBrand, competitorBrand }: Props) {
  const tileUrl = useDarkTiles();

  const [dots,    setDots]    = useState<StoreDot[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewBrand, setViewBrand] = useState<"own" | "competitor" | "both">("both");

  useEffect(() => {
    if (!ownBrand) return;
    let cancelled = false;
    setLoading(true);

    async function load() {
      const [storesRes, snapsRes] = await Promise.all([
        supabase
          .from("intel_stores")
          .select("id, name, city, latitude, longitude")
          .not("latitude", "is", null)
          .not("longitude", "is", null),
        supabase
          .from("menu_snapshots")
          .select("intel_store_id, product_data")
          .order("snapshot_date", { ascending: false })
          .limit(600),
      ]);
      if (cancelled) return;

      const ownLc  = ownBrand.toLowerCase();
      const compLc = competitorBrand?.toLowerCase() ?? "";

      // Most-recent snapshot per store
      const byStore: Record<string, SnapshotProduct[]> = {};
      for (const s of snapsRes.data ?? []) {
        if (!byStore[s.intel_store_id]) {
          byStore[s.intel_store_id] = s.product_data as SnapshotProduct[];
        }
      }

      const result: StoreDot[] = [];
      for (const store of storesRes.data ?? []) {
        if (!store.latitude || !store.longitude) continue;
        const products = byStore[store.id] ?? [];

        const ownCount  = products.filter(
          (p) => p.b && p.b.toLowerCase() === ownLc && !isExcludedBrand(p.b)
        ).length;
        const compCount = compLc
          ? products.filter(
              (p) => p.b && p.b.toLowerCase() === compLc && !isExcludedBrand(p.b)
            ).length
          : 0;

        if (ownCount > 0 || compCount > 0) {
          result.push({
            id:         store.id,
            name:       store.name,
            city:       store.city,
            lat:        store.latitude,
            lng:        store.longitude,
            ownCount,
            compCount,
            totalCount: ownCount + compCount,
          });
        }
      }

      setDots(result);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [ownBrand, competitorBrand]);

  const visible = useMemo(() => {
    return dots.filter((d) => {
      if (viewBrand === "own")        return d.ownCount > 0;
      if (viewBrand === "competitor") return d.compCount > 0;
      return d.ownCount > 0 || d.compCount > 0;
    });
  }, [dots, viewBrand]);

  const maxCount = useMemo(
    () => Math.max(1, ...visible.map((d) =>
      viewBrand === "competitor" ? d.compCount : d.ownCount > 0 ? d.ownCount : d.totalCount
    )),
    [visible, viewBrand]
  );

  if (!ownBrand) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
        Select a brand in the Brands tab to view distribution.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      {/* Controls */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-sidebar flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground shrink-0">
          Distribution Map
        </span>
        <div className="flex gap-1.5">
          {[
            { v: "own",        label: ownBrand || "My Brand",        color: "#10b981" },
            { v: "competitor", label: competitorBrand || "Competitor", color: "#ef4444" },
            { v: "both",       label: "Both",                          color: "#eab308" },
          ].map(({ v, label, color }) => (
            <button
              key={v}
              onClick={() => setViewBrand(v as "own" | "competitor" | "both")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                viewBrand === v
                  ? "border-border bg-card text-foreground"
                  : "border-transparent bg-muted/30 text-muted-foreground opacity-60"
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
              {label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {loading ? "Loading…" : `${visible.length} stores`}
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
          {visible.map((d) => {
            const displayCount =
              viewBrand === "competitor" ? d.compCount : d.ownCount || d.totalCount;
            return (
              <CircleMarker
                key={d.id}
                center={[d.lat, d.lng]}
                radius={dotRadius(displayCount, maxCount)}
                pathOptions={{
                  color:       dotColor(d.ownCount, d.compCount),
                  fillColor:   dotColor(d.ownCount, d.compCount),
                  fillOpacity: 0.65,
                  weight:      2,
                  opacity:     0.9,
                }}
              >
                <Popup>
                  <div className="min-w-[160px] space-y-1.5 py-1">
                    <p className="font-semibold text-sm leading-tight">{d.name}</p>
                    {d.city && <p className="text-xs text-gray-500">{d.city}</p>}
                    {d.ownCount > 0 && (
                      <p className="text-xs" style={{ color: "#10b981" }}>
                        {ownBrand}: {d.ownCount} SKU{d.ownCount !== 1 ? "s" : ""}
                      </p>
                    )}
                    {d.compCount > 0 && competitorBrand && (
                      <p className="text-xs" style={{ color: "#ef4444" }}>
                        {competitorBrand}: {d.compCount} SKU{d.compCount !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      )}
    </div>
  );
}
