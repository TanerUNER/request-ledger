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
const EXT = path.join(ROOT, "dist", "extension");
const TMP = path.resolve(ROOT, "..", ".opencode", "workspace", "tmp", "bridge-fixes");
const SHOT_DIR = path.resolve(ROOT, "..", ".opencode", "workspace", "reports", "bridge-fixes");
const EXT_ID = "hapajcbgcfllhkiohhkechekajencdod";
const P_LIFE = "prj_lifecycle_test";
const L_LIFE = "ledger_lifecycle_test";
const LIFE_STAMP = "2026-11-09T10:00:00.000Z";
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

async function primeServer(port) {
  const started = Date.now();
  while (Date.now() - started < 8000) {
    try {
      const response = await fetch("http://127.0.0.1:" + port + "/__rl/heartbeat", { method: "POST" });
      if (response.ok) return true;
    } catch (error) { /* not listening yet */ }
    await sleep(100);
  }
  return false;
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

const lifeRequest = {
  id: "IST-LIFE", type: "update", title: "Lifecycle request", page: "", location: "",
  consoleError: "", description: "Lifecycle request", priority: "normal", link: "",
  sampleWebsite: "", note: "", images: [], attachments: [], confirmed: false,
  collapsed: true, createdAt: LIFE_STAMP, updatedAt: LIFE_STAMP
};

function seedLifecycleExpression() {
  const project = {
    id: P_LIFE, name: "Lifecycle Project", createdAt: LIFE_STAMP, updatedAt: LIFE_STAMP,
    ledgerId: L_LIFE, exportTarget: "", archiveCollapsed: false
  };
  const registry = { version: 1, activeId: P_LIFE, projects: [project] };
  const ledger = {
    version: 2, project: "Lifecycle Project", projectCreated: true, ledgerId: L_LIFE,
    updatedAt: LIFE_STAMP, requests: [lifeRequest], agents: [], language: "en",
    exportBehavior: "default", lastExport: null
  };
  return `(() => {
    localStorage.setItem('rl-onboarding-v1', '1');
    localStorage.setItem('oz-projeler-v1', ${JSON.stringify(JSON.stringify(registry))});
    localStorage.setItem('oz-istek-defteri-p-${P_LIFE}', ${JSON.stringify(JSON.stringify(ledger))});
    return true;
  })()`;
}

async function attachPanel(cdp) {
  const targets = await waitFor(async () => {
    const current = await cdp.send("Target.getTargets");
    const dock = current.targetInfos.find((target) => target.url.includes("role=dock"));
    const flyout = current.targetInfos.find((target) => target.url.includes("role=flyout"));
    return dock && flyout ? { dock, flyout } : null;
  }, "panel iframes", 20000);
  return {
    dockSession: await attach(cdp, targets.dock.targetId),
    flyoutSession: await attach(cdp, targets.flyout.targetId)
  };
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
  let serverD = null;
  let dummy = null;
  let chrome = null;

  try {
    let statusA = await waitServer(portA);
    check("server starts on the requested port", statusA.port === portA, statusA);

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
    const appTarget = await cdp.send("Target.createTarget", { url: "http://localhost:" + portA + "/index.html" });
    let appSession = await attach(cdp, appTarget.targetId);
    await sleep(500);
    await evaluate(cdp, appSession, seedLifecycleExpression() + "; location.reload();");
    await sleep(2400);
    appSession = await attach(cdp, appTarget.targetId);
    await waitFor(() => evaluate(cdp, appSession,
      "window.__rlBridge && window.__rlBridge.projectId() === " + JSON.stringify(P_LIFE)), "seeded lifecycle project", 15000);
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

    /* Open the extension panel on the app page. Its bridge must adopt the
       seeded project before the stop/restart sequence begins. */
    await evaluate(cdp, appSession, `(() => {
      const button = document.getElementById('rl-launcher');
      if (button) button.click();
      return true;
    })()`);
    let panel = await attachPanel(cdp);
    await waitFor(() => evaluate(cdp, panel.flyoutSession,
      "window.__rlBridgePanel && window.__rlBridgePanel.connected()"), "panel connected before stop", 20000);
    await waitFor(() => evaluate(cdp, panel.flyoutSession,
      "window.__rlBridgePanel.projectId() === " + JSON.stringify(P_LIFE)), "panel adopted lifecycle project", 20000);
    check("panel connects to the seeded project before the stop",
      await evaluate(cdp, panel.flyoutSession,
        "window.__rlBridgePanel.ledgerId() === " + JSON.stringify(L_LIFE)) === true);

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
    /* Emulate the page load that start.cmd opens: one heartbeat keeps the
       fresh process from treating itself as never-seen and idling out before
       the existing tab's 5 s beat. */
    await primeServer(portA);

    const exited = serverA.exitCode !== null ? true : await Promise.race([
      firstExit,
      sleep(5000).then(() => false),
    ]);
    check("previous same-app server exits", exited === true);
    serverA = null;

    /* Explicit Stop from the app: the app becomes blocked, the heartbeat and
       bridge stop, and the panel switches to "App server stopped" without
       applying further bridge traffic. */
    const reachablePid = await waitFor(async () => {
      const pid = await evaluate(cdp, appSession,
        "fetch('/__rl/status', { cache:'no-store' }).then(function(r){ return r.ok ? r.json() : null; }).then(function(d){ return d && Number(d.pid) || 0; }).catch(function(){ return 0; })");
      return pid > 0 ? pid : null;
    }, "app reaches the reused server before stop", 15000);
    check("app reaches the active server before Stop", reachablePid > 0, reachablePid);
    const stoppedPid = reused.pid;
    await evaluate(cdp, appSession, "document.getElementById('railStopBtn').click()");
    await waitFor(() => evaluate(cdp, appSession,
      "document.getElementById('confirmModal').classList.contains('is-open')"), "stop confirmation", 5000);
    await evaluate(cdp, appSession, "document.getElementById('confirmOkBtn').click()");
    const blocked = await waitFor(() => evaluate(cdp, appSession, `(() => {
      const state = {
        visible: !document.getElementById('serverBlocked').hidden,
        inert: document.getElementById('main').inert === true,
        serverStopped: window.__rlBridge && window.__rlBridge.serverStopped()
      };
      return state.visible && state.inert && state.serverStopped ? state : null;
    })()`), "app server blocked state", 10000);
    check("Stop: app shows the blocked server state",
      blocked.visible === true && blocked.inert === true && blocked.serverStopped === true, blocked);
    const panelStopped = await waitFor(() => evaluate(cdp, panel.flyoutSession, `(() => {
      const state = {
        stopped: window.__rlBridgePanel.serverStopped(),
        connected: window.__rlBridgePanel.connected()
      };
      return state.stopped && !state.connected ? state : null;
    })()`), "panel app-server-stopped state", 10000);
    check("panel reports App server stopped and disconnects",
      panelStopped.stopped === true && panelStopped.connected === false, panelStopped);
    await evaluate(cdp, panel.dockSession, "window.RLPanel.open('settings')");
    await sleep(600);
    const panelStopText = await evaluate(cdp, panel.flyoutSession,
      "(document.getElementById('rl-bridge-text') || {}).textContent || ''");
    check("panel visibly shows App server stopped", /App server stopped/i.test(panelStopText), panelStopText);
    await screenshot(cdp, appSession, "05-server-blocked.png");
    const stoppedApp = await evaluate(cdp, appSession, `(() => {
      const raw = localStorage.getItem('oz-istek-defteri-p-${P_LIFE}');
      const value = raw ? JSON.parse(raw) : null;
      return value && value.requests ? value.requests.map((item) => item.title) : [];
    })()`);
    check("stopped app keeps local ledger data", stoppedApp.indexOf("Lifecycle request") >= 0, stoppedApp);
    const processExited = await Promise.race([
      new Promise((resolve) => {
        if (serverB.exitCode !== null) return resolve(true);
        serverB.once("exit", () => resolve(true));
      }),
      sleep(8000).then(() => false)
    ]);
    check("Stop actually shuts the server process down", processExited === true);
    if (serverB) {
      stopChild(serverB);
      serverB = null;
    }
    await waitFor(async () => {
      try {
        const response = await fetch("http://127.0.0.1:" + portA + "/__rl/status");
        return !response.ok;
      } catch (error) {
        return true;
      }
    }, "port free after stop", 12000).catch(() => false);

    /* start.cmd on the same port must reconnect the same pair automatically. */
    serverD = startServer(portA, "lifecycle-d.lock");
    await primeServer(portA);
    const restarted = await waitFor(async () => {
      try {
        const response = await fetch("http://127.0.0.1:" + portA + "/__rl/status");
        const data = response.ok ? await response.json() : null;
        return data && Number(data.pid) !== Number(stoppedPid) ? data : null;
      } catch (error) { return null; }
    }, "server restart on the same port", 15000);
    check("start.cmd restarts on the same port", restarted.port === portA, restarted);
    /* start.cmd also opens the app, which sends a heartbeat at once. The test
       has no visible second window, so keep the fresh server alive while the
       blocked tab's reconnect poll runs. */
    const keepAlive = setInterval(() => {
      fetch("http://127.0.0.1:" + portA + "/__rl/heartbeat", { method: "POST" }).catch(() => {});
    }, 700);
    await sleep(4200);
    appSession = await attach(cdp, appTarget.targetId);
    try{
      await waitFor(() => evaluate(cdp, appSession,
        "window.__rlBridge && !window.__rlBridge.serverStopped() && window.__rlBridge.connected()"), "app reconnects after restart", 20000);
    }finally{
      clearInterval(keepAlive);
    }
    const appReconnected = await evaluate(cdp, appSession, `(() => ({
      blocked: !document.getElementById('serverBlocked').hidden,
      conflict: document.getElementById('confirmModal').classList.contains('is-open'),
      ledgerId: window.__rlBridge.ledgerId(),
      title: (document.getElementById('title-IST-LIFE') || {}).value || '',
      rows: Array.from(document.querySelectorAll('.req')).length
    }))()`);
    check("restart clears the blocked app state and reconnect conflict",
      appReconnected.blocked === false && appReconnected.conflict === false &&
      appReconnected.ledgerId === L_LIFE && appReconnected.rows === 1, appReconnected);
    panel = await attachPanel(cdp);
    const panelReconnected = await waitFor(() => evaluate(cdp, panel.flyoutSession, `(() => {
      const state = {
        stopped: window.__rlBridgePanel.serverStopped(),
        connected: window.__rlBridgePanel.connected(),
        ledgerId: window.__rlBridgePanel.ledgerId()
      };
      return !state.stopped && state.connected ? state : null;
    })()`), "panel reconnects after restart", 20000);
    check("panel reconnects without a conflict and keeps the ledger",
      panelReconnected.stopped === false && panelReconnected.connected === true &&
      panelReconnected.ledgerId === L_LIFE, panelReconnected);
    check("data survives the stop/restart pair",
      await evaluate(cdp, appSession,
        "Array.from(document.querySelectorAll('.req')).some((row) => /Lifecycle request/.test(row.innerText))") === true);

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
    stopChild(serverD);
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
    for (const name of ["lifecycle-a.lock", "lifecycle-b.lock", "lifecycle-c.lock", "lifecycle-d.lock"]) {
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
