import type { Plan } from "@/lib/billing/plan";

export type Feature =
  | "forecast"
  | "cashGapAlerts"
  | "weeklyReports"
  | "scenarioWhatIf"
  | "subscriptionAudit"
  | "benchmarks"
  | "multiCurrency"
  | "accountingIntegrations"
  | "exportPdf"
  | "exportExcel";

export type Limit =
  | "integrations"
  | "statementImports"
  | "historyMonths"
  | "aiQuestions"
  | "teamSeats";

interface Entitlements {
  features: Record<Feature, boolean>;
  limits: Record<Limit, number>;
}

const F = (...on: Feature[]): Record<Feature, boolean> => {
  const all: Record<Feature, boolean> = {
    forecast: false,
    cashGapAlerts: false,
    weeklyReports: false,
    scenarioWhatIf: false,
    subscriptionAudit: false,
    benchmarks: false,
    multiCurrency: false,
    accountingIntegrations: false,
    exportPdf: false,
    exportExcel: false,
  };
  for (const f of on) all[f] = true;
  return all;
};

export const ENTITLEMENTS: Record<Plan, Entitlements> = {
  free: {
    features: F(),
    limits: { integrations: 1, statementImports: 2, historyMonths: 3, aiQuestions: 10, teamSeats: 1 },
  },
  starter: {
    features: F("forecast"),
    limits: { integrations: 2, statementImports: 10, historyMonths: 12, aiQuestions: 50, teamSeats: 1 },
  },
  growth: {
    features: F("forecast", "cashGapAlerts", "weeklyReports", "scenarioWhatIf", "subscriptionAudit", "exportPdf"),
    limits: { integrations: 4, statementImports: -1, historyMonths: 24, aiQuestions: -1, teamSeats: 3 },
  },
  pro: {
    features: F(
      "forecast", "cashGapAlerts", "weeklyReports", "scenarioWhatIf", "subscriptionAudit",
      "benchmarks", "multiCurrency", "accountingIntegrations", "exportPdf", "exportExcel"
    ),
    limits: { integrations: -1, statementImports: -1, historyMonths: -1, aiQuestions: -1, teamSeats: 10 },
  },
};

// Неизвестный план (например, личный 'plus' попал в бизнес-гейт) — считаем free,
// а не падаем: гейтинг должен быть отказоустойчивым.
function ent(plan: Plan) {
  return ENTITLEMENTS[plan] ?? ENTITLEMENTS.free;
}

export function can(plan: Plan, feature: Feature): boolean {
  return ent(plan).features[feature];
}

export function limit(plan: Plan, key: Limit): number {
  return ent(plan).limits[key];
}

export function withinLimit(plan: Plan, key: Limit, used: number): boolean {
  const max = limit(plan, key);
  return max === -1 || used < max;
}

export function minPlanFor(feature: Feature): Plan {
  const order: Plan[] = ["free", "starter", "growth", "pro"];
  for (const p of order) if (can(p, feature)) return p;
  return "pro";
}
