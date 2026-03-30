# Feed v2 — Feature Spec

> Status: Post-MVP
> Last updated: March 2026
> Parent doc: DESIGN.md

---

## Overview

Three additive improvements to the feed — pagination via infinite scroll, likes and comments on posts, and filter chips for user and activity filtering. Changes are scoped to avoid structural changes to the existing feed page or data model where possible.

---

## 1. Pagination — Infinite Scroll with Load More

### Approach

Load 20 posts on initial render. As the user scrolls to the bottom, a **"Load more" button** appears and loads the next 20. This is simpler and more predictable than auto-triggering on scroll, and avoids accidental loads on mobile.

Numbered pagination is not used — it requires knowing total post count upfront, which is expensive in Firestore, and feels unnatural for a social feed.

### Firestore query pattern

```javascript
// Initial load
const first = query(
  collection(db, `groups/${groupId}/feed`),
  orderBy("timestamp", "desc"),
  limit(20)
)

// Subsequent loads — startAfter last visible document
const next = query(
  collection(db, `groups/${groupId}/feed`),
  orderBy("timestamp", "desc"),
  startAfter(lastVisibleDoc),
  limit(20)
)
```

### Behavior

- Initial load: 20 most recent posts
- "Load more" button appears below last post if more exist
- Clicking "Load more" appends next 20 — does not reload existing posts
- New posts arriving via real-time listener prepend to top automatically (existing behavior)
- "Load more" hidden when all posts have been loaded
- Loading spinner shown on button while fetching

### Page size

N = 20 posts per page. Revisit if feed grows significantly — adjustable without data model changes.

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

**Rules:**
- Any group member can add a comment
- A user can delete their own comments
- Owner can delete any comment
- Comments ordered by `createdAt` ascending (oldest first, chronological thread)
- No nested replies for MVP of this feature — flat comment list only
- Max comment length: 500 characters, enforced client-side

**Feed card comment display:**
- Show comment count on collapsed feed card (e.g. "2 comments")
- Tap to expand inline comment thread below the post — no separate page
- Expanded state shows all comments + an input field to add a new one
- Only one card expanded at a time (collapsing another when a new one opens is optional)

**Firestore rules addition:**
```javascript
match /feed/{postId}/comments/{commentId} {
  allow read: if isMember();
  allow create: if isSignedIn()
    && request.resource.data.userId == request.auth.uid;
  allow delete: if isOwner()
    || resource.data.userId == request.auth.uid;
  allow update: if false;   // comments are immutable once posted
}
```

---

## 3. Filter Chips

A horizontal scrollable row of filter chips sits between the feed top bar (User Tracker strip) and the first feed post. Filters are additive — selecting both a user and an activity shows posts matching both.

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

## Firestore Security Rules Updates

```javascript
// Add to existing feed rules
match /feed/{postId} {
  allow read: if isMember();
  allow write: if isOwner();

  // Likes — members can update likes array on any post
  allow update: if isMember()
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['likes']);

  // Comments subcollection
  match /comments/{commentId} {
    allow read: if isMember();
    allow create: if isSignedIn()
      && request.resource.data.userId == request.auth.uid;
    allow delete: if isOwner()
      || resource.data.userId == request.auth.uid;
    allow update: if false;
  }
}
```

---

## Implementation Checklist

### Pagination
- [ ] Update feed query to use `limit(20)` with `orderBy("timestamp", "desc")`
- [ ] Add "Load more" button below last post
- [ ] Implement `startAfter` cursor for subsequent pages
- [ ] Hide "Load more" when all posts loaded
- [ ] Preserve real-time listener for new posts prepending to top

### Likes
- [ ] Add `likes: []` default to new feed posts on approval
- [ ] Add heart icon to feed card with like count
- [ ] Toggle like with `arrayUnion` / `arrayRemove`
- [ ] Filled/unfilled heart based on current user's like status
- [ ] Update Firestore rules to allow member like updates

### Comments
- [ ] Create `comments` subcollection under feed posts
- [ ] Add comment count to feed card
- [ ] Inline expandable comment thread on tap
- [ ] Add comment input field in expanded state
- [ ] Show delete button on own comments
- [ ] Show delete button on all comments for owner
- [ ] Enforce 500 character limit client-side
- [ ] Update Firestore rules for comments subcollection

### Filters
- [ ] Build scrollable filter chip row
- [ ] "All" chip resets active filters
- [ ] User chips sourced from members list
- [ ] Activity chips sourced from activities list
- [ ] Client-side filtering on loaded posts
- [ ] "Load more to see additional posts" hint when filtered results sparse
- [ ] Active chip visual state (filled vs outlined)

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