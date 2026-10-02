import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { PurchaseCheckButton } from "@/components/PurchaseCheck";
import { useDecisions } from "@/lib/metrics-data";
import type { DecisionRow } from "@/lib/metrics/types";
import { formatToman, formatTomanShort, jDate, toFa } from "@/lib/format";

export const Route = createFileRoute("/_app/decisions")({
  head: () => ({
    meta: [
      { title: "دفتر تصمیم | حسابداری شخصی" },
      { name: "description", content: "خریدهایی که انجام دادی، عقب انداختی یا از آن‌ها گذشتی و حس تو بعد از آن." },
      { property: "og:title", content: "دفتر تصمیم خرید" },
      { property: "og:description", content: "مرور تصمیم‌های خرید و درس گرفتن از آن‌ها." },
    ],
  }),
  component: DecisionsPage,
});

const CHOICE: Record<DecisionRow["choice"], string> = { bought: "خریدم", postponed: "عقب انداختم", skipped: "نخریدم" };
const RATING: Record<NonNullable<DecisionRow["review_rating"]>, string> = { worth: "ارزشش را داشت", neutral: "فرقی نکرد", regret: "پشیمانم" };

function DecisionsPage() {
  const { data = [], isLoading } = useDecisions();
  const skippedSum = data.filter((d) => d.choice === "skipped").reduce((s, d) => s + d.amount_toman, 0);
  const reviewed = data.filter((d) => d.review_rating);
  const regret = reviewed.filter((d) => d.review_rating === "regret").length;

  return (
    <main className="space-y-5 px-5 pt-8">
      <header className="flex items-center gap-2">
        <Link to="/insights" aria-label="بازگشت" className="text-muted-foreground"><ChevronRight /></Link>
        <h1 className="text-2xl font-bold">دفتر تصمیم</h1>
      </header>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-3xl bg-card p-4">
          <p className="text-xs text-muted-foreground">خریدهایی که نکردی</p>
          <p className="mt-1 text-xl font-bold text-income">{formatTomanShort(skippedSum)}</p>
        </div>
        <div className="rounded-3xl bg-card p-4">
          <p className="text-xs text-muted-foreground">پشیمانی از خریدهای مرورشده</p>
          <p className="mt-1 text-xl font-bold">{reviewed.length ? `${toFa(regret)} از ${toFa(reviewed.length)}` : "—"}</p>
        </div>
      </section>

      <PurchaseCheckButton />

      <section className="rounded-3xl bg-card p-2">
        {isLoading ? null : data.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">هنوز تصمیمی ثبت نکرده‌ای. قبل از خرید بعدی، «قبل از خرید» را امتحان کن.</p>
        ) : data.map((d) => (
          <div key={d.id} className="flex items-start justify-between gap-3 rounded-2xl px-3 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{d.title}</p>
              <p className="text-xs text-muted-foreground">{jDate(d.decided_at)} · {CHOICE[d.choice]}{d.review_rating ? ` · ${RATING[d.review_rating]}` : ""}</p>
              {d.reason && <p className="mt-1 text-xs text-muted-foreground">«{d.reason}»</p>}
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums">{formatToman(d.amount_toman)}</span>
          </div>
        ))}
      </section>
    </main>
  );
}
