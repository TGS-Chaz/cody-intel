import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Check, AlertTriangle, AlertCircle, Info, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "react-router-dom";

interface Notification {
  id: string;
  title: string;
  body: string | null;
  type: string;
  read: boolean;
  link: string | null;
  created_at: string;
}

interface IntelAlert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  body: string | null;
  action_suggestion: string | null;
  action_type: string | null;
  is_read: boolean;
  created_at: string;
}

type UnifiedItem = {
  id: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
  source: "notification" | "intel_alert";
  severity?: string;
  link?: string | null;
  actionSuggestion?: string | null;
};

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function SeverityIcon({ severity }: { severity?: string }) {
  switch (severity) {
    case "urgent":
      return <Zap className="w-3 h-3 text-destructive shrink-0 mt-0.5" />;
    case "warning":
      return <AlertTriangle className="w-3 h-3 text-warning shrink-0 mt-0.5" />;
    case "info":
      return <Info className="w-3 h-3 text-info shrink-0 mt-0.5" />;
    default:
      return <AlertCircle className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />;
  }
}

export default function NotificationsCenter() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [alerts, setAlerts] = useState<IntelAlert[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.from("notifications").select("*")
      .order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => setNotifs((data ?? []) as Notification[]));

    if (user?.id) {
      supabase.from("intel_alerts")
        .select("id, alert_type, severity, title, body, action_suggestion, action_type, is_read, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20)
        .then(({ data }) => setAlerts((data ?? []) as IntelAlert[]));
    }

    const notifChannel = supabase.channel("intel-notifs")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          if (payload.new.user_id !== user?.id) return;
          setNotifs((prev) => [payload.new as Notification, ...prev]);
        })
      .subscribe();

    const alertChannel = supabase.channel("intel-alert-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "intel_alerts" },
        (payload) => {
          if (payload.new.user_id !== user?.id) return;
          setAlerts((prev) => [payload.new as IntelAlert, ...prev]);
        })
      .subscribe();

    return () => {
      supabase.removeChannel(notifChannel);
      supabase.removeChannel(alertChannel);
    };
  }, [user?.id]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const unified: UnifiedItem[] = [
    ...notifs.map((n): UnifiedItem => ({
      id: n.id, title: n.title, body: n.body, read: n.read,
      created_at: n.created_at, source: "notification", link: n.link,
    })),
    ...alerts.map((a): UnifiedItem => ({
      id: a.id, title: a.title, body: a.body, read: a.is_read,
      created_at: a.created_at, source: "intel_alert", severity: a.severity,
      actionSuggestion: a.action_suggestion,
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const unread = unified.filter((n) => !n.read).length;

  async function markItemRead(item: UnifiedItem) {
    if (item.source === "notification") {
      await supabase.from("notifications").update({ read: true }).eq("id", item.id);
      setNotifs((prev) => prev.map((n) => n.id === item.id ? { ...n, read: true } : n));
    } else {
      await supabase.from("intel_alerts").update({ is_read: true }).eq("id", item.id);
      setAlerts((prev) => prev.map((a) => a.id === item.id ? { ...a, is_read: true } : a));
    }
  }

  async function markAllRead() {
    const unreadNotifs = notifs.filter((n) => !n.read).map((n) => n.id);
    const unreadAlerts = alerts.filter((a) => !a.is_read).map((a) => a.id);
    if (unreadNotifs.length > 0) {
      await supabase.from("notifications").update({ read: true }).in("id", unreadNotifs);
      setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    }
    if (unreadAlerts.length > 0) {
      await supabase.from("intel_alerts").update({ is_read: true }).in("id", unreadAlerts);
      setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })));
    }
  }

  function handleItemClick(item: UnifiedItem) {
    if (!item.read) markItemRead(item);
    if (item.source === "notification" && item.link) {
      navigate(item.link);
      setOpen(false);
    } else if (item.source === "intel_alert") {
      navigate("/reports");
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative text-muted-foreground hover:text-foreground transition-colors p-1"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-destructive text-[8px] font-bold text-white flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 bottom-full mb-2 w-80 rounded-lg overflow-hidden z-50"
            style={{
              background: "hsl(var(--card))",
              border: "1px solid var(--glass-border)",
              boxShadow: "0 -8px 48px var(--shadow-color)",
            }}
          >
            <div className="flex items-center justify-between px-3 py-2.5"
              style={{ borderBottom: "1px solid var(--glass-border-subtle)" }}>
              <span className="text-[12px] font-semibold text-foreground">Notifications</span>
              {unread > 0 && (
                <button onClick={markAllRead}
                  className="text-[10px] text-primary hover:text-primary/80 font-medium flex items-center gap-1">
                  <Check className="w-2.5 h-2.5" /> Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {unified.length === 0 && (
                <div className="py-8 text-center text-[11px] text-muted-foreground">No notifications</div>
              )}
              {unified.map((item) => (
                <button
                  key={`${item.source}-${item.id}`}
                  onClick={() => handleItemClick(item)}
                  className={`w-full text-left px-3 py-2.5 transition-colors hover:bg-secondary/30 ${
                    !item.read ? "bg-primary/[0.03]" : ""
                  }`}
                  style={{ borderBottom: "1px solid var(--glass-bg)" }}
                >
                  <div className="flex items-start gap-2">
                    {item.source === "intel_alert" ? (
                      <SeverityIcon severity={item.severity} />
                    ) : (
                      !item.read && <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className={`text-[11px] truncate ${!item.read ? "font-semibold text-foreground" : "text-foreground/80"}`}>
                          {item.title}
                        </p>
                        {item.source === "intel_alert" && (
                          <span className="text-[8px] px-1 py-0.5 rounded bg-chart-brand-b/10 text-chart-brand-b font-medium shrink-0">
                            INTEL
                          </span>
                        )}
                      </div>
                      {item.body && <p className="text-[10px] text-muted-foreground truncate mt-0.5">{item.body}</p>}
                      {item.actionSuggestion && (
                        <p className="text-[9px] text-primary/70 mt-0.5 truncate">{item.actionSuggestion}</p>
                      )}
                    </div>
                    <span className="text-[9px] text-muted-foreground/50 shrink-0">{timeAgo(item.created_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
