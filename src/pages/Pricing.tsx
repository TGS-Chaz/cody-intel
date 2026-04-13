import { Check, Sparkles, Zap, Crown, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { PLANS, FEATURE_LABELS, usePlan, type PlanId, type FeatureKey } from "@/lib/plans";

interface TierCard {
  id:       PlanId;
  icon:     typeof Sparkles;
  accent:   string;
  badge?:   string;
}

const CARDS: TierCard[] = [
  { id: "starter",    icon: Sparkles, accent: "#3B82F6" },
  { id: "pro",        icon: Zap,      accent: "hsl(168 100% 42%)", badge: "Most Popular" },
  { id: "enterprise", icon: Crown,    accent: "#A78BFA" },
];

// All feature keys, grouped for the comparison table
const FEATURE_ROWS: { group: string; keys: FeatureKey[] }[] = [
  {
    group: "Your Brand",
    keys: ["my_products_catalog", "basic_distribution", "stock_out_alerts", "ask_cody_basic"],
  },
  {
    group: "Market Intel",
    keys: ["competitor_tracking", "gap_analysis", "price_comparison", "custom_alerts", "csv_exports", "store_tags", "ask_cody_pro"],
  },
  {
    group: "Enterprise Power",
    keys: ["rest_api", "pdf_exports", "territory_planning", "store_locator_widget", "scheduled_scrapes", "custom_report_builder", "weighted_distribution", "product_affinity", "store_scorecards", "census_demographics", "priority_support", "ask_cody_unlimited"],
  },
];

export function Pricing() {
  const { plan: currentPlan } = usePlan();

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-10">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-primary">Pricing</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">
          Pick the plan that fits how you sell.
        </h1>
        <p className="text-sm md:text-base text-muted-foreground max-w-2xl mx-auto">
          Every plan includes the full Washington cannabis store catalog. Start where you are and upgrade when you need more reach.
        </p>
      </div>

      {/* Tier cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {CARDS.map((c, i) => {
          const p = PLANS[c.id];
          const Icon = c.icon;
          const isCurrent = c.id === currentPlan;
          const isPro     = c.id === "pro";
          return (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, type: "spring", stiffness: 300, damping: 30 }}
              className="relative rounded-2xl border bg-card p-6 flex flex-col"
              style={{
                borderColor: isPro ? c.accent : "hsl(var(--border))",
                boxShadow:   isPro ? `0 20px 60px ${c.accent}22, 0 0 0 1px ${c.accent}44 inset` : "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              {/* Badge */}
              {c.badge && (
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-widest text-white"
                  style={{ background: c.accent }}
                >
                  {c.badge}
                </div>
              )}
              {isCurrent && (
                <div
                  className="absolute -top-3 right-5 px-3 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-widest"
                  style={{ background: "hsl(160 84% 39% / 0.16)", color: "#10B981", border: "1px solid hsl(160 84% 39% / 0.35)" }}
                >
                  Current Plan
                </div>
              )}

              {/* Icon + Name */}
              <div className="flex items-center gap-2.5 mb-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${c.accent}18`, border: `1px solid ${c.accent}40` }}
                >
                  <Icon className="w-4 h-4" style={{ color: c.accent }} />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">Cody Intel</p>
                  <h3 className="text-lg font-bold text-foreground -mt-0.5">{p.name}</h3>
                </div>
              </div>

              {/* Price */}
              <div className="mb-3">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-foreground tabular-nums">${p.priceMonth}</span>
                  <span className="text-sm text-muted-foreground">/ month</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">{p.tagline}</p>
              </div>

              {/* Feature highlights */}
              <ul className="space-y-2 mb-5 flex-1">
                {p.features.slice(0, 6).map(k => (
                  <li key={k} className="flex items-start gap-2 text-xs text-foreground">
                    <Check className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                    <span>{FEATURE_LABELS[k]}</span>
                  </li>
                ))}
                {p.features.length > 6 && (
                  <li className="text-[11px] text-muted-foreground pl-5">
                    + {p.features.length - 6} more
                  </li>
                )}
              </ul>

              {/* Limits strip */}
              <div className="rounded-lg border border-border bg-background/50 p-3 text-[11px] space-y-0.5 text-muted-foreground mb-4">
                <div className="flex justify-between">
                  <span>Products</span>
                  <span className="tabular-nums text-foreground">
                    {p.limits.maxProducts === -1 ? "Unlimited" : p.limits.maxProducts.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Alerts</span>
                  <span className="tabular-nums text-foreground">
                    {p.limits.maxAlerts === -1 ? "Unlimited" : p.limits.maxAlerts}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Ask Cody / day</span>
                  <span className="tabular-nums text-foreground">
                    {p.limits.maxAiQuestions === -1 ? "Unlimited" : p.limits.maxAiQuestions}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Competitor categories</span>
                  <span className="tabular-nums text-foreground">
                    {p.limits.maxCategories === -1 ? "All" : p.limits.maxCategories}
                  </span>
                </div>
              </div>

              {/* CTA */}
              <button
                disabled={isCurrent}
                className="w-full h-10 rounded-md text-sm font-semibold transition-all flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-default"
                style={
                  isCurrent
                    ? { background: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))" }
                    : isPro
                    ? { background: c.accent, color: "#fff", boxShadow: `0 8px 24px ${c.accent}44` }
                    : { background: "hsl(var(--foreground))", color: "hsl(var(--background))" }
                }
              >
                {isCurrent ? "Current Plan" : `Upgrade to ${p.name}`}
                {!isCurrent && <ArrowRight className="w-3.5 h-3.5" />}
              </button>
            </motion.div>
          );
        })}
      </div>

      {/* Full comparison table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Full feature comparison</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Every feature, every plan.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-secondary/40 border-b border-border">
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-1/2">Feature</th>
                {CARDS.map(c => (
                  <th
                    key={c.id}
                    className="text-center px-4 py-3 text-[11px] font-bold"
                    style={{ color: c.accent }}
                  >
                    {PLANS[c.id].name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURE_ROWS.map(grp => (
                <>
                  <tr key={grp.group} className="bg-background/30">
                    <td
                      colSpan={4}
                      className="px-5 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80"
                    >
                      {grp.group}
                    </td>
                  </tr>
                  {grp.keys.map(k => (
                    <tr key={k} className="border-t border-border/40 hover:bg-accent/20">
                      <td className="px-5 py-2.5 text-xs text-foreground">{FEATURE_LABELS[k]}</td>
                      {CARDS.map(c => {
                        const has = PLANS[c.id].features.includes(k);
                        return (
                          <td key={c.id} className="text-center px-4 py-2.5">
                            {has ? (
                              <Check className="w-4 h-4 mx-auto" style={{ color: c.accent }} />
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer note */}
      <p className="text-center text-[11px] text-muted-foreground">
        Prices in USD, billed monthly. Enterprise customers can also choose annual billing with a 15% discount — contact us.
      </p>
    </div>
  );
}
