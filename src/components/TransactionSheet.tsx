import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { JalaliDatePicker } from "@/components/JalaliDatePicker";
import { supabase } from "@/integrations/supabase/client";
import { budgetMonthKey, useAccounts, useCategories, useInvalidate, type Account, type Kind, type Transaction } from "@/lib/data";
import { groupDigits, parseAmount, toFa } from "@/lib/format";
import { endOfMonth, startOfMonth } from "date-fns-jalali";

/** Toast when this expense pushes its category past 80% / 100% of the month's budget. */
async function warnBudget(categoryId: string, date: Date, amount: number, previousAmount: number) {
  const from = startOfMonth(date);
  const [{ data: budget }, { data: txs }] = await Promise.all([
    supabase.from("budgets").select("limit_amount").eq("category_id", categoryId).eq("month", budgetMonthKey(from)).maybeSingle(),
    supabase.from("transactions").select("amount").eq("kind", "expense").eq("category_id", categoryId)
      .gte("occurred_at", from.toISOString()).lte("occurred_at", endOfMonth(date).toISOString()),
  ]);
  if (!budget?.limit_amount) return;
  const after = (txs ?? []).reduce((s, t) => s + Number(t.amount), 0);
  const before = after - amount + previousAmount;
  const limit = Number(budget.limit_amount);
  const pct = toFa(Math.round((after / limit) * 100));
  if (after > limit && before <= limit) toast.error(`از سقف بودجه‌ی این دسته گذشتید (${pct}٪)`);
  else if (after >= limit * 0.8 && before < limit * 0.8) toast.warning(`${pct}٪ بودجه‌ی این دسته مصرف شد`);
}

export function TransactionSheet({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing?: Transaction | null;
}) {
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const invalidate = useInvalidate();
  const [kind, setKind] = useState<Kind | "transfer">("expense");
  const [toAccountId, setToAccountId] = useState<string>("");
  const [amount, setAmount] = useState(0);
  const [categoryId, setCategoryId] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("");
  const [date, setDate] = useState(new Date());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind(editing?.kind ?? "expense");
    setToAccountId(editing?.to_account_id ?? "");
    setAmount(editing?.amount ?? 0);
    setCategoryId(editing?.category_id ?? "");
    setAccountId(editing?.account_id ?? accounts[0]?.id ?? "");
    setDate(editing ? new Date(editing.occurred_at) : new Date());
    setNote(editing?.note ?? "");
  }, [open, editing, accounts]);

  const cats = categories.filter((c) => c.kind === kind);

  async function save() {
    if (!amount) { toast.error("مبلغ را وارد کنید"); return; }
    if (!accountId) { toast.error("یک حساب انتخاب کنید"); return; }
    const isTransfer = kind === "transfer";
    if (isTransfer && !toAccountId) { toast.error("حساب مقصد را انتخاب کنید"); return; }
    if (isTransfer && toAccountId === accountId) { toast.error("حساب مبدأ و مقصد نباید یکی باشند"); return; }
    setSaving(true);
    const row = {
      kind,
      amount,
      category_id: isTransfer ? null : categoryId || null,
      account_id: accountId,
      to_account_id: isTransfer ? toAccountId : null,
      occurred_at: date.toISOString(),
      note: note.trim() || null,
    };
    const { error } = editing
      ? await supabase.from("transactions").update(row).eq("id", editing.id)
      : await supabase.from("transactions").insert(row);
    setSaving(false);
    if (error) { toast.error("ذخیره نشد: " + error.message); return; }
    await invalidate("transactions");
    toast.success(editing ? "تراکنش ویرایش شد" : "تراکنش ثبت شد");
    onOpenChange(false);
    if (kind === "expense" && categoryId) void warnBudget(categoryId, date, amount, editing?.kind === "expense" && editing.category_id === categoryId ? editing.amount : 0);
  }

  async function remove() {
    if (!editing) return;
    const { error } = await supabase.from("transactions").delete().eq("id", editing.id);
    if (error) { toast.error(error.message); return; }
    await invalidate("transactions");
    toast.success("تراکنش حذف شد");
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" dir="rtl" className="mx-auto max-h-[92vh] max-w-lg overflow-y-auto rounded-t-3xl border-0 bg-card px-5 pb-8">
        <SheetHeader className="text-right">
          <SheetTitle>{editing ? "ویرایش تراکنش" : "تراکنش جدید"}</SheetTitle>
        </SheetHeader>
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-muted p-1">
            {(["expense", "income", "transfer"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => { setKind(k); setCategoryId(""); }}
                className={`rounded-xl py-2.5 text-sm font-medium transition-colors ${
                  kind === k ? (k === "income" ? "bg-income text-primary-foreground" : k === "expense" ? "bg-expense text-primary-foreground" : "bg-primary text-primary-foreground") : "text-muted-foreground"
                }`}
              >
                {k === "income" ? "درآمد" : k === "expense" ? "هزینه" : "انتقال"}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <Label>مبلغ (تومان)</Label>
            <Input
              inputMode="numeric"
              value={amount ? groupDigits(amount) : ""}
              onChange={(e) => setAmount(parseAmount(e.target.value))}
              placeholder="۰"
              className="h-14 rounded-xl text-center text-2xl font-bold"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {kind === "transfer" ? (
              <>
                <div className="space-y-2">
                  <Label>از حساب</Label>
                  <AccountSelect value={accountId} onChange={setAccountId} accounts={accounts} />
                </div>
                <div className="space-y-2">
                  <Label>به حساب</Label>
                  <AccountSelect value={toAccountId} onChange={setToAccountId} accounts={accounts.filter((a) => a.id !== accountId)} />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>دسته</Label>
                  <Select value={categoryId} onValueChange={setCategoryId} dir="rtl">
                    <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="انتخاب" /></SelectTrigger>
                    <SelectContent>
                      {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>حساب</Label>
                  <AccountSelect value={accountId} onChange={setAccountId} accounts={accounts} />
                </div>
              </>
            )}
          </div>
          {kind === "transfer" && accounts.length < 2 && (
            <p className="text-xs text-muted-foreground">برای انتقال حداقل دو حساب لازم است؛ از تنظیمات حساب جدید بسازید.</p>
          )}
          <div className="space-y-2">
            <Label>تاریخ</Label>
            <JalaliDatePicker value={date} onChange={setDate} />
          </div>
          <div className="space-y-2">
            <Label>یادداشت</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-12 rounded-xl" placeholder="اختیاری" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={save} disabled={saving} className="h-12 flex-1 rounded-xl text-base">
              {saving ? "در حال ذخیره…" : "ذخیره"}
            </Button>
            {editing && (
              <Button variant="outline" onClick={remove} className="h-12 rounded-xl text-expense">
                حذف
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AccountSelect({ value, onChange, accounts }: { value: string; onChange: (v: string) => void; accounts: Account[] }) {
  return (
    <Select value={value} onValueChange={onChange} dir="rtl">
      <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="انتخاب" /></SelectTrigger>
      <SelectContent>
        {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
