/* ============================================================
   Request Ledger · panel (Phase 2 compose + Phase 4 archive)
   Roles: ?role=dock | ?role=flyout
   Contract: extension/docs/panel-protocol.md
   - no inline handlers; every listener lives here
   - host messages: postMessage(..., "*"), source-checked on receive
   - dock <-> flyout: BroadcastChannel("rl-panel")
   - domain logic/persistence: IstekCore only (src/core.js is read-only)

   Local i18n keys (not present in the core dictionary):
   create, cancel, saving, saveAsDraft, revoke, revoked,
   requestAdded, notRequired, takeFromTab, selectElement, phase8,
   addFile, draftSaved, cancelPrompt, descRequired, imageLimit,
   onlyImages, fileLimit, plus the Phase 4 archive keys in `L`
   (open, duplicateTitle, *Deleted/*Cleared, clearTitle, …).
   ============================================================ */
(function(){
  "use strict";

  var params = new URLSearchParams(window.location.search);
  var role = params.get("role") === "flyout" ? "flyout" : "dock";
  var demo = params.get("demo") === "1";
  var hasHost = window.parent !== window;
  /* The dock host appends the real tab id. Pin and panel theme are stored per
     tab in chrome.storage.session; a standalone panel page (no tab) keeps the
     historical global keys. */
  var panelTabScope = Number(params.get("tab")) || 0;
  function prefKey(name){
    return panelTabScope > 0 ? name + ":" + panelTabScope : name;
  }
  var core = window.IstekCore || null;

  var state = {
    role: role,
    lang: "en",
    theme: "light",       // computed light|dark
    themePref: "system",  // light|dark|system (persisted as rl-theme)
    mode: "idle",     // dock only
    dock: "collapsed", // dock only: launcher (collapsed) | rail (open)
    pinned: false,    // dock only: rl-pinned (no auto-hide, auto-open on load)
    side: "right",    // shell v9: right (default) | left, persisted as rl-side
    active: null,     // dock only (open section id)
    section: null,    // flyout only (rendered section id)
    saving: "saved",
    highlight: null
  };

  var app = null;
  var activeRequestId = null;
  /* shell v11: per-document identity for cross-page sync stamps */
  var instanceId = "rl-" + role + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  /* shell v11: whether the rail is showing the normal menu (project exists) */
  var projectGateOn = null;
  /* shell v10: the creation wizard owns an in-memory draft until the final
     Desc "Kaydet"; it is never part of app.requests and is never persisted. */
  var pendingRequest = null;
  var dockSummary = null;
  var dockCount = 0;
  var dockReady = 0;

  /* shell v7: compose close guard + launcher/folder/stats state */
  var composeDirty = false;
  var folderDirs = { root:"", export:"" };
  var listSaveTimer = null;
  var openSelWrap = null;

  var draftType = "update";
  var draftPriority = "normal";
  var draftTitle = "";
  var cancelConfirm = false;
  var missingField = null;
  var thumbUrls = {};
  /* shell v14: in-panel image preview. The image is rendered by this
     document only; the host receives geometry, never image bytes. */
  var imagePreview = null;
  var imageQueue = Promise.resolve();
  var saveTimer = null;
  var savedFadeTimer = null;
  var lastSavedAt = 0;
  var searchTimer = null;
  var storageOk = true;
  var storageNotified = false;
  var storageBlockedNodes = [];
  var storageFailureReason = "";
  var mediaStorageOk = true;

  var listFilter = { q:"", type:"all", status:"all" };
  var openRowMenuId = null;
  var listDeleteId = null;
  var tpOpen = false;
  var lastScrolledSelection = null;

  var archiveTab = "list";
  var archiveScroll = { list:0, history:0, records:0, drafts:0 };

  /* workspace / projects (Phase 2b): one registry lists every project and each
     project keeps its own ledger under PROJECT_LEDGER_PREFIX + id. The active
     project id is also the IndexedDB scope for media and snapshots. */
  var activeProjectId = null;
  var projectRegistry = null;
  var projectSnapshot = "";
  var migratedProjectId = null;
  var projectFormOpen = false;
  var projectCreatePending = null;
  var projectSwitchPending = null;
  var projectSettingsId = null;
  var projectSettingsCounts = null;
  var projectDeleteConfirm = false;
  var projectExportPick = null;
  var archiveProjectQuery = "";
  var archiveSelectedProjectId = null;
  var settingsTab = "system";
  var settingsScroll = { system:0, config:0, about:0 };
  var settingsChangelogOpen = {};
  var archiveData = { records:[], drafts:[], history:[], loaded:false, loading:null };
  var duplicatePrompt = null;
  var archiveDelete = null;
  var archiveClear = null;
  var archiveRenameId = null;
  var archiveDetail = null;

  /* Phase 5 export wizard (replaces the İstekler tab content in place) */
  var exportWizard = null;   /* { step:1|2, format:"zip"|"embedded", includeSummary:bool, busy:bool } */
  var exportCleanup = null;  /* { fileName } — "Talepleri temizle?" prompt after a successful export */
  var planMode = null;
  var planQuestion = null;
  var planRuntime = null;
  var planTransfers = [];
  var planAgents = [];
  var planTest = null;
  var planNote = "";

  /* Phase 6 backup / restore */
  var backupPending = null;  /* { kind:"restore", data, entries, count, records, drafts } | { kind:"clear" } */
  var backupBusy = false;

  /* Phase 8 — tab picker / screenshot / element picker */
  var originTabId = null;     /* dock cache; flyouts resolve their own tab */
  var panelPageToken = "";    /* host page token: channel messages are page-local */
  var panelToolBusyUntil = 0; /* pick/capture result is being written */
  var originWaiters = [];     /* pending fallback callbacks, never cross-tab authoritative */
  var tabPicker = null;       /* { el, mode:"capture"|"pick", tabs, index } */
  var capturePending = false;
  var pickPending = false;
  var panelReturnFocusId = null;
  var captureTimer = null;
  var pickTimer = null;
  var PENDING_TIMEOUT = 75 * 1000; /* worker overlay timeout is 60s */

  var els = {};
  var topItems = [];
  var channel = null;
  var lastSize = -1;
  var flyoutMaxAvailable = 0;
  var pendingMode = null;
  var pendingSection = null;
  var pendingFocus = null;
  var pendingDock = null;
  var pendingDockOpts = null;
  var pendingArrowY = null;
  var themePinned = false;
  var dockTimer = null;
  var launcherTimer = null;

  /* shell v3: callout + pin / auto-hide */
  var AUTO_HIDE_MS = 5000;      /* unpinned rail closes after 5s idle        */
  var CALLOUT_DELAY = 400;      /* bubble appears ~400ms after boot          */
  var CALLOUT_VISIBLE = 4000;   /* ...and fades out after 4s                 */
  var CALL_OUT_MS = 200;        /* opacity/translateY ease out               */
  var autoHideTimer = null;
  var calloutTimer = null;
  var calloutHideTimer = null;
  var calloutShown = false;     /* once per page load                        */

  /* shell v4: horizontal rail drag (host owns the actual frame motion) */
  var dragState = null;         /* { pointerId,startX,lastX,pendingX,moved,raf } */
  var dragSuppressUntil = 0;    /* ignore the click/dblclick after a real drag   */

  /* shell v8: active-request title marquee (dock only) */
  var MARQUEE_SPEED = 18;       /* px per second                                */
  var marquee = null;           /* { el, track, text, offset, width, textWidth,
                                   last, dragging, ... }                         */

  /* shell v9: only one rail hint (item/folder/stats) is active at a time */
  var railHintOwner = null;

  /* ---------- shared constants ---------- */

  /* Phase 2b workspace keys. The legacy single-ledger key is kept as the
     migration source and is never deleted. */
  var PROJECTS_KEY = "oz-projeler-v1";
  var PROJECT_LEDGER_PREFIX = "oz-istek-defteri-p-";
  var PROJECT_SCOPE_KEY = "oz-veri-kapsam-v1";
  var LEGACY_STORAGE_KEY = "oz-istek-defteri-v1";

  var ICONS = {
    mark: '<svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true"><rect x="2" y="2" width="60" height="60" rx="18" fill="var(--accent)"/><rect x="14" y="17" width="24" height="5" rx="2.5" fill="var(--paper)"/><rect x="14" y="26.5" width="30" height="5" rx="2.5" fill="var(--paper)"/><rect x="14" y="36" width="15" height="5" rx="2.5" fill="var(--paper)"/><rect x="38" y="37" width="20" height="20" rx="6.5" fill="var(--paper)"/><path d="M42.4 47.1l3.5 3.5 7.1-7.5" fill="none" stroke="var(--sage-deep)" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    plus: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    list: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
    folder: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    folderRoot: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 16v-5M9.6 13l2.4-2.4 2.4 2.4"/></svg>',
    folderExport: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M10 16l5-5M10.5 11H15v4.5"/></svg>',
    doc: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 4h14v16H5z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
    file: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/></svg>',
    check: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>',
    cancel: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    settings: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    backup: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 7h16v13H4z"/><path d="M8 7V4h8v3M9 13l2 2 4-4"/></svg>',
    upload: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M4 21h16"/></svg>',
    help: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.2 2.4c-.7.3-1.2 1-1.2 1.8v.3M12 17h.01"/></svg>',
    pin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 3h5l-.8 5.6 3.3 2.6v2H13v6.3l-1 2-1-2V13.2H7v-2l3.3-2.6z"/></svg>',
    grip: '<svg width="14" height="12" viewBox="0 0 14 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M2 2h10M2 6h10M2 10h10"/></svg>',
    image: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5L5 20"/></svg>',
    search: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>',
    chevronLeft: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    chevronRight: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    chevronDown: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    chevronUp: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
    camera: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.2-1.6h5.6L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.2"/></svg>',
    crosshair: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="6.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>',
    pickCapture: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.2-1.6h5.6L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.2"/><path d="M12 7.9v1.4M12 15.7v1.4M8.9 12.5h1.4M13.7 12.5h1.4"/></svg>',
    export: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4M8 8l4-4 4 4"/><path d="M4 14v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/></svg>',
    warn: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5L22 20H2z" fill="currentColor" fill-opacity=".16"/><path d="M12 9v5M12 17.2h.01"/></svg>'
  };

  var SECTION_SPECS = {
    new:      { id:"new",      label:"Yeni istek", title:"Yeni istek",   iconKey:"plus",     primary:true },
    list:     { id:"list",     label:"İstekler",   title:"İstekler",     iconKey:"list",     badge:true },
    detail:   { id:"detail",   label:"İstek",      title:"İstek",        iconKey:"doc",      badge:true },
    page:     { id:"page",     label:"Sayfa",      title:"Sayfa",        iconKey:"folder",   badge:true },
    desc:     { id:"desc",     label:"Açıklama",   title:"Açıklama",     iconKey:"doc",      badge:true },
    export:   { id:"export",   label:"Hazır",      title:"Hazır",        iconKey:"check",    ready:true, hook:"ready" },
    backup:   { id:"backup",   label:"Yedek",      title:"Yedek",        iconKey:"backup" },
    help:     { id:"help",     label:"Yardım",     title:"Yardım",       iconKey:"help" }
  };

  /* archive tabs inside the İstekler section (index.html parity) */
  var ARCHIVE_TABS = [
    { id:"list",    label:"İstekler" },
    { id:"history", label:"Dışa Aktarılanlar" },
    { id:"records", label:"Kayıtlar" },
    { id:"drafts",  label:"Taslaklar" }
  ];
  var ARCHIVE_TAB_IDS = {};
  ARCHIVE_TABS.forEach(function(tab){ ARCHIVE_TAB_IDS[tab.id] = true; });

  /* local strings; anything listed here is not in core's dictionary yet */
  var L = {
    create:      { tr:"Oluştur", en:"Create" },
    openPanel:   { tr:"Paneli aç", en:"Open panel" },
    closePanel:  { tr:"Paneli kapat", en:"Close panel" },
    calloutHint: { tr:"Paneli açmak için tıkla", en:"Click to open the panel" },
    pinPanel:    { tr:"Paneli sabitle", en:"Pin panel" },
    unpinPanel:  { tr:"Sabitlemeyi kaldır", en:"Unpin panel" },
    dragHandle:  { tr:"Paneli sola/sağa taşı · çift tıkla: sağa sabitle", en:"Move panel left/right · double-click: dock to the right" },
    utilToggle:  { tr:"Araçları göster / gizle", en:"Show / hide tools" },
    sideLabel:   { tr:"Panel tarafı", en:"Panel side" },
    sideRight:   { tr:"Sağ", en:"Right" },
    sideLeft:    { tr:"Sol", en:"Left" },
    sideHint:    { tr:"Panel ve bölüm yerleşimini belirler.", en:"Sets the panel and section side." },
    cancel:      { tr:"İptal", en:"Cancel" },
    saving:      { tr:"Kaydediliyor…", en:"Saving…" },
    optionalSuffix:{ tr:"(opsiyonel)", en:"(optional)" },
    titleRequired:{ tr:"Başlık zorunludur.", en:"Title is required." },
    attachmentDesignOnly:{ tr:"Dosya eki yalnızca Tasarım türünde kullanılabilir.", en:"Attachments are only available for the Design type." },
    saveList:    { tr:"Listeyi Kaydet", en:"Save list" },
    projectHint: { tr:"Dışa aktarma, yedek ve kayıt adlarında kullanılır.", en:"Used in export, backup and record names." },
    newProject:  { tr:"+ Yeni Proje", en:"+ New Project" },
    newProjectTitle:{ tr:"Yeni Proje", en:"New Project" },
    projectName: { tr:"Proje adı", en:"Project name" },
    projectNamePh:{ tr:"Örn. Projem", en:"e.g. My project" },
    projectCreateHint:{ tr:"Proje adı girildiğinde istek menüleri ve üst şerit açılır.", en:"Entering a project name reveals the request menu and the top marquee." },
    projectSaved:{ tr:"Proje oluşturuldu.", en:"Project created." },
    projectRequired:{ tr:"Proje adı zorunludur.", en:"Project name is required." },
    projectImported:{ tr:"İçe aktarılan proje", en:"Imported project" },

    /* workspace / projects (Phase 2b) */
    projects:    { tr:"Projeler", en:"Projects" },
    projectsSearch:{ tr:"Projelerde ara…", en:"Search projects…" },
    projectsEmpty:{ tr:"Henüz proje yok. Yeni bir proje oluştur.", en:"No projects yet. Create a new project." },
    projectsNoMatch:{ tr:"Proje bulunamadı.", en:"No project found." },
    projectNew:  { tr:"+ Yeni proje", en:"+ New project" },
    projectPickHint:{ tr:"Açmak için bir proje seç.", en:"Choose a project to open." },
    projectOpenBtn:{ tr:"Projeyi aç", en:"Open project" },
    projectCurrentlyOpen:{ tr:"Şu an açık", en:"Currently open" },
    projectSettingsTitle:{ tr:"Proje ayarları", en:"Project settings" },
    projectCreatedAt:{ tr:"Oluşturma", en:"Created" },
    projectUpdatedAt:{ tr:"Güncelleme", en:"Updated" },
    projectRequestCount:{ tr:"İstek", en:"Requests" },
    projectRecordCount:{ tr:"Kayıt", en:"Records" },
    projectDraftCount:{ tr:"Taslak", en:"Drafts" },
    projectExportTarget:{ tr:"Dışa aktarım hedefi", en:"Export target" },
    projectTargetNone:{ tr:"Seçilmedi", en:"Not selected" },
    projectDeleteBtn:{ tr:"Projeyi sil", en:"Delete project" },
    projectDeleteTitle:{ tr:"Proje silinsin mi?", en:"Delete this project?" },
    projectDeleteMsg:{ tr:"Bu projedeki tüm talepler, görseller, kayıtlar, taslaklar ve dışa aktarılanlar kalıcı olarak silinecek. Sunucu modunda projects/ klasörü de silinir. Silinen projeler bölümünden geri yükleyebilmek için yedek saklamak ister misin?", en:"Every request, image, record, draft and export in this project will be permanently deleted. In server mode the projects/ folder is deleted too. Do you want to keep a backup so it can be restored from the deleted projects section?" },
    projectDeleteWithBackup:{ tr:"Yedekle ve sil", en:"Back up and delete" },
    projectDeleteNoBackup:{ tr:"Yedeksiz sil", en:"Delete without backup" },
    projectLastGuard:{ tr:"Son proje silinemez.", en:"The last project cannot be deleted." },
    projectDeleted:{ tr:"Proje silindi.", en:"Project deleted." },
    projectRenamed:{ tr:"Proje adı güncellendi.", en:"Project name updated." },
    projectRegistryFailed:{ tr:"Proje listesi güncellenemedi.", en:"The project list could not be updated." },
    projectSwitchTitle:{ tr:"Projeyi değiştir", en:"Switch project" },
    projectSwitchMsg:{ tr:"Kaydedilmemiş değişiklikler var. Devam etmek için kaydet veya kaydetmeden geç.", en:"There are unsaved changes. Save before switching or switch without saving." },
    projectCreateMsg:{ tr:"Yeni proje oluşturulacak. Kaydedilmemiş değişiklikler var. Devam etmek için kaydet veya kaydetmeden geç.", en:"A new project will be created. There are unsaved changes. Save before continuing or continue without saving." },
    projectSaveAndSwitch:{ tr:"Kaydet ve geç", en:"Save and switch" },
    projectSwitchWithoutSaving:{ tr:"Kaydetmeden geç", en:"Switch without saving" },
    projectSaveAndCreate:{ tr:"Kaydet ve oluştur", en:"Save and create" },
    projectCreateWithoutSaving:{ tr:"Kaydetmeden oluştur", en:"Create without saving" },
    projectChooseTarget:{ tr:"Klasör seç", en:"Choose folder" },
    projectClearTarget:{ tr:"Temizle", en:"Clear" },
    projectTargetCleared:{ tr:"Dışa aktarım hedefi kaldırıldı.", en:"Export target cleared." },
    projectTargetSet:{ tr:"Dışa aktarım hedefi: {name}", en:"Export target: {name}" },
    projectSettingsFailed:{ tr:"Proje ayarları açılamadı.", en:"Project settings could not be opened." },
    projectSearchClear:{ tr:"Aramayı temizle", en:"Clear search" },
    projectMetaFormat:{ tr:"{date} · {count} istek", en:"{date} · {count} requests" },
    projectCountFormat:{ tr:"{count} istek", en:"{count} requests" },
    filesTitle:  { tr:"Dosyalar", en:"Files" },
    filesNote:   { tr:"Tüm dosya türleri · en fazla {n} dosya · dosya başına en fazla {mb} MB", en:"All file types · up to {n} files · max {mb} MB per file" },
    supportLabel:{ tr:"Destek", en:"Support" },
    areaExtension:{ tr:"eklenti", en:"extension" },
    areaWeb:     { tr:"web uygulaması", en:"web app" },
    openImage:   { tr:"Görseli aç", en:"Open image" },
    imageModalFailed:{ tr:"Görsel açılamadı.", en:"Could not open the image." },
    imageLoading:{ tr:"Görsel yükleniyor…", en:"Loading image…" },
    imagesAdded: { tr:"{n} görsel eklendi.", en:"{n} image(s) added." },
    filesAdded:  { tr:"{n} dosya eklendi.", en:"{n} file(s) added." },
    saveAsDraft: { tr:"Taslağa kaydet", en:"Save as draft" },
    revoke:      { tr:"Onayı geri al", en:"Revoke confirmation" },
    unlock:      { tr:"Onayı çek", en:"Release approval" },
    revoked:     { tr:"Onay geri alındı", en:"Confirmation revoked" },
    requestAdded:{ tr:"İstek eklendi", en:"Request added" },
    notRequired: { tr:"Bu tür için gerekli değil", en:"Not required for this type" },
    takeFromTab: { tr:"bu sekmeden al", en:"take from this tab" },
    selectElement:{ tr:"Element seç", en:"Select element" },
    phase8:      { tr:"Faz 8", en:"Phase 8" },
    addFile:     { tr:"Dosya ekle", en:"Add file" },
    draftSaved:  { tr:"Taslak kaydedildi.", en:"Draft saved." },
    cancelPrompt:{ tr:"Taslağa kaydet, sil veya vazgeç.", en:"Save as draft, delete, or go back." },
    descRequired:{ tr:"Açıklama zorunludur.", en:"Description is required." },
    imageLimit:  { tr:"Bir satıra en fazla {n} görsel eklenebilir.", en:"Up to {n} images can be added to a request." },
    onlyImages:  { tr:"Yalnızca görsel dosyaları eklenebilir.", en:"Only image files can be added." },
    fileLimit:   { tr:"Bir satıra en fazla {n} dosya eklenebilir.", en:"Up to {n} files can be added to a request." },
    comingSoon:  { tr:"Yakında", en:"Coming soon" },
    search:      { tr:"Başlık, sayfa, açıklama veya notta ara…", en:"Search title, page, description or note…" },
    allTypes:    { tr:"Tümü", en:"All" },
    allStatuses: { tr:"Tüm durumlar", en:"All states" },
    noMatch:     { tr:"Filtreye uyan istek yok", en:"No requests match the filter" },
    noMatchSub:  { tr:"Arama veya filtreleri temizleyerek tüm istekleri görebilirsin.", en:"Clear the search or filters to see every request." },
    noPage:      { tr:"Sayfa belirtilmedi", en:"No page specified" },
    noRequestsToSave:{ tr:"Kaydedilecek istek yok.", en:"There are no requests to save." },
    recordFailed:{ tr:"Kayıt oluşturulamadı.", en:"Could not create the record." },
    duplicated:  { tr:"İstek çoğaltıldı.", en:"Request duplicated." },
    deleteRow:   { tr:"Bu istek silinsin mi?", en:"Delete this request?" },
    deleteRowSub:{ tr:"İstek ve görselleri kalıcı olarak silinir. Bu işlem geri alınamaz.", en:"The request and its images will be deleted. This cannot be undone." },
    allReady:    { tr:"Tüm talepler hazır.", en:"All requests are ready." },
    rowActions:  { tr:"Satır işlemleri", en:"Row actions" },
    typePriority:{ tr:"Tür ve öncelik", en:"Type and priority" },
    imgHint:     { tr:"Ctrl+V · sürükle-bırak · dosya seç", en:"Ctrl+V · drag & drop · choose a file" },
    imageFallback:{ tr:"görsel", en:"image" },
    storageUnavailable:{ tr:"Depolama kullanılamıyor — veriler kaydedilemez", en:"Storage unavailable — changes cannot be saved" },
    storageWriteFailed:{ tr:"Kayıt yazılamadı. Tarayıcı depolaması dolu veya kapalı.", en:"Could not save. Browser storage is full or unavailable." },
    storageFull:{ tr:"Depolama dolu. Yedek alıp Yedekleme → Temizle ile eski verileri kaldır.", en:"Storage is full. Export a backup, then use Backup → Clear to remove old data." },
    quotaExceeded:{ tr:"Depolama alanı doldu. Görsel eklenemedi.", en:"Storage is full. The image could not be added." },

    /* live bridge (web app <-> extension) */
    bridgeTitle: { tr:"Canlı bağlantı", en:"Live connection" },
    bridgeConnected:{ tr:"Uygulamaya bağlı", en:"Connected to app" },
    bridgeOffline:{ tr:"Uygulama açık değil", en:"App not open" },
    bridgeConflictShort:{ tr:"Defter seçimi bekliyor", en:"Ledger choice pending" },
    bridgeDifferentProject:{ tr:"Farklı proje açık", en:"Different project open" },
    bridgeServerStopped:{ tr:"Uygulama sunucusu durduruldu", en:"App server stopped" },
    bridgeOutdated:{ tr:"Uygulama sürümü eski", en:"App build is outdated" },
    bridgeOutdatedToast:{ tr:"Uygulama sürümü eski — güncelleyin.", en:"App build is outdated — update it." },
    companionLockTitle:{ tr:"Eklentiyı kullanmak için Request Ledger uygulamasını aç", en:"Open the Request Ledger app to use the extension" },
    companionLockBody:{ tr:"Eklenti uygulamayla birlikte çalışır. Uygulama kapalıyken düzenleme, dışa aktarma ve yedekleme kilitlidir.", en:"The extension works with the app. Editing, export and backup are locked while the app is closed." },
    companionChecking:{ tr:"Uygulama aranıyor…", en:"Looking for the Request Ledger app…" },
    companionRetry:{ tr:"Yeniden kontrol et", en:"Check again" },
    companionDraftDiscarded:{ tr:"Uygulama kapandı; gönderilmemiş taslak atıldı.", en:"The app closed; the unsent draft was discarded." },
    openProjectInApp:{ tr:"Projeyi uygulamada aç.", en:"Open a project in the app." },
    bridgeConflictTitle:{ tr:"İki defter bulundu", en:"Two ledgers found" },
    bridgeConflictHint:{ tr:"Uygulama ve eklenti farklı defterler içeriyor. Hangisi kullanılsın? Uygulamadaki defter varsayılandır.", en:"The app and the extension hold different ledgers. Which one should be used? The app ledger is the default." },
    bridgeUseApp:{ tr:"Uygulamadaki defter", en:"Use app ledger" },
    bridgeUseExtension:{ tr:"Eklentidaki defter", en:"Use extension ledger" },
    bridgeMediaNote:{ tr:"Metinler canlı eşitlenir. Görseller ve dosya ekleri yalnızca ZIP yedeğiyle taşınır.", en:"Text syncs live. Images and attachments travel only with a backup ZIP." },

    /* Phase 8 — tabs / screenshot / element picker */
    screenshot:  { tr:"Ekran alıntısı", en:"Screenshot" },
    pickElement: { tr:"Sayfadan element seç", en:"Pick element from page" },
    pickCapture: { tr:"Element seç ve ekran alıntısı al", en:"Pick element and capture a screenshot" },
    pickCaptureDone:{ tr:"Konum ve element görseli eklendi.", en:"Location and element image added." },
    pickCapturePartial:{ tr:"Konum eklendi; element görseli alınamadı.", en:"Location added; the element image could not be captured." },
    pickerCaptureTitle:{ tr:"Ekran alıntısı için sekme seç", en:"Choose a tab to capture" },
    pickerPickTitle:{ tr:"Element seçmek için sekme seç", en:"Choose a tab to pick an element" },
    tabListLoading:{ tr:"Sekmeler yükleniyor…", en:"Loading tabs…" },
    tabListFailed:{ tr:"Sekme listesi alınamadı", en:"Could not load the tab list" },
    thisTab:     { tr:"bu sekme", en:"this tab" },
    tabOpening:  { tr:"Sekme açılıyor…", en:"Opening tab…" },
    captureCancelled:{ tr:"İptal edildi", en:"Cancelled" },
    pickCancelled:{ tr:"Seçim iptal edildi", en:"Selection cancelled" },
    captureFailed:{ tr:"Ekran alıntısı alınamadı.", en:"Could not capture the screen." },
    captureTimeout:{ tr:"Ekran alıntısı zaman aşımına uğradı.", en:"Screen capture timed out." },
    captureTabClosed:{ tr:"Sekme kapandı; ekran alıntısı alınamadı.", en:"The tab closed; the screen could not be captured." },
    captureUnavailable:{ tr:"Sayfaya ulaşılamadı; ekran alıntısı alınamadı.", en:"The page could not be reached; the screen could not be captured." },
    pickFailed:  { tr:"Element seçilemedi.", en:"Could not pick the element." },
    pickTimeout: { tr:"Element seçimi zaman aşımına uğradı.", en:"Element picking timed out." },
    pickTabClosed:{ tr:"Sekme kapandı; element seçilemedi.", en:"The tab closed; the element could not be picked." },
    pickUnavailable:{ tr:"Sayfaya ulaşılamadı; element seçilemedi.", en:"The page could not be reached; the element could not be picked." },
    pickDone:    { tr:"Konum seçildi.", en:"Location selected." },

    /* shell v8 — active title marquee + console fetch */
    untitledRequest:{ tr:"Başlıksız istek", en:"Untitled request" },
    fetchConsole:{ tr:"Konsoldan al", en:"Fetch from console" },
    consoleFetchHint:{ tr:"Aktif sekmenin konsol hatalarını doldurur.", en:"Fills in the active tab's console errors." },
    consoleEmpty:{ tr:"Konsolda hata kaydı yok.", en:"No console errors recorded." },
    consoleFetchFailed:{ tr:"Konsol kayıtları okunamadı.", en:"Could not read the console records." },

    open:        { tr:"Aç", en:"Open" },
    back:        { tr:"Geri", en:"Back" },
    duplicateTitle:{ tr:"Aynı liste zaten kayıtlı", en:"This list is already saved" },
    recordUpdated:{ tr:"Kayıt güncellendi.", en:"Record updated." },
    recordDeleted:{ tr:"Kayıt silindi.", en:"Record deleted." },
    draftDeleted:{ tr:"Taslak silindi.", en:"Draft deleted." },
    historyDeleted:{ tr:"Dışa aktarım silindi.", en:"Export deleted." },
    recordsCleared:{ tr:"Kayıtlar temizlendi.", en:"Records cleared." },
    draftsCleared:{ tr:"Taslaklar temizlendi.", en:"Drafts cleared." },
    historyCleared:{ tr:"Dışa Aktarılanlar temizlendi.", en:"Exported cleared." },
    clearTitle:  { tr:"{label} temizlensin mi?", en:"Clear {label}?" },
    clearSub:    { tr:"Bu bölümdeki tüm kayıtlar silinecek. Mevcut istekler etkilenmez. Devam etmek istiyor musun?", en:"Every entry in this section will be deleted. Current requests are not affected. Continue?" },
    recordDeleteTitle:{ tr:"Kayıt silinsin mi?", en:"Delete this record?" },
    draftDeleteTitle:{ tr:"Taslak silinsin mi?", en:"Delete this draft?" },
    historyDeleteTitle:{ tr:"Dışa aktarım silinsin mi?", en:"Delete this export?" },
    deleteSub:   { tr:"Kalıcı olarak silinecek. Bu işlem geri alınamaz.", en:"It will be permanently deleted. This action cannot be undone." },
    noSnapshotRequests:{ tr:"Bu kayıtta yüklenecek istek yok.", en:"This record has no requests to load." },
    autoDraftReason:{ tr:"Yükleme öncesi otomatik taslak", en:"Automatic draft before loading" },
    recordHint:  { tr:"Kaydet ikonuyla alınan anlık kayıtlar.", en:"Instant records taken with the Save icon." },
    draftHint:   { tr:"Yükleme öncesi otomatik alınan taslaklar.", en:"Drafts captured automatically before loading." },
    historyHint: { tr:"Dışa aktarılan listeler tarihe göre burada tutulur.", en:"Exported lists are kept here by date." },
    exported:    { tr:"Dışa aktarıldı", en:"Exported" },
    notExported: { tr:"Henüz dışa aktarılmadı", en:"Not exported yet" },
    missingFields:{ tr:"Eksik alan var", en:"Missing fields" },
    contentsMissing:{ tr:"İçerik bulunamadı.", en:"No content found." },

    /* Phase 5 — export wizard */
    nextStep:    { tr:"Sonraki adım", en:"Next step" },
    prevStep:    { tr:"Önceki adım", en:"Previous step" },
    preparing:   { tr:"Hazırlanıyor…", en:"Preparing…" },
    zipHint:     { tr:"Markdown ayrı dosya; görseller ve dosya ekleri ayrı ZIP içinde sıkıştırılır. Medya yoksa yalnızca .md iner.", en:"Markdown as a separate file; images and attachments are packed into a separate ZIP. Without media only the .md is downloaded." },
    mdHint:      { tr:"Görseller dosyanın içine base64 olarak gömülür. Dosya ekleri yalnızca ZIP ile taşınır.", en:"Images are embedded in the file as base64. Attachments are only carried by the ZIP." },
    planIntro:   { tr:"İsteklerin nasıl gerçekleştirileceğini seç. Dışa Aktar ile çıktı oluşturulacak.", en:"Choose how the requests should be carried out. Export creates the output." },
    planQuestion:{ tr:"Soru ve Öneri", en:"Questions and Suggestions" },
    transferHint:{ tr:"Sunucu ve gofile.io birlikte seçilebilir. “Transfer yok” seçilirse diğer seçimler iptal edilir.", en:"Server and gofile.io can be selected together. Selecting “No transfer” cancels the other selections." },
    notePlaceholder:{ tr:"Bu plana özel eklemek istediğin not…", en:"A note specific to this plan…" },
    planNeedMode:{ tr:"Planlama türünü seç.", en:"Select a planning type." },
    planNeedQuestion:{ tr:"Soru ve Öneri seçimini yap.", en:"Select an option for Questions and Suggestions." },
    planNeedRuntime:{ tr:"Runtime Paketi seçimini yap.", en:"Select an option for Runtime Package." },
    planNeedTransfer:{ tr:"Paket Transferi seçimini yap.", en:"Select a package transfer option." },
    planNeedTest:{ tr:"Test seçimini yap.", en:"Select a test option." },
    validationPrefix:{ tr:"Eksik seçim: {message}", en:"Missing selection: {message}" },
    downloaded:  { tr:"İndirildi: {name}", en:"Downloaded: {name}" },
    exportFailed:{ tr:"Dışa aktarma başarısız oldu.", en:"Export failed." },
    ledgerCleared:{ tr:"Defter temizlendi. Kayıtlar, Taslaklar ve Dışa Aktarılanlar korundu.", en:"Ledger cleared. Records, Drafts and Exported are preserved." },
    noRequests:  { tr:"Önce en az bir istek ekle.", en:"Add at least one request first." },

    /* Phase 6 — backup / restore */
    backupZip:   { tr:"Tam yedek indir (.zip)", en:"Download full backup (.zip)" },
    backupZipSub:{ tr:"Talepler + Kayıtlar + görseller + dosya ekleri. Her zaman sıkıştırılmış ZIP; sunucu modunda backups/ klasörüne de yazılır.", en:"Requests + Records + images + attachments. Always a compressed ZIP; in server mode it is also written to backups/." },
    backupRestore:{ tr:"Yedekten yükle", en:"Restore from backup" },
    backupRestoreSub:{ tr:".zip dosyası seç. v3 yedekleri tek projeye, v4 yedekleri tüm projelere geri yüklenir.", en:"Choose a .zip file. v3 backups restore into one project; v4 backups restore every project." },
    restoreV4Msg:{ tr:"{projects} proje, {requests} talep ve {records} kayıt geri yüklenecek. Mevcut tüm projeler ve verileri yedekteki verilerle değiştirilecek. Devam etmek istiyor musun?", en:"{projects} projects, {requests} requests and {records} records will be restored. Every current project and its data will be replaced by the backup. Continue?" },
    restoreV4Done:{ tr:"{projects} proje, {requests} talep ve {records} kayıt geri yüklendi.", en:"{projects} projects, {requests} requests and {records} records restored." },
    restoreV3Msg:{ tr:"{requests} talep ve {records} kayıt açık projeye geri yüklenecek. Mevcut talepler ve Kayıtlar yedekteki verilerle değiştirilecek.", en:"{requests} requests and {records} records will be restored into the open project. Current requests and Records will be replaced with the backup data." },
    backupNoProject:{ tr:"Önce bir proje oluştur.", en:"Create a project first." },
    backupWarn:  { tr:"Veriler tarayıcıya bağlıdır. Tarayıcı verisi temizlenirse kayıtlar kaybolur; düzenli yedek almayı unutma.", en:"Data lives in this browser. Clearing browser data deletes the records; remember to take regular backups." },
    backupStatus:{ tr:"{requests} talep · {records} kayıt · {media} medya", en:"{requests} requests · {records} records · {media} media" },
    backupPreparing:{ tr:"Yedek hazırlanıyor…", en:"Preparing the backup…" },
    backupReading:{ tr:"Yedek okunuyor…", en:"Reading the backup…" },
    backupFailed:{ tr:"Yedek oluşturulamadı.", en:"Could not create the backup." },
    clearAll:    { tr:"Tüm verileri temizle", en:"Clear all data" },
    clearProject:{ tr:"Bu projenin verilerini temizle", en:"Clear this project's data" },
    clearProjectMsg:{ tr:"Bu projedeki tüm talepler, görseller, dosyalar, Dışa Aktarılanlar, Kayıtlar ve Taslaklar silinecek. Proje ve diğer projeler korunur. Bu işlem geri alınamaz.", en:"All requests, images, files, Exported, Records and Drafts in this project will be deleted. This project and every other project are kept. This cannot be undone." },
    projectCleared:{ tr:"Proje verileri temizlendi.", en:"Project data cleared." },
    restoreMsg:  { tr:"{count} talep ve {records} kayıt geri yüklenecek. Mevcut talepler ve Kayıtlar yedekteki verilerle değiştirilecek.", en:"{count} requests and {records} records will be restored. Current requests and Records will be replaced with the backup data." },
    restoreMsgRequests:{ tr:"{count} talep geri yüklenecek. Mevcut talepler yedekteki verilerle değiştirilecek.", en:"{count} requests will be restored. Current requests will be replaced with the backup data." },
    restoreConfirm:{ tr:"Geri yükle", en:"Restore" },
    restoreBusy: { tr:"Geri yükleniyor…", en:"Restoring…" },
    restoreDone: { tr:"{count} talep geri yüklendi.", en:"{count} requests restored." },
    restoreRecords:{ tr:"{count} kayıt geri yüklendi.", en:"{count} records restored." },
    missingImages:{ tr:"{count} görsel bulunamadı.", en:"{count} images were missing." },
    missingFiles:{ tr:"{count} dosya bulunamadı.", en:"{count} files were missing." },
    invalidBackup:{ tr:"Geçersiz yedek dosyası.", en:"Invalid backup file." },
    clearAllMsg: { tr:"Tüm talepler, görseller, dosyalar, Dışa Aktarılanlar, Kayıtlar ve Taslaklar silinecek. Ajanlar, dil ve tema korunur. Bu işlem geri alınamaz.", en:"All requests, images, files, Exported, Records and Drafts will be deleted. Agents, language and theme are kept. This cannot be undone." },
    clearConfirm:{ tr:"Temizle", en:"Clear" },
    clearing:    { tr:"Temizleniyor…", en:"Clearing…" },
    allCleared:  { tr:"Tüm veriler temizlendi. Ajanlar, dil ve tema korundu.", en:"All data cleared. Agents, language and theme were kept." },
    confirmPending:{ tr:"Onay bekliyor…", en:"Waiting for confirmation…" },

    /* Phase 7 — settings / agents / about / help */
    tabSystem:   { tr:"Sistem", en:"System" },
    tabConfig:   { tr:"Yapılandırma", en:"Configuration" },
    tabAbout:    { tr:"Hakkında", en:"About" },
    systemHint:  { tr:"Dil, tema ve dışa aktarım tercihleri anında uygulanır.", en:"Language, theme and export preferences apply immediately." },
    themeTitle:  { tr:"Tema", en:"Theme" },
    themeLight:  { tr:"Aydınlık", en:"Light" },
    themeDark:   { tr:"Karanlık", en:"Dark" },
    themeSystem: { tr:"Sistem", en:"System" },
    behaviorTitle:{ tr:"Dışa aktarım davranışı", en:"Export behavior" },
    behaviorDefault:{ tr:"Varsayılan", en:"Default" },
    behaviorLast:{ tr:"Son tercihler", en:"Last choices" },
    behaviorInstant:{ tr:"Hemen aktar", en:"Instant export" },
    behaviorHint:{ tr:"“Hemen aktar” kayıtlı son seçimlerle sihirbazı atlar. Tüm istekler hazır ve kayıtlı bir dışa aktarım varsa çalışır.", en:"“Instant export” skips the wizard with the last saved choices. It runs when every request is ready and an export has been saved." },
    rootDir:     { tr:"Kök Dizini", en:"Root Directory" },
    exportDir:   { tr:"Dışa Aktarım Dizini", en:"Export Directory" },
    browserDownloads:{ tr:"İndirilenler (tarayıcı)", en:"Downloads (browser)" },
    folderRootOpen:{ tr:"Kök dizinini aç", en:"Open root directory" },
    folderExportOpen:{ tr:"Dışa aktarım dizinini aç", en:"Open export directory" },
    folderNote:  { tr:"Eklenti dosya sistemine erişemez; çıktılar tarayıcının indirme klasörüne kaydedilir. Klasör seçimi tarayıcı tarafından yönetilir.", en:"The extension has no filesystem access; output goes to the browser download folder. Folder selection is managed by the browser." },
    chooseFolder:{ tr:"Seç", en:"Choose" },
    folderPicked:{ tr:"Klasör seçildi: {name}", en:"Folder selected: {name}" },
    pickerUnavailable:{ tr:"Bu tarayıcıda klasör seçici kullanılamıyor.", en:"The folder picker is not available in this browser." },
    pickerCancelled:{ tr:"Klasör seçimi iptal edildi.", en:"Folder selection was cancelled." },
    pickerFailed:{ tr:"Klasör seçilemedi.", en:"Could not select the folder." },
    chooseFile:  { tr:"Seç", en:"Choose" },
    agentMd:     { tr:"Ajan .md dosyası seç", en:"Choose the agent .md file" },
    statsTitle:  { tr:"İstekler", en:"Requests" },
    statsLabel:  { tr:"İstekler: toplam {total}, hazır {ready}, bekleyen {pending}, hazır oranı %{pct}", en:"Requests: {total} total, {ready} ready, {pending} pending, {pct}% ready" },
    statTotal:   { tr:"Toplam {n}", en:"Total {n}" },
    statReady:   { tr:"Hazır {n}", en:"Ready {n}" },
    statPending: { tr:"Bekleyen {n}", en:"Pending {n}" },
    statPct:     { tr:"Hazır oranı %{n}", en:"Ready ratio {n}%" },
    fromTab:     { tr:"Sekmeden al", en:"From tab" },
    pageFromTab: { tr:"Sayfa adını aktif sekmeden al", en:"Take the page name from the active tab" },
    tabPathFailed:{ tr:"Aktif sekmenin adresi okunamadı.", en:"Could not read the active tab URL." },
    resetSettings:{ tr:"Varsayılanlara Dön", en:"Reset to defaults" },
    resetHint:   { tr:"Dil, tema ve dışa aktarım davranışını varsayılana döndürür; ajanlar korunur.", en:"Resets language, theme and export behavior to defaults; agents are kept." },
    settingsReset:{ tr:"Sistem ayarları varsayılana döndü. Ajanlar korundu.", en:"System settings returned to defaults. Agents were kept." },
    agentsHint:  { tr:"Her satırda görevi seç; ad ve .md yolu isteğe bağlıdır. Ajan seçimi dışa aktarımda zorunlu değildir.", en:"Pick a role for each row; name and .md path are optional. Selecting an agent is not required for export." },
    addAgent:    { tr:"Yeni ajan", en:"New agent" },
    removeAgent: { tr:"Ajanı kaldır", en:"Remove agent" },
    removeImage: { tr:"Görseli kaldır", en:"Remove image" },
    removeFile:  { tr:"Dosyayı kaldır", en:"Remove file" },
    agentRole:   { tr:"Ajan görevi", en:"Agent role" },
    agentName:   { tr:"Ajan adı", en:"Agent name" },
    agentNamePh: { tr:"Örn. Ayşe (isteğe bağlı)", en:"e.g. Alex (optional)" },
    agentPath:   { tr:"Ajan .md dosyası yolu", en:"Agent .md file path" },
    agentPathPh: { tr:"Örn. agents/qa.md (isteğe bağlı)", en:"e.g. agents/qa.md (optional)" },
    agentEmptyTitle:{ tr:"Henüz ajan yok", en:"No agents yet" },
    agentEmptySub:{ tr:"Yeni ajan ile başla; her satırda görevi seç, istersen ad ve .md dosyası ekle.", en:"Start with New agent; choose a role per row and optionally add a name and .md file." },
    roleRequired:{ tr:"Her ajan için geçerli bir görev seç.", en:"Choose a valid role for every agent." },
    aboutDesc:   { tr:"Proje isteklerini topla, doğrula ve Markdown olarak dışa aktar.", en:"Collect, validate and export project requests as Markdown." },
    developer:   { tr:"Uygulama geliştiricisi", en:"Developer" },
    repoLabel:   { tr:"Uygulama reposu", en:"Repository" },
    contactLabel:{ tr:"İletişim", en:"Contact" },
    changelogTitle:{ tr:"Güncelleme Geçmişi", en:"Update History" },
    changelogEmpty:{ tr:"Güncelleme kaydı bulunamadı.", en:"No changelog entries found." },
    groupFeatures:{ tr:"Yeni Özellikler", en:"New features" },
    groupUpdates:{ tr:"Güncellemeler", en:"Updates" },
    groupFixes:  { tr:"Hata Düzeltmeleri", en:"Bug fixes" },
    helpHeading: { tr:"Nasıl çalışır?", en:"How it works" },
    helpStep1:   { tr:"Yeni istek ekle", en:"Add a new request" },
    helpStep1Text:{ tr:"Her güncelleme, yeni özellik, soru veya kaldırma isteği için ayrı bir satır aç. Türü seçtiğinde yalnızca o türe ait alanlar görünür.", en:"Open a separate row for each update, feature, question or removal request. Selecting a type shows only that type's fields." },
    helpStep2:   { tr:"Ayarları kullan", en:"Use settings" },
    helpStep2Text:{ tr:"Ayarlar üç sekmeye ayrıldı: Sistem, Yapılandırma ve Hakkında. Dil ve tema seçimi Kaydet’e basmadan otomatik saklanır.", en:"Settings is split into three tabs: System, Configuration and About. Language and theme are saved automatically without pressing Save." },
    helpStep3:   { tr:"Ajanları tanımla", en:"Define agents" },
    helpStep3Text:{ tr:"Ajanlar zorunlu değil. Yapılandırma sekmesinden istersen ajan ekle; seçim yapmadan da dışa aktarabilirsin.", en:"Agents are optional. Add them from the Configuration tab; you can export without selecting any." },
    helpStep4:   { tr:"Görsel ve dosya ekle", en:"Add images and files" },
    helpStep4Text:{ tr:"Satırı açıp Görseller bölümündeki Görsel ekle düğmesini kullan. Tasarım türünde örnek .html / .css dosyası da ekleyebilirsin.", en:"Open the row and use the Add image button in the Images section. For the Design type you can also add an example .html / .css file." },
    helpStep5:   { tr:"Tik ile onayla", en:"Confirm with the checkmark" },
    helpStep5Text:{ tr:"Zorunlu alanlar dolunca satırdaki tiki tıkla. Tik tıklanmayan satır varsa dışa aktarma kapalı kalır.", en:"When the required fields are complete, click the row's checkmark. Export stays disabled if any row is unconfirmed." },
    helpStep6:   { tr:"Dışa aktar", en:"Export" },
    helpStep6Text:{ tr:"Çıktı biçimini ve planlamayı seç. Hemen aktar ile bu seçimleri kaydet; sonraki dışa aktarımlar aynı seçimlerle çalışır.", en:"Choose the output format and planning. Save these choices with Instant export; later exports run with the same selections." },
    helpStep7:   { tr:"Kayıtları yönet", en:"Manage records" },
    helpStep7Text:{ tr:"Kaydet ile anlık kayıt al. Aynı deftere ait kayıt varsa uygulama uyarır; yeniden adlandırma yalnızca görünen adı değiştirir.", en:"Take an instant record with Save. The app warns if a record for the same ledger exists; renaming changes only the display name." },
    helpStep8:   { tr:"Yedek al", en:"Back up" },
    helpStep8Text:{ tr:"Yedek bölümünden tam ZIP yedeği indir. Yedekler dil, tema, ajanlar ve defter kimliği dahil güncel ayarları içerir.", en:"Download a full ZIP backup from the Backup section. Backups include current settings such as language, theme, agents and ledger ID." },
    helpNote:    { tr:"“Hazır” tiki özelliğin yapıldığı anlamına gelmez; dışa aktarmaya hazır olduğunu onaylar.", en:"The “Ready” check does not mean the feature is done; it confirms the request is ready for export." }
  };

  var PLACEHOLDERS = {
    help:   { tr:"Kısa rehber ve kullanım adımları burada gösterilecek.",  en:"The quick guide and usage steps will appear here." }
  };

  var TYPES = (core && core.constants && core.constants.TYPES) || [
    { id:"feature",  label:"Yeni Özellik" },
    { id:"update",   label:"Güncelleme" },
    { id:"remove",   label:"Kaldırma" },
    { id:"design",   label:"Tasarım / İçerik" },
    { id:"question", label:"Soru" },
    { id:"bug",      label:"Hata" }
  ];
  var TYPE_MAP = {};
  TYPES.forEach(function(type){ TYPE_MAP[type.id] = type; });

  var PRIORITIES = (core && core.constants && core.constants.PRIORITIES) || [
    { id:"low", label:"Düşük" },
    { id:"normal", label:"Normal" },
    { id:"high", label:"Yüksek" },
    { id:"critical", label:"Kritik" }
  ];
  var PRIORITY_MAP = {};
  PRIORITIES.forEach(function(priority){ PRIORITY_MAP[priority.id] = priority; });

  var TYPE_TEMPLATES = (core && core.constants && core.constants.TYPE_TEMPLATES) || {
    update:  { page:true,  location:true,  console:false, attachments:false, sampleWebsite:false, link:true  },
    feature: { page:false, location:false, console:false, attachments:false, sampleWebsite:false, link:false },
    question:{ page:true,  location:true,  console:false, attachments:false, sampleWebsite:false, link:true  },
    bug:     { page:true,  location:true,  console:true,  attachments:false, sampleWebsite:false, link:true  },
    remove:  { page:true,  location:true,  console:false, attachments:false, sampleWebsite:false, link:true  },
    design:  { page:true,  location:true,  console:false, attachments:true,  sampleWebsite:true,  link:true  }
  };

  var LIMITS = (core && core.constants && core.constants.LIMITS) || {
    MAX_IMAGES:8, MAX_ATTACHMENTS:3, MAX_INPUT_MB:15, MAX_FILE_MB:10, MAX_DIM:1600, JPEG_QUALITY:0.82
  };

  var PLANNING_TESTS = (core && core.constants && core.constants.PLANNING_TESTS) || [
    { id:"full",  label:"Tam koşu" },
    { id:"light", label:"Hafif koşu" },
    { id:"none",  label:"Test yok" }
  ];

  /* ---------- helpers ---------- */

  function t(text){
    if(core && core.i18n && typeof core.i18n.translate === "function"){
      try{ return core.i18n.translate(text, state.lang); }catch(err){ return text; }
    }
    return text;
  }

  function lx(key, vars){
    var pair = L[key];
    if(!pair) return key;
    var text = state.lang === "en" ? pair.en : pair.tr;
    if(vars){
      text = text.replace(/\{(\w+)\}/g, function(match, name){
        return vars[name] == null ? match : String(vars[name]);
      });
    }
    return t(text);
  }

  function h(tag, cls, text){
    var node = document.createElement(tag);
    if(cls) node.className = cls;
    if(text != null) node.textContent = text;
    return node;
  }

  function has(obj, key){
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function isKnownSection(section){
    return typeof section === "string" && has(SECTION_SPECS, section);
  }

  /* local section labels (the project gate item) fall back to core i18n */
  function sectionText(spec, key){
    if(!spec) return "";
    if(spec[key + "Key"]) return lx(spec[key + "Key"]);
    return t(spec[key] || "");
  }

  function hasProjectName(){
    return !!(app && String(app.project || "").trim());
  }

  function reducedMotion(){
    try{
      return !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }catch(err){ return false; }
  }

  function systemTheme(){
    try{
      if(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    }catch(err){ /* ignore */ }
    return "light";
  }

  /* ============================================================
     WORKSPACE / PROJECTS (Phase 2b)

     One registry lists every project; each project keeps its own ledger
     under PROJECT_LEDGER_PREFIX + id. The active project id is also the
     IndexedDB scope used by the media and snapshot helpers in core.storage.
     The web app uses the same registry shape (oz-projeler-v1).
     ============================================================ */

  function nowISO(){
    if(core && core.util && typeof core.util.nowISO === "function") return core.util.nowISO();
    return new Date().toISOString();
  }

  function normalizeProjectName(value){
    var text = String(value == null ? "" : value).trim();
    return text ? text.slice(0, 60) : "";
  }

  function newProjectId(){
    return "prj_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  }

  function projectLedgerKey(projectId){
    return PROJECT_LEDGER_PREFIX + projectId;
  }

  function emptyProjectRegistry(){
    return { version: 1, activeId: null, projects: [] };
  }

  /* A legacy install has no project name of its own. The neutral label follows
     the current panel language; a stored name always wins. */
  function importedProjectName(lang){
    var pair = L.projectImported;
    var use = lang === "tr" || lang === "en" ? lang : (state.lang === "tr" ? "tr" : "en");
    return pair ? (use === "tr" ? pair.tr : pair.en) : "Imported project";
  }

  function isLegacyDefaultProjectName(name){
    var value = normalizeProjectName(name);
    return value === "Ortak Zemin" || value === "Common Ground";
  }

  function normalizeLedgerId(value){
    return typeof value === "string" && value.trim() && value.trim().length <= 120 ? value.trim() : "";
  }

  function normalizeProjectRecord(record){
    if(!record || typeof record !== "object") return null;
    var id = typeof record.id === "string" && /^prj_[A-Za-z0-9_]+$/.test(record.id) ? record.id : "";
    if(!id) return null;
    var name = normalizeProjectName(record.name) || importedProjectName();
    var createdAt = typeof record.createdAt === "string" && record.createdAt ? record.createdAt : nowISO();
    var updatedAt = typeof record.updatedAt === "string" && record.updatedAt ? record.updatedAt : createdAt;
    return {
      id: id,
      name: name,
      createdAt: createdAt,
      updatedAt: updatedAt,
      /* The extension registry carries the same one ledger identity as the
         app registry; adoption and conflict choices keep it aligned. */
      ledgerId: normalizeLedgerId(record.ledgerId),
      exportTarget: typeof record.exportTarget === "string" ? record.exportTarget.slice(0, 120) : "",
      archiveCollapsed: record.archiveCollapsed === true
    };
  }

  function readRegistry(){
    try{
      if(typeof localStorage === "undefined") return null;
      var raw = localStorage.getItem(PROJECTS_KEY);
      if(!raw) return null;
      var parsed = JSON.parse(raw);
      if(!parsed || !Array.isArray(parsed.projects)) return null;
      var projects = parsed.projects.map(normalizeProjectRecord).filter(Boolean);
      var activeId = typeof parsed.activeId === "string" && projects.some(function(project){ return project.id === parsed.activeId; })
        ? parsed.activeId
        : null;
      var renamed = false;
      projects.forEach(function(project){
        if(isLegacyDefaultProjectName(project.name)){
          project.name = importedProjectName();
          renamed = true;
        }
      });
      var registry = { version: 1, activeId: activeId, projects: projects };
      if(renamed){
        try{ localStorage.setItem(PROJECTS_KEY, JSON.stringify(registry)); }catch(err){ /* quota */ }
      }
      return registry;
    }catch(err){
      console.warn("[rl-panel] project registry could not be read", err);
      return null;
    }
  }

  function writeRegistry(registry){
    try{
      if(typeof localStorage === "undefined") return false;
      if(!registry || !Array.isArray(registry.projects)) return false;
      /* Never let a repeated merge append the same project id twice. */
      var seen = {};
      registry.projects = registry.projects.filter(function(project){
        if(!project || typeof project.id !== "string" || !project.id || seen[project.id]) return false;
        seen[project.id] = true;
        return true;
      });
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(registry));
      projectRegistry = registry;
      return true;
    }catch(err){
      console.warn("[rl-panel] project registry could not be written", err);
      return false;
    }
  }

  function findProjectRecordIn(registry, projectId){
    if(!registry || !projectId) return null;
    for(var i = 0; i < registry.projects.length; i++){
      if(registry.projects[i].id === projectId) return registry.projects[i];
    }
    return null;
  }

  function findProjectRecord(projectId){
    return findProjectRecordIn(readRegistry(), projectId);
  }

  function activeProjectRecord(){
    return findProjectRecord(activeProjectId);
  }

  function activeProjectName(){
    var record = activeProjectRecord();
    return record ? record.name : "";
  }

  /* One-time migration: a legacy single-ledger install becomes one project.
     Its stored name is preserved; otherwise the neutral translated
     "Imported project" label is used. The legacy payload is copied byte for
     byte and the legacy key itself is kept for rollback and the bridge. */
  function initProjectRegistry(){
    var existing = readRegistry();
    if(existing){
      projectRegistry = existing;
      activeProjectId = existing.activeId;
      return existing;
    }
    var legacyRaw = null;
    try{ legacyRaw = typeof localStorage !== "undefined" ? localStorage.getItem(LEGACY_STORAGE_KEY) : null; }catch(err){ legacyRaw = null; }
    if(legacyRaw){
      var legacy = null;
      try{ legacy = JSON.parse(legacyRaw); }catch(err){ legacy = null; }
      if(legacy && Array.isArray(legacy.requests)){
        /* A quota failure can stop the registry write. Use a stable id derived
           from the legacy ledger so a retry overwrites the same project ledger
           key instead of accumulating one copy per boot. */
        var legacyTag = String(legacy.ledgerId || "").replace(/[^A-Za-z0-9_]/g, "").slice(-24);
        var id = "prj_legacy" + (legacyTag ? "_" + legacyTag : "");
        var stamp = typeof legacy.updatedAt === "string" && legacy.updatedAt ? legacy.updatedAt : nowISO();
        var legacyName = normalizeProjectName(legacy.project);
        var project = {
          id: id,
          name: isLegacyDefaultProjectName(legacyName)
            ? importedProjectName(legacy.language)
            : (legacyName || importedProjectName(legacy.language)),
          createdAt: stamp,
          updatedAt: stamp,
          exportTarget: "",
          archiveCollapsed: false
        };
        var registry = { version: 1, activeId: id, projects: [project] };
        try{ localStorage.setItem(projectLedgerKey(id), legacyRaw); }catch(err){ /* quota: legacy stays intact */ }
        writeRegistry(registry);
        migratedProjectId = id;
        projectRegistry = registry;
        activeProjectId = id;
        return registry;
      }
    }
    var empty = emptyProjectRegistry();
    projectRegistry = empty;
    activeProjectId = null;
    return empty;
  }

  /* Point core.storage at the active project's ledger and IndexedDB scope. */
  function syncStorageScope(preferredId){
    var registry = readRegistry();
    projectRegistry = registry;
    var preferred = preferredId && registry && findProjectRecordIn(registry, preferredId)
      ? preferredId
      : null;
    var id = preferred ||
      (registry && registry.activeId && findProjectRecordIn(registry, registry.activeId)
        ? registry.activeId
        : null);
    activeProjectId = id;
    var key = id ? projectLedgerKey(id) : LEGACY_STORAGE_KEY;
    try{
      if(core && core.storage && core.storage.init){
        return Promise.resolve(core.storage.init({ stateKey:key, projectId:id || null })).catch(function(){
          /* storage failure is surfaced by the existing banner */
        });
      }
    }catch(err){ /* storage failure is surfaced by the existing banner */ }
    return Promise.resolve();
  }

  function touchActiveProject(name, updatedAt, ledgerId){
    if(!activeProjectId) return;
    var registry = readRegistry();
    if(!registry) return;
    var project = findProjectRecordIn(registry, activeProjectId);
    if(!project) return;
    project.name = normalizeProjectName(name) || project.name;
    project.updatedAt = updatedAt || project.updatedAt;
    if(normalizeLedgerId(ledgerId)) project.ledgerId = normalizeLedgerId(ledgerId);
    registry.activeId = activeProjectId;
    writeRegistry(registry);
  }

  function updateProjectRecord(projectId, patch){
    if(!projectId) return null;
    var registry = readRegistry();
    if(!registry) return null;
    var project = findProjectRecordIn(registry, projectId);
    if(!project) return null;
    if(patch && typeof patch === "object"){
      if(typeof patch.name === "string") project.name = normalizeProjectName(patch.name) || project.name;
      if(typeof patch.updatedAt === "string" && patch.updatedAt) project.updatedAt = patch.updatedAt;
      if(normalizeLedgerId(patch.ledgerId)) project.ledgerId = normalizeLedgerId(patch.ledgerId);
      if(typeof patch.exportTarget === "string") project.exportTarget = patch.exportTarget.slice(0, 120);
      if(typeof patch.archiveCollapsed === "boolean") project.archiveCollapsed = patch.archiveCollapsed;
    }
    if(!writeRegistry(registry)) return null;
    return project;
  }

  function removeProjectRecord(projectId){
    var registry = readRegistry();
    if(!registry) return null;
    var index = -1;
    for(var i = 0; i < registry.projects.length; i++){
      if(registry.projects[i].id === projectId){ index = i; break; }
    }
    if(index < 0) return null;
    registry.projects.splice(index, 1);
    if(registry.activeId === projectId){
      var sorted = registry.projects.slice().sort(function(a, b){
        return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
      });
      registry.activeId = sorted.length ? sorted[0].id : null;
    }
    if(!writeRegistry(registry)) return null;
    return registry;
  }

  function readProjectLedgerPayload(projectId){
    try{
      if(typeof localStorage === "undefined") return null;
      var raw = localStorage.getItem(projectLedgerKey(projectId));
      if(!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && Array.isArray(parsed.requests) ? parsed : null;
    }catch(err){
      return null;
    }
  }

  function setProjectLedgerId(projectId, ledgerId){
    var value = normalizeLedgerId(ledgerId);
    if(!projectId || !value) return "";
    updateProjectRecord(projectId, { ledgerId:value });
    var payload = readProjectLedgerPayload(projectId);
    if(payload && normalizeLedgerId(payload.ledgerId) !== value){
      try{
        payload.ledgerId = value;
        localStorage.setItem(projectLedgerKey(projectId), JSON.stringify(payload));
      }catch(err){ /* the next save retries */ }
    }
    return value;
  }

  function resolveProjectLedgerId(projectId, preferredLedgerId){
    var preferred = normalizeLedgerId(preferredLedgerId);
    if(!projectId) return preferred || newLedgerId();
    if(preferred){
      setProjectLedgerId(projectId, preferred);
      return preferred;
    }
    var project = findProjectRecord(projectId);
    var registryId = project ? normalizeLedgerId(project.ledgerId) : "";
    if(registryId) return registryId;
    var payload = readProjectLedgerPayload(projectId);
    var payloadId = payload ? normalizeLedgerId(payload.ledgerId) : "";
    var next = payloadId || newLedgerId();
    setProjectLedgerId(projectId, next);
    return next;
  }

  function projectRequestCount(projectId){
    if(projectId === activeProjectId && app && Array.isArray(app.requests)) return app.requests.length;
    var payload = readProjectLedgerPayload(projectId);
    return payload ? payload.requests.length : 0;
  }

  function formatProjectDate(value){
    if(!value) return "";
    var date = new Date(value);
    if(isNaN(date.getTime())) return "";
    try{
      return new Intl.DateTimeFormat(state.lang === "en" ? "en-US" : "tr-TR", {
        day:"2-digit", month:"short", year:"numeric"
      }).format(date);
    }catch(err){
      return date.toLocaleDateString(state.lang === "en" ? "en-US" : "tr-TR");
    }
  }

  function projectCountText(count, oneEn, manyEn, oneTr){
    if(core && core.i18n && typeof core.i18n.countLabel === "function"){
      try{
        var isEn = state.lang === "en";
        return core.i18n.countLabel(count, state.lang, {
          one: isEn ? oneEn : oneTr,
          many: isEn ? manyEn : oneTr
        });
      }catch(err){ /* fall through */ }
    }
    return t(count + " istek");
  }

  function projectRequestCountText(count){
    return projectCountText(count, "request", "requests", "istek");
  }

  function projectRecordCountText(count){
    return projectCountText(count, "record", "records", "kayıt");
  }

  function projectDraftCountText(count){
    return projectCountText(count, "draft", "drafts", "taslak");
  }

  function projectMetaText(project){
    var date = formatProjectDate(project.updatedAt);
    var count = projectRequestCountText(projectRequestCount(project.id));
    return date ? date + " · " + count : count;
  }

  /* Content snapshot used for the dirty switch prompt. updatedAt is excluded
     so an automatic save does not make an unchanged project look dirty. */
  function projectSnapshotContent(){
    if(!app) return "";
    var requests = (app.requests || []).map(function(req){
      try{
        return core && core.requests && core.requests.serialize ? core.requests.serialize(req) : req;
      }catch(err){ return req; }
    });
    return JSON.stringify({
      project: app.project || "",
      requests: requests,
      agents: app.agents || [],
      language: app.language || "en",
      exportBehavior: app.exportBehavior || "default",
      lastExport: app.lastExport || null
    });
  }

  function resetProjectSnapshot(){
    projectSnapshot = projectSnapshotContent();
  }

  function isProjectDirty(){
    return !!activeProjectId && projectSnapshot !== "" && projectSnapshot !== projectSnapshotContent();
  }

  function cancelScheduledSave(){
    if(saveTimer){ clearTimeout(saveTimer); saveTimer = null; }
  }

  /* Run a storage operation under another project's scope without changing
     the active project. The scope update is synchronous inside init(). */
  function scopeInit(projectId){
    try{
      if(core && core.storage && core.storage.init){
        return Promise.resolve(core.storage.init({ projectId: projectId || null })).catch(function(){ /* storage banner owns the failure */ });
      }
    }catch(err){ /* ignore */ }
    return Promise.resolve();
  }

  function withProjectScope(projectId, action){
    var previous = activeProjectId;
    return scopeInit(projectId).then(action).then(function(value){
      return scopeInit(previous).then(function(){ return value; });
    }, function(error){
      return scopeInit(previous).then(function(){ throw error; });
    });
  }

  async function deleteProjectScopedData(projectId){
    if(!projectId) return;
    try{ localStorage.removeItem(projectLedgerKey(projectId)); }catch(err){ /* ignore */ }
    await withProjectScope(projectId, async function(){
      try{ if(core.storage.clearAllMedia) await core.storage.clearAllMedia(); }catch(err){ /* best effort */ }
      try{ if(core.storage.clearCollection){ await core.storage.clearCollection("records"); await core.storage.clearCollection("drafts"); } }catch(err){ /* best effort */ }
      try{ if(core.storage.clearHistory) await core.storage.clearHistory(); }catch(err){ /* best effort */ }
      try{ if(core.storage.deleteSetting) await core.storage.deleteSetting("targetFolder:" + projectId); }catch(err){ /* best effort */ }
    });
  }

  function setProjectExportTarget(projectId, value){
    if(!projectId) return;
    var name = String(value == null ? "" : value).slice(0, 120);
    updateProjectRecord(projectId, { exportTarget:name });
    try{
      if(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local){
        if(projectId === activeProjectId){
          folderDirs.export = name;
          chrome.storage.local.set({ "rl-export-dir":name });
          channelPost({ type:"folders", root:folderDirs.root, export:folderDirs.export });
        }else{
          /* The folder-picker writes the global key; keep that cache pointed at
             the open project so the dock hint never shows another project's
             target. */
          var current = activeProjectRecord();
          chrome.storage.local.set({ "rl-export-dir": current ? (current.exportTarget || "") : "" });
        }
      }
    }catch(err){ /* ignore */ }
  }

  /* ---------- project open / switch / create ---------- */

  function loadProjectIntoMemory(projectId, project){
    activeProjectId = projectId;
    var loaded = null;
    try{ loaded = core && core.storage && core.storage.loadState ? core.storage.loadState() : null; }catch(err){ loaded = null; }
    app = loaded || defaultApp();
    if(!Array.isArray(app.requests)) app.requests = [];
    if(!Array.isArray(app.agents)) app.agents = [];
    app.project = project.name;
    var recordLedgerId = project && typeof project.ledgerId === "string" ? normalizeLedgerId(project.ledgerId) : "";
    var loadedLedgerId = normalizeLedgerId(app.ledgerId);
    if(recordLedgerId){
      /* The registry is authoritative so a removed/rewritten payload cannot
         mint a second id for an existing project. */
      app.ledgerId = recordLedgerId;
    }else if(loadedLedgerId){
      setProjectLedgerId(projectId, loadedLedgerId);
    }else{
      app.ledgerId = newLedgerId();
      setProjectLedgerId(projectId, app.ledgerId);
    }
    if(!app.ledgerId) app.ledgerId = newLedgerId();
    /* Persist the empty ledger immediately; opening a project twice must keep
       the same ledgerId instead of minting a new one each time. */
    if((!loaded || normalizeLedgerId(loaded && loaded.ledgerId) !== app.ledgerId) &&
       core && core.storage && core.storage.saveState &&
       !(typeof bridgeAdoptingProject !== "undefined" && bridgeAdoptingProject)){
      /* Do not seed an empty ledger while the app payload is still adopting:
         the app's ledgerId/data must win the first write. */
      try{ core.storage.saveState(app); }catch(err){ /* the first save retries */ }
    }
    if(!app.language) app.language = "en";
    if(app.language === "tr" || app.language === "en"){
      state.lang = app.language;
      document.documentElement.lang = app.language;
      if(core && core.i18n && core.i18n.setLanguage) core.i18n.setLanguage(app.language);
    }
    activeRequestId = null;
    saveActivePointer(null);
    state.highlight = null;
    composeDirty = false;
    openRowMenuId = null;
    listDeleteId = null;
    exportWizard = null;
    exportCleanup = null;
    archiveTab = "list";
    archiveData = { records:[], drafts:[], history:[], loaded:false, loading:null };
    projectSwitchPending = null;
    projectCreatePending = null;
    projectFormOpen = false;
    projectDeleteConfirm = false;
    projectSettingsId = null;
    projectSettingsCounts = null;
    archiveSelectedProjectId = null;
    folderDirs.export = project.exportTarget || "";
    resetProjectSnapshot();
  }

  function openProjectById(projectId, opts){
    var project = findProjectRecord(projectId);
    if(!project) return false;
    var preserveSection = Boolean(opts && opts.preserveSection);
    var registry = readRegistry();
    if(registry){
      registry.activeId = projectId;
      writeRegistry(registry);
    }
    syncStorageScope();
    loadProjectIntoMemory(projectId, project);
    migrateLegacyScope(projectId).catch(function(){ /* best effort */ });
    closeProjectSettingsModal();
    if(role === "dock") refreshDockLabels();
    updateDockBadges();
    updateStats();
    updateMarquee();
    syncProjectGate(true);
    broadcastState();
    if(preserveSection){
      /* Bridge adoption only refreshes the current explicit section. It must
         never open a section or broadcast RL_OPEN_SECTION; dock labels and
         badges were already updated above. */
      if(role === "flyout" && state.section) renderFlyout(state.section);
    }else if(role === "flyout" && state.section === "project"){
      showSection("list");
    }else if(role === "flyout" && state.section){
      renderFlyout(state.section);
    }else if(role === "dock" && state.active){
      refreshSection(state.active);
    }
    loadArchive().catch(function(){ /* the archive is decorative until opened */ });
    /* Phase 2c: a local project switch re-handshakes with the app. No data is
       sent when the app is on a different project. */
    if(typeof bridgeAnnounceProject === "function") bridgeAnnounceProject();
    return true;
  }

  function refreshProjectViews(){
    if(projectSettingsId && document.getElementById("rl-project-settings")){
      renderProjectSettingsModal();
      return;
    }
    if(role === "flyout" && state.section){
      renderFlyout(state.section);
      return;
    }
    syncProjectGate(true);
    updateDockBadges();
    updateMarquee();
  }

  function requestProjectOpen(projectId){
    if(!projectId) return;
    if(projectId === activeProjectId){
      closeProjectSettingsModal();
      return;
    }
    var hadProject = !!activeProjectId;
    if(isProjectDirty()){
      projectSwitchPending = { targetId:projectId };
      refreshProjectViews();
      return;
    }
    openProjectById(projectId);
    if(!hadProject){
      sendAction("idle", { close:true });
      if(!hasHost) hideSection();
    }
  }

  function finishProjectSwitch(save){
    var pending = projectSwitchPending;
    if(!pending) return;
    projectSwitchPending = null;
    if(save){
      if(!saveNow()){
        projectSwitchPending = pending;
        refreshProjectViews();
        return;
      }
    }else{
      cancelScheduledSave();
    }
    openProjectById(pending.targetId);
  }

  function cancelProjectSwitch(){
    projectSwitchPending = null;
    refreshProjectViews();
  }

  function queueAppProjectCommand(type, projectId, name, ledgerId, extra){
    var command = {
      id:"cmd_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      type:type,
      projectId:String(projectId || ""),
      ledgerId:String(ledgerId || ""),
      name:String(name || ""),
      at:nowISO()
    };
    if(extra && typeof extra === "object"){
      Object.keys(extra).forEach(function(key){ command[key] = extra[key]; });
    }
    try{
      if(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local){
        chrome.storage.local.set({ "rl-app-command": command });
      }
    }catch(err){ /* the page-local bridge still covers same-tab panels */ }
    try{
      if(typeof bridgePost === "function" && typeof bridgeConnected !== "undefined" && bridgeConnected){
        bridgePost("RL_APP_PROJECT_CREATE", {
          commandId:command.id,
          commandType:command.type,
          projectId:command.projectId,
          ledgerId:command.ledgerId,
          name:command.name,
          at:command.at,
          keepBackup:command.keepBackup === true
        });
      }
    }catch(err){ /* cross-tab storage command is the fallback */ }
  }

  function createProjectAndOpen(name){
    if(typeof companionLocked === "function" && companionLocked()) return false;
    var value = normalizeProjectName(name);
    if(!value) return false;
    var hadProject = !!activeProjectId;
    var id = newProjectId();
    var stamp = nowISO();
    var ledgerId = newLedgerId();
    var registry = readRegistry() || emptyProjectRegistry();
    registry.projects.push({
      id: id,
      name: value,
      createdAt: stamp,
      updatedAt: stamp,
      ledgerId: ledgerId,
      exportTarget: "",
      archiveCollapsed: false
    });
    registry.activeId = id;
    if(!writeRegistry(registry)){
      toast(lx("projectRegistryFailed"), "error");
      return false;
    }
    var ledger = {
      version: 2,
      project: value,
      projectCreated: true,
      ledgerId: ledgerId,
      updatedAt: stamp,
      requests: [],
      agents: [],
      language: state.lang,
      exportBehavior: "default",
      lastExport: null
    };
    try{ localStorage.setItem(projectLedgerKey(id), JSON.stringify(ledger)); }catch(err){ /* the first save retries */ }
    /* Route the create through the app tab's content script; the app is the
       hub and must own the project list. */
    queueAppProjectCommand("project-create", id, value, ledgerId);
    projectCreatePending = null;
    projectFormOpen = false;
    openProjectById(id);
    if(!hadProject){
      sendAction("idle", { close:true });
      if(!hasHost) hideSection();
    }else if(role === "flyout" && state.section === "project"){
      showSection("list");
    }
    toast(lx("projectSaved"));
    return true;
  }

  function requestProjectCreate(name){
    var value = normalizeProjectName(name);
    if(!value){
      toast(lx("projectRequired"), "error");
      return false;
    }
    if(activeProjectId && isProjectDirty()){
      projectCreatePending = { name:value };
      refreshProjectViews();
      return false;
    }
    return createProjectAndOpen(value);
  }

  function finishProjectCreate(save){
    var pending = projectCreatePending;
    if(!pending) return;
    projectCreatePending = null;
    if(save){
      if(!saveNow()){
        projectCreatePending = pending;
        refreshProjectViews();
        return;
      }
    }else{
      cancelScheduledSave();
    }
    createProjectAndOpen(pending.name);
  }

  function cancelProjectCreate(){
    projectCreatePending = null;
    refreshProjectViews();
  }

  async function deleteProjectById(projectId){
    var registry = readRegistry();
    if(!registry) return false;
    if(registry.projects.length <= 1){
      toast(lx("projectLastGuard"), "error");
      return false;
    }
    var project = findProjectRecordIn(registry, projectId);
    if(!project) return false;
    var wasActive = projectId === activeProjectId;
    if(wasActive) cancelScheduledSave();
    var updated = removeProjectRecord(projectId);
    if(!updated){
      toast(lx("projectRegistryFailed"), "error");
      return false;
    }
    await deleteProjectScopedData(projectId);
    closeProjectSettingsModal();
    projectDeleteConfirm = false;
    archiveSelectedProjectId = null;
    if(wasActive){
      activeProjectId = null;
      if(updated.activeId){
        openProjectById(updated.activeId);
      }else{
        app = defaultApp();
        syncStorageScope();
        resetProjectSnapshot();
        folderDirs.export = "";
        syncProjectGate(true);
        updateDockBadges();
        updateMarquee();
        broadcastState();
        if(role === "flyout" && state.section) renderFlyout(state.section);
      }
    }else{
      refreshProjectViews();
    }
    toast(lx("projectDeleted"));
    return true;
  }

  /* ---------- one-time legacy scope stamping ---------- */

  function legacyScopeMigrated(){
    try{ return typeof localStorage !== "undefined" && localStorage.getItem(PROJECT_SCOPE_KEY) === "1"; }catch(err){ return false; }
  }

  function markLegacyScopeMigrated(){
    try{ if(typeof localStorage !== "undefined") localStorage.setItem(PROJECT_SCOPE_KEY, "1"); }catch(err){ /* quota */ }
  }

  function openScopeDB(){
    return new Promise(function(resolve){
      var info = core && core.constants && core.constants.DB;
      if(!info || typeof indexedDB === "undefined"){ resolve(null); return; }
      var request = null;
      try{ request = indexedDB.open(info.name, info.version); }catch(err){ resolve(null); return; }
      request.onupgradeneeded = function(){
        var db = request.result;
        Object.keys(info.stores || {}).forEach(function(key){
          var store = info.stores[key];
          if(!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath:"id" });
        });
      };
      request.onsuccess = function(){ resolve(request.result); };
      request.onerror = function(){ resolve(null); };
      request.onblocked = function(){ resolve(null); };
    });
  }

  function stampStoreProject(db, storeName, projectId){
    return new Promise(function(resolve){
      if(!db || !projectId){ resolve(0); return; }
      var stamped = 0;
      var tx = null;
      try{ tx = db.transaction(storeName, "readwrite"); }catch(err){ resolve(0); return; }
      var store = tx.objectStore(storeName);
      var request = store.openCursor();
      request.onsuccess = function(){
        var cursor = request.result;
        if(!cursor) return;
        var record = cursor.value;
        if(record && !record.projectId){
          record.projectId = projectId;
          cursor.update(record);
          stamped++;
        }
        cursor.continue();
      };
      tx.oncomplete = function(){ resolve(stamped); };
      tx.onerror = function(){ resolve(stamped); };
      tx.onabort = function(){ resolve(stamped); };
    });
  }

  async function migrateLegacyScope(projectId){
    if(!projectId || legacyScopeMigrated()) return 0;
    var info = core && core.constants && core.constants.DB;
    if(!info || typeof indexedDB === "undefined") return 0;
    var db = await openScopeDB();
    if(!db) return 0;
    var total = 0;
    var stores = ["images", "files", "history", "records", "drafts"];
    for(var i = 0; i < stores.length; i++){
      var name = info.stores && info.stores[stores[i]] ? info.stores[stores[i]] : stores[i];
      total += await stampStoreProject(db, name, projectId);
    }
    try{ db.close(); }catch(err){ /* ignore */ }
    markLegacyScopeMigrated();
    return total;
  }

  function channelPost(message){
    try{
      if(channel){
        if(panelPageToken && message.pageToken === undefined){
          message.pageToken = panelPageToken;
        }
        channel.postMessage(message);
      }
    }catch(err){ /* ignore */ }
  }

  function toHost(type, payload){
    var message = { source:"request-ledger", type:type };
    if(payload){
      for(var key in payload){
        if(has(payload, key)) message[key] = payload[key];
      }
    }
    try{ window.parent.postMessage(message, "*"); }catch(err){ /* ignore */ }
  }

  /* shell v6: panel-owned messages (toasts / folder hints) carry their own
     source so the host can route them without touching the shell protocol. */
  function panelTheme(){
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function postPanel(type, payload){
    var message = { source:"request-ledger-panel", type:type, theme:panelTheme() };
    if(payload){
      for(var key in payload){
        if(has(payload, key)) message[key] = payload[key];
      }
    }
    message.theme = panelTheme();
    try{ window.parent.postMessage(message, "*"); }catch(err){ /* ignore */ }
  }

  /* shell v7: the host draws the closed launcher/callout, so the dock reports
     its palette, labels and pin state. Sent on boot/mount and on theme,
     language or pin changes. */
  function sendLauncherUI(){
    if(role !== "dock" || !hasHost || !els.card) return;
    postPanel("RL_LAUNCHER_UI", {
      theme: panelTheme(),
      openLabel: lx("openPanel"),
      calloutTitle: "Request Ledger",
      calloutHint: lx("calloutHint"),
      pinned: !!state.pinned
    });
  }

  function sliceFiles(list){
    var out = [];
    if(!list) return out;
    for(var i = 0; i < list.length; i++) if(list[i]) out.push(list[i]);
    return out;
  }

  function safeCall(fn, fallback){
    try{ return fn(); }catch(err){ return fallback; }
  }

  /* ---------- storage availability ---------- */

  var STORAGE_BLOCKED_SELECTOR = [
    '[data-act="create"]', '[data-act="save-section"]', '[data-act="save-record"]',
    '[data-act="save-draft"]', '[data-act="delete"]', '[data-act="unlock"]',
    '[data-act="add-image"]', '[data-act="remove-image"]',
    '[data-act="add-file"]', '[data-act="remove-file"]',
    '[data-act="capture-open"]', '[data-act="pick-element"]', '[data-act="pick-capture"]',
    '[data-act="backup-restore"]', '[data-act="backup-clear"]', '[data-act="backup-confirm"]',
    '[data-archive-act="delete-confirm"]', '[data-archive-act="clear-confirm"]',
    '[data-archive-act="dup-overwrite"]', '[data-archive-act="dup-new"]',
    '[data-archive-act="rename-save"]'
  ].join(",");

  function storageBlocked(){
    return !storageOk;
  }

  function buildStorageBanner(){
    var banner = h("div", "storage-banner");
    banner.id = "rl-storage-banner";
    banner.setAttribute("role", "alert");
    banner.setAttribute("aria-label", lx("storageUnavailable"));
    banner.title = lx("storageUnavailable");
    banner.textContent = lx("storageUnavailable");
    banner.hidden = storageOk;
    return banner;
  }

  function syncStorageUI(){
    if(storageOk){
      for(var k = 0; k < storageBlockedNodes.length; k++){
        var blocked = storageBlockedNodes[k];
        if(blocked){
          blocked.disabled = false;
          blocked.removeAttribute("aria-disabled");
        }
      }
      storageBlockedNodes = [];
      return;
    }
    var nodes = document.querySelectorAll(STORAGE_BLOCKED_SELECTOR + ',[data-save-dependent]');
    for(var i = 0; i < nodes.length; i++){
      if(!nodes[i].disabled) storageBlockedNodes.push(nodes[i]);
      nodes[i].disabled = true;
      nodes[i].setAttribute("aria-disabled", "true");
    }
    var fileInputs = document.querySelectorAll('input[type="file"]');
    for(var j = 0; j < fileInputs.length; j++){
      if(!fileInputs[j].disabled) storageBlockedNodes.push(fileInputs[j]);
      fileInputs[j].disabled = true;
      fileInputs[j].setAttribute("aria-disabled", "true");
    }
  }

  function setStorageFailure(reason){
    storageFailureReason = reason ? String(reason.name || reason.message || reason) : "";
    if(!storageOk) return;
    storageOk = false;
    var banners = document.querySelectorAll("#rl-storage-banner");
    for(var i = 0; i < banners.length; i++){
      banners[i].hidden = false;
      banners[i].setAttribute("aria-label", lx("storageUnavailable"));
      banners[i].title = storageFailureReason ? lx("storageUnavailable") + ": " + storageFailureReason : lx("storageUnavailable");
      banners[i].textContent = lx("storageUnavailable");
    }
    syncStorageUI();
  }

  /* A transient write failure must not lock the panel forever: the next
     successful save clears the banner and re-enables the controls it disabled. */
  function clearStorageFailure(){
    storageFailureReason = "";
    if(storageOk) return;
    storageOk = true;
    storageNotified = false;
    var banners = document.querySelectorAll("#rl-storage-banner");
    for(var i = 0; i < banners.length; i++) banners[i].hidden = true;
    syncStorageUI();
  }

  /* ---------- preferences ---------- */

  function readPrefs(){
    return new Promise(function(resolve){
      var done = false;
      function finish(values){
        if(done) return;
        done = true;
        resolve(values || {});
      }
      function withSessionPrefs(localValues){
        if(panelTabScope <= 0){
          finish(localValues);
          return;
        }
        try{
          if(typeof chrome === "undefined" || !chrome.storage || !chrome.storage.session){
            finish(localValues);
            return;
          }
          chrome.storage.session.get([prefKey("rl-theme"), prefKey("rl-pinned")], function(sessionValues){
            try{ if(chrome.runtime && chrome.runtime.lastError){ /* consumed */ } }catch(err){ /* ignore */ }
            var merged = {};
            for(var key in localValues){
              if(Object.prototype.hasOwnProperty.call(localValues, key)) merged[key] = localValues[key];
            }
            /* A new tab starts from the defaults, never from a legacy global. */
            delete merged["rl-theme"];
            delete merged["rl-pinned"];
            if(sessionValues){
              var theme = sessionValues[prefKey("rl-theme")];
              var pinned = sessionValues[prefKey("rl-pinned")];
              if(theme != null) merged["rl-theme"] = theme;
              if(pinned != null) merged["rl-pinned"] = pinned;
            }
            finish(merged);
          });
          return;
        }catch(err){ /* fall back to local */ }
        finish(localValues);
      }
      try{
        if(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local){
          chrome.storage.local.get(["rl-theme", "rl-lang", "rl-pinned", "rl-root-dir", "rl-export-dir", "rl-side"], function(values){
            try{ if(chrome.runtime && chrome.runtime.lastError){ /* consumed */ } }catch(err){ /* ignore */ }
            if(values){
              if(values["rl-root-dir"]) folderDirs.root = String(values["rl-root-dir"]);
              if(values["rl-export-dir"]) folderDirs.export = String(values["rl-export-dir"]);
            }
            withSessionPrefs(values || {});
          });
          setTimeout(function(){ finish({}); }, 500);
          return;
        }
      }catch(err){ /* standalone / no storage */ }
      finish({});
    });
  }

  function normalizeThemePref(value){
    return value === "dark" || value === "light" ? value : "system";
  }

  function applyTheme(next){
    var pref = normalizeThemePref(next);
    state.themePref = pref;
    state.theme = pref === "system" ? systemTheme() : pref;
    document.documentElement.setAttribute("data-theme", state.theme);
    sendLauncherUI();
  }

  function saveThemePref(pref){
    try{
      var key = prefKey("rl-theme");
      if(panelTabScope > 0 && typeof chrome !== "undefined" && chrome.storage && chrome.storage.session){
        var patch = {};
        patch[key] = pref;
        chrome.storage.session.set(patch);
        return;
      }
      if(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local){
        chrome.storage.local.set({ "rl-theme": pref });
      }
    }catch(err){ /* ignore */ }
  }

  function updateThemeSelect(){
    var select = document.getElementById("rl-set-theme");
    if(!select) return;
    if(select.value !== state.themePref) select.value = state.themePref;
    syncSelectUI(select);
  }

  function setTheme(next){
    var pref = normalizeThemePref(next);
    themePinned = true;
    applyTheme(pref);
    saveThemePref(pref);
    channelPost({ type:"theme", theme:pref });
    updateThemeSelect();
    if(typeof syncThemeToggle === "function") syncThemeToggle();
  }

  function applyThemeFromPeer(pref){
    if(pref !== "light" && pref !== "dark" && pref !== "system") return;
    if(state.themePref === pref) return;
    applyTheme(pref);
    updateThemeSelect();
    if(typeof syncThemeToggle === "function") syncThemeToggle();
  }

  /* ---------- shell v9: left / right panel placement ---------- */

  function normalizeSide(value){
    return value === "left" ? "left" : "right";
  }

  function applyPanelSide(value){
    state.side = normalizeSide(value);
    document.documentElement.classList.toggle("dock-left", state.side === "left");
    updateSideSelect();
  }

  function savePanelSide(side){
    try{
      if(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local){
        chrome.storage.local.set({ "rl-side": side });
      }
    }catch(err){ /* ignore */ }
  }

  function updateSideSelect(){
    var select = document.getElementById("rl-set-side");
    if(!select) return;
    if(select.value !== state.side) select.value = state.side;
    syncSelectUI(select);
  }

  function sendPanelSide(){
    if(role !== "dock" || !hasHost) return;
    postPanel("RL_PANEL_SIDE", { side:state.side });
  }

  function setPanelSide(value){
    var next = normalizeSide(value);
    applyPanelSide(next);
    savePanelSide(next);
    channelPost({ type:"side", side:next });
    if(role === "dock") sendPanelSide();
  }

  function applyThemeAndLanguage(prefs){
    prefs = prefs || {};
    var theme = prefs["rl-theme"];
    var lang = prefs["rl-lang"];

    if(demo){
      var qTheme = params.get("theme");
      if(qTheme === "dark" || qTheme === "light") theme = qTheme;
      var qLang = params.get("lang");
      if(qLang === "en" || qLang === "tr") lang = qLang;
    }

    if(!themePinned) applyTheme(theme);
    if(lang === "en" || lang === "tr") state.lang = lang;
    document.documentElement.lang = state.lang;

    /* shell v3: "rl-pinned" is persisted independently of theme/language */
    state.pinned = !!prefs["rl-pinned"];
    if(demo){
      var qPin = params.get("pinned");
      if(qPin === "1") state.pinned = true;
      else if(qPin === "0") state.pinned = false;
    }

    /* shell v9: placement is applied before the shell is revealed */
    var side = prefs["rl-side"];
    if(demo && params.get("side") === "left") side = "left";
    applyPanelSide(side);
  }

  /* "Sistem" follows the OS preference live (Phase 7) */
  function watchSystemTheme(){
    try{
      if(!window.matchMedia) return;
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      var onChange = function(){
        if(state.themePref === "system") applyTheme("system");
      };
      if(mq.addEventListener) mq.addEventListener("change", onChange);
      else if(mq.addListener) mq.addListener(onChange);
    }catch(err){ /* ignore */ }
  }

  /* ---------- app state (IstekCore) ---------- */

  function newLedgerId(){
    if(core && core.util && typeof core.util.newLedgerId === "function") return core.util.newLedgerId();
    return "ledger_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
  }

  function defaultApp(){
    return {
      version: 2,
      project: "",
      ledgerId: newLedgerId(),
      requests: [],
      agents: [],
      language: "en",
      exportBehavior: "default",
      lastExport: null,
      rev: 0
    };
  }

  /* The project registry is the source of truth for the name; a ledger's
     embedded project field is refreshed on the next save. */
  function applyStoredProject(){
    var record = activeProjectRecord();
    if(record){
      app.project = record.name;
    }else if(typeof app.project !== "string"){
      app.project = "";
    }
  }

  function bootApp(prefs){
    if(!core || !core.storage){
      storageOk = false;
      app = defaultApp();
      return Promise.resolve();
    }
    return Promise.resolve()
      .then(function(){ return core.storage.init(); })
      .catch(function(){
        /* The dock and flyout iframes open the same database at the same time on
           first install; one of them can be blocked for a few milliseconds.
           Retrying once turns that transient race into a working session. */
        return new Promise(function(resolve){ setTimeout(resolve, 250); })
          .then(function(){ return core.storage.init(); })
          .catch(function(){
            /* IndexedDB can be blocked while the sibling frame opens the same
               database. Text saves use localStorage and must keep working.
               Probe localStorage: only a real text-storage failure disables
               writes and shows the red banner. */
            var textWritable = true;
            try{
              localStorage.setItem("rl-storage-probe", "1");
              localStorage.removeItem("rl-storage-probe");
            }catch(err){ textWritable = false; }
            if(textWritable) mediaStorageOk = false;
            else storageOk = false;
          });
      })
      .then(function(){
        /* Phase 2b: the project registry decides which ledger to open. A
           migrated legacy ledger keeps its stored name, or receives the
           neutral "Imported project" label; an empty registry leaves the
           project gate/picker on screen. */
        initProjectRegistry();
        return syncStorageScope();
      })
      .then(function(){
        var loaded = null;
        if(activeProjectId){
          try{ loaded = core.storage.loadState(); }catch(err){ loaded = null; }
        }
        app = loaded || defaultApp();
        if(!Array.isArray(app.requests)) app.requests = [];
        if(!Array.isArray(app.agents)) app.agents = [];
        if(activeProjectId){
          var record = activeProjectRecord();
          if(record){
            app.project = record.name;
            folderDirs.export = record.exportTarget || "";
            /* The registry owns the one ledger id; a missing payload must not
               mint a second identity for the same project. */
            if(normalizeLedgerId(record.ledgerId)){
              app.ledgerId = normalizeLedgerId(record.ledgerId);
            }else if(normalizeLedgerId(app.ledgerId)){
              setProjectLedgerId(activeProjectId, app.ledgerId);
            }else{
              app.ledgerId = newLedgerId();
              setProjectLedgerId(activeProjectId, app.ledgerId);
            }
          }else{
            app.project = "";
          }
        }else{
          app.project = "";
        }
        if(typeof app.project !== "string") app.project = "";
        if(!app.language) app.language = "en";
        if(!demo && !(prefs && (prefs["rl-lang"] === "tr" || prefs["rl-lang"] === "en"))){
          state.lang = app.language === "tr" ? "tr" : "en";
        }
        document.documentElement.lang = state.lang;
        if(core.i18n && core.i18n.setLanguage) core.i18n.setLanguage(state.lang);
        resetProjectSnapshot();
        if(activeProjectId) migrateLegacyScope(activeProjectId).catch(function(){ /* best effort */ });
        return readActivePointer();
      })
      .then(function(id){
        activeRequestId = id && requestById(id) ? id : null;
        dockCount = app ? app.requests.length : 0;
        dockReady = 0;
        if(app) app.requests.forEach(function(item){ if(statusOf(item) === "ready") dockReady++; });
        dockSummary = summaryOf(activeRequest());
      })
      .catch(function(){
        app = app || defaultApp();
        activeRequestId = null;
      });
  }

  function readActivePointer(){
    return new Promise(function(resolve){
      var done = false;
      function finish(value){ if(done) return; done = true; resolve(value == null ? null : String(value)); }
      try{
        if(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local){
          chrome.storage.local.get(["rl-active"], function(values){
            try{ if(chrome.runtime && chrome.runtime.lastError){ /* consumed */ } }catch(err){ /* ignore */ }
            finish(values ? values["rl-active"] : null);
          });
          setTimeout(function(){ finish(null); }, 400);
          return;
        }
      }catch(err){ /* ignore */ }
      finish(null);
    });
  }

  function saveActivePointer(id){
    try{
      if(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local){
        var payload = {};
        payload["rl-active"] = id == null ? null : String(id);
        chrome.storage.local.set(payload);
      }
    }catch(err){ /* ignore */ }
  }

  function requestById(id){
    if(!app || !id) return null;
    if(core && core.requests && core.requests.find) return core.requests.find(app.requests, id);
    for(var i = 0; i < app.requests.length; i++){
      if(app.requests[i].id === id) return app.requests[i];
    }
    return null;
  }

  function activeRequest(){
    /* shell v10: the wizard's pending draft is the active request while it
       exists, but it is deliberately absent from app.requests. */
    return pendingRequest || requestById(activeRequestId);
  }

  function typeInfo(id){
    return TYPE_MAP[id] || TYPES[0];
  }

  function priorityInfo(id){
    return PRIORITY_MAP[id] || PRIORITIES[1];
  }

  function templateFor(type){
    return TYPE_TEMPLATES[type] || TYPE_TEMPLATES.update;
  }

  function statusOf(req){
    if(core && core.requests && core.requests.status){
      try{ return core.requests.status(req); }catch(err){ /* fall through */ }
    }
    if(!req) return "missing";
    return req.confirmed ? "ready" : "missing";
  }

  function isLocked(req){
    return !!req && statusOf(req) === "ready";
  }

  /* shell v12: the creation wizard's Page step hides the capture/pick tools */
  function isWizardPageStep(){
    return role === "flyout" && !!pendingRequest && state.section === "page";
  }

  function trLower(value){
    if(core && core.i18n && typeof core.i18n.trLower === "function"){
      try{ return core.i18n.trLower(value == null ? "" : String(value)); }catch(err){ /* fall through */ }
    }
    return String(value == null ? "" : value).toLocaleLowerCase("tr");
  }

  function statusLabel(status){
    if(status === "ready") return t("Hazır");
    if(status === "pending") return t("Onay bekliyor");
    return t("Eksik");
  }

  function selectedRequestId(){
    if(activeRequestId && requestById(activeRequestId)) return activeRequestId;
    return state.highlight;
  }

  function listMatches(req){
    if(!req) return false;
    if(listFilter.type !== "all" && req.type !== listFilter.type) return false;
    var status = statusOf(req);
    if(listFilter.status === "ready" && status !== "ready") return false;
    if(listFilter.status === "notready" && status === "ready") return false;
    if(listFilter.q){
      var needle = trLower(listFilter.q);
      var haystack = trLower([req.title, req.page, req.description, req.note].join(" "));
      if(haystack.indexOf(needle) === -1) return false;
    }
    return true;
  }

  function hasContent(req){
    if(!req) return false;
    var textFields = ["title","description","page","location","consoleError","link","sampleWebsite","note"];
    for(var i = 0; i < textFields.length; i++){
      if(req[textFields[i]] && String(req[textFields[i]]).trim()) return true;
    }
    return (req.images && req.images.length > 0) || (req.attachments && req.attachments.length > 0);
  }

  function summaryOf(req){
    if(!req) return null;
    return {
      id: req.id,
      type: req.type,
      title: req.title || "",
      page: req.page || "",
      location: req.location || "",
      hasDescription: !!(req.description && String(req.description).trim()),
      imagesCount: (req.images || []).length,
      hasConsole: !!(req.consoleError && String(req.consoleError).trim()),
      hasSample: !!(req.sampleWebsite && String(req.sampleWebsite).trim()),
      attachmentsCount: (req.attachments || []).length,
      hasLink: !!(req.link && String(req.link).trim()),
      hasNote: !!(req.note && String(req.note).trim()),
      status: statusOf(req)
    };
  }

  function descProgress(summary){
    var tpl = templateFor(summary.type);
    var total = 2;
    var filled = (summary.hasDescription ? 1 : 0) + (summary.imagesCount > 0 ? 1 : 0);
    if(tpl.console){ total++; if(summary.hasConsole) filled++; }
    if(tpl.sampleWebsite){ total++; if(summary.hasSample) filled++; }
    if(tpl.attachments){ total++; if(summary.attachmentsCount > 0) filled++; }
    if(tpl.link){ total++; if(summary.hasLink) filled++; }
    total++;
    if(summary.hasNote) filled++;
    return { filled:filled, total:total };
  }

  function pageProgress(summary){
    var tpl = templateFor(summary.type);
    var total = 0;
    var filled = 0;
    if(tpl.page){ total++; if(summary.page && String(summary.page).trim()) filled++; }
    if(tpl.location){ total++; if(summary.location && String(summary.location).trim()) filled++; }
    return { filled:filled, total:total };
  }

  /* ---------- persistence / feedback ---------- */

  function saveText(){
    return state.saving === "saving" ? lx("saving") : t("Kaydedildi");
  }

  function setSaveState(next){
    state.saving = next === "saving" ? "saving" : "saved";
    if(savedFadeTimer){ clearTimeout(savedFadeTimer); savedFadeTimer = null; }
    var nodes = document.querySelectorAll("#rl-save-state");
    for(var i = 0; i < nodes.length; i++){
      nodes[i].setAttribute("data-state", state.saving);
      nodes[i].textContent = saveText();
      nodes[i].classList.toggle("is-faded", false);
    }
    if(state.saving === "saved"){
      lastSavedAt = Date.now();
      /* shell v10: "Kaydedildi" fades away in place after 3s without edits */
      savedFadeTimer = setTimeout(function(){
        savedFadeTimer = null;
        var live = document.querySelectorAll("#rl-save-state");
        for(var j = 0; j < live.length; j++){
          if(live[j].getAttribute("data-state") === "saved") live[j].classList.add("is-faded");
        }
      }, 3000);
    }
  }

  function saveNow(){
    if(typeof companionLocked === "function" && companionLocked()){
      if(saveTimer){ clearTimeout(saveTimer); saveTimer = null; }
      setSaveState("saved");
      return false;
    }
    if(saveTimer){ clearTimeout(saveTimer); saveTimer = null; }
    /* Phase 2b: no project open means there is no project ledger to write. */
    if(!activeProjectId){
      setSaveState("saved");
      return false;
    }
    if(!app || !core || !core.storage || !core.storage.saveState){
      setSaveState("saved");
      return false;
    }
    var ok = false;
    var saveError = null;
    for(var attempt = 0; attempt < 2 && !ok; attempt += 1){
      try{ ok = !!core.storage.saveState(app); }catch(err){ ok = false; }
      if(!ok && core.storage.getLastSaveError) saveError = core.storage.getLastSaveError();
    }
    if(!ok){
      setStorageFailure(saveError);
      if(!storageNotified){
        storageNotified = true;
        var quota = saveError && (/quota/i.test(String(saveError.name || "")) ||
          /quota/i.test(String(saveError.message || "")));
        toast(lx(quota ? "storageFull" : "storageWriteFailed"), "error");
      }
    }else{
      clearStorageFailure();
      bridgeRefreshHoldUntil = Date.now() + 1000;
      if(activeProjectId){
        touchActiveProject(app ? app.project : "", app && app.updatedAt ? app.updatedAt : nowISO(), app && app.ledgerId);
        resetProjectSnapshot();
      }
      writeSyncStamp();
    }
    setSaveState("saved");
    broadcastState();
    /* live bridge: mirror the new text state to an open web app */
    if(ok) bridgeNotifyChange();
    /* Other tabs share the same extension storage. Notify their panels so a
       request created there reaches the app even while this app tab is
       backgrounded; storage events alone can be delayed. */
    if(ok && activeProjectId){
      channelPost({ type:"data-changed", projectId:activeProjectId });
      /* Runtime delivery also reaches a panel frame in a backgrounded tab,
         where BroadcastChannel/storage events can be delayed. */
      sendRuntime({ type:"RL_DATA_CHANGED", projectId:activeProjectId });
    }
    /* shell v11 §1: the ring must reflect the same state we just wrote */
    if(role === "dock") updateDockBadges();
    return ok;
  }

  /* shell v11 §2: a successful save advertises itself to the other pages */
  function writeSyncStamp(){
    try{
      if(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local){
        chrome.storage.local.set({ "rl-sync": { id:instanceId, at:Date.now() } });
      }
    }catch(err){ /* standalone */ }
  }

  function reloadSharedState(projectId, skipSectionRender){
    if(!core || !core.storage || typeof core.storage.loadState !== "function") return;
    var previousApp = app;
    /* Keep the project that owns the incoming bridge data; another frame may
       have written a different registry.activeId in the meantime. */
    syncStorageScope(projectId);
    var loaded = null;
    if(activeProjectId){
      try{ loaded = core.storage.loadState(); }catch(err){ loaded = null; }
    }
    app = loaded || defaultApp();
    if(!Array.isArray(app.requests)) app.requests = [];
    /* A stale disk copy must never revoke a confirmation this frame already
       applied and saved (or is about to save). Confirmation changes always
       carry a fresh request updatedAt, so the newer revision wins. */
    if(loaded && previousApp && Array.isArray(previousApp.requests) && previousApp !== app){
      var diskById = {};
      for(var di = 0; di < app.requests.length; di++){
        if(app.requests[di] && app.requests[di].id) diskById[app.requests[di].id] = app.requests[di];
      }
      for(var li = 0; li < previousApp.requests.length; li++){
        var local = previousApp.requests[li];
        if(!local || !local.id || local.confirmed !== true) continue;
        var disk = diskById[local.id];
        /* A request deleted by another frame stays deleted; only revive the
           confirmation bit when the disk copy is the older revision. */
        if(!disk) continue;
        if(String(disk.updatedAt || "") <= String(local.updatedAt || "")){
          disk.confirmed = true;
          disk.updatedAt = local.updatedAt;
        }
      }
    }
    if(!Array.isArray(app.agents)) app.agents = [];
    /* The registry owns the one ledger id. A storage refresh can run before
       core.storage has switched scopes (or can find no payload); defaultApp()
       must never mint a second id for an existing project. */
    if(activeProjectId){
      var liveProject = activeProjectRecord();
      var registryLedgerId = liveProject && typeof liveProject.ledgerId === "string"
        ? liveProject.ledgerId
        : "";
      if(registryLedgerId){
        app.ledgerId = registryLedgerId;
      }else if(normalizeLedgerId(app.ledgerId)){
        setProjectLedgerId(activeProjectId, app.ledgerId);
      }else{
        app.ledgerId = newLedgerId();
        setProjectLedgerId(activeProjectId, app.ledgerId);
      }
    }
    if(activeProjectId) applyStoredProject();
    else app.project = "";
    if(typeof app.project !== "string") app.project = "";
    var projectRecord = activeProjectId ? activeProjectRecord() : null;
    folderDirs.export = projectRecord ? (projectRecord.exportTarget || "") : "";
    if(app.language === "tr" || app.language === "en"){
      state.lang = app.language;
      document.documentElement.lang = app.language;
      if(core && core.i18n && core.i18n.setLanguage) core.i18n.setLanguage(app.language);
      if(role === "dock") refreshDockLabels();
    }
    resetProjectSnapshot();

    if(activeRequestId && !requestById(activeRequestId)){
      activeRequestId = null;
      saveActivePointer(null);
    }
    dockCount = app.requests.length;
    dockReady = 0;
    app.requests.forEach(function(req){ if(statusOf(req) === "ready") dockReady++; });
    var focusId = activeRequestId || (dockSummary && dockSummary.id);
    dockSummary = focusId && requestById(focusId) ? summaryOf(requestById(focusId)) : (state.mode === "idle" ? null : dockSummary);

    updateDockBadges();
    updateStats();
    updateMarquee();
    syncProjectGate();

    /* Bridge traffic updates data only. It must never call refreshSection(),
       which broadcasts RL_OPEN_SECTION and can reveal the flyout. */
    if(!skipSectionRender){
      if(role === "flyout" && state.section === "list"){
        /* A bridge patch refreshes rows/counts in place: a full render would
           reset the selected archive tab, search focus and scroll position. */
        updateList();
        renderArchiveProjectTree();
      }else if(role === "flyout" && state.section){
        renderFlyout(state.section);
      }
    }
    broadcastState();
  }

  function scheduleSave(delay){
    if(saveTimer) clearTimeout(saveTimer);
    var wait = delay == null ? 380 : delay;
    saveTimer = setTimeout(function(){ saveNow(); }, wait);
  }

  function flushSave(){
    if(saveTimer){ clearTimeout(saveTimer); saveTimer = null; }
    return saveNow();
  }

  function markDirty(delay){
    if(!app) return;
    /* shell v7: a field/request change makes the open compose flyout dirty,
       so closing it keeps the compose buttons instead of falling back to idle */
    if(state.mode === "compose" && activeRequest()) composeDirty = true;
    setSaveState("saving");
    scheduleSave(delay);
    broadcastState();
  }

  function toast(text, kind){
    var translated = t(text);

    /* shell v6: inside the host the toast is drawn by the parent, just left
       of the rail/flyout. The local pill is a standalone-preview fallback. */
    if(hasHost){
      try{
        window.parent.postMessage({
          source:"request-ledger-panel",
          type:"RL_TOAST",
          text:translated,
          kind:kind || null,
          theme:panelTheme()
        }, "*");
      }catch(err){ /* ignore */ }
      return;
    }

    var host = document.getElementById("rl-toasts");
    if(!host) return;
    var node = h("div", "toast" + (kind ? " toast--" + kind : ""), translated);
    node.setAttribute("data-toast", "");
    node.setAttribute("role", kind === "error" ? "alert" : "status");
    node.setAttribute("aria-atomic", "true");
    host.appendChild(node);
    if(els.card) els.card.classList.add("is-toasting");

    var motion = reducedMotion() ? 0 : 150;
    setTimeout(function(){
      node.classList.add("is-leaving");
      setTimeout(function(){
        if(node.parentNode) node.parentNode.removeChild(node);
        if(host && !host.children.length && els.card) els.card.classList.remove("is-toasting");
      }, motion);
    }, 2500);
  }

  function broadcastState(){
    var req = activeRequest();
    var ready = 0;
    if(app && Array.isArray(app.requests)){
      app.requests.forEach(function(item){ if(statusOf(item) === "ready") ready++; });
    }
    var message = {
      type: "state",
      mode: state.mode,
      active: activeRequestId,
      requestId: activeRequestId,
      request: summaryOf(req),
      project: app ? app.project : "",
      projectId: activeProjectId || null,
      count: app ? app.requests.length : 0,
      ready: ready,
      dirty: !!composeDirty,
      saving: state.saving === "saving"
    };
    if(originTabId != null) message.originTabId = originTabId;
    channelPost(message);
  }

  function sendAction(action, payload){
    var message = { type:"action", action:action };
    if(payload){
      for(var key in payload){
        if(has(payload, key)) message[key] = payload[key];
      }
    }
    channelPost(message);
  }

  /* ---------- extension bridge (Phase 8) ---------- */

  function runtimeAvailable(){
    try{
      return typeof chrome !== "undefined" && !!chrome.runtime &&
        typeof chrome.runtime.sendMessage === "function";
    }catch(err){ return false; }
  }

  function sendRuntime(message, callback){
    if(!runtimeAvailable()){
      if(callback) callback(null, new Error("runtime unavailable"));
      return;
    }
    try{
      chrome.runtime.sendMessage(message, function(response){
        var failure = null;
        try{ failure = chrome.runtime.lastError || null; }catch(err){ failure = null; }
        if(callback) callback(failure ? null : (response || null), failure);
      });
    }catch(err){
      if(callback) callback(null, err);
    }
  }

  /* Dock-side cache used only by the fallback path; the flyout resolves its
     own tab with chrome.tabs.getCurrent() at send time. */
  function readOriginTabId(){
    if(role !== "dock") return;
    try{
      if(typeof chrome === "undefined" || !chrome.tabs ||
        typeof chrome.tabs.getCurrent !== "function") return;
      chrome.tabs.getCurrent(function(tab){
        try{ if(chrome.runtime && chrome.runtime.lastError) return; }catch(err){ /* ignore */ }
        if(tab && typeof tab.id === "number" && isFinite(tab.id)){
          originTabId = tab.id;
          channelPost({ type:"origin", originTabId:tab.id });
        }
      });
    }catch(err){ /* ignore */ }
  }

  /* Resolve the tab this panel lives in. The flyout iframe is embedded in the
     host tab, so chrome.tabs.getCurrent() is authoritative. The
     BroadcastChannel request is only a fallback for contexts where the API is
     unavailable (demo/standalone), never a cross-tab source of truth. */
  function getCurrentTabId(){
    return new Promise(function(resolve){
      var done = false;
      var timer = null;
      function finish(id){
        if(done) return;
        done = true;
        if(timer){ clearTimeout(timer); timer = null; }
        resolve(typeof id === "number" && isFinite(id) ? id : null);
      }
      try{
        if(typeof chrome === "undefined" || !chrome.tabs ||
          typeof chrome.tabs.getCurrent !== "function"){
          finish(null);
          return;
        }
        chrome.tabs.getCurrent(function(tab){
          try{
            if(chrome.runtime && chrome.runtime.lastError){ finish(null); return; }
          }catch(err){ /* ignore */ }
          finish(tab && typeof tab.id === "number" ? tab.id : null);
        });
        timer = setTimeout(function(){ finish(null); }, 600);
      }catch(err){ finish(null); }
    });
  }

  /* Panel-side focus fallback: if the worker never reports (service worker
     asleep, tab closed mid-flight) the host tab must still become active. */
  function restoreOriginFocus(){
    getCurrentTabId().then(function(id){
      if(id == null) return;
      try{
        if(typeof chrome === "undefined" || !chrome.tabs ||
          typeof chrome.tabs.update !== "function") return;
        chrome.tabs.update(id, { active:true }, function(tab){
          try{ if(chrome.runtime && chrome.runtime.lastError) return; }catch(err){ return; }
          if(tab && tab.windowId != null && chrome.windows && typeof chrome.windows.update === "function"){
            chrome.windows.update(tab.windowId, { focused:true }, function(){
              try{ if(chrome.runtime && chrome.runtime.lastError){ /* consumed */ } }catch(err){ /* ignore */ }
            });
          }
        });
      }catch(err){ /* ignore */ }
    });
  }

  function requestOriginViaChannel(){
    return new Promise(function(resolve){
      var done = false;
      function finish(id){
        if(done) return;
        done = true;
        resolve(typeof id === "number" && isFinite(id) ? id : null);
      }
      originWaiters.push(finish);
      sendAction("origin-request");
      setTimeout(function(){
        var index = originWaiters.indexOf(finish);
        if(index >= 0) originWaiters.splice(index, 1);
        finish(null);
      }, 400);
    });
  }

  function initRuntimeBridge(){
    if(!runtimeAvailable()) return;
    try{
      if(typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.onMessage) return;
      chrome.runtime.onMessage.addListener(onRuntimeMessage);
    }catch(err){ /* standalone demo mode */ }
  }

  function onRuntimeMessage(message){
    if(!message || typeof message !== "object") return;
    if(message.type === "RL_BRIDGE_DATA_CHANGED"){
      if(message.projectId === activeProjectId) bridgeRefreshFromStorage();
      return;
    }
    if(message.type === "RL_BRIDGE_SERVER_STOP"){
      handleBridgeServerStop(true);
      return;
    }
    if(message.type === "RL_BRIDGE_SERVER_RESUME"){
      clearBridgeServerStop(true);
      return;
    }
    /* App-initiated picks are consumed by the dock frame only. The worker
       broadcasts results to every extension page, so the flag keeps the
       flyout from also applying the same pick to its own request. */
    if(message.appPick === true && role === "dock"){
      handleAppPickRuntime(message);
      return;
    }
    if(message.appPick === true) return;
    var type = message.type;
    /* App-initiated screenshot capture is consumed by the dock only; the
       flyout must never attach the app's image to its own open request. */
    if(message.appCapture === true && role === "dock"){
      handleAppCaptureRuntime(message);
      return;
    }
    if(message.appCapture === true) return;
    if(role !== "flyout") return;
    if(type === "RL_CAPTURE_RESULT"){ handleCaptureResult(message); return; }
    if(type === "RL_CAPTURE_CANCELLED"){ handleCaptureCancelled(message); return; }
    if(type === "RL_PICK_RESULT"){ handlePickResult(message); return; }
    if(type === "RL_PICK_CANCELLED"){ handlePickCancelled(message); return; }
    if(type === "RL_FOLDER_PICKED"){
      if(message.target === "export" && projectExportPick){
        var targetProject = projectExportPick;
        projectExportPick = null;
        applyProjectExportTarget(targetProject, message.name);
        return;
      }
      var key = message.target === "export" ? "rl-export-dir" : "rl-root-dir";
      var input = document.getElementById(key === "rl-root-dir" ? "rl-set-root" : "rl-set-export-dir");
      applyPickedFolder(input, key, message.name);
    }
  }

  /* ---------- messaging ---------- */

  function openChannel(){
    try{ channel = new BroadcastChannel("rl-panel"); }
    catch(err){ channel = null; }
    if(channel) channel.onmessage = function(event){ onChannelMessage(event.data); };
  }

  /* shell v10 §19: every tab mirrors rl-pinned / rl-side written by any other
     tab. Applying only on an actual change keeps the host echo (which persists
     the same value again) from looping. Pin is per tab in the companion
     (session key rl-pinned:<tab>); rl-side and folder prefs stay global. */
  function applyPinnedPreference(nextPinned){
    if(nextPinned === state.pinned) return;
    state.pinned = nextPinned;
    syncPinUI();
    sendLauncherUI();
    if(nextPinned) clearAutoHide();
    else if(role === "dock" && state.dock === "open" && !state.active) scheduleAutoHide();
  }

  function watchStoragePrefs(){
    try{
      if(typeof chrome === "undefined" || !chrome.storage || !chrome.storage.onChanged) return;
      chrome.storage.onChanged.addListener(function(changes, area){
        if(!changes) return;
        var perTab = panelTabScope > 0;
        if(perTab){
          var pinKey = prefKey("rl-pinned");
          if(area === "session" && changes[pinKey]){
            applyPinnedPreference(!!changes[pinKey].newValue);
          }
          /* Local pin values are shared by older surfaces; a per-tab panel
             must not adopt them. */
          if(area !== "local") return;
        }else{
          if(area && area !== "local") return;
          if(changes["rl-pinned"]){
            applyPinnedPreference(!!changes["rl-pinned"].newValue);
          }
        }

        if(changes["rl-side"]){
          var nextSide = normalizeSide(changes["rl-side"].newValue);
          if(nextSide !== state.side){
            applyPanelSide(nextSide);
            /* the other tab's host still has to move its frames */
            if(role === "dock") sendPanelSide();
          }
        }

        if(changes["rl-root-dir"] || changes["rl-export-dir"]){
          if(changes["rl-root-dir"] && changes["rl-root-dir"].newValue !== undefined){
            folderDirs.root = String(changes["rl-root-dir"].newValue || "");
          }
          if(changes["rl-export-dir"] && changes["rl-export-dir"].newValue !== undefined){
            folderDirs.export = String(changes["rl-export-dir"].newValue || "");
          }
          if(role === "flyout"){
            var rootInput = document.getElementById("rl-set-root");
            var exportInput = document.getElementById("rl-set-export-dir");
            if(rootInput && folderDirs.root){ rootInput.value = folderDirs.root; rootInput.title = folderDirs.root; }
            if(exportInput && folderDirs.export){ exportInput.value = folderDirs.export; exportInput.title = folderDirs.export; }
          }
        }

        if(changes["rl-sync"]){
          var stamp = changes["rl-sync"].newValue;
          if(stamp && stamp.id && stamp.id !== instanceId){
            /* Chrome storage events wake every extension context, including a
               backgrounded app tab. Refresh and mirror the new ledger. */
            bridgeRefreshFromStorage();
          }
        }
      });
    }catch(err){ /* standalone / storage unavailable */ }
  }

  var PANEL_PAGE_SCOPED = {
    open:1, close:1, focus:1, action:1, state:1,
    ready:1, discard:1, cancel:1
  };

  function onChannelMessage(message){
    if(!message || typeof message !== "object") return;
    /* Dock/flyout share one BroadcastChannel across every tab. Section and
       action messages are only valid inside the same host page; another
       tab's panel must never open or switch this page's section. */
    if(panelPageToken && PANEL_PAGE_SCOPED[message.type] && message.pageToken !== panelPageToken){
      return;
    }
    if(message.type === "data-changed"){
      if(message.projectId === activeProjectId) bridgeRefreshFromStorage();
      return;
    }

    if(role === "dock"){
      if(message.type === "state"){
        if(typeof message.count === "number") dockCount = message.count;
        if(typeof message.ready === "number") dockReady = message.ready;
        if(typeof message.project === "string"){
          if(app) app.project = message.project;
          syncProjectGate();
        }
        if(message.projectId !== undefined && message.projectId !== activeProjectId){
          reloadSharedState();
          return;
        }
        if(message.dirty !== undefined) composeDirty = !!message.dirty;
        if(message.request !== undefined) dockSummary = message.request;
        if(message.saving !== undefined) setSaveState(message.saving ? "saving" : "saved");
        updateDockBadges();
        /* shell v11 §1: if the peer counters disagree with this dock's state,
           pull the authoritative list so the ring matches the badges. */
        if(role === "dock" && app && Array.isArray(app.requests)){
          var liveReady = 0;
          app.requests.forEach(function(item){ if(statusOf(item) === "ready") liveReady++; });
          if(message.count !== app.requests.length || message.ready !== liveReady) reloadSharedState();
        }
        return;
      }
      if(message.type === "folders"){
        if(typeof message.root === "string") folderDirs.root = message.root;
        if(typeof message.export === "string") folderDirs.export = message.export;
        return;
      }
      if(message.type === "action"){
        handleDockAction(message);
        return;
      }
      if(message.type === "lang"){
        applyLanguageFromPeer(message.lang);
        return;
      }
      if(message.type === "theme"){
        applyThemeFromPeer(message.theme);
        return;
      }
      if(message.type === "side"){
        applyPanelSide(message.side);
        sendPanelSide();
      }
      return;
    }

    if(message.type === "open"){
      if(!isKnownSection(message.section)) return;
      if(!els.card || !app){
        pendingSection = message.section;
        return;
      }
      showSection(message.section);
    }else if(message.type === "focus"){
      handleFocusMessage(message);
    }else if(message.type === "close"){
      pendingSection = null;
      if(els.card) hideSection();
    }else if(message.type === "state"){
      if(message.projectId !== undefined && message.projectId !== activeProjectId){
        reloadSharedState();
        return;
      }
      if(message.mode === "idle" || message.mode === "compose") state.mode = message.mode;
    }else if(message.type === "origin"){
      if(typeof message.originTabId === "number" && originWaiters.length){
        var waiters = originWaiters;
        originWaiters = [];
        for(var i = 0; i < waiters.length; i++) waiters[i](message.originTabId);
      }
    }else if(message.type === "ready"){
      handleReady();
    }else if(message.type === "discard"){
      discardPending();
    }else if(message.type === "cancel"){
      handleCancel();
    }else if(message.type === "lang"){
      applyLanguageFromPeer(message.lang);
    }else if(message.type === "theme"){
      applyThemeFromPeer(message.theme);
    }else if(message.type === "side"){
      applyPanelSide(message.side);
    }
  }

  function handleDockAction(message){
    if(message.action === "origin-request"){
      readOriginTabId();
      if(originTabId != null) channelPost({ type:"origin", originTabId:originTabId });
      return;
    }
    if(message.action === "compose"){
      if(!els.card) return;
      /* switch mode without closing the host iframe: the next openSection
         replaces the content in place (avoids a close-notification race) */
      setMode("compose", { keepSection:true });
      openSection(message.section || "page");
    }else if(message.action === "goto"){
      if(!els.card) return;
      openSection(message.section || "page");
    }else if(message.action === "idle"){
      if(!els.card) return;
      if(message.highlightId) state.highlight = message.highlightId;
      setMode("idle", { keepSection: !!message.openList });
      if(message.openList) openListSection();
      else if(message.close && state.active) closeSection();
    }
  }

  function handleHostRefresh(){
    if(capturePending || pickPending) return;
    var apply = function(pinnedValue){
      state.pinned = !!pinnedValue;
      syncPinUI();
      reloadSharedState();
      if(role === "dock"){
        sendLauncherUI();
        if(state.pinned && state.dock !== "open"){
          openDock();
        }else if(!state.pinned && state.dock === "open" && !state.active){
          scheduleAutoHide();
        }
      }
    };
    try{
      if(typeof chrome !== "undefined" && chrome.storage && panelTabScope > 0 && chrome.storage.session){
        chrome.storage.session.get([prefKey("rl-pinned")], function(values){
          try{ if(chrome.runtime && chrome.runtime.lastError){ apply(state.pinned); return; } }
          catch(err){ /* ignore */ }
          apply(values && values[prefKey("rl-pinned")]);
        });
        return;
      }
      if(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local){
        chrome.storage.local.get(["rl-pinned"], function(values){
          try{ if(chrome.runtime && chrome.runtime.lastError){ apply(state.pinned); return; } }
          catch(err){ /* ignore */ }
          apply(values && values["rl-pinned"]);
        });
        return;
      }
    }catch(err){ /* fall through */ }
    apply(state.pinned);
  }

  function onHostMessage(event){
    if(event.source !== window.parent) return;
    var data = event.data;
    if(!data || typeof data !== "object") return;

    /* shell v14: the host owns the flyout rectangle; if it closes the
       preview from the page (Esc with page focus), dismiss the local layer. */
    if(data.type === "RL_HOST_PREVIEW_CLOSE"){
      closeImagePreview();
      return;
    }

    /* shell v9: the host may flip the side (drag past 75% or its own UI) */
    if(data.type === "RL_SIDE"){
      applyPanelSide(data.side);
      savePanelSide(state.side);
      return;
    }

    /* v12: a tab switch asks for a lightweight shared-state refresh */
    if(data.type === "RL_HOST_REFRESH"){
      handleHostRefresh();
      return;
    }

    /* v12: flush a pending debounced save before the tab goes hidden */
    if(data.type === "RL_HOST_FLUSH"){
      try{ flushSave(); }catch(err){ /* ignore */ }
      return;
    }

    /* live bridge: host relays the web app's ledger envelopes */
    if(data.type === "RL_APP_HELLO" || data.type === "RL_APP_SNAPSHOT" ||
       data.type === "RL_APP_PATCH" || data.type === "RL_APP_ACK" ||
       data.type === "RL_APP_BYE" || data.type === "RL_APP_SERVER_STOP" ||
       data.type === "RL_APP_MEDIA" || data.type === "RL_APP_MEDIA_REQUEST" ||
       data.type === "RL_BRIDGE_CONTEXT" ||
       data.type === "RL_APP_TABS_REQUEST" || data.type === "RL_APP_PICK_REQUEST" ||
       data.type === "RL_APP_PICK_CANCEL" || data.type === "RL_APP_CAPTURE_REQUEST" ||
       data.type === "RL_APP_CAPTURE_CANCEL"){
      /* The page can post directly to this iframe, so the panel repeats the
         allowlist check instead of trusting the host alone. */
      if(!bridgeAllowedOrigin(event.origin)) return;
      bridgePageOrigin = event.origin;
      onBridgeHostMessage(data);
      return;
    }

    if(role === "flyout" && data.type === "RL_HOST_CLOSE_SECTION"){
      hideSection();
      return;
    }

    if(role === "dock"){
      if(data.type === "RL_HOST_OPEN"){
        /* shell v7: the host's launcher was clicked; the dock frame is now
           visible and the rail opens itself */
        openDock();
      }else if(data.type === "RL_HOST_COLLAPSE"){
        /* the host asked to collapse from its side; do not echo the state */
        closeDock({ silent:true });
      }else if(data.type === "RL_HOST_CLOSE_SECTION"){
        /* shell v7: page scrolling no longer closes the section */
        if(state.active) closeSection();
      }
    }else if(data.type === "RL_OPEN_SECTION"){
      /* fallback path when the BroadcastChannel message was missed
         (flyout iframe loaded after the dock asked for a section) */
      if(isKnownSection(data.section)) showSection(data.section);
    }else if(data.type === "RL_FLYOUT_MAX"){
      /* shell v7: the host owns the viewport budget; never use 100vh here,
         because the iframe itself is sized from the reported card height. */
      flyoutMaxAvailable = Number(data.height) || 0;
      applyFlyoutMax();
      lastSize = -1;
      /* the budget precedes the section message, so reporting here would send
         the *outgoing* section's height and make the host resize the iframe to
         it; measure once the incoming section has rendered instead. */
      requestAnimationFrame(reportSize);
    }else if(data.type === "RL_FLYOUT_GEOMETRY"){
      applyFlyoutGeometry(data.arrowY);
    }else if(data.type === "RL_PAGE_BG"){
      /* shell v5: paint the flyout iframe canvas with the page background so
         the transparent padding around the card never shows a white strip.
         Only strict rgb()/rgba() values from the host are accepted. */
      if(role === "flyout" && typeof data.color === "string" &&
         /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/.test(data.color) &&
         !/,\s*0\s*\)$/.test(data.color)){
        document.documentElement.style.setProperty("background-color", data.color, "important");
      }
    }else if(data.type === "RL_HOST_CLOSE_SECTION"){
      hideSection();
    }
  }

  /* host owns the vertical flyout placement; it sends the arrow offset
     inside the card so ::after keeps pointing at the dock button. */
  function applyFlyoutGeometry(value){
    if(role !== "flyout") return;
    var y = typeof value === "number" ? value : parseFloat(value);
    if(!isFinite(y)) return;
    y = Math.max(0, y);
    if(!els.card){ pendingArrowY = y; return; }
    els.card.style.setProperty("--arrow-y", y + "px");
  }

  function applyLanguageFromPeer(lang){
    if(lang !== "tr" && lang !== "en") return;
    if(state.lang === lang) return;
    state.lang = lang;
    document.documentElement.lang = lang;
    if(core && core.i18n && core.i18n.setLanguage) core.i18n.setLanguage(lang);
    if(role === "dock") refreshDockLabels();
    if(role === "flyout" && state.section) renderFlyout(state.section);
  }

  function setLanguage(lang){
    lang = lang === "en" ? "en" : "tr";
    if(state.lang === lang) return;
    state.lang = lang;
    document.documentElement.lang = lang;
    if(app) app.language = lang;
    if(core && core.i18n && core.i18n.setLanguage) core.i18n.setLanguage(lang);
    try{
      if(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local){
        chrome.storage.local.set({ "rl-lang": lang });
      }
    }catch(err){ /* ignore */ }
    markDirty(0);
    channelPost({ type:"lang", lang:lang });
    if(role === "flyout" && state.section) renderFlyout(state.section);
    if(role === "dock") refreshDockLabels();
  }

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
      if(panelTabScope > 0 && typeof chrome !== "undefined" && chrome.storage && chrome.storage.session){
        var patch = {};
        patch[prefKey("rl-pinned")] = !!state.pinned;
        chrome.storage.session.set(patch);
        return;
      }
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

  function syncThemeToggle(){
    var button = document.getElementById("rl-theme-toggle");
    if(!button) return;
    var dark = state.theme === "dark";
    button.textContent = dark ? "☀" : "☾";
    button.title = lx(dark ? "themeLight" : "themeDark");
    button.setAttribute("aria-label", button.title);
    button.setAttribute("aria-pressed", dark ? "true" : "false");
  }

  function renderTopGroup(){
    if(!els.topGroup) return;
    els.topGroup.textContent = "";
    topItems = [];

    /* The app owns projects. Without an active project there is nothing to
       create or switch here; the host is still visible because the app is on. */
    if(!hasProjectName()){
      var empty = h("div", "rail-empty", lx("openProjectInApp"));
      els.topGroup.appendChild(empty);
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
    if(typeof companionProbeNow === "function") companionProbeNow(true);
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
    if(typeof companionLocked === "function" && companionLocked()) return;
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

    ["backup", "help"].forEach(function(id){
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

    /* shell v9: bottom card — theme toggle on top, pin | collapse below. */
    var themeBtn = h("button", "rail-btn rail-theme");
    themeBtn.type = "button";
    themeBtn.id = "rl-theme-toggle";
    themeBtn.addEventListener("click", function(){
      setTheme(state.theme === "dark" ? "light" : "dark");
      syncThemeToggle();
    });

    var dockbar = h("div", "rail-dockbar");
    dockbar.id = "rl-dockbar";

    var folderRow = h("div", "rail-dockbar-row rail-dockbar-row--folders");
    folderRow.appendChild(themeBtn);

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
    els.railPair = actionRow;

    projectGateOn = hasProjectName();
    renderTopGroup();
    syncThemeToggle();
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
    panelToolBusyUntil = Date.now() + 1500;
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

  function clearPickPending(){
    var wasPending = pickPending;
    pickPending = false;
    panelToolBusyUntil = Date.now() + 1500;
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
    return merged.join(" | ").slice(0, 200);
  }

  try{ window.__rlPanelMergeLocation = mergeLocation; }catch(err){ /* ignore */ }

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

  /* A bridge/probe refresh may rebuild the flyout while the user is typing.
     Capture the focused field (request id + field key + caret) and restore it
     only when this is still the same section/request and the panel has focus.
     Without the focus check a background tab would steal focus on every
     remote patch. */
  function captureFlyoutFocus(){
    var el = document.activeElement;
    if(!el || el === document.body || !els.body || !els.body.contains(el)) return null;
    var tag = el.tagName;
    var focusable = /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(tag) || el.isContentEditable || el.tabIndex >= 0;
    if(!focusable) return null;
    if(!document.hasFocus()) return null;
    var req = typeof activeRequest === "function" ? activeRequest() : null;
    var selector = "";
    if(el.id) selector = "#" + el.id;
    else if(el.getAttribute("data-field")) selector = '[data-field="' + el.getAttribute("data-field").replace(/"/g, '\\"') + '"]';
    else if(el.getAttribute("data-image-id")) selector = '[data-image-id="' + el.getAttribute("data-image-id").replace(/"/g, '\\"') + '"]';
    if(!selector) return null;
    var snapshot = {
      section: document.body.dataset.section || "",
      requestId: req && req.id ? req.id : "",
      selector: selector,
      start: null,
      end: null,
      direction: null
    };
    try{
      if(typeof el.selectionStart === "number"){
        snapshot.start = el.selectionStart;
        snapshot.end = el.selectionEnd;
        snapshot.direction = el.selectionDirection || "none";
      }
    }catch(err){ /* range/unsupported controls */ }
    return snapshot;
  }

  function restoreFlyoutFocus(snapshot, section){
    if(!snapshot || !els.body) return;
    if(!document.hasFocus()){
      pendingFlyoutFocus = { snapshot:snapshot, section:section };
      return;
    }
    if(snapshot.section && snapshot.section !== section) return;
    if(snapshot.requestId){
      var req = typeof activeRequest === "function" ? activeRequest() : null;
      if(!req || req.id !== snapshot.requestId) return;
    }
    var target = null;
    try{ target = els.body.querySelector(snapshot.selector); }catch(err){ target = null; }
    if(!target || target.disabled || !els.body.contains(target)) return;
    try{ target.focus({ preventScroll:true }); }
    catch(err){ try{ target.focus(); }catch(e){ /* ignore */ } }
    if(snapshot.start != null){
      try{ target.setSelectionRange(snapshot.start, snapshot.end, snapshot.direction || "none"); }
      catch(err){ /* unsupported control */ }
    }
  }

  function flushPendingFlyoutFocus(){
    if(!pendingFlyoutFocus) return;
    var pending = pendingFlyoutFocus;
    pendingFlyoutFocus = null;
    if(document.activeElement && document.activeElement !== document.body) return;
    restoreFlyoutFocus(pending.snapshot, pending.section);
  }

  function renderFlyout(section){
    var spec = SECTION_SPECS[section];
    if(!spec) return;
    var focusSnapshot = captureFlyoutFocus();

    closeTabPicker(false);
    closeOpenSelect();
    /* A data refresh in the same section must not close an open image
       preview: the overlay lives on document.body and its blob URL is still
       valid after the grid is rebuilt. */
    if(!imagePreview || imagePreview.section !== section) closeImagePreview(false);
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

    els.title.textContent = sectionText(spec, "title");
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
    else if(section === "detail") renderDetail(scroller);
    else if(section === "page") renderPage(scroller);
    else if(section === "desc") renderDesc(scroller);
    else if(section === "export") renderExport(scroller);
    else if(section === "backup") renderBackup(scroller);
    else if(section === "help") renderHelp(scroller);
    else renderPlaceholder(scroller, section);

    renderFoot(section);
    applyFlyoutMax();
    showDockSaveState();
    syncStorageUI();
    els.body.scrollTop = 0;
    lastSize = -1;
    requestAnimationFrame(reportSize);
    restoreFlyoutFocus(focusSnapshot, section);
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

  function renderDetail(body){
    var req = activeRequest();
    if(!req){
      body.appendChild(h("p", "notice", t("Henüz istek yok")));
      return;
    }
    body.classList.add("detail-body");

    addMiniConfirm(body);
    addTypePrioritySummary(body, req);

    var locked = isLocked(req);
    addLabel(body, requiredLabel(t("Başlık")), "rl-title-input");
    var titleInput = addField(body, {
      id: "rl-title-input",
      tag: "input",
      field: "title",
      max: 120,
      placeholder: t("Kısa ve anlaşılır bir başlık"),
      value: req.title,
      disabled: locked
    });
    titleInput.type = "text";
    titleInput.autocomplete = "off";
    if(missingField === "title"){
      titleInput.classList.add("is-invalid");
      titleInput.setAttribute("aria-invalid", "true");
      var titleHint = h("div", "field-hint", lx("titleRequired"));
      titleHint.id = "rl-title-hint";
      body.appendChild(titleHint);
    }

    /* shell v10 §7: only render the Page section when the type includes it */
    var tpl = templateFor(req.type);
    if(tpl.page || tpl.location){
      renderPage(body, { combined:true });
      var split = h("div", "detail-sep");
      split.setAttribute("aria-hidden", "true");
      body.appendChild(split);
    }

    renderDesc(body, { combined:true });
  }

  /* ---------- desc ---------- */

  function renderDesc(body, opts){
    opts = opts || {};
    var req = activeRequest();
    if(!req){
      body.appendChild(h("p", "notice", t("Henüz istek yok")));
      return;
    }
    if(!opts.combined){
      addMiniConfirm(body);
    }

    var locked = isLocked(req);
    var tpl = templateFor(req.type);

    /* shell v8: no type/priority summary in the standalone description view */

    /* description */
    var descBlock = addBlock(body, requiredLabel(t("Açıklama")));
    addField(descBlock, {
      id: "rl-desc-input",
      tag: "textarea",
      field: "description",
      rows: 4,
      max: 5000,
      placeholder: t(typeInfo(req.type).ph || ""),
      value: req.description,
      disabled: locked
    });
    if(missingField === "description"){
      var descInput = document.getElementById("rl-desc-input");
      if(descInput){
        descInput.classList.add("is-invalid");
        descInput.setAttribute("aria-invalid", "true");
      }
      var hint = h("div", "field-hint", lx("descRequired"));
      hint.id = "rl-invalid-hint";
      hint.setAttribute("data-invalid", "");
      descBlock.appendChild(hint);
    }

    /* images */
    renderImagesBlock(body, req, locked);

    /* shell v11 §7: files are available for every request type */
    renderAttachmentsBlock(body, req, locked);

    /* console (bug) */
    if(tpl.console){
      var consoleBlock = addBlock(body, optionalLabel(t("Console Hatası veya Sayfa Hatası")));
      addField(consoleBlock, {
        id: "rl-console-input",
        tag: "textarea",
        field: "consoleError",
        rows: 3,
        max: 2000,
        placeholder: t("Örn. Uncaught TypeError: … / 404 sayfa hatası…"),
        value: req.consoleError,
        disabled: locked
      });
      /* shell v8: pull the active tab's recorded console titles into the box */
      var consoleRow = h("div", "console-actions");
      var fetchConsole = h("button", "btn btn--small", lx("fetchConsole"));
      fetchConsole.type = "button";
      fetchConsole.id = "rl-console-fetch";
      fetchConsole.setAttribute("data-act", "console-fetch");
      fetchConsole.setAttribute("aria-label", lx("fetchConsole"));
      fetchConsole.disabled = locked;
      consoleRow.appendChild(fetchConsole);
      consoleBlock.appendChild(consoleRow);
    }

    /* sample website + attachments (design) */
    if(tpl.sampleWebsite){
      var siteBlock = addBlock(body, optionalLabel(t("Örnek web sitesi")));
      addField(siteBlock, {
        id: "rl-site-input",
        tag: "input",
        field: "sampleWebsite",
        type: "url",
        max: 500,
        placeholder: "https://…",
        value: req.sampleWebsite,
        disabled: locked
      });
    }
    /* files moved directly under Images above */

    /* link (all but feature) */
    if(tpl.link){
      var linkBlock = addBlock(body, optionalLabel(t("İlgili bağlantı")));
      addField(linkBlock, {
        id: "rl-link-input",
        tag: "input",
        field: "link",
        type: "url",
        max: 500,
        placeholder: "https://…",
        value: req.link,
        disabled: locked
      });
    }

    /* note (always) */
    var noteBlock = addBlock(body, optionalLabel(t("Ek not")));
    addField(noteBlock, {
      id: "rl-note-input",
      tag: "textarea",
      field: "note",
      rows: 3,
      max: 2000,
      placeholder: t("İstersen ek bir açıklama ekle…"),
      value: req.note,
      disabled: locked
    });

    if(missingField === "description"){
      setTimeout(function(){
        var input = document.getElementById("rl-desc-input");
        if(input && !input.disabled){
          try{ input.focus(); }catch(err){ /* ignore */ }
        }
      }, 40);
    }
  }

  function renderImagesBlock(body, req, locked){
    var block = h("section", "block");
    block.id = "rl-img-block";
    var head = h("div", "block-head block-head--actions");
    head.appendChild(h("span", "block-title", optionalLabel(t("Görseller"))));
    var headActions = h("div", "block-head-actions");

    var counter = h("span", "counter", req.images.length + " / " + LIMITS.MAX_IMAGES);
    counter.id = "rl-img-count";
    counter.setAttribute("data-image-count", req.images.length + "/" + LIMITS.MAX_IMAGES);
    headActions.appendChild(counter);

    /* shell v11 §4: screenshot control at the top-right of the Images block */
    var capture = h("button", "btn btn--small btn--icon block-action", "");
    capture.type = "button";
    capture.id = "rl-capture-open";
    capture.setAttribute("data-act", "capture-open");
    capture.setAttribute("aria-label", lx("screenshot"));
    capture.innerHTML = ICONS.camera;
    capture.disabled = locked || req.images.length >= LIMITS.MAX_IMAGES || capturePending;
    headActions.appendChild(capture);

    var status = h("span", "capture-status", capturePending ? lx("tabOpening") : "");
    status.id = "rl-capture-status";
    status.setAttribute("role", "status");
    status.hidden = !capturePending;
    headActions.appendChild(status);
    head.appendChild(headActions);
    block.appendChild(head);

    var grid = h("div", "thumbs");
    grid.id = "rl-img-grid";
    block.appendChild(grid);

    var input = document.createElement("input");
    input.type = "file";
    input.id = "rl-img-input";
    input.accept = "image/*";
    input.multiple = true;
    input.className = "hidden-input";
    input.disabled = locked;
    input.addEventListener("change", function(){
      var files = sliceFiles(input.files);
      input.value = "";
      queueImages(files);
    });
    block.appendChild(input);

    body.appendChild(block);
    attachDropZone(grid, input);
    fillImageGrid(req, locked);
  }

  function setDropOver(grid, on){
    if(!grid) return;
    var drop = grid.querySelector(".img-drop");
    if(drop) drop.classList.toggle("is-over", on);
    else grid.classList.toggle("is-over", on);
  }

  function attachDropZone(grid, input){
    ["dragenter", "dragover"].forEach(function(name){
      grid.addEventListener(name, function(event){
        event.preventDefault();
        setDropOver(grid, true);
      });
    });
    grid.addEventListener("dragleave", function(event){
      if(event.target === grid) setDropOver(grid, false);
    });
    grid.addEventListener("drop", function(event){
      event.preventDefault();
      setDropOver(grid, false);
      var files = event.dataTransfer ? sliceFiles(event.dataTransfer.files) : [];
      if(files.length) queueImages(files);
      else if(input) input.click();
    });
  }

  /* shell v14: the preview lives in this document. The image never crosses
     the iframe boundary; the host only enlarges the flyout rectangle.
     `trigger` is the thumbnail cell so focus can return to it. */
  function previewDimension(axis){
    var screenSize = 0;
    try{
      if(window.screen){
        screenSize = axis === "width"
          ? (window.screen.availWidth || window.screen.width || 0)
          : (window.screen.availHeight || window.screen.height || 0);
      }
    }catch(err){ screenSize = 0; }
    var fallback = axis === "width" ? 1280 : 800;
    var cap = axis === "width" ? 960 : 760;
    var min = axis === "width" ? 360 : 320;
    var wanted = Math.round((screenSize || fallback) * 0.8);
    return Math.max(min, Math.min(cap, wanted));
  }

  function onImagePreviewKeydown(event){
    if(!imagePreview) return;
    var key = event.key;
    if(key === "Escape" || key === "Esc" || event.keyCode === 27){
      event.preventDefault();
      event.stopPropagation();
      closeImagePreview();
      return;
    }
    /* one control is focusable inside the modal: keep Tab on it */
    if(key === "Tab"){
      event.preventDefault();
      try{ imagePreview.close.focus(); }catch(err){ /* ignore */ }
    }
  }

  function closeImagePreview(restoreFocus){
    if(!imagePreview) return;
    var preview = imagePreview;
    imagePreview = null;
    if(preview.el && preview.el.parentNode) preview.el.parentNode.removeChild(preview.el);
    document.documentElement.classList.remove("is-image-preview");
    if(preview.url){
      try{ URL.revokeObjectURL(preview.url); }catch(err){ /* ignore */ }
    }
    if(role === "flyout" && hasHost) toHost("RL_FLYOUT_PREVIEW", { open:false });
    lastSize = -1;
    if(restoreFocus !== false){
      var back = preview.returnFocus;
      if(!back || !document.body.contains(back) || back.disabled){
        /* A data refresh rebuilt the grid while the preview was open; match
           the replacement cell by image id instead of the detached node. */
        back = preview.imageId
          ? document.querySelector('.thumb[data-image-id="' + preview.imageId + '"]')
          : null;
      }
      if(back && document.body.contains(back) && !back.disabled){
        try{ back.focus(); }catch(err){ /* ignore */ }
      }
    }
    /* the host restores the anchored flyout geometry; report the real card
       height once the preview class is gone */
    requestAnimationFrame(function(){ reportSize(); });
  }

  function openImageModal(img, trigger){
    if(imagePreview) return;
    if(!img || !core || !core.storage || typeof core.storage.getImage !== "function") return;
    core.storage.getImage(img.id).then(function(record){
      if(!record || !record.blob){
        if(typeof bridgeMediaIsPending === "function" && bridgeMediaIsPending("image", img.id)){
          toast(lx("imageLoading"));
          return;
        }
        toast(lx("imageModalFailed"), "error");
        return;
      }
      if(imagePreview) return;
      var url = URL.createObjectURL(record.blob);
      var overlay = h("div", "image-preview");
      overlay.id = "rl-image-preview";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", lx("openImage"));

      var stage = h("div", "image-preview__stage");
      var image = document.createElement("img");
      image.className = "image-preview__img";
      image.alt = "";
      image.setAttribute("draggable", "false");
      image.src = url;

      var close = h("button", "image-preview__x", "×");
      close.type = "button";
      close.id = "rl-image-preview-close";
      close.setAttribute("aria-label", t("Kapat"));

      stage.appendChild(image);
      overlay.appendChild(stage);
      overlay.appendChild(close);
      document.body.appendChild(overlay);

      imagePreview = {
        el:overlay,
        close:close,
        url:url,
        section:state.section,
        imageId:img.id,
        returnFocus:trigger || document.activeElement || null
      };
      document.documentElement.classList.add("is-image-preview");

      close.addEventListener("click", function(event){
        if(event) event.stopPropagation();
        closeImagePreview();
      });
      /* backdrop click only; clicks on the image are inert */
      overlay.addEventListener("click", function(event){
        if(event && event.target === overlay) closeImagePreview();
      });
      overlay.addEventListener("keydown", onImagePreviewKeydown);

      lastSize = -1;
      if(role === "flyout" && hasHost){
        toHost("RL_FLYOUT_PREVIEW", {
          open:true,
          width:previewDimension("width"),
          height:previewDimension("height")
        });
      }
      try{ close.focus(); }catch(err){ /* ignore */ }
    }).catch(function(){
      toast(lx("imageModalFailed"), "error");
    });
  }

  function fillImageGrid(req, locked){
    var grid = document.getElementById("rl-img-grid");
    if(!grid) return;
    revokeThumbs();
    grid.textContent = "";

    var counter = document.getElementById("rl-img-count");
    if(counter){
      counter.textContent = req.images.length + " / " + LIMITS.MAX_IMAGES;
      counter.setAttribute("data-image-count", req.images.length + "/" + LIMITS.MAX_IMAGES);
    }

    syncCaptureControls(req);

    if(!req.images.length){
      /* the empty state is the dropzone itself: clickable anywhere */
      var drop = h("button", "img-drop");
      drop.type = "button";
      drop.setAttribute("data-act", "add-image");
      drop.disabled = locked;
      var icon = h("span", "img-drop-ic");
      icon.innerHTML = ICONS.image;
      icon.setAttribute("aria-hidden", "true");
      drop.appendChild(icon);
      drop.appendChild(h("b", null, t("Görsel ekle")));
      drop.appendChild(h("span", "img-drop-hint", lx("imgHint")));
      grid.appendChild(drop);
      return;
    }

    req.images.forEach(function(img, index){
      var cell = h("div", "thumb");
      cell.setAttribute("data-image-id", img.id);
      cell.tabIndex = 0;
      cell.setAttribute("role", "button");
      cell.setAttribute("aria-label", lx("openImage"));
      cell.addEventListener("click", function(event){
        if(event.target && event.target.closest && event.target.closest(".thumb-del")) return;
        openImageModal(img, cell);
      });
      cell.addEventListener("keydown", function(event){
        if(event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openImageModal(img, cell);
      });
      var image = document.createElement("img");
      image.alt = (req.id || "") + " " + t("Görsel") + " " + (index + 1);
      cell.appendChild(image);
      var del = h("button", "thumb-del", "×");
      del.type = "button";
      del.setAttribute("data-act", "remove-image");
      del.setAttribute("data-image-ref", img.id);
      del.setAttribute("aria-label", lx("removeImage"));
      del.disabled = locked;
      cell.appendChild(del);
      grid.appendChild(cell);
      loadThumb(img, image, cell);
    });

    if(req.images.length < LIMITS.MAX_IMAGES){
      var addTile = h("button", "thumb-add");
      addTile.type = "button";
      addTile.setAttribute("data-act", "add-image");
      addTile.disabled = locked;
      addTile.appendChild(h("span", null, "+"));
      grid.appendChild(addTile);
    }
    syncStorageUI();
  }

  function loadThumb(img, image, cell){
    if(!core || !core.storage || !core.storage.getImage) return;
    core.storage.getImage(img.id).then(function(record){
      if(!record || !record.blob){
        if(typeof bridgeMediaIsPending === "function" && bridgeMediaIsPending("image", img.id)){
          cell.classList.add("is-loading");
          cell.appendChild(h("span", "thumb-loading", lx("imageLoading")));
          var wait = typeof bridgeMediaPendingRemaining === "function"
            ? bridgeMediaPendingRemaining("image", img.id)
            : 1000;
          setTimeout(function(){
            if(!document.body.contains(cell)) return;
            if(typeof bridgeMediaIsPending === "function" && bridgeMediaIsPending("image", img.id)) return;
            if(state.section === "detail") renderFlyout("detail");
          }, Math.max(600, wait + 100));
          return;
        }
        cell.classList.add("is-missing");
        return;
      }
      /* the grid may have been re-rendered while IDB resolved: never create an
         object URL for a detached cell (that is the leak the revision fixes). */
      if(!document.body.contains(cell)) return;
      if(thumbUrls[img.id]){
        try{ URL.revokeObjectURL(thumbUrls[img.id]); }catch(err){ /* ignore */ }
        delete thumbUrls[img.id];
      }
      var url = URL.createObjectURL(record.blob);
      thumbUrls[img.id] = url;
      image.src = url;
    }).catch(function(){
      cell.classList.add("is-missing");
    });
  }

  function renderAttachmentsBlock(body, req, locked){
    var block = h("section", "block");
    block.id = "rl-files-block";
    var head = h("div", "block-head");
    head.appendChild(h("span", "block-title", optionalLabel(lx("filesTitle"))));
    head.appendChild(h("span", "counter", req.attachments.length + " / " + LIMITS.MAX_ATTACHMENTS));
    block.appendChild(head);

    var list = h("div", "attachlist");
    req.attachments.forEach(function(att){
      var item = h("div", "attachitem");
      var bodySpan = h("span", "attachitem__body");
      bodySpan.appendChild(h("b", null, att.name));
      var meta = core && core.util && core.util.formatBytes ? core.util.formatBytes(att.size) : String(att.size || 0) + " B";
      bodySpan.appendChild(h("small", null, meta + (att.ext ? " · " + String(att.ext).toUpperCase() : "")));
      item.appendChild(bodySpan);
      var del = h("button", "thumb-del", "×");
      del.type = "button";
      del.setAttribute("data-act", "remove-file");
      del.setAttribute("data-att-ref", att.id);
      del.setAttribute("aria-label", lx("removeFile") + ": " + att.name);
      del.disabled = locked;
      item.appendChild(del);
      list.appendChild(item);
    });
    if(req.attachments.length) block.appendChild(list);

    /* shell v12 §2: the file area mirrors the image dropzone */
    var thumbs = h("div", "thumbs file-thumbs");
    var drop = h("div", "img-drop file-drop");
    var icon = h("span", "img-drop-ic");
    icon.innerHTML = ICONS.file;
    icon.setAttribute("aria-hidden", "true");
    drop.appendChild(icon);
    drop.appendChild(h("b", null, lx("addFile")));
    drop.appendChild(h("span", "img-drop-hint", lx("filesNote", { n:LIMITS.MAX_ATTACHMENTS, mb:LIMITS.MAX_FILE_MB })));

    var add = h("button", "btn btn--small", t("Dosya seç"));
    add.type = "button";
    add.setAttribute("data-act", "add-file");
    add.disabled = locked || req.attachments.length >= LIMITS.MAX_ATTACHMENTS;
    drop.appendChild(add);
    thumbs.appendChild(drop);
    block.appendChild(thumbs);

    var input = document.createElement("input");
    input.type = "file";
    input.id = "rl-file-input";
    input.multiple = true;
    input.className = "hidden-input";
    input.disabled = locked;
    input.addEventListener("change", function(){
      var files = sliceFiles(input.files);
      input.value = "";
      addAttachments(files);
    });
    block.appendChild(input);

    drop.addEventListener("click", function(event){
      if(event.target && event.target.closest && event.target.closest('[data-act="add-file"]')) return;
      if(!input.disabled) input.click();
    });
    ["dragenter", "dragover"].forEach(function(name){
      drop.addEventListener(name, function(event){
        event.preventDefault();
        drop.classList.add("is-over");
      });
    });
    drop.addEventListener("dragleave", function(event){
      if(event.target === drop) drop.classList.remove("is-over");
    });
    drop.addEventListener("drop", function(event){
      event.preventDefault();
      drop.classList.remove("is-over");
      if(!input.disabled) addAttachments(event.dataTransfer ? sliceFiles(event.dataTransfer.files) : []);
    });

    body.appendChild(block);
  }

  /* ---------- list ---------- */

  function renderList(body){
    if(!app) app = defaultApp();
    if(!Array.isArray(app.requests)) app.requests = [];
    body.classList.add("list-body");

    if(exportWizard){
      renderExportWizard(body);
      return;
    }

    if(exportCleanup) body.appendChild(buildExportCleanup());

    body.appendChild(buildArchiveTabs());

    var panels = h("div", "archive-panels");
    panels.id = "rl-archive-panel";

    var prompt = h("div", "archive-dup");
    prompt.id = "rl-dup-prompt";
    prompt.hidden = true;
    panels.appendChild(prompt);

    var listPane = h("div", "archive-pane");
    listPane.id = "rl-list-pane";
    listPane.setAttribute("data-archive-pane", "list");
    listPane.setAttribute("role", "tabpanel");
    listPane.setAttribute("aria-labelledby", "rl-atab-list");
    buildListPane(listPane);
    panels.appendChild(listPane);

    ["records", "drafts", "history"].forEach(function(kind){
      var pane = h("div", "archive-pane");
      pane.id = "rl-" + kind;
      pane.setAttribute("data-archive-pane", kind);
      pane.setAttribute("role", "tabpanel");
      pane.setAttribute("aria-labelledby", "rl-atab-" + kind);
      panels.appendChild(pane);
    });

    body.appendChild(panels);

    archiveDelete = null;
    archiveClear = null;
    archiveRenameId = null;

    renderArchiveViews();
    applyArchiveTab();
    loadArchive();
    updateList();
  }

  function buildListPane(pane){
    pane.appendChild(buildListProgress());

    var tools = h("div", "list-tools");
    tools.appendChild(buildListSearch());
    tools.appendChild(buildListTypeFilters());
    tools.appendChild(buildListControls());
    pane.appendChild(tools);

    var groups = h("div", "reqgroups");
    groups.id = "rl-list-groups";
    pane.appendChild(groups);

    var empty = h("div", "empty");
    empty.id = "rl-empty";
    empty.hidden = true;
    pane.appendChild(empty);
  }

  /* ---------- archive tabs ---------- */

  function buildArchiveTabs(){
    var wrap = h("div", "archive-tabs");
    wrap.setAttribute("role", "tablist");
    wrap.setAttribute("aria-label", t("Arşiv bölümleri"));
    ARCHIVE_TABS.forEach(function(tab){
      var btn = h("button", "atab" + (tab.id === archiveTab ? " is-active" : ""));
      btn.type = "button";
      btn.id = "rl-atab-" + tab.id;
      btn.setAttribute("role", "tab");
      btn.setAttribute("data-archive-tab", tab.id);
      btn.setAttribute("aria-controls", tab.id === "list" ? "rl-list-pane" : "rl-" + tab.id);
      btn.setAttribute("aria-selected", tab.id === archiveTab ? "true" : "false");
      btn.appendChild(h("span", "atab-label", t(tab.label)));
      var n = h("span", "atab-n", "0");
      n.setAttribute("data-archive-count", tab.id);
      btn.appendChild(n);
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function archiveCounts(){
    return {
      list: app ? app.requests.length : 0,
      history: archiveData.history.length,
      records: archiveData.records.length,
      drafts: archiveData.drafts.length
    };
  }

  function updateArchiveTabCounts(){
    var counts = archiveCounts();
    var tabs = document.querySelectorAll("[data-archive-tab]");
    for(var i = 0; i < tabs.length; i++){
      var id = tabs[i].getAttribute("data-archive-tab");
      var active = id === archiveTab;
      tabs[i].classList.toggle("is-active", active);
      tabs[i].setAttribute("aria-selected", active ? "true" : "false");
      var n = tabs[i].querySelector("[data-archive-count]");
      if(n) n.textContent = String(counts[id] || 0);
    }
  }

  function switchArchiveTab(tab){
    if(!tab || tab === archiveTab || !ARCHIVE_TAB_IDS[tab]) return;
    archiveScroll[archiveTab] = els.body ? els.body.scrollTop : 0;
    archiveTab = tab;
    archiveDelete = null;
    archiveClear = null;
    archiveRenameId = null;
    archiveDetail = null;
    applyArchiveTab();
    if(tab === "list"){
      lastScrolledSelection = null;
      updateList();
    }
    if(els.body) els.body.scrollTop = archiveScroll[tab] || 0;
    updateScrollAffordance();
    if(tab !== "list") loadArchive();
  }

  function applyArchiveTab(){
    var panes = document.querySelectorAll("[data-archive-pane]");
    for(var i = 0; i < panes.length; i++){
      panes[i].hidden = panes[i].getAttribute("data-archive-pane") !== archiveTab;
    }
    updateArchiveTabCounts();
    syncArchiveEmptyHook();
    if(archiveRenameId){
      setTimeout(function(){
        var input = document.getElementById("rl-record-rename-input");
        if(input){
          try{ input.focus(); input.select(); }catch(err){ /* ignore */ }
        }
      }, 30);
    }
    updateScrollAffordance();
  }

  function syncArchiveEmptyHook(){
    var nodes = document.querySelectorAll("[data-archive-empty]");
    for(var i = 0; i < nodes.length; i++) nodes[i].removeAttribute("id");
    if(archiveTab === "list") return;
    var active = document.querySelector('[data-archive-pane="' + archiveTab + '"] [data-archive-empty]');
    if(active) active.id = "rl-archive-empty";
  }

  /* ---------- archive data ---------- */

  function sortArchive(kind){
    var list = archiveData[kind] || [];
    list.sort(function(a, b){
      var left = kind === "history" ? (a.exportedAt || a.savedAt) : a.savedAt;
      var right = kind === "history" ? (b.exportedAt || b.savedAt) : b.savedAt;
      var dl = left ? new Date(left).getTime() : 0;
      var dr = right ? new Date(right).getTime() : 0;
      return dr - dl;
    });
  }

  function ensureArchiveItem(kind, item){
    if(!item || typeof item !== "object") return { id:"", requests:[], project:"", savedAt:"" };
    if(kind !== "history"){
      if(!item.name){
        item.name = (item.project || "Projem") + " · " + fmtDateTime(item.savedAt);
      }
    }
    if(!Array.isArray(item.requests)) item.requests = [];
    return item;
  }

  function loadArchive(){
    if(archiveData.loading) return archiveData.loading;
    if(!core || !core.storage || !core.storage.listCollection){
      archiveData.loaded = true;
      return Promise.resolve(archiveData);
    }
    var kinds = ["records", "drafts", "history"];
    archiveData.loading = Promise.all(kinds.map(function(kind){
      return Promise.resolve()
        .then(function(){ return core.storage.listCollection(kind); })
        .then(function(list){ return list || []; })
        .catch(function(){ return []; });
    })).then(function(lists){
      kinds.forEach(function(kind, index){
        archiveData[kind] = (lists[index] || []).map(function(item){ return ensureArchiveItem(kind, item); });
        sortArchive(kind);
      });
      archiveData.loaded = true;
      archiveData.loading = null;
      refreshArchiveViews();
      return archiveData;
    }).catch(function(){
      archiveData.loading = null;
      archiveData.loaded = true;
      refreshArchiveViews();
      return archiveData;
    });
    return archiveData.loading;
  }

  function refreshArchiveViews(){
    if(role !== "flyout" || state.section !== "list") return;
    if(!document.getElementById("rl-archive-panel")) return;
    var scroll = els.body ? els.body.scrollTop : 0;
    renderArchiveViews();
    renderArchiveProjectTree();
    if(els.body) els.body.scrollTop = scroll;
    updateScrollAffordance();
  }

  function renderArchiveViews(){
    ["records", "drafts", "history"].forEach(function(kind){
      var pane = document.getElementById("rl-" + kind);
      if(!pane) return;
      pane.textContent = "";
      renderArchivePane(pane, kind);
    });
    syncDuplicatePrompt();
    updateArchiveTabCounts();
    syncArchiveEmptyHook();
    syncStorageUI();
  }

  /* the live ledger can change without a full flyout re-render (archive load,
     import, etc.); rebuild the İstekler pane in place so it never goes stale */
  function refreshListPane(){
    if(role !== "flyout" || state.section !== "list") return;
    var pane = document.querySelector('[data-archive-pane="list"]');
    if(!pane) return;
    var scroll = els.body ? els.body.scrollTop : 0;
    pane.textContent = "";
    buildListPane(pane);
    lastScrolledSelection = archiveTab === "list" ? null : state.highlight;
    updateList();
    renderArchiveProjectTree();
    if(els.body) els.body.scrollTop = scroll;
    updateScrollAffordance();
  }

  function renderArchivePane(pane, kind){
    var hintText = kind === "records" ? lx("recordHint") : kind === "drafts" ? lx("draftHint") : lx("historyHint");
    var head = h("div", "archive-head");
    head.appendChild(h("span", "archive-hint", hintText));

    var clear = h("button", "archive-clear", t("Temizle"));
    clear.type = "button";
    clear.id = kind === "records" ? "rl-records-clear" : kind === "drafts" ? "rl-drafts-clear" : "rl-history-clear";
    clear.setAttribute("data-archive-act", "clear-" + kind);
    clear.disabled = !archiveData[kind].length;
    head.appendChild(clear);
    pane.appendChild(head);

    if(archiveClear === kind) pane.appendChild(buildArchiveClearConfirm(kind));

    if(kind === "history" && archiveDetail){
      pane.appendChild(buildArchiveDetail(archiveDetail));
      return;
    }

    var items = archiveData[kind];
    if(!items.length){
      pane.appendChild(buildArchiveEmpty(kind));
      return;
    }

    var list = h("div", "archive-rows");
    items.forEach(function(item){ list.appendChild(buildArchiveRow(kind, item)); });
    pane.appendChild(list);
  }

  function buildArchiveEmpty(kind){
    var empty = h("div", "empty archive-empty");
    empty.setAttribute("data-archive-empty", "");
    var icon = h("span", "empty-ic");
    icon.innerHTML = kind === "history" ? ICONS.folder : ICONS.doc;
    icon.setAttribute("aria-hidden", "true");
    empty.appendChild(icon);
    var message = kind === "history"
      ? t("Henüz dışa aktarılan liste yok. Dışa aktarım sonrası burada tarihe göre görünecek.")
      : kind === "records"
        ? t("Henüz kayıt yok. Üstteki Kaydet ikonuyla anlık kayıt alabilirsin.")
        : t("Henüz taslak yok. Bir kayıt yüklenmeden önce mevcut liste otomatik taslak olarak saklanır.");
    empty.appendChild(h("b", null, message));
    return empty;
  }

  function buildArchiveRow(kind, item){
    var row = h("article", "arow");
    row.setAttribute("data-record-id", item.id);
    row.setAttribute("data-record-kind", kind);

    var main = h("div", "arow-main");
    if(kind === "records"){
      var dot = h("span", "adot " + recordStatusClass(item));
      dot.setAttribute("aria-hidden", "true");
      dot.title = recordStatusTitle(item);
      main.appendChild(dot);
    }

    var text = h("div", "arow-text");
    var titleLine = h("div", "arow-titleline");
    titleLine.appendChild(h("b", "arow-name", archiveName(item, kind)));
    if(kind === "drafts") titleLine.appendChild(h("span", "draft-badge", t("Taslak")));
    text.appendChild(titleLine);
    text.appendChild(h("span", "arow-meta", archiveMeta(item, kind)));
    text.appendChild(h("span", "arow-sub", archiveSub(item, kind)));
    main.appendChild(text);
    row.appendChild(main);

    var acts = h("div", "arow-acts");
    var open = h("button", "arow-act", lx("open"));
    open.type = "button";
    open.setAttribute("data-record-action", "open");
    acts.appendChild(open);

    if(kind === "records"){
      var rename = h("button", "arow-act", t("Yeniden adlandır"));
      rename.type = "button";
      rename.setAttribute("data-record-action", "rename");
      acts.appendChild(rename);
    }

    var del = h("button", "arow-act is-danger", t("Sil"));
    del.type = "button";
    del.setAttribute("data-record-action", "delete");
    acts.appendChild(del);
    row.appendChild(acts);

    if(kind === "records" && archiveRenameId === item.id) row.appendChild(buildRenameEditor(item));
    if(archiveDelete && archiveDelete.id === item.id && archiveDelete.kind === kind){
      row.appendChild(buildArchiveDeleteConfirm(kind, item));
    }
    return row;
  }

  function archiveName(item, kind){
    if(kind === "history") return item.project || item.name || t("Dışa Aktarılanlar");
    if(item.name) return item.name;
    var base = item.project || "Projem";
    return base + " · " + fmtDateTime(item.savedAt);
  }

  function archiveMeta(item, kind){
    var n = item.requestCount == null ? (item.requests || []).length : item.requestCount;
    var m = item.imageCount;
    var k = item.fileCount;
    if(m == null){
      m = 0;
      (item.requests || []).forEach(function(req){ m += (req.images || []).length; });
    }
    if(k == null){
      k = 0;
      (item.requests || []).forEach(function(req){ k += (req.attachments || []).length; });
    }
    if(kind === "history"){
      return t(n + " istek") + " · " + String(item.format || "zip").toUpperCase();
    }
    return t(n + " istek") + " · " + t(m + " görsel") + " · " + t(k + " dosya");
  }

  function archiveSub(item, kind){
    var time = fmtDateTime(kind === "history" ? (item.exportedAt || item.savedAt) : item.savedAt);
    if(kind === "history"){
      return time + " · " + (item.fileName || t("Tarayıcıda"));
    }
    if(kind === "drafts"){
      var reason = item.reason;
      var reasonText = !reason ? t("Manuel taslak") : (reason === "auto-draft" || reason === L.autoDraftReason.tr ? lx("autoDraftReason") : t(reason));
      return time + " · " + reasonText;
    }
    return time;
  }

  function recordStatusClass(item){
    if(!item || !item.complete) return "is-red";
    return item.exported ? "is-green" : "is-yellow";
  }

  function recordStatusTitle(item){
    if(!item || !item.complete) return lx("missingFields");
    return item.exported ? lx("exported") : lx("notExported");
  }

  function buildRenameEditor(item){
    var box = h("div", "arename");
    var input = document.createElement("input");
    input.type = "text";
    input.id = "rl-record-rename-input";
    input.className = "fld";
    input.maxLength = 120;
    input.autocomplete = "off";
    input.value = item.name || "";
    input.setAttribute("aria-label", t("Kayıt adı"));
    box.appendChild(input);

    var save = h("button", "btn btn--small btn--primary", t("Kaydet"));
    save.type = "button";
    save.setAttribute("data-archive-act", "rename-save");
    box.appendChild(save);

    var cancel = h("button", "btn btn--small", t("Vazgeç"));
    cancel.type = "button";
    cancel.setAttribute("data-archive-act", "rename-cancel");
    box.appendChild(cancel);
    return box;
  }

  function buildArchiveDeleteConfirm(kind, item){
    var box = h("div", "mini-confirm archive-confirm");
    box.setAttribute("role", "alertdialog");
    var title = kind === "records" ? lx("recordDeleteTitle") : kind === "drafts" ? lx("draftDeleteTitle") : lx("historyDeleteTitle");
    box.appendChild(h("p", "mc-text", title));
    box.appendChild(h("p", "mc-sub", archiveName(item, kind) + " · " + lx("deleteSub")));

    var actions = h("div", "mc-actions");
    var del = h("button", "btn btn--small btn--danger", t("Sil"));
    del.type = "button";
    del.setAttribute("data-archive-act", "delete-confirm");
    actions.appendChild(del);
    var back = h("button", "btn btn--small", t("Vazgeç"));
    back.type = "button";
    back.setAttribute("data-archive-act", "delete-cancel");
    actions.appendChild(back);
    box.appendChild(actions);
    return box;
  }

  function buildArchiveClearConfirm(kind){
    var box = h("div", "mini-confirm archive-confirm");
    box.setAttribute("role", "alertdialog");
    var label = kind === "records" ? t("Kayıtlar") : kind === "drafts" ? t("Taslaklar") : t("Dışa Aktarılanlar");
    box.appendChild(h("p", "mc-text", lx("clearTitle", { label:label })));
    box.appendChild(h("p", "mc-sub", lx("clearSub")));

    var actions = h("div", "mc-actions");
    var ok = h("button", "btn btn--small btn--danger", t("Temizle"));
    ok.type = "button";
    ok.setAttribute("data-archive-act", "clear-confirm");
    actions.appendChild(ok);
    var back = h("button", "btn btn--small", t("Vazgeç"));
    back.type = "button";
    back.setAttribute("data-archive-act", "clear-cancel");
    actions.appendChild(back);
    box.appendChild(actions);
    return box;
  }

  function buildArchiveDetail(item){
    var box = h("article", "adetail");
    box.setAttribute("data-record-id", item.id);
    box.setAttribute("data-record-kind", "history");

    var head = h("div", "adetail-head");
    var back = h("button", "archive-back", "← " + lx("back"));
    back.type = "button";
    back.setAttribute("data-archive-act", "detail-back");
    head.appendChild(back);

    var del = h("button", "arow-act is-danger", t("Sil"));
    del.type = "button";
    del.setAttribute("data-record-action", "delete");
    head.appendChild(del);
    box.appendChild(head);

    box.appendChild(h("b", "adetail-title", archiveName(item, "history")));
    box.appendChild(h("div", "adetail-meta", archiveMeta(item, "history") + " · " + (item.fileName || t("Tarayıcıda"))));

    var preview = document.createElement("pre");
    preview.className = "archive-preview";
    preview.setAttribute("readonly", "readonly");
    preview.textContent = item.markdown || lx("contentsMissing");
    box.appendChild(preview);

    if(archiveDelete && archiveDelete.id === item.id && archiveDelete.kind === "history"){
      box.appendChild(buildArchiveDeleteConfirm("history", item));
    }
    return box;
  }

  function syncDuplicatePrompt(){
    var host = document.getElementById("rl-dup-prompt");
    if(!host) return;
    host.textContent = "";
    if(!duplicatePrompt){
      host.hidden = true;
      return;
    }
    host.hidden = false;

    var box = h("div", "mini-confirm archive-confirm");
    box.setAttribute("role", "alertdialog");
    box.appendChild(h("p", "mc-text", lx("duplicateTitle")));
    var existing = duplicatePrompt.existing;
    var when = fmtDateTime(existing ? existing.savedAt : "");
    box.appendChild(h("p", "mc-sub", t("Bu istek listesi " + when + " tarihinde kaydedilmiş. Mevcut kaydın üzerine yazmak mı, yoksa yeni bir kayıt oluşturmak mı istersin?")));

    var actions = h("div", "mc-actions");
    var overwrite = h("button", "btn btn--small btn--primary", t("Üzerine Yaz"));
    overwrite.type = "button";
    overwrite.setAttribute("data-archive-act", "dup-overwrite");
    actions.appendChild(overwrite);

    var fresh = h("button", "btn btn--small", t("Yeni Kayıt Oluştur"));
    fresh.type = "button";
    fresh.setAttribute("data-archive-act", "dup-new");
    actions.appendChild(fresh);

    var cancel = h("button", "btn btn--small", t("Vazgeç"));
    cancel.type = "button";
    cancel.setAttribute("data-archive-act", "dup-cancel");
    actions.appendChild(cancel);

    box.appendChild(actions);
    host.appendChild(box);
  }

  function fmtDateTime(value){
    if(value && core && core.util && core.util.formatDateTime){
      try{ return core.util.formatDateTime(value); }catch(err){ /* ignore */ }
    }
    return value ? String(value) : "";
  }

  function buildListProgress(){
    var btn = h("button", "list-progress");
    btn.type = "button";
    btn.id = "rl-list-progress";
    btn.setAttribute("data-act", "jump-incomplete");

    var top = h("span", "lp-top");
    top.appendChild(h("span", "lp-text", ""));
    top.appendChild(h("span", "lp-missing", ""));
    btn.appendChild(top);

    var bar = h("span", "lp-bar");
    bar.appendChild(h("i"));
    btn.appendChild(bar);
    return btn;
  }

  function buildListSearch(){
    var box = h("div", "searchbox");
    var icon = h("span", "searchbox-ic");
    icon.innerHTML = ICONS.search;
    icon.setAttribute("aria-hidden", "true");
    box.appendChild(icon);

    var input = document.createElement("input");
    input.type = "search";
    input.id = "rl-search";
    input.className = "fld";
    input.autocomplete = "off";
    input.placeholder = lx("search");
    input.setAttribute("aria-label", lx("search"));
    input.value = listFilter.q || "";
    box.appendChild(input);
    return box;
  }

  function buildListTypeFilters(){
    var wrap = h("div", "lfchips");
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", t("Türe göre filtrele"));

    var entries = [{ id:"all", label:t("Tümü") }].concat(TYPES.map(function(entry){
      return { id:entry.id, label:t(entry.label) };
    }));
    entries.forEach(function(entry){
      var active = listFilter.type === entry.id;
      var btn = h("button", "lfchip" + (active ? " is-active" : ""));
      btn.type = "button";
      btn.setAttribute("data-filter-type", entry.id);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
      btn.appendChild(h("span", null, entry.label));
      var n = h("span", "n", "0");
      n.setAttribute("data-count", entry.id);
      btn.appendChild(n);
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function buildListControls(){
    var row = h("div", "list-row2");
    var options = [
      { value:"all", label:t("Tüm durumlar") },
      { value:"ready", label:t("Hazır") },
      { value:"notready", label:t("Hazır değil") }
    ];
    /* shell v11 §6: themed custom select; the hidden native select keeps the
       id + change hooks for automation. */
    var status = buildCustomSelect("rl-status-filter", listFilter.status, options, function(value){
      listFilter.status = (value === "ready" || value === "notready") ? value : "all";
      openRowMenuId = null;
      listDeleteId = null;
      refreshList();
    }, {
      className:"list-status-sel",
      label:t("Duruma göre filtrele"),
      attrs:{ "aria-label":t("Duruma göre filtrele") }
    });
    row.appendChild(status);

    var count = h("span", "list-count", "");
    count.id = "rl-list-count";
    row.appendChild(count);
    return row;
  }

  function updateList(){
    if(role !== "flyout" || state.section !== "list" || !app) return;
    var groups = document.getElementById("rl-list-groups");
    if(!groups) return;

    groups.textContent = "";
    var selection = selectedRequestId();
    var totals = {};
    TYPES.forEach(function(type){ totals[type.id] = 0; });
    app.requests.forEach(function(req){
      if(totals[req.type] == null) totals[req.type] = 0;
      totals[req.type]++;
    });

    var visible = 0;
    var grouped = {};
    TYPES.forEach(function(type){ grouped[type.id] = []; });
    app.requests.forEach(function(req){
      if(!listMatches(req)) return;
      if(!grouped[req.type]) grouped[req.type] = [];
      grouped[req.type].push(req);
    });
    TYPES.forEach(function(type){
      var items = grouped[type.id] || [];
      if(!items.length) return;

      var group = h("section", "tgroup");
      group.setAttribute("data-type-group", type.id);
      var head = h("div", "tgroup-head");
      var dot = h("i", "dot dot--" + type.id);
      dot.setAttribute("aria-hidden", "true");
      head.appendChild(dot);
      head.appendChild(h("h4", null, t(type.label)));
      head.appendChild(h("span", "tgroup-count", String(items.length)));
      group.appendChild(head);

      items.forEach(function(req){
        group.appendChild(buildListRow(req, selection));
        visible++;
      });
      groups.appendChild(group);
    });

    var total = app.requests.length;

    /* filter chips: active state + counts */
    var chips = document.querySelectorAll("[data-filter-type]");
    for(var c = 0; c < chips.length; c++){
      var chip = chips[c];
      var typeId = chip.getAttribute("data-filter-type");
      var active = listFilter.type === typeId;
      chip.classList.toggle("is-active", active);
      chip.setAttribute("aria-pressed", active ? "true" : "false");
      var countNode = chip.querySelector("[data-count]");
      if(countNode) countNode.textContent = String(typeId === "all" ? total : (totals[typeId] || 0));
    }

    /* result count */
    var filtered = !!listFilter.q || listFilter.type !== "all" || listFilter.status !== "all";
    var countText = t(total + " istek");
    var countEl = document.getElementById("rl-list-count");
    if(countEl) countEl.textContent = (filtered ? visible + " / " : "") + countText;

    updateListProgress(total);
    fillListEmpty(total, visible);

    var saveBtn = document.getElementById("rl-save-record");
    if(saveBtn) saveBtn.disabled = total === 0;
    updateArchiveTabCounts();

    if(selection && selection !== lastScrolledSelection){
      var targetRow = null;
      var rows = groups.querySelectorAll("[data-request-id]");
      for(var r = 0; r < rows.length; r++){
        if(rows[r].getAttribute("data-request-id") === selection){ targetRow = rows[r]; break; }
      }
      if(targetRow){
        lastScrolledSelection = selection;
        requestAnimationFrame(function(){ revealListRow(targetRow); });
      }
    }
    syncStorageUI();
    updateScrollAffordance();
  }

  /* ============================================================
     WORKSPACE UI · project picker + archive Projects tree
     ============================================================ */

  function sortedProjects(){
    var registry = readRegistry();
    var projects = registry ? registry.projects.slice() : [];
    projects.sort(function(a, b){
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    });
    return projects;
  }

  function projectFormVisible(){
    var projects = sortedProjects();
    return projectFormOpen || projects.length === 0;
  }

  function projectSectionLabel(){
    return sortedProjects().length ? lx("projects") : lx("newProject");
  }

  function projectSectionTitle(){
    return sortedProjects().length ? lx("projects") : lx("newProjectTitle");
  }

  function projectSearchMatches(project, query){
    if(!query) return true;
    return trLower(project.name).indexOf(query) !== -1;
  }

  function buildProjectRow(project, action){
    var btn = h("button", "arow project-row");
    btn.type = "button";
    btn.setAttribute("data-project-act", action || "settings");
    btn.setAttribute("data-project-id", project.id);
    btn.title = project.name + " · " + projectMetaText(project);
    if(project.id === activeProjectId) btn.setAttribute("aria-current", "true");

    var main = h("div", "arow-main");
    if(project.id === activeProjectId){
      var dot = h("span", "adot is-green");
      dot.setAttribute("aria-hidden", "true");
      main.appendChild(dot);
    }
    var text = h("div", "arow-text");
    text.appendChild(h("b", "arow-name", project.name));
    text.appendChild(h("span", "arow-meta", projectMetaText(project)));
    main.appendChild(text);
    btn.appendChild(main);

    if(project.id === activeProjectId){
      var current = h("span", "project-current", lx("projectCurrentlyOpen"));
      btn.appendChild(current);
    }
    return btn;
  }

  function buildProjectPendingConfirm(){
    if(!projectSwitchPending && !projectCreatePending) return null;
    var box = h("div", "mini-confirm archive-confirm");
    box.setAttribute("role", "alertdialog");
    var isSwitch = !!projectSwitchPending;
    box.appendChild(h("p", "mc-text", lx(isSwitch ? "projectSwitchTitle" : "newProjectTitle")));
    box.appendChild(h("p", "mc-sub", lx(isSwitch ? "projectSwitchMsg" : "projectCreateMsg")));

    var actions = h("div", "mc-actions");
    var save = h("button", "btn btn--small btn--primary", lx(isSwitch ? "projectSaveAndSwitch" : "projectSaveAndCreate"));
    save.type = "button";
    save.setAttribute("data-project-act", isSwitch ? "switch-save" : "create-save");
    actions.appendChild(save);

    var discard = h("button", "btn btn--small", lx(isSwitch ? "projectSwitchWithoutSaving" : "projectCreateWithoutSaving"));
    discard.type = "button";
    discard.setAttribute("data-project-act", isSwitch ? "switch-discard" : "create-discard");
    actions.appendChild(discard);

    var cancel = h("button", "btn btn--small", t("Vazgeç"));
    cancel.type = "button";
    cancel.setAttribute("data-project-act", isSwitch ? "switch-cancel" : "create-cancel");
    actions.appendChild(cancel);

    box.appendChild(actions);
    return box;
  }

  /* ---------- project gate / picker section ---------- */

  function renderProjectSection(body){
    body.classList.add("project-body");
    var block = addBlock(body, projectFormVisible() ? lx("newProjectTitle") : lx("projects"));

    var pending = buildProjectPendingConfirm();
    if(pending) block.appendChild(pending);

    var projects = sortedProjects();
    if(projectFormVisible()){
      var back = null;
      if(projects.length){
        back = h("button", "project-back", "← " + lx("back"));
        back.type = "button";
        back.setAttribute("data-project-act", "picker");
        block.appendChild(back);
      }
      block.appendChild(h("p", "set-hint", lx("projectCreateHint")));

      addLabel(block, requiredLabel(lx("projectName")), "rl-project-input");
      var input = addField(block, {
        id: "rl-project-input",
        tag: "input",
        max: 60,
        placeholder: lx("projectNamePh"),
        value: ""
      });
      input.autocomplete = "off";
      input.type = "text";
      input.addEventListener("keydown", function(event){
        if(event.key === "Enter"){ event.preventDefault(); saveProjectName(); }
      });
      setTimeout(function(){
        if(input && !input.disabled) try{ input.focus(); }catch(err){ /* ignore */ }
      }, 40);
      return;
    }

    block.appendChild(h("p", "set-hint", lx("projectPickHint")));

    var list = h("div", "archive__projecttree");
    list.id = "rl-project-picker-tree";
    projects.forEach(function(project){
      list.appendChild(buildProjectRow(project, "pick"));
    });
    block.appendChild(list);

    var add = h("button", "btn btn--small archive__new", lx("projectNew"));
    add.type = "button";
    add.id = "rl-project-new";
    add.setAttribute("data-project-act", "new");
    block.appendChild(add);
  }

  function openProjectCreateForm(){
    projectFormOpen = true;
    if(role === "flyout"){
      showSection("project");
      return;
    }
    refreshProjectViews();
  }

  function openProjectPickerList(){
    projectFormOpen = false;
    if(role === "flyout" && state.section === "project"){
      renderFlyout("project");
      return;
    }
    refreshProjectViews();
  }

  /* ---------- archive Projects section ---------- */

  function buildArchiveProjectsSection(){
    var wrap = h("section", "archive__projects");

    var head = h("div", "archive__sectionhead");
    head.appendChild(h("span", "archive__label", lx("projects")));
    var count = h("span", "archive__n");
    count.id = "rl-project-count";
    head.appendChild(count);
    var add = h("button", "btn btn--small archive__new", lx("projectNew"));
    add.type = "button";
    add.id = "rl-archive-project-new";
    add.setAttribute("data-project-act", "new");
    head.appendChild(add);
    wrap.appendChild(head);

    var search = h("div", "searchbox archive__search");
    var icon = h("span", "searchbox-ic");
    icon.innerHTML = ICONS.search;
    icon.setAttribute("aria-hidden", "true");
    search.appendChild(icon);
    var input = document.createElement("input");
    input.type = "search";
    input.id = "rl-project-search";
    input.className = "fld";
    input.autocomplete = "off";
    input.placeholder = lx("projectsSearch");
    input.setAttribute("aria-label", lx("projectsSearch"));
    input.value = archiveProjectQuery;
    search.appendChild(input);
    wrap.appendChild(search);

    var tree = h("div", "archive__projecttree");
    tree.id = "rl-archive-project-tree";
    wrap.appendChild(tree);

    var pending = buildProjectPendingConfirm();
    if(pending) wrap.appendChild(pending);

    renderArchiveProjectTree();
    return wrap;
  }

  function renderArchiveProjectTree(){
    var tree = document.getElementById("rl-archive-project-tree");
    if(!tree) return;
    var projects = sortedProjects();
    var query = trLower(String(archiveProjectQuery || "").trim());
    var filtered = projects.filter(function(project){ return projectSearchMatches(project, query); });
    var count = document.getElementById("rl-project-count");
    if(count) count.textContent = query ? filtered.length + " / " + projects.length : String(projects.length);

    if(archiveSelectedProjectId && !projects.some(function(project){ return project.id === archiveSelectedProjectId; })){
      archiveSelectedProjectId = null;
    }

    tree.textContent = "";
    if(!filtered.length){
      var empty = h("div", "archive-project-empty", query
        ? lx("projectsNoMatch")
        : lx("projectsEmpty"));
      tree.appendChild(empty);
      return;
    }
    filtered.forEach(function(project){
      tree.appendChild(buildProjectRow(project, "settings"));
    });
  }

  function applyProjectExportTarget(projectId, name){
    if(!name){
      toast(lx("pickerCancelled"));
      return;
    }
    setProjectExportTarget(projectId, name);
    toast(lx("projectTargetSet", { name:name }));
    if(projectSettingsId === projectId) renderProjectSettingsModal();
    renderArchiveProjectTree();
  }

  function updateListProgress(total){
    var node = document.getElementById("rl-list-progress");
    if(!node) return;
    var ready = 0;
    app.requests.forEach(function(req){ if(statusOf(req) === "ready") ready++; });
    var missing = total - ready;

    var text = node.querySelector(".lp-text");
    if(text) text.textContent = t(ready + " / " + total + " hazır");
    var miss = node.querySelector(".lp-missing");
    if(miss) miss.textContent = t(missing + " eksik");
    var fill = node.querySelector(".lp-bar i");
    if(fill) fill.style.width = (total ? Math.round((ready / total) * 100) : 0) + "%";
    node.classList.toggle("is-complete", total > 0 && missing === 0);
    node.disabled = total === 0;
  }

  function fillListEmpty(total, visible){
    var empty = document.getElementById("rl-empty");
    if(!empty) return;
    if(total > 0 && visible > 0){
      empty.hidden = true;
      empty.textContent = "";
      return;
    }
    empty.textContent = "";
    empty.hidden = false;

    var icon = h("span", "empty-ic");
    icon.innerHTML = ICONS.list;
    icon.setAttribute("aria-hidden", "true");
    empty.appendChild(icon);

    if(!total){
      empty.appendChild(h("b", null, t("Henüz istek yok")));
      empty.appendChild(h("span", "empty-sub", t("İlk isteği ekleyerek başla.")));
      var add = h("button", "btn btn--small", t("İlk isteği ekle"));
      add.type = "button";
      add.setAttribute("data-act", "goto-new");
      empty.appendChild(add);
      return;
    }

    empty.appendChild(h("b", null, lx("noMatch")));
    empty.appendChild(h("span", "empty-sub", lx("noMatchSub")));
    var clear = h("button", "btn btn--small", t("Filtreleri temizle"));
    clear.type = "button";
    clear.setAttribute("data-act", "clear-filters");
    empty.appendChild(clear);
  }

  function buildListRow(req, selection){
    var status = statusOf(req);
    var row = h("article", "rrow rrow--" + status);
    row.setAttribute("data-request-id", req.id);
    row.setAttribute("data-status", status);
    if(req.id === selection){
      row.classList.add("is-highlight");
      row.setAttribute("aria-current", "true");
    }

    var main = h("button", "rrow-main");
    main.type = "button";
    main.setAttribute("data-act", "open-request");

    var tick = h("span", "rtick", status === "ready" ? "✓" : "");
    tick.setAttribute("aria-hidden", "true");
    tick.title = statusLabel(status);
    main.appendChild(tick);

    var text = h("span", "rrow-text");
    var top = h("span", "rrow-top");
    top.appendChild(h("span", "rrow-id", req.id));
    top.appendChild(h("span", "rtag rtag--" + req.type, t(typeInfo(req.type).label)));
    text.appendChild(top);
    text.appendChild(h("span", "rrow-title", (req.title && String(req.title).trim()) ? req.title : t("Başlıksız istek")));
    text.appendChild(h("span", "rrow-meta", listMeta(req, status)));
    main.appendChild(text);
    row.appendChild(main);

    var more = h("button", "rrow-more", "⋯");
    more.type = "button";
    more.setAttribute("data-act", "row-menu");
    more.setAttribute("aria-label", lx("rowActions"));
    more.title = lx("rowActions");
    row.appendChild(more);

    if(openRowMenuId === req.id) row.appendChild(buildRowMenu());
    if(listDeleteId === req.id) row.appendChild(buildRowConfirm(req));
    return row;
  }

  function listMeta(req, status){
    var page = (req.page || "").trim();
    var location = (req.location || "").trim();
    var place = page ? (location ? page + " › " + location : page) : (location || lx("noPage"));
    return place + " · " + t((req.images || []).length + " görsel") + " · " + statusLabel(status);
  }

  function buildRowMenu(){
    var menu = h("div", "rowmenu");
    menu.setAttribute("role", "menu");
    [["duplicate", t("Çoğalt")], ["up", t("Yukarı taşı")], ["down", t("Aşağı taşı")]].forEach(function(item){
      var btn = h("button", null, item[1]);
      btn.type = "button";
      btn.setAttribute("role", "menuitem");
      btn.setAttribute("data-row-action", item[0]);
      menu.appendChild(btn);
    });
    menu.appendChild(h("div", "msep"));
    var del = h("button", "is-danger", t("Sil"));
    del.type = "button";
    del.setAttribute("role", "menuitem");
    del.setAttribute("data-row-action", "delete");
    menu.appendChild(del);
    return menu;
  }

  function buildRowConfirm(req){
    var box = h("div", "row-confirm mini-confirm");
    box.setAttribute("role", "alertdialog");
    box.appendChild(h("p", "mc-text", lx("deleteRow")));
    box.appendChild(h("p", "mc-sub", req.id + " · " + lx("deleteRowSub")));
    var actions = h("div", "mc-actions");
    var del = h("button", "btn btn--small btn--danger", t("Sil"));
    del.type = "button";
    del.setAttribute("data-row-action", "delete-confirm");
    var back = h("button", "btn btn--small", t("Vazgeç"));
    back.type = "button";
    back.setAttribute("data-row-action", "delete-cancel");
    actions.appendChild(del);
    actions.appendChild(back);
    box.appendChild(actions);
    return box;
  }

  function revealListRow(row){
    if(!row || !els.body) return;
    var bodyRect = els.body.getBoundingClientRect();
    var rowRect = row.getBoundingClientRect();
    var topPad = 56; /* sticky progress strip */
    var bottomPad = 14;
    if(rowRect.top < bodyRect.top + topPad){
      els.body.scrollTop -= (bodyRect.top + topPad - rowRect.top);
    }else if(rowRect.bottom > bodyRect.bottom - bottomPad){
      els.body.scrollTop += (rowRect.bottom - (bodyRect.bottom - bottomPad));
    }
    updateScrollAffordance();
  }

  /* clamps the status filter + counts after row mutations */
  function refreshList(){
    if(state.section === "list") updateList();
  }

  /* Keystrokes coalesce into one render per frame-ish slice: a 100-row list
     never rebuilds synchronously inside the input handler. */
  function refreshListSoon(){
    if(searchTimer) return;
    searchTimer = setTimeout(function(){
      searchTimer = null;
      refreshList();
    }, 40);
  }

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

  /* ============================================================
     WORKSPACE UI · project settings modal
     ============================================================ */

  function projectValueRow(label, value, id){
    var span = h("span", "project-value", value == null || value === "" ? "—" : String(value));
    if(id) span.id = id;
    return settingRow(label, span);
  }

  function projectSettingsRecord(){
    return projectSettingsId ? findProjectRecord(projectSettingsId) : null;
  }

  function refreshProjectSettingsCounts(projectId){
    projectSettingsCounts = null;
    withProjectScope(projectId, function(){
      return Promise.all([
        core.storage.listCollection("records").then(function(list){ return (list || []).length; }).catch(function(){ return 0; }),
        core.storage.listCollection("drafts").then(function(list){ return (list || []).length; }).catch(function(){ return 0; })
      ]);
    }).then(function(values){
      if(projectSettingsId !== projectId) return;
      projectSettingsCounts = { records:values[0] || 0, drafts:values[1] || 0 };
      /* Update the count values in place so a name being typed is never lost. */
      var recordNode = document.getElementById("rl-project-record-value");
      if(recordNode) recordNode.textContent = projectRecordCountText(projectSettingsCounts.records);
      var draftNode = document.getElementById("rl-project-draft-value");
      if(draftNode) draftNode.textContent = projectDraftCountText(projectSettingsCounts.drafts);
    }).catch(function(){ /* counts are decorative */ });
  }

  function closeProjectSettingsModal(){
    projectExportPick = null;
    projectSettingsId = null;
    projectSettingsCounts = null;
    projectDeleteConfirm = false;
    var node = document.getElementById("rl-project-settings");
    if(node && node.parentNode) node.parentNode.removeChild(node);
  }

  function renderProjectSettingsModal(){
    if(role !== "flyout" || !els.card) return;
    var project = projectSettingsRecord();
    if(!project){
      closeProjectSettingsModal();
      return;
    }
    var existing = document.getElementById("rl-project-settings");
    if(existing && existing.parentNode) existing.parentNode.removeChild(existing);

    var el = h("div", "tab-picker project-modal");
    el.id = "rl-project-settings";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", lx("projectSettingsTitle") + ": " + project.name);

    var head = h("div", "tab-picker-head");
    head.appendChild(h("b", "tab-picker-title", lx("projectSettingsTitle")));
    var close = h("button", "tab-picker-x", "×");
    close.type = "button";
    close.id = "rl-project-settings-close";
    close.setAttribute("aria-label", t("Kapat"));
    close.setAttribute("data-project-act", "close");
    head.appendChild(close);
    el.appendChild(head);

    var body = h("div", "tab-picker-list project-modal__body");

    var pending = buildProjectPendingConfirm();
    if(pending) body.appendChild(pending);

    var nameBlock = addBlock(body, lx("projects"));
    addLabel(nameBlock, requiredLabel(lx("projectName")), "rl-project-name-input");
    var nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "fld";
    nameInput.id = "rl-project-name-input";
    nameInput.maxLength = 60;
    nameInput.autocomplete = "off";
    nameInput.value = project.name;
    nameInput.setAttribute("data-project-field", "name");
    nameBlock.appendChild(nameInput);
    var rename = h("button", "btn btn--small btn--primary", t("Kaydet"));
    rename.type = "button";
    rename.setAttribute("data-project-act", "rename");
    nameBlock.appendChild(rename);

    var summary = addBlock(body, t("Özet"));
    summary.appendChild(projectValueRow(lx("projectCreatedAt"), fmtDateTime(project.createdAt)));
    summary.appendChild(projectValueRow(lx("projectUpdatedAt"), fmtDateTime(project.updatedAt)));
    summary.appendChild(projectValueRow(lx("projectRequestCount"), projectRequestCountText(projectRequestCount(project.id))));
    summary.appendChild(projectValueRow(
      lx("projectRecordCount"),
      projectSettingsCounts ? projectRecordCountText(projectSettingsCounts.records) : "…",
      "rl-project-record-value"
    ));
    summary.appendChild(projectValueRow(
      lx("projectDraftCount"),
      projectSettingsCounts ? projectDraftCountText(projectSettingsCounts.drafts) : "…",
      "rl-project-draft-value"
    ));
    summary.appendChild(projectValueRow(lx("projectExportTarget"), project.exportTarget || lx("projectTargetNone")));

    var targetBlock = addBlock(body, lx("projectExportTarget"));
    var targetValue = document.createElement("input");
    targetValue.type = "text";
    targetValue.className = "fld";
    targetValue.id = "rl-project-target";
    targetValue.readOnly = true;
    targetValue.value = project.exportTarget || lx("projectTargetNone");
    targetValue.title = targetValue.value;
    targetBlock.appendChild(targetValue);
    var targetActions = h("div", "project-actions");
    var choose = h("button", "btn btn--small", lx("projectChooseTarget"));
    choose.type = "button";
    choose.setAttribute("data-project-act", "choose-target");
    targetActions.appendChild(choose);
    var clear = h("button", "btn btn--small", lx("projectClearTarget"));
    clear.type = "button";
    clear.setAttribute("data-project-act", "clear-target");
    clear.disabled = !project.exportTarget;
    targetActions.appendChild(clear);
    targetBlock.appendChild(targetActions);

    var actions = addBlock(body, lx("projects"));
    var actionRow = h("div", "project-actions");
    var isActive = project.id === activeProjectId;
    var open = h("button", "btn btn--small" + (isActive ? "" : " btn--primary"), lx(isActive ? "projectCurrentlyOpen" : "projectOpenBtn"));
    open.type = "button";
    open.setAttribute("data-project-act", "open");
    open.disabled = isActive;
    actionRow.appendChild(open);

    var registry = readRegistry();
    var total = registry ? registry.projects.length : 0;
    var remove = h("button", "btn btn--small btn--danger", lx("projectDeleteBtn"));
    remove.type = "button";
    remove.setAttribute("data-project-act", "delete");
    remove.disabled = total <= 1;
    remove.title = total <= 1 ? lx("projectLastGuard") : lx("projectDeleteBtn");
    actionRow.appendChild(remove);
    actions.appendChild(actionRow);
    if(total <= 1) actions.appendChild(h("p", "set-hint", lx("projectLastGuard")));

    if(projectDeleteConfirm){
      var confirm = h("div", "mini-confirm archive-confirm");
      confirm.setAttribute("role", "alertdialog");
      confirm.appendChild(h("p", "mc-text", lx("projectDeleteTitle")));
      confirm.appendChild(h("p", "mc-sub", project.name + " · " + lx("projectDeleteMsg")));
      var confirmActions = h("div", "mc-actions");
      var delBackup = h("button", "btn btn--small btn--primary", lx("projectDeleteWithBackup"));
      delBackup.type = "button";
      delBackup.setAttribute("data-project-act", "delete-confirm-backup");
      confirmActions.appendChild(delBackup);
      var del = h("button", "btn btn--small btn--danger", lx("projectDeleteNoBackup"));
      del.type = "button";
      del.setAttribute("data-project-act", "delete-confirm");
      confirmActions.appendChild(del);
      var back = h("button", "btn btn--small", t("Vazgeç"));
      back.type = "button";
      back.setAttribute("data-project-act", "delete-cancel");
      confirmActions.appendChild(back);
      confirm.appendChild(confirmActions);
      actions.appendChild(confirm);
    }

    el.appendChild(body);

    var foot = h("div", "tab-picker-foot");
    var closeFoot = h("button", "btn btn--small", t("Kapat"));
    closeFoot.type = "button";
    closeFoot.setAttribute("data-project-act", "close");
    foot.appendChild(closeFoot);
    el.appendChild(foot);

    els.card.appendChild(el);
    el.addEventListener("click", onBodyClick);
    el.addEventListener("input", onBodyInput);
    el.addEventListener("change", onBodyChange);
    el.addEventListener("keydown", function(event){
      if(event.key !== "Enter") return;
      if(event.target && event.target.id === "rl-project-name-input"){
        event.preventDefault();
        saveProjectSettingsName();
      }
    });

    if(projectSettingsCounts === null) refreshProjectSettingsCounts(project.id);
  }

  function openProjectSettingsModal(projectId){
    var project = findProjectRecord(projectId);
    if(!project){
      toast(lx("projectSettingsFailed"), "error");
      return;
    }
    closeImagePreview(false);
    closeTabPicker(false);
    closeOpenSelect();
    projectSettingsId = project.id;
    archiveSelectedProjectId = project.id;
    projectDeleteConfirm = false;
    projectSettingsCounts = null;
    renderProjectSettingsModal();
    renderArchiveProjectTree();
  }

  function saveProjectSettingsName(){
    var projectId = projectSettingsId;
    if(!projectId) return;
    var input = document.getElementById("rl-project-name-input");
    var value = normalizeProjectName(input ? input.value : "");
    if(!value){
      if(input){
        input.classList.add("is-invalid");
        try{ input.focus(); }catch(err){ /* ignore */ }
      }
      toast(lx("projectRequired"), "error");
      return;
    }
    var record = updateProjectRecord(projectId, { name:value, updatedAt:nowISO() });
    if(!record){
      toast(lx("projectRegistryFailed"), "error");
      return;
    }
    if(projectId === activeProjectId && app){
      app.project = record.name;
      saveNow();
      updateMarquee();
      broadcastState();
      if(role === "flyout" && state.section === "list") updateList();
    }
    queueAppProjectCommand("project-rename", projectId, record.name, record.ledgerId);
    if(input) input.classList.remove("is-invalid");
    toast(lx("projectRenamed"));
    projectSettingsCounts = null;
    renderProjectSettingsModal();
    renderArchiveProjectTree();
  }

  function chooseProjectSettingsTarget(){
    var projectId = projectSettingsId;
    if(!projectId) return;
    projectExportPick = projectId;
    if(!openFolderWindow("rl-export-dir")){
      projectExportPick = null;
      toast(lx("pickerUnavailable"), "error");
    }
  }

  async function clearProjectSettingsTarget(){
    var projectId = projectSettingsId;
    if(!projectId) return;
    setProjectExportTarget(projectId, "");
    try{ if(core.storage.deleteSetting) await core.storage.deleteSetting("targetFolder:" + projectId); }catch(err){ /* ignore */ }
    toast(lx("projectTargetCleared"));
    renderProjectSettingsModal();
    renderArchiveProjectTree();
  }

  function openProjectFromSettings(){
    var projectId = projectSettingsId;
    if(!projectId) return;
    if(projectId === activeProjectId) return;
    /* requestProjectOpen closes the modal when it can switch directly; when
       the source project is dirty it keeps the modal open and renders the
       existing Save/Discard/Cancel confirm inside it. */
    requestProjectOpen(projectId);
  }

  function openProjectDeleteConfirm(){
    var projectId = projectSettingsId;
    if(!projectId) return;
    var registry = readRegistry();
    if(!registry || registry.projects.length <= 1){
      toast(lx("projectLastGuard"), "error");
      return;
    }
    projectDeleteConfirm = true;
    renderProjectSettingsModal();
  }

  function deleteProjectFromSettings(keepBackup){
    var projectId = projectSettingsId;
    if(!projectId) return;
    deleteProjectById(projectId).then(function(ok){
      if(!ok) return;
      queueAppProjectCommand("project-delete", projectId, "", "", { keepBackup: keepBackup === true });
      projectDeleteConfirm = false;
      renderArchiveProjectTree();
    }).catch(function(){ /* deleteProjectById reports its own errors */ });
  }

  function handleProjectAction(action, element){
    var projectId = element && element.getAttribute ? element.getAttribute("data-project-id") : null;
    if(action === "new"){ openProjectCreateForm(); return; }
    if(action === "picker"){ openProjectPickerList(); return; }
    if(action === "pick"){ requestProjectOpen(projectId); return; }
    if(action === "settings"){ openProjectSettingsModal(projectId); return; }
    if(action === "close"){ closeProjectSettingsModal(); return; }
    if(action === "rename"){ saveProjectSettingsName(); return; }
    if(action === "choose-target"){ chooseProjectSettingsTarget(); return; }
    if(action === "clear-target"){ clearProjectSettingsTarget(); return; }
    if(action === "open"){ openProjectFromSettings(); return; }
    if(action === "delete"){ openProjectDeleteConfirm(); return; }
    if(action === "delete-confirm"){ deleteProjectFromSettings(false); return; }
    if(action === "delete-confirm-backup"){ deleteProjectFromSettings(true); return; }
    if(action === "delete-cancel"){
      projectDeleteConfirm = false;
      renderProjectSettingsModal();
      return;
    }
    if(action === "switch-save"){ finishProjectSwitch(true); return; }
    if(action === "switch-discard"){ finishProjectSwitch(false); return; }
    if(action === "switch-cancel"){ cancelProjectSwitch(); return; }
    if(action === "create-save"){ finishProjectCreate(true); return; }
    if(action === "create-discard"){ finishProjectCreate(false); return; }
    if(action === "create-cancel"){ cancelProjectCreate(); return; }
  }

  function downloadBlob(blob, filename){
    return new Promise(function(resolve){
      var url = null;
      try{ url = URL.createObjectURL(blob); }catch(err){ resolve(false); return; }
      var revoke = function(){ try{ URL.revokeObjectURL(url); }catch(err){ /* ignore */ } };

      /* Chrome ignores DownloadOptions.filename for blob URLs in recent builds
         (verified 157: the file lands as <uuid>.md). The named anchor keeps the
         export filename and is the documented fallback; the extension API path
         stays for DOM-free contexts. */
      if(anchorDownload(url, filename)){
        setTimeout(revoke, 6000);
        resolve(true);
        return;
      }

      try{
        if(typeof chrome !== "undefined" && chrome.downloads && typeof chrome.downloads.download === "function"){
          chrome.downloads.download({ url:url, filename:filename, saveAs:false }, function(){
            try{ if(chrome.runtime && chrome.runtime.lastError){ /* consumed */ } }catch(err){ /* ignore */ }
            setTimeout(revoke, 15000);
            resolve(true);
          });
          return;
        }
      }catch(err){ /* fall through */ }

      setTimeout(revoke, 6000);
      resolve(false);
    });
  }

  async function markRecordsExported(signature){
    if(!core || !core.storage || !core.storage.listCollection) return;
    var list = [];
    try{ list = await core.storage.listCollection("records"); }catch(err){ return; }
    list = list || [];
    var ledgerId = app ? app.ledgerId : "";
    for(var i = 0; i < list.length; i++){
      var record = list[i];
      if(!record) continue;
      var sameLedger = !!(record.ledgerId && ledgerId && record.ledgerId === ledgerId);
      var sameLegacy = !record.ledgerId && !!signature && record.signature === signature;
      if((sameLedger || sameLegacy) && !record.exported){
        record.exported = true;
        try{ await core.storage.putCollection("records", record); }catch(err){ /* keep exporting */ }
      }
    }
    archiveData.records = list.map(function(item){ return ensureArchiveItem("records", item); });
    sortArchive("records");
    updateArchiveTabCounts();
  }

  async function referencedMediaIds(){
    var ids = {};
    if(!core || !core.storage || !core.storage.listCollection) return ids;
    var kinds = ["records", "drafts", "history"];
    for(var k = 0; k < kinds.length; k++){
      var list = [];
      try{ list = await core.storage.listCollection(kinds[k]); }catch(err){ list = []; }
      (list || []).forEach(function(item){
        (item && Array.isArray(item.requests) ? item.requests : []).forEach(function(req){
          (req.images || []).forEach(function(img){ if(img && img.id) ids[img.id] = true; });
          (req.attachments || []).forEach(function(att){ if(att && att.id) ids[att.id] = true; });
        });
      });
    }
    return ids;
  }

  function clearExportedRequests(){
    exportCleanup = null;
    var imageIds = [];
    var fileIds = [];
    (app.requests || []).forEach(function(req){
      (req.images || []).forEach(function(img){ imageIds.push(img.id); });
      (req.attachments || []).forEach(function(att){ fileIds.push(att.id); });
    });
    app.requests = [];
    /* Phase 2b: clearing the ledger keeps the project and its registry row. */
    app.ledgerId = newLedgerId();
    activeRequestId = null;
    state.highlight = null;
    saveActivePointer(null);
    cancelConfirm = false;
    missingField = null;
    flushSave();
    broadcastState();
    updateDockBadges();
    renderFlyout("list");
    toast(lx("ledgerCleared"));

    referencedMediaIds().then(function(referenced){
      imageIds.forEach(function(id){
        if(referenced[id] || !core.storage.deleteImage) return;
        Promise.resolve().then(function(){ return core.storage.deleteImage(id); }).catch(function(){});
      });
      fileIds.forEach(function(id){
        if(referenced[id] || !core.storage.deleteFile) return;
        Promise.resolve().then(function(){ return core.storage.deleteFile(id); }).catch(function(){});
      });
    }).catch(function(){ /* media cleanup is best-effort */ });
  }

  async function runExport(){
    if(!exportWizard || exportWizard.busy) return;
    var missing = planningValidation();
    if(missing){
      toast(missing, "error");
      syncPlanningUI();
      return;
    }
    if(!core || !core.markdown || !core.zip || !core.storage || !core.util){
      toast(lx("exportFailed"), "error");
      return;
    }

    exportWizard.busy = true;
    var runBtn = document.getElementById("rl-exp-run");
    if(runBtn){
      runBtn.disabled = true;
      runBtn.textContent = lx("preparing");
    }

    var planning = planningPayload();
    var mode = exportWizard.format === "embedded" ? "embedded" : "zip";
    var includeSummary = exportWizard.includeSummary !== false;
    var projectBase = core && core.util && core.util.safeFileBase
      ? core.util.safeFileBase(app && app.project ? app.project : "Projem")
      : "projem";
    var baseName = projectBase + "-" + core.util.formatStamp();
    var markdownName = baseName + ".md";
    var zipName = baseName + ".zip";
    var media = {
      getImageBlob: function(id){
        return Promise.resolve()
          .then(function(){ return core.storage.getImage(id); })
          .then(function(rec){ return rec && rec.blob ? rec.blob : null; })
          .catch(function(){ return null; });
      },
      getFileBlob: function(id){
        return Promise.resolve()
          .then(function(){ return core.storage.getFile(id); })
          .then(function(rec){ return rec && rec.blob ? rec.blob : null; })
          .catch(function(){ return null; });
      }
    };

    try{
      var fileName = markdownName;
      var historyFormat = "md";
      var archiveName = "";

      if(mode === "zip"){
        var mediaFiles = await buildExportMedia(app.requests);
        var hasZip = mediaFiles.length > 0;
        historyFormat = hasZip ? "zip" : "md";
        archiveName = hasZip ? zipName : "";
        var markdown = await core.markdown.build({
          requests: app.requests,
          project: app.project,
          lang: state.lang,
          mode: "zip",
          includeSummary: includeSummary,
          planning: planning,
          archiveName: archiveName,
          agents: app.agents
        });
        await downloadBlob(new Blob([core.util.utf8Bytes(markdown, true)], { type:"text/markdown;charset=utf-8" }), markdownName);
        if(hasZip){
          await downloadBlob(core.zip.create(mediaFiles), zipName);
          fileName = markdownName + " + " + zipName;
        }
      }else{
        var embedded = await core.markdown.build({
          requests: app.requests,
          project: app.project,
          lang: state.lang,
          mode: "embedded",
          includeSummary: includeSummary,
          planning: planning,
          archiveName: "",
          agents: app.agents,
          media: media
        });
        await downloadBlob(new Blob([core.util.utf8Bytes(embedded, true)], { type:"text/markdown;charset=utf-8" }), markdownName);
        historyFormat = "embedded";
        fileName = markdownName;
      }

      var historyMarkdown = await core.markdown.build({
        requests: app.requests,
        project: app.project,
        lang: state.lang,
        mode: "none",
        includeSummary: includeSummary,
        planning: planning,
        archiveName: archiveName,
        agents: app.agents
      });

      var signature = currentSignature();
      var snapshot = app.requests.map(function(req){
        return core.requests && core.requests.serialize ? core.requests.serialize(req) : req;
      });
      var totals = exportTotals();
      var exportedAt = core.util.nowISO();

      await core.storage.addHistory({
        id: "hist_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
        exportedAt: exportedAt,
        project: app.project,
        format: historyFormat,
        fileName: fileName,
        target: t("İndirilenler"),
        requestCount: snapshot.length,
        imageCount: totals.images,
        fileCount: totals.files,
        signature: signature,
        requests: snapshot,
        markdown: historyMarkdown
      });

      app.lastExport = {
        mode: mode,
        includeSummary: includeSummary,
        planning: planning,
        savedAt: exportedAt
      };
      flushSave();
      await markRecordsExported(signature);
      archiveData.loaded = false;
      archiveData.loading = null;
      await loadArchive().catch(function(){});

      exportWizard = null;
      exportCleanup = { fileName: fileName };
      toast(lx("downloaded", { name: fileName }));
      renderFlyout("list");
    }catch(err){
      console.error(err);
      var wasInstant = !!(exportWizard && exportWizard.instant);
      if(exportWizard) exportWizard.busy = false;
      if(wasInstant){
        exportWizard = null;
        resetPlanningState();
        if(role === "flyout" && state.section === "list") renderFlyout("list");
      }
      if(runBtn){
        runBtn.disabled = false;
        runBtn.textContent = t("Dışa Aktar");
      }
      toast(lx("exportFailed"), "error");
      if(!wasInstant) syncPlanningUI();
    }
  }

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
    var ids = ["rl-backup-zip", "rl-backup-restore", "rl-backup-clear", "rl-backup-confirm"];
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
    input.accept = ".zip,application/zip";
    input.hidden = true;
    input.tabIndex = -1;
    block.appendChild(input);

    renderBackupConfirm();
    setBackupBusy(backupBusy);
    if(activeProjectId && !archiveData.loaded) loadArchive().then(function(){ setBackupStatus(backupStatusSummary()); }).catch(function(){});
  }

  async function runBackupDownload(kind){
    if(backupBusy) return;
    if(kind !== "zip") return;
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
      var fileName = projectBase + suffix + core.util.formatStamp() + ".zip";
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
      var blob = core.zip.create(files);
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
      if(!/\.zip$/i.test(file.name || "")) throw new Error("unsupported file type");

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

  /* ============================================================
     WORKSPACE BACKUP v4

     Version 4 backs up the project registry, every project ledger and every
     project-scoped snapshot. Media stays in the ZIP under p-<project id>/.
     Restore validates the whole document before writing anything and still
     accepts v3 (single-ledger) backups.
     ============================================================ */

  function backupProjectFolder(projectId){
    var safe = String(projectId || "proje").replace(/[^A-Za-z0-9_-]/g, "-");
    return "p-" + safe;
  }

  function backupProjectMediaPath(projectId, kind, item){
    return backupProjectFolder(projectId) + "/" + core.util.backupMediaFileName(kind, item);
  }

  function createBackupMediaCollector(){
    var images = [];
    var attachments = [];
    var imageFiles = {};
    var attachmentFiles = {};
    function imageMapper(projectId){
      return function(img){
        var key = projectId + "|" + img.id;
        var file = imageFiles[key];
        if(!file){
          file = backupProjectMediaPath(projectId, "image", img);
          imageFiles[key] = file;
          images.push({ projectId:projectId, file:file, img:img });
        }
        return Object.assign({}, img, { file:file });
      };
    }
    function attachmentMapper(projectId){
      return function(att){
        var key = projectId + "|" + att.id;
        var file = attachmentFiles[key];
        if(!file){
          file = backupProjectMediaPath(projectId, "attachment", att);
          attachmentFiles[key] = file;
          attachments.push({ projectId:projectId, file:file, att:att });
        }
        return Object.assign({}, att, { file:file });
      };
    }
    return {
      images: images,
      attachments: attachments,
      imageMapper: imageMapper,
      attachmentMapper: attachmentMapper
    };
  }

  function stripBackupRequestMedia(req){
    var copy = Object.assign({}, req);
    copy.images = [];
    copy.attachments = [];
    return copy;
  }

  function normalizeBackupAgent(agent){
    agent = agent || {};
    var roles = core && core.constants && core.constants.AGENT_ROLES ? core.constants.AGENT_ROLES : [];
    var role = "general";
    for(var i = 0; i < roles.length; i++) if(roles[i].id === agent.role) role = agent.role;
    return {
      id: String(agent.id || ("agent_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7))),
      name: String(agent.name || "").slice(0, 80),
      role: role,
      mdPath: String(agent.mdPath || agent.mdFile || "").slice(0, 300)
    };
  }

  function currentAppLedgerPayload(){
    return {
      version: 2,
      project: app ? app.project : "",
      projectCreated: true,
      ledgerId: app && app.ledgerId ? app.ledgerId : "",
      updatedAt: app && app.updatedAt ? app.updatedAt : nowISO(),
      requests: app && Array.isArray(app.requests) ? app.requests : [],
      agents: app && Array.isArray(app.agents) ? app.agents : [],
      language: app && app.language === "tr" ? "tr" : "en",
      exportBehavior: app && ["last", "instant"].indexOf(app.exportBehavior) >= 0 ? app.exportBehavior : "default",
      lastExport: app && app.lastExport && typeof app.lastExport === "object" ? app.lastExport : null
    };
  }

  async function buildProjectBackupEntry(project, collector, includeMedia){
    var ledger = project.id === activeProjectId && app
      ? currentAppLedgerPayload()
      : (readProjectLedgerPayload(project.id) || {
        version: 2, project: project.name, projectCreated: true, ledgerId: "",
        updatedAt: project.updatedAt, requests: [], agents: [],
        language: state.lang, exportBehavior: "default", lastExport: null
      });
    var rawRequests = Array.isArray(ledger.requests) ? ledger.requests : [];
    var requests = rawRequests.map(function(raw, index){ return core.requests.normalize(raw, index); });
    var archives = await withProjectScope(project.id, function(){
      return Promise.all([
        core.storage.listCollection("records").catch(function(){ return []; }),
        core.storage.listCollection("drafts").catch(function(){ return []; }),
        core.storage.listHistory().catch(function(){ return []; })
      ]);
    });
    var recordList = archives[0] || [];
    var draftList = archives[1] || [];
    var historyList = archives[2] || [];
    var mapImage = includeMedia ? collector.imageMapper(project.id) : null;
    var mapAttachment = includeMedia ? collector.attachmentMapper(project.id) : null;

    function serializeRequestForBackup(req){
      var item = core.requests.serialize(req, mapImage, mapAttachment);
      return includeMedia ? item : stripBackupRequestMedia(item);
    }
    function serializeSnapshot(snapshot){
      var copy = JSON.parse(JSON.stringify(snapshot || {}));
      delete copy.projectId;
      copy.requests = (Array.isArray(snapshot && snapshot.requests) ? snapshot.requests : []).map(function(raw, index){
        return serializeRequestForBackup(core.requests.normalize(raw, index));
      });
      if(!includeMedia){
        copy.imageCount = 0;
        copy.fileCount = 0;
      }
      return copy;
    }

    return {
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      exportTarget: project.exportTarget || "",
      archiveCollapsed: project.archiveCollapsed === true,
      ledger: {
        version: 2,
        project: project.name,
        projectCreated: true,
        ledgerId: typeof ledger.ledgerId === "string" ? ledger.ledgerId : "",
        updatedAt: typeof ledger.updatedAt === "string" ? ledger.updatedAt : project.updatedAt,
        requests: requests.map(serializeRequestForBackup),
        agents: Array.isArray(ledger.agents) ? ledger.agents.map(normalizeBackupAgent) : [],
        language: ledger.language === "tr" ? "tr" : "en",
        exportBehavior: ["last", "instant"].indexOf(ledger.exportBehavior) >= 0 ? ledger.exportBehavior : "default",
        lastExport: ledger.lastExport && typeof ledger.lastExport === "object" ? ledger.lastExport : null
      },
      records: recordList.map(serializeSnapshot),
      drafts: draftList.map(serializeSnapshot),
      history: historyList.map(serializeSnapshot)
    };
  }

  async function buildBackupV4(includeMedia){
    var registry = readRegistry() || emptyProjectRegistry();
    var collector = createBackupMediaCollector();
    var projects = [];
    for(var i = 0; i < registry.projects.length; i++){
      projects.push(await buildProjectBackupEntry(registry.projects[i], collector, includeMedia));
    }
    return {
      backup: {
        app: "istek-defteri",
        version: 4,
        exportedAt: nowISO(),
        activeId: registry.activeId,
        projects: projects
      },
      images: includeMedia ? collector.images : [],
      attachments: includeMedia ? collector.attachments : []
    };
  }

  function looksLikeZipBytes(bytes){
    return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4B &&
      (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
  }

  async function readBackupDocument(file){
    if(!file) throw new Error("Yedek dosyası yok.");
    var bytes = new Uint8Array(await file.arrayBuffer());
    if(bytes.length > 512 * 1024 * 1024) throw new Error("Yedek dosyası çok büyük.");
    var data = null;
    var entries = null;
    if(looksLikeZipBytes(bytes)){
      entries = await core.zip.parse(bytes);
      if(!entries["yedek.json"]) throw new Error("ZIP içinde yedek.json bulunamadı.");
      data = JSON.parse(new TextDecoder("utf-8").decode(entries["yedek.json"]));
    }else{
      data = JSON.parse(new TextDecoder("utf-8").decode(bytes));
    }
    if(!data || typeof data !== "object") throw new Error("Geçersiz yedek dosyası.");
    if(data.app && data.app !== "istek-defteri") throw new Error("Bu dosya bir Request Ledger yedeği değil.");
    return { data:data, entries:entries };
  }

  function validBackupStamp(value, fallback){
    if(typeof value !== "string" || !value) return fallback;
    var date = new Date(value);
    return isNaN(date.getTime()) ? fallback : value;
  }

  function ensureUniqueRequestIds(requests){
    var seen = {};
    requests.forEach(function(req, index){
      if(!seen[req.id]){
        seen[req.id] = true;
        return;
      }
      var attempt = 1;
      var next = "IST-" + String(index + 1).padStart(3, "0") + "-" + attempt;
      while(seen[next]){
        attempt++;
        next = "IST-" + String(index + 1).padStart(3, "0") + "-" + attempt;
      }
      req.id = next;
      seen[next] = true;
    });
  }

  function validateBackupSnapshotList(list, label, projectIndex){
    if(list == null) return [];
    if(!Array.isArray(list)) throw new Error("Geçersiz yedek: " + label + " listesi okunamadı.");
    if(list.length > 2000) throw new Error("Yedekte çok fazla " + label.toLowerCase() + " var.");
    return list.map(function(raw, itemIndex){
      if(!raw || typeof raw !== "object") throw new Error("Geçersiz yedek: " + label + " kaydı okunamadı.");
      var copy = JSON.parse(JSON.stringify(raw));
      copy.id = String(copy.id || ("restored_" + projectIndex + "_" + itemIndex));
      var requests = Array.isArray(copy.requests) ? copy.requests : [];
      if(requests.length > 5000) throw new Error("Yedekte çok fazla talep var.");
      copy.requests = requests.map(function(item, index){ return core.requests.normalize(item, index); });
      ensureUniqueRequestIds(copy.requests);
      return copy;
    });
  }

  function validateBackupV4(data){
    if(!data || typeof data !== "object") throw new Error("Geçersiz yedek dosyası.");
    if(data.app && data.app !== "istek-defteri") throw new Error("Bu dosya bir Request Ledger yedeği değil.");
    if(Number(data.version) !== 4) throw new Error("Geçersiz yedek sürümü.");
    var list = data.projects;
    if(!Array.isArray(list) || !list.length) throw new Error("Yedekte proje bulunamadı.");
    if(list.length > 200) throw new Error("Yedekte çok fazla proje var.");
    var seen = {};
    var now = nowISO();
    var requestCount = 0;
    var recordCount = 0;
    var draftCount = 0;
    var projects = list.map(function(raw, projectIndex){
      if(!raw || typeof raw !== "object") throw new Error("Geçersiz yedek: proje kaydı okunamadı.");
      var id = typeof raw.id === "string" && /^prj_[A-Za-z0-9_]+$/.test(raw.id) ? raw.id : "";
      if(!id) throw new Error("Geçersiz yedek: proje kimliği okunamadı.");
      if(seen[id]) throw new Error("Geçersiz yedek: proje kimliği tekrar ediyor.");
      seen[id] = true;
      var name = normalizeProjectName(raw.name);
      if(!name) throw new Error("Geçersiz yedek: proje adı boş.");
      var rawLedger = raw.ledger;
      if(!rawLedger || typeof rawLedger !== "object" || !Array.isArray(rawLedger.requests)){
        throw new Error("Geçersiz yedek: " + name + " defteri okunamadı.");
      }
      if(rawLedger.requests.length > 5000) throw new Error("Yedekte çok fazla talep var.");
      var requests = rawLedger.requests.map(function(item, index){ return core.requests.normalize(item, index); });
      ensureUniqueRequestIds(requests);
      if(Array.isArray(rawLedger.agents) && rawLedger.agents.length > 200){
        throw new Error("Yedekte çok fazla ajan var.");
      }
      var createdAt = validBackupStamp(raw.createdAt, now);
      var updatedAt = validBackupStamp(raw.updatedAt, createdAt);
      var records = validateBackupSnapshotList(raw.records, "Kayıt", projectIndex);
      var drafts = validateBackupSnapshotList(raw.drafts, "Taslak", projectIndex);
      var history = validateBackupSnapshotList(raw.history, "Dışa Aktarılan", projectIndex);
      requestCount += requests.length;
      recordCount += records.length;
      draftCount += drafts.length;
      return {
        id: id,
        name: name,
        createdAt: createdAt,
        updatedAt: updatedAt,
        exportTarget: typeof raw.exportTarget === "string" ? raw.exportTarget.slice(0, 120) : "",
        archiveCollapsed: raw.archiveCollapsed === true,
        ledger: {
          version: 2,
          project: name,
          projectCreated: true,
          ledgerId: typeof rawLedger.ledgerId === "string" ? rawLedger.ledgerId : "",
          updatedAt: updatedAt,
          requests: requests,
          agents: Array.isArray(rawLedger.agents) ? rawLedger.agents.map(normalizeBackupAgent) : [],
          language: rawLedger.language === "tr" ? "tr" : "en",
          exportBehavior: ["last", "instant"].indexOf(rawLedger.exportBehavior) >= 0 ? rawLedger.exportBehavior : "default",
          lastExport: rawLedger.lastExport && typeof rawLedger.lastExport === "object" ? rawLedger.lastExport : null
        },
        records: records,
        drafts: drafts,
        history: history
      };
    });
    var activeId = typeof data.activeId === "string" && seen[data.activeId] ? data.activeId : projects[0].id;
    return {
      version: 4,
      projects: projects,
      activeId: activeId,
      requestCount: requestCount,
      recordCount: recordCount,
      draftCount: draftCount
    };
  }

  function validateBackupV3(data){
    if(!data || !Array.isArray(data.requests)){
      throw new Error("Geçersiz yedek dosyası: \"requests\" dizisi bulunamadı.");
    }
    if(Number(data.version) > 3) throw new Error("Yedek daha yeni bir sürümle oluşturulmuş.");
    if(data.requests.length > 5000) throw new Error("Yedekte çok fazla talep var.");
    if(Array.isArray(data.records) && data.records.length > 2000) throw new Error("Yedekte çok fazla kayıt var.");
    if(Array.isArray(data.drafts) && data.drafts.length > 2000) throw new Error("Yedekte çok fazla taslak var.");
    if(Array.isArray(data.agents) && data.agents.length > 200) throw new Error("Yedekte çok fazla ajan var.");
    var requests = data.requests.map(function(raw, index){ return core.requests.normalize(raw, index); });
    ensureUniqueRequestIds(requests);
    var records = Array.isArray(data.records) ? data.records : [];
    var drafts = Array.isArray(data.drafts) ? data.drafts : [];
    return {
      version: 3,
      requests: requests,
      records: records,
      drafts: drafts,
      project: normalizeProjectName(data.project) || importedProjectName(data.language),
      ledgerId: typeof data.ledgerId === "string" ? data.ledgerId : "",
      agents: Array.isArray(data.agents) ? data.agents.map(normalizeBackupAgent) : [],
      language: data.language === "tr" ? "tr" : data.language === "en" ? "en" : null,
      exportBehavior: ["last", "instant", "default"].indexOf(data.exportBehavior) >= 0 ? data.exportBehavior : "default",
      lastExport: data.lastExport && typeof data.lastExport === "object" ? data.lastExport : null,
      requestCount: requests.length,
      recordCount: records.length,
      draftCount: drafts.length
    };
  }

  async function restoreRequestMedia(req, entries, stats, projectId){
    for(var j = 0; j < req.images.length; j++){
      var img = req.images[j];
      var file = img.file || core.util.imageFileName(req, j, img);
      var bytes = entries && entries[file] ? entries[file] : null;
      if(bytes){
        try{
          var type = img.type || "image/webp";
          await core.storage.putImage({ id:img.id, blob:new Blob([bytes], { type:type }), type:type, projectId:projectId });
          stats.restoredImages++;
        }catch(err){
          stats.missingImages++;
        }
      }else{
        stats.missingImages++;
      }
      img.file = "";
    }
    for(var k = 0; k < req.attachments.length; k++){
      var att = req.attachments[k];
      var attFile = att.file || core.util.attachmentFileName(req, k, att);
      var attBytes = entries && entries[attFile] ? entries[attFile] : null;
      if(attBytes){
        try{
          var attType = att.type || "application/octet-stream";
          await core.storage.putFile({ id:att.id, blob:new Blob([attBytes], { type:attType }), type:attType, projectId:projectId });
          stats.restoredFiles++;
        }catch(err){
          stats.missingFiles++;
        }
      }else{
        stats.missingFiles++;
      }
      att.file = "";
    }
  }

  async function prepareRestoredRequests(requests, entries, stats, projectId){
    var out = [];
    for(var index = 0; index < requests.length; index++){
      var req = core.requests.normalize(requests[index], index);
      await restoreRequestMedia(req, entries, stats, projectId);
      if(!core.requests.validate(req)) req.confirmed = false;
      out.push(req);
    }
    return out;
  }

  function recalcSnapshot(snapshot, kind, projectId, requests){
    var item = JSON.parse(JSON.stringify(snapshot || {}));
    if(!item.id){
      item.id = (kind === "record" ? "rec_restored_" : kind === "draft" ? "drf_restored_" : "hist_restored_") + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
    }
    item.kind = kind;
    item.projectId = projectId;
    item.requests = requests;
    item.requestCount = requests.length;
    item.imageCount = requests.reduce(function(sum, req){ return sum + (req.images || []).length; }, 0);
    item.fileCount = requests.reduce(function(sum, req){ return sum + (req.attachments || []).length; }, 0);
    try{ item.signature = core.requests.signature(requests); }catch(err){ /* keep */ }
    item.complete = requests.every(function(req){ return core.requests.status(req) === "ready"; });
    item.exported = Boolean(item.exported);
    return item;
  }

  async function applyRestoreV4(plan, entries){
    var stats = { missingImages:0, missingFiles:0, restoredImages:0, restoredFiles:0 };
    cancelScheduledSave();
    var prepared = [];
    for(var p = 0; p < plan.projects.length; p++){
      var project = plan.projects[p];
      var ledgerRequests = await prepareRestoredRequests(project.ledger.requests, entries, stats, project.id);
      var records = [];
      for(var r = 0; r < project.records.length; r++){
        var recRequests = await prepareRestoredRequests(project.records[r].requests || [], entries, stats, project.id);
        records.push(recalcSnapshot(project.records[r], "record", project.id, recRequests));
      }
      var drafts = [];
      for(var d = 0; d < project.drafts.length; d++){
        var draftRequests = await prepareRestoredRequests(project.drafts[d].requests || [], entries, stats, project.id);
        drafts.push(recalcSnapshot(project.drafts[d], "draft", project.id, draftRequests));
      }
      var history = [];
      for(var h = 0; h < project.history.length; h++){
        var histRequests = Array.isArray(project.history[h].requests)
          ? await prepareRestoredRequests(project.history[h].requests, entries, stats, project.id)
          : [];
        history.push(recalcSnapshot(project.history[h], "history", project.id, histRequests));
      }
      prepared.push({
        project: project,
        ledger: Object.assign({}, project.ledger, { requests: ledgerRequests }),
        records: records,
        drafts: drafts,
        history: history
      });
    }

    /* Commit point: the registry write. Ledgers written before it are rolled
       back when the registry write fails. Nothing is cleared before this. */
    var previousRegistry = readRegistry();
    var previousLedgerRaw = {};
    prepared.forEach(function(item){
      var key = projectLedgerKey(item.project.id);
      try{ previousLedgerRaw[key] = localStorage.getItem(key); }catch(err){ previousLedgerRaw[key] = null; }
    });
    try{
      prepared.forEach(function(item){
        localStorage.setItem(projectLedgerKey(item.project.id), JSON.stringify(item.ledger));
      });
      var registry = { version:1, activeId:plan.activeId, projects:prepared.map(function(item){
        return {
          id: item.project.id,
          name: item.project.name,
          createdAt: item.project.createdAt,
          updatedAt: item.project.updatedAt,
          exportTarget: item.project.exportTarget,
          archiveCollapsed: item.project.archiveCollapsed
        };
      }) };
      if(!writeRegistry(registry)) throw new Error("Proje listesi yazılamadı.");
    }catch(err){
      Object.keys(previousLedgerRaw).forEach(function(key){
        try{
          if(previousLedgerRaw[key] == null) localStorage.removeItem(key);
          else localStorage.setItem(key, previousLedgerRaw[key]);
        }catch(ignore){ /* ignore */ }
      });
      throw err;
    }

    /* After the commit the restored per-project archives replace old rows. */
    for(var s = 0; s < prepared.length; s++){
      var ready = prepared[s];
      await withProjectScope(ready.project.id, async function(){
        try{ await core.storage.clearCollection("records"); }catch(err){}
        try{ await core.storage.clearCollection("drafts"); }catch(err){}
        try{ await core.storage.clearHistory(); }catch(err){}
        for(var ri = 0; ri < ready.records.length; ri++) await core.storage.putCollection("records", ready.records[ri]).catch(function(){});
        for(var di = 0; di < ready.drafts.length; di++) await core.storage.putCollection("drafts", ready.drafts[di]).catch(function(){});
        for(var hj = 0; hj < ready.history.length; hj++){
          try{ await core.storage.addHistory(ready.history[hj]); }catch(err){}
        }
      });
    }

    var kept = {};
    prepared.forEach(function(item){ kept[item.project.id] = true; });
    if(previousRegistry){
      for(var o = 0; o < previousRegistry.projects.length; o++){
        var oldProject = previousRegistry.projects[o];
        if(kept[oldProject.id]) continue;
        await deleteProjectScopedData(oldProject.id).catch(function(){});
      }
    }

    cancelScheduledSave();
    activeProjectId = null;
    app = null;
    projectSettingsId = null;
    projectSettingsCounts = null;
    archiveSelectedProjectId = null;
    projectSwitchPending = null;
    projectCreatePending = null;
    projectFormOpen = false;
    projectDeleteConfirm = false;
    closeProjectSettingsModal();
    if(plan.activeId) openProjectById(plan.activeId);
    return { plan:plan, stats:stats };
  }

  async function applyRestoreV3(plan, entries){
    if(!activeProjectId){
      var createdName = normalizeProjectName(plan.project) || importedProjectName(plan.language);
      var id = newProjectId();
      var stamp = nowISO();
      var registry = readRegistry() || emptyProjectRegistry();
      registry.projects.push({ id:id, name:createdName, createdAt:stamp, updatedAt:stamp, exportTarget:"", archiveCollapsed:false });
      registry.activeId = id;
      if(!writeRegistry(registry)) throw new Error("Proje listesi yazılamadı.");
      try{
        localStorage.setItem(projectLedgerKey(id), JSON.stringify({
          version:2, project:createdName, projectCreated:true, ledgerId:newLedgerId(), updatedAt:stamp,
          requests:[], agents:[], language:state.lang, exportBehavior:"default", lastExport:null
        }));
      }catch(err){ /* the save below retries */ }
      syncStorageScope();
      var created = findProjectRecord(id);
      if(created) loadProjectIntoMemory(id, created);
    }

    var projectId = activeProjectId;
    var project = activeProjectRecord();
    if(!project) throw new Error("Proje bulunamadı.");
    var stats = { missingImages:0, missingFiles:0, restoredImages:0, restoredFiles:0 };
    cancelScheduledSave();
    var requests = await prepareRestoredRequests(plan.requests, entries, stats, projectId);
    var records = [];
    for(var r = 0; r < plan.records.length; r++){
      var recRequests = await prepareRestoredRequests(plan.records[r].requests || [], entries, stats, projectId);
      records.push(recalcSnapshot(plan.records[r], "record", projectId, recRequests));
    }
    var drafts = [];
    for(var d = 0; d < plan.drafts.length; d++){
      var draftRequests = await prepareRestoredRequests(plan.drafts[d].requests || [], entries, stats, projectId);
      drafts.push(recalcSnapshot(plan.drafts[d], "draft", projectId, draftRequests));
    }

    var name = plan.project || project.name;
    var ledger = {
      version: 2,
      project: name,
      projectCreated: true,
      ledgerId: plan.ledgerId || (app && app.ledgerId) || newLedgerId(),
      updatedAt: nowISO(),
      requests: requests.map(function(req){ return core.requests.serialize(req); }),
      agents: plan.agents,
      language: plan.language || (app && app.language) || "en",
      exportBehavior: plan.exportBehavior,
      lastExport: plan.lastExport
    };
    var previousRaw = null;
    try{ previousRaw = localStorage.getItem(projectLedgerKey(projectId)); }catch(err){ previousRaw = null; }
    try{
      localStorage.setItem(projectLedgerKey(projectId), JSON.stringify(ledger));
      var rec = updateProjectRecord(projectId, { name:name, updatedAt:ledger.updatedAt });
      if(!rec) throw new Error("Proje listesi yazılamadı.");
    }catch(err){
      try{
        if(previousRaw == null) localStorage.removeItem(projectLedgerKey(projectId));
        else localStorage.setItem(projectLedgerKey(projectId), previousRaw);
      }catch(ignore){ /* ignore */ }
      throw err;
    }

    await withProjectScope(projectId, async function(){
      try{ await core.storage.clearCollection("records"); }catch(err){}
      try{ await core.storage.clearCollection("drafts"); }catch(err){}
      for(var ri = 0; ri < records.length; ri++) await core.storage.putCollection("records", records[ri]).catch(function(){});
      for(var di = 0; di < drafts.length; di++) await core.storage.putCollection("drafts", drafts[di]).catch(function(){});
    });

    var restored = findProjectRecord(projectId);
    if(restored) openProjectById(projectId);
    return { plan:plan, stats:stats };
  }

  /* ============================================================
     PHASE 7 — SETTINGS / AGENTS / ABOUT / HELP
     ============================================================ */

  var SETTINGS_TABS = [
    { id:"system", label:"tabSystem" },
    { id:"config", label:"tabConfig" },
    { id:"about",  label:"tabAbout" }
  ];
  var SETTINGS_TAB_IDS = {};
  SETTINGS_TABS.forEach(function(tab){ SETTINGS_TAB_IDS[tab.id] = true; });

  var FALLBACK_AGENT_ROLES = [
    { id:"team_leader", label:"Team Leader" },
    { id:"backend",     label:"Backend" },
    { id:"frontend",    label:"Frontend" },
    { id:"qa",          label:"QA Tester" },
    { id:"security",    label:"App. Security" },
    { id:"explorer",    label:"Explorer" },
    { id:"general",     label:"General" }
  ];

  var HELP_STEPS = [
    { title:"helpStep1", text:"helpStep1Text" },
    { title:"helpStep2", text:"helpStep2Text" },
    { title:"helpStep3", text:"helpStep3Text" },
    { title:"helpStep4", text:"helpStep4Text" },
    { title:"helpStep5", text:"helpStep5Text" },
    { title:"helpStep6", text:"helpStep6Text" },
    { title:"helpStep7", text:"helpStep7Text" },
    { title:"helpStep8", text:"helpStep8Text" }
  ];

  var FALLBACK_VERSION = "0.4.0";

  function settingsOptions(){
    return [
      { value:"tr", label:"TR" },
      { value:"en", label:"EN" }
    ];
  }

  /* ---------- shell v7: custom dropdown (hidden native select stays for hooks) ---------- */

  function optionLabel(options, value){
    for(var i = 0; i < options.length; i++){
      if(options[i].value === value) return options[i].label;
    }
    return options.length ? options[0].label : "";
  }

  function syncSelectUI(select){
    if(!select || !select.parentNode) return;
    var wrap = select.parentNode;
    if(!wrap.classList || !wrap.classList.contains("sel")) return;
    var label = wrap.querySelector(".sel-label");
    var option = select.options && select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
    if(label) label.textContent = option ? option.textContent : "";
    var items = wrap.querySelectorAll(".sel-opt");
    for(var i = 0; i < items.length; i++){
      var on = items[i].getAttribute("data-value") === select.value;
      items[i].classList.toggle("is-selected", on);
      items[i].setAttribute("aria-selected", on ? "true" : "false");
    }
  }

  function closeOpenSelect(restoreFocus){
    if(!openSelWrap) return;
    var wrap = openSelWrap;
    openSelWrap = null;
    wrap.classList.remove("is-open");
    var pop = wrap.querySelector(".sel-pop");
    if(pop) pop.hidden = true;
    var btn = wrap.querySelector(".sel-btn");
    if(btn){
      btn.setAttribute("aria-expanded", "false");
      if(restoreFocus) try{ btn.focus(); }catch(err){ /* ignore */ }
    }
    document.removeEventListener("pointerdown", onSelectOutside, true);
  }

  function onSelectOutside(event){
    if(!openSelWrap) return;
    var target = event.target;
    if(target && openSelWrap.contains(target)) return;
    closeOpenSelect();
  }

  function openSelectPop(wrap, edge){
    if(!wrap) return;
    if(openSelWrap && openSelWrap !== wrap) closeOpenSelect();
    var pop = wrap.querySelector(".sel-pop");
    var btn = wrap.querySelector(".sel-btn");
    if(!pop || !btn) return;
    var wasOpen = openSelWrap === wrap;
    openSelWrap = wrap;
    wrap.classList.add("is-open");
    pop.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    if(!wasOpen) document.addEventListener("pointerdown", onSelectOutside, true);
    var items = pop.querySelectorAll(".sel-opt");
    if(!items.length) return;
    var index = 0;
    if(edge === "last") index = items.length - 1;
    else{
      for(var i = 0; i < items.length; i++){
        if(items[i].classList.contains("is-selected")){ index = i; break; }
      }
    }
    try{ items[index].focus(); }catch(err){ /* ignore */ }
  }

  function buildCustomSelect(id, value, options, onChange, opts){
    opts = opts || {};
    var wrap = h("div", "sel" + (opts.className ? " " + opts.className : ""));
    wrap.setAttribute("data-for", id || "");

    var select = document.createElement("select");
    select.className = "fld set-select sel-native" + (opts.selectClass ? " " + opts.selectClass : "");
    if(id) select.id = id;
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");
    options.forEach(function(option){
      var opt = document.createElement("option");
      opt.value = option.value;
      opt.textContent = option.label;
      select.appendChild(opt);
    });
    select.value = value;
    if(opts.attrs){
      for(var key in opts.attrs){
        if(has(opts.attrs, key)) select.setAttribute(key, opts.attrs[key]);
      }
    }
    wrap.appendChild(select);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sel-btn";
    btn.setAttribute("aria-haspopup", "listbox");
    btn.setAttribute("aria-expanded", "false");
    if(opts.label) btn.setAttribute("aria-label", opts.label);
    if(opts.title) btn.title = opts.title;
    btn.appendChild(h("span", "sel-label", optionLabel(options, select.value)));
    var chevron = h("span", "sel-chev");
    chevron.innerHTML = ICONS.chevronDown;
    chevron.setAttribute("aria-hidden", "true");
    btn.appendChild(chevron);
    wrap.appendChild(btn);

    var pop = h("div", "sel-pop");
    pop.hidden = true;
    pop.setAttribute("role", "listbox");
    options.forEach(function(option){
      var item = h("button", "sel-opt" + (option.value === select.value ? " is-selected" : ""), option.label);
      item.type = "button";
      item.setAttribute("role", "option");
      item.setAttribute("data-value", option.value);
      item.setAttribute("aria-selected", option.value === select.value ? "true" : "false");
      item.tabIndex = -1;
      item.addEventListener("click", function(){
        select.value = option.value;
        syncSelectUI(select);
        closeOpenSelect(true);
        try{ select.dispatchEvent(new Event("change", { bubbles:true })); }
        catch(err){
          var legacy = document.createEvent("Event");
          legacy.initEvent("change", true, false);
          select.dispatchEvent(legacy);
        }
      });
      pop.appendChild(item);
    });
    wrap.appendChild(pop);

    btn.addEventListener("click", function(event){
      event.preventDefault();
      event.stopPropagation();
      if(pop.hidden) openSelectPop(wrap, "selected");
      else closeOpenSelect(true);
    });
    btn.addEventListener("keydown", function(event){
      if(event.key === "ArrowDown" || event.key === "ArrowUp"){
        event.preventDefault();
        openSelectPop(wrap, event.key === "ArrowUp" ? "last" : "selected");
      }else if(event.key === "Escape" && !pop.hidden){
        event.preventDefault();
        event.stopPropagation();
        closeOpenSelect(true);
      }
    });
    pop.addEventListener("keydown", function(event){
      var items = pop.querySelectorAll(".sel-opt");
      if(!items.length) return;
      var current = -1;
      for(var i = 0; i < items.length; i++) if(items[i] === document.activeElement) current = i;
      if(event.key === "ArrowDown" || event.key === "ArrowUp"){
        event.preventDefault();
        var next = event.key === "ArrowDown" ? current + 1 : current - 1;
        if(next < 0) next = items.length - 1;
        if(next >= items.length) next = 0;
        try{ items[next].focus(); }catch(err){ /* ignore */ }
      }else if(event.key === "Home" || event.key === "End"){
        event.preventDefault();
        try{ items[event.key === "Home" ? 0 : items.length - 1].focus(); }catch(err){ /* ignore */ }
      }else if(event.key === "Escape"){
        event.preventDefault();
        event.stopPropagation();
        closeOpenSelect(true);
      }else if(event.key === "Tab"){
        closeOpenSelect();
      }
    });

    select.addEventListener("change", function(){
      syncSelectUI(select);
      onChange(select.value);
    });

    return wrap;
  }

  function buildSettingSelect(id, value, options, onChange){
    return buildCustomSelect(id, value, options, onChange, {});
  }

  function settingRow(labelText, control, hintText){
    var row = h("div", "set-row");
    var label = h("label", "set-lbl", labelText);
    var forId = control.id || control.getAttribute("data-for");
    if(forId) label.setAttribute("for", forId);
    row.appendChild(label);
    row.appendChild(control);
    if(hintText) row.appendChild(h("p", "set-hint", hintText));
    return row;
  }

  /* Live bridge status: one compact row plus the first-connect choice. */
  function buildBridgeRow(){
    var row = h("div", "set-row");
    row.appendChild(h("span", "set-lbl", lx("bridgeTitle")));

    var status = h("div", "bridge-status");
    status.id = "rl-bridge-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.appendChild(h("span", "bridge-dot"));
    status.appendChild(h("span", "bridge-text", lx("bridgeOffline")));
    status.lastElementChild.id = "rl-bridge-text";
    row.appendChild(status);

    var confirm = h("div", "bridge-confirm");
    confirm.id = "rl-bridge-confirm";
    confirm.hidden = true;
    confirm.setAttribute("role", "alertdialog");
    confirm.appendChild(h("p", null, lx("bridgeConflictHint")));
    var actions = h("div", "bridge-actions");
    var appBtn = h("button", "btn btn--small btn--primary", lx("bridgeUseApp"));
    appBtn.type = "button";
    appBtn.id = "rl-bridge-use-app";
    appBtn.setAttribute("data-act", "bridge-use-app");
    var extBtn = h("button", "btn btn--small", lx("bridgeUseExtension"));
    extBtn.type = "button";
    extBtn.id = "rl-bridge-use-extension";
    extBtn.setAttribute("data-act", "bridge-use-extension");
    actions.appendChild(appBtn);
    actions.appendChild(extBtn);
    confirm.appendChild(actions);
    row.appendChild(confirm);

    row.appendChild(h("p", "set-hint", lx("bridgeMediaNote")));
    setTimeout(updateBridgeUI, 0);
    return row;
  }

  /* shell v7: editable folder inputs + a picker button */
  function setFolderDir(key, value){
    var dir = String(value == null ? "" : value);
    if(key === "rl-root-dir"){
      folderDirs.root = dir;
    }else{
      folderDirs.export = dir;
      if(activeProjectId) updateProjectRecord(activeProjectId, { exportTarget:dir });
    }
    try{
      if(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local){
        var payload = {};
        payload[key] = dir;
        chrome.storage.local.set(payload);
      }
    }catch(err){ /* ignore */ }
    channelPost({ type:"folders", root:folderDirs.root, export:folderDirs.export });
  }

  function applyPickedFolder(input, key, name){
    if(!input) return;
    name = String(name || "");
    if(!name){ toast(lx("pickerCancelled")); return; }
    input.value = name;
    input.title = name;
    setFolderDir(key, name);
    toast(lx("folderPicked", { name:name }));
  }

  function legacyFolderPicker(input, key){
    /* shell v9 fallback: a webkitdirectory input still selects a folder (the
       browser never uploads the files); only the name is read. */
    var picker = document.createElement("input");
    picker.type = "file";
    picker.setAttribute("webkitdirectory", "");
    picker.setAttribute("directory", "");
    picker.setAttribute("mozdirectory", "");
    picker.multiple = true;
    picker.hidden = true;
    picker.addEventListener("change", function(){
      var files = picker.files;
      var name = "";
      if(files && files.length){
        var rel = files[0].webkitRelativePath || "";
        name = rel ? String(rel).split("/")[0] : String(files[0].name || "");
      }
      if(picker.parentNode) picker.parentNode.removeChild(picker);
      applyPickedFolder(input, key, name);
    });
    document.body.appendChild(picker);
    picker.click();
  }

  function openFolderWindow(key){
    var target = key === "rl-export-dir" ? "export" : "root";
    var url = "";
    try{ url = chrome.runtime.getURL("panel/folder-picker.html?target=" + target); }
    catch(err){ return false; }
    try{
      if(chrome.windows && typeof chrome.windows.create === "function"){
        chrome.windows.create({ url:url, type:"popup", width:430, height:270, focused:true }, function(){
          try{ if(chrome.runtime && chrome.runtime.lastError) throw new Error("window"); }
          catch(err){ try{ chrome.tabs.create({ url:url }); }catch(e){ /* ignore */ } }
        });
        return true;
      }
    }catch(err){ /* fall through */ }
    try{ chrome.tabs.create({ url:url }); return true; }
    catch(err){ return false; }
  }

  function pickFolder(input, key){
    if(!input) return;
    /* shell v11 §10: a cross-origin iframe blocks showDirectoryPicker and
       makes webkitdirectory look like an upload. Use a top-level extension
       window for the real folder picker; fall back only if that is blocked. */
    var blockedFrame = false;
    try{ blockedFrame = window.self !== window.top; }catch(err){ blockedFrame = true; }
    if(blockedFrame && openFolderWindow(key)) return;
    if(!blockedFrame && typeof window.showDirectoryPicker === "function"){
      var pending = null;
      try{
        pending = window.showDirectoryPicker({ mode:"read" });
      }catch(err){
        if(err && err.name === "AbortError") return;
        pending = null;
      }
      if(pending && typeof pending.then === "function"){
        pending.then(function(handle){
          applyPickedFolder(input, key, handle && handle.name ? handle.name : "");
        }).catch(function(err){
          if(err && err.name === "AbortError") return;
          if(!openFolderWindow(key)) legacyFolderPicker(input, key);
        });
        return;
      }
    }
    if(!openFolderWindow(key)) legacyFolderPicker(input, key);
  }

  function folderRow(id, labelText, pickId, key){
    var wrap = h("div", "set-dir-row");
    wrap.setAttribute("data-for", id);
    var input = document.createElement("input");
    input.type = "text";
    input.className = "fld set-dir";
    input.id = id;
    input.value = (key === "rl-root-dir" ? folderDirs.root : folderDirs.export) || lx("browserDownloads");
    input.placeholder = lx("browserDownloads");
    input.title = input.value;
    input.setAttribute("aria-label", labelText);
    input.addEventListener("input", function(){
      input.title = input.value;
      setFolderDir(key, input.value);
    });
    var pick = h("button", "btn btn--small folder-pick", lx("chooseFolder"));
    pick.type = "button";
    pick.id = pickId;
    pick.setAttribute("aria-label", lx("chooseFolder") + " — " + labelText);
    pick.addEventListener("click", function(){ pickFolder(input, key); });
    wrap.appendChild(input);
    wrap.appendChild(pick);
    return settingRow(labelText, wrap);
  }

  function buildSettingsTabs(){
    var wrap = h("div", "settings-tabs");
    wrap.id = "rl-settings-tabs";
    wrap.setAttribute("role", "tablist");
    wrap.setAttribute("aria-label", lx("tabSystem") + " / " + lx("tabConfig") + " / " + lx("tabAbout"));
    SETTINGS_TABS.forEach(function(tab){
      var btn = h("button", "settings-tab" + (tab.id === settingsTab ? " is-active" : ""), lx(tab.label));
      btn.type = "button";
      btn.id = "rl-settings-tab-" + tab.id;
      btn.setAttribute("role", "tab");
      btn.setAttribute("data-settings-tab", tab.id);
      btn.setAttribute("aria-controls", "rl-settings-panel-" + tab.id);
      btn.setAttribute("aria-selected", tab.id === settingsTab ? "true" : "false");
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function applySettingsTab(){
    var tabs = document.querySelectorAll("[data-settings-tab]");
    for(var i = 0; i < tabs.length; i++){
      var id = tabs[i].getAttribute("data-settings-tab");
      var active = id === settingsTab;
      tabs[i].classList.toggle("is-active", active);
      tabs[i].setAttribute("aria-selected", active ? "true" : "false");
    }
    var panels = document.querySelectorAll("[data-settings-panel]");
    for(var j = 0; j < panels.length; j++){
      panels[j].hidden = panels[j].getAttribute("data-settings-panel") !== settingsTab;
    }
  }

  function switchSettingsTab(name){
    if(!SETTINGS_TAB_IDS[name] || name === settingsTab) return;
    if(els.body) settingsScroll[settingsTab] = els.body.scrollTop;
    settingsTab = name;
    applySettingsTab();
    if(els.body) els.body.scrollTop = settingsScroll[settingsTab] || 0;
    updateScrollAffordance();
    reportSize();
  }

  function renderSettings(body){
    body.classList.add("settings-body");
    body.appendChild(buildSettingsTabs());

    var panels = h("div", "settings-panels");
    var mounts = {};
    SETTINGS_TABS.forEach(function(tab){
      var panel = h("section", "settingspanel");
      panel.id = "rl-settings-panel-" + tab.id;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", "rl-settings-tab-" + tab.id);
      panel.setAttribute("data-settings-panel", tab.id);
      panels.appendChild(panel);
      mounts[tab.id] = panel;
    });
    body.appendChild(panels);

    renderSystemPanel(mounts.system);
    renderConfigPanel(mounts.config);
    renderAboutPanel(mounts.about);
    applySettingsTab();
  }

  function renderSystemPanel(panel){
    var block = addBlock(panel, lx("tabSystem"));
    block.appendChild(h("p", "set-hint", lx("systemHint")));

    /* shell v10: the project name is editable and feeds export/backup/record names */
    var project = document.createElement("input");
    project.type = "text";
    project.className = "fld";
    project.id = "rl-set-project";
    project.maxLength = 60;
    project.autocomplete = "off";
    project.value = app && app.project ? app.project : "";
    project.setAttribute("data-setting", "project");
    project.placeholder = lx("projectNamePh");
    project.addEventListener("input", function(){
      if(!app) return;
      var next = project.value.slice(0, 60);
      app.project = next;
      markDirty(420);
    });
    project.addEventListener("change", function(){
      if(!app) return;
      var value = String(project.value || "").trim().slice(0, 60);
      app.project = value;
      project.value = value;
      markDirty(0);
    });
    block.appendChild(settingRow(t("Proje adı"), project, lx("projectHint")));

    var lang = buildSettingSelect("rl-set-lang", state.lang, settingsOptions(), function(value){
      setLanguage(value === "en" ? "en" : "tr");
    });
    block.appendChild(settingRow(t("Dil"), lang));

    var theme = buildSettingSelect("rl-set-theme", state.themePref, [
      { value:"light",  label:lx("themeLight") },
      { value:"dark",   label:lx("themeDark") },
      { value:"system", label:lx("themeSystem") }
    ], function(value){
      setTheme(value);
    });
    block.appendChild(settingRow(lx("themeTitle"), theme));

    /* shell v9: left/right placement, persisted as rl-side */
    var side = buildSettingSelect("rl-set-side", state.side, [
      { value:"right", label:lx("sideRight") },
      { value:"left",  label:lx("sideLeft") }
    ], function(value){
      setPanelSide(value);
    });
    block.appendChild(settingRow(lx("sideLabel"), side, lx("sideHint")));

    var behavior = buildSettingSelect("rl-set-export-behavior", app && app.exportBehavior ? app.exportBehavior : "default", [
      { value:"default", label:lx("behaviorDefault") },
      { value:"last",    label:lx("behaviorLast") },
      { value:"instant", label:lx("behaviorInstant") }
    ], function(value){
      if(!app) return;
      app.exportBehavior = ["last","instant"].indexOf(value) >= 0 ? value : "default";
      markDirty(0);
    });
    block.appendChild(settingRow(lx("behaviorTitle"), behavior, lx("behaviorHint")));

    block.appendChild(folderRow("rl-set-root", lx("rootDir"), "rl-root-pick", "rl-root-dir"));
    block.appendChild(folderRow("rl-set-export-dir", lx("exportDir"), "rl-export-pick", "rl-export-dir"));
    block.appendChild(h("p", "set-hint", lx("folderNote")));
    block.appendChild(buildBridgeRow());

    var reset = h("button", "btn", lx("resetSettings"));
    reset.type = "button";
    reset.id = "rl-reset-settings";
    reset.setAttribute("data-act", "settings-reset");
    var resetWrap = h("div", "set-reset");
    resetWrap.appendChild(reset);
    resetWrap.appendChild(h("p", "set-hint", lx("resetHint")));
    block.appendChild(resetWrap);
  }

  function currentAgents(){
    if(!app) return [];
    if(!Array.isArray(app.agents)) app.agents = [];
    return app.agents;
  }

  function agentRoleOptions(){
    var roles = core && core.constants && core.constants.AGENT_ROLES;
    return Array.isArray(roles) && roles.length ? roles : FALLBACK_AGENT_ROLES;
  }

  function agentRoleValid(id){
    var roles = agentRoleOptions();
    for(var i = 0; i < roles.length; i++) if(roles[i].id === id) return true;
    return false;
  }

  function findAgent(id){
    var agents = currentAgents();
    for(var i = 0; i < agents.length; i++) if(agents[i].id === id) return agents[i];
    return null;
  }

  function makeAgentId(){
    return "agent_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  }

  function firstUnusedAgentRole(){
    var used = {};
    currentAgents().forEach(function(agent){ if(agent && agent.role) used[agent.role] = true; });
    var roles = agentRoleOptions();
    for(var i = 0; i < roles.length; i++) if(!used[roles[i].id]) return roles[i].id;
    return "general";
  }

  function renderConfigPanel(panel){
    var block = addBlock(panel, t("Ajanlar"));
    block.appendChild(h("p", "set-hint", lx("agentsHint")));

    var list = h("div", "agentlist");
    list.id = "rl-agents";
    block.appendChild(list);

    var empty = h("div", "agentempty");
    empty.id = "rl-agents-empty";
    empty.appendChild(h("b", null, lx("agentEmptyTitle")));
    empty.appendChild(h("span", null, lx("agentEmptySub")));
    block.appendChild(empty);

    var add = h("button", "btn btn--small", lx("addAgent"));
    add.type = "button";
    add.id = "rl-agent-add";
    add.setAttribute("data-act", "agent-add");
    block.appendChild(add);

    renderAgentRows();
  }

  function renderAgentRows(){
    var list = document.getElementById("rl-agents");
    if(!list) return;
    list.textContent = "";
    var agents = currentAgents();
    agents.forEach(function(agent, index){
      list.appendChild(buildAgentRow(agent, index, agents.length));
    });
    var empty = document.getElementById("rl-agents-empty");
    if(empty) empty.hidden = agents.length > 0;
  }

  function buildAgentRow(agent, index, total){
    var row = h("div", "agent-row");
    row.setAttribute("data-agent-id", agent.id);

    /* mirrors the name into the row text so list readers see it (inputs expose no text) */
    var signature = h("span", null, agent.name || "");
    signature.hidden = true;
    signature.setAttribute("aria-hidden", "true");
    row.appendChild(signature);

    var top = h("div", "agent-row-top");

    var roleOptions = agentRoleOptions().map(function(option){
      return { value:option.id, label:option.label };
    });
    var roleWrap = buildCustomSelect("", agentRoleValid(agent.role) ? agent.role : "general", roleOptions, function(value){
      setAgentField(agent.id, "role", value);
      row.classList.remove("is-invalid");
    }, {
      className:"agent-role-sel",
      selectClass:"agent-role",
      label:lx("agentRole"),
      title:lx("agentRole"),
      attrs:{
        "data-agent-field":"role",
        "aria-label":lx("agentRole"),
        "title":lx("agentRole")
      }
    });
    top.appendChild(roleWrap);

    var name = document.createElement("input");
    name.type = "text";
    name.className = "fld agent-name";
    name.maxLength = 80;
    name.value = agent.name || "";
    name.placeholder = lx("agentNamePh");
    name.setAttribute("data-agent-field", "name");
    name.setAttribute("aria-label", optionalLabel(lx("agentName")));
    name.addEventListener("input", function(){
      setAgentField(agent.id, "name", name.value);
      signature.textContent = name.value;
    });
    top.appendChild(name);

    var remove = h("button", "agent-remove", "×");
    remove.type = "button";
    remove.setAttribute("data-act", "agent-remove");
    remove.setAttribute("data-agent-remove", agent.id);
    remove.setAttribute("aria-label", lx("removeAgent"));
    remove.title = lx("removeAgent");
    if(index === total - 1) remove.id = "rl-agent-remove";
    top.appendChild(remove);

    row.appendChild(top);

    var pathRow = h("div", "agent-path-row");
    var path = document.createElement("input");
    path.type = "text";
    path.className = "fld agent-path";
    path.maxLength = 300;
    path.value = agent.mdPath || "";
    path.placeholder = lx("agentPathPh");
    path.setAttribute("data-agent-field", "mdPath");
    path.setAttribute("aria-label", optionalLabel(lx("agentPath")));
    path.addEventListener("input", function(){ setAgentField(agent.id, "mdPath", path.value); });
    pathRow.appendChild(path);

    var pickMd = h("button", "btn btn--small agent-md-pick", lx("chooseFile"));
    pickMd.type = "button";
    pickMd.setAttribute("data-agent-md", agent.id);
    pickMd.setAttribute("aria-label", lx("agentMd"));
    pickMd.title = lx("agentMd");
    if(index === total - 1) pickMd.id = "rl-agent-md-pick";
    var fileMd = document.createElement("input");
    fileMd.type = "file";
    fileMd.accept = ".md,.markdown,text/markdown";
    fileMd.className = "hidden-input";
    fileMd.setAttribute("data-agent-md-input", agent.id);
    if(index === total - 1) fileMd.id = "rl-agent-md-input";
    fileMd.addEventListener("change", function(){
      var picked = null;
      try{ picked = fileMd.files && fileMd.files.length ? fileMd.files[0] : null; }catch(err){ picked = null; }
      try{ fileMd.value = ""; }catch(err){ /* allow re-picking */ }
      if(!picked) return;
      path.value = picked.name;
      setAgentField(agent.id, "mdPath", picked.name);
    });
    pickMd.addEventListener("click", function(){
      try{ fileMd.click(); }catch(err){ /* ignore */ }
    });
    pathRow.appendChild(pickMd);
    pathRow.appendChild(fileMd);
    row.appendChild(pathRow);

    return row;
  }

  function setAgentField(id, field, value){
    var agent = findAgent(id);
    if(!agent) return;
    if(field === "role"){
      agent.role = agentRoleValid(value) ? value : "general";
    }else if(field === "name"){
      agent.name = String(value == null ? "" : value).slice(0, 80);
    }else if(field === "mdPath"){
      agent.mdPath = String(value == null ? "" : value).slice(0, 300);
    }else{
      return;
    }
    markDirty(field === "role" ? 0 : 320);
  }

  function addAgent(){
    if(!app) app = defaultApp();
    var keepTab = settingsTab;
    var keepScroll = els.body ? els.body.scrollTop : 0;
    var agent = { id:makeAgentId(), name:"", role:firstUnusedAgentRole(), mdPath:"" };
    currentAgents().push(agent);
    markDirty(0);
    renderAgentRows();
    var rows = document.querySelectorAll("#rl-agents [data-agent-id]");
    var last = rows.length ? rows[rows.length - 1] : null;
    var input = last ? last.querySelector('[data-agent-field="name"]') : null;
    if(input) try{ input.focus(); }catch(err){ /* ignore */ }
    if(state.section === "settings"){
      settingsTab = keepTab;
      applySettingsTab();
      if(els.body) els.body.scrollTop = keepScroll;
    }
    updateScrollAffordance();
  }

  function removeAgent(id){
    if(!app || !id) return;
    var keepTab = settingsTab;
    var keepScroll = els.body ? els.body.scrollTop : 0;
    app.agents = currentAgents().filter(function(agent){ return agent.id !== id; });
    planAgents = planAgents.filter(function(agentId){ return agentId !== id; });
    markDirty(0);
    renderAgentRows();
    if(state.section === "settings"){
      settingsTab = keepTab;
      applySettingsTab();
      if(els.body) els.body.scrollTop = keepScroll;
    }
    updateScrollAffordance();
  }

  function validateAgents(){
    var ok = true;
    currentAgents().forEach(function(agent){
      if(!agentRoleValid(agent.role)){ agent.role = "general"; ok = false; }
      agent.name = String(agent.name || "").trim().slice(0, 80);
      agent.mdPath = String(agent.mdPath || "").trim().slice(0, 300);
    });
    return ok;
  }

  function appVersion(){
    try{
      if(typeof chrome !== "undefined" && chrome.runtime && typeof chrome.runtime.getManifest === "function"){
        var manifest = chrome.runtime.getManifest();
        if(manifest && manifest.version) return String(manifest.version);
      }
    }catch(err){ /* fall back */ }
    return FALLBACK_VERSION;
  }

  function aboutRow(dl, labelText, value){
    var row = document.createElement("div");
    row.appendChild(h("dt", null, labelText));
    var dd = document.createElement("dd");
    if(value && value.nodeType) dd.appendChild(value);
    else dd.textContent = value == null ? "" : String(value);
    row.appendChild(dd);
    dl.appendChild(row);
    return dd;
  }

  function aboutLink(href, text, external){
    var link = document.createElement("a");
    link.href = href;
    link.textContent = text;
    if(external){
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    return link;
  }

  function renderAboutPanel(panel){
    var card = h("section", "aboutcard");

    var brand = h("div", "aboutbrand");
    var mark = h("span", "aboutmark");
    mark.innerHTML = ICONS.mark;
    mark.setAttribute("aria-hidden", "true");
    var brandText = h("div", "aboutbrand-text");
    brandText.appendChild(h("h3", null, t("İstek Defteri")));
    brandText.appendChild(h("p", null, lx("aboutDesc")));
    brand.appendChild(mark);
    brand.appendChild(brandText);
    card.appendChild(brand);

    var meta = document.createElement("dl");
    meta.className = "aboutmeta";
    aboutRow(meta, lx("developer"), "Taner ÜNER");

    var version = h("span", "about-version", appVersion());
    version.id = "rl-about-version";
    aboutRow(meta, t("Sürüm"), version);

    aboutRow(meta, lx("repoLabel"), aboutLink(
      "https://github.com/TanerUNER/request-ledger",
      "github.com/TanerUNER/request-ledger",
      true
    ));
    aboutRow(meta, lx("contactLabel"), aboutLink("mailto:mail.taneruner@gmail.com", "mail.taneruner@gmail.com", false));
    aboutRow(meta, lx("supportLabel"), aboutLink("https://www.buymeacoffee.com/tnruner", "buymeacoffee.com/tnruner", true));
    card.appendChild(meta);
    panel.appendChild(card);

    var block = addBlock(panel, lx("changelogTitle"));
    var changelog = h("div", "changelog");
    changelog.id = "rl-changelog";
    block.appendChild(changelog);
    renderChangelog();
  }

  function changelogEntries(){
    var list = core && core.constants && core.constants.CHANGELOG;
    /* shell v11 §3: only the five newest versions are shown */
    return Array.isArray(list) ? list.slice(0, 5) : [];
  }

  function renderChangelog(){
    var host = document.getElementById("rl-changelog");
    if(!host) return;
    host.textContent = "";

    var entries = changelogEntries();
    if(!entries.length){
      host.appendChild(h("p", "set-hint", lx("changelogEmpty")));
      return;
    }

    var groups = [
      { key:"features", label:lx("groupFeatures") },
      { key:"updates",  label:lx("groupUpdates") },
      { key:"fixes",    label:lx("groupFixes") }
    ];

    entries.forEach(function(entry){
      var version = String(entry.version || "");
      var open = !!settingsChangelogOpen[version];
      var card = h("section", "changelog-entry");
      card.setAttribute("data-changelog-entry", version);
      card.setAttribute("data-changelog-version", version);

      var head = h("button", "changelog-head");
      head.type = "button";
      head.setAttribute("data-changelog-toggle", version);
      head.setAttribute("aria-expanded", open ? "true" : "false");
      var areaLabel = entry.area === "web" ? lx("areaWeb") : lx("areaExtension");
      head.appendChild(h("b", "changelog-version", "v" + version + " (" + areaLabel + ")"));
      head.appendChild(h("span", "changelog-date", entry.date || ""));
      head.appendChild(h("span", "changelog-caret", open ? "▴" : "▾"));
      card.appendChild(head);

      var body = h("div", "changelog-body");
      body.hidden = !open;
      var data = (state.lang === "en" ? entry.en : entry.tr) || {};
      groups.forEach(function(group){
        var items = data[group.key] || [];
        if(!items.length) return;
        body.appendChild(h("h5", "changelog-group", group.label));
        var list = h("ul", "changelog-list");
        items.forEach(function(text){ list.appendChild(h("li", null, text)); });
        body.appendChild(list);
      });
      card.appendChild(body);
      host.appendChild(card);
    });
  }

  function toggleChangelog(version){
    if(!version) return;
    var card = document.querySelector('[data-changelog-entry="' + version + '"]');
    if(!card) return;
    var body = card.querySelector(".changelog-body");
    var head = card.querySelector("[data-changelog-toggle]");
    var caret = card.querySelector(".changelog-caret");
    var open = !settingsChangelogOpen[version];
    settingsChangelogOpen[version] = open;
    if(head) head.setAttribute("aria-expanded", open ? "true" : "false");
    if(caret) caret.textContent = open ? "▴" : "▾";
    if(!body) return;

    if(open){
      /* shell v10: expand eases open */
      body.hidden = false;
      body.classList.add("is-animating");
      body.style.maxHeight = "0px";
      body.style.opacity = "0";
      var target = body.scrollHeight;
      requestAnimationFrame(function(){
        body.style.maxHeight = target + "px";
        body.style.opacity = "1";
      });
      setTimeout(function(){
        if(!settingsChangelogOpen[version]) return;
        body.style.maxHeight = "none";
        body.style.opacity = "";
        body.classList.remove("is-animating");
        updateScrollAffordance();
        reportSize();
      }, 300);
    }else{
      /* shell v10: closing is instant */
      body.classList.remove("is-animating");
      body.style.maxHeight = "";
      body.style.opacity = "";
      body.hidden = true;
    }
    updateScrollAffordance();
    reportSize();
  }

  function renderHelp(body){
    body.classList.add("help-body");

    var block = addBlock(body, lx("helpHeading"));
    var steps = h("div", "helpsteps");
    steps.id = "rl-help-steps";
    HELP_STEPS.forEach(function(step, index){
      var item = h("div", "helpstep");
      item.setAttribute("data-help-step", String(index + 1));
      item.appendChild(h("b", null, String(index + 1) + ". " + lx(step.title)));
      item.appendChild(h("span", null, lx(step.text)));
      steps.appendChild(item);
    });
    block.appendChild(steps);

    var note = h("div", "helpnote");
    note.appendChild(h("span", "helpnote-ic", "!"));
    note.appendChild(h("span", null, lx("helpNote")));
    block.appendChild(note);
  }

  function resetSystemSettings(){
    if(!app) return;
    app.exportBehavior = "default";
    app.language = "en";
    setLanguage("en");
    setTheme("system");
    try{
      if(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local){
        chrome.storage.local.set({ "rl-lang": "en" });
      }
    }catch(err){ /* ignore */ }
    validateAgents();
    markDirty(0);
    if(role === "flyout" && state.section === "settings") renderFlyout("settings");
    toast(lx("settingsReset"));
  }

  function renderPlaceholder(body, section){
    var sentence = PLACEHOLDERS[section] || PLACEHOLDERS.help;
    var block = h("div", "ph-block");
    block.appendChild(h("p", "ph-text", t(state.lang === "en" ? sentence.en : sentence.tr)));
    var soon = h("button", "soon", lx("comingSoon"));
    soon.type = "button";
    soon.disabled = true;
    block.appendChild(soon);
    body.appendChild(block);
  }

  /* ---------- footer ---------- */

  function footState(hintText, noSave){
    els.foot.textContent = "";
    els.foot.appendChild(h("span", "hint", hintText));
    if(noSave) return;
    var save = h("span", "savestate", saveText());
    save.id = "rl-save-state";
    save.setAttribute("data-state", state.saving);
    if(state.saving === "saved" && (!lastSavedAt || Date.now() - lastSavedAt >= 3000)) save.classList.add("is-faded");
    els.foot.appendChild(save);
  }

  function footButton(label, cls, act, id, disabled){
    var btn = h("button", "btn" + (cls ? " " + cls : ""), label);
    btn.type = "button";
    if(act) btn.setAttribute("data-act", act);
    if(id) btn.id = id;
    if(disabled) btn.disabled = true;
    els.foot.appendChild(btn);
    return btn;
  }

  function draftHasPage(type){
    var tpl = templateFor(type || draftType);
    return !!(tpl.page || tpl.location);
  }

  function stepLabel(section){
    if(section === "new") return draftHasPage(draftType) ? "1 / 3" : "1 / 2";
    if(section === "page") return "2 / 3";
    if(section === "desc"){
      var req = activeRequest();
      return draftHasPage(req ? req.type : draftType) ? "3 / 3" : "2 / 2";
    }
    return "";
  }

  function primaryActionButton(kind, id){
    var req = activeRequest();
    if(isLocked(req)){
      footButton(lx("unlock"), "btn--primary", "unlock", id || "rl-unlock", false);
      return;
    }
    /* wizard steps: Page advances, final Desc saves */
    if(pendingRequest){
      var label = kind === "page" ? lx("nextStep") : t("Kaydet");
      footButton(label, "btn--primary", "save-section", id, false);
      return;
    }
    /* editing an existing request: the footer is the ready toggle */
    footButton(t("Hazır"), "btn--primary", "ready", id, false);
  }

  function renderFoot(section){
    if(els.foot) els.foot.classList.remove("has-export-steps");
    if(section === "new"){
      footState(stepLabel("new"));
      footButton(t("Vazgeç"), null, "close-section", "rl-cancel", false);
      footButton(lx("create"), "btn--primary", "create", "rl-create", !draftTitle.trim());
      return;
    }
    if(section === "project"){
      footState("", true);
      if(projectFormVisible()){
        footButton(lx("create"), "btn--primary", "save-project", "rl-project-create", false);
      }
      return;
    }
    if(section === "detail"){
      footState("");
      footButton(t("Sil"), "btn--danger btn--foot-delete", "delete", "rl-detail-delete", false);
      footButton(t("Kapat"), null, "close-section", "rl-detail-close", false);
      primaryActionButton("detail", "rl-detail-ready");
      return;
    }
    if(section === "page"){
      footState(stepLabel("page"));
      footButton(t("Vazgeç"), null, "close-section", null, false);
      primaryActionButton("page", null);
      return;
    }
    if(section === "desc"){
      footState(stepLabel("desc"));
      footButton(t("Vazgeç"), null, "close-section", null, false);
      primaryActionButton("desc", null);
      return;
    }
    if(section === "list"){
      /* shell v7: no "Kaydedildi" caption in the list footer; the save button
         itself flashes the confirmation for 3s */
      if(exportWizard){
        if(exportWizard.step === 1){
          footState("", true);
          footButton(t("Vazgeç"), null, "exp-cancel", "rl-exp-cancel", false);
          footButton(lx("nextStep"), "btn--primary", "exp-next", "rl-exp-next", exportBlocked());
        }else{
          footState("", true);
          /* shell v11 §12: previous step sits at the bottom-left, orange */
          var prev = footButton(lx("prevStep"), "btn--stage-back", "exp-back", "rl-exp-back", false);
          var prevIc = h("span", "btn-ic");
          prevIc.setAttribute("aria-hidden", "true");
          prevIc.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>';
          prev.insertBefore(prevIc, prev.firstChild);
          footButton(t("Vazgeç"), null, "exp-cancel", "rl-exp-cancel", false);
          footButton(exportWizard.busy ? lx("preparing") : t("Dışa Aktar"), "btn--primary", "exp-run", "rl-exp-run", exportWizard.busy || Boolean(planningValidation()));
        }
        /* shell v10: the step labels live in the bottom row, below the buttons */
        els.foot.classList.add("has-export-steps");
        els.foot.appendChild(buildExportStepRow());
        return;
      }
      footState("", true);
      footButton(lx("saveList"), "btn--primary", "save-record", "rl-save-record", !app || !app.requests.length);
      var exportOpen = footButton(t("Dışa Aktar"), "btn--with-icon", "exp-open", "rl-export-open", false);
      var exportIcon = h("span", "btn-ic");
      exportIcon.setAttribute("aria-hidden", "true");
      exportIcon.innerHTML = ICONS.export;
      exportOpen.insertBefore(exportIcon, exportOpen.firstChild);
      return;
    }
    if(section === "export"){
      footState("");
      footButton(t("Kapat"), null, "close-section", null, false);
      return;
    }
    footState("");
    footButton(t("Kapat"), null, "close-section", null, false);
  }

  /* ---------- flyout actions ---------- */

  function discardPending(){
    var req = pendingRequest;
    if(!req) return;
    pendingRequest = null;
    cancelConfirm = false;
    missingField = null;
    composeDirty = false;
    /* only the pending draft's own media is discarded: it never reached the
       list, so no snapshot can reference those blobs. Sweep once more after
       any in-flight image compression has drained. */
    deleteMediaFor(req);
    imageQueue.then(function(){
      return deleteMediaFor(req);
    }).catch(function(){ /* best effort */ });
    broadcastState();
  }

  function commitPending(){
    var req = pendingRequest;
    if(!req || !app) return null;
    pendingRequest = null;
    app.requests.push(req);
    activeRequestId = req.id;
    saveActivePointer(req.id);
    state.highlight = req.id;
    cancelConfirm = false;
    missingField = null;
    composeDirty = false;
    if(!flushSave()){
      /* keep the draft in memory if storage refused the write */
      if(core && core.requests && core.requests.remove) core.requests.remove(app.requests, req.id);
      else{
        var index = app.requests.indexOf(req);
        if(index >= 0) app.requests.splice(index, 1);
      }
      activeRequestId = null;
      saveActivePointer(null);
      pendingRequest = req;
      toast(lx("storageWriteFailed"), "error");
      return null;
    }
    broadcastState();
    return req;
  }

  function createRequest(){
    if(!app || !core || !core.requests) return;
    if(storageBlocked()){
      toast(lx("storageUnavailable"), "error");
      return;
    }
    var input = document.getElementById("rl-new-title");
    var title = (input ? input.value : draftTitle || "").trim();
    if(!title){
      if(input) try{ input.focus(); }catch(err){ /* ignore */ }
      return;
    }
    /* never stack two wizard drafts */
    if(pendingRequest) discardPending();
    var req = core.requests.create(app.requests, draftType);
    core.requests.update(req, { title:title, priority:draftPriority });

    /* shell v10 §9: the draft stays in memory until the final Desc "Kaydet" */
    pendingRequest = req;
    activeRequestId = null;
    state.highlight = null;
    cancelConfirm = false;
    missingField = null;
    composeDirty = false;

    draftTitle = "";
    draftType = "update";
    draftPriority = "normal";

    broadcastState();

    /* shell v10 §7: types without page/location go title → Desc directly */
    var tpl = templateFor(req.type);
    var next = (tpl.page || tpl.location) ? "page" : "desc";
    sendAction("compose", { requestId:req.id, section:next });
    if(!hasHost) showSection(next);
  }

  function selectRequest(id){
    var req = requestById(id);
    if(!req) return;
    if(pendingRequest) discardPending();
    activeRequestId = id;
    saveActivePointer(id);
    state.highlight = id;
    cancelConfirm = false;
    missingField = null;
    composeDirty = false;

    broadcastState();
    sendAction("compose", { requestId:id, section:"detail" });
    if(!hasHost) showSection("detail");
  }

  function handleReady(){
    var req = activeRequest();
    if(!req) return;

    /* shell v10: an explicit "Hazır" while the wizard draft is still pending
       commits it first — but only once its fields pass the normal ready
       validation, so an incomplete draft never enters the list. */
    var missing = core && core.requests && core.requests.missing ? core.requests.missing(req) : [];
    if(pendingRequest && !missing.length){
      req = commitPending();
      if(!req) return;
    }
    if(missing.length){
      missingField = missing[0].key;
      if(state.section === "detail"){
        /* shell v6: the combined section owns every required field */
        renderFlyout("detail");
        var focusSel = missingField === "title" ? "#rl-title-input" : "#rl-desc-input";
        setTimeout(function(){
          var input = document.querySelector(focusSel);
          if(input && !input.disabled){
            try{ input.focus(); }catch(err){ /* ignore */ }
          }
        }, 40);
        toast(t("Başlık ve açıklama zorunludur."), "error");
        return;
      }
      var section = missingField === "description" ? "desc" : "page";
      if(section === "page" && !templateFor(req.type).page) section = "desc";
      if(state.section === section){
        renderFlyout(section);
      }else{
        sendAction("goto", { section:section, focus:"#rl-desc-input" });
      }
      toast(t("Başlık ve açıklama zorunludur."), "error");
      return;
    }

    missingField = null;
    cancelConfirm = false;
    core.requests.update(req, { confirmed:true });
    state.highlight = req.id;
    activeRequestId = null;
    saveActivePointer(null);
    composeDirty = false;
    var saved = flushSave();
    broadcastState();
    if(saved) toast(t("Kaydedildi"));
    /* v12: after ready, show every request again (filters/archive tab may
       have been left on an empty view). */
    listFilter = { q:"", type:"all", status:"all" };
    archiveTab = "list";
    openRowMenuId = null;
    listDeleteId = null;
    sendAction("idle", { openList:true, highlightId:req.id });
  }

  function handleCancel(){
    var req = activeRequest();
    if(!req){
      sendAction("idle", { close:true });
      return;
    }

    /* shell v10 §9: "Vazgeç" discards the pending draft and its media; it was
       never in the list, so no confirmation/save-as-draft step applies. */
    if(pendingRequest){
      discardPending();
      sendAction("idle", { close:true });
      return;
    }

    if(!hasContent(req)){
      deleteMediaFor(req).then(function(){
        removeActiveRequest(req, false);
        toast(t("İstek silindi."));
        sendAction("idle", { close:true });
      });
      return;
    }

    cancelConfirm = true;
    if(state.section === "page" || state.section === "desc" || state.section === "detail"){
      renderFlyout(state.section);
    }else{
      sendAction("goto", { section:"desc" });
    }
  }

  function unlockRequest(){
    var req = activeRequest();
    if(!req) return;
    core.requests.update(req, { confirmed:false });
    missingField = null;
    cancelConfirm = false;
    markDirty(0);
    toast(lx("revoked"));
    renderFlyout(state.section || "desc");
  }

  function saveSection(){
    /* shell v10 §8/§9: while the wizard draft is pending, Page is only a
       step transition (no save/toast) and the final Desc "Kaydet" commits the
       in-memory request, then opens the combined detail view. */
    if(pendingRequest){
      if(state.section === "page"){
        sendAction("goto", { section:"desc" });
        if(!hasHost) showSection("desc");
        return;
      }
      var created = commitPending();
      if(!created) return;
      toast(t("Kaydedildi"));
      sendAction("goto", { section:"detail" });
      if(!hasHost) showSection("detail");
      return;
    }

    if(!flushSave()){
      toast(lx("storageWriteFailed"), "error");
      return;
    }
    composeDirty = false;
    /* shell v8: saving Page keeps the flyout open and moves straight to
       Description; shell v10: the transition itself never toasts. */
    if(role === "flyout" && state.section === "page"){
      sendAction("goto", { section:"desc" });
      if(!hasHost) showSection("desc");
      return;
    }
    toast(t("Kaydedildi"));
    requestClose();
  }

  function mediaReferencedElsewhere(mediaId, exceptRequestId){
    return (app && Array.isArray(app.requests) ? app.requests : []).some(function(item){
      if(!item || item.id === exceptRequestId) return false;
      return (item.images || []).some(function(img){ return img.id === mediaId; }) ||
        (item.attachments || []).some(function(att){ return att.id === mediaId; });
    });
  }

  function deleteMediaFor(req){
    if(!req || !core || !core.storage) return Promise.resolve();
    var jobs = [];
    (req.images || []).forEach(function(img){
      if(core.storage.deleteImage && !mediaReferencedElsewhere(img.id, req.id)){
        jobs.push(Promise.resolve().then(function(){ return core.storage.deleteImage(img.id); }).catch(function(){}));
      }
    });
    (req.attachments || []).forEach(function(att){
      if(core.storage.deleteFile && !mediaReferencedElsewhere(att.id, req.id)){
        jobs.push(Promise.resolve().then(function(){ return core.storage.deleteFile(att.id); }).catch(function(){}));
      }
    });
    return Promise.all(jobs);
  }

  function removeActiveRequest(req, deleteMedia){
    if(!req) return;
    if(core && core.requests && core.requests.remove){
      core.requests.remove(app.requests, req.id);
    }else if(app){
      var index = app.requests.findIndex(function(item){ return item.id === req.id; });
      if(index >= 0) app.requests.splice(index, 1);
    }
    if(deleteMedia) deleteMediaFor(req);
    activeRequestId = null;
    saveActivePointer(null);
    cancelConfirm = false;
    missingField = null;
    state.highlight = null;
    flushSave();
    broadcastState();
  }

  function saveDraftAndClose(){
    var req = activeRequest();
    if(!req) return;
    var snapshot = makeDraftSnapshot(req);
    var done = function(){
      removeActiveRequest(req, false);
      toast(lx("draftSaved"));
      sendAction("idle", { close:true });
    };
    if(core && core.storage && core.storage.putCollection){
      core.storage.putCollection("drafts", snapshot).then(done).catch(done);
    }else{
      done();
    }
  }

  function deleteRequestAndClose(){
    var req = activeRequest();
    if(!req) return;
    if(pendingRequest){
      discardPending();
      sendAction("idle", { close:true });
      return;
    }
    deleteMediaFor(req).then(function(){
      removeActiveRequest(req, false);
      toast(t("İstek silindi."));
      sendAction("idle", { close:true });
    });
  }

  function makeDraftSnapshot(req){
    var savedAt = core && core.util && core.util.nowISO ? core.util.nowISO() : new Date().toISOString();
    var clock = core && core.util && core.util.formatClock ? core.util.formatClock(savedAt) : savedAt;
    var serialized = core && core.requests && core.requests.serialize ? core.requests.serialize(req) : req;
    var signature = core && core.requests && core.requests.signature ? core.requests.signature(app.requests) : "";
    return {
      id: "drf_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      kind: "draft",
      savedAt: savedAt,
      name: (app.project || "Projem") + " · " + clock,
      project: app.project,
      ledgerId: app.ledgerId,
      requestCount: 1,
      imageCount: (req.images || []).length,
      fileCount: (req.attachments || []).length,
      signature: signature,
      complete: statusOf(req) === "ready",
      requests: [serialized],
      markdown: "",
      reason: "",
      fileName: "",
      rootFolder: "",
      writeError: ""
    };
  }

  /* ---------- list row actions ---------- */

  function toggleRowMenu(id){
    if(!id) return;
    openRowMenuId = openRowMenuId === id ? null : id;
    listDeleteId = null;
    refreshList();
  }

  function moveRequestRow(id, delta){
    if(!app || !core || !core.requests || !core.requests.move) return;
    var req = requestById(id);
    if(!req) return;
    core.requests.move(app.requests, id, delta);
    flushSave();
    refreshList();
  }

  function duplicateRequestRow(id){
    if(!app || !core || !core.requests || !core.requests.duplicate) return;
    var source = requestById(id);
    if(!source) return;
    var copy = core.requests.duplicate(source, app.requests);
    if(!copy) return;
    var index = app.requests.indexOf(source);
    app.requests.splice(index + 1, 0, copy);
    state.highlight = copy.id;
    openRowMenuId = null;
    flushSave();
    broadcastState();
    refreshList();
    toast(lx("duplicated"));
  }

  function openDeleteConfirmRow(id){
    if(!id) return;
    listDeleteId = id;
    openRowMenuId = null;
    refreshList();
  }

  function cancelDeleteRow(){
    listDeleteId = null;
    refreshList();
  }

  function confirmDeleteRow(id){
    var req = requestById(id);
    if(!req || !app) return;
    deleteRequestMedia(req).then(function(){
      if(core && core.requests && core.requests.remove){
        core.requests.remove(app.requests, id);
      }else{
        var index = app.requests.findIndex(function(item){ return item.id === id; });
        if(index >= 0) app.requests.splice(index, 1);
      }
      if(activeRequestId === id){
        activeRequestId = null;
        saveActivePointer(null);
      }
      if(state.highlight === id) state.highlight = null;
      listDeleteId = null;
      openRowMenuId = null;
      flushSave();
      broadcastState();
      refreshList();
      toast(t("İstek silindi."));
    });
  }

  /* remove a request's media unless a stored snapshot (records/drafts/history)
     still references it */
  function deleteRequestMedia(req){
    if(!req) return Promise.resolve();
    var imageIds = (req.images || []).map(function(img){ return img.id; }).filter(Boolean);
    var fileIds = (req.attachments || []).map(function(att){ return att.id; }).filter(Boolean);
    if(!imageIds.length && !fileIds.length) return Promise.resolve();
    if(!core || !core.storage || !core.storage.listCollection) return deleteMediaFor(req);

    var kinds = ["records", "drafts", "history"];
    var loads = kinds.map(function(kind){
      return Promise.resolve()
        .then(function(){ return core.storage.listCollection(kind); })
        .catch(function(){ return []; });
    });

    return Promise.all(loads).then(function(lists){
      var used = {};
      lists.forEach(function(list){
        (list || []).forEach(function(snapshot){
          (snapshot && snapshot.requests ? snapshot.requests : []).forEach(function(item){
            (item.images || []).forEach(function(img){ if(img && img.id) used[img.id] = true; });
            (item.attachments || []).forEach(function(att){ if(att && att.id) used[att.id] = true; });
          });
        });
      });
      var jobs = [];
      imageIds.forEach(function(id){
        if(used[id] || !core.storage.deleteImage) return;
        jobs.push(Promise.resolve().then(function(){ return core.storage.deleteImage(id); }).catch(function(){}));
      });
      fileIds.forEach(function(id){
        if(used[id] || !core.storage.deleteFile) return;
        jobs.push(Promise.resolve().then(function(){ return core.storage.deleteFile(id); }).catch(function(){}));
      });
      return Promise.all(jobs);
    });
  }

  function clearListFilters(){
    listFilter = { q:"", type:"all", status:"all" };
    var input = document.getElementById("rl-search");
    if(input) input.value = "";
    var select = document.getElementById("rl-status-filter");
    if(select){
      select.value = "all";
      syncSelectUI(select);
    }
    refreshList();
  }

  function jumpToIncomplete(){
    if(!app || !app.requests.length) return;
    var next = null;
    for(var i = 0; i < app.requests.length; i++){
      if(statusOf(app.requests[i]) !== "ready"){ next = app.requests[i]; break; }
    }
    if(!next){
      toast(lx("allReady"));
      return;
    }
    selectRequest(next.id);
  }

  /* ---------- ledger snapshots (records / drafts) ---------- */

  function buildLedgerSnapshot(kind){
    var isRecord = kind === "record";
    var requests = app.requests.map(function(req){
      return core && core.requests && core.requests.serialize ? core.requests.serialize(req) : req;
    });
    var savedAt = core && core.util && core.util.nowISO ? core.util.nowISO() : new Date().toISOString();
    var clock = core && core.util && core.util.formatClock ? core.util.formatClock(savedAt) : savedAt;
    var imageCount = requests.reduce(function(sum, req){ return sum + (req.images || []).length; }, 0);
    var fileCount = requests.reduce(function(sum, req){ return sum + (req.attachments || []).length; }, 0);
    var signature = core && core.requests && core.requests.signature ? core.requests.signature(app.requests) : "";
    var complete = app.requests.every(function(req){ return statusOf(req) === "ready"; });

    var snapshot = {
      id: (isRecord ? "rec_" : "drf_") + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      kind: kind,
      savedAt: savedAt,
      name: (app.project || "Projem") + " · " + clock,
      project: app.project,
      ledgerId: app.ledgerId,
      requestCount: requests.length,
      imageCount: imageCount,
      fileCount: fileCount,
      signature: signature,
      complete: complete,
      requests: requests,
      markdown: "",
      reason: "",
      fileName: "",
      rootFolder: "",
      writeError: ""
    };
    if(isRecord) snapshot.exported = false;

    var built = "";
    if(core && core.markdown && core.markdown.build){
      built = Promise.resolve()
        .then(function(){
          return core.markdown.build({
            requests: requests,
            project: app.project,
            lang: state.lang,
            mode: "none",
            includeSummary: true,
            planning: null,
            agents: app.agents
          });
        })
        .catch(function(){ return ""; });
    }else{
      built = Promise.resolve("");
    }

    return Promise.resolve(built).then(function(markdown){
      snapshot.markdown = markdown || "";
      return snapshot;
    });
  }

  function buildRecordSnapshot(){
    return buildLedgerSnapshot("record");
  }

  function currentSignature(){
    if(core && core.requests && core.requests.signature){
      try{ return core.requests.signature(app.requests); }catch(err){ /* ignore */ }
    }
    return "";
  }

  function recordMatchesLedger(record, signature){
    if(!record) return false;
    if(record.ledgerId && app && app.ledgerId && record.ledgerId === app.ledgerId) return true;
    return !record.ledgerId && !!signature && record.signature === signature;
  }

  function findRecordForLedger(){
    var signature = currentSignature();
    for(var i = 0; i < archiveData.records.length; i++){
      if(recordMatchesLedger(archiveData.records[i], signature)) return archiveData.records[i];
    }
    return null;
  }

  function isLedgerSaved(){
    var signature = currentSignature();
    if(!signature) return false;
    var i;
    for(i = 0; i < archiveData.records.length; i++){
      if(archiveData.records[i].signature === signature) return true;
    }
    for(i = 0; i < archiveData.history.length; i++){
      if(archiveData.history[i].signature === signature) return true;
    }
    return false;
  }

  function flashSaveRecordButton(){
    var btn = document.getElementById("rl-save-record");
    if(!btn) return;
    if(listSaveTimer){ clearTimeout(listSaveTimer); listSaveTimer = null; }
    btn.textContent = t("Kaydedildi");
    btn.setAttribute("data-saved", "true");
    listSaveTimer = setTimeout(function(){
      listSaveTimer = null;
      var node = document.getElementById("rl-save-record");
      if(!node) return;
      node.textContent = t("Kaydet");
      node.removeAttribute("data-saved");
    }, 3000);
  }

  function saveRecordSnapshot(){
    if(storageBlocked()){
      toast(lx("storageUnavailable"), "error");
      return;
    }
    if(!app || !app.requests.length){
      toast(lx("noRequestsToSave"), "error");
      return;
    }
    if(!core || !core.storage || !core.storage.putCollection){
      toast(lx("recordFailed"), "error");
      return;
    }
    loadArchive().then(function(){
      return buildLedgerSnapshot("record");
    }).then(function(snapshot){
      var existing = findRecordForLedger();
      if(existing){
        duplicatePrompt = { existing: existing, snapshot: snapshot };
        archiveDelete = null;
        archiveClear = null;
        archiveRenameId = null;
        syncDuplicatePrompt();
        if(els.body) els.body.scrollTop = 0;
        updateScrollAffordance();
        return null;
      }
      return writeRecordSnapshot(snapshot, null);
    }).catch(function(){
      toast(lx("recordFailed"), "error");
    });
  }

  function writeRecordSnapshot(snapshot, existing){
    if(existing){
      snapshot.id = existing.id;
      if(existing.fileName) snapshot.fileName = existing.fileName;
      if(existing.rootFolder) snapshot.rootFolder = existing.rootFolder;
    }
    return Promise.resolve()
      .then(function(){ return core.storage.putCollection("records", snapshot); })
      .then(function(){
        var index = -1;
        if(existing){
          for(var i = 0; i < archiveData.records.length; i++){
            if(archiveData.records[i].id === existing.id){ index = i; break; }
          }
        }
        if(index >= 0) archiveData.records[index] = snapshot;
        else archiveData.records.push(snapshot);
        sortArchive("records");
        duplicatePrompt = null;
        archiveScroll[archiveTab] = els.body ? els.body.scrollTop : 0;
        archiveTab = "records";
        toast(existing ? lx("recordUpdated") : t("Kayıt oluşturuldu."));
        flashSaveRecordButton();
        refreshArchiveViews();
        applyArchiveTab();
        if(els.body) els.body.scrollTop = archiveScroll.records || 0;
        broadcastState();
        return snapshot;
      });
  }

  function duplicateOverwrite(){
    var pending = duplicatePrompt;
    if(!pending) return;
    duplicatePrompt = null;
    syncDuplicatePrompt();
    writeRecordSnapshot(pending.snapshot, pending.existing).catch(function(){
      toast(lx("recordFailed"), "error");
    });
  }

  function duplicateCreateNew(){
    var pending = duplicatePrompt;
    if(!pending) return;
    duplicatePrompt = null;
    syncDuplicatePrompt();
    var nextLedger = newLedgerId();
    app.ledgerId = nextLedger;
    pending.snapshot.ledgerId = nextLedger;
    flushSave();
    writeRecordSnapshot(pending.snapshot, null).catch(function(){
      toast(lx("recordFailed"), "error");
    });
  }

  function cancelDuplicatePrompt(){
    duplicatePrompt = null;
    syncDuplicatePrompt();
    updateScrollAffordance();
  }

  /* ---------- archive actions ---------- */

  function findArchiveItem(kind, id){
    var list = archiveData[kind] || [];
    for(var i = 0; i < list.length; i++){
      if(list[i].id === id) return list[i];
    }
    return null;
  }

  function openArchiveRecord(kind, id){
    var item = findArchiveItem(kind, id);
    if(!item) return;
    if(kind === "history"){
      archiveDetail = item;
      archiveDelete = null;
      refreshArchiveViews();
      if(els.body) els.body.scrollTop = 0;
      return;
    }
    if(!Array.isArray(item.requests) || !item.requests.length){
      toast(lx("noSnapshotRequests"), "error");
      return;
    }
    loadArchive().then(function(){
      if(!app.requests.length || isLedgerSaved()) return null;
      return createAutoDraft();
    }).then(function(){
      applyArchiveSnapshot(item, kind);
    }).catch(function(){
      toast(lx("recordFailed"), "error");
    });
  }

  function applyArchiveSnapshot(item, kind){
    var loaded = (item.requests || []).map(function(raw, index){
      var copy = raw;
      try{ copy = JSON.parse(JSON.stringify(raw)); }catch(err){ copy = raw; }
      if(core && core.requests && core.requests.normalize){
        try{ return core.requests.normalize(copy, index); }catch(err){ /* fall through */ }
      }
      return copy;
    });

    app.requests = loaded;
    if(item.project) app.project = item.project;
    if(item.ledgerId) app.ledgerId = item.ledgerId;
    activeRequestId = null;
    saveActivePointer(null);
    state.highlight = loaded.length ? loaded[0].id : null;
    archiveDetail = null;
    archiveDelete = null;
    archiveClear = null;
    archiveRenameId = null;
    flushSave();
    broadcastState();
    refreshListPane();
    toast(t("Yüklendi: " + fmtDateTime(kind === "history" ? (item.exportedAt || item.savedAt) : item.savedAt)));
    setTimeout(function(){
      if(state.section === "list") requestClose();
    }, 900);
  }

  function createAutoDraft(){
    if(!core || !core.storage || !core.storage.putCollection) return Promise.resolve(null);
    return buildLedgerSnapshot("draft").then(function(snapshot){
      snapshot.reason = "auto-draft";
      return Promise.resolve(core.storage.putCollection("drafts", snapshot)).then(function(){
        archiveData.drafts.push(snapshot);
        sortArchive("drafts");
        updateArchiveTabCounts();
        return snapshot;
      });
    });
  }

  function deleteArchiveItem(){
    var pending = archiveDelete;
    if(!pending) return;
    var kind = pending.kind;
    var id = pending.id;
    Promise.resolve()
      .then(function(){ return core.storage.deleteCollection(kind, id); })
      .then(function(){
        archiveData[kind] = archiveData[kind].filter(function(item){ return item.id !== id; });
        archiveDelete = null;
        if(archiveRenameId === id) archiveRenameId = null;
        if(archiveDetail && archiveDetail.id === id) archiveDetail = null;
        var message = kind === "records" ? lx("recordDeleted") : kind === "drafts" ? lx("draftDeleted") : lx("historyDeleted");
        toast(message);
        refreshArchiveViews();
      })
      .catch(function(){
        toast(lx("recordFailed"), "error");
      });
  }

  function clearArchiveCollection(){
    var kind = archiveClear;
    if(!kind) return;
    Promise.resolve()
      .then(function(){ return core.storage.clearCollection(kind); })
      .then(function(){
        archiveData[kind] = [];
        archiveClear = null;
        archiveDelete = null;
        archiveDetail = null;
        var message = kind === "records" ? lx("recordsCleared") : kind === "drafts" ? lx("draftsCleared") : lx("historyCleared");
        toast(message);
        refreshArchiveViews();
      })
      .catch(function(){
        toast(lx("recordFailed"), "error");
      });
  }

  function saveArchiveRename(){
    var id = archiveRenameId;
    if(!id) return;
    var input = document.getElementById("rl-record-rename-input");
    var value = input ? input.value.trim().slice(0, 120) : "";
    if(!value){
      toast(t("Kayıt adı boş olamaz."), "error");
      return;
    }
    var item = findArchiveItem("records", id);
    if(!item) return;
    item.name = value;
    Promise.resolve()
      .then(function(){ return core.storage.putCollection("records", item); })
      .then(function(){
        archiveRenameId = null;
        sortArchive("records");
        toast(t("Kayıt yeniden adlandırıldı."));
        refreshArchiveViews();
      })
      .catch(function(){
        toast(lx("recordFailed"), "error");
      });
  }

  /* ---------- media ---------- */

  function isImageFile(file){
    return !!file && (String(file.type || "").indexOf("image/") === 0 || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name || ""));
  }

  function isQuotaError(err){
    if(!err) return false;
    var name = String(err.name || "");
    return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      err.code === 22 || err.code === 1014 || /quota/i.test(String(err.message || ""));
  }

  function queueImages(files){
    var incoming = sliceFiles(files).filter(isImageFile);
    if(!incoming.length){
      toast(lx("onlyImages"), "error");
      return;
    }
    imageQueue = imageQueue.then(function(){
      return processImages(incoming);
    }).catch(function(){ /* keep the queue alive */ });
  }

  function processImages(files){
    var req = activeRequest();
    if(!req || isLocked(req)) return Promise.resolve();
    if(storageBlocked()){
      toast(lx("storageUnavailable"), "error");
      return Promise.resolve();
    }

    var slot = LIMITS.MAX_IMAGES - (req.images || []).length;
    if(slot <= 0){
      toast(lx("imageLimit", { n:LIMITS.MAX_IMAGES }), "error");
      return Promise.resolve();
    }
    var use = files.slice(0, slot);

    var chain = Promise.resolve();
    var added = 0;
    var quotaHit = false;

    use.forEach(function(file){
      chain = chain.then(function(){
        if(quotaHit) return null;
        if(file.size > LIMITS.MAX_INPUT_MB * 1024 * 1024){
          toast(t(file.name + " çok büyük (en fazla " + LIMITS.MAX_INPUT_MB + " MB)."), "error");
          return null;
        }
        return Promise.resolve()
          .then(function(){
            if(core && core.media && core.media.compress){
              return core.media.compress(file, { maxDim:LIMITS.MAX_DIM, quality:LIMITS.JPEG_QUALITY });
            }
            throw new Error("media unavailable");
          })
          .catch(function(){
            var type = file.type || "image/png";
            var ext = core && core.util && core.util.extFromMime ? core.util.extFromMime(type) : "png";
            return { blob:file, w:0, h:0, type:type, ext:ext };
          })
          .then(function(result){
            if(!core || !core.storage || !core.storage.putImage) throw new Error("storage unavailable");
            var id = "img_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
            return core.storage.putImage({ id:id, blob:result.blob, type:result.type }).then(function(){
              req.images.push({
                id:id,
                name:file.name || lx("imageFallback"),
                w:result.w,
                h:result.h,
                size:result.blob.size,
                type:result.type,
                ext:result.ext,
                file:""
              });
              core.requests.update(req, { images:req.images });
              added++;
              fillImageGrid(req, false);
              markDirty(0);
            });
          })
          .catch(function(err){
            if(isQuotaError(err)){
              quotaHit = true;
              toast(lx("quotaExceeded"), "error");
              return;
            }
            toast(t(file.name + " eklenemedi."), "error");
          });
      });
    });

    return chain.then(function(){
      if(added){
        toast(lx("imagesAdded", { n:added }));
      }
      broadcastState();
    });
  }

  function removeImage(id){
    var req = activeRequest();
    if(!req || !id || isLocked(req)) return;
    if(storageBlocked()){
      toast(lx("storageUnavailable"), "error");
      return;
    }
    var index = (req.images || []).findIndex(function(img){ return img.id === id; });
    if(index < 0) return;
    req.images.splice(index, 1);
    if(core && core.storage && core.storage.deleteImage){
      core.storage.deleteImage(id).catch(function(){});
    }
    if(thumbUrls[id]){
      try{ URL.revokeObjectURL(thumbUrls[id]); }catch(err){ /* ignore */ }
      delete thumbUrls[id];
    }
    core.requests.update(req, { images:req.images });
    markDirty(0);
    fillImageGrid(req, false);
    toast(t("Görsel kaldırıldı."));
  }

  function addAttachments(files){
    var req = activeRequest();
    if(!req || isLocked(req)) return;
    if(storageBlocked()){
      toast(lx("storageUnavailable"), "error");
      return;
    }
    var incoming = sliceFiles(files);
    if(!incoming.length) return;
    var slot = LIMITS.MAX_ATTACHMENTS - req.attachments.length;
    if(slot <= 0){
      toast(lx("fileLimit", { n:LIMITS.MAX_ATTACHMENTS }), "error");
      return;
    }
    var use = incoming.slice(0, slot);

    var chain = Promise.resolve();
    var added = 0;
    use.forEach(function(file){
      chain = chain.then(function(){
        if(file.size > LIMITS.MAX_FILE_MB * 1024 * 1024){
          toast(t(file.name + " çok büyük (en fazla " + LIMITS.MAX_FILE_MB + " MB)."), "error");
          return null;
        }
        if(!core || !core.storage || !core.storage.putFile) return null;
        var id = "file_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
        var type = file.type || "application/octet-stream";
        var ext = core.util && core.util.extFromFileName ? core.util.extFromFileName(file.name) : "";
        return core.storage.putFile({ id:id, blob:file, type:type }).then(function(){
          req.attachments.push({ id:id, name:file.name || "dosya", size:file.size, type:type, ext:ext, file:"" });
          core.requests.update(req, { attachments:req.attachments });
          added++;
          markDirty(0);
        }).catch(function(err){
          if(isQuotaError(err)){
            toast(lx("quotaExceeded"), "error");
            return;
          }
          toast(t(file.name + " eklenemedi."), "error");
        });
      });
    });

    chain.then(function(){
      if(added) toast(lx("filesAdded", { n:added }));
      if(state.section === "desc") renderFlyout("desc");
      else if(state.section === "detail") renderFlyout("detail");
      broadcastState();
    });
  }

  function removeFile(id){
    var req = activeRequest();
    if(!req || !id || isLocked(req)) return;
    if(storageBlocked()){
      toast(lx("storageUnavailable"), "error");
      return;
    }
    var index = req.attachments.findIndex(function(att){ return att.id === id; });
    if(index < 0) return;
    req.attachments.splice(index, 1);
    if(core && core.storage && core.storage.deleteFile){
      core.storage.deleteFile(id).catch(function(){});
    }
    core.requests.update(req, { attachments:req.attachments });
    markDirty(0);
    renderFlyout(state.section === "detail" ? "detail" : "desc");
    toast(t("Dosya kaldırıldı."));
  }

  /* ---------- flyout event delegation ---------- */

  function onBodyInput(event){
    var target = event.target;
    if(!target || typeof target.getAttribute !== "function") return;

    if(target.id === "rl-search"){
      listFilter.q = target.value;
      refreshListSoon();
      return;
    }

    if(target.id === "rl-project-search"){
      archiveProjectQuery = target.value;
      renderArchiveProjectTree();
      return;
    }

    if(target.id === "rl-new-title"){
      draftTitle = target.value;
      syncCreateButton();
      return;
    }

    if(target.id === "rl-exp-note"){
      planNote = target.value;
      return;
    }

    var key = target.getAttribute("data-field");
    if(!key) return;

    var req = activeRequest();
    if(!req || isLocked(req)) return;

    var patch = {};
    patch[key] = target.value;
    core.requests.update(req, patch);

    if(missingField === "description" && key === "description" && String(target.value || "").trim()){
      missingField = null;
      target.classList.remove("is-invalid");
      target.removeAttribute("aria-invalid");
      var hint = document.getElementById("rl-invalid-hint");
      if(hint && hint.parentNode) hint.parentNode.removeChild(hint);
    }

    if(missingField === "title" && key === "title" && String(target.value || "").trim()){
      missingField = null;
      target.classList.remove("is-invalid");
      target.removeAttribute("aria-invalid");
      var titleHint = document.getElementById("rl-title-hint");
      if(titleHint && titleHint.parentNode) titleHint.parentNode.removeChild(titleHint);
    }

    markDirty();
  }

  function onBodyKeydown(event){
    var target = event.target;
    if(!target) return;
    if(event.key === "Enter" && target.id === "rl-record-rename-input"){
      event.preventDefault();
      saveArchiveRename();
    }
  }

  function onBodyChange(event){
    var target = event.target;
    if(!target || typeof target.getAttribute !== "function") return;

    var format = target.getAttribute("data-export-format");
    if(format && exportWizard){
      exportWizard.format = format === "embedded" ? "embedded" : "zip";
      var options = document.querySelectorAll(".exp-opt");
      for(var i = 0; i < options.length; i++){
        var input = options[i].querySelector("[data-export-format]");
        options[i].classList.toggle("is-on", !!(input && input.checked));
      }
      return;
    }

    if(target.id === "rl-exp-include-summary" && exportWizard){
      exportWizard.includeSummary = !!target.checked;
      return;
    }

    if(target.id === "rl-backup-input"){
      var picked = null;
      try{ picked = target.files && target.files.length ? target.files[0] : null; }catch(err){ picked = null; }
      try{ target.value = ""; }catch(err){ /* allow re-picking the same file */ }
      if(picked) prepareRestore(picked);
      return;
    }

    if(target.id !== "rl-status-filter") return;
    var value = target.value;
    listFilter.status = (value === "ready" || value === "notready") ? value : "all";
    openRowMenuId = null;
    listDeleteId = null;
    refreshList();
  }

  function onBodyClick(event){
    var target = event.target;
    if(!target || typeof target.closest !== "function") return;

    var typeBtn = target.closest("[data-type]");
    if(typeBtn){
      var typeId = typeBtn.getAttribute("data-type");
      if(state.section === "new"){
        draftType = typeId;
        markChipGroup(typeBtn, ".tygrid");
        /* the step count drops from 1/3 to 1/2 for page-free types */
        renderFoot("new");
        return;
      }
      var typeReq = activeRequest();
      if(typeReq && typeReq.type !== typeId){
        core.requests.update(typeReq, { type:typeId });
        cancelConfirm = false;
        missingField = null;
        markDirty(0);
        renderFlyout(state.section);
      }
      return;
    }

    var prioBtn = target.closest("[data-priority]");
    if(prioBtn){
      var priorityId = prioBtn.getAttribute("data-priority");
      if(state.section === "new"){
        draftPriority = priorityId;
        markChipGroup(prioBtn, ".prio");
        return;
      }
      var prioReq = activeRequest();
      if(prioReq && prioReq.priority !== priorityId){
        var wasLocked = isLocked(prioReq);
        core.requests.update(prioReq, { priority:priorityId });
        if(wasLocked){
          renderFlyout(state.section);
        }else{
          markChipGroup(prioBtn, ".prio");
          updateTypePrioritySummary(prioReq);
        }
        markDirty(0);
      }
      return;
    }

    var langBtn = target.closest("[data-lang]");
    if(langBtn){
      setLanguage(langBtn.getAttribute("data-lang"));
      return;
    }

    var modeBtn = target.closest("[data-plan-mode]");
    if(modeBtn){
      planMode = modeBtn.getAttribute("data-plan-mode");
      syncPlanningUI();
      return;
    }

    var questionBtn = target.closest("[data-plan-question]");
    if(questionBtn){
      planQuestion = questionBtn.getAttribute("data-plan-question") === "yes";
      syncPlanningUI();
      return;
    }

    var runtimeBtn = target.closest("[data-plan-runtime]");
    if(runtimeBtn){
      planRuntime = runtimeBtn.getAttribute("data-plan-runtime") === "yes";
      syncPlanningUI();
      return;
    }

    var transferBtn = target.closest("[data-plan-transfer]");
    if(transferBtn){
      var transfer = transferBtn.getAttribute("data-plan-transfer");
      if(transfer === "none"){
        planTransfers = ["none"];
      }else{
        var noneIndex = planTransfers.indexOf("none");
        if(noneIndex >= 0) planTransfers.splice(noneIndex, 1);
        var transferIndex = planTransfers.indexOf(transfer);
        if(transferIndex >= 0) planTransfers.splice(transferIndex, 1);
        else planTransfers.push(transfer);
      }
      syncPlanningUI();
      return;
    }

    var agentBtn = target.closest("[data-plan-agent]");
    if(agentBtn){
      var agentId = agentBtn.getAttribute("data-plan-agent");
      var agentIndex = planAgents.indexOf(agentId);
      if(agentIndex >= 0) planAgents.splice(agentIndex, 1);
      else planAgents.push(agentId);
      syncPlanningUI();
      return;
    }

    var testBtn = target.closest("[data-plan-test]");
    if(testBtn){
      planTest = testBtn.getAttribute("data-plan-test");
      syncPlanningUI();
      return;
    }

    var filterBtn = target.closest("[data-filter-type]");
    if(filterBtn){
      var filterType = filterBtn.getAttribute("data-filter-type");
      if(listFilter.type !== filterType){
        listFilter.type = filterType;
        openRowMenuId = null;
        listDeleteId = null;
        refreshList();
      }
      return;
    }

    var archiveTabBtn = target.closest("[data-archive-tab]");
    if(archiveTabBtn){
      switchArchiveTab(archiveTabBtn.getAttribute("data-archive-tab"));
      return;
    }

    var settingsTabBtn = target.closest("[data-settings-tab]");
    if(settingsTabBtn){
      switchSettingsTab(settingsTabBtn.getAttribute("data-settings-tab"));
      return;
    }

    var changelogBtn = target.closest("[data-changelog-toggle]");
    if(changelogBtn){
      toggleChangelog(changelogBtn.getAttribute("data-changelog-toggle"));
      return;
    }

    var recordActionEl = target.closest("[data-record-action]");
    if(recordActionEl){
      handleRecordAction(recordActionEl.getAttribute("data-record-action"), recordActionEl);
      return;
    }

    var projectActionEl = target.closest("[data-project-act]");
    if(projectActionEl){
      handleProjectAction(projectActionEl.getAttribute("data-project-act"), projectActionEl);
      return;
    }

    var archiveActionEl = target.closest("[data-archive-act]");
    if(archiveActionEl){
      handleArchiveAction(archiveActionEl.getAttribute("data-archive-act"));
      return;
    }

    var rowActionEl = target.closest("[data-row-action]");
    if(rowActionEl){
      handleRowAction(rowActionEl.getAttribute("data-row-action"), rowActionEl);
      return;
    }

    var actionEl = target.closest("[data-act]");
    if(actionEl){
      handleFlyoutAction(actionEl);
      return;
    }

    var row = target.closest("[data-request-id]");
    if(row){
      selectRequest(row.getAttribute("data-request-id"));
      return;
    }
  }

  /* ============================================================
     Live bridge — web app <-> extension panel

     The web app is the hub. While an allowlisted page has the app open,
     the extension mirrors its text data (project, ledgerId, requests,
     agents, language, exportBehavior). Media (image/file blobs) is
     deliberately NOT part of this channel: it travels with backup ZIPs
     only. Each surface keeps its own media arrays while text merges.

     Page <-> host (<content/dock.js>) <-> panel:
       RL_APP_HELLO    page  -> host -> panel   full envelope v1
       RL_APP_SNAPSHOT panel -> host -> page    full envelope v1
       RL_APP_PATCH    either direction         item-level upserts
       RL_APP_ACK      handshake / heartbeat / decision
       RL_APP_BYE      page closed
       RL_APP_TABS_REQUEST / RL_APP_PICK_REQUEST / RL_APP_CAPTURE_REQUEST
                       page -> panel            one-shot capture controls
       RL_APP_PICK_RESULT / RL_APP_CAPTURE_RESULT
                       panel -> page            selector, page and optional image
       RL_BRIDGE_CONTEXT host -> panel          page origin

     Security:
       - the host only relays on the allowlisted origins and pins the
         target origin to the page origin;
       - the panel only sends to a validated allowlisted parent origin.
       - every localhost/127.0.0.1 port is allowlisted so the launcher can
         pick a free port;
       - file: pages report the opaque origin "null"; only that case uses
         targetOrigin "*" because the origin cannot be pinned. The host must
         still be the direct parent and the page validates event.source.
     ============================================================ */

  var BRIDGE_VERSION = 1;
  var BRIDGE_ORIGINS = { "http://localhost:8080":true, "https://taneruner.github.io":true };
  var BRIDGE_LOCAL_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::[0-9]{1,5})?$/;
  /* A file: page reports origin "null". It is the only opaque origin the
     bridge accepts; the host only mounts this bridge from a file page and the
     panel still requires event.source === window.parent. */
  var BRIDGE_FILE_ORIGIN = "null";
  var BRIDGE_TOMBSTONE_KEY = "rl-bridge-tombstones-v1";
  var BRIDGE_TOMBSTONE_DAYS = 30;
  var BRIDGE_TOMBSTONE_MAX = 500;
  var BRIDGE_STALE_MS = 8000;

  var bridgePageOrigin = "";
  var bridgeConnected = false;
  var bridgeLastHeard = 0;
  var bridgeConflict = false;
  var bridgePeerHello = null;
  var bridgePeerOutdated = false;
  var bridgeOutdatedNotified = false;
  var bridgePeerVersionSeen = "";
  var bridgeLedgerSynced = false;
  var bridgeSuppress = 0;
  var bridgeSendTimer = null;
  var bridgeWatchTimer = null;
  var bridgeRefreshHoldUntil = 0;
  var pendingFlyoutFocus = null;
  var pendingFocusListenerOn = false;
  var bridgeLastAppliedHash = "";
  var bridgeTombstones = {};
  var bridgeKnownIds = {};
  /* Phase 2c: the live bridge follows the app's open project. A peer on a
     different project id is never merged into the active project. */
  var bridgePeerProjectId = "";
  var bridgeProjectMismatch = false;
  var bridgeAdoptingProject = false;
  var bridgeAdoptedNewProject = false;
  var bridgeStats = { sent:0, patches:0, received:0, applied:0, echoes:0 };

  function bridgeTombstoneKey(){
    return BRIDGE_TOMBSTONE_KEY + ":" + (activeProjectId || "default");
  }

  function bridgeEnvelopeProjectId(data){
    return data && typeof data.projectId === "string" ? data.projectId : "";
  }

  function bridgeEnvelopeProjectName(data){
    var value = data && typeof data.projectName === "string"
      ? data.projectName
      : (data && typeof data.project === "string" ? data.project : "");
    return normalizeProjectName(value);
  }

  function bridgeAllowedOrigin(value){
    return typeof value === "string" &&
      (BRIDGE_ORIGINS[value] === true ||
       BRIDGE_LOCAL_ORIGIN.test(value) ||
       value === BRIDGE_FILE_ORIGIN);
  }

  function bridgeNow(){
    if(core && core.util && typeof core.util.nowISO === "function") return core.util.nowISO();
    return new Date().toISOString();
  }

  function bridgeHash(value){
    var text = String(value == null ? "" : value);
    var hash = 5381;
    for(var i = 0; i < text.length; i++){
      hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
      hash = hash >>> 0;
    }
    return hash.toString(36) + ":" + text.length;
  }

  /* Tombstones survive a reload so a peer that was offline cannot
     resurrect a deleted request on the next connection. */
  function bridgeLoadTombstones(){
    bridgeTombstones = {};
    try{
      if(typeof localStorage === "undefined") return;
      var raw = localStorage.getItem(bridgeTombstoneKey());
      if(!raw) return;
      var parsed = JSON.parse(raw);
      if(!parsed || typeof parsed !== "object") return;
      var cutoff = Date.now() - BRIDGE_TOMBSTONE_DAYS * 24 * 60 * 60 * 1000;
      Object.keys(parsed).forEach(function(id){
        var at = Date.parse(parsed[id]);
        if(!isNaN(at) && at >= cutoff) bridgeTombstones[id] = String(parsed[id]);
      });
    }catch(err){ /* ignore */ }
  }

  function bridgeSaveTombstones(){
    try{
      if(typeof localStorage === "undefined") return;
      var ids = Object.keys(bridgeTombstones).sort();
      if(ids.length > BRIDGE_TOMBSTONE_MAX) ids = ids.slice(ids.length - BRIDGE_TOMBSTONE_MAX);
      var payload = {};
      ids.forEach(function(id){ payload[id] = bridgeTombstones[id]; });
      localStorage.setItem(bridgeTombstoneKey(), JSON.stringify(payload));
    }catch(err){ /* ignore */ }
  }

  function bridgeRememberTombstone(id, at){
    if(typeof id !== "string" || !id) return;
    bridgeTombstones[id] = at || bridgeNow();
    bridgeSaveTombstones();
  }

  /* nextId reuses max+1, so a re-created row can carry a deleted id. A live
     id must never keep a tombstone or the next merge skips/removes the row. */
  function bridgeForgetTombstone(id){
    if(typeof id !== "string" || !id || !Object.prototype.hasOwnProperty.call(bridgeTombstones, id)) return;
    delete bridgeTombstones[id];
    bridgeSaveTombstones();
  }

  function bridgeTombstoneIds(){
    return Object.keys(bridgeTombstones).sort();
  }

  /* Only ids that are no longer part of the ledger leave as deletions; an id
     present in `requests`/`upserts` must never be in `deletedIds` too. */
  function bridgeDeletionIds(){
    var live = {};
    if(app && Array.isArray(app.requests)){
      app.requests.forEach(function(req){ if(req && req.id) live[req.id] = true; });
    }
    return bridgeTombstoneIds().filter(function(id){ return !live[id]; });
  }

  /* Detect local deletions between two saves. */
  function bridgeCollectDeletes(){
    var current = {};
    if(app && Array.isArray(app.requests)){
      app.requests.forEach(function(req){ if(req && req.id) current[req.id] = true; });
    }
    Object.keys(bridgeKnownIds).forEach(function(id){
      if(!current[id]) bridgeRememberTombstone(id, app && app.updatedAt ? app.updatedAt : bridgeNow());
    });
    bridgeKnownIds = current;
  }

  function bridgeResetKnownIds(){
    bridgeKnownIds = {};
    if(app && Array.isArray(app.requests)){
      app.requests.forEach(function(req){ if(req && req.id) bridgeKnownIds[req.id] = true; });
    }
  }

  /* Text-only request envelope. Media arrays are intentionally omitted. */
  var BRIDGE_MEDIA_MAX_BYTES = 8 * 1024 * 1024;
  var bridgeSentMedia = {};
  var bridgePeerMedia = {};
  var bridgeMediaSending = false;

  /* Metadata can arrive before the blob. Keep a short pending window so the
     detail view can show "Loading image…" instead of a premature missing
     placeholder; a real failure turns into "not found" after the timeout. */
  var BRIDGE_MEDIA_PENDING_MS = 15000;
  var bridgeMediaPending = {};

  function bridgeMediaMarkPending(kind, id){
    if(!id) return;
    var key = bridgeMediaKey(kind, id);
    if(!(key in bridgeMediaPending)) bridgeMediaPending[key] = Date.now();
  }

  function bridgeMediaPendingRemaining(kind, id){
    if(!id) return 0;
    var at = bridgeMediaPending[bridgeMediaKey(kind, id)];
    if(!at) return 0;
    var left = BRIDGE_MEDIA_PENDING_MS - (Date.now() - at);
    return left > 0 ? left : 0;
  }

  function bridgeMediaIsPending(kind, id){
    return bridgeMediaPendingRemaining(kind, id) > 0;
  }

  function bridgeMediaClearPending(kind, id){
    if(!id) return;
    delete bridgeMediaPending[bridgeMediaKey(kind, id)];
  }

  function bridgeMediaOut(item, kind){
    if(!item || typeof item.id !== "string" || !item.id) return null;
    var out = {
      id:item.id,
      name:typeof item.name === "string" ? item.name.slice(0, 180) : "",
      type:typeof item.type === "string" ? item.type.slice(0, 120) : "",
      ext:typeof item.ext === "string" ? item.ext.slice(0, 20) : "",
      size:Number(item.size) || 0,
      kind:kind
    };
    if(kind === "image"){
      out.w = Number(item.w) || 0;
      out.h = Number(item.h) || 0;
    }
    return out;
  }

  function bridgeMediaKey(kind, id){
    return (activeProjectId || "") + "|" + kind + "|" + id;
  }

  function bridgeBlobToDataUrl(blob){
    return new Promise(function(resolve, reject){
      if(!blob){ reject(new Error("missing blob")); return; }
      try{
        var reader = new FileReader();
        reader.onload = function(){ resolve(reader.result); };
        reader.onerror = function(){ reject(reader.error || new Error("media read failed")); };
        reader.readAsDataURL(blob);
      }catch(err){ reject(err); }
    });
  }

  function bridgeSendMediaItem(req, item, kind, force){
    if(!req || !item || !item.id) return Promise.resolve(false);
    var key = bridgeMediaKey(kind, item.id);
    if(!force && (bridgeSentMedia[key] || bridgePeerMedia[key])) return Promise.resolve(false);
    var read = kind === "image" ? core.storage.getImage(item.id) : core.storage.getFile(item.id);
    return Promise.resolve(read).then(function(record){
      if(!record || !record.blob || record.blob.size > BRIDGE_MEDIA_MAX_BYTES) return false;
      return bridgeBlobToDataUrl(record.blob).then(function(dataUrl){
        if(typeof dataUrl !== "string" || dataUrl.length > BRIDGE_MEDIA_MAX_BYTES * 2) return false;
        bridgePost("RL_APP_MEDIA", {
          requestId:req.id,
          media:[{ kind:kind, id:item.id, meta:bridgeMediaOut(item, kind), dataUrl:dataUrl }]
        });
        bridgeSentMedia[key] = true;
        return true;
      });
    }).catch(function(){ return false; });
  }

  function bridgeSendPendingMedia(force){
    if(bridgeServerStopped || bridgeMediaSending || !app) return;
    bridgeMediaSending = true;
    var jobs = [];
    (app.requests || []).forEach(function(req){
      (Array.isArray(req.images) ? req.images : []).forEach(function(img){
        jobs.push(bridgeSendMediaItem(req, img, "image", force));
      });
      (Array.isArray(req.attachments) ? req.attachments : []).forEach(function(att){
        jobs.push(bridgeSendMediaItem(req, att, "file", force));
      });
    });
    Promise.all(jobs).then(function(){ bridgeMediaSending = false; }, function(){ bridgeMediaSending = false; });
  }

  function bridgeRequestMissingMedia(){
    if(bridgeServerStopped || !app) return;
    var ids = [];
    (app.requests || []).forEach(function(req){
      (Array.isArray(req.images) ? req.images : []).forEach(function(img){ if(img && img.id) ids.push("image:" + img.id); });
      (Array.isArray(req.attachments) ? req.attachments : []).forEach(function(att){ if(att && att.id) ids.push("file:" + att.id); });
    });
    if(!ids.length) return;
    ids.forEach(function(value){
      var parts = String(value).split(":");
      var kind = parts.shift();
      if(kind === "image" || kind === "file") bridgeMediaMarkPending(kind, parts.join(":"));
    });
    bridgePost("RL_APP_MEDIA_REQUEST", { ids:ids.slice(0, 100) });
  }

  function bridgeHandleMedia(data){
    if(!data || !app || !activeProjectId) return;
    if(bridgeEnvelopeProjectId(data) && bridgeEnvelopeProjectId(data) !== activeProjectId){
      bridgeRecordReject("media-project-mismatch", data);
      return;
    }
    var req = null;
    (app.requests || []).some(function(item){
      if(item.id === data.requestId){ req = item; return true; }
      return false;
    });
    if(!req || !Array.isArray(data.media)) return;
    var changed = false;
    var jobs = data.media.slice(0, 20).map(function(item){
      if(!item || typeof item.id !== "string" || typeof item.dataUrl !== "string") return Promise.resolve();
      if(!/^data:(image|application)\//.test(item.dataUrl)) return Promise.resolve();
      var kind = item.kind === "file" ? "file" : "image";
      var meta = item.meta && typeof item.meta === "object" ? item.meta : {};
      return fetch(item.dataUrl).then(function(response){ return response.blob(); }).then(function(blob){
        if(blob.size > BRIDGE_MEDIA_MAX_BYTES) return;
        if(kind === "image"){
          return core.storage.putImage({ id:item.id, blob:blob, type:meta.type || blob.type || "image/webp" }).then(function(){
            changed = true;
            var list = Array.isArray(req.images) ? req.images : [];
            if(!list.some(function(entry){ return entry.id === item.id; })){
              list.push({
                id:item.id, name:meta.name || lx("imageFallback"), w:Number(meta.w) || 0,
                h:Number(meta.h) || 0, type:meta.type || blob.type || "image/webp",
                ext:meta.ext || "", file:""
              });
              req.images = list;
              changed = true;
            }
          });
        }
        return core.storage.putFile({
          id:item.id, blob:blob, type:meta.type || blob.type || "application/octet-stream"
        }).then(function(){
          changed = true;
          var list = Array.isArray(req.attachments) ? req.attachments : [];
          if(!list.some(function(entry){ return entry.id === item.id; })){
            list.push({
              id:item.id, name:meta.name || lx("filesTitle"), size:Number(meta.size) || blob.size,
              type:meta.type || blob.type || "application/octet-stream",
              ext:meta.ext || "", file:""
            });
            req.attachments = list;
            changed = true;
          }
        });
      }).then(function(){
        bridgePeerMedia[bridgeMediaKey(kind, item.id)] = true;
        bridgeMediaClearPending(kind, item.id);
      }).catch(function(){ /* skip broken media */ });
    });
    Promise.all(jobs).then(function(){
      if(!changed) return;
      bridgeRefreshHoldUntil = Date.now() + 1500;
      /* Media metadata arrived over the bridge; persisting it must not count
         as a user edit that revokes an existing Ready confirmation, and must
         not create a newer revision that can override one. */
      saveNow();
      if(role === "flyout" && state.section) renderFlyout(state.section);
      if(role === "dock") updateDockBadges();
    });
  }

  function bridgeRequestOut(req){
    if(!req) return null;
    return {
      id:req.id,
      type:req.type,
      title:req.title,
      page:req.page,
      location:req.location,
      consoleError:req.consoleError,
      description:req.description,
      priority:req.priority,
      link:req.link,
      sampleWebsite:req.sampleWebsite,
      note:req.note,
      confirmed:req.confirmed === true,
      createdAt:req.createdAt,
      updatedAt:req.updatedAt,
      images:(Array.isArray(req.images) ? req.images : []).map(function(item){
        return bridgeMediaOut(item, "image");
      }).filter(Boolean),
      attachments:(Array.isArray(req.attachments) ? req.attachments : []).map(function(item){
        return bridgeMediaOut(item, "file");
      }).filter(Boolean)
    };
  }

  function bridgeMediaList(value, kind){
    return (Array.isArray(value) ? value : []).map(function(item){
      if(!item || typeof item.id !== "string" || !item.id) return null;
      var out = {
        id:item.id, name:item.name || "", type:item.type || "", ext:item.ext || "",
        size:Number(item.size) || 0, file:""
      };
      if(kind === "image"){ out.w = Number(item.w) || 0; out.h = Number(item.h) || 0; }
      return out;
    }).filter(Boolean);
  }

  function bridgeMergeMedia(incoming, local, kind){
    var byId = {};
    bridgeMediaList(local, kind).forEach(function(item){ byId[item.id] = item; });
    bridgeMediaList(incoming, kind).forEach(function(item){ byId[item.id] = item; });
    return Object.keys(byId).map(function(id){ return byId[id]; });
  }

  function bridgeAgentOut(agent){
    return { id:agent.id, name:agent.name, role:agent.role, mdPath:agent.mdPath };
  }

  function bridgePanelVersion(){
    try{ return String(chrome.runtime.getManifest().version || ""); }catch(err){ return ""; }
  }
  function bridgeVersionKey(value){
    var match = /^(\d+)\.(\d+)/.exec(String(value || ""));
    return match ? match[1] + "." + match[2] : "";
  }
  function bridgePeerVersionMismatch(data){
    var peer = data && typeof data.appVersion === "string" ? data.appVersion : "";
    bridgePeerVersionSeen = peer;
    var mine = bridgePanelVersion();
    /* A peer without a version is an older build. */
    if(!peer) return true;
    return bridgeVersionKey(peer) !== bridgeVersionKey(mine);
  }

  function bridgeNoteOutdated(){
    if(bridgeOutdatedNotified) return;
    bridgeOutdatedNotified = true;
    try{ toast(lx("bridgeOutdatedToast"), "error"); }catch(err){ /* ignore */ }
  }

  function bridgeEnvelope(type, extra){
    var message = {
      source:"request-ledger-panel",
      type:type,
      v:BRIDGE_VERSION,
      appVersion:bridgePanelVersion(),
      rev:Number(app && app.rev) || 0,
      ledgerId:app && app.ledgerId ? String(app.ledgerId) : "",
      updatedAt:app && app.updatedAt ? String(app.updatedAt) : bridgeNow(),
      project:app && typeof app.project === "string" ? app.project : "",
      projectId:activeProjectId || "",
      projectName:app && typeof app.project === "string" ? app.project : activeProjectName(),
      requests:app && Array.isArray(app.requests) ? app.requests.map(bridgeRequestOut).filter(Boolean) : [],
      agents:app && Array.isArray(app.agents) ? app.agents.map(bridgeAgentOut) : [],
      language:app && app.language === "tr" ? "tr" : "en",
      exportBehavior:app && ["last","instant"].indexOf(app.exportBehavior) >= 0 ? app.exportBehavior : "default",
      deletedIds:bridgeDeletionIds()
    };
    if(type === "RL_APP_PATCH"){
      message.upserts = message.requests.slice();
      delete message.requests;
    }
    if(extra){
      for(var key in extra){
        if(has(extra, key) && extra[key] !== undefined) message[key] = extra[key];
      }
    }
    return message;
  }

  function bridgeTargetOrigin(){
    if(bridgePageOrigin && bridgeAllowedOrigin(bridgePageOrigin)){
      return bridgePageOrigin === BRIDGE_FILE_ORIGIN ? "*" : bridgePageOrigin;
    }
    try{
      if(document.referrer){
        var refUrl = new URL(document.referrer);
        var origin = refUrl.protocol === "file:" ? BRIDGE_FILE_ORIGIN : refUrl.origin;
        if(bridgeAllowedOrigin(origin)){
          bridgePageOrigin = origin;
          return origin === BRIDGE_FILE_ORIGIN ? "*" : origin;
        }
      }
    }catch(err){ /* ignore */ }
    return "";
  }

  /* Page identity is still "null" for file pages even though the postMessage
     target must be "*". */
  function bridgePageIdentity(){
    if(bridgePageOrigin && bridgeAllowedOrigin(bridgePageOrigin)) return bridgePageOrigin;
    var target = bridgeTargetOrigin();
    return target === "*" ? BRIDGE_FILE_ORIGIN : target;
  }

  function bridgePost(type, extra){
    if(!hasHost || bridgeServerStopped) return;
    var target = bridgeTargetOrigin();
    if(!target) return; /* no allowlisted page: send nothing */
    var message = bridgeEnvelope(type, extra);
    try{ window.parent.postMessage(message, target); }catch(err){ return; }
    if(type === "RL_APP_PATCH") bridgeStats.patches++;
    else bridgeStats.sent++;
  }

  /* Picker replies are deliberately small: no ledger envelope, just the
     documented control fields. The host re-checks the origin and strips
     anything outside those fields before the page sees it. */
  function bridgeControlPost(type, extra){
    if(!hasHost || bridgeServerStopped) return;
    var target = bridgeTargetOrigin();
    if(!target) return;
    var message = {
      source:"request-ledger-panel",
      type:type,
      v:BRIDGE_VERSION,
      appVersion:bridgePanelVersion(),
      ledgerId:app && app.ledgerId ? String(app.ledgerId) : "",
      pageOrigin:bridgePageIdentity()
    };
    if(extra){
      for(var key in extra){
        if(has(extra, key) && extra[key] !== undefined) message[key] = extra[key];
      }
    }
    try{ window.parent.postMessage(message, target); }catch(err){ return; }
    bridgeStats.sent++;
  }

  var appPickPending = null; /* { tabId, capture } while a web-app pick runs */
  var appCapturePending = null; /* { tabId } while a web-app screenshot runs */
  var appTabsBusy = false;
  var APP_IMAGE_MAX_CHARS = 8 * 1024 * 1024;
  var bridgePeerLedgerId = "";
  var bridgePeerRequestCount = 0;
  var bridgeServerStopped = false;
  var companionPresence = { checked:false, open:false, mode:"", port:0, origin:"" };
  var companionProbeTimer = null;
  var companionProbeBusy = false;
  var companionWasLocked = false;

  function companionLocked(){
    return companionPresence.checked && !bridgeConnected && !companionPresence.open;
  }

  function companionOverlayLocked(){
    return !bridgeConnected && !companionPresence.open;
  }

  function updateCompanionLock(){
    var overlayLocked = companionOverlayLocked();
    /* No in-page lock card: the content script removes the whole host when
       the app is not alive. Presence/status updates must be side-effect free:
       they never discard a draft, switch mode, refresh data or move focus. */
    try{ document.body.setAttribute("data-companion-locked", overlayLocked ? "1" : "0"); }catch(err){ /* ignore */ }
    companionWasLocked = overlayLocked;
  }

  function companionProbeNow(force){
    if(companionProbeBusy || !hasHost) {
      if(!hasHost) { companionPresence.checked = true; companionPresence.open = false; updateBridgeUI(); }
      return;
    }
    if(!force && companionPresence.checked && Date.now() - (companionPresence.lastAt || 0) < 2500) return;
    companionProbeBusy = true;
    var port = Number(window.location.port) || 0;
    sendRuntime({ type:"RL_APP_PRESENCE", port:port }, function(response, failure){
      companionProbeBusy = false;
      if(failure || !response){
        companionPresence = { checked:true, open:false, mode:"", port:port, origin:"", lastAt:Date.now() };
      }else{
        companionPresence = {
          checked:true,
          open: response.open === true,
          mode: typeof response.mode === "string" ? response.mode : "",
          port: Number(response.port) || port,
          origin: typeof response.origin === "string" ? response.origin : "",
          lastAt: Date.now()
        };
      }
      /* Status changes are text-only; they never re-render the panel. */
      updateBridgeUI();
    });
  }

  function startCompanionProbe(){
    if(companionProbeTimer) clearInterval(companionProbeTimer);
    companionProbeNow(true);
    companionProbeTimer = setInterval(function(){ companionProbeNow(false); }, 4000);
  }
  var bridgeRejects = [];
  var bridgeConflictInfo = null;
  var BRIDGE_DIAGNOSTIC_MAX = 50;

  function bridgeEnvelopeRequestCount(data){
    if(!data) return 0;
    if(Array.isArray(data.requests)) return data.requests.length;
    if(Array.isArray(data.upserts)) return data.upserts.length;
    return 0;
  }

  function bridgeRecordReject(reason, data, extra){
    var record = {
      at: bridgeNow(),
      reason: reason,
      type: data && typeof data.type === "string" ? data.type : "",
      projectId: bridgeEnvelopeProjectId(data),
      ledgerId: data && typeof data.ledgerId === "string" ? data.ledgerId : "",
      requestCount: bridgeEnvelopeRequestCount(data),
      panelProjectId: activeProjectId || "",
      panelLedgerId: app && app.ledgerId ? String(app.ledgerId) : "",
      detail: extra || null
    };
    bridgeRejects.push(record);
    if(bridgeRejects.length > BRIDGE_DIAGNOSTIC_MAX) bridgeRejects.shift();
    try{ console.warn("[rl-bridge-panel] rejected envelope", record); }catch(err){ /* ignore */ }
    return record;
  }

  function bridgeCaptureConflict(source, data){
    var record = activeProjectId ? activeProjectRecord() : null;
    bridgeConflictInfo = {
      at: bridgeNow(),
      source: source || "RL_APP_HELLO",
      panel: {
        projectId: activeProjectId || "",
        ledgerId: app && app.ledgerId ? String(app.ledgerId) : "",
        requestCount: app && Array.isArray(app.requests) ? app.requests.length : 0
      },
      app: {
        projectId: bridgeEnvelopeProjectId(data),
        ledgerId: data && typeof data.ledgerId === "string" ? data.ledgerId : "",
        requestCount: bridgeEnvelopeRequestCount(data)
      },
      registry: {
        activeId: (readRegistry() || {}).activeId || null,
        recordLedgerId: record ? record.ledgerId : ""
      },
      stack: (new Error().stack || "").split("\n").slice(1, 7).join(" | ")
    };
    try{ console.warn("[rl-panel-bridge] conflict evidence", bridgeConflictInfo); }catch(err){ /* ignore */ }
  }

  /* The app sends its interface language with every pick/capture control
     request so the injected overlay can never fall back to a stale panel
     preference. Unknown or absent values use the panel's current language. */
  function appOverlayLang(data){
    if(data && (data.lang === "en" || data.lang === "tr")) return data.lang;
    return state.lang === "en" ? "en" : "tr";
  }

  function appImageDataUrl(value){
    if(typeof value !== "string" || !value || value.length > APP_IMAGE_MAX_CHARS) return "";
    return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(value) ? value : "";
  }

  function appImageDimension(value){
    var number = Number(value);
    if(!isFinite(number) || number <= 0) return 0;
    return Math.min(20000, Math.round(number));
  }

  function panelTabId(){
    return getCurrentTabId().then(function(id){
      return id != null ? id : originTabId;
    });
  }

  function isEligibleAppTab(tab, appTabId){
    if(!tab || typeof tab.id !== "number" || !isFinite(tab.id)) return false;
    if(appTabId != null && tab.id === appTabId) return false;
    var url = typeof tab.url === "string" ? tab.url : "";
    if(!/^(https?|file):/i.test(url)) return false;
    var base = "";
    try{ base = chrome.runtime.getURL(""); }catch(err){ base = ""; }
    if(base && url.indexOf(base) === 0) return false;
    return true;
  }

  function handleAppTabsRequest(data){
    if(role !== "dock") return; /* one responder only: the dock frame */
    if(!data || !bridgeAllowedOrigin(data.pageOrigin)) return;
    bridgePageOrigin = data.pageOrigin;
    if(appTabsBusy) return;
    appTabsBusy = true;
    panelTabId().then(function(appTabId){
      sendRuntime({ type:"RL_TABS_LIST", excludeTabId:appTabId != null ? appTabId : undefined }, function(response, failure){
        appTabsBusy = false;
        var tabs = [];
        if(!failure && response && response.ok === true && Array.isArray(response.tabs)){
          for(var i = 0; i < response.tabs.length && tabs.length < 50; i++){
            var tab = response.tabs[i];
            if(!isEligibleAppTab(tab, appTabId)) continue;
            tabs.push({
              id:tab.id,
              title:String(tab.title || tab.url || "").slice(0, 200),
              url:String(tab.url || "").slice(0, 2048),
              favIconUrl:typeof tab.favIconUrl === "string" ? tab.favIconUrl.slice(0, 2048) : ""
            });
          }
        }
        bridgeControlPost("RL_APP_TABS_RESULT", {
          tabs:tabs,
          error:failure || !response || response.ok !== true ? "unavailable" : ""
        });
      });
    });
  }

  function handleAppPickRequest(data){
    if(role !== "dock") return;
    if(!data || !bridgeAllowedOrigin(data.pageOrigin)) return;
    bridgePageOrigin = data.pageOrigin;
    if(appPickPending || appCapturePending) return;
    var tabId = Number(data.tabId);
    if(!isFinite(tabId) || tabId < 0 || Math.floor(tabId) !== tabId) return;
    tabId = Math.floor(tabId);
    var wantsCapture = data.capture === true;
    appPickPending = { tabId:tabId, capture:wantsCapture };
    panelTabId().then(function(originId){
      var payload = { type:"RL_PICK_ELEMENT", tabId:tabId, appPick:true, lang:appOverlayLang(data) };
      if(wantsCapture) payload.capture = true;
      if(originId != null) payload.originTabId = originId;
      sendRuntime(payload, function(response, failure){
        if(failure || !response || response.ok === false){
          appPickPending = null;
          bridgeControlPost("RL_APP_PICK_RESULT", {
            cancelled:true,
            tabId:tabId,
            error:"unavailable"
          });
        }
        /* on success the worker's RL_PICK_RESULT finishes the flow */
      });
    });
  }

  function handleAppPickCancel(data){
    if(role !== "dock") return;
    if(!data || !bridgeAllowedOrigin(data.pageOrigin)) return;
    var pending = appPickPending;
    appPickPending = null;
    if(!pending) return;
    if(data.tabId !== undefined && Number(data.tabId) !== pending.tabId) return;
    sendRuntime({ type:"RL_PICK_CANCEL", tabId:pending.tabId });
  }

  function handleAppCaptureRequest(data){
    if(role !== "dock") return;
    if(!data || !bridgeAllowedOrigin(data.pageOrigin)) return;
    bridgePageOrigin = data.pageOrigin;
    if(appCapturePending || appPickPending) return;
    var tabId = Number(data.tabId);
    if(!isFinite(tabId) || tabId < 0 || Math.floor(tabId) !== tabId) return;
    tabId = Math.floor(tabId);
    appCapturePending = { tabId:tabId };
    panelTabId().then(function(originId){
      var payload = { type:"RL_CAPTURE_TAB", tabId:tabId, appCapture:true, lang:appOverlayLang(data) };
      if(originId != null) payload.originTabId = originId;
      sendRuntime(payload, function(response, failure){
        if(failure || !response || response.ok === false){
          appCapturePending = null;
          bridgeControlPost("RL_APP_CAPTURE_RESULT", {
            cancelled:true,
            tabId:tabId,
            error:"unavailable"
          });
        }
        /* on success the worker's RL_CAPTURE_RESULT finishes the flow */
      });
    });
  }

  function handleAppCaptureCancel(data){
    if(role !== "dock") return;
    if(!data || !bridgeAllowedOrigin(data.pageOrigin)) return;
    var pending = appCapturePending;
    appCapturePending = null;
    if(!pending) return;
    if(data.tabId !== undefined && Number(data.tabId) !== pending.tabId) return;
    sendRuntime({ type:"RL_CAPTURE_CANCEL", tabId:pending.tabId });
  }

  function handleAppPickRuntime(message){
    if(!appPickPending) return;
    if(message.type === "RL_PICK_RESULT"){
      var flow = appPickPending;
      appPickPending = null;
      var pick = {
        tabId:flow.tabId,
        selector:typeof message.selector === "string" ? message.selector.slice(0, 4000) : "",
        page:typeof message.page === "string" ? message.page.slice(0, 2048) : "",
        label:typeof message.label === "string" ? message.label.slice(0, 400) : "",
        tag:typeof message.tag === "string" ? message.tag.slice(0, 64) : "",
        text:typeof message.text === "string" ? message.text.slice(0, 240) : "",
        capture:flow.capture === true,
        captureError:message.captureError === true
      };
      var pickImage = appImageDataUrl(message.dataUrl);
      if(pickImage){
        pick.dataUrl = pickImage;
        pick.width = appImageDimension(message.width);
        pick.height = appImageDimension(message.height);
      }
      bridgeControlPost("RL_APP_PICK_RESULT", pick);
      return;
    }
    if(message.type === "RL_PICK_CANCELLED"){
      var cancelled = appPickPending;
      appPickPending = null;
      bridgeControlPost("RL_APP_PICK_RESULT", {
        cancelled:true,
        tabId:cancelled.tabId,
        reason:typeof message.reason === "string" ? message.reason.slice(0, 64) : "cancelled"
      });
    }
  }

  function handleAppCaptureRuntime(message){
    if(!appCapturePending) return false;
    if(message.type === "RL_CAPTURE_RESULT"){
      var flow = appCapturePending;
      appCapturePending = null;
      var image = appImageDataUrl(message.dataUrl);
      bridgeControlPost("RL_APP_CAPTURE_RESULT", {
        tabId:flow.tabId,
        dataUrl:image,
        width:appImageDimension(message.width),
        height:appImageDimension(message.height)
      });
      return true;
    }
    if(message.type === "RL_CAPTURE_CANCELLED"){
      var cancelled = appCapturePending;
      appCapturePending = null;
      bridgeControlPost("RL_APP_CAPTURE_RESULT", {
        cancelled:true,
        tabId:cancelled.tabId,
        reason:typeof message.reason === "string" ? message.reason.slice(0, 64) : "cancelled"
      });
      return true;
    }
    return false;
  }

  function bridgeNotifyChange(){
    if(bridgeSuppress || !hasHost || !activeProjectId || bridgeServerStopped) return;
    /* Never push the panel's project into a different app project. */
    if(bridgePeerProjectId && bridgePeerProjectId !== activeProjectId){
      bridgeProjectMismatch = true;
      updateBridgeUI();
      return;
    }
    bridgeCollectDeletes();
    if(bridgeSendTimer){ clearTimeout(bridgeSendTimer); bridgeSendTimer = null; }
    bridgeSendTimer = setTimeout(function(){
      bridgeSendTimer = null;
      bridgePost("RL_APP_PATCH");
      bridgeSendPendingMedia(false);
    }, 120);
  }

  function bridgeHasData(requests, project, projectCreated){
    if(Array.isArray(requests) && requests.length > 0) return true;
    if(projectCreated === false) return false;
    return String(project == null ? "" : project).trim().length > 0;
  }

  /* A full replacement is merged by id: the newer row wins, and a local row
     created after the incoming snapshot (a draft the user just opened) is
     kept instead of being wiped by the adoption. */
  function bridgeMergedRows(localRows, incomingRows, cutoff){
    var stamp = String(cutoff || "");
    var incomingIds = {};
    var byId = {};
    var order = [];
    (Array.isArray(incomingRows) ? incomingRows : []).forEach(function(row){
      if(row && row.id) incomingIds[row.id] = true;
    });
    (Array.isArray(localRows) ? localRows : []).forEach(function(row){
      if(!row || !row.id || byId[row.id]) return;
      byId[row.id] = row;
      order.push(row.id);
    });
    (Array.isArray(incomingRows) ? incomingRows : []).forEach(function(row){
      if(!row || !row.id) return;
      var local = byId[row.id];
      if(!local){ byId[row.id] = row; order.push(row.id); return; }
      if(String(row.updatedAt || "") > String(local.updatedAt || "")) byId[row.id] = row;
    });
    order.slice().forEach(function(id){
      if(incomingIds[id]) return;
      var row = byId[id];
      if(!row) return;
      if(stamp && String(row.updatedAt || "") > stamp) return;
      delete byId[id];
      order.splice(order.indexOf(id), 1);
    });
    return order.map(function(id){ return byId[id]; });
  }

  function bridgeMergeRequests(incoming, deletedIds, stamp){
    var byId = {};
    var order = [];
    var incomingIds = {};
    (app && Array.isArray(app.requests) ? app.requests : []).forEach(function(req){
      if(!req || !req.id) return;
      byId[req.id] = req;
      order.push(req.id);
    });
    (Array.isArray(incoming) ? incoming : []).forEach(function(raw){
      if(raw && typeof raw.id === "string" && raw.id) incomingIds[raw.id] = true;
    });

    (Array.isArray(deletedIds) ? deletedIds : []).forEach(function(id){
      if(typeof id !== "string" || !id) return;
      /* The peer's own upsert wins: a live row in this envelope is not a
         deletion, even when a stale tombstone still carries its id. */
      if(incomingIds[id]) return;
      var local = byId[id];
      var deletedAt = bridgeTombstones[id] ? String(bridgeTombstones[id]) : String(stamp || "");
      if(local && local.updatedAt && String(local.updatedAt) > deletedAt) return;
      delete byId[id];
      bridgeRememberTombstone(id, deletedAt || bridgeNow());
      var at = order.indexOf(id);
      if(at >= 0) order.splice(at, 1);
    });

    (Array.isArray(incoming) ? incoming : []).forEach(function(raw, index){
      if(!raw || typeof raw.id !== "string" || !raw.id) return;
      /* The id is live in the envelope: clear any stale tombstone instead of
         skipping a freshly re-created request. */
      bridgeForgetTombstone(raw.id);
      var local = byId[raw.id];
      /* Equal timestamps keep the local object: replacing on a tie would let a
         lagging peer erase a just-written field during the same revision. */
      if(local && String(local.updatedAt || "") >= String(raw.updatedAt || "")) return;
      var normalized = core && core.requests && core.requests.normalize
        ? core.requests.normalize(raw, index)
        : raw;
      /* Metadata crosses with the request; blobs travel separately. Keep a
         local-only id so it can still be uploaded to the other surface. */
      normalized.images = bridgeMergeMedia(raw.images, local && local.images, "image");
      normalized.attachments = bridgeMergeMedia(raw.attachments, local && local.attachments, "file");
      normalized.collapsed = local ? local.collapsed !== false : true;
      if(!local) order.push(normalized.id);
      byId[normalized.id] = normalized;
    });

    var merged = [];
    order.forEach(function(id){ if(byId[id]) merged.push(byId[id]); });
    Object.keys(byId).forEach(function(id){ if(order.indexOf(id) < 0) merged.push(byId[id]); });
    return merged;
  }

  function bridgeNormalizedAgents(list){
    if(!Array.isArray(list)) return null;
    var out = [];
    list.forEach(function(raw){
      if(!raw || typeof raw !== "object") return;
      out.push({
        id:String(raw.id || ""),
        name:String(raw.name || "").slice(0, 80),
        role:String(raw.role || "general"),
        mdPath:String(raw.mdPath || raw.mdFile || "").slice(0, 300)
      });
    });
    return out;
  }

  function bridgeApplyLanguage(lang){
    var next = lang === "tr" ? "tr" : "en";
    if(state.lang === next) return;
    state.lang = next;
    document.documentElement.lang = next;
    if(core && core.i18n && core.i18n.setLanguage) core.i18n.setLanguage(next);
    if(role === "dock") refreshDockLabels();
    else if(state.section) renderFlyout(state.section);
  }

  function bridgeProjectIdValid(projectId){
    return typeof projectId === "string" && /^prj_[A-Za-z0-9_]+$/.test(projectId);
  }

  /* On HELLO the panel selects the app's project. If this profile has no
     project with that id yet, it creates one from the app payload before any
     ledger data is applied. */
  function bridgeAdoptProject(projectId, projectName, data){
    if(!bridgeProjectIdValid(projectId)) return false;
    var registry = readRegistry() || emptyProjectRegistry();
    var project = findProjectRecordIn(registry, projectId);
    var created = !project;
    var displayName = normalizeProjectName(projectName) || importedProjectName(data && data.language);
    var stamp = data && typeof data.updatedAt === "string" && data.updatedAt ? data.updatedAt : bridgeNow();
    var peerLedgerId = data && typeof data.ledgerId === "string" ? normalizeLedgerId(data.ledgerId) : "";
    if(!project){
      project = {
        id:projectId,
        name:displayName,
        createdAt:stamp,
        updatedAt:stamp,
        ledgerId:peerLedgerId,
        exportTarget:"",
        archiveCollapsed:false
      };
      registry.projects.push(project);
    }else{
      if(displayName) project.name = displayName;
      if(peerLedgerId) project.ledgerId = peerLedgerId;
    }
    registry.activeId = projectId;
    if(!writeRegistry(registry)) return false;

    /* No seed ledger: openProjectById starts from the app payload when the
       project is new, and bridgeApply writes the first app state. This avoids
       a dock/flyout race where one frame overwrites the other's seeded data. */

    bridgeAdoptingProject = true;
    bridgeSuppress++;
    try{
      if(activeProjectId && activeProjectId !== projectId) saveNow();
      /* A HELLO/adoption is not a user action: preserve the closed section or
         the section the user explicitly opened. */
      openProjectById(projectId, { preserveSection:true });
      bridgeLoadTombstones();
      bridgeResetKnownIds();
      bridgeLedgerSynced = false;
      bridgeConflict = false;
      bridgePeerHello = null;
      bridgeProjectMismatch = false;
      bridgeAdoptedNewProject = created;
    }finally{
      bridgeSuppress--;
      bridgeAdoptingProject = false;
    }
    return true;
  }

  /* mode: "merge" (item-level) or "replace" (the user chose this ledger) */
  function bridgeApply(data, mode){
    if(!app) return false;
    var incomingRev = Number(data && data.rev);
    /* Only a full replacement can drop requests; item-level merges are
       id-keyed and keep the newer copy, so a live panel edit must pass. */
    if(mode === "replace" && Number.isFinite(incomingRev) && incomingRev < (Number(app.rev) || 0)){
      bridgeRecordReject("stale-revision", data, { incomingRev: incomingRev, localRev: Number(app.rev) || 0 });
      return false;
    }
    var incomingProjectId = bridgeEnvelopeProjectId(data);
    if(activeProjectId && incomingProjectId !== activeProjectId){
      bridgeRecordReject("project-mismatch", data, { incomingProjectId: incomingProjectId });
      return false;
    }
    var incoming = Array.isArray(data.requests) ? data.requests : (Array.isArray(data.upserts) ? data.upserts : []);
    var storageSaved = true;
    var stamp = typeof data.updatedAt === "string" ? data.updatedAt : "";
    if(typeof data.ledgerId === "string" && data.ledgerId) bridgePeerLedgerId = data.ledgerId;
    bridgePeerRequestCount = incoming.length;

    var signature = bridgeSignatureFromData(data);
    if(signature && signature === bridgeStateSignature()){
      bridgeStats.echoes++;
      return false;
    }

    bridgeSuppress++;
    try{
      if(mode === "replace"){
        /* A chosen ledger is merged, not pasted: a request the user created
           after the incoming snapshot must survive the adoption. Old
           tombstones belong to the losing ledger. */
        var localRows = app.requests.slice();
        var incomingRows = [];
        incoming.forEach(function(raw, index){
          if(!raw || typeof raw.id !== "string" || !raw.id) return;
          var normalized = core && core.requests && core.requests.normalize
            ? core.requests.normalize(raw, index)
            : raw;
          normalized.images = bridgeMediaList(raw.images, "image");
          normalized.attachments = bridgeMediaList(raw.attachments, "file");
          incomingRows.push(normalized);
        });
        bridgeTombstones = {};
        bridgeSaveTombstones();
        app.requests = bridgeMergedRows(localRows, incomingRows, stamp);
        var replacedName = bridgeEnvelopeProjectName(data);
        if(replacedName){
          app.project = replacedName;
        }
        var agents = bridgeNormalizedAgents(data.agents);
        if(agents) app.agents = agents;
        if(data.language === "tr" || data.language === "en") app.language = data.language;
        if(["last","instant"].indexOf(data.exportBehavior) >= 0) app.exportBehavior = data.exportBehavior;
        else app.exportBehavior = "default";
        if(typeof data.ledgerId === "string" && data.ledgerId) app.ledgerId = data.ledgerId;
      }else{
        app.requests = bridgeMergeRequests(incoming, data.deletedIds, stamp);
        var metaNewer = !app.updatedAt || String(stamp) > String(app.updatedAt);
        if(metaNewer){
          var incomingName = bridgeEnvelopeProjectName(data);
          if(incomingName && data.projectCreated !== false) app.project = incomingName;
          var nextAgents = bridgeNormalizedAgents(data.agents);
          if(nextAgents) app.agents = nextAgents;
          if(data.language === "tr" || data.language === "en") app.language = data.language;
          if(["last","instant"].indexOf(data.exportBehavior) >= 0) app.exportBehavior = data.exportBehavior;
        }
        if(!app.requests.length && !String(app.project || "").trim() && typeof data.ledgerId === "string" && data.ledgerId){
          app.ledgerId = data.ledgerId;
        }
      }

      if(core && core.storage && core.storage.saveState){
        storageSaved = false;
        for(var saveAttempt = 0; saveAttempt < 2; saveAttempt += 1){
          try{ storageSaved = core.storage.saveState(app) !== false; }catch(err){ storageSaved = false; }
          if(storageSaved) break;
        }
      }
      bridgeRefreshHoldUntil = Date.now() + 1500;
      /* The project registry owns the name and the one ledger id; keep both
         aligned with the app so a stop/start never prompts again. */
      touchActiveProject(app.project, app.updatedAt || stamp || bridgeNow(), app.ledgerId);
      if(typeof setProjectLedgerId === "function") setProjectLedgerId(activeProjectId, app.ledgerId);
      if(mode === "replace") bridgeLedgerSynced = true;
      if(typeof resetProjectSnapshot === "function") resetProjectSnapshot();
      bridgeApplyLanguage(app.language);
      bridgeResetKnownIds();
      if(Number.isFinite(incomingRev)) app.rev = Math.max(Number(app.rev) || 0, incomingRev);
      bridgeLastAppliedHash = bridgeStateSignature();
    }finally{
      bridgeSuppress--;
    }

    /* Metadata that just arrived through the bridge is expected to be
       followed by its blob. Mark it before the first render so the loading
       state wins the race with the async storage read. */
    incoming.forEach(function(raw){
      if(!raw || typeof raw !== "object") return;
      (Array.isArray(raw.images) ? raw.images : []).forEach(function(img){
        if(img && img.id) bridgeMediaMarkPending("image", img.id);
      });
      (Array.isArray(raw.attachments) ? raw.attachments : []).forEach(function(att){
        if(att && att.id) bridgeMediaMarkPending("file", att.id);
      });
    });
    if(storageSaved){
      if(typeof clearStorageFailure === "function") clearStorageFailure();
      reloadSharedState(incomingProjectId || activeProjectId);
    }else{
      /* A failed write must never be followed by a storage reload: it would
         discard the just-applied bridge data (including a Ready confirmation)
         and the next refresh would push that stale copy back to the app. */
      if(typeof setStorageFailure === "function"){
        setStorageFailure(core && core.storage && core.storage.getLastSaveError
          ? core.storage.getLastSaveError()
          : null);
      }
      if(typeof updateDockBadges === "function") updateDockBadges();
      if(role === "flyout" && state.section) renderFlyout(state.section);
    }
    updateBridgeUI();
    bridgeStats.applied++;
    setTimeout(function(){ bridgeSendPendingMedia(false); bridgeRequestMissingMedia(); }, 0);
    return true;
  }

  function bridgeSignatureFromData(data){
    var requests = Array.isArray(data.requests) ? data.requests : (Array.isArray(data.upserts) ? data.upserts : []);
    var rows = [];
    (requests || []).forEach(function(req){
      if(!req || !req.id) return;
      rows.push([
        req.id, req.type, req.title, req.page, req.location, req.consoleError,
        req.description, req.priority, req.link, req.sampleWebsite, req.note,
        req.confirmed ? 1 : 0, req.updatedAt || ""
      ].join("\u001f"));
    });
    rows.sort();
    var agents = [];
    (Array.isArray(data.agents) ? data.agents : []).forEach(function(agent){
      agents.push([agent.id, agent.name, agent.role, agent.mdPath].join("\u001f"));
    });
    agents.sort();
    return bridgeHash([
      bridgeEnvelopeProjectId(data),
      String(data.project == null ? "" : data.project),
      data.language === "tr" ? "tr" : "en",
      data.exportBehavior || "default",
      agents.join("\u001e"),
      rows.join("\u001e"),
      (Array.isArray(data.deletedIds) ? data.deletedIds.slice().sort().join("\u001f") : "")
    ].join("\u001d"));
  }

  function bridgeStateSignature(){
    if(!app) return "";
    var requests = (app.requests || []).map(function(req){
      return [
        req.id, req.type, req.title, req.page, req.location, req.consoleError,
        req.description, req.priority, req.link, req.sampleWebsite, req.note,
        req.confirmed ? 1 : 0, req.updatedAt || ""
      ].join("\u001f");
    }).sort();
    var agents = (app.agents || []).map(function(agent){
      return [agent.id, agent.name, agent.role, agent.mdPath].join("\u001f");
    }).sort();
    return bridgeHash([
      activeProjectId || "",
      String(app.project || ""),
      app.language === "tr" ? "tr" : "en",
      app.exportBehavior || "default",
      agents.join("\u001e"),
      requests.join("\u001e"),
      bridgeTombstoneIds().join("\u001f")
    ].join("\u001d"));
  }

  /* ---------- incoming host messages ---------- */

  function bridgeMarkHeard(){
    bridgeConnected = true;
    bridgeLastHeard = Date.now();
    updateBridgeUI();
  }

  function handleBridgeHello(data){
    if(Number(data.v) !== BRIDGE_VERSION) return;
    bridgeMarkHeard();
    if(typeof data.pageOrigin === "string" && bridgeAllowedOrigin(data.pageOrigin)) bridgePageOrigin = data.pageOrigin;

    /* Phase 2c: HELLO selects the same local project (or creates it from the
       app payload). The panel never applies another project's ledger. */
    var peerProjectId = bridgeEnvelopeProjectId(data);
    var adoptedNewProject = false;
    /* A HELLO without a project identity cannot be assigned to the open
       project; wait for the app to identify its project. */
    if(activeProjectId && !peerProjectId) return;
    if(peerProjectId && peerProjectId !== activeProjectId){
      if(!bridgeAdoptProject(peerProjectId, bridgeEnvelopeProjectName(data), data)){
        bridgeRecordReject("project-adopt-failed", data, { reason: "HELLO project could not be adopted" });
        bridgePeerProjectId = peerProjectId;
        bridgeProjectMismatch = true;
        updateBridgeUI();
        return;
      }
      adoptedNewProject = bridgeAdoptedNewProject;
      bridgeAdoptedNewProject = false;
    }
    if(peerProjectId) bridgePeerProjectId = peerProjectId;
    bridgeProjectMismatch = false;
    if(typeof data.ledgerId === "string" && data.ledgerId) bridgePeerLedgerId = data.ledgerId;
    if(Array.isArray(data.requests)) bridgePeerRequestCount = data.requests.length;
    /* A project created from the app payload starts with the app's ledger id. */
    if(adoptedNewProject && typeof data.ledgerId === "string" && data.ledgerId) app.ledgerId = data.ledgerId;

    var pageHas = bridgeHasData(data.requests, bridgeEnvelopeProjectName(data) || data.project, data.projectCreated === false ? false : true);
    var pageRequestCount = Array.isArray(data.requests) ? data.requests.length : 0;
    /* A local project with no requests holds no user data worth protecting;
       it is adopted from the app instead of opening a ledger conflict. */
    var panelHas = !!(app && Array.isArray(app.requests) && app.requests.length > 0);
    /* Empty panel project: take the app's ledger id even when both sides are
       empty and bridgeApply() would treat it as an echo. This is what keeps
       two panel frames from saving different ledger ids for one project. */
    if(peerProjectId === activeProjectId && !panelHas &&
       typeof data.ledgerId === "string" && data.ledgerId &&
       String(app.ledgerId) !== String(data.ledgerId)){
      app.ledgerId = data.ledgerId;
      if(typeof setProjectLedgerId === "function") setProjectLedgerId(activeProjectId, app.ledgerId);
      if(core && core.storage && core.storage.saveState){
        try{ core.storage.saveState(app); }catch(err){ /* first save retries */ }
      }
    }

    if(data.resolution === "app"){
      bridgeConflict = false;
      bridgePeerHello = null;
      bridgeLedgerSynced = true;
      bridgeApply(data, "replace");
      bridgePost("RL_APP_ACK", { conflict:false, resolution:"app", ledgerId:app.ledgerId });
      updateBridgeUI();
      return;
    }
    if(data.resolution === "extension"){
      bridgeConflict = false;
      bridgePeerHello = null;
      bridgeLedgerSynced = true;
      bridgePost("RL_APP_ACK", { conflict:false, resolution:"extension", ledgerId:app.ledgerId });
      bridgePost("RL_APP_SNAPSHOT", { resolution:"extension" });
      updateBridgeUI();
      return;
    }

    var sameProject = Boolean(peerProjectId && activeProjectId && peerProjectId === activeProjectId);
    if(sameProject && !adoptedNewProject && data.ledgerId && app.ledgerId &&
       String(data.ledgerId) !== String(app.ledgerId) && pageRequestCount > 0 && panelHas){
      bridgeCaptureConflict(data.type, data);
      bridgeConflict = true;
      bridgePeerHello = data;
      bridgePost("RL_APP_ACK", { conflict:true, ledgerId:app.ledgerId });
      bridgePost("RL_APP_SNAPSHOT");
      updateBridgeUI();
      return;
    }

    if(!panelHas && !pageHas){
      bridgeConflict = false;
      bridgePeerHello = null;
      bridgePost("RL_APP_ACK", { conflict:false, ledgerId:app.ledgerId });
      bridgePost("RL_APP_SNAPSHOT");
      updateBridgeUI();
      return;
    }

    if(!panelHas && pageHas){
      bridgeApply(data, "replace");
      bridgeLedgerSynced = true;
    }else{
      bridgeApply(data, "merge");
    }
    bridgeConflict = false;
    bridgePeerHello = null;
    bridgePost("RL_APP_ACK", { conflict:false, ledgerId:app.ledgerId });
    bridgePost("RL_APP_SNAPSHOT");
    updateBridgeUI();
  }

  function handleBridgePatch(data){
    if(Number(data.v) !== BRIDGE_VERSION) return;
    bridgeMarkHeard();
    var peerProjectId = bridgeEnvelopeProjectId(data);
    if(activeProjectId && peerProjectId !== activeProjectId){
      if(!activeProjectId && bridgeAdoptProject(peerProjectId, bridgeEnvelopeProjectName(data), data)){
        /* adopted, fall through and merge the patch */
      }else{
        bridgePeerProjectId = peerProjectId;
        bridgeProjectMismatch = true;
        updateBridgeUI();
        return;
      }
    }
    if(peerProjectId) bridgePeerProjectId = peerProjectId;
    bridgeProjectMismatch = false;
    if(bridgeConflict) return; /* wait for the user's ledger decision */

    var incomingRequestCount = (Array.isArray(data.upserts) ? data.upserts.length : (Array.isArray(data.requests) ? data.requests.length : 0));
    if(peerProjectId === activeProjectId && data.ledgerId && app.ledgerId &&
       String(data.ledgerId) !== String(app.ledgerId) &&
       incomingRequestCount > 0 && app.requests.length > 0){
      bridgeCaptureConflict(data.type, data);
      bridgeConflict = true;
      bridgePeerHello = data;
      bridgePost("RL_APP_ACK", { conflict:true, ledgerId:app.ledgerId });
      updateBridgeUI();
      return;
    }
    /* The app is the hub: an empty extension adopts its ledger id before
       recording the first mirrored project/request. */
    if(!bridgeLedgerSynced && typeof data.ledgerId === "string" && data.ledgerId){
      app.ledgerId = data.ledgerId;
      if(typeof setProjectLedgerId === "function") setProjectLedgerId(activeProjectId, app.ledgerId);
      bridgeLedgerSynced = true;
    }

    bridgeApply(data, "merge");
    bridgePost("RL_APP_ACK", { conflict:false, ledgerId:app.ledgerId });
    updateBridgeUI();
  }

  function handleBridgeAck(data){
    if(Number(data.v) !== BRIDGE_VERSION) return;
    bridgeMarkHeard();
    var peerProjectId = bridgeEnvelopeProjectId(data);
    if(activeProjectId && peerProjectId !== activeProjectId){
      if(peerProjectId || data.conflict === true){
        bridgePeerProjectId = peerProjectId;
        bridgeProjectMismatch = true;
        bridgeConflict = false;
        updateBridgeUI();
        if(data.heartbeat === true){
          bridgePost("RL_APP_ACK", { heartbeat:true, ledgerId:app.ledgerId, requests:[], agents:[], deletedIds:[] });
        }
        return;
      }
    }
    if(peerProjectId) bridgePeerProjectId = peerProjectId;
    bridgeProjectMismatch = false;
    if(typeof data.ledgerId === "string" && data.ledgerId) bridgePeerLedgerId = data.ledgerId;
    if(!data.heartbeat && Array.isArray(data.requests)) bridgePeerRequestCount = data.requests.length;
    if(data.heartbeat === true){
      bridgePost("RL_APP_ACK", { heartbeat:true, ledgerId:app.ledgerId });
      return;
    }
    if(data.conflict === true && !bridgeConflict){
      bridgeConflict = true;
      updateBridgeUI();
    }
    if(data.resolution === "extension"){
      bridgeConflict = false;
      bridgePeerHello = null;
      bridgePost("RL_APP_SNAPSHOT", { resolution:"extension" });
      updateBridgeUI();
    }else if(data.resolution === "app"){
      bridgeConflict = false;
      bridgePeerHello = null;
      updateBridgeUI();
    }
  }

  function handleBridgeBye(){
    if(bridgeServerStopped) return;
    bridgeConnected = false;
    companionPresence = { checked:true, open:false, mode:"", port:companionPresence.port || 0, origin:"", lastAt:Date.now() };
    bridgeLastHeard = 0;
    bridgePeerProjectId = "";
    bridgePeerLedgerId = "";
    bridgePeerRequestCount = 0;
    bridgeProjectMismatch = false;
    updateBridgeUI();
  }

  /* Explicit stop from the app. The extension keeps its own local ledger
     available, but the bridge is disconnected and applies no traffic until a
     fresh HELLO proves the same port is back. */
  function bridgeBroadcastServerStop(){
    try{
      if(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage){
        chrome.runtime.sendMessage({ type:"RL_SERVER_STOP" }, function(){ /* no panel listener */ });
      }
    }catch(err){ /* ignore */ }
  }

  function bridgeBroadcastServerResume(){
    try{
      if(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage){
        chrome.runtime.sendMessage({ type:"RL_SERVER_RESUME" }, function(){ /* no panel listener */ });
      }
    }catch(err){ /* ignore */ }
  }

  function handleBridgeServerStop(remote){
    if(bridgeServerStopped && remote) return;
    var wasStopped = bridgeServerStopped;
    bridgeServerStopped = true;
    bridgeConnected = false;
    bridgeLastHeard = 0;
    companionPresence = { checked:true, open:false, mode:"", port:companionPresence.port || 0, origin:"", lastAt:Date.now() };
    bridgeConflict = false;
    bridgePeerHello = null;
    bridgePeerProjectId = "";
    bridgePeerLedgerId = "";
    bridgePeerRequestCount = 0;
    bridgeProjectMismatch = false;
    updateBridgeUI();
    if(!remote) bridgeBroadcastServerStop();
    if(!wasStopped && role === "dock") toast(lx("bridgeServerStopped"), "error");
  }

  function clearBridgeServerStop(remote){
    if(!bridgeServerStopped) return;
    bridgeServerStopped = false;
    bridgeLedgerSynced = false;
    updateBridgeUI();
    if(!remote) bridgeBroadcastServerResume();
  }

  function onBridgeHostMessage(data){
    if(!data || typeof data !== "object") return;
    if(data.source !== "request-ledger-host") return;
    if(typeof data.pageOrigin === "string" && bridgeAllowedOrigin(data.pageOrigin)) bridgePageOrigin = data.pageOrigin;
    if(data.type === "RL_BRIDGE_CONTEXT"){
      panelPageToken = typeof data.pageToken === "string" ? data.pageToken : "";
      return;
    }
    if(data.type === "RL_APP_SERVER_STOP"){
      handleBridgeServerStop(false);
      return;
    }
    if(data.type === "RL_APP_HELLO" || data.type === "RL_APP_SNAPSHOT" ||
       data.type === "RL_APP_PATCH" || data.type === "RL_APP_ACK" ||
       data.type === "RL_APP_MEDIA" || data.type === "RL_APP_MEDIA_REQUEST"){
      if(bridgePeerVersionMismatch(data)){
        bridgePeerOutdated = true;
        bridgeNoteOutdated();
        updateBridgeUI();
        return;
      }
      bridgePeerOutdated = false;
    }
    if(data.type === "RL_APP_MEDIA"){
      bridgeHandleMedia(data);
      return;
    }
    if(data.type === "RL_APP_MEDIA_REQUEST"){
      var mediaIds = {};
      (Array.isArray(data.ids) ? data.ids : []).slice(0, 100).forEach(function(value){ mediaIds[String(value)] = true; });
      (app && Array.isArray(app.requests) ? app.requests : []).forEach(function(req){
        (Array.isArray(req.images) ? req.images : []).forEach(function(img){
          if(mediaIds["image:" + img.id]) bridgeSendMediaItem(req, img, "image", true);
        });
        (Array.isArray(req.attachments) ? req.attachments : []).forEach(function(att){
          if(mediaIds["file:" + att.id]) bridgeSendMediaItem(req, att, "file", true);
        });
      });
      return;
    }
    if(bridgeServerStopped){
      /* Only a fresh app boot (HELLO) proves the server is back. */
      if(data.type !== "RL_APP_HELLO") return;
      clearBridgeServerStop(false);
    }
    bridgeStats.received++;
    if(data.type === "RL_APP_TABS_REQUEST"){
      if(!bridgeAllowedOrigin(data.pageOrigin)) return;
      handleAppTabsRequest(data);
      return;
    }
    if(data.type === "RL_APP_PICK_REQUEST"){
      if(!bridgeAllowedOrigin(data.pageOrigin)) return;
      handleAppPickRequest(data);
      return;
    }
    if(data.type === "RL_APP_PICK_CANCEL"){
      if(!bridgeAllowedOrigin(data.pageOrigin)) return;
      handleAppPickCancel(data);
      return;
    }
    if(data.type === "RL_APP_CAPTURE_REQUEST"){
      if(!bridgeAllowedOrigin(data.pageOrigin)) return;
      handleAppCaptureRequest(data);
      return;
    }
    if(data.type === "RL_APP_CAPTURE_CANCEL"){
      if(!bridgeAllowedOrigin(data.pageOrigin)) return;
      handleAppCaptureCancel(data);
      return;
    }
    if(data.type === "RL_APP_HELLO"){ handleBridgeHello(data); return; }
    if(data.type === "RL_APP_PATCH"){ handleBridgePatch(data); return; }
    if(data.type === "RL_APP_ACK"){ handleBridgeAck(data); return; }
    if(data.type === "RL_APP_BYE"){ handleBridgeBye(); return; }
    if(data.type === "RL_APP_SNAPSHOT"){ handleBridgeHello(data); return; }
  }

  /* ---------- first-connect decision / status UI ---------- */

  function bridgeChoiceApp(){
    if(!bridgePeerHello){ bridgeConflict = false; updateBridgeUI(); return; }
    var peer = bridgePeerHello;
    bridgeSuppress++;
    try{
      bridgePeerLedgerId = typeof peer.ledgerId === "string" ? peer.ledgerId : bridgePeerLedgerId;
      bridgePeerRequestCount = Array.isArray(peer.requests) ? peer.requests.length : 0;
      bridgeApply(peer, "replace");
      bridgeConflict = false;
      bridgePeerHello = null;
      bridgeLedgerSynced = true;
      bridgePost("RL_APP_ACK", { conflict:false, resolution:"app", ledgerId:app.ledgerId, requestState:true });
    }finally{
      bridgeSuppress--;
    }
    updateBridgeUI();
  }

  function bridgeChoiceExtension(){
    bridgeConflict = false;
    bridgePeerHello = null;
    bridgeLedgerSynced = true;
    if(typeof setProjectLedgerId === "function") setProjectLedgerId(activeProjectId, app.ledgerId);
    bridgePost("RL_APP_ACK", { conflict:false, resolution:"extension", ledgerId:app.ledgerId });
    bridgePost("RL_APP_SNAPSHOT", { resolution:"extension" });
    updateBridgeUI();
  }

  function updateBridgeUI(){
    var status = document.getElementById("rl-bridge-status");
    var text = document.getElementById("rl-bridge-text");
    var confirm = document.getElementById("rl-bridge-confirm");
    var mismatch = bridgeProjectMismatch || (!!bridgePeerProjectId && !!activeProjectId && bridgePeerProjectId !== activeProjectId);
    if(status){
      status.classList.toggle("is-on", bridgeConnected && !bridgeServerStopped && !bridgeConflict && !mismatch);
      status.classList.toggle("is-off", !bridgeConnected || bridgeServerStopped);
      status.classList.toggle("is-warn", bridgeConflict || mismatch);
      if(text) text.textContent = bridgeServerStopped
        ? lx("bridgeServerStopped")
        : bridgeConflict
          ? lx("bridgeConflictShort")
          : bridgePeerOutdated ? lx("bridgeOutdated")
          : mismatch ? lx("bridgeDifferentProject")
          : bridgeConnected ? lx("bridgeConnected") : lx("bridgeOffline");
    }
    if(confirm) confirm.hidden = !bridgeConflict;
    var appBtn = document.getElementById("rl-bridge-use-app");
    var extBtn = document.getElementById("rl-bridge-use-extension");
    if(appBtn) appBtn.disabled = !bridgeConflict;
    if(extBtn) extBtn.disabled = !bridgeConflict;
    if(typeof updateCompanionLock === "function") updateCompanionLock();
  }

  function bridgeWatch(){
    if(bridgeWatchTimer){ clearInterval(bridgeWatchTimer); bridgeWatchTimer = null; }
    bridgeWatchTimer = setInterval(function(){
      if(!bridgeConnected) return;
      /* A backgrounded app tab throttles the page heartbeat; a hidden panel
         must not declare the bridge dead just because it is not focused. */
      if(document.visibilityState === "hidden") return;
      if(Date.now() - bridgeLastHeard > BRIDGE_STALE_MS){
        bridgeConnected = false;
        updateBridgeUI();
      }
    }, 2500);
  }

  /* Called by the panel when the user opens another project. If the new
     project matches the app's last announced project id, send the full
     snapshot; otherwise announce only the project so the app can show the
     mismatch without receiving another project's ledger. */
  function bridgeAnnounceProject(){
    if(!hasHost || !activeProjectId || bridgeAdoptingProject) return;
    var aligned = !!bridgePeerProjectId && bridgePeerProjectId === activeProjectId;
    bridgeConflict = false;
    bridgePeerHello = null;
    if(!aligned){
      bridgePeerLedgerId = "";
      bridgePeerRequestCount = 0;
    }
    bridgeLedgerSynced = aligned;
    bridgeProjectMismatch = !aligned;
    bridgeLoadTombstones();
    bridgeResetKnownIds();
    if(aligned){
      bridgePost("RL_APP_SNAPSHOT", { projectSwitch:true });
    }else{
      bridgePost("RL_APP_SNAPSHOT", {
        projectSwitch:true,
        requests:[],
        agents:[],
        deletedIds:[]
      });
    }
    updateBridgeUI();
  }

  /* The panel can be edited on another tab (its own extension storage is
     shared). When this tab becomes visible or the storage changes, reload the
     active project's ledger and push it through the bridge. No section is
     opened or re-rendered while closed. */
  function bridgeRefreshFromStorage(){
    if(!hasHost || bridgeSuppress || bridgeAdoptingProject) return;
    /* A local edit may still be inside the 380 ms save debounce, and a bridge
       apply just wrote a newer revision. Reloading storage in either window
       would overwrite the in-flight confirmation with the previous snapshot. */
    if(typeof saveTimer !== "undefined" && saveTimer) return;
    if(state.saving === "saving") return;
    if(Date.now() < bridgeRefreshHoldUntil) return;
    if(typeof storageOk !== "undefined" && !storageOk) return;
    /* A panel that mounted before the app created or selected a project still
       needs to adopt it. Project-registry storage events are the only signal a
       plain page gets (there is no bridge HELLO on that tab). Adoption is data
       only and never opens a section. */
    if(!activeProjectId){
      var registry = readRegistry();
      var nextId = registry && registry.activeId;
      if(nextId && findProjectRecordIn(registry, nextId)){
        openProjectById(nextId, { preserveSection:true });
      }
      return;
    }
    /* A pick/capture result is being written; do not reload the old ledger
       over it while the panel returns from the overlay. */
    if(typeof pickPending !== "undefined" && pickPending) return;
    if(typeof capturePending !== "undefined" && capturePending) return;
    if(Date.now() < panelToolBusyUntil) return;
    var before = bridgeStateSignature();
    var projectId = activeProjectId;
    /* Load data-only first: a no-op storage event must not rebuild the
       focused section. Render only when the signature actually changed. */
    reloadSharedState(projectId, true);
    if(bridgeStateSignature() === before) return;
    if(role === "flyout" && state.section === "list"){
      updateList();
      renderArchiveProjectTree();
    }else if(role === "flyout" && state.section){
      renderFlyout(state.section);
    }
    /* Do not push local data over a different same-project app ledger while
       both sides hold requests. The user must choose; otherwise a storage
       refresh from the source ledger would silently overwrite the app. An
       empty local side may still adopt the non-empty peer. */
    if(bridgeConflict || (bridgePeerLedgerId && app.ledgerId &&
       String(bridgePeerLedgerId) !== String(app.ledgerId) &&
       bridgePeerRequestCount > 0 && app.requests.length > 0)){
      return;
    }
    bridgeNotifyChange();
  }

  function initAppBridge(){
    if(!hasHost) return;
    if(role !== "dock" && role !== "flyout") return;
    bridgeLoadTombstones();
    bridgeResetKnownIds();
    if(app && (app.requests.length > 0 || String(app.project || "").trim())) bridgeLedgerSynced = true;
    window.addEventListener("storage", function(event){
      if(!event || !event.key) return;
      if(event.key === PROJECTS_KEY){
        projectRegistry = readRegistry();
        if(typeof syncProjectGate === "function") syncProjectGate(true);
        if(typeof refreshProjectViews === "function") refreshProjectViews();
        bridgeRefreshFromStorage();
      }else if(activeProjectId && event.key === projectLedgerKey(activeProjectId)){
        bridgeRefreshFromStorage();
      }
    });
    document.addEventListener("visibilitychange", function(){
      if(document.visibilityState === "visible") bridgeRefreshFromStorage();
    });
    window.addEventListener("focus", bridgeRefreshFromStorage);
    window.addEventListener("pageshow", bridgeRefreshFromStorage);
    bridgeWatch();
    /* Advertise our ledger once the panel is ready. The host drops this on
       non-allowlisted pages, so no data leaves the two approved origins. */
    setTimeout(function(){ bridgePost("RL_APP_SNAPSHOT"); }, 120);
    startCompanionProbe();
    if(!pendingFocusListenerOn){
      window.addEventListener("focus", flushPendingFlyoutFocus);
      pendingFocusListenerOn = true;
    }
    try{
      window.__rlBridgePanel = Object.freeze({
        connected:function(){ return bridgeConnected; },
        serverStopped:function(){ return bridgeServerStopped; },
        outdated:function(){ return bridgePeerOutdated; },
        version:function(){ return bridgePanelVersion(); },
        versions:function(){ return { peer:bridgePeerVersionSeen, mine:bridgePanelVersion(), own:bridgeVersionKey(bridgePanelVersion()), peerKey:bridgeVersionKey(bridgePeerVersionSeen) }; },
        conflict:function(){ return bridgeConflict; },
        conflictInfo:function(){ return bridgeConflictInfo; },
        rejects:function(){ return bridgeRejects.slice(); },
        projectId:function(){ return activeProjectId || ""; },
        projectName:function(){ return app && typeof app.project === "string" ? app.project : ""; },
        mismatch:function(){ return bridgeProjectMismatch || (!!bridgePeerProjectId && !!activeProjectId && bridgePeerProjectId !== activeProjectId); },
        ledgerId:function(){ return app && app.ledgerId ? app.ledgerId : ""; },
        stats:function(){ return { sent:bridgeStats.sent, patches:bridgeStats.patches, received:bridgeStats.received, applied:bridgeStats.applied, echoes:bridgeStats.echoes }; },
        pageToken:function(){ return panelPageToken; },
        pageOrigin:function(){ return bridgePageOrigin; },
        tabId:function(){ return panelTabScope; },
        requests:function(){
          return app && Array.isArray(app.requests) ? app.requests.map(function(req){
            return { id:req.id, images:(req.images || []).length, attachments:(req.attachments || []).length,
              confirmed:req.confirmed === true, updatedAt:req.updatedAt || "" };
          }) : [];
        },
        presence:function(){ return { checked:companionPresence.checked, open:companionPresence.open, mode:companionPresence.mode, port:companionPresence.port }; },
        locked:function(){ return companionOverlayLocked(); }
      });
    }catch(err){ /* ignore */ }
  }

  function handleRowAction(action, element){
    var host = element && element.closest ? element.closest("[data-request-id]") : null;
    var id = host ? host.getAttribute("data-request-id") : null;
    if(!action || !id) return;
    if(action === "duplicate"){ duplicateRequestRow(id); return; }
    if(action === "up"){ moveRequestRow(id, -1); return; }
    if(action === "down"){ moveRequestRow(id, 1); return; }
    if(action === "delete"){ openDeleteConfirmRow(id); return; }
    if(action === "delete-confirm"){ confirmDeleteRow(id); return; }
    if(action === "delete-cancel"){ cancelDeleteRow(); return; }
  }

  function handleRecordAction(action, element){
    var host = element && element.closest ? element.closest("[data-record-id]") : null;
    var id = host ? host.getAttribute("data-record-id") : null;
    var kind = host ? (host.getAttribute("data-record-kind") || archiveTab) : archiveTab;
    if(!action || !id) return;

    if(action === "open"){ openArchiveRecord(kind, id); return; }
    if(action === "rename"){
      if(kind !== "records") return;
      archiveRenameId = archiveRenameId === id ? null : id;
      archiveDelete = null;
      refreshArchiveViews();
      applyArchiveTab();
      return;
    }
    if(action === "delete"){
      archiveDelete = { kind:kind, id:id };
      archiveRenameId = null;
      refreshArchiveViews();
      return;
    }
  }

  function handleArchiveAction(action){
    if(action === "clear-records" || action === "clear-drafts" || action === "clear-history"){
      archiveClear = action.slice(6);
      archiveDelete = null;
      archiveRenameId = null;
      refreshArchiveViews();
      return;
    }
    if(action === "clear-confirm"){ clearArchiveCollection(); return; }
    if(action === "clear-cancel"){
      archiveClear = null;
      refreshArchiveViews();
      return;
    }
    if(action === "delete-confirm"){ deleteArchiveItem(); return; }
    if(action === "delete-cancel"){
      archiveDelete = null;
      refreshArchiveViews();
      return;
    }
    if(action === "rename-save"){ saveArchiveRename(); return; }
    if(action === "rename-cancel"){
      archiveRenameId = null;
      refreshArchiveViews();
      return;
    }
    if(action === "dup-overwrite"){ duplicateOverwrite(); return; }
    if(action === "dup-new"){ duplicateCreateNew(); return; }
    if(action === "dup-cancel"){ cancelDuplicatePrompt(); return; }
    if(action === "detail-back"){
      archiveDetail = null;
      refreshArchiveViews();
      return;
    }
  }

  function handleFlyoutAction(actionEl){
    var action = actionEl.getAttribute("data-act");

    if(action === "create"){ createRequest(); return; }
    if(action === "save-project"){ saveProjectName(); return; }
    if(action === "close-section"){ requestClose(); return; }
    if(action === "save-section"){ saveSection(); return; }
    if(action === "unlock"){ unlockRequest(); return; }
    if(action === "save-draft"){ saveDraftAndClose(); return; }
    if(action === "delete"){ deleteRequestAndClose(); return; }
    if(action === "cancel-confirm"){
      cancelConfirm = false;
      renderFlyout(state.section || "desc");
      return;
    }
    if(action === "add-image"){
      var imgInput = document.getElementById("rl-img-input");
      if(imgInput && !imgInput.disabled) imgInput.click();
      return;
    }
    if(action === "capture-open"){ panelReturnFocusId = "rl-capture-open"; startCaptureFromActiveTab(); return; }
    if(action === "pick-element"){ panelReturnFocusId = "rl-pick-element"; startElementPickFromActiveTab(false); return; }
    if(action === "pick-capture"){ panelReturnFocusId = "rl-pick-capture"; startElementPickFromActiveTab(true); return; }
    if(action === "console-fetch"){
      fetchConsoleErrors(actionEl);
      return;
    }
    if(action === "remove-image"){
      removeImage(actionEl.getAttribute("data-image-ref"));
      return;
    }
    if(action === "add-file"){
      var fileInput = document.getElementById("rl-file-input");
      if(fileInput && !fileInput.disabled) fileInput.click();
      return;
    }
    if(action === "remove-file"){
      removeFile(actionEl.getAttribute("data-att-ref"));
      return;
    }
    if(action === "ready"){ handleReady(); return; }
    if(action === "goto-new"){
      sendAction("goto", { section:"new" });
      return;
    }
    if(action === "toggle-tp"){
      tpOpen = !tpOpen;
      var pop = document.getElementById("rl-tp-pop");
      if(pop) pop.hidden = !tpOpen;
      actionEl.setAttribute("aria-expanded", tpOpen ? "true" : "false");
      return;
    }
    if(action === "row-menu"){
      var rowHost = actionEl.closest ? actionEl.closest("[data-request-id]") : null;
      toggleRowMenu(rowHost ? rowHost.getAttribute("data-request-id") : null);
      return;
    }
    if(action === "open-request"){
      var openHost = actionEl.closest ? actionEl.closest("[data-request-id]") : null;
      if(openHost) selectRequest(openHost.getAttribute("data-request-id"));
      return;
    }
    if(action === "jump-incomplete"){ jumpToIncomplete(); return; }
    if(action === "clear-filters"){ clearListFilters(); return; }
    if(action === "save-record"){ saveRecordSnapshot(); return; }
    if(action === "exp-open"){ requestExport(); return; }
    if(action === "exp-cancel"){ closeExportWizard(); return; }
    if(action === "exp-back"){
      if(exportWizard && exportWizard.step === 2){
        exportWizard.step = 1;
        exportWizard.slide = "prev";
        rerenderExportWizard();
      }
      return;
    }
    if(action === "exp-next"){ advanceExportStep(); return; }
    if(action === "open-warning"){
      var warnId = actionEl.getAttribute("data-export-warning");
      if(warnId){
        exportWizard = null;
        exportCleanup = null;
        selectRequest(warnId);
      }
      return;
    }
    if(action === "exp-run"){ runExport(); return; }
    if(action === "exp-settings"){
      exportWizard = null;
      exportCleanup = null;
      sendAction("goto", { section:"settings" });
      return;
    }
    if(action === "exp-clear-requests"){ clearExportedRequests(); return; }
    if(action === "exp-keep-requests"){
      exportCleanup = null;
      renderFlyout("list");
      return;
    }
    if(action === "backup-zip"){ runBackupDownload("zip"); return; }
    if(action === "backup-restore"){
      var backupInput = document.getElementById("rl-backup-input");
      if(backupInput && !backupInput.disabled) backupInput.click();
      return;
    }
    if(action === "backup-clear"){
      if(backupBusy) return;
      backupPending = { kind:"clear" };
      renderBackupConfirm();
      setBackupStatus(lx("confirmPending"), "pending");
      return;
    }
    if(action === "backup-confirm"){ confirmBackup(); return; }
    if(action === "backup-cancel"){ cancelBackup(); return; }
    if(action === "settings-reset"){ resetSystemSettings(); return; }
    if(action === "bridge-use-app"){ bridgeChoiceApp(); return; }
    if(action === "bridge-use-extension"){ bridgeChoiceExtension(); return; }
    if(action === "agent-add"){ addAgent(); return; }
    if(action === "agent-remove"){
      removeAgent(actionEl.getAttribute("data-agent-remove"));
      return;
    }
  }

  function markChipGroup(btn, groupSelector){
    var wrap = btn.parentNode;
    if(!wrap) return;
    var nodes = wrap.querySelectorAll(groupSelector === ".tygrid" ? "[data-type]" : "[data-priority]");
    for(var i = 0; i < nodes.length; i++){
      nodes[i].classList.remove("on");
      nodes[i].setAttribute("aria-pressed", "false");
    }
    btn.classList.add("on");
    btn.setAttribute("aria-pressed", "true");
  }

  /* paste images while the description or combined detail section is open */
  function onPaste(event){
    if(role !== "flyout" || (state.section !== "desc" && state.section !== "detail")) return;
    var req = activeRequest();
    if(!req || isLocked(req)) return;
    var data = event.clipboardData;
    if(!data || !data.items) return;
    var files = [];
    for(var i = 0; i < data.items.length; i++){
      var item = data.items[i];
      if(item && item.kind === "file" && String(item.type || "").indexOf("image/") === 0){
        var file = item.getAsFile ? item.getAsFile() : null;
        if(file) files.push(file);
      }
    }
    if(files.length){
      event.preventDefault();
      queueImages(files);
    }
  }

  function initFlyout(){
    var card = document.createElement("section");
    card.className = "card flyout-card";
    card.id = "rl-flyout-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-labelledby", "rl-fo-title");
    card.hidden = true;

    var top = document.createElement("header");
    top.className = "fo-top";

    var title = document.createElement("b");
    title.id = "rl-fo-title";

    var chip = document.createElement("span");
    chip.className = "id";
    chip.id = "rl-fo-chip";
    chip.hidden = true;

    var close = document.createElement("button");
    close.type = "button";
    close.className = "x";
    close.id = "rl-fo-close";
    close.textContent = "×";
    close.setAttribute("aria-label", t("Kapat"));
    close.addEventListener("click", requestClose);

    top.appendChild(title);
    top.appendChild(chip);
    top.appendChild(close);

    var body = document.createElement("div");
    body.className = "fo-body";
    body.id = "rl-fo-body";
    body.tabIndex = -1;

    var foot = document.createElement("footer");
    foot.className = "fo-foot";
    foot.id = "rl-fo-foot";

    var toasts = document.createElement("div");
    toasts.className = "toasts";
    toasts.id = "rl-toasts";
    toasts.setAttribute("aria-live", "polite");

    /* the scroller stays the body; the toast floats above the footer
       without ever sitting in the layout flow */
    var bodyWrap = document.createElement("div");
    bodyWrap.className = "fo-body-wrap";
    bodyWrap.appendChild(body);
    bodyWrap.appendChild(toasts);

    card.appendChild(top);
    card.appendChild(buildStorageBanner());
    card.appendChild(bodyWrap);
    card.appendChild(foot);
    document.body.appendChild(card);

    els.card = card;
    els.title = title;
    els.chip = chip;
    els.body = body;
    els.foot = foot;

    /* v9: ask the host for the viewport budget before the first section
       renders; the host may have sent it before this listener existed. */
    postPanel("RL_FLYOUT_READY", {});

    if(pendingArrowY != null){
      card.style.setProperty("--arrow-y", pendingArrowY + "px");
      pendingArrowY = null;
    }

    body.addEventListener("input", onBodyInput);
    body.addEventListener("change", onBodyChange);
    body.addEventListener("click", onBodyClick);
    body.addEventListener("keydown", onBodyKeydown);
    body.addEventListener("scroll", updateScrollAffordance, { passive:true });
    foot.addEventListener("click", onBodyClick);
    document.addEventListener("paste", onPaste);

    /* object URLs must not outlive the document */
    window.addEventListener("pagehide", revokeThumbs);
    window.addEventListener("beforeunload", revokeThumbs);

    /* shell v12 §4: when the host caps the iframe to the menu-button space,
       shrink the body budget to that real height instead of clipping the card.
       The iframe is also resized for every height the panel reports, so a
       resize event can still carry the *previous* section's height. Only adopt
       a cap that is still in place once the layout has settled, otherwise the
       budget would collapse to a transient height and never recover. */
    var flyoutCapTimer = 0;
    window.addEventListener("resize", function(){
      if(role !== "flyout" || !els.card) return;
      if(flyoutCapTimer){ clearTimeout(flyoutCapTimer); flyoutCapTimer = null; }
      flyoutCapTimer = setTimeout(function(){
        flyoutCapTimer = null;
        if(role !== "flyout" || !els.card) return;
        var ih = window.innerHeight || 0;
        var cardH = Math.ceil(els.card.getBoundingClientRect().height);
        if(ih > 120 && cardH > ih + 1 && ih < flyoutMaxAvailable){
          flyoutMaxAvailable = ih;
          applyFlyoutMax();
          lastSize = -1;
          reportSize();
        }
      }, 150);
    });

    /* close an open row menu / inline delete confirm / type popover on an outside click */
    document.addEventListener("click", function(event){
      var el = event.target;
      if(tpOpen && el && typeof el.closest === "function" && !el.closest(".tp-wrap")){
        tpOpen = false;
        var pop = document.getElementById("rl-tp-pop");
        if(pop) pop.hidden = true;
        var summary = document.querySelector(".tp-summary");
        if(summary) summary.setAttribute("aria-expanded", "false");
      }
      if(!openRowMenuId && !listDeleteId) return;
      if(el && typeof el.closest === "function" &&
        (el.closest('[data-act="row-menu"]') || el.closest(".rowmenu") || el.closest(".row-confirm"))) return;
      openRowMenuId = null;
      listDeleteId = null;
      if(state.section === "list") updateList();
    });

    document.addEventListener("keydown", function(event){
      if(event.key !== "Escape") return;
      if(document.getElementById("rl-project-settings")){
        event.preventDefault();
        closeProjectSettingsModal();
        return;
      }
      if(imagePreview){
        event.preventDefault();
        closeImagePreview();
        return;
      }
      if(tabPicker){
        event.preventDefault();
        closeTabPicker();
        return;
      }
      if(openSelWrap){
        event.preventDefault();
        closeOpenSelect(true);
        return;
      }
      if(!state.section) return;
      if(exportWizard){
        event.preventDefault();
        closeExportWizard();
        return;
      }
      if(exportCleanup){
        event.preventDefault();
        exportCleanup = null;
        renderFlyout("list");
        return;
      }
      if(backupPending && state.section === "backup"){
        event.preventDefault();
        cancelBackup();
        return;
      }
      if(tpOpen){
        event.preventDefault();
        tpOpen = false;
        var pop = document.getElementById("rl-tp-pop");
        if(pop) pop.hidden = true;
        var summary = document.querySelector(".tp-summary");
        if(summary) summary.setAttribute("aria-expanded", "false");
        return;
      }
      if(openRowMenuId || listDeleteId){
        event.preventDefault();
        openRowMenuId = null;
        listDeleteId = null;
        if(state.section === "list") updateList();
        return;
      }
      if(duplicatePrompt || archiveDelete || archiveClear || archiveRenameId || archiveDetail){
        event.preventDefault();
        duplicatePrompt = null;
        archiveDelete = null;
        archiveClear = null;
        archiveRenameId = null;
        archiveDetail = null;
        refreshArchiveViews();
        return;
      }
      event.preventDefault();
      requestClose();
    });

    window.addEventListener("message", onHostMessage);

    if(typeof ResizeObserver !== "undefined"){
      var observer = new ResizeObserver(function(){ reportSize(); });
      observer.observe(card);
    }

    if(demo){
      if(pendingSection){
        var pending = pendingSection;
        pendingSection = null;
        showSection(pending);
      }else{
        var section = params.get("section") || "new";
        if(isKnownSection(section)) showSection(section);
      }
    }else if(pendingSection){
      var queued = pendingSection;
      pendingSection = null;
      showSection(queued);
    }

    broadcastState();
  }

  /* ---------- boot ---------- */

  function init(){
    applyTheme("system"); /* no flash while storage resolves */
    watchSystemTheme();
    document.body.classList.add("role-" + role);
    if(!hasHost) document.documentElement.classList.add("standalone");
    openChannel();
    watchStoragePrefs();
    initRuntimeBridge();
    if(!core){
      console.warn("[rl-panel] IstekCore not found; strings render untranslated.");
    }

    readPrefs().then(function(prefs){
      applyThemeAndLanguage(prefs);
      return bootApp(prefs);
    }).then(function(){
      if(role === "dock") initDock();
      else initFlyout();
      document.documentElement.classList.add("is-ready");
      initAppBridge();
    }).catch(function(){
      app = app || defaultApp();
      if(role === "dock") initDock();
      else initFlyout();
      document.documentElement.classList.add("is-ready");
      initAppBridge();
    });
  }

  window.RLPanel = {
    role: role,
    setTheme: setTheme,
    setMode: requestMode,
    setLanguage: setLanguage,
    ready: triggerReady,
    cancel: triggerCancel,
    openDock: function(){ openDock(); },
    closeDock: function(){ closeDock(); },
    togglePin: function(){ togglePin(); },
    pinned: function(){ return !!state.pinned; },
    dockState: function(){ return state.dock; },
    isDragging: function(){ return isDraggingRail(); },
    dragHandle: function(){
      if(!els.dragHandle) return null;
      var rect = els.dragHandle.getBoundingClientRect();
      return {
        x:rect.x, y:rect.y, left:rect.left, top:rect.top,
        right:rect.right, bottom:rect.bottom,
        width:rect.width, height:rect.height
      };
    },
    open: function(section){
      if(!isKnownSection(section)) return;
      if(role === "dock"){
        if(!els.card){
          pendingSection = section;
          pendingDock = "open";
          return;
        }
        if(state.dock !== "open") openDock();
        var btn = els.card.querySelector('.item[data-section="' + section + '"]');
        if(btn) openSection(section, btn);
      }else{
        if(!els.card){
          pendingSection = section;
          return;
        }
        showSection(section);
      }
    },
    close: function(){
      if(role === "dock" && els.card) closeSection();
    }
  };

  /* direct globals as promised by the phase-1 API */
  window.setTheme = setTheme;
  window.setMode = requestMode;

  init();
})();
