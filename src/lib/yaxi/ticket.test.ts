import { beforeAll, describe, expect, it } from "vitest";

// Ключи задаём ДО импорта модуля: env.ts парсит process.env при загрузке.
beforeAll(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.AUTH_SECRET ??= "test-secret";
  process.env.YAXI_KEY_ID = "test-key-id";
  process.env.YAXI_SECRET_KEY = Buffer.from("super-secret-32-bytes-for-tests!").toString("base64");
});

describe("yaxi ticket", () => {
  it("выпускает тикет по формату YAXI и проверяет свой же HMAC", async () => {
    const { issueTicket, verifyResultJwt } = await import("./ticket");
    const { ticket, ticketId } = issueTicket("Transactions", {
      account: { iban: "NL58YAXI1234567890", currency: "EUR" },
      range: { from: "2026-01-01" },
    });

    const [h, p] = ticket.split(".") as [string, string];
    const header = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));

    expect(header).toEqual({ alg: "HS256", typ: "JWT", kid: "test-key-id" });
    expect(payload.data.service).toBe("Transactions");
    expect(payload.data.id).toBe(ticketId);
    expect(payload.data.data.account.iban).toBe("NL58YAXI1234567890");
    // exp в пределах 15 минут (лимит YAXI)
    expect(payload.exp).toBeGreaterThan(Date.now() / 1000);
    expect(payload.exp).toBeLessThanOrEqual(Date.now() / 1000 + 900);

    // result-JWT подписывается тем же ключом — наш verify должен принять
    // корректно подписанный токен (симулируем ответ YAXI)…
    const { createHmac } = await import("node:crypto");
    const key = Buffer.from(process.env.YAXI_SECRET_KEY!, "base64");
    const rp = Buffer.from(
      JSON.stringify({
        data: { data: [{ ok: true }], ticketId, timestamp: new Date().toISOString() },
        exp: Math.floor(Date.now() / 1000) + 300,
      })
    ).toString("base64url");
    const rh = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const sig = createHmac("sha256", key).update(`${rh}.${rp}`).digest("base64url");
    const result = verifyResultJwt(`${rh}.${rp}.${sig}`);
    expect(result.ticketId).toBe(ticketId);
    expect(result.data).toEqual([{ ok: true }]);
  });

  it("отклоняет подделку и битую подпись", async () => {
    const { verifyResultJwt } = await import("./ticket");
    const rh = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
    const rp = Buffer.from(
      JSON.stringify({ data: { ticketId: "x", data: [] } })
    ).toString("base64url");
    expect(() => verifyResultJwt(`${rh}.${rp}.AAAA`)).toThrow(/signature/i);
    expect(() => verifyResultJwt("не-jwt")).toThrow();
  });

  it("data.data присутствует всегда: null, если вход не передан (Accounts)", async () => {
    // Сервер YAXI требует поле data.data даже пустым — без него TicketException INVALID.
    const { issueTicket } = await import("./ticket");
    const { ticket } = issueTicket("Accounts");
    const payload = JSON.parse(Buffer.from(ticket.split(".")[1]!, "base64url").toString("utf8"));
    expect("data" in payload.data).toBe(true);
    expect(payload.data.data).toBeNull();
    expect(payload.data.service).toBe("Accounts");
  });
});
