  /* ============================================================
     WORKSPACE UI · project settings modal
     ============================================================ */

  function projectValueRow(label, value, id){
    var span = h("span", "project-value", value == null || value === "" ? "—" : String(value));
    if(id) span.id = id;
    return settingRow(label, span);
  }

  function projectSettingsRecord(){
    return projectSettingsId ? findProjectRecord(projectSettingsId) : null;
  }

  function refreshProjectSettingsCounts(projectId){
    projectSettingsCounts = null;
    withProjectScope(projectId, function(){
      return Promise.all([
        core.storage.listCollection("records").then(function(list){ return (list || []).length; }).catch(function(){ return 0; }),
        core.storage.listCollection("drafts").then(function(list){ return (list || []).length; }).catch(function(){ return 0; })
      ]);
    }).then(function(values){
      if(projectSettingsId !== projectId) return;
      projectSettingsCounts = { records:values[0] || 0, drafts:values[1] || 0 };
      /* Update the count values in place so a name being typed is never lost. */
      var recordNode = document.getElementById("rl-project-record-value");
      if(recordNode) recordNode.textContent = projectRecordCountText(projectSettingsCounts.records);
      var draftNode = document.getElementById("rl-project-draft-value");
      if(draftNode) draftNode.textContent = projectDraftCountText(projectSettingsCounts.drafts);
    }).catch(function(){ /* counts are decorative */ });
  }

  function closeProjectSettingsModal(){
    projectExportPick = null;
    projectSettingsId = null;
    projectSettingsCounts = null;
    projectDeleteConfirm = false;
    var node = document.getElementById("rl-project-settings");
    if(node && node.parentNode) node.parentNode.removeChild(node);
  }

  function renderProjectSettingsModal(){
    if(role !== "flyout" || !els.card) return;
    var project = projectSettingsRecord();
    if(!project){
      closeProjectSettingsModal();
      return;
    }
    var existing = document.getElementById("rl-project-settings");
    if(existing && existing.parentNode) existing.parentNode.removeChild(existing);

    var el = h("div", "tab-picker project-modal");
    el.id = "rl-project-settings";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", lx("projectSettingsTitle") + ": " + project.name);

    var head = h("div", "tab-picker-head");
    head.appendChild(h("b", "tab-picker-title", lx("projectSettingsTitle")));
    var close = h("button", "tab-picker-x", "×");
    close.type = "button";
    close.id = "rl-project-settings-close";
    close.setAttribute("aria-label", t("Kapat"));
    close.setAttribute("data-project-act", "close");
    head.appendChild(close);
    el.appendChild(head);

    var body = h("div", "tab-picker-list project-modal__body");

    var pending = buildProjectPendingConfirm();
    if(pending) body.appendChild(pending);

    var nameBlock = addBlock(body, lx("projects"));
    addLabel(nameBlock, requiredLabel(lx("projectName")), "rl-project-name-input");
    var nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "fld";
    nameInput.id = "rl-project-name-input";
    nameInput.maxLength = 60;
    nameInput.autocomplete = "off";
    nameInput.value = project.name;
    nameInput.setAttribute("data-project-field", "name");
    nameBlock.appendChild(nameInput);
    var rename = h("button", "btn btn--small btn--primary", t("Kaydet"));
    rename.type = "button";
    rename.setAttribute("data-project-act", "rename");
    nameBlock.appendChild(rename);

    var summary = addBlock(body, t("Özet"));
    summary.appendChild(projectValueRow(lx("projectCreatedAt"), fmtDateTime(project.createdAt)));
    summary.appendChild(projectValueRow(lx("projectUpdatedAt"), fmtDateTime(project.updatedAt)));
    summary.appendChild(projectValueRow(lx("projectRequestCount"), projectRequestCountText(projectRequestCount(project.id))));
    summary.appendChild(projectValueRow(
      lx("projectRecordCount"),
      projectSettingsCounts ? projectRecordCountText(projectSettingsCounts.records) : "…",
      "rl-project-record-value"
    ));
    summary.appendChild(projectValueRow(
      lx("projectDraftCount"),
      projectSettingsCounts ? projectDraftCountText(projectSettingsCounts.drafts) : "…",
      "rl-project-draft-value"
    ));
    summary.appendChild(projectValueRow(lx("projectExportTarget"), project.exportTarget || lx("projectTargetNone")));

    var targetBlock = addBlock(body, lx("projectExportTarget"));
    var targetValue = document.createElement("input");
    targetValue.type = "text";
    targetValue.className = "fld";
    targetValue.id = "rl-project-target";
    targetValue.readOnly = true;
    targetValue.value = project.exportTarget || lx("projectTargetNone");
    targetValue.title = targetValue.value;
    targetBlock.appendChild(targetValue);
    var targetActions = h("div", "project-actions");
    var choose = h("button", "btn btn--small", lx("projectChooseTarget"));
    choose.type = "button";
    choose.setAttribute("data-project-act", "choose-target");
    targetActions.appendChild(choose);
    var clear = h("button", "btn btn--small", lx("projectClearTarget"));
    clear.type = "button";
    clear.setAttribute("data-project-act", "clear-target");
    clear.disabled = !project.exportTarget;
    targetActions.appendChild(clear);
    targetBlock.appendChild(targetActions);

    var actions = addBlock(body, lx("projects"));
    var actionRow = h("div", "project-actions");
    var isActive = project.id === activeProjectId;
    var open = h("button", "btn btn--small" + (isActive ? "" : " btn--primary"), lx(isActive ? "projectCurrentlyOpen" : "projectOpenBtn"));
    open.type = "button";
    open.setAttribute("data-project-act", "open");
    open.disabled = isActive;
    actionRow.appendChild(open);

    var registry = readRegistry();
    var total = registry ? registry.projects.length : 0;
    var remove = h("button", "btn btn--small btn--danger", lx("projectDeleteBtn"));
    remove.type = "button";
    remove.setAttribute("data-project-act", "delete");
    remove.disabled = total <= 1;
    remove.title = total <= 1 ? lx("projectLastGuard") : lx("projectDeleteBtn");
    actionRow.appendChild(remove);
    actions.appendChild(actionRow);
    if(total <= 1) actions.appendChild(h("p", "set-hint", lx("projectLastGuard")));

    if(projectDeleteConfirm){
      var confirm = h("div", "mini-confirm archive-confirm");
      confirm.setAttribute("role", "alertdialog");
      confirm.appendChild(h("p", "mc-text", lx("projectDeleteTitle")));
      confirm.appendChild(h("p", "mc-sub", project.name + " · " + lx("projectDeleteMsg")));
      var confirmActions = h("div", "mc-actions");
      var delBackup = h("button", "btn btn--small btn--primary", lx("projectDeleteWithBackup"));
      delBackup.type = "button";
      delBackup.setAttribute("data-project-act", "delete-confirm-backup");
      confirmActions.appendChild(delBackup);
      var del = h("button", "btn btn--small btn--danger", lx("projectDeleteNoBackup"));
      del.type = "button";
      del.setAttribute("data-project-act", "delete-confirm");
      confirmActions.appendChild(del);
      var back = h("button", "btn btn--small", t("Vazgeç"));
      back.type = "button";
      back.setAttribute("data-project-act", "delete-cancel");
      confirmActions.appendChild(back);
      confirm.appendChild(confirmActions);
      actions.appendChild(confirm);
    }

    el.appendChild(body);

    var foot = h("div", "tab-picker-foot");
    var closeFoot = h("button", "btn btn--small", t("Kapat"));
    closeFoot.type = "button";
    closeFoot.setAttribute("data-project-act", "close");
    foot.appendChild(closeFoot);
    el.appendChild(foot);

    els.card.appendChild(el);
    el.addEventListener("click", onBodyClick);
    el.addEventListener("input", onBodyInput);
    el.addEventListener("change", onBodyChange);
    el.addEventListener("keydown", function(event){
      if(event.key !== "Enter") return;
      if(event.target && event.target.id === "rl-project-name-input"){
        event.preventDefault();
        saveProjectSettingsName();
      }
    });

    if(projectSettingsCounts === null) refreshProjectSettingsCounts(project.id);
  }

  function openProjectSettingsModal(projectId){
    var project = findProjectRecord(projectId);
    if(!project){
      toast(lx("projectSettingsFailed"), "error");
      return;
    }
    closeImagePreview(false);
    closeTabPicker(false);
    closeOpenSelect();
    projectSettingsId = project.id;
    archiveSelectedProjectId = project.id;
    projectDeleteConfirm = false;
    projectSettingsCounts = null;
    renderProjectSettingsModal();
    renderArchiveProjectTree();
  }

  function saveProjectSettingsName(){
    var projectId = projectSettingsId;
    if(!projectId) return;
    var input = document.getElementById("rl-project-name-input");
    var value = normalizeProjectName(input ? input.value : "");
    if(!value){
      if(input){
        input.classList.add("is-invalid");
        try{ input.focus(); }catch(err){ /* ignore */ }
      }
      toast(lx("projectRequired"), "error");
      return;
    }
    var record = updateProjectRecord(projectId, { name:value, updatedAt:nowISO() });
    if(!record){
      toast(lx("projectRegistryFailed"), "error");
      return;
    }
    if(projectId === activeProjectId && app){
      app.project = record.name;
      saveNow();
      updateMarquee();
      broadcastState();
      if(role === "flyout" && state.section === "list") updateList();
    }
    queueAppProjectCommand("project-rename", projectId, record.name, record.ledgerId);
    if(input) input.classList.remove("is-invalid");
    toast(lx("projectRenamed"));
    projectSettingsCounts = null;
    renderProjectSettingsModal();
    renderArchiveProjectTree();
  }

  function chooseProjectSettingsTarget(){
    var projectId = projectSettingsId;
    if(!projectId) return;
    projectExportPick = projectId;
    if(!openFolderWindow("rl-export-dir")){
      projectExportPick = null;
      toast(lx("pickerUnavailable"), "error");
    }
  }

  async function clearProjectSettingsTarget(){
    var projectId = projectSettingsId;
    if(!projectId) return;
    setProjectExportTarget(projectId, "");
    try{ if(core.storage.deleteSetting) await core.storage.deleteSetting("targetFolder:" + projectId); }catch(err){ /* ignore */ }
    toast(lx("projectTargetCleared"));
    renderProjectSettingsModal();
    renderArchiveProjectTree();
  }

  function openProjectFromSettings(){
    var projectId = projectSettingsId;
    if(!projectId) return;
    if(projectId === activeProjectId) return;
    /* requestProjectOpen closes the modal when it can switch directly; when
       the source project is dirty it keeps the modal open and renders the
       existing Save/Discard/Cancel confirm inside it. */
    requestProjectOpen(projectId);
  }

  function openProjectDeleteConfirm(){
    var projectId = projectSettingsId;
    if(!projectId) return;
    var registry = readRegistry();
    if(!registry || registry.projects.length <= 1){
      toast(lx("projectLastGuard"), "error");
      return;
    }
    projectDeleteConfirm = true;
    renderProjectSettingsModal();
  }

  function deleteProjectFromSettings(keepBackup){
    var projectId = projectSettingsId;
    if(!projectId) return;
    deleteProjectById(projectId).then(function(ok){
      if(!ok) return;
      queueAppProjectCommand("project-delete", projectId, "", "", { keepBackup: keepBackup === true });
      projectDeleteConfirm = false;
      renderArchiveProjectTree();
    }).catch(function(){ /* deleteProjectById reports its own errors */ });
  }

  function handleProjectAction(action, element){
    var projectId = element && element.getAttribute ? element.getAttribute("data-project-id") : null;
    if(action === "new"){ openProjectCreateForm(); return; }
    if(action === "picker"){ openProjectPickerList(); return; }
    if(action === "pick"){ requestProjectOpen(projectId); return; }
    if(action === "settings"){ openProjectSettingsModal(projectId); return; }
    if(action === "close"){ closeProjectSettingsModal(); return; }
    if(action === "rename"){ saveProjectSettingsName(); return; }
    if(action === "choose-target"){ chooseProjectSettingsTarget(); return; }
    if(action === "clear-target"){ clearProjectSettingsTarget(); return; }
    if(action === "open"){ openProjectFromSettings(); return; }
    if(action === "delete"){ openProjectDeleteConfirm(); return; }
    if(action === "delete-confirm"){ deleteProjectFromSettings(false); return; }
    if(action === "delete-confirm-backup"){ deleteProjectFromSettings(true); return; }
    if(action === "delete-cancel"){
      projectDeleteConfirm = false;
      renderProjectSettingsModal();
      return;
    }
    if(action === "switch-save"){ finishProjectSwitch(true); return; }
    if(action === "switch-discard"){ finishProjectSwitch(false); return; }
    if(action === "switch-cancel"){ cancelProjectSwitch(); return; }
    if(action === "create-save"){ finishProjectCreate(true); return; }
    if(action === "create-discard"){ finishProjectCreate(false); return; }
    if(action === "create-cancel"){ cancelProjectCreate(); return; }
  }
