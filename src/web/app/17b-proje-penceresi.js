  /* ============================================================
     Proje ayarları penceresi ve arşiv daraltma
     ============================================================ */

  function projectSnapshotCounts(projectId){
    return Promise.all([
      idbCountForProject(RECORDS_STORE, projectId),
      idbCountForProject(DRAFTS_STORE, projectId)
    ]).then(function(values){
      return { records: values[0], drafts: values[1] };
    });
  }

  function renderProjectSettingsSummary(project, counts){
    const summary = $("#projectSettingsSummary");
    if(!summary || !project) return;
    const requestCount = projectRequestCount(project.id);
    const recordsText = counts ? countLabel(counts.records, "kayıt", "kayıt", "record", "records") : "…";
    const draftsText = counts ? countLabel(counts.drafts, "taslak", "taslak", "draft", "drafts") : "…";
    summary.innerHTML = "";
    historyCell(summary, "Oluşturma", formatDateTime(project.createdAt));
    historyCell(summary, "Güncelleme", formatDateTime(project.updatedAt));
    historyCell(summary, "İstek", countLabel(requestCount, "istek", "istek", "request", "requests"));
    historyCell(summary, "Kayıt", recordsText);
    historyCell(summary, "Taslak", draftsText);
    historyCell(summary, "Dışa aktarım hedefi", project.exportTarget || translateString("Seçilmedi"));
  }

  function renderProjectSettingsTarget(project){
    const field = $("#projectSettingsTarget");
    const clear = $("#projectSettingsClearTarget");
    if(field){
      field.value = project && project.exportTarget ? project.exportTarget : translateString("Seçilmedi");
      field.title = field.value;
    }
    if(clear) clear.disabled = !(project && project.exportTarget);
  }

  function updateProjectSettingsActions(project){
    const open = $("#projectSettingsOpenBtn");
    const remove = $("#projectSettingsDeleteBtn");
    const registry = readRegistry();
    const total = registry ? registry.projects.length : 0;
    if(open){
      const isActive = Boolean(project && project.id === activeProjectId);
      open.textContent = translateString(isActive ? "Şu an açık" : "Projeyi aç");
      open.disabled = isActive;
    }
    if(remove){
      const blocked = total <= 1;
      remove.disabled = blocked;
      remove.title = blocked ? translateString("Son proje silinemez.") : translateString("Projeyi sil");
      remove.setAttribute("aria-label", translateString("Projeyi sil"));
    }
  }

  function openProjectSettingsModal(projectId){
    const project = findProjectRecord(projectId);
    if(!project){
      showToast("Proje ayarları açılamadı.", "error");
      return;
    }
    projectSettingsId = project.id;
    archiveSelectedProjectId = project.id;
    const input = $("#projectSettingsName");
    if(input){
      input.value = project.name;
      input.classList.remove("is-invalid");
    }
    renderProjectSettingsTarget(project);
    updateProjectSettingsActions(project);
    renderProjectSettingsSummary(project, null);
    renderArchiveProjects();
    closeHistoryPanel();
    openModal($("#projectSettingsModal"));
    projectSnapshotCounts(project.id).then(function(counts){
      if(projectSettingsId !== project.id) return;
      const current = findProjectRecord(project.id);
      if(!current) return;
      renderProjectSettingsSummary(current, counts);
    }).catch(function(){ /* counts are decorative */ });
  }

  function saveProjectSettingsName(){
    const projectId = projectSettingsId;
    if(!projectId) return false;
    const input = $("#projectSettingsName");
    const value = normalizeProjectName(input ? input.value : "");
    if(!value){
      if(input){
        input.classList.add("is-invalid");
        try{ input.focus(); }catch(err){}
      }
      showToast("Proje adı zorunludur.", "error");
      return false;
    }
    if(input) input.classList.remove("is-invalid");
    const record = renameProjectRecord(projectId, value);
    if(!record){
      showToast("Proje listesi güncellenemedi.", "error");
      return false;
    }
    if(projectId === activeProjectId){
      state.project = record.name;
      if(state.projectCreated !== true) state.projectCreated = true;
      saveNow();
      projectSnapshot = serializedLedger();
      updateProjectLabels();
      renderList();
    }
    archiveSelectedProjectId = projectId;
    renderProjectSettingsSummary(record, null);
    renderProjectSettingsTarget(record);
    updateProjectSettingsActions(record);
    renderArchiveProjects();
    showToast("Proje adı güncellendi.");
    projectSnapshotCounts(projectId).then(function(counts){
      if(projectSettingsId !== projectId) return;
      const current = findProjectRecord(projectId);
      if(current) renderProjectSettingsSummary(current, counts);
    }).catch(function(){});
    return true;
  }

  async function chooseProjectSettingsTarget(){
    const projectId = projectSettingsId;
    if(!projectId) return;
    const picked = await chooseProjectTargetFolder(projectId);
    if(!picked) return;
    const record = findProjectRecord(projectId);
    if(record){
      renderProjectSettingsTarget(record);
      renderProjectSettingsSummary(record, null);
      renderArchiveProjects();
      projectSnapshotCounts(projectId).then(function(counts){
        if(projectSettingsId !== projectId) return;
        const current = findProjectRecord(projectId);
        if(current) renderProjectSettingsSummary(current, counts);
      }).catch(function(){});
    }
  }

  async function clearProjectSettingsTarget(){
    const projectId = projectSettingsId;
    if(!projectId) return;
    await clearProjectExportTarget(projectId);
    const record = findProjectRecord(projectId);
    if(record){
      renderProjectSettingsTarget(record);
      renderProjectSettingsSummary(record, null);
      renderArchiveProjects();
    }
  }

  function openProjectFromSettings(){
    const projectId = projectSettingsId;
    if(!projectId) return;
    closeModal($("#projectSettingsModal"));
    closeHistoryPanel();
    if(projectId === activeProjectId) return;
    requestProjectOpen(projectId);
  }

  async function deleteProjectData(projectId){
    if(!projectId) return;
    try{ localStorage.removeItem(projectLedgerKey(projectId)); }catch(err){}
    try{ await idbSettingDelete("targetFolder:" + projectId); }catch(err){}
    await idbDeleteProjectMedia(projectId).catch(function(){});
    try{ await idbCollectionClear(RECORDS_STORE, projectId); }catch(err){}
    try{ await idbCollectionClear(DRAFTS_STORE, projectId); }catch(err){}
    try{ await idbHistoryClear(projectId); }catch(err){}
  }

  /* Server mode: the disk folder is the source of truth, so the folder must be
     removed (optionally archived into deleted-projects/) before the registry
     entry. A failed server delete aborts: dropping only the registry entry
     would bring the project back on the next bootstrap. */
  async function deleteProjectEverywhere(projectId, keepBackup){
    if(typeof serverDiskEnabled === "function" && serverDiskEnabled()){
      const result = await serverDeleteProjectOnDisk(projectId, keepBackup === true);
      if(!result || result.ok !== true){
        showToast(translateString("Proje diskten silinemedi; hiçbir şey değiştirilmedi."), "error");
        return false;
      }
    }
    return true;
  }

  function deleteProjectFromSettings(){
    const projectId = projectSettingsId;
    if(!projectId) return;
    const project = findProjectRecord(projectId);
    if(!project) return;
    const registry = readRegistry();
    if(!registry){ showToast("Proje listesi güncellenemedi.", "error"); return; }
    if(registry.projects.length <= 1){
      showToast("Son proje silinemez.", "error");
      return;
    }
    const wasActive = projectId === activeProjectId;
    const runDelete = async function(keepBackup){
      if(wasActive) cancelScheduledSave();
      if(!(await deleteProjectEverywhere(projectId, keepBackup))) return;
      const updated = removeProjectRecord(projectId);
      if(!updated){
        showToast("Proje listesi güncellenemedi.", "error");
        return;
      }
      await deleteProjectData(projectId);
      projectSettingsId = null;
      archiveSelectedProjectId = null;
      closeModal($("#projectSettingsModal"));
      if(wasActive){
        activeProjectId = null;
        projectSnapshot = null;
        targetFolderHandle = null;
        targetFolderNeedsPermission = false;
        records = [];
        drafts = [];
        historyItems = [];
        clearImageURLs();
        if(updated.activeId) openProjectById(updated.activeId);
        else {
          projectScreen = "picker";
          renderProjectGate();
        }
      }else{
        renderArchiveProjects();
        renderHistoryTree();
        renderProjectGate();
      }
      showToast(translateString(keepBackup ? "Proje silindi ve yedeği saklandı." : "Proje silindi."));
    };
    openConfirm({
      title: "Proje silinsin mi?",
      message: project.name + ": bu projedeki tüm talepler, görseller, kayıtlar, taslaklar ve dışa aktarılanlar silinecek. Bu işlem geri alınamaz. Silinen projeler bölümünden geri yüklenebilmesi için bir yedek saklamak ister misin?",
      eyebrow: "Sil",
      confirmLabel: "Yedekle ve sil",
      altLabel: "Yedeksiz sil",
      cancelLabel: "Vazgeç",
      danger: true,
      onConfirm: function(){ return runDelete(true); },
      onAlt: function(){ return runDelete(false); }
    });
  }

  /* ---------- archive collapse (desktop) ---------- */

  function applyArchiveCollapsed(collapsed, persist){
    archiveCollapsed = Boolean(collapsed);
    const app = $(".app");
    const desktop = window.innerWidth > 1180;
    if(app) app.classList.toggle("is-archive-collapsed", archiveCollapsed && Boolean(activeProjectId) && desktop);
    const panel = $("#historyPanel");
    if(panel){
      if(desktop) panel.setAttribute("aria-hidden", archiveCollapsed ? "true" : "false");
      else panel.removeAttribute("aria-hidden");
    }
    const button = $("#historyBtn");
    if(button){
      const label = translateString(archiveCollapsed && desktop ? "Arşivi göster" : "Arşivi aç");
      button.title = label;
      button.setAttribute("aria-label", label);
    }
    if(persist && activeProjectId) setProjectArchiveCollapsed(activeProjectId, archiveCollapsed);
  }

  function toggleArchiveCollapsed(){
    if(window.innerWidth <= 1180){
      closeHistoryPanel();
      return;
    }
    applyArchiveCollapsed(!archiveCollapsed, true);
  }

  /* Resizing between the overlay and desktop layouts must not leave a hidden
     archive with aria-hidden on the mobile overlay. */
  function syncArchiveResponsiveState(){
    const app = $(".app");
    if(window.innerWidth <= 1180){
      if(app) app.classList.remove("is-archive-collapsed");
      const panel = $("#historyPanel");
      if(panel) panel.removeAttribute("aria-hidden");
      const button = $("#historyBtn");
      if(button){
        const label = translateString("Arşivi aç");
        button.title = label;
        button.setAttribute("aria-label", label);
      }
      return;
    }
    applyArchiveCollapsed(archiveCollapsed, false);
  }

