import L from "leaflet";

// ── Pin colours ───────────────────────────────────────────────────────────────
export const PIN = {
  myStore:   "#10b981", // emerald – carries my brand
  gap:       "#ef4444", // red     – gap / opportunity
  stockRisk: "#f59e0b", // amber   – stock-out risk
  noData:    "#6b7280", // gray    – no menu data yet
  overlap:   "#eab308", // yellow  – both brands present
  competitor:"#ef4444", // red     – competitor only
  closed:    "#374151", // dark    – closed
} as const;

// ── Create a coloured circle DivIcon ─────────────────────────────────────────
export function pinIcon(color: string, products = 0) {
  const raw = 16 + Math.min(Math.sqrt(Math.max(0, products) / 15) * 8, 20);
  const size = Math.round(raw);
  return L.divIcon({
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${color};
      border:2px solid rgba(255,255,255,0.85);
      border-radius:50%;
      box-shadow:0 2px 6px rgba(0,0,0,.35)
    "></div>`,
    className: "",
    iconSize:   [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 2],
  });
}

// ── WA State map defaults ─────────────────────────────────────────────────────
export const WA_CENTER: [number, number] = [47.4, -120.5];
export const WA_ZOOM   = 7;
export const WA_BOUNDS: [[number, number], [number, number]] = [
  [45.54, -124.73],
  [49.00, -116.92],
];

// ── Tile URLs (CartoDB — no API key needed) ───────────────────────────────────
export const TILE_LIGHT =
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
export const TILE_DARK =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

// ── Dark-mode detection hook ──────────────────────────────────────────────────
import { useState, useEffect } from "react";
export function useDarkTiles() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains("dark"))
    );
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);
  return dark ? TILE_DARK : TILE_LIGHT;
}
