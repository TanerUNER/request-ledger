  /* ============================================================
     Proje kayıt defteri (workspace)
     ============================================================ */
  /* One registry lists every project; each project keeps its own ledger
     payload under PROJECT_LEDGER_PREFIX + id. The legacy key stays untouched
     so the extension bridge and the one-time migration keep working. */

  function newProjectId(){
    return "prj_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  }
  function projectLedgerKey(projectId){
    return PROJECT_LEDGER_PREFIX + projectId;
  }
  function emptyProjectRegistry(){
    return { version: 1, activeId: null, projects: [] };
  }
  /* A legacy install has no project name of its own. The neutral label is
     translated with the current interface language; a stored name always wins. */
  function importedProjectName(lang){
    if(lang === "tr") return "İçe aktarılan proje";
    if(lang === "en") return "Imported project";
    return translateString("İçe aktarılan proje");
  }
  function isLegacyDefaultProjectName(name){
    const value = normalizeProjectName(name);
    return value === "Ortak Zemin" || value === "Common Ground";
  }
  function serverFolderMode(){
    return window.location.protocol === "http:" && Number(window.location.port) > 0;
  }

  async function serverProjectFolder(projectId, name, currentFolder){
    if(!serverFolderMode()) return "";
    const project = projectId ? findProjectRecord(projectId) : null;
    const body = {
      projectId: projectId || "",
      name: name || (project ? project.name : ""),
      slug: currentFolder || (project && project.folder) || ""
    };
    try{
      const response = await fetch("/__rl/projects", {
        method:"POST",
        headers:{ "content-type":"application/json" },
        body:JSON.stringify(body)
      });
      const data = await response.json();
      if(!response.ok || !data || data.ok !== true || !data.slug) return "";
      if(projectId) updateProjectRecord(projectId, { folder:data.slug });
      return data.slug;
    }catch(err){
      return "";
    }
  }

  async function serverSaveProject(projectId){
    if(!serverFolderMode()) return false;
    const id = projectId || activeProjectId;
    if(!id) return false;
    const project = findProjectRecord(id);
    if(!project) return false;
    const slug = project.folder || await serverProjectFolder(id, project.name, project.folder);
    if(!slug) return false;
    try{
      const response = await fetch("/__rl/save", {
        method:"POST",
        headers:{ "content-type":"application/json" },
        body:JSON.stringify({
          projectId:id,
          name:project.name,
          slug:slug,
          snapshot:ledgerPayload(),
          archive:{
            records: (typeof records !== "undefined" && Array.isArray(records)) ? records : [],
            drafts: (typeof drafts !== "undefined" && Array.isArray(drafts)) ? drafts : [],
            history: (typeof historyItems !== "undefined" && Array.isArray(historyItems)) ? historyItems : []
          },
          archiveCollapsed: project.archiveCollapsed === true
        })
      });
      const data = await response.json();
      return response.ok && data && data.ok === true;
    }catch(err){
      return false;
    }
  }

  async function serverExportFile(filename, blob, projectId){
    if(!serverFolderMode()) return false;
    const id = projectId || activeProjectId;
    const project = id ? findProjectRecord(id) : null;
    if(!project) return false;
    const slug = project.folder || await serverProjectFolder(id, project.name, project.folder);
    if(!slug) return false;
    try{
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for(let i = 0; i < bytes.length; i += 0x8000){
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      }
      const response = await fetch("/__rl/export", {
        method:"POST",
        headers:{ "content-type":"application/json" },
        body:JSON.stringify({
          projectId:id,
          name:project.name,
          slug:slug,
          files:[{ name:filename, encoding:"base64", content:btoa(binary) }]
        })
      });
      const data = await response.json();
      return response.ok && data && data.ok === true;
    }catch(err){
      return false;
    }
  }

  async function serverProjectList(){
    if(!serverFolderMode()) return [];
    try{
      const response = await fetch("/__rl/projects", { cache:"no-store" });
      const data = await response.json();
      return data && data.ok && Array.isArray(data.projects) ? data.projects : [];
    }catch(err){
      return [];
    }
  }

  function normalizeLedgerId(value){
    return typeof value === "string" && value.trim() && value.trim().length <= 120 ? value.trim() : "";
  }
  function normalizeProjectRecord(record){
    if(!record || typeof record !== "object") return null;
    const id = typeof record.id === "string" && /^prj_[A-Za-z0-9_]+$/.test(record.id) ? record.id : "";
    if(!id) return null;
    const name = normalizeProjectName(record.name) || importedProjectName();
    const createdAt = typeof record.createdAt === "string" && record.createdAt ? record.createdAt : nowISO();
    const updatedAt = typeof record.updatedAt === "string" && record.updatedAt ? record.updatedAt : createdAt;
    return {
      id: id,
      name: name,
      createdAt: createdAt,
      updatedAt: updatedAt,
      /* The project registry owns the one ledger identity for this project.
         It is written at creation and whenever a bridge choice/adoption
         changes the ledger. */
      ledgerId: normalizeLedgerId(record.ledgerId),
      folder: typeof record.folder === "string" ? record.folder.slice(0, 120) : "",
      exportTarget: typeof record.exportTarget === "string" ? record.exportTarget.slice(0, 120) : "",
      archiveCollapsed: record.archiveCollapsed === true
    };
  }
  function readRegistry(){
    try{
      const raw = localStorage.getItem(PROJECTS_KEY);
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      if(!parsed || !Array.isArray(parsed.projects)) return null;
      const projects = parsed.projects.map(normalizeProjectRecord).filter(Boolean);
      const activeId = typeof parsed.activeId === "string" && projects.some(function(project){ return project.id === parsed.activeId; })
        ? parsed.activeId
        : null;
      /* Existing installs may still carry the old folder-derived default.
         Rename it in place to the neutral translated label; the project stays
         a normal, deletable project. */
      let renamed = false;
      projects.forEach(function(project){
        if(isLegacyDefaultProjectName(project.name)){
          project.name = importedProjectName();
          renamed = true;
        }
      });
      const registry = { version: 1, activeId: activeId, projects: projects };
      if(renamed){
        try{ localStorage.setItem(PROJECTS_KEY, JSON.stringify(registry)); }catch(err){ /* quota */ }
      }
      return registry;
    }catch(err){
      console.warn("Proje listesi okunamadı", err);
      return null;
    }
  }
  function writeRegistry(registry){
    try{
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(registry));
      return true;
    }catch(err){
      console.warn("Proje listesi yazılamadı", err);
      return false;
    }
  }
  function findProjectRecord(projectId){
    const registry = readRegistry();
    if(!registry) return null;
    for(const project of registry.projects){
      if(project.id === projectId) return project;
    }
    return null;
  }
  /* One-time migration: a legacy single-ledger install becomes one project.
     The legacy payload keeps its own project name when present; otherwise the
     neutral translated "Imported project" label is used. */
  function initProjectRegistry(){
    let registry = readRegistry();
    if(registry) return registry;
    let legacyRaw = null;
    try{ legacyRaw = localStorage.getItem(STORAGE_KEY); }catch(err){ legacyRaw = null; }
    if(legacyRaw){
      let legacy = null;
      try{ legacy = JSON.parse(legacyRaw); }catch(err){ legacy = null; }
      if(legacy && Array.isArray(legacy.requests)){
        const id = newProjectId();
        const stamp = typeof legacy.updatedAt === "string" && legacy.updatedAt ? legacy.updatedAt : nowISO();
        const legacyName = normalizeProjectName(legacy.project);
        const project = {
          id: id,
          name: isLegacyDefaultProjectName(legacyName)
            ? importedProjectName(legacy.language)
            : (legacyName || importedProjectName(legacy.language)),
          createdAt: stamp,
          updatedAt: stamp,
          ledgerId: normalizeLedgerId(legacy.ledgerId) || newLedgerId(),
          exportTarget: "",
          archiveCollapsed: false
        };
        registry = { version: 1, activeId: id, projects: [project] };
        try{ localStorage.setItem(projectLedgerKey(id), legacyRaw); }catch(err){ /* quota: keep legacy */ }
        writeRegistry(registry);
        migratedProjectId = id;
        return registry;
      }
    }
    return emptyProjectRegistry();
  }
  function syncActiveProjectRecord(updatedAt){
    if(!activeProjectId) return;
    const registry = readRegistry();
    if(!registry) return;
    for(const project of registry.projects){
      if(project.id !== activeProjectId) continue;
      project.name = normalizeProjectName(state.project) || project.name;
      project.updatedAt = updatedAt || project.updatedAt;
      project.ledgerId = normalizeLedgerId(state.ledgerId) || project.ledgerId;
      if(targetFolderHandle && targetFolderHandle.name){
        project.exportTarget = String(targetFolderHandle.name).slice(0, 120);
      }
      registry.activeId = activeProjectId;
      writeRegistry(registry);
      return;
    }
  }
  function setProjectExportTarget(value){
    if(!activeProjectId) return;
    setProjectExportTargetFor(activeProjectId, value);
  }
  function setProjectExportTargetFor(projectId, value){
    if(!projectId) return;
    const registry = readRegistry();
    if(!registry) return;
    for(const project of registry.projects){
      if(project.id !== projectId) continue;
      project.exportTarget = String(value == null ? "" : value).slice(0, 120);
      writeRegistry(registry);
      return;
    }
  }
  function updateProjectRecord(projectId, patch){
    if(!projectId) return null;
    const registry = readRegistry();
    if(!registry) return null;
    for(const project of registry.projects){
      if(project.id !== projectId) continue;
      if(patch && typeof patch === "object"){
        if(typeof patch.name === "string") project.name = normalizeProjectName(patch.name) || project.name;
        if(typeof patch.updatedAt === "string" && patch.updatedAt) project.updatedAt = patch.updatedAt;
        if(normalizeLedgerId(patch.ledgerId)) project.ledgerId = normalizeLedgerId(patch.ledgerId);
        if(typeof patch.folder === "string") project.folder = patch.folder.slice(0, 120);
        if(typeof patch.exportTarget === "string") project.exportTarget = patch.exportTarget.slice(0, 120);
        if(typeof patch.archiveCollapsed === "boolean") project.archiveCollapsed = patch.archiveCollapsed;
      }
      writeRegistry(registry);
      return project;
    }
    return null;
  }
  function setProjectArchiveCollapsed(projectId, collapsed){
    return updateProjectRecord(projectId, { archiveCollapsed: Boolean(collapsed) });
  }
  function renameProjectRecord(projectId, name){
    const value = normalizeProjectName(name);
    if(!value) return null;
    return updateProjectRecord(projectId, { name: value });
  }
  function removeProjectRecord(projectId){
    const registry = readRegistry();
    if(!registry) return null;
    const index = registry.projects.findIndex(function(project){ return project.id === projectId; });
    if(index < 0) return null;
    registry.projects.splice(index, 1);
    if(registry.activeId === projectId){
      const next = registry.projects.slice().sort(function(a, b){
        return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
      })[0];
      registry.activeId = next ? next.id : null;
    }
    if(!writeRegistry(registry)) return null;
    return registry;
  }
  function readProjectLedgerPayload(projectId){
    try{
      const raw = localStorage.getItem(projectLedgerKey(projectId));
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && Array.isArray(parsed.requests) ? parsed : null;
    }catch(err){
      return null;
    }
  }
  /* One ledger identity per project. The registry is the source of truth once
     it carries an id; the ledger payload is kept in sync so a bridge peer or a
     backup never sees a second id for the same project. */
  function setProjectLedgerId(projectId, ledgerId){
    const value = normalizeLedgerId(ledgerId);
    if(!projectId || !value) return "";
    const registry = readRegistry();
    if(registry){
      let changed = false;
      for(const project of registry.projects){
        if(project.id !== projectId) continue;
        if(project.ledgerId !== value){
          project.ledgerId = value;
          changed = true;
        }
        break;
      }
      if(changed) writeRegistry(registry);
    }
    const payload = readProjectLedgerPayload(projectId);
    if(payload && normalizeLedgerId(payload.ledgerId) !== value){
      try{
        payload.ledgerId = value;
        localStorage.setItem(projectLedgerKey(projectId), JSON.stringify(payload));
      }catch(err){ /* the next save retries */ }
    }
    return value;
  }
  function resolveProjectLedgerId(projectId, preferredLedgerId){
    const preferred = normalizeLedgerId(preferredLedgerId);
    if(!projectId) return preferred || newLedgerId();
    if(preferred){
      setProjectLedgerId(projectId, preferred);
      return preferred;
    }
    const project = findProjectRecord(projectId);
    const registryId = project ? normalizeLedgerId(project.ledgerId) : "";
    if(registryId) return registryId;
    const payload = readProjectLedgerPayload(projectId);
    const payloadId = payload ? normalizeLedgerId(payload.ledgerId) : "";
    const next = payloadId || newLedgerId();
    setProjectLedgerId(projectId, next);
    return next;
  }
  /* Phase 1 stored media and snapshots globally. The one-time scope migration
     stamps every record without a projectId into the migrated project, or the
     last active project when no legacy ledger was migrated. */
  function legacyScopeTarget(registry){
    if(migratedProjectId) return migratedProjectId;
    if(!registry) return null;
    if(registry.activeId) return registry.activeId;
    const sorted = registry.projects.slice().sort(function(a, b){
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    });
    return sorted.length ? sorted[0].id : null;
  }
  function legacyScopeMigrated(){
    try{ return localStorage.getItem(PROJECT_SCOPE_KEY) === "1"; }catch(err){ return false; }
  }
  function markLegacyScopeMigrated(){
    try{ localStorage.setItem(PROJECT_SCOPE_KEY, "1"); }catch(err){ /* quota */ }
  }
  /* The full scan runs once per install; every row written afterwards is
     stamped by withProjectScope, so repeating it would only cost startup time. */
  async function migrateLegacyScope(target){
    if(!target || legacyScopeMigrated()) return 0;
    const stamped = await stampLegacyProjectScope(target);
    markLegacyScopeMigrated();
    return stamped;
  }
  function targetFolderSettingId(){
    return "targetFolder:" + activeProjectId;
  }
  function projectRequestCount(projectId){
    if(projectId === activeProjectId) return state.requests.length;
    const parsed = readProjectLedgerPayload(projectId);
    return parsed ? parsed.requests.length : 0;
  }
  function formatProjectDate(value){
    if(!value) return "";
    const date = new Date(value);
    if(isNaN(date.getTime())) return "";
    try{
      return new Intl.DateTimeFormat(state.language === "en" ? "en-US" : "tr-TR", { day:"2-digit", month:"short", year:"numeric" }).format(date);
    }catch(err){
      return date.toLocaleDateString(state.language === "en" ? "en-US" : "tr-TR");
    }
  }
