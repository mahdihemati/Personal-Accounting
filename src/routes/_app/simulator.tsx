import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronRight, Plus, Trash2 } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { runMetrics } from "@/lib/finance-metrics";
import type { ScenarioItem, simulate } from "@/lib/metrics/simulate";
import { useMetricsData } from "@/lib/metrics-data";
import { formatToman, formatTomanShort, groupDigits, parseAmount, toFa } from "@/lib/format";

export const Route = createFileRoute("/_app/simulator")({
  head: () => ({
    meta: [
      { title: "شبیه‌ساز «اگر...» | حسابداری شخصی" },
      { name: "description", content: "ببین اگر خرج یک دسته را کم کنی یا پس‌انداز را زیاد کنی، چند ماه بعد کجا هستی." },
      { property: "og:title", content: "شبیه‌ساز مالی «اگر...»" },
      { property: "og:description", content: "اثر تغییرهای کوچک روی پس‌انداز و صندوق اضطراری." },
    ],
  }),
  component: SimulatorPage,
});

type Result = ReturnType<typeof simulate>;
type Kind = ScenarioItem["type"];
const KIND_LABEL: Record<Kind, string> = {
  reduce_category: "کم کردن خرج یک دسته",
  increase_saving: "پس‌انداز بیشتر در ماه",
  one_time_expense: "یک خرج یک‌باره",
  income_change: "تغییر درآمد ماهانه",
};
type Draft = { type: Kind; category_id: string; mode: "percent" | "amount"; value: number; month_offset: number; negative: boolean };
const blank = (type: Kind): Draft => ({ type, category_id: "", mode: "percent", value: 0, month_offset: 0, negative: false });

function toItem(d: Draft): ScenarioItem | null {
  if (!d.value) return null;
  if (d.type === "reduce_category") return d.category_id ? { type: d.type, category_id: d.category_id, mode: d.mode, value: d.value } : null;
  if (d.type === "increase_saving") return { type: d.type, amount_per_month: d.value };
  if (d.type === "one_time_expense") return { type: d.type, amount: d.value, month_offset: d.month_offset };
  return { type: d.type, amount_per_month: d.negative ? -d.value : d.value };
}

function SimulatorPage() {
  const { data } = useMetricsData();
  const [drafts, setDrafts] = useState<Draft[]>([blank("reduce_category")]);
  const [months, setMonths] = useState<3 | 6 | 12>(6);
  const [inflation, setInflation] = useState(0);
  const cats = (data?.categories ?? []).filter((c) => c.kind === "expense");
  const items = drafts.map(toItem).filter((x): x is ScenarioItem => !!x);
  const r = data ? (runMetrics({ mode: "simulate", params: { items, months, inflation_annual_percent: inflation || null } }, data) as Result) : null;
  const set = (i: number, p: Partial<Draft>) => setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...p } : d)));
  const money = (v: number) => (v ? toFa(groupDigits(v)) : "");

  return (
    <main className="space-y-5 px-5 pt-8">
      <header className="flex items-center gap-2">
        <Link to="/insights" aria-label="بازگشت" className="text-muted-foreground"><ChevronRight /></Link>
        <h1 className="text-2xl font-bold">شبیه‌ساز «اگر...»</h1>
      </header>

      {drafts.map((d, i) => (
        <section key={i} className="space-y-3 rounded-3xl bg-card p-4">
          <div className="flex items-center gap-2">
            <Select value={d.type} onValueChange={(v) => set(i, blank(v as Kind))}>
              <SelectTrigger className="h-11 flex-1 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent dir="rtl">{(Object.keys(KIND_LABEL) as Kind[]).map((k) => <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>)}</SelectContent>
            </Select>
            {drafts.length > 1 && (
              <Button size="icon" variant="ghost" aria-label="حذف" onClick={() => setDrafts((ds) => ds.filter((_, j) => j !== i))}><Trash2 /></Button>
            )}
          </div>
          {d.type === "reduce_category" && (
            <div className="grid grid-cols-2 gap-2">
              <Select value={d.category_id} onValueChange={(v) => set(i, { category_id: v })}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="دسته" /></SelectTrigger>
                <SelectContent dir="rtl">{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={d.mode} onValueChange={(v) => set(i, { mode: v as Draft["mode"], value: 0 })}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent dir="rtl"><SelectItem value="percent">درصد</SelectItem><SelectItem value="amount">تومان در ماه</SelectItem></SelectContent>
              </Select>
            </div>
          )}
          {d.type === "income_change" && (
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 text-sm">
              {[false, true].map((neg) => (
                <button key={String(neg)} type="button" onClick={() => set(i, { negative: neg })}
                  className={`rounded-lg py-2 ${d.negative === neg ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{neg ? "کاهش" : "افزایش"}</button>
              ))}
            </div>
          )}
          <Input inputMode="numeric" className="h-11 rounded-xl"
            placeholder={d.type === "reduce_category" && d.mode === "percent" ? "چند درصد؟" : "مبلغ (تومان)"}
            value={d.mode === "percent" && d.type === "reduce_category" ? (d.value ? toFa(d.value) : "") : money(d.value)}
            onChange={(e) => { const v = parseAmount(e.target.value); set(i, { value: d.type === "reduce_category" && d.mode === "percent" ? Math.min(100, v) : v }); }} />
          {d.type === "one_time_expense" && (
            <Select value={String(d.month_offset)} onValueChange={(v) => set(i, { month_offset: Number(v) })}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent dir="rtl">{Array.from({ length: months }, (_, m) => <SelectItem key={m} value={String(m)}>{m === 0 ? "همین ماه" : `${toFa(m)} ماه دیگر`}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </section>
      ))}
      {drafts.length < 3 && (
        <Button variant="ghost" className="w-full rounded-2xl" onClick={() => setDrafts((ds) => [...ds, blank("increase_saving")])}><Plus /> افزودن تغییر دیگر</Button>
      )}

      <div className="flex items-center gap-2">
        <div className="grid flex-1 grid-cols-3 gap-1 rounded-2xl bg-card p-1">
          {([3, 6, 12] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMonths(m)}
              className={`rounded-xl py-2 text-sm ${months === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{toFa(m)} ماه</button>
          ))}
        </div>
        <Input inputMode="numeric" aria-label="تورم سالانه" placeholder="تورم ٪" className="h-11 w-24 rounded-xl"
          value={inflation ? toFa(inflation) : ""} onChange={(e) => setInflation(Math.min(200, parseAmount(e.target.value)))} />
      </div>

      {r?.status === "insufficient" ? (
        <section className="rounded-3xl bg-card p-5 text-sm text-muted-foreground">{r.message}. با ثبت تراکنش‌های حداقل یک ماه کامل، شبیه‌ساز فعال می‌شود.</section>
      ) : r?.status === "ok" ? (
        <section className="space-y-4 rounded-3xl bg-card p-5">
          {r.baseline_label && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{r.baseline_label}</span>}
          <p className="text-lg leading-8">
            بعد از {toFa(r.months)} ماه، {r.difference_end_toman >= 0 ? "حدود" : "حدود"}{" "}
            <span className={`font-extrabold ${r.difference_end_toman >= 0 ? "text-income" : "text-expense"}`}>{formatTomanShort(Math.abs(r.difference_end_toman))}</span>{" "}
            {r.difference_end_toman >= 0 ? "بیشتر" : "کمتر"} از روند فعلی پول داری.
          </p>
          <div className="h-40" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={r.series.map((s) => ({ ...s, label: toFa(s.month) }))}>
                <XAxis dataKey="label" reversed tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "none", borderRadius: 12, direction: "rtl" }}
                  formatter={(v, n) => [formatToman(Number(v)), n === "baseline_toman" ? "روند فعلی" : "با این تغییر"]} labelFormatter={(l) => `ماه ${l}`} />
                <Line type="monotone" dataKey="baseline_toman" stroke="var(--muted-foreground)" strokeDasharray="4 4" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="scenario_toman" stroke="var(--primary)" dot={false} strokeWidth={2.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-muted-foreground">موجودی آخر دوره (فعلی)</dt><dd className="font-semibold">{formatTomanShort(r.cash_end_baseline_toman)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">موجودی آخر دوره (با تغییر)</dt><dd className="font-semibold">{formatTomanShort(r.cash_end_scenario_toman)}</dd></div>
            {r.runway_end_scenario != null && <div><dt className="text-xs text-muted-foreground">Runway آخر دوره</dt><dd className="font-semibold">{toFa(r.runway_end_baseline ?? 0)} → {toFa(r.runway_end_scenario)} ماه</dd></div>}
            {r.months_to_emergency_scenario != null && <div><dt className="text-xs text-muted-foreground">رسیدن به صندوق اضطراری</dt><dd className="font-semibold">{r.months_to_emergency_scenario === 0 ? "رسیده‌ای" : `${toFa(r.months_to_emergency_scenario)} ماه`}{r.months_to_emergency_baseline != null && r.months_to_emergency_baseline !== r.months_to_emergency_scenario ? ` (به‌جای ${toFa(r.months_to_emergency_baseline)})` : ""}</dd></div>}
            {r.real_cash_end_scenario_toman != null && <div className="col-span-2"><dt className="text-xs text-muted-foreground">با تورم {toFa(r.inflation_annual_percent!)}٪، ارزش واقعی موجودی آخر دوره</dt><dd className="font-semibold">{formatTomanShort(r.real_cash_end_scenario_toman)}</dd></div>}
          </dl>
          <p className="text-[11px] text-muted-foreground">بر اساس میانگین {r.baseline_months_used ? `${toFa(r.baseline_months_used)} ماه گذشته` : "همین ماه"}؛ تخمین است، نه تضمین.</p>
        </section>
      ) : null}
    </main>
  );
}
