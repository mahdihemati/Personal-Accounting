import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

const BARS = 28;

export function VoiceOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-background/95 px-6 py-10 backdrop-blur-md animate-in fade-in">
      <div className="flex w-full max-w-lg justify-start">
        <Button size="icon" variant="ghost" onClick={onClose} aria-label="بستن" className="rounded-full">
          <X />
        </Button>
      </div>
      <div className="flex flex-col items-center gap-10">
        <div className="relative grid place-items-center">
          <span className="absolute size-28 rounded-full bg-primary/30 animate-pulse-ring" />
          <span className="absolute size-28 rounded-full bg-primary/20 animate-pulse-ring [animation-delay:0.6s]" />
          <span className="size-28 rounded-full bg-primary shadow-fab" />
        </div>
        <div className="flex h-24 items-center gap-1.5" aria-hidden>
          {Array.from({ length: BARS }).map((_, i) => (
            <span
              key={i}
              className="h-full w-1.5 rounded-full bg-primary animate-wave"
              style={{ animationDelay: `${(i % 7) * 0.12 + (i % 3) * 0.05}s`, opacity: 0.4 + ((i * 37) % 60) / 100 }}
            />
          ))}
        </div>
        <div className="text-center">
          <p className="text-xl font-semibold">در حال گوش دادن…</p>
          <p className="mt-2 text-sm text-muted-foreground">مثلاً بگویید «صد و پنجاه هزار تومان خرید نان»</p>
        </div>
      </div>
      <Button variant="secondary" onClick={onClose} className="h-12 w-full max-w-xs rounded-full">
        لغو
      </Button>
    </div>
  );
}
