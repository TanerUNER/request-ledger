/*
  Phase 1 contract test: the generated classic core (extension/src/core.js).

  The core is no longer hand-written; scripts/build-core.cjs assembles it from
  src/core/*.mjs. The legacy monolith that used to be the reference is gone, so its
  behaviour is frozen in two places:

    - tests/golden/*   artifacts generated from the legacy core before the split
                       (Markdown for 3 modes x 2 languages, JSON backup envelope v3)
    - tests/fixtures/ledger.reference.json   canonical ledger used to generate them

  This test loads the generated file exactly the way the panel does (a classic script,
  `window.IstekCore`) and fails on any behavioural difference: the full public surface,
  every dictionary entry in both languages, all six Markdown outputs, ZIP round-trip and
  stored-entry rejection, and backup build/parse/apply with its caps and version rules.

  No framework, no dependencies. Run with:
    node tests/parity/core.parity.mjs

  Markdown and backup timestamps are local-time formatted, so the test re-executes itself
  once with TZ=UTC when the timezone differs.
*/

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "..", "..");
const CORE = path.join(ROOT, "extension", "src", "core.js");
const GOLDEN = path.join(ROOT, "tests", "golden");
const FIXTURE = path.join(ROOT, "tests", "fixtures", "ledger.reference.json");

/* The goldens were generated with TZ=UTC. Re-run in a child instead of demanding a
   manual environment variable, so the plain `node tests/parity/core.parity.mjs` works. */
if ((process.env.TZ || "").toUpperCase() !== "UTC") {
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    stdio: "inherit",
    env: Object.assign({}, process.env, { TZ: "UTC" }),
  });
  process.exit(child.status == null ? 1 : child.status);
}

let checks = 0;
const failures = [];

function json(value) {
  return value === undefined ? "<undefined>" : JSON.stringify(value);
}

function equal(label, actual, expected) {
  checks++;
  if (json(actual) !== json(expected)) failures.push({ label, actual, expected });
}

function ok(label, condition, actual) {
  checks++;
  if (!condition) failures.push({ label, actual: actual === undefined ? false : actual, expected: "truthy" });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function rejects(label, action) {
  checks++;
  try {
    await action();
    failures.push({ label, actual: "resolved", expected: "rejected" });
  } catch (error) {
    return error && error.message;
  }
  return null;
}

/* ============================================================
   1. Classic-script load
   ============================================================ */

const source = fs.readFileSync(CORE, "utf8");

/* A generated module bundle must not leak ESM syntax: the extension has no module loader. */
ok("core has no import/export statements", !/^\s*(?:import|export)\b/m.test(source));

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "extension/src/core.js" });
ok("core runs as a classic script", Boolean(sandbox.IstekCore));
ok("core attaches window.IstekCore", sandbox.window && sandbox.window.IstekCore === sandbox.IstekCore);
ok("core attaches globalThis.IstekCore", sandbox.IstekCore !== undefined);

/* ============================================================
   2. Behavioural load with a frozen clock
   ============================================================ */

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

const require = createRequire(import.meta.url);
require(CORE);
const core = globalThis.IstekCore;
if (!core) {
  console.error("core.js did not expose IstekCore");
  process.exit(1);
}

/* ============================================================
   3. Public surface (exact API of the legacy file)
   ============================================================ */

const SURFACE = {
  constants: [
    "TYPES",
    "PRIORITIES",
    "AGENT_ROLES",
    "PLANNING_TESTS",
    "PLANNING_FULL_TEXT",
    "PLANNING_LIGHT_TEXT",
    "PLANNING_FULL_TEXT_EN",
    "PLANNING_LIGHT_TEXT_EN",
    "TYPE_TEMPLATES",
    "TRANSLATIONS_EN",
    "CHANGELOG",
    "LIMITS",
    "DB",
  ],
  util: [
    "nowISO",
    "pad2",
    "formatYMD",
    "formatStamp",
    "formatTime",
    "formatClock",
    "formatDateTime",
    "mdCell",
    "mdLine",
    "utf8Bytes",
    "extFromMime",
    "extFromFileName",
    "safeFileBase",
    "formatBytes",
    "imageFileName",
    "attachmentFileName",
    "backupMediaFileName",
    "normalizeDisplayPath",
    "newLedgerId",
  ],
  i18n: ["setLanguage", "getLanguage", "translate", "countLabel", "formatDateLong", "trLower"],
  requests: [
    "newId",
    "create",
    "normalize",
    "serialize",
    "validate",
    "missing",
    "status",
    "find",
    "incomplete",
    "signature",
    "duplicate",
    "update",
    "remove",
    "move",
  ],
  storage: [
    "init",
    "close",
    "loadState",
    "saveState",
    "loadTheme",
    "saveTheme",
    "getSetting",
    "putSetting",
    "deleteSetting",
    "putImage",
    "getImage",
    "deleteImage",
    "putFile",
    "getFile",
    "deleteFile",
    "clearAllMedia",
    "listCollection",
    "putCollection",
    "deleteCollection",
    "clearCollection",
    "addHistory",
    "listHistory",
    "clearHistory",
  ],
  media: ["compress", "getImageBlob", "getFileBlob"],
  markdown: ["build"],
  zip: ["create", "parse"],
  backup: ["build", "buildJson", "buildZip", "parse", "apply"],
};

equal("surface groups", Object.keys(core).sort(), Object.keys(SURFACE).sort());
for (const group of Object.keys(SURFACE)) {
  equal("surface." + group, Object.keys(core[group] || {}).sort(), SURFACE[group].slice().sort());
  for (const name of SURFACE[group]) {
    const value = core[group][name];
    ok("surface has " + group + "." + name, value !== undefined, typeof value);
    if (group !== "constants") ok("surface function " + group + "." + name, typeof value === "function", typeof value);
  }
}

/* ============================================================
   4. i18n — every dictionary key in both languages
   ============================================================ */

const DICTIONARY_SHA256 = "33e0081cc97ca43559aadfb8d8133e14d93cfddd29628ea59c5a296717e1ab61";
const dictionary = core.constants.TRANSLATIONS_EN;

equal("dictionary size", Object.keys(dictionary).length, 420);
equal("dictionary digest", crypto.createHash("sha256").update(JSON.stringify(dictionary)).digest("hex"), DICTIONARY_SHA256);

for (const key of Object.keys(dictionary)) {
  equal("translate en: " + key, core.i18n.translate(key, "en"), dictionary[key]);
  equal("translate tr: " + key, core.i18n.translate(key, "tr"), key);
}

equal("translate keeps surrounding space", core.i18n.translate("  Ayarlar  ", "en"), "  Settings  ");
equal("translate unknown text", core.i18n.translate("Bilinmeyen metin", "en"), "Bilinmeyen metin");
equal("translate pattern counts", core.i18n.translate("3 talep · Hata", "en"), "3 requests · Bug");
equal("translate pattern ready", core.i18n.translate("3 / 5 hazır", "en"), "3 / 5 ready");
equal("translate pattern missing", core.i18n.translate("2 eksik", "en"), "2 missing");
equal("translate pattern status", core.i18n.translate("Durum: Hazır", "en"), "Status: Ready");

equal("default language", core.i18n.getLanguage(), "en");
equal("setLanguage tr", core.i18n.setLanguage("tr"), "tr");
equal("translate uses current language", core.i18n.translate("Ayarlar"), "Ayarlar");
equal("setLanguage falls back to en", core.i18n.setLanguage("de"), "en");
equal("translate after fallback", core.i18n.translate("Ayarlar"), "Settings");

equal("countLabel one", core.i18n.countLabel(1, "en", { one: "request", many: "requests" }), "1 request");
equal("countLabel many", core.i18n.countLabel(2, "en", { one: "request", many: "requests" }), "2 requests");
equal("countLabel default many", core.i18n.countLabel(5, "en", { one: "item" }), "5 item");

const longDate = new RealDate("2026-11-08T13:05:09.000Z");
for (const [lang, code] of [["en", "en-US"], ["tr", "tr-TR"]]) {
  const expected = new Intl.DateTimeFormat(code, { day: "2-digit", month: "long", year: "numeric", weekday: "long" }).format(longDate);
  equal("formatDateLong " + lang, core.i18n.formatDateLong(longDate, lang), expected);
}
equal("formatDateLong invalid", core.i18n.formatDateLong("not a date", "en"), "");
equal("trLower", core.i18n.trLower("ISTANBUL"), "ıstanbul");

/* ============================================================
   5. Markdown — the six fixture combinations from tests/golden
   ============================================================ */

const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));

const STATE = Object.assign({}, fixture.state, {
  requests: fixture.backup.requests.map((raw, index) => {
    const request = core.requests.normalize(clone(raw), index);
    request.confirmed = true;
    return request;
  }),
  records: [],
  drafts: [],
});

/* Same deterministic media the goldens were generated with. */
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

const PLANNING = {
  zip: { mode: "full", runtime: "server", transfers: ["server"], question: true, agents: ["agent_1", "agent_2", "agent_3"] },
  embedded: { mode: "custom", test: "light", runtime: "gofile", transfers: ["gofile"], question: false, agents: ["agent_2", "agent_3"], note: "Keep the sample attachment in the ZIP output." },
  none: { mode: "light", runtime: null, transfers: [], question: false, agents: ["agent_1"] },
};

for (const lang of ["tr", "en"]) {
  for (const mode of ["zip", "embedded", "none"]) {
    const markdown = await core.markdown.build({
      requests: STATE.requests,
      project: STATE.project,
      lang,
      mode,
      includeSummary: mode !== "embedded",
      planning: PLANNING[mode],
      agents: fixture.state.agents,
      archiveName: mode === "zip" ? "nova-dashboard.zip" : "",
      media,
    });
    equal("markdown " + lang + "-" + mode, markdown, fs.readFileSync(path.join(GOLDEN, "markdown", lang + "-" + mode + ".md"), "utf8"));
  }
}

/* ============================================================
   6. ZIP — stored round-trip and stored-entry rejection
   ============================================================ */

const ZIP_FILES = [
  { name: "yedek.json", data: core.util.utf8Bytes('{"app":"istek-defteri"}') },
  { name: "gorseller/img_1.png", data: new Uint8Array(PNG) },
];
const zipBlob = core.zip.create(ZIP_FILES);
equal("zip mime type", zipBlob.type, "application/zip");

const zipBytes = new Uint8Array(await zipBlob.arrayBuffer());
const zipFromBlob = await core.zip.parse(zipBlob);
const zipFromBytes = await core.zip.parse(zipBytes);
equal("zip entry names", Object.keys(zipFromBlob).sort(), ["gorseller/img_1.png", "yedek.json"]);
equal("zip text round-trip", new TextDecoder("utf-8").decode(zipFromBlob["yedek.json"]), '{"app":"istek-defteri"}');
equal("zip binary round-trip", Array.from(zipFromBlob["gorseller/img_1.png"]), Array.from(PNG));
equal("zip parse accepts bytes", Array.from(zipFromBytes["yedek.json"]), Array.from(zipFromBlob["yedek.json"]));

/* Flip the compression method in the central directory to deflate (8). */
const deflated = zipBytes.slice();
let patched = false;
for (let i = 0; i + 3 < deflated.length; i++) {
  if (deflated[i] === 0x50 && deflated[i + 1] === 0x4b && deflated[i + 2] === 0x01 && deflated[i + 3] === 0x02) {
    deflated[i + 10] = 8;
    patched = true;
    break;
  }
}
ok("zip test fixture patched", patched);
const deflateMessage = await rejects("zip rejects compressed entries", () => core.zip.parse(deflated));
equal("zip deflate message", deflateMessage, "Yalnızca sıkıştırılmamış ZIP dosyaları desteklenir.");

/* ============================================================
   7. Backup — JSON contract, parse, apply, caps, version
   ============================================================ */

equal(
  "backup.buildJson matches golden",
  JSON.stringify(core.backup.buildJson(STATE), null, 2) + "\n",
  fs.readFileSync(path.join(GOLDEN, "backup", "backup.json"), "utf8")
);

const reference = clone(fixture.backup);
const parsedReference = await core.backup.parse(core.util.utf8Bytes(JSON.stringify(reference)));
equal("backup.parse keeps the envelope", parsedReference.data, reference);
equal("backup.parse has no zip entries for JSON", parsedReference.entries, null);

/* applyBackup from JSON (no media bytes in the bundle). */
function recorder() {
  const images = [];
  const files = [];
  return {
    images,
    files,
    adapter: {
      async putImage(record) {
        images.push({ id: record.id, size: record.blob.size, type: record.type });
      },
      async putFile(record) {
        files.push({ id: record.id, size: record.blob.size, type: record.type });
      },
    },
  };
}

const jsonRecorder = recorder();
const appliedJson = await core.backup.apply(parsedReference.data, parsedReference.entries, { media: jsonRecorder.adapter });
equal("apply result request count", appliedJson.requests.length, 6);
equal("apply result project", appliedJson.project, "Nova Dashboard");
equal("apply result ledgerId", appliedJson.ledgerId, "ledger_reference_0001");
equal("apply result language", appliedJson.language, "en");
equal("apply result exportBehavior", appliedJson.exportBehavior, "default");
equal("apply result lastExport", appliedJson.lastExport, null);
equal("apply result agents", appliedJson.agents.map((agent) => agent.id), ["agent_1", "agent_2", "agent_3"]);
equal("apply result stats", appliedJson.stats, { missingImages: 4, missingFiles: 1, restoredImages: 0, restoredFiles: 0 });
equal("apply result media writes", { images: jsonRecorder.images, files: jsonRecorder.files }, { images: [], files: [] });
equal("apply result request ids", appliedJson.requests.map((request) => request.id), fixture.backup.requests.map((request) => request.id));
equal("apply clears media references", appliedJson.requests[3].attachments[0].file, "");
equal("apply clears image references", appliedJson.requests[0].images[0].file, "");
equal("apply keeps confirmed", appliedJson.requests.every((request) => request.confirmed), true);

/* applyBackup from the ZIP produced by buildZip (media bytes present). */
const backupZip = await core.backup.buildZip(STATE, media);
const parsedZip = await core.backup.parse(new Uint8Array(await backupZip.arrayBuffer()));
equal("backup zip entry names", Object.keys(parsedZip.entries).sort(), [
  "dosyalar/att_1-empty-state-sample.html",
  "gorseller/img_1.png",
  "gorseller/img_2.png",
  "gorseller/img_3.png",
  "gorseller/img_4.png",
  "yedek.json",
]);
const zipRecorder = recorder();
const appliedZip = await core.backup.apply(parsedZip.data, parsedZip.entries, { media: zipRecorder.adapter });
equal("apply zip stats", appliedZip.stats, { missingImages: 0, missingFiles: 0, restoredImages: 4, restoredFiles: 1 });
equal("apply zip image writes", zipRecorder.images.map((image) => image.type), ["image/png", "image/png", "image/png", "image/png"]);
equal("apply zip file writes", zipRecorder.files, [{ id: "att_1", size: SAMPLE_HTML.length, type: "text/html" }]);

/* Parse limits: unchanged messages and unchanged thresholds. */
const LIMIT_CASES = [
  { label: "newer schema", patch: { version: 4 }, message: "Yedek daha yeni bir sürümle oluşturulmuş." },
  { label: "foreign app", patch: { app: "other" }, message: "Bu dosya bir Request Ledger yedeği değil." },
  { label: "too many requests", patch: { requests: new Array(5001).fill({}) }, message: "Yedekte çok fazla talep var." },
  { label: "too many records", patch: { requests: [], records: new Array(2001).fill({}) }, message: "Yedekte çok fazla kayıt var." },
  { label: "too many drafts", patch: { requests: [], drafts: new Array(2001).fill({}) }, message: "Yedekte çok fazla taslak var." },
  { label: "too many agents", patch: { requests: [], agents: new Array(201).fill({}) }, message: "Yedekte çok fazla ajan var." },
  { label: "missing requests", patch: { requests: null }, message: 'Geçersiz yedek dosyası: "requests" dizisi bulunamadı.' },
];
for (const testCase of LIMIT_CASES) {
  const bytes = core.util.utf8Bytes(JSON.stringify(Object.assign({ app: "istek-defteri", version: 3, requests: [] }, testCase.patch)));
  equal("backup rejects " + testCase.label, await rejects("backup rejects " + testCase.label, () => core.backup.parse(bytes)), testCase.message);
}
equal("backup rejects empty input", await rejects("backup rejects empty input", () => core.backup.parse(null)), "Yedek dosyası yok.");

const foreign = await rejects("applyBackup rejects foreign data", () => core.backup.apply({ version: 3 }, null, {}));
equal("applyBackup rejects foreign data message", foreign, 'Geçersiz yedek dosyası: "requests" dizisi bulunamadı.');

/* ============================================================
   8. Storage — localStorage state and theme round-trip
   ============================================================ */

const store = new Map();
globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  setItem(key, value) {
    store.set(key, String(value));
  },
  removeItem(key) {
    store.delete(key);
  },
};

equal("loadState on empty storage", core.storage.loadState(), null);
equal("loadTheme on empty storage", core.storage.loadTheme(), null);

const stateToSave = {
  project: "Nova Dashboard",
  ledgerId: "ledger_parity_0001",
  requests: STRUCTURED_REQUESTS(),
  agents: fixture.state.agents.map(clone),
  language: "en",
  exportBehavior: "last",
  lastExport: { at: "2026-11-07T10:00:00.000Z", name: "x.md" },
};

function STRUCTURED_REQUESTS() {
  const first = core.requests.normalize(clone(fixture.backup.requests[0]), 0);
  const second = core.requests.normalize(clone(fixture.backup.requests[1]), 1);
  first.confirmed = true;
  second.confirmed = true;
  first.collapsed = false;
  second.collapsed = false;
  return [first, second];
}

equal("saveState writes", core.storage.saveState(stateToSave), true);
const savedRaw = JSON.parse(store.get("oz-istek-defteri-v1"));
equal("saveState payload version", savedRaw.version, 2);
equal("saveState payload requests", savedRaw.requests.length, 2);
equal("saveState payload agents", savedRaw.agents.length, 3);

const loaded = core.storage.loadState();
equal("loadState version", loaded.version, 1);
equal("loadState project", loaded.project, "Nova Dashboard");
equal("loadState ledgerId", loaded.ledgerId, "ledger_parity_0001");
equal("loadState language", loaded.language, "en");
equal("loadState exportBehavior", loaded.exportBehavior, "last");
equal("loadState request count", loaded.requests.length, 2);
equal("loadState keeps only one row open", loaded.requests.map((request) => request.collapsed), [false, true]);

equal("saveTheme dark", core.storage.saveTheme("dark"), true);
equal("loadTheme dark", core.storage.loadTheme(), "dark");
equal("saveTheme normalises", core.storage.saveTheme("weird"), true);
equal("loadTheme normalised", core.storage.loadTheme(), "light");

delete globalThis.localStorage;

/* ============================================================
   9. Module surface — src/core/index.mjs stays importable
   ============================================================ */

/* The modules are the source; the build must expose what they export. A duplicate or
   missing export in index.mjs fails this dynamic import. */
const modules = await import("../../src/core/index.mjs");
for (const name of [
  "CHANGELOG",
  "TRANSLATIONS_EN",
  "translate",
  "countLabel",
  "formatDateLong",
  "trLower",
  "currentLanguage",
  "normalizeRequest",
  "serializeRequest",
  "loadState",
  "saveState",
  "compressImage",
  "getImageBlob",
  "buildMarkdown",
  "createZip",
  "parseZip",
  "buildBackup",
  "buildBackupJson",
  "buildBackupZip",
  "parseBackup",
  "applyBackup",
  "formatBytes",
]) {
  ok("module export " + name, modules[name] !== undefined, typeof modules[name]);
}
equal("module dictionary digest", crypto.createHash("sha256").update(JSON.stringify(modules.TRANSLATIONS_EN)).digest("hex"), DICTIONARY_SHA256);

/* Every public constant is a module export with the same value. */
for (const name of SURFACE.constants) {
  equal("module constant " + name, modules[name], core.constants[name]);
}

/* Every public function is one of the module functions, verbatim. The build only strips
   module syntax, so Function#toString() must match the module source exactly; this fails
   if a public function is defined in the build script instead of a module. */
const moduleSources = new Map();
for (const [name, value] of Object.entries(modules)) {
  if (typeof value === "function") moduleSources.set(value.toString(), name);
}
for (const group of Object.keys(SURFACE)) {
  if (group === "constants") continue;
  for (const key of SURFACE[group]) {
    const fn = core[group][key];
    ok("module source for " + group + "." + key, moduleSources.has(fn.toString()), typeof fn);
  }
}

/* ============================================================
   Report
   ============================================================ */

if (failures.length) {
  console.error("CORE PARITY FAILED: " + failures.length + " of " + checks + " checks");
  for (const failure of failures.slice(0, 10)) {
    console.error("- " + failure.label);
    console.error("  actual:   " + json(failure.actual).slice(0, 400));
    console.error("  expected: " + json(failure.expected).slice(0, 400));
  }
  process.exit(1);
}

console.log("Core parity OK: " + checks + " checks against the built classic core (TZ=UTC)");
