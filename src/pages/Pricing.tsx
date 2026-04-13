import { useState } from "react";
import { Check, Sparkles, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { PLANS, FEATURE_LABELS, TIER_ORDER, usePlan, type PlanId, type FeatureKey } from "@/lib/plans";

const CARDS: { id: PlanId; badge?: string; accent: string }[] = [
  { id: "scout",        accent: "#3B82F6" },
  { id: "analyst",      accent: "#A78BFA", badge: "Most Popular" },
  { id: "professional", accent: "hsl(168 100% 42%)" },
  { id: "enterprise",   accent: "#F59E0B" },
];

const FEATURE_GROUPS: { title: string; keys: FeatureKey[] }[] = [
  { title: "Core",
    keys: ["dashboard_map", "distribution_map", "brand_rankings_top_20", "stock_out_alerts",
           "my_products_catalog", "store_directory"] },
  { title: "Analysis",
    keys: ["full_reports", "competitor_monitoring", "gap_analysis", "price_intelligence",
           "csv_exports", "store_tags", "custom_alerts"] },
  { title: "Advanced",
    keys: ["saturation_analysis", "sell_through", "weighted_distribution", "store_scorecards",
           "ai_weekly_briefing", "pdf_exports", "territory_planning", "scheduled_scrapes"] },
  { title: "Enterprise",
    keys: ["product_affinity", "census_demographics", "ai_purchase_orders", "ai_predictions",
           "custom_report_builder", "rest_api", "store_locator_widget", "dedicated_support"] },
];

function refreshLabel(hours: number) {
  if (hours >= 168) return "Weekly";
  if (hours === 24) return "Daily";
  return `Every ${hours}h`;
}

export function Pricing() {
  const { plan: currentPlan } = usePlan();
  const [annual, setAnnual] = useState(false);
  const currentIdx = TIER_ORDER.indexOf(currentPlan);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 mb-4">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-primary">Cody Intel</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight mb-2">
          Market intelligence that scales with you.
        </h1>
        <p className="text-sm md:text-base text-muted-foreground max-w-2xl mx-auto mb-6">
          Start where you are. Every tier includes the full Washington cannabis catalog and grows with your team.
        </p>
        <div className="inline-flex items-center gap-3">
          <span className={`text-sm font-medium ${!annual ? "text-foreground" : "text-muted-foreground"}`}>Monthly</span>
          <button
            onClick={() => setAnnual(!annual)}
            className="w-14 h-7 rounded-full p-1 flex items-center transition-colors"
            style={{ background: annual ? "hsl(168 100% 42%)" : "hsl(var(--border))" }}
          >
            <motion.div layout transition={{ type: "spring", stiffness: 500, damping: 25 }}
              className="w-5 h-5 bg-white rounded-full shadow-md"
              style={{ marginLeft: annual ? "auto" : 0 }} />
          </button>
          <span className={`text-sm font-medium ${annual ? "text-foreground" : "text-muted-foreground"}`}>
            Annual <span className="text-primary">(Save ~17%)</span>
          </span>
        </div>
      </div>

      {/* Tier cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-12">
        {CARDS.map((c, i) => {
          const p = PLANS[c.id];
          const isCurrent = c.id === currentPlan;
          const tierIdx   = TIER_ORDER.indexOf(c.id);
          const isLocked  = tierIdx < currentIdx;   // below user's current plan
          const isPopular = c.badge === "Most Popular";
          const priceNow  = annual ? p.priceAnnual : p.priceMonth;

          return (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, type: "spring", stiffness: 300, damping: 30 }}
              className="relative rounded-2xl border bg-card p-6 flex flex-col"
              style={{
                borderColor: isPopular ? c.accent : "hsl(var(--border))",
                boxShadow:   isPopular ? `0 18px 50px ${c.accent}22, 0 0 0 1px ${c.accent}44 inset` : "0 1px 3px rgba(0,0,0,0.04)",
                opacity:     isLocked ? 0.6 : 1,
              }}
            >
              {c.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-widest text-white"
                     style={{ background: c.accent }}>
                  {c.badge}
                </div>
              )}
              {isCurrent && (
                <div className="absolute -top-3 right-5 px-3 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-widest"
                     style={{ background: "hsl(160 84% 39% / 0.16)", color: "#10B981", border: "1px solid hsl(160 84% 39% / 0.35)" }}>
                  Current Plan
                </div>
              )}

              {/* Name + price */}
              <div className="mb-3">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Cody Intel</p>
                <h3 className="text-lg font-bold text-foreground">{p.name}</h3>
              </div>
              <div className="mb-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-foreground tabular-nums">${priceNow}</span>
                  <span className="text-sm text-muted-foreground">/ mo</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">{p.tagline}</p>
              </div>

              {/* Limits strip */}
              <div className="rounded-lg border border-border bg-background/40 p-3 text-[11px] space-y-0.5 text-muted-foreground mb-4">
                <Row label="Users"       value={p.limits.maxUsers       === -1 ? "Unlimited" : String(p.limits.maxUsers)} />
                <Row label="SKUs"        value={p.limits.maxProducts    === -1 ? "Unlimited" : String(p.limits.maxProducts)} />
                <Row label="Brands"      value={p.limits.maxBrands      === -1 ? "Unlimited" : String(p.limits.maxBrands)} />
                <Row label="Alert rules" value={p.limits.maxAlertRules  === -1 ? "Unlimited" : String(p.limits.maxAlertRules)} />
                <Row label="Data refresh" value={refreshLabel(p.limits.refreshHours)} />
              </div>

              {/* Top features highlight */}
              <ul className="space-y-1.5 mb-5 flex-1">
                {p.features.slice(0, 6).map(k => (
                  <li key={k} className="flex items-start gap-2 text-[11px] text-foreground">
                    <Check className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                    <span>{FEATURE_LABELS[k]}</span>
                  </li>
                ))}
                {p.features.length > 6 && (
                  <li className="text-[11px] text-muted-foreground pl-5">+ {p.features.length - 6} more</li>
                )}
              </ul>

              {/* CTA */}
              <button
                disabled={isCurrent || isLocked}
                className="w-full h-10 rounded-md text-sm font-semibold transition-all flex items-center justify-center gap-1.5 disabled:cursor-default"
                style={
                  isCurrent
                    ? { background: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))" }
                    : isLocked
                    ? { background: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))" }
                    : isPopular
                    ? { background: c.accent, color: "#fff", boxShadow: `0 8px 24px ${c.accent}44` }
                    : { background: "hsl(var(--foreground))", color: "hsl(var(--background))" }
                }
              >
                {isCurrent ? "Current Plan" : isLocked ? "Included" : <>Upgrade to {p.name}<ArrowRight className="w-3.5 h-3.5" /></>}
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
                  <th key={c.id} className="text-center px-4 py-3 text-[11px] font-bold" style={{ color: c.accent }}>
                    {PLANS[c.id].name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURE_GROUPS.map(g => (
                <GroupRows key={g.title} group={g} currentIdx={currentIdx} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-center text-[11px] text-muted-foreground mt-8">
        Prices in USD. Annual billing saves ~17% (2 months free). Enterprise customers can also discuss custom volume pricing.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function GroupRows({ group, currentIdx }: { group: { title: string; keys: FeatureKey[] }; currentIdx: number }) {
  return (
    <>
      <tr className="bg-background/30">
        <td colSpan={5} className="px-5 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">
          {group.title}
        </td>
      </tr>
      {group.keys.map(k => (
        <tr key={k} className="border-t border-border/40 hover:bg-accent/20">
          <td className="px-5 py-2.5 text-xs text-foreground">{FEATURE_LABELS[k]}</td>
          {CARDS.map(c => {
            const has     = PLANS[c.id].features.includes(k);
            const tierIdx = TIER_ORDER.indexOf(c.id);
            const locked  = tierIdx < currentIdx;
            return (
              <td key={c.id} className="text-center px-4 py-2.5">
                {has
                  ? <Check className="w-4 h-4 mx-auto" style={{ color: c.accent, opacity: locked ? 0.4 : 1 }} />
                  : <span className="text-muted-foreground/40">—</span>}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
