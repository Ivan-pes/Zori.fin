-- AI CFO — схема БД для MVP (Фаза 1)
-- Postgres / Supabase. Запуск: npm run db:push
--
-- Принцип: цифры считает детерминированный код по таблице transactions.
-- ИИ только объясняет посчитанное (см. src/lib/metrics, src/lib/chat).

create extension if not exists "pgcrypto";

-- ── Пользователи (аутентификация: Auth.js, email + пароль) ────────────────
-- Пароль хранится ТОЛЬКО как scrypt-хэш (см. src/lib/password.ts).
create table if not exists users (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique,
  password_hash  text,                              -- null у OAuth-пользователей (Google)
  email_verified timestamptz,
  created_at     timestamptz not null default now()
);
-- для уже существующих баз
alter table users add column if not exists email_verified timestamptz;
alter table users alter column password_hash drop not null;
-- двухфакторная аутентификация (2FA): метод и (для TOTP) зашифрованный секрет
alter table users add column if not exists twofa_method text;          -- null | 'totp' | 'email'
alter table users add column if not exists twofa_secret text;          -- AES-зашифрованный base32-секрет (для totp)
-- YAXI тихий автосинк: 32-байтный userSecret (base64), которым в браузере
-- пользователя шифруется доступ к банку (storeCredentials). Сам доступ к банку
-- на сервере НЕ хранится (регуляторный запрет) — только этот ключ, AES-зашифрованный.
alter table users add column if not exists yaxi_user_secret_enc text;

-- одноразовые коды для входа по email-2FA и подтверждения включения (TTL ~10 мин)
create table if not exists login_codes (
  email       text not null,
  code        text not null,                       -- 6 цифр
  purpose     text not null default 'login',       -- 'login' | 'enable'
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_login_codes on login_codes (email, created_at);

-- одноразовые токены подтверждения email
create table if not exists email_verification_tokens (
  token       text primary key,
  email       text not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

-- одноразовые токены сброса пароля (действуют 1 час)
create table if not exists password_reset_tokens (
  token       text primary key,
  email       text not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

-- ── Организация (бизнес-аккаунт клиента) ──────────────────────────────────
-- owner_id ссылается на users.id (без жёсткого FK — чтобы не ломать
-- демо-данные; новые организации создаются с реальным id пользователя).
-- В MVP: один пользователь = одна организация. Пользователи живут в
-- Supabase Auth (auth.users); owner_id ссылается на их UUID.
create table if not exists organizations (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null,                       -- auth.users.id
  name        text not null default 'My Business',
  current_balance_cents bigint,                    -- текущий остаток (для прогноза кэшфлоу)
  safe_threshold_cents  bigint,                    -- безопасный порог остатка
  last_alerted_gap_date date,                      -- дата разрыва, о которой уже слали алерт (антиспам)
  notification_prefs    jsonb not null default '{}'::jsonb,  -- тумблеры уведомлений из Настроек
  tax_rate_pct          numeric,                              -- ставка резерва под налоги, % (B7)
  created_at  timestamptz not null default now()
);
alter table organizations add column if not exists current_balance_cents bigint;
alter table organizations add column if not exists safe_threshold_cents bigint;
alter table organizations add column if not exists last_alerted_gap_date date;
alter table organizations add column if not exists notification_prefs jsonb not null default '{}'::jsonb;
alter table organizations add column if not exists tax_rate_pct numeric;
alter table organizations add column if not exists avatar_data_url text;
alter table organizations add column if not exists industry text;
alter table organizations add column if not exists base_currency text;
alter table organizations add column if not exists locale text;
-- личный режим: тратить не больше N% дохода (null = автоформула с резервом)
alter table organizations add column if not exists spend_target_pct int
  check (spend_target_pct is null or (spend_target_pct between 10 and 100));
-- личный режим: доход руками (зарплата + доп. доходы); null = автодетект из транзакций
alter table organizations add column if not exists salary_cents bigint;
alter table organizations add column if not exists extra_income_cents bigint;
-- личный режим: день зарплаты (1..31). null = период до конца месяца (при ручном доходе)
alter table organizations add column if not exists payday_day int
  check (payday_day is null or (payday_day between 1 and 31));

-- ── Zori Personal (личный режим) ──────────────────────────────────────────
-- Тип пространства: бизнес (по умолчанию) или личные финансы.
alter table organizations add column if not exists type text not null default 'business'
  check (type in ('business','personal'));
-- Цикл зарплаты для safe-to-spend: {kind:'monthly'|'biweekly'|'weekly', anchorDay:int|null, nextPayday:'YYYY-MM-DD'|null}
alter table organizations add column if not exists pay_cycle jsonb;
-- Совместный режим (общий бюджет с партнёром/семьёй).
alter table organizations add column if not exists household boolean not null default false;
-- Атрибуция траты участнику household («кто платил»), только личное. null = общее.
alter table transactions add column if not exists member_id uuid;
-- Переиспользуем существующие поля:
--   current_balance_cents → «остаток на счетах» (safe-to-spend, прогноз)
--   safe_threshold_cents  → «неснижаемый буфер»
-- Граница «нового чата»: история AI-ассистента показывается только после этого момента.
alter table organizations add column if not exists chat_cleared_at timestamptz;

-- ── Счета/активы/долги для net worth (личное) ─────────────────────────────
-- Ручные активы/долги и балансы. Долг хранится отрицательным (kind='debt').
create table if not exists accounts (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  kind          text not null check (kind in ('cash','bank','card','savings','asset','debt')),
  name          text not null,
  balance_cents bigint not null default 0,
  currency      text not null,
  external_id   text,
  manual        boolean not null default true,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists idx_accounts_org on accounts (org_id);

-- Снимки net worth во времени (для тренда). Пишутся cron'ом раз в день.
create table if not exists networth_snapshots (
  org_id       uuid not null references organizations(id) on delete cascade,
  day          date not null,
  assets_cents bigint not null default 0,
  debts_cents  bigint not null default 0,
  net_cents    bigint not null default 0,
  primary key (org_id, day)
);

-- ── Плановые операции (календарь): подписки и разовые траты/доходы ─────────
-- Пользователь вручную планирует будущие движения; видны в календаре, прогнозе и ИИ.
create table if not exists planned_items (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  label        text not null,
  amount_cents bigint not null,                         -- всегда положительное
  direction    text not null check (direction in ('income','expense')),
  category     text,
  kind         text not null check (kind in ('once','monthly')),  -- разовая или подписка
  start_day    date not null,                           -- once: дата; monthly: день старта
  end_day      date,                                    -- monthly: отменить с этой даты (null = активна)
  created_at   timestamptz not null default now()
);
create index if not exists idx_planned_org on planned_items (org_id);

-- ── Бюджеты-конверты по категориям (личное) ───────────────────────────────
-- Лимит траты на категорию в конкретном месяце. «Факт» считается из transactions.
create table if not exists budgets (
  org_id       uuid not null references organizations(id) on delete cascade,
  month        text not null,                       -- 'YYYY-MM'
  category     text not null,
  amount_cents bigint not null,                     -- лимит
  rollover     boolean not null default false,      -- переносить остаток на след. месяц
  created_at   timestamptz not null default now(),
  primary key (org_id, month, category)
);

-- ── Интеграции (read-only подключения источников данных) ──────────────────
-- Для Stripe Connect храним stripe_account_id (acct_...) — не секрет.
-- access_token шифруется на стороне приложения (AES-256-GCM), храним при
-- необходимости. Запрашиваем данные платформенным ключом + Stripe-Account.
create table if not exists integrations (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id) on delete cascade,
  provider            text not null check (provider in ('stripe', 'paypal', 'gocardless')),
  external_account_id text not null,               -- acct_... (Stripe) | requisition id (GoCardless)
  access_token_enc    text,                        -- зашифрованный токен (опц.)
  scope               text not null default 'read_only',
  status              text not null default 'active'
                        check (status in ('active', 'revoked', 'error')),
  metadata            jsonb not null default '{}'::jsonb,  -- банк: {institution_id, institution_name, accounts[]}
  last_synced_at      timestamptz,
  created_at          timestamptz not null default now(),
  unique (org_id, provider, external_account_id)
);
-- миграции для уже существующих баз (create table if not exists не меняет схему)
alter table integrations add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table integrations drop constraint if exists integrations_provider_check;
alter table integrations add constraint integrations_provider_check
  check (provider in ('stripe', 'paypal', 'gocardless'));

-- ── Нормализованные транзакции ────────────────────────────────────────────
-- Единая модель поверх Stripe/PayPal. amount_*_cents — в минимальных единицах
-- валюты (центы). direction: income | expense. raw — исходный объект провайдера.
create table if not exists transactions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  source       text not null check (source in ('stripe', 'paypal', 'manual', 'gocardless', 'csv')),
  external_id  text not null,                      -- id объекта у провайдера
  kind         text not null check (kind in ('charge','refund','payout','fee','adjustment')),
  direction    text not null check (direction in ('income','expense')),
  gross_cents  bigint not null default 0,          -- всегда >= 0
  fee_cents    bigint not null default 0,
  net_cents    bigint not null default 0,          -- знаковое: доход +, расход -
  currency     text not null,
  occurred_at  timestamptz not null,
  description  text,
  category     text,                               -- заполняется категоризацией
  raw          jsonb,
  created_at   timestamptz not null default now(),
  unique (org_id, source, external_id)
);

-- источники: 'gocardless' = open banking API, 'csv' = импорт банковской выписки
alter table transactions drop constraint if exists transactions_source_check;
alter table transactions add constraint transactions_source_check
  check (source in ('stripe', 'paypal', 'manual', 'gocardless', 'csv'));

create index if not exists idx_txn_org_time on transactions (org_id, occurred_at);
create index if not exists idx_txn_org_kind on transactions (org_id, kind);

-- Category Signals §4.1: как и насколько уверенно проставлена категория.
alter table transactions add column if not exists category_method text;        -- 'rule' | 'ai' | 'user'
alter table transactions add column if not exists category_confidence numeric; -- 0..1 (для method='ai')
alter table transactions add column if not exists subcategory text;            -- опц. второй уровень

-- Мультибанк: к какому банковскому подключению относится операция (= integrations
-- .external_account_id, напр. `yaxi:<connectionId>`). Позволяет удалять один банк
-- из нескольких. Для csv/manual/stripe/paypal остаётся null (метка не нужна).
alter table transactions add column if not exists external_account_id text;
create index if not exists idx_txn_ext_acct on transactions (org_id, external_account_id);
-- Разовый backfill: у существующих орг сейчас максимум один живой YAXI-банк —
-- метим все его операции этим подключением (идемпотентно: только там, где null).
update transactions t set external_account_id = i.external_account_id
  from integrations i
  where t.org_id = i.org_id and t.source = 'gocardless' and t.external_account_id is null
    and i.provider = 'gocardless' and i.metadata->>'provider' = 'yaxi';
-- очередь на проверку (§4.2): низкая уверенность или пустая категория
create index if not exists idx_txn_review
  on transactions (org_id) where category is null or category_confidence < 0.6;

-- Category Signals §4.3: правила пользователя. Побеждают авто-категоризацию —
-- когда пользователь меняет категорию, апсертим правило по merchantKey(description),
-- и впредь тот же мерчант категоризируется мгновенно и стабильно.
create table if not exists category_rules (
  org_id      uuid not null references organizations(id) on delete cascade,
  match_key   text not null,          -- merchantKey(description)
  category    text not null,
  subcategory text,
  created_at  timestamptz not null default now(),
  primary key (org_id, match_key)
);

-- ── Личные подписки: ручные + скрытые авто-определённые ───────────────────
-- Авто-детектор (detectRecurring) не всегда прав: даём пользователю добавить
-- свои подписки и скрыть ложные срабатывания (по merchantKey).
create table if not exists manual_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  name         text not null,
  amount_cents bigint not null,
  cadence      text not null default 'monthly' check (cadence in ('weekly','monthly')),
  currency     text not null default 'EUR',
  next_due     date,
  created_at   timestamptz not null default now()
);
-- бизнес: «Зарплата — Иван», «Аренда офиса» — категория связывает платёж
-- с бюджетом-конвертом и аналитикой
alter table manual_subscriptions add column if not exists category text;
create index if not exists idx_manual_subs_org on manual_subscriptions (org_id);

create table if not exists hidden_subscriptions (
  org_id     uuid not null references organizations(id) on delete cascade,
  match_key  text not null,          -- merchantKey скрытой авто-подписки
  created_at timestamptz not null default now(),
  primary key (org_id, match_key)
);

-- ── Свои категории пользователя ────────────────────────────────────────────
-- Дополняют базовый таксоном (селекты, бюджеты, AI-классификатор, сигналы).
create table if not exists custom_categories (
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  primary key (org_id, name)
);

-- ── История чата (вопросы пользователя и ответы ИИ) ───────────────────────
create table if not exists chat_messages (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  role        text not null check (role in ('user','assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_chat_org_time on chat_messages (org_id, created_at);

-- ── Кэш AI-сводок недельных отчётов ───────────────────────────────────────
-- Чтобы не дёргать LLM на каждое открытие страницы «Отчёты». Сводка хранится
-- по (организация, смещение недели); переиспользуется, пока актуальна (тот же
-- день и неизменные цифры — см. fingerprint), иначе пересобирается.
create table if not exists report_summaries (
  org_id        uuid not null references organizations(id) on delete cascade,
  week_offset   int not null,                       -- 0 = текущая неделя, 1 = прошлая, …
  summary       text not null,
  fingerprint   text not null,                      -- слепок ключевых цифр периода
  generated_at  timestamptz not null default now(),
  primary key (org_id, week_offset)
);

-- ── Подписки КЛИЕНТОВ организации (читаем из их Stripe) ───────────────────
-- Не путать с таблицей subscriptions выше (это НАША подписка на Zori).
-- Нужны для честных метрик: MRR, активные клиенты, отток, LTV.
create table if not exists stripe_subscriptions (
  id             text primary key,                  -- sub_... из Stripe
  org_id         uuid not null references organizations(id) on delete cascade,
  customer_id    text,
  status         text not null,                     -- active/trialing/canceled/past_due/…
  amount_cents   bigint not null default 0,         -- сумма за интервал
  currency       text,
  interval       text,                              -- month/year/week/day
  interval_count int not null default 1,
  product_name   text,
  current_period_end timestamptz,
  canceled_at    timestamptz,
  started_at     timestamptz,                       -- created у Stripe
  synced_at      timestamptz not null default now()
);
create index if not exists idx_stripe_subs_org on stripe_subscriptions (org_id, status);

-- ── Подписки на НАШ продукт (Stripe Billing — Фаза 2) ─────────────────────
create table if not exists subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organizations(id) on delete cascade,
  stripe_customer_id   text,
  plan                 text check (plan in ('starter','growth','pro','plus')),
  status               text not null default 'trialing',
  current_period_end   timestamptz,
  created_at           timestamptz not null default now(),
  unique (org_id)
);
-- миграция: личный тариф 'plus' (для уже существующих баз)
alter table subscriptions drop constraint if exists subscriptions_plan_check;
alter table subscriptions add constraint subscriptions_plan_check
  check (plan in ('starter','growth','pro','plus'));
-- Бессрочный «подаренный» доступ: план выдан вручную, Stripe не участвует.
-- comped = true → план активен всегда (status/current_period_end игнорируются),
-- Checkout закрыт, вебхук такую строку не трогает (см. src/lib/billing/plan.ts).
alter table subscriptions add column if not exists comped boolean not null default false;
alter table subscriptions add column if not exists comp_note text;

-- ── Команда: приглашённые участники организации (бухгалтер/партнёр) ─────────
-- Роли: owner (владелец, в memberships не хранится), finance, viewer.
-- Статус invited → active (привязывается user_id при первом входе) → revoked.
create table if not exists memberships (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  email       text not null,
  user_id     uuid references users(id) on delete cascade,  -- заполняется при активации приглашения
  role        text not null default 'finance' check (role in ('owner','finance','viewer')),
  status      text not null default 'invited' check (status in ('invited','active','revoked')),
  created_at  timestamptz not null default now(),
  unique (org_id, email)
);
-- Для существующих баз: колонка user_id могла отсутствовать (добавляем до индекса по ней).
alter table memberships add column if not exists user_id uuid references users(id) on delete cascade;
-- Подпись «кто это»: ключ son/daughter/accountant… (локализуется в UI), не влияет на права.
alter table memberships add column if not exists label text;
create index if not exists idx_memberships_org on memberships (org_id, status);
create index if not exists idx_memberships_user on memberships (user_id, status);

-- ── Журнал импортов выписки (для лимита импортов по тарифу) ────────────────
-- Один ряд на каждый успешный импорт CSV/PDF; считаем за календарный месяц.
create table if not exists import_log (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  kind        text not null,                      -- 'csv' | 'pdf'
  created_at  timestamptz not null default now()
);
create index if not exists idx_import_log_org_time on import_log (org_id, created_at);

-- ── Попытки входа (лимит для защиты от перебора пароля) ────────────────────
-- Пишем только НЕУДАЧНЫЕ попытки; при успешном входе записи по email чистим.
create table if not exists login_attempts (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  ip          text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_login_attempts on login_attempts (email, created_at);

-- ── Бюджет / цели vs факт (B10) ───────────────────────────────────────────
-- Цель по метрике на конкретный месяц. metric: revenue | expense | profit.
create table if not exists targets (
  org_id       uuid not null references organizations(id) on delete cascade,
  month        text not null,                       -- 'YYYY-MM'
  metric       text not null check (metric in ('revenue','expense','profit')),
  amount_cents bigint not null,
  created_at   timestamptz not null default now(),
  primary key (org_id, month, metric)
);

-- ── Сохранённые сценарии кэшфлоу (B3) ─────────────────────────────────────
-- Именованные допущения поверх прогноза (наём, +% к цене, разовая трата).
create table if not exists cashflow_scenarios (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  name         text not null,
  assumptions  jsonb not null default '{}'::jsonb,  -- {monthlyDeltaCents, oneOffCents, oneOffLabel}
  created_at   timestamptz not null default now()
);
create index if not exists idx_scenarios_org on cashflow_scenarios (org_id, created_at);

-- ── Цели и планирование (фича «Цели») ─────────────────────────────────────
-- kind: savings (подушка) / hire (накопить на найм) / profit (цель по прибыли) / custom.
create table if not exists goals (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  kind         text not null default 'custom',
  title        text not null,
  target_cents bigint not null,
  current_cents bigint not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists idx_goals_org on goals (org_id, created_at);
