# Nova Dashboard — Development Requests

> Sunday, November 08, 2026 · 6 requests · 4 images · 1 file

## Planning

**Agents to Invoke:**

| Role | MD File Path |
|---|---|
| Frontend | agents/frontend.md |
| QA Tester | agents/qa.md |

**Test option:** Light run

If errors are found after testing, run tests only on the affected files and areas after fixes. Once all fixes are complete, perform one full run. If the full run still fails, repeat the loop. (Coding > Test > No Error > Full Test > Error > Fix the error > Test the error > No Error > Full Test)

**Runtime Package:** Create the runtime package, upload it to gofile.io, and send me the link.

**Question - Suggestion request:** Start the tasks without asking questions or making suggestions.

**Note:** Keep the sample attachment in the ZIP output.

## IST-001 — Add bulk actions toolbar to the orders table

- **Type:** New Feature
- **Priority:** High
- **Status:** Ready
- **Created:** 06.11.2026 09:15

### Request

Let users change status, export CSV and apply tags to the selected orders from one toolbar.
Toolbar stays visible while the table scrolls.

### Images

![IST-001 · Image 1](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==)

![IST-001 · Image 2](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==)

### Additional Note

Design reference: bulk actions.png

---

## IST-002 — Move the status filter into the table header

- **Type:** Update
- **Page:** /orders
- **Location on Page:** Filter bar above the table
- **Priority:** Normal
- **Status:** Ready
- **Created:** 06.11.2026 10:20

### Request

The filter currently sits above the table and wraps on narrow screens.

### Related Link

https://example.com/orders

---

## IST-003 — Remove the legacy CSV import button

- **Type:** Removal
- **Page:** /orders/import
- **Location on Page:** Top right action group
- **Priority:** Low
- **Status:** Ready
- **Created:** 06.11.2026 11:05

### Request

Nobody uses it and it produces malformed rows.

### Related Link

https://example.com/orders/import

---

## IST-004 — Unify empty states across the dashboard

- **Type:** Design / Content
- **Page:** /dashboard
- **Location on Page:** Empty state blocks
- **Priority:** Normal
- **Status:** Ready
- **Created:** 06.11.2026 12:30

### Request

Empty lists use three different illustrations and two different tone of voice.

### Images

![IST-004 · Image 1](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==)

### Example File

- empty-state-sample.html (attachment; included in ZIP output)

### Example Website

https://example.com/dashboard

### Related Link

https://example.com/design/empty-states

---

## IST-005 — Should archived orders stay searchable?

- **Type:** Question
- **Page:** /orders/archived
- **Location on Page:** Search input
- **Priority:** Normal
- **Status:** Ready
- **Created:** 06.11.2026 13:10

### Request

Archived orders disappear from search results. Is that intentional?

### Related Link

https://example.com/orders/archived

---

## IST-006 — Long user names overflow the header menu

- **Type:** Bug
- **Page:** /dashboard
- **Location on Page:** Header > user menu
- **Priority:** Critical
- **Status:** Ready
- **Created:** 06.11.2026 14:45

### Console Error or Page Error

Uncaught TypeError: Cannot read properties of null (reading 'offsetWidth')


### Request

A 40-character name pushes the logout item outside the menu on 1280px screens.

### Images

![IST-006 · Image 1](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==)

### Related Link

https://example.com/dashboard

---

_Nova Dashboard · Request Ledger · 08.11.2026 00:00_
