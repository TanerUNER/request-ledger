/*
  Domain constants — single source of truth.

  Ported verbatim from the previous monolithic core (v1.9.1). This module is now the
  source of truth; scripts/build-core.cjs emits the classic extension/src/core.js from it
  and tests/parity/core.parity.mjs proves the generated file keeps the old behaviour.
*/

export const DB = {
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

export const LIMITS = {
  MAX_IMAGES: 8,
  MAX_ATTACHMENTS: 3,
  MAX_INPUT_MB: 15,
  MAX_FILE_MB: 10,
  MAX_DIM: 1600,
  JPEG_QUALITY: 0.82,
};

export const TYPES = [
  { id: "feature", label: "Yeni Özellik", cls: "tag--feature", ph: "Yeni özellik ne yapmalı? Hangi sorunu çözüyor?", desc: "Yeni bir işlev, ekran veya akış ekle." },
  { id: "update", label: "Güncelleme", cls: "tag--update", ph: "Neyin değişmesini istiyorsun? Ekranda nasıl görünmeli?", desc: "Mevcut bir alanı, akışı veya davranışı değiştir." },
  { id: "remove", label: "Kaldırma", cls: "tag--remove", ph: "Ne kaldırılmalı ve neden?", desc: "Bir öğeyi, alanı veya akışı kaldır." },
  { id: "design", label: "Tasarım / İçerik", cls: "tag--design", ph: "Hangi metin, renk, boşluk veya bileşen değişmeli?", desc: "Tasarım, metin, görsel veya örnek dosya paylaş." },
  { id: "question", label: "Soru", cls: "tag--question", ph: "Sorunuzu net yazın; gerekirse ekran görüntüsü ekleyin.", desc: "Proje veya uygulama hakkında soru sor." },
  { id: "bug", label: "Hata", cls: "tag--bug", ph: "Hata nasıl ortaya çıkıyor? Beklenen ve gerçekleşen davranış ne?", desc: "Hata, console kaydı veya beklenmeyen davranış bildir." },
];

export const TYPE_MAP = {};
TYPES.forEach((type) => {
  TYPE_MAP[type.id] = type;
});

export const PRIORITIES = [
  { id: "low", label: "Düşük", cls: "prio--low" },
  { id: "normal", label: "Normal", cls: "prio--normal" },
  { id: "high", label: "Yüksek", cls: "prio--high" },
  { id: "critical", label: "Kritik", cls: "prio--critical" },
];

export const PRIORITY_MAP = {};
PRIORITIES.forEach((priority) => {
  PRIORITY_MAP[priority.id] = priority;
});

export const AGENT_ROLES = [
  { id: "team_leader", label: "Team Leader", cls: "agent-role--team_leader" },
  { id: "backend", label: "Backend", cls: "agent-role--backend" },
  { id: "frontend", label: "Frontend", cls: "agent-role--frontend" },
  { id: "qa", label: "QA Tester", cls: "agent-role--qa" },
  { id: "security", label: "App. Security", cls: "agent-role--security" },
  { id: "explorer", label: "Explorer", cls: "agent-role--explorer" },
  { id: "general", label: "General", cls: "agent-role--general" },
];

export const AGENT_ROLE_MAP = {};
export const AGENT_ROLE_ORDER = {};
AGENT_ROLES.forEach((role, index) => {
  AGENT_ROLE_MAP[role.id] = role;
  role.order = index;
});
AGENT_ROLES.forEach((role) => {
  AGENT_ROLE_ORDER[role.id] = role.order;
});

export const PLANNING_TESTS = [
  { id: "full", label: "Tam koşu", note: "Yapılması gereken bütün testler gerçekleştirilebilir.", noteEn: "All required tests can be performed." },
  {
    id: "light",
    label: "Hafif koşu",
    note: "Testler sonrası hata dönüyorsa fix işlemlerinden sonra sadece ilgili dosyalarda ve hata alınan bölümlerde test işlemi yapılacak. Bütün fixler gerçekleştirildikten sonra bir kez tam koşu yapılır. Tam koşu sonucunda yine hata alınırsa döngü devam eder. (Kodlama > Test > Hata Yok > Full Test > Hata > İlgili hata için fix > İlgili hata için Test > Hata yok > Full Test)",
    noteEn: "If errors are found after testing, run tests only on the affected files and areas after fixes. Once all fixes are complete, perform one full run. If the full run still fails, repeat the loop. (Coding > Test > No Error > Full Test > Error > Fix the error > Test the error > No Error > Full Test)",
  },
  { id: "none", label: "Test yok", note: "Sadece Backend ve Frontend Dev test yapabilirler. Bu istekler için QA Tester ajanı çağırılmayacak.", noteEn: "Only Backend and Frontend Dev can test. The QA Tester agent is not called for these requests." },
];

export const PLANNING_FULL_TEXT = "Seçilen ajanlar (varsa) verilen isteklerin yerine getirilmesi için kullanılabilir. Yapılan işlemler sonrası için yapılacak testler Tam koşu yapılabilir. Yapılan testlerde hata alındığında ilgili ajanlar fix işlemlerini yerine getirebilir sonrasında tekrar tam koşu testi yapılabilir. Testlerin tekrarında herhangi bir kısıtlama yoktur.";
export const PLANNING_LIGHT_TEXT = "Seçilen ajanlar (varsa) verilen isteklerin yerine getirilmesi için kullanılabilir. Yapılacak işlemler sonrası için yapılacak testler hafifletilmiş olarak yapılacak. Yapılan testlerde hata alındığında ilgili ajanlar fix işlemlerini yerine getirdikten sonra sadece hata alınan bölümlerde test işlemleri yapılsın. Hata alınmadığı durumda en son bir kez olmak kaydı ile tam koşu testi yapılabilir.";
export const PLANNING_FULL_TEXT_EN = "Selected agents, if any, can be used to fulfill the requested items. Full test runs can be performed after the work is completed. If errors are found, the relevant agents can apply fixes and then run the full test suite again. There is no limit on test repetitions.";
export const PLANNING_LIGHT_TEXT_EN = "Selected agents, if any, can be used to fulfill the requested items. Tests after the work will be run in a lightweight mode. If errors are found, the relevant agents apply fixes and then test only the affected areas. If no errors remain, one final full test run can be performed.";

export const TYPE_TEMPLATES = {
  update: { page: true, location: true, console: false, attachments: false, sampleWebsite: false, link: true },
  feature: { page: false, location: false, console: false, attachments: false, sampleWebsite: false, link: false },
  question: { page: true, location: true, console: false, attachments: false, sampleWebsite: false, link: true },
  bug: { page: true, location: true, console: true, attachments: false, sampleWebsite: false, link: true },
  remove: { page: true, location: true, console: false, attachments: false, sampleWebsite: false, link: true },
  design: { page: true, location: true, console: false, attachments: true, sampleWebsite: true, link: true },
};

/* Release history shown by the panel's Update History section. */

export const CHANGELOG = [
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
