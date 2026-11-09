  /* ============================================================
     Eksik satır gezinme
     ============================================================ */
  function jumpToRequest(id){
    const req = getReq(id);
    if(!req) return;
    let filtersChanged = false;
    if(!rowMatches(req)){
      resetFilters(false);
      filtersChanged = true;
    }
    state.requests.forEach(function(item){
      if(item.id !== id) item.collapsed = true;
    });
    req.collapsed = false;
    activeRowId = id;
    lastExpandedId = id;
    lastJumpId = id;
    let row = getRowEl(id);
    if(!row){
      renderList();
      row = getRowEl(id);
    }
    if(!row) return;
    updateAllRows();
    growRowTextareas(row);
    if(filtersChanged) applyFilters();
    row.classList.remove("req--flash");
    void row.offsetWidth;
    row.classList.add("req--flash");
    focusRowStart(id);
    refreshGlobal();
    if(filtersChanged) showToast("Filtreler temizlendi; " + req.id + " satırına gidildi.");
  }
  function jumpNextIncomplete(){
    const list = incompleteRequests();
    if(!list.length){
      showToast("Tüm talepler hazır. Dışa aktarabilirsin.");
      return;
    }
    let next = list[0];
    if(lastJumpId){
      const index = list.findIndex(function(req){ return req.id === lastJumpId; });
      if(index >= 0) next = list[(index + 1) % list.length];
    }
    jumpToRequest(next.id);
  }
