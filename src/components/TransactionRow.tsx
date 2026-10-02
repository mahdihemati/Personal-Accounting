import { useAccounts, type Category, type Transaction } from "@/lib/data";
import { formatToman, jDate } from "@/lib/format";

export function TransactionRow({
  t,
  category,
  onClick,
  showDate,
}: {
  t: Transaction;
  category?: Category | undefined;
  onClick?: () => void;
  showDate?: boolean;
}) {
  const { data: accounts = [] } = useAccounts();
  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name;
  const income = t.kind === "income";
  const transfer = t.kind === "transfer";
  const title = transfer
    ? `انتقال: ${accountName(t.account_id) ?? "؟"} ← ${accountName(t.to_account_id) ?? "؟"}`
    : category?.name ?? "بدون دسته";
  const color = transfer ? "#64748b" : category?.color ?? "#64748b";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-right transition-colors hover:bg-muted/60"
    >
      <span
        className="grid size-11 shrink-0 place-items-center rounded-xl text-base font-bold"
        style={{ backgroundColor: `${color}26`, color }}
      >
        {transfer ? "⇄" : category?.name.charAt(0) ?? "؟"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {t.note || (showDate ? jDate(t.occurred_at) : jDate(t.occurred_at, "HH:mm"))}
          {t.note && showDate ? ` · ${jDate(t.occurred_at)}` : ""}
        </span>
      </span>
      <span className={`shrink-0 font-semibold tabular-nums ${transfer ? "text-muted-foreground" : income ? "text-income" : "text-expense"}`}>
        {transfer ? "" : income ? "+" : "−"}
        {formatToman(t.amount)}
      </span>
    </button>
  );
}
