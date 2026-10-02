import { dailyBudget, monthForecast, monthSplit, type MathTx, type Necessity, type Plan } from "../budget-math";
import type { DecisionRow } from "./types";

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r1 = (n: number) => Math.round(n * 10) / 10;

export function checkPurchase(
  p: { amount: number; category_id?: string | null },
  ctx: {
    txs: MathTx[]; cats: Map<string, Necessity>; plan: Plan | null; liquid_balance: number; essential_monthly: number | null;
    emergency_target_months: number; decisions: DecisionRow[];
  },
  now = new Date(),
) {
  const amount = Math.max(0, Math.round(p.amount));
  const d = dailyBudget(now, ctx.txs, ctx.cats, ctx.plan);
  const f = monthForecast(now, ctx.txs, ctx.cats, ctx.plan);
  let flexRemaining: number | null = null;
  const pl = ctx.plan;
  if (pl && pl.monthly_income_expected != null && pl.savings_target != null && pl.monthly_essential_expected != null) {
    const s = monthSplit(now, ctx.txs, ctx.cats);
    const flexBudget = pl.monthly_income_expected - pl.savings_target - Math.max(pl.monthly_essential_expected, s.essentialSoFar);
    flexRemaining = flexBudget - s.flexBeforeToday - s.flexToday;
  }
  const E = ctx.essential_monthly;
  const runway = (cash: number) => (E ? r1(Math.max(0, cash) / E) : null);
  const target = E ? ctx.emergency_target_months * E : null;
  const gap = target != null ? target - ctx.liquid_balance : null;

  let history: { reviewed: number; regret: number } | null = null;
  if (p.category_id) {
    const reviewed = ctx.decisions.filter((x) => x.category_id === p.category_id && x.choice === "bought" && x.review_rating);
    if (reviewed.length >= 3) history = { reviewed: reviewed.length, regret: reviewed.filter((x) => x.review_rating === "regret").length };
  }

  return {
    amount_toman: amount,
    share_of_today_budget: d.status === "ok" && d.today > 0 ? r3(amount / d.today) : null,
    today_budget_toman: d.status === "ok" ? d.today : null,
    share_of_month_flex_remaining: flexRemaining != null && flexRemaining > 0 ? r3(amount / flexRemaining) : null,
    month_flex_remaining_toman: flexRemaining,
    month_flex_remaining_after_toman: flexRemaining == null ? null : flexRemaining - amount,
    forecast_before: f.status === "ok" ? { low_toman: f.low, high_toman: f.high } : null,
    forecast_after: f.status === "ok" ? { low_toman: f.low - amount, high_toman: f.high - amount } : null,
    runway_before: runway(ctx.liquid_balance),
    runway_after: runway(ctx.liquid_balance - amount),
    essential_days: E ? r1(amount / (E / 30)) : null,
    share_of_emergency_gap: gap != null && gap > 0 ? r3(amount / gap) : null,
    emergency_gap_toman: gap != null && gap > 0 ? Math.round(gap) : null,
    category_history: history,
  };
}
