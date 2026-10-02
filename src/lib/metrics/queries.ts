import { inRange, periodRange, previousRange, type PeriodKey, type Range } from "./periods";
import type { FullTx, MCategory } from "./types";

const real = (txs: FullTx[]) => txs.filter((t) => t.kind !== "transfer");
const pctChange = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);
const catName = (cats: MCategory[], id: string | null) => (id ? cats.find((c) => c.id === id)?.name ?? "بدون دسته" : "بدون دسته");

const txOut = (t: FullTx, cats: MCategory[]) => ({
  id: t.id, amount_toman: t.amount, kind: t.kind, category: catName(cats, t.category_id), occurred_at: t.occurred_at, note: t.note,
});

export function topExpenses(txs: FullTx[], cats: MCategory[], p: { period: PeriodKey; limit?: number; category_id?: string }, now = new Date()) {
  const r = periodRange(p.period, now);
  const limit = Math.min(5, Math.max(1, p.limit ?? 5));
  const list = real(txs).filter((t) => t.kind === "expense" && inRange(t.occurred_at, r) && (!p.category_id || t.category_id === p.category_id))
    .sort((a, b) => b.amount - a.amount).slice(0, limit);
  return { period: p.period, items: list.map((t) => txOut(t, cats)) };
}

function totals(txs: FullTx[], r: Range) {
  const byCat = new Map<string, number>();
  let income = 0, expense = 0, count = 0;
  for (const t of real(txs)) {
    if (!inRange(t.occurred_at, r)) continue;
    count++;
    if (t.kind === "income") income += t.amount;
    else { expense += t.amount; const k = t.category_id ?? "none"; byCat.set(k, (byCat.get(k) ?? 0) + t.amount); }
  }
  return { income, expense, byCat, count };
}

export function comparePeriods(txs: FullTx[], cats: MCategory[], p: { period_a: PeriodKey; period_b: PeriodKey }, now = new Date()) {
  const a = totals(txs, periodRange(p.period_a, now)), b = totals(txs, periodRange(p.period_b, now));
  const keys = new Set([...a.byCat.keys(), ...b.byCat.keys()]);
  return {
    period_a: p.period_a, period_b: p.period_b,
    a: { income_toman: a.income, expense_toman: a.expense, count: a.count },
    b: { income_toman: b.income, expense_toman: b.expense, count: b.count },
    expense_change_toman: a.expense - b.expense,
    expense_change_percent: pctChange(a.expense, b.expense),
    categories: [...keys].map((k) => {
      const va = a.byCat.get(k) ?? 0, vb = b.byCat.get(k) ?? 0;
      return { category: catName(cats, k === "none" ? null : k), a_toman: va, b_toman: vb, change_toman: va - vb, change_percent: pctChange(va, vb) };
    }).sort((x, y) => Math.abs(y.change_toman) - Math.abs(x.change_toman)),
  };
}

export function explainChange(txs: FullTx[], cats: MCategory[], p: { period: PeriodKey }, now = new Date()) {
  const r = periodRange(p.period, now), prevR = previousRange(r);
  const cur = totals(txs, r), prev = totals(txs, prevR);
  if (cur.count === 0 && prev.count === 0) return { period: p.period, enough_data: false, increases: [] };
  const increases = [...cur.byCat.entries()]
    .map(([k, v]) => ({ k, v, pv: prev.byCat.get(k) ?? 0 }))
    .filter((x) => x.v > x.pv)
    .sort((x, y) => (y.v - y.pv) - (x.v - x.pv)).slice(0, 3)
    .map((x) => ({
      category: catName(cats, x.k === "none" ? null : x.k),
      current_toman: x.v, previous_toman: x.pv, increase_toman: x.v - x.pv, increase_percent: pctChange(x.v, x.pv),
      largest: real(txs).filter((t) => t.kind === "expense" && (t.category_id ?? "none") === x.k && inRange(t.occurred_at, r))
        .sort((a, b) => b.amount - a.amount).slice(0, 2).map((t) => txOut(t, cats)),
    }));
  return {
    period: p.period, enough_data: true,
    expense_toman: cur.expense, previous_expense_toman: prev.expense,
    expense_change_toman: cur.expense - prev.expense, expense_change_percent: pctChange(cur.expense, prev.expense),
    increases,
  };
}

export function searchTransactions(txs: FullTx[], cats: MCategory[], p: { period?: PeriodKey; category_id?: string; min_amount?: number; text?: string; limit?: number }, now = new Date()) {
  const r = p.period ? periodRange(p.period, now) : null;
  const q = p.text?.trim().toLowerCase();
  const limit = Math.min(5, Math.max(1, p.limit ?? 5));
  const list = real(txs).filter((t) =>
    (!r || inRange(t.occurred_at, r)) &&
    (!p.category_id || t.category_id === p.category_id) &&
    (p.min_amount == null || t.amount >= p.min_amount) &&
    (!q || (t.note ?? "").toLowerCase().includes(q) || catName(cats, t.category_id).toLowerCase().includes(q)),
  ).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  return { total_matches: list.length, items: list.slice(0, limit).map((t) => txOut(t, cats)) };
}
