import type { SupabaseClient } from "@supabase/supabase-js";
import { GEMINI_MODEL } from "./ai-config";
import { computeFinanceMetrics } from "./finance-metrics";
import type { MathTx, Necessity } from "./budget-math";
import {
  allowedNumbers, experimentOptions, experimentResult, MIN_WEEK_TX, reportWeek, usesOnlyAllowed, validateExperiment, weekMetrics,
  type Experiment, type ExperimentOptions,
} from "./weekly-math";
import type { LessonBody, QuizItem, ReportNarrative, WeeklyReportResult } from "./learning.types";

export class LearnAiError extends Error {}

async function geminiJson(system: string, user: string, schema: object): Promise<unknown> {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) throw new LearnAiError("کلید هوش مصنوعی هنوز تنظیم نشده است.");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.4 },
      }),
    });
    if (!res.ok) {
      console.error("Gemini error", res.status, await res.text());
      throw new LearnAiError(res.status === 429 ? "درخواست‌ها زیاد شده؛ چند دقیقه بعد دوباره تلاش کنید." : "سرویس هوش مصنوعی موقتاً در دسترس نیست.");
    }
    const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return JSON.parse(body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "");
  } catch (e) {
    if (e instanceof LearnAiError) throw e;
    throw new LearnAiError((e as Error).name === "AbortError" ? "پاسخ هوش مصنوعی طول کشید؛ دوباره تلاش کنید." : "ساخت محتوا ممکن نشد.");
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Lessons ----------

const LESSON_SYSTEM = `تو معلم سواد مالی برای کاربران فارسی‌زبان هستی. ساده، گرم، بدون قضاوت و بدون اصطلاحات پیچیده بنویس.
فقط بر اساس طرح درسی که داده می‌شود بنویس و چیزی اختراع نکن. مشاوره‌ی سرمایه‌گذاری نده.
این متن بین همه‌ی کاربران مشترک است، پس هیچ عدد شخصی ننویس. برای اشاره به عدد خود کاربر فقط از این جای‌خالی‌ها استفاده کن: {runway_months} {liquid_balance} {essential_monthly} {savings_rate} {essential_share} {emergency_progress}.`;

const LESSON_SCHEMA = {
  type: "OBJECT",
  properties: {
    intro: { type: "STRING" },
    sections: { type: "ARRAY", items: { type: "OBJECT", properties: { heading: { type: "STRING" }, text: { type: "STRING" } }, required: ["heading", "text"] } },
    personal: { type: "STRING" },
    takeaway: { type: "STRING" },
    quiz: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          question: { type: "STRING" },
          options: { type: "ARRAY", items: { type: "STRING" } },
          answer: { type: "INTEGER" },
          explanation: { type: "STRING" },
        },
        required: ["question", "options", "answer", "explanation"],
      },
    },
  },
  required: ["intro", "sections", "personal", "takeaway", "quiz"],
};

export async function generateLesson(title: string, outline: unknown): Promise<{ body: LessonBody; quiz: QuizItem[] }> {
  const out = (await geminiJson(
    LESSON_SYSTEM,
    `عنوان درس: ${title}\nطرح درس (JSON):\n${JSON.stringify(outline)}\n\nیک درس کوتاه (حدود ۴ دقیقه خواندن) بنویس: مقدمه، ۳ تا ۴ بخش، یک بند «درباره‌ی خودت» با جای‌خالی‌ها، یک جمع‌بندی یک‌خطی، و ۳ سوال چهارگزینه‌ای (answer = اندیس گزینه‌ی درست از صفر).`,
    LESSON_SCHEMA,
  )) as LessonBody & { quiz: QuizItem[] };
  const quiz = (out.quiz ?? []).filter((q) => Array.isArray(q.options) && q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length);
  if (!out.intro || !out.sections?.length || quiz.length < 2) throw new LearnAiError("محتوای درس کامل ساخته نشد؛ دوباره تلاش کنید.");
  return { body: { intro: out.intro, sections: out.sections, personal: out.personal ?? "", takeaway: out.takeaway ?? "" }, quiz };
}

// ---------- Weekly report ----------

async function load(db: SupabaseClient) {
  const [acc, tx, cat, set, prog, les] = await Promise.all([
    db.from("accounts").select("initial_balance"),
    db.from("transactions").select("amount,kind,occurred_at,category_id,necessity_override"),
    db.from("categories").select("id,name,kind,necessity"),
    db.from("user_settings").select("*").maybeSingle(),
    db.from("lesson_progress").select("status,lessons(slug)"),
    db.from("lessons").select("slug,status"),
  ]);
  const err = [acc, tx, cat, set, prog, les].find((r) => r.error)?.error;
  if (err) throw new Error(err.message);
  const txs = ((tx.data ?? []) as MathTx[]).map((t) => ({ ...t, amount: Number(t.amount) }));
  const categories = (cat.data ?? []) as { id: string; name: string; kind: string; necessity: Necessity | null }[];
  const settings = set.data as Record<string, number | null> | null;
  const completedSlugs = ((prog.data ?? []) as unknown as { status: string; lessons: { slug: string } | null }[])
    .filter((p) => p.status === "completed" && p.lessons).map((p) => p.lessons!.slug);
  return {
    accounts: (acc.data ?? []) as { initial_balance: number }[],
    txs, categories, settings, completedSlugs, lessons: (les.data ?? []) as { slug: string; status: string }[],
  };
}

async function sha(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function defaultExperiment(opt: ExperimentOptions): Experiment {
  const c = opt.category_cap[0];
  if (c) return { type: "category_cap", category_id: c.category_id, category_name: c.name, target_amount: c.max_target };
  return { type: "no_spend_days", min_days: 2 };
}

const REPORT_SYSTEM = `تو مربی مالی آرام و بدون قضاوت هستی که گزارش هفتگی کاربر را به فارسی ساده می‌نویسی.
فقط از عددهایی که در داده‌ها آمده استفاده کن؛ هیچ عدد جدیدی نساز و حساب نکن. مبلغ‌ها تومان هستند.
یک آزمایش کوچک برای هفته‌ی بعد فقط از میان گزینه‌های مجاز و در بازه‌ی مجاز انتخاب کن. هرگز سرزنش نکن و مشاوره‌ی سرمایه‌گذاری نده.`;

const REPORT_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    highlights: { type: "ARRAY", items: { type: "STRING" } },
    experiment: {
      type: "OBJECT",
      properties: {
        type: { type: "STRING", enum: ["category_cap", "flex_days_under_cap", "no_spend_days"] },
        category_id: { type: "STRING" },
        target_amount: { type: "NUMBER" },
        min_days: { type: "INTEGER" },
      },
      required: ["type"],
    },
    experiment_reason: { type: "STRING" },
  },
  required: ["summary", "highlights", "experiment", "experiment_reason"],
};

export async function buildWeeklyReport(db: SupabaseClient, userId: string, force: boolean, now = new Date()): Promise<WeeklyReportResult> {
  const d = await load(db);
  const fm = computeFinanceMetrics({ ...d, settings: d.settings as never }, now);
  const plan = d.settings ? {
    monthly_income_expected: d.settings["monthly_income_expected"] ?? null,
    savings_target: d.settings["savings_target"] ?? null,
    monthly_essential_expected: d.settings["monthly_essential_expected"] ?? null,
  } : null;
  const week = reportWeek(now, Number(d.settings?.["report_weekday"] ?? 5));
  const metrics = weekMetrics({
    txs: d.txs, categories: d.categories,
    initialTotal: d.accounts.reduce((s, a) => s + Number(a.initial_balance), 0),
    essentialMonthly: fm.essential_monthly, plan,
  }, week);
  if (metrics.tx_count < MIN_WEEK_TX) return { status: "insufficient", metrics, min: MIN_WEEK_TX };

  const { data: prev } = await db.from("weekly_reports").select("experiment").lt("week_end", week.week_end)
    .order("week_end", { ascending: false }).limit(1).maybeSingle();
  const prevExp = (prev?.experiment as Experiment | null) ?? null;
  const result = prevExp ? experimentResult(prevExp, metrics) : null;
  const data_hash = await sha(JSON.stringify({ metrics, result }));

  const { data: existing } = await db.from("weekly_reports").select("*").eq("week_end", week.week_end).maybeSingle();
  if (existing && existing.data_hash === data_hash && !force) {
    return { status: "ok", report: existing as never, cached: true };
  }

  const options = experimentOptions(metrics);
  let narrative: ReportNarrative | null = null;
  let experiment: Experiment = defaultExperiment(options);
  try {
    const out = (await geminiJson(
      REPORT_SYSTEM,
      `آمار هفته (JSON):\n${JSON.stringify(metrics)}\n\nنتیجه‌ی آزمایش هفته‌ی قبل:\n${JSON.stringify(result)}\n\nگزینه‌های مجاز آزمایش (JSON):\n${JSON.stringify(options)}\n\nخلاصه‌ی ۲-۳ جمله‌ای، ۲ تا ۴ نکته‌ی کوتاه و یک آزمایش بنویس.`,
      REPORT_SCHEMA,
    )) as { summary?: string; highlights?: string[]; experiment?: unknown; experiment_reason?: string };
    const allowed = allowedNumbers({ metrics, options, result }, [1, 2, 3, 4, 5, 6, 7]);
    const texts = [out.summary ?? "", ...(out.highlights ?? []), out.experiment_reason ?? ""];
    if (out.summary && texts.every((t) => usesOnlyAllowed(t, allowed))) {
      narrative = { summary: out.summary, highlights: (out.highlights ?? []).slice(0, 4), experiment_reason: out.experiment_reason ?? "" };
    }
    experiment = validateExperiment(out.experiment, options) ?? experiment;
  } catch (e) {
    console.error("weekly narrative failed", e);
  }

  const row = {
    user_id: userId, week_start: week.week_start, week_end: week.week_end,
    metrics, narrative, experiment, experiment_result: result, data_hash,
  };
  const { data: saved, error } = await db.from("weekly_reports").upsert(row, { onConflict: "user_id,week_end" }).select("*").single();
  if (error) throw new Error(error.message);
  return { status: "ok", report: saved as never, cached: false };
}
