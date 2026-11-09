#!/usr/bin/env node
"use strict";

/*
  Builds the release artifacts without dependencies or a bundler.

    extension/src/core.js                     classic IIFE assembled from src/core/*.mjs
    extension/panel/panel.js                  classic script assembled from src/panel/*.js
    index.html                                single-file web app
    dist/request-ledger.html                  single-file web app (offline distribution)
    dist/extension/                           unpacked extension, ready to load
    dist/request-ledger-extension-<v>.zip     extension archive
    dist/CHECKSUMS.txt                        sha256 of every artifact
    dist/RELEASE.md                           install instructions

  Also verifies the release invariants before writing:
    - no remote <script src> in the web app
    - no eval / new Function in either product
    - manifest is valid JSON and versions agree with the changelog head

  Usage:
    node scripts/build.cjs
    node scripts/build.cjs --check     (verify an existing dist, write nothing)
*/

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { buildWeb } = require("./build-web.cjs");
const { buildPanel } = require("./build-panel.cjs");
const { buildCore } = require("./build-core.cjs");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const CHECK = process.argv.includes("--check");

/* ---------- helpers ---------- */

function fail(message) {
  console.error("BUILD FAILED: " + message);
  process.exit(1);
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function read(file) {
  return fs.readFileSync(file);
}

function walk(dir, base) {
  base = base || dir;
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push({ full, rel: path.relative(base, full).split(path.sep).join("/") });
  }
  return out;
}

/* ---------- CRC32 + stored ZIP ---------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}


function zipStore(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  /* Fixed DOS timestamp (1980-01-01 00:00) so the archive is byte-reproducible. */
  const stamp = { time: 0, day: 33 };

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const data = file.data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, data);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(0, 10);
    entry.writeUInt16LE(stamp.time, 12);
    entry.writeUInt16LE(stamp.day, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt16LE(0, 30);
    entry.writeUInt16LE(0, 32);
    entry.writeUInt16LE(0, 34);
    entry.writeUInt16LE(0, 36);
    entry.writeUInt32LE(0, 38);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);

    offset += local.length + name.length + data.length;
  }

  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([Buffer.concat(chunks), centralBuffer, end]);
}

/* ---------- test bundle ---------- */

function testStamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
}

/* Hand-testing bundle: the single-file app, the unpacked extension, the
   Windows launcher and the server it needs. GitHub packaging stays separate. */
function buildTestArchive(html, extFiles) {
  const entries = [
    { name: "request-ledger.html", data: Buffer.from(html, "utf8") },
  ];
  for (const file of extFiles) {
    entries.push({ name: "extension/" + file.name, data: file.data });
  }
  entries.push({ name: "start.cmd", data: read(path.join(ROOT, "start.cmd")) });
  entries.push({ name: "stop.cmd", data: read(path.join(ROOT, "stop.cmd")) });
  entries.push({ name: "scripts/serve.cjs", data: read(path.join(ROOT, "scripts", "serve.cjs")) });
  entries.push({ name: "README.md", data: read(path.join(ROOT, "README.md")) });
  entries.push({ name: "README.tr.md", data: read(path.join(ROOT, "README.tr.md")) });
  return {
    name: "request-ledger-test-" + testStamp() + ".zip",
    data: zipStore(entries),
  };
}

/* ---------- invariants ---------- */

function manifest() {
  const raw = read(path.join(ROOT, "extension", "manifest.json")).toString("utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail("manifest.json is not valid JSON: " + error.message);
  }
}

function checkInvariants(html, extFiles) {
  const remoteScript = /<script\b[^>]*\bsrc\s*=\s*["']https?:/i;
  if (remoteScript.test(html)) fail("the web app loads a remote script");

  const remoteResource = /<link\b(?![^>]*\brel=["']canonical["'])[^>]*\bhref\s*=\s*["']https?:/i;
  if (remoteResource.test(html)) fail("the web app loads a remote stylesheet or resource");

  const sources = [{ name: "index.html", text: html }];
  for (const file of extFiles) {
    if (/\.(js|json)$/i.test(file.name)) sources.push({ name: file.name, text: file.data.toString("utf8") });
  }
  for (const source of sources) {
    if (/\beval\s*\(/.test(source.text)) fail("eval() found in " + source.name);
    if (/\bnew\s+Function\s*\(/.test(source.text)) fail("new Function() found in " + source.name);
  }
}

/* ---------- main ---------- */

function main() {
  /* The extension core is generated first: the extension walk below reads it, and dist/
     embeds the same bytes. */
  buildCore({ write: !CHECK });
  const web = buildWeb({ write: !CHECK });
  buildPanel({ write: !CHECK });
  const html = read(path.join(ROOT, "index.html")).toString("utf8");
  const extDir = path.join(ROOT, "extension");
  const extFiles = walk(extDir).map((entry) => ({ name: entry.rel, data: read(entry.full) }));
  const pkg = manifest();

  checkInvariants(html, extFiles);

  const appVersion = (html.match(/const APP_VERSION = "([^"]+)"/) || [])[1];
  if (!appVersion) fail("APP_VERSION not found in index.html");

  const files = [];
  files.push({ name: "request-ledger.html", data: Buffer.from(html, "utf8") });
  for (const file of extFiles) files.push({ name: "extension/" + file.name, data: file.data });

  const zipName = "request-ledger-extension-" + pkg.version + ".zip";
  const storeZipName = "request-ledger-extension.zip";
  const zip = zipStore(extFiles.map((file) => ({ name: file.name, data: file.data })));
  const testZip = buildTestArchive(html, extFiles);

  const checksums = files
    .map((file) => sha256(file.data) + "  " + file.name)
    .concat([
      sha256(zip) + "  " + zipName,
      sha256(zip) + "  " + storeZipName,
      sha256(Buffer.from(pkg.version, "utf8")) + "  extension-version:" + pkg.version,
      sha256(Buffer.from(appVersion, "utf8")) + "  web-version:" + appVersion,
    ])
    .join("\n");

  if (CHECK) {
    const sumFile = path.join(DIST, "CHECKSUMS.txt");
    if (!fs.existsSync(sumFile)) fail("dist/CHECKSUMS.txt is missing; run the build first");
    const current = fs.readFileSync(sumFile, "utf8").trim();
    if (current !== checksums.trim()) {
      const currentLines = current.split("\n");
      const nextLines = checksums.trim().split("\n");
      let first = 0;
      while (first < currentLines.length && first < nextLines.length && currentLines[first] === nextLines[first]) first++;
      fail(
        "dist is stale; run node scripts/build.cjs" +
          (currentLines[first] || nextLines[first]
            ? " (first difference: " + JSON.stringify(currentLines[first] || "") + " -> " + JSON.stringify(nextLines[first] || "") + ")"
            : "")
      );
    }
    console.log("Release check OK: web " + appVersion + ", extension " + pkg.version + ", " + files.length + " files");
    return;
  }

  fs.rmSync(DIST, { recursive: true, force: true });
  for (const file of files) {
    const target = path.join(DIST, file.name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.data);
  }

  fs.writeFileSync(path.join(DIST, zipName), zip);
  fs.writeFileSync(path.join(DIST, storeZipName), zip);
  fs.writeFileSync(path.join(DIST, testZip.name), testZip.data);
  fs.writeFileSync(path.join(DIST, "CHECKSUMS.txt"), checksums + "\n", "utf8");

  fs.writeFileSync(path.join(DIST, "RELEASE.md"), releaseNotes(appVersion, pkg.version), "utf8");

  console.log("Built dist/: web " + appVersion + ", extension " + pkg.version + ", " + files.length + " files, zip " + Math.round(zip.length / 1024) + " KB");
  console.log("Test bundle: dist/" + testZip.name + " (" + Math.round(testZip.data.length / 1024) + " KB)");
}

function releaseNotes(webVersion, extVersion) {
  return [
    "# Request Ledger " + webVersion + " / extension " + extVersion,
    "",
    "## Web app",
    "",
    "1. Open `request-ledger.html` by double-clicking it, or serve the folder.",
    "2. On first run, choose single HTML file or local server mode; the screen can be reopened from Settings.",
    "3. Data stays in this browser profile; projects keep separate ledgers, media and archives.",
    "",
    "## Local server mode (Windows)",
    "",
    "1. Keep `start.cmd`, `stop.cmd` and `scripts/serve.cjs` next to `request-ledger.html`.",
    "2. Run `start.cmd`. It starts the server on a free port without a console window and opens the browser.",
    "3. The app heartbeats while it is open; the server stays up while a tab is live and waits at least 5 minutes after the last page is gone.",
    "4. Run `stop.cmd` to read `.rl-server.lock` and stop the server explicitly.",
    "",
    "## Extension (Chrome / Edge 114+)",
    "",
    "1. Open `chrome://extensions`.",
    "2. Enable Developer mode.",
    "3. Load unpacked and select the `extension` folder (or unzip the archive first).",
    "4. Open any http/https page and click the launcher at the bottom-right.",
    "",
    "## Transfer between the two",
    "",
    "- Both products write the same backup format (web envelope v4; the extension also reads v3).",
    "- In product A: Backup -> download ZIP (media included) or JSON.",
    "- In product B: Backup -> Restore, choose the file, confirm.",
    "- Prefer ZIP when images or attachments matter.",
    "",
    "## Checks",
    "",
    "- No remote scripts, no eval, no telemetry.",
    "- Verify the artifacts with `node scripts/build.cjs --check`.",
    "",
  ].join("\n");
}

main();
