  /* ============================================================
     FLYOUT
     ============================================================ */

  /* focus/scroll a settings folder row without opening a soft keyboard:
     both inputs are read-only, so focusing never triggers the keyboard. */
  function focusSectionTarget(selector){
    var node = null;
    try{ node = document.querySelector(selector); }catch(err){ node = null; }
    if(!node) return false;

    var active = document.activeElement;
    if(active && active !== node && active !== document.body && active !== els.body &&
       state.section === "settings" && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(active.tagName)){
      return true; /* the user already moved focus; never steal it */
    }

    try{ window.focus(); }catch(err){ /* ignore */ }
    try{ node.focus({ preventScroll:true }); }
    catch(err){ try{ node.focus(); }catch(e){ /* ignore */ } }

    var row = node;
    try{ row = node.closest(".set-row") || node; }catch(err){ row = node; }
    try{ row.scrollIntoView({ block:"center", behavior:"auto" }); }
    catch(err){ try{ row.scrollIntoView(); }catch(e){ /* ignore */ } }
    return true;
  }

  function handleFocusMessage(message){
    if(role !== "flyout") return;
    var selector = message && message.selector;
    if(typeof selector !== "string" || !selector) return;
    var tab = typeof message.tab === "string" ? message.tab : null;
    if(state.section === "settings" && tab && SETTINGS_TAB_IDS[tab] && settingsTab !== tab){
      switchSettingsTab(tab);
    }
    if(!focusSectionTarget(selector)) pendingFocus = { selector:selector, tab:tab };
  }

  function showSection(section){
    if(!isKnownSection(section)) return;
    closeProjectSettingsModal();

    /* a fresh dock open always starts the section from its default view */
    exportWizard = null;
    exportCleanup = null;
    if(section === "settings" && state.section !== "settings"){
      settingsTab = "system";
      settingsScroll = { system:0, config:0, about:0 };
    }

    var first = state.section === null;
    state.section = section;
    renderFlyout(section);

    els.card.hidden = false;
    document.body.dataset.section = section;

    if(first){
      els.card.classList.remove("is-open");
      void els.card.offsetWidth; /* paint the closed state once */
      els.card.classList.add("is-open");
      /* keep keyboard users inside the freshly opened layer */
      if(!els.card.contains(document.activeElement)){
        try{ els.body.focus(); }catch(err){ /* ignore */ }
      }
    }else{
      els.card.classList.add("is-open");
    }

    lastSize = -1;
    reportSize(); /* synchronous layout read: no rAF dependency */
    requestAnimationFrame(reportSize);
    /* the host owns the height budget; re-sync it on every section open so a
       budget that went stale with a previous section can never survive here */
    if(hasHost) postPanel("RL_FLYOUT_READY", {});

    if(pendingFocus){
      var focusRequest = pendingFocus;
      pendingFocus = null;
      if(section === "settings" && focusRequest.tab && SETTINGS_TAB_IDS[focusRequest.tab] && settingsTab !== focusRequest.tab){
        switchSettingsTab(focusRequest.tab);
      }
      if(!focusSectionTarget(focusRequest.selector) && section === "settings") pendingFocus = focusRequest;
    }
  }

  function hideSection(){
    closeProjectSettingsModal();
    closeImagePreview(false);
    closeTabPicker(false);
    closeOpenSelect();
    pendingFocus = null;
    /* shell v10: any close path before the final save abandons the draft */
    if(pendingRequest) discardPending();
    if(!state.section && els.card && els.card.hidden) return;
    state.section = null;
    if(!els.card) return;

    els.card.classList.remove("is-open");
    document.body.removeAttribute("data-section");

    var delay = reducedMotion() ? 0 : 200;
    setTimeout(function(){
      if(!state.section && els.card) els.card.hidden = true;
    }, delay);
  }

  function reportSize(){
    if(imagePreview) return;
    if(!els.card || !state.section) return;
    updateScrollAffordance();
    var height = Math.ceil(els.card.getBoundingClientRect().height);
    if(height <= 0 || height === lastSize) return;
    lastSize = height;
    toHost("RL_FLYOUT_SIZE", { height:height });
  }

  function applyFlyoutMax(){
    if(role !== "flyout") return;
    if(!flyoutMaxAvailable || !isFinite(flyoutMaxAvailable)) return;
    var wrap = document.querySelector(".fo-body-wrap");
    if(!wrap || !els.card) return;
    var top = document.querySelector(".fo-top");
    var foot = document.querySelector(".fo-foot");
    var chrome = (top ? top.offsetHeight : 0) + (foot ? foot.offsetHeight : 0) + 2;
    /* shell v12 §4: the host aligns the iframe top to the menu button and caps
       its height to the space on that side; the body alone scrolls inside that
       budget. Never add a fixed top offset here. */
    var available = Math.max(120, Math.round(flyoutMaxAvailable));
    var max = Math.max(80, available - chrome);
    wrap.style.maxHeight = max + "px";
    els.card.style.maxHeight = available + "px";
  }

  function updateScrollAffordance(){
    if(role !== "flyout" || !els.body || !els.card) return;
    var scrollable = els.body.scrollHeight > els.body.clientHeight + 1;
    els.card.classList.toggle("is-scrollable", scrollable);
    els.body.classList.toggle("is-scrolled", scrollable && els.body.scrollTop > 4);
  }

  function requestClose(){
    /* shell v10 §9: closing before the final save drops the pending draft */
    if(pendingRequest) discardPending();
    toHost("RL_FLYOUT_REQUEST_CLOSE");
    /* with no host (standalone / demo) nobody can hide us */
    if(!hasHost) hideSection();
  }

  function revokeThumbs(){
    for(var id in thumbUrls){
      if(has(thumbUrls, id)){
        try{ URL.revokeObjectURL(thumbUrls[id]); }catch(err){ /* ignore */ }
      }
    }
    thumbUrls = {};
  }

  /* ---------- phase 8: shared tab picker ---------- */

  function openTabPicker(mode){
    if(role !== "flyout" || !els.card) return;
    closeTabPicker(false);

    var pickMode = mode === "pick";
    var el = h("div", "tab-picker");
    el.id = "rl-tab-picker";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", pickMode ? lx("pickerPickTitle") : lx("pickerCaptureTitle"));

    var head = h("div", "tab-picker-head");
    head.appendChild(h("b", "tab-picker-title", pickMode ? lx("pickerPickTitle") : lx("pickerCaptureTitle")));
    var close = h("button", "tab-picker-x", "×");
    close.type = "button";
    close.id = "rl-tab-picker-close";
    close.setAttribute("aria-label", t("Kapat"));
    head.appendChild(close);
    el.appendChild(head);

    var status = h("div", "tab-picker-status", lx("tabListLoading"));
    status.id = "rl-tab-picker-status";
    status.setAttribute("role", "status");
    el.appendChild(status);

    var list = h("div", "tab-picker-list");
    list.id = "rl-tab-picker-list";
    list.setAttribute("role", "listbox");
    el.appendChild(list);

    var empty = h("div", "tab-picker-empty", lx("tabListFailed"));
    empty.id = "rl-tab-picker-empty";
    empty.hidden = true;
    el.appendChild(empty);

    var foot = h("div", "tab-picker-foot");
    var cancel = h("button", "btn btn--small", lx("cancel"));
    cancel.type = "button";
    cancel.id = "rl-tab-picker-cancel";
    foot.appendChild(cancel);
    el.appendChild(foot);

    tabPicker = { el:el, mode:pickMode ? "pick" : "capture", tabs:[], index:0, returnFocus:document.activeElement };
    els.card.appendChild(el);

    close.addEventListener("click", function(){ closeTabPicker(); });
    cancel.addEventListener("click", function(){ closeTabPicker(); });
    el.addEventListener("keydown", onTabPickerKeydown);

    sendRuntime({ type:"RL_TABS_LIST" }, function(response, failure){
      if(!tabPicker || tabPicker.el !== el) return;
      var tabs = (!failure && response && response.ok && response.tabs && response.tabs.length)
        ? response.tabs : null;
      if(!tabs){ showTabPickerEmpty(); return; }

      var usable = [];
      for(var i = 0; i < tabs.length; i++){
        if(isUsableTab(tabs[i])) usable.push(tabs[i]);
      }
      if(!usable.length){ showTabPickerEmpty(); return; }

      status.hidden = true;
      tabPicker.tabs = usable;
      renderTabRows(el, usable);
    });
  }

  function closeTabPicker(restoreFocus){
    if(!tabPicker) return;
    var el = tabPicker.el;
    var back = tabPicker.returnFocus;
    tabPicker = null;
    if(el && el.parentNode) el.parentNode.removeChild(el);
    if(restoreFocus !== false && back && document.body.contains(back) && !back.disabled){
      try{ back.focus(); }catch(err){ /* ignore */ }
    }
  }

  function isUsableTab(tab){
    if(!tab || typeof tab.id !== "number") return false;
    var url = String(tab.url || "");
    if(!url) return true;
    if(/^(chrome|edge|about|chrome-extension|moz-extension):/i.test(url)) return false;
    var base = "";
    try{ base = chrome.runtime.getURL(""); }catch(err){ base = ""; }
    if(base && url.indexOf(base) === 0) return false;
    return true;
  }

  function showTabPickerEmpty(){
    if(!tabPicker) return;
    var status = tabPicker.el.querySelector("#rl-tab-picker-status");
    var empty = tabPicker.el.querySelector("#rl-tab-picker-empty");
    var list = tabPicker.el.querySelector("#rl-tab-picker-list");
    if(status) status.hidden = true;
    if(list) list.hidden = true;
    if(empty) empty.hidden = false;
  }

  function renderTabRows(el, tabs){
    var list = el.querySelector("#rl-tab-picker-list");
    if(!list) return;
    list.textContent = "";

    tabs.forEach(function(tab, index){
      var row = h("button", "tab-row" + (tab.active ? " is-active" : ""));
      row.type = "button";
      row.setAttribute("data-tab-id", String(tab.id));
      row.setAttribute("data-tab-index", String(index));
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", "false");

      var fav = h("span", "tab-fav");
      fav.setAttribute("aria-hidden", "true");
      var favUrl = String(tab.favIconUrl || "");
      if(/^(https?:|data:)/i.test(favUrl)){
        var img = document.createElement("img");
        img.alt = "";
        img.referrerPolicy = "no-referrer";
        img.src = favUrl;
        img.addEventListener("error", function(){
          if(img.parentNode) img.parentNode.removeChild(img);
          fav.appendChild(h("i", "tab-dot"));
        });
        fav.appendChild(img);
      }else{
        fav.appendChild(h("i", "tab-dot"));
      }

      var text = h("span", "tab-text");
      text.appendChild(h("span", "tab-title", String(tab.title || tab.url || "—")));
      text.appendChild(h("span", "tab-url", formatTabPath(tab.url)));

      row.appendChild(fav);
      row.appendChild(text);
      if(tab.active) row.appendChild(h("span", "tab-here", lx("thisTab")));

      row.addEventListener("click", function(){ chooseTab(tab); });
      list.appendChild(row);
    });

    var first = list.querySelector(".tab-row");
    if(first) try{ first.focus(); }catch(err){ /* ignore */ }
  }

  function formatTabPath(url){
    var raw = String(url || "");
    if(!raw) return "";
    try{
      var parsed = new URL(raw);
      if(parsed.protocol === "file:"){
        var file = decodeURIComponent(parsed.pathname || "").split("/").filter(Boolean).pop();
        return file || raw;
      }
      var path = (parsed.pathname || "/") + (parsed.search || "");
      if(path.length > 1 && path.charAt(path.length - 1) === "/") path = path.slice(0, -1);
      return parsed.host + path;
    }catch(err){
      return raw;
    }
  }

  function onTabPickerKeydown(event){
    if(!tabPicker) return;
    var key = event.key;
    if(key === "Escape" || key === "Esc" || event.keyCode === 27){
      event.preventDefault();
      event.stopPropagation();
      closeTabPicker();
      return;
    }
    if(key === "ArrowDown" || key === "ArrowUp"){
      event.preventDefault();
      event.stopPropagation();
      movePickerFocus(key === "ArrowDown" ? 1 : -1);
      return;
    }
    if(key === "Enter"){
      var active = document.activeElement;
      if(active && active.classList && active.classList.contains("tab-row")){
        event.preventDefault();
        event.stopPropagation();
        active.click();
      }
    }
  }

  function movePickerFocus(step){
    if(!tabPicker) return;
    var rows = tabPicker.el.querySelectorAll(".tab-row");
    if(!rows.length) return;
    var index = -1;
    for(var i = 0; i < rows.length; i++){
      if(rows[i] === document.activeElement){ index = i; break; }
    }
    var next = index < 0 ? (step > 0 ? 0 : rows.length - 1) : (index + step + rows.length) % rows.length;
    try{ rows[next].focus(); }catch(err){ /* ignore */ }
  }

  function chooseTab(tab){
    if(!tabPicker) return;
    var mode = tabPicker.mode;
    closeTabPicker(false);
    if(mode === "pick") startElementPick(tab);
    else startCapture(tab);
  }

  /* ---------- phase 8: screenshot flow ---------- */

  function resolveOriginTab(){
    return getCurrentTabId().then(function(id){
      if(id != null) return id;
      return requestOriginViaChannel();
    });
  }

  /* shell v8: start directly on the active tab (no tab list). The old
     tab-picker stays in the file but is intentionally no longer triggered. */
  function withActiveTab(failKey, run){
    var fail = function(){ toast(lx(failKey), "error"); };
    try{
      if(typeof chrome === "undefined" || !chrome.tabs ||
         typeof chrome.tabs.query !== "function"){
        fail();
        return;
      }
      chrome.tabs.query({ active:true, currentWindow:true }, function(tabs){
        try{
          if(chrome.runtime && chrome.runtime.lastError){ fail(); return; }
        }catch(err){ /* ignore */ }
        var tab = tabs && tabs.length ? tabs[0] : null;
        if(!tab || !isUsableTab(tab)){ fail(); return; }
        run(tab);
      });
    }catch(err){ fail(); }
  }

  function startCaptureFromActiveTab(){
    withActiveTab("captureUnavailable", startCapture);
  }

  function startElementPickFromActiveTab(capture){
    withActiveTab("pickUnavailable", function(tab){ startElementPick(tab, capture); });
  }

  function setPanelVisibility(hidden){
    if(hidden){
      var active = document.activeElement;
      if(active && active.id) panelReturnFocusId = active.id;
      clearAutoHide();
    }
    postPanel("RL_PANEL_VISIBILITY", { hidden: !!hidden });
    if(!hidden){
      scheduleAutoHide();
      restorePanelFocusSoon();
    }
  }

  /* shell v12 §6: returning from the overlay restores the control the user
     used, without re-rendering or closing the section. */
  function restorePanelFocusSoon(){
    if(!panelReturnFocusId) return;
    setTimeout(function(){
      if(!state.section) return;
      var current = document.activeElement;
      if(current && current !== document.body && els.card && els.card.contains(current)) return;
      var el = document.getElementById(panelReturnFocusId);
      if(el && !el.disabled && document.body.contains(el)){
        try{ el.focus(); }catch(err){ /* ignore */ }
      }
    }, 80);
  }

  function startCapture(tab){
    if(capturePending || !tab) return;
    capturePending = true;
    setPanelVisibility(true);
    syncCaptureControls();
    setCaptureStatus(lx("tabOpening"));

    if(captureTimer){ clearTimeout(captureTimer); captureTimer = null; }
    captureTimer = setTimeout(function(){
      captureTimer = null;
      if(!capturePending) return;
      clearCapturePending();
      toast(lx("captureTimeout"), "error");
      restoreOriginFocus();
    }, PENDING_TIMEOUT);

    resolveOriginTab().then(function(originId){
      var payload = { type:"RL_CAPTURE_TAB", tabId:tab.id, lang:state.lang === "en" ? "en" : "tr" };
      if(originId != null) payload.originTabId = originId;
      sendRuntime(payload, function(response, failure){
        if(failure || (response && response.ok === false)){
          clearCapturePending();
          toast(lx("captureUnavailable"), "error");
          restoreOriginFocus();
        }
      });
    });
  }

  function clearCapturePending(){
    var wasPending = capturePending;
    capturePending = false;
    if(captureTimer){ clearTimeout(captureTimer); captureTimer = null; }
    syncCaptureControls();
    setCaptureStatus("");
    if(wasPending) setPanelVisibility(false);
  }

  function setCaptureStatus(text){
    var status = document.getElementById("rl-capture-status");
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

  function handleCaptureResult(message){
    clearCapturePending();
    var dataUrl = message && message.dataUrl;
    if(typeof dataUrl !== "string" || dataUrl.indexOf("data:image/") !== 0){
      toast(lx("captureFailed"), "error");
      restoreOriginFocus();
      return;
    }
    dataUrlToFile(dataUrl).then(function(file){
      if(!file) throw new Error("blob missing");
      queueImages([file]);
    }).catch(function(){
      toast(lx("captureFailed"), "error");
      restoreOriginFocus();
    });
  }

  function handleCaptureCancelled(message){
    clearCapturePending();
    var reason = message && message.reason;
    if(reason === "timeout"){
      toast(lx("captureTimeout"), "error");
      restoreOriginFocus();
      return;
    }
    if(reason === "closed" || reason === "failed" || reason === "unavailable"){
      toast(lx(reason === "closed" ? "captureTabClosed" : "captureUnavailable"), "error");
      restoreOriginFocus();
      return;
    }
    toast(lx("captureCancelled"));
  }

  function dataUrlToFile(dataUrl, namePrefix){
    return fetch(dataUrl).then(function(response){ return response.blob(); }).then(function(blob){
      var type = blob.type || "image/png";
      var ext = type.indexOf("jpeg") >= 0 ? "jpg" : "png";
      var prefix = namePrefix || "ekran-alintisi";
      var name = prefix + "-" + Date.now() + "." + ext;
      try{ return new File([blob], name, { type:type }); }
      catch(err){
        try{ blob.name = name; }catch(assignErr){ /* ignore */ }
        return blob;
      }
    });
  }

  function syncCaptureControls(req){
    var target = req || activeRequest();
    var btn = document.getElementById("rl-capture-open");
    if(btn){
      var full = !!(target && (target.images || []).length >= LIMITS.MAX_IMAGES);
      btn.disabled = capturePending || !target || isLocked(target) || full;
    }
    if(capturePending) setCaptureStatus(lx("tabOpening"));

    var pickBtn = document.getElementById("rl-pick-element");
    if(pickBtn){
      pickBtn.disabled = pickPending || !target || isLocked(target);
    }
    var pickCaptureBtn = document.getElementById("rl-pick-capture");
    if(pickCaptureBtn){
      pickCaptureBtn.disabled = pickPending || !target || isLocked(target);
    }
  }

  /* ---------- phase 8: element picker flow ---------- */

  function startElementPick(tab, capture){
    if(pickPending || !tab) return;
    pickPending = true;
    setPanelVisibility(true);
    syncCaptureControls();
    setPickStatus(lx("tabOpening"));

    if(pickTimer){ clearTimeout(pickTimer); pickTimer = null; }
    pickTimer = setTimeout(function(){
      pickTimer = null;
      if(!pickPending) return;
      clearPickPending();
      toast(lx("pickTimeout"), "error");
      restoreOriginFocus();
    }, PENDING_TIMEOUT);

    resolveOriginTab().then(function(originId){
      var payload = { type:"RL_PICK_ELEMENT", tabId:tab.id, lang:state.lang === "en" ? "en" : "tr" };
      if(originId != null) payload.originTabId = originId;
      if(capture) payload.capture = true;
      sendRuntime(payload, function(response, failure){
        if(failure || (response && response.ok === false)){
          clearPickPending();
          toast(lx("pickUnavailable"), "error");
          restoreOriginFocus();
        }
      });
    });
  }
