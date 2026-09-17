import { getLLM, type ChatTurn, type ToolDef } from "@/lib/llm";
import { sql } from "@/lib/db";
import { loadTransactions } from "@/lib/transactions";
import { computePnL, expensesByCategory } from "@/lib/metrics/engine";
import { forecastCashFlow } from "@/lib/metrics/forecast";
import { getOrgPlan, isGrowthPlus } from "@/lib/billing/plan";
import { can } from "@/lib/billing/entitlements";
import { computeMrrMovements, type SubInput } from "@/lib/metrics/mrr";
import { detectAnomalies } from "@/lib/metrics/anomalies";
import { computeVariance } from "@/lib/metrics/variance";
import { getCoverage, summarizeCoverage } from "@/lib/metrics/coverage";
import { detectRecurring, recurringMonthlyTotal } from "@/lib/metrics/recurring";
import { nextDueDate } from "@/lib/metrics/calendar";
import { computeAffordability } from "@/lib/metrics/affordability";
import { computeRunway } from "@/lib/metrics/runway";
import { estimateTaxReserve } from "@/lib/metrics/tax";
import { getAccountContext } from "@/lib/account/context";
import { currencySymbol } from "@/lib/currency";
import { getSafeToSpend, getMonthSavings, getBudgetStatus, getSubscriptions, loadHiddenBillKeys, filterHiddenRecurring } from "@/lib/personal/data";
import { computeUpcomingBills } from "@/lib/metrics/bills";
import { getCategorySignals } from "@/lib/metrics/categorySignalsData";
import { watchSignals, type CategorySignal } from "@/lib/metrics/categorySignals";
import { computeCategoryUnitEconomics } from "@/lib/metrics/categoryUnitEconomics";
import { loadSubscriptionMetrics } from "@/lib/metrics/subscriptions";
import type { Period } from "@/types";

const DAY = 86_400_000;

const SYSTEM_PROMPT = `Ты — AI-финансовый ассистент (AI CFO) для владельца малого бизнеса.

ЖЁСТКОЕ ПРАВИЛО: ты никогда не считаешь и не выдумываешь числа сам. Любую
цифру (выручка, расходы, прибыль, маржа, прогноз) получай ТОЛЬКО через
инструменты. Если для ответа нужны данные — вызови инструмент.

ТЫ УМЕЕШЬ смотреть историю операций: находить конкретный платёж/перевод по
названию компании или продавца (search_transactions) и показывать самые крупные
траты и поступления (get_largest_transactions). НИКОГДА не отвечай, что у тебя
«нет такой возможности» или ты «не можешь посмотреть транзакции» — вместо этого
вызови подходящий инструмент. Если после поиска ничего не нашлось — так и скажи.

Инструменты:
- get_pnl — выручка/расходы/прибыль/маржа за период.
- get_top_expenses — расходы по категориям.
- get_cash_forecast — прогноз кассового потока: текущий остаток, средний
  дневной поток, прогноз остатка через 30 дней, дата кассового разрыва.
  Используй для вопросов про прогноз, кассовый разрыв, «когда кончатся деньги»,
  «объясни прогноз/график». Если balanceSet=false — мягко попроси пользователя
  указать текущий остаток в панели «Денежный поток и прогноз».
- get_data_coverage — покрытие данных по месяцам: где есть и доходы, и расходы,
  а где только доходы (нет расходов → прибыль завышена) или пусто. Используй для
  вопросов «всё ли учтено», «полная ли картина», «почему прибыль такая высокая».
  Если есть incomeOnlyMonths — посоветуй загрузить выписку расходов за эти месяцы.
- get_recurring_expenses — регулярные траты и подписки (повторяющиеся списания)
  с оценкой месячной нагрузки. Для «какие у меня подписки», «что отменить»,
  «регулярные платежи». Если ответ gated=true — скажи, что фича на Growth+.
- simulate_scenario — сценарий «что если»: пересчёт прибыли при изменении выручки
  (%) и/или ежемесячных расходов (евро). Для «что если поднять цены на 10%»,
  «что если нанять за 2000€». Если gated=true — скажи, что сценарии на Growth+.
- get_runway — на сколько хватит денег (runway) и скорость прожигания (burn).
  Для «на сколько хватит денег», «когда кончатся деньги при текущем темпе».
  Если profitable=true — поток в плюсе, runway бесконечный.
- estimate_tax_reserve — рекомендуемый резерв под налоги (% от выручки). Можно
  передать ratePct. Если rateSet=false — предложи задать ставку в Настройках.
- get_mrr_movements — движения MRR за месяц: MRR сейчас, новые/отток, чистый
  прирост, Quick Ratio, удержание (NRR≈). Для «почему MRR не вырос», «какой отток».
  Если gated=true — скажи, что на Growth+; если noSubscriptions — попроси подключить Stripe.
- get_anomalies — необычно крупные траты за 90 дней («что проверить»). gated=true → Growth+.
- compare_periods — сравнение двух периодов (выручка/прибыль/маржа + драйверы по
  категориям). Можно передать aFrom/aTo/bFrom/bTo (YYYY-MM-DD); без них — текущий
  месяц против прошлого. Для «сравни июнь и май, что повлияло». gated=true → Starter+.
- can_i_afford — потяну ли новый расход без кассового разрыва (ежемесячный или
  разовый). Для «потяну ли подрядчика за 450/мес», «могу ли купить за 2000».
  verdict ok/risk + дневной поток было/станет + runway. gated=true → Growth+.
- get_calendar — что ждёт в этом месяце: ближайшие списания подписок, дата
  возможного кассового разрыва, итоги доходов/расходов. Для «что меня ждёт»,
  «какие списания скоро». gated=true → Growth+.
- search_transactions — поиск конкретных операций по названию компании/продавца
  или слову из описания. Для «сколько я потратил в Mercadona», «найди перевод на
  WWW Mercadona», «покажи платежи Netflix», «был ли платёж компании X». Передай
  query (часть названия). Если count=0 — скажи, что операций с таким названием не
  нашлось (возможно, в выписке оно записано иначе — предложи другое написание).
- get_largest_transactions — самые крупные ОТДЕЛЬНЫЕ операции за период (топ по
  сумме). Для «какая самая большая трата/расход», «самое большое пополнение/
  поступление», «топ-5 крупнейших платежей». direction: expense | income | both.
  Опц. from/to и limit. Без дат — вся доступная история.
- get_category_insight — всё про ОДНУ статью трат (тренд, обязательное/дискреционное,
  темп бюджета, статус, действие). Для «что с моей рекламой/подписками?». Параметр category.
- get_category_trends — какие статьи растут/падают. Для «какие расходы растут?».
- list_watch_categories — на что обратить внимание (статьи ≠ здоровые + действия).
- where_can_i_save — где резать (по дискреционной части и зомби-подпискам).
- get_unit_economics — CAC, инфраструктура на клиента, LTV/CAC. Для «сколько стоит
  привлечь клиента?», «окупается ли реклама?». gated=true → Growth+.

Стиль: коротко, по делу, человеческим языком без бухгалтерского жаргона.
Где уместно — давай конкретную рекомендацию, а не только цифру. Суммы
приходят в центах — переводи в основную валюту и форматируй читаемо.
Валюту бери из поля currency в ответах инструментов и из указанной ниже
базовой валюты пользователя; никогда не подставляй другие валюты, если их нет
в данных. ВАЖНО: оценки «много/мало/дорого» давай в масштабе базовой валюты
пользователя (250 в одной валюте и в другой — это разные деньги), а не по
привычке к евро/доллару.`;

const PERIOD_SCHEMA = {
  type: "object",
  properties: {
    from: { type: "string", description: "Начало периода, YYYY-MM-DD" },
    to: { type: "string", description: "Конец периода (не включая), YYYY-MM-DD" },
  },
  required: ["from", "to"],
  additionalProperties: false,
} as const;

const tools: ToolDef[] = [
  {
    name: "get_pnl",
    description:
      "Возвращает P&L (выручка, возвраты, комиссии, расходы, прибыль, маржа) за период. Даты YYYY-MM-DD; to не включается.",
    inputSchema: PERIOD_SCHEMA,
  },
  {
    name: "get_top_expenses",
    description:
      "Возвращает расходы по категориям за период, отсортированные по убыванию суммы.",
    inputSchema: PERIOD_SCHEMA,
  },
  {
    name: "get_cash_forecast",
    description:
      "Прогноз кассового потока: текущий остаток, средний дневной денежный поток, прогноз остатка через 30 дней и дата кассового разрыва (если прогнозируется). Параметры не нужны.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_data_coverage",
    description:
      "Покрытие данных по месяцам: сколько месяцев с полными данными, по каким есть только доходы без расходов (прибыль завышена) и по каким пусто. Параметры не нужны.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_recurring_expenses",
    description:
      "Регулярные траты и подписки: повторяющиеся списания (недельные/месячные) с оценкой месячной нагрузки. Параметры не нужны.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "simulate_scenario",
    description:
      "Сценарий «что если»: пересчитывает прибыль при изменении выручки (%) и/или ежемесячных расходов (в евро).",
    inputSchema: {
      type: "object",
      properties: {
        revenueChangePct: { type: "number", description: "Изменение выручки в %, напр. 10 или -5" },
        monthlyExpenseDeltaCents: { type: "integer", description: "Изменение ежемесячных расходов в центах: + рост, − снижение" },
        label: { type: "string", description: "Короткое описание сценария" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_runway",
    description: "Денежный запас (runway, мес) и burn rate по текущему остатку и среднему потоку за 30 дней. Параметры не нужны.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "estimate_tax_reserve",
    description: "Рекомендуемый резерв под налоги = ставка % × выручка текущего месяца. Можно передать ratePct, иначе берётся ставка из настроек.",
    inputSchema: { type: "object", properties: { ratePct: { type: "number" } }, additionalProperties: false },
  },
  {
    name: "get_mrr_movements",
    description: "Движения MRR за текущий месяц: MRR сейчас, новые, отток, чистый прирост, Quick Ratio, удержание (NRR≈). Параметры не нужны.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_anomalies",
    description: "Необычно крупные траты за последние 90 дней (z-score по категории). Параметры не нужны.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "compare_periods",
    description: "Сравнение двух периодов: дельты выручки/прибыли/маржи + драйверы по категориям. Даты YYYY-MM-DD; без параметров — текущий месяц против прошлого.",
    inputSchema: {
      type: "object",
      properties: {
        aFrom: { type: "string" }, aTo: { type: "string" },
        bFrom: { type: "string" }, bTo: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "can_i_afford",
    description:
      "Калькулятор «потяну ли расход»: можно ли позволить новый расход без кассового разрыва. Для «потяну ли подрядчика за 450 в месяц», «могу ли купить технику за 2000 разово». amountCents — сумма в центах; recurring — true если ежемесячный, false если разовый. gated=true → Growth+.",
    inputSchema: {
      type: "object",
      properties: {
        amountCents: { type: "integer", description: "Сумма расхода в центах (450€ = 45000)" },
        recurring: { type: "boolean", description: "true — ежемесячный, false — разовый" },
      },
      required: ["amountCents"],
      additionalProperties: false,
    },
  },
  {
    name: "get_calendar",
    description:
      "Что ждёт в этом месяце: ближайшие регулярные списания (подписки), дата возможного кассового разрыва, итоги доходов/расходов месяца. Для «что меня ждёт», «какие списания скоро», «когда что спишется». Параметры не нужны.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "search_transactions",
    description:
      "Поиск операций по названию продавца/мерчанта или ключевому слову в описании. Для вопросов «сколько я потратил в Mercadona/Меркадона», «сколько списал у X», «покажи платежи Netflix». query — часть названия (рус/лат, регистр не важен). Опц. from/to (YYYY-MM-DD); без них — вся доступная история. Возвращает сумму расхода/прихода, число операций и примеры.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Название продавца или слово из описания, напр. «Mercadona», «Netflix», «такси»" },
        from: { type: "string", description: "Начало периода, YYYY-MM-DD (опц.)" },
        to: { type: "string", description: "Конец периода, YYYY-MM-DD, не включая (опц.)" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_largest_transactions",
    description:
      "Самые крупные ОТДЕЛЬНЫЕ операции за период (топ по сумме). Для «какая самая большая трата/расход», «самое большое пополнение/поступление», «топ-5 крупнейших платежей». Без дат — вся доступная история.",
    inputSchema: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["expense", "income", "both"], description: "Тип: расходы, поступления или всё" },
        from: { type: "string", description: "Начало периода YYYY-MM-DD (опц.)" },
        to: { type: "string", description: "Конец периода YYYY-MM-DD, не включая (опц.)" },
        limit: { type: "integer", description: "Сколько вернуть, 1-20 (по умолчанию 5)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_planned_items",
    description:
      "Плановые операции пользователя (запланированные подписки и разовые траты/доходы), которые он отметил в календаре, на ближайшие 60 дней. Для «что у меня запланировано», «какие плановые списания скоро», «учти мою запланированную трату». Параметры не нужны.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_category_insight",
    description:
      "Всё, что происходит с ОДНОЙ категорией трат: сумма, доля и её сдвиг, тренд, обязательная vs дискреционная часть, регулярка/зомби, темп бюджета, доля от дохода, статус (healthy/watch/over/waste) и готовое действие. Для «что с моими ресторанами?», «почему выросли подписки?». Параметр category — название категории.",
    inputSchema: {
      type: "object",
      properties: { category: { type: "string", description: "Название категории трат" } },
      required: ["category"],
      additionalProperties: false,
    },
  },
  {
    name: "get_category_trends",
    description:
      "Какие статьи трат растут, а какие падают: категории, отсортированные по импульсу (изменение к прошлому месяцу) и тренду за 3 мес. Для «какие расходы растут?», «на чём я стал тратить больше?». Параметры не нужны.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_watch_categories",
    description:
      "На что обратить внимание: категории со статусом ≠ healthy (waste/over/watch/new) с объяснением и действием. Для «на что обратить внимание?», «где проблемы с тратами?». Параметры не нужны.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "where_can_i_save",
    description:
      "Где резать расходы: категории, отсортированные по дискреционной части (не-обязательные траты) и отходам (зомби-подписки). Для «где можно сэкономить?», «что урезать?». Параметры не нужны.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_unit_economics",
    description:
      "Юнит-экономика (бизнес): CAC — стоимость привлечения клиента (маркетинг / новые клиенты), инфраструктура на клиента (ПО и подписки / активные клиенты), LTV/CAC. Для «сколько стоит привлечь клиента?», «окупается ли реклама?», «сколько инфраструктуры на клиента?». gated=true → Growth+. Параметры не нужны.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

async function runPlannedItems(orgId: string): Promise<string> {
  const { loadPlannedItems } = await import("@/lib/planned/load");
  const { expandPlanned } = await import("@/lib/metrics/planned");
  const now = new Date();
  const occ = expandPlanned(await loadPlannedItems(orgId), now, new Date(now.getTime() + 60 * DAY));
  return JSON.stringify({
    planned: occ.map((o) => ({ day: o.day, label: o.label, amountCents: o.amountCents, direction: o.direction, kind: o.kind })),
  });
}

// ── Zori Personal: личный системный промпт и тулсет ───────────────────────
const PERSONAL_SYSTEM_PROMPT = `Ты — личный финансовый ассистент Zori. Помогаешь человеку разобраться с его личными деньгами.

ЖЁСТКОЕ ПРАВИЛО: ты никогда не считаешь и не выдумываешь числа сам. Любую цифру
(доход, траты, отложено, safe-to-spend, бюджеты, подписки, прогноз) получай
ТОЛЬКО через инструменты.

Тон: спокойный, поддерживающий, без осуждения трат и финансового стыда.
Говори «отложено», «свободно потратить», «в рамках бюджета». Где уместно — дай
конкретное действие, а не только цифру.

Ключевые инструменты личного режима:
- get_safe_to_spend — сколько можно потратить до зарплаты/конца периода (в день и
  всего). Это главный вопрос: «сколько мне можно тратить?».
- get_budget_status — как идут бюджеты-конверты по категориям (потрачено/лимит/темп).
- get_savings_rate — доход/траты/отложено и норма сбережений за месяц.
- get_subscriptions — регулярные списания, месячная/годовая нагрузка, «зомби»-подписки
  (не пользуешься 60+ дней). Для «какие подписки отменить».
- get_upcoming_bills — что скоро спишется (аренда, счета, подписки).
- get_top_expenses — куда уходят деньги (по категориям).
- can_i_afford — потяну ли крупную покупку/поездку без риска. Для «потяну ли поездку
  за €900?»: сначала get_safe_to_spend, потом can_i_afford.
- get_cash_forecast — прогноз остатка на счетах. search_transactions,
  get_largest_transactions — поиск и крупнейшие операции.
- get_category_insight — всё про ОДНУ статью (тренд, обязательное/дискреционное,
  темп конверта, доля от дохода, статус, действие). Для «что с моими ресторанами?».
- get_category_trends — какие статьи растут/падают.
- list_watch_categories — на что обратить внимание (+ действия).
- where_can_i_save — где сэкономить (дискреционка + зомби-подписки).

get_pnl в личном контексте = доход/траты/отложено (netRevenue=доход, totalExpense=траты,
profit=отложено). Суммы приходят в центах — переводи в базовую валюту и форматируй читаемо.
Валюту бери из поля currency в ответах инструментов и из базовой валюты пользователя.
Оценки «много/мало» давай в масштабе базовой валюты, а не евро/доллара.`;

const PERSONAL_TOOL_EXTRA: ToolDef[] = [
  {
    name: "get_safe_to_spend",
    description: "Сколько можно потратить до зарплаты/конца периода: всего и в день, сколько дней осталось, буфер. Для «сколько мне можно тратить?». Параметры не нужны.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_budget_status",
    description: "Статус бюджетов-конвертов за текущий месяц: по каждой категории лимит, потрачено, остаток, %, темп (under/ontrack/over). Для «как у меня с бюджетом на еду». Параметры не нужны.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_savings_rate",
    description: "Доход, траты, отложено и норма сбережений (%) за текущий месяц. Для «сколько я откладываю». Параметры не нужны.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_subscriptions",
    description: "Аудит подписок: список регулярных списаний, месячная и годовая нагрузка, сколько «зомби»-подписок (не пользуешься 60+ дней). Для «какие подписки отменить». Параметры не нужны.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_upcoming_bills",
    description: "Ближайшие обязательные списания в горизонте 30 дней (аренда, счета, подписки) с датами. Для «что скоро спишется». Параметры не нужны.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

// Личный тулсет: бизнес-инструменты минус MRR/налоги + личные.
const BUSINESS_ONLY_TOOLS = new Set(["get_mrr_movements", "estimate_tax_reserve", "get_unit_economics"]);
const personalTools: ToolDef[] = [
  ...tools.filter((t) => !BUSINESS_ONLY_TOOLS.has(t.name)),
  ...PERSONAL_TOOL_EXTRA,
];

async function runSafeToSpend(orgId: string): Promise<string> {
  const sts = await getSafeToSpend(orgId);
  if (!sts) return JSON.stringify({ error: "no account" });
  const ctx = await getAccountContext(orgId);
  return JSON.stringify({
    currency: ctx?.baseCurrency ?? "EUR",
    totalCents: sts.totalCents,
    perDayCents: sts.perDayCents,
    daysLeft: sts.daysLeft,
    committedBillsCents: sts.committedCents,
    bufferCents: sts.bufferCents,
    periodEnd: sts.periodEnd.toISOString().slice(0, 10),
  });
}

async function runBudgetStatus(orgId: string): Promise<string> {
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const lines = await getBudgetStatus(orgId, month);
  const ctx = await getAccountContext(orgId);
  if (lines.length === 0) return JSON.stringify({ currency: ctx?.baseCurrency ?? "EUR", budgets: [], note: "no budgets set" });
  return JSON.stringify({ currency: ctx?.baseCurrency ?? "EUR", month, budgets: lines });
}

async function runSavingsRate(orgId: string): Promise<string> {
  return JSON.stringify(await getMonthSavings(orgId));
}

async function runSubscriptions(orgId: string): Promise<string> {
  const data = await getSubscriptions(orgId);
  if (!data) return JSON.stringify({ error: "no account" });
  return JSON.stringify({
    currency: data.currency,
    summary: data.summary,
    subscriptions: data.recurring.map((r) => ({
      merchant: r.merchant, monthlyCents: r.monthlyEstimateCents, cadence: r.cadence,
      lastChargeAt: r.lastChargeAt, daysSinceLast: r.daysSinceLast, stale: r.stale,
    })),
  });
}

async function runUpcomingBills(orgId: string): Promise<string> {
  const data = await getSubscriptions(orgId);
  if (!data) return JSON.stringify({ error: "no account" });
  const bills = computeUpcomingBills(data.recurring, { horizonDays: 30 });
  return JSON.stringify({
    currency: data.currency,
    bills: bills.map((b) => ({ label: b.label, amountCents: b.amountCents, dueDate: b.dueDate.toISOString().slice(0, 10), daysUntil: b.daysUntil, stale: b.stale })),
  });
}

// ── Category Signals (§5): ИИ получает готовый сигнал и объясняет ──────────
function fmtSignal(s: CategorySignal) {
  return {
    category: s.category,
    status: s.status,
    headline: s.headline,
    action: s.action,
    totalCents: s.totalCents,
    sharePct: s.sharePct,
    shareDeltaPp: s.shareDeltaPp,
    momPct: s.momPct,
    trend3m: s.trend3m,
    committedCents: s.committedCents,
    discretionaryCents: s.discretionaryCents,
    wasteCents: s.wasteCents,
    ...(s.budget ? { budget: s.budget } : {}),
    ...(s.seasonalIndex != null ? { seasonalIndex: s.seasonalIndex } : {}),
    ...(s.vendorTopSharePct != null ? { vendorTopSharePct: s.vendorTopSharePct } : {}),
    ...(s.newVendors ? { newVendors: s.newVendors } : {}),
    ...(s.incomeRatioPct != null ? { incomeRatioPct: s.incomeRatioPct } : {}),
    ...(s.revenueRatioPct != null ? { revenueRatioPct: s.revenueRatioPct } : {}),
    ...(s.runwayDaysImpact != null ? { runwayDaysImpact: s.runwayDaysImpact } : {}),
  };
}

async function runCategoryInsight(orgId: string, input: unknown): Promise<string> {
  const q = ((input ?? {}) as { category?: string }).category?.trim().toLowerCase() ?? "";
  if (!q) return JSON.stringify({ error: "Не указана категория." });
  const { currency, signals } = await getCategorySignals(orgId);
  const hit =
    signals.find((s) => s.category.toLowerCase() === q) ??
    signals.find((s) => s.category.toLowerCase().includes(q));
  if (!hit) {
    return JSON.stringify({ currency, found: false, availableCategories: signals.map((s) => s.category) });
  }
  return JSON.stringify({ currency, found: true, signal: fmtSignal(hit) });
}

async function runCategoryTrends(orgId: string): Promise<string> {
  const { currency, signals } = await getCategorySignals(orgId);
  const ranked = [...signals].sort((a, b) => (b.momPct ?? -Infinity) - (a.momPct ?? -Infinity));
  const rising = ranked.filter((s) => s.trend3m === "rising" || (s.momPct ?? 0) > 5).slice(0, 6);
  const falling = ranked.filter((s) => s.trend3m === "falling" || (s.momPct ?? 0) < -5).slice(-6);
  return JSON.stringify({
    currency,
    rising: rising.map(fmtSignal),
    falling: falling.map(fmtSignal),
  });
}

async function runWatchCategories(orgId: string): Promise<string> {
  const { currency, signals, coverage } = await getCategorySignals(orgId);
  const watch = watchSignals(signals).slice(0, 8);
  return JSON.stringify({ currency, uncategorizedRatePct: coverage.uncategorizedRatePct, watch: watch.map(fmtSignal) });
}

async function runWhereCanISave(orgId: string): Promise<string> {
  const { currency, signals } = await getCategorySignals(orgId);
  const ranked = [...signals]
    .sort((a, b) => b.discretionaryCents + b.wasteCents - (a.discretionaryCents + a.wasteCents))
    .slice(0, 6);
  return JSON.stringify({ currency, opportunities: ranked.map(fmtSignal) });
}

async function runUnitEconomics(orgId: string): Promise<string> {
  const { plan } = await getOrgPlan(orgId);
  if (!isGrowthPlus(plan)) {
    return JSON.stringify({ gated: true, requiredPlan: "growth", note: "Юнит-экономика — на Growth и выше." });
  }
  const { getUnitEconomics } = await import("@/lib/metrics/unitEconomicsData");
  const result = await getUnitEconomics(orgId);
  if (!result) {
    return JSON.stringify({ noSubscriptions: true, note: "Нет синхронизированных подписок Stripe — не с чего считать клиентов." });
  }
  return JSON.stringify({ currency: result.currency, ...result.econ });
}

async function runMerchantSearch(orgId: string, input: unknown): Promise<string> {
  const i = (input ?? {}) as { query?: string; from?: string; to?: string };
  const q = (i.query ?? "").trim();
  if (!q) return JSON.stringify({ error: "Не указано название для поиска." });

  const now = new Date();
  const from = i.from ? new Date(i.from) : new Date(Date.UTC(2000, 0, 1));
  const to = i.to ? new Date(i.to) : new Date(now.getTime() + DAY);
  const txns = await loadTransactions(orgId, { from, to });

  const ql = q.toLowerCase();
  const match = txns.filter(
    (t) =>
      (t.description ?? "").toLowerCase().includes(ql) ||
      (t.category ?? "").toLowerCase().includes(ql)
  );

  let expenseCents = 0;
  let incomeCents = 0;
  for (const t of match) {
    if (t.direction === "expense") expenseCents += t.grossCents;
    else incomeCents += t.grossCents;
  }

  // Сортируем по убыванию суммы — так первыми идут самые заметные платежи.
  const examples = [...match]
    .sort((a, b) => b.grossCents - a.grossCents)
    .slice(0, 6)
    .map((t) => ({
      date: new Date(t.occurredAt).toISOString().slice(0, 10),
      description: t.description ?? "",
      direction: t.direction,
      grossCents: t.grossCents,
    }));

  return JSON.stringify({
    query: q,
    currency: txns[0]?.currency ?? "EUR",
    count: match.length,
    expenseCents,
    incomeCents,
    examples,
  });
}

async function runLargest(orgId: string, input: unknown): Promise<string> {
  const i = (input ?? {}) as { direction?: string; from?: string; to?: string; limit?: number };
  const now = new Date();
  const from = i.from ? new Date(i.from) : new Date(Date.UTC(2000, 0, 1));
  const to = i.to ? new Date(i.to) : new Date(now.getTime() + DAY);
  const txns = await loadTransactions(orgId, { from, to });

  const dir = i.direction === "income" || i.direction === "expense" ? i.direction : "both";
  const limit = Math.max(1, Math.min(20, Math.round(Number(i.limit)) || 5));
  const pool = dir === "both" ? txns : txns.filter((t) => t.direction === dir);

  const largest = [...pool]
    .sort((a, b) => b.grossCents - a.grossCents)
    .slice(0, limit)
    .map((t) => ({
      date: new Date(t.occurredAt).toISOString().slice(0, 10),
      description: t.description ?? "",
      category: t.category ?? null,
      direction: t.direction,
      grossCents: t.grossCents,
    }));

  return JSON.stringify({ currency: txns[0]?.currency ?? "EUR", direction: dir, count: pool.length, largest });
}

async function runAfford(orgId: string, input: unknown): Promise<string> {
  const { plan } = await getOrgPlan(orgId);
  if (!can(plan, "scenarioWhatIf")) {
    return JSON.stringify({ gated: true, requiredPlan: "growth", note: "Калькулятор «что могу позволить» — на Growth и выше." });
  }
  const i = (input ?? {}) as { amountCents?: number; recurring?: boolean };
  const amountCents = Math.abs(Math.round(Number(i.amountCents ?? 0)));
  if (!amountCents) return JSON.stringify({ error: "Не указана сумма." });

  const now = new Date();
  const recent = await loadTransactions(orgId, { from: new Date(now.getTime() - 90 * DAY), to: new Date(now.getTime() + DAY) });
  const currency = recent[0]?.currency ?? "EUR";
  const avgDailyNetCents = Math.round(recent.reduce((s, t) => s + t.netCents, 0) / 90);
  const [o] = await sql<{ current_balance_cents: string | null; safe_threshold_cents: string | null }[]>`
    select current_balance_cents, safe_threshold_cents from organizations where id = ${orgId}
  `;
  const result = computeAffordability({
    amountCents,
    recurring: i.recurring !== false,
    avgDailyNetCents,
    balanceCents: o?.current_balance_cents == null ? 0 : Number(o.current_balance_cents),
    thresholdCents: o?.safe_threshold_cents == null ? 0 : Number(o.safe_threshold_cents),
  });
  return JSON.stringify({ currency, amountCents, recurring: i.recurring !== false, ...result });
}

async function runCalendar(orgId: string): Promise<string> {
  const { plan } = await getOrgPlan(orgId);
  if (!isGrowthPlus(plan)) {
    return JSON.stringify({ gated: true, requiredPlan: "growth", note: "Календарь событий и прогноз списаний — на Growth и выше." });
  }
  const now = new Date();
  const recent = await loadTransactions(orgId, { from: new Date(now.getTime() - 120 * DAY), to: new Date(now.getTime() + DAY) });
  const currency = recent[0]?.currency ?? "EUR";

  const upcoming = filterHiddenRecurring(detectRecurring(recent), await loadHiddenBillKeys(orgId))
    .map((r) => ({ merchant: r.merchant, amountCents: r.avgAmountCents, due: nextDueDate(r.lastChargeAt, r.cadence, now) }))
    .filter((x) => {
      const diff = Math.round((x.due.getTime() - now.getTime()) / DAY);
      return diff >= 0 && diff <= 30;
    })
    .sort((a, b) => a.due.getTime() - b.due.getTime())
    .slice(0, 8)
    .map((x) => ({ merchant: x.merchant, amountCents: x.amountCents, date: x.due.toISOString().slice(0, 10) }));

  let gapDate: string | null = null;
  const [o] = await sql<{ current_balance_cents: string | null; safe_threshold_cents: string | null }[]>`
    select current_balance_cents, safe_threshold_cents from organizations where id = ${orgId}
  `;
  if (o?.current_balance_cents != null) {
    gapDate = forecastCashFlow(recent, Number(o.current_balance_cents), {
      horizonDays: 30,
      thresholdCents: o.safe_threshold_cents == null ? 0 : Number(o.safe_threshold_cents),
    }).gapDate;
  }

  const mStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const month = recent.filter((t) => new Date(t.occurredAt) >= mStart);
  const monthInCents = month.filter((t) => t.direction === "income").reduce((s, t) => s + t.grossCents, 0);
  const monthOutCents = month.filter((t) => t.direction === "expense").reduce((s, t) => s + t.grossCents, 0);

  return JSON.stringify({ currency, upcoming, gapDate, monthInCents, monthOutCents });
}

async function runAnomalies(orgId: string): Promise<string> {
  const { plan } = await getOrgPlan(orgId);
  if (!isGrowthPlus(plan)) return JSON.stringify({ gated: true, requiredPlan: "growth", note: "Детектор аномалий — на Growth и выше." });
  const now = new Date();
  const txns = await loadTransactions(orgId, { from: new Date(now.getTime() - 90 * DAY), to: new Date(now.getTime() + DAY) });
  const flags = detectAnomalies(txns).slice(0, 10);
  return JSON.stringify({ currency: txns[0]?.currency ?? "EUR", count: flags.length, flags });
}

async function runCompare(orgId: string, input: unknown): Promise<string> {
  const { plan } = await getOrgPlan(orgId);
  if (plan === "free") return JSON.stringify({ gated: true, requiredPlan: "starter", note: "Сравнение периодов — на Starter и выше." });
  const i = (input ?? {}) as { aFrom?: string; aTo?: string; bFrom?: string; bTo?: string };
  const now = new Date();
  const aFrom = i.aFrom ? new Date(i.aFrom) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const aTo = i.aTo ? new Date(i.aTo) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const bFrom = i.bFrom ? new Date(i.bFrom) : new Date(Date.UTC(aFrom.getUTCFullYear(), aFrom.getUTCMonth() - 1, 1));
  const bTo = i.bTo ? new Date(i.bTo) : aFrom;
  const a = await loadTransactions(orgId, { from: aFrom, to: aTo });
  const b = await loadTransactions(orgId, { from: bFrom, to: bTo });
  return JSON.stringify(computeVariance(a, b));
}

async function runMrr(orgId: string): Promise<string> {
  const { plan } = await getOrgPlan(orgId);
  if (!isGrowthPlus(plan)) return JSON.stringify({ gated: true, requiredPlan: "growth", note: "Движения MRR — на Growth и выше." });
  const rows = await sql<
    { amount_cents: string; currency: string | null; interval: string | null; interval_count: number; status: string; started_at: Date | null; canceled_at: Date | null; customer_id: string | null }[]
  >`select amount_cents, currency, interval, interval_count, status, started_at, canceled_at, customer_id from stripe_subscriptions where org_id = ${orgId}`;
  if (rows.length === 0) return JSON.stringify({ noSubscriptions: true, note: "Нет синхронизированных подписок Stripe." });
  const subs: SubInput[] = rows.map((r) => ({
    amountCents: Number(r.amount_cents), interval: r.interval, intervalCount: r.interval_count,
    status: r.status, startedAt: r.started_at, canceledAt: r.canceled_at, customerId: r.customer_id,
  }));
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return JSON.stringify({ currency: (rows[0]!.currency ?? "eur").toUpperCase(), ...computeMrrMovements(subs, from, to, now) });
}

async function runRunway(orgId: string): Promise<string> {
  const { plan } = await getOrgPlan(orgId);
  if (plan === "free") return JSON.stringify({ gated: true, requiredPlan: "starter", note: "Runway/burn — на Starter и выше." });
  const [o] = await sql<{ current_balance_cents: string | null }[]>`select current_balance_cents from organizations where id = ${orgId}`;
  if (!o || o.current_balance_cents == null) {
    return JSON.stringify({ balanceSet: false, note: "Не задан текущий остаток на счетах." });
  }
  const now = new Date();
  const txns = await loadTransactions(orgId, { from: new Date(now.getTime() - 30 * DAY), to: new Date(now.getTime() + DAY) });
  const avgDailyNet = txns.length ? txns.reduce((s, t) => s + t.netCents, 0) / 30 : 0;
  return JSON.stringify({ currency: txns[0]?.currency ?? "EUR", ...computeRunway(Number(o.current_balance_cents), avgDailyNet, now) });
}

async function runTax(orgId: string, input: unknown): Promise<string> {
  const { plan } = await getOrgPlan(orgId);
  if (plan === "free") return JSON.stringify({ gated: true, requiredPlan: "starter", note: "Резерв под налоги — на Starter и выше." });
  const [o] = await sql<{ tax_rate_pct: string | null }[]>`select tax_rate_pct from organizations where id = ${orgId}`;
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const pnl = computePnL(await loadTransactions(orgId, { from, to }));
  const inputRate = (input as { ratePct?: number })?.ratePct;
  const rate = typeof inputRate === "number" ? inputRate : o?.tax_rate_pct != null ? Number(o.tax_rate_pct) : 0;
  return JSON.stringify({
    currency: pnl.currency,
    ratePct: rate,
    rateSet: rate > 0,
    monthRevenueCents: pnl.netRevenueCents,
    reserveCents: estimateTaxReserve(pnl.netRevenueCents, rate),
  });
}

async function runRecurring(orgId: string): Promise<string> {
  const { plan } = await getOrgPlan(orgId);
  if (!can(plan, "subscriptionAudit")) {
    return JSON.stringify({ gated: true, requiredPlan: "growth", note: "Аудит регулярных трат — на Growth и выше." });
  }
  const now = new Date();
  const txns = await loadTransactions(orgId, { from: new Date(now.getTime() - 120 * DAY), to: new Date(now.getTime() + DAY) });
  const items = detectRecurring(txns);
  return JSON.stringify({
    currency: txns[0]?.currency ?? "EUR",
    monthlyTotalCents: recurringMonthlyTotal(items),
    items: items.slice(0, 15),
  });
}

async function runScenario(orgId: string, input: unknown): Promise<string> {
  const { plan } = await getOrgPlan(orgId);
  if (!can(plan, "scenarioWhatIf")) {
    return JSON.stringify({ gated: true, requiredPlan: "growth", note: "Сценарии «что если» — на Growth и выше." });
  }
  const { revenueChangePct, monthlyExpenseDeltaCents, label } = (input ?? {}) as {
    revenueChangePct?: number;
    monthlyExpenseDeltaCents?: number;
    label?: string;
  };
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const base = computePnL(await loadTransactions(orgId, { from, to }));

  const revPct = typeof revenueChangePct === "number" ? revenueChangePct : 0;
  const expDelta = typeof monthlyExpenseDeltaCents === "number" ? Math.round(monthlyExpenseDeltaCents) : 0;
  const newRevenue = Math.round(base.netRevenueCents * (1 + revPct / 100));
  const newExpense = base.totalExpenseCents + expDelta;
  const newProfit = newRevenue - newExpense;

  return JSON.stringify({
    label: label ?? null,
    currency: base.currency,
    base: { revenueCents: base.netRevenueCents, expenseCents: base.totalExpenseCents, profitCents: base.profitCents },
    scenario: { revenueCents: newRevenue, expenseCents: newExpense, profitCents: newProfit },
    profitDeltaCents: newProfit - base.profitCents,
  });
}

async function runCoverage(orgId: string): Promise<string> {
  const { plan } = await getOrgPlan(orgId);
  const sum = summarizeCoverage(await getCoverage(orgId, plan));
  return JSON.stringify({
    coveredMonths: sum.okCount,
    visibleMonths: sum.totalVisible,
    incomeOnlyMonths: sum.incomeOnly,
    emptyMonths: sum.empty,
  });
}

function parsePeriod(input: unknown): Period {
  const { from, to } = input as { from?: string; to?: string };
  if (!from || !to) throw new Error("Both 'from' and 'to' are required");
  return { from: new Date(from), to: new Date(to) };
}

async function runForecast(orgId: string): Promise<string> {
  const [org] = await sql<
    { current_balance_cents: string | null; safe_threshold_cents: string | null }[]
  >`
    select current_balance_cents, safe_threshold_cents from organizations where id = ${orgId}
  `;
  if (!org || org.current_balance_cents === null) {
    return JSON.stringify({
      balanceSet: false,
      note: "Текущий остаток на счетах не задан — без него прогноз невозможен.",
    });
  }
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 86_400_000);
  const to = new Date(now.getTime() + 86_400_000);
  const txns = await loadTransactions(orgId, { from, to });
  const f = forecastCashFlow(txns, Number(org.current_balance_cents), {
    horizonDays: 30,
    thresholdCents: org.safe_threshold_cents === null ? 0 : Number(org.safe_threshold_cents),
    lookbackDays: 30,
  });
  return JSON.stringify({
    balanceSet: true,
    currency: txns[0]?.currency ?? "EUR",
    startingBalanceCents: f.startingBalanceCents,
    endBalanceCents: f.endBalanceCents,
    avgDailyNetCents: f.avgDailyNetCents,
    minBalanceCents: f.minBalanceCents,
    gapDate: f.gapDate,
    daysWithActivity: f.daysWithActivity,
    horizonDays: f.horizonDays,
  });
}

export async function answerFinancialQuestion(
  orgId: string,
  question: string,
  history: ChatTurn[] = []
): Promise<string> {
  const llm = getLLM();

  const today = new Date().toLocaleDateString("ru-RU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const acct = await getAccountContext(orgId);
  const personal = acct?.type === "personal";
  const baseCur = acct?.baseCurrency ?? "EUR";
  const basePrompt = personal ? PERSONAL_SYSTEM_PROMPT : SYSTEM_PROMPT;
  const system = `${basePrompt}

Базовая валюта пользователя — ${baseCur} (${currencySymbol(baseCur)}). Если инструмент
не вернул другую валюту в поле currency, все суммы — и во вводе пользователя, и в твоём
ответе — считай в ${baseCur}. Суждения «дорого/дёшево/много/мало» выноси в масштабе
${baseCur}, а не по привычке к евро или доллару.

Сегодняшняя дата: ${today}.
- «Этот месяц», «текущий месяц», «сейчас» = месяц этой даты.
- Если период в вопросе НЕ указан — по умолчанию бери ТЕКУЩИЙ месяц.
- Если год явно не назван — бери текущий. Не перебирай прошлые годы.`;

  return llm.complete({
    system,
    messages: [...history, { role: "user", content: question }],
    tools: personal ? personalTools : tools,
    executeTool: async (name, input) => {
      if (name === "get_planned_items") return runPlannedItems(orgId);
      if (name === "get_safe_to_spend") return runSafeToSpend(orgId);
      if (name === "get_budget_status") return runBudgetStatus(orgId);
      if (name === "get_savings_rate") return runSavingsRate(orgId);
      if (name === "get_subscriptions") return runSubscriptions(orgId);
      if (name === "get_upcoming_bills") return runUpcomingBills(orgId);
      if (name === "get_cash_forecast") return runForecast(orgId);
      if (name === "get_data_coverage") return runCoverage(orgId);
      if (name === "get_recurring_expenses") return runRecurring(orgId);
      if (name === "simulate_scenario") return runScenario(orgId, input);
      if (name === "get_runway") return runRunway(orgId);
      if (name === "estimate_tax_reserve") return runTax(orgId, input);
      if (name === "get_mrr_movements") return runMrr(orgId);
      if (name === "get_anomalies") return runAnomalies(orgId);
      if (name === "compare_periods") return runCompare(orgId, input);
      if (name === "search_transactions") return runMerchantSearch(orgId, input);
      if (name === "get_largest_transactions") return runLargest(orgId, input);
      if (name === "get_calendar") return runCalendar(orgId);
      if (name === "can_i_afford") return runAfford(orgId, input);
      if (name === "get_category_insight") return runCategoryInsight(orgId, input);
      if (name === "get_category_trends") return runCategoryTrends(orgId);
      if (name === "list_watch_categories") return runWatchCategories(orgId);
      if (name === "where_can_i_save") return runWhereCanISave(orgId);
      if (name === "get_unit_economics") return runUnitEconomics(orgId);

      const period = parsePeriod(input);
      const txns = await loadTransactions(orgId, period);
      switch (name) {
        case "get_pnl":
          return JSON.stringify(computePnL(txns));
        case "get_top_expenses":
          return JSON.stringify({
            currency: txns[0]?.currency ?? "EUR",
            expenses: expensesByCategory(txns),
          });
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    },
  });
}
