import { describe, expect, it } from "vitest";
import { findAnomalies } from "@/lib/metrics/anomalies";
import { simulate, type Baseline } from "@/lib/metrics/simulate";
import { periodRange } from "@/lib/metrics/periods";
import type { FullTx } from "@/lib/metrics/types";
import { dueForReview } from "@/components/DecisionReviewCard";

const now = new Date("2026-10-02T09:00:00Z");
const tx = (id: string, amount: number, daysAgo: number, extra: Partial<FullTx> = {}): FullTx => {
  const at = new Date(now.getTime() - daysAgo * 86_400_000).toISOString();
  return { id, amount, kind: "expense", occurred_at: at, created_at: at, category_id: "food", account_id: "a", note: null, ...extra };
};
const cats = [{ id: "food", name: "خوراک", kind: "expense", necessity: null }];

describe("anomalies", () => {
  it("flags a large transaction against a 90-day baseline", () => {
    const base = Array.from({ length: 10 }, (_, i) => tx(`b${i}`, 200_000, i + 2));
    const big = tx("big", 2_000_000, 0);
    const out = findAnomalies({ txs: [...base, big], categories: cats, settings: null, alerts: [] }, { transaction_ids: ["big"] }, now);
    expect(out[0]?.kind).toBe("large_transaction");
  });
  it("needs enough history before flagging", () => {
    const out = findAnomalies({ txs: [tx("b", 200_000, 3), tx("big", 2_000_000, 0)], categories: cats, settings: null, alerts: [] }, { transaction_ids: ["big"] }, now);
    expect(out).toHaveLength(0);
  });
  it("detects possible duplicates and respects disabled alerts", () => {
    const a = tx("a", 150_000, 0), b = { ...tx("b", 150_000, 0), created_at: new Date(now.getTime() + 60_000).toISOString() };
    const input = { txs: [a, b], categories: cats, settings: null, alerts: [] };
    expect(findAnomalies(input, { transaction_ids: ["b"] }, now)[0]?.kind).toBe("possible_duplicate");
    expect(findAnomalies({ ...input, settings: { alerts_enabled: false } as never }, { transaction_ids: ["b"] }, now)).toHaveLength(0);
  });
  it("skips muted categories", () => {
    const a = tx("a", 150_000, 0), b = tx("b", 150_000, 0);
    const out = findAnomalies({ txs: [a, b], categories: [{ ...cats[0]!, alerts_muted: true }], settings: null, alerts: [] }, { transaction_ids: ["b"] }, now);
    expect(out).toHaveLength(0);
  });
});

describe("simulate", () => {
  const base: Baseline = { source: "average", months_used: 3, income: 30_000_000, expense: 25_000_000, net: 5_000_000, by_category: { food: 6_000_000 } };
  it("adds monthly savings from a category cut", () => {
    const r = simulate(base, { items: [{ type: "reduce_category", category_id: "food", mode: "percent", value: 50 }], months: 6 }, { liquid_balance: 0, essential_monthly: null, emergency_target_months: 3 });
    expect(r.status === "ok" && r.difference_end_toman).toBe(18_000_000);
  });
  it("never cuts more than the category spends", () => {
    const r = simulate(base, { items: [{ type: "reduce_category", category_id: "food", mode: "amount", value: 99_000_000 }], months: 3 }, { liquid_balance: 0, essential_monthly: null, emergency_target_months: 3 });
    expect(r.status === "ok" && r.difference_end_toman).toBe(18_000_000);
  });
  it("reports insufficient data", () => {
    expect(simulate(null, { items: [], months: 3 }, { liquid_balance: 0, essential_monthly: null, emergency_target_months: 3 }).status).toBe("insufficient");
  });
});

describe("periods", () => {
  it("week starts on Saturday", () => {
    const r = periodRange("this_week", now); // Friday 2 Oct 2026
    expect(r.from.getTime()).toBeLessThan(now.getTime());
    expect(now.getTime() - r.from.getTime()).toBeGreaterThan(5 * 86_400_000);
  });
});

describe("decision review", () => {
  it("is due only after review date and without rating", () => {
    const d = { id: "1", title: "x", amount_toman: 1, category_id: null, choice: "bought" as const, reason: null, decided_at: "", review_at: "2026-01-01T00:00:00Z", review_rating: null, review_note: null, transaction_id: null };
    expect(dueForReview(d, now.getTime())).toBe(true);
    expect(dueForReview({ ...d, review_rating: "worth" }, now.getTime())).toBe(false);
    expect(dueForReview({ ...d, choice: "skipped" }, now.getTime())).toBe(false);
  });
});
