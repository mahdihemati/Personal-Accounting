import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { signUpWithUsername, usernameToEmail } from "@/lib/auth.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "ورود | حسابداری شخصی" },
      { name: "description", content: "ورود یا ثبت‌نام با نام کاربری در اپ حسابداری شخصی فارسی." },
      { property: "og:title", content: "ورود | حسابداری شخصی" },
      { property: "og:description", content: "ورود یا ثبت‌نام با نام کاربری در اپ حسابداری شخصی فارسی." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const signUp = useServerFn(signUpWithUsername);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(true);

  // Already signed in (remembered session) → go straight in.
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const name = username.trim().toLowerCase();
    if (mode === "signup") {
      const result = await signUp({ data: { username: name, password } });
      if (!result.ok) {
        setBusy(false);
        toast.error(result.error);
        return;
      }
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(name),
      password,
    });
    setBusy(false);
    if (error) {
      toast.error(mode === "login" ? "نام کاربری یا رمز عبور اشتباه است" : "ورود خودکار ناموفق بود؛ دوباره وارد شوید");
      return;
    }
    localStorage.setItem("remember-me", remember ? "1" : "0");
    sessionStorage.setItem("session-alive", "1");
    navigate({ to: "/", replace: true });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="mb-10 flex flex-col items-center gap-4 text-center">
        <div className="flex size-16 items-center justify-center rounded-3xl bg-primary/15 text-primary">
          <Wallet className="size-8" />
        </div>
        <h1 className="text-2xl font-bold">حسابداری شخصی</h1>
        <p className="text-sm text-muted-foreground">دخل و خرجت را ساده نگه دار</p>
      </div>
      <form onSubmit={submit} className="space-y-5 rounded-3xl bg-card p-6">
        <div className="space-y-2">
          <Label htmlFor="username">نام کاربری</Label>
          <Input id="username" dir="ltr" required autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} className="h-12 rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">رمز عبور</Label>
          <Input id="password" type="password" dir="ltr" required minLength={6} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 rounded-xl" />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 accent-primary" />
          مرا به خاطر بسپار
        </label>
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
