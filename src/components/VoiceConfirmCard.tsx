import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JalaliDatePicker } from "@/components/JalaliDatePicker";
import { formatToman, groupDigits, parseAmount, toFa } from "@/lib/format";
import type { Account, Category } from "@/lib/data";
import { VOICE_CONFIRM_MAX, type PendingBatch, type PendingTx } from "@/lib/voice/tools";

type Result = { ok: boolean; message: string };

export function VoiceConfirmCard({ batch, categories, accounts, onDecide, onChange }: {
  batch: PendingBatch;
  categories: Category[];
  accounts: Account[];
  onDecide: (action: "confirm_all" | "cancel_all" | "remove_item", opts?: { index?: number; edited?: PendingBatch }) => Promise<Result>;
  onChange: (b: PendingBatch) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const total = batch.items.reduce((s, p) => s + (p.kind === "income" ? p.amount : -p.amount), 0);

  async function go(action: "confirm_all" | "cancel_all") {
    if (busy) return;
    setBusy(true); setErr(null);
    const res = await onDecide(action, { edited: batch });
    setBusy(false);
    if (!res.ok) setErr(res.message);
  }
  const patch = (i: number, p: Partial<PendingTx>) =>
    onChange({ ...batch, items: batch.items.map((it, j) => (j === i ? { ...it, ...p } : it)) });

  const selectCls = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

  return (
    <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-4 shadow-lg animate-in slide-in-from-bottom-4">
      <p className="mb-3 text-sm text-muted-foreground">
        {batch.items.length > 1 ? `${toFa(batch.items.length)} تراکنش — تأیید می‌کنید؟` : "این تراکنش ثبت شود؟"}
      </p>
      <ul className="max-h-[40vh] space-y-2 overflow-y-auto">
        {batch.items.map((p, i) => {
          const cat = categories.find((c) => c.id === p.categoryId);
          const acc = accounts.find((a) => a.id === p.accountId);
          return (
            <li key={p.idx} className="rounded-xl bg-muted/50 p-2.5">
              <div className="flex items-center gap-2">
                <button type="button" className="min-w-0 flex-1 text-right" onClick={() => setOpen(open === i ? null : i)}>
                  <span className={`font-semibold tabular-nums ${p.kind === "income" ? "text-income" : "text-expense"}`}>{formatToman(p.amount)}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {cat?.name ?? "بدون دسته"} · {acc?.name ?? "؟"}{p.note ? ` · ${p.note}` : ""}
                  </span>
                  {p.amount > VOICE_CONFIRM_MAX && <span className="block text-[11px] text-warning">فقط با لمس ثبت می‌شود</span>}
                </button>
                <Button size="icon" variant="ghost" aria-label="حذف ردیف" onClick={() => void onDecide("remove_item", { index: i })}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
              {open === i && (
                <div className="mt-2 space-y-2">
                  <Input inputMode="numeric" aria-label="مبلغ" value={p.amount ? groupDigits(p.amount) : ""}
                    onChange={(e) => patch(i, { amount: parseAmount(e.target.value) })} />
                  <select className={selectCls} aria-label="دسته" value={p.categoryId} onChange={(e) => patch(i, { categoryId: e.target.value })}>
                    {categories.filter((c) => c.kind === p.kind).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select className={selectCls} aria-label="حساب" value={p.accountId} onChange={(e) => patch(i, { accountId: e.target.value })}>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <JalaliDatePicker value={p.occurredAt} onChange={(d) => patch(i, { occurredAt: d })} />
                  <Input value={p.note} placeholder="یادداشت" onChange={(e) => patch(i, { note: e.target.value })} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
        <span className="text-muted-foreground">جمع کل</span>
        <span className="font-bold tabular-nums">{total < 0 ? "−" : "+"}{formatToman(Math.abs(total))}</span>
      </div>
      {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
      <div className="mt-3 flex gap-2">
        <Button className="h-11 flex-1 rounded-xl" disabled={busy} onClick={() => go("confirm_all")}>{busy ? "در حال ثبت…" : "تأیید و ثبت"}</Button>
        <Button variant="outline" className="h-11 rounded-xl" disabled={busy} onClick={() => go("cancel_all")}>لغو</Button>
      </div>
    </div>
  );
}
