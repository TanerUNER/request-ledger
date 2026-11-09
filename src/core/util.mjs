/*
  Shared utility helpers.

  Ported verbatim from the previous monolithic core (v1.9.1). Behaviour, including the
  deliberate local-time formatting and the comma decimal separator, is preserved.
*/

export function nowISO() {
  return new Date().toISOString();
}

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function formatYMD(date) {
  const d = date || new Date();
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

export function formatStamp(date) {
  const d = date || new Date();
  return formatYMD(d) + "_" + pad2(d.getHours()) + "-" + pad2(d.getMinutes()) + "-" + pad2(d.getSeconds());
}

export function formatTime(date) {
  const d = date || new Date();
  return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
}

export function formatClock(value) {
  const d = value instanceof Date ? value : value ? new Date(value) : new Date();
  if (isNaN(d.getTime())) return "";
  return pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
}

export function formatDateTime(value) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "—";
  return pad2(d.getDate()) + "." + pad2(d.getMonth() + 1) + "." + d.getFullYear() + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
}

export function mdCell(value) {
  return String(value == null ? "" : value).replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim() || "—";
}

export function mdLine(value) {
  return String(value == null ? "" : value).replace(/\r?\n/g, " ").trim();
}

export function utf8Bytes(value, withBom) {
  const encoded = new TextEncoder().encode(String(value));
  if (!withBom) return encoded;
  const out = new Uint8Array(encoded.length + 3);
  out.set([0xef, 0xbb, 0xbf], 0);
  out.set(encoded, 3);
  return out;
}

export function extFromMime(type) {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  if (type === "image/avif") return "avif";
  if (type === "image/bmp") return "bmp";
  return "png";
}

export function extFromFileName(name) {
  const match = /\.([A-Za-z0-9]{1,10})$/.exec(String(name || ""));
  return match ? match[1].toLowerCase() : "";
}

export function safeFileBase(name) {
  let base = String(name || "dosya").replace(/\.[^.]+$/, "");
  base = base.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i");
  base = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base || "dosya";
}

export function imageFileName(req, index, img) {
  const base = String(req.id || "istek").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "istek";
  const ext = String(img.ext || extFromMime(img.type) || "webp").replace("jpeg", "jpg");
  return "gorseller/" + base + "-" + (index + 1) + "." + ext;
}

export function attachmentFileName(req, index, att) {
  const idBase = String(req.id || "istek").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "istek";
  const ext = String(att.ext || extFromFileName(att.name) || "dat").replace(/[^a-z0-9]/g, "") || "dat";
  return "dosyalar/" + idBase + "-" + (index + 1) + "-" + safeFileBase(att.name) + "." + ext;
}

export function formatBytes(bytes){
  const value = Number(bytes) || 0;
  if(value < 1024) return value + " B";
  if(value < 1024 * 1024) return (value / 1024).toFixed(1).replace(".", ",") + " KB";
  return (value / (1024 * 1024)).toFixed(1).replace(".", ",") + " MB";
}

export function backupMediaFileName(kind, item) {
  const safeId = String(item.id || "medya").replace(/[^A-Za-z0-9_-]/g, "-");
  if (kind === "image") {
    const ext = String(item.ext || extFromMime(item.type) || "webp").replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "") || "webp";
    return "gorseller/" + safeId + "." + ext;
  }
  const ext = String(item.ext || extFromFileName(item.name) || "dat").replace(/[^a-z0-9]/gi, "") || "dat";
  return "dosyalar/" + safeId + "-" + safeFileBase(item.name) + "." + ext;
}

export function normalizeDisplayPath(value) {
  let path = String(value == null ? "" : value).replace(/\\/g, "/");
  if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
  return path;
}

export function newLedgerId() {
  return "ledger_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
}
