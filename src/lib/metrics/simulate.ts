import { getDate } from "date-fns-jalali";
import { jalaliMonth, tehranDay } from "../budget-math";
import type { FullTx } from "./types";

export type ScenarioItem =
  | { type: "reduce_category"; category_id: string; mode: "percent" | "amount"; value: number }
  | { type: "increase_saving"; amount_per_month: number }
  | { type: "one_time_expense"; amount: number; month_offset: number }
  | { type: "income_change"; amount_per_month: number };

export type SimParams = { items: ScenarioItem[]; months: 3 | 6 | 12; inflation_annual_percent?: number | null };

export type Baseline = {
  source: "average" | "estimate";
  months_used: number;
  income: number;
  expense: number;
  net: number;
  by_category: Record<string, number>;
};

export function simulationBaseline(txs: FullTx[], now = new Date()): Baseline | null {
  const real = txs.filter((t) => t.kind !== "transfer");
  if (!real.length) return null;
  const first = real.reduce((m, t) => Math.min(m, new Date(t.occurred_at).getTime()), Infinity);
  const covered = [-1, -2, -3].map((o) => jalaliMonth(now, o)).filter((m) => first <= m.from.getTime());
  const agg = (from: Date, to: Date) => {
    let income = 0, expense = 0, count = 0; const by: Record<string, number> = {};
    for (const t of real) {
      const at = new Date(t.occurred_at); if (at < from || at > to) continue;
      count++;
      if (t.kind === "income") income += t.amount;
      else { expense += t.amount; const k = t.category_id ?? "none"; by[k] = (by[k] ?? 0) + t.amount; }
    }
    return { income, expense, by, count };
  };
  if (covered.length) {
    const parts = covered.map((m) => agg(m.from, m.to));
    const n = covered.length, by: Record<string, number> = {};
    for (const p of parts) for (const [k, v] of Object.entries(p.by)) by[k] = (by[k] ?? 0) + v / n;
    const income = parts.reduce((s, p) => s + p.income, 0) / n, expense = parts.reduce((s, p) => s + p.expense, 0) / n;
    return { source: "average", months_used: n, income: Math.round(income), expense: Math.round(expense), net: Math.round(income - expense), by_category: by };
  }
  const m = jalaliMonth(now), day = getDate(tehranDay(now));
  const cur = agg(m.from, now);
  if (day < 14 || cur.count < 10) return null;
  const f = 30 / day, by: Record<string, number> = {};
  for (const [k, v] of Object.entries(cur.by)) by[k] = v * f;
  return { source: "estimate", months_used: 0, income: Math.round(cur.income * f), expense: Math.round(cur.expense * f), net: Math.round((cur.income - cur.expense) * f), by_category: by };
}

export function simulate(base: Baseline | null, p: SimParams, ctx: { liquid_balance: number; essential_monthly: number | null; emergency_target_months: number }) {
  if (!base) return { status: "insufficient" as const, message: "داده برای شبیه‌سازی کافی نیست" };
  const items = p.items.slice(0, 3);
  let monthlyDelta = 0;
  const oneTime = new Map<number, number>();
  for (const it of items) {
    if (it.type === "reduce_category") {
      const cap = base.by_category[it.category_id] ?? 0;
      monthlyDelta += Math.min(cap, Math.max(0, it.mode === "percent" ? (cap * it.value) / 100 : it.value));
    } else if (it.type === "increase_saving") monthlyDelta += Math.max(0, it.amount_per_month);
    else if (it.type === "income_change") monthlyDelta += it.amount_per_month;
    else oneTime.set(Math.max(0, Math.floor(it.month_offset)), (oneTime.get(Math.max(0, Math.floor(it.month_offset))) ?? 0) + Math.max(0, it.amount));
  }
  const H = p.months;
  const series: { month: number; baseline_toman: number; scenario_toman: number }[] = [];
  let b = 0, s = 0;
  for (let i = 0; i < H; i++) {
    b += base.net; s += base.net + monthlyDelta - (oneTime.get(i) ?? 0);
    series.push({ month: i + 1, baseline_toman: Math.round(b), scenario_toman: Math.round(s) });
  }
  const E = ctx.essential_monthly;
  const runway = (cash: number) => (E ? Math.round((Math.max(0, cash) / E) * 10) / 10 : null);
  const target = E ? ctx.emergency_target_months * E : null;
  const monthsTo = (delta: number, withOneTime: boolean) => {
    if (target == null) return null;
    let cash = ctx.liquid_balance;
    if (cash >= target) return 0;
    for (let i = 0; i < 60; i++) {
      cash += base.net + delta - (withOneTime ? oneTime.get(i) ?? 0 : 0);
      if (cash >= target) return i + 1;
    }
    return null;
  };
  const endB = ctx.liquid_balance + b, endS = ctx.liquid_balance + s;
  const inf = p.inflation_annual_percent;
  const deflate = (v: number) => (inf ? Math.round(v / Math.pow(1 + inf / 100, H / 12)) : null);
  return {
    status: "ok" as const,
    baseline_source: base.source,
    baseline_label: base.source === "estimate" ? "تخمین اولیه" : null,
    baseline_months_used: base.months_used,
    baseline_monthly_net_toman: base.net,
    months: H,
    series,
    difference_end_toman: Math.round(s - b),
    cash_end_baseline_toman: Math.round(endB),
    cash_end_scenario_toman: Math.round(endS),
    runway_end_baseline: runway(endB),
    runway_end_scenario: runway(endS),
    months_to_emergency_baseline: monthsTo(0, false),
    months_to_emergency_scenario: monthsTo(monthlyDelta, true),
    inflation_annual_percent: inf ?? null,
    real_cash_end_baseline_toman: deflate(endB),
    real_cash_end_scenario_toman: deflate(endS),
  };
}
