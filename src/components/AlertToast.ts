import { toast } from "sonner";
import type { QueryClient } from "@tanstack/react-query";
import { alertMessage } from "@/lib/metrics/anomalies";
import type { AlertRow } from "@/lib/metrics/types";
import { checkAlertsFor, setAlertStatus } from "@/lib/metrics-data";
import { openTransactionEditor } from "@/lib/ui-events";
import { formatToman, toFa } from "@/lib/format";

export function showAlertToasts(alerts: AlertRow[], qc: QueryClient) {
  for (const a of alerts) {
    toast.warning("هشدار هوشمند", {
      description: alertMessage(a, formatToman, toFa),
      duration: 12000,
      action: {
        label: a.kind === "possible_duplicate" ? "عمدی بود" : "عمدی بود",
        onClick: () => { void setAlertStatus(a, "intentional").then(() => qc.invalidateQueries({ queryKey: ["alerts"] })); },
      },
      cancel: a.transaction_id ? {
        label: "ویرایش",
        onClick: () => { void setAlertStatus(a, "seen"); openTransactionEditor(a.transaction_id!); },
      } : undefined,
    });
  }
  if (alerts.length) void qc.invalidateQueries({ queryKey: ["alerts"] });
}

/** After saving transactions: check them and show calm alerts if any. */
export async function afterTransactionsSaved(ids: string[], qc: QueryClient) {
  showAlertToasts(await checkAlertsFor(ids), qc);
}
