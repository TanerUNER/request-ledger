  /* ============================================================
     Server disk truth (server mode only)

     A browser origin is port-scoped, so localStorage/IndexedDB cannot be the
     authority in server mode. The local server owns projects/<slug>/ on disk.
     This fragment hydrates the browser cache from disk on boot, migrates the
     existing browser data once, mirrors autosaves back to disk and resolves
     media through /__rl/media/.
     ============================================================ */

  var serverDiskMode = false;
  var serverDiskReady = false;
  var serverDiskActive = false;
  var serverMediaIndex = {};     /* projectId -> { mediaId: meta } */
  var serverArchives = {};       /* projectId -> { records, drafts, history } */
  var serverSaveTimer = null;
  var serverSaveBusy = false;
  var serverSaveQueued = false;
  var SERVER_DISK_SAVE_MS = 700;

  function serverDiskEnabled(){
    try{
      if(localStorage.getItem("rl-local-mode") === "1") return false;
      if(/[?&]rl-local=1/.test(window.location.search || "")) return false;
    }catch(err){ /* ignore */ }
    try{
      return window.location.protocol === "http:" &&
        /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
    }catch(err){ return false; }
  }

  function serverJson(url, options){
    var init = options || {};
    return fetch(url, {
      method:init.method || "GET",
      cache:"no-store",
      headers:init.body ? { "content-type":"application/json" } : undefined,
      body:init.body ? JSON.stringify(init.body) : undefined
    }).then(function(response){
      if(!response.ok) return null;
      return response.json().catch(function(){ return null; });
    });
  }

  function serverDiskSlug(projectId){
    var project = projectId ? findProjectRecord(projectId) : null;
    return project && project.folder ? project.folder : "";
  }

  function serverMediaUrl(projectId, mediaId){
    var slug = serverDiskSlug(projectId);
    if(!slug || !mediaId) return "";
    return "/__rl/media/" + encodeURIComponent(slug) + "/" + encodeURIComponent(mediaId);
  }

  function serverMediaMeta(projectId, mediaId){
    var index = projectId && serverMediaIndex[projectId];
    return index && index[mediaId] ? index[mediaId] : null;
  }

  function serverIndexMedia(projectId, list){
    var map = {};
    (Array.isArray(list) ? list : []).forEach(function(item){
      if(item && item.id) map[item.id] = item;
    });
    if(projectId) serverMediaIndex[projectId] = map;
    return map;
  }

  function serverBlobToDataUrl(blob){
    return new Promise(function(resolve, reject){
      if(!blob){ reject(new Error("missing blob")); return; }
      try{
        var reader = new FileReader();
        reader.onload = function(){ resolve(reader.result); };
        reader.onerror = function(){ reject(reader.error || new Error("media read failed")); };
        reader.readAsDataURL(blob);
      }catch(err){ reject(err); }
    });
  }

  /* Upload one blob to the disk project and keep the runtime index in sync.
     Failures are silent: IndexedDB remains a same-session fallback. */
  async function serverUploadMedia(kind, record){
    if(!serverDiskMode || !activeProjectId || !record || !record.id || !record.blob) return false;
    if(record.blob.size > 32 * 1024 * 1024) return false;
    try{
      var dataUrl = await serverBlobToDataUrl(record.blob);
      var result = await serverJson("/__rl/media", {
        method:"POST",
        body:{
          projectId:activeProjectId,
          kind:kind === "file" ? "file" : "image",
          id:record.id,
          name:record.name || record.id,
          type:record.type || record.blob.type || (kind === "file" ? "application/octet-stream" : "image/png"),
          ext:record.ext || "",
          dataUrl:dataUrl
        }
      });
      if(!result || result.ok !== true) return false;
      var index = serverMediaIndex[activeProjectId] || (serverMediaIndex[activeProjectId] = {});
      index[record.id] = {
        id:record.id, kind:kind === "file" ? "file" : "image",
        name:record.name || record.id, type:record.type || record.blob.type || "",
        ext:record.ext || "", size:record.blob.size
      };
      return true;
    }catch(err){ return false; }
  }

  function serverDeleteMedia(kind, mediaId){
    if(!serverDiskMode || !activeProjectId || !mediaId) return;
    var projectId = activeProjectId;
    var slug = serverDiskSlug(projectId);
    if(!slug) return;
    try{
      fetch("/__rl/media/" + encodeURIComponent(slug) + "/" + encodeURIComponent(mediaId), {
        method:"DELETE", cache:"no-store"
      }).catch(function(){ /* best effort */ });
    }catch(err){ /* ignore */ }
    var index = serverMediaIndex[projectId];
    if(index) delete index[mediaId];
  }

  /* Fetch a blob from disk when the local IndexedDB cache misses. */
  async function serverFetchMedia(projectId, mediaId){
    var url = serverMediaUrl(projectId, mediaId);
    if(!url) return null;
    try{
      var response = await fetch(url, { cache:"no-store" });
      if(!response.ok) return null;
      var blob = await response.blob();
      return { id:mediaId, blob:blob, type:blob.type || "application/octet-stream" };
    }catch(err){ return null; }
  }

  function serverProjectFromMeta(meta){
    return {
      id:meta.projectId,
      name:meta.name,
      createdAt:meta.createdAt,
      updatedAt:meta.updatedAt,
      ledgerId:meta.ledgerId || "",
      folder:meta.slug || "",
      exportTarget:meta.exportTarget || "",
      archiveCollapsed:meta.archiveCollapsed === true
    };
  }

  async function serverHydrateProject(meta){
    var data = await serverJson("/__rl/load?projectId=" + encodeURIComponent(meta.projectId));
    if(!data || data.ok !== true) return;
    var ledger = data.ledger && typeof data.ledger === "object" ? data.ledger : null;
    if(ledger){
      ledger.project = ledger.project || meta.name;
      ledger.projectCreated = true;
      ledger.ledgerId = ledger.ledgerId || meta.ledgerId || "";
      localStorage.setItem(projectLedgerKey(meta.projectId), JSON.stringify(ledger));
    }
    var archive = data.archive && typeof data.archive === "object"
      ? data.archive : { records:[], drafts:[], history:[] };
    serverArchives[meta.projectId] = archive;
    serverIndexMedia(meta.projectId, data.media);
    /* Seed IndexedDB so the existing archive loaders work unchanged. */
    if(idb){
      try{ await idbCollectionClear(RECORDS_STORE, meta.projectId); }catch(err){ /* ignore */ }
      try{ await idbCollectionClear(DRAFTS_STORE, meta.projectId); }catch(err){ /* ignore */ }
      try{ await idbHistoryClear(meta.projectId); }catch(err){ /* ignore */ }
      for(var ri = 0; ri < (archive.records || []).length; ri++){
        var record = Object.assign({}, archive.records[ri], { projectId:meta.projectId });
        await idbCollectionPut(RECORDS_STORE, record).catch(function(){ /* ignore */ });
      }
      for(var di = 0; di < (archive.drafts || []).length; di++){
        var draft = Object.assign({}, archive.drafts[di], { projectId:meta.projectId });
        await idbCollectionPut(DRAFTS_STORE, draft).catch(function(){ /* ignore */ });
      }
      for(var hi = 0; hi < (archive.history || []).length; hi++){
        var entry = Object.assign({}, archive.history[hi], { projectId:meta.projectId });
        await idbHistoryPut(entry).catch(function(){ /* ignore */ });
      }
    }
  }

  async function serverMigrateProject(project){
    if(!project || !project.id) return false;
    var raw = null;
    try{ raw = localStorage.getItem(projectLedgerKey(project.id)); }catch(err){ raw = null; }
    if(!raw) return false;
    var ledger = null;
    try{ ledger = JSON.parse(raw); }catch(err){ ledger = null; }
    if(!ledger || !Array.isArray(ledger.requests)) return false;
    var created = await serverJson("/__rl/projects", {
      method:"POST",
      body:{ projectId:project.id, name:project.name, slug:project.folder || project.name }
    });
    if(!created || created.ok !== true) return false;
    var slug = created.slug || project.folder;
    if(slug && project.folder !== slug) updateProjectRecord(project.id, { folder:slug });
    /* Upload the media referenced by the ledger and its archive. */
    var mediaIds = {};
    function collect(reqs){
      (Array.isArray(reqs) ? reqs : []).forEach(function(req){
        (Array.isArray(req && req.images) ? req.images : []).forEach(function(img){
          if(img && img.id && !mediaIds[img.id]) mediaIds[img.id] = { kind:"image", meta:img };
        });
        (Array.isArray(req && req.attachments) ? req.attachments : []).forEach(function(att){
          if(att && att.id && !mediaIds[att.id]) mediaIds[att.id] = { kind:"file", meta:att };
        });
      });
    }
    collect(ledger.requests);
    var archive = { records:[], drafts:[], history:[] };
    if(idb){
      archive.records = await idbCollectionGetAll(RECORDS_STORE, project.id).catch(function(){ return []; });
      archive.drafts = await idbCollectionGetAll(DRAFTS_STORE, project.id).catch(function(){ return []; });
      archive.history = await idbHistoryGetAll(project.id).catch(function(){ return []; });
      archive.records.forEach(function(record){ collect(record.requests); });
      archive.drafts.forEach(function(draft){ collect(draft.requests); });
      archive.history.forEach(function(entry){ collect(entry.requests); });
    }
    var ids = Object.keys(mediaIds);
    for(var i = 0; i < ids.length; i++){
      var id = ids[i];
      var item = mediaIds[id];
      var record = item.kind === "image"
        ? await idbGet(id).catch(function(){ return null; })
        : await idbFileGet(id).catch(function(){ return null; })
      ;
      if(!record || !record.blob) continue;
      try{
        var dataUrl = await serverBlobToDataUrl(record.blob);
        await serverJson("/__rl/media", {
          method:"POST",
          body:{
            projectId:project.id,
            kind:item.kind,
            id:id,
            name:item.meta.name || id,
            type:item.meta.type || record.blob.type || "",
            ext:item.meta.ext || "",
            dataUrl:dataUrl
          }
        });
      }catch(err){ /* backup-only media stays local */ }
    }
    var saved = await serverJson("/__rl/save", {
      method:"POST",
      body:{
        projectId:project.id,
        name:project.name,
        slug:slug,
        snapshot:ledger,
        archive:archive,
        archiveCollapsed:project.archiveCollapsed === true
      }
    });
    return !!(saved && saved.ok === true);
  }

  async function serverDiskBootstrap(){
    if(!serverDiskEnabled()) return false;
    var boot = null;
    try{ boot = await serverJson("/__rl/bootstrap"); }catch(err){ boot = null; }
    if(!boot || boot.ok !== true) return false;
    serverDiskMode = true;
    var serverProjects = Array.isArray(boot.projects) ? boot.projects : [];
    var localRegistry = readRegistry();
    var localById = {};
    (localRegistry && Array.isArray(localRegistry.projects) ? localRegistry.projects : []).forEach(function(project){
      if(project && project.id) localById[project.id] = project;
    });
    var serverById = {};
    serverProjects.forEach(function(meta){ if(meta && meta.projectId) serverById[meta.projectId] = meta; });

    /* Browser-only projects: migrate once. Same-id projects: the newer
       revision wins; a stale cache must never overwrite the disk. */
    var allIds = {};
    Object.keys(localById).forEach(function(id){ allIds[id] = true; });
    Object.keys(serverById).forEach(function(id){ allIds[id] = true; });
    var merged = [];
    for(var id of Object.keys(allIds)){
      var local = localById[id] || null;
      var server = serverById[id] || null;
      if(local && !server){
        await serverMigrateProject(local);
        var created = await serverJson("/__rl/load?projectId=" + encodeURIComponent(id));
        if(created && created.ok === true && created.project){
          serverById[id] = created.project;
          server = created.project;
          await serverHydrateProject(created.project);
        }else{
          merged.push(local);
          continue;
        }
      }
      if(server){
        var serverStamp = String(server.updatedAt || "");
        var localStamp = local ? String(local.updatedAt || "") : "";
        if(local && localStamp && localStamp > serverStamp){
          await serverMigrateProject(local);
        }else{
          await serverHydrateProject(server);
        }
        merged.push(serverProjectFromMeta(server));
      }
    }
    var preferred = "";
    if(localRegistry && localRegistry.activeId && merged.some(function(project){ return project.id === localRegistry.activeId; })){
      preferred = localRegistry.activeId;
    }else if(boot.activeId && merged.some(function(project){ return project.id === boot.activeId; })){
      preferred = boot.activeId;
    }else if(merged.length){
      preferred = merged.slice().sort(function(a, b){
        return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
      })[0].id;
    }
    var nextRegistry = { version:1, activeId:preferred, projects:merged };
    try{ localStorage.setItem(PROJECTS_KEY, JSON.stringify(nextRegistry)); }catch(err){ /* quota */ }
    projectRegistry = nextRegistry;
    activeProjectId = preferred;
    serverDiskReady = true;
    serverDiskActive = true;
    return true;
  }

  function serverMarkActive(projectId){
    if(!serverDiskMode || !projectId) return;
    serverJson("/__rl/active", { method:"POST", body:{ projectId:projectId } }).catch(function(){ /* best effort */ });
  }

  function serverDiskPayload(){
    return {
      projectId:activeProjectId,
      name:state.project,
      slug:serverDiskSlug(activeProjectId),
      snapshot:ledgerPayload(),
      archive:{
        records:Array.isArray(records) ? records : [],
        drafts:Array.isArray(drafts) ? drafts : [],
        history:Array.isArray(historyItems) ? historyItems : []
      },
      archiveCollapsed:(function(){
        var project = findProjectRecord(activeProjectId);
        return !!(project && project.archiveCollapsed === true);
      })()
    };
  }

  async function serverDiskSaveNow(){
    if(!serverDiskMode || !activeProjectId) return false;
    if(serverSaveBusy){ serverSaveQueued = true; return false; }
    serverSaveBusy = true;
    var projectId = activeProjectId;
    try{
      var saved = await serverSaveProject(projectId);
      if(saved){
        var project = findProjectRecord(projectId);
        if(project && serverDiskSlug(projectId)) updateProjectRecord(projectId, { folder:serverDiskSlug(projectId) });
      }
      return saved;
    }catch(err){ return false; }
    finally{
      serverSaveBusy = false;
      if(serverSaveQueued){
        serverSaveQueued = false;
        scheduleServerDiskSave();
      }
    }
  }

  function scheduleServerDiskSave(){
    if(!serverDiskMode || !activeProjectId) return;
    if(serverSaveTimer) clearTimeout(serverSaveTimer);
    serverSaveTimer = setTimeout(function(){
      serverSaveTimer = null;
      serverDiskSaveNow();
    }, SERVER_DISK_SAVE_MS);
  }


  /* ---------- server config, backups, delete/restore, reset ---------- */

  var serverConfigQueue = Promise.resolve();

  /* Serialize config writes: two quick UI toggles must not land out of order. */
  function serverConfigPost(patch){
    if(typeof serverDiskEnabled === "function" && !serverDiskEnabled()) return;
    serverConfigQueue = serverConfigQueue.then(function(){
      return fetch("/__rl/config", {
        method:"POST",
        headers:{ "content-type":"application/json" },
        cache:"no-store",
        keepalive:true,
        body:JSON.stringify(patch || {})
      });
    }).catch(function(){ /* cache only */ });
  }

  /* Persist language/theme; localStorage stays a cache. */
  function serverSaveUiConfig(){
    if(!serverDiskEnabled()) return;
    serverConfigPost({
      language:state.language === "tr" ? "tr" : "en",
      theme:document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"
    });
  }

  /* Before a port change, push every browser-side project to the shared disk so
     the new origin hydrates the same data. Idempotent by projectId/updatedAt. */
  async function serverFlushAllProjects(){
    if(!serverDiskEnabled()) return false;
    var registry = readRegistry();
    var projects = registry && Array.isArray(registry.projects) ? registry.projects : [];
    if(activeProjectId) saveNow();
    var sent = 0;
    for(var i = 0; i < projects.length; i++){
      var project = projects[i];
      if(!project || !project.id) continue;
      try{
        var ok = await serverMigrateProject(project);
        if(ok) sent += 1;
      }catch(err){ /* next boot retries */ }
    }
    return sent === projects.length;
  }

  /* Remove disk projects that are not part of the kept set (a restore is
     authoritative: an old folder must not merge back on the next boot). */
  async function serverPruneProjects(keepIds){
    if(!serverDiskEnabled()) return false;
    var data = await serverJson("/__rl/bootstrap");
    var disk = data && Array.isArray(data.projects) ? data.projects : [];
    var keep = {};
    (Array.isArray(keepIds) ? keepIds : []).forEach(function(id){ keep[id] = true; });
    for(var i = 0; i < disk.length; i++){
      var meta = disk[i];
      if(!meta || !meta.projectId || keep[meta.projectId]) continue;
      await serverDeleteProjectOnDisk(meta.projectId, false);
    }
    return true;
  }

  async function serverDeleteProjectOnDisk(projectId, keepBackup){    if(!serverDiskEnabled()) return { ok:false, error:"server mode required" };
    var data = await serverJson("/__rl/delete-project", {
      method:"POST",
      body:{ projectId:projectId, backup:keepBackup === true }
    });
    return data && typeof data === "object" ? data : { ok:false, error:"server unavailable" };
  }

  async function serverDeletedProjectList(){
    if(!serverDiskEnabled()) return [];
    var data = await serverJson("/__rl/deleted");
    return data && Array.isArray(data.deleted) ? data.deleted : [];
  }

  async function serverRestoreDeletedProject(name){
    if(!serverDiskEnabled()) return null;
    return serverJson("/__rl/deleted/restore", { method:"POST", body:{ name:name } });
  }

  async function serverForgetDeletedProject(name){
    if(!serverDiskEnabled()) return false;
    var data = await serverJson("/__rl/deleted/delete", { method:"POST", body:{ name:name } });
    return !!(data && data.ok === true);
  }

  async function serverBackupList(){
    if(!serverDiskEnabled()) return [];
    var data = await serverJson("/__rl/backups");
    return data && Array.isArray(data.backups) ? data.backups : [];
  }

  async function serverStoreBackup(blob, name){
    if(!serverDiskEnabled() || !blob) return null;
    var dataUrl = null;
    try{ dataUrl = await serverBlobToDataUrl(blob); }catch(err){ return null; }
    if(typeof dataUrl !== "string" || dataUrl.length > 520 * 1024 * 1024) return null;
    var data = await serverJson("/__rl/backups", {
      method:"POST",
      body:{ name:name, dataUrl:dataUrl }
    });
    return data && data.ok === true ? data.backup : null;
  }

  async function serverFetchBackupFile(name){
    if(!serverDiskEnabled() || !name) return null;
    try{
      var response = await fetch("/__rl/backups/" + encodeURIComponent(name), { cache:"no-store" });
      if(!response.ok) return null;
      var blob = await response.blob();
      try{ return new File([blob], name, { type:"application/zip" }); }
      catch(err){ blob.name = name; return blob; }
    }catch(err){ return null; }
  }

  /* Full reset: remove every live project folder and every deleted-project
     ZIP, keep backups/ and the UI config, then clear the browser cache. */
  async function serverResetAll(){
    if(!serverDiskEnabled()) return null;
    return serverJson("/__rl/reset", { method:"POST", body:{} });
  }

