#!/usr/bin/env node
"use strict";

/*
  Syntax-checks every inline <script> block of the single-file web app.

  The web app is one HTML file with inline JavaScript; a broken edit only fails at runtime.
  This catches parse errors before the browser does.

  Usage: node scripts/check-inline.cjs [path-to-index.html]
*/

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const file = path.resolve(process.argv[2] || path.join(__dirname, "..", "index.html"));
const html = fs.readFileSync(file, "utf8");
const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;

let match;
let index = 0;
let checked = 0;
const failures = [];

while ((match = pattern.exec(html)) !== null) {
  index++;
  const attrs = match[1] || "";
  if (/\bsrc\s*=/.test(attrs)) continue;
  if (/application\/ld\+json/i.test(attrs)) continue;
  const code = match[2];
  if (!code.trim()) continue;
  checked++;
  try {
    new vm.Script(code, { filename: path.basename(file) + "#script" + index });
  } catch (error) {
    const before = html.slice(0, match.index);
    const line = before.split("\n").length;
    failures.push({ block: index, startLine: line, message: error.message });
  }
}

if (failures.length) {
  for (const failure of failures) {
    console.error("FAIL block " + failure.block + " (starts near line " + failure.startLine + "): " + failure.message);
  }
  process.exit(1);
}

console.log("Inline scripts OK: " + checked + " block(s) in " + path.basename(file));
