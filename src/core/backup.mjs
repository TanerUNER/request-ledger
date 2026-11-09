/*
  Backup envelope v3: build, serialise, parse and apply.

  Ported verbatim from the previous monolithic core (v1.9.1). The parse limits (size, request,
  record, draft and agent counts, schema version, foreign app) and the "normalise everything
  before writing anything" order in applyBackup are deliberate data-safety rules.
*/

import { DB } from "./constants.mjs";
import { normalizeAgent, normalizeRequest, isAutoValid, requestStatus, requestsSignature, serializeRequest, typeTemplate } from "./model.mjs";
import { putFile, putImage, storeClear, storePut } from "./storage.mjs";
import {
  attachmentFileName,
  backupMediaFileName,
  formatClock,
  imageFileName,
  newLedgerId,
  nowISO,
  utf8Bytes,
} from "./util.mjs";
import { createZip, parseZip } from "./zip.mjs";

function backupAgents(agents){
  return (agents || []).map(function(agent){ return { id:agent.id, name:agent.name, role:agent.role, mdPath:agent.mdPath }; });
}
function copySnapshot(raw, mapSnapshotRequest){
  const copy = JSON.parse(JSON.stringify(raw || {}));
  copy.requests = (raw && Array.isArray(raw.requests) ? raw.requests : []).map(mapSnapshotRequest);
  return copy;
}
export function buildBackup(payload){
  const data = payload || {};
  const images = [];
  const attachments = [];
  const imageFileById = new Map();
  const attachmentFileById = new Map();
  function mapImage(img){
    let file = imageFileById.get(img.id);
    if(!file){
      file = backupMediaFileName("image", img);
      imageFileById.set(img.id, file);
      images.push({ file: file, img: img });
    }
    return Object.assign({}, img, { file: file });
  }
  function mapAttachment(att){
    let file = attachmentFileById.get(att.id);
    if(!file){
      file = backupMediaFileName("attachment", att);
      attachmentFileById.set(att.id, file);
      attachments.push({ file: file, att: att });
    }
    return Object.assign({}, att, { file: file });
  }
  function mapRequest(req){
    return serializeRequest(req, mapImage, mapAttachment);
  }
  function mapSnapshotRequest(req){
    return serializeRequest(Object.assign({ images: [], attachments: [] }, req), mapImage, mapAttachment);
  }
  const requests = (data.requests || []).map(mapRequest);
  const records = (data.records || []).map(function(record){ return copySnapshot(record, mapSnapshotRequest); });
  const drafts = (data.drafts || []).map(function(draft){ return copySnapshot(draft, mapSnapshotRequest); });
  const backup = {
    app: "istek-defteri",
    version: 3,
    exportedAt: nowISO(),
    project: data.project,
    ledgerId: data.ledgerId,
    agents: backupAgents(data.agents),
    language: data.language,
    exportBehavior: data.exportBehavior,
    lastExport: data.lastExport,
    requests: requests,
    records: records,
    drafts: drafts
  };
  return { backup: backup, images: images, attachments: attachments };
}
export function buildBackupJson(payload){
  const bundle = buildBackup(payload);
  function stripRequest(req){
    const copy = Object.assign({}, req);
    copy.images = [];
    copy.attachments = [];
    return copy;
  }
  function stripSnapshot(snapshot){
    const copy = Object.assign({}, snapshot);
    copy.requests = (snapshot.requests || []).map(stripRequest);
    copy.imageCount = 0;
    copy.fileCount = 0;
    copy.fileName = "";
    copy.rootFolder = "";
    copy.writeError = "";
    return copy;
  }
  const backup = {
    app: "istek-defteri",
    version: 3,
    exportedAt: bundle.backup.exportedAt,
    project: bundle.backup.project,
    ledgerId: bundle.backup.ledgerId,
    agents: bundle.backup.agents,
    language: bundle.backup.language,
    exportBehavior: bundle.backup.exportBehavior,
    lastExport: bundle.backup.lastExport,
    note: "Görseller ve dosya ekleri bu yedeğe dahil değildir. Tam yedek için ZIP kullanın.",
    requests: bundle.backup.requests.map(stripRequest),
    records: bundle.backup.records.map(stripSnapshot),
    drafts: bundle.backup.drafts.map(stripSnapshot)
  };
  return backup;
}
export async function buildBackupZip(payload, media){
  const bundle = payload && payload.backup ? payload : buildBackup(payload);
  const files = [{ name: "yedek.json", data: utf8Bytes(JSON.stringify(bundle.backup, null, 2)) }];
  for(let i = 0; i < bundle.images.length; i++){
    const item = bundle.images[i];
    let blob = null;
    try{
      if(media && typeof media.getImageBlob === "function") blob = await media.getImageBlob(item.img.id);
    }catch(err){ blob = null; }
    if(blob) files.push({ name: item.file, data: new Uint8Array(await blob.arrayBuffer()) });
  }
  for(let i = 0; i < bundle.attachments.length; i++){
    const item = bundle.attachments[i];
    let blob = null;
    try{
      if(media && typeof media.getFileBlob === "function") blob = await media.getFileBlob(item.att.id);
    }catch(err){ blob = null; }
    if(blob) files.push({ name: item.file, data: new Uint8Array(await blob.arrayBuffer()) });
  }
  return createZip(files);
}
function looksLikeZip(bytes){
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4B &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
}
export async function parseBackup(input){
  if(!input) throw new Error("Yedek dosyası yok.");
  let bytes;
  if(input instanceof Uint8Array){
    bytes = input;
  }else if(typeof input.arrayBuffer === "function"){
    bytes = new Uint8Array(await input.arrayBuffer());
  }else{
    bytes = new Uint8Array(input);
  }
  if(bytes.length > 512 * 1024 * 1024){
    throw new Error("Yedek dosyası çok büyük.");
  }
  let data = null;
  let entries = null;
  if(looksLikeZip(bytes)){
    entries = await parseZip(bytes);
    if(!entries["yedek.json"]) throw new Error("ZIP içinde yedek.json bulunamadı.");
    data = JSON.parse(new TextDecoder("utf-8").decode(entries["yedek.json"]));
  }else{
    data = JSON.parse(new TextDecoder("utf-8").decode(bytes));
  }
  if(!data || !Array.isArray(data.requests)){
    throw new Error("Geçersiz yedek dosyası: \"requests\" dizisi bulunamadı.");
  }
  if(data.app && data.app !== "istek-defteri"){
    throw new Error("Bu dosya bir Request Ledger yedeği değil.");
  }
  if(Number(data.version) > 3){
    throw new Error("Yedek daha yeni bir sürümle oluşturulmuş.");
  }
  if(data.requests.length > 5000){
    throw new Error("Yedekte çok fazla talep var.");
  }
  if(Array.isArray(data.records) && data.records.length > 2000){
    throw new Error("Yedekte çok fazla kayıt var.");
  }
  if(Array.isArray(data.drafts) && data.drafts.length > 2000){
    throw new Error("Yedekte çok fazla taslak var.");
  }
  if(Array.isArray(data.agents) && data.agents.length > 200){
    throw new Error("Yedekte çok fazla ajan var.");
  }
  return { data: data, entries: entries };
}
function snapshotProject(value, fallback){
  return String(value || fallback || "Projem").trim().slice(0, 60) || fallback || "Projem";
}
export async function applyBackup(data, entries, options){
  if(!data || !Array.isArray(data.requests)){
    throw new Error("Geçersiz yedek dosyası: \"requests\" dizisi bulunamadı.");
  }
  const opts = options || {};
  const adapter = opts.media || {};
  const putImageRec = typeof adapter.putImage === "function" ? adapter.putImage : putImage;
  const putFileRec = typeof adapter.putFile === "function" ? adapter.putFile : putFile;
  const project = snapshotProject(data.project, "Projem");
  const stats = { missingImages: 0, missingFiles: 0, restoredImages: 0, restoredFiles: 0 };

  // 1) Normalize the whole bundle in memory before touching any store.
  const restored = data.requests.map(function(raw, index){ return normalizeRequest(raw, index); });
  const sourceRecords = Array.isArray(data.records) ? data.records : null;
  const sourceDrafts = Array.isArray(data.drafts) ? data.drafts : null;

  async function restoreMedia(req){
    const keptImages = [];
    for(let j = 0; j < req.images.length; j++){
      const img = req.images[j];
      const file = img.file || imageFileName(req, j, img);
      const bytes = entries && entries[file] ? entries[file] : null;
      if(bytes){
        try{
          const type = img.type || "image/webp";
          const blob = new Blob([bytes], { type: type });
          await putImageRec({ id: img.id, blob: blob, type: type });
          stats.restoredImages++;
        }catch(err){
          stats.missingImages++;
        }
      }else{
        // No blob in the bundle: keep an existing blob in the store untouched.
        stats.missingImages++;
      }
      keptImages.push({
        id: img.id,
        name: img.name,
        w: img.w,
        h: img.h,
        size: img.size,
        type: img.type,
        ext: img.ext,
        file: ""
      });
    }
    req.images = keptImages;
    const keptFiles = [];
    for(let j = 0; j < req.attachments.length; j++){
      const att = req.attachments[j];
      const file = att.file || attachmentFileName(req, j, att);
      const bytes = entries && entries[file] ? entries[file] : null;
      if(bytes){
        try{
          const type = att.type || "application/octet-stream";
          const blob = new Blob([bytes], { type: type });
          await putFileRec({ id: att.id, blob: blob, type: type });
          stats.restoredFiles++;
        }catch(err){
          stats.missingFiles++;
        }
      }else{
        stats.missingFiles++;
      }
      keptFiles.push({
        id: att.id,
        name: att.name,
        size: att.size,
        type: att.type,
        ext: att.ext,
        file: ""
      });
    }
    req.attachments = keptFiles;
  }

  function buildSnapshot(raw, index, kind, fallbackProject){
    raw = raw || {};
    const item = JSON.parse(JSON.stringify(raw));
    const prefix = kind === "record" ? "rec_restored_" : "drf_restored_";
    item.id = String(raw.id || (prefix + Date.now() + "_" + index));
    item.kind = kind;
    item.ledgerId = typeof raw.ledgerId === "string" && raw.ledgerId ? raw.ledgerId : newLedgerId();
    item.project = snapshotProject(raw.project, fallbackProject);
    item.requests = (Array.isArray(raw.requests) ? raw.requests : []).map(function(req, reqIndex){
      return normalizeRequest(req, reqIndex);
    });
    item.savedAt = raw.savedAt || nowISO();
    item.name = raw.name || (item.project + " · " + formatClock(item.savedAt));
    item.requestCount = item.requests.length;
    item.imageCount = item.requests.reduce(function(sum, req){ return sum + req.images.length; }, 0);
    item.fileCount = item.requests.reduce(function(sum, req){
      return sum + (typeTemplate(req.type).attachments ? req.attachments.length : 0);
    }, 0);
    item.signature = requestsSignature(item.requests);
    item.complete = item.requests.every(function(req){ return requestStatus(req) === "ready"; });
    item.exported = Boolean(raw.exported);
    item.reason = raw.reason || "";
    item.markdown = raw.markdown || "";
    item.fileName = "";
    item.rootFolder = "";
    item.writeError = "";
    return item;
  }

  // Prepare snapshots (normalize) before writing anything.
  const restoredRecords = sourceRecords ? sourceRecords.map(function(raw, index){
    return buildSnapshot(raw, index, "record", project);
  }) : null;
  const restoredDrafts = sourceDrafts ? sourceDrafts.map(function(raw, index){
    return buildSnapshot(raw, index, "draft", project);
  }) : null;

  // 2) Write media for live requests and records/drafts.
  for(let i = 0; i < restored.length; i++){
    await restoreMedia(restored[i]);
    if(!isAutoValid(restored[i])) restored[i].confirmed = false;
  }
  if(restoredRecords){
    for(let i = 0; i < restoredRecords.length; i++){
      for(let j = 0; j < restoredRecords[i].requests.length; j++){
        await restoreMedia(restoredRecords[i].requests[j]);
        if(!isAutoValid(restoredRecords[i].requests[j])) restoredRecords[i].requests[j].confirmed = false;
      }
    }
  }
  if(restoredDrafts){
    for(let i = 0; i < restoredDrafts.length; i++){
      for(let j = 0; j < restoredDrafts[i].requests.length; j++){
        await restoreMedia(restoredDrafts[i].requests[j]);
        if(!isAutoValid(restoredDrafts[i].requests[j])) restoredDrafts[i].requests[j].confirmed = false;
      }
    }
  }

  // 3) Persist collections. Media stores are never cleared here (bug fix).
  if(restoredRecords){
    try{ await storeClear(DB.stores.records); }catch(err){}
    for(let i = 0; i < restoredRecords.length; i++){
      try{ await storePut(DB.stores.records, restoredRecords[i]); }catch(err){}
    }
  }
  if(restoredDrafts){
    try{ await storeClear(DB.stores.drafts); }catch(err){}
    for(let i = 0; i < restoredDrafts.length; i++){
      try{ await storePut(DB.stores.drafts, restoredDrafts[i]); }catch(err){}
    }
  }

  const language = data.language === "tr" ? "tr" : data.language === "en" ? "en" : null;
  const exportBehavior = ["last","instant","default"].indexOf(data.exportBehavior) >= 0 ? data.exportBehavior : "default";
  const agents = Array.isArray(data.agents) ? data.agents.map(normalizeAgent) : null;

  return {
    requests: restored,
    records: restoredRecords || [],
    drafts: restoredDrafts || [],
    project: project,
    ledgerId: typeof data.ledgerId === "string" && data.ledgerId ? data.ledgerId : newLedgerId(),
    agents: agents,
    language: language,
    exportBehavior: exportBehavior,
    lastExport: data.lastExport && typeof data.lastExport === "object" ? data.lastExport : null,
    stats: stats
  };
}
