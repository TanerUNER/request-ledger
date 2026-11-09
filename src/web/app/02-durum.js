  /* ============================================================
     Durum
     ============================================================ */
  let state = {
    version: 1,
    project: "",
    projectCreated: false,
    ledgerId: "",
    requests: [],
    agents: [],
    language: "en",
    exportBehavior: "default",
    lastExport: null,
    updatedAt: null
  };
  function newLedgerId(){
    return "ledger_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
  }

  let filter = { q:"", type:"all", status:"all" };
  let activeRowId = null;
  let lastExpandedId = null;
  let lastJumpId = null;
  let pendingImageRowId = null;
  let pendingAttachmentRowId = null;
  let saveTimer = null;
  let statusSelectControl = null;
  let openCSelect = null;
  let targetFolderHandle = null;
  let targetFolderNeedsPermission = false;
  /* Workspace state (Phase 1): one registry, one ledger per project. The
     startup screen stays visible until a project is opened. */
  let activeProjectId = null;
  let projectSnapshot = null;
  let projectScreen = "picker";
  let migratedProjectId = null;
  let appBridgeStarted = false;
  /* Phase 2 archive state: the project search, the project selected in the
     archive detail card, the desktop collapse state and the open project
     settings modal. */
  let archiveProjectQuery = "";
  let archiveSelectedProjectId = null;
  let archiveCollapsed = false;
  let projectSettingsId = null;
  let historyItems = [];
  let records = [];
  let drafts = [];
  let historyTab = "history";
  let currentSnapshot = null;
  let currentSnapshotKind = null;
  let rootFolderHandle = null;
  let rootFolderNeedsPermission = false;
  let rootPromptDeclined = false;
  let stateDirtySinceExport = false;
  let toastTimer = null;
  let saveSettingsTimer = null;
  let activeModal = null;
  let lastFocus = null;
  let confirmAction = null;
  let confirmAltAction = null;
  let pendingExportOptions = null;
  let exportStep = 1;
  let planningMode = null;
  let planningAgents = [];
  let planningTest = null;
  let planningRuntime = null;
  let planningTransfers = [];
  let planningQuestion = null;
  let barDismissed = false;
  let idb = null;
  let idbFailed = false;
  let webpSupport = null;
  const imageUrlCache = new Map();
  const processingRows = new Set();
