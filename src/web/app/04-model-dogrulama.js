  /* ============================================================
     Model / doğrulama
     ============================================================ */
  function typeInfo(id){
    return TYPE_MAP[id] || TYPES[0];
  }
  function priorityInfo(id){
    return PRIORITY_MAP[id] || PRIORITIES[1];
  }
  function agentRoleInfo(id){
    return AGENT_ROLE_MAP[id] || AGENT_ROLES[6];
  }
  function agentRoleLabel(id){
    return agentRoleInfo(id).label;
  }
  function agentDisplayName(agent){
    if(!agent) return "";
    return (agent.name && agent.name.trim()) ? agent.name.trim() : agentRoleLabel(agent.role);
  }
  function sortAgentsByRole(list){
    return (list || []).slice().sort(function(a, b){
      const orderA = AGENT_ROLE_ORDER[a.role] == null ? 99 : AGENT_ROLE_ORDER[a.role];
      const orderB = AGENT_ROLE_ORDER[b.role] == null ? 99 : AGENT_ROLE_ORDER[b.role];
      if(orderA !== orderB) return orderA - orderB;
      return agentDisplayName(a).localeCompare(agentDisplayName(b), "tr");
    });
  }
  function normalizeAgent(raw){
    raw = raw || {};
    const role = AGENT_ROLE_MAP[raw.role] ? raw.role : "general";
    let id = String(raw.id || "").trim();
    if(!/^[A-Za-z0-9_-]{1,60}$/.test(id)) id = "agent_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    return {
      id: id,
      name: String(raw.name || "").slice(0, 80),
      role: role,
      mdPath: String(raw.mdPath || raw.mdFile || "").slice(0, 300)
    };
  }
  function makeAgent(){
    return {
      id: "agent_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      name: "",
      role: "general",
      mdPath: ""
    };
  }
  function preferredNewAgentRole(){
    const used = new Set(state.agents.map(function(agent){ return agent.role; }));
    $$("#agentSettingsList .agent-setting__role .cselect").forEach(function(control){
      if(control.dataset && control.dataset.value) used.add(control.dataset.value);
    });
    const role = AGENT_ROLES.find(function(item){ return !used.has(item.id); });
    return role ? role.id : "general";
  }
  function typeTemplate(id){
    return TYPE_TEMPLATES[id] || TYPE_TEMPLATES.update;
  }
  function isAutoValid(req){
    if(!req) return false;
    if(!req.title || !req.title.trim()) return false;
    if(!req.description || !req.description.trim()) return false;
    if(!TYPE_MAP[req.type]) return false;
    if(!PRIORITY_MAP[req.priority]) return false;
    return true;
  }
  function missingFields(req){
    const out = [];
    if(!req.title || !req.title.trim()) out.push({ key:"title", label:"Başlık" });
    if(!req.description || !req.description.trim()) out.push({ key:"description", label:"Açıklama" });
    return out;
  }
  function requestStatus(req){
    if(!isAutoValid(req)) return "missing";
    if(!req.confirmed) return "pending";
    return "ready";
  }
  function getReq(id){
    for(let i = 0; i < state.requests.length; i++){
      if(state.requests[i].id === id) return state.requests[i];
    }
    return null;
  }
  function getRowEl(id){
    return $$("#reqList .req").find(function(el){ return el.dataset.id === id; }) || null;
  }
  function incompleteRequests(){
    return state.requests.filter(function(req){ return requestStatus(req) !== "ready"; });
  }
  function nextId(){
    let max = 0;
    state.requests.forEach(function(req){
      const match = /^IST-(\d+)$/.exec(req.id);
      if(match) max = Math.max(max, parseInt(match[1], 10));
    });
    return "IST-" + String(max + 1).padStart(3, "0");
  }
  function makeNewRequest(typeId){
    const now = nowISO();
    return {
      id: nextId(),
      type: TYPE_MAP[typeId] ? typeId : "feature",
      title: "",
      page: "",
      location: "",
      consoleError: "",
      description: "",
      priority: "normal",
      link: "",
      sampleWebsite: "",
      note: "",
      images: [],
      attachments: [],
      confirmed: false,
      collapsed: false,
      createdAt: now,
      updatedAt: now
    };
  }
  function normalizeRequest(raw, index){
    raw = raw || {};
    let id = String(raw.id || "").trim();
    if(!/^[A-Za-z0-9_-]{1,40}$/.test(id)) id = "IST-" + String(index + 1).padStart(3, "0");
    const req = {
      id: id,
      type: TYPE_MAP[raw.type] ? raw.type : "update",
      title: String(raw.title || ""),
      page: String(raw.page || ""),
      location: String(raw.location || ""),
      consoleError: String(raw.consoleError || ""),
      description: String(raw.description || ""),
      priority: PRIORITY_MAP[raw.priority] ? raw.priority : "normal",
      link: String(raw.link || ""),
      sampleWebsite: String(raw.sampleWebsite || ""),
      note: String(raw.note || ""),
      images: Array.isArray(raw.images) ? raw.images.filter(function(img){ return img && img.id; }).map(function(img){
        return {
          id: String(img.id),
          name: String(img.name || "görsel"),
          w: Number(img.w) || 0,
          h: Number(img.h) || 0,
          size: Number(img.size) || 0,
          type: String(img.type || "image/webp"),
          ext: String(img.ext || extFromMime(img.type)),
          file: img.file ? String(img.file) : ""
        };
      }) : [],
      attachments: Array.isArray(raw.attachments) ? raw.attachments.filter(function(att){ return att && att.id; }).map(function(att){
        return {
          id: String(att.id),
          name: String(att.name || "dosya"),
          size: Number(att.size) || 0,
          type: String(att.type || "application/octet-stream"),
          ext: String(att.ext || extFromFileName(att.name)),
          file: att.file ? String(att.file) : ""
        };
      }) : [],
      confirmed: Boolean(raw.confirmed),
      collapsed: raw.collapsed !== false,
      createdAt: raw.createdAt || nowISO(),
      updatedAt: raw.updatedAt || raw.createdAt || nowISO()
    };
    if(!isAutoValid(req)) req.confirmed = false;
    return req;
  }
  function serializeRequest(req, mapImage, mapAttachment){
    return {
      id: req.id,
      type: req.type,
      title: req.title,
      page: req.page,
      location: req.location,
      consoleError: req.consoleError,
      description: req.description,
      priority: req.priority,
      link: req.link,
      sampleWebsite: req.sampleWebsite,
      note: req.note,
      images: req.images.map(function(img, index){
        if(mapImage) return mapImage(img, index);
        return {
          id: img.id,
          name: img.name,
          w: img.w,
          h: img.h,
          size: img.size,
          type: img.type,
          ext: img.ext,
          file: img.file || ""
        };
      }),
      attachments: req.attachments.map(function(att, index){
        if(mapAttachment) return mapAttachment(att, index);
        return {
          id: att.id,
          name: att.name,
          size: att.size,
          type: att.type,
          ext: att.ext,
          file: att.file || ""
        };
      }),
      confirmed: req.confirmed,
      collapsed: req.collapsed,
      createdAt: req.createdAt,
      updatedAt: req.updatedAt
    };
  }
  function requestsSignature(requests){
    return JSON.stringify((requests || []).map(function(req){
      return {
        id: req.id,
        type: req.type,
        title: req.title,
        page: req.page,
        location: req.location,
        consoleError: req.consoleError,
        description: req.description,
        priority: req.priority,
        link: req.link,
        sampleWebsite: req.sampleWebsite,
        note: req.note,
        images: (req.images || []).map(function(img){ return img.id; }),
        attachments: (req.attachments || []).map(function(att){ return att.id; })
      };
    }));
  }
  function requestSignature(){
    return requestsSignature(state.requests);
  }
  function isCurrentInHistory(){
    const signature = requestSignature();
    return historyItems.some(function(item){ return item.signature === signature; });
  }
