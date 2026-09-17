export type Industry = "saas" | "ecommerce" | "agency" | "freelance";

export interface Benchmark {
  metric: "netMargin" | "marketingShare";
  label: string;
  unit: "%";
  p25: number;
  p50: number;
  p75: number;
}

const TABLE: Record<Industry, Benchmark[]> = {
  saas: [
    { metric: "netMargin", label: "Чистая маржа", unit: "%", p25: 5, p50: 18, p75: 35 },
    { metric: "marketingShare", label: "Доля маркетинга в расходах", unit: "%", p25: 15, p50: 28, p75: 45 },
  ],
  ecommerce: [
    { metric: "netMargin", label: "Чистая маржа", unit: "%", p25: 3, p50: 10, p75: 20 },
    { metric: "marketingShare", label: "Доля маркетинга в расходах", unit: "%", p25: 10, p50: 22, p75: 35 },
  ],
  agency: [
    { metric: "netMargin", label: "Чистая маржа", unit: "%", p25: 8, p50: 20, p75: 38 },
    { metric: "marketingShare", label: "Доля маркетинга в расходах", unit: "%", p25: 5, p50: 12, p75: 22 },
  ],
  freelance: [
    { metric: "netMargin", label: "Чистая маржа", unit: "%", p25: 30, p50: 55, p75: 75 },
    { metric: "marketingShare", label: "Доля маркетинга в расходах", unit: "%", p25: 2, p50: 8, p75: 18 },
  ],
};

export const INDUSTRY_LABELS: Record<Industry, string> = {
  saas: "SaaS",
  ecommerce: "E-commerce",
  agency: "Агентство",
  freelance: "Фриланс",
};

export function getBenchmarks(industry: Industry): Benchmark[] {
  return TABLE[industry] ?? TABLE.saas;
}

export function positionVsBenchmark(value: number, b: Benchmark): "below" | "around" | "above" {
  if (value < b.p25) return "below";
  if (value > b.p75) return "above";
  return "around";
}

export function toneFor(metric: Benchmark["metric"], pos: "below" | "around" | "above"): "ok" | "warn" | "info" {
  const higherIsBetter = metric === "netMargin";
  if (pos === "around") return "info";
  const good = higherIsBetter ? pos === "above" : pos === "below";
  return good ? "ok" : "warn";
}
