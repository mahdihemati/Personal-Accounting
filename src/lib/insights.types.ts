export type RangeKey = "this_month" | "last_month" | "last_3_months";

export const RANGE_LABEL: Record<RangeKey, string> = {
  this_month: "ماه جاری",
  last_month: "ماه قبل",
  last_3_months: "۳ ماه اخیر",
};

export type CategoryStat = { name: string; color: string; amount: number; percent: number };
export type CategoryChange = { name: string; current: number; previous: number; change: number; changePercent: number | null };

export type FinanceStats = {
  periodStart: string;
  periodEnd: string;
  days: number;
  transactionCount: number;
  income: number;
  expense: number;
  net: number;
  byCategory: CategoryStat[];
  previous: { income: number; expense: number; expenseChange: number; expenseChangePercent: number | null };
  categoryChanges: CategoryChange[];
  budgets: { category: string; limit: number; spent: number; remaining: number; percent: number }[];
  topExpenses: { amount: number; category: string; note: string | null; date: string }[];
  dailyAverageExpense: number;
};

export type Insight = { summary: string; highlights: string[]; warnings: string[]; suggestions: string[] };

export type AnalyzeResult =
  | { status: "ok"; stats: FinanceStats; insight: Insight; cached: boolean; createdAt: string }
  | { status: "insufficient"; stats: FinanceStats }
  | { status: "error"; message: string; stats?: FinanceStats };

export type AskResult = { status: "ok"; answer: string } | { status: "insufficient" } | { status: "error"; message: string };
