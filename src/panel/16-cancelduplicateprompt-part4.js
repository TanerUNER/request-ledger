  function cancelDuplicatePrompt(){
    duplicatePrompt = null;
    syncDuplicatePrompt();
    updateScrollAffordance();
  }

  /* ---------- archive actions ---------- */

  function findArchiveItem(kind, id){
    var list = archiveData[kind] || [];
    for(var i = 0; i < list.length; i++){
      if(list[i].id === id) return list[i];
    }
    return null;
  }

  function openArchiveRecord(kind, id){
    var item = findArchiveItem(kind, id);
    if(!item) return;
    if(kind === "history"){
      archiveDetail = item;
      archiveDelete = null;
      refreshArchiveViews();
      if(els.body) els.body.scrollTop = 0;
      return;
    }
    if(!Array.isArray(item.requests) || !item.requests.length){
      toast(lx("noSnapshotRequests"), "error");
      return;
    }
    loadArchive().then(function(){
      if(!app.requests.length || isLedgerSaved()) return null;
      return createAutoDraft();
    }).then(function(){
      applyArchiveSnapshot(item, kind);
    }).catch(function(){
      toast(lx("recordFailed"), "error");
    });
  }

  function applyArchiveSnapshot(item, kind){
    var loaded = (item.requests || []).map(function(raw, index){
      var copy = raw;
      try{ copy = JSON.parse(JSON.stringify(raw)); }catch(err){ copy = raw; }
      if(core && core.requests && core.requests.normalize){
        try{ return core.requests.normalize(copy, index); }catch(err){ /* fall through */ }
      }
      return copy;
    });

    app.requests = loaded;
    if(item.project) app.project = item.project;
    if(item.ledgerId) app.ledgerId = item.ledgerId;
    activeRequestId = null;
    saveActivePointer(null);
    state.highlight = loaded.length ? loaded[0].id : null;
    archiveDetail = null;
    archiveDelete = null;
    archiveClear = null;
    archiveRenameId = null;
    flushSave();
    broadcastState();
    refreshListPane();
    toast(t("Yüklendi: " + fmtDateTime(kind === "history" ? (item.exportedAt || item.savedAt) : item.savedAt)));
    setTimeout(function(){
      if(state.section === "list") requestClose();
    }, 900);
  }

  function createAutoDraft(){
    if(!core || !core.storage || !core.storage.putCollection) return Promise.resolve(null);
    return buildLedgerSnapshot("draft").then(function(snapshot){
      snapshot.reason = "auto-draft";
      return Promise.resolve(core.storage.putCollection("drafts", snapshot)).then(function(){
        archiveData.drafts.push(snapshot);
        sortArchive("drafts");
        updateArchiveTabCounts();
        return snapshot;
      });
    });
  }

  function deleteArchiveItem(){
    var pending = archiveDelete;
    if(!pending) return;
    var kind = pending.kind;
    var id = pending.id;
    Promise.resolve()
      .then(function(){ return core.storage.deleteCollection(kind, id); })
      .then(function(){
        archiveData[kind] = archiveData[kind].filter(function(item){ return item.id !== id; });
        archiveDelete = null;
        if(archiveRenameId === id) archiveRenameId = null;
        if(archiveDetail && archiveDetail.id === id) archiveDetail = null;
        var message = kind === "records" ? lx("recordDeleted") : kind === "drafts" ? lx("draftDeleted") : lx("historyDeleted");
        toast(message);
        refreshArchiveViews();
      })
      .catch(function(){
        toast(lx("recordFailed"), "error");
      });
  }

  function clearArchiveCollection(){
    var kind = archiveClear;
    if(!kind) return;
    Promise.resolve()
      .then(function(){ return core.storage.clearCollection(kind); })
      .then(function(){
        archiveData[kind] = [];
        archiveClear = null;
        archiveDelete = null;
        archiveDetail = null;
        var message = kind === "records" ? lx("recordsCleared") : kind === "drafts" ? lx("draftsCleared") : lx("historyCleared");
        toast(message);
        refreshArchiveViews();
      })
      .catch(function(){
        toast(lx("recordFailed"), "error");
      });
  }

  function saveArchiveRename(){
    var id = archiveRenameId;
    if(!id) return;
    var input = document.getElementById("rl-record-rename-input");
    var value = input ? input.value.trim().slice(0, 120) : "";
    if(!value){
      toast(t("Kayıt adı boş olamaz."), "error");
      return;
    }
    var item = findArchiveItem("records", id);
    if(!item) return;
    item.name = value;
    Promise.resolve()
      .then(function(){ return core.storage.putCollection("records", item); })
      .then(function(){
        archiveRenameId = null;
        sortArchive("records");
        toast(t("Kayıt yeniden adlandırıldı."));
        refreshArchiveViews();
      })
      .catch(function(){
        toast(lx("recordFailed"), "error");
      });
  }

  /* ---------- media ---------- */

  function isImageFile(file){
    return !!file && (String(file.type || "").indexOf("image/") === 0 || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name || ""));
  }

  function isQuotaError(err){
    if(!err) return false;
    var name = String(err.name || "");
    return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      err.code === 22 || err.code === 1014 || /quota/i.test(String(err.message || ""));
  }

  function queueImages(files){
    var incoming = sliceFiles(files).filter(isImageFile);
    if(!incoming.length){
      toast(lx("onlyImages"), "error");
      return;
    }
    imageQueue = imageQueue.then(function(){
      return processImages(incoming);
    }).catch(function(){ /* keep the queue alive */ });
  }

  function processImages(files){
    var req = activeRequest();
    if(!req || isLocked(req)) return Promise.resolve();
    if(storageBlocked()){
      toast(lx("storageUnavailable"), "error");
      return Promise.resolve();
    }

    var slot = LIMITS.MAX_IMAGES - (req.images || []).length;
    if(slot <= 0){
      toast(lx("imageLimit", { n:LIMITS.MAX_IMAGES }), "error");
      return Promise.resolve();
    }
    var use = files.slice(0, slot);

    var chain = Promise.resolve();
    var added = 0;
    var quotaHit = false;

    use.forEach(function(file){
      chain = chain.then(function(){
        if(quotaHit) return null;
        if(file.size > LIMITS.MAX_INPUT_MB * 1024 * 1024){
          toast(t(file.name + " çok büyük (en fazla " + LIMITS.MAX_INPUT_MB + " MB)."), "error");
          return null;
        }
        return Promise.resolve()
          .then(function(){
            if(core && core.media && core.media.compress){
              return core.media.compress(file, { maxDim:LIMITS.MAX_DIM, quality:LIMITS.JPEG_QUALITY });
            }
            throw new Error("media unavailable");
          })
          .catch(function(){
            var type = file.type || "image/png";
            var ext = core && core.util && core.util.extFromMime ? core.util.extFromMime(type) : "png";
            return { blob:file, w:0, h:0, type:type, ext:ext };
          })
          .then(function(result){
            if(!core || !core.storage || !core.storage.putImage) throw new Error("storage unavailable");
            var id = "img_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
            return core.storage.putImage({ id:id, blob:result.blob, type:result.type }).then(function(){
              req.images.push({
                id:id,
                name:file.name || lx("imageFallback"),
                w:result.w,
                h:result.h,
                size:result.blob.size,
                type:result.type,
                ext:result.ext,
                file:""
              });
              core.requests.update(req, { images:req.images });
              added++;
              fillImageGrid(req, false);
              markDirty(0);
            });
          })
          .catch(function(err){
            if(isQuotaError(err)){
              quotaHit = true;
              toast(lx("quotaExceeded"), "error");
              return;
            }
            toast(t(file.name + " eklenemedi."), "error");
          });
      });
    });

    return chain.then(function(){
      if(added){
        toast(lx("imagesAdded", { n:added }));
      }
      broadcastState();
    });
  }

  function removeImage(id){
    var req = activeRequest();
    if(!req || !id || isLocked(req)) return;
    if(storageBlocked()){
      toast(lx("storageUnavailable"), "error");
      return;
    }
    var index = (req.images || []).findIndex(function(img){ return img.id === id; });
    if(index < 0) return;
    req.images.splice(index, 1);
    if(core && core.storage && core.storage.deleteImage){
      core.storage.deleteImage(id).catch(function(){});
    }
    if(thumbUrls[id]){
      try{ URL.revokeObjectURL(thumbUrls[id]); }catch(err){ /* ignore */ }
      delete thumbUrls[id];
    }
    core.requests.update(req, { images:req.images });
    markDirty(0);
    fillImageGrid(req, false);
    toast(t("Görsel kaldırıldı."));
  }

  function addAttachments(files){
    var req = activeRequest();
    if(!req || isLocked(req)) return;
    if(storageBlocked()){
      toast(lx("storageUnavailable"), "error");
      return;
    }
    var incoming = sliceFiles(files);
    if(!incoming.length) return;
    var slot = LIMITS.MAX_ATTACHMENTS - req.attachments.length;
    if(slot <= 0){
      toast(lx("fileLimit", { n:LIMITS.MAX_ATTACHMENTS }), "error");
      return;
    }
    var use = incoming.slice(0, slot);

    var chain = Promise.resolve();
    var added = 0;
    use.forEach(function(file){
      chain = chain.then(function(){
        if(file.size > LIMITS.MAX_FILE_MB * 1024 * 1024){
          toast(t(file.name + " çok büyük (en fazla " + LIMITS.MAX_FILE_MB + " MB)."), "error");
          return null;
        }
        if(!core || !core.storage || !core.storage.putFile) return null;
        var id = "file_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
        var type = file.type || "application/octet-stream";
        var ext = core.util && core.util.extFromFileName ? core.util.extFromFileName(file.name) : "";
        return core.storage.putFile({ id:id, blob:file, type:type }).then(function(){
          req.attachments.push({ id:id, name:file.name || "dosya", size:file.size, type:type, ext:ext, file:"" });
          core.requests.update(req, { attachments:req.attachments });
          added++;
          markDirty(0);
        }).catch(function(err){
          if(isQuotaError(err)){
            toast(lx("quotaExceeded"), "error");
            return;
          }
          toast(t(file.name + " eklenemedi."), "error");
        });
      });
    });

    chain.then(function(){
      if(added) toast(lx("filesAdded", { n:added }));
      if(state.section === "desc") renderFlyout("desc");
      else if(state.section === "detail") renderFlyout("detail");
      broadcastState();
    });
  }

  function removeFile(id){
    var req = activeRequest();
    if(!req || !id || isLocked(req)) return;
    if(storageBlocked()){
      toast(lx("storageUnavailable"), "error");
      return;
    }
    var index = req.attachments.findIndex(function(att){ return att.id === id; });
    if(index < 0) return;
    req.attachments.splice(index, 1);
    if(core && core.storage && core.storage.deleteFile){
      core.storage.deleteFile(id).catch(function(){});
    }
    core.requests.update(req, { attachments:req.attachments });
    markDirty(0);
    renderFlyout(state.section === "detail" ? "detail" : "desc");
    toast(t("Dosya kaldırıldı."));
  }

  /* ---------- flyout event delegation ---------- */

  function onBodyInput(event){
    var target = event.target;
    if(!target || typeof target.getAttribute !== "function") return;

    if(target.id === "rl-search"){
      listFilter.q = target.value;
      refreshListSoon();
      return;
    }

    if(target.id === "rl-project-search"){
      archiveProjectQuery = target.value;
      renderArchiveProjectTree();
      return;
    }

    if(target.id === "rl-new-title"){
      draftTitle = target.value;
      syncCreateButton();
      return;
    }

    if(target.id === "rl-exp-note"){
      planNote = target.value;
      return;
    }

    var key = target.getAttribute("data-field");
    if(!key) return;

    var req = activeRequest();
    if(!req || isLocked(req)) return;

    var patch = {};
    patch[key] = target.value;
    core.requests.update(req, patch);

    if(missingField === "description" && key === "description" && String(target.value || "").trim()){
      missingField = null;
      target.classList.remove("is-invalid");
      target.removeAttribute("aria-invalid");
      var hint = document.getElementById("rl-invalid-hint");
      if(hint && hint.parentNode) hint.parentNode.removeChild(hint);
    }

    if(missingField === "title" && key === "title" && String(target.value || "").trim()){
      missingField = null;
      target.classList.remove("is-invalid");
      target.removeAttribute("aria-invalid");
      var titleHint = document.getElementById("rl-title-hint");
      if(titleHint && titleHint.parentNode) titleHint.parentNode.removeChild(titleHint);
    }

    markDirty();
  }

  function onBodyKeydown(event){
    var target = event.target;
    if(!target) return;
    if(event.key === "Enter" && target.id === "rl-record-rename-input"){
      event.preventDefault();
      saveArchiveRename();
    }
  }

  function onBodyChange(event){
    var target = event.target;
    if(!target || typeof target.getAttribute !== "function") return;

    var format = target.getAttribute("data-export-format");
    if(format && exportWizard){
      exportWizard.format = format === "embedded" ? "embedded" : "zip";
      var options = document.querySelectorAll(".exp-opt");
      for(var i = 0; i < options.length; i++){
        var input = options[i].querySelector("[data-export-format]");
        options[i].classList.toggle("is-on", !!(input && input.checked));
      }
      return;
    }

    if(target.id === "rl-exp-include-summary" && exportWizard){
      exportWizard.includeSummary = !!target.checked;
      return;
    }

    if(target.id === "rl-backup-input"){
      var picked = null;
      try{ picked = target.files && target.files.length ? target.files[0] : null; }catch(err){ picked = null; }
      try{ target.value = ""; }catch(err){ /* allow re-picking the same file */ }
      if(picked) prepareRestore(picked);
      return;
    }

    if(target.id !== "rl-status-filter") return;
    var value = target.value;
    listFilter.status = (value === "ready" || value === "notready") ? value : "all";
    openRowMenuId = null;
    listDeleteId = null;
    refreshList();
  }

  function onBodyClick(event){
    var target = event.target;
    if(!target || typeof target.closest !== "function") return;

    var typeBtn = target.closest("[data-type]");
    if(typeBtn){
      var typeId = typeBtn.getAttribute("data-type");
      if(state.section === "new"){
        draftType = typeId;
        markChipGroup(typeBtn, ".tygrid");
        /* the step count drops from 1/3 to 1/2 for page-free types */
        renderFoot("new");
        return;
      }
      var typeReq = activeRequest();
      if(typeReq && typeReq.type !== typeId){
        core.requests.update(typeReq, { type:typeId });
        cancelConfirm = false;
        missingField = null;
        markDirty(0);
        renderFlyout(state.section);
      }
      return;
    }

    var prioBtn = target.closest("[data-priority]");
    if(prioBtn){
      var priorityId = prioBtn.getAttribute("data-priority");
      if(state.section === "new"){
        draftPriority = priorityId;
        markChipGroup(prioBtn, ".prio");
        return;
      }
      var prioReq = activeRequest();
      if(prioReq && prioReq.priority !== priorityId){
        var wasLocked = isLocked(prioReq);
        core.requests.update(prioReq, { priority:priorityId });
        if(wasLocked){
          renderFlyout(state.section);
        }else{
          markChipGroup(prioBtn, ".prio");
          updateTypePrioritySummary(prioReq);
        }
        markDirty(0);
      }
      return;
    }

    var langBtn = target.closest("[data-lang]");
    if(langBtn){
      setLanguage(langBtn.getAttribute("data-lang"));
      return;
    }

    var modeBtn = target.closest("[data-plan-mode]");
    if(modeBtn){
      planMode = modeBtn.getAttribute("data-plan-mode");
      syncPlanningUI();
      return;
    }

    var questionBtn = target.closest("[data-plan-question]");
    if(questionBtn){
      planQuestion = questionBtn.getAttribute("data-plan-question") === "yes";
      syncPlanningUI();
      return;
    }

    var runtimeBtn = target.closest("[data-plan-runtime]");
    if(runtimeBtn){
      planRuntime = runtimeBtn.getAttribute("data-plan-runtime") === "yes";
      syncPlanningUI();
      return;
    }

    var transferBtn = target.closest("[data-plan-transfer]");
    if(transferBtn){
      var transfer = transferBtn.getAttribute("data-plan-transfer");
      if(transfer === "none"){
        planTransfers = ["none"];
      }else{
        var noneIndex = planTransfers.indexOf("none");
        if(noneIndex >= 0) planTransfers.splice(noneIndex, 1);
        var transferIndex = planTransfers.indexOf(transfer);
        if(transferIndex >= 0) planTransfers.splice(transferIndex, 1);
        else planTransfers.push(transfer);
      }
      syncPlanningUI();
      return;
    }

    var agentBtn = target.closest("[data-plan-agent]");
    if(agentBtn){
      var agentId = agentBtn.getAttribute("data-plan-agent");
      var agentIndex = planAgents.indexOf(agentId);
      if(agentIndex >= 0) planAgents.splice(agentIndex, 1);
      else planAgents.push(agentId);
      syncPlanningUI();
      return;
    }

    var testBtn = target.closest("[data-plan-test]");
    if(testBtn){
      planTest = testBtn.getAttribute("data-plan-test");
      syncPlanningUI();
      return;
    }

    var filterBtn = target.closest("[data-filter-type]");
    if(filterBtn){
      var filterType = filterBtn.getAttribute("data-filter-type");
      if(listFilter.type !== filterType){
        listFilter.type = filterType;
        openRowMenuId = null;
        listDeleteId = null;
        refreshList();
      }
      return;
    }

    var archiveTabBtn = target.closest("[data-archive-tab]");
    if(archiveTabBtn){
      switchArchiveTab(archiveTabBtn.getAttribute("data-archive-tab"));
      return;
    }

    var settingsTabBtn = target.closest("[data-settings-tab]");
    if(settingsTabBtn){
      switchSettingsTab(settingsTabBtn.getAttribute("data-settings-tab"));
      return;
    }

    var changelogBtn = target.closest("[data-changelog-toggle]");
    if(changelogBtn){
      toggleChangelog(changelogBtn.getAttribute("data-changelog-toggle"));
      return;
    }

    var recordActionEl = target.closest("[data-record-action]");
    if(recordActionEl){
      handleRecordAction(recordActionEl.getAttribute("data-record-action"), recordActionEl);
      return;
    }

    var projectActionEl = target.closest("[data-project-act]");
    if(projectActionEl){
      handleProjectAction(projectActionEl.getAttribute("data-project-act"), projectActionEl);
      return;
    }

    var archiveActionEl = target.closest("[data-archive-act]");
    if(archiveActionEl){
      handleArchiveAction(archiveActionEl.getAttribute("data-archive-act"));
      return;
    }

    var rowActionEl = target.closest("[data-row-action]");
    if(rowActionEl){
      handleRowAction(rowActionEl.getAttribute("data-row-action"), rowActionEl);
      return;
    }

    var actionEl = target.closest("[data-act]");
    if(actionEl){
      handleFlyoutAction(actionEl);
      return;
    }

    var row = target.closest("[data-request-id]");
    if(row){
      selectRequest(row.getAttribute("data-request-id"));
      return;
    }
  }
