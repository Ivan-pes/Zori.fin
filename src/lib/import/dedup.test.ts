import { describe, it, expect } from "vitest";
import { dedupStatementRows, keyOf, type StatementRow } from "./dedup";

const row = (o: Partial<StatementRow>): StatementRow => ({
  date: new Date("2024-05-02T00:00:00Z"),
  dateIso: "2024-05-02",
  cents: -350,
  currency: "EUR",
  description: "Coffee",
  ...o,
});

describe("dedupStatementRows", () => {
  it("пропускает операции, уже покрытые банком (тот же день+сумма+валюта)", () => {
    const existing = new Map([[keyOf("2024-05-02", -350, "EUR"), 1]]);
    const { toInsert, skipped } = dedupStatementRows([row({})], existing);
    expect(skipped).toBe(1);
    expect(toInsert).toHaveLength(0);
  });

  it("добавляет только НОВЫЕ сверх покрытых банком (мультимножество)", () => {
    // Банк дал 2 одинаковые операции, в выписке 3 — добавляем только 1.
    const existing = new Map([[keyOf("2024-05-02", -350, "EUR"), 2]]);
    const { toInsert, skipped } = dedupStatementRows(
      [row({}), row({}), row({})],
      existing
    );
    expect(skipped).toBe(2);
    expect(toInsert).toHaveLength(1);
  });

  it("вставляет всё, если банк ничего не покрывает", () => {
    const { toInsert, skipped } = dedupStatementRows([row({}), row({ cents: -900 })], new Map());
    expect(skipped).toBe(0);
    expect(toInsert).toHaveLength(2);
  });

  it("разводит одинаковые операции внутри файла уникальными external_id", () => {
    const { toInsert } = dedupStatementRows([row({}), row({}), row({})], new Map());
    const ids = toInsert.map((t) => t.externalId);
    expect(new Set(ids).size).toBe(3); // все разные
  });

  it("разные валюты/суммы/дни считаются разными операциями", () => {
    const existing = new Map([[keyOf("2024-05-02", -350, "EUR"), 1]]);
    const { toInsert, skipped } = dedupStatementRows(
      [
        row({}), // покрыта
        row({ currency: "USD" }), // другая валюта → новая
        row({ cents: -351 }), // другая сумма → новая
        row({ dateIso: "2024-05-03", date: new Date("2024-05-03T00:00:00Z") }), // другой день → новая
      ],
      existing
    );
    expect(skipped).toBe(1);
    expect(toInsert).toHaveLength(3);
  });

  it("идемпотентность: повторная вставка тех же строк (existing уже включает их) → всё skip", () => {
    // Симулируем второй импорт: existing = то, что добавил первый импорт.
    const existing = new Map([[keyOf("2024-05-02", -350, "EUR"), 2]]);
    const { toInsert, skipped } = dedupStatementRows([row({}), row({})], existing);
    expect(skipped).toBe(2);
    expect(toInsert).toHaveLength(0);
  });
});
