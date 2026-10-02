/** Persian spoken amounts, e.g. 2300000 → «دو میلیون و سیصد هزار تومان». */
const ONES = ["", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه"];
const TEENS = ["ده", "یازده", "دوازده", "سیزده", "چهارده", "پانزده", "شانزده", "هفده", "هجده", "نوزده"];
const TENS = ["", "", "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود"];
const HUNDREDS = ["", "صد", "دویست", "سیصد", "چهارصد", "پانصد", "ششصد", "هفتصد", "هشتصد", "نهصد"];
const SCALES = ["", "هزار", "میلیون", "میلیارد", "هزار میلیارد"];

function under1000(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100), r = n % 100;
  if (h) parts.push(HUNDREDS[h]!);
  if (r >= 10 && r < 20) parts.push(TEENS[r - 10]!);
  else {
    const t = Math.floor(r / 10), o = r % 10;
    if (t) parts.push(TENS[t]!);
    if (o) parts.push(ONES[o]!);
  }
  return parts.join(" و ");
}

export function numberToWords(value: number): string {
  let n = Math.round(Math.abs(value));
  if (n === 0) return "صفر";
  const groups: string[] = [];
  let i = 0;
  while (n > 0 && i < SCALES.length) {
    const g = n % 1000;
    if (g) groups.unshift(i === 1 && g === 1 ? "هزار" : [under1000(g), SCALES[i]].filter(Boolean).join(" "));
    n = Math.floor(n / 1000);
    i++;
  }
  return (value < 0 ? "منفی " : "") + groups.join(" و ");
}

export const spokenToman = (n: number) => `${numberToWords(n)} تومان`;

/** Adds `<key>_text` next to every numeric field whose key ends in `_toman` (recursively). */
export function withSpoken<T>(v: T): T {
  if (Array.isArray(v)) return v.map(withSpoken) as T;
  if (!v || typeof v !== "object" || v instanceof Date) return v;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    out[k] = withSpoken(val);
    if (k.endsWith("_toman")) out[`${k}_text`] = typeof val === "number" ? spokenToman(val) : null;
  }
  return out as T;
}
