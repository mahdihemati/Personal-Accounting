/** assets_summary: valuation of non-cash assets from cached prices. Missing price or unconfirmed unit → null, never zero. */
import { ASSET_CATALOG, GROUP_LABEL, isAssetSymbol, type AssetGroup } from "../assets-catalog";

export type AssetRow = { id: string; symbol: string; quantity: number; label: string | null; acquired_on: string | null; cost_basis_toman: number | null };
export type PriceRow = { symbol: string; value_raw: number; source_timestamp: string | null; fetched_at: string };
export type IntegrationRow = {
  key_last4: string | null; key_status: "active" | "invalid" | "expired"; expires_on: string | null;
  monthly_request_cap: number; unit_divisor: number; unit_confirmed: boolean;
};

export function assetsSummary(
  assets: AssetRow[], prices: PriceRow[], integ: IntegrationRow | null, liquid_balance: number, now = new Date(),
) {
  const pm = new Map(prices.map((p) => [p.symbol, p]));
  const unitOk = !!integ?.unit_confirmed;
  const divisor = integ?.unit_divisor === 10 ? 10 : 1;
  const items = assets.filter((a) => isAssetSymbol(a.symbol)).map((a) => {
    const meta = ASSET_CATALOG[a.symbol as keyof typeof ASSET_CATALOG];
    const p = pm.get(a.symbol);
    const unit_price_toman = p && unitOk ? Math.round(p.value_raw / divisor) : null;
    const value_toman = unit_price_toman == null ? null : Math.round(a.quantity * (p!.value_raw / divisor));
    const ts = p?.source_timestamp ?? p?.fetched_at ?? null;
    const price_age_hours = ts ? Math.max(0, Math.round(((now.getTime() - new Date(ts).getTime()) / 3600_000) * 10) / 10) : null;
    return {
      id: a.id, symbol: a.symbol, name: meta.name, unit: meta.unit, group: meta.group as AssetGroup,
      quantity: a.quantity, label: a.label, acquired_on: a.acquired_on, cost_basis_toman: a.cost_basis_toman,
      unit_price_toman, value_toman, price_age_hours,
      gain_toman: value_toman != null && a.cost_basis_toman != null ? value_toman - a.cost_basis_toman : null,
    };
  });
  const valued = items.filter((i) => i.value_toman != null);
  const allValued = items.length > 0 && valued.length === items.length;
  const total = valued.reduce((s, i) => s + i.value_toman!, 0);
  const groups = (Object.keys(GROUP_LABEL) as AssetGroup[]).map((g) => {
    const gi = items.filter((i) => i.group === g);
    const gv = gi.filter((i) => i.value_toman != null);
    return { group: g, label: GROUP_LABEL[g], count: gi.length, total_toman: gi.length && gv.length === gi.length ? gv.reduce((s, i) => s + i.value_toman!, 0) : null };
  }).filter((g) => g.count > 0);
  const ages = items.map((i) => i.price_age_hours).filter((x): x is number => x != null);
  const assets_total_toman = items.length === 0 ? 0 : allValued ? total : null;
  return {
    status: !integ ? "no_key" : !unitOk && prices.length ? "unit_unconfirmed" : "ok",
    count: items.length,
    items,
    by_group: groups,
    assets_total_toman,
    valued_count: valued.length,
    oldest_price_age_hours: ages.length ? Math.max(...ages) : null,
    newest_price_age_hours: ages.length ? Math.min(...ages) : null,
    liquid_balance_toman: liquid_balance,
    net_worth_estimate_toman: assets_total_toman == null ? null : liquid_balance + assets_total_toman,
    net_worth_label: "تخمین، بدون احتساب بدهی",
    price_source: "نوسان",
  };
}
