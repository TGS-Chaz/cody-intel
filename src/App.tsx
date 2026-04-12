import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./pages/Dashboard";
import { StoreDirectory } from "./pages/StoreDirectory";
import { StoreDetail } from "./pages/StoreDetail";
import { ScraperAdmin } from "./pages/ScraperAdmin";
import { Reports } from "./pages/Reports";
import { Settings } from "./pages/Settings";

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/stores" element={<StoreDirectory />} />
            <Route path="/stores/:id" element={<StoreDetail />} />
            <Route path="/scrapers" element={<ScraperAdmin />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
