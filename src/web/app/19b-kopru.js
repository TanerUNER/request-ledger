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
  let bridgeLastHeard = 0;
  let bridgeConflictOpen = false;
  let bridgeResolved = false;
  let bridgeStateSent = false;
  let bridgeForceApply = false;
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
  const bridgeStats = { sent:0, patches:0, received:0, applied:0, echoes:0 };

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
    try{
      if(bridgeFilePage()) return true;
      var origin = window.location.origin;
      /* "null" is only trusted through the explicit file: check above. */
      return origin !== BRIDGE_FILE_ORIGIN && bridgeOriginAllowed(origin);
    }
    catch(err){ return false; }
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

  function bridgeTombstoneIds(){
    return Object.keys(bridgeTombstones).sort();
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

  /* Text-only request. Media arrays never cross this channel. */
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
      updatedAt:req.updatedAt
    };
  }

  function bridgeEnvelope(type){
    const message = {
      source:"request-ledger-web",
      type:type,
      v:BRIDGE_VERSION,
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
      deletedIds:bridgeTombstoneIds()
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
    state.requests.forEach(function(req){
      if(!req || !req.id) return;
      byId.set(req.id, req);
      order.push(req.id);
    });

    (Array.isArray(deletedIds) ? deletedIds : []).forEach(function(id){
      if(typeof id !== "string" || !id) return;
      const local = byId.get(id);
      if(local && local.updatedAt && String(local.updatedAt) > String(stamp || "")) return;
      byId.delete(id);
      bridgeRememberTombstone(id, stamp || nowISO());
      const at = order.indexOf(id);
      if(at >= 0) order.splice(at, 1);
    });

    (Array.isArray(incoming) ? incoming : []).forEach(function(raw, index){
      if(!raw || typeof raw.id !== "string" || !raw.id) return;
      if(bridgeTombstones[raw.id] && String(bridgeTombstones[raw.id]) >= String(raw.updatedAt || "")) return;
      const local = byId.get(raw.id);
      /* Equal timestamps keep the local object: replacing on a tie causes
         ping-pong and can drop a freshly written field when the peer's copy
         of the same revision has not caught up yet. */
      if(local && String(local.updatedAt || "") >= String(raw.updatedAt || "")) return;
      const normalized = normalizeRequest(raw, index);
      /* media is local-only: preserve whatever this surface already has */
      normalized.images = local ? local.images : [];
      normalized.attachments = local ? local.attachments : [];
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
    /* Never apply another project's ledger to the open project. An empty id is
       also refused while a project is open; the panel re-announces its identity
       on the next HELLO. */
    if(activeProjectId && incomingProjectId !== activeProjectId) return false;
    const incoming = Array.isArray(data.requests) ? data.requests : (Array.isArray(data.upserts) ? data.upserts : []);
    const stamp = typeof data.updatedAt === "string" ? data.updatedAt : "";
    const signature = bridgeSignatureFromData(data);
    if(mode !== "replace" && signature && signature === bridgeStateHash()){
      bridgeStats.echoes++;
      return false;
    }

    bridgeSuppress++;
    try{
      if(mode === "replace"){
        /* a chosen ledger starts clean; old tombstones belong to the loser */
        bridgeTombstones = {};
        bridgeSaveTombstones();
        state.requests = [];
        incoming.forEach(function(raw, index){
          if(!raw || typeof raw.id !== "string" || !raw.id) return;
          const normalized = normalizeRequest(raw, index);
          normalized.images = [];
          normalized.attachments = [];
          state.requests.push(normalized);
        });
        const incomingName = normalizeProjectName(bridgeEnvelopeProjectName(data));
        if(incomingName){
          state.project = incomingName;
          state.projectCreated = true;
        }
        if(Array.isArray(data.agents)) state.agents = data.agents.map(normalizeAgent);
        if(data.language === "tr" || data.language === "en") state.language = data.language;
        state.exportBehavior = ["last","instant"].indexOf(data.exportBehavior) >= 0 ? data.exportBehavior : "default";
        if(typeof data.ledgerId === "string" && data.ledgerId) state.ledgerId = data.ledgerId;
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

    renderProjectGate();
    applyLanguage(state.language);
    renderList();
    renderHistoryTree();
    refreshGlobal();
    updateBridgeIndicator();
    bridgeStats.applied++;
    return true;
  }

  function bridgeOpenConflict(){
    if(bridgeConflictOpen || bridgeResolved) return;
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
      message: translateString("Uygulama ve uzantı farklı defterler içeriyor. Hangisi kullanılsın? Uygulamadaki defter varsayılandır."),
      confirmLabel: translateString("Uygulamadaki defter"),
      altLabel: translateString("Uzantıdaki defter"),
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
      bridgeSendHello({ resolution:"app" });
      showToast(translateString("Defter seçimi kaydedildi."));
      updateBridgeIndicator();
      return;
    }
    bridgeForceApply = true;
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

  function bridgeReconcile(data){
    const peerProjectId = bridgeEnvelopeProjectId(data);
    const incomingHas = bridgeHasData(data.requests || data.upserts, bridgeEnvelopeProjectName(data), false);
    /* Phase 2c: a panel on another project is a project mismatch, not a ledger
       conflict. An empty identity with data is treated as foreign too. */
    if(activeProjectId && peerProjectId !== activeProjectId){
      if(peerProjectId || incomingHas){
        bridgePeerProjectId = peerProjectId;
        bridgeProjectMismatch = true;
        bridgePeerSnapshot = null;
        updateBridgeIndicator();
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
  }

  function bridgeHandleAck(data){
    const peerProjectId = bridgeEnvelopeProjectId(data);
    if(activeProjectId && peerProjectId !== activeProjectId){
      if(peerProjectId || data.conflict === true){
        bridgePeerProjectId = peerProjectId;
        bridgeProjectMismatch = true;
        updateBridgeIndicator();
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
      if(bridgePeerSnapshot){
        const peer = bridgePeerSnapshot;
        bridgePeerSnapshot = null;
        bridgeApply(peer, "replace");
        bridgeForceApply = false;
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
    chip.classList.toggle("is-off", bridgeProjectMismatch);
    const label = bridgeProjectMismatch ? "Uzantı farklı projede" : "Uzantı bağlı";
    chip.title = translateString(label);
    if(text) text.textContent = translateString(label);
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
    if(typeof data.v !== "number" || data.v !== BRIDGE_VERSION) return;

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
    if(data.type === "RL_APP_ACK"){ bridgeHandleAck(data); return; }
    if(data.type === "RL_APP_PATCH"){
      const peerProjectId = bridgeEnvelopeProjectId(data);
      if(activeProjectId && peerProjectId !== activeProjectId){
        bridgePeerProjectId = peerProjectId;
        bridgeProjectMismatch = true;
        updateBridgeIndicator();
        return;
      }
      if(peerProjectId) bridgePeerProjectId = peerProjectId;
      bridgeProjectMismatch = false;
      bridgeApply(data, "merge");
      return;
    }
    if(data.type === "RL_APP_TABS_RESULT"){ handleBridgeTabsResult(data); return; }
    if(data.type === "RL_APP_PICK_RESULT"){ handleBridgePickResult(data); return; }
    if(data.type === "RL_APP_CAPTURE_RESULT"){ handleBridgeCaptureResult(data); return; }
    if(data.type === "RL_APP_SNAPSHOT"){
      if(data.resolution === "extension") bridgeForceApply = true;
      bridgeReconcile(data);
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
        stats:function(){ return { sent:bridgeStats.sent, patches:bridgeStats.patches, received:bridgeStats.received, applied:bridgeStats.applied, echoes:bridgeStats.echoes }; },
        conflict:function(){ return bridgeConflictOpen; }
      });
    }catch(err){ /* ignore */ }
  }
