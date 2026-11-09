/* Request Ledger — content script: screenshot crop overlay (Phase 8).
 * Injected on demand by background/worker.js. The screenshot is cropped here
 * with an offscreen canvas; only the resulting dataUrl travels back.
 * Overlay lives in a closed shadow root and never touches the page styles.
 */
(function () {
  "use strict";

  /* ---- single injection guard ---------------------------------------- */
  if (window.__rlCaptureLoaded) { return; }
  window.__rlCaptureLoaded = true;

  var ROOT_ATTRIBUTE = "data-rl-crop";
  var ACCENT = "#d13e27";
  var MIN_SELECTION = 6;
  var Z_INDEX = 2147483647;
  var FONT_STACK =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

  var overlay = null;

  /* Overlay copy is chosen by the language the panel sends with the capture
     request. An absent value keeps the original Turkish default. */
  var CROP_STRINGS = {
    tr: {
      bar: "Ekran alıntısı — kırpılacak alanı sürükleyerek seç",
      esc: "ESC ile iptal",
      crop: "Kırp",
      cropLabel: "Seçilen alanı kırp",
      cancel: "İptal",
      cancelLabel: "Kırpmayı iptal et"
    },
    en: {
      bar: "Screenshot — drag to select the area to crop",
      esc: "ESC to cancel",
      crop: "Crop",
      cropLabel: "Crop the selected area",
      cancel: "Cancel",
      cancelLabel: "Cancel crop"
    }
  };

  function cropStrings(lang) {
    return lang === "en" ? CROP_STRINGS.en : CROP_STRINGS.tr;
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

  function clamp(value, minimum, maximum) {
    if (maximum < minimum) { return minimum; }
    return Math.min(Math.max(value, minimum), maximum);
  }

  function positiveNumber(value) {
    var number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function buildSelection(startX, startY, endX, endY) {
    return {
      x: Math.min(startX, endX),
      y: Math.min(startY, endY),
      width: Math.abs(endX - startX),
      height: Math.abs(endY - startY)
    };
  }

  function getMetrics(state) {
    var rect = state.surface.getBoundingClientRect();
    var hasRect = rect.width > 0 && rect.height > 0;
    var width = positiveNumber(window.innerWidth) ||
      positiveNumber(document.documentElement && document.documentElement.clientWidth) || 0;
    var height = positiveNumber(window.innerHeight) ||
      positiveNumber(document.documentElement && document.documentElement.clientHeight) || 0;

    return {
      left: hasRect ? rect.left : 0,
      top: hasRect ? rect.top : 0,
      width: hasRect ? rect.width : width,
      height: hasRect ? rect.height : height
    };
  }

  function pointFromEvent(state, event) {
    var metrics = getMetrics(state);
    var clientX = Number.isFinite(event.clientX) ? event.clientX : 0;
    var clientY = Number.isFinite(event.clientY) ? event.clientY : 0;

    return {
      metrics: metrics,
      x: clamp(clientX, metrics.left, metrics.left + metrics.width),
      y: clamp(clientY, metrics.top, metrics.top + metrics.height)
    };
  }

  /* ---- rendering ------------------------------------------------------ */
  function isSelectionUsable(selection) {
    return Boolean(
      selection &&
      selection.width >= MIN_SELECTION &&
      selection.height >= MIN_SELECTION
    );
  }

  function renderSelection(state) {
    var selection = state.selection;

    if (!selection) {
      state.selectionEl.style.display = "none";
      state.sizeLabel.textContent = "";
      state.cropButton.disabled = true;
      state.scrim.style.display = "block";
      return;
    }

    /* The scrim is dropped and the huge outer shadow of the selection keeps
       the surrounding area dimmed, so the chosen region stays bright. */
    state.scrim.style.display = "none";

    state.selectionEl.style.display = "block";
    state.selectionEl.style.setProperty("left", selection.x + "px", "important");
    state.selectionEl.style.setProperty("top", selection.y + "px", "important");
    state.selectionEl.style.setProperty("width", selection.width + "px", "important");
    state.selectionEl.style.setProperty("height", selection.height + "px", "important");

    state.sizeLabel.textContent =
      Math.round(selection.width) + " × " + Math.round(selection.height);
    state.sizeLabel.style.setProperty(
      "top",
      selection.y < 34 ? "3px" : "-25px",
      "important"
    );

    state.cropButton.disabled = !isSelectionUsable(selection);
  }

  function clearSelection(state) {
    state.dragging = false;
    state.pointerId = null;
    state.startX = null;
    state.startY = null;
    state.selection = null;
    renderSelection(state);
  }

  function releasePointer(state) {
    var pointerId = state.pointerId;
    if (pointerId === null) { return; }

    try {
      if (state.surface.hasPointerCapture && state.surface.hasPointerCapture(pointerId)) {
        state.surface.releasePointerCapture(pointerId);
      }
    } catch (error) {
      /* Capture may already be gone after pointercancel. */
    }
  }

  /* ---- crop ----------------------------------------------------------- */
  function confirmCrop() {
    var state = overlay;
    if (!state) { return; }

    var selection = state.selection;
    if (!isSelectionUsable(selection)) { return; }

    var image = state.image;
    if (!image.naturalWidth || !image.naturalHeight) { return; }

    var metrics = getMetrics(state);
    if (!(metrics.width > 0) || !(metrics.height > 0)) { return; }

    var scaleX = image.naturalWidth / metrics.width;
    var scaleY = image.naturalHeight / metrics.height;

    var localX = clamp(selection.x - metrics.left, 0, metrics.width);
    var localY = clamp(selection.y - metrics.top, 0, metrics.height);
    var localWidth = clamp(selection.width, 0, metrics.width - localX);
    var localHeight = clamp(selection.height, 0, metrics.height - localY);

    var sourceX = clamp(Math.round(localX * scaleX), 0, image.naturalWidth - 1);
    var sourceY = clamp(Math.round(localY * scaleY), 0, image.naturalHeight - 1);
    var sourceWidth = clamp(Math.round(localWidth * scaleX), 1, image.naturalWidth - sourceX);
    var sourceHeight = clamp(Math.round(localHeight * scaleY), 1, image.naturalHeight - sourceY);

    var canvas = document.createElement("canvas");
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;

    var dataUrl = "";
    try {
      var context = canvas.getContext("2d");
      if (!context) { return; }
      context.drawImage(
        image,
        sourceX, sourceY, sourceWidth, sourceHeight,
        0, 0, sourceWidth, sourceHeight
      );
      dataUrl = canvas.toDataURL("image/png");
    } catch (error) {
      /* A tainted canvas is impossible with a data: screenshot, but never
         leave the overlay open if it happens. */
      dataUrl = "";
    }

    if (!/^data:image\//i.test(dataUrl)) {
      clearSelection(state);
      return;
    }

    cleanup();
    sendToExtension({
      type: "RL_CROP_DONE",
      dataUrl: dataUrl,
      width: sourceWidth,
      height: sourceHeight
    });
  }

  /* ---- lifecycle ------------------------------------------------------ */
  function cleanup() {
    var state = overlay;
    if (!state) { return; }

    overlay = null;

    document.removeEventListener("keydown", state.onKeyDown, true);
    window.removeEventListener("resize", state.onResize, true);
    document.removeEventListener("scroll", state.onScroll, true);

    state.surface.removeEventListener("pointerdown", state.onPointerDown);
    state.surface.removeEventListener("pointermove", state.onPointerMove);
    state.surface.removeEventListener("pointerup", state.onPointerUp);
    state.surface.removeEventListener("pointercancel", state.onPointerCancel);
    state.surface.removeEventListener("wheel", state.onWheel);

    releasePointer(state);
    state.pointerId = null;

    state.image.removeEventListener("error", state.onImageError);
    state.image.removeEventListener("load", state.onImageLoad);
    state.image.removeEventListener("dragstart", state.onDragStart);
    state.image.removeAttribute("src");

    state.cropButton.removeEventListener("click", state.onCropClick);
    state.cancelButton.removeEventListener("click", state.onCancelClick);
    state.cropButton.removeEventListener("pointerdown", state.onButtonPointerDown);
    state.cancelButton.removeEventListener("pointerdown", state.onButtonPointerDown);

    if (state.host.parentNode) {
      state.host.parentNode.removeChild(state.host);
    }
  }

  function cancelCrop() {
    if (!overlay) { return; }

    cleanup();
    sendToExtension({ type: "RL_CROP_ABORT" });
  }

  /* ---- overlay -------------------------------------------------------- */
  function startCrop(message) {
    if (overlay) { cleanup(); }

    var dataUrl = message && typeof message.dataUrl === "string" ? message.dataUrl : "";
    if (!/^data:image\//i.test(dataUrl) || !document.documentElement) { return false; }
    var lang = message && message.lang === "en" ? "en" : "tr";
    var strings = cropStrings(lang);

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
      "overflow: hidden !important"
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
      "  margin: 0 !important;",
      "  padding: 0 !important;",
      "  border: 0 !important;",
      "  background: #000 !important;",
      "  color: #fff !important;",
      "  overflow: hidden !important;",
      "  pointer-events: none !important;",
      "  font-family: " + FONT_STACK + " !important;",
      "}",
      ".rl-crop-surface {",
      "  position: fixed !important;",
      "  inset: 0 !important;",
      "  z-index: 0 !important;",
      "  overflow: hidden !important;",
      "  background: #000 !important;",
      "  cursor: crosshair !important;",
      "  touch-action: none !important;",
      "  user-select: none !important;",
      "  -webkit-user-select: none !important;",
      "  pointer-events: auto !important;",
      "}",
      ".rl-crop-image {",
      "  position: fixed !important;",
      "  inset: 0 !important;",
      "  display: block !important;",
      "  width: 100% !important;",
      "  height: 100% !important;",
      "  min-width: 0 !important;",
      "  min-height: 0 !important;",
      "  max-width: none !important;",
      "  max-height: none !important;",
      "  margin: 0 !important;",
      "  padding: 0 !important;",
      "  border: 0 !important;",
      "  object-fit: fill !important;",
      "  opacity: 1 !important;",
      "  transform: none !important;",
      "  filter: none !important;",
      "  pointer-events: none !important;",
      "  user-select: none !important;",
      "  -webkit-user-drag: none !important;",
      "}",
      ".rl-crop-scrim {",
      "  position: fixed !important;",
      "  inset: 0 !important;",
      "  z-index: 1 !important;",
      "  background: rgba(10, 9, 8, 0.42) !important;",
      "  pointer-events: none !important;",
      "}",
      ".rl-crop-selection {",
      "  position: fixed !important;",
      "  z-index: 2 !important;",
      "  display: none;",
      "  box-sizing: border-box !important;",
      "  border: 1px solid " + ACCENT + " !important;",
      "  border-radius: 3px !important;",
      "  background: rgba(255, 255, 255, 0.03) !important;",
      "  box-shadow:",
      "    0 0 0 1px rgba(255, 255, 255, 0.4) inset,",
      "    0 0 0 9999px rgba(10, 9, 8, 0.42) !important;",
      "  pointer-events: none !important;",
      "  transition: none !important;",
      "}",
      ".rl-crop-size {",
      "  position: absolute !important;",
      "  left: 0 !important;",
      "  top: -25px !important;",
      "  box-sizing: border-box !important;",
      "  padding: 2px 6px !important;",
      "  border-radius: 4px !important;",
      "  background: " + ACCENT + " !important;",
      "  color: #fff !important;",
      "  font: 600 11px/1.5 " + FONT_STACK + " !important;",
      "  font-variant-numeric: tabular-nums !important;",
      "  letter-spacing: 0.01em !important;",
      "  white-space: nowrap !important;",
      "  pointer-events: none !important;",
      "  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18) !important;",
      "}",
      ".rl-crop-bar {",
      "  position: fixed !important;",
      "  top: 18px !important;",
      "  left: 50% !important;",
      "  z-index: 3 !important;",
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
      "  -webkit-user-select: none !important;",
      "}",
      ".rl-crop-dot {",
      "  flex: 0 0 auto !important;",
      "  width: 8px !important;",
      "  height: 8px !important;",
      "  border-radius: 50% !important;",
      "  background: " + ACCENT + " !important;",
      "}",
      ".rl-crop-text {",
      "  flex: 0 1 auto !important;",
      "  min-width: 0 !important;",
      "  overflow: hidden !important;",
      "  text-overflow: ellipsis !important;",
      "  white-space: nowrap !important;",
      "}",
      ".rl-crop-hint {",
      "  flex: 0 0 auto !important;",
      "  color: rgba(255, 255, 255, 0.58) !important;",
      "  font-size: 11px !important;",
      "  white-space: nowrap !important;",
      "}",
      ".rl-crop-button {",
      "  all: initial !important;",
      "  flex: 0 0 auto !important;",
      "  display: inline-block !important;",
      "  box-sizing: border-box !important;",
      "  width: auto !important;",
      "  height: auto !important;",
      "  min-width: 0 !important;",
      "  margin: 0 !important;",
      "  padding: 5px 10px !important;",
      "  border: 1px solid rgba(255, 255, 255, 0.22) !important;",
      "  border-radius: 6px !important;",
      "  background: rgba(255, 255, 255, 0.08) !important;",
      "  box-shadow: none !important;",
      "  color: #fff !important;",
      "  font: 600 12px/1.3 " + FONT_STACK + " !important;",
      "  letter-spacing: normal !important;",
      "  text-transform: none !important;",
      "  text-shadow: none !important;",
      "  white-space: nowrap !important;",
      "  cursor: pointer !important;",
      "  pointer-events: auto !important;",
      "  appearance: none !important;",
      "  -webkit-appearance: none !important;",
      "  -webkit-tap-highlight-color: transparent !important;",
      "}",
      ".rl-crop-button:hover {",
      "  background: rgba(255, 255, 255, 0.16) !important;",
      "}",
      ".rl-crop-button:focus-visible {",
      "  outline: 2px solid " + ACCENT + " !important;",
      "  outline-offset: 2px !important;",
      "}",
      ".rl-crop-confirm {",
      "  background: " + ACCENT + " !important;",
      "  border-color: " + ACCENT + " !important;",
      "}",
      ".rl-crop-confirm:hover {",
      "  background: #b9321e !important;",
      "}",
      ".rl-crop-confirm:disabled {",
      "  opacity: 0.45 !important;",
      "  cursor: default !important;",
      "  background: rgba(255, 255, 255, 0.08) !important;",
      "  border-color: rgba(255, 255, 255, 0.22) !important;",
      "}",
      "@media (max-width: 560px) {",
      "  .rl-crop-hint { display: none !important; }",
      "}",
      "@media (prefers-reduced-motion: reduce) {",
      "  .rl-crop-selection { transition: none !important; }",
      "}"
    ].join("\n");

    var surface = document.createElement("div");
    surface.className = "rl-crop-surface";

    var image = document.createElement("img");
    image.className = "rl-crop-image";
    image.alt = "";
    image.draggable = false;
    image.setAttribute("draggable", "false");

    var scrim = document.createElement("div");
    scrim.className = "rl-crop-scrim";

    var selectionEl = document.createElement("div");
    selectionEl.className = "rl-crop-selection";

    var sizeLabel = document.createElement("span");
    sizeLabel.className = "rl-crop-size";
    selectionEl.appendChild(sizeLabel);

    surface.append(image, scrim, selectionEl);

    var bar = document.createElement("div");
    bar.className = "rl-crop-bar";
    bar.setAttribute("role", "status");
    bar.setAttribute("aria-live", "polite");

    var dot = document.createElement("span");
    dot.className = "rl-crop-dot";
    dot.setAttribute("aria-hidden", "true");

    var barText = document.createElement("span");
    barText.className = "rl-crop-text";
    barText.textContent = strings.bar;

    var hint = document.createElement("span");
    hint.className = "rl-crop-hint";
    hint.textContent = strings.esc;

    var cropButton = document.createElement("button");
    cropButton.type = "button";
    cropButton.className = "rl-crop-button rl-crop-confirm";
    cropButton.textContent = strings.crop;
    cropButton.disabled = true;
    cropButton.setAttribute("aria-label", strings.cropLabel);

    var cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "rl-crop-button";
    cancelButton.textContent = strings.cancel;
    cancelButton.setAttribute("aria-label", strings.cancelLabel);

    bar.append(dot, barText, hint, cropButton, cancelButton);
    shadow.append(style, surface, bar);

    var state = {
      host: host,
      shadow: shadow,
      surface: surface,
      image: image,
      scrim: scrim,
      selectionEl: selectionEl,
      sizeLabel: sizeLabel,
      cropButton: cropButton,
      cancelButton: cancelButton,
      dragging: false,
      pointerId: null,
      startX: null,
      startY: null,
      selection: null
    };

    state.onPointerDown = function (event) {
      if (overlay !== state) { return; }
      if (event.isPrimary === false) { return; }
      if (event.pointerType === "mouse" && event.button !== 0) { return; }

      event.preventDefault();
      event.stopPropagation();

      var point = pointFromEvent(state, event);

      state.dragging = true;
      state.pointerId = event.pointerId;
      state.startX = point.x;
      state.startY = point.y;
      state.selection = { x: point.x, y: point.y, width: 0, height: 0 };
      renderSelection(state);

      try {
        state.surface.setPointerCapture(event.pointerId);
      } catch (error) {
        /* Pointer capture is only an enhancement. */
      }
    };

    state.onPointerMove = function (event) {
      if (overlay !== state || !state.dragging) { return; }
      if (event.pointerId !== state.pointerId) { return; }

      event.preventDefault();
      event.stopPropagation();

      var point = pointFromEvent(state, event);
      state.selection = buildSelection(state.startX, state.startY, point.x, point.y);
      renderSelection(state);
    };

    state.onPointerUp = function (event) {
      if (overlay !== state || !state.dragging) { return; }
      if (event.pointerId !== state.pointerId) { return; }

      event.preventDefault();
      event.stopPropagation();

      var point = pointFromEvent(state, event);
      state.selection = buildSelection(state.startX, state.startY, point.x, point.y);
      renderSelection(state);

      state.dragging = false;
      releasePointer(state);
      state.pointerId = null;

      if (!isSelectionUsable(state.selection)) {
        clearSelection(state);
      }
    };

    state.onPointerCancel = function (event) {
      if (overlay !== state || !state.dragging) { return; }
      if (event.pointerId !== state.pointerId) { return; }

      releasePointer(state);
      clearSelection(state);
    };

    state.onWheel = function (event) {
      if (overlay !== state) { return; }
      event.preventDefault();
      event.stopPropagation();
    };

    state.onKeyDown = function (event) {
      if (overlay !== state) { return; }

      if (event.key === "Escape" || event.key === "Esc") {
        event.preventDefault();
        event.stopPropagation();
        cancelCrop();
        return;
      }

      if (event.key === "Enter" && isSelectionUsable(state.selection)) {
        event.preventDefault();
        event.stopPropagation();
        confirmCrop();
      }
    };

    state.onResize = function () {
      if (overlay !== state) { return; }

      var metrics = getMetrics(state);
      var selection = state.selection;

      if (state.dragging && state.startX !== null && state.startY !== null) {
        state.startX = clamp(state.startX, metrics.left, metrics.left + metrics.width);
        state.startY = clamp(state.startY, metrics.top, metrics.top + metrics.height);
      }

      if (!selection) { return; }

      var x = clamp(selection.x, metrics.left, metrics.left + metrics.width);
      var y = clamp(selection.y, metrics.top, metrics.top + metrics.height);
      var width = Math.min(selection.width, metrics.left + metrics.width - x);
      var height = Math.min(selection.height, metrics.top + metrics.height - y);

      state.selection = width >= MIN_SELECTION && height >= MIN_SELECTION
        ? { x: x, y: y, width: width, height: height }
        : null;
      renderSelection(state);
    };

    state.onScroll = function () {
      if (overlay !== state) { return; }
      renderSelection(state);
    };

    state.onCropClick = function (event) {
      event.preventDefault();
      event.stopPropagation();
      confirmCrop();
    };

    state.onCancelClick = function (event) {
      event.preventDefault();
      event.stopPropagation();
      cancelCrop();
    };

    state.onButtonPointerDown = function (event) {
      event.stopPropagation();
    };

    state.onDragStart = function (event) {
      event.preventDefault();
      event.stopPropagation();
    };

    state.onImageError = function () {
      if (overlay !== state) { return; }
      cancelCrop();
    };

    state.onImageLoad = function () {
      if (overlay === state) { renderSelection(state); }
    };

    overlay = state;

    image.addEventListener("load", state.onImageLoad);
    image.addEventListener("error", state.onImageError);
    image.addEventListener("dragstart", state.onDragStart);

    surface.addEventListener("pointerdown", state.onPointerDown, { passive: false });
    surface.addEventListener("pointermove", state.onPointerMove, { passive: false });
    surface.addEventListener("pointerup", state.onPointerUp, { passive: false });
    surface.addEventListener("pointercancel", state.onPointerCancel, { passive: false });
    surface.addEventListener("wheel", state.onWheel, { passive: false });

    cropButton.addEventListener("click", state.onCropClick);
    cancelButton.addEventListener("click", state.onCancelClick);
    cropButton.addEventListener("pointerdown", state.onButtonPointerDown);
    cancelButton.addEventListener("pointerdown", state.onButtonPointerDown);

    document.addEventListener("keydown", state.onKeyDown, true);
    window.addEventListener("resize", state.onResize, true);
    document.addEventListener("scroll", state.onScroll, true);

    document.documentElement.appendChild(host);

    image.src = dataUrl;

    return true;
  }

  /* ---- messaging ------------------------------------------------------ */
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
      if (!message || typeof message !== "object") { return false; }

      if (message.type === "RL_CROP_START") {
        var started = false;
        try {
          started = startCrop(message);
        } catch (error) {
          cleanup();
          started = false;
        }
        sendResponse(started ? { ok: true } : { ok: false, error: "Kırpma katmanı açılamadı." });
        return false;
      }

      if (message.type === "RL_CROP_CANCEL") {
        var cancelled = Boolean(overlay);
        if (cancelled) { cleanup(); }
        sendResponse({ ok: true, cancelled: cancelled });
        return false;
      }

      return false;
    });
  }
})();
