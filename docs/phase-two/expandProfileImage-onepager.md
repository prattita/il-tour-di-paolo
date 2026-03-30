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
- **Feed post photo** lightbox (task completion image) — can share the same **component** later, but this doc targets **avatar** first.

---

## Backburner (explicitly not Phase One)

- **“Refresh feed” / dynamic avatars:** Old **`feed`** posts keep a **snapshot** `avatarUrl`; after a profile re-upload, Firebase download URLs change and **old URLs may 404**, so the UI correctly falls back to initials. **Fixing that** means a separate decision: live reads from **`members`**, backfill jobs, etc. — **not required for Phase One** and **not part of this lightbox spec.** Track when you tackle Feed v2 or denorm strategy.

---

## Implementation sketch

1. **`AvatarLightbox`** (or generic **`ImageLightbox`**) — controlled open state, `src` + `alt` (e.g. display name), portal or fixed overlay at `z-50+`.
2. **Profile page:** when `avatarUrl` and not in error state, wrap avatar (or use `onClick` on the **non-self** view only if you want zoom for others; for **self**, avoid fighting the file `label` — e.g. long-press / secondary “View” or tap **outside** the change-photo label; simplest v1: **lightbox only for viewing other members’ profiles**, or add a small “View” text link under “You”).
3. **Reuse:** same overlay component if you later open **feed** or **approval** avatars.

**Open product choice (pick at implementation):** self-profile with **both** “change photo” and “view large” — recommend **secondary affordance** (link or icon) so the primary label stays “change photo” without accidental file picker.

---

## Checklist

- [ ] Lightbox component (scrim, image, close, focus trap, Escape)
- [ ] Wire on **group profile** for at least **other members**; decide **self** UX (link vs icon vs defer)
- [ ] Optional: pinch/zoom on touch
- [ ] Document in DESIGN.md §6 / profile note when shipped

---

## Why Phase Two

Phase One delivers **upload**, **denorm**, and **rules**. Expand/zoom is **UX polish** with no schema change; shipping it after Phase One keeps the critical path short and avoids blocking Stats / Feed v2 planning.
