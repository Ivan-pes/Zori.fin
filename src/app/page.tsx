import Link from "next/link";
import { Brand } from "@/components/Brand";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getLocale } from "@/lib/i18n/server";
import { translator } from "@/lib/i18n/dictionaries";

export default async function Landing() {
  const locale = await getLocale();
  const tr = translator(locale);
  const months = tr("l.card.months").split(",");

  return (
    <>
      <nav>
        <div className="wrap nav-in">
          <Brand />
          <div className="navlinks">
            <a href="#personal">{tr("l.nav.personal")}</a>
            <a href="#features">{tr("l.nav.features")}</a>
            <a href="#pricing">{tr("l.nav.pricing")}</a>
            <Link href="/demo">{tr("l.nav.demo")}</Link>
          </div>
          <div className="nav-cta">
            <LanguageSwitcher current={locale} />
            <Link href="/signin" className="btn btn-ghost">{tr("l.nav.signin")}</Link>
            <Link href="/register" className="btn btn-dark">{tr("l.nav.start")}</Link>
          </div>
        </div>
      </nav>

      <header className="hero">
        <div className="wrap hero-grid">
          <div>
            <span className="eyebrow"><span className="dot" />{tr("l.hero.eyebrow")}</span>
            <h1 className="hero-title">{tr("l.hero.title1")}<em>{tr("l.hero.titleEm")}</em>{tr("l.hero.title2")}</h1>
            <p className="hero-sub">{tr("l.hero.sub")}</p>
            <div className="hero-actions">
              <Link href="/register" className="btn btn-dark" style={{ padding: "13px 22px", fontSize: 15 }}>
                {tr("l.hero.ctaStripe")}
              </Link>
              <Link href="/demo" className="btn btn-accent" style={{ padding: "13px 22px", fontSize: 15 }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
                {tr("l.hero.ctaDemo")}
              </Link>
            </div>
            <p className="hero-note">{tr("l.hero.note")}</p>
          </div>

          <div className="hero-visual">
            <div className="glass-card">
              <div className="gc-top">
                <span className="lbl">{tr("l.card.label")}</span>
                <span style={{ fontSize: 12, color: "var(--ink-faint)", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />Live
                </span>
              </div>
              <div className="gc-body">
                <div className="metric-row">
                  <div className="metric-big">€18 240</div>
                  <span className="metric-chip">▲ 12,4%</span>
                </div>
                <div className="metric-cap">{tr("l.card.cap")}</div>
                <svg className="spark" viewBox="0 0 320 84" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#1F7A5C" stopOpacity=".18" />
                      <stop offset="1" stopColor="#1F7A5C" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0,64 C28,60 40,50 64,52 C92,54 104,30 132,34 C162,38 172,20 200,24 C232,28 244,14 268,16 C292,18 304,10 320,12"
                    fill="none" stroke="#1F7A5C" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M0,64 C28,60 40,50 64,52 C92,54 104,30 132,34 C162,38 172,20 200,24 C232,28 244,14 268,16 C292,18 304,10 320,12 L320,84 L0,84 Z" fill="url(#g1)" />
                </svg>
                <div className="mini-row">{months.map((m, i) => <span key={i}>{m}</span>)}</div>
              </div>
              <div className="alert-strip">
                <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
                <p><strong>{tr("l.card.alertLabel")}</strong> {tr("l.card.alertBody")}</p>
              </div>
            </div>
            <div className="float-chip fc-1"><span className="av">✓</span>{tr("l.card.chip1")}</div>
            <div className="float-chip fc-2"><span className="av">€</span>{tr("l.card.chip2")}</div>
          </div>
        </div>
      </header>

      <section className="block wrap" id="personal" style={{ paddingTop: 8 }}>
        <div className="personal-band">
          <div className="glow" />
          <div className="pb-head">
            <span className="eyebrow"><span className="dot" />{tr("l.personal.tag")}</span>
            <h2>{tr("l.personal.h2")}</h2>
            <p>{tr("l.personal.sub")}</p>
          </div>
          <div className="pb-grid">
            <div className="pb-item">
              <div className="pb-ic"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg></div>
              <b>{tr("l.personal.b1t")}</b>
              <span>{tr("l.personal.b1d")}</span>
            </div>
            <div className="pb-item">
              <div className="pb-ic"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 9 9h-9z" /></svg></div>
              <b>{tr("l.personal.b2t")}</b>
              <span>{tr("l.personal.b2d")}</span>
            </div>
            <div className="pb-item">
              <div className="pb-ic"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><path d="M8 9l3 3 5-6" /><path d="M8 15h8" /></svg></div>
              <b>{tr("l.personal.b3t")}</b>
              <span>{tr("l.personal.b3d")}</span>
            </div>
            <div className="pb-item">
              <div className="pb-ic"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg></div>
              <b>{tr("l.personal.b4t")}</b>
              <span>{tr("l.personal.b4d")}</span>
            </div>
          </div>
          <div className="pb-actions">
            <Link href="/register?flow=personal" className="btn btn-accent" style={{ padding: "13px 22px", fontSize: 15 }}>{tr("l.personal.cta")}</Link>
            <Link href="/demo" className="btn btn-line" style={{ padding: "13px 22px", fontSize: 15 }}>{tr("l.nav.demo")}</Link>
          </div>
        </div>
      </section>

      <div className="logos wrap">
        <p className="cap">{tr("l.logos.cap")}</p>
        <div className="logos-row">
          <span>CSV</span><span>PDF</span><span>Stripe</span><span>{tr("l.logos.manual")}</span><span>{tr("l.logos.scan")}</span>
        </div>
      </div>

      <section className="block wrap" id="features">
        <div className="sec-head">
          <span className="tag">{tr("l.feat.tag")}</span>
          <h2>{tr("l.feat.h2")}</h2>
          <p>{tr("l.feat.sub")}</p>
        </div>
        <div className="feat-grid">
          <div className="feat">
            <div className="fi"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg></div>
            <h3>{tr("l.feat1.t")}</h3>
            <p>{tr("l.feat1.d")}</p>
          </div>
          <div className="feat">
            <div className="fi"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg></div>
            <h3>{tr("l.feat2.t")}</h3>
            <p>{tr("l.feat2.d")}</p>
          </div>
          <div className="feat">
            <div className="fi"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4" /><circle cx="12" cy="12" r="3" /></svg></div>
            <h3>{tr("l.feat3.t")}</h3>
            <p>{tr("l.feat3.d")}</p>
          </div>
          <div className="feat">
            <div className="fi"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h10" /></svg></div>
            <h3>{tr("l.feat4.t")}</h3>
            <p>{tr("l.feat4.d")}</p>
          </div>
          <div className="feat">
            <div className="fi"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg></div>
            <h3>{tr("l.feat5.t")}</h3>
            <p>{tr("l.feat5.d")}</p>
          </div>
          <div className="feat">
            <div className="fi"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg></div>
            <h3>{tr("l.feat6.t")}</h3>
            <p>{tr("l.feat6.d")}</p>
          </div>
        </div>
      </section>

      <section className="block wrap">
        <div className="split">
          <div>
            <span className="tag">{tr("l.ai.tag")}</span>
            <h2 style={{ marginTop: 14 }}>{tr("l.ai.h2")}</h2>
            <p className="lead">{tr("l.ai.lead")}</p>
            <div className="checks">
              <div className="check"><span className="ck"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg></span>{tr("l.ai.check1")}</div>
              <div className="check"><span className="ck"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg></span>{tr("l.ai.check2")}</div>
              <div className="check"><span className="ck"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg></span>{tr("l.ai.check3")}</div>
            </div>
          </div>
          <div className="chat-demo">
            <div className="bubble b-user">{tr("l.ai.q1")}</div>
            <div className="bubble b-ai">
              <div className="who"><span className="d" />Zori</div>
              {tr("l.ai.a1")}
            </div>
            <div className="bubble b-user">{tr("l.ai.q2")}</div>
            <div className="bubble b-ai">
              <div className="who"><span className="d" />Zori</div>
              {tr("l.ai.a2")}
            </div>
            <div className="chat-input">
              <input placeholder={tr("l.ai.placeholder")} disabled />
              <div className="send"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m22 2-7 20-4-9-9-4z" /></svg></div>
            </div>
          </div>
        </div>
      </section>

      <section className="block wrap" id="pricing">
        <div className="sec-head" style={{ textAlign: "center", margin: "0 auto 48px" }}>
          <span className="tag">{tr("l.price.tag")}</span>
          <h2>{tr("l.price.h2")}</h2>
          <p style={{ margin: "0 auto" }}>{tr("l.price.sub")}</p>
        </div>

        <div className="price-tier">{tr("l.price.forSelf")}</div>
        <div className="price-grid price-2">
          <div className="plan">
            <div className="pname">Free</div>
            <div className="pprice">€0<span>{tr("l.price.perMonth")}</span></div>
            <div className="pdesc">{tr("l.price.pFreeDesc")}</div>
            <ul>
              <li><span className="ck">✓</span>{tr("l.price.pf1")}</li>
              <li><span className="ck">✓</span>{tr("l.price.pf2")}</li>
              <li><span className="ck">✓</span>{tr("l.price.pf3")}</li>
            </ul>
            <Link href="/register?flow=personal" className="btn btn-line" style={{ width: "100%", justifyContent: "center" }}>{tr("l.nav.start")}</Link>
          </div>
          <div className="plan feature">
            <div className="badge">{tr("l.personal.tag2")}</div>
            <div className="pname">Plus</div>
            <div className="pprice">€11<span>{tr("l.price.perMonth")}</span></div>
            <div className="pdesc">{tr("l.price.plusDesc")}</div>
            <ul>
              <li><span className="ck">✓</span>{tr("l.price.pp1")}</li>
              <li><span className="ck">✓</span>{tr("l.price.pp2")}</li>
              <li><span className="ck">✓</span>{tr("l.price.pp3")}</li>
              <li><span className="ck">✓</span>{tr("l.price.pp4")}</li>
            </ul>
            <Link href="/register?flow=personal" className="btn btn-accent" style={{ width: "100%", justifyContent: "center" }}>{tr("l.price.choose", { plan: "Plus" })}</Link>
          </div>
        </div>

        <div className="price-tier" style={{ marginTop: 40 }}>{tr("l.price.forBiz")}</div>
        <div className="price-grid">
          <div className="plan">
            <div className="pname">Starter</div>
            <div className="pprice">€22<span>{tr("l.price.perMonth")}</span></div>
            <div className="pdesc">{tr("l.price.starterDesc")}</div>
            <ul>
              <li><span className="ck">✓</span>{tr("l.price.s1")}</li>
              <li><span className="ck">✓</span>{tr("l.price.s2")}</li>
              <li><span className="ck">✓</span>{tr("l.price.s3")}</li>
              <li><span className="ck">✓</span>{tr("l.price.s4")}</li>
            </ul>
            <Link href="/register" className="btn btn-line" style={{ width: "100%", justifyContent: "center" }}>{tr("l.price.choose", { plan: "Starter" })}</Link>
          </div>
          <div className="plan feature">
            <div className="badge">{tr("l.price.popular")}</div>
            <div className="pname">Growth</div>
            <div className="pprice">€42<span>{tr("l.price.perMonth")}</span></div>
            <div className="pdesc">{tr("l.price.growthDesc")}</div>
            <ul>
              <li><span className="ck">✓</span>{tr("l.price.g1")}</li>
              <li><span className="ck">✓</span>{tr("l.price.g2")}</li>
              <li><span className="ck">✓</span>{tr("l.price.g3")}</li>
              <li><span className="ck">✓</span>{tr("l.price.g4")}</li>
              <li><span className="ck">✓</span>{tr("l.price.g5")}</li>
            </ul>
            <Link href="/register" className="btn btn-accent" style={{ width: "100%", justifyContent: "center" }}>{tr("l.price.choose", { plan: "Growth" })}</Link>
          </div>
          <div className="plan">
            <div className="pname">Pro</div>
            <div className="pprice">€99<span>{tr("l.price.perMonth")}</span></div>
            <div className="pdesc">{tr("l.price.proDesc")}</div>
            <ul>
              <li><span className="ck">✓</span>{tr("l.price.p1")}</li>
              <li><span className="ck">✓</span>{tr("l.price.p2")}</li>
              <li><span className="ck">✓</span>{tr("l.price.p3")}</li>
              <li><span className="ck">✓</span>{tr("l.price.p4")}</li>
              <li><span className="ck">✓</span>{tr("l.price.p5")}</li>
            </ul>
            <Link href="/register" className="btn btn-line" style={{ width: "100%", justifyContent: "center" }}>{tr("l.price.choose", { plan: "Pro" })}</Link>
          </div>
        </div>
      </section>

      <section className="block wrap">
        <div className="cta-band">
          <div className="glow" />
          <div style={{ position: "relative" }}>
            <h2>{tr("l.cta.h2a")}<br />{tr("l.cta.h2b")}</h2>
            <p>{tr("l.cta.sub")}</p>
            <Link href="/register" className="btn btn-accent" style={{ padding: "14px 26px", fontSize: 15 }}>{tr("l.cta.btn")}</Link>
          </div>
        </div>
      </section>

      <footer className="wrap">
        <div className="foot-grid">
          <div>
            <div style={{ marginBottom: 14 }}><Brand /></div>
            <p style={{ fontSize: 14, color: "var(--ink-soft)", maxWidth: "30ch" }}>{tr("l.foot.tagline")}</p>
          </div>
          <div><h4>{tr("l.foot.product")}</h4><a href="#features">{tr("l.nav.features")}</a><a href="#pricing">{tr("l.nav.pricing")}</a><Link href="/demo">{tr("l.nav.demo")}</Link></div>
          <div><h4>{tr("l.foot.account")}</h4><Link href="/signin">{tr("l.nav.signin")}</Link><Link href="/register">{tr("l.foot.register")}</Link></div>
          <div><h4>{tr("l.foot.legal")}</h4><Link href="/privacy">{tr("l.foot.privacy")}</Link><Link href="/terms">{tr("l.foot.terms")}</Link></div>
        </div>
        <div className="foot-bottom">
          <span>{tr("l.foot.copyright")}</span>
          <span>{tr("l.foot.madefor")}</span>
        </div>
      </footer>
    </>
  );
}
