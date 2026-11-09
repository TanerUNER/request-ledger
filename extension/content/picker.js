/* Request Ledger — content script: element picker (Phase 8).
 * Injected on demand by background/worker.js. Highlights the element under
 * the cursor (outline + tag badge + glow), picks on click, cancels on Esc and
 * returns a CSS selector plus page context. No floating button, no sidepanel.
 */
(function () {
  "use strict";

  /* ---- single injection guard ---------------------------------------- */
  if (window.__rlPickerLoaded) { return; }
  window.__rlPickerLoaded = true;

  var ROOT_ATTRIBUTE = "data-rl-picker";
  var ACCENT = "#d13e27";
  var Z_INDEX = 2147483647;
  var MAX_SELECTOR_DEPTH = 7;
  var FONT_STACK =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

  /* Hosts owned by the extension (dock, crop overlay, picker) are never
     pickable, and neither is their subtree. */
  var EXTENSION_UI_SELECTOR =
    "#rl-host, [" + ROOT_ATTRIBUTE + "], [data-rl-crop], [data-rl-root]";

  var picker = null;

  /* Overlay copy is chosen by the language the panel sends with the pick
     request. An absent value keeps the original Turkish default. */
  var PICKER_STRINGS = {
    tr: {
      pick: "Sayfadan bir öğe seçin",
      pickCapture: "Sayfadan bir öğe seçin — görüntüsü de alınacak",
      esc: "Esc ile iptal",
      cancel: "İptal",
      cancelLabel: "Seçimi iptal et"
    },
    en: {
      pick: "Select an element on the page",
      pickCapture: "Select an element on the page — a screenshot will also be taken",
      esc: "Esc to cancel",
      cancel: "Cancel",
      cancelLabel: "Cancel selection"
    }
  };

  function pickerStrings(lang) {
    return lang === "en" ? PICKER_STRINGS.en : PICKER_STRINGS.tr;
  }

  /* ---- helpers -------------------------------------------------------- */
  function sendToExtension(message) {
    try {
      if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.id) {
        return;
      }
      chrome.runtime.sendMessage(message, function () {
        /* Read lastError so a closed panel does not log warnings. */
        void chrome.runtime.lastError;
      });
    } catch (error) {
      /* The extension context can be invalidated while the page stays open. */
    }
  }

  function cssEscape(value) {
    var text = String(value);
    if (typeof CSS !== "undefined" && CSS && typeof CSS.escape === "function") {
      return CSS.escape(text);
    }
    return text.replace(/(["\\])/g, "\\$1");
  }

  function isOwnUi(element) {
    return Boolean(
      element &&
      typeof element.closest === "function" &&
      element.closest(EXTENSION_UI_SELECTOR)
    );
  }

  function isPickable(element) {
    return Boolean(
      element instanceof Element &&
      element !== document.documentElement &&
      element !== document.body &&
      !isOwnUi(element)
    );
  }

  function elementAt(clientX, clientY) {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) { return null; }

    var element = document.elementFromPoint(clientX, clientY);
    return isPickable(element) ? element : null;
  }

  function clipText(text, maxLength) {
    if (!maxLength || text.length <= maxLength) { return text; }
    return text.slice(0, Math.max(0, maxLength - 1)).trimEnd() + "…";
  }

  function getElementText(element, maxLength) {
    var candidates = [
      element instanceof HTMLElement ? element.innerText : "",
      element.getAttribute("aria-label"),
      element.getAttribute("placeholder"),
      element.getAttribute("title"),
      element.textContent
    ];

    for (var index = 0; index < candidates.length; index += 1) {
      var candidate = candidates[index];
      if (typeof candidate !== "string") { continue; }

      var normalized = candidate.replace(/\s+/g, " ").trim();
      if (normalized) { return clipText(normalized, maxLength); }
    }

    return "";
  }

  function describeElement(element) {
    var tag = element.tagName.toLowerCase();
    var text = getElementText(element, 48);
    return text ? tag + " · " + text : tag;
  }

  /* id → data-testid / data-test-id / data-qa → tag:nth-of-type chain. */
  function buildSelector(element) {
    if (!isPickable(element)) { return ""; }

    var id = element.getAttribute("id");
    if (id) { return "#" + cssEscape(id); }

    var attributes = ["data-testid", "data-test-id", "data-qa"];
    for (var index = 0; index < attributes.length; index += 1) {
      var value = element.getAttribute(attributes[index]);
      if (value) {
        return "[" + attributes[index] + '="' + cssEscape(value) + '"]';
      }
    }

    var parts = [];
    var current = element;

    while (
      current &&
      current.nodeType === Node.ELEMENT_NODE &&
      current !== document.documentElement
    ) {
      if (current === document.body) {
        parts.unshift("body");
        break;
      }

      var ancestorId = current.getAttribute("id");
      if (ancestorId) {
        parts.unshift("#" + cssEscape(ancestorId));
        break;
      }

      var tag = current.tagName.toLowerCase();
      var part = tag;
      var parent = current.parentElement;

      if (parent) {
        var position = 0;
        var sameTagCount = 0;

        for (var childIndex = 0; childIndex < parent.children.length; childIndex += 1) {
          var sibling = parent.children[childIndex];
          if (sibling.tagName === current.tagName) {
            sameTagCount += 1;
            if (sibling === current) { position = sameTagCount; }
          }
        }

        if (sameTagCount > 1) {
          part += ":nth-of-type(" + position + ")";
        }
      }

      parts.unshift(part);

      if (parts.length >= MAX_SELECTOR_DEPTH) { break; }
      current = current.parentElement;
    }

    return parts.join(" > ");
  }

  function normalizePath(pathname) {
    var raw = typeof pathname === "string" && pathname ? pathname : "/";
    var withLeadingSlash = raw.charAt(0) === "/" ? raw : "/" + raw;

    return withLeadingSlash
      .split("/")
      .map(function (segment) {
        if (
          /^\d+$/.test(segment) ||
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) ||
          /^[0-9a-f]{24}$/i.test(segment)
        ) {
          return "{ID}";
        }
        return segment;
      })
      .join("/");
  }

  /* ---- highlight ------------------------------------------------------ */
  function hideHighlight(state) {
    state.hovered = null;
    state.highlight.style.display = "none";
    state.badge.textContent = "";
  }

  function updateHighlight(state, clientX, clientY) {
    var element = elementAt(clientX, clientY);
    if (!element) {
      hideHighlight(state);
      return;
    }

    var rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) {
      hideHighlight(state);
      return;
    }

    state.hovered = element;
    state.highlight.style.display = "block";
    state.highlight.style.setProperty("left", rect.left + "px", "important");
    state.highlight.style.setProperty("top", rect.top + "px", "important");
    state.highlight.style.setProperty("width", rect.width + "px", "important");
    state.highlight.style.setProperty("height", rect.height + "px", "important");
    state.badge.textContent = element.tagName.toLowerCase();
    state.badge.style.setProperty("top", rect.top < 28 ? "2px" : "-24px", "important");
  }

  /* ---- lifecycle ------------------------------------------------------ */
  function cleanup() {
    var state = picker;
    if (!state) { return; }

    picker = null;

    document.removeEventListener("mousemove", state.onMouseMove, true);
    document.removeEventListener("click", state.onClick, true);
    document.removeEventListener("keydown", state.onKeyDown, true);
    document.removeEventListener("scroll", state.onViewportChange, true);
    window.removeEventListener("resize", state.onViewportChange, true);
    state.cancelButton.removeEventListener("click", state.onCancelClick);
    state.cancelButton.removeEventListener("pointerdown", state.onCancelPointerDown);

    if (state.host.parentNode) {
      state.host.parentNode.removeChild(state.host);
    }
  }

  function cancelPicker() {
    if (!picker) { return false; }

    cleanup();
    sendToExtension({ type: "RL_PICK_ABORT" });
    return true;
  }

  /* The worker crops the full-viewport screenshot. Keep the rect in CSS pixels
     and clip it to the viewport so a partially visible element still yields a
     usable image instead of an out-of-bounds crop. */
  function buildCaptureRect(element) {
    var rect = element.getBoundingClientRect();
    var viewportWidth = window.innerWidth ||
      (document.documentElement && document.documentElement.clientWidth) || 0;
    var viewportHeight = window.innerHeight ||
      (document.documentElement && document.documentElement.clientHeight) || 0;

    var left = Math.max(0, rect.left);
    var top = Math.max(0, rect.top);
    var right = Math.min(viewportWidth, rect.right);
    var bottom = Math.min(viewportHeight, rect.bottom);

    if (!(right - left >= 1) || !(bottom - top >= 1)) { return null; }

    return {
      rect: {
        left: left,
        top: top,
        width: right - left,
        height: bottom - top
      },
      dpr: Number(window.devicePixelRatio) > 0 ? Number(window.devicePixelRatio) : 1
    };
  }

  function finishPick(state, element) {
    var selector = buildSelector(element);
    if (!selector) { return false; }

    var result = {
      type: "RL_PICK_DONE",
      selector: selector,
      label: describeElement(element),
      tag: element.tagName.toLowerCase(),
      text: getElementText(element, 240),
      page: normalizePath(location.pathname)
    };

    if (state.capture) {
      var capture = buildCaptureRect(element);
      if (capture) {
        result.rect = capture.rect;
        result.dpr = capture.dpr;
      }
    }

    cleanup();
    sendToExtension(result);
    return true;
  }

  /* ---- overlay -------------------------------------------------------- */
  function startPicker(options) {
    var capture = Boolean(options && options.capture);
    var lang = options && options.lang === "en" ? "en" : "tr";
    var strings = pickerStrings(lang);

    if (picker) {
      /* Already open (e.g. a repeated start): keep the newest mode and language. */
      picker.capture = capture;
      picker.lang = lang;
      picker.strings = strings;
      if (picker.barText) {
        picker.barText.textContent = capture ? strings.pickCapture : strings.pick;
      }
      if (picker.hint) { picker.hint.textContent = strings.esc; }
      if (picker.cancelButton) {
        picker.cancelButton.textContent = strings.cancel;
        picker.cancelButton.setAttribute("aria-label", strings.cancelLabel);
      }
      return true;
    }

    if (!document.documentElement) { return false; }

    var host = document.createElement("div");
    host.setAttribute(ROOT_ATTRIBUTE, "");
    host.style.cssText = [
      "all: initial !important",
      "position: fixed !important",
      "inset: 0 !important",
      "z-index: " + Z_INDEX + " !important",
      "display: block !important",
      "width: 100% !important",
      "height: 100% !important",
      "margin: 0 !important",
      "padding: 0 !important",
      "border: 0 !important",
      "background: transparent !important",
      "pointer-events: none !important",
      "overflow: visible !important"
    ].join("; ");

    var shadow = host.attachShadow({ mode: "closed" });

    var style = document.createElement("style");
    style.textContent = [
      ":host {",
      "  all: initial !important;",
      "  position: fixed !important;",
      "  inset: 0 !important;",
      "  z-index: " + Z_INDEX + " !important;",
      "  display: block !important;",
      "  width: 100% !important;",
      "  height: 100% !important;",
      "  pointer-events: none !important;",
      "  font-family: " + FONT_STACK + " !important;",
      "}",
      ".rl-pick-highlight {",
      "  position: fixed !important;",
      "  display: none;",
      "  z-index: 1 !important;",
      "  box-sizing: border-box !important;",
      "  border: 1px solid " + ACCENT + " !important;",
      "  border-radius: 9px !important;",
      "  background: transparent !important;",
      "  box-shadow: none !important;",
      "  pointer-events: none !important;",
      "}",
      ".rl-pick-highlight::after {",
      '  content: "" !important;',
      "  position: absolute !important;",
      "  inset: -2px !important;",
      "  border-radius: 10px !important;",
      "  box-shadow: 0 0 8px 1px rgba(209, 62, 39, 0.32) !important;",
      "  filter: blur(1px) !important;",
      "  opacity: 0;",
      "  animation: rlPickGlow 2.4s ease-in-out infinite !important;",
      "  pointer-events: none !important;",
      "}",
      "@keyframes rlPickGlow {",
      "  0%, 100% { opacity: 0; }",
      "  50% { opacity: 0.55; }",
      "}",
      "@media (prefers-reduced-motion: reduce) {",
      "  .rl-pick-highlight::after {",
      "    animation: none !important;",
      "    opacity: 0.3 !important;",
      "  }",
      "}",
      ".rl-pick-badge {",
      "  position: absolute !important;",
      "  top: -24px !important;",
      "  left: -2px !important;",
      "  box-sizing: border-box !important;",
      "  max-width: 180px !important;",
      "  overflow: hidden !important;",
      "  padding: 2px 6px !important;",
      "  border-radius: 4px 4px 4px 0 !important;",
      "  background: " + ACCENT + " !important;",
      "  color: #fff !important;",
      "  font: 600 11px/1.5 " + FONT_STACK + " !important;",
      "  letter-spacing: 0.01em !important;",
      "  text-overflow: ellipsis !important;",
      "  white-space: nowrap !important;",
      "  pointer-events: none !important;",
      "  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18) !important;",
      "}",
      ".rl-pick-bar {",
      "  position: fixed !important;",
      "  top: 18px !important;",
      "  left: 50% !important;",
      "  z-index: 2 !important;",
      "  display: flex !important;",
      "  align-items: center !important;",
      "  gap: 9px !important;",
      "  box-sizing: border-box !important;",
      "  max-width: calc(100vw - 32px) !important;",
      "  padding: 7px 9px 7px 12px !important;",
      "  border-radius: 9px !important;",
      "  background: #1c1b1a !important;",
      "  color: #fff !important;",
      "  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28) !important;",
      "  font: 500 13px/1.35 " + FONT_STACK + " !important;",
      "  transform: translateX(-50%) !important;",
      "  pointer-events: none !important;",
      "  user-select: none !important;",
      "}",
      ".rl-pick-dot {",
      "  flex: 0 0 auto !important;",
      "  width: 8px !important;",
      "  height: 8px !important;",
      "  border-radius: 50% !important;",
      "  background: " + ACCENT + " !important;",
      "}",
      ".rl-pick-text {",
      "  overflow: hidden !important;",
      "  text-overflow: ellipsis !important;",
      "  white-space: nowrap !important;",
      "}",
      ".rl-pick-hint {",
      "  flex: 0 0 auto !important;",
      "  color: rgba(255, 255, 255, 0.58) !important;",
      "  font-size: 11px !important;",
      "  white-space: nowrap !important;",
      "}",
      ".rl-pick-cancel {",
      "  all: initial !important;",
      "  flex: 0 0 auto !important;",
      "  display: inline-block !important;",
      "  box-sizing: border-box !important;",
      "  margin: 0 !important;",
      "  padding: 5px 10px !important;",
      "  border: 1px solid rgba(255, 255, 255, 0.22) !important;",
      "  border-radius: 6px !important;",
      "  background: rgba(255, 255, 255, 0.08) !important;",
      "  color: #fff !important;",
      "  font: 600 12px/1.3 " + FONT_STACK + " !important;",
      "  cursor: pointer !important;",
      "  pointer-events: auto !important;",
      "  -webkit-tap-highlight-color: transparent !important;",
      "}",
      ".rl-pick-cancel:hover {",
      "  background: rgba(255, 255, 255, 0.16) !important;",
      "}",
      ".rl-pick-cancel:focus-visible {",
      "  outline: 2px solid " + ACCENT + " !important;",
      "  outline-offset: 2px !important;",
      "}",
      "@media (max-width: 480px) {",
      "  .rl-pick-hint { display: none !important; }",
      "}"
    ].join("\n");

    var highlight = document.createElement("div");
    highlight.className = "rl-pick-highlight";

    var badge = document.createElement("div");
    badge.className = "rl-pick-badge";
    highlight.appendChild(badge);

    var bar = document.createElement("div");
    bar.className = "rl-pick-bar";
    bar.setAttribute("role", "status");
    bar.setAttribute("aria-live", "polite");

    var dot = document.createElement("span");
    dot.className = "rl-pick-dot";
    dot.setAttribute("aria-hidden", "true");

    var barText = document.createElement("span");
    barText.className = "rl-pick-text";
    barText.textContent = capture ? strings.pickCapture : strings.pick;

    var hint = document.createElement("span");
    hint.className = "rl-pick-hint";
    hint.textContent = strings.esc;

    var cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "rl-pick-cancel";
    cancelButton.textContent = strings.cancel;
    cancelButton.setAttribute("aria-label", strings.cancelLabel);

    bar.append(dot, barText, hint, cancelButton);
    shadow.append(style, highlight, bar);

    var state = {
      host: host,
      shadow: shadow,
      highlight: highlight,
      badge: badge,
      barText: barText,
      hint: hint,
      cancelButton: cancelButton,
      capture: capture,
      lang: lang,
      strings: strings,
      lastClientX: null,
      lastClientY: null,
      hovered: null
    };

    state.onMouseMove = function (event) {
      if (picker !== state) { return; }

      state.lastClientX = event.clientX;
      state.lastClientY = event.clientY;
      updateHighlight(state, event.clientX, event.clientY);
    };

    state.onViewportChange = function () {
      if (picker !== state || state.lastClientX === null) { return; }
      updateHighlight(state, state.lastClientX, state.lastClientY);
    };

    state.onKeyDown = function (event) {
      if (picker !== state) { return; }
      if (event.key !== "Escape" && event.key !== "Esc") { return; }

      event.preventDefault();
      event.stopPropagation();
      cancelPicker();
    };

    state.onClick = function (event) {
      if (picker !== state) { return; }

      var target = event.target;
      if (target instanceof Element && isOwnUi(target)) {
        /* Clicks on the picker bar belong to its own buttons. */
        return;
      }

      var element = elementAt(event.clientX, event.clientY) ||
        (isPickable(target) ? target : null);
      if (!element) { return; }

      event.preventDefault();
      event.stopPropagation();
      finishPick(state, element);
    };

    state.onCancelClick = function (event) {
      event.preventDefault();
      event.stopPropagation();
      cancelPicker();
    };

    state.onCancelPointerDown = function (event) {
      event.stopPropagation();
    };

    picker = state;

    document.addEventListener("mousemove", state.onMouseMove, true);
    document.addEventListener("click", state.onClick, true);
    document.addEventListener("keydown", state.onKeyDown, true);
    document.addEventListener("scroll", state.onViewportChange, true);
    window.addEventListener("resize", state.onViewportChange, true);
    cancelButton.addEventListener("click", state.onCancelClick);
    cancelButton.addEventListener("pointerdown", state.onCancelPointerDown);

    document.documentElement.appendChild(host);

    return true;
  }

  /* ---- messaging ------------------------------------------------------ */
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
      if (!message || typeof message !== "object") { return false; }

      if (message.type === "RL_PICKER_START") {
        var started = false;
        try {
          started = startPicker({ capture: message.capture === true, lang: message.lang });
        } catch (error) {
          cleanup();
          started = false;
        }
        sendResponse(started ? { ok: true } : { ok: false, error: "Seçici açılamadı." });
        return false;
      }

      if (message.type === "RL_PICKER_CANCEL") {
        var cancelled = Boolean(picker);
        if (cancelled) { cleanup(); }
        sendResponse({ ok: true, cancelled: cancelled });
        return false;
      }

      return false;
    });
  }
})();
