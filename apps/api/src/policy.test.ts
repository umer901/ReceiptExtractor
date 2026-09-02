import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "./policy.js";
import type { ExtractedExpense } from "@receipt/shared";

const base: ExtractedExpense = {
  merchant: "Cafe Central", date: "2026-08-20", total: 25, currency: "EUR", category: "meals",
  items: [{ name: "Lunch", quantity: 1, amount: 25, isAlcohol: false, isPersonal: false }],
  lodgingNights: null, confidence: 0.98, ambiguities: []
};
describe("evaluatePolicy", () => {
  it("approves a compliant expense", () => expect(evaluatePolicy(base, { duplicate: false }).decision).toBe("Approved"));
  it("does not apply a receipt-age rule", () => {
    const result = evaluatePolicy({ ...base, date: "2020-01-01" }, { duplicate: false });
    expect(result.decision).toBe("Approved");
    expect(result.rules.some((rule) => rule.code === "receipt_age")).toBe(false);
  });
  it("rejects an over-limit meal", () => expect(evaluatePolicy({ ...base, total: 76 }, { duplicate: false }).decision).toBe("Rejected"));
  it("rejects prohibited alcohol", () => expect(evaluatePolicy({ ...base, items: [{ ...base.items[0]!, isAlcohol: true }] }, { duplicate: false }).decision).toBe("Rejected"));
  it("applies limits directly in any receipt currency", () => {
    const result = evaluatePolicy({ ...base, currency: "USD" }, { duplicate: false });
    expect(result.decision).toBe("Approved");
    expect(result.rules.some((rule) => rule.code === "currency")).toBe(false);
  });
  it("marks lodging without nights for review", () => expect(evaluatePolicy({ ...base, category: "lodging" }, { duplicate: false }).decision).toBe("Needs Review"));
  it("rejects duplicate receipts", () => expect(evaluatePolicy(base, { duplicate: true }).decision).toBe("Rejected"));
});
