#!/usr/bin/env node
"use strict";

/*
  Project-aware live bridge E2E (CDP).

  Proves, with the real unpacked extension:
    - the app sends bridge traffic only after a project is opened;
    - RL_APP_HELLO/SNAPSHOT carry projectId + projectName;
    - the panel selects the same local project (or creates it from the app);
    - text edits sync inside one project;
    - a panel on another project shows a mismatch and syncs nothing;
    - switching projects on either side re-handshakes and re-syncs;
    - no echo loop;
    - a non-allowlisted origin receives nothing;
    - a same-project ledger conflict still asks before replacing data.

  Usage:
    node scripts/serve.cjs 8080        (in another terminal)
    node tests/e2e/bridge.e2e.cjs

  Exit code 0 = every check passed.
*/

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const EXT = path.join(ROOT, "dist", "extension");
const WEB_URL = "http://localhost:8080/index.html";
/* 127.0.0.1 is now a companion origin, so the negative case uses a different
   loopback host. The product server binds only 127.0.0.1; this test-only server
   serves the same files on 127.0.0.2. */
const EVIL_HOST = "127.0.0.2";
const EVIL_PORT = 8091;
const EVIL_URL = "http://127.0.0.2:8091/index.html";
const SHOT_DIR = path.resolve(ROOT, "..", ".opencode", "workspace", "reports", "live-bridge");
const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const PORT = 9334;
const PROFILE = path.join(os.tmpdir(), "rl-bridge-e2e-profile");

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
        const relative = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname).replace(/^\/+/, "");
        const file = path.resolve(ROOT, relative);
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          response.writeHead(404, { "content-type": "text/plain" });
          response.end("not found");
          return;
        }
        const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
        response.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
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
    await sleep(300);
  }
  throw new Error("timeout: " + label);
}

function readRegistry(cdp, sessionId) {
  return evaluate(cdp, sessionId, `(() => {
    const reg = JSON.parse(localStorage.getItem('oz-projeler-v1') || 'null');
    return reg ? { activeId: reg.activeId || null, projects: reg.projects || [] } : null;
  })()`);
}

function readProject(cdp, sessionId, projectId) {
  return evaluate(cdp, sessionId, `(() => {
    const raw = localStorage.getItem('oz-istek-defteri-p-' + ${JSON.stringify(projectId)});
    if (!raw) return { project:null, count:0, requests:[], ledgerId:null };
    const st = JSON.parse(raw);
    return { project:st.project, count:(st.requests || []).length, ledgerId:st.ledgerId, requests:st.requests || [] };
  })()`);
}

function readActive(cdp, sessionId) {
  return evaluate(cdp, sessionId, `(() => {
    const reg = JSON.parse(localStorage.getItem('oz-projeler-v1') || 'null');
    if (!reg || !reg.activeId) return { project:null, count:0, requests:[], ledgerId:null, activeId:null, projects:[] };
    const raw = localStorage.getItem('oz-istek-defteri-p-' + reg.activeId);
    const st = raw ? JSON.parse(raw) : null;
    return {
      activeId: reg.activeId,
      projects: reg.projects || [],
      project: st ? st.project : null,
      count: st ? (st.requests || []).length : 0,
      ledgerId: st ? st.ledgerId : null,
      requests: st ? (st.requests || []) : []
    };
  })()`);
}

async function panelTargets(cdp) {
  return waitFor(async () => {
    const current = await cdp.send("Target.getTargets");
    const dock = current.targetInfos.find((t) => t.url.includes("role=dock"));
    const flyout = current.targetInfos.find((t) => t.url.includes("role=flyout"));
    return dock && flyout ? { dock, flyout } : null;
  }, "panel iframes");
}

async function ensurePanel(cdp, pageSession) {
  await evaluate(cdp, pageSession, `(() => {
    const b = document.getElementById('rl-launcher');
    if (b && !b.hidden) { b.click(); return 'clicked'; }
    return 'open';
  })()`);
  await sleep(700);
  const targets = await panelTargets(cdp);
  const dockSession = await attach(cdp, targets.dock.targetId);
  const flyoutSession = await attach(cdp, targets.flyout.targetId);
  return { dockSession, flyoutSession, targets };
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

async function openAppProject(cdp, pageSession, projectId) {
  await evaluate(cdp, pageSession, `(() => {
    const picker = document.getElementById('projectPicker');
    if (picker && picker.hidden) {
      const sw = document.getElementById('projectsSwitchBtn');
      if (sw) sw.click();
    }
  })()`);
  await sleep(350);
  const clicked = await waitFor(async () => {
    return evaluate(cdp, pageSession, `(() => {
      const btn = document.querySelector('#projectPickerList [data-project-id=' + ${JSON.stringify(JSON.stringify(projectId))} + ']');
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
  }, "app project row");
  if (!clicked) throw new Error("app project row missing");
  await sleep(700);
}

async function createAppProject(cdp, pageSession, name) {
  await evaluate(cdp, pageSession, `(() => {
    const sw = document.getElementById('projectsSwitchBtn');
    if (sw) sw.click();
  })()`);
  await sleep(350);
  await waitFor(() => evaluate(cdp, pageSession, "!document.getElementById('projectPicker').hidden"), "app picker");
  await evaluate(cdp, pageSession, "document.getElementById('projectPickerNewBtn').click()");
  await waitFor(() => evaluate(cdp, pageSession, "!document.getElementById('projectGate').hidden"), "app create form");
  await evaluate(cdp, pageSession, `(() => {
    const input = document.getElementById('projectCreateInput');
    input.value = ${JSON.stringify(name)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('projectCreateBtn').click();
  })()`);
  await sleep(900);
}

async function createPanelRequest(cdp, dockSession, flyoutSession, title, description) {
  await evaluate(cdp, dockSession, `document.querySelector('[data-section="new"]').click()`);
  await waitFor(() => evaluate(cdp, flyoutSession, "!!document.getElementById('rl-new-title')"), "panel new request form");
  await evaluate(cdp, flyoutSession, `(() => {
    const title = document.getElementById('rl-new-title');
    title.value = ${JSON.stringify(title)};
    title.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-act="create"]').click();
  })()`);
  await sleep(700);
  await evaluate(cdp, flyoutSession, `document.querySelector('[data-act="save-section"]').click()`);
  await waitFor(() => evaluate(cdp, flyoutSession, "!!document.getElementById('rl-desc-input')"), "panel description step");
  await evaluate(cdp, flyoutSession, `(() => {
    const desc = document.getElementById('rl-desc-input');
    desc.value = ${JSON.stringify(description)};
    desc.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-act="save-section"]').click();
  })()`);
  await waitFor(() => evaluate(cdp, flyoutSession, "!!document.getElementById('rl-title-input')"), "panel combined detail");
}

async function switchPanelProject(cdp, flyoutSession, projectId) {
  await evaluate(cdp, flyoutSession, "window.RLPanel.open('project')");
  await sleep(500);
  await evaluate(cdp, flyoutSession, `(() => {
    const btn = document.querySelector('[data-project-act="pick"][data-project-id=' + ${JSON.stringify(JSON.stringify(projectId))} + ']');
    if (!btn) throw new Error('panel project row missing');
    btn.click();
    return true;
  })()`);
  await sleep(900);
}

async function main() {
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
    const loaded = await cdp.send("Extensions.loadUnpacked", { path: EXT });
    check("extension loads with the pinned id", loaded.id === "hapajcbgcfllhkiohhkechekajencdod", loaded);

    const pageTarget = await cdp.send("Target.createTarget", { url: WEB_URL });
    let pageSession = await attach(cdp, pageTarget.targetId);
    await cdp.send("Page.enable", {}, pageSession);
    await sleep(600);
    await cdp.send("Page.reload", {}, pageSession);
    await sleep(2500);

    await waitFor(() => evaluate(cdp, pageSession, "!!document.getElementById('rl-host')"), "dock mount");

    /* ---------- project gate: no bridge traffic before a project ---------- */

    const gate = await evaluate(cdp, pageSession, `(() => ({
      picker: !!(document.getElementById('projectPicker') && !document.getElementById('projectPicker').hidden),
      bridge: !!window.__rlBridge
    }))()`);
    check("app starts on the project gate without a bridge", gate.picker === true && gate.bridge === false, gate);

    const opened = await ensurePanel(cdp, pageSession);
    let dockSession = opened.dockSession;
    let flyoutSession = opened.flyoutSession;
    await evaluate(cdp, dockSession, "window.RLPanel.togglePin && window.RLPanel.pinned() !== true ? window.RLPanel.togglePin() : true");

    /* ---------- open a project in the app; the panel adopts it ---------- */

    const appProjectName = "Bridge App";
    await evaluate(cdp, pageSession, `(() => {
      const input = document.getElementById('projectCreateInput');
      input.value = ${JSON.stringify(appProjectName)};
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('projectCreateBtn').click();
    })()`);
    await waitFor(() => evaluate(cdp, pageSession, "window.__rlBridge && window.__rlBridge.connected()"),
      "page bridge connected after project open", 20000);
    check("opening a project starts and connects the page bridge", await evaluate(cdp, pageSession,
      "!!(window.__rlBridge && window.__rlBridge.enabled() && window.__rlBridge.connected())"));
    check("companion mode is on for the allowlisted origin", await evaluate(cdp, pageSession,
      "document.getElementById('rl-host').getAttribute('data-companion') === '1'"));

    const appProjectId = await evaluate(cdp, pageSession, "window.__rlBridge.projectId()");
    const sameId = await waitFor(async () => {
      const id = await evaluate(cdp, flyoutSession, "window.__rlBridgePanel && window.__rlBridgePanel.projectId()");
      return id === appProjectId ? id : null;
    }, "extension selects the app project", 12000);
    check("panel selects the app project id", sameId === appProjectId, { app: appProjectId, panel: sameId });
    const panelName = await evaluate(cdp, flyoutSession, "window.__rlBridgePanel.projectName()");
    check("panel creates the project from the app payload", panelName === appProjectName, panelName);
    check("panel reports the app connected", await evaluate(cdp, flyoutSession,
      "window.__rlBridgePanel && window.__rlBridgePanel.connected()") === true);

    await evaluate(cdp, dockSession, `document.querySelector('[data-section="settings"]').click()`);
    await sleep(700);
    const connectedStatus = await evaluate(cdp, flyoutSession, "(document.getElementById('rl-bridge-text') || {}).textContent || ''");
    check("panel settings shows the connected status", /Connected to app|Uygulamaya bağlı/.test(connectedStatus), connectedStatus);

    /* ---------- same-project sync: app -> extension ---------- */

    await evaluate(cdp, pageSession, `(() => {
      document.getElementById('settingsBtn').click();
      const input = document.getElementById('settingsProjectName');
      input.value = 'Bridge App Renamed';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('saveSettingsBtn').click();
    })()`);
    const renamed = await waitFor(async () => {
      const name = await evaluate(cdp, flyoutSession, "window.__rlBridgePanel.projectName()");
      return name === "Bridge App Renamed" ? name : null;
    }, "extension receives the rename", 12000);
    check("app rename reaches the extension", renamed === "Bridge App Renamed", renamed);
    await evaluate(cdp, pageSession, "window.closeModal ? window.closeModal(document.getElementById('settingsModal')) : document.querySelector('#settingsModal [data-close-modal]').click()").catch(() => {});

    /* ---------- same-project sync: extension -> app ---------- */

    await evaluate(cdp, dockSession, `document.querySelector('[data-section="new"]').click()`);
    await waitFor(() => evaluate(cdp, flyoutSession, "!!document.getElementById('rl-new-title')"), "new request form");
    await evaluate(cdp, flyoutSession, `(() => {
      const title = document.getElementById('rl-new-title');
      title.value = 'Bridge request A';
      title.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('[data-act="create"]').click();
    })()`);
    await sleep(700);
    await evaluate(cdp, flyoutSession, `document.querySelector('[data-act="save-section"]').click()`);
    await waitFor(() => evaluate(cdp, flyoutSession, "!!document.getElementById('rl-desc-input')"), "description step");
    await evaluate(cdp, flyoutSession, `(() => {
      const desc = document.getElementById('rl-desc-input');
      desc.value = 'Edited in the extension and mirrored to the app.';
      desc.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('[data-act="save-section"]').click();
    })()`);
    await waitFor(() => evaluate(cdp, flyoutSession, "!!document.getElementById('rl-title-input')"), "combined detail");
    await evaluate(cdp, flyoutSession, `(() => {
      const title = document.getElementById('rl-title-input');
      title.value = 'Bridge request A edited';
      title.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await sleep(500);
    await evaluate(cdp, flyoutSession, `document.querySelector('[data-act="ready"]').click()`);
    await sleep(1400);

    const appGotRequest = await waitFor(async () => {
      const app = await readActive(cdp, pageSession);
      return app.requests.some((req) => req.title === "Bridge request A edited") ? app : null;
    }, "app receives the extension edit", 15000);
    check("extension request edit reaches the app", appGotRequest.requests.some((req) => req.title === "Bridge request A edited"));
    check("extension request description reaches the app", appGotRequest.requests.some((req) => /Edited in the extension/.test(req.description || "")));
    const appRows = await evaluate(cdp, pageSession, "document.querySelectorAll('.req').length");
    check("app renders the mirrored row", appRows === 1, appRows);

    /* ---------- reload both surfaces, reopen the project ---------- */

    await cdp.send("Page.reload", {}, pageSession);
    await sleep(2500);
    pageSession = await attach(cdp, pageTarget.targetId);
    await waitFor(() => evaluate(cdp, pageSession, "!!document.getElementById('rl-host')"), "dock remount");
    await openAppProject(cdp, pageSession, appProjectId);
    await waitFor(() => evaluate(cdp, pageSession, "window.__rlBridge && window.__rlBridge.connected()"), "bridge reconnect", 20000);
    const reopened = await ensurePanel(cdp, pageSession);
    dockSession = reopened.dockSession;
    flyoutSession = await attach(cdp, (await panelTargets(cdp)).flyout.targetId);
    await waitFor(() => evaluate(cdp, flyoutSession, "window.__rlBridgePanel && window.__rlBridgePanel.connected()"), "panel reconnect", 20000);

    const appAfter = await readActive(cdp, pageSession);
    const panelAfter = await readActive(cdp, flyoutSession);
    check("app keeps the mirrored data after reload", appAfter.project === "Bridge App Renamed" && appAfter.requests.some((req) => req.title === "Bridge request A edited"), { project: appAfter.project, count: appAfter.count });
    check("extension keeps the mirrored data after reload", panelAfter.project === "Bridge App Renamed" && panelAfter.requests.some((req) => req.title === "Bridge request A edited"), { project: panelAfter.project, count: panelAfter.count });
    check("both surfaces share one project and ledger id", appAfter.activeId === panelAfter.activeId && appAfter.activeId === appProjectId && appAfter.ledgerId === panelAfter.ledgerId, { appProject: appAfter.activeId, panelProject: panelAfter.activeId, appLedger: appAfter.ledgerId, panelLedger: panelAfter.ledgerId });

    /* ---------- no echo loop ---------- */

    const before = await evaluate(cdp, pageSession, "window.__rlBridge.stats()");
    const panelBefore = await evaluate(cdp, flyoutSession, "window.__rlBridgePanel.stats()");
    await sleep(2600);
    const after = await evaluate(cdp, pageSession, "window.__rlBridge.stats()");
    const panelAfterStats = await evaluate(cdp, flyoutSession, "window.__rlBridgePanel.stats()");
    check("no patch echo loop", after.patches === before.patches && after.applied === before.applied, { pageBefore: before, pageAfter: after });
    check("no panel apply loop", panelAfterStats.applied === panelBefore.applied, { panelBefore, panelAfterStats });
    check("single request is not duplicated by the bridge", (await readActive(cdp, pageSession)).count === 1);

    /* ---------- project switch on the app side ---------- */

    await createAppProject(cdp, pageSession, "Bridge Project B");
    const appProjectB = await waitFor(async () => {
      const id = await evaluate(cdp, pageSession, "window.__rlBridge.projectId()");
      return id && id !== appProjectId ? id : null;
    }, "app project B", 12000);
    const panelProjectB = await waitFor(async () => {
      const id = await evaluate(cdp, flyoutSession, "window.__rlBridgePanel && window.__rlBridgePanel.projectId()");
      return id === appProjectB ? id : null;
    }, "panel follows app project B", 15000);
    check("app project switch re-handshakes the panel", panelProjectB === appProjectB, { app: appProjectB, panel: panelProjectB });

    await createPanelRequest(cdp, dockSession, flyoutSession, "Bridge request B", "Only project B should contain this.");
    const appB = await waitFor(async () => {
      const state = await readProject(cdp, pageSession, appProjectB);
      return state.requests.some((req) => req.title === "Bridge request B") ? state : null;
    }, "app project B receives the extension edit", 15000);
    check("extension request creates B data only in project B", appB.requests.some((req) => req.title === "Bridge request B"));

    /* ---------- different-project isolation ---------- */

    await sleep(1200); /* let the last panel save settle */
    await switchPanelProject(cdp, flyoutSession, appProjectId);
    const panelOnA = await waitFor(async () => {
      const id = await evaluate(cdp, flyoutSession, "window.__rlBridgePanel && window.__rlBridgePanel.projectId()");
      return id === appProjectId ? id : null;
    }, "panel switches to project A", 12000);
    const mismatch = await waitFor(async () => {
      const pageSide = await evaluate(cdp, pageSession, "window.__rlBridge && window.__rlBridge.mismatch()");
      const panelSide = await evaluate(cdp, flyoutSession, "window.__rlBridgePanel && window.__rlBridgePanel.mismatch()");
      return pageSide === true && panelSide === true ? { pageSide, panelSide } : null;
    }, "both sides report the project mismatch", 12000);
    const appChip = await evaluate(cdp, pageSession, `(() => {
      const chip = document.getElementById('bridgeChip');
      const text = document.getElementById('bridgeChipText');
      return { hidden: chip ? chip.hidden : null, off: chip ? chip.classList.contains('is-off') : false, text: text ? text.textContent : '' };
    })()`);
    check("a different active project shows a clear status", mismatch && appChip.hidden === false && appChip.off === true && /another project|farklı projede/i.test(appChip.text), { mismatch, appChip });

    const isolatedAppB = await readProject(cdp, pageSession, appProjectB);
    const isolatedPanelA = await readProject(cdp, flyoutSession, appProjectId);
    check("different projects sync nothing to each other",
      isolatedAppB.requests.some((req) => req.title === "Bridge request B") &&
      !isolatedAppB.requests.some((req) => req.title === "Bridge request A edited") &&
      isolatedPanelA.requests.some((req) => req.title === "Bridge request A edited") &&
      !isolatedPanelA.requests.some((req) => req.title === "Bridge request B"),
      { appB: isolatedAppB.requests.map((req) => req.title), panelA: isolatedPanelA.requests.map((req) => req.title) });

    /* ---------- switching back re-aligns and re-syncs ---------- */

    await openAppProject(cdp, pageSession, appProjectId);
    await waitFor(() => evaluate(cdp, pageSession, "window.__rlBridge && window.__rlBridge.projectId() === " + JSON.stringify(appProjectId)), "app back on project A", 12000);
    const realigned = await waitFor(async () => {
      const pageMismatch = await evaluate(cdp, pageSession, "window.__rlBridge && window.__rlBridge.mismatch()");
      const panelId = await evaluate(cdp, flyoutSession, "window.__rlBridgePanel && window.__rlBridgePanel.projectId()");
      const panelMismatch = await evaluate(cdp, flyoutSession, "window.__rlBridgePanel && window.__rlBridgePanel.mismatch()");
      return panelId === appProjectId && pageMismatch === false && panelMismatch === false ? true : null;
    }, "bridge re-aligns on project A", 15000);
    check("switching back re-aligns and re-syncs", realigned === true);

    /* ---------- non-allowlisted origin ---------- */

    const beforeEvilTargets = await cdp.send("Target.getTargets");
    const knownTargets = new Set(beforeEvilTargets.targetInfos.map((target) => target.targetId));

    const evilTarget = await cdp.send("Target.createTarget", { url: EVIL_URL });
    const evilSession = await attach(cdp, evilTarget.targetId);
    await cdp.send("Page.enable", {}, evilSession);
    await sleep(2200);
    await waitFor(() => evaluate(cdp, evilSession, "!!document.getElementById('rl-host')"), "dock mounts on the non-allowlisted origin");
    const evilState = await evaluate(cdp, evilSession, `(() => ({
      companion: document.getElementById('rl-host').getAttribute('data-companion') !== '1',
      bridge: !window.__rlBridge || !window.__rlBridge.enabled(),
      chip: document.getElementById('bridgeChip') ? document.getElementById('bridgeChip').hidden === true : true
    }))()`);
    check("non-allowlisted origin is outside companion mode and the bridge", evilState.companion === true && evilState.bridge === true && evilState.chip === true, evilState);

    await evaluate(cdp, evilSession, `(() => {
      window.postMessage({
        source:'request-ledger-web', type:'RL_APP_HELLO', v:1,
        ledgerId:'evil-ledger', projectId:'prj_evil', projectName:'EVIL',
        updatedAt:new Date().toISOString(),
        project:'EVIL', requests:[{ id:'IST-999', type:'bug', title:'EVIL SENTINEL', description:'x', priority:'normal', confirmed:true, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() }],
        agents:[], language:'en', exportBehavior:'default', deletedIds:[]
      }, location.origin);
    })()`);
    await sleep(1500);

    const evilFlyout = await waitFor(async () => {
      const current = await cdp.send("Target.getTargets");
      const target = current.targetInfos.find((t) => t.url.includes("role=flyout") && !knownTargets.has(t.targetId));
      if (!target) return null;
      return target;
    }, "evil flyout");
    const evilFlyoutSession = await attach(cdp, evilFlyout.targetId);
    const evilPanelState = await readActive(cdp, evilFlyoutSession);
    const evilPageState = await readActive(cdp, evilSession);
    check("non-allowlisted payload never reaches the extension or the page",
      !evilPanelState.requests.some((req) => req.title === "EVIL SENTINEL") &&
      evilPanelState.activeId !== "prj_evil" &&
      !evilPageState.requests.some((req) => req.title === "EVIL SENTINEL") &&
      evilPageState.activeId !== "prj_evil",
      { panel: evilPanelState.activeId, page: evilPageState.activeId });

    await cdp.send("Target.closeTarget", { targetId: evilTarget.targetId });

    /* ---------- same-project ledger conflict still asks ---------- */

    const conflictId = "prj_conflict_e2e";
    const stamp = "2026-11-08T10:00:00.000Z";
    const conflictRegistry = {
      version: 1,
      activeId: conflictId,
      projects: [{ id: conflictId, name: "Conflict Project", createdAt: stamp, updatedAt: stamp, exportTarget: "", archiveCollapsed: false }]
    };
    const appConflictLedger = {
      version: 2, project: "Conflict Project", projectCreated: true, ledgerId: "ledger_app_conflict",
      updatedAt: stamp, agents: [], language: "en", exportBehavior: "default",
      requests: [{ id: "IST-001", type: "update", title: "App One", page: "", location: "", consoleError: "", description: "App side request", priority: "normal", link: "", sampleWebsite: "", note: "", images: [], attachments: [], confirmed: true, collapsed: true, createdAt: stamp, updatedAt: stamp }]
    };
    const extConflictLedger = {
      version: 2, project: "Conflict Project", projectCreated: true, ledgerId: "ledger_ext_conflict",
      updatedAt: stamp, agents: [], language: "en", exportBehavior: "default",
      requests: [{ id: "IST-002", type: "bug", title: "Ext One", page: "", location: "", consoleError: "", description: "Extension side request", priority: "normal", link: "", sampleWebsite: "", note: "", images: [], attachments: [], confirmed: true, collapsed: true, createdAt: stamp, updatedAt: stamp }]
    };
    const seedRegistry = JSON.stringify(JSON.stringify(conflictRegistry));
    await evaluate(cdp, flyoutSession, `(() => {
      localStorage.setItem('oz-projeler-v1', ${seedRegistry});
      localStorage.setItem('oz-istek-defteri-p-${conflictId}', ${JSON.stringify(JSON.stringify(extConflictLedger))});
    })()`);
    await evaluate(cdp, pageSession, `(() => {
      localStorage.setItem('oz-projeler-v1', ${seedRegistry});
      localStorage.setItem('oz-istek-defteri-p-${conflictId}', ${JSON.stringify(JSON.stringify(appConflictLedger))});
      location.reload();
    })()`);
    await sleep(2600);
    pageSession = await attach(cdp, pageTarget.targetId);
    await waitFor(() => evaluate(cdp, pageSession, "!!document.getElementById('rl-host')"), "dock after conflict reload");
    await openAppProject(cdp, pageSession, conflictId);
    await waitFor(() => evaluate(cdp, pageSession, "!!document.querySelector('#confirmModal.is-open')"), "first-connect choice", 20000);
    const conflictTitle = await evaluate(cdp, pageSession, "document.getElementById('confirmTitle').textContent");
    const conflictPanel = await ensurePanel(cdp, pageSession);
    dockSession = conflictPanel.dockSession;
    flyoutSession = conflictPanel.flyoutSession;
    const panelConflict = await waitFor(() => evaluate(cdp, flyoutSession, "window.__rlBridgePanel && window.__rlBridgePanel.conflict()"), "panel conflict flag", 15000);
    const beforeChoiceApp = await readProject(cdp, pageSession, conflictId);
    const beforeChoicePanel = await readProject(cdp, flyoutSession, conflictId);
    check("same-project ledger conflict asks before replacing anything",
      /Two ledgers found|İki defter bulundu/.test(conflictTitle) &&
      panelConflict === true &&
      beforeChoiceApp.ledgerId === "ledger_app_conflict" &&
      beforeChoicePanel.ledgerId === "ledger_ext_conflict",
      { conflictTitle, panelConflict, appLedger: beforeChoiceApp.ledgerId, panelLedger: beforeChoicePanel.ledgerId });

    await evaluate(cdp, pageSession, "document.getElementById('confirmOkBtn').click()");
    const appWins = await waitFor(async () => {
      const panel = await readProject(cdp, flyoutSession, conflictId);
      return panel.ledgerId === "ledger_app_conflict" && panel.requests.some((req) => req.title === "App One") ? panel : null;
    }, "app ledger accepted", 15000);
    const afterChoicePage = await readProject(cdp, pageSession, conflictId);
    check("the default choice keeps the app ledger and app data",
      appWins.ledgerId === "ledger_app_conflict" &&
      appWins.requests.some((req) => req.title === "App One") &&
      afterChoicePage.requests.some((req) => req.title === "App One"),
      { ledgerId: appWins.ledgerId, project: appWins.project });

    const errors = cdp.events.filter((event) => event.method === "Runtime.exceptionThrown");
    check("no uncaught errors in the bridge flow", errors.length === 0, errors.slice(0, 3).map((event) => (event.params.exceptionDetails || {}).text));

    await screenshot(cdp, pageSession, "01-page-connected.png");
  } finally {
    try { evilServer.close(); } catch (error) { /* ignore */ }
    try { chrome.kill(); } catch (error) { /* ignore */ }
  }

  const failed = checks.filter((entry) => !entry.ok);
  console.log("\n" + (checks.length - failed.length) + "/" + checks.length + " checks passed");
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error("BRIDGE E2E ERROR:", error.message);
  process.exit(1);
});
