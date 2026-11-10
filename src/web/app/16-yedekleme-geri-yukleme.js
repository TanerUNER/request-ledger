  /* ============================================================
     Yedekleme / geri yükleme
     ============================================================ */
  function backupMediaFileName(kind, item){
    const safeId = String(item.id || "medya").replace(/[^A-Za-z0-9_-]/g, "-");
    if(kind === "image"){
      const ext = String(item.ext || extFromMime(item.type) || "webp").replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "") || "webp";
      return "gorseller/" + safeId + "." + ext;
    }
    const ext = String(item.ext || extFromFileName(item.name) || "dat").replace(/[^a-z0-9]/gi, "") || "dat";
    return "dosyalar/" + safeId + "-" + safeFileBase(item.name) + "." + ext;
  }
  async function buildBackupWithFiles(){
    return buildBackupV4(true);
  }
  async function downloadBackupZip(forceDownload){
    try{
      if(activeProjectId) saveNow();
      const useTarget = forceDownload === true ? false : await prepareTargetFolder(false);
      const data = await buildBackupWithFiles();
      const files = [{ name: "yedek.json", data: utf8Bytes(JSON.stringify(data.backup, null, 2)) }];
      for(let i = 0; i < data.images.length; i++){
        const item = data.images[i];
        let rec = null;
        try{ rec = await idbGet(item.img.id); }catch(err){}
        if(rec && rec.blob){
          files.push({ name: item.file, data: new Uint8Array(await rec.blob.arrayBuffer()) });
        }
      }
      for(let i = 0; i < data.attachments.length; i++){
        const item = data.attachments[i];
        let rec = null;
        try{ rec = await idbFileGet(item.att.id); }catch(err){}
        if(rec && rec.blob){
          files.push({ name: item.file, data: new Uint8Array(await rec.blob.arrayBuffer()) });
        }
      }
      const zip = makeZip(files);
      const fileName = "istek-defteri-yedek-" + formatStamp() + ".zip";
      /* Server mode: the full backup also lands in backups/ on disk. */
      if(typeof serverDiskEnabled === "function" && serverDiskEnabled()){
        const stored = await serverStoreBackup(zip, fileName).catch(function(){ return null; });
        if(stored){
          if(typeof refreshServerDataLists === "function") refreshServerDataLists();
        }else{
          showToast(translateString("Yedek sunucuya yazılamadı; indirilen dosyayı sakla."), "error");
        }
      }
      await saveOutput(zip, fileName, useTarget);
      return true;
    }catch(err){
      console.error(err);
      showToast(translateString("Yedek oluşturulamadı."), "error");
      return false;
    }
  }
  async function restoreRequestMedia(req, entries, stats, projectId){
    const scopeId = projectId || activeProjectId || "";
    const keptImages = [];
    for(let j = 0; j < req.images.length; j++){
      const img = req.images[j];
      const file = img.file || imageFileName(req, j, img);
      const bytes = entries && entries[file] ? entries[file] : null;
      if(bytes){
        try{
          const type = img.type || "image/webp";
          const blob = new Blob([bytes], { type: type });
          await idbPut({ id: img.id, blob: blob, type: type, projectId: scopeId });
          keptImages.push({
            id: img.id,
            name: img.name,
            w: img.w,
            h: img.h,
            size: img.size || bytes.length,
            type: type,
            ext: img.ext || extFromMime(type),
            file: ""
          });
        }catch(err){
          stats.missingImages++;
        }
      }else{
        stats.missingImages++;
      }
    }
    req.images = keptImages;
    const keptFiles = [];
    for(let j = 0; j < req.attachments.length; j++){
      const att = req.attachments[j];
      const file = att.file || attachmentFileName(req, j, att);
      const bytes = entries && entries[file] ? entries[file] : null;
      if(bytes){
        try{
          const type = att.type || "application/octet-stream";
          const blob = new Blob([bytes], { type: type });
          await idbFilePut({ id: att.id, blob: blob, type: type, projectId: scopeId });
          keptFiles.push({
            id: att.id,
            name: att.name,
            size: att.size || bytes.length,
            type: type,
            ext: att.ext || extFromFileName(att.name),
            file: ""
          });
        }catch(err){
          stats.missingFiles++;
        }
      }else{
        stats.missingFiles++;
      }
    }
    req.attachments = keptFiles;
  }
  async function applyRestore(data, entries){
    const project = String(data.project || "").trim().slice(0, 60) || importedProjectName(data.language);
    const stats = { missingImages: 0, missingFiles: 0 };
    // Media blobs are written by restoreRequestMedia below and are never wiped up front.
    // Stale blobs are recoverable; losing the user's media is not.
    clearImageURLs();
    const restored = [];
    for(let i = 0; i < data.requests.length; i++){
      const req = normalizeRequest(data.requests[i], i);
      await restoreRequestMedia(req, entries, stats, activeProjectId);
      if(!isAutoValid(req)) req.confirmed = false;
      restored.push(req);
    }

    let restoredRecordCount = 0;
    const sourceRecords = Array.isArray(data.records) ? data.records : null;
    if(sourceRecords){
      const restoredRecords = [];
      for(let i = 0; i < sourceRecords.length; i++){
        const raw = sourceRecords[i] || {};
        const record = JSON.parse(JSON.stringify(raw));
        record.id = String(raw.id || ("rec_restored_" + Date.now() + "_" + i));
        record.kind = "record";
        record.projectId = activeProjectId || "";
        record.ledgerId = typeof raw.ledgerId === "string" && raw.ledgerId ? raw.ledgerId : newLedgerId();
        record.project = String(raw.project || project).trim().slice(0, 60) || project;
        record.requests = (Array.isArray(raw.requests) ? raw.requests : []).map(function(item, index){
          return normalizeRequest(item, index);
        });
        for(const req of record.requests){
          await restoreRequestMedia(req, entries, stats, activeProjectId);
          if(!isAutoValid(req)) req.confirmed = false;
        }
        record.savedAt = raw.savedAt || nowISO();
        record.name = raw.name || (record.project + " · " + formatClock(record.savedAt));
        record.requestCount = record.requests.length;
        record.imageCount = record.requests.reduce(function(sum, req){ return sum + req.images.length; }, 0);
        record.fileCount = record.requests.reduce(function(sum, req){
          return sum + (typeTemplate(req.type).attachments ? req.attachments.length : 0);
        }, 0);
        record.signature = requestsSignature(record.requests);
        record.complete = record.requests.every(function(req){ return requestStatus(req) === "ready"; });
        record.exported = Boolean(raw.exported);
        record.reason = raw.reason || "";
        record.markdown = raw.markdown || "";
        record.fileName = "";
        record.rootFolder = "";
        record.writeError = "";
        restoredRecords.push(record);
      }
      for(const oldRecord of records){ await deleteRootSnapshot("record", oldRecord); }
      try{ await idbCollectionClear(RECORDS_STORE, activeProjectId); }catch(err){}
      for(const record of restoredRecords){
        try{ await idbCollectionPut(RECORDS_STORE, record); }catch(err){}
      }
      records = restoredRecords;
      restoredRecordCount = records.length;
      sortSnapshots();
      if(rootFolderHandle){
        const rootReady = await ensureRootPermission();
        if(rootReady){
          for(const record of records){
            await writeRootSnapshot("record", record, record.fileName || undefined);
            try{ await idbCollectionPut(RECORDS_STORE, record); }catch(err){}
          }
        }
      }
      renderHistoryTree();
    }

    state.project = project;
    state.projectCreated = true;
    state.ledgerId = typeof data.ledgerId === "string" && data.ledgerId ? data.ledgerId : newLedgerId();
    if(Array.isArray(data.agents)){
      state.agents = data.agents.map(normalizeAgent);
      prunePlanningAgents();
      renderPlanningAgents();
    }
    if(data.language === "en" || data.language === "tr") state.language = data.language;
    if(["last","instant","default"].indexOf(data.exportBehavior) >= 0) state.exportBehavior = data.exportBehavior;
    state.lastExport = data.lastExport && typeof data.lastExport === "object" ? data.lastExport : null;
    state.requests = restored;
    state.updatedAt = nowISO();
    barDismissed = false;
    lastJumpId = null;
    resetFilters(false);
    saveNow();
    projectSnapshot = serializedLedger();
    archiveSelectedProjectId = activeProjectId;
    renderList();
    renderProjectGate();
    updateProjectLabels();
    refreshGlobal();
    applyLanguage(state.language);
    const isEn = state.language === "en";
    const missingParts = [];
    if(stats.missingImages) missingParts.push(stats.missingImages + (isEn ? (stats.missingImages === 1 ? " image" : " images") : " görsel"));
    if(stats.missingFiles) missingParts.push(stats.missingFiles + (isEn ? (stats.missingFiles === 1 ? " file" : " files") : " dosya"));
    let message = isEn
      ? restored.length + (restored.length === 1 ? " request restored." : " requests restored.")
      : restored.length + " talep geri yüklendi.";
    if(sourceRecords){
      message += " " + restoredRecordCount + (isEn ? (restoredRecordCount === 1 ? " record restored." : " records restored.") : " kayıt geri yüklendi.");
    }
    if(missingParts.length){
      message += " " + missingParts.join(isEn ? " and " : " ve ") + (isEn ? " could not be found." : " bulunamadı.");
    }
    showToast(message, missingParts.length ? "error" : "ok");
  }
  async function restoreBackupFile(file){
    if(!file) return;
    if(file.size > 512 * 1024 * 1024) throw new Error("Yedek dosyası çok büyük.");
    showToast("Yedek okunuyor…");
    let data = null;
    let entries = null;
    if(/\.zip$/i.test(file.name)){
      entries = await parseZipFile(file);
      if(!entries["yedek.json"]) throw new Error("ZIP içinde yedek.json bulunamadı.");
      data = JSON.parse(new TextDecoder("utf-8").decode(entries["yedek.json"]));
    }else{
      data = JSON.parse(await file.text());
    }
    if(!data || typeof data !== "object"){
      throw new Error("Geçersiz yedek dosyası.");
    }
    if(data.app && data.app !== "istek-defteri"){
      throw new Error("Bu dosya bir Request Ledger yedeği değil.");
    }
    const version = Number(data.version) || 1;
    if(version > 4){
      throw new Error("Yedek daha yeni bir sürümle oluşturulmuş.");
    }
    if(version === 4){
      requestRestoreV4(data, entries);
      return;
    }
    if(!activeProjectId){
      throw new Error("Önce bir proje aç.");
    }
    if(!Array.isArray(data.requests)){
      throw new Error("Geçersiz yedek dosyası.");
    }
    if(data.requests.length > 5000){
      throw new Error("Yedekte çok fazla talep var.");
    }
    if(Array.isArray(data.records) && data.records.length > 2000){
      throw new Error("Yedekte çok fazla kayıt var.");
    }
    if(Array.isArray(data.drafts) && data.drafts.length > 2000){
      throw new Error("Yedekte çok fazla taslak var.");
    }
    if(Array.isArray(data.agents) && data.agents.length > 200){
      throw new Error("Yedekte çok fazla ajan var.");
    }
    const count = data.requests.length;
    const recordCount = Array.isArray(data.records) ? data.records.length : null;
    const countText = recordCount === null
      ? count + " talep"
      : count + " talep ve " + recordCount + " kayıt";
    openConfirm({
      title: "Yedeği geri yükle",
      message: countText + " geri yüklenecek. Bu projedeki mevcut talepler" + (recordCount === null ? "" : " ve Kayıtlar") + " yedekteki verilerle değiştirilecek. Diğer projeler korunur. Devam etmek istiyor musun?",
      confirmLabel: "Geri yükle",
      danger: true,
      onConfirm: async function(){
        await applyRestore(data, entries);
        closeModal($("#backupModal"));
      }
    });
  }
  function snapshotReferencesMedia(id){
    const collections = [historyItems, records, drafts];
    for(const collection of collections){
      for(const snapshot of collection){
        for(const req of snapshot.requests || []){
          if((req.images || []).some(function(img){ return img.id === id; })) return true;
          if((req.attachments || []).some(function(att){ return att.id === id; })) return true;
        }
      }
    }
    return false;
  }
  function openClearRequestsConfirm(){
    if(!state.requests.length){
      showToast("Defterde temizlenecek istek yok.", "error");
      return;
    }
    const count = state.requests.length;
    openConfirm({
      title: "Temiz Defter",
      message: "Defterdeki " + count + " istek temizlenecek. Kayıtlar, Taslaklar ve Dışa Aktarılanlar korunur. Bu işlem geri alınamaz.",
      eyebrow: "Defter",
      confirmLabel: "Defteri Temizle",
      danger: true,
      onConfirm: clearCurrentRequests
    });
  }
  async function clearCurrentRequests(){
    const imageIds = [];
    const attachmentIds = [];
    state.requests.forEach(function(req){
      (req.images || []).forEach(function(img){ imageIds.push(img.id); });
      (req.attachments || []).forEach(function(att){ attachmentIds.push(att.id); });
    });
    state.requests = [];
    state.ledgerId = newLedgerId();
    clearImageURLs();
    stateDirtySinceExport = false;
    lastJumpId = null;
    activeRowId = null;
    lastExpandedId = null;
    barDismissed = false;
    resetFilters(false);
    saveNow();
    renderList();
    for(const id of imageIds){
      if(!snapshotReferencesMedia(id)){
        try{ await idbDelete(id); }catch(err){}
      }
    }
    for(const id of attachmentIds){
      if(!snapshotReferencesMedia(id)){
        try{ await idbFileDelete(id); }catch(err){}
      }
    }
    showToast("Defter temizlendi. Kayıtlar, Taslaklar ve Dışa Aktarılanlar korundu.");
  }
  /* Full reset: every live project (disk + browser) and every deleted-project
     archive goes away; backups/ and the UI config are kept. */
  async function performFullReset(){
    if(typeof serverDiskEnabled === "function" && serverDiskEnabled()){
      const result = await serverResetAll();
      if(!result || result.ok !== true){
        showToast(translateString("Sıfırlama tamamlanamadı; hiçbir şey silinmedi."), "error");
        return false;
      }
    }
    const registry = readRegistry();
    if(registry){
      for(const project of registry.projects){
        await deleteProjectData(project.id).catch(function(){});
      }
    }
    try{
      const keys = [];
      for(let i = 0; i < localStorage.length; i += 1){
        const key = localStorage.key(i);
        if(key === PROJECTS_KEY || key === STORAGE_KEY || key.indexOf(PROJECT_LEDGER_PREFIX) === 0) keys.push(key);
      }
      keys.forEach(function(key){ localStorage.removeItem(key); });
    }catch(err){ /* quota */ }
    return true;
  }

  function clearAllData(){
    openConfirm({
      title: "Tüm proje verileri sıfırlansın mı?",
      message: "Bütün projeler, silinen proje yedekleri ve tarayıcı önbelleği silinecek. Sunucudaki backups/ klasörü korunur. Önce tam bir yedek alman önerilir; geri yükleme yalnızca bu yedeklerden yapılabilir.",
      eyebrow: "Sıfırla",
      confirmLabel: "Yedek al ve sıfırla",
      altLabel: "Yedeksiz sıfırla",
      cancelLabel: "Vazgeç",
      danger: true,
      onConfirm: async function(){
        const ok = await downloadBackupZip(true);
        if(!ok){
          showToast(translateString("Yedek oluşturulamadı; sıfırlama iptal edildi."), "error");
          return;
        }
        if(await performFullReset()){
          showToast(translateString("Tüm proje verileri sıfırlandı. Yedekler korundu."));
          setTimeout(function(){ try{ window.location.reload(); }catch(err){ /* ignore */ } }, 900);
        }
      },
      onAlt: async function(){
        if(await performFullReset()){
          showToast(translateString("Tüm proje verileri sıfırlandı. Yedekler korundu."));
          setTimeout(function(){ try{ window.location.reload(); }catch(err){ /* ignore */ } }, 900);
        }
      }
    });
  }
