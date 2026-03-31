# Expand profile image (lightbox) — Mini spec

> Status: **Phase Two — shipped** (profile lightbox)  
> Last updated: March 2026  
> Related: [Profile pictures](../phase-one/profilePics-onepager.md), [DESIGN.md](../mvp/DESIGN.md)

---

## Goal

On the **group profile screen only**, let users **open a profile photo at a larger size** (tap avatar or secondary control → fullscreen / modal) so faces and details are visible without editing the image.

**Hard boundary:** avatar tap targets on **every other surface** (group shell, feed cards, approvals, roster, standings, etc.) **must stay unchanged** — **no** expand-on-tap, **no** extra lightbox wiring, **no** new click handlers for “view large.” Those avatars remain navigation or decorative only, exactly as today.

---

## Scope (v1)

- **Where:** **Only** the group **profile** route (e.g. `GroupProfilePage` — the `/group/:groupId/profile/:userId` screen). Nowhere else.
- **Trigger (on that page only):** tap on the **profile hero avatar** where a **real image** is shown (`avatarUrl` present and loaded). If showing **initials fallback**, **no-op** (no lightbox).
- **Presentation:** centered image on a **dimmed scrim** (modal / lightbox). **Close:** backdrop tap, **X** or **Done** control, **`Escape`** on desktop.
- **Accessibility:** focus moves into the lightbox, **`aria-modal`**, return focus on close; visible close control; respect `prefers-reduced-motion` for enter/exit.
- **Content:** use **`members.avatarUrl`** already on the profile screen — no new backend.

**Optional polish (same phase or fast-follow):** pinch-to-zoom / pan on touch devices; very small dependency or minimal CSS-only zoom is acceptable.

---

## Out of scope (v1)

- **Image editing:** crop, rotate, filters — separate from “view large.”
- **Replacing** the Phase One **change photo** flow (green camera control stays on profile).
- **Profile photo expand on any page other than profile** — not feed, group layout header, approvals, roster, standings, etc. (Component reuse is fine; **invocation** is profile-only.)
- **Different UX for task-completion photos** — those already use **`FeedPhotoLightbox`** in the feed for **post photos**, not for avatars. Profile uses the **same underlying component** for implementation efficiency (see **Implementation** below); behavior remains **profile-only** as above.

---

## Backburner (explicitly not Phase One)

- **“Refresh feed” / dynamic avatars:** Old **`feed`** posts keep a **snapshot** `avatarUrl`; after a profile re-upload, Firebase download URLs change and **old URLs may 404**, so the UI correctly falls back to initials. **Fixing that** means a separate decision: live reads from **`members`**, backfill jobs, etc. — **not required for Phase One** and **not part of this lightbox spec.** Track when you tackle Feed v2 or denorm strategy.

---

## Implementation — reuse **`FeedPhotoLightbox`** (profile page only)

The app already ships **`FeedPhotoLightbox`** (`src/components/FeedPhotoLightbox.jsx`) for **feed post photos**. Reuse it **only inside the profile page** for the large avatar — **do not** import or mount it for avatars on other routes.

It provides: scrim, close (X + **Done** on narrow viewports), **Escape**, backdrop dismiss, swipe-down-to-close, body scroll lock, `role="dialog"` + **`aria-modal`**. For a profile photo, pass a **one-element** `photos` array; carousel chrome (prev/next, counter) only appears when `photos.length > 1`.

**Example:**

```javascript
<FeedPhotoLightbox
  isOpen={lightboxOpen}
  photos={[{ url: avatarUrl }]}
  onClose={() => setLightboxOpen(false)}
  getImgProps={() => ({ alt: 'Profile photo of …' })}
  overlayAriaLabel="Profile photo. Tap outside, Done, or press Escape to close."
/>
```

**Do not reuse `FeedPhotoExpandButton`** for avatars — it is styled for a **bottom-right control on rectangular feed media**, not for circular profile pictures. Use **tap on the avatar** or a **separate “View” / icon affordance** (especially on self-profile).

**`alt` / meaningful labels:** `FeedPhotoLightbox` accepts optional **`getImgProps(index)`** and passes it through to **`FeedPhotoCommitTransition`**. Profile uses it for a descriptive **`alt`** (display name). Feed call sites omit it and keep empty `alt` as before.

**`prefers-reduced-motion`:** Already handled inside **`FeedPhotoCommitTransition`** via **`usePrefersReducedMotion`**.

**Accessibility (shared with feed):** **Focus trap** + **restore focus** are implemented via **`useFocusTrap`** (`src/hooks/useFocusTrap.js`) on the dialog root `ref` in **`FeedPhotoLightbox`** — Tab / Shift+Tab stay inside the lightbox; on close, focus returns to the element that opened it when still connected. See [reference notes](#reference-focus-trap-and-restore-focus) below.

---

### Profile page wiring

All of the following applies **only** on **`GroupProfilePage`** (or equivalent profile screen):

1. When **`avatarUrl`** is present and the image is not in an error state, open the lightbox from tap on the **hero avatar** (and/or secondary control per product choice).
2. For **viewing others**, tapping the avatar is straightforward.
3. For **self**, avoid competing with the **change photo** file input: prefer **lightbox only for others** in v1, or a **secondary “View”** link/control so the primary action stays “change photo.”

**Open product choice (pick at implementation):** self-profile with **both** “change photo” and “view large” — recommend **secondary affordance** (link or icon).

**Do not** add expand behavior to avatars on other pages — even though the component is shared with the feed, **profile is the sole trigger surface** for “view large” on **`avatarUrl`**.

---

## Checklist

**Done (current implementation)**

- [x] Wire **`FeedPhotoLightbox`** **only** on **`GroupProfilePage`** (`photos={[{ url: avatarUrl }]}`). No import on shell, feed, approvals, roster, or standings.
- [x] **Self UX:** secondary control — **“View photo”** text button under **You** (avatar stays **change photo** via the existing file `label`; **`Avatar`** gained optional **`onImageClick`** only for **other** members’ hero avatars).
- [x] **`getImgProps`** + **`overlayAriaLabel`** on **`FeedPhotoLightbox`** for profile **`alt`** and dialog label; **`Avatar`**: **`onPhotoLoadError`** so expand is hidden when the hero image 404s; load error resets when **`avatarUrl`** changes.
- [x] **Focus trap** + **restore focus** — **`useFocusTrap`** + dialog **`ref`** on **`FeedPhotoLightbox`** (feed + profile).

**Follow-ups (optional / spec gap)**

- [ ] **Pinch / zoom** on touch — polish only.
- [x] **DESIGN.md** §7.8 — one-line note that the profile screen supports **view larger** for the profile photo (profile route only).

---

## Reference: Focus trap and restore focus

**Shipped:** `src/hooks/useFocusTrap.js` + `ref` on the **`FeedPhotoLightbox`** dialog root. Call sites unchanged.

**Where to change behavior:** Adjust the hook or the dialog `ref` attachment only — not each feed/profile caller.

### Why it matters

**`role="dialog"`** and **`aria-modal`** do not make the browser trap keyboard focus by themselves. A keyboard or screen-reader user can still **Tab** into the page behind the scrim (nav, links, shell). That breaks the mental model of a modal, makes **WAI-ARIA Authoring Practices** [modal dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) behavior incomplete, and can leave focus “lost” when the overlay closes (e.g. focus remains on a hidden control, or jumps unpredictably).

**Focus trap** = while the lightbox is open, **Tab** / **Shift+Tab** only move focus among **focusable elements inside the dialog** (close buttons, prev/next when there are multiple photos). Focus should not escape to the rest of the document until the dialog closes.

**Restore focus** = when the dialog closes (X, **Done**, backdrop, swipe-down, **Escape**), move focus back to the **element that had focus immediately before open** (typically the expand button, profile **View photo**, or avatar button). That way the user continues from where they started, which is what the §Scope line “return focus on close” refers to.

### Expected behavior (acceptance-style)

1. **On open:** Save the current **`document.activeElement`** if it is an **`HTMLElement`** that can receive focus (or is the logical trigger). Move focus into the dialog — common choices: the **primary Close** control, or the dialog root with **`tabIndex={-1}`** and **`ref.focus()`** once (then Tab moves to the first real control). Pick one pattern and keep it consistent.
2. **While open:** **Tab** at the last focusable element wraps to the first inside the dialog; **Shift+Tab** from the first wraps to the last. The enormous image itself usually stays **non-focusable** unless you add a reason to focus it (default: don’t; buttons carry the focus ring).
3. **On close:** Call **`previousActiveElement?.focus?.()`** in a **`requestAnimationFrame`** or **`setTimeout(0)`** so React has finished unmounting/updating. If that node is gone (e.g. list re-rendered), **no-op** or fall back to **`document.body.focus()`** only if your app supports it; often skipping is enough.
4. **Multi-photo:** Include prev/next in the tab order only when **`photos.length > 1`** so the trap matches visible controls.

### Implementation (current)

- **`useLayoutEffect`** while active: save **`document.activeElement`**, **`requestAnimationFrame`** then focus the first tabbable control in the container (DOM order → typically **Close**, or prev/next when multi-photo).
- **`document` capture-phase `keydown`** for **Tab**: wrap from first ↔ last inside the container; if focus is outside the container, pull to first.
- **Cleanup:** remove listener, **`requestAnimationFrame`** + **`.focus()`** on the saved element if **`isConnected`**.

### Possible upgrades later

| Idea | Notes |
| --- | --- |
| Dependency **`focus-trap`** | Heavier battle-testing; not needed yet. |
| **`inert`** on app root | Blocks background without listening to Tab; more invasive. |

### Edge cases (known)

- **Opener unmounted** before restore: **`isConnected`** check skips **`.focus()`**.
- **React Strict Mode** (dev): double mount can cause an extra restore/focus cycle — acceptable.

---

## Why Phase Two

Phase One delivers **upload**, **denorm**, and **rules**. Expand/zoom is **UX polish** with no schema change; shipping it after Phase One keeps the critical path short and avoids blocking Stats / Feed v2 planning.
