import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Gem } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateIntegration, useAssetsSummary, useInvalidateAssets } from "@/lib/assets-data";
import { ASSET_CATALOG } from "@/lib/assets-catalog";
import { formatToman, formatTomanShort, groupDigits } from "@/lib/format";

/** Home card: estimated net worth → /assets. */
export function NetWorthCard() {
  const { summary } = useAssetsSummary();
  if (!summary) return null;
  return (
    <Link to="/assets" className="flex items-center gap-3 rounded-3xl bg-card p-4">
      <Gem className="size-6 text-primary" />
      <div className="flex-1">
        <p className="text-xs text-muted-foreground">ثروت خالص (تخمین)</p>
        <p className="text-xl font-bold">
          {summary.net_worth_estimate_toman == null ? "—" : formatTomanShort(summary.net_worth_estimate_toman)}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {summary.count === 0 ? "دارایی‌ها: هنوز چیزی ثبت نشده" : "بدون احتساب بدهی"}
        </p>
      </div>
    </Link>
  );
}

/** First successful fetch: ask whether Navasan numbers are toman or rial. */
export function UnitConfirmCard() {
  const { integration, prices } = useAssetsSummary();
  const invalidate = useInvalidateAssets();
  if (!integration || integration.unit_confirmed || !prices.length) return null;
  const usd = prices.find((p) => p.symbol === "usd_sell");
  const coin = prices.find((p) => ["sekkeh", "bahar", "nim", "rob", "gerami"].includes(p.symbol));
  async function pick(divisor: 1 | 10) {
    try { await updateIntegration({ unit_divisor: divisor, unit_confirmed: true }); } catch (e) { toast.error((e as Error).message); }
    await invalidate();
  }
  return (
    <section className="space-y-3 rounded-3xl border border-primary/40 bg-card p-5">
      <p className="font-semibold">این قیمت‌ها به تومان درست‌اند؟</p>
      <ul className="space-y-1 text-sm">
        {usd && <li>دلار آمریکا: {groupDigits(usd.value_raw)}</li>}
        {coin && <li>{ASSET_CATALOG[coin.symbol as keyof typeof ASSET_CATALOG].name}: {groupDigits(coin.value_raw)}</li>}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <Button className="rounded-xl" onClick={() => void pick(1)}>بله، تومان است</Button>
        <Button variant="outline" className="rounded-xl" onClick={() => void pick(10)}>این عدد ریال است</Button>
      </div>
      {usd && <p className="text-[11px] text-muted-foreground">اگر ریال باشد، دلار {formatToman(Math.round(usd.value_raw / 10))} حساب می‌شود.</p>}
    </section>
  );
}
