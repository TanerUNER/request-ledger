/* Request Ledger - MAIN-world console error collector.
 *
 * Runs at document_start so page errors from the first script onward are
 * available to the panel. The panel reads window.__rlConsoleErrors through
 * chrome.scripting.executeScript({ world: "MAIN" }) and writes only the
 * identifying first-line titles into the request's console field.
 *
 * No DOM access, no network, no eval. The buffer is capped at 50 entries.
 */
(function () {
  "use strict";

  if (window.__rlConsoleHooked) { return; }
  window.__rlConsoleHooked = true;

  var MAX = 50;
  var list = [];
  window.__rlConsoleErrors = list;

  function firstLine(value) {
    var text = "";
    try {
      if (value instanceof Error) {
        text = String(value.name || "Error") + ": " + String(value.message || "");
      } else if (value && typeof value === "object" && typeof value.message === "string") {
        text = value.message;
      } else {
        text = String(value == null ? "" : value);
      }
    } catch (error) {
      text = "";
    }
    return text.replace(/\s+/g, " ").trim().slice(0, 200);
  }

  function add(kind, value) {
    try {
      var line = firstLine(value);
      if (!line) { return; }
      list.push({ kind: kind, message: line, at: Date.now() });
      while (list.length > MAX) { list.shift(); }
    } catch (error) { /* never break the page */ }
  }

  var originalError = console.error;
  try {
    console.error = function () {
      try {
        var parts = [];
        for (var i = 0; i < arguments.length; i += 1) {
          parts.push(firstLine(arguments[i]));
        }
        add("console", parts.join(" "));
      } catch (error) { /* ignore */ }
      /* The page keeps its own console output. This script runs in the page's
         MAIN world, so calling the original reports the error with the page as
         the source. The buffer above is the transport for the picker. */
      try {
        if (originalError) { return originalError.apply(console, arguments); }
      } catch (error) { /* never break the page */ }
      return undefined;
    };
  } catch (error) { /* console may be frozen; error events still work */ }

  window.addEventListener("error", function (event) {
    add("error", event && event.message ? event.message : "Script error");
  }, true);

  window.addEventListener("unhandledrejection", function (event) {
    var reason = event && event.reason;
    add("rejection", reason && reason.message ? reason.message : reason);
  });
})();
