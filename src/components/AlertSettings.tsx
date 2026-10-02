import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { muteCategory, useMetricsData } from "@/lib/metrics-data";

/** Turn unusual-spending alerts on/off, globally and per category. */
export function AlertSettings() {
  const { data } = useMetricsData();
  const qc = useQueryClient();
  if (!data) return null;
  const enabled = data.settings?.alerts_enabled !== false;
  const cats = data.categories.filter((c) => c.kind === "expense");

  async function run(fn: () => Promise<unknown>) {
    try { await fn(); } catch (e) { toast.error((e as Error).message); }
    await qc.invalidateQueries({ queryKey: ["transactions", "metrics-data"] });
    await qc.invalidateQueries({ queryKey: ["user_settings"] });
  }
  async function setEnabled(on: boolean) {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("user_settings").upsert({ user_id: u.user.id, alerts_enabled: on }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
  }

  return (
    <section className="rounded-3xl bg-card p-5">
      <label className="flex items-center justify-between">
        <span>
          <span className="block font-semibold">هشدار هزینه‌های غیرمعمول</span>
          <span className="text-xs text-muted-foreground">هزینه‌ی خیلی بزرگ، تکراری یا خرج تند یک دسته</span>
        </span>
        <Switch checked={enabled} onCheckedChange={(on) => void run(() => setEnabled(on))} />
      </label>
      {enabled && (
        <div className="mt-3 divide-y divide-border">
          {cats.map((c) => (
            <label key={c.id} className="flex items-center justify-between py-2.5 text-sm">
              <span>{c.name}</span>
              <Switch checked={!c.alerts_muted} onCheckedChange={(on) => void run(() => muteCategory(c.id, !on))} />
            </label>
          ))}
        </div>
      )}
    </section>
  );
}
