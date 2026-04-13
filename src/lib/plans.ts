// Plan definitions + feature-gate hook
//
// Reads `plan` from the active organization loaded by useOrg(). Every gated
// feature in the app is listed here so the pricing page and PlanGate stay in
// sync.

import { useOrg } from "./org";

export type PlanId = "starter" | "pro" | "enterprise";

export type FeatureKey =
  | "my_products_catalog"           // Starter
  | "stock_out_alerts"              // Starter
  | "basic_distribution"            // Starter
  | "ask_cody_basic"                // Starter (5/day)

  | "competitor_tracking"           // Pro
  | "gap_analysis"                  // Pro
  | "price_comparison"              // Pro
  | "csv_exports"                   // Pro
  | "store_tags"                    // Pro
  | "custom_alerts"                 // Pro (up to 10)
  | "ask_cody_pro"                  // Pro (25/day)

  | "rest_api"                      // Enterprise
  | "pdf_exports"                   // Enterprise
  | "territory_planning"            // Enterprise
  | "store_locator_widget"          // Enterprise
  | "scheduled_scrapes"             // Enterprise
  | "custom_report_builder"         // Enterprise
  | "weighted_distribution"         // Enterprise
  | "product_affinity"              // Enterprise
  | "store_scorecards"              // Enterprise
  | "census_demographics"           // Enterprise
  | "priority_support"              // Enterprise
  | "ask_cody_unlimited";           // Enterprise

export interface PlanLimits {
  maxProducts:       number;     // -1 = unlimited
  maxAlerts:         number;
  maxAiQuestions:    number;     // per day
  maxCategories:     number;     // how many competitor categories
}

interface PlanDef {
  id:          PlanId;
  name:        string;
  priceMonth:  number;
  tagline:     string;
  limits:      PlanLimits;
  features:    FeatureKey[];      // keys included in this tier
}

const UNLIMITED = -1;

export const PLANS: Record<PlanId, PlanDef> = {
  starter: {
    id:         "starter",
    name:       "Starter",
    priceMonth: 49,
    tagline:    "See where your products are stocked.",
    limits: {
      maxProducts:    50,
      maxAlerts:      3,
      maxAiQuestions: 5,
      maxCategories:  0,
    },
    features: [
      "my_products_catalog",
      "stock_out_alerts",
      "basic_distribution",
      "ask_cody_basic",
    ],
  },
  pro: {
    id:         "pro",
    name:       "Pro",
    priceMonth: 149,
    tagline:    "Track up to 3 competitor categories.",
    limits: {
      maxProducts:    200,
      maxAlerts:      10,
      maxAiQuestions: 25,
      maxCategories:  3,
    },
    features: [
      "my_products_catalog",
      "stock_out_alerts",
      "basic_distribution",
      "ask_cody_basic",
      "competitor_tracking",
      "gap_analysis",
      "price_comparison",
      "csv_exports",
      "store_tags",
      "custom_alerts",
      "ask_cody_pro",
    ],
  },
  enterprise: {
    id:         "enterprise",
    name:       "Enterprise",
    priceMonth: 399,
    tagline:    "Everything. All categories, all brands, all stores.",
    limits: {
      maxProducts:    UNLIMITED,
      maxAlerts:      UNLIMITED,
      maxAiQuestions: UNLIMITED,
      maxCategories:  UNLIMITED,
    },
    features: [
      "my_products_catalog",
      "stock_out_alerts",
      "basic_distribution",
      "ask_cody_basic",
      "competitor_tracking",
      "gap_analysis",
      "price_comparison",
      "csv_exports",
      "store_tags",
      "custom_alerts",
      "ask_cody_pro",
      "rest_api",
      "pdf_exports",
      "territory_planning",
      "store_locator_widget",
      "scheduled_scrapes",
      "custom_report_builder",
      "weighted_distribution",
      "product_affinity",
      "store_scorecards",
      "census_demographics",
      "priority_support",
      "ask_cody_unlimited",
    ],
  },
};

// Human-friendly labels for the pricing comparison table
export const FEATURE_LABELS: Record<FeatureKey, string> = {
  my_products_catalog:     "My Products catalog",
  stock_out_alerts:        "Stock-out alerts",
  basic_distribution:      "Basic distribution report",
  ask_cody_basic:          "Ask Cody AI (5/day)",

  competitor_tracking:     "Competitor monitoring (up to 3 categories)",
  gap_analysis:            "Gap analysis",
  price_comparison:        "Price comparison",
  csv_exports:             "CSV exports",
  store_tags:              "Store tags",
  custom_alerts:           "Custom alerts (up to 10)",
  ask_cody_pro:            "Ask Cody AI (25/day)",

  rest_api:                "REST API access",
  pdf_exports:             "PDF report exports",
  territory_planning:      "Territory planning",
  store_locator_widget:    "Store locator widget",
  scheduled_scrapes:       "Scheduled auto-scrapes",
  custom_report_builder:   "Custom report builder",
  weighted_distribution:   "Weighted distribution metrics",
  product_affinity:        "Product affinity / basket analysis",
  store_scorecards:        "Store scorecards",
  census_demographics:     "Census demographics",
  priority_support:        "Priority support",
  ask_cody_unlimited:      "Ask Cody AI (unlimited)",
};

// Resolve a plan string (possibly unknown / legacy) to a known tier
export function resolvePlan(raw: string | null | undefined): PlanId {
  if (raw === "pro" || raw === "enterprise") return raw;
  return "starter";
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePlan() {
  const { org } = useOrg();
  const planId  = resolvePlan(org?.plan ?? null);
  const plan    = PLANS[planId];
  const featureSet = new Set(plan.features);

  return {
    plan:      planId,
    planDef:   plan,
    limits:    plan.limits,
    canAccess: (k: FeatureKey) => featureSet.has(k),
    // Minimum plan required for a feature (for upgrade CTA)
    requiredPlan: (k: FeatureKey): PlanId => {
      if (PLANS.starter.features.includes(k))    return "starter";
      if (PLANS.pro.features.includes(k))        return "pro";
      return "enterprise";
    },
  };
}
