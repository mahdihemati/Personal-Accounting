import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeFinanceMetrics, type FinanceMetrics } from "./finance-metrics";
import { useAccounts, useCategories, useMathTransactions, useUserSettings } from "./data";
import type { Lesson } from "./learning.types";

export type Progress = { lesson_id: string; status: "opened" | "completed"; quiz_score: number | null; quiz_total: number | null };

export function useLessons() {
  return useQuery({
    queryKey: ["lessons"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lessons").select("*").order("sort_order");
      if (error) throw new Error(error.message);
      return (data ?? []) as Lesson[];
    },
  });
}

export function useLessonProgress() {
  return useQuery({
    queryKey: ["lesson_progress"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lesson_progress").select("lesson_id,status,quiz_score,quiz_total");
      if (error) throw new Error(error.message);
      return (data ?? []) as Progress[];
    },
  });
}

export async function saveProgress(lesson_id: string, patch: Partial<Omit<Progress, "lesson_id">> & { completed_at?: string }) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("not signed in");
  const { error } = await supabase.from("lesson_progress").upsert({ user_id: u.user.id, lesson_id, status: "opened", ...patch }, { onConflict: "user_id,lesson_id" });
  if (error) throw new Error(error.message);
}

/** Financial vitals computed in code from the user's own rows (RLS). */
export function useVitals(): { metrics: FinanceMetrics | null; isLoading: boolean } {
  const acc = useAccounts(), txs = useMathTransactions(), cats = useCategories(), set = useUserSettings();
  const lessons = useLessons(), prog = useLessonProgress();
  const isLoading = [acc, txs, cats, set, lessons, prog].some((q) => q.isLoading);
  if (isLoading || !acc.data || !txs.data || !cats.data || !lessons.data) return { metrics: null, isLoading };
  const completed = new Set((prog.data ?? []).filter((p) => p.status === "completed").map((p) => p.lesson_id));
  const s = set.data as (Record<string, unknown> | null | undefined);
  const metrics = computeFinanceMetrics({
    accounts: acc.data,
    txs: txs.data.map((t) => ({ ...t, amount: Number(t.amount) })),
    categories: cats.data,
    settings: s ? {
      monthly_income_expected: (s["monthly_income_expected"] as number | null) ?? null,
      monthly_essential_expected: (s["monthly_essential_expected"] as number | null) ?? null,
      emergency_fund_target_months: (s["emergency_fund_target_months"] as number | null) ?? null,
    } : null,
    lessons: lessons.data,
    completedSlugs: lessons.data.filter((l) => completed.has(l.id)).map((l) => l.slug),
  });
  return { metrics, isLoading: false };
}
