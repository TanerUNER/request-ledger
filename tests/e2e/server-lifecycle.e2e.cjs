#!/usr/bin/env node
"use strict";

/*
  Local server lifecycle E2E.

  Proves:
    - a backgrounded (hidden) app tab does not let the idle timer close the
      server for two minutes;
    - F5 reloads on the same port;
    - a second start on the same port stops/reuses the same app instead of
      silently moving to a different origin;
    - a genuinely busy unrelated port falls back with a visible warning URL.

  Run from _source:
    node tests/e2e/server-lifecycle.e2e.cjs

  This test intentionally waits the full two-minute hidden window.
*/

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const TMP = path.resolve(ROOT, "..", ".opencode", "workspace", "tmp", "bridge-fixes");
const SHOT_DIR = path.resolve(ROOT, "..", ".opencode", "workspace", "reports", "bridge-fixes");
const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const PORT = 9338;
const HIDDEN_WAIT_MS = Number(process.env.RL_LIFECYCLE_WAIT_MS || 125000);
const PROFILE = path.join(os.tmpdir(), "rl-server-lifecycle-e2e-profile");

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

function waitServer(port, expectedPid) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = async () => {
      try {
        const response = await fetch("http://127.0.0.1:" + port + "/__rl/status");
        if (response.ok) {
          const data = await response.json();
          if (!expectedPid || Number(data.pid) === Number(expectedPid)) return resolve(data);
        }
      } catch (error) { /* not ready */ }
      if (Date.now() - started > 12000) return reject(new Error("server did not start on " + port));
      setTimeout(tick, 150);
    };
    tick();
  });
}

function startServer(port, lockName) {
  return spawn(process.execPath, [
    path.join(ROOT, "scripts", "serve.cjs"),
    "--port", String(port),
    "--fallback-port-0",
    "--auto-stop=300",
    "--lock", path.join(TMP, lockName),
  ], {
    cwd: ROOT,
    stdio: "ignore",
    windowsHide: true,
  });
}

function stopChild(child) {
  if (!child || child.killed) return;
  try { child.kill(); } catch (error) { /* ignore */ }
}

async function waitPortFree(port) {
  const started = Date.now();
  while (Date.now() - started < 8000) {
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
  } catch (error) {
    return false;
  }
}

async function main() {
  fs.mkdirSync(TMP, { recursive: true });
  fs.rmSync(PROFILE, { recursive: true, force: true });

  const portFile = path.join(ROOT, ".rl-port");
  const previousPortFile = fs.existsSync(portFile) ? fs.readFileSync(portFile) : null;
  const portA = await freePort();
  const portBusy = await freePort();
  let serverA = startServer(portA, "lifecycle-a.lock");
  let serverB = null;
  let serverC = null;
  let dummy = null;
  let chrome = null;

  try {
    let statusA = await waitServer(portA);
    check("server starts on the requested port", statusA.port === portA, statusA);

    chrome = spawn(chromePath(), [
      "--user-data-dir=" + PROFILE,
      "--remote-debugging-port=" + PORT,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-search-engine-choice-screen",
      "--window-size=1280,900",
      "about:blank",
    ], { stdio: "ignore" });

    const version = await waitEndpoint(PORT, 20000);
    const cdp = new CDP(version.webSocketDebuggerUrl);
    const appTarget = await cdp.send("Target.createTarget", { url: "http://localhost:" + portA + "/index.html" });
    const appSession = await attach(cdp, appTarget.targetId);
    await sleep(1800);
    statusA = await waitFor(async () => {
      const response = await fetch("http://127.0.0.1:" + portA + "/__rl/status");
      const data = response.ok ? await response.json() : null;
      return data && data.heartbeatSeen && data.livePage ? data : null;
    }, "page heartbeat", 12000);
    check("app marks the server as live", statusA.livePage === true && statusA.heartbeatSeen === true, statusA);

    /* Hide the app tab for the full two-minute window. A throttled heartbeat
       must not close the server because livePage stays true. */
    const hidden = await cdp.send("Target.createTarget", { url: "about:blank" });
    await cdp.send("Target.activateTarget", { targetId: hidden.targetId });
    console.log("waiting " + Math.round(HIDDEN_WAIT_MS / 1000) + "s with the app tab hidden...");
    await sleep(HIDDEN_WAIT_MS);
    const hiddenStatus = await waitFor(async () => {
      try {
        const response = await fetch("http://127.0.0.1:" + portA + "/__rl/status");
        return response.ok ? await response.json() : null;
      } catch (error) { return null; }
    }, "server alive after hidden window", 3000);
    check("server survives a hidden app tab", hiddenStatus && hiddenStatus.port === portA && hiddenStatus.livePage === true, hiddenStatus);

    await cdp.send("Target.activateTarget", { targetId: appTarget.targetId });
    await sleep(400);
    await cdp.send("Page.reload", {}, appSession);
    await sleep(2000);
    const reloadStatus = await waitFor(async () => {
      const response = await fetch("http://127.0.0.1:" + portA + "/__rl/status");
      const data = response.ok ? await response.json() : null;
      return data && data.livePage && data.port === portA ? data : null;
    }, "same port after reload", 10000);
    check("F5 keeps the same port", reloadStatus.port === portA, reloadStatus);
    check("F5 rejoins as a live page", reloadStatus.livePage === true, reloadStatus);
    await screenshot(cdp, appSession, "01-server-survived-reload.png");

    /* A second launcher on the same port must stop/reuse the same app, not
       jump to another origin. */
    const oldPid = reloadStatus.pid;
    const firstExit = new Promise((resolve) => serverA.once("exit", () => resolve(true)));
    serverB = startServer(portA, "lifecycle-b.lock");
    const reused = await waitFor(async () => {
      try {
        const response = await fetch("http://127.0.0.1:" + portA + "/__rl/status");
        const data = response.ok ? await response.json() : null;
        return data && Number(data.pid) !== Number(oldPid) ? data : null;
      } catch (error) { return null; }
    }, "same-app port reuse", 12000);
    check("same app reuses the requested port", reused.port === portA && Number(reused.pid) !== Number(oldPid), reused);

    const exited = serverA.exitCode !== null ? true : await Promise.race([
      firstExit,
      sleep(5000).then(() => false),
    ]);
    check("previous same-app server exits", exited === true);
    serverA = null;

    /* A genuinely unrelated process on the requested port forces fallback.
       The page URL must carry the warning marker and the page must show it. */
    dummy = http.createServer((request, response) => {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not the ledger");
    });
    await new Promise((resolve, reject) => {
      dummy.once("error", reject);
      dummy.listen(portBusy, "127.0.0.1", resolve);
    });
    serverC = startServer(portBusy, "lifecycle-c.lock");
    const fallback = await waitFor(async () => {
      try {
        const response = await fetch("http://127.0.0.1:" + portBusy + "/__rl/status");
        if (response.ok) return await response.json();
      } catch (error) { /* fallback server uses another port */ }
      /* Probe the port file written by the fallback server. */
      try {
        const value = Number(fs.readFileSync(path.join(ROOT, ".rl-port"), "utf8").trim());
        if (!value) return null;
        const response = await fetch("http://127.0.0.1:" + value + "/__rl/status");
        const data = response.ok ? await response.json() : null;
        return data && data.port !== portBusy && data.fallbackFromPort === portBusy ? data : null;
      } catch (error) { return null; }
    }, "fallback status", 12000);
    check("busy unrelated port falls back", fallback.port !== portBusy && fallback.fallbackFromPort === portBusy, fallback);
    check("fallback URL carries the warning marker", fallback.url.indexOf("rl-moved=" + portBusy) >= 0, fallback.url);

    const fallbackTarget = await cdp.send("Target.createTarget", { url: fallback.url });
    const fallbackSession = await attach(cdp, fallbackTarget.targetId);
    await sleep(2200);
    let warning = null;
    try {
      warning = await waitFor(() => evaluate(cdp, fallbackSession,
        "document.getElementById('movedPortModal').classList.contains('is-open')"), "fallback warning modal", 10000);
    } catch (error) { warning = false; }
    check("fallback warning is visible", warning === true);
    await screenshot(cdp, fallbackSession, "02-fallback-warning.png");

    const errors = cdp.events.filter((event) => event.method === "Runtime.exceptionThrown");
    check("no uncaught errors in server lifecycle flow", errors.length === 0,
      errors.slice(0, 3).map((event) => (event.params.exceptionDetails || {}).text));
  } finally {
    stopChild(serverA);
    stopChild(serverB);
    stopChild(serverC);
    if (dummy) {
      try { dummy.close(); } catch (error) { /* ignore */ }
    }
    if (chrome) {
      try { chrome.kill(); } catch (error) { /* ignore */ }
    }
    try { await waitPortFree(portA); } catch (error) { /* ignore */ }
    try {
      if (previousPortFile) fs.writeFileSync(portFile, previousPortFile);
      else fs.rmSync(portFile, { force: true });
    } catch (error) { /* ignore */ }
    for (const name of ["lifecycle-a.lock", "lifecycle-b.lock", "lifecycle-c.lock"]) {
      try { fs.rmSync(path.join(TMP, name), { force: true }); } catch (error) { /* ignore */ }
    }
  }

  const failed = checks.filter((entry) => !entry.ok);
  console.log("\n" + (checks.length - failed.length) + "/" + checks.length + " checks passed");
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error("SERVER LIFECYCLE E2E ERROR:", error.message);
  process.exit(1);
});
