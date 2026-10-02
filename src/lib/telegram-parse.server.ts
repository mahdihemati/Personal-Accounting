/** Server-only: turn a Telegram text/voice message into transaction drafts with Gemini. Code validates everything. */
import { format as gFormat } from "date-fns";
import { FA_SPEECH_RULES, GEMINI_MODEL } from "./ai-config";
import { jDate } from "./format";

export type ParsedItem = { amount: number; kind: "income" | "expense" | "transfer"; category_id: string; account_id: string; to_account_id?: string; date: string; note: string; raw: string };
export type Intent = "record" | "question" | "chat";

const schema = {
  type: "OBJECT",
  properties: {
    transcript: { type: "STRING", description: "متن دقیق گفته‌شده یا نوشته‌شده‌ی کاربر" },
    intent: { type: "STRING", enum: ["record", "question", "chat"], description: "record: ثبت تراکنش؛ question: سؤال درباره‌ی اطلاعات مالی؛ chat: سلام/کمک/نامربوط" },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          amount_toman: { type: "INTEGER", description: "مبلغ به تومان، عدد صحیح" },
          kind: { type: "STRING", enum: ["income", "expense", "transfer"] },
          category_name: { type: "STRING", description: "برای هزینه/درآمد؛ برای انتقال خالی" },
          account_name: { type: "STRING", description: "حساب (برای انتقال: حساب مبدأ)" },
          to_account_name: { type: "STRING", description: "فقط برای انتقال: حساب مقصد" },
          date: { type: "STRING", description: "YYYY-MM-DD میلادی" },
          note: { type: "STRING" },
        },
        required: ["kind"],
      },
    },
    user_question: { type: "STRING", description: "اگر پیام سؤالی درباره‌ی اطلاعات مالی دارد، همان سؤال به‌صورت کامل و مستقل؛ وگرنه خالی" },
    question: { type: "STRING", description: "یک سؤال تکمیلی کوتاه اگر اطلاعات لازم برای ثبت کم است، وگرنه خالی" },
    reply: { type: "STRING", description: "پاسخ کوتاه فارسی فقط برای intent=chat" },
  },
  required: ["intent", "items", "question"],
};

const SYSTEM = `# نقش
تو دستیار مالی شخصی کاربر در تلگرام هستی. پیام کاربر (متن یا ویس فارسی) را دقیق می‌فهمی و به داده‌ی ساخت‌یافته تبدیل می‌کنی. کد برنامه همه‌چیز را اعتبارسنجی می‌کند و ثبت فقط با دکمه‌ی تأیید کاربر انجام می‌شود.

# تشخیص نیت (intent)
- record: پیام یک یا چند هزینه، درآمد یا انتقال بین حساب‌ها را گزارش می‌کند، یا جواب سؤال تکمیلی قبلی است.
- question: کاربر چیزی درباره‌ی اطلاعات مالی خودش می‌پرسد (موجودی، جمع خرج، بودجه، مقایسه، جست‌وجو، دارایی). سؤال را کامل در user_question بنویس.
- chat: سلام، تشکر، «چه کارهایی می‌کنی؟» یا نامربوط. در reply کوتاه بگو می‌توانی هزینه، درآمد و انتقال را ثبت کنی و به سؤال‌های مالی جواب بدهی.
- اگر پیام هم تراکنش داشت هم سؤال، intent=record و سؤال را هم در user_question بنویس.

# قوانین قطعی
1. هیچ عددی از خودت نساز؛ فقط آنچه کاربر گفته.
2. تو چیزی ثبت نمی‌کنی؛ فقط پیش‌نویس می‌سازی.
3. حداکثر یک سؤال تکمیلی کوتاه در question؛ اگر همه‌چیز کامل است question خالی.

${FA_SPEECH_RULES}

# انتقال بین حساب‌ها (kind = transfer)
- نشانه‌ها: «از … به … ریختم/زدم/منتقل کردم/کارت‌به‌کارت کردم به حساب خودم»، «… رو گذاشتم تو …»، «نقد کردم»، «از کارت برداشت کردم» (از حساب بانکی به نقد).
- account_name = مبدأ، to_account_name = مقصد؛ هر دو فقط از فهرست حساب‌ها. category_name خالی.
- انتقال به شخص دیگر (کارت‌به‌کارت به دوستم، قسط، خرید) انتقال نیست؛ هزینه است.
- اگر مبدأ یا مقصد معلوم نبود، بپرس: «از کدام حساب به کدام حساب؟».

# تکمیل پیش‌نویس
- اگر پیش‌نویس قبلی و سؤال باز داده شده، پیام جدید معمولاً جواب همان سؤال است: پیش‌نویس را کامل کن و همه‌ی آیتم‌ها را برگردان (intent=record).
- برای هزینه/درآمد: اگر کاربر حساب را نگفت account_name خالی بماند (کد حساب پیش‌فرض را می‌گذارد). اگر هیچ دسته‌ای نزدیک نبود، بپرس.

# مثال‌ها
- «نون ۳۰ تومن، اسنپ ۱۲۰» ← record، دو هزینه: 30000 و 120000.
- «۵ میلیون از ملت ریختم به بلو» ← record، transfer 5000000، ملت ← بلو.
- «۲ میلیون از کارت گرفتم» ← record، transfer از حساب بانکی به حساب نقدی (اگر دو حساب مناسب هست؛ وگرنه بپرس).
- «این ماه چقدر خرج کردم؟» ← question، user_question همان.
- «ناهار ۲۰۰ تومن، راستی موجودیم چقدره؟» ← record با یک هزینه + user_question «موجودی حساب‌هایم چقدر است؟».
- «سلام» ← chat.`;

type Prev = { items: ParsedItem[]; question: string | null } | null;

const norm = (s: string) => s.replace(/[\u200c\s]+/g, " ").replace(/ي/g, "ی").replace(/ك/g, "ک").trim().toLowerCase();

export function matchName<T extends { name: string }>(list: T[], name: string | undefined): T | undefined {
  if (!name) return undefined;
  const n = norm(name);
  return list.find((x) => norm(x.name) === n) ?? list.find((x) => norm(x.name).includes(n) || n.includes(norm(x.name)));
}

export async function parseTelegramMessage(input: {
  text: string; audio: { mime: string; b64: string } | null;
  categories: { id: string; name: string; kind: string }[]; accounts: { id: string; name: string }[]; previous: Prev;
}): Promise<{ intent: Intent; items: ParsedItem[]; question: string; reply: string; userQuestion: string }> {
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
      account_name: input.accounts.find((a) => a.id === it.account_id)?.name ?? "",
      to_account_name: input.accounts.find((a) => a.id === it.to_account_id)?.name ?? "", date: it.date, note: it.note,
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
  let out: { transcript?: string; intent?: string; user_question?: string; items?: { amount_toman?: number; kind?: string; category_name?: string; account_name?: string; to_account_name?: string; date?: string; note?: string }[]; question?: string; reply?: string };
  try { out = JSON.parse(raw); } catch { throw new Error("پاسخ هوش مصنوعی قابل خواندن نبود. دوباره بفرست."); }

  const transcript = (out.transcript || input.text || "").slice(0, 500);
  const defaultAcc = input.accounts[0];
  const items: ParsedItem[] = (out.items ?? []).slice(0, 8).map((it) => {
    const kind = it.kind === "income" ? "income" : it.kind === "transfer" ? "transfer" : "expense";
    const amount = Number.isFinite(it.amount_toman) && (it.amount_toman ?? 0) > 0 ? Math.round(it.amount_toman!) : 0;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(it.date ?? "") && it.date! <= today ? it.date! : today;
    const note = (it.note ?? "").slice(0, 200);
    if (kind === "transfer") {
      const from = matchName(input.accounts, it.account_name);
      const to = matchName(input.accounts.filter((a) => a.id !== from?.id), it.to_account_name);
      return { amount, kind, category_id: "", account_id: from?.id ?? "", to_account_id: to?.id ?? "", date, note, raw: transcript };
    }
    const cat = matchName(input.categories.filter((c) => c.kind === kind), it.category_name);
    const acc = matchName(input.accounts, it.account_name) ?? defaultAcc;
    return { amount, kind, category_id: cat?.id ?? "", account_id: acc?.id ?? "", date, note, raw: transcript };
  });

  let question = (out.question ?? "").trim();
  // Code-level completeness check: never ask for confirmation with a missing field.
  if (!question && items.length) {
    const i = items.findIndex((x) => !x.amount || (x.kind === "transfer" ? !x.account_id || !x.to_account_id : !x.category_id || !x.account_id));
    if (i >= 0) {
      const x = items[i]!;
      const n = items.length > 1 ? ` (مورد ${i + 1})` : "";
      question = !x.amount ? `مبلغ${n} چقدر بود؟`
        : x.kind === "transfer" ? `انتقال${n} از کدام حساب به کدام حساب بود؟`
        : !x.category_id ? `دسته‌ی این ${x.kind === "income" ? "درآمد" : "خرج"}${n} چیست؟`
        : "از کدام حساب؟";
    }
  }
  const intent: Intent = items.length || question && out.intent !== "question" ? "record" : out.intent === "question" ? "question" : "chat";
  return { intent, items, question, reply: (out.reply ?? "").slice(0, 300), userQuestion: (out.user_question ?? "").trim().slice(0, 500) };
}
