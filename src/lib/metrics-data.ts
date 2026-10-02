/** Browser-side data for runMetrics, read under the user's own session (RLS). */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { runMetrics } from "./finance-metrics";
import type { AlertRow, DecisionRow, MetricsData } from "./metrics/types";
import type { AssetRow, IntegrationRow, PriceRow } from "./metrics/assets";

function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as T;
}

export async function loadMetricsData(): Promise<MetricsData> {
  const [acc, tx, cat, set, dec, al, ast, pr, integ] = await Promise.all([
    supabase.from("accounts").select("id,name,initial_balance"),
    supabase.from("transactions").select("id,amount,kind,occurred_at,created_at,category_id,account_id,note,necessity_override,exclude_from_baseline"),
    supabase.from("categories").select("id,name,kind,necessity,alerts_muted"),
    supabase.from("user_settings").select("*").maybeSingle(),
    supabase.from("decisions").select("*").order("decided_at", { ascending: false }),
    supabase.from("alerts").select("*").order("created_at", { ascending: false }).limit(500),
    supabase.from("assets").select("id,symbol,quantity,label,acquired_on,cost_basis_toman").order("created_at"),
    supabase.from("price_cache").select("symbol,value_raw,source_timestamp,fetched_at"),
    supabase.from("user_integrations").select("key_last4,key_status,expires_on,monthly_request_cap,unit_divisor,unit_confirmed").maybeSingle(),
  ]);
  if (set.error) throw new Error(set.error.message);
  return {
    accounts: check(acc) as MetricsData["accounts"],
    txs: (check(tx) as MetricsData["txs"]).map((t) => ({ ...t, amount: Number(t.amount) })),
    categories: check(cat) as MetricsData["categories"],
    settings: (set.data ?? null) as MetricsData["settings"],
    decisions: (check(dec) as DecisionRow[]).map((d) => ({ ...d, amount_toman: Number(d.amount_toman) })),
    alerts: check(al) as AlertRow[],
    // Phase 7 tables: tolerate failures so the rest of the app keeps working.
    assets: ((ast.data ?? []) as AssetRow[]).map((a) => ({ ...a, quantity: Number(a.quantity), cost_basis_toman: a.cost_basis_toman == null ? null : Number(a.cost_basis_toman) })),
    prices: ((pr.data ?? []) as PriceRow[]).map((p) => ({ ...p, value_raw: Number(p.value_raw) })),
    integration: (integ.data ?? null) as IntegrationRow | null,
  };
}

export function useMetricsData() {
  return useQuery({ queryKey: ["transactions", "metrics-data"], queryFn: loadMetricsData });
}

export function useAlerts() {
  return useQuery({
    queryKey: ["alerts"],
    queryFn: async () => check(await supabase.from("alerts").select("*").eq("status", "new").order("created_at", { ascending: false }).limit(3)) as AlertRow[],
  });
}

export function useDecisions() {
  return useQuery({
    queryKey: ["decisions"],
    queryFn: async () => (check(await supabase.from("decisions").select("*").order("decided_at", { ascending: false })) as DecisionRow[])
      .map((d) => ({ ...d, amount_toman: Number(d.amount_toman) })),
  });
}

async function insertAlerts(rows: AlertRow[]): Promise<AlertRow[]> {
  if (!rows.length) return [];
  const { data, error } = await supabase.from("alerts").insert(rows.map(({ kind, transaction_id, category_id, payload }) => ({ kind, transaction_id, category_id, payload }))).select("*");
  if (error) { console.error(error); return []; }
  return (data ?? []) as AlertRow[];
}

/** Run duplicate / large-transaction checks for freshly saved transactions. */
export async function checkAlertsFor(ids: string[]): Promise<AlertRow[]> {
  if (!ids.length) return [];
  try {
    const d = await loadMetricsData();
    return await insertAlerts(runMetrics({ mode: "anomalies", params: { transaction_ids: ids } }, d) as AlertRow[]);
  } catch (e) { console.error(e); return []; }
}

/** Once a day on app open: category pace check. */
export async function dailyAlertCheck(): Promise<void> {
  try {
    const d = await loadMetricsData();
    const today = (() => { const t = new Date(Date.now() + 210 * 60_000); return t.toISOString().slice(0, 10); })();
    if (d.settings?.alerts_last_checked_on === today) return;
    await insertAlerts(runMetrics({ mode: "anomalies", params: {} }, d) as AlertRow[]);
    const { data: u } = await supabase.auth.getUser();
    if (u.user) await supabase.from("user_settings").upsert({ user_id: u.user.id, alerts_last_checked_on: today }, { onConflict: "user_id" });
  } catch (e) { console.error(e); }
}

export async function setAlertStatus(a: AlertRow, status: "seen" | "dismissed" | "intentional") {
  const { error } = await supabase.from("alerts").update({ status }).eq("id", a.id!);
  if (error) throw new Error(error.message);
  if (status === "intentional" && a.kind === "large_transaction" && a.transaction_id) {
    await supabase.from("transactions").update({ exclude_from_baseline: true }).eq("id", a.transaction_id);
  }
}

export async function muteCategory(categoryId: string, muted = true) {
  const { error } = await supabase.from("categories").update({ alerts_muted: muted }).eq("id", categoryId);
  if (error) throw new Error(error.message);
}

export type NewDecision = { title: string; amount_toman: number; category_id: string | null; choice: DecisionRow["choice"]; reason: string | null };

export async function recordDecision(d: NewDecision): Promise<DecisionRow> {
  const days = d.choice === "bought" ? 30 : d.choice === "postponed" ? 7 : null;
  const review_at = days ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
  const { data, error } = await supabase.from("decisions").insert({ ...d, review_at }).select("*").single();
  if (error) throw new Error(error.message);
  return data as DecisionRow;
}

export async function updateDecision(id: string, patch: Partial<DecisionRow>) {
  const { error } = await supabase.from("decisions").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}
