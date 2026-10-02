import { afterTransactionsSaved } from "@/components/AlertToast";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useVoiceSession, type VoiceStatus } from "@/lib/voice/useVoiceSession";
import { VoiceConfirmCard } from "@/components/VoiceConfirmCard";
import type { PendingBatch } from "@/lib/voice/tools";

const BARS = 28;
const STATUS_LABEL: Record<VoiceStatus, string> = {
  connecting: "در حال اتصال…",
  listening: "گوش می‌دهم…",
  speaking: "در حال صحبت…",
  error: "خطا",
};

export function VoiceOverlay({ onClose }: { onClose: () => void }) {
  const v = useVoiceSession();
  const qc = useQueryClient();
  const barsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const level = v.getLevel();
      const el = barsRef.current;
      if (el) {
        const t = performance.now() / 180;
        Array.from(el.children).forEach((c, i) => {
          const wobble = 0.55 + 0.45 * Math.sin(t + i * 0.7);
          (c as HTMLElement).style.transform = `scaleY(${Math.max(0.08, level * wobble)})`;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [v.getLevel]);

  useEffect(() => {
    v.onSaved.current = () => void qc.invalidateQueries({ queryKey: ["transactions"] });
    v.onInserted.current = (ids) => { if (ids.length) void afterTransactionsSaved(ids, qc); };
  }, [v.onSaved, v.onInserted, qc]);

  async function decide(action: "confirm_all" | "cancel_all" | "remove_item", opts?: { index?: number; edited?: PendingBatch }) {
    const res = await v.decide(action, opts);
    if (res.ok && action === "confirm_all") void qc.invalidateQueries({ queryKey: ["transactions"] });
    return res;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between gap-4 overflow-y-auto bg-background/95 px-6 py-8 backdrop-blur-md animate-in fade-in">
      <div className="flex w-full max-w-lg justify-start">
        <Button size="icon" variant="ghost" onClick={onClose} aria-label="بستن" className="rounded-full">
          <X />
        </Button>
      </div>
      <div className="flex w-full max-w-lg flex-col items-center gap-6">
        <div className="relative grid place-items-center">
          {v.status !== "error" && <span className="absolute size-24 rounded-full bg-primary/25 animate-pulse-ring" />}
          <span className={`size-24 rounded-full shadow-fab ${v.status === "error" ? "bg-destructive" : "bg-primary"}`} />
        </div>
        <div ref={barsRef} className="flex h-20 items-center gap-1.5" aria-hidden>
          {Array.from({ length: BARS }).map((_, i) => (
            <span key={i} className="h-full w-1.5 origin-center rounded-full bg-primary transition-transform duration-75"
              style={{ transform: "scaleY(0.08)", opacity: 0.45 + ((i * 37) % 55) / 100 }} />
          ))}
        </div>
        <div className="w-full text-center" aria-live="polite">
          <p className={`text-xl font-semibold ${v.status === "error" ? "text-destructive" : ""}`}>{STATUS_LABEL[v.status]}</p>
          {v.error && <p className="mt-2 text-sm text-destructive">{v.error}</p>}
          {!v.error && !v.userText && !v.assistantText && (
            <p className="mt-2 text-sm text-muted-foreground">مثلاً بگویید «صد و پنجاه هزار تومان خرید نان»</p>
          )}
          {v.userText && <p className="mt-4 rounded-xl bg-secondary px-4 py-2 text-sm">{v.userText}</p>}
          {v.assistantText && <p className="mt-2 rounded-xl bg-primary/10 px-4 py-2 text-sm text-primary">{v.assistantText}</p>}
        </div>
      </div>
      <div className="flex w-full max-w-lg flex-col items-center gap-3">
        {v.pending && (
          <VoiceConfirmCard batch={v.pending} categories={v.categories()} accounts={v.accounts()}
            onDecide={decide} onChange={v.updatePending} />
        )}
        <Button variant="secondary" onClick={onClose} className="h-12 w-full max-w-xs rounded-full">پایان</Button>
      </div>
    </div>
  );
}
