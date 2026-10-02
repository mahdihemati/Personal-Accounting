import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { DecisionRow } from "@/lib/metrics/types";
import { updateDecision, useDecisions } from "@/lib/metrics-data";
import { openTransactionPrefill } from "@/lib/ui-events";
import { formatToman } from "@/lib/format";

export const dueForReview = (d: DecisionRow, now = Date.now()) =>
  !!d.review_at && !d.review_rating && d.choice !== "skipped" && new Date(d.review_at).getTime() <= now;

/** Shows one decision whose review date has come. */
export function DecisionReviewCard() {
  const { data = [] } = useDecisions();
  const qc = useQueryClient();
  const d = data.find((x) => dueForReview(x));
  if (!d) return null;

  async function patch(p: Partial<DecisionRow>, msg: string) {
    try { await updateDecision(d!.id, p); toast.success(msg); }
    catch (e) { toast.error((e as Error).message); }
    await qc.invalidateQueries({ queryKey: ["decisions"] });
  }
  const week = () => new Date(Date.now() + 7 * 86_400_000).toISOString();

  return (
    <section className="space-y-3 rounded-3xl bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="font-semibold">مرور یک تصمیم</p>
        <Link to="/decisions" className="text-xs text-primary">دفتر تصمیم</Link>
      </div>
      {d.choice === "bought" ? (
        <>
          <p className="text-sm leading-7">«{d.title}» را {formatToman(d.amount_toman)} خریدی. حالا که گذشته، ارزشش را داشت؟</p>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="secondary" className="rounded-xl" onClick={() => void patch({ review_rating: "worth" }, "ثبت شد")}>ارزشش را داشت</Button>
            <Button variant="secondary" className="rounded-xl" onClick={() => void patch({ review_rating: "neutral" }, "ثبت شد")}>فرقی نکرد</Button>
            <Button variant="secondary" className="rounded-xl" onClick={() => void patch({ review_rating: "regret" }, "ثبت شد؛ دفعه‌ی بعد کمکت می‌کند")}>پشیمانم</Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm leading-7">خرید «{d.title}» ({formatToman(d.amount_toman)}) را عقب انداختی. هنوز می‌خواهی‌اش؟</p>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="secondary" className="rounded-xl" onClick={() => {
              void patch({ choice: "bought", review_at: new Date(Date.now() + 30 * 86_400_000).toISOString() }, "ثبت شد");
              openTransactionPrefill({ amount: d.amount_toman, category_id: d.category_id, note: d.title, decision_id: d.id });
            }}>خریدمش</Button>
            <Button variant="secondary" className="rounded-xl" onClick={() => void patch({ choice: "skipped", review_at: null }, "عالی؛ ثبت شد")}>دیگر نمی‌خواهم</Button>
            <Button variant="secondary" className="rounded-xl" onClick={() => void patch({ review_at: week() }, "یک هفته‌ی دیگر می‌پرسیم")}>هفته‌ی بعد</Button>
          </div>
        </>
      )}
    </section>
  );
}
