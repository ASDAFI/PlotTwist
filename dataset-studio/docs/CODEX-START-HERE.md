# PlotTwist Studio — Codex development handoff

## What you are receiving

A working codebase and a concrete UI reference for the dataset-development tool. Start with this project rather than asking Codex to recreate it from a screenshot.

| File / directory | Use |
| --- | --- |
| `../../README.md` | Installation, Docker mounts, user workflow, tests and limitations |
| `AGENTS.md` | Persistent instructions and schema-preservation rules for Codex |
| `docs/UI-SPEC.md` | Screen-by-screen UI design and interaction requirements |
| `docs/DEVELOPMENT-PROMPT.md` | Full original JSON example, architecture contract and eight phase prompts |
| `docs/screenshots/` | Actual onboarding, workspace and comparison UI captures |
| `../app/`, `../components/`, `../hooks/`, `../lib/` | React/TypeScript editor source |
| `../backend/` | FastAPI service, SQLite persistence, tests and hash-locked Python dependencies |
| `../../compose.yaml`, `../../Dockerfile`, `../backend/Dockerfile` | Local two-container application |
| `../examples/` | A small paired dataset and illustrative model-response fixtures |
| `../ui-preview/` | Built session-only UI included in the downloadable handoff ZIP |

## First run

Extract the archive, open its `plottwist-studio` folder in Codex, then:

```bash
cp .env.example .env
# Set DATASET_DIR, RESPONSES_DIR and EXPORT_DIR to existing host folders.
# Or leave the example folders for your first smoke test.
mkdir -p exports
docker compose up --build -d
```

Open **http://localhost:8080**. Enter your name and OpenReview ID/URL. The UI browses inside your configured Docker mounts, so arbitrary host paths are configured in `.env` first. Inputs stay read-only, drafts are stored in SQLite, and exports go to a distinct new folder.

To inspect only the supplied UI without Docker or Node installation:

```bash
python3 -m http.server 8081 --directory dataset-studio/ui-preview
```

Open **http://localhost:8081** and select **Explore demo dataset** after entering an example profile. This mode keeps annotation edits in the browser session; use the Docker application for durable work.

## Paste this into Codex first

```text
Continue this PlotTwist Studio repository.

Read AGENTS.md, README.md, docs/UI-SPEC.md and docs/DEVELOPMENT-PROMPT.md.
Inspect the existing implementation before changing it. Preserve its visual
layout and the supplied dataset schema. Do not regenerate the project.

The immediate task is to verify and fix the real Docker workflow end to end.
Run the frontend type/domain checks and backend tests. Build and start both
Compose services using the example dataset, then test through localhost:8080.
Complete the following journey: profile -> mounted folders -> question edit ->
add and reorder a deception -> draw, move and resize a deception box -> edit
the single solution and draw its box -> import and accept JSONL mapping ->
compare model outputs -> exclude and restore an item -> refresh/restart ->
export to a new folder -> re-open the exported dataset.

Assert that source JSON/image hashes are unchanged, literal choice keys and
fractional coordinates are preserved, unknown fields and nulls survive, and
only changed records receive the last editor's contributor information.
Do not match model responses by row order. Show ambiguous or missing identity.

Fix concrete failures with focused patches and regression tests. Keep inputs
read-only and never replace existing exports. Do not add model API calls,
authentication, cloud uploads or collaboration.

Finish with changed behavior, exact commands/results, remaining limitations,
and the next command I should run. If Docker is unavailable, say so explicitly;
do not claim that TestClient or the browser demo verifies the containers.
```

## Follow-up prompts, in order

Use one prompt per task. The longer `DEVELOPMENT-PROMPT.md` contains the complete schema and phase-by-phase acceptance criteria.

### 1. Reliable local startup

```text
Read AGENTS.md and README.md. Verify Compose, locked dependencies, read-only
input mounts, export permissions, the named SQLite volume, API health checks,
nginx proxying and localhost-only binding. Test normal restart with saved edits.
Fix only observed startup/persistence problems. Document Linux UID/GID setup
and macOS/Windows Docker path setup. Provide a reproducible smoke-test script.
```

### 2. Dataset and response round trips

```text
Read the preservation contract. Add focused integration fixtures for nested
image/JSON paths, several questions sharing one image, literal A/B and "01"
choices, unknown nested fields, fractional boxes, shuffled JSONL rows and
repeated model trials. Verify explicit composite identity matching and staged
mapping acceptance. Missing identity must stay unassigned. Re-open an exported
dataset and compare exact unchanged JSON/image bytes and semantic edited data.
Do not normalize answer labels or invent annotations.
```

### 3. Canvas and accessible editing

```text
Keep the current design. Verify drawing in every direction, moving, all four
resize corners, numeric coordinate edits, zoom/fit/scroll, multiple boxes per
owner, deletion/undo and the singleton solution. Test at two viewport sizes
and 200% text enlargement. Fix coordinate, focus, clipping and keyboard issues.
Keep original image pixels, stable IDs and unchanged image bytes. Capture the
resulting UI and report which browser scenarios actually passed.
```

### 4. Save conflicts and interrupted exports

```text
Verify two tabs editing the same record, rapid edits while an earlier save is
in flight, failed/retried saves and explicit conflict resolution. Exercise
cancelled exports, existing destinations, source changes and process restarts.
A failed export must not look complete or overwrite a destination. Pending
edits must remain visible and must never be labeled saved prematurely. Add
regression coverage only for concrete gaps you find.
```

### 5. Maintainability and larger collections, when needed

```text
After the core workflow passes, extract the large page into canvas, inspector,
sidebar, setup and export feature components without changing behavior or
creating a second implementation. For a corpus of hundreds of images and
multiple questions per image, measure first. If needed, add a paginated or
virtualized sidebar and server-filtered item queries; preserve stable selection
and pending edits across pages. Keep the same JSON/export contract and UI.
```

## Implemented versus verified

Implemented: onboarding; mounted-directory selection; previous/next; question and choice-description editing; deception creation/deletion/order; multiple movable/resizable boxes; single solution editor; exclusions and restoration; sequential autosave/conflicts; staged JSONL imports with composite matching; model comparison/logos; separate-directory atomic exports and ZIP download; SQLite persistence; Docker definitions; browser demo.

Verified during development: TypeScript check, portable Vite build, 11 passing backend integration/domain tests and 6 passing frontend domain/geometry checks. Backend tests cover unchanged-byte export, metadata preservation, restart/conflicts, paths/symlinks, image dimensions, failed exports, shared images, response ambiguity/repeated trials, real API endpoints and numeric-string choice ordering.

Not yet verified in containers: Docker image build/start and a full browser journey through the two-container deployment. Docker was unavailable in the authoring environment. Browser UI checks and API tests were performed separately. Treat container smoke testing as the first Codex task, not as completed work.

The code deliberately targets trusted local use, with one API worker and no public-user authentication. All bundled model responses are illustrative, not benchmark results. The asset provenance and reuse limitations are recorded in `docs/ASSETS.md`.

## Information to give Codex with your real data

Provide your actual dataset/output/export paths locally, one representative full JSON record, and one complete representative JSONL row for each materially different output format. The supplied snippet containing only `visible_output` is not enough to identify the question; point out the identifier field in the full row. If an image has several questions, provide the question/record identifier too.

Do not provide API keys: this tool reads previously saved responses and does not need model credentials.
