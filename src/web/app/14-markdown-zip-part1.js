  /* ============================================================
     Markdown / ZIP
     ============================================================ */
  function crc32(bytes){
    let crc = 0xFFFFFFFF;
    for(let i = 0; i < bytes.length; i++){
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
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
  function dosDateTime(date){
    const d = date || new Date();
    const year = Math.max(1980, d.getFullYear());
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
      date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
    };
  }
  function makeZip(files){
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    const now = dosDateTime(new Date());
    let offset = 0;
    files.forEach(function(file){
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
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, centralOffset, true);
    ev.setUint16(20, 0, true);
    return new Blob(localParts.concat(centralParts, [end]), { type:"application/zip" });
  }
  async function parseZipFile(file){
    const buffer = new Uint8Array(await file.arrayBuffer());
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
  function planningTestInfo(id){
    return PLANNING_TESTS.find(function(item){ return item.id === id; }) || PLANNING_TESTS[0];
  }
  function runtimePackageText(planning){
    if(!planning || !planning.runtime){
      return state.language === "en" ? "No runtime package." : "Runtime paketi yok.";
    }
    const transfers = Array.isArray(planning.transfers) ? planning.transfers.filter(function(item){ return item !== "none"; }) : [];
    const hasServer = transfers.indexOf("server") >= 0;
    const hasGofile = transfers.indexOf("gofile") >= 0;
    if(state.language === "en"){
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
  function planningQuestionText(planning){
    if(planning && planning.question === true){
      return state.language === "en"
        ? "Before starting the tasks, ask any questions or share any suggestions about the requests."
        : "İsteklerin yerine getirilmesinden önce istekler ile ilgili soruların veya öneri yapmak istediğin kısımlar var ise görevlere başlamadan önce ilet.";
    }
    return state.language === "en"
      ? "Start the tasks without asking questions or making suggestions."
      : "Soru veya öneri sunmadan görevlere başla.";
  }
  function planningValidation(){
    if(!planningMode) return "Planlama türünü seç.";
    if(planningQuestion === null) return "Soru ve Öneri seçimini yap.";
    if(planningRuntime === null) return "Runtime Paketi seçimini yap.";
    if(planningRuntime === true && !planningTransfers.length) return "Paket Transferi seçimini yap.";
    if(planningMode === "custom" && !planningTest) return "Test seçimini yap.";
    return "";
  }
  function planningSelectedAgents(planning){
    return sortAgentsByRole((planning.agents || []).map(function(id){
      return state.agents.find(function(agent){ return agent.id === id; });
    }).filter(Boolean));
  }
  function planningAgentTableLines(planning){
    const agents = planningSelectedAgents(planning);
    if(!agents.length) return ["**" + translateString("Çağrılacak Ajanlar") + ":** " + translateString("Belirtilmedi"), ""];
    const lines = ["**" + translateString("Çağrılacak Ajanlar") + ":**", "", "| " + translateString("Görev") + " | " + translateString("MD Dosyası Yolu") + " |", "|---|---|"];
    agents.forEach(function(agent){
      lines.push("| " + mdCell(translateString(agentRoleLabel(agent.role))) + " | " + mdCell(agent.mdPath || "—") + " |");
    });
    lines.push("");
    return lines;
  }
  function planningMarkdownLines(planning){
    if(!planning || !planning.mode) return [];
    const lines = ["## " + translateString("Planlama"), ""];
    if(planning.mode === "full"){
      lines.push("**" + translateString("Koşu türü") + ":** " + translateString("Tam koşu"), "");
      lines.push(state.language === "en" ? PLANNING_FULL_TEXT_EN : PLANNING_FULL_TEXT, "");
      planningAgentTableLines(planning).forEach(function(line){ lines.push(line); });
      lines.push("**" + translateString("Runtime Paketi") + ":** " + runtimePackageText(planning), "");
      lines.push("**" + translateString("Soru - Öneri isteği") + ":** " + planningQuestionText(planning), "");
      return lines;
    }
    if(planning.mode === "light"){
      lines.push("**" + translateString("Koşu türü") + ":** " + translateString("Hafif koşu"), "");
      lines.push(state.language === "en" ? PLANNING_LIGHT_TEXT_EN : PLANNING_LIGHT_TEXT, "");
      planningAgentTableLines(planning).forEach(function(line){ lines.push(line); });
      lines.push("**" + translateString("Runtime Paketi") + ":** " + runtimePackageText(planning), "");
      lines.push("**" + translateString("Soru - Öneri isteği") + ":** " + planningQuestionText(planning), "");
      return lines;
    }
    const test = planningTestInfo(planning.test);
    planningAgentTableLines(planning).forEach(function(line){ lines.push(line); });
    lines.push("**" + translateString("Test imkanı") + ":** " + translateString(test.label));
    lines.push("");
    lines.push(state.language === "en" ? test.noteEn : test.note);
    lines.push("");
    lines.push("**" + translateString("Runtime Paketi") + ":** " + runtimePackageText(planning), "");
    lines.push("**" + translateString("Soru - Öneri isteği") + ":** " + planningQuestionText(planning));
    if(planning.note && planning.note.trim()){
      lines.push("", "**" + translateString("Not") + ":** " + planning.note.trim());
    }
    lines.push("");
    return lines;
  }
  async function buildMarkdown(mode, includeSummary, planning, archiveName){
    const list = state.requests.slice();
    const imageCount = list.reduce(function(sum, req){ return sum + req.images.length; }, 0);
    const fileCount = list.reduce(function(sum, req){
      return sum + (typeTemplate(req.type).attachments ? req.attachments.length : 0);
    }, 0);
    const lines = [];
    const headerParts = [formatDateLong(new Date()), countLabel(list.length, "talep", "talep", "request", "requests")];
    if(imageCount) headerParts.push(countLabel(imageCount, "görsel", "görsel", "image", "images"));
    if(fileCount) headerParts.push(countLabel(fileCount, "dosya", "dosya", "file", "files"));
    lines.push("# " + mdLine(state.project) + " — " + translateString("Geliştirme İstekleri"), "");
    lines.push("> " + headerParts.join(" · "), "");
    if(archiveName){
      lines.push("> **" + translateString("Sıkıştırılmış Dosya") + ":** " + mdLine(archiveName), "");
    }
    if(includeSummary && list.length){
      lines.push("## " + translateString("Özet"), "");
      lines.push("| # | " + translateString("Tür") + " | " + translateString("Başlık") + " | " + translateString("Öncelik") + " |");
      lines.push("|---|---|---|---|");
      list.forEach(function(req){
        lines.push("| " + mdCell(req.id) + " | " + mdCell(translateString(typeInfo(req.type).label)) + " | " + mdCell(req.title || translateString("Başlıksız istek")) + " | " + mdCell(translateString(priorityInfo(req.priority).label)) + " |");
      });
      lines.push("");
    }
    const planningLines = planningMarkdownLines(planning);
    if(planningLines.length){
      planningLines.forEach(function(line){ lines.push(line); });
    }
    for(let index = 0; index < list.length; index++){
      const req = list[index];
      const template = typeTemplate(req.type);
      lines.push("## " + req.id + " — " + (mdLine(req.title) || translateString("Başlıksız istek")), "");
      lines.push("- **" + translateString("Tür") + ":** " + translateString(typeInfo(req.type).label));
      if(template.page && req.page && req.page.trim()) lines.push("- **" + translateString("Sayfa") + ":** " + req.page.trim());
      if(template.location && req.location && req.location.trim()) lines.push("- **" + translateString("Sayfadaki Konum") + ":** " + req.location.trim());
      lines.push("- **" + translateString("Öncelik") + ":** " + translateString(priorityInfo(req.priority).label));
      lines.push("- **" + translateString("Durum") + ":** " + translateString("Hazır"));
      lines.push("- **" + translateString("Eklenme") + ":** " + formatDateTime(req.createdAt));
      if(mode === "none" && req.images.length){
        lines.push("- **" + translateString("Görseller") + ":** " + req.images.length + " " + translateString("adet") + " (" + translateString("Markdown metninde yer almaz") + ")");
      }
      if(mode === "none" && template.attachments && req.attachments.length){
        lines.push("- **" + translateString("Örnek Dosya") + ":** " + req.attachments.length + " " + translateString("adet") + " (" + translateString("Markdown metninde yer almaz") + ")");
      }
      if(template.console && req.consoleError && req.consoleError.trim()){
        lines.push("", "### " + translateString("Console Hatası veya Sayfa Hatası"), "", req.consoleError.trim(), "");
      }
      lines.push("", "### " + translateString("Talep"), "", req.description.trim() || translateString("_Açıklama girilmedi._"), "");
      if(req.images.length && mode !== "none"){
        lines.push("### " + translateString("Görseller"), "");
        for(let i = 0; i < req.images.length; i++){
          const img = req.images[i];
          const alt = req.id + " · " + translateString("Görsel") + " " + (i + 1);
          let rec = null;
          try{ rec = await idbGet(img.id); }catch(err){}
          if(rec && rec.blob){
            if(mode === "embedded"){
              const dataUrl = await readAsDataURL(rec.blob);
              lines.push("![" + alt + "](" + dataUrl + ")", "");
            }else{
              lines.push("![" + alt + "](" + imageFileName(req, i, img) + ")", "");
            }
          }else{
            lines.push("> " + translateString("Görsel bulunamadı") + ": " + img.name, "");
          }
        }
      }
      if(template.attachments && req.attachments.length){
        lines.push("### " + translateString("Örnek Dosya"), "");
        for(let i = 0; i < req.attachments.length; i++){
          const att = req.attachments[i];
          if(mode === "zip"){
            let rec = null;
            try{ rec = await idbFileGet(att.id); }catch(err){}
            if(rec && rec.blob){
              lines.push("- [" + mdLine(att.name) + "](" + attachmentFileName(req, i, att) + ")");
            }else{
              lines.push("- " + mdLine(att.name) + " (" + translateString("dosya bulunamadı") + ")");
            }
          }else{
            lines.push("- " + mdLine(att.name) + (mode === "embedded" ? " (" + translateString("dosya eki; ZIP çıktısında taşınır") + ")" : ""));
          }
        }
        lines.push("");
      }
      if(template.sampleWebsite && req.sampleWebsite && req.sampleWebsite.trim()){
        lines.push("### " + translateString("Örnek Web Sitesi"), "", req.sampleWebsite.trim(), "");
      }
      if(template.link && req.link && req.link.trim()){
        lines.push("### " + translateString("İlgili Bağlantı"), "", req.link.trim(), "");
      }
      if(req.note && req.note.trim()){
        lines.push("### " + translateString("Ek Not"), "", req.note.trim(), "");
      }
      if(index < list.length - 1) lines.push("---", "");
    }
    lines.push("---", "", "_" + state.project + " · " + translateString("İstek Defteri") + " · " + formatDateTime(new Date()) + "_", "");
    return lines.join("\n");
  }
  async function buildMediaFiles(){
    const files = [];
    for(let r = 0; r < state.requests.length; r++){
      const req = state.requests[r];
      for(let i = 0; i < req.images.length; i++){
        const img = req.images[i];
        let rec = null;
        try{ rec = await idbGet(img.id); }catch(err){}
        if(!rec || !rec.blob) continue;
        files.push({ name: imageFileName(req, i, img), data: new Uint8Array(await rec.blob.arrayBuffer()) });
      }
      const template = typeTemplate(req.type);
      if(template.attachments){
        for(let i = 0; i < req.attachments.length; i++){
          const att = req.attachments[i];
          let rec = null;
          try{ rec = await idbFileGet(att.id); }catch(err){}
          if(!rec || !rec.blob) continue;
          files.push({ name: attachmentFileName(req, i, att), data: new Uint8Array(await rec.blob.arrayBuffer()) });
        }
      }
    }
    return files;
  }
  function applyPlanningSnapshot(snapshot){
    if(!snapshot) return;
    planningMode = ["full","light","custom"].indexOf(snapshot.mode) >= 0 ? snapshot.mode : null;
    planningQuestion = typeof snapshot.question === "boolean" ? snapshot.question : null;
    planningRuntime = typeof snapshot.runtime === "boolean" ? snapshot.runtime : null;
    planningTransfers = Array.isArray(snapshot.transfers) ? snapshot.transfers.slice() : [];
    planningTest = PLANNING_TESTS.some(function(item){ return item.id === snapshot.test; }) ? snapshot.test : null;
    const validIds = new Set(state.agents.map(function(agent){ return agent.id; }));
    planningAgents = Array.isArray(snapshot.agents) ? snapshot.agents.filter(function(id){ return validIds.has(id); }) : [];
    const note = $("#planNote");
    if(note) note.value = typeof snapshot.note === "string" ? snapshot.note : "";
    syncPlanningUI();
  }
  function renderExportModal(){
    updateTargetFolderUI();
    const total = state.requests.length;
    const ready = state.requests.filter(function(req){ return requestStatus(req) === "ready"; }).length;
    const notReady = total - ready;
    const images = state.requests.reduce(function(sum, req){ return sum + req.images.length; }, 0);
    const fileCount = state.requests.reduce(function(sum, req){
      return sum + (typeTemplate(req.type).attachments ? req.attachments.length : 0);
    }, 0);
    const summary = $("#exportSummary");
    if(summary){
      summary.innerHTML =
        "<div><dt>" + translateString("Toplam") + "</dt><dd>" + countLabel(total, "talep", "talep", "request", "requests") + "</dd></div>" +
        "<div><dt>" + translateString("Hazır") + "</dt><dd>" + countLabel(ready, "talep", "talep", "request", "requests") + "</dd></div>" +
        "<div><dt>" + translateString("Hazır değil") + "</dt><dd>" + countLabel(notReady, "talep", "talep", "request", "requests") + "</dd></div>" +
        "<div><dt>" + translateString("Görsel") + "</dt><dd>" + countLabel(images, "adet", "adet", "image", "images") + "</dd></div>" +
        "<div><dt>" + translateString("Dosya") + "</dt><dd>" + countLabel(fileCount, "adet", "adet", "file", "files") + "</dd></div>" +
        "<div><dt>" + translateString("Tarih") + "</dt><dd class=\"mono\">" + formatDateTime(new Date()).slice(0, 10) + "</dd></div>";
    }
    const embeddedRadio = document.querySelector('input[name="exportMode"][value="embedded"]');
    const zipRadio = document.querySelector('input[name="exportMode"][value="zip"]');
    const summaryInput = $("#includeSummary");
    const lastExport = (state.exportBehavior === "last" || state.exportBehavior === "instant") && state.lastExport ? state.lastExport : null;
    if(embeddedRadio){
      embeddedRadio.disabled = fileCount > 0;
      if(fileCount > 0 && embeddedRadio.checked && zipRadio) zipRadio.checked = true;
    }
    if(lastExport){
      if(zipRadio) zipRadio.checked = lastExport.mode !== "embedded" || embeddedRadio.disabled;
      if(embeddedRadio) embeddedRadio.checked = lastExport.mode === "embedded" && !embeddedRadio.disabled;
      if(summaryInput) summaryInput.checked = lastExport.includeSummary !== false;
    }else{
      if(zipRadio) zipRadio.checked = true;
      if(embeddedRadio) embeddedRadio.checked = false;
      if(summaryInput) summaryInput.checked = true;
    }
    const attachmentNote = $("#attachmentNote");
    if(attachmentNote) attachmentNote.hidden = fileCount === 0;
    const warning = $("#exportWarning");
    const warningText = $("#exportWarningText");
    const options = $("#exportOptions");
    const download = $("#exportDownloadBtn");
    const copy = $("#copyMdBtn");
    const list = $("#exportIncompleteList");
    if(warning) warning.hidden = notReady === 0;
    if(warningText){
      warningText.textContent = notReady
        ? notReady + " talep henüz hazır değil. Aşağıdaki satıra tıklayarak eksik alanı tamamla; tüm satırlar onaylanmadan dışa aktarma kapalı kalır."
        : "";
    }
    if(options) options.hidden = notReady > 0;
    if(download) download.disabled = notReady > 0;
    if(copy) copy.disabled = notReady > 0;
    if(list){
      list.innerHTML = "";
      if(notReady){
        incompleteRequests().forEach(function(req){
          const missing = missingFields(req);
          const button = document.createElement("button");
          button.type = "button";
          button.className = "incompleteitem";
          const id = document.createElement("span");
          id.className = "incompleteitem__id mono";
          id.textContent = req.id;
          const title = document.createElement("span");
          title.className = "incompleteitem__title";
          title.textContent = req.title.trim() || translateString("Başlıksız istek");
          const reason = document.createElement("span");
          reason.className = "incompleteitem__reason";
          reason.textContent = missing.length ? missing.map(function(m){ return m.label; }).join(", ") : "Onay bekliyor";
          const arrow = document.createElement("span");
          arrow.setAttribute("aria-hidden", "true");
          arrow.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>';
          button.appendChild(id);
          button.appendChild(title);
          button.appendChild(reason);
          button.appendChild(arrow);
          button.addEventListener("click", function(){
            closeModal($("#exportModal"));
            jumpToRequest(req.id);
          });
          list.appendChild(button);
        });
      }
    }
    updateExportButtonLabel();
    renderPlanningAgents();
    resetPlanningState();
    if(lastExport && lastExport.planning) applyPlanningSnapshot(lastExport.planning);
    setExportStep(1);
  }
  function updateExportButtonLabel(){
    const button = $("#exportDownloadBtn");
    if(button && !button.disabled){
      button.innerHTML = 'Sonraki adım <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
    }
  }
  function setExportStep(step){
    exportStep = step === 2 ? 2 : 1;
    const modal = $("#exportModal");
    if(modal) modal.dataset.exportStep = String(exportStep);
    const step1 = $("#exportStep1");
    const step2 = $("#exportStep2");
    if(step1){
      step1.inert = exportStep !== 1;
      step1.setAttribute("aria-hidden", String(exportStep !== 1));
    }
    if(step2){
      step2.inert = exportStep !== 2;
      step2.setAttribute("aria-hidden", String(exportStep !== 2));
    }
    const title = $("#exportTitle");
    const eyebrow = $("#exportEyebrow");
    if(title) title.textContent = exportStep === 2 ? "Planlama" : "Dışa aktarma";
    if(eyebrow) eyebrow.textContent = exportStep === 2 ? "2. Adım" : "1. Adım";
    $$("[data-export-step]").forEach(function(item){
      item.classList.toggle("is-active", Number(item.dataset.exportStep) === exportStep);
    });
    const copy = $("#copyMdBtn");
    const back = $("#exportBackBtn");
    const next = $("#exportDownloadBtn");
    const plan = $("#planningConfirmBtn");
    const instant = $("#instantExportBtn");
    const hint = $("#planValidationHint");
    const blocked = Boolean($("#exportWarning") && !$("#exportWarning").hidden);
    if(copy) copy.hidden = false;
    if(back){
      back.hidden = false;
      back.disabled = exportStep === 1;
    }
    if(next){
      next.hidden = false;
      next.disabled = exportStep === 2 || blocked;
    }
    if(hint) hint.hidden = exportStep !== 2;
    if(plan){
      plan.hidden = exportStep !== 2;
      plan.disabled = exportStep !== 2 || Boolean(planningValidation());
    }
    if(instant){
      instant.hidden = exportStep !== 2;
      instant.disabled = exportStep !== 2 || Boolean(planningValidation()) || blocked;
    }
    if(exportStep === 2){
      setTimeout(function(){
        const first = document.querySelector("[data-plan-mode]");
        if(first) first.focus();
      }, 60);
    }
  }
  function setPlanningPressed(button, active){
    if(!button) return;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  function setPanelPassive(panel, passive){
    if(!panel) return;
    panel.classList.toggle("is-passive", passive);
    panel.inert = passive;
    panel.setAttribute("aria-disabled", String(passive));
    $$("button, input, textarea, select", panel).forEach(function(control){ control.disabled = passive; });
  }
  function renderPlanningAgents(){
    const mount = $("#planAgents");
    if(!mount) return;
    mount.innerHTML = "";
    const agents = sortAgentsByRole(state.agents);
    if(!agents.length){
      const empty = document.createElement("div");
      empty.className = "agentempty";
      const text = document.createElement("span");
      text.textContent = "Henüz ajan tanımlanmadı. Ajan seçimi zorunlu değil; istersen ayarlardan ajan ekle.";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn--ghost btn--small";
      button.textContent = "Ajan ayarları";
      button.addEventListener("click", function(){
        closeModal($("#exportModal"));
        openSettingsModal();
      });
      empty.appendChild(text);
      empty.appendChild(button);
      mount.appendChild(empty);
      return;
    }
    agents.forEach(function(agent){
      const role = agentRoleInfo(agent.role);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "planopt agent-option " + role.cls;
      button.dataset.planAgent = agent.id;
      button.setAttribute("aria-pressed", "false");
      button.title = role.label + (agent.mdPath ? " · " + agent.mdPath : "");
      const name = agent.name && agent.name.trim();
      button.textContent = name ? name + " · " + role.label : role.label;
      button.addEventListener("click", function(){
        const index = planningAgents.indexOf(agent.id);
        if(index >= 0) planningAgents.splice(index, 1);
        else planningAgents.push(agent.id);
        syncPlanningUI();
      });
      mount.appendChild(button);
    });
  }
  function prunePlanningAgents(){
    const valid = new Set(state.agents.map(function(agent){ return agent.id; }));
    planningAgents = planningAgents.filter(function(id){ return valid.has(id); });
  }
  function syncPlanningUI(){
    $$("[data-plan-mode]").forEach(function(button){
      setPlanningPressed(button, planningMode === button.dataset.planMode);
    });
    const custom = $("#planCustom");
    if(custom) setPanelPassive(custom, planningMode !== "custom");
    $$("[data-plan-agent]").forEach(function(button){
      setPlanningPressed(button, planningAgents.indexOf(button.dataset.planAgent) >= 0);
    });
    $$("[data-plan-test]").forEach(function(button){
      setPlanningPressed(button, planningTest === button.dataset.planTest);
    });
    $$("[data-plan-question]").forEach(function(button){
      setPlanningPressed(button, planningQuestion !== null && planningQuestion === (button.dataset.planQuestion === "yes"));
    });
    $$("[data-plan-runtime]").forEach(function(button){
      setPlanningPressed(button, planningRuntime !== null && planningRuntime === (button.dataset.planRuntime === "yes"));
    });
    const transferField = $("#planTransferField");
    if(transferField) setPanelPassive(transferField, planningRuntime !== true);
    $$("[data-plan-transfer]").forEach(function(button){
      setPlanningPressed(button, planningTransfers.indexOf(button.dataset.planTransfer) >= 0);
    });
    const missing = planningValidation();
    const confirm = $("#planningConfirmBtn");
    if(confirm) confirm.disabled = Boolean(missing);
    const instant = $("#instantExportBtn");
    if(instant) instant.disabled = Boolean(missing) || ($("#exportWarning") && !$("#exportWarning").hidden);
    const hint = $("#planValidationHint");
    if(hint){
      hint.textContent = missing ? "Eksik seçim: " + missing : "Tüm planlama seçimleri tamam.";
      hint.classList.toggle("is-ready", !missing);
    }
  }
  function resetPlanningState(){
    planningMode = null;
    planningAgents = [];
    planningTest = null;
    planningRuntime = null;
    planningTransfers = [];
    planningQuestion = null;
    const note = $("#planNote");
    if(note) note.value = "";
    syncPlanningUI();
  }
  function handleExportCancel(){
    closeModal($("#exportModal"));
  }
  function handleExportBack(){
    setExportStep(1);
  }
  function currentPlanningState(){
    const note = $("#planNote");
    return {
      mode: planningMode,
      agents: planningAgents.slice(),
      test: planningTest,
      runtime: planningRuntime,
      transfers: planningTransfers.slice(),
      question: planningQuestion,
      note: note ? note.value.trim() : ""
    };
  }
  function currentExportOptions(){
    const modeInput = document.querySelector('input[name="exportMode"]:checked');
    const summaryInput = $("#includeSummary");
    return {
      mode: modeInput ? modeInput.value : "zip",
      includeSummary: summaryInput ? summaryInput.checked : true
    };
  }