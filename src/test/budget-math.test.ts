import { describe, expect, it } from "vitest";
import { dailyBudget, jalaliMonth, monthForecast, planSuggestions, tehranDay, type MathTx, type Necessity } from "@/lib/budget-math";

const cats = new Map<string, Necessity>([["rent", "essential"], ["fun", "flexible"]]);
// 1405-07-11 (Mehr) noon Tehran = 2026-10-03 08:30Z
const NOW = new Date("2026-10-03T08:30:00Z");
const at = (iso: string) => iso;

describe("jalali month lengths", () => {
  it("first six months 31, next five 30, esfand 29/30", () => {
    expect(jalaliMonth(new Date("2026-04-10T12:00:00Z")).days).toBe(31); // Farvardin 1405
    expect(jalaliMonth(new Date("2026-10-03T12:00:00Z")).days).toBe(30); // Mehr
    expect([29, 30]).toContain(jalaliMonth(new Date("2027-03-01T12:00:00Z")).days); // Esfand
  });
  it("uses Tehran day boundary", () => {
    // 2026-09-22 21:00Z is already 1 Mehr in Tehran (00:30)
    expect(jalaliMonth(new Date("2026-09-22T21:00:00Z")).start.getTime()).toBe(jalaliMonth(NOW).start.getTime());
    expect(tehranDay("2026-09-22T20:00:00Z").getDate()).toBe(22);
  });
});

describe("daily budget", () => {
  const plan = { monthly_income_expected: 30_000_000, savings_target: 5_000_000, monthly_essential_expected: 15_000_000 };
  const txs: MathTx[] = [
    { amount: 16_000_000, kind: "expense", category_id: "rent", occurred_at: at("2026-09-24T08:00:00Z") },
    { amount: 2_000_000, kind: "expense", category_id: "fun", occurred_at: at("2026-09-28T08:00:00Z") },
    { amount: 300_000, kind: "expense", category_id: "fun", occurred_at: at("2026-10-03T06:00:00Z") },
    { amount: 9_000_000, kind: "transfer", category_id: null, occurred_at: at("2026-09-28T08:00:00Z") },
  ];
  it("follows the spec formula", () => {
    // commitment = max(15M, 16M) = 16M; flex = 30-5-16 = 9M; start-of-today = 9M-2M = 7M; days left = 30-11+1 = 20
    const r = dailyBudget(NOW, txs, cats, plan);
    expect(r).toEqual({ status: "ok", today: 350_000, flexToday: 300_000, daysLeft: 20, flexBudget: 9_000_000 });
  });
  it("override wins over category", () => {
    const r = dailyBudget(NOW, [{ ...txs[1]!, necessity_override: "essential" }], cats, plan);
    expect(r.status === "ok" && r.flexBudget).toBe(10_000_000);
  });
  it("unconfigured / exhausted", () => {
    expect(dailyBudget(NOW, txs, cats, null).status).toBe("unconfigured");
    expect(dailyBudget(NOW, txs, cats, { ...plan, savings_target: 20_000_000 }).status).toBe("exhausted");
  });
});

describe("forecast", () => {
  it("needs 7 days and 5 transactions", () => {
    expect(monthForecast(NOW, [], cats, null).status).toBe("insufficient");
  });
  it("returns an ordered range", () => {
    const txs: MathTx[] = Array.from({ length: 6 }, (_, i) => ({ amount: 100_000 * (i + 1), kind: "expense" as const, category_id: "fun", occurred_at: `2026-09-${24 + i}T08:00:00Z` }));
    const r = monthForecast(NOW, txs, cats, { monthly_income_expected: 10_000_000, savings_target: 0, monthly_essential_expected: 0 });
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.low).toBeLessThanOrEqual(r.high);
  });
});

describe("plan suggestions", () => {
  it("requires one fully covered past month", () => {
    expect(planSuggestions(NOW, [{ amount: 1, kind: "income", category_id: null, occurred_at: "2026-09-01T08:00:00Z" }], cats)).toBeNull();
    const s = planSuggestions(NOW, [
      { amount: 20_000_000, kind: "income", category_id: null, occurred_at: "2026-08-23T08:00:00Z" },
      { amount: 5_000_000, kind: "expense", category_id: "rent", occurred_at: "2026-08-25T08:00:00Z" },
    ], cats);
    expect(s).toMatchObject({ months: 1, monthly_income_expected: 20_000_000, monthly_essential_expected: 5_000_000, savings_target: 15_000_000 });
  });
});
