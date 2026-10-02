import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Username-only signup: the auth email is a deterministic synthetic address
// derived from the normalized username, created server-side with
// email_confirm: true so no confirmation email is ever needed.
export function usernameToEmail(username: string): string {
  return `${username.toLowerCase()}@app.local`;
}

const signupSchema = z.object({
  username: z
    .string()
    .min(3, "نام کاربری باید حداقل ۳ حرف باشد")
    .max(30)
    .regex(/^[a-zA-Z0-9_.]+$/, "نام کاربری فقط حروف انگلیسی، عدد، نقطه و آندرلاین"),
  password: z.string().min(6, "رمز عبور باید حداقل ۶ کاراکتر باشد"),
});

export const signUpWithUsername = createServerFn({ method: "POST" })
  .inputValidator((data) => signupSchema.parse(data))
  .handler(async ({ data }) => {
    const username = data.username.toLowerCase();
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (existing) return { ok: false as const, error: "این نام کاربری قبلاً گرفته شده است" };

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: usernameToEmail(username),
      password: data.password,
      email_confirm: true,
    });
    if (createError || !created.user) {
      return { ok: false as const, error: "ثبت‌نام ناموفق بود؛ دوباره تلاش کنید" };
    }

    const { error: profileError } = await admin
      .from("profiles")
      .insert({ id: created.user.id, username });
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return { ok: false as const, error: "ثبت‌نام ناموفق بود؛ دوباره تلاش کنید" };
    }

    return { ok: true as const };
  });
