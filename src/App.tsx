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
import { Alerts } from "@/pages/Alerts";
import { Trends } from "@/pages/Trends";
import { MyProducts } from "@/pages/MyProducts";
import StoreLocatorWidget from "@/pages/StoreLocatorWidget";
import { WidgetEmbed } from "@/pages/WidgetEmbed";
import { Competitors } from "@/pages/Competitors";
import { WeeklyBriefing } from "@/pages/WeeklyBriefing";
import { ApiDocs } from "@/pages/ApiDocs";
import { Territory } from "@/pages/Territory";
import { Pricing } from "@/pages/Pricing";
import { IndustryPulse } from "@/pages/IndustryPulse";

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
            <Route path="alerts" element={<Alerts />} />
            <Route path="trends" element={<Trends />} />
            <Route path="my-products" element={<MyProducts />} />
            <Route path="settings" element={<Settings />} />
            <Route path="widget" element={<WidgetEmbed />} />
            <Route path="competitors" element={<Competitors />} />
            <Route path="territory" element={<Territory />} />
            <Route path="pricing" element={<Pricing />} />
            <Route path="briefing" element={<WeeklyBriefing />} />
            <Route path="industry-pulse" element={<IndustryPulse />} />
            <Route path="api-docs" element={<ApiDocs />} />
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
          <Route path="/widget/store-locator" element={<StoreLocatorWidget />} />
          <Route path="/*" element={<ProtectedRoutes />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
