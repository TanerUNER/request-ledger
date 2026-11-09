/*
  Planning block and Markdown document builder.

  Ported verbatim from the previous monolithic core (v1.9.1). Presentation decisions such as
  local-time formatting, label translation and media naming are part of the output contract
  recorded in tests/golden; do not change them casually.
*/

import {
  PLANNING_FULL_TEXT,
  PLANNING_FULL_TEXT_EN,
  PLANNING_LIGHT_TEXT,
  PLANNING_LIGHT_TEXT_EN,
  PLANNING_TESTS,
} from "./constants.mjs";
import { countLabel, currentLanguage, formatDateLong, normalizeLang, translate } from "./i18n.mjs";
import { blobToDataURL } from "./media.mjs";
import { agentRoleLabel, priorityInfo, sortAgentsByRole, typeInfo, typeTemplate } from "./model.mjs";
import { attachmentFileName, formatDateTime, imageFileName, mdCell, mdLine } from "./util.mjs";

function planningTestInfo(id){
  return PLANNING_TESTS.find(function(item){ return item.id === id; }) || PLANNING_TESTS[0];
}
function runtimePackageText(planning, lang){
  const code = normalizeLang(lang == null ? currentLanguage : lang);
  if(!planning || !planning.runtime){
    return code === "en" ? "No runtime package." : "Runtime paketi yok.";
  }
  const transfers = Array.isArray(planning.transfers) ? planning.transfers.filter(function(item){ return item !== "none"; }) : [];
  const hasServer = transfers.indexOf("server") >= 0;
  const hasGofile = transfers.indexOf("gofile") >= 0;
  if(code === "en"){
    if(hasServer && hasGofile) return "Create the runtime package; send it to my server and upload it to gofile.io, then send me the link.";
    if(hasServer) return "Create the runtime package and send it to my server.";
    if(hasGofile) return "Create the runtime package, upload it to gofile.io, and send me the link.";
    return "Create the runtime package; no transfer will be made.";
  }
  if(hasServer && hasGofile) return "Runtime paketi oluştur; sunucuma gönder ve gofile.io sitesine upload edip linki bana yaz.";
  if(hasServer) return "Runtime paketi oluştur ve sunucuma gönder.";
  if(hasGofile) return "Runtime paketi oluştur ve gofile.io sitesine upload et, linki bana yaz.";
  return "Runtime paketi oluştur; paket transferi yapılmayacak.";
}
function planningQuestionText(planning, lang){
  const code = normalizeLang(lang == null ? currentLanguage : lang);
  if(planning && planning.question === true){
    return code === "en"
      ? "Before starting the tasks, ask any questions or share any suggestions about the requests."
      : "İsteklerin yerine getirilmesinden önce istekler ile ilgili soruların veya öneri yapmak istediğin kısımlar var ise görevlere başlamadan önce ilet.";
  }
  return code === "en"
    ? "Start the tasks without asking questions or making suggestions."
    : "Soru veya öneri sunmadan görevlere başla.";
}
function planningSelectedAgents(planning, agents){
  const source = agents || [];
  return sortAgentsByRole(((planning && planning.agents) || []).map(function(id){
    return source.find(function(agent){ return agent.id === id; });
  }).filter(Boolean));
}
function planningAgentTableLines(planning, agents, lang){
  const list = planningSelectedAgents(planning, agents);
  if(!list.length) return ["**" + translate("Çağrılacak Ajanlar", lang) + ":** " + translate("Belirtilmedi", lang), ""];
  const lines = ["**" + translate("Çağrılacak Ajanlar", lang) + ":**", "", "| " + translate("Görev", lang) + " | " + translate("MD Dosyası Yolu", lang) + " |", "|---|---|"];
  list.forEach(function(agent){
    lines.push("| " + mdCell(translate(agentRoleLabel(agent.role), lang)) + " | " + mdCell(agent.mdPath || "—") + " |");
  });
  lines.push("");
  return lines;
}
function planningMarkdownLines(planning, agents, lang){
  const code = normalizeLang(lang == null ? currentLanguage : lang);
  if(!planning || !planning.mode) return [];
  const lines = ["## " + translate("Planlama", lang), ""];
  if(planning.mode === "full"){
    lines.push("**" + translate("Koşu türü", lang) + ":** " + translate("Tam koşu", lang), "");
    lines.push(code === "en" ? PLANNING_FULL_TEXT_EN : PLANNING_FULL_TEXT, "");
    planningAgentTableLines(planning, agents, lang).forEach(function(line){ lines.push(line); });
    lines.push("**" + translate("Runtime Paketi", lang) + ":** " + runtimePackageText(planning, lang), "");
    lines.push("**" + translate("Soru - Öneri isteği", lang) + ":** " + planningQuestionText(planning, lang), "");
    return lines;
  }
  if(planning.mode === "light"){
    lines.push("**" + translate("Koşu türü", lang) + ":** " + translate("Hafif koşu", lang), "");
    lines.push(code === "en" ? PLANNING_LIGHT_TEXT_EN : PLANNING_LIGHT_TEXT, "");
    planningAgentTableLines(planning, agents, lang).forEach(function(line){ lines.push(line); });
    lines.push("**" + translate("Runtime Paketi", lang) + ":** " + runtimePackageText(planning, lang), "");
    lines.push("**" + translate("Soru - Öneri isteği", lang) + ":** " + planningQuestionText(planning, lang), "");
    return lines;
  }
  const test = planningTestInfo(planning.test);
  planningAgentTableLines(planning, agents, lang).forEach(function(line){ lines.push(line); });
  lines.push("**" + translate("Test imkanı", lang) + ":** " + translate(test.label, lang));
  lines.push("");
  lines.push(code === "en" ? test.noteEn : test.note);
  lines.push("");
  lines.push("**" + translate("Runtime Paketi", lang) + ":** " + runtimePackageText(planning, lang), "");
  lines.push("**" + translate("Soru - Öneri isteği", lang) + ":** " + planningQuestionText(planning, lang));
  if(planning.note && String(planning.note).trim()){
    lines.push("", "**" + translate("Not", lang) + ":** " + String(planning.note).trim());
  }
  lines.push("");
  return lines;
}

/* ============================================================
   Markdown
   ============================================================ */
export async function buildMarkdown(options){
  const opts = options || {};
  const list = (opts.requests || []).slice();
  const project = opts.project == null ? "Projem" : String(opts.project);
  const lang = normalizeLang(opts.lang == null ? currentLanguage : opts.lang);
  const mode = opts.mode || "none";
  const includeSummary = Boolean(opts.includeSummary);
  const media = opts.media || null;
  const archiveName = opts.archiveName || "";
  const agents = opts.agents || [];

  const imageCount = list.reduce(function(sum, req){ return sum + (req.images || []).length; }, 0);
  const fileCount = list.reduce(function(sum, req){
    const template = typeTemplate(req.type);
    return sum + (template.attachments ? (req.attachments || []).length : 0);
  }, 0);

  const lines = [];
  function headerCount(n, trOne, trMany, enOne, enMany){
    return countLabel(n, lang, { one: lang === "tr" ? trOne : enOne, many: lang === "tr" ? trMany : enMany });
  }
  const headerParts = [formatDateLong(new Date(), lang), headerCount(list.length, "talep", "talep", "request", "requests")];
  if(imageCount) headerParts.push(headerCount(imageCount, "görsel", "görsel", "image", "images"));
  if(fileCount) headerParts.push(headerCount(fileCount, "dosya", "dosya", "file", "files"));
  lines.push("# " + mdLine(project) + " — " + translate("Geliştirme İstekleri", lang), "");
  lines.push("> " + headerParts.join(" · "), "");
  if(archiveName){
    lines.push("> **" + translate("Sıkıştırılmış Dosya", lang) + ":** " + mdLine(archiveName), "");
  }
  if(includeSummary && list.length){
    lines.push("## " + translate("Özet", lang), "");
    lines.push("| # | " + translate("Tür", lang) + " | " + translate("Başlık", lang) + " | " + translate("Öncelik", lang) + " |");
    lines.push("|---|---|---|---|");
    list.forEach(function(req){
      lines.push("| " + mdCell(req.id) + " | " + mdCell(translate(typeInfo(req.type).label, lang)) + " | " + mdCell(req.title || translate("Başlıksız istek", lang)) + " | " + mdCell(translate(priorityInfo(req.priority).label, lang)) + " |");
    });
    lines.push("");
  }
  const planningLines = planningMarkdownLines(opts.planning, agents, lang);
  planningLines.forEach(function(line){ lines.push(line); });

  for(let index = 0; index < list.length; index++){
    const req = list[index];
    const template = typeTemplate(req.type);
    const images = req.images || [];
    const attachments = req.attachments || [];
    lines.push("## " + req.id + " — " + (mdLine(req.title) || translate("Başlıksız istek", lang)), "");
    lines.push("- **" + translate("Tür", lang) + ":** " + translate(typeInfo(req.type).label, lang));
    if(template.page && req.page && String(req.page).trim()) lines.push("- **" + translate("Sayfa", lang) + ":** " + String(req.page).trim());
    if(template.location && req.location && String(req.location).trim()) lines.push("- **" + translate("Sayfadaki Konum", lang) + ":** " + String(req.location).trim());
    lines.push("- **" + translate("Öncelik", lang) + ":** " + translate(priorityInfo(req.priority).label, lang));
    lines.push("- **" + translate("Durum", lang) + ":** " + translate("Hazır", lang));
    lines.push("- **" + translate("Eklenme", lang) + ":** " + formatDateTime(req.createdAt));
    if(mode === "none" && images.length){
      lines.push("- **" + translate("Görseller", lang) + ":** " + images.length + " " + translate("adet", lang) + " (" + translate("Markdown metninde yer almaz", lang) + ")");
    }
    if(mode === "none" && template.attachments && attachments.length){
      lines.push("- **" + translate("Örnek Dosya", lang) + ":** " + attachments.length + " " + translate("adet", lang) + " (" + translate("Markdown metninde yer almaz", lang) + ")");
    }
    if(template.console && req.consoleError && String(req.consoleError).trim()){
      lines.push("", "### " + translate("Console Hatası veya Sayfa Hatası", lang), "", String(req.consoleError).trim(), "");
    }
    lines.push("", "### " + translate("Talep", lang), "", String(req.description || "").trim() || translate("_Açıklama girilmedi._", lang), "");
    if(images.length && mode !== "none"){
      lines.push("### " + translate("Görseller", lang), "");
      for(let i = 0; i < images.length; i++){
        const img = images[i];
        const alt = req.id + " · " + translate("Görsel", lang) + " " + (i + 1);
        let blob = null;
        try{
          if(media && typeof media.getImageBlob === "function") blob = await media.getImageBlob(img.id);
        }catch(err){ blob = null; }
        if(blob){
          if(mode === "embedded"){
            const dataUrl = await blobToDataURL(blob);
            lines.push("![" + alt + "](" + dataUrl + ")", "");
          }else{
            lines.push("![" + alt + "](" + imageFileName(req, i, img) + ")", "");
          }
        }else{
          lines.push("> " + translate("Görsel bulunamadı", lang) + ": " + img.name, "");
        }
      }
    }
    if(template.attachments && attachments.length){
      lines.push("### " + translate("Örnek Dosya", lang), "");
      for(let i = 0; i < attachments.length; i++){
        const att = attachments[i];
        if(mode === "zip"){
          let blob = null;
          try{
            if(media && typeof media.getFileBlob === "function") blob = await media.getFileBlob(att.id);
          }catch(err){ blob = null; }
          if(blob){
            lines.push("- [" + mdLine(att.name) + "](" + attachmentFileName(req, i, att) + ")");
          }else{
            lines.push("- " + mdLine(att.name) + " (" + translate("dosya bulunamadı", lang) + ")");
          }
        }else{
          lines.push("- " + mdLine(att.name) + (mode === "embedded" ? " (" + translate("dosya eki; ZIP çıktısında taşınır", lang) + ")" : ""));
        }
      }
      lines.push("");
    }
    if(template.sampleWebsite && req.sampleWebsite && String(req.sampleWebsite).trim()){
      lines.push("### " + translate("Örnek Web Sitesi", lang), "", String(req.sampleWebsite).trim(), "");
    }
    if(template.link && req.link && String(req.link).trim()){
      lines.push("### " + translate("İlgili Bağlantı", lang), "", String(req.link).trim(), "");
    }
    if(req.note && String(req.note).trim()){
      lines.push("### " + translate("Ek Not", lang), "", String(req.note).trim(), "");
    }
    if(index < list.length - 1) lines.push("---", "");
  }
  lines.push("---", "", "_" + project + " · " + translate("İstek Defteri", lang) + " · " + formatDateTime(new Date()) + "_", "");
  return lines.join("\n");
}
