import pg from "pg";
import { config } from "./config.js";

export const pool = new pg.Pool({ connectionString: config.DATABASE_URL });

export type SubmissionRow = {
  id: string; filename: string; mime_type: string; file_data: Buffer; file_hash: string;
  status: "queued" | "processing" | "completed" | "failed";
  decision: "Approved" | "Rejected" | "Needs Review" | null;
  explanation: string | null; extracted_expense: unknown; rule_results: unknown;
  policy_version: string | null; error: string | null;
  created_at: Date; updated_at: Date;
};

export async function getSubmission(id: string) {
  const result = await pool.query<SubmissionRow>("SELECT * FROM submissions WHERE id = $1", [id]);
  return result.rows[0] ?? null;
}
