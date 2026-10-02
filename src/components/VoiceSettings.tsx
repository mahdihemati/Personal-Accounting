import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_VOICE, DEFAULT_VOICE_PREFS, VOICE_NAMES, type VoicePrefs } from "@/lib/ai-config";
import { listVoiceModels } from "@/lib/voice.functions";
import { toFa } from "@/lib/format";

const selectCls = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

/** Settings > «دستیار صوتی»: model, voice and turn-detection preferences (applied from the next conversation). */
export function VoiceSettings() {
  const qc = useQueryClient();
  const listFn = useServerFn(listVoiceModels);
  const models = useQuery({ queryKey: ["voice-models"], queryFn: () => listFn(), staleTime: 10 * 60_000 });
  const saved = useQuery({
    queryKey: ["voice-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("voice_settings").select("*").maybeSingle();
      return { ...DEFAULT_VOICE_PREFS, ...(data ?? {}) } as VoicePrefs;
    },
  });
  const [p, setP] = useState<VoicePrefs>(DEFAULT_VOICE_PREFS);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (saved.data) setP(saved.data); }, [saved.data]);

  const def = models.data?.default ?? "";
  const list = models.data?.ok ? models.data.models : [];
  const current = p.model ?? def;

  async function save(next: VoicePrefs) {
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("voice_settings").upsert({ ...next, user_id: u.user!.id, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) { toast.error("ذخیره ممکن نشد"); return; }
    toast.success("ذخیره شد؛ از گفتگوی بعدی اعمال می‌شود");
    setP(next);
    await qc.invalidateQueries({ queryKey: ["voice-settings"] });
  }

  return (
    <section className="space-y-3 rounded-2xl bg-card p-4">
      <h2 className="font-semibold">دستیار صوتی</h2>
      <div className="space-y-1">
        <Label htmlFor="vs-model">مدل</Label>
        {models.isLoading ? <p className="text-xs text-muted-foreground">در حال دریافت فهرست مدل‌ها…</p> : (
          <select id="vs-model" dir="ltr" className={selectCls} value={current} onChange={(e) => setP({ ...p, model: e.target.value === def ? null : e.target.value })}>
            {!list.some((m) => m.id === def) && def && <option value={def}>{def} (پیش‌فرض)</option>}
            {list.map((m) => <option key={m.id} value={m.id}>{m.label} — {m.id}{m.id === def ? " (پیش‌فرض)" : ""}</option>)}
          </select>
        )}
        {models.data && !models.data.ok && <p className="text-xs text-destructive">{models.data.message}</p>}
        {list.find((m) => m.id === current)?.description && (
          <p className="text-[11px] text-muted-foreground" dir="ltr">{list.find((m) => m.id === current)!.description}</p>
        )}
      </div>
      <div className="space-y-1">
        <Label htmlFor="vs-voice">صدای گوینده</Label>
        <select id="vs-voice" dir="ltr" className={selectCls} value={p.voice_name ?? DEFAULT_VOICE} onChange={(e) => setP({ ...p, voice_name: e.target.value })}>
          {VOICE_NAMES.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="vs-start">حساسیت شروع حرف</Label>
          <select id="vs-start" className={selectCls} value={p.start_sensitivity} onChange={(e) => setP({ ...p, start_sensitivity: e.target.value as "low" | "high" })}>
            <option value="high">زیاد</option><option value="low">کم</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="vs-end">حساسیت پایان حرف</Label>
          <select id="vs-end" className={selectCls} value={p.end_sensitivity} onChange={(e) => setP({ ...p, end_sensitivity: e.target.value as "low" | "high" })}>
            <option value="high">زیاد</option><option value="low">کم</option>
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="vs-silence">مکث تا پایان حرف: {toFa(p.silence_ms)} میلی‌ثانیه</Label>
        <input id="vs-silence" type="range" min={300} max={1500} step={100} value={p.silence_ms}
          onChange={(e) => setP({ ...p, silence_ms: Number(e.target.value) })} className="w-full accent-primary" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="vs-len">طول پاسخ</Label>
        <select id="vs-len" className={selectCls} value={p.reply_length} onChange={(e) => setP({ ...p, reply_length: e.target.value as "short" | "normal" })}>
          <option value="short">خیلی کوتاه</option><option value="normal">معمولی</option>
        </select>
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" disabled={busy} onClick={() => void save(p)}>ذخیره</Button>
        <Button variant="outline" disabled={busy} onClick={() => void save(DEFAULT_VOICE_PREFS)}>بازگشت به پیش‌فرض</Button>
      </div>
    </section>
  );
}
