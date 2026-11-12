# Release notes — 2026-11-12

Versions: **web app 1.10.3**, **extension 1.10.3**

Artifacts: `dist/request-ledger.html`, `dist/extension/`,
`dist/request-ledger-extension-1.10.3.zip`, `dist/request-ledger-extension.zip`,
`dist/request-ledger-test-2026-11-12.zip`, `dist/CHECKSUMS.txt`, `dist/RELEASE.md`.
Rebuild with `node scripts/build.cjs`; verify with `node scripts/build.cjs --check`.

## 1.10.3 - draft survival and tombstone hygiene

- Deleting a request freed its id (`max + 1`), and the deletion tombstone was sent in the same envelope
  as the re-created row. Both sides applied `deletedIds` before upserts, so the new row was deleted one
  round trip later and the panel echoed the tombstone back - the "new request disappears after save" report.
- A live id never keeps or sends a tombstone, and a same-envelope deletion is ignored for ids present in
  `requests`/`upserts`; creating a request clears any tombstone for that id.
- Snapshot paths (adoption/conflict replace, server hydrate, archive load) now merge by id and keep the
  newer row instead of replacing the array, so an unsaved draft cannot be wiped by a late snapshot.
- Regression: `request-loss` covers id reuse, a blank request created right after Save (10 s, disk,
  project switch, panel mirror) - 23 checks.

## 1.10.2 — request loss, atomic boot and a version handshake

- Fixed the P0 boot bug behind the disappearing request: `projectRegistry` was assigned but never
  declared, so `serverDiskBootstrap` threw `ReferenceError` after flipping `serverDiskMode = true` and
  before `serverDiskReady = true`. The registry is now declared once, populated from
  `initProjectRegistry()`, and boot is atomic: disk mode and readiness flip only after the whole
  hydration succeeds, otherwise both stay off and the app remains in browser-local mode.
- Each project ledger now carries a monotonic `rev`. Saves increment it; the server rejects a save
  with a lower revision; loads never replace memory with a lower revision; full-ledger replacements
  (adoption/conflict choice) are the only path guarded by it, while item-level merges keep the newer
  row. An explicit conflict choice still wins.
- The app and companion exchange `appVersion` and `rev` in HELLO/SNAPSHOT/PATCH/ACK/MEDIA envelopes.
  A missing or different major.minor version marks the peer as outdated: its ledger state is not
  applied, and one non-blocking "Extension build is outdated — update it." /
  "Eklenti sürümü eski — güncelleyin." notice is shown. Control replies (tabs/pick/capture) stay live.
- Fixed the cross-window capture/tab chooser: the dock now relays `RL_APP_TABS_RESULT` back to the
  page, and panel control replies carry `appVersion`, so the tab list and pick/capture results are
  not dropped by the version gate.
- `dock.js` posts with the extension origin only to a loaded panel iframe and with a validated `"*"`
  to windows that have not navigated yet, ending the target-origin console error.
- Added real-browser regressions: `request-loss` (A Ready, create B and keep typing, stale companion
  snapshot/save, reload, project switch, server restart) and `capture-loss` (element+screenshot from a
  second window, 20 s of description typing, reload, switch, panel).
- Hardened the E2E harness: every target enables `Page`, intercepts native file choosers, stubs
  File System Access pickers, auto-accepts `beforeunload`/`confirm`, uses per-suite server ports and
  profiles, caps UI waits at 10 s with screenshot/trace diagnostics, and removes runtime folders,
  `.rl-port`, locks and child processes on exit.

## 1.10.1 — companion presence after a browser restart

- The companion no longer trusts a persisted `rl-app-alive:true` from a previous browser session.
  The worker clears presence at the start of a browser session and only reports the app as alive
  after a real `/__rl/status` probe (or a live tab check for `file://`).
- Presence writes now carry `rl-app-alive-at`. The content script mounts only for a fresh value
  (≤ 12 s), asks the worker for a live answer at boot, and ignores stale state; a local watchdog
  unmounts if updates stop.
- A stale value no longer creates a host, iframe, launcher or lock card. With the app closed nothing
  appears on any page after a restart; with the app running the dock appears automatically within
  about 2 s. Closing/starting the server still hides/returns the UI without a page reload, in one or
  several tabs.
- `file://` app mode keeps a fresh timestamp while the app page is open and clears it on `pagehide`.
- Fixed worker storage calls that used the wrong receiver (`Illegal invocation`), which had prevented
  the 5 s presence poll from persisting its result.

## 1.10.0 — disk truth, safer backups and a silent port handoff

### Runtime data

User data lives next to `scripts/serve.cjs` and is never committed to git:

| Path | Contents |
|---|---|
| `projects/<slug>/` | Live project data: `project.json`, `ledger.json`, `archive.json`, `media.json`, `media/`, `exports/`. |
| `backups/` | Full backup ZIPs written by the app. Kept by a full reset. |
| `deleted-projects/` | Per-project ZIPs created by "keep a backup" deletes. |
| `rl-config.json` | Server-side UI config: language, theme and the last port. |

`.gitignore` covers all four. The test bundle never contains user data.

### Project deletion and restore

- Deleting a project asks whether to keep a backup. **Back up and delete** zips the whole
  `projects/<slug>/` folder into `deleted-projects/<slug>-<stamp>.zip` before removing it;
  **Delete without backup** removes the folder completely. The registry/active project are updated
  and a reload cannot resurrect the project.
- The backup screen lists `deleted-projects/` archives (project name, date, size) with restore and
  delete actions. A restore never overwrites an existing folder: the slug gets a numeric suffix and
  the toast tells the user the new name.
- Server endpoints validate slugs and ZIP names, reject traversal and extract zip-slip safely.

### Backups and reset

- The text/JSON backup option is removed. The only backup is the full compressed ZIP, including
  media when present.
- In server mode the ZIP is also written to `backups/`; the backup screen lists stored backups
  (newest first) and restores from any of them.
- **Proje verilerini temizle** is a full reset: it warns, offers a backup first, then removes every
  live project and every deleted-project archive on disk and in the browser. `backups/` is kept and
  the page reloads to a clean state.

### Server status and port changes

- The rail stop button and the onboarding stop control are removed. The rail shows a status dot and
  the port (green when served locally, red in plain file mode). Stopping is not a page action; a
  fully stopped server is started with `start.cmd`.
- A port change is silent: no origin warning, no backup prompt and no moved-port modal. Browser data
  is flushed to the shared disk first, so the new origin hydrates the same projects.
- The server only reports success after the replacement answers `/__rl/status` with its own pid and
  port (5 s timeout). On failure it keeps the old server running and returns an error; the page stays
  put and shows "Port değiştirilemedi; sunucu çalışmaya devam ediyor."
- `.rl-port` reflects the new port, and the exiting process no longer deletes the lock file written
  by the replacement (pid-guarded).
- Language and theme are stored in `rl-config.json`, injected into the page before first paint, and
  therefore survive a port change and a full server restart.

### Companion wording

- The bridge UI now says **Eklenti bağlı / Eklenti bağlı değil** ("Extension connected / not
  connected") instead of the old wording.

## Previous release

1.9.2 / 1.9.5 (2026-11-09): live sync of panel edits and Ready, single-tab Projects/Requests layout,
server lifecycle fixes, same-app port reuse, project/ledger identity fixes and the unified companion
media sync. See the changelog in the app's About screen for the full history.
