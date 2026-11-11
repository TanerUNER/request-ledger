#!/usr/bin/env node
"use strict";

/*
  Companion presence across a full browser restart.

  Uses a persistent Chrome profile and a real ledger server:
    - stale `rl-app-alive:true` + browser restart, server off -> never mounts;
    - same profile, server on, browser restart -> dock appears automatically;
    - server stop/start while the browser stays open -> hides/returns;
    - two tabs behave the same;
    - file:// app mode appears while the page is open and hides when it closes.

  Usage:
    node tests/e2e/presence.e2e.cjs
*/

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const EXT = path.join(ROOT, "dist", "extension");
const PROFILE = path.join(os.tmpdir(), "rl-presence-e2e-profile");
const TMP = path.resolve(ROOT, "..", ".opencode", "workspace", "tmp", "bridge-fixes");
const CDP_PORT = 9345;
const EXT_ID = "hapajcbgcfllhkiohhkechekajencdod";
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
function launchChrome() {
  return spawn(chromePath(), [
    "--user-data-dir=" + PROFILE,
    "--enable-unsafe-extension-debugging",
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
}
async function waitEndpoint(port, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch("http://127.0.0.1:" + port + "/json/version");
      if (response.ok) return await response.json();
    } catch (error) { /* not ready */ }
    await sleep(200);
  }
  throw new Error("DevTools endpoint did not start");
}
async function waitPortFree(port, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < (timeoutMs || 15000)) {
    const free = await new Promise((resolve) => {
      const probe = net.createServer();
      probe.once("error", () => resolve(false));
      probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
    });
    if (free) return true;
    await sleep(150);
  }
  return false;
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
    expression, returnByValue: true, awaitPromise: true, userGesture: true,
  }, sessionId);
  if (result.exceptionDetails) throw new Error("evaluate failed: " + result.exceptionDetails.text);
  return result.result ? result.result.value : null;
}
async function waitFor(fn, label, timeoutMs) {
  const started = Date.now();
  const limit = timeoutMs || 15000;
  while (Date.now() - started < limit) {
    try { const value = await fn(); if (value) return value; } catch (error) { /* retry */ }
    await sleep(150);
  }
  throw new Error("timeout: " + label);
}
async function waitServer(port) {
  return waitFor(async () => {
    try {
      const response = await fetch("http://127.0.0.1:" + port + "/__rl/status");
      return response.ok ? await response.json() : null;
    } catch (error) { return null; }
  }, "ledger server " + port, 15000);
}
function startServer(port) {
  return spawn(process.execPath, [
    path.join(ROOT, "scripts", "serve.cjs"),
    "--port", String(port),
    "--auto-stop=300",
    "--lock", path.join(TMP, "presence.lock"),
  ], { cwd: ROOT, stdio: "ignore", windowsHide: true });
}
function stopChild(child) {
  if (!child || child.killed) return;
  try { child.kill(); } catch (error) { /* ignore */ }
}
function startPlainServer(port) {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end("<!DOCTYPE html><html><head><title>Plain</title></head><body><h1>Plain page</h1></body></html>");
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

async function connect() {
  const version = await waitEndpoint(CDP_PORT, 20000);
  const cdp = new CDP(version.webSocketDebuggerUrl);
  /* Unpacked extensions are not persisted across a browser relaunch; load the
     same pinned id into the existing profile so chrome.storage.local survives. */
  try { await cdp.send("Extensions.loadUnpacked", { path: EXT }); } catch (error) { /* already loaded */ }
  /* Warm the service worker before opening the test page: a real installed
     profile starts it at browser boot, so the first page must not pay the
     cold-start cost. */
  try {
    const warmTarget = await cdp.send("Target.createTarget", { url: "chrome-extension://" + EXT_ID + "/panel/panel.html?role=flyout" });
    const warmSession = await attach(cdp, warmTarget.targetId);
    await waitFor(() => evaluate(cdp, warmSession,
      "typeof chrome !== 'undefined' && !!(chrome.storage && chrome.storage.local)"), "extension ready", 8000);
    const warm = await evaluate(cdp, warmSession, `new Promise((resolve) => {
      let tries = 0;
      const go = () => {
        tries += 1;
        try {
          chrome.runtime.sendMessage({ type: "RL_APP_PRESENCE", port: 0 }, (response) => {
            const error = chrome.runtime.lastError;
            if (error || !response) {
              if (tries < 20) { setTimeout(go, 300); return; }
              resolve({ ok: false, error: error ? String(error.message || error) : "no response" });
              return;
            }
            resolve({ ok: true, response });
          });
        } catch (error) {
          if (tries < 20) { setTimeout(go, 300); return; }
          resolve({ ok: false, error: error.message });
        }
      };
      go();
    })`);
    await cdp.send("Target.closeTarget", { targetId: warmTarget.targetId });
    await sleep(300);
  } catch (error) { /* the page-level probe still works */ }
  return cdp;
}
async function quitChrome(child) {
  if (!child) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  try { child.kill(); } catch (error) { /* ignore */ }
  await Promise.race([exited, sleep(5000)]);
  await waitPortFree(CDP_PORT, 10000);
}
async function openPlain(cdp, plainUrl) {
  const target = await cdp.send("Target.createTarget", { url: plainUrl });
  const session = await attach(cdp, target.targetId);
  await sleep(700);
  return { targetId: target.targetId, session };
}
async function hostState(cdp, session) {
  return evaluate(cdp, session, `(() => {
    let presence = null;
    try { presence = JSON.parse(document.documentElement.getAttribute('data-rl-presence') || 'null'); }
    catch (error) { presence = null; }
    return {
      host: !!document.getElementById('rl-host'),
      iframes: document.querySelectorAll('iframe[src*="panel.html"]').length,
      launcher: !!document.querySelector('#rl-host .launcher, #rl-host .rail-launcher'),
      debug: presence
    };
  })()`);
}
async function seedStalePresence(cdp, appPort) {
  const target = await cdp.send("Target.createTarget", { url: "chrome-extension://" + EXT_ID + "/panel/panel.html?role=flyout" });
  const session = await attach(cdp, target.targetId);
  await sleep(700);
  const seeded = await evaluate(cdp, session, `new Promise((resolve) => {
    chrome.storage.local.set({
      "rl-app-alive": true,
      "rl-app-alive-at": 1,
      "rl-app-mode": "server",
      "rl-app-port": ${Number(appPort)}
    }, () => chrome.storage.local.get(["rl-app-alive", "rl-app-alive-at", "rl-app-port"], (values) => resolve(values)));
  })`);
  await cdp.send("Target.closeTarget", { targetId: target.targetId });
  return seeded;
}
async function waitHost(sessionRef, cdp, expected, label, timeoutMs) {
  return waitFor(async () => {
    const state = await hostState(cdp, sessionRef.session);
    return state.host === expected ? state : null;
  }, label, timeoutMs);
}

async function main() {
  /* server-disk reset */
  try { fs.rmSync(path.join(ROOT, "projects"), { recursive: true, force: true }); } catch (error) { /* ignore */ }
  try { fs.rmSync(path.join(ROOT, "backups"), { recursive: true, force: true }); } catch (error) { /* ignore */ }
  try { fs.rmSync(path.join(ROOT, "deleted-projects"), { recursive: true, force: true }); } catch (error) { /* ignore */ }
  try { fs.rmSync(path.join(ROOT, "rl-config.json"), { force: true }); } catch (error) { /* ignore */ }
  fs.mkdirSync(TMP, { recursive: true });
  fs.rmSync(PROFILE, { recursive: true, force: true });
  if (!fs.existsSync(path.join(EXT, "manifest.json"))) throw new Error("dist/extension missing");

  const appPort = await freePort();
  const plainPort = await freePort();
  const plainServer = await startPlainServer(plainPort);
  const plainUrl = "http://127.0.0.1:" + plainPort + "/plain.html";
  let chrome = null;
  let ledger = null;
  try {
    /* ---------- 1. stale true + browser restart, server off ---------- */
    chrome = launchChrome();
    let cdp = await connect();
    const seeded = await seedStalePresence(cdp, appPort);
    check("test seeds a stale rl-app-alive:true", seeded["rl-app-alive"] === true && Number(seeded["rl-app-alive-at"]) === 1, seeded);
    await quitChrome(chrome);

    chrome = launchChrome();
    cdp = await connect();
    const plainA = await openPlain(cdp, plainUrl);
    check("the content script runs on the plain page", await waitFor(async () => {
      return evaluate(cdp, plainA.session,
        "!!document.documentElement.getAttribute('data-rl-presence')");
    }, "presence attribute", 8000).then(() => true).catch(() => false));

    let everMounted = false;
    const staleStart = Date.now();
    while (Date.now() - staleStart < 4500) {
      const state = await hostState(cdp, plainA.session).catch(() => null);
      if (state && (state.host || state.iframes > 0 || (state.debug && state.debug.mounts > 0))) everMounted = true;
      await sleep(150);
    }
    const staleFinal = await hostState(cdp, plainA.session);
    check("a stale true never mounts after a browser restart (no host/iframe/mount attempt)",
      everMounted === false && staleFinal.host === false && staleFinal.iframes === 0 &&
      !!staleFinal.debug && staleFinal.debug.mounts === 0 && staleFinal.debug.host === false,
      { everMounted, staleFinal });

    /* ---------- 2. server running: start while the browser is open ---------- */
    ledger = startServer(appPort);
    await waitServer(appPort);
    const appeared = await waitHost(plainA, cdp, true, "dock appears after the server starts", 8000);
    check("dock appears within the poll window when the server starts", appeared.host === true, appeared);
    check("the dock mounted exactly once", appeared.debug && appeared.debug.mounts === 1, appeared);

    /* ---------- 3. two tabs hide and return without a reload ---------- */
    const plainB = await openPlain(cdp, plainUrl);
    await waitHost(plainB, cdp, true, "second tab dock", 6000);
    stopChild(ledger);
    ledger = null;
    await waitPortFree(appPort, 12000);
    const hiddenA = await waitHost(plainA, cdp, false, "first tab hides after server stop", 9000);
    const hiddenB = await waitHost(plainB, cdp, false, "second tab hides after server stop", 9000);
    check("closing the server hides the dock in both tabs without a reload",
      hiddenA.host === false && hiddenB.host === false);

    ledger = startServer(appPort);
    await waitServer(appPort);
    const backA = await waitHost(plainA, cdp, true, "first tab returns", 9000);
    const backB = await waitHost(plainB, cdp, true, "second tab returns", 9000);
    check("starting the server brings the dock back in both tabs",
      backA.host === true && backB.host === true);

    /* ---------- 4. browser restart with the server running ---------- */
    await quitChrome(chrome);
    chrome = launchChrome();
    cdp = await connect();
    const plainC = await openPlain(cdp, plainUrl);
    const readyAt = Date.now();
    const auto = await waitHost(plainC, cdp, true, "dock after browser restart with server on", 5000);
    const afterReady = Date.now() - readyAt;
    const inPageMs = await evaluate(cdp, plainC.session, "Math.round(performance.now())");
    check("dock appears automatically within ~2 s after a browser restart (server on)",
      auto.host === true && auto.debug && auto.debug.mounts === 1 && inPageMs <= 2500,
      { auto, afterReady, inPageMs });

    /* ---------- 5. file:// app mode ---------- */
    stopChild(ledger);
    ledger = null;
    await waitPortFree(appPort, 12000);
    await waitHost(plainC, cdp, false, "plain tab hides before file mode", 9000);

    const fileTarget = await cdp.send("Target.createTarget", { url: "file:///" + path.join(ROOT, "index.html").replace(/\\/g, "/") });
    const fileSession = await attach(cdp, fileTarget.targetId);
    await sleep(900);
    const fileAppears = await waitFor(async () => {
      const state = await hostState(cdp, fileSession);
      return state.host === true ? state : null;
    }, "file app dock", 6000);
    const plainSeesFile = await waitHost(plainC, cdp, true, "plain tab sees the file app", 6000);
    check("file:// app mode shows the dock while the app page is open",
      fileAppears.host === true && plainSeesFile.host === true, { fileAppears, plainSeesFile });

    await cdp.send("Target.closeTarget", { targetId: fileTarget.targetId });
    const plainAfterFile = await waitHost(plainC, cdp, false, "plain tab hides after the file app closes", 8000);
    check("closing the file:// app page hides the dock without a reload",
      plainAfterFile.host === false, plainAfterFile);

    const errors = cdp.events.filter((event) => event.method === "Runtime.exceptionThrown");
    check("no uncaught errors in the presence flow", errors.length === 0,
      errors.slice(0, 3).map((event) => (event.params.exceptionDetails || {}).text));
  } finally {
    await quitChrome(chrome);
    stopChild(ledger);
    try { plainServer.close(); } catch (error) { /* ignore */ }
    for (const dir of ["projects", "backups", "deleted-projects"]) {
      try { fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true }); } catch (error) { /* ignore */ }
    }
    try { fs.rmSync(path.join(ROOT, "rl-config.json"), { force: true }); } catch (error) { /* ignore */ }
    try { fs.rmSync(path.join(TMP, "presence.lock"), { force: true }); } catch (error) { /* ignore */ }
  }

  const passed = checks.filter((item) => item.ok).length;
  console.log("\n" + passed + "/" + checks.length + " checks passed");
  if (passed !== checks.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error("PRESENCE E2E ERROR:", error.message);
  process.exitCode = 1;
});
