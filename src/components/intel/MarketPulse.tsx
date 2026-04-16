import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Info, AlertTriangle, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import CodyGlow from "@/components/CodyGlow";
import IntelCard from "./IntelCard";
import AnimatedNumber from "./AnimatedNumber";
import codyIcon from "@/assets/cody-icon.svg";

interface Stats {
  dispensaries: number;
  products: number;
  brands: number;
  alerts: number;
}

interface Alert {
  id: string;
  severity: string;
  title: string;
  body: string;
  action_suggestion: string | null;
  created_at: string;
}

const SEVERITY_ICON: Record<string, { icon: typeof Info; color: string }> = {
  info:    { icon: Info, color: "hsl(var(--info))" },
  warning: { icon: AlertTriangle, color: "hsl(var(--warning))" },
  urgent:  { icon: Zap, color: "hsl(var(--destructive))" },
};

export default function MarketPulse() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ dispensaries: 0, products: 0, brands: 0, alerts: 0 });
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const uid = user.id;
    async function load() {
      const [dispRes, prodRes, brandRes, alertCountRes, alertsRes] = await Promise.all([
        supabase.from("dispensary_menus").select("dispensary_id", { count: "exact", head: true }),
        supabase.from("menu_items").select("id", { count: "exact", head: true }).eq("is_on_menu", true),
        supabase.from("market_brands").select("id", { count: "exact", head: true }),
        supabase.from("intel_alerts").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("is_read", false),
        supabase.from("intel_alerts").select("id, severity, title, body, action_suggestion, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(5),
      ]);
      setStats({
        dispensaries: dispRes.count ?? 0,
        products: prodRes.count ?? 0,
        brands: brandRes.count ?? 0,
        alerts: alertCountRes.count ?? 0,
      });
      setAlerts(alertsRes.data ?? []);
      setLoading(false);
    }
    load();
  }, [user]);

  const statCards = [
    { label: "Dispensaries Tracked", value: stats.dispensaries },
    { label: "Products Monitored",   value: stats.products },
    { label: "Brands Tracked",       value: stats.brands },
    { label: "Active Alerts",        value: stats.alerts },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      className="rounded-xl border border-chart-brand-b/15 bg-card overflow-hidden mb-5 relative"
      style={{ boxShadow: "inset 0 1px 0 var(--glass-bg)" }}
    >
      {/* Header */}
      <div className="relative px-4 py-3 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--glass-border-subtle)" }}>
        <div className="flex items-center gap-2">
          <CodyGlow intensity="subtle" size="sm">
            <img src={codyIcon} alt="" className="w-4 h-4" style={{ filter: "brightness(3) saturate(0.1)" }} />
          </CodyGlow>
          <div>
            <h2 className="text-[13px] font-semibold text-foreground">Market Intelligence</h2>
            <div className="h-[2px] w-16 mt-0.5 rounded-full" style={{ background: "linear-gradient(90deg, hsl(var(--chart-brand-b)), hsl(var(--chart-brand-b) / 0.7))" }} />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-chart-brand-b opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-chart-brand-b" />
          </span>
          <span className="text-[10px] font-medium text-chart-brand-b">Live</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-3 p-4">
        {statCards.map((s, i) => (
          <IntelCard key={s.label}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className="rounded-lg p-3 text-center"
              style={{
                background: "rgba(255,255,255,0.03)",
                backdropFilter: "blur(8px)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              <p className="text-2xl font-bold text-foreground">
                {loading ? "..." : <AnimatedNumber value={s.value} />}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">{s.label}</p>
            </motion.div>
          </IntelCard>
        ))}
      </div>

      {/* Intelligence Feed */}
      <div className="relative px-4 pb-4">
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Intelligence Feed
        </h3>
        {alerts.length > 0 ? (
          <div className="space-y-2">
            {alerts.map((a) => {
              const sev = SEVERITY_ICON[a.severity] ?? SEVERITY_ICON.info;
              const Icon = sev.icon;
              return (
                <div key={a.id}
                  className="flex items-start gap-3 rounded-lg p-3"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--glass-border-subtle)" }}>
                  <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: sev.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-foreground">{a.title}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{a.body}</p>
                    <p className="text-[9px] text-muted-foreground mt-1">
                      {new Date(a.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </p>
                  </div>
                  {a.action_suggestion && (
                    <button className="text-[10px] text-primary hover:text-primary/80 font-medium shrink-0">
                      {a.action_suggestion}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6 rounded-lg"
            style={{ border: "1px solid hsl(var(--chart-brand-b) / 0.15)", background: "hsl(var(--chart-brand-b) / 0.02)" }}>
            <CodyGlow intensity="subtle" size="sm">
              <img src={codyIcon} alt="" className="w-8 h-8 mx-auto mb-2" style={{ filter: "brightness(3) saturate(0.1)" }} />
            </CodyGlow>
            <p className="text-[12px] text-muted-foreground leading-relaxed max-w-xs mx-auto mt-2">
              Market intelligence is warming up. Alerts will appear here as dispensary data is collected.
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
