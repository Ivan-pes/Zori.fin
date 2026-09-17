import { describe, it, expect } from "vitest";
import {
  categorizationCoverage,
  computeCategorySignals,
  monthElapsedFraction,
  watchSignals,
  type CategorySignal,
} from "./categorySignals";
import type { NormalizedTransaction } from "@/types";

function tx(p: Partial<NormalizedTransaction>): NormalizedTransaction {
  return {
    id: Math.random().toString(36),
    source: "csv",
    externalId: "e",
    kind: "adjustment",
    direction: "expense",
    grossCents: 0,
    feeCents: 0,
    netCents: 0,
    currency: "EUR",
    occurredAt: new Date("2026-06-15"),
    description: null,
    category: null,
    ...p,
  };
}

/** n месячных списаний одного мерчанта, стартуя с startISO, каждые ~30 дней. */
function monthlySub(desc: string, category: string, startISO: string, n: number, cents: number) {
  const start = new Date(startISO).getTime();
  return Array.from({ length: n }, (_, i) =>
    tx({
      description: desc,
      category,
      grossCents: cents,
      occurredAt: new Date(start + i * 30 * 86_400_000),
    })
  );
}

function find(signals: CategorySignal[], category: string): CategorySignal {
  const s = signals.find((x) => x.category === category);
  if (!s) throw new Error(`no signal for ${category}`);
  return s;
}

describe("computeCategorySignals — доля и сдвиг (2.1)", () => {
  it("считает долю категории и сдвиг доли к пред. периоду", () => {
    const current = [
      tx({ category: "Маркетинг", grossCents: 4000 }),
      tx({ category: "Аренда", grossCents: 6000 }),
    ];
    const previous = [
      tx({ category: "Маркетинг", grossCents: 1000 }),
      tx({ category: "Аренда", grossCents: 9000 }),
    ];
    const signals = computeCategorySignals({ current, previous });
    const mkt = find(signals, "Маркетинг");
    expect(mkt.sharePct).toBe(40); // 4000 / 10000
    expect(mkt.shareDeltaPp).toBe(30); // 40% сейчас − 10% раньше
    expect(mkt.momPct).toBe(300); // (4000-1000)/1000
  });
});

describe("computeCategorySignals — committed vs discretionary (2.5)", () => {
  it("регулярный мерчант → committed, остальное → discretionary", () => {
    // История: подписка на софт 4 месяца подряд = регулярная.
    const history = monthlySub("Adobe", "Софт", "2026-03-05", 4, 3000);
    const current = [
      tx({ description: "Adobe", category: "Софт", grossCents: 3000, occurredAt: new Date("2026-06-05") }),
      tx({ description: "Random Tool", category: "Софт", grossCents: 1000, occurredAt: new Date("2026-06-10") }),
    ];
    const signals = computeCategorySignals({ current, history }, { asOf: new Date("2026-06-15") });
    const soft = find(signals, "Софт");
    expect(soft.committedCents).toBe(3000);
    expect(soft.discretionaryCents).toBe(1000);
    expect(soft.committedPct).toBe(75);
  });

  it("категория без регулярки — всё дискреционно", () => {
    const current = [
      tx({ description: "Restaurant A", category: "Рестораны", grossCents: 2000 }),
      tx({ description: "Restaurant B", category: "Рестораны", grossCents: 1100 }),
    ];
    const soft = find(computeCategorySignals({ current }), "Рестораны");
    expect(soft.committedCents).toBe(0);
    expect(soft.discretionaryCents).toBe(3100);
  });
});

describe("computeCategorySignals — waste / зомби (2.11)", () => {
  it("stale-регулярка даёт wasteCents и статус waste", () => {
    // Подписка списывалась 3 раза, но давно (stale к asOf).
    const history = monthlySub("Gym Zombie", "Спорт", "2026-01-05", 3, 3900);
    const current = [
      tx({ description: "Gym Zombie", category: "Спорт", grossCents: 3900, occurredAt: new Date("2026-06-01") }),
    ];
    // asOf сильно позже последнего списания истории → stale.
    const signals = computeCategorySignals(
      { current, history: [...history, ...current] },
      { asOf: new Date("2026-09-01") }
    );
    const gym = find(signals, "Спорт");
    expect(gym.wasteCents).toBeGreaterThan(0);
    expect(gym.status).toBe("waste");
    expect(gym.action).toBe("Отменить неиспользуемое");
  });
});

describe("computeCategorySignals — budget pace (2.8)", () => {
  it("прогнозирует перерасход и ставит статус over", () => {
    // На 15-е число потрачено 800 при лимите 1000 → по темпу ~1600 → over.
    const current = [tx({ category: "Рестораны", grossCents: 80000 })];
    const budgets = new Map([["Рестораны", 100000]]);
    const signals = computeCategorySignals(
      { current, budgets },
      { asOf: new Date("2026-06-15") }
    );
    const r = find(signals, "Рестораны");
    expect(r.budget).toBeDefined();
    expect(r.budget!.pace).toBe("over");
    expect(r.budget!.overrunCents).toBeGreaterThan(0);
    expect(r.status).toBe("over");
  });

  it("умеренная трата в рамках темпа → ontrack, статус не over", () => {
    const current = [tx({ category: "Рестораны", grossCents: 40000 })];
    const budgets = new Map([["Рестораны", 100000]]);
    const r = find(
      computeCategorySignals({ current, budgets }, { asOf: new Date("2026-06-15") }),
      "Рестораны"
    );
    expect(r.budget!.pace).not.toBe("over");
    expect(r.status).not.toBe("over");
  });
});

describe("computeCategorySignals — momentum / trend (2.2)", () => {
  it("устойчивый рост по 3 мес + сдвиг доли → rising и статус watch", () => {
    // Реклама растёт 2000→4000→6000, при этом её доля в тратах тоже растёт.
    const adv = [
      tx({ category: "Реклама", grossCents: 2000, occurredAt: new Date("2026-04-10") }),
      tx({ category: "Реклама", grossCents: 4000, occurredAt: new Date("2026-05-10") }),
      tx({ category: "Реклама", grossCents: 6000, occurredAt: new Date("2026-06-10") }),
    ];
    const other = [
      tx({ category: "Прочее", grossCents: 8000, occurredAt: new Date("2026-04-10") }),
      tx({ category: "Прочее", grossCents: 4000, occurredAt: new Date("2026-06-10") }),
    ];
    const history = [...adv, ...other];
    const current = history.filter((t) => t.occurredAt.getUTCMonth() === 5); // июнь
    const previous = history.filter((t) => t.occurredAt.getUTCMonth() === 3); // апрель
    const r = find(computeCategorySignals({ current, previous, history }), "Реклама");
    expect(r.trend3m).toBe("rising");
    expect(r.shareDeltaPp).toBeGreaterThanOrEqual(3);
    expect(r.status).toBe("watch");
  });
});

describe("computeCategorySignals — статус new", () => {
  it("категория впервые в этом периоде → new", () => {
    const history = [tx({ category: "Аренда", grossCents: 5000, occurredAt: new Date("2026-05-10") })];
    const current = [
      tx({ category: "Аренда", grossCents: 5000 }),
      tx({ category: "Реклама", grossCents: 3000 }),
    ];
    const r = find(computeCategorySignals({ current, history }), "Реклама");
    expect(r.status).toBe("new");
  });
});

describe("watchSignals", () => {
  it("отбирает не-healthy и сортирует по важности", () => {
    const signals: CategorySignal[] = [
      { category: "A", status: "healthy" } as CategorySignal,
      { category: "B", status: "watch", totalCents: 100 } as CategorySignal,
      { category: "C", status: "waste", totalCents: 50 } as CategorySignal,
    ];
    const w = watchSignals(signals);
    expect(w.map((s) => s.category)).toEqual(["C", "B"]);
  });
});

describe("monthElapsedFraction", () => {
  it("середина 30-дневного месяца ≈ 0.5", () => {
    expect(monthElapsedFraction(new Date("2026-06-15"))).toBeCloseTo(15 / 30, 5);
  });
});

describe("инвариант: fee не попадает в траты категорий", () => {
  it("транзакции kind=fee игнорируются", () => {
    const current = [
      tx({ category: "Софт", grossCents: 1000 }),
      tx({ category: "Софт", grossCents: 9999, kind: "fee" }),
    ];
    expect(find(computeCategorySignals({ current }), "Софт").totalCents).toBe(1000);
  });
});

describe("инвариант: внутренние переводы — не траты (§4.5)", () => {
  it("категория «Накопления/Перевод» не попадает в сигналы", () => {
    const current = [
      tx({ category: "Продукты", grossCents: 5000 }),
      tx({ category: "Накопления/Перевод", grossCents: 100000 }),
    ];
    const signals = computeCategorySignals({ current });
    expect(signals.map((s) => s.category)).toEqual(["Продукты"]);
    // доля продуктов = 100%, перевод не раздувает знаменатель
    expect(find(signals, "Продукты").sharePct).toBe(100);
  });
});

describe("Фаза 3 — сезонность (2.3)", () => {
  function travelScenario(julyLastYearCents: number) {
    const travel = [
      tx({ category: "Путешествия", grossCents: julyLastYearCents, occurredAt: new Date("2025-07-10") }),
      tx({ category: "Путешествия", grossCents: 2000, occurredAt: new Date("2026-05-10") }),
      tx({ category: "Путешествия", grossCents: 4000, occurredAt: new Date("2026-06-10") }),
      tx({ category: "Путешествия", grossCents: 6000, occurredAt: new Date("2026-07-10") }),
    ];
    const other = [
      tx({ category: "Прочее", grossCents: 6000, occurredAt: new Date("2026-06-10") }),
      tx({ category: "Прочее", grossCents: 2000, occurredAt: new Date("2026-07-10") }),
    ];
    const history = [...travel, ...other];
    return {
      current: history.filter((t) => t.occurredAt >= new Date("2026-07-01")),
      previous: history.filter((t) => t.occurredAt >= new Date("2026-06-01") && t.occurredAt < new Date("2026-07-01")),
      history,
    };
  }

  it("рост «как обычно в этом месяце» (индекс≈1) не эскалируется в watch", () => {
    const sc = travelScenario(6000); // прошлый июль такой же → index 1.0
    const r = find(computeCategorySignals(sc, { asOf: new Date("2026-07-15") }), "Путешествия");
    expect(r.seasonalIndex).toBe(1);
    expect(r.trend3m).toBe("rising");
    expect(r.shareDeltaPp).toBeGreaterThanOrEqual(3);
    expect(r.status).not.toBe("watch"); // сезонность погасила тревогу
  });

  it("аномальный рост vs сезонной нормы (индекс высокий) → watch", () => {
    const sc = travelScenario(1000); // прошлый июль был мал → index 6 (аномалия)
    const r = find(computeCategorySignals(sc, { asOf: new Date("2026-07-15") }), "Путешествия");
    expect(r.seasonalIndex).toBe(6);
    expect(r.status).toBe("watch");
  });
});

describe("Фаза 3 — волатильность, концентрация, creep", () => {
  it("волатильность = CV месячных сумм", () => {
    const history = [
      tx({ category: "Аренда", grossCents: 1000, occurredAt: new Date("2026-04-10") }),
      tx({ category: "Аренда", grossCents: 3000, occurredAt: new Date("2026-05-10") }),
    ];
    const current = history.filter((t) => t.occurredAt.getUTCMonth() === 4);
    const r = find(computeCategorySignals({ current, history }), "Аренда");
    expect(r.volatility).toBe(0.5); // mean 2000, stdev 1000
  });

  it("концентрация по мерчантам: доля топа и HHI", () => {
    const current = [
      tx({ description: "Adobe", category: "Софт", grossCents: 8000 }),
      tx({ description: "Small Tool", category: "Софт", grossCents: 2000 }),
    ];
    const r = find(computeCategorySignals({ current }), "Софт");
    expect(r.vendorTopSharePct).toBe(80);
    expect(r.vendorHHI).toBeCloseTo(0.68, 2); // 0.8^2 + 0.2^2
  });

  it("новый мерчант в категории → newVendors и статус watch", () => {
    const history = [tx({ description: "Adobe", category: "Софт", grossCents: 8000, occurredAt: new Date("2026-05-10") })];
    const current = [tx({ description: "NewSaaS", category: "Софт", grossCents: 3000 })];
    const r = find(computeCategorySignals({ current, history }), "Софт");
    expect(r.newVendors).toBe(1);
    expect(r.status).toBe("watch");
  });
});

describe("Фаза 3 — runway impact (2.10) и ratios/бенчмарки (2.9)", () => {
  it("runwayDaysImpact = сколько дней буфера съедает категория", () => {
    const current = [tx({ category: "Кафе и рестораны", grossCents: 30000 })];
    const r = find(
      computeCategorySignals({ current, balanceCents: 300000, runwayDays: 100 }),
      "Кафе и рестораны"
    );
    expect(r.runwayDaysImpact).toBe(10); // 30000 * 100 / 300000
  });

  it("доля от дохода выше здорового коридора → статус over (личное)", () => {
    const current = [tx({ category: "Жильё и коммуналка", grossCents: 450000 })];
    const r = find(
      computeCategorySignals({ current, accountType: "personal", incomeCents: 1000000 }),
      "Жильё и коммуналка"
    );
    expect(r.incomeRatioPct).toBe(45);
    expect(r.status).toBe("over");
  });
});

describe("categorizationCoverage (§4.6)", () => {
  it("считает долю сумм без категории", () => {
    const txns = [
      tx({ category: "Продукты", grossCents: 6000 }),
      tx({ category: null, grossCents: 4000 }),
      tx({ category: "Накопления/Перевод", grossCents: 99999 }), // перевод не в знаменателе
    ];
    const c = categorizationCoverage(txns);
    expect(c.totalCents).toBe(10000);
    expect(c.uncategorizedCents).toBe(4000);
    expect(c.uncategorizedCount).toBe(1);
    expect(c.uncategorizedRatePct).toBe(40);
  });
});
