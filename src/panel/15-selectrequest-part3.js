  function selectRequest(id){
    var req = requestById(id);
    if(!req) return;
    if(pendingRequest) discardPending();
    activeRequestId = id;
    saveActivePointer(id);
    state.highlight = id;
    cancelConfirm = false;
    missingField = null;
    composeDirty = false;

    broadcastState();
    sendAction("compose", { requestId:id, section:"detail" });
    if(!hasHost) showSection("detail");
  }

  function handleReady(){
    var req = activeRequest();
    if(!req) return;

    /* shell v10: an explicit "Hazır" while the wizard draft is still pending
       commits it first — but only once its fields pass the normal ready
       validation, so an incomplete draft never enters the list. */
    var missing = core && core.requests && core.requests.missing ? core.requests.missing(req) : [];
    if(pendingRequest && !missing.length){
      req = commitPending();
      if(!req) return;
    }
    if(missing.length){
      missingField = missing[0].key;
      if(state.section === "detail"){
        /* shell v6: the combined section owns every required field */
        renderFlyout("detail");
        var focusSel = missingField === "title" ? "#rl-title-input" : "#rl-desc-input";
        setTimeout(function(){
          var input = document.querySelector(focusSel);
          if(input && !input.disabled){
            try{ input.focus(); }catch(err){ /* ignore */ }
          }
        }, 40);
        toast(t("Başlık ve açıklama zorunludur."), "error");
        return;
      }
      var section = missingField === "description" ? "desc" : "page";
      if(section === "page" && !templateFor(req.type).page) section = "desc";
      if(state.section === section){
        renderFlyout(section);
      }else{
        sendAction("goto", { section:section, focus:"#rl-desc-input" });
      }
      toast(t("Başlık ve açıklama zorunludur."), "error");
      return;
    }

    missingField = null;
    cancelConfirm = false;
    core.requests.update(req, { confirmed:true });
    state.highlight = req.id;
    activeRequestId = null;
    saveActivePointer(null);
    composeDirty = false;
    var saved = flushSave();
    broadcastState();
    if(saved) toast(t("Kaydedildi"));
    /* v12: after ready, show every request again (filters/archive tab may
       have been left on an empty view). */
    listFilter = { q:"", type:"all", status:"all" };
    archiveTab = "list";
    openRowMenuId = null;
    listDeleteId = null;
    sendAction("idle", { openList:true, highlightId:req.id });
  }

  function handleCancel(){
    var req = activeRequest();
    if(!req){
      sendAction("idle", { close:true });
      return;
    }

    /* shell v10 §9: "Vazgeç" discards the pending draft and its media; it was
       never in the list, so no confirmation/save-as-draft step applies. */
    if(pendingRequest){
      discardPending();
      sendAction("idle", { close:true });
      return;
    }

    if(!hasContent(req)){
      deleteMediaFor(req).then(function(){
        removeActiveRequest(req, false);
        toast(t("İstek silindi."));
        sendAction("idle", { close:true });
      });
      return;
    }

    cancelConfirm = true;
    if(state.section === "page" || state.section === "desc" || state.section === "detail"){
      renderFlyout(state.section);
    }else{
      sendAction("goto", { section:"desc" });
    }
  }

  function unlockRequest(){
    var req = activeRequest();
    if(!req) return;
    core.requests.update(req, { confirmed:false });
    missingField = null;
    cancelConfirm = false;
    markDirty(0);
    toast(lx("revoked"));
    renderFlyout(state.section || "desc");
  }

  function saveSection(){
    /* shell v10 §8/§9: while the wizard draft is pending, Page is only a
       step transition (no save/toast) and the final Desc "Kaydet" commits the
       in-memory request, then opens the combined detail view. */
    if(pendingRequest){
      if(state.section === "page"){
        sendAction("goto", { section:"desc" });
        if(!hasHost) showSection("desc");
        return;
      }
      var created = commitPending();
      if(!created) return;
      toast(t("Kaydedildi"));
      sendAction("goto", { section:"detail" });
      if(!hasHost) showSection("detail");
      return;
    }

    if(!flushSave()){
      toast(lx("storageWriteFailed"), "error");
      return;
    }
    composeDirty = false;
    /* shell v8: saving Page keeps the flyout open and moves straight to
       Description; shell v10: the transition itself never toasts. */
    if(role === "flyout" && state.section === "page"){
      sendAction("goto", { section:"desc" });
      if(!hasHost) showSection("desc");
      return;
    }
    toast(t("Kaydedildi"));
    requestClose();
  }

  function mediaReferencedElsewhere(mediaId, exceptRequestId){
    return (app && Array.isArray(app.requests) ? app.requests : []).some(function(item){
      if(!item || item.id === exceptRequestId) return false;
      return (item.images || []).some(function(img){ return img.id === mediaId; }) ||
        (item.attachments || []).some(function(att){ return att.id === mediaId; });
    });
  }

  function deleteMediaFor(req){
    if(!req || !core || !core.storage) return Promise.resolve();
    var jobs = [];
    (req.images || []).forEach(function(img){
      if(core.storage.deleteImage && !mediaReferencedElsewhere(img.id, req.id)){
        jobs.push(Promise.resolve().then(function(){ return core.storage.deleteImage(img.id); }).catch(function(){}));
      }
    });
    (req.attachments || []).forEach(function(att){
      if(core.storage.deleteFile && !mediaReferencedElsewhere(att.id, req.id)){
        jobs.push(Promise.resolve().then(function(){ return core.storage.deleteFile(att.id); }).catch(function(){}));
      }
    });
    return Promise.all(jobs);
  }

  function removeActiveRequest(req, deleteMedia){
    if(!req) return;
    if(core && core.requests && core.requests.remove){
      core.requests.remove(app.requests, req.id);
    }else if(app){
      var index = app.requests.findIndex(function(item){ return item.id === req.id; });
      if(index >= 0) app.requests.splice(index, 1);
    }
    if(deleteMedia) deleteMediaFor(req);
    activeRequestId = null;
    saveActivePointer(null);
    cancelConfirm = false;
    missingField = null;
    state.highlight = null;
    flushSave();
    broadcastState();
  }

  function saveDraftAndClose(){
    var req = activeRequest();
    if(!req) return;
    var snapshot = makeDraftSnapshot(req);
    var done = function(){
      removeActiveRequest(req, false);
      toast(lx("draftSaved"));
      sendAction("idle", { close:true });
    };
    if(core && core.storage && core.storage.putCollection){
      core.storage.putCollection("drafts", snapshot).then(done).catch(done);
    }else{
      done();
    }
  }

  function deleteRequestAndClose(){
    var req = activeRequest();
    if(!req) return;
    if(pendingRequest){
      discardPending();
      sendAction("idle", { close:true });
      return;
    }
    deleteMediaFor(req).then(function(){
      removeActiveRequest(req, false);
      toast(t("İstek silindi."));
      sendAction("idle", { close:true });
    });
  }

  function makeDraftSnapshot(req){
    var savedAt = core && core.util && core.util.nowISO ? core.util.nowISO() : new Date().toISOString();
    var clock = core && core.util && core.util.formatClock ? core.util.formatClock(savedAt) : savedAt;
    var serialized = core && core.requests && core.requests.serialize ? core.requests.serialize(req) : req;
    var signature = core && core.requests && core.requests.signature ? core.requests.signature(app.requests) : "";
    return {
      id: "drf_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      kind: "draft",
      savedAt: savedAt,
      name: (app.project || "Projem") + " · " + clock,
      project: app.project,
      ledgerId: app.ledgerId,
      requestCount: 1,
      imageCount: (req.images || []).length,
      fileCount: (req.attachments || []).length,
      signature: signature,
      complete: statusOf(req) === "ready",
      requests: [serialized],
      markdown: "",
      reason: "",
      fileName: "",
      rootFolder: "",
      writeError: ""
    };
  }

  /* ---------- list row actions ---------- */

  function toggleRowMenu(id){
    if(!id) return;
    openRowMenuId = openRowMenuId === id ? null : id;
    listDeleteId = null;
    refreshList();
  }

  function moveRequestRow(id, delta){
    if(!app || !core || !core.requests || !core.requests.move) return;
    var req = requestById(id);
    if(!req) return;
    core.requests.move(app.requests, id, delta);
    flushSave();
    refreshList();
  }

  function duplicateRequestRow(id){
    if(!app || !core || !core.requests || !core.requests.duplicate) return;
    var source = requestById(id);
    if(!source) return;
    var copy = core.requests.duplicate(source, app.requests);
    if(!copy) return;
    var index = app.requests.indexOf(source);
    app.requests.splice(index + 1, 0, copy);
    state.highlight = copy.id;
    openRowMenuId = null;
    flushSave();
    broadcastState();
    refreshList();
    toast(lx("duplicated"));
  }

  function openDeleteConfirmRow(id){
    if(!id) return;
    listDeleteId = id;
    openRowMenuId = null;
    refreshList();
  }

  function cancelDeleteRow(){
    listDeleteId = null;
    refreshList();
  }

  function confirmDeleteRow(id){
    var req = requestById(id);
    if(!req || !app) return;
    deleteRequestMedia(req).then(function(){
      if(core && core.requests && core.requests.remove){
        core.requests.remove(app.requests, id);
      }else{
        var index = app.requests.findIndex(function(item){ return item.id === id; });
        if(index >= 0) app.requests.splice(index, 1);
      }
      if(activeRequestId === id){
        activeRequestId = null;
        saveActivePointer(null);
      }
      if(state.highlight === id) state.highlight = null;
      listDeleteId = null;
      openRowMenuId = null;
      flushSave();
      broadcastState();
      refreshList();
      toast(t("İstek silindi."));
    });
  }

  /* remove a request's media unless a stored snapshot (records/drafts/history)
     still references it */
  function deleteRequestMedia(req){
    if(!req) return Promise.resolve();
    var imageIds = (req.images || []).map(function(img){ return img.id; }).filter(Boolean);
    var fileIds = (req.attachments || []).map(function(att){ return att.id; }).filter(Boolean);
    if(!imageIds.length && !fileIds.length) return Promise.resolve();
    if(!core || !core.storage || !core.storage.listCollection) return deleteMediaFor(req);

    var kinds = ["records", "drafts", "history"];
    var loads = kinds.map(function(kind){
      return Promise.resolve()
        .then(function(){ return core.storage.listCollection(kind); })
        .catch(function(){ return []; });
    });

    return Promise.all(loads).then(function(lists){
      var used = {};
      lists.forEach(function(list){
        (list || []).forEach(function(snapshot){
          (snapshot && snapshot.requests ? snapshot.requests : []).forEach(function(item){
            (item.images || []).forEach(function(img){ if(img && img.id) used[img.id] = true; });
            (item.attachments || []).forEach(function(att){ if(att && att.id) used[att.id] = true; });
          });
        });
      });
      var jobs = [];
      imageIds.forEach(function(id){
        if(used[id] || !core.storage.deleteImage) return;
        jobs.push(Promise.resolve().then(function(){ return core.storage.deleteImage(id); }).catch(function(){}));
      });
      fileIds.forEach(function(id){
        if(used[id] || !core.storage.deleteFile) return;
        jobs.push(Promise.resolve().then(function(){ return core.storage.deleteFile(id); }).catch(function(){}));
      });
      return Promise.all(jobs);
    });
  }

  function clearListFilters(){
    listFilter = { q:"", type:"all", status:"all" };
    var input = document.getElementById("rl-search");
    if(input) input.value = "";
    var select = document.getElementById("rl-status-filter");
    if(select){
      select.value = "all";
      syncSelectUI(select);
    }
    refreshList();
  }

  function jumpToIncomplete(){
    if(!app || !app.requests.length) return;
    var next = null;
    for(var i = 0; i < app.requests.length; i++){
      if(statusOf(app.requests[i]) !== "ready"){ next = app.requests[i]; break; }
    }
    if(!next){
      toast(lx("allReady"));
      return;
    }
    selectRequest(next.id);
  }

  /* ---------- ledger snapshots (records / drafts) ---------- */

  function buildLedgerSnapshot(kind){
    var isRecord = kind === "record";
    var requests = app.requests.map(function(req){
      return core && core.requests && core.requests.serialize ? core.requests.serialize(req) : req;
    });
    var savedAt = core && core.util && core.util.nowISO ? core.util.nowISO() : new Date().toISOString();
    var clock = core && core.util && core.util.formatClock ? core.util.formatClock(savedAt) : savedAt;
    var imageCount = requests.reduce(function(sum, req){ return sum + (req.images || []).length; }, 0);
    var fileCount = requests.reduce(function(sum, req){ return sum + (req.attachments || []).length; }, 0);
    var signature = core && core.requests && core.requests.signature ? core.requests.signature(app.requests) : "";
    var complete = app.requests.every(function(req){ return statusOf(req) === "ready"; });

    var snapshot = {
      id: (isRecord ? "rec_" : "drf_") + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      kind: kind,
      savedAt: savedAt,
      name: (app.project || "Projem") + " · " + clock,
      project: app.project,
      ledgerId: app.ledgerId,
      requestCount: requests.length,
      imageCount: imageCount,
      fileCount: fileCount,
      signature: signature,
      complete: complete,
      requests: requests,
      markdown: "",
      reason: "",
      fileName: "",
      rootFolder: "",
      writeError: ""
    };
    if(isRecord) snapshot.exported = false;

    var built = "";
    if(core && core.markdown && core.markdown.build){
      built = Promise.resolve()
        .then(function(){
          return core.markdown.build({
            requests: requests,
            project: app.project,
            lang: state.lang,
            mode: "none",
            includeSummary: true,
            planning: null,
            agents: app.agents
          });
        })
        .catch(function(){ return ""; });
    }else{
      built = Promise.resolve("");
    }

    return Promise.resolve(built).then(function(markdown){
      snapshot.markdown = markdown || "";
      return snapshot;
    });
  }

  function buildRecordSnapshot(){
    return buildLedgerSnapshot("record");
  }

  function currentSignature(){
    if(core && core.requests && core.requests.signature){
      try{ return core.requests.signature(app.requests); }catch(err){ /* ignore */ }
    }
    return "";
  }

  function recordMatchesLedger(record, signature){
    if(!record) return false;
    if(record.ledgerId && app && app.ledgerId && record.ledgerId === app.ledgerId) return true;
    return !record.ledgerId && !!signature && record.signature === signature;
  }

  function findRecordForLedger(){
    var signature = currentSignature();
    for(var i = 0; i < archiveData.records.length; i++){
      if(recordMatchesLedger(archiveData.records[i], signature)) return archiveData.records[i];
    }
    return null;
  }

  function isLedgerSaved(){
    var signature = currentSignature();
    if(!signature) return false;
    var i;
    for(i = 0; i < archiveData.records.length; i++){
      if(archiveData.records[i].signature === signature) return true;
    }
    for(i = 0; i < archiveData.history.length; i++){
      if(archiveData.history[i].signature === signature) return true;
    }
    return false;
  }

  function flashSaveRecordButton(){
    var btn = document.getElementById("rl-save-record");
    if(!btn) return;
    if(listSaveTimer){ clearTimeout(listSaveTimer); listSaveTimer = null; }
    btn.textContent = t("Kaydedildi");
    btn.setAttribute("data-saved", "true");
    listSaveTimer = setTimeout(function(){
      listSaveTimer = null;
      var node = document.getElementById("rl-save-record");
      if(!node) return;
      node.textContent = t("Kaydet");
      node.removeAttribute("data-saved");
    }, 3000);
  }

  function saveRecordSnapshot(){
    if(storageBlocked()){
      toast(lx("storageUnavailable"), "error");
      return;
    }
    if(!app || !app.requests.length){
      toast(lx("noRequestsToSave"), "error");
      return;
    }
    if(!core || !core.storage || !core.storage.putCollection){
      toast(lx("recordFailed"), "error");
      return;
    }
    loadArchive().then(function(){
      return buildLedgerSnapshot("record");
    }).then(function(snapshot){
      var existing = findRecordForLedger();
      if(existing){
        duplicatePrompt = { existing: existing, snapshot: snapshot };
        archiveDelete = null;
        archiveClear = null;
        archiveRenameId = null;
        syncDuplicatePrompt();
        if(els.body) els.body.scrollTop = 0;
        updateScrollAffordance();
        return null;
      }
      return writeRecordSnapshot(snapshot, null);
    }).catch(function(){
      toast(lx("recordFailed"), "error");
    });
  }

  function writeRecordSnapshot(snapshot, existing){
    if(existing){
      snapshot.id = existing.id;
      if(existing.fileName) snapshot.fileName = existing.fileName;
      if(existing.rootFolder) snapshot.rootFolder = existing.rootFolder;
    }
    return Promise.resolve()
      .then(function(){ return core.storage.putCollection("records", snapshot); })
      .then(function(){
        var index = -1;
        if(existing){
          for(var i = 0; i < archiveData.records.length; i++){
            if(archiveData.records[i].id === existing.id){ index = i; break; }
          }
        }
        if(index >= 0) archiveData.records[index] = snapshot;
        else archiveData.records.push(snapshot);
        sortArchive("records");
        duplicatePrompt = null;
        archiveScroll[archiveTab] = els.body ? els.body.scrollTop : 0;
        archiveTab = "records";
        toast(existing ? lx("recordUpdated") : t("Kayıt oluşturuldu."));
        flashSaveRecordButton();
        refreshArchiveViews();
        applyArchiveTab();
        if(els.body) els.body.scrollTop = archiveScroll.records || 0;
        broadcastState();
        return snapshot;
      });
  }

  function duplicateOverwrite(){
    var pending = duplicatePrompt;
    if(!pending) return;
    duplicatePrompt = null;
    syncDuplicatePrompt();
    writeRecordSnapshot(pending.snapshot, pending.existing).catch(function(){
      toast(lx("recordFailed"), "error");
    });
  }

  function duplicateCreateNew(){
    var pending = duplicatePrompt;
    if(!pending) return;
    duplicatePrompt = null;
    syncDuplicatePrompt();
    var nextLedger = newLedgerId();
    app.ledgerId = nextLedger;
    pending.snapshot.ledgerId = nextLedger;
    flushSave();
    writeRecordSnapshot(pending.snapshot, null).catch(function(){
      toast(lx("recordFailed"), "error");
    });
  }
