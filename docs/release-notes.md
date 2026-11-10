# Release notes — 2026-11-10

Versions: **web app 1.10.0**, **extension 1.10.0**

Artifacts: `dist/request-ledger.html`, `dist/extension/`,
`dist/request-ledger-extension-1.10.0.zip`, `dist/request-ledger-extension.zip`,
`dist/request-ledger-test-2026-11-10.zip`, `dist/CHECKSUMS.txt`, `dist/RELEASE.md`.
Rebuild with `node scripts/build.cjs`; verify with `node scripts/build.cjs --check`.

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
