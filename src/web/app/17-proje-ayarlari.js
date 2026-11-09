  /* ============================================================
     Proje ayarları ve çalışma alanı ekranı
     ============================================================ */

  /* The project name mirrors the extension gate: trimmed, max 60 chars and
     never empty. It feeds export, backup and record names. */
  function normalizeProjectName(value){
    return String(value == null ? "" : value).trim().slice(0, 60);
  }
  function projectGateActive(){
    return projectScreen !== "app";
  }
  function renderProjectPicker(){
    const list = $("#projectPickerList");
    if(!list) return;
    list.innerHTML = "";
    const registry = readRegistry();
    const projects = registry ? registry.projects.slice() : [];
    projects.sort(function(a, b){
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    });
    const empty = $("#projectPickerEmpty");
    if(empty) empty.hidden = projects.length > 0;
    list.hidden = projects.length === 0;
    projects.forEach(function(project){
      const button = document.createElement("button");
      button.type = "button";
      button.className = "backupopt";
      button.dataset.projectId = project.id;
      if(registry && project.id === registry.activeId) button.setAttribute("aria-current", "true");
      const icon = document.createElement("span");
      icon.className = "backupopt__icon";
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M8 12h8M8 15h5"/></svg>';
      const body = document.createElement("span");
      const name = document.createElement("b");
      name.textContent = project.name;
      const meta = document.createElement("small");
      const parts = [];
      const date = formatProjectDate(project.updatedAt);
      if(date) parts.push(date);
      parts.push(countLabel(projectRequestCount(project.id), "istek", "istek", "request", "requests"));
      meta.textContent = parts.join(" · ");
      body.appendChild(name);
      body.appendChild(meta);
      button.appendChild(icon);
      button.appendChild(body);
      list.appendChild(button);
    });
  }
  function renderProjectGate(){
    const active = projectGateActive();
    const picker = $("#projectPicker");
    const create = $("#projectGate");
    const main = $("#main");
    if(picker) picker.hidden = projectScreen !== "picker";
    if(create) create.hidden = projectScreen !== "create";
    if(main) main.classList.toggle("is-project-gate", active);
    const controls = $("#topbarControls");
    if(controls) controls.hidden = active;
    const exportBtn = $("#exportBtn");
    if(exportBtn) exportBtn.hidden = active;
    const historyPanel = $("#historyPanel");
    if(historyPanel) historyPanel.hidden = active;
    const historyBtn = $("#historyBtn");
    if(historyBtn) historyBtn.hidden = active;
    $$('[data-rail="backup"]').forEach(function(button){ button.hidden = active; });
    if(active) closeHistoryPanel();
    if(active){
      const app = $(".app");
      if(app) app.classList.remove("is-archive-collapsed");
      const panel = $("#historyPanel");
      if(panel && window.innerWidth > 1180) panel.setAttribute("aria-hidden", "false");
    }
    if(projectScreen === "picker") renderProjectPicker();
    const back = $("#projectCreateBackBtn");
    if(back){
      const registry = readRegistry();
      back.hidden = !(registry && registry.projects.length);
    }
    if(!active) updateProjectLabels();
  }
  function showProjectPickerScreen(){
    projectScreen = "picker";
    renderProjectGate();
  }
  function showProjectCreateScreen(){
    projectScreen = "create";
    const input = $("#projectCreateInput");
    if(input){
      input.value = "";
      input.classList.remove("is-invalid");
    }
    renderProjectGate();
    if(input){
      try{ input.focus(); }catch(err){ /* ignore */ }
    }
  }
  function isProjectDirty(){
    if(!activeProjectId || projectSnapshot == null) return false;
    return serializedLedger() !== projectSnapshot;
  }
  function resetProjectSessionState(){
    filter = { q:"", type:"all", status:"all" };
    activeRowId = null;
    lastExpandedId = null;
    lastJumpId = null;
    pendingImageRowId = null;
    pendingAttachmentRowId = null;
    currentSnapshot = null;
    currentSnapshotKind = null;
    barDismissed = false;
    stateDirtySinceExport = false;
    planningMode = null;
    planningAgents = [];
    planningTest = null;
    planningRuntime = null;
    planningTransfers = [];
    planningQuestion = null;
    processingRows.clear();
    closeAllCSelects();
    clearImageURLs();
    resetFilters(false);
  }
  function confirmProjectSwitch(action){
    openConfirm({
      eyebrow: "Proje",
      title: "Kaydedilmemiş değişiklikler",
      message: "Bu projede açıldığından beri değişiklik var. Başka bir projeye geçmeden önce kaydetmek ister misin?",
      confirmLabel: "Kaydet ve geç",
      altLabel: "Kaydetmeden geç",
      cancelLabel: "Vazgeç",
      onConfirm: async function(){
        cancelScheduledSave();
        saveNow();
        await action();
      },
      onAlt: async function(){
        cancelScheduledSave();
        await action();
      }
    });
  }
  function requestProjectOpen(projectId){
    if(!projectId) return;
    if(activeProjectId === projectId){
      projectScreen = "app";
      renderProjectGate();
      return;
    }
    if(isProjectDirty()){
      confirmProjectSwitch(function(){ openProjectById(projectId); });
      return;
    }
    openProjectById(projectId);
  }
  function openProjectById(projectId){
    const project = findProjectRecord(projectId);
    if(!project){
      showToast("Proje bulunamadı.", "error");
      return false;
    }
    cancelScheduledSave();
    activeProjectId = project.id;
    targetFolderHandle = null;
    targetFolderNeedsPermission = false;
    loadStateForProject(project.id, project.name);
    if(!state.ledgerId) state.ledgerId = newLedgerId();
    state.project = project.name;
    state.projectCreated = true;
    const registry = readRegistry();
    if(registry){
      registry.activeId = project.id;
      writeRegistry(registry);
    }
    projectSnapshot = serializedLedger();
    projectScreen = "app";
    archiveSelectedProjectId = project.id;
    archiveCollapsed = project.archiveCollapsed === true;
    resetProjectSessionState();
    renderProjectGate();
    applyArchiveCollapsed(archiveCollapsed, false);
    applyLanguage(state.language);
    updateTargetFolderUI();
    restoreTargetFolder().then(function(){
      refreshGlobal();
      renderList();
    }).catch(function(){ /* ignore */ });
    loadProjectArchives();
    renderList();
    refreshGlobal();
    if(!appBridgeStarted) initAppBridge();
    else bridgeProjectChanged();
    setSaveStatus("saved");
    return true;
  }
  function performCreateProject(name){
    cancelScheduledSave();
    const stamp = nowISO();
    const project = {
      id: newProjectId(),
      name: name,
      createdAt: stamp,
      updatedAt: stamp,
      exportTarget: "",
      archiveCollapsed: false
    };
    const registry = readRegistry() || emptyProjectRegistry();
    const isFirstProject = registry.projects.length === 0;
    registry.projects.push(project);
    registry.activeId = project.id;
    if(!writeRegistry(registry)){
      showToast("Proje oluşturulamadı. Tarayıcı depolamasını kontrol et.", "error");
      return false;
    }
    const payload = {
      version: 2,
      project: project.name,
      projectCreated: true,
      ledgerId: newLedgerId(),
      updatedAt: stamp,
      requests: [],
      agents: [],
      language: state.language === "tr" ? "tr" : "en",
      exportBehavior: "default",
      lastExport: null
    };
    try{
      localStorage.setItem(projectLedgerKey(project.id), JSON.stringify(payload));
    }catch(err){
      console.warn("Proje defteri yazılamadı", err);
    }
    activeProjectId = project.id;
    targetFolderHandle = null;
    targetFolderNeedsPermission = false;
    loadStateForProject(project.id, project.name);
    projectSnapshot = serializedLedger();
    projectScreen = "app";
    archiveSelectedProjectId = project.id;
    archiveCollapsed = false;
    resetProjectSessionState();
    const input = $("#projectCreateInput");
    if(input) input.value = "";
    renderProjectGate();
    applyArchiveCollapsed(false, false);
    applyLanguage(state.language);
    updateTargetFolderUI();
    if(isFirstProject) migrateLegacyScope(project.id).catch(function(){});
    loadProjectArchives();
    renderList();
    refreshGlobal();
    if(!appBridgeStarted) initAppBridge();
    else bridgeProjectChanged();
    setSaveStatus("saved");
    showToast("Proje oluşturuldu.");
    const add = $("#addBtn");
    if(add){
      try{ add.focus(); }catch(err){ /* ignore */ }
    }
    return true;
  }
  function createProjectFromGate(){
    const input = $("#projectCreateInput");
    const value = normalizeProjectName(input ? input.value : "");
    if(!value){
      if(input){
        input.classList.add("is-invalid");
        try{ input.focus(); }catch(err){ /* ignore */ }
      }
      showToast("Proje adı zorunludur.", "error");
      return false;
    }
    if(input) input.classList.remove("is-invalid");
    if(activeProjectId && isProjectDirty()){
      confirmProjectSwitch(function(){ performCreateProject(value); });
      return true;
    }
    return performCreateProject(value);
  }
  function readProjectNameSetting(){
    const input = $("#settingsProjectName");
    return normalizeProjectName(input ? input.value : state.project);
  }
  function applyProjectNameSetting(){
    if(!activeProjectId) return true;
    const input = $("#settingsProjectName");
    const value = readProjectNameSetting();
    if(!value){
      if(input){
        input.classList.add("is-invalid");
        try{ input.focus(); }catch(err){ /* ignore */ }
      }
      showToast("Proje adı zorunludur.", "error");
      return false;
    }
    if(input) input.classList.remove("is-invalid");
    state.project = value;
    if(state.projectCreated !== true) state.projectCreated = true;
    return true;
  }
