/* Request Ledger - toolbar popup.
   Static About card: version comes from the manifest, never from a second
   hand-maintained number. No network access; links open in a browser tab. */
(function () {
  "use strict";

  function byId(id) {
    return document.getElementById(id);
  }

  try {
    var manifest = chrome.runtime.getManifest();
    var version = byId("aboutVersion");
    if (version && manifest && manifest.version) { version.textContent = manifest.version; }
  } catch (error) { /* standalone preview keeps the fallback */ }

  if (String(navigator.language || "").toLowerCase().indexOf("tr") === 0) {
    var desc = byId("aboutDesc");
    var note = byId("aboutNote");
    var repo = byId("aboutRepo");
    var support = byId("aboutSupport");
    if (desc) { desc.textContent = "Geliştirme isteklerini toplamak, önceliklendirmek ve dışa aktarmak için yerel öncelikli istek defteri."; }
    if (note) { note.textContent = "Bu uzantı için Request Ledger uygulaması açık olmalıdır. Uygulama başlayana kadar gizli kalır."; }
    if (repo) { repo.textContent = "Depo"; }
    if (support) { support.textContent = "Destek"; }
  }
})();
