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
const zlib = require("node:zlib");
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
const startedAtMs = Date.now();
let lastHeartbeat = Date.now();
let heartbeatSeen = false;
let livePage = false;
let fallbackFromPort = 0;
const livePages = new Map();
let closeGraceTimer = null;
const CLOSE_GRACE_MS = 5000;
let shuttingDown = false;
let handoffInProgress = false;
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

function pageUrl() {
  return baseUrl() + entryPage();
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

function bootConfigScript() {
  const config = readServerConfig();
  const payload = {
    language: config.language === "tr" ? "tr" : "en",
    theme: config.theme === "dark" ? "dark" : "light",
    port: actualPort,
  };
  return "<script>window.__RL_SERVER_BOOT=" + JSON.stringify(payload) + ";</script>";
}

function injectBootConfig(buffer) {
  const html = buffer.toString("utf8");
  /* The app bundle also mentions `window.__RL_SERVER_BOOT`; only the injected
     <script> tag proves the config is present already. */
  if (html.indexOf("<script>window.__RL_SERVER_BOOT=") >= 0) return buffer;
  if (!/<head([^>]*)>/i.test(html)) return buffer;
  return Buffer.from(html.replace(/<head([^>]*)>/i, function (match) {
    return match + "\n" + bootConfigScript();
  }), "utf8");
}

const projectsRoot = path.join(root, "projects");
/* Runtime user data lives next to the server, never in git:
   projects/ (live), backups/ (full backup ZIPs), deleted-projects/ (per-project
   ZIPs) and rl-config.json (language/theme/last port). */
const backupsRoot = path.join(root, "backups");
const deletedRoot = path.join(root, "deleted-projects");
const configFile = path.join(root, "rl-config.json");

function ensureRuntimeDirs() {
  for (const dir of [projectsRoot, backupsRoot, deletedRoot]) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (error) { /* reported on use */ }
  }
}

function readServerConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(configFile, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function writeServerConfig(patch) {
  const next = Object.assign({}, readServerConfig(), patch || {});
  next.language = next.language === "tr" ? "tr" : "en";
  next.theme = next.theme === "dark" ? "dark" : "light";
  next.updatedAt = new Date().toISOString();
  try {
    fs.writeFileSync(configFile, JSON.stringify(next, null, 2) + "\n", "utf8");
  } catch (error) {
    console.error("Request Ledger: could not write rl-config.json: " + error.message);
  }
  return next;
}

function fileStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/* ---------- ZIP (deflate) read/write, zip-slip safe ---------- */

const CRC_TABLE = (function () {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const d = date || new Date();
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const ZIP_MAX_ENTRIES = 20000;
const ZIP_MAX_BYTES = 512 * 1024 * 1024;

function zipCreate(files) {
  const list = Array.isArray(files) ? files : [];
  if (list.length > ZIP_MAX_ENTRIES) throw new Error("too many files for a ZIP");
  const localParts = [];
  const centralParts = [];
  const now = dosDateTime(new Date());
  let offset = 0;
  let total = 0;
  for (const file of list) {
    const name = Buffer.from(String(file.name || ""), "utf8");
    if (!name.length) continue;
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data || []);
    total += data.length;
    if (total > ZIP_MAX_BYTES) throw new Error("ZIP content is too large");
    const deflated = zlib.deflateRawSync(data, { level: 6 });
    const useDeflate = deflated.length > 0 && deflated.length < data.length;
    const payload = useDeflate ? deflated : data;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(now.time, 10);
    local.writeUInt16LE(now.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(now.time, 12);
    central.writeUInt16LE(now.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + payload.length;
  }
  const centralBuffer = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(centralParts.length / 2, 8);
  end.writeUInt16LE(centralParts.length / 2, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([Buffer.concat(localParts), centralBuffer, end]);
}

function zipRead(buffer) {
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (data.length < 22) throw new Error("not a ZIP file");
  let eocd = -1;
  const min = Math.max(0, data.length - 65557);
  for (let i = data.length - 22; i >= min; i -= 1) {
    if (data.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("ZIP end record not found");
  const count = data.readUInt16LE(eocd + 10);
  let cursor = data.readUInt32LE(eocd + 16);
  if (count > ZIP_MAX_ENTRIES) throw new Error("too many ZIP entries");
  const entries = [];
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    if (cursor + 46 > data.length || data.readUInt32LE(cursor) !== 0x02014b50) throw new Error("corrupt ZIP directory");
    const method = data.readUInt16LE(cursor + 10);
    const compSize = data.readUInt32LE(cursor + 20);
    const size = data.readUInt32LE(cursor + 24);
    const nameLen = data.readUInt16LE(cursor + 28);
    const extraLen = data.readUInt16LE(cursor + 30);
    const commentLen = data.readUInt16LE(cursor + 32);
    const localOffset = data.readUInt32LE(cursor + 42);
    const name = data.slice(cursor + 46, cursor + 46 + nameLen).toString("utf8");
    cursor += 46 + nameLen + extraLen + commentLen;
    if (localOffset + 30 > data.length || data.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("corrupt ZIP entry");
    const localNameLen = data.readUInt16LE(localOffset + 26);
    const localExtra = data.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLen + localExtra;
    const payload = data.slice(start, start + compSize);
    total += size;
    if (total > ZIP_MAX_BYTES) throw new Error("ZIP content is too large");
    let content;
    if (method === 0) content = Buffer.from(payload);
    else if (method === 8) content = zlib.inflateRawSync(payload);
    else throw new Error("unsupported ZIP compression");
    entries.push({ name: name, data: content });
  }
  return entries;
}

/* A ZIP entry name must stay inside the destination folder. */
function safeZipEntryName(name) {
  const raw = String(name || "").replace(/\\/g, "/");
  if (!raw || raw.length > 400) return "";
  if (raw.startsWith("/") || /^[a-zA-Z]:/.test(raw)) return "";
  const parts = raw.split("/");
  for (const part of parts) {
    if (!part || part === "." || part === "..") return "";
  }
  return parts.join("/");
}

function zipExtractTo(buffer, destDir) {
  const base = path.resolve(destDir);
  const written = [];
  for (const entry of zipRead(buffer)) {
    const name = safeZipEntryName(entry.name);
    if (!name) throw new Error("unsafe path in ZIP: " + entry.name.slice(0, 80));
    const target = path.resolve(base, name);
    if (target !== base && !target.startsWith(base + path.sep)) throw new Error("unsafe path in ZIP");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.data);
    written.push(name);
  }
  return written;
}

function zipFolder(folder) {
  const files = [];
  function walk(current, prefix) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(current, entry.name);
      const rel = prefix ? prefix + "/" + entry.name : entry.name;
      if (entry.isDirectory()) walk(full, rel);
      else if (entry.isFile()) files.push({ name: rel, data: fs.readFileSync(full) });
    }
  }
  walk(folder, "");
  return zipCreate(files);
}

function zipEntryJson(buffer, name) {
  try {
    const found = zipRead(buffer).find((entry) => entry.name === name);
    return found ? JSON.parse(found.data.toString("utf8")) : null;
  } catch (error) {
    return null;
  }
}

function safeArchiveName(value) {
  const name = String(value || "");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,140}\.zip$/.test(name)) return "";
  if (name.indexOf("..") >= 0) return "";
  return name;
}

function uniqueChildFolder(parent, wanted) {
  let slug = safeSlug(wanted);
  let candidate = path.join(parent, slug);
  let index = 2;
  while (fs.existsSync(candidate)) {
    slug = safeSlug(wanted).slice(0, 70) + "-" + index;
    candidate = path.join(parent, slug);
    index += 1;
    if (index > 500) throw new Error("could not find a free project folder name");
  }
  return { slug: slug, folder: candidate };
}

function listArchiveDir(dir, rootDir) {
  ensureRuntimeDirs();
  const list = [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (error) { return list; }
  for (const entry of entries) {
    if (!entry.isFile() || !/\.zip$/i.test(entry.name)) continue;
    const full = path.join(dir, entry.name);
    let stat = null;
    try { stat = fs.statSync(full); } catch (error) { continue; }
    list.push({
      name: entry.name,
      size: stat.size,
      createdAt: stat.mtime.toISOString(),
      folder: rootDir,
      path: full,
    });
  }
  list.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  return list;
}


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
    rev: Number(previous.rev) || 0,
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
    /* Never stop the old process while a replacement is being handed off. */
    if (handoffInProgress) return;
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

/* The replacement answers only when its own pid is serving the new port. */
async function waitForReplacement(port, previousPid, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const status = await probeLedgerServer(port);
    if (status && Number(status.port) === Number(port) && Number(status.pid) !== Number(previousPid)) return status;
    await new Promise(function (resolve) { setTimeout(resolve, 120); });
  }
  return null;
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

  if (pathname === "/__rl/config") {
    if (request.method === "GET") {
      const config = readServerConfig();
      sendJson(response, 200, {
        ok: true,
        language: config.language === "tr" ? "tr" : "en",
        theme: config.theme === "dark" ? "dark" : "light",
        port: actualPort,
      });
      return;
    }
    if (request.method !== "POST") {
      response.writeHead(405, { allow: "GET, POST" });
      response.end("method not allowed");
      return;
    }
    readJsonBody(request, 64 * 1024).then(function (body) {
      const patch = {};
      if (body && (body.language === "tr" || body.language === "en")) patch.language = body.language;
      if (body && (body.theme === "dark" || body.theme === "light")) patch.theme = body.theme;
      if (Number.isInteger(body && body.port) && body.port >= 0 && body.port <= 65535) patch.port = body.port;
      const config = writeServerConfig(patch);
      sendJson(response, 200, { ok: true, language: config.language, theme: config.theme, port: actualPort });
    }).catch(function (error) {
      sendJson(response, 400, { ok: false, error: error.message });
    });
    return;
  }

  if (pathname === "/__rl/delete-project") {
    if (request.method !== "POST") {
      response.writeHead(405, { allow: "POST" });
      response.end("method not allowed");
      return;
    }
    readJsonBody(request, 256 * 1024).then(function (body) {
      const projectId = String(body && body.projectId || "").slice(0, 120);
      const keepBackup = body && body.backup === true;
      if (!projectId) {
        sendJson(response, 400, { ok: false, error: "projectId is required" });
        return;
      }
      const slug = findProjectSlug(projectId);
      if (!slug) {
        /* Browser-only project: nothing to remove on disk. */
        sendJson(response, 200, { ok: true, existed: false, slug: "", backup: "" });
        return;
      }
      const { folder } = projectFolder(slug);
      let backupName = "";
      if (keepBackup) {
        ensureRuntimeDirs();
        backupName = slug + "-" + fileStamp() + ".zip";
        try {
          fs.writeFileSync(path.join(deletedRoot, backupName), zipFolder(folder));
        } catch (error) {
          sendJson(response, 500, { ok: false, error: "backup failed: " + error.message });
          return;
        }
      }
      try {
        fs.rmSync(folder, { recursive: true, force: true });
      } catch (error) {
        sendJson(response, 500, { ok: false, error: "delete failed: " + error.message });
        return;
      }
      if (readActiveProjectId() === projectId) {
        try { fs.rmSync(activeProjectFile(), { force: true }); } catch (error) { /* ignore */ }
      }
      sendJson(response, 200, { ok: true, existed: true, slug: slug, backup: backupName });
    }).catch(function (error) {
      sendJson(response, 400, { ok: false, error: error.message });
    });
    return;
  }

  if (pathname === "/__rl/deleted") {
    if (request.method !== "GET") {
      response.writeHead(405, { allow: "GET" });
      response.end("method not allowed");
      return;
    }
    const list = listArchiveDir(deletedRoot, "deleted-projects").map(function (item) {
      let meta = null;
      try { meta = zipEntryJson(fs.readFileSync(item.path), "project.json"); } catch (error) { meta = null; }
      const derived = item.name.replace(/\.[zZ][iI][pP]$/, "").replace(/-\d{4}-\d{2}-\d{2}T.*$/, "");
      return {
        name: item.name,
        size: item.size,
        createdAt: item.createdAt,
        slug: meta && meta.slug ? String(meta.slug) : derived,
        projectId: meta && meta.projectId ? String(meta.projectId) : "",
        projectName: meta && meta.name ? String(meta.name) : derived,
      };
    });
    sendJson(response, 200, { ok: true, deleted: list });
    return;
  }

  if (pathname === "/__rl/deleted/restore") {
    if (request.method !== "POST") {
      response.writeHead(405, { allow: "POST" });
      response.end("method not allowed");
      return;
    }
    readJsonBody(request, 64 * 1024).then(function (body) {
      const name = safeArchiveName(body && body.name);
      if (!name) {
        sendJson(response, 400, { ok: false, error: "invalid archive name" });
        return;
      }
      const source = path.join(deletedRoot, name);
      if (!fs.existsSync(source)) {
        sendJson(response, 404, { ok: false, error: "archive not found" });
        return;
      }
      let zipBuffer = null;
      try { zipBuffer = fs.readFileSync(source); } catch (error) {
        sendJson(response, 500, { ok: false, error: "could not read the archive" });
        return;
      }
      let meta = zipEntryJson(zipBuffer, "project.json") || {};
      const wanted = meta.slug || name.replace(/\.[zZ][iI][pP]$/, "").replace(/-\d{4}-\d{2}-\d{2}T.*$/, "");
      ensureRuntimeDirs();
      const target = uniqueChildFolder(projectsRoot, wanted);
      const renamed = target.slug !== safeSlug(wanted);
      const temp = path.join(projectsRoot, ".restore-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7));
      try {
        fs.mkdirSync(temp, { recursive: true });
        zipExtractTo(zipBuffer, temp);
        const metaPath = path.join(temp, "project.json");
        const ledger = readJsonFile(path.join(temp, "ledger.json"), null);
        if (!meta.projectId) {
          meta.projectId = "prj_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
        }
        if (!meta.name) {
          meta.name = ledger && ledger.project ? String(ledger.project).slice(0, 60) : target.slug;
        }
        meta.slug = target.slug;
        meta.createdAt = meta.createdAt || new Date().toISOString();
        meta.updatedAt = new Date().toISOString();
        meta.ledgerId = meta.ledgerId || (ledger && ledger.ledgerId) || "";
        meta.requestCount = ledger && Array.isArray(ledger.requests) ? ledger.requests.length : 0;
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n", "utf8");
        fs.renameSync(temp, target.folder);
        sendJson(response, 200, { ok: true, slug: target.slug, renamed: renamed, project: meta });
      } catch (error) {
        try { fs.rmSync(temp, { recursive: true, force: true }); } catch (cleanupError) { /* ignore */ }
        sendJson(response, 500, { ok: false, error: "restore failed: " + error.message });
      }
    }).catch(function (error) {
      sendJson(response, 400, { ok: false, error: error.message });
    });
    return;
  }

  if (pathname === "/__rl/deleted/delete") {
    if (request.method !== "POST") {
      response.writeHead(405, { allow: "POST" });
      response.end("method not allowed");
      return;
    }
    readJsonBody(request, 64 * 1024).then(function (body) {
      const name = safeArchiveName(body && body.name);
      if (!name) {
        sendJson(response, 400, { ok: false, error: "invalid archive name" });
        return;
      }
      const target = path.join(deletedRoot, name);
      if (!fs.existsSync(target)) {
        sendJson(response, 404, { ok: false, error: "archive not found" });
        return;
      }
      try {
        fs.rmSync(target, { force: true });
        sendJson(response, 200, { ok: true });
      } catch (error) {
        sendJson(response, 500, { ok: false, error: error.message });
      }
    }).catch(function (error) {
      sendJson(response, 400, { ok: false, error: error.message });
    });
    return;
  }

  if (pathname === "/__rl/backups") {
    if (request.method === "GET") {
      const list = listArchiveDir(backupsRoot, "backups").map(function (item) {
        return { name: item.name, size: item.size, createdAt: item.createdAt };
      });
      sendJson(response, 200, { ok: true, backups: list });
      return;
    }
    if (request.method !== "POST") {
      response.writeHead(405, { allow: "GET, POST" });
      response.end("method not allowed");
      return;
    }
    readJsonBody(request, 512 * 1024 * 1024).then(function (body) {
      const rawName = safeArchiveName(body && body.name);
      if (!rawName) {
        sendJson(response, 400, { ok: false, error: "invalid backup name" });
        return;
      }
      const dataUrl = String(body && body.dataUrl || "");
      const match = /^data:[^;,]*;base64,(.*)$/s.exec(dataUrl);
      if (!match) {
        sendJson(response, 400, { ok: false, error: "invalid backup data" });
        return;
      }
      const bytes = Buffer.from(match[1], "base64");
      if (!bytes.length || bytes.length > 400 * 1024 * 1024) {
        sendJson(response, 413, { ok: false, error: "backup is too large" });
        return;
      }
      ensureRuntimeDirs();
      let name = rawName;
      if (fs.existsSync(path.join(backupsRoot, name))) {
        name = rawName.replace(/\.zip$/i, "") + "-" + Date.now().toString(36) + ".zip";
      }
      try {
        fs.writeFileSync(path.join(backupsRoot, name), bytes);
        const stat = fs.statSync(path.join(backupsRoot, name));
        sendJson(response, 200, {
          ok: true,
          backup: { name: name, size: stat.size, createdAt: stat.mtime.toISOString() },
        });
      } catch (error) {
        sendJson(response, 500, { ok: false, error: error.message });
      }
    }).catch(function (error) {
      sendJson(response, 400, { ok: false, error: error.message });
    });
    return;
  }

  if (pathname.indexOf("/__rl/backups/") === 0) {
    const name = safeArchiveName(pathname.slice("/__rl/backups/".length));
    if (!name) {
      response.writeHead(400);
      response.end("bad backup name");
      return;
    }
    const file = path.join(backupsRoot, name);
    if (request.method === "GET") {
      fs.readFile(file, function (error, data) {
        if (error) {
          response.writeHead(404);
          response.end("not found");
          return;
        }
        response.writeHead(200, {
          "content-type": "application/zip",
          "content-length": data.length,
          "cache-control": "no-store",
        });
        response.end(data);
      });
      return;
    }
    if (request.method === "DELETE") {
      try {
        if (fs.existsSync(file)) fs.rmSync(file, { force: true });
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

  if (pathname === "/__rl/reset") {
    if (request.method !== "POST") {
      response.writeHead(405, { allow: "POST" });
      response.end("method not allowed");
      return;
    }
    let removedProjects = 0;
    let removedDeleted = 0;
    try {
      ensureRuntimeDirs();
      for (const entry of fs.readdirSync(projectsRoot, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
        fs.rmSync(path.join(projectsRoot, entry.name), { recursive: true, force: true });
        removedProjects += 1;
      }
      for (const entry of fs.readdirSync(deletedRoot, { withFileTypes: true })) {
        if (!entry.isFile() || !/\.zip$/i.test(entry.name)) continue;
        fs.rmSync(path.join(deletedRoot, entry.name), { force: true });
        removedDeleted += 1;
      }
      try { fs.rmSync(activeProjectFile(), { force: true }); } catch (error) { /* ignore */ }
      /* backups/ is deliberately untouched. */
      sendJson(response, 200, { ok: true, removedProjects: removedProjects, removedDeleted: removedDeleted });
    } catch (error) {
      sendJson(response, 500, { ok: false, error: error.message });
    }
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
        const previousLedger = readProjectLedger(result.slug);
        const previousRev = Number(previousLedger && previousLedger.rev) || 0;
        const incomingRev = Number(snapshot.rev) || 0;
        /* A late/older save must never overwrite a newer ledger. */
        if (previousRev > 0 && incomingRev > 0 && incomingRev < previousRev) {
          sendJson(response, 200, {
            ok: true, stale: true, slug: result.slug, rev: previousRev,
            requestCount: Array.isArray(previousLedger.requests) ? previousLedger.requests.length : 0,
          });
          return;
        }
        if (previousRev > 0 && incomingRev === 0 && Array.isArray(previousLedger.requests) && previousLedger.requests.length) {
          sendJson(response, 200, { ok: true, stale: true, slug: result.slug, rev: previousRev });
          return;
        }
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
          rev: Math.max(previousRev, incomingRev),
        });
        writeProjectMeta(result.slug, meta);
        sendJson(response, 200, { ok: true, slug: result.slug, rev: meta.rev, folder: path.relative(root, result.folder).split(path.sep).join("/") });
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
    resolveRebindPort(requested).then(async function (port) {
      if (port == null) {
        sendJson(response, 409, { ok: false, error: "port is already in use" });
        return;
      }
      handoffInProgress = true;
      if (closeGraceTimer) {
        clearTimeout(closeGraceTimer);
        closeGraceTimer = null;
      }
      const child = spawnReboundServer(port);
      if (!child) {
        handoffInProgress = false;
        sendJson(response, 500, { ok: false, error: "could not start the rebound server" });
        return;
      }
      /* Do not report success (and never stop the old server) until the new
         instance answers /__rl/status with its own pid on the new port. */
      const started = await waitForReplacement(port, process.pid, 5000);
      if (!started) {
        handoffInProgress = false;
        try { child.kill(); } catch (error) { /* ignore */ }
        sendJson(response, 502, {
          ok: false,
          error: "the new server did not answer on the requested port",
          port: actualPort,
        });
        return;
      }
      /* The replacement already wrote the lock/port file on listen; writing the
         same port here keeps start.cmd consistent even if that write failed. */
      writePortFile(port);
      let hostname = "localhost";
      try {
        hostname = new URL("http://" + (request.headers.host || "localhost")).hostname;
      } catch (error) {
        hostname = "localhost";
      }
      sendJson(response, 200, {
        ok: true,
        port: port,
        pid: started.pid,
        previousPort: actualPort,
        url: "http://" + hostname + ":" + port + entryPage() + "?rl-port=" + port,
      });
      setTimeout(function () { stopServer("rebind"); }, 80);
    }).catch(function (error) {
      handoffInProgress = false;
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
    /* Server-side UI config must be available before the first paint. The
       entry page gets a tiny synchronous boot object; every other asset is
       untouched. */
    if (pathname === entryPage() && /\.html$/i.test(file)) {
      data = injectBootConfig(data);
    }
    response.writeHead(200, {
      "content-type": types[path.extname(file).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(data);
  });
});

async function startListening() {
  ensureRuntimeDirs();
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
    const config = readServerConfig();
    if (config.port !== actualPort) writeServerConfig({ port: actualPort });
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
    if (shuttingDown || handoffInProgress) return;
    /* A live page owns the server. Background throttling must not close it.
       Only a pagehide marker (or a server that never saw a page *after* the
       idle window) allows the long grace timer to fire. A fresh replacement
       must not stop itself during a port handoff before the page arrives. */
    if (livePage) return;
    const since = heartbeatSeen ? lastHeartbeat : startedAtMs;
    if (Date.now() - since >= options.autoStopMs) stopServer("idle");
  }, 1000);
  timer.unref();
}

process.on("SIGINT", function () { stopServer("signal"); });
process.on("SIGTERM", function () { stopServer("signal"); });
process.on("exit", removeLock);
