import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import App from "./App.tsx";
import { SHARED_PROBE } from "./lib/cody-shared-probe";

if (import.meta.env.DEV) console.log("[cody-shared]", SHARED_PROBE);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
