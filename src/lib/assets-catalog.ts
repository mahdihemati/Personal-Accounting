/** Fixed catalog of priced asset symbols (Navasan item codes). Mirrors the DB check constraint. */
export const ASSET_CATALOG = {
  usd_sell: { name: "دلار آمریکا", unit: "دلار", group: "currency" },
  eur: { name: "یورو", unit: "یورو", group: "currency" },
  aed_sell: { name: "درهم امارات", unit: "درهم", group: "currency" },
  sekkeh: { name: "سکه امامی", unit: "عدد", group: "coin" },
  bahar: { name: "سکه بهار آزادی", unit: "عدد", group: "coin" },
  nim: { name: "نیم‌سکه", unit: "عدد", group: "coin" },
  rob: { name: "ربع‌سکه", unit: "عدد", group: "coin" },
  gerami: { name: "سکه گرمی", unit: "عدد", group: "coin" },
  abshodeh: { name: "مثقال طلای آبشده", unit: "مثقال", group: "gold" },
  "18ayar": { name: "طلای ۱۸ عیار", unit: "گرم", group: "gold" },
} as const;

export type AssetSymbol = keyof typeof ASSET_CATALOG;
export type AssetGroup = (typeof ASSET_CATALOG)[AssetSymbol]["group"];
export const ASSET_SYMBOLS = Object.keys(ASSET_CATALOG) as AssetSymbol[];
export const GROUP_LABEL: Record<AssetGroup, string> = { currency: "ارز", coin: "سکه", gold: "طلا" };
export const isAssetSymbol = (s: unknown): s is AssetSymbol => typeof s === "string" && s in ASSET_CATALOG;

export const MIN_REFRESH_MS = 2 * 3600_000;
export const AUTO_REFRESH_AGE_MS = 8 * 3600_000;
/** Max successful price fetches (auto + manual) in any rolling 24h window. */
export const DAILY_FETCH_CAP = 3;
export const STALE_PRICE_HOURS = 48;
