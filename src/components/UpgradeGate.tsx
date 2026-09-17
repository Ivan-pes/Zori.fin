import Link from "next/link";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

type GatePlan = "starter" | "growth" | "pro";

const PLAN_INFO: Record<GatePlan, { name: string; price: string }> = {
  starter: { name: "Starter", price: "€22" },
  growth: { name: "Growth", price: "€42" },
  pro: { name: "Pro", price: "€99" },
};

export function UpgradeGate({
  title,
  feature,
  plan = "growth",
  locale = DEFAULT_LOCALE,
}: {
  title: string;
  feature: string;
  plan?: GatePlan;
  locale?: Locale;
}) {
  const tr = translator(locale);
  const info = PLAN_INFO[plan];
  const price = `${info.price}/${tr("common.perMonth")}`;
  return (
    <div className="panel" style={{ textAlign: "center", padding: "52px 28px", maxWidth: 560, margin: "0 auto" }}>
      <span className="eyebrow" style={{ marginBottom: 18 }}><span className="dot" />{tr("gate.eyebrow", { name: info.name, price })}</span>
      <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", margin: "4px 0 10px" }}>{title}</h2>
      <p style={{ fontSize: 14.5, color: "var(--ink-soft)", lineHeight: 1.5, maxWidth: 420, margin: "0 auto 22px" }}>
        {tr("gate.body", { feature, name: info.name, price })}
      </p>
      <Link href="/app/settings" className="btn btn-accent">{tr("gate.cta")}</Link>
    </div>
  );
}
