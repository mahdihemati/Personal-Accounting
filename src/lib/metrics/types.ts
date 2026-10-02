import type { Necessity } from "../budget-math";

export type FullTx = {
  id: string;
  amount: number;
  kind: "income" | "expense" | "transfer";
  occurred_at: string;
  created_at: string;
  category_id: string | null;
  account_id: string;
  note: string | null;
  necessity_override?: Necessity | null;
  exclude_from_baseline?: boolean | null;
};

export type MCategory = { id: string; name: string; kind: string; necessity: Necessity | null; alerts_muted?: boolean | null };

export type MSettings = {
  monthly_income_expected: number | null;
  savings_target: number | null;
  monthly_essential_expected: number | null;
  emergency_fund_target_months: number | null;
  alerts_enabled?: boolean | null;
  alerts_last_checked_on?: string | null;
};

export type AlertKind = "large_transaction" | "category_pace" | "possible_duplicate";
export type AlertRow = {
  id?: string;
  kind: AlertKind;
  transaction_id: string | null;
  category_id: string | null;
  payload: Record<string, unknown>;
  status?: string;
  created_at?: string;
};

export type DecisionRow = {
  id: string;
  title: string;
  amount_toman: number;
  category_id: string | null;
  choice: "bought" | "postponed" | "skipped";
  reason: string | null;
  decided_at: string;
  review_at: string | null;
  review_rating: "worth" | "neutral" | "regret" | null;
  review_note: string | null;
  transaction_id: string | null;
};

export type MetricsData = {
  accounts: { id: string; name: string; initial_balance: number }[];
  txs: FullTx[];
  categories: MCategory[];
  settings: MSettings | null;
  decisions: DecisionRow[];
  alerts: AlertRow[];
  lessons?: { slug: string; status: string }[];
  completedSlugs?: string[];
  assets?: import("./assets").AssetRow[];
  prices?: import("./assets").PriceRow[];
  integration?: import("./assets").IntegrationRow | null;
};
