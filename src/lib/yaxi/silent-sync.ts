"use client";

import {
  RoutexClient,
  Result,
  AccountField,
  ConsentExpiredException,
  InvalidCredentialsException,
  ServiceBlockedException,
  type OBResponse,
} from "routex-client";
import { fetchTicket, decodeJwtData, fetchUserSecret, loadAccess } from "./flow-client";

// Тихий фоновый синк банка при заходе в приложение. Тот же путь, что в модалке
// (Accounts → Balances → Transactions → import), но БЕЗ интераптов: сохранённый
// доступ (recurringConsents) в окне согласия банк отдаёт без SCA. Как только
// вместо результата приходит диалог/редирект (банк хочет подтверждение) — тихо
// сдаёмся с "needs-interaction": пользователь обновит вручную. Никаких модалок.

export type SilentResult = "ok" | "needs-interaction" | "no-creds" | "error";

interface Account {
  iban: string;
  currency?: string;
}

export async function silentBankSync(opts: {
  connectionId: string;
  institutionName: string;
  clientUrl?: string | null;
}): Promise<SilentResult> {
  const userSecret = await fetchUserSecret();
  if (!userSecret) return "no-creds";
  const credentials = loadAccess(opts.connectionId, userSecret);
  if (!credentials) return "no-creds"; // доступ не сохранён (другой браузер и т.п.)

  // Без redirectUri: тихий синк не умеет уводить на страницу банка.
  const client = new RoutexClient(opts.clientUrl ? { url: new URL(opts.clientUrl) } : undefined);
  const needsUser = (r: OBResponse): boolean => !(r instanceof Result);

  try {
    const t1 = await fetchTicket("Accounts");
    const accResp = await client.accounts({
      credentials,
      ticket: t1.ticket,
      recurringConsents: true,
      fields: [AccountField.Iban, AccountField.Currency, AccountField.Name, AccountField.DisplayName, AccountField.Type],
    });
    if (needsUser(accResp)) return "needs-interaction";
    const accRes = accResp as Result;
    let session = accRes.session;
    const accounts = ((decodeJwtData(accRes.jwt) as Account[]) ?? []).filter((a) => a.iban);
    if (accounts.length === 0) return "error";

    const t2 = await fetchTicket("Balances");
    const balResp = await client.balances({
      credentials,
      session,
      ticket: t2.ticket,
      recurringConsents: true,
      accounts: accounts.map((a) => ({ iban: a.iban, currency: a.currency })),
    });
    if (needsUser(balResp)) return "needs-interaction";
    const balRes = balResp as Result;
    session = balRes.session ?? session;

    const from = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
    const txJwts: string[] = [];
    for (const a of accounts.slice(0, 15)) {
      const t3 = await fetchTicket("Transactions", { account: { iban: a.iban, currency: a.currency }, range: { from } });
      const txResp = await client.transactions({ credentials, session, ticket: t3.ticket, recurringConsents: true });
      if (needsUser(txResp)) return "needs-interaction";
      const txRes = txResp as Result;
      session = txRes.session ?? session;
      txJwts.push(txRes.jwt);
    }

    const res = await fetch("/api/bank/yaxi/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connectionId: opts.connectionId,
        institutionName: opts.institutionName,
        accountsJwt: accRes.jwt,
        balancesJwt: balRes.jwt,
        transactionsJwts: txJwts,
      }),
    });
    return res.ok ? "ok" : "error";
  } catch (err) {
    // Истёкшее согласие / отзыв / банк требует действий — нужен ручной проход.
    if (
      err instanceof ConsentExpiredException ||
      err instanceof InvalidCredentialsException ||
      err instanceof ServiceBlockedException
    ) {
      return "needs-interaction";
    }
    console.error("silent bank sync error:", err);
    return "error";
  }
}
