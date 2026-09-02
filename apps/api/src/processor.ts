import { ExtractedExpenseSchema, type ExtractedExpense, type RuleResult } from "@receipt/shared";
import { pool, getSubmission, type SubmissionRow } from "./db.js";
import { explainAmbiguity, extractText, structureExpense } from "./extraction.js";
import { evaluatePolicy, POLICY_VERSION, type PolicyDecision } from "./policy.js";

export type ProcessorDependencies = {
  getSubmission(id: string): Promise<SubmissionRow | null>;
  markProcessing(id: string): Promise<void>;
  findDuplicate(hash: string, id: string): Promise<boolean>;
  markCompleted(id: string, expense: ExtractedExpense, result: PolicyDecision): Promise<void>;
  markFailed(id: string, message: string): Promise<void>;
  extractText(data: Buffer, mimeType: string): Promise<string>;
  structureExpense(text: string): Promise<ExtractedExpense>;
  explainAmbiguity(expense: ExtractedExpense, issues: string[]): Promise<string>;
};

const dependencies: ProcessorDependencies = {
  getSubmission,
  async markProcessing(id) {
    await pool.query("UPDATE submissions SET status = 'processing', error = NULL, updated_at = now() WHERE id = $1", [id]);
  },
  async findDuplicate(hash, id) {
    const result = await pool.query("SELECT 1 FROM submissions WHERE file_hash = $1 AND id <> $2 AND status = 'completed' LIMIT 1", [hash, id]);
    return Boolean(result.rowCount);
  },
  async markCompleted(id, expense, result) {
    await pool.query(
      `UPDATE submissions SET status = 'completed', decision = $2, explanation = $3,
        extracted_expense = $4, rule_results = $5, policy_version = $6, updated_at = now() WHERE id = $1`,
      [id, result.decision, result.explanation, JSON.stringify(expense), JSON.stringify(result.rules), POLICY_VERSION]
    );
  },
  async markFailed(id, message) {
    await pool.query("UPDATE submissions SET status = 'failed', error = $2, updated_at = now() WHERE id = $1", [id, message.slice(0, 1000)]);
  },
  extractText,
  structureExpense,
  explainAmbiguity
};

export async function processSubmission(id: string, deps: ProcessorDependencies = dependencies): Promise<void> {
  await deps.markProcessing(id);
  const row = await deps.getSubmission(id);
  if (!row) throw new Error(`Submission ${id} was not found`);

  const text = await deps.extractText(row.file_data, row.mime_type);
  const expense = ExtractedExpenseSchema.parse(await deps.structureExpense(text));
  const duplicate = await deps.findDuplicate(row.file_hash, id);
  const result = evaluatePolicy(expense, { duplicate });
  if (result.ambiguous) {
    const issues = result.rules.filter((rule: RuleResult) => rule.outcome === "ambiguous").map((rule: RuleResult) => rule.explanation);
    result.explanation = await deps.explainAmbiguity(expense, issues);
  }
  await deps.markCompleted(id, expense, result);
}

export async function runSubmission(id: string, deps: ProcessorDependencies = dependencies): Promise<void> {
  try {
    await processSubmission(id, deps);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown receipt processing error";
    try { await deps.markFailed(id, message); }
    catch (persistError) { console.error("Unable to persist receipt processing failure", persistError); }
  }
}

export async function failInterruptedSubmissions(
  execute: (sql: string) => Promise<{ rowCount: number | null }> = (sql) => pool.query(sql)
): Promise<number> {
  const result = await execute(
    `UPDATE submissions SET status = 'failed', error = 'Processing was interrupted by an application restart. Please resubmit the receipt.', updated_at = now()
     WHERE status IN ('queued', 'processing')`
  );
  return result.rowCount ?? 0;
}
