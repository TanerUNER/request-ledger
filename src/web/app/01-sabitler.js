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
          "HazÄ±r iÅŸaretlenen ve ardÄ±ndan yeni bir istek eklenen istekler artÄ±k kaybolmuyor; bellek yaÅŸadÄ±ÄŸÄ± sÃ¼rece uygulama tek doÄŸruluk kaynaÄŸÄ±dÄ±r.",
          "Her proje defteri artÄ±k tek yÃ¶nlÃ¼ artan bir revizyon taÅŸÄ±r; eski bir kayÄ±t veya eski eklenti anlÄ±k gÃ¶rÃ¼ntÃ¼sÃ¼ daha yeni veriyi ezemez.",
          "Eklenti sÃ¼rÃ¼mÃ¼ uygulamadan farklÄ±ysa tek seferlik, engellemeyen bir 'Eklenti sÃ¼rÃ¼mÃ¼ eski â€” gÃ¼ncelleyin.' bildirimi gÃ¶sterilir."
        ],
        fixes: [
          "Sunucu modu aÃ§Ä±lÄ±ÅŸÄ±ndaki projectRegistry ReferenceError dÃ¼zeltildi; aÃ§Ä±lÄ±ÅŸ artÄ±k atomiktir ve yalnÄ±zca tamamlanÄ±nca disk modu etkinleÅŸir.",
          "Sekme seÃ§ici ve ikinci pencereden Ã¶ÄŸe+gÃ¶rÃ¼ntÃ¼ alma akÄ±ÅŸÄ±ndaki RL_APP_TABS_RESULT aktarÄ±mÄ± dÃ¼zeltildi.",
          "dock.js yalnÄ±zca yÃ¼klenmiÅŸ eklenti iframe'ine hedef kaynakla, henÃ¼z yÃ¼klenmemiÅŸ pencerelere doÄŸrulanan '*' ile mesaj gÃ¶nderir."
        ]
      },
      en: {
        features: [],
        updates: [
          "A request marked Ready no longer disappears when another request is created next; memory is the single authority while the app is alive.",
          "Each project ledger now carries a monotonic revision; an older save or a stale companion snapshot can no longer overwrite newer data.",
          "When the extension build differs from the app, one non-blocking 'Extension build is outdated â€” update it.' notice is shown."
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
          "Eklenti, tarayÄ±cÄ± yeniden baÅŸlatÄ±ldÄ±ÄŸÄ±nda hiÃ§bir ÅŸey gÃ¶stermeden Ã¶nce uygulamanÄ±n Ã§alÄ±ÅŸtÄ±ÄŸÄ±nÄ± doÄŸrular; Ã¶nceki oturumdan kalan baÄŸlantÄ± durumu artÄ±k arayÃ¼zÃ¼ aÃ§maz."
        ],
        fixes: [
          "Uygulama kapalÄ±yken tarayÄ±cÄ± yeniden baÅŸlatÄ±ldÄ±ÄŸÄ±nda eklentinin sayfalarda gÃ¶rÃ¼nmesine yol aÃ§an eski varlÄ±k kaydÄ± dÃ¼zeltildi.",
          "VarlÄ±k kaydÄ± artÄ±k zaman damgasÄ± taÅŸÄ±r; 12 saniyeden eski deÄŸerler yok sayÄ±lÄ±r."
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
          "Proje silme artÄ±k diskteki projects/ klasÃ¶rÃ¼nÃ¼ de kaldÄ±rÄ±r; isteÄŸe baÄŸlÄ± olarak proje deleted-projects/ altÄ±na ZIP olarak arÅŸivlenir ve geri yÃ¼klenebilir.",
          "Tam yedekler sunucudaki backups/ klasÃ¶rÃ¼ne yazÄ±lÄ±r; yedek listesi ve silinen projeler listesi yedekleme ekranÄ±ndan yÃ¶netilir.",
          "Proje verilerini temizle artÄ±k tam sÄ±fÄ±rlama yapar: projeler ve silinen proje arÅŸivleri silinir, backups/ korunur.",
          "Rail'de durdur dÃ¼ÄŸmesi yerine durum noktasÄ± ve port gÃ¶sterilir; port deÄŸiÅŸikliÄŸi sessizce yeni sunucuya geÃ§er.",
          "Dil ve tema sunucudaki rl-config.json dosyasÄ±nda saklanÄ±r; port deÄŸiÅŸiminde ve yeniden baÅŸlatmada korunur."
        ],
        updates: [
          "KÃ¶prÃ¼ arayÃ¼zÃ¼nde 'UzantÄ±' yerine 'Eklenti' kullanÄ±lÄ±r.",
          "BaÄŸlantÄ± metinleri sadeleÅŸti; sunucu yalnÄ±zca start.cmd ile yeniden baÅŸlatÄ±labilir."
        ],
        fixes: [
          "Port deÄŸiÅŸikliÄŸi yeni sunucu /__rl/status yanÄ±tÄ± verene kadar tamamlanmÄ±ÅŸ sayÄ±lmaz; baÅŸarÄ±sÄ±z olursa eski sunucu Ã§alÄ±ÅŸmaya devam eder.",
          "Ã‡Ä±kan sunucu, yeni sÃ¼recin yazdÄ±ÄŸÄ± .rl-server.lock dosyasÄ±nÄ± silmez."
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
          "The bridge UI now says \"Eklenti\" instead of \"UzantÄ±\" in Turkish.",
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
          "Panelde yapÄ±lan dÃ¼zenlemeler ve HazÄ±r onayÄ± 1 saniye iÃ§inde uygulamaya yansÄ±r; uygulamadaki dÃ¼zenlemeler de panelde yeniden yÃ¼kleme olmadan gÃ¶rÃ¼nÃ¼r.",
          "Yerel sunucu uygulama sekmesi aÃ§Ä±kken kapanmaz; arka planda bekleyen sekme sunucuyu dÃ¼ÅŸÃ¼rmez, F5 aynÄ± portta devam eder."
        ],
        updates: [
          "Projeler ve Ä°stekler bÃ¶lÃ¼mÃ¼ tek sekme ÅŸeridi ve tek iÃ§erik alanÄ±na toparlandÄ±; yinelenen ayÄ±rÄ±cÄ± ve sekme gÃ¶rÃ¼nÃ¼mÃ¼ kaldÄ±rÄ±ldÄ±.",
          "Ä°stenen port aynÄ± uygulamaya aitse yeniden kullanÄ±lÄ±r; farklÄ± bir sÃ¼reÃ§teyse boÅŸ porta geÃ§ilir ve kullanÄ±cÄ± uyarÄ±lÄ±r."
        ],
        fixes: [
          "KÃ¶prÃ¼ proje benimsemesi artÄ±k panelde bir bÃ¶lÃ¼mÃ¼ kendiliÄŸinden aÃ§maz; kullanÄ±cÄ±nÄ±n son aÃ§Ä±k bÃ¶lÃ¼mÃ¼ korunur.",
          "HazÄ±r onayÄ± yeni bir revizyon damgasÄ± taÅŸÄ±r; eÅŸitleme sÄ±rasÄ±nda onay durumu dÃ¼ÅŸmez.",
          "Proje kimliÄŸi kÃ¶prÃ¼de ayrÄ±ÅŸtÄ±rÄ±ldÄ±: farklÄ± projeler iki defter uyarÄ±sÄ± Ã¼retmez, yeniden yÃ¼kleme son projeyi ve kendi defterini aÃ§ar, eski â€œOrtak Zeminâ€ kaydÄ± â€œÄ°Ã§e aktarÄ±lan projeâ€ olarak yeniden adlandÄ±rÄ±lÄ±r."
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
          "Project identity is bridge-scoped: different projects never trigger a global ledger conflict, reload reopens the last project and its own ledger, and the old â€œOrtak Zeminâ€ record is renamed â€œImported projectâ€."
        ]
      }
    },
    {
      version: "1.9.1",
      date: "2026-11-09",
      tr: {
        features: [
          "Yeni logo ve uzantÄ± aÃ§Ä±cÄ±sÄ±: sÄ±cak terracotta kare, Ã¼Ã§ Ã§izgi ve adaÃ§ayÄ± yeÅŸili onay damgasÄ±; uzantÄ± dÃ¼ÄŸmesi aynÄ± iÅŸareti taÅŸÄ±r.",
          "Uygulamadan ekran gÃ¶rÃ¼ntÃ¼sÃ¼ ve Ã¶ÄŸe + ekran gÃ¶rÃ¼ntÃ¼sÃ¼: sekmeyi seÃ§, kÄ±rp ve gÃ¶rseli isteÄŸe ekle; sayfa ve konum otomatik dolar.",
          "Ã‡alÄ±ÅŸma alanÄ± ve projeler: her projenin ayrÄ± defteri, gÃ¶rselleri, dosyalarÄ±, KayÄ±tlarÄ±, TaslaklarÄ± ve arÅŸivi var.",
          "Yedek v4 tÃ¼m projeleri ve proje baÅŸÄ±na medyayÄ± taÅŸÄ±r; eski v3 yedekleri tek projeye geri yÃ¼klenir.",
          "UzantÄ± kÃ¶prÃ¼sÃ¼ proje kimliÄŸine gÃ¶re Ã§alÄ±ÅŸÄ±r; file://, localhost ve 127.0.0.1 sayfalarÄ± baÄŸlanabilir.",
          "Ä°lk kurulum ekranÄ± tek HTML dosyasÄ± ile yerel sunucuyu karÅŸÄ±laÅŸtÄ±rÄ±r; port, durdurma ve port deÄŸiÅŸikliÄŸi uyarÄ±sÄ± Ayarlarâ€™dan yÃ¶netilir."
        ],
        updates: [
          "Ã–ÄŸe seÃ§ici, ekran gÃ¶rÃ¼ntÃ¼sÃ¼ ve Ã¶ÄŸe + ekran gÃ¶rÃ¼ntÃ¼sÃ¼ aynÄ± sekme seÃ§iciyi, ilerleme durumunu ve iptal akÄ±ÅŸÄ±nÄ± kullanÄ±r.",
          "start.cmd son portu hatÄ±rlar; dolu portta boÅŸ porta geÃ§er ve kullanÄ±cÄ±yÄ± uyarÄ±r. stop.cmd sunucuyu kapatÄ±r.",
          "ArayÃ¼z metinleri temizlendi: yinelenen baÅŸlÄ±klar, Ä°ngilizce arayÃ¼zde kalan TÃ¼rkÃ§e metinler ve yedek aÃ§Ä±klamalarÄ± sadeleÅŸtirildi."
        ],
        fixes: [
          "KÃ¶prÃ¼ artÄ±k file:// ve 127.0.0.1 kaynaklarÄ±nÄ± kabul eder; dosya sayfalarÄ±nda mesaj kimliÄŸi null olarak doÄŸrulanÄ±r.",
          "EÅŸit zaman damgalÄ± isteklerde yerel kayÄ±t korunur; canlÄ± eÅŸitleme veri kaybetmez.",
          "Flyout iÅŸaretÃ§i oku panelin kenarÄ±yla hizalandÄ± ve ayrÄ±ntÄ± panelinin yÃ¼ksekliÄŸi sabit kaldÄ±."
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
          "Proje Ã§alÄ±ÅŸma alanÄ±: tek kayÄ±t defteri, proje baÅŸÄ±na ayrÄ± istekler, dÄ±ÅŸa aktarma hedefi ve arÅŸiv.",
          "Proje baÅŸÄ±na gÃ¶rseller, dosya ekleri, KayÄ±tlar, Taslaklar ve dÄ±ÅŸa aktarma geÃ§miÅŸi; yedek v4 tÃ¼m projeleri ve medyayÄ± taÅŸÄ±r.",
          "UzantÄ±yla canlÄ± baÄŸlantÄ±: proje kimliÄŸi eÅŸleÅŸen istekler iki yÃ¶nlÃ¼ eÅŸitlenir; Ã¶ÄŸe seÃ§ici uygulamadan baÅŸka bir sekmede Ã§alÄ±ÅŸÄ±r.",
          "Ä°lk kurulum ekranÄ±: tek HTML dosyasÄ± veya yerel sunucu seÃ§imi, uzantÄ± durumu ve yetenek karÅŸÄ±laÅŸtÄ±rmasÄ±.",
          "Yerel sunucu modu: start.cmd/stop.cmd, boÅŸ port seÃ§imi, otomatik aÃ§Ä±lÄ±ÅŸ; sunucu canlÄ± sekme varken kapanmaz, sekme kapanÄ±nca en az 5 dakika bekler."
        ],
        updates: [
          "UzantÄ± kÃ¶prÃ¼sÃ¼ artÄ±k her localhost portunda Ã§alÄ±ÅŸÄ±r; 127.0.0.1 izin listesinin dÄ±ÅŸÄ±nda kalÄ±r.",
          "Metin temizliÄŸi: yinelenen baÅŸlÄ±klar, Ä°ngilizce arayÃ¼zde kalan TÃ¼rkÃ§e metinler ve yedek aÃ§Ä±klamalarÄ± sadeleÅŸtirildi.",
          "Yedek sÃ¼rÃ¼mÃ¼ v4 oldu; eski v3 yedekleri tek projeye geri yÃ¼klenmeye devam eder."
        ],
        fixes: [
          "Flyout iÅŸaretÃ§i oku panelin kenarÄ±yla hizalandÄ±.",
          "Proje deÄŸiÅŸtirme ve kaydedilmemiÅŸ deÄŸiÅŸiklik onayÄ± proje kapsamÄ±na alÄ±ndÄ±."
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
          "CanlÄ± baÄŸlantÄ±: uygulama aÃ§Ä±kken istekler ve proje adÄ± uzantÄ±yla iki yÃ¶nlÃ¼ eÅŸitleniyor.",
          "Uygulamada proje oluÅŸturma ve Ayarlar > Sistem'den proje adÄ±nÄ± deÄŸiÅŸtirme.",
          "Ã–ÄŸe seÃ§ici artÄ±k uygulamadan da Ã§alÄ±ÅŸÄ±yor: hangi sekmeden seÃ§ileceÄŸini sorar, sayfa ve konumu doldurur."
        ],
        updates: [
          "BaÄŸlantÄ± yalnÄ±zca yerel dosya veya localhost Ã¼zerinde kurulur ve uygulama sekmesi aÃ§Ä±kken sÃ¼rer; gÃ¶rseller ve dosyalar canlÄ± eÅŸitlenmez."
        ],
        fixes: [
          "Flyout'un iÅŸaretÃ§i oku artÄ±k panelin kenarÄ±yla hizalÄ±.",
          "Bir istek yeniden aÃ§Ä±ldÄ±ÄŸÄ±nda ayrÄ±ntÄ± panelinin yÃ¼ksekliÄŸi deÄŸiÅŸmiyor.",
          "BaÅŸlÄ±k marquee'si ve hazÄ±r oranÄ± halkasÄ± dÃ¼zeltildi."
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
          "Hemen Aktar artÄ±k mevcut dÄ±ÅŸa aktarma seÃ§imlerini kaydediyor; sonraki aktarÄ±mlar aynÄ± seÃ§imlerle Ã§alÄ±ÅŸÄ±yor.",
          "HakkÄ±nda bÃ¶lÃ¼mÃ¼ne destek baÄŸlantÄ±sÄ± eklendi."
        ],
        updates: [
          "Destek widget'Ä± kaldÄ±rÄ±ldÄ±: uygulama artÄ±k hiÃ§bir Ã¼Ã§Ã¼ncÃ¼ taraf betiÄŸi yÃ¼klemiyor.",
          "Yedek geri yÃ¼klemede medya ve kayÄ±tlar doÄŸrulama tamamlanmadan silinmiyor.",
          "Yedek dosyalarÄ±na sÃ¼rÃ¼m ve boyut sÄ±nÄ±rÄ± getirildi."
        ],
        fixes: [
          "SatÄ±rlarÄ± aynÄ± tÃ¼r iÃ§inde yukarÄ±/aÅŸaÄŸÄ± taÅŸÄ±ma artÄ±k gÃ¶rÃ¼nÃ¼r ÅŸekilde Ã§alÄ±ÅŸÄ±yor.",
          "Ä°ngilizce arayÃ¼zde TÃ¼rkÃ§e kalan kaydetme bildirimi dÃ¼zeltildi.",
          "Yedek indirme artÄ±k klasÃ¶r seÃ§imi sormadan doÄŸrudan indiriyor.",
          "DÄ±ÅŸa aktarma da klasÃ¶r seÃ§imi sormadan doÄŸrudan indiriyor; klasÃ¶r yalnÄ±zca istersen seÃ§iliyor."
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
          "390 px ve altÄ±nda Ã¼st bardaki taÅŸma giderildi; kÃ¶k dizin grubu ve proje adÄ± mobilde gizleniyor."
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
          "VarsayÄ±lan uygulama dili Ä°ngilizce yapÄ±ldÄ±."
        ],
        updates: [
          "DÄ±ÅŸa aktarÄ±m dizini seÃ§ilmediÄŸinde ana baÅŸlÄ±k ve tarayÄ±cÄ± sekmesi iÃ§in varsayÄ±lan proje adÄ± â€œProjemâ€ oldu.",
          "Dizin seÃ§ildiÄŸinde proje adÄ± yine seÃ§ilen klasÃ¶rÃ¼n adÄ±ndan alÄ±nÄ±yor.",
          "Ä°ngilizce ana aÃ§Ä±klama cÃ¼mlesi dil bilgisi aÃ§Ä±sÄ±ndan dÃ¼zenlendi."
        ],
        fixes: []
      },
      en: {
        features: [
          "The default application language is now English."
        ],
        updates: [
          "When no export directory is selected, the default project name is â€œMy Projectâ€ in the heading and browser tab.",
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
          "Sol panel menÃ¼leri Ayarlar, Yedek ve YardÄ±m olarak sadeleÅŸtirildi.",
          "Dil deÄŸiÅŸiminde logo TR iÃ§in ID, EN iÃ§in RL oluyor."
        ],
        updates: [
          "Sol paneldeki tarih bilgisi kaldÄ±rÄ±ldÄ±.",
          "DÄ±ÅŸa aktarÄ±m dizini seÃ§ilmediÄŸinde Ã¼st barda â€œDÄ±ÅŸa aktarÄ±m dizini seÃ§ilmediâ€ yazÄ±yor.",
          "Temiz Defter butonunun yÃ¼ksekliÄŸi Yeni Ä°stek butonuyla eÅŸitlendi.",
          "Sol panelde seÃ§ili menÃ¼ vurgusu kaldÄ±rÄ±ldÄ±."
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
          "The top bar now shows â€œExport directory not selectedâ€ when no export directory is chosen.",
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
          "Tema ve Ayarlar ikonlarÄ± arasÄ±na TR/EN dil geÃ§iÅŸ butonu eklendi.",
          "Tarih ana sayfadan sol panelin en altÄ±na taÅŸÄ±ndÄ±.",
          "DÄ±ÅŸa aktarÄ±m dizini seÃ§ilmediÄŸinde proje noktasÄ± kÄ±rmÄ±zÄ± gÃ¶steriliyor."
        ],
        updates: [
          "Toaster bildirimleri Ã¼st headerda, tema deÄŸiÅŸtirme ikonunun soluna taÅŸÄ±ndÄ±.",
          "Ayarlarâ€™daki KÃ¶k Dizini seÃ§me ikonundan yeÅŸil renk kaldÄ±rÄ±ldÄ±.",
          "Sol paneldeki Yerel yazÄ±sÄ± ve yeÅŸil noktasÄ± kaldÄ±rÄ±ldÄ±."
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
          "Ana sayfadaki KÃ¶k Dizini kutusunda bulunan yeÅŸil klasÃ¶r ikonunun yeÅŸil rengi kaldÄ±rÄ±ldÄ±.",
          "AynÄ± nÃ¶tr ikon gÃ¶rÃ¼nÃ¼mÃ¼ karanlÄ±k temada da uygulandÄ±."
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
          "GÃ¼ncelleme GeÃ§miÅŸi kayÄ±tlarÄ± HakkÄ±nda altÄ±nda alt alta link olarak gÃ¶steriliyor.",
          "GÃ¼ncelleme notu modalÄ±, Ayarlar > HakkÄ±nda aÃ§Ä±kken Ã¼zerine aÃ§Ä±lÄ±yor; kapanÄ±nca Ayarlar geri geliyor.",
          "Ana sayfadaki KÃ¶k Dizini kutusu, DÄ±ÅŸa AktarÄ±m Dizini kutusuyla aynÄ± birleÅŸik tasarÄ±ma kavuÅŸtu."
        ],
        updates: [
          "HakkÄ±nda alanÄ±nda geliÅŸtirici, sÃ¼rÃ¼m, repo ve iletiÅŸim 2 sÃ¼tun; GÃ¼ncelleme GeÃ§miÅŸi tek satÄ±r olarak dÃ¼zenlendi.",
          "KÃ¶k Dizini seÃ§me ikonu DÄ±ÅŸa AktarÄ±m Dizini ikonuyla aynÄ± yeÅŸil renge getirildi.",
          "Buy Me a Coffee widgetâ€™Ä± modal aÃ§Ä±kken gizlenmiyor.",
          "HakkÄ±nda bÃ¶lÃ¼mÃ¼ndeki Buy Me a Coffee gÃ¶rseli kaldÄ±rÄ±ldÄ±."
        ],
        fixes: [
          "KÃ¶k Dizini kutusunun bitiÅŸik dizin kutusu tasarÄ±mÄ±yla uyuÅŸmamasÄ± giderildi."
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
          "GÃ¼ncelleme GeÃ§miÅŸi son 5 kayÄ±tla sÄ±nÄ±rlandÄ±rÄ±ldÄ±; ilk 5 kayÄ±t link olarak gÃ¶steriliyor.",
          "HazÄ±r onayÄ± verilen istekler, onay geri alÄ±nmadan dÃ¼zenlenemiyor.",
          "Proje Dizini adÄ± DÄ±ÅŸa AktarÄ±m Dizini olarak gÃ¼ncellendi.",
          "Hemen Aktar butonu artÄ±k yalnÄ±zca bilgilendirme gÃ¶steriyor; davranÄ±ÅŸÄ± yalnÄ±zca Ayarlar deÄŸiÅŸtiriyor."
        ],
        updates: [
          "HakkÄ±nda alanÄ± tek sÃ¼tunlu ve gÃ¼ncelleme kayÄ±tlarÄ± linkli hale getirildi.",
          "Sonraki adÄ±m butonu turuncu ana buton tasarÄ±mÄ±na ve saÄŸ ok ikonuna kavuÅŸtu.",
          "DÄ±ÅŸa Aktar, Yeni Ä°stek ve Temiz Defter butonlarÄ± Kaydet butonu tasarÄ±mÄ±yla eÅŸleÅŸtirildi."
        ],
        fixes: [
          "KaranlÄ±k temada hazÄ±r istek kenarlÄ±ÄŸÄ± ve klasÃ¶r ikonu iÃ§in Ã§Ä±rtlak yeÅŸil tonlar koyulaÅŸtÄ±rÄ±ldÄ±."
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
          "Ayarlar; Sistem, YapÄ±landÄ±rma ve HakkÄ±nda sekmelerine ayrÄ±ldÄ±.",
          "Hemen aktar dÄ±ÅŸa aktarma davranÄ±ÅŸÄ± eklendi.",
          "KayÄ±tlarÄ± yeniden adlandÄ±rma Ã¶zelliÄŸi eklendi.",
          "Defter kimliÄŸi ile mÃ¼kerrer kayÄ±t uyarÄ±sÄ± eklendi.",
          "GÃ¼ncelleme GeÃ§miÅŸi penceresi eklendi.",
          "Buy Me a Coffee desteÄŸi eklendi."
        ],
        updates: [
          "Dil ve tema seÃ§imi otomatik kaydediliyor.",
          "Kaydet butonu modalÄ± kapatmÄ±yor; 2 saniyelik geri bildirim gÃ¶steriyor.",
          "VarsayÄ±lanlara DÃ¶n yalnÄ±zca klasÃ¶r ve dÄ±ÅŸa aktarma davranÄ±ÅŸÄ± ayarlarÄ±nÄ± sÄ±fÄ±rlÄ±yor.",
          "Ajan kartlarÄ± hizalÄ± Ä±zgaraya geÃ§irildi; kaldÄ±rma ikonu kullanÄ±lÄ±yor.",
          "KÃ¶k ve dÄ±ÅŸa aktarÄ±m dizinleri tam yol ve ikonlu butonlarla gÃ¶steriliyor.",
          "Eksik istek uyarÄ±sÄ± ilerleme kartÄ±nÄ±n iÃ§ine taÅŸÄ±ndÄ±.",
          "DÄ±ÅŸa aktarma adÄ±m butonlarÄ± ortalandÄ±.",
          "Ajan seÃ§imi zorunlu olmaktan Ã§Ä±karÄ±ldÄ±.",
          "Ä°ngilizce Ã§eviri kapsamÄ± ve Markdown Ã§Ä±ktÄ±sÄ± geniÅŸletildi.",
          "YardÄ±m iÃ§eriÄŸi gÃ¼ncellendi."
        ],
        fixes: [
          "KÃ¶k dizini varsayÄ±lan yolundaki fazladan eÄŸik Ã§izgi dÃ¼zeltildi.",
          "Proje kutusundaki fazladan ikon ve yeÅŸil nokta kaldÄ±rÄ±ldÄ±.",
          "BaÅŸlÄ±ksÄ±z istek metninin Ä°ngilizce Ã§evirisi dÃ¼zeltildi.",
          "ArÅŸiv baÅŸlÄ±ÄŸÄ±ndaki yinelenen metin kaldÄ±rÄ±ldÄ±.",
          "Buton geniÅŸlikleri iÃ§erikle hizalandÄ±."
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
          "Ä°stek defteri, tÃ¼r bazlÄ± alanlar, gÃ¶rsel ve dosya ekleri.",
          "Markdown, ZIP ve tek dosya dÄ±ÅŸa aktarma.",
          "Planlama, ajanlar ve kayÄ±t/arÅŸiv sistemi.",
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
    { id:"feature",  label:"Yeni Ã–zellik",     cls:"tag--feature",  ph:"Yeni Ã¶zellik ne yapmalÄ±? Hangi sorunu Ã§Ã¶zÃ¼yor?", desc:"Yeni bir iÅŸlev, ekran veya akÄ±ÅŸ ekle." },
    { id:"update",   label:"GÃ¼ncelleme",       cls:"tag--update",   ph:"Neyin deÄŸiÅŸmesini istiyorsun? Ekranda nasÄ±l gÃ¶rÃ¼nmeli?", desc:"Mevcut bir alanÄ±, akÄ±ÅŸÄ± veya davranÄ±ÅŸÄ± deÄŸiÅŸtir." },
    { id:"remove",   label:"KaldÄ±rma",         cls:"tag--remove",   ph:"Ne kaldÄ±rÄ±lmalÄ± ve neden?", desc:"Bir Ã¶ÄŸeyi, alanÄ± veya akÄ±ÅŸÄ± kaldÄ±r." },
    { id:"design",   label:"TasarÄ±m / Ä°Ã§erik", cls:"tag--design",   ph:"Hangi metin, renk, boÅŸluk veya bileÅŸen deÄŸiÅŸmeli?", desc:"TasarÄ±m, metin, gÃ¶rsel veya Ã¶rnek dosya paylaÅŸ." },
    { id:"question", label:"Soru",             cls:"tag--question", ph:"Sorunuzu net yazÄ±n; gerekirse ekran gÃ¶rÃ¼ntÃ¼sÃ¼ ekleyin.", desc:"Proje veya uygulama hakkÄ±nda soru sor." },
    { id:"bug",      label:"Hata",             cls:"tag--bug",      ph:"Hata nasÄ±l ortaya Ã§Ä±kÄ±yor? Beklenen ve gerÃ§ekleÅŸen davranÄ±ÅŸ ne?", desc:"Hata, console kaydÄ± veya beklenmeyen davranÄ±ÅŸ bildir." }
  ];
  const TYPE_MAP = {};
  TYPES.forEach(function(t){ TYPE_MAP[t.id] = t; });

  const PRIORITIES = [
    { id:"low",      label:"DÃ¼ÅŸÃ¼k",  cls:"prio--low" },
    { id:"normal",   label:"Normal", cls:"prio--normal" },
    { id:"high",     label:"YÃ¼ksek", cls:"prio--high" },
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
    { id:"full",  label:"Tam koÅŸu",  note:"YapÄ±lmasÄ± gereken bÃ¼tÃ¼n testler gerÃ§ekleÅŸtirilebilir.", noteEn:"All required tests can be performed." },
    { id:"light", label:"Hafif koÅŸu", note:"Testler sonrasÄ± hata dÃ¶nÃ¼yorsa fix iÅŸlemlerinden sonra sadece ilgili dosyalarda ve hata alÄ±nan bÃ¶lÃ¼mlerde test iÅŸlemi yapÄ±lacak. BÃ¼tÃ¼n fixler gerÃ§ekleÅŸtirildikten sonra bir kez tam koÅŸu yapÄ±lÄ±r. Tam koÅŸu sonucunda yine hata alÄ±nÄ±rsa dÃ¶ngÃ¼ devam eder. (Kodlama > Test > Hata Yok > Full Test > Hata > Ä°lgili hata iÃ§in fix > Ä°lgili hata iÃ§in Test > Hata yok > Full Test)", noteEn:"If errors are found after testing, run tests only on the affected files and areas after fixes. Once all fixes are complete, perform one full run. If the full run still fails, repeat the loop. (Coding > Test > No Error > Full Test > Error > Fix the error > Test the error > No Error > Full Test)" },
    { id:"none",  label:"Test yok",  note:"Sadece Backend ve Frontend Dev test yapabilirler. Bu istekler iÃ§in QA Tester ajanÄ± Ã§aÄŸÄ±rÄ±lmayacak.", noteEn:"Only Backend and Frontend Dev can test. The QA Tester agent is not called for these requests." }
  ];
  const PLANNING_FULL_TEXT = "SeÃ§ilen ajanlar (varsa) verilen isteklerin yerine getirilmesi iÃ§in kullanÄ±labilir. YapÄ±lan iÅŸlemler sonrasÄ± iÃ§in yapÄ±lacak testler Tam koÅŸu yapÄ±labilir. YapÄ±lan testlerde hata alÄ±ndÄ±ÄŸÄ±nda ilgili ajanlar fix iÅŸlemlerini yerine getirebilir sonrasÄ±nda tekrar tam koÅŸu testi yapÄ±labilir. Testlerin tekrarÄ±nda herhangi bir kÄ±sÄ±tlama yoktur.";
  const PLANNING_LIGHT_TEXT = "SeÃ§ilen ajanlar (varsa) verilen isteklerin yerine getirilmesi iÃ§in kullanÄ±labilir. YapÄ±lacak iÅŸlemler sonrasÄ± iÃ§in yapÄ±lacak testler hafifletilmiÅŸ olarak yapÄ±lacak. YapÄ±lan testlerde hata alÄ±ndÄ±ÄŸÄ±nda ilgili ajanlar fix iÅŸlemlerini yerine getirdikten sonra sadece hata alÄ±nan bÃ¶lÃ¼mlerde test iÅŸlemleri yapÄ±lsÄ±n. Hata alÄ±nmadÄ±ÄŸÄ± durumda en son bir kez olmak kaydÄ± ile tam koÅŸu testi yapÄ±labilir.";
  const PLANNING_FULL_TEXT_EN = "Selected agents, if any, can be used to fulfill the requested items. Full test runs can be performed after the work is completed. If errors are found, the relevant agents can apply fixes and then run the full test suite again. There is no limit on test repetitions.";
  const PLANNING_LIGHT_TEXT_EN = "Selected agents, if any, can be used to fulfill the requested items. Tests after the work will be run in a lightweight mode. If errors are found, the relevant agents apply fixes and then test only the affected areas. If no errors remain, one final full test run can be performed.";

  const TRANSLATIONS_EN = {
    "Ä°stek Defteri": "Request Ledger",
    "Ä°stek Listesi": "Request List",
    "DÄ±ÅŸa AktarÄ±lanlar": "Exported",
    "DÄ±ÅŸa AktarÄ±lan": "Exported",
    "ArÅŸiv": "Archive",
    "KayÄ±tlar": "Records",
    "KayÄ±t": "Record",
    "AynÄ± liste zaten kayÄ±tlÄ±": "This list is already saved",
    "Ãœzerine Yaz": "Overwrite",
    "Taslaklar": "Drafts",
    "Ä°stek": "Requests",
    "Yedek": "Backup",
    "YardÄ±m": "Help",
    "Yerel": "Local",
    "Proje Ã§alÄ±ÅŸma alanÄ±": "Project workspace",
    "Proje": "Project",
    "Yeni istek": "New request",
    "Temiz Defter": "Clear Ledger",
    "Toplam": "Total",
    "HazÄ±r": "Ready",
    "Eksik": "Missing",
    "GÃ¶rsel": "Image",
    "GÃ¶rseller": "Images",
    "Eksiklere git": "Go to missing",
    "TÃ¼mÃ¼": "All",
    "Yeni Ã–zellik": "New Feature",
    "GÃ¼ncelleme": "Update",
    "KaldÄ±rma": "Removal",
    "TasarÄ±m": "Design",
    "TasarÄ±m / Ä°Ã§erik": "Design / Content",
    "Soru": "Question",
    "Hata": "Bug",
    "TÃ¼m durumlar": "All states",
    "HazÄ±r deÄŸil": "Not ready",
    "TÃ¼mÃ¼nÃ¼ kapat": "Collapse all",
    "Ä°stekler": "Requests",
    "HenÃ¼z istek yok": "No requests yet",
    "Filtreye uyan istek yok": "No requests match the filter",
    "Filtreleri temizle": "Clear filters",
    "Ä°lk isteÄŸi ekle": "Add the first request",
    "NasÄ±l Ã§alÄ±ÅŸÄ±r?": "How does it work?",
    "GÃ¶rseller ve dosyalar IndexedDBâ€™de tutulur": "Images and files are stored in IndexedDB",
    "DÄ±ÅŸa Aktar": "Export",
    "Kaydet": "Save",
    "Oto. KayÄ±t": "Auto save",
    "KÃ¶k dizin": "Root folder",
    "KÃ¶k:": "Root:",
    "Proje dizini": "Project folder",
    "Proje Dizini": "Project Folder",
    "DÄ±ÅŸa AktarÄ±m Dizini": "Export Directory",
    "DÄ±ÅŸa aktarÄ±m dizini": "Export directory",
    "DÄ±ÅŸa aktarÄ±m dizinini seÃ§": "Select export directory",
    "DÄ±ÅŸa aktarÄ±m dizinini kaldÄ±r": "Remove export directory",
    "DÄ±ÅŸa aktarÄ±m dizini yolu": "Export directory path",
    "DÄ±ÅŸa aktarÄ±m dizini seÃ§ilmedi": "Export directory not selected",
    "Projem": "My Project",
    "KÃ¶k Dizini": "Root Folder",
    "Hedef": "Target",
    "Hedef konum": "Target location",
    "KlasÃ¶r seÃ§": "Choose folder",
    "DeÄŸiÅŸtir": "Change",
    "KaldÄ±r": "Remove",
    "SeÃ§": "Select",
    "SeÃ§ilmedi": "Not selected",
    "VarsayÄ±lan": "Default",
    "VarsayÄ±lana dÃ¶n": "Reset to default",
    "VarsayÄ±lanlara DÃ¶n": "Reset to Defaults",
    "Son tercihler": "Last preferences",
    "Ayarlar": "Settings",
    "YapÄ±landÄ±rma": "Configuration",
    "Sistem ayarlarÄ±": "System settings",
    "Ajanlar": "Agents",
    "Ajan": "Agent",
    "Yeni ajan": "New agent",
    "GÃ¶rev": "Role",
    "Ajan adÄ±": "Agent name",
    "Ajan .md dosyasÄ±": "Agent .md file",
    "Ajan .md dosyasÄ± yolu": "Agent .md file path",
    "Dil": "Language",
    "Tema": "Theme",
    "AydÄ±nlÄ±k": "Light",
    "KaranlÄ±k": "Dark",
    "DÄ±ÅŸa aktarÄ±m davranÄ±ÅŸÄ±": "Export behavior",
    "ArayÃ¼z dilini seÃ§.": "Select the interface language.",
    "AydÄ±nlÄ±k veya karanlÄ±k tema.": "Light or dark theme.",
    "Her dÄ±ÅŸa aktarÄ±mda varsayÄ±lan seÃ§imler mi, son kullanÄ±lan seÃ§imler mi kullanÄ±lsÄ±n?": "Use default selections or the last used selections for each export?",
    "Uygulama dili, tema, dÄ±ÅŸa aktarma davranÄ±ÅŸÄ± ve klasÃ¶r konumlarÄ±.": "Application language, theme, export behavior and folder locations.",
    "HenÃ¼z ajan yok": "No agents yet",
    "Yeni ajan ile baÅŸla; her satÄ±rda gÃ¶revi seÃ§, istersen ad ve .md dosyasÄ± ekle.": "Start with New agent; choose a role and optionally add a name and .md file.",
    "DÄ±ÅŸa aktarÄ±mda kullanÄ±lacak ajanlarÄ± burada tanÄ±mla. Ajan adÄ± yalnÄ±zca bu ekranda gÃ¶rÃ¼nÃ¼r; Markdown Ã§Ä±ktÄ±sÄ±nda gÃ¶rev ve varsa .md dosyasÄ± yolu yer alÄ±r. Dosya seÃ§imi dosya adÄ±nÄ± doldurur; yolu elle dÃ¼zenleyebilirsin.": "Define the agents used during export. The agent name is shown only here; the Markdown output contains the role and the .md file path if provided. File selection fills the file name; you can edit the path manually.",
    "MD dosyasÄ± seÃ§": "Select .md file",
    "AjanÄ± kaldÄ±r": "Remove agent",
    "Dosya seÃ§": "Choose file",
    "BaÅŸlÄ±k": "Title",
    "AÃ§Ä±klama": "Description",
    "Ã–ncelik": "Priority",
    "TÃ¼r": "Type",
    "Sayfa": "Page",
    "Sayfadaki konum": "Location on page",
    "Sayfadaki Konum": "Location on Page",
    "KÄ±sa ve anlaÅŸÄ±lÄ±r bir baÅŸlÄ±k": "A short, clear title",
    "Ã–rn. SipariÅŸler": "e.g. Orders",
    "Ã–rn. tablo Ã¼stÃ¼ araÃ§ Ã§ubuÄŸu, saÄŸ Ã¼stteki filtrelerâ€¦": "e.g. table toolbar, top-right filtersâ€¦",
    "Console HatasÄ± veya Sayfa HatasÄ±": "Console Error or Page Error",
    "Ã–rn. Uncaught TypeError: â€¦ / 404 sayfa hatasÄ±â€¦": "e.g. Uncaught TypeError: â€¦ / 404 page errorâ€¦",
    "GÃ¶rsel ekle": "Add image",
    "Ctrl+V ile yapÄ±ÅŸtÄ±r, sÃ¼rÃ¼kle-bÄ±rak veya dosya seÃ§": "Paste with Ctrl+V, drag and drop, or choose a file",
    "Dosya seÃ§": "Choose file",
    "Ã–rnek dosya eki (.html, .css vb.)": "Example attachment (.html, .css, etc.)",
    "Ã–rnek dosya ekle": "Add example file",
    ".html, .css, .js, .pdf vb. â€” en fazla 3 dosya": ".html, .css, .js, .pdf etc. â€” up to 3 files",
    "Ã–rnek web sitesi": "Example website",
    "Ä°lgili baÄŸlantÄ±": "Related link",
    "Ek not": "Additional note",
    "Ä°stersen ek bir aÃ§Ä±klama ekleâ€¦": "Optionally add a noteâ€¦",
    "SatÄ±rÄ± kapat": "Close row",
    "BaÅŸlÄ±ksÄ±z istek": "Untitled request",
    "Sayfa / konum belirtilmedi": "Page / location not specified",
    "Genel": "General",
    "Onay bekliyor": "Awaiting confirmation",
    "Son deÄŸiÅŸiklik:": "Last change:",
    "Durum": "Status",
    "Eklenme": "Created",
    "Talep": "Request",
    "Ã–rnek Dosya": "Example File",
    "Ã–rnek Web Sitesi": "Example Website",
    "Ä°lgili BaÄŸlantÄ±": "Related Link",
    "Ek Not": "Additional Note",
    "Planlama": "Planning",
    "Markdown dÄ±ÅŸa aktarma": "Markdown export",
    "DÄ±ÅŸa aktarma": "Export",
    "KoÅŸu tÃ¼rÃ¼": "Run type",
    "Tam koÅŸu": "Full run",
    "Hafif koÅŸu": "Light run",
    "Ã–zel": "Custom",
    "Soru ve Ã–neri": "Questions and Suggestions",
    "Runtime Paketi": "Runtime Package",
    "Paket Transferi": "Package Transfer",
    "Sunucu": "Server",
    "Transfer yok": "No transfer",
    "Ajanlar (Ã§oklu seÃ§im)": "Agents (multi-select)",
    "Testler": "Tests",
    "Test imkanÄ±": "Test option",
    "Test yok": "No tests",
    "Ã‡aÄŸrÄ±lacak Ajanlar": "Agents to Invoke",
    "Soru - Ã–neri isteÄŸi": "Question - Suggestion request",
    "Not": "Note",
    "DÄ±ÅŸa Aktar": "Export",
    "VazgeÃ§": "Cancel",
    "Ã–nceki adÄ±m": "Previous step",
    "Sonraki adÄ±m": "Next step",
    "Metni kopyala": "Copy text",
    "Ã‡Ä±ktÄ± biÃ§imi": "Output format",
    "ZIP + .md indir": "Download ZIP + .md",
    "Tek .md indir": "Download single .md",
    "BaÅŸa Ã¶zet tablosu ekle": "Add summary table at the top",
    "Dosya ekleri yalnÄ±zca ZIP Ã§Ä±ktÄ±sÄ±nda taÅŸÄ±nÄ±r.": "Attachments are only included in ZIP output.",
    "DÄ±ÅŸa aktarma tamamlandÄ±": "Export completed",
    "Talepleri temizle": "Clear requests",
    "Talepleri koru": "Keep requests",
    "Yedekleme": "Backup",
    "Veri gÃ¼venliÄŸi": "Data safety",
    "Tam yedek indir (.zip)": "Download full backup (.zip)",
    "Yedekten yÃ¼kle": "Restore from backup",
    "TÃ¼m verileri temizle": "Clear all data",
    "Kapat": "Close",
    "Tamam": "OK",
    "AnladÄ±m": "Got it",
    "Onay": "Confirmation",
    "Emin misin?": "Are you sure?",
    "Sil": "Delete",
    "Temizle": "Clear",
    "Defter": "Ledger",
    "Defteri Temizle": "Clear Ledger",
    "Geri yÃ¼kle": "Restore",
    "Ä°Ã§e aktar": "Import",
    "Proje adÄ±": "Project name",
    "Yeni Proje": "New Project",
    "Ã–rn. Projem": "e.g. My project",
    "OluÅŸtur": "Create",
    "Proje adÄ± zorunludur.": "Project name is required.",
    "Proje oluÅŸturuldu.": "Project created.",
    "Proje adÄ± girildiÄŸinde istek menÃ¼leri aÃ§Ä±lÄ±r. DÄ±ÅŸa aktarma, yedek ve kayÄ±t adlarÄ±nda kullanÄ±lÄ±r.": "Entering a project name reveals the request menus. It is used in export, backup and record names.",
    "Projeler": "Projects",
    "Yeni proje": "New project",
    "Proje seÃ§": "Select project",
    "Proje deÄŸiÅŸtir": "Switch project",
    "Projeleri aÃ§": "Open projects",
    "Projede ara": "Search projects",
    "Proje ara": "Search project",
    "Proje bulunamadÄ±.": "No project found.",
    "Proje ayarlarÄ±": "Project settings",
    "Proje AyarlarÄ±": "Project Settings",
    "OluÅŸturma": "Created",
    "GÃ¼ncelleme": "Updated",
    "DÄ±ÅŸa aktarÄ±m hedefi": "Export target",
    "KlasÃ¶r": "Folder",
    "DÄ±ÅŸa aktarÄ±m hedefini seÃ§": "Select export target",
    "DÄ±ÅŸa aktarÄ±m hedefini kaldÄ±r": "Remove export target",
    "Projeyi aÃ§": "Open project",
    "Åu an aÃ§Ä±k": "Currently open",
    "Projeyi sil": "Delete project",
    "Son proje silinemez.": "The last project cannot be deleted.",
    "Proje silinsin mi?": "Delete project?",
    "Proje adÄ± gÃ¼ncellendi.": "Project name updated.",
    "Proje silindi.": "Project deleted.",
    "ArÅŸivi gizle": "Hide archive",
    "ArÅŸivi gÃ¶ster": "Show archive",
    "ArÅŸivi aÃ§": "Open archive",
    "ArÅŸivi kapat": "Close archive",
    "Proje ayarlarÄ± aÃ§Ä±lamadÄ±.": "Project settings could not be opened.",
    "Proje verilerini temizle": "Clear project data",
    "Bu projedeki tÃ¼m talepler, gÃ¶rseller, dosyalar, DÄ±ÅŸa AktarÄ±lanlar, KayÄ±tlar ve Taslaklar silinecek. DiÄŸer projeler etkilenmez. Bu iÅŸlem geri alÄ±namaz. Ã–nce yedek almak istemediÄŸine emin misin?": "All requests, images, files, Exported, Records and Drafts in this project will be deleted. Other projects are not affected. This action cannot be undone. Are you sure you do not want to back up first?",
    "Proje verileri temizlendi. DiÄŸer projeler korundu.": "Project data cleared. Other projects were kept.",
    "Proje listesi gÃ¼ncellenemedi.": "The project list could not be updated.",
    "Ã–nce bir proje aÃ§.": "Open a project first.",
    "Bir proje seÃ§erek devam et. Her projenin istekleri ve dÄ±ÅŸa aktarma dizini ayrÄ± tutulur.": "Choose a project to continue. Each project keeps its own requests and export directory.",
    "HenÃ¼z proje yok. Yeni bir proje oluÅŸtur.": "No projects yet. Create a new project.",
    "KaydedilmemiÅŸ deÄŸiÅŸiklikler": "Unsaved changes",
    "Bu projede aÃ§Ä±ldÄ±ÄŸÄ±ndan beri deÄŸiÅŸiklik var. BaÅŸka bir projeye geÃ§meden Ã¶nce kaydetmek ister misin?": "This project has changed since it was opened. Do you want to save before switching?",
    "Kaydet ve geÃ§": "Save and switch",
    "Kaydetmeden geÃ§": "Switch without saving",
    "AÃ§Ä±k": "Open",
    "DÄ±ÅŸa aktarma, yedek ve kayÄ±t adlarÄ±nda kullanÄ±lÄ±r.": "Used in export, backup and record names.",
    "TÃ¼r seÃ§": "Select type",
    "Ã–ncelik seÃ§": "Select priority",
    "GÃ¶rev seÃ§â€¦": "Select roleâ€¦",
    "Bu tarayÄ±cÄ±da desteklenmiyor.": "Not supported in this browser.",
    "LÃ¼tfen bir seÃ§im yap.": "Please make a selection.",
    "GeliÅŸtirme Ä°stekleri": "Development Requests",
    "SÄ±kÄ±ÅŸtÄ±rÄ±lmÄ±ÅŸ Dosya": "Compressed File",
    "Ã–zet": "Summary",
    "talep": "requests",
    "gÃ¶rsel": "images",
    "dosya": "files",
    "adet": "items",
    "Markdown metninde yer almaz": "not included in Markdown text",
    "_AÃ§Ä±klama girilmedi._": "_No description provided._",
    "Console HatasÄ± veya Sayfa HatasÄ±": "Console Error or Page Error",
    "GÃ¶rsel bulunamadÄ±": "Image not found",
    "GÃ¶rsel yÃ¼kleniyorâ€¦": "Loading imageâ€¦",
    "dosya bulunamadÄ±": "file not found",
    "dosya eki; ZIP Ã§Ä±ktÄ±sÄ±nda taÅŸÄ±nÄ±r": "attachment; included in ZIP output",
    "Belirtilmedi": "Not specified",
    "MD DosyasÄ± Yolu": "MD File Path",
    "Dikkat": "Attention",
    "Onayla": "Confirm",
    "Proje dizini seÃ§": "Select project folder",
    "Hedef klasÃ¶r": "Project folder",
    "KÃ¶k dizin:": "Root folder:",
    "Ajan ayarlarÄ±": "Agent settings",
    "Ajan ayarlarÄ± kaydedildi.": "Agent settings saved.",
    "Ayarlar kaydedildi.": "Settings saved.",
    "Sistem ayarlarÄ± varsayÄ±lana dÃ¶ndÃ¼. Ajanlar korundu.": "System settings reset to defaults. Agents were kept.",
    "Planlama tÃ¼rÃ¼nÃ¼ seÃ§.": "Select a planning type.",
    "Soru ve Ã–neri seÃ§imini yap.": "Select an option for Questions and Suggestions.",
    "Runtime Paketi seÃ§imini yap.": "Select an option for Runtime Package.",
    "Paket Transferi seÃ§imini yap.": "Select a package transfer option.",
    "Ajan ayarlarÄ±ndan en az bir ajan ekle.": "Add at least one agent in Agent settings.",
    "En az bir ajan seÃ§.": "Select at least one agent.",
    "Test seÃ§imini yap.": "Select a test option.",
    "KaranlÄ±k mod": "Dark mode",
    "AydÄ±nlÄ±k mod": "Light mode",
    "TemayÄ± deÄŸiÅŸtir": "Change theme",
    "KaranlÄ±k mod aÃ§Ä±k.": "Dark mode enabled.",
    "AydÄ±nlÄ±k mod aÃ§Ä±k.": "Light mode enabled.",
    "Yeni bir iÅŸlev, ekran veya akÄ±ÅŸ ekle.": "Add a new function, screen or flow.",
    "Mevcut bir alanÄ±, akÄ±ÅŸÄ± veya davranÄ±ÅŸÄ± deÄŸiÅŸtir.": "Change an existing area, flow or behavior.",
    "Bir Ã¶ÄŸeyi, alanÄ± veya akÄ±ÅŸÄ± kaldÄ±r.": "Remove an item, area or flow.",
    "TasarÄ±m, metin, gÃ¶rsel veya Ã¶rnek dosya paylaÅŸ.": "Share design, text, visuals or an example file.",
    "Proje veya uygulama hakkÄ±nda soru sor.": "Ask a question about the project or application.",
    "Hata, console kaydÄ± veya beklenmeyen davranÄ±ÅŸ bildir.": "Report a bug, console log or unexpected behavior.",
    "Yeni Ã¶zellik ne yapmalÄ±? Hangi sorunu Ã§Ã¶zÃ¼yor?": "What should the new feature do? What problem does it solve?",
    "Neyin deÄŸiÅŸmesini istiyorsun? Ekranda nasÄ±l gÃ¶rÃ¼nmeli?": "What should change? How should it look on screen?",
    "Ne kaldÄ±rÄ±lmalÄ± ve neden?": "What should be removed and why?",
    "Hangi metin, renk, boÅŸluk veya bileÅŸen deÄŸiÅŸmeli?": "Which text, color, spacing or component should change?",
    "Sorunuzu net yazÄ±n; gerekirse ekran gÃ¶rÃ¼ntÃ¼sÃ¼ ekleyin.": "Write your question clearly; add a screenshot if needed.",
    "Hata nasÄ±l ortaya Ã§Ä±kÄ±yor? Beklenen ve gerÃ§ekleÅŸen davranÄ±ÅŸ ne?": "How does the bug occur? What is expected versus actual behavior?",
    "BaÅŸlÄ±k ve aÃ§Ä±klama zorunludur.": "Title and description are required.",
    "BaÅŸlÄ±k, aÃ§Ä±klama ve istek tÃ¼rÃ¼ zorunludur.": "Title, description and request type are required.",
    "Ä°Ã§eriÄŸe geÃ§": "Skip to content",
    "Ä°D": "ID",
    "DÄ±ÅŸa aktarÄ±lan listeler tarihe gÃ¶re burada tutulur.": "Exported lists are kept here by date.",
    "HenÃ¼z dÄ±ÅŸa aktarÄ±lan liste yok. DÄ±ÅŸa aktarÄ±m sonrasÄ± burada tarihe gÃ¶re gÃ¶rÃ¼necek.": "No exported lists yet. They will appear here by date after export.",
    "DÄ±ÅŸa AktarÄ±lanlarÄ± temizle": "Clear Exported",
    "iÃ§in gÃ¼ncelleme, yeni Ã¶zellik, soru ve kaldÄ±rma taleplerini tek yerde topla; doÄŸrula ve Markdown olarak devret.": "â€” collect update, new feature, question and removal requests in one place; review and hand off as Markdown.",
    "Ä°lk isteÄŸi ekleyerek baÅŸla.": "Start by adding the first request.",
    "Ä°lk gÃ¼ncelleme, yeni Ã¶zellik veya soruyla baÅŸla. Her tÃ¼r kendi alanlarÄ±nÄ± gÃ¶sterir; baÅŸlÄ±k ve aÃ§Ä±klama dÄ±ÅŸÄ±ndaki alanlar opsiyoneldir.": "Start with an update, new feature or question. Each type shows its own fields; fields other than title and description are optional.",
    "Sayfa ve konum, eklentinÄ±n Ã¶ÄŸe seÃ§icisiyle doldurulur.": "Page and location are filled in by the extension's element picker.",
    "Proje arÅŸivi": "Project archive",
    "YedeÄŸi geri yÃ¼kle": "Restore backup",
    "Arama veya filtreleri temizleyerek tÃ¼m istekleri gÃ¶rebilirsin.": "Clear the search or filters to see all requests.",
    "Eksikleri tamamlayÄ±p tik ile onayla.": "Complete the missing fields and confirm with the checkmark.",
    "Ä°lkine git": "Go to first",
    "1. AdÄ±m": "Step 1",
    "2. AdÄ±m": "Step 2",
    "Markdown ayrÄ± dosya; gÃ¶rseller ve dosya ekleri ayrÄ± ZIP iÃ§inde sÄ±kÄ±ÅŸtÄ±rÄ±lÄ±r. Medya yoksa yalnÄ±zca .md iner.": "Markdown is a separate file; images and attachments are packed into a separate ZIP. If there is no media, only the .md file is downloaded.",
    "GÃ¶rseller dosyanÄ±n iÃ§ine base64 olarak gÃ¶mÃ¼lÃ¼r. Dosya ekleri yalnÄ±zca ZIP ile taÅŸÄ±nÄ±r.": "Images are embedded in the file as base64. Attachments are only transferred with ZIP.",
    "Bu defterde dosya eki var. Tek .md Ã§Ä±ktÄ±sÄ± dosya eklerini taÅŸÄ±maz; lÃ¼tfen ZIP kullan.": "This ledger has attachments. Single .md output does not carry attachments; please use ZIP.",
    "Ä°steklerin nasÄ±l gerÃ§ekleÅŸtirileceÄŸini seÃ§. DÄ±ÅŸa Aktar ile Ã§Ä±ktÄ± oluÅŸturulacak.": "Choose how the requests will be implemented. Export will create the output.",
    "(tek seÃ§im)": "(single select)",
    "(Ã§oklu seÃ§im)": "(multi-select)",
    "HayÄ±r": "No",
    "Sunucu ve gofile.io birlikte seÃ§ilebilir. â€œTransfer yokâ€ seÃ§ilirse diÄŸer seÃ§imler iptal edilir.": "Server and gofile.io can be selected together. Selecting â€œNo transferâ€ cancels the other selections.",
    "Talepler + KayÄ±tlar + gÃ¶rseller + dosya ekleri. BaÅŸka bir tarayÄ±cÄ±ya taÅŸÄ±mak iÃ§in en gÃ¼venli yol.": "Requests + Records + images + attachments. The safest way to move to another browser.",
    "TÃ¼m projeler + talepler + KayÄ±tlar + gÃ¶rseller + dosya ekleri. BaÅŸka bir tarayÄ±cÄ±ya taÅŸÄ±mak iÃ§in en gÃ¼venli yol.": "All projects + requests + Records + images + attachments. The safest way to move to another browser.",
    "Talep ve KayÄ±t metinleri. GÃ¶rseller ve dosya ekleri bu dosyaya dahil edilmez.": "Request and Record texts. Images and attachments are not included.",
    "TÃ¼m projelerin talep ve KayÄ±t metinleri. GÃ¶rseller ve dosya ekleri bu dosyaya dahil edilmez.": "Request and Record texts for every project. Images and attachments are not included.",
    ".zip veya .json dosyasÄ± seÃ§. Mevcut talepler ve KayÄ±tlar yedekteki verilerle deÄŸiÅŸtirilir.": "Choose a .zip or .json file. Current requests and Records will be replaced with the backup data.",
    ".zip veya .json dosyasÄ± seÃ§. TÃ¼m projeler yedekteki verilerle deÄŸiÅŸtirilir.": "Choose a .zip or .json file. All projects will be replaced with the backup data.",
    "Veriler tarayÄ±cÄ±ya baÄŸlÄ±dÄ±r. TarayÄ±cÄ± verisi temizlenirse kayÄ±tlar kaybolur; dÃ¼zenli yedek almayÄ± unutma.": "Data is tied to the browser. If browser data is cleared, records are lost; remember to back up regularly.",
    "Hedef klasÃ¶r seÃ§iliyse yedekler de oraya kaydedilir; aksi halde tarayÄ±cÄ± indirilenler klasÃ¶rÃ¼ne iner.": "If a project folder is selected, backups are saved there; otherwise they go to the browser downloads folder.",
    "TR - TÃ¼rkÃ§e": "TR - Turkish",
    "KÄ±sa rehber": "Quick guide",
    "1. SatÄ±r ekle": "1. Add a row",
    "Her gÃ¼ncelleme, yeni Ã¶zellik, soru veya kaldÄ±rma isteÄŸi iÃ§in ayrÄ± bir satÄ±r aÃ§.": "Open a separate row for each update, new feature, question or removal request.",
    "2. TÃ¼re gÃ¶re alanlarÄ± doldur": "2. Fill in type-specific fields",
    "TÃ¼rÃ¼ seÃ§tiÄŸinde yalnÄ±zca o tÃ¼re ait alanlar gÃ¶rÃ¼nÃ¼r. BaÅŸlÄ±k ve aÃ§Ä±klama dÄ±ÅŸÄ±ndaki alanlar opsiyoneldir.": "When you select a type, only its fields appear. Fields other than title and description are optional.",
    "3. GÃ¶rsel ve dosya ekle": "3. Add images and attachments",
    "SatÄ±r aÃ§Ä±kken": "With the row open,",
    "ile ekran gÃ¶rÃ¼ntÃ¼sÃ¼nÃ¼ ekle. TasarÄ±m tÃ¼rÃ¼nde Ã¶rnek": "add a screenshot. For the Design type, add an example",
    "dosyasÄ± da ekleyebilirsin.": "file as well.",
    "Zorunlu alanlar dolunca satÄ±rdaki tiki tÄ±kla. Tik tÄ±klanmayan satÄ±r varsa export aÃ§Ä±lmaz.": "When required fields are complete, click the row's checkmark. Export is disabled if any row is not confirmed.",
    "5. DÄ±ÅŸa aktar": "5. Export",
    "ZIP olarak Markdown + gÃ¶rselleri indir veya tek .md dosyasÄ± oluÅŸtur. YedeÄŸi de unutma.": "Download Markdown + images as ZIP or create a single .md file. Do not forget to back up.",
    "â€œHazÄ±râ€ tiki, Ã¶zelliÄŸin yapÄ±ldÄ±ÄŸÄ± anlamÄ±na gelmez; sadece bu talebin dÄ±ÅŸa aktarÄ±lmaya hazÄ±r olduÄŸunu onaylar.": "The â€œReadyâ€ check does not mean the feature is done; it only confirms that this request is ready for export.",
    "Hangi tÃ¼rde istek aÃ§Ä±lsÄ±n?": "Which request type should be created?",
    "Yeni KayÄ±t OluÅŸtur": "Create New Record",
    "DÄ±ÅŸa aktarÄ±m": "Export",
    "YÃ¼kle": "Load",
    "Her ajan iÃ§in bir gÃ¶rev seÃ§.": "Select a role for each agent.",
    "KÃ¶k dizini varsayÄ±lana dÃ¶ndÃ¼.": "Root folder reset to default.",
    "Proje dizini kaldÄ±rÄ±ldÄ±. Dosyalar indirilecek.": "Project folder removed. Files will be downloaded.",
    "DÄ±ÅŸa aktarÄ±m dizini kaldÄ±rÄ±ldÄ±. Dosyalar indirilecek.": "Export directory removed. Files will be downloaded.",
    "Bu tarayÄ±cÄ± dÄ±ÅŸa aktarÄ±m dizini seÃ§imini desteklemiyor. Dosyalar indirilecek.": "This browser does not support export directory selection. Files will be downloaded.",
    "DÄ±ÅŸa aktarÄ±m davranÄ±ÅŸÄ± [Hemen Aktar] gÃ¼ncellendi. Ayarlardan bu Ã¶zelliÄŸi etkinleÅŸtirebilirsiniz.": "Export behavior [Instant Export] updated. You can enable this feature from Settings.",
    "HazÄ±r onayÄ±nÄ± geri alarak dÃ¼zenleyebilirsin.": "Revoke the ready confirmation to edit.",
    "Defter temizlendi. KayÄ±tlar, Taslaklar ve DÄ±ÅŸa AktarÄ±lanlar korundu.": "Ledger cleared. Records, Drafts and Exported were kept.",
    "Ana menÃ¼": "Main menu",
    "Ä°D Â· Ä°stek Defteri, ana sayfa": "ID Â· Request Ledger, home",
    "Ä°stek Listesini kapat": "Close Request List",
    "ArÅŸiv bÃ¶lÃ¼mleri": "Archive sections",
    "Ä°D Â· Ä°stek Defteri": "ID Â· Request Ledger",
    "Ä°stek Listesini aÃ§": "Open Request List",
    "DÄ±ÅŸa AktarÄ±lanlarÄ± kapat": "Close Exported",
    "DÄ±ÅŸa AktarÄ±lanlarÄ± aÃ§": "Open Exported",
    "KayÄ±tlarÄ±n saklanacaÄŸÄ± kÃ¶k dizini seÃ§": "Select the root folder for records",
    "Proje dizinini seÃ§": "Select project folder",
    "Hedef klasÃ¶r seÃ§": "Select project folder",
    "Mevcut istekleri kaydet": "Save current requests",
    "DÄ±ÅŸa aktar": "Export",
    "Ä°lerleme Ã¶zeti": "Progress summary",
    "HazÄ±r talep ilerlemesi": "Ready request progress",
    "BaÅŸlÄ±k, sayfa veya aÃ§Ä±klamada araâ€¦": "Search title, page or descriptionâ€¦",
    "Ä°steklerde ara": "Search requests",
    "AramayÄ± temizle": "Clear search",
    "TÃ¼re gÃ¶re filtrele": "Filter by type",
    "Duruma gÃ¶re filtrele": "Filter by status",
    "TÃ¼m satÄ±rlarÄ± kapat": "Collapse all rows",
    "SatÄ±r iÅŸlemleri": "Row actions",
    "Eksik Ã§ubuÄŸunu gizle": "Hide missing bar",
    "Planlama tÃ¼rÃ¼": "Planning type",
    "Soru ve Ã¶neri": "Questions and suggestions",
    "Bu plana Ã¶zel eklemek istediÄŸin notâ€¦": "Optional note for this planâ€¦",
    "Ajan gÃ¶revi": "Agent role",
    "YukarÄ± taÅŸÄ±": "Move up",
    "AÅŸaÄŸÄ± taÅŸÄ±": "Move down",
    "Ã‡oÄŸalt": "Duplicate",
    "DÃ¼ÅŸÃ¼k": "Low",
    "Kritik": "Critical",
    "YÃ¼ksek": "High",
    "1 talep dÄ±ÅŸa aktarmaya hazÄ±r deÄŸil. Eksikleri tamamlayÄ±p tik ile onayla.": "1 request is not ready for export. Complete the missing fields and confirm with the checkmark.",
    "TÃ¼m planlama seÃ§imleri tamam.": "All planning selections are complete.",
    "(opsiyonel)": "(optional)",
    "DÄ±ÅŸa aktarma seÃ§enekleri bulunamadÄ±.": "Export options not found.",
    "Ã–nce tÃ¼m satÄ±rlarÄ± hazÄ±r olarak iÅŸaretle.": "Mark all rows as ready first.",
    "HazÄ±rlanÄ±yorâ€¦": "Preparingâ€¦",
    "HazÄ±r onayÄ±nÄ± geri al": "Revoke ready confirmation",
    "SatÄ±rÄ± hazÄ±r olarak iÅŸaretle": "Mark row as ready",
    "TÃ¼m talepler hazÄ±r. Markdown olarak dÄ±ÅŸa aktarabilirsin.": "All requests are ready. You can export as Markdown.",
    "GÃ¶rsel eklendi.": "Image added.",
    "GÃ¶rsel kaldÄ±rÄ±ldÄ±.": "Image removed.",
    "Dosya eklendi.": "File added.",
    "Dosya kaldÄ±rÄ±ldÄ±.": "File removed.",
    "Ä°stek silindi.": "Request deleted.",
    "Ä°stekler temizlendi.": "Requests cleared.",
    "SeÃ§im iptal edildi.": "Selection cancelled.",
    "Ekran alÄ±ntÄ±sÄ± iptal edildi.": "Screenshot cancelled.",
    "Sayfa yolu gÃ¼ncellendi.": "Page path updated.",
    "KayÄ±t oluÅŸturuldu.": "Record created.",
    "BaÅŸlÄ±k, AÃ§Ä±klama": "Title, Description",
    "HenÃ¼z ajan tanÄ±mlanmadÄ±. DÄ±ÅŸa aktarmada kullanmak iÃ§in ayarlardan ajan ekle.": "No agents defined yet. Add an agent from settings to use it during export.",
    "HenÃ¼z ajan tanÄ±mlanmadÄ±. Ajan seÃ§imi zorunlu deÄŸil; istersen ayarlardan ajan ekle.": "No agents defined yet. Agent selection is optional; add one from settings if you want.",
    "Kaydedildi": "Saved",
    "Kaydedildi.": "Saved.",
    "SeÃ§imler kaydedildi. Sonraki dÄ±ÅŸa aktarÄ±mlar bu seÃ§imlerle Ã§alÄ±ÅŸacak.": "Choices saved. Later exports will use these selections.",
    "Bu tÃ¼rde taÅŸÄ±nacak baÅŸka satÄ±r yok.": "There is no other row of this type to move.",
    "Yedek dosyasÄ± Ã§ok bÃ¼yÃ¼k.": "The backup file is too large.",
    "Yedek okunuyorâ€¦": "Reading backupâ€¦",
    "Yedek okunamadÄ±.": "Could not read the backup.",
    "Yedek oluÅŸturulamadÄ±.": "Could not create the backup.",
    "GeÃ§ersiz yedek dosyasÄ±.": "Invalid backup file.",
    "GeÃ§ersiz yedek sÃ¼rÃ¼mÃ¼.": "Invalid backup version.",
    "ZIP iÃ§inde yedek.json bulunamadÄ±.": "yedek.json was not found in the ZIP.",
    "Yedekte proje bulunamadÄ±.": "No projects were found in the backup.",
    "Yedekte Ã§ok fazla proje var.": "The backup contains too many projects.",
    "GeÃ§ersiz yedek: proje kaydÄ± okunamadÄ±.": "Invalid backup: a project record could not be read.",
    "GeÃ§ersiz yedek: proje kimliÄŸi okunamadÄ±.": "Invalid backup: a project id could not be read.",
    "GeÃ§ersiz yedek: proje kimliÄŸi tekrar ediyor.": "Invalid backup: a project id is duplicated.",
    "GeÃ§ersiz yedek: proje adÄ± boÅŸ.": "Invalid backup: a project name is empty.",
    "Proje listesi yazÄ±lamadÄ±.": "The project list could not be written.",
    "Bu dosya bir Request Ledger yedeÄŸi deÄŸil.": "This file is not a Request Ledger backup.",
    "Yedek daha yeni bir sÃ¼rÃ¼mle oluÅŸturulmuÅŸ.": "This backup was created by a newer version.",
    "Yedekte Ã§ok fazla talep var.": "The backup contains too many requests.",
    "Yedekte Ã§ok fazla kayÄ±t var.": "The backup contains too many records.",
    "Yedekte Ã§ok fazla taslak var.": "The backup contains too many drafts.",
    "Yedekte Ã§ok fazla ajan var.": "The backup contains too many agents.",
    "Sistem": "System",
    "HakkÄ±nda": "About",
    "Uygulama": "Application",
    "Ayarlar sekmeleri": "Settings tabs",
    "Dil, tema ve klasÃ¶r konumlarÄ±.": "Language, theme and folder locations.",
    "KayÄ±tlarÄ±n saklanacaÄŸÄ± kÃ¶k klasÃ¶r.": "Root folder where records are stored.",
    "DÄ±ÅŸa aktarÄ±m dosyalarÄ±nÄ±n hedef klasÃ¶rÃ¼.": "Target folder for export files.",
    "Ã‡Ä±ktÄ± ve planlama tercihleri.": "Output and planning preferences.",
    "KÃ¶k dizini yolu": "Root folder path",
    "Proje dizini yolu": "Project folder path",
    "TÃ¼rkÃ§eye geÃ§": "Switch to Turkish",
    "Ä°ngilizceye geÃ§": "Switch to English",
    "Dili deÄŸiÅŸtir": "Change language",
    "Sistem ayarlarÄ± varsayÄ±lana dÃ¶ndÃ¼.": "System settings reset to defaults.",
    "Yeniden adlandÄ±r": "Rename",
    "KaydÄ± yeniden adlandÄ±r": "Rename record",
    "KayÄ±t adÄ±": "Record name",
    "KayÄ±t adÄ± boÅŸ olamaz.": "Record name cannot be empty.",
    "KayÄ±t yeniden adlandÄ±rÄ±ldÄ±.": "Record renamed.",
    "Bu ad yalnÄ±zca kayÄ±t listesinde gÃ¶rÃ¼nÃ¼r; dÄ±ÅŸa aktarÄ±lan .md dosyasÄ±nÄ±n adÄ±nÄ± deÄŸiÅŸtirmez.": "This name is shown only in the record list; it does not change the exported .md file name.",
    "GÃ¶rev:": "Role:",
    "Ajan AdÄ±:": "Agent name:",
    "Ajan .MD DosyasÄ±:": "Agent .MD file:",
    "YayÄ±ncÄ±": "Publisher",
    "SÃ¼rÃ¼m": "Version",
    "Ä°letiÅŸim": "Contact",
    "Proje isteklerini topla, doÄŸrula ve Markdown olarak dÄ±ÅŸa aktar.": "Collect project requests, review them and export as Markdown.",
    "Tarih": "Date",
    "Talep": "Request",
    "GÃ¶rsel": "Image",
    "Dosya": "File",
    "BiÃ§im": "Format",
    "Hedef": "Target",
    "Dosya adÄ±": "File name",
    "DÄ±ÅŸa aktarÄ±ldÄ±": "Exported",
    "KÃ¶k dosya": "Root file",
    "Neden": "Reason",
    "Manuel taslak": "Manual draft",
    "TarayÄ±cÄ±da": "In browser",
    "TarayÄ±cÄ±": "Browser",
    "Tamam": "Complete",
    "Eksik": "Missing",
    "Evet": "Yes",
    "HayÄ±r": "No",
    "Ä°ndirilenler": "Downloads",
    "Eksik alan var": "Missing fields",
    "HenÃ¼z dÄ±ÅŸa aktarÄ±lmadÄ±": "Not exported yet",
    "Taslak": "Draft",
    "Kaydet ikonuyla alÄ±nan anlÄ±k kayÄ±tlar.": "Instant records taken with the Save icon.",
    "YÃ¼kleme Ã¶ncesi otomatik alÄ±nan taslaklar.": "Drafts captured automatically before loading.",
    "KayÄ±tlarÄ± temizle": "Clear Records",
    "TaslaklarÄ± temizle": "Clear Drafts",
    "HenÃ¼z kayÄ±t yok. Ãœstteki Kaydet ikonuyla anlÄ±k kayÄ±t alabilirsin.": "No records yet. Take an instant record with the Save icon at the top.",
    "HenÃ¼z taslak yok. Bir kayÄ±t yÃ¼klenmeden Ã¶nce mevcut liste otomatik taslak olarak saklanÄ±r.": "No drafts yet. The current list is stored as a draft before a record is loaded.",
    "Hemen aktar": "Instant export",
    "VarsayÄ±lan, son tercihler veya hemen aktar.": "Default, last preferences or instant export.",
    "Dil, tema, dÄ±ÅŸa aktarÄ±m davranÄ±ÅŸÄ± ve klasÃ¶r konumlarÄ±.": "Language, theme, export behavior and folder locations.",
    "izin gerekli": "permission required",
    "KÃ¶k dizini seÃ§": "Select root folder",
    "KÃ¶k dizinini seÃ§": "Select root folder",
    "Proje dizinini kaldÄ±r": "Remove project folder",
    "GeliÅŸtirici": "Developer",
    "Uygulama geliÅŸtiricisi": "Application developer",
    "Uygulama reposu": "Application repository",
    "GÃ¼ncelleme GeÃ§miÅŸi": "Update History",
    "Yeni Ã–zellikler": "New Features",
    "GÃ¼ncellemeler": "Updates",
    "Hata DÃ¼zeltmeleri": "Bug Fixes",
    "KlasÃ¶r seÃ§ilemedi. LÃ¼tfen yazÄ±labilir bir klasÃ¶r seÃ§in.": "Folder could not be selected. Please choose a writable folder.",
    "TarayÄ±cÄ± bu klasÃ¶re eriÅŸim izni vermedi. C:\\ veya masaÃ¼stÃ¼ kÃ¶kÃ¼ gibi sistem klasÃ¶rleri yerine yazÄ±labilir bir alt klasÃ¶r seÃ§in.": "The browser did not grant access to this folder. Choose a writable subfolder instead of a system folder such as C:\\ or the desktop root.",
    "1. Yeni istek ekle": "1. Add a new request",
    "Her gÃ¼ncelleme, yeni Ã¶zellik, soru veya kaldÄ±rma isteÄŸi iÃ§in ayrÄ± bir satÄ±r aÃ§. TÃ¼rÃ¼ seÃ§tiÄŸinde yalnÄ±zca o tÃ¼re ait alanlar gÃ¶rÃ¼nÃ¼r.": "Open a separate row for each update, new feature, question or removal request. When you select a type, only its fields appear.",
    "2. AyarlarÄ± kullan": "2. Use settings",
    "Ayarlar Ã¼Ã§ sekmeye ayrÄ±ldÄ±: Sistem, YapÄ±landÄ±rma ve HakkÄ±nda. Dil ve tema seÃ§imi Kaydetâ€™e basmadan otomatik saklanÄ±r.": "Settings is split into three tabs: System, Configuration and About. Language and theme are saved automatically without pressing Save.",
    "3. AjanlarÄ± tanÄ±mla": "3. Define agents",
    "Ajanlar artÄ±k zorunlu deÄŸil. YapÄ±landÄ±rma sekmesinden istersen ajan ekle; seÃ§im yapmadan da dÄ±ÅŸa aktarabilirsin.": "Agents are no longer mandatory. Add agents from the Configuration tab if you want; you can export without selecting any.",
    "4. GÃ¶rsel ve dosya ekle": "4. Add images and files",
    "SatÄ±rÄ± aÃ§Ä±p GÃ¶rseller bÃ¶lÃ¼mÃ¼ndeki GÃ¶rsel ekle dÃ¼ÄŸmesini kullan. TasarÄ±m tÃ¼rÃ¼nde Ã¶rnek .html / .css dosyasÄ± da ekleyebilirsin.": "Open the row and use the Add image button in the Images section. For the Design type, you can also add an example .html / .css file.",
    "5. Tik ile onayla": "5. Confirm with the checkmark",
    "Zorunlu alanlar dolunca satÄ±rdaki tiki tÄ±kla. Tik tÄ±klanmayan satÄ±r varsa dÄ±ÅŸa aktarma kapalÄ± kalÄ±r.": "When required fields are complete, click the row's checkmark. Export stays disabled if any row is not confirmed.",
    "6. DÄ±ÅŸa aktar": "6. Export",
    "Ã‡Ä±ktÄ± biÃ§imini ve planlamayÄ± seÃ§. Hemen aktar ile bu seÃ§imleri kaydet; sonraki dÄ±ÅŸa aktarÄ±mlar modal aÃ§Ä±lmadan aynÄ± seÃ§imlerle Ã§alÄ±ÅŸÄ±r.": "Choose the output format and planning. Save these selections with Instant export; later exports run with the same selections without opening the modal.",
    "7. KayÄ±tlarÄ± yÃ¶net": "7. Manage records",
    "Kaydet ile anlÄ±k kayÄ±t al. AynÄ± deftere ait bir kayÄ±t varsa uygulama seni uyarÄ±r. KayÄ±t detayÄ±ndan Yeniden adlandÄ±r ile yalnÄ±zca gÃ¶rÃ¼nen adÄ± deÄŸiÅŸtirebilirsin.": "Take an instant record with Save. If a record for the same ledger exists, the app warns you. Rename from the record detail changes only the display name.",
    "8. Yedek al": "8. Back up",

    "Eklenti baÄŸlÄ±": "Extension connected",
    "Eklenti farklÄ± projede": "Extension is on another project",
    "CanlÄ± baÄŸlantÄ±": "Live connection",
    "Metinler eklentiyla anlÄ±k eÅŸitlenir. GÃ¶rseller ve dosya ekleri yalnÄ±zca ZIP yedeÄŸiyle taÅŸÄ±nÄ±r.": "Text syncs with the extension live. Images and attachments travel only with a backup ZIP.",
    "Ä°ki defter bulundu": "Two ledgers found",
    "Uygulama ve eklenti farklÄ± defterler iÃ§eriyor. Hangisi kullanÄ±lsÄ±n? Uygulamadaki defter varsayÄ±landÄ±r.": "The app and the extension hold different ledgers. Which one should be used? The app ledger is the default.",
    "Uygulamadaki defter": "Use app ledger",
    "Eklentidaki defter": "Use extension ledger",
    "BaÄŸlantÄ±": "Connection",
    "Sonra karar ver": "Decide later",
    "Defter seÃ§imi kaydedildi.": "Ledger choice saved.",
    "Ã–ÄŸe seÃ§": "Pick element",
    "Ekran gÃ¶rÃ¼ntÃ¼sÃ¼": "Screenshot",
    "Ã–ÄŸe + gÃ¶rÃ¼ntÃ¼": "Element + screenshot",
    "SeÃ§iliyorâ€¦": "Selectingâ€¦",
    "Ekran gÃ¶rÃ¼ntÃ¼sÃ¼ alÄ±nÄ±yorâ€¦": "Capturing screenshotâ€¦",
    "Ã–ÄŸe ve gÃ¶rÃ¼ntÃ¼ alÄ±nÄ±yorâ€¦": "Picking element and screenshotâ€¦",
    "Sayfa ve konumu eklentidan seÃ§.": "Pick the page and location from the extension.",
    "Sekmenin ekran gÃ¶rÃ¼ntÃ¼sÃ¼nÃ¼ al ve isteÄŸe ekle.": "Capture the tab and attach it to the request.",
    "Bir Ã¶ÄŸe seÃ§ ve gÃ¶rÃ¼ntÃ¼sÃ¼nÃ¼ isteÄŸe ekle.": "Pick an element and attach its screenshot.",
    "Eklenti baÄŸlÄ± deÄŸil â€” kurulum adÄ±mlarÄ±nÄ± gÃ¶rmek iÃ§in tÄ±kla.": "The extension is not connected â€” click for install steps.",
    "Bir satÄ±ra en fazla 8 gÃ¶rsel eklenebilir.": "A row can hold at most 8 images.",
    "Bu sayfa eklenti kÃ¶prÃ¼sÃ¼ne izin vermiyor.": "This page does not allow the extension bridge.",
    "Hangi sekmeden seÃ§ilsin?": "Which tab should be picked from?",
    "Hangi sekmeden gÃ¶rÃ¼ntÃ¼ alÄ±nsÄ±n?": "Which tab should be captured?",
    "Hangi sekmeden Ã¶ÄŸe ve gÃ¶rÃ¼ntÃ¼ alÄ±nsÄ±n?": "Which tab should provide the element and screenshot?",
    "Uygulama sekmesi listede gÃ¶rÃ¼nmez.": "The app tab is not listed.",
    "Sekmeler yÃ¼kleniyorâ€¦": "Loading tabsâ€¦",
    "Bu sekmeden Ã¶ÄŸe seÃ§": "Pick an element from this tab",
    "SeÃ§ilebilecek sekme bulunamadÄ±. Belgelemek istediÄŸin sayfayÄ± aÃ§Ä±p yeniden dene.": "No eligible tab found. Open the page you want to document and try again.",
    "SeÃ§im bekleniyorâ€¦": "Selectingâ€¦",
    "GÃ¶rÃ¼ntÃ¼ bekleniyorâ€¦": "Waiting for screenshotâ€¦",
    "Ã–ÄŸe ve gÃ¶rÃ¼ntÃ¼ bekleniyorâ€¦": "Waiting for element and screenshotâ€¦",
    "SeÃ§tiÄŸin sekmede bir Ã¶ÄŸeye tÄ±kla. 30 saniye iÃ§inde sonuÃ§ gelmezse seÃ§im iptal edilir.": "Click an element in the chosen tab. The selection is cancelled if no result arrives within 30 seconds.",
    "SeÃ§tiÄŸin sekmede kÄ±rpÄ±lacak alanÄ± sÃ¼rÃ¼kle. 30 saniye iÃ§inde sonuÃ§ gelmezse iÅŸlem iptal edilir.": "Drag over the area to crop in the chosen tab. The operation is cancelled if no result arrives within 30 seconds.",
    "SeÃ§tiÄŸin sekmede bir Ã¶ÄŸeye tÄ±kla; gÃ¶rÃ¼ntÃ¼sÃ¼ de alÄ±nacak. 30 saniye iÃ§inde sonuÃ§ gelmezse iÅŸlem iptal edilir.": "Click an element in the chosen tab; its screenshot is captured too. The operation is cancelled if no result arrives within 30 seconds.",
    "SeÃ§im tamamlanÄ±nca bu pencereye dÃ¶nÃ¼lÃ¼r.": "You return to this window when the selection finishes.",
    "SeÃ§imi iptal et": "Cancel selection",
    "GÃ¶rÃ¼ntÃ¼ almayÄ± iptal et": "Cancel capture",
    "Ä°ÅŸlemi iptal et": "Cancel operation",
    "Sekme listesi alÄ±namadÄ±. EklentinÄ±n aÃ§Ä±k ve baÄŸlÄ± olduÄŸundan emin ol.": "The tab list could not be loaded. Make sure the extension is enabled and connected.",
    "SeÃ§im zaman aÅŸÄ±mÄ±na uÄŸradÄ±. Eklenti penceresini kapatÄ±p yeniden dene.": "The selection timed out. Close the extension window and try again.",
    "GÃ¶rÃ¼ntÃ¼ alma zaman aÅŸÄ±mÄ±na uÄŸradÄ±. Eklenti penceresini kapatÄ±p yeniden dene.": "The capture timed out. Close the extension window and try again.",
    "Ä°ÅŸlem zaman aÅŸÄ±mÄ±na uÄŸradÄ±. Eklenti penceresini kapatÄ±p yeniden dene.": "The operation timed out. Close the extension window and try again.",
    "Ã–ÄŸe seÃ§imi zaman aÅŸÄ±mÄ±na uÄŸradÄ±.": "Element selection timed out.",
    "GÃ¶rÃ¼ntÃ¼ alma zaman aÅŸÄ±mÄ±na uÄŸradÄ±.": "Screenshot capture timed out.",
    "Ã–ÄŸe ve gÃ¶rÃ¼ntÃ¼ zaman aÅŸÄ±mÄ±na uÄŸradÄ±.": "Element and screenshot timed out.",
    "HazÄ±r onayÄ±nÄ± geri alarak dÃ¼zenleyebilirsin.": "Undo the ready confirmation to edit this row.",
    "Ã–ÄŸe seÃ§imi iptal edildi.": "Element selection cancelled.",
    "GÃ¶rÃ¼ntÃ¼ alÄ±mÄ± iptal edildi.": "Screenshot capture cancelled.",
    "Ã–ÄŸe ve gÃ¶rÃ¼ntÃ¼ alÄ±mÄ± iptal edildi.": "Element and screenshot cancelled.",
    "SeÃ§im sonucu geÃ§ersiz. Yeniden dene.": "The selection result is invalid. Try again.",
    "GÃ¶rÃ¼ntÃ¼ sonucu geÃ§ersiz. Yeniden dene.": "The screenshot result is invalid. Try again.",
    "SeÃ§im yapÄ±lan istek bulunamadÄ±.": "The request being filled could not be found.",
    "Sayfa ve konum Ã¶ÄŸe seÃ§iminden dolduruldu.": "Page and location were filled from the element picker.",
    "Sayfa, konum ve gÃ¶rÃ¼ntÃ¼ Ã¶ÄŸeden alÄ±ndÄ±.": "Page, location and screenshot were taken from the element.",
    "Sayfa ve konum dolduruldu; gÃ¶rÃ¼ntÃ¼ alÄ±namadÄ±.": "Page and location were filled, but the screenshot could not be captured.",
    "Sayfa ve konum dolduruldu; gÃ¶rÃ¼ntÃ¼ eklenemedi.": "Page and location were filled, but the screenshot could not be attached.",
    "Ekran gÃ¶rÃ¼ntÃ¼sÃ¼ isteÄŸe eklendi.": "Screenshot attached to the request.",
    "Ekran gÃ¶rÃ¼ntÃ¼sÃ¼ eklenemedi.": "The screenshot could not be attached.",
    "Eklenti baÄŸlantÄ±sÄ± kesildi. Ã–ÄŸe seÃ§ilemedi.": "The extension connection dropped. The element could not be picked.",
    "Eklenti baÄŸlantÄ±sÄ± kesildi. GÃ¶rÃ¼ntÃ¼ alÄ±namadÄ±.": "The extension connection dropped. The screenshot could not be captured.",
    "Eklenti baÄŸlantÄ±sÄ± kesildi. Ã–ÄŸe ve gÃ¶rÃ¼ntÃ¼ alÄ±namadÄ±.": "The extension connection dropped. The element and screenshot could not be captured.",
    "Ä°Ã§e aktarÄ±lan proje": "Imported project",
    "Eklenti baÄŸlantÄ±sÄ± kesildi. Kurulum adÄ±mlarÄ±nÄ± kontrol et.": "The extension connection dropped. Check the install steps.",
    "Ã–ÄŸe seÃ§ici": "Element picker",
    "Eklenti": "Extension",
    "Ã–ÄŸe seÃ§ici iÃ§in eklenti gerekli": "The element picker needs the extension",
    "CanlÄ± baÄŸlantÄ± kurulu deÄŸil. Ã–ÄŸe seÃ§iciyi kullanmak iÃ§in Request Ledger eklentisÄ±nÄ± kur ve bu sayfayÄ± yenile.": "The live link is not connected. Install the Request Ledger extension and reload this page to use the element picker.",
    "1. Paketi indir": "1. Download the package",
    "SÃ¼rÃ¼m sayfasÄ±ndan request-ledger-extension-*.zip dosyasÄ±nÄ± indir ve bir klasÃ¶re Ã§Ä±kar.": "Download request-ledger-extension-*.zip from the release page and extract it into a folder.",
    "2. GeliÅŸtirici modunu aÃ§": "2. Turn on Developer mode",
    "chrome://extensions adresini aÃ§ ve saÄŸ Ã¼stten GeliÅŸtirici moduâ€™nu etkinleÅŸtir.": "Open chrome://extensions and enable Developer mode in the top-right corner.",
    "3. Paketi yÃ¼kle": "3. Load the package",
    "PaketlenmemiÅŸ Ã¶ÄŸe yÃ¼kle ile Ã§Ä±kardÄ±ÄŸÄ±n extension klasÃ¶rÃ¼nÃ¼ seÃ§.": "Choose Load unpacked and select the extension folder you extracted.",
    "4. SayfayÄ± yenile": "4. Reload the page",
    "Bu sekmeyi yenile. BaÄŸlantÄ± kurulunca â€œÃ–ÄŸe seÃ§â€ yeniden etkinleÅŸir.": "Reload this tab. â€œPick elementâ€ becomes available again once the link is connected.",
    "Eklenti yokken defter, satÄ±rlar ve dÄ±ÅŸa aktarma Ã§alÄ±ÅŸmaya devam eder; yalnÄ±zca canlÄ± eÅŸitleme ve Ã¶ÄŸe seÃ§ici kullanÄ±lamaz.": "Without the extension, the ledger, rows and export keep working; only live sync and the element picker are unavailable.",
    "SÃ¼rÃ¼m sayfasÄ±": "Release page",
    "Request Ledgerâ€™a hoÅŸ geldin": "Welcome to Request Ledger",
    "Kurulum": "Setup",
    "UygulamayÄ± nasÄ±l kullanmak istediÄŸini seÃ§. SeÃ§im yalnÄ±zca bu tarayÄ±cÄ±da saklanÄ±r; sonradan Ayarlarâ€™dan yeniden aÃ§abilirsin.": "Choose how you want to use the app. The choice is stored in this browser only; you can reopen this screen from Settings.",
    "KullanÄ±m biÃ§imi": "How to use the app",
    "Tek HTML dosyasÄ±": "Single HTML file",
    "DosyayÄ± Ã§ift tÄ±klayarak aÃ§; kurulum ve sunucu gerekmez.": "Double-click the file to open it; no install and no server.",
    "Yerel sunucu (port)": "Local server (port)",
    "start.cmd sunucuyu arka planda aÃ§ar ve tarayÄ±cÄ±yÄ± hazÄ±rlar.": "start.cmd starts the server in the background and opens the browser.",
    "Kopyala": "Copy",
    "Sunucuyu aÃ§": "Open server",
    "TarayÄ±cÄ± eklentisÄ± yardÄ±mcÄ±sÄ±nÄ± etkinleÅŸtir": "Enable the browser extension companion",
    "AranÄ±yorâ€¦": "Checkingâ€¦",
    "NasÄ±l kurulur?": "How to install?",
    "Yetenek karÅŸÄ±laÅŸtÄ±rmasÄ±": "Capability comparison",
    "Yetenek": "Capability",
    "HTML dosyasÄ±": "HTML file",
    "Yerel sunucu": "Local server",
    "Ã‡evrimdÄ±ÅŸÄ±": "Offline",
    "DoÄŸrudan klasÃ¶re aktarÄ±m": "Direct folder export",
    "Eklenti kÃ¶prÃ¼sÃ¼": "Extension bridge",
    "Otomatik baÅŸlatma": "Auto-start",
    "TaÅŸÄ±nabilir dosya": "Portable file",
    "Konsol penceresi yok": "No console window",
    "Tek dosyayÄ± kopyalayÄ±p Ã§evrimdÄ±ÅŸÄ± aÃ§abilirsin. Yerel sunucu baÅŸlatamaz; eklenti kÃ¶prÃ¼sÃ¼ ve Ã¶ÄŸe seÃ§ici, eklentinÄ±n dosya URLâ€™lerine eriÅŸim izni olduÄŸunda Ã§alÄ±ÅŸÄ±r.": "You can copy the single file and open it offline. It cannot start a local server; the extension bridge and element picker work when the extension is allowed to access file URLs.",
    "Uygulama yerel bir adresten aÃ§Ä±lÄ±r; kÃ¶prÃ¼ ve Ã¶ÄŸe seÃ§ici Ã§alÄ±ÅŸÄ±r. Node.js gerekir ve sunucu uygulama kapanÄ±nca durur.": "The app opens from a local address; the bridge and element picker work. Node.js is required and the server stops when the app closes.",
    "BaktÄ±ÄŸÄ±n sayfadan baÄŸlam toplar ve metni canlÄ± eÅŸitler. GÃ¶rseller ve dosya ekleri yalnÄ±zca ZIP yedeÄŸiyle taÅŸÄ±nÄ±r.": "It captures context from the page you are looking at and syncs text live. Images and attachments still travel only with a backup ZIP.",
    "BaÅŸla": "Start",
    "KullanÄ±m biÃ§imini ve eklenti durumunu yeniden gÃ¶r.": "Review the usage mode and the extension status.",
    "Kurulumu aÃ§": "Open setup",
    "Tek dosya modundasÄ±n. Bu sayfa yerel sunucu baÅŸlatamaz; sunucu modu iÃ§in aÅŸaÄŸÄ±daki komutu Ã§alÄ±ÅŸtÄ±r.": "You are in single-file mode. This page cannot start a local server; run the command below for server mode.",
    "Yerel sunucu modundasÄ±n. Sekme aÃ§Ä±kken sunucu kapanmaz; sekme kapandÄ±ktan sonra en az 5 dakika bekler.": "You are in local server mode. The server stays up while the tab is open and waits at least 5 minutes after it closes.",
    "Yerel sunucu Ã§alÄ±ÅŸmÄ±yor. Sunucu modu iÃ§in start.cmd Ã§alÄ±ÅŸtÄ±r.": "The local server is not running. Run start.cmd for server mode.",
    "HTML dosyasÄ± yerel sunucu baÅŸlatamaz; komut yalnÄ±zca sunucu modu iÃ§indir.": "An HTML file cannot start a local server; the command is only for server mode.",
    "Yerel sunucu Ã§alÄ±ÅŸÄ±yor": "Local server is running",
    "Yerel sunucu kapalÄ±": "Local server stopped",
    "Eklenti yardÄ±mcÄ±sÄ± kapalÄ±.": "Extension companion is off.",
    "Bu sayfa kÃ¶prÃ¼ye izin vermiyor; eklentiyÄ± sunucu modunda dene.": "This page does not allow the bridge; try the extension in server mode.",
    "BaÄŸlÄ±": "Connected",
    "BulunamadÄ±": "Not detected",
    "Eklenti aranÄ±yorâ€¦": "Looking for the extensionâ€¦",
    "Eklenti kÃ¶prÃ¼sÃ¼ iÃ§in sunucu modu gerekir.": "The extension bridge needs server mode.",
    "Yerel sunucu bulunamadÄ±.": "Local server not found.",
    "Dosyadan baÅŸlatÄ±ldÄ±": "started from file",
    "Sunucu Ã§alÄ±ÅŸmÄ±yor.": "Server is not running.",
    "Dosya modunda sunucu yok. Sunucu iÃ§in start.cmd Ã§alÄ±ÅŸtÄ±r.": "There is no server in file mode. Run start.cmd for the server.",
    "0 = otomatik boÅŸ port.": "0 = automatic free port.",
    "Portu uygula": "Apply port",
    "Port 0 ile 65535 arasÄ±nda bir tam sayÄ± olmalÄ±.": "Port must be a whole number between 0 and 65535.",
    "Bu port zaten kullanÄ±mda.": "That port is already in use.",
    "Port kaydedildi.": "Port saved.",
    "Sunucu yeniden baÅŸlatÄ±lÄ±yor.": "Restarting the server.",
    "Sunucu yeniden baÅŸladÄ±; baÄŸlanÄ±lÄ±yor": "The server is back; connecting",
    "Sunucu yeniden baÅŸlatÄ±lamadÄ±.": "The server could not be restarted.",
    "Sunucu yeniden baÅŸlamadÄ±. start.cmd Ã§alÄ±ÅŸtÄ±r.": "The server did not come back. Run start.cmd.",
    "Sunucuyu yeniden baÅŸlat": "Restart server",
    "Port": "Port",
    "Komut kopyalandÄ±.": "Command copied.",
    "Komut kopyalanamadÄ±.": "Could not copy the command.",
    "Eklenti yardÄ±mcÄ±sÄ±": "Extension companion",
    "Eklenti sÃ¼rÃ¼mÃ¼ eski â€” eklentiyi gÃ¼ncelleyin.": "Extension build is outdated â€” update it.",
    "Yedek bÃ¶lÃ¼mÃ¼nden tam ZIP yedeÄŸi indir. Yedekler proje adÄ±, dil, ajanlar, defter kimliÄŸi ve talepleri iÃ§erir; gÃ¶rseller ve dosyalar da ZIP iÃ§inde taÅŸÄ±nÄ±r. Tema yedeÄŸe dahil deÄŸildir.": "Download a full ZIP backup from the Backup section. Backups include the project name, language, agents, ledger ID and requests; images and files travel inside the ZIP. Theme is not included.",
    "TÃ¼m projeler + talepler + KayÄ±tlar + gÃ¶rseller + dosya ekleri. Sunucu modunda backups/ klasÃ¶rÃ¼ne de yazÄ±lÄ±r.": "All projects + requests + Records + images + attachments. In server mode it is also written to the backups/ folder.",
    ".zip dosyasÄ± seÃ§. TÃ¼m projeler yedekteki verilerle deÄŸiÅŸtirilir.": "Choose a .zip file. Every project is replaced by the backup data.",
    "Sunucudaki yedekler": "Server backups",
    "En yeni Ã¶nce": "Newest first",
    "Silinen projeler": "Deleted projects",
    "Proje baÅŸÄ±na ZIP": "ZIP per project",
    "Sunucu modunda veriler projects/ klasÃ¶rÃ¼nde tutulur; yedekler backups/ altÄ±nda saklanÄ±r. TarayÄ±cÄ± verisi temizlenirse yalnÄ±zca yerel Ã¶nbellek kaybolur.": "In server mode data lives in the projects/ folder and backups are kept under backups/. Clearing browser data only removes the local cache.",
    "Hedef klasÃ¶r seÃ§iliyse indirilen yedek de oraya kaydedilir; aksi halde tarayÄ±cÄ± indirilenler klasÃ¶rÃ¼ne iner.": "When a target folder is selected the downloaded backup is saved there; otherwise it goes to the browser downloads folder.",
    "0 = otomatik boÅŸ port. Port deÄŸiÅŸikliÄŸi sunucuyu sessizce taÅŸÄ±r.": "0 = automatic free port. A port change moves the server silently.",
    "Port deÄŸiÅŸtirilemedi; sunucu Ã§alÄ±ÅŸmaya devam ediyor.": "The port could not be changed; the server is still running.",
    "Sunucu bu sayfayÄ± yerel adresten sunuyor. Sunucu, son sekme kapandÄ±ktan sonra kendiliÄŸinden durur.": "The server is hosting this page locally. It stops on its own after the last tab closes.",
    "Sunucu kapalÄ±. TarayÄ±cÄ± bir sÃ¼reÃ§ baÅŸlatamaz; yeniden aÃ§mak iÃ§in start.cmd Ã§alÄ±ÅŸtÄ±r.": "The server is off. A browser cannot start a process; run start.cmd to open it again.",
    "Sunucu Ã§alÄ±ÅŸmaya baÅŸlayÄ±nca bu sayfayÄ± yenile.": "Reload this page once the server is running.",
    "Yedek sunucuya yazÄ±lamadÄ±; indirilen dosyayÄ± sakla.": "The backup could not be written to the server; keep the downloaded file.",
    "Yedek oluÅŸturulamadÄ±; sÄ±fÄ±rlama iptal edildi.": "The backup could not be created; the reset was cancelled.",
    "TÃ¼m proje verileri sÄ±fÄ±rlandÄ±. Yedekler korundu.": "All project data was reset. Backups were kept.",
    "SÄ±fÄ±rlama tamamlanamadÄ±; hiÃ§bir ÅŸey silinmedi.": "The reset did not complete; nothing was deleted.",
    "HenÃ¼z sunucuda yedek yok. Tam yedek indirdiÄŸinde burada da saklanÄ±r.": "No server backup yet. A full backup is stored here when you download one.",
    "Silinen proje yedeÄŸi yok.": "No deleted-project backups.",
    "Geri yÃ¼kle": "Restore",
    "Silinen proje": "Deleted project",
    "Proje geri yÃ¼klensin mi?": "Restore this project?",
    "Bu proje arÅŸivden projects/ klasÃ¶rÃ¼ne geri yÃ¼klenecek ve proje listesine eklenecek:": "This project will be restored from the archive into the projects/ folder and added to the project list:",
    "Proje geri yÃ¼klenemedi.": "The project could not be restored.",
    "AynÄ± klasÃ¶r adÄ± dolu olduÄŸu iÃ§in proje ÅŸu adla geri yÃ¼klendi:": "The folder name was taken, so the project was restored as:",
    "Proje geri yÃ¼klendi.": "Project restored.",
    "Yedek silinsin mi?": "Delete this backup?",
    "Bu silinen proje arÅŸivi kalÄ±cÄ± olarak silinecek. Bu iÅŸlem geri alÄ±namaz.": "This deleted-project archive will be removed permanently. This cannot be undone.",
    "ArÅŸiv silinemedi.": "The archive could not be deleted.",
    "ArÅŸiv silindi.": "Archive deleted.",
    "Yedek okunamadÄ±.": "The backup could not be read.",
    "Proje diskten silinemedi; hiÃ§bir ÅŸey deÄŸiÅŸtirilmedi.": "The project could not be deleted from disk; nothing was changed.",
    "Proje silindi ve yedeÄŸi saklandÄ±.": "Project deleted and its backup kept.",
    "Proje silinsin mi?": "Delete this project?",
    "bu projedeki tÃ¼m talepler, gÃ¶rseller, kayÄ±tlar, taslaklar ve dÄ±ÅŸa aktarÄ±lanlar silinecek. Bu iÅŸlem geri alÄ±namaz. Silinen projeler bÃ¶lÃ¼mÃ¼nden geri yÃ¼klenebilmesi iÃ§in bir yedek saklamak ister misin?": "all requests, images, records, drafts and exports in this project will be deleted. This cannot be undone. Do you want to keep a backup so it can be restored from the deleted projects section?",
    "Yedekle ve sil": "Back up and delete",
    "Yedeksiz sil": "Delete without backup",
    "TÃ¼m proje verileri sÄ±fÄ±rlansÄ±n mÄ±?": "Reset all project data?",
    "BÃ¼tÃ¼n projeler, silinen proje yedekleri ve tarayÄ±cÄ± Ã¶nbelleÄŸi silinecek. Sunucudaki backups/ klasÃ¶rÃ¼ korunur. Ã–nce tam bir yedek alman Ã¶nerilir; geri yÃ¼kleme yalnÄ±zca bu yedeklerden yapÄ±labilir.": "Every project, deleted-project backup and browser cache will be deleted. The server's backups/ folder is kept. Taking a full backup first is recommended; restoring is only possible from those backups.",
    "SÄ±fÄ±rla": "Reset",
    "Yedek al ve sÄ±fÄ±rla": "Back up and reset",
    "Yedeksiz sÄ±fÄ±rla": "Reset without a backup",

    /* Toast copy used by the row, archive, backup and file-writing paths. */
    "Ã–nceki kayÄ±tlar okunamadÄ±. Yeni bir defterle devam ediliyor.": "The previous records could not be read. Continuing with a new ledger.",
    "KayÄ±t yapÄ±lamadÄ±. TarayÄ±cÄ± depolamasÄ±nÄ± kontrol et veya yedek al.": "The ledger could not be saved. Check browser storage or take a backup.",
    "Hedef klasÃ¶re kaydedilemedi; dosya indiriliyor.": "Could not save to the project folder; downloading the file instead.",
    "GÃ¶rsel eklemek iÃ§in tarayÄ±cÄ± depolamasÄ± kullanÄ±lamÄ±yor.": "Browser storage is unavailable for adding images.",
    "YalnÄ±zca gÃ¶rsel dosyalarÄ± eklenebilir.": "Only image files can be added.",
    "Dosya eki yalnÄ±zca TasarÄ±m tÃ¼rÃ¼nde kullanÄ±labilir.": "Attachments are only available for the Design type.",
    "Dosya eklemek iÃ§in tarayÄ±cÄ± depolamasÄ± kullanÄ±lamÄ±yor.": "Browser storage is unavailable for adding files.",
    "KayÄ±t tarayÄ±cÄ±da gÃ¼ncellendi.": "The record was updated in the browser.",
    "Kaydedilecek istek yok.": "There are no requests to save.",
    "Defterde temizlenecek istek yok.": "There are no requests to clear in the ledger.",
    "Bu kayÄ±tta yÃ¼klenecek istek yok.": "This record has no requests to load.",
    "Bu satÄ±r henÃ¼z hazÄ±r deÄŸil.": "This row is not ready yet.",
    "AÃ§Ä±lacak bir satÄ±r yok.": "There is no row to open.",
    "GÃ¶rsel bulunamadÄ±. Yedekten geri yÃ¼klemeyi deneyebilirsin.": "The image was not found. Try restoring from a backup.",
    "TÃ¼m talepler hazÄ±r. DÄ±ÅŸa aktarabilirsin.": "All requests are ready. You can export.",
    "Ã–nce en az bir istek ekle.": "Add at least one request first.",
    "DÄ±ÅŸa aktarma baÅŸarÄ±sÄ±z oldu.": "Export failed.",
    "Markdown oluÅŸturulamadÄ±.": "Markdown could not be created.",
    "Proje oluÅŸturulamadÄ±. TarayÄ±cÄ± depolamasÄ±nÄ± kontrol et.": "The project could not be created. Check browser storage.",
    "GÃ¶rsel depolamasÄ± kullanÄ±lamÄ±yor.": "Image storage is unavailable.",
    "Dosya depolamasÄ± kullanÄ±lamÄ±yor.": "File storage is unavailable.",
    "Ã–nce bir istek satÄ±rÄ± aÃ§Ä±n.": "Open a request row first.",
    "GÃ¶rseli bir satÄ±rÄ±n gÃ¶rsel alanÄ±na bÄ±rak.": "Drop the image on a row's image area.",
    "GÃ¶rseller ve dosyalar iÃ§in tarayÄ±cÄ± depolamasÄ± kullanÄ±lamÄ±yor. Metinler yine de kaydedilir.": "Browser storage is unavailable for images and files. Text is still saved."
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
