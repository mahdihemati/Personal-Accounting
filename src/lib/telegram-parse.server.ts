/** Server-only: turn a Telegram text/voice message into transaction drafts with Gemini. Code validates everything. */
import { format as gFormat } from "date-fns";
import { FA_SPEECH_RULES, GEMINI_MODEL } from "./ai-config";
import { jDate } from "./format";

export type ParsedItem = { amount: number; kind: "income" | "expense"; category_id: string; account_id: string; date: string; note: string; raw: string };

const schema = {
  type: "OBJECT",
  properties: {
    transcript: { type: "STRING", description: "متن گفته‌شده یا نوشته‌شده‌ی کاربر" },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          amount_toman: { type: "INTEGER" },
          kind: { type: "STRING", enum: ["income", "expense"] },
          category_name: { type: "STRING" },
          account_name: { type: "STRING" },
          date: { type: "STRING", description: "YYYY-MM-DD میلادی" },
          note: { type: "STRING" },
        },
        required: ["kind"],
      },
    },
    question: { type: "STRING", description: "یک سؤال کوتاه فارسی اگر اطلاعات لازم کم است، وگرنه خالی" },
    reply: { type: "STRING", description: "پاسخ کوتاه فارسی وقتی پیام تراکنش نیست" },
  },
  required: ["items", "question"],
};

const SYSTEM = `تو دستیار ثبت تراکنش مالی در تلگرام هستی. پیام کاربر (متن یا صوت فارسی) را به تراکنش تبدیل کن.
${FA_SPEECH_RULES}
- account_name: اگر کاربر حساب را نگفت، خالی بگذار.
- اگر هیچ دسته‌ای نزدیک نبود، بپرس.
- اگر پیش‌نویس قبلی و سؤال باز داده شده، پیام جدید جواب آن سؤال است: پیش‌نویس را با آن کامل کن و همه‌ی آیتم‌ها را برگردان.
- فقط وقتی مبلغ یا نوع یا دسته‌ی یک آیتم مشخص نیست question بنویس؛ یک سؤال کوتاه. وگرنه question خالی.
- اگر پیام تراکنش نبود، items خالی و در reply کوتاه توضیح بده که چه کار می‌کنی.
- هیچ عددی از خودت نساز.`;

type Prev = { items: ParsedItem[]; question: string | null } | null;

const norm = (s: string) => s.replace(/[\u200c\s]+/g, " ").replace(/ي/g, "ی").replace(/ك/g, "ک").trim().toLowerCase();

function match<T extends { name: string }>(list: T[], name: string | undefined): T | undefined {
  if (!name) return undefined;
  const n = norm(name);
  return list.find((x) => norm(x.name) === n) ?? list.find((x) => norm(x.name).includes(n) || n.includes(norm(x.name)));
}

export async function parseTelegramMessage(input: {
  text: string; audio: { mime: string; b64: string } | null;
  categories: { id: string; name: string; kind: string }[]; accounts: { id: string; name: string }[]; previous: Prev;
}): Promise<{ items: ParsedItem[]; question: string; reply: string }> {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) throw new Error("کلید هوش مصنوعی روی سرور تنظیم نشده است.");
  const now = new Date();
  const today = gFormat(now, "yyyy-MM-dd");
  const ctx = [
    `امروز: ${jDate(now, "EEEE d MMMM yyyy")} شمسی = ${today} میلادی (Asia/Tehran).`,
    `دسته‌های هزینه: ${input.categories.filter((c) => c.kind === "expense").map((c) => c.name).join("، ")}`,
    `دسته‌های درآمد: ${input.categories.filter((c) => c.kind === "income").map((c) => c.name).join("، ")}`,
    `حساب‌ها: ${input.accounts.map((a) => a.name).join("، ")}`,
  ];
  if (input.previous) {
    const prevItems = input.previous.items.map((it) => ({
      amount_toman: it.amount || null, kind: it.kind,
      category_name: input.categories.find((c) => c.id === it.category_id)?.name ?? "",
      account_name: input.accounts.find((a) => a.id === it.account_id)?.name ?? "", date: it.date, note: it.note,
    }));
    ctx.push(`پیش‌نویس قبلی: ${JSON.stringify(prevItems)}`, `سؤالی که پرسیده بودی: ${input.previous.question ?? ""}`);
  }
  const parts: unknown[] = [{ text: ctx.join("\n") }];
  if (input.audio) parts.push({ text: "پیام صوتی کاربر:" }, { inline_data: { mime_type: input.audio.mime, data: input.audio.b64 } });
  else parts.push({ text: `پیام کاربر: ${input.text}` });

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.2 },
    }),
  }).catch(() => null);
  if (!res) throw new Error("ارتباط با سرویس هوش مصنوعی برقرار نشد.");
  if (res.status === 429) throw new Error("درخواست‌ها زیاد شده؛ چند دقیقه بعد دوباره بفرست.");
  if (!res.ok) { console.error("Gemini telegram error", res.status, (await res.text()).slice(0, 300)); throw new Error("سرویس هوش مصنوعی موقتاً در دسترس نیست."); }
  const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const raw = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  let out: { transcript?: string; items?: { amount_toman?: number; kind?: string; category_name?: string; account_name?: string; date?: string; note?: string }[]; question?: string; reply?: string };
  try { out = JSON.parse(raw); } catch { throw new Error("پاسخ هوش مصنوعی قابل خواندن نبود. دوباره بفرست."); }

  const transcript = (out.transcript || input.text || "").slice(0, 500);
  const defaultAcc = input.accounts[0];
  const items: ParsedItem[] = (out.items ?? []).slice(0, 8).map((it) => {
    const kind = it.kind === "income" ? "income" : "expense";
    const cat = match(input.categories.filter((c) => c.kind === kind), it.category_name);
    const acc = match(input.accounts, it.account_name) ?? (input.accounts.length === 1 ? defaultAcc : undefined) ?? defaultAcc;
    const amount = Number.isFinite(it.amount_toman) && (it.amount_toman ?? 0) > 0 ? Math.round(it.amount_toman!) : 0;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(it.date ?? "") && it.date! <= today ? it.date! : today;
    return { amount, kind, category_id: cat?.id ?? "", account_id: acc?.id ?? "", date, note: (it.note ?? "").slice(0, 200), raw: transcript };
  });

  let question = (out.question ?? "").trim();
  // Code-level completeness check: never ask for confirmation with a missing field.
  if (!question && items.length) {
    const i = items.findIndex((x) => !x.amount || !x.category_id || !x.account_id);
    if (i >= 0) {
      const x = items[i]!;
      const n = items.length > 1 ? ` (مورد ${i + 1})` : "";
      question = !x.amount ? `مبلغ${n} چقدر بود؟`
        : !x.category_id ? `دسته‌ی این ${x.kind === "income" ? "درآمد" : "خرج"}${n} چیست؟`
        : "از کدام حساب؟";
    }
  }
  return { items, question, reply: (out.reply ?? "").slice(0, 300) };
}
