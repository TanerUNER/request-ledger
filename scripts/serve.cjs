#!/usr/bin/env node
"use strict";

/*
  Tiny static server for local use. No dependencies.

    node scripts/serve.cjs [port]                 (default 8080)
    node scripts/serve.cjs --port 0 --open        (free port, open the browser)
    node scripts/serve.cjs --port 0 --auto-stop   (stop after the page is gone)

  Optional flags:
    --port <n> | --port=<n> | <n>   port to bind; 0 picks a free port
    --open                          open the default browser after listening
    --fallback-port-0               if the requested port is busy, retry on port 0
    --auto-stop[=seconds]           stop after N seconds without a live page (default 300)
    --no-auto-stop                  never stop on idle
    --lock <file>                   write { pid, port, url, startedAt } while running
    --root <dir>                    directory to serve (default: repository root)

  Lifecycle protocol used by the page and start.cmd:
    GET  /__rl/status      server identity and liveness
    POST /__rl/heartbeat   marks a live page and resets the idle timer
    POST /__rl/pagehide    marks the page gone (reload/navigation/close)
    POST /__rl/shutdown    stops the server

  Serving matters: browsers treat file:// as an opaque origin, so storage and
  folder features behave differently there.
*/

const http = require("node:http");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

/* ---------- arguments ---------- */

function parseArgs(argv) {
  const options = { port: 8080, portGiven: false, open: false, autoStop: false, autoStopMs: 300000, lock: "", root: "", fallbackPortZero: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--open") {
      options.open = true;
    } else if (arg === "--auto-stop" || arg === "--autoStop") {
      options.autoStop = true;
    } else if (arg.indexOf("--auto-stop=") === 0) {
      options.autoStop = true;
      const seconds = Number(arg.slice("--auto-stop=".length));
      if (Number.isFinite(seconds) && seconds > 0) options.autoStopMs = Math.round(seconds * 1000);
    } else if (arg === "--no-auto-stop") {
      options.autoStop = false;
    } else if (arg === "--fallback-port-0" || arg === "--fallback-port0") {
      options.fallbackPortZero = true;
    } else if (arg === "--port" || arg === "-p") {
      const value = Number(argv[i + 1]);
      i += 1;
      if (Number.isInteger(value) && value >= 0 && value <= 65535) {
        options.port = value;
        options.portGiven = true;
      }
    } else if (arg.indexOf("--port=") === 0) {
      const value = Number(arg.slice("--port=".length));
      if (Number.isInteger(value) && value >= 0 && value <= 65535) {
        options.port = value;
        options.portGiven = true;
      }
    } else if (arg === "--lock") {
      options.lock = argv[i + 1] || "";
      i += 1;
    } else if (arg.indexOf("--lock=") === 0) {
      options.lock = arg.slice("--lock=".length);
    } else if (arg === "--root") {
      options.root = argv[i + 1] || "";
      i += 1;
    } else if (arg.indexOf("--root=") === 0) {
      options.root = arg.slice("--root=".length);
    } else if (/^\d+$/.test(arg)) {
      const value = Number(arg);
      if (value <= 65535) {
        options.port = value;
        options.portGiven = true;
      }
    }
  }
  /* Ephemeral mode (port 0) is the launcher's lifecycle: stop when the page
     stops heartbeating. A plain `serve.cjs 8080` stays up for manual work. */
  if (!options.autoStop && options.portGiven && options.port === 0 && !argv.includes("--no-auto-stop")) {
    options.autoStop = true;
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const root = path.resolve(options.root || path.join(__dirname, ".."));
const lockFile = options.lock ? path.resolve(process.cwd(), options.lock) : "";
const portFile = path.join(root, ".rl-port");
const startedAt = new Date().toISOString();
let lastHeartbeat = Date.now();
let heartbeatSeen = false;
let livePage = false;
let fallbackFromPort = 0;
const livePages = new Map();
let closeGraceTimer = null;
const CLOSE_GRACE_MS = 5000;
let shuttingDown = false;
let actualPort = options.port;

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".zip": "application/zip",
  ".txt": "text/plain; charset=utf-8",
  ".cmd": "text/plain; charset=utf-8",
};

function entryPage() {
  if (fs.existsSync(path.join(root, "index.html"))) return "/index.html";
  if (fs.existsSync(path.join(root, "request-ledger.html"))) return "/request-ledger.html";
  return "/index.html";
}

function baseUrl() {
  return "http://localhost:" + actualPort;
}

/* A fallback port is a different browser origin. Carry the requested port
   so the page can warn and point at the data left on the old origin. */
function pageUrl() {
  var url = baseUrl() + entryPage();
  if (fallbackFromPort) url += "?rl-moved=" + fallbackFromPort;
  return url;
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

const projectsRoot = path.join(root, "projects");

function safeSlug(value) {
  const text = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return text || "project";
}

function projectFolder(slug) {
  const safe = safeSlug(slug);
  const folder = path.join(projectsRoot, safe);
  if (!folder.startsWith(projectsRoot + path.sep)) throw new Error("invalid project folder");
  return { slug: safe, folder };
}

function readProjectMeta(slug) {
  try {
    const { folder } = projectFolder(slug);
    return JSON.parse(fs.readFileSync(path.join(folder, "project.json"), "utf8"));
  } catch (error) {
    return null;
  }
}

function writeProjectMeta(slug, meta) {
  const { folder } = projectFolder(slug);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, "project.json"), JSON.stringify(meta, null, 2) + "\n", "utf8");
}

function ensureProjectFolder(projectId, name, requestedSlug) {
  const wanted = safeSlug(requestedSlug || name);
  let slug = wanted;
  const existing = readProjectMeta(slug);
  if (existing && existing.projectId && projectId && existing.projectId !== projectId) {
    slug = (wanted + "-" + safeSlug(String(projectId).slice(-6))).slice(0, 90);
  }
  const { folder } = projectFolder(slug);
  fs.mkdirSync(folder, { recursive: true });
  const previous = readProjectMeta(slug) || {};
  const stamp = new Date().toISOString();
  const meta = {
    projectId: String(projectId || previous.projectId || ""),
    name: String(name || previous.name || "Project").slice(0, 80),
    slug: slug,
    createdAt: previous.createdAt || stamp,
    updatedAt: stamp,
    exportTarget: previous.exportTarget || "",
    ledgerId: previous.ledgerId || "",
    archiveCollapsed: previous.archiveCollapsed === true,
    requestCount: Number(previous.requestCount) || 0,
  };
  writeProjectMeta(slug, meta);
  return { slug, folder, meta };
}

function readJsonBody(request, maxBytes) {
  return new Promise(function (resolve) {
    let size = 0;
    const chunks = [];
    request.on("data", function (chunk) {
      size += chunk.length;
      if (size > (maxBytes || 32 * 1024 * 1024)) {
        request.destroy();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", function () {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch (error) { resolve(null); }
    });
    request.on("error", function () { resolve(null); });
  });
}

function writeExportFiles(slug, files) {
  const { folder } = projectFolder(slug);
  const exportDir = path.join(folder, "exports");
  fs.mkdirSync(exportDir, { recursive: true });
  const written = [];
  (Array.isArray(files) ? files : []).slice(0, 100).forEach(function (file) {
    const name = path.basename(String(file && file.name || "")).slice(0, 180);
    if (!name) return;
    const data = file.encoding === "base64"
      ? Buffer.from(String(file.content || ""), "base64")
      : Buffer.from(String(file.content || ""), "utf8");
    fs.writeFileSync(path.join(exportDir, name), data);
    written.push(name);
  });
  return { folder: exportDir, files: written };
}

/* ---------- disk truth: project data, archive, media, active id ---------- */

function findProjectSlug(projectId) {
  if (!projectId) return null;
  try {
    if (!fs.existsSync(projectsRoot)) return null;
    const entries = fs.readdirSync(projectsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const meta = readProjectMeta(entry.name);
      if (meta && meta.projectId === projectId) return meta.slug || entry.name;
    }
  } catch (error) { /* ignore */ }
  return null;
}

function readJsonFile(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function readProjectLedger(slug) {
  const { folder } = projectFolder(slug);
  return readJsonFile(path.join(folder, "ledger.json"), null);
}

function readProjectArchive(slug) {
  const { folder } = projectFolder(slug);
  return readJsonFile(path.join(folder, "archive.json"), { records: [], drafts: [], history: [] });
}

function writeProjectArchive(slug, archive) {
  const { folder } = projectFolder(slug);
  fs.mkdirSync(folder, { recursive: true });
  const payload = {
    records: Array.isArray(archive && archive.records) ? archive.records : [],
    drafts: Array.isArray(archive && archive.drafts) ? archive.drafts : [],
    history: Array.isArray(archive && archive.history) ? archive.history : [],
  };
  fs.writeFileSync(path.join(folder, "archive.json"), JSON.stringify(payload, null, 2) + "\n", "utf8");
  return payload;
}

function mediaIndexFile(slug) {
  const { folder } = projectFolder(slug);
  return path.join(folder, "media.json");
}

function readMediaIndex(slug) {
  const list = readJsonFile(mediaIndexFile(slug), []);
  return Array.isArray(list) ? list : [];
}

function writeMediaIndex(slug, list) {
  const { folder } = projectFolder(slug);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(mediaIndexFile(slug), JSON.stringify(list, null, 2) + "\n", "utf8");
}

function safeMediaId(value) {
  return /^[A-Za-z0-9_-]{1,80}$/.test(String(value || ""));
}

function mediaFilePath(slug, id) {
  const { folder } = projectFolder(slug);
  const mediaDir = path.join(folder, "media");
  const file = path.join(mediaDir, String(id));
  if (!file.startsWith(mediaDir + path.sep)) throw new Error("invalid media path");
  return file;
}

function activeProjectFile() {
  return path.join(projectsRoot, ".active");
}

function readActiveProjectId() {
  try { return fs.readFileSync(activeProjectFile(), "utf8").trim(); } catch (error) { return ""; }
}

function writeActiveProjectId(projectId) {
  fs.mkdirSync(projectsRoot, { recursive: true });
  fs.writeFileSync(activeProjectFile(), String(projectId || "").slice(0, 120) + "\n", "utf8");
}

function writeLock() {
  if (!lockFile) return;
  const payload = {
    pid: process.pid,
    port: actualPort,
    url: pageUrl(),
    startedAt: startedAt,
  };
  try {
    fs.mkdirSync(path.dirname(lockFile), { recursive: true });
    fs.writeFileSync(lockFile, JSON.stringify(payload, null, 2) + "\n", "utf8");
  } catch (error) {
    console.error("Request Ledger: could not write lock file: " + error.message);
  }
}

/* Persist the real bound port so start.cmd can reuse it on the next launch.
   The file deliberately survives shutdown; it is the launcher's memory. */
function writePortFile(port) {
  try {
    fs.writeFileSync(portFile, String(port) + "\n", "utf8");
  } catch (error) {
    console.error("Request Ledger: could not write .rl-port: " + error.message);
  }
}

function removeLock() {
  if (!lockFile) return;
  try {
    const current = JSON.parse(fs.readFileSync(lockFile, "utf8"));
    if (current && Number(current.pid) === process.pid) fs.rmSync(lockFile, { force: true });
  } catch (error) {
    /* already gone or unreadable */
  }
}

function openBrowser(url) {
  const platform = process.platform;
  let command;
  let args;
  if (platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", url];
  } else if (platform === "darwin") {
    command = "open";
    args = [url];
  } else {
    command = "xdg-open";
    args = [url];
  }
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.unref();
  } catch (error) {
    console.error("Request Ledger: could not open the browser: " + error.message);
  }
}

function noteLivePage(pageId) {
  const id = String(pageId || "").trim().slice(0, 120);
  lastHeartbeat = Date.now();
  heartbeatSeen = true;
  if (!id) {
    /* Legacy/launcher heartbeats have no page identity. They keep the idle
       timer fresh but must not keep the server alive after the last real app
       page closed. */
    return;
  }
  livePages.set(id, Date.now());
  livePage = true;
  if (closeGraceTimer) {
    clearTimeout(closeGraceTimer);
    closeGraceTimer = null;
  }
}

function scheduleCloseGrace() {
  if (closeGraceTimer) clearTimeout(closeGraceTimer);
  livePage = false;
  closeGraceTimer = setTimeout(function () {
    closeGraceTimer = null;
    if (livePages.size === 0) stopServer("last page closed");
  }, CLOSE_GRACE_MS);
  closeGraceTimer.unref && closeGraceTimer.unref();
}

function notePageGone(pageId) {
  const id = String(pageId || "").trim().slice(0, 120);
  if (id) livePages.delete(id);
  else livePages.clear();
  livePage = livePages.size > 0;
  if (livePages.size === 0) scheduleCloseGrace();
}

function stopServer(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  removeLock();
  server.close(function () {
    process.exit(0);
  });
  /* A keep-alive connection can hold the close callback; never hang. */
  setTimeout(function () {
    process.exit(0);
  }, 1200).unref();
  if (reason) console.log("Request Ledger: stopping (" + reason + ")");
}

/* ---------- rebind ---------- */

function findFreePort() {
  return new Promise(function (resolve) {
    const probe = net.createServer();
    probe.once("error", function () { resolve(null); });
    probe.listen(0, "127.0.0.1", function () {
      const port = probe.address().port;
      probe.close(function () { resolve(port); });
    });
  });
}

function portIsFree(port) {
  return new Promise(function (resolve) {
    const probe = net.createServer();
    probe.once("error", function () { resolve(false); });
    probe.listen(port, "127.0.0.1", function () {
      probe.close(function () { resolve(true); });
    });
  });
}

function requestJson(port, method, pathname) {
  return new Promise(function (resolve) {
    const request = http.request({
      host: "127.0.0.1",
      port: port,
      path: pathname,
      method: method,
      timeout: 900,
    }, function (response) {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", function (chunk) { body += chunk; });
      response.on("end", function () {
        try { resolve({ status: response.statusCode, data: JSON.parse(body) }); }
        catch (error) { resolve({ status: response.statusCode, data: null }); }
      });
    });
    request.on("timeout", function () { request.destroy(); resolve(null); });
    request.on("error", function () { resolve(null); });
    request.end();
  });
}

async function probeLedgerServer(port) {
  const found = await requestJson(port, "GET", "/__rl/status");
  if (!found || found.status !== 200 || !found.data) return null;
  return found.data.app === "request-ledger" && found.data.server === true ? found.data : null;
}

async function waitForPortFree(port, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await portIsFree(port)) return true;
    await new Promise(function (resolve) { setTimeout(resolve, 150); });
  }
  return false;
}

async function resolveStartupPort() {
  if (options.port === 0) return 0;
  if (await portIsFree(options.port)) return options.port;
  /* The requested port belongs to the same app: stop that instance and reuse
     the exact port instead of silently splitting the origin. */
  const sameApp = await probeLedgerServer(options.port);
  if (sameApp) {
    console.log("Request Ledger: reusing port " + options.port + " (stopping the previous instance)");
    await requestJson(options.port, "POST", "/__rl/shutdown");
    if (await waitForPortFree(options.port, 5000)) return options.port;
  }
  if (options.fallbackPortZero) {
    fallbackFromPort = options.port;
    console.error("Request Ledger: port " + options.port + " is in use; starting on a free port instead.");
    return 0;
  }
  throw new Error("port " + options.port + " is in use");
}

async function resolveRebindPort(port) {
  if (port === 0) return findFreePort();
  return (await portIsFree(port)) ? port : null;
}

function spawnReboundServer(port) {
  const args = [__filename, "--port", String(port), "--root", root];
  if (options.autoStop) args.push("--auto-stop=" + Math.round(options.autoStopMs / 1000));
  if (lockFile) args.push("--lock", lockFile);
  try {
    const child = spawn(process.execPath, args, {
      cwd: root,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    return child;
  } catch (error) {
    console.error("Request Ledger: could not spawn the rebound server: " + error.message);
    return null;
  }
}

/* ---------- request handling ---------- */

const server = http.createServer(function (request, response) {
  let pathname;
  let query = null;
  try {
    pathname = decodeURIComponent((request.url || "/").split("?")[0]);
    query = new URLSearchParams((request.url || "").split("?")[1] || "");
  } catch (error) {
    response.writeHead(400);
    response.end("bad request");
    return;
  }

  if (pathname === "/__rl/status") {
    sendJson(response, 200, {
      app: "request-ledger",
      mode: "server",
      server: true,
      version: 1,
      pid: process.pid,
      port: actualPort,
      url: pageUrl(),
      startedAt: startedAt,
      autoStopSeconds: options.autoStop ? Math.round(options.autoStopMs / 1000) : 0,
      idleMs: Date.now() - lastHeartbeat,
      livePage: livePage,
      livePages: livePages.size,
      closeGraceMs: closeGraceTimer ? CLOSE_GRACE_MS : 0,
      heartbeatSeen: heartbeatSeen,
      fallbackFromPort: fallbackFromPort,
    });
    return;
  }

  if (pathname === "/__rl/heartbeat") {
    if (request.method !== "POST" && request.method !== "GET") {
      response.writeHead(405, { allow: "POST, GET" });
      response.end("method not allowed");
      return;
    }
    noteLivePage(query && query.get("page"));
    sendJson(response, 200, { ok: true, idleMs: 0, livePage: true, livePages: livePages.size });
    return;
  }

  if (pathname === "/__rl/pagehide") {
    if (request.method !== "POST" && request.method !== "GET") {
      response.writeHead(405, { allow: "POST, GET" });
      response.end("method not allowed");
      return;
    }
    /* A reload/navigation fires pagehide too. The new page heartbeats within
       the 5 s close grace; any heartbeat cancels the pending shutdown. */
    notePageGone(query && query.get("page"));
    sendJson(response, 200, { ok: true, livePage: livePages.size > 0, livePages: livePages.size, closeGraceMs: closeGraceTimer ? CLOSE_GRACE_MS : 0 });
    return;
  }

  if (pathname === "/__rl/bootstrap") {
    if (request.method !== "GET") {
      response.writeHead(405, { allow: "GET" });
      response.end("method not allowed");
      return;
    }
    const projects = [];
    try {
      if (fs.existsSync(projectsRoot)) {
        fs.readdirSync(projectsRoot, { withFileTypes: true }).forEach(function (entry) {
          if (!entry.isDirectory()) return;
          const meta = readProjectMeta(entry.name);
          if (meta) projects.push(meta);
        });
      }
    } catch (error) { /* ignore */ }
    sendJson(response, 200, { ok: true, activeId: readActiveProjectId(), projects: projects });
    return;
  }

  if (pathname === "/__rl/load") {
    if (request.method !== "GET") {
      response.writeHead(405, { allow: "GET" });
      response.end("method not allowed");
      return;
    }
    const projectId = String((query && query.get("projectId")) || "").slice(0, 120);
    const slug = findProjectSlug(projectId);
    if (!slug) {
      sendJson(response, 404, { ok: false, error: "project not found" });
      return;
    }
    try {
      sendJson(response, 200, {
        ok: true,
        project: readProjectMeta(slug),
        ledger: readProjectLedger(slug),
        archive: readProjectArchive(slug),
        media: readMediaIndex(slug),
      });
    } catch (error) {
      sendJson(response, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (pathname === "/__rl/active") {
    if (request.method !== "POST") {
      response.writeHead(405, { allow: "POST" });
      response.end("method not allowed");
      return;
    }
    readJsonBody(request, 1024 * 1024).then(function (body) {
      const projectId = String(body && body.projectId || "").slice(0, 120);
      if (!projectId || !findProjectSlug(projectId)) {
        sendJson(response, 400, { ok: false, error: "unknown project" });
        return;
      }
      writeActiveProjectId(projectId);
      sendJson(response, 200, { ok: true, activeId: projectId });
    });
    return;
  }

  if (pathname === "/__rl/media") {
    if (request.method !== "POST") {
      response.writeHead(405, { allow: "POST" });
      response.end("method not allowed");
      return;
    }
    readJsonBody(request, 40 * 1024 * 1024).then(function (body) {
      if (!body || typeof body !== "object") {
        sendJson(response, 400, { ok: false, error: "invalid body" });
        return;
      }
      const id = String(body.id || "");
      if (!safeMediaId(id)) {
        sendJson(response, 400, { ok: false, error: "invalid media id" });
        return;
      }
      const slug = findProjectSlug(String(body.projectId || ""));
      if (!slug) {
        sendJson(response, 404, { ok: false, error: "project not found" });
        return;
      }
      const dataUrl = String(body.dataUrl || "");
      const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
      if (!match) {
        sendJson(response, 400, { ok: false, error: "invalid media data" });
        return;
      }
      try {
        const bytes = Buffer.from(match[2], "base64");
        if (!bytes.length || bytes.length > 32 * 1024 * 1024) {
          sendJson(response, 413, { ok: false, error: "media too large" });
          return;
        }
        const file = mediaFilePath(slug, id);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, bytes);
        const list = readMediaIndex(slug).filter(function (item) { return item && item.id !== id; });
        list.push({
          id: id,
          kind: body.kind === "file" ? "file" : "image",
          name: String(body.name || id).slice(0, 180),
          type: String(body.type || match[1] || "application/octet-stream").slice(0, 120),
          ext: String(body.ext || "").slice(0, 20),
          size: bytes.length,
        });
        writeMediaIndex(slug, list);
        sendJson(response, 200, { ok: true, id: id, size: bytes.length, url: "/__rl/media/" + slug + "/" + id });
      } catch (error) {
        sendJson(response, 500, { ok: false, error: error.message });
      }
    });
    return;
  }

  if (pathname.indexOf("/__rl/media/") === 0) {
    const rest = pathname.slice("/__rl/media/".length).split("/");
    if (rest.length !== 2) {
      response.writeHead(400);
      response.end("bad media path");
      return;
    }
    const slug = rest[0];
    const id = rest[1];
    if (!/^[a-z0-9-]{1,90}$/.test(slug) || !safeMediaId(id)) {
      response.writeHead(400);
      response.end("bad media path");
      return;
    }
    if (request.method === "GET") {
      try {
        const file = mediaFilePath(slug, id);
        if (!fs.existsSync(file)) {
          response.writeHead(404);
          response.end("not found");
          return;
        }
        const meta = readMediaIndex(slug).find(function (item) { return item && item.id === id; });
        const data = fs.readFileSync(file);
        response.writeHead(200, {
          "content-type": meta && meta.type ? meta.type : "application/octet-stream",
          "content-length": data.length,
          "cache-control": "no-store",
        });
        response.end(data);
      } catch (error) {
        response.writeHead(404);
        response.end("not found");
      }
      return;
    }
    if (request.method === "DELETE") {
      try {
        const file = mediaFilePath(slug, id);
        if (fs.existsSync(file)) fs.unlinkSync(file);
        writeMediaIndex(slug, readMediaIndex(slug).filter(function (item) { return item && item.id !== id; }));
        sendJson(response, 200, { ok: true });
      } catch (error) {
        sendJson(response, 500, { ok: false, error: error.message });
      }
      return;
    }
    response.writeHead(405, { allow: "GET, DELETE" });
    response.end("method not allowed");
    return;
  }

  if (pathname === "/__rl/projects") {
    if (request.method === "GET") {
      const projects = [];
      try {
        if (fs.existsSync(projectsRoot)) {
          fs.readdirSync(projectsRoot, { withFileTypes: true }).forEach(function (entry) {
            if (!entry.isDirectory()) return;
            const meta = readProjectMeta(entry.name);
            if (meta) projects.push(meta);
          });
        }
      } catch (error) { /* ignore */ }
      sendJson(response, 200, { ok: true, activeId: readActiveProjectId(), projects: projects });
      return;
    }
    if (request.method !== "POST") {
      response.writeHead(405, { allow: "GET, POST" });
      response.end("method not allowed");
      return;
    }
    readJsonBody(request, 1024 * 1024).then(function (body) {
      if (!body || typeof body !== "object") {
        sendJson(response, 400, { ok: false, error: "invalid body" });
        return;
      }
      try {
        const result = ensureProjectFolder(body.projectId, body.name, body.slug);
        sendJson(response, 200, { ok: true, slug: result.slug, folder: path.relative(root, result.folder).split(path.sep).join("/"), meta: result.meta });
      } catch (error) {
        sendJson(response, 500, { ok: false, error: error.message });
      }
    });
    return;
  }

  if (pathname === "/__rl/save") {
    if (request.method !== "POST") {
      response.writeHead(405, { allow: "POST" });
      response.end("method not allowed");
      return;
    }
    readJsonBody(request, 32 * 1024 * 1024).then(function (body) {
      if (!body || typeof body !== "object") {
        sendJson(response, 400, { ok: false, error: "invalid body" });
        return;
      }
      try {
        const result = ensureProjectFolder(body.projectId, body.name, body.slug);
        const snapshot = body.snapshot && typeof body.snapshot === "object" ? body.snapshot : {};
        fs.writeFileSync(path.join(result.folder, "ledger.json"), JSON.stringify(snapshot, null, 2) + "\n", "utf8");
        if (body.archive && typeof body.archive === "object") {
          writeProjectArchive(result.slug, body.archive);
        } else if (Array.isArray(body.records)) {
          fs.writeFileSync(path.join(result.folder, "records.json"), JSON.stringify(body.records, null, 2) + "\n", "utf8");
        }
        const meta = Object.assign({}, result.meta, {
          updatedAt: new Date().toISOString(),
          ledgerId: String(snapshot.ledgerId || result.meta.ledgerId || ""),
          archiveCollapsed: body.archiveCollapsed === true,
          requestCount: Array.isArray(snapshot.requests) ? snapshot.requests.length : 0,
        });
        writeProjectMeta(result.slug, meta);
        sendJson(response, 200, { ok: true, slug: result.slug, folder: path.relative(root, result.folder).split(path.sep).join("/") });
      } catch (error) {
        sendJson(response, 500, { ok: false, error: error.message });
      }
    });
    return;
  }

  if (pathname === "/__rl/export") {
    if (request.method !== "POST") {
      response.writeHead(405, { allow: "POST" });
      response.end("method not allowed");
      return;
    }
    readJsonBody(request, 64 * 1024 * 1024).then(function (body) {
      if (!body || typeof body !== "object") {
        sendJson(response, 400, { ok: false, error: "invalid body" });
        return;
      }
      try {
        const result = ensureProjectFolder(body.projectId, body.name, body.slug);
        const written = writeExportFiles(result.slug, body.files);
        sendJson(response, 200, { ok: true, slug: result.slug, folder: path.relative(root, result.folder).split(path.sep).join("/"), files: written.files });
      } catch (error) {
        sendJson(response, 500, { ok: false, error: error.message });
      }
    });
    return;
  }

  if (pathname === "/__rl/export-target") {
    if (request.method !== "POST") {
      response.writeHead(405, { allow: "POST" });
      response.end("method not allowed");
      return;
    }
    readJsonBody(request, 1024 * 1024).then(function (body) {
      if (!body || typeof body !== "object") {
        sendJson(response, 400, { ok: false, error: "invalid body" });
        return;
      }
      try {
        const result = ensureProjectFolder(body.projectId, body.name, body.slug);
        const meta = Object.assign({}, result.meta, { exportTarget: String(body.target || "").slice(0, 200) });
        writeProjectMeta(result.slug, meta);
        sendJson(response, 200, { ok: true, slug: result.slug, exportTarget: meta.exportTarget });
      } catch (error) {
        sendJson(response, 500, { ok: false, error: error.message });
      }
    });
    return;
  }

  if (pathname === "/__rl/rebind") {
    if (request.method !== "POST") {
      response.writeHead(405, { allow: "POST" });
      response.end("method not allowed");
      return;
    }
    /* Only the local app may ask the server to move. A browser sends Origin
       on POST; a same-origin request is the normal path. Non-browser callers
       without Origin are still allowed for the launcher/tests. */
    const origin = String(request.headers.origin || "");
    if (origin && !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/.test(origin)) {
      response.writeHead(403);
      response.end("forbidden");
      return;
    }
    let rawPort = null;
    let restart = false;
    try {
      const query = new URL(request.url, "http://127.0.0.1").searchParams;
      rawPort = query.get("port");
      restart = query.get("restart") === "1";
    } catch (error) {
      rawPort = null;
      restart = false;
    }
    /* In-place restart: spawn the replacement first, let it take over the
       same port (resolveStartupPort stops the old same-app instance if it is
       still bound), then exit. The page polls /__rl/status and reloads when
       the new pid answers. */
    if (restart) {
      if (shuttingDown) {
        sendJson(response, 409, { ok: false, error: "server is already stopping" });
        return;
      }
      if (!spawnReboundServer(actualPort)) {
        sendJson(response, 500, { ok: false, error: "could not start the replacement server" });
        return;
      }
      sendJson(response, 200, {
        ok: true,
        restarting: true,
        port: actualPort,
        pid: process.pid,
        url: baseUrl() + entryPage(),
      });
      setTimeout(function () { stopServer("restart"); }, 60);
      return;
    }
    const requested = rawPort == null ? NaN : Number(String(rawPort).trim());
    if (!Number.isInteger(requested) || requested < 0 || requested > 65535) {
      sendJson(response, 400, { ok: false, error: "port must be a whole number between 0 and 65535" });
      return;
    }
    if (requested === actualPort) {
      sendJson(response, 200, { ok: true, port: actualPort, url: baseUrl() + entryPage(), unchanged: true });
      return;
    }
    if (shuttingDown) {
      sendJson(response, 409, { ok: false, error: "server is already stopping" });
      return;
    }
    resolveRebindPort(requested).then(function (port) {
      if (port == null) {
        sendJson(response, 409, { ok: false, error: "port is already in use" });
        return;
      }
      if (!spawnReboundServer(port)) {
        sendJson(response, 500, { ok: false, error: "could not start the rebound server" });
        return;
      }
      let hostname = "localhost";
      try {
        hostname = new URL("http://" + (request.headers.host || "localhost")).hostname;
      } catch (error) {
        hostname = "localhost";
      }
      sendJson(response, 200, {
        ok: true,
        port: port,
        url: "http://" + hostname + ":" + port + entryPage() + "?rl-port=" + port + "&rl-moved=" + actualPort,
      });
      setTimeout(function () { stopServer("rebind"); }, 60);
    }).catch(function (error) {
      sendJson(response, 500, { ok: false, error: error.message });
    });
    return;
  }

  if (pathname === "/__rl/shutdown") {
    if (request.method !== "POST" && request.method !== "GET") {
      response.writeHead(405, { allow: "POST, GET" });
      response.end("method not allowed");
      return;
    }
    sendJson(response, 200, { ok: true, stopping: true });
    setTimeout(function () {
      stopServer("page request");
    }, 40);
    return;
  }

  if (pathname === "/") pathname = entryPage();
  const file = path.join(root, pathname);
  if (!file.startsWith(root + path.sep) && file !== root) {
    response.writeHead(403);
    response.end("forbidden");
    return;
  }

  fs.readFile(file, function (error, data) {
    if (error) {
      response.writeHead(404);
      response.end("not found");
      return;
    }
    response.writeHead(200, {
      "content-type": types[path.extname(file).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(data);
  });
});

async function startListening() {
  let port;
  try {
    port = await resolveStartupPort();
  } catch (error) {
    console.error("Request Ledger: " + error.message);
    removeLock();
    process.exit(1);
    return;
  }
  options.port = port;
  server.listen(port, "127.0.0.1", function () {
    actualPort = server.address().port;
    writeLock();
    writePortFile(actualPort);
    const url = pageUrl();
    console.log("Request Ledger: " + url);
    if (options.autoStop) {
      console.log("Request Ledger: idle stop after " + Math.round(options.autoStopMs / 1000) + " s with no live page");
    }
    if (options.open) openBrowser(url);
  });
}

server.on("error", function (error) {
  if (error.code === "EADDRINUSE" && options.fallbackPortZero && options.port !== 0) {
    fallbackFromPort = options.port;
    console.error("Request Ledger: port " + options.port + " is in use; starting on a free port instead.");
    options.port = 0;
    actualPort = 0;
    setImmediate(startListening);
    return;
  }
  console.error("Request Ledger: server error: " + error.message);
  removeLock();
  process.exit(1);
});

startListening();

if (options.autoStop) {
  const timer = setInterval(function () {
    if (shuttingDown) return;
    /* A live page owns the server. Background throttling must not close it.
       Only a pagehide marker (or a server that never saw a page) allows the
       long grace timer to fire. */
    if (livePage) return;
    if (!heartbeatSeen || Date.now() - lastHeartbeat >= options.autoStopMs) stopServer("idle");
  }, 1000);
  timer.unref();
}

process.on("SIGINT", function () { stopServer("signal"); });
process.on("SIGTERM", function () { stopServer("signal"); });
process.on("exit", removeLock);
