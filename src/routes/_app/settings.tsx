import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, LogOut, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AlertSettings } from "@/components/AlertSettings";
import { PlanSettings } from "@/components/PlanSettings";
import { LearningSettings } from "@/components/LearningSettings";
import { InstallSection } from "@/components/Pwa";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  ACCOUNT_TYPE_LABEL,
  useAccountBalances,
  useAccounts,
  useCategories,
  useInvalidate,
  type Account,
  type AccountType,
  type Category,
  type Kind,
} from "@/lib/data";
import { formatToman, groupDigits, parseAmount } from "@/lib/format";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({
    meta: [
      { title: "تنظیمات | حسابداری شخصی" },
      { name: "description", content: "مدیریت حساب‌ها و دسته‌بندی‌ها." },
      { property: "og:title", content: "تنظیمات | حسابداری شخصی" },
      { property: "og:description", content: "مدیریت حساب‌ها و دسته‌بندی‌ها." },
    ],
  }),
  component: SettingsPage,
});

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#64748b"];

function SettingsPage() {
  const { data: accounts = [] } = useAccounts();
  const balances = useAccountBalances();
  const invalidateAll = useInvalidate();
  async function setNecessity(id: string, essential: boolean) {
    const { error } = await supabase.from("categories").update({ necessity: essential ? "essential" : "flexible" }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await invalidateAll("categories");
  }
  const { data: categories = [] } = useCategories();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [acc, setAcc] = useState<Partial<Account> | null>(null);
  const [cat, setCat] = useState<Partial<Category> | null>(null);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <main className="space-y-6 px-5 pt-8">
      <h1 className="text-2xl font-bold">تنظیمات</h1>

      <Link to="/budgets" className="flex items-center justify-between rounded-3xl bg-card px-5 py-4 hover:bg-muted/60">
        <span>
          <span className="block font-semibold">بودجه‌ی ماهانه</span>
          <span className="text-xs text-muted-foreground">سقف هزینه برای هر دسته</span>
        </span>
        <ChevronLeft className="text-muted-foreground" />
      </Link>

      <section className="rounded-3xl bg-card p-2">
        <div className="flex items-center justify-between px-3 pt-2">
          <p className="font-semibold">حساب‌ها</p>
          <Button size="sm" variant="ghost" onClick={() => setAcc({ type: "card", initial_balance: 0, name: "" })}>
            <Plus /> افزودن
          </Button>
        </div>
        {accounts.map((a) => (
          <button key={a.id} onClick={() => setAcc(a)} className="flex w-full items-center justify-between rounded-2xl px-3 py-3 text-right hover:bg-muted/60">
            <span>
              <span className="block font-medium">{a.name}</span>
              <span className="text-xs text-muted-foreground">{ACCOUNT_TYPE_LABEL[a.type]}</span>
            </span>
            <span className="text-left">
              <span className="block text-sm font-semibold tabular-nums">{formatToman(balances.get(a.id) ?? Number(a.initial_balance))}</span>
              <span className="text-[11px] text-muted-foreground">موجودی فعلی</span>
            </span>
          </button>
        ))}
      </section>

      <section className="rounded-3xl bg-card p-2">
        <div className="flex items-center justify-between px-3 pt-2">
          <p className="font-semibold">دسته‌بندی‌ها</p>
          <Button size="sm" variant="ghost" onClick={() => setCat({ kind: "expense", color: COLORS[0]!, name: "" })}>
            <Plus /> افزودن
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 p-3">
          {categories.map((c) => (
            <span key={c.id} className="flex items-center gap-2 rounded-full bg-muted px-3 py-2 text-sm">
              <button type="button" onClick={() => setCat(c)} className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: c.color ?? "#64748b" }} />
                {c.name}
                <span className="text-xs text-muted-foreground">{c.kind === "income" ? "درآمد" : "هزینه"}</span>
              </button>
              {c.kind === "expense" && (
                <label className="flex items-center gap-1.5 border-r border-border pr-2 text-xs text-muted-foreground">
                  ضروری
                  <Switch checked={c.necessity === "essential"} onCheckedChange={(on) => void setNecessity(c.id, on)} />
                </label>
              )}
            </span>
          ))}
        </div>
      </section>

      <PlanSettings />
      <AlertSettings />
      <LearningSettings />
      <InstallSection />

      <Button variant="outline" onClick={signOut} className="h-12 w-full rounded-2xl text-expense">
        <LogOut /> خروج از حساب
      </Button>

      <AccountDialog value={acc} onClose={() => setAcc(null)} />
      <CategoryDialog value={cat} onClose={() => setCat(null)} />
    </main>
  );
}

function AccountDialog({ value, onClose }: { value: Partial<Account> | null; onClose: () => void }) {
  const invalidate = useInvalidate();
  const [v, setV] = useState<Partial<Account>>({});
  const open = !!value;
  useEffect(() => { if (value) setV(value); }, [value]);

  function close() { setV({}); onClose(); }

  async function save() {
    if (!v.name?.trim()) { toast.error("نام حساب را وارد کنید"); return; }
    const row = { name: v.name.trim(), type: v.type as AccountType, initial_balance: Number(v.initial_balance ?? 0) };
    const { error } = v.id
      ? await supabase.from("accounts").update(row).eq("id", v.id)
      : await supabase.from("accounts").insert(row);
    if (error) { toast.error(error.message); return; }
    await invalidate("accounts");
    close();
  }
  async function remove() {
    const { error } = await supabase.from("accounts").delete().eq("id", v.id!);
    if (error) { toast.error(error.message); return; }
    await invalidate("accounts", "transactions");
    toast.success("حساب و تراکنش‌هایش حذف شد");
    close();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent dir="rtl" className="rounded-3xl">
        <DialogHeader className="text-right"><DialogTitle>{v.id ? "ویرایش حساب" : "حساب جدید"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label>نام</Label><Input value={v.name ?? ""} onChange={(e) => setV({ ...v, name: e.target.value })} className="h-12 rounded-xl" /></div>
          <div className="space-y-2">
            <Label>نوع</Label>
            <Select value={v.type ?? "card"} onValueChange={(t) => setV({ ...v, type: t as AccountType })} dir="rtl">
              <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((k) => <SelectItem key={k} value={k}>{ACCOUNT_TYPE_LABEL[k]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>موجودی اولیه (تومان)</Label>
            <Input inputMode="numeric" value={v.initial_balance ? groupDigits(Number(v.initial_balance)) : ""} onChange={(e) => setV({ ...v, initial_balance: parseAmount(e.target.value) })} className="h-12 rounded-xl" placeholder="۰" />
          </div>
          <div className="flex gap-2">
            <Button onClick={save} className="h-12 flex-1 rounded-xl">ذخیره</Button>
            {v.id && <Button variant="outline" size="icon" onClick={remove} className="size-12 rounded-xl text-expense" aria-label="حذف"><Trash2 /></Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CategoryDialog({ value, onClose }: { value: Partial<Category> | null; onClose: () => void }) {
  const invalidate = useInvalidate();
  const [v, setV] = useState<Partial<Category>>({});
  const open = !!value;
  useEffect(() => { if (value) setV(value); }, [value]);

  function close() { setV({}); onClose(); }

  async function save() {
    if (!v.name?.trim()) { toast.error("نام دسته را وارد کنید"); return; }
    const row = { name: v.name.trim(), kind: v.kind as Kind, color: v.color ?? null };
    const { error } = v.id
      ? await supabase.from("categories").update(row).eq("id", v.id)
      : await supabase.from("categories").insert(row);
    if (error) { toast.error(error.message); return; }
    await invalidate("categories");
    close();
  }
  async function remove() {
    const { error } = await supabase.from("categories").delete().eq("id", v.id!);
    if (error) { toast.error(error.message); return; }
    await invalidate("categories", "transactions");
    close();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent dir="rtl" className="rounded-3xl">
        <DialogHeader className="text-right"><DialogTitle>{v.id ? "ویرایش دسته" : "دسته‌ی جدید"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label>نام</Label><Input value={v.name ?? ""} onChange={(e) => setV({ ...v, name: e.target.value })} className="h-12 rounded-xl" /></div>
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1">
            {(["expense", "income"] as Kind[]).map((k) => (
              <button key={k} type="button" onClick={() => setV({ ...v, kind: k })} className={`rounded-xl py-2 text-sm ${v.kind === k ? "bg-card font-medium" : "text-muted-foreground"}`}>
                {k === "income" ? "درآمد" : "هزینه"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setV({ ...v, color: c })} aria-label="رنگ" className={`size-9 rounded-full ring-offset-2 ring-offset-background ${v.color === c ? "ring-2 ring-foreground" : ""}`} style={{ backgroundColor: c }} />
            ))}
          </div>
          <div className="flex gap-2">
            <Button onClick={save} className="h-12 flex-1 rounded-xl">ذخیره</Button>
            {v.id && <Button variant="outline" size="icon" onClick={remove} className="size-12 rounded-xl text-expense" aria-label="حذف"><Trash2 /></Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
