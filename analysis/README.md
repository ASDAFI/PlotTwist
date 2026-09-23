# Analysis

This section is reserved for research analysis performed after review and
benchmark preparation.

## Planned contents

```text
analysis/
├── README.md
├── notebooks/     # exploratory notebooks
├── scripts/       # repeatable analysis scripts
├── figures/       # generated figures and visual summaries
├── tables/        # generated tabular outputs
└── notes/         # interpretation and research notes
```

Analysis is not implemented yet. Future work should use an exported dataset or
a clearly versioned read-only copy as input, keep generated artifacts separate
from source records, and include a short provenance note for each result.

Keep exploratory work isolated from the Dataset Studio application. Analysis
must not rewrite input JSON, images, model-output files, SQLite review state, or
published exports in place.
