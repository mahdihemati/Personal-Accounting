import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Lock } from "lucide-react";
import { useLessonProgress, useLessons, useVitals } from "@/lib/learning-data";
import { RUNWAY_UNLOCK_MIN_TX } from "@/lib/finance-metrics";
import { toFa } from "@/lib/format";

export const Route = createFileRoute("/_app/learn")({
  head: () => ({
    meta: [
      { title: "یادگیری مالی | حسابداری شخصی" },
      { name: "description", content: "درس‌های کوتاه سواد مالی بر اساس عددهای خودت." },
      { property: "og:title", content: "یادگیری مالی | حسابداری شخصی" },
      { property: "og:description", content: "درس‌های کوتاه سواد مالی بر اساس عددهای خودت." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LearnPage,
});

function LearnPage() {
  const { data: lessons = [] } = useLessons();
  const { data: progress = [] } = useLessonProgress();
  const { metrics } = useVitals();
  const done = new Map(progress.map((p) => [p.lesson_id, p]));

  return (
    <main className="space-y-5 px-5 pt-8">
      <header>
        <h1 className="text-2xl font-bold">یادگیری</h1>
        <p className="mt-1 text-sm text-muted-foreground">درس‌های کوتاه، با عددهای واقعی خودت.</p>
      </header>
      <ol className="space-y-3">
        {lessons.map((l) => {
          const unlocked = metrics?.lesson_unlocks[l.slug] ?? false;
          const p = done.get(l.id);
          const hint = l.status === "coming_soon" ? "به‌زودی"
            : l.slug === "runway" ? `برای باز شدن: یک دسته‌ی ضروری و دست‌کم ${toFa(RUNWAY_UNLOCK_MIN_TX)} تراکنش`
            : "بعد از درس قبلی باز می‌شود";
          const inner = (
            <div className={`flex items-center gap-3 rounded-3xl bg-card p-4 ${unlocked ? "" : "opacity-60"}`}>
              <span className="grid size-9 place-items-center rounded-full bg-muted text-sm font-bold">{toFa(l.sort_order)}</span>
              <div className="flex-1">
                <p className="font-semibold">{l.title}</p>
                <p className="text-xs text-muted-foreground">{unlocked ? l.summary : hint}</p>
              </div>
              {p?.status === "completed" ? <CheckCircle2 className="size-5 text-primary" /> : !unlocked && <Lock className="size-4" />}
            </div>
          );
          return <li key={l.id}>{unlocked ? <Link to="/learn/$slug" params={{ slug: l.slug }}>{inner}</Link> : inner}</li>;
        })}
      </ol>
    </main>
  );
}
