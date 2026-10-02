import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware";
import type { GetLessonResult, Lesson, LessonBody, QuizItem, WeeklyReportResult } from "./learning.types";

/** Returns lesson text; generates it once with Gemini (shared by all users) when missing. */
export const getLesson = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ slug: z.string().min(1).max(64) }).parse(d))
  .handler(async ({ data, context }): Promise<GetLessonResult> => {
    const { db } = context;
    const { data: lesson } = await db.from("lessons").select("*").eq("slug", data.slug).maybeSingle();
    if (!lesson || lesson.status !== "available") return { status: "unavailable", lesson: (lesson as Lesson) ?? null };
    const { data: content } = await db.from("lesson_content").select("body,quiz").eq("lesson_id", lesson.id).maybeSingle();
    if (content) return { status: "ok", lesson: lesson as Lesson, body: content.body as LessonBody, quiz: content.quiz as QuizItem[] };
    try {
      const { generateLesson } = await import("./learning.server");
      const gen = await generateLesson(lesson.title, lesson.outline);
      const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
      // ignoreDuplicates: if two users generate at once, the first stored version wins.
      await getSupabaseAdmin().from("lesson_content").upsert({ lesson_id: lesson.id, body: gen.body, quiz: gen.quiz }, { onConflict: "lesson_id", ignoreDuplicates: true });
      const { data: stored } = await db.from("lesson_content").select("body,quiz").eq("lesson_id", lesson.id).maybeSingle();
      return { status: "ok", lesson: lesson as Lesson, body: (stored?.body ?? gen.body) as LessonBody, quiz: (stored?.quiz ?? gen.quiz) as QuizItem[] };
    } catch (e) {
      console.error(e);
      return { status: "error", message: e instanceof Error && e.name !== "Error" ? e.message : (e as Error).message || "ساخت درس ممکن نشد." };
    }
  });

export const getWeeklyReport = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ force: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }): Promise<WeeklyReportResult> => {
    try {
      const { buildWeeklyReport } = await import("./learning.server");
      return await buildWeeklyReport(context.db, context.userId, !!data.force);
    } catch (e) {
      console.error(e);
      return { status: "error", message: "ساخت گزارش هفتگی ممکن نشد. دوباره تلاش کنید." };
    }
  });
