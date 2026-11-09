  /* ============================================================
     WORKSPACE / PROJECTS (Phase 2b)

     One registry lists every project; each project keeps its own ledger
     under PROJECT_LEDGER_PREFIX + id. The active project id is also the
     IndexedDB scope used by the media and snapshot helpers in core.storage.
     The web app uses the same registry shape (oz-projeler-v1).
     ============================================================ */

  function nowISO(){
    if(core && core.util && typeof core.util.nowISO === "function") return core.util.nowISO();
    return new Date().toISOString();
  }

  function normalizeProjectName(value){
    var text = String(value == null ? "" : value).trim();
    return text ? text.slice(0, 60) : "";
  }

  function newProjectId(){
    return "prj_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  }

  function projectLedgerKey(projectId){
    return PROJECT_LEDGER_PREFIX + projectId;
  }

  function emptyProjectRegistry(){
    return { version: 1, activeId: null, projects: [] };
  }

  /* A legacy install has no project name of its own. The neutral label follows
     the current panel language; a stored name always wins. */
  function importedProjectName(lang){
    var pair = L.projectImported;
    var use = lang === "tr" || lang === "en" ? lang : (state.lang === "tr" ? "tr" : "en");
    return pair ? (use === "tr" ? pair.tr : pair.en) : "Imported project";
  }

  function isLegacyDefaultProjectName(name){
    var value = normalizeProjectName(name);
    return value === "Ortak Zemin" || value === "Common Ground";
  }

  function normalizeProjectRecord(record){
    if(!record || typeof record !== "object") return null;
    var id = typeof record.id === "string" && /^prj_[A-Za-z0-9_]+$/.test(record.id) ? record.id : "";
    if(!id) return null;
    var name = normalizeProjectName(record.name) || importedProjectName();
    var createdAt = typeof record.createdAt === "string" && record.createdAt ? record.createdAt : nowISO();
    var updatedAt = typeof record.updatedAt === "string" && record.updatedAt ? record.updatedAt : createdAt;
    return {
      id: id,
      name: name,
      createdAt: createdAt,
      updatedAt: updatedAt,
      exportTarget: typeof record.exportTarget === "string" ? record.exportTarget.slice(0, 120) : "",
      archiveCollapsed: record.archiveCollapsed === true
    };
  }

  function readRegistry(){
    try{
      if(typeof localStorage === "undefined") return null;
      var raw = localStorage.getItem(PROJECTS_KEY);
      if(!raw) return null;
      var parsed = JSON.parse(raw);
      if(!parsed || !Array.isArray(parsed.projects)) return null;
      var projects = parsed.projects.map(normalizeProjectRecord).filter(Boolean);
      var activeId = typeof parsed.activeId === "string" && projects.some(function(project){ return project.id === parsed.activeId; })
        ? parsed.activeId
        : null;
      var renamed = false;
      projects.forEach(function(project){
        if(isLegacyDefaultProjectName(project.name)){
          project.name = importedProjectName();
          renamed = true;
        }
      });
      var registry = { version: 1, activeId: activeId, projects: projects };
      if(renamed){
        try{ localStorage.setItem(PROJECTS_KEY, JSON.stringify(registry)); }catch(err){ /* quota */ }
      }
      return registry;
    }catch(err){
      console.warn("[rl-panel] project registry could not be read", err);
      return null;
    }
  }

  function writeRegistry(registry){
    try{
      if(typeof localStorage === "undefined") return false;
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(registry));
      projectRegistry = registry;
      return true;
    }catch(err){
      console.warn("[rl-panel] project registry could not be written", err);
      return false;
    }
  }

  function findProjectRecordIn(registry, projectId){
    if(!registry || !projectId) return null;
    for(var i = 0; i < registry.projects.length; i++){
      if(registry.projects[i].id === projectId) return registry.projects[i];
    }
    return null;
  }

  function findProjectRecord(projectId){
    return findProjectRecordIn(readRegistry(), projectId);
  }

  function activeProjectRecord(){
    return findProjectRecord(activeProjectId);
  }

  function activeProjectName(){
    var record = activeProjectRecord();
    return record ? record.name : "";
  }

  /* One-time migration: a legacy single-ledger install becomes one project.
     Its stored name is preserved; otherwise the neutral translated
     "Imported project" label is used. The legacy payload is copied byte for
     byte and the legacy key itself is kept for rollback and the bridge. */
  function initProjectRegistry(){
    var existing = readRegistry();
    if(existing){
      projectRegistry = existing;
      activeProjectId = existing.activeId;
      return existing;
    }
    var legacyRaw = null;
    try{ legacyRaw = typeof localStorage !== "undefined" ? localStorage.getItem(LEGACY_STORAGE_KEY) : null; }catch(err){ legacyRaw = null; }
    if(legacyRaw){
      var legacy = null;
      try{ legacy = JSON.parse(legacyRaw); }catch(err){ legacy = null; }
      if(legacy && Array.isArray(legacy.requests)){
        var id = newProjectId();
        var stamp = typeof legacy.updatedAt === "string" && legacy.updatedAt ? legacy.updatedAt : nowISO();
        var legacyName = normalizeProjectName(legacy.project);
        var project = {
          id: id,
          name: isLegacyDefaultProjectName(legacyName)
            ? importedProjectName(legacy.language)
            : (legacyName || importedProjectName(legacy.language)),
          createdAt: stamp,
          updatedAt: stamp,
          exportTarget: "",
          archiveCollapsed: false
        };
        var registry = { version: 1, activeId: id, projects: [project] };
        try{ localStorage.setItem(projectLedgerKey(id), legacyRaw); }catch(err){ /* quota: legacy stays intact */ }
        writeRegistry(registry);
        migratedProjectId = id;
        projectRegistry = registry;
        activeProjectId = id;
        return registry;
      }
    }
    var empty = emptyProjectRegistry();
    projectRegistry = empty;
    activeProjectId = null;
    return empty;
  }

  /* Point core.storage at the active project's ledger and IndexedDB scope. */
  function syncStorageScope(preferredId){
    var registry = readRegistry();
    projectRegistry = registry;
    var preferred = preferredId && registry && findProjectRecordIn(registry, preferredId)
      ? preferredId
      : null;
    var id = preferred ||
      (registry && registry.activeId && findProjectRecordIn(registry, registry.activeId)
        ? registry.activeId
        : null);
    activeProjectId = id;
    var key = id ? projectLedgerKey(id) : LEGACY_STORAGE_KEY;
    try{
      if(core && core.storage && core.storage.init){
        return Promise.resolve(core.storage.init({ stateKey:key, projectId:id || null })).catch(function(){
          /* storage failure is surfaced by the existing banner */
        });
      }
    }catch(err){ /* storage failure is surfaced by the existing banner */ }
    return Promise.resolve();
  }

  function touchActiveProject(name, updatedAt){
    if(!activeProjectId) return;
    var registry = readRegistry();
    if(!registry) return;
    var project = findProjectRecordIn(registry, activeProjectId);
    if(!project) return;
    project.name = normalizeProjectName(name) || project.name;
    project.updatedAt = updatedAt || project.updatedAt;
    registry.activeId = activeProjectId;
    writeRegistry(registry);
  }

  function updateProjectRecord(projectId, patch){
    if(!projectId) return null;
    var registry = readRegistry();
    if(!registry) return null;
    var project = findProjectRecordIn(registry, projectId);
    if(!project) return null;
    if(patch && typeof patch === "object"){
      if(typeof patch.name === "string") project.name = normalizeProjectName(patch.name) || project.name;
      if(typeof patch.updatedAt === "string" && patch.updatedAt) project.updatedAt = patch.updatedAt;
      if(typeof patch.exportTarget === "string") project.exportTarget = patch.exportTarget.slice(0, 120);
      if(typeof patch.archiveCollapsed === "boolean") project.archiveCollapsed = patch.archiveCollapsed;
    }
    if(!writeRegistry(registry)) return null;
    return project;
  }

  function removeProjectRecord(projectId){
    var registry = readRegistry();
    if(!registry) return null;
    var index = -1;
    for(var i = 0; i < registry.projects.length; i++){
      if(registry.projects[i].id === projectId){ index = i; break; }
    }
    if(index < 0) return null;
    registry.projects.splice(index, 1);
    if(registry.activeId === projectId){
      var sorted = registry.projects.slice().sort(function(a, b){
        return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
      });
      registry.activeId = sorted.length ? sorted[0].id : null;
    }
    if(!writeRegistry(registry)) return null;
    return registry;
  }

  function readProjectLedgerPayload(projectId){
    try{
      if(typeof localStorage === "undefined") return null;
      var raw = localStorage.getItem(projectLedgerKey(projectId));
      if(!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && Array.isArray(parsed.requests) ? parsed : null;
    }catch(err){
      return null;
    }
  }

  function projectRequestCount(projectId){
    if(projectId === activeProjectId && app && Array.isArray(app.requests)) return app.requests.length;
    var payload = readProjectLedgerPayload(projectId);
    return payload ? payload.requests.length : 0;
  }

  function formatProjectDate(value){
    if(!value) return "";
    var date = new Date(value);
    if(isNaN(date.getTime())) return "";
    try{
      return new Intl.DateTimeFormat(state.lang === "en" ? "en-US" : "tr-TR", {
        day:"2-digit", month:"short", year:"numeric"
      }).format(date);
    }catch(err){
      return date.toLocaleDateString(state.lang === "en" ? "en-US" : "tr-TR");
    }
  }

  function projectCountText(count, oneEn, manyEn, oneTr){
    if(core && core.i18n && typeof core.i18n.countLabel === "function"){
      try{
        var isEn = state.lang === "en";
        return core.i18n.countLabel(count, state.lang, {
          one: isEn ? oneEn : oneTr,
          many: isEn ? manyEn : oneTr
        });
      }catch(err){ /* fall through */ }
    }
    return t(count + " istek");
  }

  function projectRequestCountText(count){
    return projectCountText(count, "request", "requests", "istek");
  }

  function projectRecordCountText(count){
    return projectCountText(count, "record", "records", "kayıt");
  }

  function projectDraftCountText(count){
    return projectCountText(count, "draft", "drafts", "taslak");
  }

  function projectMetaText(project){
    var date = formatProjectDate(project.updatedAt);
    var count = projectRequestCountText(projectRequestCount(project.id));
    return date ? date + " · " + count : count;
  }

  /* Content snapshot used for the dirty switch prompt. updatedAt is excluded
     so an automatic save does not make an unchanged project look dirty. */
  function projectSnapshotContent(){
    if(!app) return "";
    var requests = (app.requests || []).map(function(req){
      try{
        return core && core.requests && core.requests.serialize ? core.requests.serialize(req) : req;
      }catch(err){ return req; }
    });
    return JSON.stringify({
      project: app.project || "",
      requests: requests,
      agents: app.agents || [],
      language: app.language || "en",
      exportBehavior: app.exportBehavior || "default",
      lastExport: app.lastExport || null
    });
  }

  function resetProjectSnapshot(){
    projectSnapshot = projectSnapshotContent();
  }

  function isProjectDirty(){
    return !!activeProjectId && projectSnapshot !== "" && projectSnapshot !== projectSnapshotContent();
  }

  function cancelScheduledSave(){
    if(saveTimer){ clearTimeout(saveTimer); saveTimer = null; }
  }

  /* Run a storage operation under another project's scope without changing
     the active project. The scope update is synchronous inside init(). */
  function scopeInit(projectId){
    try{
      if(core && core.storage && core.storage.init){
        return Promise.resolve(core.storage.init({ projectId: projectId || null })).catch(function(){ /* storage banner owns the failure */ });
      }
    }catch(err){ /* ignore */ }
    return Promise.resolve();
  }

  function withProjectScope(projectId, action){
    var previous = activeProjectId;
    return scopeInit(projectId).then(action).then(function(value){
      return scopeInit(previous).then(function(){ return value; });
    }, function(error){
      return scopeInit(previous).then(function(){ throw error; });
    });
  }

  async function deleteProjectScopedData(projectId){
    if(!projectId) return;
    try{ localStorage.removeItem(projectLedgerKey(projectId)); }catch(err){ /* ignore */ }
    await withProjectScope(projectId, async function(){
      try{ if(core.storage.clearAllMedia) await core.storage.clearAllMedia(); }catch(err){ /* best effort */ }
      try{ if(core.storage.clearCollection){ await core.storage.clearCollection("records"); await core.storage.clearCollection("drafts"); } }catch(err){ /* best effort */ }
      try{ if(core.storage.clearHistory) await core.storage.clearHistory(); }catch(err){ /* best effort */ }
      try{ if(core.storage.deleteSetting) await core.storage.deleteSetting("targetFolder:" + projectId); }catch(err){ /* best effort */ }
    });
  }

  function setProjectExportTarget(projectId, value){
    if(!projectId) return;
    var name = String(value == null ? "" : value).slice(0, 120);
    updateProjectRecord(projectId, { exportTarget:name });
    try{
      if(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local){
        if(projectId === activeProjectId){
          folderDirs.export = name;
          chrome.storage.local.set({ "rl-export-dir":name });
          channelPost({ type:"folders", root:folderDirs.root, export:folderDirs.export });
        }else{
          /* The folder-picker writes the global key; keep that cache pointed at
             the open project so the dock hint never shows another project's
             target. */
          var current = activeProjectRecord();
          chrome.storage.local.set({ "rl-export-dir": current ? (current.exportTarget || "") : "" });
        }
      }
    }catch(err){ /* ignore */ }
  }

  /* ---------- project open / switch / create ---------- */

  function loadProjectIntoMemory(projectId, project){
    activeProjectId = projectId;
    var loaded = null;
    try{ loaded = core && core.storage && core.storage.loadState ? core.storage.loadState() : null; }catch(err){ loaded = null; }
    app = loaded || defaultApp();
    if(!Array.isArray(app.requests)) app.requests = [];
    if(!Array.isArray(app.agents)) app.agents = [];
    app.project = project.name;
    if(!loaded && !app.ledgerId) app.ledgerId = newLedgerId();
    /* Persist the empty ledger immediately; opening a project twice must keep
       the same ledgerId instead of minting a new one each time. */
    if((!loaded || !app.ledgerId) && core && core.storage && core.storage.saveState &&
       !(typeof bridgeAdoptingProject !== "undefined" && bridgeAdoptingProject)){
      /* Do not seed an empty ledger while the app payload is still adopting:
         the app's ledgerId/data must win the first write. */
      try{ core.storage.saveState(app); }catch(err){ /* the first save retries */ }
    }
    if(!app.language) app.language = "en";
    if(app.language === "tr" || app.language === "en"){
      state.lang = app.language;
      document.documentElement.lang = app.language;
      if(core && core.i18n && core.i18n.setLanguage) core.i18n.setLanguage(app.language);
    }
    activeRequestId = null;
    saveActivePointer(null);
    state.highlight = null;
    composeDirty = false;
    openRowMenuId = null;
    listDeleteId = null;
    exportWizard = null;
    exportCleanup = null;
    archiveTab = "list";
    archiveData = { records:[], drafts:[], history:[], loaded:false, loading:null };
    projectSwitchPending = null;
    projectCreatePending = null;
    projectFormOpen = false;
    projectDeleteConfirm = false;
    projectSettingsId = null;
    projectSettingsCounts = null;
    archiveSelectedProjectId = null;
    folderDirs.export = project.exportTarget || "";
    resetProjectSnapshot();
  }

  function openProjectById(projectId, opts){
    var project = findProjectRecord(projectId);
    if(!project) return false;
    var preserveSection = Boolean(opts && opts.preserveSection);
    var registry = readRegistry();
    if(registry){
      registry.activeId = projectId;
      writeRegistry(registry);
    }
    syncStorageScope();
    loadProjectIntoMemory(projectId, project);
    migrateLegacyScope(projectId).catch(function(){ /* best effort */ });
    closeProjectSettingsModal();
    if(role === "dock") refreshDockLabels();
    updateDockBadges();
    updateStats();
    updateMarquee();
    syncProjectGate(true);
    broadcastState();
    if(preserveSection){
      /* Bridge adoption only refreshes the current explicit section. It must
         never open a section or broadcast RL_OPEN_SECTION; dock labels and
         badges were already updated above. */
      if(role === "flyout" && state.section) renderFlyout(state.section);
    }else if(role === "flyout" && state.section === "project"){
      showSection("list");
    }else if(role === "flyout" && state.section){
      renderFlyout(state.section);
    }else if(role === "dock" && state.active){
      refreshSection(state.active);
    }
    loadArchive().catch(function(){ /* the archive is decorative until opened */ });
    /* Phase 2c: a local project switch re-handshakes with the app. No data is
       sent when the app is on a different project. */
    if(typeof bridgeAnnounceProject === "function") bridgeAnnounceProject();
    return true;
  }

  function refreshProjectViews(){
    if(projectSettingsId && document.getElementById("rl-project-settings")){
      renderProjectSettingsModal();
      return;
    }
    if(role === "flyout" && state.section){
      renderFlyout(state.section);
      return;
    }
    syncProjectGate(true);
    updateDockBadges();
    updateMarquee();
  }

  function requestProjectOpen(projectId){
    if(!projectId) return;
    if(projectId === activeProjectId){
      closeProjectSettingsModal();
      return;
    }
    var hadProject = !!activeProjectId;
    if(isProjectDirty()){
      projectSwitchPending = { targetId:projectId };
      refreshProjectViews();
      return;
    }
    openProjectById(projectId);
    if(!hadProject){
      sendAction("idle", { close:true });
      if(!hasHost) hideSection();
    }
  }

  function finishProjectSwitch(save){
    var pending = projectSwitchPending;
    if(!pending) return;
    projectSwitchPending = null;
    if(save){
      if(!saveNow()){
        projectSwitchPending = pending;
        refreshProjectViews();
        return;
      }
    }else{
      cancelScheduledSave();
    }
    openProjectById(pending.targetId);
  }

  function cancelProjectSwitch(){
    projectSwitchPending = null;
    refreshProjectViews();
  }

  function createProjectAndOpen(name){
    var value = normalizeProjectName(name);
    if(!value) return false;
    var hadProject = !!activeProjectId;
    var id = newProjectId();
    var stamp = nowISO();
    var registry = readRegistry() || emptyProjectRegistry();
    registry.projects.push({
      id: id,
      name: value,
      createdAt: stamp,
      updatedAt: stamp,
      exportTarget: "",
      archiveCollapsed: false
    });
    registry.activeId = id;
    if(!writeRegistry(registry)){
      toast(lx("projectRegistryFailed"), "error");
      return false;
    }
    var ledger = {
      version: 2,
      project: value,
      projectCreated: true,
      ledgerId: newLedgerId(),
      updatedAt: stamp,
      requests: [],
      agents: [],
      language: state.lang,
      exportBehavior: "default",
      lastExport: null
    };
    try{ localStorage.setItem(projectLedgerKey(id), JSON.stringify(ledger)); }catch(err){ /* the first save retries */ }
    projectCreatePending = null;
    projectFormOpen = false;
    openProjectById(id);
    if(!hadProject){
      sendAction("idle", { close:true });
      if(!hasHost) hideSection();
    }else if(role === "flyout" && state.section === "project"){
      showSection("list");
    }
    toast(lx("projectSaved"));
    return true;
  }

  function requestProjectCreate(name){
    var value = normalizeProjectName(name);
    if(!value){
      toast(lx("projectRequired"), "error");
      return false;
    }
    if(activeProjectId && isProjectDirty()){
      projectCreatePending = { name:value };
      refreshProjectViews();
      return false;
    }
    return createProjectAndOpen(value);
  }

  function finishProjectCreate(save){
    var pending = projectCreatePending;
    if(!pending) return;
    projectCreatePending = null;
    if(save){
      if(!saveNow()){
        projectCreatePending = pending;
        refreshProjectViews();
        return;
      }
    }else{
      cancelScheduledSave();
    }
    createProjectAndOpen(pending.name);
  }

  function cancelProjectCreate(){
    projectCreatePending = null;
    refreshProjectViews();
  }

  async function deleteProjectById(projectId){
    var registry = readRegistry();
    if(!registry) return false;
    if(registry.projects.length <= 1){
      toast(lx("projectLastGuard"), "error");
      return false;
    }
    var project = findProjectRecordIn(registry, projectId);
    if(!project) return false;
    var wasActive = projectId === activeProjectId;
    if(wasActive) cancelScheduledSave();
    var updated = removeProjectRecord(projectId);
    if(!updated){
      toast(lx("projectRegistryFailed"), "error");
      return false;
    }
    await deleteProjectScopedData(projectId);
    closeProjectSettingsModal();
    projectDeleteConfirm = false;
    archiveSelectedProjectId = null;
    if(wasActive){
      activeProjectId = null;
      if(updated.activeId){
        openProjectById(updated.activeId);
      }else{
        app = defaultApp();
        syncStorageScope();
        resetProjectSnapshot();
        folderDirs.export = "";
        syncProjectGate(true);
        updateDockBadges();
        updateMarquee();
        broadcastState();
        if(role === "flyout" && state.section) renderFlyout(state.section);
      }
    }else{
      refreshProjectViews();
    }
    toast(lx("projectDeleted"));
    return true;
  }

  /* ---------- one-time legacy scope stamping ---------- */

  function legacyScopeMigrated(){
    try{ return typeof localStorage !== "undefined" && localStorage.getItem(PROJECT_SCOPE_KEY) === "1"; }catch(err){ return false; }
  }

  function markLegacyScopeMigrated(){
    try{ if(typeof localStorage !== "undefined") localStorage.setItem(PROJECT_SCOPE_KEY, "1"); }catch(err){ /* quota */ }
  }

  function openScopeDB(){
    return new Promise(function(resolve){
      var info = core && core.constants && core.constants.DB;
      if(!info || typeof indexedDB === "undefined"){ resolve(null); return; }
      var request = null;
      try{ request = indexedDB.open(info.name, info.version); }catch(err){ resolve(null); return; }
      request.onupgradeneeded = function(){
        var db = request.result;
        Object.keys(info.stores || {}).forEach(function(key){
          var store = info.stores[key];
          if(!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath:"id" });
        });
      };
      request.onsuccess = function(){ resolve(request.result); };
      request.onerror = function(){ resolve(null); };
      request.onblocked = function(){ resolve(null); };
    });
  }

  function stampStoreProject(db, storeName, projectId){
    return new Promise(function(resolve){
      if(!db || !projectId){ resolve(0); return; }
      var stamped = 0;
      var tx = null;
      try{ tx = db.transaction(storeName, "readwrite"); }catch(err){ resolve(0); return; }
      var store = tx.objectStore(storeName);
      var request = store.openCursor();
      request.onsuccess = function(){
        var cursor = request.result;
        if(!cursor) return;
        var record = cursor.value;
        if(record && !record.projectId){
          record.projectId = projectId;
          cursor.update(record);
          stamped++;
        }
        cursor.continue();
      };
      tx.oncomplete = function(){ resolve(stamped); };
      tx.onerror = function(){ resolve(stamped); };
      tx.onabort = function(){ resolve(stamped); };
    });
  }

  async function migrateLegacyScope(projectId){
    if(!projectId || legacyScopeMigrated()) return 0;
    var info = core && core.constants && core.constants.DB;
    if(!info || typeof indexedDB === "undefined") return 0;
    var db = await openScopeDB();
    if(!db) return 0;
    var total = 0;
    var stores = ["images", "files", "history", "records", "drafts"];
    for(var i = 0; i < stores.length; i++){
      var name = info.stores && info.stores[stores[i]] ? info.stores[stores[i]] : stores[i];
      total += await stampStoreProject(db, name, projectId);
    }
    try{ db.close(); }catch(err){ /* ignore */ }
    markLegacyScopeMigrated();
    return total;
  }
