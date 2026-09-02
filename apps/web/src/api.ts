import type { SubmissionDetail, SubmissionSummary } from "@receipt/shared";

export type SubmissionPage = { items: SubmissionSummary[]; page: number; pageSize: number; total: number };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message ?? "Request failed");
  return data;
}

export const api = {
  list: (page = 1, decision = "") => request<SubmissionPage>(`/api/submissions?page=${page}&pageSize=10${decision ? `&decision=${encodeURIComponent(decision)}` : ""}`),
  detail: (id: string) => request<SubmissionDetail>(`/api/submissions/${id}`),
  upload: (file: File) => { const form = new FormData(); form.append("file", file); return request<SubmissionSummary>("/api/submissions", { method: "POST", body: form }); },
  fileUrl: (id: string) => `/api/submissions/${id}/file`
};
