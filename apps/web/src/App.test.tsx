import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("App", () => {
  it("renders the empty dashboard", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [], page: 1, pageSize: 10, total: 0 }) }));
    render(<App />);
    expect(screen.getByRole("heading", { name: "Receipts" })).toBeInTheDocument();
    expect(await screen.findByText("No receipts yet")).toBeInTheDocument();
  });

  it("opens receipt details in the main page instead of a dialog", async () => {
    const summary = {
      id: "4ca859ff-909a-4d3c-9148-30e49d89dd51", filename: "lunch.jpg", status: "completed", decision: "Approved",
      merchant: "Central Cafe", total: 25, currency: "EUR", category: "meals", receiptDate: "2026-08-20", createdAt: "2026-08-20T12:00:00.000Z"
    };
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => Promise.resolve({
      ok: true,
      json: async () => url.includes(summary.id)
        ? { ...summary, explanation: "Policy passed.", expense: { merchant: "Central Cafe", date: "2026-08-20", total: 25, currency: "EUR", category: "meals", items: [{ name: "Lunch", quantity: 1, amount: 25, isAlcohol: false, isPersonal: false }], lodgingNights: null, confidence: .98, ambiguities: [] }, rules: [{ code: "category_limit", label: "Category limit", outcome: "pass", explanation: "The numeric limit is applied in the receipt currency." }], error: null, policyVersion: "v3" }
        : { items: [summary], page: 1, pageSize: 10, total: 1 }
    })));
    render(<App />);
    fireEvent.click(await screen.findByText("Central Cafe"));
    expect(await screen.findByRole("button", { name: "Back to receipts" })).toBeInTheDocument();
    expect(await screen.findByText("Policy passed.")).toBeInTheDocument();
    expect(screen.getByLabelText("Purchased items")).toHaveClass("scroll-region");
    expect(screen.getByLabelText("Policy checks")).toHaveClass("scroll-region");
    expect(screen.getByLabelText("Policy check legend")).toHaveTextContent("PassFailNeeds review");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
