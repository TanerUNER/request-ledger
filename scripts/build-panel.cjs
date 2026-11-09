#!/usr/bin/env node
"use strict";

/*
  Generates the panel artifacts from modular sources.

    JS   source: src/panel/*.js            (concatenated in name order)
         output: extension/panel/panel.js  (the file the extension loads)
    CSS  source: src/styles/tokens.css         (canonical tokens, prepended)
                src/styles/panel-overrides.css (panel-only values, prepended)
                src/panel/styles/*.css         (concatenated in name order)
         output: extension/panel/panel.css    (the file the extension loads)

  The CSS fragments are concatenated verbatim after the shared token prelude,
  so the generated stylesheet keeps the same custom property values the panel
  had before the tokens were unified. Both splits are mechanical, so behaviour
  is unchanged.

  Never edit extension/panel/panel.js or extension/panel/panel.css by hand; edit the
  fragments and run this script.
*/

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const FRAGMENTS = path.join(ROOT, "src", "panel");
const TARGET = path.join(ROOT, "extension", "panel", "panel.js");
const STYLE_FRAGMENTS = path.join(ROOT, "src", "panel", "styles");
const STYLE_TARGET = path.join(ROOT, "extension", "panel", "panel.css");
const STYLE_TOKENS = path.join(ROOT, "src", "styles", "tokens.css");
const STYLE_OVERRIDES = path.join(ROOT, "src", "styles", "panel-overrides.css");

function listFragments(dir, extension, label) {
  const names = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(extension))
    .sort();
  if (!names.length) throw new Error("no " + label + " fragments in " + dir);
  return names;
}

function readFragments(dir, names) {
  return names.map((name) => fs.readFileSync(path.join(dir, name), "utf8"));
}

function buildPanel(options) {
  const opts = options || {};
  const write = opts.write !== false;

  const names = listFragments(FRAGMENTS, ".js", "panel");
  const source = readFragments(FRAGMENTS, names).join("\n");

  const styleNames = listFragments(STYLE_FRAGMENTS, ".css", "panel style");
  /* Verbatim concatenation: tokens, overrides, then every fragment keeps its
     own trailing newline. */
  const stylePrelude =
    fs.readFileSync(STYLE_TOKENS, "utf8") + fs.readFileSync(STYLE_OVERRIDES, "utf8");
  const styleSource = stylePrelude + readFragments(STYLE_FRAGMENTS, styleNames).join("");

  if (!write) {
    const current = fs.readFileSync(TARGET, "utf8");
    if (current !== source) throw new Error("extension/panel/panel.js is stale; run node scripts/build.cjs");
    const currentStyle = fs.readFileSync(STYLE_TARGET, "utf8");
    if (currentStyle !== styleSource) throw new Error("extension/panel/panel.css is stale; run node scripts/build.cjs");
    return {
      fragments: names.length,
      bytes: source.length,
      styleFragments: styleNames.length,
      styleBytes: styleSource.length,
      written: false,
    };
  }

  fs.writeFileSync(TARGET, source, "utf8");
  fs.writeFileSync(STYLE_TARGET, styleSource, "utf8");
  return {
    fragments: names.length,
    bytes: source.length,
    styleFragments: styleNames.length,
    styleBytes: styleSource.length,
    written: true,
  };
}

if (require.main === module) {
  const result = buildPanel();
  console.log(
    "Panel built: " +
      result.fragments +
      " js fragments, " +
      result.styleFragments +
      " css fragments, " +
      Math.round((result.bytes + result.styleBytes) / 1024) +
      " KB"
  );
}

module.exports = { buildPanel };
