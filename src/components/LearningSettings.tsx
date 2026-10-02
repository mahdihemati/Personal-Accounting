import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveUserSettings, useInvalidate, useUserSettings } from "@/lib/data";
import { WEEKDAY_LABELS } from "@/lib/weekly-math";
import { parseAmount, toFa } from "@/lib/format";

export function LearningSettings() {
  const { data: s } = useUserSettings();
  const invalidate = useInvalidate();
  const [months, setMonths] = useState("3");
  const [weekday, setWeekday] = useState(5);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (s) {
      setMonths(toFa(s.emergency_fund_target_months ?? 3));
      setWeekday(s.report_weekday ?? 5);
    }
  }, [s]);

  const save = async () => {
    const m = parseAmount(months);
    if (!(m >= 1 && m <= 24)) { toast.error("هدف صندوق اضطراری باید بین ۱ تا ۲۴ ماه باشد"); return; }
    setSaving(true);
    try {
      await saveUserSettings({ emergency_fund_target_months: m, report_weekday: weekday });
      await invalidate("user_settings", "weekly_report");
      toast.success("ذخیره شد");
    } catch { toast.error("ذخیره ممکن نشد"); } finally { setSaving(false); }
  };

  return (
    <section className="space-y-4 rounded-3xl bg-card p-5">
      <h2 className="font-semibold">صندوق اضطراری و گزارش هفتگی</h2>
      <div className="space-y-2">
        <Label htmlFor="ef-months">هدف صندوق اضطراری (ماه هزینه‌ی ضروری)</Label>
        <Input id="ef-months" inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>روز گزارش هفتگی</Label>
        <div className="flex flex-wrap gap-2">
          {WEEKDAY_LABELS.map((d, i) => (
            <button key={d} type="button" onClick={() => setWeekday(i)}
              className={`rounded-full border px-3 py-1 text-sm ${weekday === i ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>{d}</button>
          ))}
        </div>
      </div>
      <Button className="w-full" disabled={saving} onClick={save}>ذخیره</Button>
    </section>
  );
}
