/* Request Ledger — content script: iframe host for dock + flyout.
 * Implements the HOST side of extension/docs/panel-shell-v10.md (on top of
 * panel-shell-v9.md and earlier; v10 overrides them where they disagree).
 * v10 §23 shrinks the rail to 100px (flyout/overlays at 124/offset);
 * §20 slides the host dock frame itself in/out instead of moving the card
 * inside the iframe; §21 re-seats the host arrow on the flyout card edge;
 * §19 syncs the persisted side across tabs; §3 adds the host image modal.
 * v9 behaviour is kept: overlays at the rail side, rich stats card,
 * launcher/callout, full-width drag with side flips, page background.
 * No page shrinking: the rail floats over the page. No eval, no inline
 * handlers, no network access. */
(function () {
  "use strict";

  /* ---- single injection guard ---------------------------------------- */
  if (window.__rlDockLoaded) { return; }
  window.__rlDockLoaded = true;

  var HOST_ID = "rl-host";
  var DOCK_ID = "rl-dock";
  var FLYOUT_ID = "rl-flyout";

  var FLYOUT_RIGHT = 124;        /* v10 §23: 12px gap left of the 100px rail  */
  var FLYOUT_WIDTH = 360;        /* v7 §2: full card width                   */
  var GAP = 12;                  /* §5 clamp / gap to viewport edge          */

  /* v10 §23: the open rail sits 8px from the top and 12px from the active
     edge, 100px wide and spanning the viewport minus 16px. The frame is
     hidden while collapsed; v10 §20 slides the frame itself off-screen. */
  var DOCK_RIGHT_OPEN = 12;
  var DOCK_TOP_OPEN = 8;
  var DOCK_WIDTH_OPEN = 100;
  var DOCK_RADIUS_OPEN = "12px";
  var DOCK_HEIGHT_OPEN = "calc(100vh - 16px)";
  var DOCK_CARD_TOP = 8;         /* rail card top in viewport while open     */

  var OPEN_MS = 220;
  var CLOSE_MS = 200;
  var COLLAPSE_FALLBACK_MS = CLOSE_MS + 40;
  /* v10 §20: the host dock frame slides in/out over 220ms. The off-screen
     edge keeps a 20px margin past the 100px frame. */
  var DOCK_FRAME_MS = 220;
  var DOCK_SLIDE_OFF = 120;
  var EASE = "cubic-bezier(.22,.61,.36,1)";
  var FLYOUT_SHIFT = 14;        /* §6 flyout translateX(14px) -> 0; mirrored */
  var DRAG_MS = 220;            /* v4 §2: reset / snap animation            */
  var DRAG_SNAP_PX = 6;         /* v4 §2: below this the offset snaps to 0  */

  /* v9 §18/§19 + v10 §23: the rail is draggable from 12px to
     innerWidth-112 and the layout flips side when the flyout would no
     longer fit (right -> left at 384; left -> right at innerWidth-484). */
  var DRAG_MIN_LEFT = 12;
  var DRAG_MAX_RIGHT_MARGIN = DOCK_RIGHT_OPEN + DOCK_WIDTH_OPEN;
  var SIDE_SWITCH_TO_LEFT = 384;      /* right -> left when left < 384      */
  var SIDE_SWITCH_TO_RIGHT = 484;     /* left -> right when left > w - 484  */

  /* v9 §17: modern launcher + wider one-shot callout. */
  var LAUNCHER_SIZE = 44;
  var LAUNCHER_MARK_SIZE = 30;
  var LAUNCHER_RIGHT = 20;
  var LAUNCHER_BOTTOM = 20;      /* v8 §1: back to the old bottom spot       */
  var CALLOUT_WIDTH = 150;
  var CALLOUT_HEIGHT = 64;
  var CALLOUT_RIGHT = 80;        /* launcher left edge (68) + 12px gap       */
  var CALLOUT_BOTTOM = 20;       /* same bottom line as the launcher         */
  var CALLOUT_SHIFT = 18;        /* slide in from the panel side             */
  var LAUNCHER_Z = 2147483001;
  var CALLOUT_DELAY_MS = 400;
  var CALLOUT_LIFE_MS = 4000;
  var CALLOUT_FADE_MS = 200;

  /* v10 §21 + follow-up: host-drawn flyout arrow. The 11×11 square is
     rotated 45° and clipped to its outer half so only the tip protrudes
     into the 12px gap — never a full diamond, regardless of what sits
     behind the card edge. Border + fill per side in paintArrow(). */
  var ARROW_SIZE = 11;
  var ARROW_HALF = ARROW_SIZE / 2;
  var ARROW_Z = 2147483001;
  var ARROW_CLIP_RIGHT = "polygon(0 0, 100% 0, 100% 100%)";
  var ARROW_CLIP_LEFT = "polygon(0 0, 0 100%, 100% 100%)";

  /* shell v14: in-panel image preview. The flyout renders the image inside
     its own extension-origin document; the host only enlarges/recentres the
     flyout iframe. No image bytes ever cross into the page. */
  var PREVIEW_MIN_WIDTH = 320;
  var PREVIEW_MIN_HEIGHT = 260;
  var PREVIEW_MAX_WIDTH = 960;
  var PREVIEW_MAX_HEIGHT = 760;
  var PREVIEW_MARGIN = 16;
  var PREVIEW_Z = 2147483002;   /* above frames + host overlays */

  var SECTIONS = {
    project: 1,
    detail: 1,
    new: 1, page: 1, desc: 1, list: 1,
    settings: 1, backup: 1, help: 1, export: 1
  };

  /* v13: live bridge between the web app and the extension panel. Only the
     allowlisted origins may receive ledger data. The host is the only party
     that validates event.origin and pins targetOrigin. Every localhost and
     loopback port is allowed because the launcher can serve on a free port.
     A file: page has the opaque origin "null"; it cannot pin targetOrigin,
     so that single case uses "*" and keeps event.source as the guard. */
  var COMPANION_ORIGINS = {
    "http://localhost:8080": 1,
    "https://taneruner.github.io": 1
  };
  var COMPANION_LOCAL_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::[0-9]{1,5})?$/;
  /* Panel channel messages are page-local. Scoping them with this per-page
     token prevents another tab's panel from opening this page's flyout. */
  var hostPageToken = "rlpage_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
  var BRIDGE_IN_TYPES = {
    RL_APP_HELLO: 1,
    RL_APP_PATCH: 1,
    RL_APP_ACK: 1,
    RL_APP_BYE: 1,
    RL_APP_SERVER_STOP: 1,
    RL_APP_TABS_REQUEST: 1,
    RL_APP_PICK_REQUEST: 1,
    RL_APP_PICK_CANCEL: 1,
    RL_APP_CAPTURE_REQUEST: 1,
    RL_APP_CAPTURE_CANCEL: 1
  };
  var BRIDGE_OUT_TYPES = {
    RL_APP_SNAPSHOT: 1,
    RL_APP_PATCH: 1,
    RL_APP_ACK: 1,
    RL_APP_BYE: 1,
    RL_APP_TABS_RESULT: 1,
    RL_APP_PICK_RESULT: 1,
    RL_APP_CAPTURE_RESULT: 1
  };
  var MAX_APP_IMAGE_CHARS = 8 * 1024 * 1024;
  var bridgeRelayedToPage = 0;
  var bridgeRelayedToPanel = 0;

  function isFilePage() {
    try { return window.location.protocol === "file:"; } catch (error) { return false; }
  }

  function isCompanionOrigin() {
    try {
      if (isFilePage()) { return true; }
      var origin = window.location.origin;
      return COMPANION_ORIGINS[origin] === 1 || COMPANION_LOCAL_ORIGIN.test(origin);
    } catch (error) {
      return false;
    }
  }

  /* Chrome reports location.origin as "file://" while the opaque message
     origin is "null". The companion protocol uses one stable identity:
     "null" for file pages, the real origin otherwise. */
  function companionPageOrigin() {
    return isFilePage() ? "null" : window.location.origin;
  }

  function sendBridgeContext(frame) {
    if (!frame || !isCompanionOrigin()) { return; }
    postTo(frame, {
      source: "request-ledger-host",
      type: "RL_BRIDGE_CONTEXT",
      v: 1,
      pageOrigin: companionPageOrigin(),
      pageToken: hostPageToken
    });
  }

  function relayBridgeToPanel(data) {
    if (!isCompanionOrigin()) { return; }
    bridgeRelayedToPanel += 1;
    var message = { source: "request-ledger-host", pageOrigin: companionPageOrigin() };
    for (var key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key) && key !== "source" && key !== "pageOrigin") {
        message[key] = data[key];
      }
    }
    var frames = [dockFrame, flyoutFrame];
    for (var i = 0; i < frames.length; i += 1) {
      postTo(frames[i], message);
    }
  }

  function relayBridgeToPage(data) {
    if (!isCompanionOrigin()) { return; }
    if (typeof data.v !== "number" || data.v !== 1) { return; }
    if (!BRIDGE_OUT_TYPES[data.type]) { return; }
    bridgeRelayedToPage += 1;
    var message = { source: "request-ledger-host", v: 1, pageOrigin: companionPageOrigin() };
    for (var key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key) && key !== "source" && key !== "pageOrigin") {
        message[key] = data[key];
      }
    }
    /* Picker replies are the only control payloads that leave the panel.
       Strip them to the documented fields so a compromised frame cannot
       smuggle ledger data through this channel. */
    if (data.type === "RL_APP_TABS_RESULT") {
      message.tabs = sanitizeTabList(data.tabs);
      delete message.requests;
      delete message.upserts;
      delete message.agents;
    } else if (data.type === "RL_APP_PICK_RESULT") {
      message.cancelled = data.cancelled === true;
      message.selector = cleanText(data.selector, 4000);
      message.page = cleanText(data.page, 2048);
      message.label = cleanText(data.label, 400);
      message.tag = cleanText(data.tag, 64);
      message.text = cleanText(data.text, 240);
      message.capture = data.capture === true;
      message.captureError = data.captureError === true;
      message.dataUrl = cleanImageDataUrl(data.dataUrl);
      message.width = cleanDimension(data.width);
      message.height = cleanDimension(data.height);
      if (typeof data.tabId === "number" && isFinite(data.tabId)) message.tabId = data.tabId;
      delete message.requests;
      delete message.upserts;
      delete message.agents;
    } else if (data.type === "RL_APP_CAPTURE_RESULT") {
      message.cancelled = data.cancelled === true;
      message.reason = cleanText(data.reason, 64);
      message.dataUrl = cleanImageDataUrl(data.dataUrl);
      message.width = cleanDimension(data.width);
      message.height = cleanDimension(data.height);
      if (typeof data.tabId === "number" && isFinite(data.tabId)) message.tabId = data.tabId;
      delete message.requests;
      delete message.upserts;
      delete message.agents;
    }
    /* targetOrigin is pinned to the page origin on http(s). A file: page has
       the opaque origin "null", so only that case uses "*"; event.source and
       the host marker remain mandatory on the page side. */
    var targetOrigin = isFilePage() ? "*" : window.location.origin;
    try { window.postMessage(message, targetOrigin); } catch (error) { /* ignore */ }
  }

  function sanitizeTabList(value) {
    if (!Array.isArray(value)) { return []; }
    var out = [];
    for (var i = 0; i < value.length && out.length < 50; i += 1) {
      var tab = value[i];
      if (!tab || typeof tab !== "object") { continue; }
      if (typeof tab.id !== "number" || !isFinite(tab.id) || tab.id < 0) { continue; }
      var url = typeof tab.url === "string" ? tab.url.slice(0, 2048) : "";
      if (!/^(https?|file):/i.test(url)) { continue; }
      out.push({
        id: Math.floor(tab.id),
        title: cleanText(tab.title, 200),
        url: url
      });
    }
    return out;
  }

  /* page -> host. The page is untrusted, so every field is relayed as data;
     the panel sanitises the envelope before applying it. */
  function onPageBridgeMessage(event) {
    if (!event || event.source !== window) { return; }
    if (!isCompanionOrigin()) { return; }
    if (isFilePage()) {
      if (event.origin !== "null") { return; }
    } else if (event.origin !== window.location.origin) {
      return;
    }
    var data = event.data;
    if (!data || typeof data !== "object") { return; }
    if (data.source !== "request-ledger-web") { return; }
    if (typeof data.type !== "string" || !BRIDGE_IN_TYPES[data.type]) { return; }
    if (typeof data.v !== "number" || data.v !== 1) { return; }
    if (typeof data.ledgerId !== "string" || data.ledgerId.length > 120) { return; }
    /* Phase 2c project identity travels with every ledger envelope. */
    if (data.projectId !== undefined && (typeof data.projectId !== "string" || data.projectId.length > 120)) { return; }
    if (data.projectName !== undefined && (typeof data.projectName !== "string" || data.projectName.length > 120)) { return; }
    if (Array.isArray(data.requests) && data.requests.length > 500) { return; }
    if (Array.isArray(data.upserts) && data.upserts.length > 500) { return; }
    /* Picker control messages carry no ledger payload. */
    if (data.type === "RL_APP_TABS_REQUEST") {
      relayBridgeToPanel(data);
      return;
    }
    if (data.type === "RL_APP_PICK_REQUEST") {
      if (typeof data.tabId !== "number" || !isFinite(data.tabId) || data.tabId < 0) { return; }
      if (data.capture !== undefined && typeof data.capture !== "boolean") { return; }
      if (data.lang !== undefined && !cleanOverlayLang(data.lang)) { return; }
      relayBridgeToPanel(data);
      return;
    }
    if (data.type === "RL_APP_PICK_CANCEL") {
      if (data.tabId !== undefined &&
          (typeof data.tabId !== "number" || !isFinite(data.tabId) || data.tabId < 0)) { return; }
      relayBridgeToPanel(data);
      return;
    }
    if (data.type === "RL_APP_CAPTURE_REQUEST") {
      if (typeof data.tabId !== "number" || !isFinite(data.tabId) || data.tabId < 0) { return; }
      if (data.lang !== undefined && !cleanOverlayLang(data.lang)) { return; }
      relayBridgeToPanel(data);
      return;
    }
    if (data.type === "RL_APP_CAPTURE_CANCEL") {
      if (data.tabId !== undefined &&
          (typeof data.tabId !== "number" || !isFinite(data.tabId) || data.tabId < 0)) { return; }
      relayBridgeToPanel(data);
      return;
    }
    relayBridgeToPanel(data);
  }

  /* v6 §1/§4: host-drawn toast stack + folder/stats hint card. Both live
     in `#rl-host` and always sit at the rail side (v9 §1 / v10 §23):
     right side `right = 124 + offset`, left side `left = 124 + offset`.
     v7 §13: toasts sit at the panel bottom; hints follow their rail anchor. */
  var OVERLAY_Z = 2147483002;
  var OVERLAY_RAIL = FLYOUT_RIGHT; /* 124: rail + 12px gap                  */

  var TOAST_BOTTOM = 16;       /* v7 §13: grow up from the panel bottom */
  var TOAST_LAYER_WIDTH = 320;
  var TOAST_MAX_WIDTH = 300;
  var TOAST_MAX = 3;
  var TOAST_SHIFT = 18;
  var TOAST_IN_MS = 220;
  var TOAST_OUT_MS = 240;
  var TOAST_LIFE_MS = 3000;
  var TOAST_TEXT_MAX = 400;

  var HINT_EDGE = 8;
  var HINT_MAX_WIDTH = 300;
  var HINT_SHIFT = 18;
  var HINT_IN_MS = 180;
  var HINT_OUT_MS = 120;
  var HINT_TITLE_MAX = 80;
  var HINT_LINE_MAX = 160;
  var HINT_LINES_MAX = 4;

  /* v6 §1: exact panel-surface palettes. Static — never built from page
     or message data beyond picking one of the two records below. */
  var PALETTE = {
    light: {
      bg: "#f7f5f2", fg: "#3b3833", border: "#e6e1d8",
      accent: "#d13e27", soft: "#fbeae5", danger: "#b33324",
      muted: "#6d6961", ok: "#2f7d4f", warn: "#b7791f",
      sage: "#4f614b"
    },
    dark: {
      bg: "#1b1917", fg: "#d6cfc4", border: "#35312c",
      accent: "#ff5f43", soft: "rgba(255,95,67,.14)", danger: "#ff8b7a",
      muted: "#b8b0a4", ok: "#58c98a", warn: "#f0c05a",
      sage: "#9dbfa8"
    }
  };

  /* ---- static styles (never built from page / message data) ---------- */
  var HOST_CSS = [
    "all: initial !important",
    "position: fixed !important",
    "inset: 0 !important",
    "z-index: 2147483000 !important",
    "pointer-events: none !important",
    "background: transparent !important",
    "border: 0 !important",
    "margin: 0 !important",
    "padding: 0 !important",
    "display: block !important",
    "visibility: visible !important",
    "opacity: 1 !important",
    "overflow: visible !important",
    "color-scheme: normal !important",
    "transform: none !important",
    "filter: none !important"
  ].join("; ") + ";";

  /* Shared frame base. NOTE: opacity/transform are intentionally not part of
     it — the flyout animates those inline and the dock pins its own. */
  var FRAME_BASE = [
    "all: initial !important",
    "position: fixed !important",
    "border: 0 !important",
    "margin: 0 !important",
    "padding: 0 !important",
    "background: transparent !important",
    "pointer-events: auto !important",
    "color-scheme: normal !important",
    "display: block !important",
    "box-shadow: none !important",
    "min-width: 0 !important",
    "min-height: 0 !important",
    "max-width: none !important",
    "max-height: none !important",
    "left: auto !important",
    "bottom: auto !important",
    "visibility: visible !important"
  ].join("; ") + ";";

  var FRAME_CSS = FRAME_BASE +
    "opacity: 1 !important; " +
    "transform: none !important;";

  /* v10 §20: the dock frame is hidden while collapsed and only ever holds
     the open geometry in CSS. Opening/closing animates the host frame's
     `right`/`left` edge from ±120px via showDockFrame/hideDockFrame. */
  var DOCK_CSS = FRAME_CSS +
    "right: " + DOCK_RIGHT_OPEN + "px !important; " +
    "top: " + DOCK_TOP_OPEN + "px !important; " +
    "width: " + DOCK_WIDTH_OPEN + "px !important; " +
    "height: " + DOCK_HEIGHT_OPEN + " !important; " +
    "border-radius: " + DOCK_RADIUS_OPEN + " !important; " +
    "display: none !important;";

  /* v7 §2: the flyout iframe is exactly the card (no transparent padding),
     with a 12px radius so the card edges stay clipped. */
  var FLYOUT_CSS = FRAME_BASE +
    "right: " + FLYOUT_RIGHT + "px !important; " +
    "top: 0px !important; " +
    "width: " + FLYOUT_WIDTH + "px !important; " +
    "height: 0px !important; " +
    "border-radius: 12px !important; " +
    "display: none !important; " +
    "opacity: 0 !important; " +
    "transform: translateX(" + FLYOUT_SHIFT + "px) !important;";

  /* v4 §2: full-viewport drag shield, painted above both frames. Transparent
     so the page stays visible while the rail is being dragged. */
  var SHIELD_CSS = [
    "all: initial !important",
    "position: fixed !important",
    "inset: 0 !important",
    "z-index: 2147483001 !important",
    "pointer-events: auto !important",
    "cursor: grabbing !important",
    "background: transparent !important",
    "touch-action: none !important",
    "user-select: none !important",
    "-webkit-user-select: none !important",
    "border: 0 !important",
    "margin: 0 !important",
    "padding: 0 !important",
    "display: block !important",
    "opacity: 1 !important",
    "visibility: visible !important",
    "transform: none !important"
  ].join("; ") + ";";

  /* v7 §13: toast stack grows up from the panel bottom. Column + flex-end
     means the newest (last DOM child) sits at the bottom, older above. */
  var TOAST_LAYER_CSS = [
    "all: initial !important",
    "position: fixed !important",
    "right: " + OVERLAY_RAIL + "px !important",
    "bottom: " + TOAST_BOTTOM + "px !important",
    "top: auto !important",
    "width: " + TOAST_LAYER_WIDTH + "px !important",
    "display: flex !important",
    "flex-direction: column !important",
    "align-items: flex-end !important",
    "justify-content: flex-end !important",
    "gap: 8px !important",
    "pointer-events: none !important",
    "z-index: " + OVERLAY_Z + " !important",
    "background: transparent !important",
    "border: 0 !important",
    "margin: 0 !important",
    "padding: 0 !important",
    "overflow: visible !important",
    "visibility: visible !important",
    "opacity: 1 !important",
    "transform: none !important",
    "box-shadow: none !important",
    "color-scheme: normal !important"
  ].join("; ") + ";";

  /* v6 §4: one hint card only, so two hovered folder icons can never
     overlap. Same isolation as the toast layer. v7 §4 sets `top` from the
     rail anchor's offsetTop before each show. */
  var HINT_LAYER_CSS = [
    "all: initial !important",
    "position: fixed !important",
    "right: " + OVERLAY_RAIL + "px !important",
    "top: " + DOCK_CARD_TOP + "px !important",
    "display: none !important",
    "width: max-content !important",
    "max-width: " + HINT_MAX_WIDTH + "px !important",
    "box-sizing: border-box !important",
    "padding: 9px 12px !important",
    "border: 1px solid " + PALETTE.light.border + " !important",
    "border-radius: 10px !important",
    "background: " + PALETTE.light.bg + " !important",
    "color: " + PALETTE.light.fg + " !important",
    "pointer-events: none !important",
    "z-index: " + OVERLAY_Z + " !important",
    "margin: 0 !important",
    "overflow: visible !important",
    "visibility: visible !important",
    "opacity: 0 !important",
    "transform: translateX(" + HINT_SHIFT + "px) !important",
    "transition: none !important",
    "box-shadow: none !important",
    "color-scheme: normal !important"
  ].join("; ") + ";";

  /* v9 §17: modern closed-state launcher. 48×48, card fill, 2px accent
     ring, accent chevron + dot, hover scale via host events (inline
     !important beats any stylesheet so hover is JS-driven). */
  var LAUNCHER_CSS = [
    "all: initial !important",
    "position: fixed !important",
    "right: " + LAUNCHER_RIGHT + "px !important",
    "left: auto !important",
    "bottom: " + LAUNCHER_BOTTOM + "px !important",
    "top: auto !important",
    "width: " + LAUNCHER_SIZE + "px !important",
    "height: " + LAUNCHER_SIZE + "px !important",
    "box-sizing: border-box !important",
    "display: none !important",
    "place-items: center !important",
    "margin: 0 !important",
    "padding: 0 !important",
    "border: 1px solid " + PALETTE.light.border + " !important",
    "border-radius: 50% !important",
    "background: " + PALETTE.light.bg + " !important",
    "color: " + PALETTE.light.accent + " !important",
    "cursor: pointer !important",
    "pointer-events: auto !important",
    "z-index: " + LAUNCHER_Z + " !important",
    "box-shadow: 0 6px 18px rgba(32,28,20,.14) !important",
    "opacity: 0 !important",
    "transform: scale(.9) !important",
    "transition: opacity .14s ease, transform .14s ease, box-shadow .14s ease !important",
    "visibility: visible !important",
    "overflow: visible !important",
    "color-scheme: normal !important"
  ].join("; ") + ";";

  /* v9 §17: one-shot callout left/right of the launcher (150×64, card
     surface) with a subtle pointer toward the launcher. */
  var CALLOUT_CSS = [
    "all: initial !important",
    "position: fixed !important",
    "right: " + CALLOUT_RIGHT + "px !important",
    "left: auto !important",
    "bottom: " + CALLOUT_BOTTOM + "px !important",
    "top: auto !important",
    "width: " + CALLOUT_WIDTH + "px !important",
    "height: " + CALLOUT_HEIGHT + "px !important",
    "box-sizing: border-box !important",
    "display: none !important",
    "flex-direction: column !important",
    "justify-content: center !important",
    "gap: 3px !important",
    "margin: 0 !important",
    "padding: 10px 14px 11px !important",
    "border: 1px solid " + PALETTE.light.border + " !important",
    "border-radius: 11px !important",
    "background: " + PALETTE.light.bg + " !important",
    "color: " + PALETTE.light.fg + " !important",
    "box-shadow: none !important",
    "cursor: pointer !important",
    "pointer-events: auto !important",
    "z-index: " + LAUNCHER_Z + " !important",
    "overflow: visible !important",
    "visibility: visible !important",
    "opacity: 0 !important",
    "transform: translateX(" + CALLOUT_SHIFT + "px) !important",
    "transition: opacity .2s ease, transform .2s ease !important",
    "color-scheme: normal !important"
  ].join("; ") + ";";

  /* v9 §8: host-drawn flyout arrow. The two visible edges are picked per
     side in paintArrow so the rotated square reads as a chevron against
     the card, exactly like the old panel ::after. */
  var ARROW_CSS = [
    "all: initial !important",
    "position: fixed !important",
    "width: " + ARROW_SIZE + "px !important",
    "height: " + ARROW_SIZE + "px !important",
    "box-sizing: border-box !important",
    "display: none !important",
    "margin: 0 !important",
    "padding: 0 !important",
    "border: 0 !important",
    "border-radius: 2px !important",
    "background: " + PALETTE.light.bg + " !important",
    "transform: rotate(45deg) !important",
    "pointer-events: none !important",
    "z-index: " + ARROW_Z + " !important",
    "visibility: visible !important",
    "opacity: 1 !important",
    "color-scheme: normal !important"
  ].join("; ") + ";";

  var extBase = "";
  try {
    extBase = chrome.runtime.getURL("");
  } catch (error) {
    return;
  }
  if (!extBase) { return; }

  var extOrigin = extBase.replace(/\/+$/, "");
  try {
    var parsedOrigin = new URL(extBase).origin;
    if (parsedOrigin && parsedOrigin !== "null") { extOrigin = parsedOrigin; }
  } catch (error) { /* keep the string fallback */ }

  /* ---- state --------------------------------------------------------- */
  var hostEl = null;
  var dockFrame = null;
  var flyoutFrame = null;

  /* dock/rail state as reported by the dock (§1) */
  var dockState = "collapsed";
  /* v7 §1 / v10 §20: the frame stays visible through the slide-out, then
     is hidden. `dockFrameVisible` mirrors its display value. */
  var dockFrameVisible = false;
  var dockAnimTimer = null;
  var dockAnimToken = 0;
  var dockAnimMode = null;       /* "in" | "out" | null                 */
  var dockAnimating = false;

  /* v7 §1: host launcher + one-shot callout */
  var launcherEl = null;
  var launcherMarkEl = null;
  var launcherMarkEls = null;
  var launcherPulseEl = null;
  var launcherPulseAnimation = null;
  var calloutEl = null;
  var calloutTitleEl = null;
  var calloutHintEl = null;
  var calloutArrowEl = null;
  var launcherUiReady = false;
  var launcherShown = false;
  var launcherHover = false;
  var launcherTheme = "light";
  var launcherOpenLabel = "Open panel";
  var launcherCalloutTitle = "Request Ledger";
  var launcherCalloutHint = "";
  var pinned = false;
  var calloutShown = false;      /* one-shot per page load                   */
  var calloutVisible = false;
  var calloutShowTimer = null;
  var calloutLifeTimer = null;
  var calloutFadeTimer = null;

  /* v9 §19: left/right placement, persisted as rl-side */
  var side = "right";
  var sideReady = false;
  var storedSideRead = false;
  var storageListenerOn = false;

  /* section state */
  var isOpen = false;
  var currentSection = null;
  var pendingSection = null;
  var flyoutLoaded = false;
  var anchorTop = 0;
  var anchorHeight = 0;
  var flyoutTop = 0;
  var sectionArrowY = null;      /* v10 §21: offset inside the flyout card */
  var lastFlyoutMax = -1;
  var lastCardHeight = 0;

  var collapseTimer = null;

  /* v4 §2 / v9 §18: horizontal drag now tracks absolute left positions */
  var dragOffset = 0;         /* px from the current side edge (12 + offset) */
  var dragStartX = 0;         /* screenX at drag start                       */
  var dragStartLeft = 0;      /* dockFrame.getBoundingClientRect().left      */
  var dragStartedAt = 0;      /* used to ignore the focus-into-iframe blur   */
  var dragShield = null;      /* full-viewport capture layer, null if idle   */
  var resetTimer = null;
  var resetRaf = null;
  var resetToken = 0;

  /* flyout motion (§6) */
  var flyoutHideTimer = null;
  var flyoutHideHandler = null;
  var flyoutHideToken = 0;

  /* v6 §1/§4: host toast + hint state */
  var toastLayer = null;
  var hintLayer = null;
  var arrowEl = null;
  var flyoutPreviewOpen = false;   /* v14: flyout enlarged for an image preview */
  var flyoutPreviewData = null;    /* last requested rect, for resize re-clamp  */
  var toastAll = [];          /* every record, for timer cleanup             */
  var toastActive = [];       /* on-screen (non-exiting) records, max 3      */
  var hintVisible = false;
  var hintKeyNow = "";
  var hintYNow = 0;
  var hintStatsNow = null;
  var hintTimer = null;
  var hintToken = 0;
  var hintPending = null;     /* content waiting for the swap-out to finish  */

  /* v8 §8: while element pick / capture runs, the panel is fully hidden;
     the page picker overlay must be visible. Purely visibility — no layout.
     A missed result/abort restores the panel after this bound. */
  var PANEL_HIDE_FALLBACK_MS = 20000;
  var panelHidden = false;
  var panelHideTimer = null;
  var pendingHostOpen = false;
  var hostOpenRetryTimer = null;
  var hostOpenTries = 0;

  var teardown = false;
  var hostSuspended = false;

  /* ---- helpers ------------------------------------------------------- */
  function setImportant(el, name, value) {
    if (!el || !el.style) { return; }
    try { el.style.setProperty(name, value, "important"); } catch (error) { /* ignore */ }
  }

  function postTo(frame, message) {
    if (!frame || !frame.contentWindow) { return; }
    try { frame.contentWindow.postMessage(message, extOrigin); } catch (error) { /* ignore */ }
  }

  function postToDock(type, payload) {
    var message = { source: "request-ledger-host", type: type };
    if (payload) {
      for (var key in payload) {
        if (Object.prototype.hasOwnProperty.call(payload, key)) { message[key] = payload[key]; }
      }
    }
    postTo(dockFrame, message);
  }

  /* ---- page background sample (v5 flyout canvas) ---------------------- */
  function isOpaquePageColor(value) {
    if (typeof value !== "string") { return false; }
    var color = value.replace(/\s+/g, " ").trim();
    if (!/^rgba?\(/.test(color)) { return false; }
    if (/^rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/.test(color)) { return false; }
    if (color === "transparent") { return false; }
    return true;
  }

  function sampleBackground(el) {
    if (!el || !window.getComputedStyle) { return null; }
    try { return window.getComputedStyle(el).backgroundColor || null; } catch (error) { return null; }
  }

  /* body first, root as fallback; a handful of style reads per open only. */
  function readPageBackground() {
    var color = sampleBackground(document.body);
    if (!isOpaquePageColor(color)) { color = sampleBackground(document.documentElement); }
    return isOpaquePageColor(color) ? color : null;
  }

  function sendPageBackground() {
    if (!flyoutFrame) { return; }
    var color = readPageBackground();
    if (!color) { return; }
    postTo(flyoutFrame, {
      source: "request-ledger-host",
      type: "RL_PAGE_BG",
      color: color
    });
  }

  /* v10 follow-up §2: the flyout opens next to the active button. The top
     half opens downward from the button top; the bottom half flips upward
     with its bottom on the button bottom. The panel gets exactly the space
     available on that side as its max height, so tall bodies scroll and
     the footer stays reachable. */
  function flyoutAnchorTop() {
    return DOCK_CARD_TOP + anchorTop;
  }

  function flyoutAnchorBottom() {
    return DOCK_CARD_TOP + anchorTop + anchorHeight;
  }

  function flyoutSpaceBelow() {
    var vh = window.innerHeight || 0;
    return (vh - HINT_EDGE) - flyoutAnchorTop();
  }

  function flyoutSpaceAbove() {
    return flyoutAnchorBottom() - HINT_EDGE;
  }

  function flyoutOpensUp() {
    return flyoutSpaceAbove() > flyoutSpaceBelow();
  }

  function flyoutAvailableHeight() {
    var vh = window.innerHeight || 0;
    var raw = flyoutOpensUp() ? flyoutSpaceAbove() : flyoutSpaceBelow();
    var max = Math.max(0, vh - (HINT_EDGE * 2));
    return Math.max(0, Math.floor(Math.min(raw, max)));
  }

  /* Top edge for a card of `h`: button top when opening down, button
     bottom minus h when flipped up. */
  function flyoutTopForHeight(h) {
    var vh = window.innerHeight || 0;
    var maxTop = Math.max(HINT_EDGE, vh - HINT_EDGE - h);
    if (flyoutOpensUp()) {
      return clamp(flyoutAnchorBottom() - h, HINT_EDGE, maxTop);
    }
    return clamp(flyoutAnchorTop(), HINT_EDGE, maxTop);
  }

  function sendFlyoutMax() {
    if (!flyoutFrame) { return; }
    var height = flyoutAvailableHeight();
    if (height === lastFlyoutMax) { return; }
    lastFlyoutMax = height;
    postTo(flyoutFrame, {
      source: "request-ledger-host",
      type: "RL_FLYOUT_MAX",
      height: height
    });
  }

  function reducedMotion() {
    try {
      return !!(window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (error) {
      return false;
    }
  }

  /* ---- v9 §1 / v10 §23: overlay position ----------------------------- */
  /* Toast stack and hint card always hug the rail side, whether a section
     flyout is open or not:
       right side -> right = 124 + offset
       left side  -> left  = 124 + offset
     Both layers share the same inset and sit above dock + flyout. */
  function overlayInset() {
    return OVERLAY_RAIL + dragOffset;
  }

  function overlayRight() {
    return overlayInset();
  }

  function overlayLeft() {
    return overlayInset();
  }

  function positionOverlays() {
    var inset = overlayInset() + "px";
    var align = side === "right" ? "flex-end" : "flex-start";
    if (toastLayer) {
      setImportant(toastLayer, "align-items", align);
      if (side === "right") {
        setImportant(toastLayer, "right", inset);
        setImportant(toastLayer, "left", "auto");
      } else {
        setImportant(toastLayer, "left", inset);
        setImportant(toastLayer, "right", "auto");
      }
    }
    if (hintLayer) {
      if (side === "right") {
        setImportant(hintLayer, "right", inset);
        setImportant(hintLayer, "left", "auto");
      } else {
        setImportant(hintLayer, "left", inset);
        setImportant(hintLayer, "right", "auto");
      }
    }
  }

  /* v9 §19: toast/hint/callout/flyout entry signs mirror with the side. */
  function panelSideSign() {
    return side === "right" ? 1 : -1;
  }

  function toastShift() {
    return TOAST_SHIFT * panelSideSign();
  }

  function hintShift() {
    return HINT_SHIFT * panelSideSign();
  }

  function flyoutShift() {
    return FLYOUT_SHIFT * panelSideSign();
  }

  function calloutShift() {
    return CALLOUT_SHIFT * panelSideSign();
  }

  function cleanText(value, max) {
    if (typeof value !== "string") { return ""; }
    var text = value.trim();
    if (!text) { return ""; }
    if (text.length > max) { text = text.slice(0, max); }
    return text;
  }

  /* The app capture tools are one-shot: a bounded PNG/JPEG/WebP data URL may
     cross this relay, and nothing else from the worker result is copied. */
  function cleanImageDataUrl(value) {
    if (typeof value !== "string") { return ""; }
    if (!value || value.length > MAX_APP_IMAGE_CHARS) { return ""; }
    return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(value) ? value : "";
  }

  function cleanDimension(value) {
    var number = Number(value);
    if (!isFinite(number) || number <= 0) { return 0; }
    return Math.min(20000, Math.round(number));
  }

  function cleanOverlayLang(value) {
    return value === "en" || value === "tr" ? value : "";
  }

  /* ---- v6 §1: toast stack -------------------------------------------- */
  function paletteFor(theme) {
    return theme === "dark" ? PALETTE.dark : PALETTE.light;
  }

  function createToastElement(text, error, theme) {
    var palette = paletteFor(theme);
    var el = document.createElement("div");
    /* text only — never markup from the panel/page */
    el.textContent = text;
    el.setAttribute("role", error ? "alert" : "status");
    el.setAttribute("aria-atomic", "true");
    el.style.cssText = [
      "all: initial !important",
      "display: block !important",
      "box-sizing: border-box !important",
      "max-width: " + TOAST_MAX_WIDTH + "px !important",
      "padding: 9px 12px !important",
      "border: 1px solid " + (error ? palette.danger : palette.border) + " !important",
      "border-radius: 10px !important",
      "background: " + (error ? palette.soft : palette.bg) + " !important",
      "color: " + (error ? palette.danger : palette.fg) + " !important",
      "font-family: system-ui, -apple-system, 'Segoe UI', sans-serif !important",
      "font-size: 12px !important",
      "font-weight: 600 !important",
      "font-style: normal !important",
      "line-height: 1.4 !important",
      "letter-spacing: normal !important",
      "text-align: left !important",
      "text-transform: none !important",
      "white-space: pre-wrap !important",
      "overflow-wrap: break-word !important",
      "word-break: normal !important",
      "margin: 0 !important",
      "position: static !important",
      "float: none !important",
      "box-shadow: none !important",
      "opacity: 0 !important",
      "transform: translateX(" + toastShift() + "px) !important",
      "transition: none !important",
      "pointer-events: none !important"
    ].join("; ") + ";";
    return el;
  }

  function detachToast(record) {
    if (!record) { return; }
    var el = record.el;
    record.el = null;
    if (el && el.parentNode) {
      try { el.parentNode.removeChild(el); } catch (error) { /* ignore */ }
    }
    var index = toastAll.indexOf(record);
    if (index !== -1) { toastAll.splice(index, 1); }
  }

  function removeToast(record, animated) {
    if (!record || record.removed) { return; }
    record.removed = true;
    if (record.timer) { clearTimeout(record.timer); record.timer = null; }
    var index = toastActive.indexOf(record);
    if (index !== -1) { toastActive.splice(index, 1); }

    /* oldest over the cap disappears immediately (§1) */
    if (!animated || teardown || reducedMotion() || !record.el) {
      detachToast(record);
      return;
    }

    setImportant(record.el, "transition",
      "opacity " + TOAST_OUT_MS + "ms ease, transform " + TOAST_OUT_MS + "ms ease");
    setImportant(record.el, "opacity", "0");
    setImportant(record.el, "transform", "translateX(" + toastShift() + "px)");
    record.exitTimer = setTimeout(function () {
      record.exitTimer = null;
      detachToast(record);
    }, TOAST_OUT_MS + 20);
  }

  function showToast(text, kind, theme) {
    if (!toastLayer || teardown) { return; }
    var record = {
      el: createToastElement(text, kind === "error", theme),
      timer: null,
      exitTimer: null,
      removed: false
    };
    toastLayer.appendChild(record.el);
    toastAll.push(record);
    toastActive.push(record);

    while (toastActive.length > TOAST_MAX) {
      removeToast(toastActive[0], false);
    }

    if (reducedMotion()) {
      setImportant(record.el, "opacity", "1");
      setImportant(record.el, "transform", "translateX(0)");
    } else {
      requestAnimationFrame(function () {
        if (teardown || record.removed || !record.el) { return; }
        /* flush the off-screen start value before transitioning */
        try { void record.el.offsetWidth; } catch (error) { /* ignore */ }
        setImportant(record.el, "transition",
          "opacity " + TOAST_IN_MS + "ms ease, transform " + TOAST_IN_MS + "ms ease");
        setImportant(record.el, "opacity", "1");
        setImportant(record.el, "transform", "translateX(0)");
      });
    }

    record.timer = setTimeout(function () {
      record.timer = null;
      removeToast(record, true);
    }, TOAST_LIFE_MS);
  }

  function onToastMessage(data) {
    if (typeof data.text !== "string") { return; }
    var text = cleanText(data.text, TOAST_TEXT_MAX);
    if (!text) { return; }
    var kind = data.kind === "error" ? "error" : null;
    var theme = data.theme === "dark" ? "dark" : "light";
    showToast(text, kind, theme);
  }

  function clearToasts() {
    var records = toastAll.slice();
    for (var i = 0; i < records.length; i += 1) {
      var record = records[i];
      if (record.timer) { clearTimeout(record.timer); record.timer = null; }
      if (record.exitTimer) { clearTimeout(record.exitTimer); record.exitTimer = null; }
      detachToast(record);
    }
    toastAll = [];
    toastActive = [];
  }

  /* ---- v6 §4 / v9 §11: hint cards ------------------------------------ */
  function hintSignature(desc) {
    if (desc && desc.stats) {
      var s = desc.stats;
      return "stats|" + s.total + "|" + s.ready + "|" + s.missing + "|" +
        s.images + "|" + s.pct + "|" + s.state;
    }
    if (!desc) { return ""; }
    return "lines|" + desc.title + "\n" + (desc.lines || []).join("\n");
  }

  function statsColor(state, palette) {
    if (state === "ready") { return palette.ok; }
    if (state === "missing") { return palette.danger; }
    return palette.warn;
  }

  function textNode(tag, text, css) {
    var el = document.createElement(tag);
    el.textContent = text;
    el.style.cssText = css;
    return el;
  }

  function clearHintLayer() {
    while (hintLayer.firstChild) { hintLayer.removeChild(hintLayer.firstChild); }
  }

  function paintHintLines(desc, palette) {
    /* plain card: auto width, 9/12 padding, title + muted lines */
    setImportant(hintLayer, "width", "max-content");
    setImportant(hintLayer, "max-width", HINT_MAX_WIDTH + "px");
    setImportant(hintLayer, "padding", "9px 12px");

    var titleEl = textNode("div", desc.title, [
      "all: initial !important",
      "display: block !important",
      "font-family: system-ui, -apple-system, 'Segoe UI', sans-serif !important",
      "font-size: 12px !important",
      "font-weight: 700 !important",
      "line-height: 1.4 !important",
      "color: " + palette.fg + " !important",
      "text-align: left !important",
      "white-space: pre-wrap !important",
      "overflow-wrap: break-word !important",
      "margin: 0 !important"
    ].join("; ") + ";");
    hintLayer.appendChild(titleEl);

    var lines = desc.lines || [];
    for (var i = 0; i < lines.length; i += 1) {
      var lineEl = textNode("div", lines[i], [
        "all: initial !important",
        "display: block !important",
        "font-family: system-ui, -apple-system, 'Segoe UI', sans-serif !important",
        "font-size: 11px !important",
        "font-weight: 400 !important",
        "line-height: 1.45 !important",
        "color: " + palette.muted + " !important",
        "text-align: left !important",
        "white-space: pre-wrap !important",
        "overflow-wrap: break-word !important",
        "margin: 2px 0 0 0 !important"
      ].join("; ") + ";");
      hintLayer.appendChild(lineEl);
    }
  }

  /* v9 §11: rich stats card. 280px wide, header ready/total + bar, then
     four values. Every string below is numeric or a fixed literal. */
  function paintHintStats(stats, palette) {
    setImportant(hintLayer, "width", "280px");
    setImportant(hintLayer, "max-width", "280px");
    setImportant(hintLayer, "padding", "12px 13px 12px");

    var card = document.createElement("div");
    card.style.cssText = [
      "all: initial !important",
      "display: block !important",
      "width: 100% !important",
      "box-sizing: border-box !important",
      "margin: 0 !important",
      "padding: 0 !important"
    ].join("; ") + ";";

    var head = document.createElement("div");
    head.style.cssText = [
      "all: initial !important",
      "display: flex !important",
      "align-items: center !important",
      "justify-content: space-between !important",
      "gap: 8px !important",
      "margin: 0 0 7px 0 !important"
    ].join("; ") + ";";

    var verdict = textNode("span", stats.ready + "/" + stats.total + " hazır", [
      "all: initial !important",
      "display: block !important",
      "font-family: system-ui, -apple-system, 'Segoe UI', sans-serif !important",
      "font-size: 12px !important",
      "font-weight: 700 !important",
      "line-height: 1.25 !important",
      "color: " + palette.fg + " !important",
      "text-align: left !important",
      "white-space: nowrap !important",
      "margin: 0 !important"
    ].join("; ") + ";");
    var pctEl = textNode("span", "%" + stats.pct, [
      "all: initial !important",
      "display: block !important",
      "font-family: system-ui, -apple-system, 'Segoe UI', sans-serif !important",
      "font-size: 11px !important",
      "font-weight: 700 !important",
      "line-height: 1.25 !important",
      "color: " + statsColor(stats.state, palette) + " !important",
      "font-variant-numeric: tabular-nums !important",
      "text-align: right !important",
      "margin: 0 !important"
    ].join("; ") + ";");
    head.appendChild(verdict);
    head.appendChild(pctEl);
    card.appendChild(head);

    var track = document.createElement("div");
    track.style.cssText = [
      "all: initial !important",
      "display: block !important",
      "width: 100% !important",
      "height: 6px !important",
      "border-radius: 3px !important",
      "background: " + palette.border + " !important",
      "overflow: hidden !important",
      "margin: 0 !important",
      "padding: 0 !important"
    ].join("; ") + ";";
    var fill = document.createElement("div");
    fill.style.cssText = [
      "all: initial !important",
      "display: block !important",
      "height: 6px !important",
      "width: " + clamp(stats.pct, 0, 100) + "% !important",
      "border-radius: 3px !important",
      "background: " + statsColor(stats.state, palette) + " !important",
      "margin: 0 !important",
      "padding: 0 !important"
    ].join("; ") + ";";
    track.appendChild(fill);
    card.appendChild(track);

    var grid = document.createElement("div");
    grid.style.cssText = [
      "all: initial !important",
      "display: grid !important",
      "grid-template-columns: repeat(4, minmax(0, 1fr)) !important",
      "gap: 8px !important",
      "margin: 11px 0 0 0 !important"
    ].join("; ") + ";";

    var cols = [
      { label: "Toplam", value: stats.total },
      { label: "Hazır", value: stats.ready },
      { label: "Eksik", value: stats.missing },
      { label: "Görsel", value: stats.images }
    ];
    for (var i = 0; i < cols.length; i += 1) {
      var col = document.createElement("div");
      col.style.cssText = [
        "all: initial !important",
        "display: block !important",
        "min-width: 0 !important",
        "margin: 0 !important",
        "padding: 0 !important"
      ].join("; ") + ";";
      var valueEl = textNode("div", String(cols[i].value), [
        "all: initial !important",
        "display: block !important",
        "font-family: system-ui, -apple-system, 'Segoe UI', sans-serif !important",
        "font-size: 15px !important",
        "font-weight: 700 !important",
        "line-height: 1.15 !important",
        "color: " + palette.fg + " !important",
        "font-variant-numeric: tabular-nums !important",
        "text-align: left !important",
        "white-space: nowrap !important",
        "margin: 0 !important"
      ].join("; ") + ";");
      var labelEl = textNode("div", cols[i].label, [
        "all: initial !important",
        "display: block !important",
        "font-family: system-ui, -apple-system, 'Segoe UI', sans-serif !important",
        "font-size: 9px !important",
        "font-weight: 500 !important",
        "line-height: 1.3 !important",
        "color: " + palette.muted + " !important",
        "letter-spacing: .01em !important",
        "text-align: left !important",
        "white-space: nowrap !important",
        "margin: 2px 0 0 0 !important"
      ].join("; ") + ";");
      col.appendChild(valueEl);
      col.appendChild(labelEl);
      grid.appendChild(col);
    }
    card.appendChild(grid);
    hintLayer.appendChild(card);
  }

  function paintHint(desc) {
    if (!hintLayer) { return; }
    var palette = paletteFor(desc.theme);
    clearHintLayer();

    setImportant(hintLayer, "background", palette.bg);
    setImportant(hintLayer, "border-color", palette.border);

    if (desc.stats) {
      paintHintStats(desc.stats, palette);
    } else {
      paintHintLines(desc, palette);
    }
  }

  function applyHintTop(y) {
    if (!hintLayer) { return; }
    hintYNow = isFinite(y) ? y : 0;
    var vh = window.innerHeight || 0;
    var height = 0;
    try {
      height = Math.round(hintLayer.getBoundingClientRect().height || 0);
    } catch (error) {
      height = hintLayer.offsetHeight || 0;
    }
    var top = clamp(DOCK_CARD_TOP + hintYNow, HINT_EDGE, vh - height - HINT_EDGE);
    setImportant(hintLayer, "top", top + "px");
  }

  function showHintNow(desc) {
    if (!hintLayer) { return; }
    hintToken += 1;
    var token = hintToken;
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    hintPending = null;

    paintHint(desc);
    hintKeyNow = hintSignature(desc);
    hintStatsNow = desc.stats || null;
    hintVisible = true;
    /* v7 §4: place the card at the rail anchor before fading it in. It has
       to be laid out (display:block) so its height can be measured. */
    setImportant(hintLayer, "display", "block");
    applyHintTop(desc.y);
    positionOverlays();

    if (reducedMotion()) {
      setImportant(hintLayer, "transition", "none");
      setImportant(hintLayer, "opacity", "1");
      setImportant(hintLayer, "transform", "translateX(0)");
      return;
    }

    setImportant(hintLayer, "transition", "none");
    setImportant(hintLayer, "opacity", "0");
    setImportant(hintLayer, "transform", "translateX(" + hintShift() + "px)");
    requestAnimationFrame(function () {
      if (token !== hintToken || teardown || !hintVisible || !hintLayer) { return; }
      try { void hintLayer.offsetWidth; } catch (error) { /* ignore */ }
      setImportant(hintLayer, "transition",
        "opacity " + HINT_IN_MS + "ms ease, transform " + HINT_IN_MS + "ms ease");
      setImportant(hintLayer, "opacity", "1");
      setImportant(hintLayer, "transform", "translateX(0)");
    });
  }

  function hideHintNow() {
    hintToken += 1;
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    hintPending = null;
    hintVisible = false;
    hintKeyNow = "";
    hintStatsNow = null;
    if (!hintLayer) { return; }
    setImportant(hintLayer, "transition", "none");
    setImportant(hintLayer, "opacity", "0");
    setImportant(hintLayer, "transform", "translateX(" + hintShift() + "px)");
    setImportant(hintLayer, "display", "none");
  }

  function hideHint() {
    if (!hintLayer) { return; }
    hintToken += 1;
    var token = hintToken;
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    hintPending = null;
    var wasVisible = hintVisible;
    hintVisible = false;
    hintKeyNow = "";
    hintStatsNow = null;

    if (!wasVisible || teardown || reducedMotion()) { hideHintNow(); return; }

    setImportant(hintLayer, "transition",
      "opacity " + HINT_OUT_MS + "ms ease, transform " + HINT_OUT_MS + "ms ease");
    setImportant(hintLayer, "opacity", "0");
    setImportant(hintLayer, "transform", "translateX(" + hintShift() + "px)");
    hintTimer = setTimeout(function () {
      hintTimer = null;
      if (token !== hintToken || teardown || hintVisible) { return; }
      setImportant(hintLayer, "display", "none");
    }, HINT_OUT_MS + 20);
  }

  /* One card only: a different visible payload fades the current card out
     (120ms) before swapping content and fading back in (180ms). */
  function setHint(desc) {
    if (!hintLayer) { return; }
    var key = hintSignature(desc);
    if (hintVisible && key === hintKeyNow && desc.y === hintYNow) { return; }

    if (hintVisible) {
      hintToken += 1;
      var token = hintToken;
      if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
      hintPending = desc;
      hintVisible = false;
      hintKeyNow = "";
      hintStatsNow = null;

      if (teardown || reducedMotion()) {
        var instant = hintPending;
        hintPending = null;
        showHintNow(instant);
        return;
      }

      setImportant(hintLayer, "transition",
        "opacity " + HINT_OUT_MS + "ms ease, transform " + HINT_OUT_MS + "ms ease");
      setImportant(hintLayer, "opacity", "0");
      setImportant(hintLayer, "transform", "translateX(" + hintShift() + "px)");
      hintTimer = setTimeout(function () {
        hintTimer = null;
        if (token !== hintToken || teardown || !hintPending) { return; }
        var next = hintPending;
        hintPending = null;
        showHintNow(next);
      }, HINT_OUT_MS + 15);
      return;
    }

    hintPending = null;
    showHintNow(desc);
  }

  function normalizeStats(raw) {
    var total = Number(raw.total);
    if (!isFinite(total) || total < 0) { total = 0; }
    total = Math.floor(total);
    var ready = Number(raw.ready);
    if (!isFinite(ready) || ready < 0) { ready = 0; }
    ready = Math.min(Math.floor(ready), total);
    var missing = Number(raw.missing);
    if (!isFinite(missing) || missing < 0) { missing = Math.max(0, total - ready); }
    missing = Math.min(Math.floor(missing), total);
    var images = Number(raw.images);
    if (!isFinite(images) || images < 0) { images = 0; }
    images = Math.floor(images);
    var pct = Number(raw.pct);
    if (!isFinite(pct)) { pct = total ? Math.round((ready / total) * 100) : 0; }
    pct = Math.round(clamp(pct, 0, 100));
    var state = raw.state;
    if (state !== "ready" && state !== "missing" && state !== "pending") {
      state = ready === total ? "ready" : "pending";
    }
    return {
      total: total, ready: ready, missing: missing,
      images: images, pct: pct, state: state
    };
  }

  function onHintMessage(data) {
    if (data.visible !== true) { hideHint(); return; }
    var theme = data.theme === "dark" ? "dark" : "light";
    var y = typeof data.y === "number" && isFinite(data.y) ? data.y : 0;

    /* v9 §11: the stats ring sends a structured payload instead of lines. */
    if (data.stats && typeof data.stats === "object" && !Array.isArray(data.stats)) {
      setHint({ stats: normalizeStats(data.stats), theme: theme, y: y });
      return;
    }

    var title = cleanText(data.title, HINT_TITLE_MAX);
    if (!title) { return; }

    var lines = [];
    if (Array.isArray(data.lines)) {
      for (var i = 0; i < data.lines.length && lines.length < HINT_LINES_MAX; i += 1) {
        var line = cleanText(data.lines[i], HINT_LINE_MAX);
        if (line) { lines.push(line); }
      }
    }
    setHint({ title: title, lines: lines, theme: theme, y: y });
  }

  /* ---- shell v14: in-panel image preview ----------------------------- */
  /* The panel renders the image itself. This side only receives a
     non-sensitive control message with the desired rectangle and resizes /
     repositions the flyout iframe. No image bytes are accepted or forwarded. */
  function previewViewport() {
    return {
      width: document.documentElement.clientWidth || window.innerWidth || 0,
      height: window.innerHeight || 0
    };
  }

  function clampPreviewSize(value, min, cap) {
    var upper = Math.max(min, cap);
    if (typeof value !== "number" || !isFinite(value) || value <= 0) { return null; }
    return Math.round(clamp(value, min, upper));
  }

  function previewRect(data) {
    var viewport = previewViewport();
    var maxWidth = Math.max(PREVIEW_MIN_WIDTH, viewport.width - (PREVIEW_MARGIN * 2));
    var maxHeight = Math.max(PREVIEW_MIN_HEIGHT, viewport.height - (PREVIEW_MARGIN * 2));
    var width = clampPreviewSize(Number(data.width), PREVIEW_MIN_WIDTH, Math.min(maxWidth, PREVIEW_MAX_WIDTH));
    var height = clampPreviewSize(Number(data.height), PREVIEW_MIN_HEIGHT, Math.min(maxHeight, PREVIEW_MAX_HEIGHT));
    if (width == null) { width = Math.min(maxWidth, PREVIEW_MAX_WIDTH); }
    if (height == null) { height = Math.min(maxHeight, PREVIEW_MAX_HEIGHT); }
    width = Math.round(clamp(width, PREVIEW_MIN_WIDTH, maxWidth));
    height = Math.round(clamp(height, PREVIEW_MIN_HEIGHT, maxHeight));

    var x = Number(data.x);
    var y = Number(data.y);
    if (!isFinite(x)) { x = Math.round((viewport.width - width) / 2); }
    if (!isFinite(y)) { y = Math.round((viewport.height - height) / 2); }
    x = Math.round(clamp(x, PREVIEW_MARGIN, Math.max(PREVIEW_MARGIN, viewport.width - width - PREVIEW_MARGIN)));
    y = Math.round(clamp(y, PREVIEW_MARGIN, Math.max(PREVIEW_MARGIN, viewport.height - height - PREVIEW_MARGIN)));
    return { width: width, height: height, x: x, y: y };
  }

  function applyFlyoutPreview(data) {
    if (teardown || !flyoutFrame || !isOpen) { return; }
    var rect = previewRect(data || {});
    flyoutPreviewOpen = true;
    flyoutPreviewData = data || {};
    hideArrow();
    lastFlyoutMax = -1;
    setImportant(flyoutFrame, "transition", "none");
    setImportant(flyoutFrame, "opacity", "1");
    setImportant(flyoutFrame, "transform", "none");
    setImportant(flyoutFrame, "display", "block");
    setImportant(flyoutFrame, "left", rect.x + "px");
    setImportant(flyoutFrame, "right", "auto");
    setImportant(flyoutFrame, "top", rect.y + "px");
    setImportant(flyoutFrame, "width", rect.width + "px");
    setImportant(flyoutFrame, "height", rect.height + "px");
    setImportant(flyoutFrame, "z-index", String(PREVIEW_Z));
  }

  function restoreFlyoutPreview() {
    if (!flyoutPreviewOpen) { return; }
    flyoutPreviewOpen = false;
    flyoutPreviewData = null;
    if (!flyoutFrame) { return; }
    setImportant(flyoutFrame, "z-index", "auto");
    setImportant(flyoutFrame, "transition", "none");
    if (!isOpen) {
      setImportant(flyoutFrame, "display", "none");
      return;
    }
    positionFlyoutFrame();
    placeFlyout(lastCardHeight);
    lastFlyoutMax = -1;
    sendFlyoutMax();
    updateArrow();
  }

  function onFlyoutPreviewMessage(data) {
    if (!data || data.open !== true) { restoreFlyoutPreview(); return; }
    applyFlyoutPreview(data);
  }

  /* ---- v7 §1 / v9 §17: host launcher + one-shot callout -------------- */
  function launcherShadow(palette, hover) {
    if (launcherTheme === "dark") {
      return hover ? "0 12px 28px rgba(0,0,0,.58)" : "0 6px 18px rgba(0,0,0,.42)";
    }
    return hover ? "0 10px 24px rgba(32,28,20,.20)" : "0 6px 18px rgba(32,28,20,.14)";
  }

  function setLauncherVisible(show) {
    launcherShown = !!show;
    if (!launcherEl) { return; }
    setImportant(launcherEl, "display", show ? "grid" : "none");
    setImportant(launcherEl, "opacity", show ? "1" : "0");
    if (!show) {
      launcherHover = false;
      setImportant(launcherEl, "transform", "scale(.9)");
    } else {
      setImportant(launcherEl, "transform", launcherHover ? "translateY(-1px) scale(1.06)" : "none");
    }
    if (launcherPulseAnimation) {
      try { show ? launcherPulseAnimation.play() : launcherPulseAnimation.pause(); } catch (error) { /* ignore */ }
    }
  }

  /* v9 §19: mirror the fixed bottom corner based on the panel side. */
  function positionCorner(el, inset) {
    if (!el) { return; }
    var value = inset + "px";
    if (side === "right") {
      setImportant(el, "right", value);
      setImportant(el, "left", "auto");
    } else {
      setImportant(el, "left", value);
      setImportant(el, "right", "auto");
    }
  }

  function positionLauncher() {
    positionCorner(launcherEl, LAUNCHER_RIGHT);
  }

  function positionCallout() {
    positionCorner(calloutEl, CALLOUT_RIGHT);
  }

  /* v10 §21: arrow border + direction; the palette comes from the panel.
     The clip keeps only the half that faces the rail, so the inner half is
     never visible as a full diamond. Right side: top/right edges = ">";
     left side: left/bottom edges = "<". */
  function paintArrow() {
    if (!arrowEl) { return; }
    var palette = paletteFor(launcherTheme);
    /* A real CSS triangle: base on the card edge, tip in the 12px gap.
       No rotated square/clip path, so it cannot read as a diamond. */
    setImportant(arrowEl, "background", "transparent");
    setImportant(arrowEl, "width", "0");
    setImportant(arrowEl, "height", "0");
    setImportant(arrowEl, "clip-path", "none");
    setImportant(arrowEl, "-webkit-clip-path", "none");
    setImportant(arrowEl, "transform", "none");
    setImportant(arrowEl, "border-top", "7px solid transparent");
    setImportant(arrowEl, "border-bottom", "7px solid transparent");
    setImportant(arrowEl, "border-left", "0");
    setImportant(arrowEl, "border-right", "0");
    if (side === "right") {
      setImportant(arrowEl, "border-left", "9px solid " + palette.bg);
    } else {
      setImportant(arrowEl, "border-right", "9px solid " + palette.bg);
    }
  }

  function paintLauncher() {
    if (!launcherEl) { return; }
    var palette = paletteFor(launcherTheme);
    setImportant(launcherEl, "background", palette.bg);
    setImportant(launcherEl, "border", "1px solid " + palette.border);
    setImportant(launcherEl, "color", palette.accent);
    setImportant(launcherEl, "box-shadow", launcherShadow(palette, launcherHover));
    launcherEl.setAttribute("aria-label", launcherOpenLabel);
    /* v9 §10: no native tooltip on the host launcher. */
    try { launcherEl.removeAttribute("title"); } catch (error) { /* ignore */ }
    if (launcherPulseEl) { setImportant(launcherPulseEl, "border-color", palette.accent); }
    if (launcherMarkEls) {
      launcherMarkEls.tile.setAttribute("fill", palette.accent);
      launcherMarkEls.line1.setAttribute("fill", palette.bg);
      launcherMarkEls.line2.setAttribute("fill", palette.bg);
      launcherMarkEls.line3.setAttribute("fill", palette.bg);
      launcherMarkEls.badge.setAttribute("fill", palette.bg);
      launcherMarkEls.check.setAttribute("stroke", palette.sage);
    }
  }

  function paintCallout() {
    if (!calloutEl) { return; }
    var palette = paletteFor(launcherTheme);
    setImportant(calloutEl, "background", palette.bg);
    setImportant(calloutEl, "border-color", palette.border);
    setImportant(calloutEl, "color", palette.fg);
    if (calloutTitleEl) {
      calloutTitleEl.textContent = launcherCalloutTitle;
      setImportant(calloutTitleEl, "color", palette.fg);
    }
    if (calloutHintEl) {
      calloutHintEl.textContent = launcherCalloutHint;
      setImportant(calloutHintEl, "color", palette.muted);
    }
    /* v9 §17: subtle pointer toward the launcher. */
    if (calloutArrowEl) {
      setImportant(calloutArrowEl, "background", palette.bg);
      setImportant(calloutArrowEl, "border", "0");
      if (side === "right") {
        setImportant(calloutArrowEl, "right", "-4px");
        setImportant(calloutArrowEl, "left", "auto");
        setImportant(calloutArrowEl, "border-right", "1px solid " + palette.border);
        setImportant(calloutArrowEl, "border-top", "1px solid " + palette.border);
      } else {
        setImportant(calloutArrowEl, "left", "-4px");
        setImportant(calloutArrowEl, "right", "auto");
        setImportant(calloutArrowEl, "border-left", "1px solid " + palette.border);
        setImportant(calloutArrowEl, "border-bottom", "1px solid " + palette.border);
      }
    }
    calloutEl.setAttribute("aria-label",
      launcherCalloutTitle + (launcherCalloutHint ? " — " + launcherCalloutHint : ""));
    /* v9 §10: no native tooltip on the host callout. */
    try { calloutEl.removeAttribute("title"); } catch (error) { /* ignore */ }
  }

  function clearCalloutTimers() {
    if (calloutShowTimer) { clearTimeout(calloutShowTimer); calloutShowTimer = null; }
    if (calloutLifeTimer) { clearTimeout(calloutLifeTimer); calloutLifeTimer = null; }
    if (calloutFadeTimer) { clearTimeout(calloutFadeTimer); calloutFadeTimer = null; }
  }

  function hideCallout(animate) {
    clearCalloutTimers();
    if (!calloutEl) { calloutVisible = false; return; }
    if (!calloutVisible) {
      setImportant(calloutEl, "display", "none");
      return;
    }
    calloutVisible = false;
    if (!animate || reducedMotion()) {
      setImportant(calloutEl, "display", "none");
      return;
    }
    setImportant(calloutEl, "transition",
      "opacity " + CALLOUT_FADE_MS + "ms ease, transform " + CALLOUT_FADE_MS + "ms ease");
    setImportant(calloutEl, "opacity", "0");
    /* v9 §19: hide back toward the panel side (reverse of the entry slide). */
    setImportant(calloutEl, "transform", "translateX(" + calloutShift() + "px)");
    calloutFadeTimer = setTimeout(function () {
      calloutFadeTimer = null;
      if (teardown || calloutVisible || !calloutEl) { return; }
      setImportant(calloutEl, "display", "none");
    }, CALLOUT_FADE_MS + 20);
  }

  function showCallout() {
    if (!calloutEl || calloutVisible || teardown) { return; }
    calloutVisible = true;
    paintCallout();
    setImportant(calloutEl, "display", "flex");
    setImportant(calloutEl, "transition", "none");
    setImportant(calloutEl, "opacity", "0");
    /* v9 §19: entry slides from the panel side toward the launcher. */
    setImportant(calloutEl, "transform", "translateX(" + calloutShift() + "px)");

    if (reducedMotion()) {
      setImportant(calloutEl, "opacity", "1");
      setImportant(calloutEl, "transform", "translateX(0)");
    } else {
      requestAnimationFrame(function () {
        if (teardown || !calloutVisible || !calloutEl) { return; }
        try { void calloutEl.offsetWidth; } catch (error) { /* ignore */ }
        setImportant(calloutEl, "transition",
          "opacity " + CALLOUT_FADE_MS + "ms ease, transform " + CALLOUT_FADE_MS + "ms ease");
        setImportant(calloutEl, "opacity", "1");
        setImportant(calloutEl, "transform", "translateX(0)");
      });
    }

    calloutLifeTimer = setTimeout(function () {
      calloutLifeTimer = null;
      hideCallout(true);
    }, CALLOUT_LIFE_MS);
  }

  function scheduleCallout() {
    if (!launcherUiReady || pinned || calloutShown || teardown) { return; }
    if (dockState !== "collapsed" || dockFrameVisible) { return; }
    calloutShown = true;
    calloutShowTimer = setTimeout(function () {
      calloutShowTimer = null;
      if (teardown || pinned || dockState !== "collapsed" || !launcherShown) { return; }
      showCallout();
    }, CALLOUT_DELAY_MS);
  }

  function updateLauncherVisibility() {
    /* v9 §6: a pinned panel still shows the host launcher while collapsed.
       Pinning only suppresses auto-hide (and the one-shot callout). */
    var show = launcherUiReady &&
      dockState === "collapsed" && !dockFrameVisible;
    setLauncherVisible(show);
    if (!show) { hideCallout(false); }
  }

  /* v8 §8 + follow-up: panel and host overlays become invisible while the
     page picker/crop overlay is active. Only `visibility` is touched —
     display states are preserved so restoring is a pure visibility flip.
     A bounded fallback restores the panel if the picker result/abort is
     missed; `RL_PANEL_VISIBILITY false` still restores immediately. */
  function clearPanelHideFallback() {
    if (panelHideTimer) { clearTimeout(panelHideTimer); panelHideTimer = null; }
  }

  /* Escape must reach the page picker's document handler: drop focus from
     the panel iframe back to the top page. */
  function focusPageForPicker() {
    try {
      var active = document.activeElement;
      if (active && active !== document.body && typeof active.blur === "function") {
        active.blur();
      }
    } catch (error) { /* ignore */ }
    try { window.focus(); } catch (error) { /* ignore */ }
  }

  function setPanelHidden(hidden) {
    panelHidden = hidden === true;
    if (panelHidden) {
      clearPanelHideFallback();
      panelHideTimer = setTimeout(function () {
        panelHideTimer = null;
        if (teardown || !panelHidden) { return; }
        /* missed pick/capture result: never leave the panel invisible */
        setPanelHidden(false);
      }, PANEL_HIDE_FALLBACK_MS);
      focusPageForPicker();
    } else {
      clearPanelHideFallback();
    }
    var value = panelHidden ? "hidden" : "visible";
    var els = [dockFrame, flyoutFrame, toastLayer, hintLayer, launcherEl, calloutEl, arrowEl];
    for (var i = 0; i < els.length; i += 1) {
      setImportant(els[i], "visibility", value);
    }
    if (!panelHidden) { updateArrow(); }
  }

  /* v7 §1: the host launcher/callout are the only closed-state UI. Clicking
     either slides the dock frame in and asks the panel to open itself. */
  function openPanelFromHost() {
    if (!dockFrame || teardown) { return; }
    if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null; }
    showDockFrame();
    hideCallout(false);
    pendingHostOpen = true;
    hostOpenTries = 0;
    postHostOpen();
  }

  function postHostOpen() {
    if (!dockFrame || teardown || !pendingHostOpen) { return; }
    postToDock("RL_HOST_OPEN");
    hostOpenTries += 1;
    if (hostOpenRetryTimer) { clearTimeout(hostOpenRetryTimer); hostOpenRetryTimer = null; }
    if (hostOpenTries < 6) {
      hostOpenRetryTimer = setTimeout(function () {
        hostOpenRetryTimer = null;
        postHostOpen();
      }, 450);
    } else {
      /* the dock never answered: do not leave an empty frame covering the page */
      pendingHostOpen = false;
      if (dockState === "open") {
        dockState = "collapsed";
        hideDockFrame();
      }
    }
  }

  function clearHostOpenRetry() {
    pendingHostOpen = false;
    hostOpenTries = 0;
    if (hostOpenRetryTimer) { clearTimeout(hostOpenRetryTimer); hostOpenRetryTimer = null; }
  }

  function onLauncherUiMessage(data) {
    var first = !launcherUiReady;
    launcherTheme = data.theme === "dark" ? "dark" : "light";
    var label = cleanText(data.openLabel, HINT_TITLE_MAX);
    if (label) { launcherOpenLabel = label; }
    var title = cleanText(data.calloutTitle, HINT_TITLE_MAX);
    if (title) { launcherCalloutTitle = title; }
    launcherCalloutHint = cleanText(data.calloutHint, HINT_LINE_MAX);
    pinned = data.pinned === true;
    launcherUiReady = true;

    paintLauncher();
    paintCallout();
    paintArrow();
    updateLauncherVisibility();
    /* one bubble per page load, only from the first boot message (§1) */
    if (first && !pinned) { scheduleCallout(); }
  }

  function createLauncherElements() {
    if (!hostEl) { return; }
    if (!launcherEl) {
      launcherEl = document.createElement("button");
      launcherEl.id = "rl-launcher";
      launcherEl.type = "button";
      launcherEl.style.cssText = LAUNCHER_CSS;

      launcherPulseEl = document.createElement("span");
      launcherPulseEl.style.cssText = [
        "all: initial !important",
        "position: absolute !important",
        "inset: -4px !important",
        "box-sizing: border-box !important",
        "border: 1px solid " + PALETTE.light.accent + " !important",
        "border-radius: 50% !important",
        "opacity: 0 !important",
        "transform: scale(.92) !important",
        "display: block !important",
        "margin: 0 !important",
        "padding: 0 !important",
        "pointer-events: none !important"
      ].join("; ") + ";";
      launcherEl.appendChild(launcherPulseEl);

      var ns = "http://www.w3.org/2000/svg";
      var mark = document.createElementNS(ns, "svg");
      mark.setAttribute("viewBox", "0 0 64 64");
      mark.setAttribute("width", String(LAUNCHER_MARK_SIZE));
      mark.setAttribute("height", String(LAUNCHER_MARK_SIZE));
      mark.setAttribute("aria-hidden", "true");
      mark.setAttribute("focusable", "false");
      mark.style.cssText =
        "display:block !important;width:" + LAUNCHER_MARK_SIZE + "px !important;" +
        "height:" + LAUNCHER_MARK_SIZE + "px !important;pointer-events:none !important";

      function markNode(tag, attributes) {
        var node = document.createElementNS(ns, tag);
        for (var key in attributes) {
          if (Object.prototype.hasOwnProperty.call(attributes, key)) {
            node.setAttribute(key, attributes[key]);
          }
        }
        return node;
      }

      var tile = markNode("rect", { x: "2", y: "2", width: "60", height: "60", rx: "18", fill: PALETTE.light.accent });
      var line1 = markNode("rect", { x: "14", y: "17", width: "24", height: "5", rx: "2.5", fill: PALETTE.light.bg });
      var line2 = markNode("rect", { x: "14", y: "26.5", width: "30", height: "5", rx: "2.5", fill: PALETTE.light.bg });
      var line3 = markNode("rect", { x: "14", y: "36", width: "15", height: "5", rx: "2.5", fill: PALETTE.light.bg });
      var badge = markNode("rect", { x: "38", y: "37", width: "20", height: "20", rx: "6.5", fill: PALETTE.light.bg });
      var check = markNode("path", {
        d: "M42.4 47.1l3.5 3.5 7.1-7.5",
        fill: "none",
        stroke: PALETTE.light.sage,
        "stroke-width": "3.8",
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
      });
      mark.appendChild(tile);
      mark.appendChild(line1);
      mark.appendChild(line2);
      mark.appendChild(line3);
      mark.appendChild(badge);
      mark.appendChild(check);
      launcherMarkEls = { tile: tile, line1: line1, line2: line2, line3: line3, badge: badge, check: check };
      launcherMarkEl = mark;
      launcherEl.appendChild(mark);

      if (!reducedMotion()) {
        try {
          launcherPulseAnimation = launcherPulseEl.animate([
            { opacity: 0, transform: "scale(.92)" },
            { opacity: 0, transform: "scale(.92)", offset: 0.78 },
            { opacity: 0.55, transform: "scale(1.02)", offset: 0.85 },
            { opacity: 0, transform: "scale(1.16)", offset: 0.94 },
            { opacity: 0, transform: "scale(.92)", offset: 1 }
          ], { duration: 8000, iterations: Infinity, easing: "ease-out" });
        } catch (error) {
          launcherPulseAnimation = null;
        }
      }

      launcherEl.addEventListener("click", function () { openPanelFromHost(); });
      launcherEl.addEventListener("pointerenter", function () {
        if (!launcherShown) { return; }
        launcherHover = true;
        setImportant(launcherEl, "transform", "translateY(-1px) scale(1.06)");
        setImportant(launcherEl, "box-shadow", launcherShadow(paletteFor(launcherTheme), true));
      });
      launcherEl.addEventListener("pointerleave", function () {
        launcherHover = false;
        if (launcherShown) {
          setImportant(launcherEl, "transform", "none");
          setImportant(launcherEl, "box-shadow", launcherShadow(paletteFor(launcherTheme), false));
        }
      });
      launcherEl.addEventListener("focus", function () {
        setImportant(launcherEl, "outline", "2px solid " + paletteFor(launcherTheme).accent);
        setImportant(launcherEl, "outline-offset", "2px");
      });
      launcherEl.addEventListener("blur", function () {
        setImportant(launcherEl, "outline", "none");
        setImportant(launcherEl, "outline-offset", "0");
      });
      hostEl.appendChild(launcherEl);
    }
    if (!calloutEl) {
      calloutEl = document.createElement("div");
      calloutEl.id = "rl-callout";
      calloutEl.setAttribute("role", "button");
      calloutEl.setAttribute("tabindex", "0");
      calloutEl.style.cssText = CALLOUT_CSS;

      calloutTitleEl = document.createElement("div");
      calloutTitleEl.style.cssText = [
        "all: initial !important",
        "display: block !important",
        "font-family: system-ui, -apple-system, 'Segoe UI', sans-serif !important",
        "font-size: 11px !important",
        "font-weight: 700 !important",
        "line-height: 1.25 !important",
        "letter-spacing: -.01em !important",
        "color: " + PALETTE.light.fg + " !important",
        "white-space: nowrap !important",
        "overflow: hidden !important",
        "text-overflow: ellipsis !important",
        "margin: 0 !important",
        "pointer-events: none !important"
      ].join("; ") + ";";

      calloutHintEl = document.createElement("div");
      calloutHintEl.style.cssText = [
        "all: initial !important",
        "display: block !important",
        "font-family: system-ui, -apple-system, 'Segoe UI', sans-serif !important",
        "font-size: 9.5px !important",
        "font-weight: 400 !important",
        "line-height: 1.35 !important",
        "color: " + PALETTE.light.muted + " !important",
        "white-space: normal !important",
        "overflow-wrap: break-word !important",
        "margin: 0 !important",
        "pointer-events: none !important"
      ].join("; ") + ";";

      calloutArrowEl = document.createElement("span");
      calloutArrowEl.style.cssText = [
        "all: initial !important",
        "position: absolute !important",
        "top: 50% !important",
        "width: 8px !important",
        "height: 8px !important",
        "margin-top: -4px !important",
        "background: " + PALETTE.light.bg + " !important",
        "border: 0 !important",
        "border-radius: 1px !important",
        "transform: rotate(45deg) !important",
        "pointer-events: none !important",
        "display: block !important",
        "padding: 0 !important"
      ].join("; ") + ";";

      calloutEl.appendChild(calloutTitleEl);
      calloutEl.appendChild(calloutHintEl);
      calloutEl.appendChild(calloutArrowEl);
      calloutEl.addEventListener("click", function () { openPanelFromHost(); });
      calloutEl.addEventListener("keydown", function (event) {
        if (!event) { return; }
        if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
          event.preventDefault();
          openPanelFromHost();
        }
      });
      hostEl.appendChild(calloutEl);
    }
    paintLauncher();
    paintCallout();
  }

  function isPageAllowed() {
    var protocol = location.protocol;
    if (protocol !== "http:" && protocol !== "https:" && protocol !== "file:") { return false; }
    if (document.contentType === "application/pdf") { return false; }
    var hostname = location.hostname;
    if (hostname === "chromewebstore.google.com") { return false; }
    if (hostname === "chrome.google.com" && /^\/webstore(\/|$)/.test(location.pathname)) { return false; }
    return true;
  }

  /* ---- v9 §19: side state + persistence ------------------------------ */
  function normalizeSide(value) {
    return value === "left" ? "left" : "right";
  }

  function saveStoredSide(value) {
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ "rl-side": value });
      }
    } catch (error) { /* ignore */ }
  }

  /* Boot read. The panel also reads rl-side and sends RL_PANEL_SIDE; this
     keeps the host correct even before the dock iframe finishes booting. */
  function readStoredSide(callback) {
    var done = false;
    var finish = function (value) {
      if (done) { return; }
      done = true;
      /* a panel message that already landed is authoritative */
      if (sideReady) { return; }
      callback(normalizeSide(value));
    };
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(["rl-side"], function (values) {
          finish(values && values["rl-side"]);
        });
        setTimeout(function () { finish("right"); }, 400);
        return;
      }
    } catch (error) { /* fall through */ }
    finish("right");
  }

  /* v10 §19: rl-side is mirrored to every tab. The host never re-writes
     storage here (persist:false) and ignores values it already has, so a
     write from this tab cannot echo back into a loop. */
  function onStorageChanged(changes, areaName) {
    if (teardown) { return; }
    if (areaName && areaName !== "local") { return; }
    if (!changes || !Object.prototype.hasOwnProperty.call(changes, "rl-side")) { return; }
    var change = changes["rl-side"];
    if (!change) { return; }
    var next = normalizeSide(change.newValue);
    if (next === side) { return; }
    sideReady = true;
    commitSide(next, { persist: false, notify: true });
  }

  function addStorageListener() {
    if (storageListenerOn) { return; }
    try {
      if (typeof chrome !== "undefined" && chrome.storage &&
          chrome.storage.onChanged && chrome.storage.onChanged.addListener) {
        chrome.storage.onChanged.addListener(onStorageChanged);
        storageListenerOn = true;
      }
    } catch (error) { /* ignore */ }
  }

  function removeStorageListener() {
    if (!storageListenerOn) { return; }
    storageListenerOn = false;
    try {
      if (typeof chrome !== "undefined" && chrome.storage &&
          chrome.storage.onChanged && chrome.storage.onChanged.removeListener) {
        chrome.storage.onChanged.removeListener(onStorageChanged);
      }
    } catch (error) { /* ignore */ }
  }

  function dockLeftForOffset(value, forSide) {
    var w = window.innerWidth || 0;
    var s = forSide || side;
    if (s === "right") {
      return w - DOCK_RIGHT_OPEN - DOCK_WIDTH_OPEN - value;
    }
    return DOCK_RIGHT_OPEN + value;
  }

  function offsetFromLeft(left, forSide) {
    var w = window.innerWidth || 0;
    var s = forSide || side;
    if (s === "right") {
      return w - DOCK_RIGHT_OPEN - DOCK_WIDTH_OPEN - left;
    }
    return left - DOCK_RIGHT_OPEN;
  }

  /* The side is valid while the flyout still fits between the rail and the
     opposite viewport edge. Crossing these thresholds flips it. */
  function sideForLeft(left) {
    var w = window.innerWidth || 0;
    if (side === "right" && left < SIDE_SWITCH_TO_LEFT) { return "left"; }
    if (side === "left" && left > w - SIDE_SWITCH_TO_RIGHT) { return "right"; }
    return side;
  }

  function positionFlyoutFrame() {
    if (!flyoutFrame || flyoutPreviewOpen) { return; }
    var inset = FLYOUT_RIGHT + dragOffset;
    setImportant(flyoutFrame, "width", FLYOUT_WIDTH + "px");
    if (side === "right") {
      setImportant(flyoutFrame, "right", inset + "px");
      setImportant(flyoutFrame, "left", "auto");
    } else {
      setImportant(flyoutFrame, "left", inset + "px");
      setImportant(flyoutFrame, "right", "auto");
    }
  }

  /* v10 §21: the arrow is attached to the flyout card edge, half of it
     protruding into the 12px gap and pointing at the active rail item.
     `arrowY` is the offset inside the flyout card; when the panel does not
     send one it is derived from the rail anchor so the tip still lands on
     the item's vertical centre. Hidden while no section is open. */
  function arrowOffset() {
    if (typeof sectionArrowY === "number" && isFinite(sectionArrowY)) {
      return sectionArrowY;
    }
    return DOCK_CARD_TOP + anchorTop + (anchorHeight / 2) - flyoutTop;
  }

  function updateArrow() {
    if (!arrowEl) { return; }
    if (!isOpen || !flyoutFrame || panelHidden || flyoutPreviewOpen) { hideArrow(); return; }
    var center = flyoutTop + arrowOffset();
    var top = center - 7;
    var inset = FLYOUT_RIGHT + dragOffset;
    /* Base exactly on the flyout edge; the triangle extends into the gap.
       The frames are `position: fixed`, so their `right`/`left` offsets are
       measured against the layout viewport (documentElement.clientWidth),
       *not* window.innerWidth, which also counts the classic scrollbar. On
       the right side the two differ by the scrollbar width, so using
       innerWidth floated the arrow off the card edge and over the rail. */
    var viewportWidth = document.documentElement.clientWidth || window.innerWidth || 0;
    var left = side === "right"
      ? viewportWidth - inset
      : inset - 9;
    setImportant(arrowEl, "top", top + "px");
    setImportant(arrowEl, "left", left + "px");
    setImportant(arrowEl, "right", "auto");
    setImportant(arrowEl, "display", "block");
    paintArrow();
  }

  function hideArrow() {
    if (!arrowEl) { return; }
    setImportant(arrowEl, "display", "none");
  }

  /* Apply a side transition (settings, panel message, or drag crossing).
     `keepDock` is used mid-drag: applyDockLeft owns the absolute left. */
  function commitSide(next, opts) {
    opts = opts || {};
    var normalized = normalizeSide(next);
    var changed = normalized !== side;
    side = normalized;
    if (opts.persist !== false) { saveStoredSide(side); }
    if (opts.notify !== false) { postToDock("RL_SIDE", { side: side }); }

    if (!opts.keepDock && !dragShield) {
      dragOffset = clamp(dragOffset, 0, maxOffset());
      applyDockGeometry();
    } else {
      positionFlyoutFrame();
    }
    positionOverlays();
    positionLauncher();
    positionCallout();
    paintLauncher();
    paintCallout();
    paintArrow();
    updateArrow();
    return changed;
  }

  /* ---- v4 §2 / v9 §18: horizontal drag ------------------------------- */
  /* The rail floats over the page (v4 §1): no page padding, no background
     band, no fixed-element shifting. v9 tracks an absolute `left` while
     dragging, then stores the distance from the active side edge. */

  function maxOffset() {
    var viewportWidth = window.innerWidth || 0;
    /* default left edge is 12; the rail may travel to innerWidth - 112 */
    return Math.max(0, viewportWidth - (DOCK_RIGHT_OPEN * 2 + DOCK_WIDTH_OPEN));
  }

  /* Instant geometry (mount, resize, drag, reset). v10 §20: any drag/reset
     change clears the frame transition so it never lags behind. */
  function applyDockBaseGeometry() {
    if (!dockFrame) { return; }
    setImportant(dockFrame, "top", DOCK_TOP_OPEN + "px");
    setImportant(dockFrame, "width", DOCK_WIDTH_OPEN + "px");
    setImportant(dockFrame, "height", DOCK_HEIGHT_OPEN);
    setImportant(dockFrame, "border-radius", DOCK_RADIUS_OPEN);
  }

  function dockEdgeProperty() {
    return side === "right" ? "right" : "left";
  }

  function setDockEdge(value) {
    if (!dockFrame) { return; }
    if (side === "right") {
      setImportant(dockFrame, "right", value + "px");
      setImportant(dockFrame, "left", "auto");
    } else {
      setImportant(dockFrame, "left", value + "px");
      setImportant(dockFrame, "right", "auto");
    }
  }

  function applyDockGeometry() {
    if (!dockFrame) { return; }
    cancelDockAnim();
    dragOffset = clamp(dragOffset, 0, maxOffset());
    setImportant(dockFrame, "transition", "none");
    applyDockBaseGeometry();
    setDockEdge(DOCK_RIGHT_OPEN + dragOffset);
    positionFlyoutFrame();
    /* A resize/side commit must not cancel a pending hide and leave the
       frame parked on screen while the panel is collapsed. */
    if (dockState !== "open" && dockFrameVisible) {
      hideDockFrame();
    }
  }

  /* During a drag the absolute left is the source of truth; side flips at
     the fit thresholds (384 / innerWidth - 484, v10 §23). */
  function applyDockLeft(nextLeft) {
    if (!dockFrame) { return; }
    var w = window.innerWidth || 0;
    var left = clamp(nextLeft, DRAG_MIN_LEFT, w - DRAG_MAX_RIGHT_MARGIN);
    var nextSide = sideForLeft(left);
    if (nextSide !== side) {
      commitSide(nextSide, { keepDock: true, persist: true, notify: true });
    }
    dragOffset = clamp(offsetFromLeft(left), 0, maxOffset());
    setImportant(dockFrame, "left", left + "px");
    setImportant(dockFrame, "right", "auto");
    applyDockBaseGeometry();
    positionFlyoutFrame();
    positionOverlays();
    positionLauncher();
    positionCallout();
    paintArrow();
    updateArrow();
  }

  /* ---- v10 §20: dock frame slide -------------------------------------- */
  function cancelDockAnim() {
    dockAnimToken += 1;
    dockAnimating = false;
    dockAnimMode = null;
    if (dockAnimTimer) { clearTimeout(dockAnimTimer); dockAnimTimer = null; }
  }

  /* Open: the frame appears at the off-screen edge, then slides to the
     open edge over 220ms. An echo of the same open state while the slide
     is in flight is ignored (no restart); a settled open re-applies the
     instant geometry. */
  function showDockFrame() {
    if (!dockFrame) { return; }
    if (dockState === "open" && dockFrameVisible && dockAnimMode !== "out") {
      if (dockAnimMode === "in") { return; }
      dragOffset = 0;
      applyDockGeometry();
      updateLauncherVisibility();
      return;
    }

    cancelDockAnim();
    dockState = "open";
    dockFrameVisible = true;
    dragOffset = 0;
    positionFlyoutFrame();

    setImportant(dockFrame, "display", "block");
    setImportant(dockFrame, "transition", "none");
    applyDockBaseGeometry();

    if (reducedMotion()) {
      setDockEdge(DOCK_RIGHT_OPEN);
      setImportant(dockFrame, "transition", "none");
      updateLauncherVisibility();
      return;
    }

    var token = dockAnimToken;
    setDockEdge(-DOCK_SLIDE_OFF);
    dockAnimating = true;
    dockAnimMode = "in";
    requestAnimationFrame(function () {
      if (token !== dockAnimToken || teardown || dockState !== "open") { return; }
      try { void dockFrame.offsetWidth; } catch (error) { /* ignore */ }
      setImportant(dockFrame, "transition",
        dockEdgeProperty() + " " + DOCK_FRAME_MS + "ms " + EASE);
      setDockEdge(DOCK_RIGHT_OPEN + dragOffset);
    });
    dockAnimTimer = setTimeout(function () {
      dockAnimTimer = null;
      if (token !== dockAnimToken || teardown) { return; }
      dockAnimating = false;
      dockAnimMode = null;
      setImportant(dockFrame, "transition", "none");
      setDockEdge(DOCK_RIGHT_OPEN + dragOffset);
      updateArrow();
    }, DOCK_FRAME_MS + 40);
    updateLauncherVisibility();
  }

  /* Close: slide to the off-screen edge, then `display:none` and bring the
     host launcher back (pinned included, v9 §6). */
  function hideDockFrame() {
    if (!dockFrame || !dockFrameVisible) {
      updateLauncherVisibility();
      return;
    }
    /* Duplicate collapse echoes must not restart the slide-out. */
    if (dockAnimMode === "out" && dockAnimating) { return; }
    cancelDockAnim();
    var token = dockAnimToken;
    var finish = function () {
      if (token !== dockAnimToken || teardown) { return; }
      dockAnimating = false;
      dockAnimMode = null;
      setImportant(dockFrame, "transition", "none");
      setImportant(dockFrame, "display", "none");
      /* Hidden frame: give the rail back its default edge so overlay
         geometry and the next open are deterministic. */
      dragOffset = 0;
      setDockEdge(DOCK_RIGHT_OPEN);
      positionFlyoutFrame();
      positionOverlays();
      dockFrameVisible = false;
      updateArrow();
      updateLauncherVisibility();
    };

    if (reducedMotion()) { finish(); return; }

    dockAnimating = true;
    dockAnimMode = "out";
    setImportant(dockFrame, "transition",
      dockEdgeProperty() + " " + DOCK_FRAME_MS + "ms " + EASE);
    setDockEdge(-DOCK_SLIDE_OFF);
    dockAnimTimer = setTimeout(finish, DOCK_FRAME_MS);
  }

  function applyDockOffset(value) {
    var numeric = typeof value === "number" ? value : Number(value);
    if (!isFinite(numeric)) { numeric = 0; }
    dragOffset = clamp(numeric, 0, maxOffset());
    applyDockGeometry();
    positionOverlays();
    positionLauncher();
    positionCallout();
    paintArrow();
    updateArrow();
  }

  function settleFrameTransitions() {
    if (dockFrame) { setImportant(dockFrame, "transition", "none"); }
    if (flyoutFrame) { setImportant(flyoutFrame, "transition", "none"); }
  }

  function cancelReset() {
    resetToken += 1;
    if (resetTimer) { clearTimeout(resetTimer); resetTimer = null; }
    if (resetRaf) { cancelAnimationFrame(resetRaf); resetRaf = null; }
  }

  /* Animate `dragOffset` to `target` with a JS interpolation. The CSS
     transition was unreliable while the side/left geometry was rewritten. */
  function animateDockOffset(target, duration) {
    cancelReset();
    var to = clamp(target, 0, maxOffset());
    if (dragOffset === to || reducedMotion()) {
      applyDockOffset(to);
      settleFrameTransitions();
      return;
    }
    settleFrameTransitions();
    var from = dragOffset;
    var started = performance.now();
    var token = resetToken;
    var ease = function (t) { return 1 - Math.pow(1 - t, 3); };
    var step = function (now) {
      if (token !== resetToken) { return; }
      var p = Math.min(1, (now - started) / duration);
      applyDockOffset(from + (to - from) * ease(p));
      if (p < 1) {
        resetRaf = requestAnimationFrame(step);
      } else {
        resetRaf = null;
      }
    };
    resetRaf = requestAnimationFrame(step);
  }

  function createDragShield() {
    if (!hostEl) { return null; }
    var shield = document.createElement("div");
    shield.id = "rl-drag-shield";
    shield.style.cssText = SHIELD_CSS;
    hostEl.appendChild(shield);
    return shield;
  }

  function removeDragShield() {
    if (!dragShield) { return; }
    var shield = dragShield;
    dragShield = null;
    try {
      if (shield.parentNode) { shield.parentNode.removeChild(shield); }
    } catch (error) { /* ignore */ }
  }

  function onDragPointerMove(event) {
    if (!dragShield || !event) { return; }
    moveDrag(event.screenX);
  }

  /* Shield / END / cancel / blur all funnel here; the shield check makes a
     duplicate END a no-op so RL_DOCK_DRAG_DONE is posted exactly once. */
  function finishDrag() {
    if (!dragShield) { return; }
    removeDragShield();
    removeDragListeners();
    cancelReset();
    if (dragOffset < DRAG_SNAP_PX) {
      animateDockOffset(0, DRAG_MS);
    } else {
      settleFrameTransitions();
    }
    postToDock("RL_DOCK_DRAG_DONE", { offset: dragOffset });
  }

  function onDragPointerEnd() {
    finishDrag();
  }

  function onDragWindowBlur() {
    /* Focusing the dock iframe blurs the parent window right after
       pointerdown; that is not a real drag cancellation. */
    if (dragShield && Date.now() - dragStartedAt < 250) { return; }
    finishDrag();
  }

  var dragListenersOn = false;

  function addDragListeners() {
    if (dragListenersOn) { return; }
    dragListenersOn = true;
    window.addEventListener("pointermove", onDragPointerMove, true);
    window.addEventListener("pointerup", onDragPointerEnd, true);
    window.addEventListener("pointercancel", onDragPointerEnd, true);
    window.addEventListener("blur", onDragWindowBlur, true);
  }

  function removeDragListeners() {
    if (!dragListenersOn) { return; }
    dragListenersOn = false;
    try { window.removeEventListener("pointermove", onDragPointerMove, true); } catch (error) { /* ignore */ }
    try { window.removeEventListener("pointerup", onDragPointerEnd, true); } catch (error) { /* ignore */ }
    try { window.removeEventListener("pointercancel", onDragPointerEnd, true); } catch (error) { /* ignore */ }
    try { window.removeEventListener("blur", onDragWindowBlur, true); } catch (error) { /* ignore */ }
  }

  function startDrag(x) {
    if (teardown || dockState !== "open") { return; }
    if (typeof x !== "number" || !isFinite(x)) { return; }
    if (dragShield) {
      /* Defensive: a lost END must not wedge the state machine. */
      removeDragShield();
      removeDragListeners();
    }
    cancelReset();
    cancelDockAnim();
    dragStartX = x;
    dragStartLeft = dockLeftForOffset(dragOffset);
    try {
      if (dockFrame) {
        var rect = dockFrame.getBoundingClientRect();
        if (rect && isFinite(rect.left) && rect.left > 0) {
          dragStartLeft = rect.left;
        }
      }
    } catch (error) { /* keep the computed fallback */ }
    dragStartedAt = Date.now();
    dragShield = createDragShield();
    if (!dragShield) { return; }
    setImportant(dockFrame, "transition", "none");
    setImportant(flyoutFrame, "transition", "none");
    addDragListeners();
  }

  function moveDrag(x) {
    if (!dragShield) { return; }
    if (typeof x !== "number" || !isFinite(x)) { return; }
    applyDockLeft(dragStartLeft + (x - dragStartX));
  }

  /* Stop tracking the pointer but leave dragOffset where it is. */
  function cancelDrag() {
    removeDragShield();
    removeDragListeners();
  }

  /* v4 §2: dblclick reset — smooth return to the default right position. */
  function resetDockOffset() {
    if (teardown || dragShield) { return; }
    animateDockOffset(0, DRAG_MS);
  }

  /* Host-initiated collapse: the dock echoes RL_DOCK_STATE collapsed and
     the host slides its frame out. The fallback keeps the frame from
     getting stuck if a dock build handles RL_HOST_COLLAPSE silently. */
  function requestDockCollapse() {
    postToDock("RL_HOST_COLLAPSE");
    if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null; }
    collapseTimer = setTimeout(function () {
      collapseTimer = null;
      if (dockState !== "open") { return; }
      dockState = "collapsed";
      if (isOpen) { closeSection(false); }
      /* v10 §20: slide out from wherever the rail currently is; the next
         open resets the offset to the default edge. */
      cancelDrag();
      cancelReset();
      hideDockFrame();
    }, reducedMotion() ? 0 : COLLAPSE_FALLBACK_MS);
  }

  /* ---- flyout placement (§5) ----------------------------------------- */
  function clamp(value, min, max) {
    if (max < min) { max = min; }
    return Math.min(Math.max(value, min), max);
  }

  function placeFlyout(cardHeight) {
    if (!flyoutFrame || flyoutPreviewOpen) { return; }
    /* keep the panel's viewport budget in sync even if a resize message was
       missed between sections (the panel caps its body before reporting). */
    sendFlyoutMax();
    var available = flyoutAvailableHeight();
    var h = Math.min(cardHeight, available);
    if (!isFinite(h) || h < 0) { h = 0; }

    /* §2: top edge on the button top (opens down) or button bottom minus h
       (bottom-half anchor flipped up); the height is capped to the space
       on that side so the panel body scrolls internally. */
    var top = flyoutTopForHeight(h);

    flyoutTop = top;
    setImportant(flyoutFrame, "top", top + "px");
    setImportant(flyoutFrame, "height", h + "px");
    updateArrow();
  }

  /* ---- flyout motion (§6) -------------------------------------------- */
  function clearFlyoutHide() {
    flyoutHideToken += 1;
    if (flyoutHideTimer) { clearTimeout(flyoutHideTimer); flyoutHideTimer = null; }
    if (flyoutHideHandler && flyoutFrame) {
      try { flyoutFrame.removeEventListener("transitionend", flyoutHideHandler); } catch (error) { /* ignore */ }
    }
    flyoutHideHandler = null;
  }

  function showFlyout() {
    if (!flyoutFrame) { return; }
    clearFlyoutHide();
    setImportant(flyoutFrame, "display", "block");

    if (reducedMotion()) {
      setImportant(flyoutFrame, "transition", "none");
      setImportant(flyoutFrame, "opacity", "1");
      setImportant(flyoutFrame, "transform", "translateX(0)");
      return;
    }

    setImportant(flyoutFrame, "transition", "none");
    setImportant(flyoutFrame, "opacity", "0");
    setImportant(flyoutFrame, "transform", "translateX(" + flyoutShift() + "px)");

    requestAnimationFrame(function () {
      if (!flyoutFrame || !isOpen || teardown) { return; }
      /* Flush the closed state so the transition has a start value. */
      try { void flyoutFrame.offsetWidth; } catch (error) { /* ignore */ }
      setImportant(flyoutFrame, "transition",
        "opacity " + OPEN_MS + "ms " + EASE + ", " +
        "transform " + OPEN_MS + "ms " + EASE);
      setImportant(flyoutFrame, "opacity", "1");
      setImportant(flyoutFrame, "transform", "translateX(0)");
    });
  }

  function hideFlyoutNow() {
    if (!flyoutFrame) { return; }
    clearFlyoutHide();
    setImportant(flyoutFrame, "transition", "none");
    setImportant(flyoutFrame, "opacity", "0");
    setImportant(flyoutFrame, "transform", "translateX(" + flyoutShift() + "px)");
    setImportant(flyoutFrame, "display", "none");
    setImportant(flyoutFrame, "height", "0px");
    setImportant(flyoutFrame, "top", "0px");
  }

  function hideFlyout() {
    if (!flyoutFrame) { return; }
    clearFlyoutHide();
    if (teardown || reducedMotion()) { hideFlyoutNow(); return; }

    var token = flyoutHideToken;
    setImportant(flyoutFrame, "transition",
      "opacity " + CLOSE_MS + "ms " + EASE + ", " +
      "transform " + CLOSE_MS + "ms " + EASE);
    setImportant(flyoutFrame, "opacity", "0");
    setImportant(flyoutFrame, "transform", "translateX(" + flyoutShift() + "px)");

    var finish = function () {
      if (token !== flyoutHideToken) { return; } /* reopened / superseded */
      clearFlyoutHide();
      if (!flyoutFrame || teardown) { return; }
      setImportant(flyoutFrame, "display", "none");
      setImportant(flyoutFrame, "height", "0px");
      setImportant(flyoutFrame, "top", "0px");
    };

    flyoutHideHandler = function (event) {
      if (!event || event.target !== flyoutFrame) { return; }
      if (event.propertyName !== "opacity" && event.propertyName !== "transform") { return; }
      finish();
    };
    flyoutFrame.addEventListener("transitionend", flyoutHideHandler);
    flyoutHideTimer = setTimeout(finish, CLOSE_MS + 60);
  }

  /* ---- section lifecycle --------------------------------------------- */
  function requestFlyoutSection(section) {
    if (!flyoutLoaded) {
      pendingSection = section;
      return;
    }
    pendingSection = null;
    postTo(flyoutFrame, {
      source: "request-ledger-host",
      type: "RL_OPEN_SECTION",
      section: section
    });
  }

  function onFlyoutLoad() {
    flyoutLoaded = true;
    lastFlyoutMax = -1;
    var section = pendingSection;
    if (!section && isOpen) { section = currentSection; }
    pendingSection = null;
    if (section) {
      postTo(flyoutFrame, {
        source: "request-ledger-host",
        type: "RL_OPEN_SECTION",
        section: section
      });
    }
    sendPageBackground();
    sendFlyoutMax();
  }

  function openSection(section, nextAnchorTop, nextAnchorHeight, nextArrowY) {
    if (flyoutPreviewOpen) { restoreFlyoutPreview(); }
    if (isOpen && currentSection === section) {
      /* §4.2: second click on the same button closes the section. */
      closeSection(true);
      return;
    }

    var wasOpen = isOpen;
    isOpen = true;
    currentSection = section;
    anchorTop = isFinite(nextAnchorTop) ? nextAnchorTop : 0;
    anchorHeight = isFinite(nextAnchorHeight) ? nextAnchorHeight : 0;
    sectionArrowY = (typeof nextArrowY === "number" && isFinite(nextArrowY))
      ? nextArrowY
      : null;
    lastCardHeight = 0;
    /* a new anchor means a new height budget, even when the old number
       happened to be identical for the previous section */
    lastFlyoutMax = -1;
    positionOverlays();
    positionFlyoutFrame();

    if (!wasOpen) {
      var initialTop = flyoutTopForHeight(0);
      flyoutTop = initialTop;
      setImportant(flyoutFrame, "top", initialTop + "px");
      setImportant(flyoutFrame, "height", "0px");
      sendPageBackground();
      showFlyout();
    }
    sendFlyoutMax();
    updateArrow();

    requestFlyoutSection(section);
  }

  function closeSection(notifyDock) {
    var wasOpen = isOpen;
    if (flyoutPreviewOpen) {
      flyoutPreviewOpen = false;
      flyoutPreviewData = null;
      if (flyoutFrame) {
        setImportant(flyoutFrame, "z-index", "auto");
        postTo(flyoutFrame, { source: "request-ledger-host", type: "RL_HOST_PREVIEW_CLOSE" });
      }
    }
    isOpen = false;
    currentSection = null;
    pendingSection = null;
    anchorTop = 0;
    anchorHeight = 0;
    flyoutTop = 0;
    sectionArrowY = null;
    lastCardHeight = 0;
    positionOverlays();
    hideArrow();

    if (wasOpen) {
      /* fade/slide out, then display:none (§6) */
      hideFlyout();
    } else if (!flyoutHideTimer) {
      /* do not cut an in-flight close animation (the dock echoes
         RL_SECTION_CLOSE right after a host-initiated Esc/scroll) */
      hideFlyoutNow();
    }

    if (wasOpen) {
      /* Keep the hidden flyout's state in sync with the host. Without this,
         it keeps a stale state.section and later bridge updates can act on a
         section the user already closed. */
      postTo(flyoutFrame, { source: "request-ledger-host", type: "RL_HOST_CLOSE_SECTION" });
    }
    if (wasOpen && notifyDock) {
      postToDock("RL_HOST_CLOSE_SECTION");
    }
  }

  /* ---- dock -> host messages ----------------------------------------- */
  function onWindowMessage(event) {
    if (!event || !event.source) { return; }
    if (!dockFrame || !flyoutFrame) { return; }

    /* live bridge: the page speaks to the host in the same window */
    if (event.source === window) {
      onPageBridgeMessage(event);
      return;
    }

    var fromDock = event.source === dockFrame.contentWindow;
    var fromFlyout = event.source === flyoutFrame.contentWindow;
    if (!fromDock && !fromFlyout) { return; }
    if (event.origin !== extOrigin) { return; }

    var data = event.data;
    if (!data || typeof data !== "object") { return; }
    var type = data.type;
    if (typeof type !== "string") { return; }

    switch (type) {
      case "RL_DOCK_READY":
        console.debug("[RL] dock ready", data.width, data.height);
        sendBridgeContext(dockFrame);
        if (pendingHostOpen) { postHostOpen(); }
        break;

      case "RL_DOCK_STATE": {
        /* runtime state change only; never derived from page content.
           v4: the host only tracks open/collapsed — no page styles. */
        if (!fromDock) { return; }
        var nextState = data.state;
        if (nextState === "open") {
          if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null; }
          clearHostOpenRetry();
          /* v10 §20: slide the host frame in from the active edge. */
          showDockFrame();
          hideCallout(false);
          sendPageBackground();
        } else if (nextState === "collapsed") {
          if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null; }
          clearHostOpenRetry();
          dockState = "collapsed";
          if (isOpen) { closeSection(false); }
          /* v10 §20: slide out from the current spot, then hide; the
             launcher appears only after the frame is gone (pinned too). */
          cancelDrag();
          cancelReset();
          hideDockFrame();
        }
        break;
      }

      /* v8 §8: hide the whole panel while pick/capture overlay is active */
      case "RL_PANEL_VISIBILITY":
        if (!fromDock && !fromFlyout) { return; }
        setPanelHidden(data.hidden === true);
        break;

      /* v9: the flyout booted; send the viewport budget it may have missed */
      case "RL_FLYOUT_READY":
        if (!fromFlyout) { return; }
        sendBridgeContext(flyoutFrame);
        lastFlyoutMax = -1;
        sendFlyoutMax();
        break;

      /* v7 §1: the dock reports the launcher palette/labels/pin state */
      case "RL_LAUNCHER_UI":
        if (!fromDock) { return; }
        onLauncherUiMessage(data);
        break;

      /* v9 §19: the panel owns the setting; persist and mirror it */
      case "RL_PANEL_SIDE":
        if (!fromDock && !fromFlyout) { return; }
        sideReady = true;
        commitSide(data.side, { persist: true, notify: true });
        break;

      case "RL_DOCK_DRAG_START":
        if (!fromDock) { return; }
        startDrag(data.x);
        break;

      case "RL_DOCK_DRAG_MOVE":
        if (!fromDock) { return; }
        moveDrag(data.x);
        break;

      case "RL_DOCK_DRAG_END":
        if (!fromDock) { return; }
        finishDrag();
        break;

      case "RL_DOCK_DRAG_RESET":
        if (!fromDock) { return; }
        resetDockOffset();
        break;

      case "RL_SECTION_OPEN": {
        if (!fromDock) { return; }
        var section = data.section;
        if (typeof section !== "string") { return; }
        if (!Object.prototype.hasOwnProperty.call(SECTIONS, section)) { return; }
        var top = typeof data.anchorTop === "number" && isFinite(data.anchorTop)
          ? data.anchorTop
          : 0;
        var height = typeof data.anchorHeight === "number" && isFinite(data.anchorHeight)
          ? data.anchorHeight
          : 0;
        var arrowY = typeof data.arrowY === "number" && isFinite(data.arrowY)
          ? data.arrowY
          : null;
        openSection(section, top, height, arrowY);
        break;
      }

      /* The panel re-measures the active rail item once the collapse/expand
         transitions have settled; the first anchor in RL_SECTION_OPEN is the
         pre-transition layout. Keep the card where it is and move only the
         connector arrow so it points at the settled item. */
      case "RL_SECTION_ANCHOR": {
        if (!fromDock || !isOpen) { return; }
        if (data.section !== currentSection) { return; }
        var settledTop = typeof data.anchorTop === "number" && isFinite(data.anchorTop)
          ? data.anchorTop
          : null;
        var settledHeight = typeof data.anchorHeight === "number" && isFinite(data.anchorHeight)
          ? data.anchorHeight
          : null;
        if (settledTop == null || settledHeight == null) { return; }
        if (settledTop === anchorTop && settledHeight === anchorHeight) { return; }
        anchorTop = settledTop;
        anchorHeight = settledHeight;
        sectionArrowY = null;
        updateArrow();
        break;
      }

      case "RL_SECTION_CLOSE":
        closeSection(true);
        break;

      case "RL_DOCK_MODE":
        console.debug("[RL] dock mode", data.mode);
        break;

      /* v6 §1: transient notification -> host toast stack (dock or flyout) */
      case "RL_TOAST":
        onToastMessage(data);
        break;

      /* v6 §4: folder hover hint -> host card (single instance) */
      case "RL_HINT":
        onHintMessage(data);
        break;

      /* shell v14: flyout asks for an enlarged centred rectangle so it can
         render a screenshot preview inside its own document. Only geometry
         crosses the boundary - never image bytes. */
      case "RL_FLYOUT_PREVIEW":
        if (!fromFlyout) { return; }
        onFlyoutPreviewMessage(data);
        break;

      case "RL_FLYOUT_SIZE": {
        if (!fromFlyout || !isOpen || flyoutPreviewOpen) { return; }
        var cardHeight = typeof data.height === "number" ? data.height : Number(data.height);
        if (!isFinite(cardHeight) || cardHeight < 0) { return; }
        lastCardHeight = cardHeight;
        placeFlyout(cardHeight);
        break;
      }

      case "RL_FLYOUT_REQUEST_CLOSE":
        if (!fromFlyout) { return; }
        closeSection(true);
        break;

      /* live bridge: panel -> host -> allowlisted page */
      case "RL_APP_SNAPSHOT":
      case "RL_APP_PATCH":
      case "RL_APP_ACK":
      case "RL_APP_BYE":
      case "RL_APP_TABS_RESULT":
      case "RL_APP_PICK_RESULT":
      case "RL_APP_CAPTURE_RESULT":
        if (!fromDock && !fromFlyout) { return; }
        relayBridgeToPage(data);
        break;

      default:
        break;
    }
  }

  /* ---- page level triggers -------------------------------------------- */
  function onKeyDown(event) {
    if (event.key !== "Escape" && event.key !== "Esc" && event.keyCode !== 27) { return; }
    /* shell v14: an enlarged preview is the topmost transient UI; Esc closes
       it first and restores the anchored flyout rectangle. (Esc pressed with
       focus inside the panel is handled by the panel document itself.) */
    if (flyoutPreviewOpen) {
      if (event.preventDefault) { event.preventDefault(); }
      if (flyoutFrame) {
        postTo(flyoutFrame, { source: "request-ledger-host", type: "RL_HOST_PREVIEW_CLOSE" });
      }
      restoreFlyoutPreview();
      return;
    }
    /* v8 §8: while the panel is hidden for pick/capture, Esc belongs to the
       page overlay; do not close the flyout behind it. */
    if (panelHidden) { return; }
    /* v4 §5: a live drag is cancelled first (snap back to its start offset);
       the rail itself stays open. */
    if (dragShield) {
      cancelDrag();
      applyDockLeft(dragStartLeft);
      settleFrameTransitions();
      return;
    }
    if (isOpen) {
      /* Esc closes the section first; the rail is untouched (§1). */
      closeSection(true);
      return;
    }
    if (dockState === "open") {
      /* Ask the dock to run its exit animation; the dock replies with
         RL_DOCK_STATE collapsed, which resets the drag offset. */
      requestDockCollapse();
    }
  }

  function onPageScroll() {
    var scrollY = window.scrollY ||
      (document.documentElement && document.documentElement.scrollTop) || 0;
    /* v7 §8: scrolling never closes the section or collapses the rail; the
       panel now ignores RL_HOST_SCROLL for closing too. */
    postToDock("RL_HOST_SCROLL", { scrollY: scrollY });
  }

  /* v12: tab switches do not reload the page; ask both panel documents to
     reload the shared ledger state (and the dock opens itself when pinned). */
  function refreshPanels() {
    if (teardown) { return; }
    postToDock("RL_HOST_REFRESH");
    if (flyoutFrame) {
      postTo(flyoutFrame, { source: "request-ledger-host", type: "RL_HOST_REFRESH" });
    }
  }

  function flushPanels() {
    if (teardown) { return; }
    postToDock("RL_HOST_FLUSH");
    if (flyoutFrame) {
      postTo(flyoutFrame, { source: "request-ledger-host", type: "RL_HOST_FLUSH" });
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === "visible") { refreshPanels(); }
    else { flushPanels(); }
  }

  function onWindowResize() {
    applyDockGeometry();
    /* v4 §2 / v9 §18: re-clamp the offset so the flyout always fits. */
    if (dragOffset > maxOffset()) { applyDockOffset(maxOffset()); }
    var fitSide = sideForLeft(dockLeftForOffset(dragOffset));
    if (fitSide !== side) {
      commitSide(fitSide, { persist: true, notify: true });
    }
    positionOverlays();
    positionLauncher();
    positionCallout();
    paintArrow();
    updateArrow();
    if (hintVisible) { applyHintTop(hintYNow); }
    if (!isOpen || !flyoutFrame) { return; }
    if (flyoutPreviewOpen) { applyFlyoutPreview(flyoutPreviewData || {}); return; }
    sendFlyoutMax();
    placeFlyout(lastCardHeight);
  }

  function onPageHide(event) {
    if (event && event.persisted) { return; }
    teardownHost();
  }

  function removeOverlayLayers() {
    clearToasts();
    flyoutPreviewOpen = false;
    flyoutPreviewData = null;
    hintToken += 1;
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    hintPending = null;
    hintVisible = false;
    hintKeyNow = "";
    hintStatsNow = null;
    hintYNow = 0;
    clearCalloutTimers();
    calloutVisible = false;
    calloutShown = true;
    setLauncherVisible(false);
    var layers = [launcherEl, calloutEl, toastLayer, hintLayer, arrowEl];
    for (var i = 0; i < layers.length; i += 1) {
      var layer = layers[i];
      if (!layer) { continue; }
      try {
        if (layer.parentNode) { layer.parentNode.removeChild(layer); }
      } catch (error) { /* ignore */ }
    }
    if (launcherPulseAnimation) {
      try { launcherPulseAnimation.cancel(); } catch (error) { /* ignore */ }
    }
    launcherPulseAnimation = null;
    launcherEl = null;
    launcherMarkEl = null;
    launcherMarkEls = null;
    launcherPulseEl = null;
    calloutEl = null;
    calloutTitleEl = null;
    calloutHintEl = null;
    calloutArrowEl = null;
    toastLayer = null;
    hintLayer = null;
    arrowEl = null;
  }

  function unmountHost() {
    panelHidden = false;
    clearPanelHideFallback();
    try { window.removeEventListener("message", onWindowMessage); } catch (error) { /* ignore */ }
    try { document.removeEventListener("keydown", onKeyDown, true); } catch (error) { /* ignore */ }
    try { window.removeEventListener("scroll", onPageScroll); } catch (error) { /* ignore */ }
    try { window.removeEventListener("resize", onWindowResize); } catch (error) { /* ignore */ }
    try { window.removeEventListener("pagehide", onPageHide); } catch (error) { /* ignore */ }
    try { document.removeEventListener("visibilitychange", onVisibilityChange); } catch (error) { /* ignore */ }
    try { window.removeEventListener("focus", refreshPanels); } catch (error) { /* ignore */ }
    try { window.removeEventListener("pageshow", refreshPanels); } catch (error) { /* ignore */ }
    clearFlyoutHide();
    cancelDrag();
    cancelReset();
    cancelDockAnim();
    removeStorageListener();
    clearHostOpenRetry();
    removeOverlayLayers();
    if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null; }
    if (hostEl && hostEl.parentNode) {
      hostEl.parentNode.removeChild(hostEl);
    }
    hostEl = null;
    dockFrame = null;
    flyoutFrame = null;
  }

  function teardownHost() {
    if (teardown) { return; }
    teardown = true;
    unmountHost();
  }

  /* Picker-only flow on another tab: remove the host completely so the
     picked page shows the picker overlay and nothing else. The runtime
     listener stays alive so RL_DOCK_RESUME can mount the host again. */
  function suspendHost() {
    if (teardown || hostSuspended) { return; }
    hostSuspended = true;
    /* A resumed host starts from the ordinary collapsed state. */
    dockState = "collapsed";
    dockFrameVisible = false;
    dockAnimMode = null;
    dockAnimating = false;
    isOpen = false;
    currentSection = null;
    pendingSection = null;
    launcherShown = false;
    unmountHost();
  }

  function resumeHost() {
    if (teardown || !hostSuspended) { return; }
    hostSuspended = false;
    if (isPageAllowed()) { mount(); }
  }

  /* ---- mount ---------------------------------------------------------- */
  function buildFrame(id, role, title, css) {
    var frame = document.createElement("iframe");
    frame.id = id;
    frame.setAttribute("title", title);
    frame.setAttribute("allow", "clipboard-write");
    frame.setAttribute("frameborder", "0");
    frame.style.cssText = css;
    frame.src = extBase + "panel/panel.html?role=" + role;
    return frame;
  }

  function createArrowElement() {
    if (!hostEl || arrowEl) { return; }
    arrowEl = document.createElement("div");
    arrowEl.id = "rl-arrow";
    arrowEl.setAttribute("aria-hidden", "true");
    arrowEl.style.cssText = ARROW_CSS;
    hostEl.appendChild(arrowEl);
    paintArrow();
  }

  function createOverlayLayers() {
    if (!hostEl || toastLayer || hintLayer) { return; }
    toastLayer = document.createElement("div");
    toastLayer.id = "rl-toast-layer";
    toastLayer.style.cssText = TOAST_LAYER_CSS;
    hintLayer = document.createElement("div");
    hintLayer.id = "rl-hint-layer";
    hintLayer.style.cssText = HINT_LAYER_CSS;
    hostEl.appendChild(toastLayer);
    hostEl.appendChild(hintLayer);
    createLauncherElements();
    createArrowElement();
    positionOverlays();
  }

  function mount() {
    if (teardown || hostSuspended) { return; }
    if (hostEl || document.getElementById(HOST_ID)) { return; }
    var root = document.documentElement;
    if (!root) { return; }

    hostEl = document.createElement("div");
    hostEl.id = HOST_ID;
    hostEl.style.cssText = HOST_CSS;
    if (isCompanionOrigin()) { hostEl.setAttribute("data-companion", "1"); }

    dockFrame = buildFrame(DOCK_ID, "dock", "Request Ledger", DOCK_CSS);
    flyoutFrame = buildFrame(FLYOUT_ID, "flyout", "Request Ledger panel", FLYOUT_CSS);
    flyoutFrame.addEventListener("load", onFlyoutLoad);

    hostEl.appendChild(dockFrame);
    hostEl.appendChild(flyoutFrame);
    createOverlayLayers();
    root.appendChild(hostEl);

    applyDockGeometry();
    positionOverlays();
    positionLauncher();
    positionCallout();

    /* v4 / v9 E2E hooks: read-only helpers, removed by leaving the page. */
    try {
      window.__rlHostDrag = Object.freeze({
        offset: function () { return dragOffset; },
        max: function () { return maxOffset(); },
        side: function () { return side; },
        left: function () { return dockLeftForOffset(dragOffset); },
        dragging: function () { return !!dragShield; }
      });
    } catch (error) { /* ignore */ }

    /* v6 QA hooks: overlay geometry + lifecycle counts, read-only.
       v7 adds the host launcher/callout; v9 adds side + arrow + stats. */
    try {
      window.__rlBridgeHost = Object.freeze({
        companion: function () { return isCompanionOrigin(); },
        pageOrigin: function () { return companionPageOrigin(); },
        toPanel: function () { return bridgeRelayedToPanel; },
        toPage: function () { return bridgeRelayedToPage; }
      });
    } catch (error) { /* ignore */ }

    try {
      window.__rlHostOverlay = Object.freeze({
        right: function () { return overlayRight(); },
        left: function () { return overlayLeft(); },
        side: function () { return side; },
        toasts: function () {
          return document.querySelectorAll("#rl-toast-layer > *").length;
        },
        hint: function () {
          if (!hintLayer || !hintVisible) { return ""; }
          return hintLayer.textContent || "";
        },
        hintStats: function () { return hintStatsNow; },
        launcher: function () { return launcherShown; },
        callout: function () { return calloutVisible; },
        pinned: function () { return pinned; },
        dock: function () { return dockState; },
        dockVisible: function () { return dockFrameVisible; },
        dockWidth: function () { return DOCK_WIDTH_OPEN; },
        flyoutInset: function () { return FLYOUT_RIGHT; },
        flyoutMax: function () { return lastFlyoutMax; },
        flyoutSpace: function () {
          return {
            up: flyoutOpensUp(),
            available: flyoutAvailableHeight(),
            below: flyoutSpaceBelow(),
            above: flyoutSpaceAbove()
          };
        },
        dockAnim: function () {
          return { visible: dockFrameVisible, mode: dockAnimMode, animating: dockAnimating };
        },
        previewOpen: function () { return flyoutPreviewOpen; },
        previewRect: function () {
          if (!flyoutFrame) { return null; }
          var rect = flyoutFrame.getBoundingClientRect();
          return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
        },
        panelHidden: function () { return panelHidden; },
        arrow: function () {
          if (!arrowEl) { return null; }
          return {
            display: arrowEl.style.getPropertyValue("display"),
            top: arrowEl.style.getPropertyValue("top"),
            left: arrowEl.style.getPropertyValue("left"),
            right: arrowEl.style.getPropertyValue("right")
          };
        },
        flyout: function () {
          if (!flyoutFrame) { return null; }
          return {
            top: flyoutFrame.style.getPropertyValue("top"),
            height: flyoutFrame.style.getPropertyValue("height"),
            right: flyoutFrame.style.getPropertyValue("right"),
            left: flyoutFrame.style.getPropertyValue("left"),
            width: flyoutFrame.style.getPropertyValue("width")
          };
        }
      });
    } catch (error) { /* ignore */ }

    window.addEventListener("message", onWindowMessage);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onPageScroll, { passive: true });
    window.addEventListener("resize", onWindowResize);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", refreshPanels);
    window.addEventListener("pageshow", refreshPanels);
    addStorageListener();
  }

  function boot() {
    if (teardown || hostSuspended) { return; }
    if (!isPageAllowed()) { return; }
    if (!document.documentElement) {
      /* Defensive: run_at=document_idle should already have a root element. */
      document.addEventListener("DOMContentLoaded", boot, { once: true });
      return;
    }
    mount();
    /* v9 §19: the persisted placement is applied before the first paint;
       the panel repeats it through RL_PANEL_SIDE once its dock is ready. */
    readStoredSide(function (nextSide) {
      if (teardown) { return; }
      sideReady = true;
      commitSide(nextSide, { persist: false, notify: false });
    });
  }

  /* ---- runtime control (picker-only flow) ---------------------------- */
  /* Sent by the worker only to the tab that receives a cross-tab pick. */
  function onRuntimeControl(message) {
    if (!message || typeof message !== "object") { return; }
    if (message.type === "RL_DOCK_SUSPEND") { suspendHost(); return; }
    if (message.type === "RL_DOCK_RESUME") { resumeHost(); }
  }

  try {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener(onRuntimeControl);
    }
  } catch (error) { /* extension context can be invalidated */ }

  boot();
})();
