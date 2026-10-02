import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TransactionSheet } from "@/components/TransactionSheet";
import { supabase } from "@/integrations/supabase/client";
import type { Transaction } from "@/lib/data";
import type { TxPrefill } from "@/lib/ui-events";

/** Opens the transaction form from anywhere (alert toasts, decision cards). */
export function GlobalTransactionEditor() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [prefill, setPrefill] = useState<TxPrefill | null>(null);

  useEffect(() => {
    async function onEdit(e: Event) {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (!id) return;
      const { data, error } = await supabase.from("transactions").select("*").eq("id", id).maybeSingle();
      if (error || !data) { toast.error("تراکنش پیدا نشد"); return; }
      setPrefill(null);
      setEditing({ ...data, amount: Number(data.amount) } as Transaction);
      setOpen(true);
    }
    function onNew(e: Event) {
      const p = (e as CustomEvent<TxPrefill>).detail;
      if (!p) return;
      setEditing(null);
      setPrefill(p);
      setOpen(true);
    }
    window.addEventListener("app:edit-transaction", onEdit as EventListener);
    window.addEventListener("app:new-transaction", onNew as EventListener);
    return () => {
      window.removeEventListener("app:edit-transaction", onEdit as EventListener);
      window.removeEventListener("app:new-transaction", onNew as EventListener);
    };
  }, []);

  return <TransactionSheet open={open} onOpenChange={setOpen} editing={editing} prefill={prefill} />;
}
