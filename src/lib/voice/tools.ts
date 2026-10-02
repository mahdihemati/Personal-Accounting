import { Type, type FunctionDeclaration } from "@google/genai";
import { addDays, addMonths, endOfMonth, startOfDay, startOfMonth } from "date-fns-jalali";
import { supabase } from "@/integrations/supabase/client";
import type { Account, Category, Kind } from "@/lib/data";

const PERIOD = { type: Type.STRING, enum: ["this_month", "last_month", "last_7_days"] };

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "propose_transaction",
    description: "پیشنهاد ثبت یک تراکنش؛ به کاربر کارت تأیید نشان داده می‌شود و تا تأیید او ذخیره نمی‌شود.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        amount_toman: { type: Type.INTEGER, description: "مبلغ به تومان" },
        kind: { type: Type.STRING, enum: ["income", "expense"] },
        category_name: { type: Type.STRING },
        account_name: { type: Type.STRING },
        occurred_at: { type: Type.STRING, description: "ISO 8601" },
        note: { type: Type.STRING },
      },
      required: ["amount_toman", "kind", "category_name"],
    },
  },
  {
    name: "resolve_pending_transaction",
    description: "وقتی کاربر کارت تأیید را با صدا تأیید یا رد کرد.",
    parameters: {
      type: Type.OBJECT,
      properties: { decision: { type: Type.STRING, enum: ["confirm", "cancel"] } },
      required: ["decision"],
    },
  },
  {
    name: "get_period_summary",
    description: "جمع درآمد، هزینه و مانده در یک دوره.",
    parameters: { type: Type.OBJECT, properties: { period: PERIOD }, required: ["period"] },
  },
  {
    name: "get_category_spending",
    description: "جمع هزینه‌ی یک دسته در یک دوره.",
    parameters: {
      type: Type.OBJECT,
      properties: { category_name: { type: Type.STRING }, period: PERIOD },
      required: ["category_name", "period"],
    },
  },
  {
    name: "get_budget_status",
    description: "مصرف و باقی‌مانده‌ی بودجه‌ی ماه جاری (یک دسته یا همه).",
    parameters: { type: Type.OBJECT, properties: { category_name: { type: Type.STRING } } },
  },
];

export type ToolArgs = { period?: string; category_name?: string; kind?: string; account_name?: string; occurred_at?: string; amount_toman?: number; note?: string; decision?: string };

type Period = "this_month" | "last_month" | "last_7_days";

function periodRange(p: Period, now = new Date()) {
  if (p === "last_month") { const m = addMonths(now, -1); return { start: startOfMonth(m), end: endOfMonth(m) }; }
  if (p === "last_7_days") return { start: startOfDay(addDays(now, -6)), end: now };
  return { start: startOfMonth(now), end: endOfMonth(now) };
}

const norm = (s: string) => s.replace(/[\u200c\s]+/g, "").replace(/ي/g, "ی").replace(/ك/g, "ک").toLowerCase();

/** Best-effort match: exact → contains → character overlap. */
export function closest<T extends { name: string }>(items: T[], name: string | undefined): T | undefined {
  if (!items.length) return undefined;
  if (!name) return undefined;
  const n = norm(name);
  const exact = items.find((i) => norm(i.name) === n);
  if (exact) return exact;
  const contains = items.find((i) => norm(i.name).includes(n) || n.includes(norm(i.name)));
  if (contains) return contains;
  let best = items[0], score = -1;
  for (const i of items) {
    const a = new Set(norm(i.name));
    const s = [...new Set(n)].filter((c) => a.has(c)).length / Math.max(a.size, 1);
    if (s > score) { score = s; best = i; }
  }
  return best;
}

async function txs(start: Date, end: Date) {
  const { data, error } = await supabase.from("transactions").select("amount,kind,category_id")
    .gte("occurred_at", start.toISOString()).lte("occurred_at", end.toISOString());
  if (error) throw new Error(error.message);
  return (data ?? []) as { amount: number; kind: Kind | "transfer"; category_id: string | null }[];
}

export async function runReadTool(name: string, args: ToolArgs, categories: Category[]) {
  if (name === "get_period_summary") {
    const { start, end } = periodRange(args.period as Period);
    const rows = await txs(start, end);
    const income = rows.filter((r) => r.kind === "income").reduce((s, r) => s + Number(r.amount), 0);
    const expense = rows.filter((r) => r.kind === "expense").reduce((s, r) => s + Number(r.amount), 0);
    return { period: args.period, income_toman: income, expense_toman: expense, balance_toman: income - expense };
  }
  if (name === "get_category_spending") {
    const cat = closest(categories.filter((c) => c.kind === "expense"), args.category_name as string);
    if (!cat) return { error: "دسته پیدا نشد" };
    const { start, end } = periodRange(args.period as Period);
    const rows = await txs(start, end);
    const total = rows.filter((r) => r.kind === "expense" && r.category_id === cat.id).reduce((s, r) => s + Number(r.amount), 0);
    return { category: cat.name, period: args.period, expense_toman: total };
  }
  if (name === "get_budget_status") {
    const { start, end } = periodRange("this_month");
    const { data: budgets, error } = await supabase.from("budgets").select("category_id,limit_amount")
      .gte("month", start.toISOString().slice(0, 10)).lte("month", end.toISOString().slice(0, 10));
    if (error) throw new Error(error.message);
    const rows = await txs(start, end);
    let list = (budgets ?? []) as { category_id: string; limit_amount: number }[];
    if (args.category_name) {
      const cat = closest(categories, args.category_name as string);
      list = list.filter((b) => b.category_id === cat?.id);
    }
    if (!list.length) return { budgets: [], message: "بودجه‌ای برای ماه جاری تعریف نشده" };
    return {
      budgets: list.map((b) => {
        const spent = rows.filter((r) => r.kind === "expense" && r.category_id === b.category_id).reduce((s, r) => s + Number(r.amount), 0);
        return {
          category: categories.find((c) => c.id === b.category_id)?.name ?? "",
          limit_toman: Number(b.limit_amount), spent_toman: spent, remaining_toman: Number(b.limit_amount) - spent,
        };
      }),
    };
  }
  return { error: "ابزار ناشناخته" };
}

export type PendingTx = {
  amount: number;
  kind: Kind;
  categoryId: string;
  accountId: string;
  occurredAt: Date;
  note: string;
  rawTranscript: string;
};

export function buildPending(args: ToolArgs, categories: Category[], accounts: Account[], transcript: string): PendingTx {
  const kind = (args.kind === "income" ? "income" : "expense") as Kind;
  const cats = categories.filter((c) => c.kind === kind);
  const cat = closest(cats, args.category_name as string) ?? cats[0];
  const acc = closest(accounts, args.account_name as string) ?? accounts[0];
  const d = args.occurred_at ? new Date(String(args.occurred_at)) : new Date();
  return {
    amount: Math.max(0, Math.round(Number(args.amount_toman) || 0)),
    kind,
    categoryId: cat?.id ?? "",
    accountId: acc?.id ?? "",
    occurredAt: isNaN(d.getTime()) ? new Date() : d,
    note: typeof args.note === "string" ? args.note : "",
    rawTranscript: transcript,
  };
}
