import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { JalaliDatePicker } from "@/components/JalaliDatePicker";
import { UnitConfirmCard } from "@/components/AssetCards";
import { ASSET_CATALOG, ASSET_SYMBOLS, MIN_REFRESH_MS, STALE_PRICE_HOURS } from "@/lib/assets-catalog";
import { deleteAsset, saveAsset, useAssetsSummary, useFetchUsage, useInvalidateAssets, type AssetsSummary } from "@/lib/assets-data";
import { refreshPrices } from "@/lib/prices.functions";
import { formatToman, formatTomanShort, groupDigits, parseAmount, toEnDigits, toFa } from "@/lib/format";

export const Route = createFileRoute("/_app/assets")({
  head: () => ({
    meta: [
      { title: "دارایی‌ها | حسابداری شخصی" },
      { name: "description", content: "ارزش تخمینی ارز، سکه و طلا با قیمت‌های سرویس نوسان." },
      { property: "og:title", content: "دارایی‌ها | حسابداری شخصی" },
      { property: "og:description", content: "ارزش تخمینی ارز، سکه و طلا با قیمت‌های سرویس نوسان." },
    ],
  }),
  component: AssetsPage,
});

type Item = AssetsSummary["items"][number];
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const qty = (n: number) => toFa(String(Math.round(n * 10000) / 10000)).replace(".", "٫");

function AssetsPage() {
  const { summary, integration, isLoading } = useAssetsSummary();
  const { data: usage } = useFetchUsage();
  const refresh = useServerFn(refreshPrices);
  const invalidate = useInvalidateAssets();
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  if (isLoading || !summary) return <main className="px-5 pt-8 text-muted-foreground">در حال بارگذاری…</main>;

  const nextAt = usage?.last_ok_at ? new Date(usage.last_ok_at).getTime() + MIN_REFRESH_MS : 0;
  const wait = Math.max(0, nextAt - now);
  const active = integration?.key_status === "active";
  const pendingUnit = !!integration && !integration.unit_confirmed;
  const daysToExpiry = integration?.expires_on ? Math.ceil((new Date(`${integration.expires_on}T23:59:59`).getTime() - now) / 86_400_000) : null;

  async function onRefresh() {
    setBusy(true);
    try {
      const r = await refresh({ data: { trigger: "manual" } });
      if (r.status === "ok") toast.success(`قیمت ${toFa(r.updated_symbols.length)} مورد به‌روز شد`);
      else if (r.status === "skipped" && r.skipped === "daily_cap") {
        const t = r.next_allowed_at ? new Date(r.next_allowed_at).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }) : "";
        toast.message(`امروز به سقف ۳ به‌روزرسانی رسیدی${t ? `؛ به‌روزرسانی بعدی از ساعت ${t}` : ""}`);
      }
      else if (r.status === "skipped") toast.message("هنوز زمان به‌روزرسانی بعدی نرسیده");
      else toast.error(r.message);
    } catch { toast.error("دریافت قیمت ممکن نشد."); }
    setBusy(false);
    await invalidate();
  }
  const fmtWait = (ms: number) => {
    const s = Math.ceil(ms / 1000);
    return toFa(`${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`);
  };

  return (
    <main className="space-y-5 px-5 pt-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">دارایی‌ها</h1>
        <Button size="icon" className="size-11 rounded-2xl" onClick={() => setEditing("new")} aria-label="دارایی جدید"><Plus /></Button>
      </header>

      <section className="rounded-3xl bg-card p-5">
        <p className="text-xs text-muted-foreground">ثروت خالص (تخمین)</p>
        <p className="mt-1 text-3xl font-extrabold">{summary.net_worth_estimate_toman == null ? "—" : formatTomanShort(summary.net_worth_estimate_toman)}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">بدون احتساب بدهی</p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs text-muted-foreground">نقد</p><p className="font-semibold">{formatTomanShort(summary.liquid_balance_toman)}</p></div>
          <div><p className="text-xs text-muted-foreground">دارایی‌ها</p><p className="font-semibold">
            {summary.assets_total_toman == null ? (pendingUnit ? "در انتظار تأیید واحد" : "—") : formatTomanShort(summary.assets_total_toman)}
          </p></div>
        </div>
      </section>

      {daysToExpiry != null && daysToExpiry <= 7 && (
        <section className="flex items-start gap-3 rounded-3xl border border-warning/50 bg-card p-4 text-sm">
          <AlertTriangle className="size-5 shrink-0 text-warning" />
          <p>{daysToExpiry <= 0 ? "اعتبار کلید نوسان تمام شده؛ کلید جدید بگیر." : `اعتبار کلید نوسان ${toFa(daysToExpiry)} روز دیگر تمام می‌شود.`}</p>
        </section>
      )}

      {!integration && (
        <Link to="/settings" className="block rounded-3xl border border-primary/40 bg-card p-4 text-sm">
          برای دیدن ارزش لحظه‌ای، کلید نوسان را وصل کن
        </Link>
      )}
      {integration && !active && (
        <Link to="/settings" className="block rounded-3xl bg-destructive/15 p-4 text-sm text-destructive">کلید نامعتبر یا منقضی است، کلید جدید وارد کن</Link>
      )}

      <UnitConfirmCard />

      <section className="rounded-3xl bg-card p-2">
        {summary.items.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">هنوز دارایی‌ای ثبت نشده</p>
        ) : summary.items.map((i) => (
          <div key={i.id} className="flex items-center gap-3 border-b border-border px-3 py-3 last:border-0">
            <div className="flex-1">
              <p className="font-medium">{i.label ? `${i.name} · ${i.label}` : i.name}</p>
              <p className="text-xs text-muted-foreground">
                {qty(i.quantity)} {i.unit}
                {i.unit_price_toman != null && ` · هر ${i.unit} ${formatToman(i.unit_price_toman)}`}
                {i.price_age_hours != null && i.price_age_hours > STALE_PRICE_HOURS && <span className="mr-1 text-warning">قدیمی</span>}
              </p>
              {i.gain_toman != null && (
                <p className="text-[11px] text-muted-foreground">اختلاف نسبت به قیمت خرید: {i.gain_toman >= 0 ? "+" : ""}{formatToman(i.gain_toman)}</p>
              )}
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold">
                {i.value_toman != null ? formatTomanShort(i.value_toman) : integration && pendingUnit ? <span className="text-xs text-muted-foreground">در انتظار تأیید واحد</span> : "—"}
              </p>
              <div className="mt-1 flex justify-end gap-1">
                <Button size="icon" variant="ghost" className="size-7" onClick={() => setEditing(i)} aria-label="ویرایش"><Pencil className="size-3.5" /></Button>
                <Button size="icon" variant="ghost" className="size-7" aria-label="حذف" onClick={async () => {
                  try { await deleteAsset(i.id); } catch (e) { toast.error((e as Error).message); }
                  await invalidate();
                }}><Trash2 className="size-3.5" /></Button>
              </div>
            </div>
          </div>
        ))}
      </section>

      {integration && (
        <section className="space-y-2 rounded-3xl bg-card p-4 text-sm">
          <p className="text-muted-foreground">
            قیمت‌ها: {summary.oldest_price_age_hours == null ? "هنوز دریافت نشده" : `${toFa(Math.round(summary.oldest_price_age_hours))} ساعت پیش`} (نوسان)
          </p>
          <Button className="w-full rounded-xl" disabled={!active || busy || wait > 0} onClick={() => void onRefresh()}>
            <RefreshCw className="size-4" />{wait > 0 ? `به‌روزرسانی قیمت (${fmtWait(wait)})` : "به‌روزرسانی قیمت"}
          </Button>
          <p className="text-xs text-muted-foreground">{toFa(usage?.used ?? 0)} از {toFa(integration.monthly_request_cap)} سقف مصرف شد</p>
        </section>
      )}

      <AssetDialog item={editing} onClose={() => setEditing(null)} onSaved={invalidate} />
    </main>
  );
}

function AssetDialog({ item, onClose, onSaved }: { item: Item | "new" | null; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const editing = item && item !== "new" ? item : null;
  const [symbol, setSymbol] = useState("usd_sell");
  const [quantity, setQuantity] = useState("");
  const [label, setLabel] = useState("");
  const [acquired, setAcquired] = useState<Date | null>(null);
  const [cost, setCost] = useState("");
  useEffect(() => {
    if (!item) return;
    setSymbol(editing?.symbol ?? "usd_sell");
    setQuantity(editing ? toFa(String(editing.quantity)) : "");
    setLabel(editing?.label ?? "");
    setAcquired(editing?.acquired_on ? new Date(`${editing.acquired_on}T12:00:00`) : null);
    setCost(editing?.cost_basis_toman != null ? groupDigits(editing.cost_basis_toman) : "");
  }, [item]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    const q = Number(toEnDigits(quantity).replace(/[٫/]/g, ".").replace(/[^\d.]/g, ""));
    if (!Number.isFinite(q) || q <= 0) { toast.error("مقدار باید بیشتر از صفر باشد"); return; }
    const c = cost.trim() ? parseAmount(cost) : null;
    try {
      await saveAsset(editing?.id ?? null, {
        symbol, quantity: Math.round(q * 10000) / 10000, label: label.trim() ? label.trim().slice(0, 80) : null,
        acquired_on: acquired ? isoDay(acquired) : null, cost_basis_toman: c,
      });
      await onSaved();
      onClose();
    } catch (e) { toast.error((e as Error).message); }
  }

  const unit = ASSET_CATALOG[symbol as keyof typeof ASSET_CATALOG]?.unit;
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-3xl">
        <DialogHeader><DialogTitle>{editing ? "ویرایش دارایی" : "دارایی جدید"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>نوع</Label>
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>{ASSET_SYMBOLS.map((s) => <SelectItem key={s} value={s}>{ASSET_CATALOG[s].name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>مقدار ({unit})</Label><Input inputMode="decimal" className="h-11 rounded-xl" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>برچسب (اختیاری)</Label><Input className="h-11 rounded-xl" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>تاریخ خرید (اختیاری)</Label>
            <JalaliDatePicker value={acquired ?? new Date()} onChange={setAcquired} />
            {acquired && <button className="text-xs text-muted-foreground underline" onClick={() => setAcquired(null)}>بدون تاریخ</button>}
          </div>
          <div className="space-y-1.5">
            <Label>قیمت خرید کل به تومان (اختیاری)</Label>
            <Input inputMode="numeric" className="h-11 rounded-xl" value={cost} onChange={(e) => { const n = parseAmount(e.target.value); setCost(n ? groupDigits(n) : ""); }} />
          </div>
          <Button className="h-11 w-full rounded-xl" onClick={() => void submit()}>ذخیره</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
