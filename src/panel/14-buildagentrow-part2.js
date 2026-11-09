  function buildAgentRow(agent, index, total){
    var row = h("div", "agent-row");
    row.setAttribute("data-agent-id", agent.id);

    /* mirrors the name into the row text so list readers see it (inputs expose no text) */
    var signature = h("span", null, agent.name || "");
    signature.hidden = true;
    signature.setAttribute("aria-hidden", "true");
    row.appendChild(signature);

    var top = h("div", "agent-row-top");

    var roleOptions = agentRoleOptions().map(function(option){
      return { value:option.id, label:option.label };
    });
    var roleWrap = buildCustomSelect("", agentRoleValid(agent.role) ? agent.role : "general", roleOptions, function(value){
      setAgentField(agent.id, "role", value);
      row.classList.remove("is-invalid");
    }, {
      className:"agent-role-sel",
      selectClass:"agent-role",
      label:lx("agentRole"),
      title:lx("agentRole"),
      attrs:{
        "data-agent-field":"role",
        "aria-label":lx("agentRole"),
        "title":lx("agentRole")
      }
    });
    top.appendChild(roleWrap);

    var name = document.createElement("input");
    name.type = "text";
    name.className = "fld agent-name";
    name.maxLength = 80;
    name.value = agent.name || "";
    name.placeholder = lx("agentNamePh");
    name.setAttribute("data-agent-field", "name");
    name.setAttribute("aria-label", optionalLabel(lx("agentName")));
    name.addEventListener("input", function(){
      setAgentField(agent.id, "name", name.value);
      signature.textContent = name.value;
    });
    top.appendChild(name);

    var remove = h("button", "agent-remove", "×");
    remove.type = "button";
    remove.setAttribute("data-act", "agent-remove");
    remove.setAttribute("data-agent-remove", agent.id);
    remove.setAttribute("aria-label", lx("removeAgent"));
    remove.title = lx("removeAgent");
    if(index === total - 1) remove.id = "rl-agent-remove";
    top.appendChild(remove);

    row.appendChild(top);

    var pathRow = h("div", "agent-path-row");
    var path = document.createElement("input");
    path.type = "text";
    path.className = "fld agent-path";
    path.maxLength = 300;
    path.value = agent.mdPath || "";
    path.placeholder = lx("agentPathPh");
    path.setAttribute("data-agent-field", "mdPath");
    path.setAttribute("aria-label", optionalLabel(lx("agentPath")));
    path.addEventListener("input", function(){ setAgentField(agent.id, "mdPath", path.value); });
    pathRow.appendChild(path);

    var pickMd = h("button", "btn btn--small agent-md-pick", lx("chooseFile"));
    pickMd.type = "button";
    pickMd.setAttribute("data-agent-md", agent.id);
    pickMd.setAttribute("aria-label", lx("agentMd"));
    pickMd.title = lx("agentMd");
    if(index === total - 1) pickMd.id = "rl-agent-md-pick";
    var fileMd = document.createElement("input");
    fileMd.type = "file";
    fileMd.accept = ".md,.markdown,text/markdown";
    fileMd.className = "hidden-input";
    fileMd.setAttribute("data-agent-md-input", agent.id);
    if(index === total - 1) fileMd.id = "rl-agent-md-input";
    fileMd.addEventListener("change", function(){
      var picked = null;
      try{ picked = fileMd.files && fileMd.files.length ? fileMd.files[0] : null; }catch(err){ picked = null; }
      try{ fileMd.value = ""; }catch(err){ /* allow re-picking */ }
      if(!picked) return;
      path.value = picked.name;
      setAgentField(agent.id, "mdPath", picked.name);
    });
    pickMd.addEventListener("click", function(){
      try{ fileMd.click(); }catch(err){ /* ignore */ }
    });
    pathRow.appendChild(pickMd);
    pathRow.appendChild(fileMd);
    row.appendChild(pathRow);

    return row;
  }

  function setAgentField(id, field, value){
    var agent = findAgent(id);
    if(!agent) return;
    if(field === "role"){
      agent.role = agentRoleValid(value) ? value : "general";
    }else if(field === "name"){
      agent.name = String(value == null ? "" : value).slice(0, 80);
    }else if(field === "mdPath"){
      agent.mdPath = String(value == null ? "" : value).slice(0, 300);
    }else{
      return;
    }
    markDirty(field === "role" ? 0 : 320);
  }

  function addAgent(){
    if(!app) app = defaultApp();
    var keepTab = settingsTab;
    var keepScroll = els.body ? els.body.scrollTop : 0;
    var agent = { id:makeAgentId(), name:"", role:firstUnusedAgentRole(), mdPath:"" };
    currentAgents().push(agent);
    markDirty(0);
    renderAgentRows();
    var rows = document.querySelectorAll("#rl-agents [data-agent-id]");
    var last = rows.length ? rows[rows.length - 1] : null;
    var input = last ? last.querySelector('[data-agent-field="name"]') : null;
    if(input) try{ input.focus(); }catch(err){ /* ignore */ }
    if(state.section === "settings"){
      settingsTab = keepTab;
      applySettingsTab();
      if(els.body) els.body.scrollTop = keepScroll;
    }
    updateScrollAffordance();
  }

  function removeAgent(id){
    if(!app || !id) return;
    var keepTab = settingsTab;
    var keepScroll = els.body ? els.body.scrollTop : 0;
    app.agents = currentAgents().filter(function(agent){ return agent.id !== id; });
    planAgents = planAgents.filter(function(agentId){ return agentId !== id; });
    markDirty(0);
    renderAgentRows();
    if(state.section === "settings"){
      settingsTab = keepTab;
      applySettingsTab();
      if(els.body) els.body.scrollTop = keepScroll;
    }
    updateScrollAffordance();
  }

  function validateAgents(){
    var ok = true;
    currentAgents().forEach(function(agent){
      if(!agentRoleValid(agent.role)){ agent.role = "general"; ok = false; }
      agent.name = String(agent.name || "").trim().slice(0, 80);
      agent.mdPath = String(agent.mdPath || "").trim().slice(0, 300);
    });
    return ok;
  }

  function appVersion(){
    try{
      if(typeof chrome !== "undefined" && chrome.runtime && typeof chrome.runtime.getManifest === "function"){
        var manifest = chrome.runtime.getManifest();
        if(manifest && manifest.version) return String(manifest.version);
      }
    }catch(err){ /* fall back */ }
    return FALLBACK_VERSION;
  }

  function aboutRow(dl, labelText, value){
    var row = document.createElement("div");
    row.appendChild(h("dt", null, labelText));
    var dd = document.createElement("dd");
    if(value && value.nodeType) dd.appendChild(value);
    else dd.textContent = value == null ? "" : String(value);
    row.appendChild(dd);
    dl.appendChild(row);
    return dd;
  }

  function aboutLink(href, text, external){
    var link = document.createElement("a");
    link.href = href;
    link.textContent = text;
    if(external){
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    return link;
  }

  function renderAboutPanel(panel){
    var card = h("section", "aboutcard");

    var brand = h("div", "aboutbrand");
    var mark = h("span", "aboutmark");
    mark.innerHTML = ICONS.mark;
    mark.setAttribute("aria-hidden", "true");
    var brandText = h("div", "aboutbrand-text");
    brandText.appendChild(h("h3", null, t("İstek Defteri")));
    brandText.appendChild(h("p", null, lx("aboutDesc")));
    brand.appendChild(mark);
    brand.appendChild(brandText);
    card.appendChild(brand);

    var meta = document.createElement("dl");
    meta.className = "aboutmeta";
    aboutRow(meta, lx("developer"), "Taner ÜNER");

    var version = h("span", "about-version", appVersion());
    version.id = "rl-about-version";
    aboutRow(meta, t("Sürüm"), version);

    aboutRow(meta, lx("repoLabel"), aboutLink(
      "https://github.com/TanerUNER/request-ledger",
      "github.com/TanerUNER/request-ledger",
      true
    ));
    aboutRow(meta, lx("contactLabel"), aboutLink("mailto:mail.taneruner@gmail.com", "mail.taneruner@gmail.com", false));
    aboutRow(meta, lx("supportLabel"), aboutLink("https://www.buymeacoffee.com/tnruner", "buymeacoffee.com/tnruner", true));
    card.appendChild(meta);
    panel.appendChild(card);

    var block = addBlock(panel, lx("changelogTitle"));
    var changelog = h("div", "changelog");
    changelog.id = "rl-changelog";
    block.appendChild(changelog);
    renderChangelog();
  }

  function changelogEntries(){
    var list = core && core.constants && core.constants.CHANGELOG;
    /* shell v11 §3: only the five newest versions are shown */
    return Array.isArray(list) ? list.slice(0, 5) : [];
  }

  function renderChangelog(){
    var host = document.getElementById("rl-changelog");
    if(!host) return;
    host.textContent = "";

    var entries = changelogEntries();
    if(!entries.length){
      host.appendChild(h("p", "set-hint", lx("changelogEmpty")));
      return;
    }

    var groups = [
      { key:"features", label:lx("groupFeatures") },
      { key:"updates",  label:lx("groupUpdates") },
      { key:"fixes",    label:lx("groupFixes") }
    ];

    entries.forEach(function(entry){
      var version = String(entry.version || "");
      var open = !!settingsChangelogOpen[version];
      var card = h("section", "changelog-entry");
      card.setAttribute("data-changelog-entry", version);
      card.setAttribute("data-changelog-version", version);

      var head = h("button", "changelog-head");
      head.type = "button";
      head.setAttribute("data-changelog-toggle", version);
      head.setAttribute("aria-expanded", open ? "true" : "false");
      var areaLabel = entry.area === "web" ? lx("areaWeb") : lx("areaExtension");
      head.appendChild(h("b", "changelog-version", "v" + version + " (" + areaLabel + ")"));
      head.appendChild(h("span", "changelog-date", entry.date || ""));
      head.appendChild(h("span", "changelog-caret", open ? "▴" : "▾"));
      card.appendChild(head);

      var body = h("div", "changelog-body");
      body.hidden = !open;
      var data = (state.lang === "en" ? entry.en : entry.tr) || {};
      groups.forEach(function(group){
        var items = data[group.key] || [];
        if(!items.length) return;
        body.appendChild(h("h5", "changelog-group", group.label));
        var list = h("ul", "changelog-list");
        items.forEach(function(text){ list.appendChild(h("li", null, text)); });
        body.appendChild(list);
      });
      card.appendChild(body);
      host.appendChild(card);
    });
  }

  function toggleChangelog(version){
    if(!version) return;
    var card = document.querySelector('[data-changelog-entry="' + version + '"]');
    if(!card) return;
    var body = card.querySelector(".changelog-body");
    var head = card.querySelector("[data-changelog-toggle]");
    var caret = card.querySelector(".changelog-caret");
    var open = !settingsChangelogOpen[version];
    settingsChangelogOpen[version] = open;
    if(head) head.setAttribute("aria-expanded", open ? "true" : "false");
    if(caret) caret.textContent = open ? "▴" : "▾";
    if(!body) return;

    if(open){
      /* shell v10: expand eases open */
      body.hidden = false;
      body.classList.add("is-animating");
      body.style.maxHeight = "0px";
      body.style.opacity = "0";
      var target = body.scrollHeight;
      requestAnimationFrame(function(){
        body.style.maxHeight = target + "px";
        body.style.opacity = "1";
      });
      setTimeout(function(){
        if(!settingsChangelogOpen[version]) return;
        body.style.maxHeight = "none";
        body.style.opacity = "";
        body.classList.remove("is-animating");
        updateScrollAffordance();
        reportSize();
      }, 300);
    }else{
      /* shell v10: closing is instant */
      body.classList.remove("is-animating");
      body.style.maxHeight = "";
      body.style.opacity = "";
      body.hidden = true;
    }
    updateScrollAffordance();
    reportSize();
  }

  function renderHelp(body){
    body.classList.add("help-body");

    var block = addBlock(body, lx("helpHeading"));
    var steps = h("div", "helpsteps");
    steps.id = "rl-help-steps";
    HELP_STEPS.forEach(function(step, index){
      var item = h("div", "helpstep");
      item.setAttribute("data-help-step", String(index + 1));
      item.appendChild(h("b", null, String(index + 1) + ". " + lx(step.title)));
      item.appendChild(h("span", null, lx(step.text)));
      steps.appendChild(item);
    });
    block.appendChild(steps);

    var note = h("div", "helpnote");
    note.appendChild(h("span", "helpnote-ic", "!"));
    note.appendChild(h("span", null, lx("helpNote")));
    block.appendChild(note);
  }

  function resetSystemSettings(){
    if(!app) return;
    app.exportBehavior = "default";
    app.language = "en";
    setLanguage("en");
    setTheme("system");
    try{
      if(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local){
        chrome.storage.local.set({ "rl-lang": "en" });
      }
    }catch(err){ /* ignore */ }
    validateAgents();
    markDirty(0);
    if(role === "flyout" && state.section === "settings") renderFlyout("settings");
    toast(lx("settingsReset"));
  }

  function renderPlaceholder(body, section){
    var sentence = PLACEHOLDERS[section] || PLACEHOLDERS.help;
    var block = h("div", "ph-block");
    block.appendChild(h("p", "ph-text", t(state.lang === "en" ? sentence.en : sentence.tr)));
    var soon = h("button", "soon", lx("comingSoon"));
    soon.type = "button";
    soon.disabled = true;
    block.appendChild(soon);
    body.appendChild(block);
  }

  /* ---------- footer ---------- */

  function footState(hintText, noSave){
    els.foot.textContent = "";
    els.foot.appendChild(h("span", "hint", hintText));
    if(noSave) return;
    var save = h("span", "savestate", saveText());
    save.id = "rl-save-state";
    save.setAttribute("data-state", state.saving);
    if(state.saving === "saved" && (!lastSavedAt || Date.now() - lastSavedAt >= 3000)) save.classList.add("is-faded");
    els.foot.appendChild(save);
  }

  function footButton(label, cls, act, id, disabled){
    var btn = h("button", "btn" + (cls ? " " + cls : ""), label);
    btn.type = "button";
    if(act) btn.setAttribute("data-act", act);
    if(id) btn.id = id;
    if(disabled) btn.disabled = true;
    els.foot.appendChild(btn);
    return btn;
  }

  function draftHasPage(type){
    var tpl = templateFor(type || draftType);
    return !!(tpl.page || tpl.location);
  }

  function stepLabel(section){
    if(section === "new") return draftHasPage(draftType) ? "1 / 3" : "1 / 2";
    if(section === "page") return "2 / 3";
    if(section === "desc"){
      var req = activeRequest();
      return draftHasPage(req ? req.type : draftType) ? "3 / 3" : "2 / 2";
    }
    return "";
  }

  function primaryActionButton(kind, id){
    var req = activeRequest();
    if(isLocked(req)){
      footButton(lx("unlock"), "btn--primary", "unlock", id || "rl-unlock", false);
      return;
    }
    /* wizard steps: Page advances, final Desc saves */
    if(pendingRequest){
      var label = kind === "page" ? lx("nextStep") : t("Kaydet");
      footButton(label, "btn--primary", "save-section", id, false);
      return;
    }
    /* editing an existing request: the footer is the ready toggle */
    footButton(t("Hazır"), "btn--primary", "ready", id, false);
  }

  function renderFoot(section){
    if(els.foot) els.foot.classList.remove("has-export-steps");
    if(section === "new"){
      footState(stepLabel("new"));
      footButton(t("Vazgeç"), null, "close-section", "rl-cancel", false);
      footButton(lx("create"), "btn--primary", "create", "rl-create", !draftTitle.trim());
      return;
    }
    if(section === "project"){
      footState("", true);
      if(projectFormVisible()){
        footButton(lx("create"), "btn--primary", "save-project", "rl-project-create", false);
      }
      return;
    }
    if(section === "detail"){
      footState("");
      footButton(t("Sil"), "btn--danger btn--foot-delete", "delete", "rl-detail-delete", false);
      footButton(t("Kapat"), null, "close-section", "rl-detail-close", false);
      primaryActionButton("detail", "rl-detail-ready");
      return;
    }
    if(section === "page"){
      footState(stepLabel("page"));
      footButton(t("Vazgeç"), null, "close-section", null, false);
      primaryActionButton("page", null);
      return;
    }
    if(section === "desc"){
      footState(stepLabel("desc"));
      footButton(t("Vazgeç"), null, "close-section", null, false);
      primaryActionButton("desc", null);
      return;
    }
    if(section === "list"){
      /* shell v7: no "Kaydedildi" caption in the list footer; the save button
         itself flashes the confirmation for 3s */
      if(exportWizard){
        if(exportWizard.step === 1){
          footState("", true);
          footButton(t("Vazgeç"), null, "exp-cancel", "rl-exp-cancel", false);
          footButton(lx("nextStep"), "btn--primary", "exp-next", "rl-exp-next", exportBlocked());
        }else{
          footState("", true);
          /* shell v11 §12: previous step sits at the bottom-left, orange */
          var prev = footButton(lx("prevStep"), "btn--stage-back", "exp-back", "rl-exp-back", false);
          var prevIc = h("span", "btn-ic");
          prevIc.setAttribute("aria-hidden", "true");
          prevIc.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>';
          prev.insertBefore(prevIc, prev.firstChild);
          footButton(t("Vazgeç"), null, "exp-cancel", "rl-exp-cancel", false);
          footButton(exportWizard.busy ? lx("preparing") : t("Dışa Aktar"), "btn--primary", "exp-run", "rl-exp-run", exportWizard.busy || Boolean(planningValidation()));
        }
        /* shell v10: the step labels live in the bottom row, below the buttons */
        els.foot.classList.add("has-export-steps");
        els.foot.appendChild(buildExportStepRow());
        return;
      }
      footState("", true);
      footButton(lx("saveList"), "btn--primary", "save-record", "rl-save-record", !app || !app.requests.length);
      var exportOpen = footButton(t("Dışa Aktar"), "btn--with-icon", "exp-open", "rl-export-open", false);
      var exportIcon = h("span", "btn-ic");
      exportIcon.setAttribute("aria-hidden", "true");
      exportIcon.innerHTML = ICONS.export;
      exportOpen.insertBefore(exportIcon, exportOpen.firstChild);
      return;
    }
    if(section === "export"){
      footState("");
      footButton(t("Kapat"), null, "close-section", null, false);
      return;
    }
    footState("");
    footButton(t("Kapat"), null, "close-section", null, false);
  }

  /* ---------- flyout actions ---------- */

  function discardPending(){
    var req = pendingRequest;
    if(!req) return;
    pendingRequest = null;
    cancelConfirm = false;
    missingField = null;
    composeDirty = false;
    /* only the pending draft's own media is discarded: it never reached the
       list, so no snapshot can reference those blobs. Sweep once more after
       any in-flight image compression has drained. */
    deleteMediaFor(req);
    imageQueue.then(function(){
      return deleteMediaFor(req);
    }).catch(function(){ /* best effort */ });
    broadcastState();
  }

  function commitPending(){
    var req = pendingRequest;
    if(!req || !app) return null;
    pendingRequest = null;
    app.requests.push(req);
    activeRequestId = req.id;
    saveActivePointer(req.id);
    state.highlight = req.id;
    cancelConfirm = false;
    missingField = null;
    composeDirty = false;
    if(!flushSave()){
      /* keep the draft in memory if storage refused the write */
      if(core && core.requests && core.requests.remove) core.requests.remove(app.requests, req.id);
      else{
        var index = app.requests.indexOf(req);
        if(index >= 0) app.requests.splice(index, 1);
      }
      activeRequestId = null;
      saveActivePointer(null);
      pendingRequest = req;
      toast(lx("storageWriteFailed"), "error");
      return null;
    }
    broadcastState();
    return req;
  }

  function createRequest(){
    if(!app || !core || !core.requests) return;
    if(storageBlocked()){
      toast(lx("storageUnavailable"), "error");
      return;
    }
    var input = document.getElementById("rl-new-title");
    var title = (input ? input.value : draftTitle || "").trim();
    if(!title){
      if(input) try{ input.focus(); }catch(err){ /* ignore */ }
      return;
    }
    /* never stack two wizard drafts */
    if(pendingRequest) discardPending();
    var req = core.requests.create(app.requests, draftType);
    core.requests.update(req, { title:title, priority:draftPriority });

    /* shell v10 §9: the draft stays in memory until the final Desc "Kaydet" */
    pendingRequest = req;
    activeRequestId = null;
    state.highlight = null;
    cancelConfirm = false;
    missingField = null;
    composeDirty = false;

    draftTitle = "";
    draftType = "update";
    draftPriority = "normal";

    broadcastState();

    /* shell v10 §7: types without page/location go title → Desc directly */
    var tpl = templateFor(req.type);
    var next = (tpl.page || tpl.location) ? "page" : "desc";
    sendAction("compose", { requestId:req.id, section:next });
    if(!hasHost) showSection(next);
  }
