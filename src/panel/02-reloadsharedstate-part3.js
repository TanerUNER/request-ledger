  function reloadSharedState(projectId){
    if(!core || !core.storage || typeof core.storage.loadState !== "function") return;
    /* Keep the project that owns the incoming bridge data; another frame may
       have written a different registry.activeId in the meantime. */
    syncStorageScope(projectId);
    var loaded = null;
    if(activeProjectId){
      try{ loaded = core.storage.loadState(); }catch(err){ loaded = null; }
    }
    app = loaded || defaultApp();
    if(!Array.isArray(app.requests)) app.requests = [];
    if(!Array.isArray(app.agents)) app.agents = [];
    /* The registry owns the one ledger id. A storage refresh can run before
       core.storage has switched scopes (or can find no payload); defaultApp()
       must never mint a second id for an existing project. */
    if(activeProjectId){
      var liveProject = activeProjectRecord();
      var registryLedgerId = liveProject && typeof liveProject.ledgerId === "string"
        ? liveProject.ledgerId
        : "";
      if(registryLedgerId){
        app.ledgerId = registryLedgerId;
      }else if(normalizeLedgerId(app.ledgerId)){
        setProjectLedgerId(activeProjectId, app.ledgerId);
      }else{
        app.ledgerId = newLedgerId();
        setProjectLedgerId(activeProjectId, app.ledgerId);
      }
    }
    if(activeProjectId) applyStoredProject();
    else app.project = "";
    if(typeof app.project !== "string") app.project = "";
    var projectRecord = activeProjectId ? activeProjectRecord() : null;
    folderDirs.export = projectRecord ? (projectRecord.exportTarget || "") : "";
    if(app.language === "tr" || app.language === "en"){
      state.lang = app.language;
      document.documentElement.lang = app.language;
      if(core && core.i18n && core.i18n.setLanguage) core.i18n.setLanguage(app.language);
      if(role === "dock") refreshDockLabels();
    }
    resetProjectSnapshot();

    if(activeRequestId && !requestById(activeRequestId)){
      activeRequestId = null;
      saveActivePointer(null);
    }
    dockCount = app.requests.length;
    dockReady = 0;
    app.requests.forEach(function(req){ if(statusOf(req) === "ready") dockReady++; });
    var focusId = activeRequestId || (dockSummary && dockSummary.id);
    dockSummary = focusId && requestById(focusId) ? summaryOf(requestById(focusId)) : (state.mode === "idle" ? null : dockSummary);

    updateDockBadges();
    updateStats();
    updateMarquee();
    syncProjectGate();

    /* Bridge traffic updates data only. It must never call refreshSection(),
       which broadcasts RL_OPEN_SECTION and can reveal the flyout. */
    if(role === "flyout" && state.section === "list"){
      /* A bridge patch refreshes rows/counts in place: a full render would
         reset the selected archive tab, search focus and scroll position. */
      updateList();
      renderArchiveProjectTree();
    }else if(role === "flyout" && state.section){
      renderFlyout(state.section);
    }
    broadcastState();
  }

  function scheduleSave(delay){
    if(saveTimer) clearTimeout(saveTimer);
    var wait = delay == null ? 380 : delay;
    saveTimer = setTimeout(function(){ saveNow(); }, wait);
  }

  function flushSave(){
    if(saveTimer){ clearTimeout(saveTimer); saveTimer = null; }
    return saveNow();
  }

  function markDirty(delay){
    if(!app) return;
    /* shell v7: a field/request change makes the open compose flyout dirty,
       so closing it keeps the compose buttons instead of falling back to idle */
    if(state.mode === "compose" && activeRequest()) composeDirty = true;
    setSaveState("saving");
    scheduleSave(delay);
    broadcastState();
  }

  function toast(text, kind){
    var translated = t(text);

    /* shell v6: inside the host the toast is drawn by the parent, just left
       of the rail/flyout. The local pill is a standalone-preview fallback. */
    if(hasHost){
      try{
        window.parent.postMessage({
          source:"request-ledger-panel",
          type:"RL_TOAST",
          text:translated,
          kind:kind || null,
          theme:panelTheme()
        }, "*");
      }catch(err){ /* ignore */ }
      return;
    }

    var host = document.getElementById("rl-toasts");
    if(!host) return;
    var node = h("div", "toast" + (kind ? " toast--" + kind : ""), translated);
    node.setAttribute("data-toast", "");
    node.setAttribute("role", kind === "error" ? "alert" : "status");
    node.setAttribute("aria-atomic", "true");
    host.appendChild(node);
    if(els.card) els.card.classList.add("is-toasting");

    var motion = reducedMotion() ? 0 : 150;
    setTimeout(function(){
      node.classList.add("is-leaving");
      setTimeout(function(){
        if(node.parentNode) node.parentNode.removeChild(node);
        if(host && !host.children.length && els.card) els.card.classList.remove("is-toasting");
      }, motion);
    }, 2500);
  }

  function broadcastState(){
    var req = activeRequest();
    var ready = 0;
    if(app && Array.isArray(app.requests)){
      app.requests.forEach(function(item){ if(statusOf(item) === "ready") ready++; });
    }
    var message = {
      type: "state",
      mode: state.mode,
      active: activeRequestId,
      requestId: activeRequestId,
      request: summaryOf(req),
      project: app ? app.project : "",
      projectId: activeProjectId || null,
      count: app ? app.requests.length : 0,
      ready: ready,
      dirty: !!composeDirty,
      saving: state.saving === "saving"
    };
    if(originTabId != null) message.originTabId = originTabId;
    channelPost(message);
  }

  function sendAction(action, payload){
    var message = { type:"action", action:action };
    if(payload){
      for(var key in payload){
        if(has(payload, key)) message[key] = payload[key];
      }
    }
    channelPost(message);
  }

  /* ---------- extension bridge (Phase 8) ---------- */

  function runtimeAvailable(){
    try{
      return typeof chrome !== "undefined" && !!chrome.runtime &&
        typeof chrome.runtime.sendMessage === "function";
    }catch(err){ return false; }
  }

  function sendRuntime(message, callback){
    if(!runtimeAvailable()){
      if(callback) callback(null, new Error("runtime unavailable"));
      return;
    }
    try{
      chrome.runtime.sendMessage(message, function(response){
        var failure = null;
        try{ failure = chrome.runtime.lastError || null; }catch(err){ failure = null; }
        if(callback) callback(failure ? null : (response || null), failure);
      });
    }catch(err){
      if(callback) callback(null, err);
    }
  }

  /* Dock-side cache used only by the fallback path; the flyout resolves its
     own tab with chrome.tabs.getCurrent() at send time. */
  function readOriginTabId(){
    if(role !== "dock") return;
    try{
      if(typeof chrome === "undefined" || !chrome.tabs ||
        typeof chrome.tabs.getCurrent !== "function") return;
      chrome.tabs.getCurrent(function(tab){
        try{ if(chrome.runtime && chrome.runtime.lastError) return; }catch(err){ /* ignore */ }
        if(tab && typeof tab.id === "number" && isFinite(tab.id)){
          originTabId = tab.id;
          channelPost({ type:"origin", originTabId:tab.id });
        }
      });
    }catch(err){ /* ignore */ }
  }

  /* Resolve the tab this panel lives in. The flyout iframe is embedded in the
     host tab, so chrome.tabs.getCurrent() is authoritative. The
     BroadcastChannel request is only a fallback for contexts where the API is
     unavailable (demo/standalone), never a cross-tab source of truth. */
  function getCurrentTabId(){
    return new Promise(function(resolve){
      var done = false;
      var timer = null;
      function finish(id){
        if(done) return;
        done = true;
        if(timer){ clearTimeout(timer); timer = null; }
        resolve(typeof id === "number" && isFinite(id) ? id : null);
      }
      try{
        if(typeof chrome === "undefined" || !chrome.tabs ||
          typeof chrome.tabs.getCurrent !== "function"){
          finish(null);
          return;
        }
        chrome.tabs.getCurrent(function(tab){
          try{
            if(chrome.runtime && chrome.runtime.lastError){ finish(null); return; }
          }catch(err){ /* ignore */ }
          finish(tab && typeof tab.id === "number" ? tab.id : null);
        });
        timer = setTimeout(function(){ finish(null); }, 600);
      }catch(err){ finish(null); }
    });
  }

  /* Panel-side focus fallback: if the worker never reports (service worker
     asleep, tab closed mid-flight) the host tab must still become active. */
  function restoreOriginFocus(){
    getCurrentTabId().then(function(id){
      if(id == null) return;
      try{
        if(typeof chrome === "undefined" || !chrome.tabs ||
          typeof chrome.tabs.update !== "function") return;
        chrome.tabs.update(id, { active:true }, function(tab){
          try{ if(chrome.runtime && chrome.runtime.lastError) return; }catch(err){ return; }
          if(tab && tab.windowId != null && chrome.windows && typeof chrome.windows.update === "function"){
            chrome.windows.update(tab.windowId, { focused:true }, function(){
              try{ if(chrome.runtime && chrome.runtime.lastError){ /* consumed */ } }catch(err){ /* ignore */ }
            });
          }
        });
      }catch(err){ /* ignore */ }
    });
  }

  function requestOriginViaChannel(){
    return new Promise(function(resolve){
      var done = false;
      function finish(id){
        if(done) return;
        done = true;
        resolve(typeof id === "number" && isFinite(id) ? id : null);
      }
      originWaiters.push(finish);
      sendAction("origin-request");
      setTimeout(function(){
        var index = originWaiters.indexOf(finish);
        if(index >= 0) originWaiters.splice(index, 1);
        finish(null);
      }, 400);
    });
  }

  function initRuntimeBridge(){
    if(!runtimeAvailable()) return;
    try{
      if(typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.onMessage) return;
      chrome.runtime.onMessage.addListener(onRuntimeMessage);
    }catch(err){ /* standalone demo mode */ }
  }

  function onRuntimeMessage(message){
    if(!message || typeof message !== "object") return;
    if(message.type === "RL_BRIDGE_DATA_CHANGED"){
      if(message.projectId === activeProjectId) bridgeRefreshFromStorage();
      return;
    }
    if(message.type === "RL_BRIDGE_SERVER_STOP"){
      handleBridgeServerStop(true);
      return;
    }
    if(message.type === "RL_BRIDGE_SERVER_RESUME"){
      clearBridgeServerStop(true);
      return;
    }
    /* App-initiated picks are consumed by the dock frame only. The worker
       broadcasts results to every extension page, so the flag keeps the
       flyout from also applying the same pick to its own request. */
    if(message.appPick === true && role === "dock"){
      handleAppPickRuntime(message);
      return;
    }
    if(message.appPick === true) return;
    var type = message.type;
    /* App-initiated screenshot capture is consumed by the dock only; the
       flyout must never attach the app's image to its own open request. */
    if(message.appCapture === true && role === "dock"){
      handleAppCaptureRuntime(message);
      return;
    }
    if(message.appCapture === true) return;
    if(role !== "flyout") return;
    if(type === "RL_CAPTURE_RESULT"){ handleCaptureResult(message); return; }
    if(type === "RL_CAPTURE_CANCELLED"){ handleCaptureCancelled(message); return; }
    if(type === "RL_PICK_RESULT"){ handlePickResult(message); return; }
    if(type === "RL_PICK_CANCELLED"){ handlePickCancelled(message); return; }
    if(type === "RL_FOLDER_PICKED"){
      if(message.target === "export" && projectExportPick){
        var targetProject = projectExportPick;
        projectExportPick = null;
        applyProjectExportTarget(targetProject, message.name);
        return;
      }
      var key = message.target === "export" ? "rl-export-dir" : "rl-root-dir";
      var input = document.getElementById(key === "rl-root-dir" ? "rl-set-root" : "rl-set-export-dir");
      applyPickedFolder(input, key, message.name);
    }
  }

  /* ---------- messaging ---------- */

  function openChannel(){
    try{ channel = new BroadcastChannel("rl-panel"); }
    catch(err){ channel = null; }
    if(channel) channel.onmessage = function(event){ onChannelMessage(event.data); };
  }

  /* shell v10 §19: every tab mirrors rl-pinned / rl-side written by any other
     tab. Applying only on an actual change keeps the host echo (which persists
     the same value again) from looping. */
  function watchStoragePrefs(){
    try{
      if(typeof chrome === "undefined" || !chrome.storage || !chrome.storage.onChanged) return;
      chrome.storage.onChanged.addListener(function(changes, area){
        if(area && area !== "local") return;
        if(!changes) return;

        if(changes["rl-pinned"]){
          var nextPinned = !!changes["rl-pinned"].newValue;
          if(nextPinned !== state.pinned){
            state.pinned = nextPinned;
            syncPinUI();
            sendLauncherUI();
            if(nextPinned) clearAutoHide();
            else if(role === "dock" && state.dock === "open" && !state.active) scheduleAutoHide();
          }
        }

        if(changes["rl-side"]){
          var nextSide = normalizeSide(changes["rl-side"].newValue);
          if(nextSide !== state.side){
            applyPanelSide(nextSide);
            /* the other tab's host still has to move its frames */
            if(role === "dock") sendPanelSide();
          }
        }

        if(changes["rl-root-dir"] || changes["rl-export-dir"]){
          if(changes["rl-root-dir"] && changes["rl-root-dir"].newValue !== undefined){
            folderDirs.root = String(changes["rl-root-dir"].newValue || "");
          }
          if(changes["rl-export-dir"] && changes["rl-export-dir"].newValue !== undefined){
            folderDirs.export = String(changes["rl-export-dir"].newValue || "");
          }
          if(role === "flyout"){
            var rootInput = document.getElementById("rl-set-root");
            var exportInput = document.getElementById("rl-set-export-dir");
            if(rootInput && folderDirs.root){ rootInput.value = folderDirs.root; rootInput.title = folderDirs.root; }
            if(exportInput && folderDirs.export){ exportInput.value = folderDirs.export; exportInput.title = folderDirs.export; }
          }
        }

        if(changes["rl-sync"]){
          var stamp = changes["rl-sync"].newValue;
          if(stamp && stamp.id && stamp.id !== instanceId){
            /* Chrome storage events wake every extension context, including a
               backgrounded app tab. Refresh and mirror the new ledger. */
            bridgeRefreshFromStorage();
          }
        }
      });
    }catch(err){ /* standalone / storage unavailable */ }
  }

  var PANEL_PAGE_SCOPED = {
    open:1, close:1, focus:1, action:1, state:1,
    ready:1, discard:1, cancel:1
  };

  function onChannelMessage(message){
    if(!message || typeof message !== "object") return;
    /* Dock/flyout share one BroadcastChannel across every tab. Section and
       action messages are only valid inside the same host page; another
       tab's panel must never open or switch this page's section. */
    if(panelPageToken && PANEL_PAGE_SCOPED[message.type] && message.pageToken !== panelPageToken){
      return;
    }
    if(message.type === "data-changed"){
      if(message.projectId === activeProjectId) bridgeRefreshFromStorage();
      return;
    }

    if(role === "dock"){
      if(message.type === "state"){
        if(typeof message.count === "number") dockCount = message.count;
        if(typeof message.ready === "number") dockReady = message.ready;
        if(typeof message.project === "string"){
          if(app) app.project = message.project;
          syncProjectGate();
        }
        if(message.projectId !== undefined && message.projectId !== activeProjectId){
          reloadSharedState();
          return;
        }
        if(message.dirty !== undefined) composeDirty = !!message.dirty;
        if(message.request !== undefined) dockSummary = message.request;
        if(message.saving !== undefined) setSaveState(message.saving ? "saving" : "saved");
        updateDockBadges();
        /* shell v11 §1: if the peer counters disagree with this dock's state,
           pull the authoritative list so the ring matches the badges. */
        if(role === "dock" && app && Array.isArray(app.requests)){
          var liveReady = 0;
          app.requests.forEach(function(item){ if(statusOf(item) === "ready") liveReady++; });
          if(message.count !== app.requests.length || message.ready !== liveReady) reloadSharedState();
        }
        return;
      }
      if(message.type === "folders"){
        if(typeof message.root === "string") folderDirs.root = message.root;
        if(typeof message.export === "string") folderDirs.export = message.export;
        return;
      }
      if(message.type === "action"){
        handleDockAction(message);
        return;
      }
      if(message.type === "lang"){
        applyLanguageFromPeer(message.lang);
        return;
      }
      if(message.type === "theme"){
        applyThemeFromPeer(message.theme);
        return;
      }
      if(message.type === "side"){
        applyPanelSide(message.side);
        sendPanelSide();
      }
      return;
    }

    if(message.type === "open"){
      if(!isKnownSection(message.section)) return;
      if(!els.card || !app){
        pendingSection = message.section;
        return;
      }
      showSection(message.section);
    }else if(message.type === "focus"){
      handleFocusMessage(message);
    }else if(message.type === "close"){
      pendingSection = null;
      if(els.card) hideSection();
    }else if(message.type === "state"){
      if(message.projectId !== undefined && message.projectId !== activeProjectId){
        reloadSharedState();
        return;
      }
      if(message.mode === "idle" || message.mode === "compose") state.mode = message.mode;
    }else if(message.type === "origin"){
      if(typeof message.originTabId === "number" && originWaiters.length){
        var waiters = originWaiters;
        originWaiters = [];
        for(var i = 0; i < waiters.length; i++) waiters[i](message.originTabId);
      }
    }else if(message.type === "ready"){
      handleReady();
    }else if(message.type === "discard"){
      discardPending();
    }else if(message.type === "cancel"){
      handleCancel();
    }else if(message.type === "lang"){
      applyLanguageFromPeer(message.lang);
    }else if(message.type === "theme"){
      applyThemeFromPeer(message.theme);
    }else if(message.type === "side"){
      applyPanelSide(message.side);
    }
  }

  function handleDockAction(message){
    if(message.action === "origin-request"){
      readOriginTabId();
      if(originTabId != null) channelPost({ type:"origin", originTabId:originTabId });
      return;
    }
    if(message.action === "compose"){
      if(!els.card) return;
      /* switch mode without closing the host iframe: the next openSection
         replaces the content in place (avoids a close-notification race) */
      setMode("compose", { keepSection:true });
      openSection(message.section || "page");
    }else if(message.action === "goto"){
      if(!els.card) return;
      openSection(message.section || "page");
    }else if(message.action === "idle"){
      if(!els.card) return;
      if(message.highlightId) state.highlight = message.highlightId;
      setMode("idle", { keepSection: !!message.openList });
      if(message.openList) openListSection();
      else if(message.close && state.active) closeSection();
    }
  }

  function handleHostRefresh(){
    if(capturePending || pickPending) return;
    var apply = function(pinnedValue){
      state.pinned = !!pinnedValue;
      syncPinUI();
      reloadSharedState();
      if(role === "dock"){
        sendLauncherUI();
        if(state.pinned && state.dock !== "open"){
          openDock();
        }else if(!state.pinned && state.dock === "open" && !state.active){
          scheduleAutoHide();
        }
      }
    };
    try{
      if(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local){
        chrome.storage.local.get(["rl-pinned"], function(values){
          try{ if(chrome.runtime && chrome.runtime.lastError){ apply(state.pinned); return; } }
          catch(err){ /* ignore */ }
          apply(values && values["rl-pinned"]);
        });
        return;
      }
    }catch(err){ /* fall through */ }
    apply(state.pinned);
  }

  function onHostMessage(event){
    if(event.source !== window.parent) return;
    var data = event.data;
    if(!data || typeof data !== "object") return;

    /* shell v14: the host owns the flyout rectangle; if it closes the
       preview from the page (Esc with page focus), dismiss the local layer. */
    if(data.type === "RL_HOST_PREVIEW_CLOSE"){
      closeImagePreview();
      return;
    }

    /* shell v9: the host may flip the side (drag past 75% or its own UI) */
    if(data.type === "RL_SIDE"){
      applyPanelSide(data.side);
      savePanelSide(state.side);
      return;
    }

    /* v12: a tab switch asks for a lightweight shared-state refresh */
    if(data.type === "RL_HOST_REFRESH"){
      handleHostRefresh();
      return;
    }

    /* v12: flush a pending debounced save before the tab goes hidden */
    if(data.type === "RL_HOST_FLUSH"){
      try{ flushSave(); }catch(err){ /* ignore */ }
      return;
    }

    /* live bridge: host relays the web app's ledger envelopes */
    if(data.type === "RL_APP_HELLO" || data.type === "RL_APP_SNAPSHOT" ||
       data.type === "RL_APP_PATCH" || data.type === "RL_APP_ACK" ||
       data.type === "RL_APP_BYE" || data.type === "RL_APP_SERVER_STOP" ||
       data.type === "RL_BRIDGE_CONTEXT" ||
       data.type === "RL_APP_TABS_REQUEST" || data.type === "RL_APP_PICK_REQUEST" ||
       data.type === "RL_APP_PICK_CANCEL" || data.type === "RL_APP_CAPTURE_REQUEST" ||
       data.type === "RL_APP_CAPTURE_CANCEL"){
      /* The page can post directly to this iframe, so the panel repeats the
         allowlist check instead of trusting the host alone. */
      if(!bridgeAllowedOrigin(event.origin)) return;
      bridgePageOrigin = event.origin;
      onBridgeHostMessage(data);
      return;
    }

    if(role === "flyout" && data.type === "RL_HOST_CLOSE_SECTION"){
      hideSection();
      return;
    }

    if(role === "dock"){
      if(data.type === "RL_HOST_OPEN"){
        /* shell v7: the host's launcher was clicked; the dock frame is now
           visible and the rail opens itself */
        openDock();
      }else if(data.type === "RL_HOST_COLLAPSE"){
        /* the host asked to collapse from its side; do not echo the state */
        closeDock({ silent:true });
      }else if(data.type === "RL_HOST_CLOSE_SECTION"){
        /* shell v7: page scrolling no longer closes the section */
        if(state.active) closeSection();
      }
    }else if(data.type === "RL_OPEN_SECTION"){
      /* fallback path when the BroadcastChannel message was missed
         (flyout iframe loaded after the dock asked for a section) */
      if(isKnownSection(data.section)) showSection(data.section);
    }else if(data.type === "RL_FLYOUT_MAX"){
      /* shell v7: the host owns the viewport budget; never use 100vh here,
         because the iframe itself is sized from the reported card height. */
      flyoutMaxAvailable = Number(data.height) || 0;
      applyFlyoutMax();
      lastSize = -1;
      /* the budget precedes the section message, so reporting here would send
         the *outgoing* section's height and make the host resize the iframe to
         it; measure once the incoming section has rendered instead. */
      requestAnimationFrame(reportSize);
    }else if(data.type === "RL_FLYOUT_GEOMETRY"){
      applyFlyoutGeometry(data.arrowY);
    }else if(data.type === "RL_PAGE_BG"){
      /* shell v5: paint the flyout iframe canvas with the page background so
         the transparent padding around the card never shows a white strip.
         Only strict rgb()/rgba() values from the host are accepted. */
      if(role === "flyout" && typeof data.color === "string" &&
         /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/.test(data.color) &&
         !/,\s*0\s*\)$/.test(data.color)){
        document.documentElement.style.setProperty("background-color", data.color, "important");
      }
    }else if(data.type === "RL_HOST_CLOSE_SECTION"){
      hideSection();
    }
  }

  /* host owns the vertical flyout placement; it sends the arrow offset
     inside the card so ::after keeps pointing at the dock button. */
  function applyFlyoutGeometry(value){
    if(role !== "flyout") return;
    var y = typeof value === "number" ? value : parseFloat(value);
    if(!isFinite(y)) return;
    y = Math.max(0, y);
    if(!els.card){ pendingArrowY = y; return; }
    els.card.style.setProperty("--arrow-y", y + "px");
  }

  function applyLanguageFromPeer(lang){
    if(lang !== "tr" && lang !== "en") return;
    if(state.lang === lang) return;
    state.lang = lang;
    document.documentElement.lang = lang;
    if(core && core.i18n && core.i18n.setLanguage) core.i18n.setLanguage(lang);
    if(role === "dock") refreshDockLabels();
    if(role === "flyout" && state.section) renderFlyout(state.section);
  }

  function setLanguage(lang){
    lang = lang === "en" ? "en" : "tr";
    if(state.lang === lang) return;
    state.lang = lang;
    document.documentElement.lang = lang;
    if(app) app.language = lang;
    if(core && core.i18n && core.i18n.setLanguage) core.i18n.setLanguage(lang);
    try{
      if(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local){
        chrome.storage.local.set({ "rl-lang": lang });
      }
    }catch(err){ /* ignore */ }
    markDirty(0);
    channelPost({ type:"lang", lang:lang });
    if(role === "flyout" && state.section) renderFlyout(state.section);
    if(role === "dock") refreshDockLabels();
  }
