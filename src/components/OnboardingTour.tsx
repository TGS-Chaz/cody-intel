import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, ArrowRight, Check, Package, Users2, LayoutDashboard, HelpCircle } from "lucide-react";

const STORAGE_KEY = "cody-intel-tour-completed";
const STORAGE_DISMISSED = "cody-intel-tour-dismissed";

interface Step {
  icon:    typeof Package;
  title:   string;
  body:    string;
  cta:     string;
  target?: string;
}

const STEPS: Step[] = [
  {
    icon:  Sparkles,
    title: "Welcome to Cody Intel",
    body:  "Cody Intel tracks where your products are stocked across the cannabis market. Let's get you oriented in under a minute.",
    cta:   "Let's go",
  },
  {
    icon:  Package,
    title: "Step 1 · Your Products",
    body:  "My Products is your catalog of brands and SKUs. Every matching engine, alert and report is built off this catalog.",
    cta:   "Open My Products",
    target: "/my-products",
  },
  {
    icon:  Users2,
    title: "Step 2 · Pick your competitors",
    body:  "Settings lets you flag which market brands you compete with. This drives overlap analysis, gap reports, and the competitor map.",
    cta:   "Go to Settings",
    target: "/settings",
  },
  {
    icon:  LayoutDashboard,
    title: "Step 3 · Read the Dashboard",
    body:  "The Dashboard shows your distribution footprint, weighted vs numeric reach, and the market map. New scrapes appear here first.",
    cta:   "Explore Dashboard",
    target: "/",
  },
  {
    icon:  Check,
    title: "You're set.",
    body:  "Tap the Help icon in the sidebar anytime to reopen this tour. Happy selling.",
    cta:   "Finish",
  },
];

export function OnboardingTour() {
  const navigate = useNavigate();
  const [open, setOpen]   = useState(false);
  const [step, setStep]   = useState(0);

  useEffect(() => {
    const done      = localStorage.getItem(STORAGE_KEY);
    const dismissed = localStorage.getItem(STORAGE_DISMISSED);
    if (!done && !dismissed) setOpen(true);
  }, []);

  const close = useCallback(() => {
    localStorage.setItem(STORAGE_DISMISSED, "1");
    setOpen(false);
  }, []);

  const next = useCallback(() => {
    const s = STEPS[step];
    if (s.target) navigate(s.target);
    if (step < STEPS.length - 1) setStep(step + 1);
    else {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
      setOpen(false);
    }
  }, [step, navigate]);

  const start = useCallback(() => {
    localStorage.removeItem(STORAGE_DISMISSED);
    setStep(0);
    setOpen(true);
  }, []);

  if (!open) {
    return (
      <button
        onClick={start}
        title="Replay tour"
        className="fixed bottom-4 right-4 z-40 p-2.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors"
      >
        <HelpCircle className="w-4 h-4" />
      </button>
    );
  }

  const s = STEPS[step];
  const Icon = s.icon;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
      >
        <motion.div
          key={step}
          initial={{ scale: 0.92, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 28 }}
          className="w-full max-w-md rounded-2xl border border-border bg-card overflow-hidden shadow-2xl"
        >
          <div
            className="px-6 pt-6 pb-5 relative"
            style={{ background: "radial-gradient(circle at top left, hsl(168 100% 42% / 0.12), transparent 60%)" }}
          >
            <button
              onClick={close}
              className="absolute top-3 right-3 p-1 rounded text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ background: "hsl(168 100% 42% / 0.14)" }}>
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">{s.title}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
          </div>

          <div className="px-6 py-4 border-t border-border flex items-center justify-between">
            <div className="flex gap-1">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className="block w-5 h-1 rounded-full transition-colors"
                  style={{
                    background: i <= step ? "hsl(168 100% 42%)" : "hsl(var(--border))",
                  }}
                />
              ))}
            </div>
            <div className="flex gap-2">
              {step > 0 && step < STEPS.length - 1 && (
                <button
                  onClick={() => setStep(step - 1)}
                  className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Back
                </button>
              )}
              <button
                onClick={next}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {s.cta}
                {step < STEPS.length - 1 && <ArrowRight className="w-3 h-3" />}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
