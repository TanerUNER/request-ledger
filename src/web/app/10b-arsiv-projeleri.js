  /* ============================================================
     Arşiv · Projeler bölümü
     ============================================================ */
  /* The archive starts with a searchable project tree grouped by update date.
     Selecting a row opens the project settings modal and keeps a compact
     detail card under the tree. Records/Drafts/Exported below stay scoped to
     the open project. */

  function archiveProjectMatches(project, query){
    if(!query) return true;
    return trLower(project.name).indexOf(query) !== -1;
  }

  function archiveProjectMeta(project){
    const parts = [];
    const date = formatProjectDate(project.updatedAt);
    if(date) parts.push(date);
    parts.push(countLabel(projectRequestCount(project.id), "istek", "istek", "request", "requests"));
    return parts.join(" · ");
  }

  function renderArchiveProjectDetail(){
    const box = $("#archiveProjectDetail");
    if(!box) return;
    const project = archiveSelectedProjectId ? findProjectRecord(archiveSelectedProjectId) : null;
    if(!project){
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    box.hidden = false;
    box.innerHTML = "";
    const head = document.createElement("div");
    head.className = "archive__detail-head";
    const name = document.createElement("b");
    name.textContent = project.name;
    const open = document.createElement("button");
    open.type = "button";
    open.className = "archive__detail-open";
    open.dataset.projectId = project.id;
    open.textContent = translateString("Proje ayarları");
    open.setAttribute("aria-label", translateString("Proje ayarları") + ": " + project.name);
    head.appendChild(name);
    head.appendChild(open);
    const created = document.createElement("span");
    created.className = "archive__detail-meta";
    created.textContent = translateString("Oluşturma") + ": " + (formatProjectDate(project.createdAt) || "—");
    const updated = document.createElement("span");
    updated.className = "archive__detail-meta";
    updated.textContent = translateString("Güncelleme") + ": " + (formatProjectDate(project.updatedAt) || "—");
    const target = document.createElement("span");
    target.className = "archive__detail-meta";
    target.textContent = translateString("Dışa aktarım hedefi") + ": " + translateString(project.exportTarget || "Seçilmedi");
    const folder = document.createElement("span");
    folder.className = "archive__detail-meta";
    folder.textContent = translateString("Klasör") + ": " + (project.folder ? "projects/" + project.folder + "/" : "—");
    box.appendChild(head);
    box.appendChild(created);
    box.appendChild(updated);
    box.appendChild(target);
    box.appendChild(folder);
  }

  function renderArchiveProjects(){
    const tree = $("#archiveProjectTree");
    if(!tree) return;
    const registry = readRegistry();
    const projects = registry ? registry.projects.slice() : [];
    projects.sort(function(a, b){
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    });
    const query = trLower(archiveProjectQuery.trim());
    const filtered = projects.filter(function(project){ return archiveProjectMatches(project, query); });
    const count = $("#archiveProjectCount");
    if(count) count.textContent = query ? filtered.length + " / " + projects.length : String(projects.length);
    if(archiveSelectedProjectId && !projects.some(function(project){ return project.id === archiveSelectedProjectId; })){
      archiveSelectedProjectId = null;
    }
    tree.innerHTML = "";
    if(!filtered.length){
      const empty = document.createElement("div");
      empty.className = "history__empty";
      empty.textContent = query
        ? translateString("Proje bulunamadı.")
        : translateString("Henüz proje yok. Yeni bir proje oluştur.");
      tree.appendChild(empty);
      renderArchiveProjectDetail();
      return;
    }
    const groups = new Map();
    filtered.forEach(function(project){
      const stamp = new Date(project.updatedAt || Date.now());
      const key = isNaN(stamp.getTime()) ? "0000-00-00" : formatYMD(stamp);
      if(!groups.has(key)) groups.set(key, []);
      groups.get(key).push(project);
    });
    groups.forEach(function(groupItems, key){
      const details = document.createElement("details");
      details.className = "hgroup";
      details.open = true;
      const summary = document.createElement("summary");
      const chevron = document.createElement("span");
      chevron.className = "hgroup__chev";
      chevron.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
      const date = document.createElement("span");
      date.className = "hgroup__date";
      date.textContent = key === "0000-00-00" ? "—" : formatDateLong(new Date(key + "T12:00:00"));
      const number = document.createElement("span");
      number.className = "hgroup__n";
      number.textContent = groupItems.length;
      summary.appendChild(chevron);
      summary.appendChild(date);
      summary.appendChild(number);
      details.appendChild(summary);
      const list = document.createElement("div");
      list.className = "hgroup__items";
      groupItems.forEach(function(project){
        const button = document.createElement("button");
        button.type = "button";
        button.className = "hitem";
        button.dataset.projectId = project.id;
        if(archiveSelectedProjectId === project.id) button.classList.add("is-selected");
        if(activeProjectId === project.id) button.setAttribute("aria-current", "true");
        button.title = project.name + " · " + archiveProjectMeta(project);
        const time = document.createElement("span");
        time.className = "hitem__time";
        const stampDate = new Date(project.updatedAt || Date.now());
        time.textContent = isNaN(stampDate.getTime()) ? "" : formatTime(stampDate);
        const body = document.createElement("span");
        body.className = "hitem__body";
        const title = document.createElement("b");
        title.className = "hitem__title";
        title.textContent = project.name;
        const meta = document.createElement("small");
        meta.className = "hitem__meta";
        meta.textContent = archiveProjectMeta(project);
        body.appendChild(title);
        body.appendChild(meta);
        button.appendChild(time);
        button.appendChild(body);
        if(activeProjectId === project.id){
          const status = document.createElement("span");
          status.className = "hitem__status is-green";
          status.title = translateString("Açık");
          status.setAttribute("aria-label", translateString("Açık"));
          button.appendChild(status);
        }
        list.appendChild(button);
      });
      details.appendChild(list);
      tree.appendChild(details);
    });
    renderArchiveProjectDetail();
  }

  function selectArchiveProject(projectId){
    archiveSelectedProjectId = projectId || null;
    renderArchiveProjects();
  }
