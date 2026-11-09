# Tests

Current state: a deterministic baseline harness, no test framework, no dependencies.

## Run

```powershell
cd _source
$env:TZ='UTC'; node scripts/generate-golden.cjs --check
node tests/parity/model.parity.mjs
node tests/parity/drift.parity.mjs
node scripts/check-inline.cjs
node scripts/build.cjs --check
```

Extension end-to-end (needs Chrome/Edge and a local server):

```powershell
node scripts/serve.cjs 8080
node tests/e2e/extension.e2e.cjs
```

`--check` exits non-zero when the current `extension/src/core.js` no longer produces the recorded
artifacts. The parity tests exit non-zero when the extracted core or the web app constants disagree.
The e2e test launches a throwaway Chrome profile, loads `dist/extension`, and exits non-zero on any
failed check.

## Regenerate the baseline

Only when a behaviour change is intended:

```powershell
$env:TZ='UTC'; node scripts/generate-golden.cjs
git diff -- tests
```

Review the diff and commit it together with the code change that caused it.

## Layout

```
tests/
├── fixtures/ledger.reference.json      canonical ledger used by every markdown/backup case
├── golden/markdown/*.md                3 modes x 2 languages
├── golden/backup/backup.json           envelope v3, metadata only
├── golden/checksums.json               sha256 per artifact
├── parity/model.parity.mjs             extracted core vs legacy core.js
├── parity/drift.parity.mjs             web app constants vs src/core constants
└── e2e/extension.e2e.cjs               real Chrome run: dock, picker, capture, export, transfer
```

## Parity status (Phase 1)

Extracted to `src/core/` and proven identical: constants, utility helpers, request model
(lookups, validation, identity, normalisation, serialisation, signature, mutations, agents).

Still to extract: i18n, storage adapters, media pipeline, Markdown, ZIP, backup.

The drift guard compares `TYPES`, `PRIORITIES`, `TYPE_TEMPLATES`, the storage key, the database name
and version between `index.html` and `src/core`. A change on one side fails the test.

## Rules

- Never edit a golden file by hand.
- A golden diff is a contract change: state it in the commit message.
- `TZ=UTC` is mandatory; local time formatting is part of the output.
- Line endings are pinned in `.gitattributes`; do not normalise these files.

## Not covered yet

- parity with the web app's embedded implementation (`index.html`);
- ZIP binary round-trip;
- restore validation and media handling;
- extension messaging contracts;
- any DOM or visual behaviour.

These arrive in Phase 1 and Phase 2 (see `docs/phase-0-baseline.md`).
