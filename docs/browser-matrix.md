# Browser matrix

Measured on 2026-11-08. Safari has no Windows build, so it is not testable on this machine.

## Firefox 159.0.1 (Windows 11, headless)

Probe: `tests/firefox/probe.html` (large pass/fail page). Screenshots:
`../.opencode/workspace/task-notes/firefox/file-probe2/` and `http-probe2/`.

| Capability | `file://` | `http://` |
|---|---|---|
| App renders | ✅ | ✅ |
| Protocol / secure context | file / true | http / true |
| `localStorage` | ✅ | ✅ |
| IndexedDB open + store | ✅ | ✅ |
| `navigator.clipboard.write` | ✅ | ✅ |
| `BroadcastChannel` | ✅ | ✅ |
| `fetch` | ✅ | ✅ |
| `showDirectoryPicker` (File System Access) | ❌ | ❌ |

Consequences:

- **Folder writing is unavailable in Firefox.** The app already falls back to downloads;
  "Export directory" is Chromium-only. The README states this.
- The extension is Chromium-only (Manifest V3), so the bridge, picker and dock do not exist in
  Firefox; the web app stays fully usable.

## Method and limits

- Firefox headless `--screenshot` fires at `load`; async checks were captured by holding `load`
  with a 1.6 s iframe (`tests/firefox/probe.html` points at a local helper on port 8081).
- The screenshots prove rendering and API availability, not interactions. Interaction coverage for
  Chromium lives in `tests/e2e/*` (28/28 + 28/28 + 26/26).
- Not measured: Firefox interactions (create/edit/export), Firefox private browsing, Safari.
