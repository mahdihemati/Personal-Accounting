import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AccountType = "cash" | "card" | "wallet";
export type Kind = "income" | "expense";
export type Account = { id: string; name: string; type: AccountType; initial_balance: number; created_at: string };
export type Category = { id: string; name: string; kind: Kind; icon: string | null; color: string | null };
export type Transaction = {
  id: string;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  amount: number;
  kind: Kind | "transfer";
  occurred_at: string;
  note: string | null;
};

/** Live balance per account: initial + income − expense ± transfers. */
export function useAccountBalances() {
  const { data: accounts = [] } = useAccounts();
  const q = useQuery({
    queryKey: ["transactions", "balances"],
    queryFn: async () =>
      unwrap<Pick<Transaction, "amount" | "kind" | "account_id" | "to_account_id">[]>(
        await supabase.from("transactions").select("amount,kind,account_id,to_account_id"),
      ),
  });
  const map = new Map<string, number>(accounts.map((a) => [a.id, Number(a.initial_balance)]));
  for (const t of q.data ?? []) {
    const add = (id: string | null, v: number) => { if (id && map.has(id)) map.set(id, map.get(id)! + v); };
    if (t.kind === "income") add(t.account_id, t.amount);
    else if (t.kind === "expense") add(t.account_id, -t.amount);
    else { add(t.account_id, -t.amount); add(t.to_account_id, t.amount); }
  }
  return map;
}

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

export type Budget = { id: string; category_id: string; month: string; limit_amount: number };

/** Budget month key: Gregorian yyyy-MM-dd of the Jalali month's first day (local time). */
export function budgetMonthKey(jalaliMonthStart: Date): string {
  const d = jalaliMonthStart;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function useBudgets(monthStart: Date) {
  const key = budgetMonthKey(monthStart);
  return useQuery({
    queryKey: ["budgets", key],
    queryFn: async () =>
      unwrap<Budget[]>(await supabase.from("budgets").select("id,category_id,month,limit_amount").eq("month", key)),
  });
}

export type BudgetProgress = { budget: Budget; spent: number; ratio: number };

/** Spent vs limit per budgeted category for a Jalali month (expenses only; transfers excluded). */
export function useBudgetProgress(range: { from: Date; to: Date }) {
  const budgets = useBudgets(range.from);
  const txs = useTransactions(range);
  const spentBy = new Map<string, number>();
  for (const t of txs.data ?? []) {
    if (t.kind === "expense" && t.category_id) spentBy.set(t.category_id, (spentBy.get(t.category_id) ?? 0) + t.amount);
  }
  const items: BudgetProgress[] = (budgets.data ?? []).map((b) => {
    const spent = spentBy.get(b.category_id) ?? 0;
    return { budget: b, spent, ratio: b.limit_amount ? spent / b.limit_amount : 0 };
  });
  return { items, isLoading: budgets.isLoading || txs.isLoading };
}

export function budgetTone(ratio: number): "ok" | "warn" | "over" {
  return ratio > 1 ? "over" : ratio >= 0.8 ? "warn" : "ok";
}
