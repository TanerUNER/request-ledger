/*
  Request model: lookups, validation, identity, normalisation, serialisation, mutation.

  Ported verbatim from the previous monolithic core (v1.9.1). Function names and behaviour
  are unchanged, including:
    - readiness requires title + description + known type + known priority;
    - missingFields reports only title and description;
    - normalize() forces confirmed=false when the data is not auto-valid;
    - content changes revoke confirmation;
    - order is array order (no implicit sorting).
*/

import {
  AGENT_ROLE_MAP,
  AGENT_ROLE_ORDER,
  AGENT_ROLES,
  PRIORITIES,
  PRIORITY_MAP,
  TYPE_MAP,
  TYPE_TEMPLATES,
  TYPES,
} from "./constants.mjs";
import { extFromFileName, extFromMime, nowISO } from "./util.mjs";

export function typeInfo(id) {
  return TYPE_MAP[id] || TYPES[0];
}

export function priorityInfo(id) {
  return PRIORITY_MAP[id] || PRIORITIES[1];
}

export function agentRoleInfo(id) {
  return AGENT_ROLE_MAP[id] || AGENT_ROLES[6];
}

export function agentRoleLabel(id) {
  return agentRoleInfo(id).label;
}

export function agentDisplayName(agent) {
  if (!agent) return "";
  return agent.name && agent.name.trim() ? agent.name.trim() : agentRoleLabel(agent.role);
}

export function sortAgentsByRole(list) {
  return (list || []).slice().sort((a, b) => {
    const orderA = AGENT_ROLE_ORDER[a.role] == null ? 99 : AGENT_ROLE_ORDER[a.role];
    const orderB = AGENT_ROLE_ORDER[b.role] == null ? 99 : AGENT_ROLE_ORDER[b.role];
    if (orderA !== orderB) return orderA - orderB;
    return agentDisplayName(a).localeCompare(agentDisplayName(b), "tr");
  });
}

export function normalizeAgent(raw) {
  raw = raw || {};
  const role = AGENT_ROLE_MAP[raw.role] ? raw.role : "general";
  let id = String(raw.id || "").trim();
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(id)) id = "agent_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
  return {
    id,
    name: String(raw.name || "").slice(0, 80),
    role,
    mdPath: String(raw.mdPath || raw.mdFile || "").slice(0, 300),
  };
}

export function makeAgent() {
  return {
    id: "agent_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
    name: "",
    role: "general",
    mdPath: "",
  };
}

export function typeTemplate(id) {
  return TYPE_TEMPLATES[id] || TYPE_TEMPLATES.update;
}

export function isAutoValid(req) {
  if (!req) return false;
  if (!req.title || !req.title.trim()) return false;
  if (!req.description || !req.description.trim()) return false;
  if (!TYPE_MAP[req.type]) return false;
  if (!PRIORITY_MAP[req.priority]) return false;
  return true;
}

export function missingFields(req) {
  const out = [];
  if (!req || !req.title || !req.title.trim()) out.push({ key: "title", label: "Başlık" });
  if (!req || !req.description || !req.description.trim()) out.push({ key: "description", label: "Açıklama" });
  return out;
}

export function requestStatus(req) {
  if (!isAutoValid(req)) return "missing";
  if (!req.confirmed) return "pending";
  return "ready";
}

export function nextId(requests) {
  let max = 0;
  (requests || []).forEach((req) => {
    if (!req) return;
    const match = /^IST-(\d+)$/.exec(req.id);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  });
  return "IST-" + String(max + 1).padStart(3, "0");
}

export function makeNewRequest(requests, typeId) {
  const now = nowISO();
  return {
    id: nextId(requests),
    type: TYPE_MAP[typeId] ? typeId : "feature",
    title: "",
    page: "",
    location: "",
    consoleError: "",
    description: "",
    priority: "normal",
    link: "",
    sampleWebsite: "",
    note: "",
    images: [],
    attachments: [],
    confirmed: false,
    collapsed: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeRequest(raw, index) {
  raw = raw || {};
  let id = String(raw.id || "").trim();
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) id = "IST-" + String(index + 1).padStart(3, "0");
  const req = {
    id,
    type: TYPE_MAP[raw.type] ? raw.type : "update",
    title: String(raw.title || ""),
    page: String(raw.page || ""),
    location: String(raw.location || ""),
    consoleError: String(raw.consoleError || ""),
    description: String(raw.description || ""),
    priority: PRIORITY_MAP[raw.priority] ? raw.priority : "normal",
    link: String(raw.link || ""),
    sampleWebsite: String(raw.sampleWebsite || ""),
    note: String(raw.note || ""),
    images: Array.isArray(raw.images)
      ? raw.images
          .filter((img) => img && img.id)
          .map((img) => ({
            id: String(img.id),
            name: String(img.name || "görsel"),
            w: Number(img.w) || 0,
            h: Number(img.h) || 0,
            size: Number(img.size) || 0,
            type: String(img.type || "image/webp"),
            ext: String(img.ext || extFromMime(img.type)),
            file: img.file ? String(img.file) : "",
          }))
      : [],
    attachments: Array.isArray(raw.attachments)
      ? raw.attachments
          .filter((att) => att && att.id)
          .map((att) => ({
            id: String(att.id),
            name: String(att.name || "dosya"),
            size: Number(att.size) || 0,
            type: String(att.type || "application/octet-stream"),
            ext: String(att.ext || extFromFileName(att.name)),
            file: att.file ? String(att.file) : "",
          }))
      : [],
    confirmed: Boolean(raw.confirmed),
    collapsed: raw.collapsed !== false,
    createdAt: raw.createdAt || nowISO(),
    updatedAt: raw.updatedAt || raw.createdAt || nowISO(),
  };
  if (!isAutoValid(req)) req.confirmed = false;
  return req;
}

export function serializeRequest(req, mapImage, mapAttachment) {
  return {
    id: req.id,
    type: req.type,
    title: req.title,
    page: req.page,
    location: req.location,
    consoleError: req.consoleError,
    description: req.description,
    priority: req.priority,
    link: req.link,
    sampleWebsite: req.sampleWebsite,
    note: req.note,
    images: (req.images || []).map((img, index) => {
      if (mapImage) return mapImage(img, index);
      return {
        id: img.id,
        name: img.name,
        w: img.w,
        h: img.h,
        size: img.size,
        type: img.type,
        ext: img.ext,
        file: img.file || "",
      };
    }),
    attachments: (req.attachments || []).map((att, index) => {
      if (mapAttachment) return mapAttachment(att, index);
      return {
        id: att.id,
        name: att.name,
        size: att.size,
        type: att.type,
        ext: att.ext,
        file: att.file || "",
      };
    }),
    confirmed: req.confirmed,
    collapsed: req.collapsed,
    createdAt: req.createdAt,
    updatedAt: req.updatedAt,
  };
}

export function requestsSignature(requests) {
  return JSON.stringify(
    (requests || []).map((req) => ({
      id: req.id,
      type: req.type,
      title: req.title,
      page: req.page,
      location: req.location,
      consoleError: req.consoleError,
      description: req.description,
      priority: req.priority,
      link: req.link,
      sampleWebsite: req.sampleWebsite,
      note: req.note,
      images: (req.images || []).map((img) => img.id),
      attachments: (req.attachments || []).map((att) => att.id),
    }))
  );
}

export function getReq(requests, id) {
  const list = requests || [];
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  return null;
}

export function incompleteRequests(requests) {
  return (requests || []).filter((req) => requestStatus(req) !== "ready");
}

export function duplicateRequest(req, requests) {
  if (!req) return null;
  return {
    id: nextId(requests),
    type: req.type,
    title: (req.title ? req.title + " (kopya)" : "Kopya istek").slice(0, 120),
    page: req.page,
    location: req.location,
    consoleError: req.consoleError,
    description: req.description,
    priority: req.priority,
    link: req.link,
    sampleWebsite: req.sampleWebsite,
    note: req.note,
    images: [],
    attachments: [],
    confirmed: false,
    collapsed: false,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
}

export const UPDATE_FIELDS = ["type", "title", "page", "location", "consoleError", "description", "priority", "link", "sampleWebsite", "note", "images", "attachments"];

export function updateRequest(req, patch) {
  if (!req) return null;
  let contentChanged = false;
  let hasConfirmed = false;
  let nextConfirmed = false;
  Object.keys(patch || {}).forEach((key) => {
    if (key === "confirmed") {
      hasConfirmed = true;
      nextConfirmed = Boolean(patch.confirmed);
      return;
    }
    if (key === "collapsed" || key === "createdAt" || key === "updatedAt" || key === "_showErrors") return;
    req[key] = patch[key];
    if (UPDATE_FIELDS.indexOf(key) >= 0) contentChanged = true;
  });
  if (contentChanged) {
    if (req.confirmed) req.confirmed = false;
    req.updatedAt = nowISO();
  }
  if (hasConfirmed) {
    req.confirmed = nextConfirmed;
    /* Confirmation is user-visible content and must carry a new revision, or
       item-level bridge merges keep the receiver's older confirmed value. */
    req.updatedAt = nowISO();
  }
  return req;
}

export function removeRequest(requests, id) {
  const list = requests || [];
  const index = list.findIndex((req) => req.id === id);
  if (index < 0) return { requests: list, removed: null };
  const removed = list.splice(index, 1)[0];
  return { requests: list, removed };
}

export function moveRequest(requests, id, delta) {
  const list = requests || [];
  const index = list.findIndex((req) => req.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= list.length) return list;
  const temp = list[index];
  list[index] = list[target];
  list[target] = temp;
  return list;
}
