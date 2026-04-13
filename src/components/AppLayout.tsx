import { useState, useEffect } from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, LayoutGroup } from "framer-motion";
import {
  LayoutDashboard,
  Store,
  Radio,
  BarChart2,
  TrendingUp,
  Settings,
  LogOut,
  Sun,
  Moon,
  Sunset,
  Building2,
  Sparkles,
  Bell,
  Globe,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useProfile, profileInitials } from "@/lib/profile";
import { useTheme } from "@/lib/theme";
import { useOrg } from "@/lib/org";
import codyIcon from "@/assets/cody-icon.svg";
import CodyGlow from "@/components/CodyGlow";
import UserAvatar from "@/components/UserAvatar";
import NotificationsCenter from "@/components/NotificationsCenter";

const navItems = [
  { to: "/",          icon: LayoutDashboard, label: "Dashboard",  end: true },
  { to: "/stores",    icon: Store,           label: "Stores" },
  { to: "/scrapers",  icon: Radio,           label: "Scrapers" },
  { to: "/reports",   icon: BarChart2,       label: "Reports" },
  { to: "/trends",    icon: TrendingUp,      label: "Trends" },
  { to: "/alerts",    icon: Bell,            label: "Alerts" },
  { to: "/widget",    icon: Globe,           label: "Widget" },
  { to: "/settings",  icon: Settings,        label: "Settings" },
];

function LiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeStr = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="text-right">
      <p className="text-[13px] font-semibold tabular-nums text-foreground/80 leading-tight">{timeStr}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-tight">{dateStr}</p>
    </div>
  );
}

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { profile } = useProfile();
  const { preference, toggle: toggleTheme } = useTheme();
  const { org } = useOrg();
  const [_signingOut, setSigningOut] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  useEffect(() => {
    supabase.from("intel_alerts").select("id", { count: "exact", head: true })
      .eq("is_read", false)
      .then(({ count }) => setUnreadAlerts(count ?? 0));

    const ch = supabase.channel("layout-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "intel_alerts" }, () => {
        supabase.from("intel_alerts").select("id", { count: "exact", head: true })
          .eq("is_read", false)
          .then(({ count }) => setUnreadAlerts(count ?? 0));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    navigate("/login", { replace: true });
  };

  const initials = profileInitials(profile, user?.email);

  const ThemeIcon =
    preference === "light" ? Sun :
    preference === "dark"  ? Moon : Sunset;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">

      {/* Desktop Sidebar */}
      <aside
        className="hidden md:flex flex-col w-56 shrink-0"
        style={{
          background: "hsl(var(--sidebar-background))",
          borderRight: "1px solid var(--glass-border)",
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-1 px-4 h-14"
          style={{ borderBottom: "1px solid var(--glass-border-subtle)" }}
        >
          <CodyGlow intensity="medium" size="md">
            <img src={codyIcon} alt="" className="h-6 w-auto shrink-0" style={{ filter: "brightness(3) saturate(0.1)" }} />
          </CodyGlow>
          <div className="flex items-baseline" style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1 }}>
            <span style={{ color: "hsl(var(--primary))" }}>c</span>
            <span className="text-foreground">ody</span>
            <span
              className="ml-1 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm self-center"
              style={{ background: "hsl(168 100% 42% / 0.12)", color: "hsl(168 100% 42%)" }}
            >
              intel
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 pt-4 overflow-y-auto space-y-0.5">
          <div className="px-3 pb-1">
            <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
              Intelligence
            </span>
          </div>
          <LayoutGroup>
            {navItems.map(({ to, icon: Icon, label, end }) => {
              const isActive =
                end
                  ? location.pathname === to
                  : location.pathname === to || location.pathname.startsWith(to + "/");
              return (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={`relative flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[12px] transition-all duration-150 ${
                    isActive
                      ? "font-medium bg-accent text-foreground"
                      : "text-sidebar-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active-indicator"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-primary"
                      transition={{ type: "spring", stiffness: 500, damping: 35 }}
                    />
                  )}
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 transition-colors duration-150 ${
                      isActive ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  <span className="flex-1">{label}</span>
                  {to === "/alerts" && unreadAlerts > 0 && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-destructive text-white leading-none">
                      {unreadAlerts > 99 ? "99+" : unreadAlerts}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </LayoutGroup>
        </nav>

        {/* Ask Cody button */}
        <div className="px-3 pb-2">
          <button
            onClick={() => navigate("/ask")}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[12px] font-medium transition-all duration-150 hover:bg-primary/10 text-muted-foreground hover:text-primary"
            style={{
              background: location.pathname === "/ask"
                ? "hsl(168 100% 42% / 0.12)"
                : "hsl(168 100% 42% / 0.05)",
              border: location.pathname === "/ask"
                ? "1px solid hsl(168 100% 42% / 0.35)"
                : "1px solid hsl(168 100% 42% / 0.12)",
              color: location.pathname === "/ask" ? "hsl(168 100% 42%)" : undefined,
            }}
          >
            <img src={codyIcon} alt="" className="w-4 h-4 shrink-0" style={{ filter: "invert(67%) sepia(99%) saturate(401%) hue-rotate(127deg) brightness(97%) contrast(101%)" }} />
            <span>Ask Cody</span>
            <Sparkles className="w-3 h-3 ml-auto text-primary/50" />
          </button>
        </div>

        {/* Bottom — user + sign out */}
        <div className="p-3" style={{ borderTop: "1px solid var(--glass-border)" }}>
          {user && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md">
              <UserAvatar
                avatarUrl={profile?.avatar_url}
                initials={initials}
                size={28}
                animated={false}
              />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[11px] font-medium text-foreground/80 truncate leading-tight">
                  {profile?.full_name ?? user.email?.split("@")[0]}
                </span>
                <span className="text-[10px] text-muted-foreground truncate leading-tight">
                  {user.email}
                </span>
              </div>
              <NotificationsCenter />
              <button
                onClick={handleSignOut}
                className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-center justify-end px-2 mt-1">
            <button
              onClick={toggleTheme}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title={
                preference === "light" ? "Light mode" :
                preference === "dark"  ? "Dark mode" : "Auto (time-based)"
              }
            >
              <ThemeIcon className={`w-3.5 h-3.5 ${preference === "auto" ? "text-primary" : ""}`} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Desktop top bar */}
        <div
          className="hidden md:flex items-center justify-between px-6 h-11 shrink-0"
          style={{ borderBottom: "1px solid var(--glass-border-subtle)" }}
        >
          <div>{/* left side — empty for now */}</div>
          <div className="flex items-center gap-4">
            <LiveClock />
            {org && (
              <div className="flex items-center gap-2.5">
                <p className="text-[11px] text-muted-foreground font-medium">{org.name}</p>
                {org.logo_url ? (
                  <img src={org.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover border border-border" />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center border border-border">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Mobile header */}
        <header
          className="md:hidden flex items-center px-4 h-12 gap-2"
          style={{
            background: "hsl(var(--sidebar-background))",
            borderBottom: "1px solid var(--glass-border)",
          }}
        >
          <img src={codyIcon} alt="" className="h-5 w-auto shrink-0" />
          <div
            className="flex items-baseline ml-1"
            style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1 }}
          >
            <span style={{ color: "hsl(var(--primary))" }}>c</span>
            <span className="text-foreground">ody</span>
          </div>
          <span
            className="ml-1 text-[9px] font-bold uppercase tracking-widest px-1 py-0.5 rounded-sm"
            style={{ background: "hsl(168 100% 42% / 0.12)", color: "hsl(168 100% 42%)" }}
          >
            intel
          </span>
          <div className="flex-1" />
          {org?.logo_url && (
            <img src={org.logo_url} alt="" className="w-7 h-7 rounded-md object-cover border border-border mr-1" />
          )}
          {user && (
            <UserAvatar
              avatarUrl={profile?.avatar_url}
              initials={initials}
              size={28}
              animated={false}
            />
          )}
        </header>

        <div className="flex-1 overflow-auto pb-20 md:pb-0 dot-grid">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Mobile bottom tab bar */}
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 flex items-center justify-around h-14 z-50"
          style={{
            background: "hsl(var(--sidebar-background))",
            borderTop: "1px solid var(--glass-border)",
          }}
        >
          {navItems.map(({ to, icon: Icon, label, end }) => {
            const isActive =
              end
                ? location.pathname === to
                : location.pathname === to || location.pathname.startsWith(to + "/");
            return (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-medium transition-colors duration-150 ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="w-[18px] h-[18px]" />
                <span>{label}</span>
              </NavLink>
            );
          })}
          <NavLink
            to="/ask"
            className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-medium transition-colors duration-150 ${
              location.pathname === "/ask" ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <img src={codyIcon} alt="" className="w-[18px] h-[18px]" style={{ filter: "invert(67%) sepia(99%) saturate(401%) hue-rotate(127deg) brightness(97%) contrast(101%)" }} />
            <span>Ask Cody</span>
          </NavLink>
        </nav>
      </main>
    </div>
  );
}
