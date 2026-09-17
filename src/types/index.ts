export type TransactionKind =
  | "charge"
  | "refund"
  | "payout"
  | "fee"
  | "adjustment";

export type Direction = "income" | "expense";

export type TransactionSource =
  | "stripe"
  | "paypal"
  | "manual"
  | "gocardless"
  | "csv";

export interface NormalizedTransaction {
  id: string;
  source: TransactionSource;
  externalId: string;
  kind: TransactionKind;
  direction: Direction;
  grossCents: number;
  feeCents: number;
  netCents: number;
  currency: string;
  occurredAt: Date;
  description: string | null;
  category: string | null;
  origCurrency?: string;
  origGrossCents?: number;
  memberId?: string | null;   // household: кто платил (memberships user_id) | null = общее
}

export interface Period {
  from: Date;
  to: Date;
}

export interface PnL {
  revenueCents: number;
  refundCents: number;
  netRevenueCents: number;
  feeCents: number;
  expenseCents: number;
  totalExpenseCents: number;
  profitCents: number;
  marginPct: number;
  currency: string;
}
