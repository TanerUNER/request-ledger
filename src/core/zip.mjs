/*
  Minimal ZIP writer/reader for stored (uncompressed) entries only.

  Ported verbatim from the previous monolithic core (v1.9.1), including the CRC table build.
  parseZip() rejects compressed entries and locates the end-of-central-directory record by
  scanning backwards from the end of the input.
*/

const CRC_TABLE = (function(){
  const table = new Uint32Array(256);
  for(let n = 0; n < 256; n++){
    let c = n;
    for(let k = 0; k < 8; k++){
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
  }
  return table;
})();
function crc32(bytes){
  let crc = 0xFFFFFFFF;
  for(let i = 0; i < bytes.length; i++){
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function dosDateTime(date){
  const d = date || new Date();
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  };
}
export function createZip(files){
  if(typeof Blob === "undefined") throw new Error("ZIP oluşturmak için Blob gerekli.");
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  const now = dosDateTime(new Date());
  let offset = 0;
  (files || []).forEach(function(file){
    const nameBytes = encoder.encode(file.name);
    const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, now.time, true);
    lv.setUint16(12, now.date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, now.time, true);
    cv.setUint16(14, now.date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);
    offset += local.length + data.length;
  });
  const centralOffset = offset;
  const centralSize = centralParts.reduce(function(sum, part){ return sum + part.length; }, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, (files || []).length, true);
  ev.setUint16(10, (files || []).length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralOffset, true);
  ev.setUint16(20, 0, true);
  return new Blob(localParts.concat(centralParts, [end]), { type:"application/zip" });
}
export async function parseZip(input){
  if(!input) throw new Error("ZIP girdisi yok.");
  let buffer;
  if(input instanceof Uint8Array){
    buffer = input;
  }else if(typeof input.arrayBuffer === "function"){
    buffer = new Uint8Array(await input.arrayBuffer());
  }else{
    buffer = new Uint8Array(input);
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let eocd = -1;
  const min = Math.max(0, buffer.length - 65557);
  for(let i = buffer.length - 22; i >= min; i--){
    if(view.getUint32(i, true) === 0x06054b50){ eocd = i; break; }
  }
  if(eocd < 0) throw new Error("ZIP dosyasının sonu bulunamadı.");
  const count = view.getUint16(eocd + 10, true);
  let central = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder("utf-8");
  const entries = {};
  for(let i = 0; i < count; i++){
    if(view.getUint32(central, true) !== 0x02014b50) break;
    const method = view.getUint16(central + 10, true);
    const compressedSize = view.getUint32(central + 20, true);
    const nameLength = view.getUint16(central + 28, true);
    const extraLength = view.getUint16(central + 30, true);
    const commentLength = view.getUint16(central + 32, true);
    const localOffset = view.getUint32(central + 42, true);
    const name = decoder.decode(buffer.subarray(central + 46, central + 46 + nameLength));
    if(method !== 0) throw new Error("Yalnızca sıkıştırılmamış ZIP dosyaları desteklenir.");
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    entries[name] = buffer.subarray(dataStart, dataStart + compressedSize);
    central += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
