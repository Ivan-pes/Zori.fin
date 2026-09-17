import Link from "next/link";
import { Brand } from "@/components/Brand";
import { BudgetRing } from "@/components/BudgetRing";
import { getLocale } from "@/lib/i18n/server";
import { translator } from "@/lib/i18n/dictionaries";

/**
 * Статичная демка на выдуманных данных. Показывает ЛИЧНЫЙ режим — текущий
 * флагман продукта: заначка до зарплаты, бюджеты-конверты, счета впереди,
 * темп месяца, AI-чат. Цифры согласованы между собой (доход 2 840 = потрачено
 * 1 274 + можно 618 + в сбережения 948; 618/12 дн ≈ 51/день).
 */
export default async function Demo() {
  const tr = translator(await getLocale());
  return (
    <>
      <div
        className="demo-banner"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "10px 20px",
          background: "var(--ink)",
          color: "#fff",
          fontSize: 13.5,
        }}
      >
        <span>{tr("demo.banner")}</span>
        <span style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <Link href="/" style={{ color: "rgba(255,255,255,.75)" }}>{tr("demo.toHome")}</Link>
          <Link href="/register" className="btn btn-accent" style={{ padding: "7px 14px" }}>{tr("demo.startFree")}</Link>
        </span>
      </div>

      <div className="app app--demo">
        <aside className="side">
          <Link href="/"><Brand /></Link>
          <div className="nav-item on"><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg>{tr("nav.overview")}</div>
          <div className="nav-item"><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>{tr("nav.assistant")}</div>
          <div className="nav-item"><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 9 9h-9z" /></svg>{tr("bud.nav")}</div>
          <div className="nav-item"><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>{tr("nav.calendar")}</div>
          <div className="nav-item"><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>{tr("nav.goals")}</div>
          <div className="nav-item"><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h10" /></svg>{tr("nav.transactions")}</div>
          <div className="nav-item"><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>{tr("nav.categories")}</div>
          <div className="nav-item"><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M2 12h20" /><circle cx="12" cy="12" r="9" /></svg>{tr("subs.nav")}</div>
          <div className="nav-group">{tr("nav.tools")}</div>
          <div className="nav-item"><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M7 12h10" /></svg>{tr("nav.scan")}</div>
          <div className="nav-group">{tr("nav.settingsGroup")}</div>
          <div className="nav-item"><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 7h7M3 7h7M14 17h7M3 17h7" /><circle cx="10" cy="7" r="2" /><circle cx="14" cy="17" r="2" /></svg>{tr("nav.integrations")}</div>
          <div className="user">
            <div className="av">И</div>
            <div className="meta"><b>Ivan K.</b><br /><span>Plus · €11/{tr("common.perMonth")}</span></div>
          </div>
        </aside>

        <main className="main">
          <div className="topbar">
            <div>
              <h1>{tr("demo.greeting")}</h1>
              <div className="sub">{tr("demo.asof")}</div>
            </div>
            <div className="actions">
              <span className="pill"><span className="g" />{tr("demo.synced")}</span>
              <Link href="/register" className="btn btn-dark">{tr("demo.startFreePlain")}</Link>
            </div>
          </div>

          <div className="kpi-row">
            <div className="kpi">
              <div className="k-top"><span className="k-lbl">{tr("ps.kpiIncome", { month: tr("demo.month") })}</span><span className="k-ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg></span></div>
              <div className="k-val">€2 840</div>
              <div className="k-delta up">{tr("demo.deltaMay")}</div>
            </div>
            <div className="kpi">
              <div className="k-top"><span className="k-lbl">{tr("ps.kpiSpending", { month: tr("demo.month") })}</span><span className="k-ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><path d="m19 15-5-5-4 4-3-3" /></svg></span></div>
              <div className="k-val">€1 274</div>
              <div className="k-delta down">{tr("demo.expDelta")}</div>
            </div>
            <div className="kpi">
              <div className="k-top"><span className="k-lbl">{tr("ps.kpiSaved")}</span><span className="k-ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg></span></div>
              <div className="k-val" style={{ color: "var(--accent-ink)" }}>€640</div>
              <div className="k-delta up">{tr("ps.savingsRate", { pct: 23 })}</div>
            </div>
            <div className="kpi">
              <div className="k-top"><span className="k-lbl">{tr("ps.kpiBalance")}</span><span className="k-ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg></span></div>
              <div className="k-val">€3 415</div>
              <div className="k-delta up">{tr("ps.bufferOf", { amount: "€500" })}</div>
            </div>
          </div>

          <div className="grid-2">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Заначка до зарплаты — фирменная карточка личного режима */}
              <div className="sts">
                <div className="glow" />
                <div className="lbl">{tr("ps.stsLabel")}</div>
                <div className="big">€618</div>
                <div className="cap">{tr("ps.stsCap", { date: tr("demo.paydayDate") })}</div>
                <div className="sts-bar" role="img" aria-label={`${tr("sts.hSpent")}, ${tr("sts.hCan")}, ${tr("sts.hSave")}`}>
                  <i className="sp" style={{ width: "45%" }} />
                  <i className="cn" style={{ width: "22%" }} />
                  <i className="sv" style={{ width: "33%" }} />
                </div>
                <div className="sts-bar-lbl">
                  <span><span className="d" style={{ background: "var(--ink-faint)" }} /> {tr("sts.hSpent")} <b>€1 274</b></span>
                  <span><span className="d" style={{ background: "var(--accent)" }} /> {tr("sts.hCan")} <b>€618</b></span>
                  <span><span className="d" style={{ background: "#CDE5DC" }} /> {tr("sts.hSave")} <b>€948</b></span>
                </div>
                <div className="perday">{tr("ps.perDay", { amount: "€51", n: 12 })}</div>
                <div className="track">
                  <div className="tl">
                    <span>{tr("ps.today")}</span>
                    <span>{tr("ps.periodPassed", { pct: 63 })}</span>
                    <span>{tr("demo.paydayDate")}</span>
                  </div>
                  <div className="ptbar"><i style={{ width: "63%" }} /></div>
                </div>
              </div>

              {/* Темп месяца */}
              <div className="panel">
                <div className="panel-head"><h3>{tr("ps.paceTitle")}</h3><span style={{ fontSize: 12, color: "var(--ink-faint)" }}>{tr("demo.month")}</span></div>
                <div className="pace-bar">
                  <i style={{ width: "64%", background: "var(--accent)" }} />
                  <span className="pace-mark" style={{ left: "63%" }} />
                </div>
                <div className="pace-line">{tr("ps.paceLine", { spent: 64, month: 63 })}</div>
                <div className="pace-status" style={{ color: "var(--accent-ink)" }}>{tr("ps.paceOk")}</div>
              </div>
            </div>

            <div className="panel assist">
              <div className="panel-head"><h3>{tr("nav.assistant")}</h3><span style={{ fontSize: 12, color: "var(--ink-faint)", display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />{tr("ov.online")}</span></div>
              <div className="chat-scroll">
                <div className="chat">
                  <div className="bubble b-user" style={{ fontSize: 13.5 }}>{tr("demo.chatQ")}</div>
                  <div className="bubble b-ai" style={{ fontSize: 13.5 }}>
                    <div className="who"><span className="d" />Zori</div>
                    {tr("demo.chatA")}
                  </div>
                </div>
              </div>
              <div className="suggest">
                <button>{tr("demo.sug1")}</button>
                <button>{tr("demo.sug2")}</button>
                <button>{tr("demo.sug3")}</button>
              </div>
              <div className="chat-input">
                <input placeholder={tr("chat.placeholder")} disabled />
                <div className="send"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m22 2-7 20-4-9-9-4z" /></svg></div>
              </div>
            </div>
          </div>

          <div className="grid-2">
            {/* Бюджеты-конверты */}
            <div className="panel">
              <div className="panel-head"><h3>{tr("bud.title")}</h3><span style={{ fontSize: 12, color: "var(--ink-faint)" }}>{tr("demo.month")}</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <BudgetRing pct={64} pace="ontrack" size={56} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: 14 }}>{tr("demo.catGroceries")}</b>
                    <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{tr("bud.spentOf", { spent: "€288", limit: "€450" })}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--accent-ink)" }}>{tr("bud.remaining", { amount: "€162" })} · {tr("bud.paceOntrack")}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <BudgetRing pct={92} pace="over" size={56} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: 14 }}>{tr("demo.catCafe")}</b>
                    <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{tr("bud.spentOf", { spent: "€138", limit: "€150" })}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--danger)" }}>{tr("bud.remaining", { amount: "€12" })} · {tr("bud.paceOver")}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <BudgetRing pct={40} pace="under" size={56} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: 14 }}>{tr("demo.catFun")}</b>
                    <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{tr("bud.spentOf", { spent: "€48", limit: "€120" })}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-soft)" }}>{tr("bud.remaining", { amount: "€72" })} · {tr("bud.paceUnder")}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Счета и подписки впереди */}
            <div className="panel">
              <div className="panel-head"><h3>{tr("ps.upcomingBills")}</h3><span style={{ fontSize: 13, color: "var(--accent-ink)", fontWeight: 600 }}>{tr("demo.all")}</span></div>
              <table className="tx-table tx-full">
                <tbody>
                  <tr><td><span className="tx-name">Netflix</span></td><td style={{ color: "var(--ink-faint)", fontSize: 12.5, whiteSpace: "nowrap" }}>{tr("ps.inDays", { n: 3, date: "22.06" })}</td><td className="amt neg">−€11</td></tr>
                  <tr><td><span className="tx-name">Spotify</span></td><td style={{ color: "var(--ink-faint)", fontSize: 12.5, whiteSpace: "nowrap" }}>{tr("ps.inDays", { n: 7, date: "26.06" })}</td><td className="amt neg">−€9</td></tr>
                  <tr><td><span className="tx-name">iCloud</span></td><td style={{ color: "var(--ink-faint)", fontSize: 12.5, whiteSpace: "nowrap" }}>{tr("ps.inDays", { n: 9, date: "28.06" })}</td><td className="amt neg">−€3</td></tr>
                  <tr><td><span className="tx-name">{tr("demo.catRent")}</span></td><td style={{ color: "var(--ink-faint)", fontSize: 12.5, whiteSpace: "nowrap" }}>{tr("ps.inDays", { n: 12, date: "01.07" })}</td><td className="amt neg">−€700</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid-2">
            <div className="panel">
              <div className="panel-head"><h3>{tr("demo.recentTx")}</h3><span style={{ fontSize: 13, color: "var(--accent-ink)", fontWeight: 600 }}>{tr("demo.all")}</span></div>
              <table className="tx-table">
                <thead><tr><th>{tr("demo.thDesc")}</th><th>{tr("demo.thCat")}</th><th style={{ textAlign: "right" }}>{tr("demo.thAmount")}</th></tr></thead>
                <tbody>
                  <tr><td><span className="tx-ic">↑</span><span className="tx-name">{tr("demo.catSalary")} · Acme GmbH</span></td><td><span className="cat-tag" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>{tr("demo.catSalary")}</span></td><td className="amt pos">+€2 600</td></tr>
                  <tr><td><span className="tx-ic">S</span><span className="tx-name">Silpo Supermarket</span></td><td><span className="cat-tag">{tr("demo.catGroceries")}</span></td><td className="amt neg">−€86</td></tr>
                  <tr><td><span className="tx-ic">⌂</span><span className="tx-name">SEPA · {tr("demo.catRent")}</span></td><td><span className="cat-tag">{tr("demo.catRent")}</span></td><td className="amt neg">−€700</td></tr>
                  <tr><td><span className="tx-ic">▶</span><span className="tx-name">Netflix</span></td><td><span className="cat-tag" style={{ background: "var(--warn-soft)", color: "#7A4E18" }}>{tr("subs.nav")}</span></td><td className="amt neg">−€11</td></tr>
                  <tr><td><span className="tx-ic">☕</span><span className="tx-name">Blue Cup Coffee</span></td><td><span className="cat-tag">{tr("demo.catCafe")}</span></td><td className="amt neg">−€14</td></tr>
                </tbody>
              </table>
            </div>

            <div className="panel">
              <div className="panel-head"><h3>{tr("rep.whereMoney")}</h3><span style={{ fontSize: 12, color: "var(--ink-faint)" }}>{tr("demo.month")}</span></div>
              <div className="brk">
                <div className="brk-item"><div className="bl"><b>{tr("demo.catRent")}</b><span>€700 · 55%</span></div><div className="bar"><i style={{ width: "55%", background: "var(--accent)" }} /></div></div>
                <div className="brk-item"><div className="bl"><b>{tr("demo.catGroceries")}</b><span>€288 · 23%</span></div><div className="bar"><i style={{ width: "23%", background: "#3E9C7C" }} /></div></div>
                <div className="brk-item"><div className="bl"><b>{tr("demo.catCafe")}</b><span>€138 · 11%</span></div><div className="bar"><i style={{ width: "11%", background: "#6BB89E" }} /></div></div>
                <div className="brk-item"><div className="bl"><b>{tr("subs.nav")}</b><span>€45 · 4%</span></div><div className="bar"><i style={{ width: "4%", background: "var(--warn)" }} /></div></div>
                <div className="brk-item"><div className="bl"><b>{tr("demo.catOther")}</b><span>€103 · 7%</span></div><div className="bar"><i style={{ width: "7%", background: "#C9C4B6" }} /></div></div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
