# View Full Image — Feature Spec

> Status: Phase One (post-MVP)  
> Last updated: March 2026  
> Parent docs: [DESIGN.md](../mvp/DESIGN.md), [multiImageSupport-onepager.md](./multiImageSupport-onepager.md)

---

## Overview

Add a lightweight **View full** experience for feed photos so users can inspect details when feed cards use cropped, full-bleed rendering (`object-cover`).

This is a **progressive enhancement**: the feed remains media-first and fast to scan; full-view is opt-in.

---

## Problem

Current feed cards (single and multi-photo) prioritize visual consistency with fixed-height, full-bleed media. That can crop edges of some photos. For proof-oriented content, users occasionally need the uncropped view.

---

## Product behavior

- A subtle **View full** control appears on feed media.
- Tapping opens a full-screen modal/lightbox.
- The image is shown with **`object-contain`** (uncropped) on a dark backdrop.
- For multi-photo posts, modal opens at the **current carousel index**.
- Modal supports:
  - close button
  - backdrop tap to close
  - Escape key to close
  - previous/next navigation for multi-photo
- Feed position/state is preserved when closing.

---

## UX notes

- Keep feed cards cropped (`object-cover`) for rhythm and consistency.
- Use full-view only for detail inspection.
- Control styling should be visible but quiet (small pill/button over media).
- On desktop, keep arrow controls and keyboard navigation in modal.

---

## Scope

### In scope (MVP)

- Modal/lightbox from feed cards
- Uses existing `photos[]` data and carousel index
- Navigation for multi-photo inside modal
- Accessibility basics (focus target, Escape, labels)

### Out of scope (future polish)

- Pinch/zoom and pan
- Rich animations
- image prefetching strategy
- Full keyboard focus trap hardening beyond essentials

---

## Technical approach

- Add local state at card/carousel level for `isFullOpen` + `fullIndex`.
- Reuse existing photo arrays from `normalizeDocPhotos`.
- Implement a small reusable component (e.g. `FeedPhotoLightbox`) under `src/components/`.
- Keep logic self-contained; avoid touching feed pagination/filter logic.

---

## Performance considerations

- No new Firestore reads/writes.
- Reuse already loaded image URLs.
- Optional: lazy-load modal image only when opened.

---

## Implementation checklist

- [x] Add `View full` trigger on single and multi-photo feed media
- [x] Create `FeedPhotoLightbox` component (`object-contain` image, dark backdrop)
- [x] Wire open-at-current-index from `FeedPhotoCarousel`
- [x] Add prev/next controls in modal for multi-photo
- [x] Close interactions: X, backdrop, Escape
- [x] Ensure mobile + desktop behavior parity
- [x] Run `npm run lint` and `npm run build`

---

## Rough effort

- MVP: **~1–2 hours**
- Polished (zoom/pan, advanced keyboard/focus, animation): **~3–5 hours**

---

## Rejected alternatives

| Approach | Why rejected |
|---|---|
| Switch feed cards to `object-contain` | Fixes crop but hurts feed consistency and scanability |
| Increase card heights indefinitely | Delays crop issue, increases scroll fatigue |
| Separate image details page route | Higher navigation cost; loses feed context |
