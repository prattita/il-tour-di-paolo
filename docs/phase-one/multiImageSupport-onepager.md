# Multi-Photo Uploads — Feature Spec

> Status: Post-MVP  
> Last updated: March 2026  
> Parent doc: DESIGN.md

---

## Overview

Allow users to upload up to 3 photos per task completion submission. In the feed, multi-photo posts show a swipe-based photo gallery with dot indicators. Single-photo posts are unchanged.

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

Each photo is stored as a separate file under the submission path:

```
pending/{pendingId}/photo_1
pending/{pendingId}/photo_2
pending/{pendingId}/photo_3
```

On approval, copied to permanent feed paths:

```
feed/{postId}/photo_1
feed/{postId}/photo_2
feed/{postId}/photo_3
```

Indexed filenames instead of random IDs keep storage clean and avoid orphaned files on resubmission. Consistent with the overwrite-safe pattern used in `PROFILE_PICTURES.md`.

---

## Data Model Changes

### `groups/{groupId}/pending/{pendingId}`

Replace single `imageUrl` / `imageWidth` / `imageHeight` fields with an array:

```javascript
photos: [
  { url: string, width: number, height: number },  // required
  { url: string, width: number, height: number },  // optional
  { url: string, width: number, height: number }   // optional
]
// min length: 1 — max length: 3
```

### `groups/{groupId}/feed/{postId}`

Same change — replace single image fields with `photos[]` array. Carries through from pending on approval.

---

## Feed Rendering

### Single photo post
Unchanged from MVP — no navigation controls shown. Follows natural ratio rendering per `FEED_IMAGE_RENDERING.md`.

### Multi-photo post

**Navigation — swipe primary, tap zones secondary:**
- Swipe left/right to navigate between photos — the dominant mobile gesture, no UI chrome needed
- Invisible left/right tap zones covering the left and right thirds of the image as a fallback
- No visible arrow buttons — keeps the image clean

```
┌──────────────────────────┐
│  [tap zone] │ [tap zone] │  ← invisible, full image height
│             │            │
│       photo 1            │
│             │            │
└──────────────────────────┘
         ● ○ ○              ← dot indicators, only persistent UI
```

**Dot indicators:**
- Shown below the image only when `photos.length > 1`
- Filled dot = current photo, empty dot = other photos
- Hidden entirely for single-photo posts

```
● ○ ○   (on photo 1 of 3)
○ ● ○   (on photo 2 of 3)
○ ○ ●   (on photo 3 of 3)
```

**Navigation state is local to each feed card** — navigating photos on one card does not affect any other card.

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

On rejection, all photos for that submission are deleted from `pending/{pendingId}/` in Storage. The user resubmits from scratch — no partial photo retention.

On resubmission, new photos overwrite old ones at `photo_1`, `photo_2`, `photo_3` — consistent with the overwrite-safe storage strategy.

---

## Implementation Checklist

- [ ] Update task completion form to support 1–3 photo uploads
- [ ] Add "+ Add photo" button with 3-photo cap enforcement
- [ ] Allow individual photo removal before submission
- [ ] Update Storage upload logic to write indexed paths (`photo_1`, `photo_2`, `photo_3`)
- [ ] Update `pending` and `feed` data model from single image fields to `photos[]` array
- [ ] Update approval flow to copy all photos from `pending/` to `feed/` paths
- [ ] Update approval flow to delete all photos on rejection
- [ ] Build swipe gesture handler for multi-photo feed cards
- [ ] Build invisible left/right tap zone fallback
- [ ] Build dot indicator component (hidden for single-photo posts)
- [ ] Lock image container to first photo's aspect ratio
- [ ] Render all photos with `object-fit: contain` within fixed container
- [ ] Apply aspect-ratio skeleton placeholder using first photo's dimensions
- [ ] Update approval queue to show multi-photo swipe navigation for owner review

---

## Rejected Alternatives

| Approach | Why rejected |
|---|---|
| `<` `>` text button arrows | Too small as tap targets on mobile; visual noise on feed cards |
| Thumbnail strip below image | Adds height to every feed card, clutters single-photo posts |
| Lightbox / full screen tap | Adds an extra interaction layer — swipe inline is simpler |
| Variable card height per photo | Feed cards jump in size during navigation — jarring mid-scroll |
| Unlimited photos | Storage cost and feed performance — 3 is enough for proof of completion |