/** Jalali / Asia-Tehran periods. Week starts Saturday. */
import { jalaliMonth, tehranDay, tehranDayStartInstant } from "../budget-math";

export const PERIODS = [
  "today", "yesterday", "this_week", "last_week", "this_month", "last_month", "last_7_days", "last_30_days", "last_3_months",
] as const;
export type PeriodKey = (typeof PERIODS)[number];
export type Range = { from: Date; to: Date };

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  today: "امروز", yesterday: "دیروز", this_week: "این هفته", last_week: "هفته‌ی قبل", this_month: "این ماه",
  last_month: "ماه قبل", last_7_days: "۷ روز اخیر", last_30_days: "۳۰ روز اخیر", last_3_months: "۳ ماه اخیر",
};

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayRange = (first: Date, lastInclusive: Date): Range => ({
  from: tehranDayStartInstant(first),
  to: new Date(tehranDayStartInstant(addDays(lastInclusive, 1)).getTime() - 1),
});

export function isPeriod(v: unknown): v is PeriodKey {
  return typeof v === "string" && (PERIODS as readonly string[]).includes(v);
}

export function periodRange(key: PeriodKey, now = new Date()): Range {
  const today = tehranDay(now);
  const satIdx = (today.getDay() + 1) % 7;
  const weekStart = addDays(today, -satIdx);
  switch (key) {
    case "today": return dayRange(today, today);
    case "yesterday": return dayRange(addDays(today, -1), addDays(today, -1));
    case "this_week": return dayRange(weekStart, today);
    case "last_week": return dayRange(addDays(weekStart, -7), addDays(weekStart, -1));
    case "this_month": { const m = jalaliMonth(now); return { from: m.from, to: dayRange(today, today).to }; }
    case "last_month": { const m = jalaliMonth(now, -1); return { from: m.from, to: m.to }; }
    case "last_7_days": return dayRange(addDays(today, -6), today);
    case "last_30_days": return dayRange(addDays(today, -29), today);
    case "last_3_months": { const m = jalaliMonth(now, -2); return { from: m.from, to: dayRange(today, today).to }; }
  }
}

/** The period of the same length that ends right before `r`. */
export function previousRange(r: Range): Range {
  const len = r.to.getTime() - r.from.getTime() + 1;
  return { from: new Date(r.from.getTime() - len), to: new Date(r.from.getTime() - 1) };
}

export const inRange = (iso: string, r: Range) => { const t = new Date(iso).getTime(); return t >= r.from.getTime() && t <= r.to.getTime(); };
