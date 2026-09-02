import type { ExtractedExpense, RuleResult } from "@receipt/shared";

export const POLICY_VERSION = "2026-09-any-currency-v3";
const limits: Partial<Record<ExtractedExpense["category"], number>> = {
  meals: 75,
  transport: 150,
  office_supplies: 200
};

export type PolicyContext = { duplicate: boolean };
export type PolicyDecision = {
  decision: "Approved" | "Rejected" | "Needs Review";
  explanation: string;
  rules: RuleResult[];
  ambiguous: boolean;
};

export function evaluatePolicy(expense: ExtractedExpense, context: PolicyContext): PolicyDecision {
  const rules: RuleResult[] = [];
  const add = (code: string, label: string, outcome: RuleResult["outcome"], explanation: string) =>
    rules.push({ code, label, outcome, explanation });

  add("duplicate", "Duplicate receipt", context.duplicate ? "fail" : "pass",
    context.duplicate ? "An identical receipt was previously submitted." : "No identical prior receipt was found.");

  const prohibited = expense.items.filter((item) => item.isAlcohol || item.isPersonal);
  add("prohibited_items", "Prohibited items", prohibited.length ? "fail" : "pass",
    prohibited.length ? `Prohibited or personal items detected: ${prohibited.map((i) => i.name).join(", ")}.` : "No prohibited items were detected.");

  if (expense.category === "lodging") {
    if (!expense.lodgingNights) add("category_limit", "Lodging limit", "ambiguous", "The number of lodging nights is unclear.");
    else {
      const perNight = expense.total / expense.lodgingNights;
      add("category_limit", "Lodging limit", perNight <= 300 ? "pass" : "fail",
        `The calculated rate is ${perNight.toFixed(2)} ${expense.currency} per night; the numeric limit is 300 in the receipt currency.`);
    }
  } else if (expense.category === "other") {
    add("category_limit", "Eligible category", "ambiguous", "The expense does not clearly match an eligible category.");
  } else {
    const limit = limits[expense.category];
    add("category_limit", "Category limit", expense.total <= (limit ?? 0) ? "pass" : "fail",
      `The ${expense.category.replace("_", " ")} total is ${expense.total.toFixed(2)} ${expense.currency}; the numeric limit is ${limit} in the receipt currency.`);
  }

  if (expense.confidence < 0.75 || expense.ambiguities.length) {
    add("extraction_confidence", "Extraction confidence", "ambiguous",
      expense.ambiguities.length ? expense.ambiguities.join(" ") : "Receipt extraction confidence is below 75%." );
  } else add("extraction_confidence", "Extraction confidence", "pass", "Required receipt fields were extracted confidently.");

  const failed = rules.filter((r) => r.outcome === "fail");
  const ambiguous = rules.filter((r) => r.outcome === "ambiguous");
  if (failed.length) return { decision: "Rejected", explanation: failed.map((r) => r.explanation).join(" "), rules, ambiguous: false };
  if (ambiguous.length) return { decision: "Needs Review", explanation: ambiguous.map((r) => r.explanation).join(" "), rules, ambiguous: true };
  return { decision: "Approved", explanation: "The receipt satisfies every reimbursement policy.", rules, ambiguous: false };
}
