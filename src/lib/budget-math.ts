/**
 * Pure money math for the "today's budget", "end-of-month forecast" and plan suggestions.
 * Months are Jalali; day boundaries are Asia/Tehran (fixed UTC+03:30, no DST since 1401).
 * Transfers never enter these calculations. No AI involved.
 */
import { addMonths, getDate, getDaysInMonth, startOfMonth } from "date-fns-jalali";

export const TEHRAN_OFFSET_MIN = 210;

export type Necessity = "essential" | "flexible";
export type MathTx = {
  amount: number;
  kind: "income" | "expense" | "transfer";
  occurred_at: string;
  category_id: string | null;
  necessity_override?: Necessity | null;
};
export type Plan = {
  monthly_income_expected: number | null;
  savings_target: number | null;
  monthly_essential_expected: number | null;
};

/** Tehran wall-clock calendar day of an instant, as a local-midnight Date (for date-fns-jalali). */
export function tehranDay(instant: Date | string): Date {
  const t = new Date(new Date(instant).getTime() + TEHRAN_OFFSET_MIN * 60_000);
  return new Date(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
}

/** Instant at which a Tehran calendar day (given as a local-midnight Date) begins. */
export function tehranDayStartInstant(day: Date): Date {
  return new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) - TEHRAN_OFFSET_MIN * 60_000);
}

/** Jalali month containing `now` (Tehran): its first day, length and instant range. */
export function jalaliMonth(now: Date, offset = 0) {
  const start = startOfMonth(addMonths(tehranDay(now), offset));
  const days = getDaysInMonth(start);
  const next = startOfMonth(addMonths(start, 1));
  return { start, days, from: tehranDayStartInstant(start), to: new Date(tehranDayStartInstant(next).getTime() - 1) };
}

export function necessityOf(t: MathTx, catNecessity: Map<string, Necessity>): Necessity {
  return t.necessity_override ?? (t.category_id ? catNecessity.get(t.category_id) : undefined) ?? "flexible";
}

const isConfigured = (p: Plan | null | undefined): p is { [K in keyof Plan]: number } =>
  !!p && p.monthly_income_expected != null && p.savings_target != null && p.monthly_essential_expected != null;

/** Split this month's expenses (relative to Tehran "today"). */
export function monthSplit(now: Date, txs: MathTx[], cats: Map<string, Necessity>) {
  const m = jalaliMonth(now);
  const today = tehranDay(now).getTime();
  let essentialSoFar = 0, flexBeforeToday = 0, flexToday = 0, flexLast7 = 0, incomeSoFar = 0, count = 0;
  const sevenAgo = today - 6 * 86_400_000;
  for (const t of txs) {
    if (t.kind === "transfer") continue;
    const at = new Date(t.occurred_at);
    if (at < m.from || at > m.to) continue;
    const day = tehranDay(at).getTime();
    if (day > today) continue;
    count++;
    if (t.kind === "income") { incomeSoFar += t.amount; continue; }
    if (necessityOf(t, cats) === "essential") essentialSoFar += t.amount;
    else {
      if (day < today) flexBeforeToday += t.amount; else flexToday += t.amount;
      if (day >= sevenAgo) flexLast7 += t.amount;
    }
  }
  const dayOfMonth = getDate(tehranDay(now));
  return { ...m, dayOfMonth, essentialSoFar, flexBeforeToday, flexToday, flexLast7, incomeSoFar, count };
}

export type DailyBudget =
  | { status: "unconfigured" }
  | { status: "exhausted"; flexToday: number }
  | { status: "ok"; today: number; flexToday: number; daysLeft: number; flexBudget: number };

export function dailyBudget(now: Date, txs: MathTx[], cats: Map<string, Necessity>, plan: Plan | null | undefined): DailyBudget {
  if (!isConfigured(plan)) return { status: "unconfigured" };
  const s = monthSplit(now, txs, cats);
  const commitment = Math.max(plan.monthly_essential_expected, s.essentialSoFar);
  const flexBudget = plan.monthly_income_expected - plan.savings_target - commitment;
  const remainingAtStart = flexBudget - s.flexBeforeToday;
  const daysLeft = s.days - s.dayOfMonth + 1;
  const today = Math.floor(remainingAtStart / daysLeft);
  if (today <= 0) return { status: "exhausted", flexToday: s.flexToday };
  return { status: "ok", today, flexToday: s.flexToday, daysLeft, flexBudget };
}

export type Forecast =
  | { status: "insufficient" }
  | { status: "ok"; low: number; high: number; remainingDays: number };

export function monthForecast(now: Date, txs: MathTx[], cats: Map<string, Necessity>, plan: Plan | null | undefined): Forecast {
  const s = monthSplit(now, txs, cats);
  const elapsedFull = s.dayOfMonth - 1;
  if (elapsedFull < 7 || s.count < 5) return { status: "insufficient" };
  const remainingDays = s.days - s.dayOfMonth;
  const E = plan?.monthly_essential_expected;
  const essentialRemaining = E != null
    ? Math.max(E - s.essentialSoFar, 0)
    : (s.essentialSoFar / s.dayOfMonth) * remainingDays;
  const flexSoFar = s.flexBeforeToday + s.flexToday;
  const flexA = (flexSoFar / s.dayOfMonth) * remainingDays;
  const flexB = (s.flexLast7 / 7) * remainingDays;
  const income = Math.max(plan?.monthly_income_expected ?? 0, s.incomeSoFar);
  const base = income - s.essentialSoFar - flexSoFar - essentialRemaining;
  const a = Math.round(base - flexA), b = Math.round(base - flexB);
  return { status: "ok", low: Math.min(a, b), high: Math.max(a, b), remainingDays };
}

/** Averages of up to 3 previous complete Jalali months that the user's history fully covers. */
export function planSuggestions(now: Date, txs: MathTx[], cats: Map<string, Necessity>) {
  const real = txs.filter((t) => t.kind !== "transfer");
  if (!real.length) return null;
  const first = real.reduce((min, t) => Math.min(min, new Date(t.occurred_at).getTime()), Infinity);
  const firstDay = tehranDay(new Date(first)).getTime();
  // A month counts only when history began on or before its first day (fully covered, fully past).
  const covered = [-1, -2, -3].map((o) => jalaliMonth(now, o)).filter((m) => firstDay <= m.start.getTime());
  if (!covered.length) return null;
  let income = 0, essential = 0, expense = 0;
  for (const m of covered) {
    for (const t of real) {
      const at = new Date(t.occurred_at);
      if (at < m.from || at > m.to) continue;
      if (t.kind === "income") income += t.amount;
      else { expense += t.amount; if (necessityOf(t, cats) === "essential") essential += t.amount; }
    }
  }
  const n = covered.length;
  return {
    months: n,
    monthly_income_expected: Math.round(income / n),
    monthly_essential_expected: Math.round(essential / n),
    savings_target: Math.max(0, Math.round((income - expense) / n)),
  };
}
