/*
  Phase 1 parity test: new core modules vs the legacy extension/src/core.js.

  No test framework, no dependencies. Run with:
    node tests/parity/model.parity.mjs

  The point is to prove that the extraction did not change behaviour. When the legacy
  file is finally removed (Phase 2), this test becomes the contract test for the model.
*/

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as model from "../../src/core/model.mjs";
import * as constants from "../../src/core/constants.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/* Frozen clock so nowISO() is comparable. */
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

require(path.join(here, "..", "..", "extension", "src", "core.js"));
const legacy = globalThis.IstekCore;

if (!legacy) {
  console.error("legacy core did not load");
  process.exit(1);
}

let checks = 0;
const failures = [];

function json(value) {
  return JSON.stringify(value);
}

function equal(label, actual, expected) {
  checks++;
  if (json(actual) !== json(expected)) {
    failures.push({ label, actual, expected });
  }
}

function ok(label, condition, detail) {
  checks++;
  if (!condition) failures.push({ label, actual: detail === undefined ? null : detail, expected: "truthy" });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/* ---------- constants ---------- */

for (const key of ["DB", "LIMITS", "TYPES", "PRIORITIES", "AGENT_ROLES", "PLANNING_TESTS", "TYPE_TEMPLATES"]) {
  equal("constants." + key, constants[key], legacy.constants[key]);
}
equal("constants.PLANNING_FULL_TEXT", constants.PLANNING_FULL_TEXT, legacy.constants.PLANNING_FULL_TEXT);
equal("constants.PLANNING_LIGHT_TEXT", constants.PLANNING_LIGHT_TEXT, legacy.constants.PLANNING_LIGHT_TEXT);
equal("constants.PLANNING_FULL_TEXT_EN", constants.PLANNING_FULL_TEXT_EN, legacy.constants.PLANNING_FULL_TEXT_EN);
equal("constants.PLANNING_LIGHT_TEXT_EN", constants.PLANNING_LIGHT_TEXT_EN, legacy.constants.PLANNING_LIGHT_TEXT_EN);

/* ---------- inputs ---------- */

const VALID = {
  id: "IST-007",
  type: "bug",
  priority: "high",
  title: "Crash on save",
  description: "Saving an empty note crashes.",
  page: "/notes",
  location: "Save button",
  consoleError: "TypeError: x is undefined",
  link: "https://example.com/notes",
  sampleWebsite: "",
  note: "Reproduced twice",
  images: [{ id: "img_a", name: "shot.png", w: 100, h: 50, size: 10, type: "image/png", ext: "png" }],
  attachments: [{ id: "att_a", name: "log.txt", size: 20, type: "text/plain", ext: "txt" }],
  confirmed: true,
  collapsed: false,
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-02T10:00:00.000Z",
};

const CASES = [
  VALID,
  { ...VALID, title: "   " },
  { ...VALID, description: "" },
  { ...VALID, type: "unknown" },
  { ...VALID, priority: "urgent" },
  { id: "bad id with spaces", type: "design", title: "T", description: "D" },
  { id: "", type: "feature", title: "T", description: "D", images: "nope", attachments: null },
  { id: "IST-0010", title: "", description: "", priority: "low" },
  { id: "custom_id", type: "update", title: "T", description: "D", confirmed: true },
  { id: "IST-999", type: "question", title: "T", description: "D", collapsed: false },
];

/* ---------- readiness / identity ---------- */

CASES.forEach((raw, index) => {
  equal("validate[" + index + "]", model.isAutoValid(raw), legacy.requests.validate(raw));
  equal("missing[" + index + "]", model.missingFields(raw), legacy.requests.missing(raw));
  equal("status[" + index + "]", model.requestStatus(raw), legacy.requests.status(raw));
});

equal("validate.null", model.isAutoValid(null), legacy.requests.validate(null));
equal("status.null", model.requestStatus(null), legacy.requests.status(null));

const LISTS = [
  [],
  [{ id: "IST-001" }, { id: "IST-007" }, { id: "nope" }, null],
  [{ id: "IST-100" }, { id: "IST-099" }],
  [{ id: "custom" }],
];
LISTS.forEach((list, index) => {
  equal("nextId[" + index + "]", model.nextId(list), legacy.requests.newId(list));
  equal("create[" + index + "]", model.makeNewRequest(list, index === 0 ? "bug" : "nope"), legacy.requests.create(list, index === 0 ? "bug" : "nope"));
});

equal("nextId.undefined", model.nextId(undefined), legacy.requests.newId(undefined));

/* ---------- normalisation ---------- */

CASES.forEach((raw, index) => {
  equal("normalize[" + index + "]", model.normalizeRequest(clone(raw), index), legacy.requests.normalize(clone(raw), index));
});
equal("normalize.undefined", model.normalizeRequest(undefined, 0), legacy.requests.normalize(undefined, 0));

/* ---------- serialisation ---------- */

const normalized = model.normalizeRequest(clone(VALID), 0);
const legacyNormalized = legacy.requests.normalize(clone(VALID), 0);

equal("serialize.plain", model.serializeRequest(normalized), legacy.requests.serialize(legacyNormalized));
equal(
  "serialize.mapped",
  model.serializeRequest(normalized, (img, i) => ({ ...img, file: "gorseller/x-" + i + "." + img.ext }), (att) => ({ ...att, file: "dosyalar/" + att.id })),
  legacy.requests.serialize(legacyNormalized, (img, i) => ({ ...img, file: "gorseller/x-" + i + "." + img.ext }), (att) => ({ ...att, file: "dosyalar/" + att.id }))
);

/* ---------- signature / lookup / incomplete ---------- */

const set = CASES.map((raw, index) => model.normalizeRequest(clone(raw), index));
const legacySet = CASES.map((raw, index) => legacy.requests.normalize(clone(raw), index));

equal("signature", model.requestsSignature(set), legacy.requests.signature(legacySet));
equal("incomplete", model.incompleteRequests(set).map((req) => req.id), legacy.requests.incomplete(legacySet).map((req) => req.id));
equal("find.hit", model.getReq(set, "IST-007")?.id, legacy.requests.find(legacySet, "IST-007")?.id);
equal("find.miss", model.getReq(set, "nope"), legacy.requests.find(legacySet, "nope"));

/* ---------- duplicate ---------- */

equal("duplicate", model.duplicateRequest(normalized, set), legacy.requests.duplicate(legacyNormalized, legacySet));
equal("duplicate.null", model.duplicateRequest(null, set), legacy.requests.duplicate(null, legacySet));

/* ---------- update ---------- */

const a = clone(normalized);
const b = clone(legacyNormalized);

equal("update.content", model.updateRequest(a, { title: "Changed" }), legacy.requests.update(b, { title: "Changed" }));
equal("update.flagOnly", model.updateRequest(a, { confirmed: true }), legacy.requests.update(b, { confirmed: true }));
equal("update.ignored", model.updateRequest(a, { createdAt: "2000-01-01T00:00:00.000Z", updatedAt: "2000-01-01T00:00:00.000Z", collapsed: true }), legacy.requests.update(b, { createdAt: "2000-01-01T00:00:00.000Z", updatedAt: "2000-01-01T00:00:00.000Z", collapsed: true }));

/* ---------- remove / move ---------- */

const listA = set.map(clone);
const listB = legacySet.map(clone);

equal("remove.hit", model.removeRequest(listA, "IST-007"), legacy.requests.remove(listB, "IST-007"));
equal("remove.miss", model.removeRequest(listA, "nope"), legacy.requests.remove(listB, "nope"));
equal("move.up", model.moveRequest(listA, listA[1].id, -1), legacy.requests.move(listB, listB[1].id, -1));
equal("move.down", model.moveRequest(listA, listA[0].id, 1), legacy.requests.move(listB, listB[0].id, 1));
equal("move.outOfRange", model.moveRequest(listA, listA[0].id, -5), legacy.requests.move(listB, listB[0].id, -5));

/* ---------- agents ---------- */

ok("agent.normalizeShape", /^agent_/.test(model.normalizeAgent({ role: "nope" }).id));
equal("agent.normalizeRole", model.normalizeAgent({ role: "nope" }).role, "general");
equal("agent.normalizeName", model.normalizeAgent({ role: "qa", name: "x".repeat(200) }).name.length, 80);
equal("agent.sort", model.sortAgentsByRole([{ id: "1", role: "general", name: "B" }, { id: "2", role: "qa", name: "A" }, { id: "3", role: "team_leader", name: "C" }]).map((agent) => agent.role), ["team_leader", "qa", "general"]);

/* ---------- report ---------- */

if (failures.length) {
  console.error("PARITY FAILED: " + failures.length + " of " + checks + " checks");
  for (const failure of failures.slice(0, 10)) {
    console.error("- " + failure.label);
    console.error("  actual:   " + json(failure.actual).slice(0, 400));
    console.error("  expected: " + json(failure.expected).slice(0, 400));
  }
  process.exit(1);
}

console.log("Model parity OK: " + checks + " checks against legacy core.js");
