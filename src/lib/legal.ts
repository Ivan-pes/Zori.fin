import type { Locale } from "./i18n";

export interface LegalDoc {
  title: string;
  updated: string;
  back: string;
  intro: string;
  sections: { h: string; p: string }[];
  note: string;
}

// В текстах: **жирный** и e-mail (support@zori.finance) распознаются рендерером.

const privacyRu: LegalDoc = {
  back: "← На главную",
  title: "Политика конфиденциальности",
  updated: "Последнее обновление: 30 июня 2026",
  intro:
    "Эта Политика описывает, какие данные собирает сервис Zori (далее — «Сервис»), как мы их используем и защищаем. Используя Сервис, вы соглашаетесь с настоящей Политикой.",
  sections: [
    { h: "1. Какие данные мы обрабатываем", p: "**Аккаунт:** email, название бизнеса, аватар, настройки (валюта, язык, отрасль). **Финансовые данные:** операции, суммы, балансы и подписки из подключённых вами источников (Stripe, PayPal, банковские счета через открытый банкинг) — **только в режиме чтения**. **Технические данные:** журналы входа и базовые логи для безопасности. Мы **не** храним пароли в открытом виде и **не** храним учётные данные ваших банков — подключение проходит на стороне самого банка." },
    { h: "2. Зачем мы используем данные", p: "Только чтобы предоставлять Сервис: считать аналитику и отчёты, показывать прогноз, отвечать на вопросы в AI-ассистенте, отправлять включённые вами уведомления. Мы **не продаём** ваши данные и не используем их в рекламе." },
    { h: "3. Открытый банкинг — только чтение", p: "Подключение банка выполняется через лицензированного провайдера открытого банкинга и даёт **доступ только на чтение**. Мы не можем инициировать платежи. Согласие можно **в любой момент отозвать** — в разделе «Интеграции» или на стороне банка/провайдера." },
    { h: "4. Поставщики (субпроцессоры)", p: "Для работы Сервиса мы используем надёжных подрядчиков, обрабатывающих данные по нашему поручению: хостинг и база данных (облачные провайдеры); платёжные и банковские агрегаторы (Stripe, провайдер открытого банкинга); email-рассылки (подтверждение почты, отчёты, коды входа); AI-провайдер — для формулировки ответов ассистента." },
    { h: "5. Безопасность", p: "Токены интеграций хранятся в зашифрованном виде (AES-256-GCM), пароли — в виде необратимого хэша, соединения защищены HTTPS. Данные одной организации изолированы от других. Полную безопасность в интернете гарантировать невозможно, но мы применяем разумные технические меры." },
    { h: "6. Хранение и удаление", p: "Мы храним данные, пока существует ваш аккаунт. Вы можете запросить отключение интеграций и удаление аккаунта вместе со связанными данными, написав нам." },
    { h: "7. Ваши права", p: "Вы вправе запросить доступ к своим данным, их исправление или удаление, а также отозвать согласия. Для этого свяжитесь с нами." },
    { h: "8. Контакты", p: "По вопросам конфиденциальности: support@zori.finance." },
  ],
  note:
    "Документ носит общий характер и является шаблоном; он не является юридической консультацией. Для коммерческого запуска (и соответствия GDPR) рекомендуется проверка юристом.",
};

const privacyEn: LegalDoc = {
  back: "← Home",
  title: "Privacy Policy",
  updated: "Last updated: June 30, 2026",
  intro:
    "This Policy explains what data the Zori service (the “Service”) collects, and how we use and protect it. By using the Service, you agree to this Policy.",
  sections: [
    { h: "1. Data we process", p: "**Account:** email, business name, avatar, settings (currency, language, industry). **Financial data:** transactions, amounts, balances and subscriptions from the sources you connect (Stripe, PayPal, bank accounts via open banking) — **read-only**. **Technical data:** sign-in records and basic logs for security. We do **not** store passwords in plain text and do **not** store your bank credentials — the bank connection happens on the bank’s side." },
    { h: "2. Why we use data", p: "Only to provide the Service: compute analytics and reports, show forecasts, answer your questions in the AI assistant, and send notifications you enable. We do **not sell** your data and do not use it for advertising." },
    { h: "3. Open banking — read-only", p: "Bank connection is performed through a licensed open-banking provider and grants **read-only access**. We cannot initiate payments. Consent can be **revoked at any time** — in the “Integrations” section or on the bank/provider side." },
    { h: "4. Subprocessors", p: "To run the Service we use trusted vendors that process data on our behalf: application hosting and database (cloud providers); payment and banking aggregators (Stripe, open-banking provider); email delivery (verification, reports, login codes); an AI provider — to phrase the assistant’s answers." },
    { h: "5. Security", p: "Integration tokens are stored encrypted (AES-256-GCM), passwords as an irreversible hash, and connections are secured with HTTPS. Each organization’s data is isolated from others. Complete security on the internet cannot be guaranteed, but we apply reasonable technical measures." },
    { h: "6. Retention and deletion", p: "We keep your data while your account exists. You can request disconnecting integrations and deleting your account together with related data by contacting us." },
    { h: "7. Your rights", p: "You may request access to your data, its correction or deletion, and withdraw consents. To do so, contact us." },
    { h: "8. Contact", p: "For privacy questions: support@zori.finance." },
  ],
  note:
    "This document is general and a template; it is not legal advice. For a commercial launch (and GDPR compliance) a review by a lawyer is recommended.",
};

const termsRu: LegalDoc = {
  back: "← На главную",
  title: "Условия использования",
  updated: "Последнее обновление: 30 июня 2026",
  intro:
    "Настоящие Условия регулируют использование сервиса Zori — онлайн-инструмента финансовой аналитики для малого и среднего бизнеса (далее — «Сервис»). Используя Сервис, вы (далее — «Пользователь») подтверждаете, что прочитали, поняли и согласны с настоящими Условиями. Если вы не согласны — не используйте Сервис.",
  sections: [
    { h: "1. Что делает Сервис", p: "Zori подключается к вашим источникам финансовых данных (Stripe, PayPal, банковские счета через открытый банкинг) **только в режиме чтения**, агрегирует операции и показывает аналитику: прибыль, расходы, прогноз денежного потока, отчёты и ответы AI-ассистента. Сервис не инициирует платежи и не управляет вашими деньгами." },
    { h: "2. Сервис предоставляется «как есть»", p: "Сервис предоставляется по принципу **«как есть» и «по мере доступности»**, без каких-либо гарантий — явных или подразумеваемых, в том числе гарантий точности, полноты, бесперебойности или пригодности для конкретной цели. Мы стремимся к корректности расчётов, но **не гарантируем** отсутствие ошибок, задержек данных от сторонних провайдеров или перерывов в работе." },
    { h: "3. Не является финансовой консультацией", p: "Аналитика, прогнозы и ответы AI-ассистента носят **исключительно информационный характер** и **не являются** финансовой, бухгалтерской, налоговой, юридической или инвестиционной консультацией. Сервис не заменяет профессионального бухгалтера или консультанта." },
    { h: "4. Ответственность Пользователя", p: "Пользователь **самостоятельно решает**, пользоваться Сервисом или нет, и **несёт полную ответственность** за любые решения, принятые на основе предоставленной информации, и их последствия. Пользователь обязуется проверять важные цифры в первоисточниках (банк, Stripe, бухгалтерия) перед принятием решений." },
    { h: "5. Ограничение ответственности", p: "В максимально допустимой законом степени Zori и её создатели **не несут ответственности** за любые прямые, косвенные, случайные или последующие убытки (включая упущенную выгоду, потерю данных или ущерб бизнесу), возникшие в связи с использованием или невозможностью использования Сервиса." },
    { h: "6. Сторонние сервисы", p: "Сервис использует сторонних поставщиков (платёжные системы, провайдеры открытого банкинга, хостинг, email, AI). Их доступность и корректность данных мы не контролируем и за них не отвечаем. Использование подключённых сервисов регулируется их собственными условиями." },
    { h: "7. Изменения и прекращение", p: "Мы можем изменять, приостанавливать или прекращать работу Сервиса в любое время, а также обновлять настоящие Условия. Продолжение использования после изменений означает согласие с обновлённой версией." },
    { h: "8. Контакты", p: "Вопросы по Условиям: support@zori.finance." },
  ],
  note:
    "Документ носит общий характер и является шаблоном; он не является юридической консультацией. Для коммерческого запуска рекомендуется проверка юристом.",
};

const termsEn: LegalDoc = {
  back: "← Home",
  title: "Terms of Use",
  updated: "Last updated: June 30, 2026",
  intro:
    "These Terms govern your use of Zori — an online financial-analytics tool for small and medium businesses (the “Service”). By using the Service, you (the “User”) confirm that you have read, understood and agree to these Terms. If you do not agree, do not use the Service.",
  sections: [
    { h: "1. What the Service does", p: "Zori connects to your financial data sources (Stripe, PayPal, bank accounts via open banking) on a **read-only** basis, aggregates transactions and shows analytics: profit, expenses, cash-flow forecast, reports and AI-assistant answers. The Service does not initiate payments and does not manage your money." },
    { h: "2. Provided “as is”", p: "The Service is provided on an **“as is” and “as available”** basis, without warranties of any kind — express or implied — including accuracy, completeness, uninterrupted operation or fitness for a particular purpose. We strive for correct calculations but do **not guarantee** the absence of errors, third-party data delays or downtime." },
    { h: "3. Not financial advice", p: "Analytics, forecasts and AI-assistant answers are **for informational purposes only** and are **not** financial, accounting, tax, legal or investment advice. The Service does not replace a professional accountant or advisor." },
    { h: "4. User responsibility", p: "The User **decides independently** whether to use the Service and **bears full responsibility** for any decisions made based on the provided information and their consequences. The User agrees to verify important figures in primary sources (bank, Stripe, accounting) before making decisions." },
    { h: "5. Limitation of liability", p: "To the maximum extent permitted by law, Zori and its creators are **not liable** for any direct, indirect, incidental or consequential damages (including lost profit, data loss or business harm) arising from the use of or inability to use the Service." },
    { h: "6. Third-party services", p: "The Service uses third-party providers (payment systems, open-banking providers, hosting, email, AI). We do not control and are not responsible for their availability or data accuracy. Use of connected services is also governed by their own terms." },
    { h: "7. Changes and termination", p: "We may change, suspend or discontinue the Service at any time, and update these Terms. Continued use after changes constitutes acceptance of the updated version." },
    { h: "8. Contact", p: "Questions about these Terms: support@zori.finance." },
  ],
  note:
    "This document is general and a template; it is not legal advice. A review by a lawyer is recommended before a commercial launch.",
};

export function privacyDoc(locale: Locale): LegalDoc {
  return locale === "ru" ? privacyRu : privacyEn;
}
export function termsDoc(locale: Locale): LegalDoc {
  return locale === "ru" ? termsRu : termsEn;
}
