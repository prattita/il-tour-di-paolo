# Il Tour di Paolo — Design Document

> Version: 0.5  
> Last updated: March 2026  
> Author: Paolo  
> Status: MVP Ready

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Goals & Scope](#2-goals--scope)
3. [Tech Stack](#3-tech-stack)
4. [Architecture](#4-architecture)
5. [Data Model](#5-data-model)
6. [Application Screens](#6-application-screens)
7. [Feature Specifications](#7-feature-specifications)
8. [Medal Logic](#8-medal-logic)
9. [Roles & Permissions](#9-roles--permissions)
10. [Firebase Security Rules](#10-firebase-security-rules)
11. [Implementation Phases](#11-implementation-phases)
12. [Git Strategy](#12-git-strategy)
13. [Open Questions & Future Considerations](#13-open-questions--future-considerations)

---

## 1. Project Overview

**Il Tour di Paolo** is a private family competition web app. Participants complete tasks across a set of activity categories to earn medals. Progress is tracked per user, and approved completions are shared in a group feed with photos and optional descriptions.

**Competition structure:**
- 0+ activities at group creation (owner can add/edit later; soft guidance: start with 4–6, expandable up to **50** per group)
- Exactly 3 tasks per activity
- Completing 1 task → Bronze medal
- Completing 2 tasks → Silver medal
- Completing 3 tasks → Gold medal

**Expected users:** ~10 (family members)  
**Scalability target:** Designed to scale to 10,000 users without architectural changes

> **Known tradeoff:** At scale, the approval flow (write feed, update progress, delete pending) should move to a Cloud Function for stronger consistency and auditability. For MVP with ~10 family members, client-side with strict Firestore rules is acceptable. This is a noted post-MVP migration path.

---

## 2. Goals & Scope

### MVP Goals
- Account creation and login
- Private group creation with invite-only access
- Activity and task tracking with medal computation within the private group
- Image upload on task completion (required)
- Owner approval flow for task completions
- Real-time group feed showing approved completions
- User profiles showing medals per activity
- Owner can remove a member from a group

### Stretch Goals (Post-MVP)
- Push notifications or email to owner when a submission is pending review
- Multiple groups per user
- Social features (likes, comments on feed posts)
- Progress bars per activity on profiles
- Feed post reactions
- Activity completion statistics
- Admin dashboard
- Leaderboard within a group
- Cloud Functions for atomic approval flow

### Out of Scope (MVP)
- Public groups or discovery
- Mobile native app

---

## 3. Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | React + Vite | Fast dev, component-based, large ecosystem |
| Styling | Tailwind CSS | Rapid UI development, responsive by default |
| Routing | React Router | Standard SPA routing |
| Auth | Firebase Auth | Email/password login, session management |
| Database | Firestore (NoSQL) | Real-time listeners, serverless, free tier sufficient |
| Image Storage | Firebase Storage | Handles pending/approved image paths |
| Hosting | Vercel | Free tier, CI/CD from GitHub, CDN-backed |
| Version Control | Git + GitHub | Standard, integrates with Vercel for auto-deploys |
| IDE | Cursor (Claude Sonnet 4.6) | AI-assisted development |

### Cost Estimate (Monthly)
| Service | Cost |
|---|---|
| Cursor Pro | ~$20/mo |
| Firebase (Blaze plan, free tier) | $0 |
| Vercel (Hobby plan) | $0 |
| Claude API (in-app, not needed for MVP) | $0 |
| **Total** | **~$20/mo** |

> Note: Firebase Blaze plan requires a credit card on file but does not charge within free tier limits. Required for Firebase Storage.

---

## 4. Architecture

```
[React App — Vite]
    │
    ├── Firebase Auth        → Login, signup, session management
    ├── Firestore DB         → Users, groups, activities, progress, feed, pending submissions
    └── Firebase Storage     → /images/{pendingId}/{photoId}/photo (immutable per submission attempt)

[Vercel]                     → Hosts built React app, auto-deploys from GitHub main branch
[GitHub]                     → Source control, triggers Vercel deploys on push to main
```

**Architecture pattern:** Serverless / BFF-less. No custom backend server. Firebase handles all data operations directly from the client. Security is enforced entirely via Firestore Security Rules and Firebase Storage Rules — these are the only enforcement layer and must be treated as critical.

---

## 5. Data Model

### Membership — Source of Truth and Denormalization Strategy

Membership data lives in three places. `groups/{groupId}/members/{userId}` is the **source of truth**. The other two are **denormalized copies** for fast reads and rule enforcement:

| Location | Purpose |
|---|---|
| `groups/{groupId}/members/{userId}` | Source of truth — rich data, progress, joinedAt |
| `groups/{groupId}.memberIds[]` | Denormalized — fast membership check in Firestore rules |
| `users/{userId}.groupIds[]` | Denormalized — show "your groups" on home screen |

All three must always be written together in a **Firestore batch write** on join and leave, so they never drift out of sync.

```javascript
// On join — all three update atomically or none do
batch.update(groups/{groupId}, { memberIds: arrayUnion(userId) })
batch.set(groups/{groupId}/members/{userId}, memberDoc)
batch.set(users/{userId}, { groupIds: arrayUnion(groupId) }, { merge: true })
batch.commit()

// On leave (owner removes member) — see §7.9: first delete that member's pending
// submissions + Storage images, then membership batch:
batch.delete(groups/{groupId}/members/{userId})
batch.update(groups/{groupId}, { memberIds: arrayRemove(userId) })
batch.update(users/{userId}, { groupIds: arrayRemove(groupId) })
batch.commit()
```

---

### `users/{userId}`
```
{
  displayName: string,
  email: string,
  avatarUrl: string | null,
  groupIds: string[],          // denormalized — always sync with groups/{groupId}/members
  createdAt: timestamp
}
```

### `groups/{groupId}`
```
{
  name: string,
  description: string | null,
  ownerId: string,             // userId of creator — only 1 owner per group
  inviteCode: string,          // short unique alphanumeric code, e.g. "PAOLO26"
  memberIds: string[],         // denormalized — always sync with members subcollection
  activityCount: number,       // see **Activity count** below
  createdAt: timestamp
}
```

**`activityCount` (group document)** — Denormalized count of activities in this group. Keeps UI and rules simple without scanning the `activities` subcollection for totals.

| When | Value |
|------|--------|
| **Group creation** | Set to the number of activity documents created in the same flow (**0+** allowed; soft guidance: typically **4–6**). Must stay in sync with the actual number of docs under `groups/{groupId}/activities/`. |
| **Owner adds an activity** | Increment by **1** in the **same batch** as creating the new `activities/{activityId}` doc, writing the system feed post, and any other related updates. |
| **Never** | Decremented — activities are not deleted in MVP (see §7.9). |

**Uses:** medal summary denominators (e.g. “Gold X of Y activities” where Y = `activityCount`), home/group summaries, enforcement of the **50**-activity cap when adding activities. If this field drifts, recompute from a one-off query or Cloud Function later; for MVP, correct batch writes on create/add keep it accurate.

### `groups/{groupId}/activities/{activityId}`
```
{
  name: string,
  description: string | null,
  tasks: [
    { id: string, name: string, description: string | null },
    { id: string, name: string, description: string | null },
    { id: string, name: string, description: string | null }
  ],
  medalConditions: {
    bronze: string,
    silver: string,
    gold: string
  },
  isLocked: boolean,           // true once any member has a task approved
  createdAt: timestamp
}
```

> **Stable id requirement:** `activityId` is the canonical, stable identifier for an activity and must not be renumbered/reused. Any per-user selection data should reference these ids (not UI index positions).

### `groups/{groupId}/members/{userId}`
```
{
  displayName: string,
  avatarUrl: string | null,
  joinedAt: timestamp,
  selectedActivityIds: string[] | null,  // fast-follow; null = participates in all activities
  progress: {
    [activityId]: {
      tasksCompleted: number,       // 0–3, approved completions only
      completedTaskIds: string[]
    }
  },
  rejectionBanner?: {              // owner-only write on reject; cleared when that activity is approved
    taskName: string,
    taskId: string,
    activityId: string,
    rejectedAt: timestamp
  }
}
```

> **Important:** `progress` is only ever updated through the owner approval path. No other write path should touch it. This keeps feed medal snapshots and profile medals consistent.
>
> **Fast-follow semantics (`selectedActivityIds`):**
> - `null` => participates in all activities (default; migration-safe for existing members)
> - `[]` => participates in no activities (allowed; user still accesses group feed and can reselect activities later)
> - `["activityIdA", "activityIdB"]` => participates in only those activities

### `groups/{groupId}/pending/{pendingId}`

**Document ID (`pendingId`) — composite key:** `{userId}_{activityId}` (literal underscore between Firebase Auth `userId` and the activity document id).

- **Why:** Enforces **at most one pending submission per user per activity** at the database level: a second `create` for the same pair fails because the document id already exists.
- **Constraints:** Use canonical ids for `userId` and `activityId` (Firestore auto-ids are safe). If an activity id could contain `_`, use a different separator (e.g. `__`) in the app and rules — keep client and rules in sync.
- **Storage:** Use the same `pendingId` for the *folder*, and a new `photoId` for each submission attempt:
  - Storage object path: `/images/{pendingId}/{photoId}/photo`
  - This prevents overwriting a previously-approved image when a member submits again for the same activity.

```
{
  userId: string,              // must match request.auth.uid — enforced by rules
  displayName: string,
  avatarUrl: string | null,    // snapshot from members/{userId} at submit (Phase One profile pics)
  activityId: string,          // must match suffix of pendingId (see composite key above)
  activityName: string,
  taskId: string,
  taskName: string,
  imageUrl: string,            // download URL for /images/{pendingId}/{photoId}/photo
  imagePath: string,           // "images/{pendingId}/{photoId}/photo" (for explicit reject cleanup)
  description: string | null,
  submittedAt: timestamp
}
```

### `groups/{groupId}/feed/{postId}`
```
{
  userId: string,
  displayName: string,
  avatarUrl: string | null,    // denormalized at approval time (member snapshot)
  activityId: string,
  activityName: string,        // denormalized at approval time
  taskId: string,
  taskName: string,            // denormalized at approval time
  medal: "bronze" | "silver" | "gold" | null,
  imageUrl: string,            // reused from pending image URL (/images/{pendingId}/{photoId}/photo)
  description: string | null,
  type: "task_completion" | "system",
  timestamp: timestamp
}
```

> **Medal snapshot:** Feed stores the medal state at approval time. Profile derives medals from `progress`. These stay consistent as long as `progress` is only updated via the approval path.

### `invites/{inviteCode}`
```
{
  groupId: string,
  createdBy: string,
  createdAt: timestamp,
  expiresAt: timestamp | null
}
```

> **Invite code sync:** On regeneration, delete the old `invites/{oldCode}` document and create the new one in the same batch write as updating `groups.inviteCode`. Old invite links immediately stop working.

```javascript
// On invite code regeneration
const newCode = generateInviteCode()
batch.delete(invites/{oldCode})
batch.set(invites/{newCode}, { groupId, createdBy, createdAt })
batch.update(groups/{groupId}, { inviteCode: newCode })
batch.commit()
```

---

## 6. Application Screens

| Screen | Route | Access |
|---|---|---|
| Login / Signup | `/auth` | Public |
| Home / Dashboard | `/` | Authenticated |
| Group Feed | `/group/:groupId/feed` | Group member |
| Standings | `/group/:groupId/standings` | Group member |
| Group Info | `/group/:groupId/info` | Group member |
| Activity List | `/group/:groupId/activities` | Group member |
| Complete a Task | `/group/:groupId/complete` (optional query `activityId`, `taskId` for locked mode). Legacy path `/group/:groupId/activity/:activityId/task/:taskId` redirects to the canonical URL. | Group member |
| User Profile | `/group/:groupId/profile/:userId` | Group member |
| Group Settings | `/group/:groupId/settings` | Owner only |
| Pending Approvals | `/group/:groupId/approvals` | Owner only |
| Create Group | `/group/new` | Authenticated |
| Join Group | `/join/:inviteCode` | Authenticated |

### 6.1 Group app shell & navigation

- **Scope:** All routes under `/group/:groupId/*` (except task completion, which uses a focused header) share one shell.
- **Profile entry:** No separate **Profile** row in the nav list. The **user block** at the top of the drawer/sidebar (avatar, name, role, **See profile** in smaller type) is one **clickable** target to `/group/:groupId/profile/:userId`. The top bar **avatar** (mobile/desktop) also links to profile.
- **Mobile (&lt; `lg`):** Top bar with **burger** (opens a slide-in drawer), **screen title**, and **profile** avatar. Drawer lists: user block (above), then Feed, Activities, Group Info, **Standings**, then **Home**, **Sign out**. **Approval Queue** and **Group Settings** appear **only for the owner** (after a divider), each with an **Owner** badge. Non-owners do not see those entries; direct URLs still redirect (`/approvals`, `/settings` → feed).
- **Desktop (`lg` and up):** The same nav is a **persistent left column** (no overlay). Burger is hidden; navigation is always visible (Feed, Activities, Group Info, Standings, then owner-only items, then Home / Sign out). Nav label inset matches the **group title** row (`px-4`) so active states align with the header text.
- **Follow-up (Phase 9+):** Optional **collapsible / icon-only** sidebar on large screens to reclaim horizontal space while keeping shortcuts.
- **Visual reference:** Warm neutrals, white cards, green primary accent — see `docs/UI_MOCKUPS.html` (v0.1 screens) and `docs/UI_MOCKUPS_v1.0.html` (drawer, **7a/7b Group Info**). Keep mock HTML files local if you prefer not to commit them.

### 6.2 Group Info vs Feed

- **Feed** (`/group/:groupId/feed`): Approved completion posts only (Phase 6). **No** member counts, activity counts, or invite code on the feed screen.
- **Group Info** (`/group/:groupId/info`): Name, description, **full member roster** (initials, name, link to profile, Owner badge), and **Activities** with **collapsible** detail (optional description, three tasks) for **all** members — aligned with mock **7a** (Phase 8.5). **Invite code, regeneration, and member removal** live only under **Group settings** (Phase 8); they do **not** appear on Group Info. **Owners** see an **Edit group & invite** control on the group card that links to `/group/:groupId/settings`.

---

## 7. Feature Specifications

### 7.1 Authentication
- Email and password signup/login via Firebase Auth
- Google sign-in supported (enabled in Firebase Console); optional on `/auth`
- Display name set at signup (email flow); Google uses provider profile when available
- On first sign-in, create `users/{uid}` in Firestore if missing (see §5)
- Protected routes: unauthenticated users redirected to `/auth`
- Avatar upload post-MVP

### 7.2 Group Creation
- Owner sets group name and optional description
- Owner can create a group with 0 or more activities at creation time (soft guidance: start with 4–6)
- Each activity requires: name, optional description, and 3 tasks (each with name and optional description)
- Medal condition text is fixed in MVP and auto-populated: Bronze = "Complete 1 of 3 tasks", Silver = "Complete 2 of 3 tasks", Gold = "Complete 3 of 3 tasks"
- **`activityCount`** on `groups/{groupId}` is set to the number of activity documents created (see §5)
- Invite code auto-generated on group creation
- Owner assigned automatically as the group creator — one owner per group
- Owner's `selectedActivityIds` is set to `null` on group creation (participates in all activities by default, including any added later)

### 7.3 Joining a Group
- User navigates to `/join/:inviteCode` or enters code manually
- System validates invite code against `invites/{inviteCode}` in Firestore
- On valid code: **batch write** adds user to all three membership locations atomically
- **Batch order (required for security rules):** (1) `update groups/{groupId}` — `memberIds: arrayUnion(self)`; (2) `set groups/{groupId}/members/{userId}`; (3) `merge-set users/{userId}` — `groupIds: arrayUnion(groupId)`. Rules for step (2) must use **`getAfter()`** on the group document (`groups/{groupId}`), not **`get()`**: `get()` only sees pre-batch state, so the new member is not in `memberIds` yet and the create would always be denied. See §10.
- User lands on group feed after joining

### 7.4 Activity & Task Tracking
- Members view all activities in the group
- Each activity shows 3 tasks with their current status:
  - **Empty** — not yet attempted, active "Complete" button shown (unless blocked by a rule below)
  - **Pending** — submitted, awaiting owner approval, button blocked
  - **Approved** — checkmark shown, no label
  - **Blocked** — greyed out, disabled "Complete" button

- **One pending submission per activity at a time (per user):**
  - While any task in an activity has a pending submission, all other incomplete tasks in that activity show a greyed out, disabled "Complete" button
  - A subtle hint is shown: "Awaiting approval before next task"
  - Once the pending submission is approved or rejected, incomplete tasks become active again
  - This restriction is per activity — members can have pending submissions across multiple activities simultaneously

- `isLocked` set to `true` on activity after first approved completion

### 7.5 Task Completion Flow
- User taps "Complete" on an available (non-blocked) task (must respect **one pending task per activity per member** — see §7.4)
- Completion form:
  - Image upload — required. Submit button disabled until image attached.
  - Description — optional.
  - Submit button: "Submit for review"
- On submit:
  - **Pending document id** = `{userId}_{activityId}` (see §5). Image uploads under `/images/{pendingId}/{photoId}/photo` in Firebase Storage
  - Submission written to `groups/{groupId}/pending/{pendingId}` with `userId` matching `request.auth.uid` and `activityId` consistent with the id
  - Task status flips to "Pending" — all other incomplete tasks in the activity become Blocked
  - Note shown: "Your submission will appear in the feed once the owner approves it."

**Withdraw (Phase 9):** While a submission is pending, the **submitter** may **withdraw** it from the **Activities** list (`Withdraw submission`). That **deletes** the pending Firestore document and the **Storage** photo (same cleanup as owner reject, but **no** `rejectionBanner`). Other tasks in the activity become available again. Rules: **`delete`** on `pending/{pendingId}` allowed if `resource.data.userId == request.auth.uid` **and** the user is still in **`group.memberIds`** (or owner).

### 7.6 Owner Approval Flow
- Owner sees pending approvals queue at `/group/:groupId/approvals`
- Badge indicator on Group Settings showing pending count
- Each item shows: user name, activity, task, image, optional description, timestamp

**On Approve:**
1. Write feed post to `groups/{groupId}/feed/{postId}` in Firestore (reuses pending `imageUrl`)
2. Update member progress (`tasksCompleted`, `completedTaskIds`) via transaction
3. Recompute medal snapshot for the feed post
4. Delete pending document from Firestore
5. Set `isLocked: true` on activity if not already set
6. Remaining incomplete tasks in the activity become active again

> **Current MVP behavior:** Approval does not copy image bytes in Storage; approved posts continue pointing to the same immutable object under `/images/{pendingId}/{photoId}/photo`.

**On Reject:**
1. Delete image from `/images/{pendingId}/{photoId}/photo` in Firebase Storage (using `imagePath`)
2. Delete pending document from Firestore
3. Task status resets to available — all incomplete tasks in the activity become active again
4. User sees an in-app banner on next visit: "Your submission for [task] was not approved. Please resubmit."

### 7.7 Group Feed
- Real-time Firestore listener on `groups/{groupId}/feed`
- Posts ordered by timestamp descending
- Feed cards show: avatar, display name, activity, task, medal badge, image, optional description, relative timestamp
- System posts shown inline (e.g. "Paolo added a new activity: Hiking")
- System posts can only be written by the owner — enforced by Firestore rules

### 7.8 User Profile
- Medal summary at top: Gold N/N · Silver N/N · Bronze N/N (N/N = earned of total activities)
- Per-activity breakdown (MVP): activity name, tasks completed (e.g. "2 of 3 tasks"), medal badge (or — if none yet)
- **Phase Two:** On this screen only, members can open the **profile photo larger** (fullscreen lightbox): tap another member’s avatar, or **View photo** on your own profile (`docs/phase-two/expandProfileImage-onepager.md`). Avatars elsewhere (feed, shell, etc.) do not expand.
- **Stretch:** optional progress bar per activity (mockups may show for inspiration only; see §2)

### 7.9 Group Settings (Owner Only)
- Edit group name and description
- Invite code display and regeneration (old code invalidated via batch write)
- View member list
- **Remove a member**
  1. **Delete all pending submissions** for that user in this group: for each doc in `groups/{groupId}/pending` where `userId` equals the removed member, delete the corresponding object in Firebase Storage (`/images/...`, using `imagePath`), then delete the Firestore pending document. (If there are many, use chunked batches; family scale is small.)
  2. **Batch write — membership:** remove from all three locations (`members/{userId}`, `memberIds` on the group, `groupIds` on the user) as in §5.
  - The removed user loses access immediately; their **approved** history remains on the feed per §13 (display name kept on past posts where denormalized).
- Add new activity mid-competition: create activity doc, **increment `activityCount` by 1** in the same batch, system feed post
- Edit existing activity (respects `isLocked` rules)
- Cannot delete activities
- Link to pending approvals queue with badge count

---

## 8. Medal Logic

| Approved Tasks | Medal |
|---|---|
| 0 | None |
| 1 | Bronze |
| 2 | Silver |
| 3 | Gold |

```javascript
const getMedal = (tasksCompleted) => ({
  1: "bronze",
  2: "silver",
  3: "gold"
}[tasksCompleted] ?? null);
```

Medal thresholds are fixed and not configurable. In MVP, medal condition descriptions are also fixed and auto-populated per activity (1/2/3 tasks).

### Activity Locking
Once any member has a task approved in an activity, `isLocked` is set to `true`. Task structure (add/remove/reorder) is frozen. Names and descriptions remain editable.

---

## 9. Roles & Permissions

| Action | Member | Owner |
|---|---|---|
| View group feed | ✅ | ✅ |
| Complete tasks | ✅ | ✅ |
| Upload images | ✅ | ✅ |
| View profiles | ✅ | ✅ |
| View member list | ✅ | ✅ |
| Edit group name/description | ❌ | ✅ |
| Add activities | ❌ | ✅ |
| Edit activities | ❌ | ✅ |
| Delete activities | ❌ | ❌ (no one) |
| Regenerate invite code | ❌ | ✅ |
| View & action pending approvals | ❌ | ✅ |
| Withdraw **own** pending submission | ✅ | ✅ |
| Write system feed posts | ❌ | ✅ |
| Remove members | ❌ | ✅ |

---

## 10. Firebase Security Rules

With no backend server, Firestore and Storage rules are the **only enforcement layer**. These must be deployed before any user-facing features go live.

### Core Principles
- Default deny — if no rule explicitly allows an operation, it is denied
- `request.auth.uid` is the only trusted identity — never trust `userId` fields written by the client unless rules verify they match `request.auth.uid`
- `memberIds` on the group document enables cheap membership checks; some flows use a **`get()` to `groups/{groupId}`** (e.g. pending `create`) — justified when enforcing membership for writes
- Progress updates are only writable by the owner via the approval path, never directly by members

### `users/{userId}` — no cross-user reads

Other members **never read** `users/{userId}` for someone else’s profile. The rules keep **`read` and `write` to `request.auth.uid == userId` only.** All **display names and avatars** shown in the app come from **denormalized fields** on `groups/{groupId}/members/{userId}`, `groups/{groupId}/feed/{postId}`, `groups/{groupId}/pending/{pendingId}`, etc. The client must not rely on loading another user’s `users/` document.

### Join batch write order

For **join**, operations must be ordered: **`groups/{groupId}` update (`memberIds`) first**, then **`members/{userId}` create**, then **`users/{userId}` merge** — see §7.3. For the **`members/{userId}` create** rule, **`getAfter(groups/{groupId})`** exposes the group **after** step (1); **`get(groups/{groupId})`** does **not** and will keep denying self-join if the rule requires `uid in memberIds`.

### Summary of rule patterns (reference)

| Topic | Approach |
|--------|----------|
| Batch join on `groups/{groupId}` | Narrow **`update`**: non-owner may only add **themselves** to `memberIds` (exactly one new id, all other group fields unchanged) — see `isJoiningSelf()` + `groupUnchangedExceptMemberIds()` in the rules below |
| `pending` **create** | `get()` group → caller must be in **`memberIds`**; **`pendingId`** must equal `userId + '_' + activityId` (matches §5 composite key) |
| Invites **list** vs **get** | **`get`**: authenticated lookup by code; **`list`**: denied (no enumerating all invite codes) |
| Invites **create** | Use **`request.resource.data.groupId`** (no `resource` on create) |
| `pending` **read** | **`get`**: owner **or** member whose **`pendingId`** matches `^uid_.+` (so `getDoc` on a **missing** pending slot still works; `resource.data` is absent). **`list`**: owner only (approval queue) |
| `pending` **delete** | Owner **or** submitter (`resource.data.userId == request.auth.uid`) **and** submitter still in **`memberIds`** (Phase 9 withdraw) |
| **Remove member** | Owner **`delete`** on that user’s `pending` docs (and Storage); same rule path as queue reject |
| One pending per user per activity | **Composite document id** `{userId}_{activityId}` — duplicate create fails at the database |
| Storage | Loose paths for MVP — **see caveat below** |

### Firestore Rules (draft — test in emulator before production)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helpers at database scope (Firestore does not allow nested `function` inside `match`)
    function groupDoc(groupId) {
      return get(/databases/$(database)/documents/groups/$(groupId));
    }

    function isGroupMember(groupId) {
      return request.auth != null
        && request.auth.uid in groupDoc(groupId).data.memberIds;
    }

    function isGroupOwner(groupId) {
      return request.auth != null
        && request.auth.uid == groupDoc(groupId).data.ownerId;
    }

    // Users — only own document (no cross-user reads; see §10)
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    match /groups/{groupId} {

      allow read: if isGroupMember(groupId);

      allow create: if request.auth != null
        && request.resource.data.ownerId == request.auth.uid
        && request.auth.uid in request.resource.data.memberIds;

      // Owner full update OR narrow self-join (memberIds +1 self only; all other fields unchanged)
      allow update: if request.auth != null && (
        request.auth.uid == resource.data.ownerId
        || (
          request.auth.uid in request.resource.data.memberIds
          && !(request.auth.uid in resource.data.memberIds)
          && request.resource.data.memberIds.hasAll(resource.data.memberIds)
          && request.resource.data.memberIds.size() == resource.data.memberIds.size() + 1
          && request.resource.data.name == resource.data.name
          && request.resource.data.description == resource.data.description
          && request.resource.data.ownerId == resource.data.ownerId
          && request.resource.data.inviteCode == resource.data.inviteCode
          && request.resource.data.activityCount == resource.data.activityCount
          && request.resource.data.createdAt == resource.data.createdAt
        )
      );

      allow delete: if false;

      // Subcollections: `resource` is the child doc — membership must use get(group), not resource
      match /activities/{activityId} {
        allow read: if isGroupMember(groupId);
        allow write: if isGroupOwner(groupId);
      }

      match /members/{memberId} {
        allow read: if isGroupMember(groupId);
        allow create: if request.auth != null
          && request.auth.uid == memberId
          && request.auth.uid in groupDoc(groupId).data.memberIds;
        // Owner can update member docs; member can only update own selectedActivityIds (fast-follow)
        allow update: if isGroupOwner(groupId)
          || (
            request.auth != null
            && request.auth.uid == memberId
            && isGroupMember(groupId)
            && request.resource.data.diff(resource.data).changedKeys().hasOnly(['selectedActivityIds'])
            && (
              request.resource.data.selectedActivityIds == null
              || request.resource.data.selectedActivityIds is list
            )
          );
        allow delete: if isGroupOwner(groupId);
      }

      // pendingId = "{userId}_{activityId}" — enforces one pending per user per activity
      match /pending/{pendingId} {
        allow read: if isGroupOwner(groupId)
          || (request.auth != null && resource.data.userId == request.auth.uid);

        allow create: if request.auth != null
          && request.resource.data.userId == request.auth.uid
          && request.auth.uid in groupDoc(groupId).data.memberIds
          && pendingId == request.auth.uid + '_' + request.resource.data.activityId;

        allow delete: if isGroupOwner(groupId);

        allow update: if false;
      }

      match /feed/{postId} {
        allow read: if isGroupMember(groupId);
        allow write: if isGroupOwner(groupId);
      }
    }

    match /invites/{inviteCode} {
      allow get: if request.auth != null;
      allow list: if false;

      allow create: if request.auth != null
        && exists(/databases/$(database)/documents/groups/$(request.resource.data.groupId))
        && request.auth.uid == groupDoc(request.resource.data.groupId).data.ownerId;

      allow delete: if request.auth != null
        && request.auth.uid == groupDoc(resource.data.groupId).data.ownerId;

      allow update: if false;
    }
  }
}
```

> **Emulator:** Run the [Firestore rules unit tests / emulator](https://firebase.google.com/docs/rules/unit-tests) against join, pending create, and invite lookup before shipping.

### Firebase Storage Rules (MVP — explicit caveat)

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {

    match /images/{submissionId}/{allPaths=**} {
      allow read, delete: if request.auth != null;
      allow write: if request.auth != null;
    }
  }
}
```

**Caveat (required reading):** These rules are **intentionally permissive**: any authenticated project user can read/write matching paths if they know or guess `pendingId` / `postId`. That is **acceptable only** for a **small, closed trust boundary** (e.g. family) where URLs are not shared publicly. They are **not** sufficient for open or adversarial traffic. **Post-MVP:** tighten paths (e.g. include `groupId` in the object path) and mirror **Firestore** membership checks via `firestore.get()` in Storage rules, or move uploads behind Cloud Functions.

### What These Rules Prevent (when combined with client behavior)
- Cross-user **`users/`** reads — names/avatars from denormalized data only
- **Forged** pending submissions — `userId` must match auth; **membership** required via `get()`; **composite `pendingId`** ties doc to user + activity
- **Spam** to arbitrary `groupId` on pending — must be in **`memberIds`**
- **Invite code harvesting** — **`list`** denied; lookup by code via **`get`** only
- **Wrong owner** on invite create/delete — **`request.resource.data.groupId`** on create; **`resource.data`** on delete
- **Submitter locked out after refresh** — submitter can **`read`** own pending doc
- **Fake group creation** — **`ownerId`** must equal auth uid; creator must appear in **`memberIds`**
- **Non-owners editing groups** — except controlled **self-join** on **`memberIds`** only
- Arbitrary **feed** posts — **owner-only** writes
- **Duplicate** pending per user per activity — **document id** collision
- Old **invite** codes after regeneration — batch delete (app layer) + **owner-only** invite deletes

**Owner removes member:** Owner may **`delete`** that member’s **`pending`** documents (after deleting Storage objects in the client); rules already allow owner **`delete`** on `pending`.

---

## 11. Implementation Phases

### Phase 1 — Foundation
- [x] Scaffold React + Vite project
- [x] Install and configure Tailwind CSS
- [x] Create Firebase project, enable Auth, Firestore, and Storage
- [x] Add Firebase config via environment variables (never commit to Git) — `.env.example`, `src/lib/firebase.js`
- [x] Write and deploy initial Firestore and Storage security rules — `firestore.rules`, `storage.rules`, `firebase.json`
- [x] Deploy app to Vercel (GitHub + `VITE_FIREBASE_*` env vars + authorized domain)
- [x] `docs/DESIGN.md` in repo

### Phase 2 — Auth
- [x] Signup screen (email, password, display name) — `/auth` with Sign up tab
- [x] Login screen — `/auth` with Log in tab
- [x] Firebase Auth integration — `src/services/authService.js`, Google + email/password
- [x] Protected route wrapper — `ProtectedRoute`, `PublicOnlyRoute`
- [x] Redirect unauthenticated users to `/auth`

### Phase 3 — Groups
- [x] Create group screen with inline activity builder (0+ activities allowed at creation)
- [x] Each activity: name, description, 3 tasks (medal condition text auto-populated/fixed)
- [x] Set `groups.activityCount` = number of activities created at group creation
- [x] Auto-generate invite code on group creation
- [x] Write `invites/{inviteCode}` document on group creation
- [x] Owner role assigned on creation
- [x] Join group screen (enter invite code)
- [x] `/join/:inviteCode` route handling
- [x] Batch write on join (members subcollection + memberIds + groupIds)
- [x] Lock stable `activityId` usage in UI/state (no index-based activity identity)
- [x] Home group list from `users.groupIds` with routing to `/group/:groupId/feed`
- [x] Group feed route placeholder (Phase 6); metadata lives on **Group Info** (§6.2)

### Phase 4 — Activity & Task Tracking
- [x] Group app shell: mobile drawer + persistent `lg` sidebar (`GroupLayout`); stub routes for profile / approvals / settings until later phases
- [x] Group Info page (`/group/:groupId/info`) — member-facing summary; metadata edit + invite in **Group settings** (Phase 8); roster + collapsible activities (Phase 8.5)
- [x] Activity list view per group (`/group/:groupId/activities`) aligned with mockup density (cards, medal badge, task status dots, pill **Complete**)
- [x] Task status rendering (empty / pending / approved / blocked)
- [x] One pending submission per activity rule enforced in UI
- [x] "Awaiting approval before next task" hint when blocked
- [x] Task completion form (image upload required, description optional) — `/group/:groupId/complete` (+ query / legacy redirect; Phase One quick completion)
- [x] Firebase Storage upload to `/images/{pendingId}/{photoId}/photo` where `pendingId` = `{userId}_{activityId}` and `photoId` is per-attempt
- [x] Write pending doc to `groups/.../pending/{pendingId}` (composite id; client rejects duplicate pending before write)
- [x] Block all other incomplete tasks in activity while submission pending

### Phase 5 — Owner Approval Flow
- [x] Pending approvals screen (owner only)
- [x] Badge count on Group Settings
- [x] Approve: write feed post (reuse pending `imageUrl`), update progress via transaction, compute medal, delete pending doc, set isLocked, unblock activity tasks
- [x] Reject: delete image from `/images/`, delete pending doc, unblock activity tasks
- [x] In-app rejection banner on next visit (dismiss stored in `localStorage` per group/activity/task; cleared server-side when the same activity is later approved)

### Phase 6 — Feed
- [x] Real-time Firestore listener on feed subcollection
- [x] Feed card component (avatar, activity, task, medal, image, description, timestamp)
- [x] Feed ordered by timestamp descending

### Phase 7 — User Profile
- [x] Profile screen layout
- [x] Medal summary (N/N format per medal tier)
- [x] Per-activity breakdown with tasks completed and medal badge
- [x] *(Stretch)* Progress bar per activity on profile

### Phase 8 — Group Settings & Activity Management
- [x] Group settings screen (owner only)
- [x] Edit group name/description
- [x] Invite code regeneration (batch: delete old invites doc, create new, update group)
- [x] Remove member: delete all their pending docs + Storage images, then batch membership removal
- [x] Add new activity mid-competition: increment `activityCount`, system feed post, new activity doc
- [x] System post rendering
- [x] Member roster UI (names + initials; no custom profile-photo upload in MVP — see Phase One `docs/phase-one/profilePics-onepager.md` for `avatarUrl` upload + propagation to `groups/{groupId}/members/{userId}`).
- [x] Edit activity form (respects isLocked rules)

### Phase 8.5 — Group information screen (all members)

Refresh `/group/:groupId/info` so it matches mock **7a** / **7b** layout intent without duplicating **Group settings**.

- [x] Cross-check **Group Info** against `docs/UI_MOCKUPS_v1.0.html` screens **7a** (member) and **7b** (owner) for spacing and hierarchy.
- [x] **Remove invite code** (and regeneration) from Group Info — invite is **Group settings** only.
- [x] **Member roster** visible to **everyone** in the group (initials, display name, profile link, **Owner** badge). No **Remove** on this page (removal stays in settings).
- [x] **Activities:** list mirrors mocks — each row is **collapsible**; expanded state shows optional activity description and the **three tasks** (dot list). Medal rules stay implicit (1/2/3 tasks); no extra medal copy on this screen.
- [x] **Owner only:** show **Edit group & invite** on the group card, linking to **`/group/:groupId/settings`**. **Non-owners** do not see that control.

**Note:** Mock **7a** shows per-activity **Join** / **Joined** chips (`selectedActivityIds` fast-follow). Until that ships, omit join UI on Group Info; members still see all activities as in the Activities tab.

**`isLocked` (editing only):** See Phase 8.5 note — **Group Info** does not surface this flag; it is global per activity, not per member.

### Phase 9 — Privacy (withdraw pending)

- [x] **Withdraw submission** on **Activities** when the current user has a pending doc for that activity; confirms before delete; unlocks the activity for new submissions.
- [x] **`pending` delete** in rules: owner **or** (`resource.data.userId == request.auth.uid` **and** caller in **`group.memberIds`**).

#### Privacy & authorization notes (Phase 9 and related)

- **Submitter-only:** Only the user named in `pending.userId` may self-delete; composite `pendingId` ties the doc to that uid + activity, so another member cannot target someone else’s doc via rules (they would fail `userId` match on `resource`).
- **Membership gate on withdraw:** Self-delete requires **still being a group member** — avoids odd edge cases after removal (owner removal already deletes that member’s pendings client-side).
- **No rejection UX:** Withdraw is **not** a rejection; the app does **not** set `rejectionBanner` (unlike owner reject). Copy in the confirm dialog states the photo is removed.
- **Owner visibility:** The approval queue updates in real time if a member withdraws; the owner never saw a “reject” action.
- **Storage:** Client deletes the object at `imagePath` after Firestore delete (same pattern as reject). **Storage rules remain broad** (any authed user with path knowledge) — see §10 Storage caveat and `KNOWN_CONCERNS.md`; not introduced by Phase 9.
- **No new PII export:** Withdraw does not add exports; it **removes** one pending row and one image the user already uploaded.
- **Legal / consent:** Family MVP — not a substitute for jurisdiction-specific privacy policy or consent flows if you expand beyond a closed group.

### Phase 10 — Polish & Launch
*(MVP complete — March 2026.)*

- [x] Final palette pass (first pass): warm neutrals + green accent `#1D9E75` in `@theme`; `tour-accent-foreground` for text on muted green; sidebar nav active state uses accent (replaces blue); scattered `#0F6E56` usages aligned to token
- [x] Further paddings / tap targets (pass 2): primary/secondary CTAs and form fields use **`min-h-11` (~44px)** where practical; Auth, Welcome, Join, Create group aligned
- [x] Home / **Welcome** screen: personalized **“Welcome back {firstName}!”** (`firstNameFromUser` in `src/lib/userDisplay.js`); **Your groups** block **above** create/join; **Sign out** matches group shell (red text + `hover:bg-red-50`); group rows still open **`/group/:id/feed`**
- [x] **`/auth`** screen matches shell UX: `bg-tour-muted`, surface card, `Il Tour di Paolo` eyebrow, segmented login/signup, green primary + white label, taller inputs/buttons
- [x] **Join** + **Create group** standalone pages: same visual language as Welcome (muted canvas, surface forms, no “Phase 3” copy)
- [x] **Responsive / multi–form-factor pass (MVP):** task form widens at `sm`/`lg`; group shell scroll lock; further breakpoint polish = **post-MVP** if needed
- [x] Loading states (first pass): shared `PageLoading` spinner on Home (groups), Feed, Activities, Approvals, Task complete; error banners unchanged where present
- [x] Empty states: feed / approvals / activities already had copy; activities empty state copy de-“Phase 8”-ified
- [x] Desktop (`lg+`): shell uses `h-[100dvh]` + `min-h-0` / `overflow-hidden` so **only `<main>` scrolls** — top bar and sidebar **Home** / **Sign out** stay visible; nav items scroll if needed
  - Mobile: drawer unchanged; persistent Home/Sign out outside drawer = optional follow-up
- [x] Default landing: `/group/:groupId` → `feed` (existing); Home group links now target **feed** explicitly
- [x] Feed cards aligned with **`docs/UI_MOCKUPS_v1.0.html`** Page 3 (header / image / body); branding string **“Il Tour di Paolo”** (no year) in shell + key screens

### Phase 11 — Launch
- [x] **Final security rules review** — March 2026 pass against repo `firestore.rules` + `storage.rules` (see **notes** below). **Action:** ensure Firebase Console deployed rules match Git (`firebase deploy --only firestore:rules,storage`).
- [x] **Final Vercel production deploy** — production app live; env vars match `.env.example` (`VITE_FIREBASE_*`); Firebase **Authorized domains** includes the Vercel hostname.
- [ ] **Invite family** — manual milestone when you’re ready.

#### Phase 11 — Security review notes (March 2026)
- **Firestore:** `users/` self-only; `groups/` `get` for any authed user (join-by-id), `list` denied; subcollections gated by **`memberIds`** / **`ownerId`** as in DESIGN §10; **`pending`** `get`/`list` split fixes non-owner `getDoc` on missing doc; **`feed`** member read, owner write; **`invites`** owner create/delete, `list` denied.
- **Storage:** MVP rules remain **broad** (any authed user under `images/...`) — intentional for family scale; **post-MVP** tighten per DESIGN §13 / `docs/KNOWN_CONCERNS.md`.
- **Residual:** Client-side approval, invite code on group doc, Storage path guessability — all documented in **`docs/KNOWN_CONCERNS.md`**; acceptable for closed family MVP.

---

## 12. Git Strategy

### Branches
- `main` — production, always deployable, auto-deploys to Vercel
- `dev` — integration branch, merge features here first
- `feature/xxx` — one branch per feature (e.g. `feature/auth`, `feature/approval-flow`)

### Workflow
```
feature/auth → PR into dev → review & test → merge dev
                                            → PR into main → production deploy
```

### Commit Style
```
feat: add task completion form with image upload
feat: add owner approval queue
fix: reset task status on rejection
chore: deploy updated Firestore security rules
docs: update DESIGN.md with security rules section
```

---

## 13. Open Questions & Future Considerations

### Closed Decisions
- **Reject notification:** In-app banner on next visit — "Your submission for [task] was not approved. Please resubmit." No reason shown for MVP.
- **Feed history on member leave:** Preserve feed history. Display name kept, avatar removed.
- **Invite code expiry:** Permanent for MVP. Old codes invalidated immediately on regeneration via batch delete.
- **Remove members:** MVP scope — owner can remove any member via Group Settings. **All of that member’s pending submissions in the group are deleted automatically** (Firestore + Storage) before membership is removed.
- **Task submission rule:** One pending submission per activity per user at a time. All other incomplete tasks in that activity are blocked until the pending submission is resolved.
- **Pending document ids:** Composite `{userId}_{activityId}` (§5) — enforced in rules and prevents duplicate pendings without a Cloud Function.
- **Group creation activity minimum:** No enforced minimum at creation; owner may create with 0+ and add/edit later (soft guidance: start with 4–6).
- **Per-user activity selection (fast-follow):** Store on `groups/{groupId}/members/{userId}.selectedActivityIds` with `null` meaning "all activities".
- **`selectedActivityIds: []` behavior (fast-follow):** Allowed. User can deselect all activities, still access feed, and later opt back into activities.
- **Owner activity participation (MVP):** Owner is implicitly joined to all activities (`selectedActivityIds: null`). No join/leave controls shown for owner in Group Info screen.

### Post-MVP / Stretch Goals
- **Profile pictures (upload + shared avatar across groups):** Out of MVP to avoid feature creep. Spec and implementation checklist: `docs/phase-one/profilePics-onepager.md`.
- **Desktop shell:** Collapse or minimize the `lg` sidebar to icons-only (or hide behind a control) for more content width — see §6.1 follow-up.
- Cloud Function for atomic approval flow
- Tighten Firebase Storage rules to per-group membership
- Push notification or email to owner on pending submission
- Progress bars per activity on user profiles
- Feed post reactions
- Leaderboard within a group
- Multiple groups per user
- Google or Apple sign-in
- Mobile app (React Native)

### UI & Design Notes
- **Navigation:** Global auth/home/create/join are standalone. **Inside a group**, routes use the shared shell (§6.1): drawer on small viewports, left nav column from `lg` up; profile via user block + top avatar, not a duplicate nav row. Task completion keeps a simple top bar with **Back** (not the burger shell). **Group metadata** lives under **Group Info**, not Feed (§6.2).
- **Mockups:** `UI_MOCKUPS.html` (v0.1 — activity list, task form, feed, approvals, profile) and `UI_MOCKUPS_v1.0.html` (burger drawer, group info). Use as layout/color reference; you may delete or gitignore HTML mocks before commit.
- **Palette:** Warm off-white / grey surfaces, near-black text, **green accent** for primary actions (see `@theme` in `src/index.css`). Phase 9 may add a light blue pastel pass if you want closer parity with earlier DESIGN copy.
- UI screens mocked up: Activity list, Task completion form, Group feed, Owner approval queue, User profile, Group info, Nav drawer
- Task blocking state: disabled pill **Complete** + "Awaiting approval before next task" hint

---

*This document is a living reference. Update it as decisions are made during implementation.*
