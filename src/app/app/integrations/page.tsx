import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { bankEnabled, yaxiEnabled, env } from "@/lib/env";
import { Sidebar } from "@/components/Sidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { SyncButton } from "@/components/SyncButton";
import { BankConnect } from "@/components/BankConnect";
import { YaxiConnect } from "@/components/YaxiConnect";
import { CsvImport } from "@/components/CsvImport";
import { BankCard } from "@/components/BankCard";
import { getAccessibleOrgs } from "@/lib/session";
import { DisconnectButton } from "@/components/DisconnectButton";
import { yaxiClientUrl } from "@/lib/yaxi/ticket";
import { MonthCoverage } from "@/components/MonthCoverage";
import { getOrgPlan } from "@/lib/billing/plan";
import { getLocale } from "@/lib/i18n/server";
import { translator } from "@/lib/i18n/dictionaries";
import { localeTag } from "@/lib/i18n";
import { getAccountContext } from "@/lib/account/context";

export default async function IntegrationsPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const locale = await getLocale();
  const tr = translator(locale);
  const tag = localeTag(locale);

  const [org] = await sql<{ id: string; name: string }[]>`
    select id, name from organizations where id = ${await getCurrentOrgId()}
  `;
  if (!org) redirect("/signin");

  const personal = (await getAccountContext(org.id))?.type === "personal";

  // Личное: только PayPal из «прочих», бизнес-сервисы (Shopify/QuickBooks/Xero) скрыты.
  const OTHERS = personal
    ? [{ letter: "P", color: "#003087", name: "PayPal", desc: tr("int.paypalDesc") }]
    : [
        { letter: "P", color: "#003087", name: "PayPal", desc: tr("int.paypalDesc") },
        { letter: "Sh", color: "#96BF48", name: "Shopify", desc: tr("int.shopifyDesc") },
        { letter: "QB", color: "#2CA01C", name: "QuickBooks", desc: tr("int.quickbooksDesc"), pro: true },
        { letter: "X", color: "#13B5EA", name: "Xero", desc: tr("int.xeroDesc"), pro: true },
      ];

  const { plan } = await getOrgPlan(org.id);

  // Абсолютная дата (для «когда подключён») и относительное время (для «когда обновлено»).
  const fmtDate = (d: Date | null) =>
    d ? new Date(d).toLocaleDateString(tag, { day: "numeric", month: "short", year: "numeric" }) : null;
  const relTime = (d: Date | null): string | null => {
    if (!d) return null;
    const sec = Math.round((Date.now() - new Date(d).getTime()) / 1000);
    if (sec < 60) return tr("int.justNow");
    const rtf = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });
    const min = Math.round(sec / 60);
    if (min < 60) return rtf.format(-min, "minute");
    const hr = Math.round(min / 60);
    if (hr < 24) return rtf.format(-hr, "hour");
    const day = Math.round(hr / 24);
    if (day < 30) return rtf.format(-day, "day");
    return new Date(d).toLocaleDateString(tag, { day: "numeric", month: "short", year: "numeric" });
  };
  // «Свежее» обновление — в пределах суток (для зелёной точки-индикатора).
  const isFresh = (d: Date | null) => !!d && Date.now() - new Date(d).getTime() < 24 * 3600_000;

  const [intg] = await sql<{ last_synced_at: Date | null; created_at: Date | null }[]>`
    select last_synced_at, created_at from integrations
    where org_id = ${org.id} and provider = 'stripe' and status = 'active'
    order by created_at desc limit 1
  `;
  const connected = !!intg;
  const [cnt] = await sql<{ n: number }[]>`
    select count(*)::int as n from transactions where org_id = ${org.id} and source = 'stripe'
  `;
  const txCount = cnt?.n ?? 0;
  const stripeConnectedAt = fmtDate(intg?.created_at ?? null);
  const stripeUpdatedAt = relTime(intg?.last_synced_at ?? null);
  const stripeFresh = isFresh(intg?.last_synced_at ?? null);

  // Все живые банки (мультибанк) + число операций по каждому.
  const bankRows = await sql<{ external_account_id: string; last_synced_at: Date | null; created_at: Date | null; metadata: { institution_name?: string; provider?: string } }[]>`
    select external_account_id, last_synced_at, created_at, metadata from integrations
    where org_id = ${org.id} and provider = 'gocardless' and status = 'active'
    order by created_at desc
  `;
  const bankCounts = await sql<{ external_account_id: string | null; n: number }[]>`
    select external_account_id, count(*)::int as n from transactions
    where org_id = ${org.id} and source = 'gocardless'
    group by external_account_id
  `;
  const countByAcct = new Map(bankCounts.map((r) => [r.external_account_id, r.n]));
  const banks = bankRows.map((b) => ({
    externalAccountId: b.external_account_id,
    connectionId: b.external_account_id.replace(/^yaxi:/, ""),
    viaYaxi: b.metadata?.provider === "yaxi",
    name: b.metadata?.institution_name ?? tr("int.bankFallback"),
    txCount: countByAcct.get(b.external_account_id) ?? 0,
    syncLabel: relTime(b.last_synced_at),
    connectedLabel: fmtDate(b.created_at),
    fresh: isFresh(b.last_synced_at),
  }));
  const hasBanks = banks.length > 0;

  // Загруженные выписки (CSV/PDF) — отдельная секция.
  const [csvCnt] = await sql<{ n: number }[]>`
    select count(*)::int as n from transactions where org_id = ${org.id} and source = 'csv'
  `;
  const csvCount = csvCnt?.n ?? 0;
  // Пространства пользователя для мульти-импорта выписки (личное + бизнес).
  const accessible = await getAccessibleOrgs();
  const typesRows = accessible.length
    ? await sql<{ id: string; type: string | null }[]>`
        select id, type from organizations where id = any(${accessible.map((o) => o.id)})`
    : [];
  const typeOf = new Map(typesRows.map((r) => [r.id, r.type === "personal" ? "personal" : "business"] as const));
  const importSpaces = accessible.map((o) => ({ id: o.id, name: o.name, type: typeOf.get(o.id) ?? "business" }));


  return (
    <div className="app">
      <Sidebar orgId={org.id} orgName={org.name} active="integrations" />

      <main className="main">
        <div className="topbar">
          <div>
            <h1>{tr("nav.integrations")}</h1>
            <div className="sub">{tr("int.sub")}</div>
          </div>
          <div className="actions"><SignOutButton locale={locale} /></div>
        </div>

        {bankEnabled && (
          <section className="bank-hero">
            <div className="bh-ic" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M4 18h16M6 18v-7M10 18v-7M14 18v-7M18 18v-7M3 8l9-5 9 5z" /></svg>
            </div>
            <div className="bh-txt">
              <div className="bh-title">
                {hasBanks ? tr("int.bankHeroConnectedTitle") : tr("int.bankHeroTitle")}
              </div>
              <p className="bh-sub">
                {hasBanks ? tr("int.bankHeroConnectedSub") : tr("int.bankHeroSub")}
              </p>
              <div className="bh-chips">
                <span className="bh-chip">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  {tr("int.chipReadOnly")}
                </span>
                <span className="bh-chip">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                  {tr("int.chipPsd2")}
                </span>
                <span className="bh-chip">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
                  {tr("int.chipRevoke")}
                </span>
              </div>
            </div>
            <div className="bh-cta">
              {yaxiEnabled ? (
                hasBanks ? (
                  <YaxiConnect defaultCountry={env.GOCARDLESS_COUNTRY} locale={locale} variant="line" cta={tr("int.bankAddMore")} />
                ) : (
                  <YaxiConnect defaultCountry={env.GOCARDLESS_COUNTRY} locale={locale} variant="hero" />
                )
              ) : (
                <BankConnect defaultCountry={env.GOCARDLESS_COUNTRY} locale={locale} variant="hero" />
              )}
            </div>
          </section>
        )}

        {/* Секция «Живые банки» (open banking) — каждый банк отдельно, со своим
            обновлением и удалением. */}
        {hasBanks && (
          <section className="int-section">
            <h2 className="int-section-h">{tr("int.sectionBanks")}</h2>
            <div className="bank-cards">
              {banks.map((b) => (
                <BankCard
                  key={b.externalAccountId}
                  connectionId={b.connectionId}
                  externalAccountId={b.externalAccountId}
                  institutionName={b.name}
                  txCount={b.txCount}
                  syncLabel={b.syncLabel}
                  connectedLabel={b.connectedLabel}
                  fresh={b.fresh}
                  clientUrl={yaxiClientUrl()}
                  disconnectConfirm={tr("int.bankDisconnectOne", { name: b.name })}
                  locale={locale}
                />
              ))}
            </div>
          </section>
        )}

        {/* Секция «Выписки» (CSV/PDF) — запасной ручной источник. */}
        {bankEnabled && (
          <section className="int-section">
            <h2 className="int-section-h">{tr("int.sectionStatements")}</h2>
            <div className="int-c">
              <p>{csvCount > 0 ? tr("int.statementsOn", { n: csvCount }) : tr("int.statementsEmpty")}</p>
              <CsvImport
                label={csvCount > 0 ? tr("int.uploadMore") : tr("int.uploadStatement")}
                locale={locale}
                spaces={importSpaces}
                currentOrgId={org.id}
              />
              {csvCount > 0 && (
                <div style={{ marginTop: 8 }}>
                  <DisconnectButton target="statements" confirmText={tr("int.statementsDisconnect")} locale={locale} />
                </div>
              )}
            </div>
          </section>
        )}

        <div className="int-grid">
          {!personal && (
          <div className="int-c">
            <div className="ih">
              <div className="il" style={{ background: "#635BFF" }}>S</div>
              <span className={`st-dot ${connected ? "st-on" : "st-off"}`}><span className="d" />{connected ? tr("int.connected") : tr("int.notConnected")}</span>
            </div>
            <b>Stripe</b>
            <p>
              {connected
                ? tr("int.stripeOn", { n: txCount, sync: "" })
                : tr("int.stripeOff")}
            </p>
            {connected && (
              <div className="int-dates">
                {stripeConnectedAt && <div className="cap">{tr("int.bankConnectedAt", { date: stripeConnectedAt })}</div>}
                {stripeUpdatedAt && (
                  <div className="cap cap-sync">
                    {tr("int.bankUpdatedAt", { date: stripeUpdatedAt })}
                    {stripeFresh && <i className="sync-dot" aria-hidden="true" />}
                  </div>
                )}
              </div>
            )}
            {connected ? (
              <>
                <SyncButton locale={locale} />
                <div style={{ marginTop: 8 }}>
                  <DisconnectButton
                    target="stripe"
                    confirmText={tr("int.stripeDisconnect")}
                    locale={locale}
                  />
                </div>
              </>
            ) : (
              <a className="btn btn-accent btn-sm" style={{ width: "100%" }} href="/api/stripe/connect">{tr("int.connect")}</a>
            )}
          </div>
          )}

          {OTHERS.map((o) => (
            <div className="int-c" key={o.name}>
              <div className="ih">
                <div className="il" style={{ background: o.color }}>{o.letter}</div>
                <span className="st-dot st-off"><span className="d" />{tr("int.notConnected")}</span>
              </div>
              <b>{o.name}{o.pro && <span className="pro-tag">Pro</span>}</b>
              <p>{o.desc}</p>
              <button className="btn btn-line btn-sm" style={{ width: "100%" }} disabled>{o.pro ? tr("int.proSoon") : tr("int.soon")}</button>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 18 }}>
          <MonthCoverage orgId={org.id} plan={plan} locale={locale} />
        </div>

        <div className="note info" style={{ maxWidth: 680 }}>
          <svg className="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          <span>{tr("int.readonlyNote")}</span>
        </div>
      </main>
    </div>
  );
}
