import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware";
import { parseTelegramMessage, type ParsedItem } from "./telegram-parse.server";

export type VoiceExtractResult =
  | { ok: true; items: (ParsedItem & { kind: "income" | "expense" })[]; question: string }
  | { ok: false; message: string };

/**
 * Fallback for the voice assistant: when the live model talks about a transaction without
 * calling propose_transactions, extract drafts from the user's own words with the text model.
 * Returns drafts only — nothing is saved here; saving still needs the user's tap.
 */
export const extractVoiceTransactions = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ text: z.string().trim().min(2).max(1000) }).parse(d))
  .handler(async ({ data, context }): Promise<VoiceExtractResult> => {
    const { db } = context;
    const [{ data: cats, error: cErr }, { data: accs, error: aErr }] = await Promise.all([
      db.from("categories").select("id,name,kind"),
      db.from("accounts").select("id,name").order("created_at"),
    ]);
    if (cErr || aErr) return { ok: false, message: "خواندن دسته‌ها و حساب‌ها ممکن نشد." };
    try {
      const out = await parseTelegramMessage({
        text: data.text, audio: null,
        categories: (cats ?? []) as { id: string; name: string; kind: string }[],
        accounts: (accs ?? []) as { id: string; name: string }[],
        previous: null,
      });
      return { ok: true, items: out.items.filter((i): i is ParsedItem & { kind: "income" | "expense" } => i.kind !== "transfer"), question: out.question };
    } catch (e) {
      console.error("voice extract failed", e);
      return { ok: false, message: e instanceof Error ? e.message : "استخراج تراکنش ممکن نشد." };
    }
  });
