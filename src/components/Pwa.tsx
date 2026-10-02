import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { initPwa } from "@/lib/pwa";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: BIPEvent | null = null;
const listeners = new Set<() => void>();

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);

/** Mounted once in the root: SW registration, update toast, install-prompt capture, one-time iOS hint. */
export function PwaBoot() {
  const [iosHint, setIosHint] = useState(false);
  useEffect(() => {
    void initPwa((update) => {
      toast.info("نسخه‌ی جدید آماده است", { description: "برای دریافت تغییرات تازه به‌روزرسانی کنید.", duration: Infinity, action: { label: "به‌روزرسانی", onClick: update } });
    });
    const onBip = (e: Event) => { e.preventDefault(); deferred = e as BIPEvent; listeners.forEach((l) => l()); };
    window.addEventListener("beforeinstallprompt", onBip);
    if (isIos() && !isStandalone() && window.self === window.top && !localStorage.getItem("ios-install-hint-dismissed")) setIosHint(true);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  if (!iosHint) return null;
  return (
    <div className="fixed inset-x-3 top-3 z-50 mx-auto flex max-w-lg items-start gap-3 rounded-2xl bg-card p-4 shadow-lg" dir="rtl">
      <Share className="mt-0.5 size-5 shrink-0 text-primary" />
      <p className="flex-1 text-sm">برای نصب: دکمه‌ی Share و بعد «Add to Home Screen» را بزنید.</p>
      <button type="button" aria-label="بستن" onClick={() => { localStorage.setItem("ios-install-hint-dismissed", "1"); setIosHint(false); }}>
        <X className="size-4 text-muted-foreground" />
      </button>
    </div>
  );
}

/** Settings row: "Install app" button when the browser offers an install prompt (Chrome/Android). */
export function InstallSection() {
  const [, force] = useState(0);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    setInstalled(isStandalone());
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  if (installed || !deferred) return null;
  return (
    <Button
      variant="secondary"
      className="h-12 w-full rounded-2xl"
      onClick={async () => {
        const e = deferred;
        if (!e) return;
        await e.prompt();
        const { outcome } = await e.userChoice;
        deferred = null;
        force((n) => n + 1);
        if (outcome === "accepted") setInstalled(true);
      }}
    >
      <Download /> نصب اپ
    </Button>
  );
}
