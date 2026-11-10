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

/* Dispatch one real mouse click at a panel row. The first click also focuses
   the flyout iframe, which is exactly the lost-click case. */
async function clickPanelRow(cdp, appTarget, appSession, flyoutSession, requestId) {
  await cdp.send("Target.activateTarget", { targetId: appTarget.targetId });
  await sleep(200);
  /* Delegated click on the stable flyout body: the row may be replaced by a
     re-render, but the listener and the data-request-id remain. */
  return evaluate(cdp, flyoutSession, `(() => {
    const row = document.querySelector('[data-request-id="${requestId}"] .rrow-main');
    if (!row) return null;
    row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    row.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    return { id: '${requestId}' };
  })()`);
}

async function openPanel(cdp, pageSession) {  await waitFor(() => evaluate(cdp, pageSession,
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
  let server = startServer(port, "real-tabs-a.lock");
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

    /* Tab A: the real app. */
    const appTarget = await cdp.send("Target.createTarget", { url: base + "/index.html?rl-local=1" });
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

    /* Panel-only theme toggle, persisted per tab as rl-theme:<tabId>. */
    const appThemeBefore = await evaluate(cdp, appSession,
      "document.documentElement.getAttribute('data-theme')");
    const themeBefore = await evaluate(cdp, appPanel.flyoutSession,
      "document.documentElement.getAttribute('data-theme')");
    const appTabId = await evaluate(cdp, appPanel.flyoutSession,
      "window.__rlBridgePanel && window.__rlBridgePanel.tabId()");
    check("panel iframe carries the host tab id", appTabId > 0, appTabId);
    await evaluate(cdp, appPanel.dockSession, "document.getElementById('rl-theme-toggle').click()");
    const themeAfter = await evaluate(cdp, appPanel.flyoutSession,
      "document.documentElement.getAttribute('data-theme')");
    const storedTheme = await evaluate(cdp, appPanel.flyoutSession,
      `new Promise((resolve) => chrome.storage.session.get('rl-theme:${appTabId}', (value) => resolve(value['rl-theme:${appTabId}'] || '')))`);
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

    /* Ready must survive the periodic presence/bridge probes. Keep the panel
       closed for 5 s, then open it and wait again; then revoke manually and
       prove the revoke is not reverted either. */
    await sleep(5000);
    let readyApp = await readApp(cdp, appSession, appProjectId);
    let readyPanel = await evaluate(cdp, appPanel.flyoutSession,
      "window.__rlBridgePanel && window.__rlBridgePanel.requests()");
    const readyOf = (list) => (list || []).find((item) => item.id === "IST-001") || null;
    check("Ready survives 5 s with the panel closed",
      readyOf(readyApp.ledger.requests).confirmed === true &&
      readyOf(readyPanel).confirmed === true,
      { app: readyOf(readyApp.ledger.requests), panel: readyOf(readyPanel) });
    await evaluate(cdp, appPanel.dockSession, "window.RLPanel.open('list')");
    await sleep(5000);
    readyApp = await readApp(cdp, appSession, appProjectId);
    readyPanel = await evaluate(cdp, appPanel.flyoutSession,
      "window.__rlBridgePanel && window.__rlBridgePanel.requests()");
    check("Ready survives 5 s with the panel open",
      readyOf(readyApp.ledger.requests).confirmed === true &&
      readyOf(readyPanel).confirmed === true,
      { app: readyOf(readyApp.ledger.requests), panel: readyOf(readyPanel) });

    await evaluate(cdp, appSession, `(() => {
      const tick = document.querySelector('.req[data-id="IST-001"] [data-action="tick"]');
      if (tick) tick.click();
      return !!tick;
    })()`);
    await sleep(5000);
    const revokedApp = await readApp(cdp, appSession, appProjectId);
    const revokedPanel = await evaluate(cdp, appPanel.flyoutSession,
      "window.__rlBridgePanel && window.__rlBridgePanel.requests()");
    check("a manual Ready revoke stays revoked on both surfaces",
      readyOf(revokedApp.ledger.requests).confirmed === false &&
      readyOf(revokedPanel).confirmed === false,
      { app: readyOf(revokedApp.ledger.requests), panel: readyOf(revokedPanel) });

    /* Keep the bridge connected through the full 10 s window, then force a
       remote state refresh (an app edit to another row) before re-reading:
       the stale confirmed=true copy must never resurrect the revoke. */
    await sleep(5000);
    await evaluate(cdp, appSession, `(() => {
      const rows = Array.from(document.querySelectorAll('.req')).filter((row) => row.dataset.id !== 'IST-001');
      const row = rows[0];
      if (!row) return false;
      if (!row.classList.contains('is-open')) {
        const toggle = row.querySelector('[data-action="toggle"]');
        if (toggle) toggle.click();
      }
      const input = row.querySelector('[data-field="note"]');
      if (!input) return false;
      input.value = 'Remote refresh after revoke.';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(1600);
    const revokedLaterApp = await readApp(cdp, appSession, appProjectId);
    const revokedLaterPanel = await evaluate(cdp, appPanel.flyoutSession,
      "window.__rlBridgePanel && window.__rlBridgePanel.requests()");
    check("a manual Ready revoke stays revoked for 10 s and after a remote refresh",
      revokedLaterApp.modal === false &&
      readyOf(revokedLaterApp.ledger.requests).confirmed === false &&
      readyOf(revokedLaterPanel).confirmed === false,
      { app: readyOf(revokedLaterApp.ledger.requests), panel: readyOf(revokedLaterPanel) });
    await evaluate(cdp, appPanel.dockSession, "window.RLPanel.close()");
    await sleep(400);

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

    /* First-click regression: with no focus inside the panel, one real mouse
       click on a row must open it (focusing the iframe happens on that same
       click). Repeat after a probe, a remote patch and with the dock on the
       left. */
    /* Pin while the test drives many programmatic interactions: an unpinned
       rail auto-hides after 5 s and would close the section between a probe
       and the next click. */
    await evaluate(cdp, appPanel.dockSession,
      "(() => { if (!window.RLPanel.pinned()) window.RLPanel.togglePin(); return window.RLPanel.pinned(); })()");
    await evaluate(cdp, appPanel.dockSession,
      "window.RLPanel.setMode && window.RLPanel.setMode('idle')");
    await evaluate(cdp, appPanel.dockSession, "window.RLPanel.open('list')");
    await waitFor(() => evaluate(cdp, appPanel.flyoutSession,
      "document.querySelectorAll('[data-request-id]').length >= 2"), "two list rows", 10000);
    const listIds = await evaluate(cdp, appPanel.flyoutSession,
      "Array.from(document.querySelectorAll('[data-request-id]')).map((node) => node.getAttribute('data-request-id'))");
    const firstRowId = listIds[0];
    const secondRowId = listIds.find((id) => id !== firstRowId);
    const blurPanel = () => evaluate(cdp, appPanel.flyoutSession,
      "(() => { const el = document.activeElement; if (el && el.blur) el.blur(); return true; })()");
    const detailChip = () => evaluate(cdp, appPanel.flyoutSession,
      "(() => ({ section: document.body.dataset.section || '', chip: (document.getElementById('rl-fo-chip') || {}).textContent || '' }))()");
    const oneClickOpens = async (id) => {
      await blurPanel();
      const clicked = await clickPanelRow(cdp, appTarget, appSession, appPanel.flyoutSession, id);
      if (!clicked) return null;
      return waitFor(async () => {
        const state = await detailChip();
        return state.section === "detail" && state.chip === id ? state : null;
      }, "one-click row " + id, 7000).catch(() => null);
    };
    const leaveDetail = async () => {
      await evaluate(cdp, appPanel.flyoutSession,
        "(() => { const close = document.getElementById('rl-detail-close'); if (close) close.click(); return !!close; })()");
      await sleep(500);
      await evaluate(cdp, appPanel.dockSession,
        "window.RLPanel.setMode && window.RLPanel.setMode('idle')");
      await evaluate(cdp, appPanel.dockSession, "window.RLPanel.open('list')");
      await sleep(500);
    };

    const firstOpen = await oneClickOpens(firstRowId);
    check("one click opens the first row without a second click", !!firstOpen, { firstRowId, firstOpen });
    await leaveDetail();
    const secondOpen = await oneClickOpens(secondRowId);
    check("one click opens another row after the list re-renders", !!secondOpen, { secondRowId, secondOpen });

    /* One click on the detail close button leaves the detail. */
    await evaluate(cdp, appPanel.flyoutSession,
      "(() => { const close = document.getElementById('rl-detail-close'); if (close) close.click(); return !!close; })()");
    await sleep(500);
    const backSection = await evaluate(cdp, appPanel.flyoutSession, "document.body.dataset.section || ''");
    check("one click on close leaves the detail",
      backSection !== "detail", backSection);

    /* After a background probe, a single click still opens. */
    await sleep(5000);
    await evaluate(cdp, appPanel.dockSession,
      "window.RLPanel.openDock(); window.RLPanel.setMode && window.RLPanel.setMode('idle'); window.RLPanel.open('list')");
    await sleep(400);
    const afterProbeOpen = await oneClickOpens(firstRowId);
    check("one click still opens a row after a background probe", !!afterProbeOpen, afterProbeOpen);
    await leaveDetail();

    /* After a remote patch, a single click still opens. */
    const clickPatchTarget = await evaluate(cdp, appSession, `(() => {
      const reg = JSON.parse(localStorage.getItem('oz-projeler-v1'));
      const st = JSON.parse(localStorage.getItem('oz-istek-defteri-p-' + reg.activeId));
      const req = st.requests.find((item) => item.id === ${JSON.stringify(secondRowId)});
      if (!req) return null;
      const copy = JSON.parse(JSON.stringify(req));
      copy.updatedAt = new Date(Date.now() + 1000).toISOString();
      return copy;
    })()`);
    if (clickPatchTarget) {
      await evaluate(cdp, appSession, `window.postMessage({ source:'request-ledger-web', type:'RL_APP_PATCH', v:1,
        ledgerId: window.__rlBridge.ledgerId(), projectId: window.__rlBridge.projectId(),
        upserts:[${JSON.stringify(clickPatchTarget)}], updatedAt: ${JSON.stringify(clickPatchTarget.updatedAt)} }, '*')`);
      await sleep(900);
      const afterPatchOpen = await oneClickOpens(firstRowId);
      check("one click still opens a row after a remote patch", !!afterPatchOpen, afterPatchOpen);
      await leaveDetail();
    }

    /* Left-side dock: the iframe geometry changes; the first click must still
       reach the row. */
    await evaluate(cdp, appPanel.flyoutSession,
      "new Promise((resolve) => chrome.storage.local.set({ 'rl-side': 'left' }, () => resolve(true)))");
    await sleep(900);
    const leftOpen = await oneClickOpens(firstRowId);
    check("one click opens a row with the dock on the left", !!leftOpen, leftOpen);
    await evaluate(cdp, appPanel.flyoutSession,
      "new Promise((resolve) => chrome.storage.local.set({ 'rl-side': 'right' }, () => resolve(true)))");
    await sleep(700);
    await evaluate(cdp, appPanel.dockSession, "window.RLPanel.close()");
    await sleep(400);

    /* Metadata can arrive before its blob. Both surfaces must show a neutral
       loading state, then render the image when RL_APP_MEDIA lands — with no
       page reload. */
    const pendingPanelImage = "e2e-pending-panel-" + Date.now();
    const pendingAppImage = "e2e-pending-app-" + Date.now();
    const onePixelPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

    await evaluate(cdp, appSession, `(() => {
      const raw = localStorage.getItem('oz-istek-defteri-p-${appProjectId}');
      const req = JSON.parse(raw).requests.find((item) => item.id === 'IST-001');
      req.images = (req.images || []).concat([{ id:${JSON.stringify(pendingPanelImage)}, name:'pending-panel.png', type:'image/png', ext:'png', size:68, w:1, h:1, file:'' }]);
      req.updatedAt = new Date(Date.now() + 1000).toISOString();
      window.postMessage({ source:'request-ledger-web', type:'RL_APP_PATCH', v:1,
        ledgerId: window.__rlBridge.ledgerId(), projectId: window.__rlBridge.projectId(),
        upserts:[req], updatedAt: req.updatedAt }, '*');
      return true;
    })()`);
    await evaluate(cdp, appPanel.dockSession, "window.RLPanel.open('list')");
    await sleep(600);
    await evaluate(cdp, appPanel.flyoutSession, `(() => {
      const row = document.querySelector('[data-request-id="IST-001"]');
      if (row) row.click();
      return !!row;
    })()`);
    await waitFor(() => evaluate(cdp, appPanel.flyoutSession,
      `(() => { const cell = document.querySelector('#rl-img-grid .thumb[data-image-id="${pendingPanelImage}"]'); return cell && cell.classList.contains('is-loading') ? true : null; })()`),
      "panel pending thumb", 10000);
    const panelPending = await evaluate(cdp, appPanel.flyoutSession, `(() => {
      const cell = document.querySelector('#rl-img-grid .thumb[data-image-id="${pendingPanelImage}"]');
      return cell ? { loading: cell.classList.contains('is-loading'), missing: cell.classList.contains('is-missing'), text: cell.innerText } : null;
    })()`);
    check("panel shows a loading image while the blob is pending",
      panelPending && panelPending.loading === true && panelPending.missing === false,
      panelPending);

    await evaluate(cdp, appSession, `window.postMessage({ source:'request-ledger-web', type:'RL_APP_MEDIA', v:1,
      ledgerId: window.__rlBridge.ledgerId(), projectId: window.__rlBridge.projectId(), requestId:'IST-001',
      media:[{ kind:'image', id:${JSON.stringify(pendingPanelImage)},
        meta:{ id:${JSON.stringify(pendingPanelImage)}, name:'pending-panel.png', type:'image/png', ext:'png', size:68, w:1, h:1 },
        dataUrl:${JSON.stringify(onePixelPng)} }] }, '*')`);
    const panelArrived = await waitFor(() => evaluate(cdp, appPanel.flyoutSession, `(() => {
      const cell = document.querySelector('#rl-img-grid .thumb[data-image-id="${pendingPanelImage}"]');
      const img = cell && cell.querySelector('img');
      return img && /^blob:/.test(img.src) && !cell.classList.contains('is-loading') && !cell.classList.contains('is-missing') ? { ok:true } : null;
    })()`), "panel renders arrived media", 12000);
    check("panel renders the image when the blob arrives without a reload", !!panelArrived);

    /* One focus style: the component's accent border, never an extra
       outer outline that looks like a second frame. */
    const focusStyles = await evaluate(cdp, appPanel.flyoutSession, `(() => {
      const input = document.getElementById('rl-title-input');
      if (!input) return null;
      input.focus();
      const i = getComputedStyle(input);
      const inputStyle = { outlineStyle:i.outlineStyle, outlineWidth:i.outlineWidth, borderColor:i.borderColor };
      const sel = document.querySelector('.sel-btn');
      let selectStyle = null;
      if (sel) {
        sel.focus();
        const s = getComputedStyle(sel);
        selectStyle = { outlineStyle:s.outlineStyle, outlineWidth:s.outlineWidth, borderColor:s.borderColor };
      }
      return { theme:document.documentElement.getAttribute('data-theme'), input:inputStyle, select:selectStyle };
    })()`);
    check("panel text focus uses one accent border without an outer outline",
      focusStyles && focusStyles.input.outlineStyle === "none" &&
      /rgb\(209, 62, 39\)|rgb\(255, 95, 67\)|rgb\(224, 90, 63\)/.test(focusStyles.input.borderColor),
      focusStyles);

    /* Every form control (text input, textarea, native select, custom select
       trigger) must show exactly one visible focus ring - the accent border -
       in both themes, with no second outline. */
    const measureFocusRings = () => evaluate(cdp, appPanel.flyoutSession, `(async () => {
      const accent = /rgb\\(209, 62, 39\\)|rgb\\(255, 95, 67\\)|rgb\\(224, 90, 63\\)/;
      const settle = () => new Promise((resolve) => setTimeout(resolve, 260));
      let tempSelect = null;
      if (!document.querySelector('select')) {
        tempSelect = document.createElement('select');
        tempSelect.className = 'fld set-select sel-native';
        tempSelect.innerHTML = '<option>one</option>';
        tempSelect.style.position = 'fixed';
        tempSelect.style.left = '-9999px';
        document.body.appendChild(tempSelect);
      }
      let tempTrigger = null;
      if (!document.querySelector('.sel-btn')) {
        const wrap = document.createElement('div');
        wrap.className = 'sel';
        wrap.style.position = 'fixed';
        wrap.style.left = '-9999px';
        wrap.style.width = '120px';
        tempTrigger = document.createElement('button');
        tempTrigger.type = 'button';
        tempTrigger.className = 'sel-btn';
        tempTrigger.innerHTML = '<span class="sel-label">one</span>';
        wrap.appendChild(tempTrigger);
        document.body.appendChild(wrap);
      }
      const targets = [
        ['input', document.getElementById('rl-title-input')],
        ['textarea', document.getElementById('rl-desc-input') || document.querySelector('.textarea')],
        ['native-select', document.querySelector('select')],
        ['custom-trigger', document.querySelector('.sel-btn')]
      ];
      const rows = [];
      for (const entry of targets) {
        const name = entry[0];
        const el = entry[1];
        if (!el) { rows.push({ name: name, missing: true }); continue; }
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        await settle();
        const restBorder = getComputedStyle(el).borderColor;
        try { el.focus({ focusVisible: true }); } catch (err) { el.focus(); }
        await settle();
        const on = getComputedStyle(el);
        const outlineVisible = on.outlineStyle !== 'none' && parseFloat(on.outlineWidth) > 0;
        const borderRing = accent.test(on.borderColor) && !accent.test(restBorder);
        rows.push({
          name: name,
          focused: document.activeElement === el,
          restBorder: restBorder,
          focusBorder: on.borderColor,
          outlineStyle: on.outlineStyle,
          outlineWidth: on.outlineWidth,
          ringVisible: outlineVisible || borderRing,
          rings: (outlineVisible ? 1 : 0) + (borderRing ? 1 : 0)
        });
      }
      if (tempSelect && tempSelect.parentNode) tempSelect.parentNode.removeChild(tempSelect);
      if (tempTrigger && tempTrigger.parentNode) tempTrigger.parentNode.removeChild(tempTrigger);
      return { theme: document.documentElement.getAttribute('data-theme'), rows: rows };
    })()`);
    const keyboardModality = async () => {
      await cdp.send("Input.dispatchKeyEvent",
        { type: "keyDown", key: "Shift", code: "ShiftLeft", windowsVirtualKeyCode: 16 }, appPanel.flyoutSession);
      await cdp.send("Input.dispatchKeyEvent",
        { type: "keyUp", key: "Shift", code: "ShiftLeft", windowsVirtualKeyCode: 16 }, appPanel.flyoutSession);
    };
    await keyboardModality();
    const focusRingsA = await measureFocusRings();
    await evaluate(cdp, appPanel.dockSession, "document.getElementById('rl-theme-toggle').click()");
    await sleep(500);
    await keyboardModality();
    const focusRingsB = await measureFocusRings();
    await evaluate(cdp, appPanel.dockSession, "document.getElementById('rl-theme-toggle').click()");
    await sleep(400);
    const singleRing = (set) => !!set && set.rows.length === 4 &&
      set.rows.every((row) => !row.missing && row.focused && row.ringVisible && row.rings === 1);
    check("input, textarea, select and custom trigger each show exactly one focus ring",
      singleRing(focusRingsA), focusRingsA);
    check("the single focus ring is identical in the other theme",
      singleRing(focusRingsB) && focusRingsA && focusRingsB &&
      focusRingsA.theme !== focusRingsB.theme, { first: focusRingsA, second: focusRingsB });

    /* Focus stability: a 10 s pause, a probe failure/recovery, a remote patch
       and a background tab must not blur the field or move the caret. */
    const originalTitle = await evaluate(cdp, appPanel.flyoutSession,
      "document.getElementById('rl-title-input').value");
    await evaluate(cdp, appPanel.flyoutSession, `(() => {
      const input = document.getElementById('rl-title-input');
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
      return true;
    })()`);
    await cdp.send("Input.insertText", { text: "Z" }, appPanel.flyoutSession);
    await sleep(1000);
    const caretState = () => evaluate(cdp, appPanel.flyoutSession, `(() => {
      const input = document.getElementById('rl-title-input');
      return {
        activeId: document.activeElement && document.activeElement.id,
        hasFocus: document.hasFocus(),
        start: input ? input.selectionStart : -1,
        end: input ? input.selectionEnd : -1,
        value: input ? input.value : ''
      };
    })()`);
    const caretBefore = await caretState();
    await sleep(10000);
    const afterPause = await caretState();
    check("Title keeps focus and caret through a 10 s pause",
      afterPause.activeId === "rl-title-input" && afterPause.hasFocus === true &&
      afterPause.start === caretBefore.start && afterPause.value === caretBefore.value,
      { caretBefore, afterPause });

    /* Probe failure and recovery are status-only. */
    await evaluate(cdp, appPanel.flyoutSession, `(() => {
      window.__rlOriginalSendMessage = chrome.runtime.sendMessage.bind(chrome.runtime);
      window.__rlFailProbeOnce = true;
      chrome.runtime.sendMessage = function(message, callback){
        if(window.__rlFailProbeOnce && message && message.type === "RL_APP_PRESENCE"){
          window.__rlFailProbeOnce = false;
          if(callback) setTimeout(function(){ callback({ open:false }); }, 0);
          return;
        }
        return window.__rlOriginalSendMessage.apply(null, arguments);
      };
      return true;
    })()`);
    await sleep(5000);
    const afterProbeFail = await caretState();
    check("a failed presence probe does not blur the focused field",
      afterProbeFail.activeId === "rl-title-input" && afterProbeFail.start === caretBefore.start,
      afterProbeFail);
    await evaluate(cdp, appPanel.flyoutSession, `(() => {
      chrome.runtime.sendMessage = window.__rlOriginalSendMessage;
      return true;
    })()`);
    await sleep(5000);
    const afterProbeRecover = await caretState();
    check("probe recovery does not blur or re-render the focused field",
      afterProbeRecover.activeId === "rl-title-input" && afterProbeRecover.start === caretBefore.start,
      afterProbeRecover);

    /* A remote patch for another request re-renders the section; the focused
       title on this request must keep its caret. */
    const otherRequest = await evaluate(cdp, appSession, `(() => {
      const reg = JSON.parse(localStorage.getItem('oz-projeler-v1'));
      const st = JSON.parse(localStorage.getItem('oz-istek-defteri-p-' + reg.activeId));
      const req = st.requests.find((item) => item.id !== 'IST-001');
      if (!req) return null;
      const copy = JSON.parse(JSON.stringify(req));
      copy.updatedAt = new Date(Date.now() + 1000).toISOString();
      return copy;
    })()`);
    if (otherRequest) {
      await evaluate(cdp, appSession, `window.postMessage({ source:'request-ledger-web', type:'RL_APP_PATCH', v:1,
        ledgerId: window.__rlBridge.ledgerId(), projectId: window.__rlBridge.projectId(),
        upserts:[${JSON.stringify(otherRequest)}], updatedAt: ${JSON.stringify(otherRequest.updatedAt)} }, '*')`);
      await waitFor(() => evaluate(cdp, appPanel.flyoutSession,
        `window.__rlBridgePanel.requests().some((item) => item.id === ${JSON.stringify(otherRequest.id)} && item.updatedAt === ${JSON.stringify(otherRequest.updatedAt)})`),
        "remote patch applied", 10000);
      const afterPatch = await caretState();
      check("a remote patch re-render preserves focus and caret",
        afterPatch.activeId === "rl-title-input" && afterPatch.start === caretBefore.start &&
        afterPatch.value === caretBefore.value,
        afterPatch);
    }

    /* Background tab: a remote patch must not steal focus. */
    const backgroundTarget = await cdp.send("Target.createTarget", { url: "about:blank" });
    await cdp.send("Target.activateTarget", { targetId: backgroundTarget.targetId });
    await sleep(700);
    if (otherRequest) {
      const backgroundPatch = JSON.parse(JSON.stringify(otherRequest));
      backgroundPatch.updatedAt = new Date(Date.now() + 2000).toISOString();
      await evaluate(cdp, appSession, `window.postMessage({ source:'request-ledger-web', type:'RL_APP_PATCH', v:1,
        ledgerId: window.__rlBridge.ledgerId(), projectId: window.__rlBridge.projectId(),
        upserts:[${JSON.stringify(backgroundPatch)}], updatedAt: ${JSON.stringify(backgroundPatch.updatedAt)} }, '*')`);
      await sleep(1400);
      const backgroundState = await caretState();
      check("a background panel is not force-focused by a remote patch",
        backgroundState.hasFocus === false && backgroundState.activeId !== "rl-title-input",
        backgroundState);
    }
    await cdp.send("Target.activateTarget", { targetId: appTarget.targetId });
    await sleep(700);
    try { await cdp.send("Target.closeTarget", { targetId: backgroundTarget.targetId }); } catch (error) { /* ignore */ }

    /* Put the title back so the later exact-title checks stay valid. The
       panel patch may lag a re-render, so also write the app field directly
       and wait for both surfaces to report the original title. */
    await evaluate(cdp, appSession, `(() => {
      const input = document.querySelector('.req[data-id="IST-001"] [data-field="title"]');
      if (input) {
        input.value = ${JSON.stringify(originalTitle)};
        input.dispatchEvent(new Event('input', { bubbles:true }));
      }
      return !!input;
    })()`);
    await evaluate(cdp, appPanel.flyoutSession, `(() => {
      const input = document.getElementById('rl-title-input');
      if (input) {
        input.value = ${JSON.stringify(originalTitle)};
        input.dispatchEvent(new Event('input', { bubbles:true }));
      }
      return !!input;
    })()`);
    await waitFor(() => evaluate(cdp, appSession, `(() => {
      const raw = localStorage.getItem('oz-istek-defteri-p-${appProjectId}');
      const req = raw ? JSON.parse(raw).requests.find((item) => item.id === 'IST-001') : null;
      return req && req.title === ${JSON.stringify(originalTitle)} ? true : null;
    })()`), "title restored", 10000);

    const appPendingRequest = await evaluate(cdp, appSession, `(() => {
      const raw = localStorage.getItem('oz-istek-defteri-p-${appProjectId}');
      const req = JSON.parse(raw).requests.find((item) => item.id === 'IST-001');
      req.images = (req.images || []).concat([{ id:${JSON.stringify(pendingAppImage)}, name:'pending-app.png', type:'image/png', ext:'png', size:68, w:1, h:1, file:'' }]);
      req.updatedAt = new Date(Date.now() + 1000).toISOString();
      return req;
    })()`);
    await evaluate(cdp, appPanel.flyoutSession, `window.parent.postMessage({ source:'request-ledger-panel', type:'RL_APP_PATCH', v:1,
      ledgerId: window.__rlBridgePanel.ledgerId(), projectId: window.__rlBridgePanel.projectId(),
      upserts:[${JSON.stringify(appPendingRequest)}], updatedAt: ${JSON.stringify(appPendingRequest.updatedAt)} }, '*')`);
    const appHasPendingMeta = await waitFor(() => evaluate(cdp, appSession, `(() => {
      const raw = localStorage.getItem('oz-istek-defteri-p-${appProjectId}');
      const req = raw ? JSON.parse(raw).requests.find((item) => item.id === 'IST-001') : null;
      return !!(req && (req.images || []).some((item) => item.id === '${pendingAppImage}'));
    })()`), "app receives pending media metadata", 10000).catch(() => false);
    if (!appHasPendingMeta) {
      console.log("APP PENDING META DEBUG", JSON.stringify(await evaluate(cdp, appSession, `(() => ({
        bridge: window.__rlBridge ? {
          connected: window.__rlBridge.connected(),
          projectId: window.__rlBridge.projectId(),
          ledgerId: window.__rlBridge.ledgerId(),
          rejects: window.__rlBridge.rejects()
        } : null
      }))()`)));
    }
    check("app receives pending image metadata", appHasPendingMeta === true);
    await evaluate(cdp, appSession, `(() => {
      const row = document.querySelector('.req[data-id="IST-001"]');
      if (row && !row.classList.contains('is-open')) {
        const toggle = row.querySelector('[data-action="toggle"]');
        if (toggle) toggle.click();
      }
      return !!row;
    })()`);
    const appPending = await waitFor(() => evaluate(cdp, appSession, `(() => {
      const cell = document.querySelector('.req[data-id="IST-001"] .thumb[data-image-id="${pendingAppImage}"]');
      return cell && cell.classList.contains('is-loading') ? { loading:true, missing:cell.classList.contains('is-missing'), text:cell.innerText } : null;
    })()`), "app pending thumb", 10000);
    check("app shows a loading image while the blob is pending", !!appPending && appPending.missing === false, appPending);

    await evaluate(cdp, appPanel.flyoutSession, `window.parent.postMessage({ source:'request-ledger-panel', type:'RL_APP_MEDIA', v:1,
      ledgerId: window.__rlBridgePanel.ledgerId(), projectId: window.__rlBridgePanel.projectId(), requestId:'IST-001',
      media:[{ kind:'image', id:${JSON.stringify(pendingAppImage)},
        meta:{ id:${JSON.stringify(pendingAppImage)}, name:'pending-app.png', type:'image/png', ext:'png', size:68, w:1, h:1 },
        dataUrl:${JSON.stringify(onePixelPng)} }] }, '*')`);
    const appArrived = await waitFor(() => evaluate(cdp, appSession, `(() => {
      const cell = document.querySelector('.req[data-id="IST-001"] .thumb[data-image-id="${pendingAppImage}"]');
      const img = cell && cell.querySelector('img');
      return img && /^blob:/.test(img.src) && !cell.classList.contains('is-loading') ? { ok:true } : null;
    })()`), "app renders arrived media", 12000).catch(async () => {
      const debug = await evaluate(cdp, appSession, `(async () => {
        const raw = localStorage.getItem('oz-istek-defteri-p-${appProjectId}');
        const req = raw ? JSON.parse(raw).requests.find((item) => item.id === 'IST-001') : null;
        const db = await new Promise((resolve) => {
          const open = indexedDB.open('oz-istek-defteri');
          open.onsuccess = () => resolve(open.result);
          open.onerror = () => resolve(null);
        });
        const blobSize = await new Promise((resolve) => {
          if (!db) return resolve(-1);
          const tx = db.transaction('images', 'readonly');
          const get = tx.objectStore('images').get('${pendingAppImage}');
          get.onsuccess = () => resolve(get.result && get.result.blob ? get.result.blob.size : 0);
          get.onerror = () => resolve(-1);
        });
        return {
          hasImage: !!(req && (req.images || []).some((item) => item.id === '${pendingAppImage}')),
          images: req ? (req.images || []).map((item) => item.id) : [],
          blobSize: blobSize,
          stats: window.__rlBridge ? window.__rlBridge.stats() : null,
          relay: window.__rlBridgeHost ? window.__rlBridgeHost.toPage() : -1,
          bridge: window.__rlBridge ? {
            enabled: window.__rlBridge.enabled(),
            connected: window.__rlBridge.connected(),
            rejects: window.__rlBridge.rejects()
          } : null
        };
      })()`);
      console.log("MEDIA ARRIVAL DEBUG", JSON.stringify(debug));
      return null;
    });
    check("app renders the image when the blob arrives without a reload", !!appArrived);
    await screenshot(cdp, appSession, "18-media-pending-resolved.png");

    /* Toast inset: the sticky footer must stay above every visible toast. */
    await evaluate(cdp, appPanel.dockSession,
      "window.RLPanel.openDock(); window.RLPanel.setMode && window.RLPanel.setMode('idle'); window.RLPanel.open('list')");
    await waitFor(() => evaluate(cdp, appPanel.flyoutSession,
      "!!document.getElementById('rl-save-record')"), "list footer button", 8000);
    await waitFor(() => evaluate(cdp, appSession, `(() => {
      const f = document.getElementById('rl-flyout');
      if (!f) return null;
      const r = f.getBoundingClientRect();
      const style = getComputedStyle(f);
      return style.display !== 'none' && r.height > 100 ? true : null;
    })()`), "flyout visible and sized", 8000);
    await sleep(400);
    await evaluate(cdp, appPanel.flyoutSession,
      "document.getElementById('rl-fo-body').scrollTop = document.getElementById('rl-fo-body').scrollHeight");
    await sleep(300);
    const beforeToast = await evaluate(cdp, appSession, `(() => {
      const f = document.getElementById('rl-flyout').getBoundingClientRect();
      const t = document.getElementById('rl-toast-layer').getBoundingClientRect();
      const wrap = document.querySelector('iframe[src*="role=flyout"]');
      const body = document.querySelector('iframe[src*="role=flyout"]') ? null : null;
      return { flyout:{ top:f.top, bottom:f.bottom, height:f.height }, toast:{ top:t.top, bottom:t.bottom, height:t.height }, count:document.querySelectorAll('#rl-toast-layer > *').length };
    })()`);
    const panelLayout = () => evaluate(cdp, appPanel.flyoutSession, `(() => {
      const wrap = document.querySelector('.fo-body-wrap');
      const foot = document.getElementById('rl-save-record');
      return {
        bodyMax: wrap ? (wrap.style.maxHeight || '') : '',
        footerTop: foot ? foot.getBoundingClientRect().top : null,
        cardHeight: document.getElementById('rl-fo-card') ? document.getElementById('rl-fo-card').getBoundingClientRect().height : null
      };
    })()`);
    const beforePanel = await panelLayout();
    await screenshot(cdp, appSession, "18-toast-footer-before.png");
    for (let i = 0; i < 3; i += 1) {
      await evaluate(cdp, appPanel.flyoutSession, `window.parent.postMessage({
        source:'request-ledger-panel', type:'RL_TOAST',
        text:${JSON.stringify("This is a deliberately long notification that wraps onto more than one line so the measured inset follows the real toast height. ")},
        kind:${i === 2 ? "'error'" : "null"}, theme:${i === 1 ? "'dark'" : "'light'"}
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
    const duringPanel = await panelLayout();
    const footerBottomInPage = afterToast.flyout.top + (footerButton ? footerButton.bottom : afterToast.flyout.height);
    check("visible toasts stay inside the reserved zone",
      afterToast.toast.height <= 72.5 && afterToast.flyout.bottom <= afterToast.toast.top + 0.5,
      { before: beforeToast, after: afterToast });
    check("footer button stays above every visible toast",
      footerBottomInPage <= afterToast.toast.top - 2,
      { footerBottomInPage, toastTop: afterToast.toast.top, footerButton });
    await screenshot(cdp, appSession, "19-toast-footer-after.png");

    /* Toast hide must not grow the flyout back into the reserved zone. */
    await sleep(3600);
    await waitFor(() => evaluate(cdp, appSession,
      "document.querySelectorAll('#rl-toast-layer > *').length === 0"), "toast stack gone", 5000);
    const afterGone = await evaluate(cdp, appSession, `(() => {
      const f = document.getElementById('rl-flyout').getBoundingClientRect();
      const t = document.getElementById('rl-toast-layer').getBoundingClientRect();
      return { flyout:{ top:f.top, bottom:f.bottom, height:f.height }, toast:{ top:t.top, bottom:t.bottom, height:t.height }, count:document.querySelectorAll('#rl-toast-layer > *').length };
    })()`);
    const afterGonePanel = await panelLayout();
    const near = (a, b) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= 1;
    check("toast show/hide never changes the flyout geometry",
      near(beforeToast.flyout.top, afterToast.flyout.top) &&
      near(beforeToast.flyout.height, afterToast.flyout.height) &&
      near(beforeToast.flyout.top, afterGone.flyout.top) &&
      near(beforeToast.flyout.height, afterGone.flyout.height),
      { before: beforeToast.flyout, during: afterToast.flyout, after: afterGone.flyout });
    check("toast show/hide never changes body max-height or footer position",
      beforePanel.bodyMax === duringPanel.bodyMax &&
      beforePanel.bodyMax === afterGonePanel.bodyMax &&
      near(beforePanel.footerTop, duringPanel.footerTop) &&
      near(beforePanel.footerTop, afterGonePanel.footerTop),
      { before: beforePanel, during: duringPanel, after: afterGonePanel });

    /* Reduced motion: geometry must stay identical too. */
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }]
    }, appSession);
    await evaluate(cdp, appPanel.flyoutSession, `window.parent.postMessage({
      source:'request-ledger-panel', type:'RL_TOAST', text:'Reduced motion toast.', kind:null, theme:'dark'
    }, '*')`);
    await sleep(400);
    const reducedToast = await evaluate(cdp, appSession, `(() => {
      const f = document.getElementById('rl-flyout').getBoundingClientRect();
      const t = document.getElementById('rl-toast-layer').getBoundingClientRect();
      return { flyout:{ top:f.top, height:f.height, bottom:f.bottom }, toast:{ top:t.top, height:t.height } };
    })()`);
    check("toasts keep the flyout stable under reduced motion",
      near(afterGone.flyout.top, reducedToast.flyout.top) &&
      near(afterGone.flyout.height, reducedToast.flyout.height) &&
      reducedToast.flyout.bottom <= reducedToast.toast.top + 0.5,
      reducedToast);
    await cdp.send("Emulation.setEmulatedMedia", { features: [] }, appSession);
    await sleep(3200);

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

    /* Per-tab pin/theme isolation: preferences must not leak across tabs. */
    const tabAId = await evaluate(cdp, appPanel.flyoutSession, "window.__rlBridgePanel.tabId()");
    const tabBId = await evaluate(cdp, otherPanel.flyoutSession, "window.__rlBridgePanel.tabId()");
    check("Tab A and Tab B have different panel tab ids",
      tabAId > 0 && tabBId > 0 && tabAId !== tabBId, { tabAId, tabBId });

    const themeA = await evaluate(cdp, appPanel.flyoutSession,
      "document.documentElement.getAttribute('data-theme')");
    const themeBBefore = await evaluate(cdp, otherPanel.flyoutSession,
      "document.documentElement.getAttribute('data-theme')");
    await evaluate(cdp, otherPanel.dockSession, "document.getElementById('rl-theme-toggle').click()");
    const themeBAfter = await evaluate(cdp, otherPanel.flyoutSession,
      "document.documentElement.getAttribute('data-theme')");
    const tabBThemeStored = await evaluate(cdp, otherPanel.flyoutSession,
      `new Promise((resolve) => chrome.storage.session.get('rl-theme:${tabBId}', (value) => resolve(value['rl-theme:${tabBId}'] || '')))`);
    check("theme toggle on Tab B stays in Tab B",
      themeBAfter !== themeBBefore && tabBThemeStored === themeBAfter &&
      await evaluate(cdp, appPanel.flyoutSession,
        "document.documentElement.getAttribute('data-theme')") === themeA,
      { themeA, themeBBefore, themeBAfter, tabBThemeStored });

    const pinnedA = await evaluate(cdp, appPanel.dockSession,
      "document.getElementById('rl-pin').getAttribute('aria-pressed')");
    await evaluate(cdp, otherPanel.dockSession, "document.getElementById('rl-pin').click()");
    const pinnedB = await evaluate(cdp, otherPanel.dockSession,
      "document.getElementById('rl-pin').getAttribute('aria-pressed')");
    const tabBPinStored = await evaluate(cdp, otherPanel.flyoutSession,
      `new Promise((resolve) => chrome.storage.session.get('rl-pinned:${tabBId}', (value) => resolve(value['rl-pinned:${tabBId}'])))`);
    check("pin toggled on Tab B stays in Tab B",
      pinnedB === "true" && tabBPinStored === true &&
      await evaluate(cdp, appPanel.dockSession,
        "document.getElementById('rl-pin').getAttribute('aria-pressed')") === pinnedA,
      { pinnedA, pinnedB, tabBPinStored });

    /* A fresh tab starts with defaults and its keys vanish when it closes. */
    const thirdTarget = await cdp.send("Target.createTarget", { url: base + "/" + TARGET_PATH });
    const thirdSession = await attach(cdp, thirdTarget.targetId);
    await waitFor(() => evaluate(cdp, thirdSession,
      "!!document.getElementById('rl-host')"), "Tab C host", 25000);
    const thirdPanel = await openPanel(cdp, thirdSession);
    const tabCId = await evaluate(cdp, thirdPanel.flyoutSession,
      "window.__rlBridgePanel.tabId()");
    const thirdState = await evaluate(cdp, thirdPanel.flyoutSession, `(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      system: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }))()`);
    const thirdKeys = await evaluate(cdp, thirdPanel.flyoutSession,
      `new Promise((resolve) => chrome.storage.session.get(['rl-theme:${tabCId}', 'rl-pinned:${tabCId}'], (value) => resolve({ theme: value['rl-theme:${tabCId}'], pinned: value['rl-pinned:${tabCId}'] })))`);
    check("a new tab starts with the default pin and theme",
      tabCId > 0 && thirdState.theme === thirdState.system &&
      thirdKeys.theme === undefined && thirdKeys.pinned === undefined,
      { tabCId, thirdState, thirdKeys });
    await cdp.send("Target.closeTarget", { targetId: thirdTarget.targetId });
    await sleep(1200);
    const thirdKeysAfterClose = await evaluate(cdp, otherPanel.flyoutSession,
      `new Promise((resolve) => chrome.storage.session.get(['rl-theme:${tabCId}', 'rl-pinned:${tabCId}'], (value) => resolve({ theme: value['rl-theme:${tabCId}'], pinned: value['rl-pinned:${tabCId}'] })))`);
    check("closing a tab clears its pin and theme keys",
      thirdKeysAfterClose.theme === undefined && thirdKeysAfterClose.pinned === undefined,
      thirdKeysAfterClose);

    await createRequestInPanel(cdp, otherPanel.dockSession, otherPanel.flyoutSession,
      "Request from Tab B", "Created from the plain template tab.");
    /* A plain page must never show the red storage banner while the app is
       connected, and the panel write must land in the extension ledger. */
    const tabBStorage = await waitFor(async () => {
      const value = await evaluate(cdp, otherPanel.flyoutSession, `(() => {
        const banners = Array.from(document.querySelectorAll('#rl-storage-banner'));
        const reg = JSON.parse(localStorage.getItem('oz-projeler-v1') || 'null');
        const key = 'oz-istek-defteri-p-' + (reg && reg.activeId);
        const raw = key ? localStorage.getItem(key) : null;
        const ledger = raw ? JSON.parse(raw) : null;
        return {
          banners: banners.length,
          bannerHidden: banners.every((node) => node.hidden === true),
          hasRequest: !!(ledger && ledger.requests.some((item) => item.title === 'Request from Tab B'))
        };
      })()`);
      return value.hasRequest ? value : null;
    }, "Tab B request persisted", 10000);
    check("Tab B panel shows no storage-unavailable banner",
      tabBStorage.bannerHidden, tabBStorage);
    check("Tab B request persists in the extension ledger",
      tabBStorage.hasRequest, tabBStorage);
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

    /* Rail: a status dot + the port, and no stop action. */
    const railState = await evaluate(cdp, appSession, `(() => {
      const label = document.getElementById('railModeLabel');
      const dot = document.getElementById('railModeDot');
      return {
        stopButton: !!document.getElementById('railStopBtn'),
        label: label ? label.textContent : '',
        dotOn: dot ? dot.classList.contains('is-on') : false,
        server: window.__rlBridge && window.__rlBridge.connected()
      };
    })()`);
    check("rail shows a green status dot and the port with no stop button",
      railState.stopButton === false && railState.dotOn === true &&
      new RegExp("^:" + port + "$").test(railState.label), railState);

    /* External stop (equivalent to stop.cmd): the page keeps its data, and a
       restart with start.cmd + a reload restores the pair. */
    stopChild(server);
    server = null;
    await waitFor(async () => {
      try {
        const response = await fetch("http://127.0.0.1:" + port + "/__rl/status");
        return !response.ok;
      } catch (error) { return true; }
    }, "port free after external stop", 12000).catch(() => false);
    const keptData = await evaluate(cdp, appSession, `(() => {
      const raw = localStorage.getItem('oz-istek-defteri-p-${appProjectId}');
      const value = raw ? JSON.parse(raw) : null;
      return value && value.requests ? value.requests.length : 0;
    })()`);
    check("the open page keeps its ledger data when the server stops", keptData === 3, keptData);

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
      /* A stopped server cannot reload the page; the user refreshes after
         start.cmd, so the test does the same. */
      await cdp.send("Page.reload", {}, appSession);
      await sleep(3000);
      appSession = await attach(cdp, appTarget.targetId);
      await dismissOnboarding(cdp, appSession);
      await waitFor(() => evaluate(cdp, appSession,
        "window.__rlBridge && window.__rlBridge.connected()"), "app reconnects after restart", 25000);
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
