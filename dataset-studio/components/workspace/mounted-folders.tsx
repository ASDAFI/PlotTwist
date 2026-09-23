"use client";
import { useEffect, useState } from "react";
import {
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  LoaderCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { api, type Directory } from "@/lib/api";
export function MountedFolders({
  dataset,
  responses,
  exports,
  onDataset,
  onResponses,
  onExports,
}: {
  dataset: string;
  responses: string | null;
  exports: string;
  onDataset: (v: string) => void;
  onResponses: (v: string | null) => void;
  onExports: (v: string) => void;
}) {
  const [root, setRoot] = useState<"dataset" | "responses" | "exports" | null>(
    null,
  );
  const [path, setPath] = useState("."),
    [listing, setListing] = useState<Directory | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!root) return;
    let ignore = false;
    setLoading(true);
    setError("");
    void api<Directory>(
      `/directories?root=${root}&path=${encodeURIComponent(path)}`,
    )
      .then((d) => {
        if (!ignore) setListing(d);
      })
      .catch((e) => {
        if (!ignore) setError(e.message);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [root, path]);
  function browse(which: typeof root, value: string) {
    setRoot(which);
    setPath(value);
    setListing(null);
  }
  return (
    <>
      <p className="connection-note">
        <CheckCircle2 size={15} /> Local API connected · drafts save
        automatically
      </p>
      {(
        [
          ["dataset", "Dataset folder", dataset, "images/ and json/"],
          [
            "responses",
            "Model outputs",
            responses ?? ".",
            "One .jsonl file per model",
          ],
          [
            "exports",
            "Export destination",
            exports,
            "New datasets are written here",
          ],
        ] as const
      ).map(([key, label, value, hint]) => (
        <button
          key={key}
          className="folder-picker"
          onClick={() => browse(key, value)}
        >
          <FolderOpen />
          <span>
            <strong>{label}</strong>
            <small>
              {key === "responses" && responses === null
                ? "Skipped"
              : `${value === "." ? "Mounted root" : value} · ${hint}`}
            </small>
          </span>
          <span className="folder-browse-action">Browse</span>
          <ChevronRight size={16} style={{ marginLeft: "auto" }} />
        </button>
      ))}
      <button
        className="btn ghost"
        onClick={() => onResponses(responses === null ? "." : null)}
      >
        {responses === null
          ? "Include model outputs"
          : "Skip model outputs for now"}
      </button>
      <p className="micro">
        Folders are inside your configured Docker mounts. Set their host
        locations in .env before starting the app.
      </p>
      <Dialog
        open={!!root}
        onOpenChange={(v) => {
          if (!v) setRoot(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Select {root} folder</DialogTitle>
          <DialogDescription>
            Browse within the mounted directory.
          </DialogDescription>
          <div className="directory-path">
            <button
              className="icon-btn"
              aria-label="Parent folder"
              disabled={path === "."}
              onClick={() =>
                setPath(path.split("/").slice(0, -1).join("/") || ".")
              }
            >
              <ChevronLeft />
            </button>
            <code>{path === "." ? "/" : path}</code>
          </div>
          {loading ? (
            <p>
              <LoaderCircle size={16} /> Loading folders…
            </p>
          ) : error ? (
            <p className="error">{error}</p>
          ) : (
            <div className="directory-list">
              {listing?.directories.map((d) => (
                <button
                  className="folder-picker"
                  key={d.path}
                  onClick={() => setPath(d.path)}
                >
                  <FolderOpen />
                  <strong>{d.name}</strong>
                  <ChevronRight size={14} style={{ marginLeft: "auto" }} />
                </button>
              ))}
              {!listing?.directories.length && (
                <p className="micro">
                  No subfolders. You can select the current folder.
                </p>
              )}
            </div>
          )}
          {root === "dataset" && listing && !listing.is_dataset && (
            <p className="micro">
              This folder needs images/ and json/ subdirectories.
            </p>
          )}
          <button
            className="btn primary"
            disabled={
              loading ||
              !!error ||
              !listing ||
              (root === "dataset" && !listing.is_dataset)
            }
            onClick={() => {
              if (root === "dataset") onDataset(path);
              else if (root === "responses") onResponses(path);
              else onExports(path);
              setRoot(null);
            }}
          >
            Use this folder
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
