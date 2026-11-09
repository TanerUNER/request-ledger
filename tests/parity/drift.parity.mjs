/*
  Drift guard: the web app (index.html) and the shared core (src/core) must agree on the
  domain constants that shape the product.

  This exists because the project historically kept two hand-maintained copies of the same
  rules. The check fails the moment one side changes without the other.

  Run: node tests/parity/drift.parity.mjs
*/

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import { PRIORITIES, TYPES, TYPE_TEMPLATES } from "../../src/core/constants.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "..", "..", "index.html"), "utf8");

let checks = 0;
const failures = [];

function fail(label, detail) {
  failures.push({ label, detail });
}

function equal(label, actual, expected) {
  checks++;
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) failures.push({ label, actual: a.slice(0, 400), expected: b.slice(0, 400) });
}

/* Extract a balanced JS literal that starts at the marker's opening bracket. */
function extractLiteral(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return null;
  const open = markerIndex + marker.length - 1;
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "[" || ch === "{") depth++;
    else if (ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return null;
}

function parseLiteral(marker) {
  const literal = extractLiteral(html, marker);
  if (!literal) return null;
  return vm.runInNewContext("(" + literal + ")");
}

const webTypes = parseLiteral("const TYPES = [");
const webPriorities = parseLiteral("const PRIORITIES = [");
const webTemplates = parseLiteral("const TYPE_TEMPLATES = {");

if (!webTypes) fail("TYPES literal not found in index.html");
if (!webPriorities) fail("PRIORITIES literal not found in index.html");
if (!webTemplates) fail("TYPE_TEMPLATES literal not found in index.html");

if (webTypes) {
  equal("TYPES ids", webTypes.map((type) => type.id), TYPES.map((type) => type.id));
  equal("TYPES labels", webTypes.map((type) => type.label), TYPES.map((type) => type.label));
  equal("TYPES classes", webTypes.map((type) => type.cls), TYPES.map((type) => type.cls));
  equal("TYPES placeholders", webTypes.map((type) => type.ph), TYPES.map((type) => type.ph));
}

if (webPriorities) {
  equal("PRIORITIES ids", webPriorities.map((priority) => priority.id), PRIORITIES.map((priority) => priority.id));
  equal("PRIORITIES labels", webPriorities.map((priority) => priority.label), PRIORITIES.map((priority) => priority.label));
}

if (webTemplates) {
  equal("TYPE_TEMPLATES keys", Object.keys(webTemplates).sort(), Object.keys(TYPE_TEMPLATES).sort());
  for (const key of Object.keys(TYPE_TEMPLATES)) {
    equal("TYPE_TEMPLATES." + key, webTemplates[key], TYPE_TEMPLATES[key]);
  }
}

/* Storage identity is part of the contract too. */
const dbName = /const DB_NAME\s*=\s*"([^"]+)"/.exec(html);
const dbVersion = /const DB_VERSION\s*=\s*(\d+)/.exec(html);
const storageKey = /const STORAGE_KEY\s*=\s*"([^"]+)"/.exec(html);

equal("storage key", storageKey && storageKey[1], "oz-istek-defteri-v1");
equal("database name", dbName && dbName[1], "oz-istek-defteri");
equal("database version", dbVersion && Number(dbVersion[1]), 5);

if (failures.length) {
  console.error("DRIFT FAILED: " + failures.length + " of " + checks + " checks");
  for (const failure of failures.slice(0, 10)) {
    console.error("- " + failure.label);
    console.error("  web:   " + failure.actual);
    console.error("  core:  " + failure.expected);
  }
  process.exit(1);
}

console.log("Drift guard OK: " + checks + " constant checks between index.html and src/core");
