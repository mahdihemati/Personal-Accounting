/** Server-only: Telegram Bot API client and message handling. The bot token never leaves the server. */
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptKey } from "./prices.server";
import { formatToman, jDate } from "./format";
import { parseTelegramMessage, type ParsedItem } from "./telegram-parse.server";

const API = "https://api.telegram.org";

export type TgResult<T = unknown> = { ok: boolean; result?: T; description?: string; error_code?: number };

export async function tg<T = unknown>(token: string, method: string, body?: unknown): Promise<TgResult<T>> {
  try {
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    return (await res.json()) as TgResult<T>;
  } catch {
    return { ok: false, description: "network_error" };
  }
}

/** Constant-time string compare. */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function randomToken(bytes = 24) {
  const u = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(u, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Preview URLs sit behind a login wall; Telegram must call the public dev host instead. */
export function publicOrigin(origin: string) {
  const m = origin.match(/^https:\/\/id-preview--([a-z0-9-]+)\.(.+)$/);
  return m ? `https://project--${m[1]}-dev.${m[2]}` : origin;
}

type Link = { user_id: string; webhook_id: string; webhook_secret: string; bot_token_encrypted: string; chat_id: number | null; link_code: string | null; link_code_expires: string | null };
type Draft = { id: string; user_id: string; chat_id: number; items: ParsedItem[]; question: string | null; status: string; message_id: number | null; expires_at: string };

type Update = {
  update_id: number;
  message?: { message_id: number; chat: { id: number; type: string }; text?: string; voice?: { file_id: string; duration: number; mime_type?: string; file_size?: number }; audio?: { file_id: string; duration: number; mime_type?: string; file_size?: number } };
  callback_query?: { id: string; data?: string; message?: { message_id: number; chat: { id: number } } };
};

const MAX_VOICE_SEC = 120;
const MAX_FILE = 20 * 1024 * 1024;

export async function handleUpdate(webhookId: string, secretHeader: string, update: Update): Promise<number> {
  const admin = getSupabaseAdmin();
  const { data: link } = await admin.from("telegram_links").select("*").eq("webhook_id", webhookId).maybeSingle<Link>();
  if (!link || !safeEqual(secretHeader, link.webhook_secret)) return 401;

  // Telegram retries on failure: process each update once.
  const { error: dupErr } = await admin.from("telegram_updates").insert({ webhook_id: webhookId, update_id: update.update_id });
  if (dupErr) return 200;

  const token = await decryptKey(link.bot_token_encrypted).catch(() => null);
  if (!token) return 200;

  if (update.callback_query) { await onCallback(admin, token, link, update.callback_query); return 200; }
  const msg = update.message;
  if (!msg || msg.chat.type !== "private") return 200;
  const chatId = msg.chat.id;
  const say = (text: string, extra: Record<string, unknown> = {}) => tg(token, "sendMessage", { chat_id: chatId, text, ...extra });

  // Linking: /start <code>
  const text = msg.text?.trim() ?? "";
  if (text.startsWith("/start")) {
    const code = text.split(/\s+/)[1] ?? "";
    if (link.chat_id === chatId) { await say("اتصال برقرار است. خرج یا درآمدت را بنویس یا ویس بفرست."); return 200; }
    const valid = code && link.link_code && safeEqual(code, link.link_code) && link.link_code_expires && new Date(link.link_code_expires) > new Date();
    if (!valid) { await say("کد اتصال نامعتبر یا منقضی است. از تنظیمات برنامه یک لینک تازه بساز."); return 200; }
    await admin.from("telegram_links").update({ chat_id: chatId, link_code: null, link_code_expires: null, updated_at: new Date().toISOString() }).eq("user_id", link.user_id);
    await say("✅ ربات به حسابت وصل شد.\nمثلاً بنویس «۱۰۰ هزار تومن ناهار خرج کردم» یا ویس بفرست.");
    return 200;
  }
  if (link.chat_id !== chatId) { await say("این چت به حسابی وصل نیست. از تنظیمات برنامه لینک اتصال بساز."); return 200; }
  if (text === "/cancel") {
    await admin.from("telegram_drafts").update({ status: "cancelled" }).eq("user_id", link.user_id).in("status", ["collecting", "pending"]);
    await say("پیش‌نویس‌ها لغو شد.");
    return 200;
  }

  // Input: text or voice
  let audio: { mime: string; b64: string } | null = null;
  const v = msg.voice ?? msg.audio;
  if (v) {
    if (v.duration > MAX_VOICE_SEC || (v.file_size ?? 0) > MAX_FILE) { await say("ویس خیلی طولانی است؛ لطفاً کوتاه‌تر (حداکثر ۲ دقیقه) بفرست."); return 200; }
    const f = await tg<{ file_path?: string }>(token, "getFile", { file_id: v.file_id });
    if (!f.ok || !f.result?.file_path) { await say("دریافت ویس ممکن نشد. دوباره بفرست."); return 200; }
    const res = await fetch(`${API}/file/bot${token}/${f.result.file_path}`);
    if (!res.ok) { await say("دریافت ویس ممکن نشد. دوباره بفرست."); return 200; }
    const buf = new Uint8Array(await res.arrayBuffer());
    let s = "";
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    audio = { mime: v.mime_type && v.mime_type.startsWith("audio/") ? v.mime_type : "audio/ogg", b64: btoa(s) };
  } else if (!text) {
    await say("فقط متن یا ویس را می‌فهمم.");
    return 200;
  }

  await tg(token, "sendChatAction", { chat_id: chatId, action: "typing" });

  const [{ data: cats }, { data: accs }, { data: open }] = await Promise.all([
    admin.from("categories").select("id,name,kind").eq("user_id", link.user_id),
    admin.from("accounts").select("id,name").eq("user_id", link.user_id).order("created_at"),
    admin.from("telegram_drafts").select("*").eq("user_id", link.user_id).eq("status", "collecting")
      .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle<Draft>(),
  ]);
  const categories = (cats ?? []) as { id: string; name: string; kind: string }[];
  const accounts = (accs ?? []) as { id: string; name: string }[];

  let parsed;
  try {
    parsed = await parseTelegramMessage({ text, audio, categories, accounts, previous: open ? { items: open.items, question: open.question } : null });
  } catch (e) {
    await say(e instanceof Error && /[\u0600-\u06FF]/.test(e.message) ? e.message : "فهم پیام ممکن نشد. دوباره امتحان کن.");
    return 200;
  }

  if (!parsed.items.length && !parsed.question) {
    if (open) await admin.from("telegram_drafts").update({ status: "cancelled" }).eq("id", open.id);
    await say(parsed.reply || "تراکنشی پیدا نکردم. مثلاً بنویس «۲۰۰ هزار تومن خرید نان».");
    return 200;
  }

  if (parsed.question) {
    if (open) await admin.from("telegram_drafts").update({ items: parsed.items, question: parsed.question }).eq("id", open.id);
    else await admin.from("telegram_drafts").insert({ user_id: link.user_id, chat_id: chatId, items: parsed.items, question: parsed.question, status: "collecting" });
    await say(parsed.question);
    return 200;
  }

  // Complete: ask for confirmation with inline buttons.
  let draftId = open?.id;
  if (open) await admin.from("telegram_drafts").update({ items: parsed.items, question: null, status: "pending" }).eq("id", open.id);
  else {
    const { data: d } = await admin.from("telegram_drafts").insert({ user_id: link.user_id, chat_id: chatId, items: parsed.items, status: "pending" }).select("id").single();
    draftId = d?.id;
  }
  if (!draftId) { await say("ذخیره‌ی پیش‌نویس ممکن نشد."); return 200; }
  const sent = await say(summary(parsed.items, categories, accounts, "این تراکنش‌ها ثبت شود؟"), {
    reply_markup: { inline_keyboard: [[{ text: "✅ تأیید و ثبت", callback_data: `c:${draftId}` }, { text: "❌ لغو", callback_data: `x:${draftId}` }]] },
  }) as TgResult<{ message_id: number }>;
  if (sent.ok && sent.result) await admin.from("telegram_drafts").update({ message_id: sent.result.message_id }).eq("id", draftId);
  return 200;
}

function summary(items: ParsedItem[], cats: { id: string; name: string }[], accs: { id: string; name: string }[], title: string) {
  const lines = items.map((it, i) => {
    const cat = cats.find((c) => c.id === it.category_id)?.name ?? "بدون دسته";
    const acc = accs.find((a) => a.id === it.account_id)?.name ?? "؟";
    const sign = it.kind === "income" ? "➕ درآمد" : "➖ هزینه";
    return `${items.length > 1 ? `${i + 1}. ` : ""}${sign}: ${formatToman(it.amount)}\n   دسته: ${cat} · حساب: ${acc}\n   تاریخ: ${jDate(it.date + "T12:00:00+03:30")}${it.note ? `\n   یادداشت: ${it.note}` : ""}`;
  });
  return `${title}\n\n${lines.join("\n\n")}`;
}

type Admin = ReturnType<typeof getSupabaseAdmin>;

async function onCallback(admin: Admin, token: string, link: Link, cq: NonNullable<Update["callback_query"]>) {
  const answer = (text: string) => tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text });
  const m = (cq.data ?? "").match(/^([cx]):([0-9a-f-]{36})$/);
  if (!m || cq.message?.chat.id !== link.chat_id) { await answer("نامعتبر"); return; }
  const { data: d } = await admin.from("telegram_drafts").select("*").eq("id", m[2]).eq("user_id", link.user_id).maybeSingle<Draft>();
  const edit = (text: string) => cq.message && tg(token, "editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text });
  if (!d) { await answer("پیدا نشد"); return; }
  if (d.status === "saved") { await answer("قبلاً ثبت شده"); return; }
  if (d.status !== "pending" || new Date(d.expires_at) < new Date()) { await answer("منقضی یا لغو شده"); await edit("این پیش‌نویس منقضی یا لغو شده است."); return; }

  const [{ data: cats }, { data: accs }] = await Promise.all([
    admin.from("categories").select("id,name").eq("user_id", link.user_id),
    admin.from("accounts").select("id,name").eq("user_id", link.user_id),
  ]);
  const categories = (cats ?? []) as { id: string; name: string }[];
  const accounts = (accs ?? []) as { id: string; name: string }[];

  if (m[1] === "x") {
    await admin.from("telegram_drafts").update({ status: "cancelled" }).eq("id", d.id);
    await answer("لغو شد");
    await edit(summary(d.items, categories, accounts, "❌ لغو شد"));
    return;
  }
  const rows = d.items.map((it, i) => ({
    user_id: link.user_id, account_id: it.account_id, category_id: it.category_id || null, amount: it.amount, kind: it.kind,
    occurred_at: new Date(it.date + "T12:00:00+03:30").toISOString(), note: it.note || null, source: "telegram",
    raw_transcript: it.raw || null, batch_id: d.id, batch_index: i,
  }));
  const { error } = await admin.from("transactions").upsert(rows, { onConflict: "batch_id,batch_index", ignoreDuplicates: true });
  if (error) { console.error("telegram save failed", error.message); await answer("ثبت نشد؛ دوباره بزن"); return; }
  await admin.from("telegram_drafts").update({ status: "saved" }).eq("id", d.id);
  await answer("ثبت شد ✓");
  await edit(summary(d.items, categories, accounts, "✅ ثبت شد"));
}
