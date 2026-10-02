/** navasan-key and refresh-prices. The only place that talks to Navasan; user id comes only from the JWT. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware";
import { MIN_REFRESH_MS } from "./assets-catalog";

async function status(code: number) {
  const { setResponseStatus } = await import("@tanstack/react-start/server");
  setResponseStatus(code);
}

export type SaveKeyResult = { ok: true; last4: string } | { ok: false; message: string; need_secret?: boolean };

export const saveNavasanKey = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ api_key: z.string().max(200) }).parse(d))
  .handler(async ({ data, context }): Promise<SaveKeyResult> => {
    const s = await import("./prices.server");
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const key = data.api_key.trim();
    if (key.length < 8 || key.length > 100 || !/^[A-Za-z0-9_\-:]+$/.test(key)) {
      await status(400);
      return { ok: false, message: "قالب کلید درست نیست." };
    }
    if (!s.hasEncryptionKey()) {
      await status(500);
      return { ok: false, message: "کلید رمزنگاری سرور تنظیم نشده است.", need_secret: true };
    }
    const r = await s.navasanGet("usage", key);
    await s.logFetch(context.userId, "validate", r.status, r.status === 200, s.errorCodeOf(r.status, r.body));
    if (r.status === 401) { await status(400); return { ok: false, message: "کلید نامعتبر است" }; }
    if (r.status === 429 || r.status === 503) { await status(503); return { ok: false, message: "سرویس نوسان الان جواب نمی‌دهد یا سهمیه‌ات تمام شده، بعدا امتحان کن" }; }
    if (r.status !== 200) { await status(502); return { ok: false, message: "بررسی کلید ممکن نشد. کمی بعد دوباره امتحان کن." }; }

    const admin = getSupabaseAdmin();
    const enc = await s.encryptKey(key);
    const last4 = key.slice(-4);
    const now = new Date().toISOString();
    const e1 = await admin.from("user_secrets").upsert({ user_id: context.userId, provider: "navasan", api_key_encrypted: enc }, { onConflict: "user_id" });
    const e2 = await admin.from("user_integrations").upsert({ user_id: context.userId, provider: "navasan", key_last4: last4, key_status: "active", updated_at: now }, { onConflict: "user_id" });
    if (e1.error || e2.error) { await status(500); return { ok: false, message: "ذخیره‌ی کلید ممکن نشد." }; }
    return { ok: true, last4 };
  });

export const deleteNavasanKey = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    await admin.from("user_secrets").delete().eq("user_id", context.userId);
    await admin.from("user_integrations").delete().eq("user_id", context.userId);
    return { ok: true };
  });

export type RefreshResult =
  | { status: "ok"; updated_symbols: string[]; fetched_at: string; requests_used_30d: number; cap: number }
  | { status: "skipped"; skipped: "too_soon" | "no_assets"; next_allowed_at?: string }
  | { status: "error"; code: string; message: string };

export const refreshPrices = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ trigger: z.enum(["auto", "manual"]) }).parse(d))
  .handler(async ({ data, context }): Promise<RefreshResult> => {
    const s = await import("./prices.server");
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const uid = context.userId;

    // 1. active key
    const [{ data: integ }, { data: sec }] = await Promise.all([
      admin.from("user_integrations").select("key_status,monthly_request_cap").eq("user_id", uid).maybeSingle(),
      admin.from("user_secrets").select("api_key_encrypted").eq("user_id", uid).maybeSingle(),
    ]);
    if (!integ || !sec || integ.key_status !== "active") {
      await status(409);
      return { status: "error", code: "no_key", message: integ?.key_status === "invalid" ? "کلید نامعتبر یا منقضی است، کلید جدید وارد کن" : "کلید نوسان وصل نیست." };
    }
    // 2. at least 2h since last successful fetch
    const { data: last } = await admin.from("price_fetch_log").select("fetched_at").eq("user_id", uid).eq("ok", true)
      .in("trigger", ["auto", "manual"]).order("fetched_at", { ascending: false }).limit(1).maybeSingle();
    if (last) {
      const next = new Date(last.fetched_at).getTime() + MIN_REFRESH_MS;
      if (Date.now() < next) return { status: "skipped", skipped: "too_soon", next_allowed_at: new Date(next).toISOString() };
    }
    // 3. monthly cap
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { count } = await admin.from("price_fetch_log").select("id", { count: "exact", head: true })
      .eq("user_id", uid).gte("fetched_at", since).not("http_status", "is", null);
    const used = count ?? 0;
    const cap = integ.monthly_request_cap;
    if (used >= cap) { await status(429); return { status: "error", code: "cap_reached", message: "سقف درخواست ماهانه پر شده" }; }
    // 4. auto needs at least one asset
    if (data.trigger === "auto") {
      const { count: n } = await admin.from("assets").select("id", { count: "exact", head: true }).eq("user_id", uid);
      if (!n) return { status: "skipped", skipped: "no_assets" };
    }

    let key: string;
    try { key = await s.decryptKey(sec.api_key_encrypted); } catch {
      await status(500);
      return { status: "error", code: "decrypt_failed", message: "خواندن کلید ممکن نشد؛ کلید را دوباره وارد کن." };
    }
    const r = await s.navasanGet("latest", key);
    const fetchedAt = new Date().toISOString();
    const usedAfter = r.status != null ? used + 1 : used;

    if (r.status === 200) {
      const rows = s.parseLatest(r.body, uid, fetchedAt);
      if (!rows.length) {
        await s.logFetch(uid, data.trigger, 200, false, "bad_response");
        await status(502);
        return { status: "error", code: "bad_response", message: "پاسخ سرویس نوسان قابل استفاده نبود." };
      }
      const { error } = await admin.from("price_cache").upsert(rows, { onConflict: "user_id,symbol" });
      await s.logFetch(uid, data.trigger, 200, !error, error ? "cache_write_failed" : null);
      if (error) { await status(500); return { status: "error", code: "cache_write_failed", message: "ذخیره‌ی قیمت‌ها ممکن نشد." }; }
      return { status: "ok", updated_symbols: rows.map((x) => x.symbol), fetched_at: fetchedAt, requests_used_30d: usedAfter, cap };
    }

    await s.logFetch(uid, data.trigger, r.status, false, s.errorCodeOf(r.status, r.body));
    if (r.status === 401) {
      await admin.from("user_integrations").update({ key_status: "invalid", updated_at: fetchedAt }).eq("user_id", uid);
      await status(409);
      return { status: "error", code: "invalid_key", message: "کلید نامعتبر یا منقضی است، کلید جدید وارد کن" };
    }
    if (r.status === 429 || r.status === 503) { await status(503); return { status: "error", code: "limited", message: "محدودیت سرویس یا تمام شدن سهمیه، بعدا" }; }
    await status(502);
    return { status: "error", code: "failed", message: "دریافت قیمت ممکن نشد. کمی بعد دوباره امتحان کن." };
  });
