import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { GraduationCap, Home, ListOrdered, Mic, PieChart, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { VoiceOverlay } from "@/components/VoiceOverlay";
import { GlobalTransactionEditor } from "@/components/GlobalTransactionEditor";
import { dailyAlertCheck } from "@/lib/metrics-data";
import { useAutoPriceRefresh } from "@/lib/assets-data";

let defaultsEnsuredFor: string | null = null;

export const Route = createFileRoute("/_app")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) throw redirect({ to: "/auth" });
    if (defaultsEnsuredFor !== user.id) {
      await supabase.rpc("ensure_defaults");
      defaultsEnsuredFor = user.id;
    }
    return { user };
  },
  component: AppShell,
});

const tabs = [
  { to: "/", label: "خانه", icon: Home },
  { to: "/transactions", label: "تراکنش‌ها", icon: ListOrdered },
  { to: "/learn", label: "یادگیری", icon: GraduationCap },
  { to: "/insights", label: "تحلیل", icon: PieChart },
  { to: "/settings", label: "تنظیمات", icon: Settings },
] as const;

function AppShell() {
  const [voice, setVoice] = useState(false);
  const [voiceStart, setVoiceStart] = useState(false);
  const qc = useQueryClient();
  useAutoPriceRefresh();
  // Once a day on app open: check categories spending faster than usual.
  useEffect(() => { void dailyAlertCheck().then(() => qc.invalidateQueries({ queryKey: ["alerts"] })); }, [qc]);
  // "?voice=1" (home-screen shortcut): show a big Start button — browsers require a tap before using the mic.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("voice") === "1") {
      setVoiceStart(true);
      url.searchParams.delete("voice");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }, []);
  return (
    <div className="mx-auto min-h-screen max-w-lg pb-32">
      <Outlet />
      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <div className="relative grid grid-cols-6 items-end rounded-3xl bg-surface/95 px-2 py-2 backdrop-blur">
          {tabs.slice(0, 3).map((t) => <Tab key={t.to} {...t} />)}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setVoice(true)}
              aria-label="ثبت صوتی"
              className="-mt-10 grid size-16 place-items-center rounded-full bg-primary text-primary-foreground shadow-fab ring-4 ring-background transition-transform active:scale-95"
            >
              <Mic className="size-7" />
            </button>
          </div>
          {tabs.slice(3).map((t) => <Tab key={t.to} {...t} />)}
        </div>
      </nav>
      {voiceStart && !voice && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background/95 px-6 backdrop-blur-md">
          <p className="text-lg font-semibold">ثبت صوتی</p>
          <button
            type="button"
            onClick={() => { setVoiceStart(false); setVoice(true); }}
            className="grid size-40 place-items-center rounded-full bg-primary text-2xl font-bold text-primary-foreground shadow-fab active:scale-95"
          >
            شروع
          </button>
          <Button variant="ghost" onClick={() => setVoiceStart(false)}>بستن</Button>
        </div>
      )}
      {voice && <VoiceOverlay onClose={() => setVoice(false)} />}
      <GlobalTransactionEditor />
    </div>
  );
}

function Tab({ to, label, icon: Icon }: (typeof tabs)[number]) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: true }}
      className="flex flex-col items-center gap-1 rounded-2xl py-1.5 text-[11px] text-muted-foreground transition-colors"
      activeProps={{ className: "text-primary" }}
    >
      <Icon className="size-5" />
      {label}
    </Link>
  );
}
