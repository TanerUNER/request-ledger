# Architecture and build

## Source of truth

| Concern | Edit here | Do not edit |
|---|---|---|
| Web app shell (HTML + CSS) | `src/web/index.template.html` | `index.html` (generated) |
| Web app logic | `src/web/app/*.js` (22 fragments, name order) | `index.html` (generated) |
| Extension UI logic | `src/panel/*.js` (18 fragments, name order) | `extension/panel/panel.js` (generated) |
| Extension styling | `extension/panel/panel.css` | — |
| Domain constants / model | `src/core/*.mjs` (used by tests) and `extension/src/core.js` (runtime) | — |
| In-page host, capture, picker | `extension/content/*.js` | — |
| Service worker | `extension/background/worker.js` | — |

`index.html` and `extension/panel/panel.js` are **generated artifacts**. Editing them works until the
next build, then the change is lost. If you must hotfix in an emergency, copy the change back into
the fragments in the same commit.

## Build

```powershell
node scripts/build.cjs          # regenerate index.html, panel.js and dist/
node scripts/build.cjs --check  # verify that generated files and dist are current
```

Pieces:

- `scripts/build-web.cjs` — template + fragments → `index.html` and `dist/request-ledger.html`
- `scripts/build-panel.cjs` — fragments → `extension/panel/panel.js`
- `scripts/build.cjs` — runs both, verifies invariants, writes `dist/` and the extension ZIP

The fragments are **plain script text**, not ES modules. The runtime is still one IIFE per surface,
so the split is mechanical and behaviour-preserving. This was verified by reassembling the original
files byte for byte before the split was committed.

The extension ZIP is byte-reproducible: entries use a fixed DOS timestamp, so `build --check` can
compare exact hashes across builds.

## Why fragments instead of modules

The products run from a single HTML file and an unpacked extension with no bundler. Introducing
ES modules would require a real bundler and a change to load order. Fragments give the maintainability
win (no file is a 9k-line monolith, ownership is clear) without changing runtime semantics. A future
phase can move to modules once a bundler is acceptable.

## Tests

| Test | Command | Guards |
|---|---|---|
| Markdown/backup contract | `node scripts/generate-golden.cjs --check` | Output format |
| Core parity | `node tests/parity/model.parity.mjs` | Extracted core vs legacy |
| Constant drift | `node tests/parity/drift.parity.mjs` | Web app vs `src/core` |
| Inline syntax | `node scripts/check-inline.cjs` | Broken script block |
| Release integrity | `node scripts/build.cjs --check` | Generated files + dist hashes |
| Browser e2e | `node tests/e2e/extension.e2e.cjs` | Dock, picker, capture, export, transfer |

The e2e suite needs a local server: `node scripts/serve.cjs 8080` in another terminal.

## Local server and launcher

`scripts/serve.cjs` is a zero-dependency static server bound to `127.0.0.1`.

- `--port 0` picks a free port; `--open` opens the default browser.
- `POST /__rl/heartbeat` marks a live page and resets the idle timer.
- `POST /__rl/pagehide` marks the page gone; a reload starts a new heartbeat within the grace period.
- In ephemeral mode (`--port 0`) the server never idle-stops while a live page exists and waits at least 5 minutes after the last page is gone.
- An occupied requested port is probed. If it is the same app, that instance is stopped and the same port is reused; otherwise fallback to a free port is explicit and warned.
- `--lock <file>` writes `{ pid, port, url, startedAt }` and removes it on exit.

`start.cmd` launches Node with `Start-Process -WindowStyle Hidden`, passes `--port 0 --open` and
lets the server write `.rl-server.lock`. `stop.cmd` reads that lock, calls `/__rl/shutdown` and falls
back to terminating the recorded pid.

The web app probes `/__rl/status`, starts the heartbeat when it is served by this server, and shows
the mode, extension status and capability table in the onboarding screen (`19d-onboarding.js`).

## Known structural debt

1. `extension/src/core.js` still contains i18n, storage, media, Markdown, ZIP and backup. The
   `src/core/*.mjs` modules cover constants, utilities and the request model and are proven equal,
   but the surfaces do not import them yet.
2. The web app still carries its own copy of the domain logic inside its fragments.
3. Design tokens are duplicated between `src/web/index.template.html` and
   `extension/panel/panel.css`.
4. `extension/panel/panel.css` is a single 2k-line file.
