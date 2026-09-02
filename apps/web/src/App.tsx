import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Receipt, Search, UploadCloud, XCircle } from "lucide-react";
import type { SubmissionDetail, SubmissionSummary } from "@receipt/shared";
import { api, type SubmissionPage } from "./api";

const labels: Record<string, string> = { meals: "Meals", lodging: "Lodging", transport: "Transport", office_supplies: "Office supplies", other: "Other" };
const decisionClass = (decision: string | null) => decision === "Approved" ? "approved" : decision === "Rejected" ? "rejected" : "review";
const money = (value: number | null, currency: string | null) => {
  if (value == null) return "—";
  if (!currency) return value.toFixed(2);
  try { return new Intl.NumberFormat("en", { style: "currency", currency }).format(value); }
  catch { return `${value.toFixed(2)} ${currency}`; }
};
const niceDate = (value: string | null) => value ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";

function StatusBadge({ item }: { item: SubmissionSummary }) {
  if (item.status === "queued" || item.status === "processing") return <span className="badge processing"><Clock3 /> Processing</span>;
  if (item.status === "failed") return <span className="badge rejected"><XCircle /> Failed</span>;
  return <span className={`badge ${decisionClass(item.decision)}`}>{item.decision === "Approved" ? <CheckCircle2 /> : item.decision === "Rejected" ? <XCircle /> : <AlertTriangle />}{item.decision}</span>;
}

function ReceiptDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const load = async () => {
      try {
        const value = await api.detail(id);
        if (!active) return;
        setDetail(value);
        if (value.status === "queued" || value.status === "processing") timer = window.setTimeout(load, 2000);
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Could not load submission"); }
    };
    load();
    return () => { active = false; clearTimeout(timer); };
  }, [id]);

  return <div className="detail-page">
    <div className="page-toolbar"><button className="back-button" onClick={onBack}><ArrowLeft /> Back to receipts</button><div><span className="eyebrow">Receipt details</span><h1>{detail?.expense?.merchant ?? detail?.filename ?? "Loading receipt"}</h1></div></div>
    {error && <div className="error-box">{error}</div>}
    {!detail ? <div className="page-loading">Loading receipt…</div> : <>
      <div className={`decision-panel ${decisionClass(detail.decision)}`}><StatusBadge item={detail} /><strong>{detail.explanation ?? (detail.status === "failed" ? detail.error : "Your receipt is being processed.")}</strong></div>
      <div className="detail-grid">
        <section className="content-panel receipt-panel"><h2>Receipt</h2>{detail.filename.toLowerCase().endsWith(".pdf") ? <iframe className="receipt-preview" src={api.fileUrl(id)} title="Receipt PDF" /> : <img className="receipt-preview" src={api.fileUrl(id)} alt="Uploaded receipt" />}</section>
        <div className="detail-column">
          {detail.expense && <section className="content-panel"><h2>Extracted expense</h2><dl className="facts"><div><dt>Merchant</dt><dd>{detail.expense.merchant}</dd></div><div><dt>Date</dt><dd>{niceDate(detail.expense.date)}</dd></div><div><dt>Total</dt><dd>{money(detail.expense.total, detail.expense.currency)}</dd></div><div><dt>Category</dt><dd>{labels[detail.expense.category]}</dd></div></dl><h3>Purchased items</h3><div className="items scroll-region" tabIndex={0} aria-label="Purchased items">{detail.expense.items.map((item, index) => <div key={`${item.name}-${index}`}><span>{item.name}{item.quantity ? ` × ${item.quantity}` : ""}</span><strong>{money(item.amount, detail.expense!.currency)}</strong></div>)}</div></section>}
          {detail.rules.length > 0 && <section className="content-panel"><div className="section-title"><h2>Policy checks</h2><span>{detail.policyVersion}</span></div><div className="policy-legend" aria-label="Policy check legend"><span><i className="rule-dot pass" />Pass</span><span><i className="rule-dot fail" />Fail</span><span><i className="rule-dot ambiguous" />Needs review</span></div><div className="rules scroll-region" tabIndex={0} aria-label="Policy checks">{detail.rules.map((rule) => <div className="rule" key={rule.code}><span className={`rule-dot ${rule.outcome}`} /><div><strong>{rule.label}</strong><p>{rule.explanation}</p></div></div>)}</div></section>}
        </div>
      </div>
    </>}
  </div>;
}

export function App() {
  const [data, setData] = useState<SubmissionPage>({ items: [], page: 1, pageSize: 10, total: 0 });
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => { try { setData(await api.list(page, filter)); setMessage(""); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not load submissions"); } }, [page, filter]);
  useEffect(() => { load(); const timer = window.setInterval(() => { if (data.items.some((item) => item.status === "queued" || item.status === "processing")) load(); }, 3000); return () => clearInterval(timer); }, [load, data.items]);
  const upload = async (file?: File) => { if (!file) return; setUploading(true); setMessage(""); try { const item = await api.upload(file); await load(); setSelected(item.id); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Upload failed"); } finally { setUploading(false); if (input.current) input.current.value = ""; } };
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return <main>
    <input ref={input} hidden type="file" accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg" onChange={(event) => upload(event.target.files?.[0])} />
    {selected ? <ReceiptDetail id={selected} onBack={() => { setSelected(null); load(); }} /> : <>
      {message && <div className="error-box">{message}</div>}
      <section className="history"><div className="history-head"><div><h1>Receipts</h1><p>Submitted expenses and validation results.</p></div><div className="history-actions"><div className="filters"><Search /><select aria-label="Filter by decision" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }}><option value="">All decisions</option><option>Approved</option><option>Needs Review</option><option>Rejected</option></select></div><button className="primary" onClick={() => input.current?.click()} disabled={uploading}><UploadCloud />{uploading ? "Uploading…" : "New receipt"}</button></div></div>
        <div className="table-wrap"><table><thead><tr><th>Merchant</th><th>Receipt date</th><th>Category</th><th>Total</th><th>Decision</th><th>Submitted</th></tr></thead><tbody>{data.items.length === 0 ? <tr><td colSpan={6}><div className="empty"><Receipt /><strong>No receipts yet</strong><span>Upload your first receipt to see a decision.</span></div></td></tr> : data.items.map((item) => <tr key={item.id} onClick={() => setSelected(item.id)} tabIndex={0} onKeyDown={(event) => event.key === "Enter" && setSelected(item.id)}><td><strong>{item.merchant ?? item.filename}</strong></td><td>{niceDate(item.receiptDate)}</td><td>{item.category ? labels[item.category] : "—"}</td><td>{money(item.total, item.currency)}</td><td><StatusBadge item={item} /></td><td>{niceDate(item.createdAt)}</td></tr>)}</tbody></table></div>
        <footer className="pager"><span>Page {page} of {pages}</span><div><button className="icon-btn" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}><ChevronLeft /></button><button className="icon-btn" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}><ChevronRight /></button></div></footer>
      </section>
    </>}
  </main>;
}
