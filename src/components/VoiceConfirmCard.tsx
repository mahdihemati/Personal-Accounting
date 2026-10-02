import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatToman, jDate, parseAmount, toFa, groupDigits } from "@/lib/format";
import type { Account, Category } from "@/lib/data";
import type { PendingTx } from "@/lib/voice/tools";

export function VoiceConfirmCard({ pending, categories, accounts, onDecide, onChange }: {
  pending: PendingTx;
  categories: Category[];
  accounts: Account[];
  onDecide: (d: "confirm" | "cancel", p?: PendingTx) => Promise<{ ok: boolean; message: string }>;
  onChange: (p: PendingTx) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cat = categories.find((c) => c.id === pending.categoryId);
  const acc = accounts.find((a) => a.id === pending.accountId);

  async function go(d: "confirm" | "cancel") {
    setBusy(true); setErr(null);
    const res = await onDecide(d, pending);
    setBusy(false);
    if (!res.ok) setErr(res.message);
  }

  const selectCls = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

  return (
    <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-4 shadow-lg animate-in slide-in-from-bottom-4">
      <p className="mb-3 text-sm text-muted-foreground">{pending.kind === "income" ? "ثبت درآمد" : "ثبت هزینه"} — تأیید می‌کنید؟</p>
      {editing ? (
        <div className="space-y-2">
          <Input inputMode="numeric" value={pending.amount ? toFa(groupDigits(pending.amount)) : ""}
            onChange={(e) => onChange({ ...pending, amount: parseAmount(e.target.value) })} aria-label="مبلغ" />
          <select className={selectCls} value={pending.categoryId} aria-label="دسته"
            onChange={(e) => onChange({ ...pending, categoryId: e.target.value })}>
            {categories.filter((c) => c.kind === pending.kind).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className={selectCls} value={pending.accountId} aria-label="حساب"
            onChange={(e) => onChange({ ...pending, accountId: e.target.value })}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <Input value={pending.note} placeholder="یادداشت" onChange={(e) => onChange({ ...pending, note: e.target.value })} />
        </div>
      ) : (
        <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">مبلغ</dt><dd className="font-semibold">{formatToman(pending.amount)}</dd>
          <dt className="text-muted-foreground">دسته</dt><dd>{cat?.name ?? "—"}</dd>
          <dt className="text-muted-foreground">حساب</dt><dd>{acc?.name ?? "—"}</dd>
          <dt className="text-muted-foreground">تاریخ</dt><dd>{jDate(pending.occurredAt)}</dd>
          {pending.note && (<><dt className="text-muted-foreground">یادداشت</dt><dd>{pending.note}</dd></>)}
        </dl>
      )}
      {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
      <div className="mt-4 flex gap-2">
        <Button className="flex-1" disabled={busy || !pending.amount || !pending.categoryId || !pending.accountId} onClick={() => go("confirm")}>ثبت</Button>
        <Button variant="secondary" disabled={busy} onClick={() => setEditing((v) => !v)}>{editing ? "تمام" : "ویرایش"}</Button>
        <Button variant="ghost" disabled={busy} onClick={() => go("cancel")}>لغو</Button>
      </div>
    </div>
  );
}
