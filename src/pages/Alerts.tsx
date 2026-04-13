import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, Zap, AlertTriangle, Info, AlertCircle, Check, Filter,
  RefreshCw, TrendingDown, TrendingUp, Package, Tag, X, Download,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { exportCSV } from "@/lib/export-csv";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Alert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  body: string;
  brand_name: string | null;
  product_name: string | null;
  details: Record<string, any> | null;
  intel_store_id: string | null;
  action_suggestion: string | null;
  is_read: boolean;
  created_at: string;
}

const ALERT_TYPE_LABELS: Record<string, string> = {
  brand_removed: "Brand Removed",
  brand_added: "Brand Added",
  stock_out: "Stock-out",
  price_change: "Price Change",
  new_product: "New Product",
};

const ALERT_TYPES = ["all", "brand_removed", "brand_added", "stock_out", "price_change", "new_product"];
const SEVERITIES = ["all", "urgent", "warning", "info"];

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    urgent: "bg-red-500/10 text-red-500 border-red-500/20",
    warning: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    info: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  };
  const icons: Record<string, typeof Zap> = {
    urgent: Zap,
    warning: AlertTriangle,
    info: Info,
  };
  const Icon = icons[severity] ?? AlertCircle;
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${styles[severity] ?? styles.info}`}>
      <Icon className="w-2.5 h-2.5" />
      {severity}
    </span>
  );
}

function AlertTypeIcon({ type }: { type: string }) {
  const className = "w-3.5 h-3.5 shrink-0";
  switch (type) {
    case "brand_removed": return <TrendingDown className={`${className} text-red-500`} />;
    case "brand_added": return <TrendingUp className={`${className} text-green-500`} />;
    case "stock_out": return <Package className={`${className} text-amber-500`} />;
    case "price_change": return <Tag className={`${className} text-blue-500`} />;
    default: return <Bell className={`${className} text-muted-foreground`} />;
  }
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function Alerts() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("intel_alerts")
      .select("id, alert_type, severity, title, body, brand_name, product_name, details, intel_store_id, action_suggestion, is_read, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    setAlerts((data ?? []) as Alert[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, [user?.id]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase.channel("alerts-page")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "intel_alerts" },
        (payload) => setAlerts((prev) => [payload.new as Alert, ...prev]))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function markRead(id: string) {
    await supabase.from("intel_alerts").update({ is_read: true }).eq("id", id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  async function markAllRead() {
    setMarkingAll(true);
    const unread = alerts.filter((a) => !a.is_read).map((a) => a.id);
    if (unread.length) {
      await supabase.from("intel_alerts").update({ is_read: true }).in("id", unread);
      setAlerts((prev) => prev.filter((a) => a.is_read));
    }
    setMarkingAll(false);
  }

  async function clearAll() {
    setClearingAll(true);
    const ids = filtered.map((a) => a.id);
    if (ids.length) {
      await supabase.from("intel_alerts").delete().in("id", ids);
      setAlerts((prev) => prev.filter((a) => !ids.includes(a.id)));
    }
    setClearingAll(false);
  }

  async function dismiss(id: string) {
    await supabase.from("intel_alerts").delete().eq("id", id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  const filtered = alerts.filter((a) => {
    if (filterType !== "all" && a.alert_type !== filterType) return false;
    if (filterSeverity !== "all" && a.severity !== filterSeverity) return false;
    if (showUnreadOnly && a.is_read) return false;
    return true;
  });

  const unreadCount = alerts.filter((a) => !a.is_read).length;
  const urgentCount = alerts.filter((a) => a.severity === "urgent" && !a.is_read).length;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
              <Bell className="w-6 h-6 text-primary" />
              Alerts
              {unreadCount > 0 && (
                <span className="text-sm font-semibold px-2 py-0.5 rounded-full bg-destructive text-white">
                  {unreadCount}
                </span>
              )}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Stock-outs, brand changes, price movements — detected automatically
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => exportCSV("intel-alerts.csv", filtered.map(a => ({
                Date: new Date(a.created_at).toLocaleDateString(),
                Type: a.alert_type,
                Severity: a.severity,
                Title: a.title,
                Body: a.body ?? "",
                Brand: a.brand_name ?? "",
                Product: a.product_name ?? "",
              })))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                disabled={markingAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
            {filtered.length > 0 && (
              <button
                onClick={clearAll}
                disabled={clearingAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Clear All
              </button>
            )}
          </div>
        </div>
        <div className="header-underline mt-3" />
      </div>

      {/* Urgent banner */}
      {urgentCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-4 rounded-xl border"
          style={{ background: "hsl(0 80% 50% / 0.08)", borderColor: "hsl(0 80% 50% / 0.25)" }}
        >
          <Zap className="w-5 h-5 text-red-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-500">{urgentCount} critical alert{urgentCount > 1 ? "s" : ""} require your attention</p>
            <p className="text-xs text-muted-foreground mt-0.5">Your brands may have been removed from store menus</p>
          </div>
          <button onClick={() => setFilterSeverity("urgent")} className="text-xs text-red-500 hover:text-red-400 font-medium">
            View critical →
          </button>
        </motion.div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />

        {/* Type filter */}
        <div className="flex items-center gap-1 flex-wrap">
          {ALERT_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                filterType === t
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "all" ? "All Types" : ALERT_TYPE_LABELS[t] ?? t}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-border" />

        {/* Severity filter */}
        <div className="flex items-center gap-1">
          {SEVERITIES.map((s) => (
            <button
              key={s}
              onClick={() => setFilterSeverity(s)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors capitalize ${
                filterSeverity === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "all" ? "All Severity" : s}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <button
          onClick={() => setShowUnreadOnly(!showUnreadOnly)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
            showUnreadOnly ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          Unread only
        </button>
      </div>

      {/* Alert list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Bell className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-medium">No alerts match your filters</p>
          <p className="text-xs text-muted-foreground mt-1">Alerts are generated automatically after each scrape</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {filtered.map((alert) => (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className={`relative group flex items-start gap-3 p-4 rounded-xl border transition-colors ${
                  !alert.is_read
                    ? "border-primary/20 bg-primary/[0.02]"
                    : "border-border bg-card/40"
                }`}
              >
                {/* Unread dot */}
                {!alert.is_read && (
                  <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-primary" />
                )}

                <AlertTypeIcon type={alert.alert_type} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-[13px] leading-snug ${!alert.is_read ? "font-semibold text-foreground" : "font-medium text-foreground/80"}`}>
                      {alert.title}
                    </p>
                    <SeverityBadge severity={alert.severity} />
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-medium">
                      {ALERT_TYPE_LABELS[alert.alert_type] ?? alert.alert_type}
                    </span>
                  </div>

                  {alert.body && (
                    <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">{alert.body}</p>
                  )}

                  {alert.action_suggestion && (
                    <p className="text-[11px] text-primary/70 mt-1.5 font-medium">
                      → {alert.action_suggestion}
                    </p>
                  )}

                  {/* Detail pills */}
                  {alert.details && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {alert.details.old_price != null && alert.details.new_price != null && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                          ${Number(alert.details.old_price).toFixed(2)} → ${Number(alert.details.new_price).toFixed(2)}
                          {alert.details.pct_change != null && ` (${alert.details.pct_change > 0 ? "+" : ""}${alert.details.pct_change}%)`}
                        </span>
                      )}
                      {alert.details.city && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                          📍 {alert.details.city}
                        </span>
                      )}
                    </div>
                  )}

                  <p className="text-[10px] text-muted-foreground/50 mt-2">{timeAgo(alert.created_at)}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {!alert.is_read && (
                    <button
                      onClick={() => markRead(alert.id)}
                      className="p-1 rounded text-muted-foreground hover:text-primary transition-colors"
                      title="Mark read"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => dismiss(alert.id)}
                    className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
                    title="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
