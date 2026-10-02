import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { JalaliDatePicker } from "@/components/JalaliDatePicker";
import { supabase } from "@/integrations/supabase/client";
import { useAccounts, useCategories, useInvalidate, type Kind, type Transaction } from "@/lib/data";
import { groupDigits, parseAmount } from "@/lib/format";

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
  const [kind, setKind] = useState<Kind>("expense");
  const [amount, setAmount] = useState(0);
  const [categoryId, setCategoryId] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("");
  const [date, setDate] = useState(new Date());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind(editing?.kind === "income" ? "income" : "expense");
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
    setSaving(true);
    const row = {
      kind,
      amount,
      category_id: categoryId || null,
      account_id: accountId,
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
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1">
            {(["expense", "income"] as Kind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => { setKind(k); setCategoryId(""); }}
                className={`rounded-xl py-2.5 text-sm font-medium transition-colors ${
                  kind === k ? (k === "income" ? "bg-income text-primary-foreground" : "bg-expense text-primary-foreground") : "text-muted-foreground"
                }`}
              >
                {k === "income" ? "درآمد" : "هزینه"}
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
              <Select value={accountId} onValueChange={setAccountId} dir="rtl">
                <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="انتخاب" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
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
