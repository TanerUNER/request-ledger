  /* ============================================================
     EXPORT WIZARD (Phase 5)
     Replaces the İstekler tab content inside the same flyout card.
     ============================================================ */

  function exportTotals(){
    var requests = app ? app.requests : [];
    var total = requests.length;
    var ready = 0;
    var images = 0;
    var files = 0;
    requests.forEach(function(req){
      if(statusOf(req) === "ready") ready++;
      images += (req.images || []).length;
      files += attachmentCount(req);
    });
    return { total:total, ready:ready, notReady:total - ready, images:images, files:files };
  }

  function attachmentCount(req){
    if(!req) return 0;
    return (req.attachments || []).length;
  }

  function countText(n, trOne, trMany, enOne, enMany){
    if(core && core.i18n && typeof core.i18n.countLabel === "function"){
      try{
        return state.lang === "en"
          ? core.i18n.countLabel(n, "en", { one:enOne, many:enMany })
          : core.i18n.countLabel(n, "tr", { one:trOne, many:trMany });
      }catch(err){ /* fall below */ }
    }
    var one = state.lang === "en" ? enOne : trOne;
    var many = state.lang === "en" ? enMany : trMany;
    return n + " " + (n === 1 ? one : many);
  }

  function buildExportStepRow(){
    var dots = h("div", "exp-steps exp-steps--foot");
    dots.id = "rl-exp-steps";
    dots.setAttribute("role", "group");
    dots.setAttribute("aria-label", t("Dışa aktarma"));
    [1, 2].forEach(function(step, index){
      if(index) dots.appendChild(h("span", "exp-steps-line"));
      var dot = h("span", "exp-step" + (exportWizard && exportWizard.step === step ? " is-active" : ""));
      dot.setAttribute("data-export-step", String(step));
      if(exportWizard && exportWizard.step === step) dot.setAttribute("aria-current", "step");
      dot.appendChild(h("b", null, String(step)));
      dot.appendChild(h("span", null, step === 1 ? t("Dışa aktarma") : t("Planlama")));
      dots.appendChild(dot);
    });
    return dots;
  }

  function renderExportWizard(body){
    body.classList.add("exp-body");

    /* shell v11 §12: the back control lives in the footer (step 2 only) */
    body.appendChild(buildExportStep1());
    body.appendChild(buildExportStep2());
    syncPlanningUI();

    if(exportWizard.slide){
      var activePanel = document.getElementById(exportWizard.step === 2 ? "rl-exp-step2" : "rl-exp-step1");
      if(activePanel) activePanel.classList.add(exportWizard.slide === "prev" ? "exp-slide-prev" : "exp-slide-next");
      exportWizard.slide = null;
    }
  }

  function buildExpSummaryCell(parent, label, value, mono){
    var cell = h("div");
    cell.appendChild(h("dt", null, label));
    cell.appendChild(h("dd", mono ? "mono" : null, value));
    parent.appendChild(cell);
  }

  function buildExportStep1(){
    var step = h("div", "exp-panel");
    step.id = "rl-exp-step1";
    if(exportWizard.step !== 1){
      step.hidden = true;
      step.setAttribute("aria-hidden", "true");
    }

    var totals = exportTotals();
    var summary = h("dl", "exp-summary");
    summary.id = "rl-exp-summary";
    buildExpSummaryCell(summary, t("Toplam"), countText(totals.total, "talep", "talep", "request", "requests"));
    buildExpSummaryCell(summary, t("Hazır"), countText(totals.ready, "talep", "talep", "request", "requests"));
    buildExpSummaryCell(summary, t("Hazır değil"), countText(totals.notReady, "talep", "talep", "request", "requests"));
    buildExpSummaryCell(summary, t("Görsel"), countText(totals.images, "adet", "adet", "image", "images"));
    buildExpSummaryCell(summary, t("Dosya"), countText(totals.files, "adet", "adet", "file", "files"));
    buildExpSummaryCell(summary, t("Tarih"), fmtDateTime(new Date()).slice(0, 10), true);
    step.appendChild(summary);

    /* shell v9: the request/missing listing is gone; only the planning steps
       remain. A single warning still explains why export stays disabled. */
    if(totals.notReady){
      var warn = h("div", "exp-warn");
      warn.appendChild(h("span", "exp-warn-text", t(totals.notReady + " talep dışa aktarmaya hazır değil. Eksikleri tamamlayıp tik ile onayla.")));
      var warnList = h("ul", "exp-warn-list");
      (app ? app.requests : []).forEach(function(req){
        if(!req || statusOf(req) === "ready") return;
        var listItem = h("li");
        var row = h("button", "exp-warn-row");
        row.type = "button";
        row.setAttribute("data-act", "open-warning");
        row.setAttribute("data-export-warning", req.id);
        row.setAttribute("aria-label", req.id + " · " + (req.title || lx("untitledRequest")));
        var icon = h("span", "exp-warn-ic");
        icon.innerHTML = ICONS.warn;
        icon.setAttribute("aria-hidden", "true");
        row.appendChild(icon);
        row.appendChild(h("span", "exp-warn-id", req.id));
        row.appendChild(h("span", "exp-warn-title", req.title || lx("untitledRequest")));
        listItem.appendChild(row);
        warnList.appendChild(listItem);
      });
      warn.appendChild(warnList);
      step.appendChild(warn);
    }

    if(exportWizard.format === "embedded" && totals.files > 0) exportWizard.format = "zip";

    var formatField = h("div", "exp-field");
    formatField.appendChild(h("span", "exp-lbl", t("Çıktı biçimi")));

    var radioGroup = h("div", "exp-formats");
    radioGroup.setAttribute("role", "radiogroup");
    radioGroup.setAttribute("aria-label", t("Çıktı biçimi"));
    [
      { id:"zip", label:t("ZIP + .md indir"), hint:lx("zipHint") },
      { id:"embedded", label:t("Tek .md indir"), hint:lx("mdHint") }
    ].forEach(function(option){
      var label = h("label", "exp-opt" + (exportWizard.format === option.id ? " is-on" : ""));
      var input = document.createElement("input");
      input.type = "radio";
      input.name = "rl-export-format";
      input.value = option.id;
      input.id = "rl-exp-format-" + option.id;
      input.setAttribute("data-export-format", option.id);
      input.checked = exportWizard.format === option.id;
      input.disabled = option.id === "embedded" && totals.files > 0;
      if(input.disabled) label.classList.add("is-off");
      label.appendChild(input);
      var text = h("span", "exp-opt-text");
      text.appendChild(h("b", null, option.label));
      text.appendChild(h("small", null, option.hint));
      label.appendChild(text);
      radioGroup.appendChild(label);
    });
    formatField.appendChild(radioGroup);

    if(totals.files > 0){
      formatField.appendChild(h("p", "exp-hint is-warn", t("Bu defterde dosya eki var. Tek .md çıktısı dosya eklerini taşımaz; lütfen ZIP kullan.")));
    }
    step.appendChild(formatField);

    var check = h("label", "exp-check");
    var include = document.createElement("input");
    include.type = "checkbox";
    include.id = "rl-exp-include-summary";
    include.checked = exportWizard.includeSummary !== false;
    check.appendChild(include);
    check.appendChild(h("span", null, t("Başa özet tablosu ekle")));
    step.appendChild(check);

    return step;
  }

  function buildPlanGroup(parent, labelText, attr, entries, isActive){
    var field = h("div", "exp-field");
    field.appendChild(h("span", "exp-lbl", labelText));
    var group = h("div", "exp-opts");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", labelText);
    entries.forEach(function(entry){
      var active = isActive(entry.value);
      var btn = h("button", "exp-opt-btn" + (active ? " is-active" : ""));
      btn.type = "button";
      btn.setAttribute(attr, entry.value);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
      btn.textContent = entry.label;
      group.appendChild(btn);
    });
    field.appendChild(group);
    return field;
  }

  function buildExportStep2(){
    var step = h("div", "exp-panel");
    step.id = "rl-exp-step2";
    if(exportWizard.step !== 2){
      step.hidden = true;
      step.setAttribute("aria-hidden", "true");
    }

    step.appendChild(h("p", "exp-intro", lx("planIntro")));

    var segment = h("div", "exp-seg");
    segment.setAttribute("role", "group");
    segment.setAttribute("aria-label", t("Planlama türü"));
    [
      { id:"full", label:t("Tam koşu") },
      { id:"light", label:t("Hafif koşu") },
      { id:"custom", label:t("Özel") }
    ].forEach(function(entry){
      var active = planMode === entry.id;
      var btn = h("button", "exp-seg-btn" + (active ? " is-active" : ""), entry.label);
      btn.type = "button";
      btn.setAttribute("data-plan-mode", entry.id);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
      segment.appendChild(btn);
    });
    step.appendChild(segment);

    step.appendChild(buildPlanGroup(
      step,
      lx("planQuestion"),
      "data-plan-question",
      [{ value:"yes", label:t("Evet") }, { value:"no", label:t("Hayır") }],
      function(value){ return planQuestion !== null && planQuestion === (value === "yes"); }
    ));

    step.appendChild(buildPlanGroup(
      step,
      t("Runtime Paketi"),
      "data-plan-runtime",
      [{ value:"yes", label:t("Evet") }, { value:"no", label:t("Hayır") }],
      function(value){ return planRuntime !== null && planRuntime === (value === "yes"); }
    ));

    var transfers = buildPlanGroup(
      step,
      t("Paket Transferi"),
      "data-plan-transfer",
      [
        { value:"server", label:t("Sunucu") },
        { value:"gofile", label:"gofile.io" },
        { value:"none", label:t("Transfer yok") }
      ],
      function(value){ return planTransfers.indexOf(value) >= 0; }
    );
    transfers.id = "rl-exp-transfer";
    transfers.classList.add("exp-transfer");
    transfers.appendChild(h("p", "exp-hint", lx("transferHint")));
    step.appendChild(transfers);

    var agentField = h("div", "exp-field");
    agentField.appendChild(h("span", "exp-lbl", t("Ajanlar")));
    var agents = sortedAgents();
    if(!agents.length){
      var empty = h("div", "exp-agent-empty");
      empty.appendChild(h("span", null, t("Henüz ajan tanımlanmadı. Ajan seçimi zorunlu değil; istersen ayarlardan ajan ekle.")));
      var settings = h("button", "btn btn--small", t("Ajan ayarları"));
      settings.type = "button";
      settings.setAttribute("data-act", "exp-settings");
      empty.appendChild(settings);
      agentField.appendChild(empty);
    }else{
      var agentGroup = h("div", "exp-opts");
      agentGroup.setAttribute("role", "group");
      agentGroup.setAttribute("aria-label", t("Ajanlar"));
      agents.forEach(function(agent){
        var active = planAgents.indexOf(agent.id) >= 0;
        var roleLabel = agentRoleLabel(agent.role);
        var btn = h("button", "exp-opt-btn" + (active ? " is-active" : ""));
        btn.type = "button";
        btn.setAttribute("data-plan-agent", agent.id);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
        btn.title = roleLabel + (agent.mdPath ? " · " + agent.mdPath : "");
        var name = String(agent.name || "").trim();
        btn.textContent = name ? name + " · " + roleLabel : roleLabel;
        agentGroup.appendChild(btn);
      });
      agentField.appendChild(agentGroup);
    }
    step.appendChild(agentField);

    var custom = h("div", "exp-custom");
    custom.id = "rl-exp-custom";
    if(planMode !== "custom"){
      custom.hidden = true;
      custom.setAttribute("aria-hidden", "true");
    }
    custom.appendChild(buildPlanGroup(
      custom,
      t("Testler"),
      "data-plan-test",
      PLANNING_TESTS.map(function(test){ return { value:test.id, label:t(test.label) }; }),
      function(value){ return planTest === value; }
    ));
    var noteField = h("div", "exp-field");
    var noteLabel = h("label", "exp-lbl", t("Not"));
    noteLabel.setAttribute("for", "rl-exp-note");
    noteField.appendChild(noteLabel);
    var note = document.createElement("textarea");
    note.id = "rl-exp-note";
    note.className = "textarea";
    note.rows = 3;
    note.maxLength = 2000;
    note.placeholder = lx("notePlaceholder");
    note.value = planNote || "";
    noteField.appendChild(note);
    custom.appendChild(noteField);
    step.appendChild(custom);

    var validation = h("p", "exp-validation");
    validation.id = "rl-exp-validation";
    step.appendChild(validation);

    return step;
  }

  function sortedAgents(){
    var roles = (core && core.constants && core.constants.AGENT_ROLES) || [];
    var order = {};
    roles.forEach(function(role, index){ order[role.id] = index; });
    return (app && Array.isArray(app.agents) ? app.agents.slice() : []).sort(function(a, b){
      var left = order[a.role] == null ? 99 : order[a.role];
      var right = order[b.role] == null ? 99 : order[b.role];
      if(left !== right) return left - right;
      return String(a.name || "").localeCompare(String(b.name || ""), "tr");
    });
  }

  function agentRoleLabel(id){
    var roles = (core && core.constants && core.constants.AGENT_ROLES) || [];
    for(var i = 0; i < roles.length; i++){
      if(roles[i].id === id) return t(roles[i].label);
    }
    return t("General");
  }

  function syncPressed(selector, isActive){
    var nodes = document.querySelectorAll(selector);
    for(var i = 0; i < nodes.length; i++){
      var active = !!isActive(nodes[i]);
      nodes[i].classList.toggle("is-active", active);
      nodes[i].setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  function syncPlanningUI(){
    if(!exportWizard) return;

    syncPressed("[data-plan-mode]", function(btn){ return btn.getAttribute("data-plan-mode") === planMode; });
    syncPressed("[data-plan-question]", function(btn){
      return planQuestion !== null && planQuestion === (btn.getAttribute("data-plan-question") === "yes");
    });
    syncPressed("[data-plan-runtime]", function(btn){
      return planRuntime !== null && planRuntime === (btn.getAttribute("data-plan-runtime") === "yes");
    });
    syncPressed("[data-plan-transfer]", function(btn){
      return planTransfers.indexOf(btn.getAttribute("data-plan-transfer")) >= 0;
    });
    syncPressed("[data-plan-agent]", function(btn){
      return planAgents.indexOf(btn.getAttribute("data-plan-agent")) >= 0;
    });
    syncPressed("[data-plan-test]", function(btn){ return planTest === btn.getAttribute("data-plan-test"); });

    var custom = document.getElementById("rl-exp-custom");
    if(custom){
      custom.hidden = planMode !== "custom";
      custom.setAttribute("aria-hidden", planMode === "custom" ? "false" : "true");
    }

    var transfers = document.getElementById("rl-exp-transfer");
    if(transfers){
      var passive = planRuntime !== true;
      transfers.classList.toggle("is-passive", passive);
      transfers.setAttribute("aria-disabled", passive ? "true" : "false");
      var controls = transfers.querySelectorAll("button");
      for(var i = 0; i < controls.length; i++) controls[i].disabled = passive;
    }

    var missing = planningValidation();
    var validation = document.getElementById("rl-exp-validation");
    if(validation){
      validation.textContent = missing ? lx("validationPrefix", { message:missing }) : t("Tüm planlama seçimleri tamam.");
      validation.classList.toggle("is-ready", !missing);
    }
    var run = document.getElementById("rl-exp-run");
    if(run) run.disabled = exportWizard.busy || Boolean(missing);
  }

  function planningValidation(){
    if(!planMode) return lx("planNeedMode");
    if(planQuestion === null) return lx("planNeedQuestion");
    if(planRuntime === null) return lx("planNeedRuntime");
    if(planRuntime === true && !planTransfers.length) return lx("planNeedTransfer");
    if(planMode === "custom" && !planTest) return lx("planNeedTest");
    return "";
  }

  function planningPayload(){
    return {
      mode: planMode,
      agents: planAgents.slice(),
      test: planTest,
      runtime: planRuntime,
      transfers: planTransfers.slice(),
      question: planQuestion,
      note: String(planNote || "").trim()
    };
  }

  function resetPlanningState(){
    planMode = null;
    planQuestion = null;
    planRuntime = null;
    planTransfers = [];
    planAgents = [];
    planTest = null;
    planNote = "";
  }

  function applyPlanningSnapshot(snapshot){
    if(!snapshot) return;
    planMode = ["full", "light", "custom"].indexOf(snapshot.mode) >= 0 ? snapshot.mode : null;
    planQuestion = typeof snapshot.question === "boolean" ? snapshot.question : null;
    planRuntime = typeof snapshot.runtime === "boolean" ? snapshot.runtime : null;
    planTransfers = Array.isArray(snapshot.transfers) ? snapshot.transfers.slice() : [];
    planTest = PLANNING_TESTS.some(function(test){ return test.id === snapshot.test; }) ? snapshot.test : null;
    var valid = {};
    (app && app.agents ? app.agents : []).forEach(function(agent){ valid[agent.id] = true; });
    planAgents = Array.isArray(snapshot.agents) ? snapshot.agents.filter(function(id){ return valid[id]; }) : [];
    planNote = typeof snapshot.note === "string" ? snapshot.note : "";
  }

  function exportBlocked(){
    return !app || !app.requests.length || exportTotals().notReady > 0;
  }

  function canInstantExport(){
    if(!app) return false;
    if(app.exportBehavior !== "instant") return false;
    if(!app.lastExport || typeof app.lastExport !== "object") return false;
    if(!app.requests.length) return false;
    return exportTotals().notReady === 0;
  }

  function requestExport(){
    if(exportWizard && exportWizard.busy) return;
    if(canInstantExport()) startInstantExport();
    else openExportWizard();
  }

  /* Phase 7 — "Hemen aktar": reuse the saved export options and skip the wizard */
  function startInstantExport(){
    if(!app || !app.lastExport) { openExportWizard(); return; }
    var last = app.lastExport;
    resetPlanningState();
    exportCleanup = null;

    var format = last.mode === "embedded" ? "embedded" : "zip";
    var includeSummary = last.includeSummary !== false;
    exportWizard = { step:2, format:format, includeSummary:includeSummary, busy:false, instant:true };
    if(exportWizard.format === "embedded" && exportTotals().files > 0) exportWizard.format = "zip";
    if(last.planning) applyPlanningSnapshot(last.planning);

    if(planningValidation()){
      /* incomplete saved planning: fall back to the wizard instead of blocking */
      exportWizard = null;
      resetPlanningState();
      openExportWizard();
      return;
    }
    runExport();
  }

  function openExportWizard(){
    if(!app) app = defaultApp();
    if(!app.requests.length){
      toast(lx("noRequests"), "error");
      return;
    }
    exportCleanup = null;
    resetPlanningState();

    var last = app.lastExport && typeof app.lastExport === "object" ? app.lastExport : null;
    var remember = app.exportBehavior === "last" || app.exportBehavior === "instant";
    var format = remember && last && last.mode === "embedded" ? "embedded" : "zip";
    var includeSummary = !(remember && last && last.includeSummary === false);

    exportWizard = { step:1, format:format, includeSummary:includeSummary, busy:false };
    if(format === "embedded" && exportTotals().files > 0) exportWizard.format = "zip";
    if(remember && last && last.planning) applyPlanningSnapshot(last.planning);

    renderFlyout("list");
  }

  function rerenderExportWizard(){
    if(role !== "flyout" || state.section !== "list" || !exportWizard) return;
    renderFlyout("list");
  }

  function closeExportWizard(){
    exportWizard = null;
    exportCleanup = null;
    resetPlanningState();
    if(role === "flyout" && state.section === "list") renderFlyout("list");
  }

  function advanceExportStep(){
    if(!exportWizard || exportWizard.step !== 1) return;
    if(exportBlocked()){
      toast(t("Önce tüm satırları hazır olarak işaretle."), "error");
      return;
    }
    exportWizard.step = 2;
    exportWizard.slide = "next";
    rerenderExportWizard();
    setTimeout(function(){
      var first = document.querySelector("[data-plan-mode]");
      if(first) try{ first.focus(); }catch(err){ /* ignore */ }
    }, 40);
  }

  function buildExportCleanup(){
    var box = h("div", "mini-confirm exp-cleanup");
    box.setAttribute("role", "alertdialog");
    box.appendChild(h("p", "mc-text", t("Dışa aktarma tamamlandı")));
    box.appendChild(h("p", "mc-sub", t("Çıktı indirildi: " + exportCleanup.fileName + ". Mevcut talepleri temizlemek ister misin?")));

    var actions = h("div", "mc-actions");
    var clear = h("button", "btn btn--small btn--danger", t("Talepleri temizle"));
    clear.type = "button";
    clear.setAttribute("data-act", "exp-clear-requests");
    actions.appendChild(clear);
    var keep = h("button", "btn btn--small", t("Talepleri koru"));
    keep.type = "button";
    keep.setAttribute("data-act", "exp-keep-requests");
    actions.appendChild(keep);
    box.appendChild(actions);
    return box;
  }

  async function buildExportMedia(requests){
    var files = [];
    if(!core || !core.storage) return files;
    for(var r = 0; r < requests.length; r++){
      var req = requests[r];
      var images = req.images || [];
      for(var i = 0; i < images.length; i++){
        var rec = null;
        try{ rec = await core.storage.getImage(images[i].id); }catch(err){ rec = null; }
        if(!rec || !rec.blob) continue;
        files.push({ name: core.util.imageFileName(req, i, images[i]), data: new Uint8Array(await rec.blob.arrayBuffer()) });
      }
      var attachments = req.attachments || [];
      for(var j = 0; j < attachments.length; j++){
        var file = null;
        try{ file = await core.storage.getFile(attachments[j].id); }catch(err){ file = null; }
        if(!file || !file.blob) continue;
        files.push({ name: core.util.attachmentFileName(req, j, attachments[j]), data: new Uint8Array(await file.blob.arrayBuffer()) });
      }
    }
    return files;
  }

  function anchorDownload(url, filename){
    try{
      var link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.rel = "noopener";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return true;
    }catch(err){ return false; }
  }
