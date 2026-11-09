  /* ============================================================
     Onboarding + local server runtime

     First-run screen shown over the project picker exactly once. The
     choice and the extension toggle are stored per browser profile.
     When the page is served by scripts/serve.cjs, the app heartbeats so
     the server can stop itself after the tab is gone, and it can ask the
     server to shut down explicitly.
     ============================================================ */

  const ONBOARDING_DONE_KEY = "rl-onboarding-v1";
  const ONBOARDING_MODE_KEY = "rl-mode-v1";
  const ONBOARDING_EXT_KEY = "rl-extension-companion-v1";
  const SERVER_HEARTBEAT_MS = 5000;
  const SERVER_PROBE_TIMEOUT_MS = 1600;
  const PORT_KEY = "rl-port";

  let onboardingOpen = false;
  let serverStopNotice = false;
  let serverReconnectTimer = null;
  let pendingPortMove = null;
  let movedFromPort = null;
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
    const stop = $("#railStopBtn");
    const server = onboardingServerDetected();
    if(server){
      const text = translateString("Sunucu") + " · :" + onboardingServer.port;
      label.textContent = text;
      label.title = text;
      if(sub) sub.textContent = translateString("Yerel sunucu");
    }else{
      const text = translateString("Dosya");
      label.textContent = text;
      label.title = text;
      if(sub){
        sub.textContent = window.location.protocol === "file:"
          ? translateString("Dosyadan başlatıldı")
          : (serverStopNotice ? translateString("Sunucu durduruldu.") : translateString("Sunucu çalışmıyor."));
      }
    }
    if(dot) dot.classList.toggle("is-on", server);
    if(stop) stop.hidden = !server;
  }

  function updateServerStopNote(){
    const note = $("#serverStopNote");
    if(!note) return;
    note.hidden = !serverStopNotice;
    if(serverStopNotice){
      try{ note.scrollIntoView({ block: "center", behavior: "smooth" }); }catch(err){ /* ignore */ }
    }
  }

  function renderServerRuntimeUi(){
    updateRailMode();
    updateServerStopNote();
    const input = $("#settingsPort");
    if(input && document.activeElement !== input){
      input.value = String(readStoredPort());
      input.classList.remove("is-invalid");
    }
    if(onboardingServerDetected()){
      setPortStatus(translateString("Yerel sunucu") + " · :" + onboardingServer.port);
    }else{
      setPortStatus(translateString("Sunucu için start.cmd çalıştır."));
    }
  }

  function openPortMoveWarning(port, fromPort){
    pendingPortMove = { port: port, fromPort: fromPort };
    const title = $("#portMoveTitle");
    if(title) title.textContent = translateString("Port değişikliği yeni bir tarayıcı kaynağı açar.");
    const message = $("#portMoveMessage");
    if(message){
      message.textContent =
        translateString("Projeler ve defterler tarayıcı kaynağı başına saklanır. Mevcut veriler şurada kalır:") + " :" + fromPort + ". " +
        translateString("Yeni port şurada boş başlar:") + " :" + port + ". " +
        translateString("Önce yedek indirip yeni portta geri yükle.");
    }
    const detail = $("#portMoveDetail");
    if(detail) detail.textContent = translateString("Yeni kaynakta geri yükleme istemi açılır.");
    openModal($("#portMoveModal"));
  }

  function openPortMoveWithoutBackup(port, fromPort){
    openConfirm({
      eyebrow: translateString("Port"),
      title: translateString("Yedeksiz geçilsin mi?"),
      message:
        translateString("Yeni port boş bir defterle açılır. Mevcut veriler şurada kalır:") + " :" + fromPort + ". " +
        translateString("Bu işlem geri alınamaz."),
      confirmLabel: translateString("Yedeksiz geç"),
      cancelLabel: translateString("Vazgeç"),
      danger: true,
      onConfirm: async function(){ await rebindServer(port, fromPort); }
    });
  }

  function openMovedPortPrompt(oldPort){
    const title = $("#movedPortTitle");
    if(title) title.textContent = translateString("Bu portun yeni bir kaynağı var.");
    const text = $("#movedPortText");
    if(text) text.textContent = translateString("Az önce indirdiğin yedek ZIP dosyasını geri yükle.");
    const detail = $("#movedPortDetail");
    if(detail) detail.textContent = translateString("Önceki projeler ve defterler şurada kalır:") + " :" + oldPort + ".";
    openModal($("#movedPortModal"));
  }

  function clearMoveQuery(){
    try{
      const url = new URL(window.location.href);
      url.searchParams.delete("rl-moved");
      url.searchParams.delete("rl-port");
      const search = url.searchParams.toString();
      window.history.replaceState(null, "", url.pathname + (search ? "?" + search : "") + url.hash);
    }catch(err){ /* ignore */ }
  }

  function initPortMoveUi(){
    const backupBtn = $("#portMoveBackupBtn");
    if(backupBtn) backupBtn.addEventListener("click", async function(){
      const move = pendingPortMove;
      closeModal($("#portMoveModal"));
      if(!move) return;
      setPortStatus(translateString("Yedek hazırlanıyor…"));
      const ok = await downloadBackupZip(true);
      if(!ok){
        setPortStatus(translateString("Yedek oluşturulamadı."), true);
        showToast(translateString("Yedek oluşturulamadı."), "error");
        return;
      }
      await rebindServer(move.port, move.fromPort);
    });
    const noBackupBtn = $("#portMoveNoBackupBtn");
    if(noBackupBtn) noBackupBtn.addEventListener("click", function(){
      const move = pendingPortMove;
      closeModal($("#portMoveModal"));
      if(!move) return;
      openPortMoveWithoutBackup(move.port, move.fromPort);
    });
    const movedRestore = $("#movedPortRestoreBtn");
    if(movedRestore) movedRestore.addEventListener("click", function(){
      const input = $("#restoreInput");
      if(input) input.click();
    });
  }

  async function rebindServer(port, fromPort){
    const oldPort = Number(fromPort) || (onboardingServer ? onboardingServer.port : 0);
    setPortStatus(translateString("Sunucu yeniden başlatılıyor."));
    try{
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
            : translateString("Port uygulanamadı.");
        setPortStatus(reason, true);
        showToast(reason, "error");
        return;
      }
      const nextPort = Number(data.port);
      let nextUrl = typeof data.url === "string" ? data.url : "";
      if(nextUrl && oldPort > 0 && !/[?&]rl-moved=/.test(nextUrl)){
        nextUrl += (nextUrl.indexOf("?") >= 0 ? "&" : "?") + "rl-moved=" + oldPort;
      }
      storePort(port);
      onboardingServer = null;
      stopServerHeartbeat();
      serverStopNotice = false;
      updateRailMode();
      updateServerStopNote();
      setPortStatus(
        translateString("Sunucu yeniden başlatılıyor.") +
        (Number.isInteger(nextPort) && nextPort > 0 ? " · :" + nextPort : "")
      );
      showToast(translateString("Sunucu yeniden başlatılıyor."));
      if(nextUrl){
        setTimeout(function(){
          try{ window.location.href = nextUrl; }catch(err){ /* ignore */ }
        }, 900);
      }
    }catch(err){
      const reason = translateString("Port uygulanamadı.");
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
    const startMove = function(){ openPortMoveWarning(port, fromPort); };
    if(activeProjectId && isProjectDirty()){
      openConfirm({
        eyebrow: translateString("Kurulum"),
        title: translateString("Kaydedilmemiş değişiklikler"),
        message: translateString("Portu uygulamadan önce bu projede kaydedilmemiş değişiklikler var. Kaydetmek ister misin?"),
        confirmLabel: translateString("Kaydet ve uygula"),
        altLabel: translateString("Kaydetmeden uygula"),
        cancelLabel: translateString("Vazgeç"),
        onConfirm: async function(){
          cancelScheduledSave();
          saveNow();
          startMove();
        },
        onAlt: async function(){
          cancelScheduledSave();
          startMove();
        }
      });
      return;
    }
    startMove();
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
      const fallbackFrom = normalisePort(data.fallbackFromPort);
      if(fallbackFrom != null && fallbackFrom > 0 && fallbackFrom !== onboardingServer.port){
        movedFromPort = fallbackFrom;
      }
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
        navigator.sendBeacon("/__rl/pagehide");
        return;
      }
    }catch(err){ /* fall through */ }
    try{
      fetch("/__rl/pagehide", { method:"POST", cache:"no-store", keepalive:true }).catch(function(){ /* ignore */ });
    }catch(err){ /* ignore */ }
  }

  function startServerHeartbeat(){
    if(onboardingHeartbeatTimer || !onboardingServerDetected()) return;
    const beat = function(){
      if(!onboardingServerDetected()) return;
      try{
        fetch("/__rl/heartbeat", { method:"POST", cache:"no-store", keepalive:true }).catch(function(){ /* ignore */ });
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

  function stopServerReconnectWatch(){
    if(!serverReconnectTimer) return;
    clearInterval(serverReconnectTimer);
    serverReconnectTimer = null;
  }

  /* The page is still in the browser's cache after the server stops. Poll the
     same origin and reload as soon as start.cmd brings the same port back, so
     the pair reconnects automatically instead of asking the user to refresh. */
  function startServerReconnectWatch(stoppedPid){
    if(serverReconnectTimer) return;
    const previousPid = Number(stoppedPid) || 0;
    /* The user asked for a stop and the shutdown request succeeded, so the old
       process is expected to be gone. The pid check still protects the case
       where it lingers; the first poll is delayed past the shutdown window. */
    const hint = $("#serverBlockedHint");
    if(hint) hint.textContent = translateString("Sunucu bekleniyor; yeniden başlatılınca otomatik bağlanılacak.");
    serverReconnectTimer = setInterval(function(){
      if(!serverBlocked) return;
      fetch("/__rl/status", { method:"GET", cache:"no-store" }).then(function(response){
        if(!response.ok) return null;
        return response.json();
      }).then(function(data){
        if(!serverBlocked) return;
        if(!data || data.app !== "request-ledger" || data.server !== true) return;
        /* The old process can answer for a moment while it closes. With a
           known pid only a different pid is the restarted server. */
        if(previousPid && Number(data.pid) === previousPid) return;
        stopServerReconnectWatch();
        if(hint) hint.textContent = translateString("Sunucu yeniden başladı; bağlanılıyor…");
        try{ window.location.reload(); }catch(err){ /* ignore */ }
      }).catch(function(){ /* server not back yet */ });
    }, 3000);
  }

  function setServerBlocked(blocked){
    serverBlocked = blocked === true;
    const overlay = $("#serverBlocked");
    const main = document.getElementById("main");
    const header = document.querySelector("header");
    const footer = document.querySelector("footer");
    if(main) main.inert = serverBlocked;
    if(header) header.inert = serverBlocked;
    if(footer) footer.inert = serverBlocked;
    document.body.classList.toggle("is-server-blocked", serverBlocked);
    if(overlay){
      overlay.hidden = !serverBlocked;
      if(serverBlocked){
        const retry = $("#serverBlockedRetry");
        try{ (retry || overlay).focus(); }catch(err){ /* ignore */ }
      }
    }
    if(!serverBlocked){
      stopServerReconnectWatch();
    }
  }

  async function sendServerShutdown(){
    let stopped = false;
    let stoppedPid = 0;
    try{
      const before = await fetch("/__rl/status", { method:"GET", cache:"no-store" });
      if(before.ok){
        const info = await before.json();
        stoppedPid = Number(info && info.pid) || 0;
      }
    }catch(err){ /* the shutdown below reports the failure */ }
    try{
      const response = await fetch("/__rl/shutdown", { method:"POST", cache:"no-store", keepalive:true });
      stopped = response.ok;
    }catch(err){
      stopped = false;
    }
    if(!stopped){
      try{ stopped = navigator.sendBeacon ? navigator.sendBeacon("/__rl/shutdown") : false; }
      catch(err){ stopped = false; }
    }
    if(stopped){
      /* Tell the connected panels before the bridge is disabled. The stop is
         deliberate: the app becomes blocked, the bridge sends nothing, and the
         panel switches to "App server stopped". */
      try{ if(typeof bridgeAnnounceServerStop === "function") bridgeAnnounceServerStop(); }catch(err){ /* ignore */ }
      try{ if(typeof bridgeSetServerStopped === "function") bridgeSetServerStopped(true); }catch(err){ /* ignore */ }
      onboardingServer = null;
      serverStopNotice = true;
      stopServerHeartbeat();
      setServerBlocked(true);
      startServerReconnectWatch(stoppedPid);
      renderOnboarding();
      updateRailMode();
      updateServerStopNote();
      showToast(translateString("Sunucu durduruldu. Yeniden başlatmak için start.cmd çalıştır."));
    }else{
      showToast(translateString("Yerel sunucu bulunamadı."), "error");
    }
  }

  function stopLocalServer(){
    if(!onboardingServerDetected()){
      showToast(translateString("Yerel sunucu bulunamadı."), "error");
      return;
    }
    if(activeProjectId && isProjectDirty()){
      openConfirm({
        eyebrow: translateString("Kurulum"),
        title: translateString("Kaydedilmemiş değişiklikler"),
        message: translateString("Sunucuyu durdurmadan önce bu projede kaydedilmemiş değişiklikler var. Kaydetmek ister misin?"),
        confirmLabel: translateString("Kaydet ve durdur"),
        altLabel: translateString("Kaydetmeden durdur"),
        cancelLabel: translateString("Vazgeç"),
        onConfirm: async function(){
          cancelScheduledSave();
          saveNow();
          await sendServerShutdown();
        },
        onAlt: async function(){
          cancelScheduledSave();
          await sendServerShutdown();
        }
      });
      return;
    }
    openConfirm({
      eyebrow: translateString("Kurulum"),
      title: translateString("Sunucu durdurulsun mu?"),
      message: translateString("Yerel sunucu kapanacak. Defter tarayıcıda kalır; yeniden başlatmak için start.cmd çalıştır."),
      confirmLabel: translateString("Sunucuyu durdur"),
      cancelLabel: translateString("Vazgeç"),
      danger: true,
      onConfirm: async function(){ await sendServerShutdown(); }
    });
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
    const stopBtn = $("#onboardStopServerBtn");
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
          ? translateString("Sunucu bu sayfayı yerel adresten sunuyor. Kapatmak için Sunucuyu durdur.")
          : translateString("Yerel sunucu çalışmıyor. Sunucu modu için start.cmd çalıştır.");
      }
    }

    if(actions) actions.hidden = onboardingMode !== "server";
    if(openBtn) openBtn.hidden = !onboardingServerDetected();
    if(stopBtn) stopBtn.hidden = !onboardingServerDetected();

    const toggle = $("#onboardExtensionToggle");
    if(toggle) toggle.checked = onboardingExtensionOn;

    const status = $("#onboardExtensionStatus");
    const text = $("#onboardExtensionText");
    if(status && text){
      status.classList.remove("is-on", "is-warn");
      if(!onboardingExtensionOn){
        text.textContent = translateString("Uzantı yardımcısı kapalı.");
      }else if(onboardingExtensionState === "connected"){
        status.classList.add("is-on");
        text.textContent = translateString("Bağlı");
      }else if(onboardingExtensionState === "probing"){
        text.textContent = translateString("Uzantı aranıyor…");
      }else if(onboardingExtensionState === "blocked"){
        status.classList.add("is-warn");
        text.textContent = translateString("Bu sayfa köprüye izin vermiyor; uzantıyı sunucu modunda dene.");
      }else{
        status.classList.add("is-warn");
        text.textContent = translateString("Bulunamadı");
      }
    }
    updateRailMode();
    updateServerStopNote();
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
    /* A rebind navigates to the new port; carry the chosen port across the
       origin boundary so the new page's Settings field shows it, and remember
       where the data stayed so the new origin can prompt for a restore. */
    try{
      const query = new URLSearchParams(window.location.search);
      const queryPort = query.get("rl-port");
      if(queryPort != null){
        const parsedPort = normalisePort(queryPort);
        if(parsedPort != null) storePort(parsedPort);
      }
      const moved = query.get("rl-moved");
      if(moved != null){
        const parsedMoved = normalisePort(moved);
        if(parsedMoved != null && parsedMoved > 0) movedFromPort = parsedMoved;
      }
    }catch(err){ /* ignore */ }
    if(movedFromPort != null) onboardingStore(ONBOARDING_DONE_KEY, "1");
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
    const stopServer = $("#onboardStopServerBtn");
    if(stopServer) stopServer.addEventListener("click", stopLocalServer);
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
    const blockedRetry = $("#serverBlockedRetry");
    if(blockedRetry) blockedRetry.addEventListener("click", function(){
      const hint = $("#serverBlockedHint");
      if(hint) hint.textContent = translateString("Sunucu kontrol ediliyor…");
      fetch("/__rl/status", { method:"GET", cache:"no-store" }).then(function(response){
        if(!response.ok) return null;
        return response.json();
      }).then(function(data){
        if(data && data.app === "request-ledger" && data.server === true){
          stopServerReconnectWatch();
          window.location.reload();
          return;
        }
        if(hint) hint.textContent = translateString("Sunucu hâlâ kapalı. start.cmd çalıştır.");
      }).catch(function(){
        if(hint) hint.textContent = translateString("Sunucu hâlâ kapalı. start.cmd çalıştır.");
      });
    });

    const railStop = $("#railStopBtn");
    if(railStop) railStop.addEventListener("click", stopLocalServer);
    const applyPort = $("#applyPortBtn");
    if(applyPort) applyPort.addEventListener("click", applyPortSetting);
    const portInput = $("#settingsPort");
    if(portInput){
      portInput.addEventListener("input", function(){ portInput.classList.remove("is-invalid"); });
      portInput.addEventListener("keydown", function(event){
        if(event.key === "Enter"){ event.preventDefault(); applyPortSetting(); }
      });
    }
    initPortMoveUi();

    if(!onboardingBridgeListener){
      onboardingBridgeListener = true;
      window.addEventListener("message", onOnboardingBridgeMessage);
    }
    window.addEventListener("beforeunload", onboardingBeforeUnload);

    probeLocalServer().then(function(found){
      if(found){
        serverStopNotice = false;
        startServerHeartbeat();
      }
      renderOnboarding();
      renderServerRuntimeUi();
      if(movedFromPort != null){
        openMovedPortPrompt(movedFromPort);
        clearMoveQuery();
        movedFromPort = null;
      }
      if(onboardingStored(ONBOARDING_DONE_KEY, "") !== "1"){
        openOnboarding();
      }
    }).catch(function(){ /* ignore */ });
  }
