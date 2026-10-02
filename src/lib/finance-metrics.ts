/**
 * Single source of truth for "financial vitals" (finance-metrics). Pure code, no AI.
 * Jalali months, Asia/Tehran days, transfers excluded everywhere.
 * Every value without enough data is null — never a fake zero.
 */
import { jalaliMonth, necessityOf, tehranDay, type MathTx, type Necessity } from "./budget-math";

export type MetricsInput = {
  accounts: { initial_balance: number }[];
  txs: MathTx[];
  categories: { id: string; kind: string; necessity: Necessity | null }[];
  settings: {
    monthly_income_expected: number | null;
    monthly_essential_expected: number | null;
    emergency_fund_target_months: number | null;
  } | null;
  lessons: { slug: string; status: string }[];
  completedSlugs: string[];
};

export type IncomeSource = "recorded" | "expected";

export type FinanceMetrics = {
  liquid_balance: number;
  essential_monthly: number | null;
  essential_monthly_source: "expected" | "average" | null;
  essential_months_used: number;
  runway_months: number | null;
  runway_days: number | null;
  savings_rate_month: number | null;
  savings_rate_source: IncomeSource | null;
  savings_rate_prev_month: number | null;
  savings_rate_prev_source: IncomeSource | null;
  essential_share: number | null;
  emergency_progress: number | null;
  emergency_fund_target_months: number;
  lesson_unlocks: Record<string, boolean>;
  // Raw inputs for "how was this calculated?"
  month: { income: number; expense: number; essential: number; income_used: number | null };
  prev_month: { income: number; expense: number; income_used: number | null };
  transaction_count: number;
  has_essential_category: boolean;
};

export const RUNWAY_UNLOCK_MIN_TX = 10;

const round1 = (n: number) => Math.round(n * 10) / 10;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

function monthTotals(txs: MathTx[], cats: Map<string, Necessity>, m: { from: Date; to: Date }) {
  let income = 0, expense = 0, essential = 0;
  for (const t of txs) {
    if (t.kind === "transfer") continue;
    const at = new Date(t.occurred_at);
    if (at < m.from || at > m.to) continue;
    if (t.kind === "income") income += t.amount;
    else {
      expense += t.amount;
      if (necessityOf(t, cats) === "essential") essential += t.amount;
    }
  }
  return { income, expense, essential };
}

/** Recorded income if any, otherwise the planned monthly income; null when neither exists. */
function incomeBase(recorded: number, expected: number | null | undefined): { value: number; source: IncomeSource } | null {
  if (recorded > 0) return { value: recorded, source: "recorded" };
  if (expected != null && expected > 0) return { value: expected, source: "expected" };
  return null;
}

export function computeFinanceMetrics(input: MetricsInput, now = new Date()): FinanceMetrics {
  const cats = new Map<string, Necessity>(input.categories.map((c) => [c.id, c.necessity ?? "flexible"]));
  const real = input.txs.filter((t) => t.kind !== "transfer");

  const liquid_balance =
    input.accounts.reduce((s, a) => s + Number(a.initial_balance), 0) +
    real.reduce((s, t) => s + (t.kind === "income" ? t.amount : -t.amount), 0);

  // Essential monthly: planned value, else average of up to 3 complete past months covered by history.
  let essential_monthly: number | null = null;
  let essential_monthly_source: FinanceMetrics["essential_monthly_source"] = null;
  let essential_months_used = 0;
  const planned = input.settings?.monthly_essential_expected;
  if (planned != null && planned > 0) {
    essential_monthly = planned;
    essential_monthly_source = "expected";
  } else if (real.length) {
    const firstDay = tehranDay(new Date(Math.min(...real.map((t) => new Date(t.occurred_at).getTime())))).getTime();
    const covered = [-1, -2, -3].map((o) => jalaliMonth(now, o)).filter((m) => firstDay <= m.start.getTime());
    if (covered.length) {
      const total = covered.reduce((s, m) => s + monthTotals(real, cats, m).essential, 0);
      if (total > 0) {
        essential_monthly = Math.round(total / covered.length);
        essential_monthly_source = "average";
        essential_months_used = covered.length;
      }
    }
  }

  const runwayRaw = essential_monthly ? Math.max(0, liquid_balance) / essential_monthly : null;
  const runway_months = runwayRaw == null ? null : round1(runwayRaw);
  const runway_days = runwayRaw == null || !essential_monthly ? null : Math.floor((Math.max(0, liquid_balance) / essential_monthly) * 30);

  const cur = monthTotals(real, cats, jalaliMonth(now));
  const prev = monthTotals(real, cats, jalaliMonth(now, -1));
  const expected = input.settings?.monthly_income_expected;
  const curBase = incomeBase(cur.income, expected);
  const prevBase = incomeBase(prev.income, expected);

  const target = input.settings?.emergency_fund_target_months ?? 3;
  const emergency_progress = runwayRaw == null || target <= 0 ? null : round3(Math.min(1, runwayRaw / target));

  const has_essential_category = input.categories.some((c) => c.kind === "expense" && c.necessity === "essential");
  const completed = new Set(input.completedSlugs);
  const lesson_unlocks: Record<string, boolean> = {};
  for (const l of input.lessons) {
    if (l.status !== "available") lesson_unlocks[l.slug] = false;
    else if (l.slug === "runway") lesson_unlocks[l.slug] = has_essential_category && real.length >= RUNWAY_UNLOCK_MIN_TX;
    else if (l.slug === "room-for-error") lesson_unlocks[l.slug] = completed.has("runway");
    else lesson_unlocks[l.slug] = false;
  }

  return {
    liquid_balance,
    essential_monthly,
    essential_monthly_source,
    essential_months_used,
    runway_months,
    runway_days,
    savings_rate_month: curBase ? round3((curBase.value - cur.expense) / curBase.value) : null,
    savings_rate_source: curBase?.source ?? null,
    savings_rate_prev_month: prevBase ? round3((prevBase.value - prev.expense) / prevBase.value) : null,
    savings_rate_prev_source: prevBase?.source ?? null,
    essential_share: curBase ? round3(cur.essential / curBase.value) : null,
    emergency_progress,
    emergency_fund_target_months: target,
    lesson_unlocks,
    month: { ...cur, income_used: curBase?.value ?? null },
    prev_month: { income: prev.income, expense: prev.expense, income_used: prevBase?.value ?? null },
    transaction_count: real.length,
    has_essential_category,
  };
}

/** Placeholders the lesson generator may use; replaced with live values in the UI. */
export const LESSON_PLACEHOLDERS = [
  "runway_months", "liquid_balance", "essential_monthly", "savings_rate", "essential_share", "emergency_progress",
] as const;
export type Placeholder = (typeof LESSON_PLACEHOLDERS)[number];

export function placeholderValue(m: FinanceMetrics, key: string): number | null | undefined {
  switch (key) {
    case "runway_months": return m.runway_months;
    case "liquid_balance": return m.liquid_balance;
    case "essential_monthly": return m.essential_monthly;
    case "savings_rate": case "savings_rate_month": return m.savings_rate_month;
    case "essential_share": return m.essential_share;
    case "emergency_progress": return m.emergency_progress;
    default: return undefined;
  }
}

export type RunwayBand = { key: "lt1" | "1to3" | "3to6" | "gt6"; label: string };
export function runwayBand(months: number): RunwayBand {
  if (months < 1) return { key: "lt1", label: "کمتر از ۱ ماه" };
  if (months < 3) return { key: "1to3", label: "۱ تا ۳ ماه" };
  if (months <= 6) return { key: "3to6", label: "۳ تا ۶ ماه" };
  return { key: "gt6", label: "بیش از ۶ ماه" };
}

// ---------- Single entry point: runMetrics({ mode, params }, data) ----------

import { dailyBudget as _dailyBudget, monthForecast as _monthForecast } from "./budget-math";
import type { MetricsData } from "./metrics/types";
import type { PeriodKey } from "./metrics/periods";
import { comparePeriods, explainChange, searchTransactions, topExpenses } from "./metrics/queries";
import { findAnomalies } from "./metrics/anomalies";
import { simulate, simulationBaseline, type SimParams } from "./metrics/simulate";
import { checkPurchase } from "./metrics/purchase";
import { withSpoken } from "./metrics/spoken-amount";
import { assetsSummary } from "./metrics/assets";

export type MetricsRequest =
  | { mode: "vitals"; params?: Record<string, never> }
  | { mode: "daily_budget"; params?: Record<string, never> }
  | { mode: "forecast"; params?: Record<string, never> }
  | { mode: "top_expenses"; params: { period: PeriodKey; limit?: number; category_id?: string } }
  | { mode: "compare_periods"; params: { period_a: PeriodKey; period_b: PeriodKey } }
  | { mode: "explain_change"; params: { period: PeriodKey } }
  | { mode: "search_transactions"; params: { period?: PeriodKey; category_id?: string; min_amount?: number; text?: string; limit?: number } }
  | { mode: "anomalies"; params: { transaction_ids?: string[] } }
  | { mode: "simulate"; params: SimParams }
  | { mode: "check_purchase"; params: { amount: number; category_id?: string | null } }
  | { mode: "assets_summary"; params?: Record<string, never> };

function planOf(d: MetricsData) {
  const s = d.settings;
  return s ? { monthly_income_expected: s.monthly_income_expected, savings_target: s.savings_target, monthly_essential_expected: s.monthly_essential_expected } : null;
}

function vitalsOf(d: MetricsData, now: Date) {
  return computeFinanceMetrics({
    accounts: d.accounts, txs: d.txs, categories: d.categories,
    settings: d.settings ? {
      monthly_income_expected: d.settings.monthly_income_expected,
      monthly_essential_expected: d.settings.monthly_essential_expected,
      emergency_fund_target_months: d.settings.emergency_fund_target_months,
    } : null,
    lessons: d.lessons ?? [], completedSlugs: d.completedSlugs ?? [],
  }, now);
}

/** Every number in the app comes from here. Amount fields ending in `_toman` get a spoken `_text` twin. */
export function runMetrics(req: MetricsRequest, d: MetricsData, now = new Date()) {
  const cats = new Map<string, Necessity>(d.categories.map((c) => [c.id, c.necessity ?? "flexible"]));
  switch (req.mode) {
    case "vitals": return vitalsOf(d, now);
    case "daily_budget": return _dailyBudget(now, d.txs, cats, planOf(d));
    case "forecast": return _monthForecast(now, d.txs, cats, planOf(d));
    case "top_expenses": return withSpoken(topExpenses(d.txs, d.categories, req.params, now));
    case "compare_periods": return withSpoken(comparePeriods(d.txs, d.categories, req.params, now));
    case "explain_change": return withSpoken(explainChange(d.txs, d.categories, req.params, now));
    case "search_transactions": return withSpoken(searchTransactions(d.txs, d.categories, req.params, now));
    case "anomalies": return findAnomalies(d, req.params, now);
    case "simulate": {
      const v = vitalsOf(d, now);
      return withSpoken(simulate(simulationBaseline(d.txs, now), req.params, {
        liquid_balance: v.liquid_balance, essential_monthly: v.essential_monthly, emergency_target_months: v.emergency_fund_target_months,
      }));
    }
    case "assets_summary":
      return withSpoken(assetsSummary(d.assets ?? [], d.prices ?? [], d.integration ?? null, vitalsOf(d, now).liquid_balance, now));
    case "check_purchase": {
      const v = vitalsOf(d, now);
      return withSpoken(checkPurchase(req.params, {
        txs: d.txs, cats, plan: planOf(d), liquid_balance: v.liquid_balance, essential_monthly: v.essential_monthly,
        emergency_target_months: v.emergency_fund_target_months, decisions: d.decisions,
      }, now));
    }
  }
}
