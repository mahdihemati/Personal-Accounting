import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarCheck, GraduationCap } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useVitals } from "@/lib/learning-data";
import { getWeeklyReport } from "@/lib/learning.functions";
import { runwayBand } from "@/lib/finance-metrics";
import { formatTomanShort, toFa } from "@/lib/format";

const pct = (v: number | null) => (v == null ? "—" : `${toFa(Math.round(v * 100))}٪`);

export function VitalsCards() {
  const { metrics: m } = useVitals();
  if (!m) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">علائم حیاتی مالی</h2>
        <Link to="/learn" className="flex items-center gap-1 text-xs text-primary"><GraduationCap className="size-4" />یادگیری</Link>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-3xl bg-card p-4">
          <p className="text-xs text-muted-foreground">Runway (دوام بدون درآمد)</p>
          <p className="mt-1 text-2xl font-bold">{m.runway_months == null ? "—" : `${toFa(m.runway_months)} ماه`}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {m.runway_months == null ? "هزینه‌ی ضروری ماهانه هنوز معلوم نیست" : runwayBand(m.runway_months).label}
          </p>
        </div>
        <div className="rounded-3xl bg-card p-4">
          <p className="text-xs text-muted-foreground">نرخ پس‌انداز این ماه</p>
          <p className="mt-1 text-2xl font-bold">{pct(m.savings_rate_month)}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {m.savings_rate_source === "expected" ? "بر اساس درآمد برنامه‌ریزی‌شده" : `ماه قبل: ${pct(m.savings_rate_prev_month)}`}
          </p>
        </div>
        <div className="rounded-3xl bg-card p-4">
          <p className="text-xs text-muted-foreground">سهم هزینه‌ی ضروری از درآمد</p>
          <p className="mt-1 text-2xl font-bold">{pct(m.essential_share)}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">ضروری این ماه: {formatTomanShort(m.month.essential)}</p>
        </div>
        <div className="rounded-3xl bg-card p-4">
          <p className="text-xs text-muted-foreground">صندوق اضطراری ({toFa(m.emergency_fund_target_months)} ماه)</p>
          <p className="mt-1 text-2xl font-bold">{pct(m.emergency_progress)}</p>
          <Progress value={(m.emergency_progress ?? 0) * 100} className="mt-2 h-1.5" />
        </div>
      </div>
    </section>
  );
}

export function WeeklyReportCard() {
  const fetchReport = useServerFn(getWeeklyReport);
  const q = useQuery({ queryKey: ["weekly_report", "home"], queryFn: () => fetchReport({ data: {} }), staleTime: 10 * 60_000 });
  if (q.data?.status !== "ok") return null;
  return (
    <Link to="/report" className="flex items-center gap-3 rounded-3xl bg-card p-4">
      <CalendarCheck className="size-6 text-primary" />
      <div className="flex-1">
        <p className="font-semibold">گزارش هفتگی‌ات آماده است</p>
        <p className="line-clamp-1 text-xs text-muted-foreground">{q.data.report.narrative?.summary ?? "آمار هفته و آزمایش هفته‌ی بعد"}</p>
      </div>
    </Link>
  );
}
