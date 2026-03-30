# Feed v2 — Feature Spec

> Status: Post-MVP  
> Last updated: March 2026  
> Parent doc: DESIGN.md

---

## Overview

Three additive improvements to the feed — pagination via **Load more**, likes and comments on posts, and filter chips for user and activity filtering. Changes are scoped to avoid unnecessary churn to the rest of the feed UI where possible.

**Implementation order (recommended):** Because feed security rules today are owner-only for writes (`allow write: if isGroupOwner`), Feed v2 requires **splitting** feed `write` into granular `create` / `update` / `delete` and adding member-scoped updates (likes) plus the comments subcollection. **Ship and verify rules first** (Firebase emulator or staging project, plus a small auth matrix: member vs owner) before building UI that depends on them — this matches prior pain with auth/rule mismatches.

---

## 1. Pagination — Load more + optional live “head” window

### Product behavior

- **Initial window:** 20 most recent posts (`orderBy('timestamp', 'desc')`, `limit(20)`).
- **Load more:** One-shot `getDocs` (or `getCount` is *not* used for totals) with `startAfter(lastDoc)` and the same `orderBy` + `limit(20)`; results **append** to the list (older segment).
- **Button** at the bottom (not auto infinite scroll) — predictable on mobile, no surprise reads.
- **Hide “Load more”** when the last page returns fewer than 20 documents (or empty).

### Pagination + real-time listener — proposed strategy

Today the app uses a **single `onSnapshot`** on a **fixed** `limit(50)` query (see `src/services/feedService.js`). Feed v2 narrows the live query to **N = 20** and adds **paged older segments** via **additional reads** only when the user taps **Load more**.

**Recommended hybrid (live newest + explicit older pages):**

1. **`onSnapshot`** on  
   `query(collection(..., 'feed'), orderBy('timestamp', 'desc'), limit(20))`  
   — This query is always “the **20 newest** documents.” It is **not** the same as “the first page we fetched and then froze.”

2. **Load more** uses **`getDocs`** with the same `orderBy`, `startAfter(cursor)`, `limit(20)`, where `cursor` is the **last document of the merged list** (see merge below). No listener on those older pages — **each click is one batch of reads** (≤20 document reads), then nothing until the next click.

3. **Merge rules (client state):**
   - Keep **`liveDocs`** from the snapshot (newest 20, ordered desc).
   - Keep **`olderDocs`** from successive **Load more** fetches (each page older than the previous cursor).
   - **Dedupe by `postId`:** if an id appears in both (unusual), prefer the snapshot version.
   - **Render order:** `[...liveDocs, ...olderDocsFiltered]` where `olderDocsFiltered` excludes any id already in `liveDocs`, and older segments stay in **descending** `timestamp` order.
   - When the snapshot fires because **someone posted**, the new post enters `liveDocs` and the **previous 20th** post **falls out** of the `limit(20)` window. That post does **not** automatically move into `olderDocs`; until the user loads more again, it may **temporarily disappear** from the UI. At family scale this edge case is usually acceptable; document it. Mitigations later: increase N slightly, or on snapshot diff explicitly **splice** dropped ids into a “buffer” (adds complexity).

**Simpler alternative (lowest cost, no merge edge cases):** **No listener** — only `getDocs` for first page + Load more, plus **pull-to-refresh** or a **Refresh** control to refetch the first page. **Minimum Firestore reads** and simplest mental model; you lose live prepend unless the user refreshes.

### Firestore reads / cost notes (listener vs one-shot)

- **Listener (`onSnapshot`):** Initial connection reads **one read per document** in the query result. Each time the query’s result set changes, you pay reads for **documents re-evaluated** as part of that update (Firebase pricing: listener updates are billed per document read in practice for changed snapshots — treat the **head query size** as your steady-state multiplier).
- **`limit(20)`** for the live query **reduces** per-sync reads vs `limit(50)` while keeping fewer “Load more” taps than a very small N.
- **Load more** = **`getDocs`** only when tapped — **no ongoing cost** for deep history until the user asks for it.
- **Avoid** a second full-feed listener or `onSnapshot` on a large `limit` “to get pagination for free” — every post change can re-read many documents.
- **Comments:** Prefer **`getDocs` once** when the user expands a post (or a **single** `onSnapshot` on **that post’s** `comments` query while expanded, then unsubscribe on collapse). Do **not** attach listeners to comments for every post in the list.

### Firestore query pattern (client)

```javascript
// Live head (optional listener)
const headQuery = query(
  collection(db, `groups/${groupId}/feed`),
  orderBy('timestamp', 'desc'),
  limit(20),
)

// Older page (one-shot; call again with new cursor after each "Load more")
const nextPageQuery = query(
  collection(db, `groups/${groupId}/feed`),
  orderBy('timestamp', 'desc'),
  startAfter(lastVisibleDocSnapshot),
  limit(20),
)
```

### Page size

N = 20 for both head and pages unless profiling suggests otherwise (balance: fewer “Load more” taps vs listener + image decode cost — see § “Feed performance & image optimization” below).

---

## Feed performance & image optimization

Perceived feed slowness at modest post counts (e.g. a dozen cards) is often **not** Firestore page size: the DOM may still pull **full-resolution** photos for every card while only displaying ~400×600 CSS pixels. Pagination helps cap **how many** cards (and thus images) exist at once; **image delivery** is the other half.

### Implemented in app today (`GroupFeedPage.jsx`)

- **Hero image (first post in feed order that has `imageUrl`):** `loading="eager"` and `fetchPriority="high"` so the browser prioritizes the likely **LCP** image.
- **All other post images:** `loading="lazy"` and `decoding="async"` so off-screen work is deferred and main-thread decode stays cooperative.

### Recommended next steps (especially toward ~150 photos)

| Priority | Action |
| --- | --- |
| High | **Thumbnails or resized URLs** for the feed (e.g. Storage resize extension, Cloud Function, or upload-time second file). Store `thumbUrl` (or a single width-capped URL) on the post and use it in the list; keep full `imageUrl` for detail/lightbox. |
| Medium | **Pagination (Feed v2)** with N≈20 so the list never mounts 150 full-bleed images at once; pair with lazy loading above. |
| Medium | **`srcset` / `sizes`** once multiple widths exist — matches layout (`max-w-3xl` column) and avoids shipping desktop-sized bytes to narrow viewports. |
| Lower | **List virtualization** if many text-heavy cards stay mounted without images — usually secondary to thumbs + pagination for this product. |

### Firestore / listener note

Smaller **head** queries reduce document reads per snapshot, but they do **not** shrink **per-image** bytes. Treat **image pipeline** and **DOM window size** as the main levers for scroll performance at scale.

---

## 2. Likes & Comments

### Likes

Likes are stored as an array of userIds on the feed post document. At family scale (max ~10 users) this never approaches the 1MB document limit.

**Data model addition to `groups/{groupId}/feed/{postId}`:**
```javascript
likes: string[]   // array of userIds who have liked the post
```

**Rules:**
- Any group member can like or unlike any post
- Like = `arrayUnion(userId)`, unlike = `arrayRemove(userId)`
- A user can like their own post
- Like count displayed on feed card (e.g. "3 likes")
- Heart icon toggles filled/unfilled based on whether `userId` is in `likes[]`

### Comments

Comments live in a subcollection under each feed post.

**New collection: `groups/{groupId}/feed/{postId}/comments/{commentId}`**
```javascript
{
  userId: string,
  displayName: string,
  avatarUrl: string | null,
  text: string,             // max 500 characters
  createdAt: timestamp
}
```

**Rules (behavioral — see the Firestore security rules section below):**  
Any **group member** may create a comment (with `userId == auth.uid`). Authors and the **group owner** may delete. Comments are immutable (`update` denied). Max length enforced in rules where possible and always client-side.

**Feed card comment display:**
- Show comment count on collapsed feed card (e.g. "2 comments") — either denormalized `commentCount` on the post (optional, extra writes) or **count via query** when expanded / lazy.
- Tap to expand inline comment thread below the post — no separate page
- Expanded state shows all comments + an input field to add a new one
- Only one card expanded at a time (collapsing another when a new one opens is optional) — limits concurrent comment listeners if you use `onSnapshot` while expanded

---

## 3. Filter Chips

A horizontal scrollable row of filter chips sits **below the feed page header** (mobile group title / context — there is **no** standings strip on the feed in Phase 1) and above the post list. Filters are additive — selecting both a user and an activity shows posts matching both.

### Filter types

**By user** — show posts by a specific member. Chip shows their avatar + first name.

**By activity** — show posts for a specific activity. Chip shows the activity name.

### Layout

```
┌─────────────────────────────────────────┐
│  [All]  [Paolo]  [Marco]  [Cycling]  → │  ← scrollable chip row
├─────────────────────────────────────────┤
│  feed posts filtered...                 │
```

- "All" chip resets all active filters
- Active filter chip is visually distinct (filled vs outlined)
- Multiple filters can be active simultaneously
- Chip row is always visible — not hidden when no filter is active

### Filtering approach

Filtering is applied **client-side** on already-loaded posts — no new Firestore queries. This keeps implementation simple and avoids Firestore composite index requirements.

Implication: filters only apply to posts already loaded. If the user has loaded 20 posts and filters by activity, they see filtered results from those 20. A note appears if filtered results are sparse: "Load more to see additional posts."

### Filter chip sources

- User chips: one per group member, sourced from `members` subcollection (already loaded)
- Activity chips: one per activity, sourced from `activities` subcollection (already loaded)
- Both lists already available in app state — no new reads required

---

## Data Model Summary of Changes

| Collection | Change |
|---|---|
| `groups/{groupId}/feed/{postId}` | Add `likes: string[]` |
| `groups/{groupId}/feed/{postId}/comments/{commentId}` | New subcollection |

No changes to existing feed post fields. Fully backward compatible — existing posts without `likes` treat it as an empty array.

---

## Feed Card Updated Layout

```
┌──────────────────────────────┐
│ [avatar]  Name    2hr ago 🥇 │
├──────────────────────────────┤
│         [ photo ]            │
│         ● ○ ○                │  ← dots if multi-photo (post-MVP)
├──────────────────────────────┤
│ Completed "Task" in Activity │
│ Optional description text    │
├──────────────────────────────┤
│ ♡ 3    💬 2 comments         │  ← like count + comment count
├──────────────────────────────┤  ← expanded comments section below
│ [PR] Paolo: Great job! 🗑    │  ← own comment shows delete
│ [MR] Marco: Amazing! 🗑      │  ← owner sees delete on all
│ ┌──────────────────────┐     │
│ │ Add a comment...     │     │
│ └──────────────────────┘     │
└──────────────────────────────┘
```

---

## Firestore security rules (aligned with `firestore.rules`)

**Context:** Rules live under `match /databases/{database}/documents { match /groups/{groupId} { ... } }`. Helpers **`groupDoc`**, **`isGroupMember(groupId)`**, and **`isGroupOwner(groupId)`** are already defined at the top of `firestore.rules`.

**Today (pre–Feed v2):** feed uses a single line:

```javascript
match /feed/{postId} {
  allow read: if isGroupMember(groupId);
  allow write: if isGroupOwner(groupId);
}
```

`write` is shorthand for **create, update, delete**. You **cannot** add a separate `allow update` for members without also **replacing** `write` with granular operations — otherwise member updates still fail the owner-only `write`.

**Replace** the `match /feed/{postId}` block with the following (keep the same nesting under `/groups/{groupId}`). Adjust only if product needs stricter validation on `likes` (e.g. list of strings only).

```javascript
match /feed/{postId} {
  allow read: if isGroupMember(groupId);

  // Owner-only lifecycle for post documents (approval / system posts / deletes).
  allow create, delete: if isGroupOwner(groupId);

  // Owner: any field. Member: only `likes` may change (toggle like / unlike).
  allow update: if isGroupOwner(groupId)
    || (
      isGroupMember(groupId)
      && request.resource.data.diff(resource.data).changedKeys().hasOnly(['likes'])
      && (request.resource.data.likes == null || request.resource.data.likes is list)
    );

  match /comments/{commentId} {
    allow read: if isGroupMember(groupId);

    allow create: if isGroupMember(groupId)
      && request.resource.data.userId == request.auth.uid
      && request.resource.data.displayName is string
      && request.resource.data.text is string
      && request.resource.data.text.size() > 0
      && request.resource.data.text.size() <= 500
      && (request.resource.data.avatarUrl == null || request.resource.data.avatarUrl is string)
      && request.resource.data.createdAt is timestamp;

    allow delete: if isGroupOwner(groupId)
      || (request.auth != null && resource.data.userId == request.auth.uid);

    allow update: if false;
  }
}
```

**Notes:**

- **`isGroupMember(groupId)`** — not a generic `isMember()`; matches production rules.
- **`changedKeys()`** — same diff style as `members` / `groups` updates elsewhere in `firestore.rules`.
- **Likes:** Optional tightening: assert each list entry is a `string` and size ≤ family max (advanced rules). Client still uses **`arrayUnion` / `arrayRemove`** with the current user id only.
- **`likes` type** — `null` or `list` keeps backward compatibility for documents that omit `likes` until first like.

**Rules-first verification (before UI):**

1. **Automated (repo):** `npm run test:rules` — runs Vitest against `tests/firestore.feed-rules.test.js` inside `firebase emulators:exec --only firestore`. **Requires Java (JRE/JDK 11+)** on your PATH for the Firestore emulator. If Java is missing, install Temurin/OpenJDK and retry.
2. **Manual / staging:** Deploy rules to a **staging** project and spot-check the same matrix in the app or Console.
3. Matrix intent: member **read** feed; member **cannot** `set` a new feed doc; owner **can**; member **`update` only `likes`** succeeds; member **`update` `displayName`** fails; comment **create** with matching `userId`; **delete** own comment; owner **delete** any comment; comments **not** `update`able.
4. Only then wire the client like/comment buttons (avoids chasing “auth broken” when rules were the real issue).

---

## Implementation checklist

### Firestore & safety
- [ ] Replace feed `allow write` with granular rules + comments subcollection (see above)
- [ ] `npm run test:rules` passes locally (Java + emulator)
- [ ] Optional: staging auth matrix before production deploy

### Pagination
- [ ] Head query `limit(20)` + `orderBy('timestamp', 'desc')`
- [ ] Implement merge strategy: live snapshot window vs `olderDocs` from `getDocs` + `startAfter`
- [ ] “Load more” button; hide when page &lt; 20
- [ ] Document or mitigate “20th post drops out of head window” when a new post arrives (see §1)

### Likes
- [ ] Add `likes: []` when creating feed posts (`approvalService`, `groupSettingsService` system lines, etc.)
- [ ] Heart UI + `arrayUnion` / `arrayRemove`
- [ ] Rules already allow member `likes`-only updates once deployed

### Comments
- [ ] `comments` subcollection + UI (expand, input, delete)
- [ ] Prefer one-shot `getDocs` or a **single** snapshot while expanded; unsubscribe on collapse
- [ ] Client 500-char limit; rules enforce max length on create

### Filters
- [ ] Scrollable chip row under feed header
- [ ] “All” chip resets filters
- [ ] Client-side filter on merged loaded list + sparse-result hint
- [ ] Active chip styling

### Feed performance & images
- [x] Hero vs lazy images + `decoding="async"` on `GroupFeedPage` (see “Feed performance & image optimization”)
- [ ] Feed **thumbnails** / resized URLs on post docs (`thumbUrl` or equivalent) for list rows
- [ ] Optional: `srcset` once multiple sizes are available

---

## Rejected Alternatives

| Approach | Why rejected |
|---|---|
| Numbered pagination | Requires total post count — expensive in Firestore; unnatural for feeds |
| Auto-trigger infinite scroll | Accidental loads on mobile; "Load more" is more predictable |
| Server-side filtering | Requires composite Firestore indexes; client-side sufficient at this scale |
| Sort button | Newest-first is the only sensible order for a competition feed |
| Nested comment replies | Scope creep — flat comments sufficient for family scale |
| Comments on a separate page | Inline expansion keeps context; separate page loses feed position |