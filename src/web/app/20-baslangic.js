  /* ============================================================
     Başlangıç
     ============================================================ */
  async function init(){
    initProjectRegistry();
    if(!state.ledgerId) state.ledgerId = newLedgerId();
    try{
      idb = await openDB();
    }catch(err){
      console.warn("IndexedDB açılamadı", err);
      idbFailed = true;
    }
    /* One-time Phase 1 → Phase 2 media/snapshot scope migration. */
    const registry = readRegistry();
    const scopeTarget = legacyScopeTarget(registry);
    if(scopeTarget){
      try{ await migrateLegacyScope(scopeTarget); }catch(err){ console.warn("Eski medya kapsamı taşınamadı", err); }
    }
    bindEvents();
    installI18nObserver();
    syncTheme();
    updateProjectLabels();
    updateToday();
    renderPlanningAgents();
    updateTargetFolderUI();
    await loadHistory();
    await loadSnapshots();
    stateDirtySinceExport = false;
    renderHistoryTree();
    renderList();
    refreshGlobal();
    renderProjectGate();
    applyArchiveCollapsed(false, false);
    syncArchiveResponsiveState();
    applyLanguage(state.language);
    initOnboarding();
    const versionEl = $("#aboutVersion");
    if(versionEl) versionEl.textContent = APP_VERSION;
    setSaveStatus("saved");
    if(idbFailed){
      showToast("Görseller ve dosyalar için tarayıcı depolaması kullanılamıyor. Metinler yine de kaydedilir.", "error");
    }
    initPickerBridge();
  }

  init();
})();
