# Zori

Personal and small-business finance assistant. Connects bank accounts and Stripe,
computes every number with deterministic code, and uses an LLM only to explain
the results in plain language.

## Core principle

Numbers come from `src/lib/metrics` — pure, unit-tested TypeScript. The AI chat
reaches those metrics through function calling and never invents figures.

## Features

- **P&L, cash flow and runway** — revenue, expenses, margins, burn rate, net worth
- **Forecasting** — balance projection, scenarios, recurring payment calendar
- **Budgets and goals** — targets, variance, safe-to-spend, savings tracking
- **Transaction intelligence** — auto-categorization, anomaly detection,
  subscription discovery, vendor and category analytics
- **Imports** — Open Banking (GoCardless, Enable Banking, Yapily), Stripe Connect
  (read-only), CSV/XLSX, PDF statements, receipt scanning
- **Reports** — PDF/Excel export, scheduled email summaries, alerts
- **Accounts** — personal and business modes, teams with roles, 2FA (TOTP/email),
  Stripe billing, i18n (en, ru, uk, es)

## Stack

Next.js 15 (App Router) · TypeScript · PostgreSQL · Auth.js · Claude (Anthropic) ·
Stripe · Vitest

## Getting started

```bash
npm install
cp .env.example .env    # fill in keys
npm run db:push         # apply db/schema.sql to Postgres
npm run dev             # http://localhost:3000
```

Generate the token encryption key with `openssl rand -hex 32`.

## Scripts

```bash
npm run build       # production build
npm run typecheck   # tsc --noEmit
npm test            # vitest run
```

## Layout

```
db/schema.sql     Postgres schema
src/app/          pages and API routes
src/lib/metrics/  deterministic financial engine (the core)
src/lib/llm/      LLM provider abstraction
src/lib/chat/     AI chat over metrics via function calling
src/lib/          bank, Stripe, import, reports, auth and billing modules
scripts/          database and setup utilities
```

## Deployment

Blueprints are included for Render (`render.yaml`) and Vercel (`vercel.json`).
All secrets are supplied as environment variables — see `.env.example`.
