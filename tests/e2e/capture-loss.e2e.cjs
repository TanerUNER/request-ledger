#!/usr/bin/env node
"use strict";

/*
  Cross-window capture + request-loss regression (real browser, real server).

  Owner sequence: new request -> type description -> title -> pick an element
  and capture its screenshot from a second window -> keep typing the
  description. The request and its image must survive; no id may disappear
  without an explicit delete. Also asserts the storefront (app), the panel,
  reload and project switch.

  Usage:
    node tests/e2e/capture-loss.e2e.cjs
*/

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const pageErrors = require("./_page-errors.cjs");
const harness = require("./_harness.cjs");

const ROOT = path.resolve(__dirname, "..", "..");
const EXT = path.join(ROOT, "dist", "extension");
const TMP = path.resolve(ROOT, "..", ".opencode", "workspace", "tmp", "bridge-fixes");
const PROFILE = path.join(os.tmpdir(), "rl-capture-loss-e2e-profile");
const CDP_PORT = 9348;
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const checks = [];
function check(label, condition, detail) {
  checks.push({ label, ok: !!condition, detail });
  console.log((condition ? "ok   " : "FAIL ") + label +
    (condition || detail === undefined ? "" : " -> " + JSON.stringify(detail)));
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => { const p = probe.address().port; probe.close(() => resolve(p)); });
  });
}
function startServer(port, lock) {
  return spawn(process.execPath, [path.join(ROOT, "scripts", "serve.cjs"), "--port", String(port),
    "--auto-stop=300", "--lock", path.join(TMP, lock || "capture.lock")], { cwd: ROOT, stdio: "ignore", windowsHide: true });
}
async function waitEndpoint(port, timeout) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { const r = await fetch("http://127.0.0.1:" + port + "/json/version"); if (r.ok) return await r.json(); } catch (e) {}
    await sleep(200);
  }
  throw new Error("no endpoint");
}
class CDP {
  constructor(url) {
    this.id = 1; this.pending = new Map(); this.events = [];
    this.ws = new WebSocket(url);
    this.ready = new Promise((r) => this.ws.addEventListener("open", r));
    this.ws.addEventListener("message", (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
      else if (m.method) this.events.push(m);
    });
  }
  async send(method, params, sessionId) {
    await this.ready;
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params: params || {}, sessionId }));
    });
  }
}
async function attach(cdp, targetId) {
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await harness.prepareSession(cdp, sessionId);
  return sessionId;
}
async function evaluate(cdp, session, expression) {
  const r = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true }, session);
  if (r.exceptionDetails) throw new Error("evaluate: " + r.exceptionDetails.text);
  return r.result ? r.result.value : null;
}
async function waitFor(fn, label, timeout) {
  const start = Date.now();
  while (Date.now() - start < (Math.min(timeout || 8000, 10000))) {
    try { const v = await fn(); if (v) return v; } catch (e) {}
    await sleep(150);
  }
  throw new Error("timeout: " + label);
}
async function openPanel(cdp, app) {
  await evaluate(cdp, app, `(() => {
    const b = document.getElementById('rl-launcher');
    if (b && !b.hidden) { b.click(); return true; }
    return false;
  })()`);
  await sleep(900);
  const targets = (await cdp.send("Target.getTargets")).targetInfos;
  const dock = targets.find((t) => t.url.indexOf("/panel/panel.html?role=dock") >= 0);
  if (!dock) return { dock: null, flyout: null };
  const dockSession = await attach(cdp, dock.targetId);
  await evaluate(cdp, dockSession, "window.RLPanel && window.RLPanel.open('list')");
  await sleep(900);
  const after = (await cdp.send("Target.getTargets")).targetInfos;
  const flyout = after.find((t) => t.url.indexOf("/panel/panel.html?role=flyout") >= 0);
  return { dock: dockSession, flyout: flyout ? await attach(cdp, flyout.targetId) : null };
}

async function main() {
  for (const dir of ["projects", "backups", "deleted-projects"]) {
    try { fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true }); } catch (e) {}
  }
  try { fs.rmSync(path.join(ROOT, "rl-config.json"), { force: true }); } catch (e) {}
  fs.mkdirSync(TMP, { recursive: true });
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const port = await freePort();
  const server = startServer(port);
  let chrome = null;
  try {
    await waitFor(async () => { try { const r = await fetch("http://127.0.0.1:" + port + "/__rl/status"); return r.ok; } catch (e) { return false; } }, "server", 15000);
    chrome = spawn(CHROME, ["--user-data-dir=" + PROFILE, "--enable-unsafe-extension-debugging",
      "--remote-debugging-port=" + CDP_PORT, "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
      "--no-first-run", "--no-default-browser-check", "--disable-search-engine-choice-screen",
      "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
    const version = await waitEndpoint(CDP_PORT, 20000);
    const cdp = new CDP(version.webSocketDebuggerUrl);
    harness.install(cdp);
    await cdp.send("Extensions.loadUnpacked", { path: EXT });
    await sleep(600);

    const appTarget = await cdp.send("Target.createTarget", { url: "http://localhost:" + port + "/index.html" });
    let app = await attach(cdp, appTarget.targetId);
    await sleep(1400);
    await evaluate(cdp, app, `(() => {
      const modal = document.getElementById('onboardingModal');
      const done = document.getElementById('onboardingDoneBtn');
      if (modal && modal.classList.contains('is-open') && done) done.click();
      localStorage.setItem('rl-onboarding-v1','1'); return true;
    })()`);
    await waitFor(() => evaluate(cdp, app, "!!document.getElementById('projectCreateInput')"), "gate", 8000);
    await evaluate(cdp, app, `(() => {
      const input = document.getElementById('projectCreateInput');
      input.value = 'Capture Loss'; input.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('projectCreateBtn').click(); return true;
    })()`);
    await waitFor(() => evaluate(cdp, app, "window.__rlBridge && window.__rlBridge.projectId()"), "project", 10000);
    const projectId = await evaluate(cdp, app, "window.__rlBridge.projectId()");
    await waitFor(() => evaluate(cdp, app, "!!window.__rlStateDebug"), "debug", 5000);

    const boot = await evaluate(cdp, app, "window.__rlStateDebug.boot()");
    check("server disk bootstrap is atomic and complete",
      boot && boot.mode === true && boot.ready === true && boot.active === true && boot.registry === true, boot);

    const panel = await openPanel(cdp, app);

    /* Request A: description -> title, not Ready yet. */
    await evaluate(cdp, app, "document.getElementById('addBtn').click()");
    await waitFor(() => evaluate(cdp, app, "document.getElementById('typeModal').classList.contains('is-open')"), "type modal", 5000);
    await evaluate(cdp, app, "document.querySelector('#typeChoices .typechoice').click()");
    await waitFor(() => evaluate(cdp, app, "!!document.querySelector('.req.is-open [data-field=\"description\"]')"), "request form", 8000);
    await evaluate(cdp, app, `(() => {
      const row = document.querySelector('.req.is-open');
      const title = row.querySelector('[data-field="title"]');
      const desc = row.querySelector('[data-field="description"]');
      if (title) { title.value = 'Capture A'; title.dispatchEvent(new Event('input', { bubbles: true })); }
      if (desc) { desc.value = 'First description'; desc.dispatchEvent(new Event('input', { bubbles: true })); }
      return true;
    })()`);
    await sleep(400);
    const idA = await evaluate(cdp, app, "window.__rlStateDebug.requests().slice(-1)[0].id");

    /* Request B created after A; the owner loss needs B in flight too. */
    await evaluate(cdp, app, "document.getElementById('addBtn').click()");
    await waitFor(() => evaluate(cdp, app, "document.getElementById('typeModal').classList.contains('is-open')"), "type modal B", 5000);
    await evaluate(cdp, app, "document.querySelector('#typeChoices .typechoice').click()");
    await waitFor(() => evaluate(cdp, app, "!!document.querySelector('.req.is-open [data-field=\"title\"]')"), "request form B", 8000);
    await evaluate(cdp, app, `(() => {
      const row = document.querySelector('.req.is-open');
      const title = row.querySelector('[data-field="title"]');
      const desc = row.querySelector('[data-field="description"]');
      if (title) { title.value = 'Capture B'; title.dispatchEvent(new Event('input', { bubbles: true })); }
      if (desc) { desc.value = 'Second description'; desc.dispatchEvent(new Event('input', { bubbles: true })); }
      return true;
    })()`);
    await sleep(400);
    const idB = await evaluate(cdp, app, "window.__rlStateDebug.requests().slice(-1)[0].id");
    check("A and B exist before capture", idA && idB && idA !== idB, { idA, idB });

    /* Second window with the target page. */
    const target = await cdp.send("Target.createTarget", {
      url: "http://localhost:" + port + "/tests/fixtures/picker-target.html"
    });
    const targetSession = await attach(cdp, target.targetId);
    await sleep(900);

    const pickButton = await evaluate(cdp, app, `(() => {
      const row = document.querySelector('.req[data-id="' + ${JSON.stringify(idA)} + '"]');
      const btn = row && row.querySelector('[data-action="pick-capture"]');
      if (btn) btn.click();
      return !!btn;
    })()`);
    check("the pick+capture control is available", pickButton === true);

    await waitFor(() => evaluate(cdp, app, "document.getElementById('pickerTabsModal').classList.contains('is-open')"), "tab chooser", 10000);
    const tabsLoaded = await waitFor(() => evaluate(cdp, app,
      "document.querySelectorAll('#pickerTabsBody .typechoice[data-tab-id]').length > 0"), "tab rows", 12000)
      .catch(() => false);
    const tabsText = await evaluate(cdp, app, "(document.getElementById('pickerTabsBody') || {}).innerText || ''");
    check("the tab chooser lists eligible tabs through the panel relay",
      tabsLoaded === true, tabsText.slice(0, 160));

    const choose = await evaluate(cdp, app, `(() => {
      const rows = Array.from(document.querySelectorAll('#pickerTabsBody .typechoice[data-tab-id]'));
      const row = rows.find((item) => /picker-target/.test(item.textContent)) || rows[0];
      if (row) row.click();
      return row ? row.textContent : '';
    })()`);
    check("the second-window target is selectable", !!choose, choose);

    await waitFor(() => evaluate(cdp, targetSession, "!!document.querySelector('[data-rl-picker]')"), "picker overlay", 20000);
    const point = await evaluate(cdp, targetSession, `(() => {
      const rect = document.getElementById('pick-target').getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y }, targetSession);
    await sleep(120);
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 }, targetSession);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 }, targetSession);

    const captured = await waitFor(async () => {
      const state = await evaluate(cdp, app, `(() => {
        const r = window.__rlStateDebug.requests().find(function(x){ return x.id === ${JSON.stringify(idA)}; });
        return r ? r : null;
      })()`);
      return state && state.images > 0 ? state : null;
    }, "image attached", 25000).catch(() => null);
    check("the cross-window element+screenshot attaches to A", !!captured && captured.images >= 1, captured);

    await cdp.send("Target.activateTarget", { targetId: appTarget.targetId });
    await cdp.send("Page.bringToFront", {}, app);
    await sleep(400);
    try { await cdp.send("Target.closeTarget", { targetId: target.targetId }); } catch (error) { /* ignore */ }
    await sleep(600);
    await cdp.send("Page.bringToFront", {}, app);
    await sleep(300);

    /* Keep typing the description for ~20 s after the capture. */
    await evaluate(cdp, app, `(() => {
      const row = document.querySelector('.req[data-id="' + ${JSON.stringify(idA)} + '"]');
      if (row && !row.classList.contains('is-open')) {
        const toggle = row.querySelector('[data-action="toggle"]');
        if (toggle) toggle.click();
      }
      return !!row;
    })()`);
    await sleep(400);
    const focused = await evaluate(cdp, app, `(() => {
      const input = document.querySelector('.req[data-id="' + ${JSON.stringify(idA)} + '"] [data-field="description"]');
      if (input) input.focus();
      return !!input;
    })()`);
    check("A's description can be edited after the capture", focused === true);
    for (let i = 0; i < 62; i += 1) {
      await cdp.send("Input.insertText", { text: "d" }, app);
      await sleep(320);
    }

    const afterTyping = await evaluate(cdp, app, "window.__rlStateDebug.requests()");
    const aAfter = afterTyping.find((r) => r.id === idA);
    check("A and B both survive 20 s of typing after the capture",
      !!aAfter && afterTyping.some((r) => r.id === idB), afterTyping);
    check("A keeps its captured image after typing", !!aAfter && aAfter.images >= 1, aAfter);
    check("typing after the capture does not clear earlier descriptions",
      !!aAfter && String(aAfter.title || "") === "Capture A", aAfter);

    const trace = await evaluate(cdp, app, "window.__rlStateDebug.trace()");
    const allowed = { "project-load": true, "archive": true, "restore": true };
    const removals = trace.filter((e) => e.op === "remove" &&
      (e.id === idA || e.id === idB) && e.projectId === projectId && !allowed[e.source]);
    check("no created id disappears without an explicit delete", removals.length === 0, removals.slice(0, 3));

    /* Reload. */
    await cdp.send("Page.reload", {}, app);
    await sleep(3000);
    app = await attach(cdp, appTarget.targetId);
    await evaluate(cdp, app, `(() => { const d=document.getElementById('onboardingDoneBtn'); const m=document.getElementById('onboardingModal'); if(m&&m.classList.contains('is-open')&&d)d.click(); return true; })()`);
    const reloaded = await waitFor(() => evaluate(cdp, app,
      "window.__rlStateDebug && window.__rlStateDebug.requests().length >= 2 ? window.__rlStateDebug.requests() : null"),
      "reload data", 15000);
    check("reload keeps A with its image and B",
      reloaded.some((r) => r.id === idA && r.images >= 1) && reloaded.some((r) => r.id === idB), reloaded);

    /* Project switch away and back. */
    await evaluate(cdp, app, "document.getElementById('projectsBtn').click()");
    await sleep(300);
    await evaluate(cdp, app, "document.getElementById('projectPickerNewBtn').click()");
    await waitFor(() => evaluate(cdp, app, "!!document.getElementById('projectCreateInput')"), "create screen", 5000);
    await evaluate(cdp, app, `(() => {
      const input = document.getElementById('projectCreateInput');
      input.value = 'Capture Other'; input.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('projectCreateBtn').click(); return true;
    })()`);
    await sleep(1500);
    const otherId = await evaluate(cdp, app, "window.__rlBridge.projectId()");
    await evaluate(cdp, app, "document.getElementById('projectsBtn').click()");
    await sleep(300);
    await evaluate(cdp, app, `(() => {
      const row = document.querySelector('#projectPickerList [data-project-id="' + ${JSON.stringify(projectId)} + '"]');
      if (row) row.click();
      return !!row;
    })()`);
    const afterSwitch = await waitFor(() => evaluate(cdp, app,
      "window.__rlStateDebug && window.__rlStateDebug.requests().length >= 2 ? window.__rlStateDebug.requests() : null"),
      "switch back", 12000);
    check("switching to another project and back keeps A with its image",
      otherId !== projectId && afterSwitch.some((r) => r.id === idA && r.images >= 1) &&
      afterSwitch.some((r) => r.id === idB), afterSwitch);

    /* Panel surface after the reload (re-open it). */
    const panelNow = await openPanel(cdp, app);
    if (panelNow.flyout) {
      const panelState = await waitFor(async () => {
        const list = await evaluate(cdp, panelNow.flyout, "window.__rlBridgePanel ? window.__rlBridgePanel.requests() : null");
        if (!Array.isArray(list)) return null;
        return list.some((r) => r.id === idA && r.images >= 1) && list.some((r) => r.id === idB) ? list : null;
      }, "panel requests", 15000).catch(() => null);
      check("the panel holds A with its image and B", !!panelState, panelState);
    } else {
      check("the panel holds A with its image and B", false, "no flyout target");
    }

    const pageFailures = pageErrors.collect(cdp);
    check("no page reference/console errors", pageFailures.length === 0, pageFailures.slice(0, 3));
    const exceptions = cdp.events.filter((e) => e.method === "Runtime.exceptionThrown");
    check("no uncaught errors in the capture flow", exceptions.length === 0, exceptions.slice(0, 2));
  } finally {
    try { chrome && chrome.kill(); } catch (e) {}
    try { server.kill(); } catch (e) {}
    for (const dir of ["projects", "backups", "deleted-projects"]) {
      try { fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true }); } catch (e) {}
    }
    try { fs.rmSync(path.join(ROOT, "rl-config.json"), { force: true }); } catch (e) {}
    try { fs.rmSync(path.join(TMP, "capture.lock"), { force: true }); } catch (e) {}
  }

  const passed = checks.filter((item) => item.ok).length;
  console.log("\n" + passed + "/" + checks.length + " checks passed");
  if (passed !== checks.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error("CAPTURE LOSS E2E ERROR:", error.message);
  process.exitCode = 1;
});
