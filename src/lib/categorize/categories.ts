export const EXPENSE_CATEGORIES = [
  "Реклама и маркетинг",
  "ПО и подписки",
  "Подрядчики и услуги",
  "Аренда",
  "Зарплата",
  "Банковские комиссии",
  "Возвраты",
  "Переводы",
  "Прочее",
] as const;

/**
 * Категории-переводы: движение денег между своими счетами / в накопления.
 * Это НЕ траты — иначе двойной счёт и заниженная норма сбережений (§4.5).
 * Трактуются как нейтральные в expensesByCategory и в Category Signals.
 */
export const TRANSFER_CATEGORIES: ReadonlySet<string> = new Set([
  "Накопления/Перевод",
  "Перевод",
  "Переводы",
  "Transfer",
]);

export function isTransferCategory(category: string | null): boolean {
  return category != null && TRANSFER_CATEGORIES.has(category);
}

/**
 * Категория-ЦЕЛЬ «отложить в накопления»: в бюджетах-конвертах прогресс к 100%
 * — это ХОРОШО (цель выполнена), а не перерасход. Поэтому цвет/текст такого
 * конверта инвертируются (зелёный по мере приближения, не красный).
 */
export const SAVINGS_CATEGORY = "Накопления/Перевод";
export function isSavingsCategory(category: string | null): boolean {
  return category === SAVINGS_CATEGORY;
}

interface Rule {
  re: RegExp;
  category: string;
}

const RULES: Rule[] = [
  // Переводы между своими счетами / инвестиции — ПЕРВЫМИ (не траты бизнеса):
  // выписки полны таких движений (укр/рус/исп/англ), см. личные правила.
  { re: /перевод\b|transfer|traspaso|інвестиц|инвестиц|invest|поповнен|поповнити|top.?up|зняття готівки|снятие наличн|cash withdrawal|withdraw|revolut x|digital assets|exchanged to|purchase of usdt|sell of btc|brokerage|обмен валют|to eur\b|to usd\b/i, category: "Переводы" },
  { re: /реклам|маркетинг|\bads\b|google ads|facebook|\bmeta\b|tiktok|таргет/i, category: "Реклама и маркетинг" },
  { re: /aws|amazon web|google cloud|\bgcp\b|hosting|хостинг|figma|notion|slack|github|vercel|saas|подписк|subscription|subscr\b|openai|anthropic|chatgpt|claude|porkbun|\bdomain|stripe.?atlas/i, category: "ПО и подписки" },
  { re: /аренд|\brent\b|офис|office|коворк/i, category: "Аренда" },
  { re: /зарплат|salary|payroll|оклад/i, category: "Зарплата" },
  { re: /подрядчик|фрилансер|freelanc|\bуслуг|consult|агентств/i, category: "Подрядчики и услуги" },
  { re: /комісі|комисси|commission|plan fee|metal plan|bank fee/i, category: "Банковские комиссии" },
];

export function categorizeByRules(
  description: string | null,
  kind: string
): string | null {
  if (kind === "fee") return "Банковские комиссии";
  if (kind === "refund") return "Возвраты";
  if (!description) return null;
  for (const r of RULES) {
    if (r.re.test(description)) return r.category;
  }
  return null;
}

// ── Личный таксоном категорий (Zori Personal) ─────────────────────────────
export const PERSONAL_CATEGORIES = [
  "Жильё и коммуналка",
  "Продукты",
  "Кафе и рестораны",
  "Транспорт",
  "Здоровье",
  "Подписки",
  "Покупки",
  "Развлечения",
  "Путешествия",
  "Дети",
  "Образование",
  "Накопления/Перевод",
  "Комиссии",
  "Прочее",
] as const;

const PERSONAL_RULES: Rule[] = [
  // Внутренние переводы/инвестиции — ПЕРВЫМИ: банковские выписки (Revolut и др.)
  // полны движений между своими счетами (укр/рус/исп/англ), это не траты.
  { re: /перевод\b|transfer|traspaso|накоплен|savings|вклад|депозит|копилк|інвестиц|инвестиц|invest|поповнен|поповнити|top.?up|зняття готівки|снятие наличн|cash withdrawal|withdraw|revolut x|digital assets|exchanged to|purchase of usdt|sell of btc|brokerage|обмен валют|to eur\b|to usd\b/i, category: "Накопления/Перевод" },
  { re: /аренд|\brent\b|ипотек|mortgage|коммунал|utilit|электр|\bгаз\b|вода|интернет|internet|kyivstar|vodafone|lifecell|киевстар|\besim\b|1global|мобильн|мобільн|movistar|orange\b/i, category: "Жильё и коммуналка" },
  { re: /супермаркет|продукт|grocery|\bдикси|пятёроч|перекрёст|\blidl\b|\baldi\b|mercadona|carrefour|магнит|\bbilla\b|\bspar\b|eroski|\bdia\b|alcampo/i, category: "Продукты" },
  { re: /кафе|ресторан|restaurant|\bбар\b|\bcafe\b|coffee|кофе|\bmcdonald|\bkfc\b|burger|dining|доставка еды|glovo|wolt|delivery|pizzeria|пицц|autogrill|vending|delikia|kiosk|киоск/i, category: "Кафе и рестораны" },
  { re: /такси|\btaxi\b|uber|bolt|метро|\bметро|автобус|\bbus\b|guagua|бензин|fuel|заправк|parking|паркинг|\bbla ?bla|estacion de|autobus/i, category: "Транспорт" },
  { re: /аптек|pharmacy|farmacia|врач|clinic|клиник|доктор|стоматолог|dental|health|фитнес|спортзал|\bgym\b/i, category: "Здоровье" },
  { re: /netflix|spotify|youtube|apple\.com\/bill|icloud|подписк|subscription|subscr\b|prime|disney|hbo|patreon|chatgpt|openai|claude|anthropic|github|porkbun|\bdomain/i, category: "Подписки" },
  { re: /путешеств|\btravel\b|отель|hotel|\bавиа|airline|ryanair|wizz ?air|easyjet|vueling|booking\.com|booking\.|airbnb|\bviza|виза|aeropuer|airport/i, category: "Путешествия" },
  { re: /школ|универ|курс|course|udemy|coursera|education|образован|учеб/i, category: "Образование" },
  { re: /amazon|\bozon|wildberries|\bikea|zara|\bh&m|shopping|магазин одежд|одежд|обув|corte ingl|uniformes|barber|парикмахер|peluquer/i, category: "Покупки" },
  { re: /кино|cinema|театр|концерт|игр|game|steam|playstation|развлеч|tickety|entradas/i, category: "Развлечения" },
  { re: /комісі|комисси|commission|plan fee|плата за план|metal plan|комиссия план/i, category: "Комиссии" },
  // Обычная ИСХОДЯЩАЯ отправка/платёж («Надіслано з Revolut», «Отправлено из
  // Revolut», «Sent from …») БЕЗ явного признака своего счёта/инвестиций — это
  // ТРАТА (перевод человеку/оплата), а не движение между своими счетами. Ставим
  // ПОСЛЕДНИМ: явные признаки (инвестиции/накопления/крипта/налички) уже отработали
  // выше и остаются переводами. Иначе такие отправки молча выпадают из «Трат».
  { re: /надіслано з|надіслано у|відправлено з|отправлено из|отправлено с|sent from|sent to/i, category: "Прочее" },
];

/**
 * Категоризация по правилам с учётом типа аккаунта. Движок тот же —
 * меняется только словарь/правила. Бизнес — как было, личное — личный таксоном.
 */
export function categorizeByRulesFor(
  accountType: "business" | "personal",
  description: string | null,
  kind: string
): string | null {
  if (accountType !== "personal") return categorizeByRules(description, kind);
  if (kind === "fee") return "Комиссии";
  if (!description) return null;
  for (const r of PERSONAL_RULES) {
    if (r.re.test(description)) return r.category;
  }
  return null;
}
