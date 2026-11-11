  /* ============================================================
     Kısa yardımcılar
     ============================================================ */
  /* Bounded request-state audit. Every add/remove/replace of the request list
     records the surviving ids, the ledger stamp and the call site. Read-only
     via window.__rlStateDebug; the buffer keeps the last 250 events. */
  var rlRequestAudit = [];
  function rlAudit(source, extra){
    try{
      var list = state && Array.isArray(state.requests) ? state.requests : [];
      var entry = {
        at: Date.now(),
        source: String(source || ""),
        ids: list.map(function(req){ return String(req && req.id || ""); }),
        count: list.length,
        updatedAt: (state && state.updatedAt) || "",
        ledgerId: (state && state.ledgerId) || "",
        projectId: typeof activeProjectId !== "undefined" ? (activeProjectId || "") : "",
        extra: extra || null,
        stack: String(new Error().stack || "").split("\n").slice(1, 7).join("\n")
      };
      rlRequestAudit.push(entry);
      if(rlRequestAudit.length > 250) rlRequestAudit.shift();
      if(typeof window !== "undefined") window.__rlStateAudit = rlRequestAudit;
      return entry;
    }catch(err){ return null; }
  }
  function rlAuditSnapshot(reqs){
    return (Array.isArray(reqs) ? reqs : []).map(function(req){
      return { id: String(req && req.id || ""), confirmed: !!(req && req.confirmed), updatedAt: String(req && req.updatedAt || "") };
    });
  }
  /* Always-on request trace: per-id add/remove/ready events with the call site
     and revision, capped at 300 entries (window.__rlTrace). */
  var rlTrace = [];
  function rlTraceBegin(){
    var ids = [];
    var confirmed = {};
    (state && Array.isArray(state.requests) ? state.requests : []).forEach(function(req){
      if(!req || !req.id) return;
      ids.push(String(req.id));
      confirmed[String(req.id)] = req.confirmed === true;
    });
    return { ids: ids, confirmed: confirmed, rev: Number(state && state.rev) || 0 };
  }
  function rlTraceCommit(source, before){
    try{
      var previous = before && Array.isArray(before.ids) ? before.ids : [];
      var now = (state && Array.isArray(state.requests) ? state.requests : []).filter(function(req){ return req && req.id; });
      var current = {};
      var t = Date.now();
      var stack = String(new Error().stack || "").split("\n").slice(1, 8).join("\n");
      now.forEach(function(req){
        var id = String(req.id);
        current[id] = true;
        if(previous.indexOf(id) < 0){
          rlTrace.push({ t: t, op: "add", id: id, source: String(source || ""), rev: Number(state.rev) || 0, confirmed: req.confirmed === true, projectId: activeProjectId || "", stack: stack });
        }else if(before.confirmed && before.confirmed[id] !== (req.confirmed === true)){
          rlTrace.push({ t: t, op: "ready", id: id, source: String(source || ""), rev: Number(state.rev) || 0, confirmed: req.confirmed === true, projectId: activeProjectId || "", stack: stack });
        }
      });
      previous.forEach(function(id){
        if(current[id]) return;
        rlTrace.push({ t: t, op: "remove", id: id, source: String(source || ""), rev: Number(state.rev) || 0,
          confirmed: !!(before.confirmed && before.confirmed[id]), projectId: activeProjectId || "", stack: stack });
      });
      if(rlTrace.length > 300) rlTrace = rlTrace.slice(rlTrace.length - 300);
      if(typeof window !== "undefined") window.__rlTrace = rlTrace;
    }catch(err){ /* tracing never breaks the ledger */ }
  }
  function rlInstallStateDebug(){
    try{
      window.__rlStateDebug = Object.freeze({
        requests: function(){
          return (state.requests || []).map(function(req){
            return { id:req.id, title:req.title, confirmed:req.confirmed === true,
              updatedAt:req.updatedAt, rev:Number(state.rev) || 0, images:(req.images || []).length };
          });
        },
        audit: function(){ return rlRequestAudit.slice(); },
        trace: function(){ return rlTrace.slice(); },
        ledger: function(){ return { projectId:activeProjectId || "", ledgerId:state.ledgerId || "",
          updatedAt:state.updatedAt || "", rev:Number(state.rev) || 0 }; },
        boot: function(){
          return {
            mode: typeof serverDiskMode !== "undefined" ? serverDiskMode === true : false,
            ready: typeof serverDiskReady !== "undefined" ? serverDiskReady === true : false,
            active: typeof serverDiskActive !== "undefined" ? serverDiskActive === true : false,
            registry: !!projectRegistry,
            projects: projectRegistry && Array.isArray(projectRegistry.projects) ? projectRegistry.projects.length : 0
          };
        }
      });
    }catch(err){ /* ignore */ }
  }
  function $(sel, root){
    return (root || document).querySelector(sel);
  }
  function $$(sel, root){
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function nowISO(){
    return new Date().toISOString();
  }
  function pad2(n){
    return String(n).padStart(2, "0");
  }
  function formatYMD(date){
    const d = date || new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function formatStamp(date){
    const d = date || new Date();
    return formatYMD(d) + "_" + pad2(d.getHours()) + "-" + pad2(d.getMinutes()) + "-" + pad2(d.getSeconds());
  }
  function formatTime(date){
    const d = date || new Date();
    return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }
  function formatClock(value){
    const d = value instanceof Date ? value : (value ? new Date(value) : new Date());
    if(isNaN(d.getTime())) return "";
    return pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
  }
  function formatDateTime(value){
    if(!value) return "—";
    const d = value instanceof Date ? value : new Date(value);
    if(isNaN(d.getTime())) return "—";
    return pad2(d.getDate()) + "." + pad2(d.getMonth() + 1) + "." + d.getFullYear() + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }
  function formatDateLong(value){
    const d = value instanceof Date ? value : (value ? new Date(value) : new Date());
    if(isNaN(d.getTime())) return "";
    try{
      return new Intl.DateTimeFormat(state.language === "en" ? "en-US" : "tr-TR", { day:"2-digit", month:"long", year:"numeric", weekday:"long" }).format(d);
    }catch(err){
      return d.toLocaleDateString(state.language === "en" ? "en-US" : "tr-TR");
    }
  }
  function trLower(value){
    return String(value == null ? "" : value).toLocaleLowerCase("tr");
  }
  function countLabel(n, trOne, trMany, enOne, enMany){
    if(state.language === "en") return n + " " + (n === 1 ? enOne : enMany);
    return n + " " + (n === 1 ? trOne : trMany);
  }
  function translatePattern(core){
    let match;
    if((match = /^(\d+)\s+talep$/.exec(core))) return match[1] + " requests";
    if((match = /^(\d+)\s+talep\s+·\s+(.+)$/.exec(core))) return match[1] + " requests · " + translateString(match[2]);
    if((match = /^(\d+)\s+görsel$/.exec(core))) return match[1] + " images";
    if((match = /^(\d+)\s+dosya$/.exec(core))) return match[1] + " files";
    if((match = /^(\d+)\s+istek$/.exec(core))) return match[1] + " requests";
    if((match = /^(\d+)\s+kayıt$/.exec(core))) return match[1] + " records";
    if((match = /^(\d+)\s+adet$/.exec(core))) return match[1];
    if((match = /^(\d+)\s*\/\s*(\d+)\s+hazır$/.exec(core))) return match[1] + " / " + match[2] + " ready";
    if((match = /^%(\d+)$/.exec(core))) return "%" + match[1];
    if((match = /^(\d+)\s+eksik$/.exec(core))) return match[1] + " missing";
    if((match = /^(\d+)\s+talep hazır değil$/.exec(core))) return match[1] + " requests not ready";
    if((match = /^Son değişiklik:\s*(.+)$/.exec(core))) return "Last change: " + match[1];
    if((match = /^Varsayılan:\s*(.+)$/.exec(core))) return "Default: " + match[1];
    if((match = /^Eksik seçim:\s*(.+)$/.exec(core))) return "Missing selection: " + translateString(match[1]);
    if((match = /^(\d+) talep henüz hazır değil\. Aşağıdaki satıra tıklayarak eksik alanı tamamla; tüm satırlar onaylanmadan dışa aktarma kapalı kalır\.$/.exec(core))) return match[1] + " requests are not ready yet. Click a row below to complete the missing field; export stays disabled until all rows are confirmed.";
    if((match = /^(\d+) talep dışa aktarmaya hazır değil\. Eksikleri tamamlayıp tik ile onayla\.$/.exec(core))) return match[1] + " requests are not ready for export. Complete the missing fields and confirm with the checkmark.";
    if((match = /^Durum:\s*(.+)$/.exec(core))) return "Status: " + translateString(match[1]);
    if((match = /^Dil:\s*(.+)$/.exec(core))) return "Language: " + translateString(match[1]);
    if((match = /^Tür:\s*(.+)$/.exec(core))) return "Type: " + translateString(match[1]);
    if((match = /^Öncelik:\s*(.+)$/.exec(core))) return "Priority: " + translateString(match[1]);
    if((match = /^Ajan görevi:\s*(.+)$/.exec(core))) return "Agent role: " + match[1];
    if((match = /^Tema:\s*(.+)$/.exec(core))) return "Theme: " + translateString(match[1]);
    if((match = /^Dışa aktarım davranışı:\s*(.+)$/.exec(core))) return "Export behavior: " + translateString(match[1]);
    if((match = /^Eksik alanları göster:\s*(.+)$/.exec(core))) return "Show missing fields: " + match[1].split(", ").map(function(part){ return translateString(part); }).join(", ");
    if((match = /^(.+) eklendi\. Başlık ve açıklamayla devam et\.$/.exec(core))) return match[1] + " added. Continue with title and description.";
    if((match = /^(.+) hazır olarak işaretlendi\.$/.exec(core))) return match[1] + " marked as ready.";
    if((match = /^(.+) onayı kaldırıldı\.$/.exec(core))) return match[1] + " confirmation removed.";
    if((match = /^(.+) · izin gerekli$/.exec(core))) return match[1] + " · permission required";
    if((match = /^Defterdeki (\d+) istek temizlenecek\. Kayıtlar, Taslaklar ve Dışa Aktarılanlar korunur\. Bu işlem geri alınamaz\.$/.exec(core))) return "The " + match[1] + " requests in the ledger will be cleared. Records, Drafts and Exported will be kept. This action cannot be undone.";
    if((match = /^(\d+) istek yüklenecek\. Mevcut istekler değiştirilecek\.$/.exec(core))) return match[1] + " requests will be loaded. Current requests will be replaced.";
    if((match = /^(\d+) talep ve (\d+) kayıt geri yüklenecek\. Mevcut talepler ve Kayıtlar yedekteki verilerle değiştirilecek\. Devam etmek istiyor musun\?$/.exec(core))) return match[1] + " requests and " + match[2] + " records will be restored. Current requests and Records will be replaced with the backup data. Continue?";
    if((match = /^(\d+) talep geri yüklenecek\. Mevcut talepler yedekteki verilerle değiştirilecek\. Devam etmek istiyor musun\?$/.exec(core))) return match[1] + " requests will be restored. Current requests will be replaced with the backup data. Continue?";
    if((match = /^(\d+) talep ve (\d+) kayıt geri yüklenecek\. Bu projedeki mevcut talepler ve Kayıtlar yedekteki verilerle değiştirilecek\. Diğer projeler korunur\. Devam etmek istiyor musun\?$/.exec(core))) return match[1] + " requests and " + match[2] + " records will be restored. Current requests and Records in this project will be replaced with the backup data. Other projects are kept. Continue?";
    if((match = /^(\d+) talep geri yüklenecek\. Bu projedeki mevcut talepler yedekteki verilerle değiştirilecek\. Diğer projeler korunur\. Devam etmek istiyor musun\?$/.exec(core))) return match[1] + " requests will be restored. Current requests in this project will be replaced with the backup data. Other projects are kept. Continue?";
    if((match = /^(.+) ve bu projedeki tüm talepler, görseller, kayıtlar, taslaklar ve dışa aktarılanlar kalıcı olarak silinecek\. Bu işlem geri alınamaz\.$/.exec(core))) return match[1] + " and all requests, images, records, drafts and exported entries in this project will be permanently deleted. This action cannot be undone.";
    if((match = /^Çıktı (hedef klasöre kaydedildi|indirildi): (.+)\. Mevcut talepleri temizlemek ister misin\?$/.exec(core))) return "Output " + (match[1] === "hedef klasöre kaydedildi" ? "saved to the project folder" : "downloaded") + ": " + match[2] + ". Do you want to clear the current requests?";
    if((match = /^(.+) kalıcı olarak silinecek\. Bu işlem geri alınamaz\.$/.exec(core))) return match[1] + " will be permanently deleted. This action cannot be undone.";
    if((match = /^Bu istek listesi (.+) tarihinde kaydedilmiş\. Mevcut kaydın üzerine yazmak mı, yoksa yeni bir kayıt oluşturmak mı istersin\?$/.exec(core))) return "This request list was saved on " + match[1] + ". Do you want to overwrite the existing record or create a new one?";
    if((match = /^Oto\. Kayıt\s*(.+)$/.exec(core))) return "Auto save " + match[1];
    if(core === "Oto. Kayıt…") return "Auto save…";
    if(core === "Oto. Kayıt hatası") return "Auto save error";
    if((match = /^(.+)\s+eklendi\.$/.exec(core))) return match[1] + " added.";
    if((match = /^(.+)\s+güncellendi\.$/.exec(core))) return match[1] + " updated.";
    if((match = /^(.+)\s+silindi\.$/.exec(core))) return match[1] + " deleted.";
    if((match = /^(.+)\s+oluşturuldu\.$/.exec(core))) return match[1] + " created.";
    if((match = /^(.+)\s+eklenemedi\.$/.exec(core))) return match[1] + " could not be added.";
    if((match = /^(.+)\s+çok büyük \(en fazla (\d+) MB\)\.$/.exec(core))) return match[1] + " is too large (max " + match[2] + " MB).";
    if((match = /^(\d+)\s+görsel eklendi\.(.*)$/.exec(core))) return match[1] + " images added." + match[2];
    if((match = /^(\d+)\s+dosya eklendi\.(.*)$/.exec(core))) return match[1] + " files added." + match[2];
    if((match = /^Hedef klasör:\s*(.+)$/.exec(core))) return "Project folder: " + match[1];
    if((match = /^Dışa aktarım dizini:\s*(.+?) · değiştirmek için tıkla$/.exec(core))) return "Export directory: " + match[1] + " · click to change";
    if((match = /^Dışa aktarım dizini:\s*(.+)$/.exec(core))) return "Export directory: " + match[1];
    if((match = /^Proje dizini:\s*(.+?) · değiştirmek için tıkla$/.exec(core))) return "Project folder: " + match[1] + " · click to change";
    if((match = /^Kök dizin:\s*(.+?) · değiştirmek için tıkla$/.exec(core))) return "Root folder: " + match[1] + " · click to change";
    if((match = /^Proje dizini:\s*(.+)$/.exec(core))) return "Project folder: " + match[1];
    if((match = /^Kök dizin:\s*(.+)$/.exec(core))) return "Root folder: " + match[1];
    if((match = /^İndirildi:\s*(.+)$/.exec(core))) return "Downloaded: " + match[1];
    if((match = /^Hedef klasöre kaydedildi:\s*(.+)$/.exec(core))) return "Saved to target folder: " + match[1];
    if((match = /^Yüklendi:\s*(.+)$/.exec(core))) return "Loaded: " + match[1];
    if((match = /^(\d+)\s+talep ve (\d+)\s+kayıt$/.exec(core))) return match[1] + " requests and " + match[2] + " records";
    if((match = /^Bir satıra en fazla (\d+) görsel eklenebilir\.$/.exec(core))) return "A row can hold at most " + match[1] + " images.";
    if((match = /^Yalnızca ilk (\d+) görsel eklendi\.$/.exec(core))) return "Only the first " + match[1] + " images were added.";
    if((match = /^Bir satıra en fazla (\d+) dosya eklenebilir\.$/.exec(core))) return "A row can hold at most " + match[1] + " files.";
    if((match = /^Yalnızca ilk (\d+) dosya eklendi\.$/.exec(core))) return "Only the first " + match[1] + " files were added.";
    if((match = /^Kök dizine yazılamadı:\s*(.+)\.\s*(Kayıt|Taslak) tarayıcıda tutuldu\.$/.exec(core))) return "Could not write to the root folder: " + match[1] + ". " + (match[2] === "Kayıt" ? "Record" : "Draft") + " kept in the browser.";
    if((match = /^Kayıt oluşturuldu:\s*(.+)$/.exec(core))) return "Record created: " + match[1];
    if((match = /^Kayıt güncellendi:\s*(.+)$/.exec(core))) return "Record updated: " + match[1];
    if((match = /^Kayıt tarayıcıda güncellendi; kök dizine yazılamadı:\s*(.+)$/.exec(core))) return "The record was updated in the browser; the root folder could not be written: " + match[1];
    if((match = /^Çıktı indirildi:\s*(.+)$/.exec(core))) return "Output downloaded: " + match[1];
    if((match = /^Eksik alanlar:\s*(.+)\.$/.exec(core))) return "Missing fields: " + match[1].split(", ").map(function(part){ return translateString(part); }).join(", ") + ".";
    if((match = /^Filtreler temizlendi;\s*(.+) satırına gidildi\.$/.exec(core))) return "Filters cleared; went to row " + match[1] + ".";
    if((match = /^Yerel sunucu çalışıyor · localhost:(\d+)$/.exec(core))) return "Local server is running · localhost:" + match[1];
    return null;
  }
  function translateString(value){
    if(state.language !== "en") return value;
    const raw = String(value == null ? "" : value);
    const leading = (raw.match(/^\s*/) || [""])[0];
    const trailing = (raw.match(/\s*$/) || [""])[0];
    const core = raw.trim();
    if(!core) return raw;
    const translated = TRANSLATIONS_EN[core] || translatePattern(core);
    return translated == null ? raw : leading + translated + trailing;
  }
  const I18N_SKIP_SELECTOR = "script,style,textarea,.req__title,.req__desc,.hitem__title,.incompleteitem__title,.projectbtn,.langbtn,.rail__brand,.topbar__brand,.historypreview,.projectgate__list,.archive__detail-head b";
  const I18N_SKIP_ATTR_SELECTOR = ".req__title,.req__desc,.hitem__title,.incompleteitem__title,.langbtn,.rail__brand,.topbar__brand,.historypreview,.archive__detail-head b";
  /* The skip decision only depends on the element chain. Caching it on the
     element keeps repeated passes over a 500-row ledger cheap; a closest()
     call per text node was measurable there. */
  function i18nSkips(el, forAttribute){
    const key = forAttribute ? "__trSkipAttr" : "__trSkip";
    const cached = el[key];
    if(cached !== undefined) return cached;
    const skip = Boolean(el.closest(forAttribute ? I18N_SKIP_ATTR_SELECTOR : I18N_SKIP_SELECTOR));
    el[key] = skip;
    return skip;
  }
  function shouldSkipI18n(node){
    const el = node && node.parentElement;
    if(!el) return true;
    return i18nSkips(el, false);
  }
  function translateDOM(root){
    if(!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let node;
    while((node = walker.nextNode())){
      if(shouldSkipI18n(node)) continue;
      if(node.__trOriginal == null) node.__trOriginal = node.nodeValue;
      const next = translateString(node.__trOriginal);
      if(node.nodeValue !== next) node.nodeValue = next;
    }
    $$("[placeholder],[title],[aria-label],[alt]", root).forEach(function(el){
      if(i18nSkips(el, true)) return;
      if(!el.__trAttrs) el.__trAttrs = {};
      if(!el.__trWrote) el.__trWrote = {};
      ["placeholder","title","aria-label","alt"].forEach(function(attr){
        if(!el.hasAttribute(attr)) return;
        const current = el.getAttribute(attr);
        const cached = el.__trAttrs[attr];
        /* App code may rewrite an attribute on a reused element (lock state,
           busy label). Refresh the stored source when the current value was
           not written here and is not the translation of the cached source. */
        if(cached == null){
          el.__trAttrs[attr] = current;
        }else if(el.__trWrote[attr] !== current && current !== translateString(cached)){
          el.__trAttrs[attr] = current;
        }
        const next = translateString(el.__trAttrs[attr]);
        el.__trWrote[attr] = next;
        if(current !== next) el.setAttribute(attr, next);
      });
    });
  }
  function updateBrandLogo(){
    const rail = $(".rail__brand");
    if(rail) rail.setAttribute("aria-label", state.language === "en" ? "Request Ledger, home" : "İstek Defteri, ana sayfa");
    const top = $(".topbar__brand");
    if(top) top.setAttribute("aria-label", state.language === "en" ? "Request Ledger" : "İstek Defteri");
  }
  function updateLanguageToggle(){
    const button = $("#langToggleBtn");
    if(!button) return;
    const label = $("#langToggleLabel");
    const code = state.language === "en" ? "EN" : "TR";
    if(label) label.textContent = code;
    const title = state.language === "en" ? "Switch to Turkish" : "İngilizceye geç";
    button.title = title;
    button.setAttribute("aria-label", code + " · " + title);
  }
  function toggleLanguage(){
    const next = state.language === "en" ? "tr" : "en";
    state.language = next;
    applyLanguage(next);
    saveNow();
    if(typeof serverSaveUiConfig === "function") serverSaveUiConfig();
  }
  function applyLanguage(lang){
    state.language = lang === "en" ? "en" : "tr";
    document.documentElement.setAttribute("lang", state.language);
    updateToday();
    updateLanguageToggle();
    updateBrandLogo();
    updateProjectLabels();
    renderPlanningAgents();
    renderList();
    renderHistoryTree();
    refreshGlobal();
    updateFolderSettingsUI();
    renderProjectPicker();
    applyArchiveCollapsed(archiveCollapsed, false);
    updateBridgeIndicator();
    if(typeof renderOnboarding === "function") renderOnboarding();
    if(typeof renderServerRuntimeUi === "function") renderServerRuntimeUi();
    translateDOM(document.body);
  }
  let i18nObserver = null;
  let i18nPending = false;
  /* Translate only what the mutation touched. Rows and groups are treated as
     the unit so a keystroke inside one row never walks the whole ledger. */
  function i18nRootFor(node){
    const el = node && node.nodeType === 1 ? node : (node && node.parentElement);
    if(!el) return null;
    return el.closest(".req") || el.closest(".typegroup") || el;
  }
  function translateChangedNodes(records){
    const roots = new Set();
    records.forEach(function(record){
      if(record.type === "childList"){
        record.addedNodes.forEach(function(node){
          const root = i18nRootFor(node);
          if(root) roots.add(root);
        });
      }else if(record.type === "characterData"){
        const root = i18nRootFor(record.target);
        if(root) roots.add(root);
      }
    });
    roots.forEach(function(root){
      if(root.isConnected) translateDOM(root);
    });
  }
  function installI18nObserver(){
    if(i18nObserver || typeof MutationObserver === "undefined") return;
    i18nObserver = new MutationObserver(function(records){
      if(i18nPending || state.language !== "en") return;
      i18nPending = true;
      Promise.resolve().then(function(){
        i18nPending = false;
        if(state.language === "en") translateChangedNodes(records);
      });
    });
    i18nObserver.observe(document.body, { childList:true, subtree:true, characterData:true });
  }
  function mdCell(value){
    return String(value == null ? "" : value).replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim() || "—";
  }
  function mdLine(value){
    return String(value == null ? "" : value).replace(/\r?\n/g, " ").trim();
  }
  function autoGrow(el){
    if(!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 300) + "px";
  }
  /* Growth is a forced synchronous layout, so it is applied to open rows only. */
  function growRowTextareas(row){
    if(!row) return;
    $$("textarea", row).forEach(autoGrow);
  }
  function positionToast(){
    const toast = $("#toast");
    const theme = $("#themeBtn");
    if(!toast || !theme) return;
    const rect = theme.getBoundingClientRect();
    if(!rect.width) return;
    const gap = 8;
    const right = Math.max(8, document.documentElement.clientWidth - rect.left + gap);
    toast.style.right = right + "px";
    const height = toast.offsetHeight || 34;
    toast.style.top = Math.max(8, rect.top + (rect.height - height) / 2) + "px";
  }
  function showToast(message, kind){
    const toast = $("#toast");
    const text = $("#toastText");
    const icon = $("#toastIcon");
    if(!toast || !text || !icon) return;
    /* Every toast goes through the same TR→EN dictionary and pattern rules.
       Call sites may already translate; translating an English result is a
       harmless no-op in EN mode and leaves TR output untouched. */
    text.textContent = translateString(message);
    toast.classList.toggle("toast--error", kind === "error");
    icon.innerHTML = kind === "error" ? ICON_ALERT : ICON_CHECK;
    positionToast();
    toast.classList.add("is-open");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ toast.classList.remove("is-open"); }, 3400);
  }
  function setSaveStatus(kind){
    const el = $("#saveStatus");
    if(!el) return;
    el.classList.remove("is-saving", "is-error");
    if(kind === "saving"){
      el.classList.add("is-saving");
      el.textContent = "Oto. Kayıt…";
    }else if(kind === "error"){
      el.classList.add("is-error");
      el.textContent = "Oto. Kayıt hatası";
    }else{
      el.textContent = "Oto. Kayıt " + formatTime();
    }
  }
  function downloadBlob(blob, filename){
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 6000);
  }
  function readAsDataURL(blob){
    return new Promise(function(resolve, reject){
      const reader = new FileReader();
      reader.onload = function(){ resolve(reader.result); };
      reader.onerror = function(){ reject(reader.error || new Error("Dosya okunamadı")); };
      reader.readAsDataURL(blob);
    });
  }
  function readAsArrayBuffer(blob){
    return new Promise(function(resolve, reject){
      const reader = new FileReader();
      reader.onload = function(){ resolve(reader.result); };
      reader.onerror = function(){ reject(reader.error || new Error("Dosya okunamadı")); };
      reader.readAsArrayBuffer(blob);
    });
  }
  function utf8Bytes(value, withBom){
    const encoded = new TextEncoder().encode(String(value));
    if(!withBom) return encoded;
    const out = new Uint8Array(encoded.length + 3);
    out.set([0xEF, 0xBB, 0xBF], 0);
    out.set(encoded, 3);
    return out;
  }
  function extFromMime(type){
    if(type === "image/jpeg") return "jpg";
    if(type === "image/png") return "png";
    if(type === "image/webp") return "webp";
    if(type === "image/gif") return "gif";
    if(type === "image/avif") return "avif";
    if(type === "image/bmp") return "bmp";
    return "png";
  }
  function imageFileName(req, index, img){
    const base = String(req.id || "istek").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "istek";
    const ext = String(img.ext || extFromMime(img.type) || "webp").replace("jpeg", "jpg");
    return "gorseller/" + base + "-" + (index + 1) + "." + ext;
  }
  function extFromFileName(name){
    const match = /\.([A-Za-z0-9]{1,10})$/.exec(String(name || ""));
    return match ? match[1].toLowerCase() : "";
  }
  function safeFileBase(name){
    let base = String(name || "dosya").replace(/\.[^.]+$/, "");
    base = base.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i");
    base = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return base || "dosya";
  }
  function attachmentFileName(req, index, att){
    const idBase = String(req.id || "istek").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "istek";
    const ext = String(att.ext || extFromFileName(att.name) || "dat").replace(/[^a-z0-9]/g, "") || "dat";
    return "dosyalar/" + idBase + "-" + (index + 1) + "-" + safeFileBase(att.name) + "." + ext;
  }
  function formatBytes(bytes){
    const value = Number(bytes) || 0;
    if(value < 1024) return value + " B";
    if(value < 1024 * 1024) return (value / 1024).toFixed(1).replace(".", ",") + " KB";
    return (value / (1024 * 1024)).toFixed(1).replace(".", ",") + " MB";
  }
