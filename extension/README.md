# Request Ledger — Chrome extension

A local-first request ledger that lives in a dock on the right edge of any web page. Capture the page
and element a request refers to, attach screenshots and files, confirm the request, and export
everything as Markdown/ZIP — or take a full backup. Bilingual (Turkish / English). No account, no
server, no network requests.

This folder is the unpacked **Manifest V3** extension. The single-file web app (`index.html`) is a
separate product with its own storage. The two share a backup family and, while the app is open on an
allowlisted origin, a live text bridge. The extension keeps a separate ledger per project.

## Requirements

- Chrome or Edge **114 or newer** (Manifest V3).
- No build step, no dependencies for normal use.
- The extension does **not** use the side panel; the UI is an iframe dock injected into the page.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this `extension/` folder — or unzip
   `dist/request-ledger-extension.zip` (or the versioned copy) and select the unzipped folder.
4. Pin **Request Ledger** from the toolbar puzzle menu if you want quick access.

### Pinned extension ID

`manifest.json` contains a `key`, so the unpacked extension always gets the same ID:

```text
hapajcbgcfllhkiohhkechekajencdod
```

All data lives under that extension origin. Reloading, updating files or moving the folder keeps the
ID and the data. Do not remove or change `key`: a different key means a new origin with empty
storage. Uninstalling removes access to the data — take a backup first.

## First run

1. Open any `http://`, `https://` or `file://` page. A launcher appears at the bottom-right; click it
   to open the 100 px rail.
2. Open **New request**, pick a type and priority, fill the title and description. The current page is
   offered for the Page section; the element picker records a CSS selector.
3. Add images (`Ctrl+V`, drag and drop, file picker) or a design attachment.
4. Mark the request **Ready** once the required fields are complete.
5. Use **Requests** to search, filter, reorder, duplicate and manage records/drafts. The export
   wizard opens from the Requests footer.
6. Use **Backup** to download a ZIP/JSON backup, or restore one.

## Features

- **Dock and sections** — a 100 px floating rail (no page reflow) and a 360 px flyout.
- **Movable rail** — drag it left/right; double-click the handle to snap back.
- **Combined detail** — type, title, page details and description in one view.
- **Direct capture** — element picking, screenshot and element + screenshot use the **active tab** or a
  tab chosen from the web app; the panel hides while the overlay is active and restores the section
  afterwards.
- **Console errors** — bug requests can pull the page's console error titles into the console field.
- **Compose** — type-specific fields, autosave, confirmation and lock.
- **Projects** — one registry with a separate ledger, media, records, drafts and archive per project.
- **List and archive** — search, filters, counters, reorder within a type, edit, duplicate, delete;
  Exported / Records / Drafts tabs.
- **Export wizard** — ZIP + Markdown or a single Markdown file, planning questions, runtime/transfer
  options, agents, tests, note, and export history.
- **Backup and migration** — full ZIP (with per-project media) or JSON, validation before writing,
  clear-all, and restore of a v3 or v4 backup produced by the web app. The extension writes v3 and
  reads v4.
- **Settings and agents** — language, theme, export behaviour, folder labels, agent editor, About.
- **Live bridge** — while the web app is open on `file://`, any `http://localhost:<port>` or any
  `http://127.0.0.1:<port>`, requests and the project name sync both ways. The bridge follows project
  ids, so a panel on another project never merges data across projects. Text only: images and
  attachments still travel with a backup ZIP. A closed app or any other origin means no bridge.
- **Hardening** — strict CSP for extension pages, no inline scripts, no `eval`/`new Function`, no
  remote resources, storage/quota error states, keyboard and focus handling, reduced motion.

## Transfer to the web app (and back)

The extension and the web app share a backup family (the extension writes v3 and reads v4):

1. Extension: **Backup → Download ZIP** (media included) or **JSON** (text only).
2. Web app: **Backup → Restore**, choose the file, confirm.
3. Reverse direction works the same way: v4 restores every project, v3 restores into one project.

Notes:

- Prefer ZIP when images or attachments matter.
- The web app's v4 backups contain every project; the extension also includes drafts.
- Live text sync runs only while the app tab is open on an allowlisted origin (`file://`,
  `localhost` or `127.0.0.1`). Otherwise each product owns its storage and you move data with a
  backup file.
- On `file://`, Chrome must be allowed to run the extension on file URLs. Enable that on
  `chrome://extensions` if the opener does not appear.

## Keyboard

- `Esc` — close the innermost popover, then the open section; cancel the crop overlay or picker.
- `Tab` / `Shift+Tab` — move through the panel; focus enters the panel when a section opens.
- `Ctrl+V` — paste an image while a request section is open.
- `Enter` — confirm an inline record rename.
- No global Chrome shortcut is registered.

## Data and privacy

- **Local only.** Requests, images, attachments, records, drafts, history and settings stay on this
  machine.
- **Storage layout:**
  - `localStorage["oz-projeler-v1"]` — project registry (per project: id, name, export target)
  - `localStorage["oz-istek-defteri-p-<id>"]` — one ledger per project
  - `localStorage["oz-istek-defteri-v1"]` — legacy single-ledger key, still used by the bridge
  - IndexedDB `oz-istek-defteri` v5 — `images, files, settings, history, records, drafts`
  - `chrome.storage.local` — `rl-side`, `rl-theme`, `rl-lang`, `rl-pinned`, `rl-active`,
    `rl-root-dir`, `rl-export-dir`, `rl-sync`
- **No telemetry.** No analytics, accounts or remote logging.
- **No remote code.** No outbound network requests; nothing is uploaded.
- **Downloads only.** Files are delivered through Chrome's download mechanism; the extension never
  writes in place.
- **Separate from the web app.** Different origins and separate storage; data moves through an
  explicit backup or the allowlisted live text bridge. The bridge allowlist covers any localhost
  port, so the app's free-port server mode connects too.

### Security model (honest version)

The page is untrusted. The dock and flyout are extension-origin iframes, but they communicate with
the hosting page through `postMessage`. The host validates `event.origin` and `event.source`; the
panel validates that messages come from its parent. A hostile page can still send UI commands and
observe panel-to-host messages, including the screenshot preview while it is open. Do not open
sensitive screenshots on untrusted pages. Console text imported from a page is untrusted data and is
stored only as text.

Any `http://localhost:<port>` page is bridge-allowlisted so the free-port local server can connect.
A local process could therefore talk to the bridge; run only trusted local servers while the app is
open. `127.0.0.1` stays outside the allowlist.

## Permissions

| Permission | Used for |
|---|---|
| `storage` | UI preferences and the cross-tab state beacon |
| `downloads` | Saving Markdown, ZIP and backups through Chrome |
| `tabs` | Reading the active tab's URL/title and activating it after capture |
| `scripting` | Injecting the crop overlay and element picker on demand |
| `activeTab` | Temporary access to the current tab |
| `<all_urls>` | Offering the dock on any site and capturing the visible tab |

The extension has no options page, no side panel, no keyboard commands and no
`externally_connectable` endpoints. The toolbar icon is a shortcut target only; the launcher in the
page opens the rail.

## Development

- Source: `panel/`, `content/`, `background/`, `src/core.js`.
- Build/release artifact (from the repository root `_source/`): `node scripts/build.cjs`.
- Tests: `node tests/parity/model.parity.mjs` and the golden Markdown contract in `tests/golden/`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Dock does not appear | Reload the page; check the extension is enabled; some pages (`chrome://`, the Web Store, PDFs) are excluded |
| Data looks empty | Confirm the extension ID is `hapajcbgcfllhkiohhkechekajencdod`; a changed `key` means a new origin |
| Restore rejected | The file must be a Request Ledger backup (v3 or v4); re-zipped archives may be rejected |
| Storage errors | Free space or clear old media; take a ZIP backup first |

## License

MIT. See [`../LICENSE`](../LICENSE).
