  function renderHistoryTree(){
    updateHistoryTabs();
    renderArchiveProjects();
    const items = archiveItems();
    const tree = $("#historyTree");
    const count = $("#historyCount");
    const clear = $("#historyClearBtn");
    if(count) count.textContent = items.length;
    if(clear) clear.hidden = items.length === 0;
    if(!tree) return;
    tree.innerHTML = "";
    if(!items.length){
      const empty = document.createElement("div");
      empty.className = "history__empty";
      const message = historyTab === "history"
        ? "Henüz dışa aktarılan liste yok. Dışa aktarım sonrası burada tarihe göre görünecek."
        : historyTab === "records"
          ? "Henüz kayıt yok. Üstteki Kaydet ikonuyla anlık kayıt alabilirsin."
          : "Henüz taslak yok. Bir kayıt yüklenmeden önce mevcut liste otomatik taslak olarak saklanır.";
      empty.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>';
      empty.appendChild(document.createTextNode(message));
      tree.appendChild(empty);
      return;
    }
    const sorted = items.slice().sort(function(a, b){ return new Date(snapshotDate(b)) - new Date(snapshotDate(a)); });
    const groups = new Map();
    sorted.forEach(function(item){
      const key = formatYMD(new Date(snapshotDate(item)));
      if(!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
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
      date.textContent = formatDateLong(new Date(key + "T12:00:00"));
      const number = document.createElement("span");
      number.className = "hgroup__n";
      number.textContent = groupItems.length;
      summary.appendChild(chevron);
      summary.appendChild(date);
      summary.appendChild(number);
      details.appendChild(summary);
      const list = document.createElement("div");
      list.className = "hgroup__items";
      groupItems.forEach(function(item){
        const button = document.createElement("button");
        button.type = "button";
        button.className = "hitem";
        button.dataset.snapshotId = item.id;
        button.dataset.snapshotKind = historyTab;
        const placeLabel = item.rootFolder || item.target || "Tarayıcı";
        button.title = (item.name || item.project || translateString("Kayıt")) + " · " + (item.fileName || translateString(placeLabel));
        const time = document.createElement("span");
        time.className = "hitem__time";
        time.textContent = formatTime(new Date(snapshotDate(item)));
        const body = document.createElement("span");
        body.className = "hitem__body";
        const title = document.createElement("b");
        title.className = "hitem__title";
        title.textContent = item.name || item.project || "Dışa Aktarılanlar";
        const meta = document.createElement("small");
        meta.className = "hitem__meta";
        meta.textContent = historyTab === "history"
          ? item.requestCount + " talep · " + String(item.format || "zip").toUpperCase()
          : historyTab === "records"
            ? item.requestCount + " talep · Kayıt"
            : item.requestCount + " talep · Taslak";
        body.appendChild(title);
        body.appendChild(meta);
        button.appendChild(time);
        button.appendChild(body);
        if(historyTab === "records" || historyTab === "drafts"){
          const status = document.createElement("span");
          status.className = "hitem__status " + (historyTab === "records" ? recordStatusClass(item) : "is-draft");
          status.title = historyTab === "records"
            ? (!item.complete ? "Eksik alan var" : item.exported ? "Dışa aktarıldı" : "Henüz dışa aktarılmadı")
            : "Taslak";
          status.setAttribute("aria-label", status.title);
          button.appendChild(status);
        }
        list.appendChild(button);
      });
      details.appendChild(list);
      tree.appendChild(details);
    });
  }
  async function addHistory(entry){
    if(activeProjectId) entry.projectId = activeProjectId;
    historyItems.push(entry);
    historyItems.sort(function(a, b){ return new Date(b.exportedAt) - new Date(a.exportedAt); });
    renderHistoryTree();
    try{
      await idbHistoryPut(entry);
    }catch(err){
      console.warn("Arşiv kaydedilemedi", err);
    }
  }
  async function deleteRootSnapshot(kind, item){
    if(!rootFolderHandle || !item.fileName) return;
    try{
      const dir = await rootFolderHandle.getDirectoryHandle(kind === "record" ? "kayitlar" : "taslaklar", { create:true });
      await dir.removeEntry(item.fileName);
    }catch(err){
      console.warn("Kök dosya silinemedi", err);
    }
  }
  function deleteArchiveItem(kind, id){
    const isRecord = kind === "records";
    const collection = isRecord ? records : drafts;
    const item = collection.find(function(entry){ return entry.id === id; });
    if(!item) return;
    const label = isRecord ? "Kayıt" : "Taslak";
    openConfirm({
      title: label + " silinsin mi?",
      message: (item.name || formatDateTime(snapshotDate(item))) + " kalıcı olarak silinecek. Bu işlem geri alınamaz.",
      eyebrow: "Sil",
      confirmLabel: "Sil",
      danger: true,
      onConfirm: async function(){
        await deleteRootSnapshot(isRecord ? "record" : "draft", item);
        try{
          await idbCollectionDelete(isRecord ? RECORDS_STORE : DRAFTS_STORE, item.id);
        }catch(err){
          console.warn("Kayıt silinemedi", err);
        }
        if(isRecord) records = records.filter(function(entry){ return entry.id !== item.id; });
        else drafts = drafts.filter(function(entry){ return entry.id !== item.id; });
        renderHistoryTree();
        showToast(label + " silindi.");
      }
    });
  }
  async function clearActiveArchive(){
    const kind = historyTab;
    const items = kind === "history" ? historyItems : kind === "records" ? records : drafts;
    if(!items.length) return;
    const label = kind === "history" ? "Dışa Aktarılanlar" : kind === "records" ? "Kayıtlar" : "Taslaklar";
    openConfirm({
      title: label + " temizlensin mi?",
      message: label + " bölümündeki tüm kayıtlar silinecek. Mevcut talepler ve klasör seçimleri etkilenmez. Devam etmek istiyor musun?",
      confirmLabel: "Temizle",
      danger: true,
      onConfirm: async function(){
        if(kind === "history"){
          historyItems = [];
          try{ await idbHistoryClear(activeProjectId); }catch(err){}
        }else if(kind === "records"){
          for(const item of records){ await deleteRootSnapshot("record", item); }
          records = [];
          try{ await idbCollectionClear(RECORDS_STORE, activeProjectId); }catch(err){}
        }else{
          for(const item of drafts){ await deleteRootSnapshot("draft", item); }
          drafts = [];
          try{ await idbCollectionClear(DRAFTS_STORE, activeProjectId); }catch(err){}
        }
        renderHistoryTree();
        showToast(label + " temizlendi.");
      }
    });
  }
  function sortSnapshots(){
    records.sort(function(a, b){ return new Date(b.savedAt) - new Date(a.savedAt); });
    drafts.sort(function(a, b){ return new Date(b.savedAt) - new Date(a.savedAt); });
    historyItems.sort(function(a, b){ return new Date(b.exportedAt) - new Date(a.exportedAt); });
  }
  async function loadSnapshots(){
    records = [];
    drafts = [];
    if(idb && activeProjectId){
      try{
        records = await idbCollectionGetAll(RECORDS_STORE, activeProjectId);
        drafts = await idbCollectionGetAll(DRAFTS_STORE, activeProjectId);
      }catch(err){
        console.warn("Kayıtlar yüklenemedi", err);
      }
    }
    ensureSnapshotNames();
    sortSnapshots();
    renderHistoryTree();
  }
  /* Called on every project switch: drops the previous project's rows before
     the async read so the archive never shows another project's data. */
  function loadProjectArchives(){
    records = [];
    drafts = [];
    historyItems = [];
    renderHistoryTree();
    if(typeof serverProjectList === "function" && serverFolderMode()){
      serverProjectList().then(function(list){
        let changed = false;
        (list || []).forEach(function(item){
          if(!item || !item.projectId) return;
          const project = findProjectRecord(item.projectId);
          if(project && item.slug && project.folder !== item.slug){
            updateProjectRecord(item.projectId, { folder:item.slug });
            changed = true;
          }
        });
        if(changed) renderArchiveProjects();
      }).catch(function(){ /* folder list is best effort */ });
    }
    Promise.all([loadHistory(), loadSnapshots()]).catch(function(err){
      console.warn("Proje arşivi yüklenemedi", err);
    });
  }
  async function createSnapshot(kind){
    const requests = state.requests.map(function(req){ return serializeRequest(req); });
    const markdown = await buildMarkdown("none", true);
    const savedAt = nowISO();
    const imageCount = requests.reduce(function(sum, req){ return sum + req.images.length; }, 0);
    const fileCount = requests.reduce(function(sum, req){
      return sum + (typeTemplate(req.type).attachments ? req.attachments.length : 0);
    }, 0);
    return {
      id: (kind === "record" ? "rec_" : "drf_") + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      kind: kind,
      projectId: activeProjectId || "",
      savedAt: savedAt,
      name: state.project + " · " + formatClock(savedAt),
      project: state.project,
      ledgerId: state.ledgerId,
      requestCount: requests.length,
      imageCount: imageCount,
      fileCount: fileCount,
      signature: requestSignature(),
      complete: state.requests.every(function(req){ return requestStatus(req) === "ready"; }),
      exported: false,
      requests: JSON.parse(JSON.stringify(requests)),
      markdown: markdown,
      reason: "",
      fileName: "",
      rootFolder: "",
      writeError: ""
    };
  }
  async function saveSnapshot(kind, snapshot, rootReady){
    if(typeof rootReady !== "boolean") rootReady = await ensureRootForWrite();
    if(rootReady){
      await writeRootSnapshot(kind, snapshot);
    }
    if(kind === "record"){
      records.unshift(snapshot);
      try{ await idbCollectionPut(RECORDS_STORE, snapshot); }catch(err){}
    }else{
      drafts.unshift(snapshot);
      try{ await idbCollectionPut(DRAFTS_STORE, snapshot); }catch(err){}
    }
    sortSnapshots();
    renderHistoryTree();
    if(!snapshot.fileName && snapshot.writeError){
      showToast("Kök dizine yazılamadı: " + snapshot.writeError + ". " + (kind === "record" ? "Kayıt" : "Taslak") + " tarayıcıda tutuldu.", "error");
    }
    return snapshot;
  }
  async function createNewRecord(rotateLedger){
    if(rotateLedger) state.ledgerId = newLedgerId();
    const rootReady = await ensureRootForWrite();
    const snapshot = await createSnapshot("record");
    await saveSnapshot("record", snapshot, rootReady);
    saveNow();
    if(typeof serverSaveProject === "function") await serverSaveProject(activeProjectId);
    historyTab = "records";
    renderHistoryTree();
    if(snapshot.fileName) showToast("Kayıt oluşturuldu: " + snapshot.fileName);
  }
  async function overwriteRecord(existing){
    const rootReady = await ensureRootForWrite();
    const fresh = await createSnapshot("record");
    fresh.id = existing.id;
    fresh.fileName = existing.fileName || "";
    fresh.rootFolder = existing.rootFolder || "";
    let written = false;
    if(rootReady){
      written = Boolean(await writeRootSnapshot("record", fresh, fresh.fileName || undefined));
    }
    const index = records.findIndex(function(record){ return record.id === existing.id; });
    if(index >= 0) records[index] = fresh;
    else records.unshift(fresh);
    try{ await idbCollectionPut(RECORDS_STORE, fresh); }catch(err){}
    if(typeof serverSaveProject === "function") await serverSaveProject(activeProjectId);
    sortSnapshots();
    historyTab = "records";
    renderHistoryTree();
    if(written){
      showToast("Kayıt güncellendi: " + fresh.fileName);
    }else if(fresh.writeError){
      showToast("Kayıt tarayıcıda güncellendi; kök dizine yazılamadı: " + fresh.writeError, "error");
    }else{
      showToast("Kayıt tarayıcıda güncellendi.");
    }
  }
  async function saveRecord(){
    if(!state.requests.length){
      showToast("Kaydedilecek istek yok.", "error");
      return;
    }
    if(typeof serverFolderMode === "function" && !serverFolderMode()){
      showToast("Sunucu modu klasör kaydı için gerekli; kayıt tarayıcıda tutuluyor.", "error");
    }
    const signature = requestSignature();
    const existing = records.find(function(record){
      return record.ledgerId && state.ledgerId && record.ledgerId === state.ledgerId;
    }) || records.find(function(record){
      return !record.ledgerId && record.signature === signature;
    });
    if(existing){
      openConfirm({
        title: "Aynı liste zaten kayıtlı",
        message: "Bu istek listesi " + formatDateTime(existing.savedAt) + " tarihinde kaydedilmiş. Mevcut kaydın üzerine yazmak mı, yoksa yeni bir kayıt oluşturmak mı istersin?",
        eyebrow: "Kayıt",
        confirmLabel: "Üzerine Yaz",
        cancelLabel: "Vazgeç",
        altLabel: "Yeni Kayıt Oluştur",
        onConfirm: function(){ return overwriteRecord(existing); },
        onAlt: function(){ return createNewRecord(true); }
      });
      return;
    }
    await createNewRecord();
  }
  async function createDraft(reason){
    if(!state.requests.length) return null;
    const rootReady = await ensureRootForWrite();
    const snapshot = await createSnapshot("draft");
    snapshot.reason = reason || "Yükleme öncesi otomatik taslak";
    await saveSnapshot("draft", snapshot, rootReady);
    return snapshot;
  }
  async function markRecordsExported(signature){
    let changed = false;
    for(const record of records){
      const sameLedger = record.ledgerId && state.ledgerId && record.ledgerId === state.ledgerId;
      const sameLegacy = !record.ledgerId && record.signature === signature;
      if((sameLedger || sameLegacy) && !record.exported){
        record.exported = true;
        changed = true;
        try{ await idbCollectionPut(RECORDS_STORE, record); }catch(err){}
        if(record.fileName) await writeRootSnapshot("record", record, record.fileName);
      }
    }
    if(changed && historyTab === "records") renderHistoryTree();
  }
  function historyCell(parent, label, value, wide){
    const cell = document.createElement("div");
    if(wide) cell.className = "wide";
    const dt = document.createElement("dt");
    dt.textContent = translateString(label);
    const dd = document.createElement("dd");
    dd.textContent = value == null ? "" : String(value);
    cell.appendChild(dt);
    cell.appendChild(dd);
    parent.appendChild(cell);
  }
  function openSnapshotDetail(kind, item){
    currentSnapshot = item;
    currentSnapshotKind = kind;
    const title = $("#historyTitle");
    const eyebrow = $("#historyEyebrow");
    const summary = $("#historySummary");
    const preview = $("#historyPreview");
    const loadButton = $("#snapshotLoadBtn");
    const deleteButton = $("#snapshotDeleteBtn");
    const renameButton = $("#snapshotRenameBtn");
    const date = snapshotDate(item);
    const kindLabel = kind === "history" ? "Dışa Aktarılanlar" : kind === "records" ? "Kayıt" : "Taslak";
    if(title) title.textContent = formatDateTime(date);
    if(eyebrow) eyebrow.textContent = (item.project || translateString("Dışa Aktarılanlar")) + " · " + translateString(kindLabel);
    if(summary){
      summary.innerHTML = "";
      historyCell(summary, "Tarih", formatDateTime(date));
      historyCell(summary, "Talep", item.requestCount + " " + translateString("adet"));
      historyCell(summary, "Görsel", item.imageCount + " " + translateString("adet"));
      historyCell(summary, "Dosya", item.fileCount + " " + translateString("adet"));
      if(kind === "history"){
        historyCell(summary, "Biçim", String(item.format || "zip").toUpperCase());
        historyCell(summary, "Hedef", item.target || translateString("İndirilenler"));
        historyCell(summary, "Dosya adı", item.fileName || "—", true);
      }else if(kind === "records"){
        historyCell(summary, "Kayıt adı", item.name || "—", true);
        historyCell(summary, "Durum", item.complete ? translateString("Tamam") : translateString("Eksik"));
        historyCell(summary, "Dışa aktarıldı", item.exported ? translateString("Evet") : translateString("Hayır"));
        historyCell(summary, "Kök dosya", item.fileName || translateString("Tarayıcıda"), true);
      }else{
        historyCell(summary, "Neden", item.reason || translateString("Manuel taslak"), true);
        historyCell(summary, "Kök dosya", item.fileName || translateString("Tarayıcıda"), true);
      }
    }
    if(preview) preview.textContent = item.markdown || "İçerik bulunamadı.";
    if(loadButton) loadButton.disabled = !Array.isArray(item.requests) || !item.requests.length;
    if(deleteButton) deleteButton.hidden = !(kind === "records" || kind === "drafts");
    if(renameButton) renameButton.hidden = kind !== "records";
    closeHistoryPanel();
    openModal($("#historyModal"));
  }
  function openRenameModal(){
    if(!currentSnapshot || currentSnapshotKind !== "records") return;
    const input = $("#renameInput");
    if(input) input.value = currentSnapshot.name || "";
    openModal($("#renameModal"));
    setTimeout(function(){
      if(input){
        input.focus();
        try{ input.select(); }catch(err){}
      }
    }, 60);
  }
  async function saveSnapshotName(){
    if(!currentSnapshot || currentSnapshotKind !== "records") return;
    const input = $("#renameInput");
    const value = input ? input.value.trim().slice(0, 120) : "";
    if(!value){
      showToast("Kayıt adı boş olamaz.", "error");
      return;
    }
    currentSnapshot.name = value;
    const index = records.findIndex(function(record){ return record.id === currentSnapshot.id; });
    if(index >= 0) records[index].name = value;
    try{ await idbCollectionPut(RECORDS_STORE, currentSnapshot); }catch(err){}
    sortSnapshots();
    renderHistoryTree();
    showToast("Kayıt yeniden adlandırıldı.");
    openSnapshotDetail("records", currentSnapshot);
  }
  async function loadCurrentSnapshot(){
    if(!currentSnapshot) return;
    if(!Array.isArray(currentSnapshot.requests) || !currentSnapshot.requests.length){
      showToast("Bu kayıtta yüklenecek istek yok.", "error");
      return;
    }
    if(state.requests.length && !isCurrentInHistory()){
      await createDraft("Yükleme öncesi otomatik taslak");
    }
    const loaded = currentSnapshot.requests.map(function(raw, index){
      return normalizeRequest(JSON.parse(JSON.stringify(raw)), index);
    });
    loaded.forEach(function(req){ req.collapsed = true; });
    state.project = currentSnapshot.project || state.project;
    state.projectCreated = true;
    state.ledgerId = currentSnapshot.ledgerId || state.ledgerId;
    state.requests = loaded;
    stateDirtySinceExport = !isCurrentInHistory();
    barDismissed = false;
    lastJumpId = null;
    activeRowId = null;
    lastExpandedId = null;
    resetFilters(false);
    saveNow();
    renderList();
    updateProjectLabels();
    refreshGlobal();
    closeModal($("#historyModal"));
    showToast("Yüklendi: " + formatDateTime(snapshotDate(currentSnapshot)));
  }
  function openHistoryPanel(){
    renderArchiveProjects();
    if(window.innerWidth > 1180){
      applyArchiveCollapsed(false, true);
      return;
    }
    const panel = $("#historyPanel");
    const scrim = $("#historyScrim");
    if(panel) panel.classList.add("is-open");
    if(scrim) scrim.classList.add("is-open");
  }
  function closeHistoryPanel(){
    const panel = $("#historyPanel");
    const scrim = $("#historyScrim");
    if(panel) panel.classList.remove("is-open");
    if(scrim) scrim.classList.remove("is-open");
  }
  async function copyTextToClipboard(text){
    let copied = false;
    try{
      await navigator.clipboard.writeText(text);
      copied = true;
    }catch(err){}
    if(!copied){
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      try{ copied = document.execCommand("copy"); }catch(err){ copied = false; }
      area.remove();
    }
    return copied;
  }
  function rowMatches(req){
    if(!req) return false;
    if(filter.type !== "all" && req.type !== filter.type) return false;
    const status = requestStatus(req);
    if(filter.status === "ready" && status !== "ready") return false;
    if(filter.status === "notready" && status === "ready") return false;
    if(filter.q){
      const haystack = trLower([req.title, req.page, req.location, req.description, req.note].join(" "));
      if(haystack.indexOf(filter.q) === -1) return false;
    }
    return true;
  }
  function applyFilters(keepActive){
    const byId = new Map();
    state.requests.forEach(function(req){ byId.set(req.id, req); });
    /* Saved for rows that the progressive renderer creates after this call:
       a new row must be born with the current filter state. */
    filterKeepActiveRow = Boolean(keepActive);
    $$("#reqList .req").forEach(function(row){
      const req = byId.get(row.dataset.id);
      const keepVisible = filterKeepActiveRow && row.dataset.id === activeRowId;
      row.hidden = !req || (!keepVisible && !rowMatches(req));
    });
    $$("#reqList .typegroup").forEach(function(group){
      updateGroupVisibility(group);
    });
    updateListCount(filterKeepActiveRow);
  }
  function resetFilters(apply){
    filter = { q:"", type:"all", status:"all" };
    const search = $("#searchInput");
    const clear = $("#searchClear");
    if(search) search.value = "";
    if(clear) clear.hidden = true;
    if(statusSelectControl) statusSelectControl._cselectSetValue("all", false);
    $$(".chip[data-type]").forEach(function(chip){
      chip.classList.toggle("is-active", chip.dataset.type === "all");
    });
    if(apply !== false) applyFilters();
  }
