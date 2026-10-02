/**
 * Weekly report numbers, experiment options/validation and experiment results. Pure code, no AI.
 * Week = 7 Tehran days ending on the most recent report weekday (0 = Saturday … 6 = Friday).
 */
import { getDaysInMonth } from "date-fns-jalali";
import { jalaliMonth, necessityOf, tehranDay, tehranDayStartInstant, type MathTx, type Necessity } from "./budget-math";
import { formatToman, toFa } from "./format";

const DAY = 86_400_000;
const round1 = (n: number) => Math.round(n * 10) / 10;

export const WEEKDAY_LABELS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
export const MIN_WEEK_TX = 5;

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDaysLocal = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export type Week = { startDay: Date; endDay: Date; from: Date; to: Date; week_start: string; week_end: string };

export function weekEndingOn(endDay: Date): Week {
  const startDay = addDaysLocal(endDay, -6);
  return {
    startDay, endDay,
    from: tehranDayStartInstant(startDay),
    to: new Date(tehranDayStartInstant(addDaysLocal(endDay, 1)).getTime() - 1),
    week_start: dayKey(startDay), week_end: dayKey(endDay),
  };
}

/** The week ending on the most recent report weekday (today counts if it is the report day). */
export function reportWeek(now: Date, reportWeekday: number, offsetWeeks = 0): Week {
  const today = tehranDay(now);
  const satIdx = (today.getDay() + 1) % 7; // JS: Sunday=0 → Saturday-based index
  const back = (satIdx - reportWeekday + 7) % 7;
  return weekEndingOn(addDaysLocal(today, -back - 7 * offsetWeeks));
}

export type Plan = { monthly_income_expected: number | null; savings_target: number | null; monthly_essential_expected: number | null };

/** Flexible monthly budget ÷ days of that Jalali month; null when the plan is incomplete. */
export function dailyFlexCap(day: Date, plan: Plan | null): number | null {
  if (!plan || plan.monthly_income_expected == null || plan.savings_target == null || plan.monthly_essential_expected == null) return null;
  const flex = plan.monthly_income_expected - plan.savings_target - plan.monthly_essential_expected;
  return Math.max(0, Math.floor(flex / getDaysInMonth(day)));
}

export type TopCategory = { category_id: string; name: string; amount: number; prev_amount: number; change: number };

export type WeekMetrics = {
  week_start: string;
  week_end: string;
  tx_count: number;
  income: number;
  expense: number;
  prev_income: number;
  prev_expense: number;
  income_change: number;
  expense_change: number;
  top_categories: TopCategory[];
  essential: number;
  flexible: number;
  days_without_entries: number;
  daily_flex_cap: number | null;
  days_under_cap: number | null;
  no_spend_days: number;
  runway_start: number | null;
  runway_end: number | null;
  runway_change: number | null;
};

type Input = {
  txs: MathTx[];
  categories: { id: string; name: string; necessity: Necessity | null }[];
  initialTotal: number;
  essentialMonthly: number | null;
  plan: Plan | null;
};

function balanceAt(input: Input, instant: Date) {
  let b = input.initialTotal;
  for (const t of input.txs) {
    if (t.kind === "transfer" || new Date(t.occurred_at) > instant) continue;
    b += t.kind === "income" ? t.amount : -t.amount;
  }
  return b;
}

export function weekMetrics(input: Input, week: Week): WeekMetrics {
  const cats = new Map<string, Necessity>(input.categories.map((c) => [c.id, c.necessity ?? "flexible"]));
  const names = new Map(input.categories.map((c) => [c.id, c.name]));
  const prev = weekEndingOn(addDaysLocal(week.endDay, -7));
  const inRange = (t: MathTx, w: Week) => { const at = new Date(t.occurred_at); return at >= w.from && at <= w.to; };
  const real = input.txs.filter((t) => t.kind !== "transfer");
  const cur = real.filter((t) => inRange(t, week));
  const before = real.filter((t) => inRange(t, prev));

  const sum = (l: MathTx[], k: string) => l.filter((t) => t.kind === k).reduce((s, t) => s + t.amount, 0);
  const byCat = (l: MathTx[]) => {
    const m = new Map<string, number>();
    for (const t of l) if (t.kind === "expense") m.set(t.category_id ?? "none", (m.get(t.category_id ?? "none") ?? 0) + t.amount);
    return m;
  };
  const curCats = byCat(cur), prevCats = byCat(before);
  const top_categories = [...curCats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, amount]) => {
    const prev_amount = prevCats.get(id) ?? 0;
    return { category_id: id, name: names.get(id) ?? "بدون دسته", amount, prev_amount, change: amount - prev_amount };
  });

  let essential = 0, flexible = 0;
  const perDay = new Map<number, { any: boolean; expense: number; flex: number }>();
  for (let i = 0; i < 7; i++) perDay.set(addDaysLocal(week.startDay, i).getTime(), { any: false, expense: 0, flex: 0 });
  for (const t of cur) {
    const d = perDay.get(tehranDay(t.occurred_at).getTime());
    if (d) d.any = true;
    if (t.kind !== "expense") continue;
    const isEss = necessityOf(t, cats) === "essential";
    if (isEss) essential += t.amount; else flexible += t.amount;
    if (d) { d.expense += t.amount; if (!isEss) d.flex += t.amount; }
  }
  const days = [...perDay.entries()];
  const cap = dailyFlexCap(week.endDay, input.plan);
  const days_under_cap = cap == null ? null
    : days.filter(([ts, d]) => { const c = dailyFlexCap(new Date(ts), input.plan) ?? cap; return d.flex <= c; }).length;

  const E = input.essentialMonthly;
  const runway = (b: number) => (E ? round1(Math.max(0, b) / E) : null);
  const runway_start = runway(balanceAt(input, new Date(week.from.getTime() - 1)));
  const runway_end = runway(balanceAt(input, week.to));

  const income = sum(cur, "income"), expense = sum(cur, "expense");
  const prev_income = sum(before, "income"), prev_expense = sum(before, "expense");
  return {
    week_start: week.week_start, week_end: week.week_end,
    tx_count: cur.length,
    income, expense, prev_income, prev_expense,
    income_change: income - prev_income, expense_change: expense - prev_expense,
    top_categories, essential, flexible,
    days_without_entries: days.filter(([, d]) => !d.any).length,
    daily_flex_cap: cap,
    days_under_cap,
    no_spend_days: days.filter(([, d]) => d.expense === 0).length,
    runway_start, runway_end,
    runway_change: runway_start != null && runway_end != null ? round1(runway_end - runway_start) : null,
  };
}

// ---------- Experiments ----------

export type Experiment =
  | { type: "category_cap"; category_id: string; category_name: string; target_amount: number }
  | { type: "flex_days_under_cap"; min_days: number }
  | { type: "no_spend_days"; min_days: number };

export type ExperimentOptions = {
  category_cap: { category_id: string; name: string; this_week: number; min_target: number; max_target: number }[];
  flex_days_under_cap: { min_days: 4; max_days: 6; daily_cap: number } | null;
  no_spend_days: { min_days: 1; max_days: 3 };
};

export function experimentOptions(m: WeekMetrics): ExperimentOptions {
  return {
    category_cap: m.top_categories
      .filter((c) => c.category_id !== "none" && c.amount > 0)
      .map((c) => ({ category_id: c.category_id, name: c.name, this_week: c.amount, min_target: Math.ceil(c.amount * 0.7), max_target: Math.floor(c.amount * 0.9) }))
      .filter((c) => c.min_target <= c.max_target),
    flex_days_under_cap: m.daily_flex_cap != null ? { min_days: 4, max_days: 6, daily_cap: m.daily_flex_cap } : null,
    no_spend_days: { min_days: 1, max_days: 3 },
  };
}

/** Accepts only the three allowed types with parameters inside the code-computed ranges. */
export function validateExperiment(raw: unknown, opt: ExperimentOptions): Experiment | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : NaN);
  if (e["type"] === "category_cap") {
    const c = opt.category_cap.find((x) => x.category_id === e["category_id"]);
    const t = int(e["target_amount"]);
    if (!c || !(t >= c.min_target && t <= c.max_target)) return null;
    return { type: "category_cap", category_id: c.category_id, category_name: c.name, target_amount: t };
  }
  if (e["type"] === "flex_days_under_cap") {
    const d = int(e["min_days"]);
    if (!opt.flex_days_under_cap || !(d >= 4 && d <= 6)) return null;
    return { type: "flex_days_under_cap", min_days: d };
  }
  if (e["type"] === "no_spend_days") {
    const d = int(e["min_days"]);
    if (!(d >= 1 && d <= 3)) return null;
    return { type: "no_spend_days", min_days: d };
  }
  return null;
}

export function describeExperiment(e: Experiment): string {
  if (e.type === "category_cap") return `هزینه‌ی «${e.category_name}» در این هفته حداکثر ${formatToman(e.target_amount)} باشد.`;
  if (e.type === "flex_days_under_cap") return `دست‌کم ${toFa(e.min_days)} روز از ۷ روز، هزینه‌ی غیرضروری زیر سقف روزانه بماند.`;
  return `دست‌کم ${toFa(e.min_days)} روز در این هفته بدون هیچ هزینه‌ای بگذرد.`;
}

export type ExperimentResult = { achieved: boolean; actual: number | null; target: number; text: string };

/** Result of last week's experiment measured on this week's data; neutral wording, written by code. */
export function experimentResult(e: Experiment, m: WeekMetrics): ExperimentResult {
  if (e.type === "category_cap") {
    const actual = m.top_categories.find((c) => c.category_id === e.category_id)?.amount ?? 0;
    const ok = actual <= e.target_amount;
    return { achieved: ok, actual, target: e.target_amount,
      text: `هدف: «${e.category_name}» حداکثر ${formatToman(e.target_amount)}. واقعی: ${formatToman(actual)}. ${ok ? "برآورده شد." : "این بار برآورده نشد."}` };
  }
  if (e.type === "flex_days_under_cap") {
    const actual = m.days_under_cap;
    const ok = actual != null && actual >= e.min_days;
    return { achieved: ok, actual, target: e.min_days,
      text: actual == null ? "برنامه‌ی مالی ماه کامل نیست، پس سقف روزانه قابل محاسبه نبود."
        : `هدف: ${toFa(e.min_days)} روز زیر سقف. واقعی: ${toFa(actual)} روز. ${ok ? "برآورده شد." : "این بار برآورده نشد."}` };
  }
  const actual = m.no_spend_days;
  const ok = actual >= e.min_days;
  return { achieved: ok, actual, target: e.min_days,
    text: `هدف: ${toFa(e.min_days)} روز بدون هزینه. واقعی: ${toFa(actual)} روز. ${ok ? "برآورده شد." : "این بار برآورده نشد."}` };
}

// ---------- Number guard for AI text ----------

const FA = "۰۱۲۳۴۵۶۷۸۹", AR = "٠١٢٣٤٥٦٧٨٩";
/** All numbers written in a text (Persian/Arabic/Latin digits, ٬ , separators, ٫ . decimals). */
export function numbersIn(text: string): number[] {
  const en = text.replace(/[۰-۹]/g, (d) => String(FA.indexOf(d))).replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)));
  return (en.match(/\d[\d٬,]*(?:[٫.]\d+)?/g) ?? []).map((s) => Number(s.replace(/[٬,]/g, "").replace("٫", ".")));
}

/** Every number reachable from `source`, plus common spoken forms (thousands/millions, percents). */
export function allowedNumbers(source: unknown, extra: number[] = []): Set<number> {
  const out = new Set<number>(extra);
  const add = (n: number) => {
    const a = Math.abs(n);
    for (const v of [a, Math.round(a), round1(a), Math.round(a * 100), round1(a * 100), round1(a / 1000), Math.round(a / 1000), round1(a / 1e6), Math.round(a / 1e6)]) out.add(v);
  };
  const walk = (v: unknown) => {
    if (typeof v === "number") add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(source);
  return out;
}

export function usesOnlyAllowed(text: string, allowed: Set<number>): boolean {
  return numbersIn(text).every((n) => allowed.has(n));
}

export { jalaliMonth };
