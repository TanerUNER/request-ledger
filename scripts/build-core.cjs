#!/usr/bin/env node
"use strict";

/*
  Generates the classic domain core from the ES modules in src/core.

    source: src/core/*.mjs         ES modules with explicit imports
    output: extension/src/core.js  classic script, one IIFE, window.IstekCore

  The extension runs plain classic scripts (no ES modules): panel.html loads
  ../src/core.js before panel.js. The modules are therefore assembled into the same
  IIFE the product always shipped:

    prologue (IIFE + "use strict")
    module bodies in dependency order, import/export syntax stripped
    the public API object plus the window/globalThis assignment
    epilogue

  A bundler is not required. The modules share no top-level names and only use named
  imports, so stripping the module syntax in dependency order is sufficient. The strip
  is deterministic and fails loudly if any import/export syntax survives.

  Never edit extension/src/core.js by hand; edit src/core/*.mjs and run
  node scripts/build.cjs.
*/

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const CORE_DIR = path.join(ROOT, "src", "core");
const TARGET = path.join(ROOT, "extension", "src", "core.js");

/* Dependency order: each module only imports modules listed before it. */
const MODULES = [
  "constants.mjs",
  "util.mjs",
  "i18n.mjs",
  "model.mjs",
  "storage.mjs",
  "media.mjs",
  "markdown.mjs",
  "zip.mjs",
  "backup.mjs",
];

const PROLOGUE = `/* ============================================================
   Istek Defteri · shared logic core (extension/src/core.js)

   GENERATED FILE — do not edit by hand.
   Source: src/core/*.mjs · Build: node scripts/build.cjs

   Classic script. Attaches window.IstekCore and globalThis.IstekCore.
   No DOM / storage / network access at load time.
   Behaviour ported from index.html (IIFE 1566-7757).
   ============================================================ */
(function(){
  "use strict";`;

const EPILOGUE_TAIL = `  if(typeof window !== "undefined") window.IstekCore = api;
  if(typeof globalThis !== "undefined") globalThis.IstekCore = api;
})();`;

const API_EPILOGUE = `const api = {
  constants: {
    TYPES: TYPES,
    PRIORITIES: PRIORITIES,
    AGENT_ROLES: AGENT_ROLES,
    PLANNING_TESTS: PLANNING_TESTS,
    PLANNING_FULL_TEXT: PLANNING_FULL_TEXT,
    PLANNING_LIGHT_TEXT: PLANNING_LIGHT_TEXT,
    PLANNING_FULL_TEXT_EN: PLANNING_FULL_TEXT_EN,
    PLANNING_LIGHT_TEXT_EN: PLANNING_LIGHT_TEXT_EN,
    TYPE_TEMPLATES: TYPE_TEMPLATES,
    TRANSLATIONS_EN: TRANSLATIONS_EN,
    CHANGELOG: CHANGELOG,
    LIMITS: LIMITS,
    DB: DB
  },
  util: {
    nowISO: nowISO,
    pad2: pad2,
    formatYMD: formatYMD,
    formatStamp: formatStamp,
    formatTime: formatTime,
    formatClock: formatClock,
    formatDateTime: formatDateTime,
    mdCell: mdCell,
    mdLine: mdLine,
    utf8Bytes: utf8Bytes,
    extFromMime: extFromMime,
    extFromFileName: extFromFileName,
    safeFileBase: safeFileBase,
    formatBytes: formatBytes,
    imageFileName: imageFileName,
    attachmentFileName: attachmentFileName,
    backupMediaFileName: backupMediaFileName,
    normalizeDisplayPath: normalizeDisplayPath,
    newLedgerId: newLedgerId
  },
  i18n: {
    setLanguage: setLanguage,
    getLanguage: getLanguage,
    translate: translate,
    countLabel: countLabel,
    formatDateLong: formatDateLong,
    trLower: trLower
  },
  requests: {
    newId: nextId,
    create: makeNewRequest,
    normalize: normalizeRequest,
    serialize: serializeRequest,
    validate: isAutoValid,
    missing: missingFields,
    status: requestStatus,
    find: getReq,
    incomplete: incompleteRequests,
    signature: requestsSignature,
    duplicate: duplicateRequest,
    update: updateRequest,
    remove: removeRequest,
    move: moveRequest
  },
  storage: {
    init: init,
    close: close,
    loadState: loadState,
    saveState: saveState,
    getLastSaveError: getLastSaveError,
    loadTheme: loadTheme,
    saveTheme: saveTheme,
    getSetting: getSetting,
    putSetting: putSetting,
    deleteSetting: deleteSetting,
    putImage: putImage,
    getImage: getImage,
    deleteImage: deleteImage,
    putFile: putFile,
    getFile: getFile,
    deleteFile: deleteFile,
    clearAllMedia: clearAllMedia,
    listCollection: listCollection,
    putCollection: putCollection,
    deleteCollection: deleteCollection,
    clearCollection: clearCollection,
    addHistory: addHistory,
    listHistory: listHistory,
    clearHistory: clearHistory
  },
  media: {
    compress: compressImage,
    getImageBlob: getImageBlob,
    getFileBlob: getFileBlob
  },
  markdown: {
    build: buildMarkdown
  },
  zip: {
    create: createZip,
    parse: parseZip
  },
  backup: {
    build: buildBackup,
    buildJson: buildBackupJson,
    buildZip: buildBackupZip,
    parse: parseBackup,
    apply: applyBackup
  }
};`;

/* Strips ESM syntax from one module body. Deterministic; throws on leftovers. */
function toClassic(source, name) {
  let text = source.replace(/\r\n/g, "\n");
  text = text.replace(/^import\s[\s\S]*?;\n/gm, "");
  text = text.replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|var|class)\b)/gm, "");
  const leftover = text.match(/^\s*(?:import|export)\b.*$/m);
  if (leftover) throw new Error("module syntax left in " + name + ": " + leftover[0].trim());
  return text.trimEnd();
}

function renderCore() {
  const parts = [PROLOGUE];
  for (const name of MODULES) {
    const source = fs.readFileSync(path.join(CORE_DIR, name), "utf8");
    parts.push("  /* ---------- " + name + " ---------- */\n" + toClassic(source, name));
  }
  parts.push(API_EPILOGUE.trimEnd());
  parts.push(EPILOGUE_TAIL);
  return parts.join("\n\n") + "\n";
}

function buildCore(options) {
  const opts = options || {};
  const write = opts.write !== false;
  const output = renderCore();

  if (!write) {
    const current = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, "utf8") : null;
    if (current !== output) throw new Error("extension/src/core.js is stale; run node scripts/build.cjs");
    return { modules: MODULES.length, bytes: output.length, written: false };
  }

  fs.writeFileSync(TARGET, output, "utf8");
  return { modules: MODULES.length, bytes: output.length, written: true };
}

if (require.main === module) {
  const result = buildCore();
  console.log("Core built: " + result.modules + " modules, " + Math.round(result.bytes / 1024) + " KB");
}

module.exports = { buildCore, renderCore, MODULES };
