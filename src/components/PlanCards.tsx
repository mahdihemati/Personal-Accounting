import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { dailyBudget, monthForecast, type MathTx, type Necessity } from "@/lib/budget-math";
import { saveUserSettings, useCategories, useInvalidate, useMathTransactions, useUserSettings } from "@/lib/data";
import { formatToman, formatTomanShort } from "@/lib/format";

function useMathInputs() {
  const { data: txs = [] } = useMathTransactions();
  const { data: categories = [] } = useCategories();
  const { data: settings, isLoading } = useUserSettings();
  const cats = useMemo(() => new Map<string, Necessity>(categories.map((c) => [c.id, c.necessity ?? "flexible"])), [categories]);
  return { txs: txs as MathTx[], cats, settings, isLoading };
}

export function DailyBudgetCard() {
  const { txs, cats, settings, isLoading } = useMathInputs();
  if (isLoading) return null;
  const r = dailyBudget(new Date(), txs, cats, settings);
  return (
    <section className="rounded-3xl bg-card p-5">
      <p className="text-xs text-muted-foreground">بودجه‌ی امروز</p>
      {r.status === "unconfigured" ? (
        <div className="mt-2 space-y-3">
          <p className="text-sm text-muted-foreground">با تنظیم درآمد، پس‌انداز و هزینه‌های ضروری، می‌گوییم امروز چقدر می‌توانی خرج کنی.</p>
          <Button asChild className="h-11 rounded-xl"><Link to="/settings" hash="plan">برنامه‌ی مالی ماه را تنظیم کن</Link></Button>
        </div>
      ) : r.status === "exhausted" ? (
        <p className="mt-2 leading-7 text-muted-foreground">بودجه‌ی انعطاف‌پذیر این ماه تمام شده. از این به بعد بهتر است فقط هزینه‌های ضروری را داشته باشی.</p>
      ) : (
        <>
          <p className="mt-1 text-lg">امروز می‌توانی <span className="text-3xl font-extrabold text-primary">{formatTomanShort(r.today)}</span> خرج کنی</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div className={`h-full rounded-full ${r.flexToday > r.today ? "bg-warning" : "bg-primary"}`} style={{ width: `${Math.min(r.flexToday / r.today, 1) * 100}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">تا الان {formatToman(r.flexToday)} از {formatToman(r.today)}</p>
        </>
      )}
    </section>
  );
}

export function ForecastCard() {
  const { txs, cats, settings, isLoading } = useMathInputs();
  if (isLoading) return null;
  const f = monthForecast(new Date(), txs, cats, settings);
  return (
    <section className="rounded-3xl bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="font-semibold">پیش‌بینی پایان ماه</p>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">تخمین</span>
      </div>
      {f.status === "insufficient" ? (
        <p className="mt-2 text-sm text-muted-foreground">داده برای پیش‌بینی کافی نیست.</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">مانده‌ی تخمینی آخر ماه</p>
          <p className="mt-1 text-xl font-bold tabular-nums">
            {f.low === f.high ? formatTomanShort(f.low) : `بین ${formatTomanShort(f.low)} تا ${formatTomanShort(f.high)}`}
          </p>
        </>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">این پیش‌بینی بر اساس روند فعلی است و تضمین نیست.</p>
    </section>
  );
}

export function ReviewCategoriesCard() {
  const { data: settings, isLoading } = useUserSettings();
  const { data: categories = [] } = useCategories();
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);
  if (isLoading || settings?.review_categories_seen) return null;
  const expense = categories.filter((c) => c.kind === "expense");

  async function toggle(id: string, essential: boolean) {
    const { error } = await supabase.from("categories").update({ necessity: essential ? "essential" : "flexible" }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await invalidate("categories");
  }
  async function done() {
    setBusy(true);
    try { await saveUserSettings({ review_categories_seen: true }); await invalidate("user_settings"); }
    catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }

  return (
    <section className="rounded-3xl border border-primary/30 bg-card p-5">
      <p className="font-semibold">دسته‌هایت را مرور کن</p>
      <p className="mt-1 text-sm text-muted-foreground">کدام هزینه‌ها ضروری‌اند؟ بودجه‌ی روزانه بر همین اساس حساب می‌شود.</p>
      <div className="mt-3 divide-y divide-border">
        {expense.map((c) => (
          <label key={c.id} className="flex items-center justify-between py-2.5">
            <span>{c.name}</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              ضروری
              <Switch checked={c.necessity === "essential"} onCheckedChange={(v) => void toggle(c.id, v)} />
            </span>
          </label>
        ))}
      </div>
      <Button disabled={busy} onClick={done} className="mt-3 h-11 w-full rounded-xl">تأیید</Button>
    </section>
  );
}
