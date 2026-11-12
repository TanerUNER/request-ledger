#!/usr/bin/env node
"use strict";

/*
  Request-loss regression (real browser, real server).

  Owner sequence: create A -> title -> Ready -> create B -> keep typing.
  Adds a media/capture-style payload to A, a forced autosave between the two
  creations, a stale companion snapshot and a stale disk save. A and B must
  survive; A stays Ready; no id may disappear without a delete op.
*/

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const harness = require("./_harness.cjs");

const ROOT = path.resolve(__dirname, "..", "..");
const EXT = path.join(ROOT, "dist", "extension");
const TMP = path.resolve(ROOT, "..", ".opencode", "workspace", "tmp", "bridge-fixes");
const PROFILE = path.join(os.tmpdir(), "rl-request-loss-e2e-profile");
const CDP_PORT = 9349;
const EXT_ID = "hapajcbgcfllhkiohhkechekajencdod";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ONE_PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4WQAAAAASUVORK5CYII=";

const checks = [];
function check(label, condition, detail) {
  checks.push({ label, ok: !!condition, detail });
  console.log((condition ? "ok   " : "FAIL ") + label + (condition || detail === undefined ? "" : " -> " + JSON.stringify(detail)) );
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
    "--auto-stop=300", "--lock", path.join(TMP, lock || "loss.lock")], { cwd: ROOT, stdio: "ignore", windowsHide: true });
}
async function waitEndpoint(port, timeout) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { const r = await fetch("http://127.0.0.1:" + port + "/json/version"); if (r.ok) return await r.json(); } catch (e) {}
    await sleep(200);
  }
  throw new Error("no endpoint");
}
async function waitFor(fn, label, timeout) {
  const start = Date.now();
  while (Date.now() - start < (Math.min(timeout || 8000, 10000))) {
    try { const v = await fn(); if (v) return v; } catch (e) {}
    await sleep(150);
  }
  throw new Error("timeout: " + label);
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
function projectSlugFor(projectId) {
  const projectsRoot = path.join(ROOT, "projects");
  if (!fs.existsSync(projectsRoot)) return "";
  for (const name of fs.readdirSync(projectsRoot)) {
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(projectsRoot, name, "project.json"), "utf8"));
      if (meta.projectId === projectId) return name;
    } catch (e) { /* ignore */ }
  }
  return "";
}
function readDiskLedger(slug) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, "projects", slug, "ledger.json"), "utf8")); }
  catch (e) { return null; }
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
async function createRequest(cdp, app, title, description) {
  const descText = description == null ? "Description for " + title : description;
  await evaluate(cdp, app, "document.getElementById('addBtn').click()");
  await waitFor(() => evaluate(cdp, app, "document.getElementById('typeModal').classList.contains('is-open')"), "type modal", 5000);
  await evaluate(cdp, app, "document.querySelector('#typeChoices .typechoice').click()");
  await waitFor(() => evaluate(cdp, app, "!!document.querySelector('.req.is-open [data-field=\"description\"]')"), "request form", 8000);
  const values = await evaluate(cdp, app, `(() => {
    const row = document.querySelector('.req.is-open');
    if (!row) return null;
    const title = row.querySelector('[data-field="title"]');
    const desc = row.querySelector('[data-field="description"]');
    if (title) { title.value = ${JSON.stringify(title)}; title.dispatchEvent(new Event('input', { bubbles: true })); }
    if (desc) { desc.value = ${JSON.stringify(descText)}; desc.dispatchEvent(new Event('input', { bubbles: true })); }
    return { title: title ? title.value : "", description: desc ? desc.value : "" };
  })()`);
  await sleep(450);
  const id = await evaluate(cdp, app, "window.__rlStateDebug.requests().slice(-1)[0].id");
  console.log("created", id, JSON.stringify(values));
  return id;
}

async function main() {
  for (const dir of ["projects", "backups", "deleted-projects"]) {
    try { fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true }); } catch (e) {}
  }
  try { fs.rmSync(path.join(ROOT, "rl-config.json"), { force: true }); } catch (e) {}
  fs.mkdirSync(TMP, { recursive: true });
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const port = await freePort();
  let server = startServer(port);
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
      input.value = 'Loss Guard'; input.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('projectCreateBtn').click(); return true;
    })()`);
    await waitFor(() => evaluate(cdp, app, "window.__rlBridge && window.__rlBridge.projectId()"), "project", 10000);
    const projectId = await evaluate(cdp, app, "window.__rlBridge.projectId()");
    await waitFor(() => evaluate(cdp, app, "!!window.__rlStateDebug"), "debug", 5000);
    const boot = await evaluate(cdp, app, "window.__rlStateDebug.boot()");
    check("server disk bootstrap is atomic and complete",
      boot && boot.mode === true && boot.ready === true && boot.active === true && boot.registry === true, boot);

    const panel = await openPanel(cdp, app);

    /* A: title + description, then Ready immediately. */
    const idA = await createRequest(cdp, app, "Request A");
    await evaluate(cdp, app, `(() => {
      const tick = document.querySelector('.req[data-id="' + ${JSON.stringify(idA)} + '"] [data-action="tick"]');
      if (tick) tick.click();
      return !!tick;
    })()`);
    await sleep(200);
    const readyA = await evaluate(cdp, app, `window.__rlStateDebug.requests().find(function(r){ return r.id === ${JSON.stringify(idA)}; })`);
    check("A is Ready before B is created", readyA && readyA.confirmed === true, readyA);

    /* B immediately; an autosave must land between the two creations. */
    const idB = await createRequest(cdp, app, "Request B", "");
    for (let i = 0; i < 45; i += 1) {
      await cdp.send("Input.insertText", { text: "b" }, app);
      await sleep(320);
    }
    const state = await evaluate(cdp, app, "window.__rlStateDebug.requests()");
    check("A and B both exist after 15 s of typing",
      state.some((r) => r.id === idA) && state.some((r) => r.id === idB), state);
    check("A is still Ready after B typing",
      state.some((r) => r.id === idA && r.confirmed === true), state);

    /* Capture-style media payload for A (same host message path as a real capture). */
    await evaluate(cdp, app, `window.postMessage({
      source:'request-ledger-host', pageOrigin: location.origin, v:1, type:'RL_APP_MEDIA',
      appVersion:'1.10.2', rev: window.__rlBridge.rev(), ledgerId: window.__rlBridge.ledgerId(),
      projectId: window.__rlBridge.projectId(), requestId: ${JSON.stringify(idA)},
      media:[{ kind:'image', id:'img_loss_1',
        meta:{ id:'img_loss_1', name:'capture.png', type:'image/png', ext:'png', w:1, h:1, size:68 },
        dataUrl:'data:image/png;base64,${ONE_PIXEL}' }]
    }, location.origin)`);
    const withMedia = await waitFor(async () => {
      const list = await evaluate(cdp, app, "window.__rlStateDebug.requests()");
      const a = list.find((r) => r.id === idA);
      return a && a.images > 0 ? a : null;
    }, "media attached to A", 10000);
    check("a capture-style media payload attaches to A without dropping it",
      withMedia && withMedia.confirmed === true, withMedia);

    /* Stale companion snapshot missing B: version + revision guard. */
    const bData = state.find((r) => r.id === idB);
    await evaluate(cdp, app, `window.postMessage({
      source:'request-ledger-host', pageOrigin: location.origin, v:1, type:'RL_APP_SNAPSHOT',
      appVersion:'1.9.5', rev: 1, ledgerId: window.__rlBridge.ledgerId(),
      projectId: window.__rlBridge.projectId(), projectName:'Loss Guard',
      updatedAt: new Date(Date.now() + 60000).toISOString(),
      requests:[{ id:${JSON.stringify(idB)}, type:'feature', title:${JSON.stringify(bData && bData.title || "Request B")},
        confirmed:false, images:[], attachments:[], updatedAt:new Date().toISOString() }],
      agents:[], deletedIds:[]
    }, location.origin)`);
    await sleep(900);
    const afterStale = await evaluate(cdp, app, "window.__rlStateDebug.requests()");
    const toastText = await evaluate(cdp, app, "(document.getElementById('toastText')||{}).textContent || ''");
    const outdated = await evaluate(cdp, app, "window.__rlBridge.outdatedSeen()");
    check("an outdated companion snapshot cannot remove requests",
      afterStale.some((r) => r.id === idA) && afterStale.some((r) => r.id === idB) &&
      afterStale.find((r) => r.id === idA).confirmed === true, afterStale);
    check("the outdated companion shows one non-blocking notice",
      outdated === true && /Eklenti sürümü eski|outdated/i.test(toastText), { outdated, toastText });

    /* Stale disk save: server must reject a lower revision. */
    const slug = await waitFor(() => projectSlugFor(projectId) || null, "project slug", 10000);
    const diskBefore = readDiskLedger(slug);
    const staleSave = await fetch("http://127.0.0.1:" + port + "/__rl/save", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId, name: "Loss Guard", slug,
        snapshot: Object.assign({}, diskBefore, { rev: Math.max(0, Number(diskBefore.rev) - 5), requests: [] })
      })
    }).then((r) => r.json()).catch(() => null);
    const diskAfter = readDiskLedger(slug);
    check("a stale save is rejected and the disk keeps both requests",
      staleSave && staleSave.stale === true &&
      diskAfter && diskAfter.requests.some((r) => r.id === idA) && diskAfter.requests.some((r) => r.id === idB) &&
      diskAfter.requests.find((r) => r.id === idA).confirmed === true, { staleSave, rev: diskAfter && diskAfter.rev });

    /* Reload. */
    await cdp.send("Page.reload", {}, app);
    await sleep(3000);
    app = await attach(cdp, appTarget.targetId);
    await evaluate(cdp, app, `(() => { const d=document.getElementById('onboardingDoneBtn'); const m=document.getElementById('onboardingModal'); if(m&&m.classList.contains('is-open')&&d)d.click(); return true; })()`);
    const reloaded = await waitFor(() => evaluate(cdp, app, "window.__rlStateDebug && window.__rlStateDebug.requests().length >= 2 ? window.__rlStateDebug.requests() : null"), "reload data", 15000);
    check("reload keeps both requests and A Ready",
      reloaded.some((r) => r.id === idA && r.confirmed === true) && reloaded.some((r) => r.id === idB), reloaded);

    /* Project switch back. */
    await evaluate(cdp, app, "document.getElementById('projectsBtn').click()");
    await sleep(300);
    await evaluate(cdp, app, "document.getElementById('projectPickerNewBtn').click()");
    await waitFor(() => evaluate(cdp, app, "!!document.getElementById('projectCreateInput')"), "create screen", 5000);
    await evaluate(cdp, app, `(() => {
      const input = document.getElementById('projectCreateInput');
      input.value = 'Loss Other'; input.dispatchEvent(new Event('input', { bubbles: true }));
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
    const afterSwitch = await waitFor(() => evaluate(cdp, app, "window.__rlStateDebug && window.__rlStateDebug.requests().length >= 2 ? window.__rlStateDebug.requests() : null"), "switch back", 12000);
    check("switching to another project and back keeps both requests",
      otherId !== projectId && afterSwitch.some((r) => r.id === idA && r.confirmed === true) &&
      afterSwitch.some((r) => r.id === idB), afterSwitch);

    /* Trace invariant: no remove event for the created ids. */
    const trace = await evaluate(cdp, app, "window.__rlStateDebug.trace()");
    const allowed = { "project-load": true, "archive": true, "restore": true };
    const removals = trace.filter((e) => e.op === "remove" &&
      (e.id === idA || e.id === idB) && e.projectId === projectId && !allowed[e.source]);
    check("no created id disappears without an explicit delete",
      removals.length === 0, removals.slice(0, 3));

    /* Panel surface. The app was reloaded, so the earlier flyout target is
       gone; open the companion panel again and let it resync. */
    const panelNow = await openPanel(cdp, app);
    if (panelNow.flyout) {
      const panelState = await waitFor(async () => {
        const list = await evaluate(cdp, panelNow.flyout, "window.__rlBridgePanel ? window.__rlBridgePanel.requests() : null");
        if (!Array.isArray(list)) return null;
        return list.some((r) => r.id === idA) && list.some((r) => r.id === idB) ? list : null;
      }, "panel requests", 15000).catch(() => null);
      check("the panel holds both requests and A Ready",
        !!panelState && panelState.find((r) => r.id === idA).confirmed === true, panelState);
    } else {
      check("the panel holds both requests and A Ready", false, "no flyout target");
    }

    /* Server restart, then reload. */
    try { server.kill(); } catch (e) {}
    await waitFor(async () => { try { const r = await fetch("http://127.0.0.1:" + port + "/__rl/status"); return !r.ok; } catch (e) { return true; } }, "port free", 12000);
    server = startServer(port, "loss2.lock");
    await waitFor(async () => { try { const r = await fetch("http://127.0.0.1:" + port + "/__rl/status"); return r.ok; } catch (e) { return false; } }, "server back", 15000);
    await cdp.send("Page.reload", {}, app);
    await sleep(3000);
    app = await attach(cdp, appTarget.targetId);
    const afterRestart = await waitFor(() => evaluate(cdp, app, "window.__rlStateDebug && window.__rlStateDebug.requests().length >= 2 ? window.__rlStateDebug.requests() : null"), "restart data", 15000);
    check("a server restart keeps both requests and A Ready",
      afterRestart.some((r) => r.id === idA && r.confirmed === true) && afterRestart.some((r) => r.id === idB), afterRestart);

    /* Root cause guard: nextId() reuses max+1, so deleting the highest request
       and creating a new one re-creates its id. The persisted tombstone for the
       deleted id used to travel in the same envelope as the new row, which made
       the companion drop it and echo the deletion back. */
    await evaluate(cdp, app, `(() => {
      window.__rlOutEnvelopes = [];
      window.addEventListener('message', function(event){
        const d = event.data;
        if(!d || d.source !== 'request-ledger-web') return;
        if(!/^RL_APP_(PATCH|SNAPSHOT|HELLO)$/.test(String(d.type))) return;
        window.__rlOutEnvelopes.push({
          type: d.type,
          ids: (Array.isArray(d.requests) ? d.requests : (Array.isArray(d.upserts) ? d.upserts : [])).map(function(r){ return r && r.id; }),
          deletedIds: Array.isArray(d.deletedIds) ? d.deletedIds.slice() : []
        });
        if(window.__rlOutEnvelopes.length > 100) window.__rlOutEnvelopes.shift();
      }, true);
      return true;
    })()`);
    await evaluate(cdp, app, `(() => {
      const row = document.querySelector('.req[data-id="' + ${JSON.stringify(idB)} + '"]');
      const menu = row && row.querySelector('details.reqmenu summary');
      if (menu) menu.click();
      return !!menu;
    })()`);
    await sleep(250);
    await evaluate(cdp, app, `(() => {
      const row = document.querySelector('.req[data-id="' + ${JSON.stringify(idB)} + '"]');
      const del = row && row.querySelector('[data-action="delete"]');
      if (del) del.click();
      return !!del;
    })()`);
    await waitFor(() => evaluate(cdp, app, "document.getElementById('confirmModal').classList.contains('is-open')"), "delete confirm", 5000);
    await evaluate(cdp, app, "document.getElementById('confirmOkBtn').click()");
    await waitFor(() => evaluate(cdp, app, `!window.__rlStateDebug.requests().some(function(r){ return r.id === ${JSON.stringify(idB)}; })`), "request deleted", 5000);
    const reusedId = await createRequest(cdp, app, "Request B again");
    check("the re-created request reuses the deleted id", reusedId === idB, { deleted: idB, recreated: reusedId });
    await evaluate(cdp, app, "document.getElementById('saveRecordBtn').click()");
    await sleep(2600);
    const afterReuse = await evaluate(cdp, app, "window.__rlStateDebug.requests()");
    const reuseTrace = await evaluate(cdp, app, `window.__rlStateDebug.trace().filter(function(e){ return e.id === ${JSON.stringify(reusedId)} && e.op === 'remove'; })`);
    check("a request re-created with a deleted id survives the save",
      afterReuse.some((r) => r.id === reusedId), { reusedId, afterReuse, reuseTrace });
    const liveInDeleted = await evaluate(cdp, app, `window.__rlOutEnvelopes.filter(function(envelope){
      return envelope.ids.some(function(id){ return envelope.deletedIds.indexOf(id) >= 0; });
    })`);
    check("no outgoing envelope lists a live request as deleted",
      liveInDeleted.length === 0, liveInDeleted.slice(0, 3));
    const panelAfterReuse = await openPanel(cdp, app);
    if (panelAfterReuse.flyout) {
      const panelReuse = await waitFor(async () => {
        const list = await evaluate(cdp, panelAfterReuse.flyout, "window.__rlBridgePanel ? window.__rlBridgePanel.requests() : null");
        return Array.isArray(list) && list.some((r) => r.id === reusedId) ? list : null;
      }, "panel re-created request", 15000).catch(() => null);
      check("the panel mirrors a request re-created with a deleted id",
        !!panelReuse, panelReuse && panelReuse.map((r) => r.id));
    } else {
      check("the panel mirrors a request re-created with a deleted id", false, "no flyout target");
    }

    /* Owner sequence: Kaydet once, then New request left completely blank.
       The blank row must survive autosave (server disk save is 700 ms) and a
       project switch back. */
    await evaluate(cdp, app, "document.getElementById('saveRecordBtn').click()");
    await sleep(2600);
    const savedRecordToast = await evaluate(cdp, app, "(document.getElementById('toastText')||{}).textContent || ''");
    await evaluate(cdp, app, "document.getElementById('addBtn').click()");
    await waitFor(() => evaluate(cdp, app, "document.getElementById('typeModal').classList.contains('is-open')"), "type modal after Kaydet", 5000);
    await evaluate(cdp, app, "document.querySelector('#typeChoices .typechoice').click()");
    await waitFor(() => evaluate(cdp, app, "!!document.querySelector('.req.is-open [data-field=\"description\"]')"), "blank request form after Kaydet", 8000);
    const blankId = await evaluate(cdp, app, "window.__rlStateDebug.requests().slice(-1)[0].id");
    console.log("blank request after Kaydet", blankId, "toast", JSON.stringify(savedRecordToast));
    let blankLostAt = 0;
    for (let second = 0; second < 40; second += 1) {
      await sleep(250);
      const alive = await evaluate(cdp, app, `(() => {
        const list = window.__rlStateDebug.requests();
        const row = document.querySelector('.req[data-id=${JSON.stringify(blankId)}]');
        return { present: list.some(function(r){ return r.id === ${JSON.stringify(blankId)}; }), row: !!row, hidden: !!(row && row.hidden) };
      })()`);
      if (!alive.present || !alive.row || alive.hidden) { blankLostAt = (second + 1) * 250; break; }
      if ((second + 1) * 250 >= 10000) break;
    }
    const afterSaveState = await evaluate(cdp, app, "window.__rlStateDebug.requests()");
    const blankTrace = await evaluate(cdp, app, `window.__rlStateDebug.trace().filter(function(e){ return e.id === ${JSON.stringify(blankId)}; })`);
    const blankAudit = await evaluate(cdp, app, "window.__rlStateDebug.audit().slice(-12)");
    check("a blank request created after Kaydet survives 10 s of autosave",
      !blankLostAt && afterSaveState.some((r) => r.id === blankId), { blankLostAt, blankId, afterSaveState, blankTrace, blankAudit });

    const slugNow = await waitFor(() => projectSlugFor(projectId) || null, "project slug after blank", 10000);
    const diskBlank = readDiskLedger(slugNow);
    check("the blank request reaches the disk ledger",
      !!diskBlank && diskBlank.requests.some((r) => r.id === blankId), { ids: diskBlank && diskBlank.requests.map((r) => r.id) });

    /* A normal project switch away and back must not drop the blank row. */
    await evaluate(cdp, app, "document.getElementById('projectsBtn').click()");
    await sleep(300);
    await evaluate(cdp, app, "document.getElementById('projectPickerNewBtn').click()");
    await waitFor(() => evaluate(cdp, app, "!!document.getElementById('projectCreateInput')"), "second create screen", 5000);
    await evaluate(cdp, app, `(() => {
      const input = document.getElementById('projectCreateInput');
      input.value = 'Loss Third'; input.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('projectCreateBtn').click(); return true;
    })()`);
    await sleep(1400);
    await evaluate(cdp, app, "document.getElementById('projectsBtn').click()");
    await sleep(300);
    await evaluate(cdp, app, `(() => {
      const row = document.querySelector('#projectPickerList [data-project-id="' + ${JSON.stringify(projectId)} + '"]');
      if (row) row.click();
      return !!row;
    })()`);
    const afterBlankSwitch = await waitFor(() => evaluate(cdp, app, "window.__rlStateDebug && window.__rlStateDebug.requests().length >= 3 ? window.__rlStateDebug.requests() : null"), "switch back with blank", 12000);
    check("the blank request survives a project switch back",
      afterBlankSwitch.some((r) => r.id === blankId), afterBlankSwitch);

    /* Both surfaces must hold the blank row. Reopen the panel after the reload. */
    const panelAfterSave = await openPanel(cdp, app);
    if (panelAfterSave.flyout) {
      const panelBlank = await waitFor(async () => {
        const list = await evaluate(cdp, panelAfterSave.flyout, "window.__rlBridgePanel ? window.__rlBridgePanel.requests() : null");
        return Array.isArray(list) && list.some((r) => r.id === blankId) ? list : null;
      }, "panel blank request", 15000).catch(() => null);
      check("the panel also holds the blank request created after Kaydet",
        !!panelBlank, panelBlank && panelBlank.map((r) => r.id));
    } else {
      check("the panel also holds the blank request created after Kaydet", false, "no flyout target");
    }

    const pageFailures = require("./_page-errors.cjs").collect(cdp);
    check("no page reference/console errors", pageFailures.length === 0, pageFailures.slice(0, 3));
    const exceptions = cdp.events.filter((e) => e.method === "Runtime.exceptionThrown");
    check("no uncaught errors in the request-loss flow", exceptions.length === 0, exceptions.slice(0, 2));
  } finally {
    try { chrome && chrome.kill(); } catch (e) {}
    try { server && server.kill(); } catch (e) {}
    for (const dir of ["projects", "backups", "deleted-projects"]) {
      try { fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true }); } catch (e) {}
    }
    try { fs.rmSync(path.join(ROOT, "rl-config.json"), { force: true }); } catch (e) {}
    try { fs.rmSync(path.join(TMP, "loss.lock"), { force: true }); } catch (e) {}
    try { fs.rmSync(path.join(TMP, "loss2.lock"), { force: true }); } catch (e) {}
  }

  const passed = checks.filter((item) => item.ok).length;
  console.log("\n" + passed + "/" + checks.length + " checks passed");
  if (passed !== checks.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error("REQUEST LOSS E2E ERROR:", error.message);
  process.exitCode = 1;
});
