import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleGenAI, Modality, type LiveServerMessage, type FunctionResponse, type Session } from "@google/genai";
import { format as gFormat } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { GEMINI_LIVE_API_VERSION, GEMINI_LIVE_MODEL, VOICE_SYSTEM_INSTRUCTION } from "@/lib/ai-config";
import { getVoiceToken } from "@/lib/voice.functions";
import { jDate } from "@/lib/format";
import type { Account, Category } from "@/lib/data";
import { TOOL_DECLARATIONS, VOICE_CONFIRM_MAX, buildBatch, runReadTool, soundsLikeConfirmation, type PendingBatch, type PendingTx, type ToolArgs } from "./tools";
import { METRIC_TOOL_DECLARATIONS, METRIC_TOOL_NAMES, runMetricTool } from "./metric-tools";

export type VoiceStatus = "connecting" | "listening" | "speaking" | "error";

const SILENCE_RMS = 0.012;
const SILENCE_MS = 1000;

function toBase64(int16: Int16Array) {
  const bytes = new Uint8Array(int16.buffer);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000)));
  return btoa(s);
}

function fromBase64Pcm(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const int16 = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
  const f = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) f[i] = (int16[i] ?? 0) / 32768;
  return f;
}

function makeState() {
  return {
    closed: false,
    session: null as Session | null,
    token: null as string | null,
    handle: null as string | null,
    contextSent: false,
    reconnecting: false,
    stream: null as MediaStream | null,
    micCtx: null as AudioContext | null,
    outCtx: null as AudioContext | null,
    analyser: null as AnalyserNode | null,
    nextTime: 0,
    sources: new Set<AudioBufferSourceNode>(),
    silentSince: 0,
    streamEnded: false,
    turnUser: "",
    turnAssistant: "",
    lastTurnUser: "",
    categories: [] as Category[],
    accounts: [] as Account[],
    pendingCallId: null as string | null,
    pending: null as PendingBatch | null,
    heardSinceCard: "",
    saving: false,
    savedIdx: new Set<number>(),
  };
}

export function useVoiceSession() {
  const [status, setStatus] = useState<VoiceStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [userText, setUserText] = useState("");
  const [assistantText, setAssistantText] = useState("");
  const [pending, setPending] = useState<PendingBatch | null>(null);
  const levelRef = useRef(0);
  const onSaved = useRef<(() => void) | null>(null);
  const onInserted = useRef<((ids: string[]) => void) | null>(null);

  const r = useRef(makeState());

  const fail = useCallback((msg: string) => {
    setError(msg);
    setStatus("error");
  }, []);

  const stopPlayback = useCallback(() => {
    const s = r.current;
    s.sources.forEach((src) => { try { src.stop(); } catch { /* already stopped */ } });
    s.sources.clear();
    s.nextTime = 0;
  }, []);

  const playChunk = useCallback((b64: string) => {
    const s = r.current;
    if (!s.outCtx || !s.analyser) return;
    const data = fromBase64Pcm(b64);
    const buf = s.outCtx.createBuffer(1, data.length, 24000);
    buf.copyToChannel(data, 0);
    const src = s.outCtx.createBufferSource();
    src.buffer = buf;
    src.connect(s.analyser);
    const t = Math.max(s.outCtx.currentTime, s.nextTime);
    src.start(t);
    s.nextTime = t + buf.duration;
    s.sources.add(src);
    setStatus("speaking");
    src.onended = () => {
      s.sources.delete(src);
      if (!s.sources.size && !s.closed) setStatus((st) => (st === "speaking" ? "listening" : st));
    };
  }, []);

  const sendText = useCallback((text: string, turnComplete: boolean) => {
    r.current.session?.sendClientContent({ turns: [{ role: "user", parts: [{ text }] }], turnComplete });
  }, []);

  const sendContext = useCallback(() => {
    const s = r.current;
    const now = new Date();
    const text = [
      "[بافت]",
      `امروز: ${jDate(now, "EEEE d MMMM yyyy")} شمسی، ${gFormat(now, "yyyy-MM-dd")} میلادی. منطقه‌ی زمانی Asia/Tehran.`,
      `دسته‌های هزینه: ${s.categories.filter((c) => c.kind === "expense").map((c) => c.name).join("، ")}`,
      `دسته‌های درآمد: ${s.categories.filter((c) => c.kind === "income").map((c) => c.name).join("، ")}`,
      `حساب‌ها: ${s.accounts.map((a) => a.name).join("، ")}`,
    ].join("\n");
    sendText(text, false);
    s.contextSent = true;
  }, [sendText]);

  const setBatch = useCallback((b: PendingBatch | null) => {
    const s = r.current;
    s.pending = b && b.items.length ? b : null;
    setPending(s.pending);
  }, []);

  /** Idempotent save: (batch_id, batch_index) is unique, duplicates are ignored. */
  const saveItems = useCallback(async (b: PendingBatch, items: PendingTx[]) => {
    const s = r.current;
    const rows = items.filter((p) => !s.savedIdx.has(p.idx)).map((p) => ({
      account_id: p.accountId, category_id: p.categoryId || null, amount: p.amount, kind: p.kind,
      occurred_at: p.occurredAt.toISOString(), note: p.note || null, source: "voice", raw_transcript: p.rawTranscript || null,
      batch_id: b.batchId, batch_index: p.idx,
    }));
    if (!rows.length) return { ok: true as const };
    const { data: inserted, error: e } = await supabase.from("transactions")
      .upsert(rows, { onConflict: "batch_id,batch_index", ignoreDuplicates: true }).select("id,batch_index,kind");
    if (e) return { ok: false as const, message: "ذخیره نشد: " + e.message };
    rows.forEach((row) => s.savedIdx.add(row.batch_index));
    const ins = (inserted ?? []) as { id: string; batch_index: number; kind: string }[];
    for (const p of items) {
      const row = ins.find((x) => x.batch_index === p.idx);
      if (row && p.decisionId) await supabase.from("decisions").update({ transaction_id: row.id }).eq("id", p.decisionId);
    }
    onInserted.current?.(ins.filter((x) => x.kind === "expense").map((x) => x.id));
    return { ok: true as const };
  }, []);

  type Action = "confirm_all" | "cancel_all" | "remove_item";
  const resolve = useCallback(async (action: Action, opts: { index?: number | undefined; byVoice: boolean; edited?: PendingBatch }) => {
    const s = r.current;
    const b = opts.edited ?? s.pending;
    if (!b) return { ok: false, message: "تراکنشی در انتظار نیست" };
    if (action === "cancel_all") { setBatch(null); return { ok: true, message: "همه لغو شد" }; }
    if (action === "remove_item") {
      const pos = opts.index ?? -1;
      if (pos < 0 || pos >= b.items.length) return { ok: false, message: "ردیف پیدا نشد" };
      setBatch({ ...b, items: b.items.filter((_, i) => i !== pos) });
      return { ok: true, message: "ردیف حذف شد" };
    }
    // confirm_all
    if (opts.byVoice && !soundsLikeConfirmation(s.heardSinceCard)) {
      return { ok: false, message: "کاربر هنوز با صدای خودش تأیید نکرده؛ از او بخواه تأیید کند یا روی «ثبت همه» بزند." };
    }
    if (b.items.some((p) => !p.amount || !p.accountId)) return { ok: false, message: "مبلغ یا حساب یکی از ردیف‌ها خالی است" };
    if (s.saving) return { ok: false, message: "در حال ثبت…" };
    const allowed = opts.byVoice ? b.items.filter((p) => p.amount <= VOICE_CONFIRM_MAX) : b.items;
    const held = b.items.filter((p) => !allowed.includes(p));
    s.saving = true;
    const res = await saveItems(b, allowed);
    s.saving = false;
    if (!res.ok) return res;
    setBatch(held.length ? { ...b, items: held } : null);
    return {
      ok: true,
      message: held.length
        ? `${allowed.length} مورد ثبت شد؛ ${held.length} مورد بالای ۵ میلیون تومان فقط با لمس ثبت می‌شود.`
        : `${allowed.length} مورد ثبت شد`,
    };
  }, [saveItems, setBatch]);

  /** Touch decisions from the confirmation card. */
  const decide = useCallback(async (action: Action, opts: { index?: number | undefined; edited?: PendingBatch } = {}) => {
    const res = await resolve(action, { ...opts, byVoice: false });
    if (res.ok && action !== "remove_item") sendText(`[سیستم] کاربر با لمس: ${res.message}.`, true);
    return res;
  }, [resolve, sendText]);

  const updatePending = useCallback((b: PendingBatch) => { r.current.pending = b; setPending(b); }, []);

  const handleMessage = useCallback(async (msg: LiveServerMessage) => {
    const s = r.current;
    if (msg.setupComplete) {
      setStatus("listening");
      if (!s.contextSent) sendContext();
    }
    if (msg.sessionResumptionUpdate?.resumable && msg.sessionResumptionUpdate.newHandle) {
      s.handle = msg.sessionResumptionUpdate.newHandle;
    }
    if (msg.goAway) void reconnect();
    const sc = msg.serverContent;
    if (sc) {
      if (sc.interrupted) { stopPlayback(); setStatus("listening"); }
      if (sc.inputTranscription?.text) {
        if (s.turnAssistant) { s.turnAssistant = ""; }
        s.turnUser += sc.inputTranscription.text;
        if (s.pending) s.heardSinceCard += " " + sc.inputTranscription.text;
        setUserText(s.turnUser);
      }
      if (sc.outputTranscription?.text) {
        s.turnAssistant += sc.outputTranscription.text;
        setAssistantText(s.turnAssistant);
      }
      for (const part of sc.modelTurn?.parts ?? []) {
        if (part.inlineData?.data && part.inlineData.mimeType?.startsWith("audio/")) playChunk(part.inlineData.data);
      }
      if (sc.turnComplete) {
        if (s.turnUser) s.lastTurnUser = s.turnUser;
        s.turnUser = "";
        s.turnAssistant = "";
      }
    }
    const calls = msg.toolCall?.functionCalls ?? [];
    if (calls.length) {
      const functionResponses: FunctionResponse[] = [];
      for (const c of calls) {
        const args = (c.args ?? {}) as ToolArgs;
        let response: Record<string, unknown>;
        try {
          if (c.name === "propose_transactions") {
            const b = buildBatch(args, s.categories, s.accounts, s.turnUser || s.lastTurnUser);
            s.savedIdx = new Set();
            s.heardSinceCard = "";
            setBatch(b);
            response = b.items.length
              ? { status: "pending_confirmation", count: b.items.length, voice_confirm_limit_toman: VOICE_CONFIRM_MAX }
              : { status: "failed", message: "هیچ تراکنشی دریافت نشد" };
          } else if (c.name === "resolve_pending_transaction") {
            const action = (["confirm_all", "cancel_all", "remove_item"].includes(String(args.action)) ? args.action : "cancel_all") as Action;
            const res = await resolve(action, { index: typeof args.index === "number" ? args.index : undefined, byVoice: true });
            if (res.ok && action === "confirm_all") onSaved.current?.();
            response = { status: res.ok ? "ok" : "failed", message: res.message };
          } else if (METRIC_TOOL_NAMES.has(c.name ?? "")) {
            response = await runMetricTool(c.name!, args as Record<string, unknown>);
          } else {
            response = await runReadTool(c.name ?? "", args, s.categories);
          }
        } catch (e) {
          response = { error: e instanceof Error ? e.message : "خطا" };
        }
        functionResponses.push({ id: c.id, name: c.name, response } as FunctionResponse);
      }
      s.session?.sendToolResponse({ functionResponses });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolve, setBatch, playChunk, sendContext, stopPlayback]);

  const connect = useCallback(async (token: string) => {
    const s = r.current;
    const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: GEMINI_LIVE_API_VERSION } });
    return new Promise<Session>((resolve, reject) => {
      let opened = false;
      ai.live.connect({
        model: GEMINI_LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: VOICE_SYSTEM_INSTRUCTION,
          sessionResumption: s.handle ? { handle: s.handle } : {},
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          realtimeInputConfig: { automaticActivityDetection: { silenceDurationMs: 650, prefixPaddingMs: 200 } },
          tools: [{ functionDeclarations: [...TOOL_DECLARATIONS, ...METRIC_TOOL_DECLARATIONS] }],
        },
        callbacks: {
          onopen: () => { opened = true; },
          onmessage: (m) => { void handleMessage(m); },
          onerror: (e) => { console.error("live error", e); if (!opened) reject(e); },
          onclose: (e) => {
            if (!opened) { reject(new Error(e.reason || "closed")); return; }
            if (r.current.session === sessionRef) r.current.session = null;
            if (!s.closed && !s.reconnecting) void reconnect();
          },
        },
      }).then((sess) => { sessionRef = sess; resolve(sess); }, reject);
      let sessionRef: Session | null = null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleMessage]);

  const fetchToken = useCallback(async () => {
    const res = await getVoiceToken();
    if (res.status !== "ok") throw new Error(res.message);
    return res.token;
  }, []);

  const reconnect = useCallback(async () => {
    const s = r.current;
    if (s.closed || s.reconnecting) return;
    s.reconnecting = true;
    try { s.session?.close(); } catch { /* ignore */ }
    s.session = null;
    try {
      try {
        if (!s.token) throw new Error("no token");
        s.session = await connect(s.token);
      } catch {
        s.token = await fetchToken();
        s.session = await connect(s.token);
      }
    } catch (e) {
      fail(e instanceof Error && /[\u0600-\u06FF]/.test(e.message) ? e.message : "اتصال قطع شد و دوباره وصل نشد.");
    } finally {
      s.reconnecting = false;
    }
  }, [connect, fetchToken, fail]);

  const onMicFrame = useCallback((f: Float32Array) => {
    const s = r.current;
    let sum = 0;
    for (let i = 0; i < f.length; i++) { const x = f[i] ?? 0; sum += x * x; }
    const rms = Math.sqrt(sum / f.length);
    levelRef.current = Math.min(1, rms * 8);
    if (!s.session) return;
    const now = performance.now();
    if (rms < SILENCE_RMS) {
      if (!s.silentSince) s.silentSince = now;
      if (now - s.silentSince > SILENCE_MS) {
        if (!s.streamEnded) { s.session.sendRealtimeInput({ audioStreamEnd: true }); s.streamEnded = true; }
        return;
      }
    } else {
      s.silentSince = 0;
      s.streamEnded = false;
    }
    const int16 = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) int16[i] = Math.max(-32768, Math.min(32767, (f[i] ?? 0) * 32767));
    s.session.sendRealtimeInput({ audio: { data: toBase64(int16), mimeType: "audio/pcm;rate=16000" } });
  }, []);

  const cleanup = useCallback(() => {
    const s = r.current;
    s.closed = true;
    try { s.session?.close(); } catch { /* ignore */ }
    s.session = null;
    s.stream?.getTracks().forEach((t) => t.stop());
    s.stream = null;
    stopPlayback();
    void s.micCtx?.close().catch(() => {});
    void s.outCtx?.close().catch(() => {});
    s.micCtx = s.outCtx = null;
  }, [stopPlayback]);

  useEffect(() => {
    r.current = makeState();
    const s = r.current;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === "undefined") {
        fail("مرورگر شما از ضبط صدا پشتیبانی نمی‌کند. لطفاً از نسخه‌ی جدید Chrome یا Safari استفاده کنید.");
        return;
      }
      try {
        s.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      } catch (e) {
        const name = (e as DOMException)?.name;
        fail(name === "NotAllowedError" || name === "SecurityError"
          ? "اجازه‌ی دسترسی به میکروفون داده نشد. از تنظیمات مرورگر اجازه دهید و دوباره امتحان کنید."
          : "میکروفونی پیدا نشد یا در دسترس نیست.");
        return;
      }
      if (s.closed) { s.stream.getTracks().forEach((t) => t.stop()); return; }
      try {
        const [{ data: cats }, { data: accs }] = await Promise.all([
          supabase.from("categories").select("*").order("name"),
          supabase.from("accounts").select("*").order("created_at"),
        ]);
        s.categories = (cats ?? []) as Category[];
        s.accounts = (accs ?? []) as Account[];

        s.outCtx = new AudioContext({ sampleRate: 24000 });
        s.analyser = s.outCtx.createAnalyser();
        s.analyser.fftSize = 256;
        s.analyser.connect(s.outCtx.destination);

        s.micCtx = new AudioContext();
        await s.micCtx.audioWorklet.addModule("/pcm-recorder-worklet.js");
        const src = s.micCtx.createMediaStreamSource(s.stream);
        const node = new AudioWorkletNode(s.micCtx, "pcm-recorder");
        node.port.onmessage = (ev) => onMicFrame(ev.data as Float32Array);
        src.connect(node);

        s.token = await fetchToken();
        if (s.closed) return;
        s.session = await connect(s.token);
        if (s.closed) s.session.close();
      } catch (e) {
        console.error(e);
        if (!s.closed) fail(e instanceof Error && /[\u0600-\u06FF]/.test(e.message) ? e.message : "اتصال به دستیار صوتی ممکن نشد. دوباره تلاش کنید.");
      }
    })();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Current visual level 0..1 (mic while listening, output while speaking). */
  const getLevel = useCallback(() => {
    const s = r.current;
    if (s.analyser && s.sources.size) {
      const d = new Uint8Array(s.analyser.frequencyBinCount);
      s.analyser.getByteTimeDomainData(d);
      let sum = 0;
      for (const v of d) { const x = (v - 128) / 128; sum += x * x; }
      return Math.min(1, Math.sqrt(sum / d.length) * 5);
    }
    return levelRef.current;
  }, []);

  return {
    status, error, userText, assistantText, pending, getLevel, decide, updatePending, onSaved, onInserted,
    categories: () => r.current.categories, accounts: () => r.current.accounts,
  };
}
