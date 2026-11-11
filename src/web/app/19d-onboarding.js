  /* ============================================================
     Onboarding + local server runtime

     First-run screen shown over the project picker exactly once. The
     choice and the extension toggle are stored per browser profile.
     When the page is served by scripts/serve.cjs, the app heartbeats so
     the server can stop itself after the last tab is gone. Stopping and
     restarting the server is not a page action: a browser cannot spawn a
     process, so a fully stopped server is started again with start.cmd.
     ============================================================ */

  const ONBOARDING_DONE_KEY = "rl-onboarding-v1";
  const ONBOARDING_MODE_KEY = "rl-mode-v1";
  const ONBOARDING_EXT_KEY = "rl-extension-companion-v1";
  const SERVER_HEARTBEAT_MS = 5000;
  const SERVER_PROBE_TIMEOUT_MS = 1600;
  const PORT_KEY = "rl-port";

  let onboardingOpen = false;
  let serverRestartTimer = null;
  const serverPageId = "pg_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);

  function serverLifecycleUrl(path){
    return path + "?page=" + encodeURIComponent(serverPageId);
  }
  let onboardingMode = "html";
  let onboardingServer = null;
  let onboardingExtensionOn = true;
  let onboardingExtensionState = "idle";
  let onboardingProbeTimer = null;
  let onboardingProbeCount = 0;
  let onboardingHeartbeatTimer = null;
  let onboardingServerLifecycle = false;
  let onboardingBridgeListener = false;

  function onboardingStored(key, fallback){
    try{
      const value = localStorage.getItem(key);
      return value == null ? fallback : value;
    }catch(err){
      return fallback;
    }
  }

  function onboardingStore(key, value){
    try{ localStorage.setItem(key, value); }catch(err){ /* quota */ }
  }

  function onboardingServerDetected(){
    return Boolean(onboardingServer && Number(onboardingServer.port));
  }

  function readStoredPort(){
    try{
      const raw = localStorage.getItem(PORT_KEY);
      if(raw == null || raw === "") return 0;
      const value = Number(raw);
      return Number.isInteger(value) && value >= 0 && value <= 65535 ? value : 0;
    }catch(err){
      return 0;
    }
  }

  function storePort(port){
    try{ localStorage.setItem(PORT_KEY, String(port)); }catch(err){ /* quota */ }
  }

  function normalisePort(value){
    const number = Number(String(value == null ? "" : value).trim());
    return Number.isInteger(number) && number >= 0 && number <= 65535 ? number : null;
  }

  function setPortStatus(text, warn){
    const status = $("#portStatus");
    if(!status) return;
    status.textContent = text || "";
    status.classList.toggle("is-warn", Boolean(warn));
  }

  function updateRailMode(){
    const label = $("#railModeLabel");
    if(!label) return;
    const sub = $("#railModeSub");
    const dot = $("#railModeDot");
    const server = onboardingServerDetected();
    if(server){
      const text = ":" + onboardingServer.port;
      label.textContent = text;
      label.title = translateString("Yerel sunucu") + " · " + text;
      if(sub) sub.textContent = translateString("Yerel sunucu");
    }else{
      const text = translateString("Dosya");
      label.textContent = text;
      label.title = translateString("Dosyadan başlatıldı");
      if(sub) sub.textContent = window.location.protocol === "file:"
        ? translateString("Dosyadan başlatıldı")
        : translateString("Sunucu yok");
    }
    if(dot) dot.classList.toggle("is-on", server);
    const mode = $("#railMode");
    if(mode) mode.setAttribute("data-server", server ? "on" : "off");
  }

  function renderServerRuntimeUi(){
    updateRailMode();
    const input = $("#settingsPort");
    if(input && document.activeElement !== input){
      input.value = String(readStoredPort());
      input.classList.remove("is-invalid");
    }
    const restart = $("#restartServerBtn");
    if(restart) restart.hidden = !onboardingServerDetected();
    if(onboardingServerDetected()){
      setPortStatus(translateString("Yerel sunucu") + " · :" + onboardingServer.port);
    }else{
      setPortStatus(translateString("Sunucu için start.cmd çalıştır."));
    }
  }

  /* A port change is silent: the running server spawns the replacement and the
     browser data is flushed to the shared disk first. No warning modal and no
     origin prompt: the page simply navigates to the served URL. */
  async function rebindServer(port, fromPort){
    const oldPort = Number(fromPort) || (onboardingServer ? onboardingServer.port : 0);
    setPortStatus(translateString("Sunucu yeniden başlatılıyor."));
    try{
      if(typeof serverFlushAllProjects === "function"){
        await serverFlushAllProjects().catch(function(){ /* disk hydrate handles it */ });
      }
      if(activeProjectId) saveNow();
      const response = await fetch("/__rl/rebind?port=" + encodeURIComponent(String(port)), {
        method: "POST",
        cache: "no-store",
        keepalive: true
      });
      let data = null;
      try{ data = await response.json(); }catch(err){ data = null; }
      if(!response.ok || !data || data.ok !== true){
        const reason = response.status === 409
          ? translateString("Bu port zaten kullanımda.")
          : response.status === 400
            ? translateString("Port 0 ile 65535 arasında bir tam sayı olmalı.")
            : translateString("Port değiştirilemedi; sunucu çalışmaya devam ediyor.");
        setPortStatus(reason, true);
        showToast(reason, "error");
        return;
      }
      const nextPort = Number(data.port);
      const nextUrl = typeof data.url === "string" ? data.url : "";
      storePort(port);
      if(typeof serverConfigPost === "function") serverConfigPost({ port:nextPort });
      onboardingServer = null;
      stopServerHeartbeat();
      updateRailMode();
        setPortStatus(
        translateString("Sunucu yeniden başlatılıyor.") +
        (Number.isInteger(nextPort) && nextPort > 0 ? " · :" + nextPort : "")
      );
      showToast(translateString("Sunucu yeniden başlatılıyor."));
      if(nextUrl){
        setTimeout(function(){
          try{ window.location.href = nextUrl; }catch(err){ /* ignore */ }
        }, 250);
      }
    }catch(err){
      const reason = translateString("Port değiştirilemedi; sunucu çalışmaya devam ediyor.");
      setPortStatus(reason, true);
      showToast(reason, "error");
    }
  }

  async function applyPortSetting(){
    const input = $("#settingsPort");
    const port = normalisePort(input ? input.value : "");
    if(port == null){
      if(input){
        input.classList.add("is-invalid");
        try{ input.focus(); }catch(err){ /* ignore */ }
      }
      setPortStatus(translateString("Port 0 ile 65535 arasında bir tam sayı olmalı."), true);
      return;
    }
    if(input){
      input.classList.remove("is-invalid");
      input.value = String(port);
    }
    if(!onboardingServerDetected()){
      storePort(port);
      setPortStatus(translateString("Dosya modunda sunucu yok. Sunucu için start.cmd çalıştır."));
      showToast(translateString("Sunucu için start.cmd çalıştır."));
      return;
    }
    if(port === onboardingServer.port){
      storePort(port);
      setPortStatus(translateString("Port kaydedildi.") + " · :" + port);
      showToast(translateString("Port kaydedildi."));
      return;
    }
    const fromPort = onboardingServer.port;
    /* Silent + lossless: flush this origin's browser data to disk, save, move. */
    if(activeProjectId) saveNow();
    rebindServer(port, fromPort);
  }

  function onboardingDefaultMode(){
    return onboardingServerDetected() ? "server" : "html";
  }

  function onboardingCommand(){
    return "start.cmd\nnode scripts/serve.cjs --port 0 --open";
  }

  function onboardingBridgePossible(){
    try{ return bridgeOriginAllowed(window.location.origin); }
    catch(err){ return false; }
  }

  async function probeLocalServer(){
    if(window.location.protocol !== "http:" && window.location.protocol !== "https:"){
      onboardingServer = null;
      return null;
    }
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(function(){
      if(controller){ try{ controller.abort(); }catch(err){ /* ignore */ } }
    }, SERVER_PROBE_TIMEOUT_MS);
    try{
      const response = await fetch("/__rl/status", {
        method: "GET",
        cache: "no-store",
        signal: controller ? controller.signal : undefined
      });
      if(!response.ok) throw new Error("not a ledger server");
      const data = await response.json();
      if(!data || data.app !== "request-ledger" || data.server !== true || !Number(data.port)){
        throw new Error("not a ledger server");
      }
      onboardingServer = {
        port: Number(data.port),
        url: typeof data.url === "string" && data.url ? data.url : window.location.origin + window.location.pathname
      };
      storePort(onboardingServer.port);
      return onboardingServer;
    }catch(err){
      onboardingServer = null;
      return null;
    }finally{
      clearTimeout(timer);
    }
  }

  function sendServerPageHide(){
    if(!onboardingServerDetected()) return;
    try{
      if(navigator.sendBeacon){
        navigator.sendBeacon(serverLifecycleUrl("/__rl/pagehide"));
        return;
      }
    }catch(err){ /* fall through */ }
    try{
      fetch(serverLifecycleUrl("/__rl/pagehide"), { method:"POST", cache:"no-store", keepalive:true }).catch(function(){ /* ignore */ });
    }catch(err){ /* ignore */ }
  }

  function startServerHeartbeat(){
    if(onboardingHeartbeatTimer || !onboardingServerDetected()) return;
    const beat = function(){
      if(!onboardingServerDetected()) return;
      try{
        fetch(serverLifecycleUrl("/__rl/heartbeat"), { method:"POST", cache:"no-store", keepalive:true }).catch(function(){ /* ignore */ });
      }catch(err){ /* ignore */ }
    };
    beat();
    onboardingHeartbeatTimer = setInterval(beat, SERVER_HEARTBEAT_MS);
    if(!onboardingServerLifecycle){
      onboardingServerLifecycle = true;
      /* Background tabs throttle timers; a visible tab re-announces itself at
         once. pagehide only marks the server as page-less; the 5-minute grace
         covers a reload or a quick navigation. */
      document.addEventListener("visibilitychange", function(){
        if(document.visibilityState === "visible") beat();
      });
      window.addEventListener("pageshow", beat);
      window.addEventListener("pagehide", sendServerPageHide);
    }
  }

  function stopServerHeartbeat(){
    if(!onboardingHeartbeatTimer) return;
    clearInterval(onboardingHeartbeatTimer);
    onboardingHeartbeatTimer = null;
  }

  function stopServerRestartWatch(){
    if(!serverRestartTimer) return;
    clearInterval(serverRestartTimer);
    serverRestartTimer = null;
  }

  /* In-place restart: the live server spawns its replacement on the same
     port and exits. The current page must not navigate until the
     replacement answers, so poll for a new pid and reload once it is live. */
  function startServerRestartWatch(oldPid){
    stopServerRestartWatch();
    const previousPid = Number(oldPid) || 0;
    const startedAt = Date.now();
    const hint = $("#portStatus");
    if(hint) hint.textContent = translateString("Sunucu yeniden başlatılıyor.");
    serverRestartTimer = setInterval(function(){
      fetch("/__rl/status", { method:"GET", cache:"no-store" }).then(function(response){
        if(!response.ok) return null;
        return response.json();
      }).then(function(data){
        if(!data || data.app !== "request-ledger" || data.server !== true) return;
        if(previousPid && Number(data.pid) === previousPid) return;
        stopServerRestartWatch();
        if(hint) hint.textContent = translateString("Sunucu yeniden başladı; bağlanılıyor");
        try{ window.location.reload(); }catch(err){ /* ignore */ }
      }).catch(function(){ /* the replacement is not listening yet */ });
      if(Date.now() - startedAt > 20000){
        stopServerRestartWatch();
        const reason = translateString("Sunucu yeniden başlamadı. start.cmd çalıştır.");
        if(hint) hint.textContent = reason;
        showToast(reason, "error");
      }
    }, 500);
  }

  async function restartServer(){
    if(!onboardingServerDetected()){
      showToast(translateString("Yerel sunucu bulunamadı."), "error");
      return;
    }
    const oldPid = Number(onboardingServer.pid) || 0;
    cancelScheduledSave();
    saveNow();
    setPortStatus(translateString("Sunucu yeniden başlatılıyor."));
    try{
      const response = await fetch("/__rl/rebind?restart=1", {
        method:"POST",
        cache:"no-store",
        keepalive:true
      });
      let data = null;
      try{ data = await response.json(); }catch(err){ data = null; }
      if(!response.ok || !data || data.ok !== true || data.restarting !== true){
        const reason = translateString("Sunucu yeniden başlatılamadı.");
        setPortStatus(reason, true);
        showToast(reason, "error");
        return;
      }
      stopServerHeartbeat();
      onboardingServer = null;
      const restartBtn = $("#restartServerBtn");
      if(restartBtn) restartBtn.hidden = true;
      showToast(translateString("Sunucu yeniden başlatılıyor."));
      startServerRestartWatch(oldPid);
    }catch(err){
      const reason = translateString("Sunucu yeniden başlatılamadı.");
      setPortStatus(reason, true);
      showToast(reason, "error");
    }
  }

  function onboardingBeforeUnload(event){
    if(!onboardingServerDetected()) return;
    if(!activeProjectId || !isProjectDirty()) return;
    event.preventDefault();
    event.returnValue = "";
  }

  function renderOnboarding(){
    const modal = $("#onboardingModal");
    if(!modal) return;

    $$('input[name="onboardMode"]', modal).forEach(function(radio){
      radio.checked = radio.value === onboardingMode;
    });

    const modeText = $("#onboardModeText");
    const serverStatus = $("#onboardServerStatus");
    const serverText = $("#onboardServerText");
    const hint = $("#onboardServerHint");
    const actions = $("#onboardServerActions");
    const openBtn = $("#onboardOpenServerBtn");
    const cmd = $("#onboardCmdText");
    if(cmd) cmd.textContent = onboardingCommand();

    if(serverStatus && serverText){
      serverStatus.hidden = onboardingMode !== "server";
      serverStatus.classList.remove("is-on", "is-warn");
      if(onboardingServerDetected()){
        serverStatus.classList.add("is-on");
        serverText.textContent = translateString("Yerel sunucu çalışıyor · localhost:" + onboardingServer.port);
      }else{
        serverStatus.classList.add("is-warn");
        serverText.textContent = translateString("Yerel sunucu çalışmıyor. Sunucu modu için start.cmd çalıştır.");
      }
    }

    if(modeText){
      if(onboardingMode === "server"){
        modeText.textContent = translateString(onboardingServerDetected()
          ? "Yerel sunucu modundasın. Sekme açıkken sunucu kapanmaz; sekme kapandıktan sonra en az 5 dakika bekler."
          : "Yerel sunucu çalışmıyor. Sunucu modu için start.cmd çalıştır.");
      }else{
        modeText.textContent = translateString("Tek dosya modundasın. Bu sayfa yerel sunucu başlatamaz; sunucu modu için aşağıdaki komutu çalıştır.");
      }
    }

    if(hint){
      if(onboardingMode === "html"){
        hint.textContent = translateString("HTML dosyası yerel sunucu başlatamaz; komut yalnızca sunucu modu içindir.");
      }else{
        hint.textContent = onboardingServerDetected()
          ? translateString("Sunucu bu sayfayı yerel adresten sunuyor. Sunucu, son sekme kapandıktan sonra kendiliğinden durur.")
          : translateString("Yerel sunucu çalışmıyor. Sunucu modu için start.cmd çalıştır.");
      }
    }

    if(actions) actions.hidden = onboardingMode !== "server";
    if(openBtn) openBtn.hidden = !onboardingServerDetected();

    const toggle = $("#onboardExtensionToggle");
    if(toggle) toggle.checked = onboardingExtensionOn;

    const status = $("#onboardExtensionStatus");
    const text = $("#onboardExtensionText");
    if(status && text){
      status.classList.remove("is-on", "is-warn");
      if(!onboardingExtensionOn){
        text.textContent = translateString("Eklenti yardımcısı kapalı.");
      }else if(onboardingExtensionState === "connected"){
        status.classList.add("is-on");
        text.textContent = translateString("Bağlı");
      }else if(onboardingExtensionState === "probing"){
        text.textContent = translateString("Eklenti aranıyor…");
      }else if(onboardingExtensionState === "blocked"){
        status.classList.add("is-warn");
        text.textContent = translateString("Bu sayfa köprüye izin vermiyor; eklentiyı sunucu modunda dene.");
      }else{
        status.classList.add("is-warn");
        text.textContent = translateString("Bulunamadı");
      }
    }
    updateRailMode();
  }

  function stopOnboardingProbe(){
    if(onboardingProbeTimer){
      clearInterval(onboardingProbeTimer);
      onboardingProbeTimer = null;
    }
  }

  function sendOnboardingProbe(){
    try{
      window.postMessage({
        source: "request-ledger-web",
        type: "RL_APP_ACK",
        v: 1,
        appVersion: APP_VERSION,
        rev: Number(state.rev) || 0,
        ledgerId: state.ledgerId,
        projectId: "",
        projectName: "",
        heartbeat: true
      }, window.location.origin);
      return true;
    }catch(err){
      return false;
    }
  }

  function probeExtensionBridge(){
    if(!onboardingOpen) return;
    if(!onboardingExtensionOn){
      onboardingExtensionState = "disabled";
      stopOnboardingProbe();
      renderOnboarding();
      return;
    }
    if(!onboardingBridgePossible()){
      onboardingExtensionState = "blocked";
      stopOnboardingProbe();
      renderOnboarding();
      return;
    }
    if(onboardingExtensionState === "connected") return;
    onboardingExtensionState = "probing";
    onboardingProbeCount = 1;
    renderOnboarding();
    if(!sendOnboardingProbe()){
      onboardingExtensionState = "missing";
      renderOnboarding();
      return;
    }
    stopOnboardingProbe();
    onboardingProbeTimer = setInterval(function(){
      if(!onboardingOpen || onboardingExtensionState === "connected" || !onboardingExtensionOn){
        stopOnboardingProbe();
        return;
      }
      if(onboardingProbeCount >= 5){
        stopOnboardingProbe();
        onboardingExtensionState = "missing";
        renderOnboarding();
        return;
      }
      onboardingProbeCount += 1;
      sendOnboardingProbe();
    }, 1500);
  }

  function onOnboardingBridgeMessage(event){
    if(!onboardingOpen) return;
    if(event.source !== window) return;
    if(event.origin !== window.location.origin) return;
    const data = event.data;
    if(!data || typeof data !== "object") return;
    if(data.source !== "request-ledger-host") return;
    if(data.v !== 1) return;
    if(typeof data.type !== "string" || data.type.indexOf("RL_APP_") !== 0) return;
    if(data.type === "RL_APP_BYE") return;
    onboardingExtensionState = "connected";
    stopOnboardingProbe();
    renderOnboarding();
  }

  function markOnboardingSeen(){
    onboardingStore(ONBOARDING_DONE_KEY, "1");
    if(!onboardingOpen) return;
    onboardingOpen = false;
    stopOnboardingProbe();
  }

  function openOnboarding(){
    onboardingOpen = true;
    onboardingProbeCount = 0;
    const storedMode = onboardingStored(ONBOARDING_MODE_KEY, "");
    onboardingMode = storedMode === "server" || storedMode === "html" ? storedMode : onboardingDefaultMode();
    onboardingExtensionOn = onboardingStored(ONBOARDING_EXT_KEY, "1") !== "0";
    onboardingExtensionState = onboardingExtensionOn ? "idle" : "disabled";
    renderOnboarding();
    openModal($("#onboardingModal"));
    probeExtensionBridge();
  }

  function finishOnboarding(){
    if(onboardingMode !== "server" && onboardingMode !== "html") onboardingMode = onboardingDefaultMode();
    onboardingStore(ONBOARDING_MODE_KEY, onboardingMode);
    onboardingStore(ONBOARDING_EXT_KEY, onboardingExtensionOn ? "1" : "0");
    onboardingStore(ONBOARDING_DONE_KEY, "1");
    onboardingOpen = false;
    stopOnboardingProbe();
    closeModal($("#onboardingModal"));
  }

  async function copyOnboardingCommand(){
    let copied = false;
    try{ copied = await copyTextToClipboard(onboardingCommand()); }
    catch(err){ copied = false; }
    showToast(translateString(copied ? "Komut kopyalandı." : "Komut kopyalanamadı."), copied ? "ok" : "error");
  }

  function initOnboarding(){
    /* A silent rebind navigates to the new port; carry the chosen port so the
       Settings field shows it. No origin/moved prompt is involved. */
    try{
      const query = new URLSearchParams(window.location.search);
      const queryPort = query.get("rl-port");
      if(queryPort != null){
        const parsedPort = normalisePort(queryPort);
        if(parsedPort != null) storePort(parsedPort);
      }
    }catch(err){ /* ignore */ }
    onboardingExtensionOn = onboardingStored(ONBOARDING_EXT_KEY, "1") !== "0";
    const storedMode = onboardingStored(ONBOARDING_MODE_KEY, "");
    onboardingMode = storedMode === "server" || storedMode === "html" ? storedMode : onboardingDefaultMode();

    const modal = $("#onboardingModal");
    if(modal){
      modal.addEventListener("click", function(event){
        if(event.target.closest("[data-close-modal]")) finishOnboarding();
      });
      $$('input[name="onboardMode"]', modal).forEach(function(radio){
        radio.addEventListener("change", function(){
          if(!radio.checked) return;
          onboardingMode = radio.value === "server" ? "server" : "html";
          onboardingStore(ONBOARDING_MODE_KEY, onboardingMode);
          renderOnboarding();
        });
      });
    }

    const done = $("#onboardingDoneBtn");
    if(done) done.addEventListener("click", finishOnboarding);
    const copy = $("#onboardCopyCmd");
    if(copy) copy.addEventListener("click", copyOnboardingCommand);
    const openServer = $("#onboardOpenServerBtn");
    if(openServer) openServer.addEventListener("click", function(){
      if(onboardingServer && onboardingServer.url){
        try{ window.open(onboardingServer.url, "_blank", "noopener"); }catch(err){ /* ignore */ }
      }
    });
    const toggle = $("#onboardExtensionToggle");
    if(toggle) toggle.addEventListener("change", function(){
      onboardingExtensionOn = toggle.checked;
      onboardingStore(ONBOARDING_EXT_KEY, onboardingExtensionOn ? "1" : "0");
      onboardingExtensionState = onboardingExtensionOn ? "idle" : "disabled";
      renderOnboarding();
      if(onboardingExtensionOn) probeExtensionBridge();
      else stopOnboardingProbe();
    });
    const settingsOpen = $("#openOnboardingBtn");
    if(settingsOpen) settingsOpen.addEventListener("click", openOnboarding);

    const restartServerBtn = $("#restartServerBtn");
    if(restartServerBtn) restartServerBtn.addEventListener("click", restartServer);
    const applyPort = $("#applyPortBtn");
    if(applyPort) applyPort.addEventListener("click", applyPortSetting);
    const portInput = $("#settingsPort");
    if(portInput){
      portInput.addEventListener("input", function(){ portInput.classList.remove("is-invalid"); });
      portInput.addEventListener("keydown", function(event){
        if(event.key === "Enter"){ event.preventDefault(); applyPortSetting(); }
      });
    }
    if(!onboardingBridgeListener){
      onboardingBridgeListener = true;
      window.addEventListener("message", onOnboardingBridgeMessage);
    }
    window.addEventListener("beforeunload", onboardingBeforeUnload);

    probeLocalServer().then(function(found){
      if(found){
          startServerHeartbeat();
      }
      renderOnboarding();
      renderServerRuntimeUi();
      if(onboardingStored(ONBOARDING_DONE_KEY, "") !== "1"){
        openOnboarding();
      }
    }).catch(function(){ /* ignore */ });
  }
