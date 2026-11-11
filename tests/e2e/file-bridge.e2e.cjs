#!/usr/bin/env node
"use strict";

/*
  File / loopback companion bridge E2E (CDP).

  Proves the two owner-facing modes that were previously excluded:
    - a file:// app page connects to the extension, the panel adopts the app
      project and requests, and pick/screenshot tools work;
    - the same handshake works from http://127.0.0.1:<port>;
    - no bridge warning is shown and a normal EN toast is English.

  Usage:
    node scripts/serve.cjs 8080        (in another terminal)
    node tests/e2e/file-bridge.e2e.cjs

  Exit code 0 = every check passed.
*/

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const pageErrors = require("./_page-errors.cjs");
const harness = require("./_harness.cjs");

const ROOT = path.resolve(__dirname, "..", "..");
const APP_FILE = path.join(ROOT, "index.html");
const EXT = path.join(ROOT, "dist", "extension");
const FILE_URL = pathToFileURL(APP_FILE).href;
let LOOPBACK_URL = "";
let TARGET_URL = "";
const SHOT_DIR = path.resolve(ROOT, "..", ".opencode", "workspace", "reports", "capture-tools");
const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const PORT = 9337;
const PROFILE = path.join(os.tmpdir(), "rl-file-bridge-e2e-profile");

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
  await harness.prepareSession(cdp, sessionId);
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
  while (Date.now() - started < Math.min(timeoutMs || 8000, 10000)) {
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

async function dismissConflict(cdp, pageSession) {
  for (let i = 0; i < 4; i += 1) {
    await evaluate(cdp, pageSession, `(() => {
      const modal = document.getElementById('confirmModal');
      if (modal && modal.classList.contains('is-open')) {
        const ok = document.getElementById('confirmOkBtn');
        if (ok) ok.click();
        return true;
      }
      return false;
    })()`);
    await sleep(350);
  }
}

async function dismissOnboarding(cdp, pageSession) {
  await evaluate(cdp, pageSession, `(() => {
    const modal = document.getElementById('onboardingModal');
    const done = document.getElementById('onboardingDoneBtn');
    if (modal && modal.classList.contains('is-open') && done) done.click();
    return true;
  })()`);
  await sleep(250);
}

async function openActiveProject(cdp, pageSession) {
  await waitFor(async () => {
    return evaluate(cdp, pageSession, `(() => {
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
  await dismissOnboarding(cdp, pageSession);
}

function seedLedger(name, ledgerId, title) {
  return JSON.stringify({
    version: 2, project: name, projectCreated: true, ledgerId,
    updatedAt: "2026-11-08T12:00:00.000Z", agents: [], language: "en", exportBehavior: "default",
    requests: [{
      id: "IST-001", type: "update", title, page: "", location: "",
      consoleError: "", description: "File and loopback bridge probe.", priority: "normal", link: "",
      sampleWebsite: "", note: "", images: [], attachments: [], confirmed: false,
      collapsed: false, createdAt: "2026-11-08T12:00:00.000Z", updatedAt: "2026-11-08T12:00:00.000Z"
    }]
  });
}

async function startTool(cdp, pageSession, action) {
  await evaluate(cdp, pageSession,
    "document.querySelector('[data-action=\"" + action + "\"]').click()");
  await waitFor(() => evaluate(cdp, pageSession,
    "document.getElementById('pickerTabsModal').classList.contains('is-open')"), "chooser " + action);
  await waitFor(async () => {
    const count = await evaluate(cdp, pageSession,
      "document.querySelectorAll('#pickerTabsBody .typechoice[data-tab-id]').length");
    return count > 0 ? count : null;
  }, "tab rows " + action);
  await evaluate(cdp, pageSession,
    "document.querySelector('#pickerTabsBody .typechoice[data-tab-id]').click()");
}

async function runMode(cdp, mode, url, name, ledgerId, screenshotName) {
  const target = await cdp.send("Target.createTarget", { url });
  let pageSession = await attach(cdp, target.targetId);
  await sleep(900);

  await evaluate(cdp, pageSession,
    "localStorage.setItem('rl-local-mode','1'); localStorage.removeItem('oz-projeler-v1'); localStorage.setItem('oz-istek-defteri-v1', " + JSON.stringify(seedLedger(name, ledgerId, name + " request")) + "); location.reload();");
  await sleep(2200);
  pageSession = await attach(cdp, target.targetId);
  await openActiveProject(cdp, pageSession);

  const bridgeState = await waitFor(() => evaluate(cdp, pageSession, `(() => {
    if (!window.__rlBridge) return null;
    return {
      enabled: window.__rlBridge.enabled(),
      connected: window.__rlBridge.connected(),
      projectId: window.__rlBridge.projectId()
    };
  })()`), mode + " page bridge");
  check(mode + " app reports the bridge enabled", bridgeState.enabled === true, bridgeState);
  check(mode + " bridge connects to the extension", bridgeState.connected === true, bridgeState);
  check(mode + " page enters companion mode", await evaluate(cdp, pageSession,
    "document.getElementById('rl-host') && document.getElementById('rl-host').getAttribute('data-companion') === '1'") === true);
  check(mode + " page shows no bridge warning", await evaluate(cdp, pageSession,
    "!/does not allow the bridge|köprüye izin vermiyor/i.test(document.body.innerText)"));

  const opened = await openPanel(cdp, pageSession);
  await waitFor(() => evaluate(cdp, opened.flyoutSession,
    "window.__rlBridgePanel && window.__rlBridgePanel.connected()"), mode + " panel connected", 20000);
  await sleep(900);
  check(mode + " bridge adoption does not auto-open a section",
    await evaluate(cdp, opened.flyoutSession, "document.body.getAttribute('data-section') === null"));
  const panelProject = await waitFor(async () => {
    const id = await evaluate(cdp, opened.flyoutSession, "window.__rlBridgePanel.projectId()");
    return id === bridgeState.projectId ? id : null;
  }, mode + " panel project", 20000);
  check(mode + " panel adopts the app project", panelProject === bridgeState.projectId, {
    app: bridgeState.projectId, panel: panelProject
  });
  /* The two probe modes run in one extension profile. If the second app
     presents a different ledger, resolve the normal conflict with the app
     ledger so the screenshot shows the connected project, not the chooser. */
  await sleep(500);
  await dismissConflict(cdp, pageSession);
  await evaluate(cdp, opened.dockSession, "document.querySelector('[data-section=\"list\"]').click()");
  await sleep(700);
  check(mode + " panel shows the app project and request", await waitFor(async () => {
    const text = await evaluate(cdp, opened.flyoutSession, "document.body.innerText");
    return text.indexOf(name) >= 0 && text.indexOf(name + " request") >= 0 ? text : null;
  }, mode + " panel request"));
  const layout = await evaluate(cdp, opened.flyoutSession, `(() => {
    const box = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top:r.top, bottom:r.bottom, height:r.height };
    };
    return {
      projects:box('.archive__projects'),
      tabs:box('.archive-tabs'),
      tabStrips:document.querySelectorAll('.archive-tabs').length,
      pane:box('[data-archive-pane="list"]'),
      progress:box('#rl-list-progress'),
      row:box('.rrow'),
      body:box('#rl-sec-body')
    };
  })()`);
  check(mode + " list layout has no Projects block above the tab strip",
    layout.tabStrips === 1 && layout.projects === null && layout.tabs,
    layout);
  check(mode + " list pane is below the tab strip and shows a row",
    layout.pane && layout.pane.top >= layout.tabs.bottom - 1 && layout.row && layout.row.top >= layout.progress.bottom - 1,
    layout);
  if(mode === "file://"){
    await cdp.send("Page.bringToFront", {}, pageSession);
    await sleep(250);
    await screenshot(cdp, pageSession, "09-panel-list-layout.png");
  }

  const targetTab = await cdp.send("Target.createTarget", { url: TARGET_URL });
  const targetSession = await attach(cdp, targetTab.targetId);
  await waitFor(() => evaluate(cdp, targetSession, "!!document.getElementById('rl-host')"), mode + " target dock");
  await cdp.send("Target.activateTarget", { targetId: target.targetId });
  await sleep(500);

  await startTool(cdp, pageSession, "pick-element");
  await waitFor(() => evaluate(cdp, targetSession, "!!document.querySelector('[data-rl-picker]')"), mode + " picker overlay");
  check(mode + " element picker opens", true);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, targetSession);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, targetSession);
  await waitFor(() => evaluate(cdp, pageSession,
    "!document.getElementById('pickerTabsModal').classList.contains('is-open')"), mode + " picker cancel");

  await startTool(cdp, pageSession, "capture-tab");
  await waitFor(() => evaluate(cdp, targetSession, "!!document.querySelector('[data-rl-crop]')"), mode + " crop overlay");
  check(mode + " screenshot overlay opens", true);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 240, y: 220, buttons: 0 }, targetSession);
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: 240, y: 220, button: "left", buttons: 1, clickCount: 1 }, targetSession);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 420, y: 330, button: "left", buttons: 1 }, targetSession);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 420, y: 330, button: "left", buttons: 0, clickCount: 1 }, targetSession);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }, targetSession);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }, targetSession);
  let attachment = null;
  try{
    attachment = await waitFor(async () => {
      const value = await evaluate(cdp, pageSession, `(() => {
        const reg = JSON.parse(localStorage.getItem('oz-projeler-v1') || 'null');
        const raw = reg && reg.activeId ? localStorage.getItem('oz-istek-defteri-p-' + reg.activeId) : null;
        const st = raw ? JSON.parse(raw) : null;
        const item = st && st.requests ? st.requests[0] : null;
        return item ? { page:item.page, images:(item.images || []).length } : null;
      })()`);
      return value && value.page && value.images >= 1 ? value : null;
    }, mode + " screenshot result");
  }catch(error){
    console.log("screenshot failure snapshot", mode, JSON.stringify({
      page: await evaluate(cdp, pageSession, `(() => {
        const reg = JSON.parse(localStorage.getItem('oz-projeler-v1') || 'null');
        const raw = reg && reg.activeId ? localStorage.getItem('oz-istek-defteri-p-' + reg.activeId) : null;
        const st = raw ? JSON.parse(raw) : null;
        const item = st && st.requests ? st.requests[0] : null;
        return item ? { page:item.page, images:(item.images || []).length } : null;
      })()`),
      body: await evaluate(cdp, pageSession, "document.body.innerText.slice(-300)")
    }));
    throw error;
  }
  check(mode + " screenshot attaches an image and fills Page",
    attachment.images === 1 && attachment.page === "/tests/fixtures/picker-target.html", attachment);

  /* EN toast: empty save, no Turkish characters in the visible toast. */
  await evaluate(cdp, pageSession, `(() => {
    const btn = document.getElementById('clearRequestsBtn');
    if (btn) btn.click();
    return true;
  })()`);
  await waitFor(() => evaluate(cdp, pageSession,
    "document.getElementById('confirmModal').classList.contains('is-open')"), "clear confirm");
  await evaluate(cdp, pageSession, "document.getElementById('confirmOkBtn').click()");
  await sleep(700);
  const clearToast = await evaluate(cdp, pageSession, "(document.getElementById('toastText') || {}).textContent || ''");
  check(mode + " empty clear toast is English",
    clearToast === "Ledger cleared. Records, Drafts and Exported were kept.", clearToast);
  await evaluate(cdp, pageSession, "document.getElementById('saveRecordBtn').click()");
  await sleep(500);
  const toast = await evaluate(cdp, pageSession, "(document.getElementById('toastText') || {}).textContent || ''");
  check(mode + " empty save toast is English", toast === "There are no requests to save.", toast);

  await dismissConflict(cdp, pageSession);
  await evaluate(cdp, opened.dockSession, "document.querySelector('[data-section=\"list\"]').click()").catch(() => {});
  await sleep(600);
  await cdp.send("Page.bringToFront", {}, pageSession);
  await sleep(300);
  await screenshot(cdp, pageSession, screenshotName);

  /* Empty load toast: seed one record with no requests, open it and press
     Load. The disabled button is enabled only for this probe so the product
     guard still runs and produces its normal toast. */
  await evaluate(cdp, pageSession, `new Promise((resolve) => {
    const reg = JSON.parse(localStorage.getItem('oz-projeler-v1') || 'null');
    const projectId = reg && reg.activeId;
    const open = indexedDB.open('oz-istek-defteri', 5);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath:'id' });
    };
    open.onerror = () => resolve(false);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('records', 'readwrite');
      tx.objectStore('records').put({
        id:'rec_empty_probe', kind:'record', projectId, ledgerId:'ledger_empty_probe',
        project:${JSON.stringify(name)}, name:'Empty record', requests:[],
        savedAt:'2026-11-08T12:00:00.000Z', requestCount:0, imageCount:0, fileCount:0,
        signature:'', complete:true, exported:false
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    };
  })`);
  await evaluate(cdp, pageSession, "location.reload()");
  await sleep(2200);
  pageSession = await attach(cdp, target.targetId);
  await openActiveProject(cdp, pageSession);
  await evaluate(cdp, pageSession, "document.getElementById('historyBtn').click()");
  await sleep(350);
  await evaluate(cdp, pageSession, "document.querySelector('[data-htab=\"records\"]').click()");
  await waitFor(() => evaluate(cdp, pageSession,
    "!!document.querySelector('.hitem[data-snapshot-id=\"rec_empty_probe\"]')"), mode + " empty record");
  await evaluate(cdp, pageSession, "document.querySelector('.hitem[data-snapshot-id=\"rec_empty_probe\"]').click()");
  await waitFor(() => evaluate(cdp, pageSession,
    "document.getElementById('historyModal').classList.contains('is-open')"), mode + " record detail");
  await evaluate(cdp, pageSession, `(() => {
    const btn = document.getElementById('snapshotLoadBtn');
    btn.disabled = false;
    btn.click();
    return true;
  })()`);
  await sleep(450);
  const loadToast = await evaluate(cdp, pageSession, "(document.getElementById('toastText') || {}).textContent || ''");
  check(mode + " empty load toast is English",
    loadToast === "This record has no requests to load.", loadToast);

  await cdp.send("Target.closeTarget", { targetId: targetTab.targetId });
  await cdp.send("Target.closeTarget", { targetId: target.targetId });
  await sleep(500);
  return opened;
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
  const localServer = await harness.startServer(ROOT);
  LOOPBACK_URL = "http://127.0.0.1:" + localServer.port + "/index.html";
  TARGET_URL = "http://127.0.0.1:" + localServer.port + "/tests/fixtures/picker-target.html";

  fs.rmSync(PROFILE, { recursive: true, force: true });

  const chrome = spawn(
    chromePath(),
    [
      "--user-data-dir=" + PROFILE,
      "--enable-unsafe-extension-debugging",
      "--allow-file-access-from-files",
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
    harness.install(cdp);
    const loaded = await cdp.send("Extensions.loadUnpacked", { path: EXT });
    check("extension loads with the pinned id", loaded.id === "hapajcbgcfllhkiohhkechekajencdod", loaded);

    await runMode(cdp, "file://", FILE_URL, "File Bridge App", "ledger_file_bridge", "07-file-bridge-connected.png");
    await runMode(cdp, "127.0.0.1", LOOPBACK_URL, "Loopback Bridge App", "ledger_loopback_bridge", "08-loopback-bridge-connected.png");

    const pageFailures = pageErrors.collect(cdp);
check("no page reference/console errors", pageFailures.length === 0, pageFailures.slice(0, 3));
const errors = cdp.events.filter((event) => event.method === "Runtime.exceptionThrown");
    check("no uncaught errors in file/loopback bridge flow", errors.length === 0,
      errors.slice(0, 3).map((event) => (event.params.exceptionDetails || {}).text));
  } finally {
    try { localServer.stop(); } catch (error) { /* ignore */ }
    try { chrome.kill(); } catch (error) { /* ignore */ }
  }
  harness.cleanRuntime(ROOT);

  const failed = checks.filter((entry) => !entry.ok);
  console.log("\n" + (checks.length - failed.length) + "/" + checks.length + " checks passed");
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error("FILE BRIDGE E2E ERROR:", error.message);
  process.exit(1);
});
