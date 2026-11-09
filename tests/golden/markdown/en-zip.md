# Nova Dashboard — Development Requests

> Sunday, November 08, 2026 · 6 requests · 4 images · 1 file

> **Compressed File:** nova-dashboard.zip

## Summary

| # | Type | Title | Priority |
|---|---|---|---|
| IST-001 | New Feature | Add bulk actions toolbar to the orders table | High |
| IST-002 | Update | Move the status filter into the table header | Normal |
| IST-003 | Removal | Remove the legacy CSV import button | Low |
| IST-004 | Design / Content | Unify empty states across the dashboard | Normal |
| IST-005 | Question | Should archived orders stay searchable? | Normal |
| IST-006 | Bug | Long user names overflow the header menu | Critical |

## Planning

**Run type:** Full run

Selected agents, if any, can be used to fulfill the requested items. Full test runs can be performed after the work is completed. If errors are found, the relevant agents can apply fixes and then run the full test suite again. There is no limit on test repetitions.

**Agents to Invoke:**

| Role | MD File Path |
|---|---|
| Team Leader | agents/team-leader.md |
| Frontend | agents/frontend.md |
| QA Tester | agents/qa.md |

**Runtime Package:** Create the runtime package and send it to my server.

**Question - Suggestion request:** Before starting the tasks, ask any questions or share any suggestions about the requests.

## IST-001 — Add bulk actions toolbar to the orders table

- **Type:** New Feature
- **Priority:** High
- **Status:** Ready
- **Created:** 06.11.2026 09:15

### Request

Let users change status, export CSV and apply tags to the selected orders from one toolbar.
Toolbar stays visible while the table scrolls.

### Images

![IST-001 · Image 1](gorseller/ist-001-1.png)

![IST-001 · Image 2](gorseller/ist-001-2.png)

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

![IST-004 · Image 1](gorseller/ist-004-1.png)

### Example File

- [empty-state-sample.html](dosyalar/ist-004-1-empty-state-sample.html)

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

![IST-006 · Image 1](gorseller/ist-006-1.png)

### Related Link

https://example.com/dashboard

---

_Nova Dashboard · Request Ledger · 08.11.2026 00:00_
