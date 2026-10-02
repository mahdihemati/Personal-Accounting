import type { Category, Transaction } from "@/lib/data";
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
  const income = t.kind === "income";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-right transition-colors hover:bg-muted/60"
    >
      <span
        className="grid size-11 shrink-0 place-items-center rounded-xl text-base font-bold"
        style={{ backgroundColor: `${category?.color ?? "#64748b"}26`, color: category?.color ?? undefined }}
      >
        {category?.name.charAt(0) ?? "؟"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{category?.name ?? "بدون دسته"}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {t.note || (showDate ? jDate(t.occurred_at) : jDate(t.occurred_at, "HH:mm"))}
          {t.note && showDate ? ` · ${jDate(t.occurred_at)}` : ""}
        </span>
      </span>
      <span className={`shrink-0 font-semibold tabular-nums ${income ? "text-income" : "text-expense"}`}>
        {income ? "+" : "−"}
        {formatToman(t.amount)}
      </span>
    </button>
  );
}
