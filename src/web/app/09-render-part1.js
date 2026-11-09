  /* ============================================================
     Render
     ============================================================ */
  function updateProjectLabels(){
    const name = state.project || "";
    const hasTarget = Boolean(targetFolderHandle && targetFolderHandle.name);
    /* The left project group shows the open project. The export group keeps
       showing the export-directory state. */
    const topName = hasTarget ? targetFolderHandle.name : translateString("Dışa aktarım dizini seçilmedi");
    const pn = $("#projectName");
    const ed = $("#exportDirLabel");
    const hp = $("#heroProject");
    if(pn) pn.textContent = name;
    if(ed) ed.textContent = topName;
    if(hp) hp.textContent = name;
    document.title = projectGateActive()
      ? SEO_TITLE
      : name + " · " + translateString("İstek Defteri");
  }
  function updateToday(){
    const chip = $("#todayChip");
    if(!chip) return;
    const locale = state.language === "en" ? "en-US" : "tr-TR";
    try{
      chip.textContent = new Intl.DateTimeFormat(locale, { day:"2-digit", month:"short", year:"numeric" }).format(new Date());
    }catch(err){
      chip.textContent = new Date().toLocaleDateString(locale);
    }
  }
  function closeAllCSelects(except){
    $$(".cselect.is-open").forEach(function(root){
      if(root !== except){
        root.classList.remove("is-open", "is-up");
        const trigger = $(".cselect__trigger", root);
        if(trigger) trigger.setAttribute("aria-expanded", "false");
      }
    });
    if(!except) openCSelect = null;
  }
  function buildCSelect(options){
    const root = document.createElement("div");
    root.className = "cselect" + (options.small ? " cselect--small" : "");
    root.dataset.cselect = "";
    root.dataset.value = options.value;
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "cselect__trigger";
    trigger.id = options.id || "";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    if(options.title) trigger.title = options.title;
    const label = document.createElement("span");
    label.className = "cselect__label";
    const chevron = document.createElement("span");
    chevron.className = "cselect__chev";
    chevron.setAttribute("aria-hidden", "true");
    chevron.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';
    trigger.appendChild(label);
    trigger.appendChild(chevron);
    const menu = document.createElement("div");
    menu.className = "cselect__menu";
    menu.setAttribute("role", "listbox");
    if(options.id) menu.setAttribute("aria-labelledby", options.id);
    const optionEls = [];
    options.items.forEach(function(item){
      const option = document.createElement("button");
      option.type = "button";
      option.className = "cselect__option";
      option.setAttribute("role", "option");
      option.dataset.value = item.value;
      option.setAttribute("aria-selected", "false");
      const text = document.createElement("span");
      text.textContent = item.label;
      const check = document.createElement("span");
      check.className = "cselect__check";
      check.setAttribute("aria-hidden", "true");
      check.innerHTML = ICON_CHECK;
      option.appendChild(text);
      option.appendChild(check);
      menu.appendChild(option);
      optionEls.push(option);
    });
    root.appendChild(trigger);
    root.appendChild(menu);

    function selectedItem(){
      return options.items.find(function(item){ return item.value === root.dataset.value; }) || options.items[0];
    }
    function sync(){
      const item = selectedItem();
      label.textContent = item ? item.label : "";
      if(options.name){
        trigger.setAttribute("aria-label", options.name + ": " + (item ? item.label : ""));
      }
      optionEls.forEach(function(option){
        option.setAttribute("aria-selected", String(option.dataset.value === root.dataset.value));
      });
    }
    function setValue(value, emit){
      if(!options.items.some(function(item){ return item.value === value; })) return;
      root.dataset.value = value;
      sync();
      if(emit && options.onChange) options.onChange(value);
    }
    function openMenu(){
      closeAllCSelects(root);
      root.classList.remove("is-up");
      root.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      openCSelect = root;
      const rect = trigger.getBoundingClientRect();
      const menuHeight = Math.min(menu.scrollHeight + 10, 250);
      if(rect.bottom + menuHeight + 8 > window.innerHeight && rect.top > menuHeight + 8){
        root.classList.add("is-up");
      }
      const selected = optionEls.find(function(option){ return option.getAttribute("aria-selected") === "true"; }) || optionEls[0];
      if(selected) selected.focus();
    }
    function closeMenu(focusTrigger){
      root.classList.remove("is-open", "is-up");
      trigger.setAttribute("aria-expanded", "false");
      if(openCSelect === root) openCSelect = null;
      if(focusTrigger) trigger.focus();
    }
    function choose(value){
      setValue(value, true);
      closeMenu(true);
    }
    trigger.addEventListener("click", function(event){
      event.stopPropagation();
      if(root.classList.contains("is-open")) closeMenu(false);
      else openMenu();
    });
    trigger.addEventListener("keydown", function(event){
      if(event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " "){
        event.preventDefault();
        if(root.classList.contains("is-open")){
          const selected = optionEls.find(function(option){ return option.getAttribute("aria-selected") === "true"; }) || optionEls[0];
          if(selected) selected.focus();
        }else{
          openMenu();
        }
      }else if(event.key === "Escape"){
        event.preventDefault();
        event.stopPropagation();
        closeMenu(true);
      }
    });
    optionEls.forEach(function(option, index){
      option.addEventListener("click", function(event){
        event.stopPropagation();
        choose(option.dataset.value);
      });
      option.addEventListener("keydown", function(event){
        if(event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End"){
          event.preventDefault();
          let next = index;
          if(event.key === "ArrowDown") next = (index + 1) % optionEls.length;
          else if(event.key === "ArrowUp") next = (index - 1 + optionEls.length) % optionEls.length;
          else if(event.key === "Home") next = 0;
          else if(event.key === "End") next = optionEls.length - 1;
          optionEls[next].focus();
        }else if(event.key === "Enter" || event.key === " "){
          event.preventDefault();
          choose(option.dataset.value);
        }else if(event.key === "Escape"){
          event.preventDefault();
          event.stopPropagation();
          closeMenu(true);
        }else if(event.key === "Tab"){
          closeMenu(false);
        }
      });
    });
    root.addEventListener("focusout", function(){
      setTimeout(function(){
        if(!root.contains(document.activeElement)) closeMenu(false);
      }, 0);
    });
    sync();
    root._cselectSetValue = setValue;
    root._cselectClose = closeMenu;
    return root;
  }
  function createRow(req){
    const article = document.createElement("article");
    article.className = "req";
    article.dataset.id = req.id;
    article.innerHTML =
      '<div class="req__head">' +
        '<button class="tick" type="button" data-action="tick" aria-label="Durumu değiştir"></button>' +
        '<button class="req__toggle" type="button" data-action="toggle" aria-expanded="false" aria-controls="body-' + req.id + '">' +
          '<span class="req__id mono">' + req.id + '</span>' +
          '<span class="req__tags"><span class="tag req__type"></span><span class="tag req__priority" hidden></span></span>' +
          '<span class="req__title"></span>' +
          '<span class="req__meta"></span>' +
          '<svg class="req__chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>' +
        '</button>' +
        '<details class="reqmenu">' +
          '<summary class="iconbtn iconbtn--tiny" aria-label="Satır işlemleri" title="Satır işlemleri">⋯</summary>' +
          '<div class="reqmenu__pop">' +
            '<button type="button" data-action="up"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg> Yukarı taşı</button>' +
            '<button type="button" data-action="down"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg> Aşağı taşı</button>' +
            '<button type="button" data-action="duplicate"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg> Çoğalt</button>' +
            '<div class="sep" aria-hidden="true"></div>' +
            '<button type="button" data-action="delete" class="is-danger"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/></svg> Sil</button>' +
          '</div>' +
        '</details>' +
      '</div>' +
      '<div class="req__body" id="body-' + req.id + '"><div class="req__body-inner"><div class="req__body-pad">' +
        '<div class="req__errors" hidden></div>' +
        '<div class="formgrid">' +
          '<div class="field" data-block="type"><label for="type-' + req.id + '">Tür <span class="reqmark">*</span></label><div data-cselect-mount="type"></div></div>' +
          '<div class="field" data-block="priority"><label for="prio-' + req.id + '">Öncelik</label><div data-cselect-mount="priority"></div></div>' +
          '<div class="field field--full" data-block="title"><label for="title-' + req.id + '">Başlık <span class="reqmark">*</span></label><input class="input" type="text" id="title-' + req.id + '" data-field="title" maxlength="120" placeholder="Kısa ve anlaşılır bir başlık"></div>' +
          '<div class="field" data-block="page"><label for="page-' + req.id + '">Sayfa <span class="muted">(opsiyonel)</span></label><input class="input" type="text" id="page-' + req.id + '" data-field="page" maxlength="80" placeholder="Örn. Siparişler"></div>' +
          '<div class="field" data-block="location"><label for="location-' + req.id + '">Sayfadaki konum <span class="muted">(opsiyonel)</span></label><textarea class="textarea" id="location-' + req.id + '" data-field="location" rows="2" maxlength="200" placeholder="Örn. tablo üstü araç çubuğu, sağ üstteki filtreler…"></textarea></div>' +
          '<div class="field field--full" data-block="pick"><div class="pickbar">' +
            '<button class="btn btn--ghost btn--small" type="button" data-action="pick-element">' +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>' +
              '<span data-pick-label>Öğe seç</span>' +
            '</button>' +
            '<button class="btn btn--ghost btn--small" type="button" data-action="capture-tab">' +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 8h3l1.4-2h7.2L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.4"/></svg>' +
              '<span data-pick-label>Ekran görüntüsü</span>' +
            '</button>' +
            '<button class="btn btn--ghost btn--small" type="button" data-action="pick-capture">' +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M11 2v3M11 17v3M2 11h3M17 11h3"/><path d="M19.5 19.5l2 2"/><rect x="15.5" y="15.5" width="5" height="4.5" rx="1"/></svg>' +
              '<span data-pick-label>Öğe + görüntü</span>' +
            '</button>' +
            '<span class="field__hint">Sayfa ve konum, uzantının öğe seçicisiyle doldurulur.</span>' +
          '</div></div>' +
          '<div class="field field--full" data-block="console"><label for="console-' + req.id + '">Console Hatası veya Sayfa Hatası <span class="muted">(opsiyonel)</span></label><textarea class="textarea" id="console-' + req.id + '" data-field="consoleError" rows="3" maxlength="2000" placeholder="Örn. Uncaught TypeError: … / 404 sayfa hatası…"></textarea></div>' +
          '<div class="field field--full" data-block="description"><label for="desc-' + req.id + '">Açıklama <span class="reqmark">*</span></label><textarea class="textarea" id="desc-' + req.id + '" data-field="description" rows="4" maxlength="5000"></textarea></div>' +
          '<div class="field field--full" data-block="images"><label>Görseller <span class="muted">(opsiyonel)</span></label><div class="dropzone" data-dropzone></div></div>' +
          '<div class="field field--full" data-block="attachments"><label>Örnek dosya eki (.html, .css vb.) <span class="muted">(opsiyonel)</span></label><div class="attachbox" data-attachbox></div></div>' +
          '<div class="field" data-block="sampleWebsite"><label for="sample-' + req.id + '">Örnek web sitesi <span class="muted">(opsiyonel)</span></label><input class="input" type="url" id="sample-' + req.id + '" data-field="sampleWebsite" maxlength="500" placeholder="https://…"></div>' +
          '<div class="field" data-block="link"><label for="link-' + req.id + '">İlgili bağlantı <span class="muted">(opsiyonel)</span></label><input class="input" type="url" id="link-' + req.id + '" data-field="link" maxlength="500" placeholder="https://…"></div>' +
          '<div class="field" data-block="note"><label for="note-' + req.id + '">Ek not <span class="muted">(opsiyonel)</span></label><textarea class="textarea" id="note-' + req.id + '" data-field="note" rows="3" maxlength="2000" placeholder="İstersen ek bir açıklama ekle…"></textarea></div>' +
        '</div>' +
        '<div class="req__foot"><span class="req__saved"></span><button class="link" type="button" data-action="collapse">Satırı kapat</button></div>' +
      '</div></div></div>';
    const typeMount = $('[data-cselect-mount="type"]', article);
    const priorityMount = $('[data-cselect-mount="priority"]', article);
    /* Rows are reused across renders, so the select handlers resolve the live
       request by id instead of capturing the object they were created with. */
    const typeSelect = buildCSelect({
      id: "type-" + req.id,
      name: "Tür",
      value: req.type,
      items: TYPES.map(function(t){ return { value: t.id, label: t.label }; }),
      title: "Tür seç",
      onChange: function(value){
        const live = getReq(article.dataset.id) || req;
        onFieldChange(article, live, "type", value, null);
      }
    });
    const prioritySelect = buildCSelect({
      id: "prio-" + req.id,
      name: "Öncelik",
      value: req.priority,
      items: PRIORITIES.map(function(p){ return { value: p.id, label: p.label }; }),
      title: "Öncelik seç",
      onChange: function(value){
        const live = getReq(article.dataset.id) || req;
        onFieldChange(article, live, "priority", value, null);
      }
    });
    typeMount.appendChild(typeSelect);
    priorityMount.appendChild(prioritySelect);
    const titleInput = $('[data-field="title"]', article);
    const pageInput = $('[data-field="page"]', article);
    const locationInput = $('[data-field="location"]', article);
    const consoleInput = $('[data-field="consoleError"]', article);
    const descriptionInput = $('[data-field="description"]', article);
    const sampleInput = $('[data-field="sampleWebsite"]', article);
    const linkInput = $('[data-field="link"]', article);
    const noteInput = $('[data-field="note"]', article);
    titleInput.value = req.title;
    pageInput.value = req.page;
    locationInput.value = req.location;
    consoleInput.value = req.consoleError;
    descriptionInput.value = req.description;
    sampleInput.value = req.sampleWebsite;
    linkInput.value = req.link;
    noteInput.value = req.note;
    renderImages(article, req);
    renderAttachments(article, req);
    /* One UI pass after the media blocks exist: the lock state must reach the
       buttons those renderers create. */
    updateRowUI(article, req);
    article.__typeValue = req.type;
    article.__priorityValue = req.priority;
    rememberRowUiState(article, req);
    return article;
  }
  function renderImages(row, req){
    const dropzone = $("[data-dropzone]", row);
    if(!dropzone) return;
    dropzone.innerHTML = "";
    dropzone.classList.toggle("is-processing", processingRows.has(req.id));
    row.__imageSig = rowImageSignature(req);
    if(!req.images.length){
      const empty = document.createElement("div");
      empty.className = "dz-empty";
      empty.innerHTML =
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.4"/><path d="M21 15l-5-5L5 20"/></svg>' +
        '<b>Görsel ekle</b>' +
        '<span>Ctrl+V ile yapıştır, sürükle-bırak veya dosya seç</span>' +
        '<button class="btn btn--ghost btn--small" type="button" data-action="add-image">Dosya seç</button>';
      dropzone.appendChild(empty);
      return;
    }
    const thumbs = document.createElement("div");
    thumbs.className = "thumbs";
    req.images.forEach(function(img, index){
      const thumb = document.createElement("div");
      thumb.className = "thumb";
      thumb.dataset.imageId = img.id;
      const open = document.createElement("button");
      open.type = "button";
      open.className = "thumb__open";
      open.dataset.action = "view-image";
      open.dataset.imageId = img.id;
      open.setAttribute("aria-label", "Görseli büyüt");
      const image = document.createElement("img");
      image.alt = req.id + " görsel " + (index + 1);
      open.appendChild(image);
      const del = document.createElement("button");
      del.type = "button";
      del.className = "thumb__del";
      del.dataset.action = "remove-image";
      del.dataset.imageId = img.id;
      del.setAttribute("aria-label", "Görseli kaldır");
      del.textContent = "×";
      thumb.appendChild(open);
      thumb.appendChild(del);
      thumbs.appendChild(thumb);
      loadImageURL(img.id).then(function(url){
        if(!url){
          if(typeof bridgeMediaIsPending === "function" && bridgeMediaIsPending("image", img.id)){
            thumb.classList.add("is-loading");
            open.remove();
            const loading = document.createElement("span");
            loading.textContent = translateString("Görsel yükleniyor…");
            thumb.prepend(loading);
            const wait = typeof bridgeMediaPendingRemaining === "function"
              ? bridgeMediaPendingRemaining("image", img.id)
              : 1000;
            setTimeout(function(){
              if(!document.body.contains(thumb)) return;
              if(typeof bridgeMediaIsPending === "function" && bridgeMediaIsPending("image", img.id)) return;
              renderImages(row, req);
            }, Math.max(600, wait + 100));
            return;
          }
          thumb.classList.add("is-missing");
          open.remove();
          const missing = document.createElement("span");
          missing.textContent = "Görsel bulunamadı";
          thumb.prepend(missing);
          return;
        }
        image.src = url;
      }).catch(function(){
        thumb.classList.add("is-missing");
      });
    });
    if(req.images.length < MAX_IMAGES){
      const add = document.createElement("button");
      add.type = "button";
      add.className = "dz-add";
      add.dataset.action = "add-image";
      add.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>Görsel ekle</span>';
      thumbs.appendChild(add);
    }
    dropzone.appendChild(thumbs);
  }
  function updateRowUI(row, req){
    if(!row || !req) return;
    const status = requestStatus(req);
    const missing = missingFields(req);
    const type = typeInfo(req.type);
    const priority = priorityInfo(req.priority);
    const template = typeTemplate(req.type);
    row.classList.toggle("is-open", !req.collapsed);
    row.classList.toggle("req--missing", status === "missing");
    row.classList.toggle("req--pending", status === "pending");
    row.classList.toggle("req--ready", status === "ready");
    const locked = status === "ready";
    row.classList.toggle("is-locked", locked);
    $$(".req__body-pad input, .req__body-pad textarea, .req__body-pad select", row).forEach(function(control){
      control.disabled = locked;
    });
    $$(".req__body-pad .cselect__trigger", row).forEach(function(control){
      control.disabled = locked;
    });
    $$(".req__body-pad button", row).forEach(function(button){
      if(button.dataset && button.dataset.action === "view-image") return;
      button.disabled = locked;
    });

    const tick = $(".tick", row);
    if(tick){
      tick.className = "tick tick--" + status;
      tick.innerHTML = status === "missing" ? ICON_ALERT : (status === "ready" ? ICON_CHECK : ICON_PENDING);
      const label = status === "missing"
        ? "Eksik alanları göster: " + (missing.length ? missing.map(function(m){ return m.label; }).join(", ") : "bilgileri tamamla")
        : (status === "pending" ? "Satırı hazır olarak işaretle" : "Hazır onayını geri al");
      tick.setAttribute("aria-label", label);
      tick.title = label;
    }

    const typeTag = $(".req__type", row);
    if(typeTag){
      typeTag.className = "tag req__type " + type.cls;
      typeTag.textContent = type.label;
    }
    const priorityTag = $(".req__priority", row);
    if(priorityTag){
      if(req.priority === "normal"){
        priorityTag.hidden = true;
      }else{
        priorityTag.hidden = false;
        priorityTag.className = "tag req__priority " + priority.cls;
        priorityTag.textContent = priority.label;
      }
    }

    const title = $(".req__title", row);
    if(title){
      const hasTitle = Boolean(req.title && req.title.trim());
      title.textContent = hasTitle ? req.title.trim() : translateString("Başlıksız istek");
      title.classList.toggle("is-placeholder", !hasTitle);
    }

    const meta = $(".req__meta", row);
    if(meta){
      meta.textContent = "";
      const placeParts = [];
      if(template.page && req.page && req.page.trim()) placeParts.push(req.page.trim());
      if(template.location && req.location && req.location.trim()) placeParts.push(req.location.trim());
      const place = placeParts.join(" › ");
      const placeText = place || ((template.page || template.location) ? "Sayfa / konum belirtilmedi" : "Genel");
      const appendMeta = function(text){
        if(meta.childNodes.length){
          const sep = document.createElement("span");
          sep.className = "sep";
          sep.textContent = "·";
          meta.appendChild(sep);
        }
        const span = document.createElement("span");
        span.textContent = text;
        meta.appendChild(span);
      };
      appendMeta(placeText);
      if(req.images.length) appendMeta(req.images.length + " görsel");
      if(template.attachments && req.attachments.length) appendMeta(req.attachments.length + " dosya");
      const sep2 = document.createElement("span");
      sep2.className = "sep";
      sep2.textContent = "·";
      const stateSpan = document.createElement("span");
      stateSpan.className = "req__state is-" + status;
      stateSpan.textContent = status === "missing"
        ? (missing.length ? missing.length + " eksik" : "Eksik")
        : (status === "pending" ? "Onay bekliyor" : "Hazır");
      meta.appendChild(sep2);
      meta.appendChild(stateSpan);
    }

    const body = $(".req__body", row);
    if(body){
      body.inert = req.collapsed;
      body.setAttribute("aria-hidden", String(req.collapsed));
    }
    const toggle = $(".req__toggle", row);
    if(toggle){
      toggle.setAttribute("aria-expanded", String(!req.collapsed));
    }

    const blockVisibility = {
      page: template.page,
      location: template.location,
      console: template.console,
      attachments: template.attachments,
      sampleWebsite: template.sampleWebsite,
      link: template.link
    };
    Object.keys(blockVisibility).forEach(function(key){
      const block = row.querySelector('[data-block="' + key + '"]');
      if(block) block.hidden = !blockVisibility[key];
    });
    const pickBlock = row.querySelector('[data-block="pick"]');
    if(pickBlock) pickBlock.hidden = !(template.page || template.location);
    const noteBlock = row.querySelector('[data-block="note"]');
    if(noteBlock) noteBlock.classList.toggle("field--full", !template.link || req.type === "design");

    const descriptionInput = $('[data-field="description"]', row);
    if(descriptionInput) descriptionInput.placeholder = type.ph;

    /* Bridge patches can change fields while the row is open. Refresh the
       form controls in place; never move the caret in the field the user is
       editing right now. */
    ["title", "page", "location", "consoleError", "description", "sampleWebsite", "link", "note"].forEach(function(key){
      const input = $('[data-field="' + key + '"]', row);
      if(!input || input === document.activeElement) return;
      const next = req[key] == null ? "" : String(req[key]);
      if(input.value !== next) input.value = next;
    });

    const errorBox = $(".req__errors", row);
    const showErrors = Boolean(req._showErrors && missing.length);
    if(errorBox){
      errorBox.hidden = !showErrors;
      if(showErrors) errorBox.textContent = "Eksik alanlar: " + missing.map(function(m){ return m.label; }).join(", ") + ".";
    }
    ["title", "description"].forEach(function(key){
      const input = row.querySelector('[data-field="' + key + '"]');
      if(!input) return;
      const invalid = showErrors && missing.some(function(m){ return m.key === key; });
      input.classList.toggle("is-invalid", invalid);
      input.setAttribute("aria-invalid", String(invalid));
    });

    const saved = $(".req__saved", row);
    if(saved) saved.textContent = "Son değişiklik: " + formatDateTime(req.updatedAt);
    if(typeof updatePickerBridgeButtons === "function") updatePickerBridgeButtons(row);
  }
  /* ============================================================
     List rendering (reconciled, not rebuilt)

     The grouped list keeps its DOM across renders. A row element is
     created only for a new request id, removed only when the request
     is gone, and its UI is refreshed only when one of the fields that
     updateRowUI reads actually changed. This keeps focus, scroll
     position, loaded thumbnails and the cselect instances stable and
     turns a re-render of 500 unchanged rows into a cheap pass.
     ============================================================ */
  const rowElById = new Map();

  function rowImageSignature(req){
    return req.images.map(function(img){ return img.id; }).join(",") +
      (processingRows.has(req.id) ? "|processing" : "");
  }
  function rowAttachmentSignature(req){
    return req.attachments.map(function(att){ return att.id; }).join(",");
  }
  /* Field comparison instead of a concatenated signature: request fields can
     be long, and only identity matters here. */
  function rowNeedsUiRefresh(row, req){
    const prev = row.__uiState;
    if(!prev) return true;
    return prev.type !== req.type
      || prev.priority !== req.priority
      || prev.title !== req.title
      || prev.page !== req.page
      || prev.location !== req.location
      || prev.description !== req.description
      || prev.confirmed !== req.confirmed
      || prev.collapsed !== req.collapsed
      || prev.updatedAt !== req.updatedAt
      || prev.errors !== Boolean(req._showErrors)
      || prev.images !== req.images.length
      || prev.attachments !== req.attachments.length;
  }
  function rememberRowUiState(row, req){
    row.__uiState = {
      type: req.type,
      priority: req.priority,
      title: req.title,
      page: req.page,
      location: req.location,
      description: req.description,
      confirmed: req.confirmed,
      collapsed: req.collapsed,
      updatedAt: req.updatedAt,
      errors: Boolean(req._showErrors),
      images: req.images.length,
      attachments: req.attachments.length
    };
  }
  function syncRow(row, req){
    if(!row || !req) return;
    let mediaChanged = false;
    const imageSig = rowImageSignature(req);
    if(row.__imageSig !== imageSig){
      renderImages(row, req);
      mediaChanged = true;
    }
    const attachmentSig = rowAttachmentSignature(req);
    if(row.__attachmentSig !== attachmentSig){
      renderAttachments(row, req);
      mediaChanged = true;
    }
    if(row.__typeValue !== req.type){
      const control = $('[data-cselect-mount="type"] .cselect', row);
      if(control && control._cselectSetValue) control._cselectSetValue(req.type, false);
      row.__typeValue = req.type;
    }
    if(row.__priorityValue !== req.priority){
      const control = $('[data-cselect-mount="priority"] .cselect', row);
      if(control && control._cselectSetValue) control._cselectSetValue(req.priority, false);
      row.__priorityValue = req.priority;
    }
    /* A media re-render recreates buttons, so the lock state must be applied
       again even when the request fields themselves did not change. */
    if(mediaChanged || rowNeedsUiRefresh(row, req)){
      updateRowUI(row, req);
      rememberRowUiState(row, req);
    }
  }
  function createTypeGroup(typeId){
    const type = typeInfo(typeId);
    const group = document.createElement("section");
    group.className = "typegroup";
    group.dataset.typeGroup = typeId;
    const head = document.createElement("div");
    head.className = "typegroup__head";
    const dot = document.createElement("span");
    dot.className = "typegroup__dot " + typeId;
    dot.setAttribute("aria-hidden", "true");
    const title = document.createElement("h3");
    title.textContent = type.label;
    const count = document.createElement("span");
    count.className = "typegroup__count";
    count.textContent = "0";
    head.appendChild(dot);
    head.appendChild(title);
    head.appendChild(count);
    const rows = document.createElement("div");
    rows.className = "reqlist";
    group.appendChild(head);
    group.appendChild(rows);
    return group;
  }
  /* Put the desired nodes in order with the fewest moves. Unchanged order
     produces no DOM mutations at all. */
  function syncChildOrder(parent, nodes){
    let index = 0;
    for(; index < nodes.length; index++){
      const current = parent.children[index];
      if(current !== nodes[index]) parent.insertBefore(nodes[index], current || null);
    }
    while(parent.children.length > nodes.length){
      parent.removeChild(parent.lastElementChild);
    }
  }
  /* Progressive row creation.

     A cold 500-row ledger used to build every row inside one task, so the
     first paint waited for the whole list. The plan is still computed in one
     pass, but only the first slice of tasks (group shells + rows) runs
     synchronously; the rest execute in requestAnimationFrame batches. Tasks
     are always taken in document order and appended below the already
     painted content, so nothing that is already on screen moves while the
     list fills.

     The queue is rebuilt from scratch on every renderList, which cancels the
     previous batch. A filter change does not cancel the queue: rows still
     have to exist for counts and for clearing the filter, so each row is
     filtered against the live filter as it is created. */
  const ROW_SYNC_TASKS = 12;
  const ROW_COLD_TASKS = 100;
  const ROW_COLD_BUDGET_MS = 200;
  const ROW_BATCH_MAX = 400;
  const ROW_BATCH_BUDGET_MS = 500;
  let rowChunkQueue = [];
  let rowChunkCursor = 0;
  let rowChunkHandle = 0;
  let rowChunkUsesRaf = false;
  let rowChunkToken = 0;
  let filterKeepActiveRow = false;

  function nowMs(){
    return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  }
  function cancelRowChunks(){
    rowChunkToken++;
    rowChunkQueue = [];
    rowChunkCursor = 0;
    if(!rowChunkHandle) return;
    if(rowChunkUsesRaf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(rowChunkHandle);
    else clearTimeout(rowChunkHandle);
    rowChunkHandle = 0;
  }
  /* Existing rows of a group in plan order. Used by syncChildOrder, which
     performs zero DOM moves when the order did not change. */
  function placedRowsOf(entry){
    const rows = [];
    for(let i = 0; i < entry.items.length; i++){
      const row = rowElById.get(entry.items[i].id);
      if(row) rows.push(row);
    }
    return rows;
  }
  function dropTypeGroup(group){
    $$(".req", group).forEach(function(row){ rowElById.delete(row.dataset.id); });
    group.remove();
  }
  function countVisibleForType(typeId, group){
    let visible = 0;
    if(group){
      const rows = group.querySelectorAll(".req");
      for(let i = 0; i < rows.length; i++) if(!rows[i].hidden) visible++;
    }
    /* Rows that are planned but not created yet still count: the header must
       not flicker through partial numbers while the list fills. */
    state.requests.forEach(function(req){
      if(req.type !== typeId) return;
      if(rowElById.has(req.id)) return;
      const keep = filterKeepActiveRow && req.id === activeRowId;
      if(keep || rowMatches(req)) visible++;
    });
    return visible;
  }
  function updateGroupVisibility(group){
    if(!group) return;
    const visible = countVisibleForType(group.dataset.typeGroup, group);
    group.hidden = visible === 0;
    const count = $(".typegroup__count", group);
    if(count) count.textContent = visible;
  }
  /* Insert a freshly created group shell before the next planned group that
     already exists, so later additions never push a painted group around. */
  function placeGroupShell(entry){
    const list = $("#reqList");
    const group = entry.group;
    if(!list || !group || group.parentNode === list) return;
    let next = null;
    const plan = entry.plan;
    for(let i = entry.planIndex + 1; i < plan.length; i++){
      const other = plan[i].group;
      if(other && other.parentNode === list){ next = other; break; }
    }
    if(next) list.insertBefore(group, next);
    else list.appendChild(group);
  }
  function createPendingGroup(entry){
    if(entry.group) return;
    const group = createTypeGroup(entry.typeId);
    entry.group = group;
    entry.rowsEl = group.lastElementChild;
    /* A row may already exist when a type change re-creates a group. */
    entry.items.forEach(function(req){
      const row = rowElById.get(req.id);
      if(!row) return;
      if(row.parentNode !== entry.rowsEl) entry.rowsEl.appendChild(row);
      syncRow(row, req);
    });
    placeGroupShell(entry);
    updateGroupVisibility(group);
  }
  function createPendingRow(entry, index){
    const req = entry.items[index];
    if(!req) return;
    let row = rowElById.get(req.id);
    if(!row){
      row = createRow(req);
      rowElById.set(req.id, row);
      entry.rowsEl.appendChild(row);
      /* Only the single open row needs measured growth; doing it per created
         row would reintroduce a forced layout for every row. */
      if(!req.collapsed) growRowTextareas(row);
    }else{
      syncRow(row, req);
      if(row.parentNode !== entry.rowsEl) entry.rowsEl.appendChild(row);
    }
    const keep = filterKeepActiveRow && req.id === activeRowId;
    row.hidden = !(keep || rowMatches(req));
  }
  function runRowTasks(limit, budgetMs, dirty){
    let processed = 0;
    const started = nowMs();
    while(rowChunkCursor < rowChunkQueue.length){
      if(processed >= limit) break;
      if(processed > 0 && nowMs() - started >= budgetMs) break;
      const task = rowChunkQueue[rowChunkCursor++];
      if(task.kind === "group") createPendingGroup(task.entry);
      else createPendingRow(task.entry, task.index);
      if(dirty) dirty.add(task.entry);
      processed++;
    }
    if(dirty){
      dirty.forEach(function(entry){
        if(entry.rowsEl) syncChildOrder(entry.rowsEl, placedRowsOf(entry));
      });
    }
    return processed;
  }
  function scheduleRowChunks(){
    if(rowChunkHandle || rowChunkCursor >= rowChunkQueue.length) return;
    const token = rowChunkToken;
    const run = function(){
      rowChunkHandle = 0;
      if(token !== rowChunkToken) return;
      const dirty = new Set();
      runRowTasks(ROW_BATCH_MAX, ROW_BATCH_BUDGET_MS, dirty);
      if(rowChunkCursor < rowChunkQueue.length){
        scheduleRowChunks();
      }else{
        rowChunkQueue = [];
        rowChunkCursor = 0;
      }
    };
    if(typeof requestAnimationFrame === "function"){
      rowChunkUsesRaf = true;
      rowChunkHandle = requestAnimationFrame(run);
    }else{
      rowChunkUsesRaf = false;
      rowChunkHandle = setTimeout(run, 16);
    }
  }
  /* A row the user is working on (new request, duplicate, type change) must
     exist as soon as renderList returns, even while the cold fill is still
     running. Move its group shell and row to the front of the queue; the rest
     keeps its document order. */
  function orderRowTasks(tasks, priorityId){
    if(!priorityId || !tasks.length) return tasks;
    let priorityEntry = null;
    for(let i = 0; i < tasks.length; i++){
      const task = tasks[i];
      if(task.kind !== "row") continue;
      const req = task.entry.items[task.index];
      if(req && req.id === priorityId){ priorityEntry = task.entry; break; }
    }
    if(!priorityEntry) return tasks;
    const shells = [];
    const rows = [];
    const rest = [];
    tasks.forEach(function(task){
      if(task.kind === "group" && task.entry === priorityEntry){
        shells.push(task);
      }else if(task.kind === "row" && task.entry === priorityEntry && task.entry.items[task.index].id === priorityId){
        rows.push(task);
      }else{
        rest.push(task);
      }
    });
    return shells.concat(rows, rest);
  }
  function renderList(){
    const list = $("#reqList");
    if(!list) return;
    const coldStart = rowElById.size === 0;
    cancelRowChunks();

    const groupsById = new Map();
    $$(".typegroup", list).forEach(function(group){
      groupsById.set(group.dataset.typeGroup, group);
    });

    const plan = [];
    TYPES.forEach(function(type){
      const items = state.requests.filter(function(req){ return req.type === type.id; });
      if(!items.length) return;
      plan.push({
        typeId: type.id,
        items: items,
        planIndex: plan.length,
        plan: null,
        group: groupsById.get(type.id) || null,
        rowsEl: null
      });
    });
    const plannedIds = new Set(plan.map(function(entry){ return entry.typeId; }));
    groupsById.forEach(function(group, typeId){
      if(plannedIds.has(typeId)) return;
      groupsById.delete(typeId);
      dropTypeGroup(group);
    });
    plan.forEach(function(entry){ entry.plan = plan; });

    const tasks = [];
    const existingGroups = [];
    plan.forEach(function(entry){
      if(entry.group){
        const rowsEl = entry.group.lastElementChild;
        entry.rowsEl = rowsEl;
        const wanted = new Set(entry.items.map(function(req){ return req.id; }));
        $$(".req", rowsEl).forEach(function(row){
          if(wanted.has(row.dataset.id)) return;
          rowElById.delete(row.dataset.id);
          row.remove();
        });
        entry.items.forEach(function(req){
          const row = rowElById.get(req.id);
          if(!row) return;
          if(row.parentNode !== rowsEl) rowsEl.appendChild(row);
          syncRow(row, req);
        });
        syncChildOrder(rowsEl, placedRowsOf(entry));
        existingGroups.push(entry.group);
      }else{
        tasks.push({ kind: "group", entry: entry });
      }
      entry.items.forEach(function(req, index){
        if(rowElById.has(req.id)) return;
        tasks.push({ kind: "row", entry: entry, index: index });
      });
    });
    /* Defensive: no stale group may survive (for example after a wholesale
       replacement of state.requests). */
    syncChildOrder(list, existingGroups);

    rowChunkQueue = orderRowTasks(tasks, activeRowId);
    rowChunkCursor = 0;
    /* On a cold list the first slice is time-bounded so the first screen is
       painted with real rows without waiting for all 500. Incremental
       renders only need to absorb the one or two new rows synchronously. */
    if(coldStart) runRowTasks(ROW_COLD_TASKS, ROW_COLD_BUDGET_MS, new Set());
    else runRowTasks(ROW_SYNC_TASKS, Infinity, new Set());
    /* Textareas are only grown for the open row(s). Measured growth is a
       forced layout; doing it for every collapsed row dominated rendering. */
    $$(".req.is-open", list).forEach(growRowTextareas);
    applyFilters();
    refreshGlobal();
    scheduleRowChunks();
  }
  function refreshGlobal(){
    updateProjectLabels();
    updateToday();
    const total = state.requests.length;
    const ready = state.requests.filter(function(req){ return requestStatus(req) === "ready"; }).length;
    const notReady = total - ready;
    const imageCount = state.requests.reduce(function(sum, req){ return sum + req.images.length; }, 0);
    const fileCount = state.requests.reduce(function(sum, req){ return sum + req.attachments.length; }, 0);
    const pct = total ? Math.round((ready / total) * 100) : 0;

    const progressText = $("#progressText");
    const progressPct = $("#progressPct");
    const progressFill = $("#progressFill");
    const progressBar = $("#progressBar");
    const progressHint = $("#progressHint");
    if(progressText) progressText.textContent = ready + " / " + total + " hazır";
    if(progressPct) progressPct.textContent = "%" + pct;
    if(progressFill){
      progressFill.style.width = pct + "%";
      progressFill.style.background = total > 0 && ready === total ? "var(--sage)" : "";
    }
    if(progressBar) progressBar.setAttribute("aria-valuenow", String(pct));
    if(progressHint){
      progressHint.hidden = Boolean(total > 0 && notReady > 0);
      if(!total) progressHint.textContent = "İlk isteği ekleyerek başla.";
      else if(!notReady) progressHint.textContent = "Tüm talepler hazır. Markdown olarak dışa aktarabilirsin.";
      else progressHint.textContent = notReady + " talep dışa aktarmaya hazır değil. Eksikleri tamamlayıp tik ile onayla.";
    }

    const statTotal = $("#statTotal");
    const statReady = $("#statReady");
    const statMissing = $("#statMissing");
    const statImages = $("#statImages");
    if(statTotal) statTotal.textContent = total;
    if(statReady) statReady.textContent = ready;
    if(statMissing) statMissing.textContent = notReady;
    if(statImages) statImages.textContent = imageCount;

    const jump = $("#jumpIncompleteBtn");
    if(jump) jump.disabled = notReady === 0 || total === 0;

    $$(".chip[data-type]").forEach(function(chip){
      const type = chip.dataset.type;
      const count = type === "all" ? total : state.requests.filter(function(req){ return req.type === type; }).length;
      const n = $(".chip__n", chip);
      if(n) n.textContent = count;
    });

    const exportBtn = $("#exportBtn");
    if(exportBtn) exportBtn.disabled = total === 0;

    const notice = $("#readinessNotice");
    const showNotice = total > 0 && notReady > 0;
    if(notice) notice.hidden = !showNotice;
    if(showNotice){
      const noticeText = $("#readinessText");
      if(noticeText) noticeText.textContent = notReady + " talep dışa aktarmaya hazır değil. Eksikleri tamamlayıp tik ile onayla.";
    }

    const storageNote = $("#storageNote");
    if(storageNote){
      const isEn = state.language === "en";
      const imagePart = imageCount + " " + (imageCount === 1 ? "image" : "images");
      const filePart = fileCount + " " + (fileCount === 1 ? "file" : "files");
      storageNote.textContent = idbFailed
        ? (isEn ? "Browser storage is unavailable for images and files" : "Görseller ve dosyalar için tarayıcı depolaması kapalı")
        : ((imageCount || fileCount)
          ? (isEn ? imagePart + ", " + filePart + " in IndexedDB" : "IndexedDB’de " + imageCount + " görsel, " + fileCount + " dosya")
          : (isEn ? "Images and files are stored in IndexedDB" : "Görseller ve dosyalar IndexedDB’de tutulur"));
    }
    updateListCount();
  }
  function updateListCount(keepActive){
    const total = state.requests.length;
    let visible = 0;
    $$("#reqList .req").forEach(function(el){ if(!el.hidden) visible++; });
    /* While the list is filling, planned rows that have no element yet are
       still part of the result: counting only painted rows would make the
       header count crawl up during the fill. */
    state.requests.forEach(function(req){
      if(rowElById.has(req.id)) return;
      const keep = keepActive && req.id === activeRowId;
      if(keep || rowMatches(req)) visible++;
    });
    const filtered = Boolean(filter.q) || filter.type !== "all" || filter.status !== "all";
    const visibleCount = $("#visibleCount");
    if(visibleCount) visibleCount.textContent = filtered ? visible + " / " + total + " istek" : total + " istek";
    const empty = $("#emptyState");
    const noResults = $("#noResults");
    const list = $("#reqList");
    const clearRequests = $("#clearRequestsBtn");
    if(empty) empty.hidden = total !== 0;
    if(noResults) noResults.hidden = !(total > 0 && visible === 0);
    if(list) list.hidden = total === 0;
    if(clearRequests) clearRequests.hidden = total === 0;
  }
  async function loadHistory(){
    if(!idb || !activeProjectId){ historyItems = []; return; }
    try{
      const items = await idbHistoryGetAll(activeProjectId);
      historyItems = items.sort(function(a, b){ return new Date(b.exportedAt) - new Date(a.exportedAt); });
      renderHistoryTree();
    }catch(err){
      console.warn("Arşiv yüklenemedi", err);
    }
  }
  function snapshotDate(item){
    return item.savedAt || item.exportedAt || nowISO();
  }
  function ensureSnapshotNames(){
    [records, drafts].forEach(function(collection){
      collection.forEach(function(item){
        if(!item.ledgerId) item.ledgerId = newLedgerId();
        if(!item.name){
          item.name = (item.project || "Dışa Aktarılanlar") + " · " + formatClock(snapshotDate(item));
        }
      });
    });
  }
  function archiveItems(){
    return historyTab === "history" ? historyItems : historyTab === "records" ? records : drafts;
  }
  function recordStatusClass(item){
    if(!item.complete) return "is-red";
    if(item.exported) return "is-green";
    return "is-yellow";
  }
  function updateHistoryTabs(){
    $$(".history__tab").forEach(function(tab){
      tab.classList.toggle("is-active", tab.dataset.htab === historyTab);
    });
    const hint = $("#historyHint");
    if(hint){
      hint.textContent = historyTab === "history"
        ? "Dışa aktarılan listeler tarihe göre burada tutulur."
        : historyTab === "records"
          ? "Kaydet ikonuyla alınan anlık kayıtlar."
          : "Yükleme öncesi otomatik alınan taslaklar.";
    }
    const clear = $("#historyClearBtn");
    if(clear){
      clear.textContent = historyTab === "history"
        ? "Dışa Aktarılanları temizle"
        : historyTab === "records"
          ? "Kayıtları temizle"
          : "Taslakları temizle";
    }
  }