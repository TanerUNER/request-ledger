  function renderDetail(body){
    var req = activeRequest();
    if(!req){
      body.appendChild(h("p", "notice", t("Henüz istek yok")));
      return;
    }
    body.classList.add("detail-body");

    addMiniConfirm(body);
    addTypePrioritySummary(body, req);

    var locked = isLocked(req);
    addLabel(body, requiredLabel(t("Başlık")), "rl-title-input");
    var titleInput = addField(body, {
      id: "rl-title-input",
      tag: "input",
      field: "title",
      max: 120,
      placeholder: t("Kısa ve anlaşılır bir başlık"),
      value: req.title,
      disabled: locked
    });
    titleInput.type = "text";
    titleInput.autocomplete = "off";
    if(missingField === "title"){
      titleInput.classList.add("is-invalid");
      titleInput.setAttribute("aria-invalid", "true");
      var titleHint = h("div", "field-hint", lx("titleRequired"));
      titleHint.id = "rl-title-hint";
      body.appendChild(titleHint);
    }

    /* shell v10 §7: only render the Page section when the type includes it */
    var tpl = templateFor(req.type);
    if(tpl.page || tpl.location){
      renderPage(body, { combined:true });
      var split = h("div", "detail-sep");
      split.setAttribute("aria-hidden", "true");
      body.appendChild(split);
    }

    renderDesc(body, { combined:true });
  }

  /* ---------- desc ---------- */

  function renderDesc(body, opts){
    opts = opts || {};
    var req = activeRequest();
    if(!req){
      body.appendChild(h("p", "notice", t("Henüz istek yok")));
      return;
    }
    if(!opts.combined){
      addMiniConfirm(body);
    }

    var locked = isLocked(req);
    var tpl = templateFor(req.type);

    /* shell v8: no type/priority summary in the standalone description view */

    /* description */
    var descBlock = addBlock(body, requiredLabel(t("Açıklama")));
    addField(descBlock, {
      id: "rl-desc-input",
      tag: "textarea",
      field: "description",
      rows: 4,
      max: 5000,
      placeholder: t(typeInfo(req.type).ph || ""),
      value: req.description,
      disabled: locked
    });
    if(missingField === "description"){
      var descInput = document.getElementById("rl-desc-input");
      if(descInput){
        descInput.classList.add("is-invalid");
        descInput.setAttribute("aria-invalid", "true");
      }
      var hint = h("div", "field-hint", lx("descRequired"));
      hint.id = "rl-invalid-hint";
      hint.setAttribute("data-invalid", "");
      descBlock.appendChild(hint);
    }

    /* images */
    renderImagesBlock(body, req, locked);

    /* shell v11 §7: files are available for every request type */
    renderAttachmentsBlock(body, req, locked);

    /* console (bug) */
    if(tpl.console){
      var consoleBlock = addBlock(body, optionalLabel(t("Console Hatası veya Sayfa Hatası")));
      addField(consoleBlock, {
        id: "rl-console-input",
        tag: "textarea",
        field: "consoleError",
        rows: 3,
        max: 2000,
        placeholder: t("Örn. Uncaught TypeError: … / 404 sayfa hatası…"),
        value: req.consoleError,
        disabled: locked
      });
      /* shell v8: pull the active tab's recorded console titles into the box */
      var consoleRow = h("div", "console-actions");
      var fetchConsole = h("button", "btn btn--small", lx("fetchConsole"));
      fetchConsole.type = "button";
      fetchConsole.id = "rl-console-fetch";
      fetchConsole.setAttribute("data-act", "console-fetch");
      fetchConsole.setAttribute("aria-label", lx("fetchConsole"));
      fetchConsole.disabled = locked;
      consoleRow.appendChild(fetchConsole);
      consoleBlock.appendChild(consoleRow);
    }

    /* sample website + attachments (design) */
    if(tpl.sampleWebsite){
      var siteBlock = addBlock(body, optionalLabel(t("Örnek web sitesi")));
      addField(siteBlock, {
        id: "rl-site-input",
        tag: "input",
        field: "sampleWebsite",
        type: "url",
        max: 500,
        placeholder: "https://…",
        value: req.sampleWebsite,
        disabled: locked
      });
    }
    /* files moved directly under Images above */

    /* link (all but feature) */
    if(tpl.link){
      var linkBlock = addBlock(body, optionalLabel(t("İlgili bağlantı")));
      addField(linkBlock, {
        id: "rl-link-input",
        tag: "input",
        field: "link",
        type: "url",
        max: 500,
        placeholder: "https://…",
        value: req.link,
        disabled: locked
      });
    }

    /* note (always) */
    var noteBlock = addBlock(body, optionalLabel(t("Ek not")));
    addField(noteBlock, {
      id: "rl-note-input",
      tag: "textarea",
      field: "note",
      rows: 3,
      max: 2000,
      placeholder: t("İstersen ek bir açıklama ekle…"),
      value: req.note,
      disabled: locked
    });

    if(missingField === "description"){
      setTimeout(function(){
        var input = document.getElementById("rl-desc-input");
        if(input && !input.disabled){
          try{ input.focus(); }catch(err){ /* ignore */ }
        }
      }, 40);
    }
  }

  function renderImagesBlock(body, req, locked){
    var block = h("section", "block");
    block.id = "rl-img-block";
    var head = h("div", "block-head block-head--actions");
    head.appendChild(h("span", "block-title", optionalLabel(t("Görseller"))));
    var headActions = h("div", "block-head-actions");

    var counter = h("span", "counter", req.images.length + " / " + LIMITS.MAX_IMAGES);
    counter.id = "rl-img-count";
    counter.setAttribute("data-image-count", req.images.length + "/" + LIMITS.MAX_IMAGES);
    headActions.appendChild(counter);

    /* shell v11 §4: screenshot control at the top-right of the Images block */
    var capture = h("button", "btn btn--small btn--icon block-action", "");
    capture.type = "button";
    capture.id = "rl-capture-open";
    capture.setAttribute("data-act", "capture-open");
    capture.setAttribute("aria-label", lx("screenshot"));
    capture.innerHTML = ICONS.camera;
    capture.disabled = locked || req.images.length >= LIMITS.MAX_IMAGES || capturePending;
    headActions.appendChild(capture);

    var status = h("span", "capture-status", capturePending ? lx("tabOpening") : "");
    status.id = "rl-capture-status";
    status.setAttribute("role", "status");
    status.hidden = !capturePending;
    headActions.appendChild(status);
    head.appendChild(headActions);
    block.appendChild(head);

    var grid = h("div", "thumbs");
    grid.id = "rl-img-grid";
    block.appendChild(grid);

    var input = document.createElement("input");
    input.type = "file";
    input.id = "rl-img-input";
    input.accept = "image/*";
    input.multiple = true;
    input.className = "hidden-input";
    input.disabled = locked;
    input.addEventListener("change", function(){
      var files = sliceFiles(input.files);
      input.value = "";
      queueImages(files);
    });
    block.appendChild(input);

    body.appendChild(block);
    attachDropZone(grid, input);
    fillImageGrid(req, locked);
  }

  function setDropOver(grid, on){
    if(!grid) return;
    var drop = grid.querySelector(".img-drop");
    if(drop) drop.classList.toggle("is-over", on);
    else grid.classList.toggle("is-over", on);
  }

  function attachDropZone(grid, input){
    ["dragenter", "dragover"].forEach(function(name){
      grid.addEventListener(name, function(event){
        event.preventDefault();
        setDropOver(grid, true);
      });
    });
    grid.addEventListener("dragleave", function(event){
      if(event.target === grid) setDropOver(grid, false);
    });
    grid.addEventListener("drop", function(event){
      event.preventDefault();
      setDropOver(grid, false);
      var files = event.dataTransfer ? sliceFiles(event.dataTransfer.files) : [];
      if(files.length) queueImages(files);
      else if(input) input.click();
    });
  }

  /* shell v14: the preview lives in this document. The image never crosses
     the iframe boundary; the host only enlarges the flyout rectangle.
     `trigger` is the thumbnail cell so focus can return to it. */
  function previewDimension(axis){
    var screenSize = 0;
    try{
      if(window.screen){
        screenSize = axis === "width"
          ? (window.screen.availWidth || window.screen.width || 0)
          : (window.screen.availHeight || window.screen.height || 0);
      }
    }catch(err){ screenSize = 0; }
    var fallback = axis === "width" ? 1280 : 800;
    var cap = axis === "width" ? 960 : 760;
    var min = axis === "width" ? 360 : 320;
    var wanted = Math.round((screenSize || fallback) * 0.8);
    return Math.max(min, Math.min(cap, wanted));
  }

  function onImagePreviewKeydown(event){
    if(!imagePreview) return;
    var key = event.key;
    if(key === "Escape" || key === "Esc" || event.keyCode === 27){
      event.preventDefault();
      event.stopPropagation();
      closeImagePreview();
      return;
    }
    /* one control is focusable inside the modal: keep Tab on it */
    if(key === "Tab"){
      event.preventDefault();
      try{ imagePreview.close.focus(); }catch(err){ /* ignore */ }
    }
  }

  function closeImagePreview(restoreFocus){
    if(!imagePreview) return;
    var preview = imagePreview;
    imagePreview = null;
    if(preview.el && preview.el.parentNode) preview.el.parentNode.removeChild(preview.el);
    document.documentElement.classList.remove("is-image-preview");
    if(preview.url){
      try{ URL.revokeObjectURL(preview.url); }catch(err){ /* ignore */ }
    }
    if(role === "flyout" && hasHost) toHost("RL_FLYOUT_PREVIEW", { open:false });
    lastSize = -1;
    if(restoreFocus !== false){
      var back = preview.returnFocus;
      if(back && document.body.contains(back) && !back.disabled){
        try{ back.focus(); }catch(err){ /* ignore */ }
      }
    }
    /* the host restores the anchored flyout geometry; report the real card
       height once the preview class is gone */
    requestAnimationFrame(function(){ reportSize(); });
  }

  function openImageModal(img, trigger){
    if(imagePreview) return;
    if(!img || !core || !core.storage || typeof core.storage.getImage !== "function") return;
    core.storage.getImage(img.id).then(function(record){
      if(!record || !record.blob){
        toast(lx("imageModalFailed"), "error");
        return;
      }
      if(imagePreview) return;
      var url = URL.createObjectURL(record.blob);
      var overlay = h("div", "image-preview");
      overlay.id = "rl-image-preview";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", lx("openImage"));

      var stage = h("div", "image-preview__stage");
      var image = document.createElement("img");
      image.className = "image-preview__img";
      image.alt = "";
      image.setAttribute("draggable", "false");
      image.src = url;

      var close = h("button", "image-preview__x", "×");
      close.type = "button";
      close.id = "rl-image-preview-close";
      close.setAttribute("aria-label", t("Kapat"));

      stage.appendChild(image);
      overlay.appendChild(stage);
      overlay.appendChild(close);
      document.body.appendChild(overlay);

      imagePreview = {
        el:overlay,
        close:close,
        url:url,
        returnFocus:trigger || document.activeElement || null
      };
      document.documentElement.classList.add("is-image-preview");

      close.addEventListener("click", function(event){
        if(event) event.stopPropagation();
        closeImagePreview();
      });
      /* backdrop click only; clicks on the image are inert */
      overlay.addEventListener("click", function(event){
        if(event && event.target === overlay) closeImagePreview();
      });
      overlay.addEventListener("keydown", onImagePreviewKeydown);

      lastSize = -1;
      if(role === "flyout" && hasHost){
        toHost("RL_FLYOUT_PREVIEW", {
          open:true,
          width:previewDimension("width"),
          height:previewDimension("height")
        });
      }
      try{ close.focus(); }catch(err){ /* ignore */ }
    }).catch(function(){
      toast(lx("imageModalFailed"), "error");
    });
  }

  function fillImageGrid(req, locked){
    var grid = document.getElementById("rl-img-grid");
    if(!grid) return;
    revokeThumbs();
    grid.textContent = "";

    var counter = document.getElementById("rl-img-count");
    if(counter){
      counter.textContent = req.images.length + " / " + LIMITS.MAX_IMAGES;
      counter.setAttribute("data-image-count", req.images.length + "/" + LIMITS.MAX_IMAGES);
    }

    syncCaptureControls(req);

    if(!req.images.length){
      /* the empty state is the dropzone itself: clickable anywhere */
      var drop = h("button", "img-drop");
      drop.type = "button";
      drop.setAttribute("data-act", "add-image");
      drop.disabled = locked;
      var icon = h("span", "img-drop-ic");
      icon.innerHTML = ICONS.image;
      icon.setAttribute("aria-hidden", "true");
      drop.appendChild(icon);
      drop.appendChild(h("b", null, t("Görsel ekle")));
      drop.appendChild(h("span", "img-drop-hint", lx("imgHint")));
      grid.appendChild(drop);
      return;
    }

    req.images.forEach(function(img, index){
      var cell = h("div", "thumb");
      cell.setAttribute("data-image-id", img.id);
      cell.tabIndex = 0;
      cell.setAttribute("role", "button");
      cell.setAttribute("aria-label", lx("openImage"));
      cell.addEventListener("click", function(event){
        if(event.target && event.target.closest && event.target.closest(".thumb-del")) return;
        openImageModal(img, cell);
      });
      cell.addEventListener("keydown", function(event){
        if(event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openImageModal(img, cell);
      });
      var image = document.createElement("img");
      image.alt = (req.id || "") + " " + t("Görsel") + " " + (index + 1);
      cell.appendChild(image);
      var del = h("button", "thumb-del", "×");
      del.type = "button";
      del.setAttribute("data-act", "remove-image");
      del.setAttribute("data-image-ref", img.id);
      del.setAttribute("aria-label", lx("removeImage"));
      del.disabled = locked;
      cell.appendChild(del);
      grid.appendChild(cell);
      loadThumb(img, image, cell);
    });

    if(req.images.length < LIMITS.MAX_IMAGES){
      var addTile = h("button", "thumb-add");
      addTile.type = "button";
      addTile.setAttribute("data-act", "add-image");
      addTile.disabled = locked;
      addTile.appendChild(h("span", null, "+"));
      grid.appendChild(addTile);
    }
    syncStorageUI();
  }

  function loadThumb(img, image, cell){
    if(!core || !core.storage || !core.storage.getImage) return;
    core.storage.getImage(img.id).then(function(record){
      if(!record || !record.blob){ cell.classList.add("is-missing"); return; }
      /* the grid may have been re-rendered while IDB resolved: never create an
         object URL for a detached cell (that is the leak the revision fixes). */
      if(!document.body.contains(cell)) return;
      if(thumbUrls[img.id]){
        try{ URL.revokeObjectURL(thumbUrls[img.id]); }catch(err){ /* ignore */ }
        delete thumbUrls[img.id];
      }
      var url = URL.createObjectURL(record.blob);
      thumbUrls[img.id] = url;
      image.src = url;
    }).catch(function(){
      cell.classList.add("is-missing");
    });
  }

  function renderAttachmentsBlock(body, req, locked){
    var block = h("section", "block");
    block.id = "rl-files-block";
    var head = h("div", "block-head");
    head.appendChild(h("span", "block-title", optionalLabel(lx("filesTitle"))));
    head.appendChild(h("span", "counter", req.attachments.length + " / " + LIMITS.MAX_ATTACHMENTS));
    block.appendChild(head);

    var list = h("div", "attachlist");
    req.attachments.forEach(function(att){
      var item = h("div", "attachitem");
      var bodySpan = h("span", "attachitem__body");
      bodySpan.appendChild(h("b", null, att.name));
      var meta = core && core.util && core.util.formatBytes ? core.util.formatBytes(att.size) : String(att.size || 0) + " B";
      bodySpan.appendChild(h("small", null, meta + (att.ext ? " · " + String(att.ext).toUpperCase() : "")));
      item.appendChild(bodySpan);
      var del = h("button", "thumb-del", "×");
      del.type = "button";
      del.setAttribute("data-act", "remove-file");
      del.setAttribute("data-att-ref", att.id);
      del.setAttribute("aria-label", lx("removeFile") + ": " + att.name);
      del.disabled = locked;
      item.appendChild(del);
      list.appendChild(item);
    });
    if(req.attachments.length) block.appendChild(list);

    /* shell v12 §2: the file area mirrors the image dropzone */
    var thumbs = h("div", "thumbs file-thumbs");
    var drop = h("div", "img-drop file-drop");
    var icon = h("span", "img-drop-ic");
    icon.innerHTML = ICONS.file;
    icon.setAttribute("aria-hidden", "true");
    drop.appendChild(icon);
    drop.appendChild(h("b", null, lx("addFile")));
    drop.appendChild(h("span", "img-drop-hint", lx("filesNote", { n:LIMITS.MAX_ATTACHMENTS, mb:LIMITS.MAX_FILE_MB })));

    var add = h("button", "btn btn--small", t("Dosya seç"));
    add.type = "button";
    add.setAttribute("data-act", "add-file");
    add.disabled = locked || req.attachments.length >= LIMITS.MAX_ATTACHMENTS;
    drop.appendChild(add);
    thumbs.appendChild(drop);
    block.appendChild(thumbs);

    var input = document.createElement("input");
    input.type = "file";
    input.id = "rl-file-input";
    input.multiple = true;
    input.className = "hidden-input";
    input.disabled = locked;
    input.addEventListener("change", function(){
      var files = sliceFiles(input.files);
      input.value = "";
      addAttachments(files);
    });
    block.appendChild(input);

    drop.addEventListener("click", function(event){
      if(event.target && event.target.closest && event.target.closest('[data-act="add-file"]')) return;
      if(!input.disabled) input.click();
    });
    ["dragenter", "dragover"].forEach(function(name){
      drop.addEventListener(name, function(event){
        event.preventDefault();
        drop.classList.add("is-over");
      });
    });
    drop.addEventListener("dragleave", function(event){
      if(event.target === drop) drop.classList.remove("is-over");
    });
    drop.addEventListener("drop", function(event){
      event.preventDefault();
      drop.classList.remove("is-over");
      if(!input.disabled) addAttachments(event.dataTransfer ? sliceFiles(event.dataTransfer.files) : []);
    });

    body.appendChild(block);
  }

  /* ---------- list ---------- */

  function renderList(body){
    if(!app) app = defaultApp();
    if(!Array.isArray(app.requests)) app.requests = [];
    body.classList.add("list-body");

    if(exportWizard){
      renderExportWizard(body);
      return;
    }

    if(exportCleanup) body.appendChild(buildExportCleanup());

    /* Phase 2b: Projects sit above Exported/Records/Drafts. The tree is
       searchable; a row opens the project settings modal. */
    body.appendChild(buildArchiveProjectsSection());

    body.appendChild(buildArchiveTabs());

    var panels = h("div", "archive-panels");
    panels.id = "rl-archive-panel";

    var prompt = h("div", "archive-dup");
    prompt.id = "rl-dup-prompt";
    prompt.hidden = true;
    panels.appendChild(prompt);

    var listPane = h("div", "archive-pane");
    listPane.id = "rl-list-pane";
    listPane.setAttribute("data-archive-pane", "list");
    listPane.setAttribute("role", "tabpanel");
    listPane.setAttribute("aria-labelledby", "rl-atab-list");
    buildListPane(listPane);
    panels.appendChild(listPane);

    ["records", "drafts", "history"].forEach(function(kind){
      var pane = h("div", "archive-pane");
      pane.id = "rl-" + kind;
      pane.setAttribute("data-archive-pane", kind);
      pane.setAttribute("role", "tabpanel");
      pane.setAttribute("aria-labelledby", "rl-atab-" + kind);
      panels.appendChild(pane);
    });

    body.appendChild(panels);

    archiveDelete = null;
    archiveClear = null;
    archiveRenameId = null;

    renderArchiveViews();
    applyArchiveTab();
    loadArchive();
    updateList();
  }

  function buildListPane(pane){
    pane.appendChild(buildListProgress());

    var tools = h("div", "list-tools");
    tools.appendChild(buildListSearch());
    tools.appendChild(buildListTypeFilters());
    tools.appendChild(buildListControls());
    pane.appendChild(tools);

    var groups = h("div", "reqgroups");
    groups.id = "rl-list-groups";
    pane.appendChild(groups);

    var empty = h("div", "empty");
    empty.id = "rl-empty";
    empty.hidden = true;
    pane.appendChild(empty);
  }

  /* ---------- archive tabs ---------- */

  function buildArchiveTabs(){
    var wrap = h("div", "archive-tabs");
    wrap.setAttribute("role", "tablist");
    wrap.setAttribute("aria-label", t("Arşiv bölümleri"));
    ARCHIVE_TABS.forEach(function(tab){
      var btn = h("button", "atab" + (tab.id === archiveTab ? " is-active" : ""));
      btn.type = "button";
      btn.id = "rl-atab-" + tab.id;
      btn.setAttribute("role", "tab");
      btn.setAttribute("data-archive-tab", tab.id);
      btn.setAttribute("aria-controls", tab.id === "list" ? "rl-list-pane" : "rl-" + tab.id);
      btn.setAttribute("aria-selected", tab.id === archiveTab ? "true" : "false");
      btn.appendChild(h("span", "atab-label", t(tab.label)));
      var n = h("span", "atab-n", "0");
      n.setAttribute("data-archive-count", tab.id);
      btn.appendChild(n);
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function archiveCounts(){
    return {
      list: app ? app.requests.length : 0,
      history: archiveData.history.length,
      records: archiveData.records.length,
      drafts: archiveData.drafts.length
    };
  }

  function updateArchiveTabCounts(){
    var counts = archiveCounts();
    var tabs = document.querySelectorAll("[data-archive-tab]");
    for(var i = 0; i < tabs.length; i++){
      var id = tabs[i].getAttribute("data-archive-tab");
      var active = id === archiveTab;
      tabs[i].classList.toggle("is-active", active);
      tabs[i].setAttribute("aria-selected", active ? "true" : "false");
      var n = tabs[i].querySelector("[data-archive-count]");
      if(n) n.textContent = String(counts[id] || 0);
    }
  }

  function switchArchiveTab(tab){
    if(!tab || tab === archiveTab || !ARCHIVE_TAB_IDS[tab]) return;
    archiveScroll[archiveTab] = els.body ? els.body.scrollTop : 0;
    archiveTab = tab;
    archiveDelete = null;
    archiveClear = null;
    archiveRenameId = null;
    archiveDetail = null;
    applyArchiveTab();
    if(tab === "list"){
      lastScrolledSelection = null;
      updateList();
    }
    if(els.body) els.body.scrollTop = archiveScroll[tab] || 0;
    updateScrollAffordance();
    if(tab !== "list") loadArchive();
  }
