import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { GEMINI_LIVE_MODEL, VOICE_SYSTEM_INSTRUCTION } from "./ai-config";

export type VoiceTokenResult =
  | { status: "ok"; token: string }
  | { status: "rate_limited"; message: string }
  | { status: "error"; message: string };

const MAX_PER_HOUR = 20;

/** voice-token: issues a single-use, locked, short-lived Gemini Live token for the signed-in user. */
export const getVoiceToken = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<VoiceTokenResult> => {
    const { db, userId } = context;
    const key = process.env["GEMINI_API_KEY"];
    if (!key) return { status: "error", message: "کلید هوش مصنوعی تنظیم نشده است." };

    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count, error: cErr } = await db
      .from("voice_sessions").select("id", { count: "exact", head: true }).gte("created_at", since);
    if (cErr) return { status: "error", message: "بررسی محدودیت ممکن نشد. دوباره تلاش کنید." };
    if ((count ?? 0) >= MAX_PER_HOUR) {
      const { setResponseStatus } = await import("@tanstack/react-start/server");
      setResponseStatus(429);
      return { status: "rate_limited", message: "در یک ساعت گذشته بیش از حد از دستیار صوتی استفاده کرده‌اید. کمی بعد دوباره امتحان کنید." };
    }

    const now = Date.now();
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        uses: 1,
        expireTime: new Date(now + 30 * 60_000).toISOString(),
        newSessionExpireTime: new Date(now + 60_000).toISOString(),
        bidiGenerateContentSetup: {
          model: `models/${GEMINI_LIVE_MODEL}`,
          generationConfig: { responseModalities: ["AUDIO"] },
          sessionResumption: {},
          systemInstruction: { parts: [{ text: VOICE_SYSTEM_INSTRUCTION }] },
        },
      }),
    });
    if (!res.ok) {
      console.error("voice token", res.status, await res.text());
      return { status: "error", message: "اتصال به دستیار صوتی ممکن نشد. دوباره تلاش کنید." };
    }
    const json = (await res.json()) as { name?: string };
    if (!json.name) return { status: "error", message: "اتصال به دستیار صوتی ممکن نشد." };
    await db.from("voice_sessions").insert({ user_id: userId });
    return { status: "ok", token: json.name };
  });
