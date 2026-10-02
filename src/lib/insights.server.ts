import type { SupabaseClient } from "@supabase/supabase-js";
import { addMonths, endOfMonth, startOfMonth } from "date-fns-jalali";
import { GEMINI_MODEL } from "./ai-config";
import type { CategoryStat, FinanceStats, Insight, RangeKey } from "./insights.types";

export const MIN_TRANSACTIONS = 5;

export function resolveRange(key: RangeKey, now = new Date()) {
  if (key === "last_month") {
    const m = addMonths(now, -1);
    return { start: startOfMonth(m), end: endOfMonth(m) };
  }
  if (key === "last_3_months") return { start: startOfMonth(addMonths(now, -2)), end: endOfMonth(now) };
  return { start: startOfMonth(now), end: endOfMonth(now) };
}

type Tx = { amount: number; kind: string; category_id: string | null; occurred_at: string; note: string | null };
type Cat = { id: string; name: string; color: string | null };

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
const changePct = (cur: number, prev: number) => (prev ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);

export async function computeStats(db: SupabaseClient, key: RangeKey): Promise<FinanceStats> {
  const { start, end } = resolveRange(key);
  const lengthMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - lengthMs);

  const [txRes, prevRes, catRes, budRes] = await Promise.all([
    db.from("transactions").select("amount,kind,category_id,occurred_at,note")
      .gte("occurred_at", start.toISOString()).lte("occurred_at", end.toISOString()).neq("kind", "transfer"),
    db.from("transactions").select("amount,kind,category_id")
      .gte("occurred_at", prevStart.toISOString()).lte("occurred_at", prevEnd.toISOString()).neq("kind", "transfer"),
    db.from("categories").select("id,name,color"),
    db.from("budgets").select("category_id,month,limit_amount")
      .gte("month", start.toISOString().slice(0, 10)).lte("month", end.toISOString().slice(0, 10)),
  ]);
  for (const r of [txRes, prevRes, catRes, budRes]) if (r.error) throw new Error(r.error.message);

  const txs = (txRes.data ?? []) as Tx[];
  const prev = (prevRes.data ?? []) as Tx[];
  const cats = new Map(((catRes.data ?? []) as Cat[]).map((c) => [c.id, c]));
  const catName = (id: string | null) => (id && cats.get(id)?.name) || "بدون دسته";

  const sum = (list: Tx[], kind: string) => list.filter((t) => t.kind === kind).reduce((s, t) => s + Number(t.amount), 0);
  const byCat = (list: Tx[]) => {
    const m = new Map<string, number>();
    for (const t of list) if (t.kind === "expense") m.set(t.category_id ?? "none", (m.get(t.category_id ?? "none") ?? 0) + Number(t.amount));
    return m;
  };

  const income = sum(txs, "income");
  const expense = sum(txs, "expense");
  const prevIncome = sum(prev, "income");
  const prevExpense = sum(prev, "expense");
  const curCats = byCat(txs);
  const prevCats = byCat(prev);

  const byCategory: CategoryStat[] = [...curCats.entries()]
    .map(([id, amount]) => ({ name: catName(id === "none" ? null : id), color: cats.get(id)?.color ?? "#64748b", amount, percent: pct(amount, expense) }))
    .sort((a, b) => b.amount - a.amount);

  const ids = new Set([...curCats.keys(), ...prevCats.keys()]);
  const categoryChanges = [...ids]
    .map((id) => {
      const current = curCats.get(id) ?? 0;
      const previous = prevCats.get(id) ?? 0;
      return { name: catName(id === "none" ? null : id), current, previous, change: current - previous, changePercent: changePct(current, previous) };
    })
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  const budgets = ((budRes.data ?? []) as { category_id: string; limit_amount: number }[]).map((b) => {
    const spent = curCats.get(b.category_id) ?? 0;
    const limit = Number(b.limit_amount);
    return { category: catName(b.category_id), limit, spent, remaining: limit - spent, percent: pct(spent, limit) };
  });

  const topExpenses = txs
    .filter((t) => t.kind === "expense")
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .slice(0, 10)
    .map((t) => ({ amount: Number(t.amount), category: catName(t.category_id), note: t.note, date: t.occurred_at.slice(0, 10) }));

  const effectiveEnd = Math.min(end.getTime(), Date.now());
  const days = Math.max(1, Math.ceil((effectiveEnd - start.getTime()) / 86400000));

  return {
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    days,
    transactionCount: txs.length,
    income,
    expense,
    net: income - expense,
    byCategory,
    previous: { income: prevIncome, expense: prevExpense, expenseChange: expense - prevExpense, expenseChangePercent: changePct(expense, prevExpense) },
    categoryChanges,
    budgets,
    topExpenses,
    dailyAverageExpense: Math.round(expense / days),
  };
}

const SYSTEM_PROMPT = `تو دستیار مالی یک اپ حسابداری شخصی فارسی هستی.
- به فارسی ساده و محترمانه بنویس. قضاوت و سرزنش نکن.
- فقط از اعدادی که در داده‌ی ورودی آمده استفاده کن و هیچ عددی از خودت نساز یا تخمین نزن.
- اگر داده کم است (کمتر از ۵ تراکنش) صریح بگو داده برای تحلیل کافی نیست.
- مبلغ‌ها را به تومان و با ارقام فارسی و جداکننده‌ی هزارگان فارسی بنویس (مثل ۱٬۲۵۰٬۰۰۰ تومان).
- همه‌ی مبالغ داده‌ی ورودی به تومان هستند. درصدها از قبل محاسبه شده‌اند.`;

const INSIGHT_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING", description: "خلاصه‌ی ۲ تا ۳ جمله‌ای" },
    highlights: { type: "ARRAY", items: { type: "STRING" }, description: "۲ تا ۴ نکته‌ی مهم" },
    warnings: { type: "ARRAY", items: { type: "STRING" }, description: "هشدارها؛ می‌تواند خالی باشد" },
    suggestions: { type: "ARRAY", items: { type: "STRING" }, description: "۲ تا ۳ پیشنهاد عملی و کوچک" },
  },
  required: ["summary", "highlights", "warnings", "suggestions"],
};

const ANSWER_SCHEMA = {
  type: "OBJECT",
  properties: { answer: { type: "STRING" } },
  required: ["answer"],
};

export class AiError extends Error {}

async function callGemini(userText: string, schema: object): Promise<unknown> {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) throw new AiError("کلید هوش مصنوعی هنوز تنظیم نشده است.");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.4 },
      }),
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new AiError("پاسخ هوش مصنوعی بیش از حد طول کشید. کمی بعد دوباره تلاش کنید.");
    throw new AiError("ارتباط با سرویس هوش مصنوعی برقرار نشد.");
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) throw new AiError("تعداد درخواست‌ها زیاد شده است. چند دقیقه بعد دوباره تلاش کنید.");
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    console.error("Gemini auth/request error", res.status, await res.text());
    throw new AiError("کلید یا تنظیمات هوش مصنوعی معتبر نیست.");
  }
  if (!res.ok) {
    console.error("Gemini error", res.status, await res.text());
    throw new AiError("سرویس هوش مصنوعی موقتاً در دسترس نیست. کمی بعد دوباره تلاش کنید.");
  }
  const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  try {
    return JSON.parse(text);
  } catch {
    throw new AiError("پاسخ هوش مصنوعی قابل خواندن نبود. دوباره تلاش کنید.");
  }
}

const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : []);

export async function generateInsight(stats: FinanceStats, rangeLabel: string): Promise<Insight> {
  const out = (await callGemini(
    `بازه: ${rangeLabel}\nخلاصه‌ی محاسبه‌شده‌ی داده‌های مالی کاربر (JSON):\n${JSON.stringify(stats)}\n\nبر اساس فقط همین اعداد، تحلیل را تولید کن.`,
    INSIGHT_SCHEMA,
  )) as Record<string, unknown>;
  if (typeof out?.["summary"] !== "string") throw new AiError("پاسخ هوش مصنوعی قابل خواندن نبود. دوباره تلاش کنید.");
  return {
    summary: out["summary"] as string,
    highlights: strArr(out["highlights"]).slice(0, 4),
    warnings: strArr(out["warnings"]),
    suggestions: strArr(out["suggestions"]).slice(0, 3),
  };
}

export async function answerQuestion(stats: FinanceStats, rangeLabel: string, question: string): Promise<string> {
  const out = (await callGemini(
    `بازه: ${rangeLabel}\nخلاصه‌ی محاسبه‌شده‌ی داده‌های مالی کاربر (JSON):\n${JSON.stringify(stats)}\n\nسؤال کاربر: «${question}»\n\nفقط بر اساس همین اعداد کوتاه و روشن پاسخ بده. اگر پاسخ در این داده‌ها نیست، صریح بگو که این اطلاعات در داده‌ها موجود نیست.`,
    ANSWER_SCHEMA,
  )) as Record<string, unknown>;
  if (typeof out?.["answer"] !== "string") throw new AiError("پاسخ هوش مصنوعی قابل خواندن نبود. دوباره تلاش کنید.");
  return out["answer"] as string;
}
