#!/usr/bin/env node
"use strict";

/*
  Project/ledger consistency E2E.

  Reproduces the owner's two-project state:
    - app and extension registries share project ids;
    - Test Project has one request, the legacy "Ortak Zemin" project has
      another;
    - reload restores the active project and its own ledger;
    - the panel list always matches the open project;
    - legacy "Ortak Zemin" is renamed to "Imported project" and stays usable;
    - a same-project ledger conflict asks, while a different-project ledger
      difference never produces a global conflict;
    - choosing either ledger never erases the other project's requests.

  Usage:
    node scripts/serve.cjs 8080
    node tests/e2e/project-consistency.e2e.cjs
*/

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const EXT = path.join(ROOT, "dist", "extension");
const WEB_URL = "http://localhost:8080/index.html";
const TARGET_URL = "http://localhost:8080/tests/fixtures/picker-target.html";
const SHOT_DIR = path.resolve(ROOT, "..", ".opencode", "workspace", "reports", "bridge-fixes");
const EXT_ID = "hapajcbgcfllhkiohhkechekajencdod";
const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const PORT = 9339;
const PROFILE = path.join(os.tmpdir(), "rl-project-consistency-e2e-profile");

const STAMP = "2026-11-09T10:00:00.000Z";
const P_TEST = "prj_test_project";
const P_LEGACY = "prj_legacy_project";
const L_TEST = "ledger_test_project";
const L_LEGACY = "ledger_legacy_project";

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
  } catch (error) { return false; }
}

function request(id, title, description) {
  return {
    id, type: "update", title, page: "", location: "", consoleError: "",
    description: description || title, priority: "normal", link: "", sampleWebsite: "", note: "",
    images: [], attachments: [], confirmed: false, collapsed: true,
    createdAt: STAMP, updatedAt: STAMP
  };
}

function ledger(project, ledgerId, requests) {
  return {
    version: 2, project, projectCreated: true, ledgerId, updatedAt: STAMP,
    requests, agents: [], language: "en", exportBehavior: "default", lastExport: null
  };
}

function registry(activeId) {
  return {
    version: 1,
    activeId,
    projects: [
      { id: P_TEST, name: "Test Project", createdAt: STAMP, updatedAt: STAMP, exportTarget: "", archiveCollapsed: false },
      { id: P_LEGACY, name: "Ortak Zemin", createdAt: STAMP, updatedAt: STAMP, exportTarget: "", archiveCollapsed: false }
    ]
  };
}

function seedExpression(activeId, testRequests, legacyRequests, testLedgerId) {
  return `(() => {
    localStorage.setItem('oz-projeler-v1', ${JSON.stringify(JSON.stringify(registry(activeId)))});
    localStorage.setItem('oz-istek-defteri-p-${P_TEST}', ${JSON.stringify(JSON.stringify(ledger("Test Project", testLedgerId || L_TEST, testRequests)))});
    localStorage.setItem('oz-istek-defteri-p-${P_LEGACY}', ${JSON.stringify(JSON.stringify(ledger("Ortak Zemin", L_LEGACY, legacyRequests)))});
    return true;
  })()`;
}

async function extensionStorage(cdp, actionExpression) {
  const target = await cdp.send("Target.createTarget", { url: "chrome-extension://" + EXT_ID + "/panel/panel.html?role=flyout" });
  const session = await attach(cdp, target.targetId);
  await sleep(1200);
  const value = await evaluate(cdp, session, actionExpression);
  await cdp.send("Target.closeTarget", { targetId: target.targetId });
  await sleep(300);
  return value;
}

async function seedExtension(cdp, activeId, testRequests, legacyRequests, testLedgerId) {
  return extensionStorage(cdp, seedExpression(activeId, testRequests, legacyRequests, testLedgerId));
}

function readExtension(cdp) {
  return extensionStorage(cdp, `(() => {
    const reg = JSON.parse(localStorage.getItem('oz-projeler-v1') || 'null');
    const read = (id) => {
      const raw = localStorage.getItem('oz-istek-defteri-p-' + id);
      return raw ? JSON.parse(raw) : null;
    };
    return {
      registry: reg,
      test: read(${JSON.stringify(P_TEST)}),
      legacy: read(${JSON.stringify(P_LEGACY)})
    };
  })()`);
}

function readApp(cdp, sessionId) {
  return evaluate(cdp, sessionId, `(() => {
    const reg = JSON.parse(localStorage.getItem('oz-projeler-v1') || 'null');
    const read = (id) => {
      const raw = localStorage.getItem('oz-istek-defteri-p-' + id);
      return raw ? JSON.parse(raw) : null;
    };
    return {
      registry: reg,
      activeId: reg && reg.activeId,
      test: read(${JSON.stringify(P_TEST)}),
      legacy: read(${JSON.stringify(P_LEGACY)})
    };
  })()`);
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

async function openProject(cdp, pageSession, projectId) {
  await evaluate(cdp, pageSession, `(() => {
    const picker = document.getElementById('projectPicker');
    if (!picker || picker.hidden) {
      const sw = document.getElementById('projectsSwitchBtn');
      if (sw) sw.click();
    }
    return true;
  })()`);
  await waitFor(() => evaluate(cdp, pageSession,
    "document.getElementById('projectPicker') && !document.getElementById('projectPicker').hidden"), "project picker");
  await evaluate(cdp, pageSession,
    "document.querySelector('#projectPickerList [data-project-id=\"" + projectId + "\"]').click()");
  await sleep(900);
}

async function openPanel(cdp, pageSession) {
  await evaluate(cdp, pageSession, `(() => {
    const b = document.getElementById('rl-launcher');
    if (b && !b.hidden) { b.click(); return true; }
    return true;
  })()`);
  await sleep(800);
  const targets = await waitFor(async () => {
    const current = await cdp.send("Target.getTargets");
    const dock = current.targetInfos.find((t) => t.url.includes("role=dock"));
    const flyout = current.targetInfos.find((t) => t.url.includes("role=flyout"));
    return dock && flyout ? { dock, flyout } : null;
  }, "panel iframes");
  const dockSession = await attach(cdp, targets.dock.targetId);
  const flyoutSession = await attach(cdp, targets.flyout.targetId);
  return { dockSession, flyoutSession };
}

async function openList(cdp, dockSession) {
  await evaluate(cdp, dockSession, "document.querySelector('[data-section=\"list\"]').click()");
  await sleep(700);
}

async function closeList(cdp, dockSession) {
  await evaluate(cdp, dockSession, "window.RLPanel.close()");
  await sleep(600);
}

async function createRequestInOtherPanel(cdp, targetUrl, title, description) {
  const before = await cdp.send("Target.getTargets");
  const known = new Set(before.targetInfos.map((target) => target.targetId));
  const target = await cdp.send("Target.createTarget", { url: targetUrl });
  const pageSession = await attach(cdp, target.targetId);
  await waitFor(() => evaluate(cdp, pageSession, "!!document.getElementById('rl-host')"), "other tab dock", 20000);
  const targets = await waitFor(async () => {
    const current = await cdp.send("Target.getTargets");
    const dock = current.targetInfos.find((t) => t.url.includes("role=dock") && !known.has(t.targetId));
    const flyout = current.targetInfos.find((t) => t.url.includes("role=flyout") && !known.has(t.targetId));
    return dock && flyout ? { dock, flyout } : null;
  }, "other tab panel");
  const dockSession = await attach(cdp, targets.dock.targetId);
  const flyoutSession = await attach(cdp, targets.flyout.targetId);
  await waitFor(() => evaluate(cdp, dockSession,
    "!!document.querySelector('[data-section=\"new\"]')"), "other new button", 20000);
  await evaluate(cdp, dockSession, "document.querySelector('[data-section=\"new\"]').click()");
  await waitFor(() => evaluate(cdp, flyoutSession, "!!document.getElementById('rl-new-title')"), "other new form");
  await evaluate(cdp, flyoutSession, `(() => {
    const input = document.getElementById('rl-new-title');
    input.value = ${JSON.stringify(title)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-act="create"]').click();
  })()`);
  await sleep(700);
  await evaluate(cdp, flyoutSession, "document.querySelector('[data-act=\"save-section\"]').click()");
  await waitFor(() => evaluate(cdp, flyoutSession, "!!document.getElementById('rl-desc-input')"), "other desc step");
  await evaluate(cdp, flyoutSession, `(() => {
    const input = document.getElementById('rl-desc-input');
    input.value = ${JSON.stringify(description)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-act="save-section"]').click();
  })()`);
  await sleep(1200);
  await cdp.send("Target.closeTarget", { targetId: target.targetId });
  await sleep(300);
}

function panelState(cdp, flyoutSession) {
  return evaluate(cdp, flyoutSession, `(() => ({
    project: window.__rlBridgePanel && window.__rlBridgePanel.projectName(),
    projectId: window.__rlBridgePanel && window.__rlBridgePanel.projectId(),
    connected: window.__rlBridgePanel && window.__rlBridgePanel.connected(),
    rows: Array.from(document.querySelectorAll('.rrow')).map((row) => row.innerText.replace(/\\s+/g, ' ').trim()),
    projectCount: (document.getElementById('rl-project-count') || {}).textContent || '',
    listCount: (document.querySelector('[data-archive-count="list"]') || {}).textContent || '',
    progress: (document.querySelector('#rl-list-progress .lp-text') || {}).textContent || '',
    importedCard: Array.from(document.querySelectorAll('.project-row')).some((row) => /Imported project/.test(row.innerText)),
    oldCard: Array.from(document.querySelectorAll('.project-row')).some((row) => /Ortak Zemin|Common Ground/.test(row.innerText))
  }))()`);
}

async function main() {
  if (!fs.existsSync(path.join(EXT, "manifest.json"))) throw new Error("dist/extension missing");
  const ping = await fetch(WEB_URL).catch(() => null);
  if (!ping || !ping.ok) throw new Error("local server not running on :8080");

  fs.rmSync(PROFILE, { recursive: true, force: true });
  const chrome = spawn(chromePath(), [
    "--user-data-dir=" + PROFILE,
    "--enable-unsafe-extension-debugging",
    "--remote-debugging-port=" + PORT,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-search-engine-choice-screen",
    "--window-size=1280,900",
    "about:blank",
  ], { stdio: "ignore" });

  try {
    const version = await waitEndpoint(PORT, 20000);
    const cdp = new CDP(version.webSocketDebuggerUrl);
    const loaded = await cdp.send("Extensions.loadUnpacked", { path: EXT });
    check("extension loads with the pinned id", loaded.id === EXT_ID, loaded);

    const testRequests = [request("IST-001", "Project One request")];
    const legacyRequests = [request("IST-002", "Legacy request")];
    await seedExtension(cdp, P_TEST, testRequests, legacyRequests, L_TEST);

    const pageTarget = await cdp.send("Target.createTarget", { url: WEB_URL });
    let pageSession = await attach(cdp, pageTarget.targetId);
    await sleep(700);
    await evaluate(cdp, pageSession, seedExpression(P_TEST, testRequests, legacyRequests, L_TEST) + "; location.reload();");
    await sleep(2200);
    pageSession = await attach(cdp, pageTarget.targetId);
    await dismissOnboarding(cdp, pageSession);

    await waitFor(() => evaluate(cdp, pageSession,
      "window.__rlBridge && window.__rlBridge.projectId() === " + JSON.stringify(P_TEST)), "app restores Test Project", 15000);
    const appLoaded = await readApp(cdp, pageSession);
    check("reload restores the active project", appLoaded.activeId === P_TEST, appLoaded);
    check("app loads only its own project ledger",
      appLoaded.test.requests.length === 1 &&
      appLoaded.test.requests[0].title === "Project One request" &&
      appLoaded.legacy.requests[0].title === "Legacy request", appLoaded);
    check("app renames the legacy default project",
      appLoaded.registry.projects.find((item) => item.id === P_LEGACY).name === "Imported project", appLoaded.registry);
    check("app renders only Test Project's request",
      await evaluate(cdp, pageSession, `(() => {
        const text = Array.from(document.querySelectorAll('.req')).map((row) => row.innerText).join(' ');
        return /Project One request/.test(text) && !/Legacy request/.test(text);
      })()`) === true);

    let opened = await openPanel(cdp, pageSession);
    await waitFor(() => evaluate(cdp, opened.flyoutSession,
      "window.__rlBridgePanel && window.__rlBridgePanel.connected()"), "panel connected", 20000);
    await openList(cdp, opened.dockSession);
    const panelOne = await waitFor(async () => {
      const state = await panelState(cdp, opened.flyoutSession);
      return state.projectId === P_TEST && state.rows.length === 1 ? state : null;
    }, "panel Test Project list", 15000);
    check("panel opens the same project id", panelOne.projectId === P_TEST, panelOne);
    check("panel list contains only Test Project's request",
      panelOne.rows.some((row) => /Project One request/.test(row)) &&
      !panelOne.rows.some((row) => /Legacy request/.test(row)), panelOne.rows);
    check("panel project/tab/progress counts agree",
      panelOne.projectCount === "2" && panelOne.listCount === "1" && /0 \/ 1 ready|0 \/ 1 hazır/.test(panelOne.progress), panelOne);
    check("legacy default name was renamed in the panel",
      panelOne.importedCard === true && panelOne.oldCard === false, panelOne);
    check("different projects never show the global conflict dialog",
      await evaluate(cdp, pageSession, "!document.getElementById('confirmModal').classList.contains('is-open')") === true);
    await screenshot(cdp, pageSession, "03-two-projects-test-project.png");

    /* Close the app tab's panel, then create a request from the panel on
       another tab. The app tab is backgrounded; bridge/storage traffic must
       update it without opening any section in the app window. */
    await closeList(cdp, opened.dockSession);
    await waitFor(() => evaluate(cdp, opened.flyoutSession,
      "document.body.getAttribute('data-section') === null"), "app panel stays closed");
    check("app panel is hidden before the other-tab edit",
      await evaluate(cdp, pageSession, "document.getElementById('rl-flyout').style.display === 'none'") === true);

    await createRequestInOtherPanel(cdp, TARGET_URL, "Background request", "Created from another tab.");
    const backgroundStart = Date.now();
    const backgroundUpdate = await waitFor(async () => {
      const value = await readApp(cdp, pageSession);
      return value.test.requests.length === 2 &&
        value.test.requests.some((item) => item.title === "Background request") ? value : null;
    }, "background panel edit reaches the app", 5000);
    const backgroundElapsed = Date.now() - backgroundStart;
    check("background panel edit reaches the app", backgroundUpdate.test.requests.length === 2, backgroundUpdate);
    check("background panel edit reaches the app within 1 s", backgroundElapsed < 1000, backgroundElapsed);
    const closedState = {
      section: await evaluate(cdp, opened.flyoutSession, "document.body.getAttribute('data-section')"),
      display: await evaluate(cdp, pageSession, "document.getElementById('rl-flyout').style.display")
    };
    check("bridge traffic keeps the app-window panel closed",
      closedState.section === null && closedState.display === "none", closedState);
    check("app renders the background request without a reload",
      await evaluate(cdp, pageSession,
        "Array.from(document.querySelectorAll('.req')).some((row) => /Background request/.test(row.innerText))") === true);

    await cdp.send("Target.activateTarget", { targetId: pageTarget.targetId });
    await openList(cdp, opened.dockSession);
    const panelBackground = await waitFor(async () => {
      const state = await panelState(cdp, opened.flyoutSession);
      return state.rows.length === 2 ? state : null;
    }, "panel list after background edit", 15000);
    check("panel list and counts include the background request",
      panelBackground.rows.some((row) => /Background request/.test(row)) &&
      panelBackground.listCount === "2" && panelBackground.projectCount === "2", panelBackground);

    /* Exact owner sequence: reload the app while Test Project has the panel-
       created request. No conflict, same project ledger id, rows intact. */
    await cdp.send("Page.reload", {}, pageSession);
    await sleep(2400);
    pageSession = await attach(cdp, pageTarget.targetId);
    await dismissOnboarding(cdp, pageSession);
    await waitFor(() => evaluate(cdp, pageSession,
      "window.__rlBridge && window.__rlBridge.projectId() === " + JSON.stringify(P_TEST)), "Test Project after background reload", 15000);
    const afterBackgroundReload = await readApp(cdp, pageSession);
    const extensionAfterReload = await readExtension(cdp);
    check("background request survives the app reload",
      afterBackgroundReload.activeId === P_TEST &&
      afterBackgroundReload.test.requests.some((item) => item.title === "Background request") &&
      afterBackgroundReload.legacy.requests.some((item) => item.title === "Legacy request"), afterBackgroundReload);
    check("reload keeps one ledger id for Test Project",
      afterBackgroundReload.test.ledgerId === extensionAfterReload.test.ledgerId, {
        app: afterBackgroundReload.test.ledgerId,
        panel: extensionAfterReload.test.ledgerId
      });
    check("background reload shows no conflict modal",
      await evaluate(cdp, pageSession, "!document.getElementById('confirmModal').classList.contains('is-open')") === true);
    opened = await openPanel(cdp, pageSession);

    /* Switch to the legacy project while the app-window panel is closed.
       Bridge adoption must not open it. */
    await openProject(cdp, pageSession, P_LEGACY);
    await waitFor(() => evaluate(cdp, pageSession,
      "window.__rlBridge && window.__rlBridge.projectId() === " + JSON.stringify(P_LEGACY)), "app legacy project", 15000);
    await waitFor(() => evaluate(cdp, opened.flyoutSession,
      "window.__rlBridgePanel && window.__rlBridgePanel.projectId() === " + JSON.stringify(P_LEGACY)), "panel legacy project", 15000);
    check("project switch does not open the closed app-window panel",
      await evaluate(cdp, opened.flyoutSession, "document.body.getAttribute('data-section') === null") === true &&
      await evaluate(cdp, pageSession, "document.getElementById('rl-flyout').style.display === 'none'") === true);
    await openList(cdp, opened.dockSession);
    await waitFor(() => evaluate(cdp, pageSession,
      "Array.from(document.querySelectorAll('.req')).some((row) => /Legacy request/.test(row.innerText))"), "app legacy row");
    check("app list follows the switched project", true);
    const panelLegacy = await waitFor(async () => {
      const state = await panelState(cdp, opened.flyoutSession);
      return state.projectId === P_LEGACY && state.rows.length === 1 ? state : null;
    }, "panel legacy list", 15000);
    check("panel list replaces rows when switching projects",
      panelLegacy.rows.some((row) => /Legacy request/.test(row)) &&
      !panelLegacy.rows.some((row) => /Project One request/.test(row)), panelLegacy.rows);
    check("legacy project remains a normal project card",
      panelLegacy.projectCount === "2" && panelLegacy.importedCard === true, panelLegacy);
    await screenshot(cdp, pageSession, "04-two-projects-imported-project.png");

    /* Reload while the legacy project is active. */
    await cdp.send("Page.reload", {}, pageSession);
    await sleep(2400);
    pageSession = await attach(cdp, pageTarget.targetId);
    await dismissOnboarding(cdp, pageSession);
    await waitFor(() => evaluate(cdp, pageSession,
      "window.__rlBridge && window.__rlBridge.projectId() === " + JSON.stringify(P_LEGACY)), "legacy project after reload", 15000);
    check("app shows the legacy project's own request after reload",
      await evaluate(cdp, pageSession,
        "Array.from(document.querySelectorAll('.req')).some((row) => /Legacy request/.test(row.innerText)) && !Array.from(document.querySelectorAll('.req')).some((row) => /Project One request/.test(row.innerText))") === true);
    const appReload = await readApp(cdp, pageSession);
    check("reload restores the last active project and ledger",
      appReload.activeId === P_LEGACY && appReload.legacy.requests.length === 1 &&
      appReload.test.requests[0].title === "Project One request", appReload);
    check("reload does not show a global conflict",
      await evaluate(cdp, pageSession, "!document.getElementById('confirmModal').classList.contains('is-open')") === true);

    /* Same-project ledger conflict: app and panel Test Project have distinct
       ledgers. A global dialog is correct here, but only for that project. */
    await openProject(cdp, pageSession, P_TEST);
    await waitFor(() => evaluate(cdp, pageSession,
      "window.__rlBridge && window.__rlBridge.projectId() === " + JSON.stringify(P_TEST)), "app back to test project", 15000);
    await seedExtension(cdp, P_TEST, [request("IST-003", "Extension-only request")], legacyRequests, "ledger_ext_conflict");
    await cdp.send("Page.reload", {}, pageSession);
    await sleep(2400);
    pageSession = await attach(cdp, pageTarget.targetId);
    await waitFor(() => evaluate(cdp, pageSession,
      "document.getElementById('confirmModal').classList.contains('is-open')"), "same-project conflict dialog", 15000);
    check("same-project ledger difference asks for a choice", true);
    await evaluate(cdp, pageSession, "document.getElementById('confirmOkBtn').click()");
    await sleep(1600);
    const afterAppChoice = await readExtension(cdp);
    check("Use app ledger replaces only the same project",
      afterAppChoice.test.requests.some((item) => item.title === "Project One request") &&
      !afterAppChoice.test.requests.some((item) => item.title === "Extension-only request") &&
      afterAppChoice.legacy.requests.some((item) => item.title === "Legacy request"), afterAppChoice);

    /* The opposite choice must keep the app's other project intact too. */
    await seedExtension(cdp, P_TEST, [request("IST-004", "Extension winner request")], legacyRequests, "ledger_ext_winner");
    await cdp.send("Page.reload", {}, pageSession);
    await sleep(2400);
    pageSession = await attach(cdp, pageTarget.targetId);
    await waitFor(() => evaluate(cdp, pageSession,
      "document.getElementById('confirmModal').classList.contains('is-open')"), "second conflict dialog", 15000);
    await evaluate(cdp, pageSession, "document.getElementById('confirmAltBtn').click()");
    await sleep(1600);
    const afterExtChoice = await readApp(cdp, pageSession);
    check("Use extension ledger replaces only the same project",
      afterExtChoice.test.requests.some((item) => item.title === "Extension winner request") &&
      afterExtChoice.legacy.requests.some((item) => item.title === "Legacy request"), afterExtChoice);
    const extensionAfterChoice = await readExtension(cdp);
    check("the chosen ledger id is persisted in both registries",
      afterExtChoice.registry.projects.find((item) => item.id === P_TEST).ledgerId === afterExtChoice.test.ledgerId &&
      extensionAfterChoice.registry.projects.find((item) => item.id === P_TEST).ledgerId === extensionAfterChoice.test.ledgerId &&
      afterExtChoice.test.ledgerId === extensionAfterChoice.test.ledgerId, {
        appRegistry: afterExtChoice.registry,
        panelRegistry: extensionAfterChoice.registry
      });

    /* Exact owner defect: type in the app after the choice. A first keystroke
       must only save/patch; it must never open "Two ledgers found". */
    const typed = await evaluate(cdp, pageSession, `(() => {
      const input = document.getElementById('title-IST-004');
      if (!input) return false;
      input.value = 'Extension winner request typed';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(1200);
    const afterTyping = await readApp(cdp, pageSession);
    check("typing in the app does not open a conflict dialog",
      typed === true && await evaluate(cdp, pageSession,
        "!document.getElementById('confirmModal').classList.contains('is-open')") === true);
    check("typing keeps the chosen ledger id",
      afterTyping.test.ledgerId === extensionAfterChoice.test.ledgerId, {
        app: afterTyping.test.ledgerId,
        panel: extensionAfterChoice.test.ledgerId
      });

    /* Reload after the typed write: the same choice must survive with no
       prompt, and both projects must still be intact. */
    await cdp.send("Page.reload", {}, pageSession);
    await sleep(2400);
    pageSession = await attach(cdp, pageTarget.targetId);
    await dismissOnboarding(cdp, pageSession);
    await waitFor(() => evaluate(cdp, pageSession,
      "window.__rlBridge && window.__rlBridge.projectId() === " + JSON.stringify(P_TEST)), "test project after typed reload", 15000);
    const typedReload = await readApp(cdp, pageSession);
    check("typed data survives reload without a conflict",
      typedReload.test.requests.some((item) => item.title === "Extension winner request typed") &&
      typedReload.legacy.requests.some((item) => item.title === "Legacy request") &&
      await evaluate(cdp, pageSession,
        "!document.getElementById('confirmModal').classList.contains('is-open')") === true, typedReload);
    check("reload keeps the chosen ledger id from the registry",
      typedReload.registry.projects.find((item) => item.id === P_TEST).ledgerId === typedReload.test.ledgerId &&
      typedReload.test.ledgerId === (await readExtension(cdp)).test.ledgerId, typedReload);

    /* Empty side adopts the non-empty side. App empty, extension has data:
       no conflict; app takes the extension ledger id and request. */
    await evaluate(cdp, pageSession, `localStorage.setItem('oz-istek-defteri-p-${P_TEST}', ${JSON.stringify(JSON.stringify(ledger("Test Project", "ledger_app_empty", [])))}); true`);
    await seedExtension(cdp, P_TEST, [request("IST-005", "Adopted extension request")], legacyRequests, "ledger_ext_data");
    await cdp.send("Page.reload", {}, pageSession);
    await sleep(2400);
    pageSession = await attach(cdp, pageTarget.targetId);
    await dismissOnboarding(cdp, pageSession);
    await waitFor(() => evaluate(cdp, pageSession,
      "window.__rlBridge && window.__rlBridge.connected()"), "bridge after empty-app reload", 15000);
    const adoptedByApp = await waitFor(async () => {
      const value = await readApp(cdp, pageSession);
      return value.test.requests.some((item) => item.title === "Adopted extension request") ? value : null;
    }, "empty app adopts extension data", 15000);
    const extensionAdopted = await readExtension(cdp);
    check("empty app adopts the extension ledger silently",
      adoptedByApp.test.ledgerId === "ledger_ext_data" &&
      adoptedByApp.test.requests.some((item) => item.title === "Adopted extension request"), adoptedByApp.test);
    check("empty-side adoption keeps one ledger id",
      extensionAdopted.test.ledgerId === adoptedByApp.test.ledgerId, {
        app: adoptedByApp.test.ledgerId,
        panel: extensionAdopted.test.ledgerId
      });

    /* Extension empty, app has data: no conflict; extension adopts the app
       ledger id and request. */
    await seedExtension(cdp, P_TEST, [], legacyRequests, "ledger_ext_empty");
    await cdp.send("Page.reload", {}, pageSession);
    await sleep(2400);
    pageSession = await attach(cdp, pageTarget.targetId);
    await dismissOnboarding(cdp, pageSession);
    await waitFor(() => evaluate(cdp, pageSession,
      "window.__rlBridge && window.__rlBridge.connected()"), "bridge after empty-extension reload", 15000);
    const extensionAdoptsApp = await waitFor(async () => {
      const value = await readExtension(cdp);
      return value.test && value.test.requests.some((item) => item.title === "Adopted extension request") ? value : null;
    }, "empty extension adopts app data", 15000);
    const appAfterAdoption = await readApp(cdp, pageSession);
    check("empty extension adopts the app ledger silently",
      extensionAdoptsApp.test.ledgerId === appAfterAdoption.test.ledgerId &&
      extensionAdoptsApp.test.requests.some((item) => item.title === "Adopted extension request"), extensionAdoptsApp.test);

    const errors = cdp.events.filter((event) => event.method === "Runtime.exceptionThrown");
    check("no uncaught errors in project consistency flow", errors.length === 0,
      errors.slice(0, 3).map((event) => (event.params.exceptionDetails || {}).text));

    await cdp.send("Target.closeTarget", { targetId: pageTarget.targetId });
  } finally {
    try { chrome.kill(); } catch (error) { /* ignore */ }
  }

  const failed = checks.filter((entry) => !entry.ok);
  console.log("\n" + (checks.length - failed.length) + "/" + checks.length + " checks passed");
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error("PROJECT CONSISTENCY E2E ERROR:", error.message);
  process.exit(1);
});
