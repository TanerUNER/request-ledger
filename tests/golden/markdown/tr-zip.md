# Nova Dashboard — Geliştirme İstekleri

> 08 Kasım 2026 Pazar · 6 talep · 4 görsel · 1 dosya

> **Sıkıştırılmış Dosya:** nova-dashboard.zip

## Özet

| # | Tür | Başlık | Öncelik |
|---|---|---|---|
| IST-001 | Yeni Özellik | Add bulk actions toolbar to the orders table | Yüksek |
| IST-002 | Güncelleme | Move the status filter into the table header | Normal |
| IST-003 | Kaldırma | Remove the legacy CSV import button | Düşük |
| IST-004 | Tasarım / İçerik | Unify empty states across the dashboard | Normal |
| IST-005 | Soru | Should archived orders stay searchable? | Normal |
| IST-006 | Hata | Long user names overflow the header menu | Kritik |

## Planlama

**Koşu türü:** Tam koşu

Seçilen ajanlar (varsa) verilen isteklerin yerine getirilmesi için kullanılabilir. Yapılan işlemler sonrası için yapılacak testler Tam koşu yapılabilir. Yapılan testlerde hata alındığında ilgili ajanlar fix işlemlerini yerine getirebilir sonrasında tekrar tam koşu testi yapılabilir. Testlerin tekrarında herhangi bir kısıtlama yoktur.

**Çağrılacak Ajanlar:**

| Görev | MD Dosyası Yolu |
|---|---|
| Team Leader | agents/team-leader.md |
| Frontend | agents/frontend.md |
| QA Tester | agents/qa.md |

**Runtime Paketi:** Runtime paketi oluştur ve sunucuma gönder.

**Soru - Öneri isteği:** İsteklerin yerine getirilmesinden önce istekler ile ilgili soruların veya öneri yapmak istediğin kısımlar var ise görevlere başlamadan önce ilet.

## IST-001 — Add bulk actions toolbar to the orders table

- **Tür:** Yeni Özellik
- **Öncelik:** Yüksek
- **Durum:** Hazır
- **Eklenme:** 06.11.2026 09:15

### Talep

Let users change status, export CSV and apply tags to the selected orders from one toolbar.
Toolbar stays visible while the table scrolls.

### Görseller

![IST-001 · Görsel 1](gorseller/ist-001-1.png)

![IST-001 · Görsel 2](gorseller/ist-001-2.png)

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

![IST-004 · Görsel 1](gorseller/ist-004-1.png)

### Örnek Dosya

- [empty-state-sample.html](dosyalar/ist-004-1-empty-state-sample.html)

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

![IST-006 · Görsel 1](gorseller/ist-006-1.png)

### İlgili Bağlantı

https://example.com/dashboard

---

_Nova Dashboard · İstek Defteri · 08.11.2026 00:00_
