"use strict";

/*
  Shared E2E browser harness.

  Every suite attaches page/panel targets through this module so automated
  runs never touch native browser UI:

  - Page.enable + Runtime.enable on every attached session.
  - Page.setInterceptFileChooserDialog so a file input never opens the OS
    chooser; tests must call setInputFiles() instead.
  - File System Access pickers are replaced with an immediate rejection, so a
    backup/export flow falls back to a download instead of hanging.
  - Page.javascriptDialogOpening is auto-accepted (beforeunload/confirm).
  - waitFor() is capped at 10 s and runs a caller-provided diagnostics dump
    (screenshot + trace) before throwing.

  The module patches cdp.events.push so it works with the per-suite CDP class
  without rewriting each class.
*/

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const PICKER_STUB = `(() => {
  const reject = () => Promise.reject(new DOMException("Native picker disabled in automated tests", "NotAllowedError"));
  try { Object.defineProperty(window, "showOpenFilePicker", { configurable: true, value: reject }); } catch (error) {}
  try { Object.defineProperty(window, "showDirectoryPicker", { configurable: true, value: reject }); } catch (error) {}
  try { Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: reject }); } catch (error) {}
})();`;

function install(cdp, options) {
  if (cdp.__rlHarness) return cdp.__rlHarness;
  const state = {
    options: options || {},
    dialogs: [],
    fileChoosers: [],
    diagnostics: null,
  };
  const originalPush = cdp.events.push.bind(cdp.events);
  cdp.events.push = function (event) {
    try {
      if (event && event.method === "Page.javascriptDialogOpening") {
        state.dialogs.push(event.params || {});
        if (event.sessionId) {
          cdp.send("Page.handleJavaScriptDialog", { accept: true }, event.sessionId).catch(function () {});
        }
      }
      if (event && event.method === "Page.fileChooserOpened") {
        state.fileChoosers.push(event.params || {});
      }
    } catch (error) {
      /* never let harness bookkeeping break the CDP stream */
    }
    return originalPush(event);
  };
  cdp.__rlHarness = state;
  return state;
}

function state(cdp) {
  return cdp.__rlHarness || install(cdp);
}

async function prepareSession(cdp, sessionId, options) {
  const opts = options || {};
  const info = state(cdp);
  try { await cdp.send("Runtime.enable", {}, sessionId); } catch (error) { /* ignore */ }
  try { await cdp.send("Page.enable", {}, sessionId); } catch (error) { /* ignore */ }
  try { await cdp.send("Page.setInterceptFileChooserDialog", { enabled: true }, sessionId); } catch (error) { /* ignore */ }
  if (opts.downloadPath) {
    try {
      await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: opts.downloadPath }, sessionId);
    } catch (error) { /* ignore */ }
  }
  try {
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: PICKER_STUB }, sessionId);
  } catch (error) { /* ignore */ }
  try {
    await cdp.send("Runtime.evaluate", { expression: PICKER_STUB, awaitPromise: false }, sessionId);
  } catch (error) { /* ignore */ }
  if (!info.prepared) info.prepared = [];
  info.prepared.push(sessionId);
  return sessionId;
}

async function setInputFiles(cdp, sessionId, selector, files) {
  await cdp.send("DOM.enable", {}, sessionId);
  const document = await cdp.send("DOM.getDocument", {}, sessionId);
  const node = await cdp.send("DOM.querySelector", { nodeId: document.root.nodeId, selector }, sessionId);
  if (!node || !node.nodeId) throw new Error("file input not found: " + selector);
  await cdp.send("DOM.setFileInputFiles", { files, nodeId: node.nodeId }, sessionId);
  /* Many app handlers clear input.value in their change handler, so a later
     read can legitimately be 0. The caller asserts acceptance by waiting for
     the app's confirmation UI instead of re-reading the input. */
  let accepted = 0;
  try {
    accepted = await evaluate(cdp, sessionId,
      "(document.querySelector(" + JSON.stringify(selector) + ") || { files: [] }).files.length");
  } catch (error) {
    accepted = 0;
  }
  return { nodeId: node.nodeId, accepted };
}

function setDiagnostics(cdp, fn) {
  state(cdp).diagnostics = typeof fn === "function" ? fn : null;
}

function diagnosticsDir() {
  const dir = path.join(os.tmpdir(), "rl-e2e-diagnostics");
  try { fs.mkdirSync(dir, { recursive: true }); } catch (error) { /* ignore */ }
  return dir;
}

/* Runtime artifacts must never survive a suite, even on failure. */
function cleanRuntime(root) {
  for (const name of ["projects", "backups", "deleted-projects"]) {
    try { fs.rmSync(path.join(root, name), { recursive: true, force: true }); } catch (error) { /* ignore */ }
  }
  for (const name of ["rl-config.json", ".rl-port"]) {
    try { fs.rmSync(path.join(root, name), { force: true }); } catch (error) { /* ignore */ }
  }
}

async function screenshot(cdp, sessionId, name) {
  const dir = diagnosticsDir();
  const file = path.join(dir, name.replace(/[^\w.-]+/g, "-") + "-" + Date.now() + ".png");
  try {
    const shot = await cdp.send("Page.captureScreenshot", { format: "png" }, sessionId);
    fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
    return file;
  } catch (error) {
    return "screenshot failed: " + error.message;
  }
}

async function evaluate(cdp, sessionId, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  }, sessionId);
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception && result.exceptionDetails.exception.description;
    throw new Error("evaluate failed: " + (description || result.exceptionDetails.text));
  }
  return result.result.value;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = require("node:net").createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

/* Each suite owns its own static/ledger server on a unique port. Nothing is
   shared through 8080 and the child is always stopped in the suite finally. */
async function startServer(root, options) {
  const opts = options || {};
  const port = opts.port || await freePort();
  const lock = path.join(os.tmpdir(), "rl-e2e-serve-" + port + ".lock");
  const child = spawn(process.execPath, [
    path.join(root, "scripts", "serve.cjs"),
    "--port", String(port),
    "--lock", lock,
  ], { cwd: root, stdio: "ignore", windowsHide: true });
  try {
    await waitFor(null, async () => {
      try {
        const response = await fetch("http://127.0.0.1:" + port + "/__rl/status");
        return response.ok;
      } catch (error) {
        return false;
      }
    }, "suite server on :" + port, 10000);
  } catch (error) {
    try { child.kill(); } catch (killError) { /* ignore */ }
    throw error;
  }
  let stopped = false;
  return {
    port,
    child,
    base: "http://localhost:" + port,
    stop() {
      if (stopped) return;
      stopped = true;
      try { child.kill(); } catch (error) { /* ignore */ }
      try { fs.rmSync(lock, { force: true }); } catch (error) { /* ignore */ }
      try { fs.rmSync(path.join(root, ".rl-port"), { force: true }); } catch (error) { /* ignore */ }
    },
  };
}

async function waitFor(cdp, fn, label, timeoutMs) {
  const limit = Math.min(Math.max(Number(timeoutMs) || 8000, 1000), 10000);
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < limit) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(150);
  }
  const info = cdp ? state(cdp) : { diagnostics: null };
  let detail = "";
  if (info.diagnostics) {
    try { detail = await info.diagnostics(); } catch (error) { detail = "diagnostics failed: " + error.message; }
  }
  throw new Error(
    "timeout: " + label + " after " + limit + "ms" +
    (lastError ? " (last: " + lastError.message + ")" : "") +
    (detail ? "\n" + detail : "")
  );
}

module.exports = {
  install,
  state,
  prepareSession,
  setInputFiles,
  setDiagnostics,
  screenshot,
  evaluate,
  waitFor,
  startServer,
  freePort,
  PICKER_STUB,
  diagnosticsDir,
  cleanRuntime,
};
