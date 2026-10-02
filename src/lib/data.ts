import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AccountType = "cash" | "card" | "wallet";
export type Kind = "income" | "expense";
export type Account = { id: string; name: string; type: AccountType; initial_balance: number; created_at: string };
export type Category = { id: string; name: string; kind: Kind; icon: string | null; color: string | null };
export type Transaction = {
  id: string;
  account_id: string;
  category_id: string | null;
  amount: number;
  kind: Kind | "transfer";
  occurred_at: string;
  note: string | null;
};

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = { cash: "نقد", card: "کارت", wallet: "کیف پول" };

function unwrap<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as T;
}

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: async () =>
      unwrap<Account[]>(await supabase.from("accounts").select("*").order("created_at")),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async () => unwrap<Category[]>(await supabase.from("categories").select("*").order("name")),
  });
}

export function useTransactions(range?: { from: Date; to: Date }, limit?: number) {
  return useQuery({
    queryKey: ["transactions", range?.from.toISOString(), range?.to.toISOString(), limit],
    queryFn: async () => {
      let q = supabase.from("transactions").select("*").order("occurred_at", { ascending: false });
      if (range) q = q.gte("occurred_at", range.from.toISOString()).lte("occurred_at", range.to.toISOString());
      if (limit) q = q.limit(limit);
      return unwrap<Transaction[]>(await q);
    },
  });
}

/** Aggregate totals across all transactions (lightweight columns only). */
export function useTotals() {
  return useQuery({
    queryKey: ["transactions", "totals"],
    queryFn: async () =>
      unwrap<Pick<Transaction, "amount" | "kind">[]>(await supabase.from("transactions").select("amount,kind")),
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));
}
