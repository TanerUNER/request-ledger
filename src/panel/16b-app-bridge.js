  /* ============================================================
     Live bridge — web app <-> extension panel

     The web app is the hub. While an allowlisted page has the app open,
     the extension mirrors its text data (project, ledgerId, requests,
     agents, language, exportBehavior). Media (image/file blobs) is
     deliberately NOT part of this channel: it travels with backup ZIPs
     only. Each surface keeps its own media arrays while text merges.

     Page <-> host (<content/dock.js>) <-> panel:
       RL_APP_HELLO    page  -> host -> panel   full envelope v1
       RL_APP_SNAPSHOT panel -> host -> page    full envelope v1
       RL_APP_PATCH    either direction         item-level upserts
       RL_APP_ACK      handshake / heartbeat / decision
       RL_APP_BYE      page closed
       RL_APP_TABS_REQUEST / RL_APP_PICK_REQUEST / RL_APP_CAPTURE_REQUEST
                       page -> panel            one-shot capture controls
       RL_APP_PICK_RESULT / RL_APP_CAPTURE_RESULT
                       panel -> page            selector, page and optional image
       RL_BRIDGE_CONTEXT host -> panel          page origin

     Security:
       - the host only relays on the allowlisted origins and pins the
         target origin to the page origin;
       - the panel only sends to a validated allowlisted parent origin.
       - every localhost/127.0.0.1 port is allowlisted so the launcher can
         pick a free port;
       - file: pages report the opaque origin "null"; only that case uses
         targetOrigin "*" because the origin cannot be pinned. The host must
         still be the direct parent and the page validates event.source.
     ============================================================ */

  var BRIDGE_VERSION = 1;
  var BRIDGE_ORIGINS = { "http://localhost:8080":true, "https://taneruner.github.io":true };
  var BRIDGE_LOCAL_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::[0-9]{1,5})?$/;
  /* A file: page reports origin "null". It is the only opaque origin the
     bridge accepts; the host only mounts this bridge from a file page and the
     panel still requires event.source === window.parent. */
  var BRIDGE_FILE_ORIGIN = "null";
  var BRIDGE_TOMBSTONE_KEY = "rl-bridge-tombstones-v1";
  var BRIDGE_TOMBSTONE_DAYS = 30;
  var BRIDGE_TOMBSTONE_MAX = 500;
  var BRIDGE_STALE_MS = 8000;

  var bridgePageOrigin = "";
  var bridgeConnected = false;
  var bridgeLastHeard = 0;
  var bridgeConflict = false;
  var bridgePeerHello = null;
  var bridgeLedgerSynced = false;
  var bridgeSuppress = 0;
  var bridgeSendTimer = null;
  var bridgeWatchTimer = null;
  var bridgeRefreshHoldUntil = 0;
  var pendingFlyoutFocus = null;
  var pendingFocusListenerOn = false;
  var bridgeLastAppliedHash = "";
  var bridgeTombstones = {};
  var bridgeKnownIds = {};
  /* Phase 2c: the live bridge follows the app's open project. A peer on a
     different project id is never merged into the active project. */
  var bridgePeerProjectId = "";
  var bridgeProjectMismatch = false;
  var bridgeAdoptingProject = false;
  var bridgeAdoptedNewProject = false;
  var bridgeStats = { sent:0, patches:0, received:0, applied:0, echoes:0 };

  function bridgeTombstoneKey(){
    return BRIDGE_TOMBSTONE_KEY + ":" + (activeProjectId || "default");
  }

  function bridgeEnvelopeProjectId(data){
    return data && typeof data.projectId === "string" ? data.projectId : "";
  }

  function bridgeEnvelopeProjectName(data){
    var value = data && typeof data.projectName === "string"
      ? data.projectName
      : (data && typeof data.project === "string" ? data.project : "");
    return normalizeProjectName(value);
  }

  function bridgeAllowedOrigin(value){
    return typeof value === "string" &&
      (BRIDGE_ORIGINS[value] === true ||
       BRIDGE_LOCAL_ORIGIN.test(value) ||
       value === BRIDGE_FILE_ORIGIN);
  }

  function bridgeNow(){
    if(core && core.util && typeof core.util.nowISO === "function") return core.util.nowISO();
    return new Date().toISOString();
  }

  function bridgeHash(value){
    var text = String(value == null ? "" : value);
    var hash = 5381;
    for(var i = 0; i < text.length; i++){
      hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
      hash = hash >>> 0;
    }
    return hash.toString(36) + ":" + text.length;
  }

  /* Tombstones survive a reload so a peer that was offline cannot
     resurrect a deleted request on the next connection. */
  function bridgeLoadTombstones(){
    bridgeTombstones = {};
    try{
      if(typeof localStorage === "undefined") return;
      var raw = localStorage.getItem(bridgeTombstoneKey());
      if(!raw) return;
      var parsed = JSON.parse(raw);
      if(!parsed || typeof parsed !== "object") return;
      var cutoff = Date.now() - BRIDGE_TOMBSTONE_DAYS * 24 * 60 * 60 * 1000;
      Object.keys(parsed).forEach(function(id){
        var at = Date.parse(parsed[id]);
        if(!isNaN(at) && at >= cutoff) bridgeTombstones[id] = String(parsed[id]);
      });
    }catch(err){ /* ignore */ }
  }

  function bridgeSaveTombstones(){
    try{
      if(typeof localStorage === "undefined") return;
      var ids = Object.keys(bridgeTombstones).sort();
      if(ids.length > BRIDGE_TOMBSTONE_MAX) ids = ids.slice(ids.length - BRIDGE_TOMBSTONE_MAX);
      var payload = {};
      ids.forEach(function(id){ payload[id] = bridgeTombstones[id]; });
      localStorage.setItem(bridgeTombstoneKey(), JSON.stringify(payload));
    }catch(err){ /* ignore */ }
  }

  function bridgeRememberTombstone(id, at){
    if(typeof id !== "string" || !id) return;
    bridgeTombstones[id] = at || bridgeNow();
    bridgeSaveTombstones();
  }

  function bridgeTombstoneIds(){
    return Object.keys(bridgeTombstones).sort();
  }

  /* Detect local deletions between two saves. */
  function bridgeCollectDeletes(){
    var current = {};
    if(app && Array.isArray(app.requests)){
      app.requests.forEach(function(req){ if(req && req.id) current[req.id] = true; });
    }
    Object.keys(bridgeKnownIds).forEach(function(id){
      if(!current[id]) bridgeRememberTombstone(id, app && app.updatedAt ? app.updatedAt : bridgeNow());
    });
    bridgeKnownIds = current;
  }

  function bridgeResetKnownIds(){
    bridgeKnownIds = {};
    if(app && Array.isArray(app.requests)){
      app.requests.forEach(function(req){ if(req && req.id) bridgeKnownIds[req.id] = true; });
    }
  }

  /* Text-only request envelope. Media arrays are intentionally omitted. */
  var BRIDGE_MEDIA_MAX_BYTES = 8 * 1024 * 1024;
  var bridgeSentMedia = {};
  var bridgePeerMedia = {};
  var bridgeMediaSending = false;

  /* Metadata can arrive before the blob. Keep a short pending window so the
     detail view can show "Loading image…" instead of a premature missing
     placeholder; a real failure turns into "not found" after the timeout. */
  var BRIDGE_MEDIA_PENDING_MS = 15000;
  var bridgeMediaPending = {};

  function bridgeMediaMarkPending(kind, id){
    if(!id) return;
    var key = bridgeMediaKey(kind, id);
    if(!(key in bridgeMediaPending)) bridgeMediaPending[key] = Date.now();
  }

  function bridgeMediaPendingRemaining(kind, id){
    if(!id) return 0;
    var at = bridgeMediaPending[bridgeMediaKey(kind, id)];
    if(!at) return 0;
    var left = BRIDGE_MEDIA_PENDING_MS - (Date.now() - at);
    return left > 0 ? left : 0;
  }

  function bridgeMediaIsPending(kind, id){
    return bridgeMediaPendingRemaining(kind, id) > 0;
  }

  function bridgeMediaClearPending(kind, id){
    if(!id) return;
    delete bridgeMediaPending[bridgeMediaKey(kind, id)];
  }

  function bridgeMediaOut(item, kind){
    if(!item || typeof item.id !== "string" || !item.id) return null;
    var out = {
      id:item.id,
      name:typeof item.name === "string" ? item.name.slice(0, 180) : "",
      type:typeof item.type === "string" ? item.type.slice(0, 120) : "",
      ext:typeof item.ext === "string" ? item.ext.slice(0, 20) : "",
      size:Number(item.size) || 0,
      kind:kind
    };
    if(kind === "image"){
      out.w = Number(item.w) || 0;
      out.h = Number(item.h) || 0;
    }
    return out;
  }

  function bridgeMediaKey(kind, id){
    return (activeProjectId || "") + "|" + kind + "|" + id;
  }

  function bridgeBlobToDataUrl(blob){
    return new Promise(function(resolve, reject){
      if(!blob){ reject(new Error("missing blob")); return; }
      try{
        var reader = new FileReader();
        reader.onload = function(){ resolve(reader.result); };
        reader.onerror = function(){ reject(reader.error || new Error("media read failed")); };
        reader.readAsDataURL(blob);
      }catch(err){ reject(err); }
    });
  }

  function bridgeSendMediaItem(req, item, kind, force){
    if(!req || !item || !item.id) return Promise.resolve(false);
    var key = bridgeMediaKey(kind, item.id);
    if(!force && (bridgeSentMedia[key] || bridgePeerMedia[key])) return Promise.resolve(false);
    var read = kind === "image" ? core.storage.getImage(item.id) : core.storage.getFile(item.id);
    return Promise.resolve(read).then(function(record){
      if(!record || !record.blob || record.blob.size > BRIDGE_MEDIA_MAX_BYTES) return false;
      return bridgeBlobToDataUrl(record.blob).then(function(dataUrl){
        if(typeof dataUrl !== "string" || dataUrl.length > BRIDGE_MEDIA_MAX_BYTES * 2) return false;
        bridgePost("RL_APP_MEDIA", {
          requestId:req.id,
          media:[{ kind:kind, id:item.id, meta:bridgeMediaOut(item, kind), dataUrl:dataUrl }]
        });
        bridgeSentMedia[key] = true;
        return true;
      });
    }).catch(function(){ return false; });
  }

  function bridgeSendPendingMedia(force){
    if(bridgeServerStopped || bridgeMediaSending || !app) return;
    bridgeMediaSending = true;
    var jobs = [];
    (app.requests || []).forEach(function(req){
      (Array.isArray(req.images) ? req.images : []).forEach(function(img){
        jobs.push(bridgeSendMediaItem(req, img, "image", force));
      });
      (Array.isArray(req.attachments) ? req.attachments : []).forEach(function(att){
        jobs.push(bridgeSendMediaItem(req, att, "file", force));
      });
    });
    Promise.all(jobs).then(function(){ bridgeMediaSending = false; }, function(){ bridgeMediaSending = false; });
  }

  function bridgeRequestMissingMedia(){
    if(bridgeServerStopped || !app) return;
    var ids = [];
    (app.requests || []).forEach(function(req){
      (Array.isArray(req.images) ? req.images : []).forEach(function(img){ if(img && img.id) ids.push("image:" + img.id); });
      (Array.isArray(req.attachments) ? req.attachments : []).forEach(function(att){ if(att && att.id) ids.push("file:" + att.id); });
    });
    if(!ids.length) return;
    ids.forEach(function(value){
      var parts = String(value).split(":");
      var kind = parts.shift();
      if(kind === "image" || kind === "file") bridgeMediaMarkPending(kind, parts.join(":"));
    });
    bridgePost("RL_APP_MEDIA_REQUEST", { ids:ids.slice(0, 100) });
  }

  function bridgeHandleMedia(data){
    if(!data || !app || !activeProjectId) return;
    if(bridgeEnvelopeProjectId(data) && bridgeEnvelopeProjectId(data) !== activeProjectId){
      bridgeRecordReject("media-project-mismatch", data);
      return;
    }
    var req = null;
    (app.requests || []).some(function(item){
      if(item.id === data.requestId){ req = item; return true; }
      return false;
    });
    if(!req || !Array.isArray(data.media)) return;
    var changed = false;
    var jobs = data.media.slice(0, 20).map(function(item){
      if(!item || typeof item.id !== "string" || typeof item.dataUrl !== "string") return Promise.resolve();
      if(!/^data:(image|application)\//.test(item.dataUrl)) return Promise.resolve();
      var kind = item.kind === "file" ? "file" : "image";
      var meta = item.meta && typeof item.meta === "object" ? item.meta : {};
      return fetch(item.dataUrl).then(function(response){ return response.blob(); }).then(function(blob){
        if(blob.size > BRIDGE_MEDIA_MAX_BYTES) return;
        if(kind === "image"){
          return core.storage.putImage({ id:item.id, blob:blob, type:meta.type || blob.type || "image/webp" }).then(function(){
            changed = true;
            var list = Array.isArray(req.images) ? req.images : [];
            if(!list.some(function(entry){ return entry.id === item.id; })){
              list.push({
                id:item.id, name:meta.name || lx("imageFallback"), w:Number(meta.w) || 0,
                h:Number(meta.h) || 0, type:meta.type || blob.type || "image/webp",
                ext:meta.ext || "", file:""
              });
              req.images = list;
              changed = true;
            }
          });
        }
        return core.storage.putFile({
          id:item.id, blob:blob, type:meta.type || blob.type || "application/octet-stream"
        }).then(function(){
          changed = true;
          var list = Array.isArray(req.attachments) ? req.attachments : [];
          if(!list.some(function(entry){ return entry.id === item.id; })){
            list.push({
              id:item.id, name:meta.name || lx("filesTitle"), size:Number(meta.size) || blob.size,
              type:meta.type || blob.type || "application/octet-stream",
              ext:meta.ext || "", file:""
            });
            req.attachments = list;
            changed = true;
          }
        });
      }).then(function(){
        bridgePeerMedia[bridgeMediaKey(kind, item.id)] = true;
        bridgeMediaClearPending(kind, item.id);
      }).catch(function(){ /* skip broken media */ });
    });
    Promise.all(jobs).then(function(){
      if(!changed) return;
      bridgeRefreshHoldUntil = Date.now() + 1500;
      /* Media metadata arrived over the bridge; persisting it must not count
         as a user edit that revokes an existing Ready confirmation, and must
         not create a newer revision that can override one. */
      saveNow();
      if(role === "flyout" && state.section) renderFlyout(state.section);
      if(role === "dock") updateDockBadges();
    });
  }

  function bridgeRequestOut(req){
    if(!req) return null;
    return {
      id:req.id,
      type:req.type,
      title:req.title,
      page:req.page,
      location:req.location,
      consoleError:req.consoleError,
      description:req.description,
      priority:req.priority,
      link:req.link,
      sampleWebsite:req.sampleWebsite,
      note:req.note,
      confirmed:req.confirmed === true,
      createdAt:req.createdAt,
      updatedAt:req.updatedAt,
      images:(Array.isArray(req.images) ? req.images : []).map(function(item){
        return bridgeMediaOut(item, "image");
      }).filter(Boolean),
      attachments:(Array.isArray(req.attachments) ? req.attachments : []).map(function(item){
        return bridgeMediaOut(item, "file");
      }).filter(Boolean)
    };
  }

  function bridgeMediaList(value, kind){
    return (Array.isArray(value) ? value : []).map(function(item){
      if(!item || typeof item.id !== "string" || !item.id) return null;
      var out = {
        id:item.id, name:item.name || "", type:item.type || "", ext:item.ext || "",
        size:Number(item.size) || 0, file:""
      };
      if(kind === "image"){ out.w = Number(item.w) || 0; out.h = Number(item.h) || 0; }
      return out;
    }).filter(Boolean);
  }

  function bridgeMergeMedia(incoming, local, kind){
    var byId = {};
    bridgeMediaList(local, kind).forEach(function(item){ byId[item.id] = item; });
    bridgeMediaList(incoming, kind).forEach(function(item){ byId[item.id] = item; });
    return Object.keys(byId).map(function(id){ return byId[id]; });
  }

  function bridgeAgentOut(agent){
    return { id:agent.id, name:agent.name, role:agent.role, mdPath:agent.mdPath };
  }

  function bridgeEnvelope(type, extra){
    var message = {
      source:"request-ledger-panel",
      type:type,
      v:BRIDGE_VERSION,
      ledgerId:app && app.ledgerId ? String(app.ledgerId) : "",
      updatedAt:app && app.updatedAt ? String(app.updatedAt) : bridgeNow(),
      project:app && typeof app.project === "string" ? app.project : "",
      projectId:activeProjectId || "",
      projectName:app && typeof app.project === "string" ? app.project : activeProjectName(),
      requests:app && Array.isArray(app.requests) ? app.requests.map(bridgeRequestOut).filter(Boolean) : [],
      agents:app && Array.isArray(app.agents) ? app.agents.map(bridgeAgentOut) : [],
      language:app && app.language === "tr" ? "tr" : "en",
      exportBehavior:app && ["last","instant"].indexOf(app.exportBehavior) >= 0 ? app.exportBehavior : "default",
      deletedIds:bridgeTombstoneIds()
    };
    if(type === "RL_APP_PATCH"){
      message.upserts = message.requests.slice();
      delete message.requests;
    }
    if(extra){
      for(var key in extra){
        if(has(extra, key) && extra[key] !== undefined) message[key] = extra[key];
      }
    }
    return message;
  }

  function bridgeTargetOrigin(){
    if(bridgePageOrigin && bridgeAllowedOrigin(bridgePageOrigin)){
      return bridgePageOrigin === BRIDGE_FILE_ORIGIN ? "*" : bridgePageOrigin;
    }
    try{
      if(document.referrer){
        var refUrl = new URL(document.referrer);
        var origin = refUrl.protocol === "file:" ? BRIDGE_FILE_ORIGIN : refUrl.origin;
        if(bridgeAllowedOrigin(origin)){
          bridgePageOrigin = origin;
          return origin === BRIDGE_FILE_ORIGIN ? "*" : origin;
        }
      }
    }catch(err){ /* ignore */ }
    return "";
  }

  /* Page identity is still "null" for file pages even though the postMessage
     target must be "*". */
  function bridgePageIdentity(){
    if(bridgePageOrigin && bridgeAllowedOrigin(bridgePageOrigin)) return bridgePageOrigin;
    var target = bridgeTargetOrigin();
    return target === "*" ? BRIDGE_FILE_ORIGIN : target;
  }

  function bridgePost(type, extra){
    if(!hasHost || bridgeServerStopped) return;
    var target = bridgeTargetOrigin();
    if(!target) return; /* no allowlisted page: send nothing */
    var message = bridgeEnvelope(type, extra);
    try{ window.parent.postMessage(message, target); }catch(err){ return; }
    if(type === "RL_APP_PATCH") bridgeStats.patches++;
    else bridgeStats.sent++;
  }

  /* Picker replies are deliberately small: no ledger envelope, just the
     documented control fields. The host re-checks the origin and strips
     anything outside those fields before the page sees it. */
  function bridgeControlPost(type, extra){
    if(!hasHost || bridgeServerStopped) return;
    var target = bridgeTargetOrigin();
    if(!target) return;
    var message = {
      source:"request-ledger-panel",
      type:type,
      v:BRIDGE_VERSION,
      ledgerId:app && app.ledgerId ? String(app.ledgerId) : "",
      pageOrigin:bridgePageIdentity()
    };
    if(extra){
      for(var key in extra){
        if(has(extra, key) && extra[key] !== undefined) message[key] = extra[key];
      }
    }
    try{ window.parent.postMessage(message, target); }catch(err){ return; }
    bridgeStats.sent++;
  }

  var appPickPending = null; /* { tabId, capture } while a web-app pick runs */
  var appCapturePending = null; /* { tabId } while a web-app screenshot runs */
  var appTabsBusy = false;
  var APP_IMAGE_MAX_CHARS = 8 * 1024 * 1024;
  var bridgePeerLedgerId = "";
  var bridgePeerRequestCount = 0;
  var bridgeServerStopped = false;
  var companionPresence = { checked:false, open:false, mode:"", port:0, origin:"" };
  var companionProbeTimer = null;
  var companionProbeBusy = false;
  var companionWasLocked = false;

  function companionLocked(){
    return companionPresence.checked && !bridgeConnected && !companionPresence.open;
  }

  function companionOverlayLocked(){
    return !bridgeConnected && !companionPresence.open;
  }

  function updateCompanionLock(){
    var overlayLocked = companionOverlayLocked();
    /* No in-page lock card: the content script removes the whole host when
       the app is not alive. Presence/status updates must be side-effect free:
       they never discard a draft, switch mode, refresh data or move focus. */
    try{ document.body.setAttribute("data-companion-locked", overlayLocked ? "1" : "0"); }catch(err){ /* ignore */ }
    companionWasLocked = overlayLocked;
  }

  function companionProbeNow(force){
    if(companionProbeBusy || !hasHost) {
      if(!hasHost) { companionPresence.checked = true; companionPresence.open = false; updateBridgeUI(); }
      return;
    }
    if(!force && companionPresence.checked && Date.now() - (companionPresence.lastAt || 0) < 2500) return;
    companionProbeBusy = true;
    var port = Number(window.location.port) || 0;
    sendRuntime({ type:"RL_APP_PRESENCE", port:port }, function(response, failure){
      companionProbeBusy = false;
      if(failure || !response){
        companionPresence = { checked:true, open:false, mode:"", port:port, origin:"", lastAt:Date.now() };
      }else{
        companionPresence = {
          checked:true,
          open: response.open === true,
          mode: typeof response.mode === "string" ? response.mode : "",
          port: Number(response.port) || port,
          origin: typeof response.origin === "string" ? response.origin : "",
          lastAt: Date.now()
        };
      }
      /* Status changes are text-only; they never re-render the panel. */
      updateBridgeUI();
    });
  }

  function startCompanionProbe(){
    if(companionProbeTimer) clearInterval(companionProbeTimer);
    companionProbeNow(true);
    companionProbeTimer = setInterval(function(){ companionProbeNow(false); }, 4000);
  }
  var bridgeRejects = [];
  var bridgeConflictInfo = null;
  var BRIDGE_DIAGNOSTIC_MAX = 50;

  function bridgeEnvelopeRequestCount(data){
    if(!data) return 0;
    if(Array.isArray(data.requests)) return data.requests.length;
    if(Array.isArray(data.upserts)) return data.upserts.length;
    return 0;
  }

  function bridgeRecordReject(reason, data, extra){
    var record = {
      at: bridgeNow(),
      reason: reason,
      type: data && typeof data.type === "string" ? data.type : "",
      projectId: bridgeEnvelopeProjectId(data),
      ledgerId: data && typeof data.ledgerId === "string" ? data.ledgerId : "",
      requestCount: bridgeEnvelopeRequestCount(data),
      panelProjectId: activeProjectId || "",
      panelLedgerId: app && app.ledgerId ? String(app.ledgerId) : "",
      detail: extra || null
    };
    bridgeRejects.push(record);
    if(bridgeRejects.length > BRIDGE_DIAGNOSTIC_MAX) bridgeRejects.shift();
    try{ console.warn("[rl-bridge-panel] rejected envelope", record); }catch(err){ /* ignore */ }
    return record;
  }

  function bridgeCaptureConflict(source, data){
    var record = activeProjectId ? activeProjectRecord() : null;
    bridgeConflictInfo = {
      at: bridgeNow(),
      source: source || "RL_APP_HELLO",
      panel: {
        projectId: activeProjectId || "",
        ledgerId: app && app.ledgerId ? String(app.ledgerId) : "",
        requestCount: app && Array.isArray(app.requests) ? app.requests.length : 0
      },
      app: {
        projectId: bridgeEnvelopeProjectId(data),
        ledgerId: data && typeof data.ledgerId === "string" ? data.ledgerId : "",
        requestCount: bridgeEnvelopeRequestCount(data)
      },
      registry: {
        activeId: (readRegistry() || {}).activeId || null,
        recordLedgerId: record ? record.ledgerId : ""
      },
      stack: (new Error().stack || "").split("\n").slice(1, 7).join(" | ")
    };
    try{ console.warn("[rl-panel-bridge] conflict evidence", bridgeConflictInfo); }catch(err){ /* ignore */ }
  }

  /* The app sends its interface language with every pick/capture control
     request so the injected overlay can never fall back to a stale panel
     preference. Unknown or absent values use the panel's current language. */
  function appOverlayLang(data){
    if(data && (data.lang === "en" || data.lang === "tr")) return data.lang;
    return state.lang === "en" ? "en" : "tr";
  }

  function appImageDataUrl(value){
    if(typeof value !== "string" || !value || value.length > APP_IMAGE_MAX_CHARS) return "";
    return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(value) ? value : "";
  }

  function appImageDimension(value){
    var number = Number(value);
    if(!isFinite(number) || number <= 0) return 0;
    return Math.min(20000, Math.round(number));
  }

  function panelTabId(){
    return getCurrentTabId().then(function(id){
      return id != null ? id : originTabId;
    });
  }

  function isEligibleAppTab(tab, appTabId){
    if(!tab || typeof tab.id !== "number" || !isFinite(tab.id)) return false;
    if(appTabId != null && tab.id === appTabId) return false;
    var url = typeof tab.url === "string" ? tab.url : "";
    if(!/^(https?|file):/i.test(url)) return false;
    var base = "";
    try{ base = chrome.runtime.getURL(""); }catch(err){ base = ""; }
    if(base && url.indexOf(base) === 0) return false;
    return true;
  }

  function handleAppTabsRequest(data){
    if(role !== "dock") return; /* one responder only: the dock frame */
    if(!data || !bridgeAllowedOrigin(data.pageOrigin)) return;
    bridgePageOrigin = data.pageOrigin;
    if(appTabsBusy) return;
    appTabsBusy = true;
    panelTabId().then(function(appTabId){
      sendRuntime({ type:"RL_TABS_LIST", excludeTabId:appTabId != null ? appTabId : undefined }, function(response, failure){
        appTabsBusy = false;
        var tabs = [];
        if(!failure && response && response.ok === true && Array.isArray(response.tabs)){
          for(var i = 0; i < response.tabs.length && tabs.length < 50; i++){
            var tab = response.tabs[i];
            if(!isEligibleAppTab(tab, appTabId)) continue;
            tabs.push({
              id:tab.id,
              title:String(tab.title || tab.url || "").slice(0, 200),
              url:String(tab.url || "").slice(0, 2048),
              favIconUrl:typeof tab.favIconUrl === "string" ? tab.favIconUrl.slice(0, 2048) : ""
            });
          }
        }
        bridgeControlPost("RL_APP_TABS_RESULT", {
          tabs:tabs,
          error:failure || !response || response.ok !== true ? "unavailable" : ""
        });
      });
    });
  }

  function handleAppPickRequest(data){
    if(role !== "dock") return;
    if(!data || !bridgeAllowedOrigin(data.pageOrigin)) return;
    bridgePageOrigin = data.pageOrigin;
    if(appPickPending || appCapturePending) return;
    var tabId = Number(data.tabId);
    if(!isFinite(tabId) || tabId < 0 || Math.floor(tabId) !== tabId) return;
    tabId = Math.floor(tabId);
    var wantsCapture = data.capture === true;
    appPickPending = { tabId:tabId, capture:wantsCapture };
    panelTabId().then(function(originId){
      var payload = { type:"RL_PICK_ELEMENT", tabId:tabId, appPick:true, lang:appOverlayLang(data) };
      if(wantsCapture) payload.capture = true;
      if(originId != null) payload.originTabId = originId;
      sendRuntime(payload, function(response, failure){
        if(failure || !response || response.ok === false){
          appPickPending = null;
          bridgeControlPost("RL_APP_PICK_RESULT", {
            cancelled:true,
            tabId:tabId,
            error:"unavailable"
          });
        }
        /* on success the worker's RL_PICK_RESULT finishes the flow */
      });
    });
  }

  function handleAppPickCancel(data){
    if(role !== "dock") return;
    if(!data || !bridgeAllowedOrigin(data.pageOrigin)) return;
    var pending = appPickPending;
    appPickPending = null;
    if(!pending) return;
    if(data.tabId !== undefined && Number(data.tabId) !== pending.tabId) return;
    sendRuntime({ type:"RL_PICK_CANCEL", tabId:pending.tabId });
  }

  function handleAppCaptureRequest(data){
    if(role !== "dock") return;
    if(!data || !bridgeAllowedOrigin(data.pageOrigin)) return;
    bridgePageOrigin = data.pageOrigin;
    if(appCapturePending || appPickPending) return;
    var tabId = Number(data.tabId);
    if(!isFinite(tabId) || tabId < 0 || Math.floor(tabId) !== tabId) return;
    tabId = Math.floor(tabId);
    appCapturePending = { tabId:tabId };
    panelTabId().then(function(originId){
      var payload = { type:"RL_CAPTURE_TAB", tabId:tabId, appCapture:true, lang:appOverlayLang(data) };
      if(originId != null) payload.originTabId = originId;
      sendRuntime(payload, function(response, failure){
        if(failure || !response || response.ok === false){
          appCapturePending = null;
          bridgeControlPost("RL_APP_CAPTURE_RESULT", {
            cancelled:true,
            tabId:tabId,
            error:"unavailable"
          });
        }
        /* on success the worker's RL_CAPTURE_RESULT finishes the flow */
      });
    });
  }

  function handleAppCaptureCancel(data){
    if(role !== "dock") return;
    if(!data || !bridgeAllowedOrigin(data.pageOrigin)) return;
    var pending = appCapturePending;
    appCapturePending = null;
    if(!pending) return;
    if(data.tabId !== undefined && Number(data.tabId) !== pending.tabId) return;
    sendRuntime({ type:"RL_CAPTURE_CANCEL", tabId:pending.tabId });
  }

  function handleAppPickRuntime(message){
    if(!appPickPending) return;
    if(message.type === "RL_PICK_RESULT"){
      var flow = appPickPending;
      appPickPending = null;
      var pick = {
        tabId:flow.tabId,
        selector:typeof message.selector === "string" ? message.selector.slice(0, 4000) : "",
        page:typeof message.page === "string" ? message.page.slice(0, 2048) : "",
        label:typeof message.label === "string" ? message.label.slice(0, 400) : "",
        tag:typeof message.tag === "string" ? message.tag.slice(0, 64) : "",
        text:typeof message.text === "string" ? message.text.slice(0, 240) : "",
        capture:flow.capture === true,
        captureError:message.captureError === true
      };
      var pickImage = appImageDataUrl(message.dataUrl);
      if(pickImage){
        pick.dataUrl = pickImage;
        pick.width = appImageDimension(message.width);
        pick.height = appImageDimension(message.height);
      }
      bridgeControlPost("RL_APP_PICK_RESULT", pick);
      return;
    }
    if(message.type === "RL_PICK_CANCELLED"){
      var cancelled = appPickPending;
      appPickPending = null;
      bridgeControlPost("RL_APP_PICK_RESULT", {
        cancelled:true,
        tabId:cancelled.tabId,
        reason:typeof message.reason === "string" ? message.reason.slice(0, 64) : "cancelled"
      });
    }
  }

  function handleAppCaptureRuntime(message){
    if(!appCapturePending) return false;
    if(message.type === "RL_CAPTURE_RESULT"){
      var flow = appCapturePending;
      appCapturePending = null;
      var image = appImageDataUrl(message.dataUrl);
      bridgeControlPost("RL_APP_CAPTURE_RESULT", {
        tabId:flow.tabId,
        dataUrl:image,
        width:appImageDimension(message.width),
        height:appImageDimension(message.height)
      });
      return true;
    }
    if(message.type === "RL_CAPTURE_CANCELLED"){
      var cancelled = appCapturePending;
      appCapturePending = null;
      bridgeControlPost("RL_APP_CAPTURE_RESULT", {
        cancelled:true,
        tabId:cancelled.tabId,
        reason:typeof message.reason === "string" ? message.reason.slice(0, 64) : "cancelled"
      });
      return true;
    }
    return false;
  }

  function bridgeNotifyChange(){
    if(bridgeSuppress || !hasHost || !activeProjectId || bridgeServerStopped) return;
    /* Never push the panel's project into a different app project. */
    if(bridgePeerProjectId && bridgePeerProjectId !== activeProjectId){
      bridgeProjectMismatch = true;
      updateBridgeUI();
      return;
    }
    bridgeCollectDeletes();
    if(bridgeSendTimer){ clearTimeout(bridgeSendTimer); bridgeSendTimer = null; }
    bridgeSendTimer = setTimeout(function(){
      bridgeSendTimer = null;
      bridgePost("RL_APP_PATCH");
      bridgeSendPendingMedia(false);
    }, 120);
  }

  function bridgeHasData(requests, project, projectCreated){
    if(Array.isArray(requests) && requests.length > 0) return true;
    if(projectCreated === false) return false;
    return String(project == null ? "" : project).trim().length > 0;
  }

  function bridgeMergeRequests(incoming, deletedIds, stamp){
    var byId = {};
    var order = [];
    (app && Array.isArray(app.requests) ? app.requests : []).forEach(function(req){
      if(!req || !req.id) return;
      byId[req.id] = req;
      order.push(req.id);
    });

    (Array.isArray(deletedIds) ? deletedIds : []).forEach(function(id){
      if(typeof id !== "string" || !id) return;
      var local = byId[id];
      if(local && local.updatedAt && String(local.updatedAt) > String(stamp || "")) return;
      delete byId[id];
      bridgeRememberTombstone(id, stamp || bridgeNow());
      var at = order.indexOf(id);
      if(at >= 0) order.splice(at, 1);
    });

    (Array.isArray(incoming) ? incoming : []).forEach(function(raw, index){
      if(!raw || typeof raw.id !== "string" || !raw.id) return;
      if(bridgeTombstones[raw.id] && String(bridgeTombstones[raw.id]) >= String(raw.updatedAt || "")) return;
      var local = byId[raw.id];
      /* Equal timestamps keep the local object: replacing on a tie would let a
         lagging peer erase a just-written field during the same revision. */
      if(local && String(local.updatedAt || "") >= String(raw.updatedAt || "")) return;
      var normalized = core && core.requests && core.requests.normalize
        ? core.requests.normalize(raw, index)
        : raw;
      /* Metadata crosses with the request; blobs travel separately. Keep a
         local-only id so it can still be uploaded to the other surface. */
      normalized.images = bridgeMergeMedia(raw.images, local && local.images, "image");
      normalized.attachments = bridgeMergeMedia(raw.attachments, local && local.attachments, "file");
      normalized.collapsed = local ? local.collapsed !== false : true;
      if(!local) order.push(normalized.id);
      byId[normalized.id] = normalized;
    });

    var merged = [];
    order.forEach(function(id){ if(byId[id]) merged.push(byId[id]); });
    Object.keys(byId).forEach(function(id){ if(order.indexOf(id) < 0) merged.push(byId[id]); });
    return merged;
  }

  function bridgeNormalizedAgents(list){
    if(!Array.isArray(list)) return null;
    var out = [];
    list.forEach(function(raw){
      if(!raw || typeof raw !== "object") return;
      out.push({
        id:String(raw.id || ""),
        name:String(raw.name || "").slice(0, 80),
        role:String(raw.role || "general"),
        mdPath:String(raw.mdPath || raw.mdFile || "").slice(0, 300)
      });
    });
    return out;
  }

  function bridgeApplyLanguage(lang){
    var next = lang === "tr" ? "tr" : "en";
    if(state.lang === next) return;
    state.lang = next;
    document.documentElement.lang = next;
    if(core && core.i18n && core.i18n.setLanguage) core.i18n.setLanguage(next);
    if(role === "dock") refreshDockLabels();
    else if(state.section) renderFlyout(state.section);
  }

  function bridgeProjectIdValid(projectId){
    return typeof projectId === "string" && /^prj_[A-Za-z0-9_]+$/.test(projectId);
  }

  /* On HELLO the panel selects the app's project. If this profile has no
     project with that id yet, it creates one from the app payload before any
     ledger data is applied. */
  function bridgeAdoptProject(projectId, projectName, data){
    if(!bridgeProjectIdValid(projectId)) return false;
    var registry = readRegistry() || emptyProjectRegistry();
    var project = findProjectRecordIn(registry, projectId);
    var created = !project;
    var displayName = normalizeProjectName(projectName) || importedProjectName(data && data.language);
    var stamp = data && typeof data.updatedAt === "string" && data.updatedAt ? data.updatedAt : bridgeNow();
    var peerLedgerId = data && typeof data.ledgerId === "string" ? normalizeLedgerId(data.ledgerId) : "";
    if(!project){
      project = {
        id:projectId,
        name:displayName,
        createdAt:stamp,
        updatedAt:stamp,
        ledgerId:peerLedgerId,
        exportTarget:"",
        archiveCollapsed:false
      };
      registry.projects.push(project);
    }else{
      if(displayName) project.name = displayName;
      if(peerLedgerId) project.ledgerId = peerLedgerId;
    }
    registry.activeId = projectId;
    if(!writeRegistry(registry)) return false;

    /* No seed ledger: openProjectById starts from the app payload when the
       project is new, and bridgeApply writes the first app state. This avoids
       a dock/flyout race where one frame overwrites the other's seeded data. */

    bridgeAdoptingProject = true;
    bridgeSuppress++;
    try{
      if(activeProjectId && activeProjectId !== projectId) saveNow();
      /* A HELLO/adoption is not a user action: preserve the closed section or
         the section the user explicitly opened. */
      openProjectById(projectId, { preserveSection:true });
      bridgeLoadTombstones();
      bridgeResetKnownIds();
      bridgeLedgerSynced = false;
      bridgeConflict = false;
      bridgePeerHello = null;
      bridgeProjectMismatch = false;
      bridgeAdoptedNewProject = created;
    }finally{
      bridgeSuppress--;
      bridgeAdoptingProject = false;
    }
    return true;
  }

  /* mode: "merge" (item-level) or "replace" (the user chose this ledger) */
  function bridgeApply(data, mode){
    if(!app) return false;
    var incomingProjectId = bridgeEnvelopeProjectId(data);
    if(activeProjectId && incomingProjectId !== activeProjectId){
      bridgeRecordReject("project-mismatch", data, { incomingProjectId: incomingProjectId });
      return false;
    }
    var incoming = Array.isArray(data.requests) ? data.requests : (Array.isArray(data.upserts) ? data.upserts : []);
    var storageSaved = true;
    var stamp = typeof data.updatedAt === "string" ? data.updatedAt : "";
    if(typeof data.ledgerId === "string" && data.ledgerId) bridgePeerLedgerId = data.ledgerId;
    bridgePeerRequestCount = incoming.length;

    var signature = bridgeSignatureFromData(data);
    if(signature && signature === bridgeStateSignature()){
      bridgeStats.echoes++;
      return false;
    }

    bridgeSuppress++;
    try{
      if(mode === "replace"){
        /* A chosen ledger starts clean: old tombstones belong to the
           losing ledger and must never delete the winner's requests. */
        bridgeTombstones = {};
        bridgeSaveTombstones();
        app.requests = [];
        incoming.forEach(function(raw, index){
          if(!raw || typeof raw.id !== "string" || !raw.id) return;
          var normalized = core && core.requests && core.requests.normalize
            ? core.requests.normalize(raw, index)
            : raw;
          normalized.images = bridgeMediaList(raw.images, "image");
          normalized.attachments = bridgeMediaList(raw.attachments, "file");
          app.requests.push(normalized);
        });
        var replacedName = bridgeEnvelopeProjectName(data);
        if(replacedName){
          app.project = replacedName;
        }
        var agents = bridgeNormalizedAgents(data.agents);
        if(agents) app.agents = agents;
        if(data.language === "tr" || data.language === "en") app.language = data.language;
        if(["last","instant"].indexOf(data.exportBehavior) >= 0) app.exportBehavior = data.exportBehavior;
        else app.exportBehavior = "default";
        if(typeof data.ledgerId === "string" && data.ledgerId) app.ledgerId = data.ledgerId;
      }else{
        app.requests = bridgeMergeRequests(incoming, data.deletedIds, stamp);
        var metaNewer = !app.updatedAt || String(stamp) > String(app.updatedAt);
        if(metaNewer){
          var incomingName = bridgeEnvelopeProjectName(data);
          if(incomingName && data.projectCreated !== false) app.project = incomingName;
          var nextAgents = bridgeNormalizedAgents(data.agents);
          if(nextAgents) app.agents = nextAgents;
          if(data.language === "tr" || data.language === "en") app.language = data.language;
          if(["last","instant"].indexOf(data.exportBehavior) >= 0) app.exportBehavior = data.exportBehavior;
        }
        if(!app.requests.length && !String(app.project || "").trim() && typeof data.ledgerId === "string" && data.ledgerId){
          app.ledgerId = data.ledgerId;
        }
      }

      if(core && core.storage && core.storage.saveState){
        storageSaved = false;
        for(var saveAttempt = 0; saveAttempt < 2; saveAttempt += 1){
          try{ storageSaved = core.storage.saveState(app) !== false; }catch(err){ storageSaved = false; }
          if(storageSaved) break;
        }
      }
      bridgeRefreshHoldUntil = Date.now() + 1500;
      /* The project registry owns the name and the one ledger id; keep both
         aligned with the app so a stop/start never prompts again. */
      touchActiveProject(app.project, app.updatedAt || stamp || bridgeNow(), app.ledgerId);
      if(typeof setProjectLedgerId === "function") setProjectLedgerId(activeProjectId, app.ledgerId);
      if(mode === "replace") bridgeLedgerSynced = true;
      if(typeof resetProjectSnapshot === "function") resetProjectSnapshot();
      bridgeApplyLanguage(app.language);
      bridgeResetKnownIds();
      bridgeLastAppliedHash = bridgeStateSignature();
    }finally{
      bridgeSuppress--;
    }

    /* Metadata that just arrived through the bridge is expected to be
       followed by its blob. Mark it before the first render so the loading
       state wins the race with the async storage read. */
    incoming.forEach(function(raw){
      if(!raw || typeof raw !== "object") return;
      (Array.isArray(raw.images) ? raw.images : []).forEach(function(img){
        if(img && img.id) bridgeMediaMarkPending("image", img.id);
      });
      (Array.isArray(raw.attachments) ? raw.attachments : []).forEach(function(att){
        if(att && att.id) bridgeMediaMarkPending("file", att.id);
      });
    });
    if(storageSaved){
      if(typeof clearStorageFailure === "function") clearStorageFailure();
      reloadSharedState(incomingProjectId || activeProjectId);
    }else{
      /* A failed write must never be followed by a storage reload: it would
         discard the just-applied bridge data (including a Ready confirmation)
         and the next refresh would push that stale copy back to the app. */
      if(typeof setStorageFailure === "function"){
        setStorageFailure(core && core.storage && core.storage.getLastSaveError
          ? core.storage.getLastSaveError()
          : null);
      }
      if(typeof updateDockBadges === "function") updateDockBadges();
      if(role === "flyout" && state.section) renderFlyout(state.section);
    }
    updateBridgeUI();
    bridgeStats.applied++;
    setTimeout(function(){ bridgeSendPendingMedia(false); bridgeRequestMissingMedia(); }, 0);
    return true;
  }

  function bridgeSignatureFromData(data){
    var requests = Array.isArray(data.requests) ? data.requests : (Array.isArray(data.upserts) ? data.upserts : []);
    var rows = [];
    (requests || []).forEach(function(req){
      if(!req || !req.id) return;
      rows.push([
        req.id, req.type, req.title, req.page, req.location, req.consoleError,
        req.description, req.priority, req.link, req.sampleWebsite, req.note,
        req.confirmed ? 1 : 0, req.updatedAt || ""
      ].join("\u001f"));
    });
    rows.sort();
    var agents = [];
    (Array.isArray(data.agents) ? data.agents : []).forEach(function(agent){
      agents.push([agent.id, agent.name, agent.role, agent.mdPath].join("\u001f"));
    });
    agents.sort();
    return bridgeHash([
      bridgeEnvelopeProjectId(data),
      String(data.project == null ? "" : data.project),
      data.language === "tr" ? "tr" : "en",
      data.exportBehavior || "default",
      agents.join("\u001e"),
      rows.join("\u001e"),
      (Array.isArray(data.deletedIds) ? data.deletedIds.slice().sort().join("\u001f") : "")
    ].join("\u001d"));
  }

  function bridgeStateSignature(){
    if(!app) return "";
    var requests = (app.requests || []).map(function(req){
      return [
        req.id, req.type, req.title, req.page, req.location, req.consoleError,
        req.description, req.priority, req.link, req.sampleWebsite, req.note,
        req.confirmed ? 1 : 0, req.updatedAt || ""
      ].join("\u001f");
    }).sort();
    var agents = (app.agents || []).map(function(agent){
      return [agent.id, agent.name, agent.role, agent.mdPath].join("\u001f");
    }).sort();
    return bridgeHash([
      activeProjectId || "",
      String(app.project || ""),
      app.language === "tr" ? "tr" : "en",
      app.exportBehavior || "default",
      agents.join("\u001e"),
      requests.join("\u001e"),
      bridgeTombstoneIds().join("\u001f")
    ].join("\u001d"));
  }

  /* ---------- incoming host messages ---------- */

  function bridgeMarkHeard(){
    bridgeConnected = true;
    bridgeLastHeard = Date.now();
    updateBridgeUI();
  }

  function handleBridgeHello(data){
    if(Number(data.v) !== BRIDGE_VERSION) return;
    bridgeMarkHeard();
    if(typeof data.pageOrigin === "string" && bridgeAllowedOrigin(data.pageOrigin)) bridgePageOrigin = data.pageOrigin;

    /* Phase 2c: HELLO selects the same local project (or creates it from the
       app payload). The panel never applies another project's ledger. */
    var peerProjectId = bridgeEnvelopeProjectId(data);
    var adoptedNewProject = false;
    /* A HELLO without a project identity cannot be assigned to the open
       project; wait for the app to identify its project. */
    if(activeProjectId && !peerProjectId) return;
    if(peerProjectId && peerProjectId !== activeProjectId){
      if(!bridgeAdoptProject(peerProjectId, bridgeEnvelopeProjectName(data), data)){
        bridgeRecordReject("project-adopt-failed", data, { reason: "HELLO project could not be adopted" });
        bridgePeerProjectId = peerProjectId;
        bridgeProjectMismatch = true;
        updateBridgeUI();
        return;
      }
      adoptedNewProject = bridgeAdoptedNewProject;
      bridgeAdoptedNewProject = false;
    }
    if(peerProjectId) bridgePeerProjectId = peerProjectId;
    bridgeProjectMismatch = false;
    if(typeof data.ledgerId === "string" && data.ledgerId) bridgePeerLedgerId = data.ledgerId;
    if(Array.isArray(data.requests)) bridgePeerRequestCount = data.requests.length;
    /* A project created from the app payload starts with the app's ledger id. */
    if(adoptedNewProject && typeof data.ledgerId === "string" && data.ledgerId) app.ledgerId = data.ledgerId;

    var pageHas = bridgeHasData(data.requests, bridgeEnvelopeProjectName(data) || data.project, data.projectCreated === false ? false : true);
    var pageRequestCount = Array.isArray(data.requests) ? data.requests.length : 0;
    /* A local project with no requests holds no user data worth protecting;
       it is adopted from the app instead of opening a ledger conflict. */
    var panelHas = !!(app && Array.isArray(app.requests) && app.requests.length > 0);
    /* Empty panel project: take the app's ledger id even when both sides are
       empty and bridgeApply() would treat it as an echo. This is what keeps
       two panel frames from saving different ledger ids for one project. */
    if(peerProjectId === activeProjectId && !panelHas &&
       typeof data.ledgerId === "string" && data.ledgerId &&
       String(app.ledgerId) !== String(data.ledgerId)){
      app.ledgerId = data.ledgerId;
      if(typeof setProjectLedgerId === "function") setProjectLedgerId(activeProjectId, app.ledgerId);
      if(core && core.storage && core.storage.saveState){
        try{ core.storage.saveState(app); }catch(err){ /* first save retries */ }
      }
    }

    if(data.resolution === "app"){
      bridgeConflict = false;
      bridgePeerHello = null;
      bridgeLedgerSynced = true;
      bridgeApply(data, "replace");
      bridgePost("RL_APP_ACK", { conflict:false, resolution:"app", ledgerId:app.ledgerId });
      updateBridgeUI();
      return;
    }
    if(data.resolution === "extension"){
      bridgeConflict = false;
      bridgePeerHello = null;
      bridgeLedgerSynced = true;
      bridgePost("RL_APP_ACK", { conflict:false, resolution:"extension", ledgerId:app.ledgerId });
      bridgePost("RL_APP_SNAPSHOT", { resolution:"extension" });
      updateBridgeUI();
      return;
    }

    var sameProject = Boolean(peerProjectId && activeProjectId && peerProjectId === activeProjectId);
    if(sameProject && !adoptedNewProject && data.ledgerId && app.ledgerId &&
       String(data.ledgerId) !== String(app.ledgerId) && pageRequestCount > 0 && panelHas){
      bridgeCaptureConflict(data.type, data);
      bridgeConflict = true;
      bridgePeerHello = data;
      bridgePost("RL_APP_ACK", { conflict:true, ledgerId:app.ledgerId });
      bridgePost("RL_APP_SNAPSHOT");
      updateBridgeUI();
      return;
    }

    if(!panelHas && !pageHas){
      bridgeConflict = false;
      bridgePeerHello = null;
      bridgePost("RL_APP_ACK", { conflict:false, ledgerId:app.ledgerId });
      bridgePost("RL_APP_SNAPSHOT");
      updateBridgeUI();
      return;
    }

    if(!panelHas && pageHas){
      bridgeApply(data, "replace");
      bridgeLedgerSynced = true;
    }else{
      bridgeApply(data, "merge");
    }
    bridgeConflict = false;
    bridgePeerHello = null;
    bridgePost("RL_APP_ACK", { conflict:false, ledgerId:app.ledgerId });
    bridgePost("RL_APP_SNAPSHOT");
    updateBridgeUI();
  }

  function handleBridgePatch(data){
    if(Number(data.v) !== BRIDGE_VERSION) return;
    bridgeMarkHeard();
    var peerProjectId = bridgeEnvelopeProjectId(data);
    if(activeProjectId && peerProjectId !== activeProjectId){
      if(!activeProjectId && bridgeAdoptProject(peerProjectId, bridgeEnvelopeProjectName(data), data)){
        /* adopted, fall through and merge the patch */
      }else{
        bridgePeerProjectId = peerProjectId;
        bridgeProjectMismatch = true;
        updateBridgeUI();
        return;
      }
    }
    if(peerProjectId) bridgePeerProjectId = peerProjectId;
    bridgeProjectMismatch = false;
    if(bridgeConflict) return; /* wait for the user's ledger decision */

    var incomingRequestCount = (Array.isArray(data.upserts) ? data.upserts.length : (Array.isArray(data.requests) ? data.requests.length : 0));
    if(peerProjectId === activeProjectId && data.ledgerId && app.ledgerId &&
       String(data.ledgerId) !== String(app.ledgerId) &&
       incomingRequestCount > 0 && app.requests.length > 0){
      bridgeCaptureConflict(data.type, data);
      bridgeConflict = true;
      bridgePeerHello = data;
      bridgePost("RL_APP_ACK", { conflict:true, ledgerId:app.ledgerId });
      updateBridgeUI();
      return;
    }
    /* The app is the hub: an empty extension adopts its ledger id before
       recording the first mirrored project/request. */
    if(!bridgeLedgerSynced && typeof data.ledgerId === "string" && data.ledgerId){
      app.ledgerId = data.ledgerId;
      if(typeof setProjectLedgerId === "function") setProjectLedgerId(activeProjectId, app.ledgerId);
      bridgeLedgerSynced = true;
    }

    bridgeApply(data, "merge");
    bridgePost("RL_APP_ACK", { conflict:false, ledgerId:app.ledgerId });
    updateBridgeUI();
  }

  function handleBridgeAck(data){
    if(Number(data.v) !== BRIDGE_VERSION) return;
    bridgeMarkHeard();
    var peerProjectId = bridgeEnvelopeProjectId(data);
    if(activeProjectId && peerProjectId !== activeProjectId){
      if(peerProjectId || data.conflict === true){
        bridgePeerProjectId = peerProjectId;
        bridgeProjectMismatch = true;
        bridgeConflict = false;
        updateBridgeUI();
        if(data.heartbeat === true){
          bridgePost("RL_APP_ACK", { heartbeat:true, ledgerId:app.ledgerId, requests:[], agents:[], deletedIds:[] });
        }
        return;
      }
    }
    if(peerProjectId) bridgePeerProjectId = peerProjectId;
    bridgeProjectMismatch = false;
    if(typeof data.ledgerId === "string" && data.ledgerId) bridgePeerLedgerId = data.ledgerId;
    if(!data.heartbeat && Array.isArray(data.requests)) bridgePeerRequestCount = data.requests.length;
    if(data.heartbeat === true){
      bridgePost("RL_APP_ACK", { heartbeat:true, ledgerId:app.ledgerId });
      return;
    }
    if(data.conflict === true && !bridgeConflict){
      bridgeConflict = true;
      updateBridgeUI();
    }
    if(data.resolution === "extension"){
      bridgeConflict = false;
      bridgePeerHello = null;
      bridgePost("RL_APP_SNAPSHOT", { resolution:"extension" });
      updateBridgeUI();
    }else if(data.resolution === "app"){
      bridgeConflict = false;
      bridgePeerHello = null;
      updateBridgeUI();
    }
  }

  function handleBridgeBye(){
    if(bridgeServerStopped) return;
    bridgeConnected = false;
    companionPresence = { checked:true, open:false, mode:"", port:companionPresence.port || 0, origin:"", lastAt:Date.now() };
    bridgeLastHeard = 0;
    bridgePeerProjectId = "";
    bridgePeerLedgerId = "";
    bridgePeerRequestCount = 0;
    bridgeProjectMismatch = false;
    updateBridgeUI();
  }

  /* Explicit stop from the app. The extension keeps its own local ledger
     available, but the bridge is disconnected and applies no traffic until a
     fresh HELLO proves the same port is back. */
  function bridgeBroadcastServerStop(){
    try{
      if(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage){
        chrome.runtime.sendMessage({ type:"RL_SERVER_STOP" }, function(){ /* no panel listener */ });
      }
    }catch(err){ /* ignore */ }
  }

  function bridgeBroadcastServerResume(){
    try{
      if(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage){
        chrome.runtime.sendMessage({ type:"RL_SERVER_RESUME" }, function(){ /* no panel listener */ });
      }
    }catch(err){ /* ignore */ }
  }

  function handleBridgeServerStop(remote){
    if(bridgeServerStopped && remote) return;
    var wasStopped = bridgeServerStopped;
    bridgeServerStopped = true;
    bridgeConnected = false;
    bridgeLastHeard = 0;
    companionPresence = { checked:true, open:false, mode:"", port:companionPresence.port || 0, origin:"", lastAt:Date.now() };
    bridgeConflict = false;
    bridgePeerHello = null;
    bridgePeerProjectId = "";
    bridgePeerLedgerId = "";
    bridgePeerRequestCount = 0;
    bridgeProjectMismatch = false;
    updateBridgeUI();
    if(!remote) bridgeBroadcastServerStop();
    if(!wasStopped && role === "dock") toast(lx("bridgeServerStopped"), "error");
  }

  function clearBridgeServerStop(remote){
    if(!bridgeServerStopped) return;
    bridgeServerStopped = false;
    bridgeLedgerSynced = false;
    updateBridgeUI();
    if(!remote) bridgeBroadcastServerResume();
  }

  function onBridgeHostMessage(data){
    if(!data || typeof data !== "object") return;
    if(data.source !== "request-ledger-host") return;
    if(typeof data.pageOrigin === "string" && bridgeAllowedOrigin(data.pageOrigin)) bridgePageOrigin = data.pageOrigin;
    if(data.type === "RL_BRIDGE_CONTEXT"){
      panelPageToken = typeof data.pageToken === "string" ? data.pageToken : "";
      return;
    }
    if(data.type === "RL_APP_SERVER_STOP"){
      handleBridgeServerStop(false);
      return;
    }
    if(data.type === "RL_APP_MEDIA"){
      bridgeHandleMedia(data);
      return;
    }
    if(data.type === "RL_APP_MEDIA_REQUEST"){
      var mediaIds = {};
      (Array.isArray(data.ids) ? data.ids : []).slice(0, 100).forEach(function(value){ mediaIds[String(value)] = true; });
      (app && Array.isArray(app.requests) ? app.requests : []).forEach(function(req){
        (Array.isArray(req.images) ? req.images : []).forEach(function(img){
          if(mediaIds["image:" + img.id]) bridgeSendMediaItem(req, img, "image", true);
        });
        (Array.isArray(req.attachments) ? req.attachments : []).forEach(function(att){
          if(mediaIds["file:" + att.id]) bridgeSendMediaItem(req, att, "file", true);
        });
      });
      return;
    }
    if(bridgeServerStopped){
      /* Only a fresh app boot (HELLO) proves the server is back. */
      if(data.type !== "RL_APP_HELLO") return;
      clearBridgeServerStop(false);
    }
    bridgeStats.received++;
    if(data.type === "RL_APP_TABS_REQUEST"){
      if(!bridgeAllowedOrigin(data.pageOrigin)) return;
      handleAppTabsRequest(data);
      return;
    }
    if(data.type === "RL_APP_PICK_REQUEST"){
      if(!bridgeAllowedOrigin(data.pageOrigin)) return;
      handleAppPickRequest(data);
      return;
    }
    if(data.type === "RL_APP_PICK_CANCEL"){
      if(!bridgeAllowedOrigin(data.pageOrigin)) return;
      handleAppPickCancel(data);
      return;
    }
    if(data.type === "RL_APP_CAPTURE_REQUEST"){
      if(!bridgeAllowedOrigin(data.pageOrigin)) return;
      handleAppCaptureRequest(data);
      return;
    }
    if(data.type === "RL_APP_CAPTURE_CANCEL"){
      if(!bridgeAllowedOrigin(data.pageOrigin)) return;
      handleAppCaptureCancel(data);
      return;
    }
    if(data.type === "RL_APP_HELLO"){ handleBridgeHello(data); return; }
    if(data.type === "RL_APP_PATCH"){ handleBridgePatch(data); return; }
    if(data.type === "RL_APP_ACK"){ handleBridgeAck(data); return; }
    if(data.type === "RL_APP_BYE"){ handleBridgeBye(); return; }
    if(data.type === "RL_APP_SNAPSHOT"){ handleBridgeHello(data); return; }
  }

  /* ---------- first-connect decision / status UI ---------- */

  function bridgeChoiceApp(){
    if(!bridgePeerHello){ bridgeConflict = false; updateBridgeUI(); return; }
    var peer = bridgePeerHello;
    bridgeSuppress++;
    try{
      bridgePeerLedgerId = typeof peer.ledgerId === "string" ? peer.ledgerId : bridgePeerLedgerId;
      bridgePeerRequestCount = Array.isArray(peer.requests) ? peer.requests.length : 0;
      bridgeApply(peer, "replace");
      bridgeConflict = false;
      bridgePeerHello = null;
      bridgeLedgerSynced = true;
      bridgePost("RL_APP_ACK", { conflict:false, resolution:"app", ledgerId:app.ledgerId, requestState:true });
    }finally{
      bridgeSuppress--;
    }
    updateBridgeUI();
  }

  function bridgeChoiceExtension(){
    bridgeConflict = false;
    bridgePeerHello = null;
    bridgeLedgerSynced = true;
    if(typeof setProjectLedgerId === "function") setProjectLedgerId(activeProjectId, app.ledgerId);
    bridgePost("RL_APP_ACK", { conflict:false, resolution:"extension", ledgerId:app.ledgerId });
    bridgePost("RL_APP_SNAPSHOT", { resolution:"extension" });
    updateBridgeUI();
  }

  function updateBridgeUI(){
    var status = document.getElementById("rl-bridge-status");
    var text = document.getElementById("rl-bridge-text");
    var confirm = document.getElementById("rl-bridge-confirm");
    var mismatch = bridgeProjectMismatch || (!!bridgePeerProjectId && !!activeProjectId && bridgePeerProjectId !== activeProjectId);
    if(status){
      status.classList.toggle("is-on", bridgeConnected && !bridgeServerStopped && !bridgeConflict && !mismatch);
      status.classList.toggle("is-off", !bridgeConnected || bridgeServerStopped);
      status.classList.toggle("is-warn", bridgeConflict || mismatch);
      if(text) text.textContent = bridgeServerStopped
        ? lx("bridgeServerStopped")
        : bridgeConflict
          ? lx("bridgeConflictShort")
          : mismatch ? lx("bridgeDifferentProject")
          : bridgeConnected ? lx("bridgeConnected") : lx("bridgeOffline");
    }
    if(confirm) confirm.hidden = !bridgeConflict;
    var appBtn = document.getElementById("rl-bridge-use-app");
    var extBtn = document.getElementById("rl-bridge-use-extension");
    if(appBtn) appBtn.disabled = !bridgeConflict;
    if(extBtn) extBtn.disabled = !bridgeConflict;
    if(typeof updateCompanionLock === "function") updateCompanionLock();
  }

  function bridgeWatch(){
    if(bridgeWatchTimer){ clearInterval(bridgeWatchTimer); bridgeWatchTimer = null; }
    bridgeWatchTimer = setInterval(function(){
      if(!bridgeConnected) return;
      /* A backgrounded app tab throttles the page heartbeat; a hidden panel
         must not declare the bridge dead just because it is not focused. */
      if(document.visibilityState === "hidden") return;
      if(Date.now() - bridgeLastHeard > BRIDGE_STALE_MS){
        bridgeConnected = false;
        updateBridgeUI();
      }
    }, 2500);
  }

  /* Called by the panel when the user opens another project. If the new
     project matches the app's last announced project id, send the full
     snapshot; otherwise announce only the project so the app can show the
     mismatch without receiving another project's ledger. */
  function bridgeAnnounceProject(){
    if(!hasHost || !activeProjectId || bridgeAdoptingProject) return;
    var aligned = !!bridgePeerProjectId && bridgePeerProjectId === activeProjectId;
    bridgeConflict = false;
    bridgePeerHello = null;
    if(!aligned){
      bridgePeerLedgerId = "";
      bridgePeerRequestCount = 0;
    }
    bridgeLedgerSynced = aligned;
    bridgeProjectMismatch = !aligned;
    bridgeLoadTombstones();
    bridgeResetKnownIds();
    if(aligned){
      bridgePost("RL_APP_SNAPSHOT", { projectSwitch:true });
    }else{
      bridgePost("RL_APP_SNAPSHOT", {
        projectSwitch:true,
        requests:[],
        agents:[],
        deletedIds:[]
      });
    }
    updateBridgeUI();
  }

  /* The panel can be edited on another tab (its own extension storage is
     shared). When this tab becomes visible or the storage changes, reload the
     active project's ledger and push it through the bridge. No section is
     opened or re-rendered while closed. */
  function bridgeRefreshFromStorage(){
    if(!hasHost || bridgeSuppress || bridgeAdoptingProject) return;
    /* A local edit may still be inside the 380 ms save debounce, and a bridge
       apply just wrote a newer revision. Reloading storage in either window
       would overwrite the in-flight confirmation with the previous snapshot. */
    if(typeof saveTimer !== "undefined" && saveTimer) return;
    if(state.saving === "saving") return;
    if(Date.now() < bridgeRefreshHoldUntil) return;
    if(typeof storageOk !== "undefined" && !storageOk) return;
    /* A panel that mounted before the app created or selected a project still
       needs to adopt it. Project-registry storage events are the only signal a
       plain page gets (there is no bridge HELLO on that tab). Adoption is data
       only and never opens a section. */
    if(!activeProjectId){
      var registry = readRegistry();
      var nextId = registry && registry.activeId;
      if(nextId && findProjectRecordIn(registry, nextId)){
        openProjectById(nextId, { preserveSection:true });
      }
      return;
    }
    /* A pick/capture result is being written; do not reload the old ledger
       over it while the panel returns from the overlay. */
    if(typeof pickPending !== "undefined" && pickPending) return;
    if(typeof capturePending !== "undefined" && capturePending) return;
    if(Date.now() < panelToolBusyUntil) return;
    var before = bridgeStateSignature();
    var projectId = activeProjectId;
    /* Load data-only first: a no-op storage event must not rebuild the
       focused section. Render only when the signature actually changed. */
    reloadSharedState(projectId, true);
    if(bridgeStateSignature() === before) return;
    if(role === "flyout" && state.section === "list"){
      updateList();
      renderArchiveProjectTree();
    }else if(role === "flyout" && state.section){
      renderFlyout(state.section);
    }
    /* Do not push local data over a different same-project app ledger while
       both sides hold requests. The user must choose; otherwise a storage
       refresh from the source ledger would silently overwrite the app. An
       empty local side may still adopt the non-empty peer. */
    if(bridgeConflict || (bridgePeerLedgerId && app.ledgerId &&
       String(bridgePeerLedgerId) !== String(app.ledgerId) &&
       bridgePeerRequestCount > 0 && app.requests.length > 0)){
      return;
    }
    bridgeNotifyChange();
  }

  function initAppBridge(){
    if(!hasHost) return;
    if(role !== "dock" && role !== "flyout") return;
    bridgeLoadTombstones();
    bridgeResetKnownIds();
    if(app && (app.requests.length > 0 || String(app.project || "").trim())) bridgeLedgerSynced = true;
    window.addEventListener("storage", function(event){
      if(!event || !event.key) return;
      if(event.key === PROJECTS_KEY){
        projectRegistry = readRegistry();
        if(typeof syncProjectGate === "function") syncProjectGate(true);
        if(typeof refreshProjectViews === "function") refreshProjectViews();
        bridgeRefreshFromStorage();
      }else if(activeProjectId && event.key === projectLedgerKey(activeProjectId)){
        bridgeRefreshFromStorage();
      }
    });
    document.addEventListener("visibilitychange", function(){
      if(document.visibilityState === "visible") bridgeRefreshFromStorage();
    });
    window.addEventListener("focus", bridgeRefreshFromStorage);
    window.addEventListener("pageshow", bridgeRefreshFromStorage);
    bridgeWatch();
    /* Advertise our ledger once the panel is ready. The host drops this on
       non-allowlisted pages, so no data leaves the two approved origins. */
    setTimeout(function(){ bridgePost("RL_APP_SNAPSHOT"); }, 120);
    startCompanionProbe();
    if(!pendingFocusListenerOn){
      window.addEventListener("focus", flushPendingFlyoutFocus);
      pendingFocusListenerOn = true;
    }
    try{
      window.__rlBridgePanel = Object.freeze({
        connected:function(){ return bridgeConnected; },
        serverStopped:function(){ return bridgeServerStopped; },
        conflict:function(){ return bridgeConflict; },
        conflictInfo:function(){ return bridgeConflictInfo; },
        rejects:function(){ return bridgeRejects.slice(); },
        projectId:function(){ return activeProjectId || ""; },
        projectName:function(){ return app && typeof app.project === "string" ? app.project : ""; },
        mismatch:function(){ return bridgeProjectMismatch || (!!bridgePeerProjectId && !!activeProjectId && bridgePeerProjectId !== activeProjectId); },
        ledgerId:function(){ return app && app.ledgerId ? app.ledgerId : ""; },
        stats:function(){ return { sent:bridgeStats.sent, patches:bridgeStats.patches, received:bridgeStats.received, applied:bridgeStats.applied, echoes:bridgeStats.echoes }; },
        pageToken:function(){ return panelPageToken; },
        pageOrigin:function(){ return bridgePageOrigin; },
        tabId:function(){ return panelTabScope; },
        requests:function(){
          return app && Array.isArray(app.requests) ? app.requests.map(function(req){
            return { id:req.id, images:(req.images || []).length, attachments:(req.attachments || []).length,
              confirmed:req.confirmed === true, updatedAt:req.updatedAt || "" };
          }) : [];
        },
        presence:function(){ return { checked:companionPresence.checked, open:companionPresence.open, mode:companionPresence.mode, port:companionPresence.port }; },
        locked:function(){ return companionOverlayLocked(); }
      });
    }catch(err){ /* ignore */ }
  }
