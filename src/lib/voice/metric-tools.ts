/** Phase 6 voice tools: questions, simulator, purchase check and decisions. All numbers come from runMetrics. */
import { runMetrics } from "../finance-metrics";
import { alertMessage } from "../metrics/anomalies";
import { isPeriod, type PeriodKey } from "../metrics/periods";
import type { ScenarioItem } from "../metrics/simulate";
import type { MCategory } from "../metrics/types";
import { loadMetricsData, recordDecision } from "../metrics-data";
import { withSpoken } from "../metrics/spoken-amount";
import { formatToman, toFa } from "../format";
import { closest } from "./tools";

import { METRIC_TOOL_DECLARATIONS } from "./declarations";
export { METRIC_TOOL_DECLARATIONS };

export const METRIC_TOOL_NAMES = new Set(METRIC_TOOL_DECLARATIONS.map((d) => d.name!));

type A = Partial<Record<"period"|"period_a"|"period_b"|"limit"|"category_name"|"min_amount_toman"|"text"|"status"|"today"|"flexToday"|"low"|"high"|"items"|"amount_toman"|"percent"|"type"|"month_offset"|"months"|"inflation_annual_percent"|"series"|"choice"|"title"|"reason", unknown>>;
const opt = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as { [K in keyof T]?: Exclude<T[K], undefined> };
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
const period = (v: unknown, fallback: PeriodKey = "this_month"): PeriodKey => (isPeriod(v) ? v : fallback);
const catId = (cats: MCategory[], name: unknown) => (typeof name === "string" && name ? closest(cats.filter((c) => c.kind === "expense"), name)?.id : undefined);

export async function runMetricTool(name: string, raw: Record<string, unknown>): Promise<Record<string, unknown>> {
  const args = raw as A;
  const d = await loadMetricsData();
  const cats = d.categories;
  switch (name) {
    case "get_top_expenses":
      return runMetrics({ mode: "top_expenses", params: { period: period(args.period), ...opt({ limit: num(args.limit), category_id: catId(cats, args.category_name) }) } }, d) as A;
    case "compare_periods":
      return runMetrics({ mode: "compare_periods", params: { period_a: period(args.period_a), period_b: period(args.period_b, "last_month") } }, d) as A;
    case "explain_change":
      return runMetrics({ mode: "explain_change", params: { period: period(args.period) } }, d) as A;
    case "search_transactions":
      return runMetrics({ mode: "search_transactions", params: opt({
        period: isPeriod(args.period) ? args.period : undefined, category_id: catId(cats, args.category_name),
        min_amount: num(args.min_amount_toman), text: typeof args.text === "string" ? args.text : undefined, limit: num(args.limit),
      }) }, d) as A;
    case "get_daily_budget": {
      const r = runMetrics({ mode: "daily_budget" }, d) as A;
      return withSpoken(r.status === "ok" ? { status: "ok", today_toman: r.today, spent_today_toman: r.flexToday } : { status: r.status });
    }
    case "get_month_forecast": {
      const r = runMetrics({ mode: "forecast" }, d) as A;
      return withSpoken(r.status === "ok" ? { status: "ok", low_toman: r.low, high_toman: r.high, note: "تخمین است، نه تضمین" } : { status: r.status });
    }
    case "simulate_scenario": {
      const items = (Array.isArray(args.items) ? args.items : []).slice(0, 3).map((x: unknown): ScenarioItem | null => {
        const it = (x ?? {}) as A;
        const amount = num(it.amount_toman) ?? 0;
        if (it.type === "reduce_category") {
          const id = catId(cats, it.category_name); if (!id) return null;
          const pct = num(it.percent);
          return pct != null ? { type: "reduce_category", category_id: id, mode: "percent", value: pct } : { type: "reduce_category", category_id: id, mode: "amount", value: amount };
        }
        if (it.type === "increase_saving") return { type: "increase_saving", amount_per_month: amount };
        if (it.type === "one_time_expense") return { type: "one_time_expense", amount, month_offset: num(it.month_offset) ?? 0 };
        if (it.type === "income_change") return { type: "income_change", amount_per_month: amount };
        return null;
      }).filter((x): x is ScenarioItem => !!x);
      const m = num(args.months);
      const months = m === 3 || m === 12 ? m : 6;
      const r = runMetrics({ mode: "simulate", params: { items, months, inflation_annual_percent: num(args.inflation_annual_percent) ?? null } }, d) as A;
      delete r.series;
      return r;
    }
    case "check_purchase":
      return runMetrics({ mode: "check_purchase", params: { amount: num(args.amount_toman) ?? 0, category_id: catId(cats, args.category_name) ?? null } }, d) as A;
    case "record_decision": {
      const choice = args.choice === "bought" || args.choice === "postponed" || args.choice === "skipped" ? args.choice : null;
      const amount = num(args.amount_toman);
      if (!choice || !amount || amount <= 0 || typeof args.title !== "string" || !args.title.trim()) return { status: "failed", message: "عنوان، مبلغ یا تصمیم نامعتبر است" };
      const row = await recordDecision({
        title: args.title.trim().slice(0, 120), amount_toman: Math.round(amount), category_id: catId(cats, args.category_name) ?? null,
        choice, reason: typeof args.reason === "string" && args.reason.trim() ? args.reason.trim().slice(0, 200) : null,
      });
      return { status: "ok", decision_id: row.id, review_at: row.review_at };
    }
    case "get_alerts": {
      const fresh = d.alerts.filter((a) => a.status === "new").slice(0, 3);
      return { count: fresh.length, alerts: fresh.map((a) => ({ kind: a.kind, message: alertMessage(a, formatToman, toFa) })) };
    }
    case "get_assets_summary": {
      const r = runMetrics({ mode: "assets_summary" }, d) as Record<string, unknown>;
      const items = (r["items"] as Record<string, unknown>[]).map(({ id: _id, ...rest }) => rest);
      return { ...r, items };
    }
  }
  return { error: "ابزار ناشناخته" };
}
