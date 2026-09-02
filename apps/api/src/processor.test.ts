import { describe, expect, it, vi } from "vitest";
import type { ExtractedExpense } from "@receipt/shared";
import type { SubmissionRow } from "./db.js";
import { failInterruptedSubmissions, runSubmission, type ProcessorDependencies } from "./processor.js";

const expense: ExtractedExpense = {
  merchant: "Cafe Central", date: "2026-08-20", total: 25, currency: "EUR", category: "meals",
  items: [{ name: "Lunch", quantity: 1, amount: 25, isAlcohol: false, isPersonal: false }],
  lodgingNights: null, confidence: 0.98, ambiguities: []
};

function createDependencies(overrides: Partial<ProcessorDependencies> = {}): ProcessorDependencies {
  const row = {
    id: "4ca859ff-909a-4d3c-9148-30e49d89dd51", filename: "receipt.jpg", mime_type: "image/jpeg",
    file_data: Buffer.from("receipt"), file_hash: "hash", status: "queued", decision: null, explanation: null,
    extracted_expense: null, rule_results: [], policy_version: null, error: null, created_at: new Date(), updated_at: new Date()
  } satisfies SubmissionRow;
  return {
    getSubmission: vi.fn().mockResolvedValue(row), markProcessing: vi.fn().mockResolvedValue(undefined),
    findDuplicate: vi.fn().mockResolvedValue(false), markCompleted: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined), extractText: vi.fn().mockResolvedValue("receipt text"),
    structureExpense: vi.fn().mockResolvedValue(expense), explainAmbiguity: vi.fn().mockResolvedValue("Needs review."),
    ...overrides
  };
}

describe("in-process receipt processing", () => {
  it("persists a completed decision", async () => {
    const deps = createDependencies();
    await runSubmission("4ca859ff-909a-4d3c-9148-30e49d89dd51", deps);
    expect(deps.markProcessing).toHaveBeenCalledOnce();
    expect(deps.markCompleted).toHaveBeenCalledWith(expect.any(String), expense, expect.objectContaining({ decision: "Approved" }));
    expect(deps.markFailed).not.toHaveBeenCalled();
  });

  it("persists extraction failures without rejecting", async () => {
    const deps = createDependencies({ extractText: vi.fn().mockRejectedValue(new Error("OCR failed")) });
    await expect(runSubmission("4ca859ff-909a-4d3c-9148-30e49d89dd51", deps)).resolves.toBeUndefined();
    expect(deps.markFailed).toHaveBeenCalledWith(expect.any(String), "OCR failed");
  });

  it("marks interrupted submissions with one startup update", async () => {
    const execute = vi.fn().mockResolvedValue({ rowCount: 2 });
    await expect(failInterruptedSubmissions(execute)).resolves.toBe(2);
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("WHERE status IN ('queued', 'processing')"));
  });
});
