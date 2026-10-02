import { Illustration } from "@/components/Illustration";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FlaskConical, NotebookPen } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { AlertTriangle, Lightbulb, RefreshCw, Send, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TransactionSheet } from "@/components/TransactionSheet";
import { analyzeFinance, askFinance } from "@/lib/insights.functions";
import { RANGE_LABEL, type FinanceStats, type RangeKey } from "@/lib/insights.types";
import { formatToman, formatTomanShort, toFa } from "@/lib/format";

export const Route = createFileRoute("/_app/insights")({
  head: () => ({
    meta: [
      { title: "تحلیل هوشمند | حسابداری شخصی" },
      { name: "description", content: "تحلیل هوشمند دخل و خرج، هشدارها و پیشنهادهای عملی بر اساس داده‌های شما." },
      { property: "og:title", content: "تحلیل هوشمند | حسابداری شخصی" },
      { property: "og:description", content: "تحلیل هوشمند دخل و خرج، هشدارها و پیشنهادهای عملی بر اساس داده‌های شما." },
    ],
  }),
  component: InsightsPage,
});

const RANGES: RangeKey[] = ["this_month", "last_month", "last_3_months"];

function InsightsPage() {
  const [range, setRange] = useState<RangeKey>("this_month");
  const [sheet, setSheet] = useState(false);
  const analyze = useServerFn(analyzeFinance);
  const qc = useQueryClient();
  const key = ["insights", range];

  const query = useQuery({
    queryKey: key,
    queryFn: () => analyze({ data: { range } }),
    // Server cache handles freshness; avoid duplicate AI calls from refetches.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  const refresh = useMutation({
    mutationFn: () => analyze({ data: { range, force: true } }),
    onSuccess: (res) => qc.setQueryData(key, res),
  });

  const loading = query.isLoading || refresh.isPending;
  const result = query.data;
  const stats = result && "stats" in result ? result.stats : undefined;

  return (
    <main className="space-y-5 px-5 pt-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Illustration name="charts" size={48} />تحلیل هوشمند</h1>
        {result?.status === "ok" && (
          <Button size="sm" variant="ghost" disabled={loading} onClick={() => refresh.mutate()}>
            <RefreshCw className={loading ? "animate-spin" : ""} /> تحلیل دوباره
          </Button>
        )}
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/simulator" className="flex items-center gap-2 rounded-2xl bg-card p-4 text-sm font-medium"><FlaskConical className="size-5 text-primary" />شبیه‌ساز «اگر...»</Link>
        <Link to="/decisions" className="flex items-center gap-2 rounded-2xl bg-card p-4 text-sm font-medium"><NotebookPen className="size-5 text-primary" />دفتر تصمیم</Link>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-card p-1">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={`rounded-xl py-2.5 text-sm transition-colors ${range === r ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground"}`}
          >
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorCard message="مشکلی پیش آمد. دوباره تلاش کنید." onRetry={() => query.refetch()} />
      ) : result?.status === "insufficient" ? (
        <section className="flex flex-col items-center gap-4 rounded-3xl bg-card px-6 py-10 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-primary/15 text-primary"><Sparkles className="size-7" /></span>
          <p className="font-semibold">هنوز داده‌ی کافی برای تحلیل نیست</p>
          <p className="text-sm text-muted-foreground">برای این بازه حداقل ۵ تراکنش لازم است. با ثبت چند تراکنش، تحلیل هوشمند فعال می‌شود.</p>
          <Button className="h-11 rounded-xl" onClick={() => setSheet(true)}>ثبت اولین تراکنش</Button>
        </section>
      ) : result?.status === "error" ? (
        <ErrorCard message={result.message} onRetry={() => refresh.mutate()} />
      ) : result?.status === "ok" ? (
        <>
          <section className="space-y-5 rounded-3xl bg-card p-5">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-1 size-5 shrink-0 text-primary" />
              <p className="leading-8">{result.insight.summary}</p>
            </div>
            {result.insight.highlights.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">نکات مهم</p>
                {result.insight.highlights.map((h, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-2xl bg-muted/60 p-3 text-sm leading-7">
                    <TrendingUp className="mt-1 size-4 shrink-0 text-income" />{h}
                  </div>
                ))}
              </div>
            )}
            {result.insight.warnings.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">هشدارها</p>
                {result.insight.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-2xl bg-warning/10 p-3 text-sm leading-7 text-warning">
                    <AlertTriangle className="mt-1 size-4 shrink-0" />{w}
                  </div>
                ))}
              </div>
            )}
            {result.insight.suggestions.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">پیشنهادها</p>
                {result.insight.suggestions.map((s, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-2xl bg-muted/60 p-3 text-sm leading-7">
                    <Lightbulb className="mt-1 size-4 shrink-0 text-primary" />{s}
                  </div>
                ))}
              </div>
            )}
          </section>
          <p className="px-2 text-center text-xs text-muted-foreground">
            این تحلیل توسط هوش مصنوعی ساخته شده و جای مشاوره‌ی مالی حرفه‌ای را نمی‌گیرد.
          </p>
        </>
      ) : null}

      {!loading && stats && stats.expense > 0 && <Charts stats={stats} />}

      {!loading && result?.status === "ok" && <AskBox range={range} />}

      <TransactionSheet open={sheet} onOpenChange={(o) => { setSheet(o); if (!o) qc.invalidateQueries({ queryKey: ["insights"] }); }} />
    </main>
  );
}

function LoadingState() {
  return (
    <section className="space-y-4 rounded-3xl bg-card p-5" aria-busy>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="size-4 animate-pulse text-primary" /> در حال تحلیل داده‌های شما...
      </p>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="mt-4 h-14 w-full rounded-2xl" />
      <Skeleton className="h-14 w-full rounded-2xl" />
    </section>
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="flex flex-col items-center gap-4 rounded-3xl bg-card px-6 py-8 text-center">
      <AlertTriangle className="size-8 text-warning" />
      <p className="text-sm leading-7">{message}</p>
      <Button variant="secondary" className="rounded-xl" onClick={onRetry}>تلاش دوباره</Button>
    </section>
  );
}

function Charts({ stats }: { stats: FinanceStats }) {
  const changes = stats.categoryChanges.slice(0, 6);
  const max = Math.max(1, ...changes.flatMap((c) => [c.current, c.previous]));
  const p = stats.previous;
  return (
    <>
      <section className="rounded-3xl bg-card p-5">
        <p className="font-semibold">هزینه‌ها بر اساس دسته</p>
        <div className="relative mx-auto my-4 h-52 w-52" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={stats.byCategory} dataKey="amount" nameKey="name" innerRadius="68%" outerRadius="100%" paddingAngle={2} stroke="none">
                {stats.byCategory.map((s, i) => <Cell key={i} fill={s.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="text-xs text-muted-foreground">جمع</p>
              <p className="text-lg font-bold">{formatTomanShort(stats.expense)}</p>
            </div>
          </div>
        </div>
        <ul className="space-y-3">
          {stats.byCategory.map((s) => (
            <li key={s.name} className="flex items-center gap-3 text-sm">
              <span className="size-3 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="flex-1">{s.name}</span>
              <span className="text-muted-foreground">{toFa(String(s.percent)).replace(".", "٫")}٪</span>
              <span className="w-32 text-left font-medium">{formatToman(s.amount)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4 rounded-3xl bg-card p-5">
        <div className="flex items-center justify-between">
          <p className="font-semibold">مقایسه با دوره‌ی قبل</p>
          {p.expenseChangePercent !== null && (
            <span className={`flex items-center gap-1 text-sm font-medium ${p.expenseChange > 0 ? "text-expense" : "text-income"}`}>
              {p.expenseChange > 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
              {toFa(String(Math.abs(p.expenseChangePercent))).replace(".", "٫")}٪
            </span>
          )}
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-primary" />این دوره</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-muted-foreground/50" />دوره‌ی قبل</span>
        </div>
        {changes.map((c) => (
          <div key={c.name} className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span>{c.name}</span>
              <span className="text-muted-foreground">{formatTomanShort(c.current)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(c.current / max) * 100}%` }} />
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-muted-foreground/50" style={{ width: `${(c.previous / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

function AskBox({ range }: { range: RangeKey }) {
  const ask = useServerFn(askFinance);
  const [q, setQ] = useState("");
  const m = useMutation({ mutationFn: (question: string) => ask({ data: { range, question } }) });
  const res = m.data;

  return (
    <section className="space-y-3 rounded-3xl bg-card p-5">
      <p className="font-semibold">از داده‌هایت بپرس</p>
      <form
        className="flex gap-2"
        onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 2) m.mutate(q.trim()); }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} maxLength={300} placeholder="مثلاً این ماه چرا خرجم زیاد شد؟" className="h-12 rounded-xl" />
        <Button type="submit" size="icon" disabled={m.isPending || q.trim().length < 2} className="size-12 shrink-0 rounded-xl" aria-label="ارسال">
          <Send className="size-4 -scale-x-100" />
        </Button>
      </form>
      {m.isPending && (
        <div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></div>
      )}
      {!m.isPending && res && (
        <p className={`rounded-2xl p-3 text-sm leading-7 ${res.status === "ok" ? "bg-muted/60" : "bg-warning/10 text-warning"}`}>
          {res.status === "ok" ? res.answer : res.status === "insufficient" ? "داده‌ی این بازه برای پاسخ کافی نیست." : res.message}
        </p>
      )}
      {!m.isPending && m.isError && <p className="text-sm text-warning">پاسخ‌دادن ممکن نشد. دوباره تلاش کنید.</p>}
    </section>
  );
}
