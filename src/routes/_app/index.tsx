import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { endOfMonth, format, getDate, getDaysInMonth, startOfMonth } from "date-fns-jalali";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TransactionRow } from "@/components/TransactionRow";
import { TransactionSheet } from "@/components/TransactionSheet";
import { DailyBudgetCard, ForecastCard, ReviewCategoriesCard } from "@/components/PlanCards";
import { budgetTone, useAccounts, useBudgetProgress, useCategories, useTotals, useTransactions, type Transaction } from "@/lib/data";
import { formatToman, formatTomanShort, toFa } from "@/lib/format";

export const Route = createFileRoute("/_app/")({
  head: () => ({
    meta: [
      { title: "خانه | حسابداری شخصی" },
      { name: "description", content: "موجودی کل، خلاصه‌ی درآمد و هزینه‌ی ماه و آخرین تراکنش‌ها." },
      { property: "og:title", content: "حسابداری شخصی فارسی" },
      { property: "og:description", content: "مدیریت ساده‌ی دخل و خرج به تومان با تقویم شمسی." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const now = new Date();
  const range = useMemo(() => ({ from: startOfMonth(now), to: endOfMonth(now) }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: totals = [] } = useTotals();
  const { data: month = [] } = useTransactions(range);
  const { items: budgetItems } = useBudgetProgress(range);
  const budgetLimit = budgetItems.reduce((s, i) => s + i.budget.limit_amount, 0);
  const budgetSpent = budgetItems.reduce((s, i) => s + i.spent, 0);
  const overCount = budgetItems.filter((i) => i.ratio > 1).length;
  const { data: recent = [] } = useTransactions(undefined, 5);
  const [sheet, setSheet] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const balance =
    accounts.reduce((s, a) => s + Number(a.initial_balance), 0) +
    totals.reduce((s, t) => s + (t.kind === "income" ? t.amount : t.kind === "expense" ? -t.amount : 0), 0);
  const income = month.filter((t) => t.kind === "income").reduce((s, t) => s + t.amount, 0);
  const expense = month.filter((t) => t.kind === "expense").reduce((s, t) => s + t.amount, 0);

  const trend = useMemo(() => {
    const days = getDaysInMonth(now);
    const rows = Array.from({ length: days }, (_, i) => ({ day: toFa(i + 1), income: 0, expense: 0 }));
    for (const t of month) {
      const d = getDate(new Date(t.occurred_at)) - 1;
      const r = rows[d];
      if (!r) continue;
      if (t.kind === "income") r.income += t.amount;
      else if (t.kind === "expense") r.expense += t.amount;
    }
    return rows.slice(0, getDate(now));
  }, [month]); // eslint-disable-line react-hooks/exhaustive-deps

  const catMap = new Map(categories.map((c) => [c.id, c]));

  return (
    <main className="space-y-6 px-5 pt-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">موجودی کل</p>
          <p className="mt-1 text-4xl font-extrabold tracking-tight">{formatTomanShort(balance)}</p>
        </div>
        <Button size="icon" className="size-12 rounded-2xl" onClick={() => { setEditing(null); setSheet(true); }} aria-label="تراکنش جدید">
          <Plus />
        </Button>
      </header>

      <ReviewCategoriesCard />
      <DailyBudgetCard />

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-3xl bg-card p-5">
          <p className="text-xs text-muted-foreground">درآمد {toFa(format(now, "MMMM"))}</p>
          <p className="mt-2 text-xl font-bold text-income">{formatTomanShort(income)}</p>
        </div>
        <div className="rounded-3xl bg-card p-5">
          <p className="text-xs text-muted-foreground">هزینه {toFa(format(now, "MMMM"))}</p>
          <p className="mt-2 text-xl font-bold text-expense">{formatTomanShort(expense)}</p>
        </div>
      </section>

      <ForecastCard />

      <Link to="/budgets" className="block rounded-3xl bg-card p-5">
        <div className="flex items-center justify-between">
          <p className="font-semibold">بودجه‌ی این ماه</p>
          {overCount > 0 && <span className="text-xs text-expense">{toFa(overCount)} دسته بیش از سقف</span>}
        </div>
        {budgetItems.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">هنوز بودجه‌ای تعریف نکرده‌اید — برای تعریف لمس کنید.</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              {formatTomanShort(budgetSpent)} از {formatTomanShort(budgetLimit)}
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${{ ok: "bg-income", warn: "bg-warning", over: "bg-expense" }[budgetTone(budgetLimit ? budgetSpent / budgetLimit : 0)]}`}
                style={{ width: `${Math.min(budgetLimit ? budgetSpent / budgetLimit : 0, 1) * 100}%` }}
              />
            </div>
          </>
        )}
      </Link>

      <section className="rounded-3xl bg-card p-5">
        <p className="mb-4 font-semibold">روند این ماه</p>
        <div className="h-40" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gi" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--income)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--income)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="ge" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--expense)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--expense)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" reversed tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} interval="preserveStartEnd" />
              <Tooltip
                contentStyle={{ background: "var(--popover)", border: "none", borderRadius: 12, direction: "rtl", fontFamily: "Vazirmatn" }}
                formatter={(v, n) => [formatToman(Number(v)), n === "income" ? "درآمد" : "هزینه"]}
                labelFormatter={(l) => `روز ${l}`}
              />
              <Area type="monotone" dataKey="income" stroke="var(--income)" strokeWidth={2} fill="url(#gi)" />
              <Area type="monotone" dataKey="expense" stroke="var(--expense)" strokeWidth={2} fill="url(#ge)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-3xl bg-card p-2">
        <div className="flex items-center justify-between px-3 pb-1 pt-3">
          <p className="font-semibold">آخرین تراکنش‌ها</p>
          <Link to="/transactions" className="text-sm text-primary">همه</Link>
        </div>
        {recent.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">هنوز تراکنشی ثبت نشده</p>
        ) : (
          recent.map((t) => (
            <TransactionRow key={t.id} t={t} category={t.category_id ? catMap.get(t.category_id) : undefined} showDate onClick={() => { setEditing(t); setSheet(true); }} />
          ))
        )}
      </section>
      <TransactionSheet open={sheet} onOpenChange={setSheet} editing={editing} />
    </main>
  );
}
