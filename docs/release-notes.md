# Release notes — 2026-11-09

Versions: **web app 1.9.2**, **extension 1.9.5**

Artifacts: `dist/request-ledger.html`, `dist/extension/`,
`dist/request-ledger-extension-1.9.5.zip`, `dist/request-ledger-extension.zip`,
`dist/request-ledger-test-2026-11-09.zip`, `dist/CHECKSUMS.txt`, `dist/RELEASE.md`.
Rebuild with `node scripts/build.cjs`; verify with `node scripts/build.cjs --check`.

## 1.9.2 / 1.9.5 — live sync, layout and server lifecycle

New capabilities and fixes:

- **Live sync of panel edits and Ready.** Panel edits, ready toggles and app edits now carry
  revisions and appear on the other surface within one second. Accepting Ready bumps `updatedAt`,
  so the item-level merge can no longer drop the confirmation.
- **No auto-opened panel section.** Bridge project adoption preserves a closed panel or the user's
  last explicit section; it never opens a section on its own.
- **Projects / Requests layout.** One tab strip now sits below the Requests header and above the
  active pane. The panel has no Projects block, tab-like New project action or stray list divider;
  the active tab, search focus and scroll position survive bridge updates.
- **Server lifecycle.** A backgrounded live tab cannot idle-stop the server. Closing the last app tab
  stops it after a 5-second grace; 300 s without a live page is only the fallback when no pagehide
  marker arrives. F5 keeps the same port and cancels a pending shutdown.
- **Same-app port reuse.** If the requested port belongs to the same app, that instance is stopped
  and the same port is reused instead of silently changing the origin.
- **Fallback warning.** An unrelated busy port still falls back; the page is served with
  `?rl-moved=<port>` and shows the existing new-origin warning with the restore prompt.
- **Project/ledger identity.** The bridge conflict is scoped to the same `projectId`; different
  projects never trigger a global “Two ledgers found” dialog. Reload reopens the last active
  project and its own ledger. The old “Ortak Zemin” record is renamed to the neutral translated
  “Imported project” and remains a normal, deletable project.

### Companion simplification

- The extension is now a true companion: no app running means **no extension UI at all** (no rail,
  launcher, iframe or lock card). It returns automatically when the app starts. It cannot re-enable
  itself after being disabled in `chrome://extensions`.
- Projects are app-owned. The extension has no project list, creation, switching or project modal; it
  follows the app’s active project automatically.
- Media syncs both ways through the bridge (paste, upload, screenshot, element+screenshot), with an
  **8 MB per-item cap**; larger items travel only with a backup ZIP.
- Repeated element selections append with `" | "` on both surfaces, deduped and capped at 200 chars.
- The extension Settings section and folder pickers are removed. A panel-only light/dark toggle is
  stored as `rl-theme`.
- Ready/locked requests still open the image preview; editing remains blocked.
- Server mode creates `projects/<project-slug>/`; Save writes the ledger snapshot, Export writes to
  the chosen target or the project folder’s `exports/`, and archive project metadata reads the folder
  list. `file://` mode has no folder writes and shows a server-mode-required message with download
  fallback.
- The local server stops **~5 s after the last app tab closes**, survives reload, releases the port,
  removes the lock file, and restarts/reconnects with `start.cmd`. `stop.cmd` still works.

### Final pass

- **Restart server** in Settings asks the live server to spawn its replacement on the same port, then
  reloads once the new pid answers. The fake “Reconnect” button after a hard stop is gone; the blocked
  screen only says to run `start.cmd`, and the page reconnects automatically when the server returns.
- **Per-tab pin and theme**: the dock passes its tab id to the panel (`?tab=<id>`), which stores
  `rl-pinned:<tab>` and `rl-theme:<tab>` in `chrome.storage.session`. New tabs start with defaults;
  closing a tab removes its keys.
- The toolbar action opens a static **About popup** (`panel/about.html`) with name, manifest version,
  description, repository, support link, MIT license and the app-open requirement. The in-page dock is
  unchanged.
- **Loading media state**: metadata that arrives before its blob renders “Loading image…” on both
  surfaces and swaps to the image when `RL_APP_MEDIA` lands, with no reload. “Image not found” appears
  only after the transfer window expires.

## Previous release — 1.9.1 / 1.9.4 — workspace, capture tools and a calmer setup

New capabilities:

- **Workspace and projects.** The web app and the extension keep a project registry and a separate
  ledger, export target, media, records, drafts and archive per project. Switching projects is
  guarded by the unsaved-changes confirmation and never merges data across project ids.
- **Per-project media.** Images and attachments are scoped to the project that created them.
  Backup **v4** carries every project and its media; older v3 backups still restore into one project.
- **Project-aware live bridge.** Requests and the project name sync both ways by project id while the
  app is open on `file://`, any `http://localhost:<port>` or any `http://127.0.0.1:<port>`. A panel on
  another project never merges data. The bridge is text only; media travels with a ZIP backup.
- **Capture tools from the app.** The element picker, screenshot and element + screenshot share one
  tab chooser. They fill Page and Location, attach the cropped image to the active request, show
  progress, honor cancel and reuse the 30 s timeout.
- **Onboarding and run modes.** A first-run screen compares the single HTML file with the local
  server and the extension. HTML mode states that it cannot start a server; the bridge and picker
  work when the extension is allowed to access file URLs.
- **Local server mode.** `start.cmd` starts `scripts/serve.cjs --port 0 --open` hidden, remembers
  `.rl-port`, falls back to a free port when the remembered one is busy and warns the user.
  `stop.cmd` reads `.rl-server.lock` and shuts the server down. The server stays up while a tab is
  live and waits at least 5 minutes after the last live page disappears.
- **New logo and opener.** A terracotta tile with three ruled lines and a sage check stamp replaces
  the `RL` letter mark. The extension opener is a 44 px circular button with the same mark.

Updates and fixes:

- The web app changelog and the extension changelog both cover this release in Turkish and English.
- Equal-timestamp bridge records keep the local object, so live sync no longer drops a just-written
  field.
- File pages normalize the opaque `null` message identity; `127.0.0.1` is accepted while remote
  origins stay outside the allowlist.
- Copy cleanup removed duplicate headings, Turkish strings left in the English interface and verbose
  backup descriptions.
- The README pair, screenshots and marketing images were rebuilt for desktop (1440), laptop (1280)
  and tablet (1024). Mobile is intentionally out of scope.

## Verified for 1.9.2 / 1.9.5

Executed on 2026-11-09:

```
node scripts/build.cjs                         -> Built dist/: web 1.9.2, extension 1.9.5, 22 files, zip 976 KB
                                                   Test bundle: dist/request-ledger-test-2026-11-09.zip (1708 KB)
node scripts/check-inline.cjs                  -> Inline scripts OK: 2 block(s) in index.html
node scripts/build.cjs --check                 -> Release check OK: web 1.9.2, extension 1.9.5, 22 files
node tests/e2e/extension.e2e.cjs               -> 29/29 checks passed
node tests/e2e/bridge.e2e.cjs                  -> 34/34 checks passed
node tests/e2e/picker.e2e.cjs                  -> 29/29 checks passed
node tests/e2e/capture-tools.e2e.cjs           -> 20/20 checks passed
node tests/e2e/file-bridge.e2e.cjs             -> 32/32 checks passed
node tests/e2e/project-consistency.e2e.cjs     -> 39/39 checks passed
node tests/e2e/real-tabs.e2e.cjs               -> 48/48 checks passed
node tests/e2e/real-tabs-conflict.e2e.cjs      -> 6/6 checks passed
node tests/e2e/server-lifecycle.e2e.cjs        -> 30/30 checks passed
README image verification                      -> 12 images, 9 local links per README resolved
test bundle                                    -> README.md, README.tr.md and panel/about.* included
```

## Previous release verification — 1.9.1 / 1.9.4

Executed on 2026-11-09:

```
node scripts/build.cjs                         -> Built dist/: web 1.9.1, extension 1.9.4, 19 files, zip 913 KB
                                                   Test bundle: dist/request-ledger-test-2026-11-09.zip (1578 KB)
node scripts/check-inline.cjs                  -> Inline scripts OK: 2 block(s) in index.html
node scripts/build.cjs --check                 -> Release check OK: web 1.9.1, extension 1.9.4, 19 files
$env:TZ='UTC'; node scripts/generate-golden.cjs --check
                                               -> Golden baseline matches current core behaviour (8 artifacts)
node tests/parity/model.parity.mjs             -> Model parity OK: 83 checks against legacy core.js
node tests/parity/drift.parity.mjs             -> Drift guard OK: 16 constant checks index.html vs src/core
node tests/e2e/extension.e2e.cjs               -> 28/28 checks passed
node tests/e2e/bridge.e2e.cjs                  -> 28/28 checks passed
node tests/e2e/picker.e2e.cjs                  -> 26/26 checks passed
node tests/e2e/capture-tools.e2e.cjs           -> 20/20 checks passed
node tests/e2e/file-bridge.e2e.cjs             -> 26/26 checks passed
node scripts/render-readme-assets.cjs          -> 7 screenshots, 3 marketing images and og-image.png
node .opencode/workspace/tmp/release-readme/verify-readme-images.cjs
                                               -> 12/12 README images render; 18 local links resolve
```

## Distribution notes

- `dist/request-ledger-extension.zip` is the store-free archive: unzip it, then **Load unpacked** in
  `chrome://extensions`. The versioned `request-ledger-extension-1.9.5.zip` has the same bytes.
- No self-signed `.crx` is produced. Chrome only installs a `.crx` from the Web Store or with
  enterprise policy; a self-signed package cannot be distributed as a normal install and would imply
  a trust level the project does not have. The unpacked ZIP is the honest distribution path.
- The test bundle is date-stamped. `build --check` verifies the release artifacts and the extension
  ZIP, not the date-stamped test ZIP.

## Limitations

- Live media sync is capped at **8 MB per item**. Larger images/attachments travel only with a backup
  ZIP.
- A web page cannot spawn a process: restart works only while the server is alive. After a hard stop,
  run `start.cmd`; the app reconnects automatically when it returns.
- Pin state and the panel theme are per browser tab and reset for a new tab.
- The extension is a companion: with no app running it shows no UI at all, and it cannot re-enable
  itself after being disabled in `chrome://extensions`.
- Projects are app-owned; the extension cannot create, list or switch projects on its own.
- The single HTML file cannot start a local server. The bridge and picker need the extension and, on
  `file://`, Chrome's permission to run the extension on file URLs; `file://` has no server
  project-folder writes.
- Server mode requires Node.js 18 or newer on `PATH`.
- `start.cmd` / `stop.cmd` are Windows launchers. `scripts/serve.cjs` itself also runs on macOS and
  Linux.
- The launcher's server stops ~5 s after the last app tab closes; 300 s without a live page is the
  fallback when no close signal arrives. A manual `node scripts/serve.cjs 8080` stays up for
  development and e2e suites.
- `file://` was verified in Chrome 157 only; other browsers may isolate or restrict storage.
- Mobile is out of scope for the 1.9.x layout work.

## Previous release — 1.9.0 / 1.9.3

Projects, onboarding and server mode; the first-run project picker, per-project media, backup v4,
the project-aware bridge, the app-side element picker, the node-free launcher and the local server
lifecycle. Earlier 1.8.0 / 1.9.2 added the live bridge and picker, project creation and rename, and
visual polish.

## Known gaps (honest)

1. **The web app still contains its own implementation of the domain.** The extension consumes the
   generated `extension/src/core.js`; the web app does not.
2. **Live media sync is capped at 8 MB per item.** Larger images/attachments move only with a backup
   ZIP. Projects are managed only in the app; the extension cannot create, list or switch them.
3. **Design tokens are shared from one file but the panel stylesheet is still large.**
4. **`file://`** is verified in Chrome 157 only; Firefox and Safari remain unmeasured.
5. **Screenshot preview still passes through the host page** while open; documented in the extension
   README's security model.
6. **The test bundle is date-stamped**; `build --check` does not verify it.

## Rollback

`git log --oneline` and `git checkout <commit> -- _source/` for a file-level rollback. The previous
release is the baseline commit `1071c0a`.
