import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { GoogleGenAI } from "@google/genai";
import { ExtractedExpenseSchema, type ExtractedExpense } from "@receipt/shared";
import { zodToJsonSchema } from "zod-to-json-schema";
import { config } from "./config.js";

const run = promisify(execFile);

async function ocrImage(file: string) {
  const { stdout } = await run("tesseract", [file, "stdout", "-l", "eng"], { maxBuffer: 10 * 1024 * 1024 });
  return stdout;
}

export async function extractText(data: Buffer, mimeType: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "receipt-"));
  try {
    if (mimeType === "image/jpeg") {
      const imagePath = path.join(dir, "receipt.jpg");
      await writeFile(imagePath, data);
      return (await ocrImage(imagePath)).trim();
    }

    const pdfPath = path.join(dir, "receipt.pdf");
    const textPath = path.join(dir, "receipt.txt");
    await writeFile(pdfPath, data);
    const { stdout: pdfInfo } = await run("pdfinfo", [pdfPath]);
    const pages = Number(pdfInfo.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0);
    if (!pages || pages > config.MAX_PDF_PAGES) throw new Error(`PDF receipts must contain between 1 and ${config.MAX_PDF_PAGES} pages`);
    await run("pdftotext", ["-layout", pdfPath, textPath]);
    const embedded = (await readFile(textPath, "utf8")).trim();
    if (embedded.replace(/\s/g, "").length >= 30) return embedded;

    const prefix = path.join(dir, "page");
    await run("pdftoppm", ["-jpeg", "-r", "200", "-f", "1", "-l", String(config.MAX_PDF_PAGES), pdfPath, prefix]);
    const pageImages = (await readdir(dir)).filter((name) => name.startsWith("page-") && name.endsWith(".jpg")).sort();
    return (await Promise.all(pageImages.map((name) => ocrImage(path.join(dir, name))))).join("\n\n").trim();
  } finally { await rm(dir, { recursive: true, force: true }); }
}

function client() {
  if (!config.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");
  return new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
}

export async function structureExpense(text: string): Promise<ExtractedExpense> {
  if (!text.trim()) throw new Error("No readable text was found in the receipt");
  const response = await client().models.generateContent({
    model: config.GEMINI_MODEL,
    contents: text.slice(0, 50_000),
    config: {
      systemInstruction: "Extract receipt data faithfully. Use ISO dates, ISO 4217 currency codes, and flag uncertainty. Categorize only as meals, lodging, transport, office_supplies, or other. Mark alcoholic and clearly personal items. Never invent unreadable values.",
      temperature: 0,
      responseMimeType: "application/json",
      responseJsonSchema: zodToJsonSchema(ExtractedExpenseSchema, { $refStrategy: "none" })
    }
  });
  if (!response.text) throw new Error("Gemini did not return structured expense data");
  return ExtractedExpenseSchema.parse(JSON.parse(response.text));
}

export async function explainAmbiguity(expense: ExtractedExpense, issues: string[]): Promise<string> {
  const response = await client().models.generateContent({
    model: config.GEMINI_MODEL,
    contents: JSON.stringify({ expense, issues }),
    config: {
      systemInstruction: "Explain why a reimbursement case needs human review in one or two plain-language sentences. Do not approve or reject it and do not invent facts.",
      temperature: 0
    }
  });
  return response.text?.trim() || issues.join(" ");
}
