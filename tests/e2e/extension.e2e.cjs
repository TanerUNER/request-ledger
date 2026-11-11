#!/usr/bin/env node
"use strict";

/*
  End-to-end test for the unpacked extension and cross-product transfer.

  Requires: Chrome/Edge installed, a local server on :8080 (scripts/serve.cjs).
  Launches a throwaway Chrome profile, loads dist/extension, drives the panel through
  the DevTools protocol, exports a backup, then restores it into the web app.

  Usage:
    node scripts/serve.cjs 8080            (in another terminal)
    node tests/e2e/extension.e2e.cjs

  Exit code 0 = all checks passed.
*/

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const EXT = path.join(ROOT, "dist", "extension");
const WEB_URL = "http://localhost:8080/index.html?rl-local=1";
const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const PORT = 9333;
const PROFILE = path.join(os.tmpdir(), "rl-e2e-profile");
const DOWNLOADS = path.join(os.tmpdir(), "rl-e2e-downloads");

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
  while (Date.now() - started < (timeoutMs || 15000)) {
    const value = await fn();
    if (value) return value;
    await sleep(300);
  }
  throw new Error("timeout: " + label);
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
  const ping = await fetch(WEB_URL).catch(() => null);
  if (!ping || !ping.ok) throw new Error("local server not running on :8080 (node scripts/serve.cjs 8080)");

  fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.rmSync(DOWNLOADS, { recursive: true, force: true });
  fs.mkdirSync(DOWNLOADS, { recursive: true });

  const chrome = spawn(
    chromePath(),
    [
      "--user-data-dir=" + PROFILE,
      "--enable-unsafe-extension-debugging",
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
    const loaded = await cdp.send("Extensions.loadUnpacked", { path: EXT });
    check("extension loads with the pinned id", loaded.id === "hapajcbgcfllhkiohhkechekajencdod", loaded);
    await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DOWNLOADS });

    /* Toolbar action popup: a static About card, not the in-page dock. */
    const aboutTarget = await cdp.send("Target.createTarget", {
      url: "chrome-extension://" + loaded.id + "/panel/about.html"
    });
    const aboutSession = await attach(cdp, aboutTarget.targetId);
    await sleep(600);
    const about = await evaluate(cdp, aboutSession, `(() => ({
      title: (document.getElementById('aboutTitle') || {}).textContent || '',
      version: (document.getElementById('aboutVersion') || {}).textContent || '',
      desc: (document.getElementById('aboutDesc') || {}).textContent || '',
      note: (document.getElementById('aboutNote') || {}).textContent || '',
      repo: (document.getElementById('aboutRepo') || {}).href || '',
      support: (document.getElementById('aboutSupport') || {}).href || '',
      license: document.body.innerText.indexOf('MIT') >= 0,
      popup: chrome.runtime.getManifest().action.default_popup || ''
    }))()`);
    check("toolbar popup shows About, version, links, license and app requirement",
      /Request Ledger/.test(about.title) && /^1\.\d+\.\d+$/.test(about.version) &&
      about.popup === "panel/about.html" &&
      /uygulama|app/i.test(about.note) && /github\.com/i.test(about.repo) &&
      /buymeacoffee/i.test(about.support) && about.license === true, about);
    await cdp.send("Target.closeTarget", { targetId: aboutTarget.targetId });
    await sleep(200);

    const page = await cdp.send("Target.createTarget", { url: WEB_URL });
    const pageSession = await attach(cdp, page.targetId);
    await cdp.send("Page.enable", {}, pageSession);
    await sleep(400);
    await cdp.send("Page.reload", {}, pageSession);
    await sleep(2500);

    await waitFor(() => evaluate(cdp, pageSession, "!!document.getElementById('rl-host')"), "dock mount");
    check("dock host mounts on an http page", true);
    const presence = await evaluate(cdp, pageSession, `(() => {
      try { return JSON.parse(document.documentElement.getAttribute('data-rl-presence') || 'null'); }
      catch (error) { return null; }
    })()`);
    check("presence carries a fresh timestamp and one mount",
      !!presence && presence.alive === true && presence.mounts === 1 && presence.host === true &&
      presence.at > Date.now() - 12000, presence);

    /* The app is the project authority. Create its project before using the
       panel; the extension has no project creation UI. */
    await evaluate(cdp, pageSession, `(() => {
      const done = document.getElementById('onboardingDoneBtn');
      const modal = document.getElementById('onboardingModal');
      if (modal && modal.classList.contains('is-open') && done) done.click();
      return true;
    })()`);
    await sleep(300);
    await waitFor(() => evaluate(cdp, pageSession,
      "!!document.getElementById('projectCreateInput')"), "app project creator", 15000);
    await evaluate(cdp, pageSession, `(() => {
      const input = document.getElementById('projectCreateInput');
      input.value = 'E2E Test';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('projectCreateBtn').click();
      return true;
    })()`);
    await waitFor(() => evaluate(cdp, pageSession,
      "window.__rlBridge && window.__rlBridge.projectId()"), "app project bridge", 15000);

    await evaluate(cdp, pageSession, "document.getElementById('rl-launcher').click()");
    const targets = await waitFor(async () => {
      const current = await cdp.send("Target.getTargets");
      const dock = current.targetInfos.find((t) => t.url.includes("role=dock"));
      const flyout = current.targetInfos.find((t) => t.url.includes("role=flyout"));
      return dock && flyout ? { dock, flyout } : null;
    }, "panel iframes");

    const dockSession = await attach(cdp, targets.dock.targetId);
    const flyoutSession = await attach(cdp, targets.flyout.targetId);
    /* Pin the rail so the 5 s idle auto-hide cannot close the section while
       the test drives programmatic clicks. */
    await evaluate(cdp, dockSession,
      "(() => { if (!window.RLPanel.pinned()) window.RLPanel.togglePin(); return window.RLPanel.pinned(); })()");

    const banner = await evaluate(
      cdp,
      flyoutSession,
      "(() => { const b = document.getElementById('rl-storage-banner'); return b ? !b.hidden : true; })()"
    );
    check("storage banner is hidden", banner === false, banner);

    await evaluate(cdp, dockSession, `document.querySelector('[data-section="new"]').click()`);
    await sleep(700);
    await evaluate(cdp, flyoutSession, `(() => {
      document.querySelector('[data-type="bug"]').click();
      document.querySelector('[data-priority="critical"]').click();
      const title = document.getElementById('rl-new-title');
      title.value = 'E2E: header menu overflow';
      title.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('[data-act="create"]').click();
    })()`);
    await sleep(900);

    await evaluate(cdp, flyoutSession, `document.querySelector('[data-act="page-from-tab"]').click()`);
    await sleep(900);
    const pageValue = await evaluate(cdp, flyoutSession, "document.getElementById('rl-page-input').value");
    check("page-from-tab fills the page field", pageValue === "/index.html", pageValue);

    await evaluate(cdp, flyoutSession, `document.querySelector('[data-act="save-section"]').click()`);
    await sleep(800);
    await evaluate(cdp, flyoutSession, `(() => {
      const desc = document.querySelector('[data-field="description"]');
      desc.value = 'Long names push the logout row out of the menu on 1280px.';
      desc.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('[data-act="save-section"]').click();
    })()`);
    await sleep(1200);

    let state = await evaluate(cdp, flyoutSession, `(() => {
      const reg = JSON.parse(localStorage.getItem('oz-projeler-v1') || 'null');
      if (!reg || !reg.activeId) return null;
      const raw = localStorage.getItem('oz-istek-defteri-p-' + reg.activeId);
      const st = raw ? JSON.parse(raw) : null;
      return st ? { project: st.project, count: st.requests.length, req: st.requests[0], activeId: reg.activeId } : null;
    })()`);
    check("request is saved to the extension ledger", state && state.count === 1 && state.req.title === "E2E: header menu overflow", state && state.count);
    check("project name is stored", state && state.project === "E2E Test", state && state.project);

    /* ---------- storage recovery and quota reporting ---------- */
    if (!(await evaluate(cdp, flyoutSession, "!!document.getElementById('rl-title-input')"))) {
      await evaluate(cdp, dockSession, "window.RLPanel.open('list')");
      await sleep(500);
      await evaluate(cdp, flyoutSession, `(() => {
        const row = document.querySelector('[data-request-id]');
        if (row) row.click();
        return !!row;
      })()`);
      await sleep(500);
    }

    /* saveState must not let duplicate request ids inflate the payload. */
    const dedupe = await evaluate(cdp, flyoutSession, `(() => {
      const reg = JSON.parse(localStorage.getItem('oz-projeler-v1'));
      const key = 'oz-istek-defteri-p-' + reg.activeId;
      const raw = localStorage.getItem(key);
      const st = JSON.parse(raw);
      const duplicate = JSON.parse(JSON.stringify(st.requests[0]));
      const ok = window.IstekCore.storage.saveState({
        project: st.project, ledgerId: st.ledgerId,
        requests: [st.requests[0], duplicate], agents: [],
        language: 'en', exportBehavior: 'default', lastExport: null
      });
      const written = JSON.parse(localStorage.getItem(key));
      localStorage.setItem(key, raw);
      return { ok: ok, count: written.requests.length };
    })()`);
    check("saveState de-duplicates repeated request ids",
      dedupe.ok === true && dedupe.count === 1, dedupe);

    /* One transient failure is retried: no sticky banner, data saved. */
    await evaluate(cdp, flyoutSession, `(() => {
      window.__rlOriginalSetItem = localStorage.setItem.bind(localStorage);
      window.__rlThrowOnce = true;
      localStorage.setItem = function(key, value){
        if(window.__rlThrowOnce && String(key).indexOf('oz-istek-defteri-p-') === 0){
          window.__rlThrowOnce = false;
          throw new DOMException('transient write failure', 'UnknownError');
        }
        return window.__rlOriginalSetItem(key, value);
      };
      return true;
    })()`);
    await evaluate(cdp, flyoutSession, `(() => {
      const input = document.getElementById('rl-title-input');
      input.value = input.value + ' x';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(1400);
    const transient = await evaluate(cdp, flyoutSession, `(() => {
      const banner = document.getElementById('rl-storage-banner');
      const reg = JSON.parse(localStorage.getItem('oz-projeler-v1'));
      const st = JSON.parse(localStorage.getItem('oz-istek-defteri-p-' + reg.activeId));
      return { bannerHidden: !banner || banner.hidden, title: st.requests[0].title };
    })()`);
    check("a transient write failure retries without sticking the storage banner",
      transient.bannerHidden === true && / x$/.test(transient.title), transient);

    /* Persistent quota failure must name the cleanup path. */
    await evaluate(cdp, flyoutSession, `(() => {
      window.__rlThrowQuota = true;
      localStorage.setItem = function(key, value){
        if(window.__rlThrowQuota && String(key).indexOf('oz-istek-defteri-p-') === 0){
          throw new DOMException('quota', 'QuotaExceededError');
        }
        return window.__rlOriginalSetItem(key, value);
      };
      return true;
    })()`);
    await evaluate(cdp, flyoutSession, `(() => {
      const input = document.getElementById('rl-title-input');
      input.value = input.value + ' q';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(1400);
    const quotaState = await evaluate(cdp, flyoutSession, `(() => {
      const banner = document.getElementById('rl-storage-banner');
      return { bannerHidden: banner ? banner.hidden : true, bannerText: banner ? banner.textContent : '' };
    })()`);
    const quotaToast = await evaluate(cdp, pageSession,
      "(document.getElementById('rl-toast-layer') || {}).innerText || ''");
    check("a full storage shows the quota message, banner and cleanup path",
      quotaState.bannerHidden === false && /Storage is full|Depolama dolu/.test(quotaToast),
      { quotaState, quotaToast });

    /* Restore native storage, save once, and clear the failure banner. */
    await evaluate(cdp, flyoutSession, `(() => {
      window.__rlThrowQuota = false;
      localStorage.setItem = window.__rlOriginalSetItem;
      const input = document.getElementById('rl-title-input');
      input.value = 'E2E: header menu overflow';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(1400);
    const recovered = await evaluate(cdp, flyoutSession, `(() => {
      const banner = document.getElementById('rl-storage-banner');
      const reg = JSON.parse(localStorage.getItem('oz-projeler-v1'));
      const st = JSON.parse(localStorage.getItem('oz-istek-defteri-p-' + reg.activeId));
      return { bannerHidden: !banner || banner.hidden, title: st.requests[0].title };
    })()`);
    check("storage recovers and clears the banner after a successful save",
      recovered.bannerHidden === true && recovered.title === "E2E: header menu overflow", recovered);


    /* ---------- element picker ---------- */

    await evaluate(cdp, flyoutSession, `document.querySelector('[data-act="pick-element"]').click()`);
    await sleep(1200);
    const point = await evaluate(cdp, pageSession, `(() => {
      const el = document.querySelector('#pageTitle') || document.body;
      const rect = el.getBoundingClientRect();
      return { x: Math.round(rect.x + Math.min(rect.width, 120) / 2), y: Math.round(rect.y + rect.height / 2) };
    })()`);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y }, pageSession);
    await sleep(250);
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 }, pageSession);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 }, pageSession);
    await sleep(1800);
    const picked = await evaluate(cdp, flyoutSession, `(() => ({
      page: (document.getElementById('rl-page-input') || {}).value || null,
      location: (document.getElementById('rl-loc-input') || {}).value || null
    }))()`);
    check("element picker writes the page path", picked.page === "/index.html", picked);
    check("element picker writes a selector", typeof picked.location === "string" && picked.location.length > 0, picked);

    /* ---------- console error import ---------- */

    await evaluate(cdp, pageSession, `console.error('E2E_SENTINEL_CONSOLE_ERROR')`);
    await sleep(400);
    await evaluate(cdp, flyoutSession, `document.querySelector('[data-act="console-fetch"]').click()`);
    await sleep(1200);
    const consoleValue = await evaluate(cdp, flyoutSession, `(document.getElementById('rl-console-input') || {}).value || ''`);
    check("console import fills the console field", consoleValue.includes("E2E_SENTINEL_CONSOLE_ERROR"), consoleValue.slice(0, 120));

    /* ---------- region screenshot ---------- */

    await cdp.send("Page.bringToFront", {}, pageSession);
    await sleep(500);
    await evaluate(cdp, pageSession, `(() => {
      window.__e2eEvents = [];
      ['pointerdown','pointermove','pointerup','mousedown','mousemove','mouseup'].forEach((name) => {
        document.addEventListener(name, (event) => window.__e2eEvents.push([name, event.clientX, event.clientY]), true);
      });
      return true;
    })()`);
    await evaluate(cdp, flyoutSession, `document.querySelector('[data-act="capture-open"]').click()`);
    await sleep(2000);
    const overlay = await evaluate(cdp, pageSession, `!!document.querySelector('[data-rl-crop]')`);
    check("capture overlay appears", overlay === true, overlay);
    await sleep(500);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 240, y: 220, buttons: 0 }, pageSession);
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: 240, y: 220, button: "left", buttons: 1, clickCount: 1 }, pageSession);
    await sleep(200);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 330, y: 270, button: "left", buttons: 1 }, pageSession);
    await sleep(120);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 420, y: 330, button: "left", buttons: 1 }, pageSession);
    await sleep(120);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 520, y: 400, button: "left", buttons: 1 }, pageSession);
    await sleep(120);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 620, y: 460, button: "left", buttons: 1 }, pageSession);
    await sleep(200);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 620, y: 460, button: "left", buttons: 0, clickCount: 1 }, pageSession);
    await sleep(600);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }, pageSession);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }, pageSession);
    await sleep(3500);
    const eventCount = await evaluate(cdp, pageSession, `(window.__e2eEvents || []).length`);
    check("pointer events reach the page", eventCount > 0, eventCount);
    const imageInfo = await evaluate(cdp, flyoutSession, `(() => {
      const text = document.body.innerText || '';
      const match = text.match(/(\\d+)\\s*\\/\\s*8/);
      return { count: match ? Number(match[1]) : null, text: text.replace(/\\s+/g, ' ').slice(0, 220) };
    })()`);

    /* ---------- image preview stays inside the extension ----------
       Instrument every message the page can see, then open the screenshot
       preview. The page must never receive image bytes; the host may only
       receive geometry. */
    await evaluate(cdp, pageSession, `(() => {
      window.__e2eImageLeak = false;
      window.__e2ePreviewMessages = [];
      window.addEventListener('message', (event) => {
        const data = event.data;
        const seen = new Set();
        const hasImage = (value, depth) => {
          if (depth > 6 || value == null) return false;
          const kind = typeof value;
          if (kind === 'string') return value.indexOf('data:image') >= 0;
          if (kind !== 'object') return false;
          if (seen.has(value)) return false;
          seen.add(value);
          try {
            for (const key of Object.keys(value)) {
              if (hasImage(value[key], depth + 1)) return true;
            }
          } catch (error) {
            return false;
          }
          return false;
        };
        try {
          window.__e2ePreviewMessages.push({ type: (data && data.type) || '', origin: event.origin });
        } catch (error) { /* ignore */ }
        /* Live media sync sends RL_APP_MEDIA to the app by design; this test
           only guards the in-panel preview channel. */
        if (data && data.type === 'RL_APP_MEDIA') return;
        if (hasImage(data, 0)) window.__e2eImageLeak = true;
      }, true);
      return true;
    })()`);

    await evaluate(cdp, flyoutSession, `(() => {
      const thumb = document.querySelector('.thumb');
      if (!thumb) throw new Error('thumbnail missing');
      thumb.click();
      return true;
    })()`);
    await waitFor(() => evaluate(cdp, flyoutSession, "!!document.getElementById('rl-image-preview')"), "image preview opens");
    await sleep(400);
    console.log("PREVIEW DEBUG", JSON.stringify({
      frame: await evaluate(cdp, pageSession, `(() => {
        const f = document.querySelector('iframe[src*="role=flyout"]');
        return f ? { display:getComputedStyle(f).display, visibility:getComputedStyle(f).visibility, width:Math.round(f.getBoundingClientRect().width) } : null;
      })()`),
      panel: await evaluate(cdp, flyoutSession, `({
        section: document.body.dataset.section || '',
        preview: !!document.getElementById('rl-image-preview'),
        active: document.activeElement ? (document.activeElement.id || document.activeElement.className) : ''
      })`)
    }));

    const previewRect = await evaluate(cdp, pageSession, `(() => {
      const frame = document.querySelector('iframe[src*="role=flyout"]');
      if (!frame) return null;
      const rect = frame.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        centered: Math.abs((rect.x + rect.width / 2) - viewportWidth / 2) < 4
      };
    })()`);

    await cdp.send(
      "Input.dispatchKeyEvent",
      { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 },
      flyoutSession
    );
    await cdp.send(
      "Input.dispatchKeyEvent",
      { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 },
      flyoutSession
    );
    await waitFor(
      () => evaluate(cdp, flyoutSession, "!document.getElementById('rl-image-preview')"),
      "image preview closes on Esc"
    );
    await sleep(400);

    const previewState = await evaluate(cdp, flyoutSession, `(() => ({
      focusOnThumb: !!(document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('thumb')),
      activeId: document.activeElement ? (document.activeElement.id || '') : '',
      activeClass: document.activeElement ? (document.activeElement.className || '') : '',
      thumbs: document.querySelectorAll('#rl-img-grid .thumb').length
    }))()`);
    const previewFrame = await evaluate(cdp, pageSession, `(() => {
      const frame = document.querySelector('iframe[src*="role=flyout"]');
      return frame ? Math.round(frame.getBoundingClientRect().width) : null;
    })()`);
    const imageLeak = await evaluate(cdp, pageSession, "window.__e2eImageLeak === true");

    check(
      "region screenshot adds an image; preview never leaks bytes to the page",
      imageInfo.count === 1 &&
        !!previewRect &&
        previewRect.width > 400 &&
        previewRect.centered &&
        previewState.focusOnThumb &&
        previewFrame === 360 &&
        imageLeak === false,
      { count: imageInfo.count, previewRect, previewState, previewFrame, imageLeak }
    );

    await evaluate(cdp, flyoutSession, `document.querySelector('[data-act="ready"]').click()`);
    const confirmed = await waitFor(() => evaluate(cdp, flyoutSession, `(() => {
      const reg = JSON.parse(localStorage.getItem('oz-projeler-v1'));
      const st = JSON.parse(localStorage.getItem('oz-istek-defteri-p-' + reg.activeId));
      const value = { confirmed: st.requests[0].confirmed, status: window.IstekCore.requests.status(st.requests[0]) };
      return value.confirmed === true && value.status === "ready" ? value : null;
    })()`), "ready confirmation state", 6000);
    check("ready confirmation locks the request in state", confirmed.confirmed === true && confirmed.status === "ready", confirmed);

    const postReadyDebug = {
      dock: await evaluate(cdp, dockSession, `(() => ({
        hasList: !!document.querySelector('[data-section="list"]'),
        hasCard: !!document.getElementById('rl-dock-card'),
        dockState: window.RLPanel ? window.RLPanel.dockState() : null
      }))()`),
      flyout: await evaluate(cdp, flyoutSession, `(() => ({
        section: document.body.dataset.section || '',
        hasExp: !!document.querySelector('[data-act="exp-open"]'),
        hasSave: !!document.getElementById('rl-save-record')
      }))()`)
    };
    console.log("POST READY DEBUG", JSON.stringify(postReadyDebug));

    await evaluate(cdp, dockSession, `document.querySelector('[data-section="list"]').click()`);
    await sleep(900);
    await evaluate(cdp, flyoutSession, `document.querySelector('[data-act="exp-open"]').click()`);
    await sleep(900);
    await evaluate(cdp, flyoutSession, `document.querySelector('[data-act="exp-next"]').click()`);
    await sleep(700);
    await evaluate(cdp, flyoutSession, `(() => {
      const visible = (el) => !!(el && el.offsetParent !== null);
      const byText = (text) => Array.from(document.querySelectorAll('button')).filter((b) => visible(b) && (b.innerText || '').trim() === text);
      byText('Full run').forEach((b) => b.click());
      byText('No').forEach((b) => b.click());
      byText('No transfer').forEach((b) => b.click());
    })()`);
    await sleep(500);
    await evaluate(cdp, flyoutSession, `document.querySelector('[data-act="exp-run"]').click()`);
    await sleep(2500);

    const exportFiles = fs.readdirSync(DOWNLOADS).filter((name) => name.endsWith(".md"));
    check("export produces a Markdown file", exportFiles.length === 1, exportFiles);
    if (exportFiles.length) {
      const content = fs.readFileSync(path.join(DOWNLOADS, exportFiles[0]), "utf8");
      check("exported Markdown contains the request", content.includes("E2E: header menu overflow") && content.includes("IST-001"));
      check("exported Markdown uses English labels", content.includes("## Planning") && content.includes("**Type:** Bug"));
    }

    await evaluate(cdp, flyoutSession, `(() => {
      const keep = Array.from(document.querySelectorAll('button')).find((b) => /Keep requests/i.test(b.innerText || ''));
      if (keep) keep.click();
    })()`);
    await sleep(600);

    fs.rmSync(DOWNLOADS, { recursive: true, force: true });
    fs.mkdirSync(DOWNLOADS, { recursive: true });
    await evaluate(cdp, dockSession, `document.querySelector('[data-section="backup"]').click()`);
    await sleep(900);
    await evaluate(cdp, flyoutSession, `(() => {
      const visible = (el) => !!(el && el.offsetParent !== null);
      const zip = Array.from(document.querySelectorAll('button, [data-act]')).find((b) => visible(b) && /ZIP/i.test(b.innerText || ''));
      if (!zip) throw new Error('ZIP backup button not found');
      zip.click();
    })()`);
    await sleep(3000);

    const zipFiles = fs.readdirSync(DOWNLOADS).filter((name) => name.endsWith(".zip"));
    check("backup produces a ZIP file", zipFiles.length === 1, zipFiles);
    if (!zipFiles.length) throw new Error("no backup zip");
    const zipPath = path.join(DOWNLOADS, zipFiles[0]);

    await cdp.send("DOM.enable", {}, pageSession);
    const document = await cdp.send("DOM.getDocument", {}, pageSession);
    const inputNode = await cdp.send("DOM.querySelector", { nodeId: document.root.nodeId, selector: "#restoreInput" }, pageSession);
    await cdp.send("DOM.setFileInputFiles", { files: [zipPath], nodeId: inputNode.nodeId }, pageSession);
    await sleep(1200);

    const confirmOpen = await evaluate(cdp, pageSession, "!!document.querySelector('#confirmModal.is-open')");
    check("web app opens the restore confirmation", confirmOpen === true, confirmOpen);
    if (confirmOpen) {
      await evaluate(cdp, pageSession, "document.getElementById('confirmOkBtn').click()");
      await sleep(1600);
    }

    const webState = await evaluate(cdp, pageSession, `(() => {
      const reg = JSON.parse(localStorage.getItem('oz-projeler-v1') || 'null');
      if (!reg || !reg.activeId) return null;
      const st = JSON.parse(localStorage.getItem('oz-istek-defteri-p-' + reg.activeId) || 'null');
      return st ? { project: st.project, count: st.requests.length, title: st.requests[0] && st.requests[0].title, rows: document.querySelectorAll('.req').length } : null;
    })()`);
    check("web app restores the extension backup", webState && webState.count === 1 && webState.title === "E2E: header menu overflow", webState && webState.count);
    check("web app keeps the project name", webState && webState.project === "E2E Test", webState && webState.project);
    check("web app renders the restored row", webState && webState.rows === 1, webState && webState.rows);

    /* ---------- reverse direction: web app -> extension ---------- */

    fs.rmSync(DOWNLOADS, { recursive: true, force: true });
    fs.mkdirSync(DOWNLOADS, { recursive: true });
    await evaluate(cdp, pageSession, `document.querySelector('[data-rail="backup"]').click()`);
    await sleep(800);
    const backupModalOpen = await evaluate(cdp, pageSession, `!!document.querySelector('#backupModal.is-open')`);
    check("web app opens the backup modal", backupModalOpen === true, backupModalOpen);
    await evaluate(cdp, pageSession, `document.getElementById('backupZipBtn').click()`);
    const webZips = await waitFor(
      () => {
        const found = fs.readdirSync(DOWNLOADS).filter((name) => name.endsWith(".zip"));
        return found.length ? found : null;
      },
      "web app backup zip",
      20000
    );
    check("web app produces a backup ZIP", webZips.length === 1, webZips);
    if (!webZips.length) throw new Error("no web app backup zip");
    const webZipPath = path.join(DOWNLOADS, webZips[0]);

    await evaluate(cdp, dockSession, `document.querySelector('[data-section="backup"]').click()`);
    await sleep(900);
    await cdp.send("DOM.enable", {}, flyoutSession);
    const panelDoc = await cdp.send("DOM.getDocument", {}, flyoutSession);
    const backupInput = await cdp.send(
      "DOM.querySelector",
      { nodeId: panelDoc.root.nodeId, selector: "#rl-backup-input" },
      flyoutSession
    );
    check("extension exposes a backup file input", backupInput.nodeId > 0, backupInput);
    await cdp.send("DOM.setFileInputFiles", { files: [webZipPath], nodeId: backupInput.nodeId }, flyoutSession);
    await sleep(1500);
    const restoreReady = await evaluate(cdp, flyoutSession, `!!document.querySelector('[data-act="backup-confirm"]')`);
    check("extension opens the restore confirmation", restoreReady === true, restoreReady);
    if (restoreReady) {
      await evaluate(cdp, flyoutSession, `document.querySelector('[data-act="backup-confirm"]').click()`);
      await sleep(2000);
    }
    const roundTrip = await evaluate(cdp, flyoutSession, `(() => {
      const reg = JSON.parse(localStorage.getItem('oz-projeler-v1') || 'null');
      if (!reg || !reg.activeId) return null;
      const st = JSON.parse(localStorage.getItem('oz-istek-defteri-p-' + reg.activeId) || 'null');
      return st ? { project: st.project, count: st.requests.length, title: st.requests[0] && st.requests[0].title } : null;
    })()`);
    check("extension restores the web app backup", roundTrip && roundTrip.count === 1 && roundTrip.title === "E2E: header menu overflow", roundTrip && roundTrip.count);
    check("round-trip keeps the project name", roundTrip && roundTrip.project === "E2E Test", roundTrip && roundTrip.project);

    const pageErrors = cdp.events.filter(
      (event) => event.method === "Runtime.exceptionThrown" && (event.sessionId === pageSession || event.sessionId === flyoutSession)
    );
    check("no uncaught errors in the page or panel", pageErrors.length === 0, pageErrors.slice(0, 3).map((event) => (event.params.exceptionDetails || {}).text));
  } finally {
    try {
      chrome.kill();
    } catch (error) {
      /* ignore */
    }
  }

  const failed = checks.filter((entry) => !entry.ok);
  console.log("\n" + (checks.length - failed.length) + "/" + checks.length + " checks passed");
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error("E2E ERROR:", error.message);
  process.exit(1);
});
