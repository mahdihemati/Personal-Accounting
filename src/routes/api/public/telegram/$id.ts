import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const UpdateSchema = z.object({ update_id: z.number().int() }).passthrough();

export const Route = createFileRoute("/api/public/telegram/$id")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!z.string().uuid().safeParse(params.id).success) return new Response("not found", { status: 404 });
        const secret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        if (!secret) return new Response("unauthorized", { status: 401 });
        let body: unknown;
        try { body = await request.json(); } catch { return new Response("bad request", { status: 400 }); }
        const parsed = UpdateSchema.safeParse(body);
        if (!parsed.success) return new Response("bad request", { status: 400 });
        const { handleUpdate } = await import("@/lib/telegram.server");
        try {
          const status = await handleUpdate(params.id, secret, parsed.data as never);
          return new Response(status === 200 ? "ok" : "unauthorized", { status });
        } catch (e) {
          console.error("telegram webhook error", e instanceof Error ? e.message : e);
          return new Response("ok"); // avoid Telegram retry storms; update is already marked processed
        }
      },
    },
  },
});
