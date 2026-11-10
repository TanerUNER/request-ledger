  /* ============================================================
     Tema
     ============================================================ */
  function syncTheme(){
    const rootEl = document.documentElement;
    const themeBtn = $("#themeBtn");
    const meta = $("#themeColor");
    if(!themeBtn) return;
    const dark = rootEl.getAttribute("data-theme") === "dark";
    themeBtn.setAttribute("aria-pressed", String(dark));
    themeBtn.setAttribute("aria-label", dark ? "Aydınlık mod" : "Karanlık mod");
    themeBtn.setAttribute("title", dark ? "Aydınlık mod" : "Karanlık mod");
    if(meta) meta.setAttribute("content", dark ? "#141312" : "#f7f5f2");
  }
  function setTheme(theme, silent){
    const next = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try{ localStorage.setItem(THEME_KEY, next); }catch(err){}
    syncTheme();
    if(typeof serverSaveUiConfig === "function") serverSaveUiConfig();
    if(!silent) showToast(next === "dark" ? "Karanlık mod açık." : "Aydınlık mod açık.");
  }
  function toggleTheme(){
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    setTheme(next);
  }
