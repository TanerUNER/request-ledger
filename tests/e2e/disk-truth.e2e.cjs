#!/usr/bin/env node
"use strict";

/*
  Disk truth E2E (server mode across ports).

  Creates a project, a request and an image on port A, stops the server,
  starts it on port B (same app root) and proves the app loads everything from
  projects/<slug>/ without a backup. Also checks repeated boots, the media
  index/path traversal and the free-port fallback.

  Usage:
    node tests/e2e/disk-truth.e2e.cjs
*/

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const TMP = path.resolve(ROOT, "..", ".opencode", "workspace", "tmp", "bridge-fixes");
const PROFILE = path.join(os.tmpdir(), "rl-disk-truth-e2e-profile");
const CDP_PORT = 9441;
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
  await cdp.send("Runtime.enable", {}, sessionId);
  try { await cdp.send("Page.enable", {}, sessionId); } catch (error) { /* ignore */ }
  return sessionId;
}
async function evaluate(cdp, sessionId, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression, returnByValue: true, awaitPromise: true, userGesture: true
  }, sessionId);
  if (result.exceptionDetails) throw new Error("evaluate failed: " + result.exceptionDetails.text);
  return result.result ? result.result.value : null;
}
async function waitFor(fn, label, timeoutMs) {
  const started = Date.now();
  const limit = timeoutMs || 15000;
  while (Date.now() - started < limit) {
    try { const value = await fn(); if (value) return value; } catch (error) { /* retry */ }
    await sleep(180);
  }
  throw new Error("timeout: " + label);
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
async function readApp(cdp, sessionId, projectId) {
  return evaluate(cdp, sessionId, `(() => {
    const reg = JSON.parse(localStorage.getItem('oz-projeler-v1') || 'null');
    const key = 'oz-istek-defteri-p-' + ${JSON.stringify(projectId)};
    const raw = localStorage.getItem(key);
    return { registry: reg, ledger: raw ? JSON.parse(raw) : null };
  })()`);
}
async function pasteImage(cdp, sessionId) {
  await evaluate(cdp, sessionId, `(() => {
    const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4WQAAAAASUVORK5CYII=';
    const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
    const file = new File([bytes], 'disk-pasted.png', { type: 'image/png' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    return true;
  })()`);
  await sleep(1800);
}

async function main() {
  /* server-disk reset */
  try { fs.rmSync(path.join(ROOT, "projects"), { recursive: true, force: true }); } catch (error) { /* ignore */ }
  try { fs.rmSync(path.join(ROOT, "backups"), { recursive: true, force: true }); } catch (error) { /* ignore */ }
  try { fs.rmSync(path.join(ROOT, "deleted-projects"), { recursive: true, force: true }); } catch (error) { /* ignore */ }
  try { fs.rmSync(path.join(ROOT, "rl-config.json"), { force: true }); } catch (error) { /* ignore */ }
  fs.mkdirSync(TMP, { recursive: true });
  fs.rmSync(PROFILE, { recursive: true, force: true });

  const portA = await freePort();
  const portB = await freePort();
  let serverA = startServer(portA, "disk-a.lock");
  let serverB = null;
  let serverC = null;
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

    const target = await cdp.send("Target.createTarget", { url: "http://localhost:" + portA + "/index.html" });
    let session = await attach(cdp, target.targetId);
    await sleep(900);
    await evaluate(cdp, session, `(() => {
      const modal = document.getElementById('onboardingModal');
      const done = document.getElementById('onboardingDoneBtn');
      if (modal && modal.classList.contains('is-open') && done) done.click();
      return true;
    })()`);
    await waitFor(() => evaluate(cdp, session, "!!document.getElementById('projectCreateInput')"), "project creator");
    await evaluate(cdp, session, `(() => {
      const input = document.getElementById('projectCreateInput');
      input.value = 'Disk Truth Project';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('projectCreateBtn').click();
      return true;
    })()`);
    await waitFor(() => evaluate(cdp, session, "window.__rlBridge && window.__rlBridge.projectId()"), "app project");
    const projectId = await evaluate(cdp, session, "window.__rlBridge.projectId()");

    await evaluate(cdp, session, "document.getElementById('emptyAddBtn').click()");
    await waitFor(() => evaluate(cdp, session, "document.getElementById('typeModal').classList.contains('is-open')"), "type modal");
    await evaluate(cdp, session, "document.querySelector('#typeChoices .typechoice').click()");
    await waitFor(() => evaluate(cdp, session, "!!document.querySelector('.req [data-field=\"title\"]')"), "request row");
    await evaluate(cdp, session, "document.querySelector('.req [data-field=\"title\"]').focus()");
    await cdp.send("Input.insertText", { text: "Disk truth request" }, session);
    await sleep(500);
    await evaluate(cdp, session, `(() => {
      const desc = document.querySelector('.req [data-field="description"]');
      if (desc) {
        desc.value = 'Loaded from projects/<slug>/ after a port change.';
        desc.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return true;
    })()`);
    await sleep(500);
    await pasteImage(cdp, session);

    const slug = await waitFor(() => {
      const found = projectSlugFor(projectId);
      return found || null;
    }, "server project folder", 12000);
    const folder = path.join(ROOT, "projects", slug);
    await waitFor(() => fs.existsSync(path.join(folder, "ledger.json")), "ledger on disk", 12000);
    const ledger = JSON.parse(fs.readFileSync(path.join(folder, "ledger.json"), "utf8"));
    check("port A writes the request and image metadata to disk",
      Array.isArray(ledger.requests) && ledger.requests.length >= 1 &&
      Array.isArray(ledger.requests[0].images) && ledger.requests[0].images.length >= 1,
      ledger.requests && ledger.requests[0]);
    const mediaIndex = JSON.parse(fs.readFileSync(path.join(folder, "media.json"), "utf8"));
    const mediaId = ledger.requests[0].images[0].id;
    check("media is uploaded under projects/<slug>/media/",
      fs.existsSync(path.join(folder, "media", mediaId)) && mediaIndex.some((item) => item.id === mediaId),
      { mediaId, mediaIndex });
    check("the project name reaches project.json", JSON.parse(fs.readFileSync(path.join(folder, "project.json"), "utf8")).name === "Disk Truth Project");

    stopChild(serverA);
    serverA = null;
    await waitPortFree(portA);

    serverB = startServer(portB, "disk-b.lock");
    await waitServer(portB);
    const targetB = await cdp.send("Target.createTarget", { url: "http://localhost:" + portB + "/index.html" });
    session = await attach(cdp, targetB.targetId);
    await sleep(2600);
    await evaluate(cdp, session, `(() => {
      const modal = document.getElementById('onboardingModal');
      const done = document.getElementById('onboardingDoneBtn');
      if (modal && modal.classList.contains('is-open') && done) done.click();
      return true;
    })()`);
    await waitFor(() => evaluate(cdp, session, "window.__rlBridge && window.__rlBridge.projectId()"), "app on port B", 20000);
    const appB = await readApp(cdp, session, projectId);
    check("port B loads the same project, request and image from disk",
      appB.ledger && appB.ledger.requests.some((req) => req.title === "Disk truth request" && req.images.length >= 1),
      appB.ledger && appB.ledger.requests);
    const imageSrc = await evaluate(cdp, session, `(() => {
      const img = document.querySelector('.req [data-action="view-image"] img, .req .thumb img');
      return img ? img.src : '';
    })()`);
    check("port B resolves the image through /__rl/media/", imageSrc.indexOf("/__rl/media/") !== -1, imageSrc);

    /* Repeated boots must not duplicate projects or ledgers. */
    await cdp.send("Page.reload", {}, session);
    await sleep(2600);
    session = await attach(cdp, targetB.targetId);
    await cdp.send("Page.reload", {}, session);
    await sleep(2200);
    session = await attach(cdp, targetB.targetId);
    const projects = await fetch("http://127.0.0.1:" + portB + "/__rl/projects").then((response) => response.json()).catch(() => null);
    check("repeated boots keep one project and one ledger",
      projects && Array.isArray(projects.projects) && projects.projects.length === 1 &&
      projects.projects[0].projectId === projectId, projects);

    /* Path traversal is rejected. */
    const traversal = await fetch("http://127.0.0.1:" + portB + "/__rl/media/..%2F..%2Fpackage.json/x").catch(() => null);
    check("media path traversal is rejected", !traversal || traversal.status === 400 || traversal.status === 404,
      traversal && traversal.status);

    /* Free-port fallback keeps the same disk truth. */
    stopChild(serverB);
    serverB = null;
    await waitPortFree(portB);
    const busyPort = await freePort();
    const busy = http.createServer((request, response) => { response.writeHead(404); response.end(); });
    await new Promise((resolve) => busy.listen(busyPort, "127.0.0.1", resolve));
    let busyClosed = false;
    const closeBusy = () => new Promise((resolve) => {
      if (busyClosed) { resolve(); return; }
      busyClosed = true;
      busy.close(resolve);
    });
    try {
      /* Drop the previous run's port file so a stale value cannot be read. */
      try { fs.rmSync(path.join(ROOT, ".rl-port"), { force: true }); } catch (error) { /* ignore */ }
      serverC = startServer(busyPort, "disk-c.lock");
      let fallbackPort = 0;
      await waitFor(async () => {
        try {
          const value = Number(fs.readFileSync(path.join(ROOT, ".rl-port"), "utf8").trim());
          if (!value || value === busyPort) return null;
          const status = await fetch("http://127.0.0.1:" + value + "/__rl/status").catch(() => null);
          if (!status || !status.ok) return null;
          fallbackPort = value;
          return value;
        } catch (error) { return null; }
      }, "fallback port", 20000);
      await fetch("http://127.0.0.1:" + fallbackPort + "/__rl/heartbeat", { method: "POST" }).catch(() => {});
      const targetC = await cdp.send("Target.createTarget", { url: "http://localhost:" + fallbackPort + "/index.html" });
      session = await attach(cdp, targetC.targetId);
      await sleep(2600);
      await evaluate(cdp, session, `(() => {
        const modal = document.getElementById('onboardingModal');
        const done = document.getElementById('onboardingDoneBtn');
        if (modal && modal.classList.contains('is-open') && done) done.click();
        return true;
      })()`);
      const appC = await waitFor(async () => {
        const value = await readApp(cdp, session, projectId);
        return value.ledger && value.ledger.requests.some((req) => req.title === "Disk truth request" && req.images.length >= 1) ? value : null;
      }, "fallback app data", 25000);
      check("free-port fallback loads the same disk data", !!appC);
    } finally {
      await closeBusy();
    }
  } finally {
    try { chrome && chrome.kill(); } catch (error) { /* ignore */ }
    stopChild(serverA);
    stopChild(serverB);
    stopChild(serverC);
  }

  const passed = checks.filter((item) => item.ok).length;
  console.log("\n" + passed + "/" + checks.length + " checks passed");
  if (passed !== checks.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error("DISK TRUTH E2E ERROR:", error.message);
  process.exitCode = 1;
});
