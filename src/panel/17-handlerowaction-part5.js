  function handleRowAction(action, element){
    var host = element && element.closest ? element.closest("[data-request-id]") : null;
    var id = host ? host.getAttribute("data-request-id") : null;
    if(!action || !id) return;
    if(action === "duplicate"){ duplicateRequestRow(id); return; }
    if(action === "up"){ moveRequestRow(id, -1); return; }
    if(action === "down"){ moveRequestRow(id, 1); return; }
    if(action === "delete"){ openDeleteConfirmRow(id); return; }
    if(action === "delete-confirm"){ confirmDeleteRow(id); return; }
    if(action === "delete-cancel"){ cancelDeleteRow(); return; }
  }

  function handleRecordAction(action, element){
    var host = element && element.closest ? element.closest("[data-record-id]") : null;
    var id = host ? host.getAttribute("data-record-id") : null;
    var kind = host ? (host.getAttribute("data-record-kind") || archiveTab) : archiveTab;
    if(!action || !id) return;

    if(action === "open"){ openArchiveRecord(kind, id); return; }
    if(action === "rename"){
      if(kind !== "records") return;
      archiveRenameId = archiveRenameId === id ? null : id;
      archiveDelete = null;
      refreshArchiveViews();
      applyArchiveTab();
      return;
    }
    if(action === "delete"){
      archiveDelete = { kind:kind, id:id };
      archiveRenameId = null;
      refreshArchiveViews();
      return;
    }
  }

  function handleArchiveAction(action){
    if(action === "clear-records" || action === "clear-drafts" || action === "clear-history"){
      archiveClear = action.slice(6);
      archiveDelete = null;
      archiveRenameId = null;
      refreshArchiveViews();
      return;
    }
    if(action === "clear-confirm"){ clearArchiveCollection(); return; }
    if(action === "clear-cancel"){
      archiveClear = null;
      refreshArchiveViews();
      return;
    }
    if(action === "delete-confirm"){ deleteArchiveItem(); return; }
    if(action === "delete-cancel"){
      archiveDelete = null;
      refreshArchiveViews();
      return;
    }
    if(action === "rename-save"){ saveArchiveRename(); return; }
    if(action === "rename-cancel"){
      archiveRenameId = null;
      refreshArchiveViews();
      return;
    }
    if(action === "dup-overwrite"){ duplicateOverwrite(); return; }
    if(action === "dup-new"){ duplicateCreateNew(); return; }
    if(action === "dup-cancel"){ cancelDuplicatePrompt(); return; }
    if(action === "detail-back"){
      archiveDetail = null;
      refreshArchiveViews();
      return;
    }
  }

  function handleFlyoutAction(actionEl){
    var action = actionEl.getAttribute("data-act");

    if(action === "create"){ createRequest(); return; }
    if(action === "save-project"){ saveProjectName(); return; }
    if(action === "close-section"){ requestClose(); return; }
    if(action === "save-section"){ saveSection(); return; }
    if(action === "unlock"){ unlockRequest(); return; }
    if(action === "save-draft"){ saveDraftAndClose(); return; }
    if(action === "delete"){ deleteRequestAndClose(); return; }
    if(action === "cancel-confirm"){
      cancelConfirm = false;
      renderFlyout(state.section || "desc");
      return;
    }
    if(action === "add-image"){
      var imgInput = document.getElementById("rl-img-input");
      if(imgInput && !imgInput.disabled) imgInput.click();
      return;
    }
    if(action === "capture-open"){ panelReturnFocusId = "rl-capture-open"; startCaptureFromActiveTab(); return; }
    if(action === "pick-element"){ panelReturnFocusId = "rl-pick-element"; startElementPickFromActiveTab(false); return; }
    if(action === "pick-capture"){ panelReturnFocusId = "rl-pick-capture"; startElementPickFromActiveTab(true); return; }
    if(action === "console-fetch"){
      fetchConsoleErrors(actionEl);
      return;
    }
    if(action === "remove-image"){
      removeImage(actionEl.getAttribute("data-image-ref"));
      return;
    }
    if(action === "add-file"){
      var fileInput = document.getElementById("rl-file-input");
      if(fileInput && !fileInput.disabled) fileInput.click();
      return;
    }
    if(action === "remove-file"){
      removeFile(actionEl.getAttribute("data-att-ref"));
      return;
    }
    if(action === "ready"){ handleReady(); return; }
    if(action === "goto-new"){
      sendAction("goto", { section:"new" });
      return;
    }
    if(action === "toggle-tp"){
      tpOpen = !tpOpen;
      var pop = document.getElementById("rl-tp-pop");
      if(pop) pop.hidden = !tpOpen;
      actionEl.setAttribute("aria-expanded", tpOpen ? "true" : "false");
      return;
    }
    if(action === "row-menu"){
      var rowHost = actionEl.closest ? actionEl.closest("[data-request-id]") : null;
      toggleRowMenu(rowHost ? rowHost.getAttribute("data-request-id") : null);
      return;
    }
    if(action === "open-request"){
      var openHost = actionEl.closest ? actionEl.closest("[data-request-id]") : null;
      if(openHost) selectRequest(openHost.getAttribute("data-request-id"));
      return;
    }
    if(action === "jump-incomplete"){ jumpToIncomplete(); return; }
    if(action === "clear-filters"){ clearListFilters(); return; }
    if(action === "save-record"){ saveRecordSnapshot(); return; }
    if(action === "exp-open"){ requestExport(); return; }
    if(action === "exp-cancel"){ closeExportWizard(); return; }
    if(action === "exp-back"){
      if(exportWizard && exportWizard.step === 2){
        exportWizard.step = 1;
        exportWizard.slide = "prev";
        rerenderExportWizard();
      }
      return;
    }
    if(action === "exp-next"){ advanceExportStep(); return; }
    if(action === "open-warning"){
      var warnId = actionEl.getAttribute("data-export-warning");
      if(warnId){
        exportWizard = null;
        exportCleanup = null;
        selectRequest(warnId);
      }
      return;
    }
    if(action === "exp-run"){ runExport(); return; }
    if(action === "exp-settings"){
      exportWizard = null;
      exportCleanup = null;
      sendAction("goto", { section:"settings" });
      return;
    }
    if(action === "exp-clear-requests"){ clearExportedRequests(); return; }
    if(action === "exp-keep-requests"){
      exportCleanup = null;
      renderFlyout("list");
      return;
    }
    if(action === "backup-zip"){ runBackupDownload("zip"); return; }
    if(action === "backup-restore"){
      var backupInput = document.getElementById("rl-backup-input");
      if(backupInput && !backupInput.disabled) backupInput.click();
      return;
    }
    if(action === "backup-clear"){
      if(backupBusy) return;
      backupPending = { kind:"clear" };
      renderBackupConfirm();
      setBackupStatus(lx("confirmPending"), "pending");
      return;
    }
    if(action === "backup-confirm"){ confirmBackup(); return; }
    if(action === "backup-cancel"){ cancelBackup(); return; }
    if(action === "settings-reset"){ resetSystemSettings(); return; }
    if(action === "bridge-use-app"){ bridgeChoiceApp(); return; }
    if(action === "bridge-use-extension"){ bridgeChoiceExtension(); return; }
    if(action === "agent-add"){ addAgent(); return; }
    if(action === "agent-remove"){
      removeAgent(actionEl.getAttribute("data-agent-remove"));
      return;
    }
  }

  function markChipGroup(btn, groupSelector){
    var wrap = btn.parentNode;
    if(!wrap) return;
    var nodes = wrap.querySelectorAll(groupSelector === ".tygrid" ? "[data-type]" : "[data-priority]");
    for(var i = 0; i < nodes.length; i++){
      nodes[i].classList.remove("on");
      nodes[i].setAttribute("aria-pressed", "false");
    }
    btn.classList.add("on");
    btn.setAttribute("aria-pressed", "true");
  }

  /* paste images while the description or combined detail section is open */
  function onPaste(event){
    if(role !== "flyout" || (state.section !== "desc" && state.section !== "detail")) return;
    var req = activeRequest();
    if(!req || isLocked(req)) return;
    var data = event.clipboardData;
    if(!data || !data.items) return;
    var files = [];
    for(var i = 0; i < data.items.length; i++){
      var item = data.items[i];
      if(item && item.kind === "file" && String(item.type || "").indexOf("image/") === 0){
        var file = item.getAsFile ? item.getAsFile() : null;
        if(file) files.push(file);
      }
    }
    if(files.length){
      event.preventDefault();
      queueImages(files);
    }
  }

  function initFlyout(){
    var card = document.createElement("section");
    card.className = "card flyout-card";
    card.id = "rl-flyout-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-labelledby", "rl-fo-title");
    card.hidden = true;

    var top = document.createElement("header");
    top.className = "fo-top";

    var title = document.createElement("b");
    title.id = "rl-fo-title";

    var chip = document.createElement("span");
    chip.className = "id";
    chip.id = "rl-fo-chip";
    chip.hidden = true;

    var close = document.createElement("button");
    close.type = "button";
    close.className = "x";
    close.id = "rl-fo-close";
    close.textContent = "×";
    close.setAttribute("aria-label", t("Kapat"));
    close.addEventListener("click", requestClose);

    top.appendChild(title);
    top.appendChild(chip);
    top.appendChild(close);

    var body = document.createElement("div");
    body.className = "fo-body";
    body.id = "rl-fo-body";
    body.tabIndex = -1;

    var foot = document.createElement("footer");
    foot.className = "fo-foot";
    foot.id = "rl-fo-foot";

    var toasts = document.createElement("div");
    toasts.className = "toasts";
    toasts.id = "rl-toasts";
    toasts.setAttribute("aria-live", "polite");

    /* the scroller stays the body; the toast floats above the footer
       without ever sitting in the layout flow */
    var bodyWrap = document.createElement("div");
    bodyWrap.className = "fo-body-wrap";
    bodyWrap.appendChild(body);
    bodyWrap.appendChild(toasts);

    card.appendChild(top);
    card.appendChild(buildStorageBanner());
    card.appendChild(bodyWrap);
    card.appendChild(foot);
    document.body.appendChild(card);

    els.card = card;
    els.title = title;
    els.chip = chip;
    els.body = body;
    els.foot = foot;

    /* v9: ask the host for the viewport budget before the first section
       renders; the host may have sent it before this listener existed. */
    postPanel("RL_FLYOUT_READY", {});

    if(pendingArrowY != null){
      card.style.setProperty("--arrow-y", pendingArrowY + "px");
      pendingArrowY = null;
    }

    body.addEventListener("input", onBodyInput);
    body.addEventListener("change", onBodyChange);
    body.addEventListener("click", onBodyClick);
    body.addEventListener("keydown", onBodyKeydown);
    body.addEventListener("scroll", updateScrollAffordance, { passive:true });
    foot.addEventListener("click", onBodyClick);
    document.addEventListener("paste", onPaste);

    /* object URLs must not outlive the document */
    window.addEventListener("pagehide", revokeThumbs);
    window.addEventListener("beforeunload", revokeThumbs);

    /* shell v12 §4: when the host caps the iframe to the menu-button space,
       shrink the body budget to that real height instead of clipping the card.
       The iframe is also resized for every height the panel reports, so a
       resize event can still carry the *previous* section's height. Only adopt
       a cap that is still in place once the layout has settled, otherwise the
       budget would collapse to a transient height and never recover. */
    var flyoutCapTimer = 0;
    window.addEventListener("resize", function(){
      if(role !== "flyout" || !els.card) return;
      if(flyoutCapTimer){ clearTimeout(flyoutCapTimer); flyoutCapTimer = null; }
      flyoutCapTimer = setTimeout(function(){
        flyoutCapTimer = null;
        if(role !== "flyout" || !els.card) return;
        var ih = window.innerHeight || 0;
        var cardH = Math.ceil(els.card.getBoundingClientRect().height);
        if(ih > 120 && cardH > ih + 1 && ih < flyoutMaxAvailable){
          flyoutMaxAvailable = ih;
          applyFlyoutMax();
          lastSize = -1;
          reportSize();
        }
      }, 150);
    });

    /* close an open row menu / inline delete confirm / type popover on an outside click */
    document.addEventListener("click", function(event){
      var el = event.target;
      if(tpOpen && el && typeof el.closest === "function" && !el.closest(".tp-wrap")){
        tpOpen = false;
        var pop = document.getElementById("rl-tp-pop");
        if(pop) pop.hidden = true;
        var summary = document.querySelector(".tp-summary");
        if(summary) summary.setAttribute("aria-expanded", "false");
      }
      if(!openRowMenuId && !listDeleteId) return;
      if(el && typeof el.closest === "function" &&
        (el.closest('[data-act="row-menu"]') || el.closest(".rowmenu") || el.closest(".row-confirm"))) return;
      openRowMenuId = null;
      listDeleteId = null;
      if(state.section === "list") updateList();
    });

    document.addEventListener("keydown", function(event){
      if(event.key !== "Escape") return;
      if(document.getElementById("rl-project-settings")){
        event.preventDefault();
        closeProjectSettingsModal();
        return;
      }
      if(imagePreview){
        event.preventDefault();
        closeImagePreview();
        return;
      }
      if(tabPicker){
        event.preventDefault();
        closeTabPicker();
        return;
      }
      if(openSelWrap){
        event.preventDefault();
        closeOpenSelect(true);
        return;
      }
      if(!state.section) return;
      if(exportWizard){
        event.preventDefault();
        closeExportWizard();
        return;
      }
      if(exportCleanup){
        event.preventDefault();
        exportCleanup = null;
        renderFlyout("list");
        return;
      }
      if(backupPending && state.section === "backup"){
        event.preventDefault();
        cancelBackup();
        return;
      }
      if(tpOpen){
        event.preventDefault();
        tpOpen = false;
        var pop = document.getElementById("rl-tp-pop");
        if(pop) pop.hidden = true;
        var summary = document.querySelector(".tp-summary");
        if(summary) summary.setAttribute("aria-expanded", "false");
        return;
      }
      if(openRowMenuId || listDeleteId){
        event.preventDefault();
        openRowMenuId = null;
        listDeleteId = null;
        if(state.section === "list") updateList();
        return;
      }
      if(duplicatePrompt || archiveDelete || archiveClear || archiveRenameId || archiveDetail){
        event.preventDefault();
        duplicatePrompt = null;
        archiveDelete = null;
        archiveClear = null;
        archiveRenameId = null;
        archiveDetail = null;
        refreshArchiveViews();
        return;
      }
      event.preventDefault();
      requestClose();
    });

    window.addEventListener("message", onHostMessage);

    if(typeof ResizeObserver !== "undefined"){
      var observer = new ResizeObserver(function(){ reportSize(); });
      observer.observe(card);
    }

    if(demo){
      if(pendingSection){
        var pending = pendingSection;
        pendingSection = null;
        showSection(pending);
      }else{
        var section = params.get("section") || "new";
        if(isKnownSection(section)) showSection(section);
      }
    }else if(pendingSection){
      var queued = pendingSection;
      pendingSection = null;
      showSection(queued);
    }

    broadcastState();
  }

  /* ---------- boot ---------- */

  function init(){
    applyTheme("system"); /* no flash while storage resolves */
    watchSystemTheme();
    document.body.classList.add("role-" + role);
    if(!hasHost) document.documentElement.classList.add("standalone");
    openChannel();
    watchStoragePrefs();
    initRuntimeBridge();
    if(!core){
      console.warn("[rl-panel] IstekCore not found; strings render untranslated.");
    }

    readPrefs().then(function(prefs){
      applyThemeAndLanguage(prefs);
      return bootApp(prefs);
    }).then(function(){
      if(role === "dock") initDock();
      else initFlyout();
      document.documentElement.classList.add("is-ready");
      initAppBridge();
    }).catch(function(){
      app = app || defaultApp();
      if(role === "dock") initDock();
      else initFlyout();
      document.documentElement.classList.add("is-ready");
      initAppBridge();
    });
  }

  window.RLPanel = {
    role: role,
    setTheme: setTheme,
    setMode: requestMode,
    setLanguage: setLanguage,
    ready: triggerReady,
    cancel: triggerCancel,
    openDock: function(){ openDock(); },
    closeDock: function(){ closeDock(); },
    togglePin: function(){ togglePin(); },
    pinned: function(){ return !!state.pinned; },
    dockState: function(){ return state.dock; },
    isDragging: function(){ return isDraggingRail(); },
    dragHandle: function(){
      if(!els.dragHandle) return null;
      var rect = els.dragHandle.getBoundingClientRect();
      return {
        x:rect.x, y:rect.y, left:rect.left, top:rect.top,
        right:rect.right, bottom:rect.bottom,
        width:rect.width, height:rect.height
      };
    },
    open: function(section){
      if(!isKnownSection(section)) return;
      if(role === "dock"){
        if(!els.card){
          pendingSection = section;
          pendingDock = "open";
          return;
        }
        if(state.dock !== "open") openDock();
        var btn = els.card.querySelector('.item[data-section="' + section + '"]');
        if(btn) openSection(section, btn);
      }else{
        if(!els.card){
          pendingSection = section;
          return;
        }
        showSection(section);
      }
    },
    close: function(){
      if(role === "dock" && els.card) closeSection();
    }
  };

  /* direct globals as promised by the phase-1 API */
  window.setTheme = setTheme;
  window.setMode = requestMode;

  init();
})();
