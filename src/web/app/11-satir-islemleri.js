  /* ============================================================
     Satır işlemleri
     ============================================================ */
  function updateAllRows(){
    const byId = new Map();
    state.requests.forEach(function(req){ byId.set(req.id, req); });
    $$("#reqList .req").forEach(function(element){
      const item = byId.get(element.dataset.id);
      if(item) syncRow(element, item);
    });
  }
  function focusRowStart(id){
    const row = getRowEl(id);
    if(!row) return;
    // Wait for the accordion to finish expanding, otherwise the page cannot
    // scroll far enough on a short document.
    setTimeout(function(){
      const current = getReq(id);
      if(!current || current.collapsed) return;
      const target = getRowEl(id) || row;
      target.scrollIntoView({ behavior:"smooth", block:"start" });
      const toggle = $(".req__toggle", target);
      if(!toggle) return;
      try{ toggle.focus({ preventScroll:true }); }catch(err){ try{ toggle.focus(); }catch(e){} }
    }, 300);
  }
  function toggleRow(req, row, force){
    const shouldOpen = typeof force === "boolean" ? !force : req.collapsed;
    if(shouldOpen){
      state.requests.forEach(function(item){
        if(item.id !== req.id) item.collapsed = true;
      });
      req.collapsed = false;
      activeRowId = req.id;
      lastExpandedId = req.id;
    }else{
      req.collapsed = true;
    }
    updateAllRows();
    if(shouldOpen) growRowTextareas(row);
    scheduleSave();
    if(shouldOpen) focusRowStart(req.id);
  }
  function onTick(req, row){
    if(!isAutoValid(req)){
      req._showErrors = true;
      state.requests.forEach(function(item){
        if(item.id !== req.id) item.collapsed = true;
      });
      req.collapsed = false;
      activeRowId = req.id;
      lastExpandedId = req.id;
      updateAllRows();
      growRowTextareas(row);
      scheduleSave();
      refreshGlobal();
      const missing = missingFields(req);
      if(missing.length){
        focusField(row, missing[0].key);
        showToast("Eksik alanlar: " + missing.map(function(m){ return m.label; }).join(", ") + ".", "error");
      }else{
        showToast("Bu satır henüz hazır değil.", "error");
      }
      return;
    }
    req.confirmed = !req.confirmed;
    req._showErrors = false;
    req.updatedAt = nowISO();
    if(req.confirmed) req.collapsed = true;
    scheduleSave();
    updateAllRows();
    refreshGlobal();
    showToast(req.confirmed ? req.id + " hazır olarak işaretlendi." : req.id + " onayı kaldırıldı.");
  }
  function onFieldChange(row, req, field, value, inputEl){
    if(field === "type"){
      if(!TYPE_MAP[value]) return;
      req.type = value;
      if(req.confirmed) req.confirmed = false;
      req.updatedAt = nowISO();
      state.requests.forEach(function(item){
        if(item.id !== req.id) item.collapsed = true;
      });
      req.collapsed = false;
      activeRowId = req.id;
      lastExpandedId = req.id;
      if(filter.type !== "all"){
        filter.type = "all";
        $$(".chip[data-type]").forEach(function(chip){
          chip.classList.toggle("is-active", chip.dataset.type === "all");
        });
      }
      scheduleSave();
      setTimeout(function(){
        renderList();
        const nextRow = getRowEl(req.id);
        if(nextRow){
          nextRow.scrollIntoView({ behavior:"smooth", block:"center" });
          const trigger = nextRow.querySelector('[data-cselect-mount="type"] .cselect__trigger');
          if(trigger) trigger.focus();
        }
      }, 0);
      return;
    }
    req[field] = value;
    if(req.confirmed) req.confirmed = false;
    req.updatedAt = nowISO();
    if(isAutoValid(req)) req._showErrors = false;
    scheduleSave();
    updateRowUI(row, req);
    refreshGlobal();
    applyFilters(true);
    if(inputEl && inputEl.tagName === "TEXTAREA") autoGrow(inputEl);
  }
  function focusField(row, key){
    if(!row) return;
    const el = row.querySelector('[data-field="' + key + '"]');
    if(!el) return;
    if(el.scrollIntoView) el.scrollIntoView({ behavior:"smooth", block:"center" });
    setTimeout(function(){
      try{ el.focus({ preventScroll:true }); }catch(err){ el.focus(); }
      if(el.tagName === "INPUT" && el.select){ try{ el.select(); }catch(err){} }
    }, 120);
  }
  function renderTypeChoices(){
    const box = $("#typeChoices");
    if(!box) return;
    box.innerHTML = "";
    TYPES.forEach(function(type){
      const button = document.createElement("button");
      button.type = "button";
      button.className = "typechoice";
      const dot = document.createElement("span");
      dot.className = "typechoice__dot typegroup__dot " + type.id;
      dot.setAttribute("aria-hidden", "true");
      const body = document.createElement("span");
      body.className = "typechoice__body";
      const title = document.createElement("b");
      title.textContent = type.label;
      const desc = document.createElement("small");
      desc.textContent = type.desc;
      body.appendChild(title);
      body.appendChild(desc);
      const arrow = document.createElement("span");
      arrow.className = "typechoice__arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "→";
      button.appendChild(dot);
      button.appendChild(body);
      button.appendChild(arrow);
      button.addEventListener("click", function(){
        closeModal($("#typeModal"));
        addRequest(type.id);
      });
      box.appendChild(button);
    });
  }
  function openTypeModal(){
    renderTypeChoices();
    openModal($("#typeModal"));
    setTimeout(function(){
      const first = $("#typeChoices .typechoice");
      if(first) first.focus();
    }, 50);
  }
  function addRequest(typeId){
    if(!typeId){
      openTypeModal();
      return;
    }
    resetFilters(false);
    /* The project ledger id is minted at project creation and persisted in the
       registry. Adding the first request must never rotate it: that produced a
       second ledger for the same project and opened "Two ledgers found". */
    const req = makeNewRequest(typeId);
    state.requests.forEach(function(item){ item.collapsed = true; });
    req.collapsed = false;
    state.requests.push(req);
    activeRowId = req.id;
    lastExpandedId = req.id;
    barDismissed = false;
    scheduleSave();
    renderList();
    const row = getRowEl(req.id);
    if(row){
      row.scrollIntoView({ behavior:"smooth", block:"center" });
      setTimeout(function(){ focusField(row, "title"); }, 180);
    }
    showToast(req.id + " eklendi. Başlık ve açıklamayla devam et.");
  }
  async function duplicateRequest(id){
    const source = getReq(id);
    if(!source) return;
    const copy = {
      id: nextId(),
      type: source.type,
      title: (source.title ? source.title + " (kopya)" : "Kopya istek").slice(0, 120),
      page: source.page,
      location: source.location,
      consoleError: source.consoleError,
      description: source.description,
      priority: source.priority,
      link: source.link,
      sampleWebsite: source.sampleWebsite,
      note: source.note,
      images: [],
      attachments: [],
      confirmed: false,
      collapsed: false,
      createdAt: nowISO(),
      updatedAt: nowISO()
    };
    if(source.images.length && idb){
      for(let i = 0; i < source.images.length; i++){
        const img = source.images[i];
        try{
          const rec = await idbGet(img.id);
          if(rec && rec.blob){
            const imageId = "img_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
            await idbPut({ id: imageId, blob: rec.blob, type: rec.type || img.type });
            copy.images.push({
              id: imageId,
              name: img.name,
              w: img.w,
              h: img.h,
              size: img.size,
              type: img.type,
              ext: img.ext,
              file: ""
            });
          }
        }catch(err){
          console.warn("Görsel kopyalanamadı", err);
        }
      }
    }
    if(source.attachments.length && idb){
      for(let i = 0; i < source.attachments.length; i++){
        const att = source.attachments[i];
        try{
          const rec = await idbFileGet(att.id);
          if(rec && rec.blob){
            const fileId = "file_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
            await idbFilePut({ id: fileId, blob: rec.blob, type: rec.type || att.type });
            copy.attachments.push({
              id: fileId,
              name: att.name,
              size: att.size,
              type: att.type,
              ext: att.ext,
              file: ""
            });
          }
        }catch(err){
          console.warn("Dosya kopyalanamadı", err);
        }
      }
    }
    const index = state.requests.findIndex(function(req){ return req.id === id; });
    state.requests.forEach(function(item){ item.collapsed = true; });
    copy.collapsed = false;
    state.requests.splice(index + 1, 0, copy);
    activeRowId = copy.id;
    lastExpandedId = copy.id;
    barDismissed = false;
    scheduleSave();
    renderList();
    const row = getRowEl(copy.id);
    if(row){
      row.scrollIntoView({ behavior:"smooth", block:"center" });
      setTimeout(function(){ focusField(row, "title"); }, 160);
    }
    showToast(copy.id + " oluşturuldu." + (source.images.length && !copy.images.length ? " Görseller kopyalanamadı." : "") + (source.attachments.length && !copy.attachments.length ? " Dosyalar kopyalanamadı." : ""));
  }
  function moveRequest(id, delta){
    const index = state.requests.findIndex(function(req){ return req.id === id; });
    if(index < 0) return;
    let target = index + delta;
    while(target >= 0 && target < state.requests.length && state.requests[target].type !== state.requests[index].type){
      target += delta;
    }
    if(target < 0 || target >= state.requests.length){
      showToast("Bu türde taşınacak başka satır yok.", "error");
      return;
    }
    const temp = state.requests[index];
    state.requests[index] = state.requests[target];
    state.requests[target] = temp;
    scheduleSave();
    renderList();
    const row = getRowEl(id);
    if(row){
      const toggle = $(".req__toggle", row);
      if(toggle) toggle.focus();
      row.scrollIntoView({ behavior:"smooth", block:"nearest" });
    }
  }
  function mediaReferencedByOther(mediaId, exceptRequestId){
    return state.requests.some(function(item){
      if(!item || item.id === exceptRequestId) return false;
      return (item.images || []).some(function(img){ return img.id === mediaId; }) ||
        (item.attachments || []).some(function(att){ return att.id === mediaId; });
    });
  }

  function deleteRequest(id){
    const req = getReq(id);
    if(!req) return;
    openConfirm({
      title: "Satırı sil",
      message: req.id + " numaralı talebi, ekli görsellerini ve dosyalarını silmek istediğine emin misin? Bu işlem geri alınamaz.",
      confirmLabel: "Sil",
      danger: true,
      onConfirm: async function(){
        const index = state.requests.findIndex(function(item){ return item.id === id; });
        for(let i = 0; i < req.images.length; i++){
          revokeImageURL(req.images[i].id);
          if(!snapshotReferencesMedia(req.images[i].id) && !mediaReferencedByOther(req.images[i].id, id)){
            try{ await idbDelete(req.images[i].id); }catch(err){}
          }
        }
        for(let i = 0; i < req.attachments.length; i++){
          if(!snapshotReferencesMedia(req.attachments[i].id) && !mediaReferencedByOther(req.attachments[i].id, id)){
            try{ await idbFileDelete(req.attachments[i].id); }catch(err){}
          }
        }
        state.requests.splice(index, 1);
        if(activeRowId === id) activeRowId = null;
        if(lastExpandedId === id) lastExpandedId = null;
        if(lastJumpId === id) lastJumpId = null;
        saveNow();
        renderList();
        const next = state.requests[Math.min(index, state.requests.length - 1)];
        if(next){
          const row = getRowEl(next.id);
          if(row){ const toggle = $(".req__toggle", row); if(toggle) toggle.focus(); }
        }else{
          const add = $("#addBtn");
          if(add) add.focus();
        }
        showToast(req.id + " silindi.");
      }
    });
  }
  function setAllCollapsed(collapsed){
    if(!state.requests.length){
      showToast("Açılacak bir satır yok.", "error");
      return;
    }
    const y = window.scrollY;
    state.requests.forEach(function(req){ req.collapsed = collapsed; });
    scheduleSave();
    renderList();
    window.scrollTo(0, y);
  }
  function removeImage(req, imageId){
    const index = req.images.findIndex(function(img){ return img.id === imageId; });
    if(index < 0) return;
    req.images.splice(index, 1);
    revokeImageURL(imageId);
    if(!snapshotReferencesMedia(imageId)) idbDelete(imageId).catch(function(){});
    if(req.confirmed) req.confirmed = false;
    req.updatedAt = nowISO();
    scheduleSave();
    const row = getRowEl(req.id);
    if(row){
      renderImages(row, req);
      updateRowUI(row, req);
    }
    refreshGlobal();
    showToast("Görsel kaldırıldı.");
  }
  async function openLightbox(req, imageId){
    const img = req.images.find(function(item){ return item.id === imageId; });
    if(!img) return;
    const url = await loadImageURL(imageId);
    if(!url){
      if(typeof bridgeMediaIsPending === "function" && bridgeMediaIsPending("image", imageId)){
        showToast(translateString("Görsel yükleniyor…"));
        return;
      }
      showToast("Görsel bulunamadı. Yedekten geri yüklemeyi deneyebilirsin.", "error");
      return;
    }
    const image = $("#lightboxImg");
    const caption = $("#lightboxCaption");
    if(image){ image.src = url; image.alt = req.id + " görsel"; }
    if(caption) caption.textContent = req.id + " · " + img.name;
    openModal($("#lightboxModal"));
  }
