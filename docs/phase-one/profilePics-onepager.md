# Profile Pictures — Feature Spec

> Status: Phase One (post-MVP)  
> Last updated: March 2026  
> Parent doc: [DESIGN.md](../mvp/DESIGN.md)

---

## Overview

Allow users to upload a **custom** profile picture stored in Firebase Storage. The image is shown wherever the app already shows an avatar today (group shell, profile, feed cards, approvals, roster, etc.), using **`avatarUrl`** from denormalized **`groups/{groupId}/members/{userId}`** (and the canonical copy on **`users/{userId}`**). If `avatarUrl` is missing or the image fails to load, keep the existing **initials** fallback ([DESIGN.md §5](../mvp/DESIGN.md) — `avatarUrl: string | null` on both `users` and `members`).

**Why this sits before Stats / Feed v2:** UserTracker and feed chrome can rely on **`members.avatarUrl`** from day one instead of shipping initials first and re-touching every surface twice.

---

## Alignment with DESIGN.md

| Topic | DESIGN reference | Notes |
| --- | --- | --- |
| No cross-user `users/` reads | §10 | Other members never read `users/{otherUid}`; all avatars in UI come from **`members`**, **`feed`**, **`pending`**, etc. |
| `avatarUrl` on `users` + `members` | §5 | Already in the schema; join/create today copies `userAvatarUrl` into the new member doc. |
| Feed / pending denormalization | §5 `feed`, `pending` | **Repo gap today:** `createPendingSubmission` and approve → `feed` do **not** write `avatarUrl`. For photos in **approvals** and **feed** (and for “frozen at post time” behavior), add **`avatarUrl`** on **`pending`** at submit and on **`feed`** at approve, sourced from **`members/{uid}.avatarUrl`** at that moment — same story as **`displayName`**. |
| Member leave | §13 | “Avatar removed” on history: implement in **UI** (e.g. don’t render stored `avatarUrl` for removed users) or leave historical `avatarUrl` on old posts for family context — pick one product rule and document it in UI copy if needed. |
| Storage caveat | §10, `KNOWN_CONCERNS.md` | `avatars/{userId}` rules below are stricter than `images/…` but **`read` for any authed user** is still a closed-trust choice; tighten further post-MVP if needed. |

---

## Implementation notes (read before coding)

1. **Download URL token (most important nuance)**  
   Even when the Storage **object path** stays fixed (`avatars/{userId}`), calling `getDownloadURL()` after each upload returns a URL whose **query token changes**. Treat `avatarUrl` as **not stable across uploads**. After every successful upload you must **fetch the new download URL and write it to Firestore** (`users` + every relevant **`members`** doc). Do not assume the old string still works.

2. **Feed / pending snapshots**  
   Historical **`feed`** posts keep **`avatarUrl`** (and `displayName`) as written at **approval** time. **`pending`** rows should carry **`avatarUrl` at submit** so the owner queue can show the right face without extra reads. **New** avatar uploads update **`members`** (and `users`) only; they do **not** rewrite old **`feed`** or **`pending`** docs.

3. **Batch write over `groupIds`**  
   After upload, update **`users/{userId}`** and **each** **`groups/{groupId}/members/{userId}`** the user still belongs to. Read **`users/{userId}.groupIds`** (or equivalent source of truth) and **pre-check** that each member doc still exists (and you still pass rules) so a stale `groupId` does not fail the whole batch. At family scale a single batch is fine; at **500 ops** chunk into multiple batches.

4. **Firestore security rules (required)**  
   Today, **`members/{memberId}`** allows self-**update** only when **`changedKeys().hasOnly(['selectedActivityIds'])`** (`firestore.rules`). A batch that only sets **`avatarUrl`** on **`members`** will be **denied** until rules are extended — e.g. allow self-updates where **`changedKeys().hasOnly(['avatarUrl'])`** and **`avatarUrl`** is a **string** or **null**, and all other fields unchanged (compare to **`resource.data`** for critical fields, or use a narrow **`diff`** check consistent with the existing `selectedActivityIds` rule).

5. **Google / Auth profile photo**  
   `ensureUserProfile` / Auth may set an initial **`photoURL`**. Product rule for v1: **custom upload wins** — write Storage URL to **`users.avatarUrl`** and propagate; or treat Auth photo as default when `avatarUrl == null`. Pick one and keep **`members`** in sync when that default changes (if you mirror Auth into `users.avatarUrl` on sign-in).

---

## Storage strategy

Firebase Storage object path (no extension in path is fine; set **`contentType`** on upload):

```text
avatars/{userId}
```

One object per user; **overwrite** on each upload — no orphan sweep. Example:

```text
avatars/abc123   ← current file for user abc123
```

---

## Data model

No new collections.

| Location | Field | Role |
| --- | --- | --- |
| `users/{userId}` | `avatarUrl` | Canonical for the account; self-read/write per rules. |
| `groups/{groupId}/members/{userId}` | `avatarUrl` | What the app reads for all **group-scoped** UI (feed hydration, shell, roster, profile-in-group). |
| `groups/{groupId}/pending/{pendingId}` | `avatarUrl` (add) | Snapshot at **submit** for approval queue. |
| `groups/{groupId}/feed/{postId}` | `avatarUrl` (add) | Snapshot at **approve** for feed cards (optional if you instead resolve from `members` on every render — denormalize is preferred for consistency with `displayName` and fewer reads). |

After every successful upload: **`getDownloadURL` → batch `users` + all `members/{groupId}/{uid}`** as above.

---

## Denormalization flow (upload)

```javascript
// After successful Storage upload to avatars/{userId}
const newAvatarUrl = await getDownloadURL(ref(storage, `avatars/${userId}`))

const batch = writeBatch(db)
batch.update(doc(db, `users/${userId}`), { avatarUrl: newAvatarUrl })

for (const groupId of user.groupIds /* after filtering stale/missing member docs */) {
  batch.update(doc(db, `groups/${groupId}/members/${userId}`), { avatarUrl: newAvatarUrl })
}

await batch.commit()
```

---

## UX flow

1. User opens **group profile** for **self** (`/group/:groupId/profile/:userId` where `userId === auth.uid`) and taps avatar / “Change photo” (exact control up to you; avoid clutter on **other** users’ profiles).
2. File picker (`accept="image/*"`).
3. Upload to **`avatars/{userId}`** with metadata.
4. Batch-write **`avatarUrl`** to **`users`** + **`members`** (all groups).
5. Listeners refresh avatars shell-side; **feed/pending** already snapshot old URLs on old rows.
6. Loading and error states; optional **retry**. Optional **v2**: remove photo (`avatarUrl: null` + delete Storage object).

**No crop or resize UI for v1** — optional follow-up: client resize / max bytes before upload.

---

## Firebase Storage rules

Add an `avatars` path; keep **`images`** rules as today unless you refactor.

```javascript
match /avatars/{userId} {
  allow read: if request.auth != null;
  allow write: if request.auth != null && request.auth.uid == userId;
  allow delete: if request.auth != null && request.auth.uid == userId;
}
```

- **`read` for any signed-in user** matches the current family-scale posture for `images/`; avatars are guessable by `userId` — acceptable only in a **closed** app. Tighten later (e.g. same-group check via `firestore.get`) if needed.

---

## Firestore rules (members)

Extend **`match /groups/{groupId}/members/{memberId}`** `allow update` so the **member** may update **`avatarUrl`** on **their own** doc, with **`changedKeys()`** restricted to **`['avatarUrl']`** and type **`string | null`**, without relaxing owner-only updates to **`progress`**, **`rejectionBanner`**, etc.

Keep **`selectedActivityIds`** self-update as a **separate** allowed shape (either **`hasOnly(['selectedActivityIds'])`** or **`hasOnly(['avatarUrl'])`**, or a documented combination if you ever batch both — usually upload only touches **`avatarUrl`**).

---

## Fallback UI

When **`avatarUrl`** is null/empty or **`<img onError>`**, show initials from **`displayName`** (and email like today). Centralize in a small **`Avatar`** component used by feed, shell, roster, approvals, profile — align with existing **`userInitials`** patterns in the repo (`GroupProfilePage`, `GroupLayout`, `GroupFeedPage`, etc.).

---

## Known limitations

- **No image moderation v1** — closed family assumption.
- **Loose client validation v1** — add max size / type checks when you want hardening.
- **`groupIds` vs reality** — if membership and `users.groupIds` ever drift, upload propagation must not assume every id is writable.

---

## Implementation checklist

- [x] Extend **`firestore.rules`**: member self-update for **`avatarUrl`** only (narrow `diff`).
- [x] Extend **`storage.rules`**: **`avatars/{userId}`** read/write/delete for owner uid.
- [x] **`avatarService`**: upload with **`contentType`**, **`getDownloadURL`**, batch **`users` + members** (with stale-id filtering).
- [x] **Profile (self only)**: tap target + file input + loading/error.
- [x] **`Avatar`** component: image + initials fallback + **`onError`** → initials.
- [x] Wire **`avatarUrl`** from **`members`** (or **`feed`/`pending`** snapshot) on: **GroupLayout**, **GroupFeedPage**, **GroupProfilePage**, **GroupInfoPage** roster, **GroupSettingsPage** members, **GroupApprovalsPage**.
- [x] **`createPendingSubmission`**: set **`avatarUrl`** from current **`members/{uid}`** (or `null`).
- [x] **`approvePendingSubmission`**: set **`feed`** post **`avatarUrl`** from **`members`** at approve time.
- [ ] **Tests / manual:** change photo → shell + roster update; new submission shows new face in queue; new approval shows new face on feed; old feed post unchanged.

---

## Rejected / deferred

| Idea | Why |
| --- | --- |
| Everyone reads `users/{uid}` for avatars | Violates DESIGN §10; use **`members`**. |
| Retroactively patch all **`feed`** posts on upload | Expensive, contrary to “snapshot at post time”. |
| Crop UI v1 | Scope; add later. |

---

## Phase Two (follow-up)

- **Tap to expand profile photo** (lightbox / zoom): [expandProfileImage-onepager.md](../phase-two/expandProfileImage-onepager.md)

---

## Doc location

Canonical spec: **`docs/phase-one/profilePics-onepager.md`**. Older references in [DESIGN.md](../mvp/DESIGN.md) to `docs/ProfilePics_onepager.md` should point here when that file is next edited.
