import { useState } from "react";
import {
  addMonths,
  format,
  getDate,
  getDaysInMonth,
  isSameDay,
  setDate,
  startOfMonth,
} from "date-fns-jalali";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { jDate, toFa } from "@/lib/format";

const WEEK = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

export function JalaliDatePicker({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => startOfMonth(value));
  const days = getDaysInMonth(view);
  const offset = (view.getDay() + 1) % 7; // Saturday-first
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setView(startOfMonth(value)); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-12 w-full justify-between rounded-xl text-base">
          {jDate(value)}
          <CalendarDays className="size-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="pointer-events-auto w-72 rounded-2xl p-3" align="center">
        <div className="mb-2 flex items-center justify-between">
          <Button size="icon" variant="ghost" onClick={() => setView(addMonths(view, -1))} aria-label="ماه قبل">
            <ChevronRight />
          </Button>
          <span className="font-semibold">{toFa(format(view, "MMMM yyyy"))}</span>
          <Button size="icon" variant="ghost" onClick={() => setView(addMonths(view, 1))} aria-label="ماه بعد">
            <ChevronLeft />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
          {WEEK.map((w) => <span key={w} className="py-1">{w}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <span key={i} />;
            const date = setDate(view, d);
            const selected = isSameDay(date, value);
            const today = isSameDay(date, new Date());
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  const out = new Date(date);
                  out.setHours(value.getHours(), value.getMinutes());
                  onChange(out);
                  setOpen(false);
                }}
                className={`aspect-square rounded-lg text-sm transition-colors ${
                  selected ? "bg-primary text-primary-foreground" : today ? "bg-accent" : "hover:bg-muted"
                }`}
              >
                {toFa(getDate(date))}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
