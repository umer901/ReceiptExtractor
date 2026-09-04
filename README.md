# Receipt Reimbursement Validator

This Receipt Reimbursment Validator accepts PDF or JPEG receipts, extracts embedded text or runs local OCR, asks Google Gemini for validated structured expense data, and applies a deterministic reimbursement policy. Ambiguous cases receive an advisory explanation and remain **Needs Review**.

## Quick start with Docker

1. Create a Gemini API key in Google AI Studio, copy `.env.example` to `.env`, and set `GEMINI_API_KEY`.
2. Run `docker compose up --build`.
3. Open [http://localhost:8080](http://localhost:8080).

PostgreSQL stores both receipt binaries and results. The API processes receipts asynchronously in-process, and the migration container applies schema changes before it starts.

## Local development

Node.js 20+, PostgreSQL, Poppler (`pdftotext`, `pdftoppm`, and `pdfinfo`), and Tesseract with English data are required. Install packages with `npm install`, run `npm run db:migrate`, then `npm run dev`.

Because processing is intentionally in-process for this single-user deployment, restarting the API marks any active receipt as failed so it can be resubmitted cleanly.

## Policy defaults

- Meals: 75; transport: 150; office supplies: 200.
- Lodging: 300 per night.
- Alcohol, personal items, and exact duplicates are rejected.
- Limits are numeric and apply directly in the currency printed on the receipt; no conversion or required currency is used.
- Low-confidence, unclear-category, and otherwise ambiguous cases need review.

This first version intentionally has no authentication, reviewer/admin workflow, manual corrections, or policy-management UI. It is suitable for a private single-user deployment, not a public multi-user service.
