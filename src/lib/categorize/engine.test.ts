import { describe, it, expect } from "vitest";
import { categorize, type UserRule } from "./engine";

describe("categorize — цепочка user-rules → global → AI (§4.3)", () => {
  it("правило пользователя побеждает глобальное правило", async () => {
    // "Netflix" по глобальному личному правилу → «Подписки»,
    // но у пользователя правило: этот мерчант — «Развлечения».
    const userRules = new Map<string, UserRule>([["netflix", { category: "Развлечения" }]]);
    const r = await categorize("Netflix", "charge", { accountType: "personal", userRules });
    expect(r.category).toBe("Развлечения");
    expect(r.method).toBe("user");
    expect(r.confidence).toBe(1);
  });

  it("сопоставляет правило по нормализованному merchantKey", async () => {
    const userRules = new Map<string, UserRule>([["mercadona av", { category: "Продукты", subcategory: "Овощи" }]]);
    const r = await categorize("Mercadona Av.ramon Y Caja, Tenerife", "charge", {
      accountType: "personal",
      userRules,
    });
    expect(r.category).toBe("Продукты");
    expect(r.subcategory).toBe("Овощи");
    expect(r.method).toBe("user");
  });

  it("глобальное правило, когда нет правила пользователя", async () => {
    const r = await categorize("Аренда офиса", "charge", { accountType: "business" });
    expect(r.category).toBe("Аренда");
    expect(r.method).toBe("rule");
    expect(r.confidence).toBe(1);
  });

  it("fee → детерминированная категория комиссий, без ИИ", async () => {
    const r = await categorize(null, "fee", { accountType: "business" });
    expect(r.category).toBe("Банковские комиссии");
    expect(r.method).toBe("rule");
  });

  it("нет описания и нет правила → Прочее (rule, confidence null)", async () => {
    const r = await categorize(null, "charge", { accountType: "business" });
    expect(r.category).toBe("Прочее");
    expect(r.confidence).toBeNull();
  });
});
