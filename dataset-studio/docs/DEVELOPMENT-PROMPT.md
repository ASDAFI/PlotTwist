# PlotTwist Studio — implementation handoff

## Current implementation

The repository now includes the React/TypeScript editor, FastAPI filesystem service, SQLite drafts and version checks, mounted-folder selection, staged JSONL mapping, transactional exports, and a two-service Docker Compose configuration. Continue from this implementation and preserve the interface and data contract below. Inspect code and existing tests before each phase; completed behavior needs verification and focused improvements, not wholesale replacement.

The phases below remain useful as bounded work packages for maintenance, hardening and scaling. They describe the target contract and acceptance checks, not a claim that every possible production enhancement is complete. Core runtime modules are `backend/app/{domain,storage,service,main}.py`, `hooks/use-durable-workspace.ts`, `components/workspace/`, and `app/page.tsx`.

Known follow-up work: run the Docker smoke test on a Docker-enabled machine; add a full browser test against the two containers; virtualize and server-filter the item index for very large corpora; expose persistent history if required; and add authenticated multi-user operation only if the deployment scope changes. The hosted preview is a session-only demonstration; the Docker application provides durable storage.

Give the master instructions and preservation contract to your coding agent, then one phase at a time. Keep changes independently reviewable and runnable. Do not recreate the design.

---

## Master prompt

You are implementing **PlotTwist Studio**, a local-first, Dockerized dataset-development web application for visual-riddle research. Continue the supplied working editor and API. Preserve reliable filesystem access, durable editing, safe exports, and verified model-response matching while completing the selected follow-up phase.

Do not change the dataset schema or invent a new annotation format. The output must be consumable by the same code that reads the input. Keep the project modular, documented, and reproducible. Prefer a small maintainable application over a generalized annotation platform. Do not add model API calls, billing, cloud uploads, authentication providers, collaboration features, or benchmark execution.

### Product workflow

1. Ask for an annotator name and OpenReview profile URL or profile ID. This is attribution, not authentication; do not claim the profile has been verified.
2. Select a dataset root with `images/` and `json/` subdirectories. Select a separate directory of model response `.jsonl` files, with one filename per model. Permit skipping response import to annotate without model outputs.
3. Choose a distinct writable export destination. In Docker mode, the UI selects from configured mounted roots, not arbitrary host filesystem paths.
4. Browse image/JSON pairs in deterministic natural filename order, with a sidebar and previous/next controls.
5. Edit question text and existing choice descriptions. Preserve choice keys literally. Permit editing the singleton answer's option, explanation, and bounding boxes.
6. Add/edit/delete deceptions and reorder them. Support multiple boxes per deception and per solution.
7. Inspect read-only model answers in a comparison drawer with provider logos, supplied reasoning, raw output, parse status, and exact-key match status.
8. Save edits durably to app state; export a complete paired dataset into a new directory. Excluded items must not appear in the export. Never modify original input files or source model responses.

### Directory contract

```text
dataset/
  images/
    020.jpg
  json/
    020.json
model_outputs/
  openai_gpt-4o.jsonl
  google_gemini-2.5-pro.jsonl
exports/
  review-2026-09-21-001/
    images/
      020.jpg
    json/
      020.json
app_state/                 # separate from the exported dataset
  workspace.sqlite
```

`model_outputs` is an input directory, even if the user's directory is literally named `output`. `exports` is the new dataset destination. Never conflate them. Images resolve from `image.path` relative to the dataset root; do not derive the image filename solely from the JSON filename. Preserve relative image paths, JSON filenames, case, and nested directories. Match JSON records by their relative JSON path internally. Several records may share an image; treat that explicitly when mapping model responses.

### Required JSON contract

Use this exact structural contract. Additional input keys must survive round trips at every nesting level.

```json
{
  "image": {
    "path": "images/020.jpg",
    "width": 1013,
    "height": 675
  },
  "source": {
    "url": "https://www.jagranjosh.com/general-knowledge/brain-teaser-iq-test-spot-who-is-rich-only-top-1-per-cent-observant-answer-correctly-in-5-seconds-1747571299-1",
    "authored_date": null
  },
  "popularity": {
    "views": null,
    "comments_count": null,
    "likes": null
  },
  "problem": "who is rich",
  "choices": {
    "A": "Woman A",
    "B": "Woman B"
  },
  "ordered_deceptions": [
    {
      "id": 1,
      "intended_option": null,
      "deceptive_idea": "Visible clothing and possessions invite a quick judgment about wealth.",
      "bounding_boxes": []
    },
    {
      "id": 2,
      "intended_option": null,
      "deceptive_idea": "The decisive detail that woman B's shirt has a fake Nike logo can be overlooked among the surrounding visual information.",
      "bounding_boxes": []
    },
    {
      "id": 3,
      "intended_option": null,
      "deceptive_idea": "Woman B is receiving a large amount of cash from a customer, making her appear wealthy.",
      "bounding_boxes": [
        {
          "box_id": "ea352a8d-e35f-4fcf-a994-7c1671ca98fc",
          "x": 780.9638886101253,
          "y": 386.22202488591466,
          "width": 165.7648375878881,
          "height": 164.87276048090632
        }
      ]
    }
  ],
  "answer": {
    "option": "A",
    "idea": "Woman A is rich; Woman B's shirt has a fake Nike logo.",
    "bounding_boxes": [],
    "source": {
      "type": null,
      "note": null
    }
  },
  "difficulty": null,
  "category": null,
  "contributor": {
    "name": "mahyar",
    "openreview_id": null
  },
  "added_date": null,
  "is_ai_generated": false
}
```

### Non-negotiable preservation rules

- The question field is `problem`. Do not rename it to `problem_type` or interpret it as a category.
- `choices` keys and `answer.option` are literal identifiers. Never convert A/B/C to 1/2/3 or the reverse. Preserve numeric-looking string keys such as `"01"`.
- Keep nulls as nulls. Do not fill missing dates, popularity, difficulty, category, or source details with fabricated values.
- Keep existing deception `id` and box `box_id` values stable. Reordering changes array position only. The UI's “Deception 1” means first in the array, not necessarily `id: 1`.
- Allocate new numeric deception IDs without collisions; use fresh UUIDs for new box IDs. If legacy IDs include nonnumeric values, preserve them and document a collision-free allocator.
- A solution is exactly one `answer` object. It can have many boxes. Do not add or delete whole solutions through a multi-solution control.
- Preserve floats; do not round or integer-cast stored box coordinates merely to display them. Number formatting changes JSON representation, not underlying values.
- Preserve unknown fields, including unknown fields nested in boxes, contributor, image, answer, and deception objects. Do not rebuild records from a lossy schema projection.
- Do not add `annotation_metadata`, `auxiliary_annotations`, `migration_metadata`, review status, response text, or UI state to exported records. Keep bookkeeping in app state.
- Copy image bytes unchanged. Boxes are overlays, never burned into the image.
- On an edited record, set `contributor.name` and `contributor.openreview_id` to the current annotator while preserving other contributor keys. Preserve contributor metadata on unedited records. Keep the previous contributor and edit history in the internal audit log. Call out this policy in the UI because the supplied schema supports only one contributor.
- Do not change `added_date` when editing. Do not silently repair an invalid file.
- An unchanged JSON file should be copied byte-for-byte when possible. An edited file may be serialized as UTF-8 with stable formatting, but its untouched fields and values must remain semantically equal.

### UI design contract

Preserve the supplied design: a deep forest sidebar, white working surfaces, restrained green primary actions, amber deception overlays, and green solution overlays. Use labels as well as color.

| Surface | Required content and behavior |
|---|---|
| Setup, step 1 | Name, OpenReview URL/ID, inline validation, Continue. Accept a profile ID beginning with `~` or a valid OpenReview profile URL. Explain attribution without treating it as a login. |
| Setup, step 2 | Dataset folder, model-output folder, export location, validation summary, and Open dataset. In a browser-only demo use local file selection; in Docker browse mounted roots. |
| Left sidebar | Active dataset, image thumbnails, filename, question snippet, active item state, edited state, and annotator profile/settings. |
| Header | Workspace path, honest save state, AI answers with provider logos, Export. Save-state text must reflect actual persistence. |
| Navigation | Previous, next, current index/total. Disable at boundaries. Keyboard arrows work outside inputs/dialogs. |
| Center canvas | Fit image, zoom, select/move, draw box, show/hide boxes, undo. Show original image dimensions. Scroll/pan zoomed images. Show the current box owner before drawing. |
| Annotation panel | Editable question; choice labels; ordered deception cards; singleton solution card; selected-box coordinates; exclude item. |
| Deception card | Rank, preserved internal ID in details, editable idea, intended option (nullable), box count, Add box, Move earlier/later, Delete. Add accessible drag reordering if useful, while keeping keyboard buttons. |
| Solution card | Exact-key answer select, explanation, diagnostic boxes. Same box editing as a deception. |
| Model drawer | Provider logo and model name; matched image/item; raw supplied answer; supplied reasoning; parse errors; exact-key comparison; raw response disclosure. No automatic overwrite. |
| Export | Included/edited/excluded counts, destination, validation errors, progress, and final exported directory. |

Use 14px or larger for routine labels and editing text, with readable body text and 12px secondary metadata. Preserve keyboard focus, accessible names, confirmation for exclusion/deception deletion, and undo. At tablet widths keep the canvas usable; on phones stack canvas and editor. Verify no horizontal clipping at 200% text zoom. Small icon controls need adequate hit areas.

Do not let model comparison shift the image or cover the entire editing state unnecessarily. A side drawer is preferred. Match and mismatch badges refer to the dataset's reference answer, not an assertion of scientific correctness.

### Bounding-box semantics

All boxes use original image pixels in `x, y, width, height` form, with top-left origin. Browser/canvas coordinates must be transformed into native image coordinates. The transform must account for rendered size, zoom, pan, letterboxing, scroll, and pointer location; device pixel ratio must not alter stored coordinates.

- Drawing in any direction normalizes to positive width/height.
- Support select, drag/move, resize handles, precise numeric edits, delete, and undo.
- Keep a selected owner (`deception ID` or `answer`) separate from the selected box ID.
- Clamp interactive geometry to the image bounds, require finite values and positive sizes, and reject malformed imported geometry with file-specific errors.
- Duplicate box IDs and duplicate deception IDs within an item are errors; do not silently merge them.
- Check actual decoded image dimensions against metadata. On mismatch, show the discrepancy and block box editing/export for that item until an explicit reviewed repair is made. Do not silently rescale old coordinates.
- Deal explicitly with EXIF orientation: preserve the image file and define native coordinates against the display orientation; detect an incompatible width/height convention and request a deliberate fix. Do not rotate or re-encode files silently.
- Imported boxes must appear in the same location after save, reload, and export, including fractional coordinates.
- Use real per-gesture undo: one draw/move/resize gesture should be one action, not hundreds of pointer-motion entries.

### Response ingestion and association

The only guaranteed response field is:

```json
{
  "visible_output": "<reasoning>Supplied model explanation.</reasoning><answer>B</answer>"
}
```

**That field does not identify the image or question. Never pair JSONL rows to images by row number by default.** Request one complete representative response row when implementing the real adapter. Useful work can proceed using test fixtures until it is supplied.

Provide configurable field paths, for example `image.path`, `image_path`, `image_id`, `item_id`, `sample_id`, or a composite image-plus-question identifier. These are candidate mappings, not promises that the user's JSONL contains them. Show a mapping preview and counts of matched, unmatched, ambiguous, invalid, and duplicate rows before accepting a mapping.

Prefer exact relative JSON path or a declared stable record ID. Exact image path is safe only when it identifies one dataset record. Basename/stem matching is allowed only when uniqueness is verified across the whole dataset, not just the current page. Do not strip numeric leading zeros, coerce A into 1, or guess from question text. If multiple questions share one image, require a question/record identifier or explicit mapping file. A fully keyless file needs an explicit user-supplied mapping manifest; do not silently assume order.

Retain every trial/retry/run. If a run identifier exists, expose it. Otherwise show source filename and line number; do not silently choose the first or latest answer. Keep unmatched and ambiguous rows visible in an import report. File names may encode provider/model using slashes replaced with underscores; show the supplied filename and allow a display label without renaming it.

Parse `<reasoning>` and `<answer>` without rendering HTML. Preserve raw `visible_output`. Require one complete answer block; missing, malformed, empty, or repeated answer tags produce an explicit parse state. Supplied reasoning is optional; do not invent it. For multiple reasoning blocks, show raw text and a parse warning. Trim only outer whitespace for comparison; `Person A`, `A.`, and `1` do not equal `A` automatically. An answer not in `choices` is “out of choices,” not silently normalized. No use of hidden model reasoning or model API calls.

Use local provider SVG assets for known providers and a neutral fallback for unknown models. Keep the icon license. Model branding is not evidence of model availability, benchmark performance, or endorsement.

### Production architecture

Use a TypeScript React frontend preserving the supplied editor. A clean Vite SPA build is supplied for Docker; it shares source with the preview. Use FastAPI + Pydantic for a Python backend, with SQLite for durable workspace state and internal history. Use ordinary filesystem I/O for images, input JSON, read-only JSONL, and exported dataset files. Do not put image bytes in SQLite.

Suggested modules:

```text
frontend/
  src/
    app/
    features/setup/
    features/workspace/
    features/annotations/
    features/responses/
    features/export/
    components/
    domain/
    api/
backend/
  app/
    main.py
    config.py
    api/{workspaces,items,responses,exports}.py
    domain/{records,geometry,response_mapping}.py
    services/{dataset_index,annotation_store,response_index,exporter}.py
    storage/{paths,atomic_io,state_db}.py
  tests/
docker/
  nginx.conf
compose.yaml
.env.example
README.md
```

This is a target separation, not a command to rewrite working modules for style alone. Move the editor's large page into feature components incrementally while preserving behavior.

Backend responsibilities:

- Enumerate only configured mounted roots. Resolve and verify containment for every read and write. Reject traversal and symlink escape after canonicalization. Never allow a browser-supplied absolute path to bypass the configured roots.
- Validate the dataset with file-specific actionable errors; list orphan images/JSON, invalid JSON, missing images, duplicate IDs, invalid answers, and bad geometry. Preserve unsupported fields.
- Store original raw JSON, a content hash/revision, and a durable editable document separately. Save with optimistic concurrency (`If-Match`/ETag or an equivalent revision field). Return a conflict without discarding either draft when another editor has saved.
- Persist draft saves transactionally in SQLite; expose clean/dirty/saving/saved/failed states. On next/previous, flush pending edits or keep the draft with an explicit state. Recover after page reload and application restart.
- Keep originals immutable and models' outputs read-only. Exclusion is a reversible tombstone in app state, not unlinking an input image.
- Stream/index JSONL rather than loading arbitrarily large response corpora into the browser. Include cancellation, progress, file hashes/mtime, and errors with filename and line number. Cache by source fingerprint and mapping configuration.
- Serve images through a bounded, authenticated-if-required-by-deployment API identifier, not arbitrary file paths. For this local single-user product, bind the host port to `127.0.0.1` by default. OpenReview attribution is never an access-control mechanism.
- Use a background export job for large datasets, with observable progress and failure state.

Suggested API contract:

| Method and endpoint | Purpose |
|---|---|
| `GET /api/health` | Container health, no sensitive path dump. |
| `GET /api/roots` | Configured dataset/response/export root labels. |
| `GET /api/directories?root=...&relative_path=...` | Browse within an allowlisted root only. |
| `POST /api/workspaces` | Open/validate selected roots and annotator; return counts/errors. |
| `GET /api/workspaces/{id}/items` | Paginated ordered item metadata/thumbnails. |
| `GET /api/workspaces/{id}/items/{item_id}` | Full preserved record, image URL, revision, edit/exclusion state. |
| `PUT /api/workspaces/{id}/items/{item_id}` | Validate and atomically save an edited record with expected revision. |
| `POST /api/workspaces/{id}/items/{item_id}/exclude` | Set or clear reversible exclusion. |
| `POST /api/workspaces/{id}/response-imports` | Configure mapping, build index, report progress and unmatched rows. |
| `GET /api/workspaces/{id}/items/{item_id}/responses` | All linked runs, parse status, raw text, source identity. |
| `POST /api/workspaces/{id}/exports` | Validate and create a staged export job. |
| `GET /api/workspaces/{id}/exports/{job_id}` | Export progress, errors, and completed destination. |

Record IDs in URL paths should be opaque safe IDs, with the relative JSON path stored separately. Avoid raw slash-containing file paths as URL identifiers. Document request and response types in OpenAPI and generate or validate frontend types against them.

### Export safety and completeness

Export all retained pairs, not only edited JSON. Copy all referenced images, including images shared by multiple retained records, once per path. Do not delete a shared image because a different item referencing it was excluded. Excluded items' JSON is absent. Unreferenced input assets should be reported and excluded unless explicitly requested.

The output directory must be distinct from both the input dataset and response directory, after resolving paths. Reject exports into an input directory or its descendants. Reject targets containing source roots. Do not overwrite an existing export silently.

Create a fresh sibling staging directory under the export root. Write/copy every file there, preserving relative paths; fsync files/directories as appropriate. Validate pair completeness, JSON semantics, box bounds, and image checksums. Only then atomically rename staging to the final new destination on the same filesystem. A failed export must never appear as a completed dataset. Keep the previous completed export untouched. Clean up failed staging paths safely and document recovery after an interrupted job.

Keep export reports and history in app state, outside the exported `images/` and `json/`. Check disk-space/write errors and destination-name collisions. Preserve access permissions suitable for the host user; do not run everything as root to hide permission issues.

### Docker contract

Deliver a one-command production startup, a pinned dependency lockfile for each language, health checks, persistent state, and a concise README.

- `web`: multi-stage static UI build, unprivileged nginx, proxy `/api` to the API service.
- `api`: non-root Python image, pinned Python dependencies, FastAPI served by an ASGI server. Keep deployment choices documented and reproducible.
- Dataset mount `/data/dataset:ro`; responses mount `/data/responses:ro`; export mount `/data/exports:rw`; persistent SQLite state volume `/var/lib/plottwist`.
- Example environment variables: `DATASET_DIR`, `RESPONSES_DIR`, `EXPORT_DIR`. Use explicit host-to-container mapping examples. Fail clearly when a configured host directory does not exist rather than creating a misleading empty directory.
- Do not claim a browser directory picker grants the container access to arbitrary host paths. Docker mode must use mounted-root browsing; browser file upload is a separate optional mode.
- Default published address `127.0.0.1:8080`. Keep API internal. No model credentials are needed.
- Verify `docker compose config`, image builds, health checks, volume permissions, source read-only behavior, and persistence across restart.

---

## Phase prompts

### Phase 1 — Freeze the data contract and extract domain code

Implement the domain layer and representative fixtures before adding persistence. Read the existing UI; extract types, validation, geometry, response parsing, and serialization without changing its design. Treat extra keys as preserved data, not validation garbage.

Deliver schema/type definitions, explicit validators, original/edited serializer behavior, fixtures, and a short architecture decision record. Use the provided JSON and test cases with A/B keys, numeric-looking keys, null fields, nested unknown keys, fractional boxes, empty box lists, stable nonsequential deception IDs, Unicode text, multiple JSON records sharing one image, and malformed responses.

Acceptance: unchanged round trip preserves all fields and types; editing only `problem` leaves everything else semantically unchanged except the explicitly documented contributor update; no prohibited metadata is injected; original floats and choice keys survive; reordering preserves IDs and box ownership.

### Phase 2 — Docker foundation and mounted directory access

Create the production API skeleton, locked dependencies, settings, health endpoint, path service, state database migrations, and Docker Compose wiring. Keep the working UI visible. Add mounted-root browsing to setup while retaining the demo flow.

Deliver containers, `.env.example`, health checks, and README commands. Configure dataset/responses read-only and exports/state writable. Explain host paths versus container paths in setup help.

Acceptance: one command starts the UI and healthy API; missing mounts report clear errors; traversal, encoded traversal, symlink escape, and output-to-input aliases are rejected; API cannot write input mounts; configured export location is writable; state survives container restart. Do not proceed by weakening permissions.

### Phase 3 — Dataset indexing and onboarding integration

Index every JSON/image pair, validate paths and dimensions, report errors per file, and paginate deterministic navigation. Connect annotator profile and dataset selection to a workspace. Preserve the editor's visual layout. Allow a user to review validation errors instead of silently skipping bad records.

Deliver workspace/item APIs, image-serving endpoint, cached thumbnails where justified, loading/error states, and dataset summary. Internal workspace IDs must not leak into exported JSON.

Acceptance: nested paths and mixed extensions work; `image.path` wins over basename assumptions; empty folders/missing images/invalid JSON/duplicate IDs produce readable errors; a 300-item dataset opens without fetching every full-resolution image into the UI at once; the original image is still available for precise annotation.

### Phase 4 — Durable editing, ordering, exclusion, and undo

Wire editable question, existing choice descriptions, deceptions, and singleton solution to durable state. Add debounced saves with explicit status; flush or retain pending edits when navigating. Preserve changes on refresh. Implement bounded undo/redo history with sensible gesture/text grouping. Implement optimistic concurrency.

Deliver modular editor features and save-state handling. Reorder by array position only; keep IDs stable. Excluding an item sets a reversible tombstone. Deleting a deception removes only it and its boxes; deleting a box affects its owner only.

Acceptance: edit → next → previous → refresh → restart keeps data; interrupted saves do not corrupt records; conflicting tabs get an actionable conflict state; A/B values remain A/B; null intended options survive; only one solution exists; exclusion and deletion can be undone before export; unchanged records keep their original contributor.

### Phase 5 — Production bounding-box editing

Harden the canvas implementation while preserving its look. Use an SVG or canvas library only if it improves reliable transforms; do not rewrite for its own sake. Implement pan/zoom/fit, all-direction draw, move, resize handles, numeric edits, hide/show, deletion, and per-gesture undo. Connect the selected owner to the inspector.

Acceptance: at different zoom factors, viewport sizes, scroll positions, and device-pixel ratios, boxes serialize to the same original-pixel coordinates; negative drags normalize; corners stay inside the image; movement does not change size; resizing does not switch owner; EXIF/dimension mismatches are visible and block unsafe changes; save/reload/export never burns overlays into images.

### Phase 6 — Real JSONL mapping and model comparison

Ask for one full response row or use a declared adapter fixture. Implement configurable mapping and an explicit import preview. Index JSONL incrementally on the backend and preserve every trial. Parse only the supplied `visible_output` for model-visible explanation/answer. Implement local logos with a fallback.

Acceptance: shuffled JSONL rows still attach correctly; zero-padded identifiers are preserved; duplicate stems in different directories remain ambiguous; multiple questions for one image require record/question identity; missing identity never triggers positional fallback; repeated runs remain separate; missing/repeated/empty answer blocks and out-of-choice answers have explicit states; HTML-like content is displayed as text; model outputs never alter the annotations.

### Phase 7 — Atomic complete-dataset export

Implement export validation, staged copy/write, checksums, atomic finalization, progress, cancellation/recovery, and completed export history. Connect the existing Export dialog to the job API. Keep browser ZIP export as an optional convenience with clearly stated limits.

Acceptance: exported `images/` and `json/` re-open as a valid dataset; all retained pairs are present; excluded JSON is absent; shared images remain when referenced; source file hashes are unchanged; edited contributor policy is applied correctly; unknown keys and fractional boxes survive; disk-full, permission-denied, or forced interruption leaves no falsely completed export; existing exports are never overwritten silently.

### Phase 8 — Focused end-to-end verification and handoff

Finish only behavior needed for this product. Review keyboard access, empty/error/loading states, mobile/tablet layouts, and 200% text zoom. Remove misleading “saved” labels and demo data from production mode. Keep the explicit demo mode and clearly label its model answers.

Run meaningful tests, not implementation-mirroring tests: domain round trip, shuffled/ambiguous response mapping, coordinate transforms, filesystem containment, save-conflict behavior, export atomicity, and one real end-to-end UI journey. In the UI journey, choose profile/roots, edit text, add/reorder/delete a deception, draw a deception and a solution box, compare imported responses, exclude and restore an item, restart, and export. Re-open the exported dataset and compare source hashes.

Deliver the final repository, frozen dependencies, runnable production Compose file, migration/recovery instructions, API documentation, short user guide, known limitations, and exact commands/results for checks actually run. Do not claim container, browser, or cross-platform tests that were not executed.

---

## Definition of done

A researcher can run Docker Compose locally, identify themselves, select mounted dataset and model-response folders, safely edit and annotate all items, compare correctly mapped model outputs, survive a browser/container restart, and export a separate valid paired dataset with source inputs untouched and literal choice labels preserved.

## Remaining development choices

The mounted filesystem API, SQLite persistence/conflicts, staged JSONL import, and atomic backend exports are implemented. Before deploying for real review work, run the supplied Compose setup and a full browser-to-container smoke test on a Docker-enabled machine.

Optional next work should follow actual dataset size and team needs: a virtualized/paginated sidebar, browseable persistent edit and export history, grouped undo/redo, richer import-report filtering, and authenticated collaboration. Public multi-user deployment is outside the initial local workflow. Do not introduce these features until requested.
