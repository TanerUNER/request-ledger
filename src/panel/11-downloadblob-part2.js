  function downloadBlob(blob, filename){
    return new Promise(function(resolve){
      var url = null;
      try{ url = URL.createObjectURL(blob); }catch(err){ resolve(false); return; }
      var revoke = function(){ try{ URL.revokeObjectURL(url); }catch(err){ /* ignore */ } };

      /* Chrome ignores DownloadOptions.filename for blob URLs in recent builds
         (verified 157: the file lands as <uuid>.md). The named anchor keeps the
         export filename and is the documented fallback; the extension API path
         stays for DOM-free contexts. */
      if(anchorDownload(url, filename)){
        setTimeout(revoke, 6000);
        resolve(true);
        return;
      }

      try{
        if(typeof chrome !== "undefined" && chrome.downloads && typeof chrome.downloads.download === "function"){
          chrome.downloads.download({ url:url, filename:filename, saveAs:false }, function(){
            try{ if(chrome.runtime && chrome.runtime.lastError){ /* consumed */ } }catch(err){ /* ignore */ }
            setTimeout(revoke, 15000);
            resolve(true);
          });
          return;
        }
      }catch(err){ /* fall through */ }

      setTimeout(revoke, 6000);
      resolve(false);
    });
  }

  async function markRecordsExported(signature){
    if(!core || !core.storage || !core.storage.listCollection) return;
    var list = [];
    try{ list = await core.storage.listCollection("records"); }catch(err){ return; }
    list = list || [];
    var ledgerId = app ? app.ledgerId : "";
    for(var i = 0; i < list.length; i++){
      var record = list[i];
      if(!record) continue;
      var sameLedger = !!(record.ledgerId && ledgerId && record.ledgerId === ledgerId);
      var sameLegacy = !record.ledgerId && !!signature && record.signature === signature;
      if((sameLedger || sameLegacy) && !record.exported){
        record.exported = true;
        try{ await core.storage.putCollection("records", record); }catch(err){ /* keep exporting */ }
      }
    }
    archiveData.records = list.map(function(item){ return ensureArchiveItem("records", item); });
    sortArchive("records");
    updateArchiveTabCounts();
  }

  async function referencedMediaIds(){
    var ids = {};
    if(!core || !core.storage || !core.storage.listCollection) return ids;
    var kinds = ["records", "drafts", "history"];
    for(var k = 0; k < kinds.length; k++){
      var list = [];
      try{ list = await core.storage.listCollection(kinds[k]); }catch(err){ list = []; }
      (list || []).forEach(function(item){
        (item && Array.isArray(item.requests) ? item.requests : []).forEach(function(req){
          (req.images || []).forEach(function(img){ if(img && img.id) ids[img.id] = true; });
          (req.attachments || []).forEach(function(att){ if(att && att.id) ids[att.id] = true; });
        });
      });
    }
    return ids;
  }

  function clearExportedRequests(){
    exportCleanup = null;
    var imageIds = [];
    var fileIds = [];
    (app.requests || []).forEach(function(req){
      (req.images || []).forEach(function(img){ imageIds.push(img.id); });
      (req.attachments || []).forEach(function(att){ fileIds.push(att.id); });
    });
    app.requests = [];
    /* Phase 2b: clearing the ledger keeps the project and its registry row. */
    app.ledgerId = newLedgerId();
    activeRequestId = null;
    state.highlight = null;
    saveActivePointer(null);
    cancelConfirm = false;
    missingField = null;
    flushSave();
    broadcastState();
    updateDockBadges();
    renderFlyout("list");
    toast(lx("ledgerCleared"));

    referencedMediaIds().then(function(referenced){
      imageIds.forEach(function(id){
        if(referenced[id] || !core.storage.deleteImage) return;
        Promise.resolve().then(function(){ return core.storage.deleteImage(id); }).catch(function(){});
      });
      fileIds.forEach(function(id){
        if(referenced[id] || !core.storage.deleteFile) return;
        Promise.resolve().then(function(){ return core.storage.deleteFile(id); }).catch(function(){});
      });
    }).catch(function(){ /* media cleanup is best-effort */ });
  }

  async function runExport(){
    if(!exportWizard || exportWizard.busy) return;
    var missing = planningValidation();
    if(missing){
      toast(missing, "error");
      syncPlanningUI();
      return;
    }
    if(!core || !core.markdown || !core.zip || !core.storage || !core.util){
      toast(lx("exportFailed"), "error");
      return;
    }

    exportWizard.busy = true;
    var runBtn = document.getElementById("rl-exp-run");
    if(runBtn){
      runBtn.disabled = true;
      runBtn.textContent = lx("preparing");
    }

    var planning = planningPayload();
    var mode = exportWizard.format === "embedded" ? "embedded" : "zip";
    var includeSummary = exportWizard.includeSummary !== false;
    var projectBase = core && core.util && core.util.safeFileBase
      ? core.util.safeFileBase(app && app.project ? app.project : "Projem")
      : "projem";
    var baseName = projectBase + "-" + core.util.formatStamp();
    var markdownName = baseName + ".md";
    var zipName = baseName + ".zip";
    var media = {
      getImageBlob: function(id){
        return Promise.resolve()
          .then(function(){ return core.storage.getImage(id); })
          .then(function(rec){ return rec && rec.blob ? rec.blob : null; })
          .catch(function(){ return null; });
      },
      getFileBlob: function(id){
        return Promise.resolve()
          .then(function(){ return core.storage.getFile(id); })
          .then(function(rec){ return rec && rec.blob ? rec.blob : null; })
          .catch(function(){ return null; });
      }
    };

    try{
      var fileName = markdownName;
      var historyFormat = "md";
      var archiveName = "";

      if(mode === "zip"){
        var mediaFiles = await buildExportMedia(app.requests);
        var hasZip = mediaFiles.length > 0;
        historyFormat = hasZip ? "zip" : "md";
        archiveName = hasZip ? zipName : "";
        var markdown = await core.markdown.build({
          requests: app.requests,
          project: app.project,
          lang: state.lang,
          mode: "zip",
          includeSummary: includeSummary,
          planning: planning,
          archiveName: archiveName,
          agents: app.agents
        });
        await downloadBlob(new Blob([core.util.utf8Bytes(markdown, true)], { type:"text/markdown;charset=utf-8" }), markdownName);
        if(hasZip){
          await downloadBlob(core.zip.create(mediaFiles), zipName);
          fileName = markdownName + " + " + zipName;
        }
      }else{
        var embedded = await core.markdown.build({
          requests: app.requests,
          project: app.project,
          lang: state.lang,
          mode: "embedded",
          includeSummary: includeSummary,
          planning: planning,
          archiveName: "",
          agents: app.agents,
          media: media
        });
        await downloadBlob(new Blob([core.util.utf8Bytes(embedded, true)], { type:"text/markdown;charset=utf-8" }), markdownName);
        historyFormat = "embedded";
        fileName = markdownName;
      }

      var historyMarkdown = await core.markdown.build({
        requests: app.requests,
        project: app.project,
        lang: state.lang,
        mode: "none",
        includeSummary: includeSummary,
        planning: planning,
        archiveName: archiveName,
        agents: app.agents
      });

      var signature = currentSignature();
      var snapshot = app.requests.map(function(req){
        return core.requests && core.requests.serialize ? core.requests.serialize(req) : req;
      });
      var totals = exportTotals();
      var exportedAt = core.util.nowISO();

      await core.storage.addHistory({
        id: "hist_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
        exportedAt: exportedAt,
        project: app.project,
        format: historyFormat,
        fileName: fileName,
        target: t("İndirilenler"),
        requestCount: snapshot.length,
        imageCount: totals.images,
        fileCount: totals.files,
        signature: signature,
        requests: snapshot,
        markdown: historyMarkdown
      });

      app.lastExport = {
        mode: mode,
        includeSummary: includeSummary,
        planning: planning,
        savedAt: exportedAt
      };
      flushSave();
      await markRecordsExported(signature);
      archiveData.loaded = false;
      archiveData.loading = null;
      await loadArchive().catch(function(){});

      exportWizard = null;
      exportCleanup = { fileName: fileName };
      toast(lx("downloaded", { name: fileName }));
      renderFlyout("list");
    }catch(err){
      console.error(err);
      var wasInstant = !!(exportWizard && exportWizard.instant);
      if(exportWizard) exportWizard.busy = false;
      if(wasInstant){
        exportWizard = null;
        resetPlanningState();
        if(role === "flyout" && state.section === "list") renderFlyout("list");
      }
      if(runBtn){
        runBtn.disabled = false;
        runBtn.textContent = t("Dışa Aktar");
      }
      toast(lx("exportFailed"), "error");
      if(!wasInstant) syncPlanningUI();
    }
  }
