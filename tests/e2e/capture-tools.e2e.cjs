#!/usr/bin/env node
"use strict";

/*
  Capture tools E2E (CDP).

  Proves, with the real unpacked extension:
    - the two new row controls exist next to Pick element;
    - every overlay (pick, pick-capture, crop) renders English copy;
    - the screenshot tool fills Page from the chosen tab and attaches an image;
    - pick-capture fills Page/Location and attaches the element screenshot;
    - a legacy install keeps its stored project name, and an unnamed legacy
      install migrates to the neutral "Imported project" label.

  Usage:
    node scripts/serve.cjs 8080        (in another terminal)
    node tests/e2e/capture-tools.e2e.cjs

  Exit code 0 = every check passed.
*/

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const EXT = path.join(ROOT, "dist", "extension");
const WEB_URL = "http://localhost:8080/index.html";
const TARGET_URL = "http://127.0.0.1:8080/tests/fixtures/picker-target.html";
const SHOT_DIR = path.resolve(ROOT, "..", ".opencode", "workspace", "reports", "capture-tools");
const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const PORT = 9336;
const PROFILE = path.join(os.tmpdir(), "rl-capture-tools-e2e-profile");

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
    } catch (error) {
      /* not ready */
    }
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
      /* The ledger is dirty while the capture flow runs; a beforeunload
         prompt must never block a test navigation. Accept it explicitly so
         the product behaviour stays intact. */
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
  try { await cdp.send("Page.enable", {}, sessionId); } catch (error) { /* non-page target */ }
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
  while (Date.now() - started < (timeoutMs || 20000)) {
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

/* Overlay copy lives in closed shadow roots; the accessibility tree is the
   stable way to prove what the user actually sees. */
async function axText(cdp, sessionId) {
  try { await cdp.send("Accessibility.enable", {}, sessionId); } catch (error) { /* ignore */ }
  const tree = await cdp.send("Accessibility.getFullAXTree", {}, sessionId);
  return (tree.nodes || []).map(function(node){
    return node && node.name && typeof node.name.value === "string" ? node.name.value : "";
  }).join("\n");
}

function assertEnglishOverlay(label, text, required, forbidden) {
  const hasAll = required.every((line) => text.indexOf(line) >= 0);
  const hasNone = forbidden.every((line) => text.indexOf(line) < 0);
  check(label + " uses English overlay copy", hasAll && hasNone, {
    required: required.filter((line) => text.indexOf(line) < 0),
    forbidden: forbidden.filter((line) => text.indexOf(line) >= 0)
  });
}

function readLedger(cdp, sessionId) {
  return evaluate(cdp, sessionId, `(() => {
    const reg = JSON.parse(localStorage.getItem('oz-projeler-v1') || 'null');
    const raw = reg && reg.activeId
      ? localStorage.getItem('oz-istek-defteri-p-' + reg.activeId)
      : localStorage.getItem('oz-istek-defteri-v1');
    if (!raw) return { project:null, count:0, requests:[], ledgerId:null };
    const st = JSON.parse(raw);
    return { project:st.project, count:(st.requests || []).length, ledgerId:st.ledgerId, requests:st.requests || [] };
  })()`);
}

async function openActiveProject(cdp, sessionId) {
  await waitFor(async () => {
    return evaluate(cdp, sessionId, `(() => {
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
  await dismissOnboarding(cdp, sessionId);
}

async function dismissOnboarding(cdp, sessionId) {
  await evaluate(cdp, sessionId, `(() => {
    const modal = document.getElementById('onboardingModal');
    const done = document.getElementById('onboardingDoneBtn');
    if (modal && modal.classList.contains('is-open') && done) done.click();
    return true;
  })()`);
  await sleep(300);
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

async function startTool(cdp, pageSession, action) {
  await evaluate(cdp, pageSession,
    "document.querySelector('[data-action=\"" + action + "\"]').click()");
  await waitFor(() => evaluate(cdp, pageSession,
    "document.getElementById('pickerTabsModal').classList.contains('is-open')"), "tab chooser " + action);
  await waitFor(async () => {
    const count = await evaluate(cdp, pageSession,
      "document.querySelectorAll('#pickerTabsBody .typechoice[data-tab-id]').length");
    return count > 0 ? count : null;
  }, "tab rows " + action);
  await evaluate(cdp, pageSession,
    "document.querySelector('#pickerTabsBody .typechoice[data-tab-id]').click()");
}

function requestState(cdp, pageSession) {
  return evaluate(cdp, pageSession, `(() => {
    const req = JSON.parse(localStorage.getItem('oz-projeler-v1') || 'null');
    const id = req && req.activeId;
    const raw = id ? localStorage.getItem('oz-istek-defteri-p-' + id) : null;
    const st = raw ? JSON.parse(raw) : null;
    const item = st && st.requests ? st.requests.find((entry) => entry.id === 'IST-001') : null;
    const page = document.querySelector('[data-field="page"]');
    const location = document.querySelector('[data-field="location"]');
    return item ? {
      page:item.page,
      location:item.location,
      images:(item.images || []).length,
      rowImages:document.querySelectorAll('[data-dropzone] .thumb').length,
      pageInput:page ? page.value : '',
      locationInput:location ? location.value : ''
    } : null;
  })()`);
}

async function main() {
  if (!fs.existsSync(path.join(EXT, "manifest.json"))) {
    throw new Error("dist/extension missing; run node scripts/build.cjs first");
  }
  const ping = await fetch(WEB_URL).catch(() => null);
  if (!ping || !ping.ok) throw new Error("local server not running on :8080 (node scripts/serve.cjs 8080)");

  fs.rmSync(PROFILE, { recursive: true, force: true });

  const chrome = spawn(
    chromePath(),
    [
      "--user-data-dir=" + PROFILE,
      "--enable-unsafe-extension-debugging",
      "--remote-debugging-port=" + PORT,
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

    const pageTarget = await cdp.send("Target.createTarget", { url: WEB_URL });
    let pageSession = await attach(cdp, pageTarget.targetId);
    await cdp.send("Page.enable", {}, pageSession);
    await sleep(600);

    const seed = {
      version: 2, project: "Capture App", projectCreated: true, ledgerId: "ledger_capture_tools",
      updatedAt: "2026-11-08T12:00:00.000Z", agents: [], language: "en", exportBehavior: "default",
      requests: [{
        id: "IST-001", type: "update", title: "Capture tools request", page: "", location: "",
        consoleError: "", description: "Document the capture tools.", priority: "normal", link: "",
        sampleWebsite: "", note: "", images: [], attachments: [], confirmed: false,
        collapsed: false, createdAt: "2026-11-08T12:00:00.000Z", updatedAt: "2026-11-08T12:00:00.000Z"
      }]
    };
    await evaluate(cdp, pageSession, `localStorage.setItem('oz-istek-defteri-v1', ${JSON.stringify(JSON.stringify(seed))}); location.reload();`);
    await sleep(2200);
    pageSession = await attach(cdp, pageTarget.targetId);
    await openActiveProject(cdp, pageSession);

    check("legacy install keeps its stored project name", await waitFor(async () => {
      const reg = await evaluate(cdp, pageSession,
        "JSON.parse(localStorage.getItem('oz-projeler-v1') || 'null')");
      return reg && reg.projects && reg.projects[0] && reg.projects[0].name === "Capture App";
    }, "stored project name") === true);

    await waitFor(() => evaluate(cdp, pageSession, "!!document.querySelector('[data-action=\"pick-element\"]')"), "controls");
    await evaluate(cdp, pageSession, "document.querySelector('[data-action=\"capture-tab\"]').click()");
    check("disconnected screenshot tool opens install guidance", await waitFor(() => evaluate(cdp, pageSession,
      "document.getElementById('pickerInstallModal').classList.contains('is-open')"), "capture install guidance") === true);
    await evaluate(cdp, pageSession,
      "document.getElementById('pickerInstallModal').querySelector('[data-close-modal]').click()");

    const loaded = await cdp.send("Extensions.loadUnpacked", { path: EXT });
    check("extension loads with the pinned id", loaded.id === "hapajcbgcfllhkiohhkechekajencdod", loaded);
    await cdp.send("Page.reload", {}, pageSession);
    await sleep(2500);
    pageSession = await attach(cdp, pageTarget.targetId);
    await cdp.send("Page.enable", {}, pageSession);
    await waitFor(() => evaluate(cdp, pageSession, "!!document.getElementById('rl-host')"), "dock mount");
    await openActiveProject(cdp, pageSession);
    await waitFor(() => evaluate(cdp, pageSession, "window.__rlBridge && window.__rlBridge.connected()"), "bridge connected", 20000);

    const opened = await openPanel(cdp, pageSession);
    await waitFor(() => evaluate(cdp, opened.flyoutSession,
      "window.__rlBridgePanel && window.__rlBridgePanel.connected()"), "panel bridge connected", 20000);
    check("panel shows no Ortak Zemin / Common Ground default",
      !/Ortak Zemin|Common Ground/i.test(await evaluate(cdp, opened.flyoutSession, "document.body.innerText")));

    const targetTab = await cdp.send("Target.createTarget", { url: TARGET_URL });
    const targetSession = await attach(cdp, targetTab.targetId);
    await cdp.send("Page.enable", {}, targetSession);
    await waitFor(() => evaluate(cdp, targetSession, "!!document.getElementById('rl-host')"), "target dock", 20000);
    await cdp.send("Target.activateTarget", { targetId: pageTarget.targetId });
    await sleep(700);

    /* ---------- 1. New controls + English pick overlay ------------------ */

    const controls = await evaluate(cdp, pageSession, `(() => ({
      pick:!!document.querySelector('[data-action="pick-element"]'),
      capture:!!document.querySelector('[data-action="capture-tab"]'),
      pickCapture:!!document.querySelector('[data-action="pick-capture"]'),
      labels:Array.from(document.querySelectorAll('[data-block="pick"] [data-pick-label]')).map((el) => el.textContent)
    }))()`);
    check("three capture controls are present", controls.pick && controls.capture && controls.pickCapture, controls);
    check("control labels are English in EN mode",
      controls.labels.join("|") === "Pick element|Screenshot|Element + screenshot", controls.labels);
    await evaluate(cdp, pageSession, "document.querySelector('[data-block=\"pick\"]').scrollIntoView({block:'center'})");
    await sleep(250);
    await screenshot(cdp, pageSession, "01-controls-en.png");

    await startTool(cdp, pageSession, "pick-element");
    await waitFor(() => evaluate(cdp, targetSession, "!!document.querySelector('[data-rl-picker]')"), "picker overlay", 20000);
    await sleep(300);
    const pickAx = await axText(cdp, targetSession);
    assertEnglishOverlay("pick", pickAx,
      ["Select an element on the page", "Esc to cancel", "Cancel"],
      ["Sayfadan bir öğe seçin", "İptal", "Esc ile iptal"]);
    await screenshot(cdp, targetSession, "02-pick-overlay-en.png");
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, targetSession);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, targetSession);
    await waitFor(() => evaluate(cdp, pageSession,
      "!document.getElementById('pickerTabsModal').classList.contains('is-open')"), "pick cancel close");

    /* ---------- 2. Element + screenshot -------------------------------- */

    await startTool(cdp, pageSession, "pick-capture");
    await waitFor(() => evaluate(cdp, targetSession, "!!document.querySelector('[data-rl-picker]')"), "pick-capture overlay", 20000);
    await sleep(300);
    const pickCaptureAx = await axText(cdp, targetSession);
    assertEnglishOverlay("pick-capture", pickCaptureAx,
      ["Select an element on the page", "screenshot will also be taken", "Esc to cancel", "Cancel"],
      ["Sayfadan bir öğe seçin", "İptal", "görüntüsü de alınacak"]);
    await screenshot(cdp, targetSession, "03-pick-capture-overlay-en.png");

    const targetPoint = await evaluate(cdp, targetSession, `(() => {
      const rect = document.getElementById('pick-target').getBoundingClientRect();
      return { x:rect.left + rect.width / 2, y:rect.top + rect.height / 2 };
    })()`);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: targetPoint.x, y: targetPoint.y }, targetSession);
    await sleep(120);
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: targetPoint.x, y: targetPoint.y, button: "left", clickCount: 1 }, targetSession);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: targetPoint.x, y: targetPoint.y, button: "left", clickCount: 1 }, targetSession);

    const picked = await waitFor(async () => {
      const state = await requestState(cdp, pageSession);
      return state && state.location === "#pick-target" && state.images >= 1 ? state : null;
    }, "element+screenshot result", 20000);
    check("element+screenshot fills Page", picked.page === "/tests/fixtures/picker-target.html", picked);
    check("element+screenshot fills Location", picked.location === "#pick-target", picked);
    check("element+screenshot attaches an image", picked.images === 1, picked);
    await screenshot(cdp, pageSession, "04-pick-capture-result-en.png");

    /* ---------- 3. Screenshot tool ------------------------------------- */

    await startTool(cdp, pageSession, "capture-tab");
    await waitFor(() => evaluate(cdp, targetSession, "!!document.querySelector('[data-rl-crop]')"), "crop overlay", 20000);
    await sleep(500);
    const cropAx = await axText(cdp, targetSession);
    assertEnglishOverlay("crop", cropAx,
      ["Screenshot", "drag to select the area to crop", "ESC to cancel", "Crop", "Cancel"],
      ["Ekran alıntısı", "Kırp", "İptal"]);
    await screenshot(cdp, targetSession, "05-crop-overlay-en.png");

    /* Cancel once to prove the app returns from the overlay cleanly. */
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, targetSession);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, targetSession);
    const cancelled = await waitFor(async () => {
      const closed = await evaluate(cdp, pageSession,
        "!document.getElementById('pickerTabsModal').classList.contains('is-open')");
      return closed ? true : null;
    }, "screenshot cancel closes the chooser");
    check("screenshot cancel closes the chooser", cancelled === true);

    await startTool(cdp, pageSession, "capture-tab");
    await waitFor(() => evaluate(cdp, targetSession, "!!document.querySelector('[data-rl-crop]')"), "crop overlay again", 20000);
    await sleep(400);

    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 240, y: 220, buttons: 0 }, targetSession);
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: 240, y: 220, button: "left", buttons: 1, clickCount: 1 }, targetSession);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 420, y: 330, button: "left", buttons: 1 }, targetSession);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 420, y: 330, button: "left", buttons: 0, clickCount: 1 }, targetSession);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }, targetSession);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }, targetSession);

    let captured = null;
    try{
      captured = await waitFor(async () => {
        const state = await requestState(cdp, pageSession);
        return state && state.images >= 2 && state.page ? state : null;
      }, "screenshot result", 20000);
    }catch(error){
      console.log("screenshot failure snapshot", JSON.stringify({
        req: await requestState(cdp, pageSession),
        body: await evaluate(cdp, pageSession, "document.body.innerText.slice(-260)")
      }));
      throw error;
    }
    check("screenshot fills Page from the tab path",
      captured.page === "/tests/fixtures/picker-target.html", captured);
    check("screenshot attaches to the active request images", captured.images === 2, captured);
    check("screenshot row shows both thumbnails", captured.rowImages === 2, captured);
    await screenshot(cdp, pageSession, "06-screenshot-result-en.png");

    /* ---------- 4. No Turkish default project -------------------------- */

    const bodyText = await evaluate(cdp, pageSession, "document.body.innerText");
    check("UI contains no Ortak Zemin / Common Ground default",
      !/Ortak Zemin|Common Ground/i.test(bodyText));

    await sleep(1200);
    await evaluate(cdp, pageSession, `
      localStorage.removeItem('oz-projeler-v1');
      localStorage.setItem('oz-istek-defteri-v1', JSON.stringify({version:2, requests:[], agents:[], language:'en'}));
      location.reload();
    `);
    await sleep(2200);
    pageSession = await attach(cdp, pageTarget.targetId);
    const migrated = await waitFor(async () => {
      return evaluate(cdp, pageSession,
        "JSON.parse(localStorage.getItem('oz-projeler-v1') || 'null')");
    }, "unnamed legacy migration");
    check("unnamed legacy install migrates to Imported project",
      Boolean(migrated && migrated.projects && migrated.projects[0] && migrated.projects[0].name === "Imported project"), migrated);

    await evaluate(cdp, pageSession, `
      localStorage.removeItem('oz-projeler-v1');
      localStorage.setItem('oz-istek-defteri-v1', JSON.stringify({version:2, requests:[], agents:[], language:'tr'}));
      location.reload();
    `);
    await sleep(2200);
    pageSession = await attach(cdp, pageTarget.targetId);
    const migratedTr = await waitFor(async () => {
      return evaluate(cdp, pageSession,
        "JSON.parse(localStorage.getItem('oz-projeler-v1') || 'null')");
    }, "Turkish unnamed legacy migration");
    check("unnamed legacy install uses the translated label",
      Boolean(migratedTr && migratedTr.projects && migratedTr.projects[0] && migratedTr.projects[0].name === "İçe aktarılan proje"), migratedTr);

    const errors = cdp.events.filter((event) => event.method === "Runtime.exceptionThrown");
    check("no uncaught errors in the capture tools flow", errors.length === 0,
      errors.slice(0, 3).map((event) => (event.params.exceptionDetails || {}).text));

    await cdp.send("Target.closeTarget", { targetId: targetTab.targetId });
  } finally {
    try { chrome.kill(); } catch (error) { /* ignore */ }
  }

  const failed = checks.filter((entry) => !entry.ok);
  console.log("\n" + (checks.length - failed.length) + "/" + checks.length + " checks passed");
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error("CAPTURE TOOLS E2E ERROR:", error.message);
  process.exit(1);
});
