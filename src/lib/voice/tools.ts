import { Type, type FunctionDeclaration } from "@google/genai";
import { addDays, addMonths, endOfMonth, startOfDay, startOfMonth } from "date-fns-jalali";
import { supabase } from "@/integrations/supabase/client";
import type { Account, Category, Kind } from "@/lib/data";

const PERIOD = { type: Type.STRING, enum: ["this_month", "last_month", "last_7_days"] };

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "propose_transactions",
    description: "پیشنهاد ثبت یک یا چند تراکنش (حداکثر ۸) با یک فراخوانی؛ کارت تأیید دسته‌جمعی نشان داده می‌شود و تا تأیید کاربر چیزی ذخیره نمی‌شود. ثبت تکی هم با آرایه‌ی یک‌عضوی.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        items: {
          type: Type.ARRAY,
          maxItems: "8",
          items: {
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
      },
      required: ["items"],
    },
  },
  {
    name: "resolve_pending_transaction",
    description: "وقتی کاربر درباره‌ی کارت تأیید با صدا تصمیم گرفت: confirm_all (ثبت همه)، cancel_all (لغو همه)، remove_item (حذف یک ردیف با index از صفر).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING, enum: ["confirm_all", "cancel_all", "remove_item"] },
        index: { type: Type.INTEGER, description: "شماره‌ی ردیف از صفر؛ فقط برای remove_item" },
      },
      required: ["action"],
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
  {
    name: "get_financial_vitals",
    description: "علائم حیاتی مالی کاربر: Runway (ماه)، نرخ پس‌انداز، سهم هزینه‌ی ضروری از درآمد، پیشرفت صندوق اضطراری. همه با کد محاسبه شده‌اند.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
];

export type ItemArgs = { category_name?: string; kind?: string; account_name?: string; occurred_at?: string; amount_toman?: number; note?: string };
export type ToolArgs = ItemArgs & { period?: string; items?: ItemArgs[]; action?: string; index?: number };

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
  if (name === "get_financial_vitals") {
    const { computeFinanceMetrics } = await import("../finance-metrics");
    const [acc, tx, set] = await Promise.all([
      supabase.from("accounts").select("initial_balance"),
      supabase.from("transactions").select("amount,kind,occurred_at,category_id,necessity_override"),
      supabase.from("user_settings").select("monthly_income_expected,monthly_essential_expected,emergency_fund_target_months").maybeSingle(),
    ]);
    if (acc.error || tx.error) throw new Error((acc.error ?? tx.error)!.message);
    const m = computeFinanceMetrics({
      accounts: (acc.data ?? []) as { initial_balance: number }[],
      txs: ((tx.data ?? []) as { amount: number; kind: Kind | "transfer"; occurred_at: string; category_id: string | null }[]).map((t) => ({ ...t, amount: Number(t.amount) })),
      categories: categories.map((c) => ({ id: c.id, kind: c.kind, necessity: c.necessity })),
      settings: set.data as never, lessons: [], completedSlugs: [],
    });
    return {
      runway_months: m.runway_months, liquid_balance_toman: m.liquid_balance, essential_monthly_toman: m.essential_monthly,
      savings_rate_percent: m.savings_rate_month == null ? null : Math.round(m.savings_rate_month * 100),
      essential_share_percent: m.essential_share == null ? null : Math.round(m.essential_share * 100),
      emergency_fund_progress_percent: m.emergency_progress == null ? null : Math.round(m.emergency_progress * 100),
      emergency_fund_target_months: m.emergency_fund_target_months,
      note: m.runway_months == null ? "هزینه‌ی ضروری ماهانه هنوز معلوم نیست" : undefined,
    };
  }
  return { error: "ابزار ناشناخته" };
}

export type PendingTx = {
  /** Stable position within the batch (idempotency key with batchId). */
  idx: number;
  amount: number;
  kind: Kind;
  categoryId: string;
  accountId: string;
  occurredAt: Date;
  note: string;
  rawTranscript: string;
};

export function buildPending(args: ItemArgs, idx: number, categories: Category[], accounts: Account[], transcript: string): PendingTx {
  const kind = (args.kind === "income" ? "income" : "expense") as Kind;
  const cats = categories.filter((c) => c.kind === kind);
  const cat = closest(cats, args.category_name as string) ?? cats[0];
  const acc = closest(accounts, args.account_name as string) ?? accounts[0];
  const d = args.occurred_at ? new Date(String(args.occurred_at)) : new Date();
  return {
    idx,
    amount: Math.max(0, Math.round(Number(args.amount_toman) || 0)),
    kind,
    categoryId: cat?.id ?? "",
    accountId: acc?.id ?? "",
    occurredAt: isNaN(d.getTime()) ? new Date() : d,
    note: typeof args.note === "string" ? args.note : "",
    rawTranscript: transcript,
  };
}

export type PendingBatch = { batchId: string; items: PendingTx[] };

/** Amounts above this are saved only by touch, never by voice. */
export const VOICE_CONFIRM_MAX = 5_000_000;

const CONFIRM_RE = /(تأیید|تایید|ثبت\s*کن|ثبتش|ثبت\s*همه|آره|بله|باشه|اوکی|درسته|موافقم|okay|ok|yes)/i;
/** True only if the user's own words (heard after the card appeared) contain a confirmation. */
export function soundsLikeConfirmation(transcript: string): boolean {
  return CONFIRM_RE.test(transcript);
}

export function buildBatch(args: ToolArgs, categories: Category[], accounts: Account[], transcript: string): PendingBatch {
  const items = (Array.isArray(args.items) ? args.items : []).slice(0, 8);
  return {
    batchId: crypto.randomUUID(),
    items: items.map((it, i) => buildPending(it, i, categories, accounts, transcript)),
  };
}
