  /* ============================================================
     DOCK
     ============================================================ */

  /* shell v2: the dock starts collapsed; only the launcher is visible.
     openDock/closeDock own the launcher <-> rail swap and report the state
     to the host (RL_DOCK_STATE), which no longer styles the page. */
  function syncDockState(){
    document.body.dataset.dock = state.dock;
    document.documentElement.classList.toggle("dock-open", state.dock === "open");
    if(els.launcher) els.launcher.setAttribute("aria-expanded", state.dock === "open" ? "true" : "false");
  }

  /* ---------- shell v3: section groups / pin / callout ---------- */

  function isUtilitySection(section){
    return section === "backup" || section === "help";
  }

  /* shell v9: utility group is collapsed by default and the chevron above the
     dockbar expands it; opening a utility section expands it automatically. */
  function syncUtilUI(){
    if(!els.card) return;
    var open = els.card.classList.contains("utils-open");
    if(els.utilGroup) els.utilGroup.setAttribute("aria-hidden", open ? "false" : "true");
    if(els.utilToggle) els.utilToggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function toggleUtilities(){
    if(role !== "dock" || !els.card) return;
    /* a live utility section keeps its group expanded */
    if(els.card.classList.contains("utils-open") && isUtilitySection(state.active)) return;
    els.card.classList.toggle("utils-open");
    syncUtilUI();
    syncTabStops();
  }

  function expandUtilities(){
    if(role !== "dock" || !els.card) return;
    els.card.classList.add("utils-open");
    syncUtilUI();
  }

  function syncPinUI(){
    if(!els.pin) return;
    var on = !!state.pinned;
    els.pin.setAttribute("aria-pressed", on ? "true" : "false");
    els.pin.classList.toggle("is-on", on);
    els.pin.setAttribute("aria-label", lx(on ? "unpinPanel" : "pinPanel"));
  }

  function persistPin(){
    try{
      if(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local){
        chrome.storage.local.set({ "rl-pinned": !!state.pinned });
      }
    }catch(err){ /* ignore */ }
  }

  function togglePin(){
    if(role !== "dock") return;
    state.pinned = !state.pinned;
    syncPinUI();
    persistPin();
    sendLauncherUI();
    if(state.pinned) clearAutoHide();
    else if(state.dock === "open" && !state.active) scheduleAutoHide();
  }

  /* unpinned rails auto-close after 5s without interaction; a timer is never
     armed while a section is open or while the panel is pinned */
  function clearAutoHide(){
    if(autoHideTimer){ clearTimeout(autoHideTimer); autoHideTimer = null; }
  }

  function scheduleAutoHide(){
    clearAutoHide();
    if(state.pinned || state.dock !== "open" || state.active || capturePending || pickPending) return;
    autoHideTimer = setTimeout(function(){
      autoHideTimer = null;
      if(state.pinned || state.dock !== "open" || state.active || capturePending || pickPending) return;
      closeDock();
    }, AUTO_HIDE_MS);
  }

  function noteInteraction(){
    if(role !== "dock") return;
    if(dragState) return; /* a live drag owns the idle timer */
    if(state.dock !== "open" || state.pinned || state.active) return;
    scheduleAutoHide();
  }

  /* ---------- shell v4: horizontal drag handle ---------- */

  function isDraggingRail(){
    return !!dragState;
  }

  function startRailDrag(event){
    if(role !== "dock" || !els.dragHandle) return;
    if(event.button !== 0 || dragState) return;
    if(state.dock !== "open") return;

    var handle = els.dragHandle;
    var id = event.pointerId;
    dragState = {
      pointerId:id,
      startX:event.screenX,
      lastX:event.screenX,
      pendingX:event.screenX,
      moved:false,
      raf:null
    };
    try{ if(handle.setPointerCapture) handle.setPointerCapture(id); }catch(err){ /* ignore */ }
    if(els.card) els.card.classList.add("is-dragging");
    clearAutoHide();
    toHost("RL_DOCK_DRAG_START", { x:event.screenX });
  }

  function moveRailDrag(event){
    var drag = dragState;
    if(!drag || event.pointerId !== drag.pointerId) return;
    if(Math.abs(event.screenX - drag.startX) > 3) drag.moved = true;
    drag.lastX = event.screenX;
    drag.pendingX = event.screenX;
    if(drag.raf) return; /* already scheduled for this frame */
    drag.raf = window.requestAnimationFrame(function(){
      if(dragState !== drag) return;
      drag.raf = null;
      toHost("RL_DOCK_DRAG_MOVE", { x:drag.pendingX });
    });
  }

  /* opts: { postEnd:boolean, restart:boolean } — END is posted at most once */
  function endRailDrag(opts){
    if(!dragState) return false;
    opts = opts || {};
    var drag = dragState;
    dragState = null;
    if(drag.raf){ window.cancelAnimationFrame(drag.raf); drag.raf = null; }

    var handle = els.dragHandle;
    if(handle){
      try{
        if(handle.hasPointerCapture && handle.hasPointerCapture(drag.pointerId)){
          handle.releasePointerCapture(drag.pointerId);
        }
      }catch(err){ /* ignore */ }
    }
    if(els.card) els.card.classList.remove("is-dragging");
    if(drag.moved) dragSuppressUntil = Date.now() + 400;
    if(opts.postEnd !== false) toHost("RL_DOCK_DRAG_END");
    if(opts.restart) noteInteraction();
    return true;
  }

  function onDragPointerEnd(event){
    if(!dragState || event.pointerId !== dragState.pointerId) return;
    endRailDrag({ postEnd:true, restart:true });
  }

  function onDragReset(event){
    if(role !== "dock") return;
    if(Date.now() < dragSuppressUntil){
      event.preventDefault();
      return;
    }
    toHost("RL_DOCK_DRAG_RESET");
    noteInteraction();
  }

  /* a real drag must not also emit the follow-up click/dblclick */
  function onDragClick(event){
    if(Date.now() < dragSuppressUntil){
      event.preventDefault();
      event.stopPropagation();
    }
  }

  /* one small bubble per page load, above the launcher */
  function showCalloutNow(){
    if(role !== "dock") return;
    if(calloutShown || state.pinned) return;
    if(state.dock === "open" || !els.callout) return;
    calloutShown = true;
    els.callout.hidden = false;
    void els.callout.offsetWidth; /* paint the closed state before easing in */
    els.callout.classList.add("is-visible");
    if(calloutHideTimer){ clearTimeout(calloutHideTimer); calloutHideTimer = null; }
    calloutHideTimer = setTimeout(function(){ hideCallout(); }, CALLOUT_VISIBLE);
  }

  function hideCallout(immediate){
    if(calloutTimer){ clearTimeout(calloutTimer); calloutTimer = null; }
    if(calloutHideTimer){ clearTimeout(calloutHideTimer); calloutHideTimer = null; }
    if(!els.callout || els.callout.hidden) return;
    var node = els.callout;
    node.classList.remove("is-visible");
    if(immediate || reducedMotion()){
      node.hidden = true;
      return;
    }
    setTimeout(function(){
      if(!node.classList.contains("is-visible")) node.hidden = true;
    }, CALL_OUT_MS);
  }

  function scheduleCallout(){
    if(role !== "dock" || calloutShown || state.pinned) return;
    if(calloutTimer) clearTimeout(calloutTimer);
    calloutTimer = setTimeout(function(){
      calloutTimer = null;
      showCalloutNow();
    }, CALLOUT_DELAY);
  }

  function openDock(opts){
    opts = opts || {};
    if(role !== "dock") return;
    if(!els.card){
      /* API called before init finished: replay once the rail exists */
      pendingDock = "open";
      pendingDockOpts = opts;
      return;
    }
    /* opening always ends a live drag (END is posted exactly once) */
    endRailDrag({ postEnd:true, restart:false });
    if(state.dock === "open") return;

    /* opening the rail hides the bubble for the rest of this page load */
    calloutShown = true;
    hideCallout();

    if(dockTimer){ clearTimeout(dockTimer); dockTimer = null; }
    if(launcherTimer){ clearTimeout(launcherTimer); launcherTimer = null; }

    state.dock = "open";

    /* the launcher fades/scales out while the rail slides in */
    if(els.launcher){
      els.launcher.classList.remove("is-visible");
      els.launcher.setAttribute("aria-hidden", "true");
      var hideLauncher = function(){
        if(state.dock !== "open" || !els.launcher) return;
        els.launcher.hidden = true;
      };
      if(reducedMotion()) hideLauncher();
      else launcherTimer = setTimeout(hideLauncher, 140);
    }

    els.card.hidden = false;
    void els.card.offsetWidth; /* paint the offscreen state before sliding in */
    els.card.classList.add("is-open");
    updateMarquee();
    syncDockState();
    scheduleAutoHide();

    if(!opts.silent) toHost("RL_DOCK_STATE", { state:"open" });
    broadcastState();
  }

  function closeDock(opts){
    opts = opts || {};
    if(role !== "dock") return;
    if(!els.card){
      pendingDock = "collapsed";
      pendingDockOpts = null;
      return;
    }
    /* closing always ends a live drag before the card slides away */
    endRailDrag({ postEnd:true, restart:false });
    if(state.dock === "collapsed") return;

    /* the flyout cannot outlive the rail it is anchored to */
    if(state.active) closeSection();

    clearAutoHide();
    if(dockTimer){ clearTimeout(dockTimer); dockTimer = null; }
    if(launcherTimer){ clearTimeout(launcherTimer); launcherTimer = null; }

    state.dock = "collapsed";
    els.card.classList.remove("is-open");
    syncDockState();

    if(!opts.silent) toHost("RL_DOCK_STATE", { state:"collapsed" });
    broadcastState();

    var showLauncher = function(){
      if(state.dock !== "collapsed" || !els.card) return;
      els.card.hidden = true;
      if(!els.launcher) return;
      els.launcher.hidden = false;
      void els.launcher.offsetWidth;
      els.launcher.classList.add("is-visible");
      els.launcher.setAttribute("aria-hidden", "false");
    };
    if(reducedMotion()) showLauncher();
    else dockTimer = setTimeout(showLauncher, 240);
  }

  function sectionAllowed(section, mode){
    if(section === "backup" || section === "help") return true;
    if(mode === "compose") return section === "detail" || section === "page" || section === "desc" || section === "export";
    return section === "new" || section === "list";
  }

  /* ---------- shell v6: folder tools ---------- */

  function exportBehaviorLabel(){
    var value = app && app.exportBehavior ? app.exportBehavior : "default";
    if(value === "last") return lx("behaviorLast");
    if(value === "instant") return lx("behaviorInstant");
    return lx("behaviorDefault");
  }

  function folderValue(id){
    if(id === "root") return folderDirs.root || lx("browserDownloads");
    return folderDirs.export || lx("browserDownloads");
  }

  /* shell v9: one shared hint slot; a stale leave on the previous owner must
     not hide the hint that the newly hovered control just posted. */
  function postRailHint(owner, payload){
    if(role !== "dock" || !hasHost) return;
    if(!payload){
      if(railHintOwner && owner && railHintOwner !== owner) return;
      railHintOwner = null;
      postPanel("RL_HINT", { visible:false });
      return;
    }
    railHintOwner = owner || null;
    payload.visible = true;
    postPanel("RL_HINT", payload);
  }

  function folderHintContent(id){
    if(id === "rl-root-folder"){
      return { title:lx("rootDir"), lines:[folderValue("root")] };
    }
    return {
      title:lx("exportDir"),
      lines:[
        folderValue("export"),
        lx("behaviorTitle") + ": " + exportBehaviorLabel()
      ]
    };
  }

  function folderHintY(id){
    var btn = els.card ? els.card.querySelector("#" + id) : null;
    if(!btn) return 0;
    return Math.max(0, Math.round(btn.offsetTop));
  }

  function postFolderHint(id, visible){
    if(role !== "dock" || !hasHost) return;
    if(!id || !visible){
      postRailHint(null, null);
      return;
    }
    var btn = els.card ? els.card.querySelector("#" + id) : null;
    var content = folderHintContent(id);
    postRailHint(btn, {
      y:folderHintY(id),
      title:content.title,
      lines:content.lines
    });
  }

  /* the flyout owns the settings DOM; the dock asks it to focus the row.
     Retries cover a flyout iframe that is still booting on first open. */
  function requestFolderFocus(targetId){
    var selector = "#" + targetId;
    var send = function(){
      if(state.active !== "settings") return;
      channelPost({ type:"focus", selector:selector, tab:"system" });
    };
    send();
    [200, 550, 1100].forEach(function(delay){
      setTimeout(function(){
        if(state.active === "settings") send();
      }, delay);
    });
  }

  function openFolderSettings(targetId){
    if(role !== "dock") return;
    postFolderHint("", false);
    var btn = els.card ? els.card.querySelector('[data-section="settings"]') : null;
    if(state.active === "settings") refreshSection("settings");
    else openSection("settings", btn);
    requestFolderFocus(targetId);
  }

  function buildFolderButton(id, iconKey, label, targetId){
    var btn = h("button", "rail-btn rail-folder");
    btn.type = "button";
    btn.id = id;
    btn.innerHTML = ICONS[iconKey];
    btn.setAttribute("aria-label", label);
    btn.addEventListener("pointerenter", function(){ postFolderHint(id, true); });
    btn.addEventListener("pointerleave", function(){ postFolderHint(id, false); });
    btn.addEventListener("focus", function(){ postFolderHint(id, true); });
    btn.addEventListener("blur", function(){ postFolderHint(id, false); });
    btn.addEventListener("click", function(){ openFolderSettings(targetId); });
    return btn;
  }

  /* ---------- shell v7: ready-ratio ring ---------- */

  function statsData(){
    /* shell v11: derive the ring from the live app state; the peer counters
       (dockCount/dockReady) can lag behind after a save. */
    var total = 0;
    var ready = 0;
    var images = 0;
    var anyMissingRequired = false;
    if(app && Array.isArray(app.requests)){
      app.requests.forEach(function(req){
        if(!req) return;
        total++;
        if(statusOf(req) === "ready") ready++;
        if(Array.isArray(req.images)) images += req.images.length;
        if(statusOf(req) === "missing") anyMissingRequired = true;
      });
    }
    return {
      total: total,
      ready: ready,
      missing: Math.max(0, total - ready),
      pending: Math.max(0, total - ready),
      images: images,
      pct: total ? Math.round((ready / total) * 100) : 0,
      state: ready === total ? "ready" : (anyMissingRequired ? "missing" : "pending")
    };
  }

  function buildStats(){
    var wrap = h("div", "rail-stats");
    wrap.id = "rl-stats";
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "img");
    wrap.innerHTML =
      '<svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">' +
        '<circle class="rs-track" cx="24" cy="24" r="20" pathLength="100" fill="none"/>' +
        '<circle class="rs-ring" cx="24" cy="24" r="20" pathLength="100" fill="none" ' +
          'stroke-dasharray="0 100" transform="rotate(-90 24 24)"/>' +
      '</svg>' +
      '<span class="rs-pct">%0</span>';
    wrap.addEventListener("pointerenter", function(){ postStatsHint(true); });
    wrap.addEventListener("pointerleave", function(){ postStatsHint(false); });
    wrap.addEventListener("focus", function(){ postStatsHint(true); });
    wrap.addEventListener("blur", function(){ postStatsHint(false); });
    return wrap;
  }

  function updateStats(){
    if(role !== "dock") return;
    var node = els.stats || document.getElementById("rl-stats");
    if(!node) return;
    var data = statsData();
    var ring = node.querySelector(".rs-ring");
    if(ring) ring.setAttribute("stroke-dasharray", data.pct + " 100");
    var pct = node.querySelector(".rs-pct");
    if(pct) pct.textContent = "%" + data.pct;
    node.setAttribute("data-total", String(data.total));
    node.setAttribute("data-ready", String(data.ready));
    node.setAttribute("data-pct", String(data.pct));
    node.setAttribute("data-missing", String(data.missing));
    node.setAttribute("data-images", String(data.images));
    node.setAttribute("data-state", data.state);
    var label = lx("statsLabel", { total:data.total, ready:data.ready, pending:data.pending, pct:data.pct });
    node.setAttribute("aria-label", label);
  }

  function postStatsHint(visible){
    if(role !== "dock" || !hasHost) return;
    var owner = els.stats || document.getElementById("rl-stats");
    if(!visible){
      postRailHint(owner, null);
      return;
    }
    var data = statsData();
    postRailHint(owner, {
      y:els.stats ? Math.max(0, Math.round(els.stats.offsetTop)) : 0,
      title:lx("statsTitle"),
      lines:[
        lx("statTotal", { n:data.total }),
        lx("statReady", { n:data.ready }),
        lx("statPending", { n:data.pending }),
        lx("statPct", { n:data.pct })
      ],
      stats:{
        total:data.total,
        ready:data.ready,
        missing:data.missing,
        images:data.images,
        pct:data.pct,
        state:data.state
      }
    });
  }

  /* ---------- shell v8: active request title marquee ---------- */

  function buildMarquee(){
    var el = document.createElement("div");
    el.id = "rl-active-marquee";
    el.hidden = true;
    el.setAttribute("aria-label", "");
    var track = h("span", "rl-marquee-track");
    el.appendChild(track);

    marquee = {
      el:el, track:track, text:"", offset:0, width:0, textWidth:0,
      hold:0, last:0, dragging:false, pointerId:null, dragX:0, dragOffset:0
    };

    el.addEventListener("pointerdown", onMarqueeDown);
    el.addEventListener("pointermove", onMarqueeMove);
    el.addEventListener("pointerup", onMarqueeEnd);
    el.addEventListener("pointercancel", onMarqueeEnd);
    el.addEventListener("lostpointercapture", onMarqueeEnd);

    requestAnimationFrame(marqueeTick);
    return el;
  }

  function updateMarquee(){
    if(role !== "dock" || !marquee) return;
    /* shell v11: the marquee always carries the project name */
    var text = app && app.project ? String(app.project).trim() : "";
    if(!text){
      marquee.el.hidden = true;
      marquee.text = "";
      marquee.offset = 0;
      marquee.track.textContent = "";
      marquee.el.setAttribute("aria-label", "");
      return;
    }

    marquee.el.hidden = false;

    if(text !== marquee.text){
      marquee.text = text;
      marquee.track.textContent = text;
      marquee.el.setAttribute("aria-label", text);
      measureMarquee(true);
    }else{
      measureMarquee(false);
    }
  }

  /* shell v11: switch the rail between the project gate ("+ Yeni Proje")
     and the normal request menus without rebuilding on every message. */
  function syncProjectGate(force){
    if(role !== "dock" || !els.topGroup) return;
    var on = hasProjectName();
    if(!force && on === projectGateOn) return;
    projectGateOn = on;
    renderTopGroup();
  }

  function measureMarquee(reset){
    if(!marquee || marquee.el.hidden) return;
    marquee.width = marquee.el.clientWidth || 0;
    marquee.textWidth = marquee.track.scrollWidth || 0;
    if(reset){
      /* a new title starts at rest so the whole name is readable first */
      marquee.offset = 0;
      marquee.hold = 1.5;
    }
    if(!marquee.textWidth){
      marquee.offset = 0;
    }else if(marquee.offset > marquee.width){
      marquee.offset = marquee.width;
    }
    marquee.track.style.transform = "translateX(" + marquee.offset + "px)";
  }
