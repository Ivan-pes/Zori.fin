// Личная сетка тарифов (Zori Personal) — параллельно бизнес-entitlements.
export type PersonalPlan = "free_personal" | "plus";

export type PFeature =
  | "cashAlerts"        // алерт «мало на счету»
  | "cancelReminders"   // напоминания отменить подписку
  | "affordability"     // калькулятор «что могу позволить»
  | "digest"            // дайджест на почту
  | "household"         // общий бюджет с партнёром/семьёй
  | "manualNetWorth"    // ручные активы/долги + тренд
  | "exportPdf";

export type PLimit =
  | "connections"       // подключений банка/карт
  | "historyMonths"     // глубина истории
  | "aiQuestions"       // AI-вопросов в месяц
  | "budgetCategories"  // бюджетов-конвертов
  | "goals"             // целей накоплений
  | "receiptScans"      // сканов чеков в месяц
  | "householdMembers"; // приглашённых участников семейного бюджета (без владельца)

interface PEntitlements {
  features: Record<PFeature, boolean>;
  limits: Record<PLimit, number>;
}

const P = (...on: PFeature[]): Record<PFeature, boolean> => {
  const all: Record<PFeature, boolean> = {
    cashAlerts: false,
    cancelReminders: false,
    affordability: false,
    digest: false,
    household: false,
    manualNetWorth: false,
    exportPdf: false,
  };
  for (const f of on) all[f] = true;
  return all;
};

export const ENTITLEMENTS_PERSONAL: Record<PersonalPlan, PEntitlements> = {
  free_personal: {
    features: P(),
    limits: { connections: 1, historyMonths: 3, aiQuestions: 15, budgetCategories: 3, goals: 1, receiptScans: 5, householdMembers: 0 },
  },
  plus: {
    features: P("cashAlerts", "cancelReminders", "affordability", "digest", "household", "manualNetWorth", "exportPdf"),
    limits: { connections: -1, historyMonths: -1, aiQuestions: -1, budgetCategories: -1, goals: -1, receiptScans: -1, householdMembers: 4 },
  },
};

export function canP(plan: PersonalPlan, feature: PFeature): boolean {
  return ENTITLEMENTS_PERSONAL[plan].features[feature];
}

export function limitP(plan: PersonalPlan, key: PLimit): number {
  return ENTITLEMENTS_PERSONAL[plan].limits[key];
}

export function withinLimitP(plan: PersonalPlan, key: PLimit, used: number): boolean {
  const max = limitP(plan, key);
  return max === -1 || used < max;
}
