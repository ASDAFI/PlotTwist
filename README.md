# PlotTwist Studio

PlotTwist Studio is a local review workspace for visual-riddle datasets. It opens paired image/JSON records, supports annotation and evidence-box editing, compares saved model responses, and exports a new reviewed dataset.

It is designed for trusted local use. It does not call model APIs, upload data, provide public authentication, or modify source files.

## Repository sections

The repository is organized as three product areas:

1. **Dataset Studio** — the current implementation under `dataset-studio/`. It
   contains the React editor, FastAPI service, Docker workflow, examples, and
   durable review/export logic.
2. **Benchmarks** — reserved for benchmark definitions, evaluation fixtures,
   metrics, and reproducible benchmark reports. See [benchmarks/README.md](benchmarks/README.md).
3. **Analysis** — reserved for exploratory analysis, notebooks,
   derived tables, figures, and research notes. See
   [analysis/README.md](analysis/README.md).

The repository root contains shared workspace metadata and Docker/package
entrypoints. The latter two sections are intentionally scaffolds. They must consume exported
datasets or copied read-only inputs and must not change Dataset Studio source
data or its review contract.

## Run modes

| Mode | Start with | Persistence | Best for |
| --- | --- | --- | --- |
| Docker | `docker compose up --build -d` | SQLite drafts and durable exports | Real review work |
| Browser session | `pnpm dev:local` or `dataset-studio/ui-preview/` | Browser memory only | Quick inspection and demos |

The Docker application is the authoritative workflow. The browser session is a portable fallback with practical size limits and no durable draft recovery.

## Docker quick start

Requirements: Docker Engine/Desktop with Compose v2.

```bash
cp .env.example .env
mkdir -p exports
docker compose up --build -d
```

Open <http://localhost:8080>. Enter a contributor name and an OpenReview profile URL or ID such as `~Profile_ID1`. This identifies edits; it is not a sign-in.

Configure the host directories in `.env` before starting Compose:

```dotenv
DATASET_DIR=/absolute/path/to/dataset
RESPONSES_DIR=/absolute/path/to/model-outputs
EXPORT_DIR=/absolute/path/to/reviewed-datasets
PLOTTWIST_UID=1000
PLOTTWIST_GID=1000
```

The paths must already exist. The dataset directory contains `images/` and `json/`; the model-output directory may be empty and normally contains `.jsonl` files. `EXPORT_DIR` must be separate from both input directories. On Linux, use `id -u` and `id -g` for the UID/GID values when exports need to be writable by your host user.

Inputs are mounted read-only. Drafts are stored in the named `state` volume; exports are written to `EXPORT_DIR`. The UI binds to localhost only and proxies API requests internally.

Useful operations:

```bash
docker compose ps
docker compose logs api ui
docker compose down       # stop services; preserve saved drafts
docker compose down -v    # also delete the state volume and drafts
```

## Browser-session mode

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev:local
```

Open <http://localhost:5173>. The setup screen provides Browse cards for:

- A local dataset folder containing `images/` and `json/`.
- A local model-output folder containing `.jsonl` files.
- An optional new, empty export destination folder.

Selected files are read into browser memory. Changes are not durable until exported. Direct folder export uses the File System Access API where available; ZIP export is the fallback.

To serve the bundled preview without Node:

```bash
python3 -m http.server 8081 --directory dataset-studio/ui-preview
```

Open <http://localhost:8081> and choose the demo workspace.

## Input layout

```text
dataset/
├── images/
│   └── 020.jpg
└── json/
    └── 020.json
```

Records contain an `image.path`, `problem`, `choices`, `ordered_deceptions`, and one `answer` object. Unknown keys and nested metadata are preserved.

The repository includes two response fixtures:

```text
dataset-studio/examples/
├── responses/          # larger generated outputs; identity is sample_id
└── responses_example/  # five small demo files; identity is image.path
```

The local browser importer detects an available identity field such as `sample_id` when `image.path` is not present. In the durable response-import panel, select the matching field explicitly.

## Review workflow

1. Choose an item from the left rail or use Previous/Next.
2. Edit the question or choice descriptions. Choice keys remain literal and fixed.
3. Add, edit, delete, or reorder deceptions. Array order is meaningful; stored deception IDs are not renumbered.
4. Select a deception or the single solution and choose **Add box**. Boxes can be drawn, moved, resized, numerically edited, and removed. Multiple boxes are supported for every owner.
5. In Docker mode, the save indicator becomes saved only after the API confirms persistence. Reloading resumes the saved workspace.
6. Use **Delete item** to exclude a record from export. Excluded items can be restored.
7. Use **AI answers** to inspect response mappings, reasoning, answer badges, and raw output. Accept a preview only after checking its identity mapping.
8. Use **Export** to write a complete new `images/` + `json/` directory or download a ZIP.

Keyboard shortcuts: `B` draw, `V` select, `Escape` cancel a drawing, `Ctrl/Cmd+Z` undo, and left/right arrows navigate outside text fields.

## Model-response format

Every JSONL row needs `visible_output` and an explicit identity field. Row order is never used for matching.

```json
{"image":{"path":"images/020.jpg"},"visible_output":"<reasoning>Explanation</reasoning>\n<answer>A</answer>"}
```

Identity fields may be dotted paths such as `image.path`, `item_id`, or `sample_id`. Matching tries an exact record path, exact image path, and then a unique filename stem where applicable. Leading zeroes are significant: `001` and `1` are different identifiers.

Rows with missing, ambiguous, or invalid identities remain unassigned. Every trial and raw row is retained. A failed preview does not replace the last accepted import.

Answer parsing is strict:

- There must be one nonempty `<answer>...</answer>` block.
- Its trimmed value must equal an exact choice key.
- Descriptions, integers, and alternative labels are not coerced.
- One `<reasoning>...</reasoning>` block is displayed when present.
- Model text is rendered as plain text and never overwrites annotations.

## Preservation and export guarantees

Source datasets are never edited. The exporter preserves unknown keys, nested metadata, nulls, dates, stable IDs, literal choice keys, `answer.option`, `ordered_deceptions` order, all annotation boxes, fractional original-image coordinates, and original image bytes.

Unchanged JSON is exported byte-for-byte. Changed JSON uses UTF-8 with two-space formatting and receives the last editor's contributor information while preserving unknown contributor keys. Review state, response data, import reports, revisions, and export receipts stay in SQLite and are not injected into exported records.

Boxes use original image pixels rather than CSS or percentage coordinates. Invalid boxes, duplicate IDs, missing images, dimension mismatches, and nontrivial EXIF orientation block import. EXIF normalization and coordinate reconciliation must happen before importing.

Exports validate a saved snapshot, write to staging, and publish to a distinct destination. Existing destination names are not overwritten. Failed or cancelled exports do not publish an apparently complete directory.

## Local development

Requirements: Node 22.13+, Corepack/pnpm, and Python 3.12.

```bash
corepack enable
pnpm install --frozen-lockfile
python3 -m venv dataset-studio/backend/.venv
dataset-studio/backend/.venv/bin/pip install --require-hashes -r dataset-studio/backend/requirements-dev.lock
```

Start the API:

```bash
dataset-studio/backend/.venv/bin/python -m uvicorn app.main:app \
  --app-dir dataset-studio/backend --host 127.0.0.1 --port 8000
```

Start the UI in another terminal:

```bash
pnpm dev:local
```

The Vite `/api` proxy targets port 8000. Local API roots default to `dataset-studio/examples/dataset`, `dataset-studio/examples/responses`, `dataset-studio/exports`, and `.plottwist`; override them with `DATASET_ROOT`, `RESPONSES_ROOT`, `EXPORTS_ROOT`, and `STATE_ROOT`.

## Verification

Run from the project root:

```bash
pnpm typecheck
pnpm test:domain
PYTHONPATH=dataset-studio/backend dataset-studio/backend/.venv/bin/python -m pytest dataset-studio/backend/tests -q
pnpm build:local
docker compose config
docker compose build
docker compose up -d
```

For integration verification, open <http://localhost:8080> and exercise the workflow through the Docker UI. The browser demo or API TestClient alone does not verify the two-container deployment.

## Project structure

| Path | Responsibility |
| --- | --- |
| `dataset-studio/app/` | React entrypoint and visual editor |
| `dataset-studio/components/workspace/` | Workspace UI and response-import preview |
| `dataset-studio/hooks/use-durable-workspace.ts` | Debounced saves, write queue, and conflicts |
| `dataset-studio/lib/` | Dataset contract, geometry, parsing, and API client |
| `dataset-studio/backend/app/domain.py` | Validation, matching, containment, and preservation rules |
| `dataset-studio/backend/app/service.py` | Workspace, response-import, and export workflows |
| `dataset-studio/backend/app/storage.py` | SQLite drafts, revisions, jobs, and response rows |
| `dataset-studio/backend/app/main.py` | FastAPI endpoints |
| `compose.yaml` | Local API/UI services and mounts |
| `docker/` | Vite production entry and nginx proxy |
| `dataset-studio/examples/` | Sample datasets and illustrative response fixtures |
| `benchmarks/` | Reserved benchmark definitions and reproducible evaluation reports |
| `analysis/` | Reserved notebooks, scripts, figures, tables, and research notes |
| `docs/` | UI specification, development handoff, and asset notes |

## Known limitations

- The app is for trusted local use and has no public authentication.
- Very large datasets may need a virtualized, server-filtered sidebar.
- Browser-session edits disappear if they are not exported.
- Direct browser folder export depends on File System Access API support.
- Docker intentionally uses one API worker for SQLite workflow consistency.

See [AGENTS.md](AGENTS.md) for the repository contract, [dataset-studio/docs/UI-SPEC.md](dataset-studio/docs/UI-SPEC.md) for interaction requirements, and [dataset-studio/docs/ASSETS.md](dataset-studio/docs/ASSETS.md) for sample-asset attribution.
