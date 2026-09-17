import type { Locale } from "@/lib/i18n";

/**
 * Отображаемые названия категорий. Канонические имена (ключи БД) — русские,
 * они хранятся в transactions/budgets/category_rules; здесь только ПОКАЗ.
 * Пользовательские категории (не из словаря) показываются как есть.
 */
const EN: Record<string, string> = {
  // личные
  "Жильё и коммуналка": "Housing & utilities",
  "Продукты": "Groceries",
  "Кафе и рестораны": "Cafes & restaurants",
  "Транспорт": "Transport",
  "Здоровье": "Health",
  "Подписки": "Subscriptions",
  "Покупки": "Shopping",
  "Развлечения": "Entertainment",
  "Путешествия": "Travel",
  "Дети": "Kids",
  "Образование": "Education",
  "Накопления/Перевод": "Savings/Transfer",
  "Комиссии": "Fees",
  "Прочее": "Other",
  // бизнес
  "Реклама и маркетинг": "Ads & marketing",
  "ПО и подписки": "Software & subscriptions",
  "Подрядчики и услуги": "Contractors & services",
  "Аренда": "Rent",
  "Зарплата": "Payroll",
  "Банковские комиссии": "Bank fees",
  "Возвраты": "Refunds",
  "Переводы": "Transfers",
  // частые пользовательские категории
  "Инвестиции": "Investments",
  "Связь": "Telecom",
};

const ES: Record<string, string> = {
  "Жильё и коммуналка": "Vivienda y suministros",
  "Продукты": "Alimentación",
  "Кафе и рестораны": "Cafés y restaurantes",
  "Транспорт": "Transporte",
  "Здоровье": "Salud",
  "Подписки": "Suscripciones",
  "Покупки": "Compras",
  "Развлечения": "Ocio",
  "Путешествия": "Viajes",
  "Дети": "Niños",
  "Образование": "Educación",
  "Накопления/Перевод": "Ahorro/Transferencia",
  "Комиссии": "Comisiones",
  "Прочее": "Otros",
  "Реклама и маркетинг": "Publicidad y marketing",
  "ПО и подписки": "Software y suscripciones",
  "Подрядчики и услуги": "Contratistas y servicios",
  "Аренда": "Alquiler",
  "Зарплата": "Nómina",
  "Банковские комиссии": "Comisiones bancarias",
  "Возвраты": "Reembolsos",
  "Переводы": "Transferencias",
  "Инвестиции": "Inversiones",
  "Связь": "Telefonía",
};

const UK: Record<string, string> = {
  "Жильё и коммуналка": "Житло та комуналка",
  "Продукты": "Продукти",
  "Кафе и рестораны": "Кафе та ресторани",
  "Транспорт": "Транспорт",
  "Здоровье": "Здоров'я",
  "Подписки": "Підписки",
  "Покупки": "Покупки",
  "Развлечения": "Розваги",
  "Путешествия": "Подорожі",
  "Дети": "Діти",
  "Образование": "Освіта",
  "Накопления/Перевод": "Заощадження/Переказ",
  "Комиссии": "Комісії",
  "Прочее": "Інше",
  "Реклама и маркетинг": "Реклама та маркетинг",
  "ПО и подписки": "ПЗ та підписки",
  "Подрядчики и услуги": "Підрядники та послуги",
  "Аренда": "Оренда",
  "Зарплата": "Зарплата",
  "Банковские комиссии": "Банківські комісії",
  "Возвраты": "Повернення",
  "Переводы": "Перекази",
  "Инвестиции": "Інвестиції",
  "Связь": "Зв'язок",
};

export function categoryLabel(name: string, locale: Locale): string {
  if (locale === "en") return EN[name] ?? name;
  if (locale === "es") return ES[name] ?? name;
  if (locale === "uk") return UK[name] ?? name;
  return name;
}
