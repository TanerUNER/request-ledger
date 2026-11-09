/*
  Internationalisation: the English dictionary, the ordered Turkish pattern rules and the
  language state.

  Ported verbatim from the previous monolithic core (v1.9.1). translate() returns Turkish
  input unchanged, otherwise it looks the trimmed string up in TRANSLATIONS_EN and then
  applies translatePattern() in order. Language defaults to English.
*/

export const TRANSLATIONS_EN = {
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

export let currentLanguage = "en";

export function normalizeLang(lang){
  return lang === "tr" ? "tr" : "en";
}
export function setLanguage(lang){
  currentLanguage = normalizeLang(lang);
  return currentLanguage;
}
export function getLanguage(){
  return currentLanguage;
}
export function trLower(value){
  return String(value == null ? "" : value).toLocaleLowerCase("tr");
}
export function countLabel(n, lang, forms){
  const options = forms || {};
  const one = options.one == null ? "" : options.one;
  const many = options.many == null ? one : options.many;
  return n + " " + (n === 1 ? one : many);
}
export function formatDateLong(value, lang){
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
export function translate(value, lang){
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
