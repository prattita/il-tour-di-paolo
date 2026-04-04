# Personal Activities — Feature Spec

> Status: **Phase Two — not implemented** (spec only)  
> Last updated: April 2026  
> Parent doc: [DESIGN.md](../mvp/DESIGN.md)  
> Related: [advancedtasks-onepager.md](./advancedtasks-onepager.md), [compoundTasks-onepager.md](../phase-three/compoundTasks-onepager.md)

---

## Overview

A **personal activity** is a normal activity (same three tasks, medals, approval flow, feed posts, compound tasks, notifications) with two extra fields: **`isPersonal: true`** and **`assignedUserId: string | null`**. On the **Activities** tab (and quick-complete picker), **only the assignee** sees the card and can complete tasks — **including when the owner assigned themself**. The owner still **manages** all personal activities in **Group settings**, sees the full roster on **Group Info**, and **approves** submissions like any activity. **Other members** do not see it on Activities. When **`assignedUserId` is `null`**, nobody sees it on Activities; assign in **Group settings** (see lifecycle).

**Medal progress** for the assignee is **visible to all group members** on that member’s profile (activity name, **progress bar**, medal tier). The **“X of 3 tasks”** line and any **task-level detail** are shown only to **owner** and **assignee** (no task names / compound `x/y` on profile for others).

**Feed:** Approved submissions appear like any other activity (activity name, task, medal, photo). **Notifications:** Same paths as standard activities (owner pending, etc.). No feed-specific privacy layer.

---

## Decisions (locked)

| Topic | Decision |
| --- | --- |
| **Participation denominator (Y)** | Same as today: **per member**, “activities this member participates in,” **including personal** where **`assignedUserId === that member`**. Unassigned personal activities **do not** count toward any member’s Y until someone is assigned again. Different members can have different Ys (unchanged). |
| **`isPersonal` vs `isAdvanced`** | **Mutually exclusive** in UI and validation. Toggling one does not allow the other; creating/editing enforces at most one flag. |
| **`assignedUserId`** | **When set:** must be a **group member** (including owner). **Owner may assign to self.** **Reassign** (change A → B while both members): only under the same rules as **compound structural edits** ([compoundTasks-onepager.md](../phase-three/compoundTasks-onepager.md)) — while **`isLocked === false`** and safe to change (recommend: **no progress and no pending** for this activity — mirror “never in play”). **When `null`:** activity is **unassigned**; see lifecycle. |
| **Lifecycle (assignee leaves or removed)** | Treat **leave / removal** as an **event** only: **clear `assignedUserId`** to **`null`** on every personal activity where it matched the leaving user. **Do not** archive or delete the activity doc. **Locking:** if there was already **meaningful progress** (`isLocked === true` from today’s approval flow, or pending / compound counts / completions for that activity — align with existing “in play” signals), **leave `isLocked` as-is**; do **not** auto-unlock. **Pickup:** while **`assignedUserId === null`**, the **owner may set** a new assignee to any current member **regardless of `isLocked`** (so an abandoned personal activity is not stuck forever). **Swap** A→B while both assigned still follows the stricter reassign rules above. **Pending** for the removed user: same cleanup as today’s member removal. **Progress** on the removed member’s doc: same as today’s removal semantics. |
| **Group Info / roster activity list** | **Owner:** sees **all** activities including **all** personal ones (assigned and unassigned). **Assignee (including owner-as-assignee):** on **Activities** only where `assignedUserId === uid`; on **Group Info**, assignee sees **only their** personal rows (plus standard + enrolled advanced). **Other members:** personal rows **omitted** on Group Info (same as Activities for participation surfaces). |
| **Enforcement** | **Firestore rules:** member may **read** activity if owner **or** (personal **with non-null** `assignedUserId` **and** `assignedUserId == request.auth.uid`) **or** (non-personal and existing standard/advanced visibility). **Personal + `assignedUserId == null`:** members (non-owner) **cannot** read. **Pending create:** for personal activities, **`request.auth.uid == assignedUserId`** and assignee **non-null** (and usual group membership). **Client:** **Activities + picker:** personal rows **only for assignee** (owner is **not** special-cased — assign self to appear). **Group Info:** owner sees all personal; members see own personal only. |
| **Feed / notifications** | **No change** vs regular activities; same as advanced in terms of “group-visible feed” and notification behavior. |

---

## Data Model

### Fields on `groups/{groupId}/activities/{activityId}`

```
isPersonal: boolean                    // default false for legacy
assignedUserId: string | null          // when isPersonal === true: set to a member uid, or null while unassigned
```

**Legacy:** Missing `isPersonal` → treat as `false`. Missing `assignedUserId` on non-personal → treat as `null`.

**Validation (owner writes):**

- If `isPersonal === true` **and** `assignedUserId != null`: value must be **in** `group.memberIds` (validate at write time).
- If `isPersonal === false`: `assignedUserId` should be **`null`** (normalize on write).
- **`isPersonal` and `isAdvanced`:** cannot both be `true`.
- **Create** personal activity: typically **`assignedUserId` required** (non-null); **after leave**, null is valid until owner assigns again.

**`activityCount` on group:** Unchanged from today (counts activity documents). **Per-member Y** excludes unassigned personal for everyone (see decisions table).

**Member leave / removal handler:** In the same batch (or flow) that removes the member, **`update` each personal activity** with `assignedUserId == removedUid` → set **`assignedUserId: null`**. Do **not** toggle `isLocked` unless you add an explicit product rule; rely on existing lock behavior when there was progress.

---

## Security Rules (sketch)

Augment the existing `activities` read rule:

- Owner: read all activities (including personal assigned and unassigned).
- Member: read if:
  - **Personal:** `resource.data.isPersonal == true && resource.data.assignedUserId == request.auth.uid` (**non-null** match)
  - **Else:** existing standard / advanced enrollment logic.

Writes: owner-only for creates/updates (unchanged).

**Personal pending:** `create` allowed only if submitter is `assignedUserId` for that `activityId` **and** `assignedUserId` is **non-null** (in addition to today’s checks).

*(Exact rule text should live next to current `activities` and `pending` matches in `firestore.rules`; add emulator tests in the same style as advanced.)*

---

## UI — Owner: create / edit

- **Add activity** (and edit while unlocked): checkbox **Personal activity** (only if **Advanced** is off, and vice versa).
- When **Personal** is on: **Assign to** — member picker (includes owner self).
- **Group Settings** activity list: **Personal** badge + **amber** row treatment (see **Visual treatment**), same as Activities / Group Info. Show **Unassigned** (or empty assignee) when `assignedUserId == null` with a clear **Assign** action.
- **Reassign** (member A → member B): only when the same structural window as compound edits allows (see table above).
- **Pickup** (null → member): allowed whenever the new uid is a current member, **even if `isLocked`**.

---

## UI — Assignee

- **Activities tab:** Personal activity appears for the **assignee only** (owner sees it here **only if** `assignedUserId` is the owner), with the **visual treatment** below (badge + card tint).
- **Group Info:** **Owner:** all personal activities. **Member assignee:** **only** personal activities where `assignedUserId === uid` (plus standard + enrolled advanced) — **same** badge + row tint as on Activities.

---

## Visual treatment — Personal badge and card color

**Goal:** Match the **Advanced** pattern shipped today: a **small uppercase pill** next to the activity title and a **lightly tinted card** (border + background) so personal rows are recognizable at a glance.

| | Advanced (today) | Personal (this feature) |
| --- | --- | --- |
| **Badge** | “Advanced” (violet pill) | **“Personal”** (or **“Just for you”** — pick in copy) |
| **Palette** | Violet (`border-violet-200`, `bg-violet-50/40`, `bg-violet-100` pill, `text-violet-800`) | **Amber** (recommended) |

**Color recommendation — WDTY**

- **Amber / gold** (**recommended**): Warm, clearly **different from advanced purple**, reads as “highlighted / special” without implying success (**green**) or warning (**orange-red**). In Tailwind, mirror the violet steps with **`amber-*`** (e.g. card `border-amber-200`, `bg-amber-50/40`, pill `bg-amber-100`, text `text-amber-900` or `text-amber-800`) and keep contrast **WCAG-friendly** on `bg-tour-surface`-style bases.
- **Green (emerald / teal)** (**acceptable alternative**): Works for “your” activity, but often competes with **completed / success** states in the UI — use only if the rest of the Activities page rarely uses green for status.
- **Pure yellow:** Often **too loud** or low-contrast on white; prefer **amber** over `yellow-*` for borders and text.

**Where to show it**

- **Activities page:** Any **personal** activity card/section uses the personal palette + badge (same structural idea as enrolled advanced blocks in `ActivityListPage.jsx`).
- **Group Info:** Tint + badge on expandable activity rows when `isPersonal` (owner and assignee contexts); subtitle **Assigned to: [name]** (amber, like advanced’s prerequisite line); **Unassigned** when `assignedUserId` is null.
- **Group Settings (owner):** Personal badge on list rows — **same** colors as Activities/Group Info so the product feels one system.

**Exclusivity:** `isPersonal` and `isAdvanced` are never both true, so **no** combined purple+amber card is required.

**i18n:** e.g. `activities.personalBadge` (and any subtitle if you add assignee hint on owner-only surfaces).

---

## UI — Other members (and owner when not the assignee)

- **Activities tab / pickers / deep links:** No access to **others’** personal activities; owner uses **Group settings** to manage them. List filtering and rules must match.
- **Profile (viewing assignee):** For each personal activity assigned to that profile user, show **activity name + progress bar + medal** to everyone. **Do not** show the **“X of 3 tasks”** subtitle (or task list / compound counters / expanders) for non-assignees; **owner** and **assignee** see full detail including that line.

---

## UI — Owner: approval queue

Unchanged layout: personal submissions appear in the same queue as others. Owner approves/rejects as today.

---

## Profile layout

Personal activities are **not** nested under a prerequisite (unlike advanced). They appear as **top-level rows** in the assignee’s profile ordering (reuse existing sort rules with `isPersonal` activities included in “participates” set). **Viewers** see **redacted detail**: name, **progress bar**, medal — **no** “X of 3 tasks” line (assignee + owner see full row).

---

## Edge case — new assignee after removal

**Progress** is stored on **`members/{userId}`** (and compound fields, pending, etc.). When the old assignee is **removed**, their member doc is cleaned up per today’s removal flow. A **new** assignee therefore starts **fresh** on that activity (no inherited `x/y` or task completions), while the **activity** doc (tasks, `isLocked`, feed history) stays as-is. Product accepts this for v1.

---

## Standings

**Per-member Y** matches profile / participation: **shared standard** activities (non-advanced, non-personal) **plus** enrolled advanced ids **plus** personal activities where **`assignedUserId === that member`**. Others do not get a personal row in their denominator. **Ranking** still uses inclusive medal counts over that per-member set (`GroupStandingsPage` + `subscribeNonAdvancedActivitiesForStandings`). The page subtitle **activity count** is **shared standard only** (non-personal), since personal counts differ by member.

---

## Implementation checklist

Track here when building; mirror [advancedtasks-onepager.md](./advancedtasks-onepager.md) checklist style.

### Data model

- [ ] `isPersonal`, `assignedUserId` (nullable) on activity docs — `buildActivityDocument` / `groupService.js`, validation, backfill for legacy
- [ ] On **member remove** (or leave): set `assignedUserId: null` on personal activities where `assignedUserId === removedUid` (same batch/flow as removal — align with existing removal code)

### Security rules

- [ ] `activities` read: personal (assigned-only for members) + unassigned owner-only + advanced + standard matrix
- [ ] `pending` create: personal submitter = assignee
- [ ] Emulator tests for personal visibility and pending

### Client

- [ ] Create/edit: mutual exclusivity **Personal** vs **Advanced**; assignee picker; validation
- [ ] `activityVisibleOnParticipationSurfaces`: personal only if `assignedUserId === uid` (owner included only when self-assigned); Group Info keeps owner override
- [ ] Activities list, quick complete, `TaskCompletePage` gating
- [ ] Group Info: filter personal per viewer rules
- [ ] Profile: non-assignees see bar + medal, not “X of 3” / task detail; assignee + owner see full row
- [ ] Standings: per-member Y includes assigned personal; subtitle uses shared non-personal count only
- [ ] i18n strings for Personal badge, assignee label, empty states
- [ ] **Visual:** amber badge + card tint on Activities, Group Info, Group Settings (parallel to advanced violet)

### Docs / hygiene

- [ ] Update this checklist and **Implementation status** table below when behavior diverges from sketch

---

## Implementation status

| Topic | Shipped behavior |
| --- | --- |
| — | *Not implemented.* |

---

## Rejected / deferred

| Idea | Why deferred |
| --- | --- |
| Personal + advanced on same activity | Excluded for v1 — unnecessary complexity |
| **Soft-delete / `archivedAt` on leave** | Replaced by **unassign** (`assignedUserId: null`); activity stays for owner pickup |
| Hard-delete personal activity on member leave | Loses history and owner tooling |
| Hide personal posts from feed | User chose group-visible feed |
