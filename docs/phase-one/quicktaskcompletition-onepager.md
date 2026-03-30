# Quick Task Completion — Feature Spec

> Status: Post-MVP (Phase One)  
> Last updated: March 2026  
> Parent doc: [DESIGN.md](../mvp/DESIGN.md)

---

## Overview

A floating action button (FAB) on the Feed screen gives members a fast path to submit a task completion without opening the Activities page first. The existing task completion page gains a **second entry mode**: either **locked** (activity + task fixed, today’s behavior) or **picker** (two dropdowns, then the same upload + submit flow).

---

## Note on activity participation

All members are enrolled in all activities by default. Dropdown 1 lists only activities where **this user** still has something they are allowed to submit: not all three tasks approved yet, and **no blocking pending submission** for that activity (see [DESIGN.md §7.4](../mvp/DESIGN.md) — one in-flight submission per user per activity). Activities with nothing left to do are omitted.

---

## FAB — Feed screen

A floating action button sits fixed at the bottom-right of the **Feed** view, above scrollable content (respect `safe-area-inset-bottom` on notched devices).

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
- Size: **56×56 dp**, circular, elevated with a subtle shadow (Material-style FAB).

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

### Legacy route (redirect)

MVP registers the completion page at:

`/group/:groupId/activity/:activityId/task/:taskId`

([DESIGN.md §6](../mvp/DESIGN.md) route table.)

When implementing this feature:

- Point **Activities** list links at the canonical URL with the same ids as search params.
- Keep **redirect** from the legacy path to  
  `/group/:groupId/complete?activityId=...&taskId=...`  
  so bookmarks and shared links keep working.

**Implementation detail:** `TaskCompletePage` today lives **outside** the `GroupLayout` nested routes ([App.jsx](../../src/App.jsx)); add `/group/:groupId/complete` alongside it with the same shell/header pattern unless you intentionally move it.

When shipped, update the **Complete a Task** row in DESIGN.md §6 to describe the canonical URL and mention the legacy redirect.

---

## Updated task completion page

Two modes, chosen from the URL.

### Mode A — From Activities (locked)

When both `activityId` and `taskId` search params are present **and** valid for this user:

- Resolve activity + task; if invalid or user cannot submit that task, show the same gate / error patterns as today (not found, not a member, already completed, blocked by pending, etc.).
- Show **read-only** activity + task fields (no chevrons — muted “summary” styling is fine).
- Show the **upload form immediately** (image required, description optional, submit for review) — same as MVP.

### Mode B — From Feed FAB (picker)

When **either** search param is missing:

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
- Sort: **alphabetical** by activity name.
- Placeholder: `Select activity`.

### Dropdown 2 — Task

- Disabled until Dropdown 1 has a selection.
- Options = tasks for that activity that are **not** approved yet.
- **Excludes** tasks that are **pending** for that activity (only one pending per activity; the pending row always corresponds to one task).
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

## Edge case — no eligible activities

If the user has no activities they can still submit to, **hide the FAB**. If they open `/group/:groupId/complete` anyway (direct URL), show:

```
You have no remaining tasks to submit.
All your activities are complete or pending review.
```

---

## Implementation checklist

- [ ] Add FAB on Feed only; fixed bottom-right; hide when no eligible activities
- [ ] Register `/group/:groupId/complete`; read `activityId` + `taskId` from **`useSearchParams`** (query string)
- [ ] Redirect legacy `/group/:groupId/activity/:activityId/task/:taskId` → canonical URL with query
- [ ] Point Activities **Complete** links at `/group/:groupId/complete?...`
- [ ] Picker: Activity dropdown (filters: not fully approved, no pending for activity)
- [ ] Picker: Task dropdown (depends on activity; exclude approved + pending task)
- [ ] Reset task + hide form when activity changes
- [ ] Locked mode: read-only activity/task + show form when params valid
- [ ] Empty state when picker has no eligible activities
- [ ] Update DESIGN.md §6 route row after ship

---

## Rejected alternatives

| Approach | Why rejected |
| --- | --- |
| Bottom-left FAB | Convention and muscle memory favor bottom-right on mobile. |
| Pre-fill FAB from “last used” activity | Unpredictable; users often switch activities. |
| Single combined activity+task control | Too long to scan; two steps are clearer. |
| List completed activities | No actionable submit path; noise in the menu. |
