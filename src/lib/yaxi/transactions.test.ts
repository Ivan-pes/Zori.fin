import { describe as dsc, it, expect } from "vitest";
import { buildTransactionRows, type YxTransaction } from "./transactions";

const tx = (o: Partial<YxTransaction>): YxTransaction => ({
  status: "Booked",
  bookingDate: "2024-05-02",
  amount: { amount: "-3.50", currency: "EUR" },
  remittanceInformation: ["Coffee"],
  ...o,
});

dsc("buildTransactionRows", () => {
  it("не схлопывает одинаковые операции одного дня без endToEndId", () => {
    // Два идентичных кофе в один день — раньше давали один external_id и
    // второй терялся на `on conflict do nothing`.
    const rows = buildTransactionRows([tx({}), tx({}), tx({})]);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.externalId)).size).toBe(3);
  });

  it("сохраняет стабильный external_id по endToEndId (без суффикса)", () => {
    const rows = buildTransactionRows([
      tx({ endToEndId: "A1" }),
      tx({ endToEndId: "A2" }),
    ]);
    expect(rows.map((r) => r.externalId)).toEqual(["yaxi:A1", "yaxi:A2"]);
  });

  it("отбрасывает не-booked операции", () => {
    const rows = buildTransactionRows([
      tx({ status: "Pending" }),
      tx({ status: "Booked" }),
      tx({ status: "booked" }),
    ]);
    expect(rows).toHaveLength(2);
  });

  it("пропускает операции с нечисловой суммой", () => {
    const rows = buildTransactionRows([
      tx({ amount: { amount: "not-a-number" } }),
      tx({ amount: undefined }),
      tx({ amount: { amount: "10.00" } }),
    ]);
    expect(rows).toHaveLength(1);
  });

  it("внутри дня свежайшая операция (первая в массиве) идёт позже по времени", () => {
    // Банк отдаёт новые→старые; после сортировки по occurred_at desc порядок
    // массива должен сохраниться.
    const rows = buildTransactionRows([
      tx({ remittanceInformation: ["newest"] }),
      tx({ remittanceInformation: ["middle"] }),
      tx({ remittanceInformation: ["oldest"] }),
    ]);
    const byTimeDesc = [...rows].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    expect(byTimeDesc.map((r) => r.description)).toEqual(["newest", "middle", "oldest"]);
  });

  it("под-дневной сдвиг держит операцию в пределах её суток (секунды, не часы)", () => {
    const rows = buildTransactionRows(
      Array.from({ length: 50 }, (_, i) => tx({ remittanceInformation: [`t${i}`] }))
    );
    for (const r of rows) {
      expect(r.occurredAt.toISOString().slice(0, 10)).toBe("2024-05-02");
      // сдвиг мал — не уводит даже западные TZ на другой день
      expect(r.occurredAt.getTime() - Date.parse("2024-05-02T00:00:00Z")).toBeLessThan(60_000);
    }
  });

  it("раскладывает знак: расход отрицательный, доход положительный", () => {
    const rows = buildTransactionRows([
      tx({ amount: { amount: "-3.50" } }),
      tx({ amount: { amount: "12.00" }, endToEndId: "in" }),
    ]);
    expect(rows[0]).toMatchObject({ direction: "expense", grossCents: 350, netCents: -350 });
    expect(rows[1]).toMatchObject({ direction: "income", grossCents: 1200, netCents: 1200 });
  });

  it("описание берёт из remittance → creditor → debtor", () => {
    const rows = buildTransactionRows([
      tx({ remittanceInformation: ["  Netflix  "] }),
      tx({ remittanceInformation: [], creditor: { name: "Landlord" } }),
      tx({ remittanceInformation: undefined, debtor: { name: "Employer" } }),
    ]);
    expect(rows.map((r) => r.description)).toEqual(["Netflix", "Landlord", "Employer"]);
  });
});
