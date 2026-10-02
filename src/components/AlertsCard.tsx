import { useQueryClient } from "@tanstack/react-query";
import { BellRing, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { alertMessage } from "@/lib/metrics/anomalies";
import type { AlertRow } from "@/lib/metrics/types";
import { muteCategory, setAlertStatus, useAlerts } from "@/lib/metrics-data";
import { openTransactionEditor } from "@/lib/ui-events";
import { formatToman, toFa } from "@/lib/format";

/** Calm list of new unusual-spending alerts on the home page. */
export function AlertsCard() {
  const { data: alerts = [] } = useAlerts();
  const qc = useQueryClient();
  if (!alerts.length) return null;

  async function act(a: AlertRow, fn: () => Promise<void>, msg?: string) {
    try { await fn(); if (msg) toast.success(msg); }
    catch (e) { toast.error((e as Error).message); }
    await qc.invalidateQueries({ queryKey: ["alerts"] });
    await qc.invalidateQueries({ queryKey: ["transactions"] });
    void a;
  }

  return (
    <section className="space-y-3 rounded-3xl bg-card p-5">
      <p className="flex items-center gap-2 font-semibold"><BellRing className="size-5 text-warning" />چیزی که شاید بخواهی ببینی</p>
      {alerts.map((a) => (
        <div key={a.id} className="space-y-2 rounded-2xl bg-muted/60 p-3">
          <div className="flex items-start gap-2">
            <p className="flex-1 text-sm leading-7">{alertMessage(a, formatToman, toFa)}</p>
            <button type="button" aria-label="بستن" className="text-muted-foreground" onClick={() => void act(a, () => setAlertStatus(a, "dismissed"))}>
              <X className="size-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {a.kind !== "category_pace" && (
              <Button size="sm" variant="secondary" className="rounded-xl" onClick={() => void act(a, () => setAlertStatus(a, "intentional"), "ثبت شد")}>عمدی بود</Button>
            )}
            {a.transaction_id && (
              <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => { void act(a, () => setAlertStatus(a, "seen")); openTransactionEditor(a.transaction_id!); }}>
                {a.kind === "possible_duplicate" ? "بررسی و حذف" : "ویرایش"}
              </Button>
            )}
            {a.category_id && (
              <Button size="sm" variant="ghost" className="rounded-xl text-muted-foreground"
                onClick={() => void act(a, async () => { await muteCategory(a.category_id!); await setAlertStatus(a, "dismissed"); }, "برای این دسته دیگر هشدار نمی‌دهیم")}>
                برای این دسته هشدار نده
              </Button>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
