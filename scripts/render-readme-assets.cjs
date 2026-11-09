#!/usr/bin/env node
"use strict";

/*
  Rebuilds the README screenshots and marketing images without dependencies.

  The real app screenshots come from the built `index.html` served by
  `scripts/serve.cjs`. The hero, workflow, device and Open Graph images are
  rendered from the HTML templates in `README-assets/en/`, so the same command
  reproduces every asset.

  Usage:
    node scripts/render-readme-assets.cjs
    node scripts/render-readme-assets.cjs --screens-only
    node scripts/render-readme-assets.cjs --marketing-only

  Requires Chrome or Edge. A throwaway profile and DevTools port are used.
*/

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = path.resolve(__dirname, "..");
const EN_DIR = path.join(ROOT, "README-assets", "en");
const SCREENS = path.join(EN_DIR, "screens");
const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const PROFILE = path.join(os.tmpdir(), "rl-readme-profile-" + process.pid + "-" + Date.now());
const DEBUG_PORT = 9444;

const args = process.argv.slice(2);
const screensOnly = args.includes("--screens-only");
const marketingOnly = args.includes("--marketing-only");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function chromePath() {
  for (const candidate of CHROME_CANDIDATES) if (fs.existsSync(candidate)) return candidate;
  throw new Error("Chrome or Edge was not found");
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
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
    this.ws = new WebSocket(url);
    this.ready = new Promise((resolve) => this.ws.addEventListener("open", resolve));
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const entry = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result);
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
  await cdp.send("Page.enable", {}, sessionId);
  return sessionId;
}

async function evaluate(cdp, sessionId, expression) {
  const result = await cdp.send(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true, userGesture: true },
    sessionId
  );
  if (result.exceptionDetails) {
    throw new Error(
      "evaluate failed: " + result.exceptionDetails.text + " " +
        ((result.exceptionDetails.exception || {}).description || "")
    );
  }
  return result.result.value;
}

async function waitFor(cdp, sessionId, expression, label, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < (timeoutMs || 15000)) {
    if (await evaluate(cdp, sessionId, expression)) return true;
    await sleep(250);
  }
  throw new Error("timeout: " + label);
}

async function setViewport(cdp, sessionId, width, height) {
  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { width, height, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: height },
    sessionId
  );
  await sleep(350);
}

async function screenshot(cdp, sessionId, file) {
  const shot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true }, sessionId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
  const bytes = fs.statSync(file).size;
  console.log("wrote " + path.relative(ROOT, file) + " (" + Math.round(bytes / 1024) + " KB)");
}

/* The demo ledger mirrors the shape written by the app. Media blobs are
   intentionally absent: the screenshots show the layout, not attachments. */
function demoLedger() {
  const requests = [
    {
      id: "IST-001",
      type: "feature",
      title: "Add bulk actions toolbar to the orders table",
      page: "/orders",
      location: "Table header",
      consoleError: "",
      description:
        "Let users change status, export CSV and apply tags to the selected orders from one toolbar.\nToolbar stays visible while the table scrolls.",
      priority: "high",
      link: "",
      sampleWebsite: "",
      note: "Design reference: bulk actions.png",
      images: [],
      attachments: [],
      confirmed: true,
      collapsed: false,
      createdAt: "2026-11-06T09:15:00.000Z",
      updatedAt: "2026-11-06T09:15:00.000Z",
    },
    {
      id: "IST-002",
      type: "update",
      title: "Move the status filter into the table header",
      page: "/orders",
      location: "Filter bar above the table",
      consoleError: "",
      description: "The filter currently sits above the table and wraps on narrow screens.",
      priority: "normal",
      link: "https://example.com/orders",
      sampleWebsite: "",
      note: "",
      images: [],
      attachments: [],
      confirmed: true,
      collapsed: true,
      createdAt: "2026-11-06T10:20:00.000Z",
      updatedAt: "2026-11-06T10:20:00.000Z",
    },
    {
      id: "IST-003",
      type: "remove",
      title: "Remove the legacy CSV import button",
      page: "/orders/import",
      location: "Top right action group",
      consoleError: "",
      description: "Nobody uses it and it produces malformed rows.",
      priority: "low",
      link: "https://example.com/orders/import",
      sampleWebsite: "",
      note: "",
      images: [],
      attachments: [],
      confirmed: true,
      collapsed: true,
      createdAt: "2026-11-06T11:05:00.000Z",
      updatedAt: "2026-11-06T11:05:00.000Z",
    },
    {
      id: "IST-004",
      type: "design",
      title: "Unify empty states across the dashboard",
      page: "/dashboard",
      location: "Empty state blocks",
      consoleError: "",
      description: "Empty lists use three different illustrations and two different tones of voice.",
      priority: "normal",
      link: "https://example.com/design/empty-states",
      sampleWebsite: "https://example.com/dashboard",
      note: "",
      images: [],
      attachments: [],
      confirmed: true,
      collapsed: true,
      createdAt: "2026-11-06T12:30:00.000Z",
      updatedAt: "2026-11-06T12:30:00.000Z",
    },
    {
      id: "IST-005",
      type: "question",
      title: "Should archived orders stay searchable?",
      page: "/orders/archived",
      location: "Search input",
      consoleError: "",
      description: "Archived orders disappear from search results. Is that intentional?",
      priority: "normal",
      link: "https://example.com/orders/archived",
      sampleWebsite: "",
      note: "",
      images: [],
      attachments: [],
      confirmed: true,
      collapsed: true,
      createdAt: "2026-11-06T13:10:00.000Z",
      updatedAt: "2026-11-06T13:10:00.000Z",
    },
    {
      id: "IST-006",
      type: "bug",
      title: "Long user names overflow the header menu",
      page: "/dashboard",
      location: "Header > user menu",
      consoleError: "Uncaught TypeError: Cannot read properties of null (reading 'offsetWidth')",
      description: "A 40-character name pushes the logout item outside the menu on 1280 px screens.",
      priority: "critical",
      link: "https://example.com/dashboard",
      sampleWebsite: "",
      note: "",
      images: [],
      attachments: [],
      confirmed: true,
      collapsed: true,
      createdAt: "2026-11-06T14:45:00.000Z",
      updatedAt: "2026-11-06T14:45:00.000Z",
    },
  ];

  return {
    version: 2,
    project: "Nova Dashboard",
    projectCreated: true,
    ledgerId: "ledger_readme_0001",
    requests,
    agents: [
      { id: "agent_1", name: "Ada", role: "team_leader", mdPath: "agents/team-leader.md" },
      { id: "agent_2", name: "Lin", role: "frontend", mdPath: "agents/frontend.md" },
      { id: "agent_3", name: "Rex", role: "qa", mdPath: "agents/qa.md" },
    ],
    language: "en",
    exportBehavior: "default",
    lastExport: null,
    updatedAt: "2026-11-06T15:00:00.000Z",
  };
}

function registry() {
  return {
    version: 1,
    activeId: "prj_nova",
    projects: [
      {
        id: "prj_nova",
        name: "Nova Dashboard",
        createdAt: "2026-11-04T09:00:00.000Z",
        updatedAt: "2026-11-06T15:00:00.000Z",
        exportTarget: "Nova Dashboard",
        archiveCollapsed: false,
      },
      {
        id: "prj_atlas",
        name: "Atlas Mobile",
        createdAt: "2026-11-03T09:00:00.000Z",
        updatedAt: "2026-11-05T12:00:00.000Z",
        exportTarget: "",
        archiveCollapsed: false,
      },
      {
        id: "prj_lumen",
        name: "Lumen Docs",
        createdAt: "2026-11-02T09:00:00.000Z",
        updatedAt: "2026-11-04T16:30:00.000Z",
        exportTarget: "",
        archiveCollapsed: true,
      },
    ],
  };
}

async function seed(cdp, sessionId, origin) {
  await cdp.send("Page.navigate", { url: origin + "/index.html" }, sessionId);
  await waitFor(cdp, sessionId, "document.readyState === 'complete'", "seed page", 15000);
  await sleep(250);
  const payload = {
    registry: registry(),
    ledger: demoLedger(),
  };
  await evaluate(
    cdp,
    sessionId,
    `(() => {
      const payload = ${JSON.stringify(payload)};
      localStorage.setItem("rl-onboarding-v1", "1");
      localStorage.setItem("rl-mode-v1", "server");
      localStorage.setItem("rl-extension-companion-v1", "1");
      localStorage.setItem("rl-port", "8080");
      localStorage.setItem("oz-veri-kapsam-v1", "1");
      localStorage.setItem("gd-theme", "light");
      localStorage.setItem("oz-projeler-v1", JSON.stringify(payload.registry));
      localStorage.setItem("oz-istek-defteri-p-prj_nova", JSON.stringify(payload.ledger));
      localStorage.setItem("oz-istek-defteri-p-prj_atlas", JSON.stringify({ ...payload.ledger, project: "Atlas Mobile", requests: [], agents: [] }));
      localStorage.setItem("oz-istek-defteri-p-prj_lumen", JSON.stringify({ ...payload.ledger, project: "Lumen Docs", requests: [], agents: [] }));
      return true;
    })()`
  );
}

async function openProject(cdp, sessionId, origin) {
  await cdp.send("Page.navigate", { url: origin + "/index.html" }, sessionId);
  await waitFor(cdp, sessionId, "document.readyState === 'complete'", "app load", 15000);
  await waitFor(cdp, sessionId, "!!document.querySelector('#projectPicker .backupopt')", "project picker", 15000);
  await evaluate(cdp, sessionId, "document.querySelector('#projectPicker .backupopt').click(); true");
  await waitFor(
    cdp,
    sessionId,
    "document.querySelector('#pageTitle') && document.querySelector('#pageTitle').textContent.trim().length > 0",
    "project open",
    15000
  );
  await waitFor(cdp, sessionId, "document.querySelectorAll('#reqList .req').length > 0", "request list", 15000);
  await sleep(700);
}

async function captureScreens(cdp, sessionId, origin) {
  await seed(cdp, sessionId, origin);
  await openProject(cdp, sessionId, origin);

  await setViewport(cdp, sessionId, 1440, 900);
  await screenshot(cdp, sessionId, path.join(SCREENS, "01-dashboard-desktop.png"));

  await setViewport(cdp, sessionId, 1280, 820);
  await screenshot(cdp, sessionId, path.join(SCREENS, "02-dashboard-laptop.png"));

  await setViewport(cdp, sessionId, 1024, 768);
  await screenshot(cdp, sessionId, path.join(SCREENS, "03-dashboard-tablet.png"));

  await setViewport(cdp, sessionId, 1280, 820);
  await evaluate(cdp, sessionId, "document.querySelector('#exportBtn').click(); true");
  await waitFor(cdp, sessionId, "document.querySelector('#exportModal').classList.contains('is-open')", "export modal", 10000);
  await sleep(400);
  await evaluate(
    cdp,
    sessionId,
    `(() => {
      const next = document.querySelector('#exportDownloadBtn');
      if (next) next.click();
      const pick = (selector) => { const el = document.querySelector(selector); if (el) el.click(); };
      pick('[data-plan-mode="custom"]');
      pick('[data-plan-test="full"]');
      pick('[data-plan-mode="full"]');
      pick('[data-plan-question="yes"]');
      pick('[data-plan-runtime="yes"]');
      pick('[data-plan-transfer="server"]');
      const agent = document.querySelector('#planAgents .planopt');
      if (agent) agent.click();
      return true;
    })()`
  );
  await waitFor(cdp, sessionId, "document.querySelector('#exportStep2') && document.querySelector('#exportStep2').offsetParent !== null", "planning step", 10000);
  await sleep(700);
  await screenshot(cdp, sessionId, path.join(SCREENS, "04-export-planning.png"));
  await evaluate(cdp, sessionId, "document.querySelector('#exportCancelBtn').click(); true");
  await sleep(400);

  await setViewport(cdp, sessionId, 1440, 900);
  await evaluate(cdp, sessionId, "document.querySelector('#settingsBtn').click(); true");
  await waitFor(cdp, sessionId, "document.querySelector('#settingsModal').classList.contains('is-open')", "settings modal", 10000);
  await sleep(400);
  await screenshot(cdp, sessionId, path.join(SCREENS, "05-settings-system.png"));
  await evaluate(cdp, sessionId, "document.querySelector('#settingsModal [data-close-modal]').click(); true");
  await sleep(400);

  await setViewport(cdp, sessionId, 1440, 900);
  await evaluate(cdp, sessionId, "document.querySelector('#themeBtn').click(); true");
  await sleep(3500);
  await screenshot(cdp, sessionId, path.join(SCREENS, "06-dashboard-dark.png"));
  await evaluate(cdp, sessionId, "document.querySelector('#themeBtn').click(); true");
  await sleep(300);

  await evaluate(cdp, sessionId, "localStorage.removeItem('rl-onboarding-v1'); true");
  await cdp.send("Page.reload", {}, sessionId);
  await sleep(800);
  await waitFor(cdp, sessionId, "document.readyState === 'complete'", "onboarding reload", 15000);
  await waitFor(cdp, sessionId, "!!document.querySelector('#onboardingModal') && document.querySelector('#onboardingModal').classList.contains('is-open')", "onboarding modal", 15000);
  await sleep(9000);
  await screenshot(cdp, sessionId, path.join(SCREENS, "07-onboarding.png"));
}

async function renderHtml(cdp, sessionId, file, width, height, output) {
  await setViewport(cdp, sessionId, width, height);
  await cdp.send("Page.navigate", { url: pathToFileURL(file).href }, sessionId);
  await waitFor(cdp, sessionId, "document.readyState === 'complete'", "html template", 10000);
  await waitFor(
    cdp,
    sessionId,
    "Array.from(document.images).every((img) => img.complete && img.naturalWidth > 0)",
    "template images",
    15000
  );
  await sleep(350);
  await screenshot(cdp, sessionId, output);
}

async function captureMarketing(cdp, sessionId) {
  await renderHtml(cdp, sessionId, path.join(EN_DIR, "hero.html"), 1440, 760, path.join(EN_DIR, "hero.png"));
  await renderHtml(cdp, sessionId, path.join(EN_DIR, "workflow.html"), 1440, 340, path.join(EN_DIR, "workflow.png"));
  await renderHtml(
    cdp,
    sessionId,
    path.join(EN_DIR, "devices.html"),
    1440,
    560,
    path.join(EN_DIR, "responsive-devices.png")
  );
  await renderHtml(cdp, sessionId, path.join(EN_DIR, "og.html"), 1200, 630, path.join(ROOT, "og-image.png"));
}

async function main() {
  const chrome = chromePath();
  const serverPort = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT, "scripts", "serve.cjs"), String(serverPort), "--no-auto-stop"], {
    cwd: ROOT,
    stdio: "ignore",
    windowsHide: true,
  });
  const serverReady = Date.now();
  while (Date.now() - serverReady < 15000) {
    try {
      const response = await fetch("http://127.0.0.1:" + serverPort + "/__rl/status");
      if (response.ok) break;
    } catch (error) {
      /* not ready */
    }
    await sleep(200);
  }

  const browser = spawn(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--allow-file-access-from-files",
      "--user-data-dir=" + PROFILE,
      "--remote-debugging-port=" + DEBUG_PORT,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-search-engine-choice-screen",
      "--window-size=1440,1000",
      "about:blank",
    ],
    { stdio: "ignore", windowsHide: true }
  );

  try {
    const version = await waitEndpoint(DEBUG_PORT, 20000);
    const cdp = new CDP(version.webSocketDebuggerUrl);
    const target = await cdp.send("Target.createTarget", { url: "about:blank" });
    const sessionId = await attach(cdp, target.targetId);

    if (!marketingOnly) await captureScreens(cdp, sessionId, "http://localhost:" + serverPort);
    if (!screensOnly) await captureMarketing(cdp, sessionId);
  } finally {
    browser.kill();
    server.kill();
    try {
      fs.rmSync(PROFILE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (error) {
      /* Chrome can hold the profile for a moment; the temp folder is disposable. */
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
