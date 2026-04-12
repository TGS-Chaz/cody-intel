import { Settings2 } from "lucide-react";

export function Settings() {
  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Configuration and API keys</p>
      </div>
      <div className="rounded-lg border border-border bg-card p-8 flex flex-col items-center gap-3 text-center">
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
          <Settings2 className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">Settings coming soon</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Proxy configuration, API key management, and scrape schedule settings will be available here.
        </p>
      </div>
    </div>
  );
}
