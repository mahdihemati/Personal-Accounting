import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { addMonths, endOfMonth, format, startOfMonth } from "date-fns-jalali";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TransactionRow } from "@/components/TransactionRow";
import { TransactionSheet } from "@/components/TransactionSheet";
import { useCategories, useTransactions, type Transaction } from "@/lib/data";
import { formatToman, jDate, toFa } from "@/lib/format";

export const Route = createFileRoute("/_app/transactions")({
  head: () => ({
    meta: [
      { title: "تراکنش‌ها | حسابداری شخصی" },
      { name: "description", content: "فهرست تراکنش‌ها به تفکیک روز با فیلتر ماه و دسته." },
      { property: "og:title", content: "تراکنش‌ها | حسابداری شخصی" },
      { property: "og:description", content: "فهرست تراکنش‌ها به تفکیک روز با فیلتر ماه و دسته." },
    ],
  }),
  component: TransactionsPage,
});

function TransactionsPage() {
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => startOfMonth(addMonths(new Date(), -i))), []);
  const [monthIdx, setMonthIdx] = useState("0");
  const [cat, setCat] = useState("all");
  const m = months[Number(monthIdx)] ?? months[0]!;
  const range = useMemo(() => ({ from: m, to: endOfMonth(m) }), [m]);
  const { data: txs = [], isLoading } = useTransactions(range);
  const { data: categories = [] } = useCategories();
  const [sheet, setSheet] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const catMap = new Map(categories.map((c) => [c.id, c]));

  const groups = useMemo(() => {
    const list = cat === "all" ? txs : txs.filter((t) => t.category_id === cat);
    const map = new Map<string, Transaction[]>();
    for (const t of list) {
      const k = new Date(t.occurred_at).toDateString();
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    return [...map.entries()];
  }, [txs, cat]);

  return (
    <main className="space-y-5 px-5 pt-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">تراکنش‌ها</h1>
        <Button size="icon" className="size-12 rounded-2xl" onClick={() => { setEditing(null); setSheet(true); }} aria-label="تراکنش جدید">
          <Plus />
        </Button>
      </header>
      <div className="grid grid-cols-2 gap-3">
        <Select value={monthIdx} onValueChange={setMonthIdx} dir="rtl">
          <SelectTrigger className="h-11 rounded-xl bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            {months.map((d, i) => <SelectItem key={i} value={String(i)}>{toFa(format(d, "MMMM yyyy"))}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={cat} onValueChange={setCat} dir="rtl">
          <SelectTrigger className="h-11 rounded-xl bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه‌ی دسته‌ها</SelectItem>
            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">در حال بارگذاری…</p>
      ) : groups.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">تراکنشی در این بازه نیست</p>
      ) : (
        groups.map(([day, items]) => {
          const net = items.reduce((s, t) => s + (t.kind === "income" ? t.amount : t.kind === "expense" ? -t.amount : 0), 0);
          return (
            <section key={day} className="rounded-3xl bg-card p-2">
              <div className="flex items-center justify-between px-3 pb-1 pt-2 text-sm">
                <span className="font-semibold">{jDate(items[0]!.occurred_at, "EEEE d MMMM")}</span>
                <span className="text-muted-foreground">{formatToman(net)}</span>
              </div>
              {items.map((t) => (
                <TransactionRow key={t.id} t={t} category={t.category_id ? catMap.get(t.category_id) : undefined} onClick={() => { setEditing(t); setSheet(true); }} />
              ))}
            </section>
          );
        })
      )}
      <TransactionSheet open={sheet} onOpenChange={setSheet} editing={editing} />
    </main>
  );
}
