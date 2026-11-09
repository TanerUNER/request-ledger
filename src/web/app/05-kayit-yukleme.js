  /* ============================================================
     Kayıt / yükleme
     ============================================================ */
  function ledgerPayload(){
    return {
      version: 2,
      project: state.project,
      projectCreated: state.projectCreated === true,
      ledgerId: state.ledgerId,
      requests: state.requests.map(function(req){ return serializeRequest(req); }),
      agents: state.agents.map(function(agent){ return { id:agent.id, name:agent.name, role:agent.role, mdPath:agent.mdPath }; }),
      language: state.language,
      exportBehavior: state.exportBehavior,
      lastExport: state.lastExport
    };
  }
  /* Dirty tracking compares ledger content, not the timestamp written by an
     automatic save. `updatedAt` is therefore excluded here. */
  function serializedLedger(){
    return JSON.stringify(ledgerPayload());
  }
  function resetLedgerState(projectName, fallbackLanguage){
    state = {
      version: 1,
      project: projectName || "",
      projectCreated: true,
      ledgerId: newLedgerId(),
      requests: [],
      agents: [],
      language: fallbackLanguage === "tr" ? "tr" : "en",
      exportBehavior: "default",
      lastExport: null,
      updatedAt: null
    };
  }
  /* Write the current ledger payload for a project. Used when a project was
     created before its empty ledger existed, so a reload never mints a new
     ledgerId for the same project. */
  function persistProjectLedger(projectId){
    if(!projectId) return;
    try{
      const payload = ledgerPayload();
      payload.ledgerId = normalizeLedgerId(state.ledgerId) || payload.ledgerId;
      payload.updatedAt = nowISO();
      localStorage.setItem(projectLedgerKey(projectId), JSON.stringify(payload));
      state.updatedAt = payload.updatedAt;
      setProjectLedgerId(projectId, payload.ledgerId);
    }catch(err){
      console.warn("Proje defteri yazılamadı", err);
    }
  }
  function loadStateForProject(projectId, projectName){
    const fallbackLanguage = state.language === "tr" ? "tr" : "en";
    resetLedgerState(projectName, fallbackLanguage);
    state.ledgerId = resolveProjectLedgerId(projectId);
    let raw = null;
    try{ raw = localStorage.getItem(projectLedgerKey(projectId)); }catch(err){ raw = null; }
    if(!raw){
      persistProjectLedger(projectId);
      return;
    }
    try{
      const parsed = JSON.parse(raw);
      if(!parsed || !Array.isArray(parsed.requests)) return;
      /* The registry owns the project name and the one ledger id. The ledger
         may still carry an older name or a stale id until the next save. */
      state.ledgerId = resolveProjectLedgerId(projectId);
      state.requests = parsed.requests.map(function(req, index){ return normalizeRequest(req, index); });
      state.agents = Array.isArray(parsed.agents) ? parsed.agents.map(normalizeAgent) : [];
      state.language = parsed.language === "tr" ? "tr" : "en";
      state.exportBehavior = ["last","instant"].indexOf(parsed.exportBehavior) >= 0 ? parsed.exportBehavior : "default";
      state.lastExport = parsed.lastExport && typeof parsed.lastExport === "object" ? parsed.lastExport : null;
      let hasOpen = false;
      state.requests.forEach(function(req){
        if(!req.collapsed){
          if(hasOpen) req.collapsed = true;
          else hasOpen = true;
        }
      });
      state.updatedAt = parsed.updatedAt || null;
    }catch(err){
      console.warn("Kayıt okunamadı", err);
      showToast("Önceki kayıtlar okunamadı. Yeni bir defterle devam ediliyor.", "error");
    }
  }
  function saveNow(){
    if(!activeProjectId){
      setSaveStatus("saved");
      return;
    }
    /* A stopped server is a blocked app: no ledger/bridge writes until the
       page reconnects. */
    if(typeof serverBlocked !== "undefined" && serverBlocked) return;
    try{
      const payload = ledgerPayload();
      payload.updatedAt = nowISO();
      localStorage.setItem(projectLedgerKey(activeProjectId), JSON.stringify(payload));
      state.updatedAt = payload.updatedAt;
      syncActiveProjectRecord(payload.updatedAt);
      setSaveStatus("saved");
      bridgeNotifyChange();
      if(typeof scheduleServerDiskSave === "function") scheduleServerDiskSave();
    }catch(err){
      console.error("Kayıt yapılamadı", err);
      setSaveStatus("error");
      showToast("Kayıt yapılamadı. Tarayıcı depolamasını kontrol et veya yedek al.", "error");
    }
  }
  function cancelScheduledSave(){
    if(saveTimer){
      clearTimeout(saveTimer);
      saveTimer = null;
    }
  }
  function scheduleSave(){
    if(!activeProjectId) return;
    if(typeof serverBlocked !== "undefined" && serverBlocked) return;
    stateDirtySinceExport = true;
    setSaveStatus("saving");
    clearTimeout(saveTimer);

    saveTimer = setTimeout(function(){
      saveTimer = null;

      saveNow();
    }, 380);
  }
