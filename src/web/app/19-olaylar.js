  /* ============================================================
     Olaylar
     ============================================================ */
  function bindEvents(){
    const themeBtn = $("#themeBtn");
    if(themeBtn) themeBtn.addEventListener("click", toggleTheme);
    const langToggleBtn = $("#langToggleBtn");
    if(langToggleBtn) langToggleBtn.addEventListener("click", toggleLanguage);

    const addBtn = $("#addBtn");
    const emptyAddBtn = $("#emptyAddBtn");
    if(addBtn) addBtn.addEventListener("click", function(){ addRequest(); });
    if(emptyAddBtn) emptyAddBtn.addEventListener("click", function(){ addRequest(); });

    const emptyHelpBtn = $("#emptyHelpBtn");
    if(emptyHelpBtn) emptyHelpBtn.addEventListener("click", function(){ openModal($("#helpModal")); });

    const projectCreateBtn = $("#projectCreateBtn");
    if(projectCreateBtn) projectCreateBtn.addEventListener("click", createProjectFromGate);
    const projectCreateBackBtn = $("#projectCreateBackBtn");
    if(projectCreateBackBtn) projectCreateBackBtn.addEventListener("click", showProjectPickerScreen);
    const projectsBtn = $("#projectsBtn");
    if(projectsBtn) projectsBtn.addEventListener("click", showProjectPickerScreen);
    const projectsSwitchBtn = $("#projectsSwitchBtn");
    if(projectsSwitchBtn) projectsSwitchBtn.addEventListener("click", showProjectPickerScreen);
    const projectPickerNewBtn = $("#projectPickerNewBtn");
    if(projectPickerNewBtn) projectPickerNewBtn.addEventListener("click", showProjectCreateScreen);
    const projectPickerList = $("#projectPickerList");
    if(projectPickerList) projectPickerList.addEventListener("click", function(event){
      const button = event.target.closest("[data-project-id]");
      if(button) requestProjectOpen(button.dataset.projectId);
    });
    const projectCreateInput = $("#projectCreateInput");
    if(projectCreateInput){
      projectCreateInput.addEventListener("keydown", function(event){
        if(event.key === "Enter"){ event.preventDefault(); createProjectFromGate(); }
      });
      projectCreateInput.addEventListener("input", function(){
        projectCreateInput.classList.remove("is-invalid");
      });
    }

    const exportBtn = $("#exportBtn");
    if(exportBtn) exportBtn.addEventListener("click", startExportFlow);

    const projectBtn = $("#projectBtn");
    if(projectBtn) projectBtn.addEventListener("click", chooseTargetFolder);
    const settingsBtn = $("#settingsBtn");
    if(settingsBtn) settingsBtn.addEventListener("click", openSettingsModal);
    $$("#settingsModal .settings__tab").forEach(function(tab){
      tab.addEventListener("click", function(){ setSettingsTab(tab.dataset.settingsTab); });
    });
    const addAgentBtn = $("#addAgentBtn");
    if(addAgentBtn) addAgentBtn.addEventListener("click", addAgentSettingRow);
    const saveSettingsBtn = $("#saveSettingsBtn");
    if(saveSettingsBtn) saveSettingsBtn.addEventListener("click", saveSettings);
    const resetSettingsBtn = $("#resetSettingsBtn");
    if(resetSettingsBtn) resetSettingsBtn.addEventListener("click", resetSystemSettings);
    const chooseProjectSettingBtn = $("#chooseProjectSettingBtn");
    if(chooseProjectSettingBtn) chooseProjectSettingBtn.addEventListener("click", async function(){
      await chooseTargetFolder();
      updateFolderSettingsUI();
    });
    const clearProjectSettingBtn = $("#clearProjectSettingBtn");
    if(clearProjectSettingBtn) clearProjectSettingBtn.addEventListener("click", clearTargetFolder);

    const targetFolderBtn = $("#targetFolderBtn");
    if(targetFolderBtn) targetFolderBtn.addEventListener("click", chooseTargetFolder);
    const exportTargetBtn = $("#exportTargetBtn");
    if(exportTargetBtn) exportTargetBtn.addEventListener("click", chooseTargetFolder);
    const exportTargetClear = $("#exportTargetClear");
    if(exportTargetClear) exportTargetClear.addEventListener("click", clearTargetFolder);

    const historyBtn = $("#historyBtn");
    if(historyBtn) historyBtn.addEventListener("click", openHistoryPanel);
    const historyClose = $("#historyClose");
    if(historyClose) historyClose.addEventListener("click", closeHistoryPanel);
    const historyScrim = $("#historyScrim");
    if(historyScrim) historyScrim.addEventListener("click", closeHistoryPanel);
    const historyClear = $("#historyClearBtn");
    if(historyClear) historyClear.addEventListener("click", clearActiveArchive);
    $$(".history__tab").forEach(function(tab){
      tab.addEventListener("click", function(){
        historyTab = tab.dataset.htab;
        renderHistoryTree();
      });
    });
    const archiveCollapse = $("#archiveCollapseBtn");
    if(archiveCollapse) archiveCollapse.addEventListener("click", toggleArchiveCollapsed);
    const archiveSearch = $("#archiveProjectSearch");
    if(archiveSearch){
      const applyArchiveSearch = function(){
        archiveProjectQuery = archiveSearch.value;
        renderArchiveProjects();
        const clear = $("#archiveProjectSearchClear");
        if(clear) clear.hidden = !archiveSearch.value;
      };
      archiveSearch.addEventListener("input", applyArchiveSearch);
      archiveSearch.addEventListener("search", applyArchiveSearch);
    }
    const archiveSearchClear = $("#archiveProjectSearchClear");
    if(archiveSearchClear) archiveSearchClear.addEventListener("click", function(){
      const input = $("#archiveProjectSearch");
      if(input) input.value = "";
      archiveProjectQuery = "";
      const clear = $("#archiveProjectSearchClear");
      if(clear) clear.hidden = true;
      renderArchiveProjects();
      if(input){
        try{ input.focus(); }catch(err){}
      }
    });
    const archiveProjectTree = $("#archiveProjectTree");
    if(archiveProjectTree) archiveProjectTree.addEventListener("click", function(event){
      const button = event.target.closest("[data-project-id]");
      if(!button) return;
      openProjectSettingsModal(button.dataset.projectId);
    });
    const archiveProjectDetail = $("#archiveProjectDetail");
    if(archiveProjectDetail) archiveProjectDetail.addEventListener("click", function(event){
      const button = event.target.closest("[data-project-id]");
      if(!button) return;
      openProjectSettingsModal(button.dataset.projectId);
    });
    const projectSettingsSave = $("#projectSettingsSaveBtn");
    if(projectSettingsSave) projectSettingsSave.addEventListener("click", saveProjectSettingsName);
    const projectSettingsName = $("#projectSettingsName");
    if(projectSettingsName) projectSettingsName.addEventListener("keydown", function(event){
      if(event.key === "Enter"){ event.preventDefault(); saveProjectSettingsName(); }
    });
    const projectSettingsChoose = $("#projectSettingsChooseTarget");
    if(projectSettingsChoose) projectSettingsChoose.addEventListener("click", chooseProjectSettingsTarget);
    const projectSettingsClear = $("#projectSettingsClearTarget");
    if(projectSettingsClear) projectSettingsClear.addEventListener("click", clearProjectSettingsTarget);
    const projectSettingsOpen = $("#projectSettingsOpenBtn");
    if(projectSettingsOpen) projectSettingsOpen.addEventListener("click", openProjectFromSettings);
    const projectSettingsDelete = $("#projectSettingsDeleteBtn");
    if(projectSettingsDelete) projectSettingsDelete.addEventListener("click", deleteProjectFromSettings);
    const historyTree = $("#historyTree");
    if(historyTree) historyTree.addEventListener("click", function(event){
      const button = event.target.closest("[data-snapshot-id]");
      if(!button) return;
      const kind = button.dataset.snapshotKind;
      const collection = kind === "history" ? historyItems : kind === "records" ? records : drafts;
      const item = collection.find(function(entry){ return entry.id === button.dataset.snapshotId; });
      if(item) openSnapshotDetail(kind, item);
    });
    const historyCopy = $("#historyCopyBtn");
    if(historyCopy) historyCopy.addEventListener("click", async function(){
      if(!currentSnapshot || !currentSnapshot.markdown) return;
      const copied = await copyTextToClipboard(currentSnapshot.markdown);
      showToast(copied ? "Arşiv metni panoya kopyalandı." : "Panoya kopyalama başarısız oldu.", copied ? "ok" : "error");
    });
    const snapshotLoadBtn = $("#snapshotLoadBtn");
    if(snapshotLoadBtn) snapshotLoadBtn.addEventListener("click", loadCurrentSnapshot);
    const snapshotRenameBtn = $("#snapshotRenameBtn");
    if(snapshotRenameBtn) snapshotRenameBtn.addEventListener("click", openRenameModal);
    const renameSaveBtn = $("#renameSaveBtn");
    if(renameSaveBtn) renameSaveBtn.addEventListener("click", saveSnapshotName);
    const renameInput = $("#renameInput");
    if(renameInput) renameInput.addEventListener("keydown", function(event){
      if(event.key === "Enter"){ event.preventDefault(); saveSnapshotName(); }
    });
    const snapshotDeleteBtn = $("#snapshotDeleteBtn");
    if(snapshotDeleteBtn) snapshotDeleteBtn.addEventListener("click", function(){
      if(!currentSnapshot) return;
      const kind = currentSnapshotKind;
      const id = currentSnapshot.id;
      if(kind !== "records" && kind !== "drafts") return;
      closeModal($("#historyModal"));
      deleteArchiveItem(kind, id);
    });
    const saveRecordBtn = $("#saveRecordBtn");
    if(saveRecordBtn) saveRecordBtn.addEventListener("click", saveRecord);

    $$("[data-rail]").forEach(function(button){
      button.addEventListener("click", function(){
        const action = button.dataset.rail;
        if(action === "backup"){ openModal($("#backupModal")); if(typeof refreshServerDataLists === "function") refreshServerDataLists(); }
        else if(action === "help") openModal($("#helpModal"));
        else if(action === "settings") openSettingsModal();
        else window.scrollTo({ top:0, behavior:"smooth" });
      });
    });

    const exportDownload = $("#exportDownloadBtn");
    if(exportDownload) exportDownload.addEventListener("click", doExport);
    const instantExportBtn = $("#instantExportBtn");
    if(instantExportBtn) instantExportBtn.addEventListener("click", instantExport);
    const copyBtn = $("#copyMdBtn");
    if(copyBtn) copyBtn.addEventListener("click", copyMarkdown);
    $$('input[name="exportMode"]').forEach(function(radio){
      radio.addEventListener("change", updateExportButtonLabel);
    });

    $$("[data-plan-mode]").forEach(function(button){
      button.addEventListener("click", function(){
        planningMode = button.dataset.planMode;
        syncPlanningUI();
      });
    });
    $$("[data-plan-test]").forEach(function(button){
      button.addEventListener("click", function(){
        planningTest = button.dataset.planTest;
        syncPlanningUI();
      });
    });
    $$("[data-plan-question]").forEach(function(button){
      button.addEventListener("click", function(){
        planningQuestion = button.dataset.planQuestion === "yes";
        syncPlanningUI();
      });
    });
    $$("[data-plan-runtime]").forEach(function(button){
      button.addEventListener("click", function(){
        planningRuntime = button.dataset.planRuntime === "yes";
        syncPlanningUI();
      });
    });
    $$("[data-plan-transfer]").forEach(function(button){
      button.addEventListener("click", function(){
        const value = button.dataset.planTransfer;
        if(value === "none"){
          planningTransfers = ["none"];
        }else{
          const noneIndex = planningTransfers.indexOf("none");
          if(noneIndex >= 0) planningTransfers.splice(noneIndex, 1);
          const index = planningTransfers.indexOf(value);
          if(index >= 0) planningTransfers.splice(index, 1);
          else planningTransfers.push(value);
        }
        syncPlanningUI();
      });
    });
    const exportCancelBtn = $("#exportCancelBtn");
    if(exportCancelBtn) exportCancelBtn.addEventListener("click", handleExportCancel);
    const exportBackBtn = $("#exportBackBtn");
    if(exportBackBtn) exportBackBtn.addEventListener("click", handleExportBack);
    const planningConfirmBtn = $("#planningConfirmBtn");
    if(planningConfirmBtn) planningConfirmBtn.addEventListener("click", confirmPlanning);

    const backupZip = $("#backupZipBtn");
    if(backupZip) backupZip.addEventListener("click", downloadBackupZip);
    const restoreBtn = $("#restoreBackupBtn");
    const restoreInput = $("#restoreInput");
    if(restoreBtn && restoreInput) restoreBtn.addEventListener("click", function(){ restoreInput.click(); });
    if(restoreInput) restoreInput.addEventListener("change", function(){
      const file = restoreInput.files && restoreInput.files[0];
      restoreInput.value = "";
      if(file){
        restoreBackupFile(file).catch(function(err){
          console.error(err);
          showToast(err.message || "Yedek okunamadı.", "error");
        });
      }
    });
    const clearRequestsBtn = $("#clearRequestsBtn");
    if(clearRequestsBtn) clearRequestsBtn.addEventListener("click", openClearRequestsConfirm);
    const clearAll = $("#clearAllBtn");
    if(clearAll) clearAll.addEventListener("click", clearAllData);

    const imageInput = $("#globalImageInput");
    if(imageInput) imageInput.addEventListener("change", function(){
      const rowId = pendingImageRowId;
      const files = Array.prototype.slice.call(imageInput.files || []);
      imageInput.value = "";
      if(!rowId || !files.length) return;
      pendingImageRowId = null;
      addFilesToRow(rowId, files);
    });
    const attachmentInput = $("#globalAttachmentInput");
    if(attachmentInput) attachmentInput.addEventListener("change", function(){
      const rowId = pendingAttachmentRowId;
      const files = Array.prototype.slice.call(attachmentInput.files || []);
      attachmentInput.value = "";
      if(!rowId || !files.length) return;
      pendingAttachmentRowId = null;
      addAttachmentsToRow(rowId, files);
    });

    const search = $("#searchInput");
    if(search){
      search.addEventListener("input", function(){
        filter.q = trLower(search.value);
        const clear = $("#searchClear");
        if(clear) clear.hidden = !search.value;
        applyFilters();
      });
      search.addEventListener("search", function(){
        filter.q = trLower(search.value);
        const clear = $("#searchClear");
        if(clear) clear.hidden = !search.value;
        applyFilters();
      });
    }
    if(window.matchMedia){
      const themeQuery = window.matchMedia("(prefers-color-scheme: dark)");
      if(themeQuery.addEventListener){
        themeQuery.addEventListener("change", function(event){
          let stored = null;
          try{ stored = localStorage.getItem(THEME_KEY); }catch(err){}
          if(stored !== "dark" && stored !== "light"){
            document.documentElement.setAttribute("data-theme", event.matches ? "dark" : "light");
            syncTheme();
          }
        });
      }
    }
    const searchClear = $("#searchClear");
    if(searchClear) searchClear.addEventListener("click", function(){
      if(search){ search.value = ""; search.focus(); }
      filter.q = "";
      searchClear.hidden = true;
      applyFilters();
    });
    $$(".chip[data-type]").forEach(function(chip){
      chip.addEventListener("click", function(){
        filter.type = chip.dataset.type;
        $$(".chip[data-type]").forEach(function(other){ other.classList.toggle("is-active", other === chip); });
        applyFilters();
      });
    });
    const statusMount = $("#statusFilterMount");
    if(statusMount && !statusMount.firstChild){
      statusSelectControl = buildCSelect({
        id: "statusFilter",
        name: "Durum",
        value: "all",
        small: true,
        title: "Duruma göre filtrele",
        items: [
          { value: "all", label: "Tüm durumlar" },
          { value: "ready", label: "Hazır" },
          { value: "notready", label: "Hazır değil" }
        ],
        onChange: function(value){
          filter.status = value;
          applyFilters();
        }
      });
      statusMount.appendChild(statusSelectControl);
    }
    const clearFilters = $("#clearFiltersBtn");
    if(clearFilters) clearFilters.addEventListener("click", function(){ resetFilters(); });
    const collapseAll = $("#collapseAll");
    if(collapseAll) collapseAll.addEventListener("click", function(){ setAllCollapsed(true); });

    const jumpBtn = $("#jumpIncompleteBtn");
    if(jumpBtn) jumpBtn.addEventListener("click", jumpNextIncomplete);

    const list = $("#reqList");
    if(list){
      list.addEventListener("focusin", function(event){
        const row = event.target.closest(".req");
        if(row){
          activeRowId = row.dataset.id;
        }
      });
      list.addEventListener("click", function(event){
        const row = event.target.closest(".req");
        if(!row) return;
        const req = getReq(row.dataset.id);
        if(!req) return;
        const actionEl = event.target.closest("[data-action]");
        const action = actionEl ? actionEl.dataset.action : "";
        if(action === "toggle"){
          toggleRow(req, row);
          return;
        }
        if(action === "collapse"){
          toggleRow(req, row, true);
          return;
        }
        if(action === "tick"){
          onTick(req, row);
          return;
        }
        if(action === "pick-element" || action === "capture-tab" || action === "pick-capture"){
          pickerOpen(req, action);
          return;
        }
        if(action === "add-image"){
          if(idbFailed || !idb){ showToast("Görsel depolaması kullanılamıyor.", "error"); return; }
          activeRowId = req.id;
          lastExpandedId = req.id;
          pendingImageRowId = req.id;
          const input = $("#globalImageInput");
          if(input){ input.value = ""; input.click(); }
          return;
        }
        if(action === "remove-image"){
          removeImage(req, actionEl.dataset.imageId);
          return;
        }
        if(action === "view-image"){
          openLightbox(req, actionEl.dataset.imageId);
          return;
        }
        if(action === "add-attachment"){
          if(req.type !== "design"){ showToast("Dosya eki yalnızca Tasarım türünde kullanılabilir.", "error"); return; }
          if(idbFailed || !idb){ showToast("Dosya depolaması kullanılamıyor.", "error"); return; }
          activeRowId = req.id;
          lastExpandedId = req.id;
          pendingAttachmentRowId = req.id;
          const input = $("#globalAttachmentInput");
          if(input){ input.value = ""; input.click(); }
          return;
        }
        if(action === "remove-attachment"){
          removeAttachment(req, actionEl.dataset.attachmentId);
          return;
        }
        if(action === "up" || action === "down" || action === "duplicate" || action === "delete"){
          const details = row.querySelector("details.reqmenu");
          if(details) details.open = false;
          if(action === "up") moveRequest(req.id, -1);
          else if(action === "down") moveRequest(req.id, 1);
          else if(action === "duplicate") duplicateRequest(req.id);
          else deleteRequest(req.id);
          return;
        }
        if(!action && event.target.closest("[data-dropzone]") && !event.target.closest("button") && !req.images.length){
          activeRowId = req.id;
          pendingImageRowId = req.id;
          const input = $("#globalImageInput");
          if(input){ input.value = ""; input.click(); }
        }
      });
      list.addEventListener("input", function(event){
        const target = event.target;
        const field = target.dataset ? target.dataset.field : "";
        if(!field || target.tagName === "SELECT") return;
        const row = target.closest(".req");
        if(!row) return;
        const req = getReq(row.dataset.id);
        if(!req) return;
        onFieldChange(row, req, field, target.value, target);
      });
      list.addEventListener("dragover", function(event){
        const dropzone = event.target.closest("[data-dropzone]");
        if(!dropzone) return;
        event.preventDefault();
        if(event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        dropzone.classList.add("is-drag");
      });
      list.addEventListener("dragleave", function(event){
        const dropzone = event.target.closest("[data-dropzone]");
        if(dropzone) dropzone.classList.remove("is-drag");
      });
      list.addEventListener("drop", function(event){
        const dropzone = event.target.closest("[data-dropzone]");
        if(!dropzone) return;
        event.preventDefault();
        dropzone.classList.remove("is-drag");
        const row = dropzone.closest(".req");
        if(!row) return;
        const dropReq = getReq(row.dataset.id);
        if(dropReq && requestStatus(dropReq) === "ready"){
          showToast("Hazır onayını geri alarak düzenleyebilirsin.", "error");
          return;
        }
        activeRowId = row.dataset.id;
        if(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length){
          addFilesToRow(row.dataset.id, event.dataTransfer.files);
        }
      });
    }

    document.addEventListener("click", function(event){
      const close = event.target.closest("[data-close-modal]");
      if(close){
        const modal = close.closest(".modal");
        if(modal) closeModal(modal);
        return;
      }
      if(!event.target.closest("details.reqmenu")){
        $$("details.reqmenu[open]").forEach(function(details){ details.open = false; });
      }
      if(!event.target.closest(".cselect")) closeAllCSelects();
    });
    document.addEventListener("keydown", function(event){
      const changelogModal = $("#changelogModal");
      const stackedChangelog = changelogModal && changelogModal.classList.contains("is-open") && activeModal === $("#settingsModal");
      if(event.key === "Tab" && stackedChangelog){
        trapFocus(event, changelogModal);
        return;
      }
      if(event.key === "Tab" && activeModal){
        trapFocus(event, activeModal);
        return;
      }
      if(event.key === "Escape"){
        if(openCSelect){
          closeAllCSelects();
          return;
        }
        if(stackedChangelog){
          closeModal(changelogModal);
          return;
        }
        if(activeModal){
          closeModal(activeModal);
        }else if($("#historyPanel").classList.contains("is-open")){
          closeHistoryPanel();
        }else{
          $$("details.reqmenu[open]").forEach(function(details){ details.open = false; });
        }
      }
    });
    window.addEventListener("scroll", function(){ closeAllCSelects(); }, { passive:true });
    window.addEventListener("resize", function(){ closeAllCSelects(); });
    document.addEventListener("paste", function(event){
      const clipboard = event.clipboardData;
      if(!clipboard) return;
      const items = Array.prototype.slice.call(clipboard.items || []);
      const files = [];
      items.forEach(function(item){
        if(item.kind === "file" && String(item.type || "").indexOf("image/") === 0){
          const file = item.getAsFile();
          if(file) files.push(file);
        }
      });
      if(!files.length) return;
      const targetRowId = activeRowId || lastExpandedId || (state.requests.find(function(req){ return !req.collapsed; }) || {}).id;
      if(!targetRowId){
        showToast("Önce bir istek satırı açın.", "error");
        return;
      }
      const targetReq = getReq(targetRowId);
      if(!targetReq) return;
      if(requestStatus(targetReq) === "ready"){
        showToast("Hazır onayını geri alarak düzenleyebilirsin.", "error");
        return;
      }
      const hasText = items.some(function(item){ return item.kind === "string"; });
      const inTextField = event.target && (event.target.tagName === "TEXTAREA" || event.target.tagName === "INPUT");
      if(hasText && inTextField) return;
      event.preventDefault();
      activeRowId = targetReq.id;
      targetReq.collapsed = false;
      const row = getRowEl(targetReq.id);
      if(row) updateRowUI(row, targetReq);
      growRowTextareas(row);
      addFilesToRow(targetReq.id, files);
    });
    document.addEventListener("dragover", function(event){
      if(event.dataTransfer && Array.prototype.indexOf.call(event.dataTransfer.types || [], "Files") !== -1 && !event.target.closest("[data-dropzone]")){
        event.preventDefault();
      }
    });
    document.addEventListener("drop", function(event){
      if(event.dataTransfer && Array.prototype.indexOf.call(event.dataTransfer.types || [], "Files") !== -1 && !event.target.closest("[data-dropzone]")){
        event.preventDefault();
        showToast("Görseli bir satırın görsel alanına bırak.", "error");
      }
    });
    window.addEventListener("pagehide", function(){
      if(saveTimer){
        clearTimeout(saveTimer);
        saveTimer = null;
        saveNow();
      }
    });
    document.addEventListener("visibilitychange", function(){
      if(document.hidden && saveTimer){
        clearTimeout(saveTimer);
        saveTimer = null;
        saveNow();
      }
    });
    window.addEventListener("resize", function(){
      $$(".req.is-open", $("#reqList") || document).forEach(growRowTextareas);
      if($("#toast") && $("#toast").classList.contains("is-open")) positionToast();
      syncArchiveResponsiveState();
    });
    const confirmOk = $("#confirmOkBtn");
    if(confirmOk) confirmOk.addEventListener("click", async function(){
      const action = confirmAction;
      const modal = $("#confirmModal");
      confirmAction = null;
      confirmOk.disabled = true;
      try{
        if(action) await action();
        closeModal(modal);
      }catch(err){
        console.error(err);
        showToast(err.message || "İşlem tamamlanamadı.", "error");
      }finally{
        confirmOk.disabled = false;
      }
    });
    const confirmAlt = $("#confirmAltBtn");
    if(confirmAlt) confirmAlt.addEventListener("click", async function(){
      const action = confirmAltAction;
      const modal = $("#confirmModal");
      confirmAltAction = null;
      confirmAction = null;
      confirmAlt.disabled = true;
      try{
        if(action) await action();
        closeModal(modal);
      }catch(err){
        console.error(err);
        showToast(err.message || "İşlem tamamlanamadı.", "error");
      }finally{
        confirmAlt.disabled = false;
      }
    });
  }
