# Compound Tasks — Feature Spec

> Status: Phase Three — **shipped in repo** (April 2026)  
> Last updated: April 2026  
> Parent doc: [DESIGN.md](../mvp/DESIGN.md)

---

## Overview

Today every task is **simple**: one photo submission, owner approves once, task counts toward medals.

A **compound task** is still **one task slot** in the activity’s three tasks, but the member first **tracks progress** with a trust-based counter (**`x` of `y`**) before the usual **Complete → photo → pending → approve** flow runs **once** at the end.

| | Simple task | Compound task |
| --- | --- | --- |
| Complete enabled when | Eligible per existing rules (`x` N/A) | `x === y` **and** same eligibility as simple (including activity-level pending) |
| Owner approval | One round per completion | **One** round when member submits at `y/y` |
| Counter | — | `+` / `-` between **0** and **`y`** |

**Principles (decided in design discussion):**

- Family **trust** — counter is bookkeeping, not proof per visit.
- **Scope**: one approval at the end; **no** per-increment photos or approvals.
- **Reject / withdraw**: **do not reset** `x`; member resubmits without re-tapping `y` times.
- **Edit (middle ground)**: owner may change simple ↔ compound and **`y`** only while the activity is **unlocked** and **that task** has never been in play (no approval, no pending, no non-zero count for that `taskId`). After **`isLocked`**, only **name/description** may change on tasks (same as DESIGN) — **not** compound mode or **`y`**.

---

## UX — Activities list (current user)

- Compound rows **look like** simple rows (name, description, status dots) with a **`- x / y +`** control beside the **Complete** pill (tap targets ≥ 44px where practical).
- **`y`** comes from the activity definition (set at create/edit when allowed).
- **Complete** is **disabled** unless:
  1. `x === y`,
  2. existing rules allow completion (**not** approved yet, not blocked by “another task in this activity pending” for **Complete** — same as today),
  3. for this compound row: **not** showing **pending** for this `taskId` (while that submission is pending, **freeze** `+`/`-` for **this** task only).
- **`+` / `-`**:
  - Always respect **0 ≤ x ≤ y**.
  - **Allowed** while **another** task in the same activity has a pending submission (member can keep logging visits).
  - **Disabled** when this task is **approved**, or when **this task** is **pending** (submission in flight), or when the row is otherwise not editable (e.g. activity-level blocked states that you already use for simple tasks — keep behavior consistent with `getTaskStatus` / eligibility helpers).

**Optional copy** (e.g. subtitle or hint): short line such as “Track times, then submit once when done” — localize when i18n covers this screen.

**Feed FAB / quick complete** ([quicktaskcompletion-onepager.md](../phase-one/quicktaskcompletion-onepager.md)): compound tasks appear in pickers like today; **Complete** only if `x === y` and other eligibility holds. If the completion UI is shared, reuse the same gating logic as the Activities page.

**Group Info / collapsible tasks**: show task name (and description); optional display **`y`** for compound tasks (e.g. “10 times”) so the roster understands the bar — product choice, not blocking.

---

## Create & edit activity (owner)

### Create (new activity or add activity)

- Each of the **three** tasks:
  - **Type**: **Simple** (default) or **Compound**.
  - **Compound** exposes integer **`y`** with UI bounds (recommend **1–100** or **1–50** — pick one constant in implementation and document here when fixed).
- **Backward compatibility**: activities created before this feature have no `kind` / `targetCount` → treat as **simple**.

### Edit

| Condition | Owner may change simple ↔ compound or `y`? |
| --- | --- |
| `isLocked === true` | **No** — compound mode and `y` are **structure**, frozen with the rest of task shape (only **name/description** per DESIGN). |
| `isLocked === false` **and** this `taskId` has **never** been in play | **Yes** — see below. |
| Any **approved** completion for this `taskId`, or **pending** submission for this `taskId`, or any member has **`x > 0`** for this `taskId` | **No** |

**Never in play** means:

- `taskId` ∉ any member’s `completedTaskIds` for this activity, **and**
- no `pending` doc for this group with `activityId` + `taskId` pointing at this task (queue empty for this task), **and**
- no member has `compoundCounts[taskId] > 0` (if the field is absent, treat as 0).

**Transitions:**

- **Simple → compound**: all members implicitly start at **`x = 0`** for that `taskId`.
- **Compound → simple**: only when allowed above; no counts to lose.
- **Change `y`**: only in the same window; **no** resizing after anyone has started (avoids clamp/reset rules in v1).

---

## Data model

### `groups/{groupId}/activities/{activityId}` — `tasks[]`

Extend each task object (keep **exactly three** tasks):

```javascript
{
  id: string,
  name: string,
  description: string | null,
  // NEW — omit for legacy docs = simple task
  kind: 'simple' | 'compound',   // default 'simple' when missing
  targetCount: number | null      // required integer y when kind === 'compound'; null or omit when simple
}
```

**Validation (client + rules where feasible):** `kind === 'compound'` ⇒ `targetCount` is integer in allowed range; `kind === 'simple'` ⇒ no `targetCount` or null.

**Medal condition strings** can stay the auto-generated 1/2/3 copy from DESIGN, or add a footnote in UI that one of the three may be “multi-step” — optional polish.

### `groups/{groupId}/members/{userId}` — compound counts

**Implementation:** Counts live in a **top-level** `compoundProgress` map (not under `progress[activityId]`) so approval transactions can replace `progress.{activityId}` without wiping counters, and rules stay simple:

```javascript
compoundProgress: {
  [activityId]: {
    [taskId: string]: number   // x; omit keys for 0
  }
}
```

- **Simple tasks** need no entry.
- **Approve** still only updates `progress` / medals; counters are not cleared (row shows **approved**).
- **Client** enforces `0 ≤ x ≤ y` via `runTransaction` in `adjustMemberCompoundCount`; rules allow self-updates that **only** touch `compoundProgress` (family trust tier).

*(Spec originally nested under `progress[activityId].compoundCounts`; approval now uses `{ ...prev, tasksCompleted, completedTaskIds }` so nested counts would be preserved if you migrate.)*

---

## Pending, approve, reject, withdraw

- **Submit**: same as today — `pendingId = {userId}_{activityId}`, one pending per user per activity. **Compound** submissions only allowed when client enforces `x === y` (and server/rules reject pending create if compound task not satisfied — see rules note below).
- **Reject / withdraw**: delete pending + storage as today; **do not** decrement `compoundProgress` for that task — member stays at **`x === y`** and can submit again.
- **Approve**: unchanged medal/feed/progress logic for “one task completed”; feed post is still one card for that task (optionally include “× y” in title/description for clarity — product choice).

---

## Security rules (sketch)

**Goal:** members cannot forge progress or inflate counts beyond **`y`**; cannot edit others’ `compoundCounts`; cannot edit `completedTaskIds` / `tasksCompleted` except owner on approval path (existing rule).

**Approach:**

1. **`members/{memberId}` `update`**: allow the **owner** full existing update paths unchanged.
2. **Member self-update**: allow **only** changes to `progress.{activityId}.compoundCounts` when:
   - `request.auth.uid === memberId`,
   - caller is in `group.memberIds`,
   - `diff` touches **only** that map (or only that activity’s `compoundCounts` — exact diff strategy must match how the client patches),
   - for each updated `taskId`, activity doc’s task with that `id` has `kind === 'compound'` and `value >= 0 && value <= targetCount`,
   - **no** change to `tasksCompleted`, `completedTaskIds`, or other progress fields in the same update (strict separation).

**Pending `create` for compound tasks:** Prefer validating in rules that if `request.resource.data.taskId` refers to a compound task, the member doc’s `compoundCounts[taskId] == targetCount` (requires `get` on `members/{uid}` + `get` on `activities/{activityId}`). If rules become too heavy, document **client-only** enforcement as a known gap (same family trust tier as other MVP choices) and add a follow-up Cloud Function — align with [KNOWN_CONCERNS.md](../KNOWN_CONCERNS.md) style.

**Activities `write` (owner):** When saving tasks, enforce that **compound** / **`y`** mutations are rejected if `isLocked` or if any “in play” condition holds (owner-only writes — can be **client + owner rule** that only owner edits activities; optional **validation function** if you add server-side checks later).

Run **Firestore emulator tests** for: counter updates, pending create with compound at `y/y`, reject leaves count, member cannot patch `completedTaskIds`.

---

## Notifications / functions

If [notifications-onepager.md](../phase-two/notifications-onepager.md) or Cloud Functions assume a single “task submitted” shape, **no** change required for compound beyond the same single pending create when `x === y`.

---

## Implementation checklist (high level)

- [x] Schema: task `kind` + `targetCount`; member **`compoundProgress`** (top-level).
- [x] **Create group / add activity / edit activity** UI + **`updateActivityDocument`** validation (middle-ground edit).
- [x] **`ActivityListTaskRow`**: pending for **this** task freezes counter; **Complete** when `x === y` and no activity pending.
- [x] **Task complete** + FAB: **`completionEligibility`** + **`pendingService`** guard.
- [x] **Approval**: merge **`...prev`** into `progress[activityId]`.
- [x] **Firestore rules**: self **`compoundProgress`** updates only; pending guard client-side.
- [x] **i18n** (en / it / es).
- [ ] **DESIGN.md** (optional): sync §5 / §7 / §10.

---

## Alignment with DESIGN.md

| Topic | DESIGN reference | Notes |
| --- | --- | --- |
| Three tasks per activity | §5 `activities` | Unchanged count; task object gains optional fields. |
| One pending per user per activity | §5 `pending` id | Unchanged; compound completes once at `y/y`. |
| Progress only via approval | §5 `members.progress` | **`compoundProgress`** is member-maintained bookkeeping; medals still from `completedTaskIds`. |
| `isLocked` | §5, §8 | Compound / `y` frozen when locked; name/description still editable. |
| Feed / profile | §7.7, §7 | One approved completion = one task slot; optional “× y” on feed card. |

---

## Open questions (defer unless needed for v1)

- **Max `y`** final number and copy for validation errors.
- **Feed card** text: show “(10×)” or plain task name only.
- **Profile / standings**: whether to surface historical `y` for completed compound tasks.

---

*Update this doc when implementation choices (bounds, rule strictness, copy) are finalized.*
