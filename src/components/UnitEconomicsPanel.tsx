import type { CategoryUnitEconomics } from "@/lib/metrics/categoryUnitEconomics";
import { formatMoney } from "@/lib/format";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

/**
 * Юнит-экономика на бизнес-обзоре: CAC, инфраструктура на клиента, LTV:CAC.
 * Числа считает детерминированный код (unitEconomicsData); здесь — плитки.
 */
export function UnitEconomicsPanel({
  econ,
  currency,
  locale = DEFAULT_LOCALE,
}: {
  econ: CategoryUnitEconomics;
  currency: string;
  locale?: Locale;
}) {
  const tr = translator(locale);

  const ratioTone =
    econ.ltvToCacRatio == null ? "var(--ink)" : econ.ltvToCacRatio >= 3 ? "var(--accent-ink)" : "var(--warn)";

  return (
    <div>
      <div className="ue-grid">
        <div className="ue-tile">
          <div className="k">CAC</div>
          <div className="v">{econ.cacCents != null ? formatMoney(econ.cacCents, currency) : "—"}</div>
          <small>{tr("ue.cacHint", { n: econ.newCustomers })}</small>
        </div>
        <div className="ue-tile">
          <div className="k">{tr("ue.infra")}</div>
          <div className="v">{econ.infraPerCustomerCents != null ? formatMoney(econ.infraPerCustomerCents, currency) : "—"}</div>
          <small>{tr("ue.infraHint", { n: econ.activeClients })}</small>
        </div>
        <div className="ue-tile">
          <div className="k">LTV : CAC</div>
          <div className="v" style={{ color: ratioTone }}>
            {econ.ltvToCacRatio != null ? `${econ.ltvToCacRatio}×` : "—"}
          </div>
          <small>{econ.ltvCents != null ? tr("ue.ltvHint", { ltv: formatMoney(econ.ltvCents, currency) }) : tr("ue.noLtv")}</small>
        </div>
      </div>
      <p style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 10 }}>{tr("ue.note")}</p>
    </div>
  );
}
