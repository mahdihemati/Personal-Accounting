import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { addMonths, endOfMonth, format, startOfMonth } from "date-fns-jalali";
import { ChevronRight, Copy, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import {
  budgetMonthKey,
  budgetTone,
  useBudgetProgress,
  useCategories,
  useInvalidate,
  type Budget,
} from "@/lib/data";
import { formatToman, formatTomanShort, groupDigits, parseAmount, toFa } from "@/lib/format";

export const Route = createFileRoute("/_app/budgets")({
  head: () => ({
    meta: [
      { title: "بودجه‌ی ماهانه | حسابداری شخصی" },
      { name: "description", content: "تعیین سقف هزینه برای هر دسته و پیگیری میزان خرج در هر ماه شمسی." },
      { property: "og:title", content: "بودجه‌ی ماهانه | حسابداری شخصی" },
      { property: "og:description", content: "تعیین سقف هزینه برای هر دسته و پیگیری میزان خرج در هر ماه شمسی." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BudgetsPage,
});

const TONE_BAR = { ok: "bg-income", warn: "bg-warning", over: "bg-expense" } as const;

function BudgetsPage() {
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => startOfMonth(addMonths(new Date(), -i + 1))), []);
  const [idx, setIdx] = useState("1");
  const m = months[Number(idx)] ?? months[1]!;
  const range = useMemo(() => ({ from: m, to: endOfMonth(m) }), [m]);
  const { items, isLoading } = useBudgetProgress(range);
  const { data: categories = [] } = useCategories();
  const invalidate = useInvalidate();
  const [editing, setEditing] = useState<Partial<Budget> | null>(null);
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const expenseCats = categories.filter((c) => c.kind === "expense");
  const totalLimit = items.reduce((s, i) => s + i.budget.limit_amount, 0);
  const totalSpent = items.reduce((s, i) => s + i.spent, 0);

  async function copyPrev() {
    const prev = startOfMonth(addMonths(m, -1));
    const { data, error } = await supabase.from("budgets").select("category_id,limit_amount").eq("month", budgetMonthKey(prev));
    if (error) { toast.error(error.message); return; }
    if (!data?.length) { toast.error("ماه قبل بودجه‌ای ندارد"); return; }
    const rows = data.map((b) => ({ ...b, month: budgetMonthKey(m) }));
    const { error: e2 } = await supabase.from("budgets").upsert(rows, { onConflict: "user_id,category_id,month" });
    if (e2) { toast.error(e2.message); return; }
    await invalidate("budgets");
    toast.success("بودجه‌ی ماه قبل کپی شد");
  }

  return (
    <main className="space-y-5 px-5 pt-8">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to="/settings" aria-label="بازگشت" className="text-muted-foreground"><ChevronRight /></Link>
          <h1 className="text-2xl font-bold">بودجه‌ی ماهانه</h1>
        </div>
        <Button size="icon" className="size-12 rounded-2xl" aria-label="بودجه‌ی جدید" onClick={() => setEditing({})}>
          <Plus />
        </Button>
      </header>

      <Select value={idx} onValueChange={setIdx} dir="rtl">
        <SelectTrigger className="h-11 rounded-xl bg-card"><SelectValue /></SelectTrigger>
        <SelectContent>
          {months.map((d, i) => <SelectItem key={i} value={String(i)}>{toFa(format(d, "MMMM yyyy"))}</SelectItem>)}
        </SelectContent>
      </Select>

      {items.length > 0 && (
        <section className="rounded-3xl bg-card p-5">
          <p className="text-xs text-muted-foreground">خرج‌شده از کل بودجه</p>
          <p className="mt-1 text-2xl font-bold">
            {formatTomanShort(totalSpent)} <span className="text-base font-normal text-muted-foreground">از {formatTomanShort(totalLimit)}</span>
          </p>
          <Bar ratio={totalLimit ? totalSpent / totalLimit : 0} />
        </section>
      )}

      <section className="space-y-2 rounded-3xl bg-card p-2">
        {isLoading ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">در حال بارگذاری…</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <p className="font-semibold">برای این ماه بودجه‌ای تعریف نشده</p>
            <p className="text-sm text-muted-foreground">برای هر دسته سقف هزینه بگذارید تا میزان خرج را دنبال کنید.</p>
            <div className="flex gap-2">
              <Button className="rounded-xl" onClick={() => setEditing({})}>تعریف بودجه</Button>
              <Button variant="outline" className="rounded-xl" onClick={copyPrev}><Copy /> کپی از ماه قبل</Button>
            </div>
          </div>
        ) : (
          items
            .sort((a, b) => b.ratio - a.ratio)
            .map(({ budget, spent, ratio }) => {
              const left = budget.limit_amount - spent;
              const cat = catMap.get(budget.category_id);
              return (
                <button key={budget.id} type="button" onClick={() => setEditing(budget)} className="block w-full rounded-2xl px-3 py-3 text-right hover:bg-muted/60">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{cat?.name ?? "دسته‌ی حذف‌شده"}</span>
                    <span className="text-sm tabular-nums">{formatToman(spent)} / {formatToman(budget.limit_amount)}</span>
                  </div>
                  <Bar ratio={ratio} />
                  <p className={`mt-1 text-xs ${left < 0 ? "text-expense" : "text-muted-foreground"}`}>
                    {left < 0 ? `${formatToman(-left)} بیش از سقف` : `${formatToman(left)} باقی‌مانده`} · {toFa(Math.round(ratio * 100))}٪
                  </p>
                </button>
              );
            })
        )}
      </section>

      <BudgetSheet
        value={editing}
        onClose={() => setEditing(null)}
        month={m}
        categories={expenseCats.filter((c) => c.id === editing?.category_id || !items.some((i) => i.budget.category_id === c.id))}
      />
    </main>
  );
}

function Bar({ ratio }: { ratio: number }) {
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
      <div className={`h-full rounded-full ${TONE_BAR[budgetTone(ratio)]}`} style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
    </div>
  );
}

function BudgetSheet({
  value,
  onClose,
  month,
  categories,
}: {
  value: Partial<Budget> | null;
  onClose: () => void;
  month: Date;
  categories: { id: string; name: string }[];
}) {
  const invalidate = useInvalidate();
  const [cat, setCat] = useState("");
  const [amount, setAmount] = useState(0);
  useEffect(() => {
    setCat(value?.category_id ?? "");
    setAmount(value?.limit_amount ?? 0);
  }, [value]);

  async function save() {
    if (!cat) { toast.error("دسته را انتخاب کنید"); return; }
    if (!amount) { toast.error("سقف را وارد کنید"); return; }
    const { error } = value?.id
      ? await supabase.from("budgets").update({ category_id: cat, limit_amount: amount }).eq("id", value.id)
      : await supabase.from("budgets").upsert(
          { category_id: cat, limit_amount: amount, month: budgetMonthKey(month) },
          { onConflict: "user_id,category_id,month" },
        );
    if (error) { toast.error("ذخیره نشد: " + error.message); return; }
    await invalidate("budgets");
    toast.success("بودجه ذخیره شد");
    onClose();
  }

  async function remove() {
    if (!value?.id) return;
    const { error } = await supabase.from("budgets").delete().eq("id", value.id);
    if (error) { toast.error(error.message); return; }
    await invalidate("budgets");
    toast.success("بودجه حذف شد");
    onClose();
  }

  return (
    <Sheet open={!!value} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" dir="rtl" className="mx-auto max-w-lg rounded-t-3xl border-0 bg-card px-5 pb-8">
        <SheetHeader className="text-right">
          <SheetTitle>{value?.id ? "ویرایش بودجه" : "بودجه‌ی جدید"} · {toFa(format(month, "MMMM"))}</SheetTitle>
        </SheetHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label>دسته</Label>
            <Select value={cat} onValueChange={setCat} dir="rtl">
              <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="انتخاب" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>سقف ماهانه (تومان)</Label>
            <Input
              inputMode="numeric"
              value={amount ? groupDigits(amount) : ""}
              onChange={(e) => setAmount(parseAmount(e.target.value))}
              placeholder="۰"
              className="h-14 rounded-xl text-center text-2xl font-bold"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={save} className="h-12 flex-1 rounded-xl text-base">ذخیره</Button>
            {value?.id && <Button variant="outline" onClick={remove} className="h-12 rounded-xl text-expense">حذف</Button>}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
