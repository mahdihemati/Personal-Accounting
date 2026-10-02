/** Telegram bot settings: save/verify the user's bot token, link a chat, disconnect. Identity only from the JWT. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware";

export type TelegramStatus =
  | { connected: false }
  | { connected: true; last4: string; bot_username: string | null; linked: boolean; link_url: string | null; link_expires: string | null; webhook_url: string | null };

export type TelegramResult = { ok: true } | { ok: false; message: string };

async function admin() {
  const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
  return getSupabaseAdmin();
}

export const getTelegramStatus = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<TelegramStatus> => {
    const { data } = await (await admin()).from("telegram_links")
      .select("token_last4,bot_username,chat_id,link_code,link_code_expires,webhook_url").eq("user_id", context.userId).maybeSingle();
    if (!data) return { connected: false };
    const live = data.link_code && data.link_code_expires && new Date(data.link_code_expires) > new Date();
    return {
      connected: true, last4: data.token_last4, bot_username: data.bot_username, linked: data.chat_id != null,
      link_url: live && data.bot_username ? `https://t.me/${data.bot_username}?start=${data.link_code}` : null,
      link_expires: live ? data.link_code_expires : null, webhook_url: data.webhook_url,
    };
  });

async function registerWebhook(token: string, webhookId: string, secret: string) {
  const s = await import("./telegram.server");
  const { getRequestUrl } = await import("@tanstack/react-start/server");
  const origin = s.publicOrigin(getRequestUrl().origin);
  if (!origin.startsWith("https://")) return { ok: false as const, message: "آدرس سایت HTTPS نیست؛ این کار را در نسخه‌ی منتشرشده انجام بده." };
  const url = `${origin}/api/public/telegram/${webhookId}`;
  const r = await s.tg(token, "setWebhook", { url, secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
  if (!r.ok) return { ok: false as const, message: "ثبت وب‌هوک در تلگرام ممکن نشد: " + (r.description ?? "") };
  return { ok: true as const, url };
}

export const saveTelegramToken = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ token: z.string().max(200) }).parse(d))
  .handler(async ({ data, context }): Promise<TelegramResult> => {
    const token = data.token.trim();
    if (!/^\d{5,15}:[A-Za-z0-9_-]{30,60}$/.test(token)) return { ok: false, message: "قالب توکن درست نیست (مثل 123456:ABC...)." };
    const s = await import("./telegram.server");
    const p = await import("./prices.server");
    if (!p.hasEncryptionKey()) return { ok: false, message: "کلید رمزنگاری سرور تنظیم نشده است." };
    const me = await s.tg<{ username?: string; is_bot?: boolean }>(token, "getMe");
    if (!me.ok || !me.result?.is_bot) return { ok: false, message: "توکن نامعتبر است." };

    const db = await admin();
    const { data: prev } = await db.from("telegram_links").select("webhook_id,bot_token_encrypted").eq("user_id", context.userId).maybeSingle();
    const secret = s.randomToken(24);
    const webhookId = prev?.webhook_id ?? crypto.randomUUID();
    const reg = await registerWebhook(token, webhookId, secret);
    if (!reg.ok) return reg;
    const code = s.randomToken(8);
    const row = {
      user_id: context.userId, webhook_id: webhookId, webhook_secret: secret, bot_token_encrypted: await p.encryptKey(token),
      token_last4: token.slice(-4), bot_username: me.result.username ?? null, webhook_url: reg.url,
      link_code: code, link_code_expires: new Date(Date.now() + 10 * 60_000).toISOString(), updated_at: new Date().toISOString(),
      // A different bot means a different chat: relink.
      ...(prev ? {} : { chat_id: null }),
    };
    const { error } = await db.from("telegram_links").upsert(row, { onConflict: "user_id" });
    if (error) return { ok: false, message: "ذخیره ممکن نشد." };
    if (prev) {
      const old = await p.decryptKey(prev.bot_token_encrypted).catch(() => null);
      if (old && old.split(":")[0] !== token.split(":")[0]) {
        await db.from("telegram_links").update({ chat_id: null }).eq("user_id", context.userId);
        await s.tg(old, "deleteWebhook");
      }
    }
    return { ok: true };
  });

/** Re-register the webhook with the current site address and issue a fresh link code. */
export const refreshTelegram = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<TelegramResult> => {
    const s = await import("./telegram.server");
    const p = await import("./prices.server");
    const db = await admin();
    const { data } = await db.from("telegram_links").select("webhook_id,bot_token_encrypted").eq("user_id", context.userId).maybeSingle();
    if (!data) return { ok: false, message: "ربات وصل نیست." };
    const token = await p.decryptKey(data.bot_token_encrypted).catch(() => null);
    if (!token) return { ok: false, message: "توکن قابل خواندن نیست؛ دوباره واردش کن." };
    const secret = s.randomToken(24);
    const reg = await registerWebhook(token, data.webhook_id, secret);
    if (!reg.ok) return reg;
    await db.from("telegram_links").update({
      webhook_secret: secret, webhook_url: reg.url, link_code: s.randomToken(8),
      link_code_expires: new Date(Date.now() + 10 * 60_000).toISOString(), updated_at: new Date().toISOString(),
    }).eq("user_id", context.userId);
    return { ok: true };
  });

export const deleteTelegramBot = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<TelegramResult> => {
    const s = await import("./telegram.server");
    const p = await import("./prices.server");
    const db = await admin();
    const { data } = await db.from("telegram_links").select("bot_token_encrypted").eq("user_id", context.userId).maybeSingle();
    if (data) {
      const token = await p.decryptKey(data.bot_token_encrypted).catch(() => null);
      if (token) await s.tg(token, "deleteWebhook");
    }
    await db.from("telegram_drafts").delete().eq("user_id", context.userId);
    await db.from("telegram_links").delete().eq("user_id", context.userId);
    return { ok: true };
  });
