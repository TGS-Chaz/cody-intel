import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { type Session, type User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => {
        setSession(data.session);
        setLoading(false);
      })
      .catch((err) => {
        // If getSession() rejects (network blip, etc.), the app's gate
        // spinner would otherwise hang forever. Land on "no session"
        // so the login screen renders and the user can retry.
        console.warn("[auth] getSession failed:", err);
        setSession(null);
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // Phase 1j audit/47 fix B — supabase-js auth refresh is scheduled via
    // setTimeout which browsers throttle in backgrounded tabs. When a tab
    // is hidden for longer than the JWT lifetime (default 1h), the timer
    // can fire late and the token expires before the refresh POST goes
    // out. Proactively refresh on tab visibility so subsequent queries
    // carry a fresh token.
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        supabase.auth.refreshSession().catch((err) => {
          console.warn("[auth] visibility-refresh failed:", err);
        });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
