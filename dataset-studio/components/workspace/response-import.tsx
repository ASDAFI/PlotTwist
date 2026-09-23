"use client";
import { useState } from "react";
import {
  api,
  waitJob,
  type Mapping,
  type Job,
  type ResponsePage,
} from "@/lib/api";
export function ResponseImport({
  workspaceId,
  onAccepted,
}: {
  workspaceId: string;
  onAccepted: () => void;
}) {
  const [mapping, setMapping] = useState<Mapping>({
    field: "image.path",
    dataset_field: "auto",
    question_field: "",
    dataset_question_field: "problem",
  });
  const [job, setJob] = useState<Job | null>(null),
    [preview, setPreview] = useState<ResponsePage | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function inspect() {
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      const started = await api<Job>(
        `/workspaces/${workspaceId}/response-imports`,
        { method: "POST", body: JSON.stringify(mapping) },
      );
      const done = await waitJob(workspaceId, started.id, setJob);
      setJob(done);
      setPreview(
        await api<ResponsePage>(
          `/workspaces/${workspaceId}/responses?import_id=${done.id}&limit=12`,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function accept() {
    if (!job) return;
    setBusy(true);
    try {
      await api(
        `/workspaces/${workspaceId}/response-imports/${job.id}/accept`,
        { method: "POST" },
      );
      onAccepted();
      setPreview(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="response-import">
      <summary>Import or remap model responses</summary>
      <p className="micro">
        Match identifiers from a complete response row. Row order is never used.
        Review the mapping before accepting it.
      </p>
      <label className="field">
        <span>Identifier field in JSONL</span>
        <input
          className="text-input mono"
          value={mapping.field}
          onChange={(e) => setMapping({ ...mapping, field: e.target.value })}
          placeholder="image.path"
        />
      </label>
      <label className="field">
        <span>Matching field in dataset</span>
        <input
          className="text-input mono"
          value={mapping.dataset_field}
          onChange={(e) =>
            setMapping({ ...mapping, dataset_field: e.target.value })
          }
          placeholder="auto"
        />
        <small className="micro">
          auto = exact JSON path, image path, then a unique filename stem. Or
          name a field such as item_id.
        </small>
      </label>
      <label className="field">
        <span>Question identifier in JSONL (optional)</span>
        <input
          className="text-input mono"
          value={mapping.question_field}
          onChange={(e) =>
            setMapping({ ...mapping, question_field: e.target.value })
          }
          placeholder="question_id or question"
        />
      </label>
      {mapping.question_field && (
        <label className="field">
          <span>Question field in original dataset JSON</span>
          <input
            className="text-input mono"
            value={mapping.dataset_question_field}
            onChange={(e) =>
              setMapping({ ...mapping, dataset_question_field: e.target.value })
            }
          />
        </label>
      )}
      <button
        className="btn"
        disabled={
          busy || !mapping.field.trim() || !mapping.dataset_field.trim()
        }
        onClick={() => void inspect()}
      >
        {busy ? "Importing…" : "Preview mapping"}
      </button>
      {job && busy && (
        <p className="micro">
          {job.progress} / {job.total} files · {job.status}
        </p>
      )}
      {error && <p className="error">{error}</p>}
      {preview && job?.result && (
        <div className="import-result">
          <p>
            <b>{String(job.result.matched)} matched</b> ·{" "}
            {String(job.result.unmatched)} unmatched ·{" "}
            {String(job.result.ambiguous)} ambiguous ·{" "}
            {String(job.result.invalid)} invalid
          </p>
          <p className="micro">
            {String(job.result.malformed)} malformed answers ·{" "}
            {String(job.result.out_of_choices)} outside choices ·{" "}
            {String(job.result.repeated)} repeated trials
          </p>
          <div className="import-rows">
            {preview.rows.map((r, i) => (
              <p key={i}>
                <code>
                  {r.filename}:{r.line}
                </code>
                <span>
                  {r.matchStatus} · {r.parseStatus}
                </span>
                {r.error && <small>{r.error}</small>}
              </p>
            ))}
          </div>
          <p className="micro">
            Showing {preview.rows.length} of {preview.total} rows. Every matched
            trial is retained.
          </p>
          <button
            className="btn primary"
            disabled={busy}
            onClick={() => void accept()}
          >
            Accept this mapping
          </button>
        </div>
      )}
    </details>
  );
}
