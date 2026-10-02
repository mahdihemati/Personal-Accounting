import { format as jFormat } from "date-fns-jalali";

const FA = "۰۱۲۳۴۵۶۷۸۹";

export function toFa(v: string | number): string {
  return String(v).replace(/\d/g, (d) => FA.charAt(Number(d)));
}

export function toEnDigits(v: string): string {
  return v
    .replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

export function groupDigits(n: number): string {
  return toFa(Math.abs(Math.round(n)).toLocaleString("en-US")).replace(/,/g, "٬");
}

export function formatToman(n: number): string {
  return `${n < 0 ? "−" : ""}${groupDigits(n)} تومان`;
}

export function formatTomanShort(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  const units: [number, string][] = [
    [1e9, "میلیارد"],
    [1e6, "میلیون"],
    [1e3, "هزار"],
  ];
  for (const [v, label] of units) {
    if (a >= v) {
      const x = Math.round((a / v) * 10) / 10;
      const s = toFa(String(x)).replace(".", "٫");
      return `${sign}${s} ${label} تومان`;
    }
  }
  return formatToman(n);
}

export function parseAmount(v: string): number {
  const digits = toEnDigits(v).replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

export function jDate(d: Date | string, pattern = "d MMMM yyyy"): string {
  return toFa(jFormat(new Date(d), pattern));
}
