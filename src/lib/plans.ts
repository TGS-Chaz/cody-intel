// ─────────────────────────────────────────────────────────────────────────────
// Cody Intel tier system — Scout / Analyst / Professional / Enterprise
// Reads organizations.intel_plan (shared DB with CRM; CRM uses crm_plan).
// ─────────────────────────────────────────────────────────────────────────────

import { useOrg } from "./org";

export type PlanId = "scout" | "analyst" | "professional" | "enterprise";

export type FeatureKey =
  // Scout tier
  | "dashboard_map"
  | "distribution_map"
  | "brand_rankings_top_20"
  | "stock_out_alerts"
  | "weekly_refresh"
  | "my_products_catalog"
  | "store_directory"

  // Analyst tier
  | "full_reports"
  | "competitor_monitoring"
  | "gap_analysis"
  | "price_intelligence"
  | "csv_exports"
  | "store_tags"
  | "daily_refresh"
  | "custom_alerts"

  // Professional tier
  | "saturation_analysis"
  | "sell_through"
  | "weighted_distribution"
  | "store_scorecards"
  | "ai_weekly_briefing"
  | "pdf_exports"
  | "territory_planning"
  | "scheduled_scrapes"
  | "twelve_hour_refresh"

  // Enterprise tier
  | "product_affinity"
  | "census_demographics"
  | "ai_purchase_orders"
  | "ai_predictions"
  | "custom_report_builder"
  | "rest_api"
  | "store_locator_widget"
  | "six_hour_refresh"
  | "dedicated_support";

export interface PlanLimits {
  maxUsers:        number;   // -1 = unlimited
  maxProducts:     number;
  maxBrands:       number;
  maxAlertRules:   number;
  maxAiQuestions:  number;   // per day
  refreshHours:    number;   // how often scheduled refreshes run
}

interface PlanDef {
  id:           PlanId;
  name:         string;
  priceMonth:   number;
  priceAnnual:  number;      // per month when billed annually (2mo free)
  tagline:      string;
  limits:       PlanLimits;
  features:     FeatureKey[];
}

const U = -1;

export const PLANS: Record<PlanId, PlanDef> = {
  scout: {
    id: "scout", name: "Scout",
    priceMonth: 49, priceAnnual: 40,
    tagline: "See where your brand shows up.",
    limits: { maxUsers: 2,  maxProducts: 25,  maxBrands: 3,  maxAlertRules: 3,  maxAiQuestions: 5,  refreshHours: 168 },
    features: [
      "dashboard_map", "distribution_map", "brand_rankings_top_20",
      "stock_out_alerts", "weekly_refresh", "my_products_catalog", "store_directory",
    ],
  },
  analyst: {
    id: "analyst", name: "Analyst",
    priceMonth: 149, priceAnnual: 124,
    tagline: "Track competitors. Find gaps.",
    limits: { maxUsers: 5,  maxProducts: 100, maxBrands: 10, maxAlertRules: 10, maxAiQuestions: 25, refreshHours: 24 },
    features: [
      "dashboard_map", "distribution_map", "brand_rankings_top_20",
      "stock_out_alerts", "my_products_catalog", "store_directory",
      "full_reports", "competitor_monitoring", "gap_analysis",
      "price_intelligence", "csv_exports", "store_tags",
      "daily_refresh", "custom_alerts",
    ],
  },
  professional: {
    id: "professional", name: "Professional",
    priceMonth: 299, priceAnnual: 249,
    tagline: "Deep analytics. Territory planning.",
    limits: { maxUsers: 10, maxProducts: 500, maxBrands: 25, maxAlertRules: 50, maxAiQuestions: 100, refreshHours: 12 },
    features: [
      "dashboard_map", "distribution_map", "brand_rankings_top_20",
      "stock_out_alerts", "my_products_catalog", "store_directory",
      "full_reports", "competitor_monitoring", "gap_analysis",
      "price_intelligence", "csv_exports", "store_tags", "custom_alerts",
      "saturation_analysis", "sell_through", "weighted_distribution",
      "store_scorecards", "ai_weekly_briefing", "pdf_exports",
      "territory_planning", "scheduled_scrapes", "twelve_hour_refresh",
    ],
  },
  enterprise: {
    id: "enterprise", name: "Enterprise",
    priceMonth: 499, priceAnnual: 416,
    tagline: "Everything. Unlimited. Plus API.",
    limits: { maxUsers: U, maxProducts: U, maxBrands: U, maxAlertRules: U, maxAiQuestions: U, refreshHours: 6 },
    features: [
      "dashboard_map", "distribution_map", "brand_rankings_top_20",
      "stock_out_alerts", "my_products_catalog", "store_directory",
      "full_reports", "competitor_monitoring", "gap_analysis",
      "price_intelligence", "csv_exports", "store_tags", "custom_alerts",
      "saturation_analysis", "sell_through", "weighted_distribution",
      "store_scorecards", "ai_weekly_briefing", "pdf_exports",
      "territory_planning", "scheduled_scrapes",
      "product_affinity", "census_demographics", "ai_purchase_orders",
      "ai_predictions", "custom_report_builder", "rest_api",
      "store_locator_widget", "six_hour_refresh", "dedicated_support",
    ],
  },
};

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  // Scout
  dashboard_map:          "Dashboard map",
  distribution_map:       "Distribution map",
  brand_rankings_top_20:  "Brand rankings (top 20)",
  stock_out_alerts:       "Stock-out alerts",
  weekly_refresh:         "Weekly data refresh",
  my_products_catalog:    "My Products catalog",
  store_directory:        "Store directory",
  // Analyst
  full_reports:           "Full report suite",
  competitor_monitoring:  "Competitor monitoring",
  gap_analysis:           "Gap analysis",
  price_intelligence:     "Price intelligence",
  csv_exports:            "CSV exports",
  store_tags:             "Store tags",
  daily_refresh:          "Daily data refresh",
  custom_alerts:          "Custom alert rules",
  // Professional
  saturation_analysis:    "Market saturation analysis",
  sell_through:           "Sell-through reports",
  weighted_distribution:  "Weighted distribution metrics",
  store_scorecards:       "Store scorecards",
  ai_weekly_briefing:     "AI weekly briefing",
  pdf_exports:            "PDF exports",
  territory_planning:     "Territory planning",
  scheduled_scrapes:      "Scheduled scrapes",
  twelve_hour_refresh:    "12-hour data refresh",
  // Enterprise
  product_affinity:       "Product affinity / basket analysis",
  census_demographics:    "Census demographics",
  ai_purchase_orders:     "AI purchase orders",
  ai_predictions:         "AI predictions",
  custom_report_builder:  "Custom report builder",
  rest_api:               "REST API access",
  store_locator_widget:   "Store locator widget",
  six_hour_refresh:       "6-hour data refresh",
  dedicated_support:      "Dedicated support",
};

export const TIER_ORDER: PlanId[] = ["scout", "analyst", "professional", "enterprise"];

// CRM shares the same org; when it bumps someone past our tiers we still grant
// the equivalent Intel level.
export function resolvePlan(raw: string | null | undefined): PlanId {
  if (raw === "analyst" || raw === "professional" || raw === "enterprise" || raw === "scout") return raw;
  // Legacy CRM tier mappings
  if (raw === "intel" || raw === "intel_plus") return "enterprise";
  return "scout";
}

export function usePlan() {
  const { org } = useOrg();
  // Prefer intel_plan; fall back to the legacy `plan` column for older orgs.
  const raw = (org as any)?.intel_plan ?? (org as any)?.plan ?? null;
  const planId = resolvePlan(raw);
  const plan   = PLANS[planId];
  const set    = new Set(plan.features);
  return {
    plan:         planId,
    planDef:      plan,
    limits:       plan.limits,
    canAccess:    (k: FeatureKey) => set.has(k),
    requiredPlan: (k: FeatureKey): PlanId => {
      for (const p of TIER_ORDER) if (PLANS[p].features.includes(k)) return p;
      return "enterprise";
    },
    isAtLeast:    (target: PlanId) => TIER_ORDER.indexOf(planId) >= TIER_ORDER.indexOf(target),
  };
}
