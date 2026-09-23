import type { Item, ResponseRow } from "./dataset";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}
export type Actor = { name: string; openreview_id: string };
export type Workspace = {
  id: string;
  name: string;
  count: number;
  resumed: boolean;
  responses_rel: string | null;
  warnings: { message: string; files: string[] }[];
};
export type Directory = {
  root: string;
  path: string;
  directories: { name: string; path: string }[];
  is_dataset: boolean;
  jsonl_count: number;
};
export type Job = {
  id: string;
  kind: string;
  status: string;
  progress: number;
  total: number;
  result: Record<string, unknown> | null;
  error: string | null;
};
export type Mapping = {
  field: string;
  dataset_field: string;
  question_field: string;
  dataset_question_field: string;
};
export type ResponsePage = {
  rows: ResponseRow[];
  total: number;
  report: Job | null;
};
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch("/api" + path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    signal: init?.signal ?? AbortSignal.timeout(45000),
  });
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new ApiError(
      "The local API is unavailable. Start Docker Compose and open localhost:8080.",
      response.status,
    );
  const body = (await response.json()) as {
    message?: string;
    detail?: unknown;
    details?: unknown;
  };
  if (!response.ok) {
    const message =
      body.message ??
      (typeof body.detail === "string"
        ? body.detail
        : "The request could not be validated.");
    throw new ApiError(message, response.status, body.details ?? body.detail);
  }
  return body as T;
}
export async function allItems(wid: string): Promise<Item[]> {
  const result: Item[] = [];
  let total = Infinity;
  while (result.length < total) {
    const page = await api<{ items: Item[]; total: number }>(
      `/workspaces/${wid}/items?offset=${result.length}&limit=100`,
    );
    result.push(...page.items);
    total = page.total;
    if (!page.items.length) break;
  }
  return result;
}
export async function waitJob(
  wid: string,
  jid: string,
  onProgress?: (job: Job) => void,
): Promise<Job> {
  for (let n = 0; n < 1800; n++) {
    const job = await api<Job>(`/workspaces/${wid}/jobs/${jid}`);
    onProgress?.(job);
    if (job.status === "succeeded") return job;
    if (["failed", "cancelled", "interrupted"].includes(job.status))
      throw new ApiError(job.error || `Job ${job.status}`, 422);
    await new Promise((resolve) => setTimeout(resolve, 650));
  }
  throw new ApiError(
    "The job is still running. Reopen its status before starting a replacement.",
    408,
  );
}
