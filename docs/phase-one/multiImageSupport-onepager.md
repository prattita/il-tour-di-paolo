# Multi-Photo Uploads — Feature Spec

> **Phase One — Task 5** (after [Feed v2](./groupfeedpagev2-onepager.md))  
> Status: Post-MVP / not yet implemented  
> Last updated: March 2026  
> Parent doc: [DESIGN.md](../mvp/DESIGN.md)

---

## Overview

Allow users to upload up to 3 photos per task completion submission. In the feed, multi-photo posts show a swipe-based photo gallery with dot indicators. **Single-photo posts** keep the same UX as today: one image, no dots, no swipe — but they should still use the **`photos[]` model with exactly one element** so the feed and approval paths have one shape (unless you explicitly bridge `imageUrl` for reads only; see § Scope).

---

## Scope & data migration

- **No backfill required for this rollout:** We are not migrating historical groups. New work can assume **`photos[]` on new pendings and new feed posts** once the feature ships. Optional bridging for old docs (read `imageUrl` if `photos` missing) is only needed if you ever reopen old groups in the same project.
- **Green-field groups:** Creating a new group after this work avoids mixed-schema pendings and feed posts.

---

## Worth calling out (implementation)

1. **Storage:** All upload objects live under the **`images/`** prefix. See `src/services/storageService.js` (today: `images/{pendingId}/{photoId}/photo`, where **`pendingId` is the Firestore pending document id** — not a “pending” folder in Storage). Multi-photo should use **stable slot identifiers** (e.g. `photo_1` … `photo_3`) instead of a random `photoId` per file so resubmits overwrite the same objects and deletes are predictable. Update **`storage.rules`** if paths or shape change.
2. **Firestore rules:** `pending` create/update validation likely references **`imageUrl`** / **`imagePath`** today. Extend or replace with **`photos[]`** (length 1–3, required fields per element). Same for any feed rules that assume scalar image fields.
3. **Touch surface vs vertical scroll:** Swipe-left/right on the carousel should use a **horizontal threshold** (and careful `touch-action`) so the feed still scrolls comfortably; tap thirds are the fallback.
4. **Feed v2 interaction:** `FeedPostCard` already owns likes, comments, and **hero vs lazy** image loading (`GroupFeedPage`’s `firstImagePostId`). Multi-photo logic lives in the same card: hero/`fetchPriority` should apply to **the visible slide** (usually index 0 initially). **“First image” detection** for the hero must key off **`photos[0]`** (or legacy `imageUrl` if you keep a bridge).
5. **Layout change vs current feed:** Today the feed uses **fixed heights** on the image wrapper in `FeedPostCard` (`h-[500px]` / `sm:h-[700px]`). This spec uses **`aspect-ratio` from the first photo’s dimensions** plus a **`max-height`** so the **carousel does not change height when swiping**. Expect to replace or branch that wrapper for posts with `photos.length > 1`; single-photo can follow either the new aspect-ratio pattern or the existing fixed-height pattern for consistency (pick one and document in code).
6. **Approval transaction:** `approvePendingSubmission` builds the feed post from the pending doc. It must **copy every photo** (Storage copy or re-point URLs—match whatever pattern you use today for a single image) and write **`photos[]`** on the feed doc. **Reject / withdraw** must delete **all** storage objects for that pending, not only `imagePath`.
7. **Owner remove-member / cleanup:** Any batch that deletes pendings and cleans Storage (e.g. `groupSettingsService`) must loop **all** photo paths for a pending doc, not a single `imagePath`.
8. **Docs reference:** `FEED_IMAGE_RENDERING.md` is cited below for “natural ratio” single-photo behavior; if that file does not exist in-repo, treat **current `FeedPostCard` + this spec** as source of truth.
9. **Naming:** Keep **`pendingId`** (and rules segment names) as-is in existing code — it matches the **`pending`** collection and composite doc id. For **new** helpers introduced with this work (e.g. multi-upload, batch deletes), prefer a **clearer parameter name** only when it reduces confusion (e.g. Storage helpers where “this string is the Firestore pending **document** id” matters). No repo-wide rename for cosmetics.

---

## Upload Flow Changes

On the task completion form, users can add up to 3 photos:

- At least 1 photo is still required (unchanged from MVP)
- A "+ Add photo" button appears below the first uploaded image, up to the 3-photo cap
- Each photo can be removed individually before submission
- Photos are ordered by upload order — no reordering UI for MVP

```
┌─────────────────────┐
│     photo 1 ✕       │  ← first upload, required
└─────────────────────┘
┌─────────────────────┐
│     photo 2 ✕       │  ← optional
└─────────────────────┘
       + Add photo         ← hidden once 3 photos uploaded
```

---

## Storage

Each photo is a separate Storage object. Paths are always under **`images/...`** (see `storageService.js` and Storage rules).

**While submitted (before approval)** — keyed by the pending submission’s Firestore doc id (`pendingId`):

```
images/{pendingId}/photo_1/photo
images/{pendingId}/photo_2/photo
images/{pendingId}/photo_3/photo
```

**After approval** (`postId` = new feed document id):

```
images/feed/{postId}/photo_1/photo
images/feed/{postId}/photo_2/photo
images/feed/{postId}/photo_3/photo
```

Use **indexed slots** (`photo_1` … `photo_3`) so resubmits overwrite the same keys and orphan cleanup stays obvious. If you prefer flatter keys, keep the same **stable slot** idea and document the exact pattern in `storageService.js`.

> **Approve strategy (single photo today):** The feed doc stores **`imageUrl`** pointing at an object that remains under **`images/{pendingId}/...`** after the pending Firestore doc is deleted. For **multi-photo**, choose explicitly: **(A)** on approve, **copy** each file to **`images/feed/{postId}/photo_N/photo`** (clear ownership); or **(B)** keep URLs under **`images/{pendingId}/...`** for all slots (no copy; URLs still tied to that id). **(A)** is recommended.

---

## Data Model Changes

### `groups/{groupId}/pending/{pendingId}`

Replace single `imageUrl` / `imagePath` / `imageWidth` / `imageHeight` (current MVP shape) with an array:

```javascript
photos: [
  { url: string, width: number, height: number, path: string },  // path = Storage path for delete; required
  // optional second and third elements — same shape
]
// min length: 1 — max length: 3
```

Drop legacy scalars from **new** writes once the form and services migrate. **`path` per item** (or equivalent) keeps reject/withdraw/delete logic symmetric without guessing filenames.

### `groups/{groupId}/feed/{postId}`

Same — **`photos[]`** on the feed post, authored from the approved pending doc and final Storage locations. Likes, comments, `commentCount`, and `type: 'task_completion'` stay as today ([Feed v2](./groupfeedpagev2-onepager.md)).

---

## Feed Rendering

### Single photo post
No carousel UI — **`photos.length === 1`**: no dots, no swipe. Rendering should match the **single-image** layout you choose in `FeedPostCard` (fixed viewport height vs. first-photo `aspect-ratio` + `max-height`; see § “Worth calling out”).

### Multi-photo post

**Baseline navigation (ship first, mobile-first):**

- **Swipe** left/right — primary on touch; use a horizontal threshold so vertical feed scroll still feels natural.
- **Tap / click zones** — invisible (or low-contrast) **left/right thirds**, full image height: works as the main **mouse** affordance on desktop if you add nothing else.
- **Dots** below the image when `photos.length > 1` (see below).

Do **not** assume **drag-to-pan** on desktop unless you explicitly build it; many users won’t try it.

```
┌──────────────────────────┐
│  [tap zone] │ [tap zone] │  ← click or tap; full image height
│             │            │
│       photo 1            │
│             │            │
└──────────────────────────┘
         ● ○ ○              ← dot indicators
```

**Dot indicators:**
- Shown below the image only when `photos.length > 1`
- Filled dot = current photo, empty dot = other photos (optional: **click dot to jump** — see variant D)
- Hidden entirely for single-photo posts

```
● ○ ○   (on photo 1 of 3)
○ ● ○   (on photo 2 of 3)
○ ○ ●   (on photo 3 of 3)
```

**Navigation state is local to each feed card** — navigating photos on one card does not affect any other card.

### Carousel navigation variants (codified for experiments)

After the core carousel works, you can swap or combine these. Suggested: implement behind a **single enum or constant** in `FeedPostCard` (or a small `FeedPhotoCarousel` helper) so you can try modes without rewriting gesture code.

| Id | Name | Behavior | Pros | Cons |
| --- | --- | --- | --- | --- |
| **A** | **Baseline** | Swipe (touch) + **tap thirds** + dots. No visible arrows. | Cleanest feed; matches original spec intent. | Desktop: thirds are **undiscoverable** until users click around. |
| **B** | **Hover chevrons (desktop)** | Same as A; on **`sm:`+** or **`@media (pointer: fine)`**, show **subtle L/R chevrons** when the carousel is hovered or focused. | Strong desktop hint; mobile unchanged if gated. | Slight chrome; needs hover (no hover on touch — use pointer media query). |
| **C** | **Persistent soft arrows** | Small circular **prev/next** controls overlaid on left/right edges (always on multi-photo, or from `md:` up). **Min ~40px hit target** — tallies with Phase 10 tap targets. | Obvious everywhere; no discoverability problem. | Busier than A; rejected *tiny* text arrows, not necessarily these. |
| **D** | **Dots as index control** | Dots are **buttons** that jump to slide `index` (in addition to or instead of swipe). | Fast jump to photo 3; familiar pattern. | More interactive elements; ensure focus/ARIA. |
| **E** | **Keyboard** | When the carousel (or a wrapper) has **focus**: **`ArrowLeft` / `ArrowRight`** change slide (clamp or wrap — **clamp** is safer in a feed). | Laptop users, accessibility. | Must be **focusable** (`tabIndex={0}`) without trapping tab through the whole feed; consider **roving tabindex** or “focus only when clicked”. |
| **F** | **Pointer drag (optional)** | Mouse/pointer **drag** horizontal to change slide (with threshold), in addition to tap zones. | Matches “gallery” mental model for some desktop users. | Easy to **fight vertical page scroll** or text selection; more implementation + QA. |

**Combining:** Common production combos are **A + B + E**, or **A + C + E**. **F** is optional last.

**Approvals / owner preview:** Use the **same variant** as the feed, or a fixed **C + D** if owners need maximum clarity (no A/B test on a thin queue).

---

## Fixed Aspect Ratio per Post

To prevent feed cards from jumping in height when navigating between photos of different orientations, the card's image container is locked to the **first photo's aspect ratio** for the entire post.

All subsequent photos are rendered within that fixed frame using `object-fit: contain`. A neutral background fills any letterbox space for photos with a different ratio.

```css
.feed-image-container {
  width: 100%;
  aspect-ratio: firstPhoto.width / firstPhoto.height;  /* set via inline style */
  max-height: 520px;
  background: var(--color-background-secondary);
  overflow: hidden;
  position: relative;
}

.feed-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
```

This keeps the feed visually stable — card heights never change during navigation, and nothing below jumps when swiping between photos. Small letterboxing on mismatched photos is an acceptable tradeoff.

> **Why first photo's ratio?** The user uploads photos in order — the first is typically the primary proof shot. Anchoring to it gives the most important image the best presentation.

---

## Aspect Ratio Skeleton

Pre-allocate the correct image container size before photos load using the stored dimensions. Prevents layout shift as feed posts stream in.

```jsx
<div
  className="feed-image-container"
  style={{
    aspectRatio: `${post.photos[0].width} / ${post.photos[0].height}`
  }}
>
  <img src={post.photos[currentIndex].url} className="feed-image" />
  {post.photos.length > 1 && (
    <DotIndicator total={post.photos.length} current={currentIndex} />
  )}
</div>
```

---

## Approval Queue Changes

Owner sees all photos for a submission using the same swipe + dot navigation as the feed. Lets the owner review all submitted photos before approving or rejecting.

---

## Resubmission Behavior

On rejection, delete **every** Storage object for that submission (all paths under the submission’s **`images/{pendingId}/...`** prefix — `pendingId` is the pending doc id). The user resubmits from scratch — no partial photo retention.

On resubmission, new photos overwrite the same indexed slots (`photo_1` … `photo_3`) — consistent with the overwrite-safe strategy.

---

## Implementation Checklist

- [ ] Update task completion form to support 1–3 photo uploads
- [ ] Add "+ Add photo" button with 3-photo cap enforcement
- [ ] Allow individual photo removal before submission
- [ ] Update Storage upload logic: indexed paths under `images/{pendingId}/photo_{1..3}/...` (drop random `photoId` per file or reserve it only for legacy)
- [ ] Extend **`storageService`** (and callers) for multi-upload + multi-delete by path list
- [ ] Update `pending` and `feed` data model to **`photos[]`**; adjust **Firestore rules** for create/update
- [ ] Update **withdraw** and **reject** to delete **all** `photos[*].path` (and any legacy single-path fallback if still supported)
- [ ] Update **approve** transaction: write feed post with full `photos[]` + copy or finalize Storage under `images/feed/{postId}/...`
- [ ] **Owner remove-member** (and similar): delete all pending photos for affected pendings
- [ ] `FeedPostCard` + `GroupFeedPage`: branch on `photos.length`; hero/lazy + **first image post** detection use `photos[0]`
- [ ] Build swipe gesture handler for multi-photo feed cards (scroll-friendly thresholds)
- [ ] Build invisible left/right tap zone fallback
- [ ] Centralize carousel behavior (e.g. `FeedPhotoCarousel` or enum) so **§ Carousel navigation variants** A–F can be toggled without a rewrite
- [ ] Build dot indicator component (hidden when `photos.length <= 1`; optional click-to-index per variant **D**)
- [ ] Lock multi-photo container to **first photo's aspect ratio** + `max-height`; `object-fit: contain` for slides
- [ ] Apply aspect-ratio skeleton from stored dimensions (reduce layout shift)
- [ ] **GroupApprovalsPage** / pending preview: same swipe + dots as feed for multi-photo rows

---

## Rejected Alternatives

| Approach | Why rejected |
|---|---|
| **Tiny** inline `<` `>` text links as the only control | Poor tap targets on mobile; looks cheap; **variant C** (proper circular controls) is fine if you want visible chrome |
| Thumbnail strip below image | Adds height to every feed card, clutters single-photo posts |
| Lightbox / full screen tap | Adds an extra interaction layer — swipe inline is simpler |
| Variable card height per photo | Feed cards jump in size during navigation — jarring mid-scroll |
| Unlimited photos | Storage cost and feed performance — 3 is enough for proof of completion |