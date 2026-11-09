#!/usr/bin/env node
"use strict";

/*
  Phase 0 baseline generator.

  Runs the CURRENT extension domain core (extension/src/core.js) under Node with a
  frozen clock and UTC, and writes deterministic reference artifacts:

    tests/fixtures/ledger.reference.json   canonical serialized ledger (backup envelope v3)
    tests/golden/markdown/<lang>-<mode>.md Markdown output for 3 modes x 2 languages
    tests/golden/backup/backup.json        JSON backup output
    tests/golden/checksums.json            sha256 of every generated artifact

  These files are the regression baseline for the v2 extraction. Regenerate only when
  behaviour is intentionally changed, and review the diff.

  Usage (TZ is required for stable local-time formatting):
    PowerShell:  $env:TZ='UTC'; node scripts/generate-golden.cjs
    bash:        TZ=UTC node scripts/generate-golden.cjs
*/

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const GOLDEN = path.join(ROOT, "tests", "golden");
const FIXTURES = path.join(ROOT, "tests", "fixtures");

if ((process.env.TZ || "").toUpperCase() !== "UTC") {
  console.error("TZ must be UTC for stable output. Example: TZ=UTC node scripts/generate-golden.cjs");
  process.exit(1);
}

/* ---------- frozen clock ---------- */

const RealDate = Date;
const FIXED = RealDate.parse("2026-11-08T00:00:00.000Z");

class FixedDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(FIXED);
    else super(...args);
  }
  static now() {
    return FIXED;
  }
}
global.Date = FixedDate;

require(path.join(ROOT, "extension", "src", "core.js"));
const core = globalThis.IstekCore;

if (!core) {
  console.error("core.js did not expose window.IstekCore");
  process.exit(1);
}

/* ---------- deterministic media ---------- */

// 1x1 transparent PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const SAMPLE_HTML = Buffer.from("<!doctype html><title>sample</title><p>example attachment</p>\n", "utf8");

const media = {
  async getImageBlob() {
    return new Blob([PNG], { type: "image/png" });
  },
  async getFileBlob() {
    return new Blob([SAMPLE_HTML], { type: "text/html" });
  },
};

/* ---------- reference ledger ---------- */

const AGENTS = [
  { id: "agent_1", name: "Ada", role: "team_leader", mdPath: "agents/team-leader.md" },
  { id: "agent_2", name: "Lin", role: "frontend", mdPath: "agents/frontend.md" },
  { id: "agent_3", name: "Rex", role: "qa", mdPath: "agents/qa.md" },
];

function image(id, name, w, h) {
  return { id, name, w, h, size: 12345, type: "image/png", ext: "png" };
}

function attachment(id, name) {
  return { id, name, size: SAMPLE_HTML.length, type: "text/html", ext: "html" };
}

function request(raw, index) {
  const normalized = core.requests.normalize(raw, index);
  // normalize() forces confirmed=false for invalid data; the fixture is intentionally valid.
  normalized.confirmed = true;
  return normalized;
}

const REQUESTS = [
  request(
    {
      id: "IST-001",
      type: "feature",
      priority: "high",
      title: "Add bulk actions toolbar to the orders table",
      description:
        "Let users change status, export CSV and apply tags to the selected orders from one toolbar.\nToolbar stays visible while the table scrolls.",
      note: "Design reference: bulk actions.png",
      images: [image("img_1", "bulk-actions.png", 1200, 800), image("img_2", "bulk-actions-empty.png", 900, 600)],
      attachments: [],
      createdAt: "2026-11-06T09:15:00.000Z",
      updatedAt: "2026-11-06T09:15:00.000Z",
    },
    0
  ),
  request(
    {
      id: "IST-002",
      type: "update",
      priority: "normal",
      title: "Move the status filter into the table header",
      description: "The filter currently sits above the table and wraps on narrow screens.",
      page: "/orders",
      location: "Filter bar above the table",
      link: "https://example.com/orders",
      images: [],
      attachments: [],
      createdAt: "2026-11-06T10:20:00.000Z",
      updatedAt: "2026-11-06T10:20:00.000Z",
    },
    1
  ),
  request(
    {
      id: "IST-003",
      type: "remove",
      priority: "low",
      title: "Remove the legacy CSV import button",
      description: "Nobody uses it and it produces malformed rows.",
      page: "/orders/import",
      location: "Top right action group",
      link: "https://example.com/orders/import",
      images: [],
      attachments: [],
      createdAt: "2026-11-06T11:05:00.000Z",
      updatedAt: "2026-11-06T11:05:00.000Z",
    },
    2
  ),
  request(
    {
      id: "IST-004",
      type: "design",
      priority: "normal",
      title: "Unify empty states across the dashboard",
      description: "Empty lists use three different illustrations and two different tone of voice.",
      page: "/dashboard",
      location: "Empty state blocks",
      sampleWebsite: "https://example.com/dashboard",
      link: "https://example.com/design/empty-states",
      images: [image("img_3", "empty-state-current.png", 1440, 900)],
      attachments: [attachment("att_1", "empty-state-sample.html")],
      createdAt: "2026-11-06T12:30:00.000Z",
      updatedAt: "2026-11-06T12:30:00.000Z",
    },
    3
  ),
  request(
    {
      id: "IST-005",
      type: "question",
      priority: "normal",
      title: "Should archived orders stay searchable?",
      description: "Archived orders disappear from search results. Is that intentional?",
      page: "/orders/archived",
      location: "Search input",
      link: "https://example.com/orders/archived",
      images: [],
      attachments: [],
      createdAt: "2026-11-06T13:10:00.000Z",
      updatedAt: "2026-11-06T13:10:00.000Z",
    },
    4
  ),
  request(
    {
      id: "IST-006",
      type: "bug",
      priority: "critical",
      title: "Long user names overflow the header menu",
      description: "A 40-character name pushes the logout item outside the menu on 1280px screens.",
      page: "/dashboard",
      location: "Header > user menu",
      consoleError: "Uncaught TypeError: Cannot read properties of null (reading 'offsetWidth')",
      link: "https://example.com/dashboard",
      images: [image("img_4", "header-overflow.png", 1280, 720)],
      attachments: [],
      createdAt: "2026-11-06T14:45:00.000Z",
      updatedAt: "2026-11-06T14:45:00.000Z",
    },
    5
  ),
];

const STATE = {
  project: "Nova Dashboard",
  ledgerId: "ledger_reference_0001",
  language: "en",
  exportBehavior: "default",
  lastExport: null,
  agents: AGENTS,
  requests: REQUESTS,
  records: [],
  drafts: [],
};

/* ---------- generation ---------- */

const PLANNING = {
  zip: { mode: "full", runtime: "server", transfers: ["server"], question: true, agents: ["agent_1", "agent_2", "agent_3"] },
  embedded: { mode: "custom", test: "light", runtime: "gofile", transfers: ["gofile"], question: false, agents: ["agent_2", "agent_3"], note: "Keep the sample attachment in the ZIP output." },
  none: { mode: "light", runtime: null, transfers: [], question: false, agents: ["agent_1"] },
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

const CHECK = process.argv.includes("--check");
const outputs = [];

function emit(file, content) {
  outputs.push({ file: file, content: content });
  return file;
}

function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

async function main() {
  ensureDir(GOLDEN);
  ensureDir(FIXTURES);

  const bundle = core.backup.build(STATE);
  const fixturesFile = emit(
    path.join(FIXTURES, "ledger.reference.json"),
    JSON.stringify(
      {
        note: "Canonical reference ledger. Generated by scripts/generate-golden.cjs. Do not edit by hand.",
        schema: "backup-v3",
        state: {
          project: STATE.project,
          ledgerId: STATE.ledgerId,
          language: STATE.language,
          exportBehavior: STATE.exportBehavior,
          lastExport: STATE.lastExport,
          agents: STATE.agents,
        },
        backup: bundle.backup,
        media: {
          images: bundle.images.map(function (entry) {
            return { id: entry.img.id, file: entry.file, type: entry.img.type, bytes: PNG.length };
          }),
          attachments: bundle.attachments.map(function (entry) {
            return { id: entry.att.id, file: entry.file, type: entry.att.type, bytes: SAMPLE_HTML.length };
          }),
        },
      },
      null,
      2
    ) + "\n"
  );

  const generated = [fixturesFile];

  for (const lang of ["tr", "en"]) {
    for (const mode of ["zip", "embedded", "none"]) {
      const markdown = await core.markdown.build({
        requests: STATE.requests,
        project: STATE.project,
        lang,
        mode,
        includeSummary: mode !== "embedded",
        planning: PLANNING[mode],
        agents: AGENTS,
        archiveName: mode === "zip" ? "nova-dashboard.zip" : "",
        media,
      });
      generated.push(emit(path.join(GOLDEN, "markdown", lang + "-" + mode + ".md"), markdown));
    }
  }

  const backupJson = core.backup.buildJson(STATE);
  generated.push(emit(path.join(GOLDEN, "backup", "backup.json"), JSON.stringify(backupJson, null, 2) + "\n"));

  let failed = 0;
  const checksums = {};
  for (const entry of outputs) {
    const rel = relative(entry.file);
    checksums[rel] = crypto.createHash("sha256").update(entry.content).digest("hex");
    if (CHECK) {
      let current = null;
      try {
        current = fs.readFileSync(entry.file, "utf8");
      } catch (error) {
        current = null;
      }
      if (current !== entry.content) {
        console.error("DRIFT  " + rel);
        failed++;
      }
      continue;
    }
    ensureDir(path.dirname(entry.file));
    fs.writeFileSync(entry.file, entry.content, "utf8");
  }

  if (CHECK) {
    if (failed) {
      console.error(failed + " artifact(s) differ from the current core behaviour.");
      process.exit(1);
    }
    console.log("Golden baseline matches current core behaviour (" + outputs.length + " artifacts).");
    return;
  }

  ensureDir(GOLDEN);
  fs.writeFileSync(path.join(GOLDEN, "checksums.json"), JSON.stringify(checksums, null, 2) + "\n", "utf8");

  console.log("Generated " + outputs.length + " artifacts under tests/");
  for (const key of Object.keys(checksums)) console.log("  " + checksums[key].slice(0, 12) + "  " + key);
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});
