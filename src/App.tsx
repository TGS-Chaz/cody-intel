import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { ProfileProvider } from "@/lib/profile";
import { OrgProvider } from "@/lib/org";
import IntelThemeProvider from "@/components/intel/IntelThemeProvider";
import AppLayout from "@/components/AppLayout";
import LoginPage from "@/pages/LoginPage";
import { Dashboard } from "@/pages/Dashboard";
import { StoreDirectory } from "@/pages/StoreDirectory";
import { StoreDetail } from "@/pages/StoreDetail";
import { ScraperAdmin } from "@/pages/ScraperAdmin";
import { Reports } from "@/pages/Reports";
import { AskCody } from "@/pages/AskCody";
import { Settings } from "@/pages/Settings";

function ProtectedRoutes() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  return (
    <ProfileProvider>
      <OrgProvider>
      <IntelThemeProvider>
      <ThemeProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="stores" element={<StoreDirectory />} />
            <Route path="stores/:id" element={<StoreDetail />} />
            <Route path="scrapers" element={<ScraperAdmin />} />
            <Route path="reports" element={<Reports />} />
            <Route path="ask" element={<AskCody />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </ThemeProvider>
      </IntelThemeProvider>
      </OrgProvider>
    </ProfileProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*" element={<ProtectedRoutes />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
