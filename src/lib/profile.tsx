import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

export interface UserProfile {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: string | null;
  company: string | null;
  avatar_url: string | null;
}

interface ProfileContextValue {
  profile: UserProfile | null;
  loading: boolean;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setProfile(null); setLoading(false); return; }
    setLoading(true);
    // Phase 1j audit/47 fix A — supabase's query-builder thenable is typed
    // as PromiseLike<void>, which has no .catch(). Pass the rejection
    // handler as the 2nd arg so we still land on a rendered app-gate if
    // the network drops or the auth token races.
    supabase.from("profiles").select("*").eq("id", user.id).single()
      .then(
        ({ data }) => { setProfile(data ?? null); setLoading(false); },
        (err: unknown) => {
          console.warn("[profile] load failed:", err);
          setProfile(null);
          setLoading(false);
        },
      );
  }, [user?.id]);

  return (
    <ProfileContext.Provider value={{ profile, loading }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside ProfileProvider");
  return ctx;
}

export function profileInitials(profile: UserProfile | null, email?: string | null): string {
  if (profile?.full_name?.trim()) {
    const parts = profile.full_name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0][0].toUpperCase();
  }
  if (email) return email[0].toUpperCase();
  return "U";
}

export function profileDisplayName(profile: UserProfile | null, email?: string | null): string {
  if (profile?.full_name?.trim()) return profile.full_name.trim().split(/\s+/)[0];
  if (email) {
    const local = email.split("@")[0];
    return local.charAt(0).toUpperCase() + local.slice(1).toLowerCase();
  }
  return "User";
}
