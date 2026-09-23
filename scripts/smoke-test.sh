#!/usr/bin/env bash
set -euo pipefail

# Fast, repeatable deployment smoke test for the real two-container app.
# This deliberately does not claim to replace a browser journey.
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${project_root}"

compose=(docker compose)
cleanup() {
  if [[ "${KEEP_COMPOSE:-0}" != "1" ]]; then
    "${compose[@]}" down --remove-orphans >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "Checking Compose configuration..."
"${compose[@]}" config >/dev/null

manifest="$(mktemp -t plottwist-inputs.XXXXXX)"
trap 'rm -f "${manifest}"; cleanup' EXIT
while IFS= read -r file; do
  shasum -a 256 "${file}" >>"${manifest}"
done < <(find dataset-studio/examples/dataset dataset-studio/examples/responses -type f \( -name '*.json' -o -name '*.jpg' -o -name '*.jpeg' -o -name '*.png' -o -name '*.jsonl' \) -print | sort)

echo "Building and starting services..."
"${compose[@]}" up --build -d

wait_for() {
  local url="$1" attempts="${2:-60}"
  for ((i = 1; i <= attempts; i++)); do
    if curl --fail --silent --show-error "${url}" >/dev/null; then
      return 0
    fi
    sleep 1
  done
  echo "Timed out waiting for ${url}" >&2
  "${compose[@]}" ps >&2 || true
  "${compose[@]}" logs --tail=80 >&2 || true
  return 1
}

echo "Waiting for UI and API..."
wait_for http://127.0.0.1:8080/healthz
wait_for http://127.0.0.1:8080/api/health

echo "Checking mounted-root API..."
roots="$(curl --fail --silent http://127.0.0.1:8080/api/roots)"
grep -q 'dataset' <<<"${roots}"
grep -q 'responses' <<<"${roots}"
grep -q 'exports' <<<"${roots}"

if ! shasum -a 256 -c "${manifest}" >/tmp/plottwist-smoke-checksums 2>&1; then
  echo "Source file changed during smoke test." >&2
  cat /tmp/plottwist-smoke-checksums >&2
  exit 1
fi

echo "Compose smoke test passed. Source inputs are unchanged."
echo "Run the browser workflow manually at http://127.0.0.1:8080."
