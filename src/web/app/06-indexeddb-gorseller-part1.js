  /* ============================================================
     IndexedDB / görseller
     ============================================================ */
  function openDB(){
    return new Promise(function(resolve, reject){
      if(!("indexedDB" in window)){ reject(new Error("IndexedDB yok")); return; }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function(){
        const db = request.result;
        if(!db.objectStoreNames.contains(IMG_STORE)){
          db.createObjectStore(IMG_STORE, { keyPath:"id" });
        }
        if(!db.objectStoreNames.contains(FILE_STORE)){
          db.createObjectStore(FILE_STORE, { keyPath:"id" });
        }
        if(!db.objectStoreNames.contains(SETTINGS_STORE)){
          db.createObjectStore(SETTINGS_STORE, { keyPath:"id" });
        }
        if(!db.objectStoreNames.contains(HISTORY_STORE)){
          db.createObjectStore(HISTORY_STORE, { keyPath:"id" });
        }
        if(!db.objectStoreNames.contains(RECORDS_STORE)){
          db.createObjectStore(RECORDS_STORE, { keyPath:"id" });
        }
        if(!db.objectStoreNames.contains(DRAFTS_STORE)){
          db.createObjectStore(DRAFTS_STORE, { keyPath:"id" });
        }
      };
      request.onsuccess = function(){ resolve(request.result); };
      request.onerror = function(){ reject(request.error || new Error("IndexedDB açılamadı")); };
      request.onblocked = function(){ reject(new Error("IndexedDB bloklu")); };
    });
  }
  /* Media rows are stamped with the active project on write. The existing
     idbPut/idbFilePut callers stay unchanged; an explicit projectId wins so
     backup restore can write another project's media. */
  function withProjectScope(record){
    const copy = Object.assign({}, record || {});
    if(!copy.projectId) copy.projectId = activeProjectId || "";
    return copy;
  }
  function idbPut(record){
    return new Promise(function(resolve, reject){
      if(!idb){ reject(new Error("IndexedDB kapalı")); return; }
      const tx = idb.transaction(IMG_STORE, "readwrite");
      tx.objectStore(IMG_STORE).put(withProjectScope(record));
      tx.oncomplete = function(){ resolve(); };
      tx.onerror = function(){ reject(tx.error || new Error("Görsel kaydedilemedi")); };
      tx.onabort = function(){ reject(tx.error || new Error("Görsel kaydedilemedi")); };
    });
  }
  function idbGet(id){
    return new Promise(function(resolve, reject){
      if(!idb){ resolve(null); return; }
      const tx = idb.transaction(IMG_STORE, "readonly");
      const request = tx.objectStore(IMG_STORE).get(id);
      request.onsuccess = function(){ resolve(request.result || null); };
      request.onerror = function(){ reject(request.error || new Error("Görsel okunamadı")); };
    });
  }
  function idbDelete(id){
    return new Promise(function(resolve, reject){
      if(!idb){ resolve(); return; }
      const tx = idb.transaction(IMG_STORE, "readwrite");
      tx.objectStore(IMG_STORE).delete(id);
      tx.oncomplete = function(){ resolve(); };
      tx.onerror = function(){ reject(tx.error || new Error("Görsel silinemedi")); };
    });
  }
  function idbClear(){
    return new Promise(function(resolve, reject){
      if(!idb){ resolve(); return; }
      const tx = idb.transaction(IMG_STORE, "readwrite");
      tx.objectStore(IMG_STORE).clear();
      tx.oncomplete = function(){ resolve(); };
      tx.onerror = function(){ reject(tx.error || new Error("Görseller temizlenemedi")); };
    });
  }
  function idbFilePut(record){
    return new Promise(function(resolve, reject){
      if(!idb){ reject(new Error("IndexedDB kapalı")); return; }
      const tx = idb.transaction(FILE_STORE, "readwrite");
      tx.objectStore(FILE_STORE).put(withProjectScope(record));
      tx.oncomplete = function(){ resolve(); };
      tx.onerror = function(){ reject(tx.error || new Error("Dosya kaydedilemedi")); };
      tx.onabort = function(){ reject(tx.error || new Error("Dosya kaydedilemedi")); };
    });
  }
  function idbFileGet(id){
    return new Promise(function(resolve, reject){
      if(!idb){ resolve(null); return; }
      const tx = idb.transaction(FILE_STORE, "readonly");
      const request = tx.objectStore(FILE_STORE).get(id);
      request.onsuccess = function(){ resolve(request.result || null); };
      request.onerror = function(){ reject(request.error || new Error("Dosya okunamadı")); };
    });
  }
  function idbFileDelete(id){
    return new Promise(function(resolve, reject){
      if(!idb){ resolve(); return; }
      const tx = idb.transaction(FILE_STORE, "readwrite");
      tx.objectStore(FILE_STORE).delete(id);
      tx.oncomplete = function(){ resolve(); };
      tx.onerror = function(){ reject(tx.error || new Error("Dosya silinemedi")); };
    });
  }
  function idbFilesClear(){
    return new Promise(function(resolve, reject){
      if(!idb){ resolve(); return; }
      const tx = idb.transaction(FILE_STORE, "readwrite");
      tx.objectStore(FILE_STORE).clear();
      tx.oncomplete = function(){ resolve(); };
      tx.onerror = function(){ reject(tx.error || new Error("Dosyalar temizlenemedi")); };
    });
  }
  function idbClearAll(){
    return Promise.all([idbClear(), idbFilesClear()]);
  }
  /* Per-project IndexedDB helpers. Version 5 keeps the existing schema; every
     row carries a projectId and project-scoped reads/deletes filter on it.
     Rows without a projectId belong to a Phase 1 install and are stamped by
     idbStampProject during startup. */
  function idbDeleteProjectRows(storeName, projectId){
    return new Promise(function(resolve, reject){
      if(!idb || !projectId){ resolve(); return; }
      const tx = idb.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const request = store.openCursor();
      request.onsuccess = function(){
        const cursor = request.result;
        if(!cursor) return;
        if(cursor.value && cursor.value.projectId === projectId){
          cursor.delete();
        }
        cursor.continue();
      };
      tx.oncomplete = function(){ resolve(); };
      tx.onerror = function(){ reject(tx.error || new Error("Proje kayıtları silinemedi")); };
      tx.onabort = function(){ reject(tx.error || new Error("Proje kayıtları silinemedi")); };
    });
  }
  function idbCountForProject(storeName, projectId){
    return new Promise(function(resolve){
      if(!idb || !projectId){ resolve(0); return; }
      let count = 0;
      try{
        const tx = idb.transaction(storeName, "readonly");
        const request = tx.objectStore(storeName).openCursor();
        request.onsuccess = function(){
          const cursor = request.result;
          if(!cursor) return;
          if(cursor.value && cursor.value.projectId === projectId) count++;
          cursor.continue();
        };
        tx.oncomplete = function(){ resolve(count); };
        request.onerror = function(){ resolve(count); };
        tx.onerror = function(){ resolve(count); };
        tx.onabort = function(){ resolve(count); };
      }catch(err){
        resolve(0);
      }
    });
  }
  function idbStampProject(storeName, projectId){
    return new Promise(function(resolve){
      if(!idb || !projectId){ resolve(0); return; }
      let stamped = 0;
      try{
        const tx = idb.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const request = store.openCursor();
        request.onsuccess = function(){
          const cursor = request.result;
          if(!cursor) return;
          const record = cursor.value;
          if(record && !record.projectId){
            record.projectId = projectId;
            cursor.update(record);
            stamped++;
          }
          cursor.continue();
        };
        tx.oncomplete = function(){ resolve(stamped); };
        tx.onerror = function(){ resolve(stamped); };
        tx.onabort = function(){ resolve(stamped); };
      }catch(err){
        resolve(0);
      }
    });
  }
  async function idbDeleteProjectMedia(projectId){
    await idbDeleteProjectRows(IMG_STORE, projectId).catch(function(){});
    await idbDeleteProjectRows(FILE_STORE, projectId).catch(function(){});
  }
  async function stampLegacyProjectScope(projectId){
    if(!idb || !projectId) return 0;
    let total = 0;
    for(const store of [IMG_STORE, FILE_STORE, HISTORY_STORE, RECORDS_STORE, DRAFTS_STORE]){
      total += await idbStampProject(store, projectId);
    }
    return total;
  }
  function idbSettingPut(record){
    return new Promise(function(resolve, reject){
      if(!idb){ reject(new Error("IndexedDB kapalı")); return; }
      const tx = idb.transaction(SETTINGS_STORE, "readwrite");
      tx.objectStore(SETTINGS_STORE).put(record);
      tx.oncomplete = function(){ resolve(); };
      tx.onerror = function(){ reject(tx.error || new Error("Ayar kaydedilemedi")); };
    });
  }
  function idbSettingGet(id){
    return new Promise(function(resolve, reject){
      if(!idb){ resolve(null); return; }
      const tx = idb.transaction(SETTINGS_STORE, "readonly");
      const request = tx.objectStore(SETTINGS_STORE).get(id);
      request.onsuccess = function(){ resolve(request.result || null); };
      request.onerror = function(){ reject(request.error || new Error("Ayar okunamadı")); };
    });
  }
  function idbSettingDelete(id){
    return new Promise(function(resolve, reject){
      if(!idb){ resolve(); return; }
      const tx = idb.transaction(SETTINGS_STORE, "readwrite");
      tx.objectStore(SETTINGS_STORE).delete(id);
      tx.oncomplete = function(){ resolve(); };
      tx.onerror = function(){ reject(tx.error || new Error("Ayar silinemedi")); };
    });
  }
  function idbHistoryPut(record){
    return new Promise(function(resolve, reject){
      if(!idb){ reject(new Error("IndexedDB kapalı")); return; }
      const tx = idb.transaction(HISTORY_STORE, "readwrite");
      tx.objectStore(HISTORY_STORE).put(withProjectScope(record));
      tx.oncomplete = function(){ resolve(); };
      tx.onerror = function(){ reject(tx.error || new Error("Arşiv kaydedilemedi")); };
    });
  }
  function idbHistoryGetAll(projectId){
    return new Promise(function(resolve, reject){
      if(!idb){ resolve([]); return; }
      const tx = idb.transaction(HISTORY_STORE, "readonly");
      const request = tx.objectStore(HISTORY_STORE).getAll();
      request.onsuccess = function(){
        const rows = request.result || [];
        resolve(projectId ? rows.filter(function(row){ return row && row.projectId === projectId; }) : rows);
      };
      request.onerror = function(){ reject(request.error || new Error("Arşiv okunamadı")); };
    });
  }
  function idbHistoryClear(projectId){
    if(projectId) return idbDeleteProjectRows(HISTORY_STORE, projectId);
    return new Promise(function(resolve, reject){
      if(!idb){ resolve(); return; }
      const tx = idb.transaction(HISTORY_STORE, "readwrite");
      tx.objectStore(HISTORY_STORE).clear();
      tx.oncomplete = function(){ resolve(); };
      tx.onerror = function(){ reject(tx.error || new Error("Arşiv temizlenemedi")); };
    });
  }
  function idbCollectionPut(store, record){
    return new Promise(function(resolve, reject){
      if(!idb){ reject(new Error("IndexedDB kapalı")); return; }
      const tx = idb.transaction(store, "readwrite");
      tx.objectStore(store).put(withProjectScope(record));
      tx.oncomplete = function(){ resolve(); };
      tx.onerror = function(){ reject(tx.error || new Error("Kayıt yazılamadı")); };
    });
  }
  function idbCollectionGetAll(store, projectId){
    return new Promise(function(resolve, reject){
      if(!idb){ resolve([]); return; }
      const tx = idb.transaction(store, "readonly");
      const request = tx.objectStore(store).getAll();
      request.onsuccess = function(){
        const rows = request.result || [];
        resolve(projectId ? rows.filter(function(row){ return row && row.projectId === projectId; }) : rows);
      };
      request.onerror = function(){ reject(request.error || new Error("Kayıtlar okunamadı")); };
    });
  }
  function idbCollectionClear(store, projectId){
    if(projectId) return idbDeleteProjectRows(store, projectId);
    return new Promise(function(resolve, reject){
      if(!idb){ resolve(); return; }
      const tx = idb.transaction(store, "readwrite");
      tx.objectStore(store).clear();
      tx.oncomplete = function(){ resolve(); };
      tx.onerror = function(){ reject(tx.error || new Error("Kayıtlar temizlenemedi")); };
    });
  }
  function idbCollectionDelete(store, id){
    return new Promise(function(resolve, reject){
      if(!idb){ resolve(); return; }
      const tx = idb.transaction(store, "readwrite");
      tx.objectStore(store).delete(id);
      tx.oncomplete = function(){ resolve(); };
      tx.onerror = function(){ reject(tx.error || new Error("Kayıt silinemedi")); };
    });
  }
  /* The project name is owned by the project gate / Settings now; picking an
     export folder only changes the export destination, never the project. */
  function refreshProjectLabels(persist){
    updateProjectLabels();
    if(persist) saveNow();
  }
  async function restoreTargetFolder(){
    if(!idb || !activeProjectId) return;
    try{
      let record = await idbSettingGet(targetFolderSettingId());
      /* The first project created by the legacy migration adopts the old
         single target handle once, then the handle lives under the project id. */
      if(!record && activeProjectId === migratedProjectId){
        const legacy = await idbSettingGet("targetFolder");
        if(legacy && legacy.handle){
          record = legacy;
          try{ await idbSettingPut({ id: targetFolderSettingId(), handle: legacy.handle }); }catch(err){ /* ignore */ }
        }
      }
      if(record && record.handle){
        targetFolderHandle = record.handle;
        try{
          const permission = await record.handle.queryPermission({ mode:"readwrite" });
          targetFolderNeedsPermission = permission !== "granted";
        }catch(err){
          targetFolderNeedsPermission = true;
        }
        if(record.handle.name) setProjectExportTarget(record.handle.name);
        updateTargetFolderUI();
        refreshProjectLabels(false);
      }
    }catch(err){
      console.warn("Hedef klasör geri yüklenemedi", err);
    }
  }
  function updateTargetFolderUI(){
    const button = $("#targetFolderBtn");
    const name = targetFolderHandle ? targetFolderHandle.name : "";
    if(button){
      button.classList.toggle("is-set", Boolean(name));
      const label = name
        ? "Dışa aktarım dizini: " + name + (targetFolderNeedsPermission ? " (izin gerekli)" : "") + " · değiştirmek için tıkla"
        : "Dışa aktarım dizinini seç";
      button.title = translateString(label);
      button.setAttribute("aria-label", translateString(label));
    }
    const targetName = $("#exportTargetName");
    const targetBtn = $("#exportTargetBtn");
    const targetClear = $("#exportTargetClear");
    const projectBtn = $("#projectBtn");
    if(projectBtn) projectBtn.classList.toggle("is-missing", !name);
    if(targetName) targetName.textContent = translateString(name ? name + (targetFolderNeedsPermission ? " · izin gerekli" : "") : "Seçilmedi");
    const exportDirLabel = $("#exportDirLabel");
    if(exportDirLabel) exportDirLabel.textContent = translateString(name ? name + (targetFolderNeedsPermission ? " · izin gerekli" : "") : "Dışa aktarım dizini seçilmedi");
    if(targetBtn) targetBtn.textContent = name ? translateString("Değiştir") : translateString("Klasör seç");
    if(targetClear) targetClear.hidden = !name;
    updateFolderSettingsUI();
  }
  async function chooseTargetFolder(){
    return chooseProjectTargetFolder(activeProjectId);
  }
  async function chooseProjectTargetFolder(projectId){
    if(!projectId){
      showToast("Önce bir proje aç.", "error");
      return false;
    }
    if(!window.showDirectoryPicker){
      showToast("Bu tarayıcı dışa aktarım dizini seçimini desteklemiyor. Dosyalar indirilecek.", "error");
      return false;
    }
    try{
      const handle = await window.showDirectoryPicker({ id:"istek-defteri-hedef", mode:"readwrite" });
      await idbSettingPut({ id: "targetFolder:" + projectId, handle: handle });
      setProjectExportTargetFor(projectId, handle.name);
      if(projectId === activeProjectId){
        targetFolderHandle = handle;
        targetFolderNeedsPermission = false;
        refreshProjectLabels(true);
        updateTargetFolderUI();
        refreshGlobal();
      }
      renderArchiveProjects();
      showToast("Dışa aktarım dizini: " + handle.name);
      return true;
    }catch(err){
      if(err && err.name === "AbortError") return false;
      console.error(err);
      showToast(folderPickerErrorMessage(err), "error");
      return false;
    }
  }
  async function clearTargetFolder(){
    targetFolderHandle = null;
    targetFolderNeedsPermission = false;
    setProjectExportTarget("");
    try{ await idbSettingDelete(targetFolderSettingId()); }catch(err){}
    refreshProjectLabels(true);
    updateTargetFolderUI();
    refreshGlobal();
    renderArchiveProjects();
    showToast("Dışa aktarım dizini kaldırıldı. Dosyalar indirilecek.");
  }
  async function clearProjectExportTarget(projectId){
    if(!projectId) return;
    if(projectId === activeProjectId){
      await clearTargetFolder();
      return;
    }
    try{ await idbSettingDelete("targetFolder:" + projectId); }catch(err){}
    setProjectExportTargetFor(projectId, "");
    renderArchiveProjects();
    showToast("Dışa aktarım dizini kaldırıldı. Dosyalar indirilecek.");
  }
  async function prepareTargetFolder(ask){
    if(!targetFolderHandle){
      if(ask === false) return false;
      const picked = await chooseTargetFolder();
      if(!picked) return false;
    }
    try{
      let permission = await targetFolderHandle.queryPermission({ mode:"readwrite" });
      if(permission !== "granted"){
        permission = await targetFolderHandle.requestPermission({ mode:"readwrite" });
      }
      const granted = permission === "granted";
      targetFolderNeedsPermission = !granted;
      updateTargetFolderUI();
      return granted;
    }catch(err){
      console.warn("Proje dizini izni alınamadı", err);
      targetFolderNeedsPermission = true;
      updateTargetFolderUI();
      return false;
    }
  }
  async function saveOutput(blob, filename, useTarget, silent){
    if(useTarget && targetFolderHandle){
      try{
        const fileHandle = await targetFolderHandle.getFileHandle(filename, { create:true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        if(!silent) showToast("Hedef klasöre kaydedildi: " + filename);
        return "target";
      }catch(err){
        console.error("Hedef klasöre yazılamadı", err);
        if(!silent) showToast("Hedef klasöre kaydedilemedi; dosya indiriliyor.", "error");
      }
    }
    if(!useTarget && activeProjectId && typeof serverFolderMode === "function"){
      if(serverFolderMode()){
        const stored = await serverExportFile(filename, blob, activeProjectId).catch(function(){ return false; });
        if(stored){
          if(!silent) showToast("Proje klasörüne kaydedildi: " + filename);
          return "project";
        }
        if(!silent) showToast("Proje klasörüne yazılamadı; dosya indiriliyor.", "error");
      }else{
        if(!silent) showToast("Sunucu modu klasör kaydı için gerekli; dosya indiriliyor.", "error");
      }
    }
    downloadBlob(blob, filename);
    if(!silent) showToast("İndirildi: " + filename);
    return "download";
  }
  /* The root folder is immutable in Phase 1: the picker UI is gone and a
     stored handle is ignored. Records and drafts stay in IndexedDB. */
  function normalizeDisplayPath(value){
    let path = String(value == null ? "" : value).replace(/\\/g, "/");
    if(/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
    return path;
  }
  function defaultRootPath(){
    try{
      const url = new URL(location.href);
      let path = normalizeDisplayPath(decodeURIComponent(url.pathname || ""));
      const slash = path.lastIndexOf("/");
      if(slash >= 0) path = path.slice(0, slash + 1);
      return path || "/";
    }catch(err){
      return "";
    }
  }
  function folderPickerErrorMessage(err){
    if(err && (err.name === "SecurityError" || err.name === "NotAllowedError")){
      return "Tarayıcı bu klasöre erişim izni vermedi. C:\\ veya masaüstü kökü gibi sistem klasörleri yerine yazılabilir bir alt klasör seçin.";
    }
    return "Klasör seçilemedi. Lütfen yazılabilir bir klasör seçin.";
  }
  function displayPathForHandle(handle){
    if(!handle) return "";
    const name = String(handle.name || "");
    if(handle.__displayPath) return normalizeDisplayPath(handle.__displayPath).replace(/\/+$/, "");
    if(/^[A-Za-z]:[\\/]/.test(name) || name.charAt(0) === "/") return normalizeDisplayPath(name).replace(/\/+$/, "");
    const base = defaultRootPath().replace(/\/+$/, "");
    if(!base || base === "/") return name;
    const lowerBase = base.toLowerCase();
    const lowerName = name.toLowerCase();
    if(lowerBase === lowerName || lowerBase.endsWith("/" + lowerName)) return base;
    return base + "/" + name;
  }
  /* Root writes are disabled until Phase 2 restores a project-scoped root.
     Keeping the stubs means record/draft flows can call them without a prompt. */
  async function ensureRootForWrite(){
    return false;
  }
  async function ensureRootPermission(){
    return false;
  }
  async function writeRootSnapshot(kind, snapshot, existingFileName){
    if(!rootFolderHandle) return false;
    const granted = await ensureRootPermission();
    if(!granted) return false;
    try{
      const dirName = kind === "record" ? "kayitlar" : "taslaklar";
      const prefix = kind === "record" ? "kayit" : "taslak";
      const dir = await rootFolderHandle.getDirectoryHandle(dirName, { create:true });
      const fileName = existingFileName || snapshot.fileName || (prefix + "-" + formatStamp() + "-" + String(snapshot.id).slice(-4) + ".json");
      const fileHandle = await dir.getFileHandle(fileName, { create:true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify({ app:"istek-defteri", version:1, kind:kind, snapshot:snapshot }, null, 2));
      await writable.close();
      snapshot.fileName = fileName;
      snapshot.rootFolder = rootFolderHandle.name;
      snapshot.writeError = "";
      return fileName;
    }catch(err){
      console.error("Kök dizine yazılamadı", err);
      snapshot.writeError = err && err.message ? err.message : "Kök dizine yazılamadı";
      return false;
    }
  }
  async function readRootSnapshots(kind){
    if(!rootFolderHandle) return [];
    const granted = await ensureRootPermission();
    if(!granted) return [];
    const dirName = kind === "record" ? "kayitlar" : "taslaklar";
    const dir = await rootFolderHandle.getDirectoryHandle(dirName, { create:true });
    const items = [];
    for await (const entry of dir.values()){
      if(entry.kind !== "file" || !/\.json$/i.test(entry.name)) continue;
      try{
        const file = await entry.getFile();
        const parsed = JSON.parse(await file.text());
        if(parsed && parsed.snapshot && Array.isArray(parsed.snapshot.requests)){
          parsed.snapshot.fileName = entry.name;
          parsed.snapshot.rootFolder = rootFolderHandle.name;
          items.push(parsed.snapshot);
        }
      }catch(err){
        console.warn("Kök kayıt okunamadı: " + entry.name, err);
      }
    }
    return items;
  }
  async function loadRootSnapshots(){
    if(!rootFolderHandle || rootFolderNeedsPermission) return;
    try{
      const recordItems = await readRootSnapshots("record");
      const draftItems = await readRootSnapshots("draft");
      const merge = function(local, incoming){
        const map = new Map(local.map(function(item){ return [item.id, item]; }));
        incoming.forEach(function(item){ map.set(item.id, item); });
        return Array.from(map.values()).sort(function(a, b){ return new Date(b.savedAt) - new Date(a.savedAt); });
      };
      records = merge(records, recordItems);
      drafts = merge(drafts, draftItems);
      ensureSnapshotNames();
      for(const item of recordItems){ await idbCollectionPut(RECORDS_STORE, item).catch(function(){}); }
      for(const item of draftItems){ await idbCollectionPut(DRAFTS_STORE, item).catch(function(){}); }
      renderHistoryTree();
    }catch(err){
      console.warn("Kök dizin kayıtları yüklenemedi", err);
    }
  }
  async function loadImageURL(id){
    if(imageUrlCache.has(id)) return imageUrlCache.get(id);
    if(!idb) return null;
    try{
      const rec = await idbGet(id);
      if(!rec || !rec.blob) return null;
      const url = URL.createObjectURL(rec.blob);
      imageUrlCache.set(id, url);
      return url;
    }catch(err){
      return null;
    }
  }
  function revokeImageURL(id){
    if(imageUrlCache.has(id)){
      try{ URL.revokeObjectURL(imageUrlCache.get(id)); }catch(err){}
      imageUrlCache.delete(id);
    }
  }
  function clearImageURLs(){
    imageUrlCache.forEach(function(url){
      try{ URL.revokeObjectURL(url); }catch(err){}
    });
    imageUrlCache.clear();
  }
  function supportsWebP(){
    if(webpSupport !== null) return webpSupport;
    try{
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      webpSupport = canvas.toDataURL("image/webp").indexOf("data:image/webp") === 0;
    }catch(err){
      webpSupport = false;
    }
    return webpSupport;
  }
  function decodeImage(file){
    if("createImageBitmap" in window){
      return createImageBitmap(file, { imageOrientation:"from-image" })
        .catch(function(){ return createImageBitmap(file); })
        .catch(function(){
          return decodeWithImageElement(file);
        });
    }
    return decodeWithImageElement(file);
  }
  function decodeWithImageElement(file){
    return new Promise(function(resolve, reject){
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function(){ URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function(){ URL.revokeObjectURL(url); reject(new Error("Görsel açılamadı")); };
      img.src = url;
    });
  }
  function canvasToBlob(canvas, type, quality){
    return new Promise(function(resolve){
      canvas.toBlob(function(blob){ resolve(blob); }, type, quality);
    });
  }
  async function compressImage(file){
    const bitmap = await decodeImage(file);
    const srcW = bitmap.width || bitmap.naturalWidth || 1;
    const srcH = bitmap.height || bitmap.naturalHeight || 1;
    const scale = Math.min(1, MAX_DIM / Math.max(srcW, srcH));
    const width = Math.max(1, Math.round(srcW * scale));
    const height = Math.max(1, Math.round(srcH * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const webp = supportsWebP();
    if(!webp){
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    if(bitmap.close) bitmap.close();
    let type = webp ? "image/webp" : "image/jpeg";
    let blob = await canvasToBlob(canvas, type, JPEG_QUALITY);
    if(!blob && webp){
      type = "image/jpeg";
      blob = await canvasToBlob(canvas, type, JPEG_QUALITY);
    }
    if(!blob) throw new Error("Görsel dönüştürülemedi");
    return { blob: blob, w: width, h: height, type: type, ext: extFromMime(type) };
  }