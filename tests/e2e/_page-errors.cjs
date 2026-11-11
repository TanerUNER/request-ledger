"use strict";

/* Shared E2E page-error collector. CDP sessions expose Runtime events through
   the harness `cdp.events` array. Any uncaught exception, or a console
   error/warning that names a ReferenceError / failed server bootstrap, fails
   the suite - even when the app catches the error internally. */

function argText(arg) {
  if (!arg || typeof arg !== "object") return "";
  if (typeof arg.value === "string") return arg.value;
  if (arg.value !== undefined && arg.value !== null) return String(arg.value);
  if (typeof arg.description === "string") return arg.description;
  if (arg.preview && Array.isArray(arg.preview.properties)) {
    return arg.preview.properties.map((item) => item.value || "").join(" ");
  }
  return "";
}

function collect(cdp) {
  const failures = [];
  const events = cdp && Array.isArray(cdp.events) ? cdp.events : [];
  events.forEach((event) => {
    if (!event || !event.method) return;
    if (event.method === "Runtime.exceptionThrown") {
      const details = (event.params && event.params.exceptionDetails) || {};
      const text = details.exception && (details.exception.description || details.exception.value);
      failures.push({ kind: "exception", text: String(text || details.text || "uncaught exception").slice(0, 400) });
    }
    if (event.method === "Runtime.consoleAPICalled") {
      const type = event.params && event.params.type;
      if (type !== "error" && type !== "warning") return;
      const text = (event.params.args || []).map(argText).join(" ").trim();
      if (/referenceerror|is not defined|sunucu verisi yüklenemedi/i.test(text)) {
        failures.push({ kind: "console", type: type, text: text.slice(0, 400) });
      }
    }
  });
  return failures;
}

module.exports = { collect };
