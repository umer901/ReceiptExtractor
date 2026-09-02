import { z } from "zod";

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().default("postgres://receipt:receipt@localhost:5432/receipts"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash-lite"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  MAX_PDF_PAGES: z.coerce.number().int().positive().default(10),
  CORS_ORIGIN: z.string().default("http://localhost:5173")
});

export const config = ConfigSchema.parse(process.env);
