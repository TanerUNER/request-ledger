#!/usr/bin/env node
"use strict";

/*
  Generates the single-file web app from modular sources.

    source:   src/web/index.template.html  (shell with markers)
              src/styles/tokens.css        (canonical design tokens, injected)
              src/web/app/*.js             (script fragments, concatenated in name order)
    output:   index.html                   (the deliverable, openable by double-click)
              dist/request-ledger.html     (release copy)

  The fragments are plain script text, not ES modules: the runtime is one IIFE, exactly as
  before. The split is mechanical, so behaviour is unchanged.

  Never edit index.html by hand; edit the fragments and run this script.
*/

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const TEMPLATE = path.join(ROOT, "src", "web", "index.template.html");
const TOKENS = path.join(ROOT, "src", "styles", "tokens.css");
const FRAGMENTS = path.join(ROOT, "src", "web", "app");
const INDEX = path.join(ROOT, "index.html");
const DIST = path.join(ROOT, "dist", "request-ledger.html");
const MARKER = "/*__APP_SCRIPT__*/";
const TOKEN_MARKER = "/*__TOKENS__*/";

function buildWeb(options) {
  const opts = options || {};
  const write = opts.write !== false;

  const template = fs.readFileSync(TEMPLATE, "utf8");
  if (template.split(MARKER).length !== 2) {
    throw new Error("template must contain exactly one " + MARKER + " marker");
  }
  if (template.split(TOKEN_MARKER).length !== 2) {
    throw new Error("template must contain exactly one " + TOKEN_MARKER + " marker");
  }

  const tokens = fs.readFileSync(TOKENS, "utf8");
  if (tokens.includes(TOKEN_MARKER)) {
    throw new Error("tokens.css must not contain the " + TOKEN_MARKER + " marker");
  }

  const names = fs
    .readdirSync(FRAGMENTS)
    .filter((name) => name.endsWith(".js"))
    .sort();
  if (!names.length) throw new Error("no script fragments in src/web/app");

  const script = names
    .map((name) => fs.readFileSync(path.join(FRAGMENTS, name), "utf8"))
    .join("\n");

  const html = template.replace(TOKEN_MARKER, () => tokens).replace(MARKER, () => script);

  if (!write) {
    const current = fs.readFileSync(INDEX, "utf8");
    if (current !== html) throw new Error("index.html is stale; run node scripts/build.cjs");
    if (fs.existsSync(DIST)) {
      const dist = fs.readFileSync(DIST, "utf8");
      if (dist !== html) throw new Error("dist/request-ledger.html is stale; run node scripts/build.cjs");
    }
    return { fragments: names.length, bytes: html.length, written: false };
  }

  fs.writeFileSync(INDEX, html, "utf8");
  fs.mkdirSync(path.dirname(DIST), { recursive: true });
  fs.writeFileSync(DIST, html, "utf8");

  return { fragments: names.length, bytes: html.length, written: true };
}

if (require.main === module) {
  const result = buildWeb();
  console.log("Web app built: " + result.fragments + " fragments, " + Math.round(result.bytes / 1024) + " KB");
}

module.exports = { buildWeb };
