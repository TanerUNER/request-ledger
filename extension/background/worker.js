/* Request Ledger — background service worker.
 * Phase 1: boot + ping.
 * Phase 8: tab list, screenshot crop overlay and element picker orchestration.
 * Protocol: extension/docs/phase-8-capture.md
 */
"use strict";

var VERSION = chrome.runtime.getManifest().version;

var ACTIVATE_DELAY_MS = 250;   /* wait for the tab to paint before capture  */
var OVERLAY_TIMEOUT_MS = 60000; /* a stuck overlay must not block the panel  */
var CAPTURE_RECT_DELAY_MS = 150; /* let the picker overlay leave the page    */
var CAPTURE_RESULT_TIMEOUT_MS = 12000; /* capture/crop must not hang         */
var MAX_CAPTURE_SIDE = 2000;    /* element screenshots are bounded in px    */
var MAX_CAPTURE_DATA_URL = 8 * 1024 * 1024; /* and in encoded size           */

var CAPTURE_FILE = "content/capture.js";
var PICKER_FILE = "content/picker.js";

/* ---- pending overlays ------------------------------------------------ */
var pendingCapture = null; /* { tabId, originTabId, timer } */
var pendingPick = null;    /* { tabId, originTabId, timer } */

/* ---- helpers --------------------------------------------------------- */
function delay(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

/* Run one chrome.* API call as a promise. Callback style is used first (it is
 * what the fake chrome object in the Node simulation implements); promise
 * style APIs are also handled if the callback is ignored. */
function callApi(fn) {
  var args = Array.prototype.slice.call(arguments, 1);
  return new Promise(function (resolve, reject) {
    var settled = false;

    function done(result) {
      if (settled) { return; }
      settled = true;
      var error = chrome.runtime && chrome.runtime.lastError;
      if (error) { reject(new Error(error.message || String(error))); }
      else { resolve(result); }
    }

    function failed(error) {
      if (settled) { return; }
      settled = true;
      reject(error instanceof Error ? error : new Error(String(error)));
    }

    var returned;
    try {
      returned = fn.apply(chrome, args.concat(done));
    } catch (error) {
      failed(error);
      return;
    }
    if (returned && typeof returned.then === "function") {
      returned.then(done, failed);
    }
  });
}

function isTabId(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function normalizeTabId(value) {
  var id = Number(value);
  return Number.isInteger(id) && id >= 0 ? id : null;
}

/* Only "en" switches the injected overlays; a missing/unknown value keeps
   the original Turkish default. */
function normalizeOverlayLang(value) {
  return value === "en" ? "en" : "tr";
}

function positiveInt(value) {
  var number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function positiveNumber(value) {
  var number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function clampNumber(value, minimum, maximum) {
  if (maximum < minimum) { return minimum; }
  return Math.min(Math.max(value, minimum), maximum);
}

/* CSS-pixel rect from the picker, normalised so negative origins are clipped
   instead of shifting the crop. Anything unusable yields null. */
function normalizeCropRect(value) {
  if (!value || typeof value !== "object") { return null; }

  var left = Number(value.left);
  var top = Number(value.top);
  var width = Number(value.width);
  var height = Number(value.height);

  if (
    !Number.isFinite(left) || !Number.isFinite(top) ||
    !Number.isFinite(width) || !Number.isFinite(height)
  ) {
    return null;
  }

  if (left < 0) { width += left; left = 0; }
  if (top < 0) { height += top; top = 0; }
  if (!(width >= 1) || !(height >= 1)) { return null; }

  return { left: left, top: top, width: width, height: height };
}

function normalizeDpr(value) {
  var dpr = positiveNumber(value);
  if (!dpr) { return 1; }
  return clampNumber(dpr, 0.5, 8);
}

/* ---- element screenshot crop ---------------------------------------- */
function bytesToBase64(bytes) {
  var chunkSize = 0x8000;
  var binary = "";

  for (var offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(offset, offset + chunkSize)
    );
  }

  return btoa(binary);
}

function blobToDataUrl(blob) {
  return blob.arrayBuffer().then(function (buffer) {
    var type = blob.type || "image/png";
    return "data:" + type + ";base64," + bytesToBase64(new Uint8Array(buffer));
  });
}

/* Crop the full-viewport capture down to the picked element. `rect` is in CSS
   pixels and `dpr` is the page's devicePixelRatio, so the screenshot scale is
   the same value. */
async function cropScreenshot(dataUrl, rect, dpr) {
  if (typeof OffscreenCanvas !== "function" || typeof createImageBitmap !== "function") {
    throw new Error("Crop is unavailable.");
  }

  var response = await fetch(dataUrl);
  var sourceBlob = await response.blob();
  var bitmap = await createImageBitmap(sourceBlob);

  try {
    if (!bitmap || !(bitmap.width > 0) || !(bitmap.height > 0)) {
      throw new Error("Screenshot could not be decoded.");
    }

    var scaleX = dpr;
    var scaleY = dpr;
    if (!(scaleX > 0) || !(scaleY > 0)) {
      throw new Error("Invalid screenshot scale.");
    }

    if (rect.left * scaleX >= bitmap.width || rect.top * scaleY >= bitmap.height) {
      throw new Error("Picked element is outside the screenshot.");
    }

    var sourceX = clampNumber(Math.round(rect.left * scaleX), 0, bitmap.width - 1);
    var sourceY = clampNumber(Math.round(rect.top * scaleY), 0, bitmap.height - 1);
    var sourceRight = clampNumber(
      Math.round((rect.left + rect.width) * scaleX),
      sourceX + 1,
      bitmap.width
    );
    var sourceBottom = clampNumber(
      Math.round((rect.top + rect.height) * scaleY),
      sourceY + 1,
      bitmap.height
    );
    var sourceWidth = sourceRight - sourceX;
    var sourceHeight = sourceBottom - sourceY;

    var scale = Math.min(
      1,
      MAX_CAPTURE_SIDE / sourceWidth,
      MAX_CAPTURE_SIDE / sourceHeight
    );
    var outputWidth = Math.max(1, Math.round(sourceWidth * scale));
    var outputHeight = Math.max(1, Math.round(sourceHeight * scale));

    var canvas = new OffscreenCanvas(outputWidth, outputHeight);
    var context = canvas.getContext("2d");
    if (!context) { throw new Error("Canvas is unavailable."); }

    context.drawImage(
      bitmap,
      sourceX, sourceY, sourceWidth, sourceHeight,
      0, 0, outputWidth, outputHeight
    );

    var outputBlob = await canvas.convertToBlob({ type: "image/png" });
    var croppedDataUrl = await blobToDataUrl(outputBlob);

    if (!/^data:image\//i.test(croppedDataUrl) || croppedDataUrl.length > MAX_CAPTURE_DATA_URL) {
      throw new Error("Element screenshot is too large.");
    }

    return {
      dataUrl: croppedDataUrl,
      width: outputWidth,
      height: outputHeight
    };
  } finally {
    if (bitmap && typeof bitmap.close === "function") { bitmap.close(); }
  }
}

/* Extension pages only: content scripts in web pages never receive this. */
function sendToPanel(message) {
  try {
    var returned = chrome.runtime.sendMessage(message);
    if (returned && typeof returned.then === "function") {
      returned.then(function () { /* no panel open */ }, function () { /* ignore */ });
    }
  } catch (error) {
    /* No open panel — the result is dropped, as before. */
  }
}

function sendToTab(tabId, message) {
  return callApi(chrome.tabs.sendMessage, tabId, message);
}

/* -------------------------------------------------------------------------
   Active app presence: never trust a stale "connected" flag.
   Probe the last known local port and ask every content script whether it is
   the app page. File pages count as open; a page whose server is stopped does
   not.
   ------------------------------------------------------------------------- */
function probePortStatus(port) {
  var value = Number(port);
  if (!Number.isInteger(value) || value <= 0) return Promise.resolve(null);
  var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  var timer = setTimeout(function () {
    if (controller) { try { controller.abort(); } catch (error) { /* ignore */ } }
  }, 900);
  return fetch("http://127.0.0.1:" + value + "/__rl/status", {
    method: "GET",
    cache: "no-store",
    signal: controller ? controller.signal : undefined,
  }).then(function (response) {
    if (!response.ok) return null;
    return response.json();
  }).then(function (data) {
    if (!data || data.app !== "request-ledger" || data.server !== true) return null;
    return data;
  }).catch(function () {
    return null;
  }).then(function (data) {
    clearTimeout(timer);
    return data;
  });
}

function pingTabPresence(tab) {
  return new Promise(function (resolve) {
    var settled = false;
    var timer = setTimeout(function () { done(null); }, 700);
    function done(value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    }
    try {
      chrome.tabs.sendMessage(tab.id, { type: "RL_APP_PRESENCE_PING" }, function (response) {
        var error = chrome.runtime && chrome.runtime.lastError;
        done(error || !response ? null : response);
      });
    } catch (error) {
      done(null);
    }
  });
}

async function probeAppPresence(message) {
  var tabs = [];
  try { tabs = await callApi(chrome.tabs.query, {}); } catch (error) { tabs = []; }
  var sawStoppedApp = false;
  for (var j = 0; j < (tabs || []).length; j += 1) {
    var tab = tabs[j];
    if (!tab || typeof tab.id !== "number") continue;
    var response = await pingTabPresence(tab);
    if (!response || response.app !== true) continue;
    if (response.stopped === true) { sawStoppedApp = true; continue; }
    var fileMode = response.file === true || /^file:/i.test(String(response.url || tab.url || ""));
    if (fileMode) {
      return { open: true, mode: "file", url: response.url || tab.url || "" };
    }
    var tabPort = Number(response.port);
    if (!(tabPort > 0)) {
      try { tabPort = Number(new URL(response.url || tab.url || "").port); } catch (error) { tabPort = 0; }
    }
    if (tabPort > 0) {
      var tabStatus = await probePortStatus(tabPort);
      if (tabStatus) {
        try { await callApi(chrome.storage.local.set, { "rl-app-port": tabPort }); } catch (error) { /* ignore */ }
        return { open: true, mode: "server", port: tabPort, origin: "http://localhost:" + tabPort };
      }
      sawStoppedApp = true;
    }
  }
  if (sawStoppedApp) return { open: false, mode: "", reason: "app-stopped" };
  return { open: false, mode: "", reason: "no-app" };
}

/* Message first; if the tab has no content script, inject and retry once. */
function sendToTabWithInjection(tabId, message, file) {
  return sendToTab(tabId, message).catch(function () {
    return callApi(chrome.scripting.executeScript, {
      target: { tabId: tabId },
      files: [file]
    }).then(function () {
      return sendToTab(tabId, message);
    });
  });
}

/* ---- tab eligibility ------------------------------------------------- */
var EXCLUDED_PROTOCOLS = {
  "chrome:": true,
  "chrome-extension:": true,
  "chrome-untrusted:": true,
  "chrome-search:": true,
  "devtools:": true,
  "edge:": true,
  "about:": true,
  "view-source:": true
};

function isEligibleUrl(url) {
  if (!url || typeof url !== "string") { return false; }

  var parsed;
  try {
    parsed = new URL(url);
  } catch (error) {
    return false;
  }

  if (EXCLUDED_PROTOCOLS[parsed.protocol]) { return false; }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:" && parsed.protocol !== "file:") {
    return false;
  }
  if (parsed.hostname === "chromewebstore.google.com") { return false; }
  if (parsed.hostname === "chrome.google.com" && /^\/webstore(\/|$)/.test(parsed.pathname)) {
    return false;
  }

  return true;
}

function collectTabs(excludeTabId) {
  return callApi(chrome.tabs.query, { windowType: "normal" }).then(function (tabs) {
    var list = [];

    (tabs || []).forEach(function (tab) {
      if (!tab || typeof tab.id !== "number" || tab.id < 0) { return; }
      if (excludeTabId !== null && excludeTabId !== undefined && tab.id === excludeTabId) { return; }
      if (!isEligibleUrl(tab.url)) { return; }

      /* The page only needs enough to identify the tab. Window ids and
         audible/active flags stay in the extension. */
      list.push({
        id: tab.id,
        title: typeof tab.title === "string" && tab.title ? tab.title.slice(0, 200) : tab.url,
        url: tab.url.slice(0, 2048),
        favIconUrl: typeof tab.favIconUrl === "string" ? tab.favIconUrl.slice(0, 2048) : ""
      });
    });

    return list;
  });
}

/* ---- origin tab restore ---------------------------------------------- */
function restoreOrigin(originTabId) {
  if (!isTabId(originTabId)) { return; }

  callApi(chrome.tabs.update, originTabId, { active: true }).then(function (tab) {
    if (!tab || tab.windowId === undefined || !chrome.windows || !chrome.windows.update) {
      return null;
    }
    return callApi(chrome.windows.update, tab.windowId, { focused: true });
  }).catch(function () {
    /* The origin tab may be gone; nothing else to restore. */
  });
}

/* ---- capture --------------------------------------------------------- */
function finishCapture(task, result) {
  if (!task || pendingCapture !== task) { return; }

  pendingCapture = null;
  if (task.timer) {
    clearTimeout(task.timer);
    task.timer = null;
  }

  sendToPanel(result);
  restoreOrigin(task.originTabId);
}

function abortCapture(task, reason) {
  finishCapture(task, {
    type: "RL_CAPTURE_CANCELLED",
    tabId: task.tabId,
    reason: reason || "cancelled",
    appCapture: task.appCapture === true
  });
}

function cancelPendingCapture() {
  var task = pendingCapture;
  if (!task) { return; }

  sendToTab(task.tabId, { type: "RL_CROP_CANCEL" }).catch(function () { /* tab gone */ });
  abortCapture(task);
}

function armCaptureTimeout(task) {
  task.timer = setTimeout(function () {
    if (pendingCapture !== task) { return; }
    sendToTab(task.tabId, { type: "RL_CROP_CANCEL" }).catch(function () { /* tab gone */ });
    abortCapture(task, "timeout");
  }, OVERLAY_TIMEOUT_MS);
}

function beginCapture(tabId, originTabId, lang, appCapture) {
  cancelPendingCapture();
  cancelPendingPick();

  var task = {
    tabId: tabId,
    originTabId: originTabId,
    timer: null,
    lang: normalizeOverlayLang(lang),
    appCapture: appCapture === true
  };
  pendingCapture = task;

  (async function () {
    try {
      var tab = await callApi(chrome.tabs.get, tabId);
      if (!tab || !isEligibleUrl(tab.url)) {
        throw new Error("Bu sekme yakalanamıyor.");
      }

      await callApi(chrome.tabs.update, tabId, { active: true });
      await delay(ACTIVATE_DELAY_MS);

      var dataUrl = await callApi(chrome.tabs.captureVisibleTab, tab.windowId, { format: "png" });
      if (typeof dataUrl !== "string" || !/^data:image\//i.test(dataUrl)) {
        throw new Error("Ekran görüntüsü alınamadı.");
      }

      if (pendingCapture !== task) { return; }

      await sendToTabWithInjection(tabId, {
        type: "RL_CROP_START",
        dataUrl: dataUrl,
        lang: task.lang
      }, CAPTURE_FILE);

      if (pendingCapture !== task) { return; }
      armCaptureTimeout(task);
    } catch (error) {
      if (pendingCapture !== task) { return; }
      abortCapture(task, "failed");
    }
  })();
}

function onCropDone(tabId, message) {
  var task = pendingCapture;
  if (!task || task.tabId !== tabId) { return; }

  var dataUrl = typeof message.dataUrl === "string" ? message.dataUrl : "";
  if (!/^data:image\//i.test(dataUrl)) {
    abortCapture(task, "failed");
    return;
  }

  finishCapture(task, {
    type: "RL_CAPTURE_RESULT",
    dataUrl: dataUrl,
    width: positiveInt(message.width),
    height: positiveInt(message.height),
    tabId: task.tabId,
    appCapture: task.appCapture === true
  });
}

/* ---- element picker -------------------------------------------------- */
function finishPick(task, result) {
  if (!task || pendingPick !== task) { return; }

  pendingPick = null;
  if (task.timer) {
    clearTimeout(task.timer);
    task.timer = null;
  }

  sendToPanel(result);
  restoreOrigin(task.originTabId);
  resumePickedTab(task);
}

/* The picked tab was mounted with its dock suspended. Bring the normal
   panel back shortly after the result so the page is usable again. */
function resumePickedTab(task) {
  if (!task || task.dockSuspended !== true) { return; }
  var tabId = task.tabId;
  setTimeout(function () {
    sendToTab(tabId, { type: "RL_DOCK_RESUME" }).catch(function () { /* tab gone */ });
  }, 1200);
}

function abortPick(task, reason) {
  finishPick(task, {
    type: "RL_PICK_CANCELLED",
    tabId: task.tabId,
    reason: reason || "cancelled",
    appPick: task.appPick === true
  });
}

function cancelPendingPick() {
  var task = pendingPick;
  if (!task) { return; }

  sendToTab(task.tabId, { type: "RL_PICKER_CANCEL" }).catch(function () { /* tab gone */ });
  abortPick(task);
}

function armPickTimeout(task) {
  task.timer = setTimeout(function () {
    if (pendingPick !== task) { return; }
    sendToTab(task.tabId, { type: "RL_PICKER_CANCEL" }).catch(function () { /* tab gone */ });
    abortPick(task, "timeout");
  }, OVERLAY_TIMEOUT_MS);
}

function beginPick(tabId, originTabId, capture, appPick, lang) {
  cancelPendingCapture();
  cancelPendingPick();

  var task = {
    tabId: tabId,
    originTabId: originTabId,
    capture: capture === true,
    appPick: appPick === true,
    dockSuspended: false,
    lang: normalizeOverlayLang(lang),
    timer: null
  };
  pendingPick = task;

  (async function () {
    try {
      var tab = await callApi(chrome.tabs.get, tabId);
      if (!tab || !isEligibleUrl(tab.url)) {
        throw new Error("Bu sekmeden öğe seçilemiyor.");
      }

      /* A cross-tab pick must show only the picker overlay there. The dock
         on the requesting tab stays mounted; the picked tab's host does not. */
      if (isTabId(originTabId) && tabId !== originTabId) {
        task.dockSuspended = true;
        await sendToTab(tabId, { type: "RL_DOCK_SUSPEND" }).catch(function () {
          /* no dock content script (yet); the picker still works */
        });
      }

      await callApi(chrome.tabs.update, tabId, { active: true });
      await delay(ACTIVATE_DELAY_MS);

      await sendToTabWithInjection(tabId, {
        type: "RL_PICKER_START",
        capture: task.capture,
        lang: task.lang
      }, PICKER_FILE);

      if (pendingPick !== task) { return; }
      armPickTimeout(task);
    } catch (error) {
      if (pendingPick !== task) { return; }
      abortPick(task, "failed");
    }
  })();
}

function clipText(value, maxLength) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function onPickDone(tabId, message) {
  var task = pendingPick;
  if (!task || task.tabId !== tabId) { return; }

  var selector = clipText(message.selector, 4000);
  if (!selector) {
    abortPick(task, "failed");
    return;
  }

  var result = {
    type: "RL_PICK_RESULT",
    selector: selector,
    label: clipText(message.label, 400),
    tag: clipText(message.tag, 64),
    text: clipText(message.text, 240),
    page: clipText(message.page, 2048),
    capture: Boolean(task.capture),
    appPick: task.appPick === true,
    tabId: task.tabId
  };

  var rect = task.capture ? normalizeCropRect(message.rect) : null;
  if (!rect) {
    /* The selector is always worth reporting, even when no crop is possible. */
    if (task.capture) { result.captureError = true; }
    finishPick(task, result);
    return;
  }

  /* The overlay has already been torn down by the picker. Give the page one
     frame (plus compositing) to repaint before grabbing the viewport. */
  if (task.timer) {
    clearTimeout(task.timer);
    task.timer = null;
  }

  task.timer = setTimeout(function () {
    if (pendingPick !== task) { return; }
    finishPick(task, copyResult(result, { captureError: true }));
  }, CAPTURE_RESULT_TIMEOUT_MS);

  setTimeout(function () {
    if (pendingPick !== task) { return; }
    capturePickedElement(
      task,
      rect,
      normalizeDpr(message.dpr),
      result
    );
  }, CAPTURE_RECT_DELAY_MS);
}

function copyResult(base, extra) {
  var copy = {};
  var key;

  for (key in base) {
    if (Object.prototype.hasOwnProperty.call(base, key)) { copy[key] = base[key]; }
  }
  for (key in extra) {
    if (Object.prototype.hasOwnProperty.call(extra, key)) { copy[key] = extra[key]; }
  }

  return copy;
}

async function capturePickedElement(task, rect, dpr, base) {
  try {
    var tab = await callApi(chrome.tabs.get, task.tabId);
    if (pendingPick !== task) { return; }
    if (!tab || typeof tab.windowId !== "number") {
      throw new Error("Sekme penceresi bulunamadı.");
    }

    var dataUrl = await callApi(
      chrome.tabs.captureVisibleTab,
      tab.windowId,
      { format: "png" }
    );

    if (pendingPick !== task) { return; }
    if (typeof dataUrl !== "string" || !/^data:image\//i.test(dataUrl)) {
      throw new Error("Ekran görüntüsü alınamadı.");
    }

    var crop = await cropScreenshot(dataUrl, rect, dpr);
    if (pendingPick !== task) { return; }

    finishPick(task, copyResult(base, {
      dataUrl: crop.dataUrl,
      width: crop.width,
      height: crop.height
    }));
  } catch (error) {
    if (pendingPick !== task) { return; }
    /* Selector wins over the screenshot: report it without an image. */
    finishPick(task, copyResult(base, { captureError: true }));
  }
}

/* ---- routing --------------------------------------------------------- */
/* An extension-page sender is identified by its chrome-extension:// URL/origin;
 * sender.tab alone cannot decide because panel iframes embedded in a page also
 * report the host tab. Only missing tab metadata falls back to "panel". */
function isExtensionPageSender(sender) {
  if (!sender) { return true; }

  var url = typeof sender.url === "string" ? sender.url : "";
  var origin = typeof sender.origin === "string" ? sender.origin : "";

  if (url.indexOf("chrome-extension://") === 0) { return true; }
  if (origin.indexOf("chrome-extension://") === 0) { return true; }
  if (!sender.tab && !url) { return true; }

  return false;
}

function handleContentMessage(message, sender, sendResponse) {
  var tabId = sender && sender.tab ? sender.tab.id : undefined;

  switch (message.type) {
    case "RL_CROP_DONE":
      sendResponse({ ok: true });
      onCropDone(tabId, message);
      return false;
    case "RL_CROP_ABORT": {
      sendResponse({ ok: true });
      var capture = pendingCapture;
      if (capture && capture.tabId === tabId) { abortCapture(capture); }
      return false;
    }
    case "RL_PICK_DONE":
      sendResponse({ ok: true });
      onPickDone(tabId, message);
      return false;
    case "RL_PICK_ABORT": {
      sendResponse({ ok: true });
      var pick = pendingPick;
      if (pick && pick.tabId === tabId) { abortPick(pick); }
      return false;
    }
    default:
      return false;
  }
}

function handlePanelMessage(message, sendResponse) {
  switch (message.type) {
    case "RL_PING":
      sendResponse({ ok: true, id: chrome.runtime.id, version: VERSION });
      return false;

    case "RL_DATA_CHANGED": {
      /* Fan out to every extension page (all panel frames, including a
         backgrounded app tab). Content scripts do not receive this. */
      sendToPanel({
        type: "RL_BRIDGE_DATA_CHANGED",
        projectId: typeof message.projectId === "string" ? message.projectId.slice(0, 120) : ""
      });
      sendResponse({ ok: true });
      return false;
    }

    case "RL_APP_PRESENCE": {
      probeAppPresence(message).then(function (result) {
        sendResponse(result || { open: false });
      }, function () {
        sendResponse({ open: false });
      });
      return true;
    }

    case "RL_SERVER_STOP": {
      /* An explicit stop from the app bridge reaches every extension panel,
         not only the tab that hosts the app page. */
      sendToPanel({ type: "RL_BRIDGE_SERVER_STOP" });
      sendResponse({ ok: true });
      return false;
    }

    case "RL_SERVER_RESUME": {
      /* A fresh HELLO after restart clears the stopped state on the connected
         panel; let the other open panels leave "App server stopped" too. */
      sendToPanel({ type: "RL_BRIDGE_SERVER_RESUME" });
      sendResponse({ ok: true });
      return false;
    }

    case "RL_TABS_LIST":
      collectTabs(normalizeTabId(message.excludeTabId)).then(
        function (tabs) { sendResponse({ ok: true, tabs: tabs }); },
        function (error) {
          sendResponse({
            ok: false,
            error: error && error.message ? error.message : String(error),
            tabs: []
          });
        }
      );
      return true;

    case "RL_CAPTURE_TAB": {
      var captureTabId = normalizeTabId(message.tabId);
      if (captureTabId === null) {
        sendResponse({ ok: false, error: "Geçersiz sekme." });
        return false;
      }
      beginCapture(
        captureTabId,
        normalizeTabId(message.originTabId),
        message.lang,
        message.appCapture === true
      );
      sendResponse({ ok: true });
      return false;
    }

    case "RL_PICK_ELEMENT": {
      var pickTabId = normalizeTabId(message.tabId);
      if (pickTabId === null) {
        sendResponse({ ok: false, error: "Geçersiz sekme." });
        return false;
      }
      beginPick(
        pickTabId,
        normalizeTabId(message.originTabId),
        message.capture === true,
        message.appPick === true,
        message.lang
      );
      sendResponse({ ok: true });
      return false;
    }

    case "RL_PICK_CANCEL": {
      var cancelTabId = normalizeTabId(message.tabId);
      if (!pendingPick || (cancelTabId !== null && pendingPick.tabId !== cancelTabId)) {
        sendResponse({ ok: true, cancelled: false });
        return false;
      }
      cancelPendingPick();
      sendResponse({ ok: true, cancelled: true });
      return false;
    }

    case "RL_CAPTURE_CANCEL": {
      var cancelCaptureTabId = normalizeTabId(message.tabId);
      if (!pendingCapture ||
          (cancelCaptureTabId !== null && pendingCapture.tabId !== cancelCaptureTabId)) {
        sendResponse({ ok: true, cancelled: false });
        return false;
      }
      cancelPendingCapture();
      sendResponse({ ok: true, cancelled: true });
      return false;
    }

    default:
      return false;
  }
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || typeof message !== "object" || typeof message.type !== "string") {
    return false;
  }

  /* Route by sender origin, never by sender.tab: panel iframes embedded in a
   * normal tab also carry sender.tab, while only content scripts carry a
   * page (http/https/file) sender.url. */
  if (isExtensionPageSender(sender)) {
    return handlePanelMessage(message, sendResponse);
  }
  return handleContentMessage(message, sender, sendResponse);
});

/* ---- safety nets ----------------------------------------------------- */
if (chrome.tabs.onRemoved) {
  chrome.tabs.onRemoved.addListener(function (tabId) {
    if (pendingCapture && pendingCapture.tabId === tabId) {
      abortCapture(pendingCapture, "closed");
    }
    if (pendingPick && pendingPick.tabId === tabId) {
      abortPick(pendingPick, "closed");
    }
  });
}

if (chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener(function (tabId, changeInfo) {
    if (!changeInfo || changeInfo.status !== "loading") { return; }
    if (pendingCapture && pendingCapture.tabId === tabId) {
      abortCapture(pendingCapture, "failed");
    }
    if (pendingPick && pendingPick.tabId === tabId) {
      abortPick(pendingPick, "failed");
    }
  });
}

/* ---- boot ------------------------------------------------------------ */
chrome.runtime.onInstalled.addListener(function (details) {
  var reason = details && details.reason ? details.reason : "unknown";
  console.log("[Request Ledger] installed (" + reason + ") v" + VERSION);
});
