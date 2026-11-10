#!/usr/bin/env node
"use strict";

/*
  Element picker bridge E2E (CDP).

  Proves, with the real unpacked extension:
    - the app opens install guidance when the bridge is absent;
    - the app asks for eligible tabs and shows the compact chooser;
    - choosing a second tab runs the picker there;
    - the dock/flyout is absent on the picked page during the flow;
    - the app fills Page/Location and the extension ledger mirrors them;
    - a non-allowlisted origin receives no picker data.

  Usage:
    node scripts/serve.cjs 8080        (in another terminal)
    node tests/e2e/picker.e2e.cjs

  Exit code 0 = every check passed.
*/

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const EXT = path.join(ROOT, "dist", "extension");
const WEB_URL = "http://localhost:8080/index.html?rl-local=1";
const TARGET_URL = "http://127.0.0.1:8080/tests/fixtures/picker-target.html";
/* 127.0.0.1 is a companion origin now; the negative probe uses a different
   loopback host served by a test-only HTTP server. */
const EVIL_HOST = "127.0.0.2";
const EVIL_PORT = 8092;
const EVIL_URL = "http://127.0.0.2:8092/tests/fixtures/picker-target.html";
const SHOT_DIR = path.resolve(ROOT, "..", ".opencode", "workspace", "reports", "picker-bridge");
const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const PORT = 9335;
const PROFILE = path.join(os.tmpdir(), "rl-picker-e2e-profile");

const checks = [];
function check(label, condition, detail) {
  checks.push({ label, ok: !!condition, detail });
  console.log((condition ? "ok   " : "FAIL ") + label + (condition || detail === undefined ? "" : " -> " + JSON.stringify(detail)));
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function chromePath() {
  for (const candidate of CHROME_CANDIDATES) if (fs.existsSync(candidate)) return candidate;
  throw new Error("Chrome/Edge not found");
}

function startEvilServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      try {
        const url = new URL(request.url || "/", EVIL_URL);
        const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
        const file = path.resolve(ROOT, relative);
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          response.writeHead(404, { "content-type": "text/plain" });
          response.end("not found");
          return;
        }
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(fs.readFileSync(file));
      } catch (error) {
        response.writeHead(500, { "content-type": "text/plain" });
        response.end("error");
      }
    });
    server.once("error", reject);
    server.listen(EVIL_PORT, EVIL_HOST, () => resolve(server));
  });
}

async function waitEndpoint(port, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch("http://127.0.0.1:" + port + "/json/version");
      if (response.ok) return await response.json();
    } catch (error) {
      /* not ready */
    }
    await sleep(250);
  }
  throw new Error("DevTools endpoint did not start");
}

class CDP {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.ws = new WebSocket(url);
    this.ready = new Promise((resolve) => this.ws.addEventListener("open", resolve));
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const entry = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) entry.reject(new Error(message.error.message));
        else entry.resolve(message.result);
        return;
      }
      if (message.method) this.events.push(message);
    });
  }
  async send(method, params, sessionId) {
    await this.ready;
    const id = this.nextId++;
    const payload = { id, method, params: params || {} };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }
}

async function attach(cdp, targetId) {
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Runtime.enable", {}, sessionId);
  return sessionId;
}

async function evaluate(cdp, sessionId, expression) {
  const result = await cdp.send(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true, userGesture: true },
    sessionId
  );
  if (result.exceptionDetails) {
    throw new Error("evaluate failed: " + result.exceptionDetails.text + " " + ((result.exceptionDetails.exception || {}).description || ""));
  }
  return result.result.value;
}

async function waitFor(fn, label, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < (timeoutMs || 15000)) {
    const value = await fn();
    if (value) return value;
    await sleep(250);
  }
  throw new Error("timeout: " + label);
}

async function screenshot(cdp, sessionId, name) {
  try {
    const shot = await cdp.send("Page.captureScreenshot", { format: "png" }, sessionId);
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    fs.writeFileSync(path.join(SHOT_DIR, name), Buffer.from(shot.data, "base64"));
    return true;
  } catch (error) {
    return false;
  }
}

function readLedger(cdp, sessionId) {
  return evaluate(cdp, sessionId, `(() => {
    const reg = JSON.parse(localStorage.getItem('oz-projeler-v1') || 'null');
    const raw = reg && reg.activeId
      ? localStorage.getItem('oz-istek-defteri-p-' + reg.activeId)
      : localStorage.getItem('oz-istek-defteri-v1');
    if (!raw) return { project:null, count:0, requests:[], ledgerId:null };
    const st = JSON.parse(raw);
    return { project:st.project, count:(st.requests || []).length, ledgerId:st.ledgerId, requests:st.requests || [] };
  })()`);
}

/* The web app always opens on the project gate; choose the active project
   before anything that needs a live bridge. */
async function openActiveProject(cdp, sessionId) {
  await waitFor(async () => {
    return evaluate(cdp, sessionId, `(() => {
      const picker = document.getElementById('projectPicker');
      if (!picker) return false;
      if (picker.hidden) return true;
      const reg = JSON.parse(localStorage.getItem('oz-projeler-v1') || 'null');
      const id = reg && reg.activeId;
      const row = id ? document.querySelector('#projectPickerList [data-project-id="' + id + '"]')
        : document.querySelector('#projectPickerList [data-project-id]');
      if (!row) return false;
      row.click();
      return true;
    })()`);
  }, "project gate row");
  await sleep(700);
}

async function panelTargets(cdp) {
  return waitFor(async () => {
    const current = await cdp.send("Target.getTargets");
    const dock = current.targetInfos.find((t) => t.url.includes("role=dock"));
    const flyout = current.targetInfos.find((t) => t.url.includes("role=flyout"));
    return dock && flyout ? { dock, flyout } : null;
  }, "panel iframes");
}

async function openPanel(cdp, pageSession) {
  await evaluate(cdp, pageSession, `(() => {
    const b = document.getElementById('rl-launcher');
    if (b && !b.hidden) { b.click(); return 'clicked'; }
    return 'open';
  })()`);
  await sleep(800);
  const targets = await panelTargets(cdp);
  const dockSession = await attach(cdp, targets.dock.targetId);
  const flyoutSession = await attach(cdp, targets.flyout.targetId);
  return { dockSession, flyoutSession, targets };
}

async function main() {
  /* server-disk reset: each e2e starts from an empty projects/ disk */
  try{ fs.rmSync(path.join(ROOT, 'projects'), { recursive: true, force: true }); }catch(error){ /* ignore */ }
  try{ fs.rmSync(path.join(ROOT, 'backups'), { recursive: true, force: true }); }catch(error){ /* ignore */ }
  try{ fs.rmSync(path.join(ROOT, 'deleted-projects'), { recursive: true, force: true }); }catch(error){ /* ignore */ }
  try{ fs.rmSync(path.join(ROOT, 'rl-config.json'), { force: true }); }catch(error){ /* ignore */ }
  if (!fs.existsSync(path.join(EXT, "manifest.json"))) {
    throw new Error("dist/extension missing; run node scripts/build.cjs first");
  }
  const ping = await fetch(WEB_URL).catch(() => null);
  if (!ping || !ping.ok) throw new Error("local server not running on :8080 (node scripts/serve.cjs 8080)");

  fs.rmSync(PROFILE, { recursive: true, force: true });
  const evilServer = await startEvilServer();

  const chrome = spawn(
    chromePath(),
    [
      "--user-data-dir=" + PROFILE,
      "--enable-unsafe-extension-debugging",
      "--remote-debugging-port=" + PORT,
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-search-engine-choice-screen",
      "--window-size=1280,900",
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  try {
    const version = await waitEndpoint(PORT, 20000);
    const cdp = new CDP(version.webSocketDebuggerUrl);

    /* ---------- 1. No extension: install guidance ------------------- */

    const pageTarget = await cdp.send("Target.createTarget", { url: WEB_URL });
    let pageSession = await attach(cdp, pageTarget.targetId);
    await cdp.send("Page.enable", {}, pageSession);
    await sleep(600);

    const seed = {
      version: 2, project: "Picker App", projectCreated: true, ledgerId: "ledger_picker",
      updatedAt: "2026-11-08T12:00:00.000Z", agents: [], language: "en", exportBehavior: "default",
      requests: [{
        id: "IST-001", type: "update", title: "Picker target request", page: "", location: "",
        consoleError: "", description: "Document the target card.", priority: "normal", link: "",
        sampleWebsite: "", note: "", images: [], attachments: [], confirmed: false,
        collapsed: false, createdAt: "2026-11-08T12:00:00.000Z", updatedAt: "2026-11-08T12:00:00.000Z"
      }]
    };
    await evaluate(cdp, pageSession, `localStorage.setItem('rl-local-mode','1'); localStorage.setItem('oz-istek-defteri-v1', ${JSON.stringify(JSON.stringify(seed))}); location.reload();`);
    await sleep(2200);
    pageSession = await attach(cdp, pageTarget.targetId);
    await openActiveProject(cdp, pageSession);
    await waitFor(() => evaluate(cdp, pageSession, "!!document.querySelector('[data-action=\"pick-element\"]')"), "pick button");
    check("no extension dock before install", await evaluate(cdp, pageSession, "!document.getElementById('rl-host')"));
    check("page bridge is enabled but disconnected", await evaluate(cdp, pageSession,
      "window.__rlBridge && window.__rlBridge.enabled() && !window.__rlBridge.connected()"));

    await evaluate(cdp, pageSession, "document.querySelector('[data-action=\"pick-element\"]').click()");
    const installOpen = await waitFor(() => evaluate(cdp, pageSession,
      "document.getElementById('pickerInstallModal').classList.contains('is-open')"), "install guidance");
    check("disconnected pick opens install guidance", installOpen === true);
    check("guidance has the four install steps", await evaluate(cdp, pageSession,
      "document.querySelectorAll('#pickerInstallModal .helpstep').length === 4"));
    check("guidance links to the release page", await evaluate(cdp, pageSession,
      "/releases\\/latest$/.test(document.getElementById('pickerReleaseLink').href)"));
    await screenshot(cdp, pageSession, "01-install-guidance.png");
    await evaluate(cdp, pageSession, "document.getElementById('pickerInstallModal').querySelector('[data-close-modal]').click()");

    /* ---------- 2. Load the extension and reconnect ---------------- */

    const loaded = await cdp.send("Extensions.loadUnpacked", { path: EXT });
    check("extension loads with the pinned id", loaded.id === "hapajcbgcfllhkiohhkechekajencdod", loaded);
    await cdp.send("Page.reload", {}, pageSession);
    await sleep(2500);
    pageSession = await attach(cdp, pageTarget.targetId);
    await cdp.send("Page.enable", {}, pageSession);
    await waitFor(() => evaluate(cdp, pageSession, "!!document.getElementById('rl-host')"), "dock mount");
    await openActiveProject(cdp, pageSession);
    await waitFor(() => evaluate(cdp, pageSession, "window.__rlBridge && window.__rlBridge.connected()"), "bridge connected", 20000);
    check("app reconnects after the extension is installed", true);

    const opened = await openPanel(cdp, pageSession);
    let dockSession = opened.dockSession;
    let flyoutSession = opened.flyoutSession;
    await waitFor(() => evaluate(cdp, flyoutSession,
      "window.__rlBridgePanel && window.__rlBridgePanel.connected()"), "panel bridge connected", 20000);
    check("panel reports the app connected", true);

    /* ---------- 3. A second local tab appears in the chooser -------- */

    const targetTab = await cdp.send("Target.createTarget", { url: TARGET_URL });
    const targetSession = await attach(cdp, targetTab.targetId);
    await cdp.send("Page.enable", {}, targetSession);
    await waitFor(() => evaluate(cdp, targetSession, "!!document.getElementById('rl-host')"), "target dock", 20000);
    await cdp.send("Target.activateTarget", { targetId: pageTarget.targetId });
    await sleep(700);

    await evaluate(cdp, pageSession, "document.querySelector('[data-action=\"pick-element\"]').click()");
    await waitFor(() => evaluate(cdp, pageSession,
      "document.getElementById('pickerTabsModal').classList.contains('is-open')"), "tab chooser");
    const rowCount = await waitFor(async () => {
      const count = await evaluate(cdp, pageSession, "document.querySelectorAll('#pickerTabsBody .typechoice[data-tab-id]').length");
      return count > 0 ? count : null;
    }, "tab rows");
    check("chooser excludes the app tab and lists the second tab", rowCount === 1, rowCount);
    const rowText = await evaluate(cdp, pageSession,
      "document.querySelector('#pickerTabsBody .typechoice[data-tab-id]').textContent");
    check("chooser shows title and path", /Picker target fixture/.test(rowText) && /picker-target\.html/.test(rowText), rowText);
    check("chooser has no ledger data", await evaluate(cdp, pageSession,
      "!/IST-001|Document the target card/.test(document.getElementById('pickerTabsBody').textContent)"));
    await screenshot(cdp, pageSession, "02-tab-chooser.png");

    /* ---------- 4. Pick on the second tab --------------------------- */

    await evaluate(cdp, pageSession,
      "document.querySelector('#pickerTabsBody .typechoice[data-tab-id]').click()");
    check("chooser switches to the selecting state", await waitFor(() => evaluate(cdp, pageSession,
      "/Seçim bekleniyor|Selecting/.test(document.getElementById('pickerTabsBody').textContent)"), "selecting state") === true);
    await waitFor(() => evaluate(cdp, targetSession, "!!document.querySelector('[data-rl-picker]')"), "picker overlay", 20000);
    check("picker overlay reaches the chosen tab", true);
    check("extension dock is absent on the picked page", await evaluate(cdp, targetSession,
      "!document.getElementById('rl-host')"));
    check("app tab still owns the dock", await evaluate(cdp, pageSession, "!!document.getElementById('rl-host')"));
    await screenshot(cdp, targetSession, "03-picker-overlay.png");

    const point = await evaluate(cdp, targetSession, `(() => {
      const rect = document.getElementById('pick-target').getBoundingClientRect();
      return { x:rect.left + rect.width / 2, y:rect.top + rect.height / 2 };
    })()`);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y }, targetSession);
    await sleep(120);
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 }, targetSession);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 }, targetSession);

    const filled = await waitFor(async () => {
      const value = await evaluate(cdp, pageSession, `(() => {
        const page = document.querySelector('[data-field="page"]');
        const location = document.querySelector('[data-field="location"]');
        return page && location ? { page:page.value, location:location.value } : null;
      })()`);
      return value && value.page && value.location ? value : null;
    }, "app fields filled", 20000);
    check("app Page is the normalized path", filled.page === "/tests/fixtures/picker-target.html", filled);
    check("app Location is the CSS selector", filled.location === "#pick-target", filled);
    const multi = await evaluate(cdp, pageSession, `(() => ({
      combined: window.__rlMergeLocation('#pick-target', '.card h2'),
      deduped: window.__rlMergeLocation('#pick-target | .card h2', '.card h2'),
      capped: window.__rlMergeLocation('a'.repeat(190), 'b'.repeat(40))
    }))()`);
    check("app multi-element location appends with a separator",
      multi.combined === "#pick-target | .card h2" && multi.deduped === "#pick-target | .card h2", multi);
    check("app multi-element location keeps the 200-character cap", multi.capped.length <= 200, multi.capped.length);
    check("chooser closes after the result", await evaluate(cdp, pageSession,
      "!document.getElementById('pickerTabsModal').classList.contains('is-open')"));

    const mirrored = await waitFor(async () => {
      const panel = await readLedger(cdp, flyoutSession);
      const req = panel.requests.find((item) => item.id === "IST-001");
      return req && req.page === filled.page && req.location === filled.location ? req : null;
    }, "extension mirrors the picked fields", 20000);
    check("extension ledger mirrors Page", mirrored.page === filled.page, mirrored);
    check("extension ledger mirrors Location", mirrored.location === filled.location, mirrored);

    const panelFields = await waitFor(async () => {
      await evaluate(cdp, flyoutSession, "window.RLPanel.open('list')").catch(() => {});
      await sleep(450);
      await evaluate(cdp, flyoutSession, "document.querySelector('[data-request-id=\"IST-001\"]') && document.querySelector('[data-request-id=\"IST-001\"]').click()").catch(() => {});
      await sleep(550);
      return evaluate(cdp, flyoutSession, `(() => {
        const page = document.getElementById('rl-page-input');
        const location = document.getElementById('rl-loc-input');
        return page && location ? { page:page.value, location:location.value } : null;
      })()`).catch(() => null);
    }, "panel detail fields", 20000);
    check("panel detail shows the mirrored fields", panelFields.page === filled.page && panelFields.location === filled.location, panelFields);
    const panelMerge = await evaluate(cdp, flyoutSession,
      "window.__rlPanelMergeLocation ? window.__rlPanelMergeLocation('#pick-target', '.card h2') : ''");
    check("panel multi-element location appends with a separator",
      panelMerge === "#pick-target | .card h2", panelMerge);

    await cdp.send("Page.bringToFront", {}, pageSession);
    await sleep(400);
    await screenshot(cdp, pageSession, "04-app-fields.png");
    await screenshot(cdp, pageSession, "05-panel-mirrored.png");

    /* ---------- 5. Non-allowlisted origin gets nothing -------------- */

    await sleep(1600); /* the picked tab's dock resumes after the flow */
    const evilTarget = await cdp.send("Target.createTarget", { url: EVIL_URL });
    const evilSession = await attach(cdp, evilTarget.targetId);
    await cdp.send("Page.enable", {}, evilSession);
    await waitFor(() => evaluate(cdp, evilSession, "!!document.getElementById('rl-host')"), "evil dock", 20000);
    const evilState = await evaluate(cdp, evilSession, `(() => {
      const messages = [];
      window.addEventListener('message', (event) => {
        const data = event.data;
        if (data && data.source === 'request-ledger-host') messages.push(data.type);
      });
      window.__pickerEvilMessages = messages;
      window.postMessage({
        source:'request-ledger-web', type:'RL_APP_TABS_REQUEST', v:1, ledgerId:'evil-ledger'
      }, location.origin);
      window.postMessage({
        source:'request-ledger-web', type:'RL_APP_PICK_REQUEST', v:1, ledgerId:'evil-ledger', tabId:1
      }, location.origin);
      return {
        enabled: Boolean(window.__rlBridge && window.__rlBridge.enabled()),
        dock: Boolean(document.getElementById('rl-host')),
        companion: document.getElementById('rl-host') ? document.getElementById('rl-host').getAttribute('data-companion') : null
      };
    })()`);
    await sleep(1600);
    const evilMessages = await evaluate(cdp, evilSession, "window.__pickerEvilMessages || []");
    check("non-allowlisted page bridge stays disabled", evilState.enabled === false, evilState);
    check("non-allowlisted page never enters companion mode", evilState.companion !== "1", evilState);
    check("non-allowlisted origin gets no picker reply", evilMessages.length === 0, evilMessages);

    const appLedger = await readLedger(cdp, pageSession);
    check("non-allowlisted request cannot inject a ledger", !appLedger.requests.some((req) => req.title === "EVIL SENTINEL"));
    await cdp.send("Target.closeTarget", { targetId: evilTarget.targetId });

    const errors = cdp.events.filter((event) => event.method === "Runtime.exceptionThrown");
    check("no uncaught errors in the picker flow", errors.length === 0, errors.slice(0, 3).map((event) => (event.params.exceptionDetails || {}).text));

    await cdp.send("Target.closeTarget", { targetId: targetTab.targetId });
  } finally {
    try { evilServer.close(); } catch (error) { /* ignore */ }
    try { chrome.kill(); } catch (error) { /* ignore */ }
  }

  const failed = checks.filter((entry) => !entry.ok);
  console.log("\n" + (checks.length - failed.length) + "/" + checks.length + " checks passed");
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error("PICKER E2E ERROR:", error.message);
  process.exit(1);
});
