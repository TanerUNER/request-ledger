  async function addFilesToRow(rowId, files){
    const req = getReq(rowId);
    const row = getRowEl(rowId);
    if(!req) return;
    if(idbFailed || !idb){
      showToast("Görsel eklemek için tarayıcı depolaması kullanılamıyor.", "error");
      return;
    }
    const incoming = Array.prototype.slice.call(files || []).filter(function(file){
      return file && (String(file.type || "").indexOf("image/") === 0 || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name || ""));
    });
    if(!incoming.length){
      showToast("Yalnızca görsel dosyaları eklenebilir.", "error");
      return;
    }
    const slot = MAX_IMAGES - req.images.length;
    if(slot <= 0){
      showToast("Bir satıra en fazla " + MAX_IMAGES + " görsel eklenebilir.", "error");
      return;
    }
    const use = incoming.slice(0, slot);
    if(incoming.length > slot){
      showToast("Yalnızca ilk " + slot + " görsel eklendi.", "error");
    }
    processingRows.add(req.id);
    if(row) renderImages(row, req);
    let added = 0;
    let failed = 0;
    for(let i = 0; i < use.length; i++){
      const file = use[i];
      if(file.size > MAX_INPUT_MB * 1024 * 1024){
        failed++;
        showToast(file.name + " çok büyük (en fazla " + MAX_INPUT_MB + " MB).", "error");
        continue;
      }
      try{
        let result;
        try{
          result = await compressImage(file);
        }catch(compressErr){
          result = {
            blob: file,
            w: 0,
            h: 0,
            type: file.type || "image/png",
            ext: extFromMime(file.type || "image/png")
          };
        }
        const imageId = "img_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
        await idbPut({ id: imageId, blob: result.blob, type: result.type });
        req.images.push({
          id: imageId,
          name: file.name || "görsel",
          w: result.w,
          h: result.h,
          size: result.blob.size,
          type: result.type,
          ext: result.ext,
          file: ""
        });
        if(req.confirmed) req.confirmed = false;
        req.updatedAt = nowISO();
        added++;
        scheduleSave();
        const liveRow = getRowEl(req.id);
        if(liveRow){
          renderImages(liveRow, req);
          updateRowUI(liveRow, req);
        }
        refreshGlobal();
      }catch(err){
        console.error(err);
        failed++;
        showToast(file.name + " eklenemedi.", "error");
      }
    }
    processingRows.delete(req.id);
    const finalRow = getRowEl(req.id);
    if(finalRow){
      renderImages(finalRow, req);
      updateRowUI(finalRow, req);
    }
    refreshGlobal();
    if(added){
      showToast(added + " görsel eklendi." + (failed ? " " + failed + " görsel eklenemedi." : ""), failed ? "error" : "ok");
    }
  }

  async function addAttachmentsToRow(rowId, files){
    const req = getReq(rowId);
    if(!req) return;
    if(req.type !== "design"){
      showToast("Dosya eki yalnızca Tasarım türünde kullanılabilir.", "error");
      return;
    }
    if(idbFailed || !idb){
      showToast("Dosya eklemek için tarayıcı depolaması kullanılamıyor.", "error");
      return;
    }
    const incoming = Array.prototype.slice.call(files || []).filter(function(file){ return file && file.name; });
    if(!incoming.length) return;
    const slot = MAX_ATTACHMENTS - req.attachments.length;
    if(slot <= 0){
      showToast("Bir satıra en fazla " + MAX_ATTACHMENTS + " dosya eklenebilir.", "error");
      return;
    }
    const use = incoming.slice(0, slot);
    if(incoming.length > slot) showToast("Yalnızca ilk " + slot + " dosya eklendi.", "error");
    let added = 0;
    let failed = 0;
    for(let i = 0; i < use.length; i++){
      const file = use[i];
      if(file.size > MAX_FILE_MB * 1024 * 1024){
        failed++;
        showToast(file.name + " çok büyük (en fazla " + MAX_FILE_MB + " MB).", "error");
        continue;
      }
      try{
        const fileId = "file_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
        await idbFilePut({ id: fileId, blob: file, type: file.type || "application/octet-stream" });
        req.attachments.push({
          id: fileId,
          name: file.name,
          size: file.size,
          type: file.type || "application/octet-stream",
          ext: extFromFileName(file.name),
          file: ""
        });
        if(req.confirmed) req.confirmed = false;
        req.updatedAt = nowISO();
        added++;
        scheduleSave();
        const liveRow = getRowEl(req.id);
        if(liveRow){
          renderAttachments(liveRow, req);
          updateRowUI(liveRow, req);
        }
        refreshGlobal();
      }catch(err){
        console.error(err);
        failed++;
        showToast(file.name + " eklenemedi.", "error");
      }
    }
    const finalRow = getRowEl(req.id);
    if(finalRow){
      renderAttachments(finalRow, req);
      updateRowUI(finalRow, req);
    }
    refreshGlobal();
    if(added){
      showToast(added + " dosya eklendi." + (failed ? " " + failed + " dosya eklenemedi." : ""), failed ? "error" : "ok");
    }
  }
  function renderAttachments(row, req){
    const box = $("[data-attachbox]", row);
    if(!box) return;
    box.innerHTML = "";
    row.__attachmentSig = rowAttachmentSignature(req);
    if(!req.attachments.length){
      const empty = document.createElement("div");
      empty.className = "attach-empty";
      empty.innerHTML =
        '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M21 11.5l-8.8 8.8a5 5 0 0 1-7.1-7.1l9.2-9.2a3.4 3.4 0 0 1 4.8 4.8l-9.2 9.2a1.8 1.8 0 0 1-2.5-2.5l8.5-8.5"/></svg>' +
        '<b>Örnek dosya ekle</b>' +
        '<span>.html, .css, .js, .pdf vb. — en fazla ' + MAX_ATTACHMENTS + ' dosya</span>' +
        '<button class="btn btn--ghost btn--small" type="button" data-action="add-attachment">Dosya seç</button>';
      box.appendChild(empty);
      return;
    }
    const list = document.createElement("div");
    list.className = "attachlist";
    req.attachments.forEach(function(att){
      const item = document.createElement("div");
      item.className = "attachitem";
      const icon = document.createElement("span");
      icon.className = "attachitem__icon";
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
      const body = document.createElement("span");
      body.className = "attachitem__body";
      const name = document.createElement("b");
      name.textContent = att.name;
      const meta = document.createElement("small");
      meta.textContent = formatBytes(att.size) + (att.ext ? " · " + att.ext.toUpperCase() : "");
      body.appendChild(name);
      body.appendChild(meta);
      const del = document.createElement("button");
      del.type = "button";
      del.className = "attachitem__del";
      del.dataset.action = "remove-attachment";
      del.dataset.attachmentId = att.id;
      del.setAttribute("aria-label", att.name + " dosyasını kaldır");
      del.textContent = "×";
      item.appendChild(icon);
      item.appendChild(body);
      item.appendChild(del);
      list.appendChild(item);
    });
    if(req.attachments.length < MAX_ATTACHMENTS){
      const add = document.createElement("button");
      add.type = "button";
      add.className = "attach-add";
      add.dataset.action = "add-attachment";
      add.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg> Dosya ekle';
      list.appendChild(add);
    }
    box.appendChild(list);
  }
  function removeAttachment(req, attachmentId){
    const index = req.attachments.findIndex(function(att){ return att.id === attachmentId; });
    if(index < 0) return;
    req.attachments.splice(index, 1);
    if(!snapshotReferencesMedia(attachmentId)) idbFileDelete(attachmentId).catch(function(){});
    if(req.confirmed) req.confirmed = false;
    req.updatedAt = nowISO();
    scheduleSave();
    const row = getRowEl(req.id);
    if(row){
      renderAttachments(row, req);
      updateRowUI(row, req);
    }
    refreshGlobal();
    showToast("Dosya kaldırıldı.");
  }
