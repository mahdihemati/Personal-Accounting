import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { JalaliDatePicker } from "@/components/JalaliDatePicker";
import { deleteNavasanKey, saveNavasanKey } from "@/lib/prices.functions";
import { updateIntegration, useAssetsSummary, useFetchUsage, useInvalidateAssets } from "@/lib/assets-data";
import { toFa, toEnDigits } from "@/lib/format";

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Settings > «اتصال قیمت‌ها (نوسان)». The key is sent once to the server and never shown again. */
export function NavasanSettings() {
  const { integration } = useAssetsSummary();
  const { data: usage } = useFetchUsage();
  const save = useServerFn(saveNavasanKey);
  const del = useServerFn(deleteNavasanKey);
  const invalidate = useInvalidateAssets();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [cap, setCap] = useState<string | null>(null);

  async function onSave() {
    setBusy(true);
    try {
      const r = await save({ data: { api_key: key } });
      if (r.ok) { toast.success(`متصل شد؛ کلید به ...${r.last4} ختم می‌شود`); setKey(""); }
      else toast.error(r.message);
    } catch { toast.error("ذخیره‌ی کلید ممکن نشد."); }
    setBusy(false);
    await invalidate();
  }
  async function onDelete() {
    setBusy(true);
    try { await del(); toast.success("کلید حذف شد"); } catch { toast.error("حذف ممکن نشد"); }
    setBusy(false);
    await invalidate();
  }
  async function patch(p: Parameters<typeof updateIntegration>[0]) {
    try { await updateIntegration(p); } catch (e) { toast.error((e as Error).message); }
    await invalidate();
  }

  return (
    <section className="space-y-4 rounded-3xl bg-card p-5">
      <div>
        <p className="font-semibold">اتصال قیمت‌ها (نوسان)</p>
        <p className="mt-1 text-xs leading-6 text-muted-foreground">
          کلید رایگان را از ربات تلگرام @navasan_contact_bot بگیر. پلن رایگان ۱۲۰ درخواست در ماه دارد، اپ حداکثر روزی ۳ بار قیمت‌ها را به‌روز می‌کند و کلید ۳ ماه اعتبار دارد و تمدید نمی‌شود.
        </p>
      </div>

      {integration?.key_status === "invalid" || integration?.key_status === "expired" ? (
        <p className="rounded-xl bg-destructive/15 p-3 text-sm text-destructive">کلید نامعتبر یا منقضی است، کلید جدید وارد کن</p>
      ) : integration ? (
        <p className="text-sm text-income">متصل، کلید به ...{integration.key_last4} ختم می‌شود</p>
      ) : null}

      <div className="flex gap-2">
        <Input type="password" autoComplete="off" dir="ltr" placeholder="کلید API" value={key} onChange={(e) => setKey(e.target.value)} className="h-11 rounded-xl" />
        <Button className="h-11 rounded-xl" disabled={busy || key.trim().length < 8} onClick={() => void onSave()}>ذخیره و بررسی</Button>
      </div>

      {integration && (
        <>
          <div className="space-y-1.5">
            <Label>اعتبار کلید تا (اختیاری)</Label>
            <JalaliDatePicker
              value={integration.expires_on ? new Date(`${integration.expires_on}T12:00:00`) : new Date()}
              onChange={(d) => void patch({ expires_on: isoDay(d) })}
            />
            {integration.expires_on && (
              <button className="text-xs text-muted-foreground underline" onClick={() => void patch({ expires_on: null })}>پاک کردن تاریخ</button>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>سقف درخواست ماهانه‌ی اپ</Label>
            <Input
              inputMode="numeric" className="h-11 rounded-xl"
              value={cap ?? toFa(integration.monthly_request_cap)}
              onChange={(e) => setCap(e.target.value)}
              onBlur={() => {
                if (cap == null) return;
                const n = Number(toEnDigits(cap).replace(/\D/g, ""));
                setCap(null);
                if (n >= 1 && n <= 10000 && n !== integration.monthly_request_cap) void patch({ monthly_request_cap: n });
              }}
            />
            <p className="text-xs text-muted-foreground">{toFa(usage?.used ?? 0)} از {toFa(integration.monthly_request_cap)} در ۳۰ روز اخیر</p>
          </div>
          <Button variant="outline" className="w-full rounded-xl" disabled={busy} onClick={() => void onDelete()}>حذف کلید</Button>
        </>
      )}
    </section>
  );
}
