#!/usr/bin/env node
"use strict";

/*
  Data lifecycle E2E: project delete/restore, full backup -> reset -> restore,
  silent port handoff with disk truth, and server-side UI config.

  Usage:
    node tests/e2e/data-lifecycle.e2e.cjs
*/

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const pageErrors = require("./_page-errors.cjs");
const harness = require("./_harness.cjs");

const ROOT = path.resolve(__dirname, "..", "..");
const TMP = path.resolve(ROOT, "..", ".opencode", "workspace", "tmp", "bridge-fixes");
const PROFILE = path.join(os.tmpdir(), "rl-data-lifecycle-e2e-profile");
const CDP_PORT = 9444;
const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

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
  const result = await cdp.send("Runtime.evaluate", {
    expression, returnByValue: true, awaitPromise: true, userGesture: true,
  }, sessionId);
  if (result.exceptionDetails) throw new Error("evaluate failed: " + result.exceptionDetails.text);
  return result.result ? result.result.value : null;
}
let activeCdp = null;
async function waitFor(fn, label, timeoutMs) {
  return harness.waitFor(activeCdp, fn, label, timeoutMs);
}
async function waitServer(port) {
  return waitFor(async () => {
    try {
      const response = await fetch("http://127.0.0.1:" + port + "/__rl/status");
      return response.ok ? await response.json() : null;
    } catch (error) { return null; }
  }, "server " + port, 15000);
}
async function waitPortFree(port) {
  return waitFor(() => new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
  }), "port free " + port, 12000);
}
function projectSlugFor(projectId) {
  const projectsRoot = path.join(ROOT, "projects");
  if (!fs.existsSync(projectsRoot)) return "";
  for (const name of fs.readdirSync(projectsRoot)) {
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(projectsRoot, name, "project.json"), "utf8"));
      if (meta.projectId === projectId) return name;
    } catch (error) { /* ignore */ }
  }
  return "";
}
function lockPid(lockName) {
  try {
    const lock = JSON.parse(fs.readFileSync(path.join(TMP, lockName), "utf8"));
    return Number(lock.pid) || 0;
  } catch (error) { return 0; }
}
function killPid(pid) {
  if (!pid) return;
  try { process.kill(pid); } catch (error) { /* already gone */ }
}
function readConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, "rl-config.json"), "utf8")); }
  catch (error) { return null; }
}
async function readApp(cdp, sessionId, projectId) {
  return evaluate(cdp, sessionId, `(() => {
    const reg = JSON.parse(localStorage.getItem('oz-projeler-v1') || 'null');
    const key = 'oz-istek-defteri-p-' + ${JSON.stringify(projectId)};
    const raw = localStorage.getItem(key);
    return { registry: reg, ledger: raw ? JSON.parse(raw) : null, lang: document.documentElement.lang,
      theme: document.documentElement.getAttribute('data-theme') };
  })()`);
}
async function dismissOnboarding(cdp, sessionId) {
  await evaluate(cdp, sessionId, `(() => {
    const modal = document.getElementById('onboardingModal');
    const done = document.getElementById('onboardingDoneBtn');
    if (modal && modal.classList.contains('is-open') && done) done.click();
    localStorage.setItem('rl-onboarding-v1', '1');
    return true;
  })()`);
  await sleep(200);
}
async function pasteImage(cdp, sessionId) {
  await evaluate(cdp, sessionId, `(() => {
    const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4WQAAAAASUVORK5CYII=';
    const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
    const file = new File([bytes], 'lifecycle.png', { type: 'image/png' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    return true;
  })()`);
  await sleep(1800);
}
async function createProjectViaGate(cdp, sessionId, name) {
  await evaluate(cdp, sessionId, `(() => {
    const btn = document.getElementById('projectsBtn');
    if (btn) btn.click();
    return true;
  })()`);
  await sleep(300);
  await evaluate(cdp, sessionId, `(() => {
    const next = document.getElementById('projectPickerNewBtn');
    if (next) next.click();
    return !!next;
  })()`);
  await waitFor(() => evaluate(cdp, sessionId, "!!document.getElementById('projectCreateInput')"), "project create screen", 8000);
  await evaluate(cdp, sessionId, `(() => {
    const input = document.getElementById('projectCreateInput');
    input.value = ${JSON.stringify(name)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('projectCreateBtn').click();
    return true;
  })()`);
  await sleep(700);
  const confirmOpen = await evaluate(cdp, sessionId,
    "document.getElementById('confirmModal').classList.contains('is-open')");
  if (confirmOpen) {
    await evaluate(cdp, sessionId, "document.getElementById('confirmOkBtn').click()");
  }
}
async function deleteProjectViaUi(cdp, sessionId, projectId, keepBackup) {
  const selected = await evaluate(cdp, sessionId, `(() => {
    const row = document.querySelector('#archiveProjectTree .hitem[data-project-id="' + ${JSON.stringify(projectId)} + '"]');
    if (row) row.click();
    return !!row;
  })()`);
  if (!selected) return { selected: false };
  await sleep(350);
  const opened = await evaluate(cdp, sessionId, `(() => {
    const btn = document.querySelector('.archive__detail-open[data-project-id="' + ${JSON.stringify(projectId)} + '"]');
    if (btn) btn.click();
    return !!btn;
  })()`);
  if (!opened) return { selected: true, opened: false };
  await waitFor(() => evaluate(cdp, sessionId,
    "document.getElementById('projectSettingsModal').classList.contains('is-open')"), "project settings modal", 5000);
  await evaluate(cdp, sessionId, "document.getElementById('projectSettingsDeleteBtn').click()");
  await waitFor(() => evaluate(cdp, sessionId,
    "document.getElementById('confirmModal').classList.contains('is-open')"), "delete confirm", 5000);
  const confirmText = await evaluate(cdp, sessionId,
    "(document.getElementById('confirmMessage') || {}).textContent || ''");
  await evaluate(cdp, sessionId, keepBackup
    ? "document.getElementById('confirmOkBtn').click()"
    : "document.getElementById('confirmAltBtn').click()");
  await sleep(1200);
  return { selected: true, opened: true, confirmText: confirmText };
}
async function setLanguageAndTheme(cdp, sessionId, language, theme) {
  await evaluate(cdp, sessionId, `(() => {
    if (document.documentElement.lang !== ${JSON.stringify(language)}) {
      const lang = document.getElementById('langToggleBtn');
      if (lang) lang.click();
    }
    if (document.documentElement.getAttribute('data-theme') !== ${JSON.stringify(theme)}) {
      const themeBtn = document.getElementById('themeBtn');
      if (themeBtn) themeBtn.click();
    }
    return { lang: document.documentElement.lang, theme: document.documentElement.getAttribute('data-theme') };
  })()`);
  await sleep(900);
}

async function main() {
  try { fs.rmSync(path.join(ROOT, "projects"), { recursive: true, force: true }); } catch (error) { /* ignore */ }
  try { fs.rmSync(path.join(ROOT, "backups"), { recursive: true, force: true }); } catch (error) { /* ignore */ }
  try { fs.rmSync(path.join(ROOT, "deleted-projects"), { recursive: true, force: true }); } catch (error) { /* ignore */ }
  try { fs.rmSync(path.join(ROOT, "rl-config.json"), { force: true }); } catch (error) { /* ignore */ }
  fs.mkdirSync(TMP, { recursive: true });
  fs.rmSync(PROFILE, { recursive: true, force: true });

  const portA = await freePort();
  const portB = await freePort();
  let server = startServer(portA, "data-a.lock");
  let chrome = null;
  try {
    await waitServer(portA);
    chrome = spawn(chromePath(), [
      "--user-data-dir=" + PROFILE,
      "--remote-debugging-port=" + CDP_PORT,
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-search-engine-choice-screen",
      "--window-size=1280,900",
      "about:blank",
    ], { stdio: "ignore" });
    const version = await waitEndpoint(CDP_PORT, 20000);
    const cdp = new CDP(version.webSocketDebuggerUrl);
    activeCdp = cdp;
    harness.install(cdp);

    const target = await cdp.send("Target.createTarget", { url: "http://localhost:" + portA + "/index.html" });
    let session = await attach(cdp, target.targetId);
    harness.setDiagnostics(cdp, async () => {
      const shot = await harness.screenshot(cdp, session, "data-lifecycle-app");
      let trace = "";
      try {
        trace = JSON.stringify(await harness.evaluate(cdp, session,
          "(window.__rlStateDebug ? { boot:window.__rlStateDebug.boot(), ledger:window.__rlStateDebug.ledger(), trace:window.__rlStateDebug.trace(), audit:window.__rlStateDebug.audit() } : null)"));
      } catch (error) {
        trace = "trace failed: " + error.message;
      }
      return "screenshot: " + shot + "\ntrace: " + trace.slice(0, 6000);
    });
    await sleep(1200);
    await dismissOnboarding(cdp, session);
    await waitFor(() => evaluate(cdp, session, "!!document.getElementById('projectCreateInput')"), "project creator");

    /* ---------- project + request + image ---------- */
    await evaluate(cdp, session, `(() => {
      const input = document.getElementById('projectCreateInput');
      input.value = 'Lifecycle Main';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('projectCreateBtn').click();
      return true;
    })()`);
    await waitFor(() => evaluate(cdp, session, "window.__rlBridge && window.__rlBridge.projectId()"), "app project");
    const mainProjectId = await evaluate(cdp, session, "window.__rlBridge.projectId()");
    await evaluate(cdp, session, "document.getElementById('emptyAddBtn').click()");
    await waitFor(() => evaluate(cdp, session, "document.getElementById('typeModal').classList.contains('is-open')"), "type modal");
    await evaluate(cdp, session, "document.querySelector('#typeChoices .typechoice').click()");
    await waitFor(() => evaluate(cdp, session, "!!document.querySelector('.req [data-field=\"title\"]')"), "request row");
    await evaluate(cdp, session, "document.querySelector('.req [data-field=\"title\"]').focus()");
    await cdp.send("Input.insertText", { text: "Lifecycle request" }, session);
    await sleep(600);
    await pasteImage(cdp, session);
    const mainSlug = await waitFor(() => projectSlugFor(mainProjectId) || null, "main project folder", 12000);
    await waitFor(() => fs.existsSync(path.join(ROOT, "projects", mainSlug, "ledger.json")), "main ledger", 12000);

    /* Language + theme are persisted server-side. */
    await setLanguageAndTheme(cdp, session, "en", "dark");
    const configAfterSetting = await waitFor(() => {
      const config = readConfig();
      return config && config.language === "en" && config.theme === "dark" ? config : null;
    }, "server UI config", 8000);
    check("language and theme are stored in rl-config.json", !!configAfterSetting, configAfterSetting);

    /* ---------- delete with backup, restore ---------- */
    await createProjectViaGate(cdp, session, "Delete Me");
    const deleteProjectId = await waitFor(async () => {
      const id = await evaluate(cdp, session, "window.__rlBridge.projectId()");
      return id && id !== mainProjectId ? id : null;
    }, "second project", 12000);
    const deleteSlug = await waitFor(() => projectSlugFor(deleteProjectId) || null, "second project folder", 12000);

    const deleteUi = await deleteProjectViaUi(cdp, session, deleteProjectId, true);
    check("the delete confirm asks whether to keep a backup",
      deleteUi.selected === true && /yedek/i.test(deleteUi.confirmText || ""), deleteUi);
    await waitFor(() => !fs.existsSync(path.join(ROOT, "projects", deleteSlug)), "deleted folder gone", 8000);
    const deletedListAfter = await fetch("http://127.0.0.1:" + portA + "/__rl/deleted").then((r) => r.json()).catch(() => null);
    check("delete with backup removes the folder and writes a deleted-projects ZIP",
      fs.existsSync(path.join(ROOT, "deleted-projects")) &&
      fs.readdirSync(path.join(ROOT, "deleted-projects")).some((name) => name.indexOf(deleteSlug) === 0) &&
      deletedListAfter && deletedListAfter.deleted.length === 1, deletedListAfter);

    /* Reload: the deleted project must not come back. */
    await cdp.send("Page.reload", {}, session);
    await sleep(2600);
    session = await attach(cdp, target.targetId);
    await dismissOnboarding(cdp, session);
    const registryAfterDelete = await evaluate(cdp, session,
      "(JSON.parse(localStorage.getItem('oz-projeler-v1') || 'null') || {}).projects || []");
    check("the deleted project does not return after a reload",
      !registryAfterDelete.some((project) => project.projectId === deleteProjectId || project.id === deleteProjectId),
      registryAfterDelete);

    /* Restore through the backup modal list. */
    await evaluate(cdp, session, "document.querySelector('[data-rail=\"backup\"]').click()");
    await waitFor(() => evaluate(cdp, session,
      "document.getElementById('backupModal').classList.contains('is-open')"), "backup modal");
    const deletedRow = await waitFor(() => evaluate(cdp, session, `(() => {
      const row = document.querySelector('#deletedProjectList .backupopt--row');
      if (!row) return null;
      const text = row.textContent;
      const button = Array.from(row.querySelectorAll('button')).find((item) => /Geri y|Restore/i.test(item.textContent));
      return { text: text, hasRestore: !!button };
    })()`), "deleted list row", 8000);
    await evaluate(cdp, session, `(() => {
      const row = document.querySelector('#deletedProjectList .backupopt--row');
      const button = row && Array.from(row.querySelectorAll('button')).find((item) => /Geri y|Restore/i.test(item.textContent));
      if (button) button.click();
      return !!button;
    })()`);
    await waitFor(() => evaluate(cdp, session,
      "document.getElementById('confirmModal').classList.contains('is-open')"), "restore confirm", 5000);
    await evaluate(cdp, session, "document.getElementById('confirmOkBtn').click()");
    const restoredFolder = await waitFor(() => {
      const names = fs.existsSync(path.join(ROOT, "projects")) ? fs.readdirSync(path.join(ROOT, "projects")) : [];
      return names.find((name) => name === deleteSlug) || names.find((name) => name.indexOf(deleteSlug) === 0) || null;
    }, "restored project folder", 12000);
    check("the deleted-project list restores the folder",
      !!restoredFolder && deletedRow.hasRestore === true, { restoredFolder, row: deletedRow });
    await sleep(2600);
    session = await attach(cdp, target.targetId);
    await dismissOnboarding(cdp, session);
    const registryAfterRestore = await evaluate(cdp, session,
      "(JSON.parse(localStorage.getItem('oz-projeler-v1') || 'null') || {}).projects || []");
    check("the restored project is registered again after the reload",
      registryAfterRestore.some((project) => (project.id || project.projectId) === deleteProjectId),
      registryAfterRestore);

    /* ---------- delete without backup ---------- */
    const restoredId = registryAfterRestore.find((project) => (project.id || project.projectId) === deleteProjectId);
    const plainDelete = await deleteProjectViaUi(cdp, session, deleteProjectId, false);
    await waitFor(() => !fs.existsSync(path.join(ROOT, "projects", restoredFolder)), "plain delete folder gone", 8000);
    const deletedAfterPlain = fs.existsSync(path.join(ROOT, "deleted-projects"))
      ? fs.readdirSync(path.join(ROOT, "deleted-projects")).length
      : 0;
    check("delete without backup leaves no folder and no new archive",
      plainDelete.selected === true && deletedAfterPlain === 1, { plainDelete, deletedAfterPlain, restoredId: restoredId && restoredId.id });

    /* ---------- full backup -> reset -> restore ---------- */
    await evaluate(cdp, session, "document.querySelector('[data-rail=\"backup\"]').click()");
    await sleep(400);
    await evaluate(cdp, session, "document.getElementById('backupZipBtn').click()");
    const storedBackup = await waitFor(() => {
      const dir = path.join(ROOT, "backups");
      const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => /\.zip$/i.test(name)) : [];
      return names.length ? names[0] : null;
    }, "backup written to backups/", 15000);
    check("a full backup is written into backups/", !!storedBackup, storedBackup);

    await evaluate(cdp, session, "document.getElementById('clearAllBtn').click()");
    await waitFor(() => evaluate(cdp, session,
      "document.getElementById('confirmModal').classList.contains('is-open')"), "reset confirm", 5000);
    await evaluate(cdp, session, "document.getElementById('confirmAltBtn').click()");
    await waitFor(() => evaluate(cdp, session, "document.readyState === 'complete'"), "reload", 8000).catch(() => {});
    await sleep(3200);
    session = await attach(cdp, target.targetId);
    await dismissOnboarding(cdp, session);
    const afterReset = {
      projects: fs.existsSync(path.join(ROOT, "projects")) ? fs.readdirSync(path.join(ROOT, "projects")) : [],
      deleted: fs.existsSync(path.join(ROOT, "deleted-projects")) ? fs.readdirSync(path.join(ROOT, "deleted-projects")) : [],
      backups: fs.existsSync(path.join(ROOT, "backups")) ? fs.readdirSync(path.join(ROOT, "backups")) : [],
    };
    check("the full reset clears projects and deleted archives but keeps backups/",
      afterReset.projects.filter((name) => !name.startsWith(".")).length === 0 &&
      afterReset.deleted.length === 0 && afterReset.backups.length >= 1, afterReset);

    /* Restore from the server backup list. */
    await evaluate(cdp, session, "document.querySelector('[data-rail=\"backup\"]').click()");
    await waitFor(() => evaluate(cdp, session,
      "!!document.querySelector('#serverBackupList .backupopt--row')"), "server backup row", 8000);
    await evaluate(cdp, session, `(() => {
      const row = document.querySelector('#serverBackupList .backupopt--row');
      const button = row && Array.from(row.querySelectorAll('button')).find((item) => /Geri y|Restore/i.test(item.textContent));
      if (button) button.click();
      return !!button;
    })()`);
    await waitFor(() => evaluate(cdp, session,
      "document.getElementById('confirmModal').classList.contains('is-open')"), "backup restore confirm", 6000);
    await evaluate(cdp, session, "document.getElementById('confirmOkBtn').click()");
    await sleep(3500);
    session = await attach(cdp, target.targetId);
    await dismissOnboarding(cdp, session);
    const restored = await waitFor(async () => {
      const app = await readApp(cdp, session, mainProjectId);
      const req = app.ledger && app.ledger.requests ? app.ledger.requests[0] : null;
      return req && req.title === "Lifecycle request" ? app : null;
    }, "restored ledger from server backup", 15000);
    check("restoring a server backup brings the project and request back",
      !!restored && restored.ledger.requests[0].images.length >= 1, restored && restored.ledger.requests[0]);
    check("the restored project folder exists on disk", !!projectSlugFor(mainProjectId));

    /* ---------- silent port change A -> B ---------- */
    await setLanguageAndTheme(cdp, session, "en", "dark");
    const beforePort = await evaluate(cdp, session, `(() => ({
      lang: document.documentElement.lang,
      theme: document.documentElement.getAttribute('data-theme'),
      stopButton: !!document.getElementById('railStopBtn'),
      label: (document.getElementById('railModeLabel') || {}).textContent || ''
    }))()`);
    check("the rail shows the port with no stop button before the move",
      beforePort.stopButton === false && beforePort.label === ":" + portA, beforePort);

    await evaluate(cdp, session, `(() => {
      const input = document.getElementById('settingsPort');
      input.value = ${JSON.stringify(String(portB))};
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('applyPortBtn').click();
      return true;
    })()`);
    await waitFor(async () => {
      try {
        const status = await fetch("http://127.0.0.1:" + portB + "/__rl/status");
        return status.ok ? await status.json() : null;
      } catch (error) { return null; }
    }, "server on the new port", 15000);
    await waitFor(async () => {
      try {
        const url = await evaluate(cdp, session, "location.href");
        return url.indexOf(":" + portB) >= 0 ? url : null;
      } catch (error) { return null; }
    }, "app navigates to the new port", 15000).catch(() => null);
    await sleep(2600);
    session = await attach(cdp, target.targetId);
    await dismissOnboarding(cdp, session);
    const appOnB = await readApp(cdp, session, mainProjectId);
    const imageSrcB = await evaluate(cdp, session, `(() => {
      const img = document.querySelector('.req img');
      return img ? img.src : '';
    })()`);
    const processedOnB = await evaluate(cdp, session, `(() => ({
      lang: document.documentElement.lang,
      theme: document.documentElement.getAttribute('data-theme'),
      label: (document.getElementById('railModeLabel') || {}).textContent || '',
      dotOn: (document.getElementById('railModeDot') || { classList: { contains: () => false } }).classList.contains('is-on')
    }))()`);
    check("the app is served on the new port with the same project and image",
      appOnB.ledger && appOnB.ledger.requests.some((req) => req.title === "Lifecycle request" && req.images.length >= 1) &&
      imageSrcB.indexOf("/__rl/media/") >= 0, { app: appOnB.ledger && appOnB.ledger.requests[0], imageSrcB });
    check("language and theme survive the port change",
      processedOnB.lang === "en" && processedOnB.theme === "dark" &&
      processedOnB.label === ":" + portB && processedOnB.dotOn === true, processedOnB);
    check(".rl-port points at the new port",
      Number(fs.readFileSync(path.join(ROOT, ".rl-port"), "utf8").trim()) === portB);

    /* ---------- restart: config is hydrated before the first render ---------- */
    /* The port change spawned a detached replacement; stop it via the lock so
       the restart below is a clean start on the same port. */
    const handoffPid = lockPid("data-a.lock");
    check("the rebind lock belongs to the new server process",
      handoffPid > 0 && handoffPid !== (server && server.pid ? server.pid : -1), handoffPid);
    killPid(handoffPid);
    stopChild(server);
    server = null;
    await waitPortFree(portB);
    server = startServer(portB, "data-b.lock");
    await waitServer(portB);
    await sleep(500);
    await cdp.send("Page.reload", {}, session);
    await sleep(2200);
    session = await attach(cdp, target.targetId);
    const bootState = await evaluate(cdp, session, `(() => ({
      lang: document.documentElement.lang,
      theme: document.documentElement.getAttribute('data-theme'),
      boot: window.__RL_SERVER_BOOT ? window.__RL_SERVER_BOOT : null
    }))()`);
    const afterRestart = await waitFor(async () => {
      const app = await readApp(cdp, session, mainProjectId);
      return app.ledger && app.ledger.requests.some((req) => req.title === "Lifecycle request") ? app : null;
    }, "data after a server restart", 15000);
    check("language and theme are hydrated before the first render on restart",
      bootState.lang === "en" && bootState.theme === "dark" &&
      bootState.boot && bootState.boot.language === "en" && bootState.boot.theme === "dark", bootState);
    check("the project, request and image survive a full server restart",
      !!afterRestart && afterRestart.ledger.requests[0].images.length >= 1);

    const pageFailures = pageErrors.collect(cdp);
check("no page reference/console errors", pageFailures.length === 0, pageFailures.slice(0, 3));
const errors = cdp.events.filter((event) => event.method === "Runtime.exceptionThrown");
    check("no uncaught errors in the data lifecycle flow", errors.length === 0,
      errors.slice(0, 3).map((event) => (event.params.exceptionDetails || {}).text));
  } finally {
    try { chrome && chrome.kill(); } catch (error) { /* ignore */ }
    stopChild(server);
    killPid(lockPid("data-a.lock"));
    killPid(lockPid("data-b.lock"));
    try { await waitPortFree(portB); } catch (error) { /* ignore */ }
    for (const name of ["data-a.lock", "data-b.lock"]) {
      try { fs.rmSync(path.join(TMP, name), { force: true }); } catch (error) { /* ignore */ }
    }
    for (const dir of ["projects", "backups", "deleted-projects"]) {
      try { fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true }); } catch (error) { /* ignore */ }
    }
    try { fs.rmSync(path.join(ROOT, "rl-config.json"), { force: true }); } catch (error) { /* ignore */ }
  }

  const passed = checks.filter((item) => item.ok).length;
  console.log("\n" + passed + "/" + checks.length + " checks passed");
  if (passed !== checks.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error("DATA LIFECYCLE E2E ERROR:", error.message);
  process.exitCode = 1;
});
