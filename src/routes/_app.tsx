import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Home, ListOrdered, Mic, PieChart, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { VoiceOverlay } from "@/components/VoiceOverlay";

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
  { to: "/insights", label: "تحلیل", icon: PieChart },
  { to: "/settings", label: "تنظیمات", icon: Settings },
] as const;

function AppShell() {
  const [voice, setVoice] = useState(false);
  return (
    <div className="mx-auto min-h-screen max-w-lg pb-32">
      <Outlet />
      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <div className="relative grid grid-cols-5 items-end rounded-3xl bg-surface/95 px-2 py-2 backdrop-blur">
          {tabs.slice(0, 2).map((t) => <Tab key={t.to} {...t} />)}
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
          {tabs.slice(2).map((t) => <Tab key={t.to} {...t} />)}
        </div>
      </nav>
      {voice && <VoiceOverlay onClose={() => setVoice(false)} />}
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
