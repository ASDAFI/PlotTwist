# Benchmarks

This section is reserved for reproducible evaluation work built on top of
Dataset Studio exports.

## Planned contents

```text
benchmarks/
├── README.md
├── configs/       # versioned benchmark definitions
├── fixtures/      # small, reviewable test fixtures
├── scripts/       # deterministic runners; add only when benchmark work starts
└── reports/       # generated reports; keep large outputs out of git
```

Benchmark code is not implemented yet. When added, it should:

- Read source data and model outputs without modifying them.
- Declare dataset, response, metric, and configuration versions explicitly.
- Preserve repeated trials and report missing or ambiguous identities.
- Avoid embedding review state or benchmark metadata into Dataset Studio JSON.
- Record the exact command and inputs used to produce each report.

Do not add model API calls, billing, cloud uploads, or hidden data downloads to
this section without an explicit project decision.
