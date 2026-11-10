  /* ============================================================
     Capture tools bridge — web app side

     The app is the hub tab. Pick, screenshot and element+screenshot all
     target a different tab, so the extension shows one compact tab
     chooser and runs its existing overlay there. Results return the
     normalized page path, optional selector and optional one-shot image.
     Only the allowlisted origins reach this flow; every payload is
     validated here before it can touch the ledger.
     ============================================================ */

  const PICKER_RELEASE_URL = "https://github.com/TanerUNER/request-ledger/releases/latest";
  const PICKER_TABS_TIMEOUT_MS = 8000;
  const PICKER_APP_TIMEOUT_MS = 30000;

  let pickerFlow = null; /* { requestId, mode, phase, tabId, tabUrl, timer } */

  function pickerConnected(){
    try{ return Boolean(bridgeEnabled() && bridgeConnected); }catch(err){ return false; }
  }

  const PICKER_MODES = {
    "pick-element": {
      mode: "pick",
      label: "Öğe seç",
      busy: "Seçiliyor…",
      title: "Sayfa ve konumu eklentidan seç."
    },
    "capture-tab": {
      mode: "capture",
      label: "Ekran görüntüsü",
      busy: "Ekran görüntüsü alınıyor…",
      title: "Sekmenin ekran görüntüsünü al ve isteğe ekle."
    },
    "pick-capture": {
      mode: "pick-capture",
      label: "Öğe + görüntü",
      busy: "Öğe ve görüntü alınıyor…",
      title: "Bir öğe seç ve görüntüsünü isteğe ekle."
    }
  };

  function pickerModeFor(action){
    return PICKER_MODES[action] || PICKER_MODES["pick-element"];
  }

  function pickerUsesMedia(mode){
    return mode === "capture" || mode === "pick-capture";
  }

  /* Keep every row control in sync with the live link and the single
     in-flight pick/capture. aria-disabled (not disabled) is used for the
     offline state so the same control can still open the install guidance. */
  function updatePickerBridgeButtons(scope){
    const root = scope || document;
    $$('[data-action="pick-element"],[data-action="capture-tab"],[data-action="pick-capture"]', root).forEach(function(button){
      const spec = pickerModeFor(button.dataset.action);
      const row = button.closest(".req");
      const req = row ? getReq(row.dataset.id) : null;
      const busy = Boolean(pickerFlow && req && pickerFlow.requestId === req.id);
      const locked = req ? requestStatus(req) === "ready" : true;
      const full = Boolean(req && pickerUsesMedia(spec.mode) && req.images.length >= MAX_IMAGES);
      const off = !pickerConnected();
      button.disabled = busy || locked || full;
      button.setAttribute("aria-disabled", String(off && !busy && !locked && !full));
      button.title = off
        ? translateString("Eklenti bağlı değil — kurulum adımlarını görmek için tıkla.")
        : full
          ? translateString("Bir satıra en fazla " + MAX_IMAGES + " görsel eklenebilir.")
          : translateString(spec.title);
      const label = button.querySelector("[data-pick-label]");
      if(label) label.textContent = busy ? translateString(spec.busy) : translateString(spec.label);
    });
  }

  function openPickerInstall(){
    const link = $("#pickerReleaseLink");
    if(link) link.href = PICKER_RELEASE_URL;
    openModal($("#pickerInstallModal"));
  }

  function pickerTabPath(url){
    const raw = String(url || "");
    if(!raw) return "";
    try{
      const parsed = new URL(raw);
      if(parsed.protocol === "file:"){
        const file = decodeURIComponent(parsed.pathname || "").split("/").filter(Boolean).pop();
        return file || raw;
      }
      let path = (parsed.pathname || "/") + (parsed.search || "");
      if(path.length > 1 && path.charAt(path.length - 1) === "/") path = path.slice(0, -1);
      return parsed.host + path;
    }catch(err){ return raw; }
  }

  /* The Page field follows the extension picker's normalized pathname:
     long numeric/UUID segments become "{ID}", and the query is kept. */
  function pickerPagePath(url){
    const raw = String(url || "");
    if(!raw) return "";
    try{
      const parsed = new URL(raw);
      const segments = (parsed.pathname || "/").split("/").map(function(segment){
        if(
          /^\d+$/.test(segment) ||
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) ||
          /^[0-9a-f]{24}$/i.test(segment)
        ){
          return "{ID}";
        }
        return segment;
      });
      let path = segments.join("/") + (parsed.search || "");
      if(path.length > 1 && path.charAt(path.length - 1) === "/") path = path.slice(0, -1);
      return path;
    }catch(err){ return raw; }
  }

  function pickerDataUrl(value){
    const text = typeof value === "string" ? value : "";
    if(!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(text)) return "";
    return text.length <= 8 * 1024 * 1024 ? text : "";
  }

  function pickerDataUrlFile(dataUrl){
    return fetch(dataUrl).then(function(response){ return response.blob(); }).then(function(blob){
      const type = blob.type || "image/png";
      const ext = type.indexOf("jpeg") >= 0 ? "jpg" : type.indexOf("webp") >= 0 ? "webp" : "png";
      const name = "ekran-alintisi-" + Date.now() + "." + ext;
      try{ return new File([blob], name, { type:type }); }
      catch(err){
        try{ blob.name = name; }catch(assignErr){ /* ignore */ }
        return blob;
      }
    });
  }

  function pickerTabsBody(){
    return $("#pickerTabsBody");
  }

  function pickerShowMessage(text, isError){
    const body = pickerTabsBody();
    if(!body) return;
    body.textContent = "";
    const box = document.createElement("div");
    box.className = isError ? "picktabs__empty" : "picktabs__status";
    box.setAttribute("role", isError ? "alert" : "status");
    box.textContent = text;
    body.appendChild(box);
  }

  function pickerShowLoading(){
    const body = pickerTabsBody();
    if(!body) return;
    body.textContent = "";
    const status = document.createElement("div");
    status.className = "picktabs__status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const dot = document.createElement("span");
    dot.className = "picktabs__dot";
    dot.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.textContent = translateString("Sekmeler yükleniyor…");
    status.appendChild(dot);
    status.appendChild(text);
    body.appendChild(status);
  }

  function pickerRenderTabs(tabs){
    const body = pickerTabsBody();
    if(!body) return;
    body.textContent = "";
    if(!tabs.length){
      pickerShowMessage(translateString("Seçilebilecek sekme bulunamadı. Belgelemek istediğin sayfayı açıp yeniden dene."), true);
      return;
    }
    const list = document.createElement("div");
    list.className = "picktabs";
    tabs.forEach(function(tab){
      const row = document.createElement("button");
      row.type = "button";
      row.className = "typechoice";
      row.dataset.tabId = String(tab.id);
      row.setAttribute("aria-label", translateString("Bu sekmeden öğe seç") + ": " + tab.title);
      const content = document.createElement("span");
      content.className = "typechoice__body";
      const title = document.createElement("b");
      title.textContent = tab.title;
      const path = document.createElement("small");
      path.textContent = pickerTabPath(tab.url);
      content.appendChild(title);
      content.appendChild(path);
      const arrow = document.createElement("span");
      arrow.className = "typechoice__arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "→";
      row.appendChild(content);
      row.appendChild(arrow);
      row.addEventListener("click", function(){ pickerChooseTab(tab); });
      list.appendChild(row);
    });
    body.appendChild(list);
  }

  function pickerModeCopy(mode){
    if(mode === "capture"){
      return {
        eyebrow: "Ekran görüntüsü",
        title: "Hangi sekmeden görüntü alınsın?",
        waiting: "Görüntü bekleniyor…",
        waitingHint: "Seçtiğin sekmede kırpılacak alanı sürükle. 30 saniye içinde sonuç gelmezse işlem iptal edilir.",
        cancel: "Görüntü almayı iptal et",
        timeout: "Görüntü alma zaman aşımına uğradı.",
        timeoutFail: "Görüntü alma zaman aşımına uğradı. Eklenti penceresini kapatıp yeniden dene.",
        disconnected: "Eklenti bağlantısı kesildi. Görüntü alınamadı.",
        cancelled: "Görüntü alımı iptal edildi.",
        invalid: "Görüntü sonucu geçersiz. Yeniden dene."
      };
    }
    if(mode === "pick-capture"){
      return {
        eyebrow: "Öğe + görüntü",
        title: "Hangi sekmeden öğe ve görüntü alınsın?",
        waiting: "Öğe ve görüntü bekleniyor…",
        waitingHint: "Seçtiğin sekmede bir öğeye tıkla; görüntüsü de alınacak. 30 saniye içinde sonuç gelmezse işlem iptal edilir.",
        cancel: "İşlemi iptal et",
        timeout: "Öğe ve görüntü zaman aşımına uğradı.",
        timeoutFail: "İşlem zaman aşımına uğradı. Eklenti penceresini kapatıp yeniden dene.",
        disconnected: "Eklenti bağlantısı kesildi. Öğe ve görüntü alınamadı.",
        cancelled: "Öğe ve görüntü alımı iptal edildi.",
        invalid: "Seçim sonucu geçersiz. Yeniden dene."
      };
    }
    return {
      eyebrow: "Öğe seçici",
      title: "Hangi sekmeden seçilsin?",
      waiting: "Seçim bekleniyor…",
      waitingHint: "Seçtiğin sekmede bir öğeye tıkla. 30 saniye içinde sonuç gelmezse seçim iptal edilir.",
      cancel: "Seçimi iptal et",
      timeout: "Öğe seçimi zaman aşımına uğradı.",
      timeoutFail: "Seçim zaman aşımına uğradı. Eklenti penceresini kapatıp yeniden dene.",
      disconnected: "Eklenti bağlantısı kesildi. Öğe seçilemedi.",
      cancelled: "Öğe seçimi iptal edildi.",
      invalid: "Seçim sonucu geçersiz. Yeniden dene."
    };
  }

  function pickerRenderSelecting(tab, mode){
    const body = pickerTabsBody();
    if(!body) return;
    const copy = pickerModeCopy(mode);
    body.textContent = "";
    const status = document.createElement("div");
    status.className = "picktabs__status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const dot = document.createElement("span");
    dot.className = "picktabs__dot";
    dot.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.textContent = translateString(copy.waiting) + " " + tab.title;
    status.appendChild(dot);
    status.appendChild(text);
    const hint = document.createElement("p");
    hint.className = "field__hint";
    hint.textContent = translateString(copy.waitingHint);
    body.appendChild(status);
    body.appendChild(hint);
  }

  function pickerClearTimer(){
    if(pickerFlow && pickerFlow.timer){
      clearTimeout(pickerFlow.timer);
      pickerFlow.timer = null;
    }
  }

  function pickerSendCancel(flow){
    if(!flow || flow.phase !== "picking" || !Number.isInteger(flow.tabId)) return;
    bridgeControlPost(flow.mode === "capture" ? "RL_APP_CAPTURE_CANCEL" : "RL_APP_PICK_CANCEL", {
      tabId:flow.tabId
    });
  }

  function pickerCancel(notify){
    const flow = pickerFlow;
    if(!flow) return null;
    pickerFlow = null;
    if(flow.timer){ clearTimeout(flow.timer); flow.timer = null; }
    if(notify) pickerSendCancel(flow);
    updatePickerBridgeButtons();
    return flow;
  }

  function pickerCloseAll(){
    const modal = $("#pickerTabsModal");
    if(modal && modal.classList.contains("is-open")) closeModal(modal, false);
  }

  function pickerFail(message){
    pickerClearTimer();
    const flow = pickerFlow;
    pickerFlow = null;
    updatePickerBridgeButtons();
    pickerSendCancel(flow);
    pickerShowMessage(message, true);
    const cancel = $("#pickerTabsCancel");
    if(cancel) cancel.textContent = translateString("Kapat");
  }

  function pickerTabsTimeout(){
    if(!pickerFlow || pickerFlow.phase !== "tabs") return;
    pickerFail(translateString("Sekme listesi alınamadı. Eklentinın açık ve bağlı olduğundan emin ol."));
  }

  function pickerPickTimeout(){
    if(!pickerFlow || pickerFlow.phase !== "picking") return;
    const copy = pickerModeCopy(pickerFlow.mode);
    pickerFail(translateString(copy.timeoutFail));
    showToast(translateString(copy.timeout), "error");
  }

  function pickerOpen(req, action){
    if(!req) return;
    const spec = pickerModeFor(action);
    if(requestStatus(req) === "ready"){
      showToast(translateString("Hazır onayını geri alarak düzenleyebilirsin."), "error");
      return;
    }
    if(pickerUsesMedia(spec.mode) && req.images.length >= MAX_IMAGES){
      showToast(translateString("Bir satıra en fazla " + MAX_IMAGES + " görsel eklenebilir."), "error");
      return;
    }
    pickerCancel(true);
    if(!bridgeEnabled()){
      showToast(translateString("Bu sayfa eklenti köprüsüne izin vermiyor."), "error");
      return;
    }
    if(!bridgeConnected){
      openPickerInstall();
      return;
    }

    const copy = pickerModeCopy(spec.mode);
    pickerFlow = {
      requestId:req.id,
      mode:spec.mode,
      phase:"tabs",
      tabId:null,
      tabUrl:"",
      pagePath:"",
      timer:null
    };
    const modal = $("#pickerTabsModal");
    if(modal) modal.setAttribute("aria-label", translateString(copy.title));
    const eyebrow = $("#pickerTabsEyebrow");
    if(eyebrow) eyebrow.textContent = translateString(copy.eyebrow);
    const title = $("#pickerTabsTitle");
    if(title) title.textContent = translateString(copy.title);
    const hint = $("#pickerTabsHint");
    if(hint) hint.textContent = translateString("Uygulama sekmesi listede görünmez.");
    const cancel = $("#pickerTabsCancel");
    if(cancel) cancel.textContent = translateString("Vazgeç");
    pickerShowLoading();
    updatePickerBridgeButtons();
    openModal(modal);
    bridgeControlPost("RL_APP_TABS_REQUEST");
    pickerFlow.timer = setTimeout(pickerTabsTimeout, PICKER_TABS_TIMEOUT_MS);
  }

  function pickerChooseTab(tab){
    if(!pickerFlow || pickerFlow.phase !== "tabs") return;
    const copy = pickerModeCopy(pickerFlow.mode);
    pickerClearTimer();
    pickerFlow.phase = "picking";
    pickerFlow.tabId = tab.id;
    pickerFlow.tabUrl = tab.url;
    pickerFlow.pagePath = pickerPagePath(tab.url);
    pickerRenderSelecting(tab, pickerFlow.mode);
    const hint = $("#pickerTabsHint");
    if(hint) hint.textContent = translateString("Seçim tamamlanınca bu pencereye dönülür.");
    const cancel = $("#pickerTabsCancel");
    if(cancel) cancel.textContent = translateString(copy.cancel);
    updatePickerBridgeButtons();
    if(pickerFlow.mode === "capture"){
      bridgeControlPost("RL_APP_CAPTURE_REQUEST", { tabId:tab.id, lang:state.language });
    }else{
      const message = { tabId:tab.id, lang:state.language };
      if(pickerFlow.mode === "pick-capture") message.capture = true;
      bridgeControlPost("RL_APP_PICK_REQUEST", message);
    }
    pickerFlow.timer = setTimeout(pickerPickTimeout, PICKER_APP_TIMEOUT_MS);
  }

  /* Field writes keep the existing row handlers authoritative. */
  function pickerSetField(row, req, field, value){
    const input = row ? $('[data-field="' + field + '"]', row) : null;
    if(input){
      input.value = value;
      onFieldChange(row, req, field, value, input);
      return true;
    }
    req[field] = value;
    req.updatedAt = nowISO();
    return false;
  }

  async function pickerAttachCapture(flow, req, dataUrl){
    if(!req || !pickerDataUrl(dataUrl)) return false;
    if(req.images.length >= MAX_IMAGES){
      showToast(translateString("Bir satıra en fazla " + MAX_IMAGES + " görsel eklenebilir."), "error");
      return false;
    }
    const before = req.images.length;
    try{
      const file = await pickerDataUrlFile(dataUrl);
      await addFilesToRow(req.id, [file]);
    }catch(err){
      return false;
    }
    return req.images.length > before;
  }

  /* Host -> page tab list. Shape is re-validated here: only eligible
     http/https/file tabs with a numeric id survive. */
  function handleBridgeTabsResult(data){
    if(!pickerFlow || pickerFlow.phase !== "tabs") return;
    pickerClearTimer();
    const raw = Array.isArray(data.tabs) ? data.tabs.slice(0, 100) : [];
    const seen = {};
    const tabs = [];
    raw.forEach(function(tab){
      if(!tab || typeof tab !== "object") return;
      const id = Number(tab.id);
      if(!Number.isInteger(id) || id < 0 || seen[id]) return;
      const url = typeof tab.url === "string" ? tab.url.slice(0, 2048) : "";
      if(!/^(https?|file):/i.test(url)) return;
      seen[id] = true;
      const title = typeof tab.title === "string" && tab.title.trim()
        ? tab.title.trim().slice(0, 200)
        : pickerTabPath(url);
      tabs.push({ id:id, title:title, url:url });
    });
    pickerRenderTabs(tabs);
  }

  function pickerFlowRequest(flow){
    if(!flow) return null;
    const req = state.requests.find(function(item){ return item && item.id === flow.requestId; });
    if(req) return req;
    showToast(translateString("Seçim yapılan istek bulunamadı."), "error");
    return null;
  }

  /* Picks are additive on both surfaces: keep the existing selectors and
     append the new one with " | ", dropping duplicates and enforcing the
     200-character location field cap. */
  function mergePickerLocation(current, selector){
    const parts = String(current == null ? "" : current).split(/\s+\|\s+/);
    const merged = [];
    parts.forEach(function(value){
      const text = String(value || "").trim();
      if(text && merged.indexOf(text) < 0) merged.push(text);
    });
    if(selector && merged.indexOf(selector) < 0) merged.push(selector);
    return merged.join(" | ").slice(0, 200);
  }

  try{ window.__rlMergeLocation = mergePickerLocation; }catch(err){ /* ignore */ }

  async function handleBridgePickResult(data){
    if(!pickerFlow || pickerFlow.phase !== "picking") return;
    const copy = pickerModeCopy(pickerFlow.mode);
    if(data.cancelled === true){
      pickerCancel(false);
      pickerCloseAll();
      showToast(translateString(copy.cancelled));
      return;
    }
    const selector = typeof data.selector === "string" ? data.selector.trim() : "";
    const page = typeof data.page === "string" ? data.page.trim() : "";
    if(!selector || selector.length > 4000){
      pickerFail(translateString(copy.invalid));
      return;
    }
    const flow = pickerCancel(false);
    pickerCloseAll();
    if(!flow) return;
    const req = pickerFlowRequest(flow);
    if(!req) return;
    let row = getRowEl(req.id);
    if(!row){
      renderList();
      row = getRowEl(req.id);
    }
    const pageValue = (page || flow.pagePath || "").slice(0, 80);
    const locationValue = mergePickerLocation(req.location, selector);
    const pageWritten = pickerSetField(row, req, "page", pageValue);
    const locationWritten = pickerSetField(row, req, "location", locationValue);
    if(!pageWritten && !locationWritten){
      scheduleSave();
      updateAllRows();
      refreshGlobal();
    }
    updatePickerBridgeButtons();

    const wantsImage = flow.mode === "pick-capture" || data.capture === true;
    if(!wantsImage){
      showToast(translateString("Sayfa ve konum öğe seçiminden dolduruldu."));
      return;
    }
    if(data.captureError === true){
      showToast(translateString("Sayfa ve konum dolduruldu; görüntü alınamadı."), "error");
      return;
    }
    const attached = await pickerAttachCapture(flow, req, data.dataUrl);
    /* The app tab is in the background while the picked tab is active; an
       immediate write keeps the one-shot result from waiting on a throttled
       debounce timer. */
    saveNow();
    showToast(translateString(attached
      ? "Sayfa, konum ve görüntü öğeden alındı."
      : "Sayfa ve konum dolduruldu; görüntü eklenemedi."), attached ? "ok" : "error");
  }

  async function handleBridgeCaptureResult(data){
    if(!pickerFlow || pickerFlow.phase !== "picking" || pickerFlow.mode !== "capture") return;
    const copy = pickerModeCopy("capture");
    if(data.cancelled === true){
      pickerCancel(false);
      pickerCloseAll();
      showToast(translateString(copy.cancelled));
      return;
    }
    const dataUrl = pickerDataUrl(data.dataUrl);
    if(!dataUrl){
      pickerFail(translateString(copy.invalid));
      return;
    }
    const flow = pickerCancel(false);
    pickerCloseAll();
    if(!flow) return;
    const req = pickerFlowRequest(flow);
    if(!req) return;
    let row = getRowEl(req.id);
    if(!row){
      renderList();
      row = getRowEl(req.id);
    }
    if(flow.pagePath){
      const pageWritten = pickerSetField(row, req, "page", flow.pagePath.slice(0, 80));
      if(!pageWritten){
        scheduleSave();
        refreshGlobal();
      }
    }
    const attached = await pickerAttachCapture(flow, req, dataUrl);
    saveNow();
    updatePickerBridgeButtons();
    showToast(translateString(attached
      ? "Ekran görüntüsü isteğe eklendi."
      : "Ekran görüntüsü eklenemedi."), attached ? "ok" : "error");
  }

  /* A lost link must never leave the chooser stuck. */
  function handleBridgeDisconnected(){
    if(!pickerFlow) return;
    const copy = pickerModeCopy(pickerFlow.mode);
    if(pickerFlow.phase === "picking"){
      pickerCancel(false);
      pickerCloseAll();
      showToast(translateString(copy.disconnected), "error");
      return;
    }
    pickerFail(translateString("Eklenti bağlantısı kesildi. Kurulum adımlarını kontrol et."));
  }

  function initPickerBridge(){
    updatePickerBridgeButtons();
    const tabModal = $("#pickerTabsModal");
    if(tabModal){
      tabModal.addEventListener("click", function(event){
        if(event.target.closest("[data-close-modal]")) pickerCancel(true);
      });
    }
    const cancel = $("#pickerTabsCancel");
    if(cancel){
      cancel.addEventListener("click", function(){
        pickerCancel(true);
        pickerCloseAll();
      });
    }
    const install = $("#pickerInstallModal");
    if(install){
      const link = $("#pickerReleaseLink");
      if(link) link.href = PICKER_RELEASE_URL;
    }
    document.addEventListener("keydown", function(event){
      if(event.key !== "Escape" && event.key !== "Esc") return;
      if(!pickerFlow) return;
      pickerCancel(true);
      pickerCloseAll();
    });
  }
