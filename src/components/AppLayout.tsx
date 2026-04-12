import { useState } from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, LayoutGroup } from "framer-motion";
import {
  LayoutDashboard,
  Store,
  Radio,
  BarChart2,
  Settings,
  LogOut,
  Sun,
  Moon,
  Sunset,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useProfile, profileInitials } from "@/lib/profile";
import { useTheme } from "@/lib/theme";
import codyIcon from "@/assets/cody-icon.svg";
import CodyGlow from "@/components/CodyGlow";

const navItems = [
  { to: "/",          icon: LayoutDashboard, label: "Dashboard",  end: true },
  { to: "/stores",    icon: Store,           label: "Stores" },
  { to: "/scrapers",  icon: Radio,           label: "Scrapers" },
  { to: "/reports",   icon: BarChart2,       label: "Reports" },
  { to: "/settings",  icon: Settings,        label: "Settings" },
];

function UserAvatar({ initials, size = 24 }: { initials: string; size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold avatar-hover shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: "linear-gradient(135deg, hsl(168 100% 36%), hsl(168 100% 28%))",
      }}
    >
      {initials}
    </div>
  );
}

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { profile } = useProfile();
  const { preference, toggle: toggleTheme } = useTheme();
  const [_signingOut, setSigningOut] = useState(false);

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
                </NavLink>
              );
            })}
          </LayoutGroup>
        </nav>

        {/* Bottom — user + sign out */}
        <div className="p-3" style={{ borderTop: "1px solid var(--glass-border)" }}>
          {user && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md">
              <UserAvatar initials={initials} size={24} />
              <span className="text-[11px] text-foreground/70 truncate flex-1">
                {profile?.full_name ?? user.email}
              </span>
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
        </nav>
      </main>
    </div>
  );
}
