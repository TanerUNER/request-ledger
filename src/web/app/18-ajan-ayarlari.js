  /* ============================================================
     Ajan ayarları
     ============================================================ */
  function updateAgentSettingsEmpty(){
    const list = $("#agentSettingsList");
    const empty = $("#agentSettingsEmpty");
    if(empty) empty.hidden = Boolean(list && list.children.length);
  }
  function applyAgentRowRole(row, roleId){
    if(!row) return;
    const role = agentRoleInfo(roleId);
    AGENT_ROLES.forEach(function(item){ row.classList.remove(item.cls); });
    row.classList.add(role.cls);
    row.dataset.role = role.id;
  }
  function createAgentSettingRow(agent){
    const item = agent || { id:"", name:"", role:preferredNewAgentRole(), mdPath:"" };
    const row = document.createElement("div");
    row.className = "agent-setting";
    row.dataset.id = item.id || "";

    const roleLabel = document.createElement("span");
    roleLabel.className = "agent-fieldlabel agent-fieldlabel--role";
    roleLabel.textContent = "Görev:";

    const roleMount = document.createElement("div");
    roleMount.className = "agent-setting__role";
    const roleValue = AGENT_ROLE_MAP[item.role] ? item.role : preferredNewAgentRole();
    const roleControl = buildCSelect({
      id: "agent-role-" + (item.id || (Date.now() + "_" + Math.random().toString(36).slice(2, 5))),
      name: "Ajan görevi",
      value: roleValue,
      items: AGENT_ROLES.map(function(role){ return { value: role.id, label: role.label }; }),
      title: "Ajan görevi",
      onChange: function(value){
        applyAgentRowRole(row, value);
        row.classList.remove("is-invalid");
      }
    });
    roleMount.appendChild(roleControl);

    const nameLabel = document.createElement("span");
    nameLabel.className = "agent-fieldlabel agent-fieldlabel--name";
    nameLabel.textContent = "Ajan Adı:";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "input agent-setting__name";
    nameInput.maxLength = 80;
    nameInput.value = item.name || "";
    nameInput.setAttribute("aria-label", "Ajan adı");

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "agent-setting__remove";
    remove.setAttribute("aria-label", "Ajanı kaldır");
    remove.title = "Ajanı kaldır";
    remove.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/></svg>';
    remove.addEventListener("click", function(){
      row.remove();
      updateAgentSettingsEmpty();
    });

    const pathLabel = document.createElement("span");
    pathLabel.className = "agent-fieldlabel agent-fieldlabel--path";
    pathLabel.textContent = "Ajan .MD Dosyası:";
    const pathInput = document.createElement("input");
    pathInput.type = "text";
    pathInput.className = "input agent-setting__path";
    pathInput.maxLength = 300;
    pathInput.value = item.mdPath || "";
    pathInput.setAttribute("aria-label", "Ajan .md dosyası yolu");
    pathInput.title = "Ajan .md dosyası yolu";
    const browse = document.createElement("button");
    browse.type = "button";
    browse.className = "agent-setting__browse";
    browse.setAttribute("aria-label", "MD dosyası seç");
    browse.title = "MD dosyası seç";
    browse.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".md,text/markdown";
    fileInput.hidden = true;
    browse.addEventListener("click", function(){ fileInput.click(); });
    fileInput.addEventListener("change", function(){
      const file = fileInput.files && fileInput.files[0];
      if(file) pathInput.value = file.name;
      fileInput.value = "";
    });

    row.appendChild(roleLabel);
    row.appendChild(roleMount);
    row.appendChild(nameLabel);
    row.appendChild(nameInput);
    row.appendChild(remove);
    row.appendChild(pathLabel);
    row.appendChild(pathInput);
    row.appendChild(browse);
    row.appendChild(fileInput);
    applyAgentRowRole(row, roleValue);
    return row;
  }
  function renderAgentSettings(){
    const list = $("#agentSettingsList");
    if(!list) return;
    list.innerHTML = "";
    state.agents.forEach(function(agent){
      list.appendChild(createAgentSettingRow(agent));
    });
    updateAgentSettingsEmpty();
  }
  function addAgentSettingRow(){
    const list = $("#agentSettingsList");
    if(!list) return;
    const row = createAgentSettingRow({ id:"", name:"", role:preferredNewAgentRole(), mdPath:"" });
    list.appendChild(row);
    updateAgentSettingsEmpty();
    const nameInput = $(".agent-setting__name", row);
    if(nameInput) nameInput.focus();
  }
  function setSettingsTab(name){
    const next = ["system","config","about"].indexOf(name) >= 0 ? name : "system";
    $$("#settingsModal .settings__tab").forEach(function(tab){
      const active = tab.dataset.settingsTab === next;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    $$("#settingsModal .settingspanel").forEach(function(panel){
      panel.hidden = panel.dataset.settingsPanel !== next;
    });
    const body = $("#settingsModal .settingsbody");
    if(body) body.scrollTop = 0;
    const foot = $("#settingsModal .modal__foot");
    if(foot) foot.hidden = next === "about";
  }
  function recentChangelog(){
    return CHANGELOG.slice(0, 5);
  }
  function renderChangelog(version){
    const body = $("#changelogBody");
    if(!body) return;
    body.innerHTML = "";
    const entries = version
      ? recentChangelog().filter(function(entry){ return entry.version === version; })
      : recentChangelog();
    entries.forEach(function(entry){
      const data = state.language === "en" ? entry.en : entry.tr;
      const card = document.createElement("section");
      card.className = "changelog__version";
      const head = document.createElement("div");
      head.className = "changelog__head";
      const title = document.createElement("h3");
      title.textContent = "v" + entry.version + " · " + entry.date;
      const badge = document.createElement("span");
      badge.className = "changelog__badge";
      badge.textContent = translateString("Sürüm");
      head.appendChild(title);
      head.appendChild(badge);
      card.appendChild(head);
      [
        { key:"features", label:"Yeni Özellikler" },
        { key:"updates", label:"Güncellemeler" },
        { key:"fixes", label:"Hata Düzeltmeleri" }
      ].forEach(function(group){
        const items = data[group.key] || [];
        if(!items.length) return;
        const wrap = document.createElement("div");
        wrap.className = "changelog__group";
        const label = document.createElement("h4");
        label.textContent = translateString(group.label);
        const list = document.createElement("ul");
        items.forEach(function(text){
          const li = document.createElement("li");
          li.textContent = text;
          list.appendChild(li);
        });
        wrap.appendChild(label);
        wrap.appendChild(list);
        card.appendChild(wrap);
      });
      body.appendChild(card);
    });
  }
  function renderChangelogLinks(){
    const mount = $("#changelogLinks");
    if(!mount) return;
    mount.innerHTML = "";
    recentChangelog().forEach(function(entry){
      const link = document.createElement("a");
      link.href = "#";
      link.textContent = "v" + entry.version + " · " + entry.date;
      link.addEventListener("click", function(event){
        event.preventDefault();
        openChangelog(entry.version);
      });
      mount.appendChild(link);
    });
  }
  function openChangelog(version){
    renderChangelog(version);
    const modal = $("#changelogModal");
    const settings = $("#settingsModal");
    if(modal && settings && settings.classList.contains("is-open")){
      if(activeModal && activeModal !== modal) lastFocus = document.activeElement;
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      modal.style.zIndex = "120";
      setTimeout(function(){
        const target = modal.querySelector("[data-autofocus]") || modal.querySelector("button");
        if(target) target.focus();
      }, 40);
      return;
    }
    if(modal) modal.style.zIndex = "";
    openModal(modal);
  }
  function openSettingsModal(){
    renderAgentSettings();
    renderSystemSettings();
    renderChangelogLinks();
    setSettingsTab("system");
    openModal($("#settingsModal"));
  }
  function updateFolderSettingsUI(){
    const projectValue = $("#settingsProjectValue");
    if(projectValue){
      const projectPath = targetFolderHandle ? displayPathForHandle(targetFolderHandle) : "";
      projectValue.value = projectPath
        ? projectPath + (targetFolderNeedsPermission ? " · " + translateString("izin gerekli") : "")
        : translateString("Seçilmedi");
      projectValue.title = projectValue.value;
      const projectField = projectValue.closest(".pathfield");
      if(projectField) projectField.classList.toggle("is-missing", !targetFolderHandle);
    }
    const projectClear = $("#clearProjectSettingBtn");
    if(projectClear) projectClear.disabled = !targetFolderHandle;
    const projectChoose = $("#chooseProjectSettingBtn");
    if(projectChoose){
      projectChoose.classList.toggle("is-set", Boolean(targetFolderHandle));
      projectChoose.disabled = !activeProjectId;
    }
  }
  function autoSaveLanguage(){
    const system = readSystemSettings();
    if(system.language !== state.language){
      state.language = system.language;
      applyLanguage(system.language);
      saveNow();
      if(typeof serverSaveUiConfig === "function") serverSaveUiConfig();
      refreshGlobal();
    }
  }
  function autoSaveTheme(){
    const system = readSystemSettings();
    setTheme(system.theme, true);
    saveNow();
  }
  function renderSystemSettings(){
    const languageMount = $("#languageSettingMount");
    const themeMount = $("#themeSettingMount");
    const behaviorMount = $("#exportBehaviorSettingMount");
    const projectNameInput = $("#settingsProjectName");
    if(projectNameInput){
      projectNameInput.value = state.project || "";
      projectNameInput.classList.remove("is-invalid");
      projectNameInput.disabled = !activeProjectId;
    }
    if(languageMount){
      languageMount.innerHTML = "";
      languageMount.appendChild(buildCSelect({
        id: "settingLanguage",
        name: "Dil",
        value: state.language,
        items: [
          { value:"tr", label:"TR - Türkçe" },
          { value:"en", label:"EN - English" }
        ],
        title: "Dil",
        onChange: autoSaveLanguage
      }));
    }
    if(themeMount){
      themeMount.innerHTML = "";
      const currentTheme = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
      themeMount.appendChild(buildCSelect({
        id: "settingTheme",
        name: "Tema",
        value: currentTheme,
        items: [
          { value:"light", label:"Aydınlık" },
          { value:"dark", label:"Karanlık" }
        ],
        title: "Tema",
        onChange: autoSaveTheme
      }));
    }
    if(behaviorMount){
      behaviorMount.innerHTML = "";
      behaviorMount.appendChild(buildCSelect({
        id: "settingExportBehavior",
        name: "Dışa aktarım davranışı",
        value: state.exportBehavior,
        items: [
          { value:"default", label:"Varsayılan" },
          { value:"last", label:"Son tercihler" },
          { value:"instant", label:"Hemen aktar" }
        ],
        title: "Dışa aktarım davranışı"
      }));
    }
    updateFolderSettingsUI();
    if(typeof renderServerRuntimeUi === "function") renderServerRuntimeUi();
  }
  function readSystemSettings(){
    const languageRoot = $("#languageSettingMount .cselect");
    const themeRoot = $("#themeSettingMount .cselect");
    const behaviorRoot = $("#exportBehaviorSettingMount .cselect");
    return {
      language: languageRoot && languageRoot.dataset.value === "en" ? "en" : "tr",
      theme: themeRoot && themeRoot.dataset.value === "dark" ? "dark" : "light",
      exportBehavior: behaviorRoot && ["last","instant"].indexOf(behaviorRoot.dataset.value) >= 0 ? behaviorRoot.dataset.value : "default"
    };
  }
  function saveSettings(){
    const agents = readAgentSettings();
    if(!agents) return;
    if(!applyProjectNameSetting()) return;
    const system = readSystemSettings();
    state.agents = agents;
    state.language = system.language;
    state.exportBehavior = system.exportBehavior;
    setTheme(system.theme, true);
    prunePlanningAgents();
    saveNow();
    applyLanguage(system.language);
    renderPlanningAgents();
    syncPlanningUI();
    renderList();
    renderHistoryTree();
    renderProjectGate();
    updateProjectLabels();
    refreshGlobal();
    showToast("Ayarlar kaydedildi.");
    const button = $("#saveSettingsBtn");
    if(button){
      button.textContent = "Kaydedildi";
      button.classList.add("is-saved");
      if(saveSettingsTimer) clearTimeout(saveSettingsTimer);
      saveSettingsTimer = setTimeout(function(){
        button.textContent = "Kaydet";
        button.classList.remove("is-saved");
        saveSettingsTimer = null;
      }, 2000);
    }
  }
  async function resetSystemSettings(){
    targetFolderHandle = null;
    targetFolderNeedsPermission = false;
    state.exportBehavior = "default";
    if(typeof storePort === "function") storePort(0);
    if(activeProjectId){
      try{ await idbSettingDelete(targetFolderSettingId()); }catch(err){}
      setProjectExportTarget("");
    }
    refreshProjectLabels(false);
    updateTargetFolderUI();
    updateFolderSettingsUI();
    renderSystemSettings();
    saveNow();
    renderList();
    renderHistoryTree();
    updateProjectLabels();
    refreshGlobal();
    showToast("Sistem ayarları varsayılana döndü.");
  }
  function readAgentSettings(){
    const list = $("#agentSettingsList");
    const rows = list ? $$(".agent-setting", list) : [];
    const agents = [];
    let firstInvalid = null;
    rows.forEach(function(row){
      const roleControl = $(".agent-setting__role .cselect", row);
      const nameInput = $(".agent-setting__name", row);
      const pathInput = $(".agent-setting__path", row);
      const role = roleControl ? roleControl.dataset.value : "";
      const valid = Boolean(AGENT_ROLE_MAP[role]);
      row.classList.toggle("is-invalid", !valid);
      if(!valid && !firstInvalid) firstInvalid = roleControl;
      agents.push({
        id: row.dataset.id || makeAgent().id,
        name: nameInput ? nameInput.value.trim().slice(0, 80) : "",
        role: valid ? role : "general",
        mdPath: pathInput ? pathInput.value.trim().slice(0, 300) : ""
      });
    });
    if(firstInvalid){
      showToast("Her ajan için bir görev seç.", "error");
      const trigger = firstInvalid.querySelector(".cselect__trigger");
      if(trigger) trigger.focus();
      return null;
    }
    return agents;
  }