  /* ============================================================
     Live bridge — web app side

     The allowlisted web origins, loopback ports and file: pages participate.
     A file page has an opaque "null" origin, so only that case posts with
     targetOrigin "*"; event.source and the host marker remain mandatory.
     Every host message is validated before it can touch state.

     Media is not transported here. Text fields merge; images and
     attachments stay local to each surface and travel only in a ZIP
     backup. See extension/docs/panel-protocol.md.
     ============================================================ */

  const BRIDGE_ORIGINS = ["http://localhost:8080"];
  /* The launcher can serve on a free port, so every localhost and loopback
     port is a valid companion origin. A file: page has the opaque origin
     "null"; it is trusted only because the user opened the local HTML file
     and the extension host is present in that same document. */
  const BRIDGE_LOCAL_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::[0-9]{1,5})?$/;
  const BRIDGE_FILE_ORIGIN = "null";
  const BRIDGE_VERSION = 1;
  const BRIDGE_TOMBSTONE_KEY = "gd-bridge-tombstones-v1";
  const BRIDGE_TOMBSTONE_DAYS = 30;
  const BRIDGE_TOMBSTONE_MAX = 500;

  let bridgeConnected = false;
  let bridgeServerStopped = false;
  let bridgeLastHeard = 0;
  let bridgeConflictOpen = false;
  let bridgeResolved = false;
  let bridgeStateSent = false;
  let bridgeForceApply = false;
  let bridgeRejectedLedgerId = "";
  let bridgeRejectedLedgerAt = 0;
  let bridgePeerSnapshot = null;
  let bridgeSuppress = 0;
  let bridgeSendTimer = null;
  let bridgeHeartbeat = null;
  let bridgeLastHash = "";
  let bridgeLastLedger = "";
  let bridgeTombstones = {};
  let bridgeKnownIds = {};
  /* Phase 2c: the bridge is project-aware. Every envelope carries the open
     project's id and name; data from another project is never merged. */
  let bridgePeerProjectId = "";
  let bridgeProjectMismatch = false;
  /* A panel that mounts after this page booted never saw the boot HELLO, so
     it cannot detect a ledger conflict on its own. These flags make the page
     re-announce itself once per empty-panel state and once per conflict. */
  let bridgePeerEmptyAsked = false;
  let bridgePeerOutdated = false;
  let bridgeOutdatedNotified = false;
  let bridgeOutdatedSeen = false;
  const bridgeStats = { sent:0, patches:0, received:0, applied:0, echoes:0, media:0 };
  /* Rejected envelopes and the exact conflict evidence are kept in memory so
     the UI/E2E can explain a prompt instead of silently diverging. */
  const BRIDGE_DIAGNOSTIC_MAX = 50;
  const bridgeRejects = [];
  let bridgeConflictInfo = null;

  function bridgeEnvelopeRequestCount(data){
    if(!data) return 0;
    if(Array.isArray(data.requests)) return data.requests.length;
    if(Array.isArray(data.upserts)) return data.upserts.length;
    return 0;
  }

  function bridgeRecordReject(reason, data, extra){
    const record = {
      at: nowISO(),
      reason: reason,
      type: data && typeof data.type === "string" ? data.type : "",
      projectId: bridgeEnvelopeProjectId(data),
      ledgerId: data && typeof data.ledgerId === "string" ? data.ledgerId : "",
      requestCount: bridgeEnvelopeRequestCount(data),
      appProjectId: activeProjectId || "",
      appLedgerId: state.ledgerId || "",
      detail: extra || null
    };
    bridgeRejects.push(record);
    if(bridgeRejects.length > BRIDGE_DIAGNOSTIC_MAX) bridgeRejects.shift();
    try{ console.warn("[rl-bridge] rejected envelope", record); }catch(err){ /* ignore */ }
    return record;
  }

  function bridgeCaptureConflict(source, data){
    const appProject = activeProjectId ? findProjectRecord(activeProjectId) : null;
    const registry = readRegistry();
    bridgeConflictInfo = {
      at: nowISO(),
      source: source || "RL_APP_SNAPSHOT",
      app: {
        projectId: activeProjectId || "",
        ledgerId: state.ledgerId || "",
        requestCount: state.requests.length
      },
      panel: {
        projectId: bridgeEnvelopeProjectId(data),
        ledgerId: data && typeof data.ledgerId === "string" ? data.ledgerId : "",
        requestCount: bridgeEnvelopeRequestCount(data)
      },
      registry: {
        activeId: registry ? registry.activeId : null,
        recordLedgerId: appProject ? appProject.ledgerId : ""
      },
      stack: (new Error().stack || "").split("\n").slice(1, 7).join(" | ")
    };
    try{ console.warn("[rl-bridge] conflict evidence", bridgeConflictInfo); }catch(err){ /* ignore */ }
  }

  function bridgeTombstoneKey(){
    return BRIDGE_TOMBSTONE_KEY + ":" + (activeProjectId || "default");
  }
  function bridgeEnvelopeProjectId(data){
    return data && typeof data.projectId === "string" ? data.projectId : "";
  }
  function bridgeEnvelopeProjectName(data){
    const value = data && typeof data.projectName === "string" ? data.projectName : (data && typeof data.project === "string" ? data.project : "");
    return String(value == null ? "" : value).trim().slice(0, 60);
  }

  function bridgeFilePage(){
    try{ return window.location.protocol === "file:"; }
    catch(err){ return false; }
  }

  function bridgeOriginAllowed(origin){
    const value = String(origin == null ? "" : origin);
    return BRIDGE_ORIGINS.indexOf(value) >= 0 ||
      BRIDGE_LOCAL_ORIGIN.test(value) ||
      value === BRIDGE_FILE_ORIGIN;
  }

  function bridgeEnabled(){
    if(bridgeServerStopped) return false;
    try{
      if(bridgeFilePage()) return true;
      var origin = window.location.origin;
      /* "null" is only trusted through the explicit file: check above. */
      return origin !== BRIDGE_FILE_ORIGIN && bridgeOriginAllowed(origin);
    }
    catch(err){ return false; }
  }
  function bridgeServerStoppedState(){ return bridgeServerStopped; }
  /* Tell connected panels about an explicit user stop before disabling the
     bridge. Ordinary disconnect (BYE) is not the same thing: a stopped server
     is a deliberate, persistent state. */
  function bridgeAnnounceServerStop(){
    if(bridgeServerStopped) return;
    try{
      window.postMessage({
        source:"request-ledger-web",
        type:"RL_APP_SERVER_STOP",
        v:BRIDGE_VERSION,
        ledgerId:state.ledgerId,
        projectId:activeProjectId,
        projectName:state.project
      }, bridgePostTarget());
    }catch(err){ /* ignore */ }
  }
  function bridgeSetServerStopped(stopped){
    bridgeServerStopped = stopped === true;
    if(bridgeServerStopped){
      bridgeConnected = false;
      bridgeConflictOpen = false;
      bridgePeerSnapshot = null;
      if(bridgeHeartbeat){
        clearInterval(bridgeHeartbeat);
        bridgeHeartbeat = null;
      }
    }
    updateBridgeIndicator();
  }

  function bridgeEventOrigin(){
    return bridgeFilePage() ? BRIDGE_FILE_ORIGIN : window.location.origin;
  }

  /* The file: origin is opaque. Its own postMessage calls cannot pin a
     targetOrigin, so "*" is used only for that page. event.source and the
     host marker remain the guards. */
  function bridgePostTarget(){
    return bridgeFilePage() ? "*" : window.location.origin;
  }

  function bridgeHash(value){
    const text = String(value == null ? "" : value);
    let hash = 5381;
    for(let i = 0; i < text.length; i++){
      hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
      hash = hash >>> 0;
    }
    return hash.toString(36) + ":" + text.length;
  }

  function bridgeLoadTombstones(){
    bridgeTombstones = {};
    try{
      const raw = localStorage.getItem(bridgeTombstoneKey());
      if(!raw) return;
      const parsed = JSON.parse(raw);
      if(!parsed || typeof parsed !== "object") return;
      const cutoff = Date.now() - BRIDGE_TOMBSTONE_DAYS * 24 * 60 * 60 * 1000;
      Object.keys(parsed).forEach(function(id){
        const at = Date.parse(parsed[id]);
        if(!isNaN(at) && at >= cutoff) bridgeTombstones[id] = String(parsed[id]);
      });
    }catch(err){ /* ignore */ }
  }

  function bridgeSaveTombstones(){
    try{
      let ids = Object.keys(bridgeTombstones).sort();
      if(ids.length > BRIDGE_TOMBSTONE_MAX) ids = ids.slice(ids.length - BRIDGE_TOMBSTONE_MAX);
      const payload = {};
      ids.forEach(function(id){ payload[id] = bridgeTombstones[id]; });
      localStorage.setItem(bridgeTombstoneKey(), JSON.stringify(payload));
    }catch(err){ /* ignore */ }
  }

  function bridgeRememberTombstone(id, at){
    if(typeof id !== "string" || !id) return;
    bridgeTombstones[id] = at || nowISO();
    bridgeSaveTombstones();
  }

  /* A live id must never keep a tombstone: ids are reused when the highest
     request is deleted (nextId = max + 1), and a stale tombstone used to make
     every merge skip the re-created row on the peer and then delete it here. */
  function bridgeForgetTombstone(id){
    if(typeof id !== "string" || !id || !Object.prototype.hasOwnProperty.call(bridgeTombstones, id)) return;
    delete bridgeTombstones[id];
    bridgeSaveTombstones();
  }

  function bridgeTombstoneIds(){
    return Object.keys(bridgeTombstones).sort();
  }

  /* Envelopes carry only deletions for ids that are no longer live. Sending an
     id in both `requests`/`upserts` and `deletedIds` let the peer apply the
     deletion first and then skip the row it had just received. */
  function bridgeDeletionIds(){
    const live = {};
    state.requests.forEach(function(req){ if(req && req.id) live[req.id] = true; });
    return bridgeTombstoneIds().filter(function(id){ return !live[id]; });
  }

  function bridgeResetKnownIds(){
    bridgeKnownIds = {};
    state.requests.forEach(function(req){ if(req && req.id) bridgeKnownIds[req.id] = true; });
  }

  function bridgeCollectDeletes(){
    const current = {};
    state.requests.forEach(function(req){ if(req && req.id) current[req.id] = true; });
    Object.keys(bridgeKnownIds).forEach(function(id){
      if(!current[id]) bridgeRememberTombstone(id, state.updatedAt || nowISO());
    });
    bridgeKnownIds = current;
  }

  const BRIDGE_MEDIA_MAX_BYTES = 8 * 1024 * 1024;
  const bridgeSentMedia = {};
  const bridgePeerMedia = {};
  let bridgeMediaSending = false;

  /* Media metadata can arrive before its blob. While a transfer is expected
     the UI shows a neutral loading state instead of "Image not found"; a
     missing blob becomes "not found" only after this window. */
  const BRIDGE_MEDIA_PENDING_MS = 15000;
  const bridgeMediaPending = {};

  function bridgeMediaMarkPending(kind, id){
    if(!id) return;
    const key = bridgeMediaKey(kind, id);
    if(!(key in bridgeMediaPending)) bridgeMediaPending[key] = Date.now();
  }

  function bridgeMediaPendingRemaining(kind, id){
    if(!id) return 0;
    const at = bridgeMediaPending[bridgeMediaKey(kind, id)];
    if(!at) return 0;
    const left = BRIDGE_MEDIA_PENDING_MS - (Date.now() - at);
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
    const out = {
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

  /* Text fields plus media *metadata*. Blobs travel separately as data URLs
     only for ids the other side has not acknowledged. */
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

  function bridgeMediaKey(kind, id){
    return (activeProjectId || "") + "|" + kind + "|" + id;
  }

  function bridgeMediaList(value, kind){
    return (Array.isArray(value) ? value : []).map(function(item){
      if(!item || typeof item.id !== "string" || !item.id) return null;
      const out = {
        id:item.id, name:item.name || "", type:item.type || "", ext:item.ext || "",
        size:Number(item.size) || 0, file:""
      };
      if(kind === "image"){ out.w = Number(item.w) || 0; out.h = Number(item.h) || 0; }
      return out;
    }).filter(Boolean);
  }

  function bridgeMergeMedia(incoming, local, kind){
    const byId = {};
    bridgeMediaList(local, kind).forEach(function(item){ byId[item.id] = item; });
    bridgeMediaList(incoming, kind).forEach(function(item){ byId[item.id] = item; });
    return Object.keys(byId).map(function(id){ return byId[id]; });
  }

  function bridgeBlobToDataUrl(blob){
    return new Promise(function(resolve, reject){
      if(!blob){ reject(new Error("missing blob")); return; }
      if(typeof FileReader !== "undefined"){
        const reader = new FileReader();
        reader.onload = function(){ resolve(reader.result); };
        reader.onerror = function(){ reject(reader.error || new Error("media read failed")); };
        reader.readAsDataURL(blob);
        return;
      }
      reject(new Error("FileReader unavailable"));
    });
  }

  async function bridgeSendMediaItem(req, item, kind, force){
    if(!req || !item || !item.id) return false;
    const key = bridgeMediaKey(kind, item.id);
    if(!force && (bridgeSentMedia[key] || bridgePeerMedia[key])) return false;
    try{
      const record = kind === "image" ? await idbGet(item.id) : await idbFileGet(item.id);
      if(!record || !record.blob) return false;
      if(record.blob.size > BRIDGE_MEDIA_MAX_BYTES) return false;
      const dataUrl = await bridgeBlobToDataUrl(record.blob);
      if(typeof dataUrl !== "string" || dataUrl.length > BRIDGE_MEDIA_MAX_BYTES * 2) return false;
      window.postMessage({
        source:"request-ledger-web",
        type:"RL_APP_MEDIA",
        v:BRIDGE_VERSION,
        appVersion:APP_VERSION,
        rev:Number(state.rev) || 0,
        ledgerId:state.ledgerId,
        projectId:activeProjectId || "",
        requestId:req.id,
        media:[{
          kind:kind,
          id:item.id,
          meta:bridgeMediaOut(item, kind),
          dataUrl:dataUrl
        }]
      }, bridgePostTarget());
      bridgeSentMedia[key] = true;
      bridgeStats.sent++;
      return true;
    }catch(err){
      return false;
    }
  }

  async function bridgeSendPendingMedia(force){
    if(!bridgeEnabled() || !activeProjectId || bridgeMediaSending) return;
    bridgeMediaSending = true;
    try{
      for(const req of state.requests){
        for(const img of (Array.isArray(req.images) ? req.images : [])){
          await bridgeSendMediaItem(req, img, "image", force);
        }
        for(const att of (Array.isArray(req.attachments) ? req.attachments : [])){
          await bridgeSendMediaItem(req, att, "file", force);
        }
      }
    }finally{
      bridgeMediaSending = false;
    }
  }

  /* The receiver asks for ids whose metadata arrived without a local blob. */
  function bridgeRequestMissingMedia(){
    if(!bridgeEnabled() || !activeProjectId) return;
    const ids = [];
    state.requests.forEach(function(req){
      (Array.isArray(req.images) ? req.images : []).forEach(function(img){ if(img && img.id) ids.push("image:" + img.id); });
      (Array.isArray(req.attachments) ? req.attachments : []).forEach(function(att){ if(att && att.id) ids.push("file:" + att.id); });
    });
    if(!ids.length) return;
    ids.forEach(function(value){
      const parts = String(value).split(":");
      const kind = parts.shift();
      if(kind === "image" || kind === "file") bridgeMediaMarkPending(kind, parts.join(":"));
    });
    window.postMessage({
      source:"request-ledger-web",
      type:"RL_APP_MEDIA_REQUEST",
      v:BRIDGE_VERSION,
      appVersion:APP_VERSION,
      rev:Number(state.rev) || 0,
      ledgerId:state.ledgerId,
      projectId:activeProjectId || "",
      ids:ids.slice(0, 100)
    }, bridgePostTarget());
  }

  async function handleBridgeMedia(data){
    if(!data || !activeProjectId) return;
    if(bridgePeerOutdated) return;
    if(bridgeEnvelopeProjectId(data) && bridgeEnvelopeProjectId(data) !== activeProjectId){
      bridgeRecordReject("media-project-mismatch", data);
      return;
    }
    const requestId = typeof data.requestId === "string" ? data.requestId : "";
    const req = requestId ? state.requests.find(function(item){ return item.id === requestId; }) : null;
    if(!req || !Array.isArray(data.media)) return;
    let changed = false;
    for(const item of data.media.slice(0, 20)){
      if(!item || typeof item.id !== "string" || typeof item.dataUrl !== "string") continue;
      if(!/^data:(image|application)\//.test(item.dataUrl)) continue;
      const kind = item.kind === "file" ? "file" : "image";
      try{
        const blob = await (await fetch(item.dataUrl)).blob();
        if(blob.size > BRIDGE_MEDIA_MAX_BYTES) continue;
        const meta = item.meta && typeof item.meta === "object" ? item.meta : {};
        if(kind === "image"){
          await idbPut({ id:item.id, blob:blob, type:meta.type || blob.type || "image/webp" });
          changed = true;
          const list = Array.isArray(req.images) ? req.images : [];
          if(!list.some(function(entry){ return entry.id === item.id; })){
            list.push({
              id:item.id, name:meta.name || "image", w:Number(meta.w) || 0,
              h:Number(meta.h) || 0, type:meta.type || blob.type || "image/webp",
              ext:meta.ext || "", file:""
            });
            req.images = list;
            changed = true;
          }
        }else{
          await idbFilePut({ id:item.id, blob:blob, type:meta.type || blob.type || "application/octet-stream" });
          changed = true;
          const list = Array.isArray(req.attachments) ? req.attachments : [];
          if(!list.some(function(entry){ return entry.id === item.id; })){
            list.push({
              id:item.id, name:meta.name || "file", size:Number(meta.size) || blob.size,
              type:meta.type || blob.type || "application/octet-stream",
              ext:meta.ext || "", file:""
            });
            req.attachments = list;
            changed = true;
          }
        }
        bridgePeerMedia[bridgeMediaKey(kind, item.id)] = true;
        bridgeMediaClearPending(kind, item.id);
        bridgeStats.media++;
      }catch(err){ /* skip a broken media record */ }
    }
    if(changed){
      /* Do not bump the request revision for a media blob arrival: the
         metadata was already part of the request's revision. Bumping here can
         resurrect a stale confirmed=false over a newer Ready confirmation. */
      saveNow();
      const row = typeof getRowEl === "function" ? getRowEl(req.id) : null;
      if(row){
        row.__imageSig = "";
        row.__attachmentSig = "";
      }
      renderList();
      refreshGlobal();
    }
  }

  function bridgeEnvelope(type){
    const message = {
      source:"request-ledger-web",
      type:type,
      v:BRIDGE_VERSION,
      appVersion:APP_VERSION,
      rev:Number(state.rev) || 0,
      ledgerId:state.ledgerId,
      updatedAt:state.updatedAt || nowISO(),
      project:state.project,
      projectId:activeProjectId || "",
      projectName:state.project,
      projectCreated:state.projectCreated === true,
      requests:state.requests.map(bridgeRequestOut).filter(Boolean),
      agents:state.agents.map(function(agent){ return { id:agent.id, name:agent.name, role:agent.role, mdPath:agent.mdPath }; }),
      language:state.language,
      exportBehavior:state.exportBehavior,
      deletedIds:bridgeDeletionIds()
    };
    if(type === "RL_APP_PATCH"){
      message.upserts = message.requests.slice();
      delete message.requests;
    }
    return message;
  }

  function bridgePost(type, extra){
    if(!bridgeEnabled()) return;
    /* Phase 2c: never emit ledger traffic while the project gate is showing. */
    if(!activeProjectId) return;
    const message = bridgeEnvelope(type);
    if(extra){
      Object.keys(extra).forEach(function(key){ message[key] = extra[key]; });
    }
    try{ window.postMessage(message, bridgePostTarget()); }catch(err){ return; }
    if(type === "RL_APP_PATCH") bridgeStats.patches++;
    else bridgeStats.sent++;
  }

  /* Picker control messages carry no ledger payload. The host still pins
     targetOrigin to this page and the extension re-checks the allowlist. */
  function bridgeControlPost(type, extra){
    if(!bridgeEnabled()) return;
    const message = {
      source:"request-ledger-web",
      type:type,
      v:BRIDGE_VERSION,
      ledgerId:state.ledgerId
    };
    if(extra){
      Object.keys(extra).forEach(function(key){
        if(extra[key] !== undefined) message[key] = extra[key];
      });
    }
    try{ window.postMessage(message, bridgePostTarget()); }catch(err){ return; }
    bridgeStats.sent++;
  }

  function bridgeSendHello(extra){
    bridgePost("RL_APP_HELLO", extra);
  }

  function bridgeNotifyChange(){
    if(!bridgeEnabled() || bridgeSuppress || !activeProjectId) return;
    if(bridgeProjectMismatch) return;
    /* A restore can replace the ledger while the bridge is live; that is a
       new first-connect situation, not an ordinary edit. */
    if(state.ledgerId !== bridgeLastLedger){
      bridgeLastLedger = state.ledgerId;
      bridgeResolved = false;
      bridgeStateSent = false;
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
    const byId = new Map();
    const order = [];
    const incomingIds = {};
    state.requests.forEach(function(req){
      if(!req || !req.id) return;
      byId.set(req.id, req);
      order.push(req.id);
    });
    (Array.isArray(incoming) ? incoming : []).forEach(function(raw){
      if(raw && typeof raw.id === "string" && raw.id) incomingIds[raw.id] = true;
    });

    (Array.isArray(deletedIds) ? deletedIds : []).forEach(function(id){
      if(typeof id !== "string" || !id) return;
      /* A row that travels in the same envelope is alive, not deleted. The
         peer's stale tombstone used to win over its own freshly re-created
         row and removed it here one round trip later. */
      if(incomingIds[id]) return;
      const local = byId.get(id);
      const deletedAt = bridgeTombstones[id] ? String(bridgeTombstones[id]) : String(stamp || "");
      if(local && local.updatedAt && String(local.updatedAt) > deletedAt) return;
      byId.delete(id);
      bridgeRememberTombstone(id, deletedAt || nowISO());
      const at = order.indexOf(id);
      if(at >= 0) order.splice(at, 1);
    });

    (Array.isArray(incoming) ? incoming : []).forEach(function(raw, index){
      if(!raw || typeof raw.id !== "string" || !raw.id) return;
      /* The id is live in the ledger the peer just sent: drop any local
         tombstone (ids are reused) instead of skipping the row. */
      bridgeForgetTombstone(raw.id);
      const local = byId.get(raw.id);
      /* Equal timestamps keep the local object: replacing on a tie causes
         ping-pong and can drop a freshly written field when the peer's copy
         of the same revision has not caught up yet. */
      if(local && String(local.updatedAt || "") >= String(raw.updatedAt || "")) return;
      const normalized = normalizeRequest(raw, index);
      /* Metadata crosses with the request; blobs travel separately and stay
         local until their data URL arrives. */
      normalized.images = bridgeMergeMedia(raw.images, local && local.images, "image");
      normalized.attachments = bridgeMergeMedia(raw.attachments, local && local.attachments, "file");
      normalized.collapsed = local ? local.collapsed !== false : true;
      if(!local) order.push(normalized.id);
      byId.set(normalized.id, normalized);
    });

    const merged = [];
    order.forEach(function(id){ if(byId.has(id)) merged.push(byId.get(id)); });
    byId.forEach(function(req, id){ if(order.indexOf(id) < 0) merged.push(req); });
    return merged;
  }

  function bridgeSignatureFromData(data){
    const requests = Array.isArray(data.requests) ? data.requests : (Array.isArray(data.upserts) ? data.upserts : []);
    const rows = requests.map(function(req){
      if(!req || !req.id) return "";
      return [
        req.id, req.type, req.title, req.page, req.location, req.consoleError,
        req.description, req.priority, req.link, req.sampleWebsite, req.note,
        req.confirmed ? 1 : 0, req.updatedAt || ""
      ].join("\u001f");
    }).filter(Boolean).sort();
    const agents = (Array.isArray(data.agents) ? data.agents : []).map(function(agent){
      return [agent.id, agent.name, agent.role, agent.mdPath].join("\u001f");
    }).sort();
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

  function bridgeStateHash(){
    const requests = state.requests.map(function(req){
      return [
        req.id, req.type, req.title, req.page, req.location, req.consoleError,
        req.description, req.priority, req.link, req.sampleWebsite, req.note,
        req.confirmed ? 1 : 0, req.updatedAt || ""
      ].join("\u001f");
    }).sort();
    const agents = state.agents.map(function(agent){
      return [agent.id, agent.name, agent.role, agent.mdPath].join("\u001f");
    }).sort();
    return bridgeHash([
      activeProjectId || "",
      String(state.project || ""),
      state.language === "tr" ? "tr" : "en",
      state.exportBehavior || "default",
      agents.join("\u001e"),
      requests.join("\u001e"),
      bridgeTombstoneIds().join("\u001f")
    ].join("\u001d"));
  }

  /* mode: "merge" (item-level) or "replace" (the user chose this ledger) */
  function bridgeApply(data, mode){
    const incomingProjectId = bridgeEnvelopeProjectId(data);
    const traceBefore = rlTraceBegin();
    rlAudit("bridge-before", { mode: mode, incoming: Array.isArray(data && data.requests) ? rlAuditSnapshot(data.requests) : null, stamp: data && data.updatedAt || "" });
    /* Never apply another project's ledger to the open project. An empty id is
       also refused while a project is open; the panel re-announces its identity
       on the next HELLO. */
    if(activeProjectId && incomingProjectId !== activeProjectId){
      bridgeRecordReject("project-mismatch", data, { incomingProjectId: incomingProjectId });
      return false;
    }
    const incoming = Array.isArray(data.requests) ? data.requests : (Array.isArray(data.upserts) ? data.upserts : []);
    const stamp = typeof data.updatedAt === "string" ? data.updatedAt : "";
    const incomingRev = Number(data.rev);
    const localRev = Number(state.rev) || 0;
    /* The app is authoritative while alive: an older snapshot must never
       replace the whole local ledger. Item-level merges stay allowed because
       they are id-keyed and keep the newer copy; only "replace" drops rows.
       An explicit conflict choice (bridgeForceApply) always wins. */
    if(mode === "replace" && !bridgeForceApply && Number.isFinite(incomingRev) && incoming.length &&
       (incomingRev < localRev || (incomingRev === localRev && state.requests.length > 0))){
      bridgeRecordReject("stale-revision", data, { incomingRev: incomingRev, localRev: localRev });
      return false;
    }
    const signature = bridgeSignatureFromData(data);
    if(mode !== "replace" && signature && signature === bridgeStateHash()){
      bridgeStats.echoes++;
      return false;
    }

    bridgeSuppress++;
    try{
      if(mode === "replace"){
        /* A chosen ledger no longer wipes memory: it is merged by id so a row
           created after the incoming snapshot (a blank draft) survives. Old
           tombstones belong to the loser. */
        const localRows = state.requests.slice();
        const incomingRows = [];
        incoming.forEach(function(raw, index){
          if(!raw || typeof raw.id !== "string" || !raw.id) return;
          const normalized = normalizeRequest(raw, index);
          normalized.images = bridgeMediaList(raw.images, "image");
          normalized.attachments = bridgeMediaList(raw.attachments, "file");
          incomingRows.push(normalized);
        });
        bridgeTombstones = {};
        bridgeSaveTombstones();
        state.requests = mergeRequestsById(localRows, incomingRows, stamp);
        const incomingName = normalizeProjectName(bridgeEnvelopeProjectName(data));
        if(incomingName){
          state.project = incomingName;
          state.projectCreated = true;
        }
        if(Array.isArray(data.agents)) state.agents = data.agents.map(normalizeAgent);
        if(data.language === "tr" || data.language === "en") state.language = data.language;
        state.exportBehavior = ["last","instant"].indexOf(data.exportBehavior) >= 0 ? data.exportBehavior : "default";
        if(typeof data.ledgerId === "string" && data.ledgerId){
          state.ledgerId = data.ledgerId;
          /* Replace means this ledger won: persist the winning id in the
             registry so a reload cannot fall back to the discarded one. */
          setProjectLedgerId(activeProjectId, data.ledgerId);
        }
      }else{
        state.requests = bridgeMergeRequests(incoming, data.deletedIds, stamp);
        const newer = !state.updatedAt || String(stamp) > String(state.updatedAt);
        if(newer){
          const incomingProject = normalizeProjectName(bridgeEnvelopeProjectName(data));
          if(incomingProject){
            state.project = incomingProject;
            state.projectCreated = true;
          }
          if(Array.isArray(data.agents)) state.agents = data.agents.map(normalizeAgent);
          if(data.language === "tr" || data.language === "en") state.language = data.language;
          if(["last","instant"].indexOf(data.exportBehavior) >= 0) state.exportBehavior = data.exportBehavior;
        }
        if(!state.requests.length && !String(state.project || "").trim() && typeof data.ledgerId === "string"){
          state.ledgerId = data.ledgerId;
        }
      }
      if(Number.isFinite(incomingRev)) state.rev = Math.max(Number(state.rev) || 0, incomingRev);
      saveNow();
      /* Bridge data was just persisted; it must not look like an unsaved local
         edit when the user switches projects. */
      projectSnapshot = serializedLedger();
      bridgeResetKnownIds();
      bridgeLastLedger = state.ledgerId;
      bridgeLastHash = bridgeStateHash();
    }finally{
      bridgeSuppress--;
    }

    /* Metadata that just arrived through the bridge is expected to be
       followed by its blob. Mark it before the first render so the loading
       state wins the race with the async IndexedDB read. */
    incoming.forEach(function(raw){
      if(!raw || typeof raw !== "object") return;
      (Array.isArray(raw.images) ? raw.images : []).forEach(function(img){
        if(img && img.id) bridgeMediaMarkPending("image", img.id);
      });
      (Array.isArray(raw.attachments) ? raw.attachments : []).forEach(function(att){
        if(att && att.id) bridgeMediaMarkPending("file", att.id);
      });
    });
    renderProjectGate();
    applyLanguage(state.language);
    renderList();
    renderHistoryTree();
    refreshGlobal();
    updateBridgeIndicator();
    bridgeStats.applied++;
    rlTraceCommit("bridge-" + mode, traceBefore);
    rlAudit("bridge-after", { mode: mode, requests: rlAuditSnapshot(state.requests) });
    setTimeout(function(){ bridgeSendPendingMedia(false); bridgeRequestMissingMedia(); }, 0);
    return true;
  }

  function bridgeOpenConflict(){
    if(bridgeConflictOpen || bridgeResolved) return;
    bridgeCaptureConflict(bridgePeerSnapshot && bridgePeerSnapshot.type, bridgePeerSnapshot);
    bridgeStateSent = false;
    bridgeConflictOpen = true;
    /* The panel learns about a difference from RL_APP_HELLO. If this page
       booted before the panel mounted, its boot HELLO was never seen, so the
       panel would keep its conflict flag false. Repeat it once here; the
       panel answers with an ACK/SNAPSHOT and does not ask again. */
    bridgeSendHello();
    openConfirm({
      eyebrow: translateString("Bağlantı"),
      title: translateString("İki defter bulundu"),
      message: translateString("Uygulama ve eklenti farklı defterler içeriyor. Hangisi kullanılsın? Uygulamadaki defter varsayılandır."),
      confirmLabel: translateString("Uygulamadaki defter"),
      altLabel: translateString("Eklentidaki defter"),
      cancelLabel: translateString("Sonra karar ver"),
      onConfirm: function(){ bridgeResolveConflict("app"); },
      onAlt: function(){ bridgeResolveConflict("extension"); }
    });
    const cancel = $("#confirmCancelBtn");
    if(cancel){
      cancel.addEventListener("click", function(){ bridgeConflictOpen = false; }, { once:true });
    }
  }

  function bridgeResolveConflict(winner){
    bridgeConflictOpen = false;
    bridgeResolved = true;
    bridgeStateSent = false;
    if(winner === "app"){
      bridgeForceApply = false;
      bridgeRejectedLedgerId = normalizeLedgerId(bridgePeerSnapshot && bridgePeerSnapshot.ledgerId);
      bridgeRejectedLedgerAt = bridgeRejectedLedgerId ? Date.now() : 0;
      bridgeSendHello({ resolution:"app" });
      showToast(translateString("Defter seçimi kaydedildi."));
      updateBridgeIndicator();
      return;
    }
    bridgeForceApply = true;
    bridgeRejectedLedgerId = normalizeLedgerId(state.ledgerId);
    bridgeRejectedLedgerAt = bridgeRejectedLedgerId ? Date.now() : 0;
    const ack = bridgeEnvelope("RL_APP_ACK");
    ack.resolution = "extension";
    try{ window.postMessage(ack, bridgePostTarget()); }catch(err){ /* ignore */ }
    if(bridgePeerSnapshot){
      const peer = bridgePeerSnapshot;
      bridgePeerSnapshot = null;
      bridgeApply(peer, "replace");
      bridgeForceApply = false;
    }
    showToast(translateString("Defter seçimi kaydedildi."));
    updateBridgeIndicator();
  }

  function bridgeRejectStaleLoser(data){
    if(!bridgeResolved || !bridgeRejectedLedgerId) return false;
    if(bridgeRejectedLedgerAt && Date.now() - bridgeRejectedLedgerAt > 20000){
      bridgeRejectedLedgerId = "";
      bridgeRejectedLedgerAt = 0;
      return false;
    }
    const incoming = normalizeLedgerId(data && data.ledgerId);
    return !!(incoming && incoming === bridgeRejectedLedgerId);
  }

  function bridgeReconcile(data){
    if(bridgeRejectStaleLoser(data)) return;
    const peerProjectId = bridgeEnvelopeProjectId(data);
    const incomingHas = bridgeHasData(data.requests || data.upserts, bridgeEnvelopeProjectName(data), false);
    /* Phase 2c: a panel on another project is a project mismatch, not a ledger
       conflict. An empty identity with data is treated as foreign too. */
    if(activeProjectId && peerProjectId !== activeProjectId){
      if(peerProjectId || incomingHas){
        bridgeRecordReject("project-mismatch", data, { reason: "snapshot project does not match the open project" });
        bridgePeerProjectId = peerProjectId;
        bridgeProjectMismatch = true;
        bridgePeerSnapshot = null;
        updateBridgeIndicator();
        /* Help the panel adopt this project instead of waiting forever. */
        bridgeSendHello();
        return;
      }
    }
    if(peerProjectId) bridgePeerProjectId = peerProjectId;
    bridgeProjectMismatch = false;
    const incomingRequestCount = (Array.isArray(data.requests) ? data.requests : (Array.isArray(data.upserts) ? data.upserts : [])).length;
    const localRequestCount = state.requests.length;
    const localHas = bridgeHasData(state.requests, state.project, state.projectCreated);
    /* A conflict requires data on both sides. An open project with zero
       requests is empty for this purpose, even though it has a name. */
    if(!bridgeForceApply && !bridgeResolved && data.type === "RL_APP_SNAPSHOT" &&
       peerProjectId && peerProjectId === activeProjectId &&
       typeof data.ledgerId === "string" && data.ledgerId && state.ledgerId &&
       data.ledgerId !== state.ledgerId && incomingRequestCount > 0 && localRequestCount > 0){
      bridgePeerSnapshot = data;
      bridgeOpenConflict();
      return;
    }
    /* A freshly mounted panel advertises an empty project. It can only adopt
       ours if it receives a HELLO, and the boot HELLO may have been sent
       before the panel existed. Ask once per empty peer state; reset when the
       peer actually reports requests. */
    if(incomingRequestCount > 0) bridgePeerEmptyAsked = false;
    if(incomingRequestCount === 0 && localRequestCount > 0 &&
       !bridgeConflictOpen && !bridgeResolved && !bridgeForceApply &&
       !bridgePeerEmptyAsked){
      bridgePeerEmptyAsked = true;
      bridgeSendHello();
      return;
    }
    let mode = "merge";
    /* Empty local project + non-empty peer: adopt the peer ledger and id. */
    if(bridgeForceApply || (!localRequestCount && incomingRequestCount > 0)) mode = "replace";
    bridgeApply(data, mode);
    if(mode === "replace") bridgeForceApply = false;
    /* A panel that mounted after the boot HELLO retries still needs a reply so
       it can mark the bridge connected and lock/unlock correctly. */
    try{
      window.postMessage({
        source:"request-ledger-web",
        type:"RL_APP_ACK",
        v:BRIDGE_VERSION,
        appVersion:APP_VERSION,
        rev:Number(state.rev) || 0,
        ledgerId:state.ledgerId,
        projectId:activeProjectId || "",
        projectName:state.project
      }, bridgePostTarget());
    }catch(err){ /* ignore */ }
  }

  function bridgeHandleAck(data){
    const peerProjectId = bridgeEnvelopeProjectId(data);
    if(activeProjectId && peerProjectId !== activeProjectId){
      if(peerProjectId || data.conflict === true){
        bridgeRecordReject("project-mismatch", data, { reason: "ack project does not match the open project" });
        bridgePeerProjectId = peerProjectId;
        bridgeProjectMismatch = true;
        updateBridgeIndicator();
        bridgeSendHello();
        return;
      }
    }
    if(peerProjectId) bridgePeerProjectId = peerProjectId;
    bridgeProjectMismatch = false;
    if(data.conflict === true && !bridgeResolved && !bridgeConflictOpen){
      /* the panel needs the full page state to resolve the choice */
      bridgeSendHello();
      return;
    }
    if(data.resolution === "app"){
      if(bridgeConflictOpen){
        bridgeConflictOpen = false;
        const modal = $("#confirmModal");
        if(modal && modal.classList.contains("is-open")) closeModal(modal);
      }
      bridgeResolved = true;
      if(data.requestState === true && !bridgeStateSent){
        bridgeStateSent = true;
        bridgeSendHello({ resolution:"app" });
      }
      return;
    }
    if(data.resolution === "extension"){
      bridgeResolved = true;
      bridgeConflictOpen = false;
      bridgeForceApply = true;
      /* The panel's ACK carries the winning ledger id even if its snapshot is
         lost in transit. Persisting it here keeps the choice across a server
         stop/start and prevents the same prompt from returning. */
      if(typeof data.ledgerId === "string" && data.ledgerId){
        state.ledgerId = data.ledgerId;
        setProjectLedgerId(activeProjectId, data.ledgerId);
      }
      if(bridgePeerSnapshot){
        const peer = bridgePeerSnapshot;
        bridgePeerSnapshot = null;
        bridgeApply(peer, "replace");
        bridgeForceApply = false;
      }else{
        saveNow();
      }
    }
  }

  function bridgeMarkConnected(){
    if(!bridgeEnabled()) return;
    bridgeLastHeard = Date.now();
    const was = bridgeConnected;
    bridgeConnected = true;
    if(!was) updateBridgeIndicator();
  }

  function updateBridgeIndicator(){
    if(typeof updatePickerBridgeButtons === "function") updatePickerBridgeButtons();
    const chip = $("#bridgeChip");
    const text = $("#bridgeChipText");
    if(!chip) return;
    if(!bridgeEnabled() || !bridgeConnected){
      chip.hidden = true;
      return;
    }
    chip.hidden = false;
    chip.classList.toggle("is-off", bridgeProjectMismatch || bridgePeerOutdated);
    const label = bridgePeerOutdated
      ? "Eklenti sürümü eski — eklentiyi güncelleyin."
      : (bridgeProjectMismatch ? "Eklenti farklı projede" : "Eklenti bağlı");
    chip.title = translateString(label);
    if(text) text.textContent = translateString(label);
  }

  function bridgeVersionKey(value){
    const match = /^(\d+)\.(\d+)/.exec(String(value || ""));
    return match ? match[1] + "." + match[2] : "";
  }
  /* Only these envelopes carry ledger state that a stale companion could
     overwrite. Control replies are request/response and stay live. */
  const BRIDGE_STATE_TYPES = {
    RL_APP_HELLO: true, RL_APP_SNAPSHOT: true, RL_APP_PATCH: true,
    RL_APP_ACK: true, RL_APP_MEDIA: true, RL_APP_MEDIA_REQUEST: true
  };
  function bridgePeerVersionMismatch(data){
    const peer = data && typeof data.appVersion === "string" ? data.appVersion : "";
    /* A peer without a version is an older build. */
    if(!peer) return true;
    return bridgeVersionKey(peer) !== bridgeVersionKey(APP_VERSION);
  }
  function bridgeNoteOutdated(){
    bridgePeerOutdated = true;
    bridgeOutdatedSeen = true;
    if(bridgeOutdatedNotified) return;
    bridgeOutdatedNotified = true;
    try{ showToast(translateString("Eklenti sürümü eski — eklentiyi güncelleyin.")); }catch(err){ /* ignore */ }
    updateBridgeIndicator();
  }

  function onBridgeMessage(event){
    if(!bridgeEnabled()) return;
    if(event.source !== window) return;
    if(event.origin !== bridgeEventOrigin()) return;
    const data = event.data;
    if(!data || typeof data !== "object") return;
    if(data.source !== "request-ledger-host") return;
    if(typeof data.pageOrigin === "string" && data.pageOrigin !== bridgeEventOrigin()) return;
    if(typeof data.type !== "string" || data.type.indexOf("RL_APP_") !== 0){ return; }
    if(typeof data.v !== "number") return;
    if(data.v !== BRIDGE_VERSION){
      bridgeNoteOutdated();
      return;
    }

    bridgeStats.received++;
    if(data.type === "RL_APP_BYE"){
      bridgeConnected = false;
      bridgePeerSnapshot = null;
      bridgePeerEmptyAsked = false;
      bridgePeerProjectId = "";
      bridgeProjectMismatch = false;
      updateBridgeIndicator();
      handleBridgeDisconnected();
      return;
    }
    bridgeMarkConnected();
    /* An older companion may carry a ledger that predates the app's current
       request. Never apply its state; keep the app authoritative locally.
       Control replies (tabs/pick/capture results) only answer a request the
       live app just made and must not be dropped by the version gate. */
    if(BRIDGE_STATE_TYPES[data.type] && bridgePeerVersionMismatch(data)){
      bridgeNoteOutdated();
      return;
    }
    if(BRIDGE_STATE_TYPES[data.type]) bridgePeerOutdated = false;
    if(data.type === "RL_APP_ACK"){ bridgeHandleAck(data); return; }
    if(data.type === "RL_APP_PATCH"){
      const peerProjectId = bridgeEnvelopeProjectId(data);
      if(activeProjectId && peerProjectId !== activeProjectId){
        bridgePeerProjectId = peerProjectId;
        bridgeProjectMismatch = true;
        updateBridgeIndicator();
        bridgeSendHello();
        return;
      }
      if(peerProjectId) bridgePeerProjectId = peerProjectId;
      bridgeProjectMismatch = false;
      bridgeApply(data, "merge");
      return;
    }
    if(data.type === "RL_APP_MEDIA"){ handleBridgeMedia(data); return; }
    if(data.type === "RL_APP_MEDIA_REQUEST"){
      const ids = Array.isArray(data.ids) ? data.ids : [];
      const wanted = {};
      ids.slice(0, 100).forEach(function(value){ wanted[String(value)] = true; });
      state.requests.forEach(function(req){
        (Array.isArray(req.images) ? req.images : []).forEach(function(img){
          if(wanted["image:" + img.id]) bridgeSendMediaItem(req, img, "image", true);
        });
        (Array.isArray(req.attachments) ? req.attachments : []).forEach(function(att){
          if(wanted["file:" + att.id]) bridgeSendMediaItem(req, att, "file", true);
        });
      });
      return;
    }
    if(data.type === "RL_APP_PROJECT_CREATE"){ bridgeApplyProjectCreate(data); return; }
    if(data.type === "RL_APP_TABS_RESULT"){ handleBridgeTabsResult(data); return; }
    if(data.type === "RL_APP_PICK_RESULT"){ handleBridgePickResult(data); return; }
    if(data.type === "RL_APP_CAPTURE_RESULT"){ handleBridgeCaptureResult(data); return; }
    if(data.type === "RL_APP_SNAPSHOT"){
      if(data.resolution === "extension") bridgeForceApply = true;
      bridgeReconcile(data);
    }
  }

  let bridgeLastProjectCommand = "";
  const bridgeProjectCommands = [];

  /* The extension can create a project while the app is open in another tab.
     The app owns the project list, so it creates the same id/ledger id here
     and then announces the new project through the normal bridge. */
  /* Panel-driven delete: disk first (server mode), then registry and caches. */
  async function bridgeApplyProjectDelete(projectId, keepBackup){
    const project = findProjectRecord(projectId);
    if(!project) return;
    if(typeof serverDiskEnabled === "function" && serverDiskEnabled()){
      const result = await serverDeleteProjectOnDisk(projectId, keepBackup === true);
      if(!result || result.ok !== true){
        showToast(translateString("Proje diskten silinemedi; hiçbir şey değiştirilmedi."), "error");
        return;
      }
    }
    const registry = readRegistry();
    const nextId = registry ? registry.projects.filter(function(item){ return item.id !== projectId; })[0] : null;
    removeProjectRecord(projectId);
    try{ localStorage.removeItem(projectLedgerKey(projectId)); }catch(err){ /* ignore */ }
    if(typeof deleteProjectData === "function") await deleteProjectData(projectId).catch(function(){});
    else idbDeleteProjectMedia(projectId).catch(function(){ /* best effort */ });
    if(activeProjectId === projectId){
      if(nextId){
        openProjectById(nextId.id);
      }else{
        activeProjectId = null;
        projectScreen = "picker";
        renderProjectGate();
      }
    }
    if(keepBackup === true) showToast(translateString("Proje silindi ve yedeği saklandı."));
  }

  function bridgeApplyProjectCreate(data){
    const commandId = typeof data.commandId === "string" ? data.commandId : "";
    if(commandId && commandId === bridgeLastProjectCommand) return;
    const projectId = typeof data.projectId === "string" && /^prj_[A-Za-z0-9_]+$/.test(data.projectId) ? data.projectId : "";
    if(!projectId) return;
    const name = normalizeProjectName(data.name) || importedProjectName(state.language);
    const ledgerId = normalizeLedgerId(data.ledgerId) || newLedgerId();
    const commandType = data.commandType === "project-switch" ? "project-switch" : "project-create";
    const beforeActive = activeProjectId;
    if(commandId) bridgeLastProjectCommand = commandId;
    bridgeProjectCommands.push({ at:nowISO(), commandType:commandType, projectId:projectId, beforeActive:beforeActive });
    if(bridgeProjectCommands.length > 20) bridgeProjectCommands.shift();
    if(commandType === "project-switch" && findProjectRecord(projectId)){
      if(activeProjectId !== projectId){
        saveNow();
        openProjectById(projectId);
      }
      return;
    }
    if(commandType === "project-rename"){
      const renamed = updateProjectRecord(projectId, { name:name, updatedAt:nowISO() });
      if(renamed && activeProjectId === projectId){
        state.project = renamed.name;
        saveNow();
        renderProjectGate();
        updateTargetFolderUI();
        bridgeSendHello({ projectSwitch:true });
      }
      return;
    }
    if(commandType === "project-delete"){
      /* The panel already removed its registry entry. The app owns the disk:
         delete projects/<slug>/ (optionally archived) before touching the
         registry, otherwise the folder would resurrect the project on boot. */
      bridgeApplyProjectDelete(projectId, data.keepBackup === true);
      return;
    }
    if(activeProjectId && activeProjectId !== projectId) saveNow();
    let project = findProjectRecord(projectId);
    if(!project){
      const registry = readRegistry() || emptyProjectRegistry();
      const stamp = nowISO();
      project = {
        id:projectId, name:name, createdAt:stamp, updatedAt:stamp,
        ledgerId:ledgerId, exportTarget:"", archiveCollapsed:false
      };
      registry.projects.push(project);
      registry.activeId = projectId;
      writeRegistry(registry);
      try{
        localStorage.setItem(projectLedgerKey(projectId), JSON.stringify({
          version:1,
          project:name,
          projectCreated:true,
          ledgerId:ledgerId,
          updatedAt:stamp,
          requests:[],
          agents:[],
          language:state.language === "tr" ? "tr" : "en",
          exportBehavior:"default",
          lastExport:null
        }));
      }catch(err){ /* loadState retries the empty payload */ }
    }
    if(activeProjectId === projectId){
      saveNow();
      bridgeSendHello({ panelProjectCreate:true });
    }else{
      openProjectById(projectId);
    }
  }

  function bridgeBye(){
    if(!bridgeEnabled()) return;
    try{
      window.postMessage({
        source:"request-ledger-web",
        type:"RL_APP_BYE",
        v:BRIDGE_VERSION,
        ledgerId:state.ledgerId,
        projectId:activeProjectId || "",
        projectName:state.project
      }, bridgePostTarget());
    }catch(err){ /* ignore */ }
    bridgeConnected = false;
  }

  /* The app switched projects while the bridge is live: reload this project's
     tombstones and re-announce it. The panel adopts the new project from the
     HELLO envelope; it never merges across project ids. */
  function bridgeProjectChanged(){
    if(!bridgeEnabled() || !activeProjectId) return;
    bridgePeerProjectId = "";
    bridgeProjectMismatch = false;
    bridgeConflictOpen = false;
    bridgeResolved = false;
    bridgeStateSent = false;
    bridgeForceApply = false;
    bridgeRejectedLedgerId = "";
    bridgeRejectedLedgerAt = 0;
    bridgePeerSnapshot = null;
    bridgePeerEmptyAsked = false;
    bridgeLoadTombstones();
    bridgeResetKnownIds();
    bridgeLastLedger = state.ledgerId;
    bridgeLastHash = bridgeStateHash();
    updateBridgeIndicator();
    bridgeSendHello({ projectSwitch:true });
  }

  function initAppBridge(){
    if(appBridgeStarted) return;
    appBridgeStarted = true;
    const chip = $("#bridgeChip");
    if(!bridgeEnabled()){
      if(chip) chip.hidden = true;
      return;
    }
    if(chip) chip.hidden = true;
    bridgeLoadTombstones();
    bridgeResetKnownIds();
    bridgeLastLedger = state.ledgerId;
    window.addEventListener("message", onBridgeMessage);
    window.addEventListener("pagehide", bridgeBye);
    window.addEventListener("beforeunload", bridgeBye);

    bridgeSendHello();
    [600, 1800, 4000].forEach(function(delay){
      setTimeout(function(){ if(!bridgeConnected) bridgeSendHello(); }, delay);
    });
    bridgeHeartbeat = setInterval(function(){
      if(document.visibilityState === "hidden") return;
      if(bridgeConnected && Date.now() - bridgeLastHeard > 10000){
        bridgeConnected = false;
        updateBridgeIndicator();
        handleBridgeDisconnected();
      }
      try{
        window.postMessage({
          source:"request-ledger-web",
          type:"RL_APP_ACK",
          v:BRIDGE_VERSION,
          appVersion:APP_VERSION,
          rev:Number(state.rev) || 0,
          ledgerId:state.ledgerId,
          projectId:activeProjectId || "",
          projectName:state.project,
          heartbeat:true
        }, bridgePostTarget());
      }catch(err){ /* ignore */ }
    }, 4000);
    updateBridgeIndicator();

    try{
      window.__rlBridge = Object.freeze({
        enabled:function(){ return bridgeEnabled(); },
        connected:function(){ return bridgeConnected; },
        projectId:function(){ return activeProjectId || ""; },
        mismatch:function(){ return bridgeProjectMismatch; },
        ledgerId:function(){ return state.ledgerId; },
        stats:function(){ return { sent:bridgeStats.sent, patches:bridgeStats.patches, received:bridgeStats.received, applied:bridgeStats.applied, echoes:bridgeStats.echoes, media:bridgeStats.media }; },
        outdated:function(){ return bridgePeerOutdated; },
        outdatedSeen:function(){ return bridgeOutdatedSeen; },
        rev:function(){ return Number(state.rev) || 0; },
        version:function(){ return APP_VERSION; },
        conflict:function(){ return bridgeConflictOpen; },
        conflictInfo:function(){ return bridgeConflictInfo; },
        rejects:function(){ return bridgeRejects.slice(); },
        projectCommands:function(){ return bridgeProjectCommands.slice(); },
        serverStopped:function(){ return bridgeServerStoppedState(); }
      });
    }catch(err){ /* ignore */ }
  }
