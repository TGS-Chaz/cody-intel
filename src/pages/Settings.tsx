import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/profile";
import { useTheme } from "@/lib/theme";
import { Sun, Moon, Sunset, User } from "lucide-react";

export function Settings() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { preference, setTheme } = useTheme();

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6 animate-fade-up">
      <div>
        <h1 className="text-foreground">Settings</h1>
        <div className="header-underline mt-1" />
        <p className="text-sm text-muted-foreground mt-1">Account and appearance preferences</p>
      </div>

      {/* Profile */}
      <div className="rounded-lg border border-border bg-card p-5 shadow-premium space-y-4">
        <h2 className="text-foreground flex items-center gap-2">
          <User className="w-4 h-4 text-primary" /> Profile
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between py-2 border-b border-border/50">
            <span className="text-muted-foreground">Email</span>
            <span className="text-foreground font-mono-data text-xs">{user?.email}</span>
          </div>
          {profile?.full_name && (
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <span className="text-muted-foreground">Name</span>
              <span className="text-foreground">{profile.full_name}</span>
            </div>
          )}
          {profile?.role && (
            <div className="flex items-center justify-between py-2">
              <span className="text-muted-foreground">Role</span>
              <span className="text-foreground">{profile.role}</span>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Manage your profile in Cody CRM — settings are shared between both apps.
        </p>
      </div>

      {/* Theme */}
      <div className="rounded-lg border border-border bg-card p-5 shadow-premium space-y-4">
        <h2 className="text-foreground">Appearance</h2>
        <p className="text-xs text-muted-foreground">
          Theme preference syncs with Cody CRM across both apps.
        </p>
        <div className="flex gap-2">
          {(["light", "dark", "auto"] as const).map((t) => {
            const Icon = t === "light" ? Sun : t === "dark" ? Moon : Sunset;
            const labels = { light: "Light", dark: "Dark", auto: "Auto (time-based)" };
            return (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border transition-all duration-150 ${
                  preference === t
                    ? "border-primary text-primary bg-primary/5"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {labels[t]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Data */}
      <div className="rounded-lg border border-border bg-card p-5 shadow-premium space-y-3">
        <h2 className="text-foreground">Data & Integrations</h2>
        <p className="text-sm text-muted-foreground">
          Scraper configuration, proxy settings, and API key management coming soon.
        </p>
      </div>
    </div>
  );
}
