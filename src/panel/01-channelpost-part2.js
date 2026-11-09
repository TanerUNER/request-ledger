  function channelPost(message){
    try{
      if(channel){
        if(panelPageToken && message.pageToken === undefined){
          message.pageToken = panelPageToken;
        }
        channel.postMessage(message);
      }
    }catch(err){ /* ignore */ }
  }

  function toHost(type, payload){
    var message = { source:"request-ledger", type:type };
    if(payload){
      for(var key in payload){
        if(has(payload, key)) message[key] = payload[key];
      }
    }
    try{ window.parent.postMessage(message, "*"); }catch(err){ /* ignore */ }
  }

  /* shell v6: panel-owned messages (toasts / folder hints) carry their own
     source so the host can route them without touching the shell protocol. */
  function panelTheme(){
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function postPanel(type, payload){
    var message = { source:"request-ledger-panel", type:type, theme:panelTheme() };
    if(payload){
      for(var key in payload){
        if(has(payload, key)) message[key] = payload[key];
      }
    }
    message.theme = panelTheme();
    try{ window.parent.postMessage(message, "*"); }catch(err){ /* ignore */ }
  }

  /* shell v7: the host draws the closed launcher/callout, so the dock reports
     its palette, labels and pin state. Sent on boot/mount and on theme,
     language or pin changes. */
  function sendLauncherUI(){
    if(role !== "dock" || !hasHost || !els.card) return;
    postPanel("RL_LAUNCHER_UI", {
      theme: panelTheme(),
      openLabel: lx("openPanel"),
      calloutTitle: "Request Ledger",
      calloutHint: lx("calloutHint"),
      pinned: !!state.pinned
    });
  }

  function sliceFiles(list){
    var out = [];
    if(!list) return out;
    for(var i = 0; i < list.length; i++) if(list[i]) out.push(list[i]);
    return out;
  }

  function safeCall(fn, fallback){
    try{ return fn(); }catch(err){ return fallback; }
  }

  /* ---------- storage availability ---------- */

  var STORAGE_BLOCKED_SELECTOR = [
    '[data-act="create"]', '[data-act="save-section"]', '[data-act="save-record"]',
    '[data-act="save-draft"]', '[data-act="delete"]', '[data-act="unlock"]',
    '[data-act="add-image"]', '[data-act="remove-image"]',
    '[data-act="add-file"]', '[data-act="remove-file"]',
    '[data-act="capture-open"]', '[data-act="pick-element"]', '[data-act="pick-capture"]',
    '[data-act="backup-restore"]', '[data-act="backup-clear"]', '[data-act="backup-confirm"]',
    '[data-archive-act="delete-confirm"]', '[data-archive-act="clear-confirm"]',
    '[data-archive-act="dup-overwrite"]', '[data-archive-act="dup-new"]',
    '[data-archive-act="rename-save"]'
  ].join(",");

  function storageBlocked(){
    return !storageOk;
  }

  function buildStorageBanner(){
    var banner = h("div", "storage-banner");
    banner.id = "rl-storage-banner";
    banner.setAttribute("role", "alert");
    banner.setAttribute("aria-label", lx("storageUnavailable"));
    banner.title = lx("storageUnavailable");
    banner.textContent = lx("storageUnavailable");
    banner.hidden = storageOk;
    return banner;
  }

  function syncStorageUI(){
    if(storageOk){
      for(var k = 0; k < storageBlockedNodes.length; k++){
        var blocked = storageBlockedNodes[k];
        if(blocked){
          blocked.disabled = false;
          blocked.removeAttribute("aria-disabled");
        }
      }
      storageBlockedNodes = [];
      return;
    }
    var nodes = document.querySelectorAll(STORAGE_BLOCKED_SELECTOR + ',[data-save-dependent]');
    for(var i = 0; i < nodes.length; i++){
      if(!nodes[i].disabled) storageBlockedNodes.push(nodes[i]);
      nodes[i].disabled = true;
      nodes[i].setAttribute("aria-disabled", "true");
    }
    var fileInputs = document.querySelectorAll('input[type="file"]');
    for(var j = 0; j < fileInputs.length; j++){
      if(!fileInputs[j].disabled) storageBlockedNodes.push(fileInputs[j]);
      fileInputs[j].disabled = true;
      fileInputs[j].setAttribute("aria-disabled", "true");
    }
  }

  function setStorageFailure(reason){
    storageFailureReason = reason ? String(reason.name || reason.message || reason) : "";
    if(!storageOk) return;
    storageOk = false;
    var banners = document.querySelectorAll("#rl-storage-banner");
    for(var i = 0; i < banners.length; i++){
      banners[i].hidden = false;
      banners[i].setAttribute("aria-label", lx("storageUnavailable"));
      banners[i].title = storageFailureReason ? lx("storageUnavailable") + ": " + storageFailureReason : lx("storageUnavailable");
      banners[i].textContent = lx("storageUnavailable");
    }
    syncStorageUI();
  }

  /* A transient write failure must not lock the panel forever: the next
     successful save clears the banner and re-enables the controls it disabled. */
  function clearStorageFailure(){
    storageFailureReason = "";
    if(storageOk) return;
    storageOk = true;
    storageNotified = false;
    var banners = document.querySelectorAll("#rl-storage-banner");
    for(var i = 0; i < banners.length; i++) banners[i].hidden = true;
    syncStorageUI();
  }

  /* ---------- preferences ---------- */

  function readPrefs(){
    return new Promise(function(resolve){
      var done = false;
      function finish(values){
        if(done) return;
        done = true;
        resolve(values || {});
      }
      function withSessionPrefs(localValues){
        if(panelTabScope <= 0){
          finish(localValues);
          return;
        }
        try{
          if(typeof chrome === "undefined" || !chrome.storage || !chrome.storage.session){
            finish(localValues);
            return;
          }
          chrome.storage.session.get([prefKey("rl-theme"), prefKey("rl-pinned")], function(sessionValues){
            try{ if(chrome.runtime && chrome.runtime.lastError){ /* consumed */ } }catch(err){ /* ignore */ }
            var merged = {};
            for(var key in localValues){
              if(Object.prototype.hasOwnProperty.call(localValues, key)) merged[key] = localValues[key];
            }
            /* A new tab starts from the defaults, never from a legacy global. */
            delete merged["rl-theme"];
            delete merged["rl-pinned"];
            if(sessionValues){
              var theme = sessionValues[prefKey("rl-theme")];
              var pinned = sessionValues[prefKey("rl-pinned")];
              if(theme != null) merged["rl-theme"] = theme;
              if(pinned != null) merged["rl-pinned"] = pinned;
            }
            finish(merged);
          });
          return;
        }catch(err){ /* fall back to local */ }
        finish(localValues);
      }
      try{
        if(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local){
          chrome.storage.local.get(["rl-theme", "rl-lang", "rl-pinned", "rl-root-dir", "rl-export-dir", "rl-side"], function(values){
            try{ if(chrome.runtime && chrome.runtime.lastError){ /* consumed */ } }catch(err){ /* ignore */ }
            if(values){
              if(values["rl-root-dir"]) folderDirs.root = String(values["rl-root-dir"]);
              if(values["rl-export-dir"]) folderDirs.export = String(values["rl-export-dir"]);
            }
            withSessionPrefs(values || {});
          });
          setTimeout(function(){ finish({}); }, 500);
          return;
        }
      }catch(err){ /* standalone / no storage */ }
      finish({});
    });
  }

  function normalizeThemePref(value){
    return value === "dark" || value === "light" ? value : "system";
  }

  function applyTheme(next){
    var pref = normalizeThemePref(next);
    state.themePref = pref;
    state.theme = pref === "system" ? systemTheme() : pref;
    document.documentElement.setAttribute("data-theme", state.theme);
    sendLauncherUI();
  }

  function saveThemePref(pref){
    try{
      var key = prefKey("rl-theme");
      if(panelTabScope > 0 && typeof chrome !== "undefined" && chrome.storage && chrome.storage.session){
        var patch = {};
        patch[key] = pref;
        chrome.storage.session.set(patch);
        return;
      }
      if(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local){
        chrome.storage.local.set({ "rl-theme": pref });
      }
    }catch(err){ /* ignore */ }
  }

  function updateThemeSelect(){
    var select = document.getElementById("rl-set-theme");
    if(!select) return;
    if(select.value !== state.themePref) select.value = state.themePref;
    syncSelectUI(select);
  }

  function setTheme(next){
    var pref = normalizeThemePref(next);
    themePinned = true;
    applyTheme(pref);
    saveThemePref(pref);
    channelPost({ type:"theme", theme:pref });
    updateThemeSelect();
    if(typeof syncThemeToggle === "function") syncThemeToggle();
  }

  function applyThemeFromPeer(pref){
    if(pref !== "light" && pref !== "dark" && pref !== "system") return;
    if(state.themePref === pref) return;
    applyTheme(pref);
    updateThemeSelect();
    if(typeof syncThemeToggle === "function") syncThemeToggle();
  }

  /* ---------- shell v9: left / right panel placement ---------- */

  function normalizeSide(value){
    return value === "left" ? "left" : "right";
  }

  function applyPanelSide(value){
    state.side = normalizeSide(value);
    document.documentElement.classList.toggle("dock-left", state.side === "left");
    updateSideSelect();
  }

  function savePanelSide(side){
    try{
      if(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local){
        chrome.storage.local.set({ "rl-side": side });
      }
    }catch(err){ /* ignore */ }
  }

  function updateSideSelect(){
    var select = document.getElementById("rl-set-side");
    if(!select) return;
    if(select.value !== state.side) select.value = state.side;
    syncSelectUI(select);
  }

  function sendPanelSide(){
    if(role !== "dock" || !hasHost) return;
    postPanel("RL_PANEL_SIDE", { side:state.side });
  }

  function setPanelSide(value){
    var next = normalizeSide(value);
    applyPanelSide(next);
    savePanelSide(next);
    channelPost({ type:"side", side:next });
    if(role === "dock") sendPanelSide();
  }

  function applyThemeAndLanguage(prefs){
    prefs = prefs || {};
    var theme = prefs["rl-theme"];
    var lang = prefs["rl-lang"];

    if(demo){
      var qTheme = params.get("theme");
      if(qTheme === "dark" || qTheme === "light") theme = qTheme;
      var qLang = params.get("lang");
      if(qLang === "en" || qLang === "tr") lang = qLang;
    }

    if(!themePinned) applyTheme(theme);
    if(lang === "en" || lang === "tr") state.lang = lang;
    document.documentElement.lang = state.lang;

    /* shell v3: "rl-pinned" is persisted independently of theme/language */
    state.pinned = !!prefs["rl-pinned"];
    if(demo){
      var qPin = params.get("pinned");
      if(qPin === "1") state.pinned = true;
      else if(qPin === "0") state.pinned = false;
    }

    /* shell v9: placement is applied before the shell is revealed */
    var side = prefs["rl-side"];
    if(demo && params.get("side") === "left") side = "left";
    applyPanelSide(side);
  }

  /* "Sistem" follows the OS preference live (Phase 7) */
  function watchSystemTheme(){
    try{
      if(!window.matchMedia) return;
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      var onChange = function(){
        if(state.themePref === "system") applyTheme("system");
      };
      if(mq.addEventListener) mq.addEventListener("change", onChange);
      else if(mq.addListener) mq.addListener(onChange);
    }catch(err){ /* ignore */ }
  }

  /* ---------- app state (IstekCore) ---------- */

  function newLedgerId(){
    if(core && core.util && typeof core.util.newLedgerId === "function") return core.util.newLedgerId();
    return "ledger_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
  }

  function defaultApp(){
    return {
      version: 2,
      project: "",
      ledgerId: newLedgerId(),
      requests: [],
      agents: [],
      language: "en",
      exportBehavior: "default",
      lastExport: null
    };
  }

  /* The project registry is the source of truth for the name; a ledger's
     embedded project field is refreshed on the next save. */
  function applyStoredProject(){
    var record = activeProjectRecord();
    if(record){
      app.project = record.name;
    }else if(typeof app.project !== "string"){
      app.project = "";
    }
  }

  function bootApp(prefs){
    if(!core || !core.storage){
      storageOk = false;
      app = defaultApp();
      return Promise.resolve();
    }
    return Promise.resolve()
      .then(function(){ return core.storage.init(); })
      .catch(function(){
        /* The dock and flyout iframes open the same database at the same time on
           first install; one of them can be blocked for a few milliseconds.
           Retrying once turns that transient race into a working session. */
        return new Promise(function(resolve){ setTimeout(resolve, 250); })
          .then(function(){ return core.storage.init(); })
          .catch(function(){
            /* IndexedDB can be blocked while the sibling frame opens the same
               database. Text saves use localStorage and must keep working.
               Probe localStorage: only a real text-storage failure disables
               writes and shows the red banner. */
            var textWritable = true;
            try{
              localStorage.setItem("rl-storage-probe", "1");
              localStorage.removeItem("rl-storage-probe");
            }catch(err){ textWritable = false; }
            if(textWritable) mediaStorageOk = false;
            else storageOk = false;
          });
      })
      .then(function(){
        /* Phase 2b: the project registry decides which ledger to open. A
           migrated legacy ledger keeps its stored name, or receives the
           neutral "Imported project" label; an empty registry leaves the
           project gate/picker on screen. */
        initProjectRegistry();
        return syncStorageScope();
      })
      .then(function(){
        var loaded = null;
        if(activeProjectId){
          try{ loaded = core.storage.loadState(); }catch(err){ loaded = null; }
        }
        app = loaded || defaultApp();
        if(!Array.isArray(app.requests)) app.requests = [];
        if(!Array.isArray(app.agents)) app.agents = [];
        if(activeProjectId){
          var record = activeProjectRecord();
          if(record){
            app.project = record.name;
            folderDirs.export = record.exportTarget || "";
            /* The registry owns the one ledger id; a missing payload must not
               mint a second identity for the same project. */
            if(normalizeLedgerId(record.ledgerId)){
              app.ledgerId = normalizeLedgerId(record.ledgerId);
            }else if(normalizeLedgerId(app.ledgerId)){
              setProjectLedgerId(activeProjectId, app.ledgerId);
            }else{
              app.ledgerId = newLedgerId();
              setProjectLedgerId(activeProjectId, app.ledgerId);
            }
          }else{
            app.project = "";
          }
        }else{
          app.project = "";
        }
        if(typeof app.project !== "string") app.project = "";
        if(!app.language) app.language = "en";
        if(!demo && !(prefs && (prefs["rl-lang"] === "tr" || prefs["rl-lang"] === "en"))){
          state.lang = app.language === "tr" ? "tr" : "en";
        }
        document.documentElement.lang = state.lang;
        if(core.i18n && core.i18n.setLanguage) core.i18n.setLanguage(state.lang);
        resetProjectSnapshot();
        if(activeProjectId) migrateLegacyScope(activeProjectId).catch(function(){ /* best effort */ });
        return readActivePointer();
      })
      .then(function(id){
        activeRequestId = id && requestById(id) ? id : null;
        dockCount = app ? app.requests.length : 0;
        dockReady = 0;
        if(app) app.requests.forEach(function(item){ if(statusOf(item) === "ready") dockReady++; });
        dockSummary = summaryOf(activeRequest());
      })
      .catch(function(){
        app = app || defaultApp();
        activeRequestId = null;
      });
  }

  function readActivePointer(){
    return new Promise(function(resolve){
      var done = false;
      function finish(value){ if(done) return; done = true; resolve(value == null ? null : String(value)); }
      try{
        if(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local){
          chrome.storage.local.get(["rl-active"], function(values){
            try{ if(chrome.runtime && chrome.runtime.lastError){ /* consumed */ } }catch(err){ /* ignore */ }
            finish(values ? values["rl-active"] : null);
          });
          setTimeout(function(){ finish(null); }, 400);
          return;
        }
      }catch(err){ /* ignore */ }
      finish(null);
    });
  }

  function saveActivePointer(id){
    try{
      if(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local){
        var payload = {};
        payload["rl-active"] = id == null ? null : String(id);
        chrome.storage.local.set(payload);
      }
    }catch(err){ /* ignore */ }
  }

  function requestById(id){
    if(!app || !id) return null;
    if(core && core.requests && core.requests.find) return core.requests.find(app.requests, id);
    for(var i = 0; i < app.requests.length; i++){
      if(app.requests[i].id === id) return app.requests[i];
    }
    return null;
  }

  function activeRequest(){
    /* shell v10: the wizard's pending draft is the active request while it
       exists, but it is deliberately absent from app.requests. */
    return pendingRequest || requestById(activeRequestId);
  }

  function typeInfo(id){
    return TYPE_MAP[id] || TYPES[0];
  }

  function priorityInfo(id){
    return PRIORITY_MAP[id] || PRIORITIES[1];
  }

  function templateFor(type){
    return TYPE_TEMPLATES[type] || TYPE_TEMPLATES.update;
  }

  function statusOf(req){
    if(core && core.requests && core.requests.status){
      try{ return core.requests.status(req); }catch(err){ /* fall through */ }
    }
    if(!req) return "missing";
    return req.confirmed ? "ready" : "missing";
  }

  function isLocked(req){
    return !!req && statusOf(req) === "ready";
  }

  /* shell v12: the creation wizard's Page step hides the capture/pick tools */
  function isWizardPageStep(){
    return role === "flyout" && !!pendingRequest && state.section === "page";
  }

  function trLower(value){
    if(core && core.i18n && typeof core.i18n.trLower === "function"){
      try{ return core.i18n.trLower(value == null ? "" : String(value)); }catch(err){ /* fall through */ }
    }
    return String(value == null ? "" : value).toLocaleLowerCase("tr");
  }

  function statusLabel(status){
    if(status === "ready") return t("Hazır");
    if(status === "pending") return t("Onay bekliyor");
    return t("Eksik");
  }

  function selectedRequestId(){
    if(activeRequestId && requestById(activeRequestId)) return activeRequestId;
    return state.highlight;
  }

  function listMatches(req){
    if(!req) return false;
    if(listFilter.type !== "all" && req.type !== listFilter.type) return false;
    var status = statusOf(req);
    if(listFilter.status === "ready" && status !== "ready") return false;
    if(listFilter.status === "notready" && status === "ready") return false;
    if(listFilter.q){
      var needle = trLower(listFilter.q);
      var haystack = trLower([req.title, req.page, req.description, req.note].join(" "));
      if(haystack.indexOf(needle) === -1) return false;
    }
    return true;
  }

  function hasContent(req){
    if(!req) return false;
    var textFields = ["title","description","page","location","consoleError","link","sampleWebsite","note"];
    for(var i = 0; i < textFields.length; i++){
      if(req[textFields[i]] && String(req[textFields[i]]).trim()) return true;
    }
    return (req.images && req.images.length > 0) || (req.attachments && req.attachments.length > 0);
  }

  function summaryOf(req){
    if(!req) return null;
    return {
      id: req.id,
      type: req.type,
      title: req.title || "",
      page: req.page || "",
      location: req.location || "",
      hasDescription: !!(req.description && String(req.description).trim()),
      imagesCount: (req.images || []).length,
      hasConsole: !!(req.consoleError && String(req.consoleError).trim()),
      hasSample: !!(req.sampleWebsite && String(req.sampleWebsite).trim()),
      attachmentsCount: (req.attachments || []).length,
      hasLink: !!(req.link && String(req.link).trim()),
      hasNote: !!(req.note && String(req.note).trim()),
      status: statusOf(req)
    };
  }

  function descProgress(summary){
    var tpl = templateFor(summary.type);
    var total = 2;
    var filled = (summary.hasDescription ? 1 : 0) + (summary.imagesCount > 0 ? 1 : 0);
    if(tpl.console){ total++; if(summary.hasConsole) filled++; }
    if(tpl.sampleWebsite){ total++; if(summary.hasSample) filled++; }
    if(tpl.attachments){ total++; if(summary.attachmentsCount > 0) filled++; }
    if(tpl.link){ total++; if(summary.hasLink) filled++; }
    total++;
    if(summary.hasNote) filled++;
    return { filled:filled, total:total };
  }

  function pageProgress(summary){
    var tpl = templateFor(summary.type);
    var total = 0;
    var filled = 0;
    if(tpl.page){ total++; if(summary.page && String(summary.page).trim()) filled++; }
    if(tpl.location){ total++; if(summary.location && String(summary.location).trim()) filled++; }
    return { filled:filled, total:total };
  }

  /* ---------- persistence / feedback ---------- */

  function saveText(){
    return state.saving === "saving" ? lx("saving") : t("Kaydedildi");
  }

  function setSaveState(next){
    state.saving = next === "saving" ? "saving" : "saved";
    if(savedFadeTimer){ clearTimeout(savedFadeTimer); savedFadeTimer = null; }
    var nodes = document.querySelectorAll("#rl-save-state");
    for(var i = 0; i < nodes.length; i++){
      nodes[i].setAttribute("data-state", state.saving);
      nodes[i].textContent = saveText();
      nodes[i].classList.toggle("is-faded", false);
    }
    if(state.saving === "saved"){
      lastSavedAt = Date.now();
      /* shell v10: "Kaydedildi" fades away in place after 3s without edits */
      savedFadeTimer = setTimeout(function(){
        savedFadeTimer = null;
        var live = document.querySelectorAll("#rl-save-state");
        for(var j = 0; j < live.length; j++){
          if(live[j].getAttribute("data-state") === "saved") live[j].classList.add("is-faded");
        }
      }, 3000);
    }
  }

  function saveNow(){
    if(typeof companionLocked === "function" && companionLocked()){
      if(saveTimer){ clearTimeout(saveTimer); saveTimer = null; }
      setSaveState("saved");
      return false;
    }
    if(saveTimer){ clearTimeout(saveTimer); saveTimer = null; }
    /* Phase 2b: no project open means there is no project ledger to write. */
    if(!activeProjectId){
      setSaveState("saved");
      return false;
    }
    if(!app || !core || !core.storage || !core.storage.saveState){
      setSaveState("saved");
      return false;
    }
    var ok = false;
    var saveError = null;
    for(var attempt = 0; attempt < 2 && !ok; attempt += 1){
      try{ ok = !!core.storage.saveState(app); }catch(err){ ok = false; }
      if(!ok && core.storage.getLastSaveError) saveError = core.storage.getLastSaveError();
    }
    if(!ok){
      setStorageFailure(saveError);
      if(!storageNotified){
        storageNotified = true;
        var quota = saveError && (/quota/i.test(String(saveError.name || "")) ||
          /quota/i.test(String(saveError.message || "")));
        toast(lx(quota ? "storageFull" : "storageWriteFailed"), "error");
      }
    }else{
      clearStorageFailure();
      bridgeRefreshHoldUntil = Date.now() + 1000;
      if(activeProjectId){
        touchActiveProject(app ? app.project : "", app && app.updatedAt ? app.updatedAt : nowISO(), app && app.ledgerId);
        resetProjectSnapshot();
      }
      writeSyncStamp();
    }
    setSaveState("saved");
    broadcastState();
    /* live bridge: mirror the new text state to an open web app */
    if(ok) bridgeNotifyChange();
    /* Other tabs share the same extension storage. Notify their panels so a
       request created there reaches the app even while this app tab is
       backgrounded; storage events alone can be delayed. */
    if(ok && activeProjectId){
      channelPost({ type:"data-changed", projectId:activeProjectId });
      /* Runtime delivery also reaches a panel frame in a backgrounded tab,
         where BroadcastChannel/storage events can be delayed. */
      sendRuntime({ type:"RL_DATA_CHANGED", projectId:activeProjectId });
    }
    /* shell v11 §1: the ring must reflect the same state we just wrote */
    if(role === "dock") updateDockBadges();
    return ok;
  }

  /* shell v11 §2: a successful save advertises itself to the other pages */
  function writeSyncStamp(){
    try{
      if(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local){
        chrome.storage.local.set({ "rl-sync": { id:instanceId, at:Date.now() } });
      }
    }catch(err){ /* standalone */ }
  }
