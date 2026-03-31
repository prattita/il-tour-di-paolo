# Expand profile image (lightbox) — Mini spec

> Status: **Phase Two** (post Phase One)  
> Last updated: March 2026  
> Related: [Profile pictures](../phase-one/profilePics-onepager.md), [DESIGN.md](../mvp/DESIGN.md)

---

## Goal

Let users **open a profile photo at a larger size** (tap avatar → fullscreen or modal), so faces and details are visible without editing the image. Applies at minimum to **group profile** avatars; optionally the same pattern for **small avatars elsewhere** (shell, roster) if product wants consistency.

---

## Scope (v1)

- **Trigger:** tap on avatar where a **real image** is shown (`avatarUrl` present and loaded). If showing **initials fallback**, either no-op or same tap does nothing (or opens a generic placeholder — prefer **no-op**).
- **Presentation:** centered image on a **dimmed scrim** (modal / lightbox). **Close:** backdrop tap, **X** or **Done** control, **`Escape`** on desktop.
- **Accessibility:** focus moves into the lightbox, **`aria-modal`**, return focus on close; visible close control; respect `prefers-reduced-motion` for enter/exit.
- **Content:** use the **same URL** already in context (`members.avatarUrl`, or `post.avatarUrl` if reused later) — no new backend.

**Optional polish (same phase or fast-follow):** pinch-to-zoom / pan on touch devices; very small dependency or minimal CSS-only zoom is acceptable.

---

## Out of scope (v1)

- **Image editing:** crop, rotate, filters — separate from “view large.”
- **Replacing** the Phase One **change photo** flow (green camera control stays on profile).
- **Different UX for task-completion photos** — those already use **`FeedPhotoLightbox`** in the feed; avatars should use the **same** component for consistency (see **Implementation** below). This doc’s **first wiring target** is the **group profile** avatar.

---

## Backburner (explicitly not Phase One)

- **“Refresh feed” / dynamic avatars:** Old **`feed`** posts keep a **snapshot** `avatarUrl`; after a profile re-upload, Firebase download URLs change and **old URLs may 404**, so the UI correctly falls back to initials. **Fixing that** means a separate decision: live reads from **`members`**, backfill jobs, etc. — **not required for Phase One** and **not part of this lightbox spec.** Track when you tackle Feed v2 or denorm strategy.

---

## Implementation — reuse **`FeedPhotoLightbox`**

The feed already ships **`FeedPhotoLightbox`** (`src/components/FeedPhotoLightbox.jsx`): scrim, close (X + **Done** on narrow viewports), **Escape**, backdrop dismiss, swipe-down-to-close, body scroll lock, `role="dialog"` + **`aria-modal`**. For a profile photo, pass a **one-element** `photos` array; carousel chrome (prev/next, counter) only appears when `photos.length > 1`.

**Example:**

```javascript
<FeedPhotoLightbox
  isOpen={lightboxOpen}
  photos={[{ url: avatarUrl }]}
  onClose={() => setLightboxOpen(false)}
/>
```

**Do not reuse `FeedPhotoExpandButton`** for avatars — it is styled for a **bottom-right control on rectangular feed media**, not for circular profile pictures. Use **tap on the avatar** or a **separate “View” / icon affordance** (especially on self-profile).

**`alt` / meaningful labels:** `FeedPhotoLightbox` renders images via **`FeedPhotoCommitTransition`**, which supports an optional **`getImgProps(index)`** hook, but the lightbox **does not forward that prop yet**. Feed photos use empty `alt`. For profile, consider a small extension (e.g. optional `getImgProps` or `imageAlt` on `FeedPhotoLightbox`) so the large image has **`alt`** = display name (or equivalent).

**`prefers-reduced-motion`:** Already handled inside **`FeedPhotoCommitTransition`** via **`usePrefersReducedMotion`**.

**Accessibility follow-up (shared with feed):** This spec asks for **focus move into the lightbox** and **restore focus on close**. `FeedPhotoLightbox` does not yet implement focus trapping / return focus; implementing that **once** on the shared component benefits **both** feed and profile.

---

### Profile wiring

1. When **`avatarUrl`** is present and the image is not in an error state, open the lightbox from tap (and/or secondary control per product choice).
2. For **viewing others**, tapping the avatar is straightforward.
3. For **self**, avoid competing with the **change photo** file input: prefer **lightbox only for others** in v1, or a **secondary “View”** link/control so the primary action stays “change photo.”

**Open product choice (pick at implementation):** self-profile with **both** “change photo” and “view large” — recommend **secondary affordance** (link or icon).

**Reuse elsewhere:** Same **`FeedPhotoLightbox`** can open **approval-queue** avatars or other **`avatarUrl`** surfaces without a second overlay implementation.

---

## Checklist

- [ ] Wire **`FeedPhotoLightbox`** on **group profile** (`photos={[{ url: avatarUrl }]}`); decide **self** UX (link vs icon vs defer to “others only”)
- [ ] Optional: extend **`FeedPhotoLightbox`** to pass **`getImgProps`** (or `imageAlt`) for a meaningful **`alt`** on profile opens
- [ ] Optional: **focus trap** + **return focus** on `FeedPhotoLightbox` (improves feed + profile together)
- [ ] Optional: pinch/zoom on touch
- [ ] Document in DESIGN.md §6 / profile note when shipped

---

## Why Phase Two

Phase One delivers **upload**, **denorm**, and **rules**. Expand/zoom is **UX polish** with no schema change; shipping it after Phase One keeps the critical path short and avoids blocking Stats / Feed v2 planning.
