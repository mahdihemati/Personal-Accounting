import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { planSuggestions, type MathTx, type Necessity } from "@/lib/budget-math";
import { saveUserSettings, useCategories, useInvalidate, useMathTransactions, useUserSettings } from "@/lib/data";
import { formatToman, groupDigits, parseAmount } from "@/lib/format";

const FIELDS = [
  { key: "monthly_income_expected", label: "درآمد مورد انتظار ماه" },
  { key: "savings_target", label: "هدف پس‌انداز ماه" },
  { key: "monthly_essential_expected", label: "هزینه‌ی ضروری مورد انتظار ماه" },
] as const;
type Key = (typeof FIELDS)[number]["key"];

export function PlanSettings() {
  const { data: settings } = useUserSettings();
  const { data: txs = [] } = useMathTransactions();
  const { data: categories = [] } = useCategories();
  const invalidate = useInvalidate();
  const [v, setV] = useState<Record<Key, number | null>>({ monthly_income_expected: null, savings_target: null, monthly_essential_expected: null });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) setV({
      monthly_income_expected: settings.monthly_income_expected,
      savings_target: settings.savings_target,
      monthly_essential_expected: settings.monthly_essential_expected,
    });
  }, [settings]);

  const suggestion = useMemo(() => {
    const cats = new Map<string, Necessity>(categories.map((c) => [c.id, c.necessity ?? "flexible"]));
    return planSuggestions(new Date(), txs as MathTx[], cats);
  }, [txs, categories]);

  async function save() {
    setSaving(true);
    try {
      await saveUserSettings(v);
      await invalidate("user_settings");
      toast.success("برنامه‌ی مالی ذخیره شد");
    } catch (e) { toast.error("ذخیره نشد: " + (e as Error).message); }
    setSaving(false);
  }

  return (
    <section id="plan" className="space-y-4 rounded-3xl bg-card p-5">
      <div>
        <p className="font-semibold">برنامه‌ی مالی ماه</p>
        <p className="text-xs text-muted-foreground">همه به تومان. برای محاسبه‌ی بودجه‌ی امروز استفاده می‌شود.</p>
      </div>
      {FIELDS.map((f) => {
        const sug = suggestion?.[f.key];
        return (
          <div key={f.key} className="space-y-2">
            <Label>{f.label}</Label>
            <Input
              inputMode="numeric"
              value={v[f.key] != null ? groupDigits(v[f.key]!) : ""}
              onChange={(e) => setV({ ...v, [f.key]: e.target.value.trim() ? parseAmount(e.target.value) : null })}
              placeholder="۰"
              className="h-12 rounded-xl"
            />
            {sug != null && sug !== v[f.key] && (
              <button type="button" onClick={() => setV({ ...v, [f.key]: sug })} className="text-xs text-primary">
                پیشنهاد بر اساس میانگین ماه‌های قبل: {formatToman(sug)} — قبول
              </button>
            )}
          </div>
        );
      })}
      <Button onClick={save} disabled={saving} className="h-12 w-full rounded-xl">ذخیره</Button>
    </section>
  );
}
