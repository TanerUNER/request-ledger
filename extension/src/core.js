/* ============================================================
   Istek Defteri · shared logic core (extension/src/core.js)

   GENERATED FILE — do not edit by hand.
   Source: src/core/*.mjs · Build: node scripts/build.cjs

   Classic script. Attaches window.IstekCore and globalThis.IstekCore.
   No DOM / storage / network access at load time.
   Behaviour ported from index.html (IIFE 1566-7757).
   ============================================================ */
(function(){
  "use strict";

  /* ---------- constants.mjs ---------- */
/*
  Domain constants — single source of truth.

  Ported verbatim from the previous monolithic core (v1.9.1). This module is now the
  source of truth; scripts/build-core.cjs emits the classic extension/src/core.js from it
  and tests/parity/core.parity.mjs proves the generated file keeps the old behaviour.
*/

const DB = {
  name: "oz-istek-defteri",
  version: 5,
  stores: {
    images: "images",
    files: "files",
    settings: "settings",
    history: "history",
    records: "records",
    drafts: "drafts",
  },
};

const LIMITS = {
  MAX_IMAGES: 8,
  MAX_ATTACHMENTS: 3,
  MAX_INPUT_MB: 15,
  MAX_FILE_MB: 10,
  MAX_DIM: 1600,
  JPEG_QUALITY: 0.82,
};

const TYPES = [
  { id: "feature", label: "Yeni Özellik", cls: "tag--feature", ph: "Yeni özellik ne yapmalı? Hangi sorunu çözüyor?", desc: "Yeni bir işlev, ekran veya akış ekle." },
  { id: "update", label: "Güncelleme", cls: "tag--update", ph: "Neyin değişmesini istiyorsun? Ekranda nasıl görünmeli?", desc: "Mevcut bir alanı, akışı veya davranışı değiştir." },
  { id: "remove", label: "Kaldırma", cls: "tag--remove", ph: "Ne kaldırılmalı ve neden?", desc: "Bir öğeyi, alanı veya akışı kaldır." },
  { id: "design", label: "Tasarım / İçerik", cls: "tag--design", ph: "Hangi metin, renk, boşluk veya bileşen değişmeli?", desc: "Tasarım, metin, görsel veya örnek dosya paylaş." },
  { id: "question", label: "Soru", cls: "tag--question", ph: "Sorunuzu net yazın; gerekirse ekran görüntüsü ekleyin.", desc: "Proje veya uygulama hakkında soru sor." },
  { id: "bug", label: "Hata", cls: "tag--bug", ph: "Hata nasıl ortaya çıkıyor? Beklenen ve gerçekleşen davranış ne?", desc: "Hata, console kaydı veya beklenmeyen davranış bildir." },
];

const TYPE_MAP = {};
TYPES.forEach((type) => {
  TYPE_MAP[type.id] = type;
});

const PRIORITIES = [
  { id: "low", label: "Düşük", cls: "prio--low" },
  { id: "normal", label: "Normal", cls: "prio--normal" },
  { id: "high", label: "Yüksek", cls: "prio--high" },
  { id: "critical", label: "Kritik", cls: "prio--critical" },
];

const PRIORITY_MAP = {};
PRIORITIES.forEach((priority) => {
  PRIORITY_MAP[priority.id] = priority;
});

const AGENT_ROLES = [
  { id: "team_leader", label: "Team Leader", cls: "agent-role--team_leader" },
  { id: "backend", label: "Backend", cls: "agent-role--backend" },
  { id: "frontend", label: "Frontend", cls: "agent-role--frontend" },
  { id: "qa", label: "QA Tester", cls: "agent-role--qa" },
  { id: "security", label: "App. Security", cls: "agent-role--security" },
  { id: "explorer", label: "Explorer", cls: "agent-role--explorer" },
  { id: "general", label: "General", cls: "agent-role--general" },
];

const AGENT_ROLE_MAP = {};
const AGENT_ROLE_ORDER = {};
AGENT_ROLES.forEach((role, index) => {
  AGENT_ROLE_MAP[role.id] = role;
  role.order = index;
});
AGENT_ROLES.forEach((role) => {
  AGENT_ROLE_ORDER[role.id] = role.order;
});

const PLANNING_TESTS = [
  { id: "full", label: "Tam koşu", note: "Yapılması gereken bütün testler gerçekleştirilebilir.", noteEn: "All required tests can be performed." },
  {
    id: "light",
    label: "Hafif koşu",
    note: "Testler sonrası hata dönüyorsa fix işlemlerinden sonra sadece ilgili dosyalarda ve hata alınan bölümlerde test işlemi yapılacak. Bütün fixler gerçekleştirildikten sonra bir kez tam koşu yapılır. Tam koşu sonucunda yine hata alınırsa döngü devam eder. (Kodlama > Test > Hata Yok > Full Test > Hata > İlgili hata için fix > İlgili hata için Test > Hata yok > Full Test)",
    noteEn: "If errors are found after testing, run tests only on the affected files and areas after fixes. Once all fixes are complete, perform one full run. If the full run still fails, repeat the loop. (Coding > Test > No Error > Full Test > Error > Fix the error > Test the error > No Error > Full Test)",
  },
  { id: "none", label: "Test yok", note: "Sadece Backend ve Frontend Dev test yapabilirler. Bu istekler için QA Tester ajanı çağırılmayacak.", noteEn: "Only Backend and Frontend Dev can test. The QA Tester agent is not called for these requests." },
];

const PLANNING_FULL_TEXT = "Seçilen ajanlar (varsa) verilen isteklerin yerine getirilmesi için kullanılabilir. Yapılan işlemler sonrası için yapılacak testler Tam koşu yapılabilir. Yapılan testlerde hata alındığında ilgili ajanlar fix işlemlerini yerine getirebilir sonrasında tekrar tam koşu testi yapılabilir. Testlerin tekrarında herhangi bir kısıtlama yoktur.";
const PLANNING_LIGHT_TEXT = "Seçilen ajanlar (varsa) verilen isteklerin yerine getirilmesi için kullanılabilir. Yapılacak işlemler sonrası için yapılacak testler hafifletilmiş olarak yapılacak. Yapılan testlerde hata alındığında ilgili ajanlar fix işlemlerini yerine getirdikten sonra sadece hata alınan bölümlerde test işlemleri yapılsın. Hata alınmadığı durumda en son bir kez olmak kaydı ile tam koşu testi yapılabilir.";
const PLANNING_FULL_TEXT_EN = "Selected agents, if any, can be used to fulfill the requested items. Full test runs can be performed after the work is completed. If errors are found, the relevant agents can apply fixes and then run the full test suite again. There is no limit on test repetitions.";
const PLANNING_LIGHT_TEXT_EN = "Selected agents, if any, can be used to fulfill the requested items. Tests after the work will be run in a lightweight mode. If errors are found, the relevant agents apply fixes and then test only the affected areas. If no errors remain, one final full test run can be performed.";

const TYPE_TEMPLATES = {
  update: { page: true, location: true, console: false, attachments: false, sampleWebsite: false, link: true },
  feature: { page: false, location: false, console: false, attachments: false, sampleWebsite: false, link: false },
  question: { page: true, location: true, console: false, attachments: false, sampleWebsite: false, link: true },
  bug: { page: true, location: true, console: true, attachments: false, sampleWebsite: false, link: true },
  remove: { page: true, location: true, console: false, attachments: false, sampleWebsite: false, link: true },
  design: { page: true, location: true, console: false, attachments: true, sampleWebsite: true, link: true },
};

/* Release history shown by the panel's Update History section. */

const CHANGELOG = [
  {
    version: "1.10.1",
    area: "extension",
    date: "2026-11-11",
    tr: {
      features: [],
      updates: [
        "Eklenti tarayıcı yeniden başlatıldığında uygulamayı doğrulamadan görünmez; önceki oturumun bağlantı durumu artık kalıcı değildir."
      ],
      fixes: [
        "Uygulama kapalıyken tarayıcı yeniden başlatıldığında eklentinin sayfalarda görünmesine neden olan eski varlık kaydı düzeltildi."
      ]
    },
    en: {
      features: [],
      updates: [
        "The extension stays hidden after a browser restart until it verifies the app; a previous session's connection state is no longer trusted."
      ],
      fixes: [
        "Fixed stale presence making the companion appear on pages after a browser restart with the app closed."
      ]
    }
  },
  {
    version: "1.10.0",
    area: "extension",
    date: "2026-11-10",
    tr: {
      features: [
        "Proje silme sunucudaki proje klasörünü de kaldırır; yedek saklama seçeneği deleted-projects/ altında ZIP oluşturur ve bu arşivler geri yüklenebilir.",
        "Rail'de durdur düğmesi yerine durum noktası ve port gösterilir; port değişikliği sessizce yeni sunucuya geçer.",
        "Dil ve tema sunucuda saklanır; port değişimi ve yeniden başlatmada korunur."
      ],
      updates: [
        "Köprü arayüzünde 'Uzantı' yerine 'Eklenti' kullanılır.",
        "Metin (JSON) yedeği kaldırıldı; yalnızca tam ZIP yedeği kalır."
      ],
      fixes: [
        "Port değişikliği yeni sunucu yanıt verene kadar tamamlanmaz; başarısız olursa eski sunucu çalışmaya devam eder."
      ]
    },
    en: {
      features: [
        "Deleting a project removes its server folder too; keeping a backup writes a ZIP under deleted-projects/ that can be restored later.",
        "The rail shows a status dot and the port instead of a stop button; a port change moves to the new server silently.",
        "Language and theme are stored on the server and survive a port change and a restart."
      ],
      updates: [
        "The bridge UI says \"Eklenti\" instead of \"Uzantı\" in Turkish.",
        "The text (JSON) backup was removed; only the full ZIP backup remains."
      ],
      fixes: [
        "A port change only completes after the new server answers; on failure the old server keeps running."
      ]
    }
  },
  {
    version: "1.9.5",
    area: "extension",
    date: "2026-11-09",
    tr: {
      features: [
        "Panel düzenlemeleri ve Hazır onayı 1 saniye içinde uygulamaya yansır; uygulamadaki düzenlemeler de panelde yeniden yükleme olmadan görünür.",
        "Yerel sunucu uygulama sekmesi açıkken kapanmaz; arka planda bekleyen sekme sunucuyu düşürmez, F5 aynı portta devam eder."
      ],
      updates: [
        "Projeler ve İstekler bölümü tek sekme şeridi ve tek içerik alanına toparlandı; yinelenen ayırıcı ve sekme görünümü kaldırıldı.",
        "İstenen port aynı uygulamaya aitse yeniden kullanılır; farklı bir süreçteyse boş porta geçilir ve kullanıcı uyarılır."
      ],
      fixes: [
        "Köprü proje benimsemesi artık panelde bir bölümü kendiliğinden açmaz; kullanıcının son açık bölümü korunur.",
        "Hazır onayı yeni bir revizyon damgası taşır; eşitleme sırasında onay durumu düşmez.",
        "Proje kimliği köprüde ayrıştırıldı: farklı projeler iki defter uyarısı üretmez, yeniden yükleme son projeyi ve kendi defterini açar, eski “Ortak Zemin” kaydı “İçe aktarılan proje” olarak yeniden adlandırılır."
      ]
    },
    en: {
      features: [
        "Panel edits and the Ready toggle reach the app within 1 second; app edits appear in the panel without a reload.",
        "The local server stays up while the app tab is open; a backgrounded tab cannot kill it and F5 continues on the same port."
      ],
      updates: [
        "Projects and Requests now use one tab strip and one content pane; duplicate dividers and the tab-like project action were removed.",
        "A requested port held by the same app is reused; an unrelated busy port falls back with a visible warning."
      ],
      fixes: [
        "Bridge project adoption no longer opens a panel section by itself; the user's last explicit section is preserved.",
        "The Ready toggle carries a new revision, so item-level sync no longer drops the confirmation.",
        "Project identity is bridge-scoped: different projects never trigger a global ledger conflict, reload reopens the last project and its own ledger, and the old “Ortak Zemin” record is renamed “Imported project”."
      ]
    }
  },
  {
    version: "1.9.4",
    area: "extension",
    date: "2026-11-09",
    tr: {
      features: [
        "Proje kayıt defteri: her proje ayrı defter, görseller, dosyalar, Kayıtlar, Taslaklar ve arşivle tutulur; panel açık projeyi izler.",
        "Proje başına medya ve yedek uyumu: ZIP tüm projeleri ve medyayı taşır; v4 yedekleri okunur, eski v3 yedekleri tek projeye geri yüklenir.",
        "Proje kimliğine göre canlı köprü: eşleşen projelerdeki istekler iki yönlü eşitlenir, farklı projeler karışmaz.",
        "Öğe seçici, ekran görüntüsü ve öğe + ekran görüntüsü: seçilen sekmede çalışır, sayfa ve konumu doldurur, görseli isteğe ekler.",
        "Yeni logo ve açıcı: terracotta kare, üç çizgi ve adaçayı yeşili onay damgası; 44 px açıcı aynı işareti taşır.",
        "İlk kurulum ve mod seçimi: tek HTML dosyası veya yerel sunucu, uzantı durumu ve yetenek tablosu."
      ],
      updates: [
        "Köprü artık file://, her localhost portu ve 127.0.0.1 kaynaklarını kabul eder; 127.0.0.1 dışındaki uzak kaynaklar reddedilir.",
        "Yerel sunucu modu boş port seçer, son portu hatırlar; canlı sekme varken kapanmaz, sekme kapanınca en az 5 dakika bekler.",
        "Arayüz metinleri temizlendi: yinelenen başlıklar, İngilizce arayüzde kalan Türkçe metinler ve yedek açıklamaları sadeleştirildi."
      ],
      fixes: [
        "Eşit zaman damgalı isteklerde yerel kayıt korunur; canlı eşitleme veri kaybetmez.",
        "Dosya sayfalarında köprü mesaj kimliği null olarak doğrulanır.",
        "Flyout işaretçi oku panelin kenarıyla hizalandı ve ayrıntı panelinin yüksekliği sabit kaldı."
      ]
    },
    en: {
      features: [
        "Project registry: each project keeps its own ledger, images, files, Records, Drafts and archive, and the panel follows the open project.",
        "Per-project media and backup compatibility: the ZIP carries every project and its media; v4 backups are read and older v3 backups restore into a single project.",
        "Project-aware live bridge: requests with matching project ids sync both ways, and different projects never merge.",
        "Element picker, screenshot and element + screenshot run in the chosen tab, fill the page and location, and attach the image to the request.",
        "New logo and opener: a terracotta tile, three ruled lines and a sage check stamp; the 44 px opener carries the same mark.",
        "First-run setup and mode choice: single HTML file or local server, extension status and a capability table."
      ],
      updates: [
        "The bridge accepts file://, every localhost port and 127.0.0.1 origins; remote origins outside that set are rejected.",
        "Local server mode picks a free port and remembers the last port; it stays up while a tab is live and waits at least 5 minutes after it closes.",
        "Interface copy cleanup: duplicate headings, Turkish strings left in the English interface and backup descriptions were simplified."
      ],
      fixes: [
        "Equal-timestamp requests keep the local record, so live sync no longer drops a just-written field.",
        "File pages validate the opaque null bridge message identity.",
        "The flyout pointer arrow lines up with the panel edge and the detail panel keeps a stable height."
      ]
    }
  },
  {
    version: "1.9.3",
    area: "extension",
    date: "2026-11-09",
    tr: {
      features: [
        "Proje kayıt defteri: uzantı her projeyi ayrı defter, medya ve arşivle tutar; proje değiştirince panel o projeye geçer.",
        "Proje başına görseller, dosya ekleri, Kayıtlar ve Taslaklar; yedek v4 tüm projeleri taşır.",
        "Uygulamayla canlı bağlantı proje kimliğine göre çalışır; farklı projedeki panel veriyi karıştırmaz.",
        "Öğe seçici uygulamadan başka bir sekmede çalışır ve sayfa ile konumu doldurur."
      ],
      updates: [
        "Köprü izin listesi her localhost portunu kapsar; boş portla başlatılan yerel sunucu da bağlanır.",
        "Metin temizliği: kalan Türkçe metinler, yinelenen başlıklar ve yedek açıklamaları sadeleştirildi."
      ],
      fixes: [
        "Flyout işaretçi oku panelin kenarıyla hizalandı.",
        "İstek yeniden açıldığında ayrıntı panelinin yüksekliği değişmiyor."
      ]
    },
    en: {
      features: [
        "Project registry: the extension keeps a separate ledger, media and archive per project and follows the app's open project.",
        "Per-project images, attachments, Records and Drafts; backup v4 carries every project.",
        "The live bridge follows project ids; a panel on another project never merges data across projects.",
        "The element picker runs on another tab from the app and fills the page and location."
      ],
      updates: [
        "The bridge allowlist covers every localhost port, including a local server started on a free port.",
        "Copy cleanup: remaining Turkish text, duplicate headings and backup descriptions were simplified."
      ],
      fixes: [
        "The flyout pointer arrow lines up with the panel edge.",
        "Reopening a request no longer changes the detail panel height."
      ]
    }
  },
  {
    version: "1.9.2",
    area: "extension",
    date: "2026-11-08",
    tr: {
      features: [
        "Canlı bağlantı: web uygulaması açıkken istekler ve proje adı iki yönlü eşitleniyor.",
        "Web uygulamasından öğe seçme: uzantı sekmeyi sorar ve sayfa ile konumu doldurur."
      ],
      updates: [
        "Bağlantı yalnızca izinli adreslerde (http://localhost:8080, https://taneruner.github.io) ve uygulama sekmesi açıkken çalışır.",
        "Görseller ve dosya ekleri canlı eşitlenmez; yalnızca ZIP yedeğiyle taşınır."
      ],
      fixes: [
        "Flyout'un işaretçi oku panelin kenarıyla hizalandı.",
        "Bir istek yeniden açıldığında ayrıntı panelinin yüksekliği değişmiyor.",
        "Başlık marquee'si ve hazır oranı halkası düzeltildi."
      ]
    },
    en: {
      features: [
        "Live bridge: while the web app is open, requests and the project name sync both ways.",
        "Element picking from the web app: the extension asks which tab to use and fills the page and location."
      ],
      updates: [
        "The bridge works only on the allowlisted origins (http://localhost:8080, https://taneruner.github.io) and only while the app tab is open.",
        "Images and attachments do not sync live; they travel only with a backup ZIP."
      ],
      fixes: [
        "The flyout's pointer arrow now lines up with the panel edge.",
        "Reopening a request no longer changes the detail panel height.",
        "Polished the title marquee and the ready-ratio ring."
      ]
    }
  },
  {
    version: "1.9.1",
    area: "extension",
    date: "2026-11-08",
    tr: {
      features: [],
      updates: [
        "Yedek dosyalarına boyut ve sürüm sınırı getirildi; bilinmeyen uygulama veya daha yeni şema reddedilir.",
        "Sayfanın kendi console.error çıktısı artık gizlenmiyor; hata tamponu ayrıca tutulmaya devam ediyor."
      ],
      fixes: [
        "İlk kurulumda dock ve flyout aynı anda açılırken oluşan depolama hatası giderildi; panel bir kez yeniden deniyor."
      ]
    },
    en: {
      features: [],
      updates: [
        "Backup files now have size and version limits; unknown apps or newer schemas are rejected.",
        "The page's own console.error output is no longer suppressed; the error buffer still records it."
      ],
      fixes: [
        "Fixed a first-install race between the dock and flyout database opens; the panel now retries once."
      ]
    }
  },
  {
    version: "1.9.0",
    area: "extension",
    date: "2026-11-07",
    tr: {
      features: [
        "Hazır isteklerde onay çekme: kilitli alanlar açılır ve buton yeniden Hazır olur.",
        "Yeni istek akışı taslak üzerinden ilerler; son adımda liste ve ayrıntı birlikte açılır.",
        "Kaydetme durumu footer'da yerinde; Kaydedildi üç saniye sonra yumuşakça kaybolur.",
        "Görsel küçük resimlerine tıklayınca panel gizlenmeden ortada büyük önizleme açılır."
      ],
      updates: [
        "Proje adı Ayarlar > Sistem'den düzenlenebilir; dışa aktarma, yedek ve kayıt adları bu adı kullanır.",
        "Dışa aktarma adımları altta; Planlama adımında turuncu geri oku ve yumuşak adım geçişi var.",
        "Rail'de Hazır ve İptal divider altında yan yana; boş rail alanı açık bölümü kapatır.",
        "Zorunlu alanlara * ve opsiyonel alanlara (opsiyonel) etiketi eklendi."
      ],
      fixes: [
        "İngilizce modda kalan Türkçe metinler düzeltildi; ilk kurulum dili İngilizce oldu.",
        "Güncelleme Geçmişi açılırken yumuşak, kapanırken anında davranıyor; alan etiketleri eklendi."
      ]
    },
    en: {
      features: [
        "Revoke confirmation on ready requests: locked fields reopen and the button turns back into Ready.",
        "The new-request flow continues as a draft; the final step saves it and opens the detail view.",
        "The save state stays in the footer in place; Saved fades out after three seconds.",
        "Clicking an image thumbnail opens a centred preview without hiding the panel."
      ],
      updates: [
        "The project name is editable in Settings > System and feeds export, backup and record names.",
        "Export steps moved to the bottom row; Planning has an orange back arrow and eased step slides.",
        "Ready and Cancel sit side by side under a divider in the rail; a blank rail area closes the open section.",
        "Required labels use * and optional labels use (optional)."
      ],
      fixes: [
        "Reviewed remaining Turkish in English mode; first install now defaults to English.",
        "Update History eases open and closes instantly; area labels were added."
      ]
    }
  },
  {
    version: "1.8.0",
    area: "extension",
    date: "2026-11-07",
    tr: {
      features: [
        "Toaster, klasör yolu ve istatistik kartları rail'in yanından açılıyor.",
        "Rail 100 px'e daraltıldı; pin/gizle ve klasör ikonları alt kartta toplandı.",
        "Panel tarafı sağ/sol seçilebilir ve tüm sekmelerde korunur."
      ],
      updates: [
        "Menü sayaçları yalnız hover kartında; hover/aktif zeminleri düz köşeli.",
        "Dışa aktarma listesi kaldırıldı; bölüm oku ve utility aç/kapa oku geri geldi."
      ],
      fixes: [
        "Aç/kapa sırasında beyaz alan oluşmuyor; panelde native tooltip yok."
      ]
    },
    en: {
      features: [
        "Toasts, folder paths and statistics cards open beside the rail.",
        "The rail is 100 px wide; pin/collapse and folder icons live in the bottom card.",
        "The panel side can be left or right and is kept across tabs."
      ],
      updates: [
        "Counters appear only in the hover card; hover/active backgrounds use square corners.",
        "The export request list was removed; the section arrow and utility toggle returned."
      ],
      fixes: [
        "No white gap appears while opening/closing; no native tooltips remain in the panel."
      ]
    }
  },
  {
    version: "1.7.0",
    area: "extension",
    date: "2026-11-07",
    tr: {
      features: [
        "Rail içine gömülü launcher ve aktif başlık için kayan yazı.",
        "Sekme seçerek ekran alıntısı ve CSS seçici toplayan element seçici.",
        "Konsoldan hata kayıtlarını tek tıkla açıklamaya aktarma."
      ],
      updates: [
        "Callout ve pin davranışı yenilendi; detay görünümü sadeleşti."
      ],
      fixes: [
        "Kapalı panel izi ve taşan kart gölgeleri giderildi."
      ]
    },
    en: {
      features: [
        "An inline rail launcher and a marquee for the active request title.",
        "Tab-selected screen capture and an element picker that writes a CSS selector.",
        "One-click console error import into the description."
      ],
      updates: [
        "Callout and pin behaviour were refreshed; the detail view was simplified."
      ],
      fixes: [
        "Removed the closed-panel trace and overflowing card shadows."
      ]
    }
  },
  {
    version: "1.6.0",
    area: "extension",
    date: "2026-11-07",
    tr: {
      features: [
        "Toaster'lar sol tarafa taşındı; alt bar ve klasör araçları eklendi.",
        "Sayfa ve açıklama tek detay görünümünde birleşti."
      ],
      updates: [
        "Klasör seçicileri gerçek klasör seçiyor; seçim kalıcı.",
        "Bildirimler host tarafından rail yanında çiziliyor."
      ],
      fixes: [
        "Klasör Seç butonlarının hizası düzeltildi; taşan toast alanı giderildi."
      ]
    },
    en: {
      features: [
        "Toasts moved to the left; a bottom bar and folder tools were added.",
        "Page and description merged into one detail view."
      ],
      updates: [
        "Folder pickers choose a real folder and persist the choice.",
        "Notifications are drawn by the host beside the rail."
      ],
      fixes: [
        "Aligned the Choose folder buttons and removed the overflowing toast area."
      ]
    }
  },
  {
    version: "1.5.0",
    area: "extension",
    date: "2026-11-07",
    tr: {
      features: [
        "Çevresiz panel: sayfa yeniden akışa girmiyor, panel yüzer.",
        "Dar ekranlarda ve mobil görünümde taşma düzeltmeleri."
      ],
      updates: [
        "Rail kartı sayfa üzerinde konumlanıyor; aç/kapa hareketi yumuşatıldı."
      ],
      fixes: [
        "Iframe gölge ve beyaz zemin kalıntıları giderildi."
      ]
    },
    en: {
      features: [
        "Surround-free panel: the page no longer reflows and the panel floats.",
        "Overflow fixes for narrow screens and the mobile layout."
      ],
      updates: [
        "The rail card is positioned over the page and open/close motion was smoothed."
      ],
      fixes: [
        "Removed iframe shadow and white-canvas remnants."
      ]
    }
  },
  {
    version: "1.4.0",
    area: "extension",
    date: "2026-11-07",
    tr: {
      features: [
        "Rail yatay olarak sürüklenebilir; konum kalıcı.",
        "Panel tam genişlikte taşınabilir; flyout ekrana sığar."
      ],
      updates: [
        "Sürükleme sırasında host kalkanı ile iframe dışı hareketler izlenir."
      ],
      fixes: [
        "Sürükleme sonrası yanlış tıklama ve çift tıklama engellendi."
      ]
    },
    en: {
      features: [
        "The rail can be dragged horizontally and its position persists.",
        "The panel can move across the full width; the flyout always fits the viewport."
      ],
      updates: [
        "A host shield tracks drags outside the iframe."
      ],
      fixes: [
        "Blocked accidental clicks and double-clicks after a drag."
      ]
    }
  },
  {
    version: "1.3.0",
    area: "extension",
    date: "2026-11-07",
    tr: {
      features: [
        "UX düzeltmeleri: launcher balonu, pin ve otomatik gizlenme.",
        "Bölüm içi odak ve klavye gezinmesi iyileştirildi."
      ],
      updates: [
        "Pinli panel otomatik gizlenmiyor; balon yalnız unpinned panelde çıkıyor."
      ],
      fixes: [
        "Esc ile iç içe katman kapatma ve odak sırası düzeltildi."
      ]
    },
    en: {
      features: [
        "UX fixes: launcher bubble, pin and auto-hide.",
        "Improved focus and keyboard navigation inside sections."
      ],
      updates: [
        "A pinned panel never auto-hides; the bubble only appears on unpinned panels."
      ],
      fixes: [
        "Fixed Esc handling for nested layers and the focus order."
      ]
    }
  },
  {
    version: "1.2.0",
    area: "extension",
    date: "2026-11-07",
    tr: {
      features: [
        "Launcher, sayfa küçültme ve hareket dili eklendi.",
        "Rail kapalıyken launcher görünür; bölüm açılınca kart içeri girer."
      ],
      updates: [
        "Bölüm geçişleri yumuşak; hareket azaltma tercihine saygılı."
      ],
      fixes: [
        "Kapalı panelde sayfa kayması ve çift animasyon giderildi."
      ]
    },
    en: {
      features: [
        "Added the launcher, page shrink and motion language.",
        "The launcher shows while the rail is closed; the card slides in when a section opens."
      ],
      updates: [
        "Section transitions are eased and respect reduced motion."
      ],
      fixes: [
        "Removed page shifts and double animations while closed."
      ]
    }
  },
  {
    version: "1.1.0",
    area: "extension",
    date: "2026-11-07",
    tr: {
      features: [
        "Eklenti paneli ilk kez host iframe'lerinde çalışıyor: dock ve flyout rolleri.",
        "Yeni istek, liste, sayfa, açıklama, hazır, ayarlar, yedek ve yardım bölümleri."
      ],
      updates: [
        "Paylaşılan çekirdek (core.js) ile istek/şema/i18n mantığı ayrıldı."
      ],
      fixes: [
        "Panel protokolü kaynak denetimli mesajlaşma ve BroadcastChannel ile sağlamlaştırıldı."
      ]
    },
    en: {
      features: [
        "The extension panel runs in host iframes with dock and flyout roles.",
        "New request, list, page, description, ready, settings, backup and help sections."
      ],
      updates: [
        "Shared core.js separates request/schema/i18n logic."
      ],
      fixes: [
        "Hardened the panel protocol with source-checked messages and BroadcastChannel."
      ]
    }
  },
  {
    version: "1.0.0",
    area: "extension",
    date: "2026-11-07",
    tr: {
      features: [
        "Sayfaya sabitlenen 76 px dock ve bölüm paneli: Yeni istek, İstekler, Sayfa, Açıklama, Hazır, Ayarlar, Yedek ve Yardım.",
        "İstek oluşturma: tür, öncelik, başlık, sayfa konumu, açıklama, görsel/dosya ekleme, otomatik kayıt ve hazır onayı.",
        "İstek listesinde arama, tür ve durum filtresi, sıralama; Dışa Aktarılanlar, Kayıtlar ve Taslaklar arşivi.",
        "Dışa aktarma sihirbazı: ZIP + Markdown veya tek Markdown, planlama soruları, ajan ataması ve aktarım seçenekleri.",
        "Tam ZIP/JSON yedekleme, doğrulamalı geri yükleme ve web uygulaması yedeğinden tek seferlik taşıma.",
        "Ayarlar, ajan düzenleyici ve yardım ekranları; TR/EN dil ile açık/koyu tema.",
        "Sekme seçerek ekran alıntısı alma ve sayfadan CSS seçici toplayan element seçici."
      ],
      updates: [
        "Sürüm 1.0.0: simgeler ve README eklendi; klasör chrome://extensions üzerinden paketlenmemiş olarak yüklenebilir."
      ],
      fixes: [
        "Güvenlik: satır içi betik ve eval yok, katı CSP, innerHTML kullanımı denetlendi.",
        "Dayanıklılık: depolama ve kota hatalarında mesaj; sekme yakalama hatalarında güvenli çıkış.",
        "Erişilebilirlik: odak sırası, Esc ile iç içe katman kapatma ve azaltılmış hareket desteği."
      ]
    },
    en: {
      features: [
        "A 76 px dock pinned to the page plus a section panel: New request, Requests, Page, Description, Ready, Settings, Backup and Help.",
        "Request compose: type, priority, title, page location, description, images/files, autosave and ready confirmation.",
        "Request list with search, type and status filters, reordering; Exported, Records and Drafts archive.",
        "Export wizard: ZIP + Markdown or single Markdown, planning questions, agent assignment and transfer options.",
        "Full ZIP/JSON backup, validated restore and a one-time migration from the web app backup.",
        "Settings, agent editor and help screens; TR/EN language and light/dark theme.",
        "Tab capture with tab selection and an element picker that writes a CSS selector."
      ],
      updates: [
        "Version 1.0.0: icons and README added; the folder installs unpacked from chrome://extensions."
      ],
      fixes: [
        "Security: no inline scripts or eval, strict CSP, innerHTML usage audited.",
        "Resilience: clear messages on storage and quota errors; safe exit on tab capture failures.",
        "Accessibility: focus order, Esc closes nested layers and reduced-motion support."
      ]
    }
  },
  {
    version: "1.6.1",
    area: "web",
    date: "2026-11-06",
    tr: {
      features: [],
      updates: [],
      fixes: [
        "390 px ve altında üst bardaki taşma giderildi; kök dizin grubu ve proje adı mobilde gizleniyor."
      ]
    },
    en: {
      features: [],
      updates: [],
      fixes: [
        "Fixed topbar overflow at 390 px and below by hiding the root group and project name on mobile."
      ]
    }
  },
  {
    version: "1.6.0",
    area: "web",
    date: "2026-11-06",
    tr: {
      features: [
        "Varsayılan uygulama dili İngilizce yapıldı."
      ],
      updates: [
        "Dışa aktarım dizini seçilmediğinde ana başlık ve tarayıcı sekmesi için varsayılan proje adı “Projem” oldu.",
        "Dizin seçildiğinde proje adı yine seçilen klasörün adından alınıyor.",
        "İngilizce ana açıklama cümlesi dil bilgisi açısından düzenlendi."
      ],
      fixes: []
    },
    en: {
      features: [
        "The default application language is now English."
      ],
      updates: [
        "When no export directory is selected, the default project name is “My Project” in the heading and browser tab.",
        "When a directory is selected, the project name still comes from the selected folder.",
        "Improved the English wording of the main description sentence."
      ],
      fixes: []
    }
  },
  {
    version: "1.5.0",
    area: "web",
    date: "2026-11-06",
    tr: {
      features: [
        "Sol panel menüleri Ayarlar, Yedek ve Yardım olarak sadeleştirildi.",
        "Dil değişiminde logo TR için ID, EN için RL oluyor."
      ],
      updates: [
        "Sol paneldeki tarih bilgisi kaldırıldı.",
        "Dışa aktarım dizini seçilmediğinde üst barda “Dışa aktarım dizini seçilmedi” yazıyor.",
        "Temiz Defter butonunun yüksekliği Yeni İstek butonuyla eşitlendi.",
        "Sol panelde seçili menü vurgusu kaldırıldı."
      ],
      fixes: []
    },
    en: {
      features: [
        "Left rail menus were simplified to Settings, Backup and Help.",
        "The logo now shows ID for Turkish and RL for English."
      ],
      updates: [
        "Removed the date from the left rail.",
        "The top bar now shows “Export directory not selected” when no export directory is chosen.",
        "Clear Ledger button height now matches the New Request button.",
        "Removed the selected-menu highlight from the left rail."
      ],
      fixes: []
    }
  },
  {
    version: "1.4.0",
    area: "web",
    date: "2026-11-06",
    tr: {
      features: [
        "Sol panele Ayarlar butonu eklendi.",
        "Tema ve Ayarlar ikonları arasına TR/EN dil geçiş butonu eklendi.",
        "Tarih ana sayfadan sol panelin en altına taşındı.",
        "Dışa aktarım dizini seçilmediğinde proje noktası kırmızı gösteriliyor."
      ],
      updates: [
        "Toaster bildirimleri üst headerda, tema değiştirme ikonunun soluna taşındı.",
        "Ayarlar’daki Kök Dizini seçme ikonundan yeşil renk kaldırıldı.",
        "Sol paneldeki Yerel yazısı ve yeşil noktası kaldırıldı."
      ],
      fixes: []
    },
    en: {
      features: [
        "Added a Settings button to the left rail.",
        "Added a TR/EN language toggle between the theme and settings icons.",
        "Moved the date from the main page to the bottom of the left rail.",
        "The project dot turns red when no export directory is selected."
      ],
      updates: [
        "Toasts moved to the top header, just left of the theme toggle.",
        "Removed the green color from the Root Folder picker icon in Settings.",
        "Removed the Local label and green dot from the left rail."
      ],
      fixes: []
    }
  },
  {
    version: "1.3.1",
    area: "web",
    date: "2026-11-06",
    tr: {
      features: [],
      updates: [],
      fixes: [
        "Ana sayfadaki Kök Dizini kutusunda bulunan yeşil klasör ikonunun yeşil rengi kaldırıldı.",
        "Aynı nötr ikon görünümü karanlık temada da uygulandı."
      ]
    },
    en: {
      features: [],
      updates: [],
      fixes: [
        "Removed the green color from the Root Folder box's folder icon.",
        "Applied the same neutral icon look in the dark theme."
      ]
    }
  },
  {
    version: "1.3.0",
    area: "web",
    date: "2026-11-06",
    tr: {
      features: [
        "Güncelleme Geçmişi kayıtları Hakkında altında alt alta link olarak gösteriliyor.",
        "Güncelleme notu modalı, Ayarlar > Hakkında açıkken üzerine açılıyor; kapanınca Ayarlar geri geliyor.",
        "Ana sayfadaki Kök Dizini kutusu, Dışa Aktarım Dizini kutusuyla aynı birleşik tasarıma kavuştu."
      ],
      updates: [
        "Hakkında alanında geliştirici, sürüm, repo ve iletişim 2 sütun; Güncelleme Geçmişi tek satır olarak düzenlendi.",
        "Kök Dizini seçme ikonu Dışa Aktarım Dizini ikonuyla aynı yeşil renge getirildi.",
        "Buy Me a Coffee widget’ı modal açıkken gizlenmiyor.",
        "Hakkında bölümündeki Buy Me a Coffee görseli kaldırıldı."
      ],
      fixes: [
        "Kök Dizini kutusunun bitişik dizin kutusu tasarımıyla uyuşmaması giderildi."
      ]
    },
    en: {
      features: [
        "Update History entries are shown as stacked links under About.",
        "The update notes modal now opens over Settings > About and closes back to Settings.",
        "The Root Folder box on the main page now uses the same joined design as the Export Directory box."
      ],
      updates: [
        "About now shows developer, version, repository and contact in two columns, with Update History on its own row.",
        "The Root Folder picker icon now uses the same green color as the Export Directory icon.",
        "The Buy Me a Coffee widget is no longer hidden when a modal is open.",
        "The Buy Me a Coffee image was removed from About."
      ],
      fixes: [
        "Fixed the Root Folder box not matching the adjacent folder box design."
      ]
    }
  },
  {
    version: "1.2.0",
    area: "web",
    date: "2026-11-06",
    tr: {
      features: [
        "Güncelleme Geçmişi son 5 kayıtla sınırlandırıldı; ilk 5 kayıt link olarak gösteriliyor.",
        "Hazır onayı verilen istekler, onay geri alınmadan düzenlenemiyor.",
        "Proje Dizini adı Dışa Aktarım Dizini olarak güncellendi.",
        "Hemen Aktar butonu artık yalnızca bilgilendirme gösteriyor; davranışı yalnızca Ayarlar değiştiriyor."
      ],
      updates: [
        "Hakkında alanı tek sütunlu ve güncelleme kayıtları linkli hale getirildi.",
        "Sonraki adım butonu turuncu ana buton tasarımına ve sağ ok ikonuna kavuştu.",
        "Dışa Aktar, Yeni İstek ve Temiz Defter butonları Kaydet butonu tasarımıyla eşleştirildi."
      ],
      fixes: [
        "Karanlık temada hazır istek kenarlığı ve klasör ikonu için çırtlak yeşil tonlar koyulaştırıldı."
      ]
    },
    en: {
      features: [
        "Update History is limited to the latest 5 entries; the first 5 entries are shown as links.",
        "Requests marked ready can no longer be edited until the confirmation is revoked.",
        "Project Folder was renamed to Export Directory.",
        "The Instant Export button now only shows information; only Settings changes the behavior."
      ],
      updates: [
        "About is now a single column with linked update history entries.",
        "Next Step now uses the orange primary button style with a right arrow icon.",
        "Export, New Request and Clear Ledger buttons now match the Save button design."
      ],
      fixes: [
        "Dark theme ready border and folder icon greens were muted."
      ]
    }
  },
  {
    version: "1.1.0",
    area: "web",
    date: "2026-11-06",
    tr: {
      features: [
        "Ayarlar; Sistem, Yapılandırma ve Hakkında sekmelerine ayrıldı.",
        "Hemen aktar dışa aktarma davranışı eklendi.",
        "Kayıtları yeniden adlandırma özelliği eklendi.",
        "Defter kimliği ile mükerrer kayıt uyarısı eklendi.",
        "Güncelleme Geçmişi penceresi eklendi.",
        "Buy Me a Coffee desteği eklendi."
      ],
      updates: [
        "Dil ve tema seçimi otomatik kaydediliyor.",
        "Kaydet butonu modalı kapatmıyor; 2 saniyelik geri bildirim gösteriyor.",
        "Varsayılanlara Dön yalnızca klasör ve dışa aktarma davranışı ayarlarını sıfırlıyor.",
        "Ajan kartları hizalı ızgaraya geçirildi; kaldırma ikonu kullanılıyor.",
        "Kök ve dışa aktarım dizinleri tam yol ve ikonlu butonlarla gösteriliyor.",
        "Eksik istek uyarısı ilerleme kartının içine taşındı.",
        "Dışa aktarma adım butonları ortalandı.",
        "Ajan seçimi zorunlu olmaktan çıkarıldı.",
        "İngilizce çeviri kapsamı ve Markdown çıktısı genişletildi.",
        "Yardım içeriği güncellendi."
      ],
      fixes: [
        "Kök dizini varsayılan yolundaki fazladan eğik çizgi düzeltildi.",
        "Proje kutusundaki fazladan ikon ve yeşil nokta kaldırıldı.",
        "Başlıksız istek metninin İngilizce çevirisi düzeltildi.",
        "Arşiv başlığındaki yinelenen metin kaldırıldı.",
        "Buton genişlikleri içerikle hizalandı."
      ]
    },
    en: {
      features: [
        "Settings was split into System, Configuration and About tabs.",
        "Instant export behavior was added.",
        "Records can now be renamed.",
        "Duplicate record detection by ledger ID was added.",
        "Update History window was added.",
        "Buy Me a Coffee support was added."
      ],
      updates: [
        "Language and theme selections are saved automatically.",
        "Save no longer closes the modal and shows feedback for 2 seconds.",
        "Reset to Defaults now only resets folder and export behavior settings.",
        "Agent cards use an aligned grid with a remove icon.",
        "Root and export folders show full paths with icon buttons.",
        "The missing-request warning moved inside the progress card.",
        "Export step buttons are centered.",
        "Agent selection is no longer mandatory.",
        "English translation coverage and Markdown output were expanded.",
        "Help content was updated."
      ],
      fixes: [
        "Fixed the extra slash in the default root path.",
        "Removed the extra icon and green dot from the project box.",
        "Fixed the English translation of Untitled request.",
        "Removed the duplicate heading in the archive panel.",
        "Button widths now hug their content."
      ]
    }
  },
  {
    version: "1.0.0",
    area: "web",
    date: "2026-11-06",
    tr: {
      features: [
        "İstek defteri, tür bazlı alanlar, görsel ve dosya ekleri.",
        "Markdown, ZIP ve tek dosya dışa aktarma.",
        "Planlama, ajanlar ve kayıt/arşiv sistemi.",
        "ZIP ve JSON yedekleme."
      ],
      updates: [],
      fixes: []
    },
    en: {
      features: [
        "Request ledger with type-specific fields, images and attachments.",
        "Markdown, ZIP and single-file export.",
        "Planning, agents and record/archive system.",
        "ZIP and JSON backup."
      ],
      updates: [],
      fixes: []
    }
  }
];

  /* ---------- util.mjs ---------- */
/*
  Shared utility helpers.

  Ported verbatim from the previous monolithic core (v1.9.1). Behaviour, including the
  deliberate local-time formatting and the comma decimal separator, is preserved.
*/

function nowISO() {
  return new Date().toISOString();
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatYMD(date) {
  const d = date || new Date();
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

function formatStamp(date) {
  const d = date || new Date();
  return formatYMD(d) + "_" + pad2(d.getHours()) + "-" + pad2(d.getMinutes()) + "-" + pad2(d.getSeconds());
}

function formatTime(date) {
  const d = date || new Date();
  return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
}

function formatClock(value) {
  const d = value instanceof Date ? value : value ? new Date(value) : new Date();
  if (isNaN(d.getTime())) return "";
  return pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
}

function formatDateTime(value) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "—";
  return pad2(d.getDate()) + "." + pad2(d.getMonth() + 1) + "." + d.getFullYear() + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
}

function mdCell(value) {
  return String(value == null ? "" : value).replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim() || "—";
}

function mdLine(value) {
  return String(value == null ? "" : value).replace(/\r?\n/g, " ").trim();
}

function utf8Bytes(value, withBom) {
  const encoded = new TextEncoder().encode(String(value));
  if (!withBom) return encoded;
  const out = new Uint8Array(encoded.length + 3);
  out.set([0xef, 0xbb, 0xbf], 0);
  out.set(encoded, 3);
  return out;
}

function extFromMime(type) {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  if (type === "image/avif") return "avif";
  if (type === "image/bmp") return "bmp";
  return "png";
}

function extFromFileName(name) {
  const match = /\.([A-Za-z0-9]{1,10})$/.exec(String(name || ""));
  return match ? match[1].toLowerCase() : "";
}

function safeFileBase(name) {
  let base = String(name || "dosya").replace(/\.[^.]+$/, "");
  base = base.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i");
  base = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base || "dosya";
}

function imageFileName(req, index, img) {
  const base = String(req.id || "istek").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "istek";
  const ext = String(img.ext || extFromMime(img.type) || "webp").replace("jpeg", "jpg");
  return "gorseller/" + base + "-" + (index + 1) + "." + ext;
}

function attachmentFileName(req, index, att) {
  const idBase = String(req.id || "istek").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "istek";
  const ext = String(att.ext || extFromFileName(att.name) || "dat").replace(/[^a-z0-9]/g, "") || "dat";
  return "dosyalar/" + idBase + "-" + (index + 1) + "-" + safeFileBase(att.name) + "." + ext;
}

function formatBytes(bytes){
  const value = Number(bytes) || 0;
  if(value < 1024) return value + " B";
  if(value < 1024 * 1024) return (value / 1024).toFixed(1).replace(".", ",") + " KB";
  return (value / (1024 * 1024)).toFixed(1).replace(".", ",") + " MB";
}

function backupMediaFileName(kind, item) {
  const safeId = String(item.id || "medya").replace(/[^A-Za-z0-9_-]/g, "-");
  if (kind === "image") {
    const ext = String(item.ext || extFromMime(item.type) || "webp").replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "") || "webp";
    return "gorseller/" + safeId + "." + ext;
  }
  const ext = String(item.ext || extFromFileName(item.name) || "dat").replace(/[^a-z0-9]/gi, "") || "dat";
  return "dosyalar/" + safeId + "-" + safeFileBase(item.name) + "." + ext;
}

function normalizeDisplayPath(value) {
  let path = String(value == null ? "" : value).replace(/\\/g, "/");
  if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
  return path;
}

function newLedgerId() {
  return "ledger_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
}

  /* ---------- i18n.mjs ---------- */
/*
  Internationalisation: the English dictionary, the ordered Turkish pattern rules and the
  language state.

  Ported verbatim from the previous monolithic core (v1.9.1). translate() returns Turkish
  input unchanged, otherwise it looks the trimmed string up in TRANSLATIONS_EN and then
  applies translatePattern() in order. Language defaults to English.
*/

const TRANSLATIONS_EN = {
  "İstek Defteri": "Request Ledger",
  "İstek Listesi": "Request List",
  "Dışa Aktarılanlar": "Exported",
  "Dışa Aktarılan": "Exported",
  "Arşiv": "Archive",
  "Kayıtlar": "Records",
  "Kayıt": "Record",
  "Aynı liste zaten kayıtlı": "This list is already saved",
  "Üzerine Yaz": "Overwrite",
  "Taslaklar": "Drafts",
  "İstek": "Requests",
  "Yedek": "Backup",
  "Yardım": "Help",
  "Yerel": "Local",
  "Proje çalışma alanı": "Project workspace",
  "Yeni istek": "New request",
  "Temiz Defter": "Clear Ledger",
  "Toplam": "Total",
  "Hazır": "Ready",
  "Eksik": "Missing",
  "Görsel": "Image",
  "Görseller": "Images",
  "Eksiklere git": "Go to missing",
  "Tümü": "All",
  "Yeni Özellik": "New Feature",
  "Güncelleme": "Update",
  "Kaldırma": "Removal",
  "Tasarım": "Design",
  "Tasarım / İçerik": "Design / Content",
  "Soru": "Question",
  "Hata": "Bug",
  "Tüm durumlar": "All states",
  "Hazır değil": "Not ready",
  "Tümünü kapat": "Collapse all",
  "İstekler": "Requests",
  "Henüz istek yok": "No requests yet",
  "Filtreye uyan istek yok": "No requests match the filter",
  "Filtreleri temizle": "Clear filters",
  "İlk isteği ekle": "Add the first request",
  "Nasıl çalışır?": "How does it work?",
  "Görseller ve dosyalar IndexedDB’de tutulur": "Images and files are stored in IndexedDB",
  "Dışa Aktar": "Export",
  "Kaydet": "Save",
  "Oto. Kayıt": "Auto save",
  "Kök dizin": "Root folder",
  "Kök:": "Root:",
  "Proje dizini": "Project folder",
  "Proje Dizini": "Project Folder",
  "Dışa Aktarım Dizini": "Export Directory",
  "Dışa aktarım dizini": "Export directory",
  "Dışa aktarım dizinini seç": "Select export directory",
  "Dışa aktarım dizinini kaldır": "Remove export directory",
  "Dışa aktarım dizini yolu": "Export directory path",
  "Dışa aktarım dizini seçilmedi": "Export directory not selected",
  "Projem": "My Project",
  "Kök Dizini": "Root Folder",
  "Hedef": "Target",
  "Hedef konum": "Target location",
  "Klasör seç": "Choose folder",
  "Değiştir": "Change",
  "Kaldır": "Remove",
  "Seç": "Select",
  "Seçilmedi": "Not selected",
  "Varsayılan": "Default",
  "Varsayılana dön": "Reset to default",
  "Varsayılanlara Dön": "Reset to Defaults",
  "Son tercihler": "Last preferences",
  "Ayarlar": "Settings",
  "Yapılandırma": "Configuration",
  "Sistem ayarları": "System settings",
  "Ajanlar": "Agents",
  "Ajan": "Agent",
  "Yeni ajan": "New agent",
  "Görev": "Role",
  "Ajan adı": "Agent name",
  "Ajan .md dosyası": "Agent .md file",
  "Ajan .md dosyası yolu": "Agent .md file path",
  "Dil": "Language",
  "Tema": "Theme",
  "Aydınlık": "Light",
  "Karanlık": "Dark",
  "Dışa aktarım davranışı": "Export behavior",
  "Arayüz dilini seç.": "Select the interface language.",
  "Aydınlık veya karanlık tema.": "Light or dark theme.",
  "Her dışa aktarımda varsayılan seçimler mi, son kullanılan seçimler mi kullanılsın?": "Use default selections or the last used selections for each export?",
  "Uygulama dili, tema, dışa aktarma davranışı ve klasör konumları.": "Application language, theme, export behavior and folder locations.",
  "Henüz ajan yok": "No agents yet",
  "Yeni ajan ile başla; her satırda görevi seç, istersen ad ve .md dosyası ekle.": "Start with New agent; choose a role and optionally add a name and .md file.",
  "Dışa aktarımda kullanılacak ajanları burada tanımla. Ajan adı yalnızca bu ekranda görünür; Markdown çıktısında görev ve varsa .md dosyası yolu yer alır. Dosya seçimi dosya adını doldurur; yolu elle düzenleyebilirsin.": "Define the agents used during export. The agent name is shown only here; the Markdown output contains the role and the .md file path if provided. File selection fills the file name; you can edit the path manually.",
  "MD dosyası seç": "Select .md file",
  "Ajanı kaldır": "Remove agent",
  "Dosya seç": "Choose file",
  "Başlık": "Title",
  "Açıklama": "Description",
  "Öncelik": "Priority",
  "Tür": "Type",
  "Sayfa": "Page",
  "Sayfadaki konum": "Location on page",
  "Sayfadaki Konum": "Location on Page",
  "Kısa ve anlaşılır bir başlık": "A short, clear title",
  "Örn. Siparişler": "e.g. Orders",
  "Örn. tablo üstü araç çubuğu, sağ üstteki filtreler…": "e.g. table toolbar, top-right filters…",
  "Console Hatası veya Sayfa Hatası": "Console Error or Page Error",
  "Örn. Uncaught TypeError: … / 404 sayfa hatası…": "e.g. Uncaught TypeError: … / 404 page error…",
  "Görsel ekle": "Add image",
  "Ctrl+V ile yapıştır, sürükle-bırak veya dosya seç": "Paste with Ctrl+V, drag and drop, or choose a file",
  "Dosya seç": "Choose file",
  "Örnek dosya eki (.html, .css vb.)": "Example attachment (.html, .css, etc.)",
  "Örnek dosya ekle": "Add example file",
  ".html, .css, .js, .pdf vb. — en fazla 3 dosya": ".html, .css, .js, .pdf etc. — up to 3 files",
  "Örnek web sitesi": "Example website",
  "İlgili bağlantı": "Related link",
  "Ek not": "Additional note",
  "İstersen ek bir açıklama ekle…": "Optionally add a note…",
  "Satırı kapat": "Close row",
  "Başlıksız istek": "Untitled request",
  "Sayfa / konum belirtilmedi": "Page / location not specified",
  "Genel": "General",
  "Onay bekliyor": "Awaiting confirmation",
  "Son değişiklik:": "Last change:",
  "Durum": "Status",
  "Eklenme": "Created",
  "Talep": "Request",
  "Örnek Dosya": "Example File",
  "Örnek Web Sitesi": "Example Website",
  "İlgili Bağlantı": "Related Link",
  "Ek Not": "Additional Note",
  "Planlama": "Planning",
  "Markdown dışa aktarma": "Markdown export",
  "Dışa aktarma": "Export",
  "Koşu türü": "Run type",
  "Tam koşu": "Full run",
  "Hafif koşu": "Light run",
  "Özel": "Custom",
  "Soru ve Öneri": "Questions and Suggestions",
  "Runtime Paketi": "Runtime Package",
  "Paket Transferi": "Package Transfer",
  "Sunucu": "Server",
  "Transfer yok": "No transfer",
  "Ajanlar (çoklu seçim)": "Agents (multi-select)",
  "Testler": "Tests",
  "Test imkanı": "Test option",
  "Test yok": "No tests",
  "Çağrılacak Ajanlar": "Agents to Invoke",
  "Soru - Öneri isteği": "Question - Suggestion request",
  "Not": "Note",
  "Dışa Aktar": "Export",
  "Vazgeç": "Cancel",
  "Önceki adım": "Previous step",
  "Sonraki adım": "Next step",
  "Metni kopyala": "Copy text",
  "Çıktı biçimi": "Output format",
  "ZIP + .md indir": "Download ZIP + .md",
  "Tek .md indir": "Download single .md",
  "Başa özet tablosu ekle": "Add summary table at the top",
  "Dosya ekleri yalnızca ZIP çıktısında taşınır.": "Attachments are only included in ZIP output.",
  "Dışa aktarma tamamlandı": "Export completed",
  "Talepleri temizle": "Clear requests",
  "Talepleri koru": "Keep requests",
  "Yedekleme": "Backup",
  "Veri güvenliği": "Data safety",
  "Tam yedek indir (.zip)": "Download full backup (.zip)",
  "Metin yedeği indir (.json)": "Download text backup (.json)",
  "Yedekten yükle": "Restore from backup",
  "Tüm verileri temizle": "Clear all data",
  "Kapat": "Close",
  "Tamam": "OK",
  "Anladım": "Got it",
  "Onay": "Confirmation",
  "Emin misin?": "Are you sure?",
  "Sil": "Delete",
  "Temizle": "Clear",
  "Defter": "Ledger",
  "Defteri Temizle": "Clear Ledger",
  "Geri yükle": "Restore",
  "İçe aktar": "Import",
  "Proje adı": "Project name",
  "Tür seç": "Select type",
  "Öncelik seç": "Select priority",
  "Görev seç…": "Select role…",
  "Bu tarayıcıda desteklenmiyor.": "Not supported in this browser.",
  "Lütfen bir seçim yap.": "Please make a selection.",
  "Geliştirme İstekleri": "Development Requests",
  "Sıkıştırılmış Dosya": "Compressed File",
  "Özet": "Summary",
  "talep": "requests",
  "görsel": "images",
  "dosya": "files",
  "adet": "items",
  "Markdown metninde yer almaz": "not included in Markdown text",
  "_Açıklama girilmedi._": "_No description provided._",
  "Console Hatası veya Sayfa Hatası": "Console Error or Page Error",
  "Görsel bulunamadı": "Image not found",
  "Yedek dosyası çok büyük.": "The backup file is too large.",
  "Yedek okunuyor…": "Reading backup…",
  "Yedek okunamadı.": "Could not read the backup.",
  "Yedek oluşturulamadı.": "Could not create the backup.",
  "Geçersiz yedek dosyası.": "Invalid backup file.",
  "Geçersiz yedek sürümü.": "Invalid backup version.",
  "ZIP içinde yedek.json bulunamadı.": "yedek.json was not found in the ZIP.",
  "Yedekte proje bulunamadı.": "No projects were found in the backup.",
  "Yedekte çok fazla proje var.": "The backup contains too many projects.",
  "Geçersiz yedek: proje kaydı okunamadı.": "Invalid backup: a project record could not be read.",
  "Geçersiz yedek: proje kimliği okunamadı.": "Invalid backup: a project id could not be read.",
  "Geçersiz yedek: proje kimliği tekrar ediyor.": "Invalid backup: a project id is duplicated.",
  "Geçersiz yedek: proje adı boş.": "Invalid backup: a project name is empty.",
  "Proje listesi yazılamadı.": "The project list could not be written.",
  "dosya bulunamadı": "file not found",
  "dosya eki; ZIP çıktısında taşınır": "attachment; included in ZIP output",
  "Belirtilmedi": "Not specified",
  "MD Dosyası Yolu": "MD File Path",
  "Dikkat": "Attention",
  "Onayla": "Confirm",
  "Proje dizini seç": "Select project folder",
  "Hedef klasör": "Project folder",
  "Kök dizin:": "Root folder:",
  "Ajan ayarları": "Agent settings",
  "Ajan ayarları kaydedildi.": "Agent settings saved.",
  "Ayarlar kaydedildi.": "Settings saved.",
  "Sistem ayarları varsayılana döndü. Ajanlar korundu.": "System settings reset to defaults. Agents were kept.",
  "Planlama türünü seç.": "Select a planning type.",
  "Soru ve Öneri seçimini yap.": "Select an option for Questions and Suggestions.",
  "Runtime Paketi seçimini yap.": "Select an option for Runtime Package.",
  "Paket Transferi seçimini yap.": "Select a package transfer option.",
  "Ajan ayarlarından en az bir ajan ekle.": "Add at least one agent in Agent settings.",
  "En az bir ajan seç.": "Select at least one agent.",
  "Test seçimini yap.": "Select a test option.",
  "Karanlık mod": "Dark mode",
  "Aydınlık mod": "Light mode",
  "Temayı değiştir": "Change theme",
  "Karanlık mod açık.": "Dark mode enabled.",
  "Aydınlık mod açık.": "Light mode enabled.",
  "Yeni bir işlev, ekran veya akış ekle.": "Add a new function, screen or flow.",
  "Mevcut bir alanı, akışı veya davranışı değiştir.": "Change an existing area, flow or behavior.",
  "Bir öğeyi, alanı veya akışı kaldır.": "Remove an item, area or flow.",
  "Tasarım, metin, görsel veya örnek dosya paylaş.": "Share design, text, visuals or an example file.",
  "Proje veya uygulama hakkında soru sor.": "Ask a question about the project or application.",
  "Hata, console kaydı veya beklenmeyen davranış bildir.": "Report a bug, console log or unexpected behavior.",
  "Yeni özellik ne yapmalı? Hangi sorunu çözüyor?": "What should the new feature do? What problem does it solve?",
  "Neyin değişmesini istiyorsun? Ekranda nasıl görünmeli?": "What should change? How should it look on screen?",
  "Ne kaldırılmalı ve neden?": "What should be removed and why?",
  "Hangi metin, renk, boşluk veya bileşen değişmeli?": "Which text, color, spacing or component should change?",
  "Sorunuzu net yazın; gerekirse ekran görüntüsü ekleyin.": "Write your question clearly; add a screenshot if needed.",
  "Hata nasıl ortaya çıkıyor? Beklenen ve gerçekleşen davranış ne?": "How does the bug occur? What is expected versus actual behavior?",
  "Başlık ve açıklama zorunludur.": "Title and description are required.",
  "Başlık, açıklama ve istek türü zorunludur.": "Title, description and request type are required.",
  "İçeriğe geç": "Skip to content",
  "İD": "ID",
  "Dışa aktarılan listeler tarihe göre burada tutulur.": "Exported lists are kept here by date.",
  "Henüz dışa aktarılan liste yok. Dışa aktarım sonrası burada tarihe göre görünecek.": "No exported lists yet. They will appear here by date after export.",
  "Dışa Aktarılanları temizle": "Clear Exported",
  "için güncelleme, yeni özellik, soru ve kaldırma taleplerini tek yerde topla; doğrula ve Markdown olarak devret.": "— collect update, new feature, question and removal requests in one place; review and hand off as Markdown.",
  "İlk isteği ekleyerek başla.": "Start by adding the first request.",
  "İlk güncelleme, yeni özellik veya soruyla başla. Her tür kendi alanlarını gösterir; başlık ve açıklama dışındaki alanlar opsiyoneldir.": "Start with an update, new feature or question. Each type shows its own fields; fields other than title and description are optional.",
  "Arama veya filtreleri temizleyerek tüm istekleri görebilirsin.": "Clear the search or filters to see all requests.",
  "Eksikleri tamamlayıp tik ile onayla.": "Complete the missing fields and confirm with the checkmark.",
  "İlkine git": "Go to first",
  "1. Adım": "Step 1",
  "2. Adım": "Step 2",
  "Markdown ayrı dosya; görseller ve dosya ekleri ayrı ZIP içinde sıkıştırılır. Medya yoksa yalnızca .md iner.": "Markdown is a separate file; images and attachments are packed into a separate ZIP. If there is no media, only the .md file is downloaded.",
  "Görseller dosyanın içine base64 olarak gömülür. Dosya ekleri yalnızca ZIP ile taşınır.": "Images are embedded in the file as base64. Attachments are only transferred with ZIP.",
  "Bu defterde dosya eki var. Tek .md çıktısı dosya eklerini taşımaz; lütfen ZIP kullan.": "This ledger has attachments. Single .md output does not carry attachments; please use ZIP.",
  "İsteklerin nasıl gerçekleştirileceğini seç. Dışa Aktar ile çıktı oluşturulacak.": "Choose how the requests will be implemented. Export will create the output.",
  "(tek seçim)": "(single select)",
  "(çoklu seçim)": "(multi-select)",
  "Hayır": "No",
  "Sunucu ve gofile.io birlikte seçilebilir. “Transfer yok” seçilirse diğer seçimler iptal edilir.": "Server and gofile.io can be selected together. Selecting “No transfer” cancels the other selections.",
  "Talepler + Kayıtlar + görseller + dosya ekleri. Başka bir tarayıcıya taşımak için en güvenli yol.": "Requests + Records + images + attachments. The safest way to move to another browser.",
  "Talep ve Kayıt metinleri. Görseller ve dosya ekleri bu dosyaya dahil edilmez.": "Request and Record texts. Images and attachments are not included.",
  ".zip veya .json dosyası seç. Mevcut talepler ve Kayıtlar yedekteki verilerle değiştirilir.": "Choose a .zip or .json file. Current requests and Records will be replaced with the backup data.",
  "Veriler tarayıcıya bağlıdır. Tarayıcı verisi temizlenirse kayıtlar kaybolur; düzenli yedek almayı unutma.": "Data is tied to the browser. If browser data is cleared, records are lost; remember to back up regularly.",
  "Hedef klasör seçiliyse yedekler de oraya kaydedilir; aksi halde tarayıcı indirilenler klasörüne iner.": "If a project folder is selected, backups are saved there; otherwise they go to the browser downloads folder.",
  "TR - Türkçe": "TR - Turkish",
  "Kısa rehber": "Quick guide",
  "1. Satır ekle": "1. Add a row",
  "Her güncelleme, yeni özellik, soru veya kaldırma isteği için ayrı bir satır aç.": "Open a separate row for each update, new feature, question or removal request.",
  "2. Türe göre alanları doldur": "2. Fill in type-specific fields",
  "Türü seçtiğinde yalnızca o türe ait alanlar görünür. Başlık ve açıklama dışındaki alanlar opsiyoneldir.": "When you select a type, only its fields appear. Fields other than title and description are optional.",
  "3. Görsel ve dosya ekle": "3. Add images and attachments",
  "Satır açıkken": "With the row open,",
  "ile ekran görüntüsünü ekle. Tasarım türünde örnek": "add a screenshot. For the Design type, add an example",
  "dosyası da ekleyebilirsin.": "file as well.",
  "Zorunlu alanlar dolunca satırdaki tiki tıkla. Tik tıklanmayan satır varsa export açılmaz.": "When required fields are complete, click the row's checkmark. Export is disabled if any row is not confirmed.",
  "5. Dışa aktar": "5. Export",
  "ZIP olarak Markdown + görselleri indir veya tek .md dosyası oluştur. Yedeği de unutma.": "Download Markdown + images as ZIP or create a single .md file. Do not forget to back up.",
  "“Hazır” tiki, özelliğin yapıldığı anlamına gelmez; sadece bu talebin dışa aktarılmaya hazır olduğunu onaylar.": "The “Ready” check does not mean the feature is done; it only confirms that this request is ready for export.",
  "Hangi türde istek açılsın?": "Which request type should be created?",
  "Yeni Kayıt Oluştur": "Create New Record",
  "Dışa aktarım": "Export",
  "Yükle": "Load",
  "Her ajan için bir görev seç.": "Select a role for each agent.",
  "Kök dizini varsayılana döndü.": "Root folder reset to default.",
  "Proje dizini kaldırıldı. Dosyalar indirilecek.": "Project folder removed. Files will be downloaded.",
  "Dışa aktarım dizini kaldırıldı. Dosyalar indirilecek.": "Export directory removed. Files will be downloaded.",
  "Bu tarayıcı dışa aktarım dizini seçimini desteklemiyor. Dosyalar indirilecek.": "This browser does not support export directory selection. Files will be downloaded.",
  "Dışa aktarım davranışı [Hemen Aktar] güncellendi. Ayarlardan bu özelliği etkinleştirebilirsiniz.": "Export behavior [Instant Export] updated. You can enable this feature from Settings.",
  "Hazır onayını geri alarak düzenleyebilirsin.": "Revoke the ready confirmation to edit.",
  "Defter temizlendi. Kayıtlar, Taslaklar ve Dışa Aktarılanlar korundu.": "Ledger cleared. Records, Drafts and Exported were kept.",
  "Ana menü": "Main menu",
  "İD · İstek Defteri, ana sayfa": "ID · Request Ledger, home",
  "İstek Listesini kapat": "Close Request List",
  "Arşiv bölümleri": "Archive sections",
  "İD · İstek Defteri": "ID · Request Ledger",
  "İstek Listesini aç": "Open Request List",
  "Dışa Aktarılanları kapat": "Close Exported",
  "Dışa Aktarılanları aç": "Open Exported",
  "Kayıtların saklanacağı kök dizini seç": "Select the root folder for records",
  "Proje dizinini seç": "Select project folder",
  "Hedef klasör seç": "Select project folder",
  "Mevcut istekleri kaydet": "Save current requests",
  "Dışa aktar": "Export",
  "İlerleme özeti": "Progress summary",
  "Hazır talep ilerlemesi": "Ready request progress",
  "Başlık, sayfa veya açıklamada ara…": "Search title, page or description…",
  "İsteklerde ara": "Search requests",
  "Aramayı temizle": "Clear search",
  "Türe göre filtrele": "Filter by type",
  "Duruma göre filtrele": "Filter by status",
  "Tüm satırları kapat": "Collapse all rows",
  "Satır işlemleri": "Row actions",
  "Eksik çubuğunu gizle": "Hide missing bar",
  "Planlama türü": "Planning type",
  "Soru ve öneri": "Questions and suggestions",
  "Bu plana özel eklemek istediğin not…": "Optional note for this plan…",
  "Ajan görevi": "Agent role",
  "Yukarı taşı": "Move up",
  "Aşağı taşı": "Move down",
  "Çoğalt": "Duplicate",
  "Düşük": "Low",
  "Kritik": "Critical",
  "Yüksek": "High",
  "1 talep dışa aktarmaya hazır değil. Eksikleri tamamlayıp tik ile onayla.": "1 request is not ready for export. Complete the missing fields and confirm with the checkmark.",
  "Tüm planlama seçimleri tamam.": "All planning selections are complete.",
  "(opsiyonel)": "(optional)",
  "Dışa aktarma seçenekleri bulunamadı.": "Export options not found.",
  "Önce tüm satırları hazır olarak işaretle.": "Mark all rows as ready first.",
  "Hazırlanıyor…": "Preparing…",
  "Hazır onayını geri al": "Revoke ready confirmation",
  "Satırı hazır olarak işaretle": "Mark row as ready",
  "Tüm talepler hazır. Markdown olarak dışa aktarabilirsin.": "All requests are ready. You can export as Markdown.",
  "Görsel eklendi.": "Image added.",
  "Görsel kaldırıldı.": "Image removed.",
  "Dosya eklendi.": "File added.",
  "Dosya kaldırıldı.": "File removed.",
  "İstek silindi.": "Request deleted.",
  "İstekler temizlendi.": "Requests cleared.",
  "Seçim iptal edildi.": "Selection cancelled.",
  "Ekran alıntısı iptal edildi.": "Screenshot cancelled.",
  "Sayfa yolu güncellendi.": "Page path updated.",
  "Kayıt oluşturuldu.": "Record created.",
  "Başlık, Açıklama": "Title, Description",
  "Henüz ajan tanımlanmadı. Dışa aktarmada kullanmak için ayarlardan ajan ekle.": "No agents defined yet. Add an agent from settings to use it during export.",
  "Henüz ajan tanımlanmadı. Ajan seçimi zorunlu değil; istersen ayarlardan ajan ekle.": "No agents defined yet. Agent selection is optional; add one from settings if you want.",
  "Kaydedildi": "Saved",
  "Sistem": "System",
  "Hakkında": "About",
  "Uygulama": "Application",
  "Ayarlar sekmeleri": "Settings tabs",
  "Dil, tema ve klasör konumları.": "Language, theme and folder locations.",
  "Kayıtların saklanacağı kök klasör.": "Root folder where records are stored.",
  "Dışa aktarım dosyalarının hedef klasörü.": "Target folder for export files.",
  "Çıktı ve planlama tercihleri.": "Output and planning preferences.",
  "Kök dizini yolu": "Root folder path",
  "Proje dizini yolu": "Project folder path",
  "Türkçeye geç": "Switch to Turkish",
  "İngilizceye geç": "Switch to English",
  "Dili değiştir": "Change language",
  "Sistem ayarları varsayılana döndü.": "System settings reset to defaults.",
  "Yeniden adlandır": "Rename",
  "Kaydı yeniden adlandır": "Rename record",
  "Kayıt adı": "Record name",
  "Kayıt adı boş olamaz.": "Record name cannot be empty.",
  "Kayıt yeniden adlandırıldı.": "Record renamed.",
  "Bu ad yalnızca kayıt listesinde görünür; dışa aktarılan .md dosyasının adını değiştirmez.": "This name is shown only in the record list; it does not change the exported .md file name.",
  "Görev:": "Role:",
  "Ajan Adı:": "Agent name:",
  "Ajan .MD Dosyası:": "Agent .MD file:",
  "Yayıncı": "Publisher",
  "Sürüm": "Version",
  "İletişim": "Contact",
  "Proje isteklerini topla, doğrula ve Markdown olarak dışa aktar.": "Collect project requests, review them and export as Markdown.",
  "Tarih": "Date",
  "Talep": "Request",
  "Görsel": "Image",
  "Dosya": "File",
  "Biçim": "Format",
  "Hedef": "Target",
  "Dosya adı": "File name",
  "Dışa aktarıldı": "Exported",
  "Kök dosya": "Root file",
  "Neden": "Reason",
  "Manuel taslak": "Manual draft",
  "Tarayıcıda": "In browser",
  "Tarayıcı": "Browser",
  "Tamam": "Complete",
  "Eksik": "Missing",
  "Evet": "Yes",
  "Hayır": "No",
  "İndirilenler": "Downloads",
  "Eksik alan var": "Missing fields",
  "Henüz dışa aktarılmadı": "Not exported yet",
  "Taslak": "Draft",
  "Kaydet ikonuyla alınan anlık kayıtlar.": "Instant records taken with the Save icon.",
  "Yükleme öncesi otomatik alınan taslaklar.": "Drafts captured automatically before loading.",
  "Kayıtları temizle": "Clear Records",
  "Taslakları temizle": "Clear Drafts",
  "Henüz kayıt yok. Üstteki Kaydet ikonuyla anlık kayıt alabilirsin.": "No records yet. Take an instant record with the Save icon at the top.",
  "Henüz taslak yok. Bir kayıt yüklenmeden önce mevcut liste otomatik taslak olarak saklanır.": "No drafts yet. The current list is stored as a draft before a record is loaded.",
  "Hemen aktar": "Instant export",
  "Varsayılan, son tercihler veya hemen aktar.": "Default, last preferences or instant export.",
  "Dil, tema, dışa aktarım davranışı ve klasör konumları.": "Language, theme, export behavior and folder locations.",
  "izin gerekli": "permission required",
  "Kök dizini seç": "Select root folder",
  "Kök dizinini seç": "Select root folder",
  "Proje dizinini kaldır": "Remove project folder",
  "Geliştirici": "Developer",
  "Uygulama geliştiricisi": "Application developer",
  "Uygulama reposu": "Application repository",
  "Güncelleme Geçmişi": "Update History",
  "Yeni Özellikler": "New Features",
  "Güncellemeler": "Updates",
  "Hata Düzeltmeleri": "Bug Fixes",
  "Klasör seçilemedi. Lütfen yazılabilir bir klasör seçin.": "Folder could not be selected. Please choose a writable folder.",
  "Tarayıcı bu klasöre erişim izni vermedi. C:\\ veya masaüstü kökü gibi sistem klasörleri yerine yazılabilir bir alt klasör seçin.": "The browser did not grant access to this folder. Choose a writable subfolder instead of a system folder such as C:\\ or the desktop root.",
  "1. Yeni istek ekle": "1. Add a new request",
  "Her güncelleme, yeni özellik, soru veya kaldırma isteği için ayrı bir satır aç. Türü seçtiğinde yalnızca o türe ait alanlar görünür.": "Open a separate row for each update, new feature, question or removal request. When you select a type, only its fields appear.",
  "2. Ayarları kullan": "2. Use settings",
  "Ayarlar üç sekmeye ayrıldı: Sistem, Yapılandırma ve Hakkında. Dil ve tema seçimi Kaydet’e basmadan otomatik saklanır.": "Settings is split into three tabs: System, Configuration and About. Language and theme are saved automatically without pressing Save.",
  "3. Ajanları tanımla": "3. Define agents",
  "Ajanlar artık zorunlu değil. Yapılandırma sekmesinden istersen ajan ekle; seçim yapmadan da dışa aktarabilirsin.": "Agents are no longer mandatory. Add agents from the Configuration tab if you want; you can export without selecting any.",
  "4. Görsel ve dosya ekle": "4. Add images and files",
  "Satırı açıp Görseller bölümündeki Görsel ekle düğmesini kullan. Tasarım türünde örnek .html / .css dosyası da ekleyebilirsin.": "Open the row and use the Add image button in the Images section. For the Design type, you can also add an example .html / .css file.",
  "5. Tik ile onayla": "5. Confirm with the checkmark",
  "Zorunlu alanlar dolunca satırdaki tiki tıkla. Tik tıklanmayan satır varsa dışa aktarma kapalı kalır.": "When required fields are complete, click the row's checkmark. Export stays disabled if any row is not confirmed.",
  "6. Dışa aktar": "6. Export",
  "Çıktı biçimini ve planlamayı seç. Hemen aktar ile bu seçimleri kaydet; sonraki dışa aktarımlar modal açılmadan aynı seçimlerle çalışır.": "Choose the output format and planning. Save these selections with Instant export; later exports run with the same selections without opening the modal.",
  "7. Kayıtları yönet": "7. Manage records",
  "Kaydet ile anlık kayıt al. Aynı deftere ait bir kayıt varsa uygulama seni uyarır. Kayıt detayından Yeniden adlandır ile yalnızca görünen adı değiştirebilirsin.": "Take an instant record with Save. If a record for the same ledger exists, the app warns you. Rename from the record detail changes only the display name.",
  "8. Yedek al": "8. Back up",
  "Sol paneldeki Yedek bölümünden ZIP veya JSON yedeği indir. Yedekler dil, tema, ajanlar ve defter kimliği dahil güncel ayarları içerir.": "Download a ZIP or JSON backup from the Backup section in the left panel. Backups include current settings such as language, theme, agents and ledger ID."
};

let currentLanguage = "en";

function normalizeLang(lang){
  return lang === "tr" ? "tr" : "en";
}
function setLanguage(lang){
  currentLanguage = normalizeLang(lang);
  return currentLanguage;
}
function getLanguage(){
  return currentLanguage;
}
function trLower(value){
  return String(value == null ? "" : value).toLocaleLowerCase("tr");
}
function countLabel(n, lang, forms){
  const options = forms || {};
  const one = options.one == null ? "" : options.one;
  const many = options.many == null ? one : options.many;
  return n + " " + (n === 1 ? one : many);
}
function formatDateLong(value, lang){
  const d = value instanceof Date ? value : (value ? new Date(value) : new Date());
  if(isNaN(d.getTime())) return "";
  const code = normalizeLang(lang == null ? currentLanguage : lang) === "en" ? "en-US" : "tr-TR";
  try{
    return new Intl.DateTimeFormat(code, { day:"2-digit", month:"long", year:"numeric", weekday:"long" }).format(d);
  }catch(err){
    return d.toLocaleDateString(code);
  }
}
function translatePattern(core, lang){
  let match;
  if((match = /^(\d+)\s+talep$/.exec(core))) return match[1] + " requests";
  if((match = /^(\d+)\s+talep\s+·\s+(.+)$/.exec(core))) return match[1] + " requests · " + translate(match[2], lang);
  if((match = /^(\d+)\s+görsel$/.exec(core))) return match[1] + " images";
  if((match = /^(\d+)\s+dosya$/.exec(core))) return match[1] + " files";
  if((match = /^(\d+)\s+istek$/.exec(core))) return match[1] + " requests";
  if((match = /^(\d+)\s+kayıt$/.exec(core))) return match[1] + " records";
  if((match = /^(\d+)\s+adet$/.exec(core))) return match[1];
  if((match = /^(\d+)\s*\/\s*(\d+)\s+hazır$/.exec(core))) return match[1] + " / " + match[2] + " ready";
  if((match = /^%(\d+)$/.exec(core))) return "%" + match[1];
  if((match = /^(\d+)\s+eksik$/.exec(core))) return match[1] + " missing";
  if((match = /^(\d+)\s+talep hazır değil$/.exec(core))) return match[1] + " requests not ready";
  if((match = /^Son değişiklik:\s*(.+)$/.exec(core))) return "Last change: " + match[1];
  if((match = /^Varsayılan:\s*(.+)$/.exec(core))) return "Default: " + match[1];
  if((match = /^Eksik seçim:\s*(.+)$/.exec(core))) return "Missing selection: " + translate(match[1], lang);
  if((match = /^(\d+) talep henüz hazır değil\. Aşağıdaki satıra tıklayarak eksik alanı tamamla; tüm satırlar onaylanmadan dışa aktarma kapalı kalır\.$/.exec(core))) return match[1] + " requests are not ready yet. Click a row below to complete the missing field; export stays disabled until all rows are confirmed.";
  if((match = /^(\d+) talep dışa aktarmaya hazır değil\. Eksikleri tamamlayıp tik ile onayla\.$/.exec(core))) return match[1] + " requests are not ready for export. Complete the missing fields and confirm with the checkmark.";
  if((match = /^Durum:\s*(.+)$/.exec(core))) return "Status: " + translate(match[1], lang);
  if((match = /^Dil:\s*(.+)$/.exec(core))) return "Language: " + translate(match[1], lang);
  if((match = /^Tür:\s*(.+)$/.exec(core))) return "Type: " + translate(match[1], lang);
  if((match = /^Öncelik:\s*(.+)$/.exec(core))) return "Priority: " + translate(match[1], lang);
  if((match = /^Ajan görevi:\s*(.+)$/.exec(core))) return "Agent role: " + match[1];
  if((match = /^Tema:\s*(.+)$/.exec(core))) return "Theme: " + translate(match[1], lang);
  if((match = /^Dışa aktarım davranışı:\s*(.+)$/.exec(core))) return "Export behavior: " + translate(match[1], lang);
  if((match = /^Eksik alanları göster:\s*(.+)$/.exec(core))) return "Show missing fields: " + match[1].split(", ").map(function(part){ return translate(part, lang); }).join(", ");
  if((match = /^(.+) eklendi\. Başlık ve açıklamayla devam et\.$/.exec(core))) return match[1] + " added. Continue with title and description.";
  if((match = /^(.+) hazır olarak işaretlendi\.$/.exec(core))) return match[1] + " marked as ready.";
  if((match = /^(.+) onayı kaldırıldı\.$/.exec(core))) return match[1] + " confirmation removed.";
  if((match = /^(.+) · izin gerekli$/.exec(core))) return match[1] + " · permission required";
  if((match = /^Defterdeki (\d+) istek temizlenecek\. Kayıtlar, Taslaklar ve Dışa Aktarılanlar korunur\. Bu işlem geri alınamaz\.$/.exec(core))) return "The " + match[1] + " requests in the ledger will be cleared. Records, Drafts and Exported will be kept. This action cannot be undone.";
  if((match = /^(\d+) istek yüklenecek\. Mevcut istekler değiştirilecek\.$/.exec(core))) return match[1] + " requests will be loaded. Current requests will be replaced.";
  if((match = /^(\d+) talep ve (\d+) kayıt geri yüklenecek\. Mevcut talepler ve Kayıtlar yedekteki verilerle değiştirilecek\. Devam etmek istiyor musun\?$/.exec(core))) return match[1] + " requests and " + match[2] + " records will be restored. Current requests and Records will be replaced with the backup data. Continue?";
  if((match = /^(\d+) talep geri yüklenecek\. Mevcut talepler yedekteki verilerle değiştirilecek\. Devam etmek istiyor musun\?$/.exec(core))) return match[1] + " requests will be restored. Current requests will be replaced with the backup data. Continue?";
  if((match = /^Çıktı (hedef klasöre kaydedildi|indirildi): (.+)\. Mevcut talepleri temizlemek ister misin\?$/.exec(core))) return "Output " + (match[1] === "hedef klasöre kaydedildi" ? "saved to the project folder" : "downloaded") + ": " + match[2] + ". Do you want to clear the current requests?";
  if((match = /^(.+) kalıcı olarak silinecek\. Bu işlem geri alınamaz\.$/.exec(core))) return match[1] + " will be permanently deleted. This action cannot be undone.";
  if((match = /^Bu istek listesi (.+) tarihinde kaydedilmiş\. Mevcut kaydın üzerine yazmak mı, yoksa yeni bir kayıt oluşturmak mı istersin\?$/.exec(core))) return "This request list was saved on " + match[1] + ". Do you want to overwrite the existing record or create a new one?";
  if((match = /^Oto\. Kayıt\s*(.+)$/.exec(core))) return "Auto save " + match[1];
  if(core === "Oto. Kayıt…") return "Auto save…";
  if(core === "Oto. Kayıt hatası") return "Auto save error";
  if((match = /^(.+)\s+eklendi\.$/.exec(core))) return match[1] + " added.";
  if((match = /^(.+)\s+güncellendi\.$/.exec(core))) return match[1] + " updated.";
  if((match = /^(.+)\s+silindi\.$/.exec(core))) return match[1] + " deleted.";
  if((match = /^(.+)\s+oluşturuldu\.$/.exec(core))) return match[1] + " created.";
  if((match = /^(.+)\s+eklenemedi\.$/.exec(core))) return match[1] + " could not be added.";
  if((match = /^(.+)\s+çok büyük \(en fazla (\d+) MB\)\.$/.exec(core))) return match[1] + " is too large (max " + match[2] + " MB).";
  if((match = /^(\d+)\s+görsel eklendi\.(.*)$/.exec(core))) return match[1] + " images added." + match[2];
  if((match = /^(\d+)\s+dosya eklendi\.(.*)$/.exec(core))) return match[1] + " files added." + match[2];
  if((match = /^Hedef klasör:\s*(.+)$/.exec(core))) return "Project folder: " + match[1];
  if((match = /^Dışa aktarım dizini:\s*(.+?) · değiştirmek için tıkla$/.exec(core))) return "Export directory: " + match[1] + " · click to change";
  if((match = /^Dışa aktarım dizini:\s*(.+)$/.exec(core))) return "Export directory: " + match[1];
  if((match = /^Proje dizini:\s*(.+?) · değiştirmek için tıkla$/.exec(core))) return "Project folder: " + match[1] + " · click to change";
  if((match = /^Kök dizin:\s*(.+?) · değiştirmek için tıkla$/.exec(core))) return "Root folder: " + match[1] + " · click to change";
  if((match = /^Proje dizini:\s*(.+)$/.exec(core))) return "Project folder: " + match[1];
  if((match = /^Kök dizin:\s*(.+)$/.exec(core))) return "Root folder: " + match[1];
  if((match = /^İndirildi:\s*(.+)$/.exec(core))) return "Downloaded: " + match[1];
  if((match = /^Hedef klasöre kaydedildi:\s*(.+)$/.exec(core))) return "Saved to target folder: " + match[1];
  if((match = /^Yüklendi:\s*(.+)$/.exec(core))) return "Loaded: " + match[1];
  if((match = /^Çıktı indirildi:\s*(.+)$/.exec(core))) return "Output downloaded: " + match[1];
  if((match = /^(\d+)\s+talep ve (\d+)\s+kayıt$/.exec(core))) return match[1] + " requests and " + match[2] + " records";
  return null;
}
function translate(value, lang){
  const code = normalizeLang(lang == null ? currentLanguage : lang);
  if(code !== "en") return value;
  const raw = String(value == null ? "" : value);
  const leading = (raw.match(/^\s*/) || [""])[0];
  const trailing = (raw.match(/\s*$/) || [""])[0];
  const core = raw.trim();
  if(!core) return raw;
  const translated = TRANSLATIONS_EN[core] || translatePattern(core, code);
  return translated == null ? raw : leading + translated + trailing;
}

  /* ---------- model.mjs ---------- */
/*
  Request model: lookups, validation, identity, normalisation, serialisation, mutation.

  Ported verbatim from the previous monolithic core (v1.9.1). Function names and behaviour
  are unchanged, including:
    - readiness requires title + description + known type + known priority;
    - missingFields reports only title and description;
    - normalize() forces confirmed=false when the data is not auto-valid;
    - content changes revoke confirmation;
    - order is array order (no implicit sorting).
*/


function typeInfo(id) {
  return TYPE_MAP[id] || TYPES[0];
}

function priorityInfo(id) {
  return PRIORITY_MAP[id] || PRIORITIES[1];
}

function agentRoleInfo(id) {
  return AGENT_ROLE_MAP[id] || AGENT_ROLES[6];
}

function agentRoleLabel(id) {
  return agentRoleInfo(id).label;
}

function agentDisplayName(agent) {
  if (!agent) return "";
  return agent.name && agent.name.trim() ? agent.name.trim() : agentRoleLabel(agent.role);
}

function sortAgentsByRole(list) {
  return (list || []).slice().sort((a, b) => {
    const orderA = AGENT_ROLE_ORDER[a.role] == null ? 99 : AGENT_ROLE_ORDER[a.role];
    const orderB = AGENT_ROLE_ORDER[b.role] == null ? 99 : AGENT_ROLE_ORDER[b.role];
    if (orderA !== orderB) return orderA - orderB;
    return agentDisplayName(a).localeCompare(agentDisplayName(b), "tr");
  });
}

function normalizeAgent(raw) {
  raw = raw || {};
  const role = AGENT_ROLE_MAP[raw.role] ? raw.role : "general";
  let id = String(raw.id || "").trim();
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(id)) id = "agent_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
  return {
    id,
    name: String(raw.name || "").slice(0, 80),
    role,
    mdPath: String(raw.mdPath || raw.mdFile || "").slice(0, 300),
  };
}

function makeAgent() {
  return {
    id: "agent_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
    name: "",
    role: "general",
    mdPath: "",
  };
}

function typeTemplate(id) {
  return TYPE_TEMPLATES[id] || TYPE_TEMPLATES.update;
}

function isAutoValid(req) {
  if (!req) return false;
  if (!req.title || !req.title.trim()) return false;
  if (!req.description || !req.description.trim()) return false;
  if (!TYPE_MAP[req.type]) return false;
  if (!PRIORITY_MAP[req.priority]) return false;
  return true;
}

function missingFields(req) {
  const out = [];
  if (!req || !req.title || !req.title.trim()) out.push({ key: "title", label: "Başlık" });
  if (!req || !req.description || !req.description.trim()) out.push({ key: "description", label: "Açıklama" });
  return out;
}

function requestStatus(req) {
  if (!isAutoValid(req)) return "missing";
  if (!req.confirmed) return "pending";
  return "ready";
}

function nextId(requests) {
  let max = 0;
  (requests || []).forEach((req) => {
    if (!req) return;
    const match = /^IST-(\d+)$/.exec(req.id);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  });
  return "IST-" + String(max + 1).padStart(3, "0");
}

function makeNewRequest(requests, typeId) {
  const now = nowISO();
  return {
    id: nextId(requests),
    type: TYPE_MAP[typeId] ? typeId : "feature",
    title: "",
    page: "",
    location: "",
    consoleError: "",
    description: "",
    priority: "normal",
    link: "",
    sampleWebsite: "",
    note: "",
    images: [],
    attachments: [],
    confirmed: false,
    collapsed: false,
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeRequest(raw, index) {
  raw = raw || {};
  let id = String(raw.id || "").trim();
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) id = "IST-" + String(index + 1).padStart(3, "0");
  const req = {
    id,
    type: TYPE_MAP[raw.type] ? raw.type : "update",
    title: String(raw.title || ""),
    page: String(raw.page || ""),
    location: String(raw.location || ""),
    consoleError: String(raw.consoleError || ""),
    description: String(raw.description || ""),
    priority: PRIORITY_MAP[raw.priority] ? raw.priority : "normal",
    link: String(raw.link || ""),
    sampleWebsite: String(raw.sampleWebsite || ""),
    note: String(raw.note || ""),
    images: Array.isArray(raw.images)
      ? raw.images
          .filter((img) => img && img.id)
          .map((img) => ({
            id: String(img.id),
            name: String(img.name || "görsel"),
            w: Number(img.w) || 0,
            h: Number(img.h) || 0,
            size: Number(img.size) || 0,
            type: String(img.type || "image/webp"),
            ext: String(img.ext || extFromMime(img.type)),
            file: img.file ? String(img.file) : "",
          }))
      : [],
    attachments: Array.isArray(raw.attachments)
      ? raw.attachments
          .filter((att) => att && att.id)
          .map((att) => ({
            id: String(att.id),
            name: String(att.name || "dosya"),
            size: Number(att.size) || 0,
            type: String(att.type || "application/octet-stream"),
            ext: String(att.ext || extFromFileName(att.name)),
            file: att.file ? String(att.file) : "",
          }))
      : [],
    confirmed: Boolean(raw.confirmed),
    collapsed: raw.collapsed !== false,
    createdAt: raw.createdAt || nowISO(),
    updatedAt: raw.updatedAt || raw.createdAt || nowISO(),
  };
  if (!isAutoValid(req)) req.confirmed = false;
  return req;
}

function serializeRequest(req, mapImage, mapAttachment) {
  return {
    id: req.id,
    type: req.type,
    title: req.title,
    page: req.page,
    location: req.location,
    consoleError: req.consoleError,
    description: req.description,
    priority: req.priority,
    link: req.link,
    sampleWebsite: req.sampleWebsite,
    note: req.note,
    images: (req.images || []).map((img, index) => {
      if (mapImage) return mapImage(img, index);
      return {
        id: img.id,
        name: img.name,
        w: img.w,
        h: img.h,
        size: img.size,
        type: img.type,
        ext: img.ext,
        file: img.file || "",
      };
    }),
    attachments: (req.attachments || []).map((att, index) => {
      if (mapAttachment) return mapAttachment(att, index);
      return {
        id: att.id,
        name: att.name,
        size: att.size,
        type: att.type,
        ext: att.ext,
        file: att.file || "",
      };
    }),
    confirmed: req.confirmed,
    collapsed: req.collapsed,
    createdAt: req.createdAt,
    updatedAt: req.updatedAt,
  };
}

function requestsSignature(requests) {
  return JSON.stringify(
    (requests || []).map((req) => ({
      id: req.id,
      type: req.type,
      title: req.title,
      page: req.page,
      location: req.location,
      consoleError: req.consoleError,
      description: req.description,
      priority: req.priority,
      link: req.link,
      sampleWebsite: req.sampleWebsite,
      note: req.note,
      images: (req.images || []).map((img) => img.id),
      attachments: (req.attachments || []).map((att) => att.id),
    }))
  );
}

function getReq(requests, id) {
  const list = requests || [];
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  return null;
}

function incompleteRequests(requests) {
  return (requests || []).filter((req) => requestStatus(req) !== "ready");
}

function duplicateRequest(req, requests) {
  if (!req) return null;
  return {
    id: nextId(requests),
    type: req.type,
    title: (req.title ? req.title + " (kopya)" : "Kopya istek").slice(0, 120),
    page: req.page,
    location: req.location,
    consoleError: req.consoleError,
    description: req.description,
    priority: req.priority,
    link: req.link,
    sampleWebsite: req.sampleWebsite,
    note: req.note,
    images: [],
    attachments: [],
    confirmed: false,
    collapsed: false,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
}

const UPDATE_FIELDS = ["type", "title", "page", "location", "consoleError", "description", "priority", "link", "sampleWebsite", "note", "images", "attachments"];

function updateRequest(req, patch) {
  if (!req) return null;
  let contentChanged = false;
  let hasConfirmed = false;
  let nextConfirmed = false;
  Object.keys(patch || {}).forEach((key) => {
    if (key === "confirmed") {
      hasConfirmed = true;
      nextConfirmed = Boolean(patch.confirmed);
      return;
    }
    if (key === "collapsed" || key === "createdAt" || key === "updatedAt" || key === "_showErrors") return;
    req[key] = patch[key];
    if (UPDATE_FIELDS.indexOf(key) >= 0) contentChanged = true;
  });
  if (contentChanged) {
    if (req.confirmed) req.confirmed = false;
    req.updatedAt = nowISO();
  }
  if (hasConfirmed) {
    req.confirmed = nextConfirmed;
    /* Confirmation is user-visible content and must carry a new revision, or
       item-level bridge merges keep the receiver's older confirmed value. */
    req.updatedAt = nowISO();
  }
  return req;
}

function removeRequest(requests, id) {
  const list = requests || [];
  const index = list.findIndex((req) => req.id === id);
  if (index < 0) return { requests: list, removed: null };
  const removed = list.splice(index, 1)[0];
  return { requests: list, removed };
}

function moveRequest(requests, id, delta) {
  const list = requests || [];
  const index = list.findIndex((req) => req.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= list.length) return list;
  const temp = list[index];
  list[index] = list[target];
  list[target] = temp;
  return list;
}

  /* ---------- storage.mjs ---------- */
/*
  Persistence adapters: localStorage state/theme and IndexedDB stores.

  Ported verbatim from the previous monolithic core (v1.9.1). init() opens the database
  lazily; every store call is a no-op or an in-memory failure when the database is closed,
  exactly as before. Settings (database name/version, state key, theme key) are module
  state so a single instance owns them.
*/


let settings = {
  dbName: DB.name,
  dbVersion: DB.version,
  stateKey: "oz-istek-defteri-v1",
  themeKey: "gd-theme",
  projectId: null
};
let idb = null;
let lastSaveError = null;

function getLocalStorage(){
  try{
    if(typeof localStorage !== "undefined" && localStorage) return localStorage;
  }catch(err){}
  return null;
}
function openDB(){
  return new Promise(function(resolve, reject){
    if(typeof indexedDB === "undefined" || !indexedDB){
      reject(new Error("IndexedDB yok"));
      return;
    }
    const request = indexedDB.open(settings.dbName, settings.dbVersion);
    request.onupgradeneeded = function(){
      const db = request.result;
      Object.keys(DB.stores).forEach(function(key){
        const store = DB.stores[key];
        if(!db.objectStoreNames.contains(store)){
          db.createObjectStore(store, { keyPath:"id" });
        }
      });
    };
    request.onsuccess = function(){ resolve(request.result); };
    request.onerror = function(){ reject(request.error || new Error("IndexedDB açılamadı")); };
    request.onblocked = function(){ reject(new Error("IndexedDB bloklu")); };
  });
}
function transactionInfo(store, mode, action, errorMessage){
  return new Promise(function(resolve, reject){
    if(!idb){ resolve(null); return; }
    let tx;
    try{ tx = idb.transaction(store, mode); }
    catch(err){ reject(err); return; }
    const objectStore = tx.objectStore(store);
    const request = action ? action(objectStore) : null;
    if(request) request.onsuccess = function(){ resolve(request.result == null ? null : request.result); };
    tx.oncomplete = function(){ if(!request) resolve(); };
    tx.onerror = function(){ reject(tx.error || new Error(errorMessage)); };
    tx.onabort = function(){ reject(tx.error || new Error(errorMessage)); };
  });
}
function storePut(store, record){
  return new Promise(function(resolve, reject){
    if(!idb){ reject(new Error("IndexedDB kapalı")); return; }
    let tx;
    try{ tx = idb.transaction(store, "readwrite"); }
    catch(err){ reject(err); return; }
    tx.objectStore(store).put(record);
    tx.oncomplete = function(){ resolve(); };
    tx.onerror = function(){ reject(tx.error || new Error("Kayıt yazılamadı")); };
    tx.onabort = function(){ reject(tx.error || new Error("Kayıt yazılamadı")); };
  });
}
function storeGet(store, id){
  return transactionInfo(store, "readonly", function(objectStore){ return objectStore.get(id); }, "Kayıt okunamadı");
}
function storeDelete(store, id){
  return new Promise(function(resolve, reject){
    if(!idb){ resolve(); return; }
    let tx;
    try{ tx = idb.transaction(store, "readwrite"); }
    catch(err){ reject(err); return; }
    tx.objectStore(store).delete(id);
    tx.oncomplete = function(){ resolve(); };
    tx.onerror = function(){ reject(tx.error || new Error("Kayıt silinemedi")); };
  });
}
function storeClear(store){
  return new Promise(function(resolve, reject){
    if(!idb){ resolve(); return; }
    let tx;
    try{ tx = idb.transaction(store, "readwrite"); }
    catch(err){ reject(err); return; }
    tx.objectStore(store).clear();
    tx.oncomplete = function(){ resolve(); };
    tx.onerror = function(){ reject(tx.error || new Error("Kayıtlar temizlenemedi")); };
  });
}
/* Project scoping is additive: rows written while a project is active carry
   projectId, reads filter on it, and clears delete only that project's rows.
   With no project selected the old global behaviour is preserved so core
   parity and legacy installs keep working. */
function scopedRecord(record){
  if(!settings.projectId || !record || typeof record !== "object") return record;
  if(record.projectId) return record;
  const copy = Object.assign({}, record);
  copy.projectId = settings.projectId;
  return copy;
}
function scopedRows(rows){
  if(!settings.projectId) return rows;
  return rows.filter(function(row){ return row && row.projectId === settings.projectId; });
}
function storeClearScoped(store){
  if(!settings.projectId) return storeClear(store);
  return new Promise(function(resolve, reject){
    if(!idb){ resolve(); return; }
    let tx;
    try{ tx = idb.transaction(store, "readwrite"); }
    catch(err){ reject(err); return; }
    const objectStore = tx.objectStore(store);
    const request = objectStore.openCursor();
    request.onsuccess = function(){
      const cursor = request.result;
      if(!cursor) return;
      if(cursor.value && cursor.value.projectId === settings.projectId) cursor.delete();
      cursor.continue();
    };
    tx.oncomplete = function(){ resolve(); };
    tx.onerror = function(){ reject(tx.error || new Error("Kayıtlar temizlenemedi")); };
    tx.onabort = function(){ reject(tx.error || new Error("Kayıtlar temizlenemedi")); };
  });
}
function storeGetAll(store){
  return new Promise(function(resolve, reject){
    if(!idb){ resolve([]); return; }
    let tx;
    try{ tx = idb.transaction(store, "readonly"); }
    catch(err){ reject(err); return; }
    const request = tx.objectStore(store).getAll();
    request.onsuccess = function(){ resolve(request.result || []); };
    request.onerror = function(){ reject(request.error || new Error("Kayıtlar okunamadı")); };
  });
}
function collectionStore(kind){
  if(kind === "records" || kind === "record") return DB.stores.records;
  if(kind === "drafts" || kind === "draft") return DB.stores.drafts;
  if(kind === "history") return DB.stores.history;
  throw new Error("Bilinmeyen koleksiyon: " + kind);
}

async function init(opts){
  opts = opts || {};
  if(opts.dbName) settings.dbName = String(opts.dbName);
  if(opts.dbVersion) settings.dbVersion = Number(opts.dbVersion);
  if(opts.stateKey) settings.stateKey = String(opts.stateKey);
  if(opts.themeKey) settings.themeKey = String(opts.themeKey);
  if(Object.prototype.hasOwnProperty.call(opts, "projectId")){
    settings.projectId = opts.projectId ? String(opts.projectId) : null;
  }
  if(idb) return;
  idb = await openDB();
}
function close(){
  if(idb && typeof idb.close === "function"){
    try{ idb.close(); }catch(err){}
  }
  idb = null;
}
function loadState(){
  try{
    const ls = getLocalStorage();
    if(!ls) return null;
    const raw = ls.getItem(settings.stateKey);
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    if(!parsed || !Array.isArray(parsed.requests)) return null;
    const state = {
      version: 1,
      project: String(parsed.project || "Projem").trim().slice(0, 60) || "Projem",
      ledgerId: typeof parsed.ledgerId === "string" && parsed.ledgerId ? parsed.ledgerId : newLedgerId(),
      requests: parsed.requests.map(function(req, index){ return normalizeRequest(req, index); }),
      agents: Array.isArray(parsed.agents) ? parsed.agents.map(normalizeAgent) : [],
      language: parsed.language === "tr" ? "tr" : "en",
      exportBehavior: ["last","instant"].indexOf(parsed.exportBehavior) >= 0 ? parsed.exportBehavior : "default",
      lastExport: parsed.lastExport && typeof parsed.lastExport === "object" ? parsed.lastExport : null,
      updatedAt: parsed.updatedAt || null
    };
    let hasOpen = false;
    state.requests.forEach(function(req){
      if(!req.collapsed){
        if(hasOpen) req.collapsed = true;
        else hasOpen = true;
      }
    });
    return state;
  }catch(err){
    return null;
  }
}
function saveState(state){
  lastSaveError = null;
  try{
    const ls = getLocalStorage();
    if(!ls || !state) return false;
    /* Defensive de-duplication: a merge bug or an old profile must never make
       one request id inflate the payload twice. */
    const seen = {};
    const requests = (Array.isArray(state.requests) ? state.requests : []).filter(function(req){
      if(!req || typeof req.id !== "string" || !req.id || seen[req.id]) return false;
      seen[req.id] = true;
      return true;
    });
    const payload = {
      version: 2,
      project: state.project,
      ledgerId: state.ledgerId,
      updatedAt: nowISO(),
      requests: requests.map(function(req){ return serializeRequest(req); }),
      agents: (state.agents || []).map(function(agent){ return { id:agent.id, name:agent.name, role:agent.role, mdPath:agent.mdPath }; }),
      language: state.language,
      exportBehavior: state.exportBehavior,
      lastExport: state.lastExport
    };
    ls.setItem(settings.stateKey, JSON.stringify(payload));
    state.updatedAt = payload.updatedAt;
    return true;
  }catch(err){
    lastSaveError = err || new Error("save failed");
    return false;
  }
}
function getLastSaveError(){
  return lastSaveError;
}
function loadTheme(){
  try{
    const ls = getLocalStorage();
    if(!ls) return null;
    const stored = ls.getItem(settings.themeKey);
    return stored === "dark" || stored === "light" ? stored : null;
  }catch(err){
    return null;
  }
}
function saveTheme(theme){
  try{
    const ls = getLocalStorage();
    if(!ls) return false;
    ls.setItem(settings.themeKey, theme === "dark" ? "dark" : "light");
    return true;
  }catch(err){
    return false;
  }
}

/* ============================================================
   Media (image / file) — IndexedDB
   ============================================================ */
function putImage(record){ return storePut(DB.stores.images, scopedRecord(record)); }
function getImage(id){ return storeGet(DB.stores.images, id); }
function deleteImage(id){ return storeDelete(DB.stores.images, id); }
function putFile(record){ return storePut(DB.stores.files, scopedRecord(record)); }
function getFile(id){ return storeGet(DB.stores.files, id); }
function deleteFile(id){ return storeDelete(DB.stores.files, id); }
function clearAllMedia(){
  return Promise.all([storeClearScoped(DB.stores.images), storeClearScoped(DB.stores.files)]).then(function(){ });
}
function getSetting(id){
  return storeGet(DB.stores.settings, id).then(function(record){
    return record ? record.value : null;
  });
}
function putSetting(id, value){
  return storePut(DB.stores.settings, { id: id, value: value });
}
function deleteSetting(id){
  return storeDelete(DB.stores.settings, id);
}
function listCollection(kind){
  return storeGetAll(collectionStore(kind)).then(scopedRows);
}
function putCollection(kind, record){
  return storePut(collectionStore(kind), scopedRecord(record));
}
function deleteCollection(kind, id){
  return storeDelete(collectionStore(kind), id);
}
function clearCollection(kind){
  return storeClearScoped(collectionStore(kind));
}
function addHistory(entry){
  const record = Object.assign({}, entry || {});
  if(!record.id) record.id = "hist_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  return storePut(DB.stores.history, scopedRecord(record));
}
function listHistory(){
  return storeGetAll(DB.stores.history).then(scopedRows);
}
function clearHistory(){
  return storeClearScoped(DB.stores.history);
}

  /* ---------- media.mjs ---------- */
/*
  Media: blob access through the storage adapters plus canvas image compression.

  Ported verbatim from the previous monolithic core (v1.9.1). compressImage() needs a DOM
  (document/canvas); the blob readers do not.
*/


async function getImageBlob(id){
  const record = await getImage(id);
  return record && record.blob ? record.blob : null;
}
async function getFileBlob(id){
  const record = await getFile(id);
  return record && record.blob ? record.blob : null;
}

/* ============================================================
   Görsel sıkıştırma (DOM canvas)
   ============================================================ */
let webpSupport = null;
function supportsWebP(){
  if(webpSupport !== null) return webpSupport;
  try{
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    webpSupport = canvas.toDataURL("image/webp").indexOf("data:image/webp") === 0;
  }catch(err){
    webpSupport = false;
  }
  return webpSupport;
}
function decodeImage(file){
  if(typeof createImageBitmap === "function"){
    return createImageBitmap(file, { imageOrientation:"from-image" })
      .catch(function(){ return createImageBitmap(file); })
      .catch(function(){ return decodeWithImageElement(file); });
  }
  return decodeWithImageElement(file);
}
function decodeWithImageElement(file){
  return new Promise(function(resolve, reject){
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function(){ URL.revokeObjectURL(url); resolve(img); };
    img.onerror = function(){ URL.revokeObjectURL(url); reject(new Error("Görsel açılamadı")); };
    img.src = url;
  });
}
function canvasToBlob(canvas, type, quality){
  return new Promise(function(resolve){
    canvas.toBlob(function(blob){ resolve(blob); }, type, quality);
  });
}
async function blobToDataURL(blob){
  if(typeof FileReader !== "undefined"){
    return new Promise(function(resolve, reject){
      const reader = new FileReader();
      reader.onload = function(){ resolve(reader.result); };
      reader.onerror = function(){ reject(reader.error || new Error("Dosya okunamadı")); };
      reader.readAsDataURL(blob);
    });
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for(let i = 0; i < bytes.length; i += 0x8000){
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return "data:" + (blob.type || "application/octet-stream") + ";base64," + btoa(binary);
}
async function compressImage(file, opts){
  if(typeof document === "undefined" || !document.createElement){
    throw new Error("media.compress: document bulunamadı (DOM gerekli).");
  }
  const options = opts || {};
  const maxDim = Number(options.maxDim) > 0 ? Number(options.maxDim) : LIMITS.MAX_DIM;
  const quality = typeof options.quality === "number" ? options.quality : LIMITS.JPEG_QUALITY;
  const bitmap = await decodeImage(file);
  const srcW = bitmap.width || bitmap.naturalWidth || 1;
  const srcH = bitmap.height || bitmap.naturalHeight || 1;
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const webp = supportsWebP();
  if(!webp){
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  if(bitmap.close) bitmap.close();
  let type = webp ? "image/webp" : "image/jpeg";
  let blob = await canvasToBlob(canvas, type, quality);
  if(!blob && webp){
    type = "image/jpeg";
    blob = await canvasToBlob(canvas, type, quality);
  }
  if(!blob) throw new Error("Görsel dönüştürülemedi");
  return { blob: blob, w: width, h: height, type: type, ext: extFromMime(type) };
}

  /* ---------- markdown.mjs ---------- */
/*
  Planning block and Markdown document builder.

  Ported verbatim from the previous monolithic core (v1.9.1). Presentation decisions such as
  local-time formatting, label translation and media naming are part of the output contract
  recorded in tests/golden; do not change them casually.
*/


function planningTestInfo(id){
  return PLANNING_TESTS.find(function(item){ return item.id === id; }) || PLANNING_TESTS[0];
}
function runtimePackageText(planning, lang){
  const code = normalizeLang(lang == null ? currentLanguage : lang);
  if(!planning || !planning.runtime){
    return code === "en" ? "No runtime package." : "Runtime paketi yok.";
  }
  const transfers = Array.isArray(planning.transfers) ? planning.transfers.filter(function(item){ return item !== "none"; }) : [];
  const hasServer = transfers.indexOf("server") >= 0;
  const hasGofile = transfers.indexOf("gofile") >= 0;
  if(code === "en"){
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
function planningQuestionText(planning, lang){
  const code = normalizeLang(lang == null ? currentLanguage : lang);
  if(planning && planning.question === true){
    return code === "en"
      ? "Before starting the tasks, ask any questions or share any suggestions about the requests."
      : "İsteklerin yerine getirilmesinden önce istekler ile ilgili soruların veya öneri yapmak istediğin kısımlar var ise görevlere başlamadan önce ilet.";
  }
  return code === "en"
    ? "Start the tasks without asking questions or making suggestions."
    : "Soru veya öneri sunmadan görevlere başla.";
}
function planningSelectedAgents(planning, agents){
  const source = agents || [];
  return sortAgentsByRole(((planning && planning.agents) || []).map(function(id){
    return source.find(function(agent){ return agent.id === id; });
  }).filter(Boolean));
}
function planningAgentTableLines(planning, agents, lang){
  const list = planningSelectedAgents(planning, agents);
  if(!list.length) return ["**" + translate("Çağrılacak Ajanlar", lang) + ":** " + translate("Belirtilmedi", lang), ""];
  const lines = ["**" + translate("Çağrılacak Ajanlar", lang) + ":**", "", "| " + translate("Görev", lang) + " | " + translate("MD Dosyası Yolu", lang) + " |", "|---|---|"];
  list.forEach(function(agent){
    lines.push("| " + mdCell(translate(agentRoleLabel(agent.role), lang)) + " | " + mdCell(agent.mdPath || "—") + " |");
  });
  lines.push("");
  return lines;
}
function planningMarkdownLines(planning, agents, lang){
  const code = normalizeLang(lang == null ? currentLanguage : lang);
  if(!planning || !planning.mode) return [];
  const lines = ["## " + translate("Planlama", lang), ""];
  if(planning.mode === "full"){
    lines.push("**" + translate("Koşu türü", lang) + ":** " + translate("Tam koşu", lang), "");
    lines.push(code === "en" ? PLANNING_FULL_TEXT_EN : PLANNING_FULL_TEXT, "");
    planningAgentTableLines(planning, agents, lang).forEach(function(line){ lines.push(line); });
    lines.push("**" + translate("Runtime Paketi", lang) + ":** " + runtimePackageText(planning, lang), "");
    lines.push("**" + translate("Soru - Öneri isteği", lang) + ":** " + planningQuestionText(planning, lang), "");
    return lines;
  }
  if(planning.mode === "light"){
    lines.push("**" + translate("Koşu türü", lang) + ":** " + translate("Hafif koşu", lang), "");
    lines.push(code === "en" ? PLANNING_LIGHT_TEXT_EN : PLANNING_LIGHT_TEXT, "");
    planningAgentTableLines(planning, agents, lang).forEach(function(line){ lines.push(line); });
    lines.push("**" + translate("Runtime Paketi", lang) + ":** " + runtimePackageText(planning, lang), "");
    lines.push("**" + translate("Soru - Öneri isteği", lang) + ":** " + planningQuestionText(planning, lang), "");
    return lines;
  }
  const test = planningTestInfo(planning.test);
  planningAgentTableLines(planning, agents, lang).forEach(function(line){ lines.push(line); });
  lines.push("**" + translate("Test imkanı", lang) + ":** " + translate(test.label, lang));
  lines.push("");
  lines.push(code === "en" ? test.noteEn : test.note);
  lines.push("");
  lines.push("**" + translate("Runtime Paketi", lang) + ":** " + runtimePackageText(planning, lang), "");
  lines.push("**" + translate("Soru - Öneri isteği", lang) + ":** " + planningQuestionText(planning, lang));
  if(planning.note && String(planning.note).trim()){
    lines.push("", "**" + translate("Not", lang) + ":** " + String(planning.note).trim());
  }
  lines.push("");
  return lines;
}

/* ============================================================
   Markdown
   ============================================================ */
async function buildMarkdown(options){
  const opts = options || {};
  const list = (opts.requests || []).slice();
  const project = opts.project == null ? "Projem" : String(opts.project);
  const lang = normalizeLang(opts.lang == null ? currentLanguage : opts.lang);
  const mode = opts.mode || "none";
  const includeSummary = Boolean(opts.includeSummary);
  const media = opts.media || null;
  const archiveName = opts.archiveName || "";
  const agents = opts.agents || [];

  const imageCount = list.reduce(function(sum, req){ return sum + (req.images || []).length; }, 0);
  const fileCount = list.reduce(function(sum, req){
    const template = typeTemplate(req.type);
    return sum + (template.attachments ? (req.attachments || []).length : 0);
  }, 0);

  const lines = [];
  function headerCount(n, trOne, trMany, enOne, enMany){
    return countLabel(n, lang, { one: lang === "tr" ? trOne : enOne, many: lang === "tr" ? trMany : enMany });
  }
  const headerParts = [formatDateLong(new Date(), lang), headerCount(list.length, "talep", "talep", "request", "requests")];
  if(imageCount) headerParts.push(headerCount(imageCount, "görsel", "görsel", "image", "images"));
  if(fileCount) headerParts.push(headerCount(fileCount, "dosya", "dosya", "file", "files"));
  lines.push("# " + mdLine(project) + " — " + translate("Geliştirme İstekleri", lang), "");
  lines.push("> " + headerParts.join(" · "), "");
  if(archiveName){
    lines.push("> **" + translate("Sıkıştırılmış Dosya", lang) + ":** " + mdLine(archiveName), "");
  }
  if(includeSummary && list.length){
    lines.push("## " + translate("Özet", lang), "");
    lines.push("| # | " + translate("Tür", lang) + " | " + translate("Başlık", lang) + " | " + translate("Öncelik", lang) + " |");
    lines.push("|---|---|---|---|");
    list.forEach(function(req){
      lines.push("| " + mdCell(req.id) + " | " + mdCell(translate(typeInfo(req.type).label, lang)) + " | " + mdCell(req.title || translate("Başlıksız istek", lang)) + " | " + mdCell(translate(priorityInfo(req.priority).label, lang)) + " |");
    });
    lines.push("");
  }
  const planningLines = planningMarkdownLines(opts.planning, agents, lang);
  planningLines.forEach(function(line){ lines.push(line); });

  for(let index = 0; index < list.length; index++){
    const req = list[index];
    const template = typeTemplate(req.type);
    const images = req.images || [];
    const attachments = req.attachments || [];
    lines.push("## " + req.id + " — " + (mdLine(req.title) || translate("Başlıksız istek", lang)), "");
    lines.push("- **" + translate("Tür", lang) + ":** " + translate(typeInfo(req.type).label, lang));
    if(template.page && req.page && String(req.page).trim()) lines.push("- **" + translate("Sayfa", lang) + ":** " + String(req.page).trim());
    if(template.location && req.location && String(req.location).trim()) lines.push("- **" + translate("Sayfadaki Konum", lang) + ":** " + String(req.location).trim());
    lines.push("- **" + translate("Öncelik", lang) + ":** " + translate(priorityInfo(req.priority).label, lang));
    lines.push("- **" + translate("Durum", lang) + ":** " + translate("Hazır", lang));
    lines.push("- **" + translate("Eklenme", lang) + ":** " + formatDateTime(req.createdAt));
    if(mode === "none" && images.length){
      lines.push("- **" + translate("Görseller", lang) + ":** " + images.length + " " + translate("adet", lang) + " (" + translate("Markdown metninde yer almaz", lang) + ")");
    }
    if(mode === "none" && template.attachments && attachments.length){
      lines.push("- **" + translate("Örnek Dosya", lang) + ":** " + attachments.length + " " + translate("adet", lang) + " (" + translate("Markdown metninde yer almaz", lang) + ")");
    }
    if(template.console && req.consoleError && String(req.consoleError).trim()){
      lines.push("", "### " + translate("Console Hatası veya Sayfa Hatası", lang), "", String(req.consoleError).trim(), "");
    }
    lines.push("", "### " + translate("Talep", lang), "", String(req.description || "").trim() || translate("_Açıklama girilmedi._", lang), "");
    if(images.length && mode !== "none"){
      lines.push("### " + translate("Görseller", lang), "");
      for(let i = 0; i < images.length; i++){
        const img = images[i];
        const alt = req.id + " · " + translate("Görsel", lang) + " " + (i + 1);
        let blob = null;
        try{
          if(media && typeof media.getImageBlob === "function") blob = await media.getImageBlob(img.id);
        }catch(err){ blob = null; }
        if(blob){
          if(mode === "embedded"){
            const dataUrl = await blobToDataURL(blob);
            lines.push("![" + alt + "](" + dataUrl + ")", "");
          }else{
            lines.push("![" + alt + "](" + imageFileName(req, i, img) + ")", "");
          }
        }else{
          lines.push("> " + translate("Görsel bulunamadı", lang) + ": " + img.name, "");
        }
      }
    }
    if(template.attachments && attachments.length){
      lines.push("### " + translate("Örnek Dosya", lang), "");
      for(let i = 0; i < attachments.length; i++){
        const att = attachments[i];
        if(mode === "zip"){
          let blob = null;
          try{
            if(media && typeof media.getFileBlob === "function") blob = await media.getFileBlob(att.id);
          }catch(err){ blob = null; }
          if(blob){
            lines.push("- [" + mdLine(att.name) + "](" + attachmentFileName(req, i, att) + ")");
          }else{
            lines.push("- " + mdLine(att.name) + " (" + translate("dosya bulunamadı", lang) + ")");
          }
        }else{
          lines.push("- " + mdLine(att.name) + (mode === "embedded" ? " (" + translate("dosya eki; ZIP çıktısında taşınır", lang) + ")" : ""));
        }
      }
      lines.push("");
    }
    if(template.sampleWebsite && req.sampleWebsite && String(req.sampleWebsite).trim()){
      lines.push("### " + translate("Örnek Web Sitesi", lang), "", String(req.sampleWebsite).trim(), "");
    }
    if(template.link && req.link && String(req.link).trim()){
      lines.push("### " + translate("İlgili Bağlantı", lang), "", String(req.link).trim(), "");
    }
    if(req.note && String(req.note).trim()){
      lines.push("### " + translate("Ek Not", lang), "", String(req.note).trim(), "");
    }
    if(index < list.length - 1) lines.push("---", "");
  }
  lines.push("---", "", "_" + project + " · " + translate("İstek Defteri", lang) + " · " + formatDateTime(new Date()) + "_", "");
  return lines.join("\n");
}

  /* ---------- zip.mjs ---------- */
/*
  Minimal ZIP writer/reader for stored (uncompressed) entries only.

  Ported verbatim from the previous monolithic core (v1.9.1), including the CRC table build.
  parseZip() rejects compressed entries and locates the end-of-central-directory record by
  scanning backwards from the end of the input.
*/

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
function crc32(bytes){
  let crc = 0xFFFFFFFF;
  for(let i = 0; i < bytes.length; i++){
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function dosDateTime(date){
  const d = date || new Date();
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  };
}
function createZip(files){
  if(typeof Blob === "undefined") throw new Error("ZIP oluşturmak için Blob gerekli.");
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  const now = dosDateTime(new Date());
  let offset = 0;
  (files || []).forEach(function(file){
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
  ev.setUint16(8, (files || []).length, true);
  ev.setUint16(10, (files || []).length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralOffset, true);
  ev.setUint16(20, 0, true);
  return new Blob(localParts.concat(centralParts, [end]), { type:"application/zip" });
}
async function parseZip(input){
  if(!input) throw new Error("ZIP girdisi yok.");
  let buffer;
  if(input instanceof Uint8Array){
    buffer = input;
  }else if(typeof input.arrayBuffer === "function"){
    buffer = new Uint8Array(await input.arrayBuffer());
  }else{
    buffer = new Uint8Array(input);
  }
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

  /* ---------- backup.mjs ---------- */
/*
  Backup envelope v3: build, serialise, parse and apply.

  Ported verbatim from the previous monolithic core (v1.9.1). The parse limits (size, request,
  record, draft and agent counts, schema version, foreign app) and the "normalise everything
  before writing anything" order in applyBackup are deliberate data-safety rules.
*/


function backupAgents(agents){
  return (agents || []).map(function(agent){ return { id:agent.id, name:agent.name, role:agent.role, mdPath:agent.mdPath }; });
}
function copySnapshot(raw, mapSnapshotRequest){
  const copy = JSON.parse(JSON.stringify(raw || {}));
  copy.requests = (raw && Array.isArray(raw.requests) ? raw.requests : []).map(mapSnapshotRequest);
  return copy;
}
function buildBackup(payload){
  const data = payload || {};
  const images = [];
  const attachments = [];
  const imageFileById = new Map();
  const attachmentFileById = new Map();
  function mapImage(img){
    let file = imageFileById.get(img.id);
    if(!file){
      file = backupMediaFileName("image", img);
      imageFileById.set(img.id, file);
      images.push({ file: file, img: img });
    }
    return Object.assign({}, img, { file: file });
  }
  function mapAttachment(att){
    let file = attachmentFileById.get(att.id);
    if(!file){
      file = backupMediaFileName("attachment", att);
      attachmentFileById.set(att.id, file);
      attachments.push({ file: file, att: att });
    }
    return Object.assign({}, att, { file: file });
  }
  function mapRequest(req){
    return serializeRequest(req, mapImage, mapAttachment);
  }
  function mapSnapshotRequest(req){
    return serializeRequest(Object.assign({ images: [], attachments: [] }, req), mapImage, mapAttachment);
  }
  const requests = (data.requests || []).map(mapRequest);
  const records = (data.records || []).map(function(record){ return copySnapshot(record, mapSnapshotRequest); });
  const drafts = (data.drafts || []).map(function(draft){ return copySnapshot(draft, mapSnapshotRequest); });
  const backup = {
    app: "istek-defteri",
    version: 3,
    exportedAt: nowISO(),
    project: data.project,
    ledgerId: data.ledgerId,
    agents: backupAgents(data.agents),
    language: data.language,
    exportBehavior: data.exportBehavior,
    lastExport: data.lastExport,
    requests: requests,
    records: records,
    drafts: drafts
  };
  return { backup: backup, images: images, attachments: attachments };
}
function buildBackupJson(payload){
  const bundle = buildBackup(payload);
  function stripRequest(req){
    const copy = Object.assign({}, req);
    copy.images = [];
    copy.attachments = [];
    return copy;
  }
  function stripSnapshot(snapshot){
    const copy = Object.assign({}, snapshot);
    copy.requests = (snapshot.requests || []).map(stripRequest);
    copy.imageCount = 0;
    copy.fileCount = 0;
    copy.fileName = "";
    copy.rootFolder = "";
    copy.writeError = "";
    return copy;
  }
  const backup = {
    app: "istek-defteri",
    version: 3,
    exportedAt: bundle.backup.exportedAt,
    project: bundle.backup.project,
    ledgerId: bundle.backup.ledgerId,
    agents: bundle.backup.agents,
    language: bundle.backup.language,
    exportBehavior: bundle.backup.exportBehavior,
    lastExport: bundle.backup.lastExport,
    note: "Görseller ve dosya ekleri bu yedeğe dahil değildir. Tam yedek için ZIP kullanın.",
    requests: bundle.backup.requests.map(stripRequest),
    records: bundle.backup.records.map(stripSnapshot),
    drafts: bundle.backup.drafts.map(stripSnapshot)
  };
  return backup;
}
async function buildBackupZip(payload, media){
  const bundle = payload && payload.backup ? payload : buildBackup(payload);
  const files = [{ name: "yedek.json", data: utf8Bytes(JSON.stringify(bundle.backup, null, 2)) }];
  for(let i = 0; i < bundle.images.length; i++){
    const item = bundle.images[i];
    let blob = null;
    try{
      if(media && typeof media.getImageBlob === "function") blob = await media.getImageBlob(item.img.id);
    }catch(err){ blob = null; }
    if(blob) files.push({ name: item.file, data: new Uint8Array(await blob.arrayBuffer()) });
  }
  for(let i = 0; i < bundle.attachments.length; i++){
    const item = bundle.attachments[i];
    let blob = null;
    try{
      if(media && typeof media.getFileBlob === "function") blob = await media.getFileBlob(item.att.id);
    }catch(err){ blob = null; }
    if(blob) files.push({ name: item.file, data: new Uint8Array(await blob.arrayBuffer()) });
  }
  return createZip(files);
}
function looksLikeZip(bytes){
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4B &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
}
async function parseBackup(input){
  if(!input) throw new Error("Yedek dosyası yok.");
  let bytes;
  if(input instanceof Uint8Array){
    bytes = input;
  }else if(typeof input.arrayBuffer === "function"){
    bytes = new Uint8Array(await input.arrayBuffer());
  }else{
    bytes = new Uint8Array(input);
  }
  if(bytes.length > 512 * 1024 * 1024){
    throw new Error("Yedek dosyası çok büyük.");
  }
  let data = null;
  let entries = null;
  if(looksLikeZip(bytes)){
    entries = await parseZip(bytes);
    if(!entries["yedek.json"]) throw new Error("ZIP içinde yedek.json bulunamadı.");
    data = JSON.parse(new TextDecoder("utf-8").decode(entries["yedek.json"]));
  }else{
    data = JSON.parse(new TextDecoder("utf-8").decode(bytes));
  }
  if(!data || !Array.isArray(data.requests)){
    throw new Error("Geçersiz yedek dosyası: \"requests\" dizisi bulunamadı.");
  }
  if(data.app && data.app !== "istek-defteri"){
    throw new Error("Bu dosya bir Request Ledger yedeği değil.");
  }
  if(Number(data.version) > 3){
    throw new Error("Yedek daha yeni bir sürümle oluşturulmuş.");
  }
  if(data.requests.length > 5000){
    throw new Error("Yedekte çok fazla talep var.");
  }
  if(Array.isArray(data.records) && data.records.length > 2000){
    throw new Error("Yedekte çok fazla kayıt var.");
  }
  if(Array.isArray(data.drafts) && data.drafts.length > 2000){
    throw new Error("Yedekte çok fazla taslak var.");
  }
  if(Array.isArray(data.agents) && data.agents.length > 200){
    throw new Error("Yedekte çok fazla ajan var.");
  }
  return { data: data, entries: entries };
}
function snapshotProject(value, fallback){
  return String(value || fallback || "Projem").trim().slice(0, 60) || fallback || "Projem";
}
async function applyBackup(data, entries, options){
  if(!data || !Array.isArray(data.requests)){
    throw new Error("Geçersiz yedek dosyası: \"requests\" dizisi bulunamadı.");
  }
  const opts = options || {};
  const adapter = opts.media || {};
  const putImageRec = typeof adapter.putImage === "function" ? adapter.putImage : putImage;
  const putFileRec = typeof adapter.putFile === "function" ? adapter.putFile : putFile;
  const project = snapshotProject(data.project, "Projem");
  const stats = { missingImages: 0, missingFiles: 0, restoredImages: 0, restoredFiles: 0 };

  // 1) Normalize the whole bundle in memory before touching any store.
  const restored = data.requests.map(function(raw, index){ return normalizeRequest(raw, index); });
  const sourceRecords = Array.isArray(data.records) ? data.records : null;
  const sourceDrafts = Array.isArray(data.drafts) ? data.drafts : null;

  async function restoreMedia(req){
    const keptImages = [];
    for(let j = 0; j < req.images.length; j++){
      const img = req.images[j];
      const file = img.file || imageFileName(req, j, img);
      const bytes = entries && entries[file] ? entries[file] : null;
      if(bytes){
        try{
          const type = img.type || "image/webp";
          const blob = new Blob([bytes], { type: type });
          await putImageRec({ id: img.id, blob: blob, type: type });
          stats.restoredImages++;
        }catch(err){
          stats.missingImages++;
        }
      }else{
        // No blob in the bundle: keep an existing blob in the store untouched.
        stats.missingImages++;
      }
      keptImages.push({
        id: img.id,
        name: img.name,
        w: img.w,
        h: img.h,
        size: img.size,
        type: img.type,
        ext: img.ext,
        file: ""
      });
    }
    req.images = keptImages;
    const keptFiles = [];
    for(let j = 0; j < req.attachments.length; j++){
      const att = req.attachments[j];
      const file = att.file || attachmentFileName(req, j, att);
      const bytes = entries && entries[file] ? entries[file] : null;
      if(bytes){
        try{
          const type = att.type || "application/octet-stream";
          const blob = new Blob([bytes], { type: type });
          await putFileRec({ id: att.id, blob: blob, type: type });
          stats.restoredFiles++;
        }catch(err){
          stats.missingFiles++;
        }
      }else{
        stats.missingFiles++;
      }
      keptFiles.push({
        id: att.id,
        name: att.name,
        size: att.size,
        type: att.type,
        ext: att.ext,
        file: ""
      });
    }
    req.attachments = keptFiles;
  }

  function buildSnapshot(raw, index, kind, fallbackProject){
    raw = raw || {};
    const item = JSON.parse(JSON.stringify(raw));
    const prefix = kind === "record" ? "rec_restored_" : "drf_restored_";
    item.id = String(raw.id || (prefix + Date.now() + "_" + index));
    item.kind = kind;
    item.ledgerId = typeof raw.ledgerId === "string" && raw.ledgerId ? raw.ledgerId : newLedgerId();
    item.project = snapshotProject(raw.project, fallbackProject);
    item.requests = (Array.isArray(raw.requests) ? raw.requests : []).map(function(req, reqIndex){
      return normalizeRequest(req, reqIndex);
    });
    item.savedAt = raw.savedAt || nowISO();
    item.name = raw.name || (item.project + " · " + formatClock(item.savedAt));
    item.requestCount = item.requests.length;
    item.imageCount = item.requests.reduce(function(sum, req){ return sum + req.images.length; }, 0);
    item.fileCount = item.requests.reduce(function(sum, req){
      return sum + (typeTemplate(req.type).attachments ? req.attachments.length : 0);
    }, 0);
    item.signature = requestsSignature(item.requests);
    item.complete = item.requests.every(function(req){ return requestStatus(req) === "ready"; });
    item.exported = Boolean(raw.exported);
    item.reason = raw.reason || "";
    item.markdown = raw.markdown || "";
    item.fileName = "";
    item.rootFolder = "";
    item.writeError = "";
    return item;
  }

  // Prepare snapshots (normalize) before writing anything.
  const restoredRecords = sourceRecords ? sourceRecords.map(function(raw, index){
    return buildSnapshot(raw, index, "record", project);
  }) : null;
  const restoredDrafts = sourceDrafts ? sourceDrafts.map(function(raw, index){
    return buildSnapshot(raw, index, "draft", project);
  }) : null;

  // 2) Write media for live requests and records/drafts.
  for(let i = 0; i < restored.length; i++){
    await restoreMedia(restored[i]);
    if(!isAutoValid(restored[i])) restored[i].confirmed = false;
  }
  if(restoredRecords){
    for(let i = 0; i < restoredRecords.length; i++){
      for(let j = 0; j < restoredRecords[i].requests.length; j++){
        await restoreMedia(restoredRecords[i].requests[j]);
        if(!isAutoValid(restoredRecords[i].requests[j])) restoredRecords[i].requests[j].confirmed = false;
      }
    }
  }
  if(restoredDrafts){
    for(let i = 0; i < restoredDrafts.length; i++){
      for(let j = 0; j < restoredDrafts[i].requests.length; j++){
        await restoreMedia(restoredDrafts[i].requests[j]);
        if(!isAutoValid(restoredDrafts[i].requests[j])) restoredDrafts[i].requests[j].confirmed = false;
      }
    }
  }

  // 3) Persist collections. Media stores are never cleared here (bug fix).
  if(restoredRecords){
    try{ await storeClear(DB.stores.records); }catch(err){}
    for(let i = 0; i < restoredRecords.length; i++){
      try{ await storePut(DB.stores.records, restoredRecords[i]); }catch(err){}
    }
  }
  if(restoredDrafts){
    try{ await storeClear(DB.stores.drafts); }catch(err){}
    for(let i = 0; i < restoredDrafts.length; i++){
      try{ await storePut(DB.stores.drafts, restoredDrafts[i]); }catch(err){}
    }
  }

  const language = data.language === "tr" ? "tr" : data.language === "en" ? "en" : null;
  const exportBehavior = ["last","instant","default"].indexOf(data.exportBehavior) >= 0 ? data.exportBehavior : "default";
  const agents = Array.isArray(data.agents) ? data.agents.map(normalizeAgent) : null;

  return {
    requests: restored,
    records: restoredRecords || [],
    drafts: restoredDrafts || [],
    project: project,
    ledgerId: typeof data.ledgerId === "string" && data.ledgerId ? data.ledgerId : newLedgerId(),
    agents: agents,
    language: language,
    exportBehavior: exportBehavior,
    lastExport: data.lastExport && typeof data.lastExport === "object" ? data.lastExport : null,
    stats: stats
  };
}

const api = {
  constants: {
    TYPES: TYPES,
    PRIORITIES: PRIORITIES,
    AGENT_ROLES: AGENT_ROLES,
    PLANNING_TESTS: PLANNING_TESTS,
    PLANNING_FULL_TEXT: PLANNING_FULL_TEXT,
    PLANNING_LIGHT_TEXT: PLANNING_LIGHT_TEXT,
    PLANNING_FULL_TEXT_EN: PLANNING_FULL_TEXT_EN,
    PLANNING_LIGHT_TEXT_EN: PLANNING_LIGHT_TEXT_EN,
    TYPE_TEMPLATES: TYPE_TEMPLATES,
    TRANSLATIONS_EN: TRANSLATIONS_EN,
    CHANGELOG: CHANGELOG,
    LIMITS: LIMITS,
    DB: DB
  },
  util: {
    nowISO: nowISO,
    pad2: pad2,
    formatYMD: formatYMD,
    formatStamp: formatStamp,
    formatTime: formatTime,
    formatClock: formatClock,
    formatDateTime: formatDateTime,
    mdCell: mdCell,
    mdLine: mdLine,
    utf8Bytes: utf8Bytes,
    extFromMime: extFromMime,
    extFromFileName: extFromFileName,
    safeFileBase: safeFileBase,
    formatBytes: formatBytes,
    imageFileName: imageFileName,
    attachmentFileName: attachmentFileName,
    backupMediaFileName: backupMediaFileName,
    normalizeDisplayPath: normalizeDisplayPath,
    newLedgerId: newLedgerId
  },
  i18n: {
    setLanguage: setLanguage,
    getLanguage: getLanguage,
    translate: translate,
    countLabel: countLabel,
    formatDateLong: formatDateLong,
    trLower: trLower
  },
  requests: {
    newId: nextId,
    create: makeNewRequest,
    normalize: normalizeRequest,
    serialize: serializeRequest,
    validate: isAutoValid,
    missing: missingFields,
    status: requestStatus,
    find: getReq,
    incomplete: incompleteRequests,
    signature: requestsSignature,
    duplicate: duplicateRequest,
    update: updateRequest,
    remove: removeRequest,
    move: moveRequest
  },
  storage: {
    init: init,
    close: close,
    loadState: loadState,
    saveState: saveState,
    getLastSaveError: getLastSaveError,
    loadTheme: loadTheme,
    saveTheme: saveTheme,
    getSetting: getSetting,
    putSetting: putSetting,
    deleteSetting: deleteSetting,
    putImage: putImage,
    getImage: getImage,
    deleteImage: deleteImage,
    putFile: putFile,
    getFile: getFile,
    deleteFile: deleteFile,
    clearAllMedia: clearAllMedia,
    listCollection: listCollection,
    putCollection: putCollection,
    deleteCollection: deleteCollection,
    clearCollection: clearCollection,
    addHistory: addHistory,
    listHistory: listHistory,
    clearHistory: clearHistory
  },
  media: {
    compress: compressImage,
    getImageBlob: getImageBlob,
    getFileBlob: getFileBlob
  },
  markdown: {
    build: buildMarkdown
  },
  zip: {
    create: createZip,
    parse: parseZip
  },
  backup: {
    build: buildBackup,
    buildJson: buildBackupJson,
    buildZip: buildBackupZip,
    parse: parseBackup,
    apply: applyBackup
  }
};

  if(typeof window !== "undefined") window.IstekCore = api;
  if(typeof globalThis !== "undefined") globalThis.IstekCore = api;
})();
