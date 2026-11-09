  /* ============================================================
     Başlangıç
     ============================================================ */
  async function init(){
    /* Active companion presence marker for the extension content script. */
    try{ document.documentElement.setAttribute("data-request-ledger-app", "1"); }catch(err){ /* ignore */ }
    try{
      idb = await openDB();
    }catch(err){
      console.warn("IndexedDB açılamadı", err);
      idbFailed = true;
    }
    /* In server mode the disk is the source of truth: hydrate the browser
       cache (registry, ledgers, archive) before opening the last project. */
    try{ await serverDiskBootstrap(); }catch(err){ console.warn("Sunucu verisi yüklenemedi", err); }
    initProjectRegistry();
    if(!state.ledgerId) state.ledgerId = newLedgerId();
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
    /* Restore the last explicit project, not just the gate. This keeps the
       app, the stored activeId and the open ledger in one origin after F5. */
    if(registry && registry.activeId) openProjectById(registry.activeId);
    else renderProjectGate();
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
