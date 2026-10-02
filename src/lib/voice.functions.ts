import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { DEFAULT_VOICE_PREFS, GEMINI_LIVE_MODEL, voiceInstruction, type VoicePrefs } from "./ai-config";
import { METRIC_TOOL_DECLARATIONS, TOOL_DECLARATIONS } from "./voice/declarations";

export type VoiceTokenResult =
  | { status: "ok"; token: string; model: string; prefs: VoicePrefs }
  | { status: "rate_limited"; message: string }
  | { status: "error"; message: string };

export type VoiceModel = { id: string; label: string; description: string };
export type VoiceModelsResult = { ok: true; models: VoiceModel[]; default: string } | { ok: false; message: string; default: string };

const MAX_PER_HOUR = 20;

/** Live-capable models available to the server's Gemini key (bidiGenerateContent). */
async function fetchLiveModels(key: string): Promise<VoiceModel[] | null> {
  const out: VoiceModel[] = [];
  let page = "";
  for (let i = 0; i < 5; i++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000${page ? `&pageToken=${page}` : ""}`, {
      headers: { "x-goog-api-key": key },
    });
    if (!res.ok) { console.error("list models", res.status); return null; }
    const j = (await res.json()) as { models?: { name: string; displayName?: string; description?: string; supportedGenerationMethods?: string[] }[]; nextPageToken?: string };
    for (const m of j.models ?? []) {
      if (m.supportedGenerationMethods?.includes("bidiGenerateContent")) {
        out.push({ id: m.name.replace(/^models\//, ""), label: m.displayName ?? m.name, description: m.description ?? "" });
      }
    }
    if (!j.nextPageToken) break;
    page = j.nextPageToken;
  }
  return out;
}

export const listVoiceModels = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async (): Promise<VoiceModelsResult> => {
    const key = process.env["GEMINI_API_KEY"];
    if (!key) return { ok: false, message: "کلید هوش مصنوعی تنظیم نشده است.", default: GEMINI_LIVE_MODEL };
    const models = await fetchLiveModels(key).catch(() => null);
    if (!models) return { ok: false, message: "فهرست مدل‌ها از Google دریافت نشد.", default: GEMINI_LIVE_MODEL };
    return { ok: true, models, default: GEMINI_LIVE_MODEL };
  });

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
      return { status: "rate_limited", message: "در یک ساعت گذشته بیش از حد از دستیار صوتی استفاده کرده‌اید. کمی بعد دوباره امتحان کنید." };
    }

    const { data: row } = await db.from("voice_settings").select("*").eq("user_id", userId).maybeSingle();
    const prefs: VoicePrefs = { ...DEFAULT_VOICE_PREFS, ...(row ?? {}) } as VoicePrefs;
    let model = GEMINI_LIVE_MODEL;
    if (prefs.model && prefs.model !== GEMINI_LIVE_MODEL) {
      const live = await fetchLiveModels(key).catch(() => null);
      if (live?.some((m) => m.id === prefs.model)) model = prefs.model;
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
          model: `models/${model}`,
          generationConfig: { responseModalities: ["AUDIO"] },
          sessionResumption: {},
          systemInstruction: { parts: [{ text: voiceInstruction(prefs.reply_length) }] },
          // Lock the action list into the token so every session can open the confirmation window.
          tools: [{ functionDeclarations: [...TOOL_DECLARATIONS, ...METRIC_TOOL_DECLARATIONS] }],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
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
    return { status: "ok", token: json.name, model, prefs };
  });
