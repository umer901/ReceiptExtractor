import { createHash } from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { config } from "./config.js";
import { getSubmission, pool, type SubmissionRow } from "./db.js";
import { failInterruptedSubmissions, runSubmission } from "./processor.js";

const app = new Hono();
app.use("*", logger());
app.use("/api/*", cors({ origin: config.CORS_ORIGIN }));

const error = (c: any, status: 400 | 404 | 413 | 415 | 500, code: string, message: string) => c.json({ error: { code, message } }, status);

function summary(row: SubmissionRow) {
  const expense = row.extracted_expense as any;
  return {
    id: row.id, filename: row.filename, status: row.status, decision: row.decision,
    merchant: expense?.merchant ?? null, total: expense?.total ?? null, currency: expense?.currency ?? null,
    category: expense?.category ?? null, receiptDate: expense?.date ?? null, createdAt: row.created_at.toISOString()
  };
}

app.get("/api/health", async (c) => {
  await pool.query("SELECT 1");
  return c.json({ status: "ok" });
});

app.post("/api/submissions", async (c) => {
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return error(c, 400, "FILE_REQUIRED", "Select a PDF or JPEG receipt.");
  if (file.size > config.MAX_UPLOAD_BYTES) return error(c, 413, "FILE_TOO_LARGE", `Receipts must be smaller than ${Math.round(config.MAX_UPLOAD_BYTES / 1048576)} MB.`);
  const bytes = Buffer.from(await file.arrayBuffer());
  const isPdf = bytes.subarray(0, 5).toString() === "%PDF-";
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  if (!isPdf && !isJpeg) return error(c, 415, "UNSUPPORTED_FILE", "Only valid PDF and JPEG files are accepted.");
  const mime = isPdf ? "application/pdf" : "image/jpeg";
  const hash = createHash("sha256").update(bytes).digest("hex");
  const result = await pool.query<SubmissionRow>(
    "INSERT INTO submissions(filename, mime_type, file_data, file_hash, status) VALUES ($1,$2,$3,$4,'queued') RETURNING *",
    [file.name.slice(0, 255), mime, bytes, hash]
  );
  const row = result.rows[0]!;
  void runSubmission(row.id);
  return c.json(summary(row), 202);
});

app.get("/api/submissions", async (c) => {
  const page = Math.max(1, Number(c.req.query("page")) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(c.req.query("pageSize")) || 10));
  const status = c.req.query("status");
  const decision = c.req.query("decision");
  const values: unknown[] = [];
  const filters: string[] = [];
  if (status) { values.push(status); filters.push(`status = $${values.length}`); }
  if (decision) { values.push(decision); filters.push(`decision = $${values.length}`); }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const count = await pool.query<{ count: string }>(`SELECT count(*) FROM submissions ${where}`, values);
  values.push(pageSize, (page - 1) * pageSize);
  const rows = await pool.query<SubmissionRow>(`SELECT * FROM submissions ${where} ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
  return c.json({ items: rows.rows.map(summary), page, pageSize, total: Number(count.rows[0]?.count ?? 0) });
});

app.get("/api/submissions/:id", async (c) => {
  const row = await getSubmission(c.req.param("id"));
  if (!row) return error(c, 404, "NOT_FOUND", "Submission not found.");
  return c.json({ ...summary(row), explanation: row.explanation, expense: row.extracted_expense, rules: row.rule_results, error: row.error, policyVersion: row.policy_version });
});

app.get("/api/submissions/:id/file", async (c) => {
  const row = await getSubmission(c.req.param("id"));
  if (!row) return error(c, 404, "NOT_FOUND", "Submission not found.");
  c.header("Content-Type", row.mime_type);
  c.header("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(row.filename)}`);
  c.header("Cache-Control", "private, max-age=3600");
  const bytes = row.file_data.buffer.slice(row.file_data.byteOffset, row.file_data.byteOffset + row.file_data.byteLength) as ArrayBuffer;
  return c.body(bytes);
});

app.onError((err, c) => { console.error(err); return error(c, 500, "INTERNAL_ERROR", "Something went wrong while processing the request."); });
const interrupted = await failInterruptedSubmissions();
if (interrupted) console.warn(`Marked ${interrupted} interrupted submission(s) as failed`);
serve({ fetch: app.fetch, port: config.PORT }, () => console.log(`API listening on http://localhost:${config.PORT}`));
