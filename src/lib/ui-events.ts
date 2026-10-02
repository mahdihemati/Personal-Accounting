/** Tiny app-wide events so toasts and cards can open the transaction form from anywhere. */
export type TxPrefill = { amount: number; category_id: string | null; note: string; decision_id: string };

export function openTransactionEditor(id: string) {
  window.dispatchEvent(new CustomEvent("app:edit-transaction", { detail: { id } }));
}
export function openTransactionPrefill(p: TxPrefill) {
  window.dispatchEvent(new CustomEvent("app:new-transaction", { detail: p }));
}
