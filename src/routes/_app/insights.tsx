import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { endOfMonth, format, startOfMonth } from "date-fns-jalali";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Sparkles } from "lucide-react";
import { useCategories, useTransactions } from "@/lib/data";
import { formatToman, formatTomanShort, toFa } from "@/lib/format";

export const Route = createFileRoute("/_app/insights")({
  head: () => ({
    meta: [
      { title: "تحلیل هوشمند | حسابداری شخصی" },
      { name: "description", content: "سهم هر دسته از هزینه‌های ماه جاری." },
      { property: "og:title", content: "تحلیل هوشمند | حسابداری شخصی" },
      { property: "og:description", content: "سهم هر دسته از هزینه‌های ماه جاری." },
    ],
  }),
  component: InsightsPage,
});

function InsightsPage() {
  const now = new Date();
  const range = useMemo(() => ({ from: startOfMonth(now), to: endOfMonth(now) }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const { data: txs = [] } = useTransactions(range);
  const { data: categories = [] } = useCategories();

  const slices = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of txs) if (t.kind === "expense") map.set(t.category_id ?? "none", (map.get(t.category_id ?? "none") ?? 0) + t.amount);
    return [...map.entries()]
      .map(([id, value]) => {
        const c = categories.find((x) => x.id === id);
        return { name: c?.name ?? "بدون دسته", color: c?.color ?? "#64748b", value };
      })
      .sort((a, b) => b.value - a.value);
  }, [txs, categories]);
  const total = slices.reduce((s, x) => s + x.value, 0);

  return (
    <main className="space-y-5 px-5 pt-8">
      <h1 className="text-2xl font-bold">تحلیل هوشمند</h1>
      <section className="rounded-3xl bg-card p-5">
        <p className="font-semibold">هزینه‌های {toFa(format(now, "MMMM"))}</p>
        {total === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">هنوز هزینه‌ای در این ماه ثبت نشده</p>
        ) : (
          <>
            <div className="relative mx-auto h-56 w-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={slices} dataKey="value" innerRadius="68%" outerRadius="100%" paddingAngle={2} stroke="none">
                    {slices.map((s, i) => <Cell key={i} fill={s.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 grid place-items-center text-center">
                <div>
                  <p className="text-xs text-muted-foreground">جمع</p>
                  <p className="text-lg font-bold">{formatTomanShort(total)}</p>
                </div>
              </div>
            </div>
            <ul className="mt-5 space-y-3">
              {slices.map((s) => (
                <li key={s.name} className="flex items-center gap-3 text-sm">
                  <span className="size-3 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="flex-1">{s.name}</span>
                  <span className="text-muted-foreground">{toFa(Math.round((s.value / total) * 100))}٪</span>
                  <span className="w-36 text-left font-medium">{formatToman(s.value)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <section className="flex items-center gap-4 rounded-3xl border border-dashed p-5">
        <Sparkles className="size-6 shrink-0 text-primary" />
        <p className="text-sm text-muted-foreground">تحلیل هوشمند به‌زودی اضافه می‌شود.</p>
      </section>
    </main>
  );
}
