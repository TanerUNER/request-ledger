#!/usr/bin/env node
"use strict";

/*
  Tiny static server for local use. No dependencies.

    node scripts/serve.cjs [port]                 (default 8080)
    node scripts/serve.cjs --port 0 --open        (free port, open the browser)
    node scripts/serve.cjs --port 0 --auto-stop   (stop 15 s after the last heartbeat)

  Optional flags:
    --port <n> | --port=<n> | <n>   port to bind; 0 picks a free port
    --open                          open the default browser after listening
    --fallback-port-0               if the requested port is busy, retry on port 0
    --auto-stop[=seconds]           stop after N seconds (default 15) without a heartbeat
    --no-auto-stop                  never stop on idle
    --lock <file>                   write { pid, port, url, startedAt } while running
    --root <dir>                    directory to serve (default: repository root)

  Lifecycle protocol used by the page and start.cmd:
    GET  /__rl/status      server identity and liveness
    POST /__rl/heartbeat   resets the idle timer
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
  const options = { port: 8080, portGiven: false, open: false, autoStop: false, autoStopMs: 15000, lock: "", root: "", fallbackPortZero: false };
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

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

function writeLock() {
  if (!lockFile) return;
  const payload = {
    pid: process.pid,
    port: actualPort,
    url: baseUrl() + entryPage(),
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
  try {
    pathname = decodeURIComponent((request.url || "/").split("?")[0]);
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
      url: baseUrl() + entryPage(),
      startedAt: startedAt,
      autoStopSeconds: options.autoStop ? Math.round(options.autoStopMs / 1000) : 0,
      idleMs: Date.now() - lastHeartbeat,
    });
    return;
  }

  if (pathname === "/__rl/heartbeat") {
    if (request.method !== "POST" && request.method !== "GET") {
      response.writeHead(405, { allow: "POST, GET" });
      response.end("method not allowed");
      return;
    }
    lastHeartbeat = Date.now();
    sendJson(response, 200, { ok: true, idleMs: 0 });
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
    try {
      rawPort = new URL(request.url, "http://127.0.0.1").searchParams.get("port");
    } catch (error) {
      rawPort = null;
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

function startListening() {
  server.listen(options.port, "127.0.0.1", function () {
    actualPort = server.address().port;
    writeLock();
    writePortFile(actualPort);
    const url = baseUrl() + entryPage();
    console.log("Request Ledger: " + url);
    if (options.autoStop) {
      console.log("Request Ledger: auto-stop after " + Math.round(options.autoStopMs / 1000) + " s without a heartbeat");
    }
    if (options.open) openBrowser(url);
  });
}

server.on("error", function (error) {
  if (error.code === "EADDRINUSE" && options.fallbackPortZero && options.port !== 0) {
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
    if (Date.now() - lastHeartbeat >= options.autoStopMs) stopServer("idle");
  }, 1000);
  timer.unref();
}

process.on("SIGINT", function () { stopServer("signal"); });
process.on("SIGTERM", function () { stopServer("signal"); });
process.on("exit", removeLock);
