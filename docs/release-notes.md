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
- **Projects / Requests layout.** One tab strip now sits between the Projects block and the active
  pane. The tab-like New project action and the stray list divider were removed; the active tab,
  search focus and scroll position survive bridge updates.
- **Server lifecycle.** A backgrounded live tab cannot idle-stop the server. The grace period is
  five minutes and starts only after a pagehide marker (or when no page ever heartbeated). F5 keeps
  the same port.
- **Same-app port reuse.** If the requested port belongs to the same app, that instance is stopped
  and the same port is reused instead of silently changing the origin.
- **Fallback warning.** An unrelated busy port still falls back; the page is served with
  `?rl-moved=<port>` and shows the existing new-origin warning with the restore prompt.
- **Project/ledger identity.** The bridge conflict is scoped to the same `projectId`; different
  projects never trigger a global “Two ledgers found” dialog. Reload reopens the last active
  project and its own ledger. The old “Ortak Zemin” record is renamed to the neutral translated
  “Imported project” and remains a normal, deletable project.

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
node scripts/build.cjs                         -> Built dist/: web 1.9.2, extension 1.9.5, 19 files, zip 924 KB
                                                   Test bundle: dist/request-ledger-test-2026-11-09.zip (1600 KB)
node scripts/check-inline.cjs                  -> Inline scripts OK: 2 block(s) in index.html
node scripts/build.cjs --check                 -> Release check OK: web 1.9.2, extension 1.9.5, 19 files
node tests/e2e/extension.e2e.cjs               -> 28/28 checks passed
node tests/e2e/bridge.e2e.cjs                  -> 34/34 checks passed
node tests/e2e/picker.e2e.cjs                  -> 26/26 checks passed
node tests/e2e/capture-tools.e2e.cjs           -> 20/20 checks passed
node tests/e2e/file-bridge.e2e.cjs             -> 32/32 checks passed
node tests/e2e/server-lifecycle.e2e.cjs        -> 11/11 checks passed
node tests/e2e/project-consistency.e2e.cjs     -> 33/33 checks passed
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

- The bridge is **text only**. Images and attachments are not synced live; they travel only with a
  backup ZIP.
- The single HTML file cannot start a local server. The bridge and picker need the extension and, on
  `file://`, Chrome's permission to run the extension on file URLs.
- Server mode requires Node.js 18 or newer on `PATH`.
- `start.cmd` / `stop.cmd` are Windows launchers. `scripts/serve.cjs` itself also runs on macOS and
  Linux.
- The lazy auto-stop applies when the port is `0` (launcher mode) or `--auto-stop` is passed. A
  manual `node scripts/serve.cjs 8080` stays up for development and e2e suites.
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
2. **The live bridge is text-only.** Media moves only with a backup ZIP.
3. **Design tokens are shared from one file but the panel stylesheet is still large.**
4. **`file://`** is verified in Chrome 157 only; Firefox and Safari remain unmeasured.
5. **Screenshot preview still passes through the host page** while open; documented in the extension
   README's security model.
6. **The test bundle is date-stamped**; `build --check` does not verify it.

## Rollback

`git log --oneline` and `git checkout <commit> -- _source/` for a file-level rollback. The previous
release is the baseline commit `1071c0a`.
