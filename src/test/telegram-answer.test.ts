import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client.server", () => ({}));
import { accountBalances } from "@/lib/telegram-answer.server";

describe("accountBalances", () => {
  it("applies income, expense and transfers", () => {
    const r = accountBalances(
      [{ id: "a", name: "ملت", initial_balance: 1000 }, { id: "b", name: "نقد", initial_balance: 0 }],
      [
        { amount: 500, kind: "income", account_id: "a", to_account_id: null },
        { amount: 200, kind: "expense", account_id: "a", to_account_id: null },
        { amount: 300, kind: "transfer", account_id: "a", to_account_id: "b" },
      ],
    );
    expect(r.accounts).toEqual([{ name: "ملت", balance: 1000 }, { name: "نقد", balance: 300 }]);
    expect(r.total).toBe(1300);
  });
});
