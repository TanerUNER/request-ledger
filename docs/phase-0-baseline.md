# Phase 0 — Baseline

Status: partially complete. The deterministic code baseline exists; browser coverage is measured for
one engine only.

Date: 2026-11-08

## 1. Deterministic code baseline (done)

The current extension domain core (`extension/src/core.js`) is executed under Node with a frozen
clock and `TZ=UTC`, producing artifacts that do not depend on the machine or the date.

| Artifact | Purpose |
|---|---|
| `tests/fixtures/ledger.reference.json` | Canonical ledger: 6 request types, 4 images, 1 attachment, 3 agents, fixed ids and timestamps |
| `tests/golden/markdown/{tr,en}-{zip,embedded,none}.md` | Markdown contract for 3 output modes × 2 languages |
| `tests/golden/backup/backup.json` | JSON backup envelope v3 |
| `tests/golden/checksums.json` | sha256 of every generated artifact |

Regenerate:

```powershell
cd _source
$env:TZ='UTC'; node scripts/generate-golden.cjs
```

Verify (no writes, exits 1 on drift):

```powershell
$env:TZ='UTC'; node scripts/generate-golden.cjs --check
```

Verified: two consecutive runs produce identical bytes (8 artifacts). Line endings are pinned with
`_source/.gitattributes` (`tests/golden/** -text`, `tests/fixtures/** -text`).

What the baseline proves:

- Markdown structure, labels, ordering, media naming and escaping for both languages;
- the empty-planning, full-run, light-run and custom-run planning branches;
- the three output modes (`zip` links, `embedded` base64, `none` counts only);
- the backup envelope shape, including which fields are stripped for JSON backups.

What it does not prove: the web app's own copy of the same logic. That parity is a Phase 1 deliverable
(drift test), because `index.html` embeds a separate implementation.

## 2. Browser measurement (partial)

Measured in the OpenCode in-app browser (Chromium 152 / Electron 44, Windows) at
`http://localhost:4173/index.html` served by a local static server:

| Capability | Result |
|---|---|
| Page loads, app initialises | ✅ title `My Project · Request Ledger`, version `1.6.1` |
| Console errors on load | ✅ none |
| `localStorage` write/read | ✅ |
| `IndexedDB` open + create store | ✅ |
| `showDirectoryPicker` (File System Access) | ✅ available |
| `navigator.clipboard.write` | ✅ available (localhost is a secure context) |
| `ClipboardEvent` | ✅ |
| Extension APIs on the page | ❌ as expected (`chrome.runtime` absent) |
| Theme resolution | ✅ followed OS preference (`data-theme="dark"`) |
| Language default | ✅ `en` |

Two empirical findings beyond static analysis:

1. **The Buy Me a Coffee widget really loads.** The accessibility tree contains an iframe titled
   "Buy Me a Coffee", i.e. a third-party network request on page load. This confirms SEC-01 in
   practice, not only in code. It must be removed or replaced before publication.
2. **A Turkish toast appears in the English UI** ("Kaydedildi.") on first load. The i18n text-walker
   does not cover this dynamically created node. Recorded as a Phase 2 fix.

### Not measured (explicitly pending)

| Item | Why |
|---|---|
| `file://` behaviour | the in-app browser refuses `file://` URLs, so the primary "double-click" path is untested |
| Firefox / Safari | no such engine available in this environment |
| Extension load, dock, capture, picker | requires loading the unpacked extension in a real Chrome profile |
| Screenshots / visual baseline | the desktop window was not visible, so `browser.screenshot` refused |
| Downloads, ZIP output, folder writes | require an interactive download/permission flow |
| Performance budgets | no trace captured in Phase 0 |

Consequence: the compatibility matrix is **not** complete and must not be reported as if it were.
The procedure is fixed; the missing rows are a manual step in a real Chrome profile.

## 3. Decisions carried forward

- The web app's port is not automatically correct just because `core.js` is; Phase 1 adds a parity
  check before any surface is rewired.
- The BMC removal is a release blocker, not a cosmetic cleanup.
- `file://` support stays in the product claim only after it is measured; otherwise the README must
  describe GitHub Pages as the primary mode.

## 4. Next

Phase 1: extract the domain into `src/core/`, keep the web app untouched, and make the Node harness
compare the new core against the legacy `core.js` byte for byte. See
`.opencode/workspace/plans/request-ledger-v2/plan.md`.
