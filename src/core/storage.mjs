/*
  Persistence adapters: localStorage state/theme and IndexedDB stores.

  Ported verbatim from the previous monolithic core (v1.9.1). init() opens the database
  lazily; every store call is a no-op or an in-memory failure when the database is closed,
  exactly as before. Settings (database name/version, state key, theme key) are module
  state so a single instance owns them.
*/

import { DB } from "./constants.mjs";
import { normalizeAgent, normalizeRequest, serializeRequest } from "./model.mjs";
import { newLedgerId, nowISO } from "./util.mjs";

let settings = {
  dbName: DB.name,
  dbVersion: DB.version,
  stateKey: "oz-istek-defteri-v1",
  themeKey: "gd-theme",
  projectId: null
};
let idb = null;

function getLocalStorage(){
  try{
    if(typeof localStorage !== "undefined" && localStorage) return localStorage;
  }catch(err){}
  return null;
}
function openDB(){
  return new Promise(function(resolve, reject){
    if(typeof indexedDB === "undefined" || !indexedDB){
      reject(new Error("IndexedDB yok"));
      return;
    }
    const request = indexedDB.open(settings.dbName, settings.dbVersion);
    request.onupgradeneeded = function(){
      const db = request.result;
      Object.keys(DB.stores).forEach(function(key){
        const store = DB.stores[key];
        if(!db.objectStoreNames.contains(store)){
          db.createObjectStore(store, { keyPath:"id" });
        }
      });
    };
    request.onsuccess = function(){ resolve(request.result); };
    request.onerror = function(){ reject(request.error || new Error("IndexedDB açılamadı")); };
    request.onblocked = function(){ reject(new Error("IndexedDB bloklu")); };
  });
}
function transactionInfo(store, mode, action, errorMessage){
  return new Promise(function(resolve, reject){
    if(!idb){ resolve(null); return; }
    let tx;
    try{ tx = idb.transaction(store, mode); }
    catch(err){ reject(err); return; }
    const objectStore = tx.objectStore(store);
    const request = action ? action(objectStore) : null;
    if(request) request.onsuccess = function(){ resolve(request.result == null ? null : request.result); };
    tx.oncomplete = function(){ if(!request) resolve(); };
    tx.onerror = function(){ reject(tx.error || new Error(errorMessage)); };
    tx.onabort = function(){ reject(tx.error || new Error(errorMessage)); };
  });
}
export function storePut(store, record){
  return new Promise(function(resolve, reject){
    if(!idb){ reject(new Error("IndexedDB kapalı")); return; }
    let tx;
    try{ tx = idb.transaction(store, "readwrite"); }
    catch(err){ reject(err); return; }
    tx.objectStore(store).put(record);
    tx.oncomplete = function(){ resolve(); };
    tx.onerror = function(){ reject(tx.error || new Error("Kayıt yazılamadı")); };
    tx.onabort = function(){ reject(tx.error || new Error("Kayıt yazılamadı")); };
  });
}
function storeGet(store, id){
  return transactionInfo(store, "readonly", function(objectStore){ return objectStore.get(id); }, "Kayıt okunamadı");
}
function storeDelete(store, id){
  return new Promise(function(resolve, reject){
    if(!idb){ resolve(); return; }
    let tx;
    try{ tx = idb.transaction(store, "readwrite"); }
    catch(err){ reject(err); return; }
    tx.objectStore(store).delete(id);
    tx.oncomplete = function(){ resolve(); };
    tx.onerror = function(){ reject(tx.error || new Error("Kayıt silinemedi")); };
  });
}
export function storeClear(store){
  return new Promise(function(resolve, reject){
    if(!idb){ resolve(); return; }
    let tx;
    try{ tx = idb.transaction(store, "readwrite"); }
    catch(err){ reject(err); return; }
    tx.objectStore(store).clear();
    tx.oncomplete = function(){ resolve(); };
    tx.onerror = function(){ reject(tx.error || new Error("Kayıtlar temizlenemedi")); };
  });
}
/* Project scoping is additive: rows written while a project is active carry
   projectId, reads filter on it, and clears delete only that project's rows.
   With no project selected the old global behaviour is preserved so core
   parity and legacy installs keep working. */
function scopedRecord(record){
  if(!settings.projectId || !record || typeof record !== "object") return record;
  if(record.projectId) return record;
  const copy = Object.assign({}, record);
  copy.projectId = settings.projectId;
  return copy;
}
function scopedRows(rows){
  if(!settings.projectId) return rows;
  return rows.filter(function(row){ return row && row.projectId === settings.projectId; });
}
function storeClearScoped(store){
  if(!settings.projectId) return storeClear(store);
  return new Promise(function(resolve, reject){
    if(!idb){ resolve(); return; }
    let tx;
    try{ tx = idb.transaction(store, "readwrite"); }
    catch(err){ reject(err); return; }
    const objectStore = tx.objectStore(store);
    const request = objectStore.openCursor();
    request.onsuccess = function(){
      const cursor = request.result;
      if(!cursor) return;
      if(cursor.value && cursor.value.projectId === settings.projectId) cursor.delete();
      cursor.continue();
    };
    tx.oncomplete = function(){ resolve(); };
    tx.onerror = function(){ reject(tx.error || new Error("Kayıtlar temizlenemedi")); };
    tx.onabort = function(){ reject(tx.error || new Error("Kayıtlar temizlenemedi")); };
  });
}
function storeGetAll(store){
  return new Promise(function(resolve, reject){
    if(!idb){ resolve([]); return; }
    let tx;
    try{ tx = idb.transaction(store, "readonly"); }
    catch(err){ reject(err); return; }
    const request = tx.objectStore(store).getAll();
    request.onsuccess = function(){ resolve(request.result || []); };
    request.onerror = function(){ reject(request.error || new Error("Kayıtlar okunamadı")); };
  });
}
function collectionStore(kind){
  if(kind === "records" || kind === "record") return DB.stores.records;
  if(kind === "drafts" || kind === "draft") return DB.stores.drafts;
  if(kind === "history") return DB.stores.history;
  throw new Error("Bilinmeyen koleksiyon: " + kind);
}

export async function init(opts){
  opts = opts || {};
  if(opts.dbName) settings.dbName = String(opts.dbName);
  if(opts.dbVersion) settings.dbVersion = Number(opts.dbVersion);
  if(opts.stateKey) settings.stateKey = String(opts.stateKey);
  if(opts.themeKey) settings.themeKey = String(opts.themeKey);
  if(Object.prototype.hasOwnProperty.call(opts, "projectId")){
    settings.projectId = opts.projectId ? String(opts.projectId) : null;
  }
  if(idb) return;
  idb = await openDB();
}
export function close(){
  if(idb && typeof idb.close === "function"){
    try{ idb.close(); }catch(err){}
  }
  idb = null;
}
export function loadState(){
  try{
    const ls = getLocalStorage();
    if(!ls) return null;
    const raw = ls.getItem(settings.stateKey);
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    if(!parsed || !Array.isArray(parsed.requests)) return null;
    const state = {
      version: 1,
      project: String(parsed.project || "Projem").trim().slice(0, 60) || "Projem",
      ledgerId: typeof parsed.ledgerId === "string" && parsed.ledgerId ? parsed.ledgerId : newLedgerId(),
      requests: parsed.requests.map(function(req, index){ return normalizeRequest(req, index); }),
      agents: Array.isArray(parsed.agents) ? parsed.agents.map(normalizeAgent) : [],
      language: parsed.language === "tr" ? "tr" : "en",
      exportBehavior: ["last","instant"].indexOf(parsed.exportBehavior) >= 0 ? parsed.exportBehavior : "default",
      lastExport: parsed.lastExport && typeof parsed.lastExport === "object" ? parsed.lastExport : null,
      updatedAt: parsed.updatedAt || null
    };
    let hasOpen = false;
    state.requests.forEach(function(req){
      if(!req.collapsed){
        if(hasOpen) req.collapsed = true;
        else hasOpen = true;
      }
    });
    return state;
  }catch(err){
    return null;
  }
}
export function saveState(state){
  try{
    const ls = getLocalStorage();
    if(!ls || !state) return false;
    const payload = {
      version: 2,
      project: state.project,
      ledgerId: state.ledgerId,
      updatedAt: nowISO(),
      requests: (state.requests || []).map(function(req){ return serializeRequest(req); }),
      agents: (state.agents || []).map(function(agent){ return { id:agent.id, name:agent.name, role:agent.role, mdPath:agent.mdPath }; }),
      language: state.language,
      exportBehavior: state.exportBehavior,
      lastExport: state.lastExport
    };
    ls.setItem(settings.stateKey, JSON.stringify(payload));
    state.updatedAt = payload.updatedAt;
    return true;
  }catch(err){
    return false;
  }
}
export function loadTheme(){
  try{
    const ls = getLocalStorage();
    if(!ls) return null;
    const stored = ls.getItem(settings.themeKey);
    return stored === "dark" || stored === "light" ? stored : null;
  }catch(err){
    return null;
  }
}
export function saveTheme(theme){
  try{
    const ls = getLocalStorage();
    if(!ls) return false;
    ls.setItem(settings.themeKey, theme === "dark" ? "dark" : "light");
    return true;
  }catch(err){
    return false;
  }
}

/* ============================================================
   Media (image / file) — IndexedDB
   ============================================================ */
export function putImage(record){ return storePut(DB.stores.images, scopedRecord(record)); }
export function getImage(id){ return storeGet(DB.stores.images, id); }
export function deleteImage(id){ return storeDelete(DB.stores.images, id); }
export function putFile(record){ return storePut(DB.stores.files, scopedRecord(record)); }
export function getFile(id){ return storeGet(DB.stores.files, id); }
export function deleteFile(id){ return storeDelete(DB.stores.files, id); }
export function clearAllMedia(){
  return Promise.all([storeClearScoped(DB.stores.images), storeClearScoped(DB.stores.files)]).then(function(){ });
}
export function getSetting(id){
  return storeGet(DB.stores.settings, id).then(function(record){
    return record ? record.value : null;
  });
}
export function putSetting(id, value){
  return storePut(DB.stores.settings, { id: id, value: value });
}
export function deleteSetting(id){
  return storeDelete(DB.stores.settings, id);
}
export function listCollection(kind){
  return storeGetAll(collectionStore(kind)).then(scopedRows);
}
export function putCollection(kind, record){
  return storePut(collectionStore(kind), scopedRecord(record));
}
export function deleteCollection(kind, id){
  return storeDelete(collectionStore(kind), id);
}
export function clearCollection(kind){
  return storeClearScoped(collectionStore(kind));
}
export function addHistory(entry){
  const record = Object.assign({}, entry || {});
  if(!record.id) record.id = "hist_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  return storePut(DB.stores.history, scopedRecord(record));
}
export function listHistory(){
  return storeGetAll(DB.stores.history).then(scopedRows);
}
export function clearHistory(){
  return storeClearScoped(DB.stores.history);
}
