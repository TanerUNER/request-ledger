  function applyArchiveTab(){
    var panes = document.querySelectorAll("[data-archive-pane]");
    for(var i = 0; i < panes.length; i++){
      panes[i].hidden = panes[i].getAttribute("data-archive-pane") !== archiveTab;
    }
    updateArchiveTabCounts();
    syncArchiveEmptyHook();
    if(archiveRenameId){
      setTimeout(function(){
        var input = document.getElementById("rl-record-rename-input");
        if(input){
          try{ input.focus(); input.select(); }catch(err){ /* ignore */ }
        }
      }, 30);
    }
    updateScrollAffordance();
  }

  function syncArchiveEmptyHook(){
    var nodes = document.querySelectorAll("[data-archive-empty]");
    for(var i = 0; i < nodes.length; i++) nodes[i].removeAttribute("id");
    if(archiveTab === "list") return;
    var active = document.querySelector('[data-archive-pane="' + archiveTab + '"] [data-archive-empty]');
    if(active) active.id = "rl-archive-empty";
  }

  /* ---------- archive data ---------- */

  function sortArchive(kind){
    var list = archiveData[kind] || [];
    list.sort(function(a, b){
      var left = kind === "history" ? (a.exportedAt || a.savedAt) : a.savedAt;
      var right = kind === "history" ? (b.exportedAt || b.savedAt) : b.savedAt;
      var dl = left ? new Date(left).getTime() : 0;
      var dr = right ? new Date(right).getTime() : 0;
      return dr - dl;
    });
  }

  function ensureArchiveItem(kind, item){
    if(!item || typeof item !== "object") return { id:"", requests:[], project:"", savedAt:"" };
    if(kind !== "history"){
      if(!item.name){
        item.name = (item.project || "Projem") + " · " + fmtDateTime(item.savedAt);
      }
    }
    if(!Array.isArray(item.requests)) item.requests = [];
    return item;
  }

  function loadArchive(){
    if(archiveData.loading) return archiveData.loading;
    if(!core || !core.storage || !core.storage.listCollection){
      archiveData.loaded = true;
      return Promise.resolve(archiveData);
    }
    var kinds = ["records", "drafts", "history"];
    archiveData.loading = Promise.all(kinds.map(function(kind){
      return Promise.resolve()
        .then(function(){ return core.storage.listCollection(kind); })
        .then(function(list){ return list || []; })
        .catch(function(){ return []; });
    })).then(function(lists){
      kinds.forEach(function(kind, index){
        archiveData[kind] = (lists[index] || []).map(function(item){ return ensureArchiveItem(kind, item); });
        sortArchive(kind);
      });
      archiveData.loaded = true;
      archiveData.loading = null;
      refreshArchiveViews();
      return archiveData;
    }).catch(function(){
      archiveData.loading = null;
      archiveData.loaded = true;
      refreshArchiveViews();
      return archiveData;
    });
    return archiveData.loading;
  }

  function refreshArchiveViews(){
    if(role !== "flyout" || state.section !== "list") return;
    if(!document.getElementById("rl-archive-panel")) return;
    var scroll = els.body ? els.body.scrollTop : 0;
    renderArchiveViews();
    renderArchiveProjectTree();
    if(els.body) els.body.scrollTop = scroll;
    updateScrollAffordance();
  }

  function renderArchiveViews(){
    ["records", "drafts", "history"].forEach(function(kind){
      var pane = document.getElementById("rl-" + kind);
      if(!pane) return;
      pane.textContent = "";
      renderArchivePane(pane, kind);
    });
    syncDuplicatePrompt();
    updateArchiveTabCounts();
    syncArchiveEmptyHook();
    syncStorageUI();
  }

  /* the live ledger can change without a full flyout re-render (archive load,
     import, etc.); rebuild the İstekler pane in place so it never goes stale */
  function refreshListPane(){
    if(role !== "flyout" || state.section !== "list") return;
    var pane = document.querySelector('[data-archive-pane="list"]');
    if(!pane) return;
    var scroll = els.body ? els.body.scrollTop : 0;
    pane.textContent = "";
    buildListPane(pane);
    lastScrolledSelection = archiveTab === "list" ? null : state.highlight;
    updateList();
    renderArchiveProjectTree();
    if(els.body) els.body.scrollTop = scroll;
    updateScrollAffordance();
  }

  function renderArchivePane(pane, kind){
    var hintText = kind === "records" ? lx("recordHint") : kind === "drafts" ? lx("draftHint") : lx("historyHint");
    var head = h("div", "archive-head");
    head.appendChild(h("span", "archive-hint", hintText));

    var clear = h("button", "archive-clear", t("Temizle"));
    clear.type = "button";
    clear.id = kind === "records" ? "rl-records-clear" : kind === "drafts" ? "rl-drafts-clear" : "rl-history-clear";
    clear.setAttribute("data-archive-act", "clear-" + kind);
    clear.disabled = !archiveData[kind].length;
    head.appendChild(clear);
    pane.appendChild(head);

    if(archiveClear === kind) pane.appendChild(buildArchiveClearConfirm(kind));

    if(kind === "history" && archiveDetail){
      pane.appendChild(buildArchiveDetail(archiveDetail));
      return;
    }

    var items = archiveData[kind];
    if(!items.length){
      pane.appendChild(buildArchiveEmpty(kind));
      return;
    }

    var list = h("div", "archive-rows");
    items.forEach(function(item){ list.appendChild(buildArchiveRow(kind, item)); });
    pane.appendChild(list);
  }

  function buildArchiveEmpty(kind){
    var empty = h("div", "empty archive-empty");
    empty.setAttribute("data-archive-empty", "");
    var icon = h("span", "empty-ic");
    icon.innerHTML = kind === "history" ? ICONS.folder : ICONS.doc;
    icon.setAttribute("aria-hidden", "true");
    empty.appendChild(icon);
    var message = kind === "history"
      ? t("Henüz dışa aktarılan liste yok. Dışa aktarım sonrası burada tarihe göre görünecek.")
      : kind === "records"
        ? t("Henüz kayıt yok. Üstteki Kaydet ikonuyla anlık kayıt alabilirsin.")
        : t("Henüz taslak yok. Bir kayıt yüklenmeden önce mevcut liste otomatik taslak olarak saklanır.");
    empty.appendChild(h("b", null, message));
    return empty;
  }

  function buildArchiveRow(kind, item){
    var row = h("article", "arow");
    row.setAttribute("data-record-id", item.id);
    row.setAttribute("data-record-kind", kind);

    var main = h("div", "arow-main");
    if(kind === "records"){
      var dot = h("span", "adot " + recordStatusClass(item));
      dot.setAttribute("aria-hidden", "true");
      dot.title = recordStatusTitle(item);
      main.appendChild(dot);
    }

    var text = h("div", "arow-text");
    var titleLine = h("div", "arow-titleline");
    titleLine.appendChild(h("b", "arow-name", archiveName(item, kind)));
    if(kind === "drafts") titleLine.appendChild(h("span", "draft-badge", t("Taslak")));
    text.appendChild(titleLine);
    text.appendChild(h("span", "arow-meta", archiveMeta(item, kind)));
    text.appendChild(h("span", "arow-sub", archiveSub(item, kind)));
    main.appendChild(text);
    row.appendChild(main);

    var acts = h("div", "arow-acts");
    var open = h("button", "arow-act", lx("open"));
    open.type = "button";
    open.setAttribute("data-record-action", "open");
    acts.appendChild(open);

    if(kind === "records"){
      var rename = h("button", "arow-act", t("Yeniden adlandır"));
      rename.type = "button";
      rename.setAttribute("data-record-action", "rename");
      acts.appendChild(rename);
    }

    var del = h("button", "arow-act is-danger", t("Sil"));
    del.type = "button";
    del.setAttribute("data-record-action", "delete");
    acts.appendChild(del);
    row.appendChild(acts);

    if(kind === "records" && archiveRenameId === item.id) row.appendChild(buildRenameEditor(item));
    if(archiveDelete && archiveDelete.id === item.id && archiveDelete.kind === kind){
      row.appendChild(buildArchiveDeleteConfirm(kind, item));
    }
    return row;
  }

  function archiveName(item, kind){
    if(kind === "history") return item.project || item.name || t("Dışa Aktarılanlar");
    if(item.name) return item.name;
    var base = item.project || "Projem";
    return base + " · " + fmtDateTime(item.savedAt);
  }

  function archiveMeta(item, kind){
    var n = item.requestCount == null ? (item.requests || []).length : item.requestCount;
    var m = item.imageCount;
    var k = item.fileCount;
    if(m == null){
      m = 0;
      (item.requests || []).forEach(function(req){ m += (req.images || []).length; });
    }
    if(k == null){
      k = 0;
      (item.requests || []).forEach(function(req){ k += (req.attachments || []).length; });
    }
    if(kind === "history"){
      return t(n + " istek") + " · " + String(item.format || "zip").toUpperCase();
    }
    return t(n + " istek") + " · " + t(m + " görsel") + " · " + t(k + " dosya");
  }

  function archiveSub(item, kind){
    var time = fmtDateTime(kind === "history" ? (item.exportedAt || item.savedAt) : item.savedAt);
    if(kind === "history"){
      return time + " · " + (item.fileName || t("Tarayıcıda"));
    }
    if(kind === "drafts"){
      var reason = item.reason;
      var reasonText = !reason ? t("Manuel taslak") : (reason === "auto-draft" || reason === L.autoDraftReason.tr ? lx("autoDraftReason") : t(reason));
      return time + " · " + reasonText;
    }
    return time;
  }

  function recordStatusClass(item){
    if(!item || !item.complete) return "is-red";
    return item.exported ? "is-green" : "is-yellow";
  }

  function recordStatusTitle(item){
    if(!item || !item.complete) return lx("missingFields");
    return item.exported ? lx("exported") : lx("notExported");
  }

  function buildRenameEditor(item){
    var box = h("div", "arename");
    var input = document.createElement("input");
    input.type = "text";
    input.id = "rl-record-rename-input";
    input.className = "fld";
    input.maxLength = 120;
    input.autocomplete = "off";
    input.value = item.name || "";
    input.setAttribute("aria-label", t("Kayıt adı"));
    box.appendChild(input);

    var save = h("button", "btn btn--small btn--primary", t("Kaydet"));
    save.type = "button";
    save.setAttribute("data-archive-act", "rename-save");
    box.appendChild(save);

    var cancel = h("button", "btn btn--small", t("Vazgeç"));
    cancel.type = "button";
    cancel.setAttribute("data-archive-act", "rename-cancel");
    box.appendChild(cancel);
    return box;
  }

  function buildArchiveDeleteConfirm(kind, item){
    var box = h("div", "mini-confirm archive-confirm");
    box.setAttribute("role", "alertdialog");
    var title = kind === "records" ? lx("recordDeleteTitle") : kind === "drafts" ? lx("draftDeleteTitle") : lx("historyDeleteTitle");
    box.appendChild(h("p", "mc-text", title));
    box.appendChild(h("p", "mc-sub", archiveName(item, kind) + " · " + lx("deleteSub")));

    var actions = h("div", "mc-actions");
    var del = h("button", "btn btn--small btn--danger", t("Sil"));
    del.type = "button";
    del.setAttribute("data-archive-act", "delete-confirm");
    actions.appendChild(del);
    var back = h("button", "btn btn--small", t("Vazgeç"));
    back.type = "button";
    back.setAttribute("data-archive-act", "delete-cancel");
    actions.appendChild(back);
    box.appendChild(actions);
    return box;
  }

  function buildArchiveClearConfirm(kind){
    var box = h("div", "mini-confirm archive-confirm");
    box.setAttribute("role", "alertdialog");
    var label = kind === "records" ? t("Kayıtlar") : kind === "drafts" ? t("Taslaklar") : t("Dışa Aktarılanlar");
    box.appendChild(h("p", "mc-text", lx("clearTitle", { label:label })));
    box.appendChild(h("p", "mc-sub", lx("clearSub")));

    var actions = h("div", "mc-actions");
    var ok = h("button", "btn btn--small btn--danger", t("Temizle"));
    ok.type = "button";
    ok.setAttribute("data-archive-act", "clear-confirm");
    actions.appendChild(ok);
    var back = h("button", "btn btn--small", t("Vazgeç"));
    back.type = "button";
    back.setAttribute("data-archive-act", "clear-cancel");
    actions.appendChild(back);
    box.appendChild(actions);
    return box;
  }

  function buildArchiveDetail(item){
    var box = h("article", "adetail");
    box.setAttribute("data-record-id", item.id);
    box.setAttribute("data-record-kind", "history");

    var head = h("div", "adetail-head");
    var back = h("button", "archive-back", "← " + lx("back"));
    back.type = "button";
    back.setAttribute("data-archive-act", "detail-back");
    head.appendChild(back);

    var del = h("button", "arow-act is-danger", t("Sil"));
    del.type = "button";
    del.setAttribute("data-record-action", "delete");
    head.appendChild(del);
    box.appendChild(head);

    box.appendChild(h("b", "adetail-title", archiveName(item, "history")));
    box.appendChild(h("div", "adetail-meta", archiveMeta(item, "history") + " · " + (item.fileName || t("Tarayıcıda"))));

    var preview = document.createElement("pre");
    preview.className = "archive-preview";
    preview.setAttribute("readonly", "readonly");
    preview.textContent = item.markdown || lx("contentsMissing");
    box.appendChild(preview);

    if(archiveDelete && archiveDelete.id === item.id && archiveDelete.kind === "history"){
      box.appendChild(buildArchiveDeleteConfirm("history", item));
    }
    return box;
  }

  function syncDuplicatePrompt(){
    var host = document.getElementById("rl-dup-prompt");
    if(!host) return;
    host.textContent = "";
    if(!duplicatePrompt){
      host.hidden = true;
      return;
    }
    host.hidden = false;

    var box = h("div", "mini-confirm archive-confirm");
    box.setAttribute("role", "alertdialog");
    box.appendChild(h("p", "mc-text", lx("duplicateTitle")));
    var existing = duplicatePrompt.existing;
    var when = fmtDateTime(existing ? existing.savedAt : "");
    box.appendChild(h("p", "mc-sub", t("Bu istek listesi " + when + " tarihinde kaydedilmiş. Mevcut kaydın üzerine yazmak mı, yoksa yeni bir kayıt oluşturmak mı istersin?")));

    var actions = h("div", "mc-actions");
    var overwrite = h("button", "btn btn--small btn--primary", t("Üzerine Yaz"));
    overwrite.type = "button";
    overwrite.setAttribute("data-archive-act", "dup-overwrite");
    actions.appendChild(overwrite);

    var fresh = h("button", "btn btn--small", t("Yeni Kayıt Oluştur"));
    fresh.type = "button";
    fresh.setAttribute("data-archive-act", "dup-new");
    actions.appendChild(fresh);

    var cancel = h("button", "btn btn--small", t("Vazgeç"));
    cancel.type = "button";
    cancel.setAttribute("data-archive-act", "dup-cancel");
    actions.appendChild(cancel);

    box.appendChild(actions);
    host.appendChild(box);
  }

  function fmtDateTime(value){
    if(value && core && core.util && core.util.formatDateTime){
      try{ return core.util.formatDateTime(value); }catch(err){ /* ignore */ }
    }
    return value ? String(value) : "";
  }

  function buildListProgress(){
    var btn = h("button", "list-progress");
    btn.type = "button";
    btn.id = "rl-list-progress";
    btn.setAttribute("data-act", "jump-incomplete");

    var top = h("span", "lp-top");
    top.appendChild(h("span", "lp-text", ""));
    top.appendChild(h("span", "lp-missing", ""));
    btn.appendChild(top);

    var bar = h("span", "lp-bar");
    bar.appendChild(h("i"));
    btn.appendChild(bar);
    return btn;
  }

  function buildListSearch(){
    var box = h("div", "searchbox");
    var icon = h("span", "searchbox-ic");
    icon.innerHTML = ICONS.search;
    icon.setAttribute("aria-hidden", "true");
    box.appendChild(icon);

    var input = document.createElement("input");
    input.type = "search";
    input.id = "rl-search";
    input.className = "fld";
    input.autocomplete = "off";
    input.placeholder = lx("search");
    input.setAttribute("aria-label", lx("search"));
    input.value = listFilter.q || "";
    box.appendChild(input);
    return box;
  }

  function buildListTypeFilters(){
    var wrap = h("div", "lfchips");
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", t("Türe göre filtrele"));

    var entries = [{ id:"all", label:t("Tümü") }].concat(TYPES.map(function(entry){
      return { id:entry.id, label:t(entry.label) };
    }));
    entries.forEach(function(entry){
      var active = listFilter.type === entry.id;
      var btn = h("button", "lfchip" + (active ? " is-active" : ""));
      btn.type = "button";
      btn.setAttribute("data-filter-type", entry.id);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
      btn.appendChild(h("span", null, entry.label));
      var n = h("span", "n", "0");
      n.setAttribute("data-count", entry.id);
      btn.appendChild(n);
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function buildListControls(){
    var row = h("div", "list-row2");
    var options = [
      { value:"all", label:t("Tüm durumlar") },
      { value:"ready", label:t("Hazır") },
      { value:"notready", label:t("Hazır değil") }
    ];
    /* shell v11 §6: themed custom select; the hidden native select keeps the
       id + change hooks for automation. */
    var status = buildCustomSelect("rl-status-filter", listFilter.status, options, function(value){
      listFilter.status = (value === "ready" || value === "notready") ? value : "all";
      openRowMenuId = null;
      listDeleteId = null;
      refreshList();
    }, {
      className:"list-status-sel",
      label:t("Duruma göre filtrele"),
      attrs:{ "aria-label":t("Duruma göre filtrele") }
    });
    row.appendChild(status);

    var count = h("span", "list-count", "");
    count.id = "rl-list-count";
    row.appendChild(count);
    return row;
  }

  function updateList(){
    if(role !== "flyout" || state.section !== "list" || !app) return;
    var groups = document.getElementById("rl-list-groups");
    if(!groups) return;

    groups.textContent = "";
    var selection = selectedRequestId();
    var totals = {};
    TYPES.forEach(function(type){ totals[type.id] = 0; });
    app.requests.forEach(function(req){
      if(totals[req.type] == null) totals[req.type] = 0;
      totals[req.type]++;
    });

    var visible = 0;
    var grouped = {};
    TYPES.forEach(function(type){ grouped[type.id] = []; });
    app.requests.forEach(function(req){
      if(!listMatches(req)) return;
      if(!grouped[req.type]) grouped[req.type] = [];
      grouped[req.type].push(req);
    });
    TYPES.forEach(function(type){
      var items = grouped[type.id] || [];
      if(!items.length) return;

      var group = h("section", "tgroup");
      group.setAttribute("data-type-group", type.id);
      var head = h("div", "tgroup-head");
      var dot = h("i", "dot dot--" + type.id);
      dot.setAttribute("aria-hidden", "true");
      head.appendChild(dot);
      head.appendChild(h("h4", null, t(type.label)));
      head.appendChild(h("span", "tgroup-count", String(items.length)));
      group.appendChild(head);

      items.forEach(function(req){
        group.appendChild(buildListRow(req, selection));
        visible++;
      });
      groups.appendChild(group);
    });

    var total = app.requests.length;

    /* filter chips: active state + counts */
    var chips = document.querySelectorAll("[data-filter-type]");
    for(var c = 0; c < chips.length; c++){
      var chip = chips[c];
      var typeId = chip.getAttribute("data-filter-type");
      var active = listFilter.type === typeId;
      chip.classList.toggle("is-active", active);
      chip.setAttribute("aria-pressed", active ? "true" : "false");
      var countNode = chip.querySelector("[data-count]");
      if(countNode) countNode.textContent = String(typeId === "all" ? total : (totals[typeId] || 0));
    }

    /* result count */
    var filtered = !!listFilter.q || listFilter.type !== "all" || listFilter.status !== "all";
    var countText = t(total + " istek");
    var countEl = document.getElementById("rl-list-count");
    if(countEl) countEl.textContent = (filtered ? visible + " / " : "") + countText;

    updateListProgress(total);
    fillListEmpty(total, visible);

    var saveBtn = document.getElementById("rl-save-record");
    if(saveBtn) saveBtn.disabled = total === 0;
    updateArchiveTabCounts();

    if(selection && selection !== lastScrolledSelection){
      var targetRow = null;
      var rows = groups.querySelectorAll("[data-request-id]");
      for(var r = 0; r < rows.length; r++){
        if(rows[r].getAttribute("data-request-id") === selection){ targetRow = rows[r]; break; }
      }
      if(targetRow){
        lastScrolledSelection = selection;
        requestAnimationFrame(function(){ revealListRow(targetRow); });
      }
    }
    syncStorageUI();
    updateScrollAffordance();
  }
