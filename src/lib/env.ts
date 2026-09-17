import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),

  LLM_PROVIDER: z.enum(["anthropic"]).default("anthropic"),
  LLM_MODEL: z.string().default("claude-opus-4-8"),
  ANTHROPIC_API_KEY: z.string().optional(),

  STRIPE_CLIENT_ID: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_CONNECT_REDIRECT_URI: z.string().url().optional(),

  TOKEN_ENCRYPTION_KEY: z.string().min(32).optional(),

  AUTH_SECRET: z.string().min(1),

  RESEND_API_KEY: z.string().optional(),
  SENDGRID_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Zori <noreply@zori.finance>"),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  APP_URL: z.string().url().default("http://localhost:3000"),

  CRON_SECRET: z.string().optional(),

  STRIPE_PRICE_STARTER: z.string().optional(),
  STRIPE_PRICE_GROWTH: z.string().optional(),
  STRIPE_PRICE_PRO: z.string().optional(),
  STRIPE_PRICE_PLUS: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  GOCARDLESS_SECRET_ID: z.string().optional(),
  GOCARDLESS_SECRET_KEY: z.string().optional(),
  GOCARDLESS_COUNTRY: z.string().length(2).default("ES"),

  ENABLEBANKING_APP_ID: z.string().optional(),
  ENABLEBANKING_PRIVATE_KEY: z.string().optional(),

  YAPILY_APPLICATION_UUID: z.string().optional(),
  YAPILY_APPLICATION_SECRET: z.string().optional(),

  YAXI_KEY_ID: z.string().optional(),
  YAXI_SECRET_KEY: z.string().optional(),
  YAXI_ENV: z.enum(["production", "integration"]).default("production"),
});

export const enableBankingEnabled = Boolean(
  process.env.ENABLEBANKING_APP_ID && process.env.ENABLEBANKING_PRIVATE_KEY
);
export const goCardlessEnabled = Boolean(
  process.env.GOCARDLESS_SECRET_ID && process.env.GOCARDLESS_SECRET_KEY
);
export const yapilyEnabled = Boolean(
  process.env.YAPILY_APPLICATION_UUID && process.env.YAPILY_APPLICATION_SECRET
);
export const yaxiEnabled = Boolean(process.env.YAXI_KEY_ID && process.env.YAXI_SECRET_KEY);
export const bankEnabled = yaxiEnabled || yapilyEnabled || enableBankingEnabled || goCardlessEnabled;

export const env = schema.parse(process.env);
