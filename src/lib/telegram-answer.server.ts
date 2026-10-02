/** Server-only: read-only answers to the Telegram user's questions. Gemini picks tools; all numbers are computed in code. */
import { format as gFormat } from "date-fns";
import type { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { GEMINI_MODEL } from "./ai-config";
import { runMetrics } from "./finance-metrics";
import { formatToman, jDate, toFa } from "./format";
import { alertMessage } from "./metrics/anomalies";
import { inRange, isPeriod, PERIOD_LABEL, periodRange, type PeriodKey } from "./metrics/periods";
import type { AlertRow, DecisionRow, MetricsData } from "./metrics/types";
import type { AssetRow, IntegrationRow, PriceRow } from "./metrics/assets";
import { jalaliMonth } from "./budget-math";
import { matchName } from "./telegram-parse.server";

type Admin = ReturnType<typeof getSupabaseAdmin>;
type Tx = { id: string; amount: number; kind: string; occurred_at: string; category_id: string | null; account_id: string; to_account_id: string | null; note: string | null };

const PERIOD_ENUM = ["today", "yesterday", "this_week", "last_week", "this_month", "last_month", "last_7_days", "last_30_days", "last_3_months"];
const P = { type: "STRING", enum: PERIOD_ENUM };

const TOOLS = [
  { name: "get_account_balances", description: "موجودی فعلی هر حساب و جمع کل موجودی نقد.", parameters: { type: "OBJECT", properties: {} } },
  { name: "get_period_totals", description: "جمع درآمد، هزینه و خالص یک دوره، به‌همراه تفکیک هزینه بر اساس دسته.", parameters: { type: "OBJECT", properties: { period: P }, required: ["period"] } },
  { name: "get_top_expenses", description: "بزرگ‌ترین هزینه‌های یک دوره (اختیاری: فقط یک دسته).", parameters: { type: "OBJECT", properties: { period: P, limit: { type: "INTEGER" }, category_name: { type: "STRING" } }, required: ["period"] } },
  { name: "compare_periods", description: "مقایسه‌ی هزینه‌ی دو دوره.", parameters: { type: "OBJECT", properties: { period_a: P, period_b: P }, required: ["period_a", "period_b"] } },
  { name: "explain_change", description: "توضیح اینکه چرا هزینه‌ی یک دوره نسبت به دوره‌ی قبلش تغییر کرده.", parameters: { type: "OBJECT", properties: { period: P }, required: ["period"] } },
  { name: "search_transactions", description: "جست‌وجوی تراکنش‌ها با متن یادداشت، دسته، حداقل مبلغ یا دوره.", parameters: { type: "OBJECT", properties: { period: P, category_name: { type: "STRING" }, min_amount_toman: { type: "INTEGER" }, text: { type: "STRING" }, limit: { type: "INTEGER" } } } },
  { name: "get_recent_transactions", description: "آخرین تراکنش‌های ثبت‌شده (هزینه، درآمد و انتقال).", parameters: { type: "OBJECT", properties: { limit: { type: "INTEGER" } } } },
  { name: "get_budgets", description: "بودجه‌های ماه جاری هر دسته، مقدار خرج‌شده و مانده.", parameters: { type: "OBJECT", properties: {} } },
  { name: "get_daily_budget", description: "سقف خرج امروز و مقدار خرج‌شده‌ی امروز.", parameters: { type: "OBJECT", properties: {} } },
  { name: "get_month_forecast", description: "پیش‌بینی بازه‌ی هزینه تا پایان ماه (تخمین).", parameters: { type: "OBJECT", properties: {} } },
  { name: "get_alerts", description: "هشدارهای تازه‌ی هزینه‌ی غیرمعمول.", parameters: { type: "OBJECT", properties: {} } },
  { name: "get_assets_summary", description: "دارایی‌های غیرنقدی (ارز، سکه، طلا)، ارزش تخمینی و ثروت خالص بدون بدهی.", parameters: { type: "OBJECT", properties: {} } },
];

export const ANSWER_SYSTEM = `# نقش
تو دستیار مالی شخصی کاربر در تلگرام هستی و به سؤال‌هایش درباره‌ی اطلاعات مالی ثبت‌شده‌ی خودش جواب می‌دهی. فارسی، صمیمی، دقیق و حرفه‌ای.

# قوانین قطعی
1. هیچ عددی از خودت نساز. هر عدد فقط از نتیجه‌ی ابزارها؛ اگر ابزار مناسبی نبود یا داده نبود، صریح بگو.
2. فقط خواندنی هستی: چیزی ثبت، ویرایش یا حذف نمی‌کنی. برای ثبت، کاربر کافی است تراکنش را بنویسد یا ویس بفرستد.
3. مشاوره‌ی سرمایه‌گذاری، توصیه‌ی خرید/فروش یا پیش‌بینی قیمت نده. پیش‌بینی‌ها و ثروت خالص را «تخمین» بنام.
4. درباره‌ی دارایی‌ها بگو قیمت‌ها از سرویس نوسان و چند ساعت پیش گرفته شده و بدهی‌ها حساب نشده‌اند.

# انتخاب ابزار
- «چقدر پول دارم / موجودی» ← get_account_balances
- «این ماه چقدر خرج/درآمد داشتم» ← get_period_totals
- «بیشترین خرجم چی بود» ← get_top_expenses
- «نسبت به ماه قبل» ← compare_periods ؛ «چرا بیشتر شد» ← explain_change
- «کِی فلان خرید رو کردم / خرج‌های اسنپ» ← search_transactions ؛ «آخرین تراکنش‌ها» ← get_recent_transactions
- بودجه‌ها ← get_budgets ؛ «امروز چقدر می‌تونم خرج کنم» ← get_daily_budget ؛ «آخر ماه به کجا می‌رسم» ← get_month_forecast
- هشدارها ← get_alerts ؛ طلا/دلار/ثروت ← get_assets_summary
در صورت نیاز چند ابزار را با هم صدا بزن. دوره‌ها شمسی‌اند و هفته از شنبه است. «ماه پیش» = last_month، «سه ماه اخیر» = last_3_months.

# قالب پاسخ تلگرام
- کوتاه و خوانا: یک جمله‌ی جواب اصلی، سپس حداکثر ۶ خط فهرست با «•».
- مبلغ‌ها را همان‌طور که در فیلدهای _text یا متن آماده آمده بنویس (تومان، ارقام فارسی).
- بدون Markdown پیچیده، جدول یا کد.`;

async function loadData(admin: Admin, userId: string) {
  const u = <T,>(q: PromiseLike<{ data: T | null }>) => q.then((r) => r.data);
  const [acc, tx, cat, set, dec, al, ast, pr, integ, bud] = await Promise.all([
    u(admin.from("accounts").select("id,name,initial_balance").eq("user_id", userId)),
    u(admin.from("transactions").select("id,amount,kind,occurred_at,created_at,category_id,account_id,to_account_id,note,necessity_override,exclude_from_baseline").eq("user_id", userId)),
    u(admin.from("categories").select("id,name,kind,necessity,alerts_muted").eq("user_id", userId)),
    u(admin.from("user_settings").select("*").eq("user_id", userId).maybeSingle()),
    u(admin.from("decisions").select("*").eq("user_id", userId)),
    u(admin.from("alerts").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(200)),
    u(admin.from("assets").select("id,symbol,quantity,label,acquired_on,cost_basis_toman").eq("user_id", userId)),
    u(admin.from("price_cache").select("symbol,value_raw,source_timestamp,fetched_at")),
    u(admin.from("user_integrations").select("key_last4,key_status,expires_on,monthly_request_cap,unit_divisor,unit_confirmed").eq("user_id", userId).maybeSingle()),
    u(admin.from("budgets").select("category_id,month,limit_amount").eq("user_id", userId)),
  ]);
  const txs = ((tx ?? []) as (Tx & Record<string, unknown>)[]).map((t) => ({ ...t, amount: Number(t.amount) }));
  const d: MetricsData = {
    accounts: ((acc ?? []) as { id: string; name: string; initial_balance: number }[]).map((a) => ({ ...a, initial_balance: Number(a.initial_balance) })),
    txs: txs as unknown as MetricsData["txs"],
    categories: (cat ?? []) as MetricsData["categories"],
    settings: (set ?? null) as MetricsData["settings"],
    decisions: ((dec ?? []) as DecisionRow[]).map((x) => ({ ...x, amount_toman: Number(x.amount_toman) })),
    alerts: (al ?? []) as AlertRow[],
    assets: ((ast ?? []) as AssetRow[]).map((a) => ({ ...a, quantity: Number(a.quantity), cost_basis_toman: a.cost_basis_toman == null ? null : Number(a.cost_basis_toman) })),
    prices: ((pr ?? []) as PriceRow[]).map((p) => ({ ...p, value_raw: Number(p.value_raw) })),
    integration: (integ ?? null) as IntegrationRow | null,
  };
  return { d, txs, budgets: ((bud ?? []) as { category_id: string; month: string; limit_amount: number }[]) };
}

/** Pure: live balance per account (initial + income − expense ± transfers). */
export function accountBalances(accounts: { id: string; name: string; initial_balance: number }[], txs: Pick<Tx, "amount" | "kind" | "account_id" | "to_account_id">[]) {
  const m = new Map(accounts.map((a) => [a.id, Number(a.initial_balance)]));
  for (const t of txs) {
    const a = Number(t.amount);
    if (t.kind === "income") m.set(t.account_id, (m.get(t.account_id) ?? 0) + a);
    else if (t.kind === "expense") m.set(t.account_id, (m.get(t.account_id) ?? 0) - a);
    else if (t.kind === "transfer") {
      m.set(t.account_id, (m.get(t.account_id) ?? 0) - a);
      if (t.to_account_id) m.set(t.to_account_id, (m.get(t.to_account_id) ?? 0) + a);
    }
  }
  const rows = accounts.map((a) => ({ name: a.name, balance: m.get(a.id) ?? 0 }));
  return { accounts: rows, total: rows.reduce((s, r) => s + r.balance, 0) };
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const per = (v: unknown, f: PeriodKey = "this_month"): PeriodKey => (isPeriod(v) ? v : f);

type Args = Partial<Record<"period" | "period_a" | "period_b" | "limit" | "category_name" | "min_amount_toman" | "text", unknown>>;
async function runTool(name: string, args: Args, ctx: Awaited<ReturnType<typeof loadData>>) {
  const { d, txs, budgets } = ctx;
  const expCats = d.categories.filter((c) => c.kind === "expense");
  const catId = (n: unknown) => (typeof n === "string" && n ? matchName(expCats, n)?.id : undefined);
  const catName = (id: string | null) => d.categories.find((c) => c.id === id)?.name ?? "بدون دسته";
  const accName = (id: string | null) => d.accounts.find((a) => a.id === id)?.name ?? "؟";
  const txView = (t: Tx) => ({
    date: jDate(t.occurred_at), kind: t.kind, amount_text: formatToman(t.amount),
    category: t.kind === "transfer" ? undefined : catName(t.category_id),
    account: t.kind === "transfer" ? `${accName(t.account_id)} ← ${accName(t.to_account_id)}` : accName(t.account_id), note: t.note ?? undefined,
  });
  switch (name) {
    case "get_account_balances": {
      const b = accountBalances(d.accounts, txs);
      return { accounts: b.accounts.map((a) => ({ name: a.name, balance_text: formatToman(a.balance) })), total_text: formatToman(b.total) };
    }
    case "get_period_totals": {
      const p = per(args.period); const r = periodRange(p);
      const inP = txs.filter((t) => inRange(t.occurred_at, r));
      const inc = inP.filter((t) => t.kind === "income").reduce((s, t) => s + t.amount, 0);
      const exp = inP.filter((t) => t.kind === "expense");
      const expSum = exp.reduce((s, t) => s + t.amount, 0);
      const byCat = new Map<string, number>();
      for (const t of exp) byCat.set(catName(t.category_id), (byCat.get(catName(t.category_id)) ?? 0) + t.amount);
      return {
        period: PERIOD_LABEL[p], income_text: formatToman(inc), expense_text: formatToman(expSum), net_text: formatToman(inc - expSum), count: toFa(inP.length),
        by_category: [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, v]) => ({ category: n, amount_text: formatToman(v) })),
      };
    }
    case "get_top_expenses":
      return runMetrics({ mode: "top_expenses", params: { period: per(args.period), ...(num(args.limit) ? { limit: num(args.limit)! } : {}), ...(catId(args.category_name) ? { category_id: catId(args.category_name)! } : {}) } }, d);
    case "compare_periods":
      return runMetrics({ mode: "compare_periods", params: { period_a: per(args.period_a), period_b: per(args.period_b, "last_month") } }, d);
    case "explain_change":
      return runMetrics({ mode: "explain_change", params: { period: per(args.period) } }, d);
    case "search_transactions": {
      const params: { period?: PeriodKey; category_id?: string; min_amount?: number; text?: string; limit?: number } = {};
      if (isPeriod(args.period)) params.period = args.period;
      const c = catId(args.category_name); if (c) params.category_id = c;
      if (num(args.min_amount_toman)) params.min_amount = num(args.min_amount_toman)!;
      if (typeof args.text === "string" && args.text) params.text = args.text;
      if (num(args.limit)) params.limit = num(args.limit)!;
      return runMetrics({ mode: "search_transactions", params }, d);
    }
    case "get_recent_transactions": {
      const n = Math.min(15, Math.max(1, num(args.limit) ?? 8));
      return { items: [...txs].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, n).map(txView) };
    }
    case "get_budgets": {
      const m = jalaliMonth(new Date());
      const month = gFormat(m.start, "yyyy-MM-dd");
      const rows = budgets.filter((b) => b.month === month);
      if (!rows.length) return { status: "no_budgets" };
      return {
        items: rows.map((b) => {
          const spent = txs.filter((t) => t.kind === "expense" && t.category_id === b.category_id && inRange(t.occurred_at, m)).reduce((s, t) => s + t.amount, 0);
          const lim = Number(b.limit_amount);
          return { category: catName(b.category_id), limit_text: formatToman(lim), spent_text: formatToman(spent), remaining_text: formatToman(lim - spent), over: spent > lim };
        }),
      };
    }
    case "get_daily_budget": {
      const r = runMetrics({ mode: "daily_budget" }, d) as Record<string, unknown>;
      return r["status"] === "ok" ? { today_text: formatToman(Number(r["today"])), spent_today_text: formatToman(Number(r["flexToday"])) } : { status: r["status"] };
    }
    case "get_month_forecast": {
      const r = runMetrics({ mode: "forecast" }, d) as Record<string, unknown>;
      return r["status"] === "ok" ? { low_text: formatToman(Number(r["low"])), high_text: formatToman(Number(r["high"])), note: "تخمین است" } : { status: r["status"] };
    }
    case "get_alerts": {
      const fresh = d.alerts.filter((a) => a.status === "new").slice(0, 5);
      return { count: fresh.length, alerts: fresh.map((a) => alertMessage(a, formatToman, toFa)) };
    }
    case "get_assets_summary": {
      const r = runMetrics({ mode: "assets_summary" }, d) as Record<string, unknown>;
      const items = ((r["items"] as Record<string, unknown>[]) ?? []).map(({ id: _id, ...rest }) => rest);
      return { ...r, items };
    }
  }
  return { error: "ابزار ناشناخته" };
}

type Part = { text?: string; functionCall?: { name: string; args?: Record<string, unknown> }; functionResponse?: unknown; thoughtSignature?: string };

/** Answer a question about the user's own data. Read-only. */
export async function answerTelegramQuestion(admin: Admin, userId: string, question: string): Promise<string> {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) throw new Error("کلید هوش مصنوعی روی سرور تنظیم نشده است.");
  const ctx = await loadData(admin, userId);
  const now = new Date();
  const contents: { role: string; parts: Part[] }[] = [{
    role: "user",
    parts: [{ text: `امروز: ${jDate(now, "EEEE d MMMM yyyy")} شمسی. حساب‌ها: ${ctx.d.accounts.map((a) => a.name).join("، ")}. دسته‌های هزینه: ${ctx.d.categories.filter((c) => c.kind === "expense").map((c) => c.name).join("، ")}.\n\nسؤال کاربر: ${question}` }],
  }];
  for (let round = 0; round < 4; round++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: ANSWER_SYSTEM }] }, contents, tools: [{ functionDeclarations: TOOLS }], generationConfig: { temperature: 0.2 } }),
    }).catch(() => null);
    if (!res) throw new Error("ارتباط با سرویس هوش مصنوعی برقرار نشد.");
    if (res.status === 429) throw new Error("درخواست‌ها زیاد شده؛ چند دقیقه بعد دوباره بپرس.");
    if (!res.ok) { console.error("Gemini answer error", res.status, (await res.text()).slice(0, 300)); throw new Error("سرویس هوش مصنوعی موقتاً در دسترس نیست."); }
    const body = (await res.json()) as { candidates?: { content?: { parts?: Part[] } }[] };
    const parts = body.candidates?.[0]?.content?.parts ?? [];
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) return parts.map((p) => p.text ?? "").join("").trim().slice(0, 3500) || "جوابی پیدا نکردم.";
    contents.push({ role: "model", parts });
    const responses: Part[] = [];
    for (const c of calls) {
      let response: unknown;
      try { response = await runTool(c.functionCall!.name, (c.functionCall!.args ?? {}) as Args, ctx); }
      catch (e) { console.error("telegram tool failed", c.functionCall!.name, e); response = { error: "محاسبه ممکن نشد" }; }
      responses.push({ functionResponse: { name: c.functionCall!.name, response: { result: response } } });
    }
    contents.push({ role: "user", parts: responses });
  }
  return "پاسخ کامل آماده نشد؛ سؤال را ساده‌تر بپرس.";
}
