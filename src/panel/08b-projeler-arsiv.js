  /* ============================================================
     WORKSPACE UI · project picker + archive Projects tree
     ============================================================ */

  function sortedProjects(){
    var registry = readRegistry();
    var projects = registry ? registry.projects.slice() : [];
    projects.sort(function(a, b){
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    });
    return projects;
  }

  function projectFormVisible(){
    var projects = sortedProjects();
    return projectFormOpen || projects.length === 0;
  }

  function projectSectionLabel(){
    return sortedProjects().length ? lx("projects") : lx("newProject");
  }

  function projectSectionTitle(){
    return sortedProjects().length ? lx("projects") : lx("newProjectTitle");
  }

  function projectSearchMatches(project, query){
    if(!query) return true;
    return trLower(project.name).indexOf(query) !== -1;
  }

  function buildProjectRow(project, action){
    var btn = h("button", "arow project-row");
    btn.type = "button";
    btn.setAttribute("data-project-act", action || "settings");
    btn.setAttribute("data-project-id", project.id);
    btn.title = project.name + " · " + projectMetaText(project);
    if(project.id === activeProjectId) btn.setAttribute("aria-current", "true");

    var main = h("div", "arow-main");
    if(project.id === activeProjectId){
      var dot = h("span", "adot is-green");
      dot.setAttribute("aria-hidden", "true");
      main.appendChild(dot);
    }
    var text = h("div", "arow-text");
    text.appendChild(h("b", "arow-name", project.name));
    text.appendChild(h("span", "arow-meta", projectMetaText(project)));
    main.appendChild(text);
    btn.appendChild(main);

    if(project.id === activeProjectId){
      var current = h("span", "project-current", lx("projectCurrentlyOpen"));
      btn.appendChild(current);
    }
    return btn;
  }

  function buildProjectPendingConfirm(){
    if(!projectSwitchPending && !projectCreatePending) return null;
    var box = h("div", "mini-confirm archive-confirm");
    box.setAttribute("role", "alertdialog");
    var isSwitch = !!projectSwitchPending;
    box.appendChild(h("p", "mc-text", lx(isSwitch ? "projectSwitchTitle" : "newProjectTitle")));
    box.appendChild(h("p", "mc-sub", lx(isSwitch ? "projectSwitchMsg" : "projectCreateMsg")));

    var actions = h("div", "mc-actions");
    var save = h("button", "btn btn--small btn--primary", lx(isSwitch ? "projectSaveAndSwitch" : "projectSaveAndCreate"));
    save.type = "button";
    save.setAttribute("data-project-act", isSwitch ? "switch-save" : "create-save");
    actions.appendChild(save);

    var discard = h("button", "btn btn--small", lx(isSwitch ? "projectSwitchWithoutSaving" : "projectCreateWithoutSaving"));
    discard.type = "button";
    discard.setAttribute("data-project-act", isSwitch ? "switch-discard" : "create-discard");
    actions.appendChild(discard);

    var cancel = h("button", "btn btn--small", t("Vazgeç"));
    cancel.type = "button";
    cancel.setAttribute("data-project-act", isSwitch ? "switch-cancel" : "create-cancel");
    actions.appendChild(cancel);

    box.appendChild(actions);
    return box;
  }

  /* ---------- project gate / picker section ---------- */

  function renderProjectSection(body){
    body.classList.add("project-body");
    var block = addBlock(body, projectFormVisible() ? lx("newProjectTitle") : lx("projects"));

    var pending = buildProjectPendingConfirm();
    if(pending) block.appendChild(pending);

    var projects = sortedProjects();
    if(projectFormVisible()){
      var back = null;
      if(projects.length){
        back = h("button", "project-back", "← " + lx("back"));
        back.type = "button";
        back.setAttribute("data-project-act", "picker");
        block.appendChild(back);
      }
      block.appendChild(h("p", "set-hint", lx("projectCreateHint")));

      addLabel(block, requiredLabel(lx("projectName")), "rl-project-input");
      var input = addField(block, {
        id: "rl-project-input",
        tag: "input",
        max: 60,
        placeholder: lx("projectNamePh"),
        value: ""
      });
      input.autocomplete = "off";
      input.type = "text";
      input.addEventListener("keydown", function(event){
        if(event.key === "Enter"){ event.preventDefault(); saveProjectName(); }
      });
      setTimeout(function(){
        if(input && !input.disabled) try{ input.focus(); }catch(err){ /* ignore */ }
      }, 40);
      return;
    }

    block.appendChild(h("p", "set-hint", lx("projectPickHint")));

    var list = h("div", "archive__projecttree");
    list.id = "rl-project-picker-tree";
    projects.forEach(function(project){
      list.appendChild(buildProjectRow(project, "pick"));
    });
    block.appendChild(list);

    var add = h("button", "btn btn--small archive__new", lx("projectNew"));
    add.type = "button";
    add.id = "rl-project-new";
    add.setAttribute("data-project-act", "new");
    block.appendChild(add);
  }

  function openProjectCreateForm(){
    projectFormOpen = true;
    if(role === "flyout"){
      showSection("project");
      return;
    }
    refreshProjectViews();
  }

  function openProjectPickerList(){
    projectFormOpen = false;
    if(role === "flyout" && state.section === "project"){
      renderFlyout("project");
      return;
    }
    refreshProjectViews();
  }

  /* ---------- archive Projects section ---------- */

  function buildArchiveProjectsSection(){
    var wrap = h("section", "archive__projects");

    var head = h("div", "archive__sectionhead");
    head.appendChild(h("span", "archive__label", lx("projects")));
    var count = h("span", "archive__n");
    count.id = "rl-project-count";
    head.appendChild(count);
    var add = h("button", "btn btn--small archive__new", lx("projectNew"));
    add.type = "button";
    add.id = "rl-archive-project-new";
    add.setAttribute("data-project-act", "new");
    head.appendChild(add);
    wrap.appendChild(head);

    var search = h("div", "searchbox archive__search");
    var icon = h("span", "searchbox-ic");
    icon.innerHTML = ICONS.search;
    icon.setAttribute("aria-hidden", "true");
    search.appendChild(icon);
    var input = document.createElement("input");
    input.type = "search";
    input.id = "rl-project-search";
    input.className = "fld";
    input.autocomplete = "off";
    input.placeholder = lx("projectsSearch");
    input.setAttribute("aria-label", lx("projectsSearch"));
    input.value = archiveProjectQuery;
    search.appendChild(input);
    wrap.appendChild(search);

    var tree = h("div", "archive__projecttree");
    tree.id = "rl-archive-project-tree";
    wrap.appendChild(tree);

    var pending = buildProjectPendingConfirm();
    if(pending) wrap.appendChild(pending);

    renderArchiveProjectTree();
    return wrap;
  }

  function renderArchiveProjectTree(){
    var tree = document.getElementById("rl-archive-project-tree");
    if(!tree) return;
    var projects = sortedProjects();
    var query = trLower(String(archiveProjectQuery || "").trim());
    var filtered = projects.filter(function(project){ return projectSearchMatches(project, query); });
    var count = document.getElementById("rl-project-count");
    if(count) count.textContent = query ? filtered.length + " / " + projects.length : String(projects.length);

    if(archiveSelectedProjectId && !projects.some(function(project){ return project.id === archiveSelectedProjectId; })){
      archiveSelectedProjectId = null;
    }

    tree.textContent = "";
    if(!filtered.length){
      var empty = h("div", "archive-project-empty", query
        ? lx("projectsNoMatch")
        : lx("projectsEmpty"));
      tree.appendChild(empty);
      return;
    }
    filtered.forEach(function(project){
      tree.appendChild(buildProjectRow(project, "settings"));
    });
  }

  function applyProjectExportTarget(projectId, name){
    if(!name){
      toast(lx("pickerCancelled"));
      return;
    }
    setProjectExportTarget(projectId, name);
    toast(lx("projectTargetSet", { name:name }));
    if(projectSettingsId === projectId) renderProjectSettingsModal();
    renderArchiveProjectTree();
  }
