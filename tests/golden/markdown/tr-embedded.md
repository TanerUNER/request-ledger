# Nova Dashboard — Geliştirme İstekleri

> 08 Kasım 2026 Pazar · 6 talep · 4 görsel · 1 dosya

## Planlama

**Çağrılacak Ajanlar:**

| Görev | MD Dosyası Yolu |
|---|---|
| Frontend | agents/frontend.md |
| QA Tester | agents/qa.md |

**Test imkanı:** Hafif koşu

Testler sonrası hata dönüyorsa fix işlemlerinden sonra sadece ilgili dosyalarda ve hata alınan bölümlerde test işlemi yapılacak. Bütün fixler gerçekleştirildikten sonra bir kez tam koşu yapılır. Tam koşu sonucunda yine hata alınırsa döngü devam eder. (Kodlama > Test > Hata Yok > Full Test > Hata > İlgili hata için fix > İlgili hata için Test > Hata yok > Full Test)

**Runtime Paketi:** Runtime paketi oluştur ve gofile.io sitesine upload et, linki bana yaz.

**Soru - Öneri isteği:** Soru veya öneri sunmadan görevlere başla.

**Not:** Keep the sample attachment in the ZIP output.

## IST-001 — Add bulk actions toolbar to the orders table

- **Tür:** Yeni Özellik
- **Öncelik:** Yüksek
- **Durum:** Hazır
- **Eklenme:** 06.11.2026 09:15

### Talep

Let users change status, export CSV and apply tags to the selected orders from one toolbar.
Toolbar stays visible while the table scrolls.

### Görseller

![IST-001 · Görsel 1](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==)

![IST-001 · Görsel 2](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==)

### Ek Not

Design reference: bulk actions.png

---

## IST-002 — Move the status filter into the table header

- **Tür:** Güncelleme
- **Sayfa:** /orders
- **Sayfadaki Konum:** Filter bar above the table
- **Öncelik:** Normal
- **Durum:** Hazır
- **Eklenme:** 06.11.2026 10:20

### Talep

The filter currently sits above the table and wraps on narrow screens.

### İlgili Bağlantı

https://example.com/orders

---

## IST-003 — Remove the legacy CSV import button

- **Tür:** Kaldırma
- **Sayfa:** /orders/import
- **Sayfadaki Konum:** Top right action group
- **Öncelik:** Düşük
- **Durum:** Hazır
- **Eklenme:** 06.11.2026 11:05

### Talep

Nobody uses it and it produces malformed rows.

### İlgili Bağlantı

https://example.com/orders/import

---

## IST-004 — Unify empty states across the dashboard

- **Tür:** Tasarım / İçerik
- **Sayfa:** /dashboard
- **Sayfadaki Konum:** Empty state blocks
- **Öncelik:** Normal
- **Durum:** Hazır
- **Eklenme:** 06.11.2026 12:30

### Talep

Empty lists use three different illustrations and two different tone of voice.

### Görseller

![IST-004 · Görsel 1](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==)

### Örnek Dosya

- empty-state-sample.html (dosya eki; ZIP çıktısında taşınır)

### Örnek Web Sitesi

https://example.com/dashboard

### İlgili Bağlantı

https://example.com/design/empty-states

---

## IST-005 — Should archived orders stay searchable?

- **Tür:** Soru
- **Sayfa:** /orders/archived
- **Sayfadaki Konum:** Search input
- **Öncelik:** Normal
- **Durum:** Hazır
- **Eklenme:** 06.11.2026 13:10

### Talep

Archived orders disappear from search results. Is that intentional?

### İlgili Bağlantı

https://example.com/orders/archived

---

## IST-006 — Long user names overflow the header menu

- **Tür:** Hata
- **Sayfa:** /dashboard
- **Sayfadaki Konum:** Header > user menu
- **Öncelik:** Kritik
- **Durum:** Hazır
- **Eklenme:** 06.11.2026 14:45

### Console Hatası veya Sayfa Hatası

Uncaught TypeError: Cannot read properties of null (reading 'offsetWidth')


### Talep

A 40-character name pushes the logout item outside the menu on 1280px screens.

### Görseller

![IST-006 · Görsel 1](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==)

### İlgili Bağlantı

https://example.com/dashboard

---

_Nova Dashboard · İstek Defteri · 08.11.2026 00:00_
