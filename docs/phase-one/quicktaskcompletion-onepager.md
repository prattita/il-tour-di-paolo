# Quick Task Completion — Feature Spec

> Status: Post-MVP (Phase One)  
> Last updated: March 2026  
> Parent doc: [DESIGN.md](../mvp/DESIGN.md)

---

## Overview

A floating action button (FAB) on the Feed screen gives members a fast path to submit a task completion without opening the Activities page first. The existing task completion page gains a **second entry mode**: either **locked** (activity + task fixed, today’s behavior) or **picker** (two dropdowns, then the same upload + submit flow).

**Scope:** No new Firestore collections; reuse `members` progress, activity definitions, and `pending/{userId}_{activityId}` existence — same inputs as the Activities list ([DESIGN.md §5](../mvp/DESIGN.md), [§7.4](../mvp/DESIGN.md)).

---

## Alignment with DESIGN.md

| Topic | Where in DESIGN | How this feature follows it |
| --- | --- | --- |
| Task completion shell | §6.1 — focused top bar with **Back**, **not** the group drawer/sidebar | Register **`/group/:groupId/complete`** as a **sibling** route to `GroupLayout` in `App.jsx` (same as today’s task URL), not nested under `/group/:groupId/*` children. |
| One pending per user per activity | §7.4, §5 `pending` id | Dropdown 1 excludes activities where this user already has a pending doc; task dropdown excludes the task currently held in that pending doc. |
| Withdraw | Phase 9 / §7.5 | After withdraw, the activity becomes eligible again — same as Activities list. |
| Route table | §6 | After ship, update the **Complete a Task** row to the canonical URL + legacy redirect note. |

---

## Note on activity participation

**Today (MVP):** Every member is treated as enrolled in all activities for completion purposes; Group Info does not yet expose `selectedActivityIds` join UI ([DESIGN.md §6.2](../mvp/DESIGN.md)).

**Fast-follow (`selectedActivityIds` on `members/{uid}`):** When that ships, Dropdown 1 must list only activities the member **participates** in — same rule as Activities: `null` / missing ⇒ all activities; non-empty array ⇒ only those ids; `[]` ⇒ no participating activities (FAB hidden; direct URL shows the empty state).

Until then, the implementation can assume “all activities” and still call a small helper (e.g. `memberParticipatesInActivity(member, activityId)`) so the rule lives in one place when selection UI lands.

---

## FAB — Feed screen

A floating action button sits fixed at the bottom-right of the **Feed** view, above scrollable content (respect `safe-area-inset-bottom` on notched devices). Ensure the FAB sits **above** the scrollable feed (z-index) so it does not scroll away.

```
┌─────────────────────────┐
│  feed posts...          │
│                         │
│                         │
│                    [+]  │  ← FAB, fixed bottom-right
└─────────────────────────┘
```

- Tap → navigate to the task completion URL **without** `activityId` / `taskId` search params (picker mode).
- Shown **only** on the Feed route (`/group/:groupId/feed`).
- Size: **56×56 CSS px** (e.g. Tailwind `h-14 w-14`), circular, elevated with a subtle shadow; primary fill should match the app accent ([DESIGN.md §13](../mvp/DESIGN.md) — green `#1D9E75` / `@theme` tokens).
- **Accessibility:** `aria-label` such as “Complete a task” (or equivalent Italian copy if the UI is localized later).

### FAB visibility

- **Show** when the current user has **at least one eligible activity** (same definition as Dropdown 1: incomplete work allowed, not blocked by pending).
- **Hide** when they have **no** eligible activities (everything done or waiting on approval for every activity that still has open tasks).

The **owner’s approval queue** (empty vs non-empty) does **not** affect FAB visibility — only the **submitter’s** eligibility matters.

---

## Task completion URL (canonical + legacy)

**Canonical path** (single page, two modes):

```
/group/:groupId/complete
```

**Activities flow (locked mode)** — pass **URL search params** (query string), not path segments:

```
/group/:groupId/complete?activityId=<activityDocId>&taskId=<taskDocId>
```

**Feed FAB (picker mode)** — no search params:

```
/group/:groupId/complete
```

### Routing implementation (`App.jsx`)

`TaskCompletePage` must remain **outside** `GroupLayout` ([DESIGN.md §6.1](../mvp/DESIGN.md) — focused header, not burger shell). Add:

```text
/group/:groupId/complete → same element/wrapper as legacy task route
```

Do **not** nest `complete` under the `/group/:groupId` route that renders `GroupLayout`.

### Legacy route (redirect)

MVP registers the completion page at:

`/group/:groupId/activity/:activityId/task/:taskId`

([DESIGN.md §6](../mvp/DESIGN.md) route table.)

When implementing this feature:

- Point **Activities** list links at the canonical URL with the same ids as search params.
- Keep a **redirect** from the legacy path to  
  `/group/:groupId/complete?activityId=...&taskId=...`  
  so bookmarks and shared links keep working.

When shipped, update the **Complete a Task** row in DESIGN.md §6 to describe the canonical URL and mention the legacy redirect.

---

## Updated task completion page

Two modes, chosen from the URL and param validity.

### Mode A — From Activities (locked)

When **both** `activityId` and `taskId` search params are present, each **parses to a non-empty string**, and both resolve to a valid activity + task **for this group**:

- If invalid or the user cannot submit that task, show the same gate / error patterns as today (not found, not a member, already completed, blocked by pending, etc.).
- Show **read-only** activity + task fields (no chevrons — muted “summary” styling is fine).
- Show the **upload form immediately** (image required, description optional, submit for review) — same as MVP.

### Mode B — From Feed FAB (picker)

Use picker mode when:

- Neither query param is present, **or**
- **Malformed query:** only one of `activityId` or `taskId` is present — do **not** partially lock; treat as picker (empty or partially filled dropdowns). Optionally `replace` the URL to `/group/:groupId/complete` to drop orphan params.

Then:

- Show **Dropdown 1 — Activity** and **Dropdown 2 — Task** as below.
- Upload form stays **hidden** until both selections are valid.

```
┌─────────────────────────┐
│ ←   Complete a task     │
├─────────────────────────┤
│ Activity                │
│ ┌─────────────────────┐ │
│ │ Select activity  ▼  │ │  ← dropdown 1
│ └─────────────────────┘ │
│                         │
│ Task                    │
│ ┌─────────────────────┐ │
│ │ Select task      ▼  │ │  ← dropdown 2, disabled until activity chosen
│ └─────────────────────┘ │
│                         │
│  [upload form hidden    │
│   until both selected]  │
└─────────────────────────┘
```

After both are chosen, the form below matches MVP (image, description, submit).

---

## Dropdown rules

### Dropdown 1 — Activity

- Includes activities where the user has **not** had all three tasks **approved** yet.
- **Excludes** activities where all three tasks are already approved.
- **Excludes** activities where this user already has a **pending** submission (same rule as Activities UI — [DESIGN.md §7.4](../mvp/DESIGN.md)).
- When `selectedActivityIds` is active: intersect with the member’s participating activities (see **Note on activity participation**).
- Sort: **alphabetical** by activity name.
- Placeholder: `Select activity`.

### Dropdown 2 — Task

- Disabled until Dropdown 1 has a selection.
- Options = tasks for that activity that are **not** approved yet.
- **Excludes** the task currently in **pending** for that activity (only one pending per activity; the pending row always corresponds to one task).
- Sort: **task order** (1 → 2 → 3).
- Placeholder: `Select task` (disabled styling until activity chosen).

### Dependency rule

Changing Dropdown 1 **clears** Dropdown 2 and **hides** the upload form until a new task is selected.

### Eligibility data

Use the **same inputs** as the Activities page: current user’s `members/{uid}.progress`, activity definitions, and whether a `pending/{userId}_{activityId}` doc exists. No new Firestore collections; optional `getDoc` / listener on **this user’s** pending docs per activity (same as today’s gating).

---

## Page states summary

| State | Activity | Task | Upload form |
| --- | --- | --- | --- |
| Picker, nothing selected | Interactive, empty | Disabled | Hidden |
| Picker, activity only | Interactive, filled | Interactive, empty | Hidden |
| Picker, both selected | Interactive, filled | Interactive, filled | Visible |
| Locked (Activities entry) | Read-only, filled | Read-only, filled | Visible immediately |

---

## Navigation and back

- Back uses normal **history** (`navigate(-1)` or router back): Feed → FAB → complete → back returns to Feed; Activities → complete → back returns to Activities.
- Do **not** hardcode a single parent path; the stack handles it.

---

## Edge cases

### No eligible activities

If the user has no activities they can still submit to, **hide the FAB**. If they open `/group/:groupId/complete` anyway (direct URL), show:

```text
You have no remaining tasks to submit.
All your activities are complete or pending review.
```

### Group has no activities yet

Same as above from the member’s perspective (nothing to select). If you want clearer copy for owners (`activityCount === 0`), optional follow-up: one line such as “Activities will appear here once the group owner adds them” — not required for v1 if this edge is rare.

---

## Implementation checklist

- [x] Add FAB on Feed only; fixed bottom-right; `safe-area-inset-bottom`; z-index above feed; hide when no eligible activities
- [x] `aria-label` on FAB
- [x] Register `/group/:groupId/complete` **outside** `GroupLayout`; read `activityId` + `taskId` from **`useSearchParams`**
- [x] Malformed query (only one param) → picker mode; optional URL `replace` to strip orphans
- [x] Redirect legacy `/group/:groupId/activity/:activityId/task/:taskId` → canonical URL with query
- [x] Point Activities **Complete** links at `/group/:groupId/complete?...`
- [x] Picker: Activity dropdown (filters: not fully approved, no pending for activity; future: `selectedActivityIds`)
- [x] Picker: Task dropdown (depends on activity; exclude approved + pending task)
- [x] Reset task + hide form when activity changes
- [x] Locked mode: read-only activity/task + show form when params valid
- [x] Empty state when picker has no eligible activities
- [x] Update DESIGN.md §6 route row after ship

---

## Rejected alternatives

| Approach | Why rejected |
| --- | --- |
| Bottom-left FAB | Convention and muscle memory favor bottom-right on mobile. |
| Pre-fill FAB from “last used” activity | Unpredictable; users often switch activities. |
| Single combined activity+task control | Too long to scan; two steps are clearer. |
| List completed activities | No actionable submit path; noise in the menu. |
| Nest `/complete` under `GroupLayout` | Would show drawer/sidebar; contradicts DESIGN §6.1 focused completion flow. |

---

## Rename note

This spec previously lived at `quicktaskcompletition-onepager.md` (typo). Use **`quicktaskcompletion-onepager.md`** as the canonical filename.
