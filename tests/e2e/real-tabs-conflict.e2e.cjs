#!/usr/bin/env node
"use strict";

/*
  Real two-tab bridge E2E.

  Tab A is the served app. Tab B is a plain template page with the extension
  panel (not the app). The flow is the owner's:

    1. create a project through the app UI;
    2. add the first request and type into it;
    3. create a request from Tab B's panel under the same project;
    4. reload, stop and restart the server.

  No synthetic ledger seeding: project creation, request creation and typing all
  happen through the real UI.
*/

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const EXT = path.join(ROOT, "dist", "extension");
const TMP = path.resolve(ROOT, "..", ".opencode", "workspace", "tmp", "bridge-fixes");
const SHOT_DIR = path.resolve(ROOT, "..", ".opencode", "workspace", "reports", "bridge-fixes");
const EXT_ID = "hapajcbgcfllhkiohhkechekajencdod";
const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const PORT = 9342;
const PROFILE = path.join(os.tmpdir(), "rl-real-tabs-conflict-e2e-profile");
const PROJECT_NAME = "Real Tabs Project";
const TARGET_PATH = "tests/fixtures/picker-target.html";

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

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

function startServer(port, lockName) {
  return spawn(process.execPath, [
    path.join(ROOT, "scripts", "serve.cjs"),
    "--port", String(port),
    "--fallback-port-0",
    "--auto-stop=300",
    "--lock", path.join(TMP, lockName),
  ], { cwd: ROOT, stdio: "ignore", windowsHide: true });
}

function stopChild(child) {
  if (!child || child.killed) return;
  try { child.kill(); } catch (error) { /* ignore */ }
}

async function waitServer(port, expectedPid) {
  const started = Date.now();
  while (Date.now() - started < 15000) {
    try {
      const response = await fetch("http://127.0.0.1:" + port + "/__rl/status");
      if (response.ok) {
        const data = await response.json();
        if (!expectedPid || Number(data.pid) !== Number(expectedPid)) return data;
      }
    } catch (error) { /* not ready */ }
    await sleep(150);
  }
  throw new Error("server did not start on " + port);
}

async function primeServer(port) {
  const started = Date.now();
  while (Date.now() - started < 10000) {
    try {
      const response = await fetch("http://127.0.0.1:" + port + "/__rl/heartbeat", { method: "POST" });
      if (response.ok) return true;
    } catch (error) { /* not listening */ }
    await sleep(100);
  }
  return false;
}

async function waitEndpoint(port, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch("http://127.0.0.1:" + port + "/json/version");
      if (response.ok) return await response.json();
    } catch (error) { /* not ready */ }
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
      if (message.method === "Page.javascriptDialogOpening" && message.sessionId) {
        this.send("Page.handleJavaScriptDialog", { accept: true }, message.sessionId).catch(() => {});
      }
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
  try { await cdp.send("Page.enable", {}, sessionId); } catch (error) { /* ignore */ }
  return sessionId;
}

async function evaluate(cdp, sessionId, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression, returnByValue: true, awaitPromise: true, userGesture: true
  }, sessionId);
  if (result.exceptionDetails) throw new Error("evaluate failed: " + result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(fn, label, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < (timeoutMs || 15000)) {
    const value = await fn();
    if (value) return value;
    await sleep(200);
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

async function dismissOnboarding(cdp, pageSession) {
  await evaluate(cdp, pageSession, `(() => {
    const modal = document.getElementById('onboardingModal');
    const done = document.getElementById('onboardingDoneBtn');
    if (modal && modal.classList.contains('is-open') && done) done.click();
    return true;
  })()`);
  await sleep(300);
}

async function openPanel(cdp, pageSession) {
  await waitFor(() => evaluate(cdp, pageSession,
    "!!document.getElementById('rl-launcher')"), "panel launcher", 25000);
  const expectedToken = await waitFor(() => evaluate(cdp, pageSession,
    "document.documentElement.getAttribute('data-rl-page-token')"), "page token", 10000);
  await evaluate(cdp, pageSession, `(() => {
    const button = document.getElementById('rl-launcher');
    if (button) button.click();
    return true;
  })()`);
  const sessions = new Map();
  try{
    const targets = await waitFor(async () => {
      const current = await cdp.send("Target.getTargets");
      const docks = current.targetInfos.filter((target) => target.url.includes("role=dock"));
      const flyouts = current.targetInfos.filter((target) => target.url.includes("role=flyout"));
      let dock = null;
      let flyout = null;
      for (const target of docks) {
        if (!sessions.has(target.targetId)) sessions.set(target.targetId, await attach(cdp, target.targetId));
        const token = await evaluate(cdp, sessions.get(target.targetId),
          "window.__rlBridgePanel ? window.__rlBridgePanel.pageToken() : ''");
        if (token === expectedToken) dock = target;
      }
      for (const target of flyouts) {
        if (!sessions.has(target.targetId)) sessions.set(target.targetId, await attach(cdp, target.targetId));
        const token = await evaluate(cdp, sessions.get(target.targetId),
          "window.__rlBridgePanel ? window.__rlBridgePanel.pageToken() : ''");
        if (token === expectedToken) flyout = target;
      }
      return dock && flyout ? { dock, flyout } : null;
    }, "panel targets for page token", 25000);
    return {
      dockSession: sessions.get(targets.dock.targetId),
      flyoutSession: sessions.get(targets.flyout.targetId),
    };
  }catch(error){
    const current = await cdp.send("Target.getTargets");
    console.log("PANEL TARGET DEBUG", JSON.stringify({
      expectedToken,
      targets: current.targetInfos.filter((target) => target.url.includes("role=")).map((target) => ({
        id: target.targetId, url: target.url
      })),
      tokens: Array.from(sessions.entries()).map(([id, session]) => ({ id }))
    }));
    throw error;
  }
}

async function readApp(cdp, pageSession, projectId) {
  return evaluate(cdp, pageSession, `(() => {
    const reg = JSON.parse(localStorage.getItem('oz-projeler-v1') || 'null');
    const record = reg && reg.projects ? reg.projects.find((item) => item.id === ${JSON.stringify(projectId)}) : null;
    const raw = localStorage.getItem('oz-istek-defteri-p-' + ${JSON.stringify(projectId)});
    return {
      registry: reg,
      record: record || null,
      activeId: reg && reg.activeId,
      ledger: raw ? JSON.parse(raw) : null,
      modal: !!document.getElementById('confirmModal') && document.getElementById('confirmModal').classList.contains('is-open'),
      flyoutDisplay: (document.getElementById('rl-flyout') || {}).style.display || '',
      bridge: window.__rlBridge ? {
        enabled: window.__rlBridge.enabled(),
        connected: window.__rlBridge.connected(),
        projectId: window.__rlBridge.projectId(),
        ledgerId: window.__rlBridge.ledgerId(),
        conflict: window.__rlBridge.conflict(),
        conflictInfo: window.__rlBridge.conflictInfo(),
        rejects: window.__rlBridge.rejects()
      } : null
    };
  })()`);
}

async function readPanel(cdp, flyoutSession) {
  return evaluate(cdp, flyoutSession, `(() => ({
    projectId: window.__rlBridgePanel ? window.__rlBridgePanel.projectId() : '',
    ledgerId: window.__rlBridgePanel ? window.__rlBridgePanel.ledgerId() : '',
    connected: window.__rlBridgePanel ? window.__rlBridgePanel.connected() : false,
    serverStopped: window.__rlBridgePanel ? window.__rlBridgePanel.serverStopped() : false,
    conflict: window.__rlBridgePanel ? window.__rlBridgePanel.conflict() : false,
    conflictInfo: window.__rlBridgePanel ? window.__rlBridgePanel.conflictInfo() : null,
    rejects: window.__rlBridgePanel ? window.__rlBridgePanel.rejects() : [],
    section: document.body.getAttribute('data-section'),
    errors: Array.from(document.querySelectorAll('[role="alert"]')).map((node) => node.textContent || '')
  }))()`);
}

async function createRequestInPanel(cdp, dockSession, flyoutSession, title, description) {
  await evaluate(cdp, dockSession, "document.querySelector('[data-section=\"new\"]').click()");
  await waitFor(() => evaluate(cdp, flyoutSession, "!!document.getElementById('rl-new-title')"), "new request form");
  await evaluate(cdp, flyoutSession, `(() => {
    const input = document.getElementById('rl-new-title');
    input.value = ${JSON.stringify(title)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-act="create"]').click();
    return true;
  })()`);
  await sleep(700);
  await evaluate(cdp, flyoutSession, "document.querySelector('[data-act=\"save-section\"]').click()");
  await waitFor(() => evaluate(cdp, flyoutSession, "!!document.getElementById('rl-desc-input')"), "description step");
  await evaluate(cdp, flyoutSession, `(() => {
    const input = document.getElementById('rl-desc-input');
    input.value = ${JSON.stringify(description)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-act="save-section"]').click();
    return true;
  })()`);
  await sleep(1400);
}

async function main() {
  /* server-disk reset: each e2e starts from an empty projects/ disk */
  try{ fs.rmSync(path.join(ROOT, 'projects'), { recursive: true, force: true }); }catch(error){ /* ignore */ }
  try{ fs.rmSync(path.join(ROOT, 'backups'), { recursive: true, force: true }); }catch(error){ /* ignore */ }
  try{ fs.rmSync(path.join(ROOT, 'deleted-projects'), { recursive: true, force: true }); }catch(error){ /* ignore */ }
  try{ fs.rmSync(path.join(ROOT, 'rl-config.json'), { force: true }); }catch(error){ /* ignore */ }
  if (!fs.existsSync(path.join(EXT, "manifest.json"))) throw new Error("dist/extension missing");
  fs.mkdirSync(TMP, { recursive: true });
  fs.rmSync(PROFILE, { recursive: true, force: true });

  const port = await freePort();
  const base = "http://localhost:" + port;
  const server = startServer(port, "real-tabs-conflict.lock");
  let chrome = null;

  try {
    await waitServer(port);
    await primeServer(port);
    chrome = spawn(chromePath(), [
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
    ], { stdio: "ignore" });

    const version = await waitEndpoint(PORT, 20000);
    const cdp = new CDP(version.webSocketDebuggerUrl);
    const loaded = await cdp.send("Extensions.loadUnpacked", { path: EXT });
    check("extension loads with the pinned id", loaded.id === EXT_ID, loaded);

    const appTarget = await cdp.send("Target.createTarget", { url: base + "/index.html?rl-local=1" });
    let appSession = await attach(cdp, appTarget.targetId);
    await sleep(900);
    await dismissOnboarding(cdp, appSession);
    await waitFor(() => evaluate(cdp, appSession, "!!document.getElementById('projectCreateInput')"), "project creator", 20000);

    /* The panel exists before the project: it must adopt the later app id. */
    const appPanel = await openPanel(cdp, appSession);
    await evaluate(cdp, appSession, `(() => {
      const input = document.getElementById('projectCreateInput');
      input.value = ${JSON.stringify(PROJECT_NAME)};
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('projectCreateBtn').click();
      return true;
    })()`);
    const appProjectId = await waitFor(() => evaluate(cdp, appSession,
      "window.__rlBridge && window.__rlBridge.projectId()"), "app project bridge", 20000);
    await sleep(800);
    const afterCreate = await readApp(cdp, appSession, appProjectId);
    check("project creation persists one registry ledger id",
      afterCreate.record && afterCreate.record.ledgerId === afterCreate.bridge.ledgerId,
      { record: afterCreate.record, bridge: afterCreate.bridge });
    await waitFor(() => evaluate(cdp, appPanel.flyoutSession,
      "window.__rlBridgePanel && window.__rlBridgePanel.projectId() === " + JSON.stringify(appProjectId)), "panel adopts project", 20000);
    const panelAfterCreate = await readPanel(cdp, appPanel.flyoutSession);
    check("panel adopts the app ledger id before the first request",
      panelAfterCreate.ledgerId === afterCreate.bridge.ledgerId, panelAfterCreate);

    /* Tab B creates a request first, with Tab A backgrounded. */
    const otherTarget = await cdp.send("Target.createTarget", { url: base + "/" + TARGET_PATH });
    const otherSession = await attach(cdp, otherTarget.targetId);
    await waitFor(() => evaluate(cdp, otherSession, "!!document.getElementById('rl-host')"), "Tab B host", 25000);
    const otherPanel = await openPanel(cdp, otherSession);
    await waitFor(() => evaluate(cdp, otherPanel.flyoutSession,
      "window.__rlBridgePanel && window.__rlBridgePanel.projectId() === " + JSON.stringify(appProjectId)), "Tab B panel project", 25000);
    await cdp.send("Target.activateTarget", { targetId: otherTarget.targetId });
    await createRequestInPanel(cdp, otherPanel.dockSession, otherPanel.flyoutSession,
      "Request from Tab B", "Created before the app first request.");

    /* Add/type on Tab A without activating it, so visibility/focus sync cannot
       beat the first request. */
    await evaluate(cdp, appSession, "document.getElementById('emptyAddBtn').click()");
    await waitFor(() => evaluate(cdp, appSession,
      "document.getElementById('typeModal').classList.contains('is-open')"), "type modal", 5000);
    await evaluate(cdp, appSession, "document.querySelector('#typeChoices .typechoice').click()");
    await waitFor(() => evaluate(cdp, appSession, "!!document.querySelector('.req [data-field=\"title\"]')"), "request row", 5000);
    await evaluate(cdp, appSession, "document.querySelector('.req [data-field=\"title\"]').focus()");
    await cdp.send("Input.insertText", { text: "Typed first request" }, appSession);
    await sleep(2600);

    const after = await readApp(cdp, appSession, appProjectId);
    const panelAfter = await readPanel(cdp, appPanel.flyoutSession);
    if (after.modal) {
      await screenshot(cdp, appSession, "11b-real-tabs-conflict-modal.png");
      console.log("CONFLICT REPRODUCED", JSON.stringify({
        app: after.bridge,
        panel: panelAfter,
        registry: { activeId: after.activeId, recordLedgerId: after.record && after.record.ledgerId },
        requests: after.ledger && after.ledger.requests.map((item) => item.title)
      }, null, 2));
    } else {
      await screenshot(cdp, appSession, "11b-real-tabs-no-conflict.png");
      console.log("NO CONFLICT", JSON.stringify({
        app: after.bridge,
        panel: panelAfter,
        registry: { activeId: after.activeId, recordLedgerId: after.record && after.record.ledgerId },
        requests: after.ledger && after.ledger.requests.map((item) => item.title)
      }, null, 2));
    }
    check("no conflict after a Tab B request and the app's first request",
      after.modal === false, { app: after.bridge, panel: panelAfter });
    check("the app keeps the project's one ledger id",
      after.record.ledgerId === afterCreate.bridge.ledgerId &&
      after.bridge.ledgerId === afterCreate.bridge.ledgerId, {
        before: afterCreate.bridge.ledgerId,
        app: after.bridge.ledgerId,
        registry: after.record.ledgerId
      });
    check("the Tab B request and the app request both survive",
      after.ledger && after.ledger.requests.some((item) => item.title === "Request from Tab B") &&
      after.ledger.requests.some((item) => item.title === "Typed first request"),
      after.ledger && after.ledger.requests.map((item) => item.title));

    try { await cdp.send("Target.closeTarget", { targetId: otherTarget.targetId }); } catch (error) { /* ignore */ }
    try { await cdp.send("Target.closeTarget", { targetId: appTarget.targetId }); } catch (error) { /* ignore */ }
  } finally {
    stopChild(server);
    if (chrome) {
      try { chrome.kill(); } catch (error) { /* ignore */ }
    }
    try { fs.rmSync(path.join(TMP, "real-tabs-conflict.lock"), { force: true }); } catch (error) { /* ignore */ }
  }

  const failed = checks.filter((entry) => !entry.ok);
  console.log("\n" + (checks.length - failed.length) + "/" + checks.length + " checks passed");
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error("REAL TABS CONFLICT E2E ERROR:", error.message);
  process.exit(1);
});
