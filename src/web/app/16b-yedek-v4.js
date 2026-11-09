  /* ============================================================
     Yedek v4 · çok projeli yedek ve geri yükleme
     ============================================================ */
  /* Version 4 backs up the project registry, every project ledger and every
     project-scoped snapshot. Media stays in the ZIP under a per-project
     folder. Restore validates the complete document before it writes or
     clears anything. */

  function backupProjectFolder(projectId){
    const safe = String(projectId || "proje").replace(/[^A-Za-z0-9_-]/g, "-");
    return "p-" + safe;
  }

  function backupProjectMediaPath(projectId, kind, item){
    return backupProjectFolder(projectId) + "/" + backupMediaFileName(kind, item);
  }

  function createBackupMediaCollector(){
    const images = [];
    const attachments = [];
    const imageFiles = new Map();
    const attachmentFiles = new Map();
    function imageMapper(projectId){
      return function(img){
        const key = projectId + "|" + img.id;
        let file = imageFiles.get(key);
        if(!file){
          file = backupProjectMediaPath(projectId, "image", img);
          imageFiles.set(key, file);
          images.push({ projectId: projectId, file: file, img: img });
        }
        return Object.assign({}, img, { file: file });
      };
    }
    function attachmentMapper(projectId){
      return function(att){
        const key = projectId + "|" + att.id;
        let file = attachmentFiles.get(key);
        if(!file){
          file = backupProjectMediaPath(projectId, "attachment", att);
          attachmentFiles.set(key, file);
          attachments.push({ projectId: projectId, file: file, att: att });
        }
        return Object.assign({}, att, { file: file });
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
    const copy = Object.assign({}, req);
    copy.images = [];
    copy.attachments = [];
    return copy;
  }

  function normalizeAgentForBackup(agent){
    const normalized = normalizeAgent(agent);
    return { id: normalized.id, name: normalized.name, role: normalized.role, mdPath: normalized.mdPath };
  }

  async function buildProjectBackupEntry(project, collector, includeMedia){
    const ledger = readProjectLedgerPayload(project.id) || {
      version: 2,
      project: project.name,
      projectCreated: true,
      ledgerId: "",
      requests: [],
      agents: [],
      language: state.language,
      exportBehavior: "default",
      lastExport: null
    };
    const rawRequests = Array.isArray(ledger.requests) ? ledger.requests : [];
    const requests = rawRequests.map(function(raw, index){ return normalizeRequest(raw, index); });
    const archives = await Promise.all([
      idbCollectionGetAll(RECORDS_STORE, project.id),
      idbCollectionGetAll(DRAFTS_STORE, project.id),
      idbHistoryGetAll(project.id)
    ]);
    const recordList = archives[0] || [];
    const draftList = archives[1] || [];
    const historyList = archives[2] || [];
    const mapImage = includeMedia ? collector.imageMapper(project.id) : null;
    const mapAttachment = includeMedia ? collector.attachmentMapper(project.id) : null;
    function serializeRequestForBackup(req){
      const item = serializeRequest(req, mapImage, mapAttachment);
      return includeMedia ? item : stripBackupRequestMedia(item);
    }
    function serializeSnapshot(snapshot){
      const copy = JSON.parse(JSON.stringify(snapshot || {}));
      delete copy.projectId;
      copy.requests = (Array.isArray(snapshot && snapshot.requests) ? snapshot.requests : []).map(function(raw, index){
        return serializeRequestForBackup(normalizeRequest(raw, index));
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
        agents: Array.isArray(ledger.agents) ? ledger.agents.map(normalizeAgentForBackup) : [],
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
    const registry = readRegistry() || emptyProjectRegistry();
    const collector = createBackupMediaCollector();
    const projects = [];
    for(const project of registry.projects){
      projects.push(await buildProjectBackupEntry(project, collector, includeMedia));
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

  function validBackupStamp(value, fallback){
    if(typeof value !== "string" || !value) return fallback;
    const date = new Date(value);
    return isNaN(date.getTime()) ? fallback : value;
  }

  function ensureUniqueRequestIds(requests){
    const seen = new Set();
    requests.forEach(function(req, index){
      if(!seen.has(req.id)){
        seen.add(req.id);
        return;
      }
      let attempt = 1;
      let next = "IST-" + String(index + 1).padStart(3, "0") + "-" + attempt;
      while(seen.has(next)){
        attempt++;
        next = "IST-" + String(index + 1).padStart(3, "0") + "-" + attempt;
      }
      req.id = next;
      seen.add(next);
    });
  }

  function validateBackupSnapshotList(list, label, projectIndex){
    if(list == null) return [];
    if(!Array.isArray(list)) throw new Error("Geçersiz yedek: " + label + " listesi okunamadı.");
    if(list.length > 2000) throw new Error("Yedekte çok fazla " + label.toLowerCase() + " var.");
    return list.map(function(raw, itemIndex){
      if(!raw || typeof raw !== "object") throw new Error("Geçersiz yedek: " + label + " kaydı okunamadı.");
      const copy = JSON.parse(JSON.stringify(raw));
      copy.id = String(copy.id || ("restored_" + projectIndex + "_" + itemIndex));
      const requests = Array.isArray(copy.requests) ? copy.requests : [];
      if(requests.length > 5000) throw new Error("Yedekte çok fazla talep var.");
      copy.requests = requests.map(function(item, index){ return normalizeRequest(item, index); });
      ensureUniqueRequestIds(copy.requests);
      return copy;
    });
  }

  function validateBackupV4(data){
    if(!data || typeof data !== "object") throw new Error("Geçersiz yedek dosyası.");
    if(data.app && data.app !== "istek-defteri") throw new Error("Bu dosya bir Request Ledger yedeği değil.");
    if(Number(data.version) !== 4) throw new Error("Geçersiz yedek sürümü.");
    const list = data.projects;
    if(!Array.isArray(list) || !list.length) throw new Error("Yedekte proje bulunamadı.");
    if(list.length > 200) throw new Error("Yedekte çok fazla proje var.");
    const seen = new Set();
    const now = nowISO();
    let requestCount = 0;
    let recordCount = 0;
    let draftCount = 0;
    const projects = list.map(function(raw, projectIndex){
      if(!raw || typeof raw !== "object") throw new Error("Geçersiz yedek: proje kaydı okunamadı.");
      const id = typeof raw.id === "string" && /^prj_[A-Za-z0-9_]+$/.test(raw.id) ? raw.id : "";
      if(!id) throw new Error("Geçersiz yedek: proje kimliği okunamadı.");
      if(seen.has(id)) throw new Error("Geçersiz yedek: proje kimliği tekrar ediyor.");
      seen.add(id);
      const name = normalizeProjectName(raw.name);
      if(!name) throw new Error("Geçersiz yedek: proje adı boş.");
      const rawLedger = raw.ledger;
      if(!rawLedger || typeof rawLedger !== "object" || !Array.isArray(rawLedger.requests)){
        throw new Error("Geçersiz yedek: " + name + " defteri okunamadı.");
      }
      if(rawLedger.requests.length > 5000) throw new Error("Yedekte çok fazla talep var.");
      const requests = rawLedger.requests.map(function(item, index){ return normalizeRequest(item, index); });
      ensureUniqueRequestIds(requests);
      if(Array.isArray(rawLedger.agents) && rawLedger.agents.length > 200){
        throw new Error("Yedekte çok fazla ajan var.");
      }
      const createdAt = validBackupStamp(raw.createdAt, now);
      const updatedAt = validBackupStamp(raw.updatedAt, createdAt);
      const records = validateBackupSnapshotList(raw.records, "Kayıt", projectIndex);
      const drafts = validateBackupSnapshotList(raw.drafts, "Taslak", projectIndex);
      const history = validateBackupSnapshotList(raw.history, "Dışa Aktarılan", projectIndex);
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
          agents: Array.isArray(rawLedger.agents) ? rawLedger.agents.map(normalizeAgent) : [],
          language: rawLedger.language === "tr" ? "tr" : "en",
          exportBehavior: ["last", "instant"].indexOf(rawLedger.exportBehavior) >= 0 ? rawLedger.exportBehavior : "default",
          lastExport: rawLedger.lastExport && typeof rawLedger.lastExport === "object" ? rawLedger.lastExport : null
        },
        records: records,
        drafts: drafts,
        history: history
      };
    });
    const activeId = typeof data.activeId === "string" && seen.has(data.activeId) ? data.activeId : projects[0].id;
    return {
      projects: projects,
      activeId: activeId,
      requestCount: requestCount,
      recordCount: recordCount,
      draftCount: draftCount
    };
  }

  async function prepareRestoredRequests(requests, entries, stats, projectId){
    const out = [];
    for(let index = 0; index < requests.length; index++){
      const req = normalizeRequest(requests[index], index);
      await restoreRequestMedia(req, entries, stats, projectId);
      if(!isAutoValid(req)) req.confirmed = false;
      out.push(req);
    }
    return out;
  }

  async function applyRestoreV4(plan, entries){
    const stats = { missingImages: 0, missingFiles: 0 };
    cancelScheduledSave();
    const prepared = [];
    for(const project of plan.projects){
      const ledgerRequests = await prepareRestoredRequests(project.ledger.requests, entries, stats, project.id);
      const records = [];
      for(const raw of project.records){
        const record = JSON.parse(JSON.stringify(raw));
        record.projectId = project.id;
        record.requests = await prepareRestoredRequests(record.requests || [], entries, stats, project.id);
        record.requestCount = record.requests.length;
        record.imageCount = record.requests.reduce(function(sum, req){ return sum + req.images.length; }, 0);
        record.fileCount = record.requests.reduce(function(sum, req){
          return sum + (typeTemplate(req.type).attachments ? req.attachments.length : 0);
        }, 0);
        record.signature = requestsSignature(record.requests);
        record.complete = record.requests.every(function(req){ return requestStatus(req) === "ready"; });
        records.push(record);
      }
      const drafts = [];
      for(const raw of project.drafts){
        const draft = JSON.parse(JSON.stringify(raw));
        draft.projectId = project.id;
        draft.requests = await prepareRestoredRequests(draft.requests || [], entries, stats, project.id);
        draft.requestCount = draft.requests.length;
        draft.imageCount = draft.requests.reduce(function(sum, req){ return sum + req.images.length; }, 0);
        draft.fileCount = draft.requests.reduce(function(sum, req){
          return sum + (typeTemplate(req.type).attachments ? req.attachments.length : 0);
        }, 0);
        drafts.push(draft);
      }
      const history = [];
      for(const raw of project.history){
        const entry = JSON.parse(JSON.stringify(raw));
        entry.projectId = project.id;
        if(Array.isArray(entry.requests)){
          entry.requests = await prepareRestoredRequests(entry.requests, entries, stats, project.id);
        }
        history.push(entry);
      }
      prepared.push({
        project: project,
        ledger: Object.assign({}, project.ledger, { requests: ledgerRequests }),
        records: records,
        drafts: drafts,
        history: history
      });
    }

    /* Commit point: the registry write. Ledgers already written are rolled back
       if the registry write fails; nothing is cleared before this point. */
    const previousRegistry = readRegistry();
    const previousLedgerRaw = new Map();
    for(const item of prepared){
      const key = projectLedgerKey(item.project.id);
      previousLedgerRaw.set(key, localStorage.getItem(key));
    }
    try{
      for(const item of prepared){
        localStorage.setItem(projectLedgerKey(item.project.id), JSON.stringify(item.ledger));
      }
      const registry = {
        version: 1,
        activeId: plan.activeId,
        projects: prepared.map(function(item){
          return {
            id: item.project.id,
            name: item.project.name,
            createdAt: item.project.createdAt,
            updatedAt: item.project.updatedAt,
            exportTarget: item.project.exportTarget,
            archiveCollapsed: item.project.archiveCollapsed
          };
        })
      };
      if(!writeRegistry(registry)) throw new Error("Proje listesi yazılamadı.");
    }catch(err){
      previousLedgerRaw.forEach(function(value, key){
        try{
          if(value == null) localStorage.removeItem(key);
          else localStorage.setItem(key, value);
        }catch(ignore){}
      });
      throw err;
    }

    /* After the commit the restored per-project archives replace the old rows. */
    for(const item of prepared){
      const projectId = item.project.id;
      await idbCollectionClear(RECORDS_STORE, projectId).catch(function(){});
      await idbCollectionClear(DRAFTS_STORE, projectId).catch(function(){});
      await idbHistoryClear(projectId).catch(function(){});
      for(const record of item.records){ await idbCollectionPut(RECORDS_STORE, record).catch(function(){}); }
      for(const draft of item.drafts){ await idbCollectionPut(DRAFTS_STORE, draft).catch(function(){}); }
      for(const entry of item.history){ await idbHistoryPut(entry).catch(function(){}); }
    }

    const keptIds = new Set(prepared.map(function(item){ return item.project.id; }));
    if(previousRegistry){
      for(const oldProject of previousRegistry.projects){
        if(keptIds.has(oldProject.id)) continue;
        await deleteProjectData(oldProject.id).catch(function(){});
      }
    }

    cancelScheduledSave();
    activeProjectId = null;
    projectSnapshot = null;
    projectSettingsId = null;
    archiveSelectedProjectId = null;
    targetFolderHandle = null;
    targetFolderNeedsPermission = false;
    records = [];
    drafts = [];
    historyItems = [];
    clearImageURLs();
    closeModal($("#projectSettingsModal"));
    closeModal($("#backupModal"));
    if(plan.activeId){
      openProjectById(plan.activeId);
    }else{
      projectScreen = "picker";
      renderProjectGate();
    }
    const isEn = state.language === "en";
    const projectPart = isEn ? plan.projects.length + " " + (plan.projects.length === 1 ? "project" : "projects") : plan.projects.length + " proje";
    const requestPart = isEn ? plan.requestCount + " " + (plan.requestCount === 1 ? "request" : "requests") : plan.requestCount + " talep";
    const recordPart = isEn ? plan.recordCount + " " + (plan.recordCount === 1 ? "record" : "records") : plan.recordCount + " kayıt";
    let message = isEn
      ? projectPart + ", " + requestPart + " and " + recordPart + " restored."
      : projectPart + ", " + requestPart + " ve " + recordPart + " geri yüklendi.";
    const missingParts = [];
    if(stats.missingImages) missingParts.push(stats.missingImages + (isEn ? (stats.missingImages === 1 ? " image" : " images") : " görsel"));
    if(stats.missingFiles) missingParts.push(stats.missingFiles + (isEn ? (stats.missingFiles === 1 ? " file" : " files") : " dosya"));
    if(missingParts.length){
      message += " " + missingParts.join(isEn ? " and " : " ve ") + (isEn ? " could not be found." : " bulunamadı.");
    }
    showToast(message, missingParts.length ? "error" : "ok");
  }

  function requestRestoreV4(data, entries){
    const plan = validateBackupV4(data);
    const isEn = state.language === "en";
    const projectPart = isEn ? plan.projects.length + " " + (plan.projects.length === 1 ? "project" : "projects") : plan.projects.length + " proje";
    const requestPart = isEn ? plan.requestCount + " " + (plan.requestCount === 1 ? "request" : "requests") : plan.requestCount + " talep";
    const recordPart = isEn ? plan.recordCount + " " + (plan.recordCount === 1 ? "record" : "records") : plan.recordCount + " kayıt";
    const message = isEn
      ? projectPart + ", " + requestPart + " and " + recordPart + " will be restored. Every current project and its data will be replaced by the backup. Continue?"
      : projectPart + ", " + requestPart + " ve " + recordPart + " geri yüklenecek. Mevcut tüm projeler ve verileri yedekteki verilerle değiştirilecek. Devam etmek istiyor musun?";
    openConfirm({
      title: "Yedeği geri yükle",
      message: message,
      confirmLabel: "Geri yükle",
      danger: true,
      onConfirm: async function(){
        await applyRestoreV4(plan, entries);
      }
    });
  }
