  function instantPlanningState(planning){
    if(!planning) return null;
    return {
      mode: planning.mode,
      agents: Array.isArray(planning.agents) ? planning.agents.slice() : [],
      test: planning.test,
      runtime: planning.runtime,
      transfers: Array.isArray(planning.transfers) ? planning.transfers.slice() : [],
      question: planning.question,
      note: planning.note || ""
    };
  }
  async function startExportFlow(){
    if(!state.requests.length){
      showToast("Önce en az bir istek ekle.", "error");
      return;
    }
    const notReady = state.requests.filter(function(req){ return requestStatus(req) !== "ready"; }).length;
    if(state.exportBehavior === "instant" && state.lastExport && !notReady){
      const saved = state.lastExport;
      let mode = saved.mode === "embedded" ? "embedded" : "zip";
      const fileCount = state.requests.reduce(function(sum, req){
        return sum + (typeTemplate(req.type).attachments ? req.attachments.length : 0);
      }, 0);
      if(mode === "embedded" && fileCount > 0) mode = "zip";
      pendingExportOptions = {
        mode: mode,
        includeSummary: saved.includeSummary !== false
      };
      await executeExport(instantPlanningState(saved.planning));
      return;
    }
    renderExportModal();
    openModal($("#exportModal"));
  }
  async function instantExport(){
    const missing = planningValidation();
    if(missing){
      showToast(missing, "error");
      syncPlanningUI();
      return;
    }
    const formatInput = document.querySelector('input[name="exportMode"]:checked');
    const summaryInput = $("#includeSummary");
    const noteInput = $("#planNote");
    const planning = {
      mode: planningMode,
      agents: planningAgents.slice(),
      test: planningTest,
      runtime: planningRuntime,
      transfers: planningTransfers.slice(),
      question: planningQuestion,
      note: noteInput ? noteInput.value.trim() : ""
    };
    state.lastExport = {
      mode: formatInput && formatInput.value === "embedded" ? "embedded" : "zip",
      includeSummary: summaryInput ? summaryInput.checked : true,
      planning: instantPlanningState(planning),
      savedAt: nowISO()
    };
    state.exportBehavior = "instant";
    saveNow();
    closeModal($("#exportModal"));
    showToast("Seçimler kaydedildi. Sonraki dışa aktarımlar bu seçimlerle çalışacak.");
  }
  function confirmPlanning(){
    const missing = planningValidation();
    if(missing){
      showToast(missing, "error");
      syncPlanningUI();
      return;
    }
    const note = $("#planNote");
    const planning = {
      mode: planningMode,
      agents: planningAgents.slice(),
      test: planningTest,
      runtime: planningRuntime,
      transfers: planningTransfers.slice(),
      question: planningQuestion,
      note: note ? note.value.trim() : ""
    };
    executeExport(planning);
  }
  function doExport(){
    const notReady = state.requests.filter(function(req){ return requestStatus(req) !== "ready"; }).length;
    if(notReady){
      showToast("Önce tüm satırları hazır olarak işaretle.", "error");
      return;
    }
    const modeInput = document.querySelector('input[name="exportMode"]:checked');
    const mode = modeInput ? modeInput.value : "zip";
    const fileCount = state.requests.reduce(function(sum, req){
      return sum + (typeTemplate(req.type).attachments ? req.attachments.length : 0);
    }, 0);
    if(mode === "embedded" && fileCount > 0){
      showToast("Dosya ekleri yalnızca ZIP çıktısında taşınır.", "error");
      return;
    }
    const summaryInput = $("#includeSummary");
    pendingExportOptions = {
      mode: mode,
      includeSummary: summaryInput ? summaryInput.checked : true
    };
    setExportStep(2);
  }
  async function executeExport(planning){
    if(!pendingExportOptions){
      showToast("Dışa aktarma seçenekleri bulunamadı.", "error");
      return;
    }
    const options = pendingExportOptions;
    const mode = options.mode;
    const includeSummary = options.includeSummary;
    const button = $("#planningConfirmBtn");
    const oldLabel = "Dışa Aktar";
    if(button){ button.disabled = true; button.textContent = "Hazırlanıyor…"; }
    try{
      const useTarget = await prepareTargetFolder(false);
      const stamp = formatStamp();
      const baseName = "istek-defteri-" + stamp;
      const markdownName = baseName + ".md";
      const zipName = baseName + ".zip";
      let fileName = markdownName;
      let result = "download";
      let archiveName = "";
      let historyFormat = mode;
      if(mode === "zip"){
        const mediaFiles = await buildMediaFiles();
        const hasZip = mediaFiles.length > 0;
        if(!hasZip) historyFormat = "md";
        archiveName = hasZip ? zipName : "";
        const markdown = await buildMarkdown("zip", includeSummary, planning, archiveName);
        const mdBlob = new Blob([utf8Bytes(markdown, true)], { type:"text/markdown;charset=utf-8" });
        const outputs = [];
        outputs.push({ name: markdownName, result: await saveOutput(mdBlob, markdownName, useTarget, true) });
        if(hasZip){
          const zip = makeZip(mediaFiles);
          outputs.push({ name: zipName, result: await saveOutput(zip, zipName, useTarget, true) });
        }
        const allTarget = outputs.every(function(item){ return item.result === "target"; });
        fileName = outputs.map(function(item){ return item.name; }).join(" + ");
        result = allTarget ? "target" : "download";
        showToast((allTarget ? "Hedef klasöre kaydedildi: " : "İndirildi: ") + fileName);
      }else{
        const markdown = await buildMarkdown("embedded", includeSummary, planning);
        const blob = new Blob([utf8Bytes(markdown, true)], { type:"text/markdown;charset=utf-8" });
        result = await saveOutput(blob, fileName, useTarget);
      }
      const historyMarkdown = await buildMarkdown("none", includeSummary, planning, archiveName);
      const imageTotal = state.requests.reduce(function(sum, req){ return sum + req.images.length; }, 0);
      const attachmentTotal = state.requests.reduce(function(sum, req){
        return sum + (typeTemplate(req.type).attachments ? req.attachments.length : 0);
      }, 0);
      const signature = requestSignature();
      const snapshotRequests = JSON.parse(JSON.stringify(state.requests.map(function(req){ return serializeRequest(req); })));
      historyTab = "history";
      await addHistory({
        id: "hist_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
        exportedAt: nowISO(),
        project: state.project,
        format: historyFormat,
        fileName: fileName,
        target: result === "target" && targetFolderHandle ? targetFolderHandle.name : "İndirilenler",
        requestCount: state.requests.length,
        imageCount: imageTotal,
        fileCount: attachmentTotal,
        signature: signature,
        requests: snapshotRequests,
        markdown: historyMarkdown
      });
      stateDirtySinceExport = false;
      await markRecordsExported(signature);
      pendingExportOptions = null;
      state.lastExport = {
        mode: mode,
        includeSummary: includeSummary,
        planning: planning ? {
          mode: planning.mode,
          agents: (planning.agents || []).slice(),
          test: planning.test,
          runtime: planning.runtime,
          transfers: (planning.transfers || []).slice(),
          question: planning.question,
          note: planning.note || ""
        } : null,
        savedAt: nowISO()
      };
      saveNow();
      closeModal($("#exportModal"));
      openConfirm({
        title: "Dışa aktarma tamamlandı",
        message: "Çıktı " + (result === "target" ? "hedef klasöre kaydedildi" : "indirildi") + ": " + fileName + ". Mevcut talepleri temizlemek ister misin?",
        confirmLabel: "Talepleri temizle",
        cancelLabel: "Talepleri koru",
        danger: true,
        onConfirm: async function(){ await clearCurrentRequests(); }
      });
    }catch(err){
      console.error(err);
      showToast("Dışa aktarma başarısız oldu.", "error");
    }finally{
      if(button){ button.disabled = false; button.textContent = oldLabel || "Onayla"; }
    }
  }
  async function copyMarkdown(){
    const notReady = state.requests.filter(function(req){ return requestStatus(req) !== "ready"; }).length;
    if(notReady){
      showToast("Önce tüm satırları hazır olarak işaretle.", "error");
      return;
    }
    const summaryInput = $("#includeSummary");
    const includeSummary = summaryInput ? summaryInput.checked : true;
    try{
      const markdown = await buildMarkdown("none", includeSummary);
      const copied = await copyTextToClipboard(markdown);
      showToast(copied ? "Markdown metni panoya kopyalandı (görseller ve dosyalar hariç)." : "Panoya kopyalama başarısız oldu.", copied ? "ok" : "error");
    }catch(err){
      console.error(err);
      showToast("Markdown oluşturulamadı.", "error");
    }
  }
