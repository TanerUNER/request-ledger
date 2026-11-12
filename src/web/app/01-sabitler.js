  /* ============================================================
     Sabitler
     ============================================================ */
  const STORAGE_KEY = "oz-istek-defteri-v1";
  /* Workspace registry and per-project ledgers (Phase 1).
     The legacy key remains the extension bridge key and the migration source. */
  const PROJECTS_KEY = "oz-projeler-v1";
  const PROJECT_LEDGER_PREFIX = "oz-istek-defteri-p-";
  const PROJECT_SCOPE_KEY = "oz-veri-kapsam-v1";
  const THEME_KEY = "gd-theme";
  const APP_VERSION = "1.10.3";
/* Static <title> from <head>; kept for crawlers and restored whenever no project is open. */
const SEO_TITLE = document.title;
  const CHANGELOG = [
    {
      version: "1.10.3",
      date: "2026-11-11",
      tr: {
        features: [],
        updates: [
          "Hazır işaretlenen ve ardından yeni bir istek eklenen istekler artık kaybolmuyor; bellek yaşadığı sürece uygulama tek doğruluk kaynağıdır.",
          "Her proje defteri artık tek yönlü artan bir revizyon taşır; eski bir kayıt veya eski eklenti anlık görüntüsü daha yeni veriyi ezemez.",
          "Eklenti sürümü uygulamadan farklıysa tek seferlik, engellemeyen bir 'Eklenti sürümü eski — güncelleyin.' bildirimi gösterilir."
        ],
        fixes: [
          "Sunucu modu açılışındaki projectRegistry ReferenceError düzeltildi; açılış artık atomiktir ve yalnızca tamamlanınca disk modu etkinleşir.",
          "Sekme seçici ve ikinci pencereden öğe+görüntü alma akışındaki RL_APP_TABS_RESULT aktarımı düzeltildi.",
          "dock.js yalnızca yüklenmiş eklenti iframe'ine hedef kaynakla, henüz yüklenmemiş pencerelere doğrulanan '*' ile mesaj gönderir."
        ]
      },
      en: {
        features: [],
        updates: [
          "A request marked Ready no longer disappears when another request is created next; memory is the single authority while the app is alive.",
          "Each project ledger now carries a monotonic revision; an older save or a stale companion snapshot can no longer overwrite newer data.",
          "When the extension build differs from the app, one non-blocking 'Extension build is outdated — update it.' notice is shown."
        ],
        fixes: [
          "Fixed the projectRegistry ReferenceError in server-disk bootstrap; boot is atomic and enables disk mode only after full success.",
          "Fixed the missing RL_APP_TABS_RESULT relay in the tab chooser and the cross-window element+screenshot flow.",
          "dock.js now posts with the extension origin only to loaded panel iframes, and with a validated '*' to not-yet-loaded windows."
        ]
      }
    },
    {
      version: "1.10.1",
      date: "2026-11-11",
      tr: {
        features: [],
        updates: [
          "Eklenti, tarayıcı yeniden başlatıldığında hiçbir şey göstermeden önce uygulamanın çalıştığını doğrular; önceki oturumdan kalan bağlantı durumu artık arayüzü açmaz."
        ],
        fixes: [
          "Uygulama kapalıyken tarayıcı yeniden başlatıldığında eklentinin sayfalarda görünmesine yol açan eski varlık kaydı düzeltildi.",
          "Varlık kaydı artık zaman damgası taşır; 12 saniyeden eski değerler yok sayılır."
        ]
      },
      en: {
        features: [],
        updates: [
          "After a browser restart the extension verifies the app before showing anything; a connection state from the previous session no longer mounts the UI."
        ],
        fixes: [
          "Fixed stale presence making the companion appear on pages after a browser restart with the app closed.",
          "Presence records now carry a timestamp; values older than 12 seconds are ignored."
        ]
      }
    },
    {
      version: "1.10.0",
      date: "2026-11-10",
      tr: {
        features: [
          "Proje silme artık diskteki projects/ klasörünü de kaldırır; isteğe bağlı olarak proje deleted-projects/ altına ZIP olarak arşivlenir ve geri yüklenebilir.",
          "Tam yedekler sunucudaki backups/ klasörüne yazılır; yedek listesi ve silinen projeler listesi yedekleme ekranından yönetilir.",
          "Proje verilerini temizle artık tam sıfırlama yapar: projeler ve silinen proje arşivleri silinir, backups/ korunur.",
          "Rail'de durdur düğmesi yerine durum noktası ve port gösterilir; port değişikliği sessizce yeni sunucuya geçer.",
          "Dil ve tema sunucudaki rl-config.json dosyasında saklanır; port değişiminde ve yeniden başlatmada korunur."
        ],
        updates: [
          "Köprü arayüzünde 'Uzantı' yerine 'Eklenti' kullanılır.",
          "Bağlantı metinleri sadeleşti; sunucu yalnızca start.cmd ile yeniden başlatılabilir."
        ],
        fixes: [
          "Port değişikliği yeni sunucu /__rl/status yanıtı verene kadar tamamlanmış sayılmaz; başarısız olursa eski sunucu çalışmaya devam eder.",
          "Çıkan sunucu, yeni sürecin yazdığı .rl-server.lock dosyasını silmez."
        ]
      },
      en: {
        features: [
          "Deleting a project now removes its projects/ folder from disk; it can optionally be archived as a ZIP under deleted-projects/ and restored later.",
          "Full backups are written to the server's backups/ folder; the backup list and the deleted-project list are managed from the backup screen.",
          "Clear project data is now a full reset: projects and deleted-project archives are removed while backups/ is kept.",
          "The rail shows a status dot and the port instead of a stop button; a port change moves to the new server silently.",
          "Language and theme are stored in rl-config.json on the server and survive a port change and a restart."
        ],
        updates: [
          "The bridge UI now says \"Eklenti\" instead of \"Uzantı\" in Turkish.",
          "Connection copy is simpler; the server can only be restarted with start.cmd."
        ],
        fixes: [
          "A port change only completes after the new server answers /__rl/status; on failure the old server keeps running.",
          "The exiting server no longer deletes the .rl-server.lock written by the replacement."
        ]
      }
    },
    {
      version: "1.9.2",
      date: "2026-11-09",
      tr: {
        features: [
          "Panelde yapılan düzenlemeler ve Hazır onayı 1 saniye içinde uygulamaya yansır; uygulamadaki düzenlemeler de panelde yeniden yükleme olmadan görünür.",
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
      version: "1.9.1",
      date: "2026-11-09",
      tr: {
        features: [
          "Yeni logo ve uzantı açıcısı: sıcak terracotta kare, üç çizgi ve adaçayı yeşili onay damgası; uzantı düğmesi aynı işareti taşır.",
          "Uygulamadan ekran görüntüsü ve öğe + ekran görüntüsü: sekmeyi seç, kırp ve görseli isteğe ekle; sayfa ve konum otomatik dolar.",
          "Çalışma alanı ve projeler: her projenin ayrı defteri, görselleri, dosyaları, Kayıtları, Taslakları ve arşivi var.",
          "Yedek v4 tüm projeleri ve proje başına medyayı taşır; eski v3 yedekleri tek projeye geri yüklenir.",
          "Uzantı köprüsü proje kimliğine göre çalışır; file://, localhost ve 127.0.0.1 sayfaları bağlanabilir.",
          "İlk kurulum ekranı tek HTML dosyası ile yerel sunucuyu karşılaştırır; port, durdurma ve port değişikliği uyarısı Ayarlar’dan yönetilir."
        ],
        updates: [
          "Öğe seçici, ekran görüntüsü ve öğe + ekran görüntüsü aynı sekme seçiciyi, ilerleme durumunu ve iptal akışını kullanır.",
          "start.cmd son portu hatırlar; dolu portta boş porta geçer ve kullanıcıyı uyarır. stop.cmd sunucuyu kapatır.",
          "Arayüz metinleri temizlendi: yinelenen başlıklar, İngilizce arayüzde kalan Türkçe metinler ve yedek açıklamaları sadeleştirildi."
        ],
        fixes: [
          "Köprü artık file:// ve 127.0.0.1 kaynaklarını kabul eder; dosya sayfalarında mesaj kimliği null olarak doğrulanır.",
          "Eşit zaman damgalı isteklerde yerel kayıt korunur; canlı eşitleme veri kaybetmez.",
          "Flyout işaretçi oku panelin kenarıyla hizalandı ve ayrıntı panelinin yüksekliği sabit kaldı."
        ]
      },
      en: {
        features: [
          "New logo and extension opener: a warm terracotta tile, three ruled lines and a sage check stamp; the extension button carries the same mark.",
          "Screenshot and element + screenshot from the app: choose a tab, crop, and attach the image to the request; page and location fill themselves.",
          "Workspace and projects: every project keeps its own ledger, images, files, Records, Drafts and archive.",
          "Backup v4 carries every project and its per-project media; older v3 backups restore into a single project.",
          "The extension bridge follows project ids; file://, localhost and 127.0.0.1 pages can connect.",
          "First-run setup compares the single HTML file with the local server; the port, stop action and port-change warning live in Settings."
        ],
        updates: [
          "Element picker, screenshot and element + screenshot share one tab chooser, progress state and cancel path.",
          "start.cmd remembers the last port, falls back to a free port when it is busy and warns the user; stop.cmd shuts the server down.",
          "Interface copy cleanup: duplicate headings, Turkish strings left in the English interface and backup descriptions were simplified."
        ],
        fixes: [
          "The bridge accepts file:// and 127.0.0.1 origins; file pages validate the opaque null message identity.",
          "Equal-timestamp requests keep the local record, so live sync no longer drops a just-written field.",
          "The flyout pointer arrow lines up with the panel edge and the detail panel keeps a stable height."
        ]
      }
    },
    {
      version: "1.9.0",
      date: "2026-11-09",
      tr: {
        features: [
          "Proje çalışma alanı: tek kayıt defteri, proje başına ayrı istekler, dışa aktarma hedefi ve arşiv.",
          "Proje başına görseller, dosya ekleri, Kayıtlar, Taslaklar ve dışa aktarma geçmişi; yedek v4 tüm projeleri ve medyayı taşır.",
          "Uzantıyla canlı bağlantı: proje kimliği eşleşen istekler iki yönlü eşitlenir; öğe seçici uygulamadan başka bir sekmede çalışır.",
          "İlk kurulum ekranı: tek HTML dosyası veya yerel sunucu seçimi, uzantı durumu ve yetenek karşılaştırması.",
          "Yerel sunucu modu: start.cmd/stop.cmd, boş port seçimi, otomatik açılış; sunucu canlı sekme varken kapanmaz, sekme kapanınca en az 5 dakika bekler."
        ],
        updates: [
          "Uzantı köprüsü artık her localhost portunda çalışır; 127.0.0.1 izin listesinin dışında kalır.",
          "Metin temizliği: yinelenen başlıklar, İngilizce arayüzde kalan Türkçe metinler ve yedek açıklamaları sadeleştirildi.",
          "Yedek sürümü v4 oldu; eski v3 yedekleri tek projeye geri yüklenmeye devam eder."
        ],
        fixes: [
          "Flyout işaretçi oku panelin kenarıyla hizalandı.",
          "Proje değiştirme ve kaydedilmemiş değişiklik onayı proje kapsamına alındı."
        ]
      },
      en: {
        features: [
          "Project workspace: one registry with separate requests, export target and archive per project.",
          "Per-project images, attachments, Records, Drafts and export history; backup v4 carries every project and its media.",
          "Live extension bridge: requests with matching project ids sync both ways; the element picker runs on another tab from the app.",
          "First-run onboarding: single HTML file or local server, extension status and a capability comparison.",
          "Local server mode: start.cmd/stop.cmd, free-port selection, auto-open; the server stays up while a tab is live and waits at least 5 minutes after it closes."
        ],
        updates: [
          "The extension bridge now works on every localhost port; 127.0.0.1 stays outside the allowlist.",
          "Copy cleanup: duplicate headings, Turkish text left in the English interface and backup descriptions were simplified.",
          "Backup moved to v4; older v3 backups still restore into a single project."
        ],
        fixes: [
          "The flyout pointer arrow lines up with the panel edge.",
          "Project switching and the unsaved-changes confirmation are project-scoped."
        ]
      }
    },
    {
      version: "1.8.0",
      date: "2026-11-08",
      tr: {
        features: [
          "Canlı bağlantı: uygulama açıkken istekler ve proje adı uzantıyla iki yönlü eşitleniyor.",
          "Uygulamada proje oluşturma ve Ayarlar > Sistem'den proje adını değiştirme.",
          "Öğe seçici artık uygulamadan da çalışıyor: hangi sekmeden seçileceğini sorar, sayfa ve konumu doldurur."
        ],
        updates: [
          "Bağlantı yalnızca yerel dosya veya localhost üzerinde kurulur ve uygulama sekmesi açıkken sürer; görseller ve dosyalar canlı eşitlenmez."
        ],
        fixes: [
          "Flyout'un işaretçi oku artık panelin kenarıyla hizalı.",
          "Bir istek yeniden açıldığında ayrıntı panelinin yüksekliği değişmiyor.",
          "Başlık marquee'si ve hazır oranı halkası düzeltildi."
        ]
      },
      en: {
        features: [
          "Live bridge: while the app is open, requests and the project name sync both ways with the extension.",
          "Project creation in the app and project rename in Settings > System.",
          "The element picker now runs from the app too: it asks which tab to use and fills the page and location."
        ],
        updates: [
          "The bridge works only when the app runs from a local file or localhost, and only while the app tab is open; images and files do not sync live."
        ],
        fixes: [
          "The flyout's pointer arrow now lines up with the panel edge.",
          "Reopening a request no longer changes the detail panel height.",
          "Polished the title marquee and the ready-ratio ring."
        ]
      }
    },
    {
      version: "1.7.0",
      date: "2026-11-08",
      tr: {
        features: [
          "Hemen Aktar artık mevcut dışa aktarma seçimlerini kaydediyor; sonraki aktarımlar aynı seçimlerle çalışıyor.",
          "Hakkında bölümüne destek bağlantısı eklendi."
        ],
        updates: [
          "Destek widget'ı kaldırıldı: uygulama artık hiçbir üçüncü taraf betiği yüklemiyor.",
          "Yedek geri yüklemede medya ve kayıtlar doğrulama tamamlanmadan silinmiyor.",
          "Yedek dosyalarına sürüm ve boyut sınırı getirildi."
        ],
        fixes: [
          "Satırları aynı tür içinde yukarı/aşağı taşıma artık görünür şekilde çalışıyor.",
          "İngilizce arayüzde Türkçe kalan kaydetme bildirimi düzeltildi.",
          "Yedek indirme artık klasör seçimi sormadan doğrudan indiriyor.",
          "Dışa aktarma da klasör seçimi sormadan doğrudan indiriyor; klasör yalnızca istersen seçiliyor."
        ]
      },
      en: {
        features: [
          "Instant export now saves the current export choices; later exports reuse them.",
          "Added a support link to the About section."
        ],
        updates: [
          "Removed the support widget: the app no longer loads any third-party script.",
          "Restore no longer clears media or records before validation completes.",
          "Added version and size limits to backup files."
        ],
        fixes: [
          "Moving rows up/down within the same type now works visibly.",
          "Fixed a Turkish save notification left over in the English interface.",
          "Backups download directly instead of prompting for a folder.",
          "Exports download directly too; a folder is only used when you choose one."
        ]
      }
    },
    {
      version: "1.6.1",
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
  const DB_NAME = "oz-istek-defteri";
  const DB_VERSION = 5;
  const IMG_STORE = "images";
  const FILE_STORE = "files";
  const SETTINGS_STORE = "settings";
  const HISTORY_STORE = "history";
  const RECORDS_STORE = "records";
  const DRAFTS_STORE = "drafts";
  const MAX_IMAGES = 8;
  const MAX_ATTACHMENTS = 3;
  const MAX_INPUT_MB = 15;
  const MAX_FILE_MB = 10;
  const MAX_DIM = 1600;
  const JPEG_QUALITY = 0.82;

  const TYPES = [
    { id:"feature",  label:"Yeni Özellik",     cls:"tag--feature",  ph:"Yeni özellik ne yapmalı? Hangi sorunu çözüyor?", desc:"Yeni bir işlev, ekran veya akış ekle." },
    { id:"update",   label:"Güncelleme",       cls:"tag--update",   ph:"Neyin değişmesini istiyorsun? Ekranda nasıl görünmeli?", desc:"Mevcut bir alanı, akışı veya davranışı değiştir." },
    { id:"remove",   label:"Kaldırma",         cls:"tag--remove",   ph:"Ne kaldırılmalı ve neden?", desc:"Bir öğeyi, alanı veya akışı kaldır." },
    { id:"design",   label:"Tasarım / İçerik", cls:"tag--design",   ph:"Hangi metin, renk, boşluk veya bileşen değişmeli?", desc:"Tasarım, metin, görsel veya örnek dosya paylaş." },
    { id:"question", label:"Soru",             cls:"tag--question", ph:"Sorunuzu net yazın; gerekirse ekran görüntüsü ekleyin.", desc:"Proje veya uygulama hakkında soru sor." },
    { id:"bug",      label:"Hata",             cls:"tag--bug",      ph:"Hata nasıl ortaya çıkıyor? Beklenen ve gerçekleşen davranış ne?", desc:"Hata, console kaydı veya beklenmeyen davranış bildir." }
  ];
  const TYPE_MAP = {};
  TYPES.forEach(function(t){ TYPE_MAP[t.id] = t; });

  const PRIORITIES = [
    { id:"low",      label:"Düşük",  cls:"prio--low" },
    { id:"normal",   label:"Normal", cls:"prio--normal" },
    { id:"high",     label:"Yüksek", cls:"prio--high" },
    { id:"critical", label:"Kritik", cls:"prio--critical" }
  ];
  const PRIORITY_MAP = {};
  PRIORITIES.forEach(function(p){ PRIORITY_MAP[p.id] = p; });

  const AGENT_ROLES = [
    { id:"team_leader", label:"Team Leader",  cls:"agent-role--team_leader" },
    { id:"backend",     label:"Backend",      cls:"agent-role--backend" },
    { id:"frontend",    label:"Frontend",     cls:"agent-role--frontend" },
    { id:"qa",          label:"QA Tester",    cls:"agent-role--qa" },
    { id:"security",    label:"App. Security",cls:"agent-role--security" },
    { id:"explorer",    label:"Explorer",     cls:"agent-role--explorer" },
    { id:"general",     label:"General",      cls:"agent-role--general" }
  ];
  const AGENT_ROLE_MAP = {};
  AGENT_ROLES.forEach(function(role, index){ AGENT_ROLE_MAP[role.id] = role; role.order = index; });
  const AGENT_ROLE_ORDER = {};
  AGENT_ROLES.forEach(function(role){ AGENT_ROLE_ORDER[role.id] = role.order; });

  const PLANNING_TESTS = [
    { id:"full",  label:"Tam koşu",  note:"Yapılması gereken bütün testler gerçekleştirilebilir.", noteEn:"All required tests can be performed." },
    { id:"light", label:"Hafif koşu", note:"Testler sonrası hata dönüyorsa fix işlemlerinden sonra sadece ilgili dosyalarda ve hata alınan bölümlerde test işlemi yapılacak. Bütün fixler gerçekleştirildikten sonra bir kez tam koşu yapılır. Tam koşu sonucunda yine hata alınırsa döngü devam eder. (Kodlama > Test > Hata Yok > Full Test > Hata > İlgili hata için fix > İlgili hata için Test > Hata yok > Full Test)", noteEn:"If errors are found after testing, run tests only on the affected files and areas after fixes. Once all fixes are complete, perform one full run. If the full run still fails, repeat the loop. (Coding > Test > No Error > Full Test > Error > Fix the error > Test the error > No Error > Full Test)" },
    { id:"none",  label:"Test yok",  note:"Sadece Backend ve Frontend Dev test yapabilirler. Bu istekler için QA Tester ajanı çağırılmayacak.", noteEn:"Only Backend and Frontend Dev can test. The QA Tester agent is not called for these requests." }
  ];
  const PLANNING_FULL_TEXT = "Seçilen ajanlar (varsa) verilen isteklerin yerine getirilmesi için kullanılabilir. Yapılan işlemler sonrası için yapılacak testler Tam koşu yapılabilir. Yapılan testlerde hata alındığında ilgili ajanlar fix işlemlerini yerine getirebilir sonrasında tekrar tam koşu testi yapılabilir. Testlerin tekrarında herhangi bir kısıtlama yoktur.";
  const PLANNING_LIGHT_TEXT = "Seçilen ajanlar (varsa) verilen isteklerin yerine getirilmesi için kullanılabilir. Yapılacak işlemler sonrası için yapılacak testler hafifletilmiş olarak yapılacak. Yapılan testlerde hata alındığında ilgili ajanlar fix işlemlerini yerine getirdikten sonra sadece hata alınan bölümlerde test işlemleri yapılsın. Hata alınmadığı durumda en son bir kez olmak kaydı ile tam koşu testi yapılabilir.";
  const PLANNING_FULL_TEXT_EN = "Selected agents, if any, can be used to fulfill the requested items. Full test runs can be performed after the work is completed. If errors are found, the relevant agents can apply fixes and then run the full test suite again. There is no limit on test repetitions.";
  const PLANNING_LIGHT_TEXT_EN = "Selected agents, if any, can be used to fulfill the requested items. Tests after the work will be run in a lightweight mode. If errors are found, the relevant agents apply fixes and then test only the affected areas. If no errors remain, one final full test run can be performed.";

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
    "Proje": "Project",
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
    "Yeni Proje": "New Project",
    "Örn. Projem": "e.g. My project",
    "Oluştur": "Create",
    "Proje adı zorunludur.": "Project name is required.",
    "Proje oluşturuldu.": "Project created.",
    "Proje adı girildiğinde istek menüleri açılır. Dışa aktarma, yedek ve kayıt adlarında kullanılır.": "Entering a project name reveals the request menus. It is used in export, backup and record names.",
    "Projeler": "Projects",
    "Yeni proje": "New project",
    "Proje seç": "Select project",
    "Proje değiştir": "Switch project",
    "Projeleri aç": "Open projects",
    "Projede ara": "Search projects",
    "Proje ara": "Search project",
    "Proje bulunamadı.": "No project found.",
    "Proje ayarları": "Project settings",
    "Proje Ayarları": "Project Settings",
    "Oluşturma": "Created",
    "Güncelleme": "Updated",
    "Dışa aktarım hedefi": "Export target",
    "Klasör": "Folder",
    "Dışa aktarım hedefini seç": "Select export target",
    "Dışa aktarım hedefini kaldır": "Remove export target",
    "Projeyi aç": "Open project",
    "Şu an açık": "Currently open",
    "Projeyi sil": "Delete project",
    "Son proje silinemez.": "The last project cannot be deleted.",
    "Proje silinsin mi?": "Delete project?",
    "Proje adı güncellendi.": "Project name updated.",
    "Proje silindi.": "Project deleted.",
    "Arşivi gizle": "Hide archive",
    "Arşivi göster": "Show archive",
    "Arşivi aç": "Open archive",
    "Arşivi kapat": "Close archive",
    "Proje ayarları açılamadı.": "Project settings could not be opened.",
    "Proje verilerini temizle": "Clear project data",
    "Bu projedeki tüm talepler, görseller, dosyalar, Dışa Aktarılanlar, Kayıtlar ve Taslaklar silinecek. Diğer projeler etkilenmez. Bu işlem geri alınamaz. Önce yedek almak istemediğine emin misin?": "All requests, images, files, Exported, Records and Drafts in this project will be deleted. Other projects are not affected. This action cannot be undone. Are you sure you do not want to back up first?",
    "Proje verileri temizlendi. Diğer projeler korundu.": "Project data cleared. Other projects were kept.",
    "Proje listesi güncellenemedi.": "The project list could not be updated.",
    "Önce bir proje aç.": "Open a project first.",
    "Bir proje seçerek devam et. Her projenin istekleri ve dışa aktarma dizini ayrı tutulur.": "Choose a project to continue. Each project keeps its own requests and export directory.",
    "Henüz proje yok. Yeni bir proje oluştur.": "No projects yet. Create a new project.",
    "Kaydedilmemiş değişiklikler": "Unsaved changes",
    "Bu projede açıldığından beri değişiklik var. Başka bir projeye geçmeden önce kaydetmek ister misin?": "This project has changed since it was opened. Do you want to save before switching?",
    "Kaydet ve geç": "Save and switch",
    "Kaydetmeden geç": "Switch without saving",
    "Açık": "Open",
    "Dışa aktarma, yedek ve kayıt adlarında kullanılır.": "Used in export, backup and record names.",
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
    "Görsel yükleniyor…": "Loading image…",
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
    "Sayfa ve konum, eklentinın öğe seçicisiyle doldurulur.": "Page and location are filled in by the extension's element picker.",
    "Proje arşivi": "Project archive",
    "Yedeği geri yükle": "Restore backup",
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
    "Tüm projeler + talepler + Kayıtlar + görseller + dosya ekleri. Başka bir tarayıcıya taşımak için en güvenli yol.": "All projects + requests + Records + images + attachments. The safest way to move to another browser.",
    "Talep ve Kayıt metinleri. Görseller ve dosya ekleri bu dosyaya dahil edilmez.": "Request and Record texts. Images and attachments are not included.",
    "Tüm projelerin talep ve Kayıt metinleri. Görseller ve dosya ekleri bu dosyaya dahil edilmez.": "Request and Record texts for every project. Images and attachments are not included.",
    ".zip veya .json dosyası seç. Mevcut talepler ve Kayıtlar yedekteki verilerle değiştirilir.": "Choose a .zip or .json file. Current requests and Records will be replaced with the backup data.",
    ".zip veya .json dosyası seç. Tüm projeler yedekteki verilerle değiştirilir.": "Choose a .zip or .json file. All projects will be replaced with the backup data.",
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
    "Kaydedildi.": "Saved.",
    "Seçimler kaydedildi. Sonraki dışa aktarımlar bu seçimlerle çalışacak.": "Choices saved. Later exports will use these selections.",
    "Bu türde taşınacak başka satır yok.": "There is no other row of this type to move.",
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
    "Bu dosya bir Request Ledger yedeği değil.": "This file is not a Request Ledger backup.",
    "Yedek daha yeni bir sürümle oluşturulmuş.": "This backup was created by a newer version.",
    "Yedekte çok fazla talep var.": "The backup contains too many requests.",
    "Yedekte çok fazla kayıt var.": "The backup contains too many records.",
    "Yedekte çok fazla taslak var.": "The backup contains too many drafts.",
    "Yedekte çok fazla ajan var.": "The backup contains too many agents.",
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

    "Eklenti bağlı": "Extension connected",
    "Eklenti farklı projede": "Extension is on another project",
    "Canlı bağlantı": "Live connection",
    "Metinler eklentiyla anlık eşitlenir. Görseller ve dosya ekleri yalnızca ZIP yedeğiyle taşınır.": "Text syncs with the extension live. Images and attachments travel only with a backup ZIP.",
    "İki defter bulundu": "Two ledgers found",
    "Uygulama ve eklenti farklı defterler içeriyor. Hangisi kullanılsın? Uygulamadaki defter varsayılandır.": "The app and the extension hold different ledgers. Which one should be used? The app ledger is the default.",
    "Uygulamadaki defter": "Use app ledger",
    "Eklentidaki defter": "Use extension ledger",
    "Bağlantı": "Connection",
    "Sonra karar ver": "Decide later",
    "Defter seçimi kaydedildi.": "Ledger choice saved.",
    "Öğe seç": "Pick element",
    "Ekran görüntüsü": "Screenshot",
    "Öğe + görüntü": "Element + screenshot",
    "Seçiliyor…": "Selecting…",
    "Ekran görüntüsü alınıyor…": "Capturing screenshot…",
    "Öğe ve görüntü alınıyor…": "Picking element and screenshot…",
    "Sayfa ve konumu eklentidan seç.": "Pick the page and location from the extension.",
    "Sekmenin ekran görüntüsünü al ve isteğe ekle.": "Capture the tab and attach it to the request.",
    "Bir öğe seç ve görüntüsünü isteğe ekle.": "Pick an element and attach its screenshot.",
    "Eklenti bağlı değil — kurulum adımlarını görmek için tıkla.": "The extension is not connected — click for install steps.",
    "Bir satıra en fazla 8 görsel eklenebilir.": "A row can hold at most 8 images.",
    "Bu sayfa eklenti köprüsüne izin vermiyor.": "This page does not allow the extension bridge.",
    "Hangi sekmeden seçilsin?": "Which tab should be picked from?",
    "Hangi sekmeden görüntü alınsın?": "Which tab should be captured?",
    "Hangi sekmeden öğe ve görüntü alınsın?": "Which tab should provide the element and screenshot?",
    "Uygulama sekmesi listede görünmez.": "The app tab is not listed.",
    "Sekmeler yükleniyor…": "Loading tabs…",
    "Bu sekmeden öğe seç": "Pick an element from this tab",
    "Seçilebilecek sekme bulunamadı. Belgelemek istediğin sayfayı açıp yeniden dene.": "No eligible tab found. Open the page you want to document and try again.",
    "Seçim bekleniyor…": "Selecting…",
    "Görüntü bekleniyor…": "Waiting for screenshot…",
    "Öğe ve görüntü bekleniyor…": "Waiting for element and screenshot…",
    "Seçtiğin sekmede bir öğeye tıkla. 30 saniye içinde sonuç gelmezse seçim iptal edilir.": "Click an element in the chosen tab. The selection is cancelled if no result arrives within 30 seconds.",
    "Seçtiğin sekmede kırpılacak alanı sürükle. 30 saniye içinde sonuç gelmezse işlem iptal edilir.": "Drag over the area to crop in the chosen tab. The operation is cancelled if no result arrives within 30 seconds.",
    "Seçtiğin sekmede bir öğeye tıkla; görüntüsü de alınacak. 30 saniye içinde sonuç gelmezse işlem iptal edilir.": "Click an element in the chosen tab; its screenshot is captured too. The operation is cancelled if no result arrives within 30 seconds.",
    "Seçim tamamlanınca bu pencereye dönülür.": "You return to this window when the selection finishes.",
    "Seçimi iptal et": "Cancel selection",
    "Görüntü almayı iptal et": "Cancel capture",
    "İşlemi iptal et": "Cancel operation",
    "Sekme listesi alınamadı. Eklentinın açık ve bağlı olduğundan emin ol.": "The tab list could not be loaded. Make sure the extension is enabled and connected.",
    "Seçim zaman aşımına uğradı. Eklenti penceresini kapatıp yeniden dene.": "The selection timed out. Close the extension window and try again.",
    "Görüntü alma zaman aşımına uğradı. Eklenti penceresini kapatıp yeniden dene.": "The capture timed out. Close the extension window and try again.",
    "İşlem zaman aşımına uğradı. Eklenti penceresini kapatıp yeniden dene.": "The operation timed out. Close the extension window and try again.",
    "Öğe seçimi zaman aşımına uğradı.": "Element selection timed out.",
    "Görüntü alma zaman aşımına uğradı.": "Screenshot capture timed out.",
    "Öğe ve görüntü zaman aşımına uğradı.": "Element and screenshot timed out.",
    "Hazır onayını geri alarak düzenleyebilirsin.": "Undo the ready confirmation to edit this row.",
    "Öğe seçimi iptal edildi.": "Element selection cancelled.",
    "Görüntü alımı iptal edildi.": "Screenshot capture cancelled.",
    "Öğe ve görüntü alımı iptal edildi.": "Element and screenshot cancelled.",
    "Seçim sonucu geçersiz. Yeniden dene.": "The selection result is invalid. Try again.",
    "Görüntü sonucu geçersiz. Yeniden dene.": "The screenshot result is invalid. Try again.",
    "Seçim yapılan istek bulunamadı.": "The request being filled could not be found.",
    "Sayfa ve konum öğe seçiminden dolduruldu.": "Page and location were filled from the element picker.",
    "Sayfa, konum ve görüntü öğeden alındı.": "Page, location and screenshot were taken from the element.",
    "Sayfa ve konum dolduruldu; görüntü alınamadı.": "Page and location were filled, but the screenshot could not be captured.",
    "Sayfa ve konum dolduruldu; görüntü eklenemedi.": "Page and location were filled, but the screenshot could not be attached.",
    "Ekran görüntüsü isteğe eklendi.": "Screenshot attached to the request.",
    "Ekran görüntüsü eklenemedi.": "The screenshot could not be attached.",
    "Eklenti bağlantısı kesildi. Öğe seçilemedi.": "The extension connection dropped. The element could not be picked.",
    "Eklenti bağlantısı kesildi. Görüntü alınamadı.": "The extension connection dropped. The screenshot could not be captured.",
    "Eklenti bağlantısı kesildi. Öğe ve görüntü alınamadı.": "The extension connection dropped. The element and screenshot could not be captured.",
    "İçe aktarılan proje": "Imported project",
    "Eklenti bağlantısı kesildi. Kurulum adımlarını kontrol et.": "The extension connection dropped. Check the install steps.",
    "Öğe seçici": "Element picker",
    "Eklenti": "Extension",
    "Öğe seçici için eklenti gerekli": "The element picker needs the extension",
    "Canlı bağlantı kurulu değil. Öğe seçiciyi kullanmak için Request Ledger eklentisını kur ve bu sayfayı yenile.": "The live link is not connected. Install the Request Ledger extension and reload this page to use the element picker.",
    "1. Paketi indir": "1. Download the package",
    "Sürüm sayfasından request-ledger-extension-*.zip dosyasını indir ve bir klasöre çıkar.": "Download request-ledger-extension-*.zip from the release page and extract it into a folder.",
    "2. Geliştirici modunu aç": "2. Turn on Developer mode",
    "chrome://extensions adresini aç ve sağ üstten Geliştirici modu’nu etkinleştir.": "Open chrome://extensions and enable Developer mode in the top-right corner.",
    "3. Paketi yükle": "3. Load the package",
    "Paketlenmemiş öğe yükle ile çıkardığın extension klasörünü seç.": "Choose Load unpacked and select the extension folder you extracted.",
    "4. Sayfayı yenile": "4. Reload the page",
    "Bu sekmeyi yenile. Bağlantı kurulunca “Öğe seç” yeniden etkinleşir.": "Reload this tab. “Pick element” becomes available again once the link is connected.",
    "Eklenti yokken defter, satırlar ve dışa aktarma çalışmaya devam eder; yalnızca canlı eşitleme ve öğe seçici kullanılamaz.": "Without the extension, the ledger, rows and export keep working; only live sync and the element picker are unavailable.",
    "Sürüm sayfası": "Release page",
    "Request Ledger’a hoş geldin": "Welcome to Request Ledger",
    "Kurulum": "Setup",
    "Uygulamayı nasıl kullanmak istediğini seç. Seçim yalnızca bu tarayıcıda saklanır; sonradan Ayarlar’dan yeniden açabilirsin.": "Choose how you want to use the app. The choice is stored in this browser only; you can reopen this screen from Settings.",
    "Kullanım biçimi": "How to use the app",
    "Tek HTML dosyası": "Single HTML file",
    "Dosyayı çift tıklayarak aç; kurulum ve sunucu gerekmez.": "Double-click the file to open it; no install and no server.",
    "Yerel sunucu (port)": "Local server (port)",
    "start.cmd sunucuyu arka planda açar ve tarayıcıyı hazırlar.": "start.cmd starts the server in the background and opens the browser.",
    "Kopyala": "Copy",
    "Sunucuyu aç": "Open server",
    "Tarayıcı eklentisı yardımcısını etkinleştir": "Enable the browser extension companion",
    "Aranıyor…": "Checking…",
    "Nasıl kurulur?": "How to install?",
    "Yetenek karşılaştırması": "Capability comparison",
    "Yetenek": "Capability",
    "HTML dosyası": "HTML file",
    "Yerel sunucu": "Local server",
    "Çevrimdışı": "Offline",
    "Doğrudan klasöre aktarım": "Direct folder export",
    "Eklenti köprüsü": "Extension bridge",
    "Otomatik başlatma": "Auto-start",
    "Taşınabilir dosya": "Portable file",
    "Konsol penceresi yok": "No console window",
    "Tek dosyayı kopyalayıp çevrimdışı açabilirsin. Yerel sunucu başlatamaz; eklenti köprüsü ve öğe seçici, eklentinın dosya URL’lerine erişim izni olduğunda çalışır.": "You can copy the single file and open it offline. It cannot start a local server; the extension bridge and element picker work when the extension is allowed to access file URLs.",
    "Uygulama yerel bir adresten açılır; köprü ve öğe seçici çalışır. Node.js gerekir ve sunucu uygulama kapanınca durur.": "The app opens from a local address; the bridge and element picker work. Node.js is required and the server stops when the app closes.",
    "Baktığın sayfadan bağlam toplar ve metni canlı eşitler. Görseller ve dosya ekleri yalnızca ZIP yedeğiyle taşınır.": "It captures context from the page you are looking at and syncs text live. Images and attachments still travel only with a backup ZIP.",
    "Başla": "Start",
    "Kullanım biçimini ve eklenti durumunu yeniden gör.": "Review the usage mode and the extension status.",
    "Kurulumu aç": "Open setup",
    "Tek dosya modundasın. Bu sayfa yerel sunucu başlatamaz; sunucu modu için aşağıdaki komutu çalıştır.": "You are in single-file mode. This page cannot start a local server; run the command below for server mode.",
    "Yerel sunucu modundasın. Sekme açıkken sunucu kapanmaz; sekme kapandıktan sonra en az 5 dakika bekler.": "You are in local server mode. The server stays up while the tab is open and waits at least 5 minutes after it closes.",
    "Yerel sunucu çalışmıyor. Sunucu modu için start.cmd çalıştır.": "The local server is not running. Run start.cmd for server mode.",
    "HTML dosyası yerel sunucu başlatamaz; komut yalnızca sunucu modu içindir.": "An HTML file cannot start a local server; the command is only for server mode.",
    "Yerel sunucu çalışıyor": "Local server is running",
    "Yerel sunucu kapalı": "Local server stopped",
    "Eklenti yardımcısı kapalı.": "Extension companion is off.",
    "Bu sayfa köprüye izin vermiyor; eklentiyı sunucu modunda dene.": "This page does not allow the bridge; try the extension in server mode.",
    "Bağlı": "Connected",
    "Bulunamadı": "Not detected",
    "Eklenti aranıyor…": "Looking for the extension…",
    "Eklenti köprüsü için sunucu modu gerekir.": "The extension bridge needs server mode.",
    "Yerel sunucu bulunamadı.": "Local server not found.",
    "Dosyadan başlatıldı": "started from file",
    "Sunucu çalışmıyor.": "Server is not running.",
    "Dosya modunda sunucu yok. Sunucu için start.cmd çalıştır.": "There is no server in file mode. Run start.cmd for the server.",
    "0 = otomatik boş port.": "0 = automatic free port.",
    "Portu uygula": "Apply port",
    "Port 0 ile 65535 arasında bir tam sayı olmalı.": "Port must be a whole number between 0 and 65535.",
    "Bu port zaten kullanımda.": "That port is already in use.",
    "Port kaydedildi.": "Port saved.",
    "Sunucu yeniden başlatılıyor.": "Restarting the server.",
    "Sunucu yeniden başladı; bağlanılıyor": "The server is back; connecting",
    "Sunucu yeniden başlatılamadı.": "The server could not be restarted.",
    "Sunucu yeniden başlamadı. start.cmd çalıştır.": "The server did not come back. Run start.cmd.",
    "Sunucuyu yeniden başlat": "Restart server",
    "Port": "Port",
    "Komut kopyalandı.": "Command copied.",
    "Komut kopyalanamadı.": "Could not copy the command.",
    "Eklenti yardımcısı": "Extension companion",
    "Eklenti sürümü eski — eklentiyi güncelleyin.": "Extension build is outdated — update it.",
    "Yedek bölümünden tam ZIP yedeği indir. Yedekler proje adı, dil, ajanlar, defter kimliği ve talepleri içerir; görseller ve dosyalar da ZIP içinde taşınır. Tema yedeğe dahil değildir.": "Download a full ZIP backup from the Backup section. Backups include the project name, language, agents, ledger ID and requests; images and files travel inside the ZIP. Theme is not included.",
    "Tüm projeler + talepler + Kayıtlar + görseller + dosya ekleri. Sunucu modunda backups/ klasörüne de yazılır.": "All projects + requests + Records + images + attachments. In server mode it is also written to the backups/ folder.",
    ".zip dosyası seç. Tüm projeler yedekteki verilerle değiştirilir.": "Choose a .zip file. Every project is replaced by the backup data.",
    "Sunucudaki yedekler": "Server backups",
    "En yeni önce": "Newest first",
    "Silinen projeler": "Deleted projects",
    "Proje başına ZIP": "ZIP per project",
    "Sunucu modunda veriler projects/ klasöründe tutulur; yedekler backups/ altında saklanır. Tarayıcı verisi temizlenirse yalnızca yerel önbellek kaybolur.": "In server mode data lives in the projects/ folder and backups are kept under backups/. Clearing browser data only removes the local cache.",
    "Hedef klasör seçiliyse indirilen yedek de oraya kaydedilir; aksi halde tarayıcı indirilenler klasörüne iner.": "When a target folder is selected the downloaded backup is saved there; otherwise it goes to the browser downloads folder.",
    "0 = otomatik boş port. Port değişikliği sunucuyu sessizce taşır.": "0 = automatic free port. A port change moves the server silently.",
    "Port değiştirilemedi; sunucu çalışmaya devam ediyor.": "The port could not be changed; the server is still running.",
    "Sunucu bu sayfayı yerel adresten sunuyor. Sunucu, son sekme kapandıktan sonra kendiliğinden durur.": "The server is hosting this page locally. It stops on its own after the last tab closes.",
    "Sunucu kapalı. Tarayıcı bir süreç başlatamaz; yeniden açmak için start.cmd çalıştır.": "The server is off. A browser cannot start a process; run start.cmd to open it again.",
    "Sunucu çalışmaya başlayınca bu sayfayı yenile.": "Reload this page once the server is running.",
    "Yedek sunucuya yazılamadı; indirilen dosyayı sakla.": "The backup could not be written to the server; keep the downloaded file.",
    "Yedek oluşturulamadı; sıfırlama iptal edildi.": "The backup could not be created; the reset was cancelled.",
    "Tüm proje verileri sıfırlandı. Yedekler korundu.": "All project data was reset. Backups were kept.",
    "Sıfırlama tamamlanamadı; hiçbir şey silinmedi.": "The reset did not complete; nothing was deleted.",
    "Henüz sunucuda yedek yok. Tam yedek indirdiğinde burada da saklanır.": "No server backup yet. A full backup is stored here when you download one.",
    "Silinen proje yedeği yok.": "No deleted-project backups.",
    "Geri yükle": "Restore",
    "Silinen proje": "Deleted project",
    "Proje geri yüklensin mi?": "Restore this project?",
    "Bu proje arşivden projects/ klasörüne geri yüklenecek ve proje listesine eklenecek:": "This project will be restored from the archive into the projects/ folder and added to the project list:",
    "Proje geri yüklenemedi.": "The project could not be restored.",
    "Aynı klasör adı dolu olduğu için proje şu adla geri yüklendi:": "The folder name was taken, so the project was restored as:",
    "Proje geri yüklendi.": "Project restored.",
    "Yedek silinsin mi?": "Delete this backup?",
    "Bu silinen proje arşivi kalıcı olarak silinecek. Bu işlem geri alınamaz.": "This deleted-project archive will be removed permanently. This cannot be undone.",
    "Arşiv silinemedi.": "The archive could not be deleted.",
    "Arşiv silindi.": "Archive deleted.",
    "Yedek okunamadı.": "The backup could not be read.",
    "Proje diskten silinemedi; hiçbir şey değiştirilmedi.": "The project could not be deleted from disk; nothing was changed.",
    "Proje silindi ve yedeği saklandı.": "Project deleted and its backup kept.",
    "Proje silinsin mi?": "Delete this project?",
    "bu projedeki tüm talepler, görseller, kayıtlar, taslaklar ve dışa aktarılanlar silinecek. Bu işlem geri alınamaz. Silinen projeler bölümünden geri yüklenebilmesi için bir yedek saklamak ister misin?": "all requests, images, records, drafts and exports in this project will be deleted. This cannot be undone. Do you want to keep a backup so it can be restored from the deleted projects section?",
    "Yedekle ve sil": "Back up and delete",
    "Yedeksiz sil": "Delete without backup",
    "Tüm proje verileri sıfırlansın mı?": "Reset all project data?",
    "Bütün projeler, silinen proje yedekleri ve tarayıcı önbelleği silinecek. Sunucudaki backups/ klasörü korunur. Önce tam bir yedek alman önerilir; geri yükleme yalnızca bu yedeklerden yapılabilir.": "Every project, deleted-project backup and browser cache will be deleted. The server's backups/ folder is kept. Taking a full backup first is recommended; restoring is only possible from those backups.",
    "Sıfırla": "Reset",
    "Yedek al ve sıfırla": "Back up and reset",
    "Yedeksiz sıfırla": "Reset without a backup",

    /* Toast copy used by the row, archive, backup and file-writing paths. */
    "Önceki kayıtlar okunamadı. Yeni bir defterle devam ediliyor.": "The previous records could not be read. Continuing with a new ledger.",
    "Kayıt yapılamadı. Tarayıcı depolamasını kontrol et veya yedek al.": "The ledger could not be saved. Check browser storage or take a backup.",
    "Hedef klasöre kaydedilemedi; dosya indiriliyor.": "Could not save to the project folder; downloading the file instead.",
    "Görsel eklemek için tarayıcı depolaması kullanılamıyor.": "Browser storage is unavailable for adding images.",
    "Yalnızca görsel dosyaları eklenebilir.": "Only image files can be added.",
    "Dosya eki yalnızca Tasarım türünde kullanılabilir.": "Attachments are only available for the Design type.",
    "Dosya eklemek için tarayıcı depolaması kullanılamıyor.": "Browser storage is unavailable for adding files.",
    "Kayıt tarayıcıda güncellendi.": "The record was updated in the browser.",
    "Kaydedilecek istek yok.": "There are no requests to save.",
    "Defterde temizlenecek istek yok.": "There are no requests to clear in the ledger.",
    "Bu kayıtta yüklenecek istek yok.": "This record has no requests to load.",
    "Bu satır henüz hazır değil.": "This row is not ready yet.",
    "Açılacak bir satır yok.": "There is no row to open.",
    "Görsel bulunamadı. Yedekten geri yüklemeyi deneyebilirsin.": "The image was not found. Try restoring from a backup.",
    "Tüm talepler hazır. Dışa aktarabilirsin.": "All requests are ready. You can export.",
    "Önce en az bir istek ekle.": "Add at least one request first.",
    "Dışa aktarma başarısız oldu.": "Export failed.",
    "Markdown oluşturulamadı.": "Markdown could not be created.",
    "Proje oluşturulamadı. Tarayıcı depolamasını kontrol et.": "The project could not be created. Check browser storage.",
    "Görsel depolaması kullanılamıyor.": "Image storage is unavailable.",
    "Dosya depolaması kullanılamıyor.": "File storage is unavailable.",
    "Önce bir istek satırı açın.": "Open a request row first.",
    "Görseli bir satırın görsel alanına bırak.": "Drop the image on a row's image area.",
    "Görseller ve dosyalar için tarayıcı depolaması kullanılamıyor. Metinler yine de kaydedilir.": "Browser storage is unavailable for images and files. Text is still saved."
  };

  const TYPE_TEMPLATES = {
    update:  { page:true,  location:true,  console:false, attachments:false, sampleWebsite:false, link:true  },
    feature: { page:false, location:false, console:false, attachments:false, sampleWebsite:false, link:false },
    question:{ page:true,  location:true,  console:false, attachments:false, sampleWebsite:false, link:true  },
    bug:     { page:true,  location:true,  console:true,  attachments:false, sampleWebsite:false, link:true  },
    remove:  { page:true,  location:true,  console:false, attachments:false, sampleWebsite:false, link:true  },
    design:  { page:true,  location:true,  console:false, attachments:true,  sampleWebsite:true,  link:true  }
  };

  const ICON_CHECK = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>';
  const ICON_ALERT = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 9v5M12 17.5v.5"/><path d="M10.3 3.9L2.6 18a2 2 0 0 0 1.8 3h15.2a2 2 0 0 0 1.8-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>';
  const ICON_PENDING = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6L9 17l-5-5"/></svg>';
