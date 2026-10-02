import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteTelegramBot, getTelegramStatus, refreshTelegram, saveTelegramToken } from "@/lib/telegram.functions";

/** Settings > «ربات تلگرام». The token is sent once and never shown again. */
export function TelegramSettings() {
  const qc = useQueryClient();
  const statusFn = useServerFn(getTelegramStatus);
  const save = useServerFn(saveTelegramToken);
  const refresh = useServerFn(refreshTelegram);
  const del = useServerFn(deleteTelegramBot);
  const { data: st } = useQuery({ queryKey: ["telegram-status"], queryFn: () => statusFn() });
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>, okMsg: string) {
    setBusy(true);
    try {
      const r = await fn();
      if (r.ok) toast.success(okMsg); else toast.error(r.message ?? "انجام نشد");
    } catch { toast.error("انجام نشد"); }
    setBusy(false);
    await qc.invalidateQueries({ queryKey: ["telegram-status"] });
  }

  return (
    <section className="space-y-3 rounded-2xl bg-card p-4">
      <h2 className="font-semibold">ربات تلگرام</h2>
      <p className="text-xs text-muted-foreground">
        خرج و درآمدت را در تلگرام بنویس یا ویس بفرست؛ ربات با دکمه‌ی «تأیید» ثبتش می‌کند.
      </p>
      {!st?.connected ? (
        <div className="space-y-2">
          <Label htmlFor="tg-token">توکن ربات (از BotFather)</Label>
          <Input id="tg-token" dir="ltr" autoComplete="off" placeholder="123456789:AA..." value={token} onChange={(e) => setToken(e.target.value)} />
          <p className="text-[11px] text-muted-foreground">این کار را در نسخه‌ی منتشرشده‌ی برنامه انجام بده تا تلگرام بتواند به آن پیام بفرستد.</p>
          <Button className="w-full" disabled={busy || !token.trim()}
            onClick={() => run(async () => { const r = await save({ data: { token } }); if (r.ok) setToken(""); return r; }, "ربات ذخیره شد")}>
            {busy ? "در حال بررسی…" : "ذخیره و اتصال"}
          </Button>
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <p>ربات: <span dir="ltr">@{st.bot_username ?? "?"}</span> · توکن ...{st.last4}</p>
          {st.linked ? (
            <p className="text-income">✓ چت تلگرام به حسابت وصل است.</p>
          ) : st.link_url ? (
            <div className="space-y-1">
              <p>برای اتصال، این لینک را باز کن و Start را بزن (۱۰ دقیقه اعتبار):</p>
              <a href={st.link_url} target="_blank" rel="noreferrer" className="block break-all rounded-lg bg-muted p-2 text-primary" dir="ltr">{st.link_url}</a>
            </div>
          ) : (
            <p className="text-muted-foreground">کد اتصال منقضی شد؛ «اتصال دوباره» را بزن.</p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" disabled={busy} onClick={() => run(() => refresh(), "اتصال تازه شد")}>اتصال دوباره</Button>
            <Button variant="outline" className="text-expense" disabled={busy} onClick={() => run(() => del(), "ربات حذف شد")}>حذف</Button>
          </div>
        </div>
      )}
    </section>
  );
}
