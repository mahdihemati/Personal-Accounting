import { getDate } from "date-fns-jalali";
import { jalaliMonth, tehranDay } from "../budget-math";
import type { AlertKind, AlertRow, FullTx, MCategory, MSettings } from "./types";

/** All alert thresholds in one place. */
export const ALERT_THRESHOLDS = {
  baselineDays: 90,
  minBaselineSamples: 8,
  largeMedianMultiple: 3,
  largePercentile: 0.9,
  largeMinToman: 300_000,
  largeMinIncomeShare: 0.03,
  paceMultiple: 1.5,
  paceMinDiffToman: 500_000,
  paceMinDays: 7,
  paceMinMonths: 2,
  duplicateMinutes: 30,
  maxNewPerDay: 2,
} as const;

const PRIORITY: Record<AlertKind, number> = { possible_duplicate: 0, large_transaction: 1, category_pace: 2 };
const DAY = 86_400_000;

function quantile(sorted: number[], q: number) {
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export type AnomalyInput = { txs: FullTx[]; categories: MCategory[]; settings: MSettings | null; alerts: AlertRow[] };

/** New alerts to create. With transaction_ids → duplicate/large checks for those; without → monthly pace check. */
export function findAnomalies(input: AnomalyInput, params: { transaction_ids?: string[] }, now = new Date()): AlertRow[] {
  const T = ALERT_THRESHOLDS;
  if (input.settings?.alerts_enabled === false) return [];
  const cats = new Map(input.categories.map((c) => [c.id, c]));
  const muted = (id: string | null) => !id || !!cats.get(id)?.alerts_muted;
  const expenses = input.txs.filter((t) => t.kind === "expense");
  const flagged = new Set(input.alerts.filter((a) => a.transaction_id).map((a) => `${a.kind}:${a.transaction_id}`));
  const out: AlertRow[] = [];

  for (const id of params.transaction_ids ?? []) {
    const t = expenses.find((x) => x.id === id);
    if (!t || muted(t.category_id)) continue;
    const name = cats.get(t.category_id!)?.name ?? "";

    const day = tehranDay(t.occurred_at).getTime();
    const dup = expenses.find((o) => o.id !== t.id && o.amount === t.amount && o.account_id === t.account_id && o.category_id === t.category_id
      && tehranDay(o.occurred_at).getTime() === day
      && Math.abs(new Date(o.created_at).getTime() - new Date(t.created_at).getTime()) < T.duplicateMinutes * 60_000);
    if (dup && !flagged.has(`possible_duplicate:${t.id}`) && !flagged.has(`possible_duplicate:${dup.id}`)) {
      out.push({ kind: "possible_duplicate", transaction_id: t.id, category_id: t.category_id, payload: { other_transaction_id: dup.id, category_name: name, amount_toman: t.amount } });
      continue;
    }

    const since = new Date(t.occurred_at).getTime() - T.baselineDays * DAY;
    const base = expenses.filter((o) => o.id !== t.id && o.category_id === t.category_id && !o.exclude_from_baseline
      && new Date(o.occurred_at).getTime() >= since && new Date(o.occurred_at).getTime() <= new Date(t.occurred_at).getTime())
      .map((o) => o.amount).sort((a, b) => a - b);
    if (base.length < T.minBaselineSamples || flagged.has(`large_transaction:${t.id}`)) continue;
    const median = quantile(base, 0.5), p90 = quantile(base, T.largePercentile);
    const income = input.settings?.monthly_income_expected;
    const minAbs = Math.max(T.largeMinToman, income ? income * T.largeMinIncomeShare : 0);
    if (t.amount >= Math.max(T.largeMedianMultiple * median, p90) && t.amount >= minAbs) {
      out.push({ kind: "large_transaction", transaction_id: t.id, category_id: t.category_id,
        payload: { category_name: name, amount_toman: t.amount, median_toman: Math.round(median), ratio: median > 0 ? Math.round((t.amount / median) * 10) / 10 : null } });
    }
  }

  if (!params.transaction_ids) {
    const m = jalaliMonth(now);
    const dayOfMonth = getDate(tehranDay(now));
    const mk = monthKey(m.start);
    const first = expenses.reduce((min, t) => Math.min(min, new Date(t.occurred_at).getTime()), Infinity);
    const covered = [-1, -2, -3].map((o) => jalaliMonth(now, o)).filter((pm) => first <= pm.from.getTime());
    if (dayOfMonth >= T.paceMinDays && covered.length >= T.paceMinMonths) {
      for (const c of input.categories) {
        if (c.kind !== "expense" || c.alerts_muted) continue;
        if (input.alerts.some((a) => a.kind === "category_pace" && a.category_id === c.id && a.payload["month"] === mk)) continue;
        const sumIn = (from: Date, to: Date) => expenses.filter((t) => t.category_id === c.id && new Date(t.occurred_at) >= from && new Date(t.occurred_at) <= to).reduce((s, t) => s + t.amount, 0);
        const avg = covered.reduce((s, pm) => s + sumIn(pm.from, pm.to), 0) / covered.length;
        const spent = sumIn(m.from, now);
        const projected = (spent / dayOfMonth) * m.days;
        if (avg > 0 && projected >= T.paceMultiple * avg && projected - avg >= T.paceMinDiffToman) {
          out.push({ kind: "category_pace", transaction_id: null, category_id: c.id,
            payload: { month: mk, category_name: c.name, spent_toman: spent, projected_toman: Math.round(projected), average_toman: Math.round(avg), ratio: Math.round((projected / avg) * 10) / 10 } });
        }
      }
    }
  }

  const todayStart = tehranDay(now).getTime();
  const createdToday = input.alerts.filter((a) => a.created_at && tehranDay(a.created_at).getTime() === todayStart).length;
  const room = Math.max(0, T.maxNewPerDay - createdToday);
  return out.sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind]).slice(0, room);
}

/** Neutral one-line message for an alert. */
export function alertMessage(a: AlertRow, fmt: (n: number) => string, fa: (n: number) => string): string {
  const p = a.payload as unknown as { amount_toman: number; ratio: number; category_name: string };
  if (a.kind === "possible_duplicate") return `دو هزینه‌ی ${fmt(p.amount_toman)} در «${p.category_name}» با فاصله‌ی کم ثبت شده. تکراری است؟`;
  if (a.kind === "large_transaction") return p.ratio
    ? `این هزینه‌ی «${p.category_name}» حدود ${fa(p.ratio)} برابر معمول تو است. عمدی بود؟`
    : `این هزینه‌ی «${p.category_name}» از معمول بیشتر است. عمدی بود؟`;
  return `با این روند، هزینه‌ی «${p.category_name}» این ماه حدود ${fa(p.ratio)} برابر میانگین ماه‌های قبل می‌شود.`;
}
