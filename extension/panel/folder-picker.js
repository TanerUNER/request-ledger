/* Top-level extension page: File System Access directory picker.
 *
 * The panel runs inside a cross-origin page iframe where Chrome blocks
 * showDirectoryPicker and <input webkitdirectory> opens a file-upload dialog.
 * This small extension-origin window is top-level, so the real folder picker
 * is available. The chosen name is stored and broadcast to the panels.
 */
(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  var target = params.get("target") === "export" ? "export" : "root";
  var storageKey = target === "export" ? "rl-export-dir" : "rl-root-dir";
  var pick = document.getElementById("pick");
  var status = document.getElementById("status");
  var title = document.getElementById("title");
  var hint = document.getElementById("hint");
  var isEn = (navigator.language || "tr").toLowerCase().indexOf("tr") !== 0;

  if (isEn) {
    title.textContent = "Select folder";
    hint.textContent =
      "Choose the " + (target === "export" ? "export target" : "root") +
      " folder. Only the target name is saved; output still goes to browser downloads.";
    pick.textContent = "Select folder";
  }

  function send(name) {
    try {
      chrome.storage.local.set({ [storageKey]: name });
    } catch (error) { /* ignore */ }
    try {
      chrome.runtime.sendMessage({
        type: "RL_FOLDER_PICKED",
        target: target,
        name: name
      });
    } catch (error) { /* ignore */ }
  }

  function closeSoon() {
    try { window.close(); } catch (error) { /* ignore */ }
  }

  pick.addEventListener("click", function () {
    if (typeof window.showDirectoryPicker !== "function") {
      status.textContent = isEn
        ? "The folder picker is not available in this Chrome build."
        : "Bu Chrome sürümünde klasör seçici kullanılamıyor.";
      return;
    }
    pick.disabled = true;
    status.textContent = "";
    var pending;
    try {
      /* read is enough to choose a target; exports still use downloads */
      pending = window.showDirectoryPicker({ mode: "read" });
    } catch (error) {
      pick.disabled = false;
      status.textContent = isEn ? "Could not open the folder picker." : "Klasör seçici açılamadı.";
      return;
    }
    Promise.resolve(pending).then(function (handle) {
      var name = handle && handle.name ? String(handle.name) : "";
      if (!name) {
        pick.disabled = false;
        status.textContent = isEn ? "No folder selected." : "Klasör seçilmedi.";
        return;
      }
      send(name);
      status.textContent = isEn ? "Selected: " + name : "Seçildi: " + name;
      setTimeout(closeSoon, 350);
    }).catch(function (error) {
      pick.disabled = false;
      if (error && error.name === "AbortError") {
        status.textContent = isEn ? "Selection cancelled." : "Seçim iptal edildi.";
        setTimeout(closeSoon, 500);
        return;
      }
      status.textContent = isEn ? "Could not select the folder." : "Klasör seçilemedi.";
    });
  });
})();
