import { describe, expect, it } from "vitest";
import { ExtractedExpenseSchema } from "./index.js";

describe("ExtractedExpenseSchema", () => {
  it("accepts a complete structured receipt", () => {
    const value = ExtractedExpenseSchema.parse({
      merchant: "Central Cafe", date: "2026-09-01", total: 12.5, currency: "EUR", category: "meals",
      items: [{ name: "Lunch", quantity: 1, amount: 12.5, isAlcohol: false, isPersonal: false }],
      lodgingNights: null, confidence: 0.98, ambiguities: []
    });
    expect(value.currency).toBe("EUR");
  });

  it("rejects invalid dates and confidence", () => {
    const result = ExtractedExpenseSchema.safeParse({
      merchant: "Shop", date: "01/09/2026", total: 10, currency: "EUR", category: "other",
      items: [], lodgingNights: null, confidence: 2, ambiguities: []
    });
    expect(result.success).toBe(false);
  });
});
