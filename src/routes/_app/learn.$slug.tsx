import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getLesson } from "@/lib/learning.functions";
import { saveProgress, useVitals } from "@/lib/learning-data";
import { useInvalidate } from "@/lib/data";
import { placeholderValue, type FinanceMetrics } from "@/lib/finance-metrics";
import { formatToman, toFa } from "@/lib/format";

export const Route = createFileRoute("/_app/learn/$slug")({
  head: () => ({
    meta: [
      { title: "درس مالی | حسابداری شخصی" },
      { name: "description", content: "یک درس کوتاه سواد مالی همراه با آزمون." },
      { property: "og:title", content: "درس مالی | حسابداری شخصی" },
      { property: "og:description", content: "یک درس کوتاه سواد مالی همراه با آزمون." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LessonPage,
});

const MONEY = new Set(["liquid_balance", "essential_monthly"]);
const RATIO = new Set(["savings_rate", "savings_rate_month", "essential_share", "emergency_progress"]);

function fill(text: string, m: FinanceMetrics | null) {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = m ? placeholderValue(m, k) : undefined;
    if (v == null) return "—";
    if (MONEY.has(k)) return formatToman(v);
    if (RATIO.has(k)) return `${toFa(Math.round(v * 100))}٪`;
    return toFa(v);
  });
}

function LessonPage() {
  const { slug } = Route.useParams();
  const fetchLesson = useServerFn(getLesson);
  const q = useQuery({ queryKey: ["lesson", slug], queryFn: () => fetchLesson({ data: { slug } }), staleTime: Infinity, retry: false });
  const { metrics } = useVitals();
  const invalidate = useInvalidate();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const r = q.data;

  useEffect(() => {
    if (r?.status === "ok") saveProgress(r.lesson.id, {}).catch(() => {});
  }, [r]);

  if (q.isLoading) return <main className="px-5 pt-8 text-muted-foreground">در حال آماده‌سازی درس… (بار اول چند ثانیه طول می‌کشد)</main>;
  if (!r || r.status !== "ok") {
    return (
      <main className="space-y-4 px-5 pt-8">
        <p>{r?.status === "error" ? r.message : "این درس هنوز در دسترس نیست."}</p>
        <Button variant="secondary" onClick={() => q.refetch()}>دوباره</Button>
      </main>
    );
  }

  const score = r.quiz.reduce((s, item, i) => s + (answers[i] === item.answer ? 1 : 0), 0);
  const submit = async () => {
    setSubmitted(true);
    const passed = score >= Math.ceil(r.quiz.length * 0.6);
    try {
      await saveProgress(r.lesson.id, { status: passed ? "completed" : "opened", quiz_score: score, quiz_total: r.quiz.length, ...(passed ? { completed_at: new Date().toISOString() } : {}) });
      await invalidate("lesson_progress");
      toast.success(passed ? "درس کامل شد" : "نتیجه ثبت شد؛ می‌توانی دوباره امتحان کنی");
    } catch { toast.error("ذخیره‌ی نتیجه ممکن نشد"); }
  };

  return (
    <main className="space-y-5 px-5 pt-8 leading-8">
      <Link to="/learn" className="flex items-center gap-1 text-sm text-muted-foreground"><ArrowRight className="size-4" />یادگیری</Link>
      <h1 className="text-2xl font-bold leading-10">{r.lesson.title}</h1>
      <p>{r.body.intro}</p>
      {r.body.sections.map((s, i) => (
        <section key={i}>
          <h2 className="mb-1 font-semibold">{s.heading}</h2>
          <p className="text-foreground/90">{fill(s.text, metrics)}</p>
        </section>
      ))}
      {r.body.personal && (
        <section className="rounded-3xl bg-card p-4">
          <h2 className="mb-1 font-semibold">درباره‌ی خودت</h2>
          <p>{fill(r.body.personal, metrics)}</p>
        </section>
      )}
      {r.body.takeaway && <p className="rounded-2xl bg-primary/10 p-3 font-medium text-primary">{r.body.takeaway}</p>}

      <section className="space-y-4">
        <h2 className="text-lg font-bold">آزمون کوتاه</h2>
        {r.quiz.map((item, i) => (
          <div key={i} className="space-y-2 rounded-3xl bg-card p-4">
            <p className="font-medium">{toFa(i + 1)}. {item.question}</p>
            {item.options.map((o, j) => {
              const chosen = answers[i] === j;
              const tone = submitted ? (j === item.answer ? "border-primary bg-primary/10" : chosen ? "border-destructive bg-destructive/10" : "border-border") : chosen ? "border-primary" : "border-border";
              return (
                <button key={j} type="button" disabled={submitted} onClick={() => setAnswers({ ...answers, [i]: j })}
                  className={`block w-full rounded-2xl border p-3 text-right text-sm ${tone}`}>{o}</button>
              );
            })}
            {submitted && <p className="text-sm text-muted-foreground">{item.explanation}</p>}
          </div>
        ))}
        {!submitted ? (
          <Button className="w-full" disabled={Object.keys(answers).length < r.quiz.length} onClick={submit}>ثبت پاسخ‌ها</Button>
        ) : (
          <div className="space-y-2">
            <p className="text-center font-semibold">امتیاز: {toFa(score)} از {toFa(r.quiz.length)}</p>
            <Button variant="secondary" className="w-full" onClick={() => { setAnswers({}); setSubmitted(false); }}>دوباره امتحان کن</Button>
          </div>
        )}
        <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground"><Mic className="size-3" />می‌توانی از دستیار صوتی بپرسی: «Runway من چند ماهه؟»</p>
      </section>
    </main>
  );
}
