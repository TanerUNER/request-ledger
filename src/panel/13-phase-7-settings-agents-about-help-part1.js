  /* ============================================================
     PHASE 7 — SETTINGS / AGENTS / ABOUT / HELP
     ============================================================ */

  var SETTINGS_TABS = [
    { id:"system", label:"tabSystem" },
    { id:"config", label:"tabConfig" },
    { id:"about",  label:"tabAbout" }
  ];
  var SETTINGS_TAB_IDS = {};
  SETTINGS_TABS.forEach(function(tab){ SETTINGS_TAB_IDS[tab.id] = true; });

  var FALLBACK_AGENT_ROLES = [
    { id:"team_leader", label:"Team Leader" },
    { id:"backend",     label:"Backend" },
    { id:"frontend",    label:"Frontend" },
    { id:"qa",          label:"QA Tester" },
    { id:"security",    label:"App. Security" },
    { id:"explorer",    label:"Explorer" },
    { id:"general",     label:"General" }
  ];

  var HELP_STEPS = [
    { title:"helpStep1", text:"helpStep1Text" },
    { title:"helpStep2", text:"helpStep2Text" },
    { title:"helpStep3", text:"helpStep3Text" },
    { title:"helpStep4", text:"helpStep4Text" },
    { title:"helpStep5", text:"helpStep5Text" },
    { title:"helpStep6", text:"helpStep6Text" },
    { title:"helpStep7", text:"helpStep7Text" },
    { title:"helpStep8", text:"helpStep8Text" }
  ];

  var FALLBACK_VERSION = "0.4.0";

  function settingsOptions(){
    return [
      { value:"tr", label:"TR" },
      { value:"en", label:"EN" }
    ];
  }

  /* ---------- shell v7: custom dropdown (hidden native select stays for hooks) ---------- */

  function optionLabel(options, value){
    for(var i = 0; i < options.length; i++){
      if(options[i].value === value) return options[i].label;
    }
    return options.length ? options[0].label : "";
  }

  function syncSelectUI(select){
    if(!select || !select.parentNode) return;
    var wrap = select.parentNode;
    if(!wrap.classList || !wrap.classList.contains("sel")) return;
    var label = wrap.querySelector(".sel-label");
    var option = select.options && select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
    if(label) label.textContent = option ? option.textContent : "";
    var items = wrap.querySelectorAll(".sel-opt");
    for(var i = 0; i < items.length; i++){
      var on = items[i].getAttribute("data-value") === select.value;
      items[i].classList.toggle("is-selected", on);
      items[i].setAttribute("aria-selected", on ? "true" : "false");
    }
  }

  function closeOpenSelect(restoreFocus){
    if(!openSelWrap) return;
    var wrap = openSelWrap;
    openSelWrap = null;
    wrap.classList.remove("is-open");
    var pop = wrap.querySelector(".sel-pop");
    if(pop) pop.hidden = true;
    var btn = wrap.querySelector(".sel-btn");
    if(btn){
      btn.setAttribute("aria-expanded", "false");
      if(restoreFocus) try{ btn.focus(); }catch(err){ /* ignore */ }
    }
    document.removeEventListener("pointerdown", onSelectOutside, true);
  }

  function onSelectOutside(event){
    if(!openSelWrap) return;
    var target = event.target;
    if(target && openSelWrap.contains(target)) return;
    closeOpenSelect();
  }

  function openSelectPop(wrap, edge){
    if(!wrap) return;
    if(openSelWrap && openSelWrap !== wrap) closeOpenSelect();
    var pop = wrap.querySelector(".sel-pop");
    var btn = wrap.querySelector(".sel-btn");
    if(!pop || !btn) return;
    var wasOpen = openSelWrap === wrap;
    openSelWrap = wrap;
    wrap.classList.add("is-open");
    pop.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    if(!wasOpen) document.addEventListener("pointerdown", onSelectOutside, true);
    var items = pop.querySelectorAll(".sel-opt");
    if(!items.length) return;
    var index = 0;
    if(edge === "last") index = items.length - 1;
    else{
      for(var i = 0; i < items.length; i++){
        if(items[i].classList.contains("is-selected")){ index = i; break; }
      }
    }
    try{ items[index].focus(); }catch(err){ /* ignore */ }
  }

  function buildCustomSelect(id, value, options, onChange, opts){
    opts = opts || {};
    var wrap = h("div", "sel" + (opts.className ? " " + opts.className : ""));
    wrap.setAttribute("data-for", id || "");

    var select = document.createElement("select");
    select.className = "fld set-select sel-native" + (opts.selectClass ? " " + opts.selectClass : "");
    if(id) select.id = id;
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");
    options.forEach(function(option){
      var opt = document.createElement("option");
      opt.value = option.value;
      opt.textContent = option.label;
      select.appendChild(opt);
    });
    select.value = value;
    if(opts.attrs){
      for(var key in opts.attrs){
        if(has(opts.attrs, key)) select.setAttribute(key, opts.attrs[key]);
      }
    }
    wrap.appendChild(select);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sel-btn";
    btn.setAttribute("aria-haspopup", "listbox");
    btn.setAttribute("aria-expanded", "false");
    if(opts.label) btn.setAttribute("aria-label", opts.label);
    if(opts.title) btn.title = opts.title;
    btn.appendChild(h("span", "sel-label", optionLabel(options, select.value)));
    var chevron = h("span", "sel-chev");
    chevron.innerHTML = ICONS.chevronDown;
    chevron.setAttribute("aria-hidden", "true");
    btn.appendChild(chevron);
    wrap.appendChild(btn);

    var pop = h("div", "sel-pop");
    pop.hidden = true;
    pop.setAttribute("role", "listbox");
    options.forEach(function(option){
      var item = h("button", "sel-opt" + (option.value === select.value ? " is-selected" : ""), option.label);
      item.type = "button";
      item.setAttribute("role", "option");
      item.setAttribute("data-value", option.value);
      item.setAttribute("aria-selected", option.value === select.value ? "true" : "false");
      item.tabIndex = -1;
      item.addEventListener("click", function(){
        select.value = option.value;
        syncSelectUI(select);
        closeOpenSelect(true);
        try{ select.dispatchEvent(new Event("change", { bubbles:true })); }
        catch(err){
          var legacy = document.createEvent("Event");
          legacy.initEvent("change", true, false);
          select.dispatchEvent(legacy);
        }
      });
      pop.appendChild(item);
    });
    wrap.appendChild(pop);

    btn.addEventListener("click", function(event){
      event.preventDefault();
      event.stopPropagation();
      if(pop.hidden) openSelectPop(wrap, "selected");
      else closeOpenSelect(true);
    });
    btn.addEventListener("keydown", function(event){
      if(event.key === "ArrowDown" || event.key === "ArrowUp"){
        event.preventDefault();
        openSelectPop(wrap, event.key === "ArrowUp" ? "last" : "selected");
      }else if(event.key === "Escape" && !pop.hidden){
        event.preventDefault();
        event.stopPropagation();
        closeOpenSelect(true);
      }
    });
    pop.addEventListener("keydown", function(event){
      var items = pop.querySelectorAll(".sel-opt");
      if(!items.length) return;
      var current = -1;
      for(var i = 0; i < items.length; i++) if(items[i] === document.activeElement) current = i;
      if(event.key === "ArrowDown" || event.key === "ArrowUp"){
        event.preventDefault();
        var next = event.key === "ArrowDown" ? current + 1 : current - 1;
        if(next < 0) next = items.length - 1;
        if(next >= items.length) next = 0;
        try{ items[next].focus(); }catch(err){ /* ignore */ }
      }else if(event.key === "Home" || event.key === "End"){
        event.preventDefault();
        try{ items[event.key === "Home" ? 0 : items.length - 1].focus(); }catch(err){ /* ignore */ }
      }else if(event.key === "Escape"){
        event.preventDefault();
        event.stopPropagation();
        closeOpenSelect(true);
      }else if(event.key === "Tab"){
        closeOpenSelect();
      }
    });

    select.addEventListener("change", function(){
      syncSelectUI(select);
      onChange(select.value);
    });

    return wrap;
  }

  function buildSettingSelect(id, value, options, onChange){
    return buildCustomSelect(id, value, options, onChange, {});
  }

  function settingRow(labelText, control, hintText){
    var row = h("div", "set-row");
    var label = h("label", "set-lbl", labelText);
    var forId = control.id || control.getAttribute("data-for");
    if(forId) label.setAttribute("for", forId);
    row.appendChild(label);
    row.appendChild(control);
    if(hintText) row.appendChild(h("p", "set-hint", hintText));
    return row;
  }

  /* Live bridge status: one compact row plus the first-connect choice. */
  function buildBridgeRow(){
    var row = h("div", "set-row");
    row.appendChild(h("span", "set-lbl", lx("bridgeTitle")));

    var status = h("div", "bridge-status");
    status.id = "rl-bridge-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.appendChild(h("span", "bridge-dot"));
    status.appendChild(h("span", "bridge-text", lx("bridgeOffline")));
    status.lastElementChild.id = "rl-bridge-text";
    row.appendChild(status);

    var confirm = h("div", "bridge-confirm");
    confirm.id = "rl-bridge-confirm";
    confirm.hidden = true;
    confirm.setAttribute("role", "alertdialog");
    confirm.appendChild(h("p", null, lx("bridgeConflictHint")));
    var actions = h("div", "bridge-actions");
    var appBtn = h("button", "btn btn--small btn--primary", lx("bridgeUseApp"));
    appBtn.type = "button";
    appBtn.id = "rl-bridge-use-app";
    appBtn.setAttribute("data-act", "bridge-use-app");
    var extBtn = h("button", "btn btn--small", lx("bridgeUseExtension"));
    extBtn.type = "button";
    extBtn.id = "rl-bridge-use-extension";
    extBtn.setAttribute("data-act", "bridge-use-extension");
    actions.appendChild(appBtn);
    actions.appendChild(extBtn);
    confirm.appendChild(actions);
    row.appendChild(confirm);

    row.appendChild(h("p", "set-hint", lx("bridgeMediaNote")));
    setTimeout(updateBridgeUI, 0);
    return row;
  }

  /* shell v7: editable folder inputs + a picker button */
  function setFolderDir(key, value){
    var dir = String(value == null ? "" : value);
    if(key === "rl-root-dir"){
      folderDirs.root = dir;
    }else{
      folderDirs.export = dir;
      if(activeProjectId) updateProjectRecord(activeProjectId, { exportTarget:dir });
    }
    try{
      if(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local){
        var payload = {};
        payload[key] = dir;
        chrome.storage.local.set(payload);
      }
    }catch(err){ /* ignore */ }
    channelPost({ type:"folders", root:folderDirs.root, export:folderDirs.export });
  }

  function applyPickedFolder(input, key, name){
    if(!input) return;
    name = String(name || "");
    if(!name){ toast(lx("pickerCancelled")); return; }
    input.value = name;
    input.title = name;
    setFolderDir(key, name);
    toast(lx("folderPicked", { name:name }));
  }

  function legacyFolderPicker(input, key){
    /* shell v9 fallback: a webkitdirectory input still selects a folder (the
       browser never uploads the files); only the name is read. */
    var picker = document.createElement("input");
    picker.type = "file";
    picker.setAttribute("webkitdirectory", "");
    picker.setAttribute("directory", "");
    picker.setAttribute("mozdirectory", "");
    picker.multiple = true;
    picker.hidden = true;
    picker.addEventListener("change", function(){
      var files = picker.files;
      var name = "";
      if(files && files.length){
        var rel = files[0].webkitRelativePath || "";
        name = rel ? String(rel).split("/")[0] : String(files[0].name || "");
      }
      if(picker.parentNode) picker.parentNode.removeChild(picker);
      applyPickedFolder(input, key, name);
    });
    document.body.appendChild(picker);
    picker.click();
  }

  function openFolderWindow(key){
    var target = key === "rl-export-dir" ? "export" : "root";
    var url = "";
    try{ url = chrome.runtime.getURL("panel/folder-picker.html?target=" + target); }
    catch(err){ return false; }
    try{
      if(chrome.windows && typeof chrome.windows.create === "function"){
        chrome.windows.create({ url:url, type:"popup", width:430, height:270, focused:true }, function(){
          try{ if(chrome.runtime && chrome.runtime.lastError) throw new Error("window"); }
          catch(err){ try{ chrome.tabs.create({ url:url }); }catch(e){ /* ignore */ } }
        });
        return true;
      }
    }catch(err){ /* fall through */ }
    try{ chrome.tabs.create({ url:url }); return true; }
    catch(err){ return false; }
  }

  function pickFolder(input, key){
    if(!input) return;
    /* shell v11 §10: a cross-origin iframe blocks showDirectoryPicker and
       makes webkitdirectory look like an upload. Use a top-level extension
       window for the real folder picker; fall back only if that is blocked. */
    var blockedFrame = false;
    try{ blockedFrame = window.self !== window.top; }catch(err){ blockedFrame = true; }
    if(blockedFrame && openFolderWindow(key)) return;
    if(!blockedFrame && typeof window.showDirectoryPicker === "function"){
      var pending = null;
      try{
        pending = window.showDirectoryPicker({ mode:"read" });
      }catch(err){
        if(err && err.name === "AbortError") return;
        pending = null;
      }
      if(pending && typeof pending.then === "function"){
        pending.then(function(handle){
          applyPickedFolder(input, key, handle && handle.name ? handle.name : "");
        }).catch(function(err){
          if(err && err.name === "AbortError") return;
          if(!openFolderWindow(key)) legacyFolderPicker(input, key);
        });
        return;
      }
    }
    if(!openFolderWindow(key)) legacyFolderPicker(input, key);
  }

  function folderRow(id, labelText, pickId, key){
    var wrap = h("div", "set-dir-row");
    wrap.setAttribute("data-for", id);
    var input = document.createElement("input");
    input.type = "text";
    input.className = "fld set-dir";
    input.id = id;
    input.value = (key === "rl-root-dir" ? folderDirs.root : folderDirs.export) || lx("browserDownloads");
    input.placeholder = lx("browserDownloads");
    input.title = input.value;
    input.setAttribute("aria-label", labelText);
    input.addEventListener("input", function(){
      input.title = input.value;
      setFolderDir(key, input.value);
    });
    var pick = h("button", "btn btn--small folder-pick", lx("chooseFolder"));
    pick.type = "button";
    pick.id = pickId;
    pick.setAttribute("aria-label", lx("chooseFolder") + " — " + labelText);
    pick.addEventListener("click", function(){ pickFolder(input, key); });
    wrap.appendChild(input);
    wrap.appendChild(pick);
    return settingRow(labelText, wrap);
  }

  function buildSettingsTabs(){
    var wrap = h("div", "settings-tabs");
    wrap.id = "rl-settings-tabs";
    wrap.setAttribute("role", "tablist");
    wrap.setAttribute("aria-label", lx("tabSystem") + " / " + lx("tabConfig") + " / " + lx("tabAbout"));
    SETTINGS_TABS.forEach(function(tab){
      var btn = h("button", "settings-tab" + (tab.id === settingsTab ? " is-active" : ""), lx(tab.label));
      btn.type = "button";
      btn.id = "rl-settings-tab-" + tab.id;
      btn.setAttribute("role", "tab");
      btn.setAttribute("data-settings-tab", tab.id);
      btn.setAttribute("aria-controls", "rl-settings-panel-" + tab.id);
      btn.setAttribute("aria-selected", tab.id === settingsTab ? "true" : "false");
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function applySettingsTab(){
    var tabs = document.querySelectorAll("[data-settings-tab]");
    for(var i = 0; i < tabs.length; i++){
      var id = tabs[i].getAttribute("data-settings-tab");
      var active = id === settingsTab;
      tabs[i].classList.toggle("is-active", active);
      tabs[i].setAttribute("aria-selected", active ? "true" : "false");
    }
    var panels = document.querySelectorAll("[data-settings-panel]");
    for(var j = 0; j < panels.length; j++){
      panels[j].hidden = panels[j].getAttribute("data-settings-panel") !== settingsTab;
    }
  }

  function switchSettingsTab(name){
    if(!SETTINGS_TAB_IDS[name] || name === settingsTab) return;
    if(els.body) settingsScroll[settingsTab] = els.body.scrollTop;
    settingsTab = name;
    applySettingsTab();
    if(els.body) els.body.scrollTop = settingsScroll[settingsTab] || 0;
    updateScrollAffordance();
    reportSize();
  }

  function renderSettings(body){
    body.classList.add("settings-body");
    body.appendChild(buildSettingsTabs());

    var panels = h("div", "settings-panels");
    var mounts = {};
    SETTINGS_TABS.forEach(function(tab){
      var panel = h("section", "settingspanel");
      panel.id = "rl-settings-panel-" + tab.id;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", "rl-settings-tab-" + tab.id);
      panel.setAttribute("data-settings-panel", tab.id);
      panels.appendChild(panel);
      mounts[tab.id] = panel;
    });
    body.appendChild(panels);

    renderSystemPanel(mounts.system);
    renderConfigPanel(mounts.config);
    renderAboutPanel(mounts.about);
    applySettingsTab();
  }

  function renderSystemPanel(panel){
    var block = addBlock(panel, lx("tabSystem"));
    block.appendChild(h("p", "set-hint", lx("systemHint")));

    /* shell v10: the project name is editable and feeds export/backup/record names */
    var project = document.createElement("input");
    project.type = "text";
    project.className = "fld";
    project.id = "rl-set-project";
    project.maxLength = 60;
    project.autocomplete = "off";
    project.value = app && app.project ? app.project : "";
    project.setAttribute("data-setting", "project");
    project.placeholder = lx("projectNamePh");
    project.addEventListener("input", function(){
      if(!app) return;
      var next = project.value.slice(0, 60);
      app.project = next;
      markDirty(420);
    });
    project.addEventListener("change", function(){
      if(!app) return;
      var value = String(project.value || "").trim().slice(0, 60);
      app.project = value;
      project.value = value;
      markDirty(0);
    });
    block.appendChild(settingRow(t("Proje adı"), project, lx("projectHint")));

    var lang = buildSettingSelect("rl-set-lang", state.lang, settingsOptions(), function(value){
      setLanguage(value === "en" ? "en" : "tr");
    });
    block.appendChild(settingRow(t("Dil"), lang));

    var theme = buildSettingSelect("rl-set-theme", state.themePref, [
      { value:"light",  label:lx("themeLight") },
      { value:"dark",   label:lx("themeDark") },
      { value:"system", label:lx("themeSystem") }
    ], function(value){
      setTheme(value);
    });
    block.appendChild(settingRow(lx("themeTitle"), theme));

    /* shell v9: left/right placement, persisted as rl-side */
    var side = buildSettingSelect("rl-set-side", state.side, [
      { value:"right", label:lx("sideRight") },
      { value:"left",  label:lx("sideLeft") }
    ], function(value){
      setPanelSide(value);
    });
    block.appendChild(settingRow(lx("sideLabel"), side, lx("sideHint")));

    var behavior = buildSettingSelect("rl-set-export-behavior", app && app.exportBehavior ? app.exportBehavior : "default", [
      { value:"default", label:lx("behaviorDefault") },
      { value:"last",    label:lx("behaviorLast") },
      { value:"instant", label:lx("behaviorInstant") }
    ], function(value){
      if(!app) return;
      app.exportBehavior = ["last","instant"].indexOf(value) >= 0 ? value : "default";
      markDirty(0);
    });
    block.appendChild(settingRow(lx("behaviorTitle"), behavior, lx("behaviorHint")));

    block.appendChild(folderRow("rl-set-root", lx("rootDir"), "rl-root-pick", "rl-root-dir"));
    block.appendChild(folderRow("rl-set-export-dir", lx("exportDir"), "rl-export-pick", "rl-export-dir"));
    block.appendChild(h("p", "set-hint", lx("folderNote")));
    block.appendChild(buildBridgeRow());

    var reset = h("button", "btn", lx("resetSettings"));
    reset.type = "button";
    reset.id = "rl-reset-settings";
    reset.setAttribute("data-act", "settings-reset");
    var resetWrap = h("div", "set-reset");
    resetWrap.appendChild(reset);
    resetWrap.appendChild(h("p", "set-hint", lx("resetHint")));
    block.appendChild(resetWrap);
  }

  function currentAgents(){
    if(!app) return [];
    if(!Array.isArray(app.agents)) app.agents = [];
    return app.agents;
  }

  function agentRoleOptions(){
    var roles = core && core.constants && core.constants.AGENT_ROLES;
    return Array.isArray(roles) && roles.length ? roles : FALLBACK_AGENT_ROLES;
  }

  function agentRoleValid(id){
    var roles = agentRoleOptions();
    for(var i = 0; i < roles.length; i++) if(roles[i].id === id) return true;
    return false;
  }

  function findAgent(id){
    var agents = currentAgents();
    for(var i = 0; i < agents.length; i++) if(agents[i].id === id) return agents[i];
    return null;
  }

  function makeAgentId(){
    return "agent_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  }

  function firstUnusedAgentRole(){
    var used = {};
    currentAgents().forEach(function(agent){ if(agent && agent.role) used[agent.role] = true; });
    var roles = agentRoleOptions();
    for(var i = 0; i < roles.length; i++) if(!used[roles[i].id]) return roles[i].id;
    return "general";
  }

  function renderConfigPanel(panel){
    var block = addBlock(panel, t("Ajanlar"));
    block.appendChild(h("p", "set-hint", lx("agentsHint")));

    var list = h("div", "agentlist");
    list.id = "rl-agents";
    block.appendChild(list);

    var empty = h("div", "agentempty");
    empty.id = "rl-agents-empty";
    empty.appendChild(h("b", null, lx("agentEmptyTitle")));
    empty.appendChild(h("span", null, lx("agentEmptySub")));
    block.appendChild(empty);

    var add = h("button", "btn btn--small", lx("addAgent"));
    add.type = "button";
    add.id = "rl-agent-add";
    add.setAttribute("data-act", "agent-add");
    block.appendChild(add);

    renderAgentRows();
  }

  function renderAgentRows(){
    var list = document.getElementById("rl-agents");
    if(!list) return;
    list.textContent = "";
    var agents = currentAgents();
    agents.forEach(function(agent, index){
      list.appendChild(buildAgentRow(agent, index, agents.length));
    });
    var empty = document.getElementById("rl-agents-empty");
    if(empty) empty.hidden = agents.length > 0;
  }
