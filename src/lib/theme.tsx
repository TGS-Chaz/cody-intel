import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

export type ThemePreference = "light" | "dark" | "auto";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  preference: ThemePreference;
  theme: ResolvedTheme;
  setTheme: (t: ThemePreference) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveAutoTheme(): ResolvedTheme {
  const hour = new Date().getHours();
  if (hour >= 21 || hour < 6) return "dark";
  if (hour < 19) return "light";
  return "dark";
}

function applyDuskMode() {
  const hour = new Date().getHours();
  const root = document.documentElement;
  if (hour >= 17 && hour < 19) root.classList.add("dusk-warm");
  else root.classList.remove("dusk-warm");
  if (hour >= 19 && hour < 21) root.classList.add("dusk-transition");
  else root.classList.remove("dusk-transition");
}

function applyTheme(theme: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.add("theme-transition");
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  setTimeout(() => root.classList.remove("theme-transition"), 350);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    const stored = localStorage.getItem("cody-theme") as ThemePreference | null;
    if (stored === "light" || stored === "dark" || stored === "auto") return stored;
    return "light";
  });
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    preference === "auto" ? resolveAutoTheme() : preference
  );
  const [dbLoaded, setDbLoaded] = useState(false);

  const resolveTheme = useCallback(() => {
    const next = preference === "auto" ? resolveAutoTheme() : preference;
    setResolved(next);
    applyTheme(next);
    if (preference === "auto") applyDuskMode();
    else document.documentElement.classList.remove("dusk-warm", "dusk-transition");
  }, [preference]);

  useEffect(() => { resolveTheme(); }, [resolveTheme]);

  useEffect(() => {
    if (preference !== "auto") return;
    const interval = setInterval(resolveTheme, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [preference, resolveTheme]);

  // Sync with Supabase profiles table (same table as CRM — shared preference)
  useEffect(() => {
    if (!user || dbLoaded) return;
    supabase
      .from("profiles")
      .select("theme_preference")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.theme_preference) {
          const pref = data.theme_preference as ThemePreference;
          if (pref === "light" || pref === "dark" || pref === "auto") {
            setPreferenceState(pref);
            localStorage.setItem("cody-theme", pref);
          }
        }
        setDbLoaded(true);
      });
  }, [user, dbLoaded]);

  function setTheme(t: ThemePreference) {
    setPreferenceState(t);
    localStorage.setItem("cody-theme", t);
    if (user) {
      supabase.from("profiles").update({ theme_preference: t }).eq("id", user.id).then(() => {});
    }
  }

  function toggle() {
    const order: ThemePreference[] = ["light", "dark", "auto"];
    const idx = order.indexOf(preference);
    setTheme(order[(idx + 1) % order.length]);
  }

  return (
    <ThemeContext.Provider value={{ preference, theme: resolved, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
