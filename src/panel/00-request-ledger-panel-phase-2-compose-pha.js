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
    project:  { id:"project",  labelKey:"newProject", titleKey:"newProjectTitle", primary:true },
    projects: { id:"projects", labelKey:"projects", titleKey:"projects", iconKey:"folder" },
    detail:   { id:"detail",   label:"İstek",      title:"İstek",        iconKey:"doc",      badge:true },
    page:     { id:"page",     label:"Sayfa",      title:"Sayfa",        iconKey:"folder",   badge:true },
    desc:     { id:"desc",     label:"Açıklama",   title:"Açıklama",     iconKey:"doc",      badge:true },
    export:   { id:"export",   label:"Hazır",      title:"Hazır",        iconKey:"check",    ready:true, hook:"ready" },
    settings: { id:"settings", label:"Ayarlar",    title:"Ayarlar",      iconKey:"settings" },
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
    projectDeleteMsg:{ tr:"Bu projedeki tüm talepler, görseller, kayıtlar, taslaklar ve dışa aktarılanlar kalıcı olarak silinecek. Bu işlem geri alınamaz.", en:"Every request, image, record, draft and export in this project will be permanently deleted. This action cannot be undone." },
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
    quotaExceeded:{ tr:"Depolama alanı doldu. Görsel eklenemedi.", en:"Storage is full. The image could not be added." },

    /* live bridge (web app <-> extension) */
    bridgeTitle: { tr:"Canlı bağlantı", en:"Live connection" },
    bridgeConnected:{ tr:"Uygulamaya bağlı", en:"Connected to app" },
    bridgeOffline:{ tr:"Uygulama açık değil", en:"App not open" },
    bridgeConflictShort:{ tr:"Defter seçimi bekliyor", en:"Ledger choice pending" },
    bridgeDifferentProject:{ tr:"Farklı proje açık", en:"Different project open" },
    bridgeServerStopped:{ tr:"Uygulama sunucusu durduruldu", en:"App server stopped" },
    companionLockTitle:{ tr:"Uzantıyı kullanmak için Request Ledger uygulamasını aç", en:"Open the Request Ledger app to use the extension" },
    companionLockBody:{ tr:"Uzantı uygulamayla birlikte çalışır. Uygulama kapalıyken düzenleme, dışa aktarma ve yedekleme kilitlidir.", en:"The extension works with the app. Editing, export and backup are locked while the app is closed." },
    companionChecking:{ tr:"Uygulama aranıyor…", en:"Looking for the Request Ledger app…" },
    companionRetry:{ tr:"Yeniden kontrol et", en:"Check again" },
    companionDraftDiscarded:{ tr:"Uygulama kapandı; gönderilmemiş taslak atıldı.", en:"The app closed; the unsent draft was discarded." },
    bridgeConflictTitle:{ tr:"İki defter bulundu", en:"Two ledgers found" },
    bridgeConflictHint:{ tr:"Uygulama ve uzantı farklı defterler içeriyor. Hangisi kullanılsın? Uygulamadaki defter varsayılandır.", en:"The app and the extension hold different ledgers. Which one should be used? The app ledger is the default." },
    bridgeUseApp:{ tr:"Uygulamadaki defter", en:"Use app ledger" },
    bridgeUseExtension:{ tr:"Uzantıdaki defter", en:"Use extension ledger" },
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
    backupZipSub:{ tr:"Talepler + Kayıtlar + görseller + dosya ekleri. Başka bir tarayıcıya taşımak için en güvenli yol.", en:"Requests + Records + images + attachments. The safest way to move to another browser." },
    backupJson:  { tr:"Metin yedeği indir (.json)", en:"Download text backup (.json)" },
    backupJsonSub:{ tr:"Talep ve Kayıt metinleri. Görseller ve dosya ekleri bu dosyaya dahil edilmez.", en:"Request and Record texts. Images and attachments are not included in this file." },
    backupRestore:{ tr:"Yedekten yükle", en:"Restore from backup" },
    backupRestoreSub:{ tr:".zip veya .json dosyası seç. v3 yedekleri tek projeye, v4 yedekleri tüm projelere geri yüklenir.", en:"Choose a .zip or .json file. v3 backups restore into one project; v4 backups restore every project." },
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
    clearProject:{ tr:"Proje verilerini temizle", en:"Clear project data" },
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
    folderNote:  { tr:"Uzantı dosya sistemine erişemez; çıktılar tarayıcının indirme klasörüne kaydedilir. Klasör seçimi tarayıcı tarafından yönetilir.", en:"The extension has no filesystem access; output goes to the browser download folder. Folder selection is managed by the browser." },
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
    helpStep8Text:{ tr:"Yedek bölümünden ZIP veya JSON yedeği indir. Yedekler dil, tema, ajanlar ve defter kimliği dahil güncel ayarları içerir.", en:"Download a ZIP or JSON backup from the Backup section. Backups include current settings such as language, theme, agents and ledger ID." },
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
