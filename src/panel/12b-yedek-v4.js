  /* ============================================================
     WORKSPACE BACKUP v4

     Version 4 backs up the project registry, every project ledger and every
     project-scoped snapshot. Media stays in the ZIP under p-<project id>/.
     Restore validates the whole document before writing anything and still
     accepts v3 (single-ledger) backups.
     ============================================================ */

  function backupProjectFolder(projectId){
    var safe = String(projectId || "proje").replace(/[^A-Za-z0-9_-]/g, "-");
    return "p-" + safe;
  }

  function backupProjectMediaPath(projectId, kind, item){
    return backupProjectFolder(projectId) + "/" + core.util.backupMediaFileName(kind, item);
  }

  function createBackupMediaCollector(){
    var images = [];
    var attachments = [];
    var imageFiles = {};
    var attachmentFiles = {};
    function imageMapper(projectId){
      return function(img){
        var key = projectId + "|" + img.id;
        var file = imageFiles[key];
        if(!file){
          file = backupProjectMediaPath(projectId, "image", img);
          imageFiles[key] = file;
          images.push({ projectId:projectId, file:file, img:img });
        }
        return Object.assign({}, img, { file:file });
      };
    }
    function attachmentMapper(projectId){
      return function(att){
        var key = projectId + "|" + att.id;
        var file = attachmentFiles[key];
        if(!file){
          file = backupProjectMediaPath(projectId, "attachment", att);
          attachmentFiles[key] = file;
          attachments.push({ projectId:projectId, file:file, att:att });
        }
        return Object.assign({}, att, { file:file });
      };
    }
    return {
      images: images,
      attachments: attachments,
      imageMapper: imageMapper,
      attachmentMapper: attachmentMapper
    };
  }

  function stripBackupRequestMedia(req){
    var copy = Object.assign({}, req);
    copy.images = [];
    copy.attachments = [];
    return copy;
  }

  function normalizeBackupAgent(agent){
    agent = agent || {};
    var roles = core && core.constants && core.constants.AGENT_ROLES ? core.constants.AGENT_ROLES : [];
    var role = "general";
    for(var i = 0; i < roles.length; i++) if(roles[i].id === agent.role) role = agent.role;
    return {
      id: String(agent.id || ("agent_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7))),
      name: String(agent.name || "").slice(0, 80),
      role: role,
      mdPath: String(agent.mdPath || agent.mdFile || "").slice(0, 300)
    };
  }

  function currentAppLedgerPayload(){
    return {
      version: 2,
      project: app ? app.project : "",
      projectCreated: true,
      ledgerId: app && app.ledgerId ? app.ledgerId : "",
      updatedAt: app && app.updatedAt ? app.updatedAt : nowISO(),
      requests: app && Array.isArray(app.requests) ? app.requests : [],
      agents: app && Array.isArray(app.agents) ? app.agents : [],
      language: app && app.language === "tr" ? "tr" : "en",
      exportBehavior: app && ["last", "instant"].indexOf(app.exportBehavior) >= 0 ? app.exportBehavior : "default",
      lastExport: app && app.lastExport && typeof app.lastExport === "object" ? app.lastExport : null
    };
  }

  async function buildProjectBackupEntry(project, collector, includeMedia){
    var ledger = project.id === activeProjectId && app
      ? currentAppLedgerPayload()
      : (readProjectLedgerPayload(project.id) || {
        version: 2, project: project.name, projectCreated: true, ledgerId: "",
        updatedAt: project.updatedAt, requests: [], agents: [],
        language: state.lang, exportBehavior: "default", lastExport: null
      });
    var rawRequests = Array.isArray(ledger.requests) ? ledger.requests : [];
    var requests = rawRequests.map(function(raw, index){ return core.requests.normalize(raw, index); });
    var archives = await withProjectScope(project.id, function(){
      return Promise.all([
        core.storage.listCollection("records").catch(function(){ return []; }),
        core.storage.listCollection("drafts").catch(function(){ return []; }),
        core.storage.listHistory().catch(function(){ return []; })
      ]);
    });
    var recordList = archives[0] || [];
    var draftList = archives[1] || [];
    var historyList = archives[2] || [];
    var mapImage = includeMedia ? collector.imageMapper(project.id) : null;
    var mapAttachment = includeMedia ? collector.attachmentMapper(project.id) : null;

    function serializeRequestForBackup(req){
      var item = core.requests.serialize(req, mapImage, mapAttachment);
      return includeMedia ? item : stripBackupRequestMedia(item);
    }
    function serializeSnapshot(snapshot){
      var copy = JSON.parse(JSON.stringify(snapshot || {}));
      delete copy.projectId;
      copy.requests = (Array.isArray(snapshot && snapshot.requests) ? snapshot.requests : []).map(function(raw, index){
        return serializeRequestForBackup(core.requests.normalize(raw, index));
      });
      if(!includeMedia){
        copy.imageCount = 0;
        copy.fileCount = 0;
      }
      return copy;
    }

    return {
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      exportTarget: project.exportTarget || "",
      archiveCollapsed: project.archiveCollapsed === true,
      ledger: {
        version: 2,
        project: project.name,
        projectCreated: true,
        ledgerId: typeof ledger.ledgerId === "string" ? ledger.ledgerId : "",
        updatedAt: typeof ledger.updatedAt === "string" ? ledger.updatedAt : project.updatedAt,
        requests: requests.map(serializeRequestForBackup),
        agents: Array.isArray(ledger.agents) ? ledger.agents.map(normalizeBackupAgent) : [],
        language: ledger.language === "tr" ? "tr" : "en",
        exportBehavior: ["last", "instant"].indexOf(ledger.exportBehavior) >= 0 ? ledger.exportBehavior : "default",
        lastExport: ledger.lastExport && typeof ledger.lastExport === "object" ? ledger.lastExport : null
      },
      records: recordList.map(serializeSnapshot),
      drafts: draftList.map(serializeSnapshot),
      history: historyList.map(serializeSnapshot)
    };
  }

  async function buildBackupV4(includeMedia){
    var registry = readRegistry() || emptyProjectRegistry();
    var collector = createBackupMediaCollector();
    var projects = [];
    for(var i = 0; i < registry.projects.length; i++){
      projects.push(await buildProjectBackupEntry(registry.projects[i], collector, includeMedia));
    }
    return {
      backup: {
        app: "istek-defteri",
        version: 4,
        exportedAt: nowISO(),
        activeId: registry.activeId,
        projects: projects
      },
      images: includeMedia ? collector.images : [],
      attachments: includeMedia ? collector.attachments : []
    };
  }

  function looksLikeZipBytes(bytes){
    return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4B &&
      (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
  }

  async function readBackupDocument(file){
    if(!file) throw new Error("Yedek dosyası yok.");
    var bytes = new Uint8Array(await file.arrayBuffer());
    if(bytes.length > 512 * 1024 * 1024) throw new Error("Yedek dosyası çok büyük.");
    var data = null;
    var entries = null;
    if(looksLikeZipBytes(bytes)){
      entries = await core.zip.parse(bytes);
      if(!entries["yedek.json"]) throw new Error("ZIP içinde yedek.json bulunamadı.");
      data = JSON.parse(new TextDecoder("utf-8").decode(entries["yedek.json"]));
    }else{
      data = JSON.parse(new TextDecoder("utf-8").decode(bytes));
    }
    if(!data || typeof data !== "object") throw new Error("Geçersiz yedek dosyası.");
    if(data.app && data.app !== "istek-defteri") throw new Error("Bu dosya bir Request Ledger yedeği değil.");
    return { data:data, entries:entries };
  }

  function validBackupStamp(value, fallback){
    if(typeof value !== "string" || !value) return fallback;
    var date = new Date(value);
    return isNaN(date.getTime()) ? fallback : value;
  }

  function ensureUniqueRequestIds(requests){
    var seen = {};
    requests.forEach(function(req, index){
      if(!seen[req.id]){
        seen[req.id] = true;
        return;
      }
      var attempt = 1;
      var next = "IST-" + String(index + 1).padStart(3, "0") + "-" + attempt;
      while(seen[next]){
        attempt++;
        next = "IST-" + String(index + 1).padStart(3, "0") + "-" + attempt;
      }
      req.id = next;
      seen[next] = true;
    });
  }

  function validateBackupSnapshotList(list, label, projectIndex){
    if(list == null) return [];
    if(!Array.isArray(list)) throw new Error("Geçersiz yedek: " + label + " listesi okunamadı.");
    if(list.length > 2000) throw new Error("Yedekte çok fazla " + label.toLowerCase() + " var.");
    return list.map(function(raw, itemIndex){
      if(!raw || typeof raw !== "object") throw new Error("Geçersiz yedek: " + label + " kaydı okunamadı.");
      var copy = JSON.parse(JSON.stringify(raw));
      copy.id = String(copy.id || ("restored_" + projectIndex + "_" + itemIndex));
      var requests = Array.isArray(copy.requests) ? copy.requests : [];
      if(requests.length > 5000) throw new Error("Yedekte çok fazla talep var.");
      copy.requests = requests.map(function(item, index){ return core.requests.normalize(item, index); });
      ensureUniqueRequestIds(copy.requests);
      return copy;
    });
  }

  function validateBackupV4(data){
    if(!data || typeof data !== "object") throw new Error("Geçersiz yedek dosyası.");
    if(data.app && data.app !== "istek-defteri") throw new Error("Bu dosya bir Request Ledger yedeği değil.");
    if(Number(data.version) !== 4) throw new Error("Geçersiz yedek sürümü.");
    var list = data.projects;
    if(!Array.isArray(list) || !list.length) throw new Error("Yedekte proje bulunamadı.");
    if(list.length > 200) throw new Error("Yedekte çok fazla proje var.");
    var seen = {};
    var now = nowISO();
    var requestCount = 0;
    var recordCount = 0;
    var draftCount = 0;
    var projects = list.map(function(raw, projectIndex){
      if(!raw || typeof raw !== "object") throw new Error("Geçersiz yedek: proje kaydı okunamadı.");
      var id = typeof raw.id === "string" && /^prj_[A-Za-z0-9_]+$/.test(raw.id) ? raw.id : "";
      if(!id) throw new Error("Geçersiz yedek: proje kimliği okunamadı.");
      if(seen[id]) throw new Error("Geçersiz yedek: proje kimliği tekrar ediyor.");
      seen[id] = true;
      var name = normalizeProjectName(raw.name);
      if(!name) throw new Error("Geçersiz yedek: proje adı boş.");
      var rawLedger = raw.ledger;
      if(!rawLedger || typeof rawLedger !== "object" || !Array.isArray(rawLedger.requests)){
        throw new Error("Geçersiz yedek: " + name + " defteri okunamadı.");
      }
      if(rawLedger.requests.length > 5000) throw new Error("Yedekte çok fazla talep var.");
      var requests = rawLedger.requests.map(function(item, index){ return core.requests.normalize(item, index); });
      ensureUniqueRequestIds(requests);
      if(Array.isArray(rawLedger.agents) && rawLedger.agents.length > 200){
        throw new Error("Yedekte çok fazla ajan var.");
      }
      var createdAt = validBackupStamp(raw.createdAt, now);
      var updatedAt = validBackupStamp(raw.updatedAt, createdAt);
      var records = validateBackupSnapshotList(raw.records, "Kayıt", projectIndex);
      var drafts = validateBackupSnapshotList(raw.drafts, "Taslak", projectIndex);
      var history = validateBackupSnapshotList(raw.history, "Dışa Aktarılan", projectIndex);
      requestCount += requests.length;
      recordCount += records.length;
      draftCount += drafts.length;
      return {
        id: id,
        name: name,
        createdAt: createdAt,
        updatedAt: updatedAt,
        exportTarget: typeof raw.exportTarget === "string" ? raw.exportTarget.slice(0, 120) : "",
        archiveCollapsed: raw.archiveCollapsed === true,
        ledger: {
          version: 2,
          project: name,
          projectCreated: true,
          ledgerId: typeof rawLedger.ledgerId === "string" ? rawLedger.ledgerId : "",
          updatedAt: updatedAt,
          requests: requests,
          agents: Array.isArray(rawLedger.agents) ? rawLedger.agents.map(normalizeBackupAgent) : [],
          language: rawLedger.language === "tr" ? "tr" : "en",
          exportBehavior: ["last", "instant"].indexOf(rawLedger.exportBehavior) >= 0 ? rawLedger.exportBehavior : "default",
          lastExport: rawLedger.lastExport && typeof rawLedger.lastExport === "object" ? rawLedger.lastExport : null
        },
        records: records,
        drafts: drafts,
        history: history
      };
    });
    var activeId = typeof data.activeId === "string" && seen[data.activeId] ? data.activeId : projects[0].id;
    return {
      version: 4,
      projects: projects,
      activeId: activeId,
      requestCount: requestCount,
      recordCount: recordCount,
      draftCount: draftCount
    };
  }

  function validateBackupV3(data){
    if(!data || !Array.isArray(data.requests)){
      throw new Error("Geçersiz yedek dosyası: \"requests\" dizisi bulunamadı.");
    }
    if(Number(data.version) > 3) throw new Error("Yedek daha yeni bir sürümle oluşturulmuş.");
    if(data.requests.length > 5000) throw new Error("Yedekte çok fazla talep var.");
    if(Array.isArray(data.records) && data.records.length > 2000) throw new Error("Yedekte çok fazla kayıt var.");
    if(Array.isArray(data.drafts) && data.drafts.length > 2000) throw new Error("Yedekte çok fazla taslak var.");
    if(Array.isArray(data.agents) && data.agents.length > 200) throw new Error("Yedekte çok fazla ajan var.");
    var requests = data.requests.map(function(raw, index){ return core.requests.normalize(raw, index); });
    ensureUniqueRequestIds(requests);
    var records = Array.isArray(data.records) ? data.records : [];
    var drafts = Array.isArray(data.drafts) ? data.drafts : [];
    return {
      version: 3,
      requests: requests,
      records: records,
      drafts: drafts,
      project: normalizeProjectName(data.project) || importedProjectName(data.language),
      ledgerId: typeof data.ledgerId === "string" ? data.ledgerId : "",
      agents: Array.isArray(data.agents) ? data.agents.map(normalizeBackupAgent) : [],
      language: data.language === "tr" ? "tr" : data.language === "en" ? "en" : null,
      exportBehavior: ["last", "instant", "default"].indexOf(data.exportBehavior) >= 0 ? data.exportBehavior : "default",
      lastExport: data.lastExport && typeof data.lastExport === "object" ? data.lastExport : null,
      requestCount: requests.length,
      recordCount: records.length,
      draftCount: drafts.length
    };
  }

  async function restoreRequestMedia(req, entries, stats, projectId){
    for(var j = 0; j < req.images.length; j++){
      var img = req.images[j];
      var file = img.file || core.util.imageFileName(req, j, img);
      var bytes = entries && entries[file] ? entries[file] : null;
      if(bytes){
        try{
          var type = img.type || "image/webp";
          await core.storage.putImage({ id:img.id, blob:new Blob([bytes], { type:type }), type:type, projectId:projectId });
          stats.restoredImages++;
        }catch(err){
          stats.missingImages++;
        }
      }else{
        stats.missingImages++;
      }
      img.file = "";
    }
    for(var k = 0; k < req.attachments.length; k++){
      var att = req.attachments[k];
      var attFile = att.file || core.util.attachmentFileName(req, k, att);
      var attBytes = entries && entries[attFile] ? entries[attFile] : null;
      if(attBytes){
        try{
          var attType = att.type || "application/octet-stream";
          await core.storage.putFile({ id:att.id, blob:new Blob([attBytes], { type:attType }), type:attType, projectId:projectId });
          stats.restoredFiles++;
        }catch(err){
          stats.missingFiles++;
        }
      }else{
        stats.missingFiles++;
      }
      att.file = "";
    }
  }

  async function prepareRestoredRequests(requests, entries, stats, projectId){
    var out = [];
    for(var index = 0; index < requests.length; index++){
      var req = core.requests.normalize(requests[index], index);
      await restoreRequestMedia(req, entries, stats, projectId);
      if(!core.requests.validate(req)) req.confirmed = false;
      out.push(req);
    }
    return out;
  }

  function recalcSnapshot(snapshot, kind, projectId, requests){
    var item = JSON.parse(JSON.stringify(snapshot || {}));
    if(!item.id){
      item.id = (kind === "record" ? "rec_restored_" : kind === "draft" ? "drf_restored_" : "hist_restored_") + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
    }
    item.kind = kind;
    item.projectId = projectId;
    item.requests = requests;
    item.requestCount = requests.length;
    item.imageCount = requests.reduce(function(sum, req){ return sum + (req.images || []).length; }, 0);
    item.fileCount = requests.reduce(function(sum, req){ return sum + (req.attachments || []).length; }, 0);
    try{ item.signature = core.requests.signature(requests); }catch(err){ /* keep */ }
    item.complete = requests.every(function(req){ return core.requests.status(req) === "ready"; });
    item.exported = Boolean(item.exported);
    return item;
  }

  async function applyRestoreV4(plan, entries){
    var stats = { missingImages:0, missingFiles:0, restoredImages:0, restoredFiles:0 };
    cancelScheduledSave();
    var prepared = [];
    for(var p = 0; p < plan.projects.length; p++){
      var project = plan.projects[p];
      var ledgerRequests = await prepareRestoredRequests(project.ledger.requests, entries, stats, project.id);
      var records = [];
      for(var r = 0; r < project.records.length; r++){
        var recRequests = await prepareRestoredRequests(project.records[r].requests || [], entries, stats, project.id);
        records.push(recalcSnapshot(project.records[r], "record", project.id, recRequests));
      }
      var drafts = [];
      for(var d = 0; d < project.drafts.length; d++){
        var draftRequests = await prepareRestoredRequests(project.drafts[d].requests || [], entries, stats, project.id);
        drafts.push(recalcSnapshot(project.drafts[d], "draft", project.id, draftRequests));
      }
      var history = [];
      for(var h = 0; h < project.history.length; h++){
        var histRequests = Array.isArray(project.history[h].requests)
          ? await prepareRestoredRequests(project.history[h].requests, entries, stats, project.id)
          : [];
        history.push(recalcSnapshot(project.history[h], "history", project.id, histRequests));
      }
      prepared.push({
        project: project,
        ledger: Object.assign({}, project.ledger, { requests: ledgerRequests }),
        records: records,
        drafts: drafts,
        history: history
      });
    }

    /* Commit point: the registry write. Ledgers written before it are rolled
       back when the registry write fails. Nothing is cleared before this. */
    var previousRegistry = readRegistry();
    var previousLedgerRaw = {};
    prepared.forEach(function(item){
      var key = projectLedgerKey(item.project.id);
      try{ previousLedgerRaw[key] = localStorage.getItem(key); }catch(err){ previousLedgerRaw[key] = null; }
    });
    try{
      prepared.forEach(function(item){
        localStorage.setItem(projectLedgerKey(item.project.id), JSON.stringify(item.ledger));
      });
      var registry = { version:1, activeId:plan.activeId, projects:prepared.map(function(item){
        return {
          id: item.project.id,
          name: item.project.name,
          createdAt: item.project.createdAt,
          updatedAt: item.project.updatedAt,
          exportTarget: item.project.exportTarget,
          archiveCollapsed: item.project.archiveCollapsed
        };
      }) };
      if(!writeRegistry(registry)) throw new Error("Proje listesi yazılamadı.");
    }catch(err){
      Object.keys(previousLedgerRaw).forEach(function(key){
        try{
          if(previousLedgerRaw[key] == null) localStorage.removeItem(key);
          else localStorage.setItem(key, previousLedgerRaw[key]);
        }catch(ignore){ /* ignore */ }
      });
      throw err;
    }

    /* After the commit the restored per-project archives replace old rows. */
    for(var s = 0; s < prepared.length; s++){
      var ready = prepared[s];
      await withProjectScope(ready.project.id, async function(){
        try{ await core.storage.clearCollection("records"); }catch(err){}
        try{ await core.storage.clearCollection("drafts"); }catch(err){}
        try{ await core.storage.clearHistory(); }catch(err){}
        for(var ri = 0; ri < ready.records.length; ri++) await core.storage.putCollection("records", ready.records[ri]).catch(function(){});
        for(var di = 0; di < ready.drafts.length; di++) await core.storage.putCollection("drafts", ready.drafts[di]).catch(function(){});
        for(var hj = 0; hj < ready.history.length; hj++){
          try{ await core.storage.addHistory(ready.history[hj]); }catch(err){}
        }
      });
    }

    var kept = {};
    prepared.forEach(function(item){ kept[item.project.id] = true; });
    if(previousRegistry){
      for(var o = 0; o < previousRegistry.projects.length; o++){
        var oldProject = previousRegistry.projects[o];
        if(kept[oldProject.id]) continue;
        await deleteProjectScopedData(oldProject.id).catch(function(){});
      }
    }

    cancelScheduledSave();
    activeProjectId = null;
    app = null;
    projectSettingsId = null;
    projectSettingsCounts = null;
    archiveSelectedProjectId = null;
    projectSwitchPending = null;
    projectCreatePending = null;
    projectFormOpen = false;
    projectDeleteConfirm = false;
    closeProjectSettingsModal();
    if(plan.activeId) openProjectById(plan.activeId);
    return { plan:plan, stats:stats };
  }

  async function applyRestoreV3(plan, entries){
    if(!activeProjectId){
      var createdName = normalizeProjectName(plan.project) || importedProjectName(plan.language);
      var id = newProjectId();
      var stamp = nowISO();
      var registry = readRegistry() || emptyProjectRegistry();
      registry.projects.push({ id:id, name:createdName, createdAt:stamp, updatedAt:stamp, exportTarget:"", archiveCollapsed:false });
      registry.activeId = id;
      if(!writeRegistry(registry)) throw new Error("Proje listesi yazılamadı.");
      try{
        localStorage.setItem(projectLedgerKey(id), JSON.stringify({
          version:2, project:createdName, projectCreated:true, ledgerId:newLedgerId(), updatedAt:stamp,
          requests:[], agents:[], language:state.lang, exportBehavior:"default", lastExport:null
        }));
      }catch(err){ /* the save below retries */ }
      syncStorageScope();
      var created = findProjectRecord(id);
      if(created) loadProjectIntoMemory(id, created);
    }

    var projectId = activeProjectId;
    var project = activeProjectRecord();
    if(!project) throw new Error("Proje bulunamadı.");
    var stats = { missingImages:0, missingFiles:0, restoredImages:0, restoredFiles:0 };
    cancelScheduledSave();
    var requests = await prepareRestoredRequests(plan.requests, entries, stats, projectId);
    var records = [];
    for(var r = 0; r < plan.records.length; r++){
      var recRequests = await prepareRestoredRequests(plan.records[r].requests || [], entries, stats, projectId);
      records.push(recalcSnapshot(plan.records[r], "record", projectId, recRequests));
    }
    var drafts = [];
    for(var d = 0; d < plan.drafts.length; d++){
      var draftRequests = await prepareRestoredRequests(plan.drafts[d].requests || [], entries, stats, projectId);
      drafts.push(recalcSnapshot(plan.drafts[d], "draft", projectId, draftRequests));
    }

    var name = plan.project || project.name;
    var ledger = {
      version: 2,
      project: name,
      projectCreated: true,
      ledgerId: plan.ledgerId || (app && app.ledgerId) || newLedgerId(),
      updatedAt: nowISO(),
      requests: requests.map(function(req){ return core.requests.serialize(req); }),
      agents: plan.agents,
      language: plan.language || (app && app.language) || "en",
      exportBehavior: plan.exportBehavior,
      lastExport: plan.lastExport
    };
    var previousRaw = null;
    try{ previousRaw = localStorage.getItem(projectLedgerKey(projectId)); }catch(err){ previousRaw = null; }
    try{
      localStorage.setItem(projectLedgerKey(projectId), JSON.stringify(ledger));
      var rec = updateProjectRecord(projectId, { name:name, updatedAt:ledger.updatedAt });
      if(!rec) throw new Error("Proje listesi yazılamadı.");
    }catch(err){
      try{
        if(previousRaw == null) localStorage.removeItem(projectLedgerKey(projectId));
        else localStorage.setItem(projectLedgerKey(projectId), previousRaw);
      }catch(ignore){ /* ignore */ }
      throw err;
    }

    await withProjectScope(projectId, async function(){
      try{ await core.storage.clearCollection("records"); }catch(err){}
      try{ await core.storage.clearCollection("drafts"); }catch(err){}
      for(var ri = 0; ri < records.length; ri++) await core.storage.putCollection("records", records[ri]).catch(function(){});
      for(var di = 0; di < drafts.length; di++) await core.storage.putCollection("drafts", drafts[di]).catch(function(){});
    });

    var restored = findProjectRecord(projectId);
    if(restored) openProjectById(projectId);
    return { plan:plan, stats:stats };
  }
