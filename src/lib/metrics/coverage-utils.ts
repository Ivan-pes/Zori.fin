export interface MonthCoverage {
  month: string;
  txCount: number;
  incomeCount: number;
  expenseCount: number;
  sources: string[];
  status: "ok" | "income_only" | "empty" | "locked";
}

export function classifyMonth(
  r: { inc: number; exp: number } | undefined,
  locked: boolean
): MonthCoverage["status"] {
  if (locked) return "locked";
  if (r && r.exp > 0) return "ok";
  if (r && r.inc > 0) return "income_only";
  return "empty";
}

export interface CoverageSummary {
  totalVisible: number;
  okCount: number;
  incomeOnly: string[];
  empty: string[];
}

export function summarizeCoverage(coverage: MonthCoverage[]): CoverageSummary {
  const visible = coverage.filter((c) => c.status !== "locked");
  return {
    totalVisible: visible.length,
    okCount: visible.filter((c) => c.status === "ok").length,
    incomeOnly: visible.filter((c) => c.status === "income_only").map((c) => c.month),
    empty: visible.filter((c) => c.status === "empty").map((c) => c.month),
  };
}

export function monthLabel(ym: string, tag = "ru-RU"): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, 1)).toLocaleDateString(tag, {
    month: "long",
    year: "numeric",
  });
}
