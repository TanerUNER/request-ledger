/*
  Media: blob access through the storage adapters plus canvas image compression.

  Ported verbatim from the previous monolithic core (v1.9.1). compressImage() needs a DOM
  (document/canvas); the blob readers do not.
*/

import { LIMITS } from "./constants.mjs";
import { getFile, getImage } from "./storage.mjs";
import { extFromMime } from "./util.mjs";

export async function getImageBlob(id){
  const record = await getImage(id);
  return record && record.blob ? record.blob : null;
}
export async function getFileBlob(id){
  const record = await getFile(id);
  return record && record.blob ? record.blob : null;
}

/* ============================================================
   Görsel sıkıştırma (DOM canvas)
   ============================================================ */
let webpSupport = null;
function supportsWebP(){
  if(webpSupport !== null) return webpSupport;
  try{
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    webpSupport = canvas.toDataURL("image/webp").indexOf("data:image/webp") === 0;
  }catch(err){
    webpSupport = false;
  }
  return webpSupport;
}
function decodeImage(file){
  if(typeof createImageBitmap === "function"){
    return createImageBitmap(file, { imageOrientation:"from-image" })
      .catch(function(){ return createImageBitmap(file); })
      .catch(function(){ return decodeWithImageElement(file); });
  }
  return decodeWithImageElement(file);
}
function decodeWithImageElement(file){
  return new Promise(function(resolve, reject){
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function(){ URL.revokeObjectURL(url); resolve(img); };
    img.onerror = function(){ URL.revokeObjectURL(url); reject(new Error("Görsel açılamadı")); };
    img.src = url;
  });
}
function canvasToBlob(canvas, type, quality){
  return new Promise(function(resolve){
    canvas.toBlob(function(blob){ resolve(blob); }, type, quality);
  });
}
export async function blobToDataURL(blob){
  if(typeof FileReader !== "undefined"){
    return new Promise(function(resolve, reject){
      const reader = new FileReader();
      reader.onload = function(){ resolve(reader.result); };
      reader.onerror = function(){ reject(reader.error || new Error("Dosya okunamadı")); };
      reader.readAsDataURL(blob);
    });
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for(let i = 0; i < bytes.length; i += 0x8000){
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return "data:" + (blob.type || "application/octet-stream") + ";base64," + btoa(binary);
}
export async function compressImage(file, opts){
  if(typeof document === "undefined" || !document.createElement){
    throw new Error("media.compress: document bulunamadı (DOM gerekli).");
  }
  const options = opts || {};
  const maxDim = Number(options.maxDim) > 0 ? Number(options.maxDim) : LIMITS.MAX_DIM;
  const quality = typeof options.quality === "number" ? options.quality : LIMITS.JPEG_QUALITY;
  const bitmap = await decodeImage(file);
  const srcW = bitmap.width || bitmap.naturalWidth || 1;
  const srcH = bitmap.height || bitmap.naturalHeight || 1;
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const webp = supportsWebP();
  if(!webp){
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  if(bitmap.close) bitmap.close();
  let type = webp ? "image/webp" : "image/jpeg";
  let blob = await canvasToBlob(canvas, type, quality);
  if(!blob && webp){
    type = "image/jpeg";
    blob = await canvasToBlob(canvas, type, quality);
  }
  if(!blob) throw new Error("Görsel dönüştürülemedi");
  return { blob: blob, w: width, h: height, type: type, ext: extFromMime(type) };
}
