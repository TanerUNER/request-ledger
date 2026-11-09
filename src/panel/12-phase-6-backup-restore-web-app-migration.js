  /* ============================================================
     PHASE 6 — backup / restore / web-app migration
     ============================================================ */

  function backupOption(id, action, titleKey, subKey, iconKey){
    var btn = h("button", "bk-opt");
    btn.type = "button";
    btn.id = id;
    btn.setAttribute("data-act", action);
    var ic = h("span", "bk-opt-ic");
    ic.innerHTML = ICONS[iconKey] || "";
    ic.setAttribute("aria-hidden", "true");
    var text = h("span", "bk-opt-text");
    text.appendChild(h("b", null, lx(titleKey)));
    text.appendChild(h("small", null, lx(subKey)));
    btn.appendChild(ic);
    btn.appendChild(text);
    return btn;
  }

  function backupStatusSummary(){
    var totals = exportTotals();
    return lx("backupStatus", {
      requests: app ? app.requests.length : 0,
      records: archiveData.records.length,
      media: totals.images + totals.files
    });
  }

  function setBackupStatus(text, kind){
    var node = document.getElementById("rl-backup-status");
    if(!node) return;
    node.textContent = text == null ? "" : String(text);
    node.setAttribute("role", kind === "error" ? "alert" : "status");
    node.setAttribute("aria-atomic", "true");
    if(kind) node.setAttribute("data-state", kind);
    else node.removeAttribute("data-state");
  }

  function setBackupBusy(busy){
    backupBusy = !!busy;
    var ids = ["rl-backup-zip", "rl-backup-json", "rl-backup-restore", "rl-backup-clear", "rl-backup-confirm"];
    for(var i = 0; i < ids.length; i++){
      var node = document.getElementById(ids[i]);
      if(node) node.disabled = backupBusy;
    }
  }

  function renderBackupConfirm(){
    var box = document.getElementById("rl-backup-confirm-box");
    var msg = document.getElementById("rl-backup-confirm-text");
    var yes = document.getElementById("rl-backup-confirm");
    if(!box || !msg || !yes) return;
    if(!backupPending){
      box.hidden = true;
      msg.textContent = "";
      yes.textContent = lx("restoreConfirm");
      return;
    }
    box.hidden = false;
    if(backupPending.kind === "clear"){
      msg.textContent = lx("clearProjectMsg");
      yes.textContent = lx("clearConfirm");
    }else if(backupPending.kind === "restore-v4" && backupPending.plan){
      msg.textContent = lx("restoreV4Msg", {
        projects: backupPending.plan.projects.length,
        requests: backupPending.plan.requestCount,
        records: backupPending.plan.recordCount
      });
      yes.textContent = lx("restoreConfirm");
    }else if(backupPending.records == null){
      msg.textContent = lx("restoreMsgRequests", { count: backupPending.count });
      yes.textContent = lx("restoreConfirm");
    }else{
      msg.textContent = lx("restoreV3Msg", { requests: backupPending.count, records: backupPending.records });
      yes.textContent = lx("restoreConfirm");
    }
  }

  function renderBackup(body){
    var block = addBlock(body, t("Yedekleme"));

    var grid = h("div", "bk-grid");
    grid.appendChild(backupOption("rl-backup-zip", "backup-zip", "backupZip", "backupZipSub", "backup"));
    grid.appendChild(backupOption("rl-backup-json", "backup-json", "backupJson", "backupJsonSub", "doc"));
    grid.appendChild(backupOption("rl-backup-restore", "backup-restore", "backupRestore", "backupRestoreSub", "upload"));
    block.appendChild(grid);

    var warn = h("div", "bk-warn");
    warn.appendChild(h("span", "bk-warn-ic", "!"));
    warn.appendChild(h("span", "bk-warn-text", lx("backupWarn")));
    block.appendChild(warn);

    var status = h("p", "bk-status", backupStatusSummary());
    status.id = "rl-backup-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    block.appendChild(status);

    var danger = h("div", "bk-danger");
    var clear = h("button", "btn btn--danger", lx("clearProject"));
    clear.type = "button";
    clear.id = "rl-backup-clear";
    clear.setAttribute("data-act", "backup-clear");
    danger.appendChild(clear);
    block.appendChild(danger);

    var confirmBox = h("div", "bk-confirm");
    confirmBox.id = "rl-backup-confirm-box";
    confirmBox.setAttribute("role", "alertdialog");
    confirmBox.hidden = true;
    var msg = h("p", "mc-text");
    msg.id = "rl-backup-confirm-text";
    confirmBox.appendChild(msg);
    var actions = h("div", "mc-actions");
    var yes = h("button", "btn btn--primary", lx("restoreConfirm"));
    yes.type = "button";
    yes.id = "rl-backup-confirm";
    yes.setAttribute("data-act", "backup-confirm");
    var no = h("button", "btn", t("Vazgeç"));
    no.type = "button";
    no.setAttribute("data-act", "backup-cancel");
    actions.appendChild(yes);
    actions.appendChild(no);
    confirmBox.appendChild(actions);
    block.appendChild(confirmBox);

    var input = document.createElement("input");
    input.type = "file";
    input.id = "rl-backup-input";
    input.accept = ".zip,.json,application/zip,application/json";
    input.hidden = true;
    input.tabIndex = -1;
    block.appendChild(input);

    renderBackupConfirm();
    setBackupBusy(backupBusy);
    if(activeProjectId && !archiveData.loaded) loadArchive().then(function(){ setBackupStatus(backupStatusSummary()); }).catch(function(){});
  }

  async function runBackupDownload(kind){
    if(backupBusy) return;
    setBackupBusy(true);
    setBackupStatus(lx("backupPreparing"), "busy");
    try{
      if(!core || !core.util || !core.zip) throw new Error("backup unavailable");
      var registry = readRegistry();
      if(!registry || !registry.projects.length) throw new Error("no project");
      /* Flush the open project first so its ledger is the one written. */
      flushSave();
      var projectBase = core.util && core.util.safeFileBase ? core.util.safeFileBase(app && app.project ? app.project : "workspace") : "workspace";
      var suffix = state.lang === "en" ? "-backup-" : "-yedek-";
      var fileName = projectBase + suffix + core.util.formatStamp() + (kind === "zip" ? ".zip" : ".json");
      var blob = null;
      if(kind === "zip"){
        var bundle = await buildBackupV4(true);
        var files = [{ name:"yedek.json", data:core.util.utf8Bytes(JSON.stringify(bundle.backup, null, 2)) }];
        for(var i = 0; i < bundle.images.length; i++){
          try{
            var imageRecord = await core.storage.getImage(bundle.images[i].img.id);
            if(imageRecord && imageRecord.blob){
              files.push({ name:bundle.images[i].file, data:new Uint8Array(await imageRecord.blob.arrayBuffer()) });
            }
          }catch(err){ /* missing media is reported by restore, not fatal here */ }
        }
        for(var j = 0; j < bundle.attachments.length; j++){
          try{
            var fileRecord = await core.storage.getFile(bundle.attachments[j].att.id);
            if(fileRecord && fileRecord.blob){
              files.push({ name:bundle.attachments[j].file, data:new Uint8Array(await fileRecord.blob.arrayBuffer()) });
            }
          }catch(err){ /* missing media is reported by restore, not fatal here */ }
        }
        blob = core.zip.create(files);
      }else{
        var jsonBundle = await buildBackupV4(false);
        blob = new Blob([core.util.utf8Bytes(JSON.stringify(jsonBundle.backup, null, 2), false)], { type:"application/json;charset=utf-8" });
      }
      var ok = await downloadBlob(blob, fileName);
      if(!ok) throw new Error("download failed");
      setBackupStatus(lx("downloaded", { name:fileName }), "ok");
      toast(lx("downloaded", { name:fileName }));
    }catch(err){
      console.error(err);
      setBackupStatus(lx("backupFailed"), "error");
      toast(lx("backupFailed"), "error");
    }
    setBackupBusy(false);
  }

  async function prepareRestore(file){
    if(!file || backupBusy) return;
    setBackupBusy(true);
    setBackupStatus(lx("backupReading"), "busy");
    try{
      if(!core || !core.requests || typeof core.requests.normalize !== "function") throw new Error("core.requests unavailable");
      if(!core.util || !core.zip) throw new Error("backup readers unavailable");
      if(!/\.(zip|json)$/i.test(file.name || "")) throw new Error("unsupported file type");

      var parsed = await readBackupDocument(file);
      var data = parsed.data;
      if(Number(data.version) === 4){
        var plan = validateBackupV4(data);
        backupPending = {
          kind: "restore-v4",
          plan: plan,
          entries: parsed.entries || null,
          count: plan.requestCount,
          records: plan.recordCount,
          drafts: plan.draftCount
        };
        renderBackupConfirm();
        setBackupStatus(lx("restoreV4Msg", {
          projects:plan.projects.length,
          requests:plan.requestCount,
          records:plan.recordCount
        }), "pending");
      }else{
        var planV3 = validateBackupV3(data);
        backupPending = {
          kind: "restore-v3",
          plan: planV3,
          entries: parsed.entries || null,
          count: planV3.requestCount,
          records: planV3.recordCount,
          drafts: planV3.draftCount
        };
        renderBackupConfirm();
        setBackupStatus(lx("restoreV3Msg", { requests:planV3.requestCount, records:planV3.recordCount }), "pending");
      }
    }catch(err){
      console.error(err);
      backupPending = null;
      renderBackupConfirm();
      setBackupStatus(lx("invalidBackup"), "error");
      toast(lx("invalidBackup"), "error");
    }
    setBackupBusy(false);
  }

  function applyRestoredLanguage(lang){
    if(lang === state.lang) return;
    state.lang = lang;
    document.documentElement.lang = lang;
    if(core && core.i18n && core.i18n.setLanguage) core.i18n.setLanguage(lang);
    try{
      if(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) chrome.storage.local.set({ "rl-lang":lang });
    }catch(err){ /* ignore */ }
    channelPost({ type:"lang", lang:lang });
  }

  function scheduleClose(delay){
    setTimeout(function(){ requestClose(); }, delay == null ? 700 : delay);
  }

  async function runRestore(pending){
    if(storageBlocked()){
      toast(lx("storageUnavailable"), "error");
      setBackupStatus(lx("storageUnavailable"), "error");
      return;
    }
    setBackupStatus(lx("restoreBusy"), "busy");
    try{
      var result = null;
      if(pending.kind === "restore-v4") result = await applyRestoreV4(pending.plan, pending.entries);
      else result = await applyRestoreV3(pending.plan, pending.entries);

      /* The restored open project's language becomes the panel language,
         matching the previous restore behaviour. */
      if(app && (app.language === "tr" || app.language === "en")) applyRestoredLanguage(app.language);

      if(activeRequestId && !requestById(activeRequestId)){
        activeRequestId = null;
        saveActivePointer(null);
      }
      state.highlight = null;
      openRowMenuId = null;
      listDeleteId = null;
      exportWizard = null;
      exportCleanup = null;
      archiveData.loaded = false;
      archiveData.loading = null;

      broadcastState();
      updateDockBadges();
      await loadArchive().catch(function(){});

      var stats = (result && result.stats) || {};
      var message = "";
      if(pending.kind === "restore-v4"){
        message = lx("restoreV4Done", {
          projects:pending.plan.projects.length,
          requests:pending.plan.requestCount,
          records:pending.plan.recordCount
        });
      }else{
        message = lx("restoreDone", { count:app ? app.requests.length : pending.count });
        if(pending.records != null) message += " " + lx("restoreRecords", { count:pending.records });
      }
      var missing = [];
      if(stats.missingImages) missing.push(lx("missingImages", { count:stats.missingImages }));
      if(stats.missingFiles) missing.push(lx("missingFiles", { count:stats.missingFiles }));
      if(missing.length) message += " " + missing.join(" ");

      setBackupStatus(message, missing.length ? "error" : "ok");
      toast(message, missing.length ? "error" : null);
      scheduleClose(700);
    }catch(err){
      console.error(err);
      backupPending = null;
      renderBackupConfirm();
      setBackupStatus(lx("invalidBackup"), "error");
      toast(lx("invalidBackup"), "error");
    }
  }

  async function runClearAll(){
    if(storageBlocked()){
      toast(lx("storageUnavailable"), "error");
      setBackupStatus(lx("storageUnavailable"), "error");
      return;
    }
    if(!activeProjectId || !app){
      toast(lx("backupNoProject"), "error");
      setBackupStatus(lx("backupNoProject"), "error");
      return;
    }
    setBackupStatus(lx("clearing"), "busy");
    try{
      if(!core || !core.storage) throw new Error("storage unavailable");
      /* Phase 2b: clear only the open project's rows. Other projects keep
         their media, records, drafts and history. */
      if(core.storage.clearAllMedia) await core.storage.clearAllMedia();
      if(core.storage.clearCollection){
        await core.storage.clearCollection("records");
        await core.storage.clearCollection("drafts");
      }
      if(core.storage.clearHistory) await core.storage.clearHistory();

      app.requests = [];
      app.ledgerId = newLedgerId();
      activeRequestId = null;
      saveActivePointer(null);
      state.highlight = null;
      openRowMenuId = null;
      listDeleteId = null;
      exportWizard = null;
      exportCleanup = null;
      archiveData.records = [];
      archiveData.drafts = [];
      archiveData.history = [];
      archiveData.loaded = false;
      archiveData.loading = null;

      flushSave();
      broadcastState();
      updateDockBadges();
      setBackupStatus(lx("projectCleared"), "ok");
      toast(lx("projectCleared"));
      scheduleClose(700);
    }catch(err){
      console.error(err);
      setBackupStatus(lx("backupFailed"), "error");
      toast(lx("backupFailed"), "error");
    }
  }

  async function confirmBackup(){
    if(!backupPending || backupBusy) return;
    var pending = backupPending;
    backupPending = null;
    renderBackupConfirm();
    setBackupBusy(true);
    if(pending.kind === "clear") await runClearAll();
    else await runRestore(pending);
    setBackupBusy(false);
  }

  function cancelBackup(){
    if(backupBusy) return;
    backupPending = null;
    renderBackupConfirm();
    setBackupStatus(backupStatusSummary());
  }

  /* ---------- export / settings / placeholder ---------- */


  function renderExport(body){
    var req = activeRequest();
    if(!req){
      body.appendChild(h("p", "notice", t("Henüz istek yok")));
      return;
    }
    var block = addBlock(body, t("Özet"));
    block.appendChild(h("p", "notice", req.title || t("Başlıksız istek")));
    block.appendChild(h("p", "notice-sub", t(typeInfo(req.type).label) + " · " + t(priorityInfo(req.priority).label)));
    var missing = core && core.requests && core.requests.missing ? core.requests.missing(req) : [];
    if(missing.length){
      block.appendChild(h("p", "field-hint", t("Başlık ve açıklama zorunludur.")));
    }else if(!isLocked(req)){
      var btn = h("button", "btn btn--primary", t("Hazır"));
      btn.type = "button";
      btn.setAttribute("data-act", "ready");
      block.appendChild(btn);
    }else{
      block.appendChild(h("p", "notice-sub", t("Hazır")));
    }
  }
