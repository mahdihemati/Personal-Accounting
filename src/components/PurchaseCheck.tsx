import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { runMetrics } from "@/lib/finance-metrics";
import type { checkPurchase } from "@/lib/metrics/purchase";
import type { DecisionRow } from "@/lib/metrics/types";
import { recordDecision, useMetricsData } from "@/lib/metrics-data";
import { openTransactionPrefill } from "@/lib/ui-events";
import { formatToman, groupDigits, parseAmount, toFa } from "@/lib/format";

type Result = ReturnType<typeof checkPurchase>;
const pct = (v: number) => `${toFa(Math.round(v * 100))}٪`;

/** "Before you buy": shows what a purchase means in numbers, then logs the decision. */
export function PurchaseCheckButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3 rounded-3xl bg-card p-4 text-right">
        <ShoppingBag className="size-6 text-primary" />
        <span className="flex-1">
          <span className="block font-semibold">قبل از خرید</span>
          <span className="text-xs text-muted-foreground">ببین این خرید روی بودجه و پس‌اندازت چه اثری دارد</span>
        </span>
      </button>
      <PurchaseCheckSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

function PurchaseCheckSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data } = useMetricsData();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState(0);
  const [categoryId, setCategoryId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const cats = (data?.categories ?? []).filter((c) => c.kind === "expense");
  const r = data && amount > 0 ? (runMetrics({ mode: "check_purchase", params: { amount, category_id: categoryId || null } }, data) as Result) : null;

  function reset() { setTitle(""); setAmount(0); setCategoryId(""); setReason(""); }

  async function decide(choice: DecisionRow["choice"]) {
    if (!title.trim()) { toast.error("بنویس چه چیزی می‌خواهی بخری"); return; }
    if (!amount) { toast.error("مبلغ را وارد کن"); return; }
    setBusy(true);
    try {
      const d = await recordDecision({ title: title.trim(), amount_toman: amount, category_id: categoryId || null, choice, reason: reason.trim() || null });
      await qc.invalidateQueries({ queryKey: ["decisions"] });
      onOpenChange(false);
      reset();
      if (choice === "bought") openTransactionPrefill({ amount, category_id: categoryId || null, note: title.trim(), decision_id: d.id });
      else toast.success(choice === "postponed" ? "یک هفته‌ی دیگر دوباره یادت می‌اندازیم" : "تصمیمت در دفتر تصمیم ثبت شد");
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" dir="rtl" className="mx-auto max-h-[92vh] max-w-lg overflow-y-auto rounded-t-3xl border-0 bg-card px-5 pb-8">
        <SheetHeader className="text-right"><SheetTitle>قبل از خرید</SheetTitle></SheetHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>چه چیزی؟</Label>
            <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً هدفون" className="h-12 rounded-xl" />
          </div>
          <div className="space-y-2">
            <Label>مبلغ (تومان)</Label>
            <Input inputMode="numeric" value={amount ? toFa(groupDigits(amount)) : ""} onChange={(e) => setAmount(parseAmount(e.target.value))} className="h-12 rounded-xl text-lg font-semibold" />
          </div>
          <div className="space-y-2">
            <Label>دسته (اختیاری)</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="انتخاب دسته" /></SelectTrigger>
              <SelectContent dir="rtl">{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {r && (
            <ul className="space-y-2 rounded-2xl bg-muted/60 p-4 text-sm leading-7">
              {r.share_of_today_budget != null && <li>{pct(r.share_of_today_budget)} از بودجه‌ی امروز ({formatToman(r.today_budget_toman!)})</li>}
              {r.month_flex_remaining_toman != null && (
                <li>
                  {r.share_of_month_flex_remaining != null ? `${pct(r.share_of_month_flex_remaining)} از` : "بیشتر از"} بودجه‌ی آزاد باقی‌مانده‌ی ماه؛
                  بعد از خرید: {formatToman(r.month_flex_remaining_after_toman!)}
                </li>
              )}
              {r.forecast_after && <li>مانده‌ی تخمینی آخر ماه بعد از خرید: {formatToman(r.forecast_after.low_toman)}{r.forecast_after.low_toman !== r.forecast_after.high_toman && ` تا ${formatToman(r.forecast_after.high_toman)}`}</li>}
              {r.essential_days != null && <li>برابر با {toFa(r.essential_days)} روز هزینه‌ی ضروری</li>}
              {r.runway_before != null && r.runway_after != null && <li>Runway از {toFa(r.runway_before)} به {toFa(r.runway_after)} ماه</li>}
              {r.share_of_emergency_gap != null && <li>{pct(r.share_of_emergency_gap)} از فاصله‌ات تا هدف صندوق اضطراری</li>}
              {r.category_history && <li>از {toFa(r.category_history.reviewed)} خرید مرورشده در این دسته، {toFa(r.category_history.regret)} مورد پشیمانی داشتی</li>}
              {r.share_of_today_budget == null && r.month_flex_remaining_toman == null && r.essential_days == null && (
                <li className="text-muted-foreground">برای مقایسه‌ی دقیق‌تر، برنامه‌ی مالی ماه را در تنظیمات کامل کن.</li>
              )}
            </ul>
          )}

          <div className="space-y-2">
            <Label>چرا؟ (اختیاری)</Label>
            <Input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} className="h-11 rounded-xl" />
          </div>
          <p className="text-xs text-muted-foreground">تصمیم با خودت است؛ این عددها فقط برای دید بهتر است.</p>
          <div className="grid grid-cols-3 gap-2">
            <Button disabled={busy} className="h-12 rounded-xl" onClick={() => void decide("bought")}>می‌خرم</Button>
            <Button disabled={busy} variant="secondary" className="h-12 rounded-xl" onClick={() => void decide("postponed")}>بعداً</Button>
            <Button disabled={busy} variant="outline" className="h-12 rounded-xl" onClick={() => void decide("skipped")}>نمی‌خرم</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
