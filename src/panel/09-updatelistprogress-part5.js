  function updateListProgress(total){
    var node = document.getElementById("rl-list-progress");
    if(!node) return;
    var ready = 0;
    app.requests.forEach(function(req){ if(statusOf(req) === "ready") ready++; });
    var missing = total - ready;

    var text = node.querySelector(".lp-text");
    if(text) text.textContent = t(ready + " / " + total + " hazır");
    var miss = node.querySelector(".lp-missing");
    if(miss) miss.textContent = t(missing + " eksik");
    var fill = node.querySelector(".lp-bar i");
    if(fill) fill.style.width = (total ? Math.round((ready / total) * 100) : 0) + "%";
    node.classList.toggle("is-complete", total > 0 && missing === 0);
    node.disabled = total === 0;
  }

  function fillListEmpty(total, visible){
    var empty = document.getElementById("rl-empty");
    if(!empty) return;
    if(total > 0 && visible > 0){
      empty.hidden = true;
      empty.textContent = "";
      return;
    }
    empty.textContent = "";
    empty.hidden = false;

    var icon = h("span", "empty-ic");
    icon.innerHTML = ICONS.list;
    icon.setAttribute("aria-hidden", "true");
    empty.appendChild(icon);

    if(!total){
      empty.appendChild(h("b", null, t("Henüz istek yok")));
      empty.appendChild(h("span", "empty-sub", t("İlk isteği ekleyerek başla.")));
      var add = h("button", "btn btn--small", t("İlk isteği ekle"));
      add.type = "button";
      add.setAttribute("data-act", "goto-new");
      empty.appendChild(add);
      return;
    }

    empty.appendChild(h("b", null, lx("noMatch")));
    empty.appendChild(h("span", "empty-sub", lx("noMatchSub")));
    var clear = h("button", "btn btn--small", t("Filtreleri temizle"));
    clear.type = "button";
    clear.setAttribute("data-act", "clear-filters");
    empty.appendChild(clear);
  }

  function buildListRow(req, selection){
    var status = statusOf(req);
    var row = h("article", "rrow rrow--" + status);
    row.setAttribute("data-request-id", req.id);
    row.setAttribute("data-status", status);
    if(req.id === selection){
      row.classList.add("is-highlight");
      row.setAttribute("aria-current", "true");
    }

    var main = h("button", "rrow-main");
    main.type = "button";
    main.setAttribute("data-act", "open-request");

    var tick = h("span", "rtick", status === "ready" ? "✓" : "");
    tick.setAttribute("aria-hidden", "true");
    tick.title = statusLabel(status);
    main.appendChild(tick);

    var text = h("span", "rrow-text");
    var top = h("span", "rrow-top");
    top.appendChild(h("span", "rrow-id", req.id));
    top.appendChild(h("span", "rtag rtag--" + req.type, t(typeInfo(req.type).label)));
    text.appendChild(top);
    text.appendChild(h("span", "rrow-title", (req.title && String(req.title).trim()) ? req.title : t("Başlıksız istek")));
    text.appendChild(h("span", "rrow-meta", listMeta(req, status)));
    main.appendChild(text);
    row.appendChild(main);

    var more = h("button", "rrow-more", "⋯");
    more.type = "button";
    more.setAttribute("data-act", "row-menu");
    more.setAttribute("aria-label", lx("rowActions"));
    more.title = lx("rowActions");
    row.appendChild(more);

    if(openRowMenuId === req.id) row.appendChild(buildRowMenu());
    if(listDeleteId === req.id) row.appendChild(buildRowConfirm(req));
    return row;
  }

  function listMeta(req, status){
    var page = (req.page || "").trim();
    var location = (req.location || "").trim();
    var place = page ? (location ? page + " › " + location : page) : (location || lx("noPage"));
    return place + " · " + t((req.images || []).length + " görsel") + " · " + statusLabel(status);
  }

  function buildRowMenu(){
    var menu = h("div", "rowmenu");
    menu.setAttribute("role", "menu");
    [["duplicate", t("Çoğalt")], ["up", t("Yukarı taşı")], ["down", t("Aşağı taşı")]].forEach(function(item){
      var btn = h("button", null, item[1]);
      btn.type = "button";
      btn.setAttribute("role", "menuitem");
      btn.setAttribute("data-row-action", item[0]);
      menu.appendChild(btn);
    });
    menu.appendChild(h("div", "msep"));
    var del = h("button", "is-danger", t("Sil"));
    del.type = "button";
    del.setAttribute("role", "menuitem");
    del.setAttribute("data-row-action", "delete");
    menu.appendChild(del);
    return menu;
  }

  function buildRowConfirm(req){
    var box = h("div", "row-confirm mini-confirm");
    box.setAttribute("role", "alertdialog");
    box.appendChild(h("p", "mc-text", lx("deleteRow")));
    box.appendChild(h("p", "mc-sub", req.id + " · " + lx("deleteRowSub")));
    var actions = h("div", "mc-actions");
    var del = h("button", "btn btn--small btn--danger", t("Sil"));
    del.type = "button";
    del.setAttribute("data-row-action", "delete-confirm");
    var back = h("button", "btn btn--small", t("Vazgeç"));
    back.type = "button";
    back.setAttribute("data-row-action", "delete-cancel");
    actions.appendChild(del);
    actions.appendChild(back);
    box.appendChild(actions);
    return box;
  }

  function revealListRow(row){
    if(!row || !els.body) return;
    var bodyRect = els.body.getBoundingClientRect();
    var rowRect = row.getBoundingClientRect();
    var topPad = 56; /* sticky progress strip */
    var bottomPad = 14;
    if(rowRect.top < bodyRect.top + topPad){
      els.body.scrollTop -= (bodyRect.top + topPad - rowRect.top);
    }else if(rowRect.bottom > bodyRect.bottom - bottomPad){
      els.body.scrollTop += (rowRect.bottom - (bodyRect.bottom - bottomPad));
    }
    updateScrollAffordance();
  }

  /* clamps the status filter + counts after row mutations */
  function refreshList(){
    if(state.section === "list") updateList();
  }

  /* Keystrokes coalesce into one render per frame-ish slice: a 100-row list
     never rebuilds synchronously inside the input handler. */
  function refreshListSoon(){
    if(searchTimer) return;
    searchTimer = setTimeout(function(){
      searchTimer = null;
      refreshList();
    }, 40);
  }
