  function marqueeTick(ts){
    if(!marquee) return;
    var now = typeof ts === "number" ? ts : 0;
    if(!marquee.last) marquee.last = now;
    var dt = (now - marquee.last) / 1000;
    marquee.last = now;
    if(!isFinite(dt) || dt < 0) dt = 0;
    if(dt > 0.1) dt = 0.1;

    if(!marquee.el.hidden && !marquee.dragging && marquee.textWidth > 0){
      /* a fresh title rests for a moment before the loop starts */
      if(marquee.hold > 0){
        marquee.hold = Math.max(0, marquee.hold - dt);
      }else{
        marquee.offset -= MARQUEE_SPEED * dt;
        if(marquee.offset <= -marquee.textWidth) marquee.offset = marquee.width;
        marquee.track.style.transform = "translateX(" + marquee.offset + "px)";
      }
    }
    requestAnimationFrame(marqueeTick);
  }

  function marqueeBounds(){
    var min = -marquee.textWidth;
    var max = Math.max(0, marquee.width);
    return { min:min, max:max };
  }

  function onMarqueeDown(event){
    if(!marquee || event.button !== 0) return;
    marquee.dragging = true;
    marquee.pointerId = event.pointerId;
    marquee.dragX = event.clientX;
    marquee.dragOffset = marquee.offset;
    marquee.el.classList.add("is-dragging");
    try{ marquee.el.setPointerCapture(event.pointerId); }catch(err){ /* ignore */ }
    event.preventDefault();
  }

  function onMarqueeMove(event){
    if(!marquee || !marquee.dragging) return;
    if(marquee.pointerId != null && event.pointerId !== marquee.pointerId) return;
    var bounds = marqueeBounds();
    var next = marquee.dragOffset + (event.clientX - marquee.dragX);
    marquee.offset = Math.max(bounds.min, Math.min(bounds.max, next));
    marquee.track.style.transform = "translateX(" + marquee.offset + "px)";
    event.preventDefault();
  }

  function onMarqueeEnd(event){
    if(!marquee || !marquee.dragging) return;
    if(event && marquee.pointerId != null && event.pointerId != null &&
       event.pointerId !== marquee.pointerId) return;
    marquee.dragging = false;
    marquee.pointerId = null;
    marquee.el.classList.remove("is-dragging");
    try{
      if(event && event.pointerId != null && marquee.el.hasPointerCapture(event.pointerId)){
        marquee.el.releasePointerCapture(event.pointerId);
      }
    }catch(err){ /* ignore */ }
    marquee.last = 0;
  }

  function postItemHint(btn, spec, visible){
    if(!visible){
      postRailHint(btn, null);
      return;
    }
    /* shell v11 §5: the active section does not need its counter hint */
    if(state.active === spec.id){
      postRailHint(btn, null);
      return;
    }
    var badge = btn.querySelector(".n");
    var text = badge ? String(badge.textContent || "").trim() : "";
    postRailHint(btn, {
      y:Math.max(0, Math.round(btn.offsetTop)),
      title:spec.id === "project" ? projectSectionLabel() : sectionText(spec, "label"),
      lines:text ? [text] : []
    });
  }

  function buildItem(spec){    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "item";
    if(spec.primary) btn.classList.add("item--primary");
    if(spec.ready) btn.classList.add("item--ready");
    btn.setAttribute("data-section", spec.id);
    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-expanded", "false");
    if(spec.hook) btn.id = "rl-" + spec.hook;

    btn.innerHTML = ICONS[spec.iconKey] || "";
    btn.appendChild(h("span", "item-label", spec.id === "project" ? projectSectionLabel() : sectionText(spec, "label")));
    if(spec.badge){
      var badge = h("span", "n");
      badge.setAttribute("aria-hidden", "true");
      btn.appendChild(badge);
      /* shell v9: the badge lives only in the host's hover card */
      btn.addEventListener("pointerenter", function(){ postItemHint(btn, spec, true); });
      btn.addEventListener("pointerleave", function(){ postItemHint(btn, spec, false); });
      btn.addEventListener("focus", function(){ postItemHint(btn, spec, true); });
      btn.addEventListener("blur", function(){ postItemHint(btn, spec, false); });
    }

    btn.addEventListener("click", function(event){
      if(state.active === spec.id){
        /* re-clicking the active section: a real user toggles it closed,
           programmatic opens stay open and refresh (harmless in automation) */
        if(event && event.isTrusted) closeSection();
        else refreshSection(spec.id);
        return;
      }
      if(spec.id === "export" && state.mode === "compose"){
        triggerReady();
        return;
      }
      openSection(spec.id, btn);
    });
    return btn;
  }

  function buildCancelItem(){
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "item item--quiet";
    btn.id = "rl-cancel";
    btn.setAttribute("data-action", "cancel");
    btn.innerHTML = ICONS.cancel;
    btn.appendChild(h("span", "item-label", lx("cancel")));
    btn.addEventListener("click", function(){ triggerCancel(); });
    return btn;
  }

  function renderTopGroup(){
    if(!els.topGroup) return;
    els.topGroup.textContent = "";
    topItems = [];

    /* shell v11 §9: without a project name only the project gate is offered */
    if(!hasProjectName()){
      topItems.push(buildItem(SECTION_SPECS.project));
      els.topGroup.appendChild(topItems[0]);
      if(state.active){
        var gateBtn = els.topGroup.querySelector('[data-section="' + state.active + '"]');
        if(gateBtn) markActive(gateBtn);
      }
      updateDockBadges();
      syncTabStops();
      return;
    }

    if(state.mode === "compose"){
      topItems.push(buildItem(SECTION_SPECS.detail));
      topItems.push(buildItem(SECTION_SPECS.page));
      topItems.push(buildItem(SECTION_SPECS.desc));

      for(var c = 0; c < topItems.length; c++) els.topGroup.appendChild(topItems[c]);

      /* shell v11 §8: the Ready/Cancel pair is gone; ready and delete live
         in the detail footer. */
    }else{
      topItems.push(buildItem(SECTION_SPECS.new));
      topItems.push(buildItem(SECTION_SPECS.list));
      for(var i = 0; i < topItems.length; i++) els.topGroup.appendChild(topItems[i]);
    }

    if(state.active){
      var activeBtn = els.topGroup.querySelector('[data-section="' + state.active + '"]');
      if(activeBtn) markActive(activeBtn);
    }
    updateDockBadges();
    syncTabStops();
  }

  function markActive(btn){
    var all = document.querySelectorAll(".item");
    for(var i = 0; i < all.length; i++){
      all[i].classList.remove("is-current");
      all[i].setAttribute("aria-expanded", "false");
    }
    if(btn){
      btn.classList.add("is-current");
      btn.setAttribute("aria-expanded", "true");
    }
  }

  function syncTabStops(){
    if(!els.topGroup) return;
    /* utility sections keep the top group visible (and focusable) */
    var collapsing = !!state.active && !isUtilitySection(state.active);
    var utilsOpen = !!(els.card && els.card.classList.contains("utils-open"));
    var items = els.topGroup.querySelectorAll(".item");
    for(var i = 0; i < items.length; i++){
      var isUtil = isUtilitySection(items[i].getAttribute("data-section"));
      var hidden = isUtil
        ? !utilsOpen
        : (collapsing && !items[i].classList.contains("is-current"));
      items[i].tabIndex = hidden ? -1 : 0;
      if(hidden) items[i].setAttribute("aria-hidden", "true");
      else items[i].removeAttribute("aria-hidden");
    }
  }

  function badgeNode(section){
    if(!els.topGroup) return null;
    var btn = els.topGroup.querySelector('[data-section="' + section + '"]');
    return btn ? btn.querySelector(".n") : null;
  }

  function setBadge(section, text){
    var node = badgeNode(section);
    if(!node) return;
    if(text == null || text === ""){
      node.hidden = true;
      node.textContent = "";
    }else{
      node.hidden = false;
      node.textContent = text;
    }
  }

  function updateDockBadges(){
    if(!els.topGroup) return;
    updateStats();
    updateMarquee();

    if(state.mode === "idle"){
      setBadge("list", dockCount > 0 ? String(dockCount) : null);
      return;
    }

    var pageBtn = els.topGroup.querySelector('[data-section="page"]');
    var summary = dockSummary;
    if(!summary){
      setBadge("detail", null);
      setBadge("page", null);
      setBadge("desc", null);
      if(pageBtn){
        pageBtn.hidden = false;
        pageBtn.classList.remove("is-dim");
      }
      return;
    }

    var tpl = templateFor(summary.type);
    var page = pageProgress(summary);
    setBadge("page", page.total > 0 ? page.filled + "/" + page.total : null);
    if(pageBtn){
      /* shell v10 §7: no Page step at all for page/location-free types */
      pageBtn.hidden = !(tpl.page || tpl.location);
      pageBtn.classList.toggle("is-dim", !(tpl.page || tpl.location));
    }

    var desc = descProgress(summary);
    setBadge("desc", desc.filled + "/" + desc.total);

    /* shell v6: the combined detail badge counts title + page + description */
    var titleFilled = summary.title && String(summary.title).trim() ? 1 : 0;
    setBadge("detail", (titleFilled + page.filled + desc.filled) + "/" + (1 + page.total + desc.total));
  }

  function showDockSaveState(){
    if(!els.card) return;
    var node = els.card.querySelector("#rl-save-state");
    if(node){
      node.setAttribute("data-state", state.saving);
      node.textContent = saveText();
    }
  }

  /* the flyout footer owns the save indicator; the dock has none (shell v7) */
  function syncDockSave(){
    if(role !== "dock" || !els.save) return;
    els.save.hidden = !!state.active || state.mode === "compose";
  }

  /* Phase 7: re-render every visible dock string on a language change.
     The utility group (Ayarlar / Yedek / Yardım) is built once in initDock,
     so renderTopGroup() alone left it stuck in the previous language. */
  function refreshDockLabels(){
    if(role !== "dock" || !els.card) return;

    var items = els.card.querySelectorAll(".item[data-section]");
    for(var i = 0; i < items.length; i++){
      var spec = SECTION_SPECS[items[i].getAttribute("data-section")];
      if(!spec) continue;
      var label = items[i].querySelector(".item-label");
      if(label) label.textContent = spec.id === "project" ? projectSectionLabel() : sectionText(spec, "label");
    }

    var cancel = els.card.querySelector("#rl-cancel .item-label");
    if(cancel) cancel.textContent = lx("cancel");

    if(els.collapse){
      els.collapse.setAttribute("aria-label", lx("closePanel"));
    }
    if(els.rootFolder){
      els.rootFolder.setAttribute("aria-label", lx("folderRootOpen"));
    }
    if(els.exportFolder){
      els.exportFolder.setAttribute("aria-label", lx("folderExportOpen"));
    }
    if(els.utilToggle){
      els.utilToggle.setAttribute("aria-label", lx("utilToggle"));
    }
    if(els.pin) syncPinUI();
    if(els.dragHandle){
      els.dragHandle.setAttribute("aria-label", lx("dragHandle"));
    }
    if(els.callout){
      var calloutSub = els.callout.querySelector(".callout-sub");
      if(calloutSub) calloutSub.textContent = lx("calloutHint");
      els.callout.setAttribute("aria-label", "Request Ledger — " + lx("calloutHint"));
    }
    if(els.launcher){
      els.launcher.setAttribute("aria-label", lx("openPanel"));
    }
    if(els.card) els.card.setAttribute("aria-label", t("İstek Defteri"));
    if(els.save) els.save.title = t("Kaydedildi");

    showDockSaveState();
    updateDockBadges();
    updateMarquee();
    syncTabStops();
    sendLauncherUI();
  }

  /* shell v9: sections reorder/collapse rail items with a 0.18–0.22 s
     transition. Reading offsetTop synchronously in openSection therefore sees
     the pre-transition layout; the host arrow then missed the settled item
     (most visibly in Settings, where the utility group expands). Re-measure
     after the next frames and after the transition ends, and report the final
     anchor to the host. */
  var anchorReportTimer = null;
  var anchorReportToken = 0;
  var lastAnchorTop = null;
  var lastAnchorHeight = null;

  function currentSectionButton(section){
    if(!els.topGroup || !section) return null;
    return els.topGroup.querySelector('[data-section="' + section + '"]');
  }

  function reportSectionAnchor(section, btn){
    if(!btn || !btn.isConnected || state.active !== section) return;
    var top = Math.max(0, Math.round(btn.offsetTop));
    var height = Math.round(btn.offsetHeight);
    if(top === lastAnchorTop && height === lastAnchorHeight) return;
    lastAnchorTop = top;
    lastAnchorHeight = height;
    toHost("RL_SECTION_ANCHOR", { section:section, anchorTop:top, anchorHeight:height });
  }

  function scheduleSectionAnchor(section, btn){
    if(anchorReportTimer){ clearTimeout(anchorReportTimer); anchorReportTimer = null; }
    var token = ++anchorReportToken;
    var report = function(){
      if(token !== anchorReportToken) return;
      reportSectionAnchor(section, btn);
    };
    requestAnimationFrame(function(){ requestAnimationFrame(report); });
    /* transitionend is the exact signal; this is the fallback for reduced
       motion or a transition that never fires (element replaced) */
    anchorReportTimer = setTimeout(function(){
      anchorReportTimer = null;
      report();
    }, reducedMotion() ? 0 : 300);
  }

  function onSectionTransitionEnd(event){
    if(!state.active) return;
    var property = event.propertyName || "";
    if(["max-height","height","padding-top","padding-bottom","margin-top"].indexOf(property) < 0) return;
    var target = event.target;
    if(!target || !target.classList) return;
    if(!target.classList.contains("item") &&
       !target.classList.contains("g--util") &&
       !target.classList.contains("rail-divider--compose")) return;
    reportSectionAnchor(state.active, currentSectionButton(state.active));
  }

  function openSection(section, btn){
    /* shell v10 §7: a type without page/location never opens the Page step */
    if(state.mode === "compose" && section === "page"){
      var composeReq = activeRequest();
      var composeType = (dockSummary && dockSummary.type) || (composeReq && composeReq.type);
      var composeTpl = composeType ? templateFor(composeType) : null;
      if(composeTpl && !composeTpl.page && !composeTpl.location) section = "desc";
    }
    var spec = SECTION_SPECS[section];
    if(!spec || !sectionAllowed(section, state.mode)) return;

    if(state.active === section){
      refreshSection(section);
      return;
    }

    if(!btn && els.card){
      btn = els.card.querySelector('[data-section="' + section + '"]');
    }

    state.active = section;
    var utility = isUtilitySection(section);
    /* top-group sections collapse the idle buttons and slide the active one
       to the top; utility sections keep the top group untouched */
    els.card.classList.toggle("is-section-open", !utility);
    els.card.classList.toggle("is-util-open", utility);
    if(utility) expandUtilities();
    markActive(btn);
    syncDockSave();
    clearAutoHide();

    /* the active item is ordered to the top with CSS `order` (no DOM move:
       re-inserting a node would cancel the collapse/expand transition) */
    syncTabStops();

    /* measured after the reorder: the host aligns the flyout to this value.
       The collapse/expand transitions have not run yet, so this is only the
       first estimate; scheduleSectionAnchor sends the settled value. */
    var anchorTop = btn ? btn.offsetTop : 0;
    var anchorHeight = btn ? btn.offsetHeight : 0;
    lastAnchorTop = null;
    lastAnchorHeight = null;
    toHost("RL_SECTION_OPEN", { section:section, anchorTop:anchorTop, anchorHeight:anchorHeight });
    scheduleSectionAnchor(section, btn);
    channelPost({ type:"open", section:section });
    broadcastState();
  }

  function refreshSection(section){
    if(!state.active) return;
    channelPost({ type:"open", section:section });
    broadcastState();
  }

  function closeSection(){
    if(!state.active) return;
    state.active = null;
    anchorReportToken += 1;
    if(anchorReportTimer){ clearTimeout(anchorReportTimer); anchorReportTimer = null; }
    lastAnchorTop = null;
    lastAnchorHeight = null;
    els.card.classList.remove("is-section-open");
    els.card.classList.remove("is-util-open");
    markActive(null);
    syncTabStops();
    syncDockSave();
    toHost("RL_SECTION_CLOSE");
    channelPost({ type:"close" });
    broadcastState();
    /* shell v7: closing an untouched compose request returns the rail to idle
       (no Sayfa/Açıklama/Hazır/İptal) while the dock itself stays open */
    if(state.mode === "compose"){
      /* shell v10: an unfinished pending draft is dropped with its media */
      channelPost({ type:"discard" });
    }
    if(state.mode === "compose" && !composeDirty){
      setMode("idle");
    }
    scheduleAutoHide();
  }

  function openListSection(){
    if(state.mode !== "idle") return;
    if(state.active === "list"){ refreshSection("list"); return; }
    var btn = els.topGroup ? els.topGroup.querySelector('[data-section="list"]') : null;
    if(btn) openSection("list", btn);
  }

  function setMode(next, opts){
    opts = opts || {};
    var mode = next === "compose" ? "compose" : "idle";
    if(state.mode === mode) return;

    var active = state.active;
    if(!opts.keepSection && active && !sectionAllowed(active, mode)) closeSection();

    state.mode = mode;
    document.body.dataset.mode = mode;
    renderTopGroup();

    if(active && state.active){
      var btn = els.card.querySelector('.item[data-section="' + state.active + '"]');
      if(btn) markActive(btn);
    }
    syncTabStops();
    updateDockBadges();
    syncDockSave();

    toHost("RL_DOCK_MODE", { mode:mode });
    broadcastState();
  }

  function triggerReady(){
    if(role !== "dock") return;
    channelPost({ type:"ready" });
  }

  function triggerCancel(){
    if(role !== "dock") return;
    channelPost({ type:"cancel" });
  }

  function requestMode(mode){
    if(role !== "dock") return;
    if(!els.card){
      pendingMode = mode === "compose" ? "compose" : "idle";
      return;
    }
    setMode(mode);
  }

  function initDock(){
    readOriginTabId();
    var card = document.createElement("aside");
    card.className = "card dock-card";
    card.id = "rl-dock-card";
    card.setAttribute("aria-label", t("İstek Defteri"));
    card.hidden = true; /* shell v2: collapsed on load */

    /* shell v3: pin + collapse live at the bottom, below the utility group */
    var pin = document.createElement("button");
    pin.type = "button";
    pin.className = "rail-btn rail-pin";
    pin.id = "rl-pin";
    pin.innerHTML = ICONS.pin;
    pin.setAttribute("aria-pressed", "false");
    pin.setAttribute("aria-controls", "rl-dock-card");
    pin.setAttribute("aria-label", lx("pinPanel"));
    pin.addEventListener("click", function(){ togglePin(); });

    var collapse = document.createElement("button");
    collapse.type = "button";
    collapse.className = "rail-btn rail-collapse";
    collapse.id = "rl-collapse";
    collapse.innerHTML = ICONS.chevronRight;
    collapse.setAttribute("aria-label", lx("closePanel"));
    collapse.setAttribute("aria-controls", "rl-dock-card");
    collapse.addEventListener("click", function(){ closeDock(); });

    /* shell v4: bottom-most full-width row. Native pointer capture keeps the
       drag alive inside this iframe; the host slides both frames and draws its
       own shield so moves outside the iframe are still tracked. */
    var dragHandle = document.createElement("div");
    dragHandle.className = "rail-drag";
    dragHandle.id = "rl-drag";
    dragHandle.setAttribute("role", "separator");
    dragHandle.setAttribute("aria-orientation", "horizontal");
    dragHandle.setAttribute("aria-label", lx("dragHandle"));
    dragHandle.innerHTML = ICONS.grip;
    dragHandle.addEventListener("pointerdown", startRailDrag);
    dragHandle.addEventListener("pointermove", moveRailDrag);
    dragHandle.addEventListener("pointerup", onDragPointerEnd);
    dragHandle.addEventListener("pointercancel", onDragPointerEnd);
    dragHandle.addEventListener("lostpointercapture", onDragPointerEnd);
    dragHandle.addEventListener("click", onDragClick);
    dragHandle.addEventListener("dblclick", onDragReset);

    /* always-present launcher (same dock iframe; the shared brand mark) */
    var launcher = document.createElement("button");
    launcher.type = "button";
    launcher.className = "launcher is-visible";
    launcher.id = "rl-launcher";
    launcher.innerHTML = ICONS.mark;
    launcher.setAttribute("aria-label", lx("openPanel"));
    launcher.setAttribute("aria-controls", "rl-dock-card");
    launcher.setAttribute("aria-expanded", "false");
    launcher.addEventListener("click", function(){ openDock(); });

    /* one-shot hint bubble above the launcher */
    var callout = document.createElement("div");
    callout.className = "callout";
    callout.id = "rl-callout";
    callout.hidden = true;
    callout.setAttribute("role", "status");
    callout.setAttribute("aria-label", "Request Ledger — " + lx("calloutHint"));
    callout.appendChild(h("b", "callout-title", "Request Ledger"));
    callout.appendChild(h("span", "callout-sub", lx("calloutHint")));
    callout.addEventListener("click", function(){ openDock(); });

    var top = document.createElement("div");
    top.className = "g g--main";
    top.id = "rl-top-group";

    var grow = document.createElement("div");
    grow.className = "grow";
    grow.setAttribute("aria-hidden", "true");

    var util = document.createElement("div");
    util.className = "g g--util";
    util.id = "rl-util-group";

    ["settings", "backup", "help"].forEach(function(id){
      util.appendChild(buildItem(SECTION_SPECS[id]));
    });

    /* shell v7: ready-ratio ring replaces the "Kaydedildi" caption */
    var stats = buildStats();

    var statsDivider = document.createElement("div");
    statsDivider.className = "rail-divider rail-divider--stats";
    statsDivider.setAttribute("aria-hidden", "true");

    var utilDivider = document.createElement("div");
    utilDivider.className = "rail-divider rail-divider--util";
    utilDivider.setAttribute("aria-hidden", "true");

    /* shell v9: chevron above the dockbar expands the utility group */
    var utilToggle = document.createElement("button");
    utilToggle.type = "button";
    utilToggle.className = "rail-btn rail-util-toggle";
    utilToggle.id = "rl-util-toggle";
    utilToggle.innerHTML = ICONS.chevronUp;
    utilToggle.setAttribute("aria-label", lx("utilToggle"));
    utilToggle.setAttribute("aria-controls", "rl-util-group");
    utilToggle.setAttribute("aria-expanded", "false");
    utilToggle.addEventListener("click", function(){ toggleUtilities(); });

    /* shell v9: bottom card — folders on top, pin | collapse below, each row
       separated by a 1px line and the action pair by a centred vertical one. */
    var rootBtn = buildFolderButton("rl-root-folder", "folderRoot", lx("folderRootOpen"), "rl-set-root");
    var exportBtn = buildFolderButton("rl-export-folder", "folderExport", lx("folderExportOpen"), "rl-set-export-dir");

    var dockbar = h("div", "rail-dockbar");
    dockbar.id = "rl-dockbar";

    var folderRow = h("div", "rail-dockbar-row rail-dockbar-row--folders");
    folderRow.appendChild(rootBtn);
    var folderSep = h("div", "rail-dockbar-vsep");
    folderSep.setAttribute("aria-hidden", "true");
    folderRow.appendChild(folderSep);
    folderRow.appendChild(exportBtn);

    var dockSep = h("div", "rail-dockbar-sep");
    dockSep.setAttribute("aria-hidden", "true");

    var actionRow = h("div", "rail-dockbar-row rail-dockbar-row--actions");
    actionRow.id = "rl-rail-pair";
    var actionSep = h("div", "rail-dockbar-vsep");
    actionSep.setAttribute("aria-hidden", "true");
    actionRow.appendChild(pin);
    actionRow.appendChild(actionSep);
    actionRow.appendChild(collapse);

    dockbar.appendChild(folderRow);
    dockbar.appendChild(dockSep);
    dockbar.appendChild(actionRow);

    var marqueeEl = buildMarquee();

    card.appendChild(marqueeEl);
    card.appendChild(buildStorageBanner());
    card.appendChild(top);
    card.appendChild(grow);
    card.appendChild(stats);
    card.appendChild(statsDivider);
    card.appendChild(util);
    card.appendChild(utilDivider);
    card.appendChild(utilToggle);
    card.appendChild(dockbar);
    card.appendChild(dragHandle);
    document.body.appendChild(card);
    document.body.appendChild(callout);
    document.body.appendChild(launcher);

    /* shell v10: only a blank rail-card area (background / empty group) closes
       the open section; clicks elsewhere and page clicks never do. */
    card.addEventListener("click", function(event){
      if(!state.active) return;
      var target = event.target;
      if(target === card || target === top ||
         (target && target.classList && target.classList.contains("grow"))){
        closeSection();
      }
    });
    card.addEventListener("transitionend", onSectionTransitionEnd);

    els.card = card;
    els.topGroup = top;
    els.collapse = collapse;
    els.pin = pin;
    els.dragHandle = dragHandle;
    els.callout = callout;
    els.launcher = launcher;
    els.stats = stats;
    els.folderTools = dockbar;
    els.dockbar = dockbar;
    els.utilGroup = util;
    els.utilToggle = utilToggle;
    els.marquee = marqueeEl;
    els.rootFolder = rootBtn;
    els.exportFolder = exportBtn;
    els.railPair = actionRow;

    projectGateOn = hasProjectName();
    renderTopGroup();
    syncDockSave();
    syncPinUI();
    syncUtilUI();
    syncStorageUI();
    document.body.dataset.mode = state.mode;
    syncDockState();

    /* any pointer / key / scroll inside the panel restarts the 5s idle timer */
    document.addEventListener("pointerdown", noteInteraction, { passive:true });
    document.addEventListener("keydown", noteInteraction);
    document.addEventListener("wheel", noteInteraction, { passive:true });
    document.addEventListener("scroll", noteInteraction, { passive:true, capture:true });
    window.addEventListener("resize", function(){
      if(marquee && !marquee.el.hidden) measureMarquee(false);
    });

    /* first message out: rAF is suspended in background tabs.
       Measure while briefly laid out so the collapsed card still reports 76px. */
    card.hidden = false;
    var dockWidth = card.offsetWidth;
    var dockHeight = card.offsetHeight;
    card.hidden = true;
    toHost("RL_DOCK_READY", { width:dockWidth, height:dockHeight });
    /* new installs start collapsed: report the state for the host
       (RL_DOCK_STATE only tracks open/closed; the page is not styled) */
    if(state.dock === "collapsed") toHost("RL_DOCK_STATE", { state:"collapsed" });

    /* replay API calls made before the dock finished booting */
    if(pendingDock === "open"){
      var dockOpts = pendingDockOpts || {};
      pendingDock = null;
      pendingDockOpts = null;
      openDock(dockOpts);
    }else if(pendingDock === "collapsed"){
      pendingDock = null;
      pendingDockOpts = null;
    }
    if(pendingSection){
      var bootSection = pendingSection;
      pendingSection = null;
      if(isKnownSection(bootSection)){
        if(state.dock !== "open") openDock({ silent:true });
        var bootBtn = card.querySelector('.item[data-section="' + bootSection + '"]');
        if(bootBtn) openSection(bootSection, bootBtn);
      }
    }

    if(pendingMode){
      var pending = pendingMode;
      pendingMode = null;
      setMode(pending);
    }

    if(demo){
      var qDock = params.get("dock");
      var qMode = params.get("mode");
      var qOpen = params.get("open");
      if(qDock === "open" || qMode === "compose" || isKnownSection(qOpen)) openDock({ silent:true });

      if(qMode === "compose") setMode("compose");

      if(isKnownSection(qOpen)){
        var target = card.querySelector('.item[data-section="' + qOpen + '"]');
        if(target) openSection(qOpen, target);
      }
    }

    document.addEventListener("keydown", function(event){
      if(event.key !== "Escape") return;
      if(dragState){
        event.preventDefault();
        endRailDrag({ postEnd:true, restart:true });
      }else if(state.active){
        event.preventDefault();
        closeSection();
      }else if(state.mode === "compose"){
        event.preventDefault();
        setMode("idle");
      }else if(state.dock === "open"){
        event.preventDefault();
        closeDock();
      }
    });

    /* shell v3: pinned rails open on load (no bubble); unpinned rails show
       the one-shot hint ~400ms after boot. */
    if(state.pinned){
      if(state.dock !== "open") openDock();
    }else if(state.dock !== "open"){
      scheduleCallout();
    }

    window.addEventListener("message", onHostMessage);
    broadcastState();
    /* shell v7: report the launcher/callout kit once the rail is mounted */
    sendLauncherUI();
    /* shell v9: the host positions overlays on the persisted side */
    sendPanelSide();
  }
