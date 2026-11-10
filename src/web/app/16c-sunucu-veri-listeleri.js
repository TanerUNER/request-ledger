  /* ============================================================
     Server data lists: full backups in backups/ and per-project ZIPs in
     deleted-projects/. They reuse the backup modal, the .backupopt row look
     and the existing confirm/toast components.
     ============================================================ */

  function serverDataDate(value){
    const date = value ? new Date(value) : null;
    if(!date || isNaN(date.getTime())) return "";
    try{
      return date.toLocaleString(state.language === "tr" ? "tr-TR" : "en-GB", {
        year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit"
      });
    }catch(err){
      return date.toISOString().slice(0, 16).replace("T", " ");
    }
  }

  function serverDataRow(options){
    const row = document.createElement("div");
    row.className = "backupopt backupopt--row";
    const icon = document.createElement("span");
    icon.className = "backupopt__icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = options.icon || "";
    const body = document.createElement("span");
    body.className = "backupopt__body";
    const title = document.createElement("b");
    title.textContent = options.title || "";
    const sub = document.createElement("small");
    sub.textContent = options.sub || "";
    body.appendChild(title);
    body.appendChild(sub);
    const actions = document.createElement("span");
    actions.className = "backupopt__actions";
    (options.actions || []).forEach(function(action){
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn--small" + (action.danger ? " btn--danger" : "");
      button.textContent = action.label;
      button.addEventListener("click", function(event){
        event.preventDefault();
        event.stopPropagation();
        action.run();
      });
      actions.appendChild(button);
    });
    row.appendChild(icon);
    row.appendChild(body);
    row.appendChild(actions);
    return row;
  }

  function renderServerBackupRows(list){
    const mount = $("#serverBackupList");
    if(!mount) return;
    mount.innerHTML = "";
    if(!list.length){
      const empty = document.createElement("p");
      empty.className = "field__hint";
      empty.textContent = translateString("Henüz sunucuda yedek yok. Tam yedek indirdiğinde burada da saklanır.");
      mount.appendChild(empty);
      return;
    }
    list.forEach(function(item){
      mount.appendChild(serverDataRow({
        icon:"<svg width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"><path d=\"M4 7h16v13H4z\"/><path d=\"M8 7V4h8v3M9 13l2 2 4-4\"/></svg>",
        title:item.name,
        sub:serverDataDate(item.createdAt) + " · " + formatBytes(item.size),
        actions:[{
          label:translateString("Geri yükle"),
          run:function(){ restoreServerBackup(item.name); }
        }]
      }));
    });
  }

  function renderDeletedProjectRows(list){
    const mount = $("#deletedProjectList");
    if(!mount) return;
    mount.innerHTML = "";
    if(!list.length){
      const empty = document.createElement("p");
      empty.className = "field__hint";
      empty.textContent = translateString("Silinen proje yedeği yok.");
      mount.appendChild(empty);
      return;
    }
    list.forEach(function(item){
      mount.appendChild(serverDataRow({
        icon:"<svg width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"><path d=\"M4 6h16M9 6V4h6v2M7 6l1 14h8l1-14\"/></svg>",
        title:item.projectName || item.slug,
        sub:[serverDataDate(item.createdAt), formatBytes(item.size), item.slug].filter(Boolean).join(" · "),
        actions:[
          {
            label:translateString("Geri yükle"),
            run:function(){ restoreDeletedProject(item); }
          },
          {
            label:translateString("Sil"),
            danger:true,
            run:function(){ forgetDeletedProject(item); }
          }
        ]
      }));
    });
  }

  async function refreshServerDataLists(){
    const sections = $("#serverDataSections");
    const serverMode = typeof serverDiskEnabled === "function" && serverDiskEnabled();
    if(sections) sections.hidden = !serverMode;
    if(!serverMode) return;
    try{
      const results = await Promise.all([serverBackupList(), serverDeletedProjectList()]);
      renderServerBackupRows(results[0] || []);
      renderDeletedProjectRows(results[1] || []);
    }catch(err){
      renderServerBackupRows([]);
      renderDeletedProjectRows([]);
    }
  }

  async function restoreServerBackup(name){
    const file = await serverFetchBackupFile(name);
    if(!file){
      showToast(translateString("Yedek okunamadı."), "error");
      return;
    }
    try{
      await restoreBackupFile(file);
    }catch(err){
      showToast(translateString("Yedek okunamadı."), "error");
    }
  }

  function restoreDeletedProject(item){
    const label = item.projectName || item.slug;
    openConfirm({
      eyebrow: translateString("Silinen proje"),
      title: translateString("Proje geri yüklensin mi?"),
      message: translateString("Bu proje arşivden projects/ klasörüne geri yüklenecek ve proje listesine eklenecek:") + " " + label + ".",
      confirmLabel: translateString("Geri yükle"),
      cancelLabel: translateString("Vazgeç"),
      onConfirm: async function(){
        const result = await serverRestoreDeletedProject(item.name);
        if(!result || result.ok !== true){
          showToast(translateString("Proje geri yüklenemedi."), "error");
          return;
        }
        if(result.renamed){
          showToast(translateString("Aynı klasör adı dolu olduğu için proje şu adla geri yüklendi:") + " " + result.slug);
        }else{
          showToast(translateString("Proje geri yüklendi."));
        }
        if(typeof serverDiskBootstrap === "function"){
          await serverDiskBootstrap().catch(function(){});
        }
        if(typeof refreshServerDataLists === "function") await refreshServerDataLists();
        setTimeout(function(){ try{ window.location.reload(); }catch(err){ /* ignore */ } }, 900);
      }
    });
  }

  function forgetDeletedProject(item){
    openConfirm({
      eyebrow: translateString("Silinen proje"),
      title: translateString("Yedek silinsin mi?"),
      message: translateString("Bu silinen proje arşivi kalıcı olarak silinecek. Bu işlem geri alınamaz.") +
        " " + (item.projectName || item.slug) + ".",
      confirmLabel: translateString("Sil"),
      cancelLabel: translateString("Vazgeç"),
      danger: true,
      onConfirm: async function(){
        const ok = await serverForgetDeletedProject(item.name);
        if(!ok){
          showToast(translateString("Arşiv silinemedi."), "error");
          return;
        }
        showToast(translateString("Arşiv silindi."));
        await refreshServerDataLists();
      }
    });
  }
