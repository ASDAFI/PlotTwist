# Dataset Studio

Dataset Studio is the authoring and review application for PlotTwist. It contains the React editor, FastAPI persistence service, examples, documentation, fixtures, and browser preview.

The repository-root [README](../README.md) describes the paper and the three repository sections. This file documents the Studio implementation.

## Run with Docker

From the repository root:

```bash
cp .env.example .env
mkdir -p dataset-studio/exports
docker compose up --build -d
```

Open <http://localhost:8080>. Configure `DATASET_DIR`, `RESPONSES_DIR`, and `EXPORT_DIR` in `.env` for private host folders. The default example paths point inside this directory. Dataset and response inputs are read-only; drafts use a named SQLite volume and exports use a separate writable directory.

Useful commands:

```bash
docker compose ps
docker compose logs api ui
docker compose down       # preserve the state volume
docker compose down -v    # remove saved drafts too
```

## Browser session

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev:local
```

Open <http://localhost:5173>. The setup flow provides Browse cards for a local dataset, model-output JSONL files, and an optional export destination. Browser edits remain in memory until exported. A bundled preview is available with:

```bash
python3 -m http.server 8081 --directory dataset-studio/ui-preview
```

## Review behavior

- Dataset records are paired from `images/` and `json/`.
- Questions use the `problem` field; choice keys and `answer.option` remain literal.
- Deception order is meaningful and stored IDs are never renumbered.
- Each deception and the single solution may contain multiple boxes.
- Boxes use original image pixels as `x`, `y`, `width`, and `height`.
- Model responses require `visible_output` and an explicit identity field.
- Row order is never used to match responses; repeated trials and raw output are retained.

Example response files are kept in `examples/responses_example/`. The larger private response directory is `examples/responses/` and is ignored by Git. The local importer can detect `sample_id` when `image.path` is absent; durable imports should use the response mapping field explicitly.

## Preservation contract

Source JSON, images, and model-output files are never modified. Unknown keys, nested metadata, nulls, stable IDs, contributor keys, literal choices, array order, and fractional box coordinates are preserved. Unchanged JSON exports byte-for-byte. Review state, revisions, response data, and export receipts stay outside exported records in SQLite.

Exports are written to a distinct destination after validation. Failed or cancelled exports do not publish an apparently complete directory.

## Development checks

```bash
pnpm typecheck
pnpm test:domain
PYTHONPATH=dataset-studio/backend \
  dataset-studio/backend/.venv/bin/python -m pytest dataset-studio/backend/tests -q
pnpm build:local
docker compose config
docker compose build
```

## AI development disclosure

The Dataset Studio code was developed with assistance from AI models through coding-agent workflows. Human-directed design, review, integration decisions, and repository changes remain the responsibility of the project authors. AI assistance does not change the licensing or attribution requirements of bundled third-party code, images, provider marks, datasets, or model outputs.

See [docs/UI-SPEC.md](docs/UI-SPEC.md), [docs/DEVELOPMENT-PROMPT.md](docs/DEVELOPMENT-PROMPT.md), and [docs/ASSETS.md](docs/ASSETS.md) for implementation requirements and asset provenance.
