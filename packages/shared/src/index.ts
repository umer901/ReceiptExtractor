import { z } from "zod";

export const categories = ["meals", "lodging", "transport", "office_supplies", "other"] as const;
export const decisions = ["Approved", "Rejected", "Needs Review"] as const;
export const processingStatuses = ["queued", "processing", "completed", "failed"] as const;

export const PurchasedItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().positive().nullable(),
  amount: z.number().nonnegative().nullable(),
  isAlcohol: z.boolean(),
  isPersonal: z.boolean()
});

export const ExtractedExpenseSchema = z.object({
  merchant: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  total: z.number().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  category: z.enum(categories),
  items: z.array(PurchasedItemSchema),
  lodgingNights: z.number().int().positive().nullable(),
  confidence: z.number().min(0).max(1),
  ambiguities: z.array(z.string())
});

export type ExtractedExpense = z.infer<typeof ExtractedExpenseSchema>;

export const RuleResultSchema = z.object({
  code: z.string(),
  label: z.string(),
  outcome: z.enum(["pass", "fail", "ambiguous"]),
  explanation: z.string()
});
export type RuleResult = z.infer<typeof RuleResultSchema>;

export const SubmissionSummarySchema = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  status: z.enum(processingStatuses),
  decision: z.enum(decisions).nullable(),
  merchant: z.string().nullable(),
  total: z.number().nullable(),
  currency: z.string().nullable(),
  category: z.enum(categories).nullable(),
  receiptDate: z.string().nullable(),
  createdAt: z.string()
});

export type SubmissionSummary = z.infer<typeof SubmissionSummarySchema>;

export const SubmissionDetailSchema = SubmissionSummarySchema.extend({
  explanation: z.string().nullable(),
  expense: ExtractedExpenseSchema.nullable(),
  rules: z.array(RuleResultSchema),
  error: z.string().nullable(),
  policyVersion: z.string().nullable()
});
export type SubmissionDetail = z.infer<typeof SubmissionDetailSchema>;
