import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "ورود | حسابداری شخصی" },
      { name: "description", content: "ورود یا ثبت‌نام با ایمیل در اپ حسابداری شخصی فارسی." },
      { property: "og:title", content: "ورود | حسابداری شخصی" },
      { property: "og:description", content: "ورود یا ثبت‌نام با ایمیل در اپ حسابداری شخصی فارسی." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) { toast.error("ایمیل یا رمز عبور اشتباه است"); return; }
      navigate({ to: "/", replace: true });
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      setBusy(false);
      if (error) { toast.error(error.message); return; }
      if (data.session) navigate({ to: "/", replace: true });
      else toast.success("لینک تأیید به ایمیل شما ارسال شد");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="mb-10 flex flex-col items-center gap-4 text-center">
        <span className="grid size-16 place-items-center rounded-2xl bg-primary/15 text-primary">
          <Wallet className="size-8" />
        </span>
        <h1 className="text-2xl font-bold">حسابداری شخصی</h1>
        <p className="text-sm text-muted-foreground">دخل و خرجت را ساده نگه دار</p>
      </div>
      <form onSubmit={submit} className="space-y-5 rounded-3xl bg-card p-6">
        <div className="space-y-2">
          <Label htmlFor="email">ایمیل</Label>
          <Input id="email" type="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">رمز عبور</Label>
          <Input id="password" type="password" dir="ltr" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 rounded-xl" />
        </div>
        <Button type="submit" disabled={busy} className="h-12 w-full rounded-xl text-base">
          {busy ? "لطفاً صبر کنید…" : mode === "login" ? "ورود" : "ثبت‌نام"}
        </Button>
        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="w-full text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "login" ? "حساب ندارید؟ ثبت‌نام کنید" : "حساب دارید؟ وارد شوید"}
        </button>
      </form>
    </main>
  );
}
