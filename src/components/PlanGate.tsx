import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Lock, Sparkles } from "lucide-react";
import { usePlan, PLANS, type FeatureKey, type PlanId } from "@/lib/plans";

interface Props {
  feature:  FeatureKey;
  children: ReactNode;
  // Optional override for which tier to show in the CTA
  requires?: PlanId;
  // Render in compact inline badge mode instead of full blur overlay
  compact?: boolean;
}

export function PlanGate({ feature, children, requires, compact }: Props) {
  const { canAccess, requiredPlan } = usePlan();

  if (canAccess(feature)) return <>{children}</>;

  const needed   = requires ?? requiredPlan(feature);
  const planName = PLANS[needed].name;
  const price    = PLANS[needed].priceMonth;

  if (compact) {
    return (
      <Link
        to="/pricing"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15"
      >
        <Lock className="w-2.5 h-2.5" />
        {planName}
      </Link>
    );
  }

  return (
    <div className="relative rounded-xl overflow-hidden">
      {/* Locked content, visibly blurred */}
      <div
        aria-hidden
        className="pointer-events-none select-none blur-[3px] opacity-60 saturate-50"
      >
        {children}
      </div>

      {/* Upgrade overlay */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center"
        style={{
          background: "linear-gradient(180deg, hsl(var(--card) / 0.6) 0%, hsl(var(--card) / 0.92) 40%, hsl(var(--card) / 0.96) 100%)",
          backdropFilter: "blur(1px)",
        }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
          style={{ background: "hsl(168 100% 42% / 0.14)", border: "1px solid hsl(168 100% 42% / 0.3)" }}
        >
          <Lock className="w-4 h-4 text-primary" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
          {planName} Feature
        </p>
        <p className="text-sm font-medium text-foreground max-w-xs mb-4">
          Upgrade to {planName} (${price}/mo) to unlock this.
        </p>
        <Link
          to="/pricing"
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          View Pricing
        </Link>
      </div>
    </div>
  );
}
