/** Browser-side hooks for assets, prices and the Navasan integration (all under RLS). */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { runMetrics } from "./finance-metrics";
import { useMetricsData } from "./metrics-data";
import { refreshPrices } from "./prices.functions";
import { AUTO_REFRESH_AGE_MS } from "./assets-catalog";
import type { assetsSummary } from "./metrics/assets";

export type AssetsSummary = ReturnType<typeof assetsSummary>;

export function useAssetsSummary() {
  const q = useMetricsData();
  const summary = q.data ? (runMetrics({ mode: "assets_summary" }, q.data) as AssetsSummary) : null;
  return { ...q, summary, integration: q.data?.integration ?? null, prices: q.data?.prices ?? [] };
}

export function useFetchUsage() {
  return useQuery({
    queryKey: ["transactions", "price_usage"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const [c, last] = await Promise.all([
        supabase.from("price_fetch_log").select("id", { count: "exact", head: true }).gte("fetched_at", since).not("http_status", "is", null),
        supabase.from("price_fetch_log").select("fetched_at").eq("ok", true).in("trigger", ["auto", "manual"]).order("fetched_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      return { used: c.count ?? 0, last_ok_at: (last.data?.fetched_at as string | undefined) ?? null };
    },
  });
}

export function useInvalidateAssets() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["transactions"] });
}

export type AssetInput = { symbol: string; quantity: number; label: string | null; acquired_on: string | null; cost_basis_toman: number | null };

export async function saveAsset(id: string | null, a: AssetInput) {
  const r = id ? await supabase.from("assets").update(a).eq("id", id) : await supabase.from("assets").insert(a);
  if (r.error) throw new Error(r.error.message);
}

export async function deleteAsset(id: string) {
  const { error } = await supabase.from("assets").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateIntegration(patch: Partial<{ expires_on: string | null; monthly_request_cap: number; unit_divisor: number; unit_confirmed: boolean }>) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  const { error } = await supabase.from("user_integrations").update({ ...patch, updated_at: new Date().toISOString() }).eq("user_id", u.user.id);
  if (error) throw new Error(error.message);
}

/** Once per app open: silent auto refresh when prices are older than 24h. Errors/skips are ignored. */
export function useAutoPriceRefresh() {
  const { data } = useMetricsData();
  const refresh = useServerFn(refreshPrices);
  const invalidate = useInvalidateAssets();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !data) return;
    done.current = true;
    if (!data.assets?.length || data.integration?.key_status !== "active") return;
    const oldest = data.prices?.length
      ? Math.min(...data.prices.map((p) => new Date(p.fetched_at).getTime()))
      : 0;
    if (Date.now() - oldest < AUTO_REFRESH_AGE_MS) return;
    refresh({ data: { trigger: "auto" } }).then((r) => { if (r.status === "ok") void invalidate(); }).catch(() => {});
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
}
