import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getWeeklyReport } from "@/lib/learning.functions";
import { describeExperiment } from "@/lib/weekly-math";
import { formatToman, jDate, toFa } from "@/lib/format";

export const Route = createFileRoute("/_app/report")({
  head: () => ({
    meta: [
      { title: "گزارش هفتگی | حسابداری شخصی" },
      { name: "description", content: "خلاصه‌ی هفته‌ی مالی و یک آزمایش کوچک برای هفته‌ی بعد." },
      { property: "og:title", content: "گزارش هفتگی | حسابداری شخصی" },
      { property: "og:description", content: "خلاصه‌ی هفته‌ی مالی و یک آزمایش کوچک برای هفته‌ی بعد." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportPage,
});

const diff = (n: number) => (n === 0 ? "بدون تغییر" : `${n > 0 ? "+" : "−"}${formatToman(Math.abs(n))}`);

function ReportPage() {
  const fetchReport = useServerFn(getWeeklyReport);
  const [force, setForce] = useState(0);
  const q = useQuery({ queryKey: ["weekly_report", "page", force], queryFn: () => fetchReport({ data: { force: force > 0 } }) });
  const r = q.data;

  return (
    <main className="space-y-5 px-5 pt-8">
      <h1 className="text-2xl font-bold">گزارش هفتگی</h1>
      {q.isLoading && <p className="text-muted-foreground">در حال ساخت گزارش…</p>}
      {r?.status === "error" && <p>{r.message}</p>}
      {r?.status === "insufficient" && (
        <p className="rounded-3xl bg-card p-4">برای گزارش این هفته دست‌کم {toFa(r.min)} تراکنش لازم است؛ تا الان {toFa(r.metrics.tx_count)} تراکنش ثبت شده.</p>
      )}
      {r?.status === "ok" && (() => {
        const m = r.report.metrics;
        return (
          <>
            <p className="text-sm text-muted-foreground">{jDate(m.week_start)} تا {jDate(m.week_end)}</p>
            {r.report.narrative && (
              <section className="space-y-2 rounded-3xl bg-card p-4 leading-7">
                <p>{r.report.narrative.summary}</p>
                <ul className="list-inside list-disc text-sm text-muted-foreground">
                  {r.report.narrative.highlights.map((h, i) => <li key={i}>{h}</li>)}
                </ul>
              </section>
            )}
            <section className="grid grid-cols-2 gap-3">
              <Stat label="هزینه" value={formatToman(m.expense)} sub={diff(m.expense_change)} />
              <Stat label="درآمد" value={formatToman(m.income)} sub={diff(m.income_change)} />
              <Stat label="روزهای بدون هزینه" value={`${toFa(m.no_spend_days)} روز`} />
              <Stat label="Runway" value={m.runway_end == null ? "—" : `${toFa(m.runway_end)} ماه`} sub={m.runway_change == null ? undefined : `تغییر: ${toFa(m.runway_change)}`} />
            </section>
            {m.top_categories.length > 0 && (
              <section className="rounded-3xl bg-card p-4">
                <h2 className="mb-2 font-semibold">بیشترین هزینه‌ها</h2>
                {m.top_categories.map((c) => (
                  <div key={c.category_id} className="flex justify-between py-1 text-sm"><span>{c.name}</span><span>{formatToman(c.amount)}</span></div>
                ))}
              </section>
            )}
            {r.report.experiment_result && (
              <section className="rounded-3xl bg-card p-4 text-sm"><h2 className="mb-1 font-semibold">آزمایش هفته‌ی قبل</h2>{r.report.experiment_result.text}</section>
            )}
            {r.report.experiment && (
              <section className="rounded-3xl bg-primary/10 p-4 text-sm leading-7">
                <h2 className="mb-1 font-semibold text-primary">آزمایش هفته‌ی بعد</h2>
                <p>{describeExperiment(r.report.experiment)}</p>
                {r.report.narrative?.experiment_reason && <p className="text-muted-foreground">{r.report.narrative.experiment_reason}</p>}
              </section>
            )}
            <Button variant="secondary" className="w-full" disabled={q.isFetching} onClick={() => setForce((f) => f + 1)}>بازسازی گزارش</Button>
          </>
        );
      })()}
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string | undefined }) {
  return (
    <div className="rounded-3xl bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-bold">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
