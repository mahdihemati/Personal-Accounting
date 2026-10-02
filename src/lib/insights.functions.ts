import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware";
import { RANGE_LABEL, type AnalyzeResult, type AskResult, type Insight } from "./insights.types";

const rangeSchema = z.enum(["this_month", "last_month", "last_3_months"]);

export const analyzeFinance = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ range: rangeSchema, force: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }): Promise<AnalyzeResult> => {
    const { computeStats, generateInsight, MIN_TRANSACTIONS, AiError } = await import("./insights.server");
    const { db, userId } = context;
    let stats;
    try {
      stats = await computeStats(db, data.range);
    } catch (e) {
      console.error(e);
      return { status: "error", message: "خواندن داده‌ها ممکن نشد. دوباره تلاش کنید." };
    }
    if (stats.transactionCount < MIN_TRANSACTIONS) return { status: "insufficient", stats };

    if (!data.force) {
      const [{ data: cached }, { data: version }] = await Promise.all([
        db.from("ai_insights").select("payload,created_at")
          .eq("period_start", stats.periodStart).eq("period_end", stats.periodEnd)
          .order("created_at", { ascending: false }).limit(1).maybeSingle(),
        db.from("finance_data_versions").select("changed_at").maybeSingle(),
      ]);
      // A row from the last minute is reused even if data changed, so concurrent/duplicate requests don't call the AI twice.
      const recent = cached && Date.now() - new Date(cached.created_at).getTime() < 60_000;
      const fresh = cached && (recent || !version || new Date(cached.created_at) > new Date(version.changed_at));
      const insight = (cached?.payload as { insight?: Insight } | null)?.insight;
      if (fresh && insight) return { status: "ok", stats, insight, cached: true, createdAt: cached.created_at };
    }

    try {
      const insight = await generateInsight(stats, RANGE_LABEL[data.range]);
      const { data: row } = await db.from("ai_insights").insert({
        user_id: userId,
        period_start: stats.periodStart,
        period_end: stats.periodEnd,
        summary: insight.summary,
        payload: { insight, stats, range: data.range },
      }).select("created_at").single();
      return { status: "ok", stats, insight, cached: false, createdAt: row?.created_at ?? new Date().toISOString() };
    } catch (e) {
      if (e instanceof AiError) return { status: "error", message: e.message, stats };
      console.error(e);
      return { status: "error", message: "مشکلی در ساخت تحلیل پیش آمد. دوباره تلاش کنید.", stats };
    }
  });

export const askFinance = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ range: rangeSchema, question: z.string().trim().min(2).max(300) }).parse(d))
  .handler(async ({ data, context }): Promise<AskResult> => {
    const { computeStats, answerQuestion, MIN_TRANSACTIONS, AiError } = await import("./insights.server");
    try {
      const stats = await computeStats(context.db, data.range);
      if (stats.transactionCount < MIN_TRANSACTIONS) return { status: "insufficient" };
      return { status: "ok", answer: await answerQuestion(stats, RANGE_LABEL[data.range], data.question) };
    } catch (e) {
      if (e instanceof AiError) return { status: "error", message: e.message };
      console.error(e);
      return { status: "error", message: "پاسخ‌دادن ممکن نشد. دوباره تلاش کنید." };
    }
  });
