  /* ============================================================
     Modal yönetimi
     ============================================================ */
  function openModal(modal){
    if(!modal) return;
    if(activeModal && activeModal !== modal) closeModal(activeModal, false);
    lastFocus = document.activeElement;
    activeModal = modal;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    setTimeout(function(){
      const target = modal.querySelector("[data-autofocus]") || modal.querySelector("input, select, textarea, button");
      if(target) target.focus();
    }, 40);
  }
  function closeModal(modal, restoreFocus){
    const target = modal || activeModal;
    if(!target) return;
    target.classList.remove("is-open");
    target.setAttribute("aria-hidden", "true");
    if(target === $("#confirmModal")){
      confirmAction = null;
      confirmAltAction = null;
    }
    if(target === $("#projectSettingsModal")) projectSettingsId = null;
    if(target === $("#onboardingModal") && typeof markOnboardingSeen === "function") markOnboardingSeen();
    if(activeModal === target) activeModal = null;
    if(!activeModal) document.body.classList.remove("modal-open");
    if(restoreFocus !== false && lastFocus && lastFocus.focus && lastFocus.offsetParent !== null){
      try{ lastFocus.focus(); }catch(err){}
    }
  }
  function trapFocus(event, box){
    if(event.key !== "Tab") return;
    const focusable = $$('a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])', box).filter(function(el){ return el.offsetParent !== null; });
    if(!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if(event.shiftKey && document.activeElement === first){
      event.preventDefault();
      last.focus();
    }else if(!event.shiftKey && document.activeElement === last){
      event.preventDefault();
      first.focus();
    }
  }
  function openConfirm(options){
    options = options || {};
    const title = $("#confirmTitle");
    const message = $("#confirmMessage");
    const ok = $("#confirmOkBtn");
    const cancel = $("#confirmCancelBtn");
    const alt = $("#confirmAltBtn");
    const eyebrow = $("#confirmEyebrow");
    if(title) title.textContent = options.title || "Emin misin?";
    if(message) message.textContent = options.message || "";
    if(eyebrow) eyebrow.textContent = options.eyebrow || (options.danger ? "Dikkat" : "Onay");
    if(cancel) cancel.textContent = options.cancelLabel || "Vazgeç";
    if(alt){
      alt.hidden = !options.altLabel;
      alt.textContent = options.altLabel || "";
    }
    if(ok){
      ok.textContent = options.confirmLabel || "Onayla";
      ok.className = "btn " + (options.danger ? "btn--danger" : "btn--primary");
    }
    confirmAction = options.onConfirm || null;
    confirmAltAction = options.onAlt || null;
    openModal($("#confirmModal"));
    if(ok) ok.focus();
  }
