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
const PROFILE = path.join(os.tmpdir(), "rl-real-tabs-e2e-profile");
const PROJECT_NAME = "Real Tabs Project E2E";
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
        rejects: window.__rlBridge.rejects(),
        projectCommands: window.__rlBridge.projectCommands()
      } : null
    };
  })()`);
}

async function openAppProject(cdp, pageSession, projectId){
  await evaluate(cdp, pageSession, `(() => {
    const picker = document.getElementById('projectPicker');
    if (picker && picker.hidden) {
      const sw = document.getElementById('projectsSwitchBtn');
      if (sw) sw.click();
    }
    return true;
  })()`);
  await waitFor(() => evaluate(cdp, pageSession,
    "document.getElementById('projectPicker') && !document.getElementById('projectPicker').hidden"), "app picker", 10000);
  await evaluate(cdp, pageSession,
    "document.querySelector('#projectPickerList [data-project-id=\"" + projectId + "\"]').click()");
  await sleep(900);
}

async function pasteImage(cdp, sessionId){
  await evaluate(cdp, sessionId, `(() => {
    const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4WQAAAAASUVORK5CYII=';
    const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
    const file = new File([bytes], 'pasted.png', { type: 'image/png' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    return true;
  })()`);
  await sleep(1400);
}

async function readPanel(cdp, flyoutSession) {
  return evaluate(cdp, flyoutSession, `(() => ({
    projectId: window.__rlBridgePanel ? window.__rlBridgePanel.projectId() : '',
    ledgerId: window.__rlBridgePanel ? window.__rlBridgePanel.ledgerId() : '',
    connected: window.__rlBridgePanel ? window.__rlBridgePanel.connected() : false,
    serverStopped: window.__rlBridgePanel ? window.__rlBridgePanel.serverStopped() : false,
    locked: window.__rlBridgePanel ? window.__rlBridgePanel.locked() : false,
    presence: window.__rlBridgePanel ? window.__rlBridgePanel.presence() : null,
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
  if (!fs.existsSync(path.join(EXT, "manifest.json"))) throw new Error("dist/extension missing");
  fs.mkdirSync(TMP, { recursive: true });
  fs.rmSync(PROFILE, { recursive: true, force: true });

  const port = await freePort();
  const base = "http://localhost:" + port;
  let server = startServer(port, "real-tabs-a.lock");
  let chrome = null;

  try {
    await waitServer(port);
    await primeServer(port);

    chrome = spawn(chromePath(), [
      "--user-data-dir=" + PROFILE,
      "--enable-unsafe-extension-debugging",
      "--remote-debugging-port=" + PORT,
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

    /* Tab A: the real app. */
    const appTarget = await cdp.send("Target.createTarget", { url: base + "/index.html" });
    let appSession = await attach(cdp, appTarget.targetId);
    await sleep(900);
    await dismissOnboarding(cdp, appSession);
    await waitFor(() => evaluate(cdp, appSession, "!!document.getElementById('projectCreateInput')"), "project creator", 20000);
    await waitFor(() => evaluate(cdp, appSession, "!!document.getElementById('rl-host')"), "companion host", 20000);
    /* The panel exists before the project does: it must adopt the app's id
       when the project is created later in the same session. */
    let appPanel = await openPanel(cdp, appSession);

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
      afterCreate.record && afterCreate.record.ledgerId && afterCreate.record.ledgerId === afterCreate.bridge.ledgerId,
      { record: afterCreate.record, bridge: afterCreate.bridge });
    check("project creation persists the same id in the ledger",
      afterCreate.ledger && afterCreate.ledger.ledgerId === afterCreate.bridge.ledgerId,
      { ledger: afterCreate.ledger && afterCreate.ledger.ledgerId, bridge: afterCreate.bridge.ledgerId });
    await screenshot(cdp, appSession, "10-real-tabs-project-created.png");

    await waitFor(() => evaluate(cdp, appPanel.flyoutSession,
      "window.__rlBridgePanel && window.__rlBridgePanel.projectId() === " + JSON.stringify(appProjectId)), "panel adopts project", 20000);
    const panelAfterCreate = await readPanel(cdp, appPanel.flyoutSession);
    check("panel adopts the app ledger id before the first request",
      panelAfterCreate.ledgerId === afterCreate.bridge.ledgerId, panelAfterCreate);

    const panelSections = await evaluate(cdp, appPanel.dockSession,
      "Array.from(document.querySelectorAll('.item[data-section]')).map((node) => node.getAttribute('data-section'))");
    check("extension has no Projects or Settings rail section",
      !panelSections.includes("project") && !panelSections.includes("projects") && !panelSections.includes("settings"),
      panelSections);
    await evaluate(cdp, appPanel.dockSession, "window.RLPanel.open('list')");
    await sleep(500);
    check("Requests no longer contains a Projects block",
      await evaluate(cdp, appPanel.flyoutSession,
        "!document.getElementById('rl-project-picker-tree') && !document.querySelector('.archive__projects')") === true);
    await evaluate(cdp, appPanel.dockSession, "window.RLPanel.close()");
    await sleep(400);

    /* Panel-only theme toggle, persisted as rl-theme. */
    const appThemeBefore = await evaluate(cdp, appSession,
      "document.documentElement.getAttribute('data-theme')");
    const themeBefore = await evaluate(cdp, appPanel.flyoutSession,
      "document.documentElement.getAttribute('data-theme')");
    await evaluate(cdp, appPanel.dockSession, "document.getElementById('rl-theme-toggle').click()");
    const themeAfter = await evaluate(cdp, appPanel.flyoutSession,
      "document.documentElement.getAttribute('data-theme')");
    const storedTheme = await evaluate(cdp, appPanel.dockSession,
      "new Promise((resolve) => chrome.storage.local.get('rl-theme', (value) => resolve(value['rl-theme'] || ''))) ");
    check("panel theme toggle flips the panel only",
      themeAfter !== themeBefore && themeAfter === storedTheme &&
      await evaluate(cdp, appSession, "document.documentElement.getAttribute('data-theme')") === appThemeBefore,
      { themeBefore, themeAfter, storedTheme, appThemeBefore });

    /* First request through the real app UI. */
    await evaluate(cdp, appSession, "document.getElementById('emptyAddBtn').click()");
    await waitFor(() => evaluate(cdp, appSession,
      "document.getElementById('typeModal').classList.contains('is-open')"), "type modal", 5000);
    await evaluate(cdp, appSession, "document.querySelector('#typeChoices .typechoice').click()");
    await waitFor(() => evaluate(cdp, appSession, "!!document.querySelector('.req [data-field=\"title\"]')"), "request row", 5000);
    await evaluate(cdp, appSession, "document.querySelector('.req [data-field=\"title\"]').focus()");
    await cdp.send("Input.insertText", { text: "Typed first request" }, appSession);
    await sleep(1800);

    const afterTyping = await readApp(cdp, appSession, appProjectId);
    const panelAfterTyping = await readPanel(cdp, appPanel.flyoutSession);
    if (afterTyping.modal) {
      await screenshot(cdp, appSession, "11-real-tabs-conflict-modal.png");
      console.log("CONFLICT EVIDENCE", JSON.stringify({
        when: new Date().toISOString(),
        app: afterTyping.bridge,
        panel: panelAfterTyping,
        registry: {
          activeId: afterTyping.activeId,
          recordLedgerId: afterTyping.record && afterTyping.record.ledgerId
        },
        requests: {
          app: afterTyping.ledger ? afterTyping.ledger.requests.length : -1,
          panel: panelAfterTyping
        }
      }, null, 2));
    } else {
      await screenshot(cdp, appSession, "11-real-tabs-first-typed-request.png");
    }
    check("first typed request does not open Two ledgers found",
      afterTyping.modal === false, { app: afterTyping.bridge, panel: panelAfterTyping });
    check("typing keeps the app ledger id",
      afterTyping.bridge.ledgerId === afterCreate.bridge.ledgerId &&
      afterTyping.record.ledgerId === afterCreate.bridge.ledgerId,
      { before: afterCreate.bridge.ledgerId, after: afterTyping.bridge.ledgerId, record: afterTyping.record.ledgerId });
    check("typing keeps the panel on the same ledger id",
      panelAfterTyping.ledgerId === afterCreate.bridge.ledgerId, panelAfterTyping);
    check("typing does not open a panel section",
      panelAfterTyping.section === null && afterTyping.flyoutDisplay === "none",
      { section: panelAfterTyping.section, flyoutDisplay: afterTyping.flyoutDisplay });

    /* Server project folder + Save + Export + archive read. */
    const projectsRoot = path.join(ROOT, "projects");
    let projectSlug = "";
    let projectFolder = "";
    await waitFor(() => {
      if (!fs.existsSync(projectsRoot)) return false;
      const found = fs.readdirSync(projectsRoot).find((name) => {
        try {
          const meta = JSON.parse(fs.readFileSync(path.join(projectsRoot, name, "project.json"), "utf8"));
          return meta.projectId === appProjectId;
        } catch (error) { return false; }
      });
      if (!found) return false;
      projectSlug = found;
      projectFolder = path.join(projectsRoot, found);
      return true;
    }, "server project folder", 12000);
    check("app project creation creates projects/<slug>/ on the server",
      fs.existsSync(path.join(projectFolder, "project.json")) === true);
    await evaluate(cdp, appSession, "document.getElementById('saveRecordBtn').click()");
    await waitFor(() => fs.existsSync(path.join(projectFolder, "ledger.json")), "server ledger save", 12000);
    const savedLedger = JSON.parse(fs.readFileSync(path.join(projectFolder, "ledger.json"), "utf8"));
    check("Save writes the ledger snapshot into the project folder",
      Array.isArray(savedLedger.requests) && savedLedger.requests.length >= 1, savedLedger.requests && savedLedger.requests.length);
    const exportResponse = await fetch("http://127.0.0.1:" + port + "/__rl/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: appProjectId,
        name: PROJECT_NAME,
        slug: projectSlug,
        files: [{ name: "e2e-export.md", encoding: "base64", content: Buffer.from("# export").toString("base64") }]
      })
    }).then((response) => response.json()).catch(() => null);
    check("Export writes into the project folder when no target is set",
      exportResponse && exportResponse.ok === true && fs.existsSync(path.join(projectFolder, "exports", "e2e-export.md")), exportResponse);
    const serverProjects = await fetch("http://127.0.0.1:" + port + "/__rl/projects")
      .then((response) => response.json()).catch(() => null);
    check("archive project list can read the server project folders",
      serverProjects && Array.isArray(serverProjects.projects) &&
      serverProjects.projects.some((item) => item.projectId === appProjectId && item.slug === projectSlug),
      serverProjects);
    const archiveDetail = await evaluate(cdp, appSession, `(() => {
      const row = document.querySelector('#archiveProjectTree .hitem[data-project-id="' + window.__rlBridge.projectId() + '"]');
      if (row) row.click();
      return (document.getElementById('archiveProjectDetail') || {}).innerText || '';
    })()`);
    check("archive project detail shows the server folder",
      archiveDetail.indexOf("projects/" + projectSlug + "/") >= 0, archiveDetail);

    /* App -> panel media: a real paste event in the app. */
    await pasteImage(cdp, appSession);
    const appPasted = await waitFor(async () => {
      const app = await readApp(cdp, appSession, appProjectId);
      const request = app.ledger && app.ledger.requests.find((item) => /Typed first request/.test(item.title));
      return request && request.images && request.images.length === 1 ? app : null;
    }, "app paste stores an image", 8000);
    const panelPasted = await waitFor(async () => {
      const state = await readPanel(cdp, appPanel.flyoutSession);
      const requests = await evaluate(cdp, appPanel.flyoutSession,
        "window.__rlBridgePanel && window.__rlBridgePanel.requests()");
      const request = (requests || []).find((item) => item.images === 1);
      return request ? { state, requests } : null;
    }, "panel receives the app image", 12000);
    check("app paste reaches the panel", !!panelPasted, panelPasted);
    check("app paste keeps the same ledger id",
      appPasted.record.ledgerId === afterCreate.bridge.ledgerId && panelPasted.state.ledgerId === afterCreate.bridge.ledgerId);
    await screenshot(cdp, appSession, "15-media-app-paste.png");

    /* Panel -> app media: open the detail and paste there. */
    await evaluate(cdp, appPanel.dockSession, "window.RLPanel.open('list')");
    await sleep(500);
    await evaluate(cdp, appPanel.flyoutSession, `(() => {
      const row = document.querySelector('.rrow');
      if (row) row.click();
      return true;
    })()`);
    await waitFor(() => evaluate(cdp, appPanel.flyoutSession,
      "document.body.getAttribute('data-section') === 'detail'"), "panel detail", 8000);
    await pasteImage(cdp, appPanel.flyoutSession);
    const appFromPanel = await waitFor(async () => {
      const app = await readApp(cdp, appSession, appProjectId);
      const request = app.ledger && app.ledger.requests.find((item) => /Typed first request/.test(item.title));
      return request && request.images && request.images.length === 2 ? app : null;
    }, "panel paste reaches the app", 12000);
    check("panel paste reaches the app", !!appFromPanel, appFromPanel);
    const panelMedia = await evaluate(cdp, appPanel.flyoutSession,
      "window.__rlBridgePanel && window.__rlBridgePanel.requests()");
    check("both surfaces hold both images",
      (panelMedia || []).some((item) => item.images === 2), panelMedia);
    await screenshot(cdp, appSession, "16-media-panel-paste.png");

    /* Ready/locked requests must still allow an image preview, never editing. */
    await evaluate(cdp, appSession, `(() => {
      const desc = document.getElementById('desc-IST-001');
      if (desc) {
        desc.value = 'Ready preview check.';
        desc.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const tick = document.querySelector('.req[data-id="IST-001"] [data-action="tick"]');
      if (tick) tick.click();
      return !!tick;
    })()`);
    await waitFor(() => evaluate(cdp, appSession,
      "!!document.querySelector('.req[data-id=\"IST-001\"].req--ready')"), "request ready", 8000);
    const previewOpened = await evaluate(cdp, appSession, `(() => {
      const open = document.querySelector('.req[data-id="IST-001"] [data-action="view-image"]');
      if (open) open.click();
      return !!open;
    })()`);
    await waitFor(() => evaluate(cdp, appSession,
      "document.getElementById('lightboxModal').classList.contains('is-open')"), "ready image preview", 8000);
    check("Ready/locked request still opens image preview",
      previewOpened === true &&
      await evaluate(cdp, appSession,
        "/^blob:/.test(document.getElementById('lightboxImg').src)") === true);
    await evaluate(cdp, appSession, "document.querySelector('#lightboxModal [data-close-modal]').click()");
    await sleep(300);

    /* App -> panel attachment upload (the design type exposes attachments). */
    await evaluate(cdp, appSession, "document.getElementById('addBtn').click()");
    await waitFor(() => evaluate(cdp, appSession,
      "document.getElementById('typeModal').classList.contains('is-open')"), "type modal for attachment", 5000);
    await evaluate(cdp, appSession, `(() => {
      const choice = Array.from(document.querySelectorAll('#typeChoices .typechoice'))
        .find((node) => /Design|Tasarım/i.test(node.innerText));
      if (choice) choice.click();
      return !!choice;
    })()`);
    await sleep(500);
    await evaluate(cdp, appSession, `(() => {
      const button = Array.from(document.querySelectorAll('.req [data-action="add-attachment"]'))
        .find((node) => node.closest('.req') && node.closest('.req').classList.contains('is-open'));
      if (button) button.click();
      return !!button;
    })()`);
    await evaluate(cdp, appSession, `(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['attachment payload'], 'notes.txt', { type: 'text/plain' }));
      const input = document.getElementById('globalAttachmentInput');
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    const appUploaded = await waitFor(async () => {
      const app = await readApp(cdp, appSession, appProjectId);
      const request = app.ledger && app.ledger.requests.find((item) => (item.attachments || []).length === 1);
      return request ? app : null;
    }, "app attachment upload", 10000);
    const panelUpload = await waitFor(async () => {
      const requests = await evaluate(cdp, appPanel.flyoutSession,
        "window.__rlBridgePanel && window.__rlBridgePanel.requests()");
      return (requests || []).some((item) => item.attachments === 1) ? requests : null;
    }, "panel receives the app attachment", 14000);
    check("app attachment upload reaches the panel", !!appUploaded && !!panelUpload, panelUpload);
    await screenshot(cdp, appSession, "17-media-attachment-upload.png");

    /* Toast inset: the sticky footer must stay above every visible toast. */
    await evaluate(cdp, appPanel.dockSession, "window.RLPanel.open('list')");
    await sleep(600);
    await evaluate(cdp, appPanel.flyoutSession,
      "document.getElementById('rl-fo-body').scrollTop = document.getElementById('rl-fo-body').scrollHeight");
    await sleep(300);
    const beforeToast = await evaluate(cdp, appSession, `(() => {
      const f = document.getElementById('rl-flyout').getBoundingClientRect();
      const t = document.getElementById('rl-toast-layer').getBoundingClientRect();
      return { flyout:{ top:f.top, bottom:f.bottom, height:f.height }, toast:{ top:t.top, bottom:t.bottom, height:t.height }, count:document.querySelectorAll('#rl-toast-layer > *').length };
    })()`);
    await screenshot(cdp, appSession, "18-toast-footer-before.png");
    for (let i = 0; i < 3; i += 1) {
      await evaluate(cdp, appPanel.flyoutSession, `window.parent.postMessage({
        source:'request-ledger-panel', type:'RL_TOAST',
        text:${JSON.stringify("This is a deliberately long notification that wraps onto more than one line so the measured inset follows the real toast height. ")},
        kind:${i === 2 ? "'error'" : "null"}, theme:'light'
      }, '*')`);
      await sleep(180);
    }
    const afterToast = await waitFor(async () => {
      const value = await evaluate(cdp, appSession, `(() => {
        const f = document.getElementById('rl-flyout').getBoundingClientRect();
        const t = document.getElementById('rl-toast-layer').getBoundingClientRect();
        return { flyout:{ top:f.top, bottom:f.bottom, height:f.height }, toast:{ top:t.top, bottom:t.bottom, height:t.height }, count:document.querySelectorAll('#rl-toast-layer > *').length };
      })()`);
      return value.count >= 2 && value.toast.height > 0 ? value : null;
    }, "toast stack visible", 5000);
    const footerButton = await evaluate(cdp, appPanel.flyoutSession, `(() => {
      const node = document.getElementById('rl-save-record');
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { top:r.top, bottom:r.bottom };
    })()`);
    const footerBottomInPage = afterToast.flyout.top + (footerButton ? footerButton.bottom : afterToast.flyout.height);
    check("visible toasts reserve a bottom inset for the flyout",
      afterToast.flyout.bottom <= afterToast.toast.top + 0.5,
      { before: beforeToast, after: afterToast });
    check("footer button stays above every visible toast",
      footerBottomInPage <= afterToast.toast.top - 2,
      { footerBottomInPage, toastTop: afterToast.toast.top, footerButton });
    await screenshot(cdp, appSession, "19-toast-footer-after.png");

    await evaluate(cdp, appPanel.dockSession, "window.RLPanel.close()");
    await sleep(700);

    /* Tab B: a plain page with the extension panel, not the app. */
    const otherTarget = await cdp.send("Target.createTarget", { url: base + "/" + TARGET_PATH });
    const otherSession = await attach(cdp, otherTarget.targetId);
    await waitFor(() => evaluate(cdp, otherSession, "!!document.getElementById('rl-host')"), "Tab B host", 25000);
    const otherPanel = await openPanel(cdp, otherSession, true);
    await waitFor(() => evaluate(cdp, otherPanel.flyoutSession,
      "window.__rlBridgePanel && window.__rlBridgePanel.projectId() === " + JSON.stringify(appProjectId)), "Tab B panel project", 25000);
    const tabBPanel = await readPanel(cdp, otherPanel.flyoutSession);
    check("Tab B panel adopts the same project and ledger",
      tabBPanel.projectId === appProjectId && tabBPanel.ledgerId === afterCreate.bridge.ledgerId, tabBPanel);

    await createRequestInPanel(cdp, otherPanel.dockSession, otherPanel.flyoutSession,
      "Request from Tab B", "Created from the plain template tab.");
    let tabBUpdate = null;
    try{
      tabBUpdate = await waitFor(async () => {
        const app = await readApp(cdp, appSession, appProjectId);
        return app.ledger && app.ledger.requests.some((item) => item.title === "Request from Tab B") ? app : null;
      }, "Tab B request reaches Tab A", 8000);
    }catch(error){
      const app = await readApp(cdp, appSession, appProjectId);
      const panel = await readPanel(cdp, appPanel.flyoutSession);
      if (app.modal) await screenshot(cdp, appSession, "11b-real-tabs-conflict-modal.png");
      console.log("TAB B CONFLICT EVIDENCE", JSON.stringify({ app: app.bridge, panel, registry: app.registry, record: app.record, modal: app.modal }, null, 2));
      throw error;
    }
    const appPanelAfterB = await readPanel(cdp, appPanel.flyoutSession);
    check("Tab B panel request reaches Tab A without a modal",
      tabBUpdate.modal === false, { app: tabBUpdate.bridge, panel: appPanelAfterB });
    check("Tab B request keeps both sides on one ledger id",
      tabBUpdate.record.ledgerId === afterCreate.bridge.ledgerId &&
      appPanelAfterB.ledgerId === afterCreate.bridge.ledgerId, { app: tabBUpdate.record, panel: appPanelAfterB });
    check("bridge traffic keeps the app-window panel closed",
      appPanelAfterB.section === null && appPanelAfterB.connected === true, appPanelAfterB);
    await screenshot(cdp, appSession, "12-real-tabs-panel-closed.png");

    /* Reload Tab A: identity and data must survive. */
    await cdp.send("Page.reload", {}, appSession);
    await sleep(2600);
    appSession = await attach(cdp, appTarget.targetId);
    await dismissOnboarding(cdp, appSession);
    await waitFor(() => evaluate(cdp, appSession,
      "window.__rlBridge && window.__rlBridge.projectId() === " + JSON.stringify(appProjectId)), "app project after reload", 20000);
    const afterReload = await readApp(cdp, appSession, appProjectId);
    check("reload keeps no conflict and both requests",
      afterReload.modal === false && afterReload.ledger.requests.length === 3 &&
      afterReload.ledger.requests.some((item) => item.title === "Typed first request") &&
      afterReload.ledger.requests.some((item) => item.title === "Request from Tab B"), afterReload);
    check("reload keeps the same registry ledger id",
      afterReload.record.ledgerId === afterCreate.bridge.ledgerId &&
      afterReload.ledger.ledgerId === afterCreate.bridge.ledgerId, {
        record: afterReload.record.ledgerId,
        ledger: afterReload.ledger.ledgerId
      });
    await screenshot(cdp, appSession, "13-real-tabs-reload-no-modal.png");
    appPanel = await openPanel(cdp, appSession);
    try{
      await waitFor(() => evaluate(cdp, appPanel.flyoutSession,
        "window.__rlBridgePanel && window.__rlBridgePanel.connected()"), "panel reconnects after reload", 20000);
    }catch(error){
      console.log("RELOAD PANEL DEBUG", JSON.stringify({
        app: await readApp(cdp, appSession, appProjectId),
        panel: await readPanel(cdp, appPanel.flyoutSession)
      }));
      throw error;
    }

    /* Stop through the real UI, then start.cmd-equivalent on the same port. */
    await evaluate(cdp, appSession, "document.getElementById('railStopBtn').click()");
    await waitFor(() => evaluate(cdp, appSession,
      "document.getElementById('confirmModal').classList.contains('is-open')"), "stop confirmation", 5000);
    await evaluate(cdp, appSession, "document.getElementById('confirmOkBtn').click()");
    await waitFor(() => evaluate(cdp, appSession,
      "!document.getElementById('serverBlocked').hidden && window.__rlBridge.serverStopped()"), "server blocked", 12000);
    const stoppedProcess = await Promise.race([
      new Promise((resolve) => {
        if (server.exitCode !== null) return resolve(true);
        server.once("exit", () => resolve(true));
      }),
      sleep(8000).then(() => false),
    ]);
    check("Stop blocks the app and stops the server", stoppedProcess === true);
    const stopHidHost = await waitFor(() => evaluate(cdp, appSession,
      "!document.getElementById('rl-host')"), "extension host hides after stop", 10000).catch(() => false);
    check("Stop removes the extension UI completely", stopHidHost === true);
    stopChild(server);
    server = null;
    await sleep(500);

    server = startServer(port, "real-tabs-b.lock");
    await primeServer(port);
    const keepAlive = setInterval(() => {
      fetch("http://127.0.0.1:" + port + "/__rl/heartbeat", { method: "POST" }).catch(() => {});
    }, 700);
    try {
      await waitFor(async () => {
        try {
          const response = await fetch("http://127.0.0.1:" + port + "/__rl/status");
          return response.ok;
        } catch (error) { return false; }
      }, "server back on the same port", 15000);
      await sleep(4500);
      appSession = await attach(cdp, appTarget.targetId);
      await waitFor(() => evaluate(cdp, appSession,
        "window.__rlBridge && !window.__rlBridge.serverStopped() && window.__rlBridge.connected()"), "app reconnects after restart", 25000);
    } finally {
      clearInterval(keepAlive);
    }
    appPanel = await openPanel(cdp, appSession);
    await waitFor(() => evaluate(cdp, appPanel.flyoutSession,
      "window.__rlBridgePanel && window.__rlBridgePanel.connected()"), "panel reconnects after restart", 20000);
    const afterRestart = await readApp(cdp, appSession, appProjectId);
    const panelAfterRestart = await readPanel(cdp, appPanel.flyoutSession);
    check("restart reconnects with no conflict and intact data",
      afterRestart.modal === false && afterRestart.ledger.requests.length === 3 &&
      afterRestart.record.ledgerId === afterCreate.bridge.ledgerId, afterRestart);
    check("restart keeps the panel on the same ledger",
      panelAfterRestart.serverStopped === false && panelAfterRestart.ledgerId === afterCreate.bridge.ledgerId, panelAfterRestart);
    check("restart unlocks the panel", panelAfterRestart.locked === false, panelAfterRestart);
    await screenshot(cdp, appSession, "14-real-tabs-restart-no-modal.png");

    check("no bridge rejection was logged for the real-tab flow",
      afterRestart.bridge.rejects.length === 0 && panelAfterRestart.rejects.length === 0, {
        app: afterRestart.bridge.rejects,
        panel: panelAfterRestart.rejects
      });

    const errors = cdp.events.filter((event) => event.method === "Runtime.exceptionThrown");
    check("no uncaught errors in the real-tab flow", errors.length === 0,
      errors.slice(0, 3).map((event) => (event.params.exceptionDetails || {}).text));

    try { await cdp.send("Target.closeTarget", { targetId: otherTarget.targetId }); } catch (error) { /* ignore */ }
    try { await cdp.send("Target.closeTarget", { targetId: appTarget.targetId }); } catch (error) { /* ignore */ }
  } finally {
    stopChild(server);
    if (chrome) {
      try { chrome.kill(); } catch (error) { /* ignore */ }
    }
    for (const name of ["real-tabs-a.lock", "real-tabs-b.lock"]) {
      try { fs.rmSync(path.join(TMP, name), { force: true }); } catch (error) { /* ignore */ }
    }
  }

  const failed = checks.filter((entry) => !entry.ok);
  console.log("\n" + (checks.length - failed.length) + "/" + checks.length + " checks passed");
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error("REAL TABS E2E ERROR:", error.message);
  process.exit(1);
});
