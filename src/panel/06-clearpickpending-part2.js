  function clearPickPending(){
    var wasPending = pickPending;
    pickPending = false;
    if(pickTimer){ clearTimeout(pickTimer); pickTimer = null; }
    syncCaptureControls();
    setPickStatus("");
    if(wasPending) setPanelVisibility(false);
  }

  function setPickStatus(text){
    var status = document.getElementById("rl-pick-status");
    if(!status) return;
    status.setAttribute("aria-atomic", "true");
    if(text){
      status.textContent = text;
      status.hidden = false;
    }else{
      status.textContent = "";
      status.hidden = true;
    }
  }

  /* Picks are additive: keep the existing location text and append the new
     selector with " | ". Existing separators are normalised and duplicate
     entries (including the new one) are dropped. */
  function mergeLocation(current, selector){
    var parts = String(current == null ? "" : current).split(/\s+\|\s+/);
    var merged = [];
    for(var i = 0; i < parts.length; i++){
      var value = String(parts[i] || "").trim();
      if(value && merged.indexOf(value) < 0) merged.push(value);
    }
    if(merged.indexOf(selector) < 0) merged.push(selector);
    return merged.join(" | ");
  }

  function handlePickResult(message){
    clearPickPending();
    var selector = message && message.selector;
    if(typeof selector !== "string" || !selector.trim()){
      toast(lx("pickFailed"), "error");
      restoreOriginFocus();
      return;
    }
    selector = selector.trim();

    var req = activeRequest();
    var loc = document.getElementById("rl-loc-input");
    var current = loc
      ? String(loc.value || "")
      : (req && req.location ? String(req.location) : "");
    var combined = mergeLocation(current, selector);

    if(req && !isLocked(req) && core && core.requests && core.requests.update){
      var patch = { location:combined };
      var page = typeof message.page === "string" ? message.page.trim() : "";
      var pageInput = document.getElementById("rl-page-input");
      var pageEmpty = !pageInput || !String(pageInput.value || "").trim();
      if(page && pageEmpty){
        patch.page = page;
        if(pageInput) pageInput.value = page;
      }
      core.requests.update(req, patch);
      markDirty(0);
    }

    if(loc){
      loc.value = combined;
      loc.classList.remove("is-invalid");
      loc.removeAttribute("aria-invalid");
      try{ loc.focus(); }catch(err){ /* ignore */ }
    }

    var dataUrl = typeof message.dataUrl === "string" && /^data:image\//i.test(message.dataUrl)
      ? message.dataUrl
      : "";
    var wantedCapture = !!(message.capture || dataUrl || message.captureError);

    if(!dataUrl){
      if(wantedCapture) toast(lx("pickCapturePartial"), "error");
      else toast(lx("pickDone"));
      return;
    }

    dataUrlToFile(dataUrl, "element").then(function(file){
      if(!file) throw new Error("blob missing");
      queueImages([file]);
      toast(lx("pickCaptureDone"));
    }).catch(function(){
      toast(lx("pickCapturePartial"), "error");
    });
  }

  function handlePickCancelled(message){
    clearPickPending();
    var reason = message && message.reason;
    if(reason === "timeout"){
      toast(lx("pickTimeout"), "error");
      restoreOriginFocus();
      return;
    }
    if(reason === "closed" || reason === "failed" || reason === "unavailable"){
      toast(lx(reason === "closed" ? "pickTabClosed" : "pickUnavailable"), "error");
      restoreOriginFocus();
      return;
    }
    toast(lx("pickCancelled"));
  }

  function renderFlyout(section){
    var spec = SECTION_SPECS[section];
    if(!spec) return;

    closeImagePreview(false);
    closeTabPicker(false);
    closeOpenSelect();
    revokeThumbs();
    tpOpen = false;
    openRowMenuId = null;
    listDeleteId = null;
    lastScrolledSelection = null;
    if(section === "list"){
      archiveTab = "list";
      archiveScroll = { list:0, history:0, records:0, drafts:0 };
      duplicatePrompt = null;
      archiveDelete = null;
      archiveClear = null;
      archiveRenameId = null;
      archiveDetail = null;
    }
    if(section === "backup"){
      backupPending = null;
      backupBusy = false;
    }

    els.title.textContent = section === "project" ? projectSectionTitle() : sectionText(spec, "title");
    var req = activeRequest();
    if(req && (section === "detail" || section === "page" || section === "desc" || section === "export")){
      els.chip.hidden = false;
      els.chip.textContent = req.id;
    }else{
      els.chip.hidden = true;
      els.chip.textContent = "";
    }

    els.body.textContent = "";
    els.foot.textContent = "";

    var scroller = h("div", "sec-scroll");
    scroller.id = "rl-sec-body";
    els.body.appendChild(scroller);

    if(section === "new") renderNew(scroller);
    else if(section === "list") renderList(scroller);
    else if(section === "project") renderProject(scroller);
    else if(section === "detail") renderDetail(scroller);
    else if(section === "page") renderPage(scroller);
    else if(section === "desc") renderDesc(scroller);
    else if(section === "export") renderExport(scroller);
    else if(section === "settings") renderSettings(scroller);
    else if(section === "backup") renderBackup(scroller);
    else if(section === "help") renderHelp(scroller);
    else renderPlaceholder(scroller, section);

    renderFoot(section);
    applyFlyoutMax();
    showDockSaveState();
    syncStorageUI();

    if(section === "settings"){
      applySettingsTab();
      els.body.scrollTop = settingsScroll[settingsTab] || 0;
    }else{
      els.body.scrollTop = 0;
    }
    lastSize = -1;
    requestAnimationFrame(reportSize);
  }

  /* ---------- shared form pieces ---------- */

  function addLabel(parent, text, forId){
    var label = h("label", "lbl", text);
    if(forId) label.setAttribute("for", forId);
    parent.appendChild(label);
    return label;
  }

  function requiredLabel(text){
    return text + " *";
  }

  function optionalLabel(text){
    return text + " " + lx("optionalSuffix");
  }

  function buildTypeChips(current, disabled){
    var wrap = h("div", "tygrid");
    TYPES.forEach(function(type){
      var btn = h("button", "ty" + (type.id === current ? " on" : ""));
      btn.type = "button";
      btn.setAttribute("data-type", type.id);
      btn.setAttribute("aria-pressed", type.id === current ? "true" : "false");
      if(disabled) btn.disabled = true;
      var dot = h("i", "dot dot--" + type.id);
      dot.setAttribute("aria-hidden", "true");
      btn.appendChild(dot);
      btn.appendChild(h("span", null, t(type.label)));
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function buildPriorityChips(current, disabled){
    var wrap = h("div", "prio");
    PRIORITIES.forEach(function(priority){
      var btn = h("button", "pr" + (priority.id === current ? " on" : ""), t(priority.label));
      btn.type = "button";
      btn.setAttribute("data-priority", priority.id);
      btn.setAttribute("aria-pressed", priority.id === current ? "true" : "false");
      if(disabled) btn.disabled = true;
      wrap.appendChild(btn);
    });
    return wrap;
  }

  /* one compact summary replacing the duplicated chip grids in page/desc;
     the full chips live in a popover and keep data-type/data-priority hooks */
  function addTypePrioritySummary(parent, req){
    var wrap = h("div", "tp-wrap");

    var btn = h("button", "tp-summary");
    btn.type = "button";
    btn.setAttribute("data-act", "toggle-tp");
    btn.setAttribute("aria-expanded", tpOpen ? "true" : "false");
    btn.setAttribute("aria-label", lx("typePriority"));
    var dot = h("i", "dot dot--" + req.type);
    dot.setAttribute("aria-hidden", "true");
    btn.appendChild(dot);
    btn.appendChild(h("span", "tp-label", t(typeInfo(req.type).label) + " · " + t(priorityInfo(req.priority).label)));
    btn.appendChild(h("span", "tp-caret", "▾"));
    wrap.appendChild(btn);

    var pop = h("div", "tp-pop");
    pop.id = "rl-tp-pop";
    pop.hidden = !tpOpen;
    pop.appendChild(h("div", "tp-pop-title", t("Tür")));
    pop.appendChild(buildTypeChips(req.type, false));
    pop.appendChild(h("div", "tp-pop-title", t("Öncelik")));
    pop.appendChild(buildPriorityChips(req.priority, false));
    wrap.appendChild(pop);

    parent.appendChild(wrap);
  }

  function updateTypePrioritySummary(req){
    if(!req) return;
    var wrap = document.querySelector(".tp-wrap");
    if(!wrap) return;
    var label = wrap.querySelector(".tp-label");
    if(label) label.textContent = t(typeInfo(req.type).label) + " · " + t(priorityInfo(req.priority).label);
    var dot = wrap.querySelector(".tp-summary .dot");
    if(dot){
      dot.className = "dot dot--" + req.type;
    }
  }

  function addField(parent, opts){
    var el = document.createElement(opts.tag === "textarea" ? "textarea" : "input");
    el.className = opts.tag === "textarea" ? "textarea" : "fld";
    if(opts.id) el.id = opts.id;
    if(opts.field) el.setAttribute("data-field", opts.field);
    if(opts.max) el.maxLength = opts.max;
    if(opts.rows) el.rows = opts.rows;
    if(opts.placeholder) el.placeholder = opts.placeholder;
    if(opts.type) el.type = opts.type;
    el.value = opts.value == null ? "" : String(opts.value);
    if(opts.disabled) el.disabled = true;
    parent.appendChild(el);
    return el;
  }

  function addBlock(parent, title, counterText){
    var block = h("section", "block");
    var head = h("div", "block-head");
    head.appendChild(h("span", "block-title", title));
    if(counterText != null) head.appendChild(h("span", "counter", counterText));
    block.appendChild(head);
    parent.appendChild(block);
    return block;
  }

  function addMiniConfirm(parent){
    if(!cancelConfirm) return;
    var box = h("div", "mini-confirm");
    box.setAttribute("role", "alertdialog");
    box.appendChild(h("p", "mc-text", t("Emin misin?")));
    box.appendChild(h("p", "mc-sub", lx("cancelPrompt")));
    var row = h("div", "mc-actions");
    var draft = h("button", "btn btn--small", lx("saveAsDraft"));
    draft.type = "button";
    draft.setAttribute("data-act", "save-draft");
    var del = h("button", "btn btn--small btn--danger", t("Sil"));
    del.type = "button";
    del.setAttribute("data-act", "delete");
    var back = h("button", "btn btn--small", t("Vazgeç"));
    back.type = "button";
    back.setAttribute("data-act", "cancel-confirm");
    row.appendChild(draft);
    row.appendChild(del);
    row.appendChild(back);
    box.appendChild(row);
    parent.appendChild(box);
  }

  /* ---------- new ---------- */

  function renderNew(body){
    addLabel(body, t("Tür"));
    body.appendChild(buildTypeChips(draftType, false));

    addLabel(body, t("Öncelik"));
    body.appendChild(buildPriorityChips(draftPriority, false));

    addLabel(body, requiredLabel(t("Başlık")), "rl-new-title");
    var input = addField(body, {
      id: "rl-new-title",
      tag: "input",
      max: 120,
      placeholder: t("Kısa ve anlaşılır bir başlık"),
      value: draftTitle
    });
    input.autocomplete = "off";
    input.type = "text";
    input.addEventListener("input", function(){
      draftTitle = input.value;
      syncCreateButton();
    });
    input.addEventListener("keydown", function(event){
      if(event.key === "Enter"){ event.preventDefault(); createRequest(); }
    });
  }

  function syncCreateButton(){
    var btn = document.getElementById("rl-create");
    if(btn) btn.disabled = !draftTitle.trim();
  }

  /* ---------- shell v11: project gate ---------- */

  function renderProject(body){
    renderProjectSection(body);
  }

  function saveProjectName(){
    var input = document.getElementById("rl-project-input");
    var value = String(input ? input.value : "").trim().slice(0, 60);
    if(!value){
      if(input) try{ input.focus(); }catch(err){ /* ignore */ }
      toast(lx("projectRequired"), "error");
      return;
    }
    requestProjectCreate(value);
  }

  /* ---------- page ---------- */

  function renderPage(body, opts){
    opts = opts || {};
    var req = activeRequest();
    if(!req){
      body.appendChild(h("p", "notice", t("Henüz istek yok")));
      return;
    }
    /* combined mode (detail): the shared confirm renders once in renderDetail
       so the stacked page + description have no duplicates.
       shell v8: type/priority is shown only in the combined detail view.
       shell v10: the lock banner is gone; the footer owns unlock. */
    if(!opts.combined){
      addMiniConfirm(body);
    }

    var tpl = templateFor(req.type);
    if(!tpl.page && !tpl.location){
      /* shell v10 §7: no placeholder block for page/location-free types */
      return;
    }

    var locked = isLocked(req);

    /* shell v11 §4: the element picker sits at the top-right of the Page block */
    var pageBlock = h("section", "block");
    var head = h("div", "block-head block-head--actions");
    head.appendChild(h("span", "block-title", optionalLabel(t("Sayfa"))));
    var headActions = h("div", "block-head-actions");
    if(tpl.location && !isWizardPageStep()){
      var pick = h("button", "btn btn--small btn--icon block-action", "");
      pick.type = "button";
      pick.id = "rl-pick-element";
      pick.setAttribute("data-act", "pick-element");
      pick.setAttribute("aria-label", lx("pickElement"));
      pick.title = lx("pickElement");
      pick.innerHTML = ICONS.crosshair;
      pick.disabled = locked || pickPending;
      headActions.appendChild(pick);

      /* pick + element screenshot in one action; the single pick above still
         only fills the location. */
      var pickCapture = h("button", "btn btn--small btn--icon block-action", "");
      pickCapture.type = "button";
      pickCapture.id = "rl-pick-capture";
      pickCapture.setAttribute("data-act", "pick-capture");
      pickCapture.setAttribute("aria-label", lx("pickCapture"));
      pickCapture.innerHTML = ICONS.pickCapture;
      pickCapture.disabled = locked || pickPending;
      headActions.appendChild(pickCapture);

      var pickStatus = h("span", "capture-status", pickPending ? lx("tabOpening") : "");
      pickStatus.id = "rl-pick-status";
      pickStatus.setAttribute("role", "status");
      pickStatus.hidden = !pickPending;
      headActions.appendChild(pickStatus);
    }
    head.appendChild(headActions);
    pageBlock.appendChild(head);

    if(tpl.page){
      var pageRow = h("div", "field-row page-row");
      var pageInput = addField(pageRow, {
        id: "rl-page-input",
        tag: "input",
        field: "page",
        max: 80,
        placeholder: t("Örn. Siparişler"),
        value: req.page,
        disabled: locked
      });
      pageInput.type = "text";
      pageInput.setAttribute("aria-label", optionalLabel(t("Sayfa")));
      var fromTab = h("button", "btn btn--small page-from-tab", lx("fromTab"));
      fromTab.type = "button";
      fromTab.id = "rl-page-from-tab";
      fromTab.setAttribute("data-act", "page-from-tab");
      fromTab.setAttribute("aria-label", lx("pageFromTab"));
      fromTab.disabled = locked;
      fromTab.addEventListener("click", function(){ fillPageFromTab(pageInput); });
      pageRow.appendChild(fromTab);
      pageBlock.appendChild(pageRow);
    }

    if(tpl.location){
      addLabel(pageBlock, optionalLabel(t("Sayfadaki konum")), "rl-loc-input");
      addField(pageBlock, {
        id: "rl-loc-input",
        tag: "textarea",
        field: "location",
        rows: 2,
        max: 2000,
        placeholder: t("Örn. tablo üstü araç çubuğu, sağ üstteki filtreler…"),
        value: req.location,
        disabled: locked
      });
    }

    body.appendChild(pageBlock);
    syncCaptureControls(req);
  }

  /* shell v7: fill the page input with the active tab's pathname */
  function fillPageFromTab(input){
    if(!input) return;
    var fail = function(){ toast(lx("tabPathFailed"), "error"); };
    try{
      if(typeof chrome === "undefined" || !chrome.tabs || typeof chrome.tabs.query !== "function"){
        fail();
        return;
      }
      chrome.tabs.query({ active:true, currentWindow:true }, function(tabs){
        try{
          if(chrome.runtime && chrome.runtime.lastError){ fail(); return; }
        }catch(err){ /* ignore */ }
        var tab = tabs && tabs.length ? tabs[0] : null;
        var path = "";
        try{ path = new URL(tab && tab.url ? tab.url : "").pathname || "/"; }
        catch(err){ path = ""; }
        if(!path){ fail(); return; }
        input.value = path;
        try{
          input.dispatchEvent(new Event("input", { bubbles:true }));
        }catch(err){
          var legacy = document.createEvent("Event");
          legacy.initEvent("input", true, false);
          input.dispatchEvent(legacy);
        }
      });
    }catch(err){ fail(); }
  }

  /* ---------- shell v8: console error fetch ---------- */

  function consoleRecordLine(record){
    if(record == null) return "";
    var text = "";
    if(typeof record === "string"){
      text = record;
    }else if(typeof record === "object"){
      var keys = ["title", "message", "text", "error", "name"];
      for(var i = 0; i < keys.length; i++){
        if(record[keys[i]] != null && String(record[keys[i]]).trim()){
          text = String(record[keys[i]]);
          break;
        }
      }
      if(!text){
        try{ text = JSON.stringify(record); }
        catch(err){ text = String(record); }
      }
    }else{
      text = String(record);
    }
    return String(text).split(/\r?\n/)[0].trim();
  }

  function resetConsoleFetchButton(btn){
    if(btn) btn.disabled = !!isLocked(activeRequest());
  }

  function fetchConsoleErrors(btn){
    var req = activeRequest();
    if(!req || isLocked(req)) return;

    var fail = function(message){
      resetConsoleFetchButton(btn);
      toast(lx(message || "consoleFetchFailed"), "error");
    };

    try{
      if(typeof chrome === "undefined" || !chrome.tabs ||
         typeof chrome.tabs.query !== "function" ||
         !chrome.scripting || typeof chrome.scripting.executeScript !== "function"){
        fail("consoleFetchFailed");
        return;
      }
      if(btn) btn.disabled = true;
      chrome.tabs.query({ active:true, currentWindow:true }, function(tabs){
        try{
          if(chrome.runtime && chrome.runtime.lastError){ fail("consoleFetchFailed"); return; }
        }catch(err){ /* ignore */ }
        var tab = tabs && tabs.length ? tabs[0] : null;
        if(!tab || typeof tab.id !== "number" || !isUsableTab(tab)){
          fail("captureUnavailable");
          return;
        }
        try{
          chrome.scripting.executeScript({
            target:{ tabId:tab.id },
            world:"MAIN",
            func:function(){ return window.__rlConsoleErrors || []; }
          }, function(results){
            try{
              if(chrome.runtime && chrome.runtime.lastError){ fail("consoleFetchFailed"); return; }
            }catch(err){ /* ignore */ }

            var records = [];
            if(results && results.length){
              for(var i = 0; i < results.length; i++){
                var value = results[i] && results[i].result;
                if(Object.prototype.toString.call(value) === "[object Array]") records = records.concat(value);
              }
            }

            var lines = [];
            var seen = {};
            for(var j = 0; j < records.length; j++){
              var line = consoleRecordLine(records[j]);
              if(!line || seen[line]) continue;
              seen[line] = true;
              lines.push(line);
            }
            if(!lines.length){ fail("consoleEmpty"); return; }

            var input = document.getElementById("rl-console-input");
            if(!input || input.disabled){ fail("consoleFetchFailed"); return; }
            input.value = lines.join("\n");
            try{
              input.dispatchEvent(new Event("input", { bubbles:true }));
            }catch(err){
              var legacy = document.createEvent("Event");
              legacy.initEvent("input", true, false);
              input.dispatchEvent(legacy);
            }
            resetConsoleFetchButton(btn);
          });
        }catch(err){ fail("consoleFetchFailed"); }
      });
    }catch(err){ fail("consoleFetchFailed"); }
  }

  /* ---------- detail (combined) ---------- */
